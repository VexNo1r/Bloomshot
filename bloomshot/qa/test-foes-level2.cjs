'use strict';
// Level 2's new pieces: the Rolypoly and the Peekaboo Mole. Each is checked the same way: where the level places it,
// what a credited seed, a chain and an uncredited strike do to it, that it plays the same at 30, 60 and 144 FPS, that it
// never costs a life it should not, and what the practice bot thinks of it.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Engine = require('../engine.js'), bot = require('./depths-bot.cjs');
const { sandbox, advance, strikeOut, foesOf, Foes, Depths, RushGame } = require('./foe-harness.cjs');
const results = []; let serial = 0;
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
// A credited seed touching `bud` with contact normal (nx, ny) (pointing from the piece toward the seed), resolved the
// way the ball loop resolves a touch.
function touch(game, bud, nx = 0, ny = 1, extra = {}) {
  game.striker = { id: 'seed' + ++serial, bossContact: { nx, ny }, touches: 0, streak: 0, walls: 0, bounces: 0, age: 0, gateAt: -100, petalAt: -100, ...extra };
  game.strike(bud); const seed = game.striker; game.striker = null; return seed;
}
function level(id, wave) {
  const game = new RushGame({ plan: { id, name: 'Test', waves: 1, wave: () => Depths.wave(id, wave) }, startWave: 1 });
  game.started = true; game.drainEvents(); return game;
}
const foeKinds = events => events.filter(e => e.type === 'foe').map(e => e.kind);

// ── Rolypoly (Level 2, `rolypoly`) ──
test('Rolypolies debut in Level 2 wave 2 with their hint, and come back in L2 W5, L2 W8 and L3 W7', () => {
  const w = Depths.wave(2, 2), rolls = w.buds.filter(b => b.foe === 'rolypoly');
  assert.equal(rolls.length, 2); assert.equal(w.hint, 'Bump a rolypoly and it bowls into the rest!');
  assert(w.hint.length <= 52);
  for (const b of rolls) { assert.equal(b.r, 12); assert.equal(b.type, 'lilac'); assert.equal(b.hp, 1); assert(!b.inert && !b.decoy); assert.equal(b.id, b.group); }
  assert.deepEqual(rolls.map(b => b.id), ['d2-2-foe0', 'd2-2-foe1']);
  for (const [l, n, count] of [[2, 5, 1], [2, 8, 2], [3, 7, 2]]) assert.equal(Depths.wave(l, n).buds.filter(b => b.foe === 'rolypoly').length, count, `L${l} W${n}`);
  for (let l = 1; l <= 10; l++) for (const n of [1, 10]) assert(!Depths.wave(l, n).buds.some(b => b.foe), `no foes in L${l} W${n}`);
  assert(!Depths.wave(2, 6).buds.some(b => b.foe), 'the checkpoint wave keeps its ids');
});
test('A credited touch curls it, it rolls away from the touch as a ghost, bowls pins as credited chains, then blooms', () => {
  const game = level(2, 2), roly = foesOf(game, 'rolypoly')[1], before = { x: roly.x, y: roly.y };
  const seed = touch(game, roly, .6, .8);
  assert(roly.roll && roly.ghost && !roly.bloomed, 'curled, a ghost, not bloomed');
  assert(roly.roll.dx < 0 && roly.roll.dy < 0, 'it heads away from the touch (up and to the left)');
  assert.deepEqual(foeKinds(game.drainEvents()), ['rolypoly:curl']);
  advance(game, .07, 120); assert.deepEqual([roly.x, roly.y], [before.x, before.y], 'no motion during the .08 s curl');
  const events = []; for (let t = 0; t < 2.5; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); }
  const kinds = foeKinds(events);
  assert.equal(kinds[0], 'rolypoly:roll'); assert(kinds.includes('rolypoly:end'));
  assert(roly.bloomed && !roly.ghost, 'it uncurls and blooms itself');
  const bowls = events.filter(e => e.kind === 'rolypoly:bowl');
  assert(bowls.length >= 1 && bowls.length <= 4, 'it bowled one to four pins');
  assert.deepEqual(bowls.map(e => e.k), bowls.map((e, i) => i + 1), 'each pin counts up');
  // Each pin blooms outright (a bud of two or three hits too), and every bloom of the roll is the seed's.
  for (const bowl of bowls) assert(events.some(e => e.type === 'bloom' && e.bud === bowl.target), 'the pin bloomed');
  const blooms = events.filter(e => e.type === 'bloom');
  assert(blooms.length >= 1 && blooms.every(e => e.seed === seed.id), 'every bloom of the roll is credited to the seed that bowled it');
});
test('A roll plays out the same at 30, 60 and 144 FPS', () => {
  const runs = [30, 60, 144].map(fps => {
    const game = level(2, 2), roly = foesOf(game, 'rolypoly')[0];
    touch(game, roly, -.5, .85);
    const log = []; for (let t = 0; t < 3; t += 1 / fps) { game.step(1 / fps); for (const e of game.drainEvents()) if (e.type === 'foe' || e.type === 'bloom') log.push(`${e.type}:${e.kind || e.bud.id}:${(e.x ?? e.bud.x).toFixed(3)}`); }
    return { log: log.join(' '), score: game.score, at: `${roly.x.toFixed(4)},${roly.y.toFixed(4)}` };
  });
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});
test('A chain, a power or an uncredited strike blooms it plainly, with no roll', () => {
  let game = level(2, 2), roly = foesOf(game, 'rolypoly')[0];
  assert.equal(strikeOut(game, roly), 1); assert(roly.bloomed && !roly.roll);
  game = level(2, 2); roly = foesOf(game, 'rolypoly')[0];
  game.due = { id: roly.id, by: 'seed-x', via: 'puff', depth: 1 }; game.strike(roly, true); game.due = null;
  assert(roly.bloomed && !roly.roll, 'a credited chain blooms it where it stands');
  game = level(2, 2); roly = foesOf(game, 'rolypoly')[0];
  touch(game, roly, 0, 1, { power: 'beeline' }); assert(roly.bloomed && !roly.roll, 'a power seed blooms it');
});
test('Seeds pass through a rolling rolypoly, and a roll aimed at the line turns back without costing a life', () => {
  const game = level(2, 2), roly = foesOf(game, 'rolypoly')[0];
  touch(game, roly, 0, -1); advance(game, .1, 120);
  assert(roly.ghost);
  const probe = Engine.earliest({ bumpers: [], gates: [], buds: [roly] }, { x: roly.x, y: roly.y + 40 }, { x: 0, y: -80 });
  assert.equal(probe, null, 'the engine skips a ghost');
  let low = 0; const lives = game.lives;
  for (let t = 0; t < 1.3; t += 1 / 120) { game.step(1 / 120); low = Math.max(low, roly.y + roly.r); }
  assert(low <= game.dangerY - 20 + 6, `it stayed above the soft floor (lowest ${low.toFixed(1)})`);
  assert.equal(game.lives, lives);
});
test('A Lullaby freezes a roll where it is, and it carries on after', () => {
  const game = level(2, 2), roly = foesOf(game, 'rolypoly')[0];
  touch(game, roly, -.7, .7); advance(game, .3, 120);
  game.lullaby = 1; const at = [roly.x, roly.y]; advance(game, .5, 120);
  assert.deepEqual([roly.x, roly.y], at, 'frozen');
  advance(game, 2, 120); assert(roly.bloomed, 'it finishes once the Lullaby is over');
});
test('The bot values a rolypoly by the pins its roll would cross, and forecasts a rolling one as a ghost', () => {
  const game = level(2, 2), roly = foesOf(game, 'rolypoly')[1];
  const preview = Foes.rollPreview(game, roly, .6, .8);
  assert(preview.touches >= 1 && preview.touches <= 4);
  assert.equal(Foes.value(game, { bud: roly, nx: .6, ny: .8 }), 12 * preview.touches);
  assert.equal(Foes.moves(game).length, 0, 'idle rolypolies are plain sitters');
  touch(game, roly, .6, .8); advance(game, .2, 120);
  assert.deepEqual(Foes.moves(game), [roly]);
  const out = Foes.predict(game, roly, .5, {}); assert.equal(out.flags & 2, 2);
  // The real bot plays a Level 2 opening with rolypolies in it without error.
  const run = bot.play(2, { seed: 7, startWave: 2, waves: 1 });
  assert(run && typeof run === 'object');
});

// ── Peekaboo Mole (Level 2, `mole`) ──

// Shared rules every foe keeps.
test('foes.js never touches the seed pod and never uses Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, '../foes.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\.(pod|podGrow|shotGap)\b/.test(source), 'no seed pod access');
  assert(!/Math\.random/.test(source), 'no Math.random');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'foes-level2-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
