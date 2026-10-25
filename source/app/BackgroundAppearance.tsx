"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { backgroundPalette, backgroundStorageKey, defaultBackground, normalizeBackground, type BackgroundPreference } from "@/lib/background-appearance";
import "./background-appearance.css";

const BackgroundContext = createContext<{ preference: BackgroundPreference; choose: (value: BackgroundPreference) => boolean }>({ preference: defaultBackground, choose: () => true });
export const useBackgroundAppearance = () => useContext(BackgroundContext);
const propertyNames = ["bg", "surface", "soft", "sidebar", "text", "muted", "faint", "line", "line-strong", "danger", "income", "expense", "link"];

function applyBackground(value: BackgroundPreference) {
  const root = document.documentElement;
  const palette = backgroundPalette(value);
  if (!palette) {
    delete root.dataset.background;
    root.style.removeProperty("color-scheme");
    propertyNames.forEach((name) => root.style.removeProperty(`--appearance-${name}`));
  } else {
    root.dataset.background = value.mode;
    root.style.colorScheme = palette.dark ? "dark" : "light";
    const colors = [palette.background, palette.paper, palette.soft, palette.sidebar, palette.text, palette.muted, palette.faint, palette.line, palette.strongLine, palette.danger, palette.income, palette.expense, palette.link];
    propertyNames.forEach((name, index) => root.style.setProperty(`--appearance-${name}`, colors[index]));
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette?.background ?? "#f4f5f2");
}

export function BackgroundAppearanceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<BackgroundPreference>(defaultBackground);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let saved = defaultBackground;
    try { saved = normalizeBackground(JSON.parse(localStorage.getItem(backgroundStorageKey) ?? "null")); } catch { /* Use the existing appearance if storage is unavailable. */ }
    setPreference(saved);
    setReady(true);
    applyBackground(saved);
    const sync = (event: StorageEvent) => {
      if (event.key !== backgroundStorageKey) return;
      try { setPreference(normalizeBackground(JSON.parse(event.newValue ?? "null"))); } catch { setPreference(defaultBackground); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useLayoutEffect(() => { if (ready) applyBackground(preference); }, [preference, ready]);
  const choose = (value: BackgroundPreference) => {
    const next = normalizeBackground(value);
    setPreference(next);
    try { localStorage.setItem(backgroundStorageKey, JSON.stringify(next)); return true; } catch { return false; }
  };
  return <BackgroundContext.Provider value={{ preference, choose }}>{children}</BackgroundContext.Provider>;
}

export function BackgroundPicker() {
  const { preference, choose } = useBackgroundAppearance();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(preference.color);
  const [message, setMessage] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (event.target instanceof Node && !host.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("click", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("click", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const select = (value: BackgroundPreference) => setMessage(choose(value) ? "" : "已应用，浏览器暂时无法保存");
  return <div ref={host} className="backgroundPicker">
    <button type="button" className="themeMoreButton backgroundEntry" ref={button} aria-label="背景设置" aria-expanded={open} aria-controls="background-options" onClick={() => { setDraft(preference.color); setMessage(""); setOpen(!open); }}><span aria-hidden="true">{preference.mode === "dark" ? "☾" : "◐"}</span>背景</button>
    {open && <div id="background-options" className="backgroundOptions" role="dialog" aria-label="背景设置">
      <h2>背景</h2><div className="backgroundModes" role="group" aria-label="背景模式">{([{ mode: "light", label: "浅色" }, { mode: "dark", label: "深色" }, { mode: "custom", label: "自定义" }] as const).map(({ mode, label }) => <button type="button" key={mode} aria-pressed={preference.mode === mode} onClick={() => select({ ...preference, mode })}>{label}</button>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); if (!/^#[0-9a-f]{6}$/i.test(draft)) { setMessage("请输入六位颜色值，例如 #e9eeeb"); return; } select({ mode: "custom", color: draft }); }}>
        <label htmlFor="background-hex">自定义背景色</label><div className="backgroundFields"><input type="color" aria-label="选择背景颜色" value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : preference.color} onChange={(event) => { setDraft(event.target.value); setMessage(""); }} /><input id="background-hex" type="text" aria-label="背景颜色值" maxLength={7} spellCheck={false} autoComplete="off" value={draft} onChange={(event) => { setDraft(event.target.value); setMessage(""); }} /><button type="submit">应用</button></div>
      </form>{message && <p role="status">{message}</p>}
    </div>}
  </div>;
}
