# Mission ledger — v60S.274.5

## Release ufficiale v60S.274.5 — 04/09/2026

| ID | Stato | Evidenza | Blocker |
|---|---|---|---|
| RLS01 Test fisico iPhone | VERIFIED | secondo test fisico: Giornale italiano/sostanzioso, Vicino a te, freshness 04/09 e aggiornamento manuale PASS | — |
| RLS02 Versioning/SW | VERIFIED | package/runtime/distribution `60.274.5`; generation `274005`; cache `sentiero-v60s-274-5` | — |
| RLS03 Upgrade 274.4/RC2 | VERIFIED | browser reale: vecchio worker+cache → worker finale, runtime finale, Giornale e rimozione cache precedente | — |
| RLS04 Gate finali | VERIFIED | suite, regressioni editoriali/freshness, browser smoke, handshake e browser-mobile 2/2 PASS | — |

## RC2 freshness Giornale — 04/09/2026

| ID | Stato | Evidenza | Blocker |
|---|---|---|---|
| F01 Causa timestamp falso/stale | VERIFIED | edition snapshot preservata; `truthfulEdition`; generated/source/cache separati | — |
| F02 Fonti separate da AI/abort | VERIFIED | corpus+fallback salvati prima della composizione; close abortisce solo AI | — |
| F03 Aggiornamento autonomo | VERIFIED | Action ogni 2h; builder live atomico; giorno Europe/Rome 04:20 | — |
| F04 New-day/cache/offline/lifecycle | VERIFIED | browser: cache ieri→rete oggi, failure, offline, refresh, pageshow, single-flight | — |
| F05 Soglia/no filler | VERIFIED | soglia pubblicazione 52 applicata a fallback, AI e snapshot distribuito | — |
| F06 Diagnostica freshness | VERIFIED | giorno/tempi/origine/età/fetch/compose/abort/online, zero contenuti | — |
| F07 Gate RC2 locale | VERIFIED | suite, browser, SW e snapshot live 04/09 verdi; nessun bump/package/deploy | — |

## Giornale Italia mobile v60S.274.4

| ID | Stato | Evidenza | Blocker |
|---|---|---|---|
| N01 Italiano naturale end-to-end | VERIFIED | `looksItalian()`/`editionIsItalian()` validation, prompt editoriale italiano, fallback italiano, campo `language: 'it'` su edition | — |
| N02 Foto pertinenti e provenienza | VERIFIED | estrazione media RSS (`itemMedia`, `canonicalImageUrl`), allowlist `imageDomains`, rendering `newsFigure` con credit/diritti, campi `places/topics/media` su item | — |
| N03 Territorio consensuale/manuale | VERIFIED | 20 fonti TGR regionali, `localPreference` (localStorage), `nearestRegion` (geolocalizzazione una volta, no coordinate persistite), UI selector regione/comune, consenso revocabile | — |
| N04 Boost Quest locale e non sensibile | VERIFIED | `QUEST_SENSITIVE` set, `safeQuestKeywords()` filtra categorie sensibili, `personalizeEditionForDevice()` boost max +3, lead protetto, elaborazione solo locale | — |
| N05 Mobile-first e browser | VERIFIED | Chrome 320/360/375/390/430/1024 + reduced motion: PASS (nessun overflow, touch target, gerarchia, card con/senza immagine, selector località, consenso geolocalizzazione) | — |
| N06 Packaging | VERIFIED | ZIP GitHub-ready `sentiero-main-v60S.274.4-GIORNALE-QUALITY-GITHUB-READY.zip`, manifest, SHA-256 verificato, estrazione integra, no artefatti temporanei/secreti | — |

## Hotfix distribuzione v60S.274.3

| ID | Stato | Evidenza | Blocker |
|---|---|---|---|
| D01 Causa deploy reale | VERIFIED | Pages: `/assets/*` 404; copie appiattite in `/latest.json` e `/parole-giorno-v1.json` 200 | — |
| D02 Resolver asset + edizione diretta | VERIFIED | path canonico/root; snapshot edition resa direttamente; flat-deploy Chrome PASS | — |
| D03 Migrazione Service Worker | VERIFIED | cache v274.3, alias network-first, URL SW versionato, updateViaCache none | — |
| D04 Gate Pages fresh install | VERIFIED | Pages commit `2aafa31f`; Chrome temporaneo: 5 articoli, 5 fonti, Parola completa; asset e MIME reali | — |
| D05 Packaging | VERIFIED | ZIP 116 file; estrazione e manifest SHA-256 identici; dipendenze build escluse | — |

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
