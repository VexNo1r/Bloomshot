'use strict';
// Level 4's new pieces: the Chroma Crystal and the Echo Bat (spec T10). Each is checked the same way: where the level
// places it, what a credited seed, a chain and an uncredited strike do to it, that it plays the same at 30, 60 and
// 144 FPS, that it never costs a life it should not, what the practice bot thinks of it, and that its art stays cheap.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const bot = require('./depths-bot.cjs');
const { sandbox, advance, strikeOut, shoot, foesOf, Foes, Depths, RushGame } = require('./foe-harness.cjs');
const results = []; let serial = 0;
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
// A credited seed touching `bud` with contact normal (nx, ny) (pointing from the piece toward the seed), resolved the
// way the ball loop resolves a touch: guard() first (a glance), then the strike.
function touch(game, bud, nx = 0, ny = 1, extra = {}) {
  game.striker = { id: 'seed' + ++serial, type: game.nextType, bossContact: { nx, ny }, touches: 0, streak: 0, walls: 0, bounces: 0, age: 0, gateAt: -100, petalAt: -100, ...extra };
  const seed = game.striker, glanced = Foes.guard(game, bud, { nx, ny }, seed);
  if (glanced) game.event('foe', { kind: bud.foe + ':guard', bud, x: bud.x, y: bud.y, color: bud.type });
  else game.strike(bud);
  game.striker = null; return { seed, glanced };
}
function level(id, wave) {
  const game = new RushGame({ plan: { id, name: 'Test', waves: 1, wave: () => Depths.wave(id, wave) }, startWave: 1 });
  game.started = true; game.drainEvents(); return game;
}
const foeKinds = events => events.filter(e => e.type === 'foe').map(e => e.kind);
const PALETTES = ['gold', 'coral', 'lilac', 'sky', 'poppy'];
// Loads the next seed of `type` into the launcher.
const load = (game, type) => { game.shotNumber = PALETTES.indexOf(type); assert.equal(game.nextType, type); return game; };
// Steps at 120 Hz until `until(game)` holds (or `limit` seconds pass); returns the events on the way.
function stepUntil(game, until, limit = 6) {
  const events = [];
  for (let t = 0; t < limit; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); if (until(game, events)) return events; }
  throw new Error('stepUntil: the condition never held');
}

// ── Chroma Crystal (Level 4, `chroma`) ──
test('Crystals debut in Level 4 wave 3 with their hint, one per color asked for, and come back in W5, W7 and W9', () => {
  const w = Depths.wave(4, 3), crystals = w.buds.filter(b => b.foe === 'chroma');
  assert.equal(w.hint, 'Crystals open only for a seed of their color.'); assert(w.hint.length <= 52);
  assert.deepEqual(crystals.map(b => [b.x, b.y, b.type]), [[110, 250, 'sky'], [210, 250, 'gold'], [310, 250, 'poppy']]);
  for (const b of crystals) { assert.equal(b.r, 12); assert.equal(b.hp, 1); assert(!b.inert && !b.decoy); assert.equal(b.id, b.group); }
  for (const [n, type] of [[5, 'lilac'], [7, 'coral'], [9, 'sky']]) assert.deepEqual(Depths.wave(4, n).buds.filter(b => b.foe === 'chroma').map(b => b.type), [type], `L4 W${n}`);
  assert.equal(Foes.hint('chroma'), w.hint);
  assert.deepEqual(Foes.make('chroma', ['chroma', 100, 200], 't', 0, 4, 1), [], 'a crystal needs its color');
  assert.deepEqual(Foes.make('chroma', ['chroma', 100, 200, { type: 'teal' }], 't', 0, 4, 1), [], 'and a real one');
});
test('The launcher and tray show the seed colors from Level 4 only, and typeAhead(0) is the seed in the launcher', () => {
  for (let id = 1; id <= 10; id++) {
    const game = new RushGame({ plan: { id, name: 'T', waves: 1, wave: () => Depths.wave(id, 2) }, startWave: 1 });
    assert.equal(game.colorAhead, id >= 4, `Level ${id}`);
    for (let shot = 0; shot < 11; shot++) {
      game.shotNumber = shot; assert.equal(game.typeAhead(0), game.nextType);
      assert.equal(game.typeAhead(2), PALETTES[(shot + 2) % 5]);
    }
  }
});
test('A seed of another color glances off with chroma:guard and no refund; the right color opens it', () => {
  let game = load(sandbox(4, 3, [['chroma', 210, 250, { type: 'sky' }]], { keepBuds: false }), 'gold');
  const crystal = foesOf(game, 'chroma')[0], charge = game.sunCharge;
  let events = shoot(game, 210, 250);
  const guard = events.find(e => e.kind === 'chroma:guard');
  assert(guard, 'the ball loop emits chroma:guard'); assert.equal(guard.type, 'foe', 'as a foe event'); assert.equal(guard.color, 'sky');
  assert(!crystal.bloomed && crystal.hp === 1, 'still closed'); assert(!events.some(e => e.type === 'bloom'));
  assert.equal(game.sunCharge, charge, 'no sun'); assert(!events.some(e => e.type === 'podRefund'), 'no refund to the pod');
  game = load(sandbox(4, 3, [['chroma', 210, 250, { type: 'sky' }]], { keepBuds: false }), 'sky');
  events = shoot(game, 210, 250);
  const opened = foesOf(game, 'chroma')[0];
  assert(opened.bloomed && opened.matched, 'the matching seed opens it');
  assert.deepEqual(foeKinds(events), ['chroma:match']); assert.equal(events.find(e => e.kind === 'chroma:match').color, 'sky');
});
test('A match pays exactly one sun charge above a plain credited bloom, and the same score', () => {
  const crystal = load(sandbox(4, 3, [['chroma', 210, 250, { type: 'coral' }]], { keepBuds: false }), 'coral');
  const plain = load(sandbox(4, 3, [], { keepBuds: false }), 'coral');
  plain.buds.push({ ...crystal.buds[0], foe: undefined, id: 'plain', group: 'plain', matched: undefined });
  touch(crystal, crystal.buds[0]); touch(plain, plain.buds[0]);
  assert(crystal.buds[0].bloomed && plain.buds[0].bloomed);
  assert(plain.sunCharge > 0, 'the plain bloom charges the sun');
  assert.equal(crystal.sunCharge - plain.sunCharge, 1); assert.equal(crystal.score, plain.score);
});
test('A chain, a power or an uncredited strike opens it plainly whatever the color; a script never meets a guard', () => {
  let game = load(sandbox(4, 3, [['chroma', 210, 250, { type: 'sky' }]], { keepBuds: false }), 'gold'), crystal = foesOf(game, 'chroma')[0];
  assert.equal(strikeOut(game, crystal), 1); assert(crystal.bloomed && !crystal.matched); assert.equal(game.sunCharge, 0);
  game = load(sandbox(4, 3, [['chroma', 210, 250, { type: 'sky' }]], { keepBuds: false }), 'gold'); crystal = foesOf(game, 'chroma')[0];
  game.due = { id: crystal.id, by: 'seed-x', via: 'puff', depth: 1 }; game.strike(crystal, true); game.due = null;
  assert(crystal.bloomed && !crystal.matched, 'a credited chain opens it, no match');
  game = load(sandbox(4, 3, [['chroma', 210, 250, { type: 'sky' }]], { keepBuds: false }), 'gold'); crystal = foesOf(game, 'chroma')[0];
  const { glanced } = touch(game, crystal, 0, 1, { power: 'beeline' });
  assert(!glanced && crystal.bloomed && !crystal.matched, 'a power seed opens it');
  game = load(sandbox(4, 3, [['chroma', 210, 250, { type: 'sky' }]], { keepBuds: false }), 'gold'); crystal = foesOf(game, 'chroma')[0];
  assert.equal(Foes.guard(game, crystal, { nx: 0, ny: 1 }, { type: 'gold' }), true);
  assert.equal(Foes.guard(game, crystal, { nx: 0, ny: 1 }, { type: 'sky' }), false);
  // A mismatched seed struck straight in (no flight, so no guard asked) is still turned away.
  game.striker = { id: 'raw', type: 'gold', bossContact: { nx: 0, ny: 1 }, touches: 0, streak: 0, walls: 0, bounces: 0, age: 0, gateAt: -100, petalAt: -100 };
  game.strike(crystal); game.striker = null; assert(!crystal.bloomed, 'blocked');
  game.scripted = true; assert.equal(Foes.guard(game, crystal, { nx: 0, ny: 1 }, { type: 'gold' }), false, 'the tutorial script is never guarded');
});
test('A crystal is a real piece: one reaching the line costs a life', () => {
  const game = load(sandbox(4, 3, [['chroma', 210, 250, { type: 'sky' }]], { keepBuds: false }), 'gold');
  assert.equal(Foes.breach(game, foesOf(game, 'chroma')[0]), 'life', 'a real piece: reaching the line costs a life');
});
test('The bot shoots a crystal only with its own color (+10, more as it nears the line), never with another (-1)', () => {
  const game = level(4, 3), [sky, gold] = foesOf(game, 'chroma');
  load(game, 'sky'); assert.equal(Foes.value(game, { bud: sky }), 10); assert.equal(Foes.value(game, { bud: gold }), -1);
  load(game, 'gold'); assert.equal(Foes.value(game, { bud: sky }), -1); assert.equal(Foes.value(game, { bud: gold }), 10);
  // Its color comes one seed in five, so a crystal a few seconds from the line is worth up to +70.
  const at = gold.y, worth = [];
  for (const y of [250, 300, 350, 400, 420]) { gold.y = y; worth.push(Foes.value(game, { bud: gold })); }
  gold.y = at;
  assert.deepEqual(worth, [...worth].sort((a, b) => a - b), `rising: ${worth}`); assert.equal(worth[0], 10); assert.equal(worth[4], 70);
  assert.equal(Foes.moves(game).length, 0, 'crystals are plain sitters');
  const run = bot.play(4, { seed: 7, startWave: 3, waves: 1 });
  assert(run && typeof run === 'object');
});
test('A crystal wave plays out the same at 30, 60 and 144 FPS', () => {
  const runs = [30, 60, 144].map(fps => {
    const game = level(4, 3), log = [];
    for (let frame = 0; frame < fps * 8; frame++) {
      if (frame % fps === 0) { const second = frame / fps, a = -Math.PI / 2 + (second % 5 - 2) * .22; game.fire(Math.cos(a), Math.sin(a)); }
      game.step(1 / fps);
      for (const e of game.drainEvents()) if (e.type === 'foe' || e.type === 'bloom') log.push(`${e.type}:${e.kind || e.bud.id}`);
    }
    return { log: log.join(' '), score: game.score, sun: game.sunCharge, buds: game.buds.map(b => `${b.id}:${b.bloomed}:${b.y.toFixed(4)}`).join(' ') };
  });
  assert(runs[0].log.includes('chroma:'), 'the replay meets a crystal');
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});

// ── Echo Bat (Level 4, `bat`) ──
const lone = (x = 110, y = 236, more = []) => sandbox(4, 4, [['bat', x, y], ...more], { keepBuds: false });
test('Bats debut in Level 4 wave 4 with their hint, and come back in W8 and W9', () => {
  const w = Depths.wave(4, 4), bats = w.buds.filter(b => b.foe === 'bat');
  assert.equal(w.hint, 'Bats swoop! Catch one mid-air for a bonus.'); assert(w.hint.length <= 52);
  assert.deepEqual(bats.map(b => [b.x, b.y]), [[110, 236], [310, 236]]);
  for (const b of bats) { assert.equal(b.r, 11); assert.equal(b.hp, 2); assert.equal(b.type, 'sky'); assert(!b.inert && !b.decoy); }
  assert.equal(Depths.wave(4, 8).buds.filter(b => b.foe === 'bat').length, 2, 'L4 W8');
  assert.equal(Depths.wave(4, 9).buds.filter(b => b.foe === 'bat').length, 1, 'L4 W9');
});
test('A bat perches 1.8 s (falling), tells for .8 s (still, arc drawn), swoops from 2.6 to 3.6 s and lands on its arc\'s end', () => {
  const game = lone(), bat = foesOf(game, 'bat')[0], born = bat.born, start = { x: bat.x, y: bat.y };
  assert(born <= 0 && born > -1.2, 'it arrives part way through its first perch');
  let events = stepUntil(game, () => bat.bat.mode === 'tell');
  const ping = events.find(e => e.kind === 'bat:ping');
  assert(ping && game.foeClock - born >= 1.8 - 1e-9 && game.foeClock - born < 1.8 + 1 / 120 + 1e-9, `tell at local ${game.foeClock - born}`);
  assert(bat.y > start.y, 'it fell with the wave while perched'); assert.equal(bat.x, start.x);
  assert.deepEqual([ping.x2, ping.y2], [bat.bat.x2, bat.bat.y2], 'the landing is chosen (and drawn) as the tell starts');
  assert.deepEqual([bat.bat.x2, bat.bat.y2], [310, Math.min(bat.y + 34, game.dangerY - 120)], 'across the board, 34 px lower');
  const hold = { x: bat.x, y: bat.y };
  events = stepUntil(game, () => { if (bat.bat.mode === 'tell') assert.deepEqual({ x: bat.x, y: bat.y }, hold, 'still during the tell (it owns its position)'); return bat.bat.mode === 'swoop'; });
  // Times land on the 120 Hz tick at or after them: the tell at local 1.8 s (a tick at most later), the swoop .8 s on.
  assert(Math.abs(bat.bat.t0 - bat.bat.tellAt - .8) < 1e-9 && bat.bat.t0 - born >= 2.6 - 1e-9 && bat.bat.t0 - born < 2.6 + 1 / 120, `swoop at local ${bat.bat.t0 - born}`);
  assert(foeKinds(events).includes('bat:swoop'));
  let low = 0; events = stepUntil(game, () => { low = Math.max(low, bat.y); return bat.bat.mode === 'perch'; });
  assert(Math.abs(bat.bat.landAt - bat.bat.t0 - 1) < 1e-9 && bat.bat.landAt - born < 3.6 + 1 / 120, `lands at local ${bat.bat.landAt - born}`);
  assert.deepEqual([bat.x, bat.y, bat.baseX], [bat.bat.x2, bat.bat.y2, bat.bat.x2], 'exactly on its landing');
  assert(low > hold.y + 30, 'the swoop dips toward the launcher'); assert(low + bat.r < game.dangerY - 20, 'and never reaches the line');
  assert(!bat.bloomed && game.lives === 3);
});
test('A credited seed on a perched bat cracks it and startles it: a .25 s tell, its arc set on the same tick', () => {
  const game = lone(), bat = foesOf(game, 'bat')[0];
  advance(game, .3, 120); game.drainEvents();
  const now = game.foeClock; touch(game, bat);
  assert.equal(bat.hp, 1); assert(!bat.bloomed);
  const events = game.drainEvents(), kinds = events.map(e => e.type === 'foe' ? e.kind : e.type);
  assert(kinds.includes('crack') && kinds.includes('bat:startle'), kinds.join(','));
  assert.equal(bat.bat.mode, 'tell'); assert.equal(bat.bat.tellAt, now); assert(Math.abs(bat.bat.t0 - now - .25) < 1e-9);
  assert(bat.bat.startled); assert.deepEqual([bat.bat.x0, bat.bat.y0], [bat.x, bat.y]); assert.equal(bat.bat.x2, 310);
  // An uncredited strike or a chain only cracks a perched bat.
  const other = lone(), b2 = foesOf(other, 'bat')[0]; advance(other, .3, 120);
  other.strike(b2, true); assert.equal(b2.hp, 1); assert.equal(b2.bat.mode, 'perch', 'no startle without an aimed seed');
});
test('A credited seed mid-swoop is a catch: it blooms, pays round(300 x tempo) and one sun charge, "bat:catch"', () => {
  for (const wave of [1, 4]) {
    const caught = lone(), plain = lone(), bat = foesOf(caught, 'bat')[0], twin = foesOf(plain, 'bat')[0];
    for (const g of [caught, plain]) { g.wave = wave; stepUntil(g, () => g.buds[0].bat.mode === 'swoop'); advance(g, .4, 120); g.drainEvents(); }
    assert.deepEqual([bat.x, bat.y], [twin.x, twin.y]);
    const score = caught.score;
    touch(caught, bat);
    assert(bat.bloomed && bat.caught);
    const events = caught.drainEvents(), bloom = events.find(e => e.type === 'bloom'), cue = events.find(e => e.kind === 'bat:catch');
    assert(cue, 'bat:catch'); assert.equal(cue.bonus, Math.round(300 * caught.tempo)); assert.equal(cue.bonus, { 1: 300, 4: 390 }[wave]); assert.equal(caught.score - score, bloom.gain + cue.bonus);
    // The same bloom by a chain mid-swoop: no catch. The sun differs by exactly the catch's one charge.
    plain.due = { id: twin.id, by: 'seed-x', via: 'puff', depth: 1 }; plain.strike(twin, true); plain.due = null;
    assert(twin.bloomed && !twin.caught, 'any hit mid-swoop blooms it'); assert(!plain.drainEvents().some(e => e.kind === 'bat:catch'));
    const base = lone(), b3 = foesOf(base, 'bat')[0]; base.wave = wave; advance(base, .2, 120); b3.hp = 1; touch(base, b3);
    assert(b3.bloomed && !b3.caught); assert.equal(caught.sunCharge - base.sunCharge, 1, 'one sun charge above a plain credited bloom');
  }
});
test('With every landing spot taken a bat stays perched another 1.8 s, and goes once one frees up', () => {
  // Bat at 110: it tries 310, then 200, then 60 (20 clamped), all 34 px lower. A plain bud on each.
  const game = lone(110, 236, []), bat = foesOf(game, 'bat')[0], y = 270;
  game.bumpers = [];
  for (const [i, x] of [310, 200, 60].entries()) game.buds.push({ id: `block${i}`, group: `block${i}`, x, y, baseX: x, startY: y, r: 11, type: 'gold', hp: 1, maxHp: 1, sway: 0, phase: 0 });
  const first = bat.bat.until;
  advance(game, first + .2 - game.foeClock, 120);
  assert.equal(bat.bat.mode, 'perch'); assert(Math.abs(bat.bat.until - first - 1.8) < 1e-9, 'perched another 1.8 s');
  assert(!game.drainEvents().some(e => e.kind === 'bat:ping'));
  strikeOut(game, game.buds.find(b => b.id === 'block1'));
  stepUntil(game, () => bat.bat.mode === 'tell');
  assert.equal(bat.bat.x2, 200, 'it takes the spot that freed up');
});
test('The two L4 W4 bats never start a swoop on the same tick, and land at least 30 px apart', () => {
  for (const wave of [4, 8]) {
    const game = level(4, wave), bats = foesOf(game, 'bat'), starts = [];
    for (let i = 0; i < 12 * 120 && !game.over; i++) {
      game.step(1 / 120);
      for (const e of game.drainEvents()) {
        if (e.kind === 'bat:swoop') starts.push(Math.round(game.foeClock * 120));
        if (e.kind === 'bat:ping' || e.kind === 'bat:startle') {
          for (const other of bats) if (other !== e.bud && other.bat.mode !== 'perch' && !other.bloomed) assert(Math.hypot(other.bat.x2 - e.x2, other.bat.y2 - e.y2) >= 30, 'reserved landings');
        }
      }
    }
    assert(starts.length >= 2, `L4 W${wave} saw swoops`); assert.equal(new Set(starts).size, starts.length, `L4 W${wave}: swoop ticks ${starts}`);
  }
  // Forced into step: two bats waking on the same tick get swoops .05 s apart and landings 30 px apart.
  const game = sandbox(4, 4, [['bat', 110, 200], ['bat', 160, 200]], { keepBuds: false }), [a, b] = foesOf(game, 'bat');
  b.bat.until = a.bat.until; stepUntil(game, () => a.bat.mode === 'tell' && b.bat.mode === 'tell');
  assert(Math.abs(a.bat.t0 - b.bat.t0) >= .05 - 1e-9); assert(Math.hypot(a.bat.x2 - b.bat.x2, a.bat.y2 - b.bat.y2) >= 30);
});
test('The bot forecast matches the live bat within 1e-6 over 90 steps, from the tell and from mid-swoop', () => {
  for (const from of ['tell', 'swoop']) {
    const game = lone(), bat = foesOf(game, 'bat')[0];
    stepUntil(game, () => bat.bat.mode === from); if (from === 'swoop') advance(game, .4, 120);
    assert.deepEqual(Foes.moves(game), [bat]);
    const forecast = []; for (let k = 0; k <= 90; k++) forecast.push(Foes.predict(game, bat, k / 60, {}));
    for (let k = 0; k <= 90; k++) {
      const f = forecast[k];
      assert(Math.abs(f.x - bat.x) < 1e-6 && Math.abs(f.y - bat.y) < 1e-6, `${from} +${k}/60 s: forecast (${f.x}, ${f.y}) live (${bat.x}, ${bat.y})`);
      assert.equal(f.flags, 0);
      advance(game, 1 / 60, 120);
    }
  }
  // A perched bat about to wake is followed; past its tell its landing is unknown, so it is hidden from then.
  const game = lone(), bat = foesOf(game, 'bat')[0];
  advance(game, bat.bat.until - 1 - game.foeClock, 120);
  assert.deepEqual(Foes.moves(game), [bat]);
  assert.equal(Foes.predict(game, bat, .5, {}).flags, 0); assert.equal(Foes.predict(game, bat, 1.85, {}).flags & 1, 1);
  // Its value: a swoop is the prize (35), a perched bat ordinary (10).
  assert.equal(Foes.value(game, { bud: bat, time: .1 }), 10);
  stepUntil(game, () => bat.bat.mode === 'tell');
  assert.equal(Foes.value(game, { bud: bat, time: .1 }), 10); assert.equal(Foes.value(game, { bud: bat, time: .9 }), 35);
  const run = bot.play(4, { seed: 7, startWave: 4, waves: 1 }); assert(run && typeof run === 'object');
});
test('A Lullaby freezes a swoop where it is, and it carries on after', () => {
  const game = lone(), bat = foesOf(game, 'bat')[0];
  stepUntil(game, () => bat.bat.mode === 'swoop'); advance(game, .3, 120);
  game.lullaby = 1; const at = [bat.x, bat.y, game.foeClock]; advance(game, .5, 120);
  assert.deepEqual([bat.x, bat.y, game.foeClock], at, 'frozen');
  assert(Math.abs(Foes.predict(game, bat, .3, {}).x - bat.x) < 1e-9, 'the forecast knows it is frozen');
  advance(game, 2, 120); assert.equal(bat.bat.mode, 'perch', 'it lands once the Lullaby is over');
});
test('Bats play out the same at 30, 60 and 144 FPS, aimed shots and all', () => {
  const runs = [30, 60, 144].map(fps => {
    const game = level(4, 4), log = [];
    for (let frame = 0; frame < fps * 10; frame++) {
      if (frame % fps === 0) { const second = frame / fps, a = -Math.PI / 2 + ((second * 3) % 7 - 3) * .2; game.fire(Math.cos(a), Math.sin(a)); }
      game.step(1 / fps);
      for (const e of game.drainEvents()) if (e.type === 'foe' || e.type === 'bloom' || e.type === 'crack') log.push(`${e.type}:${e.kind || e.bud.id}:${(e.x ?? e.bud.x).toFixed(4)}`);
    }
    return { log: log.join(' '), score: game.score, lives: game.lives, clock: game.foeClock.toFixed(6), buds: game.buds.map(b => `${b.id}:${b.bloomed}:${b.x.toFixed(5)},${b.y.toFixed(5)}`).join(' ') };
  });
  assert(runs[0].log.includes('bat:swoop'), 'the replay sees a swoop');
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});

// Shared rules every foe keeps, and the art.
test('foes.js never touches the seed pod and never uses Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, '../foes.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\.(pod|podGrow|shotGap)\b/.test(source), 'no seed pod access');
  assert(!/Math\.random/.test(source), 'no Math.random');
});
// art.js and foe-art.js in a VM with recording canvases: every value finite, every save restored, nothing new made
// once warm (no surface, no gradient), and a still frame (reduced motion) the same at any time. Rocks are left out
// (their own art makes gradients each frame).
function artRig() {
  const totals = { surfaces: 0, gradients: 0 };
  function brush() {
    const calls = [], stack = [], state = { globalAlpha: 1, shadowBlur: 0, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineDashOffset: 0 };
    const ctx = new Proxy(state, {
      get(target, name) {
        if (name in target) return target[name];
        return (...args) => {
          for (const value of args) if (typeof value === 'number') assert(Number.isFinite(value), `${String(name)} receives finite values`);
          calls.push([name, ...args.filter(value => typeof value === 'number' || typeof value === 'string')]);
          if (name === 'save') stack.push({ ...state });
          else if (name === 'restore') { assert(stack.length, 'restores a saved state'); Object.assign(state, stack.pop()); }
          else if (name === 'createRadialGradient' || name === 'createLinearGradient') { totals.gradients++; return { addColorStop() {} }; }
          else if (name === 'measureText') return { width: 10 };
        };
      },
      set(target, name, value) { if (typeof value === 'number') assert(Number.isFinite(value), `${String(name)} is finite`); target[name] = value; return true; }
    });
    return { ctx, calls, balanced: () => stack.length === 0 };
  }
  class Canvas { constructor(w, h) { this.width = w; this.height = h; this.rec = brush(); totals.surfaces++; } getContext() { return this.rec.ctx; } }
  const scope = vm.createContext({ OffscreenCanvas: Canvas, console });
  for (const file of ['foe-art.js', 'art.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), scope, { filename: file });
  // Count the foe art's bud draws, so the test cannot pass without drawing a crystal or a bat.
  const FoeArt = scope.BloomFoeArt, budArt = FoeArt.bud, drawn = { buds: 0 };
  FoeArt.bud = (...args) => { drawn.buds++; return budArt.apply(FoeArt, args); };
  return { Art: scope.BloomArt, totals, brush, drawn };
}
const snap = game => ({ mode: 'rush', status: 'playing', lives: game.lives, buds: game.buds, balls: [], bumpers: [], particles: [], floaters: [], launcher: { x: 210, y: 498 },
  podSize: 4, pod: 4, podGrow: 0, nextType: game.nextType, typeAhead: k => game.typeAhead(k), colorAhead: game.colorAhead, dangerY: game.dangerY, foeClock: game.foeClock, foeWave: game.foeWave });
test('Crystal and bat art: finite, balanced, nothing new once warm, and still under reduced motion', () => {
  const { Art, totals, brush, drawn } = artRig(), frames = [];
  // Crystals of every color, ready and not, a refusal and a match; bats perched, telling, swooping and caught.
  const crystals = sandbox(4, 3, PALETTES.map((type, i) => ['chroma', 60 + 75 * i, 230, { type }]), { keepBuds: false });
  load(crystals, 'sky'); crystals.buds[0].refusedAt = 0;
  const bats = sandbox(4, 4, [['bat', 110, 200], ['bat', 310, 200]], { keepBuds: false });
  const draw = (game, time, reducedMotion) => { const rec = brush(); Art.draw(rec.ctx, snap(game), time, { reducedMotion, backdrop: false, showAim: false }); assert(rec.balanced(), 'balanced'); return rec.calls; };
  for (let k = 0; k < 4; k++) { advance(bats, .9, 120); for (const reduced of [false, true]) { draw(crystals, k * .3, reduced); draw(bats, bats.time, reduced); } }
  touch(crystals, crystals.buds[3]); assert(crystals.buds[3].matched);
  for (let k = 0; k < 8; k++) { draw(crystals, crystals.time + k * .08, false); draw(crystals, crystals.time + k * .08, true); }
  // The game prewarms each wave's foe sprites (plan.foes), the bat's 'awake' tell frame among them.
  { const job = Art.prewarm({ foes: [...PALETTES.map(type => ['chroma', 12, type]), ['bat', 11]] }); while (!job.step(1000)); }
  const warm = { ...totals };
  for (let k = 0; k < 90; k++) {
    bats.step(1 / 60); bats.drainEvents();
    for (const reduced of [false, true]) { frames.push(draw(bats, bats.time, reduced).length); draw(crystals, k / 60, reduced); }
  }
  assert.deepEqual(totals, warm, 'no new surfaces or gradients once warm');
  // A still frame is the same at any time while the board itself holds.
  const still = sandbox(4, 3, [['chroma', 210, 230, { type: 'gold' }], ['bat', 110, 200]], { keepBuds: false });
  load(still, 'gold');
  assert.deepEqual(draw(still, 1, true), draw(still, 7.3, true), 'reduced motion: no twinkle, breathing or z\'s');
  assert.notDeepEqual(draw(still, 1, false), draw(still, 1.6, false), 'with Animations on it moves');
  assert(drawn.buds > 1000, `the foe art draws the crystals and bats (${drawn.buds} bud draws)`);
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'foes-level4-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
