import { clusterNews } from '../sentiero-day.mjs';

function makeItem(id, title, summary, sourceId, language, perspective = 'independent', area = 'world', tier = 'B') {
  return {
    id, title, summary,
    url: `https://${sourceId}.example.com/${id}`,
    published: new Date().toISOString(),
    source: sourceId.toUpperCase(),
    sourceId,
    sourceMeta: { perspective, area, language, tier, domain: `${sourceId}.example.com` },
    provenance: { evidenceId: id, sourceId, sourceDomain: `${sourceId}.example.com`, canonicalUrl: `https://${sourceId}.example.com/${id}`, publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: `fp-${id}` },
    places: [], topics: [], media: null
  };
}

function test(name, items, expectedMerge) {
  const clusters = clusterNews(items);
  const merged = clusters.filter(c => c.items.length > 1);
  const result = merged.length > 0;
  const status = result === expectedMerge ? 'PASS' : 'FAIL';
  console.log(`${status} ${name}: ${result ? 'merged' : 'not merged'} (expected ${expectedMerge ? 'merge' : 'no merge'})`);
  if (result !== expectedMerge) {
    for (const c of clusters) {
      console.log(`  Cluster ${c.storyId}: ${c.items.length} items`);
      for (const item of c.items) {
        console.log(`    ${item.sourceId} (${item.sourceMeta.language}): ${item.title}`);
      }
    }
  }
  return result === expectedMerge;
}

const positiveItems = [
  makeItem('it-1', 'Alluvione in Nepal: 800 morti e 3000 dispersi', 'Il governo nepalese ha confermato 800 vittime.', 'rai', 'it', 'independent', 'world', 'B'),
  makeItem('en-1', 'Nepal floods: death toll reaches 800', 'The death toll from Nepal floods has reached 800.', 'aljazeera', 'en', 'independent', 'world', 'B'),
];

const negative1Items = [
  makeItem('it-2', 'Incidente stradale: 800 km di coda', 'Una coda di 800 km sull\'autostrada.', 'agi', 'it', 'independent', 'world', 'B'),
  makeItem('en-2', 'Stock market drops 800 points', 'The Dow Jones fell 800 points today.', 'bbc', 'en', 'independent', 'economy', 'B'),
];

const negative2Items = [
  makeItem('it-3', 'Conferenza stampa alle 2024', 'Si terrà nel 2024.', 'agi', 'it', 'independent', 'world', 'B'),
  makeItem('en-3', 'Meeting scheduled for 2024', 'The meeting is planned for 2024.', 'bbc', 'en', 'independent', 'world', 'B'),
];

const negative3Items = [
  makeItem('it-4', 'Nuova legge sul clima approvata', 'Il parlamento ha approvato la legge.', 'governo-it', 'it', 'primary', 'institutions', 'A'),
  makeItem('en-4', 'New space telescope launched', 'NASA launched a new telescope.', 'nasa', 'en', 'primary', 'science', 'A'),
];

const negative4Items = [
  makeItem('it-5', 'Terremoto magnitudo 6.5 in Italia', 'Un forte terremoto ha colpito il centro Italia.', 'ingv', 'it', 'primary', 'science', 'A'),
  makeItem('en-5', 'Earthquake magnitude 6.5 in Japan', 'A strong earthquake hit Japan.', 'npr', 'en', 'independent', 'science', 'B'),
];

const results = [];
results.push(test('POSITIVE: Same event Nepal 800 deaths it+en', positiveItems, true));
results.push(test('NEGATIVE: Casual shared number 800', negative1Items, false));
results.push(test('NEGATIVE: Date-like number 2024', negative2Items, false));
results.push(test('NEGATIVE: No shared significant numbers', negative3Items, false));
results.push(test('NEGATIVE: Same magnitude different events', negative4Items, false));

const passed = results.filter(r => r).length;
const total = results.length;
console.log(`\nCross-language merge: ${passed}/${total} passed`);

if (passed !== total) {
  process.exitCode = 1;
}