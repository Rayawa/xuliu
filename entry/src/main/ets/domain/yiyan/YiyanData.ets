import { YiyanCard, YiyanBook, YiyanLibraryCard } from '../../models/YiyanModels';

export function yiyanId(value: string): boolean { return typeof value === 'string' && /^\d{1,18}$/.test(value); }
export function yiyanCursor(value: string): boolean { return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(value); }
export function yiyanImageUrl(value: string): string {
  if (typeof value !== 'string' || value.length > 2000 || /[\s\\]/.test(value)) return '';
  if (!/^https?:\/\/(?:jhyiyan\.oss-cn-beijing\.aliyuncs\.com\/|app\.yiyan\.art\/yiyanpic\/pic\/)/i.test(value)) return '';
  return value.replace(/^http:/i, 'https:');
}
export function parseYiyanCard(value: YiyanCard | undefined): YiyanCard | undefined {
  if (!value || value.provider !== 'yiyan' || !yiyanId(value.id) || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 1000) return undefined;
  return { provider: 'yiyan', id: value.id, text: value.text.trim(), source: typeof value.source === 'string' && value.source.length <= 500 ? value.source.trim() : '',
    image: yiyanImageUrl(value.image), publishedAt: typeof value.publishedAt === 'string' && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.test(value.publishedAt) ? value.publishedAt : '' };
}
export function parseYiyanBook(value: YiyanBook | undefined): YiyanBook | undefined {
  if (!value || !yiyanId(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 ||
    !Number.isSafeInteger(value.count) || value.count < 0 || ![true, false, null].includes(value.private)) return undefined;
  return { id: value.id, name: value.name.trim(), count: value.count, private: value.private, image: yiyanImageUrl(value.image) };
}
export function libraryCards(values: YiyanLibraryCard[]): YiyanLibraryCard[] {
  if (!Array.isArray(values) || values.length > 100) throw new Error('一言文集返回的图文格式无效');
  const seen: Set<string> = new Set(); const cards: YiyanLibraryCard[] = [];
  for (const value of values) {
    if (!value || !yiyanId(value.id) || seen.has(value.id) || typeof value.text !== 'string' || value.text.length > 20000) continue;
    const image = yiyanImageUrl(value.image); if (!value.text.trim() && !image) continue;
    seen.add(value.id); cards.push({ id: value.id, text: value.text, image, source: typeof value.source === 'string' ? value.source.slice(0, 500) : '',
      publishedAt: typeof value.publishedAt === 'string' && value.publishedAt.length <= 40 ? value.publishedAt : '' });
  }
  return cards;
}
