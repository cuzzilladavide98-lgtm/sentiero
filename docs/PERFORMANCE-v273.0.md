# Prestazioni v60S.273.0

Misura finale del 28 agosto 2026 con `qa/performance-benchmark.js`, baseline v60S.272.8 e 17 compilazioni JavaScript per campione. Sono stati eseguiti tre campioni completi; i numeri di dimensione sono deterministici.

| Metrica | Baseline | Candidato | Delta |
|---|---:|---:|---:|
| `index.html` | 1.348.882 B | 1.380.994 B | +32.112 B (+2,38%) |
| HTML gzip-9 | 527.850 B | 536.967 B | +9.117 B (+1,73%) |
| JavaScript inline di avvio | 1.099.943 B | 1.119.268 B | +19.325 B (+1,76%) |
| contesto sintetico 100 Quest | 19.531 caratteri | 11.791 caratteri | −39,6% |

I tempi mediani di sola compilazione sono variati sensibilmente tra processi sul sistema sotto carico: candidato 601,22–879,48 ms, baseline 684,77–754,70 ms; i delta accoppiati vanno da −136,66 a +152,55 ms. La dispersione è maggiore dell'effetto: non è corretto dichiarare né un miglioramento né una regressione di TTI da questa micro-misura.

Il costo funzionale nuovo è spostato fuori dal percorso iniziale:

- `sentiero-sync.js` (29.920 B) viene caricato in idle dopo il primo render;
- `vendor/qrcode.js` (56.694 B) è interpretato solo quando serve generare un QR;
- `vendor/jsQR.js` (256.723 B, decoder fallback) viene caricato solo se la lettura QR nativa manca o fallisce;
- il Service Worker li porta in cache per l'uso offline, senza renderli dipendenze sincrone del bootstrap;
- senza sincronizzazione attivata non parte traffico verso il Worker;
- richieste Gemini testuali identiche condividono solo la Promise in-flight; non esiste cache persistente di risposte.

Il benchmark prova peso, parsing e budget del prompt; non sostituisce Web Vitals su dispositivi fisici. Per il gate di pubblicazione misurare almeno iPhone Safari e Android Chrome con profilo freddo/caldo, rete lenta e stato reale grande.
