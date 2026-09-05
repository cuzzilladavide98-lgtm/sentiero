import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stableRevision = '458cf7d';
const chrome = [
  process.argv[2],
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav'
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function directTempPath(prefix) {
  const tempBase = path.resolve(os.tmpdir());
  const result = path.resolve(fs.mkdtempSync(path.join(tempBase, prefix)));
  assert.equal(path.dirname(result), tempBase, `directory temporanea fuori da ${tempBase}`);
  assert.match(path.basename(result), new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  return result;
}

function removeOwnedTemp(target, prefix) {
  const resolved = path.resolve(target), tempBase = path.resolve(os.tmpdir());
  assert.equal(path.dirname(resolved), tempBase, 'cleanup rifiutato: target non figlio diretto della temp di sistema');
  assert.match(path.basename(resolved), new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { windowsHide: true, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} fallito (${result.status}): ${(result.stderr || result.stdout || '').trim()}`);
  return result;
}

function exportStable(tempRoot) {
  const archive = path.join(tempRoot, 'stable.tar'), destination = path.join(tempRoot, 'stable');
  fs.mkdirSync(destination);
  run('git', ['archive', '--format=tar', '--output', archive, stableRevision], { cwd: root });
  // Un nome relativo funziona sia con bsdtar di Windows sia con GNU tar.
  run(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xf', 'stable.tar', '-C', 'stable'], { cwd: tempRoot });
  fs.rmSync(archive, { force: true });
  assert.equal(fs.existsSync(path.join(destination, '.git')), false, 'git archive non deve esportare .git');
  assert.equal(fs.existsSync(path.join(destination, 'index.html')), true, 'snapshot stable incompleto');
  return destination;
}

function requiredMatch(text, regex, label) {
  const match = text.match(regex);
  assert.ok(match, `${label} non trovato`);
  return match[1];
}

function readIdentity(directory) {
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const sw = fs.readFileSync(path.join(directory, 'sw.js'), 'utf8');
  const app = fs.readFileSync(path.join(directory, 'sentiero-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const packageVersion = String(pkg.version || '');
  const build = requiredMatch(sw, /const RELEASE_BUILD\s*=\s*['"]([^'"]+)['"]/, 'RELEASE_BUILD');
  const generation = Number(requiredMatch(sw, /const SW_GENERATION\s*=\s*(\d+)/, 'SW_GENERATION'));
  const cache = requiredMatch(sw, /const CACHE\s*=\s*['"]([^'"]+)['"]/, 'CACHE');
  const appVersion = requiredMatch(app, /const APP_VERSION\s*=\s*['"]([^'"]+)['"]/, 'APP_VERSION');
  const appBuild = appVersion.split('\u00b7')[0].trim();
  const htmlBuild = requiredMatch(html, /<meta\s+name=['"]sentiero-build['"]\s+content=['"]([^'"]+)['"]/, 'meta sentiero-build');
  const htmlGeneration = Number(requiredMatch(html, /<meta\s+name=['"]sentiero-sw-generation['"]\s+content=['"](\d+)['"]/, 'meta sentiero-sw-generation'));
  const registeredVersion = requiredMatch(app, /serviceWorker\.register\(['"]\.\/sw\.js\?v=([^'"]+)['"]/, 'versione registrazione SW');
  const versionParts = packageVersion.split('.').map(Number);
  assert.equal(versionParts.length, 3, `versione package non semver: ${packageVersion}`);
  assert.equal(versionParts.every(Number.isInteger), true, `versione package non numerica: ${packageVersion}`);
  const expectedBuild = `v${versionParts[0]}S.${versionParts[1]}.${versionParts[2]}`;
  const expectedGeneration = versionParts[1] * 1000 + versionParts[2];
  const expectedCache = `sentiero-${expectedBuild.toLowerCase().replaceAll('.', '-')}`;
  assert.equal(build, expectedBuild, 'package e RELEASE_BUILD incoerenti');
  assert.equal(appBuild, build, 'APP_VERSION e RELEASE_BUILD incoerenti');
  assert.equal(htmlBuild, build, 'HTML e RELEASE_BUILD incoerenti');
  assert.equal(generation, expectedGeneration, 'package e SW_GENERATION incoerenti');
  assert.equal(htmlGeneration, generation, 'HTML e SW_GENERATION incoerenti');
  assert.equal(cache, expectedCache, 'nome cache incoerente con la build');
  assert.equal(registeredVersion, packageVersion, 'query di registrazione SW incoerente con package');
  return { packageVersion, build, generation, cache, appVersion };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
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
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map();
    socket.addEventListener('message', event => this.onMessage(event));
  }
  onMessage(event) {
    let message;
    try { message = JSON.parse(String(event.data)); } catch (_) { return; }
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

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url), timer = setTimeout(() => reject(new Error('timeout connessione Chrome DevTools')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(new CDP(socket)); });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('errore connessione Chrome DevTools')); });
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'eccezione runtime');
  return result.result?.value;
}

async function waitValue(cdp, expression, timeoutMs, label) {
  const started = Date.now(); let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await evaluate(cdp, expression);
      if (value) return value;
    } catch (error) { lastError = error.message; }
    await sleep(100);
  }
  throw new Error(`timeout readiness: ${label}${lastError ? ` (${lastError})` : ''}`);
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
  if (!child || await waitForExit(child, 2000)) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid)) {
    run('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']);
  } else {
    try { child.kill('SIGKILL'); } catch (_) {}
  }
  if (!await waitForExit(child, 3000)) throw new Error(`Chrome PID ${child.pid} non terminato`);
}

function createSwitchingServer(stableRoot) {
  let servedRoot = stableRoot;
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const base = path.resolve(servedRoot), file = path.resolve(base, relative);
      if (!file.startsWith(base + path.sep) || !fs.statSync(file).isFile()) {
        response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end(); return;
      }
      const body = fs.readFileSync(file), extension = path.extname(file).toLowerCase();
      response.writeHead(200, {
        'Content-Type': mime[extension] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'Service-Worker-Allowed': '/'
      });
      response.end(body);
    } catch (_) { response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end(); }
  });
  return { server, useCandidate() { servedRoot = root; } };
}

const runtimeReady = `location.pathname.endsWith('/index.html') && document.readyState === 'complete' && typeof APP_VERSION === 'string' && typeof sentieroServiceWorkerHandshake === 'function'`;

async function reloadDocument(cdp, ignoreCache = false) {
  const previous = await evaluate(cdp, 'performance.timeOrigin');
  await cdp.send('Page.reload', { ignoreCache });
  await waitValue(cdp, `performance.timeOrigin !== ${previous} && (${runtimeReady})`, 30000, 'nuovo documento pronto');
}

async function probeRelease(cdp, identity, label) {
  await waitValue(cdp, runtimeReady, 30000, `${label}: runtime`);
  const probe = await evaluate(cdp, `(async()=>{
    const handshake=await sentieroServiceWorkerHandshake(10000);
    return {handshake,version:APP_VERSION,cacheKeys:await caches.keys(),controller:navigator.serviceWorker.controller?.scriptURL};
  })()`);
  assert.equal(probe.error, undefined, probe.error);
  assert.equal(probe.version, identity.appVersion, `${label}: runtime inatteso`);
  assert.equal(probe.handshake.controller, true, `${label}: controller assente`);
  assert.equal(probe.handshake.coherent, true, `${label}: HTML e worker incoerenti`);
  assert.equal(probe.handshake.build, identity.build, `${label}: build worker inattesa`);
  assert.equal(probe.handshake.generation, identity.generation, `${label}: generazione worker inattesa`);
  assert.equal(probe.handshake.cache, identity.cache, `${label}: cache worker inattesa`);
  assert.equal(probe.cacheKeys.includes(identity.cache), true, `${label}: cache release assente`);
  assert.match(probe.controller || '', /\/sw\.js\?v=/, `${label}: controller non production`);
  return probe;
}

async function seedChosenStep(cdp, stable) {
  const title = 'Passo di prova per l\u2019upgrade reale', id = 'qa-real-upgrade-quest';
  await evaluate(cdp, `(async()=>{window.__seedProbe={done:false};try{
    const tk=todayKey();
    S.quests=(S.quests||[]).filter(item=>item&&item.id!==${JSON.stringify(id)});
    S.quests.push({id:${JSON.stringify(id)},titolo:${JSON.stringify(title)},note:'',quando:tk,ora:'',prio:3,fatto:false,nata:tk});
    S.patto={tk,id:${JSON.stringify(id)},audace:false};
    S.vistoVersione=APP_VERSION;
    localStorage.setItem('sentiero-onboarded','1');
    if(!salvaSubito())throw new Error('salvataggio stato fallito');
    renderSubito();
    const cache=await caches.open(${JSON.stringify(stable.cache)}),entries=(await cache.keys()).map(request=>request.url);
    window.__seedProbe={done:true,tk,patto:S.patto,quest:S.quests.find(item=>item.id===${JSON.stringify(id)}),entries};
  }catch(error){window.__seedProbe={done:true,error:String(error&&error.stack||error)}}})()`);
  const seeded = await waitValue(cdp, 'window.__seedProbe?.done && window.__seedProbe', 15000, 'preparazione Patto/Quest stable');
  assert.equal(seeded.error, undefined, seeded.error);
  assert.deepEqual(seeded.patto, { tk: seeded.tk, id, audace: false });
  assert.equal(seeded.quest.titolo, title);
  assert.equal(seeded.entries.some(url => /\/index\.html(?:\?|$)/.test(url)), true, 'shell stable non scaldata');
  await reloadDocument(cdp);
  await probeRelease(cdp, stable, 'stable dopo riapertura');
  const persisted = await evaluate(cdp, `(()=>{const quest=S.quests.find(item=>item.id===${JSON.stringify(id)});return {tk:todayKey(),patto:S.patto,quest};})()`);
  assert.deepEqual(persisted.patto, { tk: persisted.tk, id, audace: false }, 'Patto stable perso al reload');
  assert.equal(persisted.quest?.titolo, title, 'Quest stable persa al reload');
  return { id, title, tk: persisted.tk };
}

async function attemptInstallCandidate(cdp, candidate) {
  await evaluate(cdp, `(async()=>{window.__upgradeProbe={done:false};try{
    const identify=controller=>new Promise((resolve,reject)=>{
      const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('identity timeout')),4000);
      channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data)};
      controller.postMessage({q:'gen'},[channel.port2]);
    });
    const registration=await navigator.serviceWorker.getRegistration('/');
    if(!registration)throw new Error('registrazione stable assente');
    const before=await identify(navigator.serviceWorker.controller);
    await registration.update();
    const limit=Date.now()+30000;let after=null;
    while(Date.now()<limit){
      const controller=navigator.serviceWorker.controller;
      if(controller){try{after=await identify(controller);}catch(_){}
      if(after&&after.build===${JSON.stringify(candidate.build)})break;
      }
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    // Il recupero è ammesso solo con candidate interamente installata, core in
    // cache e vecchio worker ancora active/controller. Non basta un timeout.
    const waiting=registration.waiting,active=registration.active;
    const waitingIdentity=waiting?await identify(waiting):null;
    const cache=await caches.open(${JSON.stringify(candidate.cache)});
    const coreReady=(await Promise.all(['./','./index.html','./manifest.json','./sentiero-app.js?v=${candidate.packageVersion}','./sentiero-day.mjs?v=${candidate.packageVersion}'].map(asset=>cache.match(asset)))).every(Boolean);
    const stalled=after?.build===before.build && active===navigator.serviceWorker.controller && active?.state==='activated' && waiting?.state==='installed' && waitingIdentity?.build===${JSON.stringify(candidate.build)} && waitingIdentity?.generation===${candidate.generation} && !registration.installing && coreReady;
    let cacheKeys=await caches.keys(), settled=0;
    while(cacheKeys.includes(before.cache)&&settled<20){await new Promise(r=>setTimeout(r,100));cacheKeys=await caches.keys();settled++;}
    window.__upgradeProbe={done:true,before,after,stalled,coreReady,waitingIdentity,activeState:active?.state,waitingState:waiting?.state,controller:navigator.serviceWorker.controller&&navigator.serviceWorker.controller.scriptURL,cacheKeys};
  }catch(error){window.__upgradeProbe={done:true,error:String(error&&error.stack||error)}}})()`);
  return waitValue(cdp, 'window.__upgradeProbe?.done && window.__upgradeProbe', 40000, 'attivazione candidate');
}

async function installCandidate(cdp, candidate) {
  let result = await attemptInstallCandidate(cdp, candidate);
  const first = result;
  if (!result.error && result.stalled) {
    /* Stato osservato nel lifecycle di Chrome: il solo waiting non prova una
       causa del motore. Il gate richiede identità e core validi, poi concede
       la singola riapertura disponibile anche all’utente. Secondo stallo FAIL. */
    console.log('service-worker-real-upgrade: stallo Chrome nell’attivazione della candidate (waiting mai promosso ad active), un reload pulito e un solo nuovo tentativo');
    await reloadDocument(cdp);
    await waitValue(cdp, runtimeReady, 30000, 'candidate stallata: runtime dopo reload');
    result = await attemptInstallCandidate(cdp, candidate);
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.after?.build, candidate.build, 'il controller non e passato alla candidate');
  assert.equal(result.after?.generation, candidate.generation, 'generazione candidate inattesa');
  assert.equal(result.after?.cache, candidate.cache, 'cache candidate inattesa');
  assert.equal(result.cacheKeys.includes(candidate.cache), true, 'cache candidate non creata');
  return {...result, before:first.before, recovered:first.stalled === true};
}

async function probePasso(cdp, identity, chosen, label) {
  await probeRelease(cdp, identity, label);
  await evaluate(cdp, `(()=>{window.__passoProbe={done:false};try{
    const step=currentPattoStep(),entry=document.querySelector('#flow [data-flow="passo"]');
    apriPasso();
    const room=document.getElementById('passo-room'),heading=room&&room.querySelector('#passo-title');
    window.__passoProbe={done:true,tk:todayKey(),patto:S.patto,quest:S.quests.find(item=>item.id===${JSON.stringify(chosen.id)}),step:step&&{id:step.item.id,kind:step.kind,done:step.done},entry:!!entry,open:!!room?.open,title:heading&&heading.textContent};
  }catch(error){window.__passoProbe={done:true,error:String(error&&error.stack||error)}}})()`);
  const probe = await waitValue(cdp, 'window.__passoProbe?.done && window.__passoProbe', 15000, `${label}: riapertura Passo`);
  assert.equal(probe.error, undefined, probe.error);
  assert.deepEqual(probe.patto, { tk: chosen.tk, id: chosen.id, audace: false }, `${label}: Patto scelto mutato`);
  assert.equal(probe.quest?.titolo, chosen.title, `${label}: Quest scelta mutata`);
  assert.deepEqual(probe.step, { id: chosen.id, kind: 'quest', done: false }, `${label}: passo runtime non risolto`);
  assert.equal(probe.entry, true, `${label}: ingresso Passo assente da Parla`);
  assert.equal(probe.open, true, `${label}: dialog Passo non aperto`);
  assert.equal(probe.title, chosen.title, `${label}: titolo Passo inatteso`);
  return probe;
}

async function main() {
  const tempPrefix = 'sentiero-real-upgrade-', tempRoot = directTempPath(tempPrefix);
  let switching, child, cdp, stderr = '', failure;
  try {
    const stableRoot = exportStable(tempRoot);
    const stable = readIdentity(stableRoot), candidate = readIdentity(root);
    assert.equal(stable.packageVersion, '60.274.5', `il commit ${stableRevision} non e la stable attesa`);
    assert.equal(stable.build, 'v60S.274.5', `build inattesa nel commit ${stableRevision}`);
    assert.notEqual(candidate.build, stable.build, 'candidate non bumpata: il gate richiede un vero cambio di release');
    assert.ok(candidate.generation > stable.generation, 'la generazione candidate deve avanzare');

    switching = createSwitchingServer(stableRoot);
    await new Promise(resolve => switching.server.listen(0, '127.0.0.1', resolve));
    const appPort = switching.server.address().port, debugPort = await getFreePort();
    const profile = path.join(tempRoot, 'chrome-profile'); fs.mkdirSync(profile);
    child = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps',
      '--disable-extensions', '--disable-sync', '--metrics-recording-only',
      `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
      `http://127.0.0.1:${appPort}/index.html?real-upgrade=stable`
    ], { windowsHide: true });
    child.stderr.on('data', chunk => { stderr += chunk; });

    const target = await getPageTarget(debugPort); cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
    await probeRelease(cdp, stable, 'stable iniziale');
    const chosen = await seedChosenStep(cdp, stable);

    switching.useCandidate();
    const transition = await installCandidate(cdp, candidate);
    assert.equal(transition.before.build, stable.build, 'controller di partenza non stable');
    assert.equal(transition.cacheKeys.includes(stable.cache), false, 'cache stable non rimossa dopo activate');

    await reloadDocument(cdp, true);
    await probePasso(cdp, candidate, chosen, 'candidate online');
    await evaluate(cdp, `(()=>{if(document.getElementById('passo-room')?.open)chiudiPasso();return true})()`);

    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' });
    await reloadDocument(cdp);
    await probePasso(cdp, candidate, chosen, 'candidate offline');

    console.log(`PASS upgrade reale ${stable.build} (${stableRevision}) -> ${candidate.build}: controller/cache/runtime aggiornati; Patto e Quest preservati; Passo riaperto online e offline`);
  } catch (error) {
    failure = new Error(`${error.message}${stderr ? ' | Chrome: ' + stderr.slice(-500) : ''}`);
  } finally {
    try { await stopChrome(cdp, child); } catch (error) { if (!failure) failure = error; }
    if (switching?.server) {
      if (typeof switching.server.closeAllConnections === 'function') switching.server.closeAllConnections();
      await new Promise(resolve => switching.server.close(resolve));
    }
    try { removeOwnedTemp(tempRoot, tempPrefix); } catch (error) { if (!failure) failure = error; }
  }
  if (failure) throw failure;
}

await main();
