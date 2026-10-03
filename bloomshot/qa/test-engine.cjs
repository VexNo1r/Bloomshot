'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Game, circleHit, capsuleHit, BOUNDS, RADIUS } = require('../engine.js');
const { levels, dailyLevel } = require('../levels.js');
const solutions = require('./solutions.json');
const results = [];
const near = (actual, expected, epsilon = 1e-8) => assert(Math.abs(actual - expected) < epsilon, `${actual} ~= ${expected}`);
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}
function fixture(buds, bumpers = []) {
  return { id: 'test', name: 'Test', buds, bumpers, launcher: { x: 210, y: 498 } };
}
function bud(id, x, y, group) { return { id, x, y, r: 13, type: 'gold', ...(group ? { group } : {}) }; }
function settle(g, dt = 1 / 60) {
  let frames = 0;
  while ((g.status === 'flying' || g.pending.length) && frames++ < 3000) g.step(dt);
  assert(frames < 3000, 'shot exceeded frame budget');
}
function fireSingle(g) {
  assert(g.fire(0, -1));
  g.pendingBalls = [];
  g.spawnBall({ x: g.launcher.x, y: g.launcher.y, angle: -Math.PI / 2, type: 'gold' });
}

test('Swept circle finds mid-segment, tangent, and moving-away cases', () => {
  const h = circleHit({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, 10);
  near(h.t, 0.4); near(h.nx, -1); near(h.ny, 0);
  const tangent = circleHit({ x: 0, y: 10 }, { x: 100, y: 0 }, { x: 50, y: 0 }, 10);
  near(tangent.t, 0.5); near(tangent.ny, 1);
  assert.equal(circleHit({ x: 0, y: 0 }, { x: -100, y: 0 }, { x: 50, y: 0 }, 10), null);
});

test('Swept paddle face, quarter-turn, and end cap intersections', () => {
  const paddle = { x: 50, y: 50, length: 40, angle: 0 };
  const face = capsuleHit({ x: 50, y: 100 }, { x: 0, y: -100 }, paddle, 10);
  near(face.t, 0.4); near(face.ny, 1);
  const end = capsuleHit({ x: 70, y: 100 }, { x: 0, y: -100 }, paddle, 10);
  near(end.t, 0.4);
  const turned = capsuleHit({ x: 0, y: 50 }, { x: 100, y: 0 }, { ...paddle, angle: Math.PI / 2 }, 10);
  near(turned.t, 0.4); near(turned.nx, -1);
});

test('A fast ball cannot tunnel through a bud between frame endpoints', () => {
  const g = new Game(fixture([bud('target', 200, 200), bud('other', 70, 75)]));
  fireSingle(g);
  Object.assign(g.ball, { x: 50, y: 200, vx: 10000, vy: 0 });
  g.step(1 / 60);
  assert(g.buds[0].bloomed); assert(g.ball.vx < 0); assert.equal(g.bloomedCount, 1);
});

test('Side walls and a simultaneous top corner reflect inward', () => {
  const g = new Game(fixture([bud('other', 210, 200)])); fireSingle(g);
  Object.assign(g.ball, { x: 30, y: 30, vx: -430, vy: -430 });
  g.step(1 / 60);
  assert(g.ball.vx > 0 && g.ball.vy > 0);
  assert(g.ball.x >= BOUNDS.left + RADIUS && g.ball.y >= BOUNDS.top + RADIUS);
});

test('An actual fast shot reflects from the paddle capsule', () => {
  const g = new Game(fixture([bud('other', 80, 80)], [{ id: 'petal', x: 210, y: 200, length: 64, angle: 0 }]));
  fireSingle(g); Object.assign(g.ball, { x: 210, y: 250, vx: 0, vy: -2000 });
  g.step(0.04); assert(g.ball.vy > 0); assert(g.events.some(e => e.type === 'bounce' && e.kind === 'bumper'));
});

test('Only one petal rotation is permitted before each shot', () => {
  const g = new Game(levels[0]); const a = g.bumpers[0].angle;
  assert.equal(g.rotate('missing'), false); assert.equal(g.rotationUsed, false);
  assert(g.rotate('petal')); near(g.bumpers[0].angle, (a + Math.PI / 2) % (2 * Math.PI));
  assert.equal(g.rotate('petal'), false);
  fireSingle(g); assert.equal(g.rotate('petal'), false);
  g.ball.y = BOUNDS.bottom + 20; g.step(1 / 120);
  assert.equal(g.status, 'aiming'); assert.equal(g.rotationUsed, false); assert(g.rotate('petal'));
});

test('Invalid shots and steps do not consume seeds or corrupt state', () => {
  const g = new Game(levels[0]);
  for (const pair of [[0, 0], [0, 1], [1, 0], [NaN, -1], [Infinity, -1]]) assert.equal(g.fire(...pair), false);
  for (const dt of [0, -1, NaN, Infinity]) g.step(dt);
  assert.equal(g.shotsLeft, 3); assert.equal(g.time, 0); assert.equal(g.status, 'aiming');
  assert(g.fire(0, -1)); assert.equal(g.fire(0, -1), false); assert.equal(g.shotsLeft, 2);
});

test('Direct hits, queued cascades, and repeated wins never award twice', () => {
  const g = new Game(fixture([0, 1, 2, 3, 4, 5].map(i => bud('b' + i, 80 + i * 45, 150, i < 3 ? 'a' : 'b'))));
  g.fire(0, -1);
  for (const b of g.buds) { g.bloom(b); g.bloom(b); }
  g.step(1 / 60);
  const wonScore = g.score;
  for (let i = 0; i < 120; i++) g.step(1 / 60);
  for (const b of g.buds) g.bloom(b);
  g.win(); g.win();
  assert.equal(g.score, wonScore); assert.equal(g.score, 1700);
  assert.equal(g.events.filter(e => e.type === 'bloom').length, g.buds.length);
  assert.equal(g.events.filter(e => e.type === 'won').length, 1);
});

test('Layered buds crack, bloom on the final hit, and cannot award again', () => {
  const g = new Game(fixture([{ ...bud('layered', 210, 200), hp: 3 }, bud('remote', 70, 75)]));
  const target = g.buds[0];
  g.strike(target); assert.equal(target.hp, 2); assert.equal(target.bloomed, false); assert.equal(g.combo, 0);
  g.strike(target); assert.equal(target.hp, 1); assert.equal(target.bloomed, false); assert.equal(g.combo, 0);
  g.strike(target); assert.equal(target.bloomed, true); assert.equal(g.combo, 1);
  const score = g.score; g.strike(target); g.strike(target, true); assert.equal(g.score, score);
  assert.equal(g.events.filter(e => e.type === 'crack').length, 2);
  assert.equal(g.events.filter(e => e.type === 'bloom').length, 1);
});

test('A linked cascade damages a layered sibling without bypassing its hp', () => {
  const g = new Game(fixture([bud('trigger', 180, 200, 'a'), { ...bud('layered', 210, 200, 'a'), hp: 3 }, bud('remote', 70, 75)]));
  g.strike(g.buds[0]);
  assert.equal(g.pending.length, 1);
  for (let i = 0; i < 20; i++) g.step(1 / 120);
  assert.equal(g.pending.length, 0); assert.equal(g.buds[1].hp, 2); assert.equal(g.buds[1].bloomed, false);
  assert.equal(g.bloomedCount, 1);
});

test('Three missed seeds end the game and a retry starts fresh', () => {
  const level = fixture([bud('remote', 70, 75)]), g = new Game(level);
  for (let i = 0; i < 3; i++) { assert(g.fire(0, -1)); settle(g); }
  assert.equal(g.status, 'lost'); assert.equal(g.shotsLeft, 0); assert.equal(g.fire(0, -1), false);
  const retry = new Game(level);
  assert.equal(retry.status, 'aiming'); assert.equal(retry.shotsLeft, 3); assert.equal(retry.score, 0);
  assert.equal(retry.bloomedCount, 0); assert.equal(retry.time, 0); assert.equal(retry.rotationUsed, false);
  assert.equal(level.buds[0].bloomed, undefined);
});

test('The last seed still ends in loss after a pending partial cascade settles', () => {
  const buds = [0, 1, 2, 3, 4, 5].map(i => bud('linked-' + i, 70 + i * 45, 180, 'a'));
  buds.push(bud('unreached', 210, 75));
  const g = new Game(fixture(buds)); fireSingle(g); g.shotsLeft = 0;
  g.bloom(g.buds[0]); g.ball.y = BOUNDS.bottom + 20;
  g.step(1 / 120); settle(g);
  assert.equal(g.bloomedCount, 6); assert.equal(g.status, 'lost');
});

test('A volley schedules three staggered balls and consumes one volley', () => {
  const g = new Game(fixture([bud('remote', 70, 75)]));
  assert(g.fire(0, -1)); assert.equal(g.shotsLeft, 2); assert.equal(g.pendingBalls.length, 3);
  assert.equal(g.balls.length, 0);
  const times = g.pendingBalls.map(b => b.when);
  for (let i = 1; i < times.length; i++) assert(times[i] > times[i - 1]);
  for (let i = 0; i < 30; i++) g.step(1 / 60);
  assert.equal(g.balls.length, 3); assert.equal(g.pendingBalls.length, 0);
  assert.equal(new Set(g.balls.map(b => b.id)).size, 3);
});

test('Burst scheduling and spawning respect the five-ball cap', () => {
  const g = new Game(fixture(Array.from({ length: 100 }, (_, i) => bud('b' + i, 70 + i % 10 * 27, 100 + Math.floor(i / 10) * 24))));
  g.fire(0, -1);
  for (let i = 0; i < 90; i++) {
    g.bloom(g.buds[i]);
    assert(g.balls.length + g.pendingBalls.length <= 5);
  }
  for (let i = 0; i < 200; i++) { g.step(1 / 120); assert(g.balls.length <= 5); }
  const direct = new Game(fixture([bud('remote', 70, 75)]));
  for (let i = 0; i < 30; i++) direct.spawnBall({ x: 210, y: 350, angle: -Math.PI / 2 });
  assert.equal(direct.balls.length, 5);
});

test('Guiding changes the path, preserves speed, drains, releases, and refills', () => {
  const level = fixture([bud('remote', 70, 75)]), guided = new Game(level), plain = new Game(level);
  guided.guide({ x: 390, y: 200 }); assert.equal(guided.guideTarget, null);
  fireSingle(guided); fireSingle(plain);
  guided.guide({ x: 1000, y: -100 });
  assert.deepEqual(guided.guideTarget, { x: 390, y: 30 });
  for (let i = 0; i < 12; i++) { guided.step(1 / 120); plain.step(1 / 120); }
  assert(guided.ball.vx > plain.ball.vx + 1); assert(guided.ball.x > plain.ball.x);
  near(Math.hypot(guided.ball.vx, guided.ball.vy), guided.ball.speed, 1e-6);
  assert(guided.guideCharge < 1 && guided.guideCharge > 0);
  guided.guide(null); assert.equal(guided.guideTarget, null);
  const pausedCharge = guided.guideCharge; guided.step(1 / 120); near(guided.guideCharge, pausedCharge);
  guided.guide({ x: 390, y: 100 }); guided.guideCharge = 0.001; guided.step(1 / 120);
  assert.equal(guided.guideCharge, 0); assert.equal(guided.guideTarget, null);
  guided.guide({ x: 390, y: 100 }); assert.equal(guided.guideTarget, null);
  guided.finishShot(); assert.equal(guided.status, 'aiming'); assert(guided.fire(0, -1));
  assert.equal(guided.guideCharge, 1);
});

test('Level speed increases and a daily garden preserves source speed', () => {
  for (let i = 0; i < levels.length; i++) assert.equal(new Game(levels[i]).speed, 420 + i * 10);
  for (const daily of solutions.daily) {
    const level = dailyLevel(daily.date);
    assert.equal(new Game(level).speed, new Game(levels.find(l => l.id === level.sourceLevelId)).speed);
  }
});

for (const fps of [30, 60, 144]) {
  test(`All 18 stored solutions win at ${fps} FPS`, () => {
    const failures = [];
    for (const solution of solutions.levels) {
      const g = new Game(levels.find(l => l.id === solution.id));
      for (const shot of solution.shots) {
        if (shot.rotate) assert(g.rotate(shot.bumperId));
        assert(g.fire(Math.cos(shot.angleRadians), Math.sin(shot.angleRadians))); settle(g, 1 / fps);
      }
      if (g.status !== 'won' || g.score !== solution.score) failures.push({ id: solution.id, status: g.status, blooms: g.bloomedCount, score: g.score, expectedScore: solution.score });
    }
    assert.deepEqual(failures, []);
  });
}

test('All 12 daily mirror solutions replay at 60 FPS', () => {
  for (const daily of solutions.daily) {
    const g = new Game(dailyLevel(daily.date));
    for (const shot of daily.shots) {
      if (shot.rotate) assert(g.rotate(shot.bumperId));
      assert(g.fire(Math.cos(shot.angleRadians), Math.sin(shot.angleRadians))); settle(g);
    }
    assert.equal(g.status, 'won');
  }
});

const report = { runAt: new Date().toISOString(), passed: results.filter(r => r.passed).length,
  failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'engine-test-results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
