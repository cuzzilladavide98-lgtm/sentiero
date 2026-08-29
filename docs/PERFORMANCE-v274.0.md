# Prestazioni v60S.274.0

Baseline: pacchetto esatto v60S.273.1. Candidata: v60S.274.0.

## Browser reale automatizzato

Chrome 152.0.7977.64 headless, profilo nuovo, viewport 430×760 a DPR 2, cache HTTP disabilitata via CDP, tre navigazioni alternate per versione; valori mediani.

| Metrica | v273.1 | v274.0 | Delta |
|---|---:|---:|---:|
| First Contentful Paint | 388 ms | 372 ms | −16 ms (−4,1%) |
| Long task cumulativi | 86 ms | 84 ms | −2 ms (−2,3%) |
| DOMContentLoaded | 885,5 ms | 335,0 ms | −550,5 ms (−62,2%) |
| Load | 889,0 ms | 337,7 ms | −551,3 ms (−62,0%) |
| Caricamento `sentiero-app.js` | 156,5 ms | 25,6 ms | −130,9 ms (−83,6%) |

Il runner è `qa/browser-performance.js`. Misura il runtime browser e non sostituisce dati di campo; l'alternanza limita il bias d'ordine e le mediane attenuano le singole oscillazioni.

## Peso e CPU deterministica

`qa/performance-benchmark.js` esegue gzip-9 e 17 compilazioni mediane sullo stesso host.

| Metrica | v273.1 | v274.0 | Delta |
|---|---:|---:|---:|
| HTML gzip | 92.298 B | 93.035 B | +737 B |
| JS bootstrap gzip | 306.141 B | 307.782 B | +1.641 B |
| Codice iniziale gzip | 397.889 B | 400.269 B | +2.380 B (+0,60%) |
| Compilazione mediana | 19,43 ms | 18,36 ms | −1,07 ms |
| Contesto sintetico 100 Quest | 19.531 car. | 11.791 car. | −39,6% |

La stanza diurna e il catalogo lessicale non appartengono al bootstrap: `sentiero-day.mjs` è importato alla prima apertura e le 1.694 parole vengono richieste soltanto nella stanza.

## Sussurro

La diagnostica reale v272.7 disponibile registra chiamate accettate di 16.200 e 6.040 ms (mediana su due campioni: 11.120 ms). La candidata riduce il tetto output da 600 a 180 token (−70%), reasoning `low→minimal`, timeout `45→30 s`, coalescenza `420→120 ms` (−300 ms deterministici) e priorità `5→55`. Non è disponibile una credenziale Gemini per una misura rete after comparabile: la release non attribuisce al provider una riduzione non osservata.
