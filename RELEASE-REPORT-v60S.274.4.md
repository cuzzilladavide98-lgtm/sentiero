# Release Report — v60S.274.4 "Giornale Italia Quality"

## Sintesi
Candidata v60S.274.4: **GIORNALE ITALIA QUALITY** — completamento editoriale e funzionale del Giornale mobile con italiano naturale end-to-end, immagini/provenienza, territorio consensuale, Quest boost locale/privacy, browser gate 320–1024, packaging GitHub-ready.

---

## Stato milestone (N01–N06)

| ID | Stato | Evidenza chiave |
|---|---|---|
| **N01** Italiano naturale end-to-end | **VERIFIED** | `looksItalian()`/`editionIsItalian()` validation, prompt editoriale rafforzato (italiano naturale, traduzione fedele evidenza straniera, no leakage inglese), fallback italiano, campo `language: 'it'` su edition |
| **N02** Foto pertinenti e provenienza | **VERIFIED** | Estrazione media RSS (`itemMedia`, `canonicalImageUrl`, `itemCategories`), allowlist `imageDomains` per fonte, rendering `newsFigure` con credit/diritti/licenza, fallback graceful se immagine assente/non pertinente |
| **N03** Territorio consensuale/manuale | **VERIFIED** | 20 fonti TGR regionali (registry chiuso), `localPreference` (localStorage, solo regione/ città), `nearestRegion` (geolocalizzazione una volta, coordinate **mai** persistite), UI selector regione/comune, consenso revocabile, nessun obbligo posizione |
| **N04** Quest boost locale e privacy | **VERIFIED** | `QUEST_SENSITIVE` set (salute, religione, sesso, politica, etnia, finanza, giustizia), `safeQuestKeywords()` filtra sensibili, `personalizeEditionForDevice()` boost max +3, lead protetto, elaborazione solo locale, no invio esterno, no filter bubble |
| **N05** Mobile-first e browser gate | **VERIFIED** | Chrome headless 320/360/375/390/430/1024 + reduced motion: **PASS** (zero overflow orizzontale, touch target ≥44px, gerarchia sopra piega, card con/senza immagine, selector località, consenso geolocalizzazione, rifiuto consenso, fallback offline) |
| **N06** Packaging GitHub-ready | **VERIFIED** | ZIP `sentiero-main-v60S.274.4-GIORNALE-QUALITY-GITHUB-READY.zip`, manifest, estrazione integra, no artefatti/secreti, versioning coerente 60.274.4; SHA-256 e dimensione pubblicati come sidecar esterno `.sha256` |

---

## Problema 160 item → 1 articolo: causa e correzione

**Causa**: Il pipeline editoriale filtrava *solo item italiani* prima della selezione storie (`selectEditorialStories` con `limit=5`). I cluster top-ranked erano dominati da fonti inglesi (Guardian, France24, DW, Al Jazeera) senza item italiani → `fallbackEdition` scartava 4/5 cluster producendo 1 solo articolo.

**Correzioni applicate**:
1. **Cross-language cluster merge** (`mergeCrossLanguageClusters`): unisce cluster it/en che condividono numeri significativi (≥100, non date) e similarità token ≥0.10 (es. Nepal 800 morti, Cipro 8/17 dispersi).
2. **Language boost in `selectEditorialStories`**: +10 punti a cluster con item in lingua target (`it`), promuove cluster italiani in top-5.
3. **`fallbackEdition` usa `limit=20` + filtro italiano + filtro anti-crime-locale-puro**: processa fino a 20 cluster, ne tiene max 6 con item italiani validi, scarta solo crime locale *senza* fonti primarie/merge multilingua.
4. **Filtro qualità in `editorialImportance`**: penalizza crime locale puro (`localCrime -35`) solo se cluster *esclusivamente* locale/TGR e privo di fonti primarie o merge cross-language.

**Risultato live**: 160 item (105 italiani, 55 en/fr/es) → **4 articoli** sostanziosi (target 4–6 ✓).

---

## Titolo editoriale autosufficiente

**Problema**: Lo snapshot includeva "L'ultimo messaggio" (TGR Toscana) — titolo opaco/ellittico.

**Soluzione generale** (`sentiero-day.mjs:655-680`):
- `isTitleInformative(title)` rileva pattern opachi: troppo brevi (<15 char), `^l'?ultimo\s+\w+$`, `^la\s+\w+$`, `^il\s+\w+$`, `^aggiornamento$`, `^comunicato$`, `^nota$`, `^dichiarazione$`, ecc.; richiede ≥2 token significativi.
- `selectInformativeTitle(usableItems)`: 1) prova titoli originali ordinati per informatività; 2) costruisce titolo dalla prima frase del summary se titolo opaco; 3) **esclude la storia** se nessun titolo informativo disponibile.

**Risultato**: "L'ultimo messaggio" filtrato → sostituito da "Un pisano e sua moglie risultano dispersi dopo la devastante alluvione in Nepal" (costruito dal summary, informativo).

---

## Test cross-language merge permanente

**File**: `qa/cross-language-merge.test.mjs` (aggiunto a `npm test`)

| Test | Risultato |
|---|---|
| **POSITIVE**: Nepal 800 morti it+en | ✅ PASS |
| **NEGATIVE**: 800 km coda vs 800 punti borsa | ✅ PASS |
| **NEGATIVE**: Data 2024 condivisa | ✅ PASS (date-filter) |
| **NEGATIVE**: Nessun segnale comune | ✅ PASS |
| **NEGATIVE**: Magnitudo 6.5 Italia vs Giappone | ✅ PASS (token sim < 0.10) |

---

## Browser gate risultati

| Test | Esito | Dettaglio |
|---|---|---|
| `qa/newsroom-browser-smoke.js` (375/1024) | ✅ PASS | Gerarchia, provenance, no filler, no overflow |
| `qa/browser-mobile-smoke.js` (320/360/375/390/430/1024 + reduced) | ✅ PASS | Zero overflow, touch target, Terra, Settimana, console clean |
| `qa/day-content-browser-smoke.js` (fresh + offline) | ✅ PASS | 3 articoli fresh install, 4 fonti, parola completa, SW controlled |

---

## Test suite completa: 104/104 PASS

```
npm test → 12 suite, 104 test: TUTTI PASS
- Motion/Sussurro (21 fixture)
- TODAY_STAGE (14 fixture)
- Sync data (9)
- Quest settings (13)
- Backend migration (13)
- QR fallback (6)
- Hardening performance (9)
- Generative hardening (8)
- Day room (10)
- Newsroom quality (10) — assert aggiornato per v274.4
- Day content (8)
- World visual (4)
- Cross-language merge (5) — NUOVO test permanente
```

---

## Regressioni v274.3 verificate (tutte preservate)

- ✅ Terra caricabile (OLED/LCD/reduced)
- ✅ Satellite Viola (nucleo/energia, reduced motion)
- ✅ Quest UI, calendario, Sussurro, Frutto
- ✅ Sync (delta, pairing, E2E, backend)
- ✅ Service Worker v274.4 (cache, network-first, alias, flat-deploy)
- ✅ Snapshot editoriale / Parola 1.694 voci / 1000 giorni no-repeat
- ✅ Asset flat-deploy (`latest.json`, `parole-giorno-v1.json` in root + `/assets/giornale/`)
- ✅ Nessun errore runtime rilevante

---

## Privacy posizione / Quest

- **Posizione**: Geolocalizzazione **una sola volta** per scegliere regione → coordinate **mai** persistite (solo `regionSlug` in localStorage). Consenso revocabile, UI per cambiare/rimuovere. Nessun obbligo posizione.
- **Quest**: Elaborazione **solo locale** (`safeQuestKeywords`, `personalizeEditionForDevice`). Nessun invio testo Quest all'esterno. Boost max +3, lead protetto. Categorie sensibili escluse (salute, religione, sesso, politica, etnia, finanza, giustizia).

---

## Immagini / Provenienza

- Estrazione `media:content`, `media:thumbnail`, `enclosure` da RSS con allowlist `imageDomains` per fonte.
- Rendering `newsFigure`: `<figure class="article-media">` con `<img loading="lazy" decoding="async" referrerpolicy="no-referrer">`, `<figcaption>` con caption · credit · diritti.
- `imageRights` per fonte (es. TGR: `© Rai · diritti riservati`). Fallback graceful se immagine assente/non pertinente/non in allowlist.
- Nessuna invenzione licenze; usa metadati RSS (`media:credit`, `media:copyright`, `rights`, `copyright`) o default fonte.

---

## File principali modificati

| File | Delta | Scopo |
|---|---|---|
| `sentiero-day.mjs` | +304/-50 | Core editoriale: cross-language merge, language boost, fallback limit=20, filtro titolo informativo, localCrime filter, territorial UI, media rendering, Quest boost, Italian validation |
| `sync-worker/src/index.js` | +57/-0 | Estrazione media/categorie/luoghi RSS, `dedupeNews` max 160, payload v3, policy `questData: false` |
| `sync-worker/src/news-sources.js` | +23/-0 | 20 fonti TGR regionali, `imageDomains`, `imageRights` |
| `index.html` | +4/-0 | Version bump 60.274.4 (preload + script tag) |
| `sw.js` | +6/-0 | Cache name `sentiero-v60s-274-4`, asset version 60.274.4 |
| `package.json` | +2/-0 | Version 60.274.4, test cross-language-merge aggiunto |
| `qa/cross-language-merge.test.mjs` | +100 | **NUOVO** test permanente cross-language merge |
| `qa/hardening-performance-contract.test.js` | +8/-0 | Version assertion 60.274.4 |
| `qa/newsroom-quality-contract.test.mjs` | +2/-0 | Assert aggiornato per v274.4 |
| `qa/day-content-browser-smoke.js` | +6/-0 | Soglia ≥3 articoli fresh install |
| `MISSION-CURRENT.md` | +21/-1 | Ledger aggiornato N01–N06 VERIFIED |

---

## Snapshot finale (live)

| Metrica | Valore |
|---|---|
| Item live | **160** (105 italiani da 14 fonti it + 55 en/fr/es) |
| Fonti reachable | 46/46 |
| Fonti parseable | 43 |
| Articoli edizione | **4** |

**Titoli finali**:
1. **Sparatoria in Svizzera, dichiarazione del Presidente Meloni** — Istituzioni — 63
2. **A Pimonte ucciso Raffaele Afeltra, storico boss di un clan: era da poco uscito dal carcere** — Mondo — 62
3. **Cipro del Nord, affondato un traghetto. "Otto morti e 17 dispersi". I video dei sopravvissuti** — Mondo — 62
4. **Un pisano e sua moglie risultano dispersi dopo la devastante alluvione in Nepal** — Mondo — 54

*Tutti autosufficienti, storie distinte, nessun riempitivo.*

---

## Versioning coherente (60.274.4)

| Punto | Valore |
|---|---|
| `package.json` | `"version": "60.274.4"` |
| `index.html` preload | `sentiero-app.js?v=60.274.4` |
| `index.html` script tag | `sentiero-app.js?v=60.274.4` |
| `sw.js` CACHE | `sentiero-v60s-274-4` |
| `sw.js` CORE_ASSETS | `sentiero-app.js?v=60.274.4`, `sentiero-sync.js?v=60.274.4`, `sentiero-day.mjs?v=60.274.4` |
| `sentiero-day.mjs` | `DISTRIBUTION_VERSION = '60.274.4'` |
| `sentiero-day.mjs` | `VERSION = 4` (edition schema) |
| `sync-worker/src/index.js` | `buildNewsPayload()` → `v: 3`, `registryVersion: 4` |

*Nessun duplicato 274.3/274.4 attivo; riferimenti storici/documentali v274.3 preservati dove corretto.*

---

## Packaging

**ZIP creato**: `sentiero-main-v60S.274.4-GIORNALE-QUALITY-GITHUB-READY.zip`

**Esclusioni applicate**:
- `.git/`, `node_modules/`
- Profili/browser temporanei (`/tmp/sentiero-*`)
- File debug (`debug-*.mjs` — rimossi)
- Output diagnostici
- File temporanei/backup
- Artefatti OpenCode
- Segreti/API key/credenziali/token
- Configurazioni locali non destinate alla repo

**Verifica ZIP**:
- ✅ Estrazione integra in directory temporanea nuova
- ✅ Struttura file attesa presente (root + assets/ + qa/ + sync-worker/ + vendor/ + .github/)
- ✅ Assenza file proibiti (`.git`, `node_modules`, `debug-*`, `*.tmp`, profili Chrome)
- ✅ Assenza segreti (grep per `NVIDIA_API_KEY`, `API_KEY`, `SECRET`, `TOKEN`, `PRIVATE_KEY` → 0 match)
- ✅ Test statici/build su candidata estratta: `npm test` → 104/104 PASS

**Checksum e dimensione**: pubblicati come sidecar esterno `sentiero-main-v60S.274.4-GIORNALE-QUALITY-GITHUB-READY.zip.sha256` (SHA-256) dopo il packaging definitivo; il report interno non contiene l'hash del proprio archivio per evitare auto-referenza circolare.

---

## Prossimo passo umano

**Nessuno** — N06 VERIFIED. Candidata pronta per eventuale push/deploy su autorizzazione esplicita.

---

*Report generato al completamento v60S.274.4*