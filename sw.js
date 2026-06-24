const CACHE = 'sentiero-v24';
const ASSETS = ['./audio/active_quest_v6_bandcore.wav', './audio/orchestra/atomic-tension.mp3', './audio/orchestra/sewer-tension.mp3', './audio/orchestra/daw-loop.mp3', './audio/orchestra/tribal-drive.mp3', './audio/orchestra/low-drums.mp3', './audio/orchestra/east-drums.mp3', './audio/orchestra/d-major.mp3', './audio/orchestra/f-major.mp3', './audio/orchestra/a-major.mp3', './audio/orchestra/b-major.mp3', './', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png', 'splash-1290x2796.png', 'splash-1179x2556.png', 'splash-1170x2532.png', 'splash-1125x2436.png', 'splash-828x1792.png', 'splash-750x1334.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async asset => {
      try {
        const res = await fetch(asset, { cache: 'reload' });
        if (res && res.ok) await c.put(asset, res);
      } catch (_) {
        // Un asset pesante o mancante non deve bloccare l'installazione della PWA.
      }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('api.anthropic.com')) return; // l'IA va sempre in rete

  // App shell: network-first, così le nuove versioni arrivano da sole; offline si usa la cache.
  if (e.request.mode === 'navigate' || url.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Risorse statiche: cache-first con aggiornamento in background.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

// Tocco sulla notifica: apre o porta in primo piano l'app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => 'focus' in c);
      return open ? open.focus() : clients.openWindow('./');
    })
  );
});
