const CACHE = 'sentiero-v60s-274-0';
const PROD_CACHE_PREFIX = 'sentiero-v60s-';
/* v272.3 recovery: Distillazione via GenerateContent, base completa incorporata,
   stessa geometria voce e backup completo preservati. */
/* v272.0 discoverability-1: landing/guida/manifest aggiornati per descrivere
   Sentiero come diario digitale personale in modo naturale e indicizzabile;
   sitemap pubblica aggiunta. Nessun tracker e nessun meta-keywords. */
/* v272.0 hotfix SE-2: gli aggiornamenti ora scorrono nel main di Oggi, non in
   un overflow annidato. Questo byte forza il controllo del worker aggiornato;
   il nome cache resta quello della release. */
/* v272.0 hotfix Gemini-1: endpoint Interactions riallineato alla v1beta documentata,
   prova connessione su Flash-Lite e refresh esplicito della base linguistica. */
/* v272.0 hotfix docs-1: guida/privacy riallineate alla Generativa reale; safe-area
   iPhone corretta e vecchio capitolo dell'IA locale rimosso. Questo byte forza
   l'installazione del worker e il refresh degli HTML precache. */
/* v272.1: nuova generazione reale della cache. Frutto tecnico non consumabile,
   rilettura audio esplicita, base linguistica v7 e Sussurro meno incline al
   silenzio automatico. La base italiana e network-first: una copia vecchia non
   puo piu vincere soltanto perche era gia in CacheStorage. */
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
const CORE_ASSETS = ['./', './index.html', './manifest.json', './sentiero-app.js?v=60.274.0'];
const ASSETS = [...CORE_ASSETS, './sentiero-sync.js?v=60.274.0', './sentiero-day.mjs?v=60.274.0', './vendor/qrcode.js', './vendor/jsQR.js',
  './icon-180.png', './icon-192.png',
  './assets/sfx/combo-1.mp3', './assets/sfx/combo-2.mp3', './assets/sfx/combo-3.mp3', './assets/sfx/combo-4.mp3',
  './assets/sfx/combo-5.mp3', './assets/sfx/combo-6.mp3', './assets/sfx/combo-7.mp3', './assets/sfx/combo-8.mp3', './assets/sfx/seal.mp3',
  './lingue/en.json',
  './lingue/base-it-v272.7.json',   /* v267: la base linguistica viaggia con l'app. Offline si usa questa; con la rete si aggiorna da qui. */    /* v218: i pacchetti delle lingue viaggiano con l'app: offline dal primo avvio */
  './privacy.html',
  './guida.html',
  './inizia.html'];     /* v221: l'informativa viaggia con l'app. Senza, chi la apre
                            offline si vedrebbe servire index.html al posto suo dal
                            ripiego qui sotto - e un'informativa che non si apre non
                            e un'informativa. */

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* Ora che il runtime principale e esterno, una cache priva di index o app
       non deve mai sostituire una generazione funzionante. */
    await Promise.all(CORE_ASSETS.map(async asset => {
      const res = await fetch(asset, { cache: 'reload' });
      if (!res || !res.ok) throw new Error('core asset: ' + asset);
      await c.put(asset, res);
    }));
    await Promise.all(ASSETS.filter(asset => !CORE_ASSETS.includes(asset)).map(async asset => {
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
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PROD_CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

/* v269.8 — «CHI STA SERVENDO QUESTA PAGINA?»
   Una domanda sola, una risposta sola, nessun protocollo. La pagina chiede la
   generazione di chi la serve; il worker la ricava dal nome della propria cache
   (sentiero-v60s-273-1 -> 273001). Serve a distinguere, nel nastro, una sessione
   servita dalla generazione nuova da una servita da quella vecchia rimasta al
   comando. Un worker di prima di questa versione non risponde: nel nastro resta
   zero, e anche quello dice qualcosa. */
function generazioneDaCache(nome) {
  const m = String(nome || '').match(/(\d+)-(\d+)$/);
  if (m) return (parseInt(m[1], 10) || 0) * 1000 + (parseInt(m[2], 10) || 0);
  const s = String(nome || '').match(/(\d+)$/);
  return s ? (parseInt(s[1], 10) || 0) * 1000 : 0;
}
self.addEventListener('message', e => {
  if (!e || !e.data || e.data.q !== 'gen') return;
  const risposta = { gen: generazioneDaCache(CACHE), cache: CACHE };
  if (e.ports && e.ports[0]) e.ports[0].postMessage(risposta);
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  try {
    const u = new URL(url);
    /* API, pairing e navigazioni esterne non sono asset: soprattutto le GET di
       stato pairing non devono mai ricevere una risposta vecchia dalla cache. */
    if (u.origin !== self.location.origin || /\/v1\//.test(u.pathname)) return;
  } catch (_) {}

  /* v272.1 — base linguistica: rete prima, cache della STESSA generazione dopo.
     Il contratto per_versione resta fail-closed nel client; qui impediamo che
     CacheStorage scelga per prima una risposta statica vecchia. */
  try {
    const u = new URL(url);
    if (u.pathname.endsWith('/lingue/base-it-v272.7.json')) {
      e.respondWith((async () => {
        const c = await caches.open(CACHE);
        try {
          const res = await fetch(e.request, { cache: 'no-store' });
          if (res && res.ok) {
            try { await c.put('./lingue/base-it-v272.7.json', res.clone()); } catch (_) {}
            return res;
          }
        } catch (_) {}
        return (await c.match('./lingue/base-it-v272.7.json')) || Response.error();
      })());
      return;
    }
  } catch (_) {}

  // App shell: network-first, così le nuove versioni arrivano da sole; offline si usa la cache.
  if (e.request.mode === 'navigate' || url.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.open(CACHE).then(c => c.match(e.request).then(r => r || c.match('./index.html'))))
    );
    return;
  }

  // Risorse statiche: cache-first con aggiornamento in background.
  e.respondWith(
    caches.open(CACHE).then(c => c.match(e.request)).then(cached => {
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
