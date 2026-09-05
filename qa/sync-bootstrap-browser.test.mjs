import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = [
  process.argv[2],
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/harness.html') {
      const body = '<!doctype html><meta charset="utf-8"><title>Sync bootstrap harness</title>';
      response.writeHead(200, { 'Content-Type': mime['.html'], 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
      response.end(body); return;
    }
    const relative = decodeURIComponent(url.pathname.slice(1)), file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw new Error('not found');
    const body = fs.readFileSync(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
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
  const result = await Promise.race([
    cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
    sleep(15000).then(() => { throw new Error(`timeout Runtime.evaluate: ${expression.slice(0, 120)}`); })
  ]);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'errore JavaScript nel browser');
  return result.result?.value;
}

async function waitValue(cdp, expression, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(cdp, expression);
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`timeout readiness: ${label}`);
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

const delayedGetAll = `(()=>{
  if(localStorage.getItem('sync-bootstrap-delay')!=='1')return;
  const nativeGetAll=IDBObjectStore.prototype.getAll;
  IDBObjectStore.prototype.getAll=function(...args){
    const request=nativeGetAll.apply(this,args);
    if(this.name!=='registers'||window.__registersGetAllWrapped)return request;
    window.__registersGetAllWrapped=true;
    let ready=false,released=false,result,error,onSuccess,onError;
    const facade={};
    Object.defineProperties(facade,{
      result:{get:()=>result},error:{get:()=>error},
      onsuccess:{set:value=>{onSuccess=value;flush();}},
      onerror:{set:value=>{onError=value;flush();}}
    });
    function flush(){
      if(!ready||!released)return;
      queueMicrotask(()=>error?onError&&onError.call(facade,{target:facade}):onSuccess&&onSuccess.call(facade,{target:facade}));
    }
    request.addEventListener('success',()=>{result=request.result;ready=true;window.__registersGetAllWaiting=true;flush();});
    request.addEventListener('error',()=>{error=request.error;ready=true;window.__registersGetAllWaiting=true;flush();});
    window.__releaseRegistersGetAll=()=>{released=true;flush();};
    return facade;
  };
})();`;

const loadSync = `(async()=>{await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/sentiero-sync.js?'+Date.now();script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});return !!window.SentieroSync;})()`;
const dbSnapshot = `(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('sentiero-data-v2',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});const read=name=>new Promise((resolve,reject)=>{const q=db.transaction(name,'readonly').objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});const meta=await read('meta'),ops=await read('ops'),registers=await read('registers');db.close();return {checkpoint:meta.find(x=>x.key==='checkpoint')?.value,ops,registers};})()`;
const stateA = {
  quests: [{ id: 'bootstrap-quest', titolo: 'Quest A', note: '', quando: '2026-09-05', fatto: false }],
  checks: {}, settings: { uiTheme: 'classico', lingua: 'it' }, streak: 0
};

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sentiero-sync-bootstrap-${process.pid}-`));
const debugPort = await freePort(), appPort = server.address().port;
const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
let cdp, failure = null, stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });

try {
  cdp = await connect((await pageTarget(debugPort)).webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: delayedGetAll });
  const navigate = async label => {
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/harness.html?${label}=${Date.now()}` });
    await waitValue(cdp, `document.readyState==='complete'`, 10000, label);
    assert.equal(await evaluate(cdp, loadSync), true);
  };

  await navigate('seed');
  await evaluate(cdp, `window.state=${JSON.stringify(stateA)};window.remoteStates=[];SentieroSync.bootstrap(window.state,{onRemote:next=>{window.state=next;window.remoteStates.push(structuredClone(next));localStorage.setItem('sync-bootstrap-state',JSON.stringify(next));}})`);
  await evaluate(cdp, `(async()=>{state.quests[0].note='persistita da capture A';localStorage.setItem('sync-bootstrap-state',JSON.stringify(state));await SentieroSync.capture(state);})()`);
  const before = await evaluate(cdp, dbSnapshot);
  assert.equal(before.registers.find(x => x.entity === 'quests:bootstrap-quest')?.fields?.note?.value, 'persistita da capture A', 'il seed deve esercitare una capture realmente persistita');
  const beforeIds = before.ops.map(op => op.opId);
  await evaluate(cdp, `localStorage.setItem('sync-bootstrap-delay','1')`);

  await navigate('race');
  await evaluate(cdp, `(()=>{window.state=JSON.parse(localStorage.getItem('sync-bootstrap-state'));window.remoteStates=[];window.bootstrapPromise=SentieroSync.bootstrap(window.state,{onRemote:next=>{window.state=next;window.remoteStates.push(structuredClone(next));localStorage.setItem('sync-bootstrap-state',JSON.stringify(next));}});return true;})()`);
  await waitValue(cdp, `window.__registersGetAllWaiting===true`, 5000, 'getAll registers ritardato');
  await evaluate(cdp, `(async()=>{state.checks={'2026-09-05':{rituale:true}};state.quests=[];localStorage.setItem('sync-bootstrap-state',JSON.stringify(state));await SentieroSync.capture(state);window.__releaseRegistersGetAll();await window.bootstrapPromise;})()`);
  const afterRaceState = await evaluate(cdp, `({quests:state.quests.map(x=>x.id),check:state.checks?.['2026-09-05']?.rituale===true,remoteCount:remoteStates.length})`);
  const afterRace = await evaluate(cdp, dbSnapshot);
  const raceNewOps = afterRace.ops.filter(op => !beforeIds.includes(op.opId));
  const raceEvidence = {
    live: afterRaceState,
    checkpoint: {
      quests: (afterRace.checkpoint?.quests || []).map(x => x.id),
      check: afterRace.checkpoint?.checks?.['2026-09-05']?.rituale === true
    },
    register: {
      questTombstone: !!afterRace.registers.find(x => x.entity === 'quests:bootstrap-quest')?.tombstone,
      check: afterRace.registers.find(x => x.entity === 'checks:2026-09-05')?.fields?.rituale?.value === true
    },
    journal: {
      added: raceNewOps.length,
      questDelete: raceNewOps.some(op => op.entity === 'quests:bootstrap-quest' && !!op.tombstone),
      checkUpdate: raceNewOps.some(op => op.entity === 'checks:2026-09-05' && op.fields?.rituale?.value === true)
    }
  };

  await evaluate(cdp, `localStorage.removeItem('sync-bootstrap-delay')`);
  await navigate('reload');
  const opsBeforeUnchanged = (await evaluate(cdp, dbSnapshot)).ops.length;
  await evaluate(cdp, `window.state=JSON.parse(localStorage.getItem('sync-bootstrap-state'));window.remoteStates=[];SentieroSync.bootstrap(window.state,{onRemote:next=>{window.state=next;window.remoteStates.push(structuredClone(next));localStorage.setItem('sync-bootstrap-state',JSON.stringify(next));}})`);
  const afterReload = await evaluate(cdp, dbSnapshot);
  const reloadEvidence = {
    quests: await evaluate(cdp, `state.quests.map(x=>x.id)`),
    check: await evaluate(cdp, `state.checks?.['2026-09-05']?.rituale===true`),
    opsBefore: opsBeforeUnchanged,
    opsAfter: afterReload.ops.length
  };

  const evidence = { race: raceEvidence, reload: reloadEvidence };
  const expected = {
    race: {
      live: { quests: [], check: true, remoteCount: 1 },
      checkpoint: { quests: [], check: true },
      register: { questTombstone: true, check: true },
      journal: { added: 2, questDelete: true, checkUpdate: true }
    },
    reload: { quests: [], check: true, opsBefore: before.ops.length + 2, opsAfter: before.ops.length + 2 }
  };
  assert.deepEqual(evidence, expected, `bootstrap/capture non atomici: ${JSON.stringify(evidence)}`);
  console.log(`PASS sync bootstrap browser: ${JSON.stringify(evidence)}`);
} catch (error) { failure = error; }
finally {
  server.close();
  try { await stopChrome(cdp, child); } catch (error) { if (!failure) failure = error; }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
}

if (failure) {
  if (stderr.trim()) failure.message += `\nChrome stderr: ${stderr.trim().slice(-2000)}`;
  throw failure;
}
