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

test('The catalog has one free, one earned, three collection and three grown styles, each fully described', () => {
  assert.deepEqual(Keepsakes.styles.map(s => s.id), ['meadow', 'moonlit', 'sakura', 'firefly', 'gilded', 'dewdrop', 'bramble', 'maple']);
  assert.deepEqual(Keepsakes.styles.map(s => s.source), ['free', 'earned', 'collection', 'collection', 'collection', 'grown', 'grown', 'grown']);
  assert.deepEqual(Keepsakes.collection, ['sakura', 'firefly', 'gilded']);
  assert.deepEqual(Keepsakes.grown, ['dewdrop', 'bramble', 'maple']);
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
  const allowed = new Set(['id', 'name', 'source', 'requirement', 'cost', 'blurb', 'seed', 'trail', 'burst']);
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
  const kinds = { moonlit: 'star', sakura: 'blossom', firefly: 'firefly', gilded: 'flake', dewdrop: 'splash', bramble: 'berry', maple: 'maple' };
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
const Garden = require('../garden.js');
test('The three grown styles cost 150, 250 and 400 earned seeds, matching the garden, and the paid collection is untouched', () => {
  const grown = Keepsakes.styles.filter(s => s.source === 'grown');
  assert.deepEqual(grown.map(s => [s.id, s.cost]), [['dewdrop', 150], ['bramble', 250], ['maple', 400]]);
  assert.deepEqual(Garden.seedStyles.map(s => [s.id, s.cost]), grown.map(s => [s.id, s.cost]), 'garden.js spends what the Collection shows');
  for (const style of Keepsakes.styles) if (style.source !== 'grown') assert.equal(style.cost, undefined, `${style.id} has no seed price`);
  assert.equal(Keepsakes.product, 'bloomshot.style.collection1'); assert.equal(Keepsakes.entitlement, 'style_collection1');
  const product = storeProducts.find(item => item.id === Keepsakes.product);
  assert(!JSON.stringify(product).match(/dewdrop|bramble|maple/), 'the paid product lists none of the grown styles');
  for (const item of storeProducts) for (const id of Keepsakes.grown) assert(!JSON.stringify(item).includes(id), `${item.id} never sells ${id}`);
});
test('Grown styles are new looks, not recolors: each has its own seed shape, trail kind and bloom kind', () => {
  const others = Keepsakes.styles.filter(s => s.seed && s.source !== 'grown'), grown = Keepsakes.styles.filter(s => s.source === 'grown');
  const used = { trail: new Set(others.map(s => s.trail.kind)), burst: new Set(others.map(s => s.burst.kind)) };
  const shapes = new Set();
  for (const style of grown) {
    assert(['dew', 'berry', 'samara'].includes(style.seed.shape), `${style.id} has a drawn body`); shapes.add(style.seed.shape);
    assert(!used.trail.has(style.trail.kind), `${style.id} trail ${style.trail.kind} is new`); used.trail.add(style.trail.kind);
    assert(!used.burst.has(style.burst.kind), `${style.id} burst ${style.burst.kind} is new`); used.burst.add(style.burst.kind);
    for (const other of others) assert.notEqual(style.seed.base, other.seed.base);
    assert(/seed/i.test(style.blurb) && style.blurb.length <= 90, `${style.id} blurb is short`);
  }
  assert.equal(shapes.size, 3);
});
test('A grown style opens only once its seeds are spent: never with the paid collection, the Moon or a stray list', () => {
  const base = { moon: cleared(6), moonLevels: Moon.levels, owns: owns([Keepsakes.entitlement]) };
  for (const id of Keepsakes.grown) {
    assert.equal(Keepsakes.unlocked(id, base), false, `${id} is not part of the paid collection or the Moon`);
    assert.equal(Keepsakes.unlocked(id, { ...base, owns: () => true }), false);
    for (const grown of [undefined, null, 'dewdrop,bramble,maple', { dewdrop: true }, []]) assert.equal(Keepsakes.unlocked(id, { ...base, grown }), false);
    assert.equal(Keepsakes.unlocked(id, { grown: [id] }), true);
    assert.equal(Keepsakes.resolve(id, { grown: [] }).id, 'meadow', 'a chosen but ungrown style shows Meadow');
    assert.equal(Keepsakes.resolve(id, { grown: [id] }).id, id);
  }
  assert.equal(Keepsakes.unlocked('dewdrop', { grown: ['bramble'] }), false);
  for (const id of Keepsakes.collection) assert.equal(Keepsakes.unlocked(id, { grown: Keepsakes.grown.concat(id), owns: owns([]) }), false, `growing never opens ${id}`);
  assert.equal(Keepsakes.unlocked('moonlit', { grown: ['moonlit'], moon: {}, moonLevels: Moon.levels }), false);
});
test('Grown blooms: Dewdrop splashes with one ripple, Bramble Berry hops berries and leaves, Autumn Maple flutters leaves down', () => {
  let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const splash = Keepsakes.burstExtras(Keepsakes.byId.dewdrop, 50, 60, 40, random);
  assert.equal(splash.filter(p => p.ripple).length, 1); assert(splash[0].ripple && splash[0].vx === 0 && splash[0].gravity === 0);
  assert(splash.slice(1).every(p => !p.ripple && p.gravity >= 200 && p.life <= 1.1), 'drops fall fast and short');
  const berries = Keepsakes.burstExtras(Keepsakes.byId.bramble, 50, 60, 40, random);
  assert.equal(berries.filter(p => p.leaf).length, Math.floor(berries.length / 3));
  assert(berries.filter(p => !p.leaf).every(p => p.gravity > 150 && !p.flutter), 'berries drop and bounce');
  assert(berries.filter(p => p.leaf).every(p => p.flutter > 0 && p.color === Keepsakes.byId.bramble.burst.colors[3]));
  const leaves = Keepsakes.burstExtras(Keepsakes.byId.maple, 50, 60, 40, random);
  assert(leaves.every(p => p.flutter >= 18 && p.gravity < 60 && p.life >= 1.3), 'maple leaves sway down slowly');
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
