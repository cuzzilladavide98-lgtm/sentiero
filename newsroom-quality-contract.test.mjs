import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  clusterNews, claimEvidenceDetail, claimEvidenceScore, editorialImportance,
  fallbackEdition, materiallyChanged, selectEditorialStories, storyDelta, validateEdition
} from '../sentiero-day.mjs';
import { NEWS_SOURCES } from '../sync-worker/src/news-sources.js';
import { buildNewsPayload, parseFeed } from '../sync-worker/src/index.js';

const now = new Date().toISOString();
function evidence(id, title, summary, sourceId, perspective, tier = 'B', area = 'world', language = 'en') {
  const domain = sourceId + '.example', url = `https://${domain}/${id}`;
  return { id, title, summary, url, published: now, source: sourceId.toUpperCase(), sourceId, sourceMeta: { domain, perspective, tier, area, language }, provenance: { evidenceId: id, sourceId, sourceDomain: domain, canonicalUrl: url, publishedAt: now, retrievedAt: now, contentFingerprint: 'fp-' + id } };
}

const ratePrimary = evidence('ecb-1', 'La BCE taglia i tassi di interesse di 0,25 punti', 'La banca centrale ha ridotto il tasso di riferimento di 0,25 punti percentuali.', 'ecb', 'primary', 'A', 'economy', 'it');
const rateIndependent = evidence('bbc-1', 'ECB cuts interest rates by 0.25 percentage points', 'The central bank reduced its reference interest rate by 0.25 percentage points.', 'bbc', 'independent', 'B', 'economy', 'en');
const health = evidence('who-1', 'WHO publishes a vaccine safety report', 'The health agency published new vaccine safety data.', 'who', 'primary', 'A', 'health', 'en');

const multilingual = clusterNews([ratePrimary, rateIndependent, health]);
assert.equal(multilingual.length, 2, 'lo stesso fatto it/en forma una sola storia');
const rateCluster = multilingual.find(cluster => cluster.items.length === 2);
assert.ok(rateCluster, 'cluster multilingua presente');

const supported = claimEvidenceDetail('La BCE ha ridotto i tassi di interesse di 0,25 punti percentuali.', ['ecb-1', 'bbc-1'], [ratePrimary, rateIndependent]);
assert.equal(supported.supported, true);
assert.equal(supported.numericSupport, true);
assert.equal(supported.provenance.length, 2);
assert.ok(supported.corroboration > 0, 'primaria e indipendente sono distinguibili');
assert.equal(claimEvidenceScore('La BCE ha ridotto i tassi di 0,50 punti.', ['ecb-1'], [ratePrimary]), 0, 'numero non presente respinto');

const uncertain = evidence('noaa-1', 'Flooding could affect 2 million people', 'The agency estimates that flooding could affect 2 million people.', 'noaa', 'primary', 'A', 'climate', 'en');
assert.equal(claimEvidenceDetail('Le alluvioni colpiranno 2 milioni di persone.', ['noaa-1'], [uncertain]).supported, false, 'la possibilità non diventa certezza');

const unchangedPrevious = { signature: rateCluster.signature, numbers: '0.25', sourceIds: ['ecb', 'bbc'], sourceTiers: ['A', 'B'], lastSeen: '2026-08-28', negated: false, lastClaims: ['La BCE ha ridotto i tassi.'] };
assert.equal(materiallyChanged(unchangedPrevious, rateCluster), false, 'la ripetizione non è sviluppo');
const changedEvidence = evidence('ecb-2', 'La BCE taglia i tassi di interesse di 0,50 punti', 'La banca centrale ha ridotto il tasso di riferimento di 0,50 punti percentuali.', 'ecb', 'primary', 'A', 'economy', 'it');
const changedCluster = clusterNews([changedEvidence, rateIndependent])[0];
const delta = storyDelta(unchangedPrevious, changedCluster, '2026-08-29');
assert.equal(delta.type, 'developed'); assert.ok(delta.addedNumbers.includes('0.50'));

const negatedEvidence = evidence('ecb-3', 'La BCE non taglia i tassi di interesse', 'La banca centrale non ha ridotto il tasso di riferimento.', 'ecb', 'primary', 'A', 'economy', 'it');
assert.equal(claimEvidenceDetail('La BCE ha ridotto il tasso di riferimento.', ['ecb-3'], [negatedEvidence]).supported, false, 'una negazione non può sostenere il claim positivo opposto');
const correction = storyDelta(unchangedPrevious, clusterNews([negatedEvidence])[0], '2026-08-29');
assert.equal(correction.type, 'corrected', 'un rovesciamento fattuale diventa correzione');

rateCluster.changed = true; rateCluster.deltaType = 'developed';
const important = editorialImportance(rateCluster, Date.now());
const ceremonial = clusterNews([evidence('nasa-ceremony', 'NASA celebrates anniversary with conference', 'The agency celebrates an anniversary with an online conference.', 'nasa', 'primary', 'A', 'science', 'en')])[0]; ceremonial.changed = true; ceremonial.deltaType = 'new';
assert.ok(important.score > editorialImportance(ceremonial, Date.now()).score, 'conseguenze e verifica battono il cerimoniale');
assert.equal(selectEditorialStories([ceremonial], 12, Date.now()).length, 0, 'nessun articolo viene creato per riempire');

rateCluster.importance = important; rateCluster.deltaSummary = 'Da ieri: il tasso è stato ridotto.'; rateCluster.deltaType = 'developed';
const oneArticle = {
  title: 'La BCE riduce i tassi di interesse', deck: 'Una decisione che cambia il costo del denaro.', corrections: [],
  articles: [{ section: 'Economia', title: 'La BCE riduce i tassi di interesse', kicker: 'Il cambiamento riguarda il tasso di riferimento.', storyIds: [rateCluster.storyId], claims: [{ text: 'La BCE ha ridotto il tasso di riferimento di 0,25 punti percentuali.', sourceIds: ['ecb-1', 'bbc-1'] }] }]
};
const validated = validateEdition(oneArticle, [ratePrimary, rateIndependent], '2026-08-29', new Set([rateCluster.storyId]), new Map([[rateCluster.storyId, rateCluster]]));
assert.ok(validated, 'una sola storia degna produce una sola storia, senza minimo artificiale');
assert.equal(validated.articles.length, 1); assert.equal(validated.articles[0].presentation, 'lead'); assert.equal(validated.articles[0].provenance, undefined);
assert.equal(validated.articles[0].claims[0].provenance.length, 2);

const essential = fallbackEdition([ratePrimary, rateIndependent], '2026-08-29', [rateCluster]);
assert.ok(essential, 'fallback editoriale disponibile senza Gemini');
assert.equal(essential.articles.length, 1, 'il fallback non aggiunge riempitivi');
assert.equal(essential.articles[0].presentation, 'lead');
assert.ok(essential.articles[0].claims.every(claim => claim.provenance.length));

assert.ok(NEWS_SOURCES.length >= 24, 'registry drasticamente ampliato');
assert.ok(NEWS_SOURCES.filter(source => source.perspective === 'primary').length >= 10);
assert.ok(NEWS_SOURCES.filter(source => source.perspective === 'independent').length >= 12);
assert.ok(new Set(NEWS_SOURCES.map(source => source.language)).size >= 4);
for (const source of NEWS_SOURCES) for (const field of ['sourceId', 'name', 'domain', 'type', 'perspective', 'ownership', 'country', 'coverage', 'area', 'language', 'tier', 'role', 'retrieval', 'freshnessMinutes', 'reliability', 'terms', 'url']) assert.ok(source[field], source.sourceId + ':' + field);

const feedSource = NEWS_SOURCES.find(source => source.sourceId === 'ecb');
const goodFeed = `<?xml version="1.0"?><rss><channel><item><title>ECB decision on interest rates</title><link>https://www.ecb.europa.eu/press/a.html</link><description>The ECB reduced interest rates by 0.25 percentage points.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
const parsed = parseFeed(goodFeed, feedSource); assert.equal(parsed.length, 1); assert.ok(parsed[0].provenance.evidenceId); assert.equal(parsed[0].provenance.sourceDomain, 'ecb.europa.eu');
const poisonedFeed = goodFeed.replace('https://www.ecb.europa.eu/press/a.html', 'https://attacker.example/a');
assert.equal(parseFeed(poisonedFeed, feedSource).length, 0, 'il feed non può introdurre un dominio arbitrario');
const skySource = NEWS_SOURCES.find(source => source.sourceId === 'sky-tg24');
const italianDateFeed = `<?xml version="1.0"?><rss><channel><item><title>Aggiornamento economico documentato</title><link>https://tg24.sky.it/economia/prova</link><description>Un aggiornamento economico documentato e verificabile.</description><pubDate>ven, 28 ago 2026 23:59:00 GMT</pubDate></item></channel></rss>`;
assert.equal(parseFeed(italianDateFeed, skySource, Date.UTC(2026, 7, 29, 12)).length, 1, 'le date RSS italiane sono normalizzate');

const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  const source = NEWS_SOURCES.find(item => item.url === String(url)); assert.ok(source, 'solo registry fisso');
  const itemUrl = `https://${source.linkDomains[0]}/news/${source.sourceId}`;
  return new Response(`<?xml version="1.0"?><rss><channel><item><title>${source.name} public-interest update</title><link>${itemUrl}</link><description>${source.name} publishes a documented public-interest update with verifiable evidence.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
};
try {
  const payload = await buildNewsPayload();
  assert.equal(payload.v, 2); assert.equal(payload.registrySize, NEWS_SOURCES.length); assert.equal(payload.sourceCount, NEWS_SOURCES.length); assert.equal(payload.failures, 0); assert.equal(payload.policy.userSuppliedUrls, false); assert.ok(payload.items.every(item => item.provenance && item.sourceMeta.perspective));
} finally { globalThis.fetch = originalFetch; }

const daySource = fs.readFileSync(new URL('../sentiero-day.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(daySource, /items\.length\s*<\s*3|articles\.length\s*>=\s*3|minItems:\s*4|Crea 4-7 articoli/i);
assert.match(daySource, /Editorial Critic avversariale/);
assert.match(daySource, /edition-front/);

console.log(JSON.stringify({ ok: true, registry: NEWS_SOURCES.length, primary: NEWS_SOURCES.filter(source => source.perspective === 'primary').length, independent: NEWS_SOURCES.filter(source => source.perspective === 'independent').length, languages: new Set(NEWS_SOURCES.map(source => source.language)).size }));
