# Riferimenti tecnici

Consultati durante la progettazione della release:

- Gemini Interactions API: https://ai.google.dev/gemini-api/docs/interactions-overview
- Gemini API reference: https://ai.google.dev/api
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Cloudflare Workers pricing/limits: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Cloudflare Scheduled handler: https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
- Configurazione Wrangler: https://developers.cloudflare.com/workers/wrangler/configuration/
- Migrazioni D1: https://developers.cloudflare.com/d1/reference/migrations/
- Comandi Wrangler D1: https://developers.cloudflare.com/d1/wrangler-commands/
- jsQR upstream: https://github.com/cozmo/jsQR

La pipeline esistente mantiene GenerateContent per la Distillazione, perché resta supportata ed era già coperta dalle prove reali della baseline; Interactions resta il percorso predefinito per le altre operazioni compatibili.
