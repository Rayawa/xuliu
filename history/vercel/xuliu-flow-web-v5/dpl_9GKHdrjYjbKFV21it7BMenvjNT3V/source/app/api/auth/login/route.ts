import { NextResponse } from "next/server";
import { findAccountByUsername, publicAccount } from "@/lib/accounts";
import { verifyPassword } from "@/lib/password";
import { getRedis } from "@/lib/redis";
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  const username = body?.username?.trim() ?? "";
  const password = body?.password ?? "";
  if (!username || !password) return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });

  const redis = getRedis();
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const attemptKey = `xuliu:login:${address}:${username.toLowerCase()}`;
  const attempts = await redis.incr(attemptKey);
  if (attempts === 1) await redis.expire(attemptKey, 15 * 60);
  if (attempts > 10) return NextResponse.json({ error: "尝试次数过多，请 15 分钟后再试" }, { status: 429 });

  const account = findAccountByUsername(username);
  const valid = account?.passwordHash ? await verifyPassword(password, account.passwordHash) : false;
  if (!account || !valid) return NextResponse.json({ error: "用户名或密码不正确" }, { status: 401 });

  await redis.del(attemptKey);
  const response = NextResponse.json({ account: publicAccount(account) });
  response.cookies.set(sessionCookieName, createSessionToken(account.id), sessionCookieOptions);
  return response;
}
