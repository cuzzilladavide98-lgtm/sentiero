# Test report v60S.273.0

Esecuzione finale nella repository candidata, Windows/Node.js, 28 agosto 2026.

## Automatici

`npm test`: **PASS**.

- `motion-whisper-contract.test.js`: sintassi inline, 21 fixture Sussurro, fasi Blue/Red/Purple, ownership audio/aptica, reduced motion e assenza Brace;
- `today-stage-contract.test.js`: unico direttore Oggi, stato reale, undo, lifecycle, rapid tap, fallback Web Animations, touch target e OLED/LCD;
- `sync-data-contract.test.js`: 9/9 — delta per campo, merge offline di entità, impostazioni e spunte, conflitto deterministico, ordine convergente, tombstone/idempotenza, esclusione segreti, AES-GCM/AAD ed ECDH simmetrico;
- `quest-settings-contract.test.js`: 7/7 — caso Sabato 10:30 → 07:00 in-place, niente UTC/delete-recreate, identità `questLog`, sottopagine, anti-overflow, pairing e bypass API del Service Worker;
- `backend-migration-contract.test.js`: 6/6 — backup v1, pre-migrazione, ciphertext-only inclusi i nomi dispositivo, auth/revoca/delete, invito monouso e CORS applicato;
- `qr-fallback-contract.test.js`: round-trip offline generatore → immagine RGBA → decoder con un invito realistico;
- `node --check sentiero-sync.js`: PASS;
- `node --check sync-worker/src/index.js`: PASS;
- JSON applicativi e manifest: parsing PASS;
- scansione pattern credenziali/private key: nessun risultato.

Il test di migrazione ha fatto emergere prima del rilascio la necessità di includere `questLog`; la correzione è presente e la suite è stata rieseguita da zero.

## Browser locale

Con server HTTP locale e browser reale sono stati verificati: caricamento app, onboarding, navigazione Altro, rendering delle sette categorie Impostazioni e assenza di errori/warning console durante il percorso. Il canale di automazione browser si è interrotto applicando il viewport 320 px; non viene quindi dichiarato come eseguito il matrix responsive fisico.

## Gate fisico ancora necessario

Prima della pubblicazione generale eseguire manualmente:

1. iPhone Safari/PWA a 320, 375 e 430 px; Android Chrome a 360 e 412 px;
2. creazione Quest, modifica Sabato 10:30 → Sabato 07:00, reload e verifica riferimenti;
3. due dispositivi reali: offline concorrente su campi distinti e uguali, reconnect, revoca e reinstallazione;
4. QR via fotocamera, confronto codice, scadenza e riuso negato;
5. audio, aptica, reduced motion, background/foreground, rete instabile e storage pieno;
6. migrazione da una copia reale del proprio backup v272.x;
7. Worker distribuito con CORS di produzione e D1 reale.

Il backend non è stato distribuito perché mancano, correttamente, credenziali/account Cloudflare e origine di produzione. Il codice e la procedura di deploy sono completi; finché non viene configurato un endpoint, Sentiero resta interamente locale.
