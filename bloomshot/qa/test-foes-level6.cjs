'use strict';
// Level 6's new piece: the Amberkeeper (and the amber beads he makes), plus the earlier foes Level 6 mixes in. Checked
// the way Level 2's are: where the level places it, what a credited seed, a chain, a power and an uncredited strike do,
// that it plays the same at 30, 60 and 144 FPS, that a Lullaby holds it, that it never costs a life it should not, and
// what the practice bot thinks of it.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const bot = require('./depths-bot.cjs');
const { advance, strikeOut, foesOf, Foes, Depths, RushGame } = require('./foe-harness.cjs');
const results = []; let serial = 0;
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
function touch(game, bud, nx = 0, ny = 1, extra = {}) {
  game.striker = { id: 'seed' + ++serial, bossContact: { nx, ny }, touches: 0, streak: 0, walls: 0, bounces: 0, age: 0, gateAt: -100, petalAt: -100, ...extra };
  game.strike(bud); const seed = game.striker; game.striker = null; return seed;
}
function level(id, wave) {
  const game = new RushGame({ plan: { id, name: 'Test', waves: 1, wave: () => Depths.wave(id, wave) }, startWave: 1 });
  game.started = true; game.drainEvents(); return game;
}
const foeKinds = events => events.filter(e => e.type === 'foe').map(e => e.kind);
function toClock(game, clock, events = []) { for (let n = 0; n < 12000 && game.foeClock < clock - 1e-9; n++) { game.step(1 / 120); events.push(...game.drainEvents()); } return events; }
const { AMBER } = Foes.FOES.amberkeeper, beads = game => game.buds.filter(b => b.foe === 'amber' && !b.bloomed);

// ── Amberkeeper (Level 6, `amberkeeper`) ──
test('Amberkeepers debut in Level 6 wave 2 with their hint, and come back in L6 W5, W8 and W9', () => {
  const w = Depths.wave(6, 2), keepers = w.buds.filter(b => b.foe === 'amberkeeper');
  assert.equal(w.hint, 'Amber seals buds! Break the trilobite to free them.'); assert(w.hint.length <= 52);
  assert.equal(Foes.hint('amberkeeper'), w.hint); assert.equal(Foes.hint('amber'), w.hint, 'a bead teaches the keeper hint');
  assert.deepEqual(keepers.map(b => [b.id, b.group, b.x, b.y, b.r, b.hp, b.type, Boolean(b.inert), Boolean(b.decoy)]), [['d6-2-foe0', 'd6-2-foe0', 210, 200, 13, 2, 'gold', false, false]]);
  for (const [n, x, y] of [[5, 160, 172], [8, 150, 250], [9, 150, 200]]) assert.deepEqual(Depths.wave(6, n).buds.filter(b => b.foe === 'amberkeeper').map(b => [b.x, b.y]), [[x, y]], `L6 W${n}`);
  for (const n of [1, 3, 10]) assert(!Depths.wave(6, n).buds.some(b => b.foe), `no foes in L6 W${n}`);
  assert.deepEqual(Object.fromEntries(['r', 'hp', 'type', 'family'].map(k => [k, Foes.FOES.amber[k]])), { r: 15, hp: 1, type: 'gold', family: 'amberkeeper' });
  assert(Foes.FOES.amber.inert && !Foes.FOES.amber.decoy);
});
test('He rears up at foe time 1.6 with threads to the two nearest buds on his row or above, seals them at 2.9, and adds a third at 9.4', () => {
  const game = level(6, 2), keeper = foesOf(game, 'amberkeeper')[0];
  let events = toClock(game, 1.59); assert.deepEqual(foeKinds(events), [], 'nothing before 1.6 s');
  events = toClock(game, 1.61); const tell = events.find(e => e.kind === 'amberkeeper:tell');
  assert(tell, 'the tell'); assert.deepEqual(tell.targets.map(t => t.id), ['d6-2-2-1', 'd6-2-2-2']);
  assert.deepEqual(Foes.FOES.amberkeeper.amberPlan(game, keeper), { at: 1.6 + 1.3, from: 1.6, ids: ['d6-2-2-1', 'd6-2-2-2'] });
  events = toClock(game, 2.89); assert(!beads(game).length, 'still open at 2.89 s');
  events = toClock(game, 2.91); assert.deepEqual(foeKinds(events), ['amberkeeper:seal']);
  const made = beads(game);
  assert.deepEqual(made.map(b => [b.id, b.host, b.keeper, b.r, Boolean(b.inert)]), [['d6-2-foe0-amber0-0', 'd6-2-2-1', 'd6-2-foe0', 15, true], ['d6-2-foe0-amber0-1', 'd6-2-2-2', 'd6-2-foe0', 15, true]]);
  for (const b of made) { const host = game.buds.find(h => h.id === b.host); assert.deepEqual([b.x, b.y, host.amberBy], [host.x, host.y, keeper.id]); }
  events = toClock(game, 8.09); assert(!events.some(e => e.kind === 'amberkeeper:tell'), 'the next tell waits 5.2 s');
  events = toClock(game, 8.11); const again = events.find(e => e.kind === 'amberkeeper:tell');
  assert(again && again.targets.length === 1, 'one more, up to three');
  toClock(game, 9.41); assert.equal(beads(game).length, 3);
  toClock(game, 12); assert.equal(beads(game).length, 3, 'never more than three (the next tell at 14.6 s finds no room)');
});
test('A seed clinks off a bead (a glance refund, the bud stays sealed); a crown chain still blooms the bud and its bead melts', () => {
  const game = level(6, 2); toClock(game, 2.91); game.drainEvents();
  const bead = beads(game)[0], host = game.buds.find(b => b.id === bead.host);
  game.pod = 1; const grow = game.podGrow; touch(game, bead, 0, 1, { age: .5 });
  assert(!bead.bloomed && !host.bloomed); assert.deepEqual(foeKinds(game.drainEvents()), ['amber:clink']);
  assert(game.podGrow > grow, 'a glance refund');
  const crown = game.buds.find(b => b.group === host.group && b.relay); touch(game, crown); advance(game, .4, 120);
  assert(host.bloomed && bead.bloomed && bead.popped, 'the crown chain bloomed the sealed bud');
  assert(foeKinds(game.drainEvents()).includes('amber:melt')); assert.equal(host.amberBy, null);
});
test('A Bee Line, a Sunburst or a Dandelion seed cracks a bead; an uncredited strike pops it quietly', () => {
  for (const power of ['beeline', 'dandelion']) {
    const game = level(6, 2); toClock(game, 2.91); game.drainEvents(); const bead = beads(game)[0];
    game.powerPart = power === 'beeline'; touch(game, bead, 0, 1, { power }); game.powerPart = false;
    assert(bead.popped); assert.deepEqual(foeKinds(game.drainEvents()), ['amber:crack'], power);
  }
  const game = level(6, 2); toClock(game, 2.91); game.drainEvents(); const bead = beads(game)[1];
  assert.equal(strikeOut(game, bead), 1); assert(bead.popped && !game.buds.includes(bead)); assert.deepEqual(foeKinds(game.drainEvents()), ['amber:pop']);
});
test('A real seed fired at a bead bounces off it in the ball loop; a real Sunburst cracks the bead and blooms the bud inside', () => {
  for (const power of [null, 'sunburst']) {
    const game = level(6, 2); toClock(game, 2.91); game.drainEvents(); game.descentSpeed = 0;
    const bead = beads(game)[0], host = game.buds.find(b => b.id === bead.host);
    game.buds = game.buds.filter(b => b === bead || b === host || b.foe === 'amberkeeper');
    game.spawnBall({ x: bead.x, y: bead.y + 36, angle: -Math.PI / 2 }); const ball = game.balls[game.balls.length - 1]; if (power) ball.power = power;
    const events = []; let vy = null;
    for (let n = 0; n < 60; n++) { game.step(1 / 120); const now = game.drainEvents(); events.push(...now); if (vy == null && foeKinds(now).includes('amber:clink')) vy = ball.vy; }
    if (!power) { assert(!host.bloomed && !bead.bloomed && vy > 0, 'it clinked and bounced back down'); }
    else { assert(bead.popped && foeKinds(events).includes('amber:crack')); assert(host.bloomed, 'the burst bloomed the bud inside'); }
  }
});
test('Breaking him (two touches) shatters every bead at once and pays one sun charge; an uncredited strike-out frees them too, unpaid', () => {
  let game = level(6, 2), keeper = foesOf(game, 'amberkeeper')[0]; toClock(game, 2.91); game.drainEvents();
  touch(game, keeper); assert.equal(keeper.hp, 1); assert.equal(beads(game).length, 2, 'a crack holds');
  const sun = game.sunCharge; touch(game, keeper); const kinds = foeKinds(game.drainEvents());
  assert(keeper.bloomed && !beads(game).length); assert.deepEqual(kinds.filter(k => k === 'amber:shatter').length, 2); assert(kinds.includes('amberkeeper:break'));
  assert(game.sunCharge >= sun + 1, 'a credited break pays a sun charge');
  game = level(6, 2); keeper = foesOf(game, 'amberkeeper')[0]; toClock(game, 2.91);
  const charge = game.sunCharge; assert.equal(strikeOut(game, keeper), 2); assert(!beads(game).length && game.sunCharge === charge);
});
test('A credited crack mid-tell makes him flinch: no seal, and the next tell waits 2.6 s', () => {
  const game = level(6, 2), keeper = foesOf(game, 'amberkeeper')[0]; toClock(game, 2); game.drainEvents();
  touch(game, keeper); assert.deepEqual(foeKinds(game.drainEvents()), ['amberkeeper:flinch']);
  toClock(game, 3); assert(!beads(game).length, 'no seal');
  assert(Math.abs(keeper.amber.nextAt - (2 + 2.6)) < 1 / 60);
});
test('A Lullaby holds his tell; he seals once it is over. He plays the same at 30, 60 and 144 FPS', () => {
  const game = level(6, 2); toClock(game, 2); game.lullaby = 1.5; advance(game, 1.5, 120);
  assert(!beads(game).length && Math.abs(game.foeClock - 2) < 1e-6, 'frozen'); advance(game, 1.1, 120); assert.equal(beads(game).length, 2);
  const runs = [30, 60, 144].map(fps => {
    const g = level(6, 2), log = [];
    for (let f = 0; f < 10 * fps; f++) { g.step(1 / fps); for (const e of g.drainEvents()) if (e.type === 'foe') log.push(`${e.kind}:${e.x.toFixed(3)}:${e.y.toFixed(3)}`); }
    return { log: log.join(' '), beads: beads(g).map(b => `${b.id}@${b.x.toFixed(4)},${b.y.toFixed(4)}`) };
  });
  assert(runs[0].log.includes('amberkeeper:seal')); assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});
test('A bead melts when its bud sinks to 410 or its keeper leaves the board; beads never cost a life; he does', () => {
  let game = level(6, 2); toClock(game, 2.91); game.descentSpeed = 0; const bead = beads(game)[0], host = game.buds.find(b => b.id === bead.host);
  host.y = 410 - host.r - .01; game.step(1 / 120); assert(!bead.bloomed); host.y = 410 - host.r + .5; game.step(1 / 120); assert(bead.popped && host.amberBy === null);
  game = level(6, 2); toClock(game, 2.91); const keeper = foesOf(game, 'amberkeeper')[0], lives = game.lives;
  keeper.y = game.dangerY - keeper.r + 1; game.step(1 / 120); assert.equal(game.lives, lives - 1); game.step(1 / 120);
  assert(!beads(game).length, 'his beads melt with him');
});
test('The bot: a keeper is worth 14 + 16 a bead or thread, a bead is never worth a seed, and a shot landing on a bud after its seal is wasted', () => {
  const game = level(6, 2), keeper = foesOf(game, 'amberkeeper')[0];
  assert.equal(Foes.value(game, { bud: keeper, nx: 0, ny: 1 }), 14); toClock(game, 1.7);
  assert.equal(Foes.value(game, { bud: keeper, nx: 0, ny: 1 }), 14 + 32, 'two threads');
  const aim = game.buds.find(b => b.id === 'd6-2-2-1');
  assert.equal(Foes.value(game, { bud: aim, nx: 0, ny: 1, time: .5 }), 0, 'lands before the seal');
  assert.equal(Foes.value(game, { bud: aim, nx: 0, ny: 1, time: 1.3 }), -200, 'lands after the seal');
  toClock(game, 2.91); assert.equal(Foes.value(game, { bud: beads(game)[0], nx: 0, ny: 1 }), -1);
  assert.equal(bot.value(game, { bud: { ...beads(game)[0] }, nx: 0, ny: 1, time: .3 }, .1, bot.prepareTrace(game)), -1);
  assert.deepEqual(Foes.moves(game), [], 'nothing to forecast: he and his beads ride the board');
  const run = bot.play(6, { seed: 7, startWave: 2 }); assert(run.won, 'the practice bot clears Level 6 from wave 2');
});
test("Level 6 mixes in Rolypoly (W4, W8), Peekaboo Mole (W7) and Echo Bat (W6, W9)", () => {
  const rows = n => Depths.wave(6, n).buds.filter(b => b.foe).map(b => [b.foe, b.x, b.y]);
  assert.deepEqual(rows(4), [['rolypoly', 210, 150]]);
  assert.deepEqual(rows(6), [['bat', 150, 158], ['bat', 270, 158]]);
  assert.deepEqual(rows(7), [['molehill', 176, 268], ['molehill', 210, 268], ['molehill', 244, 268], ['mole', 210, 242]]);
  assert.deepEqual(rows(8), [['amberkeeper', 150, 250], ['rolypoly', 270, 262]]);
  assert.deepEqual(rows(9), [['amberkeeper', 150, 200], ['bat', 330, 140]]);
});

test('A rolling rolypoly rolls through the amber: it bowls the sealed bud inside (not the bead), the bud blooms by the roll and the bead melts', () => {
  const game = level(6, 2); toClock(game, 2.91); game.descentSpeed = 0; game.drainEvents();
  const bead = beads(game)[0], host = game.buds.find(b => b.id === bead.host), keeper = foesOf(game, 'amberkeeper')[0];
  const [roly] = Foes.make('rolypoly', ['rolypoly', host.x, host.y + 40, {}], 'roll-test', 0, 6, 2);
  game.buds = game.buds.filter(b => b === bead || b === host || b === keeper); Foes.place(game, roly);
  touch(game, roly, 0, 1); const events = toClock(game, game.foeClock + 2);
  const bowls = events.filter(e => e.kind === 'rolypoly:bowl'), bloom = events.find(e => e.type === 'bloom' && e.bud === host);
  assert(bowls.length && bowls[0].target === host && !bowls.some(e => e.target === bead), 'the roll meets the bud, not its bead');
  assert(host.bloomed && bloom && bloom.via === 'roll', 'the roll blooms the sealed bud');
  assert(bead.popped && foeKinds(events).indexOf('amber:melt') > foeKinds(events).indexOf('rolypoly:bowl'), 'then the bead melts');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'foes-level6-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
