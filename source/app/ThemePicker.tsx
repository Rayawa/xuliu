"use client";

import { useEffect, useRef, useState } from "react";
import { BackgroundPicker, useBackgroundAppearance } from "./BackgroundAppearance";
import { appearancePresetKey, appearancePresetMatches, appearancePresetsStorageKey, normalizeAppearancePresets, renameAppearancePreset, type AppearancePreset } from "@/lib/appearance-presets";
import { normalizeSavedColor, normalizeSavedColors, themeColorNamesKey } from "@/lib/saved-colors";
import { InlineNameEditor, SavedColorLibrary, useSavedColorNames } from "./SavedColorLibrary";
import { submitFormOnEnter } from "./form-keyboard";
import "./appearance-presets.css";

const savedThemeColorsKey = "xuliu-saved-interface-colors-v1";
const recentThemeColorsKey = "xuliu-recent-interface-colors-v1";
const normalizeColor = normalizeSavedColor;
function readColors(key: string): string[] {
  return normalizeSavedColors(JSON.parse(localStorage.getItem(key) ?? "[]"));
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
  const [colorName, setColorName] = useState("");
  const { names: colorNames, rename: renameColor } = useSavedColorNames(themeColorNamesKey);
  const [name, setName] = useState("");
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [combinationQuery, setCombinationQuery] = useState("");
  const [showAllCombinations, setShowAllCombinations] = useState(false);
  const [message, setMessage] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const restore = () => {
      try { setSavedColors(readColors(savedThemeColorsKey)); setRecentColors(readColors(recentThemeColorsKey).slice(0, 4)); } catch { /* Preserve visible colors when storage is unavailable. */ }
    };
    restore();
    const sync = (event: StorageEvent) => { if ([savedThemeColorsKey, recentThemeColorsKey, null].includes(event.key)) restore(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
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
    let current = recentColors;
    try { current = readColors(recentThemeColorsKey); } catch { /* Keep the current recent colors. */ }
    const recent = [tone, ...current.filter((value) => value !== tone)].slice(0, 4);
    setRecentColors(recent); storeColors(recentThemeColorsKey, recent); setDraft(tone); setColorName(colorNames[tone] ?? ""); setMessage("");
    const saved = onChange(tone);
    if (!saved) setMessage("已切换，浏览器暂时无法保存颜色");
    return saved;
  };
  const saveColor = () => {
    const tone = normalizeColor(draft);
    if (!tone) { setMessage("请输入六位颜色值，例如 #80674d"); return; }
    try {
      const next = [...new Set([...readColors(savedThemeColorsKey), tone])];
      localStorage.setItem(savedThemeColorsKey, JSON.stringify(next));
      setSavedColors(next);
      const named = !colorName.trim() || renameColor(tone, colorName);
      const applied = choose(tone);
      if (named && colorName.trim()) setColorName(colorName.trim());
      setMessage(!named ? "颜色已保存，名称暂时未保存，请重试" : applied ? "已保存并使用颜色" : "颜色已收藏，浏览器暂时无法保存当前主题");
    } catch { setMessage("浏览器暂时无法保存颜色，请重试"); }
  };
  const removeColor = (tone: string) => {
    try {
      const next = readColors(savedThemeColorsKey).filter((value) => value !== tone);
      localStorage.setItem(savedThemeColorsKey, JSON.stringify(next));
      setSavedColors(next);
      const recent = readColors(recentThemeColorsKey).filter((value) => value !== tone);
      if (storeColors(recentThemeColorsKey, recent)) setRecentColors(recent);
      setMessage("已移除保存的颜色");
    } catch { setMessage("浏览器暂时无法保存这次修改"); }
  };
  const saveCombination = () => {
    try {
      const current = readPresets();
      const existing = current.find((item) => appearancePresetKey(item.themeColor, item.background) === appearancePresetKey(color, background));
      if (existing) { setCombinations(current); setNaming(false); setRenaming(existing.id); setCombinationQuery(""); setShowAllCombinations(true); setMessage("这个组合已保存，可以直接改名"); return; }
      let index = 1; while (current.some((item) => item.name === "配色 " + index)) index += 1;
      const entry: AppearancePreset = { id: crypto.randomUUID(), name: name.trim() || "配色 " + index, themeColor: color, background: { ...background } };
      const next = [...current, entry]; localStorage.setItem(appearancePresetsStorageKey, JSON.stringify(next));
      setCombinations(next); setNaming(false); setCombinationQuery(""); setShowAllCombinations(true); setMessage("已保存配色组合");
    } catch { setMessage("浏览器暂时无法保存配色组合"); }
  };
  const removeCombination = (id: string) => {
    try {
      const next = readPresets().filter((item) => item.id !== id);
      localStorage.setItem(appearancePresetsStorageKey, JSON.stringify(next)); setCombinations(next); setMessage("已移除配色组合");
    } catch { setMessage("浏览器暂时无法保存这次修改"); }
  };
  const renameCombination = (id: string, nextName: string) => {
    try {
      const next = renameAppearancePreset(readPresets(), id, nextName);
      if (!next) { setMessage("组合已移除或名称无效"); return false; }
      localStorage.setItem(appearancePresetsStorageKey, JSON.stringify(next));
      setCombinations(next); setRenaming(null); setMessage("已修改组合名称"); return true;
    } catch { setMessage("浏览器暂时无法保存名称"); return false; }
  };
  const swatch = (tone: string) => <button key={tone} type="button" className={"themeSwatch " + (color.toLowerCase() === tone ? "active" : "")} style={{ background: tone }} title={colorNames[tone] ? `${colorNames[tone]} ${tone}` : tone} aria-label={"使用颜色 " + tone} aria-pressed={color.toLowerCase() === tone} onClick={() => choose(tone)} />;
  const common = [...new Set([color.toLowerCase(), ...recentColors, ...presets])].slice(0, 4);
  const filteredCombinations = combinations.filter((item) => appearancePresetMatches(item, combinationQuery));
  const visibleCombinations = combinationQuery.trim() || showAllCombinations ? filteredCombinations : filteredCombinations.slice(0, 6);
  const toggle = (panel: "theme" | "more") => { setOpen(open === panel ? null : panel); setDraft(color); setColorName(colorNames[color.toLowerCase()] ?? ""); setMessage(""); setNaming(false); setRenaming(null); };
  return <div ref={pickerRef} className="themePicker appearanceToolbar" aria-label="界面外观">
    <button ref={themeRef} type="button" className="appearanceControl" aria-label="主题色设置" aria-expanded={open === "theme"} aria-controls="theme-color-options" onClick={() => toggle("theme")}><i className="appearancePreview" style={{ backgroundColor: color }} aria-hidden="true" />主题色</button>
    <BackgroundPicker onOpen={() => { setOpen(null); setMessage(""); }} />
    <button ref={moreRef} type="button" className="appearanceControl appearanceMore" aria-label="更多外观设置" aria-expanded={open === "more"} aria-controls="appearance-more-options" onClick={() => toggle("more")}>⋯</button>
    {open === "theme" && <div id="theme-color-options" className="themeColorPanel" role="dialog" aria-label="主题色设置">
      <div className="themeColorSection"><h2>常用颜色</h2><div className="themeColorGrid" role="group" aria-label="常用颜色">{common.map(swatch)}</div></div>
      <div className="themeColorSection"><h2>更多颜色</h2><div className="themeColorGrid" role="group" aria-label="预设颜色">{presets.filter((tone) => !common.includes(tone)).map(swatch)}</div></div>
      <form className="themeCustomForm" onKeyDown={submitFormOnEnter} onSubmit={(event) => { event.preventDefault(); saveColor(); }}><h2>自定义颜色</h2><div className="themeCustomFields"><input className="themeColorInput" type="color" aria-label="自定义主题色" value={normalizeColor(draft) || color} onChange={(event) => { setDraft(event.target.value); setMessage(""); }} /><input className="themeHexInput" type="text" aria-label="自定义颜色值" placeholder="#80674d" value={draft} maxLength={7} spellCheck={false} autoComplete="off" onChange={(event) => { setDraft(event.target.value); setMessage(""); }} /><button className="themeSaveButton" type="submit">保存颜色</button></div><label className="savedColorNameLabel">名称（可选）<input className="savedColorNameInput" aria-label="主题色名称" maxLength={80} value={colorName} placeholder="例如：暖棕" onChange={(event) => setColorName(event.target.value)} /></label></form>
      <SavedColorLibrary title="我的主题色" colors={savedColors} names={colorNames} selected={color} chooseLabel="使用主题色" onChoose={choose} onRename={(tone, nextName) => { const saved = renameColor(tone, nextName); if (saved && tone === normalizeColor(draft)) setColorName(nextName); setMessage(saved ? "已修改颜色名称" : "浏览器暂时无法保存名称"); return saved; }} onRemove={removeColor} />
      {message && <p className="themeColorMessage" role="status">{message}</p>}
    </div>}
    {open === "more" && <div id="appearance-more-options" className="themeColorPanel appearanceMorePanel" role="dialog" aria-label="配色与界面设置">
      <section><h2>配色组合</h2>{combinations.length > 0 && <><input className="savedLibrarySearch" type="search" aria-label="搜索配色组合" placeholder="搜索名称或颜色值" value={combinationQuery} onChange={(event) => { setCombinationQuery(event.target.value); setRenaming(null); }} /><div className="appearancePresetList">{visibleCombinations.map((item) => <div className="appearancePresetRow" key={item.id}>{renaming === item.id ? <InlineNameEditor key={item.id} label="组合名称" initialName={item.name} onCancel={() => setRenaming(null)} onSave={(value) => renameCombination(item.id, value)} /> : <><button type="button" className="appearancePresetChoice" aria-label={"使用配色组合 " + item.name} aria-pressed={appearancePresetKey(item.themeColor, item.background) === appearancePresetKey(color, background)} title={`${item.name} · ${item.themeColor} / ${backgroundPreview(item.background)}`} onClick={() => { const themeSaved = choose(item.themeColor); const backgroundSaved = chooseBackground(item.background); setMessage(themeSaved && backgroundSaved ? "已应用配色组合" : "已应用，浏览器暂时无法保存"); }}><span className="appearancePresetDots" aria-hidden="true"><i className="appearancePreview" style={{ backgroundColor: item.themeColor }} /><i className="appearancePreview" style={{ backgroundColor: backgroundPreview(item.background) }} /></span><span>{item.name}</span></button><button type="button" className="appearancePresetRename" aria-label={"修改组合名称 " + item.name} onClick={() => { setNaming(false); setRenaming(item.id); setMessage(""); }}>改名</button><button type="button" className="appearancePresetRemove" aria-label={"移除配色组合 " + item.name} onClick={() => removeCombination(item.id)}>×</button></>}</div>)}{!filteredCombinations.length && <p className="savedLibraryEmpty">没有匹配的组合</p>}</div>{!combinationQuery.trim() && combinations.length > 6 && <button type="button" className="savedLibraryExpand" aria-expanded={showAllCombinations} onClick={() => setShowAllCombinations((current) => !current)}>{showAllCombinations ? "收起" : `查看全部 ${combinations.length} 个组合`}</button>}</>}
        {naming ? <form className="appearancePresetForm" onKeyDown={submitFormOnEnter} onSubmit={(event) => { event.preventDefault(); saveCombination(); }}><label>名称（可选）<input className="themeHexInput" aria-label="新组合名称" autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label><div><button type="button" onClick={() => setNaming(false)}>取消</button><button type="submit">保存组合</button></div></form> : <button type="button" className="softButton" onClick={() => { setName(""); setMessage(""); setRenaming(null); setNaming(true); }}>保存当前配色</button>}
      </section>
      <section className="appearanceStyle"><h2>界面风格</h2><div className="designModeTabs" role="group" aria-label="界面风格"><button type="button" className={designMode === "classic" ? "active" : ""} aria-pressed={designMode === "classic"} onClick={() => onDesignChange("classic")}>经典</button><button type="button" className={designMode === "paper" ? "active" : ""} aria-pressed={designMode === "paper"} onClick={() => onDesignChange("paper")}>纸页</button></div></section>
      {message && <p className="themeColorMessage" role="status">{message}</p>}
    </div>}
  </div>;
}
