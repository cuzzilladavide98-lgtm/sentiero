import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = [process.argv[2], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(file => { try { return statSync(file).isFile(); } catch (_) { return false; } });
if (!chrome) throw new Error('Chrome non trovato');

const sourceTimes = {
  yesterday: '2026-09-03T12:25:00.000Z',
  today: '2026-09-04T08:26:00.000Z'
};
const clocks = {
  yesterday: '2026-09-03T08:30:00.000Z',
  today: '2026-09-04T08:30:00.000Z'
};
const stories = [
  ['bilancio', 'Il Parlamento approva la legge di bilancio e il piano per l’economia', 'Il Parlamento ha approvato nuove misure per famiglie, imprese e finanza pubblica.', 'economy', 'primary'],
  ['salute', 'L’OMS aggiorna il piano sanitario contro la malattia respiratoria', 'L’Organizzazione mondiale della sanità ha aggiornato la risposta sanitaria alla malattia respiratoria.', 'health', 'primary'],
  ['tregua', 'Guerra: firmato un accordo di cessate il fuoco con verifica internazionale', 'Le parti hanno firmato un accordo di pace; osservatori internazionali verificheranno la tregua.', 'world', 'independent'],
  ['clima', 'Alluvione e clima: evacuate migliaia di persone dopo le nuove piogge', 'Le autorità hanno evacuato migliaia di persone e disposto nuovi interventi urgenti.', 'climate', 'primary'],
  ['inchiesta', 'La Corte apre un’indagine sui contratti pubblici del governo', 'La Corte ha aperto un’indagine e acquisito nuovi documenti ufficiali sui contratti.', 'institutions', 'independent']
];

function packet(day, withEdition) {
  const time = sourceTimes[day];
  const dayKey = time.slice(0, 10);
  const items = stories.map(([id, title, summary, area, perspective]) => ({
    id: `${id}-${dayKey}`, title, summary, url: `https://${id}.example.test/${dayKey}`, published: time,
    source: `Fonte ${id}`, sourceId: `fonte-${id}`,
    sourceMeta: { perspective, area, language: 'it', tier: perspective === 'primary' ? 'A' : 'B', domain: `${id}.example.test` },
    provenance: { evidenceId: `${id}-${dayKey}`, sourceId: `fonte-${id}`, sourceDomain: `${id}.example.test`, canonicalUrl: `https://${id}.example.test/${dayKey}`, publishedAt: time, retrievedAt: time, contentFingerprint: `${id}-${dayKey}` }
  }));
  const result = { v: 1, kind: 'sentiero-editorial-snapshot', generatedAt: time, sourcesUpdatedAt: time, dayKey, items };
  if (withEdition) result.edition = {
    language: 'it', dayKey, title: 'Il Giornale di Sentiero', deck: 'Le storie che cambiano davvero il quadro.', generatedAt: time, sourceUpdatedAt: time, sourcesUpdatedAt: time,
    articles: items.map((item, index) => ({ section: index === 0 ? 'Italia' : 'Il quadro', title: item.title, kicker: '', claims: [{ text: item.summary, sourceIds: [item.id] }], storyIds: [`story-${item.id}`], sourceIds: [item.id], importance: 90 - index, deltaType: 'new', deltaFromYesterday: 'Nuova oggi.', presentation: index === 0 ? 'lead' : index < 3 ? 'major' : 'brief' })), corrections: []
  };
  return result;
}

let serverMode = 'yesterday-packaged';
let newsRequests = 0;
function selectedPacket() {
  if (serverMode === 'today-packaged') return packet('today', true);
  if (serverMode === 'today-worker') return packet('today', false);
  if (serverMode === 'yesterday-worker') return packet('yesterday', false);
  return packet('yesterday', true);
}

const harness = `<!doctype html><meta charset="utf-8"><body><script>
const query=new URLSearchParams(location.search),NativeDate=Date;let fixed=NativeDate.parse(query.get('clock'));
class FixedDate extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
window.Date=FixedDate;window.__setFreshClock=value=>{fixed=NativeDate.parse(value);};
if(query.get('offline')==='1')try{Object.defineProperty(Navigator.prototype,'onLine',{configurable:true,get:()=>false});}catch(_){}
window.__freshErrors=[];addEventListener('error',event=>__freshErrors.push(String(event.message||event.error||'error')));addEventListener('unhandledrejection',event=>__freshErrors.push(String(event.reason&&event.reason.message||event.reason||'rejection')));
(async()=>{const out=document.createElement('pre');out.id='freshness-result';document.body.append(out);try{
 const day=await import('/sentiero-day.mjs?freshness=1'),state={quests:[],scheduled:[],diary:[],checks:{},patti:[],paroleGiorno:{}};
 const aiMode=query.get('ai')||'',abortAI=!!aiMode;
 const context={state:()=>state,save:()=>{},editQuest:()=>{},newsEndpoint:()=>query.get('worker')==='1'?location.origin+'/api':'',canGenerate:()=>abortAI,ai:async request=>aiMode==='close'?new Promise(resolve=>{if(request.signal?.aborted)resolve({err:'annullata'});else request.signal?.addEventListener('abort',()=>resolve({err:'annullata'}),{once:true});}):({err:'annullata'})};
 await day.open(context);
 if(aiMode==='close'){
   const ready=performance.now()+8000;while(window.__sentieroNewsDiag?.compose!=='fallback-ready'&&performance.now()<ready)await new Promise(resolve=>setTimeout(resolve,40));
   day.close();await day.refreshNews(false);
 }else await day.refreshNews(false);
 if(query.get('manual')==='1'){
   await fetch('/__switch-today',{cache:'no-store'});document.querySelector('.news-refresh').click();
   const limit=performance.now()+8000;while((!window.__sentieroNewsDiag||!String(window.__sentieroNewsDiag.sourcesUpdatedAt||'').startsWith('2026-09-04')||window.__sentieroNewsDiag.editionDay!=='2026-09-04'||window.__sentieroNewsDiag.compose!=='packaged')&&performance.now()<limit)await new Promise(resolve=>setTimeout(resolve,40));
 }
 if(query.get('foreground')==='1'){
   await fetch('/__switch-today',{cache:'no-store'});window.__setFreshClock('${clocks.today}');dispatchEvent(new PageTransitionEvent('pageshow'));
   const limit=performance.now()+8000;while((!window.__sentieroNewsDiag||!String(window.__sentieroNewsDiag.sourcesUpdatedAt||'').startsWith('2026-09-04')||window.__sentieroNewsDiag.editionDay!=='2026-09-04'||window.__sentieroNewsDiag.compose!=='packaged')&&performance.now()<limit)await new Promise(resolve=>setTimeout(resolve,40));
 }
 const d=window.__sentieroNewsDiag||{},meta=document.querySelector('.edition-meta')?.textContent||'',titles=[...document.querySelectorAll('.news-article h3')].map(node=>node.textContent),end=document.querySelector('.edition-end')?.textContent||'';
 window.__freshResult={diag:d,meta,titles,end,articles:titles.length,errors:window.__freshErrors};out.textContent=JSON.stringify(window.__freshResult);day.close();
}catch(error){window.__freshResult={fatal:String(error&&error.stack||error),errors:window.__freshErrors};out.textContent=JSON.stringify(window.__freshResult);}})();
</script></body>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/__switch-today') { serverMode = 'today-packaged'; response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return; }
  if (url.pathname === '/harness') { const body = Buffer.from(harness); response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); response.end(body); return; }
  if (url.pathname === '/sentiero-day.mjs') { const body = readFileSync(path.join(root, 'sentiero-day.mjs')); response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); response.end(body); return; }
  if (url.pathname.endsWith('parole-giorno-v1.json')) { const body = readFileSync(path.join(root, 'assets', 'parole-giorno-v1.json')); response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); response.end(body); return; }
  if (url.pathname === '/api/v1/day/news' || url.pathname.endsWith('/latest.json')) {
    newsRequests++;
    if (serverMode === 'offline') { response.writeHead(503, { 'Cache-Control': 'no-store' }); response.end(); return; }
    const body = Buffer.from(JSON.stringify(selectedPacket())); response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); response.end(body); return;
  }
  response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end();
});

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer(); socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
  });
}

async function pageTarget(port) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const page = targets.find(target => target.type === 'page'); if (page?.webSocketDebuggerUrl) return page; } catch (_) {}
    await sleep(100);
  }
  throw new Error('target Chrome DevTools assente');
}

class CDP {
  constructor(socket) { this.socket = socket; this.id = 0; this.pending = new Map(); socket.addEventListener('message', event => this.onMessage(event)); }
  onMessage(event) { let message; try { message = JSON.parse(String(event.data)); } catch (_) { return; } if (!message.id || !this.pending.has(message.id)) return; const job = this.pending.get(message.id); this.pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() { try { this.socket.close(); } catch (_) {} }
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url), timer = setTimeout(() => reject(new Error('timeout CDP')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(new CDP(socket)); });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('connessione CDP fallita')); });
  });
}

async function waitResult(cdp) {
  const started = globalThis.Date.now();
  while (globalThis.Date.now() - started < 20000) {
    const evaluated = await cdp.send('Runtime.evaluate', { expression: 'window.__freshResult || null', returnByValue: true });
    if (evaluated?.result?.value) return evaluated.result.value;
    await sleep(80);
  }
  throw new Error('timeout risultato freshness');
}

async function runChrome(profile, url) {
  const debugPort = await getFreePort();
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', '--force-time-zone-for-testing=Europe/Rome', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, url], { windowsHide: true });
  let cdp, failure, result;
  try {
    const target = await pageTarget(debugPort); cdp = await connectCdp(target.webSocketDebuggerUrl); await cdp.send('Runtime.enable'); result = await waitResult(cdp);
  } catch (error) { failure = error; }
  try { if (cdp) await Promise.race([cdp.send('Browser.close'), sleep(1000)]); } catch (_) {}
  if (cdp) cdp.close();
  const exited = await Promise.race([new Promise(resolve => child.once('exit', () => resolve(true))), sleep(1800).then(() => child.exitCode !== null)]);
  if (!exited) { if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); else child.kill('SIGKILL'); await sleep(300); }
  if (failure) throw failure;
  return result;
}

function assertClean(result, label) {
  assert.equal(result.fatal, undefined, label); assert.deepEqual(result.errors, [], label); assert.ok(result.articles >= 1, label); return result;
}

const profiles = [];
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, url = (query = '') => `${origin}/harness?${query}`;

  const newDayProfile = mkdtempSync(path.join(os.tmpdir(), 'sentiero-freshness-newday-')); profiles.push(newDayProfile);
  serverMode = 'yesterday-packaged'; await runChrome(newDayProfile, url(`clock=${encodeURIComponent(clocks.yesterday)}`));
  serverMode = 'today-packaged'; newsRequests = 0; const newDay = assertClean(await runChrome(newDayProfile, url(`clock=${encodeURIComponent(clocks.today)}`)), 'new day');
  assert.match(newDay.diag.sourcesUpdatedAt, /^2026-09-04/); assert.equal(newDay.diag.editionDay, '2026-09-04'); assert.equal(newDay.diag.stale, false); assert.ok(!newDay.meta.includes('03 set'));
  assert.equal(newsRequests, 1, 'open + refresh concorrente devono condividere una sola acquisizione');

  const abortProfile = mkdtempSync(path.join(os.tmpdir(), 'sentiero-freshness-abort-')); profiles.push(abortProfile);
  serverMode = 'today-worker'; const aborted = assertClean(await runChrome(abortProfile, url(`clock=${encodeURIComponent(clocks.today)}&worker=1&ai=abort`)), 'composition failure');
  assert.match(aborted.diag.sourcesUpdatedAt, /^2026-09-04/); assert.match(aborted.diag.compose, /^fallback:annullata$/); assert.equal(aborted.diag.stale, false); assert.equal(aborted.diag.origin, 'fallback');

  const offlineProfile = mkdtempSync(path.join(os.tmpdir(), 'sentiero-freshness-offline-')); profiles.push(offlineProfile);
  serverMode = 'yesterday-packaged'; await runChrome(offlineProfile, url(`clock=${encodeURIComponent(clocks.yesterday)}`));
  serverMode = 'offline'; const offline = assertClean(await runChrome(offlineProfile, url(`clock=${encodeURIComponent(clocks.today)}&offline=1`)), 'true offline');
  assert.match(offline.diag.sourcesUpdatedAt, /^2026-09-03/); assert.match(offline.diag.editionGeneratedAt, /^2026-09-03/); assert.equal(offline.diag.stale, true); assert.equal(offline.diag.origin, 'device-cache'); assert.match(offline.meta, /ultima edizione salvata/i);
  assert.equal(offline.end, 'Fine dell’ultima edizione disponibile.');

  const manualProfile = mkdtempSync(path.join(os.tmpdir(), 'sentiero-freshness-manual-')); profiles.push(manualProfile);
  serverMode = 'yesterday-packaged'; newsRequests = 0; const manual = assertClean(await runChrome(manualProfile, url(`clock=${encodeURIComponent(clocks.today)}&manual=1`)), 'manual refresh');
  assert.match(manual.diag.sourcesUpdatedAt, /^2026-09-04/); assert.equal(manual.diag.editionDay, '2026-09-04'); assert.equal(manual.diag.refreshReason, 'manual'); assert.equal(manual.diag.stale, false);
  assert.equal(newsRequests, 2, 'una acquisizione startup e una acquisizione manuale');

  const staleProfile = mkdtempSync(path.join(os.tmpdir(), 'sentiero-freshness-stale-')); profiles.push(staleProfile);
  serverMode = 'yesterday-worker'; const stale = assertClean(await runChrome(staleProfile, url(`clock=${encodeURIComponent(clocks.today)}&worker=1`)), 'no fake generatedAt');
  assert.match(stale.diag.sourcesUpdatedAt, /^2026-09-03/); assert.match(stale.diag.editionGeneratedAt, /^2026-09-03/); assert.equal(stale.diag.stale, true); assert.match(stale.meta, /ultima edizione/i);

  const closeProfile = mkdtempSync(path.join(os.tmpdir(), 'sentiero-freshness-close-')); profiles.push(closeProfile);
  serverMode = 'today-worker'; const closed = assertClean(await runChrome(closeProfile, url(`clock=${encodeURIComponent(clocks.today)}&worker=1&ai=close`)), 'room close abort');
  assert.match(closed.diag.sourcesUpdatedAt, /^2026-09-04/); assert.match(closed.diag.compose, /^fallback:annullata$/); assert.equal(closed.diag.abortReason, 'room-closed'); assert.equal(closed.diag.stale, false);

  const foregroundProfile = mkdtempSync(path.join(os.tmpdir(), 'sentiero-freshness-foreground-')); profiles.push(foregroundProfile);
  serverMode = 'yesterday-packaged'; newsRequests = 0; const foreground = assertClean(await runChrome(foregroundProfile, url(`clock=${encodeURIComponent(clocks.yesterday)}&foreground=1`)), 'foreground new day');
  assert.match(foreground.diag.sourcesUpdatedAt, /^2026-09-04/); assert.equal(foreground.diag.editionDay, '2026-09-04'); assert.equal(foreground.diag.stale, false); assert.equal(newsRequests, 2, 'startup ieri + pageshow oggi');

  console.log(JSON.stringify({ ok: true, newDay: newDay.diag, compositionFailure: aborted.diag, offline: offline.diag, manual: manual.diag, stale: stale.diag, roomClose: closed.diag, foreground: foreground.diag }));
} finally {
  await new Promise(resolve => { server.close(resolve); if (server.closeAllConnections) server.closeAllConnections(); setTimeout(resolve, 1000); });
  for (const profile of profiles) { try { rmSync(profile, { recursive: true, force: true }); } catch (_) {} }
}
