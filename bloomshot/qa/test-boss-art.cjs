'use strict';
// Guardian illustration and warning regression checks. Records real Canvas commands without a device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8');
const kinds = ['sunny', 'root', 'puff', 'crystal', 'lotus', 'fossil', 'ember', 'geode', 'briar', 'core'];
const results = [];
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.stack }); } }
function load(withCanvas) {
  const totals = { surfaces: 0, gradients: 0, bytes: 0 };
  function brush() {
    const calls = [], stack = []; let matrix = [1, 0, 0, 1, 0, 0];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0 };
    const mul = (a, b, c, d, e, f) => { const m = matrix; matrix = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; };
    const ctx = new Proxy(state, {
      get(t, name) {
        if (name in t) return t[name];
        if (name === 'canvas') return { width: 420, height: 560 };
        if (name === 'getTransform') return () => { const [a, b, c, d, e, f] = matrix; return { a, b, c, d, e, f }; };
        return (...args) => {
          args.forEach(a => { if (typeof a === 'number') assert(Number.isFinite(a), `${String(name)} received ${a}`); });
          calls.push([name, ...args.filter(a => typeof a === 'number' || typeof a === 'string')]);
          if (name === 'save') stack.push({ matrix: matrix.slice(), state: { ...state } });
          else if (name === 'restore') { assert(stack.length, 'restore without save'); const old = stack.pop(); matrix = old.matrix; Object.assign(state, old.state); }
          else if (name === 'translate') mul(1, 0, 0, 1, ...args);
          else if (name === 'scale') mul(args[0], 0, 0, args[1], 0, 0);
          else if (name === 'rotate') mul(Math.cos(args[0]), Math.sin(args[0]), -Math.sin(args[0]), Math.cos(args[0]), 0, 0);
          else if (name === 'setTransform') matrix = args.slice();
          else if (name === 'measureText') return { width: String(args[0]).length * 7 };
          else if (name === 'createLinearGradient' || name === 'createRadialGradient') { totals.gradients++; return { addColorStop: (n, color) => { assert(Number.isFinite(n)); assert.equal(typeof color, 'string'); } }; }
        };
      },
      set(t, name, value) { if (['globalAlpha', 'lineWidth', 'shadowBlur'].includes(name)) assert(Number.isFinite(value), `${name} is finite`); t[name] = value; return true; }
    });
    return { ctx, calls, balanced: () => stack.length === 0 && matrix.every(Number.isFinite) };
  }
  class Canvas {
    constructor(w, h) { this.width = w; this.height = h; totals.surfaces++; totals.bytes += w * h * 4; this.rec = brush(); }
    getContext() { return this.rec.ctx; }
  }
  const scope = vm.createContext({ console, Math, Map, Set, WeakMap, Array, Object, Number, String, JSON, Date, ...(withCanvas ? { OffscreenCanvas: Canvas } : {}) });
  vm.runInContext(source, scope, { filename: 'art.js' });
  return { Art: scope.BloomArt, brush, totals, scope };
}
function guardian(kind, hp = 18) { return { id: `boss-${kind}`, boss: true, bossKind: kind, x: 210, y: 125, r: 26, hp, maxHp: 26, type: 'gold', bloomed: false, hitAt: -100, bloomAt: -100 }; }
function board(boss, warning = null) { return { mode: 'rush', status: 'playing', buds: [boss], bumpers: [], balls: [], particles: [], floaters: [], aim: [], pending: [], dangerY: 448, launcher: { x: 210, y: 498 }, lives: 3, bossWarning: warning }; }
const options = { showAim: false, theme: 'meadow', reducedMotion: true };
test('Ten guardians use distinct path geometry without a Canvas and never alter collision data', () => {
  const { Art, brush } = load(false), signatures = [];
  for (const kind of kinds) {
    const boss = guardian(kind), before = JSON.stringify(boss), rec = brush();
    Art.draw(rec.ctx, board(boss), 5, options);
    assert(rec.balanced(), kind + ' transforms balance'); assert.equal(JSON.stringify(boss), before, kind + ' state unchanged');
    const geometry = rec.calls.filter(c => ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'ellipse'].includes(c[0]));
    signatures.push(crypto.createHash('sha256').update(JSON.stringify(geometry)).digest('hex'));
  }
  assert.equal(new Set(signatures).size, 10, 'silhouettes are not palette swaps');
});
test('Normal, enraged, injured, warning and finale states draw with finite numbers and balanced transforms', () => {
  const { Art, brush } = load(true);
  for (const kind of kinds) for (const reducedMotion of [false, true]) for (const hp of [26, 13, 2, 0]) {
    const boss = guardian(kind, hp); if (!hp) { boss.bloomed = true; boss.bloomAt = 4.96; }
    const warning = hp ? { kind, x: 210, y: 125, at: 4.5, until: 5.7, text: 'Watch the falling flowers', targets: [{ x: 110, y: 60, r: 14 }] } : null;
    const rec = brush(); Art.draw(rec.ctx, board(boss, warning), 5, { ...options, reducedMotion }); assert(rec.balanced(), `${kind}:${hp}:${reducedMotion}`);
  }
});
test('Repeated guardian frames reuse sprites and create no gradients after warmup', () => {
  const { Art, brush, totals } = load(true);
  for (const kind of kinds) {
    const boss = guardian(kind); Art.draw(brush().ctx, board(boss), 5, { ...options, reducedMotion: false });
    const before = { ...totals };
    for (let i = 0; i < 4; i++) {
      const time = 5.2 + i * .1, start = totals.gradients;
      Art.draw(brush().ctx, board(guardian(kind, 2)), time, { ...options, reducedMotion: false }); const guardianGradients = totals.gradients - start;
      const plain = board(guardian(kind)); plain.buds = []; const baseline = totals.gradients;
      Art.draw(brush().ctx, plain, time, { ...options, reducedMotion: false });
      assert.equal(guardianGradients, totals.gradients - baseline, kind + ' guardian adds no per-frame gradients');
    }
    assert.equal(totals.surfaces, before.surfaces, kind + ' surface reuse');
  }
});
test('The level prewarm prepares the named guardian before it enters', () => {
  const { Art, brush, totals } = load(true), boss = guardian('core');
  const warm = Art.prewarm({ boss: { ...boss, max: boss.maxHp } });
  for (let guard = 0; warm.left && guard < 3000; guard++) warm.step(1000);
  assert.equal(warm.left, 0);
  Art.draw(brush().ctx, board(boss), 5, options); const before = totals.surfaces;
  Art.draw(brush().ctx, board(guardian('core', 2)), 5.2, options); assert.equal(totals.surfaces, before);
});
test('Warnings keep a static target and label with motion off, and expire on time', () => {
  const { Art, brush } = load(false), boss = guardian('root');
  const warning = { kind: 'root', x: 210, y: 125, at: 4.5, until: 5.7, text: 'Roots are stirring', targets: [{ x: 110, y: 60, r: 14 }] };
  const rec = brush(); Art.draw(rec.ctx, board(boss, warning), 5, options);
  assert(rec.calls.some(c => c[0] === 'fillText' && c[1] === warning.text), 'label reads');
  assert(rec.calls.some(c => c[0] === 'arc' && c[1] === 110 && c[2] === 60 && c[3] === 21), 'target reads');
  const expired = brush(); Art.draw(expired.ctx, board(boss, warning), 6, options);
  assert(!expired.calls.some(c => c[0] === 'fillText' && c[1] === warning.text), 'expired label absent');
  assert(rec.balanced() && expired.balanced());
});
test('Reduced motion leaves all guardians in the same pose across time', () => {
  const { Art, brush } = load(true);
  for (const kind of kinds) {
    Art.draw(brush().ctx, board(guardian(kind, 2)), 5, options);
    const a = brush(), b = brush(); Art.draw(a.ctx, board(guardian(kind, 2)), 5.2, options); Art.draw(b.ctx, board(guardian(kind, 2)), 6.2, options);
    const poses = rec => rec.calls.filter(c => ['rotate', 'scale', 'translate'].includes(c[0]));
    assert.deepEqual(poses(a), poses(b), kind + ' static pose');
  }
});
test('Real authored boss controllers render waiting and ability states without changing their colliders', () => {
  const { RushGame } = require('../rush.js'), Depths = require('../depths.js');
  const { Art, brush } = load(true);
  for (let level = 1; level <= 10; level++) {
    const info = Depths.level(level), game = new RushGame({ plan: { id: level, name: info.name, waves: 10, wave: n => Depths.wave(level, n) }, startWave: 10 });
    game.particles = []; game.floaters = [];
    for (const launched of [false, true]) {
      if (launched) { game.fire(0, -1); for (let n = 0; n < 696 && !game.over; n++) { game.step(1 / 120); game.drainEvents(); } }
      const before = JSON.stringify({ buds: game.buds, bossState: game.bossState, bumpers: game.bumpers, currents: game.currents });
      for (const reducedMotion of [false, true]) {
        const rec = brush(); Art.draw(rec.ctx, game, game.time, { ...options, reducedMotion }); assert(rec.balanced(), `${info.name}:${launched}:${reducedMotion}`);
      }
      assert.equal(JSON.stringify({ buds: game.buds, bossState: game.bossState, bumpers: game.bumpers, currents: game.currents }), before, info.name + ' leaves every physical part untouched');
    }
  }
});
test('Only visible real parts are drawn; breaking crust removes its target and hidden bodies stay hidden', () => {
  const { RushGame } = require('../rush.js'), Depths = require('../depths.js');
  const { Art, brush } = load(false);
  const create = level => new RushGame({ plan: { id: level, name: Depths.level(level).name, waves: 10, wave: n => Depths.wave(level, n) }, startWave: 10 });
  const game = create(8), part = game.bossState.parts[0]; game.particles = []; game.floaters = [];
  const present = brush(); Art.draw(present.ctx, game, 0, options);
  const centered = rec => rec.calls.some(call => call[0] === 'translate' && call[1] === part.x && call[2] === part.y);
  assert(centered(present), 'crust drawn at its real collider');
  part.bloomed = true; part.hp = 0; part.regrowAt = 8;
  const broken = brush(); Art.draw(broken.ctx, game, 1, options); assert(!centered(broken), 'a broken plate leaves an actual visible gap');
  part.bloomed = false; part.hp = 2; part.visible = false;
  const hidden = brush(); Art.draw(hidden.ctx, game, 1, options); assert(!centered(hidden), 'an invisible collider is not invented as art');
  const crystal = create(4), boss = crystal.bossState.boss; crystal.particles = []; crystal.floaters = [];
  const split = brush(); Art.draw(split.ctx, { ...crystal, buds: [boss] }, 0, options);
  assert(!split.calls.some(call => call[0] === 'translate' && call[1] === boss.x && call[2] === boss.y), 'hidden main body is absent; the three actual heart colliders carry its illustration');
});
test('Ignited escort art follows the boss clock and disappears on bloom or expiry', () => {
  const { Art, brush } = load(true), bud = { id: 'escort', type: 'coral', x: 160, y: 170, r: 13, hp: 1, maxHp: 1, bossFlameUntil: 9 };
  const game = board(bud); game.bossState = { kind: 'ember', age: 7 };
  const render = () => { const rec = brush(); Art.draw(rec.ctx, game, 30, options); assert(rec.balanced()); return rec.calls; };
  const active = render(); game.bossState.age = 9; const expired = render();
  assert(active.filter(call => call[0] === 'drawImage').length > expired.filter(call => call[0] === 'drawImage').length, 'active ignition uses bossState.age rather than game.time');
  game.bossState.age = 7; bud.bloomed = true; const bloomed = render(); bud.bossFlameUntil = 0;
  assert.deepEqual(bloomed, render(), 'spent flowers never retain a flame indicator');
});
test('The Starseed inherited shell flag never draws the legacy fossil armor', () => {
  const { Art, brush } = load(false), boss = guardian('core'); boss.shell = true; boss.shellAngle = .3;
  const withShell = brush(); Art.draw(withShell.ctx, board(boss), 5, options);
  boss.shell = false; const withoutShell = brush(); Art.draw(withoutShell.ctx, board(boss), 5, options);
  assert.deepEqual(withShell.calls, withoutShell.calls, 'the five actual satellites determine Core protection');
});
test('Fullscreen scenery uses separate unframed cache entries and transparent foreground skips the backdrop', () => {
  const { Art, brush, scope } = load(true), paints = [];
  scope.BloomScenery = { has: theme => theme === 'depth-meadow', garden: () => false, dark: () => false, ink: () => '#336655', paint: (ctx, theme, opts) => paints.push(opts.frame), drawRock() {} };
  Art.drawGarden(brush().ctx, 420, 560, 'depth-meadow', { mode: 'rush' });
  Art.drawGarden(brush().ctx, 430, 932, 'depth-meadow', { mode: 'rush', frame: false });
  Art.drawGarden(brush().ctx, 440, 956, 'depth-meadow', { mode: 'rush', frame: false });
  assert.deepEqual(paints, [true, false], 'framed and full scenes are separately cached and reused across viewport sizes');
  const clear = board(guardian('sunny')); clear.buds = [];
  Art.draw(brush().ctx, clear, 0, { ...options, theme: 'depth-meadow', backdrop: false });
  assert.deepEqual(paints, [true, false], 'transparent board does not repaint or add a framed scene');
});
test('Fullscreen light masking reuses its surfaces and preserves framed art and physical objects', () => {
  const { Art, brush, totals } = load(true), state = board(guardian('sunny'));
  state.tempo = 1.7;
  const lit = { ...options, reducedMotion: false, flash: .8, vignette: .4, danger: { lastLife: true, redFlash: .5, mintFlash: .5 } };
  Art.draw(brush().ctx, state, 5, lit);
  const framed = brush(); Art.draw(framed.ctx, state, 5, lit);
  const before = JSON.stringify(state);
  Art.draw(brush().ctx, state, 5, { ...lit, backdrop: false });
  const surfaces = totals.surfaces;
  for (let frame = 0; frame < 120; frame++) {
    const rec = brush(); Art.draw(rec.ctx, state, 5 + frame / 60, { ...lit, backdrop: false });
    assert(rec.balanced(), 'masked passes restore their transforms and drawing state');
  }
  assert.equal(totals.surfaces, surfaces, 'mask and scratch surface are bounded and reused');
  assert.equal(JSON.stringify(state), before, 'background light leaves physical objects untouched');
  const again = brush(); Art.draw(again.ctx, state, 5, lit);
  assert.deepEqual(again.calls, framed.calls, 'the framed renderer keeps its existing commands');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
