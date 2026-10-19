import { createHash, randomInt } from "node:crypto";
import { parseYiyanResponse, type YiyanCard } from "./yiyan-card.ts";
import { isYiyanCursor, isYiyanId, parseYiyanBook, parseYiyanBooks, parseYiyanIdentity, parseYiyanLibraryPage, yiyanDefaultBook, type YiyanIdentity } from "./yiyan-library.ts";

export type YiyanCookies = [string, string][];
const baseUrl = "https://app.yiyan.art/yiyan/";
const allowedPaths = new Set(["sendsmsverifycode", "checksmsverifycode", "yiyanphonelogin", "gettodaycard", "getuserinfoandbooklist", "gettextcardsinbook", "collectcard", "newbook_np"]);
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
export const isYiyanPhone = (value: unknown): value is string => typeof value === "string" && /^1[3-9]\d{9}$/.test(value);

export class YiyanError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status = 502, retryable = false) { super(message); this.name = "YiyanError"; this.status = status; this.retryable = retryable; }
}
export class YiyanReconnectRequired extends YiyanError {
  constructor() { super("请重新连接一言以启用文集和收藏", 409); }
}
export class YiyanUnconfirmedError extends YiyanError {
  constructor(message = "暂未确认结果，请点击“检查结果”核对") { super(message, 409); }
}

export function validYiyanCookies(value: unknown): value is YiyanCookies {
  return Array.isArray(value) && value.length <= 12 && value.every(pair => Array.isArray(pair) && pair.length === 2 &&
    typeof pair[0] === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(pair[0]) &&
    typeof pair[1] === "string" && /^[\x21-\x3A\x3C-\x7E]{0,1200}$/.test(pair[1])) && JSON.stringify(value).length < 2200;
}

export class YiyanClient {
  private jar: Map<string, string>;
  private fetcher: typeof fetch;
  private deadline = Date.now() + 24_000;
  private libraryValue: { identity: YiyanIdentity; books: NonNullable<ReturnType<typeof parseYiyanBooks>>; defaultBook: ReturnType<typeof yiyanDefaultBook> } | null = null;
  constructor(cookies: YiyanCookies = [], fetcher: typeof fetch = fetch) {
    if (!validYiyanCookies(cookies)) throw new YiyanError("请重新连接一言", 401);
    this.jar = new Map(cookies); this.fetcher = fetcher;
  }
  getCookies(): YiyanCookies { return [...this.jar]; }
  private async request(path: string, fields: Record<string, string>, method: "POST" | "GET" = "POST"): Promise<Record<string, unknown>> {
    if (!allowedPaths.has(path)) throw new YiyanError("不允许的请求", 400);
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Xuliu-Yan/1.0" };
    if (this.jar.size) headers.Cookie = [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ");
    let response: Response;
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) throw new YiyanError("一言响应较慢，请稍后重试", 503, true);
    const parameters = new URLSearchParams({ ...fields, v: "5.20" });
    try { response = await this.fetcher(baseUrl + path + (method === "GET" ? `?${parameters}` : ""), { method, headers, ...(method === "POST" ? { body: parameters } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(Math.min(9000, remaining)) }); }
    catch { throw new YiyanError("一言暂时没有响应，请稍后重试", 503, true); }
    if (response.status >= 300 && response.status < 400) throw new YiyanError("一言返回了异常跳转，请稍后再试");
    if (response.status === 429) throw new YiyanError("一言请求较多，请稍后再试", 429);
    if (response.status >= 500) throw new YiyanError("一言服务暂不可用，请稍后重试", 503, true);
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0], index = pair.indexOf("=");
      if (index > 0) {
        const name = pair.slice(0, index), value = pair.slice(index + 1);
        if (validYiyanCookies([[name, value]])) { if (value) this.jar.set(name, value); else this.jar.delete(name); }
      }
    }
    if (!validYiyanCookies(this.getCookies())) throw new YiyanError("登录信息异常，请重新连接一言", 401);
    let data: Record<string, unknown>;
    try {
      const reader = response.body?.getReader(); if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 512 * 1024) { await reader.cancel(); throw new Error(); }
        chunks.push(value);
      }
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      data = parsed as Record<string, unknown>;
    } catch { throw new YiyanError("一言响应异常，请稍后再试"); }
    if (!response.ok || data.success === false || (data.errorcode != null && String(data.errorcode) !== "0")) {
      if (path === "checksmsverifycode") throw new YiyanError("验证码未通过，请重新检查", 400);
      if (["gettodaycard", "getuserinfoandbooklist", "gettextcardsinbook", "collectcard", "newbook_np"].includes(path) && String(data.errorcode) === "3") throw new YiyanError("一言登录已过期，请重新连接", 401);
      throw new YiyanError(path === "sendsmsverifycode" ? "验证码发送失败，请稍后再试" : "一言暂时未接受请求，请稍后再试", 400);
    }
    return data;
  }
  private async read(path: string, fields: Record<string, string>, method: "POST" | "GET" = "GET") {
    try { return await this.request(path, fields, method); }
    catch (error) {
      if (!(error instanceof YiyanError) || !error.retryable || this.deadline - Date.now() < 1000) throw error;
      return this.request(path, fields, method);
    }
  }
  async sendCode(phone: string): Promise<void> {
    if (!isYiyanPhone(phone)) throw new YiyanError("请输入有效的手机号", 400);
    await this.request("sendsmsverifycode", { pn: phone, k: md5(`jh${phone}yy`) });
  }
  async signIn(phone: string, code: string, now = Date.now()): Promise<YiyanIdentity> {
    if (!isYiyanPhone(phone) || !/^\d{4,8}$/.test(code)) throw new YiyanError("请输入手机号和验证码", 400);
    const k = md5(`jh${phone}yy`);
    await this.request("checksmsverifycode", { pn: phone, code, k });
    const timestamp = String(Math.floor(now / 1000));
    const data = await this.request("yiyanphonelogin", { pn: phone, k, timestamp, sign: md5(`jh${phone}${timestamp}`) });
    const user = parseYiyanIdentity(data.user);
    if (!user) throw new YiyanError("请使用原有一言账号绑定的手机号", 400);
    if (!this.jar.size) throw new YiyanError("未取得有效登录会话，请重新连接", 401);
    return user;
  }
  async card(exclude = "", now = Date.now()): Promise<YiyanCard> {
    let previous: YiyanCard | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const time = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
      const prefix = md5(time).slice(0, 12), t = prefix + md5(prefix + "yan").slice(0, 20);
      const start = Date.UTC(2018, 0, 1), end = Math.max(start + 1000, now - 86400_000);
      const date = new Date(randomInt(start, end)).toISOString().slice(0, 19).replace("T", " ");
      const cards = parseYiyanResponse(await this.read("gettodaycard", { t, datetime: date }, "POST"));
      const choices = cards.filter(card => card.id !== exclude);
      if (choices.length) return choices[randomInt(choices.length)];
      previous = cards[0] ?? previous;
    }
    if (previous) return previous;
    throw new YiyanError("暂时没有取得新句子，请稍后再试");
  }

  async library(identity: YiyanIdentity | undefined, fresh = false) {
    if (!identity || !parseYiyanIdentity(identity)) throw new YiyanReconnectRequired();
    if (!fresh && this.libraryValue?.identity.uid === identity.uid) return this.libraryValue;
    const data = await this.read("getuserinfoandbooklist", { uid: identity.uid });
    const user = parseYiyanIdentity(data.user), books = user?.uid === identity.uid ? parseYiyanBooks(data.booklist, identity.uid) : null;
    if (!user || !books) throw new YiyanError("未取得有效的文集信息，请稍后再试");
    return this.libraryValue = { identity: user, books, defaultBook: yiyanDefaultBook(books) };
  }

  async bookCards(identity: YiyanIdentity | undefined, bookId: string, cursor = "") {
    if (!isYiyanId(bookId) || (cursor && !isYiyanCursor(cursor))) throw new YiyanError("无效的文集或分页位置", 400);
    const library = await this.library(identity), book = library.books.find(item => item.id === bookId);
    if (!book) throw new YiyanError("找不到这个文集，请刷新文集列表", 404);
    const page = parseYiyanLibraryPage(await this.read("gettextcardsinbook", { bookid: book.id, ...(cursor ? { datetime: cursor } : {}) }), cursor);
    if (!page) throw new YiyanError("文集内容暂时无法读取，请重试");
    return { ...page, book };
  }

  async collect(identity: YiyanIdentity, cardId: string, bookId: string) {
    if (!isYiyanId(cardId) || (bookId && !isYiyanId(bookId))) throw new YiyanError("无效的图文或文集编号", 400);
    const library = await this.library(identity), book = bookId ? library.books.find(item => item.id === bookId) : library.defaultBook;
    if (!book) throw new YiyanError(bookId ? "找不到这个文集，请刷新列表" : "未找到唯一的“默认文集”，请在菜单中选择文集", 404);
    await this.request("collectcard", { cardid: cardId, collectuid: library.identity.uid, collectun: library.identity.username, collectbookid: book.id, collectbn: book.name });
    return { saved: true as const, cardId, book };
  }

  async checkCollection(identity: YiyanIdentity, cardId: string, bookId: string) {
    await this.library(identity, true);
    const page = await this.bookCards(identity, bookId);
    return page.cards.some(card => card.id === cardId) ? { saved: true as const, cardId, book: page.book } : null;
  }

  async collectConfirmed(identity: YiyanIdentity, cardId: string, bookId: string) {
    const existing = await this.checkCollection(identity, cardId, bookId);
    if (existing) return existing;
    await this.collect(identity, cardId, bookId);
    const confirmed = await this.checkCollection(identity, cardId, bookId);
    if (!confirmed) throw new YiyanUnconfirmedError();
    return confirmed;
  }

  async checkCreatedBook(identity: YiyanIdentity, name: string, visibility: "private" | "public") {
    const library = await this.library(identity, true);
    const matches = library.books.filter(book => book.name === name.trim() && book.private === (visibility === "private"));
    return matches.length === 1 ? { book: matches[0], recovered: true } : null;
  }

  async createBook(identity: YiyanIdentity | undefined, name: string, visibility: "private" | "public") {
    if (!name.trim() || name.trim().length > 60 || /[\x00-\x1f]/.test(name) || !["private", "public"].includes(visibility)) throw new YiyanError("请填写 1–60 字的文集名称", 400);
    const library = await this.library(identity);
    if (library.books.some(book => book.name === name.trim())) throw new YiyanError("已存在同名文集，请直接打开", 409);
    const data = await this.request("newbook_np", { bookname: name.trim(), ava: visibility === "private" ? "0" : "1" });
    const book = parseYiyanBook(data, library.identity.uid);
    if (!book || book.name !== name.trim() || book.private !== (visibility === "private")) {
      const confirmed = await this.checkCreatedBook(library.identity, name, visibility);
      if (confirmed) return confirmed;
      throw new YiyanUnconfirmedError();
    }
    return { book };
  }
}
