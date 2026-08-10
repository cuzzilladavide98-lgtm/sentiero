# Il sito — come si mette online

`inizia.html` è **una pagina sola**, senza dipendenze. Va messa nello stesso
repo dell'app, accanto a `index.html`.

## Dove va

Nel repo `cuzzilladavide98-lgtm/sentiero`, alla radice:

```
sentiero/
  index.html        ← l'app, non si tocca
  inizia.html       ← questo file, nuovo
  icon-192.png      ← c'è già: la pagina lo usa per la sua icona
  ...
```

Diventa: **`https://cuzzilladavide98-lgtm.github.io/sentiero/inizia.html`**

## Perché non alla radice

Alla radice c'è già `index.html`, che è l'app. Spostarla per fare posto a una
pagina di presentazione cambierebbe l'indirizzo dell'app, e cambiare l'indirizzo
di una PWA già installata significa che quella sul tuo telefono resta orfana:
il service worker ha un ambito legato al percorso. Non ne vale il rischio per
una pagina che serve una volta sola, il giorno che la mandi a qualcuno.

Quindi: **l'app resta dov'è, e la pagina le sta accanto.**
Il bottone «Apri Sentiero» punta a `./`, cioè all'app: da `inizia.html` porta
alla cartella, che è l'app. Nessun indirizzo scritto a mano da tenere allineato.

## Cosa mandi alle persone

L'indirizzo di `inizia.html`, non quello dell'app. Chi riceve il link legge cosa
è, cosa non fa, e trova le istruzioni per metterlo in Home. Chi riceve
direttamente l'app si trova davanti una schermata senza sapere cos'è.

## Le due cose da controllare dopo il primo deploy

1. **L'icona in cima alla pagina si vede?** Se esce l'immagine rotta, `inizia.html`
   non è accanto a `icon-192.png` — cioè non è alla radice del repo.
2. **Il bottone «Apri Sentiero» apre l'app?** Se apre di nuovo la pagina, il file
   è dentro una sottocartella e `./` non punta più dove serve.

Sono i due soli modi in cui questa pagina può rompersi, e si vedono tutti e due
in cinque secondi.

## Il banco

```bash
cd sentiero-laboratorio
node banchi/provaSito.js ../sentiero-sito/inizia.html ../sentiero-v60S.209/index.html
```

Prova le stesse cose dell'app — bersagli da 44 punti, testo leggibile, contrasto —
più due che valgono solo per una pagina che gira per il mondo: che non faccia
**nessuna** richiesta esterna, e che le promesse scritte corrispondano a cosa fa
davvero l'app (l'ultima sezione rilegge l'`index.html` per verificarlo).

## Cosa resta da decidere, e non è tecnico

- **Il nome del file.** `inizia.html` si dice bene a voce, ma è una scelta tua.
- ~~**La riga finale.**~~ Decisa il 10 agosto: *«Pensato da Davide Cuzzilla, usato
  da entrambi. Condividilo se anche tu pensi che possa aiutare qualcun altro.
  Grazie»*
- **Se mettere un contatto.** Adesso non c'è nessun indirizzo a cui scrivere. Chi
  trova un difetto non ha modo di dirtelo, e nemmeno chi vuole ringraziare.
