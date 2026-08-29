# Architettura v60S.273.0

## Modello locale

`localStorage['sentiero-v1']` resta il checkpoint compatibile e immediato usato dall'app. `sentiero-data-v2` in IndexedDB aggiunge un journal per entità/campo, registri di merge, coda offline e checkpoint tecnico. La chiave Gemini continua a vivere separatamente in `sentiero-gemini-key`; audio e cache PWA non entrano nel journal.

Al primo bootstrap v2 ogni elemento di collezione privo di `id` riceve `_syncId`. Prima della modifica viene conservata una copia in `sentiero-pre-migration-v2`. Gli import precedenti restano accettati dal sanitizer esistente.

## Granularità e merge

- collezioni (`quests`, diario, frutti, semi, capitoli, ecc.): una entità per elemento;
- mappe (`checks`, patti, sfide, foto, ecc.): una entità per chiave e, quando il valore è un oggetto, un registro per campo interno;
- singleton (`settings`, mastery, desiderio): una entità ciascuno con registri indipendenti per campo;
- campi radice ammessi: registri distinti;
- `registro`, credenziali, token, chiave Gemini e blob audio: sempre locali.

Ogni operazione contiene solo i campi cambiati, un `opId`, una sequenza dispositivo e un Hybrid Logical Clock persistente. Campi distinti modificati offline si fondono. Sullo stesso campo vince l'HLC lessicograficamente maggiore; l'identificatore dispositivo chiude i pareggi. Le cancellazioni sono tombstone. Replay, duplicati e arrivo fuori ordine sono idempotenti.

Le collezioni vengono ricostruite con un ordine deterministico basato sui campi temporali del dominio e sull'identità stabile come spareggio. Due dispositivi che ricevono le stesse operazioni in sequenze diverse convergono quindi anche nell'ordine di diario, log e archivi; `questLog` conserva `_syncId` attraverso il sanitizer.

La coda locale elimina le operazioni soltanto dopo una risposta di ack del server; un crash precedente produce al massimo un replay idempotente. I registri IndexedDB mantengono lo stato ricostruibile senza conservare per sempre ogni delta già accettato.

Quando viene creato un nuovo spazio, il client rigenera una fotografia completa sotto forma di operazioni iniziali. Questo evita che la cancellazione e successiva riattivazione del cloud producano un journal contenente soltanto gli ultimi delta.

## Confine crittografico

Il dispositivo genera una root key casuale a 256 bit. Ogni operazione è cifrata AES-GCM con IV casuale e `opId` come additional authenticated data. Il nome logico dell'entità diventa un HMAC troncato, così il server può partizionare senza leggere il contenuto. Il server vede: space/device ID casuali, hash entità, dimensioni, sequenze, cursore e tempi tecnici.

Anche le etichette leggibili dei dispositivi vengono cifrate con la root key e AAD legato all'ID; durante il pairing il server usa soltanto un'etichetta generica temporanea. La lista viene decifrata nel client.

Il pairing usa ECDH P-256 effimero. Il QR contiene endpoint, token temporaneo, chiave pubblica e scadenza; non contiene root key, dati o chiave Gemini. I due dispositivi derivano un codice indipendente a sei cifre. Solo dopo confronto e approvazione la root key viene avvolta con la chiave condivisa. Claim e invito sono monouso.

Il dispositivo entrante crea `sentiero-pre-pair-v2`, svuota soltanto i registri tecnici sync e riceve l'intero journal remoto prima di poter produrre nuovi delta. In questo modo lo stato predefinito di una nuova installazione non può vincere per timestamp sui dati esistenti. L'interfaccia dichiara che lo spazio collegato sostituirà i dati Sentiero locali correnti.

## Backend

Il Worker D1 è stateless; D1 conserva dispositivi, operazioni cifrate e pairing. I bearer token sono memorizzati solo come SHA-256. Revoca e cancellazione spazio sono autenticate. Le foreign key eliminano a cascata journal e inviti.

## Avvio e rete

Il primo render non attende sync o QR. `sentiero-sync.js` viene richiesto in idle; `vendor/qrcode.js` viene interpretato solo aprendo il pairing. Senza endpoint non esiste traffico sync. Gemini mantiene coda, abort, backoff, cooldown 429 e output strutturato già presenti; la deduplicazione vale soltanto per richieste testuali identiche contemporanee.

Il Service Worker gestisce soltanto asset same-origin: richieste API e navigazioni esterne bypassano CacheStorage. In particolare stato del pairing, elenco dispositivi e revoche non possono essere soddisfatti da una GET obsoleta.

## Limiti dichiarati

- lo storage locale del browser non è cifrato;
- il server non può recuperare una root key perduta;
- non esiste account personale né recupero via email;
- la disponibilità dipende dal provider scelto per il Worker;
- il test finale di fotocamera, audio, aptica e installazione PWA richiede dispositivi fisici.
