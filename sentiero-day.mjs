const DAWN_MINUTES = 4 * 60 + 20;
const NIGHT_MINUTES = 19 * 60;
const DAY_MS = 86400000;
const VERSION = 3;

export function isDaytime(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= DAWN_MINUTES && minutes < NIGHT_MINUTES;
}

export function sentieroDayKey(date = new Date()) {
  const shifted = new Date(date.getTime() - DAWN_MINUTES * 60000);
  return shifted.getFullYear() + '-' + String(shifted.getMonth() + 1).padStart(2, '0') + '-' + String(shifted.getDate()).padStart(2, '0');
}

function civilDate(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0) : null;
}

function keyOfCivil(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

export function addCivilDays(key, amount) {
  const date = civilDate(key); if (!date) return '';
  date.setDate(date.getDate() + Number(amount || 0));
  return keyOfCivil(date);
}

export function mondayKey(key) {
  const date = civilDate(key); if (!date) return '';
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return keyOfCivil(date);
}

export function projectWeek(quests, weekStart) {
  const end = addCivilDays(weekStart, 6);
  return (Array.isArray(quests) ? quests : [])
    .filter(item => item && /^\d{4}-\d{2}-\d{2}$/.test(item.quando || '') && item.quando >= weekStart && item.quando <= end)
    .map(item => item)
    .sort((a, b) => String(a.quando).localeCompare(String(b.quando)) || String(a.ora || '99:99').localeCompare(String(b.ora || '99:99')) || Number(a.prio || 3) - Number(b.prio || 3) || String(a.titolo || '').localeCompare(String(b.titolo || ''), 'it'));
}

export function normalizeWord(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]/gu, '');
}

function dayOrdinal(key) {
  const date = civilDate(key); if (!date) return 0;
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return Math.abs(a); }

export function selectWord(words, key, history = {}) {
  const list = Array.isArray(words) ? words : [];
  if (!list.length) return null;
  const existing = history && history[key];
  if (existing) {
    const id = String(existing.id || '');
    const found = list.find(word => String(word.id || '') === id);
    if (found) return found;
    if (existing.w) return { id: id || normalizeWord(existing.w), w: String(existing.w), l: String(existing.l || ''), p: String(existing.p || ''), d: String(existing.d || ''), i: String(existing.i || ''), e: String(existing.e || '') };
  }
  const used = new Set(Object.values(history || {}).map(record => normalizeWord(record && (record.n || record.w || record.id))).filter(Boolean));
  let stride = Math.min(751, list.length - 1) || 1;
  while (gcd(stride, list.length) !== 1 && stride > 1) stride--;
  let index = ((dayOrdinal(key) * stride + 311) % list.length + list.length) % list.length;
  for (let count = 0; count < list.length; count++, index = (index + 1) % list.length) {
    const word = list[index], normalized = normalizeWord(word && word.w);
    if (normalized && !used.has(normalized)) return word;
  }
  return null;
}

const STOP = new Set(('a ad al alla allo ai agli alle anche che chi con da dal dalla dallo dei degli delle di e ed era gli ha hanno i il in la le lo ma nel nella nello nei nelle o per piu poi se si su sul sulla tra un una uno ' +
  'the an and as at by for from has have in into is it of on or that to was were will with this these those after before new latest today yesterday says said ' +
  'le les la un une de du des et en dans pour sur avec est sont ce cette ces apres avant aujourd hui selon ' +
  'el los las una uno del de y en para por con es son este esta estos estas tras ante hoy segun ' +
  'der die das den dem ein eine einer und mit von zu im in auf ist sind nach vor heute sowie').split(/\s+/));

const CONCEPT = new Map();
for (const group of [
  'government governo gouvern gouvernement gobierno regierung', 'parliament parlamento parlement parlament', 'election elections elezione elezioni electiones elecciones wahl wahlen',
  'war guerra guerre krieg conflict conflitto conflit conflicto', 'peace pace paix paz frieden', 'ceasefire tregua cessatefuoco truce altoel-fuego waffenruhe',
  'economy economia economie wirtschaft', 'inflation inflazione inflacion', 'rate rates tasso tassi taux tipo tipos zins zinsen', 'interest interesse interessi interet intereses', 'point points punto punti points puntos', 'cut cuts taglia taglio riduce riduzione baisse recorte senkt',
  'increase increases aumento aumenta hausse subida steigt', 'decrease decreases calo diminuisce baisse bajada sinkt', 'market markets mercato mercati marche mercados markt',
  'bank banca banque banco bank', 'central centrale central zentral', 'ecb bce bez', 'fed federal-reserve', 'budget bilancio budget presupuesto haushalt',
  'law legge lois loi ley laws gesetz', 'court corte tribunale cour tribunal gericht', 'sanction sanctions sanzione sanzioni sanctions sanciones',
  'health salute sante salud gesundheit', 'disease malattia maladie enfermedad krankheit', 'vaccine vaccino vaccin vacuna impfstoff', 'death deaths morto morti morts muerte muertes tote',
  'climate clima climat klimaat', 'temperature temperatura temperatures', 'flood floods alluvione alluvioni inondation inundacion', 'earthquake terremoto seisme terremoto erdbeben',
  'energy energia energie', 'emission emissions emissioni emisiones', 'science scienza sciences ciencia wissenschaft', 'research ricerca recherche investigacion forschung',
  'space spazio espace espacio weltraum', 'mission missione mision', 'technology tecnologia technologie', 'ai ia artificial-intelligence intelligenza-artificiale intelligence-artificielle',
  'agreement accord accordo acuerdo abkommen', 'deal intesa accordo acuerdo', 'launch lancia lancio lance lanzamiento startet', 'approve approva approvato approuve aprueba genehmigt',
  'reject respinge rejet rechaza lehnt', 'investigation indagine enquete investigacion untersuchung', 'report rapporto rapport informe bericht', 'data dati donnees datos daten',
  'million milione milioni million-million millones millionen', 'billion miliardo miliardi milliard billon milliarden', 'percent percento pourcent porcentaje prozent',
  'people persone population personas menschen', 'affect colpisce colpira colpiranno affecte afecta betroffen', 'children bambini enfants ninos kinder', 'migrant migrants migrante migranti', 'refugee refugees rifugiato rifugiati refugies refugiados',
  'ukraine ucraina', 'russia russia russie russland', 'europe europa europe', 'union unione union', 'un onu united-nations naciones-unidas vereinte-nationen'
]) {
  const words = group.split(/\s+/), canonical = words[0]; for (const word of words) CONCEPT.set(word, canonical);
}

function foldText(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function normalizeNumber(value) { return String(value || '').replace(/\s/g, '').replace(',', '.').replace(/\.$/, ''); }
function extractNumbers(value) { return [...new Set((foldText(value).match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(normalizeNumber))]; }
function canonicalToken(token) {
  if (CONCEPT.has(token)) return CONCEPT.get(token);
  if (token.length > 7) return token.replace(/(?:mente|zione|zioni|ation|ations|ements|ement|ments|ment|iques|ique|ciones|cion|ungen|ung)$/i, '') || token;
  if (token.length > 5) return token.replace(/(?:ing|ers|es|s)$/i, '') || token;
  return token;
}
function storyTokens(value) {
  const words = foldText(value).replace(/[^a-z0-9\p{L}]+/gu, ' ').split(/\s+/), out = new Set();
  for (const raw of words) { if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue; const token = canonicalToken(raw); if (token.length >= 3 && !STOP.has(token)) out.add(token); }
  return out;
}
function intersectionSize(a, b) { let common = 0; for (const token of a) if (b.has(token)) common++; return common; }
function similarity(a, b) { const common = intersectionSize(a, b); return common ? (0.65 * common / Math.max(1, Math.min(a.size, b.size)) + 0.35 * common / Math.max(1, new Set([...a, ...b]).size)) : 0; }

function semanticProfile(value) {
  const folded = foldText(value), tokens = storyTokens(folded);
  return {
    tokens, numbers: new Set(extractNumbers(folded)),
    negated: /\b(?:non|nessun|senza|not|no|never|aucun|pas|sans|nunca|kein|nicht|ohne)\b/.test(folded),
    uncertain: /\b(?:potrebbe|potrebbero|possibile|probabile|stima|may|might|could|likely|estimate|peut|pourrait|probable|podria|puede|konnt|voraussichtlich)\b/.test(folded)
  };
}

function profileSimilarity(a, b) {
  const base = similarity(a.tokens, b.tokens), numberOverlap = [...a.numbers].some(number => b.numbers.has(number));
  return Math.min(1, base + (numberOverlap ? 0.1 : 0));
}

function unionTokens(items) {
  const tokens = new Set();
  for (const item of items || []) for (const token of storyTokens(String(item.title || '') + ' ' + String(item.summary || ''))) tokens.add(token);
  return tokens;
}

function hashText(value) {
  let hash = 2166136261; const text = String(value || '');
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

export function storyKey(items) {
  return 'st-' + hashText([...unionTokens(items)].sort().slice(0, 14).join('|'));
}

export function clusterNews(items) {
  const clusters = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !item.id || !item.title || !item.url || !item.source) continue;
    const profile = semanticProfile(item.title + ' ' + String(item.summary || '').slice(0, 420)), tokens = profile.tokens;
    let cluster = clusters.find(candidate => candidate.profiles.some(other => {
      const common = intersectionSize(tokens, other.tokens), score = profileSimilarity(profile, other);
      return (common >= 2 && score >= 0.47) || (common >= 1 && score >= 0.4 && [...profile.numbers].some(number => other.numbers.has(number)));
    }));
    if (!cluster) { cluster = { id: 'c' + (clusters.length + 1), tokens: new Set(), profiles: [], items: [] }; clusters.push(cluster); }
    cluster.items.push(item);
    cluster.profiles.push(profile);
    for (const token of tokens) cluster.tokens.add(token);
  }
  return clusters.map(({ tokens, profiles, ...cluster }) => ({ ...cluster, storyId: storyKey(cluster.items), signature: [...tokens].sort().slice(0, 64), evidenceFingerprint: hashText(cluster.items.map(item => item.provenance && item.provenance.contentFingerprint || item.id).sort().join('|')) }));
}

function cleanText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function evidenceTokens(value) { return storyTokens(String(value || '').replace(/\b(?:oggi|ieri|domani|secondo|fonte|fonti|today|yesterday|tomorrow|according)\b/gi, ' ')); }

function provenanceFor(source) {
  const meta = source && source.sourceMeta || {}, p = source && source.provenance || {};
  return { evidenceId: String(p.evidenceId || source.id || ''), sourceId: String(source.sourceId || p.sourceId || ''), source: String(source.source || ''), url: String(source.url || ''), publishedAt: String(source.published || p.publishedAt || ''), retrievedAt: String(p.retrievedAt || ''), domain: String(meta.domain || p.sourceDomain || ''), perspective: String(meta.perspective || ''), tier: String(meta.tier || '') };
}

export function claimEvidenceDetail(text, ids, sources) {
  const sourceMap = new Map((sources || []).map(source => [String(source.id), source]));
  const selected = [...new Set((ids || []).map(String))].map(id => sourceMap.get(id)).filter(Boolean), claim = semanticProfile(text), evidenceProfiles = selected.map(source => semanticProfile(source.title + ' ' + source.summary)), evidence = semanticProfile(selected.map(source => source.title + ' ' + source.summary).join(' '));
  if (!claim.tokens.size || !evidence.tokens.size || !selected.length) return { score: 0, supported: false, coverage: 0, numericSupport: false, polaritySupport: false, modalitySupport: false, corroboration: 0, provenance: [] };
  const common = intersectionSize(claim.tokens, evidence.tokens), coverage = common / Math.max(1, claim.tokens.size);
  const numericSupport = [...claim.numbers].every(number => evidence.numbers.has(number));
  const polaritySupport = evidenceProfiles.some(profile => profile.negated === claim.negated);
  const modalitySupport = claim.uncertain || evidenceProfiles.some(profile => !profile.uncertain);
  const domains = new Set(selected.map(source => source.sourceMeta && source.sourceMeta.domain || source.sourceId).filter(Boolean)), perspectives = new Set(selected.map(source => source.sourceMeta && source.sourceMeta.perspective).filter(Boolean));
  const provenance = selected.map(provenanceFor), provenanceComplete = provenance.every(item => item.evidenceId && item.url && item.source);
  const corroboration = Math.min(1, Math.max(0, domains.size - 1) * 0.5 + (perspectives.size > 1 ? 0.5 : 0));
  const score = Math.min(1, coverage * 0.78 + corroboration * 0.1 + (provenanceComplete ? 0.07 : 0) + (selected.some(source => source.sourceMeta && source.sourceMeta.tier === 'A') ? 0.05 : 0));
  const minimumCommon = claim.tokens.size <= 2 ? claim.tokens.size : 2;
  return { score, supported: common >= minimumCommon && coverage >= 0.52 && numericSupport && polaritySupport && modalitySupport && provenanceComplete, coverage, numericSupport, polaritySupport, modalitySupport, corroboration, provenance };
}

export function claimEvidenceScore(text, ids, sources) {
  const detail = claimEvidenceDetail(text, ids, sources); return detail.supported ? detail.score : 0;
}

const IMPACT = new Set('war peace ceasefire election law court sanction health disease death climate flood earthquake economy inflation rate energy agreement investigation government parliament'.split(' '));
const AREA_WEIGHT = { world: 13, economy: 12, health: 13, climate: 12, institutions: 11, statistics: 10, investigations: 11, science: 8, europe: 9, general: 5, analysis: 6 };

export function editorialImportance(cluster, now = Date.now()) {
  const items = cluster && cluster.items || [], tokens = unionTokens(items), perspectives = new Set(items.map(item => item.sourceMeta && item.sourceMeta.perspective).filter(Boolean)), domains = new Set(items.map(item => item.sourceMeta && item.sourceMeta.domain).filter(Boolean));
  const primary = perspectives.has('primary'), independent = perspectives.has('independent'), areas = items.map(item => item.sourceMeta && item.sourceMeta.area).filter(Boolean);
  const impact = [...tokens].filter(token => IMPACT.has(token)).length, newest = Math.max(0, ...items.map(item => Date.parse(item.published) || 0));
  const recency = newest ? Math.max(0, 8 - Math.floor(Math.max(0, now - newest) / 21600000)) : 0;
  const promotional = items.some(item => /\b(?:nomina|appoints?|celebrat|anniversary|evento|conference|webinar|speech|remarks|awards?)\b/i.test(item.title || ''));
  const lowPublicValue = items.some(item => /\b(?:sport|calcio|football|celebrity|gossip|lottery|oroscop)\b/i.test(item.title || ''));
  const area = Math.max(0, ...areas.map(value => AREA_WEIGHT[value] || 4));
  const score = Math.max(0, Math.min(100, 10 + area + Math.min(18, impact * 5) + (primary ? 12 : 0) + (independent ? 10 : 0) + (primary && independent ? 16 : 0) + Math.min(6, Math.max(0, domains.size - 1) * 2) + recency + (cluster && cluster.deltaType === 'developed' ? 9 : cluster && cluster.deltaType === 'new' ? 7 : 0) - (promotional ? 24 : 0) - (lowPublicValue ? 30 : 0)));
  const reasons = [area ? 'impatto-' + (areas.sort((a, b) => (AREA_WEIGHT[b] || 0) - (AREA_WEIGHT[a] || 0))[0] || 'pubblico') : '', primary && independent ? 'fonte-primaria+verifica-indipendente' : primary ? 'fonte-primaria' : independent ? 'verifica-indipendente' : '', impact ? 'conseguenze-materiali' : '', cluster && cluster.deltaType ? 'delta-' + cluster.deltaType : ''].filter(Boolean);
  return { score, reasons, perspectives: [...perspectives], domains: [...domains] };
}

export function selectEditorialStories(clusters, limit = 12, now = Date.now()) {
  return (clusters || []).filter(cluster => cluster && (cluster.changed || !cluster.previous)).map(cluster => ({ ...cluster, importance: editorialImportance(cluster, now) })).filter(cluster => cluster.importance.score >= 28).sort((a, b) => b.importance.score - a.importance.score || Date.parse(b.items[0] && b.items[0].published) - Date.parse(a.items[0] && a.items[0].published)).slice(0, Math.max(1, limit));
}

export function editionRubric(edition, sources) {
  if (!edition || !Array.isArray(edition.articles)) return { score: 0, pass: false, issues: ['struttura'] };
  const issues = [], allIds = new Set(), claims = [], storyIds = new Set();
  for (const article of edition.articles) {
    for (const storyId of article.storyIds || []) { if (storyIds.has(storyId)) issues.push('storia-duplicata'); storyIds.add(storyId); }
    for (const claim of article.claims || []) { claims.push(claim); for (const id of claim.sourceIds || []) allIds.add(String(id)); }
  }
  const unsupported = claims.filter(claim => !claimEvidenceDetail(claim.text, claim.sourceIds, sources).supported).length;
  const clickbait = edition.articles.filter(article => /!|shock|incredibil|sconvolg|non crederai|clamoros/i.test(article.title || '')).length;
  const editorialese = edition.articles.filter(article => /\b(?:è importante notare|in un mondo|segnale forte|resta da vedere|solo il tempo dirà)\b/i.test((article.kicker || '') + ' ' + (article.claims || []).map(claim => claim.text).join(' '))).length;
  const usedPerspectives = new Set([...allIds].map(id => (sources || []).find(item => String(item.id) === id)?.sourceMeta?.perspective).filter(Boolean));
  const availablePerspectives = new Set((sources || []).map(item => item.sourceMeta && item.sourceMeta.perspective).filter(Boolean));
  const hierarchyBroken = edition.articles.some((article, index) => index > 0 && Number(article.importance || 0) > Number(edition.articles[index - 1].importance || 0));
  if (!edition.articles.length || edition.articles.length > 6) issues.push('dimensione-edizione');
  if (unsupported) issues.push('claim-non-supportati:' + unsupported);
  if (availablePerspectives.size > 1 && edition.articles.length > 1 && usedPerspectives.size < 2) issues.push('pluralita-assente');
  if (clickbait) issues.push('clickbait');
  if (editorialese) issues.push('prosa-generica:' + editorialese);
  if (hierarchyBroken) issues.push('gerarchia-invertita');
  const score = Math.max(0, 100 - unsupported * 28 - clickbait * 18 - editorialese * 9 - (issues.includes('dimensione-edizione') ? 30 : 0) - (issues.includes('pluralita-assente') ? 8 : 0) - (issues.includes('storia-duplicata') ? 16 : 0) - (hierarchyBroken ? 12 : 0));
  return { score, pass: score >= 86 && unsupported === 0 && edition.articles.length >= 1 && !hierarchyBroken, issues, perspectives: [...usedPerspectives] };
}

export function validateEdition(raw, sources, key, allowedStoryIds, clusters) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.articles)) return null;
  const map = new Map((Array.isArray(sources) ? sources : []).map(source => [String(source.id), source])), clusterMap = clusters instanceof Map ? clusters : new Map((clusters || []).map(cluster => [cluster.storyId, cluster]));
  const articles = []; let rejectedEvidence = false;
  for (const sourceArticle of raw.articles.slice(0, 6)) {
    if (!sourceArticle || !Array.isArray(sourceArticle.claims)) continue;
    const title = cleanText(sourceArticle.title, 180), section = cleanText(sourceArticle.section, 50);
    const claims = [];
    for (const rawClaim of sourceArticle.claims.slice(0, 6)) {
      if (!rawClaim || !Array.isArray(rawClaim.sourceIds)) { rejectedEvidence = true; continue; }
      const requested = [...new Set(rawClaim.sourceIds.map(String))], ids = requested.filter(id => map.has(id)).slice(0, 4), text = cleanText(rawClaim.text, 900);
      const evidence = claimEvidenceDetail(text, ids, sources);
      if (!text || text.length < 24 || ids.length !== requested.length || !ids.length || !evidence.supported) { rejectedEvidence = true; continue; }
      claims.push({ text, sourceIds: ids, evidenceScore: Number(evidence.score.toFixed(3)), provenance: evidence.provenance });
    }
    if (!title || !section || !claims.length) { rejectedEvidence = true; continue; }
    const storyIds = [...new Set((sourceArticle.storyIds || []).map(String).filter(id => /^st-[a-z0-9]+$/i.test(id) && (!allowedStoryIds || allowedStoryIds.has(id))))].slice(0, 3);
    if (allowedStoryIds && !storyIds.length) { rejectedEvidence = true; continue; }
    const sourceIds = [...new Set(claims.flatMap(claim => claim.sourceIds))], headline = claimEvidenceDetail(title, sourceIds, sources);
    if (!headline.supported && profileSimilarity(semanticProfile(title), semanticProfile(claims.map(claim => claim.text).join(' '))) < 0.42) { rejectedEvidence = true; continue; }
    const related = storyIds.map(id => clusterMap.get(id)).filter(Boolean), importance = Math.max(0, ...related.map(cluster => cluster.importance && cluster.importance.score || editorialImportance(cluster).score));
    const primaryCluster = related.sort((a, b) => (b.importance?.score || 0) - (a.importance?.score || 0))[0];
    articles.push({ title, section, kicker: cleanText(sourceArticle.kicker, 260), claims, storyIds, sourceIds, importance, importanceReasons: primaryCluster && primaryCluster.importance && primaryCluster.importance.reasons || [], deltaType: primaryCluster && primaryCluster.deltaType || 'new', deltaFromYesterday: primaryCluster && primaryCluster.deltaSummary || 'Nuova oggi.' });
  }
  if (!articles.length || rejectedEvidence) return null;
  articles.sort((a, b) => b.importance - a.importance);
  articles.forEach((article, index) => { article.presentation = index === 0 ? 'lead' : index < 3 ? 'major' : 'brief'; });
  const corrections = [];
  for (const rawCorrection of Array.isArray(raw.corrections) ? raw.corrections.slice(0, 3) : []) {
    const ids = [...new Set((rawCorrection.sourceIds || []).map(String))].filter(id => map.has(id)), correctionText = cleanText(rawCorrection.text, 500), correctionStories = [...new Set((rawCorrection.storyIds || []).map(String))].filter(id => clusterMap.has(id));
    const correctsPrior = correctionStories.some(id => clusterMap.get(id).deltaType === 'corrected');
    if (correctionText.length >= 24 && ids.length && correctsPrior && claimEvidenceDetail(correctionText, ids, sources).supported) corrections.push({ text: correctionText, sourceIds: ids, storyIds: correctionStories });
    else return null;
  }
  const edition = { v: VERSION, dayKey: key, title: cleanText(raw.title, 90) || 'Il Giornale di Sentiero', deck: cleanText(raw.deck, 300), generatedAt: new Date().toISOString(), articles, corrections };
  edition.rubric = editionRubric(edition, sources);
  return edition.rubric.pass ? edition : null;
}

let context = null;
let room = null;
let weekStart = '';
let selectedDay = '';
let catalogPromise = null;
let newsBuild = null;
let newsAbort = null;
let listenerBound = false;
let latestEdition = null;
let lastManualRefresh = 0;
const DISTRIBUTION_VERSION = '60.274.3';
const NEWS_ASSET_PATHS = ['./assets/giornale/latest.json', './latest.json'];
const WORD_ASSET_PATHS = ['./assets/parole-giorno-v1.json', './parole-giorno-v1.json'];

function distributionUrl(path) {
  const url = new URL(path, document.baseURI);
  url.searchParams.set('v', DISTRIBUTION_VERSION);
  return url.toString();
}

async function parseDistributedResponse(response, maxBytes) {
  if (!response || !response.ok || Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('asset');
  const raw = await response.text();
  if (raw.length > maxBytes) throw new Error('asset');
  try { return JSON.parse(raw); } catch (_) { throw new Error('asset'); }
}

async function readDistributedJson(paths, signal, maxBytes, accept) {
  for (const path of paths) {
    try {
      const response = await fetch(distributionUrl(path), { signal, cache: 'no-store' });
      const data = await parseDistributedResponse(response, maxBytes);
      if (!accept || accept(data)) return data;
    } catch (error) { if (error && error.name === 'AbortError') throw error; }
  }
  if (typeof caches !== 'undefined') {
    for (const path of paths) {
      for (const key of [distributionUrl(path), new URL(path, document.baseURI).toString()]) {
        try { const data = await parseDistributedResponse(await caches.match(key), maxBytes); if (!accept || accept(data)) return data; } catch (_) {}
      }
    }
  }
  throw new Error('asset');
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(className, label, action) {
  const node = element('button', className, label); node.type = 'button'; node.addEventListener('click', action); return node;
}

function installRoom() {
  if (room) return room;
  const style = element('style'); style.id = 'giorno-room-style'; style.textContent = `
body.giorno-aperto{overflow:hidden!important}
.giorno-room{--paper:#f3efe2;--ink:#162b25;--muted:#64716a;--line:rgba(22,43,37,.16);--sun:#b7781f;position:fixed;inset:0;z-index:145;background:var(--paper);color:var(--ink);overflow:hidden;opacity:0;transition:opacity .22s ease;color-scheme:light}
.giorno-room.aperta{opacity:1}.giorno-room[hidden]{display:none}.giorno-shell{height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable;padding-bottom:max(34px,env(safe-area-inset-bottom))}
.giorno-head{position:sticky;top:0;z-index:4;display:grid;grid-template-columns:48px 1fr 48px;align-items:center;min-height:62px;padding:max(5px,env(safe-area-inset-top)) 10px 5px;background:rgba(243,239,226,.94);border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}
.giorno-head button{width:44px;height:44px;border:0;background:none;color:var(--ink);font:32px/1 Georgia,serif}.giorno-head div{text-align:center;min-width:0}.giorno-head strong{display:block;font:500 17px/1.2 Georgia,serif}.giorno-head span{display:block;margin-top:3px;color:var(--muted);font:600 10px/1.2 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase}.giorno-head .giorno-mark{font-size:20px;color:var(--sun)}
.giorno-main{width:min(100%,760px);margin:auto;padding:24px clamp(17px,5vw,46px) 60px;box-sizing:border-box}.giorno-intro{margin:4px 0 38px}.giorno-intro p{font:400 clamp(26px,7vw,42px)/1.16 Georgia,serif;letter-spacing:-.025em;margin:0;max-width:640px}.giorno-intro small{display:block;margin-top:12px;color:var(--muted);font:500 12px/1.5 system-ui,sans-serif;letter-spacing:.11em;text-transform:uppercase}
.giorno-section{margin:0 0 56px;scroll-margin-top:78px}.giorno-label{margin:0 0 8px;color:var(--sun);font:700 11px/1.3 system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase}.giorno-section h2{margin:0 0 20px;font:500 clamp(31px,9vw,49px)/1.02 Georgia,serif;letter-spacing:-.035em}.giorno-section-note{margin:-10px 0 20px;color:var(--muted);font:400 14px/1.55 system-ui,sans-serif}
.week-nav{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;margin:0 0 12px}.week-nav button{height:44px;border:0;background:none;color:var(--ink);font-size:25px}.week-title{text-align:center;font:600 13px/1.3 system-ui,sans-serif}.week-strip{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;width:100%;padding:2px 0 10px}.week-day{min-width:0;min-height:66px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.24);color:var(--ink);padding:8px 1px}.week-day b,.week-day span{display:block}.week-day b{font:700 9px/1.2 system-ui,sans-serif;letter-spacing:.03em}.week-day span{margin-top:5px;font:500 20px/1 Georgia,serif}.week-day i{display:block;width:5px;height:5px;margin:6px auto 0;border-radius:50%;background:transparent}.week-day.has i{background:var(--sun)}.week-day.today{box-shadow:inset 0 0 0 1px var(--sun)}.week-day.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.week-agenda{border-top:1px solid var(--line);margin-top:9px}.agenda-empty{padding:27px 0;color:var(--muted);font:italic 18px/1.55 Georgia,serif}.agenda-row{display:grid;grid-template-columns:62px 1fr;gap:13px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;color:var(--ink);padding:17px 0;min-height:65px}.agenda-row time{font:700 12px/1.4 system-ui,sans-serif;color:var(--sun)}.agenda-row strong{display:block;font:500 18px/1.25 Georgia,serif}.agenda-row small{display:block;margin-top:4px;color:var(--muted);font:400 13px/1.45 system-ui,sans-serif}.agenda-row.done{opacity:.55}.agenda-row.done strong{text-decoration:line-through}
.news-state{padding:24px 0;border-block:1px solid var(--line);color:var(--muted);font:400 15px/1.6 system-ui,sans-serif}.news-state b{color:var(--ink)}.news-refresh{min-height:44px;margin-top:13px;padding:0 16px;border:1px solid var(--line);border-radius:999px;background:none;color:var(--ink);font:600 13px/1 system-ui,sans-serif}.edition-head{padding:5px 0 28px;border-bottom:3px double var(--ink)}.edition-head h3{margin:0;font:500 clamp(35px,10vw,57px)/.98 Georgia,serif;letter-spacing:-.045em}.edition-head p{margin:15px 0 0;color:var(--muted);font:400 17px/1.55 Georgia,serif}.edition-meta{margin-top:15px!important;font:600 10px/1.3 system-ui,sans-serif!important;letter-spacing:.12em;text-transform:uppercase}.edition-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.edition-tools .news-refresh{margin-top:10px}.edition-corrections{margin:24px 0 0;padding:15px 17px;border:1px solid var(--line);font:400 14px/1.55 system-ui,sans-serif}.edition-corrections strong{display:block;margin-bottom:6px}.claim-sources{font:600 10px/1 system-ui,sans-serif;white-space:nowrap}.claim-sources a{color:#355d52;text-decoration:none;margin-left:5px}.edition-front{display:grid;grid-template-columns:minmax(0,1fr);border-bottom:2px solid var(--ink)}
.news-article{min-width:0;padding:30px 0;border-bottom:1px solid var(--line)}.news-article .section{color:var(--sun);font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.15em;text-transform:uppercase}.article-delta{display:inline-flex;margin:0 0 9px;padding:5px 8px;border:1px solid var(--line);border-radius:999px;color:#5d4a27;font:700 9px/1.2 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}.news-article h3{margin:8px 0 9px;font:500 clamp(27px,8vw,42px)/1.05 Georgia,serif;letter-spacing:-.027em}.news-article.lead{padding-top:36px;border-bottom:2px solid var(--ink)}.news-article.lead h3{font-size:clamp(38px,11vw,58px);line-height:1}.news-article.major h3{font-size:clamp(29px,8vw,43px)}.news-article.brief h3{font-size:clamp(24px,7vw,34px)}.news-article .kicker{margin:0 0 16px;color:#475951;font:italic 17px/1.5 Georgia,serif}.news-article .body p{margin:0 0 14px;font:400 18px/1.66 Georgia,serif}.news-sources{display:flex;flex-wrap:wrap;gap:7px;margin-top:19px}.news-sources a{max-width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:#355d52;font:600 11px/1.25 system-ui,sans-serif;text-decoration:none;overflow-wrap:anywhere}.edition-end{padding:38px 0 10px;text-align:center;font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.17em;text-transform:uppercase}.edition-end::before{content:'◆';display:block;margin-bottom:14px;color:var(--sun);font-size:9px}
.word-card{position:relative;padding:25px 0 3px;border-block:2px solid var(--ink)}.word-card h3{margin:0;font:500 clamp(43px,13vw,70px)/1 Georgia,serif;letter-spacing:-.045em;overflow-wrap:anywhere}.word-meta{margin:9px 0 21px;color:var(--sun);font:700 11px/1.5 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}.word-definition{margin:0 0 17px;font:400 20px/1.55 Georgia,serif}.word-detail{padding-top:15px;border-top:1px solid var(--line);color:#41534b;font:400 15px/1.6 system-ui,sans-serif}.word-detail b{color:var(--ink)}.word-source{margin-top:18px;color:var(--muted);font:400 11px/1.5 system-ui,sans-serif}.word-source a{color:inherit}
.giorno-fine{margin:72px 0 10px;text-align:center;color:var(--muted);font:italic 19px/1.5 Georgia,serif}
@media(max-width:340px){.giorno-main{padding-inline:12px}.week-strip{gap:3px}.week-day{border-radius:13px}.week-day b{font-size:8px}.week-day span{font-size:18px}.agenda-row{grid-template-columns:55px 1fr}.news-article .body p{font-size:17px}}
@media(min-width:760px){.week-strip{gap:9px}.week-day{min-height:72px}.giorno-main{padding-top:38px}.edition-front{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);column-gap:30px}.news-article.lead{grid-column:1/-1}.news-article.major:nth-of-type(even){padding-right:26px;border-right:1px solid var(--line)}.news-article.brief{padding:22px 0}.news-article.brief .body p{font-size:16px}.news-article.brief .kicker{font-size:15px}}
@media(prefers-reduced-motion:reduce){body:not(.anima-sempre) .giorno-room{transition:none}}
`;
  document.head.appendChild(style);
  room = element('div', 'giorno-room'); room.id = 'giorno-room'; room.hidden = true; room.setAttribute('role', 'dialog'); room.setAttribute('aria-modal', 'true'); room.setAttribute('aria-label', 'La stanza del giorno');
  const shell = element('div', 'giorno-shell');
  const head = element('header', 'giorno-head');
  head.append(button('', '‹', close));
  const identity = element('div'); identity.append(element('strong', '', 'La Terra')); identity.append(element('span', '', 'la stanza del giorno')); head.append(identity);
  head.append(element('span', 'giorno-mark', '◦'));
  shell.append(head);
  const main = element('main', 'giorno-main');
  const intro = element('div', 'giorno-intro'); intro.append(element('p', '', 'Guarda avanti. Poi torna alla giornata.')); intro.append(element('small', 'giorno-date')); main.append(intro);
  for (const [id, label, title] of [['week', '01 · orientati', 'La settimana'], ['news', '02 · guarda fuori', 'Il Giornale'], ['word', '03 · porta con te', 'La parola del giorno']]) {
    const section = element('section', 'giorno-section'); section.id = 'giorno-' + id; section.append(element('p', 'giorno-label', label)); section.append(element('h2', '', title)); section.append(element('div', id + '-mount')); main.append(section);
  }
  main.append(element('p', 'giorno-fine', 'Hai guardato abbastanza. Ora puoi andare.'));
  shell.append(main); room.append(shell); document.body.append(room);
  room.querySelector('.giorno-date').textContent = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return room;
}

function currentState() { return context && typeof context.state === 'function' ? context.state() : {}; }

function formatWeek(start) {
  const first = civilDate(start), last = civilDate(addCivilDays(start, 6));
  if (!first || !last) return '';
  const f = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: first.getMonth() === last.getMonth() ? undefined : 'short' }).format(first);
  const l = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' }).format(last);
  return f + ' — ' + l;
}

function renderWeek() {
  if (!room) return;
  const mount = room.querySelector('.week-mount'); mount.replaceChildren();
  const today = sentieroDayKey(), state = currentState(), items = projectWeek(state.quests, weekStart);
  const nav = element('div', 'week-nav');
  nav.append(button('', '‹', () => { weekStart = addCivilDays(weekStart, -7); selectedDay = weekStart; renderWeek(); }));
  nav.append(element('div', 'week-title', formatWeek(weekStart)));
  nav.append(button('', '›', () => { weekStart = addCivilDays(weekStart, 7); selectedDay = weekStart; renderWeek(); })); mount.append(nav);
  const strip = element('div', 'week-strip'); strip.setAttribute('aria-label', 'Giorni della settimana');
  const days = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];
  for (let index = 0; index < 7; index++) {
    const key = addCivilDays(weekStart, index), date = civilDate(key), count = items.filter(item => item.quando === key).length;
    const day = button('week-day' + (key === today ? ' today' : '') + (key === selectedDay ? ' on' : '') + (count ? ' has' : ''), '', () => { selectedDay = key; renderWeek(); });
    day.setAttribute('aria-label', days[index] + ' ' + date.getDate() + (count ? ', ' + count + ' impegni' : ', libero'));
    day.append(element('b', '', days[index])); day.append(element('span', '', String(date.getDate()))); day.append(element('i')); strip.append(day);
  }
  mount.append(strip);
  const agenda = element('div', 'week-agenda'), selected = items.filter(item => item.quando === selectedDay);
  if (!selected.length) agenda.append(element('p', 'agenda-empty', 'Niente di temporalmente collocato. Questo spazio è libero.'));
  for (const quest of selected) {
    const row = button('agenda-row' + (quest.fatto ? ' done' : ''), '', () => { if (context && context.editQuest) context.editQuest(quest.id); });
    row.append(element('time', '', quest.ora || '—'));
    const copy = element('span'); copy.append(element('strong', '', quest.titolo || 'Senza titolo')); if (quest.note) copy.append(element('small', '', quest.note)); row.append(copy); agenda.append(row);
  }
  mount.append(agenda);
}

async function loadCatalog() {
  if (!catalogPromise) catalogPromise = (async () => {
    return readDistributedJson(WORD_ASSET_PATHS, null, 900000, data => data && Array.isArray(data.words) && data.words.length >= 1000);
  })().catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}

async function renderWord() {
  if (!room) return; const mount = room.querySelector('.word-mount');
  mount.replaceChildren(element('p', 'news-state', 'Apro il lessico del giorno…'));
  try {
    const state = currentState(), key = sentieroDayKey(); state.paroleGiorno = state.paroleGiorno && typeof state.paroleGiorno === 'object' ? state.paroleGiorno : {};
    let word = state.paroleGiorno[key] && state.paroleGiorno[key].d ? state.paroleGiorno[key] : null;
    if (!word) { const data = await loadCatalog(); word = selectWord(data.words, key, state.paroleGiorno); }
    if (!word) throw new Error('esaurito');
    if (!state.paroleGiorno[key]) {
      state.paroleGiorno[key] = { id: String(word.id), w: String(word.w), l: String(word.l || ''), n: normalizeWord(word.w), p: String(word.p || ''), d: String(word.d || ''), i: String(word.i || ''), e: String(word.e || '') };
      if (context && context.save) context.save();
    }
    const card = element('article', 'word-card'); card.append(element('h3', '', word.w));
    card.append(element('p', 'word-meta', [word.l, word.p, word.i].filter(Boolean).join(' · ')));
    card.append(element('p', 'word-definition', word.d));
    if (word.e) { const detail = element('p', 'word-detail'); detail.append(element('b', '', 'Origine. ')); detail.append(document.createTextNode(word.e)); card.append(detail); }
    const source = element('p', 'word-source'); source.append(document.createTextNode('Fonte lessicografica: ')); const link = element('a', '', 'Wiktionary, estrazione Kaikki.org'); link.href = 'https://kaikki.org/'; link.target = '_blank'; link.rel = 'noopener noreferrer'; source.append(link); source.append(document.createTextNode(' · CC BY-SA 4.0 / GFDL')); card.append(source);
    mount.replaceChildren(card);
  } catch (_) {
    mount.replaceChildren(element('p', 'news-state', 'La parola già scelta resta nella memoria di Sentiero. Il lessico completo tornerà disponibile con la rete.'));
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('idb'));
    const request = indexedDB.open('sentiero-day-v1', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('editions')) request.result.createObjectStore('editions', { keyPath: 'key' });
      if (!request.result.objectStoreNames.contains('stories')) request.result.createObjectStore('stories', { keyPath: 'storyId' });
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('idb'));
  });
}

async function storeAll(name) {
  try { const db = await openDb(); return await new Promise((resolve, reject) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); }); } catch (_) { return []; }
}

async function storePut(name, record) {
  try { const db = await openDb(); await new Promise((resolve, reject) => { const request = db.transaction(name, 'readwrite').objectStore(name).put(record); request.onsuccess = resolve; request.onerror = () => reject(request.error); }); return true; } catch (_) { return false; }
}

async function cacheGet(key) {
  try { const db = await openDb(); return await new Promise((resolve, reject) => { const request = db.transaction('editions').objectStore('editions').get(key); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); }); } catch (_) { return null; }
}

async function cacheLatest() {
  try { const db = await openDb(); const rows = await new Promise((resolve, reject) => { const request = db.transaction('editions').objectStore('editions').getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); }); return rows.sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0] || null; } catch (_) { return null; }
}

async function cachePut(record) {
  try {
    await storePut('editions', record); const db = await openDb();
    const rows = await storeAll('editions');
    for (const old of rows.sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).slice(8)) { try { db.transaction('editions', 'readwrite').objectStore('editions').delete(old.key); } catch (_) {} }
  } catch (_) {}
}

function tierRank(item) { const tier = item && item.sourceMeta && item.sourceMeta.tier; return tier === 'A' ? 3 : tier === 'B' ? 2 : 1; }

function clusterNumbers(cluster) { return [...new Set((cluster && cluster.items || []).flatMap(item => extractNumbers(item.title + ' ' + item.summary)))].sort(); }

export function storyDelta(previous, cluster, key) {
  if (!previous) return { type: 'new', changed: true, summary: 'Nuova oggi.', addedNumbers: clusterNumbers(cluster), removedNumbers: [], newSources: [...new Set((cluster.items || []).map(item => item.sourceId).filter(Boolean))] };
  const nowTokens = unionTokens(cluster && cluster.items), oldTokens = new Set((previous.signature || []).map(token => canonicalToken(foldText(token)))), overlap = similarity(nowTokens, oldTokens);
  const nowNumbers = clusterNumbers(cluster), oldNumbers = String(previous.numbers || '').split('|').filter(Boolean), addedNumbers = nowNumbers.filter(number => !oldNumbers.includes(number)), removedNumbers = oldNumbers.filter(number => !nowNumbers.includes(number));
  const nowSources = [...new Set((cluster.items || []).map(item => item.sourceId).filter(Boolean))], newSources = nowSources.filter(id => !(previous.sourceIds || []).includes(id));
  const nowProfile = semanticProfile((cluster.items || []).map(item => item.title + ' ' + item.summary).join(' ')), polarityChanged = typeof previous.negated === 'boolean' && previous.negated !== nowProfile.negated;
  const substantiveEvidence = newSources.some(id => { const item = (cluster.items || []).find(source => source.sourceId === id); return item && tierRank(item) === 3 && profileSimilarity(semanticProfile(item.title + ' ' + item.summary), { tokens: oldTokens, numbers: new Set(oldNumbers) }) < 0.78; });
  const changed = polarityChanged || addedNumbers.length > 0 || removedNumbers.length > 0 || overlap < 0.7 || substantiveEvidence;
  let type = changed ? 'developed' : 'unchanged';
  if (changed && polarityChanged && (previous.lastClaims || []).length) type = 'corrected';
  else if (changed && previous.lastSeen && previous.lastSeen !== addCivilDays(key, -1) && previous.lastSeen !== key) type = 'returned';
  const details = [];
  if (addedNumbers.length) details.push('nuovi dati: ' + addedNumbers.slice(0, 4).join(', '));
  if (polarityChanged) details.push('il quadro contraddice la formulazione precedente');
  if (substantiveEvidence) details.push('nuova evidenza primaria');
  if (!details.length && changed) details.push('sono emersi fatti sostanziali non presenti ieri');
  const summary = type === 'unchanged' ? 'Nessun cambiamento materiale da ieri.' : type === 'returned' ? 'La storia ritorna con elementi nuovi: ' + details.join('; ') + '.' : type === 'corrected' ? 'Correzione rispetto a ieri: ' + details.join('; ') + '.' : 'Da ieri: ' + details.join('; ') + '.';
  return { type, changed, summary, addedNumbers, removedNumbers, newSources, overlap: Number(overlap.toFixed(3)), polarityChanged };
}

export function materiallyChanged(previous, cluster) {
  return storyDelta(previous, cluster, sentieroDayKey()).changed;
}

async function continuityClusters(items, key) {
  const previous = await storeAll('stories'), clusters = clusterNews(items);
  return clusters.map(cluster => {
    const tokens = new Set(cluster.signature || []);
    const match = previous.map(record => { const old = new Set((record.signature || []).map(token => canonicalToken(foldText(token)))), common = intersectionSize(tokens, old), numberOverlap = clusterNumbers(cluster).some(number => String(record.numbers || '').split('|').includes(number)); return { record, common, score: similarity(tokens, old) + (numberOverlap ? 0.08 : 0) }; }).filter(candidate => candidate.common >= 2).sort((a, b) => b.score - a.score)[0];
    const old = match && match.score >= 0.42 ? match.record : null, delta = storyDelta(old, cluster, key);
    const withDelta = { ...cluster, storyId: old ? old.storyId : cluster.storyId, firstSeen: old ? old.firstSeen : key, lastSeen: key, lastMaterialChange: delta.changed ? key : old && old.lastMaterialChange, changed: delta.changed, deltaType: delta.type, deltaSummary: delta.summary, delta, previousContext: old && old.context || '', previousClaims: old && old.lastClaims || [], previous: old || null };
    withDelta.importance = editorialImportance(withDelta);
    return withDelta;
  });
}

async function persistStories(clusters, edition, key) {
  const articleByStory = new Map();
  for (const article of edition && edition.articles || []) for (const storyId of article.storyIds || []) articleByStory.set(storyId, article);
  for (const cluster of (clusters || []).slice(0, 60)) {
    const article = articleByStory.get(cluster.storyId), signature = [...unionTokens(cluster.items)].sort().slice(0, 64);
    const old = cluster.previous || {}, currentHistory = { day: key, evidenceFingerprint: cluster.evidenceFingerprint, deltaType: cluster.deltaType, numbers: clusterNumbers(cluster), headline: article && article.title || '' };
    const history = [...(Array.isArray(old.history) ? old.history.filter(entry => entry && entry.day !== key) : []), currentHistory].slice(-14);
    const lastClaims = article ? article.claims.map(claim => cleanText(claim.text, 900)) : old.lastClaims || [];
    await storePut('stories', {
      storyId: cluster.storyId, firstSeen: cluster.firstSeen || key, lastSeen: key,
      lastMaterialChange: cluster.changed ? key : cluster.lastMaterialChange || key,
      signature, numbers: clusterNumbers(cluster).join('|'), negated: semanticProfile(cluster.items.map(item => item.title + ' ' + item.summary).join(' ')).negated,
      sourceIds: [...new Set(cluster.items.map(item => item.sourceId).filter(Boolean))], sourceTiers: [...new Set(cluster.items.map(item => item.sourceMeta && item.sourceMeta.tier).filter(Boolean))],
      sourcePerspectives: [...new Set(cluster.items.map(item => item.sourceMeta && item.sourceMeta.perspective).filter(Boolean))], evidenceFingerprint: cluster.evidenceFingerprint,
      context: article ? cleanText(article.title + '. ' + article.kicker + ' ' + lastClaims.join(' '), 900) : cleanText(cluster.previousContext, 900),
      lastClaims, lastEditionDay: article ? key : old.lastEditionDay || '', history
    });
  }
}

function sourceMap(items) { return new Map((items || []).map(item => [String(item.id), item])); }

export function fallbackEdition(items, key, preparedClusters) {
  const clusters = selectEditorialStories(preparedClusters || clusterNews(items), 5);
  const articles = [];
  for (const cluster of clusters) {
    const usable = cluster.items.filter(item => cleanText(item.summary || item.title, 900).length >= 24).sort((a, b) => tierRank(b) - tierRank(a) || (a.sourceMeta?.perspective === b.sourceMeta?.perspective ? 0 : a.sourceMeta?.perspective === 'primary' ? -1 : 1) || Date.parse(b.published) - Date.parse(a.published));
    if (!usable.length) continue;
    const preferredLanguage = usable.find(item => item.sourceMeta && item.sourceMeta.language === 'it') || usable[0], claims = [];
    for (const evidence of usable) {
      const text = cleanText(evidence.summary || evidence.title, 780), detail = claimEvidenceDetail(text, [evidence.id], items);
      if (detail.supported && !claims.some(claim => profileSimilarity(semanticProfile(claim.text), semanticProfile(text)) > 0.82)) claims.push({ text, sourceIds: [evidence.id], evidenceScore: Number(detail.score.toFixed(3)), provenance: detail.provenance });
      if (claims.length === 2) break;
    }
    if (!claims.length) continue;
    const perspectives = new Set(usable.map(item => item.sourceMeta && item.sourceMeta.perspective).filter(Boolean)), area = preferredLanguage.sourceMeta && preferredLanguage.sourceMeta.area;
    const section = ({ economy: 'Economia', health: 'Salute', climate: 'Clima', science: 'Scienza', institutions: 'Istituzioni', statistics: 'Dati', investigations: 'Inchieste' })[area] || 'Mondo';
    const kicker = cluster.deltaSummary + (perspectives.size > 1 ? ' Il materiale comprende una fonte primaria e una verifica editoriale indipendente.' : ' Il testo resta aderente all’unica evidenza solida disponibile.');
    articles.push({ title: preferredLanguage.title, section, kicker, claims, storyIds: [cluster.storyId], sourceIds: [...new Set(claims.flatMap(claim => claim.sourceIds))], importance: cluster.importance.score, importanceReasons: cluster.importance.reasons, deltaType: cluster.deltaType || 'new', deltaFromYesterday: cluster.deltaSummary || 'Nuova oggi.' });
  }
  if (!articles.length) return null;
  articles.sort((a, b) => b.importance - a.importance); articles.forEach((article, index) => { article.presentation = index === 0 ? 'lead' : index < 3 ? 'major' : 'brief'; });
  const edition = { v: VERSION, dayKey: key, title: 'Il Giornale di Sentiero', deck: articles.length === 1 ? 'Una sola storia supera oggi la soglia di rilevanza e verificabilità.' : 'Le storie che cambiano davvero il quadro, ordinate per conseguenza e solidità dell’evidenza.', generatedAt: new Date().toISOString(), articles, corrections: [], essential: true };
  edition.rubric = editionRubric(edition, items); edition.rubric.issues = [...new Set([...edition.rubric.issues, 'edizione-essenziale'])];
  return edition;
}

const EDITION_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'deck', 'articles', 'corrections'],
  properties: {
    title: { type: 'string' },
    deck: { type: 'string' },
    articles: {
      type: 'array', minItems: 1, maxItems: 6,
      items: {
        type: 'object', additionalProperties: false,
        required: ['section', 'title', 'kicker', 'storyIds', 'claims'],
        properties: {
          section: { type: 'string' }, title: { type: 'string' }, kicker: { type: 'string' },
          storyIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
          claims: {
            type: 'array', minItems: 1, maxItems: 6,
            items: { type: 'object', additionalProperties: false, required: ['text', 'sourceIds'], properties: {
              text: { type: 'string' }, sourceIds: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } }
            } }
          }
        }
      }
    },
    corrections: {
      type: 'array', maxItems: 3,
      items: { type: 'object', additionalProperties: false, required: ['text', 'sourceIds', 'storyIds'], properties: {
        text: { type: 'string' }, sourceIds: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } }, storyIds: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string' } }
      } }
    }
  }
};

async function composeEdition(items, clusters, key, signal) {
  const selected = selectEditorialStories(clusters, 12), packets = selected.map(cluster => ({ storyId: cluster.storyId, firstSeen: cluster.firstSeen, lastMaterialChange: cluster.lastMaterialChange, changedToday: cluster.changed, deltaFromYesterday: cluster.delta, contextAlreadyExplained: cluster.previousContext, claimsPublishedBefore: cluster.previousClaims, importance: cluster.importance, sources: cluster.items.slice(0, 6).map(item => ({ id: item.id, source: item.source, sourceId: item.sourceId, sourceMeta: item.sourceMeta, provenance: item.provenance, published: item.published, title: item.title, summary: cleanText(item.summary, 900), url: item.url })) }));
  if (!packets.length) return null;
  if (!context || !context.canGenerate || !context.canGenerate()) return fallbackEdition(items, key, clusters);
  const system = `Sei la redazione del Giornale di Sentiero: un quotidiano italiano finito che si legge una volta e lascia un modello del mondo più nitido. Il materiale è pubblico, già raggruppato e ordinato con una misura deterministica di importanza; Gemini è editor, mai fonte. Scegli da una a sei storie, anche una sola: nessun minimo, nessun riempitivo, nessuna quota tematica. Pubblica soltanto ciò che cambia comprensione, conseguenze o possibilità d'azione. Ogni frase fattuale deve essere un claim autonomo con gli id esatti delle fonti che la sostengono. Titolo e apertura non possono promettere più dei claim. Non aggiungere causalità, precedenti, intenzioni, previsioni o contesto enciclopedico assente. Distingui ciò che un'istituzione dichiara da ciò che una redazione indipendente verifica; una ripetizione non è corroborazione. Usa deltaFromYesterday e claimsPublishedBefore: non raccontare di nuovo l'invariato e nomina con precisione cosa è cambiato. Rappresenta divergenze e incertezza senza falsa equivalenza. Scrivi prosa italiana concreta, ritmica, sobria e memorabile: niente gergo da briefing, elenchi travestiti, morale, formule generiche o clickbait. Gerarchizza per portata, durata, irreversibilità e solidità dell'evidenza, non per volume di copertura. corrections è ammesso solo per una storia marcata corrected e richiede storyIds. Il giornale deve avere una fine.`;
  const user = 'GIORNO: ' + key + '\nSTORIE PUBBLICHE E CONTINUITÀ (JSON):\n' + JSON.stringify(packets);
  const first = await context.ai({ system, user, task: 'day-newspaper', schema: EDITION_SCHEMA, maxOutputTokens: 4600, reasoning: 'high', timeout: 65000, priority: 18, signal });
  const allowedStoryIds = new Set(selected.map(cluster => cluster.storyId)), clusterMap = new Map(selected.map(cluster => [cluster.storyId, cluster]));
  let best = first && !first.err ? validateEdition(first.json, items, key, allowedStoryIds, clusterMap) : null;
  const critic = `Sei l'Editorial Critic avversariale. Ricomponi l'intera edizione, non commentarla e non difendere la bozza. Cerca attivamente: causalità inventata; titolo più forte dell'evidenza; falsa novità rispetto a ieri; dichiarazione istituzionale riciclata come verifica indipendente; due fonti che ripetono lo stesso comunicato; numeri o soggetti senza provenienza; incertezza cancellata; falsa equivalenza; apertura gerarchicamente sbagliata; articoli messi per raggiungere un numero; prosa burocratica, generica o sensazionalista; contesto già spiegato ripetuto. Elimina senza sostituire ogni articolo debole. I problemi deterministici già rilevati sono: ${JSON.stringify(best ? best.rubric.issues : ['bozza respinta dal gate semantico/provenance'])}. Restituisci solo la nuova edizione completa nello schema, senza introdurre fatti.`;
  const repaired = await context.ai({ system: system + '\n' + critic, user: user + '\nBOZZA SOTTO ESAME:\n' + JSON.stringify(first && first.json || {}), task: 'day-newspaper-critic', schema: EDITION_SCHEMA, maxOutputTokens: 4600, reasoning: 'high', timeout: 65000, priority: 18, signal });
  const checked = repaired && !repaired.err ? validateEdition(repaired.json, items, key, allowedStoryIds, clusterMap) : null;
  if (checked && (!best || checked.rubric.score >= best.rubric.score)) best = checked;
  return best || fallbackEdition(items, key, clusters);
}

function renderEdition(edition, items, cachedLabel = '') {
  const mount = room && room.querySelector('.news-mount'); if (!mount) return;
  if (!edition) { renderNewsState('Oggi le fonti disponibili non bastano per comporre un’edizione affidabile. Nessun riempitivo prende il loro posto.', true); return; }
  latestEdition = edition; const sources = sourceMap(items || edition.sources || []), wrap = element('div', 'edition');
  const head = element('header', 'edition-head'); head.append(element('h3', '', edition.title)); if (edition.deck) head.append(element('p', '', edition.deck));
  const when = new Date(edition.generatedAt || Date.now()), meta = [(cachedLabel ? cachedLabel + ' · ' : '') + 'edizione delle ' + new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(when)];
  const sourceWhen = Date.parse(edition.sourceUpdatedAt || ''); if (Number.isFinite(sourceWhen)) meta.push('fonti aggiornate ' + new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(sourceWhen)));
  head.append(element('p', 'edition-meta', meta.join(' · ')));
  const tools = element('div', 'edition-tools'); const refreshButton = button('news-refresh', 'Verifica aggiornamenti', () => refreshNews(true)); refreshButton.setAttribute('aria-label', 'Verifica se il quadro del giorno è cambiato'); tools.append(refreshButton); head.append(tools); wrap.append(head);
  if (edition.corrections && edition.corrections.length) {
    const corrections = element('aside', 'edition-corrections'); corrections.append(element('strong', '', 'Correzioni e precisazioni'));
    for (const correction of edition.corrections) { const paragraph = element('p', '', correction.text + ' '); for (const id of correction.sourceIds || []) { const source = sources.get(String(id)); if (!source) continue; const link = element('a', '', 'Fonte'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; paragraph.append(link); } corrections.append(paragraph); } wrap.append(corrections);
  }
  const front = element('section', 'edition-front'); front.setAttribute('aria-label', 'Prima pagina');
  edition.articles.forEach((article, index) => {
    const presentation = article.presentation || (index === 0 ? 'lead' : index < 3 ? 'major' : 'brief'), node = element('article', 'news-article ' + presentation); node.dataset.importance = String(article.importance || 0); node.append(element('span', 'section', article.section));
    const deltaLabels = { new: 'Nuova oggi', developed: 'Cosa cambia da ieri', corrected: 'Correzione', returned: 'Ritorna con fatti nuovi' }; node.append(element('span', 'article-delta', deltaLabels[article.deltaType] || 'Sviluppo'));
    node.append(element('h3', '', article.title)); if (article.kicker) node.append(element('p', 'kicker', article.kicker));
    const body = element('div', 'body'); for (const claim of article.claims || []) { const paragraph = element('p'); paragraph.append(document.createTextNode(claim.text + ' ')); const citations = element('span', 'claim-sources'); citations.setAttribute('aria-label', 'Provenienza del paragrafo'); let sourceNumber = 0; for (const id of claim.sourceIds || []) { const source = sources.get(String(id)); if (!source) continue; const meta = source.sourceMeta || {}, link = element('a', '', '[' + (++sourceNumber) + ']'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = source.source + ' · ' + (meta.perspective === 'primary' ? 'fonte primaria' : 'redazione indipendente') + (meta.domain ? ' · ' + meta.domain : ''); citations.append(link); } paragraph.append(citations); body.append(paragraph); } node.append(body);
    const links = element('div', 'news-sources'); for (const id of article.sourceIds) { const source = sources.get(String(id)); if (!source) continue; const meta = source.sourceMeta || {}, role = meta.perspective === 'primary' ? 'Primaria' : 'Indipendente', link = element('a', '', source.source + ' · ' + role + ' · ' + new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(new Date(source.published))); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; const p = source.provenance || {}; link.title = 'Provenienza: ' + (p.evidenceId || source.id) + (p.retrievedAt ? ' · raccolta ' + p.retrievedAt : ''); links.append(link); } node.append(links); front.append(node);
  });
  wrap.append(front);
  wrap.append(element('p', 'edition-end', 'Fine dell’edizione di oggi.')); mount.replaceChildren(wrap);
}

function renderNewsState(message, retry) {
  const mount = room && room.querySelector('.news-mount'); if (!mount) return; const state = element('div', 'news-state'); state.append(element('b', '', message));
  if (retry) state.append(button('news-refresh', 'Riprova', () => refreshNews(true))); mount.replaceChildren(state);
}

function newsEndpoint() {
  const raw = context && context.newsEndpoint ? context.newsEndpoint() : '';
  try { const url = new URL(String(raw || '')); if (url.protocol === 'https:' || (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname))) return url.toString().replace(/\/+$/, ''); } catch (_) {}
  return '';
}

function sanitizeBundledEdition(raw, items, packetGeneratedAt, packetDayKey) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.articles) || !raw.articles.length) return null;
  const available = new Set(items.map(item => String(item.id))), deltas = new Set(['new', 'developed', 'corrected', 'returned', 'unchanged']);
  const articles = [];
  for (const sourceArticle of raw.articles.slice(0, 6)) {
    if (!sourceArticle || !Array.isArray(sourceArticle.claims)) continue;
    const claims = [];
    for (const sourceClaim of sourceArticle.claims.slice(0, 6)) {
      const text = cleanText(sourceClaim && sourceClaim.text, 900), sourceIds = [...new Set((sourceClaim && sourceClaim.sourceIds || []).map(String))].filter(id => available.has(id)).slice(0, 4);
      if (text.length >= 24 && sourceIds.length) claims.push({ text, sourceIds });
    }
    const title = cleanText(sourceArticle.title, 180), section = cleanText(sourceArticle.section, 50);
    if (!title || !section || !claims.length) continue;
    const importance = Math.max(0, Math.min(100, Number(sourceArticle.importance) || 0)), deltaType = deltas.has(sourceArticle.deltaType) ? sourceArticle.deltaType : 'new';
    articles.push({
      title, section, kicker: cleanText(sourceArticle.kicker, 300), claims,
      storyIds: [...new Set((sourceArticle.storyIds || []).map(id => cleanText(id, 100)).filter(Boolean))].slice(0, 3),
      sourceIds: [...new Set(claims.flatMap(claim => claim.sourceIds))], importance,
      importanceReasons: (sourceArticle.importanceReasons || []).map(reason => cleanText(reason, 120)).filter(Boolean).slice(0, 6),
      deltaType, deltaFromYesterday: cleanText(sourceArticle.deltaFromYesterday, 300),
      presentation: ['lead', 'major', 'brief'].includes(sourceArticle.presentation) ? sourceArticle.presentation : ''
    });
  }
  if (!articles.length) return null;
  articles.forEach((article, index) => { if (!article.presentation) article.presentation = index === 0 ? 'lead' : index < 3 ? 'major' : 'brief'; });
  const corrections = (Array.isArray(raw.corrections) ? raw.corrections : []).slice(0, 3).map(item => ({
    text: cleanText(item && item.text, 500),
    sourceIds: [...new Set((item && item.sourceIds || []).map(String))].filter(id => available.has(id)).slice(0, 4),
    storyIds: [...new Set((item && item.storyIds || []).map(id => cleanText(id, 100)).filter(Boolean))].slice(0, 2)
  })).filter(item => item.text.length >= 24 && item.sourceIds.length);
  const generatedAt = Number.isFinite(Date.parse(raw.generatedAt || '')) ? raw.generatedAt : packetGeneratedAt;
  const sourceUpdatedAt = Number.isFinite(Date.parse(raw.sourceUpdatedAt || '')) ? raw.sourceUpdatedAt : packetGeneratedAt;
  return { v: VERSION, dayKey: cleanText(raw.dayKey || packetDayKey, 10), title: cleanText(raw.title, 90) || 'Il Giornale di Sentiero', deck: cleanText(raw.deck, 300), generatedAt, sourceUpdatedAt, articles, corrections, essential: Boolean(raw.essential) };
}

async function readNewsPacket(urlOrPaths, signal, channel) {
  let data;
  if (Array.isArray(urlOrPaths)) data = await readDistributedJson(urlOrPaths, signal, 900000, value => value && Array.isArray(value.items));
  else data = await parseDistributedResponse(await fetch(urlOrPaths, { signal, cache: 'no-store' }), 900000);
  if (!data || !Array.isArray(data.items)) throw new Error('fonti');
  const items = data.items.filter(item => item && item.id && item.title && item.url && item.source && /^https:\/\//.test(item.url)).slice(0, 96).map(item => ({
    id: cleanText(item.id, 80), title: cleanText(item.title, 240), summary: cleanText(item.summary, 1200), url: item.url, published: item.published, source: cleanText(item.source, 80), sourceId: cleanText(item.sourceId, 40),
    sourceMeta: item.sourceMeta && typeof item.sourceMeta === 'object' ? { tier: cleanText(item.sourceMeta.tier, 2), type: cleanText(item.sourceMeta.type, 30), area: cleanText(item.sourceMeta.area, 30), role: cleanText(item.sourceMeta.role, 80), reliability: cleanText(item.sourceMeta.reliability, 80), domain: cleanText(item.sourceMeta.domain, 80), language: cleanText(item.sourceMeta.language, 8), perspective: cleanText(item.sourceMeta.perspective, 20), ownership: cleanText(item.sourceMeta.ownership, 30), country: cleanText(item.sourceMeta.country, 8), coverage: cleanText(item.sourceMeta.coverage, 20), retrieval: cleanText(item.sourceMeta.retrieval, 20), freshnessMinutes: Math.max(0, Math.min(1440, Number(item.sourceMeta.freshnessMinutes) || 0)), terms: cleanText(item.sourceMeta.terms, 80) } : null,
    provenance: item.provenance && typeof item.provenance === 'object' ? { evidenceId: cleanText(item.provenance.evidenceId, 100), sourceId: cleanText(item.provenance.sourceId, 40), sourceDomain: cleanText(item.provenance.sourceDomain, 100), canonicalUrl: /^https:\/\//.test(item.provenance.canonicalUrl || '') ? item.provenance.canonicalUrl : item.url, publishedAt: cleanText(item.provenance.publishedAt, 40), retrievedAt: cleanText(item.provenance.retrievedAt, 40), contentFingerprint: cleanText(item.provenance.contentFingerprint, 100) } : { evidenceId: cleanText(item.id, 80), sourceId: cleanText(item.sourceId, 40), canonicalUrl: item.url, publishedAt: cleanText(item.published, 40) }
  }));
  if (!items.length) throw new Error('fonti');
  const generatedAt = cleanText(data.generatedAt, 40), dayKey = cleanText(data.dayKey, 10);
  return { items, generatedAt, dayKey, channel, edition: channel === 'snapshot' ? sanitizeBundledEdition(data.edition, items, generatedAt, dayKey) : null };
}

async function fetchSources(endpoint, key, signal) {
  const hour = new Date().getHours(), slot = key + '-' + (hour < 12 ? 'mattino' : 'giorno');
  if (endpoint) {
    const remote = new AbortController(), abort = () => remote.abort(), timer = setTimeout(abort, 7000);
    if (signal) { if (signal.aborted) remote.abort(); else signal.addEventListener('abort', abort, { once: true }); }
    try { return await readNewsPacket(endpoint + '/v1/day/news?slot=' + encodeURIComponent(slot), remote.signal, 'worker'); }
    catch (_) {}
    finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', abort); }
  }
  return readNewsPacket(NEWS_ASSET_PATHS, signal, 'snapshot');
}

export async function refreshNews(force = false) {
  if (!room || newsBuild) return newsBuild;
  const key = sentieroDayKey(), cached = await cacheGet(key), age = cached ? Date.now() - Number(cached.at || 0) : Infinity;
  if (force && Date.now() - lastManualRefresh < 10 * 60000) { if (cached) renderEdition(cached.edition, cached.sources, 'quadro già verificato'); return cached && cached.edition; }
  if (force) lastManualRefresh = Date.now();
  if (cached && !force) { renderEdition(cached.edition, cached.sources, 'salvata sul dispositivo'); if (age < 4 * 3600000) return cached.edition; }
  if (!cached) { const latest = await cacheLatest(); if (latest) renderEdition(latest.edition, latest.sources, latest.key === key ? 'salvata sul dispositivo' : 'ultima edizione disponibile'); else renderNewsState('La Terra sta raccogliendo le fonti di oggi.', false); }
  const endpoint = newsEndpoint();
  if (newsAbort) newsAbort.abort(); newsAbort = new AbortController();
  newsBuild = (async () => {
    try {
      const packet = await fetchSources(endpoint, key, newsAbort.signal), items = packet.items;
      if (packet.edition) {
        const edition = { ...packet.edition, sourceUpdatedAt: packet.edition.sourceUpdatedAt || packet.generatedAt, sourceChannel: packet.channel, materialChanges: [] };
        renderEdition(edition, items);
        await cachePut({ key, at: Date.now(), checkedAt: Date.now(), edition, sources: items });
        return edition;
      }
      const clusters = await continuityClusters(items, key), changed = selectEditorialStories(clusters, 12);
      if (cached && !changed.length) { await cachePut({ ...cached, checkedAt: Date.now() }); renderEdition(cached.edition, cached.sources, 'quadro verificato, nessun cambiamento rilevante'); return cached.edition; }
      const edition = await composeEdition(items, clusters, key, newsAbort.signal); if (!edition) throw new Error('edizione');
      edition.generatedAt = edition.generatedAt || new Date().toISOString(); edition.sourceUpdatedAt = packet.generatedAt || new Date().toISOString(); edition.sourceChannel = packet.channel; edition.materialChanges = changed.map(cluster => cluster.storyId);
      await cachePut({ key, at: Date.now(), checkedAt: Date.now(), edition, sources: items }); await persistStories(clusters, edition, key); renderEdition(edition, items); return edition;
    } catch (error) { if (!(error && error.name === 'AbortError') && !cached && !latestEdition) renderNewsState('Oggi nessuna storia supera insieme le soglie di rilevanza e verificabilità. Nessun riempitivo prende il suo posto.', true); return cached && cached.edition; }
    finally { newsBuild = null; }
  })();
  return newsBuild;
}

export async function open(nextContext) {
  context = nextContext || context; installRoom();
  const today = sentieroDayKey(); weekStart = mondayKey(today); selectedDay = today;
  document.body.classList.add('giorno-aperto'); room.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => room.classList.add('aperta')));
  renderWeek(); renderWord(); refreshNews(false);
  if (!listenerBound) { listenerBound = true; window.addEventListener('sentiero:state', () => { if (room && !room.hidden) { renderWeek(); renderWord(); } }); }
  const closeButton = room.querySelector('.giorno-head button'); if (closeButton) closeButton.focus({ preventScroll: true });
}

export function close() {
  if (!room || room.hidden) return;
  if (newsAbort) { try { newsAbort.abort(); } catch (_) {} newsAbort = null; }
  room.classList.remove('aperta'); document.body.classList.remove('giorno-aperto');
  setTimeout(() => { if (room && !room.classList.contains('aperta')) room.hidden = true; }, 230);
}

export function refresh() {
  if (room && !room.hidden) { renderWeek(); renderWord(); }
}
