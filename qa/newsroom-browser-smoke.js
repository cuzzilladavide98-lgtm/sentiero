'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const chrome = [process.argv[2], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

function evidence(id, source, sourceId, domain, perspective, language) {
  const published = new Date().toISOString(), url = `https://${domain}/economia/${id}`;
  const italian = language === 'it';
  return {
    id, title: italian ? 'La BCE riduce i tassi di interesse di 0,25 punti' : 'ECB cuts interest rates by 0.25 percentage points',
    summary: italian ? 'La Banca centrale europea ha ridotto il tasso di riferimento di 0,25 punti percentuali.' : 'The European Central Bank reduced its reference interest rate by 0.25 percentage points.',
    url, published, source, sourceId,
    sourceMeta: { tier: perspective === 'primary' ? 'A' : 'B', type: perspective === 'primary' ? 'institution' : 'public-service', area: 'economy', role: 'decisione e verifica', reliability: 'alta', domain, language, perspective, ownership: perspective === 'primary' ? 'public' : 'independent', country: perspective === 'primary' ? 'EU' : 'GB', coverage: 'international', retrieval: 'rss', freshnessMinutes: 120, terms: 'public feed' },
    provenance: { evidenceId: id, sourceId, sourceDomain: domain, canonicalUrl: url, publishedAt: published, retrievedAt: published, contentFingerprint: `fp-${id}` }
  };
}

const payload = { v: 2, items: [
  evidence('ecb-browser', 'Banca centrale europea', 'ecb', 'ecb.europa.eu', 'primary', 'it'),
  evidence('bbc-browser', 'BBC News', 'bbc', 'bbc.com', 'independent', 'en')
] };

function harness(width, height) {
  return `<!doctype html><meta charset="utf-8"><iframe id="app" style="width:${width}px;height:${height}px;border:0" src="/index.html?newsroom=${Date.now()}"></iframe><pre id="smoke-result">pending</pre><script>
  window.__newsroomReady=false;window.__newsroomResult=null;
  const frame=document.getElementById('app'),out=document.getElementById('smoke-result');
  const finish=result=>{window.__newsroomResult=result;window.__newsroomReady=true;out.textContent=JSON.stringify(result);};
  frame.onload=()=>setTimeout(async()=>{try{const w=frame.contentWindow,d=frame.contentDocument;await w.apriStanzaTerra();
    const limit=Date.now()+10000;while(!d.querySelector('.edition-front')&&Date.now()<limit)await new Promise(ok=>setTimeout(ok,100));
    const front=d.querySelector('.edition-front'),articles=[...d.querySelectorAll('.news-article')],shell=d.querySelector('.giorno-shell'),lead=d.querySelector('.news-article.lead');
    finish({width:w.innerWidth,front:!!front,articles:articles.length,lead:!!lead,claims:d.querySelectorAll('.claim-sources a').length,sources:d.querySelectorAll('.news-sources a').length,end:d.querySelector('.edition-end')&&d.querySelector('.edition-end').textContent,deck:d.querySelector('.edition-head p')&&d.querySelector('.edition-head p').textContent,overflow:shell&&shell.scrollWidth-shell.clientWidth,bodyOverflow:d.documentElement.scrollWidth-w.innerWidth,errors:w.__newsErrors||[],rejections:w.__newsRejections||[],importance:lead&&Number(lead.dataset.importance),title:lead&&lead.querySelector('h3').textContent});
  }catch(error){finish({error:String(error&&error.stack||error)});}},500);</script>`;
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/harness') { const body = Buffer.from(harness(Number(url.searchParams.get('w')) || 375, Number(url.searchParams.get('h')) || 647)); res.writeHead(200, { 'Content-Type': mime['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-store' }); res.end(body); return; }
    if (url.pathname === '/v1/day/news') { const body = Buffer.from(JSON.stringify(payload)); res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); res.end(body); return; }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)), file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file), extension = path.extname(file).toLowerCase();
    if (extension === '.html') {
      const probe = `<script>window.__newsErrors=[];window.__newsRejections=[];addEventListener('error',e=>__newsErrors.push(String(e.message||e.error||'error')));addEventListener('unhandledrejection',e=>__newsRejections.push(String(e.reason&&e.reason.message||e.reason||'rejection')))</script>`;
      body = Buffer.from(body.toString('utf8').replace('<head>', '<head>' + probe).replace('<meta name="sentiero-services" content="">', `<meta name="sentiero-services" content="http://127.0.0.1:${server.address().port}">`));
    }
    res.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); res.end(body);
  } catch (_) { res.writeHead(404); res.end(); }
});

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
  });
}

async function getPageTarget(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`), targets = await response.json();
      const page = targets.find(target => target.type === 'page' && /\/harness\?/.test(target.url));
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('Chrome DevTools non ha esposto la pagina newsroom');
}

class CDP {
  constructor(socket) { this.socket = socket; this.id = 0; this.pending = new Map(); socket.addEventListener('message', event => this.onMessage(event)); }
  onMessage(event) { let message; try { message = JSON.parse(String(event.data)); } catch (_) { return; } if (!message.id || !this.pending.has(message.id)) return; const job = this.pending.get(message.id); this.pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() { try { this.socket.close(); } catch (_) {} }
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url), timer = setTimeout(() => reject(new Error('timeout connessione Chrome DevTools')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(new CDP(socket)); });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('errore connessione Chrome DevTools')); });
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return Promise.race([new Promise(resolve => child.once('close', () => resolve(true))), sleep(timeoutMs).then(() => false)]);
}

async function stopChrome(child, cdp) {
  if (cdp) { try { await Promise.race([cdp.send('Browser.close'), sleep(1500)]); } catch (_) {} cdp.close(); }
  if (await waitForExit(child, 2000)) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid)) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGKILL');
  if (!await waitForExit(child, 3000)) throw new Error(`Chrome PID ${child.pid} non terminato`);
}

async function runChrome(port, width, height) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sentiero-news-${width}-`)), debugPort = await getFreePort();
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', `--window-size=${width},${height}`, '--force-device-scale-factor=2', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/harness?w=${width}&h=${height}`];
  const child = spawn(chrome, args, { windowsHide: true }); let stderr = '', cdp = null;
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const target = await getPageTarget(debugPort); cdp = await connectCdp(target.webSocketDebuggerUrl); await cdp.send('Runtime.enable');
    const started = Date.now(), timeoutMs = 30000;
    while (Date.now() - started < timeoutMs) {
      const state = await cdp.send('Runtime.evaluate', { expression: '({ready:window.__newsroomReady===true,result:window.__newsroomResult})', returnByValue: true });
      const value = state && state.result && state.result.value;
      if (value && value.ready) return value.result;
      await sleep(100);
    }
    const diagnostic = await cdp.send('Runtime.evaluate', { expression: '({ready:window.__newsroomReady,result:window.__newsroomResult,text:document.querySelector("#smoke-result")?.textContent||"",frameReady:document.querySelector("#app")?.contentDocument?.readyState||""})', returnByValue: true });
    throw new Error(`${width}x${height}: probe non completato entro ${timeoutMs} ms; stato=${JSON.stringify(diagnostic && diagnostic.result && diagnostic.result.value || {})}`);
  } catch (error) {
    throw new Error(`${error.message}${stderr ? ' | Chrome: ' + stderr.slice(-400) : ''}`);
  } finally {
    await stopChrome(child, cdp);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port;
  try {
    for (const [width, height] of [[375, 647], [1024, 768]]) {
      const result = await runChrome(port, width, height);
      assert.equal(result.error, undefined); assert.equal(result.front, true); assert.equal(result.articles, 1, 'nessun riempitivo'); assert.equal(result.lead, true);
      assert.ok(result.claims >= 1); assert.ok(result.sources >= 1); assert.equal(result.end, 'Fine dell’edizione di oggi.'); assert.ok(result.deck.includes('Una sola storia'));
      assert.ok(result.importance >= 52); assert.ok(result.title.includes('BCE')); assert.ok(result.overflow <= 1); assert.ok(result.bodyOverflow <= 1); assert.deepEqual(result.errors, []); assert.deepEqual(result.rejections, []);
    }
    process.stdout.write('PASS Giornale Chrome mobile/desktop: gerarchia, provenance, fallback senza riempitivi e overflow\n');
  } finally { server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
