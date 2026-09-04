import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { clusterNews, EDITORIAL_PUBLISH_THRESHOLD, fallbackEdition, looksItalian, selectEditorialStories } from '../sentiero-day.mjs';
import { CONTINUITY_MAX_AGE_MS, retainCurrentDaySnapshotItems } from '../tools/news-snapshot-continuity.mjs';

const run = promisify(execFile);
const snapshotUrl = new URL('../assets/giornale/latest.json', import.meta.url);

const fixturePublished = '2099-01-01T08:00:00.000Z';
const fixtureNow = Date.parse('2099-01-01T10:00:00.000Z');
const fixtureItem = (id, title, summary, area, perspective = 'primary') => ({
  id, title, summary, url: `https://${id}.example.test/notizia`, published: fixturePublished,
  source: `Fonte ${id}`, sourceId: `fonte-${id}`,
  sourceMeta: { perspective, area, language: 'it', tier: perspective === 'primary' ? 'A' : 'B', domain: `${id}.example.test` },
  provenance: { evidenceId: id, sourceId: `fonte-${id}`, sourceDomain: `${id}.example.test`, canonicalUrl: `https://${id}.example.test/notizia`, publishedAt: fixturePublished, retrievedAt: fixturePublished, contentFingerprint: `fp-${id}` },
  places: [], topics: [], media: null
});
const fixtureFeedItem = item => ({ ...item, sourceCode: item.sourceId });
const important = [
  fixtureItem('continuita-bilancio', 'Il Parlamento approva la legge di bilancio e il nuovo piano per l’economia', 'Il Parlamento ha approvato la legge di bilancio con nuove misure per famiglie, imprese e finanza pubblica.', 'economy'),
  fixtureItem('continuita-salute', 'L’OMS aggiorna il piano sanitario contro la nuova malattia respiratoria', 'L’Organizzazione mondiale della sanità ha aggiornato il piano per la salute e la risposta alla malattia respiratoria.', 'health'),
  fixtureItem('continuita-tregua', 'Guerra: firmato un accordo di cessate il fuoco con verifica internazionale', 'Le parti hanno firmato un accordo di pace e cessate il fuoco; osservatori internazionali verificheranno il rispetto della tregua.', 'world'),
  fixtureItem('continuita-clima', 'Alluvione e clima: evacuate migliaia di persone dopo le nuove piogge', 'Le autorità hanno evacuato migliaia di persone dopo l’alluvione; il piano per il clima prevede nuovi interventi urgenti.', 'climate'),
  fixtureItem('continuita-inchiesta', 'La Corte apre un’indagine sulle sanzioni e sui contratti pubblici', 'La Corte ha aperto un’indagine sulle sanzioni e sui contratti del governo, acquisendo nuovi documenti ufficiali.', 'institutions')
];
const churn = Array.from({ length: 7 }, (_, index) => fixtureItem(`continuita-debole-${index}`, `Podcast privato episodio ${index + 1} sulle relazioni di coppia`, 'Una curiosità personale raccontata in un podcast di relazioni, ricordi sentimentali e vita privata.', 'general', 'independent'));
const currentFeed = [important[0], ...churn].map(fixtureFeedItem);
const previousFixture = {
  dayKey: '2099-01-01', generatedAt: '2099-01-01T08:05:00.000Z', items: important,
  edition: { articles: important.map(item => ({ importance: 60, sourceIds: [item.id] })) }
};
const retained = retainCurrentDaySnapshotItems(currentFeed, previousFixture, '2099-01-01', 160, fixtureNow);
const currentOnly = retainCurrentDaySnapshotItems(currentFeed, null, '2099-01-01', 160, fixtureNow);
const editionFor = items => fallbackEdition(items, '2099-01-01', clusterNews(items).map(cluster => ({ ...cluster, changed: true, deltaType: 'new', deltaSummary: 'Nuova oggi.' })));
assert.equal(editionFor(currentOnly).articles.length, 1, 'la rotazione stateless riproduce il collasso a un articolo');
assert.equal(editionFor(retained).articles.length, 5, 'la continuità conserva le cinque storie forti già acquisite nello stesso giorno');
assert.ok(important.every(item => retained.some(candidate => candidate.url === item.url)), 'nessuna storia forte dello snapshot precedente viene persa per rotazione del feed');
assert.equal(retained.find(item => item.url === important[0].url).continuity.status, 'CURRENT', 'un item ancora nel feed resta CURRENT');
assert.equal(retained.find(item => item.url === important[1].url).continuity.status, 'CARRIED', 'un item espulso dal feed viene marcato CARRIED');
assert.equal(retained.find(item => item.url === important[1].url).provenance.retrievedAt, fixturePublished, 'CARRIED conserva il retrievedAt originale');
assert.equal(retained.filter(item => item.url === important[0].url).length, 1, 'CURRENT e CARRIED vengono deduplicati');
const expired = retainCurrentDaySnapshotItems(currentFeed, previousFixture, '2099-01-01', 160, fixtureNow + CONTINUITY_MAX_AGE_MS + 1);
assert.ok(!expired.some(item => item.url === important[1].url), 'una storia oltre la finestra di continuità esce');
assert.ok(!retainCurrentDaySnapshotItems(currentFeed, { ...previousFixture, dayKey: '2098-12-31' }, '2099-01-01', 160, fixtureNow).some(item => item.url === important[1].url), 'la continuità non trascina item da un giorno diverso');
assert.deepEqual(retainCurrentDaySnapshotItems([], previousFixture, '2099-01-01', 160, fixtureNow), [], 'assenza di feed nuovi è offline, non continuità online');
assert.equal(EDITORIAL_PUBLISH_THRESHOLD, 52, 'la continuità non cambia la soglia editoriale');
const foreignClusters = Array.from({ length: 20 }, (_, index) => {
  const code = `foreign-${index}`;
  const pair = ['primary', 'independent'].map(perspective => fixtureItem(
    `${code}-${perspective}`,
    `International ${code} war peace election law sanctions health climate economy agreement investigation`,
    `The ${code} government and parliament signed a ceasefire agreement affecting energy, inflation, health and climate policy.`,
    'world',
    perspective
  ));
  pair.forEach(item => { item.sourceMeta.language = 'en'; });
  return { id: code, storyId: `st-${code}`, items: pair, changed: true, deltaType: 'new', deltaSummary: 'New today.' };
});
const retainedClusters = clusterNews(retained).map(cluster => ({ ...cluster, changed: true, deltaType: 'new', deltaSummary: 'Nuova oggi.' }));
const stressedClusters = [...foreignClusters, ...retainedClusters];
const stressedItems = stressedClusters.flatMap(cluster => cluster.items);
assert.equal(selectEditorialStories(stressedClusters, 20, Date.parse(fixturePublished)).filter(cluster => cluster.items.some(item => item.sourceMeta.language === 'it' && looksItalian(`${item.title} ${item.summary}`))).length, 0, 'la shortlist globale riproduce l’espulsione delle storie italiane');
assert.equal(fallbackEdition(stressedItems, '2099-01-01', stressedClusters).articles.length, 5, 'fallbackEdition applica lingua e policy prima del limite degli slot');

const before = JSON.parse(fs.readFileSync(snapshotUrl, 'utf8'));
const startedAt = Date.now();
const { stdout } = await run(process.execPath, ['tools/build-news-snapshot.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 200000, windowsHide: true });
const execution = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
const after = JSON.parse(fs.readFileSync(snapshotUrl, 'utf8'));
const flat = fs.readFileSync(new URL('../latest.json', import.meta.url), 'utf8');
assert.equal(execution.ok, true);
assert.ok(Date.parse(after.generatedAt) >= startedAt - 1000);
assert.ok(Date.parse(after.generatedAt) > Date.parse(before.generatedAt));
assert.equal(after.sourcesUpdatedAt, after.generatedAt);
assert.equal(after.edition.sourceUpdatedAt, after.generatedAt);
assert.equal(after.edition.sourcesUpdatedAt, after.generatedAt);
assert.equal(after.continuity.maxAgeHours, 12);
assert.equal(after.continuity.currentItems + after.continuity.carriedItems, after.items.length);
assert.ok(after.items.filter(item => item.continuity?.status === 'CARRIED').every(item => Date.parse(item.provenance.retrievedAt) < Date.parse(after.generatedAt)), 'CARRIED non riceve un retrievedAt artificiale');
assert.ok(after.edition.articles.every(article => article.evidenceState === 'CURRENT' || article.evidenceState === 'CARRIED'));
assert.equal(after.dayKey, new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(Date.parse(after.generatedAt) - 260 * 60000)));
assert.ok(after.reachable >= 18 && after.parseable >= 14);
assert.ok(after.items.length >= 12 && after.edition.articles.length >= 1);
assert.ok(after.edition.articles.every(article => Number(article.importance) >= 52), 'nessun articolo sotto la soglia editoriale 52');
assert.equal(flat, fs.readFileSync(snapshotUrl, 'utf8'));

const workflow = fs.readFileSync(new URL('../.github/workflows/update-giornale.yml', import.meta.url), 'utf8');
assert.match(workflow, /run:\s*node tools\/build-news-snapshot\.mjs/);
assert.match(workflow, /git add assets\/giornale\/latest\.json latest\.json/);
assert.match(workflow, /git commit -m/);
assert.match(workflow, /git push/);
assert.match(workflow, /cron:\s*['"]43 \*\/2 \* \* \*['"]/);
console.log(JSON.stringify({ ok: true, generatedAt: after.generatedAt, reachable: after.reachable, parseable: after.parseable, items: after.items.length, articles: after.edition.articles.length }));
