import { http } from '@kit.NetworkKit';
import { image } from '@kit.ImageKit';
import { CLOUD_ORIGIN, YIYAN_MAX_IMAGE_BYTES, YIYAN_PROXY_TIMEOUT_MS, YIYAN_DIRECT_TIMEOUT_MS } from '../../config/constants';
import { sessionCookie, sessionEpoch } from '../../state/cloudSession';
import { yiyanImageUrl } from '../../domain/yiyan/YiyanData';

const cache: Map<string, ArrayBuffer> = new Map();

export class YiyanImageLoader {
  private request: http.HttpRequest | undefined;
  private generation: number = 0;
  cancel(): void { this.generation++; try { this.request?.destroy(); } catch (_) {} this.request = undefined; }

  private async download(url: string, proxy: boolean): Promise<ArrayBuffer> {
    const request = http.createHttp(); this.request = request;
    const generation = this.generation; const epoch = sessionEpoch(); const path = `/api/yiyan/image?src=${encodeURIComponent(url)}`;
    const headers: Record<string, string> = {};
    if (proxy) { headers['Cookie'] = sessionCookie(path); headers['Origin'] = CLOUD_ORIGIN; }
    const timeout = proxy ? YIYAN_PROXY_TIMEOUT_MS : YIYAN_DIRECT_TIMEOUT_MS;
    const timer = setTimeout(() => { try { request.destroy(); } catch (_) {} }, timeout);
    try {
      const response = await request.request(proxy ? `${CLOUD_ORIGIN}${path}` : url, {
        method: http.RequestMethod.GET, expectDataType: http.HttpDataType.ARRAY_BUFFER, maxLimit: YIYAN_MAX_IMAGE_BYTES,
        header: headers,
        usingCache: false, maxRedirects: 0, connectTimeout: proxy ? YIYAN_PROXY_TIMEOUT_MS : YIYAN_DIRECT_TIMEOUT_MS,
        readTimeout: proxy ? YIYAN_PROXY_TIMEOUT_MS : YIYAN_DIRECT_TIMEOUT_MS
      });
      if (generation !== this.generation || epoch !== sessionEpoch()) throw new Error('配图读取已取消');
      const responseHeaders = response.header as Record<string, string>;
      const type = (responseHeaders['content-type'] ?? responseHeaders['Content-Type'] ?? '').split(';')[0].trim().toLowerCase();
      if (response.responseCode !== 200 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(type)) throw new Error('一言配图暂不可用');
      const buffer = response.result as ArrayBuffer;
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 1 || buffer.byteLength > YIYAN_MAX_IMAGE_BYTES) throw new Error('一言配图大小无效');
      return buffer;
    } finally { clearTimeout(timer); if (this.request === request) this.request = undefined; try { request.destroy(); } catch (_) {} }
  }

  async bytes(source: string): Promise<ArrayBuffer> {
    const url = yiyanImageUrl(source); if (!url) throw new Error('一言配图地址无效');
    const cached = cache.get(url); if (cached) { cache.delete(url); cache.set(url, cached); return cached; }
    const generation = this.generation; let bytes: ArrayBuffer;
    try { bytes = await this.download(url, true); }
    catch (error) { if (generation !== this.generation) throw error as Error; bytes = await this.download(url, false); }
    if (generation !== this.generation) throw new Error('配图读取已取消');
    cache.set(url, bytes); while (cache.size > 3) { const first = cache.keys().next().value as string; cache.delete(first); }
    return bytes;
  }
  async pixelMap(source: string): Promise<image.PixelMap> {
    const bytes = await this.bytes(source); const sourceImage = image.createImageSource(bytes);
    try {
      const info = await sourceImage.getImageInfo(); const width = info.size.width; const height = info.size.height;
      if (width < 1 || height < 1 || width * height > 60000000) throw new Error('配图像素过大');
      const scale = Math.min(1, 1280 / width, 1600 / height);
      return await sourceImage.createPixelMap({ desiredSize: { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) } });
    } finally { await sourceImage.release(); }
  }
}

export function clearYiyanImageCache(): void { cache.clear(); }
