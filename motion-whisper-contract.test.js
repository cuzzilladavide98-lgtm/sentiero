'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

function extractFunction(name, from = 0) {
  const start = html.indexOf('function ' + name + '(', from);
  assert.notEqual(start, -1, 'funzione presente: ' + name);
  const brace = html.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  let escaped = false;
  for (let i = brace; i < html.length; i++) {
    const c = html[i];
    const n = html[i + 1];
    if (lineComment) {
      if (c === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === '*' && n === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue; }
    if (c === '/' && n === '*') { blockComment = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('funzione non chiusa: ' + name);
}

function test(name, fn) {
  try {
    fn();
    process.stdout.write('PASS  ' + name + '\n');
  } catch (error) {
    process.stderr.write('FAIL  ' + name + ': ' + error.message + '\n');
    process.exitCode = 1;
  }
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
test('sintassi degli script inline', () => scripts.forEach(source => new Function(source)));

const filo = new Function(extractFunction('_sussFilo') + ';return _sussFilo;')();
const serve = new Function('_sussFilo', extractFunction('sussurroServeGemini') + ';return sussurroServeGemini;')(filo);

const gateFixtures = [
  ['null', null, false],
  ['ordinaria', {}, false],
  ['ritorno', { ritorno: 'due occasioni mancate' }, true],
  ['attrito reale', { attrito_nominato: 'attrito: pioveva' }, true],
  ['attrito senza parole', { attrito_nominato: 'pioveva' }, false],
  ['patto pertinente', { patto_di_stamattina: { riguarda_questo_task: true } }, true],
  ['patto non pertinente', { patto_di_stamattina: { riguarda_questo_task: false } }, false],
  ['pietra del desiderio', { pietra_del_desiderio: 'prima pietra' }, true],
  ['rientro da ferie', { rientro_da_ferie: true }, true],
  ['nota utente', { nota_utente: 'era difficile' }, true],
  ['fuori piano', { fuori_piano: true }, true],
  ['seme piantato', { seme_piantato: true }, true],
  ['quest nata ieri', { quest_nata: 'ieri' }, true],
  ['quest nata oggi', { quest_nata: 'oggi' }, false],
  ['quest eta ignota', { quest_nata: 'ignota' }, false],
  ['diario pertinente precedente', { diario_pertinente: [{ scritto: 'ieri ho evitato questa cosa', per: 'titolo' }] }, true],
  ['diario soltanto oggi', { diario_pertinente: [{ scritto: 'oggi ho iniziato', per: 'titolo' }] }, false],
  ['diario a data ignota', { diario_pertinente: [{ scritto: 'data ignota: testo', per: 'titolo' }] }, false],
  ['diario aggancio debole', { diario_pertinente: [{ scritto: 'ieri qualcosa', per: 'aggancio debole' }] }, false],
  ['arco variato', { arco_quattro_settimane: 'dalla piu lontana: vuota · piena · piena · piena' }, true],
  ['arco uniforme', { arco_quattro_settimane: 'dalla piu lontana: piena · piena · piena · piena' }, false]
];

for (const [name, pkg, expected] of gateFixtures) {
  test('gate Sussurro / ' + name, () => assert.equal(serve(pkg), expected));
}

test('filo ritorno classificato', () => assert.equal(filo({ ritorno: 'x' }).t, 'ritorno'));
test('filo attrito conserva le parole', () => assert.equal(filo({ attrito_nominato: 'attrito: restare asciutto' }).parole, 'restare asciutto'));
test('filo patto classificato', () => assert.equal(filo({ patto_di_stamattina: { riguarda_questo_task: true } }).t, 'patto'));

const phase = new Function(extractFunction('phase') + ';return phase;')();
const profile = new Function('phase', extractFunction('profile') + ';return profile;')(phase);

test('fasi Blue 1-3, Red 4-6, Purple 7+', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 9].map(n => phase(n, '')), ['blue', 'blue', 'blue', 'red', 'red', 'red', 'purple', 'purple']);
});
test('escalation interna Blue', () => {
  const p = [1, 2, 3].map(n => profile(n, ''));
  assert.ok(p[0].frames < p[1].frames && p[1].frames < p[2].frames);
  assert.ok(p[0].strength < p[1].strength && p[1].density < p[2].density);
});
test('escalation interna Red', () => {
  const p = [4, 5, 6].map(n => profile(n, ''));
  assert.ok(p[0].frames < p[1].frames && p[1].frames < p[2].frames);
  assert.ok(p[0].strength < p[1].strength && p[1].density < p[2].density);
});
test('escalation interna Purple e saturazione', () => {
  const p = [7, 8, 9, 10, 30].map(n => profile(n, ''));
  assert.ok(p[0].frames < p[1].frames && p[1].frames < p[2].frames && p[2].frames < p[3].frames);
  assert.equal(p[3].frames, p[4].frames);
});
test('sigillo passa il testimone in una sequenza locale breve', () => {
  const p = profile(2, 'full');
  assert.equal(p.ph, 'purple');
  assert.equal(p.handoff, true);
  assert.ok(p.frames <= 16);
});

test('QUEST_MOTION resta locale e senza rAF/canvas/fetch', () => {
  const a = html.indexOf('const QUEST_MOTION=');
  const b = html.indexOf('\n})();', a);
  const block = html.slice(a, b + 6);
  assert.equal((html.match(/const QUEST_MOTION=/g) || []).length, 1);
  assert.match(block, /width:116px|qm-layer/);
  assert.doesNotMatch(block, /requestAnimationFrame|canvas|fetch\s*\(/);
  assert.match(html, /overflow:hidden;contain:strict/);
});
test('progressione derivata soltanto dallo stato reale del giorno', () => {
  const onComplete = extractFunction('onComplete');
  assert.match(onComplete, /completateOggi\(S,tk,dow\)/);
  assert.match(onComplete, /anteprimaSigillo\(S,tk,dow\)/);
});
test('sigillo conserva una sola ownership aptica e sonora', () => {
  const onComplete = extractFunction('onComplete');
  assert.match(onComplete, /if\(!seal\)\{/);
  const guarded = onComplete.slice(onComplete.indexOf('if(!seal){'), onComplete.indexOf('observerLineFor'));
  assert.match(guarded, /haptic\(/);
  assert.match(guarded, /playSFX|playEventSound/);
  assert.match(onComplete, /updateRing\(\)/);
});
test('undo riceve il conteggio reale rimasto', () => {
  assert.equal((html.match(/QUEST_MOTION\.undo\(div,completateOggi/g) || []).length, 2);
});
test('riduzione movimento disattiva il layer', () => assert.match(html, /body:not\(\.anima-sempre\) \.qm-layer\{display:none\}/));
test('Sussurro registra silenzio locale riproducibile', () => assert.match(html, /gate locale: nessun filo significativo',pkg:pkgL/));
test('Sussurro traccia debounce, abort e renderer', () => {
  assert.equal((html.match(/const _sussurroDiag=/g) || []).length, 1);
  assert.match(html, /coalesced\+\+/);
  assert.match(html, /aborted\+\+/);
  assert.match(html, /rendered\+\+/);
});
test('nessun runtime Brace reintrodotto', () => {
  assert.equal((html.match(/_braceParte\s*\(/g) || []).length, 0);
  assert.equal((html.match(/_braceEsito\s*\(/g) || []).length, 0);
});

if (!process.exitCode) {
  process.stdout.write('\nTutti i contratti Motion/Sussurro sono rispettati (' + gateFixtures.length + ' fixture gate).\n');
}
