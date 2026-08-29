import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);
const snapshotUrl = new URL('../assets/giornale/latest.json', import.meta.url);
const before = JSON.parse(fs.readFileSync(snapshotUrl, 'utf8'));
const startedAt = Date.now();
const { stdout } = await run(process.execPath, ['tools/build-news-snapshot.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 200000, windowsHide: true });
const execution = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
const after = JSON.parse(fs.readFileSync(snapshotUrl, 'utf8'));
assert.equal(execution.ok, true);
assert.ok(Date.parse(after.generatedAt) >= startedAt - 1000);
assert.ok(Date.parse(after.generatedAt) > Date.parse(before.generatedAt));
assert.ok(after.reachable >= 18 && after.parseable >= 14);
assert.ok(after.items.length >= 12 && after.edition.articles.length >= 1);

const workflow = fs.readFileSync(new URL('../.github/workflows/update-giornale.yml', import.meta.url), 'utf8');
assert.match(workflow, /run:\s*node tools\/build-news-snapshot\.mjs/);
assert.match(workflow, /git add assets\/giornale\/latest\.json/);
assert.match(workflow, /git commit -m/);
assert.match(workflow, /git push/);
console.log(JSON.stringify({ ok: true, generatedAt: after.generatedAt, reachable: after.reachable, parseable: after.parseable, items: after.items.length, articles: after.edition.articles.length }));
