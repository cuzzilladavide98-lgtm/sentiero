'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { performance } = require('node:perf_hooks');

const candidate = path.resolve(__dirname, '..');
const baseline = process.argv[2] ? path.resolve(process.argv[2]) : null;

function median(values) {
  const a = values.slice().sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function sources(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const list = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (const m of html.matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/gi)) {
    const file = path.join(dir, m[1].replace(/^\.\//, ''));
    if (fs.existsSync(file)) list.unshift(fs.readFileSync(file, 'utf8'));
  }
  return { html, js: list.join('\n') };
}

function measure(dir) {
  const src = sources(dir), times = [];
  for (let i = 0; i < 17; i++) {
    const t = performance.now();
    new vm.Script(src.js + '\n/* bench ' + i + ' ' + Math.random() + ' */');
    times.push(performance.now() - t);
  }
  return {
    htmlBytes: Buffer.byteLength(src.html),
    htmlGzipBytes: zlib.gzipSync(src.html, { level: 9 }).length,
    startupJsBytes: Buffer.byteLength(src.js),
    compileMedianMs: Number(median(times).toFixed(2))
  };
}

function promptBudget() {
  const quests = Array.from({ length: 100 }, (_, i) => ({
    id: 'q' + i, titolo: 'Quest di prova numero ' + i, note: 'Contesto utile per la quest ' + i,
    quando: '2026-09-' + String((i % 28) + 1).padStart(2, '0'), ora: '10:30', prio: (i % 3) + 1,
    fatto: i >= 60, nata: '2026-08-01', monte: 'desiderio-esempio'
  }));
  const before = JSON.stringify(quests).length;
  const active = quests.filter(q => !q.fatto), done = quests.filter(q => q.fatto).slice(-20);
  const after = JSON.stringify(active.concat(done).slice(-100).map(q => ({
    id: q.id, titolo: q.titolo, note: q.note || '', quando: q.quando || '', ora: q.ora || '', prio: q.prio || 3, fatto: !!q.fatto
  }))).length;
  return { beforeChars: before, afterChars: after, reductionPct: Number(((before - after) / before * 100).toFixed(1)) };
}

const result = { generatedAt: new Date().toISOString(), method: '17 compile runs; median; gzip-9; synthetic 100-Quest context', candidate: measure(candidate), promptContext: promptBudget() };
if (baseline) result.baseline = measure(baseline);
if (result.baseline) {
  result.delta = {
    htmlBytes: result.candidate.htmlBytes - result.baseline.htmlBytes,
    htmlGzipBytes: result.candidate.htmlGzipBytes - result.baseline.htmlGzipBytes,
    startupJsBytes: result.candidate.startupJsBytes - result.baseline.startupJsBytes,
    compileMedianMs: Number((result.candidate.compileMedianMs - result.baseline.compileMedianMs).toFixed(2))
  };
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
