const DAWN_MINUTES = 4 * 60 + 20;
const NIGHT_MINUTES = 19 * 60;
const DAY_MS = 86400000;
const VERSION = 4;
export const EDITORIAL_PUBLISH_THRESHOLD = 52;

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

export function foldText(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
export function normalizeNumber(value) { return String(value || '').replace(/\s/g, '').replace(',', '.').replace(/\.$/, ''); }
export function extractNumbers(value) { return [...new Set((foldText(value).match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(normalizeNumber))]; }
export function canonicalToken(token) {
  if (CONCEPT.has(token)) return CONCEPT.get(token);
  if (token.length > 7) return token.replace(/(?:mente|zione|zioni|ation|ations|ements|ement|ments|ment|iques|ique|ciones|cion|ungen|ung)$/i, '') || token;
  if (token.length > 5) return token.replace(/(?:ing|ers|es|s)$/i, '') || token;
  return token;
}
export function storyTokens(value) {
  const words = foldText(value).replace(/[^a-z0-9\p{L}]+/gu, ' ').split(/\s+/), out = new Set();
  for (const raw of words) { if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue; const token = canonicalToken(raw); if (token.length >= 3 && !STOP.has(token)) out.add(token); }
  return out;
}

const QUEST_SENSITIVE = new Set(('salute sanitario sanitaria medico medica malattia malattie diagnosi terapia farmaco farmaci ospedale oncologia oncologico oncologica psicologo psicologa psichiatria depressione ansia suicidio dipendenza dipendenze alcol droga droghe ' +
  'religione religioso religiosa cristiano cristiana musulmano musulmana ebreo ebrea ateo atea chiesa moschea sinagoga ' +
  'sesso sessuale sessualita orientamento gay lesbica trans identita genere gravidanza aborto ' +
  'politica politico politica partito voto elezione elezioni sindacato etnia etnico razza razziale cittadinanza migrante rifugiato ' +
  'banca debito debiti mutuo stipendio reddito finanza investimento investimenti conto iban fisco fiscale avvocato tribunale reato processo carcere').split(/\s+/));

export function safeQuestKeywords(quests) {
  const counts = new Map();
  for (const quest of Array.isArray(quests) ? quests : []) {
    if (!quest || quest.fatto) continue;
    for (const token of storyTokens(cleanText(quest.titolo, 180))) {
      if (QUEST_SENSITIVE.has(token) || [...QUEST_SENSITIVE].some(word => token.startsWith(word) || word.startsWith(token))) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it')).slice(0, 8).map(([word]) => word);
}

export function personalizeEditionForDevice(edition, items, quests) {
  if (!edition || !Array.isArray(edition.articles) || edition.articles.length < 2) return edition;
  const keywords = safeQuestKeywords(quests); if (!keywords.length) return edition;
  const byId = new Map((items || []).map(item => [String(item.id), item]));
  const ranked = edition.articles.map((article, index) => {
    const evidence = (article.sourceIds || []).map(id => byId.get(String(id))).filter(Boolean);
    const tokens = storyTokens(evidence.map(item => [item.title, item.summary, ...(item.topics || [])].join(' ')).join(' '));
    const matches = keywords.filter(keyword => tokens.has(keyword)).length;
    return { article: { ...article, localRelevanceBoost: Math.min(3, matches) }, index, base: Number(article.importance || 0), score: Number(article.importance || 0) + Math.min(3, matches) };
  });
  const lead = ranked.shift();
  ranked.sort((a, b) => Math.abs(a.base - b.base) > 4 ? b.base - a.base : b.score - a.score || b.base - a.base || a.index - b.index);
  const articles = [lead, ...ranked].map((entry, index) => ({ ...entry.article, presentation: index === 0 ? 'lead' : index < 3 ? 'major' : 'brief' }));
  return { ...edition, articles };
}

export function looksItalian(value) {
  const text = ' ' + foldText(value) + ' ';
  const italian = (text.match(/\b(?:il|lo|la|gli|le|un|una|di|del|della|che|con|per|nel|nella|sono|ha|hanno|tra|questa|questo|dopo|oggi|ieri)\b/g) || []).length;
  const english = (text.match(/\b(?:the|and|with|from|that|this|has|have|will|after|before|according|says|said|new)\b/g) || []).length;
  return italian >= 2 && italian >= english * 2;
}

export function editionIsItalian(edition) {
  if (!edition || edition.language !== 'it' || !Array.isArray(edition.articles) || !edition.articles.length) return false;
  return edition.articles.every(article => looksItalian([article.title, article.kicker, ...(article.claims || []).map(claim => claim.text)].join(' ')));
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

const EVENT_MACRO_ANCHORS = new Set('russia russian ucraina ukraine europa europe unione union nato ue onu mosca kiev cremlino putin presidente president governo government parlamento parliament ministro minister guerra war pace peace'.split(/\s+/).map(canonicalToken));

function namedEventAnchors(value) {
  const matches = String(value || '').replace(/<[^>]*>/g, ' ').match(/\p{Lu}[\p{L}'’-]{2,}/gu) || [];
  return new Set(matches.map(token => canonicalToken(foldText(token))).filter(token => token.length >= 3 && !STOP.has(token) && !EVENT_MACRO_ANCHORS.has(token)));
}

function likelySameEvent(a, b) {
  if (a.publishedAt && b.publishedAt && Math.abs(a.publishedAt - b.publishedAt) > 36 * 60 * 60 * 1000) return false;
  const common = [...a.tokens].filter(token => b.tokens.has(token));
  const specificCommon = common.filter(token => !EVENT_MACRO_ANCHORS.has(token));
  const sharedAnchors = [...a.namedAnchors].filter(token => b.namedAnchors.has(token));
  return sharedAnchors.length >= 2 && specificCommon.length >= 3 && similarity(a.tokens, b.tokens) >= 0.12;
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
    const normalizedSummary = sanitizeEditorial(item.summary || '', 900), eventText = item.title + ' ' + normalizedSummary.slice(0, 420);
    const profile = { ...semanticProfile(eventText), namedAnchors: namedEventAnchors(item.title + ' ' + normalizedSummary), publishedAt: Date.parse(item.published) || 0 }, tokens = profile.tokens;
    let cluster = clusters.find(candidate => candidate.profiles.some(other => {
      const common = intersectionSize(tokens, other.tokens), score = profileSimilarity(profile, other);
      return (common >= 2 && score >= 0.47) || (common >= 1 && score >= 0.4 && [...profile.numbers].some(number => other.numbers.has(number))) || likelySameEvent(profile, other);
    }));
    if (!cluster) { cluster = { id: 'c' + (clusters.length + 1), tokens: new Set(), profiles: [], items: [] }; clusters.push(cluster); }
    cluster.items.push(item);
    cluster.profiles.push(profile);
    for (const token of tokens) cluster.tokens.add(token);
  }
  let merged = clusters.map(({ tokens, profiles, ...cluster }) => ({ ...cluster, storyId: storyKey(cluster.items), signature: [...tokens].sort().slice(0, 64), evidenceFingerprint: hashText(cluster.items.map(item => item.provenance && item.provenance.contentFingerprint || item.id).sort().join('|')) }));
  merged = mergeCrossLanguageClusters(merged);
  return merged;
}

function mergeCrossLanguageClusters(clusters) {
  const enriched = clusters.map(c => ({
    ...c,
    numbers: new Set(c.items.flatMap(item => extractNumbers(item.title + ' ' + item.summary))),
    tokens: new Set(c.signature || []),
    langs: [...new Set(c.items.map(item => item.sourceMeta?.language).filter(Boolean))]
  }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < enriched.length; i++) {
      if (enriched[i].items.length === 0) continue;
      for (let j = i + 1; j < enriched.length; j++) {
        if (enriched[j].items.length === 0) continue;
        if (shouldMergeClusters(enriched[i], enriched[j])) {
          mergeInto(enriched[i], enriched[j]);
          merged = true;
        }
      }
    }
  }
  return enriched.filter(c => c.items.length > 0).map(({ numbers, tokens, langs, ...c }) => c);
}

function isDateLikeNumber(n) {
  const num = Number(n);
  return (num >= 2020 && num <= 2030) || (num >= 1 && num <= 31);
}

function isSignificantNumber(n) {
  const num = Number(n);
  return num >= 100 && !isDateLikeNumber(n);
}

function shouldMergeClusters(a, b) {
  const sharedNumbers = [...a.numbers].filter(n => b.numbers.has(n) && !isDateLikeNumber(n));
  const significantShared = sharedNumbers.filter(isSignificantNumber);
  if (sharedNumbers.length === 0) return false;
  const tokenSim = similarity(a.tokens, b.tokens);
  if (significantShared.length >= 2 && tokenSim >= 0.12) return true;
  if (significantShared.length >= 1 && tokenSim >= 0.10) return true;
  if (sharedNumbers.length >= 2 && tokenSim >= 0.2) return true;
  if (sharedNumbers.length >= 1 && tokenSim >= 0.35) return true;
  return false;
}

function mergeInto(target, source) {
  for (const item of source.items) target.items.push(item);
  for (const n of source.numbers) target.numbers.add(n);
  for (const t of source.tokens) target.tokens.add(t);
  target.signature = [...target.tokens].sort().slice(0, 64);
  source.items.length = 0;
  source.numbers.clear();
  source.tokens.clear();
}

function cleanText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function sanitizeHtml(value) {
  if (!value) return '';
  // Prima si rimuovono i tag HTML reali (angolari letterali), poi si decodificano
  // le entità. Così «&lt;tag&gt;» diventa il testo letterale «<tag>» senza essere
  // scambiato per markup e rimosso.
  const named = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&apos;': "'", '&#39;': "'", '&ndash;': '–',
    '&mdash;': '—', '&ldquo;': '"', '&rdquo;': '"', '&lsquo;': "'",
    '&rsquo;': "'", '&hellip;': '…', '&agrave;': 'à', '&egrave;': 'è',
    '&igrave;': 'ì', '&ograve;': 'ò', '&ugrave;': 'ù', '&eacute;': 'é'
  };
  return String(value)
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-zA-Z]+;/g, entity => named[entity.toLowerCase()] !== undefined ? named[entity.toLowerCase()] : entity)
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeEditorial(text, limit) {
  return cleanText(sanitizeHtml(text), limit);
}

export function normalizeEtymology(value, limit = 900) {
  return sanitizeEditorial(value, limit).replace(/\b([Cc]he)\s+(?:è|e)\s+(deriva(?:no)?)\b/giu, '$1 $2');
}

// Kicker generico = ripete lo stato già comunicato dal badge delta (NUOVA OGGI,
// ecc.) senza aggiungere evidenza. Non si renderizza: il badge basta.
export function editorialKicker(value, limit = 260) {
  const text = sanitizeEditorial(value, limit);
  if (!text) return '';
  const t = text.toLowerCase().replace(/[\s\p{P}'\u2019\u02bc]/gu, '');
  if (t === 'nuovaoggi' || t === 'nuovanellaggiornamentodellefonti' || t === 'sviluppo' || t === 'nuovastoria' || t === 'aggiornamento') return '';
  return text;
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
  const lifestyle = items.some(item => /\b(?:podcast|episodio|recensione|review|curiosit[àa]|storia d|amore|relazione|coppia|innamorat|fidanzat|matrimonio|separaz|divorz|vita priv|sentiment|emozion|racconto|narrativa|magazine|lifestyle|rubrica|colonna|opinion|editoriale|personale|diario|memoria|ricordo|aneddot)\b/i.test(item.title || ''));
  const isPurelyLocal = items.every(item => item.sourceMeta?.area === 'local' || item.sourceId?.startsWith('tgr-'));
  const localCrime = isPurelyLocal && items.some(item => /\b(?:uccide|ucciso|morto|morti|incidente|arrestato|intossicat|ferito|feriti|sparatoria|coltellat|omicidio|omicida|investito|traffico|controesodo|rientri)\b/i.test(item.title || ''));
  const area = Math.max(0, ...areas.map(value => AREA_WEIGHT[value] || 4));
  const score = Math.max(0, Math.min(100, 10 + area + Math.min(18, impact * 5) + (primary ? 12 : 0) + (independent ? 10 : 0) + (primary && independent ? 16 : 0) + Math.min(6, Math.max(0, domains.size - 1) * 2) + recency + (cluster && cluster.deltaType === 'developed' ? 9 : cluster && cluster.deltaType === 'new' ? 7 : 0) - (promotional ? 24 : 0) - (lowPublicValue ? 30 : 0) - (lifestyle ? 40 : 0) - (localCrime ? 35 : 0)));
  const reasons = [area ? 'impatto-' + (areas.sort((a, b) => (AREA_WEIGHT[b] || 0) - (AREA_WEIGHT[a] || 0))[0] || 'pubblico') : '', primary && independent ? 'fonte-primaria+verifica-indipendente' : primary ? 'fonte-primaria' : independent ? 'verifica-indipendente' : '', impact ? 'conseguenze-materiali' : '', cluster && cluster.deltaType ? 'delta-' + cluster.deltaType : '', lifestyle ? 'stile-di-vita-escluso' : ''].filter(Boolean);
  return { score, reasons, perspectives: [...perspectives], domains: [...domains] };
}

export function selectEditorialStories(clusters, limit = 12, now = Date.now(), targetLanguage = 'it') {
  return (clusters || []).filter(cluster => cluster && (cluster.changed || !cluster.previous)).map(cluster => {
    const imp = editorialImportance(cluster, now);
    const hasTargetLang = cluster.items.some(item => item.sourceMeta && item.sourceMeta.language === targetLanguage);
    return { ...cluster, targetLanguageAvailable: hasTargetLang, importance: imp };
  }).filter(cluster => cluster.importance.score >= 28).sort((a, b) => b.importance.score - a.importance.score || Number(b.targetLanguageAvailable) - Number(a.targetLanguageAvailable) || Date.parse(b.items[0] && b.items[0].published) - Date.parse(a.items[0] && a.items[0].published)).slice(0, Math.max(1, limit));
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
    const title = sanitizeEditorial(sourceArticle.title, 180), section = cleanText(sourceArticle.section, 50);
    const claims = [];
    for (const rawClaim of sourceArticle.claims.slice(0, 6)) {
      if (!rawClaim || !Array.isArray(rawClaim.sourceIds)) { rejectedEvidence = true; continue; }
      const requested = [...new Set(rawClaim.sourceIds.map(String))], ids = requested.filter(id => map.has(id)).slice(0, 4), text = sanitizeEditorial(rawClaim.text, 900);
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
    if ((allowedStoryIds || clusterMap.size) && importance < EDITORIAL_PUBLISH_THRESHOLD) continue;
    const primaryCluster = related.sort((a, b) => (b.importance?.score || 0) - (a.importance?.score || 0))[0];
    articles.push({ title, section, kicker: editorialKicker(sourceArticle.kicker, 260), claims, storyIds, sourceIds, importance, importanceReasons: primaryCluster && primaryCluster.importance && primaryCluster.importance.reasons || [], deltaType: primaryCluster && primaryCluster.deltaType || 'new', deltaFromYesterday: primaryCluster && primaryCluster.deltaSummary || 'Nuova oggi.' });
  }
  if (!articles.length || rejectedEvidence) return null;
  articles.sort((a, b) => b.importance - a.importance);
  articles.forEach((article, index) => { article.presentation = index === 0 ? 'lead' : index < 3 ? 'major' : 'brief'; });
  const corrections = [];
  for (const rawCorrection of Array.isArray(raw.corrections) ? raw.corrections.slice(0, 3) : []) {
    const ids = [...new Set((rawCorrection.sourceIds || []).map(String))].filter(id => map.has(id)), correctionText = sanitizeEditorial(rawCorrection.text, 500), correctionStories = [...new Set((rawCorrection.storyIds || []).map(String))].filter(id => clusterMap.has(id));
    const correctsPrior = correctionStories.some(id => clusterMap.get(id).deltaType === 'corrected');
    if (correctionText.length >= 24 && ids.length && correctsPrior && claimEvidenceDetail(correctionText, ids, sources).supported) corrections.push({ text: correctionText, sourceIds: ids, storyIds: correctionStories });
    else return null;
  }
  const edition = { v: VERSION, language: 'it', dayKey: key, title: sanitizeEditorial(raw.title, 90) || 'Il Giornale di Sentiero', deck: sanitizeEditorial(raw.deck, 300), generatedAt: new Date().toISOString(), articles, corrections };
  if (!editionIsItalian(edition)) return null;
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
let latestSources = [];
let lastManualRefresh = 0;
let newsRequestedDay = '';
let newsAbortReason = '';
const DISTRIBUTION_VERSION = '60.274.5-rc2';
const NEWS_ASSET_PATHS = ['./assets/giornale/latest.json', './latest.json'];
const WORD_ASSET_PATHS = ['./assets/parole-giorno-v1.json', './parole-giorno-v1.json'];

function validIso(value) {
  const milliseconds = Date.parse(value || '');
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : '';
}

function sourceTime(value) {
  return validIso(value && (value.sourceUpdatedAt || value.sourcesUpdatedAt || value.generatedAt));
}

function sourceDay(value) {
  const iso = sourceTime(value);
  return iso ? sentieroDayKey(new Date(iso)) : '';
}

function freshForDay(edition, key) {
  return Boolean(edition && editionIsItalian(edition) && (cleanText(edition.dayKey, 10) || sourceDay(edition)) === key && sourceDay(edition) === key);
}

function freshnessMilliseconds(value) {
  return Date.parse(sourceTime(value) || '') || Date.parse(value && value.dayKey ? value.dayKey + 'T12:00:00' : '') || 0;
}

function truthfulEdition(value) {
  if (!value || typeof value !== 'object') return value;
  const sourcesUpdatedAt = sourceTime(value), generatedAt = validIso(value.generatedAt), evidenceDay = sourceDay(value), declaredDay = cleanText(value.dayKey, 10);
  const generatedDay = generatedAt ? sentieroDayKey(new Date(generatedAt)) : '', correctGeneratedAt = sourcesUpdatedAt && (!generatedAt || evidenceDay !== generatedDay), correctDay = evidenceDay && evidenceDay !== declaredDay;
  return { ...value, dayKey: evidenceDay || declaredDay, generatedAt: correctGeneratedAt ? sourcesUpdatedAt : generatedAt, sourcesUpdatedAt, sourceUpdatedAt: sourcesUpdatedAt, freshnessCorrected: Boolean(value.freshnessCorrected || correctGeneratedAt || correctDay) };
}

function newsDiagnostic(patch) {
  try {
    const previous = window.__sentieroNewsDiag && typeof window.__sentieroNewsDiag === 'object' ? window.__sentieroNewsDiag : {};
    window.__sentieroNewsDiag = { ...previous, ...patch, currentDay: sentieroDayKey(), online: navigator.onLine !== false };
  } catch (_) {}
}

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
      if (!accept || accept(data)) { try { Object.defineProperty(data, '__sentieroTransport', { value: 'network' }); } catch (_) {} return data; }
    } catch (error) { if (error && error.name === 'AbortError') throw error; }
  }
  if (typeof caches !== 'undefined') {
    for (const path of paths) {
      for (const key of [distributionUrl(path), new URL(path, document.baseURI).toString()]) {
        try { const data = await parseDistributedResponse(await caches.match(key), maxBytes); if (!accept || accept(data)) { try { Object.defineProperty(data, '__sentieroTransport', { value: 'cache-storage' }); } catch (_) {} return data; } } catch (_) {}
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
.news-article{min-width:0;padding:30px 0;border-bottom:1px solid var(--line)}.news-article .section{color:var(--sun);font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.15em;text-transform:uppercase}.article-delta{display:inline-flex;margin:0 0 9px;padding:5px 8px;border:1px solid var(--line);border-radius:999px;color:#5d4a27;font:700 9px/1.2 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}.news-article h3{margin:8px 0 9px;font:500 clamp(27px,8vw,42px)/1.05 Georgia,serif;letter-spacing:-.027em}.news-article.lead{padding-top:36px;border-bottom:2px solid var(--ink)}.news-article.lead h3{font-size:clamp(34px,9vw,52px);line-height:1.05}.news-article.major h3{font-size:clamp(26px,7vw,38px);line-height:1.1}.news-article.brief h3{font-size:clamp(22px,6vw,30px);line-height:1.15}.news-article .kicker{margin:0 0 12px;color:#475951;font:italic 15px/1.4 Georgia,serif}.news-article .body p{margin:0 0 12px;font:400 16px/1.6 Georgia,serif}.news-sources{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}.news-sources a{max-width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:#355d52;font:600 11px/1.25 system-ui,sans-serif;text-decoration:none;overflow-wrap:anywhere}.edition-end{padding:38px 0 10px;text-align:center;font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.17em;text-transform:uppercase}.edition-end::before{content:'◆';display:block;margin-bottom:14px;color:var(--sun);font-size:9px}
.word-card{position:relative;scroll-margin-top:145px;padding:25px 0 3px;border-block:2px solid var(--ink)}.word-card h3{margin:0;font:500 clamp(43px,13vw,70px)/1 Georgia,serif;letter-spacing:-.045em;overflow-wrap:anywhere}.word-meta{margin:9px 0 21px;color:var(--sun);font:700 11px/1.5 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}.word-definition{margin:0 0 17px;font:400 20px/1.55 Georgia,serif}.word-detail{padding-top:15px;border-top:1px solid var(--line);color:#41534b;font:400 15px/1.6 system-ui,sans-serif}.word-detail b{color:var(--ink)}.word-source{margin-top:18px;color:var(--muted);font:400 11px/1.5 system-ui,sans-serif}.word-source a{color:inherit}
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
      state.paroleGiorno[key] = { id: String(word.id), w: String(word.w), l: String(word.l || ''), n: normalizeWord(word.w), p: String(word.p || ''), d: String(word.d || ''), i: String(word.i || ''), e: normalizeEtymology(word.e) };
      if (context && context.save) context.save();
    }
    const card = element('article', 'word-card'); card.append(element('h3', '', word.w));
    card.append(element('p', 'word-meta', [word.l, word.p, word.i].filter(Boolean).join(' · ')));
    card.append(element('p', 'word-definition', word.d));
    const etymology = normalizeEtymology(word.e);
    if (etymology) { const detail = element('p', 'word-detail'); detail.append(element('b', '', 'Origine. ')); detail.append(document.createTextNode(etymology)); card.append(detail); }
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
  try { const db = await openDb(); const rows = await new Promise((resolve, reject) => { const request = db.transaction('editions').objectStore('editions').getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); }); return rows.sort((a, b) => freshnessMilliseconds(b.edition) - freshnessMilliseconds(a.edition) || Number(b.at || 0) - Number(a.at || 0))[0] || null; } catch (_) { return null; }
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

const OPAQUE_TITLE_PATTERNS = [
  /^l'?ultimo\s+\w+$/i,        // "L'ultimo messaggio", "L'ultima notizia"
  /^la\s+\w+$/i,               // "La decisione", "La notizia"
  /^il\s+\w+$/i,               // "Il commento", "Il messaggio"
  /^un\s+\w+$/i,               // "Un aggiornamento"
  /^nuov\w*\s+\w+$/i,          // "Nuova notizia"
  /^aggiornamento$/i,          // "Aggiornamento"
  /^comunicato$/i,             // "Comunicato"
  /^nota$/i,                   // "Nota"
  /^dichiarazione$/i,          // "Dichiarazione"
  /^intervento$/i,             // "Intervento"
  /^risposta$/i,               // "Risposta"
];

const VAGUE_EDITORIAL_FRAMING = /\b(?:edizione|speciale|festival|mostra|rassegna|selezione|ritratto|viaggio|guida|focus|intervista|panorama)\b/i;
const PUBLIC_FACT_ACTION = /\b(?:approva|approvato|approvata|firma|firmato|annuncia|annunciato|riapre|apre|chiude|cancella|vince|premia|dimette|arresta|condanna|scopre|pubblica|aumenta|diminuisce|evacua|muore|morto|morta|uccide|colpisce|salva|salvate|restaura|restaurate|invia|inviato|riduce|taglia|vara|vieta|rilascia|raggiunge|supera)\b/i;

function titleInformationScore(title) {
  const t = cleanText(title, 120), tokens = storyTokens(t);
  const factAction = PUBLIC_FACT_ACTION.test(t), numericFact = /\b\d+(?:[.,]\d+)?\b/.test(t);
  return Math.min(tokens.size, 10) + (factAction ? 12 : 0) + (numericFact ? 8 : 0) + Math.min(6, namedEventAnchors(t).size * 2);
}

function fitEditorialTitle(value, limit = 120) {
  const text = sanitizeEditorial(value, Math.max(300, limit * 2));
  if (text.length <= limit) return text;
  const head = text.slice(0, limit + 1), punctuation = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(' — '), head.lastIndexOf(': '));
  if (punctuation >= Math.floor(limit * 0.55)) return head.slice(0, punctuation).trim();
  return head.slice(0, limit).replace(/\s+\S*$/, '').replace(/[,:;–—-]+$/, '').trim();
}

export function isTitleInformative(title) {
  const t = cleanText(title, 120);
  if (t.length < 15) return false; // troppo breve per essere informativo
  if (OPAQUE_TITLE_PATTERNS.some(rx => rx.test(t))) return false;
  if (VAGUE_EDITORIAL_FRAMING.test(t) && !PUBLIC_FACT_ACTION.test(t) && !/\b\d+(?:[.,]\d+)?\b/.test(t)) return false;
  // deve contenere almeno un'entità sostantiva significativa (non solo articoli/preposizioni)
  const tokens = storyTokens(t);
  const hasEntity = tokens.size >= 2; // almeno 2 token significativi
  return hasEntity;
}

export function selectInformativeTitle(usableItems) {
  // 1. Valuta i titoli originali per densità fattuale, non per lunghezza o posizione.
  const candidates = [...usableItems]
    .map(item => ({ title: fitEditorialTitle(item.title), summary: sanitizeEditorial(item.summary || '', 300) }))
    .filter(c => isTitleInformative(c.title))
    .map((candidate, index) => ({ ...candidate, index, score: titleInformationScore(candidate.title) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  
  if (candidates.length) return candidates[0].title;
  
  // 2. Scegli la frase-fatto più informativa documentata nei sommari.
  const summaryCandidates = usableItems.flatMap((item, itemIndex) => sanitizeEditorial(item.summary || '', 300).split(/[.!?]/).map((sentence, sentenceIndex) => ({
    title: fitEditorialTitle(sentence), itemIndex, sentenceIndex
  }))).filter(candidate => isTitleInformative(candidate.title)).map(candidate => ({ ...candidate, score: titleInformationScore(candidate.title) })).sort((a, b) => b.score - a.score || a.itemIndex - b.itemIndex || a.sentenceIndex - b.sentenceIndex);
  if (summaryCandidates.length) return summaryCandidates[0].title;
  
  // 3. Nessun titolo autosufficiente disponibile: la storia viene esclusa
  return null;
}

export function fallbackEdition(items, key, preparedClusters) {
  const sourceClusters = preparedClusters || clusterNews(items);
  const allClusters = selectEditorialStories(sourceClusters, Math.max(20, sourceClusters.length));
  const italianClusters = allClusters.filter(cluster => 
    cluster.items.some(item => item.sourceMeta && item.sourceMeta.language === 'it' && looksItalian(item.title + ' ' + item.summary))
  );
  
  // Filter out low-value local crime from national sources (AGI, SkyTG24, etc.)
  const isLocalCrimeNational = cluster => {
    const itItems = cluster.items.filter(item => item.sourceMeta?.language === 'it');
    if (itItems.length === 0) return false;
    const hasCrimeKeywords = itItems.some(item => /\b(?:uccide|ucciso|morto|morti|incidente|arrestato|intossicat|ferito|feriti|sparatoria|coltellat|omicidio|omicida|investito|traffico|controesodo|rientri)\b/i.test(item.title || ''));
    if (!hasCrimeKeywords) return false;
    // Penalize only if: no primary source, single Italian source, single language, AND low importance
    const hasPrimary = cluster.items.some(item => item.sourceMeta?.perspective === 'primary');
    const itSourceCount = itItems.length;
    const isMultiLanguage = new Set(cluster.items.map(item => item.sourceMeta?.language).filter(Boolean)).size > 1;
    const maxImportance = Math.max(...cluster.items.map(item => item.sourceMeta?.tier === 'A' ? 3 : item.sourceMeta?.tier === 'B' ? 2 : 1));
    return !hasPrimary && itSourceCount <= 1 && !isMultiLanguage && maxImportance < 3;
  };
  
  const clusters = italianClusters.filter(cluster => !isLocalCrimeNational(cluster)).slice(0, 6);
  const articles = [];
  for (const cluster of clusters) {
    const usable = cluster.items.filter(item => item.sourceMeta && item.sourceMeta.language === 'it' && sanitizeEditorial(item.summary || item.title, 900).length >= 24 && looksItalian(item.title + ' ' + item.summary)).sort((a, b) => tierRank(b) - tierRank(a) || (a.sourceMeta?.perspective === b.sourceMeta?.perspective ? 0 : a.sourceMeta?.perspective === 'primary' ? -1 : 1) || Date.parse(b.published) - Date.parse(a.published));
    if (!usable.length) continue;
    
    // Select best title: prefer informative titles, fallback to building one from summary
    const titleCandidate = selectInformativeTitle(usable);
    if (!titleCandidate) continue; // exclude story if no informative title available
    const preferredLanguage = { ...usable[0], title: titleCandidate };
    const claims = [];
    for (const evidence of usable) {
      const text = sanitizeEditorial(evidence.summary || evidence.title, 780), detail = claimEvidenceDetail(text, [evidence.id], items);
      if (detail.supported && !claims.some(claim => profileSimilarity(semanticProfile(claim.text), semanticProfile(text)) > 0.82)) claims.push({ text, sourceIds: [evidence.id], evidenceScore: Number(detail.score.toFixed(3)), provenance: detail.provenance });
      if (claims.length === 2) break;
    }
    if (!claims.length) continue;
    const perspectives = new Set(usable.map(item => item.sourceMeta && item.sourceMeta.perspective).filter(Boolean)), area = preferredLanguage.sourceMeta && preferredLanguage.sourceMeta.area;
    const section = ({ economy: 'Economia', health: 'Salute', climate: 'Clima', science: 'Scienza', institutions: 'Istituzioni', statistics: 'Dati', investigations: 'Inchieste' })[area] || 'Mondo';
    // Kicker specifico basato sull'evidenza, niente boilerplate generico
    const kicker = editorialKicker(cluster.deltaSummary || '', 260);
    articles.push({ title: preferredLanguage.title, section, kicker, claims, storyIds: [cluster.storyId], sourceIds: [...new Set(claims.flatMap(claim => claim.sourceIds))], importance: cluster.importance.score, importanceReasons: cluster.importance.reasons, deltaType: cluster.deltaType || 'new', deltaFromYesterday: cluster.deltaSummary || 'Nuova oggi.' });
  }
  if (!articles.length) return null;
  articles.sort((a, b) => b.importance - a.importance);
  
  // La soglia è assoluta: nessun articolo debole viene usato per riempire la pagina.
  const finalArticles = articles.filter(article => article.importance >= EDITORIAL_PUBLISH_THRESHOLD);
  if (!finalArticles.length) return null;
  
  finalArticles.forEach((article, index) => { article.presentation = index === 0 ? 'lead' : index < 3 ? 'major' : 'brief'; });
  const edition = { v: VERSION, language: 'it', dayKey: key, title: 'Il Giornale di Sentiero', deck: finalArticles.length === 1 ? 'Una sola storia supera oggi la soglia di rilevanza e verificabilità.' : 'Le storie che cambiano davvero il quadro, ordinate per conseguenza e solidità dell’evidenza.', generatedAt: new Date().toISOString(), articles: finalArticles, corrections: [], essential: true };
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
  if (!packets.length) return { edition: null, mode: 'no-stories', error: 'edizione' };
  const deterministic = fallbackEdition(items, key, clusters);
  if (!context || !context.canGenerate || !context.canGenerate()) return { edition: deterministic, mode: 'fallback', error: 'ai-unavailable' };
  const system = `Sei la redazione del Giornale di Sentiero: un quotidiano italiano finito che si legge una volta e lascia un modello del mondo più nitido. Tutto il testo visibile deve essere in italiano naturale, inclusi titolo, sommario, sezioni, aperture, claim e correzioni: traduci fedelmente l'evidenza straniera senza tradurre nomi propri o alterare il significato. Il materiale è pubblico, già raggruppato e ordinato con una misura deterministica di importanza; Gemini è editor, mai fonte. Non ricevi e non devi inferire Quest, diario, posizione o altri dati personali. Scegli da una a sei storie, anche una sola: nessun minimo, nessun riempitivo, nessuna quota tematica. Pubblica soltanto ciò che cambia comprensione, conseguenze o possibilità d'azione. Ogni frase fattuale deve essere un claim autonomo con gli id esatti delle fonti che la sostengono. Titolo e apertura non possono promettere più dei claim. Non aggiungere causalità, precedenti, intenzioni, previsioni o contesto enciclopedico assente. Distingui ciò che un'istituzione dichiara da ciò che una redazione indipendente verifica; una ripetizione non è corroborazione. Usa deltaFromYesterday e claimsPublishedBefore: non raccontare di nuovo l'invariato e nomina con precisione cosa è cambiato. Rappresenta divergenze e incertezza senza falsa equivalenza. Scrivi prosa italiana concreta, ritmica, sobria e memorabile: niente gergo da briefing, elenchi travestiti, morale, formule generiche o clickbait. Gerarchizza per portata, durata, irreversibilità e solidità dell'evidenza, non per volume di copertura. corrections è ammesso solo per una storia marcata corrected e richiede storyIds. Il giornale deve avere una fine.`;
  const user = 'GIORNO: ' + key + '\nSTORIE PUBBLICHE E CONTINUITÀ (JSON):\n' + JSON.stringify(packets);
  const first = await context.ai({ system, user, task: 'day-newspaper', schema: EDITION_SCHEMA, maxOutputTokens: 4600, reasoning: 'high', timeout: 65000, priority: 18, signal });
  const allowedStoryIds = new Set(selected.map(cluster => cluster.storyId)), clusterMap = new Map(selected.map(cluster => [cluster.storyId, cluster]));
  let best = first && !first.err ? validateEdition(first.json, items, key, allowedStoryIds, clusterMap) : null;
  if (first && first.err) return { edition: deterministic, mode: 'fallback', error: cleanText(first.err, 32) };
  const critic = `Sei l'Editorial Critic avversariale. Ricomponi l'intera edizione, non commentarla e non difendere la bozza. Cerca attivamente: causalità inventata; titolo più forte dell'evidenza; falsa novità rispetto a ieri; dichiarazione istituzionale riciclata come verifica indipendente; due fonti che ripetono lo stesso comunicato; numeri o soggetti senza provenienza; incertezza cancellata; falsa equivalenza; apertura gerarchicamente sbagliata; articoli messi per raggiungere un numero; prosa burocratica, generica o sensazionalista; contesto già spiegato ripetuto. Elimina senza sostituire ogni articolo debole. I problemi deterministici già rilevati sono: ${JSON.stringify(best ? best.rubric.issues : ['bozza respinta dal gate semantico/provenance'])}. Restituisci solo la nuova edizione completa nello schema, senza introdurre fatti.`;
  const repaired = await context.ai({ system: system + '\n' + critic, user: user + '\nBOZZA SOTTO ESAME:\n' + JSON.stringify(first && first.json || {}), task: 'day-newspaper-critic', schema: EDITION_SCHEMA, maxOutputTokens: 4600, reasoning: 'high', timeout: 65000, priority: 18, signal });
  const checked = repaired && !repaired.err ? validateEdition(repaired.json, items, key, allowedStoryIds, clusterMap) : null;
  if (checked && (!best || checked.rubric.score >= best.rubric.score)) best = checked;
  return { edition: best || deterministic, mode: best ? 'ai' : 'fallback', error: best ? '' : cleanText(repaired && repaired.err || 'quality', 32) };
}

const ITALIAN_REGIONS = Object.freeze([
  ['abruzzo', 'Abruzzo', 42.35, 13.40], ['basilicata', 'Basilicata', 40.64, 15.80], ['calabria', 'Calabria', 38.91, 16.59],
  ['campania', 'Campania', 40.85, 14.27], ['emiliaromagna', 'Emilia-Romagna', 44.49, 11.34], ['fvg', 'Friuli-Venezia Giulia', 45.65, 13.77],
  ['lazio', 'Lazio', 41.90, 12.50], ['liguria', 'Liguria', 44.41, 8.93], ['lombardia', 'Lombardia', 45.46, 9.19],
  ['marche', 'Marche', 43.62, 13.52], ['molise', 'Molise', 41.56, 14.66], ['piemonte', 'Piemonte', 45.07, 7.69],
  ['puglia', 'Puglia', 41.13, 16.87], ['sardegna', 'Sardegna', 39.22, 9.12], ['sicilia', 'Sicilia', 38.12, 13.36],
  ['toscana', 'Toscana', 43.77, 11.26], ['trento', 'Trentino-Alto Adige', 46.07, 11.12], ['umbria', 'Umbria', 43.11, 12.39],
  ['vda', "Valle d'Aosta", 45.74, 7.32], ['veneto', 'Veneto', 45.44, 12.33]
]);
const LOCAL_NEWS_KEY = 'sentiero-giornale-territorio-v1';

function localPreference() {
  try { const value = JSON.parse(localStorage.getItem(LOCAL_NEWS_KEY) || '{}'); return { regionSlug: cleanText(value.regionSlug, 30), region: cleanText(value.region, 50), city: cleanText(value.city, 80) }; } catch (_) { return { regionSlug: '', region: '', city: '' }; }
}

function saveLocalPreference(value) {
  const region = ITALIAN_REGIONS.find(item => item[0] === value.regionSlug);
  const safe = { regionSlug: region ? region[0] : '', region: region ? region[1] : '', city: cleanText(value.city, 80) };
  try { localStorage.setItem(LOCAL_NEWS_KEY, JSON.stringify(safe)); } catch (_) {}
  return safe;
}

function nearestRegion(latitude, longitude) {
  return ITALIAN_REGIONS.map(region => ({ region, distance: Math.pow(Number(latitude) - region[2], 2) + Math.pow((Number(longitude) - region[3]) * Math.cos(Number(latitude) * Math.PI / 180), 2) })).sort((a, b) => a.distance - b.distance)[0]?.region || null;
}

function newsFigure(item, compact = false) {
  const media = item && item.media; if (!media || !media.url) return null;
  const figure = element('figure', 'article-media' + (compact ? ' compact' : ''));
  const link = element('a'); link.href = media.sourceUrl || item.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  const image = element('img'); image.src = media.url; image.alt = media.alt || item.title || ''; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; link.append(image); figure.append(link);
  const caption = element('figcaption', '', [media.caption, media.credit && 'Foto: ' + media.credit, media.rights].filter(Boolean).join(' · ')); figure.append(caption);
  return figure;
}

function articleMedia(article, sources) {
  for (const id of article && article.sourceIds || []) { const item = sources.get(String(id)); if (item && item.media) return item; }
  return null;
}

function localNews(items, preference) {
  if (!preference.regionSlug) return [];
  const cityTokens = storyTokens(preference.city), eventPattern = /\b(?:evento|festival|concerto|mostra|incontro|spettacolo|fiera|apre|inaugura|sabato|domenica|stasera|domani)\b/i;
  return (items || []).filter(item => item.sourceMeta && item.sourceMeta.regionSlug === preference.regionSlug).map(item => {
    const text = [item.title, item.summary, ...(item.places || [])].join(' '), tokens = storyTokens(text), cityHits = intersectionSize(cityTokens, tokens);
    return { ...item, localKind: eventPattern.test(text) ? 'Evento' : 'Notizia locale', localScore: cityHits * 12 + (Date.parse(item.published) || 0) / 1e12 };
  }).sort((a, b) => b.localScore - a.localScore).slice(0, 4);
}

function renderLocalNews(items) {
  const preference = localPreference(), section = element('section', 'news-local'); section.setAttribute('aria-label', 'Notizie del territorio');
  const hasRegion = !!preference.regionSlug;

  if (!hasRegion) {
    // Stato iniziale: nessuna regione scelta
    const card = element('div', 'local-card');
    const head = element('div', 'local-head');
    head.append(element('p', 'giorno-label', 'Vicino a te'));
    head.append(element('h3', '', 'Scegli il tuo territorio'));
    card.append(head);

    const actions = element('div', 'local-actions');

    const selectWrapper = element('div', 'local-select-wrap');
    const selectLabel = element('label', '', 'Regione');
    const select = element('select'); select.setAttribute('aria-label', 'Regione per le notizie locali');
    select.append(element('option', '', 'Scegli una regione'));
    select.firstChild.value = '';
    for (const region of ITALIAN_REGIONS) { const option = element('option', '', region[1]); option.value = region[0]; select.append(option); }
    selectWrapper.append(selectLabel); selectWrapper.append(select);
    actions.append(selectWrapper);

    const cityWrapper = element('div', 'local-input-wrap');
    const cityLabel = element('label', '', 'Comune (facoltativo)');
    const city = element('input'); city.type = 'text'; city.inputMode = 'text'; city.autocomplete = 'address-level2'; city.maxLength = 80; city.placeholder = 'es. Torino'; city.setAttribute('aria-label', 'Comune per ordinare le notizie locali');
    cityWrapper.append(cityLabel); cityWrapper.append(city);
    actions.append(cityWrapper);

    const primaryBtn = button('local-btn primary', 'Mostra notizie locali', () => { const region = ITALIAN_REGIONS.find(item => item[0] === select.value); if (!select.value) return; saveLocalPreference({ regionSlug: select.value, region: region && region[1], city: city.value }); renderEdition(latestEdition, latestSources); });
    actions.append(primaryBtn);

    const geoBtn = button('local-btn geo', 'Usa la mia posizione', () => {
      geoBtn.disabled = true; geoBtn.textContent = 'Individuo la regione…';
      const done = () => { geoBtn.disabled = false; geoBtn.textContent = 'Usa la mia posizione'; };
      if (!navigator.geolocation) { done(); return; }
      navigator.geolocation.getCurrentPosition(position => { const region = nearestRegion(position.coords.latitude, position.coords.longitude); if (region) { saveLocalPreference({ regionSlug: region[0], region: region[1], city: '' }); renderEdition(latestEdition, latestSources); } done(); }, done, { enableHighAccuracy: false, timeout: 7000, maximumAge: 86400000 });
    }); geoBtn.setAttribute('aria-label', 'Condividi la posizione una volta per scegliere la regione; le coordinate non vengono conservate');
    actions.append(geoBtn);

    card.append(actions);

    const privacy = element('p', 'local-privacy', 'La posizione serve solo a scegliere la zona. Le coordinate non vengono salvate.');
    card.append(privacy);
    section.append(card);
    return section;
  }

  // Stato con regione scelta: PRIMA le notizie, POI i controlli secondari compatti
  const stories = localNews(items, preference);
  const card = element('div', 'local-card');
  const head = element('div', 'local-head');
  head.append(element('p', 'giorno-label', 'Vicino a te'));
  head.append(element('h3', '', preference.region + (preference.city ? ' · ' + preference.city : '')));
  card.append(head);

  // Notizie locali SUBITO visibili
  if (!stories.length) {
    const empty = element('p', 'local-empty', 'Nessuna notizia locale recente e verificata per questo territorio.');
    section.append(card);
    section.append(empty);
  } else {
    const grid = element('div', 'news-local-grid');
    for (const item of stories) {
      const cardItem = element('article', 'news-local-card');
      cardItem.append(element('span', 'section', item.localKind));
      const media = newsFigure(item, true); if (media) cardItem.append(media);
      const title = element('h4'); const link = element('a', '', item.title); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; title.append(link); cardItem.append(title);
      if (item.summary) cardItem.append(element('p', '', item.summary));
      cardItem.append(element('small', '', item.source + ' · ' + new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.published))));
      grid.append(cardItem);
    }
    section.append(card);
    section.append(grid);
  }

  // Controlli secondari: compatti, sotto le notizie
  const controls = element('div', 'local-controls');
  controls.style.marginTop = '16px';
  controls.style.paddingTop = '12px';
  controls.style.borderTop = '1px solid rgba(22,43,37,.16)';
  controls.style.display = 'none'; // nascosti di default, espandibili

  const toggleBtn = button('local-btn secondary', 'Modifica territorio', () => {
    const isHidden = controls.style.display === 'none';
    controls.style.display = isHidden ? 'block' : 'none';
    toggleBtn.textContent = isHidden ? 'Nascondi controlli' : 'Modifica territorio';
  });
  toggleBtn.style.marginBottom = '8px';
  toggleBtn.style.fontSize = '14px';
  toggleBtn.style.padding = '8px 12px';
  card.append(toggleBtn);

  const changeWrapper = element('div', 'local-select-wrap');
  const changeLabel = element('label', '', 'Cambia regione');
  const changeSelect = element('select'); changeSelect.setAttribute('aria-label', 'Cambia regione per le notizie locali');
  changeSelect.append(element('option', '', 'Scegli una regione'));
  changeSelect.firstChild.value = '';
  for (const region of ITALIAN_REGIONS) { const option = element('option', '', region[1]); option.value = region[0]; option.selected = preference.regionSlug === region[0]; changeSelect.append(option); }
  changeWrapper.append(changeLabel); changeWrapper.append(changeSelect);
  controls.append(changeWrapper);

  const cityWrapper = element('div', 'local-input-wrap');
  const cityLabel = element('label', '', 'Comune (facoltativo)');
  const city = element('input'); city.type = 'text'; city.inputMode = 'text'; city.autocomplete = 'address-level2'; city.maxLength = 80; city.value = preference.city; city.placeholder = 'es. Torino'; city.setAttribute('aria-label', 'Comune per ordinare le notizie locali');
  cityWrapper.append(cityLabel); cityWrapper.append(city);
  controls.append(cityWrapper);

  const saveBtn = button('local-btn primary', 'Aggiorna', () => { const region = ITALIAN_REGIONS.find(item => item[0] === changeSelect.value); if (!changeSelect.value) return; saveLocalPreference({ regionSlug: changeSelect.value, region: region && region[1], city: city.value }); renderEdition(latestEdition, latestSources); });
  controls.append(saveBtn);

  const geoBtn = button('local-btn geo', 'Usa la mia posizione', () => {
    geoBtn.disabled = true; geoBtn.textContent = 'Individuo la regione…';
    const done = () => { geoBtn.disabled = false; geoBtn.textContent = 'Usa la mia posizione'; };
    if (!navigator.geolocation) { done(); return; }
    navigator.geolocation.getCurrentPosition(position => { const region = nearestRegion(position.coords.latitude, position.coords.longitude); if (region) { saveLocalPreference({ regionSlug: region[0], region: region[1], city: '' }); renderEdition(latestEdition, latestSources); } done(); }, done, { enableHighAccuracy: false, timeout: 7000, maximumAge: 86400000 });
  }); geoBtn.setAttribute('aria-label', 'Condividi la posizione una volta per scegliere la regione; le coordinate non vengono conservate');
  controls.append(geoBtn);

  const clearBtn = button('local-btn clear', 'Rimuovi territorio', () => { saveLocalPreference({ regionSlug: '', region: '', city: '' }); renderEdition(latestEdition, latestSources); });
  controls.append(clearBtn);

  const privacy = element('p', 'local-privacy', 'La posizione serve solo a scegliere la zona. Le coordinate non vengono salvate.');
  controls.append(privacy);

  card.append(controls);
  return section;
}

function renderEdition(edition, items, cachedLabel = '') {
  const mount = room && room.querySelector('.news-mount'); if (!mount) return;
  if (!edition) { renderNewsState('Oggi le fonti disponibili non bastano per comporre un’edizione affidabile. Nessun riempitivo prende il loro posto.', true); return; }
  edition = truthfulEdition(edition);
  latestEdition = edition; latestSources = items || edition.sources || []; const displayEdition = personalizeEditionForDevice(edition, latestSources, currentState().quests); const sources = sourceMap(latestSources), wrap = element('div', 'edition');
  const head = element('header', 'edition-head'); head.append(element('h3', '', displayEdition.title)); if (displayEdition.deck) head.append(element('p', '', displayEdition.deck));
  const currentDay = sentieroDayKey(), sourceIso = sourceTime(edition), stale = sourceDay(edition) !== currentDay;
  const generatedIso = validIso(edition.generatedAt) || sourceIso, when = generatedIso ? new Date(generatedIso) : new Date();
  const generatedDay = sentieroDayKey(when), editionLabel = generatedDay === currentDay ? 'edizione delle ' + new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(when) : 'edizione del ' + new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(when);
  const truthLabel = cachedLabel || (stale ? 'ultima edizione salvata' : ''), meta = [(truthLabel ? truthLabel + ' · ' : '') + editionLabel];
  const sourceWhen = Date.parse(sourceIso || ''); if (Number.isFinite(sourceWhen)) meta.push('fonti aggiornate ' + new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(sourceWhen)));
  head.append(element('p', 'edition-meta', meta.join(' · ')));
  newsDiagnostic({ editionDay: cleanText(edition.dayKey, 10) || generatedDay, editionGeneratedAt: generatedIso, sourcesUpdatedAt: sourceIso, cacheSavedAt: validIso(edition.cacheSavedAt), origin: cleanText(edition.sourceOrigin || edition.sourceChannel || (cachedLabel ? 'device-cache' : ''), 32), sourceAgeMinutes: sourceWhen ? Math.max(0, Math.round((Date.now() - sourceWhen) / 60000)) : -1, stale });
  const tools = element('div', 'edition-tools'); const refreshButton = button('news-refresh', 'Verifica aggiornamenti', () => refreshNews(true)); refreshButton.setAttribute('aria-label', 'Verifica se il quadro del giorno è cambiato'); tools.append(refreshButton); head.append(tools); wrap.append(head);
  if (displayEdition.corrections && displayEdition.corrections.length) {
    const corrections = element('aside', 'edition-corrections'); corrections.append(element('strong', '', 'Correzioni e precisazioni'));
    for (const correction of displayEdition.corrections) { const paragraph = element('p', '', correction.text + ' '); for (const id of correction.sourceIds || []) { const source = sources.get(String(id)); if (!source) continue; const link = element('a', '', 'Fonte'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; paragraph.append(link); } corrections.append(paragraph); } wrap.append(corrections);
  }
  wrap.append(renderLocalNews(latestSources));
  const front = element('section', 'edition-front'); front.setAttribute('aria-label', 'Prima pagina');
  displayEdition.articles.forEach((article, index) => {
    const presentation = article.presentation || (index === 0 ? 'lead' : index < 3 ? 'major' : 'brief'), node = element('article', 'news-article ' + presentation); node.dataset.importance = String(article.importance || 0); node.append(element('span', 'section', article.section));
    const deltaLabels = { new: 'Nuova oggi', developed: 'Cosa cambia da ieri', corrected: 'Correzione', returned: 'Ritorna con fatti nuovi' }; node.append(element('span', 'article-delta', deltaLabels[article.deltaType] || 'Sviluppo'));
    const mediaItem = articleMedia(article, sources), media = newsFigure(mediaItem); if (media) node.append(media);
    node.append(element('h3', '', article.title)); if (article.kicker) node.append(element('p', 'kicker', article.kicker));
    const body = element('div', 'body'); for (const claim of article.claims || []) { const paragraph = element('p'); paragraph.append(document.createTextNode(claim.text + ' ')); const citations = element('span', 'claim-sources'); citations.setAttribute('aria-label', 'Provenienza del paragrafo'); let sourceNumber = 0; for (const id of claim.sourceIds || []) { const source = sources.get(String(id)); if (!source) continue; const meta = source.sourceMeta || {}, link = element('a', '', '[' + (++sourceNumber) + ']'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = source.source + ' · ' + (meta.perspective === 'primary' ? 'fonte primaria' : 'redazione indipendente') + (meta.domain ? ' · ' + meta.domain : ''); citations.append(link); } paragraph.append(citations); body.append(paragraph); } node.append(body);
    const links = element('div', 'news-sources'); for (const id of article.sourceIds) { const source = sources.get(String(id)); if (!source) continue; const meta = source.sourceMeta || {}, role = meta.perspective === 'primary' ? 'Primaria' : 'Indipendente', link = element('a', '', source.source + ' · ' + role + ' · ' + new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(new Date(source.published))); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; const p = source.provenance || {}; link.title = 'Provenienza: ' + (p.evidenceId || source.id) + (p.retrievedAt ? ' · raccolta ' + p.retrievedAt : ''); links.append(link); } node.append(links); front.append(node);
  });
  wrap.append(front);
  wrap.append(element('p', 'edition-end', stale ? 'Fine dell’ultima edizione disponibile.' : 'Fine dell’edizione di oggi.')); mount.replaceChildren(wrap);
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
    if (importance < EDITORIAL_PUBLISH_THRESHOLD) continue;
    articles.push({
      title, section, kicker: editorialKicker(sourceArticle.kicker, 300), claims,
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
  return { v: VERSION, language: 'it', dayKey: cleanText(raw.dayKey || packetDayKey, 10), title: cleanText(raw.title, 90) || 'Il Giornale di Sentiero', deck: cleanText(raw.deck, 300), generatedAt, sourceUpdatedAt, sourceOrigin: 'packaged', articles, corrections, essential: Boolean(raw.essential) };
}

async function readNewsPacket(urlOrPaths, signal, channel) {
  let data;
  if (Array.isArray(urlOrPaths)) data = await readDistributedJson(urlOrPaths, signal, 900000, value => value && Array.isArray(value.items));
  else data = await parseDistributedResponse(await fetch(urlOrPaths, { signal, cache: 'no-store' }), 900000);
  if (!data || !Array.isArray(data.items)) throw new Error('fonti');
  const items = data.items.filter(item => item && item.id && item.title && item.url && item.source && /^https:\/\//.test(item.url)).slice(0, 96).map(item => ({
    id: cleanText(item.id, 80), title: sanitizeEditorial(item.title, 240), summary: sanitizeEditorial(item.summary, 1200), url: item.url, published: item.published, source: cleanText(item.source, 80), sourceId: cleanText(item.sourceId, 40),
    sourceMeta: item.sourceMeta && typeof item.sourceMeta === 'object' ? { tier: cleanText(item.sourceMeta.tier, 2), type: cleanText(item.sourceMeta.type, 30), area: cleanText(item.sourceMeta.area, 30), role: cleanText(item.sourceMeta.role, 80), reliability: cleanText(item.sourceMeta.reliability, 80), domain: cleanText(item.sourceMeta.domain, 80), language: cleanText(item.sourceMeta.language, 8), perspective: cleanText(item.sourceMeta.perspective, 20), ownership: cleanText(item.sourceMeta.ownership, 30), country: cleanText(item.sourceMeta.country, 8), coverage: cleanText(item.sourceMeta.coverage, 20), retrieval: cleanText(item.sourceMeta.retrieval, 20), freshnessMinutes: Math.max(0, Math.min(1440, Number(item.sourceMeta.freshnessMinutes) || 0)), terms: cleanText(item.sourceMeta.terms, 80), regionSlug: cleanText(item.sourceMeta.regionSlug, 30) } : null,
    provenance: item.provenance && typeof item.provenance === 'object' ? { evidenceId: cleanText(item.provenance.evidenceId, 100), sourceId: cleanText(item.provenance.sourceId, 40), sourceDomain: cleanText(item.provenance.sourceDomain, 100), canonicalUrl: /^https:\/\//.test(item.provenance.canonicalUrl || '') ? item.provenance.canonicalUrl : item.url, publishedAt: cleanText(item.provenance.publishedAt, 40), retrievedAt: cleanText(item.provenance.retrievedAt, 40), contentFingerprint: cleanText(item.provenance.contentFingerprint, 100) } : { evidenceId: cleanText(item.id, 80), sourceId: cleanText(item.sourceId, 40), canonicalUrl: item.url, publishedAt: cleanText(item.published, 40) }
  }));
  if (!items.length) throw new Error('fonti');
  const generatedAt = validIso(data.generatedAt), dayKey = cleanText(data.dayKey, 10);
  const retrievedAt = items.map(item => Date.parse(item.provenance && item.provenance.retrievedAt || '') || 0).sort((a, b) => b - a)[0] || 0;
  const sourcesUpdatedAt = validIso(data.sourcesUpdatedAt || data.sourceUpdatedAt) || generatedAt || (retrievedAt ? new Date(retrievedAt).toISOString() : '');
  return { items, generatedAt, sourcesUpdatedAt, dayKey, channel, transport: cleanText(data.__sentieroTransport || 'network', 24), edition: channel === 'snapshot' ? sanitizeBundledEdition(data.edition, items, sourcesUpdatedAt, dayKey) : null };
}

async function fetchSources(endpoint, key, signal) {
  const hour = new Date().getHours(), slot = key + '-' + (hour < 12 ? 'mattino' : 'giorno');
  if (endpoint) {
    const remote = new AbortController(); let timed = false; const abort = () => remote.abort(), timer = setTimeout(() => { timed = true; abort(); }, 7000);
    if (signal) { if (signal.aborted) remote.abort(); else signal.addEventListener('abort', abort, { once: true }); }
    try { const packet = await readNewsPacket(endpoint + '/v1/day/news?slot=' + encodeURIComponent(slot), remote.signal, 'worker'); packet.workerStatus = 'ok'; return packet; }
    catch (error) { var workerError = timed ? 'timeout' : error && error.name === 'AbortError' ? 'aborted' : 'failed'; }
    finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', abort); }
  }
  const packet = await readNewsPacket(NEWS_ASSET_PATHS, signal, 'snapshot');
  packet.workerStatus = endpoint ? workerError || 'failed' : 'not-configured';
  if (packet.edition && !editionIsItalian(packet.edition)) {
    packet.edition = null;
  }
  return packet;
}

export function refreshNews(force = false) {
  if (!room || newsBuild) return newsBuild;
  const run = (async () => {
  const key = sentieroDayKey(), cached = await cacheGet(key), latest = cached || await cacheLatest(), age = cached ? Date.now() - Number(cached.at || 0) : Infinity;
  const cachedEdition = cached && editionIsItalian(cached.edition) ? truthfulEdition(cached.edition) : null, cachedFresh = freshForDay(cachedEdition, key);
  if (force && cachedFresh && Date.now() - lastManualRefresh < 10 * 60000) { const at = new Date().toISOString(); renderEdition({ ...cachedEdition, sourceOrigin: 'device-cache' }, cached.sources, 'quadro già verificato'); newsDiagnostic({ refreshStartedAt: at, refreshEndedAt: at, refreshReason: 'manual-throttled', sourceFetch: 'cache-hit', compose: 'cached', abortReason: '' }); return cachedEdition; }
  if (force) lastManualRefresh = Date.now();
  if (cachedEdition && !force) { renderEdition({ ...cachedEdition, sourceOrigin: 'device-cache' }, cached.sources, cachedFresh ? 'salvata sul dispositivo' : 'ultima edizione salvata'); if (cachedFresh && age < 4 * 3600000) { const at = new Date().toISOString(); newsDiagnostic({ refreshStartedAt: at, refreshEndedAt: at, refreshReason: 'startup-cache', sourceFetch: 'cache-hit', compose: 'cached', abortReason: '' }); return cachedEdition; } }
  if (!cachedEdition) { if (latest && editionIsItalian(latest.edition)) renderEdition({ ...truthfulEdition(latest.edition), sourceOrigin: 'device-cache' }, latest.sources, 'ultima edizione disponibile'); else renderNewsState('La Terra sta raccogliendo le fonti di oggi.', false); }
  const endpoint = newsEndpoint();
  const refreshStartedAt = new Date().toISOString(); newsRequestedDay = key;
  newsDiagnostic({ refreshStartedAt, refreshEndedAt: '', refreshReason: force ? 'manual' : 'startup', sourceFetch: 'started', compose: 'pending', abortReason: '', endpointConfigured: Boolean(endpoint) });
    try {
      const packet = await fetchSources(endpoint, key, null), items = packet.items, sourcesUpdatedAt = sourceTime(packet);
      const packetDay = cleanText(packet.dayKey, 10) || sourceDay(packet) || key, packetFresh = packetDay === key && sourceDay(packet) === key;
      newsDiagnostic({ sourceFetch: 'ok', sourceChannel: packet.channel, sourceTransport: packet.transport, workerStatus: packet.workerStatus, sourcesUpdatedAt, sourceAgeMinutes: sourcesUpdatedAt ? Math.max(0, Math.round((Date.now() - Date.parse(sourcesUpdatedAt)) / 60000)) : -1 });
      if (packet.edition) {
        const savedAt = new Date().toISOString(), edition = truthfulEdition({ ...packet.edition, dayKey: packet.edition.dayKey || packetDay, sourceUpdatedAt: packet.edition.sourceUpdatedAt || sourcesUpdatedAt, sourceChannel: packet.channel, sourceOrigin: packet.transport === 'cache-storage' ? 'packaged-cache' : 'packaged-live', cacheSavedAt: savedAt, materialChanges: [] });
        const previous = latest && editionIsItalian(latest.edition) ? truthfulEdition(latest.edition) : null;
        if (previous && freshnessMilliseconds(previous) > freshnessMilliseconds(edition)) { renderEdition({ ...previous, sourceOrigin: 'device-cache' }, latest.sources, freshForDay(previous, key) ? 'salvata sul dispositivo' : 'ultima edizione salvata'); newsDiagnostic({ compose: 'packaged-older-than-cache', refreshEndedAt: new Date().toISOString() }); return previous; }
        await cachePut({ key: edition.dayKey || packetDay, at: Date.now(), checkedAt: Date.now(), cacheSavedAt: savedAt, edition, sources: items });
        renderEdition(edition, items, packetFresh ? '' : 'ultima edizione disponibile');
        newsDiagnostic({ compose: 'packaged', refreshEndedAt: new Date().toISOString() });
        return edition;
      }
      const clusters = await continuityClusters(items, key), changed = selectEditorialStories(clusters, 12);
      if (cachedEdition && !changed.length && freshnessMilliseconds(packet) >= freshnessMilliseconds(cachedEdition)) {
        const savedAt = new Date().toISOString(), edition = truthfulEdition({ ...cachedEdition, sourceUpdatedAt: sourcesUpdatedAt || cachedEdition.sourceUpdatedAt, sourceChannel: packet.channel, sourceOrigin: 'cache-verified', cacheSavedAt: savedAt });
        await cachePut({ key: packetFresh ? key : edition.dayKey || packetDay, at: Date.now(), checkedAt: Date.now(), cacheSavedAt: savedAt, edition, sources: items });
        renderEdition(edition, items, packetFresh ? 'quadro verificato, nessun cambiamento rilevante' : 'ultima edizione salvata');
        newsDiagnostic({ compose: 'unchanged', refreshEndedAt: new Date().toISOString() });
        return edition;
      }
      const compositionKey = packetFresh ? key : packetDay, deterministic = fallbackEdition(items, compositionKey, clusters); if (!deterministic) throw new Error('edizione');
      const savedAt = new Date().toISOString(), deterministicEdition = truthfulEdition({ ...deterministic, dayKey: compositionKey, generatedAt: packetFresh ? deterministic.generatedAt : sourcesUpdatedAt, sourceUpdatedAt: sourcesUpdatedAt, sourceChannel: packet.channel, sourceOrigin: 'fallback', cacheSavedAt: savedAt, materialChanges: changed.map(cluster => cluster.storyId) });
      await cachePut({ key: deterministicEdition.dayKey || compositionKey, at: Date.now(), checkedAt: Date.now(), cacheSavedAt: savedAt, edition: deterministicEdition, sources: items });
      await persistStories(clusters, deterministicEdition, compositionKey); renderEdition(deterministicEdition, items, packetFresh ? '' : 'ultima edizione disponibile');
      newsDiagnostic({ compose: 'fallback-ready', refreshEndedAt: new Date().toISOString() });
      if (!context || !context.canGenerate || !context.canGenerate()) return deterministicEdition;
      newsAbortReason = ''; newsAbort = new AbortController();
      const outcome = await composeEdition(items, clusters, compositionKey, newsAbort.signal);
      if (!outcome || !outcome.edition || outcome.mode !== 'ai') { newsDiagnostic({ compose: 'fallback:' + cleanText(outcome && outcome.error || 'quality', 32), abortReason: newsAbortReason, refreshEndedAt: new Date().toISOString() }); return deterministicEdition; }
      const finalSavedAt = new Date().toISOString(), edition = truthfulEdition({ ...outcome.edition, dayKey: compositionKey, generatedAt: packetFresh ? outcome.edition.generatedAt || finalSavedAt : sourcesUpdatedAt, sourceUpdatedAt: sourcesUpdatedAt, sourceChannel: packet.channel, sourceOrigin: 'live-ai', cacheSavedAt: finalSavedAt, materialChanges: changed.map(cluster => cluster.storyId) });
      await cachePut({ key: edition.dayKey || compositionKey, at: Date.now(), checkedAt: Date.now(), cacheSavedAt: finalSavedAt, edition, sources: items }); await persistStories(clusters, edition, compositionKey); renderEdition(edition, items, packetFresh ? '' : 'ultima edizione disponibile');
      newsDiagnostic({ compose: 'ai', refreshEndedAt: new Date().toISOString() }); return edition;
    } catch (error) {
      const fallbackRecord = cachedEdition ? { edition: { ...cachedEdition, sourceOrigin: 'device-cache' }, sources: cached.sources } : latest && editionIsItalian(latest.edition) ? { edition: { ...truthfulEdition(latest.edition), sourceOrigin: 'device-cache' }, sources: latest.sources } : null;
      newsDiagnostic({ sourceFetch: 'failed', compose: 'failed', abortReason: newsAbortReason || (error && error.name === 'AbortError' ? 'aborted' : ''), error: cleanText(error && error.message || 'rete', 40), refreshEndedAt: new Date().toISOString() });
      if (fallbackRecord) { renderEdition(fallbackRecord.edition, fallbackRecord.sources, 'ultima edizione salvata'); return fallbackRecord.edition; }
      if (!latestEdition) renderNewsState('Oggi nessuna storia supera insieme le soglie di rilevanza e verificabilità. Nessun riempitivo prende il suo posto.', true); return null;
    }
    finally { newsAbort = null; }
  })();
  newsBuild = run;
  run.finally(() => { if (newsBuild === run) newsBuild = null; }).catch(() => {});
  return run;
}

export async function open(nextContext) {
  context = nextContext || context; installRoom();
  const today = sentieroDayKey(); weekStart = mondayKey(today); selectedDay = today;
  document.body.classList.add('giorno-aperto'); room.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => room.classList.add('aperta')));
  renderWeek(); renderWord(); refreshNews(false);
  if (!listenerBound) {
    listenerBound = true;
    const resumeNews = () => { if (room && !room.hidden && (newsRequestedDay !== sentieroDayKey() || !freshForDay(latestEdition, sentieroDayKey()))) refreshNews(false); };
    window.addEventListener('sentiero:state', () => { if (room && !room.hidden) { renderWeek(); renderWord(); } });
    window.addEventListener('pageshow', resumeNews); window.addEventListener('online', resumeNews);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeNews(); });
  }
  const closeButton = room.querySelector('.giorno-head button'); if (closeButton) closeButton.focus({ preventScroll: true });
}

export function close() {
  if (!room || room.hidden) return;
  if (newsAbort) { newsAbortReason = 'room-closed'; newsDiagnostic({ abortReason: newsAbortReason }); try { newsAbort.abort(); } catch (_) {} newsAbort = null; }
  room.classList.remove('aperta'); document.body.classList.remove('giorno-aperto');
  setTimeout(() => { if (room && !room.classList.contains('aperta')) room.hidden = true; }, 230);
}

export function refresh() {
  if (room && !room.hidden) { renderWeek(); renderWord(); if (newsRequestedDay !== sentieroDayKey()) refreshNews(false); }
}
