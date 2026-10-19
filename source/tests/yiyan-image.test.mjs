import test from "node:test";
import assert from "node:assert/strict";
import { fetchYiyanOriginalImage } from "../lib/yiyan-image-service.ts";
import { prefetchYiyanImage, yiyanImageProxyPath } from "../lib/yiyan-image.ts";

const image = "https://jhyiyan.oss-cn-beijing.aliyuncs.com/2026/10/17/157ffb9e6ecd8dc98eff3874f706c3ed.jpg";

test("原图中转沿用精确白名单，不允许任意地址或接口路径", async () => {
  assert.equal(new URL("https://xuliu.test" + yiyanImageProxyPath(image)).searchParams.get("src"), image);
  for (const source of ["http://localhost/a", "https://example.com/a.jpg", "https://app.yiyan.art/yiyan/gettodaycard", "https://u:p@app.yiyan.art/yiyanpic/pic/a.jpg"]) {
    assert.equal(yiyanImageProxyPath(source), "");
    await assert.rejects(fetchYiyanOriginalImage(source, () => { throw new Error("must not fetch"); }), error => error.status === 400);
  }
});

test("中转逐字节保留一言原图，不发送账号凭据，也不转发上游 Cookie", async () => {
  const bytes = Uint8Array.from([255, 216, 255, 0, 12, 33, 255, 217]);
  const result = await fetchYiyanOriginalImage(image, async (url, options) => {
    assert.equal(url, image); assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit");
    assert.equal(options.headers, undefined); assert.equal(options.referrerPolicy, "no-referrer");
    return new Response(bytes, { headers: { "Content-Type": "image/jpeg", "Set-Cookie": "must-not-forward=1" } });
  });
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  assert.equal(result.headers.get("set-cookie"), null); assert.equal(result.headers.get("cache-control"), "private, max-age=86400");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
});

test("中转拒绝跳转、非图片和空响应，不把错误页显示成原图", async () => {
  for (const reply of [new Response("", { status: 301 }), new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }), new Response("", { headers: { "Content-Type": "image/png" } })]) {
    await assert.rejects(fetchYiyanOriginalImage(image, async () => reply), error => error.status === 502);
  }
});

test("原图中转同时限制声明长度和实际流长度，超限停止读取", async () => {
  await assert.rejects(fetchYiyanOriginalImage(image, async () => new Response("x", { headers: { "Content-Type": "image/jpeg", "Content-Length": String(5 * 1024 * 1024) } })), error => error.status === 413);
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(fetchYiyanOriginalImage(image, async () => new Response(stream, { headers: { "Content-Type": "image/webp" } })), error => error.status === 413);
  assert.equal(cancelled, true);
});

test("原图断连和读取中断返回简短错误，不泄露上游原始信息", async () => {
  await assert.rejects(fetchYiyanOriginalImage(image, async () => { throw new Error("private connection data"); }), error => error.status === 502 && !error.message.includes("private"));
  const stream = new ReadableStream({ start(controller) { controller.error(new Error("private response data")); } });
  await assert.rejects(fetchYiyanOriginalImage(image, async () => new Response(stream, { headers: { "Content-Type": "image/jpeg" } })), error => error.status === 502 && !error.message.includes("private"));
});

test("预取默认请求序流同源原图，失败后最多回退一次直连", () => {
  const previous = globalThis.window, requests = []; let instance;
  class MockImage { constructor() { instance = this; } set src(value) { requests.push(value); } }
  globalThis.window = { Image: MockImage };
  const controller = new AbortController();
  try {
    prefetchYiyanImage(image, controller.signal);
    assert.equal(requests[0], yiyanImageProxyPath(image));
    instance.onerror(); assert.equal(requests[1], image);
    instance.onerror(); assert.equal(requests.length, 2); assert.equal(instance.onerror, null);
  } finally { controller.abort(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

test("取消预取停止后续回退，不让旧图片请求持续运行", () => {
  const previous = globalThis.window, requests = []; let instance;
  class MockImage { constructor() { instance = this; } set src(value) { requests.push(value); } }
  globalThis.window = { Image: MockImage };
  const controller = new AbortController();
  try {
    prefetchYiyanImage(image, controller.signal); controller.abort();
    assert.deepEqual(requests, [yiyanImageProxyPath(image), ""]);
    assert.equal(instance.onerror, null); assert.equal(instance.onload, null);
  } finally { controller.abort(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
