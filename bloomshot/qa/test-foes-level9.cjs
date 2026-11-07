'use strict';
// Level 9's new piece: the Sweetheart Roses. Checked the same way as every foe: where the level places it, what a
// credited seed, a chain, a power and an uncredited strike do to it, that it plays the same at 30, 60 and 144 FPS, that
// it never costs a life it should not, and what the practice bot thinks of it.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { sandbox, advance, strikeOut, foesOf, Foes, Depths, RushGame } = require('./foe-harness.cjs');
const results = []; let serial = 0;
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
// A credited seed touching `bud` with contact normal (nx, ny), resolved the way the ball loop resolves a touch. Pass
// `id` to touch with the same seed again (a ricochet).
function touch(game, bud, nx = 0, ny = 1, extra = {}) {
  game.striker = { id: 'seed' + ++serial, bossContact: { nx, ny }, touches: 0, streak: 0, walls: 0, bounces: 0, age: 0, gateAt: -100, petalAt: -100, ...extra };
  game.strike(bud); const seed = game.striker; game.striker = null; return seed;
}
function level(id, wave) {
  const game = new RushGame({ plan: { id, name: 'Test', waves: 1, wave: () => Depths.wave(id, wave) }, startWave: 1 });
  game.started = true; game.drainEvents(); return game;
}
const foeKinds = events => events.filter(e => e.type === 'foe').map(e => e.kind);
const SWEET = Foes.FOES.sweetheart.SWEET, blushLeft = Foes.FOES.sweetheart.blushLeft;
// Steps whole 1/120 s ticks until the foe clock reaches `at`.
function toClock(game, at) { while (game.foeClock < at - 1e-9) game.step(1 / 120); }
// A pair alone on a still board (nothing falls), the sun and pod spied on.
function pair(opts) {
  const game = sandbox(9, 3, [['sweetheart', 210, 200, opts]], { keepBuds: false });
  game.descentSpeed = 0; game.drainEvents();
  const charges = []; const charge = game._charge.bind(game); game._charge = (amount, credit) => { charges.push(amount); return charge(amount, credit); };
  const [a, b] = foesOf(game, 'sweetheart'); return { game, a, b, charges };
}

// ── Sweetheart Roses (Level 9, `sweetheart`) ──
test('Registry: two coral r 11 one-hit roses, one group, 46 px apart, with a hint of 52 characters or fewer', () => {
  const e = Foes.FOES.sweetheart;
  assert.equal(e.hint, 'Sweethearts bloom together. Hit both fast!'); assert(e.hint.length <= 52);
  const made = Foes.make('sweetheart', ['sweetheart', 210, 200], 'd9-3', 0, 9, 3);
  assert.deepEqual(made.map(b => b.id), ['d9-3-foe0-0', 'd9-3-foe0-1']);
  assert.deepEqual(made.map(b => [b.x, b.y, b.r, b.hp, b.type, b.group, b.mate]), [[187, 200, 11, 1, 'coral', 'd9-3-foe0', 'd9-3-foe0-1'], [233, 200, 11, 1, 'coral', 'd9-3-foe0', 'd9-3-foe0-0']]);
  for (const b of made) { assert(!b.inert && !b.decoy); assert.equal(b.fall, .9); assert.equal(b.relay, false); }
  const tilt = Foes.make('sweetheart', ['sweetheart', 205, 250, { dx: 52, dy: 24 }], 't', 1);
  assert.deepEqual(tilt.map(b => [b.x, b.y]), [[179, 238], [231, 262]]);
  const boss = Foes.make('sweetheart', ['sweetheart', 100, 70], 'g', null);
  assert.deepEqual(boss.map(b => [b.id, b.group]), [['g-0', 'g'], ['g-1', 'g']], 'a guardian spawn names its own group');
});
test('Placements: L9 W3 debuts one pair with its hint; pairs recur in W5, W7, W9 and a W8 drop; W1 and W10 stay clear', () => {
  const w = Depths.wave(9, 3), roses = w.buds.filter(b => b.foe === 'sweetheart');
  assert.equal(w.hint, 'Sweethearts bloom together. Hit both fast!');
  assert.deepEqual(roses.map(b => [b.id, b.x, b.y]), [['d9-3-foe0-0', 187, 250], ['d9-3-foe0-1', 233, 250]]);
  for (const [n, count] of [[5, 2], [7, 2], [9, 2]]) assert.equal(Depths.wave(9, n).buds.filter(b => b.foe === 'sweetheart').length, count, `W${n}`);
  assert.deepEqual(Depths.wave(9, 8).drops[1].buds.filter(b => b.foe === 'sweetheart').map(b => [b.id, b.x, b.y]), [['d9-8-drop2-foe0-0', 152, 115], ['d9-8-drop2-foe0-1', 198, 115]]);
  for (const n of [1, 10]) assert(!Depths.wave(9, n).buds.some(b => b.foe), `W${n}`);
  for (let l = 1; l <= 8; l++) for (let n = 1; n <= 10; n++) assert(!Depths.wave(l, n).buds.some(b => b.foe === 'sweetheart'), `none before the L9 debut (L${l} W${n})`);
  // The earlier foes Level 9 mixes in, and Lodestone's row (it makes nothing until Level 8's block defines it).
  const count = (n, name) => Depths.wave(9, n).buds.filter(b => b.foe === name).length;
  assert.deepEqual([count(2, 'fibcap'), count(6, 'fibcap'), count(9, 'fibcap'), count(5, 'inkcap'), count(8, 'inkcap'), count(4, 'mole'), count(8, 'mole')], [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(count(6, 'lodestone'), Foes.FOES.lodestone ? 1 : 0);
});
test('A credited touch blushes one rose: no damage, refund, split charge or sun, and a heart ring on its sweetheart', () => {
  const { game, a, b, charges } = pair(); game.pod = 2;
  const refunds = game.refunds || 0, split = game.splitCharge, hits = game.directHits, score = game.score;
  touch(game, a);
  const ev = game.drainEvents();
  assert.deepEqual(foeKinds(ev), ['sweetheart:blush']);
  const blush = ev.find(e => e.kind === 'sweetheart:blush'); assert.deepEqual([blush.mx, blush.my], [b.x, b.y]);
  assert(!a.bloomed && !b.bloomed); assert.equal(a.hp, 1);
  assert.equal(game.refunds || 0, refunds); assert.equal(game.splitCharge, split); assert.equal(game.directHits, hits); assert.equal(game.score, score);
  assert.deepEqual(charges, []);
  assert(Math.abs(blushLeft(game, a) - SWEET.window) < 1e-9); assert.equal(blushLeft(game, b), 0);
  // Touching the blushing rose again does nothing and does not refresh its blush.
  advance(game, .5); const until = a.blushUntil; touch(game, a);
  assert.equal(a.blushUntil, until); assert.deepEqual(foeKinds(game.drainEvents()), []); assert(!a.bloomed);
});
test('A kiss: the sweetheart touched within 1.2 s blooms both, refunds both to that seed and pays +1 sun and 300 x tempo', () => {
  const { game, a, b, charges } = pair(); game.pod = 1;
  touch(game, a); advance(game, 1.1); game.drainEvents();
  const refunds = game.refunds || 0, score = game.score, seed = touch(game, b);
  assert(b.bloomed, 'the second rose blooms on the touch'); assert(!a.bloomed);
  const ev = game.drainEvents(), kiss = ev.find(e => e.kind === 'sweetheart:kiss');
  assert(kiss && kiss.cupid === false); assert.equal(kiss.x, 210);
  assert.equal(charges[0], SWEET.kiss, 'the kiss pays its own sun first, before the bloom\'s');
  advance(game, .1);
  assert(a.bloomed, 'its sweetheart follows .06 s later');
  const link = game.drainEvents().find(e => e.type === 'bloom' && e.bud === a); assert(link && link.chain && link.via === 'kiss' && link.seed === seed.id);
  assert.equal((game.refunds || 0) - refunds, 2, 'both roses refund the seed that kissed them');
  assert(game.score - score >= Math.round(SWEET.pay * game.tempo));
});
test('A Cupid shot: one seed that blushes one rose and ricochets into the other pays +2 sun and 600 x tempo', () => {
  const { game, a, b, charges } = pair();
  const seed = touch(game, a); advance(game, .3);
  game.striker = seed; game.strike(b); game.striker = null;
  const kiss = game.drainEvents().find(e => e.kind === 'sweetheart:kiss');
  assert(kiss && kiss.cupid === true); assert.equal(charges[0], SWEET.cupid);
  advance(game, .1); assert(a.bloomed && b.bloomed);
});
test('A blush runs out at exactly 1.2 s of foe time (a pout) and the pair resets; a Lullaby holds it', () => {
  const { game, a, b } = pair(); touch(game, a); game.drainEvents(); const at = game.foeClock;
  toClock(game, at + SWEET.window - 1 / 120); assert(blushLeft(game, a) > 0); assert.deepEqual(foeKinds(game.drainEvents()), []);
  game.step(1 / 120); assert.deepEqual(foeKinds(game.drainEvents()), ['sweetheart:pout']); assert.equal(blushLeft(game, a), 0);
  touch(game, b); assert(!b.bloomed && !a.bloomed, 'after a pout the next touch only blushes again');
  const left = blushLeft(game, b); game.lull(); advance(game, 2);
  assert(Math.abs(blushLeft(game, b) - left) < 1e-9, 'the Lullaby holds the blush');
  touch(game, a); advance(game, .1); assert(a.bloomed && b.bloomed, 'and a kiss still lands in it');
});
test('Chains, powers and uncredited strikes are plain, and its sweetheart always blooms with it', () => {
  // Uncredited: the strike loop ends at once, and the mate follows.
  let { game, a, b } = pair();
  assert.equal(strikeOut(game, a), 1); advance(game, .1); assert(b.bloomed);
  assert(!foeKinds(game.drainEvents()).includes('sweetheart:kiss'));
  // A credited chain (a puffcap's) blooms it plainly, crediting the mate to the same seed.
  ({ game, a, b } = pair());
  game.due = { by: 'seedX', via: 'puff', from: { x: 210, y: 150 } }; game.strike(a, true); game.due = null;
  assert(a.bloomed); advance(game, .1); assert(b.bloomed);
  const link = game.drainEvents().find(e => e.type === 'bloom' && e.bud === b); assert(link && link.via === 'sweet' && link.seed === 'seedX');
  // A Bee Line, a Dandelion seed and a Sunburst open it at the first touch.
  for (const power of ['beeline', 'dandelion']) {
    ({ game, a, b } = pair()); touch(game, a, 0, 1, { power }); assert(a.bloomed, power); advance(game, .1); assert(b.bloomed, power);
  }
  ({ game, a, b } = pair());
  game.striker = { id: 'sun', power: 'sunburst', age: 0, touches: 0, streak: 0, walls: 0, bounces: 0, gateAt: -100, petalAt: -100, x: a.x, y: a.y + 20 };
  game._sunburst(game.striker, a); game.striker = null; advance(game, .3); assert(a.bloomed && b.bloomed);
  // A blushing rose that a chain reaches blooms both (the blush is forgotten).
  ({ game, a, b } = pair()); touch(game, a); assert.equal(strikeOut(game, b), 1); advance(game, .1); assert(a.bloomed);
});
test('A missed pair costs one life, not two; a lone pair holds its wave open', () => {
  const game = sandbox(9, 3, [['sweetheart', 210, 200]], { keepBuds: false }), [a, b] = foesOf(game, 'sweetheart');
  const lives = game.lives; a.y = b.y = game.dangerY - a.r + 1; advance(game, 1 / 60);
  assert.equal(game.lives, lives - 1); assert(!game.buds.some(p => p.foe === 'sweetheart'));
  const open = sandbox(9, 3, [['sweetheart', 210, 200]], { keepBuds: false }); advance(open, 1);
  assert.equal(open.nextWaveAt, null, 'unbloomed roses hold the wave');
});
test('Real seeds: a double tap at the pair kisses, and a split seed can take both', () => {
  const game = sandbox(9, 3, [['sweetheart', 210, 200]], { keepBuds: false }), [a, b] = foesOf(game, 'sweetheart');
  game.descentSpeed = 0; game.drainEvents(); const events = [];
  for (const r of [a, b]) {
    const dx = r.x - game.launcher.x, dy = r.y - game.launcher.y, len = Math.hypot(dx, dy);
    game.shotGap = 0; game.pod = Math.max(game.pod, 1); assert(game.fire(dx / len, dy / len)); advance(game, .2); events.push(...game.drainEvents());
  }
  advance(game, 1.5); events.push(...game.drainEvents());
  assert(a.bloomed && b.bloomed); assert.deepEqual(foeKinds(events).filter(k => k !== 'sweetheart:pout'), ['sweetheart:blush', 'sweetheart:kiss']);
  // Two seeds 0.3 rad either side of one heading (a split) reach both roses together.
  // The fan is 0.3 rad either side, so it takes a 46 px pair from 23 / tan(0.3) = 74 px below it.
  const g2 = sandbox(9, 3, [['sweetheart', 210, 220]], { keepBuds: false }), [c, d] = foesOf(g2, 'sweetheart'); g2.descentSpeed = 0;
  const y0 = 220 + 23 / Math.tan(.3), mid = -Math.PI / 2;
  for (const off of [-.3, .3]) g2.spawnBall({ x: 210, y: y0, angle: mid + off, speed: g2.speed, type: 'coral' });
  const target = [c, d].map(r => Math.atan2(r.y - y0, r.x - 210)); assert(target.every(t => Math.min(...[-.3, .3].map(o => Math.abs(mid + o - t))) < .02), 'the fan points at both');
  advance(g2, 1.5); assert(c.bloomed && d.bloomed); assert(foeKinds(g2.drainEvents()).includes('sweetheart:kiss'));
});
test('The same at 30, 60 and 144 FPS', () => {
  const runs = [30, 60, 144].map(fps => {
    // Every span is a whole number of frames at all three rates (multiples of 1/6 s).
    const game = level(9, 3), [a, b] = foesOf(game, 'sweetheart'); advance(game, .5, fps); touch(game, a); advance(game, 4 / 3, fps);
    const ev = foeKinds(game.drainEvents()); touch(game, b); advance(game, 5 / 6, fps); touch(game, a); advance(game, .5, fps);
    return [ev, +a.y.toFixed(6), a.bloomed, b.bloomed, +game.foeClock.toFixed(6)];
  });
  assert.deepEqual(runs[0], runs[1]); assert.deepEqual(runs[1], runs[2]);
  assert.deepEqual(runs[0][0], ['sweetheart:blush', 'sweetheart:pout']); assert(runs[0][2] && runs[0][3]);
});
test('The bot: an idle rose is worth a little, its sweetheart a lot while it blushes or a seed flies at it, a blushing rose nothing', () => {
  const { game, a, b } = pair(), v = (bud, time) => Foes.value(game, { bud, time, nx: 0, ny: 1 });
  assert.equal(v(a, .5), SWEET.worth); assert.equal(v(b, .5), SWEET.worth);
  touch(game, a);
  assert.equal(v(b, .5), SWEET.urgent); assert.equal(v(a, .5), -1);
  assert.equal(v(b, SWEET.window), SWEET.worth, 'arriving after the blush ends is no kiss');
  // A seed already flying at b: the bot's next seed belongs to a.
  const { game: g, a: c, b: d } = pair(); g.spawnBall({ x: d.x, y: d.y + 150, angle: -Math.PI / 2, speed: g.speed, type: 'coral' });
  assert(Math.abs(Foes.FOES.sweetheart.sweetIncoming(g, d) - (150 - 16.5) / g.speed) < 1e-6);
  assert.equal(Foes.value(g, { bud: c, time: .5, nx: 0, ny: 1 }), SWEET.urgent); assert.equal(Foes.value(g, { bud: d, time: .5, nx: 0, ny: 1 }), -1);
});

// Shared rules every foe keeps.
test('foes.js never touches the seed pod and never uses Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, '../foes.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\.(pod|podGrow|shotGap)\b/.test(source), 'no seed pod access');
  assert(!/Math\.random/.test(source), 'no Math.random');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'foes-level9-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
