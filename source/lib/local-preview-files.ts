import type { NodeAttachment } from "./course-node-attachments.ts";

// Deliberately separate from private cloud storage. Local trial files live for this page session.
const files = new Map<string, File>();
export function saveLocalPreviewFile(file: File): NodeAttachment {
  const id = crypto.randomUUID(); const url = `local-preview:${id}`;
  files.set(url, file);
  return { id, url, fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream", uploadedAt: new Date().toISOString() };
}
export function localPreviewFile(url: string) {
  if (!url.startsWith("local-preview:")) return undefined;
  const file = files.get(url);
  if (!file) throw new Error("这份本地试用文件已失效，请重新选择。正式网站的文件会保存到云端。");
  return file;
}
export function downloadLocalPreviewFile(url: string) {
  const file = localPreviewFile(url); if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = file.name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
