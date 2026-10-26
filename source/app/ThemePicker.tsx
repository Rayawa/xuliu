"use client";

import { useEffect, useRef, useState } from "react";
import { BackgroundPicker, useBackgroundAppearance } from "./BackgroundAppearance";
import { appearancePresetKey, appearancePresetsStorageKey, normalizeAppearancePresets, type AppearancePreset } from "@/lib/appearance-presets";
import { submitFormOnEnter } from "./form-keyboard";
import "./appearance-presets.css";

const savedThemeColorsKey = "xuliu-saved-interface-colors-v1";
const recentThemeColorsKey = "xuliu-recent-interface-colors-v1";
const normalizeColor = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
function readColors(key: string): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? [...new Set(value.map(normalizeColor).filter(Boolean))] : []; } catch { return []; }
}
function readPresets() { return normalizeAppearancePresets(JSON.parse(localStorage.getItem(appearancePresetsStorageKey) ?? "[]")); }
const backgroundPreview = (value: AppearancePreset["background"]) => value.mode === "dark" ? "#171c20" : value.mode === "custom" ? value.color : "#f4f5f2";

export default function ThemePicker({ color, designMode, presets, onChange, onDesignChange }: {
  color: string; designMode: "classic" | "paper"; presets: string[]; onChange: (color: string) => boolean; onDesignChange: (mode: "classic" | "paper") => void;
}) {
  const { preference: background, choose: chooseBackground } = useBackgroundAppearance();
  const [open, setOpen] = useState<"theme" | "more" | null>(null);
  const [savedColors, setSavedColors] = useState<string[]>([]);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [combinations, setCombinations] = useState<AppearancePreset[]>([]);
  const [draft, setDraft] = useState(color);
  const [name, setName] = useState("");
  const [naming, setNaming] = useState(false);
  const [message, setMessage] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setSavedColors(readColors(savedThemeColorsKey).filter((tone) => !presets.includes(tone)));
    setRecentColors(readColors(recentThemeColorsKey).slice(0, 4));
  }, [presets]);
  useEffect(() => {
    const restore = () => { try { setCombinations(readPresets()); } catch { /* Leave valid in-memory preferences intact. */ } };
    restore();
    const sync = (event: StorageEvent) => { if (event.key === appearancePresetsStorageKey || event.key === null) restore(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => { if (pickerRef.current && !event.composedPath().includes(pickerRef.current)) setOpen(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(null); (open === "theme" ? themeRef : moreRef).current?.focus(); } };
    document.addEventListener("click", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("click", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  const storeColors = (key: string, colors: string[]) => { try { localStorage.setItem(key, JSON.stringify(colors)); return true; } catch { return false; } };
  const choose = (tone: string) => {
    const recent = [tone, ...recentColors.filter((value) => value !== tone)].slice(0, 4);
    setRecentColors(recent); storeColors(recentThemeColorsKey, recent); setDraft(tone); setMessage("");
    const saved = onChange(tone);
    if (!saved) setMessage("已切换，浏览器暂时无法保存颜色");
    return saved;
  };
  const saveColor = () => {
    const tone = normalizeColor(draft);
    if (!tone) { setMessage("请输入六位颜色值，例如 #80674d"); return; }
    choose(tone);
    if (presets.includes(tone) || savedColors.includes(tone)) { setMessage("这个颜色已在颜色栏中"); return; }
    const next = [...savedColors, tone]; setSavedColors(next);
    setMessage(storeColors(savedThemeColorsKey, next) ? "已保存颜色" : "颜色已添加，浏览器暂时无法保存");
  };
  const removeColor = (tone: string) => {
    const next = savedColors.filter((value) => value !== tone);
    const recent = recentColors.filter((value) => value !== tone);
    setSavedColors(next); setRecentColors(recent); storeColors(recentThemeColorsKey, recent);
    setMessage(storeColors(savedThemeColorsKey, next) ? "已移除保存的颜色" : "浏览器暂时无法保存这次修改");
  };
  const saveCombination = () => {
    try {
      const current = readPresets();
      if (current.some((item) => appearancePresetKey(item.themeColor, item.background) === appearancePresetKey(color, background))) { setMessage("这个配色组合已保存"); return; }
      let index = 1; while (current.some((item) => item.name === "配色 " + index)) index += 1;
      const entry: AppearancePreset = { id: crypto.randomUUID(), name: name.trim() || "配色 " + index, themeColor: color, background: { ...background } };
      const next = [...current, entry]; localStorage.setItem(appearancePresetsStorageKey, JSON.stringify(next));
      setCombinations(next); setNaming(false); setMessage("已保存配色组合");
    } catch { setMessage("浏览器暂时无法保存配色组合"); }
  };
  const removeCombination = (id: string) => {
    try {
      const next = readPresets().filter((item) => item.id !== id);
      localStorage.setItem(appearancePresetsStorageKey, JSON.stringify(next)); setCombinations(next); setMessage("已移除配色组合");
    } catch { setMessage("浏览器暂时无法保存这次修改"); }
  };
  const swatch = (tone: string) => <button key={tone} type="button" className={"themeSwatch " + (color.toLowerCase() === tone ? "active" : "")} style={{ background: tone }} title={tone} aria-label={"使用颜色 " + tone} aria-pressed={color.toLowerCase() === tone} onClick={() => choose(tone)} />;
  const common = [...new Set([color.toLowerCase(), ...recentColors, ...presets])].filter((tone) => !savedColors.includes(tone)).slice(0, 4);
  const toggle = (panel: "theme" | "more") => { setOpen(open === panel ? null : panel); setDraft(color); setMessage(""); setNaming(false); };
  return <div ref={pickerRef} className="themePicker appearanceToolbar" aria-label="界面外观">
    <button ref={themeRef} type="button" className="appearanceControl" aria-label="主题色设置" aria-expanded={open === "theme"} aria-controls="theme-color-options" onClick={() => toggle("theme")}><i className="appearancePreview" style={{ backgroundColor: color }} aria-hidden="true" />主题色</button>
    <BackgroundPicker onOpen={() => { setOpen(null); setMessage(""); }} />
    <button ref={moreRef} type="button" className="appearanceControl appearanceMore" aria-label="更多外观设置" aria-expanded={open === "more"} aria-controls="appearance-more-options" onClick={() => toggle("more")}>⋯</button>
    {open === "theme" && <div id="theme-color-options" className="themeColorPanel" role="dialog" aria-label="主题色设置">
      <div className="themeColorSection"><h2>常用颜色</h2><div className="themeColorGrid" role="group" aria-label="常用颜色">{common.map(swatch)}</div></div>
      <div className="themeColorSection"><h2>更多颜色</h2><div className="themeColorGrid" role="group" aria-label="预设颜色">{presets.filter((tone) => !common.includes(tone)).map(swatch)}</div></div>
      {savedColors.length > 0 && <div className="themeColorSection"><h2>我的颜色</h2><div className="themeColorGrid" role="group" aria-label="保存的颜色">{savedColors.map((tone) => <div className="themeSavedColor" key={tone}>{swatch(tone)}<button className="themeRemoveColor" type="button" title={"移除 " + tone} aria-label={"移除保存的颜色 " + tone} onClick={() => removeColor(tone)}>×</button></div>)}</div></div>}
      <form className="themeCustomForm" onKeyDown={submitFormOnEnter} onSubmit={(event) => { event.preventDefault(); saveColor(); }}><h2>自定义颜色</h2><div className="themeCustomFields"><input className="themeColorInput" type="color" aria-label="自定义主题色" value={normalizeColor(draft) || color} onChange={(event) => { setDraft(event.target.value); setMessage(""); }} /><input className="themeHexInput" type="text" aria-label="自定义颜色值" placeholder="#80674d" value={draft} maxLength={7} spellCheck={false} autoComplete="off" onChange={(event) => { setDraft(event.target.value); setMessage(""); }} /><button className="themeSaveButton" type="submit">保存颜色</button></div></form>
      {message && <p className="themeColorMessage" role="status">{message}</p>}
    </div>}
    {open === "more" && <div id="appearance-more-options" className="themeColorPanel appearanceMorePanel" role="dialog" aria-label="配色与界面设置">
      <section><h2>配色组合</h2>{combinations.length > 0 && <div className="appearancePresetList">{combinations.map((item) => <div className="appearancePresetRow" key={item.id}><button type="button" className="appearancePresetChoice" aria-label={"使用配色组合 " + item.name} aria-pressed={appearancePresetKey(item.themeColor, item.background) === appearancePresetKey(color, background)} onClick={() => { const themeSaved = choose(item.themeColor); const backgroundSaved = chooseBackground(item.background); setMessage(themeSaved && backgroundSaved ? "已应用配色组合" : "已应用，浏览器暂时无法保存"); }}><span className="appearancePresetDots" aria-hidden="true"><i className="appearancePreview" style={{ backgroundColor: item.themeColor }} /><i className="appearancePreview" style={{ backgroundColor: backgroundPreview(item.background) }} /></span><span>{item.name}</span></button><button type="button" className="appearancePresetRemove" aria-label={"移除配色组合 " + item.name} onClick={() => removeCombination(item.id)}>×</button></div>)}</div>}
        {naming ? <form className="appearancePresetForm" onKeyDown={submitFormOnEnter} onSubmit={(event) => { event.preventDefault(); saveCombination(); }}><label>名称（可选）<input className="themeHexInput" autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label><div><button type="button" onClick={() => setNaming(false)}>取消</button><button type="submit">保存组合</button></div></form> : <button type="button" className="softButton" onClick={() => { setName(""); setMessage(""); setNaming(true); }}>保存当前配色</button>}
      </section>
      <section className="appearanceStyle"><h2>界面风格</h2><div className="designModeTabs" role="group" aria-label="界面风格"><button type="button" className={designMode === "classic" ? "active" : ""} aria-pressed={designMode === "classic"} onClick={() => onDesignChange("classic")}>经典</button><button type="button" className={designMode === "paper" ? "active" : ""} aria-pressed={designMode === "paper"} onClick={() => onDesignChange("paper")}>纸页</button></div></section>
      {message && <p className="themeColorMessage" role="status">{message}</p>}
    </div>}
  </div>;
}
