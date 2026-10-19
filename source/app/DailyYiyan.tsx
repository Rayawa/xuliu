"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { defaultYiyanImageClarity, parseYiyanCard, readYiyanCache, readYiyanImageClarity, saveYiyanCache, saveYiyanImageClarity, type YiyanCard } from "@/lib/yiyan-card";
import type { YiyanBook } from "@/lib/yiyan-library";
import { requestYiyan, YiyanConnectionError as ConnectionError } from "@/lib/yiyan-client";
import YiyanLibrary from "./YiyanLibrary";
import YiyanBackdrop from "./YiyanBackdrop";
import { prefetchYiyanImage, type YiyanImageStatus } from "@/lib/yiyan-image";
function storage() { try { return window.localStorage; } catch { return undefined; } }

export default function DailyYiyan() {
  const [quote, setQuote] = useState<YiyanCard | null>(null);
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [imageStatus, setImageStatus] = useState<YiyanImageStatus>("loading");
  const [imageRetry, setImageRetry] = useState(0);
  const [prefetchVersion, setPrefetchVersion] = useState(0);
  const [refreshCooling, setRefreshCooling] = useState(false);
  const [imageClarity, setImageClarity] = useState(defaultYiyanImageClarity);
  const [libraryMode, setLibraryMode] = useState<"browse" | "choose" | null>(null);
  const [defaultSaved, setDefaultSaved] = useState<Set<string>>(new Set());
  const [pendingFavorite, setPendingFavorite] = useState<Record<string, string> | null>(null);
  const favoriteRequests = useRef(new Map<string, string>()), keepQuoteAfterLogin = useRef(false);
  const mounted = useRef(false), working = useRef(false), generation = useRef(0);
  const refreshUnlock = useRef<number | undefined>(undefined);
  const initialRequest = useRef<ReturnType<typeof requestYiyan> | null>(null);
  const nextCard = useRef<{ forId: string; promise: Promise<YiyanCard | null> } | null>(null);
  const prefetchController = useRef<AbortController | null>(null);
  const lastCardRequest = useRef(0);
  const fetchCard = async (exclude: string, signal?: AbortSignal) => {
    const delay = Math.max(0, lastCardRequest.current + 2100 - Date.now());
    if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
    if (signal?.aborted || !mounted.current) return null;
    lastCardRequest.current = Date.now();
    const data = await requestYiyan(exclude ? `?exclude=${exclude}` : "", undefined, signal);
    return parseYiyanCard(data.card);
  };
  const coolRefresh = () => {
    window.clearTimeout(refreshUnlock.current); setRefreshCooling(true);
    refreshUnlock.current = window.setTimeout(() => { if (mounted.current) setRefreshCooling(false); }, 2100);
  };
  const keepCard = (value: unknown) => {
    const card = parseYiyanCard(value);
    if (!card) throw new Error("一言暂未返回有效图文");
    saveYiyanCache(card, storage()); setQuote(card); setExpanded(false); setImageStatus("loading");
    coolRefresh();
    return card;
  };
  const showError = (error: unknown) => {
    if (error instanceof ConnectionError && error.needsLogin) { setConnected(false); setLoginOpen(true); }
    if (error instanceof ConnectionError && error.needsReconnect) { keepQuoteAfterLogin.current = true; setLoginOpen(true); }
    setNotice(error instanceof ConnectionError ? error.message : "暂时无法连接一言，请稍后再试");
  };
  useEffect(() => {
    mounted.current = true; let active = true;
    const cached = readYiyanCache(storage());
    setImageClarity(readYiyanImageClarity(storage()));
    if (cached) setQuote(cached);
    const current = generation.current;
    initialRequest.current ??= requestYiyan(cached ? "?status=1" : "");
    void initialRequest.current.then(data => {
      if (!active || current !== generation.current) return;
      setConnected(Boolean(data.connected)); setCodeSent(Boolean(data.pending));
      if (data.pending) { setLoginOpen(true); setRemaining(data.retryAfter ?? 0); }
      if (data.card) { const card = parseYiyanCard(data.card); if (card) { lastCardRequest.current = Date.now(); setQuote(card); saveYiyanCache(card, storage()); coolRefresh(); } }
    }).catch(error => {
      if (!active || current !== generation.current) return;
      if (error instanceof ConnectionError && error.needsLogin) { setConnected(false); }
      else setNotice("暂时无法连接一言，请稍后再试");
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; mounted.current = false; window.clearTimeout(refreshUnlock.current); };
  }, []);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  const quoteId = quote?.id ?? "";
  useEffect(() => {
    if (!connected || !quoteId || loginOpen || libraryMode) return;
    const controller = new AbortController(); let active = true;
    prefetchController.current = controller;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "hidden" || working.current) return;
      const promise = fetchCard(quoteId, controller.signal).then(card => {
        if (!active || !card || card.id === quoteId) return null;
        if (card.image) prefetchYiyanImage(card.image, controller.signal);
        return card;
      }).catch(() => null);
      nextCard.current = { forId: quoteId, promise };
    }, 2200);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); if (prefetchController.current === controller) prefetchController.current = null; if (nextCard.current?.forId === quoteId) nextCard.current = null; };
  }, [connected, quoteId, loginOpen, libraryMode, prefetchVersion]);

  const run = async (action: string, callback: () => Promise<void>) => {
    if (working.current) return;
    if (action !== "refresh") { prefetchController.current?.abort(); nextCard.current = null; }
    working.current = true; generation.current++; setBusy(action); setNotice("");
    try { await callback(); }
    catch (error) { if (mounted.current) showError(error); }
    finally {
      working.current = false;
      if (mounted.current) { setBusy(""); if (action !== "refresh") setPrefetchVersion(value => value + 1); }
    }
  };
  const changeQuote = () => {
    if (!connected) { setLoginOpen(true); return; }
    void run("refresh", async () => {
      const prepared = nextCard.current?.forId === quoteId ? nextCard.current.promise : null;
      const value = prepared ? await prepared : null;
      const card = value ?? await fetchCard(quoteId);
      if (!mounted.current) return;
      const kept = keepCard(card);
      if (kept.id === quote?.id) setNotice("暂未换到新句子");
    });
  };
  const sendCode = () => void run("send", async () => {
    await requestYiyan("", { action: "send-code", phone: phone.trim() });
    if (mounted.current) { setCodeSent(true); setRemaining(60); setNotice("验证码已发送"); }
  });
  const signIn = () => {
    const currentCode = code.trim(); setCode("");
    void run("sign-in", async () => {
      await requestYiyan("", { action: "sign-in", phone: phone.trim(), code: currentCode });
      if (!mounted.current) return;
      setConnected(true); setPhone(""); setCodeSent(false); setLoginOpen(false); setSettingsOpen(false);
      setDefaultSaved(new Set()); setPendingFavorite(null); setLibraryMode(null); favoriteRequests.current.clear();
      if (keepQuoteAfterLogin.current) { keepQuoteAfterLogin.current = false; setNotice("已连接，可继续收藏或打开文集"); return; }
      const card = await fetchCard(quoteId);
      if (mounted.current) keepCard(card);
    });
  };
  const disconnect = () => void run("disconnect", async () => {
    await requestYiyan("", { action: "disconnect" });
    if (mounted.current) { setConnected(false); setLoginOpen(false); setSettingsOpen(false); setLibraryMode(null); setDefaultSaved(new Set()); setPendingFavorite(null); favoriteRequests.current.clear(); setPhone(""); setCode(""); setCodeSent(false); setNotice("已断开一言"); }
  });
  const favoriteDone = (cardId: string, book: YiyanBook) => { if (book.name === "默认文集") setDefaultSaved(previous => new Set(previous).add(cardId)); };
  const openLibrary = (mode: "browse" | "choose") => { if (!connected) { keepQuoteAfterLogin.current = true; setLoginOpen(true); return; } setSettingsOpen(false); setLibraryMode(mode); };
  const favorite = (checkOnly = false) => {
    if (checkOnly ? !pendingFavorite : !quote || defaultSaved.has(quote.id)) return;
    if (!connected) { keepQuoteAfterLogin.current = true; setLoginOpen(true); return; }
    void run("favorite", async () => {
      const requestId = favoriteRequests.current.get(quoteId) ?? crypto.randomUUID(); favoriteRequests.current.set(quoteId, requestId);
      const body = checkOnly ? pendingFavorite! : { action: "favorite", cardId: quoteId, bookId: "", requestId };
      let data;
      try { data = await requestYiyan("", { ...body, ...(checkOnly ? { checkOnly: "1" } : {}) }); }
      catch (error) { if (!(error instanceof ConnectionError) || error.needsCheck) setPendingFavorite(body); throw error; }
      if (!mounted.current) return;
      if (!data.saved || data.cardId !== body.cardId || !data.book) throw new Error("Invalid favorite result");
      setPendingFavorite(null); favoriteDone(body.cardId, data.book); setNotice(`已收藏到「${data.book.name}」`);
    });
  };
  const image = quote?.image && imageStatus !== "error" ? quote.image : "";
  const date = quote?.publishedAt.slice(0, 10);
  const canExpand = quote ? quote.text.length > 160 || quote.text.split("\n").length > 6 : false;
  const softness = (100 - imageClarity) / 100;
  const imageStyle = { "--quote-image-blur": `${softness * 6}px`, "--quote-image-wash-start": `${30 + softness * 64}%`, "--quote-image-wash-end": `${50 + softness * 46}%` } as CSSProperties;
  return <section className={`sidebarQuote${image ? " sidebarQuoteWithImage" : ""}`} aria-label="一言图文" style={imageStyle}>
    {/* The provider returns public images; no account credentials are sent to the image host. */}
    {quote?.image && <YiyanBackdrop key={`${quote.image}:${imageRetry}`} source={quote.image} onStatus={setImageStatus} />}
    <header><a href="https://app.yiyan.art/" target="_blank" rel="noopener noreferrer">一言</a><div className="sidebarQuoteControls">
      {date && <time dateTime={date}>{date.slice(5).replace("-", "/")}</time>}
      {quote && <button type="button" className="quoteFavoriteButton" aria-label={defaultSaved.has(quote.id) ? "已收藏到默认文集" : "收藏到默认文集"} title={defaultSaved.has(quote.id) ? "已收藏" : "收藏到默认文集"} aria-pressed={defaultSaved.has(quote.id)} disabled={Boolean(busy) || checking || defaultSaved.has(quote.id) || pendingFavorite?.cardId === quote.id} onClick={() => favorite()}><svg viewBox="0 0 24 24" fill={defaultSaved.has(quote.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z" /></svg></button>}
      {(quote || connected) && <button type="button" className="quoteRefreshButton" aria-label="换一句一言" title="换一句" aria-busy={busy === "refresh"} disabled={Boolean(busy) || checking || refreshCooling} onClick={changeQuote}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10a8 8 0 1 0-2.4 7.6M20 4v6h-6" /></svg></button>}
      <button type="button" className="quoteSettingsButton" aria-label="一言连接设置" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(value => !value)}>⋯</button>
    </div></header>
    {quote && <><blockquote className={canExpand && !expanded ? "quoteCollapsed" : ""} aria-live="polite">{quote.text}</blockquote>{canExpand && <button type="button" className="quoteTextButton" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "收起" : "展开"}</button>}{quote.source && <footer className="sidebarQuoteSource"><cite>{quote.source}</cite></footer>}</>}
    {settingsOpen && <div className="quoteConnectionActions"><button type="button" className="quoteTextButton" disabled={!quote || Boolean(busy)} onClick={() => openLibrary("choose")}>收藏到其他文集</button><button type="button" className="quoteTextButton" disabled={Boolean(busy)} onClick={() => openLibrary("browse")}>打开文集</button><label className="quoteImageClarity">配图清晰度 <output>{imageClarity}%</output><input type="range" min="0" max="100" step="5" aria-label="配图清晰度" value={imageClarity} onChange={event => { const value = Number(event.target.value); setImageClarity(value); saveYiyanImageClarity(value, storage()); }} /></label><button type="button" className="quoteTextButton" disabled={Boolean(busy)} onClick={() => { setLoginOpen(true); setSettingsOpen(false); }}>{connected ? "切换一言账号" : "连接一言"}</button>{connected && <button type="button" className="quoteTextButton" disabled={Boolean(busy)} onClick={disconnect}>断开一言</button>}</div>}
    {settingsOpen && quote && (!quote.image || imageStatus !== "ready") && <div className="quoteConnectionActions" role="status"><span>{!quote.image ? "暂未取得原图" : imageStatus === "error" ? "原图加载失败" : "原图加载中…"}</span>{quote.image && imageStatus === "error" && <button type="button" className="quoteTextButton" onClick={() => { setImageStatus("loading"); setImageRetry(value => value + 1); }}>重试原图</button>}</div>}
    {!quote && !connected && !checking && !loginOpen && !settingsOpen && <button type="button" className="quoteConnectButton" onClick={() => setLoginOpen(true)}>连接一言</button>}
    {loginOpen && <form className="quoteLogin" onSubmit={event => { event.preventDefault(); if (codeSent) signIn(); else sendCode(); }}>
      <label>手机号<input type="tel" autoComplete="off" inputMode="tel" maxLength={11} value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, ""))} required pattern="1[3-9][0-9]{9}" /></label>
      {codeSent && <label>验证码<input autoComplete="one-time-code" inputMode="numeric" value={code} maxLength={8} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} required pattern="[0-9]{4,8}" /></label>}
      <button type="submit" className="quoteConnectButton" disabled={Boolean(busy)}>{busy === "sign-in" ? "正在连接…" : busy === "send" ? "正在发送…" : codeSent ? "连接" : "获取验证码"}</button>
      {codeSent && <button type="button" className="quoteTextButton" disabled={Boolean(busy) || remaining > 0} onClick={sendCode}>{remaining > 0 ? `${remaining} 秒后可重发` : "重新发送"}</button>}
      <button type="button" className="quoteTextButton" disabled={Boolean(busy)} onClick={() => { setLoginOpen(false); setPhone(""); setCode(""); }}>取消</button>
    </form>}
    {notice && <p className="sidebarQuoteNotice" role="status">{notice}</p>}
    {pendingFavorite && <button type="button" className="quoteTextButton" disabled={Boolean(busy)} onClick={() => favorite(true)}>检查收藏结果</button>}
    {libraryMode && <YiyanLibrary mode={libraryMode} quote={quote} defaultCollected={Boolean(quote && defaultSaved.has(quote.id))} onClose={() => setLibraryMode(null)} onFavorite={favoriteDone} onReconnect={() => { setLibraryMode(null); keepQuoteAfterLogin.current = true; setLoginOpen(true); }} />}
  </section>;
}
