'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
assert.match(html, /v274\.2 — DUE CORPI, NON DUE ICONE/);
for (const token of ['terra-atmosfera', 'terra-oceano-grad', 'terra-continente-luce', 'terra-nubi', 'terra-notte-grad', 'terra-bordo']) assert.match(html, new RegExp(token));
assert.match(html, /#giorno-terra\s*\{[\s\S]*width:72px;height:72px/);
assert.match(html, /#giorno-terra \.terra-globo\s*\{[\s\S]*width:30px;height:30px/);
assert.match(html, /#notte-luce\s*\{[\s\S]*width:88px;height:88px/);
assert.match(html, /#notte-luce \.nucleo::before\s*\{[\s\S]*width:22px;height:22px/);
assert.match(html, /conic-gradient\(from 38deg/);
assert.match(html, /conic-gradient\(from 12deg/);
assert.match(html, /@keyframes notte-campo/);
assert.match(html, /body\.theme-lcd #notte-luce \.nucleo::after,[\s\S]*display:block!important/);
assert.ok(html.lastIndexOf('display:block!important') > html.lastIndexOf('display:none !important'), 'gli strati Purple LCD devono vincere nel cascade');
assert.match(html, /prefers-reduced-motion:reduce[\s\S]*#notte-luce::after\{animation:none!important\}/);
assert.doesNotMatch(html.slice(html.indexOf('v274.2 — DUE CORPI'), html.indexOf('</style>')), /url\(['"]?https?:/);
console.log(JSON.stringify({ ok: true, earth: '30px globe / 72px target', purple: '22px core / 88px field', oled: true, lcd: true, reducedMotion: true }));
