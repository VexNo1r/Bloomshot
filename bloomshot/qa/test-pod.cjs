'use strict';
// The seed pod: four seeds in the launcher, half a seed back per bud from a timely flight and its chains (a quarter the first
// time a shell turns it away), empty slots regrowing slowly, a tap a blink early or a held aim a little early kept, and
// mashing that no longer pays. Run: node qa/test-pod.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RushGame, POD, POD_GAP, POD_REGROW, REFUND, GLANCE, KEEP, HELD, AIM_KEEP, SUPER_DELAY, SUPER_TIME, fireDelayFor } = require('../rush.js');
const Depths = require('../depths.js');
const bot = require('./depths-bot.cjs');
const results = [], observations = {}, startedAt = Date.now();
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) game.step(1 / 120); };
const bud = (id, x, y, extra) => ({ id, group: id, x, y, baseX: x, startY: y, r: 11, type: 'gold', relay: false, hp: 1, maxHp: 1, fall: 1, sway: 0, swayW: 0, swayPhase: 0, hitAt: -100, bloomed: false, bloomAt: -100, ...extra });
const still = (buds, options) => { const game = new RushGame(options); game.buds = buds; game.descentSpeed = 0; game.drops = []; return game; };
const launches = game => game.events.filter(e => e.type === 'launch').length;

test('Constants', () => {
  assert.equal(POD, 4); assert.equal(POD_GAP, .15); assert.equal(POD_REGROW, 6); assert.equal(REFUND, .5); assert.equal(GLANCE, .25);
  assert.equal(KEEP, .15); assert.equal(HELD, .2); assert.equal(AIM_KEEP, .6);
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
test('A crown feeds the pod for itself and each flower it opens; a crack counts; a cup deflection does not, the first shell one a seed meets a little', () => {
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
  // A shell with its opening turned up stops a seed from below; a timing shot that just misses still wins back a quarter.
  const shell = still([bud('shell', 210, 300, { shell: true, shellAngle: -Math.PI / 2, shellSpin: 0 })]); shell.fire(0, -1); shell.drainEvents(); advance(shell, .6);
  const turned = shell.drainEvents(), back = turned.filter(e => e.type === 'podRefund');
  assert(turned.some(e => e.type === 'shield' && e.shell)); assert.equal(shell.buds[0].bloomed, false);
  assert.equal(back.length, 1); assert.equal(back[0].amount, GLANCE); assert.equal(back[0].x, 210);
  // Only the first time: a seed a shell already turned away wins nothing from the next one.
  const again = still([bud('shell', 210, 300, { shell: true, shellAngle: -Math.PI / 2, shellSpin: 0 })]); again.fire(0, -1); again.balls[0].glanced = true;
  again.drainEvents(); advance(again, .6);
  const twice = again.drainEvents(); assert(twice.some(e => e.type === 'shield')); assert(!twice.some(e => e.type === 'podRefund'));
});
test('A full pod takes nothing more, and a strike no seed earned (a test, the script) feeds nothing', () => {
  const game = still([bud('a', 210, 300)]); game.started = true; game.status = 'flying';
  game.strike(game.buds[0]); assert.equal(game.pod, POD); assert.equal(game.podGrow, 0);
  assert(!game.drainEvents().some(e => e.type === 'podRefund'));
});
test('A timely flight refunds a ringed bud once; a fresh aimed seed can earn the next ring', () => {
  const game=still([bud('rings',210,300,{hp:4,maxHp:4}),bud('far',30,60)]);game.started=true;game.status='flying';game.pod=0;
  game.striker={id:71,age:.7,touches:0};game.strike(game.buds[0]);game.strike(game.buds[0]);game.striker=null;
  assert.equal(game.buds[0].hp,2,'repeated contacts still damage normally');assert.equal(game.podGrow,REFUND);
  game.striker={id:72,age:.7,touches:0};game.strike(game.buds[0]);game.striker=null;
  assert.equal(game.pod,1,'a new timely seed earns its own refill');assert.equal(game.refunds,2);
});
test('An old first ricochet still blooms and chains, but neither it nor its chain refills the pod', () => {
  const game=still([bud('c0',210,300,{group:'c',relay:true}),bud('c1',190,270,{group:'c'}),bud('c2',230,270,{group:'c'}),bud('far',30,60)]);
  game.started=true;game.status='flying';game.pod=0;game.striker={id:81,age:1.61,touches:4};game.strike(game.buds[0]);game.striker=null;
  advance(game,.4);assert(game.buds.slice(0,3).every(p=>p.bloomed));assert.equal(game.refunds||0,0);assert(game.score>0);
});
test('A timely crown keeps every chain refill after its seed has gone', () => {
  const game=still([bud('c0',210,300,{group:'c',relay:true}),bud('c1',190,270,{group:'c'}),bud('c2',230,270,{group:'c'}),bud('far',30,60)]);
  game.started=true;game.status='flying';game.pod=0;game.striker={id:91,age:1.6,touches:0};game.strike(game.buds[0]);game.striker=null;
  assert.equal(game.balls.length,0);advance(game,.4);assert.equal(game.refunds,3);assert.equal(game.pod,1);assert(game.podGrow>=.5);
});
test('A quick first hit does not let its late direct ricochets refill; stale or repeated shell glances feed nothing', () => {
  const game=still([bud('first',210,300),bud('late',230,150),bud('far',30,60)]);game.started=true;game.status='flying';game.pod=0;
  const seed={id:101,age:.5,touches:0};game.striker=seed;game.strike(game.buds[0]);seed.age=1.61;game.strike(game.buds[1]);game.striker=null;
  assert(game.buds[1].bloomed);assert.equal(game.refunds,1);game._refundGlance(seed,game.buds[2]);assert.equal(game.refunds,1);
  const fresh={age:1};game._refundGlance(fresh,game.buds[2]);game._refundGlance(fresh,game.buds[2]);assert.equal(game.refunds,2);
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
test('An aimed shot let go a little before its seed regrows is kept for it; a quick tap that early is dropped', () => {
  const game = still([bud('far', 30, 60)]);
  for (let i = 0; i < POD; i++) { game.fire(0, -1); advance(game, POD_GAP); game.balls = []; }
  assert.equal(game.pod, 0); advance(game, game.fireCooldown - .4); game.drainEvents();
  const n = game.shotNumber;
  assert.equal(game.fire(0, -1, .05), false, 'a 50 ms tap .4 s early is dropped');
  assert(game.drainEvents().some(e => e.type === 'dry' && !e.aimed));
  assert.equal(game.fire(-.3, -1, .4), true, 'a .4 s aim let go .4 s early is kept');
  assert(game.drainEvents().some(e => e.type === 'kept' && e.aimed));
  assert.equal(game.kept.aimed, true); advance(game, .3); assert.equal(game.shotNumber, n, 'it waits for its seed');
  advance(game, .15); assert.equal(game.shotNumber, n + 1, 'and fires the moment the seed regrows');
  assert(game.balls.at(-1).vx < 0, 'with the aim it was let go with'); assert.equal(game.pod, 0);
  // Let go well before the seed (more than AIM_KEEP), even an aimed shot is dropped, and says it was aimed.
  game.balls = []; advance(game, game.fireCooldown - AIM_KEEP - .3); game.drainEvents();
  assert.equal(game.fire(0, -1, 1), false); assert(game.drainEvents().some(e => e.type === 'dry' && e.aimed));
  advance(game, 1.2); assert.equal(game.shotNumber, n + 1, 'nothing fires by itself');
});
test('A kept tap that cannot fire in time says why instead of vanishing (five seeds went up meanwhile)', () => {
  const game = still([bud('far', 30, 60)]);
  game.fire(0, -1); advance(game, .15); game.fire(-.2, -1); advance(game, .15); game.fire(.2, -1);
  assert.equal(game.fire(0, -1), true, 'kept'); const n = game.shotNumber;
  game.splitCharge = 1; assert(game.split()); assert.equal(game.balls.length, 5); game.drainEvents();
  advance(game, .3);
  assert.equal(game.shotNumber, n); assert.equal(game.kept, null);
  const dropped = game.drainEvents().filter(e => e.type === 'dropped');
  assert.equal(dropped.length, 1); assert.equal(dropped[0].reason, 'cap');
});
test('While a Super Bloom lasts nothing feeds the pod: a sun seed still flying when it ends feeds it like any other, a bought seed landing during one does not', () => {
  // A free seed fired near the end of a Super Bloom reaches its crown after it.
  const late = still([bud('c0', 210, 60, { group: 'c', relay: true }), bud('c1', 190, 40, { group: 'c' }), bud('c2', 230, 40, { group: 'c' })]);
  late.started = true; late.status = 'flying'; late._startSuper(); advance(late, SUPER_TIME - .3); late.pod = 0; late.podGrow = 0;
  assert(late.fire(0, -1)); assert.equal(late.pod, 0, 'free'); late.drainEvents(); advance(late, 1.6);
  const lateEvents = late.drainEvents(), end = lateEvents.findIndex(e => e.type === 'superBloomEnd');
  assert(end >= 0); assert(lateEvents.filter(e => e.type === 'bloom').length >= 3, 'it bloomed the crown and its bunch');
  assert(!lateEvents.slice(0, end).some(e => e.type === 'podRefund'));
  assert(lateEvents.slice(end).filter(e => e.type === 'podRefund').length >= 3, 'after the Super Bloom its blooms feed the pod');
  // A seed from the pod fired just before a Super Bloom, landing during it, earns nothing: the pod is regrowing anyway.
  const paid = still([bud('a', 210, 300)]);
  paid.fire(0, -1); advance(paid, .2); paid._startSuper(); paid.drainEvents(); advance(paid, .6);
  assert(paid.buds[0].bloomed); assert.equal(paid.drainEvents().filter(e => e.type === 'podRefund').length, 0);
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
// .12 s, whatever the pod shows; wild fires anywhere, lazy roughly at the lowest flower, no bank shots. Four seeds a
// level, all ten levels; the caps are what these seeds show, so a change that makes mashing pay again fails here.
const pain = r => r.won ? 3 - r.lives : 3 + (10 - r.wave), tag = r => `L${r.id} ${r.won ? 'W' + r.lives : 'Lw' + r.wave}`;
const mashAll = mode => { const runs = []; for (let id = 1; id <= 10; id++) for (let s = 1; s <= 4; s++) runs.push({ id, ...bot.mash(id, { seed: s * 101 + id, mode }) }); return runs; };
const wins = (runs, id) => runs.filter(r => r.id === id && r.won).length;
const mashes = (runs, who) => {
  assert(runs.every(r => r.shots > 0 && r.dry > 0), `${who} fires and runs the pod dry on every run`);
  const rate = runs.reduce((n, r) => n + r.rate, 0) / runs.length;
  // The .12s tap driver runs at60FPS, so attempts are8frames apart. Actual accepted shots now
  // depend on earned timely refills; low accepted throughput is an expected consequence of poor aim.
  const tapInterval=Math.ceil(.12*60)/60;
  assert(runs.every(r=>r.taps>r.shots && r.taps>=Math.floor(r.elapsedExact/tapInterval)-1),`${who} keeps attempting rapid taps through a dry pod`);
  return +rate.toFixed(2);
};
test('Mashing with no aim, for these seeds: it costs lives on level 1, wins no more than one run in four of any later level, never cleanly, and mostly loses by wave 6', () => {
  const wild = mashAll('wild'); observations.wild = wild.map(tag).join(' '); observations.wildRate = mashes(wild, 'the wild masher');
  assert(wild.filter(r => r.id === 1).reduce((n, r) => n + pain(r), 0) / 4 >= 1, 'level 1 costs a mashing player lives');
  for (let id = 2; id <= 10; id++) assert(wins(wild, id) <= 1, `wild mashing won level ${id} ${wins(wild, id)} of 4 times`);
  const deep = wild.filter(r => r.id >= 2), lost = deep.filter(r => !r.won).map(r => r.wave).sort((a, b) => a - b);
  assert(deep.filter(r => r.won).length <= 4, `wild mashing won ${deep.filter(r => r.won).length} of 36 runs on levels 2-10`);
  assert(deep.filter(r => r.won).every(r => r.lives <= 2), 'and never cleanly');
  assert(lost[Math.floor(lost.length / 2)] <= 6, `it usually loses by wave 6 (median ${lost[Math.floor(lost.length / 2)]})`);
});
test('Rough aim at full speed, for these seeds: it nearly always loses levels 3, 4, 6 and 7, mostly 10, and its wins cost lives; levels 2, 5, 8 and 9 stay winnable that way about half the time', () => {
  const lazy = mashAll('lazy'); observations.lazy = lazy.map(tag).join(' '); observations.lazyRate = mashes(lazy, 'the rough masher');
  for (const id of [3, 4, 6, 7]) assert(wins(lazy, id) <= 1, `rough mashing won level ${id} ${wins(lazy, id)} of 4 times`);
  assert(wins(lazy, 10) <= 2, `rough mashing won level 10 ${wins(lazy, 10)} of 4 times`);
  const partly = [2, 5, 8, 9].reduce((n, id) => n + wins(lazy, id), 0);
  assert(partly <= 10, `rough mashing won ${partly} of 16 runs on levels 2, 5, 8 and 9`);
  const deep = lazy.filter(r => r.id >= 2 && r.won);
  assert(deep.length <= 12, `rough mashing won ${deep.length} of 36 runs on levels 2-10`);
  assert(deep.length === 0 || deep.reduce((n, r) => n + r.lives, 0) / deep.length <= 2.4, 'any deeper-level wins cost lives');
});
test('A fast, careful aimer clears every level, firing briskly (two runs a level; level 4 is the one it sometimes loses)', () => {
  const fast = { noise: 2.5, think: 0, thinkSpread: 0, bounces: 2 }, runs = [];
  for (let id = 1; id <= 10; id++) for (let s = 1; s <= 2; s++) runs.push({ id, ...bot.play(id, { seed: s * 53 + id, ...fast }) });
  observations.fast = runs.map(r => `L${r.id} ${r.won ? 'W' + r.lives : 'Lw' + r.wave} ${r.rate}`).join(' ');
  for (let id = 1; id <= 10; id++) assert(runs.some(r => r.id === id && r.won), `a fast aimer clears level ${id}`);
  assert(runs.filter(r => r.won).length >= 19, `and wins ${runs.filter(r => r.won).length} of 20 runs`);
  const rates = runs.map(r => r.rate);
  const meanRate=rates.reduce((sum,n)=>sum+n,0)/rates.length;
  observations.fastMeanRate=+meanRate.toFixed(3);observations.fastMinimumRate=Math.min(...rates);
  // Trevor's aim challenge deliberately removes accidental late refills. Keep brisk campaign play,
  // while the exact four-shot/gap test above checks burst response independently of waiting for armor.
  assert(meanRate>=1.4,`fast careful play averages 1.4+ shots/s (${meanRate})`);
  assert(Math.min(...rates)>=1.2,`even timing/armor encounters sustain brisk play (${Math.min(...rates)})`);
});
test('The suite runs in 40 seconds or less (the mashers play all ten levels)', () => {
  const seconds = (Date.now() - startedAt) / 1000; observations.runtimeSeconds = +seconds.toFixed(1);
  assert(seconds <= 40, `took ${seconds.toFixed(1)} s`);
});
const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, observations, results };
fs.writeFileSync(path.join(__dirname, 'pod-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
