'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const candidates = [process.argv[2], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
const chrome = candidates.find(file => fs.existsSync(file));
if (!chrome) throw new Error('Chrome non trovato');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.wav': 'audio/wav' };

function harness(width, height) {
  return `<!doctype html><meta charset="utf-8"><iframe id="app" style="width:${width}px;height:${height}px;border:0" src="/index.html?smoke=${Date.now()}"></iframe><pre id="smoke-result">pending</pre><script>
  window.__sentieroSmokeReady=false;window.__sentieroSmokeResult=null;
  const frame=document.getElementById('app'),out=document.getElementById('smoke-result');
  const wait=()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
  const waitFor=async(check,label,timeout=20000)=>{const start=Date.now();while(Date.now()-start<timeout){try{if(check())return;}catch(_){}await new Promise(ok=>setTimeout(ok,100));}throw new Error('readiness timeout: '+label);};
  const finish=result=>{window.__sentieroSmokeResult=result;window.__sentieroSmokeReady=true;out.textContent=JSON.stringify(result);};
  frame.onload=async()=>{try{
    const w=frame.contentWindow,d=frame.contentDocument,pages=['devices','experience','gemini','planning','language','data','help'],checks=[];
    await waitFor(()=>typeof w.apriSettingsPage==='function'&&typeof w.apriStanzaTerra==='function'&&(typeof w.renderAll==='function'||typeof w.renderTasks==='function'),'bootstrap applicazione');
    const swHandshake=typeof w.sentieroServiceWorkerHandshake==='function'?await w.sentieroServiceWorkerHandshake(15000):null;
    if(!swHandshake||!swHandshake.controller||!swHandshake.coherent)throw new Error('service worker non stabilizzato: '+JSON.stringify(swHandshake));
    const nav=d.querySelector('a[data-sez="altro"]');if(nav)nav.click();await wait();
    for(const page of pages){w.apriSettingsPage(page);await wait();const active=d.querySelector('[data-settings-page="'+page+'"]');const nodes=[active,...active.querySelectorAll('*')].filter(Boolean).filter(el=>{const s=w.getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'});const maxRight=Math.max(...nodes.map(el=>el.getBoundingClientRect().right));const minLeft=Math.min(...nodes.map(el=>el.getBoundingClientRect().left));checks.push({page,maxRight:+maxRight.toFixed(2),minLeft:+minLeft.toFixed(2),active:active.classList.contains('settings-page-active')});}
    const dayOpenAt=w.performance.now();await w.apriStanzaTerra();const dayOpenMs=+(w.performance.now()-dayOpenAt).toFixed(2);
    await waitFor(()=>{const room=d.querySelector('#giorno-room'),shell=d.querySelector('.giorno-shell'),week=d.querySelector('.week-strip'),globe=d.querySelector('#giorno-terra .terra-globo');return !!room&&!room.hidden&&!!shell&&!!week&&!!globe&&d.querySelectorAll('.week-day').length===7&&!!d.querySelector('.word-card');},'stanza Terra completa');await wait();
    const room=d.querySelector('#giorno-room'),shell=d.querySelector('.giorno-shell'),week=d.querySelector('.week-strip'),earth=d.querySelector('#giorno-terra'),globe=d.querySelector('#giorno-terra .terra-globo'),night=d.querySelector('#notte-luce .nucleo');
    const earthSize=parseFloat(w.getComputedStyle(globe).width)||0,nightSize=parseFloat(w.getComputedStyle(night,'::before').width)||0;
    finish({width:w.innerWidth,height:w.innerHeight,bodyScroll:d.documentElement.scrollWidth,rows:d.querySelectorAll('[data-settings-open]').length,checks,errors:w.__sentieroSmokeErrors||[],rejections:w.__sentieroSmokeRejections||[],reduced:w.matchMedia('(prefers-reduced-motion: reduce)').matches,ready:typeof w.renderAll==='function'||typeof w.renderTasks==='function',swHandshake,day:{open:!!room&&!room.hidden,openMs:dayOpenMs,shellScroll:shell&&shell.scrollWidth,shellClient:shell&&shell.clientWidth,weekScroll:week&&week.scrollWidth,weekClient:week&&week.clientWidth,days:d.querySelectorAll('.week-day').length,word:!!d.querySelector('.word-card'),earthTarget:earth&&parseFloat(w.getComputedStyle(earth).width),visualAreaRatio:nightSize?+(earthSize*earthSize/(nightSize*nightSize)).toFixed(2):0,moonAnimation:w.getComputedStyle(d.querySelector('.terra-luna')).animationName}});
  }catch(e){finish({error:String(e&&e.stack||e)});}};
  </script>`;
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/smoke') { const body = Buffer.from(harness(Number(url.searchParams.get('w')) || 375, Number(url.searchParams.get('h')) || 647)); res.writeHead(200, { 'Content-Type': mime['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-store' }); res.end(body); return; }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file);
    if (path.extname(file).toLowerCase() === '.html') {
      const probe = `<script>window.__sentieroSmokeErrors=[];window.__sentieroSmokeRejections=[];addEventListener('error',e=>__sentieroSmokeErrors.push(String(e.message||e.error||'error')));addEventListener('unhandledrejection',e=>__sentieroSmokeRejections.push(String(e.reason&&e.reason.message||e.reason||'rejection')))</script>`;
      body = Buffer.from(body.toString('utf8').replace('<head>', '<head>' + probe));
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); res.end(body);
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
      const page = targets.find(target => target.type === 'page' && /\/smoke\?/.test(target.url));
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('Chrome DevTools non ha esposto la pagina smoke');
}

class CDP {
  constructor(socket) { this.socket=socket; this.id=0; this.pending=new Map(); socket.addEventListener('message', event => this.onMessage(event)); }
  onMessage(event) { let message; try { message=JSON.parse(String(event.data)); } catch (_) { return; } if(!message.id||!this.pending.has(message.id))return;const job=this.pending.get(message.id);this.pending.delete(message.id);message.error?job.reject(new Error(message.error.message)):job.resolve(message.result); }
  send(method, params={}) { return new Promise((resolve,reject)=>{const id=++this.id;this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));}); }
  close() { try{this.socket.close();}catch(_){} }
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url), timer=setTimeout(()=>reject(new Error('timeout connessione Chrome DevTools')),10000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve(new CDP(socket));});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('errore connessione Chrome DevTools'));});
  });
}

async function stopChrome(child) {
  if (child.exitCode !== null) return;
  const closed = new Promise(resolve => child.once('close', resolve));
  child.kill();
  await Promise.race([closed, sleep(5000)]);
}

async function runChrome(port, width, height, reduced) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sentiero-smoke-${width}-`));
  const debugPort = await getFreePort();
  const args = ['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-default-apps','--disable-extensions','--disable-sync','--metrics-recording-only',`--window-size=${width},${height}`,'--force-device-scale-factor=2',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`];
  if (reduced) args.push('--force-prefers-reduced-motion');
  args.push(`http://127.0.0.1:${port}/smoke?w=${width}&h=${height}`);
  const child = spawn(chrome, args, { windowsHide: true }); let stderr='', cdp=null;
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const target=await getPageTarget(debugPort);cdp=await connectCdp(target.webSocketDebuggerUrl);await cdp.send('Runtime.enable');
    const started=Date.now(),timeoutMs=30000;
    while(Date.now()-started<timeoutMs){
      const state=await cdp.send('Runtime.evaluate',{expression:'({ready:window.__sentieroSmokeReady===true,result:window.__sentieroSmokeResult})',returnByValue:true});
      const value=state&&state.result&&state.result.value;
      if(value&&value.ready){if(!value.result)throw new Error(`${width}x${height}: probe pronto senza risultato`);return value.result;}
      await sleep(100);
    }
    const diagnostic=await cdp.send('Runtime.evaluate',{expression:'({ready:window.__sentieroSmokeReady,result:window.__sentieroSmokeResult,text:document.querySelector("#smoke-result")?.textContent||"",frameReady:document.querySelector("#app")?.contentDocument?.readyState||""})',returnByValue:true});
    throw new Error(`${width}x${height}: probe non completato entro ${timeoutMs} ms; stato=${JSON.stringify(diagnostic?.result?.value||{})}`);
  } catch(error) {
    throw new Error(`${error.message}${stderr?' | Chrome: '+stderr.slice(-400):''}`);
  } finally {
    if(cdp)cdp.close(); await stopChrome(child);
    try{fs.rmSync(profile,{recursive:true,force:true});}catch(_){}
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port;
  try {
    for (const [width, height, reduced] of [[320,568,false],[360,640,false],[375,647,false],[390,700,false],[430,740,false],[1024,768,false],[375,647,true]]) {
      const result = await runChrome(port, width, height, reduced);
      assert.equal(result.error, undefined); assert.equal(result.ready, true); assert.equal(result.rows, 7);
      assert.equal(result.swHandshake.controller,true);assert.equal(result.swHandshake.coherent,true);assert.notEqual(result.swHandshake.generation,0);
      assert.deepEqual(result.errors, []); assert.deepEqual(result.rejections, []);
      assert.ok(result.bodyScroll <= result.width + 1, `${width}px: overflow documento ${result.bodyScroll}`);
      for (const check of result.checks) { assert.equal(check.active, true, check.page); assert.ok(check.maxRight <= result.width + 1, `${width}px ${check.page}: destra ${check.maxRight}`); assert.ok(check.minLeft >= -1, `${width}px ${check.page}: sinistra ${check.minLeft}`); }
      assert.equal(result.day.open,true,`${width}px: stanza Terra`);assert.equal(result.day.days,7);assert.ok(result.day.openMs<1000,`${width}px: apertura stanza ${result.day.openMs} ms`);assert.ok(result.day.shellScroll<=result.day.shellClient+1,`${width}px: overflow stanza`);assert.ok(result.day.weekScroll<=result.day.weekClient+1,`${width}px: overflow settimana`);assert.ok(result.day.earthTarget>=44);assert.ok(result.day.visualAreaRatio>=1.8&&result.day.visualAreaRatio<=4,`rapporto Terra/Satellite ${result.day.visualAreaRatio}`);
      if (reduced) { assert.equal(result.reduced, true); assert.equal(result.day.moonAnimation,'none'); }
    }
    process.stdout.write('PASS Chrome 320/360/375/390/430/desktop, Terra, Settimana, overflow, console e reduced motion\n');
  } finally { server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
