import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AccountId } from "./accounts";

export const sessionCookieName = "xuliu_ai_session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

type SessionPayload = { userId: AccountId; expiresAt: number };

function secret() {
  const value = process.env.XULIU_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("XULIU_SESSION_SECRET must contain at least 32 characters");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(userId: AccountId) {
  const payload: SessionPayload = { userId, expiresAt: Date.now() + sessionLifetimeSeconds * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = Buffer.from(sign(encoded));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(sessionCookieName)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: sessionLifetimeSeconds,
};
