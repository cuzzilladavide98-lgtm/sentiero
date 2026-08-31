'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const candidate = path.resolve(__dirname, '..');
const baseline = path.resolve(process.argv[2] || '');
if (!fs.existsSync(path.join(baseline, 'index.html'))) throw new Error('baseline richiesta');
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');

const roots = { baseline, candidate };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.wav': 'audio/wav' };
const marker = `<script>window.__sentieroBenchLong=0;try{new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__sentieroBenchLong+=entry.duration}).observe({type:'longtask',buffered:true})}catch(_){}</script>`;

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1'), parts = url.pathname.split('/').filter(Boolean), target = parts.shift(), root = roots[target];
    if (!root) throw new Error('route');
    const file = path.resolve(root, parts.join('/') || 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw new Error('file');
    let body = fs.readFileSync(file);
    if (path.extname(file).toLowerCase() === '.html') body = Buffer.from(body.toString('utf8').replace('<head>', '<head>' + marker));
    const headers = { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (/gzip/.test(req.headers['accept-encoding'] || '') && !/\.(?:mp3|wav|png)$/i.test(file)) { body = zlib.gzipSync(body, { level: 9 }); headers['Content-Encoding'] = 'gzip'; }
    headers['Content-Length'] = body.length; res.writeHead(200, headers); res.end(body);
  } catch (_) { res.writeHead(404); res.end(); }
});

function freePort() {
  return new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(error => error ? reject(error) : resolve(port)); }); });
}

async function retry(fn, attempts = 80) {
  let last;
  for (let i = 0; i < attempts; i++) { try { return await fn(); } catch (error) { last = error; await new Promise(ok => setTimeout(ok, 100)); } }
  throw last;
}

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.waiters = new Map(); }
  async open() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener('message', event => { const msg = JSON.parse(String(event.data)); if (msg.id) { const pending = this.pending.get(msg.id); if (!pending) return; this.pending.delete(msg.id); msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result); return; } const listeners = this.waiters.get(msg.method); if (listeners && listeners.length) listeners.shift()(msg.params); });
    await new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); });
  }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  event(method, timeout = 15000) { return new Promise((resolve, reject) => { const queue = this.waiters.get(method) || []; const done = params => { clearTimeout(timer); resolve(params); }; queue.push(done); this.waiters.set(method, queue); const timer = setTimeout(() => { const current = this.waiters.get(method) || [], index = current.indexOf(done); if (index >= 0) current.splice(index, 1); reject(new Error(`timeout CDP ${method}`)); }, timeout); }); }
  close() { try { this.ws.close(); } catch (_) {} }
}

const metricExpression = `(()=>{const p=performance,n=p.getEntriesByType('navigation')[0]||{},paint=p.getEntriesByType('paint'),fcp=paint.find(x=>x.name==='first-contentful-paint'),app=p.getEntriesByType('resource').find(x=>/sentiero-app\\.js/.test(x.name));return {fcp:+(fcp&&fcp.startTime||0).toFixed(2),longTaskMs:+(window.__sentieroBenchLong||0).toFixed(2),dom:+(n.domContentLoadedEventEnd||0).toFixed(2),load:+(n.loadEventEnd||0).toFixed(2),appDuration:app?+app.duration.toFixed(2):0}})()`;
const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const appPort = server.address().port, debugPort = await freePort(), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sentiero-browser-perf-'));
  const args = ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', '--window-size=430,760', '--force-device-scale-factor=2', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'];
  const child = spawn(chrome, args, { windowsHide: true, stdio: 'ignore' });
  let cdp;
  try {
    const targets = await retry(async () => { const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`); if (!response.ok) throw new Error('CDP non pronto'); const value = await response.json(); if (!value[0]?.webSocketDebuggerUrl) throw new Error('target CDP assente'); return value; });
    const pageTarget = targets.find(target => target.type === 'page' && /^(?:about:blank|chrome:\/\/newtab)/.test(target.url)) || targets.find(target => target.type === 'page');
    if (!pageTarget) throw new Error('target pagina CDP assente');
    cdp = new Cdp(pageTarget.webSocketDebuggerUrl); await cdp.open(); await cdp.send('Page.enable'); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const rows = [];
    for (let index = 0; index < 6; index++) {
      const target = index % 2 ? 'candidate' : 'baseline';
      const pageUrl = `http://127.0.0.1:${appPort}/${target}/index.html?browserbench=${index}`;
      await cdp.send('Page.navigate', { url: pageUrl });
      await retry(async () => { const state = await cdp.send('Runtime.evaluate', { expression: '({ready:document.readyState,href:location.href})', returnByValue: true }), value = state.result.value; if (value?.ready !== 'complete' || !value?.href?.includes(`/${target}/index.html`)) throw new Error(`pagina non pronta: ${JSON.stringify(value)}`); }, 150);
      await new Promise(ok => setTimeout(ok, 700));
      const result = await cdp.send('Runtime.evaluate', { expression: metricExpression, returnByValue: true }); rows.push({ target, index, ...result.result.value });
    }
    const summary = {};
    for (const target of ['baseline', 'candidate']) { const selected = rows.filter(row => row.target === target); summary[target] = {}; for (const metric of ['fcp', 'longTaskMs', 'dom', 'load', 'appDuration']) summary[target][metric] = median(selected.map(row => row[metric])); }
    summary.delta = {}; for (const metric of Object.keys(summary.baseline)) summary.delta[metric] = +(summary.candidate[metric] - summary.baseline[metric]).toFixed(2);
    assert.ok(summary.baseline.fcp > 0 && summary.candidate.fcp > 0, `FCP non misurata: ${JSON.stringify(summary)}`);
    console.log(JSON.stringify({ chrome: '152.0.7977.64', runs: rows.length, rows, summary }, null, 2));
  } finally {
    if (cdp) cdp.close(); try { child.kill(); } catch (_) {} server.close();
    await new Promise(ok => setTimeout(ok, 250)); try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
