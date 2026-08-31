# Architettura v60S.273.1

## Bootstrap e cache

`index.html` contiene shell, stile e markup; il runtime è in `sentiero-app.js`, precaricato in testa e richiesto con versione `60.273.1`. Il browser può quindi ricevere e analizzare il documento piccolo mentre scarica il runtime in parallelo. `sentiero-sync.js` resta differito e viene caricato soltanto dopo il primo render; generatore e decoder QR rimangono on-demand.

I nove MP3 incorporati sono file same-origin sotto `assets/sfx/`. Il caricatore accetta soltanto data URL storici o quel percorso locale, usa cache HTTP e conserva la compatibilità con personalizzazioni già salvate. Il font essenziale resta inline per non aggiungere una dipendenza bloccante.

Il Service Worker usa una cache di generazione. Index, manifest e runtime principale sono atomici: se uno manca, la nuova generazione non si attiva e resta valida la precedente. Sync, QR, suoni, lingua e pagine ausiliarie sono precaricati best-effort e ricevono aggiornamento in background. API, Worker e navigazioni cross-origin non entrano mai in CacheStorage.

## Stato locale e migrazione

`localStorage['sentiero-v1']` resta il checkpoint immediato e retrocompatibile. IndexedDB `sentiero-data-v2` conserva registri per entità/campo e coda offline. L'apertura è condivisa tra chiamanti; un cambio di versione chiude il collegamento senza bloccare upgrade futuri. Prima della migrazione viene scritto `sentiero-pre-migration-v2`; prima di accettare uno spazio remoto viene scritto `sentiero-pre-pair-v2`.

Il journal esclude diagnostica, chiave Gemini, token, root key, audio e altri campi segreti. Le identità mancanti nei backup v1 vengono aggiunte in modo additivo. HLC, tombstone e spareggio per device rendono merge, replay e ordine deterministici.

## Sincronizzazione

Il client serializza le catture locali, accorpa richieste ravvicinate e persiste sequenza/configurazione una volta per lotto. Una sola sync può essere attiva. Cifratura AES-GCM e HMAC usano chiavi Web Crypto importate in cache e concorrenza limitata; timeout, backoff esponenziale con jitter e stati permanenti evitano loop aggressivi.

Protocollo 3 invia al massimo 100 operazioni e rispetta un budget di 1,5 MB. Il client elimina esclusivamente il prefisso confermato dall'array `acked`; buste troppo grandi, risposte corrotte, ack mancanti o client obsoleti lasciano i dati locali intatti. Il recupero remoto usa `hasMore` esplicito e pagine limitate.

## Backend e sicurezza

Il Worker è stateless e D1 conserva solo ciphertext, hash di routing, ID casuali e tempi tecnici. I token dispositivo sono SHA-256. CORS è fail-closed su origini esatte; payload, ID, JWK, buste e sequenze hanno limiti e validazione. Un lotto con un solo elemento invalido viene rifiutato interamente.

Il pairing usa ECDH P-256 effimero, confronto a sei cifre, invito di dieci minuti e claim monouso recuperabile dopo perdita della risposta. Etichette definitive dei dispositivi sono cifrate. Revoca, cancellazione a cascata e health D1 profondo sono autenticati dal contesto previsto. Il cron elimina soltanto inviti già scaduti da oltre 24 ore; il journal non viene cancellato automaticamente.

`sync-worker/package-lock.json`, Wrangler 4.127.0 e `migrations/0001_initial.sql` rendono installazione e schema riproducibili. Il repository non contiene credenziali né configurazione di produzione.

## Confini dichiarati

- lo storage locale del browser non è cifrato;
- senza root key su almeno un dispositivo il server non può recuperare i contenuti;
- il journal remoto resta append-only e richiede monitoraggio prima di volumi elevati;
- Safari/iOS, fotocamera, aptica e installazione Home Screen non sono emulabili fedelmente nell'ambiente Windows; nessun loro esito manuale viene dichiarato.
