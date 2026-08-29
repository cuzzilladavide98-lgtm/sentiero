# Mission ledger — v60S.274.0

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
