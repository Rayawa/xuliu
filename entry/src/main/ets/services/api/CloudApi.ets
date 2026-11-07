import { sessionCookie, sessionEpoch, acceptSessionCookies, setCloudAccount, clearCloudSession } from '../../state/cloudSession';
import { http } from '@kit.NetworkKit';
import { CLOUD_ORIGIN, HTTP_TIMEOUT_MS, MAX_FILE_BYTES } from '../../config/constants';
import { CloudAccount, CloudRecord, Workspace } from '../../models/Workspace';
import { decodeWorkspace } from '../storage/storage';

interface LoginBody { username: string; password: string; }
interface LoginResponse { account: CloudAccount; }
interface SessionResponse { authenticated: boolean; account: CloudAccount; visibleAccounts: CloudAccount[]; }
interface SaveBody { data: Workspace; baseRevision: number; }
interface ApiError { error?: string; needsLogin?: boolean; needsReconnect?: boolean; needsCheck?: boolean; }
export interface SaveResponse { ok: boolean; revision: number; updatedAt: string; }

export class CloudApiError extends Error {
  status: number;
  needsLogin: boolean = false;
  needsReconnect: boolean = false;
  needsCheck: boolean = false;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export class CloudApi {
  private requests: Set<http.HttpRequest> = new Set();
  private generation: number = 0;

  async request(path: string, method: http.RequestMethod = http.RequestMethod.GET, body?: string, keepSessionOn401: boolean = false, maxResponseBytes: number = MAX_FILE_BYTES): Promise<string> {
    if (!path.startsWith('/api/')) throw new Error('无效的云端接口');
    const request = http.createHttp();
    const generation = this.generation;
    const epoch = sessionEpoch();
    this.requests.add(request);
    try {
      const response = await request.request(`${CLOUD_ORIGIN}${path}`, {
        method, header: { 'Content-Type': 'application/json', 'Cookie': sessionCookie(path), 'Origin': CLOUD_ORIGIN },
        extraData: body ?? '', connectTimeout: HTTP_TIMEOUT_MS, readTimeout: HTTP_TIMEOUT_MS,
        expectDataType: http.HttpDataType.STRING, usingCache: false, maxLimit: maxResponseBytes, maxRedirects: 0
      });
      if (generation !== this.generation || epoch !== sessionEpoch()) throw new Error('请求已取消');
      const headers = response.header as Record<string, string | string[]>;
      const rawCookies = headers['set-cookie'] ?? headers['Set-Cookie'] ?? response.cookies;
      if (rawCookies) {
        const values = typeof rawCookies === 'string' ? [rawCookies] : rawCookies;
        acceptSessionCookies(values, path);
      }
      const text = response.result as string;
      if (response.responseCode === 401 && !keepSessionOn401) clearCloudSession();
      if (response.responseCode < 200 || response.responseCode >= 300) {
        let details: ApiError = {};
        try {
          const parsed = JSON.parse(text) as ApiError;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) details = parsed;
        } catch (_) {}
        const message = typeof details.error === 'string' && details.error ? details.error.slice(0, 2000) : (response.responseCode === 409 ? '云端版本已变化。请重新读取并核对差异，避免覆盖更新' : `云端请求失败（${response.responseCode}）`);
        const error = new CloudApiError(Number(response.responseCode), message);
        error.needsLogin = details.needsLogin === true; error.needsReconnect = details.needsReconnect === true; error.needsCheck = details.needsCheck === true;
        throw error;
      }
      return text;
    } finally { this.requests.delete(request); this.destroyRequest(request); }
  }

  async login(username: string, password: string): Promise<CloudAccount> {
    const body: LoginBody = { username: username.trim(), password };
    const response = JSON.parse(await this.request('/api/auth/login', http.RequestMethod.POST, JSON.stringify(body))) as LoginResponse;
    setCloudAccount(response.account);
    return response.account;
  }

  async session(): Promise<SessionResponse> {
    const session = JSON.parse(await this.request('/api/auth/session')) as SessionResponse;
    setCloudAccount(session.account, session.visibleAccounts);
    return session;
  }

  async read(owner: string): Promise<CloudRecord> {
    const record = JSON.parse(await this.request(`/api/state?owner=${encodeURIComponent(owner)}`)) as CloudRecord;
    if (record.data) record.data = decodeWorkspace(JSON.stringify(record.data));
    return record;
  }

  async save(data: Workspace, baseRevision: number): Promise<SaveResponse> {
    const body: SaveBody = { data, baseRevision };
    return JSON.parse(await this.request('/api/state', http.RequestMethod.PUT, JSON.stringify(body))) as SaveResponse;
  }

  async logout(): Promise<void> {
    try { await this.request('/api/auth/logout', http.RequestMethod.POST); }
    finally { clearCloudSession(); }
  }

  private destroyRequest(request: http.HttpRequest): void {
    try { request.destroy(); } catch (_) {}
  }

  cancel(): void {
    this.generation++;
    this.requests.forEach((request) => this.destroyRequest(request));
    this.requests.clear();
  }

  dispose(): void { this.cancel(); }
}
