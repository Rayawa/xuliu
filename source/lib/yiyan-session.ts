import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { validYiyanCookies, type YiyanCookies } from "./yiyan-service.ts";

export const yiyanCookieName = "xuliu_yiyan_connection";
export const yiyanPendingCookieName = "xuliu_yiyan_pending";
export const yiyanSessionSeconds = 7 * 86400;
export type YiyanSession = { owner: string; kind: "pending" | "connected"; expiresAt: number; cookies: YiyanCookies; phoneHash?: string };

export function hasYiyanSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin), target = new URL(request.url);
    return source.origin === origin && source.host === (request.headers.get("host") ?? target.host).toLowerCase() && source.protocol === target.protocol;
  } catch { return false; }
}

export function isYiyanLocalPreview(request: Request, environment: string | undefined): boolean {
  if (environment !== "development") return false;
  const url = new URL(request.url), host = request.headers.get("host") ?? url.host;
  return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host);
}

export function yiyanKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error("Yiyan connection secret unavailable");
  return createHash("sha256").update("xuliu-yiyan-v1\0" + secret).digest();
}
export function yiyanPhoneHash(phone: string, key: Buffer): string { return createHmac("sha256", key).update(phone).digest("hex"); }

export function sealYiyanSession(value: YiyanSession, key: Buffer): string {
  if (!validYiyanCookies(value.cookies)) throw new Error("Invalid Yiyan session");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("xuliu-yiyan-v1"));
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const token = Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64url");
  if (token.length > 3800) throw new Error("Yiyan session too large");
  return token;
}

export function openYiyanSession(token: string | undefined, key: Buffer, owner: string, kind: YiyanSession["kind"], now = Date.now()): YiyanSession | null {
  if (!token || token.length > 3800 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from("xuliu-yiyan-v1")); decipher.setAuthTag(bytes.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as YiyanSession;
    if (value.owner !== owner || value.kind !== kind || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || !validYiyanCookies(value.cookies)) return null;
    if (kind === "pending" && (typeof value.phoneHash !== "string" || !/^[a-f0-9]{64}$/.test(value.phoneHash))) return null;
    return value;
  } catch { return null; }
}
