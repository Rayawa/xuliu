const source = `
const CACHE = "xuliu-shell-v1";
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/"]))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener("fetch", event => { if (event.request.method !== "GET") return; event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request))); });
self.addEventListener("push", event => { const payload = event.data?.json() ?? { title: "序流提醒", body: "该休息或完成今天的习惯了。" }; event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body })); });
`;

export async function GET() {
  return new Response(source, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" } });
}
