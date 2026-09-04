import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../sentiero-app.js', import.meta.url), 'utf8');
const day = fs.readFileSync(new URL('../sentiero-day.mjs', import.meta.url), 'utf8');
for (const field of ['currentDay', 'editionDay', 'editionGeneratedAt', 'sourcesUpdatedAt', 'cacheSavedAt', 'origin', 'sourceAgeMinutes', 'refreshStartedAt', 'refreshEndedAt', 'refreshReason', 'sourceFetch', 'sourceChannel', 'sourceTransport', 'workerStatus', 'compose', 'abortReason', 'endpointConfigured', 'online', 'stale']) assert.match(app, new RegExp(`\\b${field}\\b`), `diagnostica mancante: ${field}`);
assert.match(day, /window\.__sentieroNewsDiag/);
assert.match(day, /sourceOrigin:\s*'device-cache'/);
assert.doesNotMatch(app.match(/d\.giornale=\{[\s\S]*?\n\s*\};/)?.[0] || '', /quests|diary|titolo|summary|claim|position/i, 'la diagnostica freshness non deve includere contenuti o preferenze');
console.log('PASS diagnostica freshness: tempi, origine, fetch/compose/abort, SW-contesto e stato online senza contenuti');
