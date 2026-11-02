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

export function appearancePresetMatches(preset: AppearancePreset, query: string) {
  const background = preset.background.mode === "custom" ? preset.background.color : preset.background.mode === "dark" ? "深色 #171c20" : "浅色 #f4f5f2";
  return `${preset.name} ${preset.themeColor} ${background}`.toLowerCase().includes(query.trim().toLowerCase());
}

export function renameAppearancePreset(presets: AppearancePreset[], id: string, name: string): AppearancePreset[] | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80 || !presets.some((preset) => preset.id === id)) return null;
  return presets.map((preset) => preset.id === id ? { ...preset, name: trimmed } : preset);
}

export function saveAppearancePreset(presets: AppearancePreset[], draft: Omit<AppearancePreset, "id">, newId: string) {
  if (!validColor(draft.themeColor) || !validColor(draft.background.color) || !["light", "dark", "custom"].includes(draft.background.mode) || draft.name.trim().length > 80) return null;
  const themeColor = draft.themeColor.toLowerCase();
  const background = normalizeBackground(draft.background);
  const existing = presets.find((item) => appearancePresetKey(item.themeColor, item.background) === appearancePresetKey(themeColor, background));
  if (existing) {
    const preset = draft.name.trim() ? { ...existing, name: draft.name.trim() } : existing;
    return { preset, presets: presets.map((item) => item.id === existing.id ? preset : item), created: false };
  }
  if (!newId || newId.length > 120 || presets.some((item) => item.id === newId)) return null;
  let index = 1;
  while (presets.some((item) => item.name === `配色 ${index}`)) index += 1;
  const preset: AppearancePreset = { id: newId, name: draft.name.trim() || `配色 ${index}`, themeColor, background };
  return { preset, presets: [...presets, preset], created: true };
}
