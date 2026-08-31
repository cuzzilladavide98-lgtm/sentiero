# Deploy della sincronizzazione opzionale

Il codice, le migrazioni e la prova locale Worker + D1 sono completi. Il deploy remoto richiede soltanto l'accesso a un account Cloudflare, il vero UUID D1 e la scelta dell'origine pubblica di Sentiero. Non inserire credenziali nel repository. Lo stesso Worker espone il pacchetto pubblico finito del Giornale in `/v1/day/news`; non riceve stato personale o prompt.

## 1. Crea D1

Da `sync-worker/`:

```bash
npm ci
npx wrangler login
npx wrangler d1 create sentiero-sync
```

Copia il `database_id` restituito in `wrangler.toml`, sostituendo l'UUID locale `00000000-0000-0000-0000-000000000000`. Wrangler è bloccato alla versione del lockfile: non usare un'installazione globale diversa per il rilascio.

## 2. Applica lo schema

```bash
npm run db:list:remote
npm run db:remote
npm run db:list:remote
```

La seconda lista deve risultare senza migrazioni pendenti.

## 3. Limita CORS

In `wrangler.toml` imposta `ALLOWED_ORIGINS` con l'origine esatta della PWA, senza percorso. Esempio:

```toml
ALLOWED_ORIGINS = "https://nome.github.io"
```

Più origini sono separate da virgola. L'origine deve includere schema e host, ma non percorso o slash finale. Non lasciare origini locali nella configurazione di produzione: l'API rifiuta richieste senza `Origin`, origini sconosciute e preflight non autorizzati.

## 4. Distribuisci

```bash
npm run check
npm run deploy
```

Copia poi l'URL HTTPS distribuito nel meta tag di `index.html`:

```html
<meta name="sentiero-services" content="https://sentiero-sync.<account>.workers.dev">
```

L'endpoint inserito in **Altro → Dispositivi** rimane una seconda fonte valida per compatibilità. Senza URL il Giornale usa l'ultima edizione locale e la PWA resta pienamente local-first.

Verifica prima il processo pubblico e poi D1 dall'origine autorizzata:

```bash
curl https://<worker>/health
curl -H "Origin: https://origine-sentiero.example" "https://<worker>/health?deep=1"
curl -H "Origin: https://origine-sentiero.example" "https://<worker>/v1/day/news"
```

La risposta profonda deve dichiarare `database: "reachable"` e `protocol: 3`. Poi in Sentiero apri **Altro → Dispositivi**, inserisci l'URL HTTPS del Worker, scegli il nome dispositivo e attiva.

## Pairing e revoca

Sul primo dispositivo crea un invito. Sul secondo leggi il QR o incolla il codice; confronta le sei cifre su entrambi e approva solo se coincidono. L'invito scade dopo dieci minuti ed è monouso. Da Dispositivi puoi rinominare o revocare client; **Elimina dal server** cancella lo spazio e, tramite cascade D1, journal, dispositivi e inviti.

## Operazioni

- monitora errori Worker/D1 e consumo prima di un rollout ampio;
- il cron delle 03:17 UTC elimina soltanto inviti scaduti da oltre 24 ore; non compatta né elimina il journal;
- il journal D1 è append-only per permettere a un nuovo dispositivo di ricostruire lo stato: prevedi monitoraggio, export e una futura politica di snapshot/compattazione prima di volumi elevati;
- configura rate limiting a livello Cloudflare se l'endpoint diventa pubblico;
- esegui backup D1 coerenti con la tua policy, ricordando che contengono ciphertext e metadati;
- non promettere recupero: senza root key su almeno un dispositivo i contenuti remoti non sono decifrabili;
- aggiorna informativa privacy e origine CORS se cambia dominio.

Sviluppo locale: `npm run db:local`, `npm run db:list:local`, quindi `npm run dev`; dalla radice `npm run test:worker:e2e` verifica protocollo, ack, pairing, replay claim, revoca, cascade, CORS e health D1 reali. Un'app su GitHub Pages deve usare un Worker HTTPS; mixed content HTTP viene bloccato.
