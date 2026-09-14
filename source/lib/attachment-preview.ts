import type { NodeAttachment } from "./course-node-attachments.ts";

export const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;
export function previewKind(file: Pick<NodeAttachment, "fileName" | "mimeType">) {
  const ext = file.fileName.split(".").pop()?.toLowerCase();
  if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimeType) || /^(jpe?g|png|webp|gif)$/.test(ext ?? "")) return "image";
  if (ext === "pdf" || file.mimeType === "application/pdf") return "pdf";
  if (ext === "docx" || ext === "xlsx" || ext === "pptx") return ext;
  if (/^(txt|md|csv|json|log)$/.test(ext ?? "") || /^text\/(plain|markdown|csv)/i.test(file.mimeType)) return "text";
  return "unsupported";
}

export async function readPreviewBytes(response: Response) {
  if (!response.ok) throw new Error(response.status === 401 ? "登录已过期，请重新登录后预览。" : "文件暂时无法读取，请稍后重试。");
  if (Number(response.headers.get("content-length")) > MAX_PREVIEW_BYTES) throw new Error("这个文件较大，请使用下载按钮查看原文件。");
  if (!response.body) throw new Error("文件内容为空。");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_PREVIEW_BYTES) { await reader.cancel(); throw new Error("这个文件较大，请使用下载按钮查看原文件。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

// Inspect every archive entry before expansion, including entries that won't be rendered.
export async function officeXmlFiles(bytes: Uint8Array, kind: "docx" | "xlsx" | "pptx") {
  const { unzipSync } = await import("fflate");
  let expanded = 0; let entries = 0;
  const files = unzipSync(bytes, { filter: (entry) => {
    expanded += entry.originalSize; entries++;
    if (expanded > 30 * 1024 * 1024 || entry.originalSize > 10 * 1024 * 1024 || entries > 2500) throw new Error("文档内容较大，请下载原文件查看。");
    return kind === "docx" ? entry.name === "word/document.xml" : kind === "pptx" ? /^ppt\/slides\/slide\d+\.xml$/.test(entry.name) : false;
  } });
  return Object.entries(files).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([name, data]) => ({ name, xml: new TextDecoder().decode(data) }));
}
