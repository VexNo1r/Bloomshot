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
test('Loaded and tray seeds reuse a bounded cache even through a regrowth pop', () => {
  const { Art, brush, totals } = rig(), rec = brush();
  for (const style of [null, ...Keepsakes.styles.filter(s => s.seed)]) {
    for (const size of [7.4, 8.4]) Art.drawSeed(rec.ctx, 210, 498, size, 1, false, style, size);
  }
  const before = { ...totals };
  for (let frame = 0; frame < 120; frame++) for (const style of [null, ...Keepsakes.styles.filter(s => s.seed)]) {
    for (const size of [7.4, 8.4]) Art.drawSeed(rec.ctx, 210, 498, size * (1 + .3 * Math.max(0, 1 - frame / 12)), frame / 60, false, style, size);
  }
  assert.deepEqual(totals, before, 'no new gradients or surfaces while the cached seed scales');
  assert(rec.calls.some(call => call[0] === 'drawImage')); assert(rec.balanced());
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

// The seed color glyphs (spec 1.11): from Level 4 each full tray slot shows a tinted disc under its seed and the color's
// glyph over it, and the cup seed shows its glyph too. A trace keeps every call and setting in order with the
// translate/scale in force, so each disc and glyph is found where it is drawn and measured in board px.
function trace() {
  const ops = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 }; let m = { x: 0, y: 0, s: 1 };
  const ctx = new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      return (...args) => {
        if (name === 'save') stack.push({ m: { ...m }, state: { ...state } });
        else if (name === 'restore') { const top = stack.pop(); m = top.m; Object.assign(state, top.state); }
        else if (name === 'translate') m = { x: m.x + args[0] * m.s, y: m.y + args[1] * m.s, s: m.s };
        else if (name === 'scale') m = { ...m, s: m.s * args[0] };
        ops.push({ name, args, m: { ...m }, state: { ...state } });
        if (name === 'createRadialGradient' || name === 'createLinearGradient') return { addColorStop() {} };
        if (name === 'measureText') return { width: 10 };
      };
    },
    set(target, name, value) { target[name] = value; return true; }
  });
  return { ctx, ops, balanced: () => stack.length === 0 };
}
// The y extent of an arc's swept part (its end points and any top or bottom it passes).
function arcSpan(cx, cy, r, a0, a1, ccw) {
  const ys = [cy + r * Math.sin(a0), cy + r * Math.sin(a1)], sweep = ccw ? ((a0 - a1) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI : ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
  for (const at of [Math.PI / 2, -Math.PI / 2]) { const d = ccw ? ((a0 - at) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) : ((at - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); if (d <= sweep + 1e-9) ys.push(cy + r * Math.sin(at)); }
  return ys;
}
// Each painted path: discs (one arc of r GLYPH.disc filled at alpha .85) and glyphs (stroked 2.4 then filled white).
function glyphsIn(ops) {
  const discs = [], glyphs = []; let path = null, stroked = false;
  for (const op of ops) {
    if (op.name === 'beginPath') { path = { ys: [], arcs: [], m: op.m }; stroked = false; continue; }
    if (!path) continue;
    if (op.name === 'moveTo' || op.name === 'lineTo') path.ys.push(op.args[1]);
    else if (op.name === 'arc') { path.arcs.push(op.args); path.ys.push(...arcSpan(...op.args)); }
    else if (op.name === 'stroke') stroked = op.state.lineWidth === 2.4;
    else if (op.name === 'fill') {
      const at = { x: path.m.x, y: path.m.y, s: path.m.s };
      if (path.arcs.length === 1 && path.arcs[0][2] === 10 && path.arcs[0][0] === 0 && path.arcs[0][1] === 0 && op.state.globalAlpha === .85) discs.push({ ...at, color: op.state.fillStyle });
      else if (stroked && op.state.fillStyle === '#ffffff') glyphs.push({ ...at, ink: op.state.strokeStyle, height: Math.max(...path.ys) - Math.min(...path.ys), order: ops.indexOf(op) });
    }
  }
  return { discs, glyphs };
}
const board = (colorAhead, extra = {}) => ({ mode: 'rush', status: 'playing', lives: 3, buds: [], balls: [], bumpers: [], particles: [], floaters: [], launcher: { x: 210, y: 498 },
  podSize: 4, pod: 4, podGrow: 0, shotNumber: 2, nextType: types[2], typeAhead(k) { return types[(2 + k) % 5]; }, colorAhead, ...extra });
const node = () => { const scope = vm.createContext({ console }); vm.runInContext(source, scope); return scope.BloomArt; };
test('From Level 4 every full tray slot gets a tinted disc (r 10) then its glyph, and the cup seed its glyph', () => {
  const Art = node(), rec = trace(), state = board(true);
  Art.draw(rec.ctx, state, 1, { reducedMotion: true, backdrop: false, showAim: false }); assert(rec.balanced());
  const { discs, glyphs } = glyphsIn(rec.ops), slots = [257, 279, 301];
  assert.equal(discs.length, 3, 'one disc per full slot'); assert.equal(glyphs.length, 4, 'three tray glyphs and the cup glyph');
  slots.forEach((x, i) => {
    const disc = discs.find(d => Math.abs(d.x - x) < 1e-9 && Math.abs(d.y - 513) < 1e-9), glyph = glyphs.find(g => Math.abs(g.x - x) < 1e-9 && Math.abs(g.y - 513) < 1e-9);
    assert(disc && glyph, `slot ${i + 1} has its disc and glyph`);
    assert(Math.abs(glyph.height * glyph.s - 8.5) < 1e-9, `the slot ${i + 1} glyph is 8.5 board px tall (${glyph.height * glyph.s})`);
  });
  // Each disc shows the color the slot's seed grows into: draw a board where every seed is one color, per color.
  const tint = {}, ink = {};
  for (const type of types) {
    const one = trace(); Art.draw(one.ctx, board(true, { nextType: type, typeAhead: () => type }), 1, { reducedMotion: true, backdrop: false, showAim: false });
    const found = glyphsIn(one.ops); assert.equal(new Set(found.discs.map(d => d.color)).size, 1); tint[type] = found.discs[0].color; ink[type] = found.glyphs[0].ink;
  }
  assert.equal(new Set(Object.values(tint)).size, 5, 'five distinct tints'); assert.equal(new Set(Object.values(ink)).size, 5, 'five distinct inks');
  slots.forEach((x, i) => assert.equal(discs.find(d => Math.abs(d.x - x) < 1e-9).color, tint[state.typeAhead(i + 1)], `slot ${i + 1} is tinted for typeAhead(${i + 1})`));
  const cup = glyphs.find(g => Math.abs(g.x - 210) < 1e-9 && Math.abs(g.y - 498) < 1e-9);
  assert(cup, 'the cup glyph sits on the launcher'); assert.equal(cup.ink, ink[state.nextType], 'in the launcher seed\'s color');
  assert(Math.abs(cup.height * cup.s - 9) < 1e-9, `the cup glyph is 9 board px tall (${cup.height * cup.s})`);
  // Disc under the seed, glyph over it: each slot's disc is painted before its glyph.
  for (const x of slots) assert(rec.ops.findIndex(op => op.name === 'arc' && op.args[2] === 10 && Math.abs(op.m.x - x) < 1e-9) < glyphs.find(g => Math.abs(g.x - x) < 1e-9).order);
});
test('Every glyph shape spans exactly 8.5 px top to bottom, and an empty slot or a Level 1-3 board shows none', () => {
  const Art = node();
  for (const type of types) {
    const rec = trace(); Art.draw(rec.ctx, board(true, { nextType: type, typeAhead: () => type }), 1, { reducedMotion: true, backdrop: false, showAim: false });
    const { glyphs } = glyphsIn(rec.ops);
    for (const g of glyphs.filter(g => g.y === 513)) assert(Math.abs(g.height - 8.5) < 1e-9, `${type} spans ${g.height}`);
  }
  for (const state of [board(false), board(true, { pod: 1 }), board(false, { pod: 1 })]) {
    const rec = trace(); Art.draw(rec.ctx, state, 1, { reducedMotion: true, backdrop: false, showAim: false });
    const { discs, glyphs } = glyphsIn(rec.ops), want = state.colorAhead ? 1 : 0;
    assert.equal(discs.length, 0, 'no disc without a full slot or before Level 4'); assert.equal(glyphs.length, want, 'only the cup glyph, from Level 4');
  }
});
test('The glyphs, discs and tray body are cached: a second frame makes no new surface or gradient', () => {
  const { Art, brush, totals } = rig(), state = board(true);
  Art.draw(brush().ctx, state, 1, { reducedMotion: false, backdrop: false, showAim: false });
  for (const type of types) { assert(Art.glyphSprite(type), `${type} glyph sprite`); assert(Art.glyphDisc(type), `${type} disc sprite`); }
  const before = { ...totals };
  for (let frame = 2; frame < 30; frame++) Art.draw(brush().ctx, { ...state, shotNumber: frame, nextType: types[frame % 5], typeAhead: k => types[(frame + k) % 5] }, 1 + frame / 60, { reducedMotion: false, backdrop: false, showAim: false });
  assert.deepEqual(totals, before, 'no new surfaces or gradients after the first frame');
  assert.equal(Art.GLYPH.size, 8.5); assert.equal(Art.GLYPH.disc, 10); assert.equal(Art.GLYPH.launcher, 9);
});
const report = { passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'seed-art-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
