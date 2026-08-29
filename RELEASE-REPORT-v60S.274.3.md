# Sentiero v60S.274.3 — hotfix distribuzione Terra

## Causa corretta

GitHub Pages serviva le copie appiattite in radice con HTTP 200 e MIME JSON, ma restituiva 404 per i due percorsi `assets/...` richiesti dal runtime. Non era un difetto dello snapshot né del lessico.

## Correzione

- resolver canonico + radice, versionato e limitato;
- copie compatibili con hash identico nella candidata;
- `edition` dello snapshot usata direttamente;
- Service Worker v274.3 network-first sugli alias, cache unificata, `skipWaiting`, `clients.claim`, script versionato e `updateViaCache: none`;
- workflow GitHub strutturato, attivato anche alla prima pubblicazione e capace di aggiornare atomicamente entrambe le copie dello snapshot.

## Gate

- topologia appiattita: percorso `assets/...` forzato a 404, alias di radice 200;
- profilo Chrome nuovo: Terra mostra 5 articoli, fonti, timestamp e Parola completa;
- server spento: stessi contenuti dall'ultima cache valida;
- gate Pages verifica build, MIME, URL effettivi e profilo Chrome temporaneo contro la distribuzione pubblica.
