'use strict';

const assert = require('node:assert/strict');
const qrcode = require('../vendor/qrcode.js');
const jsQR = require('../vendor/jsQR.js');

const payload = JSON.stringify({
  v: 2,
  endpoint: 'https://sentiero-sync.example.workers.dev',
  token: 'invito-temporaneo-di-prova',
  publicKey: { kty: 'EC', crv: 'P-256', x: 'asse-x-di-prova', y: 'asse-y-di-prova' },
  expiresAt: 1787862000000
});
const text = 'https://example.github.io/sentiero/?sentieroPair=' + Buffer.from(payload).toString('base64url');
const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
const quiet = 4, scale = 4, modules = qr.getModuleCount(), width = (modules + quiet * 2) * scale;
const rgba = new Uint8ClampedArray(width * width * 4); rgba.fill(255);
for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) {
  if (!qr.isDark(row, col)) continue;
  for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
    const i = (((row + quiet) * scale + y) * width + (col + quiet) * scale + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; rgba[i + 3] = 255;
  }
}
const decoded = jsQR(rgba, width, width, { inversionAttempts: 'attemptBoth' });
assert.ok(decoded, 'il decoder fallback trova il QR generato');
assert.equal(decoded.data, text, 'il payload del pairing torna identico');
process.stdout.write('PASS  generatore e decoder QR offline fanno round-trip del pairing\n');
