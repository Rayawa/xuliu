import { NextResponse } from "next/server";
import { z } from "zod";
import { findAccountByUsername, publicAccount } from "@/lib/accounts";
import { verifyPassword } from "@/lib/password";
import { getRedis } from "@/lib/redis";
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(500),
}).strict();
const dummyPasswordHash = "pbkdf2-sha256$210000$AAAAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 4_000) return NextResponse.json({ error: "登录请求过大" }, { status: 413 });
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请输入有效的用户名和密码" }, { status: 400 });
  const { username, password } = parsed.data;

  const redis = getRedis();
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const attemptKey = `xuliu-ai-v1:login:${address}:${username.toLowerCase()}`;
  const addressKey = `xuliu-ai-v1:login:address:${address}`;
  const [attempts, addressAttempts] = await Promise.all([redis.incr(attemptKey), redis.incr(addressKey)]);
  if (attempts === 1) await redis.expire(attemptKey, 15 * 60);
  if (addressAttempts === 1) await redis.expire(addressKey, 15 * 60);
  if (attempts > 10 || addressAttempts > 50) return NextResponse.json({ error: "尝试次数过多，请 15 分钟后再试" }, { status: 429 });

  const account = findAccountByUsername(username);
  const valid = await verifyPassword(password, account?.passwordHash || dummyPasswordHash);
  if (!account || !account.passwordHash || !valid) return NextResponse.json({ error: "用户名或密码不正确" }, { status: 401 });

  await redis.del(attemptKey);
  const response = NextResponse.json({ account: publicAccount(account) });
  response.cookies.set(sessionCookieName, createSessionToken(account.id), sessionCookieOptions);
  return response;
}
