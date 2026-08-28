'use strict';

const assert = require('node:assert/strict');

const endpoint = String(process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const origin = process.argv[3] || 'http://localhost:8000';

async function call(path, options = {}) {
  const headers = Object.assign({ Origin: options.origin === undefined ? origin : options.origin }, options.body === undefined ? {} : { 'Content-Type': 'application/json' });
  if (options.auth) Object.assign(headers, { Authorization: `Bearer ${options.auth.token}`, 'X-Sentiero-Space': options.auth.spaceId, 'X-Sentiero-Device': options.auth.deviceId });
  const response = await fetch(endpoint + path, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  let body = {}; try { body = await response.json(); } catch (_) {}
  return { response, body };
}

function protectedName(char) { return `v2.${char.repeat(16)}.${char.repeat(32)}`; }

async function main() {
  const health = await fetch(endpoint + '/health').then(response => response.json());
  assert.equal(health.ok, true); assert.equal(health.protocol, 3);
  const deep = await call('/health?deep=1'); assert.equal(deep.response.status, 200); assert.equal(deep.body.database, 'reachable');
  const forbidden = await call('/v1/spaces', { method: 'POST', origin: 'https://evil.example', body: { deviceId: 'device-evil', name: protectedName('A') } });
  assert.equal(forbidden.response.status, 403);

  const deviceA = 'device-e2e-a';
  const created = await call('/v1/spaces', { method: 'POST', body: { deviceId: deviceA, name: protectedName('A') } });
  assert.equal(created.response.status, 200);
  const authA = { deviceId: deviceA, spaceId: created.body.spaceId, token: created.body.deviceToken };

  const oldProtocol = await call('/v1/sync', { method: 'POST', auth: authA, body: { cursor: 0, ops: [] } });
  assert.equal(oldProtocol.response.status, 426);
  const envelope = { opId: 'op-e2e-1', entity: 'abcdefghijklmnop', deviceId: deviceA, seq: 1, iv: 'AAAAAAAAAAAAAAAA', data: 'QUJDRA==' };
  const synced = await call('/v1/sync', { method: 'POST', auth: authA, body: { protocol: 3, cursor: 0, ops: [envelope] } });
  assert.equal(synced.response.status, 200); assert.deepEqual(synced.body.acked, ['op-e2e-1']); assert.equal(synced.body.ops.length, 1);

  const pairA = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pairB = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubA = await crypto.subtle.exportKey('jwk', pairA.publicKey), pubB = await crypto.subtle.exportKey('jwk', pairB.publicKey);
  const invitation = await call('/v1/pairs', { method: 'POST', auth: authA, body: { publicKey: pubA } });
  assert.equal(invitation.response.status, 200);
  const deviceB = 'device-e2e-b';
  const redeemed = await call('/v1/pairs/redeem', { method: 'POST', body: { token: invitation.body.token, deviceId: deviceB, name: 'Dispositivo in attesa', publicKey: pubB } });
  assert.equal(redeemed.response.status, 200);
  const status = await call(`/v1/pairs/${encodeURIComponent(invitation.body.token)}`, { auth: authA });
  assert.equal(status.body.status, 'pending-confirmation'); assert.equal(status.body.deviceId, deviceB);
  const approved = await call(`/v1/pairs/${encodeURIComponent(invitation.body.token)}/approve`, { method: 'POST', auth: authA, body: { iv: 'AAAAAAAAAAAAAAAA', data: 'A'.repeat(32) } });
  assert.equal(approved.response.status, 200);
  const claimed = await call(`/v1/pairs/${encodeURIComponent(invitation.body.token)}/claim`, { method: 'POST', body: { claim: redeemed.body.claim } });
  assert.equal(claimed.body.status, 'approved');
  const replay = await call(`/v1/pairs/${encodeURIComponent(invitation.body.token)}/claim`, { method: 'POST', body: { claim: redeemed.body.claim } });
  assert.equal(replay.body.replay, true);

  const authB = { deviceId: deviceB, spaceId: authA.spaceId, token: redeemed.body.deviceToken };
  const devices = await call('/v1/devices', { auth: authB }); assert.equal(devices.body.devices.length, 2);
  const renamed = await call(`/v1/devices/${deviceB}`, { method: 'PATCH', auth: authB, body: { name: protectedName('B') } }); assert.equal(renamed.response.status, 200);
  const revoked = await call(`/v1/devices/${deviceB}`, { method: 'DELETE', auth: authA }); assert.equal(revoked.response.status, 200);
  const denied = await call('/v1/sync', { method: 'POST', auth: authB, body: { protocol: 3, cursor: 0, ops: [] } });
  assert.equal(denied.response.status, 403); assert.equal(denied.body.error, 'device_revoked');
  const deleted = await call('/v1/spaces/current', { method: 'DELETE', auth: authA }); assert.equal(deleted.response.status, 200);

  const cron = await fetch(endpoint + '/cdn-cgi/local/scheduled'); assert.ok(cron.ok);
  process.stdout.write('PASS Worker/D1 locale: health, CORS, protocollo, ack, pairing, replay, revoca, cascade e cron\n');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
