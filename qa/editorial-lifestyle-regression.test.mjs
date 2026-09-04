import assert from 'node:assert/strict';
import { clusterNews, fallbackEdition, selectEditorialStories } from '../sentiero-day.mjs';

const published = '2099-01-01T10:00:00.000Z';
const makeItem = (id, title, summary, area, perspective = 'independent') => ({
  id, title, summary, url: `https://${id}.example.test/notizia`, published,
  source: `Fonte ${id}`, sourceId: `fonte-${id}`,
  sourceMeta: { perspective, area, language: 'it', tier: perspective === 'primary' ? 'A' : 'B', domain: `${id}.example.test` },
  provenance: { evidenceId: id, sourceId: `fonte-${id}`, sourceDomain: `${id}.example.test`, canonicalUrl: `https://${id}.example.test/notizia`, publishedAt: published, retrievedAt: published, contentFingerprint: `fp-${id}` },
  places: [], topics: [], media: null
});

const items = [
  makeItem('bilancio', 'Il Parlamento approva la legge di bilancio e il nuovo piano per l’economia', 'Il Parlamento ha approvato la legge di bilancio con nuove misure per famiglie, imprese e finanza pubblica.', 'economy', 'primary'),
  makeItem('salute', 'L’OMS aggiorna il piano sanitario contro la nuova malattia respiratoria', 'L’Organizzazione mondiale della sanità ha aggiornato il piano per la salute e la risposta alla malattia respiratoria.', 'health', 'primary'),
  makeItem('tregua', 'Guerra: firmato un accordo di cessate il fuoco con verifica internazionale', 'Le parti hanno firmato un accordo di pace e cessate il fuoco; osservatori internazionali verificheranno il rispetto della tregua.', 'world'),
  makeItem('clima', 'Alluvione e clima: evacuate migliaia di persone dopo le nuove piogge', 'Le autorità hanno evacuato migliaia di persone dopo l’alluvione; il piano per il clima prevede nuovi interventi urgenti.', 'climate', 'primary'),
  makeItem('inchiesta', 'La Corte apre un’indagine sulle sanzioni e sui contratti pubblici', 'La Corte ha aperto un’indagine sulle sanzioni e sui contratti del governo, acquisendo nuovi documenti ufficiali.', 'institutions'),
  makeItem('lifestyle', 'Suonano alla porta, è un’altra donna', 'Un podcast sulle relazioni personali racconta una curiosità privata di coppia e raccoglie ricordi sentimentali.', 'general')
];

const clusters = clusterNews(items).map(cluster => ({ ...cluster, changed: true, deltaType: 'new', deltaSummary: 'Nuova oggi.' }));
const eligible = selectEditorialStories(clusters, 20, Date.parse(published));
const scored = items.map(item => {
  const cluster = eligible.find(candidate => candidate.items.some(source => source.id === item.id));
  return { title: item.title, importance: cluster ? cluster.importance.score : 0, reasons: cluster ? cluster.importance.reasons : [] };
});
const edition = fallbackEdition(items, '2099-01-01', clusters);
const selectedTitles = (edition?.articles || []).map(article => article.title);

console.log(JSON.stringify({ input: scored, selected: selectedTitles }, null, 2));
assert.ok(edition, 'la pipeline production deve produrre un’edizione');
assert.equal(edition.articles.length, 5, 'cinque storie forti: nessun sesto articolo di riempimento');
assert.ok(scored.slice(0, 5).every(item => item.importance >= 52), 'le cinque storie importanti restano sopra la soglia 52');
assert.ok(scored[5].importance < 52, 'la storia lifestyle resta sotto la soglia 52');
assert.ok(!selectedTitles.includes(items[5].title), 'la storia lifestyle non occupa uno slot');
for (const item of items.slice(0, 5)) assert.ok(selectedTitles.includes(item.title), `storia forte esclusa: ${item.title}`);
console.log(`PASS lifestyle/no filler: ${edition.articles.length} articoli forti; lifestyle esclusa a importance ${scored[5].importance} (<52)`);
