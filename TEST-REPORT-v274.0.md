# Test report v60S.274.0

## Esito

| Area | Evidenza | Esito |
|---|---|---|
| Regressione completa | `npm test` | PASS |
| Terra/Settimana/Giornale/Parola | `qa/day-room-contract.test.mjs` | PASS: 1.694 parole, 1.000 giorni senza ripetizioni, 6 fonti |
| AI/Sussurro/Frutto | `qa/generative-hardening-contract.test.js` | PASS |
| Mobile/browser | `npm run test:browser` | PASS: 320/360/375/390/430, 1024, reduced motion |
| Performance browser | `qa/browser-performance.js <v273.1>` | PASS: 6 run, tutte le mediane principali non peggiorano |
| Performance peso/CPU | `qa/performance-benchmark.js <v273.1>` | PASS: budget bootstrap rispettato |
| Worker/D1 reale locale | `npm run test:worker:e2e` | PASS: health, CORS, protocollo, ack, pairing, replay, revoca, cascade, cron |
| Worker deploy dry-run | `sync-worker/npm run check` | PASS: 16,41 KiB, gzip 5,94 KiB |

## Contratti coperti

- confini 04:20/19:00, area Terra/satellite, Luna e movimento ridotto;
- sette giorni civili, nessun UTC, stessa identità Quest, nessun overflow;
- registry fisso completo, parser RSS/Atom, timeout e corpo limitato;
- clustering, storia stabile, cambiamento materiale, claim→fonte, supporto numerico, rubric, correzioni e fallback;
- parola Unicode, scelta durevole, backup/import/sync e prova 1.000 giorni;
- Sussurro: gate e tono invariati, abort/debounce/timeout/priorità/output verificati;
- Frutto: single-flight, `_syncId` deterministico, salvataggio immediato, journal e recovery;
- invarianti storiche Motion, Today Stage, sync v2/v3, pairing, migrazione, QR e Service Worker.

## Limiti esterni

Il deploy remoto non è verificabile senza login/account Cloudflare, UUID D1 reale, origine HTTPS pubblica e URL Worker finale. Tutto il percorso locale usa Wrangler/D1 reali; nessun test manuale o dispositivo dell'utente è richiesto. Per Sussurro manca una credenziale Gemini con cui produrre una misura rete after comparabile: restano verificati i risparmi deterministici e i contratti.
