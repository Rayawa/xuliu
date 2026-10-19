import { createHash, randomInt } from "node:crypto";
import { parseYiyanResponse, type YiyanCard } from "./yiyan-card.ts";

export type YiyanCookies = [string, string][];
const baseUrl = "https://app.yiyan.art/yiyan/";
const allowedPaths = new Set(["sendsmsverifycode", "checksmsverifycode", "yiyanphonelogin", "gettodaycard"]);
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
export const isYiyanPhone = (value: unknown): value is string => typeof value === "string" && /^1[3-9]\d{9}$/.test(value);

export class YiyanError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.name = "YiyanError"; this.status = status; }
}

export function validYiyanCookies(value: unknown): value is YiyanCookies {
  return Array.isArray(value) && value.length <= 12 && value.every(pair => Array.isArray(pair) && pair.length === 2 &&
    typeof pair[0] === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(pair[0]) &&
    typeof pair[1] === "string" && /^[\x21-\x3A\x3C-\x7E]{0,1200}$/.test(pair[1])) && JSON.stringify(value).length < 2200;
}

export class YiyanClient {
  private jar: Map<string, string>;
  private fetcher: typeof fetch;
  constructor(cookies: YiyanCookies = [], fetcher: typeof fetch = fetch) {
    if (!validYiyanCookies(cookies)) throw new YiyanError("请重新连接一言", 401);
    this.jar = new Map(cookies); this.fetcher = fetcher;
  }
  getCookies(): YiyanCookies { return [...this.jar]; }
  private async request(path: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
    if (!allowedPaths.has(path)) throw new YiyanError("不允许的请求", 400);
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Xuliu-Yan/1.0" };
    if (this.jar.size) headers.Cookie = [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ");
    let response: Response;
    try { response = await this.fetcher(baseUrl + path, { method: "POST", headers, body: new URLSearchParams({ ...fields, v: "5.20" }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000) }); }
    catch { throw new YiyanError("暂时无法连接一言，请稍后再试"); }
    if (response.status >= 300 && response.status < 400) throw new YiyanError("一言返回了异常跳转，请稍后再试");
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
      if (path === "gettodaycard" && String(data.errorcode) === "3") throw new YiyanError("一言登录已过期，请重新连接", 401);
      throw new YiyanError(path === "sendsmsverifycode" ? "验证码发送失败，请稍后再试" : "一言暂时未接受请求，请稍后再试", 400);
    }
    return data;
  }
  async sendCode(phone: string): Promise<void> {
    if (!isYiyanPhone(phone)) throw new YiyanError("请输入有效的手机号", 400);
    await this.request("sendsmsverifycode", { pn: phone, k: md5(`jh${phone}yy`) });
  }
  async signIn(phone: string, code: string, now = Date.now()): Promise<void> {
    if (!isYiyanPhone(phone) || !/^\d{4,8}$/.test(code)) throw new YiyanError("请输入手机号和验证码", 400);
    const k = md5(`jh${phone}yy`);
    await this.request("checksmsverifycode", { pn: phone, code, k });
    const timestamp = String(Math.floor(now / 1000));
    const data = await this.request("yiyanphonelogin", { pn: phone, k, timestamp, sign: md5(`jh${phone}${timestamp}`) });
    const user = data.user as Record<string, unknown> | undefined;
    if (!user || !/^\d+$/.test(String(user.uid ?? "")) || String(user.username ?? "").includes("_yannewuser_")) throw new YiyanError("请使用原有一言账号绑定的手机号", 400);
    if (!this.jar.size) throw new YiyanError("未取得有效登录会话，请重新连接", 401);
  }
  async card(exclude = "", now = Date.now()): Promise<YiyanCard> {
    let previous: YiyanCard | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const time = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
      const prefix = md5(time).slice(0, 12), t = prefix + md5(prefix + "yan").slice(0, 20);
      const start = Date.UTC(2018, 0, 1), end = Math.max(start + 1000, now - 86400_000);
      const date = new Date(randomInt(start, end)).toISOString().slice(0, 19).replace("T", " ");
      const cards = parseYiyanResponse(await this.request("gettodaycard", { t, datetime: date }));
      const choices = cards.filter(card => card.id !== exclude);
      if (choices.length) return choices[randomInt(choices.length)];
      previous = cards[0] ?? previous;
    }
    if (previous) return previous;
    throw new YiyanError("暂时没有取得新句子，请稍后再试");
  }
}
