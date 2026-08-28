'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const candidates = [process.argv[2], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
const chrome = candidates.find(file => fs.existsSync(file));
if (!chrome) throw new Error('Chrome non trovato');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.wav': 'audio/wav' };

function harness(width, height) {
  return `<!doctype html><meta charset="utf-8"><iframe id="app" style="width:${width}px;height:${height}px;border:0" src="/index.html?smoke=${Date.now()}"></iframe><pre id="smoke-result">pending</pre><script>
  const frame=document.getElementById('app'),out=document.getElementById('smoke-result');
  const wait=()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
  frame.onload=()=>setTimeout(async()=>{try{
    const w=frame.contentWindow,d=frame.contentDocument,pages=['devices','experience','gemini','planning','language','data','help'],checks=[];
    const nav=d.querySelector('a[data-sez="altro"]');if(nav)nav.click();await wait();
    for(const page of pages){w.apriSettingsPage(page);await wait();const active=d.querySelector('[data-settings-page="'+page+'"]');const nodes=[active,...active.querySelectorAll('*')].filter(Boolean).filter(el=>{const s=w.getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'});const maxRight=Math.max(...nodes.map(el=>el.getBoundingClientRect().right));const minLeft=Math.min(...nodes.map(el=>el.getBoundingClientRect().left));checks.push({page,maxRight:+maxRight.toFixed(2),minLeft:+minLeft.toFixed(2),active:active.classList.contains('settings-page-active')});}
    const result={width:w.innerWidth,height:w.innerHeight,bodyScroll:d.documentElement.scrollWidth,rows:d.querySelectorAll('[data-settings-open]').length,checks,errors:w.__sentieroSmokeErrors||[],rejections:w.__sentieroSmokeRejections||[],reduced:w.matchMedia('(prefers-reduced-motion: reduce)').matches,ready:typeof w.renderAll==='function'||typeof w.renderTasks==='function'};out.textContent=JSON.stringify(result);
  }catch(e){out.textContent=JSON.stringify({error:String(e&&e.stack||e)});}},700);
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

function runChrome(port, width, height, reduced) {
  return new Promise((resolve, reject) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sentiero-smoke-${width}-`));
    const args = ['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--disable-default-apps','--disable-extensions','--disable-sync','--metrics-recording-only',`--window-size=${width},${height}`,'--force-device-scale-factor=2',`--user-data-dir=${profile}`,'--virtual-time-budget=6000','--dump-dom'];
    if (reduced) args.push('--force-prefers-reduced-motion');
    args.push(`http://127.0.0.1:${port}/smoke?w=${width}&h=${height}`);
    const child = spawn(chrome, args, { windowsHide: true }); let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Chrome timeout')); }, 60000);
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); const match = stdout.match(/<pre id="smoke-result">([^<]+)<\/pre>/); if (!match) { reject(new Error(`Chrome ${code}: ${stderr.slice(-500)}`)); return; } try { resolve(JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))); } catch (error) { reject(error); } });
  });
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port;
  try {
    for (const [width, height, reduced] of [[320,568,false],[375,647,false],[430,740,false],[375,647,true]]) {
      const result = await runChrome(port, width, height, reduced);
      assert.equal(result.error, undefined); assert.equal(result.ready, true); assert.equal(result.rows, 7);
      assert.deepEqual(result.errors, []); assert.deepEqual(result.rejections, []);
      assert.ok(result.bodyScroll <= result.width + 1, `${width}px: overflow documento ${result.bodyScroll}`);
      for (const check of result.checks) { assert.equal(check.active, true, check.page); assert.ok(check.maxRight <= result.width + 1, `${width}px ${check.page}: destra ${check.maxRight}`); assert.ok(check.minLeft >= -1, `${width}px ${check.page}: sinistra ${check.minLeft}`); }
      if (reduced) assert.equal(result.reduced, true);
    }
    process.stdout.write('PASS Chrome mobile 320/375/430 px, sette sottopagine, overflow, console e reduced motion\n');
  } finally { server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
