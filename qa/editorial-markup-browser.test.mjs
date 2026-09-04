import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const published = '2099-01-01T10:00:00.000Z';
const rawTitle = '<p>Il Governo &amp; il Parlamento <strong>approvano</strong> la legge &#39;X&#39; &quot;Bilancio&quot; &#x32;026</p>';
const rawSummary = '</p><div>Il Parlamento&nbsp;ha approvato la legge &amp; confermato il piano &#39;X&#39; per il &quot;Bilancio&quot; &#50;026.</div>';
const item = {
  id: 'markup-1', title: rawTitle, summary: rawSummary, url: 'https://markup.example.test/notizia', published,
  source: 'Fonte istituzionale', sourceId: 'markup', sourceMeta: { perspective: 'primary', area: 'economy', language: 'it', tier: 'A', domain: 'markup.example.test' },
  provenance: { evidenceId: 'markup-1', sourceId: 'markup', sourceDomain: 'markup.example.test', canonicalUrl: 'https://markup.example.test/notizia', publishedAt: published, retrievedAt: published, contentFingerprint: 'fp-markup-1' },
  places: [], topics: [], media: null
};
const packet = { v: 4, kind: 'sentiero-editorial-snapshot', generatedAt: published, dayKey: '2099-01-01', items: [item], edition: null };
const probe = `<script>
addEventListener('load',()=>setTimeout(async()=>{const out=document.createElement('pre');out.id='markup-result';document.body.append(out);try{
  await window.apriStanzaTerra();const limit=Date.now()+16000;
  while(!document.querySelector('.news-article')&&Date.now()<limit)await new Promise(ok=>setTimeout(ok,120));
  const article=[...document.querySelectorAll('.news-article')].find(node=>node.querySelector('h3')?.textContent.includes('Bilancio'));
  const title=article?.querySelector('h3')?.textContent||'',claim=article?.querySelector('.body p')?.childNodes[0]?.textContent||'';
  const residue=/<\\/?(?:p|strong|div)\\b|&(?:nbsp|amp|quot|#39|#\\d+|#x[0-9a-f]+);/i.test(title+' '+claim);
  out.textContent=JSON.stringify({article:!!article,title,claim,residue,literalPunctuation:title.includes('&')&&title.includes("'")&&title.includes('"')});
}catch(error){out.textContent=JSON.stringify({error:String(error&&error.stack||error)});}},700));
</script>`;

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/assets/giornale/latest.json' || url.pathname === '/latest.json') { response.writeHead(200, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' }); response.end(JSON.stringify(packet)); return; }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)), file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    let body = fs.readFileSync(file); const extension = path.extname(file).toLowerCase();
    if (relative === 'index.html') body = Buffer.from(body.toString('utf8').replace('</body>', probe + '</body>'));
    response.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); response.end(body);
  } catch (_) { response.writeHead(404); response.end(); }
});

function runChrome(url) {
  return new Promise((resolve, reject) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sentiero-markup-'));
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', `--user-data-dir=${profile}`, '--virtual-time-budget=20000', '--dump-dom', url], { windowsHide: true });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const finish = () => { if (path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep)) try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {} };
    const timer = setTimeout(() => { child.kill(); finish(); reject(new Error('Chrome timeout')); }, 60000);
    child.on('error', error => { clearTimeout(timer); finish(); reject(error); });
    child.on('close', code => { clearTimeout(timer); finish(); const match = stdout.match(/<pre id="markup-result">([^<]+)<\/pre>/); if (!match) return reject(new Error(`Chrome ${code}: ${stderr.slice(-500)}`)); try { resolve(JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))); } catch (error) { reject(error); } });
  });
}

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const result = await runChrome(`http://127.0.0.1:${server.address().port}/index.html?markup-regression=1`);
  assert.equal(result.error, undefined);
  assert.equal(result.article, true, 'la fixture deve attraversare la pipeline e arrivare al DOM');
  assert.equal(result.residue, false, `token HTML/entity residui: ${result.title} / ${result.claim}`);
  assert.equal(result.literalPunctuation, true, 'apostrofo, virgolette e & letterale non sono markup e vanno preservati');
  assert.equal(result.title, 'Il Governo & il Parlamento approvano la legge \'X\' "Bilancio" 2026');
  assert.equal(result.claim.trim(), 'Il Parlamento ha approvato la legge & confermato il piano \'X\' per il "Bilancio" 2026.');
  console.log(JSON.stringify(result, null, 2));
  console.log('PASS markup DOM: tag ed entità rimossi dalla pipeline production; punteggiatura letterale preservata');
} finally {
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
