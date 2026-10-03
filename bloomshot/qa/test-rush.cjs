'use strict';
const assert = require('assert');
const { RushGame } = require('../rush.js');
const { earliest } = require('../engine.js');
const results = [], observations = {};
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}
function advance(game, seconds, fps = 120) {
  for (let i = 0; i < Math.round(seconds * fps); i++) game.step(1 / fps);
}
function activeEmpty() {
  const game = new RushGame(); game.started = true; game.status = 'flying'; return game;
}
function clearWave(game) {
  for (const bud of game.buds) while (!bud.bloomed) game.strike(bud, true);
  advance(game, 0.8);
}
function compact(game) {
  return { ...game.snapshot(), buds: game.snapshot().buds,
    activeBalls: game.balls.map(({ x, y, vx, vy, age }) => ({ x, y, vx, vy, age })) };
}

test('Uses exported swept collision helper and preserves campaign API', () => {
  assert.equal(typeof earliest, 'function');
  const game = new RushGame();
  assert.equal(game.mode, 'rush'); assert.equal(game.level.id, 'rush'); assert.equal(game.lives, 3);
  assert.equal(game.status, 'aiming'); assert.equal(game.wave, 1); assert.equal(game.stars, 0);
  assert.equal(game.shotsLeft, 3); assert.equal(game.buds.length, 12);
  assert.equal(game.buds.filter(b => b.relay).length, 4);
  assert(game.trace(0, -300).length >= 2);
});

test('Nothing starts, drifts, or fires before the first launch', () => {
  const game = new RushGame(), initial = game.buds.map(b => ({ x: b.x, y: b.y }));
  advance(game, 60);
  assert.equal(game.started, false); assert.equal(game.elapsed, 0); assert.equal(game.wave, 1);
  assert.equal(game.lives, 3); assert.equal(game.balls.length, 0); assert.equal(game.ballSerial, 0);
  assert.deepEqual(game.buds.map(b => ({ x: b.x, y: b.y })), initial);
});

test('One press launches one ball; cooldown blocks repeats and allows active firing', () => {
  const game = new RushGame();
  assert(game.fire(-1, -3)); assert.equal(game.balls.length, 1); assert.equal(game.ballSerial, 1);
  assert.equal(game.pendingBalls.length, 0); assert.equal(game.fire(1, -3), false);
  advance(game, 0.64); assert.equal(game.fire(1, -3), false);
  advance(game, 0.02); assert(game.fire(1, -3)); assert.equal(game.ballSerial, 2);
  assert.equal(game.status, 'flying'); assert.equal(game.shotsLeft, 3);
  assert.equal(game.events.filter(e => e.type === 'launch').length, 2);
});

test('Steering is disabled and cannot change trajectories or supply charge', () => {
  const guided = new RushGame(), plain = new RushGame();
  guided.fire(-1, -3); plain.fire(-1, -3);
  for (let i = 0; i < 240; i++) {
    guided.guide({ x: 390, y: 90 }); guided.step(1 / 120); plain.step(1 / 120);
  }
  assert.equal(guided.guideCharge, 0); assert.equal(guided.guideTarget, null);
  assert.deepEqual(compact(guided), compact(plain));
});

test('Ordinary buds do not start a cascade or create automatic balls', () => {
  const game = activeEmpty(), ordinary = game.buds.find(b => !b.relay);
  game.strike(ordinary);
  advance(game, 0.3);
  assert.equal(game.bloomedCount, 1); assert.equal(game.pending.length, 0);
  assert.equal(game.balls.length, 0); assert.equal(game.ballSerial, 0);
  assert.equal(game.directHits, 1); assert.equal(game.splitCharge, 1 / 6);
});

test('Only a final relay hit chains at most two neighbors and chains do not charge split', () => {
  const game = activeEmpty(), relay = game.buds.find(b => b.relay);
  relay.hp = relay.maxHp = 2;
  game.strike(relay); assert.equal(game.pending.length, 0); assert.equal(relay.bloomed, false);
  game.strike(relay); assert.equal(game.pending.length, 2);
  advance(game, 0.3);
  assert.equal(game.bloomedCount, 3); assert.equal(game.directHits, 2);
  assert.equal(game.splitCharge, 2 / 6); assert.equal(game.pending.length, 0);
  assert.equal(game.events.filter(e => e.type === 'bloom' && e.chain).length, 2);
  assert.equal(game.balls.length, 0); assert.equal(game.ballSerial, 0);
});

test('Manual split needs six direct hits, adds two balls, consumes charge, and respects cap', () => {
  const game = new RushGame(); game.fire(0, -1);
  assert.equal(game.split(), false);
  const ordinary = game.buds.filter(b => !b.relay);
  for (let i = 0; i < 5; i++) game.strike(ordinary[i]);
  assert.equal(game.splitReady, false); assert.equal(game.split(), false);
  game.strike(ordinary[5]);
  assert.equal(game.splitCharge, 1); assert.equal(game.splitReady, true); assert.equal(game.balls.length, 1);
  const sourceAngle = Math.atan2(game.ball.vy, game.ball.vx);
  assert(game.split()); assert.equal(game.balls.length, 3); assert.equal(game.splitCharge, 0);
  for (let i = 1; i < 3; i++) {
    const expected = sourceAngle + (i === 1 ? -0.30 : 0.30);
    assert(Math.abs(Math.atan2(game.balls[i].vy, game.balls[i].vx) - expected) < 1e-8);
  }
  game.splitCharge = 1;
  game.spawnBall({ x: 210, y: 498, angle: -Math.PI / 2 });
  assert.equal(game.splitReady, false); assert.equal(game.split(), false); assert.equal(game.splitCharge, 1);
  game.spawnBall({ x: 210, y: 498, angle: -Math.PI / 2 });
  assert.equal(game.balls.length, 5); assert.equal(game.spawnBall({ x: 210, y: 498, angle: -Math.PI / 2 }), false);
  game.fireCooldown = 0; assert.equal(game.fire(0, -1), false);
});

test('Petal rotation uses a two-second cooldown even while the run is active', () => {
  const game = new RushGame();
  assert.equal(game.rotate('missing'), false); assert(game.rotate('petal'));
  assert.equal(game.rotateCooldown, 2); assert.equal(game.rotate('petal'), false);
  advance(game, 2); assert(game.rotate('petal'));
  game.fire(0, -1); assert.equal(game.rotate('petal'), false);
  advance(game, 2); assert(game.rotate('petal'));
});

test('A breached cluster costs exactly one life and removes the entire cluster', () => {
  const game = activeEmpty(), group = game.buds[0].group;
  const ids = game.buds.filter(b => b.group === group).map(b => b.id);
  for (const bud of game.buds.filter(b => b.group === group)) bud.y = game.dangerY + 1;
  game.pending.push({ id: ids[1], when: game.time + 5 });
  game.step(1 / 120);
  assert.equal(game.lives, 2); assert.equal(game.waveBreaches, 1);
  assert.equal(game.buds.some(b => b.group === group), false); assert.equal(game.pending.length, 0);
  advance(game, 1); assert.equal(game.lives, 2);
  assert.equal(game.events.filter(e => e.type === 'life').length, 1);
  assert.equal(game.bloomedCount, 0);
});

test('Three breaches end the run once and time continues for the result animation', () => {
  const game = activeEmpty();
  for (const bud of game.buds) bud.y = game.dangerY + 1;
  game.step(1 / 120);
  assert.equal(game.lives, 0); assert.equal(game.status, 'lost'); assert.equal(game.waveBreaches, 3);
  assert.equal(game.events.filter(e => e.type === 'life').length, 3);
  assert.equal(game.events.filter(e => e.type === 'lost').length, 1);
  const elapsed = game.elapsed, time = game.time;
  advance(game, 2); assert.equal(game.elapsed, elapsed); assert(game.time > time);
  assert.equal(game.events.filter(e => e.type === 'lost').length, 1);
  assert.equal(game.fire(0, -1), false); assert.equal(game.rotate('petal'), false); assert.equal(game.split(), false);
});

test('Clearing a wave continues the run and progressively increases bounded pressure', () => {
  const game = activeEmpty();
  for (let wave = 1; wave <= 14; wave++) {
    const before = game.bloomedCount;
    clearWave(game);
    assert.equal(game.wave, wave + 1); assert.equal(game.status, 'flying'); assert.equal(game.lives, 3);
    assert(game.bloomedCount > before);
    assert.equal(game.buds.filter(b => b.relay).length, game.buds.length / 3);
    assert(game.buds.length >= 18 && game.buds.length <= 24);
    assert(game.speed >= 460 && game.speed <= 650); assert(game.descentSpeed <= 32);
    assert(game.buds.every(b => b.hp >= 1 && b.hp <= 2));
  }
  assert.equal(game.speed, 650); assert.equal(game.descentSpeed, 32);
  assert.equal(game.events.filter(e => e.type === 'wave').length, 14);
  assert.equal(game.events.some(e => e.type === 'won'), false);
});

test('Combo expires after an input gap and repeated hits on open buds never score', () => {
  const game = activeEmpty(), ordinary = game.buds.filter(b => !b.relay);
  game.strike(ordinary[0]); game.strike(ordinary[1]); assert.equal(game.combo, 2);
  const score = game.score, hits = game.directHits;
  game.strike(ordinary[0]); assert.equal(game.score, score); assert.equal(game.directHits, hits);
  advance(game, 1.2); assert.equal(game.combo, 0);
  game.strike(ordinary[2]); assert.equal(game.combo, 1); assert.equal(game.bestCombo, 2);
});

test('Fast ball collision uses the moved target and cannot tunnel through it', () => {
  const game = activeEmpty();
  game.buds = [{ id: 'target', group: 'only', x: 210, y: 200, r: 11, hp: 1, maxHp: 1, relay: false, type: 'gold', bloomed: false }];
  game.spawnBall({ x: 210, y: 230, angle: -Math.PI / 2, speed: 5000 });
  game.step(1 / 120);
  assert.equal(game.bloomedCount, 1); assert.equal(game.directHits, 1); assert(game.ball.vy > 0);
});

test('Passive play after one launch loses without any automatic balls or shots', () => {
  const game = new RushGame(); game.fire(0, -1);
  let maximumBalls = 0;
  for (let i = 0; i < 90 * 120; i++) { game.step(1 / 120); maximumBalls = Math.max(maximumBalls, game.balls.length); }
  assert.equal(game.status, 'lost'); assert.equal(game.lives, 0); assert(game.elapsed < 60);
  assert.equal(game.ballSerial, 1); assert.equal(game.events.filter(e => e.type === 'launch').length, 1);
  assert(maximumBalls <= 1); assert.equal(game.balls.length, 0);
  observations.passive = { lostAtSeconds: game.elapsed, wave: game.wave, blooms: game.bloomedCount, maximumBalls };
});

test('Fixed input times produce identical outcomes at 30, 60, and 144 FPS', () => {
  function replay(fps) {
    const game = new RushGame();
    for (let frame = 0; frame < fps * 15; frame++) {
      if (frame % fps === 0) {
        const second = frame / fps, angle = -2.6 + (second % 7) * 0.32;
        game.fire(Math.cos(angle), Math.sin(angle));
        if (second % 2 === 0) game.rotate('petal');
        if (game.splitReady) game.split();
      }
      game.step(1 / fps);
    }
    return compact(game);
  }
  assert.deepEqual(replay(30), replay(60)); assert.deepEqual(replay(60), replay(144));
});

test('A coarse aim patrol stays within resource bounds; its survival is a balance probe', () => {
  const game = new RushGame(); let shots = 0, maximumBalls = 0;
  for (let tick = 0; tick < 180 * 120 && game.status !== 'lost'; tick++) {
    if (tick % 90 === 0) {
      const angle = -2.8 + (shots % 9) * 0.30;
      if (game.fire(Math.cos(angle), Math.sin(angle))) shots++;
    }
    if (tick % 240 === 0) game.rotate('petal');
    if (game.splitReady) game.split();
    game.step(1 / 120); maximumBalls = Math.max(maximumBalls, game.balls.length);
    assert(maximumBalls <= 5);
  }
  observations.patrol = { status: game.status, elapsedSeconds: game.elapsed, wave: game.wave, lives: game.lives, blooms: game.bloomedCount, shots, maximumBalls, score: game.score };
  assert(game.bloomedCount > 0);
});

test('A controller aiming at threatened relays can clear the first four waves', () => {
  const game = new RushGame(); let shots = 0, maximumBalls = 0;
  for (let tick = 0; tick < 180 * 120 && game.status !== 'lost' && game.wave < 5; tick++) {
    if (tick % 90 === 0) {
      const target = game.buds.filter(b => !b.bloomed).sort((a, b) => (b.y + (b.relay ? 45 : 0)) - (a.y + (a.relay ? 45 : 0)))[0];
      if (target) {
        const dx = target.x - game.launcher.x, travel = Math.hypot(dx, target.y - game.launcher.y) / game.speed;
        const angle = Math.atan2(target.y + game.descentSpeed * travel - game.launcher.y, dx);
        if (game.fire(Math.cos(angle), Math.sin(angle))) shots++;
      }
    }
    if (game.splitReady) game.split();
    game.step(1 / 120); maximumBalls = Math.max(maximumBalls, game.balls.length);
  }
  observations.targeted = { status: game.status, elapsedSeconds: game.elapsed, wave: game.wave, lives: game.lives, blooms: game.bloomedCount, shots, maximumBalls, score: game.score };
  assert.equal(game.wave, 5); assert(game.lives > 0); assert(maximumBalls <= 5);
});

const report = {
  passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  configuration: { launchCooldownSeconds: 0.65, rotationCooldownSeconds: 2, ballLifetimeSeconds: 4,
    maximumBalls: 5, directHitsPerSplit: 6, targets: '12 initially; then 18, 21, and 24',
    ballSpeed: 'min(650, 460 + 18*(wave-1))', descentSpeed: 'min(32, 10.2 + 2.8*(wave-1))',
    layeredTargets: '0 in waves1-2; 1/6 in3; 1/3 in4-5; 1/2 in6-8; 2/3 in9+' },
  probeLimit: 'Deterministic automated input policies; these are not human completion rates or universal survival-time bounds.',
  observations, results
};
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
