"use client";

import { useState, type FormEvent } from "react";
import { MAX_COLLECTION_WEBSITES, moveCollectionWebsite, normalizeWebsiteUrl, websiteHost, type CollectionWebsite } from "@/lib/tool-collections";

type CollectionInfo = { title: string; description: string };
type CollectionData = CollectionInfo & { websites?: CollectionWebsite[] };

export function CollectionForm({ initial, onSave, onCancel }: {
  initial?: CollectionInfo;
  onSave: (value: CollectionInfo) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim()) onSave({ title: title.trim(), description: description.trim() });
  };
  return <form className="panel collectionForm" onSubmit={submit}>
    <div className="collectionFormHead"><h2>{initial ? "编辑合集" : "新建网站合集"}</h2></div>
    <label className="editField"><span>合集名称</span><input aria-label="合集名称" autoFocus required maxLength={500} value={title} placeholder="例如：北理相关网站、文献检索" onChange={(event) => setTitle(event.target.value)} /></label>
    {!initial && <div className="collectionSuggestions"><span>试试这些主题</span>{["北理相关网站", "文献检索"].map((name) => <button type="button" key={name} onClick={() => setTitle(name)}>{name}</button>)}</div>}
    <label className="editField"><span>主题说明</span><textarea aria-label="主题说明" maxLength={4000} rows={3} value={description} placeholder="主题说明" onChange={(event) => setDescription(event.target.value)} /></label>
    <div className="collectionFormActions"><button className="softButton" type="button" onClick={onCancel}>取消</button><button className="primaryButton" type="submit" disabled={!title.trim()}>{initial ? "保存合集" : "创建合集"}</button></div>
  </form>;
}

function WebsiteForm({ website, websites, onSave, onCancel }: {
  website?: CollectionWebsite;
  websites: CollectionWebsite[];
  onSave: (value: CollectionWebsite) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(website?.title ?? "");
  const [url, setUrl] = useState(website?.url ?? "");
  const [description, setDescription] = useState(website?.description ?? "");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeWebsiteUrl(url);
    if (!normalized || normalized.length > 2000) { setError("请输入有效的网站地址，例如 https://www.bit.edu.cn。"); return; }
    if (!title.trim()) { setError("请填写网站名称。"); return; }
    if (websites.some((item) => item.id !== website?.id && normalizeWebsiteUrl(item.url) === normalized)) { setError("这个网址已经在合集中，可以直接编辑已有网站。"); return; }
    if (!website && websites.length >= MAX_COLLECTION_WEBSITES) { setError(`每个合集最多保存 ${MAX_COLLECTION_WEBSITES} 个网站。`); return; }
    onSave({ id: website?.id ?? crypto.randomUUID(), title: title.trim(), url: normalized, description: description.trim() });
  };
  return <form className="collectionWebsiteForm" onSubmit={submit}>
    <h3>{website ? "编辑网站" : "添加网站"}</h3>
    <div className="collectionWebsiteFields">
      <label className="editField"><span>网站名称</span><input aria-label="网站名称" autoFocus required maxLength={500} value={title} placeholder="网站名称" onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="editField"><span>网站地址</span><input aria-label="网站地址" required inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={2000} value={url} placeholder="https://" onChange={(event) => { setUrl(event.target.value); setError(""); }} /></label>
      <label className="editField collectionWebsiteDescription"><span>用途说明</span><textarea aria-label="用途说明" maxLength={500} rows={2} value={description} placeholder="用途说明" onChange={(event) => setDescription(event.target.value)} /></label>
    </div>
    {error && <p className="collectionError" role="alert">{error}</p>}
    <div className="collectionFormActions"><button className="softButton" type="button" onClick={onCancel}>取消</button><button className="primaryButton" type="submit">{website ? "保存网站" : "加入合集"}</button></div>
  </form>;
}

export default function WebsiteCollection({ collection, readOnly, onChange }: {
  collection: CollectionData;
  readOnly: boolean;
  onChange: (update: (current: CollectionData) => CollectionData) => void;
}) {
  const [editingInfo, setEditingInfo] = useState(false);
  const [editor, setEditor] = useState<string | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const websites = collection.websites ?? [];
  const needle = query.trim().toLocaleLowerCase();
  const visible = websites.filter((website) => `${website.title} ${website.description} ${website.url}`.toLocaleLowerCase().includes(needle));
  const editedWebsite = editor && editor !== "new" ? websites.find((website) => website.id === editor) : undefined;
  const change = (update: (current: CollectionData) => CollectionData) => { if (!readOnly) onChange(update); };
  const saveWebsite = (website: CollectionWebsite) => {
    change((current) => ({ ...current, websites: editor === "new" ? [...(current.websites ?? []), website] : (current.websites ?? []).map((item) => item.id === website.id ? website : item) }));
    setQuery("");
    setEditor(null);
    setNotice(editor === "new" ? "网站已加入合集。" : "网站已更新。");
  };
  const move = (website: CollectionWebsite, direction: -1 | 1) => {
    change((current) => ({ ...current, websites: moveCollectionWebsite(current.websites ?? [], website.id, direction) }));
    setNotice(`已${direction === -1 ? "上移" : "下移"}“${website.title}”。`);
  };

  return <div className="websiteCollection">
    {editingInfo && !readOnly ? <CollectionForm initial={collection} onCancel={() => setEditingInfo(false)} onSave={(value) => { change((current) => ({ ...current, ...value })); setEditingInfo(false); }} /> : <section className="panel collectionSummary">
      <div className="collectionSummaryMark" aria-hidden="true">集</div><div className="collectionSummaryText"><span className="eyebrow">主题说明</span>{collection.description && <p>{collection.description}</p>}<span className="collectionCount">{websites.length} 个网站</span></div>
      {!readOnly && <button className="softButton" onClick={() => setEditingInfo(true)}>编辑合集</button>}
    </section>}
    <section className="panel collectionDirectory">
      <div className="collectionDirectoryHead"><div><h2>合集网站</h2></div>{!readOnly && <button className="primaryButton" disabled={websites.length >= MAX_COLLECTION_WEBSITES || editor !== null} onClick={() => { setEditor("new"); setPendingRemoval(null); }}>＋ 添加网站</button>}</div>
      {editor && !readOnly && (editor === "new" || editedWebsite) && <WebsiteForm key={editor} website={editedWebsite} websites={websites} onSave={saveWebsite} onCancel={() => setEditor(null)} />}
      {websites.length > 0 && <label className="collectionSearch"><span>查找网站</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、用途或网址" /></label>}
      <p className="collectionNotice" role="status">{notice}</p>
      {websites.length === 0 ? <div className="collectionEmpty"><span aria-hidden="true">↗</span><h3>暂无网站</h3></div> : visible.length === 0 ? <div className="collectionEmpty"><h3>没有找到相关网站</h3><button className="softButton" onClick={() => setQuery("")}>清除搜索</button></div> : <ol className="collectionWebsiteList">{visible.map((website) => {
        const index = websites.findIndex((item) => item.id === website.id);
        const href = normalizeWebsiteUrl(website.url);
        return <li className="collectionWebsiteRow" key={website.id}>
          <div className="collectionWebsiteNumber" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
          <div className="collectionWebsiteContent"><h3>{website.title}</h3>{website.description && <p>{website.description}</p>}<span className="collectionWebsiteHost" title={website.url}>{websiteHost(website.url)}</span></div>
          <div className="collectionWebsiteActions">{href && <a className="collectionOpenLink" href={href} target="_blank" rel="noopener noreferrer" aria-label={`打开${website.title}（新标签页）`}>打开网站 ↗</a>}{!readOnly && <div className="collectionManageActions"><button disabled={editor !== null} onClick={() => { setEditor(website.id); setPendingRemoval(null); }}>编辑<span className="srOnly">{website.title}</span></button><button aria-label={`上移${website.title}`} disabled={index === 0 || Boolean(needle) || editor !== null} title={needle ? "清除搜索后调整顺序" : "上移"} onClick={() => move(website, -1)}>↑</button><button aria-label={`下移${website.title}`} disabled={index === websites.length - 1 || Boolean(needle) || editor !== null} title={needle ? "清除搜索后调整顺序" : "下移"} onClick={() => move(website, 1)}>↓</button><button className="dangerText" aria-label={`移除${website.title}`} disabled={editor !== null} onClick={() => setPendingRemoval(website.id)}>移除</button></div>}</div>
          {pendingRemoval === website.id && !readOnly && <div className="collectionRemoveConfirm"><p>从合集中移除“{website.title}”？</p><button className="softButton" onClick={() => setPendingRemoval(null)}>取消</button><button className="dangerButton" onClick={() => { change((current) => ({ ...current, websites: (current.websites ?? []).filter((item) => item.id !== website.id) })); setPendingRemoval(null); setNotice(`已移除“${website.title}”。`); }}>确认移除</button></div>}
        </li>;
      })}</ol>}
    </section>
  </div>;
}
