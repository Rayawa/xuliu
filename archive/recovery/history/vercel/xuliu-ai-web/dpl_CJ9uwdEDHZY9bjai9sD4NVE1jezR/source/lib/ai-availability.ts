export type WorkspaceSyncState = "saving" | "cloud" | "readonly" | "error" | "preview";

export function aiDisabledReasonForSync(preview: boolean, sync: WorkspaceSyncState) {
  if (preview) return "正式登录并配置 DeepSeek API Key 后即可使用；当前预览不会发送数据。";
  if (sync === "saving") return "正在保存刚才的修改，保存完成后即可使用 AI。";
  if (sync === "error") return "云端连接异常，请刷新页面恢复同步后再使用 AI。";
  return undefined;
}
