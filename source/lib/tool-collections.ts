export type CollectionWebsite = {
  id: string;
  title: string;
  url: string;
  description: string;
};

export type ToolCollectionFields = {
  kind?: "tool" | "collection";
  websites?: CollectionWebsite[];
};

export const MAX_COLLECTION_WEBSITES = 200;

export function normalizeWebsiteUrl(value: string): string | null {
  const input = value.trim();
  if (!input || /\s/.test(input)) return null;
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
  const hostWithPort = /^[^/?#\s:]+\.\w+:\d+(?:[/?#]|$)/.test(input);
  const candidate = input.startsWith("//") ? `https:${input}` : hasScheme && !hostWithPort ? input : `https://${input}`;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function websiteHost(value: string) {
  const url = normalizeWebsiteUrl(value);
  return url ? new URL(url).host : "网址无效";
}

// Older tools keep their original shape. Collections survive client hydration.
export function toolCollectionFields(item: ToolCollectionFields): ToolCollectionFields {
  return {
    ...(item.kind ? { kind: item.kind } : {}),
    ...(Array.isArray(item.websites) ? { websites: item.websites } : {}),
  };
}

export function moveCollectionWebsite(websites: CollectionWebsite[], id: string, direction: -1 | 1) {
  const index = websites.findIndex((website) => website.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= websites.length) return websites;
  const reordered = [...websites];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}
