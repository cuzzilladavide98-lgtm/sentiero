import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NEWS_SOURCES } from '../sync-worker/src/news-sources.js';
import { parseFeed } from '../sync-worker/src/index.js';

const run = promisify(execFile), curl = process.platform === 'win32' ? 'curl.exe' : 'curl';

const checks = await Promise.all(NEWS_SOURCES.map(async source => {
  try {
    const { stdout } = await run(curl, ['-L', '--fail', '--silent', '--show-error', '--max-time', '12', '--max-filesize', '700000', '-H', 'Accept: application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9', source.url], { encoding: 'utf8', maxBuffer: 750000, windowsHide: true });
    const items = parseFeed(stdout, source);
    return { sourceId: source.sourceId, ok: true, status: 200, items: items.length, perspective: source.perspective, language: source.language };
  } catch (error) { return { sourceId: source.sourceId, ok: false, status: String(error && error.name || 'error'), items: 0 }; }
}));

const reachable = checks.filter(check => check.ok), parseable = reachable.filter(check => check.items > 0);
assert.ok(reachable.length >= 18, `fonti raggiungibili ${reachable.length}/${checks.length}`);
assert.ok(parseable.length >= 14, `fonti con evidenza recente ${parseable.length}/${checks.length}`);
assert.ok(parseable.some(check => check.perspective === 'primary'));
assert.ok(parseable.some(check => check.perspective === 'independent'));
assert.ok(new Set(parseable.map(check => check.language)).size >= 3);
console.log(JSON.stringify({ ok: true, registry: checks.length, reachable: reachable.length, parseable: parseable.length, failed: checks.filter(check => !check.ok || !check.items).map(check => `${check.sourceId}:${check.status}:${check.items}`) }));
