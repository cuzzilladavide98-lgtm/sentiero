'use strict';

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..');
const chrome = [process.argv[2], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

const LOCAL_NEWS_KEY = 'sentiero-giornale-territorio-v1';

const baseItems = [
  { id: 'local-1', title: 'Nuovo polo sanitario a Torino: 200 posti letto in più', summary: 'La Regione Piemonte ha approvato il piano per il nuovo polo sanitario che sorgerà a Torino. L\'investimento è di 50 milioni di euro.', url: 'https://test.example.com/local-1', published: new Date().toISOString(), source: 'TGR Piemonte', sourceId: 'tgr-piemonte', sourceMeta: { perspective: 'primary', area: 'local', language: 'it', tier: 'A', domain: 'tgr.rai.it', regionSlug: 'piemonte' }, provenance: { evidenceId: 'local-1', sourceId: 'tgr-piemonte', sourceDomain: 'tgr.rai.it', canonicalUrl: 'https://tgr.rai.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-local-1' }, places: ['Torino'], topics: [], media: null },
  { id: 'local-2', title: 'Festival del cinema a Torino: al via la 40esima edizione', summary: 'Torna il Festival del Cinema di Torino con anteprime mondiali e ospiti internazionali. L\'evento si svolgerà dal 15 al 23 novembre.', url: 'https://test.example.com/local-2', published: new Date().toISOString(), source: 'TGR Piemonte', sourceId: 'tgr-piemonte', sourceMeta: { perspective: 'independent', area: 'local', language: 'it', tier: 'B', domain: 'tgr.rai.it', regionSlug: 'piemonte' }, provenance: { evidenceId: 'local-2', sourceId: 'tgr-piemonte', sourceDomain: 'tgr.rai.it', canonicalUrl: 'https://tgr.rai.it/2', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-local-2' }, places: ['Torino'], topics: [], media: null },
  { id: 'local-3', title: 'Allerta meteo in Piemonte: neve sulle Alpi', summary: 'La protezione civile ha diramato l\'allerta gialla per nevicate sulle zone alpine del Piemonte. Disagi alla circolazione previsti.', url: 'https://test.example.com/local-3', published: new Date().toISOString(), source: 'ARPA Piemonte', sourceId: 'arpa-piemonte', sourceMeta: { perspective: 'primary', area: 'local', language: 'it', tier: 'A', domain: 'arpa.piemonte.it', regionSlug: 'piemonte' }, provenance: { evidenceId: 'local-3', sourceId: 'arpa-piemonte', sourceDomain: 'arpa.piemonte.it', canonicalUrl: 'https://arpa.piemonte.it/3', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-local-3' }, places: ['Cuneo', 'Torino'], topics: [], media: null },
];

const nationalItems = [
  { id: 'nation-1', title: 'Il governo approva la nuova legge di bilancio per il 2025', summary: 'Il governo ha approvato la nuova legge di bilancio per il 2025 con misure per famiglie e imprese.', url: 'https://test.example.com/nation-1', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-1', sourceMeta: { perspective: 'primary', area: 'economy', language: 'it', tier: 'A', domain: 'ansa.it' }, provenance: { evidenceId: 'nation-1', sourceId: 'ansa-1', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-nation-1' }, places: [], topics: [], media: null },
  { id: 'nation-2', title: 'Alluvione in Emilia-Romagna: 500 sfollati e danni ingenti', summary: 'L\'alluvione ha causato 500 sfollati in Emilia-Romagna. La protezione civile è al lavoro.', url: 'https://test.example.com/nation-2', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-2', sourceMeta: { perspective: 'primary', area: 'world', language: 'it', tier: 'A', domain: 'ansa.it' }, provenance: { evidenceId: 'nation-2', sourceId: 'ansa-2', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/2', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-nation-2' }, places: [], topics: [], media: null },
];

const htmlFixtureItems = [
  { id: 'html-1', title: '<p>AGI - L\'ex primo ministro britannico <strong>Keir Starmer</strong> ha parlato al parlamento.</p>', summary: '</p><p>&nbsp;</p><div></div><p>&nbsp;</p><p>Alla cerimonia non ha partecipato nessuno.</p>', url: 'https://test.example.com/html-1', published: new Date().toISOString(), source: 'AGI', sourceId: 'agi-1', sourceMeta: { perspective: 'primary', area: 'world', language: 'it', tier: 'A', domain: 'agi.it' }, provenance: { evidenceId: 'html-1', sourceId: 'agi-1', sourceDomain: 'agi.it', canonicalUrl: 'https://agi.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-html-1' }, places: [], topics: [], media: null },
  { id: 'html-2', title: 'Il governo approva la nuova legge', summary: 'Testo normale senza markup.', url: 'https://test.example.com/html-2', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-2', sourceMeta: { perspective: 'primary', area: 'economy', language: 'it', tier: 'A', domain: 'ansa.it' }, provenance: { evidenceId: 'html-2', sourceId: 'ansa-2', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-html-2' }, places: [], topics: [], media: null },
];

function makeNewsPacket(items, dayKey) {
  return {
    v: 1,
    kind: 'sentiero-editorial-snapshot',
    generatedAt: new Date().toISOString(),
    dayKey,
    items: items.map(item => ({
      id: item.id, title: item.title, summary: item.summary, url: item.url, published: item.published,
      source: item.source, sourceId: item.sourceId, sourceMeta: item.sourceMeta, provenance: item.provenance,
      places: item.places || [], topics: item.topics || [], media: item.media
    })),
    edition: {
      v: 4, language: 'it', dayKey,
      title: 'Il Giornale di Sentiero', deck: 'Edizione di prova', generatedAt: new Date().toISOString(),
      articles: [{
        title: 'Il governo approva la nuova legge di bilancio per il 2025', section: 'Economia', kicker: 'Politica',
        claims: [{ text: 'Il governo ha approvato la nuova legge di bilancio con misure per famiglie e imprese.', sourceIds: ['test-1'] }],
        storyIds: ['test-story-1'], sourceIds: ['test-1'], importance: 50, importanceReasons: [], deltaType: 'new', deltaFromYesterday: 'Nuova oggi.'
      }],
      corrections: [], essential: false
    }
  };
}

// view ∈ {'selected','local-news','article','word'}; definisce dove scrollare.
function makeProbe(scenario, view) {
  const setLocal = scenario === 'selected' || scenario === 'local-news' ? `localStorage.setItem('${LOCAL_NEWS_KEY}', JSON.stringify({regionSlug:'piemonte',region:'Piemonte',city:''}));` : '';
  return `<script>
window.__screenshotData = null;
addEventListener('error',e=>{});
addEventListener('unhandledrejection',()=>{});
addEventListener('load',()=>setTimeout(async()=>{try{
  ${setLocal}
  await window.apriStanzaTerra();const limit=Date.now()+20000;
  while((!document.querySelector('.edition-front')||!document.querySelector('.news-local'))&&Date.now()<limit)await new Promise(ok=>setTimeout(ok,120));

  const view='${view}';
  if(view==='word'){
    const wordLimit=Date.now()+20000;
    while(!document.querySelector('.word-card')&&Date.now()<wordLimit)await new Promise(ok=>setTimeout(ok,120));
  }
  let target=null;
  if(view==='selected') target=document.querySelector('.local-card');
  else if(view==='local-news') target=document.querySelector('.news-local-card');
  else if(view==='article') target=document.querySelector('.news-article');
  else if(view==='word') target=document.querySelector('#giorno-word');
  if(target) target.scrollIntoView({block:'start'});
  await new Promise(r=>setTimeout(r,600));

  window.__screenshotReady = true;
}catch(error){ console.error('Probe error:', error); window.__screenshotReady = true; }},700));
</script>`;
}

function makeServer(scenario, items) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const newsPacket = makeNewsPacket(items, dayKey);
  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/assets/giornale/latest.json' || url.pathname === '/latest.json') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(newsPacket));
        return;
      }
      if (url.pathname === '/assets/parole-giorno-v1.json' || url.pathname === '/parole-giorno-v1.json') {
        const wordData = fs.readFileSync(path.join(root, 'assets/parole-giorno-v1.json'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(wordData);
        return;
      }
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)), file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
      let body = fs.readFileSync(file), extension = path.extname(file).toLowerCase();
      if (extension === '.html' && path.basename(file) === 'index.html') body = Buffer.from(body.toString('utf8').replace('</body>', makeProbe(scenario, viewForScenario(scenario)) + '</body>'));
      res.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); res.end(body);
    } catch (_) { res.writeHead(404); res.end(); }
  });
}

function viewForScenario(scenario) {
  const map = { 'selected': 'selected', 'local-news': 'local-news', 'article': 'article', 'html-fixture': 'article', 'word': 'word' };
  return map[scenario] || 'article';
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const port = srv.address().port; srv.close(() => resolve(port)); });
  });
}

async function getPageTarget(port) {
  for (let i = 0; i < 150; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('nessun target page trovato via CDP');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = new Map(); this.onMsg = this.onMsg.bind(this); ws.addEventListener('message', this.onMsg); }
  onMsg(ev) {
    let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
    if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result); }
    else if (msg.method) { const handlers = this.events.get(msg.method); if (handlers) for (const h of handlers) h(msg.params); }
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id; this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch (_) {} }
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('ws timeout')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(new CDP(ws)); });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('ws error')); });
  });
}

async function waitReady(cdp, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__screenshotReady === true', returnByValue: true });
    if (r && r.result && r.result.value === true) return true;
    await sleep(250);
  }
  return false;
}

async function capture(port, scenario, outFile) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sentiero-shot-${scenario}-`));
  const debugPort = await getFreePort();
  const url = `http://127.0.0.1:${port}/index.html?shot=${scenario}-${Date.now()}`;
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', '--mute-audio', '--disable-translate', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, url];
  const child = spawn(chrome, args, { windowsHide: true });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  let cdp = null;
  try {
    const target = await getPageTarget(debugPort);
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 647, deviceScaleFactor: 2, mobile: true, screenWidth: 375, screenHeight: 647 });
    await cdp.send('Emulation.setScrollbarsHidden', { hidden: true });
    const ok = await waitReady(cdp, 45000);
    if (!ok) throw new Error(`probe non pronto entro 45s (${scenario})`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
    return { outFile, bytes: Buffer.byteLength(shot.data, 'base64') };
  } catch (error) {
    throw new Error(`${scenario}: ${error.message}${stderr ? ' | stderr: ' + stderr.slice(-400) : ''}`);
  } finally {
    try { if (cdp) cdp.close(); } catch (_) {}
    child.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }
}

async function runScenario(scenario, items, outName, outputDir) {
  const server = makeServer(scenario, items);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const outFile = path.join(outputDir, outName);
  try {
    console.log(`  Capturing ${outName}...`);
    const { bytes } = await capture(port, scenario, outFile);
    console.log(`  OK ${outName} (${bytes} bytes)`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  const outputDir = path.join(__dirname, '..', 'qa-artifacts', 'v60S.274.5');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('\n=== CAPTURING SCREENSHOTS 375x647 via CDP ===\n');

  await runScenario('selected', baseItems, 'local-selected-375x647.png', outputDir);
  await runScenario('local-news', baseItems, 'local-news-375x647.png', outputDir);
  await runScenario('article', nationalItems, 'giornale-first-article-375x647.png', outputDir);
  await runScenario('html-fixture', htmlFixtureItems, 'giornale-html-fixture-375x647.png', outputDir);
  await runScenario('word', nationalItems, 'parola-giorno-375x647.png', outputDir);

  console.log('\n=== RESULTS ===');
  const files = ['local-selected-375x647.png', 'local-news-375x647.png', 'giornale-first-article-375x647.png', 'giornale-html-fixture-375x647.png', 'parola-giorno-375x647.png'];
  for (const f of files) {
    const p = path.join(outputDir, f);
    const st = fs.existsSync(p) ? fs.statSync(p) : null;
    console.log(`  ${f}: ${st ? st.size + ' bytes' : 'MANCANTE'}`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
