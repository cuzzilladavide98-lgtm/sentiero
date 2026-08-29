# Mission ledger — v60S.274.2

## Hotfix distribuzione v60S.274.3

| ID | Stato | Evidenza | Blocker |
|---|---|---|---|
| D01 Causa deploy reale | VERIFIED | Pages: `/assets/*` 404; copie appiattite in `/latest.json` e `/parole-giorno-v1.json` 200 | — |
| D02 Resolver asset + edizione diretta | IN_PROGRESS | path canonico/root, snapshot edition senza ricomposizione | — |
| D03 Migrazione Service Worker | TODO | cache v274.3, alias network-first, update URL/version | — |
| D04 Gate Pages fresh install | TODO | URL pubblici 200 + Chrome Terra 5 articoli/Parola | deploy remoto |
| D05 Packaging | TODO | ZIP estratto + SHA-256 | — |

## Candidata visuale v60S.274.2

| ID | Stato | Evidenza | Blocker |
|---|---|---|---|
| V01 Baseline OLED/LCD | VERIFIED | render OLED: Terra piatta; LCD: Purple ridotto a punto | — |
| V02 Terra planetaria | VERIFIED | render OLED/LCD: volume, atmosfera, terminatore, nubi, orbita | — |
| V03 Satellite Purple | VERIFIED | nucleo/energia stratificata; pigmento LCD; reduced motion PASS | — |
| V04 Invarianti v274.1 | VERIFIED | 0 rimossi; diff limitato all'ambito; `npm test` + Chrome 320–1024 PASS | — |
| V05 Packaging | VERIFIED | ZIP 109 file estratto; manifest identico; suite archivio; SHA-256 | — |

## Hotfix contenuto Terra v60S.274.2

| ID | Stato | Evidenza | Blocker |
|---|---|---|---|
| C01 Snapshot editoriale reale | VERIFIED | 26 raggiunte, 23 parseabili, 96 elementi, 5 articoli timestampati | — |
| C02 Zero single point of failure | VERIFIED | Worker → snapshot statico → IndexedDB/Cache Storage | — |
| C03 Parola completa offline | VERIFIED | 1.694 voci; definizione+fonte; cache fallback | — |
| C04 Aggiornamento zero-cost | VERIFIED | test esegue davvero generator + workflow commit fail-safe | — |
| C05 Fresh install reale | VERIFIED | Chrome: 5 articoli/6 fonti/Parola; server spento → stessi contenuti | — |

## Candidata Giornale v60S.274.1

| ID | Stato | Evidenza | Blocker |
|---|---|---|---|
| J01 Fonti/provenance | VERIFIED | 26 registry; 26 live; 23 recenti parseabili; allowlist/provenance | — |
| J02 Cluster multilingua/delta | VERIFIED | fixture it/en + invariato/sviluppo/correzione + memoria 14 giorni | — |
| J03 Claim semantici/importanza | VERIFIED | numeri/polarità/modalità/corroborazione + ranking/no-cerimoniale | — |
| J04 Edizione/critic/fallback/gerarchia | VERIFIED | 1 storia valida; critic; Chrome 375/1024; zero filler/overflow/errori | — |
| J05 Packaging | VERIFIED | ZIP 98 file, manifest identico, suite+Chrome dall’estrazione, SHA-256 | — |

| ID | Stato | File/modulo | Verifica / evidenza | Blocker |
|---|---|---|---|---|
| R03-09 Terra diurna | VERIFIED | `index.html`, `sentiero-app.js` | ciclo + Chrome 320–1024/reduced | — |
| R10-16 Settimana | VERIFIED | `sentiero-day.mjs` | identità Quest + 7 giorni + browser | — |
| R17-56 Giornale/registry/evidenza/cache | VERIFIED | `sentiero-day.mjs`, `sync-worker/src/*` | parser, gate, rubric, delta, route, offline | Deploy remoto: account/UUID/origine |
| R57-66 Parola | VERIFIED | modulo + catalogo + sync | 1.694 voci; 1.000 giorni; backup/sync | — |
| R67-73 AI/Sussurro/Frutto | VERIFIED | runtime + contratti | −300 ms attesa; −70% output; recovery | rete after Gemini non disponibile |
| R74-76 Performance/lazy/SW | VERIFIED | runtime, `sw.js` | browser v273.1→v274.0 + gzip/CPU | — |
| R77-84 Test/responsive/browser | VERIFIED | `qa` | Chrome 320/360/375/390/430/1024/reduced | — |
| R85 Metriche | VERIFIED | `qa`, `docs` | `PERFORMANCE-v274.0.md` | — |
| R86 Closure scan | VERIFIED | repo completo | sintassi + versioni + suite + browser + report | — |
| R87 Core invariants | VERIFIED | suite storica | `npm test` PASS | — |
| R89-90 Packaging | VERIFIED | release/docs/ZIP | SHA-256 + estrazione + suite archivio | — |
