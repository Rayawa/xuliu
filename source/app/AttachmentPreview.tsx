"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { attachmentUrl, type NodeAttachment } from "@/lib/course-node-attachments";
import { MAX_PREVIEW_BYTES, officeXmlFiles, previewKind, readPreviewBytes } from "@/lib/attachment-preview";
import { localPreviewFile } from "@/lib/local-preview-files";

const PdfAttachment = dynamic(() => import("./PdfAttachment"), { ssr: false });
type Preview = { url?: string; pdfBytes?: Uint8Array; text?: string; pages?: string[][]; sheets?: { name: string; rows: string[][] }[]; error?: string };

export default function AttachmentPreview({ file, localFile, onClose }: { file: NodeAttachment; localFile?: File; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sheet, setSheet] = useState(0);
  const [localDownloadUrl, setLocalDownloadUrl] = useState("");
  const kind = previewKind(file);
  useEffect(() => {
    const element = dialog.current; element?.showModal();
    return () => { element?.close(); };
  }, []);
  useEffect(() => {
    let source: File | undefined;
    try { source = localFile ?? localPreviewFile(file.url); } catch { return; }
    if (!source) return;
    const url = URL.createObjectURL(source); setLocalDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file.url, localFile]);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = "";
    const load = async () => {
      if (kind === "unsupported") { setPreview({ error: "此格式暂不支持页面内预览。可以点击下载，使用对应软件打开。" }); return; }
      if (file.fileSize > MAX_PREVIEW_BYTES) { setPreview({ error: "超过 25 MB 的文件请下载后查看。" }); return; }
      try {
        const source = localFile ?? localPreviewFile(file.url);
        const response = source ? new Response(source) : await fetch(attachmentUrl(file), { signal: controller.signal });
        const bytes = await readPreviewBytes(response);
        let next: Preview;
        if (kind === "pdf") {
          next = { pdfBytes: bytes };
        } else if (kind === "image") {
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: /^image\/(jpeg|png|gif|webp)$/i.test(file.mimeType) ? file.mimeType : "application/octet-stream" }));
          next = { url: objectUrl };
        } else if (kind === "text") {
          const text = new TextDecoder().decode(bytes);
          next = { text: text.slice(0, 300_000) + (text.length > 300_000 ? "\n\n（预览已截断，请下载查看完整内容）" : "") };
        } else {
          const xmlFiles = await officeXmlFiles(bytes, kind);
          if (kind === "xlsx") {
            const { default: readXlsx } = await import("read-excel-file/browser");
            const result = await readXlsx(bytes.buffer);
            next = { sheets: result.slice(0, 30).map((item) => ({ name: item.sheet, rows: item.data.slice(0, 500).map((row) => row.slice(0, 30).map((cell) => cell instanceof Date ? cell.toLocaleDateString("zh-CN") : String(cell ?? ""))) })) };
          } else {
            next = { pages: xmlFiles.slice(0, 200).map(({ xml }) => {
              const doc = new DOMParser().parseFromString(xml, "application/xml");
              if (doc.getElementsByTagName("parsererror").length) throw new Error("文档无法解析，请检查文件是否损坏。");
              // Render only plain text. Never execute document markup, macros or external resources.
              return Array.from(doc.getElementsByTagNameNS("*", "p")).slice(0, 5000).map((p) => Array.from(p.getElementsByTagNameNS("*", "t")).map((t) => t.textContent ?? "").join(""));
            }) };
            if (!next.pages?.length) throw new Error("未找到可预览的正文，请下载查看原文件。");
          }
        }
        if (!controller.signal.aborted) setPreview(next);
      } catch (cause) {
        if (!controller.signal.aborted) setPreview({ error: cause instanceof Error ? cause.message : "预览失败，请稍后重试。" });
      } finally { if (controller.signal.aborted && objectUrl) URL.revokeObjectURL(objectUrl); }
    };
    void load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file, localFile, kind]);

  return <dialog ref={dialog} className="attachmentPreview" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><div><h3 id={titleId}>{file.fileName}</h3><span>{localFile ? "上传前预览" : "附件预览"}</span></div><a href={localDownloadUrl || attachmentUrl(file, true)} download={localDownloadUrl ? file.fileName : undefined}>下载原文件</a><button type="button" autoFocus aria-label="关闭预览" onClick={onClose}>关闭</button></header>
    <div className="attachmentPreviewBody" aria-busy={!preview}>
      {!preview && <p role="status">正在读取文件…</p>}
      {preview?.error && <p role="alert">{preview.error}</p>}
      {preview?.url && kind === "image" && <img className="attachmentPreviewImage" src={preview.url} alt={file.fileName} onError={() => setPreview({ error: "图片无法显示，请检查文件是否损坏或下载查看。" })} />}
      {preview?.pdfBytes && <PdfAttachment bytes={preview.pdfBytes} />}
      {preview?.text !== undefined && <pre>{preview.text || "（空文件）"}</pre>}
      {preview?.pages && <><p className="nodeHelp">正文预览 · 复杂排版、图片和批注请查看原文件。</p>{preview.pages.map((paragraphs, i) => <article className="attachmentDocumentPage" key={i}>{kind === "pptx" && <h4>第 {i + 1} 页</h4>}{paragraphs.map((text, j) => <p key={j}>{text || "\u00a0"}</p>)}</article>)}</>}
      {preview?.sheets && <><p className="nodeHelp">单个工作表最多预览前 500 行、30 列；显示单元格内容，完整格式请查看原文件。</p><label className="attachmentSheetSelect">工作表<select value={sheet} onChange={(event) => setSheet(Number(event.target.value))}>{preview.sheets.map((item, i) => <option key={i} value={i}>{item.name}</option>)}</select></label><div className="attachmentSheet"><table><tbody>{preview.sheets[sheet]?.rows.map((row, i) => <tr key={i}><th scope="row">{i + 1}</th>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div></>}
    </div>
  </dialog>;
}
