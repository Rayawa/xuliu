"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { YiyanCard } from "@/lib/yiyan-card";
import type { YiyanBook, YiyanLibraryCard } from "@/lib/yiyan-library";
import { requestYiyan, YiyanConnectionError } from "@/lib/yiyan-client";

type Props = { mode: "browse" | "choose"; quote: YiyanCard | null; defaultCollected?: boolean; onClose: () => void; onReconnect: () => void; onFavorite: (cardId: string, book: YiyanBook) => void };
type Operation = { kind: "favorite" | "create"; body: Record<string, string>; book?: YiyanBook; collect?: boolean };

export default function YiyanLibrary({ mode, quote, defaultCollected = false, onClose, onReconnect, onFavorite }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), mounted = useRef(false), working = useRef(false), readController = useRef<AbortController | null>(null);
  const titleId = useId(), serial = useRef(0), operationIds = useRef(new Map<string, string>());
  const [books, setBooks] = useState<YiyanBook[]>([]), [selected, setSelected] = useState<YiyanBook | null>(null);
  const [cards, setCards] = useState<YiyanLibraryCard[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [needsReconnect, setNeedsReconnect] = useState(false);
  const [newOpen, setNewOpen] = useState(false), [name, setName] = useState(""), [visibility, setVisibility] = useState("private");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Operation | null>(null);

  const showError = (value: unknown) => {
    if (value instanceof YiyanConnectionError) { setError(value.message); setNeedsReconnect(value.needsLogin || value.needsReconnect); }
    else setError("暂时无法读取一言，请重试");
  };
  const loadBooks = async (signal?: AbortSignal) => {
    const response = await requestYiyan("?library=books", undefined, signal);
    if (!Array.isArray(response.books)) throw new Error("Invalid books");
    if (defaultCollected && response.defaultBookId) { const id = response.defaultBookId; setSaved(previous => new Set(previous).add(id)); }
    return response.books;
  };
  const refreshBooks = () => {
    if (working.current) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    const current = ++serial.current; setLoading(true); setError(""); setNeedsReconnect(false); setSelected(null); setCards([]); setCursor(null);
    void loadBooks(controller.signal).then(value => { if (mounted.current && current === serial.current) setBooks(value); })
      .catch(value => { if (mounted.current && !controller.signal.aborted && current === serial.current) showError(value); })
      .finally(() => { if (mounted.current && current === serial.current) setLoading(false); });
  };
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    mounted.current = true; dialog.current?.showModal(); refreshBooks();
    return () => { mounted.current = false; serial.current++; readController.current?.abort(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  const openBook = (book: YiyanBook, more = false) => {
    if (working.current || (more && !cursor)) return;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    const current = ++serial.current, next = more ? cursor : null;
    setSelected(book); if (!more) setCards([]); setLoading(true); setError(""); setNotice(""); setNeedsReconnect(false);
    const query = new URLSearchParams({ library: "cards", book: book.id, ...(next ? { cursor: next } : {}) });
    void requestYiyan(`?${query}`, undefined, controller.signal).then(data => {
      if (!mounted.current || current !== serial.current) return;
      if (!Array.isArray(data.cards)) throw new Error("Invalid cards");
      setCards(previous => { const all = more ? [...previous, ...data.cards!] : data.cards!; return [...new Map(all.map(card => [card.id, card])).values()]; });
      setCursor(data.nextCursor ?? null);
    }).catch(value => { if (mounted.current && !controller.signal.aborted && current === serial.current) showError(value); })
      .finally(() => { if (mounted.current && current === serial.current) setLoading(false); });
  };
  const requestId = (key: string) => { const value = operationIds.current.get(key) ?? crypto.randomUUID(); operationIds.current.set(key, value); return value; };
  const runWrite = async (action: string, callback: () => Promise<void>) => {
    if (working.current) return;
    readController.current?.abort(); serial.current++; setLoading(false);
    working.current = true; setBusy(action); setError(""); setNotice("");
    try { await callback(); } catch (value) { if (mounted.current) showError(value); }
    finally { working.current = false; if (mounted.current) setBusy(""); }
  };
  const favoriteOperation = (book: YiyanBook): Operation => ({ kind: "favorite", book, body: { action: "favorite", cardId: quote!.id, bookId: book.id, requestId: requestId(`favorite:${quote!.id}:${book.id}`) } });
  const sendOperation = async (operation: Operation, checkOnly = false) => {
    try { return await requestYiyan("", { ...operation.body, ...(checkOnly ? { checkOnly: "1" } : {}) }); }
    catch (value) { if (mounted.current && (!(value instanceof YiyanConnectionError) || value.needsCheck)) setPending(operation); throw value; }
  };
  const finishFavorite = async (operation: Operation, checkOnly = false) => {
    const result = await sendOperation(operation, checkOnly);
    if (!mounted.current) return;
    if (!quote || !result.saved || !result.book || result.cardId !== quote.id || result.book.id !== operation.book?.id) throw new Error("Invalid favorite result");
    const confirmedBook = result.book;
    setBooks(previous => previous.map(book => book.id === confirmedBook.id ? confirmedBook : book));
    setSelected(previous => previous?.id === confirmedBook.id ? confirmedBook : previous);
    setPending(null); setSaved(previous => new Set(previous).add(result.book!.id)); setNotice(`已收藏到「${result.book.name}」`); onFavorite(quote.id, result.book);
  };
  const favorite = (book: YiyanBook) => { if (quote && !pending && !saved.has(book.id)) void runWrite(book.id, () => finishFavorite(favoriteOperation(book))); };
  const finishCreate = async (operation: Operation, checkOnly = false) => {
    const result = await sendOperation(operation, checkOnly);
    if (!mounted.current) return;
    if (!result.book) throw new Error("Invalid new book");
    setPending(null); setBooks(previous => [...previous.filter(book => book.id !== result.book!.id), result.book!]); setSelected(null); setName(""); setNewOpen(false);
    setNotice(`${result.recovered ? "已确认文集" : "已新建"}「${result.book.name}」`);
    if (operation.collect && quote && !checkOnly) await finishFavorite(favoriteOperation(result.book));
  };
  const createBook = () => {
    if (pending) return;
    const trimmed = name.trim(), operation: Operation = { kind: "create", collect: mode === "choose", body: { action: "create-book", name: trimmed, visibility, requestId: requestId(`create:${trimmed}:${visibility}`) } };
    void runWrite("create", () => finishCreate(operation));
  };
  const checkResult = () => { if (pending) void runWrite("check", () => pending.kind === "favorite" ? finishFavorite(pending, true) : finishCreate(pending, true)); };

  return <dialog ref={dialog} className="yiyanLibrary" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!working.current) onClose(); }}>
    <div className="yiyanLibraryHead"><div><span>一言</span><h2 id={titleId}>{selected?.name ?? (mode === "choose" ? "收藏到文集" : "我的文集")}</h2></div><button type="button" className="iconButton" aria-label="关闭一言文集" disabled={Boolean(busy)} onClick={onClose}>×</button></div>
    {mode === "choose" && quote && <div className="yiyanChoosingQuote"><p>{quote.text.length > 200 ? `${quote.text.slice(0, 200)}…` : quote.text}</p>{quote.source && <cite>{quote.source}</cite>}</div>}
    <div className="yiyanLibraryToolbar">{selected ? <button type="button" className="softButton" disabled={Boolean(busy)} onClick={refreshBooks}>返回文集</button> : <button type="button" className="softButton" disabled={loading || Boolean(busy)} onClick={refreshBooks}>刷新文集</button>}<button type="button" className="softButton" disabled={loading || Boolean(busy) || needsReconnect || Boolean(pending)} aria-expanded={newOpen} onClick={() => setNewOpen(value => !value)}>＋ 新建文集</button></div>
    {newOpen && <form className="yiyanNewBook" onSubmit={event => { event.preventDefault(); if (!loading && !needsReconnect) createBook(); }}><label>文集名称<input value={name} maxLength={60} required onChange={event => setName(event.target.value)} disabled={Boolean(busy)} /></label><label>可见范围<select aria-label="文集可见范围" value={visibility} onChange={event => setVisibility(event.target.value)} disabled={Boolean(busy)}><option value="private">私密</option><option value="public">公开</option></select></label><button className="primaryButton" disabled={loading || needsReconnect || Boolean(busy) || !name.trim() || Boolean(pending)}>{busy === "create" ? "处理中…" : mode === "choose" ? "新建并收藏" : "新建文集"}</button></form>}
    {error && <div className="yiyanLibraryMessage" role="alert"><p>{error}</p>{needsReconnect && <button type="button" className="softButton" onClick={onReconnect}>重新连接一言</button>}{!needsReconnect && !pending && <button type="button" className="softButton" disabled={loading || Boolean(busy)} onClick={() => selected ? openBook(selected) : refreshBooks()}>重新载入</button>}</div>}
    {pending && !needsReconnect && <div className="yiyanLibraryMessage"><button type="button" className="softButton" disabled={Boolean(busy)} onClick={checkResult}>{busy === "check" ? "检查中…" : pending.kind === "create" ? "检查新建结果" : "检查收藏结果"}</button></div>}
    {notice && <p className="yiyanLibraryMessage" role="status">{notice}</p>}
    <div className="yiyanLibraryBody" aria-busy={loading}>
      {!selected && <div className="yiyanBookList">{books.map(book => <div className="yiyanBookRow" key={book.id}><button type="button" className="yiyanOpenBook" aria-label={`打开文集：${book.name}`} disabled={Boolean(busy)} onClick={() => openBook(book)}>{book.image ? <img src={book.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="yiyanBookCover">册</span>}<span><strong>{book.name}</strong><small>{book.count} 条{book.private !== null ? ` · ${book.private ? "私密" : "公开"}` : ""}</small></span></button>{mode === "choose" && <button type="button" className="softButton" disabled={Boolean(busy) || Boolean(pending) || saved.has(book.id)} onClick={() => favorite(book)}>{saved.has(book.id) ? "已收藏" : busy === book.id ? "收藏中…" : "收藏"}</button>}</div>)}</div>}
      {selected && <div className="yiyanLibraryCards">{mode === "choose" && <button type="button" className="primaryButton" disabled={Boolean(busy) || Boolean(pending) || saved.has(selected.id)} onClick={() => favorite(selected)}>{saved.has(selected.id) ? "已收藏到此文集" : busy === selected.id ? "收藏中…" : "收藏到此文集"}</button>}{cards.map(card => <article className="yiyanLibraryCard" key={card.id}>{card.image && <img src={card.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}<p>{card.text}</p>{card.source && <cite>{card.source}</cite>}{card.publishedAt && <time>{card.publishedAt.slice(0, 10)}</time>}</article>)}{cursor && <button type="button" className="softButton" disabled={loading || Boolean(busy)} onClick={() => openBook(selected, true)}>加载更多</button>}</div>}
      {loading && <p className="yiyanLibraryEmpty" role="status">载入中…</p>}{!loading && !error && (selected ? cards.length === 0 : books.length === 0) && <p className="yiyanLibraryEmpty">暂无</p>}
    </div>
  </dialog>;
}
