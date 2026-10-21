'use strict';
// The guardian kits (bosses.js). The shared rules first: a kit guardian changes mood at two thirds and one third of its
// health, a credited seed stops at each threshold, the change is announced (and guarded) before it lands, and the next
// tier's moves come faster. Then each kit's own moves, rewards and determinism, one block per guardian.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Depths = require('../depths.js'), Bosses = require('../bosses.js'), Foes = require('../foes.js');
const { RushGame } = require('../rush.js'), bot = require('./depths-bot.cjs');
const results = []; let serial = 0;
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
// The guardian alone on its board, still and not falling (as test-bosses.cjs).
function arena(id) {
  const game = new RushGame({ plan: bot.plan(id), startWave: 10 });
  game.started = true; game.status = 'flying'; game.descentSpeed = 0; game.drops = [];
  game.buds = game.buds.filter(b => b.boss || b.bossPart); game.bossState.boss.bossFall = 0; game.drainEvents(); return game;
}
function advance(game, seconds, fps = 120) { for (let n = 0; n < Math.round(seconds * fps); n++) game.step(1 / fps); }
// A credited seed's own touch (contact normal nx, ny from the piece toward the seed).
function hit(game, bud, { nx = 0, ny = 1, gateHops = 0, power, ...extra } = {}) {
  game.striker = { id: 'seed' + ++serial, type: game.nextType, power, gateHops, bossContact: { nx, ny }, touches: 0, streak: 0, walls: 0, bounces: 0, age: 0, gateAt: -100, petalAt: -100, ...extra };
  game.strike(bud); game.striker = null;
}
// Runs fn with a stand-in kit for `kind` (restoring the real one, if any, after), so the shared rules are checked the
// same way whichever kits exist.
function withKit(kind, entry, fn) {
  const saved = Bosses.kits[kind]; Bosses.kits[kind] = entry;
  try { fn(); } finally { if (saved) Bosses.kits[kind] = saved; else delete Bosses.kits[kind]; }
}
const STAND_IN = { moods: ['Calm', 'Cross', 'Wild'], stageText: [null, 'Now cross!', 'Now wild!'], moves: [['sprouts', 'nap'], ['nap'], ['sprouts']] };
const tiersOf = maxHp => [Math.ceil(2 * maxHp / 3), Math.ceil(maxHp / 3)];
// Sunny awake and dizzy (his bubble popped), so a credited seed lands double.
function dizzySunny(hp) { const g = arena(1), s = g.bossState; hit(g, s.parts[0]); assert.equal(s.mode, 'dizzy'); s.boss.hp = hp; g.drainEvents(); return g; }

// ── Shared tier rules ──
test('Guardians without a kit keep no tiers; a kit guardian turns at two thirds and one third of its health', () => {
  for (let id = 6; id <= 10; id++) assert.equal(arena(id).bossState.tierAt, null, `L${id}`);
  for (let id = 1; id <= 5; id++) {
    const kind = Depths.bosses[id - 1].kind, g = arena(id);
    if (Bosses.kits[kind]) assert.deepEqual(g.bossState.tierAt, tiersOf(g.bossState.boss.maxHp), kind);
    else assert.equal(g.bossState.tierAt, null, kind);
  }
  withKit('sunny', STAND_IN, () => { const g = arena(1); assert.deepEqual(g.bossState.tierAt, tiersOf(g.bossState.boss.maxHp)); });
});
test('A credited seed stops at a threshold and the next is guarded; powers and uncredited strikes pass it', () => withKit('sunny', STAND_IN, () => {
  let g = dizzySunny(0); const [first] = g.bossState.tierAt;
  g = dizzySunny(first + 1); const s = g.bossState, b = s.boss;
  hit(g, b); assert.equal(b.hp, first, 'a double hit stops at the threshold'); assert(s.shiftPending);
  hit(g, b); assert.equal(b.hp, first, 'held until the new mood is announced');
  assert(g.drainEvents().some(e => e.type === 'bossGuard' && e.mode === 'stage'));
  g.strike(b); assert.equal(b.hp, first - 1, 'an uncredited strike (a script) still lands');
  g = dizzySunny(first + 1);
  g.spawnBall({ x: g.bossState.boss.x, y: g.bossState.boss.y + 55, angle: -Math.PI / 2, speed: 520, power: 'sunburst' }); advance(g, .7);
  assert.equal(g.bossState.boss.hp, first + 1 - 4, 'a Sunburst keeps its stated damage');
}));
test('The mood change is a 1.3 s guarded warning, then Phase Bloom: the next tier, a beat of rest, faster moves', () => withKit('sunny', STAND_IN, () => {
  const g = dizzySunny(0), s = g.bossState, b = s.boss; b.hp = s.tierAt[0] + 1; hit(g, b); g.drainEvents();
  for (let n = 0; n < 240 && !(s.warning && s.warning.move === 'stage'); n++) g.step(1 / 120);
  const w = s.warning; assert(w && w.move === 'stage', 'the stage warning comes next'); assert.equal(w.text, 'Now cross!');
  assert(w.until - w.at >= 1.3 - 1e-9); assert.deepEqual(w.flowerTargets, [], 'no flower spell rides on a mood change');
  assert.equal(Bosses.canHit(g, b, { nx: 0, ny: 1 }, {}), false, 'seeds glance off while it is announced');
  assert.equal(Bosses.canHit(g, b, { nx: 0, ny: 1 }, { power: 'beeline' }), true, 'powers still land');
  const events = []; while (s.warning && s.warning.move === 'stage') { g.step(1 / 120); events.push(...g.drainEvents()); }
  const stage = events.find(e => e.type === 'bossStage');
  assert(stage && stage.stage === 1 && stage.mood === 'Cross' && stage.kind === 'sunny');
  assert(!events.some(e => e.type === 'bossAbility' && e.move === 'stage'), 'Phase Bloom has its own voice only');
  assert.equal(s.tier, 1); assert(!s.shiftPending); assert.equal(s.mode, 'dizzy', 'the earned opening stays open'); assert(Math.abs(s.next - s.age - 1) < .02, 'a one-second beat');
  for (let n = 0; n < 240 && !s.warning; n++) g.step(1 / 120);
  assert.equal(s.warning.move, 'nap', 'tier 1 plays its own list');
  while (s.warning) g.step(1 / 120);
  assert(Math.abs(s.next - s.age - 10 * .9) < .02, 'the tier-1 pause is nine tenths of the usual');
}));
test('A guardian dropped past both thresholds at once changes one mood per warning', () => withKit('sunny', STAND_IN, () => {
  const g = arena(1), s = g.bossState; s.boss.hp = 1; let stages = 0;
  for (let n = 0; n < 1200 && s.tier < 2; n++) { g.step(1 / 120); stages += g.drainEvents().filter(e => e.type === 'bossStage').length; }
  assert.equal(s.tier, 2); assert.equal(stages, 2);
}));
test('Kit timers and lob flights keep the guardian clock: a Lullaby holds them', () => withKit('sunny', { ...STAND_IN, timer: { ping(game, s, data) { s.pinged = (s.pinged || 0) + data; } } }, () => {
  const g = arena(1), s = g.bossState;
  s.timers.push({ at: s.kitAge + .5, act: 'ping', data: 2 }); s.lobs.push({ look: 'test', x0: 0, y0: 0, x1: 1, y1: 1, t0: s.kitAge, T: .5 });
  g.lullaby = 1; advance(g, .6); assert.equal(s.pinged, undefined, 'held'); assert.equal(s.lobs.length, 1);
  advance(g, 1.2); assert.equal(s.pinged, 2, 'fired once the Lullaby ends'); assert.equal(s.lobs.length, 0); assert.equal(s.timers.length, 0);
}));
test('A beaten kit guardian leaves nothing behind: no moon gates, carried flowers, timers or raised line', () => withKit('sunny', STAND_IN, () => {
  const g = arena(1), s = g.bossState, b = s.boss;
  const carried = { id: 'c1', group: 'c1', x: 500, y: 200, baseX: 500, startY: 200, r: 11, type: 'gold', hp: 1, maxHp: 1, fall: 1, sway: 0, hitAt: -100, bloomAt: -100, bloomed: false, relay: false };
  carried.carried = { a0: 0 }; g.buds.push(carried); s.carried.push(carried);
  g.gates.push({ id: 'm-in', pair: 'm-out', x: 210, y: 388, r: 18, angle: 0, bossMoon: true, expires: 99, lastUsed: -100 }, { id: 'm-out', pair: 'm-in', x: 210, y: 52, r: 18, angle: 0, bossMoon: true, expires: 99, lastUsed: -100 });
  s.timers.push({ at: 99, act: 'close' }); g.dangerY = 430; g.aimNapUntil = g.time + 5;
  for (let n = 0; n < 200 && !b.bloomed; n++) g.strike(b);
  assert(b.bloomed); assert(!g.gates.some(x => x.bossMoon)); assert.equal(carried.carried, null); assert.equal(carried.baseX, 398 - carried.r);
  assert.equal(s.carried.length + s.timers.length + s.lobs.length, 0); assert.equal(g.dangerY, 448); assert.equal(g.aimNapUntil, 0);
}));
test('bosses.js never touches the seed pod and never uses Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, '../bosses.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\.(pod|podGrow|shotGap)\b/.test(source)); assert(!/Math\.random/.test(source));
});

// ── Old Sunny (Level 1, `sunny`) ──

// ── Rootknot (Level 2, `root`) ──
{
  const Engine = require('../engine.js'), vm = require('node:vm'), TAU = Math.PI * 2;
  const flower = (id, x, y, extra) => ({ id, group: id, x, y, baseX: x, startY: y, r: 11, type: 'gold', hp: 1, maxHp: 1, relay: false, fall: 1, sway: 0, hitAt: -100, bloomAt: -100, bloomed: false, ...extra });
  // Rootknot on his board with his next move forced (the tier, and the move's place in that tier's list) and its warning
  // up. Unless told otherwise the board holds a clump of three flowers he could carry (a, b, c) and a stray (d).
  function rootknot(tier, index, { flowers = true, descent = 0, buds = [] } = {}) {
    const g = arena(2), s = g.bossState; g.descentSpeed = descent;
    if (flowers) g.buds.push(flower('a', 180, 220), flower('b', 210, 220), flower('c', 195, 246), flower('d', 300, 160));
    g.buds.push(...buds); s.tier = tier; if (tier) s.cycle = index; else s.action = index; s.next = 0; g.step(1 / 120); return g;
  }
  // Steps until `done` (at most `seconds`), returning the events on the way; play() runs a warning out until its move acts.
  function until(g, done, seconds = 10) { const events = []; for (let n = 0; n < seconds * 120 && !done(); n++) { g.step(1 / 120); events.push(...g.drainEvents()); } return events; }
  const play = g => until(g, () => !g.bossState.warning, 2);
  const acts = (events, act) => events.filter(e => e.type === 'bossAbility' && e.kind === 'root' && e.act === act);
  const knotOf = s => s.parts.find(p => p.bossPart === 'knot' && !p.bloomed) || null;
  const tossed = g => g.buds.filter(p => p.rootToss);
  const bud = (g, id) => g.buds.find(p => p.id === id);

  test('Rootknot has 26 health and turns Tangled at 18 and Furious at 9; every warning fits a phone', () => {
    const g = arena(2), s = g.bossState, k = Bosses.kits.root;
    assert.equal(s.boss.maxHp, 26); assert.equal(s.boss.hp, 26); assert.deepEqual(s.tierAt, [18, 9]);
    assert.deepEqual(k.moods, ['Grumpy', 'Tangled', 'Furious']); assert.deepEqual(k.stageText, [null, 'Rootknot is tangling up!', 'Rootknot is furious!']);
    assert.deepEqual(k.moves, [['root', 'toss'], ['toss2', 'carousel'], ['toss2', 'carousel', 'snare']]);
    for (const text of [...Object.values(k.text), ...k.stageText.slice(1)]) assert(text.length <= 52, text);
  });
  test('A credited seed stops Rootknot at each mood line; the change is announced, then his next tier opens with two tosses', () => {
    for (const [tier, hp, line, text, mood] of [[0, 19, 18, 'Rootknot is tangling up!', 'Tangled'], [1, 10, 9, 'Rootknot is furious!', 'Furious']]) {
      const g = arena(2), s = g.bossState, b = s.boss; s.tier = tier; b.hp = hp; s.next = s.age + 9;
      hit(g, b); hit(g, b); assert.equal(b.hp, line, 'held at the line'); assert(s.shiftPending);
      g.step(1 / 120); const w = s.warning;
      assert.equal(w.move, 'stage'); assert.equal(w.text, text); assert(w.until - w.at >= 1.3 - 1e-9);
      const stage = play(g).find(e => e.type === 'bossStage');
      assert(stage && stage.kind === 'root' && stage.stage === tier + 1 && stage.mood === mood); assert.equal(s.tier, tier + 1);
      until(g, () => s.warning, 2); assert.equal(s.warning.move, 'toss2'); assert.equal(s.warning.text, 'Rootknot is tossing rolypolies!');
    }
  });
  test('He comes up at holes 292, 128 and 210 in turn; Grumpy, every other burrow lobs a rolypoly that lands as a real one at +.6 s', () => {
    for (const [action, move, x] of [[0, 'root', 292], [1, 'toss', 128], [2, 'root', 210]]) {
      const w = rootknot(0, action).bossState.warning;
      assert.equal(w.move, move); assert.equal(w.targets.find(t => t.role === 'hole').x, x);
      assert.equal(w.targets.filter(t => t.role === 'wall').length, 2); assert.equal(w.targets.filter(t => t.role === 'toss').length, move === 'toss' ? 1 : 0);
    }
    const g = rootknot(0, 1), s = g.bossState, b = s.boss, w = s.warning, mark = w.targets.find(t => t.role === 'toss');
    assert.equal(w.text, 'Rootknot is tossing a rolypoly!');
    assert.deepEqual([mark.x, mark.y, mark.r], [210, b.y + 70, 14], 'from the empty hole nearest the middle, 70 px below his row');
    const events = play(g), [flight] = s.lobs;
    assert.deepEqual(acts(events, 'toss').map(e => e.x), [210]); assert.equal(s.mode, 'burrow'); assert.equal(g.bumpers.filter(p => p.bossWall).length, 2);
    assert.equal(flight.look, 'rolypoly'); assert.deepEqual([flight.x0, flight.x1, flight.y1, flight.T], [210, 210, mark.y, .6]); assert(flight.y0 > b.y, 'out of the hole on his row');
    const landing = until(g, () => tossed(g).length, 1), [roly] = tossed(g);
    assert(s.kitAge >= flight.t0 + .6 - 1e-9 && s.kitAge < flight.t0 + .6 + 1 / 120 + 1e-9, 'none lands before t0 + .6');
    assert.equal(roly.foe, 'rolypoly'); assert.equal(roly.r, 12); assert.equal(roly.fall, .85); assert(roly.bossSummon && !roly.bloomed && g.foeWave);
    assert.deepEqual([roly.x, roly.y], [mark.x, mark.y]); assert.equal(s.lobs.length, 0);
    assert(landing.some(e => e.type === 'foe' && e.kind === 'rolypoly:land' && e.bud === roly)); assert.equal(acts(landing, 'land').length, 1);
  });
  test('Tangled, he lobs two (.18 s apart); a blocked hole stays quiet, a drifted flower moves a landing aside, and four is the most', () => {
    let g = rootknot(1, 0), s = g.bossState, b = s.boss;
    assert.equal(s.warning.text, 'Rootknot is tossing rolypolies!');
    assert.deepEqual(s.warning.targets.filter(t => t.role === 'toss').map(t => [t.x, t.y]), [[210, b.y + 70], [128, b.y + 70]]);
    play(g); const t0 = s.kitAge, landed = [];
    for (let n = 0; n < 120; n++) { const count = tossed(g).length; g.step(1 / 120); if (tossed(g).length > count) landed.push(s.kitAge - t0); }
    // (to the tick: the second lob leaves on the first tick after .18 s)
    assert.equal(landed.length, 2); assert(landed[0] >= .6 - 1e-9 && landed[0] < .6 + 2 / 120 && landed[1] >= .78 - 1e-9 && landed[1] < .78 + 2 / 120, landed.join());
    const marks = buds => rootknot(1, 0, { flowers: false, buds }).bossState.warning;
    let w = marks([flower('x', 210, 160)]);
    assert.deepEqual(w.targets.filter(t => t.role === 'toss').map(t => [t.x, t.y]), [[210, b.y + 100], [128, b.y + 70]], 'else 100 px below');
    w = marks([flower('x', 210, 174), flower('y', 210, 204)]);
    assert.deepEqual(w.targets.filter(t => t.role === 'toss').map(t => t.x), [128]); assert.equal(w.text, 'Rootknot is tossing a rolypoly!');
    w = marks([flower('x', 210, 174), flower('y', 210, 204), flower('z', 128, 174), flower('q', 128, 204)]);
    assert.equal(w.targets.filter(t => t.role === 'toss').length, 0); assert.equal(w.move, 'toss2'); assert.equal(w.text, 'Root walls! Watch the holes.');
    const live = n => Array.from({ length: n }, (_, i) => flower('t' + i, 40 + 40 * i, 300, { foe: 'rolypoly', rootToss: true }));
    assert.equal(marks(live(3)).targets.filter(t => t.role === 'toss').length, 1); assert.equal(marks(live(4)).targets.filter(t => t.role === 'toss').length, 0);
    // A flower that drifts onto the spot during the flight: it lands 18 px aside, or bounces off with no room at all.
    for (const [x, y, landsAt] of [[220, 186, [192, b.y + 70]], [210, 174, null]]) {
      g = rootknot(0, 1, { flowers: false }); s = g.bossState; play(g); g.buds.push(flower('drift', x, y));
      const events = until(g, () => !s.lobs.length, 1);
      if (landsAt) assert.deepEqual(tossed(g).map(p => [p.x, p.y]), [landsAt]);
      else { assert.equal(tossed(g).length, 0); assert(events.some(e => e.type === 'foe' && e.kind === 'rolypoly:bump')); }
    }
  });
  test('Bowled over: a rolypoly rolled into Rootknot deals 3 with a critical, never while he is underground, and stops at the mood line', () => {
    const roll = (g, b) => { g.due = { id: b.id, via: 'roll', by: 'seed-roll', depth: 1, from: { x: b.x, y: b.y + 70 } }; g.strike(b, true); g.due = null; };
    let g = arena(2), s = g.bossState, b = s.boss;
    roll(g, b); assert.equal(b.hp, 23); assert.equal(s.crits, 1);
    const crit = g.drainEvents().find(e => e.type === 'bossCritical'); assert(crit && crit.kind === 'root' && crit.via === 'roll' && crit.damage === 3);
    b.hp = 20; roll(g, b); assert.equal(b.hp, 18, 'stops at the line'); assert(s.shiftPending);
    g = rootknot(0, 0); s = g.bossState; b = s.boss; play(g); assert.equal(s.mode, 'burrow'); g.drainEvents();
    roll(g, b); assert.equal(b.hp, 26); assert(!g.drainEvents().some(e => e.type === 'bossCritical'), 'not underground');
    // End to end: a tossed rolypoly, bumped by a seed toward him once he is up, bowls him over.
    g = rootknot(0, 1, { flowers: false }); s = g.bossState; b = s.boss; play(g);
    until(g, () => s.mode !== 'burrow' && tossed(g).length, 4);
    const [ball] = tossed(g), at = Bosses.predictVisible(g, .4).get(b.id), d = Math.hypot(at.x - ball.x, at.y - ball.y);
    g.drainEvents(); hit(g, ball, { nx: -(at.x - ball.x) / d, ny: -(at.y - ball.y) / d });
    const events = until(g, () => b.hp < 26, 1.5), bowled = events.find(e => e.type === 'bossCritical');
    assert(bowled && bowled.via === 'roll'); assert.equal(b.hp, 23);
  });
  test('Tangled, the Root Carousel takes the biggest clump round a 30 px ring that sinks with the descent, evenly spaced, as forecast', () => {
    const g = rootknot(1, 1, { descent: 10.5 }), s = g.bossState, w = s.warning, mark = w.targets.find(t => t.role === 'knot');
    assert.equal(w.move, 'carousel'); assert.equal(w.text, 'Root carousel! Snap the knot.'); assert.equal(mark.r, 40);
    assert.deepEqual(w.targets.filter(t => t.role === 'carried').map(t => t.id).sort(), ['a', 'b', 'c'], 'the stray stays');
    const riders = ['a', 'b', 'c'].map(id => bud(g, id)), mean = key => riders.reduce((n, p) => n + p[key], 0) / 3;
    advance(g, .5); assert(Math.abs(mark.y - mean('y')) < 1e-6, 'the tell follows the falling clump');
    const start = acts(play(g), 'start'), knot = knotOf(s);
    assert.equal(start[0].move, 'carousel'); assert.deepEqual([knot.r, knot.hp, knot.until - knot.born], [10, 2, 3.5]);
    assert(Math.abs(knot.cx - mean('x')) < 1e-6 && Math.abs(knot.cy - mean('y')) < 1e-6); assert.deepEqual(s.carried.map(p => p.id).sort(), ['a', 'b', 'c']);
    advance(g, .3); let last = null;
    for (let n = 0; n < 20; n++) {
      const u = s.kitAge - knot.born, cy = knot.cy + .85 * 10.5 * u; assert(Math.abs(knot.y - cy) < 1e-6, 'the centre sinks at .85 x the descent');
      const angles = riders.map(p => { assert(Math.abs(Math.hypot(p.x - knot.x, p.y - knot.y) - 30) <= .5, 'radius 30'); return Math.atan2(p.y - knot.y, p.x - knot.x); });
      const gaps = angles.slice().sort((p, q) => p - q).map((a, i, list) => ((list[(i + 1) % 3] - a) % TAU + TAU) % TAU);
      for (const gap of gaps) assert(Math.abs(gap - TAU / 3) < .01, 'evenly spaced');
      if (last) assert(Math.abs(((angles[0] - last.a + Math.PI) % TAU + TAU) % TAU - Math.PI - 1.6 * (s.kitAge - last.t)) < 1e-6, 'turning at 1.6 rad/s');
      last = { a: angles[0], t: s.kitAge };
      const forecast = Bosses.predictVisible(g, .1); advance(g, .1);
      for (const p of [knot, ...riders]) { const f = forecast.get(p.id); assert(Math.abs(f.x - p.x) < 1e-6 && Math.abs(f.y - p.y) < 1e-6, 'posed as forecast'); }
    }
  });
  test('Left alone, the carousel flings its flowers 40 px outward at 3.5 s; they fall 1.3x for 2 s. Furious it spins 7 s, or less near the line', () => {
    let g = rootknot(1, 1, { descent: 10.5 }), s = g.bossState; play(g);
    const knot = knotOf(s), riders = s.carried.slice(), events = until(g, () => !knotOf(s), 4);
    assert(s.kitAge >= knot.until - 1e-9 && s.kitAge < knot.until + 1 / 120 + 1e-9); assert.equal(acts(events, 'fling')[0].n, 3);
    assert(!g.buds.includes(knot), 'the knot closes quietly'); assert(riders.every(p => !p.bloomed));
    const centre = { x: knot.cx, y: knot.cy + knot.sink * (knot.until - knot.born) };
    advance(g, .3 + 1 / 120);
    for (const p of riders) {
      assert.equal(p.carried, null); assert(Math.abs(Math.hypot(p.x - centre.x, p.y - centre.y) - 70) < 1, 'thrown 40 px past the ring');
      assert(p.y <= g.dangerY - 70); assert.equal(p.fall, 1.3);
    }
    assert.equal(s.carried.length, 0); advance(g, 2); assert(riders.every(p => p.fall === 1 && p.kitHurry === undefined), 'back to their own pace');
    g = rootknot(2, 1); s = g.bossState; play(g); assert.equal(knotOf(s).until - knotOf(s).born, 7);
    // A low clump lets go as soon as the ring's bottom would pass 70 px above the line.
    g = rootknot(2, 1, { flowers: false, descent: 10.5, buds: [flower('a', 180, 270), flower('b', 210, 270), flower('c', 195, 290)] }); s = g.bossState; play(g);
    const low = knotOf(s), D = low.until - low.born, low3 = s.carried.slice();
    assert(D < 7 && Math.abs(D - (g.dangerY - 70 - 42 - low.cy) / (.85 * 10.5)) < 1e-6, 'it ends early');
    until(g, () => !knotOf(s), 8); assert(low.y + 42 <= g.dangerY - 70 + .1); until(g, () => !s.carried.length, 1);
    assert(low3.every(p => !p.carried && p.y <= g.dangerY - 70 + .2), 'flung flowers stay above 70 px over the line');
    // One flower is no carousel, and nor is a second ring while one turns: he tosses two instead.
    assert.equal(rootknot(1, 1, { flowers: false, buds: [flower('a', 200, 200)] }).bossState.warning.move, 'toss2');
    g = rootknot(1, 1); s = g.bossState; play(g); s.cycle = 1; s.next = s.age; g.step(1 / 120); assert.equal(s.warning.move, 'toss2');
  });
  test('Snap the knot (two hits) and its flowers bloom in a cascade credited within .4 s; shot singly they leave the ring; the bot wants the knot', () => {
    let g = rootknot(1, 1, { descent: 10.5 }), s = g.bossState; play(g); advance(g, .5); g.drainEvents();
    let knot = knotOf(s);
    assert.deepEqual(Bosses.targets(g).filter(t => t.bud === knot).map(t => [t.priority, t.reason]), [[90, 'knot']]);
    hit(g, knot); assert.equal(knot.hp, 1); assert(!knot.bloomed);
    hit(g, knot); assert(knot.bloomed); const seed = 'seed' + serial, at = g.time;
    let events = [...g.drainEvents(), ...until(g, () => ['a', 'b', 'c'].every(id => bud(g, id).bloomed), .5)];
    let blooms = events.filter(e => e.type === 'bloom' && e.via === 'knot');
    assert.deepEqual(blooms.map(e => e.bud.id).sort(), ['a', 'b', 'c']); assert(blooms.every(e => e.seed === seed && g.time - at <= .4));
    assert.equal(acts(events, 'snap')[0].n, 3); assert.equal(s.carried.length, 0);
    assert.equal(acts(until(g, () => false, 4), 'fling').length, 0, 'a snapped knot never flings');
    g = rootknot(1, 1, { descent: 10.5 }); s = g.bossState; play(g); advance(g, .5); g.drainEvents(); knot = knotOf(s);
    g.strike(knot); g.strike(knot); events = [...g.drainEvents(), ...until(g, () => false, .5)];
    blooms = events.filter(e => e.type === 'bloom' && e.via === 'knot'); assert.equal(blooms.length, 3); assert(blooms.every(e => e.seed === null), 'uncredited: a plain chain');
    g = rootknot(1, 1, { descent: 10.5 }); s = g.bossState; play(g); advance(g, .5); knot = knotOf(s);
    hit(g, bud(g, 'a')); g.step(1 / 120);
    assert(bud(g, 'a').bloomed && !bud(g, 'a').carried); assert.deepEqual(s.carried.map(p => p.id).sort(), ['b', 'c']);
    assert.equal(Bosses.targets(g).find(t => t.bud === knot).priority, 80);
  });
  test('Furious, the Root Snare blocks the busier side of the fan for 4 s: 82 px at y 405.65 and 35°, never below 430', () => {
    const fan = (side, d) => { const a = 55 * Math.PI / 180; return [210 + side * d * Math.cos(a), 498 - d * Math.sin(a)]; };
    let g = rootknot(2, 2, { flowers: false }), w = g.bossState.warning;
    assert.equal(w.move, 'snare'); assert.equal(w.text, 'A root snare blocks one side!'); assert.deepEqual(w.targets.map(t => [t.x, t.y, t.r]), [[145.3, 405.65, 42]], 'ties go left');
    g = rootknot(2, 2, { flowers: false, buds: [flower('r1', ...fan(1, 200)), flower('r2', ...fan(1, 240)), flower('l1', ...fan(-1, 220))] });
    assert.equal(g.bossState.warning.targets[0].x, 274.7, 'the busier side');
    for (const side of [-1, 1]) {
      g = rootknot(2, 2, { flowers: false, buds: side > 0 ? [flower('r1', ...fan(1, 200))] : [] }); const s = g.bossState, b = s.boss; play(g); const t0 = s.kitAge;
      const snare = g.bumpers.find(p => p.bossSnare);
      assert.deepEqual([snare.id, snare.kind, snare.bossWall, snare.length, snare.y, snare.x, snare.angle], [b.id + '-snare', 'rock', true, 82, 405.65, side < 0 ? 145.3 : 274.7, side * .6109]);
      const ends = [-41, 41].map(k => [snare.x + k * Math.cos(snare.angle), snare.y + k * Math.sin(snare.angle)]);
      assert(Math.max(...ends.map(e => e[1])) < 430, 'clear of the pod'); if (side < 0) assert.deepEqual(ends.map(e => e.map(n => Math.round(n * 10) / 10)), [[111.7, 429.2], [178.9, 382.1]]);
      const [dx, dy] = fan(side, 300).map((n, i) => n - [210, 498][i]), shot = Engine.earliest({ buds: [], bumpers: g.bumpers, gates: [] }, { x: 210, y: 498 }, { x: dx, y: dy });
      assert(shot && shot.item === snare, 'a seed up the middle of that side meets it');
      const events = until(g, () => !g.bumpers.includes(snare), 5);
      assert(Math.abs(s.kitAge - t0 - 4) < 1 / 120 + 1e-9, 'gone at 4 s'); assert.equal(acts(events, 'wither').length, 1);
    }
    // A burrow's walls replace the last walls, never a standing snare.
    g = rootknot(2, 2, { flowers: false }); const s = g.bossState; play(g); s.cycle = 0; s.next = s.age; g.step(1 / 120); play(g);
    assert.equal(g.bumpers.filter(p => p.bossWall).length, 3); assert(g.bumpers.some(p => p.bossSnare));
  });
  test('Rootknot plays the same at 30, 60 and 144 FPS', () => {
    for (const index of [0, 1]) {
      const run = fps => { const g = rootknot(2, index, { descent: 10.5 }); advance(g, 12, fps); return g; };
      const sign = g => { const s = g.bossState; return { mode: s.mode, action: s.action, cycle: s.cycle, tier: s.tier, hp: s.boss.hp, carried: s.carried.map(p => p.id), parts: s.parts.map(p => p.bossPart), walls: g.bumpers.filter(p => p.bossWall).map(p => p.id), buds: g.buds.filter(p => !p.bloomed).map(p => p.id).sort() }; };
      const base = run(60);
      for (const fps of [30, 144]) {
        const g = run(fps); assert.deepEqual(sign(g), sign(base), fps + ' FPS');
        for (const p of base.buds) { const q = bud(g, p.id); assert(Math.hypot(p.x - q.x, p.y - q.y) < .5, `${p.id} at ${fps} FPS`); }
      }
    }
  });
  test('A Lullaby holds his lobs, carousel and snare where they are; each lands, flings or withers late by its length', () => {
    let g = rootknot(0, 1), s = g.bossState; play(g); advance(g, .2);
    const flight = JSON.stringify(s.lobs), age = s.kitAge, t = g.time; g.lullaby = 1; advance(g, .9);
    assert.equal(s.kitAge, age); assert.equal(JSON.stringify(s.lobs), flight); assert.equal(tossed(g).length, 0);
    until(g, () => tossed(g).length, 2); assert(Math.abs(g.time - t - .4 - 1) < 2 / 120, 'lands late by the Lullaby');
    g = rootknot(1, 1, { descent: 10.5 }); s = g.bossState; play(g); const acted = g.time; advance(g, 1);
    const knot = knotOf(s), poses = () => JSON.stringify([knot, ...s.carried].map(p => [p.x, p.y]));
    const before = poses(); g.lullaby = 1; advance(g, .9); assert.equal(poses(), before, 'the ring stands still');
    until(g, () => !knotOf(s), 5); assert(Math.abs(g.time - acted - 3.5 - 1) < 2 / 120, 'flings late by the Lullaby');
    g = rootknot(2, 2, { flowers: false }); s = g.bossState; play(g); const raised = g.time; g.lullaby = 1;
    until(g, () => !g.bumpers.some(p => p.bossSnare), 7); assert(Math.abs(g.time - raised - 4 - 1) < 2 / 120, 'withers late by the Lullaby');
  });
  test('Beaten mid-move, Rootknot leaves nothing behind: no carried flowers, knot, lobs, timers, snare or hurried falls', () => {
    let g = rootknot(1, 1, { descent: 10.5 }), s = g.bossState; play(g); until(g, () => !knotOf(s), 4); advance(g, .4);
    assert(['a', 'b', 'c'].every(id => bud(g, id).fall === 1.3));
    s.tier = 2; s.cycle = 2; s.next = s.age; g.step(1 / 120); play(g);
    g.buds.push(flower('e', 150, 200), flower('f', 175, 200)); s.cycle = 1; s.next = s.age; g.step(1 / 120); play(g);
    s.cycle = 0; s.next = s.age; g.step(1 / 120); play(g);
    assert(s.lobs.length && s.carried.length && knotOf(s) && g.bumpers.some(p => p.bossSnare), 'a lob, a ring and a snare are up');
    const b = s.boss; for (let n = 0; n < 200 && !b.bloomed; n++) g.strike(b);
    assert(b.bloomed); assert.equal(s.carried.length + s.lobs.length + s.timers.length, 0); assert(!g.buds.some(p => p.carried || p.kitHurry != null));
    assert(!g.bumpers.some(p => p.bossWall)); assert(!g.buds.some(p => p.bossPart === 'knot' && !p.bloomed));
    assert(['a', 'b', 'c'].every(id => bud(g, id).fall === 1)); assert.equal(g.dangerY, 448); assert.equal(g.aimNapUntil, 0);
  });
  test('The good bot beats Rootknot', () => {
    for (const seed of [7, 19]) {
      const run = bot.play(2, { seed, startWave: 10, noise: 2.5, think: .3, thinkSpread: .3, bounces: 2 });
      assert(run.won, `seed ${seed}: ${JSON.stringify(run.bossDiagnostics)}`);
    }
  });
  // The art, in a sandbox with a recording canvas: every move with Animations on and off.
  function rootArt(canvas) {
    const tally = { gradients: 0, blur: 0, calls: {}, hook: null, face: [] };
    const brush = () => {
      const stack = [], state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, lineDashOffset: 0 };
      const ctx = new Proxy(state, {
        get(t, name) {
          if (name in t) return t[name];
          if (name === 'canvas') return { width: 420, height: 560 };
          return (...args) => {
            for (const a of args) if (typeof a === 'number') assert(Number.isFinite(a), `${String(name)} received ${a}`);
            if (tally.hook) tally.calls[tally.hook] = (tally.calls[tally.hook] || 0) + 1;
            if (tally.hook === 'face' && /To$|^arc$|^ellipse$/.test(name)) tally.face.push(name, ...args.map(n => Math.round(n * 100)));
            if (name === 'save') stack.push({ ...state });
            else if (name === 'restore') { assert(stack.length, 'restore without save'); Object.assign(state, stack.pop()); }
            else if (name === 'measureText') return { width: String(args[0]).length * 7 };
            else if (name === 'getTransform') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            else if (/Gradient$/.test(name)) { if (tally.hook) tally.gradients++; return { addColorStop() {} }; }
          };
        },
        set(t, name, value) {
          if (['globalAlpha', 'lineWidth', 'shadowBlur', 'lineDashOffset'].includes(name)) assert(Number.isFinite(value), `${name} is finite`);
          if (name === 'shadowBlur' && value > 0 && tally.hook) tally.blur++;
          t[name] = value; return true;
        }
      });
      return { ctx, balanced: () => stack.length === 0 };
    };
    class Canvas { constructor(w, h) { this.width = w; this.height = h; this.rec = brush(); } getContext() { return this.rec.ctx; } }
    const scope = vm.createContext({ console, Math, Map, Set, WeakMap, Array, Object, Number, String, JSON, Date, performance, ...(canvas ? { OffscreenCanvas: Canvas } : {}) });
    for (const file of ['foe-art.js', 'art.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), scope, { filename: file });
    const kits = scope.BloomFoeArt.kits;
    for (const hook of ['under', 'part', 'face', 'over', 'aim']) {
      const call = kits[hook]; kits[hook] = (...args) => { const outer = tally.hook; tally.hook = hook; try { return call(...args); } finally { tally.hook = outer; } };
    }
    const frame = (game, still, quality = 0) => {
      const rec = brush(); scope.BloomArt.draw(rec.ctx, game, game.time, { showAim: false, theme: 'meadow', reducedMotion: still, quality });
      assert(rec.balanced(), 'transforms balance');
    };
    return { tally, frame };
  }
  test("Rootknot's art draws every move, Animations on and off, with no gradient or blur per frame; his three moods are three faces", () => {
    const { tally, frame } = rootArt(true), seen = new Set();
    const film = (g, seconds) => { for (let n = 0; n < seconds * 120; n++) { g.step(1 / 120); if (n % 15 === 0) { frame(g, false, n % 30 ? 0 : 2); frame(g, true); } } };
    for (const [tier, index, seconds] of [[0, 0, 3], [0, 1, 3], [1, 0, 3], [1, 1, 5], [2, 1, 1.5], [2, 2, 5.5]]) {
      const g = rootknot(tier, index, { descent: 10.5 }), s = g.bossState; seen.add(s.warning.move);
      film(g, 1.4 + seconds);
      if (tier === 2 && index === 1) { const knot = knotOf(s); g.strike(knot); g.strike(knot); film(g, 1); }
    }
    assert.deepEqual([...seen].sort(), ['carousel', 'root', 'snare', 'toss', 'toss2']);
    assert.equal(tally.gradients, 0, 'no gradient inside his hooks'); assert.equal(tally.blur, 0, 'no shadow blur');
    for (const hook of ['under', 'part', 'face', 'over']) assert(tally.calls[hook] > 0, hook + ' draws');
    const flat = rootArt(false), faces = [0, 1, 2].map(tier => { const g = arena(2); g.bossState.tier = tier; flat.tally.face = []; flat.frame(g, true); return JSON.stringify(flat.tally.face); });
    assert(faces.every(f => f.length > 100)); assert.equal(new Set(faces).size, 3, 'Grumpy, Tangled and Furious');
  });
}

// ── Mother Morel (Level 3, `puff`) ──

// ── Crystal Heart (Level 4, `crystal`) ──

// ── Lantern Lily (Level 5, `lotus`) ──

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'kits-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
