# Sentiero v60S.274.3

Sentiero è una PWA personale local-first. Diario, Quest, preferenze e stato quotidiano continuano a funzionare senza account e senza rete. La sincronizzazione multi-dispositivo è opzionale, cifrata end-to-end e disattivata per impostazione predefinita.

## Avvio

Non esiste una build obbligatoria. Pubblica la cartella su HTTPS (per esempio GitHub Pages) oppure avviala in locale:

```bash
python -m http.server 4173
```

Poi apri `http://127.0.0.1:4173/`. Service Worker, installazione PWA, Web Crypto e fotocamera QR richiedono HTTPS in produzione; `localhost` è accettato dai browser per lo sviluppo.

## Novità della release

- il resolver degli asset accetta sia la struttura canonica (`assets/...`) sia la topologia appiattita osservata sulla distribuzione GitHub Pages; entrambe le copie viaggiano nella release e devono avere hash identico;
- Giornale usa immediatamente l'`edition` validata dello snapshot distribuito, senza ricomporla; il Service Worker v274.3 migra le vecchie cache, risolve gli alias e controlla gli aggiornamenti senza cache HTTP del proprio script;
- Terra e Satellite Viola hanno ora corpi tridimensionali distinti, leggibili sia su OLED sia su LCD, con una variante senza movimento che conserva materia e gerarchia;
- la distribuzione include uno snapshot editoriale reale e timestampato: Terra apre Giornale e Parola anche senza Worker Cloudflare, mentre il Service Worker e IndexedDB conservano l'ultima edizione valida per l'uso offline;
- l'automazione GitHub aggiorna lo snapshot dalle 26 fonti fisse con controlli minimi di raggiungibilità, parsing e contenuto prima di pubblicarlo; un errore non sovrascrive l'ultima edizione valida;
- la Terra diurna sostituisce il satellite tra le 04:20 e le 19:00 e apre una stanza unica con Settimana, Giornale finito e Parola del giorno;
- la Settimana proietta direttamente le Quest esistenti, dal lunedì alla domenica, senza duplicare oggetti o identità;
- il Giornale usa 26 fonti pubbliche gratuite (11 primarie e 15 redazioni indipendenti, in quattro lingue), cluster semantici multilingua, provenienza per claim e memoria delle storie per distinguere il vero delta da ieri;
- nessuna quota riempie l’edizione: importanza, conseguenze e solidità dell’evidenza determinano da una a sei storie, ordinate in una prima pagina gerarchica; un Editorial Critic avversariale ricompone la bozza prima della pubblicazione e il fallback resta finito e leggibile anche senza Gemini;
- la Parola del giorno usa un catalogo attribuito di 1.694 voci e persiste la scelta completa: 1.000 giorni simulati senza ripetizioni;
- Sussurro riduce attesa deterministica e tetto di output; Frutto è single-flight, idempotente e recuperabile dopo errore, sospensione o riavvio;
- Worker/D1 serve anche il pacchetto notizie pubblico con input limitati, cache condivisa, origini fisse e timeout;
- Chrome automatizzato copre 320/360/375/390/430 px, desktop e movimento ridotto. La candidata migliora le mediane browser di FCP, long task, DOM/load e trasferimento del runtime rispetto a v60S.273.1.

## Test

La suite applicativa richiede soltanto Node.js e non chiama servizi esterni. Il test browser richiede Chrome; il test Worker richiede prima `npm ci` dentro `sync-worker/`.

```bash
npm test
npm run test:browser
npm run test:news:browser
npm run test:day:content
npm run test:news:automation
npm run test:pages:live
npm run test:news:live
node qa/performance-benchmark.js /percorso/alla/baseline
node qa/browser-performance.js /percorso/alla/baseline

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
- `sentiero-day.mjs`: stanza Terra, Settimana, Giornale e Parola del giorno caricati su richiesta;
- `assets/giornale/latest.json`: ultima edizione reale versionata, usata quando il Worker non è configurato e come base offline;
- `assets/parole-giorno-v1.json`: catalogo lessicale attribuito, non incluso nel bootstrap;
- `.github/workflows/update-giornale.yml`: aggiornamento zero-cost dello snapshot editoriale;
- `qa/`: contratti di regressione, sync, migrazione, browser e benchmark;
- `docs/`: architettura, migrazione, deploy, test e prestazioni;
- `privacy.html`, `guida.html`, `inizia.html`: documentazione utente.

Per abilitare il cloud serve distribuire il Worker e incollare il suo URL in **Altro → Dispositivi**. La procedura è in [docs/SYNC-DEPLOYMENT.md](docs/SYNC-DEPLOYMENT.md).

Documenti della candidata: [hotfix distribuzione](docs/DISTRIBUTION-HOTFIX-v274.3.md), [contenuto Terra](docs/DAY-CONTENT-v274.2.md), [Giornale](docs/NEWSROOM-v274.1.md), [prestazioni precedentemente verificate](docs/PERFORMANCE-v274.0.md) e [rapporto di rilascio](RELEASE-REPORT-v60S.274.3.md).
