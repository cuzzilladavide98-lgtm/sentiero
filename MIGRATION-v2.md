# Migrazione dati v1 → v2

Baseline autorizzata: `sentiero-main-v60S.272.8-OGGI-DIRECTOR-CANDIDATE-GITHUB-READY.zip`, SHA-256 `497A8C4134972E7E4D57BC469473B6AB9385B8F5690E3AF9EB9D3F80043C0075`.

La migrazione è automatica, locale e additiva:

1. l'app legge e sanitizza il checkpoint `sentiero-v1` come nelle release precedenti;
2. conserva una copia pre-migrazione una tantum in `sentiero-pre-migration-v2`;
3. aggiunge `_syncId` solo agli elementi che non hanno già un'identità;
4. scrive schema `2` e costruisce journal/registri IndexedDB;
5. continua a salvare `sentiero-v1`, quindi avvio offline e import/export storici non dipendono dal server.

La sincronizzazione non si attiva durante la migrazione. Per inviare dati serve un gesto esplicito in **Altro → Dispositivi**, un endpoint valido e la creazione di uno spazio.

## Compatibilità e rollback

- backup v1/v272.x senza `_syncId`: importabili; gli ID vengono aggiunti dopo la lettura;
- backup v2: i campi sconosciuti continuano a essere tollerati dal sanitizer;
- chiave Gemini: mai migrata nel journal;
- diagnostica `registro`: mai sincronizzata;
- rollback applicativo: esportare prima un backup, pubblicare la release precedente e reimportare il backup compatibile;
- recupero locale tecnico: `sentiero-pre-migration-v2` conserva lo stato precedente, ma l'interfaccia non lo ripristina automaticamente per evitare sovrascritture accidentali.
- prima di completare un pairing in ingresso viene inoltre salvata `sentiero-pre-pair-v2`; lo spazio remoto sostituisce lo stato Sentiero locale, come dichiarato nella conferma, mentre chiave Gemini e diagnostica restano locali.

La migrazione è coperta da `qa/backend-migration-contract.test.js`; la qualità reale del contenuto importato va comunque verificata con un proprio backup rappresentativo prima del rollout generale.
