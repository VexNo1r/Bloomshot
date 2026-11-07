'use strict';
// Boss flower tells must describe real, current targets and never hide a live collider.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8');
const kinds = ['sunny', 'root', 'puff', 'crystal', 'lotus', 'fossil', 'ember', 'geode', 'briar', 'core'], results = [];
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
function rig() {
  const totals = { surfaces: 0, gradients: 0, bytes: 0 }, surfaces = [];
  function brush() {
    const calls = [], stack = [], state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0 };
    const ctx = new Proxy(state, {
      get(target, name) {
        if (name in target) return target[name];
        return (...args) => {
          for (const value of args) if (typeof value === 'number') assert(Number.isFinite(value), `${String(name)} receives finite coordinates`);
          calls.push({ name, args, alpha: state.globalAlpha, stroke: state.strokeStyle, fill: state.fillStyle });
          if (name === 'save') stack.push({ ...state });
          if (name === 'restore') { assert(stack.length, 'save/restore balances'); Object.assign(state, stack.pop()); }
          if (name === 'measureText') return { width: String(args[0]).length * 7 };
          if (name === 'createLinearGradient' || name === 'createRadialGradient') { totals.gradients++; return { addColorStop() {} }; }
        };
      },
      set(target, name, value) { if (typeof value === 'number') assert(Number.isFinite(value)); target[name] = value; return true; }
    });
    return { ctx, calls, balanced: () => !stack.length && state.globalAlpha === 1 };
  }
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; this.rec = brush(); totals.surfaces++; totals.bytes += width * height * 4; surfaces.push(this); }
    getContext() { return this.rec.ctx; }
  }
  const scope = vm.createContext({ Math, Map, Set, WeakMap, console, OffscreenCanvas: Canvas });
  const hooked = source.replace('root.BloomArt = { draw,', 'root.BloomArt = { flowerReview: { bossFlowerEffect, drawBossFlowerWarning, drawVeiledFlower, drawBossFlowerAccent, drawIgnitedBud, drawBossWarning }, draw,');
  vm.runInContext(hooked, scope, { filename: 'art.js' });
  return { Art: scope.BloomArt, review: scope.BloomArt.flowerReview, brush, totals, surfaces };
}
const flower = (kind = 'sunny') => ({ id: 'flower-a', x: 128, y: 183, r: 13, type: 'coral', hp: 1, maxHp: 1, bossFlowerEffect: { kind, at: 3, until: 8, opacity: .4 } });
const board = bud => ({ mode: 'rush', status: 'playing', buds: [bud], balls: [], particles: [], floaters: [], aim: [], pending: [], bumpers: [], lives: 3, launcher: { x: 210, y: 498 }, dangerY: 448, bossState: { kind: bud.bossFlowerEffect.kind, age: 4 } });
const tell = (kind, bud) => ({ kind, at: 3, until: 4.3, targets: [{ id: bud.id, x: 20, y: 30, r: 90 }] });
const signature = calls => JSON.stringify(calls, (key, value) => value && typeof value.getContext === 'function' ? { canvas: [value.width, value.height] } : typeof value === 'function' ? undefined : value);

test('Effect art follows game time and excludes spent, hidden and special pieces', () => {
  const { review } = rig();
  for (const kind of kinds) {
    const bud = flower(kind);
    assert(review.bossFlowerEffect(bud, 4)); assert.equal(review.bossFlowerEffect(bud, 2.99), null); assert.equal(review.bossFlowerEffect(bud, 8), null);
    for (const flag of ['bloomed', 'hidden', 'boss', 'bossPart', 'gift', 'puff', 'geode', 'gem']) assert.equal(review.bossFlowerEffect({ ...bud, [flag]: true }, 4), null, flag);
    assert.equal(review.bossFlowerEffect({ ...bud, visible: false }, 4), null);
  }
});

test('Warnings follow live target centers and radii rather than stale stored geometry', () => {
  const { review, brush } = rig(), bud = flower(), game = board(bud); game.bossState.flowerWarning = tell('sunny', bud);
  const rec = brush(); review.drawBossFlowerWarning(rec.ctx, game, 3.5, true);
  assert(rec.calls.some(call => call.name === 'arc' && call.args[0] === 128 && call.args[1] === 183 && call.args[2] === 18));
  assert(!rec.calls.some(call => call.name === 'arc' && call.args[0] === 20 && call.args[1] === 30));
  bud.x = 150; bud.y = 194; bud.r = 9.1;
  const moved = brush(); review.drawBossFlowerWarning(moved.ctx, game, 3.7, true);
  assert(moved.calls.some(call => call.name === 'arc' && call.args[0] === 150 && call.args[1] === 194 && call.args[2] === 14.1));
  const expired = brush(); review.drawBossFlowerWarning(expired.ctx, game, 4.3, false); assert.equal(expired.calls.length, 0);
  bud.bloomed = true; const spent = brush(); review.drawBossFlowerWarning(spent.ctx, game, 3.8, true); assert(!spent.calls.some(call => call.name === 'arc'));
  assert(rec.balanced() && moved.balanced());
});

test('Core copy footprints use the actual upcoming destination and do not invent flower bodies', () => {
  const { review, brush } = rig(), bud = flower('core'), game = board(bud);
  game.bossState.flowerWarning = { ...tell('core', bud), targets: [{ id: bud.id, echoX: 250, echoY: 220, echoR: 10 }] };
  const rec = brush(); review.drawBossFlowerWarning(rec.ctx, game, 3.4, true);
  assert(rec.calls.some(call => call.name === 'moveTo' && call.args[0] === 250 && call.args[1] === 210));
  assert(rec.calls.some(call => call.name === 'lineTo' && call.args[0] === 260 && call.args[1] === 220));
  assert(!rec.calls.some(call => call.name === 'fill' && call.args.length === 0), 'the destination is an outlined star, not a simulated bud');
  assert(rec.balanced());
});

test('Generic boss warnings leave marked flower effects to their single live-target renderer', () => {
  const { review, brush } = rig(), bud = flower('ember'), game = board(bud);
  game.bossWarning = { kind: 'ember', x: 210, y: 80, at: 3, until: 4.3, text: 'Watch the flowers', targets: [{ id: bud.id, x: bud.x, y: bud.y, r: bud.r, role: 'flame', effect: 'ember' }] };
  game.bossState.flowerWarning = tell('ember', bud);
  const generic = brush(); review.drawBossWarning(generic.ctx, game, 3.4, false);
  assert(!generic.calls.some(call => call.name === 'arc' && call.args[0] === bud.x && call.args[1] === bud.y), 'no duplicate flame/flower footprint');
  const specific = brush(); review.drawBossFlowerWarning(specific.ctx, game, 3.4, false);
  assert(specific.calls.some(call => call.name === 'arc' && call.args[0] === bud.x && call.args[1] === bud.y));
});

test('Warning progress holds when Lullaby extends a deadline without moving its target', () => {
  const { review, brush } = rig(), bud = flower('root'), game = board(bud);
  game.bossState.flowerWarning = tell('root', bud);
  const first = brush(); review.drawBossFlowerWarning(first.ctx, game, 3.5, false);
  game.bossState.flowerWarning.until += 6;
  const held = brush(); review.drawBossFlowerWarning(held.ctx, game, 9.5, false);
  const arc = rec => rec.calls.find(call => call.name === 'arc' && call.args[2] === 21);
  assert(Math.abs(arc(first).args[4] - arc(held).args[4]) < 1e-9, 'the countdown does not creep during a frozen attack');
});

test('Morel dims the body while preserving a fully opaque original silhouette and hit boundary', () => {
  const { review, brush } = rig(), bud = flower('puff'), rec = brush();
  review.drawVeiledFlower(rec.ctx, bud, bud.r, 4, bud.bossFlowerEffect);
  assert(rec.calls.some(call => call.name === 'drawImage' && call.alpha === .4), 'only the body sprite is veiled');
  assert(rec.calls.filter(call => call.name === 'stroke' && call.alpha === 1).length >= 3, 'shape outline and circular boundary are solid');
  assert(rec.calls.some(call => call.name === 'arc' && call.args[2] === 15.4 && call.alpha === 1));
  assert(rec.balanced());
});

test('All ten modifiers draw without altering physics; expired tags add no active artwork', () => {
  const { Art, brush } = rig();
  for (const kind of kinds) {
    const bud = flower(kind); if (kind === 'sunny') bud.r = 16.25; if (kind === 'root') bud.r = 9.1;
    if (kind === 'fossil') { bud.shell = true; bud.shellAngle = .7; }
    if (kind === 'geode') { bud.hp = 2; bud.maxHp = 2; }
    if (kind === 'briar') { bud.briar = true; bud.regrowSpan = 4; }
    if (kind === 'core') bud.bossEcho = true;
    const game = board(bud), before = JSON.stringify(game);
    for (const reducedMotion of [false, true]) { const rec = brush(); Art.draw(rec.ctx, game, 4, { backdrop: false, theme: 'depth-core', reducedMotion, showAim: false }); assert(rec.balanced(), kind); }
    assert.equal(JSON.stringify(game), before, kind + ' physical state');
    const expired = brush(); Art.draw(expired.ctx, game, 9, { backdrop: false, theme: 'depth-core', reducedMotion: true, showAim: false });
    delete bud.bossFlowerEffect;
    const ordinary = brush(); Art.draw(ordinary.ctx, game, 9, { backdrop: false, theme: 'depth-core', reducedMotion: true, showAim: false });
    assert.equal(signature(expired.calls), signature(ordinary.calls), kind + ' expired visuals');
  }
});

test('Ten cached marks are bounded and reduced-motion warnings remain static across the tell', () => {
  const { review, brush, totals } = rig();
  for (const kind of kinds) { const bud = flower(kind), game = board(bud); game.bossState.flowerWarning = tell(kind, bud); review.drawBossFlowerWarning(brush().ctx, game, 3.1, true); }
  const warm = { ...totals }; assert.equal(warm.surfaces, 10); assert(warm.bytes < 210000);
  for (const kind of kinds) {
    const bud = flower(kind), game = board(bud); game.bossState.flowerWarning = tell(kind, bud);
    const a = brush(), b = brush(); review.drawBossFlowerWarning(a.ctx, game, 3.1, true); review.drawBossFlowerWarning(b.ctx, game, 4.2, true); assert.deepEqual(a.calls, b.calls, kind + ' static tell');
    for (let frame = 0; frame < 120; frame++) review.drawBossFlowerWarning(brush().ctx, game, 3.1 + frame / 200, false);
  }
  assert.deepEqual(totals, warm, 'warmed marks allocate no new surfaces or gradients');
});

const report = { passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, results };
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
