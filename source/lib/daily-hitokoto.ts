import { isValidLocalDate } from "./finance.ts";

export const dailyHitokotoStorageKey = "xuliu-daily-hitokoto-v1";
const endpoint = "https://v1.hitokoto.cn/?encode=json&min_length=8&max_length=60";
type Quote = { text: string; source: string; author: string; uuid: string };
export type DailyHitokoto = Quote & { date: string };
type QuoteStorage = Pick<Storage, "getItem" | "setItem">;

export function parseHitokoto(value: unknown): Quote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const text = typeof data.hitokoto === "string" ? data.hitokoto.trim() : "";
  if (!text || text.length > 140) return null;
  const shortText = (value: unknown) => typeof value === "string" && value.length <= 100 ? value.trim() : "";
  const uuid = typeof data.uuid === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(data.uuid) ? data.uuid : "";
  return { text, source: shortText(data.from), author: shortText(data.from_who), uuid };
}

function readCachedQuote(storage?: QuoteStorage): DailyHitokoto | null {
  try {
    const value = JSON.parse(storage?.getItem(dailyHitokotoStorageKey) ?? "null");
    if (!value || typeof value.date !== "string" || !isValidLocalDate(value.date)) return null;
    const quote = parseHitokoto({ hitokoto: value.text, from: value.source, from_who: value.author, uuid: value.uuid });
    return quote ? { ...quote, date: value.date } : null;
  } catch { return null; }
}

export async function loadDailyHitokoto(date: string, storage?: QuoteStorage, fetcher: typeof fetch = fetch, options: { refresh?: boolean } = {}): Promise<DailyHitokoto | null> {
  if (!isValidLocalDate(date)) return null;
  const cached = readCachedQuote(storage);
  if (!options.refresh && cached?.date === date) return cached;
  const fallback = options.refresh ? null : cached;
  try {
    const response = await fetcher(endpoint, { credentials: "omit", referrerPolicy: "no-referrer", cache: options.refresh ? "no-store" : "default", signal: AbortSignal.timeout(6000) });
    if (!response.ok) return fallback;
    const quote = parseHitokoto(await response.json());
    if (!quote) return fallback;
    const daily = { ...quote, date };
    try { storage?.setItem(dailyHitokotoStorageKey, JSON.stringify(daily)); }
    catch { /* A full or unavailable browser store must not hide the fetched quote. */ }
    return daily;
  } catch { return fallback; }
}
