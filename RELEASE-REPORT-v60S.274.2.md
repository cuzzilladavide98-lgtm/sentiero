# Sentiero v60S.274.2 — rapporto di rilascio

Baseline: v60S.274.1. Ambito: corpi Terra/Purple e disponibilità reale dei contenuti della stanza Terra senza backend remoto.

## Esito

Terra è ora un pianeta atmosferico con volume, terminatore, nubi, orbita e satellite; Purple è un corpo profondo con nucleo ed energia stratificata. Le due rese hanno materiali specifici per OLED e LCD e una modalità a movimento ridotto senza perdita di identità.

Il Giornale non dipende più da Cloudflare per mostrare un'edizione. La candidata distribuisce uno snapshot editoriale reale, con fonti e timestamp, costruito dallo stesso registry chiuso della newsroom. Worker, snapshot statico, IndexedDB e Cache Storage formano una catena di recupero; offline resta leggibile l'ultima edizione valida. La Parola usa localmente il catalogo completo attribuito.

L'aggiornamento zero-cost è operativo in GitHub Actions e fail-safe: il generatore deve superare soglie di raggiungibilità, parsing, volume e prima pagina prima della scrittura atomica. Il test ha eseguito realmente la raccolta e prodotto lo snapshot incluso (`2026-08-29T08:05:14.758Z`): 26 fonti raggiunte, 23 parseabili, 96 elementi, 20 fonti rappresentate e 5 articoli.

## Gate di rilascio

- profilo Chrome nuovo, nessun endpoint remoto: Terra mostra 5 articoli, fonti, timestamp e Parola completa;
- server spento e stesso profilo: contenuto invariato dalla cache valida, sotto controllo del Service Worker;
- regressione, newsroom browser, responsive 320–1024 px, OLED/LCD e movimento ridotto: PASS;
- confronto con v274.1: nessuna rimozione e nessuna modifica fuori dall'ambito dichiarato.

Cloudflare remoto e QA fisico restano rinviati come richiesto; non sono necessari per il percorso di accettazione di questa candidata.
