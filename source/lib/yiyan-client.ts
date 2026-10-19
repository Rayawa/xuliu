import type { YiyanBook, YiyanLibraryCard } from "./yiyan-library";

export class YiyanConnectionError extends Error {
  needsLogin: boolean;
  needsReconnect: boolean;
  needsCheck: boolean;
  constructor(message: string, needsLogin = false, needsReconnect = false, needsCheck = false) { super(message); this.needsLogin = needsLogin; this.needsReconnect = needsReconnect; this.needsCheck = needsCheck; }
}
export type YiyanApiResponse = { connected?: boolean; pending?: boolean; card?: unknown; error?: string; needsLogin?: boolean; needsReconnect?: boolean; needsCheck?: boolean; retryAfter?: number; recovered?: boolean;
  books?: YiyanBook[]; defaultBookId?: string | null; cards?: YiyanLibraryCard[]; nextCursor?: string | null; book?: YiyanBook; saved?: boolean; cardId?: string };

export async function requestYiyan(path = "", body?: Record<string, string>, signal?: AbortSignal): Promise<YiyanApiResponse> {
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(`/api/yiyan${path}`, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  let data: YiyanApiResponse;
  try { data = await response.json() as YiyanApiResponse; } catch { throw new YiyanConnectionError("序流服务暂不可用，请稍后重试"); }
  if (!response.ok) throw new YiyanConnectionError(data.error || "暂时无法连接一言，请稍后再试", Boolean(data.needsLogin), Boolean(data.needsReconnect), Boolean(data.needsCheck));
  return data;
}
