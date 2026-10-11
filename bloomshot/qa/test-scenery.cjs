'use strict';
// The painted scenes: every level scene, every garden board and every rock paints without error, the same way every
// time, and leaves the canvas state as it found it. Run: node qa/test-scenery.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
// A 2D context that records every call. Gradients take color stops, and the transform is the 2x the game paints at,
// so the soft-edged brushes take their real path.
function recorder() {
  const calls = [], gradient = () => ({ addColorStop: (at, color) => { assert(at >= 0 && at <= 1, `stop ${at}`); calls.push(['stop', color]); } });
  const own = {
    createLinearGradient: gradient, createRadialGradient: gradient, createPattern: () => null,
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }), measureText: text => ({ width: String(text).length * 6 })
  };
  const ctx = new Proxy({}, {
    get: (target, key) => key in own ? own[key] : key in target ? target[key] : (...args) => { calls.push([key, ...args.filter(a => typeof a === 'number').map(n => Math.round(n * 100) / 100)]); },
    set: (target, key, value) => { target[key] = value; calls.push(['set', key, typeof value === 'string' || typeof value === 'number' ? value : typeof value]); return true; }
  });
  return { ctx, calls };
}
// Scenery runs as the browser loads it. Math.random is taken away, so a scene that reached for it would throw.
function load() {
  const context = { Math: Object.create(Math, { random: { value: () => { throw new Error('scenery must not use Math.random'); } } }) };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scenery.js'), 'utf8'), context);
  return context.BloomScenery;
}
const Scenery = load();
const balanced = calls => {
  let depth = 0;
  for (const [key] of calls) { if (key === 'save') depth++; if (key === 'restore') depth--; assert(depth >= 0, 'restore without save'); }
  return depth === 0;
};

test('All ten level scenes are registered, in the order the levels go down', () => {
  assert.deepEqual([...Scenery.themes], ['depth-meadow', 'depth-roots', 'depth-grotto', 'depth-crystal', 'depth-lake', 'depth-fossil', 'depth-ember', 'depth-geode', 'depth-briar', 'depth-core']);
  for (const theme of Scenery.themes) { assert.equal(typeof Scenery.dark(theme), 'boolean'); assert.match(Scenery.ink(theme), /^#[0-9a-f]{6}$/); }
  assert.equal(Scenery.has('depth-nowhere'), false);
});
test('Every level scene paints, framed and unframed, without Math.random and with save and restore balanced', () => {
  for (const theme of Scenery.themes) {
    for (const frame of [true, false]) {
      const { ctx, calls } = recorder();
      Scenery.paint(ctx, theme, { frame });
      assert(calls.filter(([key]) => key === 'fill').length > 60, `${theme} paints a full scene`);
      assert(balanced(calls), `${theme} restores every save`);
    }
  }
});
test('A scene paints the same picture every time', () => {
  for (const theme of Scenery.themes) {
    const a = recorder(), b = recorder();
    Scenery.paint(a.ctx, theme); Scenery.paint(b.ctx, theme);
    assert.deepEqual(a.calls, b.calls, theme);
  }
});
test('The level card leaves out the frame the board keeps', () => {
  for (const theme of Scenery.themes) {
    const framed = recorder(), card = recorder();
    Scenery.paint(framed.ctx, theme); Scenery.paint(card.ctx, theme, { frame: false });
    assert(framed.calls.length > card.calls.length, `${theme} frames only the board`);
  }
});
test('The garden boards paint in play and in Rush', () => {
  for (const theme of ['meadow', 'moon', 'koi']) {
    assert.equal(Scenery.garden(theme), true);
    for (const rush of [false, true]) { const { ctx, calls } = recorder(); Scenery.paintGarden(ctx, theme, rush); assert(calls.length > 200 && balanced(calls), theme); }
  }
});
test('Rocks draw for every scene, sliding or still', () => {
  for (const theme of [...Scenery.themes, 'meadow']) {
    for (const rock of [{ id: 'r1', x: 210, y: 240, length: 50, angle: .3 }, { id: 'r22', x: 120, y: 300, length: 70, angle: 0, slide: 30, baseX: 120 }]) {
      const { ctx, calls } = recorder(); Scenery.drawRock(ctx, rock, theme);
      assert(calls.some(([key]) => key === 'fill') && balanced(calls), theme);
    }
  }
});
test('The painter\'s kit is shared with the Garden tab map', () => {
  assert.deepEqual(Object.keys(Scenery.kit).sort(), ['bloom', 'clipTo', 'clump', 'grain', 'lin', 'rad', 'rgba', 'scallop', 'shape', 'smooth', 'soft']);
  assert.equal(Scenery.kit.rgba('255,200,100', 1.4), 'rgba(255,200,100,1.000)', 'alpha is clamped');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
