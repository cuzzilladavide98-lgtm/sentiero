'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const html = page+'\n<script>\n'+fs.readFileSync(path.join(root, 'sentiero-app.js'), 'utf8')+'\n</script>';

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'funzione presente: ' + name);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  let escaped = false;
  for (let i = brace; i < source.length; i++) {
    const c = source[i];
    const n = source[i + 1];
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
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
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

const start = html.indexOf('const TODAY_STAGE=(()=>{');
const end = html.indexOf('\n})();', start);
assert.notEqual(start, -1, 'TODAY_STAGE presente');
assert.notEqual(end, -1, 'TODAY_STAGE chiuso');
const stage = html.slice(start, end + 6);
const stageCssStart = html.indexOf('/* ══ v272.8 — OGGI E UNA SCENA');
const stageCssEnd = html.indexOf('/* LCD-LAB-OVERRIDES-END */', stageCssStart);
const css = html.slice(stageCssStart, stageCssEnd);

const phaseSource = extractFunction(stage, 'phase');
const profileSource = extractFunction(stage, 'profile');
const phase = new Function(phaseSource + ';return phase;')();
const profile = new Function('phase', profileSource + ';return profile;')(phase);

test('sintassi di tutti gli script inline', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  scripts.forEach(source => new Function(source));
});

test('un solo direttore, confinato a #tab-oggi', () => {
  assert.equal((html.match(/const TODAY_STAGE=/g) || []).length, 1);
  assert.match(stage, /getElementById\('tab-oggi'\)/);
  assert.match(stage, /tab\.appendChild\(q\)/);
  assert.match(stage, /#list-task>#?\.item|#list-task>\.item/);
  assert.doesNotMatch(stage, /document\.body\.appendChild|#tab-diario|#tab-altro|#mic-wrap/);
});

test('nessuno stato persistente o contatore di progressione parallelo', () => {
  assert.doesNotMatch(stage, /localStorage|sessionStorage|indexedDB|\bS\.|checks\[|questLog/);
  assert.match(profileSource, /step=Math\.max\(1,step\|0\)/);
  assert.doesNotMatch(profileSource, /Date\.|Math\.random|performance\./);
});

test('fonte di verita reale condivisa con QUEST_MOTION', () => {
  const onComplete = extractFunction(html, 'onComplete');
  assert.match(onComplete, /passo=Math\.max\(1,completateOggi\(S,tk,dow\)\|0\)/);
  assert.match(onComplete, /TODAY_STAGE\.play\(el,passo,seal\)/);
  assert.equal((html.match(/TODAY_STAGE\.undo\(div,left\)/g) || []).length, 2);
});

test('Blue 1-3, Red 4-6, Purple 7+', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 10, 40].map(n => phase(n, '')),
    ['blue', 'blue', 'blue', 'red', 'red', 'red', 'purple', 'purple', 'purple']);
});

test('escalation interna Blue e Red', () => {
  const blue = [1, 2, 3].map(n => profile(n, ''));
  const red = [4, 5, 6].map(n => profile(n, ''));
  for (const p of [blue, red]) {
    assert.ok(p[0].frames < p[1].frames && p[1].frames < p[2].frames);
    assert.ok(p[0].amp < p[1].amp && p[1].amp < p[2].amp);
    assert.ok(p[0].field < p[1].field && p[1].field < p[2].field);
  }
  assert.deepEqual(blue.map(p => p.reach), [0, 1, 2]);
  assert.ok(red[0].amp > blue[2].amp);
});

test('Purple converge e satura a 10+', () => {
  const purple = [7, 8, 9, 10, 25].map(n => profile(n, ''));
  assert.ok(purple[0].frames < purple[1].frames && purple[1].frames < purple[2].frames && purple[2].frames < purple[3].frames);
  assert.equal(purple[3].frames, purple[4].frames);
  assert.equal(purple[3].amp, purple[4].amp);
  assert.equal(purple[3].field, purple[4].field);
  assert.match(stage, /q\.querySelector\('\.ts-left'\)/);
  assert.match(stage, /q\.querySelector\('\.ts-right'\)/);
});

test('Blue, Red e Purple hanno comportamenti distinti', () => {
  assert.match(stage, /if\(ph==='blue'\)/);
  assert.match(stage, /else if\(ph==='red'\)/);
  assert.match(stage, /perspective\(420px\)/);
  assert.match(stage, /near\.forEach/);
  assert.match(stage, /stageHeads/);
});

test('undo ritira la fase realmente lasciata', () => {
  const undo = extractFunction(stage, 'undo');
  assert.match(undo, /previous=Math\.max\(1,\(remaining\|0\)\+1\)/);
  assert.match(undo, /profile\(previous,''\)/);
  assert.match(undo, /lastUndoPhase=ph/);
  assert.match(undo, /scaleX\(\.02\)/);
});

test('TODAY_STAGE non possiede audio, aptica o side effect del Cerchio', () => {
  assert.doesNotMatch(stage, /haptic\s*\(|playSFX|playEventSound|playBuiltinSeal|floatWord|FX\.|shake\s*\(|updateRing\s*\(/);
  const seal = profile(2, 'full');
  assert.equal(seal.handoff, true);
  assert.equal(seal.reach, 0);
  assert.ok(seal.frames <= 12);
  const onComplete = extractFunction(html, 'onComplete');
  assert.match(onComplete, /if\(!seal\)\{/);
  assert.match(onComplete, /updateRing\(\)/);
});

test('reduced motion conserva lo stato ed elimina la decorazione', () => {
  assert.match(stage, /prefers-reduced-motion: reduce/);
  assert.match(stage, /completeAfter\(tok,40\)/);
  assert.match(css, /body:not\(\.anima-sempre\) #today-stage-layer\{display:none\}/);
  assert.match(css, /border-color:var\(--accent\)/);
});

test('settle e lifecycle non lasciano layer o trasformazioni', () => {
  const finish = extractFunction(stage, 'finish');
  const settle = extractFunction(stage, 'settle');
  assert.match(finish, /\.cancel\(\)/);
  assert.match(finish, /a\.layer&&a\.layer\.remove\(\)/);
  assert.match(finish, /classList\.remove\('ts-blue','ts-red','ts-purple'/);
  assert.match(settle, /#tab-oggi #today-stage-layer/);
  assert.match(html, /_settleTodayMotion\('nav'\)/);
  assert.match(html, /_settleTodayMotion\('hidden'\)/);
  assert.match(html, /_settleTodayMotion\('pagehide'\)/);
});

test('rapid tap cancella prima di creare la scena successiva', () => {
  const play = extractFunction(stage, 'play');
  assert.match(play, /^function play\(el,step,seal\)\{\s*settle\('replace'\)/);
  assert.match(stage, /if\(old\)old\.remove\(\)/);
  assert.match(stage, /clearTimers\(\);token\+\+/);
});

test('nessun loop, canvas, fetch o animazione decorativa permanente', () => {
  assert.doesNotMatch(stage, /requestAnimationFrame|setInterval|canvas|getContext|fetch\s*\(/);
  assert.match(stage, /node\.animate/);
  assert.match(stage, /duration:Math\.round\(frames\*FRAME\)/);
  assert.match(stage, /opacity|transform/);
});

test('fallback portabile quando Web Animations non esiste', () => {
  assert.match(stage, /if\(!node\|\|!node\.animate\)return null/);
  assert.equal((stage.match(/!el\.animate/g) || []).length, 4);
  assert.doesNotMatch(stage, /startViewTransition|AnimationWorklet|SharedArrayBuffer/);
});

test('touch target, testo e contenimento mobile', () => {
  assert.match(css, /#tab-oggi \.item \.chk\{width:42px;height:42px/);
  assert.match(html, /\.item \.chk::after\{content:'';position:absolute;left:-5px;right:-5px;top:-5px;bottom:-5px\}/);
  assert.ok((html.match(/class="chk" aria-label="Completa"/g) || []).length >= 2);
  assert.match(css, /#today-stage-layer\{[^}]*overflow:hidden/);
  assert.match(css, /@media \(max-width:390px\)/);
  assert.match(css, /#tab-oggi \.item \.txt\{min-width:0\}/);
  assert.match(html, /\.item \.txt,[\s\S]{0,240}overflow-wrap:break-word/);
  assert.doesNotMatch(css, /text-overflow|white-space:nowrap/);
});

test('OLED e LCD hanno materia distinta', () => {
  assert.match(css, /#tab-oggi\.ts-purple/);
  assert.match(css, /body\.theme-lcd #tab-oggi\.ts-purple/);
  assert.match(css, /Su LCD la forza e pigmento/);
  assert.doesNotMatch(css, /mix-blend-mode/);
});

if (!process.exitCode) {
  process.stdout.write('\nTutti i contratti TODAY_STAGE sono rispettati.\n');
}
