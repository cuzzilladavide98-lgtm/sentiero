'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const base = new URL(process.argv[2] || 'https://cuzzilladavide98-lgtm.github.io/sentiero/');
const chrome = [process.argv[3], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

async function json(url) { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`${url}:${response.status}`); return response.json(); }

async function pageAsset(paths, validate) {
  const results = [];
  for (const name of paths) {
    const url = new URL(name, base); url.searchParams.set('gate', Date.now());
    const response = await fetch(url, { cache: 'no-store' }); let data = null;
    if (response.ok) try { data = await response.json(); } catch (_) {}
    results.push({ name, status: response.status, type: response.headers.get('content-type') || '', data });
  }
  const valid = results.find(result => result.status === 200 && /application\/json/i.test(result.type) && validate(result.data));
  assert.ok(valid, JSON.stringify(results.map(({ name, status, type }) => ({ name, status, type })))); return { valid, results };
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl), pending = new Map(); let next = 0;
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => { const message = JSON.parse(String(event.data)); if (!message.id || !pending.has(message.id)) return; const job = pending.get(message.id); pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); });
  return {
    send(method, params = {}) { const id = ++next; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); },
    close() { socket.close(); }
  };
}

(async () => {
  const stamp = Date.now(), indexUrl = new URL(`index.html?gate=${stamp}`, base), index = await fetch(indexUrl, { cache: 'no-store' });
  assert.equal(index.status, 200); assert.match(index.headers.get('content-type') || '', /text\/html/); assert.match(await index.text(), /sentiero-app\.js\?v=60\.274\.3/);
  const sw = await fetch(new URL(`sw.js?gate=${stamp}`, base), { cache: 'no-store' }); assert.equal(sw.status, 200); assert.match(await sw.text(), /sentiero-v60s-274-3/);
  const news = await pageAsset(['assets/giornale/latest.json', 'latest.json'], data => data?.edition?.articles?.length === 5 && data?.items?.length >= 12);
  const words = await pageAsset(['assets/parole-giorno-v1.json', 'parole-giorno-v1.json'], data => data?.words?.length >= 1000);

  const port = await freePort(), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sentiero-pages-fresh-'));
  const targetUrl = new URL(`?fresh-pages=${stamp}`, base).toString();
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=390,740', targetUrl], { windowsHide: true, stdio: 'ignore' });
  let cdp;
  try {
    let target;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { const targets = await json(`http://127.0.0.1:${port}/json/list`); target = targets.find(item => item.type === 'page' && item.url.startsWith(base.toString())); if (target) break; } catch (_) {}
      await wait(250);
    }
    if (!target) throw new Error('pagina Chrome non disponibile');
    cdp = await connect(target.webSocketDebuggerUrl); await cdp.send('Runtime.enable');
    for (let attempt = 0; attempt < 80; attempt++) { const state = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }); if (state.result.value === 'complete') break; await wait(200); }
    const open = await cdp.send('Runtime.evaluate', { expression: 'window.apriStanzaTerra()', awaitPromise: true, returnByValue: true }); if (open.exceptionDetails) throw new Error(open.exceptionDetails.text);
    let result;
    for (let attempt = 0; attempt < 100; attempt++) {
      const evaluated = await cdp.send('Runtime.evaluate', { expression: `({version:typeof APP_VERSION==='string'?APP_VERSION:'',articles:document.querySelectorAll('.news-article').length,sources:document.querySelectorAll('.news-sources a').length,meta:document.querySelector('.edition-meta')?.textContent||'',word:document.querySelector('.word-card h3')?.textContent||'',definition:document.querySelector('.word-definition')?.textContent||'',wordSource:document.querySelector('.word-source')?.textContent||'',placeholder:document.querySelector('.news-state')?.textContent||'',controlled:!!navigator.serviceWorker.controller})`, returnByValue: true });
      result = evaluated.result.value; if (result.articles === 5 && result.definition.length >= 24) break; await wait(200);
    }
    assert.match(result.version, /v60S\.274\.3/); assert.equal(result.articles, 5); assert.ok(result.sources >= 1); assert.match(result.meta, /fonti aggiornate/); assert.ok(result.word.length >= 2); assert.ok(result.definition.length >= 24); assert.match(result.wordSource, /Wiktionary/); assert.doesNotMatch(result.placeholder, /tornerà disponibile|nessuna storia/i);
    console.log(JSON.stringify({ ok: true, base: base.toString(), news: news.valid.name, words: words.valid.name, articles: result.articles, sources: result.sources, word: result.word, controlled: result.controlled }));
  } finally { if (cdp) cdp.close(); child.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
