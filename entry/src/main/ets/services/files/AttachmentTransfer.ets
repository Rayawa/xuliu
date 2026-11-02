import { util } from '@kit.ArkTS';
import { common } from '@kit.AbilityKit';
import { picker, fileIo as fs, fileUri } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import { Attachment } from '../../models/Workspace';
import { BLOB_API_ORIGIN, BLOB_API_VERSION, BLOB_PART_BYTES, BLOB_MULTIPART_MIN_BYTES, CLOUD_ORIGIN, FILE_TRANSFER_TIMEOUT_MS,
  MAX_ATTACHMENT_BYTES } from '../../config/constants';
import { currentCloudAccount, onSessionInvalidated, sessionCookie, sessionEpoch, clearCloudSession } from '../../state/cloudSession';
import { uid } from '../../domain/workspace/WorkspaceDomain';
import { CloudApi } from '../api/CloudApi';

export interface ChosenAttachment {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}
interface ClientPayload { blockId: string; }
interface TokenPayload { pathname: string; clientPayload: string; multipart: boolean; }
interface TokenRequest { type: string; payload: TokenPayload; }
interface TokenResult { clientToken: string; }
interface MultipartSession { key: string; uploadId: string; }
interface UploadedPart { partNumber: number; etag: string; }
interface BlobResult { url: string; contentType: string; pathname: string; }

const MIME_TYPES: Record<string, string> = {
  'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp', 'gif': 'image/gif',
  'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown', 'csv': 'text/csv', 'html': 'text/html', 'htm': 'text/html',
  'zip': 'application/zip', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

function safeName(name: string): string {
  return name.replace(/[\\/?%*:|"<>\r\n]/g, '-').slice(0, 220) || 'attachment';
}

export function privateBlobUrl(value: string): boolean {
  return /^https:\/\/[a-zA-Z0-9.-]+\.blob\.vercel-storage\.com\//.test(value);
}

export async function chooseAttachment(context: common.UIAbilityContext): Promise<ChosenAttachment | undefined> {
  const view = new picker.DocumentViewPicker(context);
  const options = new picker.DocumentSelectOptions(); options.maxSelectNumber = 1;
  const selected = await view.select(options);
  if (!selected.length) return undefined;
  const file = await fs.open(selected[0], fs.OpenMode.READ_ONLY);
  try {
    const size = fs.statSync(file.fd).size;
    if (size > MAX_ATTACHMENT_BYTES) throw new Error('单个文件不能超过50 MB');
    const name = new fileUri.FileUri(selected[0]).name || 'attachment';
    const extension = name.split('.').pop()?.toLowerCase() ?? '';
    return { uri: selected[0], name, size, mimeType: MIME_TYPES[extension] ?? 'application/octet-stream' };
  } finally { await fs.close(file); }
}

async function readPart(file: fs.File, size: number): Promise<ArrayBuffer> {
  const result = new Uint8Array(size);
  let read = 0;
  while (read < size) {
    const buffer = new ArrayBuffer(size - read);
    const count = await fs.read(file.fd, buffer);
    if (count <= 0) throw new Error('文件读取不完整，请重新选择');
    result.set(new Uint8Array(buffer, 0, count), read); read += count;
  }
  return result.buffer;
}

/** Native implementation of @vercel/blob 2.8.0 client-token protocol (API12). */
export class AttachmentTransfer {
  private requests: Set<http.HttpRequest> = new Set();
  private api: CloudApi = new CloudApi();
  private cancelled: boolean = false;
  private generation: number = 0;
  private stopSessionListener: () => void;
  private downloadEnd: (() => void) | undefined;

  constructor() { this.stopSessionListener = onSessionInvalidated(() => this.cancel()); }

  private check(epoch: number, generation: number): void {
    if (this.cancelled || epoch !== sessionEpoch() || generation !== this.generation) throw new Error('文件操作已取消或账号已变化');
  }

  private async blobRequest(path: string, token: string, headers: Record<string, string>, body: ArrayBuffer | string = '',
    progress?: (sent: number, total: number) => void): Promise<string> {
    const request = http.createHttp(); this.requests.add(request);
    const generation = this.generation;
    const baseHeaders: Record<string, string> = {
      'authorization': `Bearer ${token}`, 'x-api-version': BLOB_API_VERSION, 'x-vercel-blob-access': 'private',
      'x-vercel-blob-store-id': token.split('_')[3] ?? '', 'x-api-blob-request-id': uid(), 'x-api-blob-request-attempt': '0'
    };
    Object.keys(headers).forEach((key) => { baseHeaders[key] = headers[key]; });
    if (progress) baseHeaders['x-content-length'] = String(typeof body === 'string' ? new util.TextEncoder().encodeInto(body).byteLength : body.byteLength);
    if (progress) request.on('dataSendProgress', (info: http.DataSendProgressInfo) => progress(info.sendSize, info.totalSize));
    try {
      if (this.cancelled) throw new Error('文件操作已取消');
      const response = await request.request(`${BLOB_API_ORIGIN}${path}`, {
        method: path.startsWith('/mpu?') ? http.RequestMethod.POST : http.RequestMethod.PUT,
        header: baseHeaders, extraData: body, expectDataType: http.HttpDataType.STRING,
        connectTimeout: FILE_TRANSFER_TIMEOUT_MS, readTimeout: FILE_TRANSFER_TIMEOUT_MS,
        maxLimit: 1024 * 1024, maxRedirects: 0, usingCache: false
      });
      if (this.cancelled || generation !== this.generation) throw new Error('文件操作已取消');
      if (response.responseCode < 200 || response.responseCode >= 300) throw new Error(`私有文件上传失败（${response.responseCode}），已选文件仍保留`);
      return response.result as string;
    } finally { this.requests.delete(request); this.destroyRequest(request); }
  }

  async upload(chosen: ChosenAttachment, scopeId: string, progress: (value: number) => void): Promise<Attachment> {
    const account = currentCloudAccount();
    if (!account) throw new Error('请先在“我的 → 账号与云端”登录');
    this.cancelled = false;
    const generation = ++this.generation;
    const epoch = sessionEpoch(); const id = uid();
    const pathname = `attachments/${account.id}/${safeName(scopeId).slice(0, 80)}/${id}/${safeName(chosen.name)}`;
    const clientPayload: ClientPayload = { blockId: scopeId.slice(0, 100) };
    const payload: TokenPayload = { pathname, clientPayload: JSON.stringify(clientPayload), multipart: chosen.size > BLOB_MULTIPART_MIN_BYTES };
    const input: TokenRequest = { type: 'blob.generate-client-token', payload };
    progress(1);
    const signed = JSON.parse(await this.api.request('/api/files', http.RequestMethod.POST, JSON.stringify(input))) as TokenResult;
    this.check(epoch, generation);
    if (!signed.clientToken) throw new Error('上传授权未返回有效令牌');
    const file = await fs.open(chosen.uri, fs.OpenMode.READ_ONLY);
    try {
      if (fs.statSync(file.fd).size !== chosen.size) throw new Error('所选文件已变化，请重新选择');
      const query = `?pathname=${encodeURIComponent(pathname)}`;
      const headers: Record<string, string> = { 'x-content-type': chosen.mimeType };
      let result: BlobResult;
      if (chosen.size <= BLOB_MULTIPART_MIN_BYTES) {
        const body = await readPart(file, chosen.size); this.check(epoch, generation);
        result = JSON.parse(await this.blobRequest(`/${query}`, signed.clientToken, headers, body,
          (sent, total) => progress(Math.min(99, Math.max(1, Math.round(sent / Math.max(1, total) * 100)))))) as BlobResult;
      } else {
        const createHeaders: Record<string, string> = { 'x-content-type': chosen.mimeType, 'x-mpu-action': 'create' };
        const multipart = JSON.parse(await this.blobRequest(`/mpu${query}`, signed.clientToken, createHeaders)) as MultipartSession;
        if (!multipart.key || !multipart.uploadId) throw new Error('分片上传初始化失败');
        const parts: UploadedPart[] = [];
        let position = 0;
        while (position < chosen.size) {
          this.check(epoch, generation);
          const size = Math.min(BLOB_PART_BYTES, chosen.size - position);
          const body = await readPart(file, size); this.check(epoch, generation);
          const offset = position;
          const partHeaders: Record<string, string> = {
            'x-content-type': chosen.mimeType, 'x-mpu-action': 'upload', 'x-mpu-key': encodeURIComponent(multipart.key),
            'x-mpu-upload-id': multipart.uploadId, 'x-mpu-part-number': String(parts.length + 1)
          };
          const part = JSON.parse(await this.blobRequest(`/mpu${query}`, signed.clientToken, partHeaders, body,
            (sent) => progress(Math.min(99, Math.max(1, Math.round((offset + sent) / chosen.size * 100)))))) as UploadedPart;
          if (!part.etag) throw new Error('上传分片没有返回确认信息');
          parts.push({ partNumber: parts.length + 1, etag: part.etag }); position += size;
        }
        this.check(epoch, generation);
        const completeHeaders: Record<string, string> = { 'content-type': 'application/json', 'x-content-type': chosen.mimeType,
          'x-mpu-action': 'complete', 'x-mpu-key': encodeURIComponent(multipart.key), 'x-mpu-upload-id': multipart.uploadId };
        result = JSON.parse(await this.blobRequest(`/mpu${query}`, signed.clientToken, completeHeaders, JSON.stringify(parts))) as BlobResult;
      }
      this.check(epoch, generation);
      if (!privateBlobUrl(result.url)) throw new Error('上传响应未返回有效的私有附件地址');
      progress(100);
      return { id, url: result.url, fileName: chosen.name.slice(0, 300), fileSize: chosen.size,
        mimeType: result.contentType || chosen.mimeType, uploadedAt: new Date().toISOString() };
    } finally { await fs.close(file); }
  }

  async download(context: common.UIAbilityContext, attachment: Attachment, progress: (value: number) => void): Promise<string> {
    if (!currentCloudAccount()) throw new Error('请先登录账号，再读取私有附件');
    if (!privateBlobUrl(attachment.url)) throw new Error('只支持序流私有资料地址');
    this.cancelled = false;
    const generation = ++this.generation;
    const epoch = sessionEpoch();
    const path = `${context.cacheDir}/xuliu-${uid()}-${safeName(attachment.fileName)}`;
    const file = await fs.open(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    const request = http.createHttp(); this.requests.add(request);
    let total = 0; let failure: Error | undefined; let finished: () => void = () => {};
    const end = new Promise<void>((resolve) => { finished = resolve; }); this.downloadEnd = finished;
    request.on('dataReceive', (chunk: ArrayBuffer) => {
      if (failure) return;
      try {
        this.check(epoch, generation); total += chunk.byteLength;
        if (total > MAX_ATTACHMENT_BYTES) throw new Error('附件超过50 MB限制');
        let written = 0;
        while (written < chunk.byteLength) {
          const count = fs.writeSync(file.fd, chunk.slice(written));
          if (count <= 0) throw new Error('附件写入失败'); written += count;
        }
        progress(Math.min(99, Math.round(total / Math.max(1, attachment.fileSize) * 100)));
      } catch (error) { failure = error as Error; this.destroyRequest(request); finished(); }
    });
    request.on('dataEnd', () => finished());
    try {
      const code = await request.requestInStream(`${CLOUD_ORIGIN}/api/files?url=${encodeURIComponent(attachment.url)}&name=${encodeURIComponent(attachment.fileName)}`, {
        method: http.RequestMethod.GET, header: { 'Cookie': sessionCookie(), 'Origin': CLOUD_ORIGIN },
        connectTimeout: FILE_TRANSFER_TIMEOUT_MS, readTimeout: FILE_TRANSFER_TIMEOUT_MS, maxRedirects: 0, usingCache: false
      });
      if (code === 401) clearCloudSession();
      if (code !== 200) throw new Error(`私有附件读取失败（${code}）`);
      await end; this.check(epoch, generation);
      if (failure) throw failure;
      if (attachment.fileSize > 0 && total !== attachment.fileSize) throw new Error('附件读取不完整，请重新读取');
      await fs.close(file); progress(100); return path;
    } catch (error) {
      try { await fs.close(file); } catch (_) {}
      if (fs.accessSync(path)) fs.unlinkSync(path);
      throw error as Error;
    } finally { this.downloadEnd = undefined; this.requests.delete(request); this.destroyRequest(request); }
  }

  private destroyRequest(request: http.HttpRequest): void {
    try { request.destroy(); } catch (_) {}
  }

  cancel(): void {
    this.cancelled = true; this.generation++; this.api.cancel(); this.requests.forEach((request) => this.destroyRequest(request));
    this.requests.clear(); this.downloadEnd?.();
  }
  dispose(): void { this.cancel(); this.stopSessionListener(); }
}
