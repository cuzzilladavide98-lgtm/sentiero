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
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const swSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const release = {
  version: packageVersion,
  build: swSource.match(/const RELEASE_BUILD = '([^']+)'/)?.[1],
  generation: Number(swSource.match(/const SW_GENERATION = (\d+)/)?.[1]),
  cache: swSource.match(/const CACHE = '([^']+)'/)?.[1],
  appAsset: swSource.match(/['"](\.\/sentiero-app\.js\?v=[^'"]+)['"]/)?.[1]
};
assert.ok(release.build && release.generation && release.cache && release.appAsset, 'identità release incompleta in sw.js');
assert.equal(release.build, `v60S.${packageVersion.split('.').slice(1).join('.')}`, 'package e build SW non coerenti');
assert.equal(release.appAsset, `./sentiero-app.js?v=${packageVersion}`, 'asset runtime SW non coerente con package');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const LONG_TITLE = 'Preparare con calma il documento molto lungo che deve restare leggibile anche sullo schermo più stretto senza perdere una sola parola importante';
const EDITED_TITLE = 'Consegnare il documento corretto';
const EDITED_NOTE = 'Rileggere allegati e ultima pagina prima dell’invio.';

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
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
  constructor(socket) { this.socket = socket; this.id = 0; this.pending = new Map(); socket.addEventListener('message', event => this.onMessage(event)); }
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

async function waitRowSettled(cdp, selector, timeoutMs, label) {
  const started = Date.now(); let state = null;
  while (Date.now() - started < timeoutMs) {
    state = await evaluate(cdp, `(()=>{const row=document.querySelector(${JSON.stringify(selector)});return {exists:!!row,busy:!!row?.dataset.busy,dialogOpen:!!document.querySelector('#passo-room')?.open,pressed:row?.querySelector('.chk')?.getAttribute('aria-pressed')??null};})()`);
    if (state.exists && !state.busy) return state;
    await sleep(100);
  }
  throw new Error(`timeout readiness: ${label} | ${JSON.stringify(state)}`);
}

async function pressKey(cdp, key, code, windowsVirtualKeyCode, modifiers = 0) {
  const params = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

async function captureReview(cdp, name) {
  if (!process.env.SENTIERO_STEP_SCREENSHOTS) return;
  const outputDir = path.join(root, 'qa-artifacts', 'astra'); fs.mkdirSync(outputDir, { recursive: true });
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  fs.writeFileSync(path.join(outputDir, name), Buffer.from(shot.data, 'base64'));
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
  if (cdp) { try { await Promise.race([cdp.send('Browser.close'), sleep(1500)]); } catch (_) {} await cdp.close(); }
  if (await waitForExit(child, 2000)) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid)) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch (_) {} }
  if (!await waitForExit(child, 3000)) throw new Error(`Chrome PID ${child.pid} non terminato dal teardown`);
}

function fixtureExpression(title = LONG_TITLE) {
  return `(()=>{const tk=todayKey(),dow=dowOf(),quest={id:'patto-quest',titolo:${JSON.stringify(title)},note:'Nota iniziale',quando:tk,ora:'',prio:2,fatto:false,nata:tk,monte:''},other={id:'patto-other',titolo:'Secondo passo scelto',note:'',quando:tk,ora:'',prio:3,fatto:false,nata:tk,monte:''},task={id:'patto-task',titolo:'Telefonare alla fonte',days:[dow],time:'',prio:2};S.quests=[quest,other];S.scheduled=[task];S.checks={};S.questLog=[];S.patto={tk,id:quest.id,audace:true};S.essentials=[];S.riposi={};S.ferie={};S.lastDayInit=tk;salvaSubito();renderSubito([]);return {tk,dow,patto:S.patto};})()`;
}

const stateProbe = `(id,kind)=>{const q=(S.quests||[]).find(item=>item&&item.id===id),tk=todayKey(),logs=(S.questLog||[]).filter(item=>item&&item.day===tk&&item.titolo===(q&&q.titolo)).map(item=>({titolo:item.titolo,day:item.day,nata:item.nata||''}));return {fatto:!!(q&&q.fatto),checked:!!(S.checks[tk]&&S.checks[tk][id]===true),logs,progress:computeProgress(S,tk,dowOf()),kind};}`;

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sentiero-patto-step-'));
const debugPort = await freePort(), appPort = server.address().port;
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', '--window-size=375,700', '--force-device-scale-factor=2', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
let cdp, failure = null, stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });

try {
  cdp = await connect((await pageTarget(debugPort)).webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Rome' });
  await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('sentiero-onboarded','1');window.__stepErrors=[];addEventListener('error',event=>__stepErrors.push(String(event.message||event.error||'error')));addEventListener('unhandledrejection',event=>__stepErrors.push(String(event.reason&&event.reason.message||event.reason||'rejection')));` });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/index.html?patto-step=${Date.now()}` });
  await waitValue(cdp, `typeof window.apriPasso==='function'&&typeof renderSubito==='function'&&typeof computeProgress==='function'`, 20000, 'runtime Passo');
  const normalMotion = await evaluate(cdp, `!matchMedia('(prefers-reduced-motion: reduce)').matches`);
  assert.equal(normalMotion, true, 'i percorsi di interazione devono esercitare il moto normale');
  const warm = await waitValue(cdp, `(async()=>{if(!navigator.serviceWorker?.controller)return null;const reg=await navigator.serviceWorker.ready,c=await caches.open(${JSON.stringify(release.cache)}),assets=await Promise.all(['./index.html',${JSON.stringify(release.appAsset)}].map(x=>c.match(x).then(Boolean)));return assets.every(Boolean)?{controller:!!navigator.serviceWorker.controller,scope:reg.scope}:null;})()`, 20000, 'service worker e shell caldi');
  assert.equal(warm.controller, true);

  const fixture = await evaluate(cdp, fixtureExpression());
  assert.deepEqual(Object.keys(fixture.patto).sort(), ['audace', 'id', 'tk'], 'il Patto esistente non deve acquisire nuovi campi persistenti');
  await evaluate(cdp, `document.querySelector('#barra a[data-sez="oggi"]').click()`);
  const todayTrigger = await waitValue(cdp, `(()=>{const b=document.querySelector('.patto-riprendi');return b&&b.getClientRects().length?{label:b.textContent,tag:b.tagName}:null;})()`, 5000, 'ripresa in Oggi');
  assert.equal(todayTrigger.tag, 'BUTTON');

  // Misura lo stesso gesto in un unico task JS: bootstrap sync e dono hanno
  // scritture autonome che possono cadere fra due richieste CDP separate.
  const openStorage = await evaluate(cdp, `(()=>{const before=Object.entries(localStorage).sort();const b=document.querySelector('.patto-riprendi');b.focus();b.click();return {before,after:Object.entries(localStorage).sort()};})()`);
  const nativeDialog = await waitValue(cdp, `(()=>{const d=document.querySelector('#passo-room');return d?.open?{tag:d.tagName,modal:d.matches(':modal'),id:d.querySelector('.item')?.dataset.qid,title:d.querySelector('.ttl')?.textContent,note:[...d.querySelectorAll('.meta')].map(x=>x.textContent).join(' '),patto:S.patto}:null;})()`, 5000, 'dialogo Passo da Oggi');
  assert.equal(nativeDialog.tag, 'DIALOG'); assert.equal(nativeDialog.modal, true); assert.equal(nativeDialog.id, 'patto-quest');
  assert.equal(nativeDialog.title, LONG_TITLE); assert.match(nativeDialog.note, /Nota iniziale/);
  assert.deepEqual(nativeDialog.patto, fixture.patto);
  assert.deepEqual(openStorage.after, openStorage.before, 'il gesto di apertura del Passo non deve scrivere chiavi o valori persistenti');
  await evaluate(cdp, `document.querySelector('#passo-room .passo-back').click()`);
  await waitValue(cdp, `!document.querySelector('#passo-room')?.open&&document.activeElement===document.querySelector('.patto-riprendi')`, 3000, 'chiusura back e focus restituito');

  await evaluate(cdp, `document.querySelector('#list-quest-today [data-qid="patto-quest"] .editq').click()`);
  await waitValue(cdp, `!document.querySelector('#quest-editor')?.classList.contains('hidden')`, 3000, 'editor quest');
  await evaluate(cdp, `(()=>{const title=document.querySelector('#qedit-titolo'),note=document.querySelector('#qedit-note');title.value=${JSON.stringify(EDITED_TITLE)};title.dispatchEvent(new Event('input',{bubbles:true}));note.value=${JSON.stringify(EDITED_NOTE)};note.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#qedit-save').click();})()`);
  await waitValue(cdp, `S.quests.find(q=>q.id==='patto-quest')?.titolo===${JSON.stringify(EDITED_TITLE)}&&document.querySelector('#quest-editor')?.classList.contains('hidden')`, 5000, 'rinomina salvata');
  await evaluate(cdp, `document.querySelector('.patto-riprendi').click()`);
  const edited = await waitValue(cdp, `(()=>{const d=document.querySelector('#passo-room');if(!d?.open)return null;return {title:d.querySelector('.ttl')?.textContent,note:[...d.querySelectorAll('.meta')].map(x=>x.textContent).join(' ')};})()`, 3000, 'Passo aggiornato');
  assert.equal(edited.title, EDITED_TITLE); assert.match(edited.note, new RegExp(EDITED_NOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await evaluate(cdp, `document.querySelector('#passo-room .passo-back').click()`);

  await evaluate(cdp, `document.querySelector('#list-quest-today [data-qid="patto-quest"] .chk').click()`);
  const baselineQuest = await waitValue(cdp, `S.quests.find(q=>q.id==='patto-quest')?.fatto&&(${stateProbe})('patto-quest','quest')`, 5000, 'baseline quest completata');
  await waitRowSettled(cdp, '#list-quest-today [data-qid="patto-quest"]', 5000, 'baseline quest stabile');
  await evaluate(cdp, `document.querySelector('#list-quest-today [data-qid="patto-quest"] .chk').click()`);
  await waitValue(cdp, `!S.quests.find(q=>q.id==='patto-quest')?.fatto&&(${stateProbe})('patto-quest','quest')`, 5000, 'undo baseline quest');

  await evaluate(cdp, `(()=>{const trigger=document.querySelector('.patto-riprendi');trigger.focus();trigger.click();const b=document.querySelector('#passo-room .item[data-qid="patto-quest"] .chk');b.click();b.click();document.querySelector('#passo-room .passo-back').click();})()`);
  const passoQuest = await waitValue(cdp, `S.quests.find(q=>q.id==='patto-quest')?.fatto&&(${stateProbe})('patto-quest','quest')`, 5000, 'doppio tap Passo');
  assert.deepEqual(passoQuest, baselineQuest, 'la riga Passo deve usare lo stesso stato della riga Oggi');
  assert.equal(passoQuest.logs.length, 1, 'il doppio tap deve produrre un solo log');
  const immediateClose = await waitValue(cdp, `(()=>{const row=document.querySelector('#list-quest-today [data-qid="patto-quest"]');return !document.querySelector('#passo-room')?.open&&row?.classList.contains('done')?{done:true,busy:!!row.dataset.busy,logs:(${stateProbe})('patto-quest','quest').logs.length}:null;})()`, 3000, 'lista aggiornata alla chiusura durante completion');
  assert.deepEqual(immediateClose, { done: true, busy: false, logs: 1 });
  await evaluate(cdp, `(()=>{const trigger=document.querySelector('.patto-riprendi');trigger.focus();trigger.click();})()`);
  assert.equal(await waitValue(cdp, `document.querySelector('#passo-room')?.open&&document.querySelector('#passo-room .item[data-qid="patto-quest"] .chk')?.getAttribute('aria-pressed')==='true'`, 3000, 'riapertura coerente durante completion'), true);
  assert.equal(await evaluate(cdp, `document.querySelector('#passo-room')?.open&&document.querySelector('#passo-room .item[data-qid="patto-quest"]')!==null`), true, 'il completamento non deve chiudere o avanzare automaticamente');
  await waitRowSettled(cdp, '#passo-room .item[data-qid="patto-quest"]', 5000, 'Passo completato stabile');
  assert.equal(await evaluate(cdp, `document.querySelector('#list-quest-today [data-qid="patto-quest"]')?.classList.contains('done')&&(${stateProbe})('patto-quest','quest').logs.length===1`), true, 'il settle dopo la chiusura ha lasciato lista o log obsoleti');
  await evaluate(cdp, `document.querySelector('#passo-room .item[data-qid="patto-quest"] .chk').click()`);
  const undoQuest = await waitValue(cdp, `!S.quests.find(q=>q.id==='patto-quest')?.fatto&&(${stateProbe})('patto-quest','quest')`, 5000, 'undo reale nel Passo');
  assert.equal(undoQuest.checked, false); assert.equal(undoQuest.logs.length, 0);
  await waitRowSettled(cdp, '#passo-room .item[data-qid="patto-quest"]', 5000, 'undo Passo stabile');
  await evaluate(cdp, `document.querySelector('#passo-room .passo-back').click();document.querySelector('#barra a[data-sez="parla"]').click()`);

  const flowTrigger = await waitValue(cdp, `(()=>{const b=document.querySelector('#flow [data-flow="passo"]');return b&&b.getClientRects().length?{label:b.textContent}:null;})()`, 5000, 'ripresa in Parla');
  assert.match(flowTrigger.label, /passo/i);
  await evaluate(cdp, `(()=>{const b=document.querySelector('#flow [data-flow="passo"]');b.focus();b.click();})()`);
  await waitValue(cdp, `document.querySelector('#passo-room')?.open`, 3000, 'dialogo da Parla');
  await pressKey(cdp, 'Tab', 'Tab', 9);
  assert.equal(await evaluate(cdp, `document.querySelector('#passo-room').contains(document.activeElement)`), true, 'Tab è uscito dal dialogo modale');
  await pressKey(cdp, 'Tab', 'Tab', 9, 8);
  assert.equal(await evaluate(cdp, `document.querySelector('#passo-room').contains(document.activeElement)`), true, 'Shift+Tab è uscito dal dialogo modale');
  await pressKey(cdp, 'Escape', 'Escape', 27);
  await waitValue(cdp, `!document.querySelector('#passo-room')?.open&&document.activeElement===document.querySelector('#flow [data-flow="passo"]')`, 3000, 'Escape e focus restituito a Parla');

  const beforeOnlineReload = await evaluate(cdp, `performance.timeOrigin`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitValue(cdp, `performance.timeOrigin!==${JSON.stringify(beforeOnlineReload)}&&typeof window.apriPasso==='function'`, 20000, 'runtime dopo reload');
  assert.equal(await evaluate(cdp, `!document.querySelector('#passo-room')?.open&&document.body.dataset.sez==='parla'`), true, 'il reload non deve aprire o navigare automaticamente');
  await waitValue(cdp, `document.querySelector('#flow [data-flow="passo"]')`, 5000, 'ripresa stesso giorno dopo reload');

  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const beforeOfflineReload = await evaluate(cdp, `performance.timeOrigin`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitValue(cdp, `performance.timeOrigin!==${JSON.stringify(beforeOfflineReload)}&&typeof window.apriPasso==='function'`, 20000, 'runtime offline dal service worker');
  const offline = await waitValue(cdp, `(()=>{const b=document.querySelector('#flow [data-flow="passo"]');return navigator.serviceWorker?.controller&&b?{controller:true,open:!!document.querySelector('#passo-room')?.open}:null;})()`, 5000, 'Passo offline');
  assert.deepEqual(offline, { controller: true, open: false });
  await evaluate(cdp, `document.querySelector('#flow [data-flow="passo"]').click()`);
  await waitValue(cdp, `document.querySelector('#passo-room')?.open&&document.querySelector('#passo-room .ttl')?.textContent===${JSON.stringify(EDITED_TITLE)}`, 3000, 'Passo aperto offline');
  await evaluate(cdp, `document.querySelector('#passo-room .passo-back').click()`);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  await evaluate(cdp, fixtureExpression());
  await evaluate(cdp, `document.querySelector('#barra a[data-sez="oggi"]').click();document.querySelector('.patto-riprendi').click()`);
  await waitValue(cdp, `document.querySelector('#passo-room')?.open`, 3000, 'Passo prima del cambio identità');
  await evaluate(cdp, `S.patto={tk:todayKey(),id:'patto-other',audace:false};salvaSubito();window.dispatchEvent(new Event('sentiero:state'))`);
  await waitValue(cdp, `!document.querySelector('#passo-room')?.open&&document.querySelector('.patto-riprendi')`, 3000, 'dialogo obsoleto chiuso al cambio identità');
  await evaluate(cdp, `document.querySelector('.patto-riprendi').click()`);
  await waitValue(cdp, `document.querySelector('#passo-room')?.open&&document.querySelector('#passo-room .item')?.dataset.qid==='patto-other'`, 3000, 'nuova identità risolta');
  await evaluate(cdp, `(()=>{window.__stalePassoCheck=document.querySelector('#passo-room .chk');window.__replacedPassoQuest=S.quests.find(q=>q.id==='patto-other');S.quests=S.quests.map(q=>q.id==='patto-other'?Object.assign({},q,{titolo:'Secondo passo sostituito',note:'Oggetto nuovo, stesso identificatore'}):q);salvaSubito();window.dispatchEvent(new Event('sentiero:state'));})()`);
  const replacement = await waitValue(cdp, `(()=>{const q=S.quests.find(x=>x.id==='patto-other'),check=document.querySelector('#passo-room .chk');return document.querySelector('#passo-room')?.open&&document.querySelector('#passo-room .ttl')?.textContent==='Secondo passo sostituito'?{newObject:q!==window.__replacedPassoQuest,newHandler:check!==window.__stalePassoCheck,note:[...document.querySelectorAll('#passo-room .meta')].map(x=>x.textContent).join(' ')}:null;})()`, 3000, 'oggetto sostituito con stesso ID');
  assert.equal(replacement.newObject, true); assert.equal(replacement.newHandler, true); assert.match(replacement.note, /Oggetto nuovo/);
  await evaluate(cdp, `window.__stalePassoCheck.click()`);
  assert.equal(await evaluate(cdp, `!S.quests.find(q=>q.id==='patto-other').fatto&&(S.questLog||[]).filter(x=>x.day===todayKey()&&x.titolo==='Secondo passo sostituito').length===0`), true, 'un handler legato all’oggetto sostituito ha mutato lo stato nuovo');
  await evaluate(cdp, `delete window.__stalePassoCheck;delete window.__replacedPassoQuest`);
  await evaluate(cdp, `document.querySelector('#passo-room .passo-back').click()`);

  await evaluate(cdp, `S.patto={tk:todayKey(),id:'patto-quest',audace:true};salvaSubito();renderSubito([]);document.querySelector('#list-quest-today [data-qid="patto-quest"] .editq').click()`);
  await waitValue(cdp, `!document.querySelector('#quest-editor')?.classList.contains('hidden')`, 3000, 'editor per rinvio');
  await evaluate(cdp, `(()=>{const d=new Date();d.setDate(d.getDate()+1);document.querySelector('#qedit-quando').value=localDayKey(d);document.querySelector('#qedit-save').click();})()`);
  await waitValue(cdp, `!document.querySelector('.patto-riprendi')&&!document.querySelector('#flow [data-flow="passo"]')`, 5000, 'Patto rinviato invalidato');

  await evaluate(cdp, fixtureExpression());
  const deleted = await evaluate(cdp, `(()=>{document.querySelector('#list-quest-today [data-qid="patto-quest"] .del').click();return {exists:S.quests.some(q=>q.id==='patto-quest'),todayTrigger:!!document.querySelector('.patto-riprendi'),flowTrigger:!!document.querySelector('#flow [data-flow="passo"]')};})()`);
  assert.deepEqual(deleted, { exists: false, todayTrigger: false, flowTrigger: false }, `Patto eliminato non invalidato: ${JSON.stringify(deleted)}`);

  await evaluate(cdp, fixtureExpression());
  await evaluate(cdp, `S.patto={tk:todayKey(),id:'patto-task',audace:false};salvaSubito();renderSubito([])`);
  const baselineTaskInitial = await waitValue(cdp, `document.querySelector('#list-task [data-tid="patto-task"] .chk')&&(${stateProbe})('patto-task','task')`, 3000, 'task pianificata baseline');
  assert.equal(baselineTaskInitial.logs.length, 0);
  await evaluate(cdp, `document.querySelector('#list-task [data-tid="patto-task"] .chk').click()`);
  const baselineTask = await waitValue(cdp, `S.checks[todayKey()]?.['patto-task']&&(${stateProbe})('patto-task','task')`, 5000, 'task baseline completata');
  await waitRowSettled(cdp, '#list-task [data-tid="patto-task"]', 5000, 'task baseline stabile');
  const baselineTaskUndo = await evaluate(cdp, `(()=>{const row=document.querySelector('#list-task [data-tid="patto-task"]'),before=S.checks[todayKey()]?.['patto-task'];row.querySelector('.chk').click();return {before,after:S.checks[todayKey()]?.['patto-task'],busy:!!row.dataset.busy};})()`);
  assert.deepEqual(baselineTaskUndo, { before: true, after: false, busy: true }, `undo task baseline non sincrono: ${JSON.stringify(baselineTaskUndo)}`);
  await evaluate(cdp, `document.querySelector('.patto-riprendi').click();document.querySelector('#passo-room .item[data-tid="patto-task"] .chk').click()`);
  const passoTask = await waitValue(cdp, `S.checks[todayKey()]?.['patto-task']&&(${stateProbe})('patto-task','task')`, 5000, 'task pianificata nel Passo');
  assert.deepEqual(passoTask, baselineTask, 'la task nel Passo deve equivalere alla riga Oggi');
  await waitRowSettled(cdp, '#passo-room .item[data-tid="patto-task"]', 5000, 'task Passo stabile');
  // Il merge sync sostituisce gli oggetti anche quando i valori sono uguali.
  await evaluate(cdp, `S.scheduled=S.scheduled.map(t=>({...t}));window.dispatchEvent(new Event('sentiero:state'))`);
  const taskUndo = await evaluate(cdp, `(()=>{const row=document.querySelector('#passo-room .item[data-tid="patto-task"]'),before=S.checks[todayKey()]?.['patto-task'];row.querySelector('.chk').click();return {before,after:S.checks[todayKey()]?.['patto-task'],busy:!!row.dataset.busy,sameRow:row===document.querySelector('#passo-room .item'),open:document.querySelector('#passo-room').open};})()`);
  assert.deepEqual(taskUndo, {before:true,after:false,busy:true,sameRow:true,open:true}, 'undo task nel Passo deve agire una sola volta sullo stato corrente');
  await waitValue(cdp, `S.checks[todayKey()]?.['patto-task']===false&&document.querySelector('#passo-room')?.open`, 5000, 'undo task nel Passo');
  await evaluate(cdp, `document.querySelector('#passo-room .passo-back').click()`);

  const boundary = await evaluate(cdp, `(()=>{const before=new Date('2026-09-05T02:19:59.000Z'),after=new Date('2026-09-05T02:20:00.000Z');return {beforeLocal:before.toLocaleString('it-IT',{timeZone:'Europe/Rome'}),afterLocal:after.toLocaleString('it-IT',{timeZone:'Europe/Rome'}),beforeKey:localDayKey(before),afterKey:localDayKey(after)};})()`);
  assert.equal(boundary.beforeKey, '2026-09-04'); assert.equal(boundary.afterKey, '2026-09-05');
  await evaluate(cdp, `(()=>{window.__StepRealDate=Date;const fixed=Date.parse('2026-09-05T02:19:59.000Z');Date=class extends __StepRealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};const tk=todayKey();S.quests=[{id:'boundary-step',titolo:'Passo prima dell’alba',note:'',quando:tk,ora:'',prio:2,fatto:false,nata:tk,monte:''}];S.scheduled=[];S.checks={};S.questLog=[];S.patto={tk,id:'boundary-step',audace:false};salvaSubito();renderSubito([]);_orologioDelGiorno();document.querySelector('#barra a[data-sez="oggi"]').click();})()`);
  await waitValue(cdp, `document.querySelector('.patto-riprendi')`, 3000, 'Patto valido alle 04:19:59');
  await evaluate(cdp, `(()=>{const b=document.querySelector('.patto-riprendi');b.focus();b.click();})()`);
  await waitValue(cdp, `document.querySelector('#passo-room')?.open`, 3000, 'Passo aperto prima delle 04:20');
  await evaluate(cdp, `(()=>{const fixed=Date.parse('2026-09-05T02:20:00.000Z');Date=class extends __StepRealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};_orologioDelGiorno();})()`);
  await waitValue(cdp, `!document.querySelector('#passo-room')?.open&&!document.querySelector('.patto-riprendi')&&!document.querySelector('#flow [data-flow="passo"]')`, 3000, 'Patto aperto invalidato dall’orologio alle 04:20');
  await evaluate(cdp, `window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));document.dispatchEvent(new Event('visibilitychange'))`);
  assert.equal(await evaluate(cdp, `!document.querySelector('#passo-room')?.open&&!document.querySelector('.patto-riprendi')&&!document.querySelector('#flow [data-flow="passo"]')`), true, 'pageshow/visibility hanno ripristinato il Patto scaduto');
  await evaluate(cdp, `Date=window.__StepRealDate;delete window.__StepRealDate`);

  await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate(cdp, fixtureExpression(LONG_TITLE));
  await evaluate(cdp, `document.querySelector('#barra a[data-sez="oggi"]').click();document.querySelector('.patto-riprendi').click()`);
  await waitValue(cdp, `document.querySelector('#passo-room')?.open`, 3000, 'dialogo per viewport');
  const viewports = {};
  for (const width of [320, 375, 430, 1024]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width === 1024 ? 768 : 700, deviceScaleFactor: 2, mobile: width < 600 });
    const metrics = await evaluate(cdp, `(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const d=document.querySelector('#passo-room'),row=d.querySelector('.item'),back=d.querySelector('.passo-back'),check=row.querySelector('.chk'),title=d.querySelector('.ttl'),status=d.querySelector('.passo-status'),eyebrow=d.querySelector('.passo-eyebrow'),dr=d.getBoundingClientRect(),rr=row.getBoundingClientRect(),rgb=value=>(value.match(/[\\d.]+/g)||[]).slice(0,3).map(Number),lum=value=>{const c=rgb(value).map(x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]},contrast=(a,b)=>{const x=lum(a),y=lum(b);return Math.round(((Math.max(x,y)+.05)/(Math.min(x,y)+.05))*100)/100},bg=getComputedStyle(d).backgroundColor;return {width:innerWidth,dialogInside:dr.left>=0&&dr.right<=innerWidth,rowInside:rr.left>=dr.left&&rr.right<=dr.right,dialogOverflow:d.scrollWidth>d.clientWidth,rowOverflow:row.scrollWidth>row.clientWidth,backHeight:back.getBoundingClientRect().height,checkWidth:check.getBoundingClientRect().width,checkHeight:check.getBoundingClientRect().height,title:title.textContent,titleBeforeAction:row.firstElementChild?.classList.contains('txt')===true,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,contrast:{ink:contrast(getComputedStyle(title).color,bg),muted:contrast(getComputedStyle(status).color,bg),accent:contrast(getComputedStyle(eyebrow).color,bg)}};})()`);
    assert.equal(metrics.width, width); assert.equal(metrics.dialogInside, true, `${width}px: dialogo fuori viewport`); assert.equal(metrics.rowInside, true, `${width}px: riga fuori dialogo`);
    assert.equal(metrics.dialogOverflow, false, `${width}px: overflow dialogo`); assert.equal(metrics.rowOverflow, false, `${width}px: overflow riga`);
    assert.ok(metrics.backHeight >= 44, `${width}px: indietro sotto 44px`); assert.ok(metrics.checkWidth >= 44 && metrics.checkHeight >= 44, `${width}px: spunta sotto 44px`);
    assert.equal(metrics.title, LONG_TITLE); assert.equal(metrics.titleBeforeAction, true, `${width}px: ordine DOM titolo/azione invertito`); assert.equal(metrics.reduced, true);
    assert.ok(metrics.contrast.ink >= 4.5, `${width}px: contrasto testo ${metrics.contrast.ink}:1`); assert.ok(metrics.contrast.muted >= 4.5, `${width}px: contrasto secondario ${metrics.contrast.muted}:1`); assert.ok(metrics.contrast.accent >= 4.5, `${width}px: contrasto accento ${metrics.contrast.accent}:1`); viewports[width] = metrics;
    await captureReview(cdp, `step-${width}.png`);
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 700, deviceScaleFactor: 2, mobile: true });
  await evaluate(cdp, `document.querySelector('#passo-room .chk').click()`);
  await waitValue(cdp, `S.quests.find(q=>q.id==='patto-quest')?.fatto===true`, 3000, 'stato completato per review');
  await waitRowSettled(cdp, '#passo-room .item[data-qid="patto-quest"]', 3000, 'Passo completato per review');
  await captureReview(cdp, 'step-375-completed.png');
  await evaluate(cdp, `document.querySelector('#passo-room .chk').click()`);
  await waitValue(cdp, `S.quests.find(q=>q.id==='patto-quest')?.fatto===false`, 3000, 'undo dopo review');
  await waitRowSettled(cdp, '#passo-room .item[data-qid="patto-quest"]', 3000, 'Passo ripristinato dopo review');
  await evaluate(cdp, `S.settings.uiTheme='carta';applyTheme()`);
  await evaluate(cdp, `(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()`);
  await captureReview(cdp, 'step-375-lcd.png');
  await evaluate(cdp, `S.settings.uiTheme='classico';applyTheme()`);

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 480, deviceScaleFactor: 2, mobile: true });
  const shortViewport = await evaluate(cdp, `(async()=>{const d=document.querySelector('#passo-room'),check=d.querySelector('.chk');d.scrollTop=d.scrollHeight;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const dr=d.getBoundingClientRect(),cr=check.getBoundingClientRect(),max=d.scrollHeight-d.clientHeight;return {height:innerHeight,scrollable:max>0,reachedBottom:Math.abs(d.scrollTop-max)<=1,horizontal:d.scrollWidth>d.clientWidth,actionVisible:cr.bottom>dr.top&&cr.top<dr.bottom};})()`);
  assert.deepEqual(shortViewport, { height: 480, scrollable: true, reachedBottom: true, horizontal: false, actionVisible: true }, 'viewport corta: il Passo non resta interamente percorribile');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });
  const magnified = await evaluate(cdp, `(()=>{const d=document.querySelector('#passo-room'),check=d.querySelector('.chk');check.scrollIntoView({block:'center'});check.focus({preventScroll:true});const cr=check.getBoundingClientRect(),vr=visualViewport;return {scale:vr.scale,focused:document.activeElement===check,actionHeight:cr.height,dialogHorizontal:d.scrollWidth>d.clientWidth};})()`);
  assert.ok(magnified.scale >= 1.24, `ingrandimento browser non applicato: ${magnified.scale}`); assert.equal(magnified.focused, true); assert.ok(magnified.actionHeight >= 44); assert.equal(magnified.dialogHorizontal, false);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

  const finalState = await evaluate(cdp, `({patto:S.patto,errors:window.__stepErrors,dialogOpen:!!document.querySelector('#passo-room')?.open})`);
  assert.deepEqual(Object.keys(finalState.patto).sort(), ['audace', 'id', 'tk']);
  assert.deepEqual(finalState.errors, [], 'errori browser nel percorso Passo');
  console.log(JSON.stringify({ release, normalMotion, nativeDialog: true, sameDayReload: true, offlineServiceWorker: true, questEquivalence: true, scheduledEquivalence: true, immediateCloseReopen: true, sameIdReplacement: true, boundary, viewports, shortViewport, magnified, finalState }, null, 2));
  console.log('PASS Passo del Patto: ripresa reale, stato condiviso, offline, lifecycle e accessibilità');
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
