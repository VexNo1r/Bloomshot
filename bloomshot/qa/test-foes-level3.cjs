'use strict';
// Level 3's new pieces: the Fibcap and the Drippy Inkcap. Each is checked the same way: where the level places it,
// what a credited seed, a chain, a power and an uncredited strike do to it, that it plays the same at 30, 60 and 144 FPS
// and waits through a Lullaby, that it never costs a life it should not, what the practice bot thinks of it, and that
// its art draws from cached sprites only, with balanced state and still frames when Animations are off.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const bot = require('./depths-bot.cjs');
const { sandbox, advance, strikeOut, foesOf, Foes, Depths, RushGame } = require('./foe-harness.cjs');
const results = []; let serial = 0;
function test(name, fn) { const t0 = Date.now(); try { fn(); results.push({ name, passed: true, ms: Date.now() - t0 }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
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
// A plain bud of the given id at (x, y), as depths.js builds one.
const plain = (id, x, y, extra = {}) => ({ id, group: id, x, y, baseX: x, startY: y, r: 11, type: 'gold', relay: false, hp: 1, maxHp: 1, shield: false,
  fall: 1, sway: 0, swayW: 0, swayPhase: 0, hitAt: -100, bloomed: false, bloomAt: -100, ...extra });
// A board with only these pieces on it (no flowers, no drops), started and quiet. One plain bud waits in the top left
// corner, out of everyone's way, so the wave never clears under the test.
function bare(foes, wave = [3, 6]) {
  const game = sandbox(wave[0], wave[1], foes, { keepBuds: false });
  game.buds.push(plain('anchor', 36, 46, { hp: 3, maxHp: 3 })); game.drainEvents(); return game;
}
// Fires a real seed from the launcher toward (x, y) (optionally armed with a power), stepping 1/120 s at a time until it
// is gone; returns every event of the flight.
function fireAt(game, x, y, power = null, seconds = 2) {
  game.shotGap = 0; game.pod = Math.max(game.pod, 1); if (power) game.armed = power;
  assert(game.fire(x - game.launcher.x, y - game.launcher.y), 'the seed fires');
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); if (!game.balls.length) break; }
  return events;
}
const foeKinds = events => events.filter(e => e.type === 'foe').map(e => e.kind);
const until = (game, clock, fps = 120) => {
  for (let n = 0; game.foeClock < clock - 1e-9; n++) { assert(!game.over && n < 1e5, 'the board runs on'); game.step(1 / fps); }
  return game;
};

// ── Fibcap (Level 3, `fibcap`) ──
test('Fibcaps debut in Level 3 wave 4 with their hint, and come back in L3 W6, L3 W9, L4 W5, L4 W9 and L5 W5', () => {
  const w = Depths.wave(3, 4), fibs = w.buds.filter(b => b.foe === 'fibcap');
  assert.equal(w.hint, "Striped caps are fibcaps. Don't shoot them!"); assert(w.hint.length <= 52);
  assert.deepEqual(fibs.map(b => [b.id, b.group, b.x, b.y]), [['d3-4-foe0', 'd3-4-foe0', 232, 146], ['d3-4-foe1', 'd3-4-foe1', 232, 196]]);
  for (const b of fibs) {
    assert.equal(b.r, 12); assert.equal(b.type, 'lilac'); assert.equal(b.hp, 1); assert.equal(b.fall, 1);
    assert(b.inert && b.decoy, 'an inert decoy'); assert(!b.puff, 'no puff flag, so the twist counts hold');
    assert(Foes.chainable(b), 'a puffcap or a roll may take it');
  }
  for (const [l, n, count] of [[3, 6, 1], [3, 9, 2], [4, 5, 1], [4, 9, 2], [5, 5, 2]]) assert.equal(Depths.wave(l, n).buds.filter(b => b.foe === 'fibcap').length, count, `L${l} W${n}`);
  assert.equal(Foes.hint('fibcap'), w.hint);
});
test('A credited seed makes it sneeze: it pops for nothing, and .18 s later the gust comes', () => {
  const game = level(3, 4), fib = foesOf(game, 'fibcap')[0], score = game.score, sun = game.sunCharge, pod = game.pod;
  touch(game, fib);
  assert(fib.popped && fib.bloomed && !game.buds.includes(fib), 'popped and gone');
  const events = game.drainEvents();
  assert.deepEqual(foeKinds(events), ['fibcap:sneeze']);
  assert(!events.some(e => e.type === 'bloom' || e.type === 'podRefund'), 'no bloom, no refund');
  assert.equal(game.score, score); assert.equal(game.sunCharge, sun); assert.equal(game.pod, pod);
  assert.equal(game.sneezes.length, 1); assert(Math.abs(game.sneezes[0].at - (game.foeClock + .18)) < 1e-9);
  until(game, .17); assert(!foeKinds(game.drainEvents()).includes('fibcap:gust'), 'not yet');
  until(game, .19); const gust = game.drainEvents().find(e => e.kind === 'fibcap:gust');
  assert(gust && gust.n >= 3, 'the gust blows the cluster around it');
});
test('A Bee Line, a Sunburst, a chain or an uncredited strike pops it quietly, with no sneeze', () => {
  // Real seeds: a Bee Line flies on through it, a Sunburst opens on it.
  for (const power of ['beeline', 'sunburst', 'dandelion']) {
    const game = bare([['fibcap', 210, 200]]), fib = foesOf(game, 'fibcap')[0];
    const kinds = foeKinds(fireAt(game, 210, 200, power));
    assert(fib.popped, power); assert(kinds.includes('fibcap:pop'), `${power}: ${kinds}`); assert(!kinds.includes('fibcap:sneeze'), power);
    assert.equal(game.sneezes.length, 0, `${power}: no sneeze queued`);
  }
  // A puffcap a seed bloomed takes it in its chain.
  let game = level(3, 4); const puff = game.buds.find(b => b.id === 'd3-4-puff-1'), fib = game.buds.find(b => b.id === 'd3-4-foe1');
  touch(game, puff); advance(game, .5, 120);
  assert(fib.popped, 'the puffcap chain popped it'); assert.equal(game.sneezes.length, 0, 'quietly');
  // An uncredited strike loop ends in one strike.
  game = level(3, 4); const other = foesOf(game, 'fibcap')[1];
  assert.equal(strikeOut(game, other), 1); assert(other.popped);
  assert.deepEqual(foeKinds(game.drainEvents()), ['fibcap:pop']);
});
test('A sneeze blows plain buds within 74 px 26 px straight away, and leaves guardians, gifts, carried buds and foes', () => {
  const game = bare([['fibcap', 210, 200], ['rolypoly', 170, 200]]);
  game.descentSpeed = 0;
  const near = [plain('east', 250, 200), plain('north', 210, 140), plain('southwest', 160, 250, { sway: 10, swayW: 1.3 })];
  const far = plain('far', 300, 200), boss = plain('boss', 180, 166, { boss: true }), gift = plain('gift', 240, 232, { gift: 'sunburst', hp: 1 });
  const carried = plain('carried', 196, 236, { carried: true }), roly = foesOf(game, 'rolypoly')[0];
  game.buds.push(...near, far, boss, gift, carried);
  const before = new Map(game.buds.map(b => [b.id, { x: b.x, y: b.y, baseX: b.baseX }]));
  touch(game, foesOf(game, 'fibcap')[0]); const record = game.sneezes[0]; advance(game, 1, 120);
  assert.equal(record.targets.length, 3, 'only the three plain buds in reach');
  for (const b of near) {
    const o = before.get(b.id), t = record.targets.find(item => item.bud === b), dx = b.baseX - o.baseX, dy = b.y - o.y;
    // 26 px along the line from the sneeze to where the bud was when the gust came (a swaying bud's sway carries on).
    assert(t, `${b.id} was blown`); assert(Math.abs(Math.hypot(dx, dy) - 26) <= .5, `${b.id} moved ${Math.hypot(dx, dy).toFixed(3)} px`);
    assert(Math.abs(dx - t.ux * 26) < 1e-6 && Math.abs(dy - t.uy * 26) < 1e-6, `${b.id} radially`);
    if (!b.sway) { const d0 = Math.hypot(o.x - 210, o.y - 200), d1 = Math.hypot(b.x - 210, b.y - 200); assert(Math.abs(d1 - d0 - 26) <= .5, `${b.id} is 26 px further away`); }
  }
  for (const b of [far, boss, gift, carried, roly]) assert.deepEqual([b.x, b.y], [before.get(b.id).x, before.get(b.id).y], `${b.id} stays`);
});
test('A sneeze never shoves a bud past dangerY - 44 - r, and never lifts one already lower', () => {
  const game = bare([['fibcap', 210, 360]]);
  game.descentSpeed = 0;
  const below = plain('below', 210, 386), low = plain('low', 262, 402), floor = game.dangerY - 44 - 11;
  game.buds.push(below, low);
  touch(game, foesOf(game, 'fibcap')[0]); advance(game, 1, 120);
  assert(Math.abs(below.y - floor) < 1e-9, `held at the floor (${below.y})`);
  assert.equal(low.y, 402, 'a bud already below the floor is not moved up or down');
  assert(low.x > 262 + 15, 'but it is still blown sideways');
  // And the side walls hold.
  const edge = bare([['fibcap', 60, 200]]); edge.descentSpeed = 0;
  const wall = plain('wall', 30, 200); edge.buds.push(wall);
  touch(edge, foesOf(edge, 'fibcap')[0]); advance(edge, 1, 120);
  assert.equal(wall.x, 22 + 11);
});
test('A Lullaby holds a sneeze mid-push, and it finishes after', () => {
  const game = bare([['fibcap', 210, 200]]); game.descentSpeed = 0;
  const bud = plain('east', 250, 200); game.buds.push(bud);
  touch(game, foesOf(game, 'fibcap')[0]); until(game, .3);
  const mid = bud.x; assert(mid > 250 && mid < 276, 'mid-push');
  game.lullaby = 1; const clock = game.foeClock; advance(game, .5, 120);
  assert.equal(bud.x, mid); assert.equal(game.foeClock, clock);
  advance(game, 1.5, 120); assert(Math.abs(bud.x - 276) < 1e-6, `finished at ${bud.x}`);
});
test('A wave with only fibcaps left clears, and the fibcaps fizzle away', () => {
  // The puffcaps go without blooming (a puffcap's chain would pop the fibcaps first), the rest are struck out.
  const game = level(3, 4); game.drops = []; game.buds = game.buds.filter(b => !b.puff);
  for (const b of game.buds.slice()) if (!b.foe) strikeOut(game, b);
  assert.equal(game.buds.filter(b => !b.bloomed).length, 2, 'only the two fibcaps are left');
  const events = []; for (let t = 0; t < 2; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); if (game.over) break; }
  assert.equal(game.status, 'won', 'the wave cleared with both fibcaps on the board');
  assert.equal(foeKinds(events).filter(k => k === 'fibcap:fizzle').length, 2);
  assert(!game.buds.some(b => b.foe && !b.bloomed));
});
test('A fibcap and an ink drop at the line fizzle and cost no life', () => {
  const game = bare([['fibcap', 120, 200], ['inkcap', 300, 200]]), fib = foesOf(game, 'fibcap')[0], cap = foesOf(game, 'inkcap')[0];
  until(game, 1.51); const drop = foesOf(game, 'inkdrop')[0]; assert(drop, 'a drop fell');
  fib.y = game.dangerY - fib.r + .5; drop.y0 += game.dangerY - drop.y - drop.r + 1;
  const lives = game.lives; game.step(1 / 120);
  const kinds = foeKinds(game.drainEvents());
  assert(kinds.includes('fibcap:fizzle') && kinds.includes('inkdrop:fizzle'), String(kinds));
  assert.equal(game.lives, lives); assert(game.buds.includes(cap) && !cap.bloomed, 'the cap stays');
});
test('The bot never shoots a fibcap, values a puffcap beside one 20 more, and shies from a shot that skims one', () => {
  const game = level(3, 4), [fib0, fib1] = foesOf(game, 'fibcap'), puff = game.buds.find(b => b.id === 'd3-4-puff-1'), lone = game.buds.find(b => b.id === 'd3-4-puff-0');
  assert.equal(Foes.value(game, { bud: fib0, nx: 0, ny: 1 }), -1);
  assert.equal(bot.value(game, { bud: { ...fib1 }, nx: 0, ny: 1, time: .3 }, 0, bot.prepareTrace(game)), -1);
  assert.equal(Foes.value(game, { bud: puff, nx: .6, ny: .8 }), 20, 'the fibcap at (232, 196) is 35 px away');
  assert.equal(Foes.value(game, { bud: lone, nx: 0, ny: 1 }), 0, 'the other puffcap is 77 px from the nearest fibcap');
  // A seed that would pass a fibcap just before reaching its target (here, from straight below) is a risky shot.
  const above = { id: 'above', x: 232, y: 110, r: 11, type: 'gold', hp: 1 };
  assert.equal(Foes.value(game, { bud: above, nx: 0, ny: 1 }), -40, 'skims the fibcap at (232, 146)');
  assert.equal(Foes.value(game, { bud: above, nx: 0, ny: -1 }), 0, 'from above it is clear');
  assert.equal(Foes.value(game, { bud: puff, nx: 0, ny: 1 }), 20 - 40, 'a puffcap reached past a fibcap: both');
  assert(!Foes.moves(game).length, 'fibcaps sit still for the bot');
  strikeOut(game, fib0); strikeOut(game, fib1);
  assert.equal(Foes.value(game, { bud: puff, nx: 0, ny: 1 }), 0, 'no fibcap left, no bonus');
});
test('Sneezes and drips play out the same at 30, 60 and 144 FPS', () => {
  const angles = [-1.25, -1.9, -1.55, -1.05, -2.15, -1.4, -1.7, -1.15, -2.0, -1.6, -1.3];
  for (const [l, n] of [[3, 6], [3, 9]]) {
    const runs = [30, 60, 144].map(fps => {
      const game = level(l, n), log = [];
      // Whole frames, as test-rush does: a seed each second, and the first fibcap touched at 2 s.
      for (let frame = 0; frame < fps * 12; frame++) {
        if (frame % fps === 0 && frame) { const a = angles[(frame / fps - 1) % angles.length]; game.fire(Math.cos(a), Math.sin(a)); }
        if (frame === 2 * fps) { const fib = foesOf(game, 'fibcap').find(b => !b.bloomed); if (fib) touch(game, fib); }
        game.step(1 / fps);
        for (const e of game.drainEvents()) if (e.type === 'foe') log.push(`${e.kind}@${Number(e.x).toFixed(4)},${Number(e.y).toFixed(4)}`);
      }
      return { log: log.join(' '), buds: game.buds.map(b => [b.id, b.x.toFixed(5), b.y.toFixed(5), b.bloomed]), score: game.score, lives: game.lives, clock: game.foeClock.toFixed(6) };
    });
    assert(runs[0].log.includes('inkcap:drip'), `L${l} W${n} dripped`);
    assert.deepEqual(runs[1], runs[0], `L${l} W${n} 60 = 30`); assert.deepEqual(runs[2], runs[0], `L${l} W${n} 144 = 30`);
  }
});

// ── Drippy Inkcap (Level 3, `inkcap`) ──
test('Inkcaps debut in Level 3 wave 6 with their hint, and come back in L3 W8, L3 W9 and L4 W7', () => {
  const w = Depths.wave(3, 6), caps = w.buds.filter(b => b.foe === 'inkcap');
  assert.equal(w.hint, 'Inkcaps drip! Drops gobble your seeds.'); assert(w.hint.length <= 52);
  assert.deepEqual(caps.map(b => [b.id, b.group, b.x, b.y]), [['d3-6-foe0', 'd3-6-foe0', 150, 252], ['d3-6-foe1', 'd3-6-foe1', 300, 262]]);
  for (const b of caps) { assert.equal(b.r, 12); assert.equal(b.hp, 2); assert.equal(b.maxHp, 2); assert.equal(b.fall, .9); assert.equal(b.type, 'lilac'); assert(!b.inert && !b.decoy, 'a real bud'); }
  for (const [l, n, count] of [[3, 8, 1], [3, 9, 1], [4, 7, 1]]) assert.equal(Depths.wave(l, n).buds.filter(b => b.foe === 'inkcap').length, count, `L${l} W${n}`);
  assert.equal(Foes.hint('inkdrop'), w.hint, 'a drop teaches its cap');
});
test('Drops fall at 1.5, 3.7 and 5.9 s, each its own group, from under the cap', () => {
  const game = bare([['inkcap', 210, 150]]), cap = foesOf(game, 'inkcap')[0];
  game.descentSpeed = 0; game.dangerY = 4000;
  const drips = [];
  for (let t = 0; t < 6.5; t += 1 / 120) { game.step(1 / 120); for (const e of game.drainEvents()) if (e.kind === 'inkcap:drip') drips.push(game.foeClock); }
  assert.equal(drips.length, 3); [1.5, 3.7, 5.9].forEach((at, i) => assert(Math.abs(drips[i] - at) < 1 / 120 + 1e-9, `drip ${i} at ${drips[i]}`));
  const drops = game.buds.filter(b => b.foe === 'inkdrop');
  for (const drop of drops) {
    assert.equal(drop.group, drop.id); assert.notEqual(drop.group, cap.group); assert.equal(drop.cap, cap.id);
    assert(drop.inert && !drop.decoy); assert.equal(drop.r, 6); assert.equal(drop.x, 210);
  }
  assert.deepEqual(drops.map(b => b.id), ['t3-6-foe0-ink-1', 't3-6-foe0-ink-2'], 'the first has dried up (3.2 s after it fell)');
  // Each falls 110 px a second from 4 px under the fringe.
  const last = drops[1], t = game.foeClock - last.born; assert(Math.abs(last.y - (150 + 12 + 4 + 110 * t)) < 1e-6);
});
test('A cap with three drops still falling skips its drip, and the schedule carries on', () => {
  const game = bare([['inkcap', 210, 150]]), cap = foesOf(game, 'inkcap')[0];
  game.descentSpeed = 0; game.dangerY = 4000;
  until(game, 1.2);
  // Three of its drops still falling at 1.5 s, all dried up by 3.7 s.
  for (let k = 0; k < 3; k++) { const [drop] = Foes.make('inkdrop', ['inkdrop', 120 + k * 40, 100], `fake-${k}`, null); drop.cap = cap.id; Foes.place(game, drop); drop.born -= 2; }
  const drips = [];
  for (let t = 0; t < 3; t += 1 / 120) { game.step(1 / 120); for (const e of game.drainEvents()) if (e.kind === 'inkcap:drip') drips.push([game.foeClock, e.n]); }
  assert.equal(drips.length, 1, 'the 1.5 s drip was skipped'); assert(Math.abs(drips[0][0] - 3.7) < .01); assert.equal(drips[0][1], 1, 'it is the second drip');
  assert(game.buds.some(b => b.id === 't3-6-foe0-ink-1'));
});
test('A drop gulps a plain seed: the seed is gone, nothing blooms, and the drop pops', () => {
  const game = bare([['inkcap', 210, 150]]), cap = foesOf(game, 'inkcap')[0];
  until(game, 1.51); game.drainEvents(); const drop = foesOf(game, 'inkdrop')[0], score = game.score;
  const events = fireAt(game, 210, 100);
  assert.deepEqual(foeKinds(events), ['inkcap:gulp']); assert(drop.popped && !game.buds.includes(drop));
  assert.equal(game.balls.length, 0, 'the seed is gone');
  assert(!events.some(e => e.type === 'bloom' || e.type === 'crack' || e.type === 'bounce'), 'nothing else happened');
  assert.equal(cap.hp, 2); assert.equal(game.score, score);
});
test('A Bee Line flies through a drop and pops it; a Sunburst or a Dandelion pops it too', () => {
  for (const power of ['beeline', 'sunburst', 'dandelion']) {
    const game = bare([['inkcap', 210, 150]]), cap = foesOf(game, 'inkcap')[0];
    until(game, 1.51); const drop = foesOf(game, 'inkdrop')[0];
    const events = fireAt(game, 210, 100, power), kinds = foeKinds(events);
    assert(drop.popped, power); assert(kinds.includes('inkdrop:pop') && !kinds.includes('inkcap:gulp'), `${power}: ${kinds}`);
    if (power === 'beeline') assert(cap.bloomed, 'the bee flew on and bloomed the cap');
  }
});
test('A drop dries up 3.2 s after it falls; one at the line fizzles alone, costing no life and leaving its cap', () => {
  let game = bare([['inkcap', 210, 100]]); game.dangerY = 4000; game.descentSpeed = 0;
  until(game, 1.51); const drop = foesOf(game, 'inkdrop')[0], born = drop.born;
  until(game, born + 3.2 - 2 / 120); assert(!drop.bloomed, 'still falling');
  until(game, born + 3.2 + 1 / 120); assert(drop.popped); assert(foeKinds(game.drainEvents()).includes('inkdrop:fizzle'));
  game = bare([['inkcap', 210, 300]]); const cap = foesOf(game, 'inkcap')[0], lives = game.lives;
  const kinds = []; for (let t = 0; t < 3; t += 1 / 120) { game.step(1 / 120); kinds.push(...foeKinds(game.drainEvents())); }
  assert(kinds.includes('inkdrop:fizzle'), 'its drop reached the line'); assert.equal(game.lives, lives);
  assert(game.buds.includes(cap) && !cap.bloomed);
});
test('A Lullaby holds the drip clock and every drop', () => {
  const game = bare([['inkcap', 210, 100]]), cap = foesOf(game, 'inkcap')[0];
  until(game, 1.6); const drop = foesOf(game, 'inkdrop')[0], y = drop.y, next = cap.dripAt;
  game.lullaby = 1; advance(game, .6, 120);
  assert.equal(drop.y, y); assert.equal(cap.dripAt, next);
  advance(game, 1, 120); assert(drop.y > y || drop.bloomed, 'it falls again after');
});
test('The cap is a plain 2-hit bud; any strike that reaches a drop pops it quietly', () => {
  let game = bare([['inkcap', 210, 150]]); let cap = foesOf(game, 'inkcap')[0];
  touch(game, cap); assert.equal(cap.hp, 1); assert(game.drainEvents().some(e => e.type === 'crack'));
  touch(game, cap); assert(cap.bloomed && !cap.popped);
  until(game, 2); assert(!foesOf(game, 'inkdrop').length, 'a bloomed cap drips no more');
  game = bare([['inkcap', 210, 150]]); cap = foesOf(game, 'inkcap')[0];
  assert.equal(strikeOut(game, cap), 2);
  game = bare([['inkcap', 210, 150]]); until(game, 1.51); game.drainEvents();
  const drop = foesOf(game, 'inkdrop')[0]; assert.equal(strikeOut(game, drop), 1);
  assert.deepEqual(foeKinds(game.drainEvents()), ['inkdrop:pop']);
});
test('The bot forecasts each drop and never aims at one; a cap is worth 10', () => {
  const game = bare([['inkcap', 210, 120]]), cap = foesOf(game, 'inkcap')[0];
  until(game, 1.51); const drop = foesOf(game, 'inkdrop')[0];
  assert.deepEqual(Foes.moves(game), [drop]);
  const t = game.foeClock - drop.born, out = Foes.predict(game, drop, .5, {});
  assert(Math.abs(out.y - (drop.y0 + 110 * (t + .5))) < 1e-9); assert.equal(out.flags, 0);
  assert.equal(Foes.predict(game, drop, 3.3, {}).flags & 1, 1, 'gone by then');
  game.lullaby = .5; assert(Math.abs(Foes.predict(game, drop, .8, {}).y - (drop.y0 + 110 * (t + .3))) < 1e-9, 'it waits out a Lullaby'); game.lullaby = 0;
  assert.equal(Foes.value(game, { bud: drop, nx: 0, ny: 1 }), -1);
  assert.equal(Foes.value(game, { bud: cap, nx: 0, ny: 1 }), 10);
  // The trace sees the drop where it will be.
  const prepared = bot.prepareTrace(game), hit = bot.trace(game, -Math.PI / 2, 3, prepared);
  assert(hit && hit.bud.id === drop.id, 'straight up meets the falling drop first');
  assert.equal(bot.value(game, hit, 0, prepared), -1);
  // The real bot plays the inkcap debut without error.
  const run = bot.play(3, { seed: 7, startWave: 6, waves: 1 });
  assert(run && typeof run === 'object');
});
test("Mother Morel can rain drops and throw fibcaps mid-fight: make() with no index, then place()", () => {
  const game = bare([], [3, 2]);
  assert(!game.foeWave, 'a wave with no foes');
  const [drop] = Foes.make('inkdrop', ['inkdrop', 150, 120, {}], 'd3-10-boss-ink-0', null);
  assert.equal(drop.id, 'd3-10-boss-ink-0'); assert.equal(drop.group, drop.id); assert.equal(drop.y0, 120); assert.equal(drop.cap, null);
  Foes.place(game, drop); assert(game.foeWave);
  advance(game, .5, 120); assert(Math.abs(drop.y - (120 + 110 * .5)) < 110 / 120 + 1e-9);
  const [fib] = Foes.make('fibcap', ['fibcap', 260, 180, {}], 'd3-10-boss-fake-1', null);
  assert.equal(fib.id, 'd3-10-boss-fake-1'); assert(fib.inert && fib.decoy); Foes.place(game, fib);
  // A painted cap sneezes through the fibcap's own helper.
  const bud = plain('near', 300, 180); game.buds.push(bud); game.descentSpeed = 0;
  Foes.FOES.fibcap.sneeze(game, 260, 180); advance(game, 1, 120);
  assert(Math.abs(bud.x - 326) < 1e-6, `blown to ${bud.x}`);
});
test('Their art draws from cached sprites only, keeps its canvas state balanced and holds still with Animations off', () => {
  require('../foe-art.js');
  const Art = globalThis.BloomFoeArt, TAU = Math.PI * 2;
  const recorder = () => {
    const rec = { log: [], depth: 0, low: 0, gradients: 0, bad: [], images: 0 };
    rec.ctx = new Proxy({}, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          if (key === 'save') rec.depth++;
          if (key === 'restore') { rec.depth--; rec.low = Math.min(rec.low, rec.depth); }
          if (key === 'createRadialGradient' || key === 'createLinearGradient') { rec.gradients++; return { addColorStop() {} }; }
          if (key === 'measureText') return { width: 30 };
          if (key === 'drawImage') rec.images++;
          if (args.some(a => typeof a === 'number' && !Number.isFinite(a))) rec.bad.push(String(key));
          rec.log.push(`${String(key)}(${args.map(a => typeof a === 'number' ? a.toFixed(4) : typeof a === 'string' ? a : '#').join(',')})`);
        };
      },
      set(target, key, value) { target[key] = value; rec.log.push(`${String(key)}=${typeof value === 'number' ? value.toFixed(4) : String(value)}`); return true; }
    });
    return rec;
  };
  const cache = new Map();
  const kit = {
    TAU, clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)), smooth: t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); },
    easeBack: k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2), FLOWERS: { lilac: { tip: '#ede2ff', light: '#cbb0ff', base: '#a079fa', dark: '#7351d2' } },
    atlasSprite(key, x0, y0, x1, y1, paint) {
      assert(!/\d\.\d{3,}/.test(key), `a sprite key never holds an animated value: ${key}`);
      if (!cache.has(key)) { const rec = recorder(); paint(rec.ctx); assert.equal(rec.depth, 0, key); cache.set(key, { surface: {}, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); }
      return cache.get(key);
    },
    blit(ctx, s) { ctx.drawImage(s.surface, s.x, s.y, s.w, s.h); },
    circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  };
  Art.warm([['fibcap', 12, 'lilac'], ['inkcap', 12, 'lilac'], ['inkdrop', 6, 'lilac']], kit);
  const warmed = cache.size;
  const game = bare([['fibcap', 120, 200], ['inkcap', 300, 200]]), fib = foesOf(game, 'fibcap')[0];
  until(game, 1.3); touch(game, fib);
  game.foeLooks = ['fibcap', 'inkdrop']; game.inkBlots = [{ x: 200, y: 260, at: game.time - .05, turn: 1 }];
  const frame = (still, time, quality = 0) => {
    const rec = recorder();
    Art.under(rec.ctx, game, time, still, kit, quality);
    for (const bud of game.buds) if (bud.foe && Art.has(bud)) Art.bud(rec.ctx, bud, time, still, game, kit, quality);
    Art.over(rec.ctx, game, time, still, kit, quality); Art.aim(rec.ctx, game, time, still, kit, quality);
    assert.equal(rec.depth, 0, 'save and restore balance'); assert.equal(rec.low, 0, 'never restores more than it saved');
    assert.deepEqual(rec.bad, [], 'every number is finite'); assert.equal(rec.gradients, 0, 'no gradient per frame');
    return rec;
  };
  // Through the swell, the drip, the sneeze's wind-up, CHOO and gust, and a falling drop.
  for (let i = 0; i < 70; i++) { game.step(1 / 120); for (const quality of [0, 1, 2]) for (const still of [false, true]) frame(still, game.time + i * .013, quality); }
  assert(frame(false, game.time).images > 0, 'it drew sprites');
  assert.equal(cache.size, warmed, 'every sprite was painted ahead by warm(), none per frame');
  // Animations off: the same board drawn at two times is the same picture.
  const a = frame(true, 3.1).log.join(';'), b = frame(true, 4.47).log.join(';');
  assert.equal(a, b, 'still frames do not move');
});

// Shared rules every foe keeps.
test('foes.js never touches the seed pod and never uses Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, '../foes.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\.(pod|podGrow|shotGap)\b/.test(source), 'no seed pod access');
  assert(!/Math\.random/.test(source), 'no Math.random');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'foes-level3-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
