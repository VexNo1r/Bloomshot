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

// ── Mother Morel (Level 3, `puff`) ──

// ── Crystal Heart (Level 4, `crystal`) ──
const heartOf = (s, real = true) => s.parts.find(p => p.bossPart === 'heart' && Boolean(p.real) === real && !p.popped);
const shardsOf = g => g.buds.filter(p => p.bossShard && !p.bloomed);
// Runs Crystal Heart's next move at a forced tier and cycle, through its warning; returns the events.
function crystalMove(g, tier, cycle) {
  const s = g.bossState; s.tier = tier; s.cycle = cycle; s.next = 0; s.warning = null; g.drainEvents();
  for (let n = 0; n < 240 && !s.warning; n++) g.step(1 / 120);
  const events = []; while (s.warning) { g.step(1 / 120); events.push(...g.drainEvents()); }
  return events;
}
test('Crystal Heart: HP 36; a credited touch shatters a fake into two coral shards, no damage, and it re-forms 2.0 s later', () => {
  const g = arena(4), s = g.bossState, b = s.boss;
  assert.equal(b.maxHp, 36); assert.deepEqual(s.tierAt, [24, 12]);
  assert.equal(s.parts.filter(p => p.real).length, 1);
  for (const p of s.parts) assert.equal(Boolean(p.decoy && p.inert), !p.real, 'the fakes are glass decoys, the real heart is not');
  const fake = heartOf(s, false); hit(g, fake);
  assert.equal(b.hp, 36); assert(fake.popped && fake.bloomed);
  const events = g.drainEvents(), shards = shardsOf(g);
  assert(events.some(e => e.type === 'foe' && e.kind === 'crystal:fake'));
  assert(events.some(e => e.type === 'bossAbility' && e.move === 'heart' && e.act === 'fake'));
  assert.equal(shards.length, 2); assert.equal(new Set(shards.map(p => p.group)).size, 1);
  for (const p of shards) { assert.equal(p.type, 'coral'); assert.equal(p.r, 9); assert.equal(p.hp, 1); assert.equal(p.fall, 1.5); assert(p.gem && p.bossSummon); assert(p.ghost, 'a ghost to the seed that shattered it'); }
  assert.deepEqual(shards.map(p => Math.round(p.x - fake.x)), [-14, 14]);
  g.step(1 / 120); assert(shards.every(p => !p.ghost), 'solid once that seed is gone');
  advance(g, 1.9); assert(fake.popped, 'not yet');
  advance(g, .15); assert(!fake.popped && !fake.bloomed && fake.decoy && fake.inert, 're-formed as a fake');
  assert(g.drainEvents().some(e => e.type === 'bossAbility' && e.move === 'heart' && e.act === 'reform'));
  // A Lullaby holds the re-form on the kit clock: it comes late by the Lullaby's length.
  const other = heartOf(s, false); hit(g, other); g.lullaby = 1; advance(g, 2.9); assert(other.popped, 'held by the Lullaby');
  advance(g, .2); assert(!other.popped);
});
test('Crystal Heart: no shards while six are loose; powers and credited chains never pop a fake; a script pops one quietly', () => {
  let g = arena(4), s = g.bossState; g.descentSpeed = 20; // the shards fall clear of their spots between pops
  for (let k = 0; k < 4; k++) {
    const before = shardsOf(g).length, fake = heartOf(s, false); hit(g, fake); assert(fake.popped);
    assert.equal(shardsOf(g).length, Math.min(6, before + 2), `pop ${k + 1}`);
    if (k % 2) advance(g, 2.1);
  }
  assert.equal(shardsOf(g).length, 6);
  for (const power of ['beeline', 'sunburst']) {
    g = arena(4); s = g.bossState; const fake = heartOf(s, false);
    g.spawnBall({ x: fake.x, y: fake.y + 55, angle: -Math.PI / 2, speed: 520, power }); advance(g, .7);
    assert(s.parts.every(p => !p.popped), power); assert.equal(shardsOf(g).length, 0, power);
  }
  g = arena(4); s = g.bossState; let fake = heartOf(s, false);
  g.striker = { id: 'chain', type: g.nextType, bossContact: { nx: 0, ny: 1 } }; g.due = { by: 1 }; g.strike(fake, true); g.striker = null; g.due = null;
  assert(!fake.popped, 'a credited chain glances off the glass');
  g.strike(fake); assert(fake.popped, 'an uncredited strike pops it, so strike loops end');
  assert.equal(shardsOf(g).length, 0); assert(!g.drainEvents().some(e => e.type === 'bossAbility' && e.act === 'fake'));
});
test('Crystal Heart stops at 24: the held real heart turns seeds away while a fake still shatters; a mirror shot clamps too', () => {
  let g = arena(4), s = g.bossState, b = s.boss; b.hp = 25;
  hit(g, heartOf(s)); assert.equal(b.hp, 24); assert(s.shiftPending);
  g.drainEvents(); hit(g, heartOf(s)); assert.equal(b.hp, 24, 'held');
  assert(g.drainEvents().some(e => e.type === 'bossGuard' && e.mode === 'stage'));
  assert.equal(Bosses.canHit(g, heartOf(s), { nx: 0, ny: 1 }, { type: g.nextType }), false);
  const fake = heartOf(s, false); assert.equal(Bosses.canHit(g, fake, { nx: 0, ny: 1 }, { type: g.nextType }), true);
  hit(g, fake); assert(fake.popped, 'a fake can still be shot'); assert.equal(b.hp, 24);
  g = arena(4); s = g.bossState; b = s.boss; b.hp = 25;
  hit(g, heartOf(s), { mirrorAt: g.time }); assert.equal(b.hp, 24, 'a mirror shot stops at the threshold'); assert(s.shiftPending);
});
test('Crystal Heart turns Shining, then Racing, each with its own words; Shining opens with the shuffle', () => {
  const g = arena(4), s = g.bossState, b = s.boss; b.hp = 25; hit(g, heartOf(s)); g.drainEvents();
  for (let n = 0; n < 240 && !(s.warning && s.warning.move === 'stage'); n++) g.step(1 / 120);
  assert.equal(s.warning.text, 'Crystal Heart is shining!'); assert(s.warning.until - s.warning.at >= 1.3 - 1e-9);
  let events = []; while (s.warning) { g.step(1 / 120); events.push(...g.drainEvents()); }
  assert(events.some(e => e.type === 'bossStage' && e.kind === 'crystal' && e.stage === 1 && e.mood === 'Shining'));
  assert.equal(s.tier, 1);
  for (let n = 0; n < 480 && !s.warning; n++) g.step(1 / 120);
  assert.equal(s.warning.move, 'crystal', 'the shuffle first'); while (s.warning) g.step(1 / 120);
  for (let n = 0; n < 1200 && !s.warning; n++) g.step(1 / 120);
  assert.equal(s.warning.move, 'mirrors'); assert.equal(s.warning.text, 'Mirror shards! Bank a seed off one.');
  while (s.warning) g.step(1 / 120); advance(g, 1);
  b.hp = 13; hit(g, heartOf(s)); assert.equal(b.hp, 12); g.drainEvents();
  for (let n = 0; n < 240 && !(s.warning && s.warning.move === 'stage'); n++) g.step(1 / 120);
  assert.equal(s.warning.text, 'Crystal Heart is racing!');
  events = []; while (s.warning) { g.step(1 / 120); events.push(...g.drainEvents()); }
  assert(events.some(e => e.type === 'bossStage' && e.stage === 2 && e.mood === 'Racing'));
  for (let n = 0; n < 480 && !s.warning; n++) g.step(1 / 120);
  assert.equal(s.warning.move, 'hues'); assert.equal(s.warning.text, 'The heart wants one color!');
});
test('Mirror Shards: two blades at y 356 hold still .8 s, turn .7 rad each second, freeze in a Lullaby and leave after 6 s', () => {
  const g = arena(4), s = g.bossState, events = crystalMove(g, 1, 1);
  assert(events.some(e => e.type === 'bossAbility' && e.move === 'mirrors' && e.act === 'mirror'));
  const mirrors = g.bumpers.filter(m => m.bossMirror);
  assert.equal(mirrors.length, 2);
  assert.deepEqual(mirrors.map(m => [m.x, m.y, m.length, m.angle, m.kind, m.bossWall]), [[120, 356, 56, .6, 'rock', true], [300, 356, 56, -.6, 'rock', true]]);
  const t0 = mirrors[0].t0, angles = [], turns = [];
  for (let n = 0; n < 600; n++) {
    const u = s.kitAge - t0; angles.push([u, mirrors[0].angle, mirrors[1].angle]); g.step(1 / 120);
    turns.push(...g.drainEvents().filter(e => e.type === 'bossAbility' && e.act === 'turn'));
  }
  for (const [u, a, c] of angles) {
    const k = Math.floor(u + 1e-9);
    if (u - k < .8 - 1e-6) { assert(Math.abs(a - (.6 + .7 * k)) < 1e-9, `held at ${u.toFixed(3)}`); assert(Math.abs(c + .6 + .7 * k) < 1e-9); }
  }
  assert.deepEqual(turns.map(e => e.n), [1, 2, 3, 4, 5], 'one tick per turn');
  const kitAge = s.kitAge, pose = mirrors.map(m => m.angle); g.lullaby = 1.5; advance(g, 1);
  assert.equal(s.kitAge, kitAge); assert.deepEqual(mirrors.map(m => m.angle), pose, 'a Lullaby holds the blades');
  advance(g, 1.6); assert.equal(g.bumpers.filter(m => m.bossMirror).length, 0, 'gone after 6 s of the kit clock');
});
test('A seed banked off a mirror into the real heart is a Mirror shot: two damage, a critical, a flash; a late one is plain', () => {
  const g = arena(4), s = g.bossState, b = s.boss; crystalMove(g, 1, 1);
  const m = g.bumpers.find(x => x.bossMirror && x.lead), real = heartOf(s);
  // Aim so the seed's reflection off the blade's middle heads straight for the real heart.
  const ux = Math.cos(m.angle), uy = Math.sin(m.angle), L = Math.hypot(real.x - m.x, real.y - m.y), dx = (real.x - m.x) / L, dy = (real.y - m.y) / L;
  const dot = -dx * uy + dy * ux, ix = dx + 2 * dot * uy, iy = dy - 2 * dot * ux;
  g.spawnBall({ x: m.x - ix * 60, y: m.y - iy * 60, angle: Math.atan2(iy, ix), speed: 520 });
  const events = []; for (let n = 0; n < 120 && b.hp === 36; n++) { g.step(1 / 120); events.push(...g.drainEvents()); }
  g.step(1 / 120); events.push(...g.drainEvents());
  assert.equal(b.hp, 34); assert(Number.isFinite(m.flashAt));
  assert(events.some(e => e.type === 'bossCritical' && e.via === 'mirror' && e.damage === 2));
  for (const act of ['bank', 'shot']) assert(events.some(e => e.type === 'bossAbility' && e.move === 'mirrors' && e.act === act), act);
  advance(g, 1);
  hit(g, heartOf(s), { mirrorAt: g.time - 1.3 }); assert.equal(b.hp, 33, 'more than 1.2 s after the bank, a plain hit');
  advance(g, 1); hit(g, heartOf(s), { mirrorAt: g.time - .5 }); assert.equal(b.hp, 31);
});
test('Heartbeat Hues: the real heart wants one of the next three seeds; other colors glance off and the bot holds them', () => {
  const g = arena(4), s = g.bossState, b = s.boss, types = ['gold', 'coral', 'lilac', 'sky', 'poppy'];
  for (let k = 0; k < 6; k++) {
    g.shotNumber += k; const ahead = [0, 1, 2].map(n => g.typeAhead(n)), events = crystalMove(g, 2, 0);
    assert(ahead.includes(s.hue), `${s.hue} in ${ahead}`);
    const start = events.find(e => e.type === 'bossAbility' && e.move === 'hues' && e.act === 'start');
    assert(start && start.targets.some(t => t.role === 'hue' && t.type === s.hue), 'the start event carries the color');
    assert(Math.abs(s.next - s.age - 4.5) < .02, 'a 4.5 s spell');
  }
  const real = heartOf(s), other = types.find(t => t !== s.hue), hp = b.hp;
  assert.equal(Bosses.canHit(g, real, { nx: 0, ny: 1 }, { type: other }), false);
  for (const ok of [{ type: s.hue }, { type: other, power: 'beeline' }]) assert.equal(Bosses.canHit(g, real, { nx: 0, ny: 1 }, ok), true);
  assert.equal(Bosses.canHit(g, real, { nx: 0, ny: 1, chain: true }, { type: other }), true);
  assert.equal(Bosses.canHit(g, heartOf(s, false), { nx: 0, ny: 1 }, { type: other }), true);
  hit(g, real, { type: other }); assert.equal(b.hp, hp);
  assert(g.drainEvents().some(e => e.type === 'bossGuard' && e.mode === 'hue'));
  hit(g, real, { type: s.hue }); assert.equal(b.hp, hp - 1);
  // The practice bot: -1 for the real heart unless the seed in the launcher is the wanted color.
  while (g.nextType === s.hue) g.shotNumber++;
  let prepared = bot.prepareTrace(g); assert.equal(bot.value(g, { bud: heartOf(s), time: 0, nx: 0, ny: 1 }, .1, prepared), -1);
  while (g.nextType !== s.hue) g.shotNumber++;
  prepared = bot.prepareTrace(g); assert(bot.value(g, { bud: heartOf(s), time: 0, nx: 0, ny: 1 }, .1, prepared) > 0);
  crystalMove(g, 2, 1); assert.equal(s.hue, null, 'the mirrors end the spell');
});
test('Crystal Heart replays identically at 30, 60 and 144 FPS, and a strike loop leaves nothing behind', () => {
  const run = fps => {
    const g = arena(4), s = g.bossState, snaps = []; s.tier = 2; s.cycle = 0; s.next = 0; serial = 0;
    for (let sec = 1; sec <= 12; sec++) {
      for (let n = 0; n < fps; n++) g.step(1 / fps);
      const fake = s.parts.find(p => !p.real && !p.popped && p.slot === 0); if (fake) hit(g, fake);
      snaps.push(JSON.stringify([s.mode, s.action, s.cycle, s.hue, s.boss.hp, s.parts.map(p => [p.id, p.real, p.popped, p.x.toFixed(4), p.y.toFixed(4)]),
        g.bumpers.filter(m => m.bossMirror).map(m => m.angle.toFixed(6)), shardsOf(g).map(p => [p.id, p.y.toFixed(3)])]));
    }
    return snaps;
  };
  const at30 = run(30); assert.deepEqual(run(60), at30); assert.deepEqual(run(144), at30);
  const g = arena(4), s = g.bossState, b = s.boss; crystalMove(g, 2, 0); crystalMove(g, 2, 1); hit(g, heartOf(s, false));
  assert(s.hue === null && g.bumpers.some(m => m.bossMirror) && s.timers.length);
  for (let n = 0; n < 200 && !b.bloomed; n++) g.strike(b);
  assert(b.bloomed); assert.equal(s.timers.length + s.lobs.length, 0);
  assert(!g.buds.some(p => p.inert && !p.bloomed)); assert(!g.bumpers.some(m => m.bossMirror)); assert(!g.buds.some(p => p.ghost));
  assert.equal(s.hue, null);
});

// ── Lantern Lily (Level 5, `lotus`) ──

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'kits-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
