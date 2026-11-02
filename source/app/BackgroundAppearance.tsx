"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { backgroundColorsStorageKey, backgroundPalette, backgroundStorageKey, defaultBackground, loadSavedBackgroundColors, normalizeBackground, type BackgroundPreference } from "@/lib/background-appearance";
import { backgroundColorNamesKey, normalizeColorCode, normalizeSavedColors, recentBackgroundColorsKey } from "@/lib/saved-colors";
import { SavedColorLibrary, useSavedColorNames } from "./SavedColorLibrary";
import "./background-appearance.css";
import { submitFormOnEnter } from "./form-keyboard";

type BackgroundControls = {
  choose: (value: BackgroundPreference) => boolean;
  preview: (value: BackgroundPreference) => void;
  resetPreview: () => void;
  setAccent: (color: string) => void;
};
const PreferenceContext = createContext(defaultBackground);
const ControlsContext = createContext<BackgroundControls>({ choose: () => false, preview: () => {}, resetPreview: () => {}, setAccent: () => {} });
const propertyNames = ["bg", "surface", "soft", "sidebar", "text", "muted", "faint", "line", "line-strong", "danger", "income", "expense", "link"];

function readBackgroundColors() {
  return loadSavedBackgroundColors(localStorage);
}

function applyBackground(value: BackgroundPreference, accent: string) {
  const root = document.documentElement;
  const palette = backgroundPalette(value, accent);
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
  const saved = useRef(defaultBackground);
  const previewValue = useRef<BackgroundPreference | null>(null);
  const frame = useRef<number | null>(null);
  const accent = useRef("#718c7c");
  const applied = useRef("");
  const apply = useCallback((value: BackgroundPreference) => {
    const key = `${value.mode}:${value.color}:${accent.current}`;
    if (applied.current === key) return;
    applyBackground(value, accent.current);
    applied.current = key;
  }, []);
  const cancelFrame = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const resetPreview = useCallback(() => {
    cancelFrame();
    previewValue.current = null;
    apply(saved.current);
  }, [apply, cancelFrame]);
  const preview = useCallback((value: BackgroundPreference) => {
    previewValue.current = normalizeBackground(value);
    // Color dragging only repaints the latest value once per frame; it does not update the workspace or storage.
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      frame.current = null;
      apply(previewValue.current ?? saved.current);
    });
  }, [apply]);
  const choose = useCallback((value: BackgroundPreference) => {
    cancelFrame();
    const next = normalizeBackground(value);
    saved.current = next;
    previewValue.current = null;
    apply(next);
    setPreference(next);
    try { localStorage.setItem(backgroundStorageKey, JSON.stringify(next)); return true; } catch { return false; }
  }, [apply, cancelFrame]);
  const setAccent = useCallback((color: string) => {
    accent.current = color;
    apply(previewValue.current ?? saved.current);
  }, [apply]);
  const controls = useMemo(() => ({ choose, preview, resetPreview, setAccent }), [choose, preview, resetPreview, setAccent]);
  useLayoutEffect(() => {
    const restore = (raw: string | null) => {
      let next = defaultBackground;
      try { next = normalizeBackground(JSON.parse(raw ?? "null")); } catch { /* Keep the default when storage is invalid. */ }
      saved.current = next;
      setPreference(next);
      if (!previewValue.current) apply(next);
    };
    try { restore(localStorage.getItem(backgroundStorageKey)); } catch { apply(saved.current); }
    const sync = (event: StorageEvent) => {
      if (event.key === backgroundStorageKey || event.key === null) restore(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("storage", sync); cancelFrame(); };
  }, [apply, cancelFrame]);
  return <ControlsContext.Provider value={controls}><PreferenceContext.Provider value={preference}>{children}</PreferenceContext.Provider></ControlsContext.Provider>;
}

export function useBackgroundAccent(color: string) {
  const { setAccent } = useContext(ControlsContext);
  useLayoutEffect(() => { setAccent(color); }, [color, setAccent]);
}

export function useBackgroundAppearance() {
  const preference = useContext(PreferenceContext);
  const { choose } = useContext(ControlsContext);
  return { preference, choose };
}

export function BackgroundPicker({ onOpen }: { onOpen?: () => void }) {
  const preference = useContext(PreferenceContext);
  const { resetPreview } = useContext(ControlsContext);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { resetPreview(); setOpen(false); }, [resetPreview]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (event.target instanceof Node && host.current && !event.composedPath().includes(host.current)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); button.current?.focus(); } };
    document.addEventListener("click", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("click", outside); document.removeEventListener("keydown", escape); };
  }, [open, close]);
  return <div ref={host} className="backgroundPicker">
    <button type="button" className="appearanceControl backgroundEntry" ref={button} aria-label="背景设置" aria-expanded={open} aria-controls="background-options" onClick={() => { if (open) close(); else { onOpen?.(); setMessage(""); setOpen(true); } }}><i className="appearancePreview" aria-hidden="true" style={{ backgroundColor: preference.mode === "custom" ? preference.color : preference.mode === "dark" ? "#171c20" : "var(--bg)" }} />背景色</button>
    {open && <BackgroundEditor preference={preference} onClose={close} onSaved={(saved) => { setMessage(saved ? "" : "已应用，浏览器暂时无法保存"); close(); button.current?.focus(); }} />}
    {message && <p className="backgroundSaveMessage" role="status">{message}</p>}
  </div>;
}

function BackgroundEditor({ preference, onClose, onSaved }: { preference: BackgroundPreference; onClose: () => void; onSaved: (saved: boolean) => void }) {
  const { choose, preview, resetPreview } = useContext(ControlsContext);
  const [mode, setMode] = useState(preference.mode);
  const [draft, setDraft] = useState(preference.color);
  const [message, setMessage] = useState("");
  const [savedColors, setSavedColors] = useState<string[]>([]);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [colorName, setColorName] = useState("");
  const { names: colorNames, rename: renameColor } = useSavedColorNames(backgroundColorNamesKey);
  const [colorMessage, setColorMessage] = useState("");
  const color = useRef(preference.color);
  const colorInput = useRef<HTMLInputElement>(null);
  useEffect(() => resetPreview, [resetPreview]);
  useEffect(() => {
    const restore = () => { try { setSavedColors(readBackgroundColors()); setRecentColors(normalizeSavedColors(JSON.parse(localStorage.getItem(recentBackgroundColorsKey) ?? "[]")).slice(0, 4)); } catch { /* Existing colors stay visible if storage is temporarily unavailable. */ } };
    restore();
    const sync = (event: StorageEvent) => { if (event.key === backgroundColorsStorageKey || event.key === recentBackgroundColorsKey || event.key === null) restore(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const storeColors = (update: (current: string[]) => string[], success: string) => {
    try {
      let current = savedColors;
      try { current = readBackgroundColors(); } catch { /* Repair malformed saved data with the valid colors already displayed. */ }
      const next = update(current);
      localStorage.setItem(backgroundColorsStorageKey, JSON.stringify(next));
      setSavedColors(next);
      setColorMessage(success);
      return true;
    } catch { setColorMessage("浏览器暂时无法保存颜色，请重试"); return false; }
  };
  const saveColor = () => {
    setMessage("");
    const tone = normalizeColorCode(draft);
    if (!tone) { setColorMessage(""); setMessage("请输入六位颜色值，例如 #e9eeeb"); return; }
    if (!storeColors((current) => [...new Set([...current, tone])], "")) return;
    const named = !colorName.trim() || renameColor(tone, colorName);
    const applied = applyPreference({ mode: "custom", color: tone });
    color.current = tone; setDraft(tone); setMode("custom");
    if (colorInput.current) colorInput.current.value = tone;
    setColorMessage(!applied ? "已收藏并应用，部分外观设置暂时无法保存" : !named ? "颜色已保存并应用，名称暂时未保存，请重试" : "已保存并应用颜色");
  };
  const updateColor = (value: string) => {
    setDraft(value);
    setMode("custom");
    setMessage("");
    setColorMessage("");
    const tone = normalizeColorCode(value);
    if (!tone) return;
    color.current = tone;
    // Leave the native picker uncontrolled so dragging is not interrupted by React writing its value back.
    if (colorInput.current && colorInput.current.value !== color.current) colorInput.current.value = color.current;
    preview({ mode: "custom", color: color.current });
  };
  const applyPreference = (next: BackgroundPreference) => {
    let saved = choose(next);
    if (saved && next.mode === "custom") {
      try {
        const current = normalizeSavedColors(JSON.parse(localStorage.getItem(recentBackgroundColorsKey) ?? "[]"));
        const recent = [next.color, ...current.filter((value) => value !== next.color)].slice(0, 4);
        localStorage.setItem(recentBackgroundColorsKey, JSON.stringify(recent));
        setRecentColors(recent);
      } catch { saved = false; }
    }
    return saved;
  };
  const changed = mode !== preference.mode || (mode === "custom" && normalizeColorCode(draft) !== preference.color);
  return <div id="background-options" className="backgroundOptions" role="dialog" aria-label="背景设置">
    <div className="backgroundOptionsHead"><h2>背景</h2>{changed && <span>预览中</span>}</div>
    <form onKeyDown={submitFormOnEnter} onSubmit={(event) => {
      event.preventDefault();
      if (mode === "custom" && !normalizeColorCode(draft)) { setMessage("请输入六位颜色值，例如 #e9eeeb"); return; }
      onSaved(applyPreference({ mode, color: color.current }));
    }}>
      <div className="backgroundModes" role="group" aria-label="背景模式">{([{ mode: "light", label: "浅色" }, { mode: "dark", label: "深色" }, { mode: "custom", label: "自定义" }] as const).map(({ mode: nextMode, label }) => <button type="button" key={nextMode} aria-pressed={mode === nextMode} onClick={() => { setMode(nextMode); setMessage(""); setColorMessage(""); preview({ mode: nextMode, color: color.current }); }}>{label}</button>)}</div>
      <label htmlFor="background-hex">自定义背景色</label>
      <div className="backgroundFields"><input ref={colorInput} type="color" aria-label="选择背景颜色" defaultValue={preference.color} onInput={(event) => updateColor(event.currentTarget.value)} /><input id="background-hex" type="text" aria-label="背景颜色值" maxLength={7} spellCheck={false} autoComplete="off" value={draft} onChange={(event) => updateColor(event.target.value)} /><button type="button" className="backgroundSaveColor" onClick={saveColor}>保存并应用</button></div>
      <label className="savedColorNameLabel">名称（可选）<input className="savedColorNameInput" aria-label="背景色名称" maxLength={80} value={colorName} placeholder="例如：夜间灰绿" onChange={(event) => setColorName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) saveColor(); } }} /></label>
      {recentColors.length > 0 && <section className="backgroundSavedSection"><h3>最近使用</h3><div className="backgroundSavedColors" role="group" aria-label="最近使用的背景色">{recentColors.map((tone) => <button key={tone} type="button" className="backgroundSwatch" style={{ backgroundColor: tone }} title={colorNames[tone] ? `${colorNames[tone]} ${tone}` : tone} aria-label={`预览最近背景色 ${tone}`} aria-pressed={mode === "custom" && draft.toLowerCase() === tone} onClick={() => { updateColor(tone); setColorName(colorNames[tone] ?? ""); }} />)}</div></section>}
      <SavedColorLibrary title="我的背景色" colors={savedColors} names={colorNames} selected={mode === "custom" ? draft : ""} chooseLabel="预览背景色" onChoose={(tone) => { updateColor(tone); setColorName(colorNames[tone] ?? ""); }} onRename={(tone, name) => { const saved = renameColor(tone, name); if (saved && tone === draft.toLowerCase()) setColorName(name); setColorMessage(saved ? "已修改颜色名称" : "浏览器暂时无法保存名称"); return saved; }} onRemove={(tone) => storeColors((current) => current.filter((value) => value !== tone), "已移除保存的颜色")} />
      {message && <p role="alert">{message}</p>}
      {colorMessage && <p role="status">{colorMessage}</p>}
      <div className="backgroundActions"><button type="button" onClick={onClose}>取消</button><button type="submit">应用</button></div>
    </form>
  </div>;
}
