import assert from 'node:assert/strict';
import { clusterNews } from '../sentiero-day.mjs';

const published = '2099-01-01T10:00:00.000Z';
function item(id, source, title, summary, minute) {
  return {
    id, title, summary, url: `https://${source}.example.test/${id}`, published: published.replace(':00.000Z', `:${String(minute).padStart(2, '0')}.000Z`), source,
    sourceId: source, sourceMeta: { perspective: 'independent', area: 'world', language: 'it', tier: 'B', domain: `${source}.example.test` },
    provenance: { evidenceId: id, sourceId: source, sourceDomain: `${source}.example.test`, canonicalUrl: `https://${source}.example.test/${id}`, publishedAt: published, retrievedAt: published, contentFingerprint: `fp-${id}` },
    places: [], topics: [], media: null
  };
}

const sameDevelopment = [
  item('hybrid-agi', 'agi', "Il nuovo 'volto' della guerra ibrida del Cremlino contro l'Europa", 'La guerra ibrida della Russia contro l’Europa sta cambiando natura. Per Nato e Unione europea la minaccia di Mosca ha raggiunto un nuovo livello: il tentato attacco all’aeroporto di Lipsia rappresenta un salto di qualità. È l’avvertimento di Ursula von der Leyen.', 2),
  item('hybrid-sky', 'sky', 'Ucraina, Nato e Ue in allerta per guerra ibrida russa. Von der Leyen: pronti a rispondere', 'Allerta per la guerra ibrida di Putin dopo i fatti di Lipsia. La minaccia russa si allunga sull’Europa e Von der Leyen annuncia una risposta comune.', 15)
];
const distinctSameMacrotheme = item('ceasefire-geneva', 'ansa', 'Russia e Ucraina riaprono a Ginevra i negoziati sul cessate il fuoco', 'Le delegazioni di Mosca e Kiev tornano al tavolo con la mediazione delle Nazioni Unite per discutere una tregua verificabile.', 20);
const clusters = clusterNews([...sameDevelopment, distinctSameMacrotheme]);
const hybridClusters = clusters.filter(cluster => cluster.items.some(row => row.id.startsWith('hybrid-')));
const ceasefireCluster = clusters.find(cluster => cluster.items.some(row => row.id === 'ceasefire-geneva'));

console.log(JSON.stringify(clusters.map(cluster => ({ storyId: cluster.storyId, items: cluster.items.map(row => row.id), signature: cluster.signature })), null, 2));
assert.equal(hybridClusters.length, 1, 'lo stesso sviluppo di Lipsia deve produrre un solo cluster');
assert.deepEqual(hybridClusters[0].items.map(row => row.id).sort(), ['hybrid-agi', 'hybrid-sky']);
assert.ok(ceasefireCluster, 'la storia distinta sul cessate il fuoco deve restare');
assert.equal(ceasefireCluster.items.some(row => row.id.startsWith('hybrid-')), false, 'il macrotema Russia/Ucraina non basta per fondere eventi diversi');
assert.equal(clusters.length, 2);
console.log('PASS dedupe evento: sviluppo Lipsia unito; negoziato di Ginevra distinto');
