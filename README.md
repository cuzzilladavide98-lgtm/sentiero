# Sentiero — Diario vocale (PWA per iPhone)

Diario vocale con quest e task pianificate. Parli, l'IA estrae le quest, le fonde con quelle esistenti e scrive una voce di diario. Tutto resta sul tuo telefono (localStorage); l'unica chiamata esterna è all'API Anthropic, con la tua chiave.

## Pubblicazione su GitHub Pages (5 minuti)

1. Crea un nuovo repository su GitHub, ad esempio `sentiero` (pubblico).
2. Carica questi 6 file nella radice del repo: `index.html`, `manifest.json`, `sw.js`, `icon-180.png`, `icon-192.png`, `icon-512.png`. Puoi farlo da browser con "Add file → Upload files".
3. Vai in **Settings → Pages**, in "Build and deployment" scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`, salva.
4. Dopo 1-2 minuti l'app è online su `https://TUOUSERNAME.github.io/sentiero/`.

## Installazione su iPhone

1. Apri l'URL in **Safari** (deve essere Safari, non Chrome).
2. Tocca **Condividi → Aggiungi alla schermata Home**.
3. Apri l'app dall'icona: parte a schermo intero come un'app nativa.
4. Al primo tocco del microfono, concedi il permesso al microfono e al riconoscimento vocale.

## Configurazione IA

1. Crea una chiave API su `console.anthropic.com` (servono pochi euro di credito; ogni elaborazione costa frazioni di centesimo).
2. Nell'app: tab **Altro → Chiave API → Salva**. La chiave resta solo nel browser del tuo telefono.
3. Senza chiave l'app funziona comunque: salva il trascritto grezzo nel diario, senza estrazione quest.

## L'esperienza: un circuito chiuso

**Rilascia → Distilla → Compi → Sigilla.**
- Tocchi l'enso e parli (suono di campana che sale, onde sul cerchio).
- "Distilla": il trascritto evapora e le quest si materializzano una a una, con suono.
- Ogni completamento: spunta con macchia d'inchiostro, nota pentatonica e una parola pronunciata a voce. Le combo ravvicinate fanno salire la scala: Fatto → Bene → Ottimo → Eccellente → Sublime → Tao.
- L'enso attorno al microfono è anche la barra di progresso del giorno: si chiude man mano che completi. Al 100%: gong, sigillo rosso, "Cerchio chiuso" e la streak di giorni sale.
- Due temi sonori in Altro → Esperienza: **Arcade** (default: coin alla nascita delle quest, power-up sul microfono, pop+arpeggio quadro sulle combo, fanfara di fine livello al sigillo, voce dell'annunciatore che si esalta col combo) e **Zen** (campane pentatoniche e gong). Cambiando tema senti subito un'anteprima.
- Suoni, voce e micro-shake si controllano in Altro → Esperienza; tutto rispetta "Riduci movimento" di iOS.

## Come funziona

- **Oggi**: tocca il cerchio (enso) e parla; ritocca per fermare; "Elabora e salva" invia il trascritto all'IA. Le quest nuove vengono create, quelle esistenti aggiornate o segnate come fatte se lo dici a voce.
- **Task pianificate**: in **Altro** definisci task ricorrenti (es. "80 g proteine" ogni giorno, "Sveglia alle 7" lun-ven). Compaiono automaticamente in **Oggi** nei giorni scelti, con spunta giornaliera.
- **Diario**: una voce per ogni registrazione elaborata, in ordine cronologico inverso, con il trascritto originale conservato sotto.
- **Backup**: esporta/importa tutto in JSON da **Altro → Dati**. Consigliato farlo periodicamente, perché i dati vivono nel localStorage di Safari.

## Qualità e collaudo

Il cuore logico dell'app (sigillo, streak, rollover del giorno, sanitizzazione dell'output IA, accumulo del trascritto, promemoria, potatura spazio) è isolato in un nucleo puro testato con ~21 milioni di verifiche su 1 milione di operazioni casuali e ostili, più test di mutazione (6 bug iniettati deliberatamente, tutti catturati dalla suite). I test sono nella cartella `dev/` del progetto e si rilanciano con `node dev/fuzz.test.js`.

## Limiti noti su iOS

- Il riconoscimento vocale di Safari a volte si interrompe da solo: l'app lo riavvia automaticamente finché non tocchi tu per fermare.
- I promemoria con notifica (attivabili in Altro) funzionano sull'app installata in Home (iOS 16.4+); scattano agli orari delle task se l'app è stata aperta nella giornata. Per push garantiti anche ad app chiusa serve un piccolo server: estensione possibile in futuro.
- Se Safari resta inutilizzato per molte settimane, iOS può svuotare il localStorage: usa l'export di backup.
