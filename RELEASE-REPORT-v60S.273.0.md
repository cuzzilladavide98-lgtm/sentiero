# Sentiero v60S.273.0 — rapporto di rilascio

Baseline autorizzata: `sentiero-main-v60S.272.8-OGGI-DIRECTOR-CANDIDATE-GITHUB-READY.zip`, SHA-256 `497A8C4134972E7E4D57BC469473B6AB9385B8F5690E3AF9EB9D3F80043C0075`.

## Risultato

La release conserva il checkpoint e l'import/export v1, aggiunge sincronizzazione locale-first opzionale, pairing tra dispositivi, gestione dispositivi e migrazione additiva allo schema 2. Senza endpoint configurato l'app resta interamente locale e non effettua traffico sync.

Il correttivo Quest modifica Sabato 10:30 → 07:00 in-place, preservando oggetto, ID e riferimenti. **Altro** è organizzato in home e sette sottopagine responsive con ritorno accessibile.

## Integrità e sicurezza

- operazioni per entità/campo, HLC persistente, tombstone, replay idempotente e ordine deterministico;
- coda offline con eliminazione soltanto dopo ack;
- AES-GCM con AAD `opId`, routing HMAC e root key da 256 bit conservata sul client;
- etichette dispositivo cifrate; chiave Gemini, token, diagnostica, audio e cache esclusi dal journal;
- pairing ECDH P-256, codice a sei cifre, token di dieci minuti e claim monouso ripetibile in sicurezza dopo perdita della risposta;
- bearer token memorizzati in D1 soltanto come SHA-256, revoca 403, cancellazione a cascata e allowlist Origin applicata;
- richieste API esterne escluse da CacheStorage.

## Verifica

`npm test` è verde: motion/whisper, scena Oggi, 9 contratti sync, 7 contratti Quest/Impostazioni, 6 contratti backend/migrazione e round-trip QR offline. Sintassi client/Worker, JSON/manifest e scansione credenziali sono verdi. Il dettaglio è in `docs/TEST-REPORT-v273.0.md`.

Rispetto alla baseline, `index.html` cresce di 32.112 B (+2,38%), gzip-9 di 9.117 B (+1,73%) e il JavaScript inline di avvio di 19.325 B (+1,76%). Sync e decoder QR restano fuori dal bootstrap; il contesto Gemini sintetico cala del 39,6%. Dettaglio in `docs/PERFORMANCE-v273.0.md`.

## Pubblicazione

Il Worker non è distribuito: servono account Cloudflare, D1, origine pubblica e credenziali umane. Seguire `docs/SYNC-DEPLOYMENT.md`; finché l'endpoint non è configurato, la release funziona local-only.

Prima del rollout generale resta il gate fisico minimo dichiarato in `docs/TEST-REPORT-v273.0.md`: viewport iOS/Android, modifica Quest con reload, due dispositivi offline/reconnect/revoca, fotocamera QR, audio/aptica/reduced motion, storage/rete avversi, backup reale v272.x e Worker+D1 di produzione.
