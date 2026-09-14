export type NodeAttachment = {
  id: string; url: string; fileName: string; fileSize: number; mimeType: string; uploadedAt: string;
};

export const MAX_NODE_FILES = 50;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function attachmentUrl(file: Pick<NodeAttachment, "url" | "fileName">, download = false) {
  const params = new URLSearchParams({ url: file.url, name: file.fileName });
  if (download) params.set("download", "1");
  return `/api/files?${params}`;
}

// Stop at the first failure. Successfully uploaded files stay attached; retry only the remainder.
export async function uploadNodeFileBatch(
  files: readonly File[], existingCount: number,
  upload: (file: File) => Promise<NodeAttachment>,
  onSaved: (attachment: NodeAttachment, remaining: File[]) => void,
) {
  if (existingCount + files.length > MAX_NODE_FILES) throw new Error(`每个附件区域最多保存 ${MAX_NODE_FILES} 个文件。`);
  if (files.some((file) => file.size > MAX_FILE_BYTES)) throw new Error("单个文件不能超过 50 MB，请移除超大的文件后重试。");
  for (let i = 0; i < files.length; i++) {
    const attachment = await upload(files[i]);
    onSaved(attachment, files.slice(i + 1));
  }
}
