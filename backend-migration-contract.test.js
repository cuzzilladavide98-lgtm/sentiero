'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sync = require('../sentiero-sync.js');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const html = page+'\n<script>\n'+fs.readFileSync(path.join(root, 'sentiero-app.js'), 'utf8')+'\n</script>';
const worker = fs.readFileSync(path.join(root, 'sync-worker', 'src', 'index.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'sync-worker', 'schema.sql'), 'utf8');

function run(name, fn) {
  try { fn(); process.stdout.write('PASS  ' + name + '\n'); }
  catch (error) { process.stderr.write('FAIL  ' + name + ': ' + error.message + '\n'); process.exitCode = 1; }
}

run('un backup v1 senza ID riceve identità stabili e resta importabile', () => {
  const old = {
    schemaVersion: 1,
    quests: [{ titolo: 'Partire sabato', quando: '2026-08-29', ora: '10:30', fatto: false }],
    diary: [{ text: 'Una riga precedente', data: '2026-08-26' }],
    questLog: [{ titolo: 'Una Quest conclusa', day: '2026-08-26' }],
    settings: { tema: 'notte' },
    registro: [{ task: 'solo diagnostica locale' }]
  };
  const migrated = sync.ensureEntityIds(old);
  assert.equal(migrated.schemaVersion, 2);
  assert.match(migrated.quests[0]._syncId, /.+/);
  assert.match(migrated.diary[0]._syncId, /.+/);
  assert.match(migrated.questLog[0]._syncId, /.+/);
  const entities = sync.toEntities(migrated);
  assert.equal([...entities.keys()].some(k => k.startsWith('quests:')), true);
  assert.equal(JSON.stringify([...entities.values()]).includes('solo diagnostica locale'), false);
});

run('la migrazione crea un backup locale prima di aggiornare lo schema', () => {
  assert.match(html, /sentiero-pre-migration-v2/);
  assert.match(html, /schemaVersion\s*:\s*2/);
  assert.match(html, /caricaSentieroSync/);
});

run('il backend persiste solo buste cifrate e hash di routing', () => {
  const client = fs.readFileSync(path.join(root, 'sentiero-sync.js'), 'utf8');
  assert.match(schema, /entity_hash TEXT NOT NULL/);
  assert.match(schema, /iv TEXT NOT NULL/);
  assert.match(schema, /payload TEXT NOT NULL/);
  assert.doesNotMatch(schema, /diary_text|quest_title|gemini_key/i);
  assert.match(worker, /await hash\(deviceToken\)/);
  assert.match(worker, /INSERT OR IGNORE INTO operations/);
  assert.match(client, /async function protectDeviceName\(/);
  assert.match(client, /'device-name:'\+id/);
  assert.match(client, /name:'Dispositivo in attesa'/);
});

run('autenticazione, revoca e cancellazione remota sono esposte', () => {
  const client = fs.readFileSync(path.join(root, 'sentiero-sync.js'), 'utf8');
  assert.match(worker, /device_revoked/);
  assert.match(worker, /if \(auth\.revoked_at\)/);
  assert.match(worker, /UPDATE devices SET revoked_at=/);
  assert.match(worker, /DELETE FROM spaces WHERE id=/);
  assert.match(schema, /ON DELETE CASCADE/g);
  assert.match(client, /async function reseedCurrentState\(/);
  assert.match(client, /await reseedCurrentState\(\)/);
});

run('pairing è temporaneo, confermato e consumabile una sola volta', () => {
  const client = fs.readFileSync(path.join(root, 'sentiero-sync.js'), 'utf8');
  assert.match(worker, /10 \* 60 \* 1000/);
  assert.match(worker, /pending-confirmation/);
  assert.match(worker, /status='approved' AND used_at IS NULL/);
  assert.match(worker, /claimed\.meta\.changes !== 1/);
  assert.match(worker, /claim_denied/);
  assert.match(worker, /replay: true/);
  assert.match(client, /sentiero-pre-pair-v2/);
  assert.match(client, /config\.joining/);
  assert.match(client, /clearStores\(\['ops','registers','meta'\]\)/);
});

run('CORS di produzione è configurabile per origini esplicite', () => {
  assert.match(worker, /ALLOWED_ORIGINS/);
  assert.match(worker, /allow\.includes\(origin\)/);
  assert.match(worker, /Access-Control-Allow-Origin/);
  assert.match(worker, /origin_forbidden/);
  assert.match(worker, /!originAllowed\(request, env\)/);
});
