import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findAccountById } from "@/lib/accounts";
import { getSession } from "@/lib/session";
import { getRedis } from "@/lib/redis";
import { isYiyanPhone, YiyanClient, YiyanError } from "@/lib/yiyan-service";
import { hasYiyanSameOrigin, isYiyanLocalPreview, openYiyanSession, sealYiyanSession, yiyanCookieName, yiyanKey, yiyanPendingCookieName, yiyanPhoneHash, yiyanSessionSeconds, type YiyanSession } from "@/lib/yiyan-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/yiyan" };
const localState = globalThis as typeof globalThis & { xuliuYiyanDevSecret?: string; xuliuYiyanDevLimits?: Map<string, { count: number; expires: number }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
function clearCookie(response: NextResponse, name: string) { response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 }); }
function setCookie(response: NextResponse, name: string, value: YiyanSession, key: Buffer) {
  response.cookies.set(name, sealYiyanSession(value, key), { ...cookieOptions, maxAge: Math.max(0, Math.floor((value.expiresAt - Date.now()) / 1000)) });
}

async function context(request: Request) {
  const local = isYiyanLocalPreview(request, process.env.NODE_ENV);
  let owner = local ? "local-preview" : "";
  try {
    const session = await getSession();
    if (session && findAccountById(session.userId)) owner = session.userId;
  } catch { if (!local) throw new YiyanError("登录配置暂不可用", 503); }
  if (!owner) throw new YiyanError("请先登录序流", 401);
  let secret = process.env.XULIU_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (!local) throw new YiyanError("连接配置暂不可用", 503);
    secret = localState.xuliuYiyanDevSecret ??= randomBytes(32).toString("hex");
  }
  return { owner, local, key: yiyanKey(secret), store: await cookies() };
}

async function limit(key: string, max: number, seconds: number, local: boolean) {
  if (local) {
    const limits = localState.xuliuYiyanDevLimits ??= new Map();
    const now = Date.now();
    for (const [name, value] of limits) if (value.expires <= now) limits.delete(name);
    const entry = limits.get(key) ?? { count: 0, expires: now + seconds * 1000 };
    if (limits.size > 2000 && !limits.has(key)) throw new YiyanError("请求过多，请稍后再试", 429);
    entry.count++; limits.set(key, entry);
    if (entry.count > max) throw new YiyanError("请求过多，请稍后再试", 429);
    return;
  }
  try {
    const redis = getRedis(), name = `xuliu:yiyan:limit:${key}`, count = await redis.incr(name);
    if (count === 1) await redis.expire(name, seconds);
    if (count > max) throw new YiyanError("请求过多，请稍后再试", 429);
  } catch (error) {
    if (error instanceof YiyanError) throw error;
    throw new YiyanError("暂时无法连接一言，请稍后再试", 503);
  }
}

function failure(error: unknown) {
  return error instanceof YiyanError ? json({ error: error.message, needsLogin: error.status === 401 }, error.status) : json({ error: "暂时无法连接一言，请稍后再试" }, 503);
}

export async function GET(request: Request) {
  try {
    const { owner, local, key, store } = await context(request);
    const session = openYiyanSession(store.get(yiyanCookieName)?.value, key, owner, "connected");
    const pending = openYiyanSession(store.get(yiyanPendingCookieName)?.value, key, owner, "pending");
    const url = new URL(request.url);
    if (url.searchParams.get("status") === "1") return json({ connected: Boolean(session), pending: Boolean(pending), retryAfter: pending ? Math.max(0, Math.ceil((pending.expiresAt - 9 * 60_000 - Date.now()) / 1000)) : 0 });
    if (!session) return json({ connected: false, needsLogin: true }, 401);
    await limit(`${owner}:quote:second`, 1, 2, local);
    await limit(`${owner}:quote:hour`, 120, 3600, local);
    const exclude = url.searchParams.get("exclude") ?? "";
    if (exclude && !/^\d{1,18}$/.test(exclude)) return json({ error: "无效的图文编号" }, 400);
    const client = new YiyanClient(session.cookies);
    try {
      const card = await client.card(exclude);
      const response = json({ connected: true, card });
      setCookie(response, yiyanCookieName, { ...session, cookies: client.getCookies() }, key);
      return response;
    } catch (error) {
      const response = failure(error);
      if (error instanceof YiyanError && error.status === 401) clearCookie(response, yiyanCookieName);
      return response;
    }
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (!hasYiyanSameOrigin(request)) return json({ error: "请求来源无效" }, 403);
    const { owner, local, key, store } = await context(request);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "请求格式不正确" }, 400);
    let size = 0; const parts: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4000) { await reader.cancel(); return json({ error: "请求过大" }, 413); }
      parts.push(value);
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch { return json({ error: "请求格式不正确" }, 400); }
    if (body.action === "disconnect") {
      const response = json({ connected: false });
      clearCookie(response, yiyanCookieName); clearCookie(response, yiyanPendingCookieName);
      return response;
    }
    if (!["send-code", "sign-in"].includes(String(body.action)) || !isYiyanPhone(body.phone)) return json({ error: "请输入有效的手机号" }, 400);
    const phone = body.phone, phoneHash = yiyanPhoneHash(phone, key);
    if (body.action === "send-code") {
      await limit(`${owner}:sms:minute`, 1, 60, local);
      await limit(`${owner}:sms:hour`, 5, 3600, local);
      await limit(`phone:${phoneHash}:hour`, 5, 3600, local);
      const client = new YiyanClient();
      await client.sendCode(phone);
      const response = json({ sent: true, retryAfter: 60 });
      setCookie(response, yiyanPendingCookieName, { owner, kind: "pending", expiresAt: Date.now() + 10 * 60_000, cookies: client.getCookies(), phoneHash }, key);
      return response;
    }
    const pending = openYiyanSession(store.get(yiyanPendingCookieName)?.value, key, owner, "pending");
    if (!pending || pending.phoneHash !== phoneHash) return json({ error: "请先使用这个手机号获取验证码" }, 400);
    if (typeof body.code !== "string" || !/^\d{4,8}$/.test(body.code)) return json({ error: "请输入短信验证码" }, 400);
    await limit(`${owner}:verify:${phoneHash}`, 5, 10 * 60, local);
    const client = new YiyanClient(pending.cookies);
    await client.signIn(phone, body.code);
    const response = json({ connected: true });
    setCookie(response, yiyanCookieName, { owner, kind: "connected", expiresAt: Date.now() + yiyanSessionSeconds * 1000, cookies: client.getCookies() }, key);
    clearCookie(response, yiyanPendingCookieName);
    return response;
  } catch (error) { return failure(error); }
}
