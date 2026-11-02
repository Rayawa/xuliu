"use client";

import { useEffect, useState } from "react";
import { normalizeSavedColorNames, savedColorMatches, withSavedColorName, type SavedColorNames } from "@/lib/saved-colors";
import "./saved-colors.css";

export function useSavedColorNames(storageKey: string) {
  const [names, setNames] = useState<SavedColorNames>({});
  useEffect(() => {
    const restore = () => { try { setNames(normalizeSavedColorNames(JSON.parse(localStorage.getItem(storageKey) ?? "{}"))); } catch { /* Keep the visible names when storage is unavailable. */ } };
    restore();
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) restore(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  const rename = (color: string, name: string) => {
    try {
      const current = normalizeSavedColorNames(JSON.parse(localStorage.getItem(storageKey) ?? "{}"));
      const next = withSavedColorName(current, color, name);
      if (next === current) return false;
      localStorage.setItem(storageKey, JSON.stringify(next));
      setNames(next);
      return true;
    } catch { return false; }
  };
  return { names, rename };
}

export function InlineNameEditor({ label, initialName, allowEmpty = false, onSave, onCancel }: { label: string; initialName: string; allowEmpty?: boolean; onSave: (name: string) => boolean; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const save = () => {
    if (!allowEmpty && !name.trim()) { setError("请填写名称"); return; }
    if (!onSave(name.trim())) setError("名称未保存，请重试");
  };
  return <div className="savedNameEditor">
    <input autoFocus aria-label={label} value={name} maxLength={80} placeholder={allowEmpty ? "留空使用颜色值" : "填写名称"} onChange={(event) => { setName(event.target.value); setError(""); }} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) save(); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    }} />
    <div><button type="button" onClick={onCancel}>取消</button><button type="button" onClick={save}>保存名称</button></div>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function SavedColorLibrary({ title, colors, names, selected, chooseLabel, onChoose, onRename, onRemove }: {
  title: string; colors: string[]; names: SavedColorNames; selected: string; chooseLabel: string;
  onChoose: (color: string) => void; onRename: (color: string, name: string) => boolean; onRemove: (color: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  if (!colors.length) return null;
  const matches = colors.filter((color) => savedColorMatches(color, names[color], query));
  const compact = colors.length > 6 && !expanded;
  const visible = query.trim() || expanded ? matches : matches.slice(0, compact ? 12 : 6);
  return <section className={"savedColorLibrary" + (compact ? " savedLibraryCompact" : "")} aria-label={title}>
    <div className="savedLibraryHead"><h3>{title}</h3><small>{query.trim() ? `${matches.length} / ${colors.length}` : colors.length}</small></div>
    <input className="savedLibrarySearch" type="search" aria-label={"搜索" + title} placeholder="搜索名称或颜色值" value={query} onChange={(event) => { setQuery(event.target.value); setEditing(null); }} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
    <div className="savedLibraryList">
      {visible.map((color) => {
        const name = names[color] || color;
        return <div className="savedLibraryItem" key={color}>
          {editing === color ? <InlineNameEditor key={color} label="颜色名称" initialName={names[color] ?? ""} allowEmpty onCancel={() => setEditing(null)} onSave={(value) => { const saved = onRename(color, value); if (saved) setEditing(null); return saved; }} /> : <div className="savedLibraryRow">
            <button type="button" className="savedColorChoice" aria-label={`${chooseLabel} ${name}${names[color] ? ` (${color})` : ""}`} aria-pressed={selected.toLowerCase() === color} title={`${name} ${color}`} onClick={() => onChoose(color)}><i style={{ backgroundColor: color }} aria-hidden="true" /><span><strong>{name}</strong>{names[color] && <small>{color}</small>}</span></button>
            <button type="button" className="savedLibraryRename" aria-label={"修改颜色名称 " + name} onClick={() => setEditing(color)}>改名</button>
            <button type="button" className="savedLibraryRemove" aria-label={"移除保存的颜色 " + name} onClick={() => onRemove(color)}>×</button>
          </div>}
        </div>;
      })}
      {!matches.length && <p className="savedLibraryEmpty">没有匹配的颜色</p>}
    </div>
    {colors.length > 6 && <button type="button" className="savedLibraryExpand" aria-expanded={expanded} onClick={() => { setExpanded((current) => !current); setEditing(null); }}>{expanded ? "收起" : `查看全部与管理 · ${colors.length} 色`}</button>}
  </section>;
}
