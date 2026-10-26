import { normalizeBackground, type BackgroundPreference } from "./background-appearance.ts";

export type AppearancePreset = { id: string; name: string; themeColor: string; background: BackgroundPreference };
export const appearancePresetsStorageKey = "xuliu-appearance-presets-v1";
const validColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function appearancePresetKey(themeColor: string, background: BackgroundPreference) {
  return `${themeColor.toLowerCase()}:${background.mode}:${background.mode === "custom" ? background.color.toLowerCase() : ""}`;
}

export function normalizeAppearancePresets(raw: unknown): AppearancePreset[] {
  if (!Array.isArray(raw)) return [];
  const result: AppearancePreset[] = [];
  const ids = new Set<string>();
  const colors = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const background = entry.background as Record<string, unknown> | null;
    if (typeof entry.id !== "string" || !entry.id || entry.id.length > 120 || typeof entry.name !== "string" || !entry.name.trim() || entry.name.trim().length > 80 || !validColor(entry.themeColor)
      || !background || Array.isArray(background) || !["light", "dark", "custom"].includes(String(background.mode)) || !validColor(background.color)) continue;
    const normalized = { id: entry.id, name: entry.name.trim(), themeColor: entry.themeColor.toLowerCase(), background: normalizeBackground(background) };
    const key = appearancePresetKey(normalized.themeColor, normalized.background);
    if (ids.has(normalized.id) || colors.has(key)) continue;
    result.push(normalized); ids.add(normalized.id); colors.add(key);
  }
  return result;
}
