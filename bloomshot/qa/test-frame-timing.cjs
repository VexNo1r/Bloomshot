'use strict';
// Rolling delivered-frame measurements and the real fixed-step/render residual. No browser, timers or saves.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Feel = require('../feel.js'), Engine = require('../engine.js'), results = [];
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
const near = (actual, expected, epsilon = 1e-7) => assert(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
function stream(meter, intervals, cpus = intervals.map(() => 2), start = 0) {
  let timestamp = start; meter.sample(timestamp, 0);
  intervals.forEach((interval, i) => { timestamp += interval; meter.sample(timestamp, cpus[i]); });
  return timestamp;
}
const empty = { targetFps: 60, measuredFps: 0, intervalP95Ms: 0, cpuP95Ms: 0, slowFrames: 0, missedRefreshEstimate: 0, samples: 0, sampleSeconds: 0 };

test('A real 60 Hz timestamp stream is measured at 60 FPS with zero CPU allowed', () => {
  const meter = Feel.createFrameMeter(); assert.deepEqual(meter.snapshot(), empty);
  stream(meter, Array(120).fill(1000 / 60), Array(120).fill(0)); const result = meter.snapshot();
  near(result.measuredFps, 60); near(result.intervalP95Ms, 1000 / 60); near(result.sampleSeconds, 2);
  assert.equal(result.cpuP95Ms, 0); assert.equal(result.samples, 120); assert.equal(result.slowFrames, 0); assert.equal(result.missedRefreshEstimate, 0);
});
test('A 30 FPS stream reports missed refreshes instead of claiming the 60 FPS target was achieved', () => {
  const meter = Feel.createFrameMeter(); stream(meter, Array(60).fill(1000 / 30)); const result = meter.snapshot();
  assert.equal(result.targetFps, 60); near(result.measuredFps, 30); assert.equal(result.slowFrames, 60); assert.equal(result.missedRefreshEstimate, 60);
});
test('A 120 FPS stream remains 120 FPS and a configurable target changes the missed-refresh estimate', () => {
  const meter = Feel.createFrameMeter(); stream(meter, Array(120).fill(1000 / 120)); const result = meter.snapshot();
  near(result.measuredFps, 120); assert.equal(result.targetFps, 60); assert.equal(result.slowFrames, 0); assert.equal(result.missedRefreshEstimate, 0);
  const high = Feel.createFrameMeter({ target: 120 }); stream(high, Array(20).fill(1000 / 60));
  assert.equal(high.snapshot().targetFps, 120); assert.equal(high.snapshot().slowFrames, 20); assert.equal(high.snapshot().missedRefreshEstimate, 20);
});
test('Long active hitches over 250 ms and one second count honestly in the rolling FPS and P95', () => {
  const meter = Feel.createFrameMeter(); stream(meter, [20, 500, 2000, 20], [1, 80, 120, 2]); const result = meter.snapshot();
  near(result.measuredFps, 4000 / 2540); near(result.sampleSeconds, 2.54); assert.equal(result.intervalP95Ms, 2000); assert.equal(result.cpuP95Ms, 120);
  assert.equal(result.slowFrames, 2); assert.equal(result.missedRefreshEstimate, 148);
});
test('Pause/hidden samples retain the display window and omit the resume interval', () => {
  const meter = Feel.createFrameMeter(), end = stream(meter, [20, 20], [1, 2]), before = meter.snapshot();
  assert.equal(meter.sample(end + 10000, 999, false), false); assert.deepEqual(meter.snapshot(), before);
  assert.equal(meter.sample(end + 20000, 4), false); assert.deepEqual(meter.snapshot(), before);
  meter.sample(end + 20020, 3); const after = meter.snapshot(); assert.equal(after.samples, 3); near(after.measuredFps, 50); assert.equal(after.cpuP95Ms, 3);
});
test('Ring eviction removes old intervals, CPU spikes and missed-refresh counts together', () => {
  const meter = Feel.createFrameMeter({ capacity: 3 }); stream(meter, [500, 10, 10, 20], [200, 1, 2, 3]);
  const result = meter.snapshot(); assert.equal(result.samples, 3); near(result.measuredFps, 75); near(result.sampleSeconds, .04);
  assert.equal(result.intervalP95Ms, 20); assert.equal(result.cpuP95Ms, 3); assert.equal(result.slowFrames, 0); assert.equal(result.missedRefreshEstimate, 0);
});
test('Snapshots do not reorder the rolling ring or expose its storage', () => {
  const meter = Feel.createFrameMeter({ capacity: 3 }); let end = stream(meter, [10, 30, 20], [1, 3, 2]);
  const first = meter.snapshot(); first.measuredFps = -1; first.samples = -1;
  meter.sample(end + 40, 4); const result = meter.snapshot(); near(result.measuredFps, 1000 * 3 / 90); assert.equal(result.cpuP95Ms, 4); assert.equal(result.intervalP95Ms, 40);
});
test('Reset empties observations and the next active timestamp only anchors the clock', () => {
  const meter = Feel.createFrameMeter(); stream(meter, [500, 20]); meter.reset(); assert.deepEqual(meter.snapshot(), empty);
  assert.equal(meter.sample(3000, 2), false); assert.deepEqual(meter.snapshot(), empty); meter.sample(3020, 3); near(meter.snapshot().measuredFps, 50);
});
test('Invalid inputs cannot introduce NaN, negative time or a fabricated resume interval', () => {
  const meter = Feel.createFrameMeter(); stream(meter, [20]); const before = meter.snapshot();
  for (const [time, cpu] of [[NaN, 1], [Infinity, 1], [-1, 1], [100, NaN], [100, Infinity], [100, -1], ['100', 1]]) {
    assert.equal(meter.sample(time, cpu), false); assert.deepEqual(meter.snapshot(), before);
    assert.equal(meter.sample(200, 2), false, 'a valid timestamp after invalid input only anchors');
  }
  meter.sample(200, 2); meter.sample(190, 2); assert.deepEqual(meter.snapshot(), before);
  meter.sample(210, 2); assert.equal(meter.snapshot().samples, 2); assert(Object.values(meter.snapshot()).every(Number.isFinite));
});
test('A clock discontinuity over one minute is skipped while the following active interval remains usable', () => {
  const meter = Feel.createFrameMeter(); stream(meter, [20]); assert.equal(meter.sample(100000, 1), false);
  meter.sample(100020, 2); near(meter.snapshot().measuredFps, 50); assert.equal(meter.snapshot().samples, 2);
});
test('Capacity defaults to 600 and sampling reuses exactly two typed-array allocations', () => {
  let allocations = 0;
  class Ring extends Float64Array { constructor(size) { super(size); allocations++; } }
  const scope = vm.createContext({ module: { exports: {} }, Float64Array: Ring });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../feel.js'), 'utf8'), scope);
  const meter = scope.module.exports.createFrameMeter(); assert.equal(allocations, 2);
  meter.sample(0, 0); for (let i = 1; i <= 1000; i++) meter.sample(i * 20, 1);
  assert.equal(allocations, 2, 'sample never reallocates either ring'); assert.equal(meter.snapshot().samples, 600);
  for (const options of [{ capacity: 0 }, { capacity: Infinity }, { target: 0 }, { target: NaN }]) assert.equal(Feel.createFrameMeter(options).snapshot().targetFps, 60);
});

function drawnPosition(Art, ball, alpha, time = 1) {
  const translations = [], noop = () => {}, gradient = { addColorStop: noop };
  const ctx = new Proxy({ globalAlpha: 1, translate: (x, y) => translations.push([x, y]), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (value, name) => name in value ? value[name] : noop });
  Art.draw(ctx, { mode: 'rush', buds: [], balls: [ball], bumpers: [], particles: [], floaters: [], launcher: { x: 210, y: 498 } }, time, { interpolation: alpha, reducedMotion: true, backdrop: false });
  return translations.at(-1);
}
function art() { const scope = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8'), scope); return scope.BloomArt; }

test('Real 120 Hz physics quantizes near-60 Hz frames; interpolation smooths free flight without predicting collisions', () => {
  const game = new Engine.Game({ id: 'frame-pacing', name: 'Frame pacing', buds: [{ id: 'far', x: 50, y: 70, r: 11, type: 'gold' }], bumpers: [] });
  game.fire(0, -1); let accumulator = 0, previous, stepDistances = [], drawnDistances = [];
  // Use the shipped art entry point. A recording context captures the projectile's body translation.
  const Art = art();
  for (let frame = 0; frame < 36; frame++) {
    accumulator += [16.7, 16.6, 16.7][frame % 3] / 1000;
    while (accumulator >= 1 / 120) { game.step(1 / 120); accumulator -= 1 / 120; }
    const ball = game.balls[0], before = JSON.stringify(ball), alpha = accumulator * 120, y = drawnPosition(Art, ball, alpha, game.time)[1];
    assert.equal(JSON.stringify(ball), before, 'drawing never advances the real collider or its trail');
    near(y, ball.trail.at(-1).y * (1 - alpha) + ball.y * alpha);
    if (previous) { stepDistances.push(Math.abs(ball.y - previous.y)); drawnDistances.push(Math.abs(y - previous.drawn)); }
    previous = { y: ball.y, drawn: y };
  }
  const range = list => Math.max(...list) - Math.min(...list);
  assert(range(stepDistances) > 6, 'fixed snapshots really repeat one/three ticks under near-even frame delivery');
  assert(range(drawnDistances) < .05, 'residual free-flight movement follows delivered time instead of step quantization');
});

test('Wall rebounds stay between resolved positions and drawing cannot cross the wall ahead of physics', () => {
  const game = new Engine.Game({ id: 1, buds: [{ x: 50, y: 70 }], bumpers: [] }); game.fire(0, -1); game.step(1 / 120);
  const ball = game.balls[0], Art = art();
  ball.x = Engine.BOUNDS.right - Engine.RADIUS - 1; ball.y = 300; ball.vx = game.speed; ball.vy = 0;
  game.step(1 / 120); assert(ball.vx < 0, 'actual engine reflected the shot');
  const before = JSON.stringify(ball), previous = ball.trail.at(-1);
  for (const alpha of [0, .1, .5, 1]) {
    const [x, y] = drawnPosition(Art, ball, alpha);
    assert(x <= Engine.BOUNDS.right - Engine.RADIUS + 1e-6); near(x, previous.x * (1 - alpha) + ball.x * alpha); near(y, ball.y);
  }
  assert.equal(JSON.stringify(ball), before);
});

test('Newborn seeds and an actual Moon gate exit draw directly until a resolved trail segment exists', () => {
  const Art = art(), game = new Engine.Game(require('../moon.js').levels[0]); game.fire(0, -1); game.step(1 / 120);
  const ball = game.balls[0];
  const newborn = { ...ball, trail: [] }; assert.deepEqual(drawnPosition(Art, newborn, .5), [newborn.x, newborn.y]);
  ball.x = 210; ball.y = 405; ball.vx = 0; ball.vy = -game.speed;
  game.step(1 / 120); assert.equal(game.gatePasses, 1); assert.equal(ball.trail.length, 0, 'the real tunnel discards the old trail');
  assert.deepEqual(drawnPosition(Art, ball, .25), [ball.x, ball.y], 'no interpolation across the tunnel gap');
  game.step(1 / 120); const [x, y] = drawnPosition(Art, ball, .5);
  near(x, (ball.trail.at(-1).x + ball.x) / 2); near(y, (ball.trail.at(-1).y + ball.y) / 2);
});

const report = { passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length,
  limitations: ['Frame callback observations are not a guarantee of presented frames, a target rate, or an installed-device result.', 'Presentation interpolates resolved positions up to one 120 Hz tick behind physics; no game rules or collision queries change.'], results };
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
