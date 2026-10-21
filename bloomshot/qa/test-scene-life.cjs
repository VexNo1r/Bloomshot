'use strict';
// Scene visitors use a visual clock only. These checks protect stillness, the clear play area,
// accessibility and the bounded sprite cache, rather than testing individual illustration paths.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const results = [];
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
function load() {
  const totals = { surfaces: 0, gradients: 0, bytes: 0 }, safeMath = Object.create(Math);
  safeMath.random = () => { throw new Error('Ambient art must never consume the gameplay RNG'); };
  function brush() {
    const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
    const ctx = new Proxy(state, {
      get(target, name) {
        if (name in target) return target[name];
        return (...args) => {
          for (const value of args) if (typeof value === 'number') assert(Number.isFinite(value), `${String(name)} receives finite coordinates`);
          calls.push([name, ...args.filter(value => typeof value === 'number' || typeof value === 'string')]);
          if (name === 'save') stack.push({ ...state });
          if (name === 'restore') { assert(stack.length, 'restore balances save'); Object.assign(state, stack.pop()); }
          if (name === 'createRadialGradient' || name === 'createLinearGradient') { totals.gradients++; return { addColorStop() {} }; }
        };
      },
      set(target, name, value) { if (typeof value === 'number') assert(Number.isFinite(value)); target[name] = value; return true; }
    });
    return { ctx, calls, balanced: () => stack.length === 0 };
  }
  class Canvas {
    constructor(w, h) { this.width = w; this.height = h; totals.surfaces++; totals.bytes += w * h * 4; this.rec = brush(); }
    getContext() { return this.rec.ctx; }
  }
  const scope = vm.createContext({ Math: safeMath, OffscreenCanvas: Canvas, console });
  for (const name of ['scenery', 'art']) vm.runInContext(fs.readFileSync(path.join(__dirname, `../${name}.js`), 'utf8'), scope, { filename: `${name}.js` });
  return { Art: scope.BloomArt, Scenery: scope.BloomScenery, totals, brush };
}
const rig = load(), themes = rig.Scenery.themes;
test('All ten levels have two appropriate visitors, with deterministic long pauses', () => {
  const expected = [['butterfly', 'bee'], ['worm', 'gopher'], ['moth', 'snail'], ['bat', 'glint'], ['glowworm', 'minnow'], ['beetle', 'gecko'], ['salamander', 'ember'], ['mouse', 'glint'], ['spider', 'firefly'], ['seed-sprite', 'starmote']];
  assert.equal(themes.length, 10);
  themes.forEach((theme, index) => {
    const kinds = new Set(); let active = 0;
    for (let step = 0; step < 1200; step++) {
      const time = step / 10, a = JSON.stringify(rig.Scenery.lifePlan(theme, time, false)), b = JSON.stringify(rig.Scenery.lifePlan(theme, time, false));
      assert.equal(a, b, 'a visual clock gives the same visit without randomness');
      const plan = JSON.parse(a); if (plan.length) active++;
      plan.forEach(visitor => kinds.add(visitor.kind));
    }
    assert.deepEqual([...kinds].sort(), expected[index].sort(), theme);
    assert(active < 470, `${theme} is quiet for more than 60% of the time`);
  });
});
test('Visitors stay at the edges and at most two appear; none occupies the central play area', () => {
  for (const theme of themes) for (let step = 0; step < 12000; step++) {
    const plan = rig.Scenery.lifePlan(theme, step / 10, false); assert(plan.length <= 2);
    for (const visitor of plan) {
      assert(visitor.x <= .094 || visitor.x >= .906, `${theme} avoids the center`);
      assert(visitor.y >= .16 && visitor.y <= .9, `${theme} avoids launcher and heading`);
      assert(visitor.opacity >= 0 && visitor.opacity <= .82 + 1e-12);
      for (const key of ['x', 'y', 'turn', 'progress', 'age']) assert(Number.isFinite(visitor[key]));
    }
  }
});
test('Entry and exit start invisible; peeking visitors pause instead of constantly wobbling', () => {
  for (const theme of themes) {
    let entry = null, last = null;
    for (let i = 0; i < 6000; i++) {
      const plan = rig.Scenery.lifePlan(theme, i / 100, false);
      if (!entry && plan.length) entry = plan[0];
      if (plan.length) last = plan[0];
    }
    assert(entry.opacity < .001, theme + ' enters softly'); assert(last);
  }
  const a = rig.Scenery.lifePlan('depth-roots', 11.2, false).find(visitor => visitor.kind === 'gopher');
  const b = rig.Scenery.lifePlan('depth-roots', 12.6, false).find(visitor => visitor.kind === 'gopher');
  assert.equal(a.x, b.x); assert.equal(a.y, b.y); assert.equal(a.turn, b.turn);
});
test('Reduced motion removes every visitor and immediately clears the overlay', () => {
  for (const theme of themes) for (const time of [0, 4, 12, 24, 125]) {
    assert.equal(rig.Scenery.lifePlan(theme, time, true).length, 0);
    const rec = rig.brush(); rig.Art.drawSceneLife(rec.ctx, 430, 932, theme, time, true);
    assert.deepEqual(rec.calls, [['save'], ['clearRect', 0, 0, 430, 932], ['restore']]); assert(rec.balanced());
  }
});

test('Blank ambient frames do no canvas work; visible visitors clear once and erase their last frame', () => {
  for (const theme of themes) {
    let painted = false, active = 0, exits = 0;
    for (let step = 0; step < 600; step++) {
      const time = step / 10, rec = rig.brush();
      const visible = rig.Scenery.lifePlan(theme, time, false).some(visitor => visitor.opacity > .001);
      const result = rig.Art.drawSceneLife(rec.ctx, 390, 844, theme, time, false, painted);
      assert.equal(result, visible);
      assert.equal(rec.calls.filter(call => call[0] === 'clearRect').length, visible || painted ? 1 : 0);
      if (!visible && !painted) assert.deepEqual(rec.calls, [], 'a quiet layer is untouched');
      if (visible) active++;
      if (painted && !visible) exits++;
      assert(rec.balanced()); painted = result;
    }
    assert(active > 0 && exits > 0, 'both visits and their final erase are exercised');
    const rec = rig.brush();
    assert.equal(rig.Art.drawSceneLife(rec.ctx, 390, 844, theme, 12, true, true), false);
    assert.equal(rec.calls.filter(call => call[0] === 'clearRect').length, 1, 'disabling motion erases an existing visitor');
  }
});
test('Portrait phone and tablet draws use finite coordinates and balanced Canvas state', () => {
  for (const [w, h] of [[320, 568], [430, 932], [1032, 1376]]) for (const theme of themes) for (let time = 0; time < 60; time += .25) {
    const rec = rig.brush(); rig.Art.drawSceneLife(rec.ctx, w, h, theme, time, false); assert(rec.balanced()); assert.equal(rec.ctx.globalAlpha, 1);
  }
});
test('Warmed ambient frames reuse a bounded sprite atlas with no per-frame paths or gradients', () => {
  for (const theme of themes) for (let time = 0; time < 60; time += .1) rig.Art.drawSceneLife(rig.brush().ctx, 432, 768, theme, time, false);
  const before = { ...rig.totals };
  assert(before.surfaces <= 48, 'one bounded small atlas'); assert(before.bytes < 3400000, 'sprites stay below 3.4 MB decoded');
  for (const theme of themes) for (let time = 60; time < 120; time += .2) {
    const rec = rig.brush(); rig.Art.drawSceneLife(rec.ctx, 432, 768, theme, time, false);
    assert(!rec.calls.some(call => ['createRadialGradient', 'createLinearGradient', 'bezierCurveTo', 'ellipse', 'getImageData', 'putImageData'].includes(call[0])), 'only sprite blits and the spider thread occur during a frame');
  }
  assert.deepEqual(rig.totals, before);
});
test('Garden scene aliases use the same bounded visitors; invalid visual clocks are safe', () => {
  for (const [alias, campaign] of [['meadow', 'depth-meadow'], ['moon', 'depth-crystal'], ['koi', 'depth-lake']]) for (const time of [4, 9, 18, 44]) assert.equal(JSON.stringify(rig.Scenery.lifePlan(alias, time, false)), JSON.stringify(rig.Scenery.lifePlan(campaign, time, false)));
  for (const time of [NaN, Infinity, -1, undefined, 'invalid']) assert.equal(rig.Scenery.lifePlan('depth-roots', time, false).length, 0);
});
const report = { passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, spriteSurfaces: rig.totals.surfaces, spriteDecodedBytes: rig.totals.bytes, results };
fs.writeFileSync(path.join(__dirname, 'scene-life-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
