'use strict';
// Level 8's new piece: the Lodestone. Checked like the other levels' foes: where the level places it, what a credited
// seed, a chain, a power and an uncredited strike do to it, its field (one pure pull shared by the seed, the aim line
// and the practice bot), that it plays the same at 30, 60 and 144 FPS, the Lullaby, and what the bot thinks of it.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Engine = require('../engine.js'), bot = require('./depths-bot.cjs');
const { sandbox, advance, strikeOut, shoot, foesOf, Foes, Depths, RushGame } = require('./foe-harness.cjs');
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
const { LODE, needleAt } = Foes.FOES.lodestone;
// A lone stone at (x, y), its foe clock run on by `at` s, the board held still so a shot meets it where it was traced.
function lone(x = 210, y = 240, at = 1, keepBuds = false) {
  const game = sandbox(8, 3, [['lodestone', x, y]], { keepBuds }); advance(game, at, 120); game.drainEvents(); game.descentSpeed = 0;
  return { game, lode: foesOf(game, 'lodestone')[0] };
}
// Fires at angle a (radians) and steps until the seed's first touch; returns that touch and every event on the way.
function firstTouch(game, a, limit = 2) {
  let first = null; const orig = game._guarded.bind(game), events = [], speeds = [];
  game._guarded = (bud, hit) => { if (!first) first = { id: bud.id, ny: hit.ny, foe: bud.foe }; return orig(bud, hit); };
  game.fireCooldown = 0; game.shotGap = 0; game.pod = Math.max(game.pod || 0, 1);
  game.fire(Math.cos(a), Math.sin(a));
  for (let t = 0; t < limit && !first && game.balls.length; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); for (const b of game.balls) speeds.push(Math.hypot(b.vx, b.vy)); }
  game._guarded = orig; return { first, events, speeds };
}

// ── Lodestone (Level 8, `lodestone`) ──
test('Lodestones debut in Level 8 wave 3 with their hint, and come back in L8 W8 and W9', () => {
  const w = Depths.wave(8, 3), stones = w.buds.filter(b => b.foe === 'lodestone');
  assert.equal(stones.length, 1); assert.equal(w.hint, 'Lodestones tug seeds! Curl one onto the moss.'); assert(w.hint.length <= 52);
  for (const b of stones) { assert.equal(b.r, 13); assert.equal(b.hp, 3); assert.equal(b.type, 'sky'); assert.equal(b.fall, .8); assert(!b.inert && !b.decoy); }
  assert.deepEqual([[8, 3], [8, 8], [8, 9]].map(([l, n]) => Depths.wave(l, n).buds.filter(b => b.foe === 'lodestone').length), [1, 1, 1]);
  for (const n of [1, 2, 4, 5, 6, 7, 10]) assert(!Depths.wave(8, n).buds.some(b => b.foe === 'lodestone'), `none in L8 W${n}`);
  for (let l = 1; l <= 10; l++) for (const n of [1, 10]) assert(!Depths.wave(l, n).buds.some(b => b.foe), `no foes in L${l} W${n}`);
  assert.equal(Foes.hint('lodestone'), w.hint);
});
test('The iron turns a seed away (a guard, no refund); only the moss opens it, one tuft a hit', () => {
  let { game, lode } = lone();
  const shot = firstTouch(game, -Math.PI / 2);
  assert.equal(shot.first.id, lode.id); assert(shot.first.ny > .25, 'it met the underside');
  assert(foeKinds(shot.events).includes('lodestone:guard')); assert.equal(lode.hp, 3); assert(lode.guardAt != null, 'the smug face has its stamp');
  assert(!foeKinds(shot.events).includes('lodestone:pull'), 'nothing below the stone is ever tugged');
  // A seed struck straight in is judged by its contact the same way.
  ({ game, lode } = lone()); touch(game, lode, .9, .4); assert.equal(lode.hp, 3, 'a side touch on the iron is blocked');
  touch(game, lode, 0, -1); assert.equal(lode.hp, 2);
  assert.deepEqual(game.drainEvents().filter(e => e.type === 'foe').map(e => [e.kind, e.hp, e.curl]), [['lodestone:moss', 2, false]]);
  touch(game, lode, .5, -.86); assert.deepEqual(foeKinds(game.drainEvents()), ['lodestone:moss']); touch(game, lode, -.2, -.97); assert(lode.bloomed);
  // The opening touch is the open alone: no moss cue doubling it on the same tick.
  const last = game.drainEvents(), open = last.find(e => e.kind === 'lodestone:open'); assert(open && open.curl === false && open.gems.length === 0);
  assert.deepEqual(foeKinds(last), ['lodestone:open']);
});
test('Its field curls a seed passing on the needle side onto the moss; the speed never changes and it never circles', () => {
  let curled = 0, straightMiss = 0;
  for (let deg = -130; deg <= -50; deg += 1) {
    const a = deg * Math.PI / 180, { game, lode } = lone(210, 240, 1);
    const plain = Engine.earliest({ bumpers: [], gates: [], buds: [lode] }, game.launcher, { x: Math.cos(a) * 600, y: Math.sin(a) * 600 }, 7);
    const shot = firstTouch(game, a);
    if (!shot.first || shot.first.id !== lode.id) continue;
    for (const s of shot.speeds) assert(Math.abs(s - game.speed) < 1e-6, 'speed unchanged');
    if (!(plain && plain.item === lode) && shot.first.ny <= LODE.moss) { straightMiss++; assert(foeKinds(shot.events).includes('lodestone:pull')); }
    if (shot.first.ny <= LODE.moss) curled++;
  }
  assert(straightMiss >= 2, `seeds that would have missed curl onto the moss (${straightMiss})`);
  assert(curled >= straightMiss);
  // The pull itself: toward the tip, capped, only on the needle's side, never when moving away.
  const f = { id: 'f', x: 0, y: 0, vy: 0, r: 13, R: 84, W: 50, jaw: 1.4, mid: -Math.PI / 2, spin: 0, amp: 0, w: 0, ph: 0, t: 0, hold: 0 }, out = {};
  assert.equal(Foes.pull([f], 40, -10, 0, -600, 1 / 120, 0, out), f, 'a seed rising beside it is turned'); assert(out.vx < 0, 'toward the tip');
  assert(Math.abs(Math.hypot(out.vx, out.vy) - 600) < 1e-9);
  assert(Math.abs(Math.atan2(out.vy, out.vx) + Math.PI / 2) <= 50 * (1 - Math.hypot(40, 10) / 84) / 120 + 1e-12, 'capped at W(1 - d/R) rad/s');
  assert.equal(Foes.pull([f], 0, 40, 0, -600, 1 / 120, 0, out), null, 'below it (outside the jaw): no pull');
  assert.equal(Foes.pull([f], 20, -40, 0, -600, 1 / 120, 0, out), null, 'moving away from the tip: no pull');
  assert.equal(Foes.pull([f], 90, -10, 0, -600, 1 / 120, 0, out), null, 'outside the ring: no pull');
});
test('A curled seed that blooms it wins a little sun ("Magnet curl!"); its last tug blooms up to four loose gems as the seed\'s chains', () => {
  const { game, lode } = lone();
  const gems = [[30, 10], [-30, 22], [0, 60], [50, -30], [-70, 0], [120, 0]].map(([dx, dy], i) => ({ id: `gem${i}`, group: `gem${i}`, x: lode.x + dx, y: lode.y + dy, baseX: lode.x + dx, startY: lode.y + dy, r: 10,
    type: 'sky', hp: 1, maxHp: 1, gem: true, fall: 1, sway: 0, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: game.time }));
  game.buds.push(...gems);
  touch(game, lode, 0, -1); touch(game, lode, 0, -1); game.drainEvents();
  const charge = game.sunCharge, seed = touch(game, lode, 0, -1, { pullBy: lode.id, pullAt: game.time - .2 });
  assert(lode.bloomed && lode.curled); assert(game.sunCharge > charge, 'the curl bonus charged the sun');
  const open = game.drainEvents().find(e => e.kind === 'lodestone:open');
  assert(open.curl); assert.deepEqual(open.gems.map(g => g.id), ['gem0', 'gem1', 'gem3', 'gem2'], 'the nearest four within 84 px, nearest first');
  const events = []; for (let t = 0; t < .4; t += 1 / 120) { game.step(1 / 120); events.push(...game.drainEvents()); }
  for (const id of ['gem0', 'gem1', 'gem2', 'gem3']) assert(events.some(e => e.type === 'bloom' && e.bud.id === id && e.seed === seed.id), `${id} bloomed as the seed's chain`);
  assert(!gems[4].bloomed && !gems[5].bloomed, 'the fifth and the far one stay');
  // A seed the field let go of more than half a second ago is not a curl.
  const b = lone(); b.lode.hp = 1; touch(b.game, b.lode, 0, -1, { pullBy: b.lode.id, pullAt: b.game.time - .6 }); assert(b.lode.bloomed && !b.lode.curled);
});
test('A credited chain or a power lands from any side (no guard, no curl); an uncredited strike opens it with no tug', () => {
  let { game, lode } = lone();
  game.buds.push({ id: 'g', group: 'g', x: lode.x + 20, y: lode.y + 10, baseX: lode.x + 20, startY: lode.y + 10, r: 10, type: 'sky', hp: 1, maxHp: 1, gem: true, fall: 1, sway: 0, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: 0 });
  assert.equal(strikeOut(game, lode), 3); advance(game, .4, 120);
  assert(!game.buds.find(b => b.id === 'g').bloomed, 'an uncredited bloom tugs nothing');
  ({ game, lode } = lone());
  game.due = { id: lode.id, by: 'seed-x', via: 'puff', depth: 1 }; game.strike(lode, true); game.due = null;
  assert.equal(lode.hp, 2, 'a credited chain lands from any side');
  ({ game, lode } = lone());
  touch(game, lode, 0, 1, { power: 'beeline' }); assert.equal(lode.hp, 2, 'a power seed lands on the iron');
  assert.equal(Foes.guard(game, lode, { nx: 0, ny: 1 }, { power: 'sunburst' }), false);
  assert.equal(Foes.guard(game, lode, { nx: 0, ny: 1 }, {}), true);
  game.lullaby = 0; game.scripted = true; assert.equal(Foes.guard(game, lode, { nx: 0, ny: 1 }, {}), false, 'a scripted board never guards');
});
test('The needle sways on the foe clock and a Lullaby holds it (and the fall); the field still bends seeds', () => {
  const { game, lode } = lone(210, 200, 0); game.descentSpeed = 30;
  const read = () => { const f = Foes.fields(game).find(q => q.id === lode.id); return needleAt(f, f.t); };
  const seen = []; for (let k = 0; k < 50; k++) { seen.push(read()); advance(game, .1, 120); }
  assert(Math.max(...seen) - Math.min(...seen) > 1.8, 'it swings shoulder to shoulder over its 5 s');
  assert(seen.every(a => Math.abs(a + Math.PI / 2) <= LODE.swing + 1e-9), 'never past LODE.swing either side of straight up');
  game.lullaby = 2; const y = lode.y, held = read(); advance(game, 1, 120);
  assert.equal(read(), held, 'held'); assert.equal(lode.y, y, 'not falling');
  const f = Foes.fields(game)[0]; assert(f.hold > 0);
  // Looking ahead past the Lullaby, the aim line sees the needle move again.
  assert.equal(needleAt(f, f.t + Math.max(0, .5 - f.hold)), held);
});
test('A curling shot plays out the same at 30, 60 and 144 FPS', () => {
  const runs = [30, 60, 144].map(fps => {
    const { game, lode } = lone(210, 240, 1); game.descentSpeed = 20;
    game.fireCooldown = 0; game.shotGap = 0; game.pod = Math.max(game.pod || 0, 1);
    game.fire(Math.cos(-1.42), Math.sin(-1.42));
    const log = []; for (let k = 0; k < 2 * fps; k++) { game.step(1 / fps); for (const e of game.drainEvents()) if (e.type === 'foe' || e.type === 'bloom') log.push(`${e.type}:${e.kind || e.bud.id}:${(e.x ?? e.bud.x).toFixed(3)}`); }
    return { log: log.join(' '), hp: lode.hp, y: lode.y.toFixed(4), score: game.score };
  });
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});
test('The aim line and the bot bend through the same field as the seed (one pure pull)', () => {
  let n = 0, line = 0, mine = 0;
  for (let deg = -150; deg <= -30; deg += 1) {
    const a = deg * Math.PI / 180, { game } = lone(112, 240, 1, true);
    const traced = game.trace(Math.cos(a) * 400, Math.sin(a) * 400), prep = bot.prepareTrace(game), bt = bot.trace(game, a, 3, prep);
    const { first } = firstTouch(game, a);
    if (!traced.target || !first) continue;
    n++;
    const side = (foe, ny) => foe === 'lodestone' ? (ny <= LODE.moss ? 'moss' : 'iron') : '';
    if (traced.target.id === first.id && side(traced.target.foe, traced.normal.y) === side(first.foe, first.ny)) line++;
    if (bt && bt.bud.id === first.id && side(bt.bud.foe, bt.ny) === side(first.foe, first.ny)) mine++;
  }
  assert(n >= 50, `traced ${n}`); assert(line / n >= .95, `aim line ${line}/${n}`); assert(mine / n >= .95, `bot ${mine}/${n}`);
  const g = lone().game; assert.equal(typeof g.pullFields, 'function'); assert.equal(g.pullFields()[0].id, foesOf(g, 'lodestone')[0].id);
  for (const file of ['../rush.js', './depths-bot.cjs']) assert(/Foes\.pull\(/.test(fs.readFileSync(path.join(__dirname, file), 'utf8')), `${file} uses Foes.pull`);
  assert(/this\.pullSeed\(/.test(fs.readFileSync(path.join(__dirname, '../engine.js'), 'utf8')), 'the aim line asks the game');
});
test('The bot shoots only the moss, and more for the last tuft when gems are near', () => {
  const { game, lode } = lone();
  assert.equal(Foes.value(game, { bud: lode, nx: 0, ny: -1 }), LODE.worth); assert.equal(Foes.value(game, { bud: lode, nx: 0, ny: 1 }), -1);
  game.buds.push(...[[20, 10], [-20, 20]].map(([dx, dy], i) => ({ id: `v${i}`, group: `v${i}`, x: lode.x + dx, y: lode.y + dy, baseX: lode.x + dx, startY: lode.y + dy, r: 10, type: 'sky', hp: 1, maxHp: 1, gem: true, fall: 1, sway: 0, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: 0 })));
  assert.equal(Foes.value(game, { bud: lode, nx: 0, ny: -1 }), LODE.worth, 'gems count only for the last tuft');
  lode.hp = 1; assert.equal(Foes.value(game, { bud: lode, nx: 0, ny: -1 }), LODE.worth + 2 * LODE.gem);
  const run = bot.play(8, { seed: 7, startWave: 3, waves: 1 }); assert(run && typeof run === 'object');
});
test('foes.js keeps the Lodestone free of the seed pod and of Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, '../foes.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\.(pod|podGrow|shotGap)\b/.test(source)); assert(!/Math\.random/.test(source));
});

// ── Art ──
// Records real Canvas commands from art.js and foe-art.js without a device (as test-foes-level5.cjs does): every number
// finite and every save restored; once the stone's sprites are warm, a frame of it makes no gradient, no shadow and no
// new surface. Its hooks are wrapped so the recorder knows when the Lodestone is drawing.
function artScope() {
  const totals = { surfaces: 0, gradients: 0, shadows: 0, hook: null, images: [], turns: [], kit: null };
  function brush() {
    const stack = [], state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, shadowColor: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter', lineDashOffset: 0 };
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
          else if (name === 'rotate' && totals.hook) totals.turns.push([totals.hook, args[0]]);
          else if (name === 'drawImage' && totals.hook) totals.images.push([totals.hook, args[0], state.globalAlpha]);
          else if (/^create(Linear|Radial|Conic)Gradient$|^createPattern$/.test(name)) { if (totals.hook) totals.gradients++; return { addColorStop() {} }; }
        };
      },
      set(t, name, value) {
        if (['globalAlpha', 'lineWidth', 'shadowBlur', 'lineDashOffset'].includes(name)) assert(Number.isFinite(value), `${name} is finite`);
        if (name === 'shadowBlur' && value > 0 && totals.hook) totals.shadows++;
        t[name] = value; return true;
      }
    });
    return { ctx, balanced: () => stack.length === 0 };
  }
  class Canvas { constructor(w, h) { this.width = w; this.height = h; if (totals.hook) totals.surfaces++; this.rec = brush(); } getContext() { return this.rec.ctx; } }
  const scope = vm.createContext({ console, Math, Map, Set, WeakMap, Array, Object, Number, String, JSON, Date, OffscreenCanvas: Canvas });
  for (const file of ['art.js', 'foe-art.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), scope, { filename: file });
  const FoeArt = scope.BloomFoeArt, look = FoeArt.LOOKS.lodestone;
  for (const hook of ['under', 'bud', 'over', 'aim']) {
    const own = look && look[hook];
    if (!own) continue;
    look[hook] = function (...args) {
      totals.kit = args[hook === 'bud' ? 5 : 4];
      const was = totals.hook; totals.hook = 'lodestone:' + hook;
      try { return own.apply(this, args); } finally { totals.hook = was; }
    };
  }
  return { Art: scope.BloomArt, FoeArt, brush, totals };
}
function draw(Art, brush, board, time, still, quality = 0) {
  const rec = brush(); Art.draw(rec.ctx, board, time, { theme: 'meadow', reducedMotion: still, quality }); assert(rec.balanced(), 'saves balance');
}
test('The Lodestone draws cheaply in every state: finite, balanced, and no gradient, shadow or surface once warm', () => {
  const { Art, FoeArt, brush, totals } = artScope();
  assert(FoeArt.LOOKS.lodestone, 'the Lodestone has a look');
  // Boards for every state: calm at full moss, worn to two tufts and to one, just turned a seed off its iron (smug),
  // just hit on the moss (oof), tugging a seed (pull, with its tether), the aim guide ending on its moss and on its
  // iron, and the open (the halves flying).
  const boards = [];
  let { game } = lone(); boards.push(game);
  ({ game } = lone()); touch(game, foesOf(game, 'lodestone')[0], 0, -1); advance(game, .5, 120); boards.push(game);
  ({ game } = lone()); touch(game, foesOf(game, 'lodestone')[0], 0, -1); touch(game, foesOf(game, 'lodestone')[0], 0, -1); advance(game, .1, 120); boards.push(game);
  ({ game } = lone()); foesOf(game, 'lodestone')[0].guardAt = game.time; boards.push(game);
  ({ game } = lone()); const pulled = foesOf(game, 'lodestone')[0]; game.balls.push({ id: 'qa-seed', x: pulled.x + 30, y: pulled.y - 30, vx: 0, vy: -400, r: 6, type: 'sky', pullBy: pulled.id, pullAt: game.time }); boards.push(game);
  for (const ny of [-1, 1]) {
    ({ game } = lone()); const target = foesOf(game, 'lodestone')[0];
    game.aim = Object.defineProperties([{ x: 210, y: 470 }, { x: target.x, y: target.y - ny * target.r }], { target: { value: target }, normal: { value: { x: 0, y: ny } } });
    boards.push(game);
  }
  ({ game } = lone()); const opened = foesOf(game, 'lodestone')[0]; for (let k = 0; k < 3; k++) touch(game, opened, 0, -1); advance(game, .1, 120); assert(opened.bloomed); boards.push(game);
  assert(boards.every(board => board.foeWave));
  // The level's intro paints the sprites ahead (app.js warmPlan).
  draw(Art, brush, boards[0], boards[0].time, false);
  totals.hook = 'warm'; FoeArt.warm([['lodestone', LODE.r, 'sky']], totals.kit); totals.hook = null;
  for (const still of [false, true]) for (const quality of [0, 1, 2]) for (const board of boards) draw(Art, brush, board, board.time, still, quality);
  for (const hook of ['under', 'bud', 'over', 'aim']) assert(hook === 'under' || totals.images.some(([h]) => h === 'lodestone:' + hook), `lodestone:${hook} drew`);
  const warm = { ...totals };
  for (const still of [false, true]) for (const quality of [0, 1, 2]) for (const dt of [.07, .19, .33, 1.9]) for (const board of boards) draw(Art, brush, board, board.time + dt, still, quality);
  assert.deepEqual([totals.gradients, totals.shadows, totals.surfaces], [warm.gradients, warm.shadows, warm.surfaces]);
});
test('The drawn needle is the rules\' needle, with Animations on and off, and it holds through a Lullaby', () => {
  const { Art, brush, totals } = artScope();
  const { game, lode } = lone(210, 240, 0);
  const rules = () => { const f = Foes.fields(game).find(q => q.id === lode.id); return needleAt(f, f.t); };
  const drawn = still => { totals.turns.length = 0; draw(Art, brush, game, game.time, still); const turns = totals.turns.filter(([h]) => h === 'lodestone:bud').map(t => t[1]); assert.equal(turns.length, 1, 'one turned piece: the needle'); return turns[0]; };
  for (let k = 0; k < 12; k++) {
    advance(game, .37, 120);
    for (const still of [false, true]) assert(Math.abs(drawn(still) - rules()) < 1e-9, `needle at ${game.foeClock.toFixed(2)} s (still ${still})`);
  }
  game.lullaby = 1; const held = drawn(false); advance(game, .5, 120);
  assert(Math.abs(drawn(false) - held) < 1e-9, 'a Lullaby holds the drawn needle too');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
fs.writeFileSync(path.join(__dirname, 'foes-level8-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
