'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const sync = require('../sentiero-sync.js');

function clock(prefix, time = 1) {
  let n = 0;
  return () => String(time).padStart(13, '0') + ':' + String(++n).padStart(6, '0') + ':' + prefix;
}

function baseState() {
  return {
    quests: [{ id: 'q-sabato', titolo: 'Partire', note: '', quando: '2026-08-29', ora: '10:30', prio: 2, fatto: false, nata: '2026-08-27', monte: '' }],
    scheduled: [], diary: [], observerNotes: [], obsLines: [], capitoli: [], semi: [], frutti: [], banco: [], unlockRules: [], desideri: [],
    checks: {}, patti: {}, sfide: {}, foto: {}, riposi: {}, ferie: {}, unlockDone: {}, promVisti: {}, settings: { uiTheme: 'classico', lingua: 'it' }, mastery: {}, desiderio: null,
    streak: 0, lastSealed: '', registro: [{ msg: 'privato locale' }]
  };
}

test('il delta Quest contiene solo il campo cambiato e conserva l’identità', () => {
  const before = baseState(), after = structuredClone(before); after.quests[0].ora = '07:00';
  let seq = 0;
  const ops = sync.diffEntities(sync.toEntities(before), sync.toEntities(after), clock('a'), 'a', () => ++seq);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].entity, 'quests:q-sabato');
  assert.deepEqual(Object.keys(ops[0].fields), ['ora']);
  assert.equal(ops[0].fields.ora.value, '07:00');
});

test('modifiche offline su campi diversi si fondono senza perdere dati', () => {
  const initial = baseState();
  const regs = new Map(); let seq = 0;
  sync.diffEntities(new Map(), sync.toEntities(initial), clock('seed', 1), 'seed', () => ++seq).forEach(op => sync.applyOperation(regs, op));

  const a = structuredClone(initial); a.quests[0].ora = '07:00';
  const b = structuredClone(initial); b.quests[0].note = 'Portare l’acqua';
  sync.diffEntities(sync.toEntities(initial), sync.toEntities(a), clock('a', 2), 'a', () => ++seq).forEach(op => sync.applyOperation(regs, op));
  sync.diffEntities(sync.toEntities(initial), sync.toEntities(b), clock('b', 2), 'b', () => ++seq).forEach(op => sync.applyOperation(regs, op));

  const merged = sync.fromEntities(initial, sync.registersToEntities(regs));
  assert.equal(merged.quests[0].id, 'q-sabato');
  assert.equal(merged.quests[0].ora, '07:00');
  assert.equal(merged.quests[0].note, 'Portare l’acqua');
});

test('impostazioni e spunte concorrenti fondono i singoli campi', () => {
  const initial = baseState(), regs = new Map(); let seq = 0;
  sync.diffEntities(new Map(), sync.toEntities(initial), clock('seed', 1), 'seed', () => ++seq).forEach(op => sync.applyOperation(regs, op));
  const a = structuredClone(initial), b = structuredClone(initial);
  a.settings.uiTheme = 'carta'; a.checks['2026-08-28'] = { ritualeA: true };
  b.settings.lingua = 'en'; b.checks['2026-08-28'] = { ritualeB: true };
  sync.diffEntities(sync.toEntities(initial), sync.toEntities(a), clock('a', 2), 'a', () => ++seq).forEach(op => sync.applyOperation(regs, op));
  sync.diffEntities(sync.toEntities(initial), sync.toEntities(b), clock('b', 2), 'b', () => ++seq).forEach(op => sync.applyOperation(regs, op));
  const merged = sync.fromEntities(initial, sync.registersToEntities(regs));
  assert.equal(merged.settings.uiTheme, 'carta'); assert.equal(merged.settings.lingua, 'en');
  assert.deepEqual(merged.checks['2026-08-28'], { ritualeA: true, ritualeB: true });
});

test('stesso campo concorrente ha un vincitore deterministico', () => {
  const regs = new Map();
  const low = { opId: '1', entity: 'quests:q', fields: { ora: { value: '08:00', hlc: '100:000001:a' } } };
  const high = { opId: '2', entity: 'quests:q', fields: { ora: { value: '07:00', hlc: '100:000001:z' } } };
  sync.applyOperation(regs, high); sync.applyOperation(regs, low);
  assert.equal(sync.registersToEntities(regs).get('quests:q').value.ora, '07:00');
});

test('tombstone, replay e arrivo fuori ordine sono idempotenti', () => {
  const regs = new Map();
  const put = { opId: 'p', entity: 'quests:q', fields: { titolo: { value: 'Vecchia', hlc: '100:000001:a' } } };
  const del = { opId: 'd', entity: 'quests:q', tombstone: '200:000001:a', fields: {} };
  assert.equal(sync.applyOperation(regs, del), true);
  sync.applyOperation(regs, put); sync.applyOperation(regs, put);
  assert.equal(sync.registersToEntities(regs).get('quests:q').deleted, true);
});

test('registro tecnico e segreti non entrano nelle entità sincronizzate', () => {
  const state = baseState(); state.geminiKey = 'NON-DEVE-USCIRE'; state.settings.apiKey = 'NON-DEVE-USCIRE';
  const serialized = JSON.stringify([...sync.toEntities(state)]);
  assert.doesNotMatch(serialized, /NON-DEVE-USCIRE|registro/);
});

test('cifratura AES-GCM lega il payload al suo opId', async () => {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const value = { opId: 'op-1', entity: 'quests:q', fields: { ora: { value: '07:00', hlc: '1:a' } } };
  const box = await sync._encryptJson(value, key, value.opId);
  assert.equal(JSON.stringify(box).includes('07:00'), false);
  assert.deepEqual(await sync._decryptJson(box, key, value.opId), value);
  await assert.rejects(() => sync._decryptJson(box, key, 'op-alterato'));
});

test('ECDH produce la stessa chiave e lo stesso codice sui due dispositivi', async () => {
  const make = async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    return { priv: await crypto.subtle.exportKey('jwk', pair.privateKey), pub: await crypto.subtle.exportKey('jwk', pair.publicKey) };
  };
  const a = await make(), b = await make();
  const fromA = await sync._derivePair(a.priv, b.pub), fromB = await sync._derivePair(b.priv, a.pub);
  assert.equal(fromA.key, fromB.key);
  assert.equal(fromA.code, fromB.code);
  assert.match(fromA.code, /^\d{6}$/);
});

test('l’ordine delle collezioni converge indipendentemente dall’ordine di arrivo', () => {
  const one = { opId: 'd1', entity: 'diary:d1', fields: { id: { value: 'd1', hlc: '100:000001:a' }, iso: { value: '2026-08-27T10:00:00.000Z', hlc: '100:000002:a' }, testo: { value: 'prima', hlc: '100:000003:a' } } };
  const two = { opId: 'd2', entity: 'diary:d2', fields: { id: { value: 'd2', hlc: '100:000001:b' }, iso: { value: '2026-08-28T10:00:00.000Z', hlc: '100:000002:b' }, testo: { value: 'seconda', hlc: '100:000003:b' } } };
  const a = new Map(), b = new Map();
  sync.applyOperation(a, one); sync.applyOperation(a, two);
  sync.applyOperation(b, two); sync.applyOperation(b, one);
  const base = baseState(), left = sync.fromEntities(base, sync.registersToEntities(a)), right = sync.fromEntities(base, sync.registersToEntities(b));
  assert.deepEqual(left.diary.map(x => x.id), ['d2', 'd1']);
  assert.deepEqual(left.diary, right.diary);
});
