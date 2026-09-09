const source = `
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener("push", event => { const payload = event.data?.json() ?? { title: "序流提醒", body: "该休息或完成今天的习惯了。" }; event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body })); });
`;

export async function GET() {
  return new Response(source, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" } });
}
