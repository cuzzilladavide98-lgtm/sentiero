'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const html = page+'\n<script>\n'+fs.readFileSync(path.join(root, 'sentiero-app.js'), 'utf8')+'\n</script>';
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '('); assert.notEqual(start, -1, name + ' presente');
  const brace = html.indexOf('{', start); let depth = 0, quote = '', escaped = false, line = false, block = false;
  for (let i = brace; i < html.length; i++) {
    const c = html[i], n = html[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++; if (c === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('funzione non chiusa');
}

function run(name, fn) { try { fn(); process.stdout.write('PASS  ' + name + '\n'); } catch (e) { process.stderr.write('FAIL  ' + name + ': ' + e.message + '\n'); process.exitCode = 1; } }

run('Sabato 10:30 → Sabato 07:00 conserva oggetto, id e riferimenti', () => {
  const LIMITS = { TITLE: 200, NOTE: 300 }, clampStr = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);
  const update = new Function('LIMITS', 'clampStr', extractFunction('aggiornaQuestInPlace') + ';return aggiornaQuestInPlace;')(LIMITS, clampStr);
  const q = { id: 'q-sabato', titolo: 'Partire', note: '', quando: '2026-08-29', ora: '10:30', prio: 2, fatto: false };
  const ref = q, rule = { req: [{ tipo: 'quest', id: q.id }] };
  assert.equal(update(q, { titolo: 'Partire', note: 'presto', quando: '2026-08-29', ora: '07:00', prio: 1 }), true);
  assert.equal(q, ref); assert.equal(q.id, 'q-sabato'); assert.equal(rule.req[0].id, q.id); assert.equal(q.ora, '07:00'); assert.equal(q.fatto, false);
});

run('l’editor non usa Date/UTC né delete-recreate', () => {
  const src = extractFunction('aggiornaQuestInPlace') + extractFunction('salvaQuestEditor');
  assert.doesNotMatch(src, /new Date|toISOString|splice|filter\(|uid\(|coreUid/);
  assert.match(src, /q\.ora=ora/); assert.match(src, /salvaSubito\(\)/);
});

run('questLog conserva l’identità sync attraverso il sanitizzatore', () => {
  const sanitize = new Function('clampStr', 'coreUid', extractFunction('sanitizeQuestLog') + ';return sanitizeQuestLog;')((v,n)=>String(v||'').slice(0,n), ()=>'nuovo-id');
  const out = sanitize([{ _syncId: 'log-stabile', titolo: 'Conclusa', day: '2026-08-28', nata: '2026-08-27' }]);
  assert.equal(out[0]._syncId, 'log-stabile');
});

run('Altro ha home, sottopagine e ritorno accessibile', () => {
  for (const page of ['devices', 'experience', 'gemini', 'planning', 'language', 'data', 'help']) assert.match(html, new RegExp('data-settings-open="' + page + '"'));
  assert.match(html, /id="settings-back"[^>]+aria-label="Torna ad Altro"/);
  assert.match(html, /data-settings-page="devices"/);
});

run('la causa dell’overflow è corretta con min-width, wrapping e larghezze fluide', () => {
  assert.match(html, /#tab-impostazioni \*[^\{]*\{[^}]*box-sizing:border-box;max-width:100%/);
  assert.match(html, /#tab-impostazioni \.seg\{[^}]*flex-wrap:wrap/);
  assert.match(html, /grid-template-columns:36px minmax\(0,1fr\) 18px/);
  assert.doesNotMatch(html, /#tab-impostazioni\{[^}]*overflow-x:hidden/);
});

run('pairing usa token temporaneo, ECDH e conferma esplicita', () => {
  const syncSource = fs.readFileSync(path.join(root, 'sentiero-sync.js'), 'utf8');
  assert.match(syncSource, /namedCurve:'P-256'/); assert.match(syncSource, /confirmationCode/); assert.match(syncSource, /expiresAt/);
  assert.doesNotMatch(extractFunction('_inviteUrl'), /GEMINI_KEY|JSON\.stringify\(S\)|sentiero-v1/);
});

run('Service Worker deve includere i moduli runtime della release', () => {
  assert.match(sw, /sentiero-sync\.js/); assert.match(sw, /vendor\/qrcode\.js/); assert.match(sw, /vendor\/jsQR\.js/);
  assert.match(html, /function _loadQrReader\(/); assert.match(html, /inversionAttempts:'attemptBoth'/);
  assert.match(sw, /u\.origin !== self\.location\.origin/);
});
