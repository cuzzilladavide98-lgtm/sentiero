import assert from 'node:assert/strict';
import { normalizeEtymology } from '../sentiero-day.mjs';

assert.equal(
  normalizeEtymology('voce numida, che&nbsp;è deriva dal latino Numida'),
  'voce numida, che deriva dal latino Numida',
  'l’assemblaggio non deve produrre “che è deriva”'
);
assert.equal(
  normalizeEtymology('forma antica che e deriva dal greco'),
  'forma antica che deriva dal greco',
  'anche la variante senza accento deve essere corretta'
);
const correct = 'dal francese hôtel (stesso senso), dal latino hospitale, ossia "ospedale"';
assert.equal(normalizeEtymology(correct), correct, 'un’etimologia corretta deve restare invariata');
assert.equal(normalizeEtymology('parola che è derivata dal latino'), 'parola che è derivata dal latino', 'la costruzione grammaticale “che è derivata” deve restare invariata');

console.log('PASS etimologia: varianti “che è/e deriva” normalizzate; formulazioni corrette invariate');
