'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const chrome = [process.argv[2], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const requests = new Map();

const probe = `<script>
window.__dayContentErrors=[];window.__dayContentRejections=[];
addEventListener('error',e=>__dayContentErrors.push(String(e.message||e.error||'error')));
addEventListener('unhandledrejection',e=>__dayContentRejections.push(String(e.reason&&e.reason.message||e.reason||'rejection')));
addEventListener('load',()=>setTimeout(async()=>{const out=document.createElement('pre');out.id='content-smoke-result';document.body.append(out);try{
  await window.apriStanzaTerra();const limit=Date.now()+16000;
  while((!document.querySelector('.edition-front')||!document.querySelector('.word-card'))&&Date.now()<limit)await new Promise(ok=>setTimeout(ok,120));
  if(navigator.serviceWorker)await Promise.race([navigator.serviceWorker.ready,new Promise(ok=>setTimeout(ok,8000))]);
  const edition=document.querySelector('.edition'),word=document.querySelector('.word-card'),firstSource=document.querySelector('.news-sources a');
  out.textContent=JSON.stringify({edition:!!edition,articles:document.querySelectorAll('.news-article').length,claims:document.querySelectorAll('.claim-sources a').length,sources:document.querySelectorAll('.news-sources a').length,sourceHref:firstSource&&firstSource.href,meta:document.querySelector('.edition-meta')&&document.querySelector('.edition-meta').textContent,word:!!word,wordTitle:word&&word.querySelector('h3').textContent,definition:word&&word.querySelector('.word-definition').textContent,wordSource:word&&word.querySelector('.word-source').textContent,errors:__dayContentErrors,rejections:__dayContentRejections,online:navigator.onLine,controlled:!!navigator.serviceWorker?.controller});
}catch(error){out.textContent=JSON.stringify({error:String(error&&error.stack||error)});}},700));
</script>`;

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1'); requests.set(url.pathname, (requests.get(url.pathname) || 0) + 1);
    if (url.pathname === '/assets/giornale/latest.json' || url.pathname === '/assets/parole-giorno-v1.json') { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end(); return; }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)), file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    const extension = path.extname(file).toLowerCase(); let body = fs.readFileSync(file);
    if (extension === '.html' && path.basename(file) === 'index.html') body = Buffer.from(body.toString('utf8').replace('</body>', probe + '</body>'));
    res.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); res.end(body);
  } catch (_) { res.writeHead(404); res.end(); }
});

function runChrome(profile, url) {
  return new Promise((resolve, reject) => {
    const args = ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', '--window-size=390,700', '--force-device-scale-factor=2', `--user-data-dir=${profile}`, '--virtual-time-budget=26000', '--dump-dom', url];
    const child = spawn(chrome, args, { windowsHide: true }); let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Chrome timeout')); }, 70000);
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); const match = stdout.match(/<pre id="content-smoke-result">([^<]+)<\/pre>/); if (!match) return reject(new Error(`Chrome ${code}: ${stderr.slice(-600)}`)); try { resolve(JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))); } catch (error) { reject(error); } });
  });
}

function verify(result, label) {
  assert.equal(result.error, undefined, label); assert.equal(result.edition, true, label); assert.ok(result.articles >= 1 && result.articles <= 6, label + ': articoli ' + result.articles); assert.ok(result.claims >= 1, label); assert.ok(result.sources >= 1, label);
  assert.match(result.sourceHref || '', /^https:\/\//); assert.match(result.meta || '', /fonti aggiornate/); assert.equal(result.word, true, label); assert.ok((result.wordTitle || '').length >= 2); assert.ok((result.definition || '').length >= 24); assert.match(result.wordSource || '', /Wiktionary/);
  assert.deepEqual(result.errors, [], label); assert.deepEqual(result.rejections, [], label);
  
  if (label === 'fresh install') {
    assert.ok(result.articles >= 3, label + ': edizione sostanziosa attesa (>=3 articoli), trovati ' + result.articles);
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port, url = `http://127.0.0.1:${port}/index.html?content-smoke=1`, profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sentiero-content-'));
  const online = await runChrome(profile, url); verify(online, 'fresh install');
  assert.ok(requests.get('/assets/giornale/latest.json') >= 1); assert.ok(requests.get('/latest.json') >= 1);
  assert.ok(requests.get('/assets/parole-giorno-v1.json') >= 1); assert.ok(requests.get('/parole-giorno-v1.json') >= 1);
  await new Promise(resolve => server.close(resolve));
  const offline = await runChrome(profile, url); verify(offline, 'offline cache');
  assert.equal(offline.controlled, true); assert.match(offline.meta, /salvata sul dispositivo|ultima edizione disponibile/);
  process.stdout.write(`PASS deploy appiattito fresh install e offline: ${online.articles} articoli, ${online.sources} fonti, parola completa\n`);
})().catch(error => { console.error(error); try { server.close(); } catch (_) {} process.exitCode = 1; });
