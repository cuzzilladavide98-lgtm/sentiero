# Sentiero v60S.273.1

Sentiero è una PWA personale local-first. Diario, Quest, preferenze e stato quotidiano continuano a funzionare senza account e senza rete. La sincronizzazione multi-dispositivo è opzionale, cifrata end-to-end e disattivata per impostazione predefinita.

## Avvio

Non esiste una build obbligatoria. Pubblica la cartella su HTTPS (per esempio GitHub Pages) oppure avviala in locale:

```bash
python -m http.server 4173
```

Poi apri `http://127.0.0.1:4173/`. Service Worker, installazione PWA, Web Crypto e fotocamera QR richiedono HTTPS in produzione; `localhost` è accettato dai browser per lo sviluppo.

## Novità della release

- runtime principale separato dall'HTML, precaricato e versionato: il documento iniziale compresso scende dell'82,5% e il primo paint misurato del 29,2%;
- nove suoni del Cerchio estratti dai data URL: il trasferimento iniziale HTML + runtime cala del 24,6% rispetto a v60S.272.8;
- installazione PWA atomica per index, manifest e runtime; gli asset accessori restano best-effort;
- client sync single-flight, cifratura concorrente, coda coalescente, timeout/backoff e cancellazione locale soltanto dopo ack esplicito;
- protocollo Worker v3 fail-closed, limiti di payload, paginazione esplicita, CORS a origini esatte e pulizia pianificata dei soli inviti scaduti;
- Worker riproducibile con Wrangler bloccato, lockfile e migrazioni D1; percorso reale locale Worker + D1 coperto end-to-end;
- matrice mobile Chrome automatica a 320/375/430 px, incluse sette sottopagine, overflow, errori runtime e movimento ridotto.

## Test

La suite applicativa richiede soltanto Node.js e non chiama servizi esterni. Il test browser richiede Chrome; il test Worker richiede prima `npm ci` dentro `sync-worker/`.

```bash
npm test
npm run test:browser
node qa/performance-benchmark.js /percorso/alla/baseline

cd sync-worker
npm ci
npm run check
npm run db:local
# in un secondo terminale: npm run dev
cd ..
npm run test:worker:e2e
```

## Struttura

- `index.html`: shell, stili e markup;
- `sentiero-app.js`: runtime principale precaricato e versionato;
- `sentiero-sync.js`: schema v2, journal, merge, cifratura e client pairing;
- `sync-worker/`: backend Cloudflare Workers + D1 distribuibile;
- `qa/`: contratti di regressione, sync, migrazione e benchmark;
- `docs/`: architettura, migrazione, deploy, test e prestazioni;
- `privacy.html`, `guida.html`, `inizia.html`: documentazione utente.

Per abilitare il cloud serve distribuire il Worker e incollare il suo URL in **Altro → Dispositivi**. La procedura è in [docs/SYNC-DEPLOYMENT.md](docs/SYNC-DEPLOYMENT.md).

Documenti della candidata: [architettura](docs/ARCHITECTURE-v273.1.md), [prestazioni](docs/PERFORMANCE-v273.1.md), [test](docs/TEST-REPORT-v273.1.md) e [rapporto di rilascio](RELEASE-REPORT-v60S.273.1.md).
