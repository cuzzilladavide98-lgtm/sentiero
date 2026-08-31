# Architettura v60S.274.0

## Ciclo diurno

`sentiero-app.js` sceglie in ora civile locale una sola presenza: **La Terra** dalle 04:20 incluse alle 19:00 escluse, satellite dalle 19:00 incluse alle 04:20 escluse. Il controllo riusa il ciclo grafico esistente, si riallinea ogni 30 secondi e al ritorno in primo piano. Terra, continenti e Luna sono SVG/CSS code-native; il movimento decorativo scompare con `prefers-reduced-motion`.

`sentiero-day.mjs` è importato soltanto alla prima apertura. La stanza è una superficie finita con tre sezioni:

- **Settimana**: proiezione lunedì–domenica di `S.quests`; modifica lo stesso oggetto e conserva ID, log e riferimenti sync. La griglia comprime le sette colonne e non crea scroll orizzontale.
- **Giornale**: edizione quotidiana finita, con massimo cinque articoli, fonti visibili, correzioni e chiusura esplicita.
- **Parola**: una voce determinata una volta per giorno civile e persistita completa in `S.paroleGiorno`.

## Giornale: evidenza prima della prosa

Il Worker usa esclusivamente `sync-worker/src/news-sources.js`: sei origini pubbliche dichiarate con dominio, area, lingua, livello, ruolo, metodo di recupero, freschezza, affidabilità e termini. Non accetta URL dal client. Ogni fetch ha timeout di 7,5 s; il lettore di stream interrompe oltre 1,2 MB; parsing, normalizzazione e deduplica producono al massimo 54 elementi. `/v1/day/news` è pubblico ma sottoposto alla stessa allowlist CORS della PWA e a cache condivisa 15 minuti + stale un'ora.

Nel client gli elementi diventano storie stabili. Il ledger IndexedDB conserva `firstSeen`, `lastSeen`, ultimo cambiamento materiale, livelli delle fonti, numeri e contesto. Una nuova edizione nasce soltanto quando cambia materialmente l'evidenza: nuova fonte Tier A, numeri diversi o bassa sovrapposizione di contenuto.

Gemini è un editor, mai una fonte. Riceve soltanto pacchetti pubblici normalizzati e restituisce JSON con `storyIds` e claim collegati a `sourceIds`. Il gate deterministico rifiuta ID ignoti, claim senza sovrapposizione sufficiente e numeri non presenti nell'evidenza. La rubric controlla finitezza, supporto, diversità, fonti Tier A, gerarchia e clickbait; sotto 78 esegue una sola critica/riparazione. Se rete o AI falliscono, l'edizione deterministica usa direttamente le fonti. Le ultime otto edizioni e le storie restano disponibili offline.

## Parola del giorno

`assets/parole-giorno-v1.json` contiene 1.694 voci attribuite (1.500 italiane, 194 da altre lingue), derivate dal dump Wiktionary tramite Kaikki. Il catalogo è caricato su richiesta e messo in cache runtime, non nel bootstrap. La selezione usa giorno civile 04:20 e storico persistente; la voce scelta contiene parola, lingua, nota, provenienza, definizione, immagine verbale ed esempio. Stato, sanitizzazione, backup/import e sync trattano `paroleGiorno` come mappa durevole.

## Superfici generative

| Superficie | Input | Controllo | Persistenza/fallback |
|---|---|---|---|
| Sussurro | contesto locale già ridotto | debounce 120 ms, abort, priorità 55, timeout 30 s, output 180 token | silenzio locale riproducibile |
| Frutto | giorno concluso | single-flight per giorno, `_syncId` deterministico | journal `GENERATING/AVAILABLE/RECOVERABLE_ERROR`, retry online/foreground |
| Giornale | sole fonti pubbliche normalizzate | schema, claim gate, rubric, una riparazione | edizione deterministica e cache offline |

## Sync, privacy e deploy

La PWA resta local-first. Il sync opzionale conserva il protocollo v3, cifratura end-to-end, ack, pairing ECDH e journal D1. `paroleGiorno` partecipa al merge; edizioni e fonti pubbliche restano in IndexedDB locale e non espongono diario o Quest al Worker notizie. Il meta vuoto `sentiero-services` è il solo punto da valorizzare con l'URL Worker distribuito; in sua assenza l'app continua offline. La procedura è in `SYNC-DEPLOYMENT.md`.
