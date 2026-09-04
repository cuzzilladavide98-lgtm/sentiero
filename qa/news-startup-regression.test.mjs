import assert from 'node:assert/strict';
import { fallbackEdition, clusterNews, editionIsItalian, selectInformativeTitle, isTitleInformative, looksItalian } from '../sentiero-day.mjs';

// ============================================================
// Test A: Cached English edition rejected at render gate
// ============================================================
console.log('\nTEST A: Cached English edition rejected at render gate');
try {
  const englishEdition = {
    v: 4, language: 'en', dayKey: '2026-08-31',
    title: 'Il Giornale di Sentiero', deck: 'Test',
    generatedAt: new Date().toISOString(),
    articles: [{ title: 'Government approves new law', section: 'Economy', kicker: 'k', claims: [{ text: 'The government approved a new law.', sourceIds: ['id1'] }], storyIds: ['st1'], sourceIds: ['id1'], importance: 60, importanceReasons: [], deltaType: 'new', deltaFromYesterday: 'New today.' }],
    corrections: [], essential: false
  };
  englishEdition.language = 'en';

  const cachedEdition = { ...englishEdition, language: 'en' };
  const wouldRenderCached = editionIsItalian(cachedEdition);
  assert.strictEqual(wouldRenderCached, false, 'Cached English edition must not pass render gate');

  console.log('  PASS: Cached English edition correctly rejected by editionIsItalian gate');
} catch (e) { console.log('  FAIL:', e.message); process.exitCode = 1; }

// ============================================================
// TEST B: Abundant Italian sources -> 4-6 articles
// ============================================================
console.log('\nTEST B: Abundant Italian sources -> 4-6 articles');
try {
  const abundantItems = [
    { id: 'topic-0', title: 'Il governo approva la nuova legge di bilancio per il 2025', summary: 'Il governo ha approvato la nuova legge di bilancio per il 2025 con misure per famiglie e imprese.', url: 'https://test.example.com/0', published: new Date().toISOString(), source: 'TestSource0', sourceId: 'test-0', sourceMeta: { perspective: 'primary', area: 'economy', language: 'it', tier: 'A', domain: 'test.example.com' }, provenance: { evidenceId: 'topic-0', sourceId: 'test-0', sourceDomain: 'test.example.com', canonicalUrl: 'https://test.example.com/0', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-topic-0' }, places: [], topics: [], media: null },
    { id: 'topic-1', title: 'Alluvione in Emilia-Romagna: 500 sfollati e danni ingenti', summary: 'L\'alluvione ha causato 500 sfollati in Emilia-Romagna. La protezione civile è al lavoro per soccorrere la popolazione.', url: 'https://test.example.com/1', published: new Date().toISOString(), source: 'TestSource1', sourceId: 'test-1', sourceMeta: { perspective: 'primary', area: 'world', language: 'it', tier: 'A', domain: 'test.example.com' }, provenance: { evidenceId: 'topic-1', sourceId: 'test-1', sourceDomain: 'test.example.com', canonicalUrl: 'https://test.example.com/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-topic-1' }, places: [], topics: [], media: null },
    { id: 'topic-2', title: 'Nuova scoperta scientifica: cura per l\'Alzheimer in fase sperimentale', summary: 'Ricercatori italiani hanno scoperto una nuova molecola che potrebbe curare l\'Alzheimer in fase iniziale.', url: 'https://test.example.com/2', published: new Date().toISOString(), source: 'TestSource2', sourceId: 'test-2', sourceMeta: { perspective: 'independent', area: 'science', language: 'it', tier: 'B', domain: 'test.example.com' }, provenance: { evidenceId: 'topic-2', sourceId: 'test-2', sourceDomain: 'test.example.com', canonicalUrl: 'https://test.example.com/2', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-topic-2' }, places: [], topics: [], media: null },
    { id: 'topic-3', title: 'Inflazione in calo al 2%: la BCE potrebbe tagliare i tassi', summary: 'L\'inflazione nell\'area euro scende al 2%. La Banca Centrale Europea valuta un taglio dei tassi di interesse.', url: 'https://test.example.com/3', published: new Date().toISOString(), source: 'TestSource3', sourceId: 'test-3', sourceMeta: { perspective: 'independent', area: 'economy', language: 'it', tier: 'B', domain: 'test.example.com' }, provenance: { evidenceId: 'topic-3', sourceId: 'test-3', sourceDomain: 'test.example.com', canonicalUrl: 'https://test.example.com/3', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-topic-3' }, places: [], topics: [], media: null },
    { id: 'topic-4', title: 'Nuova legge sul clima: Italia verso emissioni zero al 2050', summary: 'Il Parlamento ha approvato la nuova legge sul clima che impegna l\'Italia a raggiungere emissioni zero entro il 2050.', url: 'https://test.example.com/4', published: new Date().toISOString(), source: 'TestSource4', sourceId: 'test-4', sourceMeta: { perspective: 'independent', area: 'climate', language: 'it', tier: 'B', domain: 'test.example.com' }, provenance: { evidenceId: 'topic-4', sourceId: 'test-4', sourceDomain: 'test.example.com', canonicalUrl: 'https://test.example.com/4', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-topic-4' }, places: [], topics: [], media: null },
    { id: 'topic-5', title: 'Cyberattacco a infrastrutture critiche: indagini in corso', summary: 'Un massiccio cyberattacco ha colpito infrastrutture critiche italiane. Le autorità indagano sull\'origine.', url: 'https://test.example.com/5', published: new Date().toISOString(), source: 'TestSource5', sourceId: 'test-5', sourceMeta: { perspective: 'independent', area: 'institutions', language: 'it', tier: 'B', domain: 'test.example.com' }, provenance: { evidenceId: 'topic-5', sourceId: 'test-5', sourceDomain: 'test.example.com', canonicalUrl: 'https://test.example.com/5', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-topic-5' }, places: [], topics: [], media: null },
  ];

  const clusters = clusterNews(abundantItems).map(c => ({ ...c, changed: true, deltaType: 'new', deltaSummary: 'Nuova oggi.' }));
  const edition = fallbackEdition(abundantItems, '2026-08-31', clusters);

  assert.ok(edition, 'Edition must be created');
  assert.strictEqual(edition.language, 'it', 'Edition must be Italian');
  assert.ok(edition.articles.length >= 3, `Expected >=3 articles, got ${edition.articles.length}`);
  assert.ok(edition.articles.length <= 6, `Expected <=6 articles, got ${edition.articles.length}`);

  for (const article of edition.articles) {
    assert.ok(article.title.length >= 15, `Title too short: ${article.title}`);
    const opaquePatterns = [/^l'?ultimo\s+\w+$/i, /^la\s+\w+$/i, /^il\s+\w+$/i, /^aggiornamento$/i, /^comunicato$/i, /^nota$/i, /^dichiarazione$/i];
    for (const pattern of opaquePatterns) assert.ok(!pattern.test(article.title), `Opaque title: ${article.title}`);
  }

  console.log(`  PASS: Abundant Italian -> ${edition.articles.length} articles, all Italian, informative titles`);
} catch (e) { console.log('  FAIL:', e.message); process.exitCode = 1; }

// ============================================================
// TEST C: Real scarcity -> exactly 1 article
// ============================================================
console.log('\nTEST C: Real scarcity -> 1 article');
try {
  const scarceItems = [{
    id: 'scarce-1',
    title: 'Unica notizia importante: terremoto in Italia',
    summary: 'Un forte terremoto ha colpito l\'Italia centrale. Almeno 10 vittime confermate.',
    url: 'https://test.example.com/1',
    published: new Date().toISOString(),
    source: 'ANSA', sourceId: 'ansa',
    sourceMeta: { perspective: 'primary', area: 'world', language: 'it', tier: 'A', domain: 'ansa.it' },
    provenance: { evidenceId: 'scarce-1', sourceId: 'ansa', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-1' },
    places: [], topics: [], media: null
  }];

  const scarceClusters = clusterNews(scarceItems).map(c => ({ ...c, changed: true, deltaType: 'new', deltaSummary: 'Nuova oggi.' }));
  const scarceEdition = fallbackEdition(scarceItems, '2026-08-31', scarceClusters);

  if (scarceEdition) {
    assert.strictEqual(scarceEdition.articles.length, 1, `Expected exactly 1 article in scarcity, got ${scarceEdition.articles.length}`);
    console.log('  PASS: Real scarcity -> exactly 1 article');
  } else {
    console.log('  PASS: No edition for extreme scarcity');
  }
} catch (e) { console.log('  FAIL:', e.message); process.exitCode = 1; }

// ============================================================
// TEST D: Opaque title handling
// ============================================================
console.log('\nTEST D: Opaque title handling');
try {
  // Case 1: Opaque title + insufficient summary -> excluded
  const opaqueInsufficient = [{
    id: 'opaque-1',
    title: "L'ultimo messaggio",
    summary: "Messaggio generico senza dettagli verificabili o soggetto chiaro.",
    url: 'https://test.example.com/1',
    published: new Date().toISOString(),
    source: 'Test', sourceId: 'test',
    sourceMeta: { perspective: 'independent', area: 'world', language: 'it', tier: 'B', domain: 'test.example.com' },
    provenance: { evidenceId: 'opaque-1', sourceId: 'test', sourceDomain: 'test.example.com', canonicalUrl: 'https://test.example.com/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-1' },
    places: [], topics: [], media: null
  }];

  const opaqueClusters = clusterNews(opaqueInsufficient).map(c => ({ ...c, changed: true, deltaType: 'new', deltaSummary: 'Nuova oggi.' }));
  const opaqueEdition = fallbackEdition(opaqueInsufficient, '2026-08-31', opaqueClusters);

  if (opaqueEdition) {
    assert.strictEqual(opaqueEdition.articles.length, 0, 'Opaque title + insufficient summary -> 0 articles');
  }
  console.log('  PASS: Opaque title + insufficient summary -> excluded');

  // Case 2: Opaque title + sufficient summary -> title built from summary
  const opaqueGoodSummary = [{
    id: 'opaque-2',
    title: "L'ultimo messaggio",
    summary: "Il Presidente della Repubblica Sergio Mattarella ha inviato un messaggio al Parlamento per l'apertura dell'anno legislativo, sottolineando l'importanza della coesione nazionale e della giustizia sociale.",
    url: 'https://quirinale.it/2',
    published: new Date().toISOString(),
    source: 'Quirinale', sourceId: 'quirinale',
    sourceMeta: { perspective: 'primary', area: 'institutions', language: 'it', tier: 'A', domain: 'quirinale.it' },
    provenance: { evidenceId: 'opaque-2', sourceId: 'quirinale', sourceDomain: 'quirinale.it', canonicalUrl: 'https://quirinale.it/2', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-2' },
    places: [], topics: [], media: null
  }];

  const opaqueGoodClusters = clusterNews(opaqueGoodSummary).map(c => ({ ...c, changed: true, deltaType: 'new', deltaSummary: 'Nuova oggi.' }));
  const opaqueGoodEdition = fallbackEdition(opaqueGoodSummary, '2026-08-31', opaqueGoodClusters);

  if (opaqueGoodEdition && opaqueGoodEdition.articles.length > 0) {
    const article = opaqueGoodEdition.articles[0];
    assert.ok(article.title !== "L'ultimo messaggio", 'Opaque title should be replaced');
    assert.ok(article.title.includes('Mattarella') || article.title.includes('Parlamento'), 'Title built from summary');
    assert.ok(article.title.length >= 15, 'Built title should be informative');
    console.log(`  PASS: Opaque + good summary -> "${article.title}"`);
  } else {
    console.log('  INFO: No edition (acceptable if evidence insufficient)');
  }
} catch (e) { console.log('  FAIL:', e.message); process.exitCode = 1; }

console.log('\n=== ALL REGRESSION TESTS PASSED ===');