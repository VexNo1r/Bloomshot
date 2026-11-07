'use strict';
// Level 10's new piece: the Wishing Stars. Checked the same way as every foe: where the level places it, what a credited
// seed, a chain, a power and an uncredited strike do to it, that it plays the same at 30, 60 and 144 FPS, that it never
// costs a life it should not, and what the practice bot thinks of it.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { sandbox, advance, strikeOut, foesOf, Foes, Depths, RushGame } = require('./foe-harness.cjs');
const results = []; let serial = 0;
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
// A credited seed touching `bud` with contact normal (nx, ny), resolved the way the ball loop resolves a touch.
function touch(game, bud, nx = 0, ny = 1, extra = {}) {
  game.striker = { id: 'seed' + ++serial, bossContact: { nx, ny }, touches: 0, streak: 0, walls: 0, bounces: 0, age: 0, gateAt: -100, petalAt: -100, ...extra };
  game.strike(bud); const seed = game.striker; game.striker = null; return seed;
}
function level(id, wave) {
  const game = new RushGame({ plan: { id, name: 'Test', waves: 1, wave: () => Depths.wave(id, wave) }, startWave: 1 });
  game.started = true; game.drainEvents(); return game;
}
const foeKinds = events => events.filter(e => e.type === 'foe').map(e => e.kind);
const W = Foes.FOES.wishstar, WISH = W.WISH;
const byPip = stars => [...stars].sort((a, b) => a.pip - b.pip);
// A figure alone on a still board (nothing falls), plus the plain buds asked for; the sun is spied on.
function figure(extra = [], opts) {
  const game = sandbox(10, 2, [['wishstar', 210, 200, opts], ...extra], { keepBuds: false });
  game.descentSpeed = 0; game.drainEvents();
  const charges = []; const charge = game._charge.bind(game); game._charge = (amount, credit) => { charges.push(amount); return charge(amount, credit); };
  return { game, stars: byPip(foesOf(game, 'wishstar')), charges };
}
// Runs pending chain links (and the rest of the board) for `seconds`.
const settle = (game, seconds = .5) => advance(game, seconds, 120);

// ── Wishing Stars (Level 10, `wishstar`) ──
test('Registry: four gold r 10 one-hit stars in one group, pips 1-4 in crossing order, with a hint of 52 characters or fewer', () => {
  assert.equal(W.hint, 'Wishing stars! Bloom them in order, 1 to 4.'); assert(W.hint.length <= 52);
  const made = Foes.make('wishstar', ['wishstar', 210, 200], 'd10-2', 0, 10, 2);
  assert.deepEqual(made.map(b => [b.id, b.group, b.pip, b.slot, Math.round(b.x), Math.round(b.y), b.r, b.hp, b.type]),
    [['d10-2-foe0-0', 'd10-2-foe0', 1, 0, 210, 170, 10, 1, 'gold'], ['d10-2-foe0-1', 'd10-2-foe0', 2, 2, 210, 230, 10, 1, 'gold'],
      ['d10-2-foe0-2', 'd10-2-foe0', 3, 1, 240, 200, 10, 1, 'gold'], ['d10-2-foe0-3', 'd10-2-foe0', 4, 3, 180, 200, 10, 1, 'gold']]);
  for (const b of made) { assert(!b.inert && !b.decoy); assert.equal(b.fall, .8); assert.equal(b.relay, false); assert.equal(b.dir, 1); assert.equal(b.wish, 'd10-2-foe0'); }
  assert(Foes.make('wishstar', ['wishstar', 210, 200, { spin: -1 }], 't', 1).every(b => b.dir === -1));
  assert.deepEqual(Foes.make('wishstar', ['wishstar', 100, 90], 'g', null).map(b => [b.id, b.group]), [['g-0', 'g'], ['g-1', 'g'], ['g-2', 'g'], ['g-3', 'g']], 'a guardian spawn names its own group');
  assert.equal(Foes.hint('wishstar'), W.hint);
});
test('Placements: L10 W2 debuts one figure with its hint; figures return in W7 and W9; the greatest-hits rows are in place', () => {
  const w = Depths.wave(10, 2), stars = byPip(w.buds.filter(b => b.foe === 'wishstar'));
  assert.equal(w.hint, 'Wishing stars! Bloom them in order, 1 to 4.');
  assert.deepEqual(stars.map(b => [b.id, Math.round(b.x), Math.round(b.y)]), [['d10-2-foe0-0', 210, 218], ['d10-2-foe0-1', 210, 278], ['d10-2-foe0-2', 240, 248], ['d10-2-foe0-3', 180, 248]]);
  const count = (n, name) => Depths.wave(10, n).buds.filter(b => b.foe === name).length;
  assert.deepEqual([2, 7, 9].map(n => count(n, 'wishstar')), [4, 4, 4]);
  assert.deepEqual([3, 4, 5, 6, 8].map(n => count(n, 'wishstar')), [0, 0, 0, 0, 0]);
  assert.deepEqual(Depths.wave(10, 7).buds.filter(b => b.foe === 'wishstar').map(b => b.dir), [-1, -1, -1, -1]);
  for (let l = 1; l <= 9; l++) for (let n = 1; n <= 10; n++) assert(!Depths.wave(l, n).buds.some(b => b.foe === 'wishstar'), `none before the L10 debut (L${l} W${n})`);
  for (const n of [1, 10]) assert(!Depths.wave(10, n).buds.some(b => b.foe), `W${n}`);
  // The earlier foes Level 10 mixes in; the batch-2 rows make their pieces only once their own blocks define them.
  assert.deepEqual([count(3, 'chroma'), count(8, 'chroma'), count(4, 'bat'), count(8, 'bat'), count(4, 'glowworm'), count(9, 'glowworm')], [1, 1, 1, 1, 5, 5]);
  assert.deepEqual([3, 6, 9].map(n => Depths.wave(10, n).vents.length), [1, 1, 1]);
  for (const [n, name, size] of [[5, 'amberkeeper', 1], [5, 'sweetheart', 2], [6, 'whizzbang', 1], [7, 'lodestone', 1], [8, 'sweetheart', 2]])
    assert.equal(count(n, name), Foes.FOES[name] ? size : 0, `${name} in W${n}`);
});
test('The figure turns on the foe clock (wishAt, closed form) and sinks at .8 of the wave pace; a Lullaby holds it', () => {
  const game = sandbox(10, 2, [['wishstar', 210, 200]], { keepBuds: false }), stars = byPip(foesOf(game, 'wishstar'));
  game.descentSpeed = 10; advance(game, 1.5, 120);
  const out = {};
  for (const b of stars) {
    W.wishAt(b, game.foeClock, 200 + 10 * WISH.fall * game.foeClock, out);
    assert(Math.abs(b.x - out.x) < 1e-6 && Math.abs(b.y - out.y) < 1e-6, `star ${b.pip}`);
    assert(Math.abs(Math.hypot(b.x - 210, b.y - b.wy) - WISH.R) < 1e-9);
  }
  const angle = Math.atan2(stars[0].y - stars[0].wy, stars[0].x - 210);
  assert(Math.abs(angle - (-Math.PI / 2 + WISH.spin * game.foeClock)) < 1e-6, 'clockwise on screen at .8 rad/s');
  const before = stars.map(b => [b.x, b.y]); game.lull(); advance(game, 2, 120);
  assert.deepEqual(stars.map(b => [b.x, b.y]), before, 'held by a Lullaby');
});
test('Out of turn an aimed seed glances off: no bloom, refund, sun or score; the twinkling next star lets it in', () => {
  const { game, stars, charges } = figure(); const [one, two] = stars;
  assert.equal(W.wishNext(game, two), 1);
  assert.equal(Foes.guard(game, two, { nx: 0, ny: 1 }, { id: 's' }), true); assert.equal(Foes.guard(game, one, { nx: 0, ny: 1 }, { id: 's' }), false);
  assert.equal(Foes.guard(game, two, { nx: 0, ny: 1 }, { id: 's', power: 'beeline' }), false, 'a power is never turned away');
  const score = game.score, hits = game.directHits; touch(game, two);
  assert(!two.bloomed); assert.equal(game.score, score); assert.equal(game.directHits, hits); assert.deepEqual(charges, []);
  touch(game, one); assert(one.bloomed);
  assert.deepEqual(foeKinds(game.drainEvents()), ['wishstar:ring']);
  assert.equal(W.wishNext(game, two), 2); assert.equal(Foes.guard(game, two, { nx: 0, ny: 1 }, { id: 's' }), false);
});
test('Four in turn is a wish: four notes, +1 sun, 400 x tempo, and a shooting star that hops to the three nearest pieces', () => {
  // From star 4 at (180, 200): A (150, 120) is 85 px, then B (270, 110) 120 px from A, then C (330, 180) 92 px from B; D (60, 330)
  // is more than 170 px from every hop.
  const plain = [[150, 120], [270, 110], [330, 180], [60, 330]].map(([x, y], i) => ['chroma', x, y, { type: ['gold', 'coral', 'sky', 'lilac'][i] }]);
  const { game, stars, charges } = figure(plain);
  const near = foesOf(game, 'chroma');
  let seed; const events = [];
  for (const b of stars) { seed = touch(game, b); events.push(...game.drainEvents()); }
  const rings = events.filter(e => e.kind === 'wishstar:ring');
  assert.deepEqual(rings.map(e => [e.pip, e.rings]), [[1, 1], [2, 2], [3, 3], [4, 4]]);
  assert.equal(rings[1].fromX, stars[0].x, 'each note carries the star before it, for its line');
  const wish = events.find(e => e.kind === 'wishstar:wish');
  assert(wish); assert.equal(wish.bonus, Math.round(WISH.pay * game.tempo)); assert.equal(wish.n, 3);
  assert(charges.includes(1), 'the wish pays one sun charge');
  const links = game.pending.filter(item => item.via === 'wish');
  assert.equal(links.length, 3); assert(links.every(item => item.by === seed.id), 'credited to the seed that made the wish');
  assert.deepEqual(links.map(item => item.id), ['t10-2-foe1', 't10-2-foe2', 't10-2-foe3'], 'nearest first, then on from there');
  assert(links[1].when - links[0].when > .07 && links[1].when - links[0].when < .09);
  settle(game); assert.deepEqual(near.map(b => b.bloomed), [true, true, true, false], 'D is out of reach');
});
test('Plain blooms: a power, an out-of-turn chain or an uncredited strike opens a star with no note, and that figure cannot wish', () => {
  let { game, stars } = figure();
  game.striker = { id: 'bee', power: 'beeline', bossContact: { nx: 0, ny: 1 } }; game.strike(stars[0]); game.striker = null;
  assert(stars[0].bloomed); assert.deepEqual(foeKinds(game.drainEvents()), []);
  for (const b of stars.slice(1)) touch(game, b);
  let events = game.drainEvents(); assert.deepEqual(foeKinds(events), ['wishstar:ring', 'wishstar:ring', 'wishstar:ring'], 'notes still ring in turn');
  assert(!events.some(e => e.kind === 'wishstar:wish'), 'three notes are not a chord');
  ({ game, stars } = figure());
  game.due = { by: 'chain', via: 'relay', from: { x: 0, y: 0 } }; game.strike(stars[2], true); game.due = null;
  assert(stars[2].bloomed, 'a chain is never turned away'); assert.deepEqual(foeKinds(game.drainEvents()), []);
  ({ game, stars } = figure());
  const sun = { id: 'sun', x: stars[0].x, y: stars[0].y + 12, power: 'sunburst', touches: 0 };
  game.striker = sun; game._sunburst(sun, stars[0]); game.striker = null; settle(game);
  assert(stars.every(b => b.bloomed), 'a Sunburst opens the whole figure'); assert.deepEqual(foeKinds(game.drainEvents()), [], 'its ripple rings no note');
  ({ game, stars } = figure());
  for (const b of [...stars].reverse()) assert.equal(strikeOut(game, b), 1, 'an uncredited strike loop ends at once');
  assert.deepEqual(foeKinds(game.drainEvents()), []);
});
test('The bot: only the star whose turn it is, more as the chord grows, most for the wish; predict matches the board', () => {
  const { game, stars } = figure();
  assert.deepEqual(stars.map(b => W.value(game, b, { bud: b })), [WISH.worth, -1, -1, -1]);
  assert.equal(Foes.value(game, { bud: stars[1] }, null), -1);
  touch(game, stars[0]); touch(game, stars[1]); touch(game, stars[2]);
  assert.equal(W.value(game, stars[3], { bud: stars[3] }), WISH.worth + 3 * WISH.step + WISH.last);
  const g2 = sandbox(10, 2, [['wishstar', 210, 200, { spin: -1 }]], { keepBuds: false }); g2.descentSpeed = 12;
  const b = byPip(foesOf(g2, 'wishstar'))[2], out = {};
  advance(g2, .5, 120); Foes.predict(g2, b, .75, out); advance(g2, .75, 120);
  assert(Math.abs(out.x - b.x) < 1e-6 && Math.abs(out.y - b.y) < 1e-6, 'the forecast is the board');
  assert(Foes.moves(g2).includes(b));
});
test('The same at 30, 60 and 144 FPS: positions, blooms and events', () => {
  const runs = [30, 60, 144].map(fps => {
    const game = sandbox(10, 2, [['wishstar', 210, 200]], { keepBuds: false }); game.descentSpeed = 9;
    const log = [];
    advance(game, 1, fps); for (const b of byPip(foesOf(game, 'wishstar'))) { touch(game, b); advance(game, .5, fps); log.push(...foeKinds(game.drainEvents())); }
    return [log, foesOf(game, 'wishstar').map(b => [b.id, +b.x.toFixed(4), +b.y.toFixed(4), b.bloomed])];
  });
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
  assert.deepEqual(runs[0][0], ['wishstar:ring', 'wishstar:ring', 'wishstar:ring', 'wishstar:ring', 'wishstar:wish']);
});
test('A figure that reaches the line costs one life (one group), and the guardian finale blooms stars with no note', () => {
  const game = sandbox(10, 2, [['wishstar', 210, 380]], { keepBuds: false }); game.descentSpeed = 40;
  const lives = game.lives; let lost = 0;
  for (let t = 0; t < 4; t += 1 / 120) { game.step(1 / 120); lost += game.drainEvents().filter(e => e.type === 'life').length; }
  assert.equal(lost, 1); assert.equal(game.lives, lives - 1); assert(!foesOf(game, 'wishstar').length);
  const { game: g, stars } = figure(); g.bossDown = true; touch(g, stars[0]); assert(stars[0].bloomed); assert.deepEqual(foeKinds(g.drainEvents()), []);
});
test('A real seed: the debut wave plays, and the next star is the one an aimed shot opens', () => {
  const game = level(10, 2), stars = byPip(foesOf(game, 'wishstar'));
  advance(game, .2); const one = stars[0];
  const dx = one.x - game.launcher.x, dy = one.y - game.launcher.y, len = Math.hypot(dx, dy);
  // Aim at star 1 where it will be when a seed gets there (the forecast), as the bot does.
  const out = {}; Foes.predict(game, one, len / game.speed, out);
  const ax = out.x - game.launcher.x, ay = out.y - game.launcher.y, l2 = Math.hypot(ax, ay);
  game.fireCooldown = 0; game.shotGap = 0; game.fire(ax / l2, ay / l2);
  const events = []; for (let t = 0; t < 2 && !one.bloomed; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); }
  assert(one.bloomed || events.some(e => e.kind === 'wishstar:guard'), 'it reached the figure');
});
// Art: records real Canvas commands from art.js and foe-art.js without a device (as test-foes-level5.cjs does): every
// number finite and every save restored; once its sprites are warm, a frame of the Wishing Stars makes no gradient, no
// shadow and no new surface.
function artScope() {
  const totals = { surfaces: 0, gradients: 0, shadows: 0, hook: null, images: [], kit: null };
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
          else if (name === 'drawImage' && totals.hook) totals.images.push([totals.hook, args[0], state.globalAlpha, state.globalCompositeOperation]);
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
  const FoeArt = scope.BloomFoeArt, look = FoeArt.LOOKS.wishstar;
  for (const hook of ['under', 'bud', 'over']) {
    const own = look && look[hook];
    if (!own) continue;
    look[hook] = function (...args) {
      totals.kit = args[hook === 'bud' ? 5 : 4];
      const was = totals.hook; totals.hook = 'wishstar:' + hook;
      try { return own.apply(this, args); } finally { totals.hook = was; }
    };
  }
  return { Art: scope.BloomArt, FoeArt, brush, totals };
}
function draw(Art, brush, board, time, still, quality = 0) {
  const rec = brush(); Art.draw(rec.ctx, board, time, { theme: 'meadow', reducedMotion: still, quality }); assert(rec.balanced(), 'saves balance');
}
test('The Wishing Stars draw cheaply in every state: finite, balanced, and no gradient, shadow or surface once warm', () => {
  const { Art, FoeArt, brush, totals } = artScope();
  assert(FoeArt.LOOKS.wishstar, 'the stars have a look');
  // Boards that show every state: the debut figure falling, one star rung (its node and pointer), a star turning a seed
  // away, three rung, a wish (its flash and shooting star), a broken figure (grey lines), and W7's reversed spin.
  const boards = [];
  let g = level(10, 2); advance(g, .5, 120); boards.push(g);
  let f = figure(); touch(f.game, f.stars[0]); settle(f.game, .3); boards.push(f.game);
  f = figure(); touch(f.game, f.stars[2]); f.stars[2].nopeAt = f.game.time; boards.push(f.game);
  f = figure(); for (const b of f.stars.slice(0, 3)) touch(f.game, b); settle(f.game, .2); boards.push(f.game);
  f = figure([['chroma', 150, 120, { type: 'gold' }], ['chroma', 270, 110, { type: 'sky' }]]);
  for (const b of f.stars) touch(f.game, b);
  const wish = f.game.drainEvents().find(e => e.kind === 'wishstar:wish');
  assert(wish && wish.bud, 'the wish names its last star'); wish.bud.wishPath = wish.path; wish.bud.wishAt = f.game.time; boards.push(f.game);
  f = figure(); f.game.striker = { id: 'bee', power: 'beeline', bossContact: { nx: 0, ny: 1 } }; f.game.strike(f.stars[1]); f.game.striker = null; touch(f.game, f.stars[0]); boards.push(f.game);
  g = level(10, 7); advance(g, .5, 120); boards.push(g);
  // The level's intro paints the stars' sprites ahead, as app.js warmPlan does.
  draw(Art, brush, boards[0], boards[0].time, false);
  assert(totals.kit, 'the look was handed the kit');
  totals.hook = 'warm'; FoeArt.warm([['wishstar', 10]], totals.kit); totals.hook = null;
  for (const still of [false, true]) for (const quality of [0, 1, 2]) for (const board of boards) draw(Art, brush, board, board.time + .05, still, quality);
  for (const hook of ['under', 'bud', 'over']) assert(totals.images.some(([h]) => h === 'wishstar:' + hook), hook + ' drew');
  assert(totals.images.some(([h, , , mode]) => h === 'wishstar:bud' && mode === 'lighter'), 'the next star glows');
  const warm = { ...totals };
  for (const still of [false, true]) for (const quality of [0, 1, 2]) for (const dt of [.02, .13, .41, .77, 1.9]) for (const board of boards) draw(Art, brush, board, board.time + dt, still, quality);
  assert.deepEqual([totals.gradients, totals.shadows, totals.surfaces], [warm.gradients, warm.shadows, warm.surfaces]);
});

// Sound: sound.js's own cue rows for the events a wish sends on one tick (its voices captured instead of played).
function cueRows() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sound.js'), 'utf8')
    .replace('  function foeRows(rows, pan) {', '  function foeRows(rows, pan) { if (globalThis.__rows) { globalThis.__rows.push(...rows); return; }')
    .replace('  function play(type, data = {}) {', '  globalThis.__cues = { FOE_CUES, BOSS_ACTS };\n  function play(type, data = {}) {');
  const scope = vm.createContext({ console, Math, Date }); vm.runInContext(source, scope, { filename: 'sound.js' });
  // Each row tagged with the cue (the event) that played it.
  return events => {
    const rows = [];
    for (const [k, e] of events.entries()) { scope.__rows = []; const cue = scope.__cues.FOE_CUES[e.kind]; if (typeof cue === 'function') cue(e, 0); else if (cue) scope.__rows.push(...cue); rows.push(...scope.__rows.map(r => ({ cue: k, row: r }))); }
    scope.__rows = null; return rows;
  };
}
test('The wish strums its chord once: the fourth bell is not struck twice on the tick that rings it and makes the wish', () => {
  const rowsOf = cueRows(), f = figure();
  const tones = rows => rows.filter(({ row }) => row[0] !== 'crunch').map(({ cue, row }) => ({ cue, pitch: Math.round(row[1] * 100), at: row[2] }));
  for (const [k, b] of f.stars.entries()) {
    touch(f.game, b); const events = f.game.drainEvents().filter(e => e.type === 'foe');
    const rows = rowsOf(events), notes = tones(rows);
    assert(notes.some(n => n.at === 0), `star ${k + 1}: a note on the hit`);
    // Two cues on one tick never strike the same note within .2 s of each other (a flam).
    for (const [i, a] of notes.entries()) for (const z of notes.slice(i + 1)) assert(!(a.cue !== z.cue && a.pitch === z.pitch && Math.abs(a.at - z.at) < .2), `star ${k + 1}: no note doubled within .2 s`);
    if (k < 3) assert.equal(notes.filter(n => n.at === 0).length, 1, 'a lone bell for stars 1-3');
    else assert(events.some(e => e.kind === 'wishstar:wish'), 'the fourth makes the wish');
  }
});

const out = { suite: 'foes-level10', passed: results.every(r => r.passed), results };
fs.writeFileSync(path.join(__dirname, 'foes-level10-results.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
if (!out.passed) process.exitCode = 1;
