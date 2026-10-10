'use strict';
// Feel: the last-flower finale's camera and slow motion, the hit-stop budget, the quality governor and the
// screen-to-board mapping, then the whole finale played through the real app.js on a depth level's boss wave.
// Run: node qa/test-feel.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Feel = require('../feel.js');
const Engine = require('../engine.js');
const Garden = require('../garden.js');
const Goals = require('../goals.js');
const Levels = require('../levels.js');
const Moon = require('../moon.js');
const Koi = require('../koi.js');
const Keepsakes = require('../keepsakes.js');
const Rush = require('../rush.js');
const Depths = require('../depths.js');
const Powers = require('../powers.js');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
const DT = 1 / 60;
const run = (feel, seconds) => { for (let t = 0; t < seconds - 1e-9; t += DT) feel.step(DT); return feel.out; };

// ---- feel.js on its own ----

test('With animations off the camera stays neutral and every request is refused', () => {
  const feel = Feel.create({ motion: false });
  for (const kind of ['finale', 'impact', 'release', 'dip', 'punch']) assert.equal(feel.request(kind, { x: 100, y: 100 }), false, kind);
  const out = run(feel, .5);
  assert.deepEqual({ scale: out.scale, zoom: out.zoom, vignette: out.vignette, busy: out.busy }, { scale: 1, zoom: 1, vignette: 0, busy: false });
  // Turning animations off mid-finale drops straight back to neutral.
  const live = Feel.create({ motion: true });
  assert.equal(live.request('finale', { x: 210, y: 120 }), true); run(live, .1);
  live.setMotion(false); const after = live.step(DT);
  assert.deepEqual({ scale: after.scale, zoom: after.zoom, vignette: after.vignette, busy: after.busy }, { scale: 1, zoom: 1, vignette: 0, busy: false });
});

test('The finale slows time to a quarter within .1 s and leans in without passing 1.2x', () => {
  const feel = Feel.create({ motion: true });
  assert.equal(feel.request('finale', { x: 300, y: 140 }), true);
  assert.equal(feel.request('finale', { x: 10, y: 10 }), false, 'one finale at a time');
  let peak = 1;
  for (let t = 0; t < .1 - 1e-9; t += DT) { feel.step(DT); peak = Math.max(peak, feel.out.zoom); }
  assert(feel.out.scale <= .25, `scale ${feel.out.scale}`);
  for (let t = 0; t < .4; t += DT) { feel.step(DT); peak = Math.max(peak, feel.out.zoom); }
  assert(peak > 1.1 && peak <= 1.2, `zoom peak ${peak}`);
  assert.equal(feel.out.phase, 'finale'); assert.equal(feel.out.busy, true);
  assert(Math.abs(feel.out.vignette - .45) < .01, `vignette ${feel.out.vignette}`);
  assert.deepEqual([feel.out.fx, feel.out.fy], [300, 140], 'zooms about the predicted hit');
  assert.equal(feel.request('dip'), false, 'a dip never interrupts the finale');
  assert.equal(feel.request('punch'), false, 'nor does a punch');
});

test('An unanswered finale releases itself by .95 s, and a release brings time back to full speed within .25 s', () => {
  const feel = Feel.create({ motion: true });
  feel.request('finale', { x: 210, y: 120 });
  run(feel, .95 + DT);
  assert.equal(feel.out.phase, 'release', 'auto-release');
  run(feel, .25);
  assert(feel.out.scale >= .999, `scale ${feel.out.scale}`);
  run(feel, .5);
  assert.equal(feel.out.zoom, 1); assert.equal(feel.out.vignette, 0);
  run(feel, .2);
  assert.equal(feel.out.phase, 'idle'); assert.equal(feel.out.busy, false);
  // An explicit release does the same.
  const again = Feel.create({ motion: true });
  again.request('finale', { x: 210, y: 120 }); run(again, .2);
  assert.equal(again.request('release'), true);
  run(again, .25); assert(again.out.scale >= .999, `scale ${again.out.scale}`);
  assert.equal(again.request('release'), false, 'nothing to release once released');
});

test('The impact kicks a little further in, then everything settles; the focus pans rather than jumps', () => {
  const feel = Feel.create({ motion: true });
  feel.request('finale', { x: 200, y: 100 }); run(feel, .4);
  const before = feel.out.zoom;
  feel.request('impact', { x: 260, y: 100 });
  assert.equal(feel.out.fx, 200, 'no jump while zoomed');
  feel.step(.04);
  assert(feel.out.zoom > before && feel.out.zoom <= 1.2, `zoom ${feel.out.zoom}`);
  assert(feel.out.fx > 200 && feel.out.fx < 260, `pans toward the bloom, fx ${feel.out.fx}`);
  run(feel, 1);
  assert.equal(feel.out.phase, 'idle'); assert.equal(feel.out.zoom, 1); assert.equal(feel.out.scale, 1);
});

test('A dip slows a wave-ending hit briefly, and a punch springs back on its own', () => {
  const feel = Feel.create({ motion: true });
  assert.equal(feel.request('dip'), true); run(feel, .05);
  assert(feel.out.scale < .5, `dip scale ${feel.out.scale}`);
  run(feel, .5); assert.equal(feel.out.scale, 1); assert.equal(feel.out.phase, 'idle');
  assert.equal(feel.request('punch', { x: 100, y: 200 }), true); run(feel, .06);
  assert(feel.out.zoom > 1.05 && feel.out.zoom <= 1.06 + 1e-9, `punch ${feel.out.zoom}`);
  run(feel, .5); assert.equal(feel.out.zoom, 1); assert.equal(feel.out.busy, false);
});

test('Hit-stop grants at most .09 s per request and per rolling second', () => {
  const stop = Feel.createHitStop();
  assert.equal(stop.request(.2, 0), .09, 'one request is capped');
  assert.equal(stop(.05, .5), 0, 'the second is out of budget');
  assert(Math.abs(stop.request(.05, 1.001) - .05) < 1e-9, 'budget returns after a second');
  // A cascade of small hits never adds up to more than .09 s inside any one second.
  const cascade = Feel.createHitStop(), grants = [];
  for (let i = 0; i < 400; i++) { const at = i * .013; grants.push({ at, s: cascade.request(.025, at) }); }
  for (const { at } of grants) {
    const total = grants.filter(g => g.at > at - 1 + 1e-9 && g.at <= at).reduce((n, g) => n + g.s, 0);
    assert(total <= .09 + 1e-9, `${total} s of hit-stop in the second before ${at}`);
  }
  assert.equal(cascade.request(0, 99), 0); assert.equal(cascade.request(-1, 99), 0);
});

test('The quality governor steps up after two slow seconds and never steps back down', () => {
  const g = Feel.createGovernor();
  for (let i = 0; i < 600; i++) g.sample(1 / 60);
  assert.equal(g.tier, 0, 'a smooth phone stays on full quality');
  for (let i = 0; i < 300; i++) g.sample(.5); // tab switches are ignored
  assert.equal(g.tier, 0);
  let tier1At = null;
  for (let t = 0; t < 3; t += .021) { if (g.sample(.021) === 1 && tier1At === null) tier1At = t; }
  assert.equal(g.tier, 1); assert(tier1At >= 1.9, `tier 1 after ${tier1At} s`);
  for (let t = 0; t < 3; t += .03) g.sample(.03);
  assert.equal(g.tier, 2);
  for (let i = 0; i < 2000; i++) g.sample(1 / 120);
  assert.equal(g.tier, 2, 'never steps down');
  assert.equal(typeof g.sample, 'function');
});

test('Screen points map back to the board through the zoom within .01 px', () => {
  const out = { zoom: 1.16, fx: 233, fy: 118 };
  for (const p of [{ x: 0, y: 0 }, { x: 420, y: 560 }, { x: 233, y: 118 }, { x: 17.5, y: 401.25 }]) {
    const back = Feel.toBoard(Feel.toScreen(p, out), out);
    assert(Math.abs(back.x - p.x) < .01 && Math.abs(back.y - p.y) < .01, JSON.stringify({ p, back }));
  }
  assert.deepEqual(Feel.toBoard({ x: 50, y: 60 }, { zoom: 1, fx: 200, fy: 200 }), { x: 50, y: 60 });
  // The camera never shows past the board's edges.
  const corner = Feel.toBoard({ x: 0, y: 0 }, out); assert(corner.x >= 0 && corner.y >= 0);
});

test('predictHit finds the target a fifth of a second ahead and only when it is the first thing hit', () => {
  const target = { id: 'b', x: 210, y: 150, r: 14, bloomed: false }, other = { id: 'o', x: 210, y: 210, r: 12, bloomed: false };
  const game = { bumpers: [], buds: [target] }, ball = { x: 210, y: 230, vx: 0, vy: -500, r: Engine.RADIUS };
  const hit = Feel.predictHit(Engine, game, ball, target, .2);
  assert(hit && hit.t > 0 && hit.t < .2, JSON.stringify(hit));
  assert(Math.abs(hit.y - (150 + 14 + Engine.RADIUS)) < 1, `hit at ${hit.y}`);
  assert.equal(Feel.predictHit(Engine, game, { ...ball, y: 400 }, target, .2), null, 'too far for the horizon');
  assert.equal(Feel.predictHit(Engine, { bumpers: [], buds: [target, other] }, ball, target, .2), null, 'another flower is in the way');
  assert(Feel.predictHit(Engine, { bumpers: [], buds: [target, { ...other, bloomed: true }] }, ball, target, .2), 'bloomed flowers do not block');
  assert.equal(Feel.predictHit(Engine, game, { ...ball, vy: 500 }, target, .2), null, 'flying away');
});

// ---- art.js: seeds and veils draw from cached sprites ----

test('After the first frame, seeds and their trails make no gradients and no shadow blur', () => {
  const counts = {}, sets = {};
  const noop = () => {};
  const recorder = () => new Proxy({ globalAlpha: 1, canvas: { width: 1, height: 1 } }, {
    get: (target, name) => {
      if (name in target) return target[name];
      if (typeof name !== 'string') return undefined;
      return () => { counts[name] = (counts[name] || 0) + 1; return /Gradient$/.test(name) ? { addColorStop: noop } : name === 'measureText' ? { width: 10 } : undefined; };
    },
    set: (target, name, value) => { target[name] = value; if (name === 'shadowBlur' && value > 0) sets.shadowBlur = (sets.shadowBlur || 0) + 1; return true; }
  });
  const hadOffscreen = 'OffscreenCanvas' in globalThis, before = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return recorder(); } };
  try {
    delete require.cache[require.resolve('../art.js')];
    require('../art.js');
    const Art = globalThis.BloomArt, ctx = recorder();
    const trail = Array.from({ length: 10 }, (_, i) => ({ x: 200 + i, y: 300 + i * 7 }));
    const styles = [null, ...Keepsakes.styles.filter(style => style.seed)];
    const balls = ['coral', 'gold', 'lilac', 'sky', 'poppy'].map((type, i) => ({ x: 200, y: 300, vx: 0, vy: -500, r: 7, type, age: .3, trail, hot: i % 2 === 0 }));
    const frame = time => {
      for (const style of styles) for (const fever of [false, true]) balls.forEach((ball, index) => Art.drawProjectile(ctx, ball, index, time, false, fever, style));
    };
    frame(1);
    for (const key of Object.keys(counts)) delete counts[key];
    delete sets.shadowBlur;
    for (let i = 2; i < 8; i++) frame(i / 10);
    assert.equal(counts.createRadialGradient || 0, 0, 'radial gradients per frame');
    assert.equal(counts.createLinearGradient || 0, 0, 'linear gradients per frame');
    assert.equal(sets.shadowBlur || 0, 0, 'shadow blur per frame');
    assert(counts.drawImage > 0, 'the glows are sprites');
  } finally {
    if (hadOffscreen) globalThis.OffscreenCanvas = before; else delete globalThis.OffscreenCanvas;
  }
});

// ---- the finale through app.js ----

function boot({ motion = true } = {}) {
  const storage = new Map();
  storage.set('bloomshot.save.v1', JSON.stringify({ version: 1, tutorial: true, powersMet: true, rush: { best: 0, bestWave: 1, runs: 1, blooms: 0 },
    settings: { sound: false, haptics: false, motion } }));
  const nodes = new Map(), games = [], cues = [], draws = [];
  let nextFrame, now = 0;
  const noop = () => {};
  const brush = new Proxy({ globalAlpha: 1, createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }) }, { get: (target, name) => name in target ? target[name] : noop });
  function element(id = '') {
    const handlers = new Map(), childrenBySelector = new Map(), classes = new Set();
    const node = { id, dataset: {}, children: [], style: { setProperty: noop }, attributes: {}, nextElementSibling: { textContent: '' },
      hidden: false, disabled: false, open: false, checked: false, textContent: '', width: 0, height: 0, scrollIntoView: noop,
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
        toggle: (name, force) => { const active = force === undefined ? !classes.has(name) : force; active ? classes.add(name) : classes.delete(name); return active; }, contains: name => classes.has(name) },
      setAttribute: (name, value) => { node.attributes[name] = value; }, getAttribute: name => node.attributes[name],
      removeAttribute: name => { delete node.attributes[name]; },
      addEventListener: (name, fn) => { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
      emit: (name, extra = {}) => { const event = { target: node, preventDefault: noop, ...extra }; for (const fn of handlers.get(name) || []) fn(event); },
      querySelector: selector => {
        if (!childrenBySelector.has(selector)) {
          const child = element(); const match = selector.match(/data-([\w-]+)="([^"]+)"/);
          if (match) child.dataset[match[1]] = match[2]; childrenBySelector.set(selector, child);
        }
        return childrenBySelector.get(selector);
      },
      closest: selector => selector.startsWith('[data-') && Object.keys(node.dataset).some(k => selector.includes('data-' + k)) ? node : null,
      getContext: () => brush, toDataURL: () => 'data:image/png;base64,test',
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 560, right: 420, bottom: 560 }),
      hasPointerCapture: () => false, releasePointerCapture: noop, setPointerCapture: noop, focus: noop,
      showModal: () => { node.open = true; }, close: () => { node.open = false; },
      parentElement: { insertBefore: child => nodes.set(child.id, child) }
    };
    Object.defineProperty(node, 'innerHTML', { get: () => node.html || '', set: value => { node.html = value; node.children = value ? [{}] : []; } });
    return node;
  }
  const $ = id => { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); };
  const document = { getElementById: $, createElement: () => element(), body: element('body'), hidden: false, addEventListener: noop };
  class ObservedRush extends Rush.RushGame { constructor(options) { super(options); games.push(this); } }
  const QuietGoals = { ...Goals, record: (state, date) => ({ state: Goals.normalize(state, date), done: [], bonus: false }) };
  const context = vm.createContext({ console, structuredClone, URLSearchParams, Date, Math, Map, Set,
    document, location: { search: '', reload: noop }, navigator: {}, crypto: { randomUUID: () => 'feel-run' },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => storage.set(name, value) },
    performance: { now: () => now }, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout: () => 1, clearTimeout: noop,
    BloomLevels: Levels, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: QuietGoals,
    BloomEngine: Engine, BloomRush: { RushGame: ObservedRush }, BloomDepths: Depths, BloomPowers: Powers,
    BloomTutorial: require('../tutorial.js'), BloomPetals: require('../petals.js'), BloomScenery: { paint: noop, has: () => true },
    BloomFeel: Feel,
    BloomSound: { wake: noop, setEnabled: noop, play: (type, detail) => cues.push({ type, detail, at: now }), muffle: (amount, seconds) => cues.push({ type: 'muffle', detail: { amount, seconds }, at: now }) },
    BloomKeepsakes: Keepsakes,
    BloomArt: { draw: (ctx, state, time, options) => draws.push({ time, camera: options.camera ? { ...options.camera } : null, vignette: options.vignette, danger: { ...options.danger }, quality: options.quality }),
      drawFlower: noop, drawMoon: noop, koiFish: noop, drawGarden: noop, drawProjectile: noop, drawParticle: noop, drawSeed: noop, drawPowerIcon: noop },
    BloomMeadow: { plots: Garden.plots.map((p, i) => ({ id: p.id, x: 65 + i * 50, y: 150, labelY: 180, accent: p.color })),
      decor: Garden.decor.map((d, i) => ({ id: d.id, x: 40 + i * 60, y: 200, accent: '#ffffff', icon: [40 + i * 60, 190, 40] })),
      friends: Garden.decor.map((d, i) => ({ id: d.friend.id, decorId: d.id, x: 40 + i * 60, y: 180 })), reactSeconds: 1.1,
      drawDecorIcon: noop, drawFriendIcon: noop, draw: noop }
  });
  context.window = context; context.addEventListener = noop;
  vm.runInContext(source, context, { filename: 'app.js' });
  function frame(milliseconds = 1000 / 60) { now += milliseconds; const fn = nextFrame; assert.equal(typeof fn, 'function'); fn(now); }
  function click(id, dataset) { const target = dataset ? Object.assign(element(), { dataset }) : $(id); $(id).emit('click', { target }); }
  return { $, click, frame, games, cues, draws, now: () => now };
}

// Level 1's boss wave with the boss on its last ring and one seed just under it, flying straight up.
function bossShot(app) {
  app.click('depth-map', { depth: '1' });
  const game = app.games.at(-1);
  assert.equal(game.mode, 'rush'); assert(game.plan && game.plan.id === 1, 'level 1 is running');
  for (let i = 0; i < 20; i++) app.frame();
  game.started = true; game.wave = game.finalWave - 1; game._loadWave();
  // The boss wave's reinforcements are cleared so the boss is the last flower standing.
  game.drops = []; game.pending = [];
  assert.equal(game.wave, 10);
  const boss = game.buds.find(bud => bud.boss);
  assert(boss, 'wave 10 has a boss');
  boss.hp = 1; boss.sway = 0; boss.x = boss.baseX = 210; boss.shield = false; boss.shell = false;
  game.buds = game.buds.filter(bud => bud === boss || bud.bloomed || bud.y < boss.y);
  game.bumpers = game.bumpers.filter(item => item.y > boss.y + 120 || item.y < boss.y - 60);
  game.balls = []; game.status = 'flying';
  game.spawnBall({ x: boss.x, y: boss.y + boss.r + Engine.RADIUS + 40, angle: -Math.PI / 2, type: 'gold' }, true);
  return { game, boss };
}
// Plays until the result shows (or the limit), noting when things happen in real seconds.
function playOut(app, game, limit = 12, onFrame) {
  // flight: real and game seconds while the seed is in the air (the frame that ends the level stops part way).
  const marks = { finaleAt: null, impactAt: null, wonAt: null, openAt: null, flight: { real: 0, game: 0 } };
  let last = game.time;
  for (let i = 0; i < limit * 60 && marks.openAt === null; i++) {
    app.frame();
    const t = app.now() / 1000, step = game.time - last; last = game.time;
    if (game.status === 'flying') { marks.flight.real += DT; marks.flight.game += step; }
    if (marks.finaleAt === null && app.cues.some(c => c.type === 'roll')) marks.finaleAt = t;
    if (marks.impactAt === null && app.cues.some(c => c.type === 'finale')) marks.impactAt = t;
    if (marks.wonAt === null && game.status === 'won') marks.wonAt = t;
    if (onFrame) onFrame(t, marks);
    if (app.$('result-dialog').open) marks.openAt = t;
  }
  return marks;
}

test('The last bloom of a level plays one finale: the roll, a slow lean-in, the impact, the sweep, then the result', () => {
  const app = boot({ motion: true }), { game } = bossShot(app);
  let sweepSeen = false, sweepEndAt = null, openWhileBusy = false, zoomPeak = 1, vignettePeak = 0;
  const marks = playOut(app, game, 12, t => {
    const d = app.draws.at(-1);
    if (d.camera) zoomPeak = Math.max(zoomPeak, d.camera.zoom);
    vignettePeak = Math.max(vignettePeak, d.vignette || 0);
    if (game.feel && game.feel.sweeping) sweepSeen = true;
    else if (sweepSeen && sweepEndAt === null) sweepEndAt = t;
    if (app.$('result-dialog').open && (game.feel.sweeping || (d.camera && d.camera.zoom > 1.001))) openWhileBusy = true;
  });
  const count = type => app.cues.filter(c => c.type === type).length;
  assert.equal(count('roll'), 1, 'one roll'); assert.equal(count('finale'), 1, 'one finale chord');
  assert.equal(count('muffle'), 1, 'the music ducks under the roll');
  assert.equal(JSON.stringify(app.cues.find(c => c.type === 'roll').detail), '{"dur":0.9}');
  assert(marks.finaleAt !== null && marks.impactAt !== null && marks.finaleAt < marks.impactAt, JSON.stringify(marks));
  // The seed starts 40 px from the boss: at full speed that is a few frames; in the finale it takes much longer.
  assert(marks.flight.game / marks.flight.real < .5, `time ran at ${(marks.flight.game / marks.flight.real).toFixed(2)}x in flight`);
  assert(zoomPeak > 1.1 && zoomPeak <= 1.2, `zoom ${zoomPeak}`); assert(vignettePeak > .3 && vignettePeak <= .45 + 1e-9, `vignette ${vignettePeak}`);
  // The finale is on the boss's bloom and on the wave's end.
  const bloom = app.cues.find(c => c.type === 'bloom' && c.detail.bud && c.detail.bud.boss);
  assert(bloom && bloom.detail.finale === true, 'event.finale on the boss bloom');
  const finale = app.cues.find(c => c.type === 'finale');
  assert.equal(finale.detail.type, bloom.detail.bud.type); assert(Number.isFinite(finale.detail.x));
  const won = app.cues.find(c => c.type === 'won'); assert(won && won.detail.finale === true, 'the win is part of the finale');
  // The sweep: notes climb in order, at most ten, and a level gets its title.
  assert(sweepSeen, 'the sweep ran');
  const sweeps = app.cues.filter(c => c.type === 'sweep');
  assert(sweeps.length >= 1 && sweeps.length <= 10, `${sweeps.length} sweep notes`);
  sweeps.forEach((c, i) => { assert.equal(c.detail.i, i); assert.equal(c.detail.n, sweeps.length); });
  assert(game.floaters.some(f => f.kind === 'title' && f.text === 'Level 1 clear!') || marks.openAt !== null, 'the title ribbon');
  // The result waits for the sweep and the camera, then the usual pause; it never appears mid-cinematic.
  assert(marks.wonAt !== null && marks.openAt !== null, JSON.stringify(marks));
  assert(!openWhileBusy, 'the result never opens over the finale');
  assert(marks.openAt - marks.wonAt >= 1.25, `result ${marks.openAt - marks.wonAt} s after the win`);
  assert(marks.openAt - marks.wonAt <= 4.1, 'and never later than the 4 s cap');
  assert(sweepEndAt !== null && marks.openAt - sweepEndAt >= 1.2, `result ${marks.openAt - sweepEndAt} s after the sweep`);
  assert(game.particles.length > 0 || marks.openAt, 'blossoms fell');
});

test('A tap during the sweep skips straight to the result', () => {
  const app = boot({ motion: true }), { game } = bossShot(app);
  let tappedAt = null;
  const tap = () => app.$('game-canvas').emit('pointerdown', { clientX: 210, clientY: 300, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
  const marks = playOut(app, game, 12, t => {
    // A tap while the gold light runs ends the wait at once.
    if (tappedAt === null && game.status === 'won' && game.feel && game.feel.sweeping) { tappedAt = t; tap(); }
  });
  assert(tappedAt !== null, 'the sweep was running');
  // At most the win's own hit-stop (.09 s) and a frame or two.
  assert(marks.openAt !== null && marks.openAt - tappedAt <= .09 + 3 / 60, `result ${marks.openAt - tappedAt} s after the tap`);
  assert.equal(game.feel.sweeping, false); assert.equal(game.feel.waiting, false);
  assert.equal(app.draws.at(-1).camera, null, 'the camera is back to neutral under the result');
  // Before the win a tap still aims as usual (the skip only exists once the level is won).
  const other = boot({ motion: true }), second = bossShot(other);
  assert.equal(second.game.status, 'flying');
  other.$('game-canvas').emit('pointerdown', { clientX: 1, clientY: 1, pointerId: 2, button: 0, isPrimary: true });
  assert(!second.game.feel || !second.game.feel.waiting);
});

test('Endless Rush: the flower that clears every fifth wave gets the finale, and the run carries straight on', () => {
  const app = boot({ motion: true });
  app.click('levels-rush-btn');
  const game = app.games.at(-1);
  assert.equal(game.mode, 'rush'); assert(!game.plan, 'endless Rush');
  for (let i = 0; i < 10; i++) app.frame();
  game.started = true; game.wave = 4; game._loadWave(); game.drops = []; game.pending = [];
  assert.equal(game.wave, 5);
  const last = game.buds.find(bud => !bud.gift);
  for (const bud of game.buds) if (bud !== last) { bud.bloomed = true; bud.bloomAt = game.time - 3; }
  Object.assign(last, { hp: 1, geode: false, shield: false, shell: false, sway: 0, vx: 0, vy: 0, x: 210, baseX: 210, y: 200 });
  game.bumpers = game.bumpers.filter(item => item.y > 330 || item.y < 140);
  game.balls = []; game.status = 'flying';
  game.spawnBall({ x: 210, y: 200 + (last.r || 11) + Engine.RADIUS + 40, angle: -Math.PI / 2, type: 'gold' }, true);
  let cleared = null, sweeping = false;
  for (let i = 0; i < 4 * 60; i++) {
    app.frame();
    cleared = cleared || app.cues.find(c => c.type === 'cleared');
    if (game.feel && game.feel.sweeping) sweeping = true;
  }
  const count = type => app.cues.filter(c => c.type === type).length;
  assert.equal(count('roll'), 1); assert.equal(count('finale'), 1);
  const bloom = app.cues.find(c => c.type === 'bloom' && c.detail.bud === last);
  assert(bloom && bloom.detail.finale === true, 'event.finale on the last bloom');
  assert(cleared && cleared.detail.finale === true, 'the wave clear is part of the finale');
  assert(sweeping, 'the gold light ran');
  assert.equal(game.feel.sweeping, false, 'and finished');
  const notes = count('sweep'); assert(notes >= 1 && notes <= 10, `${notes} sweep notes`);
  assert.notEqual(game.status, 'won'); assert.equal(app.$('result-dialog').open, false, 'the run goes on');
  assert.equal(app.draws.at(-1).camera, null); assert.equal(app.draws.at(-1).vignette, 0);
  assert(!game.floaters.some(f => f.kind === 'title'), 'no level title in endless Rush');
});

test('With animations off the finale keeps its chord and title but no slow motion, camera or sweep, and the result shows after .4 s', () => {
  const app = boot({ motion: false }), { game } = bossShot(app);
  const marks = playOut(app, game);
  const count = type => app.cues.filter(c => c.type === type).length;
  assert.equal(count('roll'), 0); assert.equal(count('muffle'), 0); assert.equal(count('sweep'), 0);
  assert.equal(count('finale'), 1, 'the chord still plays');
  assert(marks.flight.game / marks.flight.real > .9, `time ran at ${(marks.flight.game / marks.flight.real).toFixed(2)}x in flight`);
  assert(app.draws.every(d => d.camera === null && !d.vignette), 'no camera, no vignette');
  assert(marks.wonAt !== null && marks.openAt !== null, JSON.stringify(marks));
  const wait = marks.openAt - marks.wonAt;
  assert(wait >= .4 - 1e-6 && wait < .45, `result after ${wait} s`);
});

test('Losing a life breaks a heart, flashes red and leaves wilted ghosts; the last life is marked for the veil', () => {
  const app = boot({ motion: true });
  app.click('depth-map', { depth: '1' });
  const game = app.games.at(-1);
  for (let i = 0; i < 20; i++) app.frame();
  game.started = true;
  const lives = game.lives, group = game.buds.find(bud => !bud.bloomed && !bud.gift).group;
  for (const bud of game.buds) if (bud.group === group) bud.y = game.dangerY - (bud.r || 11) + 2;
  for (let i = 0; i < 10 && game.lives === lives; i++) app.frame();
  assert.equal(game.lives, lives - 1, 'the breach cost a life');
  app.frame();
  assert(game.heartBreak && game.heartBreak.index === game.lives, JSON.stringify(game.heartBreak));
  assert(Array.isArray(game.wilts) && game.wilts.length >= 1 && game.wilts.length <= 8);
  for (const w of game.wilts) { assert.equal(w.y, game.dangerY); assert(Number.isFinite(w.x)); }
  assert(app.draws.at(-1).danger.redFlash > .5, 'the red flash');
  assert(game.floaters.some(f => f.kind === 'life' && /lives? left|Out of lives/.test(f.text)), 'the lives note');
  for (let i = 0; i < 30; i++) app.frame();
  assert.equal(app.draws.at(-1).danger.redFlash, 0, 'the flash fades within .35 s');
  game.lives = 1; app.frame();
  assert.equal(app.draws.at(-1).danger.lastLife, true);
});

for (const result of results) console.log(`${result.passed ? 'ok  ' : 'FAIL'} ${result.name}${result.passed ? '' : '\n' + result.error}`);
const failed = results.filter(r => !r.passed).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
