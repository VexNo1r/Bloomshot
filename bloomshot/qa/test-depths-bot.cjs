'use strict';
// Practice-player contract checks. These validate the measurement tool, not campaign difficulty.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Bot = require('./depths-bot.cjs'), Bosses = require('../bosses.js'), Engine = require('../engine.js');
const { RushGame } = require('../rush.js');
const results = [];
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
const arena = level => new RushGame({ plan: Bot.plan(level), startWave: 10 });
const coordinates = game => game.buds.map(b => [b.id, b.x, b.y, b.r, b.hp, b.hidden, b.visible]);

test('One visible forecast table is shared by all angle candidates without moving live colliders', () => {
  const original = Bosses.predictVisible; let calls = 0;
  Bosses.predictVisible = (...args) => { calls++; return original(...args); };
  try {
    for (let level = 1; level <= 10; level++) {
      const game = arena(level), before = coordinates(game), count = calls, prepared = Bot.prepareTrace(game);
      assert.equal(calls - count, 90, 'one forecast per time slice, regardless of part count');
      for (let angle = -170; angle <= -10; angle += 2.5) {
        const hit = Bot.trace(game, angle * Math.PI / 180, 2, prepared);
        if (hit) assert([hit.time, hit.nx, hit.ny, hit.bud.x, hit.bud.y].every(Number.isFinite));
      }
      assert.equal(calls - count, 90, 'candidate traces reuse forecasts');
      assert.deepEqual(coordinates(game), before);
    }
  } finally { Bosses.predictVisible = original; }
});
test('Hidden cores are omitted while visible decoys and real hearts remain physical colliders', () => {
  const game = arena(4), prepared = Bot.prepareTrace(game), s = game.bossState;
  assert(!prepared.state.buds.some(b => b.id === s.boss.id));
  const hearts = prepared.state.buds.filter(b => b.bossPart === 'heart');
  assert.equal(hearts.length, 3); assert.equal(hearts.filter(b => b.real).length, 1);
  const fake = hearts.find(b => !b.real), real = hearts.find(b => b.real);
  assert.equal(Bot.value(game, { bud: fake, time: 0, nx: 0, ny: 1 }, .1, prepared), -1);
  assert(Bot.value(game, { bud: real, time: 0, nx: 0, ny: 1 }, .1, prepared) > 0);
});
test('Rich Fossil armor uses the actual two-ring opening rather than the legacy shell threshold', () => {
  const game = arena(6), s = game.bossState, b = s.boss, prepared = Bot.prepareTrace(game);
  b.shellAngle = Math.PI / 2; b.shellSpin = 0; s.lockAngle = Math.PI / 2; s.lockStage = 1;
  const open = { bud: { ...b }, nx: Math.sqrt(1 - .3 ** 2), ny: .3, time: 0, gateHops: 0 };
  assert(Bosses.canHit(game, open.bud, open)); assert(Bot.value(game, open, .1, prepared) > 0);
  s.lockAngle = -Math.PI / 2;
  assert.equal(Bot.value(game, open, .1, prepared), -1);
});
test('Visible ring centers receive a soft safety preference without legalizing closed gaps', () => {
  const game = arena(6), s = game.bossState, b = s.boss, prepared = Bot.prepareTrace(game);
  b.shellAngle = Math.PI / 2; b.shellSpin = 0; s.lockAngle = Math.PI / 2; s.lockStage = 1;
  const center = { bud: { ...b }, nx: 0, ny: 1, time: .5 }, edge = { ...center, nx: Math.sqrt(1 - .3 ** 2), ny: .3 };
  assert(Bot.value(game, center, .1, prepared) > Bot.value(game, edge, .1, prepared));
  assert.equal(Bot.value(game, { ...center, ny: -1 }, .1, prepared), -1);
});
test('The lit lantern is preferable to a normal body hit while an urgent escort still outranks it', () => {
  const game = arena(5); game.buds = game.buds.filter(b => b.boss || b.bossPart); game.bumpers = []; game.currents = []; game.gates = [];
  const prepared = Bot.prepareTrace(game), scores = {};
  for (let degrees = -170; degrees <= -10; degrees += .2) {
    const hit = Bot.trace(game, degrees * Math.PI / 180, 1, prepared); if (!hit) continue;
    const role = hit.bud.bossPart || 'body', score = Bot.value(game, hit, .1, prepared);
    scores[role] = Math.max(scores[role] ?? -Infinity, score);
  }
  assert(scores.lantern > scores.body, 'three-damage visible lantern is a useful tactical choice');
  const escort = { id: 'urgent', x: 50, y: game.dangerY - 18, r: 12, fall: 1, hp: 1 };
  assert(Bot.value(game, { bud: escort, time: .1, nx: 0, ny: 1 }, .1, prepared) > scores.lantern);
});
test('Tunnel forecast preserves actual exit rotation, cooldown and gate provenance', () => {
  const level = { id: 'bot-tunnel', buds: [{ id: 'target', x: 280, y: 110, r: 18, hp: 2 }], bumpers: [],
    launcher: { x: 210, y: 498 }, rules: { shots: 1, ballsPerShot: 1 },
    gates: [{ id: 'a', pair: 'b', x: 210, y: 370, r: 18, angle: 0 }, { id: 'b', pair: 'a', x: 280, y: 240, r: 18, angle: 0 }] };
  const game = new Engine.Game(level), predicted = Bot.trace(game, -Math.PI / 2, 2);
  assert(predicted && predicted.bud.id === 'target'); assert.equal(predicted.gateHops, 1);
  let actual = null; const strike = game.strike.bind(game);
  game.strike = bud => { if (!actual) actual = { id: bud.id, hops: game.ball.gateHops, time: game.time }; return strike(bud); };
  assert(game.fire(0, -1));
  for (let frame = 0; frame < 180 && !actual; frame++) game.step(1 / 120);
  assert(actual); assert.equal(actual.id, predicted.bud.id); assert.equal(actual.hops, predicted.gateHops);
  assert(Math.abs(actual.time - predicted.time) <= 1 / 60, 'actual impact occurs in the forecast frame');
});
test('Ember tunnel eligibility and dark satellite selection follow visible encounter state', () => {
  const ember = arena(7), prepared = Bot.prepareTrace(ember), b = ember.bossState.boss;
  const hit = { bud: { ...b }, time: .3, nx: 0, ny: 1, gateHops: 0 };
  assert.equal(Bot.value(ember, hit, .1, prepared), -1); hit.gateHops = 1;
  assert(Bot.value(ember, hit, .1, prepared) > 0);
  const core = arena(10), stars = Bot.prepareTrace(core), dark = stars.state.buds.find(p => p.bossPart === 'satellite' && !p.lit);
  assert(dark); assert.equal(Bot.value(core, { bud: dark, time: .3, nx: 0, ny: 1 }, .1, stars), -1);
});
test('Identical seeds produce identical measured results without using powerups', () => {
  const options = { seed: 9173, startWave: 10, noise: 4, think: .5, thinkSpread: .5, bounces: 1 };
  const first = Bot.play(1, options), second = Bot.play(1, options);
  assert.deepEqual(first, second); assert.equal(first.powersUsed, 0);
  assert(first.bossWon && first.bossP === +(first.bossLivesLost + first.bossKillSeconds / 50).toFixed(4));
});
test('Deliberate spam policies keep a fixed bank or alternate banks on each tap', () => {
  const original = RushGame.prototype.fire, angles = [];
  RushGame.prototype.fire = function(dx, dy, held) { angles.push(+((Math.atan2(dy, dx) * 180 / Math.PI).toFixed(5))); return original.call(this, dx, dy, held); };
  try {
    const fixed = Bot.mash(1, { mode: 'fixed', angle: -155, maxTime: .5 });
    assert(angles.length >= 3); assert(angles.every(a => a === -155)); assert.equal(fixed.powersUsed, 0);
    angles.length = 0; Bot.mash(1, { mode: 'banks', leftAngle: -155, rightAngle: -25, maxTime: .5 });
    assert(angles.length >= 3); assert(angles.every((a, i) => a === (i % 2 ? -25 : -155)));
  } finally { RushGame.prototype.fire = original; }
});
const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'depths-bot-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
