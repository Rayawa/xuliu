import { YiyanImageLoader, clearYiyanImageCache } from './YiyanImages';
import { http } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { CloudApi, CloudApiError } from '../api/CloudApi';
import { currentCloudAccount, sessionEpoch, onSessionInvalidated } from '../../state/cloudSession';
import { setSetting } from '../storage/storage';
import { YIYAN_MAX_RESPONSE_BYTES, KEY_YIYAN_CARD, YIYAN_REFRESH_DELAY_MS, YIYAN_PREFETCH_DELAY_MS } from '../../config/constants';
import { YiyanView, YiyanCard, YiyanBook, YiyanResponse, YiyanAction, YiyanOperation, emptyYiyanView } from '../../models/YiyanModels';
import { parseYiyanCard, parseYiyanBook, libraryCards, yiyanCursor, yiyanId } from '../../domain/yiyan/YiyanData';

export class YiyanService {
  private view: YiyanView = emptyYiyanView();
  private api: CloudApi = new CloudApi();
  private prefetchApi: CloudApi = new CloudApi();
  private listeners: Set<(view: YiyanView) => void> = new Set();
  private serial: number = 0;
  private connection: number = 0;
  private timer: number = -1;
  private delayTimer: number = -1;
  private finishDelay: (() => void) | undefined;
  private prefetchVersion: number = 0;
  private next: Promise<YiyanCard | undefined> | undefined;
  private nextFor: string = '';
  private lastQuoteAt: number = 0;
  private requests: Map<string, string> = new Map();
  private cached: boolean = false;
  private pageCursors: string[] = [''];
  private prefetchImage: YiyanImageLoader = new YiyanImageLoader();

  constructor() { onSessionInvalidated(() => this.accountChanged()); }

  snapshot(): YiyanView { return JSON.parse(JSON.stringify(this.view)) as YiyanView; }
  subscribe(listener: (view: YiyanView) => void): () => void {
    this.readCache(); this.listeners.add(listener); listener(this.snapshot());
    return (): void => { this.listeners.delete(listener); if (!this.listeners.size) this.pause(); };
  }
  private readCache(): void {
    if (this.cached) return; this.cached = true;
    try { this.view.card = parseYiyanCard(JSON.parse(AppStorage.get<string>(KEY_YIYAN_CARD) ?? 'null') as YiyanCard); } catch (_) {}
  }
  private publish(): void {
    this.listeners.forEach((listener) => listener(this.snapshot())); this.schedulePrefetch();
  }
  private accountChanged(): void {
    this.pause(); this.pageCursors = ['']; clearYiyanImageCache(); const card = this.view.card; this.view = emptyYiyanView(); this.view.card = card; this.requests.clear(); this.publish();
  }
  private cancelPrefetch(): void {
    this.prefetchVersion++;
    if (this.timer >= 0) clearTimeout(this.timer); this.timer = -1;
    if (this.delayTimer >= 0) clearTimeout(this.delayTimer); this.delayTimer = -1; this.finishDelay?.(); this.finishDelay = undefined;
    this.prefetchImage.cancel(); this.prefetchApi.cancel(); this.next = undefined; this.nextFor = '';
  }
  private pause(): void {
    this.serial++; this.connection++; this.api.cancel(); this.cancelPrefetch();
    if (this.view.pending && this.view.busy) this.view.notice = '操作结果尚未确认；重新打开后请检查结果，避免重复提交';
    this.view.busy = ''; this.view.checking = false;
  }
  private async request(path: string = '', body?: YiyanAction, api: CloudApi = this.api): Promise<YiyanResponse> {
    const result = JSON.parse(await api.request(`/api/yiyan${path}`, body ? http.RequestMethod.POST : http.RequestMethod.GET,
      body ? JSON.stringify(body) : undefined, true, YIYAN_MAX_RESPONSE_BYTES)) as YiyanResponse;
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('一言服务返回格式无效');
    return result;
  }
  private showError(error: Error): void {
    const failure = error as CloudApiError;
    if (failure.needsLogin) { this.view.connected = false; this.view.loginOpen = true; }
    if (failure.needsReconnect) { this.view.needsReconnect = true; this.view.loginOpen = true; }
    this.view.notice = error.message || '暂时无法连接一言，请稍后重试';
  }
  private async run(action: string, callback: () => Promise<void>, keepPrefetch: boolean = false): Promise<void> {
    if (this.view.busy || !this.listeners.size) return;
    if (!currentCloudAccount()) { this.view.notice = '请先登录序流账号，再连接一言'; this.publish(); return; }
    if (!keepPrefetch) this.cancelPrefetch();
    const serial = ++this.serial; this.view.busy = action; this.view.notice = ''; this.publish();
    try { await callback(); }
    catch (error) { if (serial === this.serial) this.showError(error as Error); }
    finally { if (serial === this.serial) { this.view.busy = ''; this.view.checking = false; this.publish(); } }
  }

  async start(): Promise<void> {
    this.readCache();
    if (this.view.busy) return;
    if (!currentCloudAccount()) { this.publish(); return; }
    this.view.checking = true;
    await this.run('status', async () => {
      const status = await this.request('?status=1'); this.view.connected = status.connected === true; this.view.codeSent = status.pending === true;
      this.view.retryAt = Date.now() + Math.max(0, Math.min(60, status.retryAfter ?? 0)) * 1000;
      if (status.pending) this.view.loginOpen = true;
      if (this.view.connected && !this.view.card) await this.keepCard(await this.fetchCard('', this.api));
    });
  }

  private async keepCard(card: YiyanCard | undefined): Promise<void> {
    if (!card) throw new Error('一言暂未返回有效图文');
    this.view.card = card; this.view.refreshAt = Date.now() + YIYAN_REFRESH_DELAY_MS;
    try { await setSetting(KEY_YIYAN_CARD, JSON.stringify(card)); } catch (_) { this.view.notice = '图文已更新，本机缓存保存未完成'; }
  }
  private async fetchCard(exclude: string, api: CloudApi): Promise<YiyanCard | undefined> {
    const delay = Math.max(0, this.lastQuoteAt + YIYAN_REFRESH_DELAY_MS - Date.now());
    const connection = this.connection; const epoch = sessionEpoch(); const prefetchVersion = this.prefetchVersion;
    if (delay > 0) await new Promise<void>((resolve) => { this.finishDelay = resolve; this.delayTimer = setTimeout(() => { this.delayTimer = -1; this.finishDelay = undefined; resolve(); }, delay); });
    if (connection !== this.connection || epoch !== sessionEpoch() || !this.listeners.size || (api === this.prefetchApi && prefetchVersion !== this.prefetchVersion)) return undefined;
    this.lastQuoteAt = Date.now();
    const response = await this.request(exclude ? `?exclude=${exclude}` : '', undefined, api);
    if (connection !== this.connection || (api === this.prefetchApi && prefetchVersion !== this.prefetchVersion)) return undefined;
    return parseYiyanCard(response.card);
  }
  private schedulePrefetch(): void {
    if (this.timer >= 0) clearTimeout(this.timer); this.timer = -1;
    const id = this.view.card?.id;
    if (!this.listeners.size || !this.view.connected || !id || this.view.busy || this.view.loginOpen || this.view.library || this.nextFor === id) return;
    const connection = this.connection;
    this.timer = setTimeout(() => {
      this.timer = -1; if (connection !== this.connection || !this.listeners.size) return;
      this.nextFor = id;
      this.next = this.fetchCard(id, this.prefetchApi).then((card) => {
        if (connection !== this.connection || card?.id === id) return undefined;
        if (card?.image) this.prefetchImage.bytes(card.image).catch(() => {});
        return card;
      }).catch(() => undefined);
    }, YIYAN_PREFETCH_DELAY_MS);
  }
  async changeCard(): Promise<void> {
    if (!this.view.connected) { this.openLogin(); return; }
    if (Date.now() < this.view.refreshAt) return;
    await this.run('refresh', async () => {
      const serial = this.serial;
      const previous = this.view.card?.id ?? ''; const prepared = this.nextFor === previous ? await this.next : undefined;
      if (serial !== this.serial) return;
      this.next = undefined; this.nextFor = '';
      const card = prepared ?? await this.fetchCard(previous, this.api);
      await this.keepCard(card); if (card?.id === previous) this.view.notice = '暂未换到新句子';
    }, true);
  }
  openLogin(): void { if (this.view.busy) return; this.cancelPrefetch(); this.view.loginOpen = true; this.view.library = ''; this.publish(); }
  closeLogin(): void { if (this.view.busy) return; this.view.loginOpen = false; this.publish(); }

  async sendCode(phone: string): Promise<void> {
    if (!/^1[3-9]\d{9}$/.test(phone)) { this.view.notice = '请输入有效的手机号'; this.publish(); return; }
    if (Date.now() < this.view.retryAt) return;
    await this.run('send-code', async () => {
      const result = await this.request('', { action: 'send-code', phone });
      if (!result.sent) throw new Error('未收到验证码发送确认，请稍后核对短信');
      this.view.codeSent = true; this.view.retryAt = Date.now() + Math.max(60, Math.min(600, result.retryAfter ?? 60)) * 1000;
      this.view.notice = '验证码已发送';
    });
  }
  async signIn(phone: string, code: string): Promise<void> {
    if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{4,8}$/.test(code)) { this.view.notice = '请填写手机号和短信验证码'; this.publish(); return; }
    await this.run('sign-in', async () => {
      const response = await this.request('', { action: 'sign-in', phone, code });
      if (!response.connected) throw new Error('未确认一言连接成功');
      this.connection++; this.view.connected = true; this.view.loginOpen = false; this.view.codeSent = false; this.view.retryAt = 0;
      this.view.books = []; this.view.cards = []; this.view.page = 1; this.pageCursors = ['']; this.view.selected = undefined; this.view.pending = undefined; this.view.saved = []; this.requests.clear();
      if (this.view.needsReconnect) { this.view.needsReconnect = false; this.view.notice = '已重新连接，可以继续收藏或打开文集'; }
      else await this.keepCard(await this.fetchCard(this.view.card?.id ?? '', this.api));
    });
  }
  async disconnect(): Promise<void> {
    await this.run('disconnect', async () => {
      const result = await this.request('', { action: 'disconnect' }); if (result.connected !== false) throw new Error('未确认断开成功');
      this.connection++; clearYiyanImageCache(); this.view.connected = false; this.view.loginOpen = false; this.view.codeSent = false; this.view.retryAt = 0;
      this.view.books = []; this.view.cards = []; this.view.library = ''; this.view.selected = undefined; this.view.pending = undefined; this.view.saved = [];
      this.view.defaultBookId = ''; this.requests.clear(); this.view.notice = '已断开一言；手机端登录状态不受影响，公开图文缓存保留';
    });
  }

  private async loadBooks(): Promise<void> {
    const response = await this.request('?library=books');
    if (!Array.isArray(response.books) || response.books.length > 500) throw new Error('一言文集返回格式无效');
    const books: YiyanBook[] = []; const seen: Set<string> = new Set();
    for (const value of response.books) { const book = parseYiyanBook(value); if (book && !seen.has(book.id)) { books.push(book); seen.add(book.id); } }
    if (response.books.length && !books.length) throw new Error('一言文集返回格式无效');
    this.view.books = books; this.view.defaultBookId = response.defaultBookId && seen.has(response.defaultBookId) ? response.defaultBookId : '';
  }
  async openLibrary(mode: string = 'browse'): Promise<void> {
    if (!this.view.connected) { this.openLogin(); return; }
    this.pageCursors = ['']; this.view.page = 1;
    this.view.library = mode === 'choose' ? 'choose' : 'browse'; this.view.selected = undefined; this.view.cards = []; this.view.cursor = ''; this.publish();
    await this.run('books', () => this.loadBooks());
  }
  closeLibrary(): void { if (this.view.busy) return; this.view.library = ''; this.view.selected = undefined; this.view.cards = []; this.view.cursor = ''; this.view.page = 1; this.pageCursors = ['']; this.publish(); }
  private async readBookPage(book: YiyanBook, cursor: string, pageIndex: number): Promise<void> {
    const response = await this.request(`?library=cards&book=${book.id}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(response.cards)) throw new Error('一言文集图文返回格式无效');
    const cards = libraryCards(response.cards);
    this.view.selected = book; this.view.cards = cards; this.view.page = pageIndex + 1;
    this.pageCursors = this.pageCursors.slice(0, pageIndex).concat([cursor]);
    this.view.cursor = response.nextCursor && !this.pageCursors.includes(response.nextCursor) && yiyanCursor(response.nextCursor) ? response.nextCursor : '';
  }
  async openBook(id: string, more: boolean = false): Promise<void> {
    const book = this.view.books.find((item) => item.id === id);
    if (!book || (more && (!this.view.cursor || this.view.selected?.id !== id))) return;
    const cursor = more ? this.view.cursor : ''; const pageIndex = more ? this.view.page : 0;
    await this.run('cards', () => this.readBookPage(book, cursor, pageIndex));
  }
  async previousBookPage(): Promise<void> {
    const book = this.view.selected; const pageIndex = this.view.page - 2;
    if (!book || pageIndex < 0 || pageIndex >= this.pageCursors.length) return;
    const cursor = this.pageCursors[pageIndex];
    await this.run('cards', () => this.readBookPage(book, cursor, pageIndex));
  }
  private operationId(key: string): string {
    let id = this.requests.get(key); if (!id) { id = util.generateRandomUUID(); this.requests.set(key, id);
      while (this.requests.size > 256) this.requests.delete(this.requests.keys().next().value as string); } return id;
  }
  private async perform(operation: YiyanOperation, checkOnly: boolean): Promise<void> {
    // Set before transmission, including the case where the page closes during a write.
    this.view.pending = operation;
    const body = JSON.parse(JSON.stringify(operation.body)) as YiyanAction; if (checkOnly) body.checkOnly = '1';
    try {
      const response = await this.request('', body); const book = parseYiyanBook(response.book);
      if (!book || (operation.kind === 'create' && (book.name !== body.name || book.private !== (body.visibility === 'private'))) || (operation.kind === 'favorite' && (!response.saved || response.cardId !== body.cardId || book.id !== body.bookId))) throw new Error('未收到可核对的操作结果，请检查结果');
      this.view.pending = undefined; this.view.books = this.view.books.filter((item) => item.id !== book.id).concat([book]);
      if (this.view.selected?.id === book.id) this.view.selected = book;
      if (operation.kind === 'favorite') {
        const key = `${body.cardId}:${book.id}`; if (!this.view.saved.includes(key)) this.view.saved.push(key);
        if (this.view.saved.length > 1000) this.view.saved = this.view.saved.slice(-1000);
        this.view.notice = `已收藏到「${book.name}」`;
      } else {
        this.view.notice = `已确认新建文集「${book.name}」`; this.view.selected = undefined; this.view.cards = []; this.view.cursor = '';
        if (operation.collect && !checkOnly && operation.cardId) await this.favoriteInternal(book.id, operation.cardId);
      }
    } catch (error) {
      const failure = error as CloudApiError;
      if (!checkOnly && failure.status >= 400 && failure.status < 500 && !failure.needsCheck) this.view.pending = undefined;
      throw error as Error;
    }
  }
  private async favoriteInternal(bookId: string, cardId: string): Promise<void> {
    const operation: YiyanOperation = { kind: 'favorite', collect: false,
      body: { action: 'favorite', cardId, bookId, requestId: this.operationId(`favorite:${cardId}:${bookId}`) } };
    await this.perform(operation, false);
  }
  async favorite(bookId: string = ''): Promise<void> {
    if (this.view.pending || !this.view.card || !this.view.connected) return;
    const cardId = this.view.card.id;
    await this.run('favorite', async () => {
      if (!bookId) { await this.loadBooks(); bookId = this.view.defaultBookId; }
      if (!yiyanId(bookId) || !this.view.books.some((book) => book.id === bookId)) throw new Error('未找到目标文集，请选择其他文集');
      if (this.view.saved.includes(`${cardId}:${bookId}`)) { this.view.notice = '已收藏到此文集'; return; }
      await this.favoriteInternal(bookId, cardId);
    });
  }
  async createBook(name: string, visibility: string): Promise<void> {
    name = name.trim(); if (!name || name.length > 60 || /[\x00-\x1f]/.test(name) || !['private', 'public'].includes(visibility) || this.view.pending) return;
    const operation: YiyanOperation = { kind: 'create', collect: this.view.library === 'choose', cardId: this.view.card?.id,
      body: { action: 'create-book', name, visibility, requestId: this.operationId(`create:${name}:${visibility}`) } };
    await this.run('create', () => this.perform(operation, false));
  }
  async checkResult(): Promise<void> { const pending = this.view.pending; if (pending) await this.run('check', () => this.perform(pending, true)); }
}

let service: YiyanService | undefined;
export function yiyanService(): YiyanService { if (!service) service = new YiyanService(); return service; }
