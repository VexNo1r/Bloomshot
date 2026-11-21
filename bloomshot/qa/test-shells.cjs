'use strict';
// Turning shells can always be hit. Each shell level sets how fast its shells turn and how wide they open
// (depths.js SHELLS): the easiest shell level turns fastest with the widest opening, the hardest slowest with the
// narrowest, and no later wave of a level turns faster than an earlier one. Every shell (the level's own, the
// Ammonite Queen, her pearls and stone flowers, The Starseed's pearls) stays open at least 1 s a turn and is
// never shut longer than 4 s, the hit rule lets a seed in exactly where the opening is drawn, and the aim line
// and the practice bot use the same rule. Run: node qa/test-shells.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Depths = require('../depths.js');
const Rush = require('../rush.js');
const bot = require('./depths-bot.cjs');
const { RushGame } = Rush;
const TAU = Math.PI * 2, OPEN_FLOOR = 1, SHUT_CEILING = 4, results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
const advance = (game, seconds, fps = 120) => { for (let i = 0; i < Math.round(seconds * fps); i++) game.step(1 / fps); };
// From one direction the opening passes over a shot for 2 * gap / spin seconds, then is away (2 PI - 2 gap) / spin.
const windows = (gap, spin) => ({ open: 2 * gap / Math.abs(spin), shut: (TAU - 2 * gap) / Math.abs(spin) });
const shelled = id => {
  const out = [];
  for (let n = 1; n <= Depths.waveCount; n++) {
    const w = Depths.wave(id, n);
    for (const list of [w.buds, ...w.drops.map(d => d.buds)]) for (const bud of list) if (bud.shell && !bud.boss) out.push({ n, bud });
  }
  return out;
};
function started(id, wave = 1) {
  const game = new RushGame({ plan: bot.plan(id) });
  game.started = true; game.status = 'flying';
  if (wave > 1) { game.wave = wave - 1; game._loadWave(); }
  return game;
}

test('Each shell level has one turning speed and opening, faster and wider on the easier levels', () => {
  const levels = Object.keys(Depths.shells).map(Number).sort((a, b) => a - b);
  assert.deepEqual(levels, [6, 8, 10], 'shells come in Levels 6, 8 and 10');
  for (const id of Depths.levels.map(l => l.id)) {
    const list = shelled(id);
    if (!Depths.shells[id]) { assert.equal(list.length, 0, `Level ${id} has no shells without a SHELLS row`); continue; }
    assert(list.length > 0, `Level ${id} has shells`);
    const row = Depths.shells[id];
    for (const { bud } of list) {
      assert.equal(Math.abs(bud.shellSpin), row.spin, `${bud.id} turns at its level's speed`);
      assert.equal(bud.shellGap, row.gap, `${bud.id} opens as wide as its level says`);
    }
    // Later waves never turn faster than earlier ones.
    let fastest = Infinity;
    for (let n = 1; n <= Depths.waveCount; n++) {
      const here = list.filter(x => x.n === n).map(x => Math.abs(x.bud.shellSpin));
      if (!here.length) continue;
      assert(Math.max(...here) <= fastest + 1e-9, `Level ${id} wave ${n} turns no faster than the waves before`);
      fastest = Math.min(fastest, Math.min(...here));
    }
  }
  for (let i = 1; i < levels.length; i++) {
    const easy = Depths.shells[levels[i - 1]], hard = Depths.shells[levels[i]];
    assert(easy.spin > hard.spin, `Level ${levels[i - 1]} shells turn faster than Level ${levels[i]}'s`);
    assert(easy.gap > hard.gap, `Level ${levels[i - 1]} shells open wider than Level ${levels[i]}'s`);
  }
  console.log('  table: ' + levels.map(id => {
    const r = Depths.shells[id], w = windows(r.gap, r.spin);
    return `L${id} opening ${Math.round(2 * r.gap * 180 / Math.PI)} deg, spin ${r.spin}/s, open ${w.open.toFixed(2)} s, shut ${w.shut.toFixed(2)} s`;
  }).join(' | '));
});

test('Every level shell is open at least 1 s a turn and never shut longer than 4 s', () => {
  for (const id of Object.keys(Depths.shells).map(Number)) for (const { bud } of shelled(id)) {
    const w = windows(Rush.shellGap(bud), bud.shellSpin);
    assert(w.open >= OPEN_FLOOR, `${bud.id} open ${w.open.toFixed(2)} s`);
    assert(w.shut <= SHUT_CEILING, `${bud.id} shut ${w.shut.toFixed(2)} s`);
  }
});

test('Shells a guardian makes are hittable too: the Queen, her pearls and stone flowers, The Starseed pearls', () => {
  const seen = new Set();
  const check = (bud, label) => {
    if (!bud || !bud.shell) return;
    const gap = bud.boss && bud.bossKind === 'fossil' ? Math.acos(.25) : Rush.shellGap(bud);
    if (!bud.shellSpin) return; // a clicked mouth holds still while the lock turns
    const w = windows(gap, bud.shellSpin);
    assert(w.open >= OPEN_FLOOR, `${label} open ${w.open.toFixed(2)} s`);
    assert(w.shut <= SHUT_CEILING, `${label} shut ${w.shut.toFixed(2)} s`);
    seen.add(label);
  };
  // Play both shelled guardian fights for a while with the practice player and look at every shell on the board.
  for (const id of [6, 10]) {
    const game = started(id, 10);
    for (let t = 0; t < 70 && game.status !== 'over'; t += .25) {
      advance(game, .25, 60);
      for (const bud of game.buds) if (!bud.bloomed) check(bud, bud.boss ? `L${id} guardian` : bud.pearl ? `L${id} pearl` : bud.bossSummon ? `L${id} summon` : `L${id} flower`);
      const s = game.bossState;
      if (s && s.kind === 'fossil' && s.lockStage === 1) {
        const w = windows(Math.acos(.25), s.lockSpin);
        assert(w.open >= OPEN_FLOOR && w.shut <= SHUT_CEILING, `the Queen's lock ring open ${w.open.toFixed(2)} s, shut ${w.shut.toFixed(2)} s`);
      }
    }
  }
  assert(seen.has('L6 guardian'), 'the Ammonite Queen was checked');
  console.log('  guardian shells checked: ' + [...seen].join(', '));
  // Her stone flowers: the fossil guardian's warned effect on ordinary falling flowers.
  const Bosses = require('../bosses.js');
  const src = fs.readFileSync(path.join(__dirname, '../bosses.js'), 'utf8');
  const stone = /p\.shellSpin=([0-9.]+);p\.shellGap=FOSSIL_FLOWER_GAP/.exec(src), gap = +/FOSSIL_FLOWER_GAP = ([0-9.]+)/.exec(src)[1];
  assert(stone, 'stone flowers carry their own opening');
  const w = windows(gap, +stone[1]);
  assert(w.open >= OPEN_FLOOR && w.shut <= SHUT_CEILING, `stone flowers open ${w.open.toFixed(2)} s, shut ${w.shut.toFixed(2)} s`);
  // The Starseed's portal pearls and the Queen's own pearls use the plain opening.
  const starPearl = +/pearl: \{ spit: [^}]*spin: ([0-9.]+)/.exec(src)[1], queenPearl = +/pearlSpin: ([0-9.]+)/.exec(src)[1];
  for (const [label, spin] of [['Starseed pearl', starPearl], ['Queen pearl', queenPearl]]) {
    const p = windows(Rush.SHELL_GAP, spin);
    assert(p.open >= OPEN_FLOOR && p.shut <= SHUT_CEILING, `${label} open ${p.open.toFixed(2)} s, shut ${p.shut.toFixed(2)} s`);
  }
  assert(Bosses && seen.size >= 1);
});

test('A shot lands just inside the opening and glances just outside it, at every level', () => {
  for (const id of Object.keys(Depths.shells).map(Number)) {
    const gap = Depths.shells[id].gap;
    for (const [offset, lands] of [[gap - .04, true], [-(gap - .04), true], [gap + .04, false], [-(gap + .04), false]]) {
      const first = shelled(id).find(x => Depths.wave(id, x.n).buds.includes(x.bud) || Depths.wave(id, x.n).buds.some(b => b.id === x.bud.id)).n;
      const game = started(id, first), bud = game.buds.find(b => b.shell && !b.relay && !b.boss);
      assert(bud, `Level ${id} wave ${first} has a shell`);
      game.buds = [bud]; game.drops = []; game.foes = []; bud.shellSpin = 0; bud.hp = 1; bud.fall = 0; bud.sway = 0;
      // The seed comes straight up from below, so it touches the bud's underside (direction PI / 2).
      bud.shellAngle = Math.PI / 2 + offset;
      game.spawnBall({ x: bud.x, y: bud.y + 60, angle: -Math.PI / 2 });
      advance(game, .25);
      assert.equal(bud.bloomed, lands, `Level ${id}: ${(offset * 180 / Math.PI).toFixed(0)} deg off the opening ${lands ? 'lands' : 'glances'}`);
      assert.equal(Rush.shellOpen(bud, 0, 1), lands, 'shellOpen agrees with the hit');
    }
  }
});

test('The shell is drawn with exactly the opening the hit rule uses, ornaments and all', () => {
  const source = fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8');
  const hooked = source.replace('root.BloomArt = { draw,', 'root.BloomArt = { shellReview: { drawShell }, draw,');
  assert.notEqual(hooked, source);
  const calls = [];
  const ctx = new Proxy({}, { get(target, name) { if (name in target) return target[name]; return (...args) => { calls.push({ name, args }); return { addColorStop() {} }; }; }, set(target, name, value) { target[name] = value; return true; } });
  class Canvas { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx; } }
  const scope = vm.createContext({ Math, Map, Set, WeakMap, console, OffscreenCanvas: Canvas, BloomRush: Rush });
  vm.runInContext(hooked, scope, { filename: 'art.js' });
  const draw = scope.BloomArt.shellReview.drawShell;
  const pieces = [];
  for (const id of Object.keys(Depths.shells).map(Number)) pieces.push(...shelled(id).slice(0, 3).map(x => x.bud));
  pieces.push({ id: 'plain', x: 100, y: 100, r: 11, shell: true, shellAngle: .3, shellSpin: 1 });
  pieces.push({ id: 'queen', x: 210, y: 100, r: 26, shell: true, boss: true, bossKind: 'fossil', shellAngle: 1, shellSpin: .95, shellGap: Math.acos(.25) });
  for (const bud of pieces) {
    calls.length = 0;
    draw(ctx, bud);
    const rot = calls.find(c => c.name === 'rotate'), arc = calls.find(c => c.name === 'arc');
    assert(Math.abs(rot.args[0] - (bud.shellAngle || 0)) < 1e-12, `${bud.id} is turned to its shellAngle`);
    const gap = Rush.shellGap(bud), ring = (Number(bud.r) || 11) + 4.6, pad = .7; // pad: half the widest line drawn (1.4)
    // The outline's ink (the body plus half its line) starts at the rule's edge, within half a degree.
    const ink = arc.args[3] - pad / (ring - 2.7);
    assert(ink >= gap - 1e-9 && ink <= gap + .009 && Math.abs(arc.args[4] - (TAU - arc.args[3])) < 1e-12, `${bud.id} drawn opening ${ink} matches the hit rule ${gap}`);
    // Everything drawn outside the shell's clip (the outline, the whorl and the cap at the lips) stays out of the
    // opening: each circle, swelled by half a line, is measured by the angle it covers as seen from the bud.
    const clip = calls.findIndex(c => c.name === 'clip'), back = calls.findIndex((c, i) => i > clip && c.name === 'restore');
    const lips = [];
    calls.forEach((c, i) => {
      if (c.name !== 'arc' || (i > clip && i < back)) return;
      const [x, y, rr] = c.args, d = Math.hypot(x, y);
      if (d < 1e-9) return; // the outline's own arcs, checked above
      const spread = Math.asin(Math.min(1, (rr + pad) / d)), mid = Math.abs(Math.atan2(y, x));
      assert(mid - spread >= gap - 1e-9, `${bud.id}: a lip ornament reaches ${((gap - (mid - spread)) * 180 / Math.PI).toFixed(1)} deg into the opening`);
      lips.push(mid - spread);
    });
    assert(lips.length >= 2 && Math.min(...lips) <= gap + .06, `${bud.id}: the whorl and cap still sit right at the lips`);
    // The drawn edge is exactly where shellOpen flips.
    const still = { ...bud, shellSpin: 0 };
    for (const side of [1, -1]) {
      const inside = (bud.shellAngle || 0) + side * (gap - 1e-6), outside = (bud.shellAngle || 0) + side * (gap + 1e-6);
      assert(Rush.shellOpen(still, Math.cos(inside), Math.sin(inside)) && !Rush.shellOpen(still, Math.cos(outside), Math.sin(outside)), `${bud.id} edge`);
    }
  }
});

test('The aim line and the practice player use the same opening', () => {
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), botSrc = fs.readFileSync(path.join(__dirname, 'depths-bot.cjs'), 'utf8');
  assert(/BloomRush\.shellOpen\(bud, hit\.nx, hit\.ny, hit\.t\)/.test(app), 'the aim line asks rush.js where the opening will be on arrival');
  assert(/Math\.cos\(shellGap\(bud\)\)/.test(botSrc), 'the practice player aims through the same opening');
  assert(!/< \.34/.test(app + botSrc), 'no fixed opening left behind');
});

const failed = results.filter(r => !r.passed);
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'} ${r.name}${r.passed ? '' : '\n' + r.error}`);
console.log(`${results.length - failed.length}/${results.length} shell tests passed`);
process.exit(failed.length ? 1 : 0);
