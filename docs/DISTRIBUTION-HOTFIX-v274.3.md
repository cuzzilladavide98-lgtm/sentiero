# Hotfix distribuzione v60S.274.3

La distribuzione GitHub Pages della v274.2 esponeva `latest.json` e `parole-giorno-v1.json` nella radice, mentre il runtime richiedeva esclusivamente `assets/giornale/latest.json` e `assets/parole-giorno-v1.json`: i due URL restituivano 404 nonostante i dati fossero presenti.

La v274.3 distribuisce e aggiorna entrambe le topologie. Il client prova prima il percorso canonico e poi l'alias di radice con query di versione; il Service Worker applica lo stesso fallback network-first, conserva la risposta sotto entrambi i nomi e migra alla cache `sentiero-v60s-274-3`. La registrazione usa URL versionato e `updateViaCache: none`.

Lo snapshot incorporato viene validato e la sua `edition` è resa direttamente. La ricomposizione resta riservata ai pacchetti del Worker privi di edizione.
