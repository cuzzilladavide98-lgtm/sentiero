'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const localSw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const identity = {
  version: packageVersion,
  build: localSw.match(/const RELEASE_BUILD = '([^']+)'/)?.[1],
  generation: Number(localSw.match(/const SW_GENERATION = (\d+)/)?.[1]),
  cache: localSw.match(/const CACHE = '([^']+)'/)?.[1],
  app: localSw.match(/['"](\.\/sentiero-app\.js\?v=[^'"]+)['"]/)?.[1],
  day: localSw.match(/['"](\.\/sentiero-day\.mjs\?v=[^'"]+)['"]/)?.[1],
  sync: localSw.match(/['"](\.\/sentiero-sync\.js\?v=[^'"]+)['"]/)?.[1]
};
assert.ok(identity.build && identity.generation && identity.cache && identity.app && identity.day && identity.sync, 'identità release locale incompleta');
assert.equal(identity.build, `v60S.${packageVersion.split('.').slice(1).join('.')}`, 'package.json e sw.js locali incoerenti');

const localMode = process.argv[2] === '--local';
let localServer;
const inputBase = new URL(localMode ? 'http://127.0.0.1/' : process.argv[2] || 'https://cuzzilladavide98-lgtm.github.io/sentiero/');
assert.match(inputBase.protocol, /^https?:$/, 'la base deve essere HTTP(S)');
if (!inputBase.pathname.endsWith('/')) inputBase.pathname += '/';
inputBase.search = ''; inputBase.hash = '';
const base = inputBase;
const chrome = [process.argv[3], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function freePort() {
  const server = net.createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

async function fetchAsset(name, kind = 'binary') {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (process.env.SENTIERO_GATE_TRACE) console.error(`asset ${name} attempt ${attempt + 1}`);
    const url = new URL(name, base); url.searchParams.set('gate', `${Date.now()}-${attempt}`);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Connection: 'close' } });
      assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
      const body = kind === 'text' ? await response.text() : Buffer.from(await response.arrayBuffer());
      assert.ok(body.length > 0, `${url}: risposta vuota`);
      return { name, type: response.headers.get('content-type') || '', body };
    } catch (error) { lastError = error; await sleep(150); }
  }
  throw lastError;
}

async function preflight() {
  const groups = {
    core: ['./', './index.html', './manifest.json', identity.app, identity.day, identity.sync, './sw.js'],
    vendor: ['./vendor/qrcode.js', './vendor/jsQR.js'],
    audio: Array.from({ length: 8 }, (_, index) => `./assets/sfx/combo-${index + 1}.mp3`).concat('./assets/sfx/seal.mp3'),
    lingue: ['./lingue/en.json', './lingue/base-it-v272.7.json']
  };
  const names = Object.values(groups).flat(), results = new Map();
  for (const name of names) results.set(name, await fetchAsset(name, /(?:\.html|\.js|\.mjs|\.json)(?:\?|$)|^\.\/$/.test(name) ? 'text' : 'binary'));
  assert.match(results.get('./index.html').body, new RegExp(`sentiero-app\\.js\\?v=${packageVersion.replace(/\./g, '\\.')}`));
  assert.match(results.get('./sw.js').body, new RegExp(`const RELEASE_BUILD = '${identity.build.replace(/\./g, '\\.')}'`));
  assert.match(results.get('./sw.js').body, new RegExp(`const SW_GENERATION = ${identity.generation}`));
  assert.match(results.get(identity.app).body, new RegExp(`const APP_VERSION='${identity.build.replace(/\./g, '\\.')}`));
  assert.match(results.get(identity.sync).body, /sentiero-data-v2/);
  assert.match(results.get('./vendor/qrcode.js').body, /qrcode/i);
  assert.match(results.get('./vendor/jsQR.js').body, /jsQR/);
  for (const name of groups.audio) assert.ok(results.get(name).body.length >= 1000, `${name}: audio troppo corto`);
  for (const name of groups.lingue) assert.doesNotThrow(() => JSON.parse(results.get(name).body), `${name}: JSON non valido`);

  const snapshots = [];
  for (const name of ['./assets/giornale/latest.json', './latest.json']) {
    try { const result = await fetchAsset(name, 'text'), data = JSON.parse(result.body); snapshots.push({ name, data }); }
    catch (error) { snapshots.push({ name, error: error.message }); }
  }
  const news = snapshots.find(item => item.data?.edition?.articles?.length >= 1 && item.data?.items?.length >= 12);
  assert.ok(news, `snapshot editoriale non valido: ${JSON.stringify(snapshots.map(item => ({ name: item.name, error: item.error, articles: item.data?.edition?.articles?.length, items: item.data?.items?.length })))}`);
  const wordsResult = await fetchAsset('./assets/parole-giorno-v1.json', 'text'), words = JSON.parse(wordsResult.body);
  assert.ok(words?.words?.length >= 1000, 'catalogo Parola incompleto');
  return { checked: names.length + 3, news: { path: news.name, articles: news.data.edition.articles.length, items: news.data.items.length, reachable: Number(news.data.reachable) || 0 }, words: words.words.length };
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
  throw new Error('pagina Chrome non disponibile');
}

class CDP {
  constructor(socket) { this.socket = socket; this.id = 0; this.pending = new Map(); socket.addEventListener('message', event => this.onMessage(event)); }
  onMessage(event) { let message; try { message = JSON.parse(String(event.data)); } catch (_) { return; } if (!message.id || !this.pending.has(message.id)) return; const job = this.pending.get(message.id); this.pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise(resolve => { const timer = setTimeout(resolve, 1000); this.socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true }); try { this.socket.close(); } catch (_) { clearTimeout(timer); resolve(); } });
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url), timer = setTimeout(() => reject(new Error('timeout connessione Chrome DevTools')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(new CDP(socket)); });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('errore connessione Chrome DevTools')); });
  });
}

async function evaluate(cdp, expression, awaitPromise = true) {
  let timer, result;
  try { result = await Promise.race([cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout Runtime.evaluate: ${expression.slice(0, 100)}`)), 30000); })]); }
  finally { clearTimeout(timer); }
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'errore JavaScript nel browser');
  return result.result?.value;
}

async function waitValue(cdp, expression, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) { const value = await evaluate(cdp, expression, false); if (value) return value; await sleep(100); }
  throw new Error(`timeout readiness: ${label}`);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise(resolve => { const done = () => { clearTimeout(timer); resolve(true); }; const timer = setTimeout(() => { child.removeListener('exit', done); resolve(child.exitCode !== null); }, timeoutMs); child.once('exit', done); });
}

async function stopChrome(cdp, child) {
  if (cdp) { try { await Promise.race([cdp.send('Browser.close'), sleep(1500)]); } catch (_) {} await cdp.close(); }
  if (await waitForExit(child, 2000)) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid)) { const killed = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' }); if (killed.error) throw killed.error; }
  else { try { child.kill('SIGKILL'); } catch (_) {} }
  if (!await waitForExit(child, 3000)) throw new Error(`Chrome PID ${child.pid} non terminato dal teardown`);
}

async function handshake(cdp) { return evaluate(cdp, `window.sentieroServiceWorkerHandshake(12000)`); }
async function stabilize(cdp) {
  await waitValue(cdp, `document.readyState==='complete'&&typeof APP_VERSION==='string'&&typeof window.sentieroServiceWorkerHandshake==='function'`, 20000, 'runtime');
  await waitValue(cdp, `!!navigator.serviceWorker.controller`, 20000, 'prima attivazione del worker');
  const result = await handshake(cdp);
  assert.deepEqual({ controller: result.controller, build: result.build, generation: result.generation, cache: result.cache, coherent: result.coherent }, { controller: true, build: identity.build, generation: identity.generation, cache: identity.cache, coherent: true }, `handshake incoerente: ${JSON.stringify(result)}`);
  assert.match(await evaluate(cdp, `APP_VERSION`), new RegExp(`^${identity.build.replace(/\./g, '\\.')}`));
  return result;
}

(async () => {
  if (localMode) {
    const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json', '.mp3':'audio/mpeg', '.png':'image/png' };
    localServer = http.createServer((request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, base).pathname);
        const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + path.sep)) throw new Error('path');
        const size = fs.statSync(file).size;
        response.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Content-Length':size, 'Cache-Control':'no-store', 'Service-Worker-Allowed':'/' });
        fs.createReadStream(file).pipe(response);
      } catch (_) { response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => localServer.listen(0, '127.0.0.1', resolve));
    base.port = String(localServer.address().port);
  }
  const preflightMetrics = await preflight(), stamp = Date.now();
  const debugPort = await freePort(), profile = fs.mkdtempSync(path.join(os.tmpdir(), `sentiero-pages-gate-${process.pid}-`));
  const expectedProfileRoot = path.resolve(os.tmpdir()) + path.sep;
  assert.equal(path.resolve(profile).startsWith(expectedProfileRoot), true, 'profilo Chrome fuori dalla directory temporanea');
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', '--window-size=390,740', '--force-device-scale-factor=2', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
  let cdp, failure = null, stderr = '', browserStopped = false;
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    cdp = await connect((await pageTarget(debugPort)).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Rome' });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('sentiero-onboarded','1');window.__gateErrors=[];addEventListener('error',event=>__gateErrors.push(String(event.message||event.error||'error')));addEventListener('unhandledrejection',event=>__gateErrors.push(String(event.reason&&event.reason.message||event.reason||'rejection')));` });
    await cdp.send('Page.navigate', { url: new URL(`index.html?pages-gate=${stamp}`, base).toString() });
    const swIdentity = await stabilize(cdp);

    await evaluate(cdp, `window.apriStanzaTerra()`);
    const editorial = await waitValue(cdp, `(()=>{const articles=document.querySelectorAll('.news-article').length,definition=document.querySelector('.word-definition')?.textContent||'';if(articles<1||definition.length<24)return null;return {articles,sources:document.querySelectorAll('.news-sources a').length,meta:document.querySelector('.edition-meta')?.textContent||'',word:document.querySelector('.word-card h3')?.textContent||'',definition,wordSource:document.querySelector('.word-source')?.textContent||'',placeholder:document.querySelector('.news-state')?.textContent||''};})()`, 20000, 'Giornale e Parola');
    assert.ok(editorial.sources >= 1); assert.match(editorial.meta, /fonti aggiornate/); assert.ok(editorial.word.length >= 2); assert.match(editorial.wordSource, /Wiktionary/); assert.doesNotMatch(editorial.placeholder, /tornerà disponibile|nessuna storia/i);
    const phaseErrors = [await evaluate(cdp, `window.__gateErrors`)];
    await evaluate(cdp, `document.querySelector('#giorno-room .giorno-head button')?.click()`);
    await waitValue(cdp, `document.querySelector('#giorno-room')?.hidden===true`, 3000, 'chiusura stanza del giorno');

    const fixture = await evaluate(cdp, `(()=>{const tk=todayKey(),quest={id:'pages-gate-quest',titolo:'Patto Pages QA',note:'Fixture isolata post-deploy',quando:tk,ora:'',prio:2,fatto:false,nata:tk,monte:''};S.quests=[quest];S.scheduled=[];S.checks={};S.questLog=[];S.patto={tk,id:quest.id,audace:true};S.essentials=[];S.riposi={};S.ferie={};S.lastDayInit=tk;document.querySelector('#barra a[data-sez="oggi"]').click();if(!salvaSubito())throw new Error('fixture non salvata');renderSubito([]);return {tk,id:quest.id};})()`);
    await waitValue(cdp, `document.querySelector('.patto-riprendi')?.getClientRects().length`, 5000, 'ritorno al Patto');
    await evaluate(cdp, `document.querySelector('.patto-riprendi').click()`);
    await waitValue(cdp, `document.querySelector('#passo-room')?.open&&document.querySelector('#passo-room .item[data-qid="${fixture.id}"] .chk')`, 5000, 'Passo fixture');
    await evaluate(cdp, `document.querySelector('#passo-room .item[data-qid="${fixture.id}"] .chk').click()`);
    await waitValue(cdp, `S.quests.find(q=>q.id==='${fixture.id}')?.fatto===true&&!document.querySelector('#passo-room .item[data-qid="${fixture.id}"]')?.dataset.busy`, 7000, 'Quest completata');
    await evaluate(cdp, `document.querySelector('#passo-room .item[data-qid="${fixture.id}"] .chk').click()`);
    await waitValue(cdp, `S.quests.find(q=>q.id==='${fixture.id}')?.fatto===false&&!document.querySelector('#passo-room .item[data-qid="${fixture.id}"]')?.dataset.busy`, 7000, 'undo Quest');
    await evaluate(cdp, `document.querySelector('#passo-room .passo-back').click()`);

    const oldEpoch = await evaluate(cdp, `performance.timeOrigin`);
    await cdp.send('Page.reload', { ignoreCache: false });
    await waitValue(cdp, `performance.timeOrigin!==${JSON.stringify(oldEpoch)}&&typeof APP_VERSION==='string'`, 20000, 'nuovo document epoch');
    const reloadedHandshake = await stabilize(cdp);
    assert.equal(await waitValue(cdp, `S.quests.some(q=>q.id==='${fixture.id}'&&!q.fatto)&&document.querySelector('.patto-riprendi')&&true`, 5000, 'fixture dopo reload'), true);
    phaseErrors.push(await evaluate(cdp, `window.__gateErrors`));

    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' });
    const onlineEpoch = await evaluate(cdp, `performance.timeOrigin`);
    await cdp.send('Page.reload', { ignoreCache: false });
    await waitValue(cdp, `performance.timeOrigin!==${JSON.stringify(onlineEpoch)}&&typeof APP_VERSION==='string'&&navigator.serviceWorker?.controller`, 20000, 'shell offline');
    await waitValue(cdp, `document.querySelector('.patto-riprendi')`, 5000, 'Patto offline');
    await evaluate(cdp, `document.querySelector('.patto-riprendi').click()`);
    const offlinePasso = await waitValue(cdp, `(()=>{const room=document.querySelector('#passo-room'),q=S.quests.find(x=>x.id==='${fixture.id}');return room?.open&&q?{open:true,title:room.querySelector('.ttl')?.textContent||'',done:!!q.fatto}:null;})()`, 5000, 'Passo offline aperto');
    assert.equal(offlinePasso.title, 'Patto Pages QA'); assert.equal(offlinePasso.done, false);
    await evaluate(cdp, `document.querySelector('#passo-room .passo-back').click();window.apriStanzaTerra()`);
    const offlineEditorial = await waitValue(cdp, `(()=>{const articles=document.querySelectorAll('.news-article').length,word=document.querySelector('.word-card h3')?.textContent||'';return articles>=1&&word.length>=2?{articles,word,controlled:!!navigator.serviceWorker.controller}:null;})()`, 15000, 'Giornale e Parola offline');
    assert.equal(offlineEditorial.controlled, true);
    phaseErrors.push(await evaluate(cdp, `window.__gateErrors`));
    const errors = phaseErrors.flat(); assert.deepEqual(errors, [], `errori browser: ${JSON.stringify(errors)}`);

    console.log(JSON.stringify({ ok: true, base: base.toString(), identity: { build: identity.build, generation: identity.generation, cache: identity.cache }, http: preflightMetrics, sw: { coherent: swIdentity.coherent && reloadedHandshake.coherent, controlled: true }, editorial: { articles: editorial.articles, sources: editorial.sources, word: editorial.word }, quest: { id: fixture.id, complete: true, undo: true, reload: true }, offline: offlineEditorial }));
  } catch (error) { failure = error; }
  finally {
    try { await cdp?.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); } catch (_) {}
    try { await stopChrome(cdp, child); browserStopped = true; } catch (error) { if (!failure) failure = error; }
    if (browserStopped && path.resolve(profile).startsWith(expectedProfileRoot) && path.basename(profile).startsWith(`sentiero-pages-gate-${process.pid}-`)) {
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
      catch (error) { if (!failure) failure = new Error(`profilo temporaneo non rimosso: ${error.message}`); }
    }
  }
  if (failure) throw new Error(`${failure.stack || failure}${stderr ? `\nChrome stderr: ${stderr.trim().slice(-1000)}` : ''}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (localServer) { localServer.closeAllConnections(); await new Promise(resolve => localServer.close(resolve)); }
});
