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

const READING_KEY = 'sentiero-giornale-lettura-v1';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const initialTime = new Date(Date.now() - 120000).toISOString(), updatedTime = new Date(Date.now() - 60000).toISOString();
let updatedEdition = false;

function logicalDay(date = new Date()) {
  const shifted = new Date(date.getTime() - 260 * 60000);
  return shifted.getFullYear() + '-' + String(shifted.getMonth() + 1).padStart(2, '0') + '-' + String(shifted.getDate()).padStart(2, '0');
}

const fixtureItems = [
  ['reading-source-1', 'Il Parlamento approva il piano nazionale per la sicurezza energetica', 'Il Parlamento ha approvato il piano nazionale che definisce investimenti e tempi per la sicurezza energetica italiana.', 'Istituzioni'],
  ['reading-source-2', 'L’Organizzazione mondiale della sanità aggiorna il piano contro le epidemie', 'L’organizzazione ha pubblicato nuove misure coordinate per prevenire e contenere le epidemie nei paesi europei.', 'Salute'],
  ['reading-source-3', 'La Protezione civile rafforza il sistema nazionale contro le alluvioni', 'Il nuovo programma finanzia sistemi di allerta e interventi territoriali per ridurre i danni provocati dalle alluvioni.', 'Clima']
].map(([id, title, summary], index) => ({
  id, title, summary, url: `https://example.test/${index + 1}`, published: initialTime, source: `Fonte pubblica ${index + 1}`, sourceId: `fonte-${index + 1}`,
  sourceMeta: { tier: 'A', type: 'public', area: 'institutions', role: 'fonte verificabile', reliability: 'alta', domain: 'example.test', language: 'it', perspective: index === 1 ? 'independent' : 'primary', ownership: 'public', country: 'IT', coverage: 'national', retrieval: 'feed', freshnessMinutes: 2 },
  provenance: { evidenceId: id, sourceId: `fonte-${index + 1}`, sourceDomain: 'example.test', canonicalUrl: `https://example.test/${index + 1}`, publishedAt: initialTime, retrievedAt: initialTime, contentFingerprint: `reading-fingerprint-${index + 1}` }
}));

function readingSnapshot() {
  const order = updatedEdition ? [1, 2, 0] : [0, 1, 2], generatedAt = updatedEdition ? updatedTime : initialTime;
  return {
    v: 1, kind: 'sentiero-editorial-snapshot', generatedAt, sourcesUpdatedAt: generatedAt, sourceUpdatedAt: generatedAt, dayKey: logicalDay(), items: fixtureItems,
    edition: {
      v: 4, language: 'it', dayKey: logicalDay(), title: 'Il Giornale di Sentiero', deck: 'Tre fatti che cambiano il quadro del giorno.', generatedAt, sourceUpdatedAt: generatedAt,
      articles: order.map((sourceIndex, position) => {
        const source = fixtureItems[sourceIndex];
        return { title: source.title, section: ['Istituzioni', 'Salute', 'Clima'][sourceIndex], kicker: 'Che cosa cambia e perché conta.', claims: [{ text: source.summary, sourceIds: [source.id] }, { text: 'La misura introduce conseguenze verificabili e un calendario pubblico per la sua applicazione.', sourceIds: [source.id] }], storyIds: [`reading-story-${sourceIndex + 1}`], sourceIds: [source.id], importance: 80 - position, importanceReasons: ['impatto nazionale', 'fonte verificabile'], deltaType: position ? 'developed' : 'new', deltaFromYesterday: 'Il quadro contiene fatti nuovi e verificabili.' };
      }),
      corrections: [], essential: false
    }
  };
}

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/__reading-next' && request.method === 'POST') { updatedEdition = true; response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return; }
    if (url.pathname === '/assets/giornale/latest.json' || url.pathname === '/latest.json') {
      const body = Buffer.from(JSON.stringify(readingSnapshot()));
      response.writeHead(200, { 'Content-Type': mime['.json'], 'Content-Length': body.length, 'Cache-Control': 'no-store' }); response.end(body); return;
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    const body = fs.readFileSync(file), extension = path.extname(file).toLowerCase();
    response.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
    response.end(body);
  } catch (_) { response.writeHead(404); response.end(); }
});

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer(); socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
  });
}

async function pageTarget(port) {
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find(target => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('nessun target page via Chrome DevTools');
}

class CDP {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map();
    socket.addEventListener('message', event => this.onMessage(event));
  }
  onMessage(event) {
    let message; try { message = JSON.parse(String(event.data)); } catch (_) { return; }
    if (!message.id || !this.pending.has(message.id)) return;
    const job = this.pending.get(message.id); this.pending.delete(message.id);
    message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id; this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, 1000);
      this.socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
      try { this.socket.close(); } catch (_) { clearTimeout(timer); resolve(); }
    });
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url), timer = setTimeout(() => reject(new Error('timeout connessione Chrome DevTools')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(new CDP(socket)); });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('errore connessione Chrome DevTools')); });
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'errore JavaScript nel browser');
  return result.result?.value;
}

async function waitValue(cdp, expression, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(cdp, expression);
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`timeout readiness: ${label}`);
}

async function pressKey(cdp, key, code, windowsVirtualKeyCode, modifiers = 0) {
  const params = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

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
  if (process.platform === 'win32' && Number.isInteger(child.pid)) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' });
  else { try { child.kill('SIGKILL'); } catch (_) {} }
  if (!await waitForExit(child, 3000)) throw new Error(`Chrome PID ${child.pid} non terminato dal teardown`);
}

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sentiero-reading-continuity-'));
const debugPort = await freePort(), appPort = server.address().port;
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', '--window-size=375,647', '--force-device-scale-factor=2', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
let cdp, failure = null, stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });

try {
  cdp = await connect((await pageTarget(debugPort)).webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__readingErrors=[];addEventListener('error',event=>__readingErrors.push(String(event.message||event.error||'error')));addEventListener('unhandledrejection',event=>__readingErrors.push(String(event.reason&&event.reason.message||event.reason||'rejection')));` });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/index.html?reading-continuity=${Date.now()}` });
  await waitValue(cdp, `typeof window.apriStanzaTerra === 'function'`, 20000, 'runtime Sentiero');
  await evaluate(cdp, `localStorage.removeItem('${READING_KEY}'); window.apriStanzaTerra()`);
  await waitValue(cdp, `document.querySelectorAll('.news-article[data-reading-id]').length >= 3`, 20000, 'edizione con almeno tre articoli');

  const saved = await evaluate(cdp, `(async()=>{const shell=document.querySelector('.giorno-shell'),articles=[...document.querySelectorAll('.news-article[data-reading-id]')],target=articles[2];shell.scrollTop+=target.getBoundingClientRect().top-100;shell.dispatchEvent(new Event('scroll'));await new Promise(resolve=>setTimeout(resolve,200));return {marker:JSON.parse(localStorage.getItem('${READING_KEY}')||'null'),articleIds:articles.map(article=>article.dataset.readingId)};})()`);
  assert.equal(saved.marker?.v, 1);
  assert.equal(saved.articleIds.includes(saved.marker?.storyId), true, 'il marcatore non identifica un articolo dell’edizione');
  assert.notEqual(saved.marker?.storyId, saved.articleIds[0], 'lo scorrimento non ha avanzato la posizione di lettura');
  assert.match(saved.marker?.dayKey || '', /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(saved.marker).sort(), ['at', 'dayKey', 'storyId', 'v'], 'il marcatore deve restare tecnico e minimale');
  const savedTargetId = saved.marker.storyId;

  const beforeRefresh = await evaluate(cdp, `(async()=>{await fetch('/__reading-next',{method:'POST'});const target=[...document.querySelectorAll('.news-article[data-reading-id]')].find(node=>node.dataset.readingId===${JSON.stringify(savedTargetId)}),control=document.querySelector('.news-refresh');const top=target.getBoundingClientRect().top;control.focus({preventScroll:true});control.click();return {top,busy:control.getAttribute('aria-busy'),disabled:control.disabled,label:control.textContent,index:[...document.querySelectorAll('.news-article')].indexOf(target)};})()`);
  assert.equal(beforeRefresh.busy, 'true');
  assert.equal(beforeRefresh.disabled, true);
  assert.equal(beforeRefresh.label, 'Verifico…');
  const afterRefresh = await waitValue(cdp, `(()=>{const target=[...document.querySelectorAll('.news-article[data-reading-id]')].find(node=>node.dataset.readingId===${JSON.stringify(savedTargetId)}),control=document.querySelector('.news-refresh');if(!target||!control||control.getAttribute('aria-busy')!=='false'||document.activeElement!==control)return null;return {top:target.getBoundingClientRect().top,index:[...document.querySelectorAll('.news-article')].indexOf(target),focused:true,label:control.textContent};})()`, 10000, 'aggiornamento Giornale completato e focus restituito');
  assert.notEqual(afterRefresh.index, beforeRefresh.index, 'la fixture non ha riordinato la storia seguita');
  assert.ok(Math.abs(afterRefresh.top - beforeRefresh.top) <= 2, `salto di lettura dopo il riordino: ${beforeRefresh.top} → ${afterRefresh.top}`);
  assert.equal(afterRefresh.focused, true, 'focus non restituito al controllo dopo il refresh');
  assert.equal(afterRefresh.label, 'Verifica aggiornamenti');

  await cdp.send('Page.reload', { ignoreCache: true });
  await waitValue(cdp, `typeof window.apriStanzaTerra === 'function'`, 20000, 'runtime dopo riavvio');
  await evaluate(cdp, `window.apriStanzaTerra()`);
  const resumeState = await waitValue(cdp, `(()=>{const button=document.querySelector('.news-resume button'),resume=document.querySelector('.news-resume'),shell=document.querySelector('.giorno-shell');if(!button||!resume||!shell)return null;const rect=button.getBoundingClientRect();return {label:button.textContent,height:rect.height,overflow:shell.scrollWidth>shell.clientWidth};})()`, 20000, 'invito a riprendere');
  assert.equal(resumeState.label, 'Riprendi dal punto lasciato');
  assert.ok(resumeState.height >= 44, `target touch inferiore a 44px: ${resumeState.height}`);
  assert.equal(resumeState.overflow, false, 'overflow orizzontale su viewport mobile');

  const viewportResults = {};
  for (const width of [320, 375, 430, 1024]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width === 1024 ? 768 : 700, deviceScaleFactor: 2, mobile: width < 600 });
    const metrics = await evaluate(cdp, `(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const shell=document.querySelector('.giorno-shell'),resume=document.querySelector('.news-resume'),control=resume?.querySelector('button'),rect=control?.getBoundingClientRect();return {width:innerWidth,height:rect?.height||0,inside:!!rect&&rect.left>=0&&rect.right<=innerWidth,overflow:shell.scrollWidth>shell.clientWidth};})()`);
    assert.equal(metrics.width, width);
    assert.ok(metrics.height >= 44, `${width}px: target touch inferiore a 44px`);
    assert.equal(metrics.inside, true, `${width}px: CTA fuori viewport`);
    assert.equal(metrics.overflow, false, `${width}px: overflow orizzontale`);
    viewportResults[width] = metrics;
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 700, deviceScaleFactor: 2, mobile: true });
  if (process.env.SENTIERO_REVIEW_SCREENSHOT) {
    await evaluate(cdp, `(async()=>{document.querySelector('.news-resume').scrollIntoView({block:'center',behavior:'auto'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(process.env.SENTIERO_REVIEW_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }

  await evaluate(cdp, `document.querySelector('.news-resume button').click()`);
  const resumed = await waitValue(cdp, `(()=>{const target=[...document.querySelectorAll('.news-article[data-reading-id]')].find(node=>node.dataset.readingId===${JSON.stringify(savedTargetId)}),heading=target?.querySelector('h3');if(!target||document.querySelector('.news-resume'))return null;const top=target.getBoundingClientRect().top;return top>=50&&top<=180&&document.activeElement===heading?{top,focused:true}:null;})()`, 5000, 'posizione e focus ripristinati');
  assert.equal(resumed.focused, true);

  await evaluate(cdp, `(async()=>{const shell=document.querySelector('.giorno-shell'),end=document.querySelector('.edition-end');end.scrollIntoView({block:'start',behavior:'auto'});shell.dispatchEvent(new Event('scroll'));await new Promise(resolve=>setTimeout(resolve,200));})()`);
  assert.equal(await evaluate(cdp, `localStorage.getItem('${READING_KEY}')`), null, 'il marcatore deve sparire a fine edizione');

  await evaluate(cdp, `localStorage.setItem('${READING_KEY}',JSON.stringify({v:1,dayKey:'2000-01-01',storyId:${JSON.stringify(savedTargetId)},at:1}))`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitValue(cdp, `typeof window.apriStanzaTerra === 'function'`, 20000, 'runtime per invalidazione giorno');
  await evaluate(cdp, `window.apriStanzaTerra()`);
  await waitValue(cdp, `document.querySelectorAll('.news-article').length >= 1`, 20000, 'edizione dopo cambio giorno');
  const stale = await evaluate(cdp, `({marker:localStorage.getItem('${READING_KEY}'),resume:!!document.querySelector('.news-resume'),errors:window.__readingErrors})`);
  assert.equal(stale.marker, null, 'marcatore di un altro giorno non eliminato');
  assert.equal(stale.resume, false, 'invito obsoleto mostrato in un altro giorno');
  assert.deepEqual(stale.errors, [], 'errori browser durante il percorso');

  await evaluate(cdp, `document.querySelector('.giorno-head button').click()`);
  await waitValue(cdp, `document.querySelector('#giorno-room')?.hidden && typeof window.apriStanzaTerra==='function'`, 5000, 'chiusura stanza e runtime pronto');
  await waitValue(cdp, `(()=>{const open=window.apriStanzaTerra,trigger=document.querySelector('#barra a[data-sez="oggi"]');if(typeof open!=='function'||!trigger)return false;trigger.focus();open();return true;})()`, 5000, 'riapertura da controllo esterno');
  await waitValue(cdp, `!document.querySelector('#giorno-room')?.hidden && document.activeElement===document.querySelector('.giorno-head button')`, 5000, 'focus iniziale nella stanza');
  await pressKey(cdp, 'Tab', 'Tab', 9, 8);
  assert.equal(await evaluate(cdp, `document.querySelector('#giorno-room').contains(document.activeElement) && document.activeElement!==document.querySelector('.giorno-head button')`), true, 'Shift+Tab è uscito dalla finestra modale');
  await pressKey(cdp, 'Tab', 'Tab', 9);
  assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('.giorno-head button')`), true, 'Tab non è tornato al primo controllo della finestra');
  await pressKey(cdp, 'Escape', 'Escape', 27);
  await waitValue(cdp, `document.querySelector('#giorno-room')?.hidden && document.activeElement===document.querySelector('#barra a[data-sez="oggi"]')`, 3000, 'chiusura Escape e focus restituito');

  console.log(JSON.stringify({ savedArticle: savedTargetId, markerFields: Object.keys(saved.marker), resume: resumeState, viewports: viewportResults, resumed, sameDayReorder: { before: beforeRefresh, after: afterRefresh }, completedClearsMarker: true, staleDayClearsMarker: true, modalFocusContract: true }, null, 2));
  console.log('PASS continuita di attenzione: lettura locale, refresh stabile e focus modale restituito');
} catch (error) {
  failure = new Error(`${error.message}${stderr ? ' | Chrome: ' + stderr.slice(-500) : ''}`);
} finally {
  let stopped = false;
  try { await stopChrome(cdp, child); stopped = true; } catch (error) { if (!failure) failure = error; }
  if (stopped) {
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    catch (error) { if (!failure) failure = new Error(`profilo temporaneo non rimosso: ${error.message}`); }
  }
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

if (failure) throw failure;
