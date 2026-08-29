import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = basename(scriptDirectory) === 'tools' ? resolve(scriptDirectory, '..') : scriptDirectory;
let workerDirectory = resolve(root, 'sync-worker', 'src');
if (!existsSync(resolve(workerDirectory, 'index.js'))) {
  workerDirectory = resolve(root, '.snapshot-runtime');
  await mkdir(workerDirectory, { recursive: true });
  await copyFile(resolve(root, 'index.js'), resolve(workerDirectory, 'index.mjs'));
  await copyFile(resolve(root, 'news-sources.js'), resolve(workerDirectory, 'news-sources.js'));
  await writeFile(resolve(workerDirectory, 'package.json'), '{"type":"module"}\n', 'utf8');
}
const { clusterNews, fallbackEdition } = await import(pathToFileURL(resolve(root, 'sentiero-day.mjs')));
const workerIndex = resolve(workerDirectory, existsSync(resolve(workerDirectory, 'index.mjs')) ? 'index.mjs' : 'index.js');
const { dedupeNews, parseFeed } = await import(pathToFileURL(workerIndex));
const { NEWS_SOURCES } = await import(pathToFileURL(resolve(workerDirectory, 'news-sources.js')));
const outputs = [resolve(root, 'assets', 'giornale', 'latest.json'), resolve(root, 'latest.json')];
const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';

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
const items = dedupeNews(results.flatMap(result => result.items));
if (reachable < 18 || parseable < 14 || items.length < 12) throw new Error(`snapshot_insufficiente:${reachable}:${parseable}:${items.length}`);

const now = new Date(), dayKey = now.toISOString().slice(0, 10);
const clusters = clusterNews(items).map(cluster => ({ ...cluster, changed: true, deltaType: 'new', deltaSummary: 'Nuova nell’aggiornamento delle fonti.' }));
const edition = fallbackEdition(items, dayKey, clusters);
if (!edition || !edition.articles.length) throw new Error('edizione_snapshot_vuota');
edition.generatedAt = now.toISOString();
edition.sourceUpdatedAt = now.toISOString();

const snapshot = {
  v: 1, kind: 'sentiero-editorial-snapshot', generatedAt: now.toISOString(), dayKey,
  registryVersion: 3, registrySize: NEWS_SOURCES.length, reachable, parseable,
  sourceCount: new Set(items.map(item => item.sourceId)).size,
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
