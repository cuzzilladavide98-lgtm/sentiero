const DAWN_MINUTES = 4 * 60 + 20;
const NIGHT_MINUTES = 19 * 60;
const DAY_MS = 86400000;
const VERSION = 2;

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

const STOP = new Set('a ad al alla allo ai agli alle anche che chi con da dal dalla dallo dei degli delle di e ed è era gli ha hanno i il in la le lo ma nel nella nello nei nelle non o per più poi se si su sul sulla tra un una uno the a an and as at by for from has have in into is it of on or that the to was were will with'.split(/\s+/));
function storyTokens(value) {
  return new Set(String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(token => token.length > 3 && !STOP.has(token)));
}
function similarity(a, b) {
  let common = 0; for (const token of a) if (b.has(token)) common++;
  return common / Math.max(1, Math.min(a.size, b.size));
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
  return 'st-' + hashText([...unionTokens(items)].sort().slice(0, 10).join('|'));
}

export function clusterNews(items) {
  const clusters = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !item.id || !item.title || !item.url || !item.source) continue;
    const tokens = storyTokens(item.title + ' ' + String(item.summary || '').slice(0, 160));
    let cluster = clusters.find(candidate => similarity(tokens, candidate.tokens) >= 0.58 && [...tokens].filter(token => candidate.tokens.has(token)).length >= 2);
    if (!cluster) { cluster = { id: 'c' + (clusters.length + 1), tokens, items: [] }; clusters.push(cluster); }
    cluster.items.push(item);
    for (const token of tokens) cluster.tokens.add(token);
  }
  return clusters.map(({ tokens, ...cluster }) => ({ ...cluster, storyId: storyKey(cluster.items), signature: [...tokens].sort().slice(0, 42) }));
}

function cleanText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function evidenceTokens(value) { return storyTokens(String(value || '').replace(/\b(?:oggi|ieri|domani|secondo|fonte|fonti)\b/gi, ' ')); }

export function claimEvidenceScore(text, ids, sources) {
  const sourceMap = new Map((sources || []).map(source => [String(source.id), source]));
  const claimTokens = evidenceTokens(text), evidence = new Set();
  for (const id of ids || []) { const source = sourceMap.get(String(id)); if (source) for (const token of evidenceTokens(source.title + ' ' + source.summary)) evidence.add(token); }
  if (!claimTokens.size || !evidence.size) return 0;
  let common = 0; for (const token of claimTokens) if (evidence.has(token)) common++;
  const numbers = String(text || '').match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  if (numbers.some(number => ![...sourceMap.values()].some(source => (ids || []).map(String).includes(String(source.id)) && (source.title + ' ' + source.summary).includes(number)))) return 0;
  return common / Math.max(2, Math.min(claimTokens.size, 8));
}

export function editionRubric(edition, sources) {
  if (!edition || !Array.isArray(edition.articles)) return { score: 0, pass: false, issues: ['struttura'] };
  const issues = [], allIds = new Set(), sections = new Set(), claims = [];
  for (const article of edition.articles) {
    sections.add(String(article.section || '').toLowerCase());
    for (const claim of article.claims || []) { claims.push(claim); for (const id of claim.sourceIds || []) allIds.add(String(id)); }
  }
  const unsupported = claims.filter(claim => claimEvidenceScore(claim.text, claim.sourceIds, sources) < 0.38).length;
  const clickbait = edition.articles.filter(article => /!|shock|incredibil|sconvolg|non crederai|clamoros/i.test(article.title || '')).length;
  const primary = [...allIds].some(id => { const source = (sources || []).find(item => String(item.id) === id); return source && source.sourceMeta && source.sourceMeta.tier === 'A'; });
  if (edition.articles.length < 3 || edition.articles.length > 7) issues.push('dimensione-edizione');
  if (unsupported) issues.push('claim-non-supportati:' + unsupported);
  if (allIds.size < Math.min(3, edition.articles.length)) issues.push('poche-fonti');
  if (!primary) issues.push('nessuna-fonte-primaria');
  if (clickbait) issues.push('clickbait');
  if (sections.size < 2 && edition.articles.length > 3) issues.push('gerarchia-debole');
  const score = Math.max(0, 100 - unsupported * 24 - clickbait * 15 - (allIds.size < 3 ? 12 : 0) - (!primary ? 8 : 0) - (issues.includes('dimensione-edizione') ? 25 : 0) - (issues.includes('gerarchia-debole') ? 5 : 0));
  return { score, pass: score >= 78 && unsupported === 0 && edition.articles.length >= 3, issues };
}

export function validateEdition(raw, sources, key, allowedStoryIds) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.articles)) return null;
  const map = new Map((Array.isArray(sources) ? sources : []).map(source => [String(source.id), source]));
  const articles = [];
  for (const sourceArticle of raw.articles.slice(0, 8)) {
    if (!sourceArticle || !Array.isArray(sourceArticle.claims)) continue;
    const title = cleanText(sourceArticle.title, 180), section = cleanText(sourceArticle.section, 50);
    const claims = [];
    for (const rawClaim of sourceArticle.claims.slice(0, 6)) {
      if (!rawClaim || !Array.isArray(rawClaim.sourceIds)) continue;
      const requested = [...new Set(rawClaim.sourceIds.map(String))], ids = requested.filter(id => map.has(id)).slice(0, 4), text = cleanText(rawClaim.text, 900);
      if (!text || text.length < 24 || ids.length !== requested.length || !ids.length || claimEvidenceScore(text, ids, sources) < 0.38) continue;
      claims.push({ text, sourceIds: ids });
    }
    if (!title || !section || claims.length < 2) continue;
    const storyIds = [...new Set((sourceArticle.storyIds || []).map(String).filter(id => /^st-[a-z0-9]+$/i.test(id) && (!allowedStoryIds || allowedStoryIds.has(id))))].slice(0, 3);
    if (allowedStoryIds && !storyIds.length) continue;
    articles.push({ title, section, kicker: cleanText(sourceArticle.kicker, 220), claims, storyIds, sourceIds: [...new Set(claims.flatMap(claim => claim.sourceIds))] });
  }
  if (articles.length < 3) return null;
  const corrections = [];
  for (const rawCorrection of Array.isArray(raw.corrections) ? raw.corrections.slice(0, 3) : []) {
    const ids = [...new Set((rawCorrection.sourceIds || []).map(String))].filter(id => map.has(id)), correctionText = cleanText(rawCorrection.text, 500);
    if (correctionText.length >= 24 && ids.length && claimEvidenceScore(correctionText, ids, sources) >= 0.38) corrections.push({ text: correctionText, sourceIds: ids });
  }
  const edition = { v: VERSION, dayKey: key, title: cleanText(raw.title, 90) || 'Il Giornale di Sentiero', deck: cleanText(raw.deck, 260), generatedAt: new Date().toISOString(), articles, corrections };
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
.news-state{padding:24px 0;border-block:1px solid var(--line);color:var(--muted);font:400 15px/1.6 system-ui,sans-serif}.news-state b{color:var(--ink)}.news-refresh{min-height:44px;margin-top:13px;padding:0 16px;border:1px solid var(--line);border-radius:999px;background:none;color:var(--ink);font:600 13px/1 system-ui,sans-serif}.edition-head{padding:5px 0 28px;border-bottom:2px solid var(--ink)}.edition-head h3{margin:0;font:500 clamp(35px,10vw,57px)/.98 Georgia,serif;letter-spacing:-.045em}.edition-head p{margin:15px 0 0;color:var(--muted);font:400 17px/1.55 Georgia,serif}.edition-meta{margin-top:15px!important;font:600 10px/1.3 system-ui,sans-serif!important;letter-spacing:.12em;text-transform:uppercase}.edition-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.edition-tools .news-refresh{margin-top:10px}.edition-corrections{margin:24px 0 0;padding:15px 17px;border:1px solid var(--line);font:400 14px/1.55 system-ui,sans-serif}.edition-corrections strong{display:block;margin-bottom:6px}.claim-sources{font:600 10px/1 system-ui,sans-serif;white-space:nowrap}.claim-sources a{color:#355d52;text-decoration:none;margin-left:5px}
.news-article{padding:30px 0;border-bottom:1px solid var(--line)}.news-article .section{color:var(--sun);font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.15em;text-transform:uppercase}.news-article h3{margin:8px 0 9px;font:500 clamp(27px,8vw,42px)/1.05 Georgia,serif;letter-spacing:-.027em}.news-article.lead h3{font-size:clamp(34px,10vw,52px)}.news-article .kicker{margin:0 0 16px;color:#475951;font:italic 17px/1.5 Georgia,serif}.news-article .body p{margin:0 0 14px;font:400 18px/1.66 Georgia,serif}.news-sources{display:flex;flex-wrap:wrap;gap:7px;margin-top:19px}.news-sources a{max-width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:#355d52;font:600 11px/1.25 system-ui,sans-serif;text-decoration:none;overflow-wrap:anywhere}.edition-end{padding:38px 0 10px;text-align:center;font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.17em;text-transform:uppercase}.edition-end::before{content:'◆';display:block;margin-bottom:14px;color:var(--sun);font-size:9px}
.word-card{position:relative;padding:25px 0 3px;border-block:2px solid var(--ink)}.word-card h3{margin:0;font:500 clamp(43px,13vw,70px)/1 Georgia,serif;letter-spacing:-.045em;overflow-wrap:anywhere}.word-meta{margin:9px 0 21px;color:var(--sun);font:700 11px/1.5 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}.word-definition{margin:0 0 17px;font:400 20px/1.55 Georgia,serif}.word-detail{padding-top:15px;border-top:1px solid var(--line);color:#41534b;font:400 15px/1.6 system-ui,sans-serif}.word-detail b{color:var(--ink)}.word-source{margin-top:18px;color:var(--muted);font:400 11px/1.5 system-ui,sans-serif}.word-source a{color:inherit}
.giorno-fine{margin:72px 0 10px;text-align:center;color:var(--muted);font:italic 19px/1.5 Georgia,serif}
@media(max-width:340px){.giorno-main{padding-inline:12px}.week-strip{gap:3px}.week-day{border-radius:13px}.week-day b{font-size:8px}.week-day span{font-size:18px}.agenda-row{grid-template-columns:55px 1fr}.news-article .body p{font-size:17px}}
@media(min-width:760px){.week-strip{gap:9px}.week-day{min-height:72px}.giorno-main{padding-top:38px}}
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
  if (!catalogPromise) catalogPromise = fetch('./assets/parole-giorno-v1.json', { cache: 'force-cache' }).then(response => { if (!response.ok) throw new Error('lessico'); return response.json(); }).then(data => { if (!data || !Array.isArray(data.words) || data.words.length < 1000) throw new Error('lessico'); return data; });
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

export function materiallyChanged(previous, cluster) {
  if (!previous) return true;
  const nowTokens = unionTokens(cluster && cluster.items), oldTokens = new Set(previous.signature || []);
  const overlap = similarity(nowTokens, oldTokens);
  const nowNumbers = [...new Set((cluster.items || []).flatMap(item => String(item.title + ' ' + item.summary).match(/\b\d+(?:[.,]\d+)?\b/g) || []))].sort().join('|');
  const strongerEvidence = (cluster.items || []).some(item => tierRank(item) === 3) && !(previous.sourceTiers || []).includes('A');
  return strongerEvidence || nowNumbers !== String(previous.numbers || '') || overlap < 0.72;
}

async function continuityClusters(items, key) {
  const previous = await storeAll('stories'), clusters = clusterNews(items);
  return clusters.map(cluster => {
    const tokens = new Set(cluster.signature || []);
    const match = previous.map(record => ({ record, score: similarity(tokens, new Set(record.signature || [])) })).sort((a, b) => b.score - a.score)[0];
    const old = match && match.score >= 0.48 ? match.record : null, changed = materiallyChanged(old, cluster);
    return { ...cluster, storyId: old ? old.storyId : cluster.storyId, firstSeen: old ? old.firstSeen : key, lastSeen: key, lastMaterialChange: changed ? key : old && old.lastMaterialChange, changed, previousContext: old && old.context || '', previous: old || null };
  });
}

async function persistStories(clusters, edition, key) {
  const articleByStory = new Map();
  for (const article of edition && edition.articles || []) for (const storyId of article.storyIds || []) articleByStory.set(storyId, article);
  for (const cluster of (clusters || []).slice(0, 30)) {
    const article = articleByStory.get(cluster.storyId), signature = [...unionTokens(cluster.items)].sort().slice(0, 64);
    await storePut('stories', {
      storyId: cluster.storyId, firstSeen: cluster.firstSeen || key, lastSeen: key,
      lastMaterialChange: cluster.changed ? key : cluster.lastMaterialChange || key,
      signature, numbers: [...new Set(cluster.items.flatMap(item => String(item.title + ' ' + item.summary).match(/\b\d+(?:[.,]\d+)?\b/g) || []))].sort().join('|'),
      sourceIds: [...new Set(cluster.items.map(item => item.sourceId).filter(Boolean))], sourceTiers: [...new Set(cluster.items.map(item => item.sourceMeta && item.sourceMeta.tier).filter(Boolean))],
      context: article ? cleanText(article.title + '. ' + article.kicker, 420) : cleanText(cluster.previousContext, 420)
    });
  }
}

function sourceMap(items) { return new Map((items || []).map(item => [String(item.id), item])); }

function fallbackEdition(items, key, preparedClusters) {
  const clusters = (preparedClusters || clusterNews(items)).sort((a, b) => b.items.length - a.items.length || Date.parse(b.items[0].published) - Date.parse(a.items[0].published));
  const articles = [];
  for (const cluster of clusters) {
    const usable = cluster.items.filter(item => cleanText(item.summary, 900).length >= 55);
    if (!usable.length) continue;
    const first = usable[0], claims = [{ text: cleanText(first.summary, 700), sourceIds: [first.id] }];
    if (usable[1] && cleanText(usable[1].summary, 700) !== claims[0].text) claims.push({ text: cleanText(usable[1].summary, 700), sourceIds: [usable[1].id] });
    else claims.push({ text: cleanText(first.title, 240) + '. Il documento originale resta disponibile nella fonte collegata.', sourceIds: [first.id] });
    articles.push({ title: first.title, section: tierRank(first) === 3 ? 'Dalle fonti' : 'Mondo', kicker: 'Edizione essenziale: testo ricavato dal materiale pubblicato, senza ricomposizione generativa.', claims, storyIds: [cluster.storyId], sourceIds: [...new Set(claims.flatMap(claim => claim.sourceIds))] });
    if (articles.length === 6) break;
  }
  return articles.length >= 3 ? { v: VERSION, dayKey: key, title: 'Il Giornale di Sentiero', deck: 'Un’edizione essenziale costruita soltanto con il materiale disponibile nelle fonti.', generatedAt: new Date().toISOString(), articles, corrections: [], essential: true, rubric: { score: 78, pass: true, issues: ['edizione-essenziale'] } } : null;
}

const EDITION_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'deck', 'articles', 'corrections'],
  properties: {
    title: { type: 'string' },
    deck: { type: 'string' },
    articles: {
      type: 'array', minItems: 4, maxItems: 7,
      items: {
        type: 'object', additionalProperties: false,
        required: ['section', 'title', 'kicker', 'storyIds', 'claims'],
        properties: {
          section: { type: 'string' }, title: { type: 'string' }, kicker: { type: 'string' },
          storyIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
          claims: {
            type: 'array', minItems: 2, maxItems: 6,
            items: { type: 'object', additionalProperties: false, required: ['text', 'sourceIds'], properties: {
              text: { type: 'string' }, sourceIds: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } }
            } }
          }
        }
      }
    },
    corrections: {
      type: 'array', maxItems: 3,
      items: { type: 'object', additionalProperties: false, required: ['text', 'sourceIds'], properties: {
        text: { type: 'string' }, sourceIds: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } }
      } }
    }
  }
};

async function composeEdition(items, clusters, key, signal) {
  const packets = clusters.filter(cluster => cluster.changed || !cluster.previous).map(cluster => ({ storyId: cluster.storyId, firstSeen: cluster.firstSeen, lastMaterialChange: cluster.lastMaterialChange, changedToday: cluster.changed, contextAlreadyExplained: cluster.previousContext, sources: cluster.items.slice(0, 5).map(item => ({ id: item.id, source: item.source, sourceId: item.sourceId, sourceMeta: item.sourceMeta, published: item.published, title: item.title, summary: cleanText(item.summary, 850), url: item.url })) })).slice(0, 24);
  if (!packets.length) return null;
  if (!context || !context.canGenerate || !context.canGenerate()) return fallbackEdition(items, key, clusters);
  const system = `Sei la redazione del Giornale di Sentiero: quotidiano italiano finito, sobrio, adulto e utile a costruire un modello migliore del mondo. Il materiale è pubblico e già raggruppato in storie. Gemini è editore, mai fonte. Non aggiungere fatti, nessi causali, precedenti o previsioni non sostenuti dal materiale. Ogni frase fattuale è un claim autonomo con gli id esatti delle fonti che lo sostengono. Ometti ciò che non puoi attribuire. Privilegia scala, conseguenze, durata, cambiamento materiale e fonti primarie; non il volume o la spettacolarità. Spiega contesto, processi e incertezza nella prosa, senza etichette da briefing, falsa equivalenza, morale o clickbait. Non ripresentare come nuova una storia invariata. Crea 4-7 articoli gerarchizzati, non quote di categoria. Il primo è l'apertura solo se davvero più importante. Se fonti solide divergono, rappresenta la divergenza. corrections contiene esclusivamente rettifiche verificabili a contesto già pubblicato, altrimenti []. Il giornale deve avere una fine.`;
  const user = 'GIORNO: ' + key + '\nSTORIE PUBBLICHE E CONTINUITÀ (JSON):\n' + JSON.stringify(packets);
  const first = await context.ai({ system, user, task: 'day-newspaper', schema: EDITION_SCHEMA, maxOutputTokens: 3600, reasoning: 'medium', timeout: 52000, priority: 14, signal });
  const allowedStoryIds = new Set(clusters.map(cluster => cluster.storyId));
  let best = first && !first.err ? validateEdition(first.json, items, key, allowedStoryIds) : null;
  if (best && best.rubric.score >= 88) return best;
  const critic = `Agisci ora come caporedattore e fact-checker. Ricomponi l'intera edizione, non commentarla. Correggi questi problemi deterministici: ${JSON.stringify(best ? best.rubric.issues : ['output respinto dal claim-evidence gate'])}. Ogni claim deve poter essere verificato nelle parole di almeno una fonte indicata; conserva incertezza e gerarchia. Non introdurre alcun fatto nuovo.`;
  const repaired = await context.ai({ system: system + '\n' + critic, user: user + '\nBOZZA DA CRITICARE:\n' + JSON.stringify(first && first.json || {}), task: 'day-newspaper-critic', schema: EDITION_SCHEMA, maxOutputTokens: 3600, reasoning: 'medium', timeout: 52000, priority: 14, signal });
  const checked = repaired && !repaired.err ? validateEdition(repaired.json, items, key, allowedStoryIds) : null;
  if (checked && (!best || checked.rubric.score >= best.rubric.score)) best = checked;
  return best || fallbackEdition(items, key, clusters);
}

function renderEdition(edition, items, cachedLabel = '') {
  const mount = room && room.querySelector('.news-mount'); if (!mount) return;
  if (!edition) { renderNewsState('Oggi le fonti disponibili non bastano per comporre un’edizione affidabile. Nessun riempitivo prende il loro posto.', true); return; }
  latestEdition = edition; const sources = sourceMap(items || edition.sources || []), wrap = element('div', 'edition');
  const head = element('header', 'edition-head'); head.append(element('h3', '', edition.title)); if (edition.deck) head.append(element('p', '', edition.deck));
  const when = new Date(edition.generatedAt || Date.now()); head.append(element('p', 'edition-meta', (cachedLabel ? cachedLabel + ' · ' : '') + 'edizione delle ' + new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(when)));
  const tools = element('div', 'edition-tools'); const refreshButton = button('news-refresh', 'Verifica aggiornamenti', () => refreshNews(true)); refreshButton.setAttribute('aria-label', 'Verifica se il quadro del giorno è cambiato'); tools.append(refreshButton); head.append(tools); wrap.append(head);
  if (edition.corrections && edition.corrections.length) {
    const corrections = element('aside', 'edition-corrections'); corrections.append(element('strong', '', 'Correzioni e precisazioni'));
    for (const correction of edition.corrections) corrections.append(element('p', '', correction.text)); wrap.append(corrections);
  }
  edition.articles.forEach((article, index) => {
    const node = element('article', 'news-article' + (index === 0 ? ' lead' : '')); node.append(element('span', 'section', article.section)); node.append(element('h3', '', article.title)); if (article.kicker) node.append(element('p', 'kicker', article.kicker));
    const body = element('div', 'body'); for (const claim of article.claims || []) { const paragraph = element('p'); paragraph.append(document.createTextNode(claim.text + ' ')); const citations = element('span', 'claim-sources'); citations.setAttribute('aria-label', 'Fonti del paragrafo'); let sourceNumber = 0; for (const id of claim.sourceIds || []) { const source = sources.get(String(id)); if (!source) continue; const link = element('a', '', '[' + (++sourceNumber) + ']'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = source.source; citations.append(link); } paragraph.append(citations); body.append(paragraph); } node.append(body);
    const links = element('div', 'news-sources'); for (const id of article.sourceIds) { const source = sources.get(String(id)); if (!source) continue; const link = element('a', '', source.source + ' · ' + new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(new Date(source.published))); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link); } node.append(links); wrap.append(node);
  });
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

async function fetchSources(endpoint, key, signal) {
  const hour = new Date().getHours(), slot = key + '-' + (hour < 12 ? 'mattino' : 'giorno');
  const response = await fetch(endpoint + '/v1/day/news?slot=' + encodeURIComponent(slot), { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('fonti'); const data = await response.json();
  if (!data || !Array.isArray(data.items)) throw new Error('fonti');
  return data.items.filter(item => item && item.id && item.title && item.url && item.source && /^https:\/\//.test(item.url)).slice(0, 54).map(item => ({ id: cleanText(item.id, 80), title: cleanText(item.title, 240), summary: cleanText(item.summary, 1200), url: item.url, published: item.published, source: cleanText(item.source, 80), sourceId: cleanText(item.sourceId, 40), sourceMeta: item.sourceMeta && typeof item.sourceMeta === 'object' ? { tier: cleanText(item.sourceMeta.tier, 2), type: cleanText(item.sourceMeta.type, 30), area: cleanText(item.sourceMeta.area, 30), role: cleanText(item.sourceMeta.role, 80), reliability: cleanText(item.sourceMeta.reliability, 80), domain: cleanText(item.sourceMeta.domain, 80), language: cleanText(item.sourceMeta.language, 8), retrieval: cleanText(item.sourceMeta.retrieval, 20), freshnessMinutes: Math.max(0, Math.min(1440, Number(item.sourceMeta.freshnessMinutes) || 0)), terms: cleanText(item.sourceMeta.terms, 80) } : null }));
}

export async function refreshNews(force = false) {
  if (!room || newsBuild) return newsBuild;
  const key = sentieroDayKey(), cached = await cacheGet(key), age = cached ? Date.now() - Number(cached.at || 0) : Infinity;
  if (force && Date.now() - lastManualRefresh < 10 * 60000) { if (cached) renderEdition(cached.edition, cached.sources, 'quadro già verificato'); return cached && cached.edition; }
  if (force) lastManualRefresh = Date.now();
  if (cached && !force) { renderEdition(cached.edition, cached.sources, 'salvata sul dispositivo'); if (age < 4 * 3600000) return cached.edition; }
  if (!cached) { const latest = await cacheLatest(); if (latest) renderEdition(latest.edition, latest.sources, latest.key === key ? 'salvata sul dispositivo' : 'ultima edizione disponibile'); else renderNewsState('La Terra sta raccogliendo le fonti di oggi.', false); }
  const endpoint = newsEndpoint();
  if (!endpoint || (typeof navigator !== 'undefined' && navigator.onLine === false)) { if (!cached && !latestEdition) renderNewsState('Il Giornale tornerà quando il servizio di Sentiero e la rete saranno disponibili. La Settimana e la Parola restano qui.', false); return cached && cached.edition; }
  if (newsAbort) newsAbort.abort(); newsAbort = new AbortController();
  newsBuild = (async () => {
    try {
      const items = await fetchSources(endpoint, key, newsAbort.signal); if (items.length < 3) throw new Error('fonti');
      const clusters = await continuityClusters(items, key), changed = clusters.filter(cluster => cluster.changed);
      if (cached && !changed.length) { await cachePut({ ...cached, checkedAt: Date.now() }); renderEdition(cached.edition, cached.sources, 'quadro verificato, nessun cambiamento materiale'); return cached.edition; }
      const edition = await composeEdition(items, clusters, key, newsAbort.signal); if (!edition) throw new Error('edizione');
      edition.generatedAt = edition.generatedAt || new Date().toISOString(); edition.materialChanges = changed.map(cluster => cluster.storyId);
      await cachePut({ key, at: Date.now(), checkedAt: Date.now(), edition, sources: items }); await persistStories(clusters, edition, key); renderEdition(edition, items); return edition;
    } catch (error) { if (!(error && error.name === 'AbortError') && !cached && !latestEdition) renderNewsState('Le fonti non hanno consegnato abbastanza materiale verificabile. Nessuna storia viene inventata.', true); return cached && cached.edition; }
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
