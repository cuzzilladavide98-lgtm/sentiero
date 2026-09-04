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
const expected = { build: 'v60S.274.5', generation: 274005, cache: 'sentiero-v60s-274-5' };
const staleCaches = ['sentiero-v60s-274-4', 'sentiero-preview-iphone-rc2-g27400402'];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.wav': 'audio/wav' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.removeListener('exit', done); resolve(child.exitCode !== null); }, timeoutMs);
    child.once('exit', done);
  });
}

async function stopChrome(cdp, child) {
  if (cdp) {
    try { await Promise.race([cdp.send('Browser.close'), sleep(1500)]); } catch (_) {}
    await cdp.close();
  }
  if (await waitForExit(child, 2000)) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid)) {
    const killed = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' });
    if (killed.error) throw killed.error;
  } else {
    try { child.kill('SIGKILL'); } catch (_) {}
  }
  if (!await waitForExit(child, 3000)) throw new Error(`Chrome PID ${child.pid} non terminato dal teardown`);
}

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/seed-old-cache') {
      const body = Buffer.from(`<!doctype html><meta charset="utf-8"><script>Promise.all(${JSON.stringify(staleCaches)}.map(name=>caches.open(name))).then(()=>location.replace('/index.html?sw-handshake=${Date.now()}'))</script>`);
      response.writeHead(200, { 'Content-Type': mime['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-store' }); response.end(body); return;
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
  close() {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, 1000);
      this.socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
      try { this.socket.close(); } catch (_) { clearTimeout(timer); resolve(); }
    });
  }
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
    const evaluated = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (evaluated?.result?.value) return evaluated.result.value;
    await sleep(100);
  }
  throw new Error(`timeout readiness: ${label}`);
}

async function startProbe(cdp) {
  await waitValue(cdp, `location.pathname.endsWith('/index.html') && typeof window.sentieroServiceWorkerHandshake === 'function'`, 20000, 'app e handshake production');
  await cdp.send('Runtime.evaluate', { expression: `(async()=>{window.__sentieroSWProbe={done:false};try{const result=await window.sentieroServiceWorkerHandshake(10000);const cacheKeys=await caches.keys();window.__sentieroSWProbe={done:true,result,cacheKeys};}catch(error){window.__sentieroSWProbe={done:true,error:String(error&&error.stack||error)};}})()` });
  return waitValue(cdp, 'window.__sentieroSWProbe?.done && window.__sentieroSWProbe', 15000, 'risposta handshake');
}

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sentiero-sw-handshake-'));
const debugPort = await getFreePort();
const appPort = server.address().port;
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `http://127.0.0.1:${appPort}/seed-old-cache`], { windowsHide: true });
let stderr = '', cdp, failure = null;
child.stderr.on('data', chunk => { stderr += chunk; });
try {
  const target = await getPageTarget(debugPort); cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  let probe = await startProbe(cdp);
  if (!probe.result?.controller) {
    await cdp.send('Page.reload', { ignoreCache: true });
    probe = await startProbe(cdp);
  }
  assert.equal(probe.error, undefined, probe.error);
  assert.equal(probe.result.controller, true, 'navigator.serviceWorker.controller assente dopo stabilizzazione');
  assert.equal(probe.result.htmlBuild, expected.build);
  assert.equal(probe.result.htmlGeneration, expected.generation);
  assert.equal(probe.result.build, expected.build);
  assert.equal(probe.result.generation, expected.generation);
  assert.equal(probe.result.gen, expected.generation);
  assert.equal(Number.isFinite(probe.result.generation), true);
  assert.notEqual(probe.result.generation, 0);
  assert.equal(probe.result.cache, expected.cache);
  assert.equal(probe.result.coherent, true, 'identita HTML/SW incoerente');
  assert.equal(probe.cacheKeys.includes(expected.cache), true, 'cache RC2 corrente assente');
  for (const stale of staleCaches) assert.equal(probe.cacheKeys.includes(stale), false, `cache precedente non eliminata: ${stale}`);
  console.log(JSON.stringify(probe, null, 2));
  console.log('PASS handshake SW browser reale: controller, release, generazione numerica non-zero e cache coerenti');
} catch (error) {
  failure = new Error(`${error.message}${stderr ? ' | Chrome: ' + stderr.slice(-500) : ''}`);
} finally {
  let browserStopped = false;
  try { await stopChrome(cdp, child); browserStopped = true; } catch (error) { if (!failure) failure = error; }
  if (browserStopped) {
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    catch (error) { if (!failure) failure = new Error(`profilo temporaneo non rimosso: ${error.message}`); }
  }
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
if (failure) throw failure;
