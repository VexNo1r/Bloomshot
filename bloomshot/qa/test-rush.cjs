'use strict';
const assert = require('assert');
const { RushGame, tempoFor, fireDelayFor, descentFor } = require('../rush.js');
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
    assert(game.speed >= 460 && game.speed <= 650); assert(game.descentSpeed <= (game.wave <= 9 ? 32 : 46));
    assert(game.buds.every(b => b.hp >= 1 && b.hp <= 2));
  }
  assert.equal(game.speed, 650); assert(Math.abs(game.descentSpeed - 42.8) < 1e-9);
  assert.equal(game.events.filter(e => e.type === 'wave').length, 14);
  assert.equal(game.events.some(e => e.type === 'won'), false);
});

test('Tempo rises a tenth per wave to x2, multiplies every score and shortens the reload to a bounded floor', () => {
  assert.deepEqual([1, 2, 6, 11, 30].map(tempoFor), [1, 1.1, 1.5, 2, 2]);
  assert.deepEqual([1, 5, 9, 30].map(fireDelayFor), [0.65, 0.55, 0.45, 0.45]);
  let previous = 0;
  for (let wave = 1; wave <= 40; wave++) { const d = descentFor(wave); assert(d >= previous && d <= 46); previous = d; }
  assert.equal(descentFor(9), 32); assert.equal(descentFor(30), 46);
  const game = activeEmpty(); clearWave(game); clearWave(game); clearWave(game); clearWave(game); clearWave(game);
  assert.equal(game.wave, 6); assert.equal(game.tempo, 1.5); assert.equal(game.snapshot().tempo, 1.5);
  const ordinary = game.buds.find(b => !b.relay && b.hp === 1), layered = game.buds.find(b => !b.relay && b.hp === 2);
  game.combo = 0; game.lastHitAt = -100;
  const before = game.score; game.strike(ordinary); assert.equal(game.score - before, 150);
  const mid = game.score; game.strike(layered); assert.equal(game.score - mid, 75);
  game.fireCooldown = 0; assert(game.fire(0, -1)); assert(Math.abs(game.fireCooldown - 0.525) < 1e-9);
});

test('Clearing a wave announces it once, and the next wave drops in with a spawn time', () => {
  const game = activeEmpty(); for (const bud of game.buds) while (!bud.bloomed) game.strike(bud, true);
  advance(game, 0.2);
  const cleared = game.events.filter(e => e.type === 'cleared');
  assert.equal(cleared.length, 1); assert.equal(cleared[0].wave, 1); assert.equal(cleared[0].next, 1.1);
  advance(game, 0.6);
  assert.equal(game.wave, 2); assert.equal(game.events.filter(e => e.type === 'cleared').length, 1);
  const wave = game.events.find(e => e.type === 'wave'); assert.equal(wave.tempo, 1.1);
  assert(game.buds.every(b => Number.isFinite(b.spawnAt) && b.spawnAt <= game.time && game.time - b.spawnAt < 0.2));
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

// Super Bloom, tricks, the chain badge and the checkpoint. A board of hand-placed buds keeps each scenario exact.
const Rush = require('../rush.js');
const Engine = require('../engine.js');
const Depths = require('../depths.js');
const bud = (id, x, y, extra = {}) => ({ id, group: extra.group || id, x, y, r: 11, hp: 1, maxHp: extra.hp || 1, relay: false, type: 'gold', bloomed: false, hitAt: -100, bloomAt: -100, ...extra, hp: extra.hp || 1 });
function board(buds, options = {}) {
  const game = activeEmpty(); game.buds = buds; game.bumpers = options.bumpers || []; game.descentSpeed = 0;
  if (options.gates) game.gates = Engine.gatesFor(options.gates);
  return game;
}
// A seed launched from (x, y) at an angle, flown until it is gone or the time runs out.
function shoot(game, x, y, angle, seconds = 1.5, power = null) {
  game.spawnBall({ x, y, angle, power }); const ball = game.balls.at(-1);
  for (let i = 0; i < seconds * 120 && game.balls.includes(ball); i++) game.step(1 / 120);
  return ball;
}
const kinds = game => game.events.filter(e => e.type === 'trick').map(e => e.kind);
const up = -Math.PI / 2;

test('A direct strike with no seed earns no sun, as before; a seed-credited bloom charges 1 and a chained one half', () => {
  const plain = activeEmpty(); plain.strike(plain.buds.find(b => !b.relay));
  assert.equal(plain.sunCharge, 0); assert.equal(plain.sun, 0); assert.equal(plain.score, 100);
  const game = board([bud('crown', 210, 200, { relay: true, group: 'g' }), bud('left', 150, 160, { group: 'g' }), bud('right', 270, 160, { group: 'g' })]);
  shoot(game, 210, 240, up, .08);
  assert(game.buds[0].bloomed); assert.equal(game.sunCharge, 1, 'one direct bloom');
  advance(game, .4);
  assert(game.buds.every(b => b.bloomed)); assert.equal(game.sunCharge, 2, 'plus half for each of the two chained');
  const blooms = game.events.filter(e => e.type === 'bloom');
  assert.deepEqual(blooms.map(e => e.seed), [1, 1, 1]); assert.deepEqual(blooms.map(e => e.seedStep), [0, 1, 2]);
  assert.deepEqual(blooms.map(e => e.via), [null, 'relay', 'relay']); assert.deepEqual(blooms.map(e => e.cascade), [0, 1, 1]);
  assert.deepEqual(blooms[1].from, { x: 210, y: 200 }); assert.equal(blooms[0].mult, 1); assert.equal(blooms[0].super, false);
  assert(Math.abs(game.buds[0].impactAngle - up) < .05, 'hit from below');
  assert(Math.abs(game.buds[1].impactAngle - Math.atan2(160 - 200, 150 - 210)) < 1e-9, 'a chained flower opens away from its source');
});
test('The sun fills an eighth at a time; the first fill comes at 28.8 and later ones at 48', () => {
  const game = board([bud('a', 100, 100), bud('b', 300, 100)]), credit = { by: 1 };
  game._charge(14.4, credit); assert(Math.abs(game.sun - .5) < 1e-9);
  game._charge(14.3, credit); assert.equal(game.superBloom, 0, 'not yet at 28.7');
  game._charge(.1, credit);
  assert.deepEqual(game.events.filter(e => e.type === 'sunPetal').map(e => e.petal), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert(game.events.filter(e => e.type === 'sunPetal').every(e => e.of === 8));
  assert.equal(game.superBloom, 6); assert.equal(game.sun, 0);
  advance(game, 6.1);
  game._charge(24, credit); assert(Math.abs(game.sun - .5) < 1e-9, 'the next fill needs the whole 48');
  const scripted = new RushGame({ scripted: true }); scripted._charge(40, credit); assert.equal(scripted.sun, 0, 'the tutorial never charges');
});
test('Super Bloom lasts six seconds, reloads in .22 s, pays double for seed-earned blooms and mirrors the fever look', () => {
  const game = board([bud('a', 120, 200), bud('b', 300, 200), bud('c', 210, 120)]);
  game._charge(28.8, { by: 1 });
  assert.deepEqual(game.events.filter(e => e.type === 'superBloom').map(e => e.time), [6]); assert.equal(game.feverTime, 6);
  assert(game.fire(0, -1)); assert(Math.abs(game.fireCooldown - .22) < 1e-9);
  game.balls = [];
  const before = game.score; game.strike(game.buds[2]); assert.equal(game.score - before, 100, 'a strike no seed earned is not doubled');
  const ball = shoot(game, 120, 240, up, .08);
  assert(game.buds[0].bloomed); assert.equal(game.events.filter(e => e.type === 'bloom').at(-1).gain, 200, 'combo 2 is still x1, doubled for the seed');
  assert(game.events.filter(e => e.type === 'bloom').at(-1).super); assert(ball);
  const charge = game.sunCharge; game._charge(10, { by: 1 }); assert.equal(game.sunCharge, charge, 'no charging during a Super Bloom');
  advance(game, 5.5); assert(game.superBloom > 0); assert.equal(game.feverTime, game.superBloom);
  advance(game, .6); assert.equal(game.superBloom, 0); assert.equal(game.feverTime, 0);
  assert.equal(game.events.filter(e => e.type === 'superBloomEnd').length, 1);
  game.fireCooldown = 0; assert(game.fire(0, -1)); assert(Math.abs(game.fireCooldown - .65) < 1e-9, 'reloads go back to normal');
});
test('A sun that fills between waves waits for the next wave, and won or lost clears a Super Bloom', () => {
  const game = activeEmpty(); for (const b of game.buds) while (!b.bloomed) game.strike(b, true);
  advance(game, .1); assert.notEqual(game.nextWaveAt, null);
  game._charge(28.8, { by: 1 });
  assert.equal(game.superBloom, 0); assert.equal(game.sun, 1, 'full and waiting');
  advance(game, .7); assert.equal(game.wave, 2); assert(game.superBloom > 5.5, 'it opens the next wave');
  assert(game.events.findIndex(e => e.type === 'superBloom') > game.events.findIndex(e => e.type === 'wave'));
  const level = new RushGame({ plan: { id: 1, name: 'Sunny Meadow', waves: 10, wave: n => Depths.wave(1, n) } });
  level.started = true; level.status = 'flying'; level._charge(28.8, { by: 1 }); assert.equal(level.superBloom, 6);
  level._lose(); assert.equal(level.superBloom, 0); assert.equal(level.feverTime, 0);
});
test('A Super Bloom seed flies through at most two plain buds, and never through a boss, gift, geode, cup or shell', () => {
  const game = board([bud('a', 210, 300, { hp: 2 }), bud('b', 210, 250, { hp: 2 }), bud('c', 210, 200, { hp: 2 }), bud('d', 210, 150)]);
  game._startSuper();
  const ball = shoot(game, 210, 380, up, .5);
  assert.deepEqual(game.buds.map(b => b.bloomed), [true, true, false, false], 'two pierced, the third stops it');
  assert.equal(game.buds[2].hp, 1, 'the third is struck as usual'); assert.equal(ball.pierced, 2);
  for (const [name, extra] of [['boss', { boss: true, hp: 3, r: 24 }], ['geode', { geode: true, hp: 2, r: 14 }], ['cup', { shield: true }], ['shell', { shell: true, shellAngle: Math.PI / 2, shellSpin: 0 }]]) {
    const guarded = board([bud(name, 210, 200, extra)]); guarded._startSuper();
    const seed = shoot(guarded, 210, 300, up, .3);
    assert.equal(seed.pierced, 0, `${name} is never pierced`); assert(seed.vy > 0, `${name} turns the seed back`);
  }
  const gift = board([bud('gift', 210, 200, { gift: 'lullaby', r: 14 })]); gift._startSuper();
  const giftSeed = shoot(gift, 210, 300, up, .3);
  assert.equal(giftSeed.pierced, 0); assert.equal(gift.buds.length, 0, 'the gift is caught as always');
  assert(gift.events.some(e => e.type === 'gift'));
});
test('Every trick fires in its own shot, pays its bonus times the tempo and fills the sun', () => {
  // Bank shot: off the left wall, across to the right one, into a bud.
  const bank = board([bud('t', 300, 282.5, { r: 14 })]);
  shoot(bank, 40, 400, Math.atan2(-.25, -1), 2);
  assert.deepEqual(kinds(bank), ['bank']); assert.equal(bank.events.find(e => e.type === 'trick').name, 'Bank shot!');
  assert.equal(bank.sunCharge, 1 + 4, 'a trick adds four to the sun');
  // Close call: a bud just above the line.
  const close = board([bud('t', 210, 428)]); shoot(close, 210, 480, up, .2);
  assert.deepEqual(kinds(close), ['close']); assert.equal(close.score, 100 + 500);
  // Rebound: falling onto the petal and straight back up into a flower.
  const petal = { id: 'petal', x: 210, y: 350, length: 64, angle: 0, oneWay: true };
  const rebound = board([bud('t', 210, 250)], { bumpers: [petal] }); shoot(rebound, 210, 300, Math.PI / 2, .6);
  assert.deepEqual(kinds(rebound), ['rebound']);
  // Tunnel shot: in one hole, out the other and into a flower.
  const tunnelGates = [{ id: 'in', pair: 'out', x: 210, y: 400, r: 18, angle: up }, { id: 'out', pair: 'in', x: 210, y: 250, r: 18, angle: up }];
  const tunnel = board([bud('t', 210, 150)], { gates: tunnelGates }); shoot(tunnel, 210, 470, up, .6);
  assert.deepEqual(kinds(tunnel), ['tunnel']);
  // Trick shot: through a tunnel and off a wall into a flower (the tunnel shot would pay less, so it gives way).
  const trickGates = [{ id: 'in', pair: 'out', x: 210, y: 400, r: 18, angle: up }, { id: 'out', pair: 'in', x: 300, y: 300, r: 18, angle: -Math.PI / 4 }];
  const trick = board([bud('t', 340, 155, { r: 12 })], { gates: trickGates }); shoot(trick, 210, 470, up, 1);
  assert.deepEqual(kinds(trick), ['trick']); assert.equal(trick.events.find(e => e.type === 'trick').bonus, 600);
  // Hat trick: a bee flies through three flowers, each its own touch; a fourth pays nothing more.
  const hat = board([bud('a', 210, 300), bud('b', 210, 250), bud('c', 210, 200), bud('d', 210, 150)]);
  shoot(hat, 210, 380, up, .6, 'beeline');
  assert.deepEqual(kinds(hat), ['hat']); assert.equal(hat.events.find(e => e.type === 'trick').x, 210);
  assert.equal(hat.events.find(e => e.type === 'trick').y, 200, 'stamped on the third flower');
  // Grand slam: one seed pops a puffcap that blooms eleven more, so twelve blooms are credited to it.
  const ring = Array.from({ length: 12 }, (_, i) => { const a = Math.PI / 2 + .55 + i * (2 * Math.PI - 1.1) / 11; return bud('r' + i, 210 + Math.cos(a) * 58, 200 + Math.sin(a) * 58); });
  const slam = board([bud('puff', 210, 200, { puff: true, r: 12 }), ...ring.slice(0, 11)]);
  shoot(slam, 210, 360, up, .2); advance(slam, 1);
  assert(slam.buds.every(b => b.bloomed)); assert.deepEqual(kinds(slam), ['slam']);
  assert.equal(slam.events.find(e => e.type === 'trick').seed, 1); assert.equal(slam.tricks, 1);
  // The tempo multiplies every bonus.
  const fast = board([bud('t', 210, 428)]); fast.wave = 6; shoot(fast, 210, 480, up, .2);
  assert.equal(fast.events.find(e => e.type === 'trick').bonus, 750);
});
test('A flight trick pays at most once a bloom and each kind once a wave; hat and slam once a seed', () => {
  const game = board([bud('a', 150, 428), bud('b', 270, 428)]);
  shoot(game, 150, 480, up, .2); shoot(game, 270, 480, up, .2);
  assert.deepEqual(kinds(game), ['close'], 'the same trick twice in a wave pays once');
  game.nextWaveAt = game.time; game.step(1 / 120); assert.equal(game.wave, 2);
  game.buds = [bud('c', 210, 428)]; game.bumpers = []; game.descentSpeed = 0; shoot(game, 210, 480, up, .2);
  assert.deepEqual(kinds(game), ['close', 'close'], 'and again in the next wave');
  const hats = board([bud('a', 120, 300), bud('b', 120, 250), bud('c', 120, 200), bud('d', 120, 150), bud('e', 120, 100)]);
  shoot(hats, 120, 380, up, .8, 'beeline');
  assert.equal(kinds(hats).filter(k => k === 'hat').length, 1, 'five flowers, one hat trick');
  const ring = Array.from({ length: 14 }, (_, i) => { const a = Math.PI / 2 + .5 + i * (2 * Math.PI - 1) / 13; return bud('r' + i, 210 + Math.cos(a) * 62, 200 + Math.sin(a) * 62, { r: 10 }); });
  const slams = board([bud('puff', 210, 200, { puff: true, r: 12 }), ...ring]);
  shoot(slams, 210, 360, up, .2); advance(slams, 1.4);
  assert(slams.buds.every(b => b.bloomed)); assert.equal(kinds(slams).filter(k => k === 'slam').length, 1, 'fifteen blooms, one grand slam');
});
test('The multiplier announces each rise, and a chain of five or more announces its end', () => {
  const game = board(Array.from({ length: 10 }, (_, i) => bud('m' + i, 60 + i * 33, 150)));
  for (let i = 0; i < 9; i++) game.strike(game.buds[i]);
  assert.deepEqual(game.events.filter(e => e.type === 'mult').map(e => e.mult), [2, 3]); assert.equal(game.mult, 3);
  assert.equal(game.comboWindow, 1.1); assert(Math.abs(game.comboLeft - 1.1) < 1e-9);
  advance(game, .5); assert(Math.abs(game.comboLeft - .6) < .01);
  advance(game, .7);
  assert.deepEqual(game.events.filter(e => e.type === 'chainEnd').map(e => e.chain), [9]); assert.equal(game.combo, 0); assert.equal(game.comboLeft, 0);
  const short = activeEmpty(); short.buds.filter(b => !b.relay).slice(0, 4).forEach(b => short.strike(b)); advance(short, 1.3);
  assert.equal(short.events.filter(e => e.type === 'chainEnd').length, 0, 'a chain of four ends quietly');
});
test('Endless Rush no longer has its own fever; long chains stay plain until the sun says otherwise', () => {
  const game = board(Array.from({ length: 30 }, (_, i) => bud('f' + i, 50 + (i % 10) * 35, 80 + Math.floor(i / 10) * 60)));
  for (const b of game.buds) game.strike(b);
  assert.equal(game.bestCombo, 30); assert.equal(game.events.filter(e => e.type === 'fever').length, 0); assert.equal(game.feverTime, 0);
});
test('A checkpoint run starts at wave 6 with three lives and no score, and can earn at most two stars', () => {
  const plan = { id: 2, name: 'Root Tunnels', waves: 10, wave: n => Depths.wave(2, n) };
  const game = new RushGame({ plan, startWave: Depths.checkpoint });
  assert.equal(game.wave, 6); assert.equal(game.startWave, 6); assert.equal(game.lives, 3); assert.equal(game.score, 0);
  assert.deepEqual(game.buds.map(b => b.id), Depths.wave(2, 6).buds.map(b => b.id)); assert.equal(game.tempo, 1.5);
  assert.equal(game.snapshot().startWave, 6);
  game.started = true; game.status = 'flying';
  for (let wave = 6; wave <= 10 && !game.over; wave++) { game.drops = []; for (const b of game.buds) while (!b.bloomed) game.strike(b, true); advance(game, 2.6); }
  assert.equal(game.status, 'won'); assert.equal(game.lives, 3); assert.equal(game.stars, 2, 'three lives kept, two stars from a checkpoint');
  const full = new RushGame({ plan }); assert.equal(full.wave, 1); assert.equal(full.startWave, 1);
  full.started = true; full.wave = 10; full._clearLevel(); assert.equal(full.stars, 3);
  assert.equal(new RushGame({ plan, startWave: 40 }).wave, 10, 'never past the last wave'); assert.equal(new RushGame({ startWave: 6 }).wave, 1, 'endless Rush has no checkpoint');
});
test('Events carry what the art and sound need: lost flowers, wave totals, boss names and crack counts', () => {
  const game = activeEmpty(), group = game.buds[0].group, members = game.buds.filter(b => b.group === group);
  members.forEach(b => { b.y = game.dangerY + 1; });
  game.step(1 / 120);
  const life = game.events.find(e => e.type === 'life');
  assert.equal(life.buds.length, 3); assert.deepEqual(Object.keys(life.buds[0]).sort(), ['r', 'type', 'x', 'y']); assert.equal(life.index, 2);
  const waves = activeEmpty(); waves.strike(waves.buds[1]); for (const b of waves.buds) while (!b.bloomed) waves.strike(b, true); advance(waves, .1);
  const cleared = waves.events.find(e => e.type === 'cleared');
  assert.equal(cleared.blooms, 12); assert.equal(cleared.bestChain, 12); assert.equal(cleared.tricks, 0);
  const plan = { id: 7, name: 'Ember Hollows', waves: 10, wave: n => Depths.wave(7, n) }, level = new RushGame({ plan, startWave: 9 });
  level.started = true; level.status = 'flying'; level.drops = []; for (const b of level.buds) while (!b.bloomed) level.strike(b, true); advance(level, 1);
  assert.equal(level.events.find(e => e.type === 'wave').bossName, 'Ember Rose');
  const boss = level.buds.find(b => b.boss); level.strike(boss);
  assert.equal(level.events.filter(e => e.type === 'crack').at(-1).hits, 1);
  while (!boss.bloomed) level.strike(boss);
  assert.equal(level.events.find(e => e.type === 'boss').name, 'Ember Rose');
  const items = level.pending.filter(item => item.via === 'boss');
  assert(items.length > 4); assert(items.every(item => item.from.x === boss.x && item.at === level.time));
  const distance = id => { const b = level.buds.find(x => x.id === id); return Math.hypot(b.x - boss.x, b.y - boss.y); };
  for (let i = 1; i < items.length; i++) assert(distance(items[i].id) >= distance(items[i - 1].id) - 1e-9, 'the gold wave travels outward');
});

// The chain HUD and the gold sky draw with finite canvas values in every state, with and without reduced motion.
test('The sun fan, the multiplier badge and the gold sky draw cleanly through a whole Super Bloom', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const calls = [], texts = [];
  const check = (name, args) => { for (const a of args) if (typeof a === 'number') assert(Number.isFinite(a), `${name} got ${a}`); };
  const gradient = { addColorStop: (offset, color) => { assert(Number.isFinite(offset)); assert.equal(typeof color, 'string'); } };
  const ctx = new Proxy({ globalAlpha: 1, lineWidth: 1 }, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'createLinearGradient' || name === 'createRadialGradient') return (...args) => { check(name, args); return gradient; };
      if (name === 'measureText') return () => ({ width: 10 });
      return (...args) => { check(String(name), args); calls.push(name); if (name === 'fillText') texts.push(args[0]); };
    },
    set(target, name, value) { if (name === 'globalAlpha' || name === 'lineWidth') assert(Number.isFinite(value), `${name} = ${value}`); target[name] = value; return true; }
  });
  const context = vm.createContext({ console, Math, Map, Set, Array, Object, Number, String, JSON });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8'), context, { filename: 'art.js' });
  const game = board([bud('a', 100, 100), bud('b', 300, 100), bud('c', 200, 160)]); game.particles = []; game.floaters = [];
  const frame = reducedMotion => { calls.length = 0; texts.length = 0; context.BloomArt.draw(ctx, game, game.time, { reducedMotion, showAim: false }); return calls.length; };
  for (const reducedMotion of [false, true]) {
    assert(frame(reducedMotion) > 20); assert(!texts.some(t => /^×/.test(t)), 'no badge before a chain');
    game._charge(14, { by: 1 }); frame(reducedMotion);
    game.combo = 6; game.lastHitAt = game.time; game.multAt = game.time; frame(reducedMotion); assert(texts.includes('×2'), 'the badge shows the multiplier');
    game._charge(game._sunNeed() - game.sunCharge, { by: 1 }); assert(game.superBloom > 0);
    for (const t of [0, .2, 1.7, 3.3, 5.6, 5.95]) { advance(game, t - (6 - game.superBloom)); frame(reducedMotion); }
    advance(game, .2); assert.equal(game.superBloom, 0); frame(reducedMotion);
    game.floaters.push({ kind: 'pop', x: 100, y: 100, text: '+400', life: .5, maxLife: .8, size: 26, color: '#e59a12', golden: true }); frame(reducedMotion);
    game.floaters = []; game.combo = 0; game.sunCharge = 0; game.sunLit = 0;
  }
});

const report = {
  passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  configuration: { launchCooldownSeconds: 'max(0.45, 0.65 - 0.025*(wave-1))', tempo: 'min(2, 1 + 0.1*(wave-1)) multiplies every score', rotationCooldownSeconds: 2, ballLifetimeSeconds: 4,
    maximumBalls: 5, directHitsPerSplit: 6, targets: '12 initially; then 18, 21, and 24',
    ballSpeed: 'min(650, 460 + 18*(wave-1))', descentSpeed: 'min(32, 10.2 + 2.8*(wave-1)) through wave 9, then min(46, 32 + 1.8*(wave-9))',
    layeredTargets: '0 in waves1-2; 1/6 in3; 1/3 in4-5; 1/2 in6-8; 2/3 in9+' },
  probeLimit: 'Deterministic automated input policies; these are not human completion rates or universal survival-time bounds.',
  observations, results
};
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
