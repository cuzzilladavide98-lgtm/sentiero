# Deploy Worker/D1 v60S.274.0

1. `npm ci`
2. `npx wrangler login`
3. `npx wrangler d1 create sentiero-sync`
4. Sostituire in `wrangler.toml` l'UUID D1 segnaposto e le origini locali con l'origine HTTPS esatta della PWA.
5. `npm run db:remote`
6. `npm run check`
7. `npm run deploy`
8. Inserire l'URL Worker nel meta `sentiero-services` di `index.html`.

Verificare `/health?deep=1` e `/v1/day/news` dall'origine autorizzata. Credenziali, UUID e origine di produzione non devono essere commessi. Procedura operativa completa: `../docs/SYNC-DEPLOYMENT.md`.
