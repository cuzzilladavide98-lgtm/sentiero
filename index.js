const te = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(n = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

async function hash(value) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(String(value || '')))));
}

function originHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allow = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const accepted = !allow.length ? (origin || '*') : (allow.includes(origin) ? origin : 'null');
  return {
    'Access-Control-Allow-Origin': accepted,
    'Access-Control-Allow-Headers': 'authorization,content-type,x-sentiero-space,x-sentiero-device',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allow = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  return !allow.length || !origin || allow.includes(origin);
}

function reply(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...originHeaders(request, env) } });
}

async function bodyJson(request, max = 600000) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > max) throw Object.assign(new Error('too_large'), { status: 413 });
  const text = await request.text();
  if (text.length > max) throw Object.assign(new Error('too_large'), { status: 413 });
  try { return text ? JSON.parse(text) : {}; } catch (_) { throw Object.assign(new Error('bad_json'), { status: 400 }); }
}

async function authenticate(request, env) {
  const space = String(request.headers.get('X-Sentiero-Space') || '').slice(0, 100);
  const device = String(request.headers.get('X-Sentiero-Device') || '').slice(0, 100);
  const bearer = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!space || !device || !bearer) return null;
  const tokenHash = await hash(bearer);
  return env.DB.prepare('SELECT space_id,id,name,last_seen,revoked_at FROM devices WHERE space_id=? AND id=? AND token_hash=?')
    .bind(space, device, tokenHash).first();
}

function validPublicKey(k) {
  return k && typeof k === 'object' && k.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string';
}

async function createSpace(request, env) {
  const body = await bodyJson(request, 10000);
  const deviceId = String(body.deviceId || '').slice(0, 100);
  const name = String(body.name || 'Questo dispositivo').trim().slice(0, 500);
  if (!deviceId) return reply(request, env, { error: 'device_required' }, 400);
  const spaceId = randomToken(18), deviceToken = randomToken(32), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO spaces(id,created_at) VALUES(?,?)').bind(spaceId, now),
    env.DB.prepare('INSERT INTO devices(space_id,id,name,token_hash,created_at,last_seen) VALUES(?,?,?,?,?,?)')
      .bind(spaceId, deviceId, name, await hash(deviceToken), now, now)
  ]);
  return reply(request, env, { spaceId, deviceToken });
}

async function sync(request, env, auth) {
  const body = await bodyJson(request);
  const cursor = Math.max(0, Number(body.cursor) || 0);
  const ops = Array.isArray(body.ops) ? body.ops.slice(0, 200) : [];
  const writes = [];
  for (const op of ops) {
    if (!op || typeof op.opId !== 'string' || op.opId.length > 100 || typeof op.entity !== 'string' || op.entity.length > 80 ||
        typeof op.iv !== 'string' || op.iv.length > 80 || typeof op.data !== 'string' || op.data.length > 200000 ||
        op.deviceId !== auth.id || !Number.isSafeInteger(Number(op.seq))) continue;
    writes.push(env.DB.prepare('INSERT OR IGNORE INTO operations(space_id,op_id,entity_hash,device_id,seq,iv,payload,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(auth.space_id, op.opId, op.entity, auth.id, Number(op.seq), op.iv, op.data, Date.now()));
  }
  writes.push(env.DB.prepare('UPDATE devices SET last_seen=? WHERE space_id=? AND id=?').bind(Date.now(), auth.space_id, auth.id));
  if (writes.length) await env.DB.batch(writes);
  const rows = await env.DB.prepare('SELECT row_id,op_id,device_id,seq,iv,payload FROM operations WHERE space_id=? AND row_id>? ORDER BY row_id LIMIT 500')
    .bind(auth.space_id, cursor).all();
  const list = (rows.results || []).map(r => ({ cursor: r.row_id, opId: r.op_id, deviceId: r.device_id, seq: r.seq, iv: r.iv, data: r.payload }));
  const nextCursor = list.length ? list[list.length - 1].cursor : cursor;
  return reply(request, env, { cursor: nextCursor, ops: list });
}

async function deleteSpace(request, env, auth) {
  await env.DB.prepare('DELETE FROM spaces WHERE id=?').bind(auth.space_id).run();
  return reply(request, env, { ok: true });
}

async function devices(request, env, auth, path) {
  if (request.method === 'GET' && path === '/v1/devices') {
    const r = await env.DB.prepare('SELECT id,name,created_at,last_seen,revoked_at FROM devices WHERE space_id=? ORDER BY created_at').bind(auth.space_id).all();
    return reply(request, env, { devices: r.results || [] });
  }
  const m = path.match(/^\/v1\/devices\/([^/]+)$/); if (!m) return null;
  const id = decodeURIComponent(m[1]).slice(0, 100);
  if (request.method === 'PATCH') {
    const b = await bodyJson(request, 5000), name = String(b.name || '').trim().slice(0, 500); if (!name) return reply(request, env, { error: 'name_required' }, 400);
    await env.DB.prepare('UPDATE devices SET name=? WHERE space_id=? AND id=?').bind(name, auth.space_id, id).run();
    return reply(request, env, { ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('UPDATE devices SET revoked_at=? WHERE space_id=? AND id=?').bind(Date.now(), auth.space_id, id).run();
    return reply(request, env, { ok: true });
  }
  return null;
}

async function createPair(request, env, auth) {
  const b = await bodyJson(request, 12000); if (!validPublicKey(b.publicKey)) return reply(request, env, { error: 'public_key' }, 400);
  const token = randomToken(24), displayCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000000).padStart(8, '0');
  const now = Date.now(), expiresAt = now + 10 * 60 * 1000;
  await env.DB.prepare('INSERT INTO pairs(token_hash,display_code,space_id,inviter_device,inviter_public_key,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(await hash(token), displayCode, auth.space_id, auth.id, JSON.stringify(b.publicKey), 'open', now, expiresAt).run();
  return reply(request, env, { token, code: displayCode, expiresAt });
}

async function redeemPair(request, env) {
  const b = await bodyJson(request, 20000), token = String(b.token || '');
  if (!token || !b.deviceId || !validPublicKey(b.publicKey)) return reply(request, env, { error: 'pair_payload' }, 400);
  const row = await env.DB.prepare('SELECT * FROM pairs WHERE token_hash=?').bind(await hash(token)).first();
  if (!row || row.expires_at < Date.now() || row.status !== 'open') return reply(request, env, { error: 'pair_expired' }, 410);
  const claim = randomToken(24), deviceToken = randomToken(32);
  const result = await env.DB.prepare("UPDATE pairs SET consumer_device=?,consumer_name=?,consumer_public_key=?,consumer_token_hash=?,claim_hash=?,status='pending-confirmation' WHERE token_hash=? AND status='open'")
    .bind(String(b.deviceId).slice(0, 100), String(b.name || 'Nuovo dispositivo').slice(0, 60), JSON.stringify(b.publicKey), await hash(deviceToken), await hash(claim), await hash(token)).run();
  if (!result.meta || result.meta.changes !== 1) return reply(request, env, { error: 'pair_used' }, 409);
  return reply(request, env, { claim, deviceToken, expiresAt: row.expires_at });
}

async function pairRoute(request, env, auth, path) {
  const m = path.match(/^\/v1\/pairs\/([^/]+)(?:\/(approve|claim))?$/); if (!m) return null;
  const token = decodeURIComponent(m[1]), action = m[2] || '', tokenHash = await hash(token);
  const row = await env.DB.prepare('SELECT * FROM pairs WHERE token_hash=?').bind(tokenHash).first();
  if (!row || row.expires_at < Date.now()) return reply(request, env, { error: 'pair_expired' }, 410);
  if (action === 'claim' && request.method === 'POST') {
    const b = await bodyJson(request, 5000);
    if (await hash(b.claim) !== row.claim_hash) return reply(request, env, { error: 'claim_denied' }, 403);
    /* Il redeem resta monouso; il possessore dello stesso claim può però
       recuperare la medesima busta se la prima risposta si perde in rete. */
    if (row.status === 'used' && row.used_at) return reply(request, env, { status: 'approved', iv: row.wrapped_iv, data: row.wrapped_payload, replay: true });
    if (row.status !== 'approved' || row.used_at) return reply(request, env, { status: row.status });
    const claimed = await env.DB.prepare("UPDATE pairs SET used_at=?,status='used' WHERE token_hash=? AND status='approved' AND used_at IS NULL")
      .bind(Date.now(), tokenHash).run();
    if (!claimed.meta || claimed.meta.changes !== 1) return reply(request, env, { error: 'pair_used' }, 409);
    return reply(request, env, { status: 'approved', iv: row.wrapped_iv, data: row.wrapped_payload });
  }
  if (!auth || auth.space_id !== row.space_id || auth.id !== row.inviter_device) return reply(request, env, { error: 'forbidden' }, 403);
  if (!action && request.method === 'GET') return reply(request, env, {
    status: row.status, code: row.display_code, name: row.consumer_name || '', deviceId: row.consumer_device || '',
    publicKey: row.consumer_public_key ? JSON.parse(row.consumer_public_key) : null, expiresAt: row.expires_at
  });
  if (action === 'approve' && request.method === 'POST') {
    if (row.status !== 'pending-confirmation' || !row.consumer_device || !row.consumer_token_hash) return reply(request, env, { error: 'pair_state' }, 409);
    const b = await bodyJson(request, 220000); if (!b.iv || !b.data) return reply(request, env, { error: 'wrapped_key' }, 400);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO devices(space_id,id,name,token_hash,created_at,last_seen) VALUES(?,?,?,?,?,?)')
        .bind(row.space_id, row.consumer_device, row.consumer_name || 'Nuovo dispositivo', row.consumer_token_hash, now, now),
      env.DB.prepare("UPDATE pairs SET wrapped_iv=?,wrapped_payload=?,status='approved' WHERE token_hash=?")
        .bind(String(b.iv).slice(0, 100), String(b.data).slice(0, 200000), tokenHash)
    ]);
    return reply(request, env, { ok: true });
  }
  return null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: originHeaders(request, env) });
    const url = new URL(request.url), path = url.pathname;
    try {
      if (!originAllowed(request, env)) return reply(request, env, { error: 'origin_forbidden' }, 403);
      if (path === '/health') return reply(request, env, { ok: true, service: 'sentiero-sync', schema: 2 });
      if (path === '/v1/spaces' && request.method === 'POST') return createSpace(request, env);
      if (path === '/v1/pairs/redeem' && request.method === 'POST') return redeemPair(request, env);
      if (/^\/v1\/pairs\/[^/]+\/claim$/.test(path)) return pairRoute(request, env, null, path);
      const auth = await authenticate(request, env); if (!auth) return reply(request, env, { error: 'unauthorized' }, 401);
      if (auth.revoked_at) return reply(request, env, { error: 'device_revoked' }, 403);
      if (path === '/v1/sync' && request.method === 'POST') return sync(request, env, auth);
      if (path === '/v1/spaces/current' && request.method === 'DELETE') return deleteSpace(request, env, auth);
      if (path === '/v1/pairs' && request.method === 'POST') return createPair(request, env, auth);
      const dr = await devices(request, env, auth, path); if (dr) return dr;
      const pr = await pairRoute(request, env, auth, path); if (pr) return pr;
      return reply(request, env, { error: 'not_found' }, 404);
    } catch (e) {
      return reply(request, env, { error: String(e && e.message || 'server_error').slice(0, 80) }, Number(e && e.status) || 500);
    }
  }
};
