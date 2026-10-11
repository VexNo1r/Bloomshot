'use strict';
// The level campaign: authored waves stay fair and on the board, each level adds its own twist, the new pieces
// (rocks, sway, cups, puffcaps, drops, bosses, currents, tunnels, shells, geodes, briars) behave, progress saves
// safely, and a practice bot shows every level can be cleared and that they get harder. Run: node qa/test-depths.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Depths = require('../depths.js');
const { RushGame } = require('../rush.js');
const { BOUNDS, RADIUS, gatesFor, currentsFor } = require('../engine.js');
const bot = require('./depths-bot.cjs');
const results = [], observations = {};
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
const advance = (game, seconds, fps = 120) => { for (let i = 0; i < Math.round(seconds * fps); i++) game.step(1 / fps); };
const ids = Depths.levels.map(level => level.id);
function every(fn) { for (const id of ids) for (let n = 1; n <= Depths.waveCount; n++) fn(id, n, Depths.wave(id, n)); }
function groups(w) { return [w.buds, ...w.drops.map(drop => drop.buds)]; }
function segmentDistance(px, py, rock) {
  const ux = Math.cos(rock.angle), uy = Math.sin(rock.angle), half = rock.length / 2;
  const t = Math.max(-half, Math.min(half, (px - rock.x) * ux + (py - rock.y) * uy));
  return Math.hypot(px - rock.x - ux * t, py - rock.y - uy * t);
}
function started(id, wave = 1) {
  const game = new RushGame({ plan: bot.plan(id) });
  game.started = true; game.status = 'flying';
  if (wave > 1) { game.wave = wave - 1; game._loadWave(); }
  return game;
}

test('Browser and CommonJS builds expose the same API', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../depths.js'), 'utf8'), context);
  assert.deepEqual(Object.keys(context.BloomDepths).sort(), Object.keys(Depths).sort());
});
test('Ten levels of ten waves, the first four free, the rest one product', () => {
  assert.equal(Depths.total, 10); assert.equal(Depths.free, 4); assert.equal(Depths.waveCount, 10);
  assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(Depths.levels.map(level => level.key)).size, 10, 'every level has its own scene');
  for (const level of Depths.levels) { assert(level.name.length <= 16, level.name); assert.equal(level.waves, 10); }
  assert.deepEqual(Depths.wave(2, 5), Depths.wave(2, 5), 'waves are built the same way every time');
  assert.throws(() => Depths.wave(1, 11), RangeError); assert.throws(() => Depths.wave(11, 1), RangeError);
  assert.equal(Depths.product, 'bloomshot.levels.full'); assert.equal(Depths.entitlement, 'levels_full');
  const config = fs.readFileSync(path.join(__dirname, '../store-config.js'), 'utf8');
  assert(config.includes(`'${Depths.product}'`) && config.includes(`'${Depths.entitlement}'`), 'the store sells the same product');
  every((id, n, w) => assert(w.hint.length <= 52, `L${id} W${n} hint fits the hint line`));
});
test('Every bud starts on the board, never overlaps another, and sways inside the walls', () => {
  every((id, n, w) => {
    for (const list of groups(w)) {
      for (const bud of list) {
        assert(bud.y - bud.r >= BOUNDS.top + 8 && bud.y + bud.r <= 300, `L${id} W${n} ${bud.id} y`);
        assert(bud.baseX - bud.sway - bud.r >= BOUNDS.left + 1 && bud.baseX + bud.sway + bud.r <= BOUNDS.right - 1, `L${id} W${n} ${bud.id} sway`);
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        assert(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + 1, `L${id} W${n} ${a.id} overlaps ${b.id}`);
      }
    }
    for (const drop of w.drops) assert(Math.max(...drop.buds.map(b => b.y + b.r)) <= 130, `L${id} W${n} drops arrive at the top`);
    assert(new Set(groups(w).flat().map(b => b.id)).size === groups(w).flat().length, 'unique ids');
  });
});
test('Rocks and the leaf sit between the flowers and the launcher, clear of every opening bud', () => {
  every((id, n, w) => {
    for (const rock of w.bumpers) {
      const half = rock.length / 2 + 6, ux = Math.abs(Math.cos(rock.angle)) * half, uy = Math.abs(Math.sin(rock.angle)) * half;
      assert(rock.x - (rock.slide || 0) - ux >= BOUNDS.left && rock.x + (rock.slide || 0) + ux <= BOUNDS.right, `L${id} W${n} ${rock.id} x`);
      assert(rock.y + uy < 440 && Math.hypot(rock.x - 210, rock.y - 498) > 70, `L${id} W${n} ${rock.id} clear of the line and launcher`);
      for (const bud of w.buds) {
        if (rock.slide) continue;
        assert(segmentDistance(bud.x, bud.y, rock) > bud.r + 6 + RADIUS, `L${id} W${n} ${rock.id} touches ${bud.id}`);
      }
    }
    assert.equal(w.bumpers.filter(b => b.id === 'petal').length, 1, 'every wave has the leaf to turn');
    assert(w.descent > 0 && w.fireDelay >= .42 && w.speed >= 470);
  });
});
test('Currents and tunnels are valid, and sit clear of the launcher and the opening buds', () => {
  every((id, n, w) => {
    assert.equal(currentsFor(w.currents).length, w.currents.length, `L${id} W${n} currents`);
    assert.equal(gatesFor(w.gates).length, w.gates.length, `L${id} W${n} tunnels pair up and fit the board`);
    for (const lane of w.currents) {
      const inside = (x, y, pad) => { const dx = x - lane.x, dy = y - lane.y; return Math.abs(dx * Math.cos(lane.angle) + dy * Math.sin(lane.angle)) <= lane.length / 2 + pad && Math.abs(-dx * Math.sin(lane.angle) + dy * Math.cos(lane.angle)) <= lane.width / 2 + pad; };
      assert(!inside(210, 498, 8), `L${id} W${n} ${lane.id} covers the launcher`);
      for (const bud of w.buds) assert(!inside(bud.x, bud.y, bud.r), `L${id} W${n} ${lane.id} starts over ${bud.id}`);
    }
    for (const gate of w.gates) {
      assert(Math.hypot(gate.x - 210, gate.y - 498) > 80, `L${id} W${n} ${gate.id} too close to the launcher`);
      for (const bud of w.buds) assert(Math.hypot(gate.x - bud.x, gate.y - bud.y) >= gate.r + bud.r, `L${id} W${n} ${gate.id} covers ${bud.id}`);
      for (const rock of w.bumpers) if (!rock.slide) assert(segmentDistance(gate.x, gate.y, rock) > gate.r + 6, `L${id} W${n} ${gate.id} touches ${rock.id}`);
    }
  });
});
test('Each level brings its own twist and ends with a tougher boss', () => {
  const count = (id, test) => Array.from({ length: 10 }, (_, i) => groups(Depths.wave(id, i + 1)).flat().concat(Depths.wave(id, i + 1).bumpers)).flat().filter(test).length;
  assert.equal(count(1, b => b.kind === 'rock' || b.shield || b.puff), 0, 'level 1 keeps to the basics');
  assert(count(2, b => b.kind === 'rock') >= 15, 'level 2 is full of rocks');
  assert(count(3, b => b.shield) >= 40 && count(3, b => b.puff) >= 15, 'level 3 brings cups and puffcaps');
  assert(count(4, b => b.slide) >= 6 && count(4, b => b.hp === 3) >= 30, 'level 4 moves its crystals and armors its buds');
  const waves = id => Array.from({ length: 10 }, (_, i) => Depths.wave(id, i + 1));
  assert(waves(5).filter(w => w.currents.length).length === 10, 'level 5 has water in every wave');
  assert(count(6, b => b.shell) >= 45 && waves(6)[9].buds.find(b => b.boss).shell, 'level 6 is full of shells, its big bloom too');
  assert(waves(7).filter(w => w.gates.length).length === 10, 'level 7 has tunnels in every wave');
  assert(count(8, b => b.geode) >= 15, 'level 8 is full of geodes');
  assert(count(9, b => b.briar) >= 45 && count(9, b => b.briar && b.relay) === 0, 'level 9 is full of briars, and briars have no crown');
  const core = waves(10), all = core.flatMap(w => groups(w).flat());
  assert(core.some(w => w.currents.length) && core.some(w => w.gates.length) && all.some(b => b.shell) && all.some(b => b.geode) && all.some(b => b.briar), 'level 10 uses everything');
  for (let id = 5; id <= 10; id++) assert(count(id, b => b.shell) + count(id, b => b.geode) + count(id, b => b.briar) + waves(id).reduce((n, w) => n + w.currents.length + w.gates.length, 0) > 0);
  let previous = 0;
  for (const id of ids) {
    const boss = Depths.wave(id, 10).buds.find(b => b.boss);
    assert(boss && boss.hp > previous, `level ${id} boss`); previous = boss.hp;
    for (let n = 1; n < 10; n++) assert(!Depths.wave(id, n).boss);
  }
  observations.bossHp = ids.map(id => Depths.wave(id, 10).buds.find(b => b.boss).hp);
  observations.budsPerLevel = ids.map(id => Array.from({ length: 10 }, (_, i) => groups(Depths.wave(id, i + 1)).flat().length).reduce((a, b) => a + b, 0));
  observations.fallSpeed = ids.map(id => [Depths.wave(id, 1).descent, Depths.wave(id, 9).descent]);
});
test('Cups turn away shots from below, but a shot from above or a crown blooms them', () => {
  const game = started(3, 2), cupped = game.buds.find(b => b.shield && !b.relay);
  game.buds = [cupped]; cupped.hp = 1;
  game.spawnBall({ x: cupped.x, y: cupped.y + 60, angle: -Math.PI / 2 });
  advance(game, .2);
  assert.equal(cupped.bloomed, false); assert(game.balls[0].vy > 0, 'the shot bounced back down');
  game.balls = [];
  game.spawnBall({ x: cupped.x, y: cupped.y - 50, angle: Math.PI / 2 });
  advance(game, .2);
  assert.equal(cupped.bloomed, true, 'a shot from above lands');
  const fresh = started(3, 2), crown = fresh.buds.find(b => b.relay);
  fresh.strike(crown); advance(fresh, .4);
  assert(fresh.buds.filter(b => b.group === crown.group).every(b => b.bloomed), 'the crown blooms its cupped buds');
});
test('A puffcap blooms everything within reach and nothing past it', () => {
  const game = started(3, 1), puff = game.buds.find(b => b.puff);
  const near = game.buds.filter(b => b !== puff && Math.hypot(b.x - puff.x, b.y - puff.y) <= Depths.puffReach);
  const far = game.buds.filter(b => b !== puff && !near.includes(b));
  assert(near.length >= 4 && far.length >= 4);
  game.strike(puff); advance(game, .8);
  assert(near.every(b => b.bloomed || b.hp < b.maxHp)); assert(far.every(b => !b.bloomed && b.hp === b.maxHp));
});
test('A boss that reaches the line costs a life and climbs back; blooming it blooms its wave', () => {
  const game = started(1, 10), boss = game.buds.find(b => b.boss);
  game.buds = game.buds.filter(b => b.boss || b.group.endsWith('-0')); game.drops = [];
  boss.y = game.dangerY - boss.r - .5; advance(game, .1);
  assert.equal(game.lives, 2); assert.equal(boss.y < 200, true); assert.equal(game.buds.includes(boss), true);
  while (!boss.bloomed) game.strike(boss);
  advance(game, 1.2);
  assert(game.buds.every(b => b.bloomed), 'the rest of the wave bloomed with it');
  advance(game, .2);
  assert.equal(game.status, 'won'); assert.equal(game.stars, 2, 'stars are the lives kept');
  assert.equal(game.fire(0, -1), false, 'nothing fires after the level is clear');
});
test('Drops wait for their time and for room at the top, and the wave only clears after the last one', () => {
  const game = started(1, 1);
  assert.equal(game.drops.length, 1);
  advance(game, 1); assert.equal(game.drops.length, 1, 'not before its time');
  for (let i = 0; i < 60; i++) { game.buds.forEach(b => { b.y = 80; }); advance(game, .1); }
  assert.equal(game.drops.length, 1, 'not while buds still sit at the top');
  for (const bud of game.buds) while (!bud.bloomed) game.strike(bud, true);
  advance(game, .2);
  assert.equal(game.drops.length, 0); assert.equal(game.wave, 1, 'the drop arrived before the wave could clear');
  for (const bud of game.buds) while (!bud.bloomed) game.strike(bud, true);
  advance(game, 1); assert.equal(game.wave, 2);
});
test('Crystals slide, the leaf keeps its turn between waves, and turning never moves a rock', () => {
  const game = started(4, 1), rock = game.bumpers.find(b => b.kind === 'rock');
  const x0 = rock.x; advance(game, 1); assert(Math.abs(rock.x - x0) > 20);
  assert.equal(game.rotate(rock.id), false);
  assert.equal(game.rotate('petal'), true);
  const turned = game.bumpers.find(b => b.id === 'petal').angle;
  game.drops = []; for (const bud of game.buds) while (!bud.bloomed) game.strike(bud, true);
  advance(game, 1); assert.equal(game.wave, 2);
  assert.equal(game.bumpers.find(b => b.id === 'petal').angle, turned);
});
test('Swaying buds move side to side and fast ones fall faster', () => {
  const game = started(1, 5), swayer = game.buds.reduce((a, b) => b.sway > a.sway ? b : a);
  const xs = []; for (let i = 0; i < 30; i++) { advance(game, .1); xs.push(swayer.x); }
  assert(Math.max(...xs) - Math.min(...xs) > 10);
  const fastGame = started(1, 6), fast = fastGame.buds.find(b => b.fall > 1), slow = fastGame.buds.find(b => b.fall === 1);
  const [f0, s0] = [fast.y, slow.y]; advance(fastGame, 2);
  assert(fast.y - f0 > (slow.y - s0) * 1.5);
});
test('Progress saves stars, best score and furthest wave; levels open in order', () => {
  assert.deepEqual(Depths.normalize({ 1: { stars: 9, best: -4, wave: 3.5 }, 2: 'x', 11: { stars: 3 }, x: {} }), { 1: { stars: 3, best: 0, wave: 0 } });
  let r = Depths.record({}, 1, { won: false, lives: 0, score: 900, wave: 6 });
  assert.deepEqual(r.progress[1], { stars: 0, best: 900, wave: 6 }); assert.equal(r.firstClear, false);
  assert.equal(Depths.unlocked(r.progress, 2), false);
  r = Depths.record(r.progress, 1, { won: true, lives: 2, score: 500, wave: 10 });
  assert.deepEqual(r.progress[1], { stars: 2, best: 900, wave: 10 }); assert.equal(r.firstClear, true); assert.equal(r.newStars, 2);
  r = Depths.record(r.progress, 1, { won: true, lives: 1, score: 100, wave: 10 });
  assert.equal(r.progress[1].stars, 2); assert.equal(r.firstClear, false); assert.equal(r.newStars, 0);
  assert.equal(Depths.unlocked(r.progress, 1), true); assert.equal(Depths.unlocked(r.progress, 2), true);
  const four = { 1: { stars: 1 }, 2: { stars: 1 }, 3: { stars: 1 }, 4: { stars: 1 } };
  assert.equal(Depths.unlocked(four, 5, false), false, 'level 5 needs the unlock');
  assert.equal(Depths.unlocked(four, 5, true), true, 'with the unlock, clearing level 4 opens level 5');
  assert.equal(Depths.unlocked(four, 6, true), false, 'and the deeper levels still open in order');
  assert.equal(Depths.unlocked({}, 11, true), false);
});
test('Currents bend a shot without changing its speed', () => {
  const game = started(5, 1), lane = game.currents[0];
  game.buds = []; game.drops = [];
  game.spawnBall({ x: 100, y: lane.y + lane.width / 2 + 20, angle: -Math.PI / 2 });
  const speed = Math.hypot(game.balls[0].vx, game.balls[0].vy);
  advance(game, .3);
  const ball = game.balls[0];
  assert(ball.vx > 100, 'the shot now drifts with the flow'); assert(Math.abs(Math.hypot(ball.vx, ball.vy) - speed) < 1e-6);
  assert(game.drainEvents().some(e => e.type === 'current'));
});
test('A tunnel sends a straight shot out of its partner at the exit heading', () => {
  const game = started(7, 1), entry = game.gates.find(g => g.id.endsWith('-in')), exit = game.gates.find(g => g.id === entry.pair);
  game.buds = []; game.drops = [];
  game.fire(entry.x - game.launcher.x, entry.y - game.launcher.y);
  for (let i = 0; i < 120 && !game.drainEvents().some(e => e.type === 'gate'); i++) game.step(1 / 120);
  const ball = game.balls[0];
  assert(Math.hypot(ball.x - exit.x, ball.y - exit.y) < exit.r + 20, 'the shot came out of the exit');
  assert(Math.abs(Math.atan2(ball.vy, ball.vx) - exit.angle) < .02, 'heading the way the exit points');
  assert.equal(game.gatePasses, 1);
});
test('A shell only lets a shot in through its opening, and a crown chain blooms shelled buds anyway', () => {
  const game = started(6, 1), bud = game.buds.find(b => b.shell && !b.relay);
  game.buds = [bud]; game.drops = []; bud.shellSpin = 0; bud.hp = 1;
  bud.shellAngle = -Math.PI / 2; game.spawnBall({ x: bud.x, y: bud.y + 60, angle: -Math.PI / 2 });
  advance(game, .2);
  assert.equal(bud.bloomed, false, 'a shot into the closed side glances off');
  assert(game.drainEvents().some(e => e.type === 'shield' && e.shell));
  game.balls = []; bud.shellAngle = Math.PI / 2; game.spawnBall({ x: bud.x, y: bud.y + 60, angle: -Math.PI / 2 });
  advance(game, .2);
  assert.equal(bud.bloomed, true, 'a shot through the opening lands');
  const fresh = started(6, 1), crown = fresh.buds.find(b => b.shell && b.relay);
  fresh.strike(crown); advance(fresh, .4);
  assert(fresh.buds.filter(b => b.group === crown.group).every(b => b.bloomed), 'the crown blooms its shelled cluster');
  const spun = started(6, 2), turning = spun.buds.find(b => b.shell), a0 = turning.shellAngle;
  advance(spun, 1); assert(Math.abs(turning.shellAngle - a0) > 1, 'shells keep turning');
});
test('A geode cracks into gems that must bloom before the wave clears, unless a big bloom takes it', () => {
  const game = started(8, 1), geode = game.buds.find(b => b.geode);
  game.drops = []; game.buds.filter(b => !b.geode).forEach(b => { b.bloomed = true; });
  game.strike(geode); assert.equal(geode.bloomed, false); game.strike(geode);
  const gems = game.buds.filter(b => b.gem);
  assert.equal(geode.bloomed, true); assert.equal(gems.length, 3); assert(gems.every(g => g.group === geode.group && !g.bloomed));
  assert(game.drainEvents().some(e => e.type === 'geode' && e.count === 3));
  advance(game, 1); assert.equal(game.wave, 1, 'the gems hold the wave open');
  gems.forEach(g => game.strike(g)); advance(game, 1); assert.equal(game.wave, 2);
  const boss = started(8, 10), big = boss.buds.find(b => b.boss);
  boss.drops = []; while (!big.bloomed) boss.strike(big);
  advance(boss, 2.5);
  assert.equal(boss.buds.filter(b => b.gem).length, 0, 'a big bloom opens geodes without scattering gems');
  assert(boss.buds.every(b => b.bloomed));
});
test('Briars grow back unless the whole patch blooms in time', () => {
  const game = started(9, 1), patch = game.buds.filter(b => b.briar && b.group === game.buds.find(x => x.briar).group);
  game.drops = [];
  assert.equal(patch.length, 3); assert(patch.every(b => !b.relay));
  game.strike(patch[0]); game.strike(patch[1]);
  assert(patch.every(b => b.regrowAt > game.time));
  advance(game, 4.9); assert(patch[0].bloomed && patch[1].bloomed, 'still waiting');
  advance(game, .2);
  assert(patch.every(b => !b.bloomed && b.hp === b.maxHp), 'the patch grew back');
  assert(game.drainEvents().some(e => e.type === 'regrow' && e.count === 2));
  patch.forEach(b => game.strike(b)); advance(game, 6);
  assert(patch.every(b => b.bloomed && !b.regrowAt), 'a whole patch stays bloomed');
});
test('A practice bot clears every level, and the levels get harder', () => {
  const good = { noise: 2.5, think: .3, thinkSpread: .3, bounces: 2 }, average = { noise: 4, think: .5, thinkSpread: .5, bounces: 1 };
  const lost = [];
  for (const id of ids) {
    for (let s = 1; s <= 2; s++) assert.equal(bot.play(id, { seed: s * 31 + id, ...good }).won, true, `a good player clears level ${id}`);
    let livesLost = 0;
    for (let s = 1; s <= 3; s++) { const run = bot.play(id, { seed: s * 7919 + id, ...average }); livesLost += run.won ? 3 - run.lives : 3 + (10 - run.wave); }
    lost.push(livesLost);
  }
  observations.averagePlayerLivesLost = lost;
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
  assert(lost[0] <= 1, 'the first level is gentle'); assert(lost[3] > lost[0] && lost[3] >= lost[1], 'the fourth level is the hardest free one');
  assert(mean(lost.slice(4)) > mean(lost.slice(0, 3)), 'the deeper levels are harder than the first three');
  assert(lost[9] > lost[0], 'the last level is harder than the first');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, observations, results };
fs.writeFileSync(path.join(__dirname, 'depths-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
