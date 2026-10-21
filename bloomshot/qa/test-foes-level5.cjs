'use strict';
// Level 5's new pieces: the Moon Jelly (with its vents and glowdrops) and the Glowworm. Each is checked the same way:
// where the level places it, what a credited seed, a chain, a power and an uncredited strike do to it, that it plays the
// same at 30, 60 and 144 FPS, that it never costs a life it should not, what the practice bot thinks of it, and that its
// art stays cheap and readable with Animations on and off.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const bot = require('./depths-bot.cjs');
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
// The Level 5 guardian's arena, as the boss suite builds it (only the guardian and its parts on the board).
function arena(id) {
  const game = new RushGame({ plan: bot.plan(id), startWave: 10 });
  game.started = true; game.status = 'flying'; game.descentSpeed = 0; game.drops = [];
  game.buds = game.buds.filter(b => b.boss || b.bossPart); game.bossState.boss.bossFall = 0; return game;
}
const foeKinds = events => events.filter(e => e.type === 'foe').map(e => e.kind);
const TICK = 1 / 120;
// One fixed game tick, returning what it caused.
function tick(game) { game.step(TICK); return game.drainEvents(); }
// Ticks until `done(events)` says so (or `seconds` pass); returns every event on the way.
function until(game, done, seconds = 12) {
  const all = [];
  for (let n = 0; n < seconds * 120; n++) { const events = tick(game); all.push(...events); if (done(events, all)) return all; }
  throw new Error('timed out after ' + seconds + ' s');
}
const spawned = events => events.find(e => e.type === 'foe' && e.kind === 'jelly:spawn');
// The game's first jelly (from L5 W2's left vent), stepped to `age` s after it left the vent.
function firstJelly(game, age = 0) {
  const at = spawned(until(game, spawned)).bud;
  for (let n = 0; n < Math.round(age * 120); n++) tick(game);
  return at;
}
// A real seed fired straight up at `bud` from 26 px below it; ticks until the seed has touched it (or is gone).
function seedUp(game, bud, power) {
  game.spawnBall({ x: bud.x, y: bud.y + 26, angle: -Math.PI / 2, power }, true);
  const ball = game.balls[game.balls.length - 1], events = [];
  for (let n = 0; n < 60 && !ball.touches && game.balls.includes(ball); n++) events.push(...tick(game));
  return { ball, events };
}
const phase = (game, bud) => { const t = game.foeClock - bud.born; return t - .9 * Math.floor(t / .9); };

// ── Moon Jelly (Level 5, `jelly`) ──
test('Moon jellies debut from two vents in Level 5 wave 2 with their hint, and vents come back only in L5 W6, W8 and W9', () => {
  const w = Depths.wave(5, 2);
  assert.deepEqual(w.vents, [{ id: 'd5-2-vent-0', x: 110, y: 400, first: 2, every: 4, count: 2 }, { id: 'd5-2-vent-1', x: 310, y: 400, first: 4, every: 4, count: 2 }]);
  assert.equal(w.hint, 'Moon jellies rise. Hit them when they glide!'); assert(w.hint.length <= 52);
  assert.equal(Foes.hint('jelly'), w.hint); assert.equal(Foes.hint('glowdrop'), w.hint, 'a glowdrop is the jelly family');
  assert(!w.buds.some(b => b.foe), 'the jellies come only from the vents');
  for (let l = 1; l <= 10; l++) for (let n = 1; n <= 10; n++) {
    const vents = Depths.wave(l, n).vents || [], expected = l === 5 ? { 2: 2, 6: 2, 8: 1, 9: 1 }[n] || 0 : 0;
    assert.equal(vents.length, expected, `vents in L${l} W${n}`);
  }
});
test('The first jelly leaves its vent at foe time 2.0 at (110, 400), then rises exactly 40 px a pulse and sways back to the middle', () => {
  const game = level(5, 2), events = until(game, spawned), e = spawned(events), jelly = e.bud;
  assert(Math.abs(game.foeClock - 2) < 1e-6, `spawned at ${game.foeClock}`);
  assert.deepEqual([e.x, e.y, e.n], [110, 400, 1]);
  assert.equal(jelly.id, 'd5-2-vent-0-j0'); assert.equal(jelly.group, jelly.id); assert.equal(jelly.foe, 'jelly');
  assert.deepEqual([jelly.x, jelly.y, jelly.r, jelly.hp, jelly.type], [110, 400, 11, 1, 'sky']);
  for (let n = 1; n <= 12; n++) tick(game);
  assert(Number.isFinite(jelly.y) && Number.isFinite(jelly.x) && jelly.y < 400, '.1 s later it has a real place, above the vent');
  const later = [];
  for (let k = 1; k <= 8; k++) {
    while (Math.round((game.foeClock - jelly.born) * 120) < 108 * k) later.push(...tick(game));
    assert(Math.abs(jelly.y - (400 - 40 * k)) < 1e-6, `y(${(.9 * k).toFixed(1)}) = ${jelly.y}`);
    assert(Math.abs(jelly.x - 110) < 1e-6, `x(${(.9 * k).toFixed(1)}) = ${jelly.x}`);
  }
  const second = later.filter(e => e.kind === 'jelly:spawn').map(e => e.bud).find(b => b.id === 'd5-2-vent-1-j0');
  assert(second && Math.abs(second.born - 4) < 1e-6 && second.x0 === 310 && second.y0 === 400, 'the right vent sends its first at 4.0');
});
test('A guardian can place a jelly or a glowworm mid-fight with make and place, and each starts moving at once', () => {
  const game = arena(5), jelly = Foes.place(game, Foes.make('jelly', ['jelly', 150, 330], 'lily-pad-j0', null)[0]);
  assert.equal(jelly.id, 'lily-pad-j0'); assert.equal(jelly.group, 'lily-pad-j0');
  assert.deepEqual([jelly.hitAt, jelly.bloomAt, jelly.bloomed], [-100, -100, false]); assert(Number.isFinite(jelly.spawnAt));
  advance(game, .1, 120);
  assert(Number.isFinite(jelly.y) && jelly.y < 330 && Math.abs(jelly.x - 150) < 8, `the pad jelly rose (${jelly.x}, ${jelly.y})`);
  const worm = Foes.make('glowworm', ['glowworm', 200, 150, { dir: 1 }], 'lily-w0', null);
  assert.deepEqual(worm.map(b => b.id), ['lily-w0-0', 'lily-w0-1', 'lily-w0-2', 'lily-w0-3', 'lily-w0-4']);
  for (const piece of worm) Foes.place(game, piece);
  advance(game, .5, 120);
  assert(worm.every(b => Number.isFinite(b.x) && Number.isFinite(b.y) && !b.bloomed));
  assert(Math.abs(worm[0].x - (200 + 27)) < .5, `the head crawled 27 px right (${worm[0].x})`);
});
test('A credited seed slides off a jelly in its thrust (jelly:guard) and blooms it in the glide; a Bee Line blooms it in either', () => {
  let game = level(5, 2), jelly = firstJelly(game, .91);
  assert(phase(game, jelly) < .05, 'the second pulse just started');
  let shot = seedUp(game, jelly);
  assert(phase(game, jelly) < .3, 'the touch came in the thrust');
  assert.deepEqual(foeKinds(shot.events), ['jelly:guard']); assert(!jelly.bloomed); assert(shot.ball.vy > 0, 'the seed bounced back down');
  assert(!shot.events.some(e => e.type === 'bloom'));
  game = level(5, 2); jelly = firstJelly(game, 1.35); shot = seedUp(game, jelly);
  assert(phase(game, jelly) >= .3, 'the touch came in the glide');
  assert(jelly.bloomed); const bloom = shot.events.find(e => e.type === 'bloom' && e.bud === jelly);
  assert(bloom && bloom.seed === shot.ball.id && !bloom.chain, 'a credited direct bloom');
  for (const age of [.91, 1.35]) {
    game = level(5, 2); jelly = firstJelly(game, age); shot = seedUp(game, jelly, 'beeline');
    assert(jelly.bloomed, `a Bee Line blooms it at ${age}`); assert(!foeKinds(shot.events).includes('jelly:guard'));
  }
  // A chain or an uncredited strike always blooms it, thrust or not.
  game = level(5, 2); jelly = firstJelly(game, .95); assert(phase(game, jelly) < .3);
  assert.equal(strikeOut(game, jelly), 1);
});
test('A jelly nobody catches bursts at y <= 70 into three glowdrops of one group, which fall and cost one life together', () => {
  const game = level(5, 2); firstJelly(game);
  const jelly = game.buds.find(b => b.id === 'd5-2-vent-0-j0');
  const events = until(game, now => now.some(e => e.kind === 'jelly:burst'));
  const burst = events.find(e => e.kind === 'jelly:burst');
  assert(burst.y <= 70 && burst.y > 40, `burst at y ${burst.y}`); assert(Math.abs(game.foeClock - 9.25) < .02, `at foe time ${game.foeClock}`);
  assert(jelly.bloomed && jelly.popped && !game.buds.includes(jelly), 'the jelly is gone (no score, no bloom)');
  assert(!events.some(e => e.type === 'bloom' && e.bud === jelly));
  const drops = foesOf(game, 'glowdrop');
  assert.equal(drops.length, 3);
  assert.deepEqual(drops.map(b => b.id), ['d5-2-vent-0-j0-drops-0', 'd5-2-vent-0-j0-drops-1', 'd5-2-vent-0-j0-drops-2']);
  assert(drops.every(b => b.group === 'd5-2-vent-0-j0-drops' && b.r === 8 && b.type === 'gold' && b.hp === 1 && b.y === 78 && !b.bloomed));
  const xs = drops.map(b => b.x).sort((a, b) => a - b); assert(xs[1] - xs[0] >= 22 - 1e-9 && xs[2] - xs[1] >= 22 - 1e-9, 'spread 22 px apart');
  advance(game, 1, 120); assert(drops.every(b => b.y > 78), 'they fall like buds');
  for (const drop of drops) drop.y = game.dangerY - drop.r + .5;
  const lives = game.lives, after = tick(game).filter(e => e.type === 'life');
  assert.equal(after.length, 1); assert.equal(after[0].group, 'd5-2-vent-0-j0-drops'); assert.equal(game.lives, lives - 1);
});
test('A burst shifts its glowdrops off pieces in the way, and skips a drop with no room', () => {
  const game = sandbox(5, 2, [], { keepBuds: false }); game.vents = []; game.descentSpeed = 0;
  const plain = (id, x, y) => ({ id, group: id, x, y, baseX: x, startY: y, r: 11, type: 'lilac', hp: 1, maxHp: 1, bloomed: false, hitAt: -100, bloomAt: -100, spawnAt: 0, fall: 1, sway: 0, swayW: 0, swayPhase: 0, relay: false, shield: false });
  // The jelly bursts at x 198.67 (mid-sway); a bud at x 228 blocks the right of the trio, so it moves 22 px left.
  game.buds.push(plain('block', 228, 78));
  const jelly = Foes.place(game, Foes.make('jelly', ['jelly', 200, 120], 'j-test', null)[0]);
  const burst = until(game, now => now.some(e => e.kind === 'jelly:burst'), 3).find(e => e.kind === 'jelly:burst');
  const drops = foesOf(game, 'glowdrop'), xs = drops.map(d => d.x);
  assert.equal(drops.length, 3, 'the trio moved aside as a whole');
  assert.deepEqual(xs.map(x => +(x - burst.x).toFixed(6)), [-44, -22, 0], 'shifted one gap left');
  for (const d of drops) assert(Math.hypot(d.x - 228, d.y - 78) >= 11 + 8 + 6 - 1e-9, `drop at ${d.x} clears the bud`);
  assert(jelly.popped);
  // A row of buds 60 px apart along the burst row: no shift fits more than one drop, so the other two are skipped.
  const crowded = sandbox(5, 2, [], { keepBuds: false }); crowded.vents = []; crowded.descentSpeed = 0;
  for (let x = 40; x <= 380; x += 60) crowded.buds.push(plain('wall' + x, x, 78));
  Foes.place(crowded, Foes.make('jelly', ['jelly', 210, 120], 'j-crowd', null)[0]);
  until(crowded, now => now.some(e => e.kind === 'jelly:burst'), 3);
  const few = foesOf(crowded, 'glowdrop');
  assert.equal(few.length, 1, 'one drop fits');
  for (const d of few) for (const b of crowded.buds.filter(b => !b.foe)) assert(Math.hypot(d.x - b.x, d.y - b.y) >= b.r + 8 + 6 - 1e-9);
});
test('A vent holds the wave open until its last jelly is out, and on an empty board the next jelly comes within a second', () => {
  const game = sandbox(5, 2, [], { keepBuds: false });
  assert(game.foeWave, 'a wave with vents is a foe wave'); assert.equal(game.vents.length, 2);
  // Each jelly is bloomed the moment it is up, so the board is empty from then until the next one.
  let emptySince = 0, spawns = 0;
  for (let n = 0; n < 30 * 120 && game.status !== 'won'; n++) {
    const events = tick(game);
    assert(!events.some(e => e.type === 'cleared' || e.type === 'won') || game.vents.every(v => v.made >= v.count), 'no clear while a vent still has jellies');
    const up = events.filter(e => e.kind === 'jelly:spawn');
    for (const e of up) {
      spawns++;
      assert(game.foeClock - emptySince <= 1 + TICK + 1e-9, `spawn ${spawns} came ${(game.foeClock - emptySince).toFixed(3)} s after the board emptied`);
      assert.equal(strikeOut(game, game.buds.find(b => b.id === e.bud.id)), 1);
    }
    if (up.length) emptySince = game.foeClock;
  }
  assert.equal(spawns, 4); assert.equal(game.status, 'won', 'the level clears once the last jelly is out and gone');
});
test('A piece parked on a vent mouth makes it wait, and the vent sends its jelly within .3 s of the mouth clearing', () => {
  const game = level(5, 2); game.descentSpeed = 0;
  const park = { id: 'park', group: 'park', x: 110, y: 400, baseX: 110, startY: 400, r: 11, type: 'lilac', hp: 1, maxHp: 1, bloomed: false, hitAt: -100, bloomAt: -100, spawnAt: 0, fall: 1, sway: 0, swayW: 0, swayPhase: 0, relay: false, shield: false };
  game.buds.push(park);
  while (game.foeClock < 3) tick(game);
  assert.equal(game.vents[0].made, 0, 'the left vent is still waiting');
  assert(!foesOf(game, 'jelly').length);
  strikeOut(game, park); const cleared = game.foeClock;
  const events = until(game, spawned, 1);
  assert.equal(spawned(events).bud.id, 'd5-2-vent-0-j0');
  assert(game.foeClock - cleared <= .3 + TICK + 1e-9, `it came ${(game.foeClock - cleared).toFixed(3)} s after`);
});
test('A Lullaby freezes a jelly and the vents, and both carry on after', () => {
  const game = level(5, 2), jelly = firstJelly(game);
  while (game.foeClock < 3.8) tick(game);
  game.lullaby = 1; const at = [jelly.x, jelly.y], clock = game.foeClock;
  advance(game, .6, 120);
  assert.deepEqual([jelly.x, jelly.y], at, 'frozen'); assert.equal(game.foeClock, clock);
  assert.equal(game.vents[1].made, 0, 'the right vent waits too');
  const events = until(game, spawned, 1);
  assert(spawned(events).bud.id === 'd5-2-vent-1-j0' && Math.abs(game.foeClock - 4) < 1e-6, 'it spawns at foe time 4.0, after the Lullaby');
  assert(jelly.y < at[1], 'the first jelly rises again');
});
test('A jelly never costs a life, even one that starts below the line', () => {
  const game = sandbox(5, 2, [], { keepBuds: false }); game.vents = [];
  const jelly = Foes.place(game, Foes.make('jelly', ['jelly', 200, 452], 'j-low', null)[0]);
  assert(jelly.y + jelly.r >= game.dangerY);
  const lives = game.lives, events = []; for (let n = 0; n < 120; n++) events.push(...tick(game));
  assert.equal(game.lives, lives); assert(!events.some(e => e.type === 'life'));
  assert.equal(Foes.breach(game, jelly), 'skip');
});
test('The jellies, their vents and their bursts play out the same at 30, 60 and 144 FPS', () => {
  const runs = [30, 60, 144].map(fps => {
    const game = level(5, 2), log = [];
    while (Math.round(game.time * 120) < 1200) { game.step(1 / fps); for (const e of game.drainEvents()) if (e.type === 'foe' || e.type === 'bloom') log.push(`${e.type}:${e.kind || e.bud.id}:${(e.x ?? e.bud.x).toFixed(3)}:${(e.y ?? e.bud.y).toFixed(3)}`); }
    return { log: log.join(' '), at: game.buds.filter(b => b.foe).map(b => `${b.id}@${b.x.toFixed(4)},${b.y.toFixed(4)}`).join(' ') };
  });
  assert(runs[0].log.includes('jelly:burst') && runs[0].log.includes('jelly:spawn'));
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});
test('The bot forecasts a jelly exactly (a Lullaby included), shoots only for its glide, and plays the jelly waves', () => {
  const game = level(5, 2), jelly = firstJelly(game, .2);
  assert(Foes.moves(game).includes(jelly));
  const out = Foes.predict(game, jelly, .45, {});
  for (let n = 0; n < 54; n++) tick(game);
  assert(Math.abs(out.x - jelly.x) < 1e-6 && Math.abs(out.y - jelly.y) < 1e-6 && out.flags === 0, 'the forecast is where it goes');
  assert.equal(Foes.predict(game, jelly, 8, {}).flags & 1, 1, 'gone (burst) 8 s from now');
  game.lullaby = .5; const held = Foes.predict(game, jelly, 1, {}); game.lullaby = 0; const plain = Foes.predict(game, jelly, .5, {});
  assert.deepEqual([held.x, held.y], [plain.x, plain.y], 'a Lullaby holds the forecast');
  // Phase now (hit.time 0): the thrust is a wasted seed, the glide is worth more the higher the jelly is.
  while (phase(game, jelly) > .05) tick(game);
  assert.equal(Foes.value(game, { bud: jelly, nx: 0, ny: 1, time: 0 }), -1, 'not in the thrust');
  assert.equal(Foes.value(game, { bud: jelly, nx: 0, ny: 1, time: .87 }), -1, 'not just before the next thrust');
  const glide = Foes.value(game, { bud: jelly, nx: 0, ny: 1, time: .5 });
  assert(glide >= 10 && glide <= 70, `the glide is worth ${glide}`);
  const run = bot.play(5, { seed: 7, startWave: 2, maxTime: 45 });
  assert(run.wave >= 3, `the bot cleared the jelly wave (reached W${run.wave})`);
});

// ── Glowworm (Level 5, `glowworm`) ──
test('Glowworms debut in Level 5 wave 3 with their hint, five pieces each, and come back in L5 W4, W7, W8 and W9', () => {
  const w = Depths.wave(5, 3);
  assert.equal(w.hint, 'Glowworms! Hit the glowing head.'); assert(w.hint.length <= 52); assert.equal(Foes.hint('glowworm'), w.hint);
  const where = { 3: [304, 206, -1], 4: [250, 250, -1], 7: [250, 171, -1], 8: [150, 236, 1], 9: [180, 70, 1] };
  for (let n = 1; n <= 10; n++) {
    const worm = Depths.wave(5, n).buds.filter(b => b.foe === 'glowworm'), spot = where[n];
    if (!spot) { assert.equal(worm.length, 0, `no glowworm in L5 W${n}`); continue; }
    const G = `d5-${n}-foe0`;
    assert.deepEqual(worm.map(b => b.id), [0, 1, 2, 3, 4].map(k => `${G}-${k}`));
    assert(worm.every(b => b.group === G && b.worm === G && b.hp === 1 && b.dir === spot[2]));
    assert.deepEqual([worm[0].x, worm[0].y, worm[0].r, worm[0].type, worm[0].head], [spot[0], spot[1], 11, 'gold', true]);
    worm.slice(1).forEach((b, i) => {
      const k = i + 1;
      assert.deepEqual([b.x, b.y, b.r, b.type, b.seg, Boolean(b.head)], [spot[0] - spot[2] * (21 + 20 * (k - 1)), spot[1], 9, 'sky', k, false]);
    });
  }
  for (let l = 1; l <= 10; l++) if (l !== 5) for (let n = 1; n <= 10; n++) assert(!Depths.wave(l, n).buds.some(b => b.foe === 'glowworm'));
});
test('L5 W4: the worm keeps 21 / 20 px along its track, and its first turn reaches x 64 and comes back 26 px lower', () => {
  const game = level(5, 4), G = 'd5-4-foe0', worm = foesOf(game, 'glowworm'), head = worm[0], w = game.worms.get(G);
  const gaps = () => worm.slice(1).map((b, i) => +Math.abs(b.x - worm[i].x).toFixed(6));
  assert.deepEqual(gaps(), [21, 20, 20, 20]);
  advance(game, 2, 120);
  assert.deepEqual(gaps(), [21, 20, 20, 20], 'still on the first straight');
  assert(Math.abs(head.x - (250 - 108)) < .01, `it crawls 54 px a second (${head.x})`);
  assert(worm.every(b => Math.abs(b.y - 250 - w.drift) < 1e-9), 'the straight stays level (it only sinks with the wave)');
  assert(w.drift > 0 && Math.abs(w.drift - 2 * game.descentSpeed * .35) < .01, 'it sinks at .35 of the wave');
  let left = Infinity;
  while (head.x > 64) tick(game);
  assert(Math.abs(head.y - w.drift - 250) < .05, 'the turn starts at x 64');
  const start = game.foeClock;
  while (game.foeClock - start < 13 * Math.PI / 54 + .05) { tick(game); left = Math.min(left, head.x); }
  assert(Math.abs(left - 51) < .05, `it turns on a radius of 13 (leftmost ${left})`);
  assert(Math.abs(head.y - w.drift - 276) < .05 && head.x >= 64 && Math.abs(head.heading) < .01, 'back at x 64, 26 px lower, heading right');
  while (worm[4].x < 64.5 || Math.abs(worm[4].heading) > 1e-6) tick(game);
  assert.deepEqual(gaps().map(g => Math.round(g * 100) / 100), [21, 20, 20, 20], 'the same spacing on the next straight');
  assert(worm[0].x > worm[1].x, 'the head leads to the right now');
});
test('A credited head hit ripples the light down the body: four credited blooms, .07 s apart, all done within .35 s', () => {
  const game = level(5, 4), worm = foesOf(game, 'glowworm');
  advance(game, .5, 120);
  const seed = touch(game, worm[0]), first = game.drainEvents(), start = game.time;
  assert(worm[0].bloomed); const ripple = first.find(e => e.kind === 'glowworm:ripple');
  assert(ripple && ripple.n === 4, 'a ripple of four');
  const blooms = [];
  for (let n = 0; n < 42; n++) for (const e of tick(game)) if (e.type === 'bloom') blooms.push({ e, at: game.time - start });
  assert.deepEqual(blooms.map(b => b.e.bud.id), [1, 2, 3, 4].map(k => `d5-4-foe0-${k}`), 'tail-ward, in order');
  blooms.forEach((b, k) => {
    assert(Math.abs(b.at - .07 * (k + 1)) <= TICK + 1e-9, `bead ${k + 1} at ${b.at.toFixed(3)}`);
    assert(b.e.chain && b.e.via === 'worm' && b.e.seed === seed.id, 'a credited worm chain');
  });
  assert(worm.every(b => b.bloomed)); assert.equal(game.worms.size, 1, 'the ripple never splits it');
  assert(!foeKinds(blooms.map(b => b.e)).length);
});
test('A credited bead hit snaps the worm: the beads behind become their own worm, the first one its head, paused .3 s', () => {
  const game = level(5, 4), G = 'd5-4-foe0', worm = foesOf(game, 'glowworm');
  advance(game, 1, 120);
  touch(game, worm[2]); const events = game.drainEvents();
  assert(worm[2].bloomed);
  const split = events.find(e => e.kind === 'glowworm:split');
  assert(split && split.n === 2 && split.head === worm[3]);
  assert(worm[3].head && worm[3].type === 'gold' && worm[3].group === `${G}-s1` && worm[3].worm === `${G}-s1`);
  assert(worm[4].group === `${G}-s1` && !worm[4].head);
  assert(worm[0].group === G && worm[1].group === G, 'the front keeps its group');
  assert(game.worms.has(`${G}-s1`));
  const x3 = worm[3].x, x0 = worm[0].x;
  for (let n = 0; n < 34; n++) tick(game);
  assert.equal(worm[3].x, x3, 'the new head waits .3 s'); assert(worm[0].x < x0 - 15, 'the front crawls on');
  advance(game, .1, 120);
  assert(Math.abs(worm[3].x - (x3 - 54 * (game.foeClock - game.worms.get(`${G}-s1`).moveAt))) < 1e-6 && worm[3].x < x3, 'then it crawls on the same way');
  assert(Math.abs(Math.abs(worm[4].x - worm[3].x) - 20) < 1e-6, 'its tail follows 20 px behind');
  // Its new head ripples like any head.
  const seed = touch(game, worm[3]); assert(game.drainEvents().some(e => e.kind === 'glowworm:ripple' && e.n === 1));
  const later = []; for (let n = 0; n < 12; n++) later.push(...tick(game));
  assert(worm[4].bloomed && later.some(e => e.type === 'bloom' && e.bud === worm[4] && e.seed === seed.id));
});
test('Uncredited strikes, powers on a bead and the ripple links never split a worm; an earned chain does', () => {
  let game = level(5, 4), worm = foesOf(game, 'glowworm');
  assert.equal(strikeOut(game, worm[2]), 1);
  assert(!foeKinds(game.drainEvents()).includes('glowworm:split') && worm[3].group === 'd5-4-foe0' && !worm[3].head, 'an uncredited bead hit is plain');
  assert.equal(strikeOut(game, worm[0]), 1); assert(!foeKinds(game.drainEvents()).includes('glowworm:ripple'), 'an uncredited head is plain');
  advance(game, .5, 120); assert(!worm[1].bloomed && !worm[3].bloomed);
  game = level(5, 4); worm = foesOf(game, 'glowworm');
  touch(game, worm[2], 0, 1, { power: 'beeline' }); assert(worm[2].bloomed && !worm[3].head && game.worms.size === 1, 'a power on a bead is plain');
  touch(game, worm[0], 0, 1, { power: 'beeline' }); assert(foeKinds(game.drainEvents()).includes('glowworm:ripple'), 'a power on the head ripples');
  game = level(5, 4); worm = foesOf(game, 'glowworm');
  game.due = { id: worm[1].id, by: 'seed-x', via: 'puff', depth: 1 }; game.strike(worm[1], true); game.due = null;
  assert(foeKinds(game.drainEvents()).includes('glowworm:split') && worm[2].head, 'a credited puff chain snaps it');
});
test('A Lullaby freezes a worm (sinking too), and each worm group that reaches the line costs one life', () => {
  let game = level(5, 4), worm = foesOf(game, 'glowworm');
  advance(game, .5, 120); game.lullaby = 1;
  const at = worm.map(b => [b.x, b.y]); advance(game, .5, 120);
  assert.deepEqual(worm.map(b => [b.x, b.y]), at); advance(game, 1, 120); assert(worm[0].x < at[0][0]);
  game = level(5, 4); worm = foesOf(game, 'glowworm');
  touch(game, worm[2]); game.drainEvents();
  for (const w of game.worms.values()) w.drift += 300;
  const lives = game.lives, lost = tick(game).filter(e => e.type === 'life');
  assert.deepEqual(lost.map(e => e.group).sort(), ['d5-4-foe0', 'd5-4-foe0-s1']); assert.equal(game.lives, lives - 2);
});
test('A worm and its split play out the same at 30, 60 and 144 FPS', () => {
  const runs = [30, 60, 144].map(fps => {
    const game = level(5, 4), worm = foesOf(game, 'glowworm'), log = [];
    touch(game, worm[2]); game.drainEvents();
    while (Math.round(game.time * 120) < 720) { game.step(1 / fps); for (const e of game.drainEvents()) if (e.type === 'foe' || e.type === 'bloom') log.push(`${e.type}:${e.kind || e.bud.id}`); }
    touch(game, worm[3]);
    while (Math.round(game.time * 120) < 840) { game.step(1 / fps); for (const e of game.drainEvents()) if (e.type === 'foe' || e.type === 'bloom') log.push(`${e.type}:${e.kind || e.bud.id}:${e.bud.x.toFixed(4)}`); }
    return { log: log.join(' '), at: worm.map(b => `${b.x.toFixed(4)},${b.y.toFixed(4)},${b.heading.toFixed(4)}`).join(' ') };
  });
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});
test('The bot forecasts a worm on its track, goes for heads and leaves beads, and plays the worm waves', () => {
  const game = level(5, 4), worm = foesOf(game, 'glowworm');
  assert.deepEqual(Foes.moves(game).filter(b => b.foe === 'glowworm'), worm);
  const out = Foes.predict(game, worm[0], 4.2, {}), tail = Foes.predict(game, worm[4], 1, {});
  advance(game, 1, 120);
  assert(Math.abs(tail.x - worm[4].x) < 1e-6 && Math.abs(tail.y - worm[4].y) < 1e-6, 'the tail forecast is where it goes');
  advance(game, 3.2, 120);
  assert(Math.abs(out.x - worm[0].x) < 1e-6 && Math.abs(out.y - worm[0].y) < 1e-6, 'the head forecast holds round the turn');
  assert.equal(Foes.value(game, { bud: worm[0], nx: 0, ny: 1 }), 80);
  assert.equal(Foes.value(game, { bud: worm[2], nx: 0, ny: 1 }), -5);
  const run = bot.play(5, { seed: 7, startWave: 3, maxTime: 45 });
  assert(run.wave >= 4, `the bot cleared the glowworm debut (reached W${run.wave})`);
});

// ── Art (both pieces) ──
// Records real Canvas commands from art.js and foe-art.js without a device (as test-boss-art.cjs does): every number
// finite and every save restored. The three looks are wrapped so the recorder knows when one of them is drawing: once
// their sprites are warm, a frame of theirs makes no gradient, no shadow and no new surface.
const LOOKED = ['jelly', 'glowdrop', 'glowworm'];
function artScope() {
  const totals = { surfaces: 0, gradients: 0, shadows: 0, hook: null, images: [] };
  function brush() {
    const stack = [], state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, shadowColor: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter' };
    const ctx = new Proxy(state, {
      get(t, name) {
        if (name in t) return t[name];
        if (name === 'canvas') return { width: 420, height: 560 };
        if (name === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args) => {
          args.forEach(a => { if (typeof a === 'number') assert(Number.isFinite(a), `${String(name)} received ${a}`); });
          if (name === 'save') stack.push({ ...state });
          else if (name === 'restore') { assert(stack.length, 'restore without save'); Object.assign(state, stack.pop()); }
          else if (name === 'measureText') return { width: String(args[0]).length * 7 };
          else if (name === 'drawImage' && totals.hook) totals.images.push([totals.hook, args[0]]);
          else if (/^create(Linear|Radial|Conic)Gradient$|^createPattern$/.test(name)) { if (totals.hook) totals.gradients++; return { addColorStop() {} }; }
        };
      },
      set(t, name, value) {
        if (['globalAlpha', 'lineWidth', 'shadowBlur'].includes(name)) assert(Number.isFinite(value), `${name} is finite`);
        if (name === 'shadowBlur' && value > 0 && totals.hook) totals.shadows++;
        t[name] = value; return true;
      }
    });
    return { ctx, balanced: () => stack.length === 0 };
  }
  class Canvas { constructor(w, h) { this.width = w; this.height = h; if (totals.hook) totals.surfaces++; this.rec = brush(); } getContext() { return this.rec.ctx; } }
  const scope = vm.createContext({ console, Math, Map, Set, WeakMap, Array, Object, Number, String, JSON, Date, OffscreenCanvas: Canvas });
  for (const file of ['art.js', 'foe-art.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), scope, { filename: file });
  const FoeArt = scope.BloomFoeArt;
  for (const name of LOOKED) for (const hook of ['under', 'bud', 'over', 'aim']) {
    const look = FoeArt.LOOKS[name], own = look && look[hook];
    if (!own) continue;
    look[hook] = function (...args) {
      totals.kit = args[hook === 'bud' ? 5 : 4];
      const was = totals.hook; totals.hook = name + ':' + hook;
      try { return own.apply(this, args); } finally { totals.hook = was; }
    };
  }
  return { Art: scope.BloomArt, FoeArt, brush, totals };
}
function draw(Art, brush, board, time, still, quality = 0) {
  const rec = brush(); Art.draw(rec.ctx, board, time, { theme: 'meadow', reducedMotion: still, quality }); assert(rec.balanced(), 'saves balance');
}
test('The jelly, its vents and glowdrops and the glowworm draw cheaply: finite, balanced, and no gradient, shadow or surface once warm', () => {
  const { Art, FoeArt, brush, totals } = artScope();
  for (const name of LOOKED) assert(FoeArt.LOOKS[name], name + ' has a look');
  // Boards that show every state: a vent about to send, a jelly in each half of its pulse, a burst's drops, a worm on a
  // straight and in a turn, a ripple mid-flash and a split.
  const boards = [];
  let g = level(5, 2); advance(g, 1.4, 120); boards.push(g);
  g = level(5, 2); firstJelly(g, .1); boards.push(g);
  g = level(5, 2); firstJelly(g, .6); boards.push(g);
  g = level(5, 2); until(g, now => now.some(e => e.kind === 'jelly:burst')); advance(g, .2, 120); boards.push(g);
  g = level(5, 4); advance(g, 3.8, 120); boards.push(g);
  g = level(5, 4); advance(g, .5, 120); touch(g, foesOf(g, 'glowworm')[0]); advance(g, .15, 120); boards.push(g);
  g = level(5, 4); advance(g, .5, 120); touch(g, foesOf(g, 'glowworm')[2]); advance(g, .1, 120); boards.push(g);
  assert(boards.every(board => board.foeWave));
  // The level's intro paints every piece's sprites ahead, as app.js warmPlan does (vent-only waves warm the jelly lazily).
  draw(Art, brush, boards[4], boards[4].time, false);
  totals.hook = 'warm'; FoeArt.warm([['glowworm', 11, 'gold'], ['glowworm', 9, 'sky']], totals.kit); totals.hook = null;
  for (const still of [false, true]) for (const quality of [0, 1, 2]) for (const board of boards) draw(Art, brush, board, board.time, still, quality);
  assert(totals.images.some(([hook]) => hook === 'jelly:under') && totals.images.some(([hook]) => hook === 'jelly:bud'), 'the vents and jellies drew');
  assert(totals.images.some(([hook]) => hook === 'glowdrop:bud') && totals.images.some(([hook]) => hook === 'glowworm:over'), 'the drops and the worm drew');
  const warm = { ...totals };
  for (const still of [false, true]) for (const quality of [0, 1, 2]) for (const dt of [.13, .41, .77, 1.9]) for (const board of boards) draw(Art, brush, board, board.time + dt, still, quality);
  assert.deepEqual([totals.gradients, totals.shadows, totals.surfaces], [warm.gradients, warm.shadows, warm.surfaces]);
});
test('The jelly shows a different face in its thrust and its glide, with Animations on and off', () => {
  const { Art, brush, totals } = artScope();
  const sprites = (age, still) => {
    const game = level(5, 2), jelly = firstJelly(game, age);
    draw(Art, brush, game, game.time, still); totals.images.length = 0; draw(Art, brush, game, game.time, still);
    assert(phase(game, jelly) < .3 === age % .9 < .3);
    return totals.images.filter(([hook]) => hook === 'jelly:bud').map(([, image]) => image);
  };
  for (const still of [false, true]) {
    const thrust = sprites(.95, still), glide = sprites(1.4, still);
    assert(thrust.length && glide.length);
    assert(glide.length > thrust.length || glide.some(image => !thrust.includes(image)), `the glide adds its glow (still ${still})`);
    assert(thrust.some(image => !glide.includes(image)), `the thrust has its own squeezed face (still ${still})`);
  }
});

// Shared rules every foe keeps.
test('foes.js never touches the seed pod and never uses Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, '../foes.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\.(pod|podGrow|shotGap)\b/.test(source), 'no seed pod access');
  assert(!/Math\.random/.test(source), 'no Math.random');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'foes-level5-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
