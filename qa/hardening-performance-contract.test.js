'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'sentiero-app.js'), 'utf8');
const runtimeSource = html+'\n'+app;
const workerSource = fs.readFileSync(path.join(root, 'sync-worker', 'src', 'index.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'sentiero-sync.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('il bootstrap non incorpora più gli MP3 del Cerchio', () => {
  assert.doesNotMatch(runtimeSource, /data:audio\//);
  const names = Array.from({ length: 8 }, (_, index) => `combo-${index + 1}.mp3`).concat('seal.mp3');
  for (const name of names) {
    const relative = `assets/sfx/${name}`;
    const file = path.join(root, relative);
    assert.equal(fs.existsSync(file), true, relative);
    assert.ok(fs.statSync(file).size > 4000, relative);
    assert.match(app, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(sw, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(app, /isSfxSource\(x\.data\)/);
  assert.match(app, /fetch\(source,\{cache:'force-cache'\}\)/);
});

test('peso di avvio resta sotto i budget misurati della candidata', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).concat(app).join('\n');
  assert.match(html, /rel="preload" href="\.\/sentiero-app\.js\?v=60\.274\.5" as="script"/);
  assert.match(html, /<script src="\.\/sentiero-app\.js\?v=60\.274\.5"><\/script>/);
  assert.ok(Buffer.byteLength(html) < 300000, 'index.html oltre 300.000 B');
  assert.ok(zlib.gzipSync(html, { level: 9 }).length < 100000, 'index.html gzip oltre 100.000 B');
  assert.ok(Buffer.byteLength(scripts) < 960000, 'JavaScript inline oltre 960.000 B');
});

test('il Service Worker attiva la release solo con il runtime principale completo', () => {
  assert.match(sw, /const CORE_ASSETS = \['\.\/', '\.\/index\.html', '\.\/manifest\.json', '\.\/sentiero-app\.js\?v=60\.274\.5', '\.\/sentiero-day\.mjs\?v=60\.274\.5'\]/);
  assert.match(sw, /Promise\.all\(CORE_ASSETS\.map/);
  assert.match(sw, /throw new Error\('core asset: '/);
  assert.match(sw, /sentiero-day\.mjs\?v=60\.274\.5/);
  assert.match(sw, /assets\/giornale\/latest\.json/);
  assert.match(sw, /assets\/parole-giorno-v1\.json/);
  for (const relative of ['index.html', 'manifest.json', 'sentiero-app.js', 'sentiero-sync.js', 'sentiero-day.mjs']) {
    assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
  }
});

test('il client sync è single-flight, usa ack espliciti e non accumula marcatori seen', () => {
  assert.match(clientSource, /if\(syncInFlight\)return syncInFlight/);
  assert.match(clientSource, /new Set\(Array\.isArray\(res\.acked\)/);
  assert.match(clientSource, /ack_missing/);
  assert.match(clientSource, /mapConcurrent\(queued,CRYPTO_CONCURRENCY/);
  assert.match(clientSource, /db\.onversionchange=/);
  assert.doesNotMatch(clientSource, /['"]seen:/);
});

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (/FROM devices/.test(this.sql)) return { space_id: 'space-1', id: 'device-1', revoked_at: null };
    return null;
  }
  async all() { return { results: /FROM operations/.test(this.sql) ? this.db.rows : [] }; }
  async run() { this.db.runs.push({ sql: this.sql, args: this.args }); return { meta: { changes: 1 } }; }
}

class MockDb {
  constructor(rows = []) { this.rows = rows; this.batches = []; this.runs = []; }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) { this.batches.push(statements.map(statement => ({ sql: statement.sql, args: statement.args }))); return statements.map(() => ({ success: true })); }
}

function syncRequest(body, origin = 'https://sentiero.example') {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer token', 'X-Sentiero-Space': 'space-1', 'X-Sentiero-Device': 'device-1' };
  if (origin) headers.Origin = origin;
  return new Request('https://sync.example/v1/sync', { method: 'POST', headers, body: JSON.stringify(Object.assign({ protocol: 3 }, body)) });
}

function validEnvelope(index = 1) {
  return { opId: `op-${index}`, entity: 'abcdefghijklmnop', deviceId: 'device-1', seq: index, iv: 'AAAAAAAAAAAAAAAA', data: 'QUJDRA==' };
}

test('il Worker rifiuta lotti ambigui e conferma soltanto operazioni validate', async () => {
  const worker = (await import(pathToFileURL(path.join(root, 'sync-worker', 'src', 'index.js')).href)).default;
  const env = { DB: new MockDb(), ALLOWED_ORIGINS: 'https://sentiero.example' };
  const ok = await worker.fetch(syncRequest({ cursor: 0, ops: [validEnvelope()] }), env);
  assert.equal(ok.status, 200);
  const accepted = await ok.json();
  assert.deepEqual(accepted.acked, ['op-1']);
  assert.equal(env.DB.batches.length, 1);

  const badEnv = { DB: new MockDb(), ALLOWED_ORIGINS: 'https://sentiero.example' };
  const bad = validEnvelope(); bad.deviceId = 'device-2';
  const rejected = await worker.fetch(syncRequest({ cursor: 0, ops: [bad] }), badEnv);
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error, 'invalid_op');
  assert.equal(badEnv.DB.batches.length, 0);

  const absentOrigin = await worker.fetch(syncRequest({ cursor: 0, ops: [] }, ''), env);
  assert.equal(absentOrigin.status, 403);
});

test('il Worker pagina il recupero remoto con un segnale hasMore esplicito', async () => {
  const worker = (await import(pathToFileURL(path.join(root, 'sync-worker', 'src', 'index.js')).href)).default;
  const rows = Array.from({ length: 101 }, (_, index) => ({ row_id: index + 1, op_id: `remote-${index}`, device_id: 'device-1', seq: index + 1, iv: 'AAAAAAAAAAAAAAAA', payload: 'QUJDRA==' }));
  const env = { DB: new MockDb(rows), ALLOWED_ORIGINS: 'https://sentiero.example' };
  const response = await worker.fetch(syncRequest({ cursor: 0, ops: [] }), env);
  const body = await response.json();
  assert.equal(body.ops.length, 100);
  assert.equal(body.cursor, 100);
  assert.equal(body.hasMore, true);
});

test('la newsroom pubblica usa soltanto il registry fisso e non richiede dati Sentiero', async () => {
  const worker = (await import(pathToFileURL(path.join(root, 'sync-worker', 'src', 'index.js')).href)).default;
  const { NEWS_SOURCES } = await import(pathToFileURL(path.join(root, 'sync-worker', 'src', 'news-sources.js')).href);
  const originalFetch = global.fetch, published = new Date().toUTCString();
  global.fetch = async url => { const source = NEWS_SOURCES.find(item => item.url === String(url)); assert.ok(source); const articleUrl = `https://${source.linkDomains[0]}/news/${source.sourceId}`; return new Response(`<?xml version="1.0"?><rss><channel><item><title>Documento pubblico verificato ${source.sourceId}</title><link>${articleUrl}</link><description>Una fonte pubblica consegna materiale sufficiente e circoscritto per la redazione.</description><pubDate>${published}</pubDate></item></channel></rss>`, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } }); };
  try {
    const request = new Request('https://sync.example/v1/day/news?slot=test', { headers: { Origin: 'https://sentiero.example' } });
    const response = await worker.fetch(request, { ALLOWED_ORIGINS: 'https://sentiero.example' }, { waitUntil() {} });
    assert.equal(response.status, 200); const body = await response.json();
    assert.ok(body.items.length >= 5); assert.equal(body.policy.personalData, false); assert.equal(body.policy.paidProvider, false);
    assert.ok(body.items.every(item => item.sourceMeta && item.sourceMeta.tier && item.sourceMeta.domain));
  } finally { global.fetch = originalFetch; }
});

test('il cron elimina gli inviti scaduti senza toccare il journal', async () => {
  const worker = (await import(pathToFileURL(path.join(root, 'sync-worker', 'src', 'index.js')).href)).default;
  const db = new MockDb(); let task;
  await worker.scheduled({}, { DB: db }, { waitUntil(promise) { task = promise; } });
  await task;
  assert.equal(db.runs.length, 1);
  assert.match(db.runs[0].sql, /DELETE FROM pairs/);
  assert.doesNotMatch(db.runs[0].sql, /operations/);
});

test('la configurazione Worker non può essere distribuita con CORS wildcard', () => {
  const toml = fs.readFileSync(path.join(root, 'sync-worker', 'wrangler.toml'), 'utf8');
  assert.doesNotMatch(toml, /ALLOWED_ORIGINS\s*=\s*""/);
  assert.doesNotMatch(workerSource, /origin\s*\|\|\s*['"]\*['"]/);
  assert.match(toml, /crons\s*=/);
});
