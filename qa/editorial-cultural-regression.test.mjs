import assert from 'node:assert/strict';
import { clusterNews, selectEditorialStories, selectInformativeTitle } from '../sentiero-day.mjs';

const now = Date.parse('2099-01-01T12:00:00.000Z');
function item(id, source, perspective, title, summary) {
  const published = '2099-01-01T10:00:00.000Z';
  return {
    id, title, summary, url: `https://${source}.example.test/${id}`, published, source, sourceId: source,
    sourceMeta: { perspective, area: 'world', language: 'it', tier: perspective === 'primary' ? 'A' : 'B', domain: `${source}.example.test` },
    provenance: { evidenceId: id, sourceId: source, sourceDomain: `${source}.example.test`, canonicalUrl: `https://${source}.example.test/${id}`, publishedAt: published, retrievedAt: published, contentFingerprint: `fp-${id}` },
    places: [], topics: ['cultura'], media: null
  };
}
function scored(items) {
  return selectEditorialStories(clusterNews(items).map(cluster => ({ ...cluster, changed: true, deltaType: 'new' })), 12, now);
}

const strong = [
  item('museum-primary', 'museo', 'primary', 'Il Museo nazionale riapre dopo il terremoto: salvate 20000 opere', 'Il Museo nazionale riapre dopo il terremoto grazie al restauro che ha messo in sicurezza 20000 opere della collezione pubblica.'),
  item('museum-independent', 'cultura', 'independent', 'Riapre il Museo nazionale: restaurate 20000 opere dopo il terremoto', 'Dopo il terremoto il Museo nazionale riapre al pubblico: il restauro ha protetto 20000 opere e ricostruito le sale danneggiate.')
];
const weak = item('festival-weak', 'rivista', 'independent', 'Un’edizione speciale del festival di fotografia', 'Una selezione dei lavori in mostra accompagna la nuova edizione della manifestazione culturale.');
const summaryFact = item('festival-fact', 'internazionale', 'independent', 'Un’edizione speciale del festival di Perpignan', 'Nei giorni della manifestazione dedicata al fotogiornalismo Visa pour l’image è morto il suo fondatore, Jean-François Leroy. Una selezione dei lavori è in mostra.');

const strongScore = scored(strong)[0]?.importance?.score || 0;
const weakScore = scored([weak])[0]?.importance?.score || 0;
const factScore = scored([summaryFact])[0]?.importance?.score || 0;
const factTitle = selectInformativeTitle([summaryFact]);
console.log(JSON.stringify({ strongScore, weakScore, factScore, factTitle }, null, 2));
assert.ok(strongScore >= 52, 'una storia culturale con conseguenze pubbliche e fonti plurali deve poter superare 52');
assert.ok(weakScore < 52, `la storia culturale vaga non deve superare 52: ${weakScore}`);
assert.ok(factTitle && /(?:morto|fondatore|Jean-François Leroy)/i.test(factTitle), `il titolo deve esporre il fatto nel summary: ${factTitle}`);
assert.notEqual(factTitle, summaryFact.title, 'il titolo vago non deve vincere sul fatto documentato nel summary');
assert.ok(factScore >= 52, 'la morte documentata di una figura pubblica culturale può superare la soglia senza penalizzare la cultura');
console.log('PASS cultura: fatto pubblico forte ammesso, storia vaga sotto soglia, titolo ricavato dal fatto');
