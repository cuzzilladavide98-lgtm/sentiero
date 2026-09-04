import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { clusterNews, fallbackEdition } from '../sentiero-day.mjs';
import { parseFeed } from '../sync-worker/src/index.js';
import { NEWS_SOURCES } from '../sync-worker/src/news-sources.js';
import { CONTINUITY_MAX_AGE_MS, retainCurrentDaySnapshotItems } from './news-snapshot-continuity.mjs';
import { sentieroRomeDayKey } from './news-snapshot-time.mjs';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [resolve(root, 'assets', 'giornale', 'latest.json'), resolve(root, 'latest.json')];
const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';

async function previousSnapshot() {
  try { return JSON.parse(await readFile(outputs[0], 'utf8')); }
  catch (_) { return null; }
}

async function retrieve(source) {
  try {
    const { stdout } = await run(curl, [
      '-L', '--fail', '--silent', '--show-error', '--max-time', '18', '--max-filesize', '700000',
      '-H', 'Accept: application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9', source.url
    ], { encoding: 'utf8', maxBuffer: 750000, windowsHide: true });
    return { sourceId: source.sourceId, ok: true, items: parseFeed(stdout, source).slice(0, source.maxItems || 7) };
  } catch (error) {
    return { sourceId: source.sourceId, ok: false, items: [], error: String(error && error.name || 'fetch') };
  }
}

const results = await Promise.all(NEWS_SOURCES.map(retrieve));
const reachable = results.filter(result => result.ok).length;
const parseable = results.filter(result => result.items.length).length;
const now = new Date(), generatedAt = now.toISOString(), dayKey = sentieroRomeDayKey(now);
const items = retainCurrentDaySnapshotItems(results.flatMap(result => result.items), await previousSnapshot(), dayKey, 160, now.getTime());
if (reachable < 18 || parseable < 14 || items.length < 12) throw new Error(`snapshot_insufficiente:${reachable}:${parseable}:${items.length}`);

const clusters = clusterNews(items).map(cluster => ({ ...cluster, changed: true, deltaType: 'new', deltaSummary: 'Nuova nell’aggiornamento delle fonti.' }));
const edition = fallbackEdition(items, dayKey, clusters);
if (!edition || !edition.articles.length) throw new Error('edizione_snapshot_vuota');
edition.generatedAt = generatedAt;
edition.sourceUpdatedAt = generatedAt;
edition.sourcesUpdatedAt = generatedAt;
const evidenceById = new Map(items.map(item => [item.id, item]));
for (const article of edition.articles) {
  const evidence = article.sourceIds.map(id => evidenceById.get(id)).filter(Boolean);
  article.evidenceState = evidence.some(item => item.continuity?.status === 'CURRENT') ? 'CURRENT' : 'CARRIED';
}

const snapshot = {
  v: 1, kind: 'sentiero-editorial-snapshot', generatedAt, sourcesUpdatedAt: generatedAt, dayKey,
  registryVersion: 3, registrySize: NEWS_SOURCES.length, reachable, parseable,
  sourceCount: new Set(items.map(item => item.sourceId)).size,
  continuity: { maxAgeHours: CONTINUITY_MAX_AGE_MS / 3600000, currentItems: items.filter(item => item.continuity?.status === 'CURRENT').length, carriedItems: items.filter(item => item.continuity?.status === 'CARRIED').length },
  sources: results.map(result => ({ sourceId: result.sourceId, ok: result.ok, items: result.items.length })),
  items, edition
};

const serialized = JSON.stringify(snapshot) + '\n';
const temporary = [];
for (const output of outputs) {
  await mkdir(dirname(output), { recursive: true });
  const path = output + '.tmp';
  await writeFile(path, serialized, 'utf8');
  JSON.parse(await readFile(path, 'utf8'));
  temporary.push([path, output]);
}
await Promise.all(temporary.map(([path, output]) => rename(path, output)));
console.log(JSON.stringify({ ok: true, outputs, reachable, parseable, items: items.length, articles: edition.articles.length, generatedAt: snapshot.generatedAt }));
