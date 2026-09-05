import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clusterNews, sanitizeEditorial, selectInformativeTitle } from '../sentiero-day.mjs';
import { parseFeed } from '../sync-worker/src/index.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/news-editorial-integrity.json', import.meta.url), 'utf8'));
const published = '2026-09-04T13:30:00.000Z';

function evidence(row) {
  return {
    id: row.id, title: row.title, summary: row.summary,
    url: `https://${row.sourceId}.example.test/${row.id}`, published,
    source: row.source, sourceId: row.sourceId,
    sourceMeta: { language: 'it', area: row.area, perspective: row.perspective, tier: row.tier, domain: `${row.sourceId}.example.test` },
    provenance: { evidenceId: row.id, sourceId: row.sourceId, sourceDomain: `${row.sourceId}.example.test`, canonicalUrl: `https://${row.sourceId}.example.test/${row.id}`, publishedAt: published, retrievedAt: published, contentFingerprint: `fp-${row.id}` },
    places: [], topics: [], media: null
  };
}

for (const pair of fixture.falsePairs) {
  assert.equal(clusterNews(pair.map(evidence)).length, 2, `${pair[0].id} e ${pair[1].id} sono eventi distinti`);
}

const paraphrase = [
  evidence({ id: 'bce-it', title: "La BCE taglia i tassi d'interesse dopo il calo dell'inflazione", summary: "La banca centrale europea riduce il costo del denaro dopo il rallentamento dell'inflazione.", source: 'RaiNews', sourceId: 'rai', area: 'economy', perspective: 'independent', tier: 'B' }),
  { ...evidence({ id: 'ecb-en', title: 'ECB cuts interest rates after inflation falls', summary: 'The European Central Bank lowers borrowing costs as inflation declines.', source: 'BBC', sourceId: 'bbc', area: 'economy', perspective: 'independent', tier: 'B' }), sourceMeta: { language: 'en', area: 'economy', perspective: 'independent', tier: 'B', domain: 'bbc.example.test' } }
];
assert.equal(clusterNews(paraphrase).length, 1, 'la stessa decisione parafrasata tra lingue resta unita');

const complete = selectInformativeTitle([
  { title: 'Milei rilancia sulle Falkland ma Londra non ci sente: sono britanniche...', summary: 'Il presidente argentino rilancia la rivendicazione sulle isole.' },
  { title: 'Milei rilancia la rivendicazione sulle Falkland. Londra: "Sono britanniche"', summary: 'Il presidente argentino promette nuove misure.' }
]);
assert.equal(complete, 'Milei rilancia la rivendicazione sulle Falkland. Londra: "Sono britanniche"');

const derived = selectInformativeTitle([
  { title: 'Il ministro Urso auspica una proposta vincolante della cordata italiana...', summary: "La cordata italiana presenta una manifestazione di interesse per l'ex Ilva. I commissari valuteranno il piano industriale." }
]);
assert.ok(derived && !/(?:…|\.{2,})$/.test(derived), 'un titolo monco usa una frase fattuale completa');

const hostile = 'Prima &lt;div&gt;pagina &lt;strong&gt;utile&lt;/strong&gt; &lt;script&gt;rubami&lt;/script&gt;&lt;/div&gt; ' + 'testo '.repeat(260) + '&lt;div class="coda"&gt;fine&lt;/div&gt;';
const cleaned = sanitizeEditorial(hostile, 1200);
assert.ok(cleaned.startsWith('Prima pagina utile'));
assert.equal(/[<>]|rubami|script|class="coda"/i.test(cleaned), false, 'markup annidato decodificato e rimosso prima del limite');
assert.ok(cleaned.length <= 1200);
assert.doesNotThrow(() => sanitizeEditorial('testo &#x110000; ancora &#999999999999; valido', 120));
assert.equal(sanitizeEditorial('testo &#x110000; ancora &#999999999999; valido', 120), 'testo ancora valido', 'entita numeriche fuori Unicode non interrompono la raccolta');

const feedSource = { sourceId: 'fixture', name: 'Fixture', url: 'https://fixture.example.test/feed.xml', domain: 'fixture.example.test', language: 'it', area: 'institutions', perspective: 'primary', tier: 'A', coverage: 'national' };
const feed = `<rss><channel><item><title>Una decisione pubblica verificabile</title><link>https://fixture.example.test/notizia</link><pubDate>Fri, 04 Sep 2026 13:30:00 GMT</pubDate><description>${hostile}</description></item></channel></rss>`;
const parsed = parseFeed(feed, feedSource, Date.parse('2026-09-04T15:00:00.000Z'));
assert.equal(parsed.length, 1);
assert.equal(/[<>]|rubami|script|class="coda"/i.test(parsed[0].summary), false, 'anche il confine RSS consegna solo testo');
assert.ok(parsed[0].summary.length <= 1200);

console.log('PASS integrita editoriale: cluster, titoli e markup');
