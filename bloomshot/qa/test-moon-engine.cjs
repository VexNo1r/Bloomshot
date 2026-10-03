'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Game, earliest, RADIUS, BOUNDS } = require('../engine.js');
const { levels } = require('../levels.js');
const results = [];
const near = (a, b, epsilon = 1e-7) => assert(Math.abs(a - b) <= epsilon, `${a} ~= ${b}`);
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
function bud(id, x, y) { return { id, x, y, r: 11, type: 'lilac' }; }
function pair(a = {}, b = {}) {
  return [{ id: 'a', pair: 'b', x: 210, y: 350, r: 18, angle: 0, ...a },
    { id: 'b', pair: 'a', x: 110, y: 160, r: 18, angle: Math.PI / 2, ...b }];
}
function level(extra = {}) {
  return { id: 'moon-test', worldId: 'moon', par: 2, difficulty: 2,
    rules: { shots: 5, ballsPerShot: 1, guide: false, autoBurst: false, ballLifetime: 7 },
    buds: [bud('target', 200, 160), bud('other', 340, 90)], bumpers: [], gates: pair(),
    launcher: { x: 210, y: 498 }, ...extra };
}
function injected(game, x, y, vx, vy) {
  assert(game.fire(0, -1)); game.pendingBalls = [];
  game.spawnBall({ x, y, angle: Math.atan2(vy, vx), type: 'lilac' });
  Object.assign(game.ball, { vx, vy, speed: Math.hypot(vx, vy) });
  return game.ball;
}
function advance(game, seconds, fps = 120) { for (let i = 0; i < Math.round(seconds * fps); i++) game.step(1 / fps); }

test('Meadow defaults retain three volleys, three balls, steering, bursts, lifetime, and star ratings', () => {
  const game = new Game(levels[0]);
  assert.deepEqual(game.rules, { shots: 3, ballsPerShot: 3, guide: true, autoBurst: true, ballLifetime: 9 });
  assert.deepEqual(game.gates, []); assert.equal(game.gatePasses, 0);
  for (const [spent, stars] of [[1, 3], [2, 2], [3, 1]]) {
    game.status = 'won'; game.shotsLeft = 3 - spent; assert.equal(game.stars, stars);
  }
});
test('Moon fires exactly one centered seed and consumes one of five shots', () => {
  const game = new Game(level());
  assert.equal(game.shotsLeft, 5); assert(game.fire(0, -100));
  assert.equal(game.pendingBalls.length, 1); near(game.pendingBalls[0].angle, -Math.PI / 2);
  game.step(1 / 120); assert.equal(game.balls.length, 1); assert.equal(game.pendingBalls.length, 0);
  near(game.ball.x, 210); near(game.ball.vx, 0); assert.equal(game.shotsLeft, 4);
});
test('Disabled guidance remains a no-op and cannot alter velocity or gain charge', () => {
  const game = new Game(level({ gates: [], buds: [bud('safe', 340, 90)] }));
  injected(game, 100, 300, 0, -430); game.guide({ x: 380, y: 100 });
  assert.equal(game.guideTarget, null); assert.equal(game.guideCharge, 0);
  // Even stale steering data from a restored state cannot bypass a level rule.
  game.guideTarget = { x: 380, y: 100 }; game.guideCharge = 1; game.step(1 / 120);
  near(game.ball.vx, 0); near(game.ball.vy, -430); assert.equal(game.guideCharge, 0);
});
test('Twelve blooms may celebrate but do not automatically spawn balls when disabled', () => {
  const buds = Array.from({ length: 13 }, (_, i) => bud('b' + i, 70 + i * 20, 100));
  const game = new Game(level({ buds, gates: [] })); assert(game.fire(0, -100)); game.step(1 / 120);
  for (let i = 0; i < 12; i++) game.bloom(game.buds[i]);
  assert.equal(game.balls.length, 1); assert.equal(game.pendingBalls.length, 0);
  assert(!game.drainEvents().some(e => e.type === 'burst')); assert(game.feverTime > 0);
});
test('Configured seven-second lifetime ends each shot and the fifth miss ends the level once', () => {
  const game = new Game(level({ gates: [], buds: [bud('safe', 210, 70)] }));
  for (let i = 0; i < 5; i++) {
    injected(game, 100, 300, 430, 0); advance(game, 7.05);
    assert.equal(game.balls.length, 0); assert.equal(game.shotsLeft, 4 - i);
    assert.equal(game.status, i === 4 ? 'lost' : 'aiming');
  }
  assert.equal(game.drainEvents().filter(e => e.type === 'lost').length, 1);
  advance(game, 1); assert.equal(game.drainEvents().filter(e => e.type === 'lost').length, 0);
});
test('Moon stars use shots spent against par rather than the five-shot allowance', () => {
  for (const [spent, expected] of [[1, 3], [2, 3], [3, 2], [4, 1], [5, 1]]) {
    const game = new Game(level()); game.shotsLeft = 5 - spent; game.status = 'won'; assert.equal(game.stars, expected);
  }
  assert.equal(new Game(level()).stars, 0);
});
test('Swept collision selects the nearest gate rim but honors an earlier solid hit', () => {
  const game = new Game(level({ gates: pair({ x: 120, y: 200 }, { x: 300, y: 300 }), buds: [] }));
  const hit = earliest(game, { x: 50, y: 200 }, { x: 200, y: 0 });
  assert.equal(hit.kind, 'gate'); assert.equal(hit.item.id, 'a'); near(hit.t, (120 - 18 - 50) / 200);
  game.buds = [{ ...bud('front', 85, 200), bloomed: false }];
  assert.equal(earliest(game, { x: 50, y: 200 }, { x: 200, y: 0 }).kind, 'bud');
});
test('A fast gate crossing rotates velocity, preserves speed, clears trail, and emits one located event', () => {
  const game = new Game(level({ gates: pair({ x: 100, y: 200 }, { x: 300, y: 300 }), buds: [bud('safe', 70, 70)] }));
  const ball = injected(game, 50, 200, 6000, 0); ball.trail = [{ x: 30, y: 200 }, { x: 40, y: 200 }];
  game.drainEvents(); game.step(1 / 120);
  assert.equal(game.gatePasses, 1); assert.equal(ball.gateHops, 1); assert(ball.gateCooldown > 0);
  near(ball.x, 300); near(ball.y, 300 + 18 + RADIUS + .1 + 18);
  near(ball.vx, 0); near(ball.vy, 6000); near(Math.hypot(ball.vx, ball.vy), 6000);
  assert.equal(ball.trail.length, 0); assert.equal(game.snapshot().gatePasses, 1);
  const events = game.drainEvents(); assert.equal(events.length, 1); assert.equal(events[0].type, 'gate');
  assert.equal(events[0].entry.id, 'a'); assert.equal(events[0].exit.id, 'b');
  assert.equal(events[0].x, 300); assert.equal(events[0].y, 300);
  assert(game.gates.every(g => g.lastUsed === game.time));
});
test('Remaining travel after teleport can hit and reflect from a flower in the same physics tick', () => {
  const game = new Game(level({ gates: pair({ x: 100, y: 200 }, { x: 300, y: 300 }), buds: [bud('near-exit', 300, 350), bud('safe', 70, 70)] }));
  const ball = injected(game, 50, 200, 6000, 0); game.step(1 / 120);
  assert.equal(game.gatePasses, 1); assert(game.buds[0].bloomed); assert(ball.vy < 0);
  assert.equal(game.score, 100); assert.equal(game.bloomedCount, 1);
});
test('Cooldown blocks immediate passage and each ball has a bounded lifetime hop budget', () => {
  const game = new Game(level({ gates: pair({ x: 100, y: 200 }, { x: 300, y: 300 }), buds: [bud('safe', 70, 70)] }));
  const ball = injected(game, 50, 200, 6000, 0); ball.gateCooldown = .12;
  game.step(1 / 120); assert.equal(game.gatePasses, 0); near(ball.x, 100);
  Object.assign(ball, { x: 50, y: 200, vx: 6000, vy: 0, gateCooldown: 0, gateHops: 11 });
  game.step(1 / 120); assert.equal(game.gatePasses, 1); assert.equal(ball.gateHops, 12);
  Object.assign(ball, { x: 50, y: 200, vx: 6000, vy: 0, gateCooldown: 0 });
  game.step(1 / 120); assert.equal(game.gatePasses, 1); near(ball.x, 100);
});
test('Repeated portal and wall travel remains finite, bounded, and eventually ends', () => {
  const game = new Game(level({ gates: pair({ x: 120, y: 200 }, { x: 300, y: 200, angle: 0 }), buds: [bud('safe', 70, 70)] }));
  injected(game, 60, 200, 6000, 0);
  for (let i = 0; i < 900; i++) {
    game.step(1 / 120);
    for (const ball of game.balls) {
      assert([ball.x, ball.y, ball.vx, ball.vy, ball.gateCooldown].every(Number.isFinite));
      assert(ball.gateHops <= 12); assert(ball.x >= BOUNDS.left + RADIUS - .1 && ball.x <= BOUNDS.right - RADIUS + .1);
    }
  }
  assert(game.gatePasses > 1 && game.gatePasses <= 12); assert.equal(game.status, 'aiming');
});
test('Malformed, ambiguous, self-paired, unpaired, and unsafe gates are ignored as complete pairs', () => {
  const cases = [null, {}, [null], [pair()[0]], pair({ pair: 'missing' }), pair({ pair: 'a' }),
    [...pair(), { ...pair()[0] }], pair({ x: NaN }), pair({ y: Infinity }), pair({ r: 0 }),
    pair({ angle: NaN }), pair({ x: 22 }), pair({ y: 530 }), pair({ id: 1 }), pair({ r: 41 })];
  for (const gates of cases) {
    const game = new Game(level({ gates })); assert.deepEqual(game.gates, []);
    assert(game.trace(0, -400).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  const game = new Game(level()); assert.equal(game.gates.length, 2); assert(game.gates.every(g => g.lastUsed === -100));
});
test('Trace has an explicit gate discontinuity and agrees with the centered live shot target', () => {
  const game = new Game(level()); const before = JSON.stringify(game.gates);
  const points = game.trace(0, -400); const exitIndex = points.findIndex(p => p.move === true);
  assert(exitIndex > 0); near(points[exitIndex - 1].x, 210); near(points[exitIndex - 1].y, 368);
  near(points[exitIndex].x, 110 + 18 + RADIUS + .1); near(points[exitIndex].y, 160);
  near(points.at(-1).x, 200 - 11 - RADIUS); near(points.at(-1).y, 160);
  assert.equal(JSON.stringify(game.gates), before); assert.equal(game.gatePasses, 0);
  assert(game.fire(0, -400));
  for (let i = 0; i < 180 && !game.buds[0].bloomed; i++) game.step(1 / 120);
  assert(game.buds[0].bloomed); assert.equal(game.gatePasses, 1);
});
test('Gate trajectories, event counts, and scoring are identical at 30, 60, and 144 FPS', () => {
  const runs = [30, 60, 144].map(fps => {
    const game = new Game(level()); game.fire(0, -400); advance(game, 2, fps);
    return { snapshot: game.snapshot(), balls: game.balls, gates: game.gates,
      events: game.drainEvents().map(e => ({ type: e.type, time: e.time })) };
  });
  assert.deepEqual(runs[0], runs[1]); assert.deepEqual(runs[0], runs[2]);
});
test('Malformed optional rules normalize to safe bounded values', () => {
  const invalid = new Game(level({ rules: { shots: NaN, ballsPerShot: Infinity, guide: null, autoBurst: 0, ballLifetime: NaN } }));
  assert.deepEqual(invalid.rules, { shots: 3, ballsPerShot: 3, guide: true, autoBurst: true, ballLifetime: 9 });
  const bounded = new Game(level({ rules: { shots: 100, ballsPerShot: -100, ballLifetime: Infinity } }));
  assert.equal(bounded.rules.shots, 9); assert.equal(bounded.rules.ballsPerShot, 1); assert.equal(bounded.rules.ballLifetime, 9);
});
const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  contract: { gatePair: 'Reciprocal partner IDs; invalid pairs are ignored together.', gateRadius: '10..40, default18; ball center crosses the rim.',
    exit: 'Partner center plus rotated unit velocity times partner radius +5.5+.1.', cooldownSeconds: .12, maximumPassesPerBall: 12,
    trace: 'Exit points have move:true; travel across the board is discontinuous.',
    moonRules: { shots: 5, ballsPerShot: 1, guide: false, autoBurst: false, ballLifetime: 7 },
    starRule: 'Three stars when shots spent <=par; two <=par+1; one otherwise. Meadow par remains1.' }, results };
fs.writeFileSync(path.join(__dirname, 'moon-engine-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
