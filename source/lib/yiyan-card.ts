export const yiyanCardStorageKey = "xuliu-yiyan-card-v1";
export const yiyanImageClarityKey = "xuliu-yiyan-image-clarity";
export const defaultYiyanImageClarity = 80;
export type YiyanCard = { provider: "yiyan"; id: string; text: string; source: string; image: string; publishedAt: string };
type QuoteStorage = Pick<Storage, "getItem" | "setItem">;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function yiyanImageUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000) return "";
  try {
    const url = new URL(value);
    const officialImage = url.hostname === "jhyiyan.oss-cn-beijing.aliyuncs.com" || (url.hostname === "app.yiyan.art" && url.pathname.startsWith("/yiyanpic/pic/"));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || !officialImage) return "";
    url.protocol = "https:";
    return url.href;
  } catch { return ""; }
}

export function parseYiyanCard(value: unknown): YiyanCard | null {
  const card = record(value);
  if (!card || card.provider !== "yiyan" || typeof card.id !== "string" || !/^\d{1,18}$/.test(card.id)) return null;
  if (typeof card.text !== "string" || !card.text.trim() || card.text.length > 1000) return null;
  const source = typeof card.source === "string" && card.source.length <= 500 ? card.source.trim() : "";
  const publishedAt = typeof card.publishedAt === "string" && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.test(card.publishedAt) ? card.publishedAt : "";
  return { provider: "yiyan", id: card.id, text: card.text.trim(), source, image: yiyanImageUrl(card.image), publishedAt };
}

export function parseYiyanResponse(value: unknown): YiyanCard[] {
  const data = record(value);
  if (!Array.isArray(data?.textcardlist)) return [];
  const seen = new Set<string>();
  const cards: YiyanCard[] = [];
  for (const item of data.textcardlist.slice(0, 100)) {
    const raw = record(item);
    if (!raw || ![0, "0"].includes(raw.priv as string | number)) continue;
    const creator = record(raw.creator);
    if (String(creator?.uid) !== "9999" && ![1, "1", true].includes(raw.rec as string | number | boolean)) continue;
    const card = parseYiyanCard({ provider: "yiyan", id: String(raw.textcardid ?? ""), text: raw.content, source: raw.from, image: raw.picpath, publishedAt: raw.datetime });
    if (card && !seen.has(card.id)) { seen.add(card.id); cards.push(card); }
  }
  return cards;
}

export function readYiyanCache(storage?: QuoteStorage): YiyanCard | null {
  try { return parseYiyanCard(JSON.parse(storage?.getItem(yiyanCardStorageKey) ?? "null")); }
  catch { return null; }
}

export function saveYiyanCache(card: YiyanCard, storage?: QuoteStorage): void {
  try { storage?.setItem(yiyanCardStorageKey, JSON.stringify(card)); } catch { /* The fetched card remains usable without storage. */ }
}

export function readYiyanImageClarity(storage?: QuoteStorage): number {
  try {
    const value = storage?.getItem(yiyanImageClarityKey);
    if (!value || !/^\d{1,3}$/.test(value)) return defaultYiyanImageClarity;
    const clarity = Number(value);
    return clarity >= 0 && clarity <= 100 ? clarity : defaultYiyanImageClarity;
  } catch { return defaultYiyanImageClarity; }
}

export function saveYiyanImageClarity(value: number, storage?: QuoteStorage): void {
  if (!Number.isFinite(value)) return;
  try { storage?.setItem(yiyanImageClarityKey, String(Math.round(Math.max(0, Math.min(100, value))))); } catch { /* Keep the current appearance when storage is unavailable. */ }
}
