# Prestazioni v60S.273.1

Misura del 28 agosto 2026 contro la baseline v60S.272.8. Le dimensioni usano byte UTF-8 e gzip-9; `qa/performance-benchmark.js` compila il JavaScript 17 volte e riporta la mediana. I numeri di trasferimento browser provengono da sette profili Chrome freddi per versione, server locale gzip, viewport 375 × 647 e DPR 2.

## Peso iniziale

| Metrica | v60S.272.8 | v60S.273.1 | Delta |
|---|---:|---:|---:|
| documento HTML | 1.348.882 B | 263.189 B | −1.085.693 B (−80,5%) |
| documento gzip-9 | 527.850 B | 92.298 B | −435.552 B (−82,5%) |
| JavaScript di avvio | 1.099.943 B | 928.969 B | −170.974 B (−15,5%) |
| JavaScript di avvio gzip-9 | 438.606 B | 306.141 B | −132.465 B (−30,2%) |
| HTML + runtime esterno | 1.348.882 B | 1.190.798 B | −158.084 B (−11,7%) |
| HTML + runtime gzip-9 | 527.850 B | 397.889 B | −129.961 B (−24,6%) |
| contesto sintetico 100 Quest | 19.531 caratteri | 11.791 caratteri | −39,6% |

Il guadagno totale non dipende da una diversa rappresentazione del solo HTML: la somma compressa del documento e del runtime scende di circa 130 kB. La riduzione nasce soprattutto dall'estrazione dei nove MP3 inline; il runtime esterno consente in più download parallelo, cache indipendente e documento analizzabile prima.

## Browser reale, profilo freddo

| Mediana | v60S.272.8 | v60S.273.1 | Delta |
|---|---:|---:|---:|
| response end documento | 137,0 ms | 75,6 ms | −61,4 ms (−44,8%) |
| First Contentful Paint | 192 ms | 136 ms | −56 ms (−29,2%) |
| long task cumulativi | 176 ms | 132 ms | −44 ms (−25,0%) |
| `load` | 383,2 ms | 376,2 ms | −7,0 ms |
| `DOMContentLoaded` | 359,3 ms | 373,3 ms | +14,0 ms |
| trasferimento documento | 527.995 B | 92.422 B | −435.573 B |
| trasferimento runtime esterno | — | 305.580 B | +305.580 B |

La somma browser documento + runtime è 398.002 B, contro 527.995 B della baseline (−24,6%). Il runtime esterno termina in mediana in 97,1 ms. Il piccolo delta sfavorevole di `DOMContentLoaded` non viene presentato come regressione certa: i p95 sono 412,1 e 413,5 ms, quindi l'effetto è entro la dispersione; FCP, byte e long task migliorano invece nella stessa direzione e con ampiezza materiale.

La mediana di sola compilazione Node è 29,02 ms contro 28,00 ms: differenza non significativa. Non viene dichiarato un miglioramento di latenza di rete Gemini senza una chiamata a quota reale; sono misurati soltanto il budget del contesto (−39,6%) e la rimozione di lavoro locale/serializzazioni sync dal percorso critico.
