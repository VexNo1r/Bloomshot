'use strict';
// The petal shower over a won result: it bursts from the banner, settles into a gentle fall, ends on its own in a
// few seconds, and draws every kind of piece without error. Run: node qa/test-petals.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Petals = require('../petals.js');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
// A small seeded generator, so every run of the test sees the same shower.
function seeded(seed) { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296); }
function recorder() {
  const calls = [];
  const ctx = new Proxy({}, { get: (target, key) => key in target ? target[key] : (...args) => calls.push(key), set: (target, key, value) => { target[key] = value; return true; } });
  return { ctx, calls };
}

test('Browser and CommonJS builds expose the same shower', () => {
  const context = {}; context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../petals.js'), 'utf8'), context);
  assert.deepEqual(Object.keys(context.BloomPetals), Object.keys(Petals));
});
test('A burst starts at the banner, flies up and out, then drifts down', () => {
  const shower = Petals.create(390, 844, { x: 195, y: 150 }, seeded(7));
  const burst = shower.pieces.filter(p => p.delay < .2);
  assert(burst.length >= 40 && burst.every(p => Math.abs(p.x - 195) <= 20 && Math.abs(p.y - 150) <= 6), 'the burst leaves the banner');
  assert(burst.every(p => p.vy < 0), 'every burst piece starts upward');
  for (let i = 0; i < 60; i++) Petals.step(shower, 1 / 60);
  const spread = Math.max(...burst.map(p => p.x)) - Math.min(...burst.map(p => p.x));
  assert(spread > 150, `the burst fans out (${Math.round(spread)} px)`);
  for (let i = 0; i < 90; i++) Petals.step(shower, 1 / 60);
  const falling = burst.filter(p => p.age < Petals.life);
  assert(falling.every(p => p.vy > 0 && p.vy < 260), 'after the burst everything drifts down gently');
});
test('The shower ends on its own within a few seconds', () => {
  const shower = Petals.create(390, 844, { x: 195, y: 150 }, seeded(3));
  let t = 0; while (Petals.step(shower, 1 / 60)) { t += 1 / 60; assert(t < 6, 'it ends'); }
  assert(t > 2.5, `it lasts long enough to enjoy (${t.toFixed(2)} s)`);
});
test('A small phone gets fewer pieces than a big screen', () => {
  assert(Petals.create(360, 740, { x: 180, y: 120 }, seeded(1)).pieces.length < Petals.create(820, 1180, { x: 410, y: 200 }, seeded(1)).pieces.length);
});
test('Petals, leaves and blossoms all draw with an inked edge, and nothing draws before its start', () => {
  const shower = Petals.create(390, 844, { x: 195, y: 150 }, seeded(11));
  assert.deepEqual([...new Set(shower.pieces.map(p => p.kind))].sort(), ['blossom', 'leaf', 'petal']);
  const early = recorder(); Petals.draw(early.ctx, shower); assert.equal(early.calls.length, 0, 'nothing shows at time zero');
  for (let i = 0; i < 70; i++) Petals.step(shower, 1 / 60);
  const { ctx, calls } = recorder(); Petals.draw(ctx, shower);
  assert(calls.filter(c => c === 'fill').length > 40 && calls.filter(c => c === 'stroke').length > 40, 'filled and outlined');
  assert.equal(calls.filter(c => c === 'save').length, calls.filter(c => c === 'restore').length);
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
