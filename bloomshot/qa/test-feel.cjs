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
  // The finale's impact asks with priority: still capped per request, never cut short by the stops just before it,
  // and it counts against the ones after it.
  const finale = Feel.createHitStop();
  assert.equal(finale.request(.05, 10), .05);
  assert(Math.abs(finale.request(.09, 10.5) - .04) < 1e-9, 'an ordinary stop gets what is left');
  assert.equal(finale.request(.2, 10.6, true), .09, 'a priority stop gets its full .09 s');
  assert.equal(finale.request(.04, 10.9), 0, 'and the next ordinary stop waits its turn');
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

test('A governor fed the work per frame never mistakes a 30 Hz phone for a slow one, and recovers when asked to', () => {
  // A phone capped at 30 Hz that does 4 ms of work a frame stays on full quality.
  const capped = Feel.createGovernor({ slow: 11, slower: 15, recover: 8 });
  for (let i = 0; i < 900; i++) capped.sample(.004, 1 / 30);
  assert.equal(capped.tier, 0, 'a capped display is not a slow phone');
  // Real work over the thresholds still steps up after two seconds of real time, not two seconds of work.
  const busy = Feel.createGovernor({ slow: 11, slower: 15, recover: 8 });
  let tier1At = null, t = 0;
  for (; t < 3; t += 1 / 60) if (busy.sample(.013, 1 / 60) === 1 && tier1At === null) tier1At = t;
  assert.equal(busy.tier, 1); assert(tier1At >= 1.9 && tier1At < 2.6, `tier 1 after ${tier1At} s`);
  for (let i = 0; i < 180; i++) busy.sample(.018, 1 / 60);
  assert.equal(busy.tier, 2);
  // Eight calm seconds step back down one tier at a time.
  for (let i = 0; i < 60 * 7; i++) busy.sample(.004, 1 / 60);
  assert.equal(busy.tier, 2, 'not before eight seconds');
  for (let i = 0; i < 60 * 2; i++) busy.sample(.004, 1 / 60);
  assert.equal(busy.tier, 1, 'one step down');
  for (let i = 0; i < 60 * 9; i++) busy.sample(.004, 1 / 60);
  assert.equal(busy.tier, 0, 'and back to full quality');
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
  // A swaying target is led: a seed reaches its row in about .12 s, while it drifts 60 px/s to the right.
  const drift = { vx: 60, vy: 0 };
  const ahead = { ...ball, x: 234 }, behind = { ...ball, x: 196 };
  assert.equal(Feel.predictHit(Engine, game, ahead, target, .2), null, 'where it is now, the seed would pass it');
  const led = Feel.predictHit(Engine, game, ahead, target, .2, drift);
  assert(led && led.t > .1 && led.t < .14 && led.nx > 0, `a shot at where it will be is a hit: ${JSON.stringify(led)}`);
  assert(Feel.predictHit(Engine, game, behind, target, .2), 'a shot at where it is now looks like a hit');
  assert.equal(Feel.predictHit(Engine, game, behind, target, .2, drift), null, 'but it will have drifted away');
  assert.equal(Feel.predictHit(Engine, { bumpers: [], buds: [target, { ...other, x: 234 }] }, ahead, target, .2, drift), null, 'a flower in the way still blocks');
  assert(Feel.predictHit(Engine, game, ball, target, .2, { vx: 0, vy: 0 }), 'a still target needs no lead');
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

// art: BloomArt pieces to add to the stand-in, such as the real art's spentFlower.
function boot({ motion = true, render = null, settings = {}, art = {} } = {}) {
  const storage = new Map();
  storage.set('bloomshot.save.v1', JSON.stringify({ version: 1, tutorial: true, powersMet: true, rush: { best: 0, bestWave: 1, runs: 1, blooms: 0 },
    depths: render?.depths, settings: { sound: false, haptics: false, motion, ...settings } }));
  const nodes = new Map(), games = [], cues = [], draws = [];
  let nextFrame, now = 0, work = 0, paints = 0;
  const windowHandlers = new Map();
  if (render) { render.warms = []; render.allocations = []; render.scenes = []; render.boardReads = 0; render.meadowDraws = 0; }
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
      getBoundingClientRect: () => {
        if (render && id === 'game-canvas') render.boardReads++;
        const rect = render?.rects?.[id] || {};
        return { left: 0, top: 0, width: 420, height: 560, right: 420, bottom: 560, ...rect };
      },
      hasPointerCapture: () => false, releasePointerCapture: noop, setPointerCapture: noop, focus: noop,
      showModal: () => { node.open = true; }, close: () => { node.open = false; },
      parentElement: { insertBefore: child => nodes.set(child.id, child) }
    };
    Object.defineProperty(node, 'innerHTML', { get: () => node.html || '', set: value => { node.html = value; node.children = value ? [{}] : []; } });
    if (render && id.endsWith('canvas')) for (const dimension of ['width', 'height']) {
      let size = 0;
      Object.defineProperty(node, dimension, { get: () => size, set: value => { size = value; render.allocations.push({ id, dimension, value }); } });
    }
    return node;
  }
  const $ = id => { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); };
  const document = { getElementById: $, createElement: () => element(), body: element('body'), hidden: false, addEventListener: noop };
  class ObservedRush extends Rush.RushGame { constructor(options) { super(options); games.push(this); } }
  const QuietGoals = { ...Goals, record: (state, date) => ({ state: Goals.normalize(state, date), done: [], bonus: false }) };
  const context = vm.createContext({ console, structuredClone, URLSearchParams, Date, Math, Map, Set,
    document, location: { search: '', reload: noop }, navigator: {}, crypto: { randomUUID: () => 'feel-run' },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => storage.set(name, value) },
    performance: { now: () => now + work }, devicePixelRatio: render?.dpr || 1,
    ...(render ? { innerWidth: 420, innerHeight: 560 } : {}),
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout: () => 1, clearTimeout: noop,
    BloomLevels: Levels, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: QuietGoals,
    BloomEngine: Engine, BloomRush: { RushGame: ObservedRush }, BloomBosses: require('../bosses.js'), BloomFoes: require('../foes.js'), BloomDepths: Depths, BloomPowers: Powers,
    BloomTutorial: require('../tutorial.js'), BloomPetals: require('../petals.js'), BloomScenery: { paint: noop, has: () => true },
    BloomFeel: Feel,
    BloomSound: { wake: noop, setEnabled: noop, play: (type, detail) => cues.push({ type, detail, at: now }), muffle: (amount, seconds) => cues.push({ type: 'muffle', detail: { amount, seconds }, at: now }) },
    BloomKeepsakes: Keepsakes,
    BloomArt: { draw: (ctx, state, time, options) => { draws.push({ time, camera: options.camera ? { ...options.camera } : null, vignette: options.vignette, danger: { ...options.danger }, quality: options.quality, flash: options.flash, interpolation: options.interpolation }); work += render?.drawCost || 0; paints++; },
      ...(render ? { paints: () => paints, prewarm: () => ({ step(ms) { render.warms.push(ms); work += render.warmCost || 0; return false; } }) } : {}),
      drawFlower: noop, drawMoon: noop, koiFish: noop, drawGarden: (ctx, w, h, theme, options) => { if (render && options?.frame === false) render.scenes.push({ theme, mode: options.mode }); }, drawProjectile: noop, drawParticle: noop, drawSeed: noop, drawPowerIcon: noop, podSlot: () => ({ x: 210, y: 498 }), ...art },
    BloomMeadow: { plots: Garden.plots.map((p, i) => ({ id: p.id, x: 65 + i * 50, y: 150, labelY: 180, accent: p.color })),
      decor: Garden.decor.map((d, i) => ({ id: d.id, x: 40 + i * 60, y: 200, accent: '#ffffff', icon: [40 + i * 60, 190, 40] })),
      friends: Garden.decor.map((d, i) => ({ id: d.friend.id, decorId: d.id, x: 40 + i * 60, y: 180 })), reactSeconds: 1.1,
      drawDecorIcon: noop, drawFriendIcon: noop, draw: () => { if (render) render.meadowDraws++; } }
  });
  context.window = context; context.addEventListener = (name, fn) => { if (!windowHandlers.has(name)) windowHandlers.set(name, []); windowHandlers.get(name).push(fn); };
  vm.runInContext(source, context, { filename: 'app.js' });
  function frame(milliseconds = 1000 / 60) { now += milliseconds; work = 0; const fn = nextFrame; assert.equal(typeof fn, 'function'); fn(now); }
  function click(id, dataset) { const target = dataset ? Object.assign(element(), { dataset }) : $(id); $(id).emit('click', { target }); }
  return { $, click, frame, games, cues, draws, now: () => now, emit: name => { for (const fn of windowHandlers.get(name) || []) fn(); },
    setViewport: (width, height) => { context.innerWidth = width; context.innerHeight = height; },
    performance: () => context.bloomshotPerformance, saved: () => JSON.parse(storage.get('bloomshot.save.v1')) };
}

test('Old saves default to Maximum; graphics settings persist without changing progress or simulation', () => {
  const render = { dpr: 3, depths: { 1: { stars: 3, best: 1000 } } }, app = boot({ render });
  app.click('depth-map', { depth: '1' }); app.frame();
  assert.equal(app.saved().settings.graphics, 'maximum');
  assert.equal(app.$('game-canvas').width, 1050, 'Maximum retains the original pixel cap');
  const game = app.games.at(-1), before = JSON.stringify(game.snapshot());
  app.$('graphics-quality').emit('change', { target: { value: 'balanced' } });
  assert.equal(app.saved().settings.graphics, 'balanced');
  assert.equal(app.$('game-canvas').width, 840); assert.equal(app.$('scene-canvas').width, 630);
  assert.equal(game.quality, 1); assert.equal(JSON.stringify(game.snapshot()), before, 'changing graphics does not step the engine');
  app.$('graphics-quality').emit('change', { target: { value: 'performance' } });
  assert.equal(app.$('game-canvas').width, 630); assert.equal(app.$('scene-canvas').width, 420);
  app.frame(); assert.equal(app.draws.at(-1).quality, 2, 'manual detail floor survives a fast frame');
  app.$('graphics-quality').emit('change', { target: { value: 'maximum' } });
  assert.equal(app.$('game-canvas').width, 1050); assert.equal(app.saved().depths[1].best, 1000);
});

test('Invalid graphics values fall back to Maximum, while valid saved choices and FPS preference survive', () => {
  for (const value of ['performance', 'balanced', 'maximum', '__proto__', 'constructor', null]) {
    const app = boot({ settings: { graphics: value, frameRate: true } });
    assert.equal(app.saved().settings.graphics, ['performance', 'balanced', 'maximum'].includes(value) ? value : 'maximum');
    assert.equal(app.saved().settings.frameRate, true);
  }
});

// The opening vine curtain ignores taps (a seed fired blind under it was never aimed), so aiming tests start once it lifts.
function pastCurtain(app) { for (let i = 0; i < 40; i++) app.frame(); }

test('Rapid Rush moves defer collision traces until the next paint and release uses the latest angle', () => {
  const app = boot(); app.click('depth-map', { depth: '1' }); pastCurtain(app);
  const game = app.games.at(-1), canvas = app.$('game-canvas'), trace = game.trace.bind(game);
  let traces = 0; game.trace = (...args) => { traces++; return trace(...args); };
  canvas.emit('pointerdown', { pointerId: 7, isPrimary: true, clientX: 200, clientY: 220 });
  traces = 0;
  for (let i = 0; i < 20; i++) canvas.emit('pointermove', { pointerId: 7, clientX: 200 + i * 4, clientY: 180 });
  assert.equal(traces, 0, 'high-rate moves only update the aim direction');
  app.frame(); assert.equal(traces, 1, 'one fresh trace for the displayed frame');
  canvas.emit('pointermove', { pointerId: 7, clientX: 310, clientY: 170 });
  canvas.emit('pointerup', { pointerId: 7, clientX: 310, clientY: 170 });
  assert(game.balls.length > 0, 'release still launches before another animation frame');
  const ball = game.balls.at(-1), expected = Math.atan2(170 - game.launcher.y, 310 - game.launcher.x);
  assert(Math.abs(Math.atan2(ball.vy, ball.vx) - expected) < 1e-8, 'latest touch determines the shot');
});

test('Normal-speed rendering receives the residual physics fraction and pausing holds that fraction', () => {
  const app = boot(); app.click('depth-map', { depth: '1' }); app.frame();
  app.frame(16.7); const fraction = app.draws.at(-1).interpolation;
  assert(fraction > 0 && fraction < 1, 'normal speed interpolates between ticks');
  app.$('settings-dialog').open = true; app.frame(33.3);
  assert.equal(app.draws.at(-1).interpolation, fraction, 'paused simulation has no visual extrapolation');
});

test('A busy frame skips warming; a nearly full frame offers only the time still available', () => {
  const render = { drawCost: 13 }, app = boot({ render });
  app.click('depth-map', { depth: '1' }); app.frame();
  assert.equal(render.warms.length, 0, 'over-budget gameplay performs no warm-up job');
  render.drawCost = 6; app.frame();
  assert.deepEqual(render.warms, [2], 'only two milliseconds remain, with no minimum extra work');
  render.drawCost = 1; app.frame();
  assert.equal(render.warms.at(-1), 4, 'Maximum caps warming at four milliseconds and reserves browser time');
  app.$('graphics-quality').emit('change', { target: { value: 'balanced' } }); app.frame();
  assert.equal(render.warms.at(-1), 3, 'Balanced does not spend every saved millisecond warming');
  app.$('graphics-quality').emit('change', { target: { value: 'performance' } }); app.frame();
  assert.equal(render.warms.at(-1), 2, 'Performance leaves the most headroom');
});

test('The quality governor includes warming and fresh paints in sustained CPU cost, then recovers', () => {
  const render = { drawCost: 4, warmCost: 10 }, app = boot({ render });
  app.click('depth-map', { depth: '1' });
  for (let i = 0; i < 160; i++) app.frame();
  assert.equal(app.games.at(-1).quality, 1, 'sustained 14 ms total work lowers costly effects even when sprites paint');
  render.warmCost = 0;
  for (let i = 0; i < 600; i++) app.frame();
  assert.equal(app.games.at(-1).quality, 0, 'smooth frames restore the full artwork');
});

test('Resize storms coalesce without reallocating or canceling unchanged aiming; real changes cancel safely', () => {
  const render = { rects: {}, depths: { 1: { stars: 3, best: 1000 } } }, app = boot({ render });
  app.click('depth-map', { depth: '1' }); pastCurtain(app);
  const game = app.games.at(-1), canvas = app.$('game-canvas');
  canvas.emit('pointerdown', { pointerId: 7, isPrimary: true, clientX: 200, clientY: 300 });
  assert(game.aim.length > 1, 'a real held aim is active');
  const before = { allocations: render.allocations.length, scenes: render.scenes.length };
  render.boardReads = 0;
  for (let i = 0; i < 20; i++) app.emit('resize');
  assert.equal(render.boardReads, 0, 'events defer sizing until the next frame');
  app.frame();
  assert.equal(render.boardReads, 1, 'the event burst sizes once');
  assert.equal(render.allocations.length, before.allocations, 'unchanged backing stores are reused');
  assert.equal(render.scenes.length, before.scenes, 'unchanged scenery is reused');
  assert(game.aim.length > 1, 'an unchanged event does not lose the held aim');
  render.rects['game-canvas'] = { width: 360, height: 480 };
  render.rects['scene-canvas'] = { width: 390, height: 844 };
  for (let i = 0; i < 20; i++) app.emit('resize');
  app.frame();
  assert.equal(game.aim.length, 0, 'changed geometry cancels the old aim before rendering');
  assert.equal(game.balls.length, 0, 'resizing never fires');
  assert.equal(render.scenes.length, before.scenes + 1, 'the new viewport paints once');
  const allocations = render.allocations.length;
  app.click('depth-map', { depth: '2' });
  assert.equal(render.allocations.length, allocations, 'a same-size level keeps its backing stores');
  assert.equal(render.scenes.at(-1).theme, 'depth-roots', 'a new theme paints immediately, before its first frame');
});

test('A real viewport resize still refreshes the Garden when the hidden game board has a zero rect', () => {
  const render = { rects: { 'game-canvas': { width: 0, height: 0, right: 0, bottom: 0 } } }, app = boot({ render, motion: false });
  app.click('garden-btn'); app.emit('resize'); app.frame();
  const before = render.meadowDraws;
  app.setViewport(390, 844); app.emit('resize'); app.frame();
  assert.equal(render.meadowDraws, before + 1, 'changed viewport dirties the visible Garden even though the board rect stayed zero');
  app.emit('resize'); app.frame();
  assert.equal(render.meadowDraws, before + 1, 'an unchanged viewport reuses the still Garden');
});

// Level 1's boss wave with the boss on its last ring and one seed just under it, flying straight up.
function bossShot(app, { awake = true } = {}) {
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
  if (awake) {
    // Earn the real vulnerable phase. Removing a visual shield does not bypass Sunny's controller.
    const bubble = game.buds.find(bud => bud.bossPart === 'bubble');
    game.spawnBall({ x: bubble.x, y: bubble.y + bubble.r + Engine.RADIUS + 1, angle: -Math.PI / 2 }, true);
    game.striker = game.balls.at(-1); game.striker.bossContact = { nx: 0, ny: 1 };
    game.strike(bubble); game.striker = null;
    assert.equal(game.bossState.mode, 'dizzy'); assert(bubble.bloomed);
  }
  boss.hp = 1; boss.sway = 0; boss.x = boss.baseX = 210; boss.shield = false; boss.shell = false;
  game.buds = game.buds.filter(bud => bud === boss || bud.bossPart || bud.bloomed || bud.y < boss.y);
  game.bumpers = game.bumpers.filter(item => item.y > boss.y + 120 || item.y < boss.y - 60);
  game.balls = []; game.status = 'flying';
  game.spawnBall(awake ? { x: boss.x, y: boss.y + boss.r + Engine.RADIUS + 40, angle: -Math.PI / 2, type: 'gold' }
    : { x: boss.x + boss.r + Engine.RADIUS + 40, y: boss.y, angle: Math.PI, type: 'gold' }, true);
  return { game, boss };
}
// Plays until the result shows (or the limit), noting when things happen in real seconds.
test('A guarded named guardian never starts a victory drumroll for a blocked seed', () => {
  const app = boot({ motion: true }), { game, boss } = bossShot(app, { awake: false });
  for (let i = 0; i < 60; i++) app.frame();
  assert.equal(boss.hp, 1); assert.equal(boss.bloomed, false);
  assert(app.cues.some(cue => cue.type === 'bossGuard'), 'the seed actually met the sleeping guardian');
  assert(!app.cues.some(cue => cue.type === 'roll' || cue.type === 'finale'), 'no false victory build or impact');
});
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

test('The boss is the last flower: its bloom calls off the reinforcements, the finale plays on it and nothing piles on top', () => {
  const app = boot({ motion: true }), { game, boss } = bossShot(app);
  // Reinforcements still to come, two open flowers off to the sides, and a sun one bloom from full.
  game.drops = [{ at: 30, buds: [{ id: 'late-1', group: 'late', x: 120, y: 66, r: 11, type: 'sky', hp: 1, maxHp: 1, fall: 1, sway: 0 }] }];
  for (const [x, y] of [[60, 300], [360, 300]]) game.buds.push({ id: `side-${x}`, group: `side-${x}`, x, y, baseX: x, startY: y, r: 11, type: 'lilac', hp: 1, maxHp: 1, fall: 1, sway: 0, hitAt: -100, bloomed: false, bloomAt: -100 });
  game.sunCharge = game._sunNeed() - .01; game.sunFills = 1;
  let light = false, popsAfter = 0, title = null;
  const marks = playOut(app, game, 12, () => {
    light = light || game.particles.some(p => p.kind === 'light');
    if (app.cues.some(c => c.type === 'finale')) popsAfter = Math.max(popsAfter, game.floaters.filter(f => f.kind === 'pop' || f.kind === 'wave' || f.kind === 'trick' || f.kind === 'combo').length);
    title = title || game.floaters.find(f => f.kind === 'title' && /clear!$/.test(f.text));
  });
  assert(marks.finaleAt !== null && marks.finaleAt < marks.impactAt, 'the drumroll built on the boss with reinforcements still queued');
  const boss10 = app.cues.find(c => c.type === 'bloom' && c.detail.bud === boss);
  assert(boss10 && boss10.detail.finale === true, 'the finale is the boss');
  assert.equal(game.status, 'won'); assert.equal(game.drops.length, 0, 'the reinforcements never came');
  assert(!app.cues.some(c => c.type === 'drop'), 'no drop after the boss');
  assert(!app.cues.some(c => c.type === 'superBloom'), 'no Super Bloom over a garden that is already won');
  assert(game.buds.filter(b => b.id.startsWith('side-')).every(b => b.bloomed), 'the rest of the wave bloomed in the cascade');
  // The impact is a light on the flower, not a white-out, and no banner, pop or stamp is stacked over the finale.
  assert(app.draws.every(d => !(d.flash > .5)), `the screen flash peaked at ${Math.max(...app.draws.map(d => d.flash || 0))}`);
  assert(light, 'a warm light on the flower instead');
  assert.equal(popsAfter, 0, 'no score pop, banner, stamp or praise over the finale');
  assert(title, 'the level title came up'); assert.equal(title.text, 'Level 1 clear!'); assert.equal(title.label, 'Old Sunny bloomed!');
  assert(Math.abs(title.y - boss.y) > 29 + boss.r * 1.3, `the ribbon sits clear of the boss (y ${title.y}, boss ${boss.y})`);
  assert(game.bumpers.length && game.bumpers.every(b => Math.abs(title.y - b.y) > 29 + Math.abs(Math.sin(b.angle || 0)) * b.length / 2), 'and clear of the petal');
  assert(!app.cues.some(c => c.type === 'trick'), 'no stamps');
});

test('A bloom the camera never saw coming still gets a short lean-in and slow-down', () => {
  const feel = Feel.create({ motion: true });
  assert.equal(feel.request('impact', { x: 120, y: 200, cold: true }), true);
  let low = 1, peak = 1;
  for (let t = 0; t < 1.2; t += DT) { const out = feel.step(DT); low = Math.min(low, out.scale); peak = Math.max(peak, out.zoom); }
  assert(low < .5, `time slowed to ${low}`); assert(peak > 1.05 && peak <= 1.2, `zoom ${peak}`);
  const out = feel.step(DT); assert.equal(out.scale, 1); assert.equal(out.busy, false);
});

test('The finale leads a swaying final flower: a shot that will meet it builds early, one it will drift away from never builds', () => {
  // The boss swings right through the middle of its sway (about 69 px/s) as a seed climbs straight up toward its row.
  const shotAt = (offset, below) => {
    const app = boot({ motion: true }); app.click('levels-rush-btn');
    const game = app.games.at(-1); for (let i = 0; i < 20; i++) app.frame();
    game.started = true; game.wave = 4; game._loadWave();
    const boss = game.buds.find(bud => !bud.gift);
    assert(boss && !boss.bossKind, 'the endless final flower uses the continuous sway under test');
    boss.hp = 1; game.buds = [boss]; game.drops = []; game.pending = []; game.bumpers = [];
    game.balls = []; boss.sway = 50; boss.swayW = 1.38; boss.swayPhase = 0; boss.baseX = boss.x = 210; game.waveStart = game.time;
    game.spawnBall({ x: 210 + offset, y: boss.y + below, angle: -Math.PI / 2, type: 'gold' }, true);
    let rollAt = null, bloomAt = null;
    for (let i = 0; i < 240 && bloomAt === null; i++) {
      app.frame();
      if (rollAt === null && app.cues.some(c => c.type === 'roll')) rollAt = game.time;
      if (bloomAt === null && boss.bloomed) bloomAt = game.time;
    }
    return { rollAt, bloomAt };
  };
  // Aimed just past its right edge: it swings into the seed.
  const into = shotAt(30, 130);
  assert(into.bloomAt !== null, 'the boss swings into the seed');
  assert(into.rollAt !== null && into.bloomAt - into.rollAt > .15, `the build starts a full beat ahead: ${JSON.stringify(into)}`);
  // Aimed inside its left edge: by the time the seed arrives the boss has swung clear.
  const clear = shotAt(-20, 110);
  assert.equal(clear.bloomAt, null, 'the seed misses');
  assert.equal(clear.rollAt, null, 'so no drumroll for a miss');
});

test('The sweep notes climb one at a time even where mirrored flowers flare together', () => {
  const app = boot({ motion: true }), { game, boss } = bossShot(app);
  // A boss wave's formation is mirrored about the boss, so pairs of flowers sit at exactly the same distance.
  game.buds = game.buds.filter(bud => bud === boss);
  [[80, 178], [340, 178], [118, 248], [302, 248], [150, 300], [270, 300]].forEach(([x, y], i) =>
    game.buds.push({ id: 'mirror-' + i, group: 'mirror', x, y, baseX: x, r: 11, type: ['coral', 'sky', 'lilac'][i >> 1], hp: 1, maxHp: 1, bloomed: true, bloomAt: game.time - 3, hitAt: -100, sway: 0 }));
  boss.x = boss.baseX = 210;
  playOut(app, game);
  const notes = app.cues.filter(c => c.type === 'sweep');
  assert.equal(notes.length, 7, 'one note per bloomed flower');
  notes.forEach((c, i) => assert.equal(c.detail.i, i));
  for (let i = 1; i < notes.length; i++) assert(notes[i].at - notes[i - 1].at >= 55, `notes ${i - 1} and ${i} are ${notes[i].at - notes[i - 1].at} ms apart`);
});

// The real art's spentFlower, for the app's sweep and harvest.
function realArt() {
  const artContext = vm.createContext({ console, Math, Map, Set, WeakMap, Array, Object, Number, String, JSON });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8'), artContext, { filename: 'art.js' });
  return { spentFlower: artContext.BloomArt.spentFlower };
}
function spentGarden(app) {
  const { game, boss } = bossShot(app);
  game.buds = game.buds.filter(bud => bud === boss);
  // Three flowers bloomed long before the boss, and three still open that its bloom sets off.
  const spent = [[80, 178], [118, 248], [150, 300]].map(([x, y], i) => ({ id: 'spent-' + i, group: 'spent', x, y, baseX: x, r: 11, type: 'coral', hp: 1, maxHp: 1, bloomed: true, bloomAt: game.time - 3, hitAt: -100, sway: 0 }));
  const open = [[340, 178], [302, 248], [270, 300]].map(([x, y], i) => ({ id: 'open-' + i, group: 'open', x, y, baseX: x, r: 11, type: 'sky', hp: 1, maxHp: 1, bloomed: false, bloomAt: -100, hitAt: -100, sway: 0 }));
  game.buds.push(...spent, ...open);
  boss.x = boss.baseX = 210;
  return { game, boss, spent, open };
}
test('With the real art a won level\'s sweep lights every flower, bringing back the long-spent ones as the light reaches them', () => {
  const app = boot({ motion: true, art: realArt() }), { game, boss, spent, open } = spentGarden(app);
  const marks = playOut(app, game);
  assert.equal(game.status, 'won');
  assert(open.every(bud => bud.bloomed && typeof bud.flareAt === 'number'), 'the cascade flares');
  assert(typeof boss.flareAt === 'number', 'and so does the boss');
  assert(spent.every(bud => typeof bud.flareAt === 'number' && bud.flareAt > boss.flareAt), 'the flowers spent long before get the light too, in their turn');
  assert(spent.every(bud => bud.backAt === bud.flareAt), 'and come back as it reaches them');
  assert.equal(app.cues.filter(c => c.type === 'sweep').length, 7, 'one note for each flower in the garden');
  assert(marks.openAt !== null, 'and the result still comes');
});
// The game time of the frame that first shows the level won.
const wonTime = game => (t, marks) => { if (game.status === 'won' && marks.wonGame === undefined) marks.wonGame = game.time; };
test('With Animations off a won level brings the spent flowers back all at once at the win, with no light or notes', () => {
  const app = boot({ motion: false, art: realArt() }), { game, spent } = spentGarden(app);
  const marks = playOut(app, game, 12, wonTime(game));
  assert.equal(game.status, 'won');
  assert(spent.every(bud => bud.backAt === marks.wonGame), `every spent flower comes back at the win (${spent.map(b => b.backAt)} for ${marks.wonGame})`);
  assert(spent.every(bud => bud.flareAt === undefined), 'with no light');
  assert.equal(app.cues.filter(c => c.type === 'sweep').length, 0, 'no notes');
});
for (const motion of [true, false]) test(`A level won with no final bloom (the last flowers fell past the line) still brings the garden back, Animations ${motion ? 'on' : 'off'}`, () => {
  // Level 5's free taste ends on wave 3, which has no boss: losing its last group with lives left wins the taste.
  const app = boot({ motion, render: { depths: { 1: { stars: 3 }, 2: { stars: 3 }, 3: { stars: 3 }, 4: { stars: 2 } } }, art: realArt() });
  app.click('depth-map', { depth: '5' });
  const game = app.games.at(-1);
  assert(game.plan && game.plan.taste, 'the Level 5 taste');
  for (let i = 0; i < 20; i++) app.frame();
  game.started = true; game.wave = game.finalWave - 1; game._loadWave(); game.drops = []; game.pending = [];
  const groups = [...new Set(game.buds.filter(bud => !bud.gift && !bud.foe).map(bud => bud.group))], lastGroup = groups.at(-1);
  assert(groups.length >= 2 && !game.buds.some(bud => bud.boss), 'a wave of plain groups');
  const spent = game.buds.filter(bud => bud.group !== lastGroup && !bud.gift);
  for (const bud of spent) { bud.bloomed = true; bud.bloomAt = game.time - 3; }
  for (const bud of game.buds) if (bud.group === lastGroup) bud.y = game.dangerY - (bud.r || 11) + 1;
  game.balls = [];
  const lives = game.lives, marks = playOut(app, game, 6, wonTime(game));
  assert.equal(game.status, 'won'); assert.equal(game.lives, lives - 1, 'a life was lost, not the run');
  assert.equal(app.cues.filter(c => c.type === 'finale').length, 0, 'no finale');
  assert(marks.openAt !== null, 'the result comes');
  assert(spent.every(bud => bud.backAt === marks.wonGame), 'every spent flower comes back together at the win');
});

test('Nothing freezes the finale glide, and the impact still gets its full frozen blink', () => {
  const app = boot({ motion: true }), { game } = bossShot(app);
  for (let i = 0; i < 60 && !app.cues.some(c => c.type === 'roll'); i++) app.frame();
  assert(app.cues.some(c => c.type === 'roll'), 'the finale is building');
  app.frame();
  // A puffcap goes off elsewhere mid-glide: its hit-stop would stutter the slow motion and spend the impact's.
  game.event('puff', { bud: { x: 90, y: 140, type: 'gold', r: 10 }, count: 0 });
  const before = game.time; app.frame(); app.frame();
  assert(game.time > before, 'the glide never stops for another hit');
  let impact = false, frozen = 0, last = game.time;
  for (let i = 0; i < 120 && frozen < 20; i++) {
    app.frame();
    if (!impact) { impact = app.cues.some(c => c.type === 'finale'); last = game.time; continue; }
    if (game.time !== last) break;
    frozen++;
  }
  assert(impact, 'the boss bloomed');
  assert(frozen >= 6, `the impact froze for ${frozen} frames (.09 s is six frames)`);
});

test('The last ring cracked a moment before still leaves the impact its full frozen blink', () => {
  const app = boot({ motion: true }), { game, boss } = bossShot(app);
  // Two seeds in a line: the first cracks the boss to its last ring (a hit-stop of its own), the second blooms it.
  boss.hp = 3; game.balls = []; // Sunny's dizzy weakspot takes two rings per direct hit.
  game.spawnBall({ x: boss.x, y: boss.y + boss.r + Engine.RADIUS + 20, angle: -Math.PI / 2, type: 'gold' }, true);
  game.spawnBall({ x: boss.x, y: boss.y + boss.r + Engine.RADIUS + 110, angle: -Math.PI / 2, type: 'coral' }, true);
  let cracked = false, impact = false, frozen = 0, last = game.time;
  for (let i = 0; i < 240 && frozen < 20; i++) {
    app.frame();
    cracked = cracked || app.cues.some(c => c.type === 'crack');
    if (!impact) { impact = app.cues.some(c => c.type === 'finale'); last = game.time; continue; }
    if (game.time !== last) break;
    frozen++;
  }
  assert(cracked && impact, JSON.stringify({ cracked, impact }));
  assert(app.cues.some(c => c.type === 'roll'), 'the second seed got the build');
  assert(frozen >= 6, `the impact froze for ${frozen} frames (.09 s is six frames)`);
});

test('A tap during the sweep skips straight to the result, but never in the first second and a half after the win', () => {
  const app = boot({ motion: true }), { game } = bossShot(app);
  let strayAt = null, tappedAt = null;
  const tap = () => app.$('game-canvas').emit('pointerdown', { clientX: 210, clientY: 300, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
  const marks = playOut(app, game, 12, (t, seen) => {
    // A player still firing at the last flower taps again right after the win: the finale plays on.
    if (strayAt === null && game.status === 'won' && game.feel && game.feel.sweeping) { strayAt = t; tap(); }
    // A tap 1.5 s after the win, while the gold light or the wait before the card is still on, ends it at once.
    else if (strayAt !== null && tappedAt === null && t - seen.wonAt >= 1.5 + 1e-9 && !app.$('result-dialog').open) { tappedAt = t; tap(); }
  });
  assert(strayAt !== null, 'the sweep was running');
  assert(tappedAt !== null, 'the finale was still playing 1.5 s after the win');
  assert(marks.openAt - strayAt >= 1.4, `the stray tap was swallowed (result ${marks.openAt - strayAt} s after it)`);
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
  let cleared = null, sweeping = false, struck = null, frozen = 0, still = true;
  for (let i = 0; i < 4 * 60; i++) {
    app.frame();
    cleared = cleared || app.cues.find(c => c.type === 'cleared');
    if (game.feel && game.feel.sweeping) sweeping = true;
    // The impact's frozen blink (no boss branch here to add one of its own).
    if (struck === null) { if (app.cues.some(c => c.type === 'finale')) struck = game.time; }
    else if (still && game.time === struck) frozen++;
    else still = false;
  }
  assert(frozen >= 6, `the impact froze for ${frozen} frames (.09 s is six frames)`);
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

test('With the real art endless Rush\'s sweep lights only the flowers still in bloom, so spent ones never come back mid-run', () => {
  const app = boot({ motion: true, art: realArt() });
  app.click('levels-rush-btn');
  const game = app.games.at(-1);
  for (let i = 0; i < 10; i++) app.frame();
  game.started = true; game.wave = 4; game._loadWave(); game.drops = []; game.pending = [];
  const last = game.buds.find(bud => !bud.gift), spent = game.buds.filter(bud => bud !== last && !bud.gift);
  assert(spent.length >= 3, `${spent.length} spent flowers`);
  for (const bud of game.buds) if (bud !== last) { bud.bloomed = true; bud.bloomAt = game.time - 3; }
  Object.assign(last, { hp: 1, geode: false, shield: false, shell: false, sway: 0, vx: 0, vy: 0, x: 210, baseX: 210, y: 200 });
  game.bumpers = game.bumpers.filter(item => item.y > 330 || item.y < 140);
  game.balls = []; game.status = 'flying';
  game.spawnBall({ x: 210, y: 200 + (last.r || 11) + Engine.RADIUS + 40, angle: -Math.PI / 2, type: 'gold' }, true);
  let sweeping = false;
  for (let i = 0; i < 4 * 60; i++) { app.frame(); if (game.feel && game.feel.sweeping) sweeping = true; }
  assert(sweeping, 'the gold light ran');
  assert(typeof last.flareAt === 'number', 'the flower that cleared the wave flares');
  assert(spent.every(bud => bud.flareAt === undefined && bud.backAt === undefined), 'flowers spent long before stay gone');
  assert.notEqual(game.status, 'won');
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

test('On the last life the heartbeat sounds while a flower hangs near the line, with Animations off too', () => {
  for (const motion of [true, false]) {
    const app = boot({ motion });
    app.click('depth-map', { depth: '1' });
    const game = app.games.at(-1);
    for (let i = 0; i < 20; i++) app.frame();
    game.started = true; game.lives = 1;
    const low = game.buds.find(bud => !bud.bloomed && !bud.gift);
    for (const bud of game.buds) bud.y = Math.min(bud.y, 200);
    for (let i = 0; i < 60; i++) app.frame();
    assert.equal(app.cues.filter(c => c.type === 'heartbeat').length, 0, `no heartbeat while the flowers are high (motion ${motion})`);
    low.y = game.dangerY - (low.r || 11) - 40;
    for (let i = 0; i < 120; i++) app.frame();
    const beats = app.cues.filter(c => c.type === 'heartbeat');
    assert(beats.length >= 2 && beats.length <= 3, `${beats.length} heartbeats in 2 s (motion ${motion})`);
    for (let i = 1; i < beats.length; i++) assert(beats[i].at - beats[i - 1].at >= 830 - 1e-6);
  }
});

for (const result of results) console.log(`${result.passed ? 'ok  ' : 'FAIL'} ${result.name}${result.passed ? '' : '\n' + result.error}`);
const failed = results.filter(r => !r.passed).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
