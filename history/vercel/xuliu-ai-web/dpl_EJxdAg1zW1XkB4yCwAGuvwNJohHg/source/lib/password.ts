import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Callback);
const iterations = 210_000;
const keyLength = 32;
const digest = "sha256";

export async function hashPassword(password: string) {
  const salt = randomBytes(18);
  const derived = await pbkdf2(password, salt, iterations, keyLength, digest);
  return `pbkdf2-sha256$${iterations}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, count, saltText, hashText] = encoded.split("$");
  if (algorithm !== "pbkdf2-sha256" || !count || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await pbkdf2(password, Buffer.from(saltText, "base64url"), Number(count), expected.length, digest);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
