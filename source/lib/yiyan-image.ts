import { yiyanImageUrl } from "./yiyan-card.ts";

export type YiyanImageStatus = "loading" | "ready" | "error";
export const yiyanDirectImageTimeout = 3500;
export const yiyanProxyImageTimeout = 10000;

export function yiyanImageProxyPath(source: string): string {
  const url = yiyanImageUrl(source);
  return url ? `/api/yiyan/image?src=${encodeURIComponent(url)}` : "";
}

export function prefetchYiyanImage(source: string, signal: AbortSignal): void {
  if (signal.aborted || !yiyanImageUrl(source)) return;
  const image = new window.Image(); image.referrerPolicy = "no-referrer";
  let original = false, finished = false, timer: ReturnType<typeof setTimeout>;
  const finish = () => {
    finished = true; clearTimeout(timer); image.onload = null; image.onerror = null; signal.removeEventListener("abort", cancel);
  };
  const cancel = () => { finish(); image.src = ""; };
  const fallback = () => {
    if (finished) return;
    if (original) { finish(); return; }
    original = true; clearTimeout(timer); image.src = source; timer = setTimeout(finish, yiyanDirectImageTimeout);
  };
  image.onload = finish; image.onerror = fallback; signal.addEventListener("abort", cancel, { once: true });
  timer = setTimeout(fallback, yiyanProxyImageTimeout); image.src = yiyanImageProxyPath(source);
}
