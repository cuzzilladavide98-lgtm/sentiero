# Test report v60S.274.1

## Evidenza mirata Giornale

| Area | Comando | Esito |
|---|---|---|
| Contratto redazionale | `node qa/newsroom-quality-contract.test.mjs` | PASS: 26 fonti, 11 primarie, 15 indipendenti, 4 lingue |
| Feed pubblici live | `npm run test:news:live` | PASS: 26/26 raggiungibili, 23 con evidenza recente parseabile |
| Browser Giornale | `npm run test:news:browser` | PASS: Chrome mobile 375 px e desktop 1024 px |
| Stanza diurna | `node qa/day-room-contract.test.mjs` | PASS |
| Worker/D1 locale | `npm run test:worker:e2e` | PASS |
| Bundle Worker | `sync-worker/npm run check` | PASS |

Il contratto redazionale verifica cluster italiano/inglese, separazione di storie non correlate, supporto semantico, numeri, incertezza, polarità, provenienza, corroborazione primaria+indipendente, delta numerico, correzioni, ranking per conseguenza, esclusione del cerimoniale, edizione valida con una sola storia, fallback senza riempitivi e blocco dei link fuori registry.

Il test browser serve una pipeline completa senza chiave Gemini e verifica prima pagina, lead, citazioni, chip di provenienza, conclusione, soglia di importanza, assenza di overflow ed errori console. Il controllo live misura disponibilità e capacità di estrazione; un feed raggiungibile ma privo di elementi negli ultimi sette giorni non viene trattato come errore e non genera contenuto artificiale.

La suite storica `npm test` resta il gate di regressione. Cloudflare remoto e dispositivi fisici sono intenzionalmente fuori dalla missione v274.1.
