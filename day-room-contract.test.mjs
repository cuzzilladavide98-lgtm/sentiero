import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDaytime, sentieroDayKey, mondayKey, addCivilDays, projectWeek, normalizeWord, selectWord, clusterNews, claimEvidenceScore, validateEdition, materiallyChanged } from '../sentiero-day.mjs';
import { NEWS_SOURCES } from '../sync-worker/src/news-sources.js';
import { parseFeed, dedupeNews, boundedText } from '../sync-worker/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (hour, minute) => new Date(2026, 7, 28, hour, minute, 0, 0);
assert.equal(isDaytime(at(4, 19)), false);
assert.equal(isDaytime(at(4, 20)), true);
assert.equal(isDaytime(at(18, 59)), true);
assert.equal(isDaytime(at(19, 0)), false);
assert.equal(sentieroDayKey(at(4, 19)), '2026-08-27');
assert.equal(sentieroDayKey(at(4, 20)), '2026-08-28');
assert.equal(mondayKey('2026-08-28'), '2026-08-24');
assert.equal(addCivilDays('2026-08-28', 7), '2026-09-04');

const quests = [
  { id: 'same', titolo: 'Visita', quando: '2026-08-29', ora: '10:30', prio: 2 },
  { id: 'free', titolo: 'Senza ora', quando: '2026-08-30', ora: '', prio: 3 },
  { id: 'stage-only', titolo: 'TODAY_STAGE non temporale' }
];
let week = projectWeek(quests, '2026-08-24');
assert.deepEqual(week.map(item => item.id), ['same', 'free']);
quests[0].ora = '07:00';
week = projectWeek(quests, '2026-08-24');
assert.equal(week[0], quests[0], 'la proiezione conserva identità e dato originale');
assert.equal(week[0].ora, '07:00');

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/parole-giorno-v1.json'), 'utf8'));
assert.ok(catalog.words.length >= 1000);
const history = {}, seen = new Set();
for (let day = 0; day < 1000; day++) {
  const key = addCivilDays('2026-01-01', day), word = selectWord(catalog.words, key, history);
  assert.ok(word, 'parola disponibile al giorno ' + day);
  const normalized = normalizeWord(word.w); assert.ok(!seen.has(normalized), 'nessun duplicato: ' + word.w);
  seen.add(normalized); history[key] = { id: word.id, w: word.w, n: normalized, l: word.l };
}
assert.equal(seen.size, 1000);
assert.equal(normalizeWord('Café'), normalizeWord('café'));

const now = new Date().toISOString();
const sources = [
  { id: 's1', title: 'La banca centrale riduce il tasso di riferimento', summary: 'La banca centrale riduce il tasso di riferimento dopo il rallentamento dell’inflazione.', url: 'https://example.test/1', published: now, source: 'Banca', sourceMeta: { tier: 'A' } },
  { id: 's2', title: 'Nuova missione scientifica nello spazio', summary: 'La missione scientifica studierà il clima terrestre e raccoglierà misure per cinque anni.', url: 'https://example.test/2', published: now, source: 'Scienza', sourceMeta: { tier: 'A' } },
  { id: 's3', title: 'Parlamento approva la nuova legge energetica', summary: 'Il parlamento approva la legge energetica che entrerà in vigore nel prossimo anno.', url: 'https://example.test/3', published: now, source: 'Parlamento', sourceMeta: { tier: 'A' } }
];
assert.ok(claimEvidenceScore('La banca centrale riduce il tasso dopo il rallentamento dell’inflazione.', ['s1'], sources) >= .38);
assert.equal(claimEvidenceScore('Un vulcano ha distrutto una capitale ieri.', ['s1'], sources), 0);
const raw = { title: 'Il Giornale di Sentiero', deck: 'Il quadro che cambia.', corrections: [], articles: sources.map((source, index) => ({
  section: ['Economia', 'Scienza', 'Europa'][index], title: source.title, kicker: source.summary,
  storyIds: ['st-' + (index + 1)], claims: [{ text: source.summary, sourceIds: [source.id] }]
})) };
assert.ok(validateEdition(raw, sources, '2026-08-28'));
const poisoned = structuredClone(raw); poisoned.articles[0].claims[0].text = 'Un vulcano ha distrutto una capitale ieri.';
assert.equal(validateEdition(poisoned, sources, '2026-08-28'), null, 'claim non supportato respinto');

const repeats = Array.from({ length: 10 }, (_, index) => ({ ...sources[0], id: 'r' + index, url: 'https://example.test/r' + index }));
assert.equal(clusterNews(repeats).length, 1, 'dieci repliche diventano una storia');
assert.equal(materiallyChanged({ signature: [...new Set(['banca', 'centrale', 'riduce', 'tasso', 'riferimento', 'rallentamento', 'inflazione'])], numbers: '', sourceTiers: ['A'] }, { items: [sources[0]] }), false);
assert.equal(materiallyChanged({ signature: ['banca', 'centrale', 'riduce', 'tasso', 'riferimento', 'rallentamento', 'inflazione'], numbers: '', sourceTiers: ['B'] }, { items: [sources[0]] }), false, 'una ripetizione primaria non finge un delta');

assert.ok(NEWS_SOURCES.length >= 5);
for (const source of NEWS_SOURCES) for (const field of ['sourceId', 'name', 'domain', 'type', 'area', 'language', 'tier', 'role', 'retrieval', 'freshnessMinutes', 'reliability', 'terms', 'url']) assert.ok(source[field], source.sourceId + ':' + field);
const feed = `<?xml version="1.0"?><rss><channel><item><title>Decisione verificata</title><link>https://www.istat.it/a</link><description>Testo pubblico sufficiente per una scheda editoriale.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
assert.equal(parseFeed(feed, NEWS_SOURCES[0]).length, 1);
assert.equal(dedupeNews([...parseFeed(feed, NEWS_SOURCES[0]), ...parseFeed(feed, NEWS_SOURCES[0])]).length, 1);
await assert.rejects(() => boundedText(new Response('x'.repeat(128), { headers: { 'content-length': '128' } }), 64), /feed_too_large/);

const daySource = fs.readFileSync(path.join(root, 'sentiero-day.mjs'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'sentiero-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'sentiero-sync.js'), 'utf8');
assert.doesNotMatch(daySource, /overflow-x\s*:\s*auto|Il Messaggero/);
assert.match(daySource, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
assert.match(appSource, /apriStanzaTerra/);
assert.match(appSource, /maxOutputTokens:180,reasoning:'minimal',timeout:30000,priority:55/);
assert.match(html, /id="giorno-terra"/);
assert.match(html, /terra-luna-giro/);
assert.match(sync, /MAP_COLLECTIONS=.*'paroleGiorno'/);
console.log(JSON.stringify({ ok: true, words: catalog.words.length, noRepeatDays: seen.size, sources: NEWS_SOURCES.length }));
