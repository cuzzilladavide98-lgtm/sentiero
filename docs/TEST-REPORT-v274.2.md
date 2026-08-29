# Test report v60S.274.2

| Gate | Comando | Esito |
|---|---|---|
| Regressione applicativa | `npm test` | PASS |
| Snapshot reale + workflow | `npm run test:news:automation` | PASS: 26 raggiunte, 23 parseabili, 96 elementi, 5 articoli |
| Fresh install e offline | `npm run test:day:content` | PASS: 5 articoli, 6 fonti visibili, Parola completa, riapertura offline controllata dal Service Worker |
| Giornale browser | `npm run test:news:browser` | PASS: mobile 375 px e desktop 1024 px |
| Responsive | `npm run test:browser` | PASS: 320/360/375/390/430/1024 px e movimento ridotto |
| Contratto visuale | `node qa/world-visual-contract.test.js` | PASS: Terra 30/72 px, Purple 22/88 px, OLED/LCD e reduced motion |
| Integrità v274.1 | confronto manifest SHA-256 | PASS: nessun file rimosso; differenze limitate a visuale, contenuto Terra, test, versione e documentazione |

Il gate fresh install parte con profilo Chrome vuoto e configurazione servizi vuota, apre Terra, pretende titolo, testo, citazioni HTTPS, timestamp delle fonti e definizione completa della Parola. Attende l'attivazione del Service Worker, spegne il server, riapre lo stesso profilo senza rete e pretende gli stessi contenuti dall'ultima edizione valida.

Il gate GitHub esegue il generatore reale contro le fonti pubbliche e rifiuta uno snapshot vuoto o privo di provenienza. Il workflow conserva l'ultima copia valida se la raccolta non supera le soglie.
