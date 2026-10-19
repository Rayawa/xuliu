import { yiyanImageUrl } from "./yiyan-card.ts";
import { YiyanError } from "./yiyan-service.ts";

const maxBytes = 4 * 1024 * 1024;
const types = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export async function fetchYiyanOriginalImage(source: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = yiyanImageUrl(source);
  if (!url) throw new YiyanError("无效的一言原图地址", 400);
  let upstream: Response;
  try { upstream = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" }); }
  catch { throw new YiyanError("一言原图暂时无法连接", 502); }
  const type = upstream.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  if (!upstream.ok || !types.has(type)) { await upstream.body?.cancel(); throw new YiyanError("一言原图暂不可用", 502); }
  if (Number(upstream.headers.get("content-length")) > maxBytes) { await upstream.body?.cancel(); throw new YiyanError("一言原图过大", 413); }
  const reader = upstream.body?.getReader();
  if (!reader) throw new YiyanError("一言原图内容为空", 502);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new YiyanError("一言原图过大", 413); }
      chunks.push(value);
    }
  } catch (error) { if (error instanceof YiyanError) throw error; throw new YiyanError("一言原图读取失败", 502); }
  if (!size) throw new YiyanError("一言原图内容为空", 502);
  return new Response(Buffer.concat(chunks), { headers: { "Content-Type": type, "Content-Length": String(size), "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
