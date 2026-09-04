import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..');
const chrome = [process.argv[2], 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome non trovato');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

const LOCAL_NEWS_KEY = 'sentiero-giornale-territorio-v1';

function makeProbe(scenario) {
  return `<script>
window.__localNewsErrors=[];window.__localNewsRejections=[];
addEventListener('error',e=>__localNewsErrors.push(String(e.message||e.error||'error')));
addEventListener('unhandledrejection',e=>__localNewsRejections.push(String(e.reason&&e.reason.message||e.reason||'rejection')));
addEventListener('load',()=>setTimeout(async()=>{const out=document.createElement('pre');out.id='local-news-result';document.body.append(out);try{
  if ('${scenario}' === 'B' || '${scenario}' === 'C') {
    localStorage.setItem('${LOCAL_NEWS_KEY}', JSON.stringify({regionSlug:'piemonte',region:'Piemonte',city:''}));
  }
  await window.apriStanzaTerra();const limit=Date.now()+16000;
  while((!document.querySelector('.edition-front')||!document.querySelector('.news-local'))&&Date.now()<limit)await new Promise(ok=>setTimeout(ok,120));
  if(navigator.serviceWorker)await Promise.race([navigator.serviceWorker.ready,new Promise(ok=>setTimeout(ok,8000))]);

  const localSection=document.querySelector('.news-local');
  const localCard=localSection?.querySelector('.local-card');
  const localHead=localCard?.querySelector('.local-head');
  const localLabel=localSection?.querySelector('.giorno-label');
  const regionSelect=localSection?.querySelector('.local-select-wrap select');
  const cityInput=localSection?.querySelector('.local-input-wrap input');
  const primaryBtn=localSection?.querySelector('.local-btn.primary:not(.geo):not(.clear)');
  const geoBtn=localSection?.querySelector('.local-btn.geo');
  const clearBtn=localSection?.querySelector('.local-btn.clear');
  const saveBtn=localSection?.querySelector('.local-btn.primary:not(.geo):not(.clear)');
  const selectWrappers = localSection?.querySelectorAll('.local-select-wrap');
  const initialSelect = selectWrappers && selectWrappers.length > 0 && selectWrappers[0].querySelector('label')?.textContent?.includes('Regione') ? selectWrappers[0].querySelector('select') : null;
  const changeSelect = selectWrappers && selectWrappers.length > 0 && selectWrappers[selectWrappers.length - 1].querySelector('label')?.textContent?.includes('Cambia') ? selectWrappers[selectWrappers.length - 1].querySelector('select') : (selectWrappers && selectWrappers.length > 1 ? selectWrappers[1].querySelector('select') : null);
  const privacy=localSection?.querySelector('.local-privacy');
  const empty=localSection?.querySelector('.local-empty');
  const grid=localSection?.querySelector('.news-local-grid');
  const localCards=localSection?.querySelectorAll('.news-local-card');

  // Per scenari B e C, espandi i controlli se sono nascosti
  const toggleBtn = localCard?.querySelector('.local-btn.secondary');
  if ('${scenario}' === 'B' || '${scenario}' === 'C') {
    if (toggleBtn && toggleBtn.textContent.includes('Modifica')) {
      toggleBtn.click();
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const getStyle = el => el ? window.getComputedStyle(el) : null;
  const parseColor = value => {
    const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
    if (!match) return { r: 0, g: 0, b: 0, a: 0 };
    const parts = match[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: Number.isFinite(parts[3]) ? parts[3] : 1 };
  };
  const composite = (front, back) => {
    const alpha = front.a + back.a * (1 - front.a) || 1;
    return { r: (front.r * front.a + back.r * back.a * (1 - front.a)) / alpha, g: (front.g * front.a + back.g * back.a * (1 - front.a)) / alpha, b: (front.b * front.a + back.b * back.a * (1 - front.a)) / alpha, a: alpha };
  };
  const effectiveBackground = el => {
    const chain = []; for (let node = el; node; node = node.parentElement) chain.unshift(node);
    let background = { r: 255, g: 255, b: 255, a: 1 };
    for (const node of chain) background = composite(parseColor(getComputedStyle(node).backgroundColor), background);
    return background;
  };
  const luminance = color => {
    const linear = value => { value /= 255; return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4); };
    return .2126 * linear(color.r) + .7152 * linear(color.g) + .0722 * linear(color.b);
  };
  const contrastFor = (el, pseudo = null) => {
    if (!el) return 0;
    const style = getComputedStyle(el, pseudo), background = effectiveBackground(el), foreground = parseColor(style.color);
    foreground.a *= Number(style.opacity || 1);
    const rendered = composite(foreground, background), a = luminance(rendered), b = luminance(background);
    return Number(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(3));
  };
  const initialSelectHeight = initialSelect ? parseFloat(getStyle(initialSelect).height) : 0;
  const changeSelectHeight = changeSelect ? parseFloat(getStyle(changeSelect).height) : 0;
  const cityInputHeight = cityInput ? parseFloat(getStyle(cityInput).height) : 0;
  const primaryBtnHeight = primaryBtn ? parseFloat(getStyle(primaryBtn).height) : 0;
  const saveBtnHeight = saveBtn ? parseFloat(getStyle(saveBtn).height) : 0;
  const clearBtnHeight = clearBtn ? parseFloat(getStyle(clearBtn).height) : 0;
  const geoBtnHeight = geoBtn ? parseFloat(getStyle(geoBtn).height) : 0;
  const labelRegion = localSection?.querySelector('.local-select-wrap label');
  const labelCity = localSection?.querySelector('.local-input-wrap label');
  const labelRegionVisible = labelRegion ? (parseFloat(getStyle(labelRegion).fontSize) > 0 && getStyle(labelRegion).visibility !== 'hidden' && getStyle(labelRegion).display !== 'none') : false;
  const labelCityVisible = labelCity ? (parseFloat(getStyle(labelCity).fontSize) > 0 && getStyle(labelCity).visibility !== 'hidden' && getStyle(labelCity).display !== 'none') : false;
  const placeholderColor = cityInput ? getStyle(cityInput).color : '';
  const placeholderOpacity = cityInput ? parseFloat(getStyle(cityInput)?.opacity) || 1 : 1;
  const primaryBtnBg = primaryBtn ? getStyle(primaryBtn).backgroundColor : '';
  const geoBtnBg = geoBtn ? getStyle(geoBtn).backgroundColor : '';
  const saveBtnBg = saveBtn ? getStyle(saveBtn).backgroundColor : '';
  const privacyText = privacy ? privacy.textContent : '';
  const privacyVisible = privacy ? (parseFloat(getStyle(privacy).fontSize) > 0) : false;
  const emptyVisible = empty ? (parseFloat(getStyle(empty).fontSize) > 0) : false;
  const emptyText = empty ? empty.textContent : '';
  const emptyCount = document.querySelectorAll('.local-empty').length;
  const gridCards = localCards ? localCards.length : 0;
  const hasOverlap = localSection ? (localSection.scrollWidth > localSection.clientWidth) : false;
  const initialSelectDisplay = initialSelect ? initialSelect.value : '';
  const changeSelectDisplay = changeSelect ? changeSelect.value : '';
  const primaryBtnText = primaryBtn ? primaryBtn.textContent : '';
  const saveBtnText = saveBtn ? saveBtn.textContent : '';
  const headText = localHead ? localHead.textContent : '';
  const contrasts = {
    territorio: contrastFor(localHead?.querySelector('h3')),
    label: contrastFor(labelRegion),
    select: contrastFor(changeSelect || initialSelect),
    input: contrastFor(cityInput),
    placeholder: cityInput && !cityInput.value ? contrastFor(cityInput, '::placeholder') : null,
    titoloNotizia: contrastFor(localSection?.querySelector('.news-local-card h4 a')),
    sommario: contrastFor(localSection?.querySelector('.news-local-card p')),
    fonteData: contrastFor(localSection?.querySelector('.news-local-card small')),
    rimuoviTerritorio: contrastFor(clearBtn),
    ctaPrimaria: contrastFor(saveBtn || primaryBtn)
  };

  out.textContent=JSON.stringify({
    scenario: '${scenario}',
    localSection: !!localSection,
    localCard: !!localCard,
    localHead: !!localHead,
    localLabel: !!localLabel,
    headText,
    initialSelect: !!initialSelect,
    changeSelect: !!changeSelect,
    cityInput: !!cityInput,
    primaryBtn: !!primaryBtn,
    geoBtn: !!geoBtn,
    clearBtn: !!clearBtn,
    saveBtn: !!saveBtn,
    privacy: !!privacy,
    empty: !!empty,
    grid: !!grid,
    localCards: localCards ? localCards.length : 0,
    initialSelectHeight,
    changeSelectHeight,
    cityInputHeight,
    primaryBtnHeight,
    geoBtnHeight,
    saveBtnHeight,
    clearBtnHeight,
    labelRegionVisible,
    labelCityVisible,
    placeholderColor,
    placeholderOpacity,
    primaryBtnBg,
    geoBtnBg,
    saveBtnBg,
    privacyText,
    privacyVisible,
    emptyVisible,
    emptyText,
    emptyCount,
    gridCards,
    hasOverlap,
    initialSelectDisplay,
    changeSelectDisplay,
    primaryBtnText,
    saveBtnText,
    contrasts,
    errors:__localNewsErrors,
    rejections:__localNewsRejections,
    viewport: window.innerWidth
  });
}catch(error){out.textContent=JSON.stringify({error:String(error&&error.stack||error)});}},700));
</script>`;
}

const baseItems = [
  { id: 'local-1', title: 'Nuovo polo sanitario a Torino: 200 posti letto in più', summary: 'La Regione Piemonte ha approvato il piano per il nuovo polo sanitario che sorgerà a Torino. L\'investimento è di 50 milioni di euro.', url: 'https://test.example.com/local-1', published: new Date().toISOString(), source: 'TGR Piemonte', sourceId: 'tgr-piemonte', sourceMeta: { perspective: 'primary', area: 'local', language: 'it', tier: 'A', domain: 'tgr.rai.it', regionSlug: 'piemonte' }, provenance: { evidenceId: 'local-1', sourceId: 'tgr-piemonte', sourceDomain: 'tgr.rai.it', canonicalUrl: 'https://tgr.rai.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-local-1' }, places: ['Torino'], topics: [], media: null },
  { id: 'local-2', title: 'Festival del cinema a Torino: al via la 40esima edizione', summary: 'Torna il Festival del Cinema di Torino con anteprime mondiali e ospiti internazionali. L\'evento si svolgerà dal 15 al 23 novembre.', url: 'https://test.example.com/local-2', published: new Date().toISOString(), source: 'TGR Piemonte', sourceId: 'tgr-piemonte', sourceMeta: { perspective: 'independent', area: 'local', language: 'it', tier: 'B', domain: 'tgr.rai.it', regionSlug: 'piemonte' }, provenance: { evidenceId: 'local-2', sourceId: 'tgr-piemonte', sourceDomain: 'tgr.rai.it', canonicalUrl: 'https://tgr.rai.it/2', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-local-2' }, places: ['Torino'], topics: [], media: null },
  { id: 'local-3', title: 'Allerta meteo in Piemonte: neve sulle Alpi', summary: 'La protezione civile ha diramato l\'allerta gialla per nevicate sulle zone alpine del Piemonte. Disagi alla circolazione previsti.', url: 'https://test.example.com/local-3', published: new Date().toISOString(), source: 'ARPA Piemonte', sourceId: 'arpa-piemonte', sourceMeta: { perspective: 'primary', area: 'local', language: 'it', tier: 'A', domain: 'arpa.piemonte.it', regionSlug: 'piemonte' }, provenance: { evidenceId: 'local-3', sourceId: 'arpa-piemonte', sourceDomain: 'arpa.piemonte.it', canonicalUrl: 'https://arpa.piemonte.it/3', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-local-3' }, places: ['Cuneo', 'Torino'], topics: [], media: null },
  { id: 'national-1', title: 'Il governo approva la nuova legge di bilancio per il 2025', summary: 'Il governo ha approvato la nuova legge di bilancio per il 2025 con misure per famiglie e imprese.', url: 'https://test.example.com/national-1', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-1', sourceMeta: { perspective: 'primary', area: 'economy', language: 'it', tier: 'A', domain: 'ansa.it' }, provenance: { evidenceId: 'national-1', sourceId: 'ansa-1', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-national-1' }, places: [], topics: [], media: null },
  { id: 'national-2', title: 'Alluvione in Emilia-Romagna: 500 sfollati e danni ingenti', summary: 'L\'alluvione ha causato 500 sfollati in Emilia-Romagna. La protezione civile è al lavoro per soccorrere la popolazione.', url: 'https://test.example.com/national-2', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-2', sourceMeta: { perspective: 'primary', area: 'world', language: 'it', tier: 'A', domain: 'ansa.it' }, provenance: { evidenceId: 'national-2', sourceId: 'ansa-2', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/2', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-national-2' }, places: [], topics: [], media: null },
  { id: 'national-3', title: 'Nuova scoperta scientifica: cura per l\'Alzheimer in fase sperimentale', summary: 'Ricercatori italiani hanno scoperto una nuova molecola che potrebbe curare l\'Alzheimer in fase iniziale.', url: 'https://test.example.com/national-3', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-3', sourceMeta: { perspective: 'independent', area: 'science', language: 'it', tier: 'B', domain: 'ansa.it' }, provenance: { evidenceId: 'national-3', sourceId: 'ansa-3', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/3', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-national-3' }, places: [], topics: [], media: null },
];

const otherRegionItems = [
  { id: 'other-1', title: 'Nuova linea metro a Milano', summary: 'Apre la nuova linea M4 della metropolitana di Milano.', url: 'https://test.example.com/other-1', published: new Date().toISOString(), source: 'TGR Lombardia', sourceId: 'tgr-lombardia', sourceMeta: { perspective: 'primary', area: 'local', language: 'it', tier: 'A', domain: 'tgr.rai.it', regionSlug: 'lombardia' }, provenance: { evidenceId: 'other-1', sourceId: 'tgr-lombardia', sourceDomain: 'tgr.rai.it', canonicalUrl: 'https://tgr.rai.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-other-1' }, places: ['Milano'], topics: [], media: null },
  { id: 'other-2', title: 'Il governo approva la nuova legge di bilancio per il 2025', summary: 'Il governo ha approvato la nuova legge di bilancio per il 2025 con misure per famiglie e imprese.', url: 'https://test.example.com/other-2', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-1', sourceMeta: { perspective: 'primary', area: 'economy', language: 'it', tier: 'A', domain: 'ansa.it' }, provenance: { evidenceId: 'other-2', sourceId: 'ansa-1', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-other-2' }, places: [], topics: [], media: null },
  { id: 'other-3', title: 'Alluvione in Emilia-Romagna: 500 sfollati', summary: 'L\'alluvione ha causato 500 sfollati in Emilia-Romagna.', url: 'https://test.example.com/other-3', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-2', sourceMeta: { perspective: 'primary', area: 'world', language: 'it', tier: 'A', domain: 'ansa.it' }, provenance: { evidenceId: 'other-3', sourceId: 'ansa-2', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/2', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-other-3' }, places: [], topics: [], media: null },
];

const emptyItems = [
  { id: 'empty-1', title: 'Il governo approva la nuova legge di bilancio per il 2025', summary: 'Il governo ha approvato la nuova legge di bilancio per il 2025 con misure per famiglie e imprese.', url: 'https://test.example.com/empty-1', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-1', sourceMeta: { perspective: 'primary', area: 'economy', language: 'it', tier: 'A', domain: 'ansa.it' }, provenance: { evidenceId: 'empty-1', sourceId: 'ansa-1', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/1', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-empty-1' }, places: [], topics: [], media: null },
  { id: 'empty-2', title: 'Alluvione in Emilia-Romagna: 500 sfollati', summary: 'L\'alluvione ha causato 500 sfollati in Emilia-Romagna.', url: 'https://test.example.com/empty-2', published: new Date().toISOString(), source: 'ANSA', sourceId: 'ansa-2', sourceMeta: { perspective: 'primary', area: 'world', language: 'it', tier: 'A', domain: 'ansa.it' }, provenance: { evidenceId: 'empty-2', sourceId: 'ansa-2', sourceDomain: 'ansa.it', canonicalUrl: 'https://ansa.it/2', publishedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(), contentFingerprint: 'fp-empty-2' }, places: [], topics: [], media: null },
];

function makeNewsPacket(items, dayKey) {
  return {
    v: 1,
    kind: 'sentiero-editorial-snapshot',
    generatedAt: new Date().toISOString(),
    dayKey,
    items: items.map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      url: item.url,
      published: item.published,
      source: item.source,
      sourceId: item.sourceId,
      sourceMeta: item.sourceMeta,
      provenance: item.provenance,
      places: item.places || [],
      topics: item.topics || [],
      media: item.media
    })),
    edition: {
      v: 4,
      language: 'it',
      dayKey,
      title: 'Il Giornale di Sentiero',
      deck: 'Edizione di prova',
      generatedAt: new Date().toISOString(),
      articles: [{
        title: 'Il governo approva la nuova legge di bilancio per il 2025',
        section: 'Economia',
        kicker: 'Politica',
        claims: [{ text: 'Il governo ha approvato la nuova legge di bilancio con misure per famiglie e imprese.', sourceIds: ['test-1'] }],
        storyIds: ['test-story-1'],
        sourceIds: ['test-1'],
        importance: 50,
        importanceReasons: [],
        deltaType: 'new',
        deltaFromYesterday: 'Nuova oggi.'
      }],
      corrections: [],
      essential: false
    }
  };
}

function createServer(scenario) {
  const dayKey = new Date().toISOString().slice(0, 10);
  let items;
  if (scenario === 'B') items = baseItems;
  else if (scenario === 'C') items = otherRegionItems;
  else items = emptyItems;

  const newsPacket = makeNewsPacket(items, dayKey);

  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/assets/giornale/latest.json' || url.pathname === '/latest.json' || url.pathname === '/assets/parole-giorno-v1.json') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(newsPacket));
        return;
      }
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)), file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
      let body = fs.readFileSync(file), extension = path.extname(file).toLowerCase();
      if (extension === '.html' && path.basename(file) === 'index.html') body = Buffer.from(body.toString('utf8').replace('</body>', makeProbe(scenario) + '</body>'));
      res.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' }); res.end(body);
    } catch (_) { res.writeHead(404); res.end(); }
  });
}

function runChrome(port, width, height, scenario) {
  return new Promise((resolve, reject) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), `sentiero-local-${scenario}-${width}-`));
    const args = ['--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only', `--window-size=${width},${height}`, '--force-device-scale-factor=2', `--user-data-dir=${profile}`, '--virtual-time-budget=20000', '--dump-dom', `http://127.0.0.1:${port}/index.html?local-test=${scenario}-${Date.now()}`];
    const child = spawn(chrome, args, { windowsHide: true }); let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Chrome timeout')); }, 60000);
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); const match = stdout.match(/<pre id="local-news-result">([^<]+)<\/pre>/); if (!match) { console.log('STDOUT:', stdout.slice(-2000)); console.log('STDERR:', stderr.slice(-2000)); return reject(new Error(`Chrome ${scenario} ${width}x${height} ${code}: ${stderr.slice(-500)}`)); } try { resolve(JSON.parse(match[1].replace(/"/g, '"').replace(/&/g, '&'))); } catch (error) { reject(error); } });
  });
}

async function runScenario(scenario, port, widths) {
  const server = createServer(scenario);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  try {
    const results = {};
    for (const width of widths) {
      console.log(`  Testing ${scenario} at ${width}px...`);
      results[width] = await runChrome(serverPort, width, 600, scenario);
      console.log(`    ${width}px:`, JSON.stringify(results[width], null, 2));
    }
    return results;
  } finally {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

function assertScenarioA(label, r) {
  assert.ok(!r.error, `${label}: no error`);
  assert.ok(r.localSection, `${label}: .news-local section exists`);
  assert.ok(r.localCard, `${label}: .local-card exists`);
  assert.ok(r.localHead, `${label}: .local-head exists`);
  assert.ok(r.localLabel, `${label}: .giorno-label exists`);
  assert.ok(r.initialSelect, `${label}: initial region select exists`);
  assert.ok(r.cityInput, `${label}: city input exists`);
  assert.ok(r.primaryBtn, `${label}: primary button (Mostra notizie locali) exists`);
  assert.ok(r.geoBtn, `${label}: geo button exists`);
  assert.ok(!r.clearBtn, `${label}: clear button NOT visible in scenario A`);
  assert.ok(!r.changeSelect, `${label}: change select NOT visible in scenario A`);
  assert.ok(!r.saveBtn || r.saveBtn === r.primaryBtn, `${label}: save button same as primary in scenario A`);
  assert.ok(r.privacy, `${label}: privacy text exists`);
  assert.ok(r.privacyVisible, `${label}: privacy text visible`);
  assert.ok(!r.hasOverlap, `${label}: no horizontal overflow`);
  assert.ok(r.initialSelectHeight >= 44, `${label}: initial select height >= 44px (got ${r.initialSelectHeight})`);
  assert.ok(r.cityInputHeight >= 44, `${label}: city input height >= 44px (got ${r.cityInputHeight})`);
  assert.ok(r.primaryBtnHeight >= 44, `${label}: primary btn height >= 44px (got ${r.primaryBtnHeight})`);
  assert.ok(r.geoBtnHeight >= 44, `${label}: geo btn height >= 44px (got ${r.geoBtnHeight})`);
  assert.ok(r.labelRegionVisible, `${label}: region label visible`);
  assert.ok(r.labelCityVisible, `${label}: city label visible`);
  assert.ok(r.placeholderOpacity > 0.5, `${label}: placeholder opacity reasonable`);
  assert.ok(r.primaryBtnBg && r.primaryBtnBg !== r.geoBtnBg, `${label}: primary CTA visually distinct from geo`);
  assert.deepEqual(r.errors, [], `${label}: no console errors`);
  assert.deepEqual(r.rejections, [], `${label}: no unhandled rejections`);
  assert.ok(r.headText.includes('Scegli il tuo territorio'), `${label}: head shows 'Scegli il tuo territorio'`);
  assert.ok(r.primaryBtnText.includes('Mostra notizie locali'), `${label}: primary button text correct`);
}

function assertScenarioB(label, r) {
  assert.ok(!r.error, `${label}: no error`);
  assert.ok(r.localSection, `${label}: .news-local section exists`);
  assert.ok(r.localCard, `${label}: .local-card exists`);
  assert.ok(r.localHead, `${label}: .local-head exists`);
  assert.ok(r.localLabel, `${label}: .giorno-label exists`);
  assert.ok(!r.initialSelect, `${label}: initial select NOT visible in scenario B`);
  assert.ok(r.changeSelect, `${label}: change region select exists`);
  assert.ok(r.cityInput, `${label}: city input exists`);
  assert.ok(r.saveBtn, `${label}: save button (Aggiorna) exists`);
  assert.ok(r.geoBtn, `${label}: geo button exists`);
  assert.ok(r.clearBtn, `${label}: clear button (Rimuovi territorio) exists`);
  assert.ok(!r.primaryBtn || r.primaryBtn === r.saveBtn, `${label}: primary button is Aggiorna`);
  assert.ok(r.privacy, `${label}: privacy text exists`);
  assert.ok(r.privacyVisible, `${label}: privacy text visible`);
  assert.ok(!r.hasOverlap, `${label}: no horizontal overflow`);
  assert.ok(r.changeSelectHeight >= 44, `${label}: change select height >= 44px (got ${r.changeSelectHeight})`);
  assert.ok(r.cityInputHeight >= 44, `${label}: city input height >= 44px (got ${r.cityInputHeight})`);
  assert.ok(r.saveBtnHeight >= 44, `${label}: save btn height >= 44px (got ${r.saveBtnHeight})`);
  assert.ok(r.geoBtnHeight >= 44, `${label}: geo btn height >= 44px (got ${r.geoBtnHeight})`);
  assert.ok(r.clearBtnHeight >= 44, `${label}: clear btn height >= 44px (got ${r.clearBtnHeight})`);
  assert.ok(r.labelRegionVisible, `${label}: region label visible`);
  assert.ok(r.labelCityVisible, `${label}: city label visible`);
  assert.ok(r.changeSelectDisplay === 'piemonte', `${label}: change select shows Piemonte selected`);
  assert.ok(r.headText.includes('Piemonte'), `${label}: head shows Piemonte`);
  assert.deepEqual(r.errors, [], `${label}: no console errors`);
  assert.deepEqual(r.rejections, [], `${label}: no unhandled rejections`);
  assert.ok(r.gridCards > 0, `${label}: local news cards rendered (got ${r.gridCards})`);
  assert.ok(r.saveBtnText.includes('Aggiorna'), `${label}: save button text correct`);
  for (const [name, ratio] of Object.entries(r.contrasts)) {
    assert.ok(typeof ratio === 'number' && ratio >= 4.5, `${label}: contrasto ${name} >= 4.5:1 (ottenuto ${ratio}:1)`);
    console.log(`    CONTRASTO ${label} ${name}: ${ratio.toFixed(3)}:1`);
  }
}

function assertScenarioC(label, r) {
  assert.ok(!r.error, `${label}: no error`);
  assert.ok(r.localSection, `${label}: .news-local section exists`);
  assert.ok(r.localCard, `${label}: .local-card exists`);
  assert.ok(r.localHead, `${label}: .local-head exists`);
  assert.ok(r.localLabel, `${label}: .giorno-label exists`);
  assert.ok(!r.initialSelect, `${label}: initial select NOT visible in scenario C`);
  assert.ok(r.changeSelect, `${label}: change region select exists`);
  assert.ok(r.cityInput, `${label}: city input exists`);
  assert.ok(r.saveBtn, `${label}: save button (Aggiorna) exists`);
  assert.ok(r.geoBtn, `${label}: geo button exists`);
  assert.ok(r.clearBtn, `${label}: clear button (Rimuovi territorio) exists`);
  assert.ok(r.privacy, `${label}: privacy text exists`);
  assert.ok(r.privacyVisible, `${label}: privacy text visible`);
  assert.ok(!r.hasOverlap, `${label}: no horizontal overflow`);
  assert.ok(r.emptyVisible, `${label}: empty state visible`);
  assert.equal(r.emptyCount, 1, `${label}: exactly one .local-empty (got ${r.emptyCount})`);
  assert.ok(r.emptyText && r.emptyText.includes('Nessuna notizia locale'), `${label}: empty message correct: ${r.emptyText}`);
  assert.ok(r.gridCards === 0, `${label}: zero local news cards (got ${r.gridCards})`);
  assert.ok(r.changeSelectDisplay === 'piemonte', `${label}: change select shows Piemonte selected`);
  assert.ok(r.headText.includes('Piemonte'), `${label}: head shows Piemonte`);
  assert.deepEqual(r.errors, [], `${label}: no console errors`);
  assert.deepEqual(r.rejections, [], `${label}: no unhandled rejections`);
  assert.ok(r.saveBtnText.includes('Aggiorna'), `${label}: save button text correct`);
}

(async () => {
  const widths = [320, 375, 430];

  console.log('\n=== SCENARIO A: NESSUNA REGIONE ===');
  const resultsA = await runScenario('A', 0, widths);
  for (const width of widths) {
    assertScenarioA(`${width}px`, resultsA[width]);
  }
  console.log('  Scenario A: PASS');

  console.log('\n=== SCENARIO B: PIEMONTE CON NOTIZIE ===');
  const resultsB = await runScenario('B', 0, widths);
  for (const width of widths) {
    assertScenarioB(`${width}px`, resultsB[width]);
  }
  console.log('  Scenario B: PASS');

  console.log('\n=== SCENARIO C: PIEMONTE SENZA NOTIZIE LOCALI ===');
  const resultsC = await runScenario('C', 0, widths);
  for (const width of widths) {
    assertScenarioC(`${width}px`, resultsC[width]);
  }
  console.log('  Scenario C: PASS');

  console.log('\n=== ALL VICTINO A TE UI TESTS PASSED ===');
})().catch(error => { console.error(error); process.exitCode = 1; });
