# Contenuto Terra v60S.274.2

## Percorso local-first

Il client tenta il Worker configurato con un timeout limitato. Se il Worker manca o non risponde, legge `assets/giornale/latest.json`, applica la stessa pipeline locale di continuità, clustering e composizione editoriale e salva l'edizione risultante in IndexedDB. In assenza di rete rende l'ultima edizione valida; il Service Worker usa network-first per lo snapshot e ricade sulla copia della stessa generazione.

La Parola legge il catalogo attribuito di 1.694 voci dalla distribuzione, conserva la scelta completa e usa Cache Storage quando la rete non è disponibile. Nessun endpoint remoto è necessario per definizione, fonte e nota editoriale.

## Snapshot e aggiornamento

`tools/build-news-snapshot.mjs` interroga esclusivamente il registry fisso di 26 feed, limita tempo e dimensione delle risposte e interrompe la pubblicazione se non raggiunge 18 fonti, non ne analizza almeno 14 o non raccoglie almeno 12 elementi. Scrive atomicamente soltanto dopo aver costruito un'edizione non vuota con provenienza.

`.github/workflows/update-giornale.yml` esegue il generatore ogni giorno e su richiesta, committando esclusivamente lo snapshot quando cambia. Il test dell'automazione esegue davvero il generatore, verifica che il timestamp avanzi e valida contenuto, fonti e prima pagina; non si limita a ispezionare il file YAML.

Snapshot incluso: `2026-08-29T08:05:14.758Z`, 26 fonti raggiunte, 23 parseabili, 96 elementi, 20 fonti rappresentate e 5 articoli.
