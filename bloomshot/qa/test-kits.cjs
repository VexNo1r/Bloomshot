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
// Runs Sunny's next move from a given tier and cycle (the board is still, so pieces stay where they open).
function sunnyMove(tier, cycle, g = arena(1)) {
  const s = g.bossState; s.tier = tier; s.cycle = cycle; s.next = s.age; g.step(1 / 120);
  const w = s.warning; assert(w, 'a warning is up'); while (s.warning) g.step(1 / 120); return { g, s, w, events: g.drainEvents() };
}
const acts = (events, act) => events.filter(e => e.type === 'bossAbility' && e.act === act);
test('Old Sunny: 18 health turning Cranky at 12 and Wide awake at 6, with his own words for each mood', () => {
  const g = arena(1), s = g.bossState, k = Bosses.kits.sunny;
  assert.equal(Bosses.health.sunny, 18); assert.equal(s.boss.maxHp, 18); assert.deepEqual(s.tierAt, [12, 6]);
  assert.deepEqual(k.moods, ['Sleepy', 'Cranky', 'Wide awake']); assert.deepEqual(k.stageText, [null, 'Old Sunny is cranky now!', 'Old Sunny is wide awake!']);
  assert.deepEqual(k.moves, [['sprouts', 'nap'], ['yawn', 'nap'], ['yawn', 'snooze', 'nap']]);
  for (const text of [...Object.values(k.text), ...k.stageText.slice(1)]) assert(text.length <= 52, text);
  assert.equal(k.text.yawn, 'Big yawn! Shut the sun portals.'); assert.equal(k.text.snooze, 'A snooze Z! Pop it before it lands.');
});
test('Old Sunny: a credited seed stops at 12 and the stage is announced next tick; his portals can still be shot', () => {
  let g = dizzySunny(13), s = g.bossState, b = s.boss; s.next = s.age + 9;
  // A portal open on the board (as a yawn leaves one), to show his attacks stay answerable while he is held.
  const [portal] = (Bosses.kits.sunny.act.yawn(g, s, { targets: [{ x: 120, y: 190, r: 16, role: 'portal' }] }), s.parts.filter(p => p.bossPart === 'portal'));
  assert(portal); s.next = s.age + 9; g.drainEvents();
  hit(g, b); assert.equal(b.hp, 12, 'a double hit stops at the threshold'); assert(s.shiftPending);
  g.step(1 / 120); assert.equal(s.warning && s.warning.move, 'stage', 'the mood change is announced at once, not after the 9 s cooldown');
  hit(g, b); assert.equal(b.hp, 12); assert(g.drainEvents().some(e => e.type === 'bossGuard' && e.mode === 'stage'));
  assert.equal(Bosses.canHit(g, b, { nx: 0, ny: 1 }, {}), false); assert.equal(Bosses.canHit(g, portal, { nx: 0, ny: 1 }, {}), true);
  g.strike(b); assert.equal(b.hp, 11, 'an uncredited strike still lands');
  g = dizzySunny(13); b = g.bossState.boss;
  g.spawnBall({ x: b.x, y: b.y + 55, angle: -Math.PI / 2, speed: 520, power: 'sunburst' }); advance(g, .7);
  assert.equal(b.hp, 9, 'a Sunburst passes the threshold');
});
test('Old Sunny: the change to Cranky is a guarded 1.3 s warning, then Phase Bloom, a dizzy Sunny stays dizzy, and he yawns next', () => {
  const g = dizzySunny(13), s = g.bossState, b = s.boss, dizzyLeft = s.modeUntil - s.age; s.next = s.age + 9;
  hit(g, b); g.step(1 / 120);
  const w = s.warning; assert.equal(w.move, 'stage'); assert(w.until - w.at >= 1.3 - 1e-9); assert.equal(w.text, 'Old Sunny is cranky now!');
  assert(Math.abs(s.modeUntil - s.age - dizzyLeft - 1.3) < .02, 'the dizzy window is paused for the warning, not lost');
  assert.equal(Bosses.canHit(g, b, { nx: 0, ny: 1 }, {}), false); assert.equal(Bosses.canHit(g, b, { nx: 0, ny: 1 }, { power: 'beeline' }), true);
  const events = []; while (s.warning) { g.step(1 / 120); events.push(...g.drainEvents()); }
  assert(!events.some(e => e.type === 'bossAbility'), 'Phase Bloom has its own voice only');
  const stage = events.find(e => e.type === 'bossStage'); assert(stage && stage.stage === 1 && stage.mood === 'Cranky' && stage.kind === 'sunny');
  assert.equal(s.tier, 1); assert.equal(s.mode, 'dizzy');
  for (let n = 0; n < 240 && !s.warning; n++) g.step(1 / 120);
  assert.equal(s.warning.move, 'yawn'); assert.equal(s.warning.text, 'Big yawn! Shut the sun portals.');
  // Wide awake at 6 the same way.
  b.hp = 7; hit(g, b); assert.equal(b.hp, 6); for (let n = 0; n < 600 && s.tier < 2; n++) g.step(1 / 120);
  assert.equal(s.tier, 2);
});
test('Old Sunny: a yawn drops the volley and opens a sun portal above each sprout; each spits one more 1.6 s later, then closes', () => {
  const { g, s, w, events } = sunnyMove(1, 0), b = s.boss;
  assert.equal(w.move, 'yawn'); const sprouts = w.targets.filter(t => t.role === 'sprout'), marks = w.targets.filter(t => t.role === 'portal');
  assert.equal(sprouts.length, 2); assert.equal(marks.length, 2);
  for (const m of marks) assert(sprouts.some(t => t.x === m.x && Math.abs(t.y - 34 - m.y) < 1e-9) && m.r === 16, 'each portal sits 34 px above its sprout');
  assert.equal(acts(events, 'start').filter(e => e.move === 'yawn').length, 1);
  const portals = s.parts.filter(p => p.bossPart === 'portal'), volley = g.buds.filter(p => p.sunnySprout);
  assert.equal(portals.length, 2); assert.equal(volley.length, 2); assert.equal(new Set(volley.map(p => p.group)).size, 1);
  for (const p of portals) { assert.equal(p.r, 16); assert.equal(p.hp, 1); assert.equal(p.sunBonus, 1); assert.equal(p.born, s.kitAge); assert(g.buds.includes(p)); }
  // The volley moves down out of the way (a still arena otherwise), so the mouths are clear when they spit.
  for (const p of volley) p.y += 60;
  advance(g, 1.55); assert.equal(g.buds.filter(p => p.sunnySprout).length, 2, 'nothing spat before 1.6 s');
  const before = g.buds.length; advance(g, .1);
  const spat = g.buds.filter(p => p.sunnySprout && p.group !== volley[0].group);
  assert.equal(spat.length, 2); assert.equal(g.buds.length, before + 2); assert.equal(new Set(spat.map(p => p.group)).size, 1, 'a spat pair is one life');
  assert(spat[0].group.startsWith(b.id + '-spit-'));
  for (const p of spat) { const from = portals.find(q => q.x === p.x); assert(from && Math.abs(p.y - from.y - 34) < 1e-9); assert(p.bossSummon && p.hp === 1 && p.r === 14 && p.type === 'gold'); }
  assert.equal(acts(g.drainEvents(), 'spit').length, 2);
  advance(g, 1.3); assert(portals.every(p => !p.closed), 'open until 3 s'); advance(g, .1);
  assert(portals.every(p => p.closed && !g.buds.includes(p) && !s.parts.includes(p)), 'both close quietly at 3 s');
  assert.equal(acts(g.drainEvents(), 'shut').length, 0, 'a closing portal is not a shut');
});
test('Old Sunny: shutting a portal stops its spit and pays exactly one more sun than a plain part bloom; uncredited pays nothing', () => {
  const { g, s } = sunnyMove(1, 0), [left, right] = s.parts.filter(p => p.bossPart === 'portal');
  for (const p of g.buds.filter(p => p.sunnySprout)) p.y += 60;
  let charge = g.sunCharge; hit(g, left); assert(left.bloomed); assert.equal(g.sunCharge - charge, 2, 'a shut: the bloom plus one sun');
  const e = acts(g.drainEvents(), 'shut'); assert.equal(e.length, 1); assert.equal(e[0].move, 'yawn');
  // The plain part bloom to compare with: his nap bubble.
  charge = g.sunCharge; hit(g, s.parts.find(p => p.bossPart === 'bubble')); assert.equal(g.sunCharge - charge, 1);
  charge = g.sunCharge; g.strike(right); assert(right.bloomed); assert.equal(g.sunCharge, charge, 'an uncredited shut pays no sun');
  const before = g.buds.filter(p => p.sunnySprout).length; advance(g, 1.7);
  assert.equal(g.buds.filter(p => p.sunnySprout).length, before, 'shut portals spit nothing'); assert.equal(acts(g.drainEvents(), 'spit').length, 0);
  advance(g, 1); assert(!s.parts.includes(left) && !g.buds.includes(left), 'a shut portal leaves the board once its bloom has played');
});
test('Old Sunny: a yawn never cuts short a dizzy window, and a portal is dropped where a flower is in its way', () => {
  const g = dizzySunny(18), s = g.bossState; s.modeUntil = s.age + 6;
  const { s: t } = sunnyMove(1, 0, g); assert(t.next >= t.modeUntil + .8 - 1e-9, 'the next move waits for the dizzy window');
  const h = arena(1), u = h.bossState; u.tier = 1; u.cycle = 0;
  const plan = Bosses.kits.sunny.plan.yawn(h, u, u.boss), mark = plan.targets.find(t => t.role === 'portal');
  h.buds.push({ id: 'in-the-way', group: 'in-the-way', x: mark.x + 18, y: mark.y, baseX: mark.x + 18, startY: mark.y, r: 11, type: 'sky', hp: 1, maxHp: 1, fall: 1, sway: 0, hitAt: -100, bloomAt: -100, bloomed: false, relay: false });
  const again = Bosses.kits.sunny.plan.yawn(h, u, u.boss).targets.filter(t => t.role === 'portal');
  assert.equal(again.length, 1); assert(!again.some(t => t.x === mark.x && t.y === mark.y));
});
test('Old Sunny: the snooze Z drifts from beside his face to just above the launcher; landing naps the aim guide only', () => {
  const { g, s, w, events } = sunnyMove(2, 1), b = s.boss;
  assert.equal(w.move, 'snooze'); assert.equal(w.text, 'A snooze Z! Pop it before it lands.');
  assert.deepEqual(w.targets.map(t => t.role), ['z', 'zland']); assert.deepEqual([w.targets[1].x, w.targets[1].y, w.targets[1].r], [210, 430, 20]);
  assert.equal(acts(events, 'start').filter(e => e.move === 'snooze').length, 1);
  const z = s.parts.find(p => p.bossPart === 'z'); assert(z && z.r === 13 && z.hp === 1 && g.buds.includes(z));
  assert(Math.hypot(z.x - b.x, z.y - b.y) >= b.r + z.r - 1e-9, 'it starts beside him');
  const bubble = s.parts.find(p => p.bossPart === 'bubble'); assert(Math.hypot(z.x - bubble.x, z.y - bubble.y) >= bubble.r + z.r, 'never on his nap bubble');
  // Its path is closed-form on the kit clock: the bot's forecast is the board.
  const ahead = Bosses.predictVisible(g, .5).get(z.id); advance(g, .5); assert(Math.abs(ahead.x - z.x) < 1e-6 && Math.abs(ahead.y - z.y) < 1e-6);
  const pod = g.pod, flight = z.len / 60; assert(flight > 4 && flight < 6, `a lazy ${flight.toFixed(1)} s drift`);
  let landed = null; for (let n = 0; n < 120 * 6 && !landed; n++) { g.step(1 / 120); landed = acts(g.drainEvents(), 'nap')[0]; }
  assert(landed, 'it lands'); assert.equal(landed.move, 'snooze'); assert(Math.abs(landed.x - 210) < 1e-6 && Math.abs(landed.y - 430) < 1e-6);
  assert(z.closed && !g.buds.includes(z)); assert(Math.abs(g.aimNapUntil - g.time - 2.5) < 1e-9, 'the aim guide naps for 2.5 s');
  assert.equal(g.pod, pod, 'the seed pod is untouched'); assert.equal(s.mode, 'sleeping', 'no reward for letting it land');
});
test('Old Sunny: popping the Z wakes him dizzy for 3 s (his nap bubble goes too); double hits still stop at a threshold', () => {
  const { g, s } = sunnyMove(2, 1), b = s.boss, z = s.parts.find(p => p.bossPart === 'z'), bubble = s.parts.find(p => p.bossPart === 'bubble');
  assert.equal(s.mode, 'sleeping'); b.hp = 13;
  hit(g, z); assert(z.bloomed); assert.equal(s.mode, 'dizzy'); assert(s.vulnerable); assert(Math.abs(s.modeUntil - s.age - 3) < 1e-9);
  assert(bubble.bloomed, 'the jolt pops his nap bubble'); const events = g.drainEvents();
  assert.equal(acts(events, 'zpop').length, 1); assert(events.some(e => e.type === 'bossPhase' && e.mode === 'dizzy'));
  s.tier = 0; s.tierAt = [12, 6]; hit(g, b); assert.equal(b.hp, 12, 'a dizzy double hit stops at the threshold'); s.shiftPending = false; s.warning = null; g.bossWarning = null;
  b.hp = 16; s.tier = 1; s.next = s.age + 20; hit(g, b); assert.equal(b.hp, 14, 'double damage'); advance(g, 3.05); assert.notEqual(s.mode, 'dizzy');
  // A Z popped while already dizzy never shortens the window.
  const h = dizzySunny(18), u = h.bossState; u.modeUntil = u.age + 5;
  const { s: v } = sunnyMove(2, 1, h); hit(h, v.parts.find(p => p.bossPart === 'z')); assert(v.modeUntil - v.age > 3.5);
});
test('Old Sunny: from Cranky on his nap bubble takes two hits; Sleepy keeps the one-hit bubble', () => {
  let { s } = sunnyMove(0, 0, (() => { const g = arena(1); g.bossState.action = 1; return g; })());
  assert.equal(s.parts.find(p => p.bossPart === 'bubble').maxHp, 1);
  const g = dizzySunny(18); ({ s } = sunnyMove(1, 1, g)); const bubble = s.parts.find(p => p.bossPart === 'bubble');
  assert.equal(s.mode, 'sleeping'); assert.equal(bubble.maxHp, 2); assert.equal(bubble.hp, 2); assert(!bubble.bloomed);
  hit(g, bubble); assert(!bubble.bloomed); assert.equal(s.mode, 'sleeping'); hit(g, bubble); assert(bubble.bloomed); assert.equal(s.mode, 'dizzy');
});
test('Old Sunny: the bot ranks a portal about to spit at 70, the Z at 80, and his bubble still first', () => {
  const { g, s } = sunnyMove(1, 0), rank = () => new Map(Bosses.targets(g).map(t => [t.bud.bossPart || 'boss', t.priority]));
  assert.equal(rank().get('portal'), 70); assert.equal(rank().get('bubble'), 95);
  for (const p of g.buds.filter(p => p.sunnySprout)) p.y += 60;
  advance(g, 1.7); assert.equal(rank().get('portal'), 45, 'after its spit a portal is an ordinary part');
  const { g: h, s: u } = sunnyMove(2, 1), z = u.parts.find(p => p.bossPart === 'z'), prepared = bot.prepareTrace(h);
  assert.equal(prepared.priorities.get(z.id), 80); assert(prepared.moving.some(m => m.original === z), 'the bot forecasts the Z in flight');
});
test('Old Sunny: tier 2 plays the same at 30, 60 and 144 FPS', () => {
  const runs = [30, 60, 144].map(fps => {
    const g = arena(1), s = g.bossState; s.tier = 2; s.cycle = 0; s.next = 0; g.descentSpeed = 12; const log = [];
    for (let n = 0; n < 12 * fps; n++) { g.step(1 / fps); for (const e of g.drainEvents()) if (e.type === 'bossAbility' || e.type === 'bossWarning') log.push(`${e.type}:${e.move}:${e.act || ''}:${(+e.x).toFixed(3)}`); }
    return { log: log.join(' '), mode: s.mode, action: s.action, cycle: s.cycle, kit: s.kitAge.toFixed(6), poses: g.buds.map(p => `${p.id}@${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ') };
  });
  assert(runs[0].log.includes('snooze') && runs[0].log.includes('yawn:spit'), 'the run saw a yawn and a snooze');
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});
test('Old Sunny: a Lullaby holds the portals, their spit and the Z in flight; they carry on after it, late by its length', () => {
  const { g, s } = sunnyMove(1, 0); for (const p of g.buds.filter(p => p.sunnySprout)) p.y += 60;
  const kit = s.kitAge, spit = s.timers.find(t => t.act === 'spit').at; advance(g, .5);
  g.lullaby = 1; advance(g, 1); assert(Math.abs(s.kitAge - kit - .5) < 1e-6, 'the kit clock stopped'); assert(!acts(g.drainEvents(), 'spit').length);
  let at = null; for (let n = 0; n < 240 && at == null; n++) { g.step(1 / 120); if (acts(g.drainEvents(), 'spit').length) at = g.time; }
  assert(at != null && Math.abs(s.kitAge - spit) < .01, 'it spat on the kit clock, a second late');
  const { g: h, s: u } = sunnyMove(2, 1), z = u.parts.find(p => p.bossPart === 'z'); advance(h, 1); const pose = [z.x, z.y];
  h.lullaby = 1; advance(h, 1); assert.deepEqual([z.x, z.y], pose, 'the Z waits in the air');
});
// art.js and foe-art.js in a VM with a recording canvas (as test-boss-art.cjs): every number finite, transforms
// balanced, and no gradient painted per frame.
function sunnyArt() {
  const vm = require('node:vm'), totals = { gradients: 0 };
  function brush() {
    const stack = []; let matrix = [1, 0, 0, 1, 0, 0];
    const state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, lineDashOffset: 0 };
    const mul = (a, b, c, d, e, f) => { const m = matrix; matrix = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; };
    const ctx = new Proxy(state, {
      get(t, name) {
        if (name in t) return t[name];
        if (name === 'canvas') return { width: 420, height: 560 };
        if (name === 'getTransform') return () => { const [a, b, c, d, e, f] = matrix; return { a, b, c, d, e, f }; };
        return (...args) => {
          args.forEach(a => { if (typeof a === 'number') assert(Number.isFinite(a), `${String(name)} received ${a}`); });
          if (name === 'save') stack.push({ matrix: matrix.slice(), state: { ...state } });
          else if (name === 'restore') { assert(stack.length, 'restore without save'); const old = stack.pop(); matrix = old.matrix; Object.assign(state, old.state); }
          else if (name === 'translate') mul(1, 0, 0, 1, ...args);
          else if (name === 'scale') mul(args[0], 0, 0, args[1], 0, 0);
          else if (name === 'rotate') mul(Math.cos(args[0]), Math.sin(args[0]), -Math.sin(args[0]), Math.cos(args[0]), 0, 0);
          else if (name === 'setTransform') matrix = args.slice();
          else if (name === 'measureText') return { width: String(args[0]).length * 7 };
          else if (name === 'createLinearGradient' || name === 'createRadialGradient' || name === 'createPattern') { totals.gradients++; return { addColorStop() {} }; }
        };
      },
      set(t, name, value) { if (['globalAlpha', 'lineWidth', 'shadowBlur'].includes(name)) assert(Number.isFinite(value), `${name} is finite`); t[name] = value; return true; }
    });
    return { ctx, balanced: () => stack.length === 0 && matrix.every(Number.isFinite) };
  }
  class Canvas { constructor(w, h) { this.width = w; this.height = h; this.rec = brush(); } getContext() { return this.rec.ctx; } }
  const scope = vm.createContext({ console, Math, Map, Set, WeakMap, Array, Object, Number, String, JSON, Date, OffscreenCanvas: Canvas });
  for (const file of ['art.js', 'foe-art.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), scope, { filename: file });
  return { Art: scope.BloomArt, looks: scope.BloomFoeArt.KIT_LOOKS, brush, totals };
}
test('Old Sunny: his moods, portals, Z and napping aim guide draw balanced, finite and with no per-frame gradients', () => {
  const { Art, looks, brush, totals } = sunnyArt(), sunny = looks.sunny, drawn = new Set();
  // The kit, not the stock art, must draw each piece: his face every time, the portals and the Z, the napping guide's zz.
  for (const hook of ['face', 'part', 'over', 'aim']) {
    const own = sunny[hook];
    sunny[hook] = (ctx, state, s, piece, ...rest) => { const done = own(ctx, state, s, piece, ...rest); if (done !== false) drawn.add(hook === 'part' ? piece.bossPart : hook); return done; };
  }
  const snap = (label, state) => {
    for (const reducedMotion of [false, true]) {
      const options = { theme: 'meadow', reducedMotion, showAim: true };
      Art.draw(brush().ctx, state, state.time, options);
      const warm = totals.gradients, rec = brush(); Art.draw(rec.ctx, state, state.time + .05, options);
      assert(rec.balanced(), `${label}: balanced`); const kitGradients = totals.gradients - warm;
      const look = looks.sunny; delete looks.sunny; const bare = totals.gradients; Art.draw(brush().ctx, state, state.time + .05, options); looks.sunny = look;
      assert.equal(kitGradients, totals.gradients - bare, `${label}: the kit adds no per-frame gradient`);
    }
  };
  // Every face, his volley's art-only portals, a yawn from its tell to a shut and a closing portal, the Z, the nap.
  let g = arena(1), s = g.bossState; snap('asleep', g);
  for (const [tier, mode] of [[0, 'cross'], [1, 'cross'], [2, 'cross'], [1, 'sleeping'], [2, 'dizzy']]) { const h = arena(1); Object.assign(h.bossState, { tier, mode }); snap(`${tier}:${mode}`, h); }
  s.next = s.age; s.mode = 'cross'; for (let n = 0; n < 80; n++) g.step(1 / 120); snap('volley tell', g); while (s.warning) g.step(1 / 120); advance(g, .1); snap('volley drop', g);
  ({ g, s } = sunnyMove(1, 0)); snap('portals pop', g); advance(g, .05); snap('portals open', g); advance(g, 1); snap('peek', g);
  for (const p of g.buds.filter(p => p.sunnySprout)) p.y += 60; advance(g, .5); snap('spit', g);
  hit(g, s.parts.find(p => p.bossPart === 'portal')); advance(g, .05); snap('shut', g); advance(g, .95); snap('closing', g);
  ({ g, s } = sunnyMove(2, 1)); advance(g, 2); snap('z', g);
  for (let n = 0; n < 900 && !(g.aimNapUntil > 0); n++) g.step(1 / 120);
  assert(g.aimNapUntil > g.time, 'the Z landed'); g.aim = [{ x: 210, y: 498 }, { x: 150, y: 300 }, { x: 100, y: 120 }]; snap('nap', g);
  for (const hook of ['face', 'portal', 'z', 'over', 'aim']) assert(drawn.has(hook), hook);
});
test('Old Sunny: beaten mid-attack, he leaves no portal, Z, timer or napping aim guide behind', () => {
  const { g, s } = sunnyMove(1, 0); const { s: t } = sunnyMove(2, 1, g); g.aimNapUntil = g.time + 2;
  assert(t.parts.some(p => p.bossPart === 'z') && t.timers.length);
  for (let n = 0; n < 200 && !s.boss.bloomed; n++) g.strike(s.boss, true);
  assert(s.boss.bloomed); assert.equal(s.timers.length + s.lobs.length + s.portals.length, 0); assert(s.parts.every(p => p.bloomed));
  assert.equal(g.aimNapUntil, 0); assert.equal(g.dangerY, 448);
  advance(g, 4); assert(!acts(g.drainEvents(), 'spit').length && !acts(g.drainEvents(), 'nap').length);
});

// ── Rootknot (Level 2, `root`) ──

// ── Mother Morel (Level 3, `puff`) ──
// Runs Mother Morel's next move from a given tier, cycle (tiers 1-2) or action (tier 0); the board is still.
function morelMove(tier, cycle, g = arena(3), action) {
  const s = g.bossState; s.tier = tier; s.cycle = cycle; if (action != null) s.action = action; s.next = s.age; const before = s.action; g.step(1 / 120);
  const w = s.warning; assert(w, 'a warning is up'); while (s.warning) g.step(1 / 120); return { g, s, w, before, events: g.drainEvents() };
}
// A plain puffcap beside her (dx, dy from her centre).
function morelPuff(g, dx, dy) {
  const b = g.bossState.boss, x = b.x + dx, y = b.y + dy;
  const puff = { id: 'puff' + ++serial, group: 'puff' + serial, x, y, baseX: x, startY: y, r: 12, hp: 1, maxHp: 1, type: 'lilac', puff: true, relay: false, fall: 0, sway: 0, hitAt: -100, bloomAt: -100, bloomed: false };
  g.buds.push(puff); return puff;
}
const TAU_3 = 2 * Math.PI / 3, dancers = s => s.parts.filter(p => p.bossPart === 'waltz' || p.bossPart === 'fibwaltz');
const foeEvents = (events, kind) => events.filter(e => e.type === 'foe' && e.kind === kind);
test('Mother Morel: 33 health turning Tricky at 22 and Stormy at 11, with her own words for each move', () => {
  const g = arena(3), s = g.bossState, k = Bosses.kits.puff;
  assert.equal(Bosses.health.puff, 33); assert.equal(s.boss.maxHp, 33); assert.deepEqual(s.tierAt, [22, 11]);
  assert.deepEqual(k.moods, ['Graceful', 'Tricky', 'Stormy']); assert.deepEqual(k.stageText, [null, 'Mother Morel gets tricky!', 'Mother Morel brings the rain!']);
  assert.deepEqual(k.moves, [['puff', 'waltz'], ['puff', 'waltz', 'fakeout'], ['ink', 'puff', 'fibwaltz']]);
  for (const text of [...Object.values(k.text), ...k.stageText.slice(1)]) assert(text.length <= 52, text);
  assert.deepEqual(k.text, { waltz: 'Spore waltz! Pop her dancing cap.', fakeout: 'Which cap is real? Find the spots!', ink: 'Ink rain! Mind the drips.',
    fibwaltz: 'Watch the paint! Pop the spotty cap.' });
});
test('Mother Morel: a credited puff chain at 23 stops at 22 and the stage is announced next tick; an uncredited one passes', () => {
  let g = arena(3), s = g.bossState, b = s.boss; s.next = s.age + 9; b.hp = 23;
  hit(g, morelPuff(g, 50, 10)); advance(g, .3); assert.equal(b.hp, 22, 'a puff (2) stops at the threshold'); assert(s.shiftPending);
  assert.equal(s.warning && s.warning.move, 'stage'); assert.equal(s.warning.text, 'Mother Morel gets tricky!');
  hit(g, morelPuff(g, -50, 10)); advance(g, .3); assert.equal(b.hp, 22, 'held until the new mood is announced');
  g = arena(3); s = g.bossState; b = s.boss; s.next = s.age + 9; b.hp = 23;
  g.strike(morelPuff(g, 50, 10)); advance(g, .3); assert.equal(b.hp, 21, 'an uncredited chain keeps its damage');
});
test('Mother Morel: Tricky and Stormy are each a guarded 1.3 s warning, then Phase Bloom and the new list', () => {
  const g = arena(3), s = g.bossState, b = s.boss; s.next = s.age + 9; b.hp = 23; hit(g, morelPuff(g, 50, 10)); advance(g, .2);
  let w = s.warning; assert.equal(w.move, 'stage'); assert(w.until - w.at >= 1.3 - 1e-9);
  assert.equal(Bosses.canHit(g, b, { nx: 0, ny: 1 }, {}), false); assert.equal(Bosses.canHit(g, b, { nx: 0, ny: 1 }, { power: 'beeline' }), true);
  let events = []; while (s.warning) { g.step(1 / 120); events.push(...g.drainEvents()); }
  assert(!events.some(e => e.type === 'bossAbility'), 'Phase Bloom has its own voice only');
  let stage = events.find(e => e.type === 'bossStage'); assert(stage && stage.stage === 1 && stage.mood === 'Tricky' && stage.kind === 'puff');
  for (let n = 0; n < 240 && !s.warning; n++) g.step(1 / 120);
  assert.equal(s.tier, 1); assert.equal(s.warning.move, 'puff', 'tier 1 starts its own list');
  while (s.warning) g.step(1 / 120);
  b.hp = 12; s.next = s.age + 9; hit(g, morelPuff(g, -50, 10)); advance(g, .2); assert.equal(b.hp, 11); w = s.warning;
  assert.equal(w.move, 'stage'); assert.equal(w.text, 'Mother Morel brings the rain!');
  events = []; while (s.warning) { g.step(1 / 120); events.push(...g.drainEvents()); }
  stage = events.find(e => e.type === 'bossStage'); assert(stage && stage.stage === 2 && stage.mood === 'Stormy');
  for (let n = 0; n < 240 && !s.warning; n++) g.step(1 / 120);
  assert.equal(s.warning.move, 'ink'); assert.equal(s.warning.text, 'Ink rain! Mind the drips.');
});
test('Mother Morel: her waltz partner circles her at 58 px for 8 s, forecast exactly, then twirls home quietly', () => {
  const { g, s, w, events } = morelMove(0, 0, arena(3), 1), b = s.boss;
  assert.equal(w.move, 'waltz'); assert.equal(w.text, 'Spore waltz! Pop her dancing cap.');
  assert.deepEqual(w.targets.map(t => [t.role, t.r]), [['waltz', 14]]);
  assert(Math.abs(w.targets[0].x - b.x - 58) < 1 && Math.abs(w.targets[0].y - b.y) < 1, 'the mark is where she will be (to a tick), 58 px to her right');
  assert.equal(acts(events, 'start').filter(e => e.move === 'waltz').length, 1);
  const [p] = dancers(s); assert.equal(dancers(s).length, 1);
  assert(p.puff && p.r === 12 && p.hp === 1 && p.type === 'lilac' && p.a0 === 0 && p.born === s.kitAge && g.buds.includes(p));
  const ahead = Bosses.predictVisible(g, .5).get(p.id); advance(g, .5);
  assert(Math.abs(ahead.x - p.x) < 1e-6 && Math.abs(ahead.y - p.y) < 1e-6, 'the bot forecast is the board');
  assert(Math.abs(Math.atan2(p.y - b.y, p.x - b.x) - (s.kitAge - p.born)) < 1e-6, 'one radian a second, clockwise on screen');
  for (let i = 0; i < 20; i++) { advance(g, .35); assert(Math.abs(Math.hypot(p.x - b.x, p.y - b.y) - 58) <= .5, `sample ${i}`); }
  const prepared = bot.prepareTrace(g); assert.equal(prepared.priorities.get(p.id), 75); assert(prepared.moving.some(m => m.original === p), 'the bot leads it');
  assert.equal(new Map(Bosses.targets(g).map(t => [t.bud.bossPart || 'boss', t.priority])).get('waltz'), 75);
  const hp = b.hp; g.drainEvents(); advance(g, 8 - (s.kitAge - p.born) - .02); assert(!p.closed, 'it dances for 8 s');
  advance(g, .05); assert(p.closed && !g.buds.includes(p) && !s.parts.includes(p)); assert.equal(b.hp, hp);
  assert(!g.drainEvents().some(e => e.type === 'bossCritical' || e.type === 'bossAbility'), 'a closing partner is quiet');
});
test('Mother Morel: popping her partner chains into her for 2 with a "waltz" critical, and stops at a threshold', () => {
  let { g, s } = morelMove(0, 0, arena(3), 1), b = s.boss, [p] = dancers(s);
  s.next = s.age + 20; b.hp = 30; advance(g, .7); hit(g, p); assert(p.bloomed); advance(g, .3);
  assert.equal(b.hp, 28); const crit = g.drainEvents().filter(e => e.type === 'bossCritical');
  assert.equal(crit.length, 1); assert.equal(crit[0].via, 'waltz'); assert.equal(crit[0].kind, 'puff'); assert.equal(crit[0].damage, 2); assert.equal(s.crits, 1);
  // A plain puffcap's chain is no waltz.
  hit(g, morelPuff(g, 0, 50)); advance(g, .3); assert.equal(b.hp, 26); assert(!g.drainEvents().some(e => e.type === 'bossCritical'));
  ({ g, s } = morelMove(0, 0, arena(3), 1)); b = s.boss; [p] = dancers(s); s.next = s.age + 20; b.hp = 23;
  hit(g, p); advance(g, .3); assert.equal(b.hp, 22, 'a waltz pop stops at the threshold'); assert(s.shiftPending);
  advance(g, 2); assert(!s.parts.includes(p) && !g.buds.includes(p), 'a popped partner leaves once its bloom has played');
});
test('Mother Morel: a fakeout tosses one real puffcap and two fibcaps to three spots, landing 0.9 s later', () => {
  const { g, s, w, before, events } = morelMove(1, 2), b = s.boss;
  assert.equal(w.move, 'fakeout'); assert.equal(w.text, 'Which cap is real? Find the spots!');
  const marks = w.targets.filter(t => t.role === 'fakeout'); assert.equal(marks.length, 3);
  assert.deepEqual(marks.map(m => Boolean(m.real)), [0, 1, 2].map(i => i === Math.floor(Foes.hash01(b.id, before) * 3)));
  for (const m of marks) assert(m.x >= 34 && m.x <= 386 && m.y <= g.dangerY - 120 && m.r === 12);
  assert.equal(acts(events, 'start').filter(e => e.move === 'fakeout').length, 1);
  assert.deepEqual(s.lobs.map(l => l.look).sort(), ['fibcap', 'fibcap', 'puffcap']); assert(s.lobs.every(l => l.T === .9 && l.t0 === s.kitAge));
  const count = g.buds.length; advance(g, .85); assert.equal(g.buds.length, count, 'nothing lands before 0.9 s');
  advance(g, .1); assert.equal(s.lobs.length, 0); const landed = g.drainEvents();
  const real = g.buds.filter(p => p.bossSummon && p.puff), fakes = g.buds.filter(p => p.bossSummon && p.foe === 'fibcap');
  assert.equal(real.length, 1); assert.equal(fakes.length, 2);
  assert(real[0].r === 12 && real[0].hp === 1 && real[0].type === 'lilac' && real[0].fall === .8);
  const spot = marks.find(m => m.real); assert(real[0].x === spot.x && real[0].y === spot.y, 'the real cap lands on the real spot');
  for (const f of fakes) { assert(f.decoy && f.inert); assert(marks.some(m => !m.real && m.x === f.x && m.y === f.y)); assert.equal(bot.value(g, { bud: f, nx: 0, ny: 1, time: 0 }, 0, bot.prepareTrace(g)), -1); }
  assert.equal(foeEvents(landed, 'fibcap:land').length, 2); assert.equal(acts(landed, 'land').length, 1);
});
test('Mother Morel: a fakeout spot filled during the warning gets no cap; the start ring shows the kept spots and one is still real', () => {
  const g = arena(3), s = g.bossState; s.tier = 1; s.cycle = 2; s.next = s.age; g.step(1 / 120);
  const marks = s.warning.targets.filter(t => t.role === 'fakeout'), { x, y } = marks.find(m => m.real); assert.equal(marks.length, 3);
  g.buds.push({ id: 'in-the-way', group: 'in-the-way', x, y, baseX: x, startY: y, r: 11, type: 'sky', hp: 1, maxHp: 1, fall: 1, sway: 0, hitAt: -100, bloomAt: -100, bloomed: false, relay: false });
  const events = []; while (s.warning) { g.step(1 / 120); events.push(...g.drainEvents()); }
  const start = acts(events, 'start').find(e => e.move === 'fakeout');
  assert.equal(start.targets.length, 2); assert(!start.targets.some(t => t.x === x && t.y === y), 'the filled spot is not shown');
  assert.equal(s.lobs.length, 2); assert.equal(s.lobs.filter(l => l.look === 'puffcap').length, 1, 'one of the two left is real');
  advance(g, 1); assert.equal(g.buds.filter(p => p.bossSummon && p.puff).length, 1); assert.equal(g.buds.filter(p => p.bossSummon && p.foe === 'fibcap').length, 1);
});
test('Mother Morel: ink rain drops from three lanes for 4 s, 15 drops in all, each its own group', () => {
  const { g, s, w } = morelMove(2, 0), b = s.boss;
  assert.equal(w.move, 'ink'); const lanes = w.targets.filter(t => t.role === 'ink');
  assert.equal(lanes.length, 3); assert(lanes.every(t => t.y === 300 && t.r === 18 && t.x >= 40 && t.x <= 380));
  assert(Math.abs(lanes[1].x - lanes[0].x - 60) < 1e-6 && Math.abs(lanes[2].x - lanes[1].x - 60) < 1e-6, 'lanes 60 px apart');
  assert.deepEqual(s.ink.lanes, lanes.map(t => t.x)); assert(Math.abs(s.ink.until - s.ink.t0 - 4) < 1e-9);
  const t0 = s.ink.t0, drips = [];
  for (let n = 0; n < 120 * 4.7; n++) {
    g.step(1 / 120);
    for (const e of g.drainEvents()) if (e.type === 'foe' && e.kind === 'inkcap:drip') { drips.push({ ...e, at: s.kitAge - t0 }); assert(Math.abs(e.y - (b.y + b.r + 8)) < 2, 'it drops from her rim'); }
  }
  assert.equal(drips.length, 15);
  for (let k = 0; k < 3; k++) {
    const own = drips.filter(e => e.x === lanes[k].x); assert.equal(own.length, 5, `lane ${k}`);
    own.forEach((e, i) => assert(Math.abs(e.at - (.27 * k + .8 * i)) < 1 / 100, `lane ${k} drop ${i} at ${e.at}`));
  }
  const drops = drips.map(e => e.bud); assert(drops.every(d => d.foe === 'inkdrop')); assert.equal(new Set(drops.map(d => d.group)).size, 15, 'each drop is its own life');
  assert.equal(s.ink, null, 'the rain is over');
});
test('Mother Morel: the painted waltz paints all but one partner into fibcaps at 2.3 s; a direct hit sneezes and shuts her bonnet', () => {
  let { g, s, w } = morelMove(2, 2), b = s.boss, parts = dancers(s);
  assert.equal(w.move, 'fibwaltz'); assert.equal(w.text, 'Watch the paint! Pop the spotty cap.'); assert.equal(w.targets.filter(t => t.role === 'waltz').length, 3);
  assert.equal(parts.length, 3); assert.deepEqual(parts.map(p => +p.a0.toFixed(6)), [0, TAU_3, 2 * TAU_3].map(a => +a.toFixed(6)));
  assert(parts.every(p => p.puff && p.bossPart === 'waltz'));
  advance(g, 2.25); assert(parts.every(p => p.bossPart === 'waltz'), 'not before 2.3 s');
  advance(g, .1); const events = g.drainEvents(), real = parts[Math.floor(Foes.hash01(b.id, s.action) * 3)];
  assert.equal(acts(events, 'paint').length, 1);
  const painted = parts.filter(p => p.bossPart === 'fibwaltz'); assert.equal(painted.length, 2); assert(!painted.includes(real));
  for (const p of painted) { assert(p.decoy && p.inert && !p.puff); assert.equal(bot.value(g, { bud: p, nx: 0, ny: 1, time: 0 }, 0, bot.prepareTrace(g)), -1); }
  assert.equal(real.bossPart, 'waltz'); assert(real.puff && Number.isFinite(real.spottedAt));
  for (const p of parts) assert(Math.abs(Math.hypot(p.x - b.x, p.y - b.y) - 58) <= .5);
  const ranked = Bosses.targets(g); assert(!ranked.some(t => t.bud.bossPart === 'fibwaltz')); assert.equal(ranked.find(t => t.bud === real).priority, 75);
  // A credited direct hit: a sneeze from the painted cap, her bonnet shut for 2 s, no damage.
  const hp = b.hp; hit(g, painted[0]); let after = g.drainEvents();
  assert(painted[0].bloomed); assert.equal(foeEvents(after, 'fibcap:sneeze').length, 1); assert.equal((g.sneezes || []).length, 1);
  assert.equal(s.mode, 'bonnet'); assert(Math.abs(s.modeUntil - s.age - 2) < 1e-9); assert.equal(b.hp, hp);
  // An uncredited strike pops the other quietly.
  g.strike(painted[1]); after = g.drainEvents(); assert(painted[1].bloomed); assert.equal(foeEvents(after, 'fibcap:pop').length, 1); assert.equal(g.sneezes.length, 1);
  // So does a power.
  ({ g, s } = morelMove(2, 2)); parts = dancers(s); advance(g, 2.4);
  const fib = parts.find(p => p.bossPart === 'fibwaltz'); hit(g, fib, { power: 'beeline' }); after = g.drainEvents();
  assert(fib.bloomed); assert.equal(foeEvents(after, 'fibcap:pop').length, 1); assert(!(g.sneezes || []).length); assert.notEqual(s.mode, 'bonnet');
});
test('Mother Morel: tier 2 plays the same at 30, 60 and 144 FPS', () => {
  const runs = [30, 60, 144].map(fps => {
    const g = arena(3), s = g.bossState; s.tier = 2; s.cycle = 2; s.next = 0; g.descentSpeed = 12; const log = [];
    for (let n = 0; n < 12 * fps; n++) {
      g.step(1 / fps);
      for (const e of g.drainEvents()) if (e.type === 'bossAbility' || e.type === 'bossWarning' || e.type === 'foe') log.push(`${e.type}:${e.move || e.kind}:${e.act || ''}:${(+e.x).toFixed(3)}`);
    }
    return { log: log.join(' '), mode: s.mode, action: s.action, cycle: s.cycle, kit: s.kitAge.toFixed(6), poses: g.buds.map(p => `${p.id}@${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ') };
  });
  assert(runs[0].log.includes('fibwaltz:paint') && runs[0].log.includes('ink:ink') && runs[0].log.includes('inkcap:drip'), 'the run saw a painted waltz and the rain');
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});
test('Mother Morel: a Lullaby holds the dance, the tossed caps and the rain; each carries on after it, late by its length', () => {
  let { g, s } = morelMove(0, 0, arena(3), 1), b = s.boss, [p] = dancers(s); advance(g, .5);
  let kit = s.kitAge, close = s.timers.find(t => t.act === 'close').at, offset = [p.x - b.x, p.y - b.y];
  g.lullaby = 1; advance(g, 1); assert(Math.abs(s.kitAge - kit) < 1e-9, 'the kit clock stopped');
  assert(Math.abs(p.x - b.x - offset[0]) < 1e-9 && Math.abs(p.y - b.y - offset[1]) < 1e-9, 'the partner waits mid-step');
  let at = null; for (let n = 0; n < 120 * 9 && at == null; n++) { g.step(1 / 120); if (p.closed) at = s.kitAge; }
  assert(at != null && Math.abs(at - close) < .01, 'it went home on the kit clock, a second late');
  ({ g, s } = morelMove(1, 2)); advance(g, .3); const lobs = JSON.stringify(s.lobs); kit = s.kitAge;
  g.lullaby = 1; advance(g, 1); assert.equal(JSON.stringify(s.lobs), lobs, 'the caps hang in the air'); assert(!acts(g.drainEvents(), 'land').length);
  advance(g, .7); assert(acts(g.drainEvents(), 'land').length === 1, 'they land .6 s of kit clock later');
  ({ g, s } = morelMove(2, 0)); advance(g, .5); g.drainEvents(); const made = s.ink.made.join();
  g.lullaby = 1; advance(g, 1); assert.equal(s.ink.made.join(), made, 'no drop falls through a Lullaby'); assert(!foeEvents(g.drainEvents(), 'inkcap:drip').length);
});
test('Mother Morel: beaten mid-dance, mid-toss and mid-rain, she leaves no partner, lob, timer or raised line behind', () => {
  const { g, s } = morelMove(2, 2); advance(g, 2.4); morelMove(2, 0, g); morelMove(1, 2, g);
  assert(s.lobs.length && s.timers.length && s.ink && dancers(s).some(p => p.inert));
  for (let n = 0; n < 300 && !s.boss.bloomed; n++) g.strike(s.boss, true);
  assert(s.boss.bloomed); assert.equal(s.timers.length + s.lobs.length + s.partners.length, 0); assert.equal(s.ink, null);
  assert(s.parts.every(p => p.bloomed)); assert(!g.buds.some(p => p.bossPart && p.inert && !p.bloomed));
  assert.equal(g.dangerY, 448); assert.equal(g.aimNapUntil, 0);
  g.drainEvents(); advance(g, 4); const after = g.drainEvents();
  assert(!acts(after, 'land').length && !acts(after, 'paint').length && !foeEvents(after, 'inkcap:drip').length);
});
test('Mother Morel: her moods, partners, paint, tosses and ink rain draw balanced, finite and with no per-frame gradients', () => {
  const { Art, looks, brush, totals } = sunnyArt(), drawn = new Set();
  for (const hook of ['face', 'part', 'under', 'over']) {
    const own = looks.puff[hook];
    looks.puff[hook] = (ctx, state, s, piece, ...rest) => { const done = own(ctx, state, s, piece, ...rest); if (done !== false) drawn.add(hook === 'part' ? piece.bossPart : hook); return done; };
  }
  const snap = (label, state) => {
    for (const reducedMotion of [false, true]) for (const quality of reducedMotion ? [0] : [0, 2]) {
      const options = { theme: 'meadow', reducedMotion, showAim: true, quality };
      Art.draw(brush().ctx, state, state.time, options);
      const warm = totals.gradients, rec = brush(); Art.draw(rec.ctx, state, state.time + .05, options);
      assert(rec.balanced(), `${label}: balanced`); const kitGradients = totals.gradients - warm;
      const look = looks.puff; delete looks.puff; const bare = totals.gradients; Art.draw(brush().ctx, state, state.time + .05, options); looks.puff = look;
      assert.equal(kitGradients, totals.gradients - bare, `${label}: the kit adds no per-frame gradient`);
    }
  };
  const tell = (tier, cycle, action) => { const g = arena(3), s = g.bossState; Object.assign(s, { tier, cycle, next: s.age }); if (action != null) s.action = action; for (let n = 0; n < 80; n++) g.step(1 / 120); assert(s.warning); return g; };
  // Every face: each mood (and blinking), the bonnet, a hit, and the shiver near the end.
  for (const [tier, mode] of [[0, 'open'], [1, 'open'], [2, 'open'], [1, 'bonnet']]) { const h = arena(3); Object.assign(h.bossState, { tier, mode }); snap(`${tier}:${mode}`, h); h.time = 1.2; snap(`${tier}:${mode} blink`, h); }
  let h = arena(3); h.bossState.boss.hp = 4; h.bossState.boss.hitAt = h.time; snap('hurt, shivering', h);
  // The waltz: its tell, the dance, a pop, a partner going home.
  snap('waltz tell', tell(0, 0, 1));
  let { g, s } = morelMove(0, 0, arena(3), 1); advance(g, .1); snap('waltz pop-in', g); advance(g, 1.2); snap('waltz', g);
  hit(g, dancers(s)[0]); advance(g, .15); snap('waltz pop', g);
  ({ g, s } = morelMove(0, 0, arena(3), 1)); advance(g, 8.1); snap('waltz home', g);
  // The painted waltz: its tell, the wipe, the poof and the twinkle, a sneeze.
  snap('fibwaltz tell', tell(2, 2));
  ({ g, s } = morelMove(2, 2)); advance(g, 1.6); snap('wipe', g); advance(g, .75); snap('poof', g); advance(g, .5); snap('painted', g);
  hit(g, dancers(s).find(p => p.bossPart === 'fibwaltz')); advance(g, .15); snap('sneeze', g);
  // The fakeout: its tell, the caps in the air, landed.
  snap('fakeout tell', tell(1, 2)); ({ g, s } = morelMove(1, 2)); advance(g, .4); snap('toss', g); advance(g, .6); snap('landed', g);
  // The rain: its tell, a bead swelling, a drop letting go, the clouds thinning away.
  snap('ink tell', tell(2, 0)); ({ g, s } = morelMove(2, 0)); advance(g, .6); snap('bead', g); advance(g, .22); snap('plip', g); advance(g, 3.4); snap('thinning', g);
  for (const hook of ['face', 'waltz', 'fibwaltz', 'under', 'over']) assert(drawn.has(hook), hook);
});

// ── Crystal Heart (Level 4, `crystal`) ──

// ── Lantern Lily (Level 5, `lotus`) ──

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'kits-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
