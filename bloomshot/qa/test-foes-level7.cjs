'use strict';
// Level 7's new piece: the Whizzbang. Where the level places it, what a credited touch, a chain and an uncredited strike
// do to it, that its rocket plays the same at 30, 60 and 144 FPS, that it never costs a life it should not, what the
// practice bot thinks of it, and that its forecast (the aim line and the bot) agrees with the real flight.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Bosses = require('../bosses.js'), bot = require('./depths-bot.cjs');
const { sandbox, advance, strikeOut, foesOf, Foes, Depths, RushGame } = require('./foe-harness.cjs');
const results = []; let serial = 0;
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
// A credited seed touching `bud` with contact normal (nx, ny) (pointing from the piece toward the seed), resolved the
// way the ball loop resolves a touch.
function touch(game, bud, nx = 0, ny = 1, extra = {}) {
  game.striker = { id: 'seed' + ++serial, bossContact: { nx, ny }, touches: 0, streak: 0, walls: 0, bounces: 0, age: 0, gateAt: -100, petalAt: -100, ...extra };
  game.strike(bud); const seed = game.striker; game.striker = null; return seed;
}
const foeKinds = events => events.filter(e => e.type === 'foe').map(e => e.kind);
const W = Foes.FOES.whizzbang;
const plain = (id, x, y, extra = {}) => ({ id, group: id, x, y, baseX: x, startY: y, r: 11, type: 'gold', relay: false, hp: 1, maxHp: 1, fall: 1, sway: 0, swayW: 0, swayPhase: 0, hitAt: -100, bloomed: false, bloomAt: -100, ...extra });
// A still board: a whizzbang at (210, 270) under five pieces (a 3-HP bud, a cupped bud, two plain buds and a top bud),
// with a side bud near the top.
function stack(sway = 0, foes = []) {
  const g = sandbox(7, 5, [['whizzbang', 210, 270, { sway }], ...foes], { keepBuds: false });
  g.descentSpeed = 0; g.drainEvents();
  for (const [i, y] of [200, 170, 140, 110, 80].entries()) g.buds.push(plain('p' + i, 210, y, { hp: i === 0 ? 3 : 1, maxHp: i === 0 ? 3 : 1, shield: i === 1 }));
  g.buds.push(plain('side', 240, 62, { type: 'sky' }));
  return g;
}
// Ember Rose's arena (as test-kits.cjs): the guardian alone, still and not falling.
function arena() {
  const game = new RushGame({ plan: bot.plan(7), startWave: 10 });
  game.started = true; game.status = 'flying'; game.descentSpeed = 0; game.drops = [];
  game.buds = game.buds.filter(b => b.boss || b.bossPart); game.bossState.boss.bossFall = 0; game.drainEvents(); return game;
}
function run(game, seconds, fps = 120) { const events = []; for (let n = 0; n < Math.round(seconds * fps); n++) { game.step(1 / fps); events.push(...game.drainEvents()); } return events; }

// ── Whizzbang (Level 7, `whizzbang`) ──
test('The Whizzbang debuts in Level 7 wave 5 with its hint, two opening and one in the t12 drop, and comes back in W6, W8 and W9', () => {
  const w = Depths.wave(7, 5), open = w.buds.filter(b => b.foe === 'whizzbang');
  assert.equal(open.length, 2); assert.equal(w.drops[1].buds.filter(b => b.foe === 'whizzbang').length, 1, 'one in the t12 drop');
  assert.equal(w.hint, Foes.hint('whizzbang')); assert.equal(w.hint, 'Light a whizzbang under a crowd. Whoosh, bang!'); assert(w.hint.length <= 52);
  for (const b of open) { assert.equal(b.r, 12); assert.equal(b.type, 'poppy'); assert.equal(b.hp, 1); assert(!b.inert && !b.decoy); assert.equal(b.id, b.group); assert.equal(b.whizz, null); }
  for (const n of [6, 8, 9]) assert.equal(Depths.wave(7, n).buds.filter(b => b.foe === 'whizzbang').length, 1, `W${n}`);
  for (const n of [1, 2, 3, 4, 7, 10]) assert(![...Depths.wave(7, n).buds, ...(Depths.wave(7, n).drops || []).flatMap(d => d.buds)].some(b => b.foe === 'whizzbang'), `none in W${n}`);
});
test('A credited touch lights it; a second later the rocket pins the four nearest in its column whole and bangs at the top', () => {
  const g = stack(), [wz] = foesOf(g, 'whizzbang');
  const seed = touch(g, wz);
  assert(wz.whizz && wz.ghost && !wz.bloomed, 'lit: a ghost, not bloomed'); assert.deepEqual(foeKinds(g.drainEvents()), ['whizzbang:light']);
  advance(g, .99, 120); assert.equal(wz.whizz.mode, 'lit', 'the fuse is a second long');
  const events = run(g, 1), kinds = foeKinds(events);
  assert.equal(kinds[0], 'whizzbang:launch'); assert.equal(kinds.filter(k => k === 'whizzbang:pin').length, 4); assert(kinds.includes('whizzbang:bang'));
  assert(kinds.indexOf('whizzbang:bang') > kinds.lastIndexOf('whizzbang:pin'), 'it bangs after the last pin');
  assert(['p0', 'p1', 'p2', 'p3'].every(id => g.buds.find(b => b.id === id).bloomed), 'the four nearest bloom whole, the 3-HP and the cupped bud too');
  assert(g.buds.find(b => b.id === 'p4').bloomed, 'the bang takes the top bud');
  assert(wz.bloomed && !wz.ghost, 'the rocket itself blooms where it burst');
  assert(events.filter(e => e.type === 'bloom').every(e => e.seed === seed.id), 'every bloom is credited to the seed that lit it');
});
test('A bud right under the bang blooms even when the column held more than four', () => {
  const g = stack(); g.buds.push(plain('extra', 210, 65)); const [wz] = foesOf(g, 'whizzbang');
  const forecast = W.plan(g, wz, 1, null); touch(g, wz); run(g, 2.2);
  assert.equal(wz.whizz.path.pins.length, 4);
  for (const id of forecast.bangs) assert(g.buds.find(b => b.id === id).bloomed, `the forecast bang ${id} bloomed`);
  assert(g.buds.find(b => b.id === 'p4').bloomed && g.buds.find(b => b.id === 'extra').bloomed, 'the buds past the four pins, under the bang, bloom');
});
test('The rocket plays the same at 30, 60 and 144 FPS (swaying)', () => {
  const runs = [30, 60, 144].map(fps => {
    const g = stack(28), [wz] = foesOf(g, 'whizzbang'); advance(g, .5, fps); touch(g, wz);
    const log = [];
    for (let n = 0; n < Math.round(2.5 * fps); n++) { g.step(1 / fps); for (const e of g.drainEvents()) if (e.type === 'foe' || e.type === 'bloom') log.push(`${e.kind || e.bud.id}:${(e.x ?? e.bud.x).toFixed(3)},${(e.y ?? e.bud.y).toFixed(3)}`); }
    return log.join(' ');
  });
  assert(runs[0].includes('whizzbang:bang')); assert.equal(runs[1], runs[0]); assert.equal(runs[2], runs[0]);
});
test('An uncredited strike, a power and a sun link bloom it plainly, with no rocket', () => {
  let g = stack(), [wz] = foesOf(g, 'whizzbang');
  assert.equal(strikeOut(g, wz), 1); assert(!wz.whizz);
  g = stack(); [wz] = foesOf(g, 'whizzbang'); touch(g, wz, 0, 1, { power: 'dandelion' }); assert(wz.bloomed && !wz.whizz, 'a Dandelion');
  g = stack(); [wz] = foesOf(g, 'whizzbang'); g.pending.push(g._linkBy(wz.id, g.time, { x: 0, y: 0 }, 'sun', 'seedS')); g.step(1 / 120);
  assert(wz.bloomed && !wz.whizz, 'a sun link'); assert(!foeKinds(run(g, 2)).includes('whizzbang:launch'));
});
test('A credited chain lights it on a half-second fuse, and a lit one turns every later chain away', () => {
  const g = stack(), [wz] = foesOf(g, 'whizzbang');
  g.pending.push(g._linkBy(wz.id, g.time, { x: 0, y: 0 }, 'puff', 'seedX')); g.step(1 / 120);
  assert(wz.whizz && wz.whizz.fuse === .5 && wz.whizz.by === 'seedX' && wz.whizz.chain);
  g.pending.push(g._linkBy(wz.id, g.time, { x: 0, y: 0 }, 'puff', 'seedY')); g.step(1 / 120);
  assert(!wz.bloomed && wz.whizz.by === 'seedX', 'turned away: it never lights twice');
  advance(g, .5, 120); assert.equal(wz.whizz.mode, 'fly');
});
test('A rocket that pins an unlit whizzbang lights it on a half-second fuse', () => {
  const g = sandbox(7, 5, [['whizzbang', 210, 280, { sway: 0 }], ['whizzbang', 210, 200, { sway: 0 }]], { keepBuds: false }); g.descentSpeed = 0; g.drainEvents();
  const [low, high] = foesOf(g, 'whizzbang').sort((a, b) => b.y - a.y);
  touch(g, low); advance(g, 1.2, 120);
  assert(high.whizz && high.whizz.fuse === .5 && high.whizz.chain, 'the pinned one caught on a .5 s fuse');
  assert.equal(high.whizz.by, low.whizz.by, 'credited to the same seed');
  const events = run(g, 1.2); assert(foeKinds(events).includes('whizzbang:launch')); assert(high.bloomed);
});
test('A Lullaby holds the fuse; lit or flying never costs a life, unlit costs one', () => {
  const g = stack(), [wz] = foesOf(g, 'whizzbang');
  assert.equal(Foes.breach(g, wz), 'life', 'an unlit whizzbang is a life');
  touch(g, wz); advance(g, .5, 120); g.lullaby = 3; advance(g, 2, 120); assert.equal(wz.whizz.mode, 'lit', 'the fuse waits out the Lullaby');
  assert.equal(Foes.breach(g, wz), 'skip');
  g.lullaby = 0; advance(g, .6, 120); assert.equal(wz.whizz.mode, 'fly'); assert.equal(Foes.breach(g, wz), 'skip');
});
test('The bot: the forecast pins what the rocket pins, an unlit one is worth its column, a lit one is a ghost worth nothing', () => {
  const g = stack(), [wz] = foesOf(g, 'whizzbang');
  const plan = W.plan(g, wz, 1, null); assert.equal(plan.pins.length, 4);
  const v = Foes.value(g, { bud: { ...wz }, nx: 0, ny: 1, time: 0 }, null); assert(v >= 4 + 8 * 4, 'value ' + v);
  touch(g, wz); const out = {}; Foes.predict(g, wz, .5, out); assert(out.flags & 2, 'a lit one is a ghost to the bot');
  assert.equal(Foes.value(g, { bud: wz, nx: 0, ny: 1, time: 0 }, null), 0);
  advance(g, 1.01, 120); assert.deepEqual(wz.whizz.path.pins.map(p => p.id), plan.pins.map(p => p.id), 'game and forecast agree');
});
test('A rocket that meets a tunnel mouth comes out of the other and flies on; a downward exit stops at the floor', () => {
  const g = sandbox(7, 5, [['whizzbang', 150, 280, { sway: 0 }]], { keepBuds: false }); g.descentSpeed = 0;
  const mouthA = { id: 'a', pair: 'b', x: 150, y: 200, r: 17, angle: Math.atan2(200 - 498, 150 - 210), lastUsed: -100 };
  g.gates = [mouthA, { id: 'b', pair: 'a', x: 300, y: 120, r: 17, angle: -Math.PI / 2, lastUsed: -100 }];
  const up = W.path(g, 150, 280, {}); assert.equal(up.gate, 'a'); assert(up.end.y < 120, 'it flew up out of the exit'); assert(up.hop > 0);
  g.gates = [mouthA, { id: 'b', pair: 'a', x: 300, y: 380, r: 17, angle: Math.PI / 2, lastUsed: -100 }];
  const down = W.path(g, 150, 280, {}); assert.equal(down.gate, 'a'); assert(down.end.y <= 430, `the floor stops it (${down.end.y})`);
});
test('A rocket lit under Ember Rose deals 3, even at tier 0', () => {
  const g = arena(), s = g.bossState, b = s.boss; assert.equal(s.tier, 0);
  const [wz] = Foes.make('whizzbang', ['whizzbang', b.x, Math.min(b.y + 110, 288), { sway: 0 }], 'qa', 0, null, null); Foes.place(g, wz);
  s.stunUntil = s.age + 3; s.next = s.age + 9; const hp = b.hp;
  touch(g, wz); const events = run(g, 1.6);
  assert(events.some(e => e.type === 'bossCritical' && e.via === 'whizz' && e.damage === 3), 'a Whizz-bang! crit');
  assert(b.hp <= hp - 3, `hp ${hp} -> ${b.hp}`);
});
test('The bloomed flower stays where the rocket burst', () => {
  const g = stack(28), [wz] = foesOf(g, 'whizzbang'); advance(g, .4, 120); touch(g, wz);
  for (let n = 0; n < 400 && !wz.bloomed; n++) g.step(1 / 120);
  assert(wz.bloomed); const x = wz.x, y = wz.y;
  for (let n = 0; n < 60; n++) { g.step(1 / 120); assert.equal(wz.x, x, 'no sway after the bloom'); }
  assert.equal(wz.y, y);
});
test("The aim forecast meets a moving guardian: it says she is hit exactly when the real rocket links her", () => {
  const trio = () => {
    const g = arena(), s = g.bossState, b = s.boss; b.hp = 30; s.tier = 2; s.shiftPending = false;
    s.cycle = Bosses.kits.ember.moves[2].indexOf('barrage'); s.next = s.age; advance(g, .02, 120); advance(g, 1.4, 120);
    return g;
  };
  const verdicts = [];
  for (let i = 0; i < 3; i++) for (const wait of [0, .7, 1.9]) {
    const g = trio(); advance(g, wait, 120); const wz = foesOf(g, 'whizzbang')[i]; if (!wz) continue;
    const said = W.plan(g, wz, 1.2, null, Bosses.predictVisible(g, 1.2)).boss;
    advance(g, .2, 120); touch(g, wz);
    for (let n = 0; n < 360 && !(wz.whizz && wz.whizz.mode === 'bang'); n++) g.step(1 / 120);
    assert.equal(Boolean(said), Boolean(wz.whizz.path.boss), `whizzbang ${i} after ${wait} s`); verdicts.push(Boolean(said));
  }
  assert(verdicts.length >= 6 && verdicts.includes(true), 'some rockets meet her');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'foes-level7-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
