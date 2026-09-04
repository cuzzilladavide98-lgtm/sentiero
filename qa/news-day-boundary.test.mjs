import assert from 'node:assert/strict';
import { sentieroRomeDayKey } from '../tools/news-snapshot-time.mjs';

assert.equal(sentieroRomeDayKey(new Date('2026-09-04T02:19:59.000Z')), '2026-09-03', '04:19 CEST appartiene ancora al giorno Sentiero precedente');
assert.equal(sentieroRomeDayKey(new Date('2026-09-04T02:20:00.000Z')), '2026-09-04', '04:20 CEST apre il nuovo giorno Sentiero');
assert.equal(sentieroRomeDayKey(new Date('2026-12-04T03:19:59.000Z')), '2026-12-03', '04:19 CET appartiene ancora al giorno Sentiero precedente');
assert.equal(sentieroRomeDayKey(new Date('2026-12-04T03:20:00.000Z')), '2026-12-04', '04:20 CET apre il nuovo giorno Sentiero');
console.log('PASS day boundary Europe/Rome: CEST e CET, soglia 04:20');
