'use strict';
// Powerups: the catalog matches the store ids, counts never go wrong (a purchase counts once, even when the
// store hands it over again), each powerup does what its card says, and gift bubbles stay rare, optional and
// harmless. Run: node qa/test-powers.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Powers = require('../powers.js');
const { RushGame, SUN_REACH, LULLABY, GIFT_CHANCE } = require('../rush.js');
const bot = require('./depths-bot.cjs');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
const advance = (game, seconds, fps = 120) => { for (let i = 0; i < Math.round(seconds * fps); i++) game.step(1 / fps); };
const types = events => events.map(e => e.type);
function started(id = 1, wave = 1, options = {}) {
  const game = new RushGame({ plan: bot.plan(id), ...options });
  game.started = true; game.status = 'flying';
  if (wave > 1) { game.wave = wave - 1; game._loadWave(); }
  return game;
}
function bud(id, x, y, extra = {}) {
  return { id, group: extra.group || id, x, y, r: 11, type: 'gold', relay: false, hp: 1, maxHp: 1, hitAt: -100, bloomed: false, bloomAt: -100, ...extra };
}
// A still board: nothing falls, so a shot meets the flowers where they were put.
function still(game, buds) { game.buds = buds; game.descentSpeed = 0; game.bumpers = []; game.currents = []; game.gates = []; game.drops = []; game.drainEvents(); return game; }

test('Browser and CommonJS builds expose the same catalog', () => {
  const context = { globalThis: {} }; context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../powers.js'), 'utf8'), context);
  assert.deepEqual([...context.BloomPowers.ids], [...Powers.ids]);
});
test('Four powerups, each its own store product with short, plain copy', () => {
  assert.deepEqual(Powers.ids, ['sunburst', 'dandelion', 'beeline', 'lullaby']);
  for (const p of Powers.list) {
    assert.equal(p.product, `bloomshot.power.${p.id}`);
    assert.equal(Powers.byProduct[p.product], p);
    assert(p.text.length <= 60 && p.tip.length <= 52, `${p.id} copy fits`);
    assert(!/[A-Z]{3}/.test(p.text + p.tip), 'no shouting');
  }
  assert.deepEqual(Powers.list.filter(p => p.shot).map(p => p.id), ['sunburst', 'dandelion', 'beeline']);
});
test('A save from before powerups starts with one of each; counts are whole and capped', () => {
  assert.deepEqual(Powers.normalize(undefined), { sunburst: 1, dandelion: 1, beeline: 1, lullaby: 1 });
  assert.deepEqual(Powers.normalize([]), { sunburst: 1, dandelion: 1, beeline: 1, lullaby: 1 });
  assert.deepEqual(Powers.normalize({ sunburst: 4.7, dandelion: -2, beeline: 'x', lullaby: 5000 }), { sunburst: 4, dandelion: 0, beeline: 0, lullaby: 999 });
  assert.deepEqual(Powers.normalize({}), { sunburst: 0, dandelion: 0, beeline: 0, lullaby: 0 }, 'an emptied bag stays empty');
});
test('A purchase counts once, even when the store hands the same one over again', () => {
  let counts = Powers.normalize({ sunburst: 0 }), receipts = [];
  const first = Powers.grant(counts, receipts, { power: 'sunburst', count: 1, transaction: 'GPA.1' });
  assert(first.ok && !first.repeat); assert.equal(first.counts.sunburst, 1); assert.deepEqual(first.receipts, ['GPA.1']);
  const again = Powers.grant(first.counts, first.receipts, { power: 'sunburst', count: 1, transaction: 'GPA.1' });
  assert(again.ok && again.repeat); assert.equal(again.counts.sunburst, 1, 'a replayed purchase adds nothing');
  assert.equal(Powers.grant(counts, receipts, { power: 'rocket', transaction: 'GPA.2' }).ok, false);
  for (let i = 0; i < 70; i++) ({ counts, receipts } = Powers.grant(counts, receipts, { power: 'lullaby', transaction: `T${i}` }));
  assert.equal(counts.lullaby, 70); assert.equal(receipts.length, 50, 'only the latest receipts are kept');
  assert.equal(Powers.spend({ dandelion: 1 }, 'dandelion').counts.dandelion, 0);
  assert.equal(Powers.spend({ dandelion: 0 }, 'dandelion').ok, false);
});
test('Packs hold fixed, stated contents: five of one kind, or the bag with three of each', () => {
  assert.deepEqual(Powers.packs.map(p => p.product), ['bloomshot.power.sunburst5', 'bloomshot.power.dandelion5', 'bloomshot.power.beeline5', 'bloomshot.power.lullaby5', 'bloomshot.power.bag1']);
  for (const p of Powers.list) assert.deepEqual(Powers.contents(`${p.product}5`), { [p.id]: 5 });
  assert.deepEqual(Powers.contents('bloomshot.power.bag1'), { sunburst: 3, dandelion: 3, beeline: 3, lullaby: 3 });
  assert.deepEqual(Powers.contents('bloomshot.power.lullaby'), { lullaby: 1 });
  assert.equal(Powers.contents('bloomshot.levels.full'), null, 'an unlock is not a powerup');
  const bag = Powers.contents('bloomshot.power.bag1'); bag.sunburst = 99;
  assert.equal(Powers.contents('bloomshot.power.bag1').sunburst, 3, 'handing out contents never changes the pack');
});
test('A bag arrives all at once under one receipt, counts once, and a bad set adds nothing', () => {
  const start = Powers.normalize({ sunburst: 2, dandelion: 0, beeline: 1, lullaby: 0 });
  const bag = Powers.grant(start, [], { powers: Powers.contents('bloomshot.power.bag1'), transaction: 'GPA.9' });
  assert(bag.ok && !bag.repeat); assert.deepEqual(bag.counts, { sunburst: 5, dandelion: 3, beeline: 4, lullaby: 3 }); assert.deepEqual(bag.receipts, ['GPA.9']);
  const again = Powers.grant(bag.counts, bag.receipts, { powers: Powers.contents('bloomshot.power.bag1'), transaction: 'GPA.9' });
  assert(again.repeat); assert.deepEqual(again.counts, bag.counts);
  for (const bad of [{ rocket: 3 }, { sunburst: 3, rocket: 1 }, { sunburst: 0 }, { sunburst: 'x' }, {}]) {
    const result = Powers.grant(start, [], { powers: bad, transaction: 'GPA.10' });
    assert.equal(result.ok, false, JSON.stringify(bad)); assert.deepEqual(result.counts, start); assert.deepEqual(result.receipts, []);
  }
  assert.equal(Powers.grant(start, [], { power: 'sunburst', count: 5, transaction: 'GPA.11' }).counts.sunburst, 7, 'a five-pack names its powerup and count');
  assert.equal(Powers.grant({ beeline: 998 }, [], { powers: { beeline: 3 } }).counts.beeline, 999, 'still capped');
});
test('A shot powerup waits for the next shot, and picking it again puts it back', () => {
  const game = started(1, 1);
  assert.equal(game.arm('sunburst'), true); assert.equal(game.armed, 'sunburst');
  assert.equal(game.arm('sunburst'), true); assert.equal(game.armed, null, 'picked again, it goes back unspent');
  assert.equal(game.arm('lullaby'), false, 'Lullaby is not a shot');
  game.arm('beeline'); game.drainEvents();
  assert.equal(game.fire(0, -1), true);
  const events = game.drainEvents();
  assert.deepEqual(events.filter(e => e.type === 'power').map(e => e.power), ['beeline']);
  assert.equal(game.armed, null); assert.equal(game.balls[0].power, 'beeline'); assert.equal(game.powersUsed, 1);
  game._lose(); assert.equal(game.arm('sunburst'), false, 'nothing arms after the run');
});
test('Sunburst blooms everything within reach of its first touch, even cupped and shelled flowers', () => {
  const game = still(started(1, 1), [bud('a', 210, 200), bud('b', 250, 210, { shield: true, hp: 2, maxHp: 2 }), bud('c', 170, 180, { shell: true, shellAngle: -Math.PI / 2, shellSpin: 0 }),
    bud('far', 210, 200 - SUN_REACH - 40)]);
  game.arm('sunburst'); game.fire(0, -1); game.drainEvents();
  advance(game, 1);
  const events = game.drainEvents();
  assert(types(events).includes('sunburst'));
  assert.deepEqual(game.buds.filter(b => b.bloomed).map(b => b.id).sort(), ['a', 'b', 'c']);
  assert.equal(game.buds.find(b => b.id === 'far').bloomed, false, 'a flower out of reach stays');
  assert.equal(game.balls.length, 0, 'the sunburst is used up');
});
test('Sunburst takes four rings off a big bloom rather than blooming it outright', () => {
  const boss = bud('boss', 210, 200, { boss: true, hp: 13, maxHp: 13, r: 26 });
  const game = still(started(1, 10), [boss]);
  game.arm('sunburst'); game.fire(0, -1); advance(game, 1);
  assert.equal(boss.hp, 9); assert.equal(boss.bloomed, false);
});
test('Dandelion fans three seeds, even with the air already full', () => {
  const game = still(started(1, 1), [bud('a', 60, 60)]);
  for (let i = 0; i < 4; i++) game.spawnBall({ x: 210, y: 300, angle: -Math.PI / 2 });
  game.arm('dandelion'); game.drainEvents();
  assert.equal(game.fire(0, -1), true);
  const seeds = game.balls.slice(-3);
  assert.equal(game.balls.length, 7);
  const angles = seeds.map(b => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
  assert(Math.abs(angles[1] + Math.PI / 2) < 1e-9 && Math.abs(angles[2] - angles[1] - .2) < 1e-9 && Math.abs(angles[1] - angles[0] - .2) < 1e-9);
  assert.equal(game.drainEvents().find(e => e.type === 'launch').count, 3);
});
test('Bee Line flies straight through flowers, cups and shells, blooming each one', () => {
  const game = still(started(1, 1), [bud('low', 210, 330, { shield: true, hp: 3, maxHp: 3 }), bud('mid', 210, 250, { shell: true, shellAngle: Math.PI / 2 + Math.PI, shellSpin: 0 }), bud('high', 210, 160)]);
  game.arm('beeline'); game.fire(0, -1);
  advance(game, .9);
  assert(game.buds.every(b => b.bloomed), 'all three bloom');
  assert(game.balls[0] && game.balls[0].vy < 0, 'the bee is still flying up: flowers never turned it');
  const plain = still(started(1, 1), [bud('cup', 210, 330, { shield: true })]);
  plain.fire(0, -1); advance(plain, .5);
  assert.equal(plain.buds[0].bloomed, false, 'a plain seed still bounces off the cup');
});
test('Lullaby stops the falling for six seconds, then the flowers go on falling', () => {
  const game = started(2, 3), first = game.buds[0], y0 = first.y;
  assert.equal(new RushGame({ plan: bot.plan(1) }).lull(), false, 'not before the first shot');
  assert.equal(game.lull(), true); assert.equal(game.lull(), false, 'one at a time');
  assert(types(game.drainEvents()).includes('power'));
  advance(game, LULLABY - .1);
  assert.equal(first.y, y0, 'nothing fell');
  advance(game, .4);
  assert(first.y > y0, 'falling again');
  assert.equal(game.lullaby, 0);
});
test('Without the app’s chance source no gifts appear, so tests and the practice bot are unchanged', () => {
  const game = started(1, 1); advance(game, 20);
  assert(!game.buds.some(b => b.gift)); assert.equal(game.giftChance, 0);
  assert(GIFT_CHANCE > 0 && GIFT_CHANCE <= .1, 'gifts stay rare');
});
test('A gift floats in, a shot that catches it flies on, and the powerup is kept', () => {
  const game = still(started(1, 1, { random: () => 0 }), [bud('a', 60, 300)]);
  assert(game.giftAt >= 2 && game.giftAt <= 6, 'it comes a few seconds into the wave');
  advance(game, game.giftAt + .05);
  const gift = game.buds.find(b => b.gift);
  assert(gift); assert.equal(gift.gift, 'sunburst'); assert(types(game.drainEvents()).includes('giftAppear'));
  gift.sway = 0; gift.x = 210; game.descentSpeed = 0;
  game.fire(0, -1); advance(game, 1.2);
  const events = game.drainEvents();
  assert.deepEqual(events.filter(e => e.type === 'gift').map(e => e.power), ['sunburst']);
  assert(!game.buds.some(b => b.gift)); assert.equal(events.filter(e => e.type === 'bounce' && e.kind === 'bud').length, 0);
  assert.equal(game.giftsLeft, 0);
});
test('A missed gift floats away without costing a life, and never holds up the wave', () => {
  const game = still(started(1, 1, { random: () => 0 }), [bud('a', 60, -3000)]);
  advance(game, game.giftAt + .05); game.drainEvents();
  game.descentSpeed = 200; advance(game, 3);
  assert.equal(game.lives, 3, 'no life lost to the gift');
  assert(types(game.drainEvents()).includes('giftGone')); assert(!game.buds.some(b => b.gift));
  const fresh = still(started(1, 1, { random: () => 0 }), [bud('a', 60, 100)]);
  advance(fresh, fresh.giftAt + .05);
  fresh.strike(fresh.buds.find(b => b.id === 'a')); advance(fresh, .9);
  assert.equal(fresh.wave, 2, 'the wave clears with the gift still floating');
  assert(fresh.drainEvents().some(e => e.type === 'giftGone'));
});
test('At most one gift a run, and none in a big bloom wave', () => {
  const game = started(1, 1, { random: () => 0 });
  advance(game, game.giftAt + .05); assert.equal(game.buds.filter(b => b.gift).length, 1);
  game.wave = 1; game._loadWave(); assert.equal(game.giftAt, null, 'the run already had its gift');
  const boss = started(1, 9, { random: () => 0 }); boss._loadWave();
  assert.equal(boss.bossWave, true); assert.equal(boss.giftAt, null);
  const endless = new RushGame({ random: () => 0 });
  assert(endless.giftAt !== null, 'Meadow Rush gets gifts too');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
