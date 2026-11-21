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

test('Level 7\'s basking salamander is scenery: under the danger line at the board\'s edge, in dusky colours at .8', () => {
  // A context that follows the transform and the alpha, and keeps where each filled dot lands and in what colour.
  const stack = [], dots = [], colors = new Set(); let m = [1, 0, 0, 1, 0, 0], alpha = 1, arc = null;
  const mul = (a, b, c, d, e, f) => { m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; };
  const own = {
    createLinearGradient: () => ({ addColorStop: (at, c) => colors.add(c) }), createRadialGradient: () => ({ addColorStop: (at, c) => colors.add(c) }), createPattern: () => null,
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }), measureText: text => ({ width: String(text).length * 6 }),
    save: () => stack.push([m.slice(), alpha]), restore: () => { [m, alpha] = stack.pop(); },
    translate: (x, y) => mul(1, 0, 0, 1, x, y), scale: (x, y) => mul(x, 0, 0, y, 0, 0), rotate: a => mul(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0),
    setTransform: (...a) => { m = a.length === 6 ? a : [1, 0, 0, 1, 0, 0]; }, resetTransform: () => { m = [1, 0, 0, 1, 0, 0]; },
    arc: (x, y) => { arc = [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    fill: () => { if (arc) dots.push({ at: arc, color: target.fillStyle, alpha }); }
  };
  const target = {};
  const ctx = new Proxy(target, {
    get: (t, key) => key in own ? own[key] : key === 'globalAlpha' ? alpha : key in t ? t[key] : () => { if (key === 'beginPath') arc = null; },
    set: (t, key, value) => { if (key === 'globalAlpha') alpha = value; else { t[key] = value; if (typeof value === 'string') colors.add(value); } return true; }
  });
  Scenery.paint(ctx, 'depth-ember', { frame: true });
  // The salamander's eye is its one near-black dot.
  const eye = dots.filter(d => d.color === '#2a0d0a');
  assert.equal(eye.length, 1, 'one salamander');
  const [x, y] = eye[0].at;
  assert(y >= 448, `it sits under the danger line (eye at y ${y.toFixed(1)})`);
  assert(x >= 360, `it sits at the board's right edge (eye at x ${x.toFixed(1)})`);
  assert(eye[0].alpha <= .8 + 1e-9, 'it is drawn at no more than .8 strength');
  // None of the bright foe reds and yellows it used to wear.
  for (const bright of ['#c8462a', '#e86438', '#ffa45e', '#ffd36a', '#d4502e', '#b8402a']) assert(!colors.has(bright), `${bright} is gone from the scene`);
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
