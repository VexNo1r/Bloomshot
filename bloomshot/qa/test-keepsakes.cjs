'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Keepsakes = require('../keepsakes.js');
const Moon = require('../moon.js');
const Engine = require('../engine.js');
const Levels = require('../levels.js');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
// A 2D context that records calls and rejects any non-finite number, so a bad style value cannot slip through as NaN.
function recordingContext() {
  const calls = [];
  const gradient = { addColorStop: (offset, color) => { assert(Number.isFinite(offset)); assert.equal(typeof color, 'string'); } };
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, shadowColor: 'transparent', shadowOffsetX: 0, shadowOffsetY: 0, lineCap: 'butt', lineJoin: 'miter', font: '', textAlign: 'start', textBaseline: 'alphabetic', filter: 'none' };
  return { calls, ctx: new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'createLinearGradient' || name === 'createRadialGradient') return (...args) => { args.forEach(a => assert(Number.isFinite(a), `${name} got ${a}`)); calls.push(name); return gradient; };
      if (name === 'measureText') return () => ({ width: 10 });
      return (...args) => { for (const a of args) if (typeof a === 'number') assert(Number.isFinite(a), `${String(name)} got ${a}`); calls.push(name); };
    },
    set(target, name, value) { if (name === 'globalAlpha' || name === 'lineWidth' || name === 'shadowBlur') assert(Number.isFinite(value), `${name} = ${value}`); target[name] = value; return true; }
  }) };
}
const artContext = vm.createContext({ console, Math, Map, Set, Array, Object, Number, String, JSON });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8'), artContext, { filename: 'art.js' });
const Art = artContext.BloomArt;
const configContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../store-config.js'), 'utf8'), configContext, { filename: 'store-config.js' });
const storeProducts = configContext.BloomStoreConfig.products;
const cleared = count => Object.fromEntries(Moon.levels.slice(0, count).map(level => [level.id, { best: 500, stars: 1, attempts: 1 }]));
const owns = list => entitlement => list.includes(entitlement);
const hex = /^#[0-9a-f]{6}$/i;

test('The catalog has one free, one earned and three collection styles, each fully described', () => {
  assert.deepEqual(Keepsakes.styles.map(s => s.id), ['meadow', 'moonlit', 'sakura', 'firefly', 'gilded']);
  assert.deepEqual(Keepsakes.styles.map(s => s.source), ['free', 'earned', 'collection', 'collection', 'collection']);
  assert.deepEqual(Keepsakes.collection, ['sakura', 'firefly', 'gilded']);
  for (const style of Keepsakes.styles) {
    assert(style.name && style.blurb.length > 20, style.id);
    assert.equal(Keepsakes.byId[style.id], style);
    if (style.id === 'meadow') { assert.equal(style.seed, undefined); continue; }
    for (const key of ['base', 'light', 'core', 'rim']) assert.match(style.seed[key], hex, `${style.id} seed.${key}`);
    assert.match(style.trail.ribbon, hex); assert(style.trail.accents.length >= 2 && style.trail.accents.every(c => hex.test(c)));
    assert(style.burst.share > 0 && style.burst.share <= .5); assert(style.burst.colors.every(c => hex.test(c)));
  }
  assert.match(Keepsakes.byId.moonlit.requirement, /six Moon Garden trials/);
});
test('Styles are looks only: no style carries anything the physics engine reads', () => {
  const allowed = new Set(['id', 'name', 'source', 'requirement', 'blurb', 'seed', 'trail', 'burst']);
  for (const style of Keepsakes.styles) for (const key of Object.keys(style)) assert(allowed.has(key), `${style.id}.${key}`);
  const level = Levels.levels[2];
  const plain = new Engine.Game(level), styled = new Engine.Game(level);
  plain.fire(.3, -1); styled.fire(.3, -1);
  // The app passes a style only to drawing; two identical shots must stay identical step for step.
  for (let i = 0; i < 600; i++) { plain.step(1 / 120); styled.step(1 / 120); }
  assert.deepEqual(styled.snapshot(), plain.snapshot());
});
test('The purchase uses the product and entitlement the store catalog lists, and it is not on sale yet', () => {
  const product = storeProducts.find(item => item.id === Keepsakes.product);
  assert(product, 'store-config.js lists the collection product');
  assert.equal(product.entitlement, Keepsakes.entitlement); assert.equal(product.kind, 'style'); assert.equal(product.available, false);
});
test('Meadow is always open, Moonlit opens only when all six Moon trials have a star, the collection only with its entitlement', () => {
  const base = { moonLevels: Moon.levels, owns: owns([]) };
  assert.equal(Keepsakes.unlocked('meadow', {}), true); assert.equal(Keepsakes.unlocked('meadow', undefined), true);
  assert.equal(Keepsakes.unlocked('moonlit', { ...base, moon: cleared(5) }), false);
  assert.equal(Keepsakes.unlocked('moonlit', { ...base, moon: { ...cleared(6), [Moon.levels[5].id]: { best: 10, stars: 0, attempts: 4 } } }), false);
  assert.equal(Keepsakes.unlocked('moonlit', { ...base, moon: cleared(6) }), true);
  assert.equal(Keepsakes.unlocked('moonlit', { moon: cleared(6), moonLevels: [] }), false);
  for (const id of Keepsakes.collection) {
    assert.equal(Keepsakes.unlocked(id, { ...base, moon: cleared(6) }), false);
    assert.equal(Keepsakes.unlocked(id, { ...base, owns: owns(['world_koi']) }), false);
    assert.equal(Keepsakes.unlocked(id, { ...base, owns: owns([Keepsakes.entitlement]) }), true);
  }
  assert.equal(Keepsakes.unlocked('nope', { ...base, owns: () => true }), false);
});
test('A locked, unknown or refunded choice shows Meadow without being forgotten', () => {
  const none = { moon: {}, moonLevels: Moon.levels, owns: owns([]) };
  assert.equal(Keepsakes.resolve('sakura', none).id, 'meadow');
  assert.equal(Keepsakes.resolve('moonlit', none).id, 'meadow');
  assert.equal(Keepsakes.resolve('missing', none).id, 'meadow');
  assert.equal(Keepsakes.resolve('sakura', { ...none, owns: owns([Keepsakes.entitlement]) }).id, 'sakura');
});
test('Bloom extras scale with the burst, cap at 24 and carry each style\'s own particle', () => {
  let seed = 1; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  assert.deepEqual(Keepsakes.burstExtras(Keepsakes.byId.meadow, 0, 0, 40, random), []);
  const kinds = { moonlit: 'star', sakura: 'blossom', firefly: 'firefly', gilded: 'flake' };
  for (const [id, kind] of Object.entries(kinds)) {
    const style = Keepsakes.byId[id];
    const small = Keepsakes.burstExtras(style, 100, 200, 24, random), big = Keepsakes.burstExtras(style, 100, 200, 200, random);
    assert.equal(small.length, Math.round(24 * style.burst.share)); assert.equal(big.length, 24);
    for (const p of [...small, ...big]) {
      assert.equal(p.kind, kind); assert.equal(p.x, 100); assert.equal(p.y, 200);
      for (const key of ['vx', 'vy', 'life', 'maxLife', 'size', 'rotation', 'spin', 'drag', 'gravity', 'phase']) assert(Number.isFinite(p[key]), `${id}.${key}`);
      assert(p.life > 0 && p.life === p.maxLife); assert(style.burst.colors.includes(p.color));
    }
  }
  assert(Keepsakes.burstExtras(Keepsakes.byId.firefly, 0, 0, 40, random).every(p => p.gravity < 0), 'fireflies drift upward');
});
test('Every style draws its seed, flying seed with trail, and burst particles with finite values', () => {
  const trail = Array.from({ length: 18 }, (_, i) => ({ x: 60 + i * 9, y: 400 - i * 12 }));
  for (const style of Keepsakes.styles) {
    const look = style.seed ? style : null;
    for (const hot of [false, true]) for (const reduced of [false, true]) {
      const { ctx, calls } = recordingContext();
      Art.drawSeed(ctx, 210, 498, 8.4, 1.3, false, look);
      Art.drawProjectile(ctx, { x: 220, y: 190, r: 5.5, type: 'gold', hot, trail }, 1, 2.7, reduced, hot, look);
      assert(calls.length > 10, `${style.id} drew`);
    }
    const { ctx } = recordingContext();
    for (const p of Keepsakes.burstExtras(style, 200, 200, 48)) for (const life of [p.maxLife, p.maxLife / 2, .01]) Art.drawParticle(ctx, { ...p, life }, 3.1, false);
  }
});
test('A full board draws with every style worn, in each theme', () => {
  const level = Levels.levels[0];
  for (const theme of ['meadow', 'moon', 'koi']) for (const style of Keepsakes.styles) {
    const game = new Engine.Game(level); game.particles = Keepsakes.burstExtras(style, 210, 280, 40); game.floaters = [];
    game.fire(.2, -1); for (let i = 0; i < 40; i++) game.step(1 / 120);
    const { ctx, calls } = recordingContext();
    Art.draw(ctx, game, game.time, { theme, reducedMotion: false, keepsake: style.seed ? style : null, showAim: false });
    assert(calls.length > 100, `${theme}/${style.id}`);
  }
});
const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  methodology: 'Loads keepsakes.js, art.js and store-config.js in Node. Checks catalog rules, unlock logic, purchase ids against the store catalog, physics independence and that every style draws with finite canvas values.',
  limitations: ['A recording canvas checks that drawing runs with valid numbers, not how it looks; screenshots cover appearance.'], results };
fs.writeFileSync(path.join(__dirname, 'keepsakes-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
