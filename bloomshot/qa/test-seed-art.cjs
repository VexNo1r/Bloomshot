'use strict';
// Ordinary projectile illustration checks. No game physics, source edits or player storage involved.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8'), Keepsakes = require('../keepsakes.js');
const results = [], types = ['gold', 'coral', 'lilac', 'sky', 'poppy'];
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
function rig() {
  const totals = { surfaces: 0, gradients: 0, bytes: 0 }, surfaces = [];
  function brush() {
    const calls = [], stack = [], state = { globalAlpha: 1, shadowBlur: 0, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
    const ctx = new Proxy(state, {
      get(target, name) {
        if (name in target) return target[name];
        return (...args) => {
          for (const value of args) if (typeof value === 'number') assert(Number.isFinite(value), `${String(name)} receives finite values`);
          calls.push([name, ...args.filter(value => typeof value === 'number' || typeof value === 'string')]);
          if (name === 'save') stack.push({ ...state });
          else if (name === 'restore') { assert(stack.length, 'restores a saved state'); Object.assign(state, stack.pop()); }
          else if (name === 'createRadialGradient' || name === 'createLinearGradient') { totals.gradients++; return { addColorStop() {} }; }
        };
      },
      set(target, name, value) { if (typeof value === 'number') assert(Number.isFinite(value)); target[name] = value; return true; }
    });
    return { ctx, calls, balanced: () => stack.length === 0 };
  }
  class Canvas { constructor(w, h) { this.width = w; this.height = h; this.rec = brush(); surfaces.push(this); totals.surfaces++; totals.bytes += w * h * 4; } getContext() { return this.rec.ctx; } }
  const scope = vm.createContext({ OffscreenCanvas: Canvas, console }); vm.runInContext(source, scope);
  return { Art: scope.BloomArt, totals, surfaces, brush };
}
const seed = type => ({ id: type, type, x: 180, y: 300, r: 5.5, vx: 120, vy: -500, age: .3, trail: [{ x: 175, y: 340 }, { x: 178, y: 320 }] });
test('All five ordinary seeds draw finite paths and leave collision/trail data untouched', () => {
  const { Art, brush } = rig();
  for (const type of types) for (const age of [0, .04, .3]) for (const reduced of [false, true]) for (const fever of [false, true]) {
    const ball = { ...seed(type), age }, before = JSON.stringify(ball), rec = brush();
    Art.drawProjectile(rec.ctx, ball, 0, 3.1, reduced, fever, null); assert(rec.balanced()); assert.equal(JSON.stringify(ball), before); assert.equal(rec.ctx.globalAlpha, 1);
  }
});
test('The cached body retains the exact colored circular boundary and puts the almond inside it', () => {
  const { Art, brush, surfaces } = rig();
  for (const type of types) Art.drawProjectile(brush().ctx, seed(type), 0, 3, true, false, null);
  const bodies = surfaces.filter(surface => surface.width === 45 && surface.height === 45);
  assert.equal(bodies.length, 5);
  for (const body of bodies) {
    const arcs = body.rec.calls.filter(call => call[0] === 'arc'); assert.equal(Math.max(...arcs.map(call => call[3])), 6.8, '5.5px radius plus the preexisting 1.3px color rim');
    const almond = body.rec.calls.find(call => call[0] === 'ellipse'); assert(almond && almond[3] < 5.5 && almond[4] < 5.5, 'seed remains inside its round hit silhouette');
    assert(body.rec.calls.some(call => call[0] === 'quadraticCurveTo'), 'the inset carries a readable seam');
  }
});
test('The five new body sprites stay below 45 KB and warmed frames make no new surfaces or gradients', () => {
  const { Art, brush, totals, surfaces } = rig();
  for (const type of types) Art.drawProjectile(brush().ctx, seed(type), 0, 3, false, false, null);
  const bodies = surfaces.filter(surface => surface.width === 45 && surface.height === 45); assert(bodies.reduce((bytes, surface) => bytes + surface.width * surface.height * 4, 0) < 45000);
  const before = { ...totals };
  for (let frame = 0; frame < 120; frame++) for (const type of types) Art.drawProjectile(brush().ctx, seed(type), 0, frame / 60, false, false, null);
  assert.deepEqual(totals, before, 'only cached blits occur for the seed body and light');
});
test('Reduced motion keeps the projectile pose static and omits its trail', () => {
  const { Art, brush } = rig(), ball = seed('gold'); Art.drawProjectile(brush().ctx, ball, 0, 1, true, false, null);
  const a = brush(), b = brush(); Art.drawProjectile(a.ctx, ball, 0, 1, true, false, null); Art.drawProjectile(b.ctx, ball, 0, 10, true, false, null);
  assert.deepEqual(a.calls, b.calls); assert(!a.calls.some(call => call[0] === 'lineTo' || call[0] === 'rotate'), 'no decorative movement or tail');
});
test('Keepsake and power branches retain distinct illustrations without mutating seeds', () => {
  const { Art, brush } = rig(), signatures = new Set();
  for (const style of Keepsakes.styles.filter(style => style.seed)) {
    const ball = seed('gold'), before = JSON.stringify(ball), rec = brush(); Art.drawProjectile(rec.ctx, ball, 0, 1, true, false, style); assert(rec.balanced()); assert.equal(JSON.stringify(ball), before);
  }
  for (const power of ['beeline', 'sunburst', 'dandelion']) {
    const ball = { ...seed('gold'), power }, before = JSON.stringify(ball), rec = brush(); Art.drawProjectile(rec.ctx, ball, 0, 1, true, false, null); assert(rec.balanced()); assert.equal(JSON.stringify(ball), before); signatures.add(JSON.stringify(rec.calls));
  }
  assert.equal(signatures.size, 3, 'powered shots keep their bee, sun and parachute silhouettes');
});
const report = { passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'seed-art-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
