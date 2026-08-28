# Sentiero v60S.273.0

Sentiero è una PWA personale local-first. Diario, Quest, preferenze e stato quotidiano continuano a funzionare senza account e senza rete. La sincronizzazione multi-dispositivo è opzionale, cifrata end-to-end e disattivata per impostazione predefinita.

## Avvio

Non esiste una build obbligatoria. Pubblica la cartella su HTTPS (per esempio GitHub Pages) oppure avviala in locale:

```bash
python -m http.server 4173
```

Poi apri `http://127.0.0.1:4173/`. Service Worker, installazione PWA, Web Crypto e fotocamera QR richiedono HTTPS in produzione; `localhost` è accettato dai browser per lo sviluppo.

## Novità della release

- editor Quest in-place: titolo, nota, giorno, ora e priorità senza ricreare l'oggetto;
- pagina Altro ridisegnata in sette sottosezioni responsive;
- journal locale v2 per entità e campo, merge deterministico e coda offline;
- sincronizzazione opzionale AES-GCM con revoca dispositivo e cancellazione remota;
- pairing QR ECDH P-256, lettore offline con fallback Safari, codice di conferma a sei cifre e invito monouso da dieci minuti;
- contesto Gemini ridotto e richieste identiche in-flight condivise;
- runtime sync e generatore QR caricati dopo il primo render.

## Test

Serve soltanto Node.js; i test non installano dipendenze e non chiamano servizi esterni.

```bash
npm test
node qa/performance-benchmark.js /percorso/alla/baseline
```

## Struttura

- `index.html`: applicazione e interfaccia;
- `sentiero-sync.js`: schema v2, journal, merge, cifratura e client pairing;
- `sync-worker/`: backend Cloudflare Workers + D1 distribuibile;
- `qa/`: contratti di regressione, sync, migrazione e benchmark;
- `docs/`: architettura, migrazione, deploy, test e prestazioni;
- `privacy.html`, `guida.html`, `inizia.html`: documentazione utente.

Per abilitare il cloud serve distribuire il Worker e incollare il suo URL in **Altro → Dispositivi**. La procedura è in [docs/SYNC-DEPLOYMENT.md](docs/SYNC-DEPLOYMENT.md).
