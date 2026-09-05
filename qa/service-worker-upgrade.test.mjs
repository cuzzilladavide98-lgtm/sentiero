import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = [process.argv[2], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');

const release = { build: 'v60S.275.0', version: 'v60S.275.0 · 2026-09-05', generation: 275000, cache: 'sentiero-v60s-275-0' };
const expectedArticles = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'giornale', 'latest.json'), 'utf8')).edition.articles.filter(article => Number(article.importance) >= 52).length;
const scenarios = [
  { id: 'v2744', build: 'v60S.274.4', generation: 274004, cache: 'sentiero-v60s-274-4' },
  { id: 'rc2', build: 'iphone-rc2', generation: 27400402, cache: 'sentiero-preview-iphone-rc2-g27400402' }
];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.wav': 'audio/wav' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function oldWorker(scenario) {
  const oldHtml = `<!doctype html><meta charset="utf-8"><title>OLD ${scenario.build}</title><body data-old-build="${scenario.build}">old shell</body>`;
  return `const CACHE=${JSON.stringify(scenario.cache)};const BUILD=${JSON.stringify(scenario.build)};const GENERATION=${scenario.generation};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>Promise.all([
  cache.put('./index.html',new Response(${JSON.stringify(oldHtml)},{headers:{'Content-Type':'text/html'}})),
  cache.put('./sentiero-day.mjs',new Response('export const old=true',{headers:{'Content-Type':'text/javascript'}})),
  cache.put('./assets/giornale/latest.json',new Response('{"old":true}',{headers:{'Content-Type':'application/json'}}))
])));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data&&event.data.q==='gen'&&event.ports&&event.ports[0])event.ports[0].postMessage({build:BUILD,preview:BUILD,generation:GENERATION,gen:GENERATION,cache:CACHE});});
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(caches.open(CACHE).then(cache=>cache.match('./index.html')).then(hit=>hit||fetch(event.request)));});`;
}

function seedPage(scenario) {
  return `<!doctype html><meta charset="utf-8"><title>upgrade seed</title><script>
window.__upgrade={ready:false};
(async()=>{try{
  const registration=await navigator.serviceWorker.register('/old-sw.js?kind=${scenario.id}',{scope:'/',updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('old controller timeout')),10000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});});
  const identity=await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('old identity timeout')),5000);channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data)};navigator.serviceWorker.controller.postMessage({q:'gen'},[channel.port2]);});
  window.__upgrade={ready:true,identity,cacheKeys:await caches.keys(),scriptURL:navigator.serviceWorker.controller.scriptURL};
}catch(error){window.__upgrade={ready:true,error:String(error&&error.stack||error)}}})();
</script>`;
}

let scenarioForRequest = scenarios[0];
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/upgrade-seed') {
      scenarioForRequest = scenarios.find(item => item.id === url.searchParams.get('kind')) || scenarios[0];
      const body = Buffer.from(seedPage(scenarioForRequest));
      response.writeHead(200, { 'Content-Type': mime['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' }); response.end(body); return;
    }
    if (url.pathname === '/old-sw.js') {
      const scenario = scenarios.find(item => item.id === url.searchParams.get('kind')) || scenarioForRequest;
      const body = Buffer.from(oldWorker(scenario));
      response.writeHead(200, { 'Content-Type': mime['.js'], 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' }); response.end(body); return;
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    const body = fs.readFileSync(file), extension = path.extname(file).toLowerCase();
    response.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' }); response.end(body);
  } catch (_) { response.writeHead(404); response.end(); }
});

function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer(); socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
  });
}

async function getPageTarget(port) {
  for (let i = 0; i < 150; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`), targets = await response.json();
      const page = targets.find(target => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('nessun target page via Chrome DevTools');
}

class CDP {
  constructor(socket) { this.socket = socket; this.id = 0; this.pending = new Map(); socket.addEventListener('message', event => this.onMessage(event)); }
  onMessage(event) { let message; try { message = JSON.parse(String(event.data)); } catch (_) { return; } if (!message.id || !this.pending.has(message.id)) return; const job = this.pending.get(message.id); this.pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() { if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve(); return new Promise(resolve => { const timer = setTimeout(resolve, 1000); this.socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true }); try { this.socket.close(); } catch (_) { clearTimeout(timer); resolve(); } }); }
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url), timer = setTimeout(() => reject(new Error('timeout connessione Chrome DevTools')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(new CDP(socket)); });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('errore connessione Chrome DevTools')); });
  });
}

async function waitValue(cdp, expression, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result?.result?.value) return result.result.value;
    await sleep(100);
  }
  throw new Error(`timeout readiness: ${label}`);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise(resolve => { const done = () => { clearTimeout(timer); resolve(true); }; const timer = setTimeout(() => { child.removeListener('exit', done); resolve(child.exitCode !== null); }, timeoutMs); child.once('exit', done); });
}

async function stopChrome(cdp, child) {
  if (cdp) { try { await Promise.race([cdp.send('Browser.close'), sleep(1500)]); } catch (_) {} await cdp.close(); }
  if (await waitForExit(child, 2000)) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid)) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (_) {} }
  if (!await waitForExit(child, 3000)) throw new Error(`Chrome PID ${child.pid} non terminato`);
}

async function runScenario(scenario, appPort) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sentiero-sw-upgrade-${scenario.id}-`));
  const debugPort = await getFreePort();
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `http://127.0.0.1:${appPort}/upgrade-seed?kind=${scenario.id}`], { windowsHide: true });
  let cdp, stderr = '', failure;
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const target = await getPageTarget(debugPort); cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    const old = await waitValue(cdp, 'window.__upgrade?.ready && window.__upgrade', 20000, `${scenario.id}: worker precedente`);
    assert.equal(old.error, undefined, old.error); assert.equal(old.identity.cache, scenario.cache); assert.equal(old.identity.generation, scenario.generation); assert.equal(old.cacheKeys.includes(scenario.cache), true);
    await cdp.send('Runtime.evaluate', { expression: `(async()=>{window.__finalRegistration={done:false};try{const registration=await navigator.serviceWorker.register('/sw.js?v=60.275.0',{scope:'/',updateViaCache:'none'});const limit=Date.now()+20000;while((!navigator.serviceWorker.controller||!navigator.serviceWorker.controller.scriptURL.includes('/sw.js'))&&Date.now()<limit)await new Promise(resolve=>setTimeout(resolve,100));window.__finalRegistration={done:true,scriptURL:navigator.serviceWorker.controller&&navigator.serviceWorker.controller.scriptURL};location.href='/index.html?upgrade=${scenario.id}';}catch(error){window.__finalRegistration={done:true,error:String(error&&error.stack||error)}}})()` });
    await waitValue(cdp, `location.pathname==='/index.html' && typeof window.sentieroServiceWorkerHandshake==='function'`, 25000, `${scenario.id}: runtime finale`);
    await cdp.send('Runtime.evaluate', { expression: `(async()=>{window.__releaseProbe={done:false};try{const handshake=await window.sentieroServiceWorkerHandshake(10000);await window.apriStanzaTerra();const limit=Date.now()+20000;while((!document.querySelector('.edition-front')||document.querySelectorAll('.news-article').length<1)&&Date.now()<limit)await new Promise(resolve=>setTimeout(resolve,100));window.__releaseProbe={done:true,handshake,version:APP_VERSION,oldShell:!!document.querySelector('[data-old-build]'),articles:document.querySelectorAll('.news-article').length,cacheKeys:await caches.keys(),meta:document.querySelector('.edition-meta')&&document.querySelector('.edition-meta').textContent};}catch(error){window.__releaseProbe={done:true,error:String(error&&error.stack||error)}}})()` });
    const probe = await waitValue(cdp, 'window.__releaseProbe?.done && window.__releaseProbe', 30000, `${scenario.id}: Giornale finale`);
    assert.equal(probe.error, undefined, probe.error); assert.equal(probe.handshake.controller, true); assert.equal(probe.handshake.coherent, true); assert.equal(probe.handshake.build, release.build); assert.equal(probe.handshake.generation, release.generation); assert.equal(probe.handshake.cache, release.cache); assert.equal(probe.version, release.version); assert.equal(probe.oldShell, false); assert.equal(probe.articles, expectedArticles, 'il runtime finale non preserva tutti gli articoli distribuiti'); assert.match(probe.meta || '', /fonti aggiornate/); assert.equal(probe.cacheKeys.includes(release.cache), true); assert.equal(probe.cacheKeys.includes(scenario.cache), false);
    console.log(`PASS upgrade ${scenario.build} -> ${release.build}: generation ${probe.handshake.generation}, ${probe.articles} articoli, cache precedente rimossa`);
  } catch (error) { failure = new Error(`${scenario.id}: ${error.message}${stderr ? ' | Chrome: ' + stderr.slice(-500) : ''}`); }
  finally {
    try { await stopChrome(cdp, child); } catch (error) { if (!failure) failure = error; }
    if (child.exitCode !== null) { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (error) { if (!failure) failure = error; } }
  }
  if (failure) throw failure;
}

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  for (const scenario of scenarios) await runScenario(scenario, server.address().port);
} finally {
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
