'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.resolve(__dirname, '..', 'sentiero-app.js'), 'utf8');

function observerContract(source) {
  const match = source.match(/task:'observer-line',maxOutputTokens:(\d+),reasoning:'([^']+)',timeout:(\d+),priority:(\d+)/);
  assert.ok(match, 'contratto observer-line');
  const delay = Number((source.match(/_lineTimer=setTimeout[\s\S]{0,9000}?\},(\d+)\);/) || [])[1]);
  return { maxOutputTokens: Number(match[1]), reasoning: match[2], timeout: Number(match[3]), priority: Number(match[4]), coalesceMs: delay };
}

const before = { maxOutputTokens: 600, reasoning: 'low', timeout: 45000, priority: 5, coalesceMs: 420 };
const after = observerContract(app);
assert.deepEqual(after, { maxOutputTokens: 180, reasoning: 'minimal', timeout: 30000, priority: 55, coalesceMs: 120 });
assert.equal(Math.round((1 - after.maxOutputTokens / before.maxOutputTokens) * 100), 70);
assert.equal(before.coalesceMs - after.coalesceMs, 300);
assert.ok(after.priority > 40, 'il Sussurro precede i lavori non interattivi nella coda');

for (const state of ['GENERATING', 'AVAILABLE', 'RECOVERABLE_ERROR']) assert.match(app, new RegExp("_fruttoJobScrivi\\(tk,'" + state));
assert.match(app, /_fruttoInFlight&&_fruttoInFlightKey===tk/);
assert.match(app, /_syncId:'frutto-'\+tk/);
assert.match(app, /filter\(item=>item&&item\.tk!==tk\)\.concat\(\[nuovo\]\)/);
assert.match(app, /salvaSubito\(\); _fruttoJobScrivi\(tk,'AVAILABLE'/);
assert.match(app, /window\.addEventListener\('online',recuperaFrutto/);
assert.match(app, /document\.addEventListener\('visibilitychange'.*recuperaFrutto/);
assert.match(app, /nextAt:Date\.now\(\)\+30000/);

const surfaces = [
  ['Distilla', /task:'distill(?:-recovery)?'/], ['Mente Osservatrice', /task:'observer'/],
  ['Prossima Mossa', /task:'pietra'/], ['Sussurro', /task:'observer-line'/],
  ['Frutto', /task:'fruit'/], ['Giornale', /task: 'day-newspaper'/]
];
const day = fs.readFileSync(path.resolve(__dirname, '..', 'sentiero-day.mjs'), 'utf8');
for (const [name, pattern] of surfaces) assert.match(app + '\n' + day, pattern, name);
for (const invariant of [/_aiInflight=new Map/, /AbortController/, /_aiRatePut/, /responseJsonSchema|response_format/, /salvaSubito/, /RECOVERABLE_ERROR/]) assert.match(app + '\n' + day, invariant);

console.log(JSON.stringify({ ok: true, sussurro: { before, after, outputCeilingReductionPct: 70, deterministicWaitSavedMs: 300 }, frutto: 'idempotent+recoverable' }));
