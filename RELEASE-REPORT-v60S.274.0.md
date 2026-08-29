# Sentiero v60S.274.0 — rapporto di rilascio

Baseline: v60S.273.1.

## Esito

La candidata introduce la controparte diurna definitiva del satellite: una Terra riconoscibile apre Settimana, Giornale finito e Parola del giorno senza duplicare lo stato del prodotto. Il sottosistema è lazy, offline-first e coperto su mobile e desktop automatizzati.

Il Giornale usa un registro chiuso di sei fonti pubbliche, continuità per storia, cambiamento materiale, claim collegati alle fonti, gate deterministici, rubric, correzioni e fallback. Gemini interviene soltanto come editor. La Parola persiste la voce completa e supera 1.000 giorni simulati senza ripetizioni.

Sussurro conserva il contratto narrativo riducendo del 70% il tetto output e di 300 ms l'attesa deterministica; Frutto è idempotente e recuperabile. Il Worker/D1 è pronto, limitato, osservabile e verificato localmente end-to-end.

## Prestazioni verificate

Su Chrome 152, tre run alternate per versione, le mediane v273.1→v274.0 sono: FCP 388→372 ms, long task 86→84 ms, DOMContentLoaded 885,5→335 ms, load 889→337,7 ms e risorsa runtime 156,5→25,6 ms. Il codice iniziale gzip cresce soltanto di 2.380 B (+0,60%); Terra e catalogo parole restano fuori dal bootstrap. Dettagli e limiti: `docs/PERFORMANCE-v274.0.md`.

## Matrice di chiusura

| Requisito | Implementazione | Evidenza |
|---|---|---|
| Terra 04:20–19:00 / satellite complementare | `index.html`, `sentiero-app.js` | unità + Chrome 7 profili |
| Settimana lun–dom, stesse Quest | `sentiero-day.mjs` | identità/ora civile + browser |
| Giornale finito, evidenza, continuità, correzioni | client + Worker registry | fixture deterministiche + route Worker |
| Parola 04:20, no-repeat, sync | catalogo + `paroleGiorno` | 1.000 giorni + contratti sync/backup |
| Sussurro veloce, Frutto robusto | lifecycle AI | contratto before/after + recovery fixture |
| Offline/migrazione/Worker/D1 | SW, sync v3, D1 | suite completa + E2E locale + dry-run |
| Compatibilità e accessibilità | CSS/HTML/runtime | 320–1024 px + reduced motion + console pulita |
| Packaging | repository completa | ZIP estratto, suite dall'archivio, SHA-256 |

## Unica dipendenza esterna

Il deploy Cloudflare remoto richiede login/account, UUID D1, origine pubblica e URL Worker. Il meta `sentiero-services` e la procedura `docs/SYNC-DEPLOYMENT.md` sono pronti; senza endpoint Sentiero continua local-first e usa l'ultima edizione disponibile.
