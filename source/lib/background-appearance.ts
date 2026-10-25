export type BackgroundMode = "light" | "dark" | "custom";
export type BackgroundPreference = { mode: BackgroundMode; color: string };
export const backgroundStorageKey = "xuliu-background-v1";
export const defaultBackground: BackgroundPreference = { mode: "light", color: "#e9eeeb" };

export function normalizeBackground(value: unknown): BackgroundPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaultBackground };
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === "dark" || raw.mode === "custom" ? raw.mode : "light";
  const color = typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : defaultBackground.color;
  return { mode, color };
}

const rgb = (color: string) => [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
const mix = (base: string, target: string, amount: number) => "#" + rgb(base).map((value, index) => Math.round(value * (1 - amount) + rgb(target)[index] * amount).toString(16).padStart(2, "0")).join("");
const luminance = (color: string) => rgb(color).map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
export function backgroundContrast(first: string, second: string) {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + .05) / (low + .05);
}

function readable(color: string, surfaces: string[], minimum: number, foreground: string) {
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(color, foreground, step / 20);
    if (surfaces.every((surface) => backgroundContrast(candidate, surface) >= minimum)) return candidate;
  }
  return foreground;
}

export function backgroundPalette(preference: BackgroundPreference, accent = "#718c7c") {
  const settings = normalizeBackground(preference);
  if (settings.mode === "light") return null;
  const background = settings.mode === "dark" ? "#171c20" : settings.color;
  const dark = backgroundContrast("#ffffff", background) >= backgroundContrast("#000000", background);
  const surfaceTarget = dark && luminance(background) > .10 ? "#000000" : "#ffffff";
  const paper = mix(background, surfaceTarget, dark ? .045 : .88);
  const soft = mix(background, surfaceTarget, dark ? .085 : .70);
  const surfaces = [background, paper, soft];
  const foreground = dark ? "#ffffff" : "#000000";
  const text = readable(dark ? "#e9edf0" : "#28312c", surfaces, 4.5, foreground);
  return {
    background, paper, soft, dark, text,
    sidebar: mix(background, dark ? "#000000" : "#ffffff", dark ? .08 : .38),
    muted: readable(mix(text, background, .34), surfaces, 4.5, foreground),
    faint: readable(mix(text, background, .44), surfaces, 4.5, foreground),
    line: mix(text, background, .78),
    strongLine: mix(text, background, .62),
    link: readable(/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#718c7c", surfaces, 4.5, foreground),
    danger: readable("#bf514b", surfaces, 4.5, foreground),
    income: readable("#4d8063", surfaces, 4.5, foreground),
    expense: readable("#a05f59", surfaces, 4.5, foreground),
  };
}
