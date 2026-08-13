const CACHE = 'sentiero-v60s234';
/* v168: nella lista restavano sette file audio che l'app non suona dalla v101 (audio spento in
   blocco) e uno, d-major.mp3, che nel repo non c'e mai stato: a ogni installazione partivano
   sette richieste inutili, una per un .wav pesante. I file restano nel repo per il giorno in cui
   l'audio tornera - semplicemente non si scaricano piu in anticipo. */
/* Il precarico serve a far girare l'app senza rete. Icona e schermate di avvio
   non servono all'app: se le prende iOS quando la metti in Home, una volta sola e
   per conto suo. Precaricarle tutte e sei significava scaricare 1,1 MB di immagini
   a ogni installazione perche il telefono ne usasse una, che poi nemmeno legge da
   qui. Restano tutte nel repo e restano nel gestore fetch qui sotto: la prima volta
   che una viene chiesta davvero, finisce in cache come tutto il resto. */
const ASSETS = ['./', './index.html', './manifest.json',
  './icon-180.png', './icon-192.png',
  './lingue/en.json',    /* v218: i pacchetti delle lingue viaggiano con l'app: offline dal primo avvio */
  './privacy.html',
  './guida.html'];     /* v221: l'informativa viaggia con l'app. Senza, chi la apre
                            offline si vedrebbe servire index.html al posto suo dal
                            ripiego qui sotto - e un'informativa che non si apre non
                            e un'informativa. */

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
