export type SavedColorNames = Record<string, string>;
export const themeColorNamesKey = "xuliu-saved-interface-color-names-v1";
export const backgroundColorNamesKey = "xuliu-saved-background-color-names-v1";
export const recentBackgroundColorsKey = "xuliu-recent-background-colors-v1";

export const normalizeSavedColor = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
export const normalizeColorCode = (value: string) => normalizeSavedColor(value.trim().startsWith("#") ? value : `#${value.trim()}`);

export function normalizeSavedColors(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(normalizeSavedColor).filter(Boolean))] : [];
}

export function normalizeSavedColorNames(value: unknown): SavedColorNames {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: SavedColorNames = {};
  for (const [color, name] of Object.entries(value)) {
    const tone = normalizeSavedColor(color);
    if (tone && typeof name === "string" && name.trim() && name.trim().length <= 80) result[tone] = name.trim();
  }
  return result;
}

export function withSavedColorName(current: SavedColorNames, color: string, name: string): SavedColorNames {
  const tone = normalizeSavedColor(color);
  if (!tone || name.trim().length > 80) return current;
  const next = { ...current };
  if (name.trim()) next[tone] = name.trim();
  else delete next[tone];
  return next;
}

export function savedColorMatches(color: string, name: string | undefined, query: string) {
  const term = query.trim().toLowerCase();
  return !term || `${name ?? ""} ${color}`.toLowerCase().includes(term);
}
