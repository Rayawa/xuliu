import { zlib } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { MAX_XLSX_ENTRY_BYTES, MAX_XLSX_DECODED_BYTES, MAX_XLSX_ZIP_ENTRIES } from '../../config/constants';

interface ZipEntry { name: string; method: number; crc: number; compressedSize: number; size: number; offset: number; }

/** Reads only requested package entries. No archive path is ever extracted to disk. */
export class ZipArchive {
  private bytes: ArrayBuffer;
  private entries: Map<string, ZipEntry> = new Map();
  private decodedBytes: number = 0;
  private cancelled: () => boolean;

  constructor(bytes: ArrayBuffer, cancelled: () => boolean = () => false) {
    this.bytes = bytes; this.cancelled = cancelled; this.readDirectory();
  }

  private check(): void { if (this.cancelled()) throw new Error('工作簿读取已取消'); }
  has(name: string): boolean { return this.entries.has(name); }

  private readDirectory(): void {
    const view = new DataView(this.bytes); let end = -1;
    for (let at = this.bytes.byteLength - 22; at >= Math.max(0, this.bytes.byteLength - 65557); at--) {
      if (view.getUint32(at, true) === 0x06054B50 && at + 22 + view.getUint16(at + 20, true) === this.bytes.byteLength) { end = at; break; }
    }
    if (end < 0) throw new Error('不是完整的XLSX压缩包');
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('不支持分卷工作簿');
    const count = view.getUint16(end + 10, true); const offset = view.getUint32(end + 16, true); const directorySize = view.getUint32(end + 12, true);
    if (count === 65535 || offset === 0xFFFFFFFF || count > MAX_XLSX_ZIP_ENTRIES || offset + directorySize > end) throw new Error('工作簿目录过大或格式不受支持');
    let cursor = offset;
    for (let index = 0; index < count; index++) {
      this.check();
      if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014B50) throw new Error('工作簿目录损坏');
      const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const commentLength = view.getUint16(cursor + 32, true);
      if (cursor + 46 + nameLength + extraLength + commentLength > end) throw new Error('工作簿目录长度无效');
      const name = util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(new Uint8Array(this.bytes, cursor + 46, nameLength));
      if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || this.entries.has(name)) throw new Error('工作簿包含无效或重复条目');
      if (view.getUint16(cursor + 8, true) & 1) throw new Error('请先解除工作簿加密再导入');
      const entry: ZipEntry = { name, method: view.getUint16(cursor + 10, true), crc: view.getUint32(cursor + 16, true),
        compressedSize: view.getUint32(cursor + 20, true), size: view.getUint32(cursor + 24, true), offset: view.getUint32(cursor + 42, true) };
      this.entries.set(name, entry); cursor += 46 + nameLength + extraLength + commentLength;
    }
    if (cursor > offset + directorySize) throw new Error('工作簿目录范围无效');
  }

  async read(name: string): Promise<ArrayBuffer> {
    this.check(); const entry = this.entries.get(name); if (!entry) throw new Error(`工作簿缺少${name}`);
    if (entry.size > MAX_XLSX_ENTRY_BYTES || this.decodedBytes + entry.size > MAX_XLSX_DECODED_BYTES) throw new Error('工作簿内容过大，请按月份或学期拆分');
    const view = new DataView(this.bytes); const offset = entry.offset;
    if (offset + 30 > this.bytes.byteLength || view.getUint32(offset, true) !== 0x04034B50) throw new Error('工作簿条目损坏');
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    if (start + entry.compressedSize > this.bytes.byteLength) throw new Error('工作簿条目长度无效');
    const compressed = this.bytes.slice(start, start + entry.compressedSize);
    let output: ArrayBuffer;
    if (entry.method === 0) {
      if (compressed.byteLength !== entry.size) throw new Error('工作簿存储条目长度无效'); output = compressed;
    } else if (entry.method === 8) {
      const zip = await zlib.createZip(); const stream: zlib.ZStream = {};
      let initialized = false;
      try {
        const init = await zip.inflateInit2(stream, -15);
        if (init !== zlib.ReturnStatus.OK) throw new Error('无法初始化工作簿解压'); initialized = true;
        output = new ArrayBuffer(Math.max(1, entry.size));
        stream.nextIn = compressed; stream.availableIn = compressed.byteLength; stream.nextOut = output; stream.availableOut = output.byteLength;
        const status = await zip.inflate(stream, zlib.CompressFlushMode.FINISH);
        if (status !== zlib.ReturnStatus.STREAM_END || stream.totalOut !== entry.size) throw new Error('工作簿条目解压不完整');
        if (entry.size === 0) output = new ArrayBuffer(0);
      } finally { if (initialized) await zip.inflateEnd(stream); }
    } else throw new Error('工作簿使用了不支持的压缩方式');
    this.check();
    const checksum = await zlib.createChecksum();
    if ((await checksum.crc32(0, output) >>> 0) !== entry.crc) throw new Error('工作簿校验未通过，请重新导出原文件');
    this.decodedBytes += entry.size; return output;
  }
}
