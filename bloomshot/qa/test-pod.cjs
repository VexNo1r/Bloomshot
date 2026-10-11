'use strict';
// The seed pod: four seeds in the launcher, half a seed back for every flower a seed hits or sets off, empty slots
// regrowing slowly, a tap a blink early kept, and mashing that no longer pays. Run: node qa/test-pod.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RushGame, POD, POD_GAP, POD_REGROW, REFUND, KEEP, SUPER_DELAY, fireDelayFor } = require('../rush.js');
const Depths = require('../depths.js');
const bot = require('./depths-bot.cjs');
const results = [], observations = {}, startedAt = Date.now();
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) game.step(1 / 120); };
const bud = (id, x, y, extra) => ({ id, group: id, x, y, baseX: x, startY: y, r: 11, type: 'gold', relay: false, hp: 1, maxHp: 1, fall: 1, sway: 0, swayW: 0, swayPhase: 0, hitAt: -100, bloomed: false, bloomAt: -100, ...extra });
const still = (buds, options) => { const game = new RushGame(options); game.buds = buds; game.descentSpeed = 0; game.drops = []; return game; };
const launches = game => game.events.filter(e => e.type === 'launch').length;

test('Constants', () => {
  assert.equal(POD, 4); assert.equal(POD_GAP, .15); assert.equal(POD_REGROW, 6); assert.equal(REFUND, .5); assert.equal(KEEP, .15);
});
test('A full pod fires a burst of four, never closer than the gap, then a tap on the empty pod is dropped and says so', () => {
  const game = still([bud('far', 30, 60)]);
  assert.equal(game.pod, POD); assert.equal(game.canFire, true); assert.equal(game.fireCooldown, 0);
  for (let i = 0; i < 120; i++) { game.fire(0, -1); game.step(1 / 120); }
  const times = game.events.filter(e => e.type === 'launch').map(e => e.time);
  assert.equal(times.length, POD, 'mashing every frame for a second fires the pod and nothing more');
  for (let i = 1; i < times.length; i++) assert(times[i] - times[i - 1] >= POD_GAP - 1e-9);
  assert.equal(game.pod, 0); assert.equal(game.canFire, false);
  game.drainEvents();
  assert.equal(game.fire(0, -1), false, 'an empty pod drops the tap');
  const dry = game.drainEvents().filter(e => e.type === 'dry');
  assert.equal(dry.length, 1); assert(dry[0].wait > 2, 'the dropped tap says how long until the next seed');
  assert(Math.abs(game.fireCooldown - dry[0].wait) < 1e-9);
});
test('An empty slot regrows in six times the wave reload, one at a time (levels and endless)', () => {
  const game = still([bud('far', 30, 60)]);
  game.fire(0, -1); game.balls = [];
  assert(Math.abs(game.regrowTime - POD_REGROW * fireDelayFor(1)) < 1e-9); assert(Math.abs(game.regrowTime - 3.9) < 1e-9);
  advance(game, game.regrowTime - .05); assert.equal(game.pod, POD - 1);
  advance(game, .1); assert.equal(game.pod, POD);
  assert(game.drainEvents().some(e => e.type === 'podSeed' && e.pod === POD));
  const level = new RushGame({ plan: bot.plan(1) });
  assert(Math.abs(level.regrowTime - 6 * Depths.wave(1, 1).fireDelay) < 1e-9);
  assert(Math.abs(level.regrowTime - 3.432) < 1e-9, 'level 1 wave 1: 3.43 s a seed');
  const deep = new RushGame({ plan: bot.plan(10) });
  assert(Math.abs(deep.regrowTime - 2.52) < 1e-9, 'level 10: 2.52 s a seed');
});
test('A seed that touches a flower gives back half a seed; a miss gives nothing', () => {
  const game = still([bud('a', 210, 300), bud('b', 30, 60)]);
  game.fire(0, -1); advance(game, POD_GAP); game.fire(-1, -.3); game.drainEvents();
  const grow = game.podGrow; advance(game, .5);
  assert(game.buds[0].bloomed, 'the first seed bloomed the flower in its path');
  const refunds = game.drainEvents().filter(e => e.type === 'podRefund');
  assert.equal(refunds.length, 1, 'only the seed that touched a flower fed the pod');
  assert.equal(refunds[0].x, 210); assert.equal(refunds[0].y, 300);
  assert(Math.abs(game.podGrow - grow - REFUND - .5 / game.regrowTime) < .02);
});
test('A crown feeds the pod for itself and each flower it opens; a crack counts; a cup or shell deflection does not', () => {
  const game = new RushGame();
  game.buds = [bud('c0', 210, 300, { group: 'c', relay: true }), bud('c1', 190, 270, { group: 'c' }), bud('c2', 230, 270, { group: 'c' }), bud('arm', 60, 300, { hp: 2, maxHp: 2 })];
  game.descentSpeed = 0; game.started = true; game.status = 'flying'; game.pod = 0; game.podGrow = 0;
  game.striker = { id: 1, touches: 0 }; game.strike(game.buds[0]); game.striker = null;
  assert.equal(game.podGrow, REFUND);
  advance(game, .4);
  assert.equal(game.pod, 1, 'crown plus its two flowers: one and a half seeds');
  game.striker = { id: 2, touches: 0 }; game.strike(game.buds[3]); game.striker = null;
  assert.equal(game.buds[3].bloomed, false); assert.equal(game.pod, 2, 'the crack on an armored bud fed the pod too');
  const cup = still([bud('cup', 210, 300, { shield: true })]); cup.fire(0, -1); cup.drainEvents(); advance(cup, .6);
  const events = cup.drainEvents();
  assert(events.some(e => e.type === 'shield')); assert(!events.some(e => e.type === 'podRefund'), 'a seed turned away by a cup feeds nothing');
});
test('A full pod takes nothing more, and a strike no seed earned (a test, the script) feeds nothing', () => {
  const game = still([bud('a', 210, 300)]); game.started = true; game.status = 'flying';
  game.strike(game.buds[0]); assert.equal(game.pod, POD); assert.equal(game.podGrow, 0);
  assert(!game.drainEvents().some(e => e.type === 'podRefund'));
});
test('A tap a blink early is kept and fires the moment the seed is ready, with the latest aim', () => {
  const game = still([bud('far', 30, 60)]);
  assert(game.fire(0, -1)); assert.equal(launches(game), 1);
  assert.equal(game.fire(-1, -1), true, 'a quick double tap is kept'); assert.equal(launches(game), 1);
  game.fire(1, -1); advance(game, POD_GAP + 1 / 60);
  assert.equal(launches(game), 2); const ball = game.balls.at(-1);
  assert(ball.vx > 0, 'the latest aim wins'); assert.equal(game.events.filter(e => e.type === 'kept').length, 1);
  // Empty the pod, then tap .1 s before the next seed regrows: it fires when the seed arrives.
  game.fireCooldown = 0; game.pod = 1; game.fire(0, -1); game.balls = []; advance(game, game.regrowTime - .1);
  assert.equal(game.pod, 0); assert(game.fireCooldown <= KEEP + 1e-9);
  const before = launches(game); assert.equal(game.fire(0, -1), true); advance(game, .12);
  assert.equal(launches(game), before + 1, 'kept through the regrow');
  // A tap well before the seed is ready is dropped, not kept.
  advance(game, POD_GAP); game.fire(0, -1); game.fire(0, -1); game.fire(0, -1); game.balls = [];
  assert.equal(game.pod, 0); const n = launches(game); assert.equal(game.fire(0, -1), false); advance(game, 1); assert.equal(launches(game), n);
});
test('Five seeds in the air still refuse a tap without keeping it or calling the pod dry', () => {
  const game = still([bud('far', 30, 60)]); game.started = true; game.status = 'flying';
  for (let i = 0; i < 5; i++) game.spawnBall({ x: 210, y: 498, angle: -Math.PI / 2 });
  game.drainEvents(); assert.equal(game.fire(0, -1), false);
  assert(!game.drainEvents().some(e => e.type === 'dry' || e.type === 'kept')); assert.equal(game.pod, POD);
});
test('Super Bloom fires from the sun: no seeds spent, a seed every .22 s, no feeding, and the pod keeps regrowing', () => {
  const game = still([bud('a', 210, 300), bud('b', 30, 60)]);
  game.started = true; game.status = 'flying'; game.pod = 1; game.podGrow = 0; game._startSuper();
  assert(game.fire(0, -1)); assert.equal(game.pod, 1); assert(Math.abs(game.fireCooldown - SUPER_DELAY) < 1e-9);
  advance(game, SUPER_DELAY + .01); assert(game.fire(0, -1)); assert.equal(game.pod, 1);
  game.drainEvents(); advance(game, .5); assert.equal(game.drainEvents().filter(e => e.type === 'podRefund').length, 0);
  advance(game, 6); assert.equal(game.superBloom, 0); assert(game.pod >= 2, 'the pod regrew during the Super Bloom');
});
test('A Dandelion fans three seeds for one pod seed', () => {
  const game = still([bud('far', 30, 60)]); game.arm('dandelion');
  assert(game.fire(0, -1)); assert.equal(game.balls.length, 3); assert.equal(game.pod, POD - 1);
});
test('The tutorial: setting the cooldown to zero hands over a full pod, early taps are simply dropped, the script earns nothing', () => {
  const game = still([bud('a', 210, 300)], { scripted: true });
  game.fire(0, -1); assert.equal(game.fire(0, -1), false, 'no keeping in the script'); advance(game, POD_GAP); game.fire(0, -1);
  assert.equal(game.pod, POD - 2);
  game.fireCooldown = 0; assert.equal(game.pod, POD); assert.equal(game.canFire, true);
  game.fire(0, -1); game.drainEvents(); advance(game, .5);
  assert.equal(game.drainEvents().filter(e => e.type === 'podRefund').length, 0, 'tutorial blooms do not feed the pod');
});
test('The snapshot and the launch event carry the pod', () => {
  const game = still([bud('far', 30, 60)]); game.fire(0, -1);
  const snap = game.snapshot();
  assert.equal(snap.pod, POD - 1); assert.equal(snap.podSize, POD); assert.equal(typeof snap.podGrow, 'number'); assert.equal(snap.kept, false);
  const launch = game.events.find(e => e.type === 'launch'); assert.equal(launch.pod, POD - 1); assert(Math.abs(launch.angle + Math.PI / 2) < 1e-9);
});

// Integration: mashing no longer pays, aiming still does. The masher is the practice bot's mash mode: a tap every
// .12 s, whatever the pod shows.
const mash = (id, seed, mode) => bot.mash(id, { seed, mode });
const pain = r => r.won ? 3 - r.lives : 3 + (10 - r.wave);
test('Mashing with no aim loses: nearly every level from 2 on, early, and costs lives on level 1', () => {
  const wild = [];
  for (let id = 1; id <= 10; id++) for (let s = 1; s <= 4; s++) wild.push({ id, ...mash(id, s * 101 + id, 'wild') });
  observations.wild = wild.map(r => `L${r.id} ${r.won ? 'W' + r.lives : 'Lw' + r.wave}`).join(' ');
  const deep = wild.filter(r => r.id >= 2), lost = deep.filter(r => !r.won).map(r => r.wave).sort((a, b) => a - b);
  assert(deep.filter(r => r.won).length <= 4, `wild mashing won ${deep.filter(r => r.won).length} of 36 runs on levels 2-10`);
  assert(deep.filter(r => r.won).every(r => r.lives <= 2), 'and never cleanly');
  assert(deep.filter(r => r.won && r.id >= 6).length === 0, 'and never from level 6 on');
  assert(lost[Math.floor(lost.length / 2)] <= 6, `it usually loses by wave 6 (median ${lost[Math.floor(lost.length / 2)]})`);
  assert(wild.filter(r => r.id === 1).reduce((n, r) => n + pain(r), 0) >= 3, 'level 1 costs a mashing player lives');
});
test('Rough aim at full speed does clearly worse than aiming: lives on levels 2-3, and it loses level 4 and the hard deep levels', () => {
  const lazy = [];
  for (const id of [2, 3, 4, 6, 7, 10]) for (let s = 1; s <= 4; s++) lazy.push({ id, ...mash(id, s * 101 + id, 'lazy') });
  observations.lazy = lazy.map(r => `L${r.id} ${r.won ? 'W' + r.lives : 'Lw' + r.wave}`).join(' ');
  assert(lazy.filter(r => r.id <= 3).reduce((n, r) => n + pain(r), 0) / 8 >= 2, 'rough mashing loses lives on levels 2 and 3');
  assert(lazy.filter(r => r.id >= 4).filter(r => r.won).length <= 2, 'and nearly always loses levels 4, 6, 7 and 10');
});
test('A fast, careful aimer clears every level, firing briskly', () => {
  const fast = { noise: 2.5, think: 0, thinkSpread: 0, bounces: 2 }, rates = [];
  for (let id = 1; id <= 10; id++) {
    const run = bot.play(id, { seed: 53 + id, ...fast });
    assert.equal(run.won, true, `a fast aimer clears level ${id}`); rates.push(run.rate);
  }
  observations.fastRate = rates;
  assert(Math.min(...rates) >= 1.4, `a fast aimer keeps 1.4+ shots a second outside Super Bloom (${Math.min(...rates)})`);
});
test('The suite runs in 30 seconds or less', () => {
  const seconds = (Date.now() - startedAt) / 1000; observations.runtimeSeconds = +seconds.toFixed(1);
  assert(seconds <= 30, `took ${seconds.toFixed(1)} s`);
});
const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, observations, results };
fs.writeFileSync(path.join(__dirname, 'pod-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
