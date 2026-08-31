# Test report v60S.273.1

Esecuzione finale nella repository candidata, Windows, Node.js e browser Chromium, 28 agosto 2026.

## Suite applicativa

`npm test`: **PASS**.

- Motion/Sussurro: 21 fixture gate, fasi, ownership audio/aptica, debounce/abort, reduced motion e nessuna Brace;
- scena Oggi: stato reale, undo, rapid tap, lifecycle, fallback Web Animations, contenimento mobile e materiali OLED/LCD;
- sync dati: 9 contratti su delta campo, merge offline, conflitto, ordine, tombstone, idempotenza, esclusione segreti, AES-GCM/AAD ed ECDH;
- Quest/Impostazioni: 7 contratti, incluso Sabato 10:30 → 07:00 in-place e identità `questLog`;
- backend/migrazione: 6 contratti su backup v1, pre-migrazione, ciphertext, auth/revoca/delete, pairing monouso e CORS;
- QR offline: round-trip generatore → RGBA → decoder;
- hardening/prestazioni: 8 contratti su MP3 esterni, budget, installazione PWA atomica, IDB upgrade, single-flight/ack, validazione Worker, paginazione, cron e CORS.

`node --check` su `sentiero-app.js`, `sentiero-sync.js`, `sw.js` e Worker: **PASS**.

## Browser automatizzato

`npm run test:browser`: **PASS** su Chrome reale headless con profili isolati.

- viewport 320 × 568, 375 × 647 e 430 × 740 a DPR 2;
- home Altro e tutte le sette sottopagine;
- nessun overflow orizzontale del documento o dei nodi visibili;
- nessun `error` o `unhandledrejection`;
- profilo separato con `prefers-reduced-motion: reduce` effettivo.

Il benchmark prestazionale usa ulteriori 14 profili freddi, sette baseline e sette candidati. Safari/iOS e sensori fisici non sono disponibili nell'ambiente: non sono sostituiti da dichiarazioni manuali.

## Worker + D1 reale locale

Con `npm ci`, Wrangler 4.127.0 e migrazione D1 `0001_initial.sql`:

- `npm run check`: **PASS**, bundle 10,14 KiB / gzip 3,47 KiB;
- `npm run db:local`: **PASS**, 9 comandi applicati;
- `npm run db:list:local`: **PASS**, nessuna migrazione pendente;
- `npm run test:worker:e2e` contro `wrangler dev`: **PASS**.

L'E2E verifica health semplice e D1 profondo, CORS negato, creazione spazio, upgrade obbligatorio a protocollo 3, ack/journal, pairing P-256, conferma/claim/replay, elenco/rinomina, revoca con 403, cancellazione cascade e trigger cron locale.

## Integrità

- JSON, manifest e lockfile: parsing **PASS**;
- dipendenze Worker installate con `npm ci`; `node_modules`, `.wrangler`, `.dev.vars` ed `.env` esclusi dal pacchetto;
- scansione pattern credenziali/private key: nessuna credenziale inclusa;
- ZIP finale verificato tramite inventario e SHA-256 separato.

L'unico passaggio non eseguibile senza identità esterna è il deploy remoto Cloudflare: account/token, UUID D1 reale e origine HTTPS pubblica. Codice, migrazione, dry-run e percorso locale sono completi.
