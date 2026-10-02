const source = `
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("push", event => { const payload = event.data?.json() ?? { title: "序流提醒", body: "该休息或完成今天的习惯了。" }; event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body })); });
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.focus(); return; }
    await self.clients.openWindow("/");
  })());
});
`;

export async function GET() {
  return new Response(source, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" } });
}
