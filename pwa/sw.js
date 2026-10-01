// Service worker: guarda os arquivos do jogo para funcionar sem internet.
const CACHE = 'horta-hostil-v11';
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'js/data.js', 'js/game.js', 'js/sfx.js', 'js/ranking.js', 'js/net.js', 'js/mp.js', 'js/ui.js', 'js/art.js', 'js/community.js', 'js/main.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primeiro tenta a internet (pega versões novas); sem conexão, usa o cache.
// Pedidos para outros sites (ranking e multiplayer no Firebase) passam direto.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && !url.search) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
