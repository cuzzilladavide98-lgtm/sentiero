import { NEWS_SOURCES } from './news-sources.js';

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

function configuredOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
}

function originHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allow = configuredOrigins(env);
  const accepted = allow.includes(origin) ? origin : 'null';
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
  return !!origin && configuredOrigins(env).includes(origin);
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

/* The newsroom receives only public, bounded RSS material.  There is no user
   identifier, Sentiero state or model key in this route.  Sources are fixed in
   code so the endpoint cannot be turned into an SSRF proxy. */
const DAY_FEEDS = NEWS_SOURCES;

function xmlText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(x?[0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10)); } catch (_) { return ' '; } })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[n.toLowerCase()]))
    .replace(/\s+/g, ' ').trim();
}

function tag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp('<(?:[a-z]+:)?' + name + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-z]+:)?' + name + '>', 'i'));
    if (match) return xmlText(match[1]);
  }
  return '';
}

function canonicalItemUrl(raw, source) {
  try {
    const url = new URL(xmlText(raw), source.url);
    const allowed = (source.linkDomains || [source.domain]).some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
    if (url.protocol !== 'https:' || !allowed) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_.+|fbclid|gclid|cmpid|ocid|at_.+)$/i.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch (_) { return ''; }
}

function itemLink(block, source) {
  const links = [...block.matchAll(/<link\b([^>]*)>/gi)];
  const preferred = links.find(match => /\brel=["']alternate["']/i.test(match[1])) || links.find(match => !/\brel=["'](?:self|enclosure)["']/i.test(match[1]));
  const href = preferred && preferred[1].match(/\bhref=["']([^"']+)["']/i);
  return canonicalItemUrl(href ? href[1] : tag(block, ['link', 'guid']), source);
}

const FEED_DATE_MONTHS = Object.freeze({
  gen: 'Jan', gennaio: 'January', feb: 'Feb', febbraio: 'February', mar: 'Mar', marzo: 'March', apr: 'Apr', aprile: 'April', mag: 'May', maggio: 'May', giu: 'Jun', giugno: 'June', lug: 'Jul', luglio: 'July', ago: 'Aug', agosto: 'August', set: 'Sep', sett: 'Sep', settembre: 'September', ott: 'Oct', ottobre: 'October', nov: 'Nov', novembre: 'November', dic: 'Dec', dicembre: 'December',
  ene: 'Jan', enero: 'January', abr: 'Apr', abril: 'April', mayo: 'May', jun: 'Jun', junio: 'June', jul: 'Jul', julio: 'July', sept: 'Sep', septiembre: 'September', oct: 'Oct', octubre: 'October', diciembre: 'December',
  janv: 'Jan', janvier: 'January', fev: 'Feb', fevr: 'Feb', fevrier: 'February', avr: 'Apr', avril: 'April', mai: 'May', juin: 'June', juil: 'Jul', juillet: 'July', aout: 'August', dec: 'Dec', decembre: 'December'
});

function validPublished(value) {
  const folded = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  const normalized = folded
    .replace(/^(?:lun|mar|mer|gio|ven|sab|dom|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\s*,?\s*/i, '')
    .replace(/\b([a-z]{3,10})\b/gi, word => FEED_DATE_MONTHS[word.toLowerCase()] || word);
  const time = Date.parse(normalized);
  return Number.isFinite(time) && time > Date.UTC(2000, 0, 1) && time < Date.now() + 86400000 ? new Date(time).toISOString() : '';
}

function parseFeed(xml, source, now = Date.now()) {
  const input = String(xml || '').slice(0, 1200000), blocks = input.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  const output = [], retrievedAt = new Date(now).toISOString();
  for (const block of blocks.slice(0, 40)) {
    const title = tag(block, ['title']).slice(0, 240), url = itemLink(block, source);
    const summary = tag(block, ['description', 'summary', 'encoded', 'content']).slice(0, 1200);
    const published = validPublished(tag(block, ['pubDate', 'published', 'updated', 'date']));
    if (!title || !url || !published) continue;
    const age = now - Date.parse(published); if (age < -3600000 || age > 7 * 86400000) continue;
    const evidenceId = storyId(source.sourceId, url);
    output.push({ title, url, summary, published, source: source.name, sourceCode: source.sourceId, sourceMeta: source, provenance: {
      evidenceId, sourceId: source.sourceId, sourceDomain: source.domain, feedUrl: source.url, canonicalUrl: url,
      publishedAt: published, retrievedAt, contentFingerprint: storyId('fp', normalizedStory(title + ' ' + summary))
    } });
  }
  return output;
}

function normalizedStory(value) {
  return xmlText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9à-ÿ ]/g, ' ')
    .replace(/\b(?:il|lo|la|i|gli|le|un|uno|una|di|a|da|in|con|su|per|tra|fra|e|the|an|of|to|on|for|and|with|le|les|la|un|une|de|du|des|et|en|el|los|las|una|uno|del|y|con|von|der|die|das|und|mit)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function storyId(code, url) {
  let h = 2166136261; const text = code + '\u0000' + url;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return code + '-' + (h >>> 0).toString(36);
}

function dedupeNews(items) {
  const seenUrl = new Set(), seenTitle = new Set(), out = [];
  for (const item of items.sort((a, b) => Date.parse(b.published) - Date.parse(a.published))) {
    const u = item.url.replace(/[?#].*$/, ''), t = normalizedStory(item.title);
    if (!u || t.length < 12 || seenUrl.has(u) || seenTitle.has(t)) continue;
    seenUrl.add(u); seenTitle.add(t);
    out.push({ id: storyId(item.sourceCode, u), title: item.title, summary: item.summary, url: item.url, published: item.published, source: item.source, sourceId: item.sourceCode, sourceMeta: item.sourceMeta, provenance: item.provenance });
    if (out.length >= 96) break;
  }
  return out;
}

async function fetchWithDeadline(url, milliseconds) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), milliseconds);
  try { return await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9' } }); }
  finally { clearTimeout(timer); }
}

async function boundedText(response, maximum = 1200000) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maximum) throw new Error('feed_too_large');
  if (!response.body || !response.body.getReader) {
    const text = await response.text();
    if (text.length > maximum) throw new Error('feed_too_large');
    return text;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder(), chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximum) throw new Error('feed_too_large');
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally { try { reader.releaseLock(); } catch (_) {} }
}

async function buildNewsPayload() {
  const settled = await Promise.allSettled(DAY_FEEDS.map(async source => {
    const response = await fetchWithDeadline(source.url, 7000);
    if (!response.ok) throw new Error(source.sourceId + ':' + response.status);
    const text = await boundedText(response, 700000);
    return { source, items: parseFeed(text, source).slice(0, source.maxItems || 7) };
  }));
  const items = dedupeNews(settled.flatMap(result => result.status === 'fulfilled' ? result.value.items : []));
  const usedSources = new Map(items.map(item => [item.sourceId, item.sourceMeta]));
  const countBy = field => Object.fromEntries([...usedSources.values()].reduce((map, source) => map.set(source[field], (map.get(source[field]) || 0) + 1), new Map()));
  return {
    v: 2,
    generatedAt: new Date().toISOString(),
    sourceCount: usedSources.size,
    registrySize: DAY_FEEDS.length,
    registryVersion: 3,
    failures: settled.filter(result => result.status === 'rejected').length,
    perspectives: countBy('perspective'), languages: countBy('language'),
    sources: settled.map((result, index) => ({ sourceId: DAY_FEEDS[index].sourceId, ok: result.status === 'fulfilled', items: result.status === 'fulfilled' ? result.value.items.length : 0 })),
    items,
    policy: { finite: true, maxItems: 96, personalData: false, paidProvider: false, userSuppliedUrls: false }
  };
}

async function dayNews(request, env, ctx) {
  const url = new URL(request.url), requestedSlot = String(url.searchParams.get('slot') || '');
  const slot = /^\d{4}-\d{2}-\d{2}-(?:mattino|giorno)$/.test(requestedSlot) ? requestedSlot : 'current';
  const cacheUrl = new URL('/v1/day/news', url.origin); cacheUrl.searchParams.set('slot', slot);
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  if (cache) { const hit = await cache.match(cacheUrl.toString()); if (hit) return new Response(hit.body, hit); }
  const payload = await buildNewsPayload();
  const response = reply(request, env, payload, payload.items.length ? 200 : 503);
  response.headers.set('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600');
  if (cache && response.ok) {
    const write = cache.put(cacheUrl.toString(), response.clone()).catch(error => console.warn(JSON.stringify({ event: 'news_cache_put_failed', message: String(error && error.message || error) })));
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write); else await write;
  }
  return response;
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
  return k && typeof k === 'object' && k.kty === 'EC' && k.crv === 'P-256' &&
    typeof k.x === 'string' && /^[A-Za-z0-9_-]{40,50}$/.test(k.x) &&
    typeof k.y === 'string' && /^[A-Za-z0-9_-]{40,50}$/.test(k.y);
}

function validDeviceId(value) { return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,100}$/.test(value); }
function validProtectedName(value) { return typeof value === 'string' && /^v2\.[A-Za-z0-9+/=]{16,80}\.[A-Za-z0-9+/=]{16,400}$/.test(value); }

async function createSpace(request, env) {
  const body = await bodyJson(request, 10000);
  const deviceId = body.deviceId, name = body.name;
  if (!validDeviceId(deviceId)) return reply(request, env, { error: 'device_required' }, 400);
  if (!validProtectedName(name)) return reply(request, env, { error: 'protected_name_required' }, 400);
  const spaceId = randomToken(18), deviceToken = randomToken(32), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO spaces(id,created_at) VALUES(?,?)').bind(spaceId, now),
    env.DB.prepare('INSERT INTO devices(space_id,id,name,token_hash,created_at,last_seen) VALUES(?,?,?,?,?,?)')
      .bind(spaceId, deviceId, name, await hash(deviceToken), now, now)
  ]);
  return reply(request, env, { spaceId, deviceToken });
}

async function sync(request, env, auth) {
  const body = await bodyJson(request, 2000000);
  if (Number(body.protocol) !== 3) return reply(request, env, { error: 'client_upgrade_required' }, 426);
  const rawCursor = Number(body.cursor), cursor = Number.isSafeInteger(rawCursor) && rawCursor >= 0 ? rawCursor : 0;
  if (!Array.isArray(body.ops)) return reply(request, env, { error: 'ops_required' }, 400);
  if (body.ops.length > 200) return reply(request, env, { error: 'too_many_ops' }, 413);
  const ops = body.ops;
  const writes = [];
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index], seq = Number(op && op.seq);
    if (!op || typeof op.opId !== 'string' || !/^[A-Za-z0-9._:-]{3,100}$/.test(op.opId) ||
        typeof op.entity !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(op.entity) ||
        typeof op.iv !== 'string' || !/^[A-Za-z0-9+/=]{16,80}$/.test(op.iv) ||
        typeof op.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(op.data) || op.data.length > 800000 ||
        op.deviceId !== auth.id || !Number.isSafeInteger(seq) || seq < 1) {
      return reply(request, env, { error: 'invalid_op', index }, 400);
    }
    writes.push(env.DB.prepare('INSERT OR IGNORE INTO operations(space_id,op_id,entity_hash,device_id,seq,iv,payload,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(auth.space_id, op.opId, op.entity, auth.id, seq, op.iv, op.data, Date.now()));
  }
  writes.push(env.DB.prepare('UPDATE devices SET last_seen=? WHERE space_id=? AND id=?').bind(Date.now(), auth.space_id, auth.id));
  if (writes.length) await env.DB.batch(writes);
  const rows = await env.DB.prepare('SELECT row_id,op_id,device_id,seq,iv,payload FROM operations WHERE space_id=? AND row_id>? ORDER BY row_id LIMIT 101')
    .bind(auth.space_id, cursor).all();
  const candidates = rows.results || [], list = [];
  let responseChars = 0;
  for (const r of candidates) {
    const size = String(r.payload || '').length + 300;
    if (list.length >= 100 || (list.length && responseChars + size > 1500000)) break;
    list.push({ cursor: r.row_id, opId: r.op_id, deviceId: r.device_id, seq: r.seq, iv: r.iv, data: r.payload });
    responseChars += size;
  }
  const nextCursor = list.length ? list[list.length - 1].cursor : cursor;
  return reply(request, env, { cursor: nextCursor, ops: list, acked: ops.map(op => op.opId), hasMore: candidates.length > list.length });
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
    const b = await bodyJson(request, 5000), name = b.name;
    if (!validProtectedName(name)) return reply(request, env, { error: 'protected_name_required' }, 400);
    const result = await env.DB.prepare('UPDATE devices SET name=? WHERE space_id=? AND id=?').bind(name, auth.space_id, id).run();
    if (!result.meta || result.meta.changes !== 1) return reply(request, env, { error: 'device_not_found' }, 404);
    return reply(request, env, { ok: true });
  }
  if (request.method === 'DELETE') {
    const result = await env.DB.prepare('UPDATE devices SET revoked_at=? WHERE space_id=? AND id=?').bind(Date.now(), auth.space_id, id).run();
    if (!result.meta || result.meta.changes !== 1) return reply(request, env, { error: 'device_not_found' }, 404);
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
  if (!token || token.length > 200 || !validDeviceId(b.deviceId) || !validPublicKey(b.publicKey)) return reply(request, env, { error: 'pair_payload' }, 400);
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
    const b = await bodyJson(request, 5000);
    if (typeof b.iv !== 'string' || !/^[A-Za-z0-9+/=]{16,80}$/.test(b.iv) ||
        typeof b.data !== 'string' || !/^[A-Za-z0-9+/=]{32,4000}$/.test(b.data)) return reply(request, env, { error: 'wrapped_key' }, 400);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO devices(space_id,id,name,token_hash,created_at,last_seen) VALUES(?,?,?,?,?,?)')
        .bind(row.space_id, row.consumer_device, row.consumer_name || 'Nuovo dispositivo', row.consumer_token_hash, now, now),
      env.DB.prepare("UPDATE pairs SET wrapped_iv=?,wrapped_payload=?,status='approved' WHERE token_hash=?")
        .bind(b.iv, b.data, tokenHash)
    ]);
    return reply(request, env, { ok: true });
  }
  return null;
}

export { DAY_FEEDS, parseFeed, dedupeNews, normalizedStory, buildNewsPayload, boundedText };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    try {
      if (path === '/health' && request.method === 'GET') {
        if (url.searchParams.get('deep') === '1') {
          if (!originAllowed(request, env)) return reply(request, env, { error: 'origin_forbidden' }, 403);
          const probe = await env.DB.prepare('SELECT 1 AS ok').first();
          return reply(request, env, { ok: Number(probe && probe.ok) === 1, database: 'reachable', service: 'sentiero-sync', schema: 2, protocol: 3 });
        }
        return reply(request, env, { ok: true, service: 'sentiero-sync', schema: 2, protocol: 3 });
      }
      if (request.method === 'OPTIONS') {
        if (!originAllowed(request, env)) return reply(request, env, { error: 'origin_forbidden' }, 403);
        return new Response(null, { status: 204, headers: originHeaders(request, env) });
      }
      if (!originAllowed(request, env)) return reply(request, env, { error: 'origin_forbidden' }, 403);
      if (path === '/v1/day/news' && request.method === 'GET') return dayNews(request, env, ctx);
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
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(env.DB.prepare('DELETE FROM pairs WHERE expires_at<?').bind(Date.now() - 24 * 60 * 60 * 1000).run());
  }
};
