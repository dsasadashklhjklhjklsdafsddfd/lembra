// Service worker: deixa o app instalável/offline e trata os botões
// das notificações do sistema (Concluir / Adiar) mesmo com a aba em segundo plano.

const CACHE = 'lembra-v1';
const ASSETS = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/store.js', 'js/alerts.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (sempre a versão mais nova), cache se estiver offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

self.addEventListener('notificationclick', (e) => {
  const id = e.notification.data?.id;
  const action = e.action || 'open';
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all.find((c) => c.focused) || all[0];
    if (client) {
      client.postMessage({ type: 'notif-action', id, action });
      if (action === 'open') await client.focus().catch(() => {});
    } else {
      await self.clients.openWindow(`./?notif=${encodeURIComponent(id)}&action=${encodeURIComponent(action)}`);
    }
  })());
});
