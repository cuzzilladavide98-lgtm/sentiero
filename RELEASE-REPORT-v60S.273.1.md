# Sentiero v60S.273.1 — rapporto di rilascio

Baseline di prestazioni: v60S.272.8. Base funzionale: candidata v60S.273.0.

## Esito

La candidata diventa una base quotidiana più piccola, misurabilmente più rapida e più resistente a cache incomplete, rete intermittente, replay, payload avversi e aggiornamenti concorrenti. Nessuna nuova funzione utente è stata aggiunta.

Il documento compresso scende da 527.850 a 92.298 B; il trasferimento complessivo HTML + runtime scende del 24,6%. Su sette profili Chrome freddi per versione, FCP mediano passa da 192 a 136 ms e i long task da 176 a 132 ms. Tutti i dettagli e i limiti della misura sono in `docs/PERFORMANCE-v273.1.md`.

## Hardening

- runtime e suoni sono asset versionati e riutilizzabili dalla cache;
- una generazione PWA priva del runtime principale non può attivarsi;
- client sync single-flight, catture coalescenti, chiavi CryptoKey riutilizzate, crittografia concorrente, timeout/backoff, limiti e ack espliciti;
- nessun accumulo IndexedDB di marcatori `seen`; l'upgrade IDB può chiudere connessioni vecchie;
- protocollo Worker 3 con validazione dell'intero lotto, limiti, paginazione `hasMore`, CORS fail-closed e nomi dispositivo protetti;
- deploy riproducibile con lockfile, Wrangler bloccato, migrazione D1 e cron che elimina soltanto inviti scaduti.

## Verifica

Suite applicativa, sintassi, Chrome mobile 320/375/430 px, reduced motion, benchmark, dry-run Worker, migrazione D1 locale e Worker/D1 end-to-end sono verdi. Il dettaglio è in `docs/TEST-REPORT-v273.1.md`.

Il deploy remoto non è stato eseguito perché nell'ambiente non sono presenti account/token Cloudflare, UUID D1 reale e origine HTTPS pubblica. Questa è l'unica dipendenza esterna rimasta; la procedura pronta è `docs/SYNC-DEPLOYMENT.md`. Senza endpoint Sentiero continua a funzionare interamente local-first.
