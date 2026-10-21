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
const moleParts = game => { const mole = foesOf(game, 'mole')[0]; return { mole, hills: [0, 1, 2].map(k => game.buds.find(b => b.id === `${mole.group}-${k}`)) }; };
// Steps at 120 Hz until the foe clock reaches `clock` (a Lullaby stops the foe clock, so this counts game ticks too).
function toClock(game, clock, events = []) { for (let n = 0; n < 12000 && game.foeClock < clock - 1e-9; n++) { game.step(1 / 120); events.push(...game.drainEvents()); } return events; }
// The straightest aim whose guide ends on `bud` (the aim guide is the engine's own trace, ghosts and hidden pieces skipped).
function aimAt(game, bud) {
  let best = null;
  for (let a = -Math.PI + .1; a < -.1; a += .001) {
    const pts = game.trace(Math.cos(a) * 100, Math.sin(a) * 100);
    if (pts.target === bud && pts.length === 2) { const off = Math.abs(a - Math.atan2(bud.y - game.launcher.y, bud.x - game.launcher.x)); if (!best || off < best.off) best = { angle: a, off }; }
  }
  return best && best.angle;
}
// Fires a real seed along `angle` and steps tick by tick until `until(events)` or `seconds` pass.
function fireAt(game, angle, until = () => false, seconds = 1.5) {
  game.shotGap = 0; game.pod = Math.max(game.pod, 1);
  assert(game.fire(Math.cos(angle), Math.sin(angle)), 'the seed fires');
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); if (until(events)) break; }
  return events;
}
test('Peekaboo Moles debut in Level 2 wave 5 with their hint, three hills and a hidden mole, and come back in L2 W7, L2 W9 and L4 W6', () => {
  const w = Depths.wave(2, 5), hills = w.buds.filter(b => b.foe === 'molehill'), mole = w.buds.find(b => b.foe === 'mole');
  assert.equal(w.hint, 'Moles pop up! Watch which hill rumbles.'); assert(w.hint.length <= 52);
  assert.equal(Foes.hint('molehill'), w.hint, 'a molehill teaches the mole hint');
  assert.deepEqual(hills.map(b => [b.id, b.group, b.x, b.y, b.r, b.type, b.hp, b.slot]), [0, 1, 2].map(k => [`d2-5-foe0-${k}`, 'd2-5-foe0', 276 + 34 * k, 268, 12, 'gold', 1, k]));
  assert.deepEqual([mole.id, mole.group, mole.r, mole.type, mole.hp, mole.hidden, mole.up], ['d2-5-foe0-3', 'd2-5-foe0', 10, 'coral', 1, true, 1.5]);
  for (const b of [...hills, mole]) assert(!b.inert && !b.decoy, `${b.id} is a real piece`);
  for (const [l, n, x, up] of [[2, 7, 110, 1.5], [2, 9, 280, 1.5], [4, 6, 90, 1.2]]) {
    const buds = Depths.wave(l, n).buds;
    assert.deepEqual(buds.filter(b => b.foe === 'molehill').map(b => b.x), [x - 34, x, x + 34], `L${l} W${n} hills`);
    assert.equal(buds.find(b => b.foe === 'mole').up, up, `L${l} W${n} up`);
  }
  // Each pop spot has a clear straight line of fire from the launcher at the debut: with his hill letting seeds
  // through, the mole is the first thing a straight shot meets.
  for (let k = 0; k < 3; k++) {
    const spot = { ...mole, x: hills[k].x, y: hills[k].y - 4, hidden: false };
    const buds = [...w.buds.filter(b => b.foe !== 'mole' && b !== hills[k]), spot], from = { x: 210, y: 498 };
    const d = { x: (spot.x - from.x) * 2, y: (spot.y - from.y) * 2 }, hit = Engine.earliest({ bumpers: w.bumpers, gates: [], buds }, from, d);
    assert(hit && hit.item === spot, `pop spot ${k} is in the clear`);
  }
});
test('A hidden mole rumbles under hill floor(hash01(G, 0) * 3) from .5 s, pops up there at 1.2 s, ducks and moves on', () => {
  const game = level(2, 5), { mole, hills } = moleParts(game), k = Math.floor(Foes.hash01(mole.group, 0) * 3);
  assert(mole.hidden && mole.phase === 'wait');
  assert.deepEqual([mole.x, mole.y], [hills[k].x, hills[k].y - 4], 'he waits under his first hill');
  let events = toClock(game, .49);
  assert(!foeKinds(events).length && hills.every(h => h.rumbleUntil < 0), 'no tell before .5 s');
  events = toClock(game, .51);
  assert.deepEqual(foeKinds(events), ['mole:rumble']);
  assert(Math.abs(hills[k].rumbleUntil - 1.2) < 1e-9, `hill ${k} rumbles until 1.2 (got ${hills[k].rumbleUntil})`);
  assert(hills.every((h, j) => j === k || h.rumbleUntil < 0), 'only that hill rumbles');
  events = toClock(game, 1.19);
  assert.deepEqual(foeKinds(events), ['mole:rumble'], 'a second thump .35 s into the rumble');
  assert(mole.hidden && hills.every(h => !h.ghost), 'still hidden at 1.19 s');
  events = toClock(game, 1.21);
  assert.deepEqual(foeKinds(events), ['mole:pop']);
  assert(!mole.hidden && mole.phase === 'up', 'visible at 1.21 s');
  assert.deepEqual([mole.x, mole.y], [hills[k].x, hills[k].y - 4], 'he peeks out of his hill');
  assert.deepEqual(hills.map(h => Boolean(h.ghost)), [0, 1, 2].map(j => j === k), 'his hill lets seeds through to him');
  // He ducks after `up` (1.5 s), still hittable for .2 s, then hides and the next hill takes up the rumble.
  events = toClock(game, 2.71);
  assert.deepEqual(foeKinds(events), ['mole:duck']); assert(!mole.hidden && hills[k].ghost, 'still up while he ducks');
  events = toClock(game, 2.91);
  const next = (k + 1 + Math.floor(Foes.hash01(mole.group, 1) * 2)) % 3;
  assert.deepEqual(foeKinds(events), ['mole:rumble']);
  assert(mole.hidden && !hills[k].ghost && mole.hill === next && next !== k, `the next rumble is under hill ${next}`);
  assert(Math.abs(hills[next].rumbleUntil - 3.6) < 1e-9, 'a new .7 s rumble');
});
test('A seed that meets a hill while the mole hides bounces off it (molehill:guard, no refund); chains, powers and strikes bloom a hill plainly', () => {
  const game = level(2, 5), { hills } = moleParts(game);
  game.descentSpeed = 0;
  const hill = hills.find(h => { const a = aimAt(game, h); return a != null; }), angle = aimAt(game, hill), refunds = game.refunds || 0;
  assert(angle != null, 'a straight shot reaches a hill');
  const events = fireAt(game, angle, list => list.some(e => e.kind === 'molehill:guard' || e.type === 'bloom'));
  assert(events.some(e => e.type === 'foe' && e.kind === 'molehill:guard' && e.bud === hill), 'the seed was turned away');
  assert(!hill.bloomed && (game.refunds || 0) === refunds, 'solid dirt: no bloom, no refund');
  // The rule itself: only a credited, unpowered seed is turned away.
  game.striker = { id: 'probe' }; assert.equal(Foes.guard(game, hill, { nx: 0, ny: 1 }, game.striker), true);
  game.striker = { id: 'probe', power: 'beeline' }; assert.equal(Foes.guard(game, hill, { nx: 0, ny: 1 }, game.striker), false, 'a power seed goes in');
  game.striker = null; assert.equal(Foes.guard(game, hill, { nx: 0, ny: 1 }, {}), false, 'an uncredited touch goes in');
  let g = level(2, 5); assert.equal(strikeOut(g, moleParts(g).hills[0]), 1, 'an uncredited strike blooms a hill at once');
  g = level(2, 5); const chained = moleParts(g).hills[2];
  g.due = { id: chained.id, by: 'seed-x', via: 'puff', depth: 1 }; g.strike(chained, true); g.due = null;
  assert(chained.bloomed, 'a credited chain blooms a hill');
  g = level(2, 5); const bee = moleParts(g).hills[1]; touch(g, bee, 0, 1, { power: 'beeline' }); assert(bee.bloomed, 'a Bee Line seed blooms a hill');
});
test('Bonk: a seed through his hill blooms the mole, then his three hills bloom within .4 s as chains the seed earned', () => {
  const game = level(2, 5), { mole, hills } = moleParts(game);
  game.descentSpeed = 0; toClock(game, 1.25); game.drainEvents();
  const angle = aimAt(game, mole);
  assert(angle != null, 'the aim guide ends on the mole through his ghost hill');
  const events = fireAt(game, angle, list => list.some(e => e.type === 'bloom'));
  const bonk = events.find(e => e.type === 'foe' && e.kind === 'mole:bonk'), seed = events.find(e => e.type === 'bloom' && e.bud === mole);
  assert(mole.bloomed && bonk && seed && seed.seed != null, 'bonked and bloomed by the seed');
  assert(!events.some(e => e.kind === 'molehill:guard'), 'the seed passed through his hill');
  const at = game.time, after = [];
  while (game.time < at + .4 && !hills.every(h => h.bloomed)) { game.step(1 / 120); after.push(...game.drainEvents()); }
  assert(hills.every(h => h.bloomed && !h.ghost), `all three hills bloomed within .4 s (${(game.time - at).toFixed(3)} s)`);
  const blooms = after.filter(e => e.type === 'bloom' && hills.includes(e.bud));
  assert.equal(blooms.length, 3); assert(blooms.every(e => e.seed === seed.seed && e.via === 'mole' && e.chain), 'credited chains via the mole');
  assert.equal(blooms[0].bud, hills[mole.hill], 'his own hill first');
  // A plain credited touch (the ball loop's own strike) bonks him too.
  const g = level(2, 5); toClock(g, 1.25); g.drainEvents();
  touch(g, moleParts(g).mole); assert(foeKinds(g.drainEvents()).includes('mole:bonk'));
});
test('Chains, powers and uncredited strikes reach the mole even underground and bloom him plainly, with no bonk', () => {
  let game = level(2, 5), { mole, hills } = moleParts(game);
  toClock(game, .3); game.drainEvents();
  assert.equal(strikeOut(game, mole), 1, 'strike(hiddenMole, true) blooms him');
  assert(mole.bloomed && !mole.hidden, 'his flower shows');
  advance(game, .4, 120);
  const kinds = foeKinds(game.drainEvents());
  assert(!kinds.includes('mole:bonk') && hills.every(h => h.bloomed), 'no bonk, but his hills still follow him');
  game = level(2, 5); ({ mole } = moleParts(game)); toClock(game, .8); game.drainEvents();
  game.due = { id: mole.id, by: 'seed-x', via: 'puff', depth: 1 }; game.strike(mole, true); game.due = null;
  assert(mole.bloomed && !foeKinds(game.drainEvents()).includes('mole:bonk'), 'a credited chain blooms him mid-rumble, no bonk');
  game = level(2, 5); ({ mole } = moleParts(game)); toClock(game, 1.3); game.drainEvents();
  touch(game, mole, 0, 1, { power: 'beeline' });
  assert(mole.bloomed && !foeKinds(game.drainEvents()).includes('mole:bonk'), 'a power seed blooms him, no bonk');
});
test('The no-dive rule: low on the board (y + 10 > 360) or with no other open hill, he stays up', () => {
  let game = level(2, 5), { mole, hills } = moleParts(game);
  game.descentSpeed = 8; toClock(game, 1.25);
  const drop = 355 - hills[0].y; for (const b of [...hills, mole]) b.y += drop;
  let hid = false, events = [];
  for (let t = 0; t < 5; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); hid = hid || mole.hidden; }
  assert(!hid && mole.phase === 'stay' && !mole.bloomed, 'up for all 5 s');
  assert(mole.y + 10 > 360 && !foeKinds(events).includes('mole:duck') && hills[mole.hill].ghost);
  assert.equal(game.lives, 3);
  game = level(2, 5); ({ mole, hills } = moleParts(game)); toClock(game, 1.25);
  for (const h of hills) if (h !== hills[mole.hill]) strikeOut(game, h);
  hid = false; events = [];
  for (let t = 0; t < 5; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); hid = hid || mole.hidden; }
  assert(!hid && mole.phase === 'stay' && !foeKinds(events).includes('mole:duck'), 'with no other hill to go to he stays up');
});
test('Every hill chain-bloomed while he hides: he rumbles .7 s where the last one was, pops up there and stays up', () => {
  const game = level(2, 5), { mole, hills } = moleParts(game);
  toClock(game, .2); game.drainEvents();
  for (const k of [1, 0, 2]) { game.due = { id: hills[k].id, by: 'seed-x', via: 'puff', depth: 1 }; game.strike(hills[k], true); game.due = null; }
  assert(hills.every(h => h.bloomed) && mole.hidden);
  const start = game.foeClock; game.step(1 / 120);
  const last = hills[2];
  assert(mole.anchor && mole.phase === 'rumble' && mole.hidden, 'a lost-anchor rumble');
  assert(Math.abs(mole.rumbleUntil - (start + 1 / 120 + .7)) < 1e-6 || Math.abs(mole.rumbleUntil - (start + .7)) < 1e-6, 'it lasts .7 s');
  assert.deepEqual([mole.x, Math.round(mole.y - last.y)], [last.x, -4], 'at the last hill\'s pose');
  assert.deepEqual(Foes.moves(game), [mole], 'his rumble is public');
  let events = toClock(game, mole.rumbleUntil - .02);
  assert(mole.hidden && foeKinds(events).every(k => k === 'mole:rumble') && foeKinds(events).length >= 1, 'the rumble thumps');
  events = toClock(game, mole.rumbleUntil + .02);
  assert(!mole.hidden && foeKinds(events).includes('mole:pop') && mole.phase === 'stay' && mole.loose, 'up, and here to stay');
  const y = mole.y; advance(game, 5, 120);
  assert(!mole.hidden && mole.x === last.x && mole.y > y, 'he stays up, falling with the board');
  assert(game.buds.includes(mole) && !mole.bloomed, 'the wave waits for him');
});
test('A mole plays out the same at 30, 60 and 144 FPS, a Lullaby holds his dance still, and his group costs one life', () => {
  const runs = [30, 60, 144].map(fps => {
    const game = level(2, 5), { mole } = moleParts(game), log = [];
    for (let f = 0; f < 9 * fps; f++) { game.step(1 / fps); for (const e of game.drainEvents()) if (e.type === 'foe') log.push(`${e.kind}:${e.x.toFixed(3)}:${e.y.toFixed(3)}:${e.time.toFixed(4)}`); }
    return { log: log.join(' '), mole: [mole.phase, mole.hidden, mole.x, mole.y.toFixed(6), mole.n] };
  });
  assert(runs[0].log.includes('mole:pop'));
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
  // A Lullaby mid-rumble: the foe clock, the rumble and the pop all wait.
  const game = level(2, 5), { mole, hills } = moleParts(game);
  toClock(game, .9); game.drainEvents();
  const until = mole.rumbleUntil, clock = game.foeClock, at = [mole.x, mole.y];
  game.lullaby = 1; advance(game, .9, 120);
  assert.deepEqual([game.foeClock, mole.phase, mole.hidden, mole.rumbleUntil, mole.x, mole.y], [clock, 'rumble', true, until, ...at], 'frozen');
  assert.deepEqual(foeKinds(game.drainEvents()), [], 'no thump while asleep');
  advance(game, .5, 120); assert(!mole.hidden, 'he pops once the Lullaby is over');
  // Down at the line, his three hills and he are one group: one life.
  const low = level(2, 5), parts = moleParts(low), sink = 440 - parts.hills[0].y;
  for (const b of [...parts.hills, parts.mole]) b.y += sink;
  low.step(1 / 120);
  assert.equal(low.lives, 2); assert(!low.buds.some(b => b.group === parts.mole.group), 'the group left the board');
  assert.equal(hills.length, 3);
});
test('The bot sees a hidden mole once his rumble is public: hidden until rumbleUntil, his hill a ghost from then; hills are -1, a mole +30', () => {
  const game = level(2, 5), { mole, hills } = moleParts(game), k = mole.hill;
  toClock(game, .3);
  assert.deepEqual(Foes.moves(game), [], 'before the rumble nothing is public');
  assert(!bot.prepareTrace(game).state.buds.some(b => b.id === mole.id), 'the bot cannot see him');
  toClock(game, .9);
  assert.deepEqual(Foes.moves(game).map(b => b.id).sort(), [hills[k].id, mole.id].sort(), 'the mole and his rumbling hill');
  const out = {}, left = mole.rumbleUntil - game.foeClock;
  for (const s of [0, .1, left - .02]) { Foes.predict(game, mole, s, out); assert.equal(out.flags & 1, 1, `hidden at +${s}`); Foes.predict(game, hills[k], s, out); assert.equal(out.flags & 2, 0); }
  for (const s of [left + .01, 1, 1.4]) {
    Foes.predict(game, mole, s, out); assert.equal(out.flags & 1, 0, `up at +${s}`);
    assert(Math.abs(out.y - (mole.y + game.descentSpeed * s)) < 1e-9, 'he rides his falling hill');
    Foes.predict(game, hills[k], s, out); assert.equal(out.flags & 2, 2, 'his hill lets seeds through');
  }
  // The bot's own forecast slices agree (stride 4: x, y, r, flags).
  const prepared = bot.prepareTrace(game), slot = prepared.moving.find(m => m.original === mole), first = Math.ceil(left * 60) + 1;
  assert.equal(slot.future[3], 1); assert.equal(slot.future[first * 4 + 3], 0);
  // A straight shot at his pop spot now meets the mole, not the hill: the bot can lead the rumble.
  const angle = Math.atan2(mole.y - game.launcher.y, mole.x - game.launcher.x), hit = bot.trace(game, angle, 3, prepared);
  assert(hit && hit.bud.id === mole.id, `the bot's trace meets the mole (${hit && hit.bud.id})`);
  assert.equal(Foes.value(game, { bud: hit.bud, nx: hit.nx, ny: hit.ny }), 30);
  assert(bot.value(game, hit, .1, prepared) > 0);
  assert.equal(Foes.value(game, { bud: hills[(k + 1) % 3], nx: 0, ny: 1 }), -1, 'a hill is never worth a seed');
  assert.equal(bot.value(game, { bud: { ...hills[(k + 1) % 3] }, nx: 0, ny: 1, time: .3 }, .1, prepared), -1);
  // The real bot plays the debut wave on through the level without error.
  const run = bot.play(2, { seed: 11, startWave: 5 });
  assert(run && typeof run === 'object' && run.wave >= 5);
});

// Shared rules every foe keeps.
test('foes.js never touches the seed pod and never uses Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, '../foes.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\.(pod|podGrow|shotGap)\b/.test(source), 'no seed pod access');
  assert(!/Math\.random/.test(source), 'no Math.random');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'foes-level2-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
