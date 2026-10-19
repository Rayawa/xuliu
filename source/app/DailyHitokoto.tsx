"use client";

import { useEffect, useRef, useState } from "react";
import { loadDailyHitokoto, type DailyHitokoto as DailyQuote } from "@/lib/daily-hitokoto";
import { localDateKey } from "@/lib/finance";

export default function DailyHitokoto() {
  const [quote, setQuote] = useState<DailyQuote | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef<{ date: string; promise: Promise<DailyQuote | null> } | null>(null);
  const mounted = useRef(false);
  const refreshLocked = useRef(false);
  const cooldown = useRef<number | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const refresh = () => {
      const date = localDateKey();
      if (request.current?.date !== date) {
        let storage: Storage | undefined;
        try { storage = window.localStorage; } catch { /* The quote can still load without browser storage. */ }
        request.current = { date, promise: loadDailyHitokoto(date, storage) };
      }
      const currentRequest = request.current;
      void currentRequest.promise.then((next) => {
        if (active && request.current === currentRequest) setQuote(next);
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => { active = false; mounted.current = false; window.clearTimeout(cooldown.current); window.removeEventListener("focus", refresh); window.clearInterval(interval); };
  }, []);
  const changeQuote = async () => {
    if (!quote || refreshLocked.current) return;
    refreshLocked.current = true;
    setRefreshing(true);
    setNotice("");
    const started = Date.now();
    const date = localDateKey();
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Refresh still works without browser storage. */ }
    const fetched = loadDailyHitokoto(date, storage, fetch, { refresh: true });
    const currentRequest = { date, promise: fetched.then((next) => next ?? quote) };
    request.current = currentRequest;
    const next = await fetched;
    if (!mounted.current) return;
    if (request.current === currentRequest) {
      if (next) setQuote(next);
      if (!next) setNotice("暂时无法获取，请稍后再试");
      else if (next.text === quote.text) setNotice("暂未换到新句子");
    }
    cooldown.current = window.setTimeout(() => {
      refreshLocked.current = false;
      if (mounted.current) setRefreshing(false);
    }, Math.max(0, 2000 - (Date.now() - started)));
  };
  if (!quote) return null;
  return <section className="sidebarQuote" aria-label="每日一言">
    <header><a href={quote.uuid ? `https://hitokoto.cn?uuid=${quote.uuid}` : "https://hitokoto.cn"} target="_blank" rel="noopener noreferrer">一言</a><div className="sidebarQuoteControls"><time dateTime={quote.date}>{quote.date.slice(5).replace("-", "/")}</time><button type="button" className="quoteRefreshButton" aria-label="换一句一言" title="换一句" aria-busy={refreshing} disabled={refreshing} onClick={() => void changeQuote()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10a8 8 0 1 0-2.4 7.6M20 4v6h-6" /></svg></button></div></header>
    <blockquote aria-live="polite">{quote.text}</blockquote>
    {(quote.author || quote.source) && <footer className="sidebarQuoteSource">{quote.author && <cite>{quote.author}</cite>}{quote.source && quote.source !== quote.author && <span>{quote.source}</span>}</footer>}
    {notice && <p className="sidebarQuoteNotice" role="status">{notice}</p>}
  </section>;
}
