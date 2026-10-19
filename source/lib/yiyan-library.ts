import { yiyanImageUrl } from "./yiyan-card.ts";

export type YiyanIdentity = { uid: string; username: string };
export type YiyanBook = { id: string; name: string; count: number; private: boolean | null; image: string };
export type YiyanLibraryCard = { id: string; text: string; source: string; image: string; publishedAt: string };
export type YiyanLibraryPage = { cards: YiyanLibraryCard[]; nextCursor: string | null };

export const isYiyanId = (value: unknown): value is string => typeof value === "string" && /^\d{1,18}$/.test(value);
export const isYiyanCursor = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(value);
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function parseYiyanIdentity(value: unknown): YiyanIdentity | null {
  const user = object(value);
  const uid = String(user?.uid ?? ""), username = user?.username;
  if (!isYiyanId(uid) || typeof username !== "string" || !username.trim() || username.length > 200 || /[\x00-\x1f]/.test(username) || username.includes("_yannewuser_")) return null;
  return { uid, username: username.trim() };
}

export function parseYiyanBook(value: unknown, owner: string, ownList = false): YiyanBook | null {
  const book = object(value), creator = object(book?.creator);
  const id = String(book?.bookid ?? ""), name = book?.bookname;
  const trustedOwner = creator ? String(creator.uid ?? "") === owner : ownList && book?.creator == null;
  if (!isYiyanId(id) || typeof name !== "string" || !name.trim() || name.length > 200 || !trustedOwner) return null;
  const count = Number(book?.cardcnt);
  return { id, name: name.trim(), count: Number.isSafeInteger(count) && count >= 0 ? count : 0,
    private: [0, "0", false, "false"].includes(book?.ava as string | number | boolean) ? true : [1, "1", true, "true"].includes(book?.ava as string | number | boolean) ? false : null,
    image: yiyanImageUrl(book?.b_picpath) || yiyanImageUrl(book?.picpath) };
}

export function parseYiyanBooks(value: unknown, owner: string): YiyanBook[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const books: YiyanBook[] = [], seen = new Set<string>();
  for (const raw of value) { const book = parseYiyanBook(raw, owner, true); if (book && !seen.has(book.id)) { seen.add(book.id); books.push(book); } }
  return value.length && !books.length ? null : books;
}

export function yiyanDefaultBook(books: YiyanBook[]): YiyanBook | null {
  const matches = books.filter(book => book.name === "默认文集");
  return matches.length === 1 ? matches[0] : null;
}

export function parseYiyanLibraryPage(value: unknown, cursor = ""): YiyanLibraryPage | null {
  const data = object(value);
  if (!Array.isArray(data?.textcardlist) || data.textcardlist.length > 100) return null;
  const cards: YiyanLibraryCard[] = [], seen = new Set<string>();
  for (const item of data.textcardlist) {
    const raw = object(item), id = String(raw?.textcardid ?? ""), image = yiyanImageUrl(raw?.picpath);
    const text = typeof raw?.content === "string" ? raw.content : "";
    if (!isYiyanId(id) || seen.has(id) || text.length > 20000 || (!text.trim() && !image)) continue;
    seen.add(id); cards.push({ id, text, image, source: typeof raw?.from === "string" ? raw.from.slice(0, 500) : "",
      publishedAt: typeof raw?.datetime === "string" && raw.datetime.length <= 40 ? raw.datetime : "" });
  }
  const last = object(data.textcardlist.at(-1)), next = last?.cibdatetime;
  return { cards, nextCursor: isYiyanCursor(next) && next !== cursor ? next : null };
}
