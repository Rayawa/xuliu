"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export default function PdfAttachment({ bytes }: { bytes: Uint8Array }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false; let destroy: (() => Promise<void>) | undefined;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const loading = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true });
        destroy = () => loading.destroy();
        const document = await loading.promise;
        if (cancelled) { await loading.destroy(); return; }
        setPdf(document);
      } catch (cause) { if (!cancelled) setError(cause instanceof Error && cause.name === "PasswordException" ? "此 PDF 已加密，请下载后使用密码打开。" : "PDF 无法显示，请检查文件是否损坏，或下载原文件查看。"); }
    })();
    return () => { cancelled = true; void destroy?.(); };
  }, [bytes]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false; let task: RenderTask | undefined;
    setRendering(true);
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        const element = canvas.current;
        if (cancelled || !element) return;
        const base = page.getViewport({ scale: 1 });
        const width = Math.min(element.parentElement?.clientWidth || 800, 1000);
        const scale = Math.min(width / base.width, 1600 / base.height, 2);
        const viewport = page.getViewport({ scale });
        const density = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.floor(viewport.width * density); element.height = Math.floor(viewport.height * density);
        element.style.width = `${viewport.width}px`; element.style.height = `${viewport.height}px`;
        task = page.render({ canvas: element, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0] });
        await task.promise;
      } catch { if (!cancelled) setError("这一页无法显示，请下载原文件查看。"); }
      finally { if (!cancelled) setRendering(false); }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, pageNumber]);
  return <div className="pdfAttachment">
    {error ? <p role="alert">{error}</p> : <>
      {!pdf && <p role="status">正在读取 PDF…</p>}
      {pdf && <div className="pdfPageControls"><button type="button" disabled={rendering || pageNumber === 1} onClick={() => setPageNumber((current) => current - 1)}>上一页</button><span>第 {pageNumber} / {pdf.numPages} 页</span><button type="button" disabled={rendering || pageNumber === pdf.numPages} onClick={() => setPageNumber((current) => current + 1)}>下一页</button></div>}
      <canvas ref={canvas} role="img" aria-label={`PDF 第 ${pageNumber} 页`} aria-busy={rendering} />
    </>}
  </div>;
}
