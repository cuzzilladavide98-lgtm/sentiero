# Sentiero v60S.274.5

Release ufficiale del 4 settembre 2026, promossa dalla candidata RC2 dopo il secondo test fisico reale su iPhone.

## Esito

Il test fisico iPhone è PASS: Giornale in italiano, contenuto sostanzioso, “Vicino a te” leggibile, fonti e data del 04/09/2026, aggiornamento manuale effettivo, nessun ritorno all’edizione del 03/09 e nessun inglese transitorio osservato.

La release usa `v60S.274.5`, package/distribution `60.274.5`, Service Worker generation `274005` e cache production `sentiero-v60s-274-5`.

## Problemi risolti

- Nella v274.4 gli asset Terra sotto `/assets/` risultavano 404 nella distribuzione Pages appiattita. Il runtime ora risolve sia i percorsi canonici sia le copie root; il Service Worker li aggiorna network-first e conserva l’ultima risposta valida offline.
- L’inglese transitorio allo startup proveniva da un’edizione cached resa prima della validazione linguistica. Cache, snapshot e render applicano ora lo stesso gate italiano.
- Il caso da un solo articolo non era scarsità reale: la shortlist globale veniva tagliata prima del filtro linguistico e poteva espellere cluster italiani sopra soglia. La selezione production valuta l’intero insieme eleggibile; la soglia assoluta resta 52 e non vengono forzati riempitivi.
- Il gate finale ha inoltre dimostrato che il reader runtime troncava il corpus a 96 evidenze prima di risolvere i claim dell’edizione: tre articoli su cinque citavano fonti nelle posizioni 97–160 e sparivano dal DOM. Il limite è stato riallineato al massimo production di 160 e il browser smoke confronta ora il conteggio reso con quello dello snapshot distribuito.
- Il passaggio 03→04 settembre confondeva tempo di build/cache e tempo reale delle fonti, mentre la rotazione dei feed poteva perdere evidenze forti dello stesso giorno. `generatedAt`, `sourcesUpdatedAt` e `cacheSavedAt` sono distinti; la continuity porta solo evidenze forti nello stesso giorno logico, ne preserva `publishedAt`/`retrievedAt`, scade entro la finestra prevista e non parte su feed vuoto o al cambio giorno.
- Il contratto Service Worker della RC2 è stato promosso alla convenzione production. Le cache v274.4 e preview RC2 vengono eliminate dopo l’attivazione; shell e modulo del giorno sono core, gli URL sono versionati e l’handshake lega build, generation e cache.

## Freshness e continuità

La catena verificata è rete → snapshot → continuity same-day → validazione → cache → render. Offline viene resa l’ultima edizione valida con timestamp originale e stato stale coerente. Le evidenze sono marcate `CURRENT` o `CARRIED`; una evidenza carried non riceve mai un timestamp “adesso”. Refresh manuale, startup, pageshow, foreground e ritorno online condividono lo stesso contratto single-flight. La chiusura della stanza interrompe soltanto l’eventuale composizione AI, non il recupero delle fonti.

## Snapshot finale

- `generatedAt` / `sourcesUpdatedAt`: `2026-09-04T15:42:30.429Z`
- giorno logico: `2026-09-04`
- 160 item: 153 `CURRENT`, 7 `CARRIED`
- 5 articoli, tutti con importance ≥ 52; nessun filler forzato

Articoli: Il ministro Urso e la proposta della cordata italiana (81); guerra Ucraina/Russia e raid sulle raffinerie di Sochi (67); Milei e Falkland (56); guerra Iran e pressione economica su Teheran (54); governo Meloni e ingerenze russe (52).

## Verifica finale

- `npm test`: PASS
- regressioni dedupe, cultura, lifestyle/no filler, markup ed etimologia: PASS
- startup, day boundary, diagnostica e freshness browser: PASS
- local-news Chrome 320/375/430 e contrasto WCAG: PASS
- Service Worker handshake browser reale: PASS
- upgrade reale v274.4 → v274.5 e iphone-rc2 → v274.5: PASS
- day-content fresh install/offline e newsroom browser: PASS
- browser-mobile release finale: 2/2 PASS
- snapshot automation e copie distributive identiche: PASS

## File principali

Runtime e distribuzione: `index.html`, `sentiero-app.js`, `sentiero-day.mjs`, `sw.js`, `package.json`, `assets/giornale/latest.json`, `latest.json`, cataloghi Parola. Automazione: `.github/workflows/update-giornale.yml`, `tools/build-news-snapshot.mjs`, `tools/news-snapshot-time.mjs`, `tools/news-snapshot-continuity.mjs`. Regressioni: test editoriali, freshness/day-boundary/diagnostica/startup, browser Giornale/local-news/mobile, handshake e upgrade Service Worker.
