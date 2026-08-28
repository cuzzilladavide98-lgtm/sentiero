# Deploy della sincronizzazione opzionale

Il codice è completo, ma il deploy richiede l'accesso umano a un account Cloudflare e la scelta dell'origine pubblica di Sentiero. Non inserire credenziali nel repository.

## 1. Crea D1

Da `sync-worker/`:

```bash
npm install
npx wrangler login
npx wrangler d1 create sentiero-sync
```

Copia il `database_id` restituito in `wrangler.toml`, sostituendo `REPLACE_WITH_D1_DATABASE_ID`.

## 2. Applica lo schema

```bash
npm run db:remote
```

## 3. Limita CORS

In `wrangler.toml` imposta `ALLOWED_ORIGINS` con l'origine esatta della PWA, senza percorso. Esempio:

```toml
ALLOWED_ORIGINS = "https://nome.github.io"
```

Più origini sono separate da virgola. Non lasciare vuoto in produzione.

## 4. Distribuisci

```bash
npm run deploy
```

Verifica `https://<worker>/health`, poi in Sentiero apri **Altro → Dispositivi**, inserisci l'URL HTTPS del Worker, scegli il nome dispositivo e attiva.

## Pairing e revoca

Sul primo dispositivo crea un invito. Sul secondo leggi il QR o incolla il codice; confronta le sei cifre su entrambi e approva solo se coincidono. L'invito scade dopo dieci minuti ed è monouso. Da Dispositivi puoi rinominare o revocare client; **Elimina dal server** cancella lo spazio e, tramite cascade D1, journal, dispositivi e inviti.

## Operazioni

- monitora errori Worker/D1 e consumo prima di un rollout ampio;
- il journal D1 è append-only per permettere a un nuovo dispositivo di ricostruire lo stato: prevedi monitoraggio, export e una futura politica di snapshot/compattazione prima di volumi elevati;
- configura rate limiting a livello Cloudflare se l'endpoint diventa pubblico;
- esegui backup D1 coerenti con la tua policy, ricordando che contengono ciphertext e metadati;
- non promettere recupero: senza root key su almeno un dispositivo i contenuti remoti non sono decifrabili;
- aggiorna informativa privacy e origine CORS se cambia dominio.

Sviluppo locale: `npm run db:local` seguito da `npm run dev`. Un'app su GitHub Pages deve usare un Worker HTTPS; mixed content HTTP viene bloccato.
