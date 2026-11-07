'use strict';
// Picking a level back up after the phone closes the app. A level run keeps a checkpoint in the save (save.run): the wave
// being played, the lives left, the wave the run began at, and the score, blooms and best chain from that wave's start.
// Runs the real app.js on the real rush.js and depths.js in a VM with a DOM stand-in (the harness from test-stage, with
// page and window listeners kept so a test can hide the page, and the storage kept so a test can boot again from it).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Garden = require('../garden.js');
const Goals = require('../goals.js');
const QuietGoals = { ...Goals, record: (state, date) => ({ state: Goals.normalize(state, date), done: [], bonus: false }) };
const Levels = require('../levels.js');
const Moon = require('../moon.js');
const Koi = require('../koi.js');
const Keepsakes = require('../keepsakes.js');
const Engine = require('../engine.js');
const Rush = require('../rush.js');
const Depths = require('../depths.js');
const Powers = require('../powers.js');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const nativeSource = fs.readFileSync(path.join(__dirname, '../native.js'), 'utf8');
const results = [], tests = [];
// Tests run one after another at the end (a test may wait, as the phone's preferences answer asynchronously).
function test(name, fn) { tests.push({ name, fn }); }
const MAIN = 'bloomshot.save.v1', QA = 'bloomshot.qa.v1';
const cleared = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, { stars: 3, best: 3000, wave: 10 }]));
// A player who has cleared the first `n` levels (by default the four free ones).
const player = (extra = {}, n = 4) => ({ version: 1, tutorial: true, powersMet: true, depths: cleared(n), settings: { sound: true, haptics: true, motion: true }, ...extra });
const kept = (extra = {}) => ({ level: 3, wave: 8, lives: 2, score: 4321, from: 1, blooms: 77, chain: 9, gift: false, ...extra });
// The store, as far as the levels need it: whether the levels unlock is owned, and whether the store has answered yet.
function fakeStore({ owned = false, ready = true } = {}) {
  const listeners = [];
  const store = { mode: 'native', ready, owned, owns: id => store.owned && id === Depths.entitlement, products: () => [], isLive: () => false,
    subscribe: fn => { listeners.push(fn); }, onConsumable: () => {}, answer: (own) => { store.owned = own; store.ready = true; listeners.forEach(fn => fn({ type: 'ready' })); } };
  return store;
}
// raw: the save to start from (or storage: a whole storage map from an earlier boot). search: the page's query string.
// sound: a stand-in for BloomSound. worlds: a different world list. prefs: run the real native.js first (as index.html
// does), as the native app with this map as the phone's preferences; its timers never fire, like a hidden app's.
function boot(raw, { search = '', store = null, storage = new Map(), sound = null, worlds = null, prefs = null } = {}) {
  const key = search.includes('alllevels') || search.includes('qa') ? QA : MAIN;
  if (raw !== undefined) storage.set(key, JSON.stringify(raw));
  const nodes = new Map(), games = [];
  let nextFrame, now = 0;
  const noop = () => {};
  const brush = new Proxy({ globalAlpha: 1, createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }) },
    { get: (target, name) => name in target ? target[name] : noop });
  function element(id = '') {
    const handlers = new Map(), childrenBySelector = new Map(), classes = new Set();
    const node = { id, dataset: {}, children: [], style: { setProperty: noop }, attributes: {}, nextElementSibling: { textContent: '' },
      hidden: false, disabled: false, open: false, checked: false, textContent: '', width: 0, height: 0, scrollIntoView: noop,
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
        toggle: (name, force) => { const active = force === undefined ? !classes.has(name) : force; active ? classes.add(name) : classes.delete(name); return active; }, contains: name => classes.has(name) },
      setAttribute: (name, value) => { node.attributes[name] = value; }, getAttribute: name => node.attributes[name], removeAttribute: name => { delete node.attributes[name]; },
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
  // Page and window listeners are kept, so a test can hide the page (a call, the home button) or fire pagehide.
  const listeners = { document: new Map(), window: new Map() };
  const listen = map => (name, fn) => { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); };
  const fire = (target, name) => { for (const fn of listeners[target].get(name) || []) fn({ type: name }); };
  const document = { getElementById: $, createElement: () => element(), body: element('body'), hidden: false, visibilityState: 'visible', addEventListener: listen(listeners.document) };
  class ObservedGame extends Engine.Game { constructor(level) { super(level); games.push(this); } }
  class ObservedRush extends Rush.RushGame { constructor(options) { super(options); games.push(this); } }
  const context = vm.createContext({ console, structuredClone, URLSearchParams, Date, Math, Map, Set,
    document, location: { search, reload: noop }, navigator: {}, crypto: { randomUUID: () => 'run' },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => { storage.set(name, value); } },
    performance: { now: () => now }, devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout: () => 1, clearTimeout: noop,
    BloomLevels: worlds ? { ...Levels, worlds } : Levels, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: QuietGoals, ...(store ? { BloomStore: store } : {}),
    BloomEngine: { ...Engine, Game: ObservedGame }, BloomRush: { RushGame: ObservedRush }, BloomDepths: Depths, BloomPowers: Powers,
    BloomTutorial: require('../tutorial.js'), BloomPetals: require('../petals.js'), BloomScenery: { paint: noop, has: () => true },
    BloomSound: sound || { wake: noop, setEnabled: noop, play: noop }, BloomKeepsakes: Keepsakes,
    BloomArt: { draw: noop, drawFlower: noop, drawMoon: noop, koiFish: noop, drawGarden: noop, drawProjectile: noop, drawParticle: noop, drawSeed: noop, drawPowerIcon: noop, podSlot: () => ({ x: 210, y: 498 }) },
    BloomMeadow: { plots: Garden.plots.map((p, i) => ({ id: p.id, x: 65 + i * 50, y: 150, labelY: 180, accent: p.color })),
      decor: Garden.decor.map((d, i) => ({ id: d.id, x: 40 + i * 60, y: 200, accent: '#ffffff', icon: [40 + i * 60, 190, 40] })),
      friends: Garden.decor.map((d, i) => ({ id: d.friend.id, decorId: d.id, x: 40 + i * 60, y: 180 })), reactSeconds: 1.1,
      drawDecorIcon: noop, drawFriendIcon: noop, draw: noop }
  });
  context.window = context; context.addEventListener = listen(listeners.window);
  if (prefs) {
    context.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios',
      Plugins: { Preferences: { get: async ({ key }) => ({ value: prefs.has(key) ? prefs.get(key) : null }), set: async ({ key, value }) => { prefs.set(key, value); } } } };
    vm.runInContext(nativeSource, context, { filename: 'native.js' });
  }
  vm.runInContext(source, context, { filename: 'app.js' });
  function frame(milliseconds = 17) { now += milliseconds; const fn = nextFrame; assert.equal(typeof fn, 'function'); fn(now); }
  function run(seconds, until) { for (let t = 0; t < seconds; t += .017) { frame(); if (until && until()) return true; } return false; }
  function click(id, dataset) { const target = dataset ? Object.assign(element(), { dataset }) : $(id); $(id).emit('click', { target }); }
  const hide = () => { document.hidden = true; document.visibilityState = 'hidden'; fire('document', 'visibilitychange'); };
  const show = () => { document.hidden = false; document.visibilityState = 'visible'; fire('document', 'visibilitychange'); };
  const saved = () => JSON.parse(storage.get(key));
  return { $, click, frame, run, fire, hide, show, saved, storage, store, document, game: () => games.at(-1) };
}
const plain = value => JSON.parse(JSON.stringify(value));
// The first open, ordinary bud of the board crosses the line on the next frame.
function breach(app) {
  const game = app.game(), bud = game.buds.find(b => !b.bloomed && !b.gift && !b.foe && !b.boss && !b.bossPart && !b.hidden && !b.inert);
  assert(bud, 'a bud to let through'); bud.y = game.dangerY + 2; app.frame();
}
// Blooms the whole wave so the next one loads, then plays until it has.
function nextWave(app) {
  const game = app.game(), wave = game.wave; game.started = true; game.drops = [];
  for (const bud of game.buds.filter(b => !b.bloomed && !b.gift)) { bud.hp = 1; game.bloom(bud); }
  assert(app.run(4, () => game.wave === wave + 1), `wave ${wave + 1} loads`);
}
// Jumps a started run to the start of a later wave, the way test-stage does.
function jump(app, wave) { const game = app.game(); game.started = true; game.wave = wave - 1; game.drops = []; game._loadWave(); app.frame(); }
const playLevel = (app, id) => { app.click('depth-map', { depth: String(id) }); app.frame(); return app.game(); };
// The first seed of the board in play (straight up), as a tap would send it.
const shoot = app => { assert(app.game().fire(0, -1), 'a seed flies'); app.frame(); };
// Taps the board: a finger down and up at one point.
function tap(app, x = 210, y = 200) {
  const event = { isPrimary: true, pointerId: 1, clientX: x, clientY: y };
  app.$('game-canvas').emit('pointerdown', event); app.$('game-canvas').emit('pointerup', event);
}
// A run lost on a late wave, so the result card offers Try from wave 6 (level 3) or Try the boss (two guardian losses).
function lostLate(app, id, wave) {
  const game = playLevel(app, id); game.started = true; jump(app, wave); game._lose();
  assert(app.run(4, () => app.$('result-dialog').open), 'the result shows'); assert.equal(app.$('checkpoint-btn').hidden, false, 'with its retry');
}
const countDone = app => app.run(3, () => app.$('resume-count').hidden);
const seeds = save => Garden.summary(save.garden).seeds;

test('A level run keeps a checkpoint once it is under way: on hide, at each wave start and on a lost life, always with its wave\'s starting points', () => {
  const app = boot(player()), game = playLevel(app, 3);
  assert.equal(game.plan.id, 3);
  assert(!Object.hasOwn(app.saved(), 'run'), 'a level not yet started keeps nothing');
  // Points won during a wave are not kept: the wave is replayed from its start, so they would count twice.
  game.started = true; game.score = 1200; app.hide();
  assert.deepEqual(app.saved().run, { level: 3, wave: 1, lives: 3, score: 0, from: 1, blooms: 0, chain: 0, gift: false }, 'hiding the page keeps wave 1 as it began');
  assert(app.$('pause-dialog').open, 'and the Paused card waits as before');
  app.show(); app.click('pause-resume'); countDone(app);
  nextWave(app);
  const atStart = { score: game.score, blooms: game.bloomedCount, chain: game.bestCombo };
  assert(atStart.score > 1200 && atStart.blooms > 0, 'the first wave scored');
  assert.deepEqual(app.saved().run, { level: 3, wave: 2, lives: 3, score: atStart.score, from: 1, blooms: atStart.blooms, chain: atStart.chain, gift: false }, 'wave 2 starts with a checkpoint');
  game.score += 800;
  breach(app);
  assert.equal(game.lives, 2);
  assert.deepEqual(app.saved().run, { level: 3, wave: 2, lives: 2, score: atStart.score, from: 1, blooms: atStart.blooms, chain: atStart.chain, gift: false }, 'a lost life is kept at once');
});

test('Hiding just after the guardian blooms keeps the win, and hiding just after a wave clears keeps the next wave', () => {
  // The win only comes once the guardian's cascade has bloomed (about a second with the finale). The phone may close
  // the app in that gap, so the hide plays the cascade out and records the win instead of keeping wave 10.
  let app = boot(player({ run: kept({ level: 3, wave: 10, lives: 3, from: 1, score: 9000 }) }, 2));
  app.click('resume-btn'); app.frame(); countDone(app); app.run(4);
  let game = app.game(); const boss = game.buds.find(b => b.boss);
  assert(boss && !boss.bloomed && game.buds.some(b => !b.boss && !b.bloomed && !b.hidden), 'the guardian is up, with flowers left for the cascade');
  boss.hp = 1; game.bloom(boss); app.run(.3);
  assert(game.bossDown && !game.over, 'the guardian is down and the cascade is still blooming');
  app.hide();
  assert.equal(game.status, 'won', 'the hide plays the cascade out');
  assert(!Object.hasOwn(app.saved(), 'run'), 'the kept run is let go');
  assert.equal(app.saved().depths[3].stars, 3, 'the win and its stars are saved');
  assert.equal(app.$('pause-dialog').open, false, 'no Paused card over a beaten guardian');
  app.show(); assert(app.run(4, () => app.$('result-dialog').open), 'coming back shows the result');
  const again = boot(undefined, { storage: new Map(app.storage) });
  assert.equal(again.$('resume-btn').hidden, true, 'a relaunch offers no guardian to fight again');
  // Between a cleared wave and the next (0.7 s), the checkpoint is the next wave's start, points included.
  app = boot(player({}, 2)); game = playLevel(app, 3); shoot(app);
  game.drops = [];
  for (const bud of game.buds.filter(b => !b.bloomed && !b.gift)) { bud.hp = 1; game.bloom(bud); }
  assert(app.run(3, () => game.nextWaveAt !== null), 'wave 1 clears'); assert.equal(game.wave, 1);
  game.waveSpent = { sunburst: 1 };
  app.hide();
  assert.deepEqual(app.saved().run, { level: 3, wave: 2, lives: 3, score: game.score, from: 1, blooms: game.totalBlooms, chain: game.bestCombo, gift: false },
    'wave 2 is kept as it will start, with nothing spent on it');
  assert(game.score > 0);
});
test('Hiding during the guardian\'s cascade can only keep the win: a flower just over the line costs no life or star', () => {
  // The flower farthest from the guardian is the last the cascade reaches; hung just over the line, it would cross
  // before its link blooms it, so a player who stays has to shoot it. The hide must not play that out unattended.
  for (const lives of [3, 1]) {
    const app = boot(player({ run: kept({ level: 1, wave: 10, lives, from: 1, score: 9000 }) }));
    app.click('resume-btn'); app.frame(); countDone(app); app.run(3);
    const game = app.game(), boss = game.buds.find(b => b.boss); game.started = true;
    const low = game.buds.filter(b => !b.boss && !b.bossPart && !b.bloomed && !b.gift && !b.hidden && !b.inert)
      .sort((a, b) => Math.hypot(b.x - boss.x, b.y - boss.y) - Math.hypot(a.x - boss.x, a.y - boss.y))[0];
    low.y = game.dangerY - low.r - 6;
    boss.hp = 1; game.bloom(boss); app.frame();
    const link = game.pending.find(item => item.id === low.id);
    assert(link && link.when - game.time > 6 / (game.descentSpeed * (low.fall || 1)), 'its link comes after it would cross');
    app.hide();
    assert.equal(game.status, 'won', `${lives} lives: the hide keeps the win`);
    assert.equal(game.lives, lives, 'with every life');
    assert.equal(app.saved().depths[1].stars, 3, 'the record keeps its three stars');
    assert(!Object.hasOwn(app.saved(), 'bossLosses') || !app.saved().bossLosses[1], 'no guardian loss is counted');
    assert(!Object.hasOwn(app.saved(), 'run'), 'and the kept run is let go');
    assert.doesNotMatch(app.$('announcement').textContent, /line/, app.$('announcement').textContent);
    app.show(); assert(app.run(4, () => app.$('result-dialog').open), 'coming back shows the result');
    assert.equal(game.stars, Math.min(3, lives));
  }
});
test('A guardian\'s cascade left waiting behind the map is not settled by a hide: its wave-10 run is kept and Resume plays it to the result', () => {
  const app = boot(player({ run: kept({ level: 3, wave: 10, lives: 3, from: 1, score: 9000 }) }, 2));
  app.click('resume-btn'); app.frame(); countDone(app); app.run(4);
  const game = app.game(), boss = game.buds.find(b => b.boss); game.started = true;
  boss.hp = 1; game.bloom(boss); app.run(.3);
  assert(game.bossDown && !game.over);
  app.click('back-btn'); app.frame(); assert.equal(app.document.body.dataset.view, 'levels');
  app.hide();
  assert.equal(game.over, false, 'the board behind the map is not played out');
  assert.equal(app.saved().run.wave, 10, 'the run is kept at wave 10');
  assert.equal(app.saved().depths[3], undefined, 'and nothing is recorded unseen');
  app.show(); app.run(1);
  assert.equal(app.$('resume-title').textContent, 'Resume level 3');
  app.click('resume-btn'); app.frame();
  assert.equal(app.document.body.dataset.view, 'game', 'Resume goes back to the board');
  assert(app.run(8, () => app.$('result-dialog').open), 'and the cascade plays out to the result');
  assert.equal(game.status, 'won'); assert.equal(app.saved().depths[3].stars, 3); assert(!Object.hasOwn(app.saved(), 'run'));
});
test('A run picked up past its level\'s best does not celebrate "New best!" again, and one picked up below it still can', () => {
  const cues = [], sound = { wake() {}, setEnabled() {}, play: name => cues.push(name) };
  // Level 3's best is 3000; the run passed it (and heard "New best!") before the phone closed the app.
  let app = boot(player({ run: kept({ level: 3, wave: 3, lives: 3, score: 7460 }) }), { sound });
  app.click('resume-btn'); app.frame(); countDone(app); app.run(5);
  let game = app.game();
  assert.equal(game.score >= 7460 && game.resumed, true);
  assert.equal(cues.filter(n => n === 'newBest').length, 0, 'no second "New best!" cue');
  assert(!game.floaters.some(f => f.best), 'and no ribbon');
  assert(!app.$('announcement').textContent.includes('New best'), app.$('announcement').textContent);
  assert.equal(app.$('best-value').textContent, '· beaten!', 'the caption still says the best is beaten');
  assert(app.$('score-value').classList.contains('record'), 'and the score stays gold');
  // Picked up below the best, passing it is still news.
  cues.length = 0;
  app = boot(player({ run: kept({ level: 3, wave: 3, lives: 3, score: 2000 }) }), { sound });
  app.click('resume-btn'); app.frame(); countDone(app); app.run(3);
  game = app.game(); assert.equal(cues.filter(n => n === 'newBest').length, 0);
  game.score = 3500; app.run(4);
  assert.equal(cues.filter(n => n === 'newBest').length, 1, 'passing the best plays "New best!" once');
});
test('The checkpoint is let go when the run is won or lost, on Restart and when another run starts, and kept when leaving through Levels', () => {
  const started = app => { const game = playLevel(app, 3); game.started = true; nextWave(app); assert.equal(app.saved().run?.wave, 2); return game; };
  // Levels keeps it, and the map offers this run as before.
  let app = boot(player()); started(app);
  app.click('back-btn'); app.frame();
  assert.equal(app.document.body.dataset.view, 'levels');
  assert.equal(app.saved().run?.wave, 2, 'leaving through Levels keeps it');
  assert.equal(app.$('resume-btn').hidden, false); assert.equal(app.$('resume-title').textContent, 'Resume level 3');
  // Restart (two taps, since the run has progress) starts over and lets it go.
  app.click('resume-btn'); countDone(app);
  app.click('restart-btn'); assert.equal(app.saved().run?.wave, 2, 'the first tap only asks');
  app.click('restart-btn');
  assert(!Object.hasOwn(app.saved(), 'run'), 'Restart lets it go'); assert.equal(app.game().wave, 1);
  // A lost run.
  app = boot(player()); let game = started(app); game._lose(); app.frame();
  assert.equal(game.status, 'lost'); assert(!Object.hasOwn(app.saved(), 'run'), 'a lost run lets it go');
  // A won run.
  app = boot(player()); game = started(app); game._clearLevel(); app.frame();
  assert.equal(game.status, 'won'); assert(!Object.hasOwn(app.saved(), 'run'), 'a won run lets it go');
  // Another run, once its first seed flies: Meadow Rush, a garden puzzle, the daily garden.
  for (const other of ['levels-rush-btn', 'level-grid', 'daily-btn']) {
    app = boot(player({ progress: { 1: { best: 100, stars: 1, attempts: 1 } } })); started(app);
    if (other === 'level-grid') app.click('level-grid', { level: '1' }); else app.click(other);
    app.frame();
    assert.equal(app.saved().run?.wave, 2, `${other}: opening it alone keeps the run`);
    shoot(app);
    assert(!Object.hasOwn(app.saved(), 'run'), `${other}: its first seed lets it go`);
  }
  // Meadow Rush picked up from the board waiting behind the map, after a boot that offered the kept run.
  const storage = new Map(boot(player({ run: kept() })).storage);
  app = boot(undefined, { storage }); assert.equal(app.$('resume-btn').hidden, false);
  app.click('levels-rush-btn'); app.frame();
  assert.equal(app.game().plan, null, 'endless Rush'); assert.deepEqual(app.saved().run, kept(), 'kept while nothing is fired');
  shoot(app); assert(!Object.hasOwn(app.saved(), 'run'), 'Meadow Rush lets it go with its first seed');
  // Restart on the Paused card lets it go too.
  app = boot(player()); started(app); app.click('pause-btn'); assert(app.$('pause-dialog').open);
  app.click('pause-restart'); assert(!Object.hasOwn(app.saved(), 'run'), 'Restart on the Paused card');
  app.click('back-btn'); app.frame(); assert.equal(app.$('resume-btn').hidden, true, 'and the map offers nothing');
});

test('Opening another level or Meadow Rush and going back without firing keeps the run; the map still offers it', () => {
  const storage = new Map(boot(player({ run: kept() })).storage);
  for (const [name, open] of [['level 2', app => playLevel(app, 2)], ['Meadow Rush', app => { app.click('levels-rush-btn'); app.frame(); }], ['level 5\'s free taste', app => playLevel(app, 5)]]) {
    const app = boot(undefined, { storage: new Map(storage) });
    open(app); assert.equal(app.document.body.dataset.view, 'game', `${name} opens`);
    app.hide(); app.show(); // a call while it waits, before any seed
    app.click('back-btn'); app.frame();
    assert.equal(app.document.body.dataset.view, 'levels');
    assert.deepEqual(app.saved().run, kept(), `${name}: kept`);
    assert.equal(app.$('resume-btn').hidden, false, `${name}: still offered`); assert.equal(app.$('resume-title').textContent, 'Resume level 3');
    app.click('resume-btn'); app.frame();
    assert.deepEqual([app.game().plan?.id, app.game().wave, app.game().lives], [3, 8, 2], `${name}: and picked up`);
  }
  // Restarting that other board before its first seed leaves the kept run alone too.
  let app = boot(undefined, { storage: new Map(storage) }); playLevel(app, 2);
  app.click('restart-btn'); app.frame(); assert.equal(app.game().plan.id, 2, 'level 2 starts over');
  assert.deepEqual(app.saved().run, kept(), 'the kept run stays');
  // Another level's first seed starts that run in its place, and Restart then lets that one go.
  app = boot(undefined, { storage: new Map(storage) }); playLevel(app, 2); shoot(app);
  assert.deepEqual([app.saved().run.level, app.saved().run.wave, app.saved().run.lives], [2, 1, 3], 'level 2 is the run now');
  app.game().score = 0; app.click('restart-btn'); assert(!Object.hasOwn(app.saved(), 'run'), 'Restart lets level 2\'s run go');
});

test('Booting again shows "Resume level N" with its wave; tapping it starts that wave with the lives, points, blooms and chain it kept, and counts in', () => {
  let app = boot(player()); const before = playLevel(app, 3);
  before.started = true; nextWave(app); jump(app, 8); breach(app);
  const run = app.saved().run;
  assert.deepEqual({ level: run.level, wave: run.wave, lives: run.lives, from: run.from }, { level: 3, wave: 8, lives: 2, from: 1 });
  before.score += 999; app.fire('window', 'pagehide');
  assert.deepEqual(app.saved().run, run, 'pagehide keeps the same checkpoint: the wave\'s own points wait');
  // The phone closes the app; the next launch opens on the map.
  app = boot(undefined, { storage: new Map(app.storage) });
  assert.equal(app.document.body.dataset.view, 'levels');
  assert.equal(app.$('resume-btn').hidden, false, 'the resume card shows');
  assert.equal(app.$('resume-title').textContent, 'Resume level 3');
  assert.equal(app.$('resume-sub').textContent, `${Depths.level(3).name} · wave 8 of 10`);
  app.click('resume-btn'); app.frame();
  const game = app.game();
  assert.equal(app.document.body.dataset.view, 'game');
  assert.deepEqual({ level: game.plan.id, wave: game.wave, lives: game.lives, score: game.score, blooms: game.bloomedCount, chain: game.bestCombo, startWave: game.startWave, started: game.started },
    { level: 3, wave: 8, lives: 2, score: run.score, blooms: run.blooms, chain: run.chain, startWave: 1, started: true });
  assert.deepEqual(game.buds.map(b => b.id).sort(), Depths.wave(3, 8).buds.map(b => b.id).sort(), 'the start of wave 8');
  assert.equal(app.$('score-value').textContent.replace(/\D/g, ''), String(run.score), 'the score shows at once');
  // It counts in like any resume: nothing moves until the count is done.
  assert.equal(app.$('resume-count').hidden, false); assert.equal(app.$('resume-number').textContent, '3');
  const time = game.time; app.run(1);
  assert.equal(game.time, time, 'the board waits during the count');
  assert(countDone(app), 'the count ends'); app.run(.5);
  assert(game.time > time, 'then play goes on');
  assert.deepEqual(app.saved().run, run, 'the checkpoint stays while it is played');
  // Tapping the level's own card on the map picks it up the same way.
  app = boot(undefined, { storage: new Map(boot(player({ run: kept({ wave: 5 }) })).storage) });
  playLevel(app, 3);
  assert.deepEqual([app.game().wave, app.game().lives, app.game().score], [5, 2, 4321], 'the card resumes it too');
});

test('Stars follow where the run first began: resumed, a wave-1 run can still earn three, a wave-6 run two at most, a guardian-only run one', () => {
  for (const [from, stars] of [[1, 3], [6, 2], [10, 1]]) {
    const app = boot(player({ run: kept({ level: 3, wave: 10, lives: 3, score: 5000, from, blooms: 120, chain: 12 }) }, 2));
    const had = seeds(app.saved());
    app.click('resume-btn'); app.frame(); countDone(app);
    const game = app.game(), boss = game.buds.find(b => b.boss);
    assert.equal(game.wave, 10); assert.equal(game.startWave, from);
    assert(boss && boss.hp === boss.maxHp && game.bossReached, 'wave 10 starts the guardian fight from the beginning');
    game._clearLevel(); app.frame();
    assert.equal(game.stars, stars, `from wave ${from}`);
    const after = app.saved();
    assert.equal(after.depths[3].stars, stars, `wave ${from} records ${stars}`);
    // Seeds count the blooms and every wave from the run's own start, plus the first-clear reward once.
    const expected = Math.min(Garden.depths.runCap, Math.floor(120 / 10) + (10 - from + 1) - 1) + 8 + (stars - 1) * 2;
    assert.equal(seeds(after) - had, expected, `seeds from wave ${from}`);
    assert(!Object.hasOwn(after, 'run'));
  }
  // Lives still cap the stars of a wave-1 run.
  const app = boot(player({ run: kept({ level: 3, wave: 9, lives: 2, from: 1 }) }, 2));
  app.click('resume-btn'); app.frame(); countDone(app); app.game()._clearLevel(); app.frame();
  assert.equal(app.saved().depths[3].stars, 2);
});

test('A resumed guardian fight that is lost counts one loss, and a resumed wave does not offer its gift a second time', () => {
  const store = fakeStore({ owned: true });
  let app = boot(player({ run: kept({ level: 6, wave: 10, lives: 1, from: 1 }) }, 5), { store });
  app.click('resume-btn'); app.frame(); countDone(app);
  assert.equal(app.game().plan.id, 6); assert.equal(app.game().wave, 10);
  app.game()._lose(); app.frame();
  assert.deepEqual(plain(app.saved().bossLosses), { 6: 1 }, 'one loss');
  // A gift shows on wave 2: the checkpoint says so, and the wave picked up again has none.
  app = boot(player()); const game = playLevel(app, 3); game.started = true; nextWave(app);
  assert.equal(app.saved().run.gift, false);
  game.giftAt = 0; assert(app.run(2, () => game.buds.some(b => b.gift)), 'the gift bubble shows');
  assert.equal(app.saved().run.gift, true, 'the checkpoint knows');
  app = boot(undefined, { storage: new Map(app.storage) });
  app.click('resume-btn'); app.frame(); countDone(app);
  assert.equal(app.game().wave, 2); assert.equal(app.game().giftAt, null, 'no second gift');
  app.run(6); assert(!app.game().buds.some(b => b.gift), 'none floats in');
  // A wave whose gift had not shown yet still has it.
  app = boot(player({ run: kept({ wave: 2, gift: false }) }));
  app.click('resume-btn'); app.frame();
  assert(app.game().giftAt !== null, 'the gift is still to come');
});

test('Only a well-formed checkpoint is kept: each damaged one is dropped and nothing is offered', () => {
  const good = boot(player({ run: kept() }));
  assert.deepEqual(good.saved().run, kept(), 'a good one is kept'); assert.equal(good.$('resume-btn').hidden, false);
  assert.deepEqual(boot(player({ run: kept({ spent: { lullaby: 2, beeline: 1 } }) })).saved().run, kept({ spent: { lullaby: 2, beeline: 1 } }), 'with what its wave spent');
  assert.deepEqual(boot(player({ run: kept({ spent: {} }) })).saved().run, kept(), 'an empty spent is left out');
  const damaged = [['not an object', 'run'], ['a list', [3, 8]], ['null', null], ['no level', kept({ level: undefined })], ['level 0', kept({ level: 0 })], ['level 11', kept({ level: 11 })],
    ['level as text', kept({ level: '3' })], ['wave 0', kept({ wave: 0 })], ['wave 11', kept({ wave: 11 })], ['half a wave', kept({ wave: 2.5 })],
    ['no lives', kept({ lives: 0 })], ['four lives', kept({ lives: 4 })], ['lives as text', kept({ lives: '2' })], ['negative score', kept({ score: -1 })],
    ['score not a number', kept({ score: NaN })], ['score as text', kept({ score: '4321' })], ['score infinite', kept({ score: 1e400 })], ['from 0', kept({ from: 0 })], ['from 11', kept({ from: 11 })],
    ['from past the wave', kept({ wave: 4, from: 6 })], ['no from', kept({ from: undefined })], ['negative blooms', kept({ blooms: -3 })], ['half a bloom', kept({ blooms: 1.5 })],
    ['no chain', kept({ chain: undefined })], ['gift as text', kept({ gift: 'yes' })], ['no gift', kept({ gift: undefined })],
    ['spent null', kept({ spent: null })], ['spent as text', kept({ spent: 'lullaby' })], ['spent a list', kept({ spent: ['lullaby'] })],
    ['spent an unknown power', kept({ spent: { rocket: 1 } })], ['spent none of one', kept({ spent: { lullaby: 0 } })], ['spent half of one', kept({ spent: { lullaby: .5 } })],
    ['spent as text count', kept({ spent: { lullaby: '1' } })], ['spent too many', kept({ spent: { lullaby: Powers.max + 1 } })]];
  for (const [name, run] of damaged) {
    const app = boot(player({ run }));
    assert(!Object.hasOwn(app.saved(), 'run'), `${name}: dropped`);
    assert.equal(app.$('resume-btn').hidden, true, `${name}: not offered`);
  }
});

test('An old save loads unchanged, and the checkpoint only ever adds run', () => {
  const old = { version: 1, progress: { 1: { best: 1234, stars: 3, attempts: 2 } }, daily: { 'daily-2026-10-01': { best: 1350, stars: 2, attempts: 1 } },
    rush: { best: 2100, bestWave: 3, runs: 5, blooms: 25 }, depths: { 1: { stars: 2, best: 900, wave: 10 } }, bossLosses: { 5: 2 }, lastLevel: 1, powersMet: true, settings: { sound: false, haptics: false, motion: false } };
  const app = boot(old), loaded = app.saved();
  assert(!Object.hasOwn(loaded, 'run'), 'nothing new appears');
  for (const key of ['progress', 'daily', 'rush', 'depths', 'bossLosses', 'lastLevel', 'powersMet']) assert.deepEqual(loaded[key], old[key], key);
  for (const key of ['sound', 'haptics', 'motion']) assert.equal(loaded.settings[key], old.settings[key]);
  assert.equal(app.$('resume-btn').hidden, true);
  const game = playLevel(app, 2); game.started = true; nextWave(app);
  const after = app.saved();
  assert.deepEqual(after.run, { level: 2, wave: 2, lives: 3, score: game.score, from: 1, blooms: game.bloomedCount, chain: game.bestCombo, gift: false });
  delete after.run;
  // Playing the level also adds the pieces it showed to Who's who (save.met); that list only ever grows.
  assert((loaded.met || []).every(id => after.met.includes(id)), "Who's who keeps every piece it had");
  const before = { ...loaded }; delete before.met; delete after.met;
  assert.deepEqual(after, before, 'everything else is as it loaded');
});

test('A checkpoint for a level that is locked or not owned is not offered and is let go; one the store has yet to confirm waits for its answer', () => {
  // Level 3 with level 2 not cleared.
  let app = boot(player({ run: kept() }, 1));
  assert.equal(app.$('resume-btn').hidden, true, 'a locked level is not offered'); assert(!Object.hasOwn(app.saved(), 'run'), 'and let go');
  // Level 6 without the unlock.
  app = boot(player({ run: kept({ level: 6 }) }, 5));
  assert.equal(app.$('resume-btn').hidden, true, 'a level not owned is not offered'); assert(!Object.hasOwn(app.saved(), 'run'));
  app = boot(player({ run: kept({ level: 6 }) }, 5), { store: fakeStore({ owned: false }) });
  assert.equal(app.$('resume-btn').hidden, true, 'nor when the store says it is not owned'); assert(!Object.hasOwn(app.saved(), 'run'));
  // Owned and open, it is offered.
  app = boot(player({ run: kept({ level: 6 }) }, 5), { store: fakeStore({ owned: true }) });
  assert.equal(app.$('resume-btn').hidden, false); assert.equal(app.$('resume-title').textContent, 'Resume level 6');
  // While the store is still answering (every first paint in the app), the card shows as it was, so the map does not
  // jump when the answer comes. It is only picked up once the level is known to be owned.
  let store = fakeStore({ owned: false, ready: false });
  app = boot(player({ run: kept({ level: 6 }) }, 5), { store });
  assert.equal(app.$('resume-btn').hidden, false, 'shown at once'); assert.equal(app.$('resume-title').textContent, 'Resume level 6');
  assert.deepEqual(app.saved().run, kept({ level: 6 }), 'and kept');
  app.click('resume-btn'); app.frame();
  assert.equal(app.document.body.dataset.view, 'levels', 'not played before the level is known to be owned');
  assert.equal(app.$('toast').textContent, 'Checking your levels. Try again in a moment.');
  store.owned = true; // the store's own last answer, read as it starts
  app.click('resume-btn'); app.frame(); assert.deepEqual([app.game().plan.id, app.game().wave], [6, 8], 'picked up once it is');
  store.answer(true); assert.deepEqual(app.saved().run.level, 6);
  // The answer says not owned: the card goes and the run is let go.
  store = fakeStore({ owned: false, ready: false });
  app = boot(player({ run: kept({ level: 6 }) }, 5), { store });
  assert.equal(app.$('resume-btn').hidden, false);
  store.answer(false);
  assert.equal(app.$('resume-btn').hidden, true, 'gone once the store says it is not owned'); assert(!Object.hasOwn(app.saved(), 'run'));
});

test('The free taste, the tutorial and the all-levels preview keep no checkpoint; an ordinary level run does', () => {
  let app = boot(player()); let game = playLevel(app, 3); game.started = true; nextWave(app);
  assert.equal(app.saved().run?.level, 3, 'an ordinary run keeps one');
  // The free first waves of level 5 (levels 1 to 4 cleared, the unlock not owned).
  app = boot(player()); game = playLevel(app, 5);
  assert(game.plan.taste, 'the taste'); game.started = true; nextWave(app); breach(app); app.hide();
  assert(!Object.hasOwn(app.saved(), 'run'), 'the taste keeps none');
  // The tutorial.
  app = boot(player({ tutorial: false, powersMet: false, depths: {} }));
  assert(app.game().scripted, 'the tutorial'); app.game().started = true; app.hide();
  assert(!Object.hasOwn(app.saved(), 'run'), 'the tutorial keeps none');
  // The all-levels preview (and its boss preview) keep none, and do not offer or drop one from ?qa play.
  for (const search of ['?alllevels', '?alllevels&bosses']) {
    app = boot(player({ run: kept() }), { search });
    assert.equal(app.$('resume-btn').hidden, true, `${search}: not offered`);
    game = playLevel(app, 7); game.started = true; game.score = 50; if (game.wave < 10) jump(app, game.wave + 1); breach(app); app.hide();
    assert.equal(game.wave, search.includes('bosses') ? 10 : 2);
    assert.deepEqual(app.saved().run, kept(), `${search}: keeps none of its own and leaves the ?qa one alone`);
  }
});

test('Meadow Rush is not resumed, but hiding the page keeps a new best and wave at once; the result still says "New best!"', () => {
  for (const how of ['pagehide', 'visibilitychange']) {
    const app = boot(player({ rush: { best: 1000, bestWave: 3, runs: 2, blooms: 40 } }));
    app.click('levels-rush-btn'); app.frame();
    const game = app.game(); assert.equal(game.plan, null);
    game.started = true; game.score = 5000; game.wave = 6;
    if (how === 'pagehide') app.fire('window', 'pagehide'); else app.hide();
    const rush = app.saved().rush;
    assert.deepEqual([rush.best, rush.bestWave, rush.runs], [5000, 6, 2], `${how}: the best and wave are kept, and no run is counted`);
    assert(!Object.hasOwn(app.saved(), 'run'), 'endless Rush keeps no checkpoint');
    // Back in the app, the run ends: it is still a new best.
    app.show(); app.click('pause-resume'); countDone(app);
    game._lose(); assert(app.run(4, () => app.$('result-dialog').open), 'the result shows');
    assert.equal(app.$('result-eyebrow').textContent, 'New best!');
    assert.deepEqual([app.saved().rush.best, app.saved().rush.runs], [5000, 3]);
  }
  // A run that has not passed the best saves nothing new.
  const app = boot(player({ rush: { best: 9000, bestWave: 9, runs: 2, blooms: 40 } }));
  app.click('levels-rush-btn'); app.frame(); app.game().started = true; app.game().score = 500; app.hide();
  assert.deepEqual(plain(app.saved().rush), { best: 9000, bestWave: 9, runs: 2, blooms: 40 });
});

test('A run keeps its checkpoint from its first seed, and Try from wave 6 and Try the boss keep theirs as the board opens', () => {
  // Wave 1: opening the board keeps nothing (it may be a peek); the first seed keeps it, with no hide or wave to wait for.
  let app = boot(player()); playLevel(app, 3);
  assert(!Object.hasOwn(app.saved(), 'run'), 'not as the board opens');
  shoot(app);
  assert.deepEqual(app.saved().run, { level: 3, wave: 1, lives: 3, score: 0, from: 1, blooms: 0, chain: 0, gift: false }, 'the first seed keeps wave 1');
  // Try from wave 6 after losing level 3 on wave 8, and Try the boss on level 6 after two guardian losses.
  for (const [id, cleared, wave, extra, store, from] of [[3, 4, 8, {}, null, 6], [6, 5, 10, { bossLosses: { 6: 2 } }, fakeStore({ owned: true }), 10]]) {
    app = boot(player(extra, cleared), { store }); lostLate(app, id, wave);
    assert(!Object.hasOwn(app.saved(), 'run'), 'the lost run is let go');
    app.click('checkpoint-btn'); app.frame();
    assert.deepEqual([app.game().wave, app.game().startWave, app.game().started], [from, from, false]);
    assert.deepEqual(app.saved().run, { level: id, wave: from, lives: 3, score: 0, from, blooms: 0, chain: 0, gift: false }, `wave ${from}: kept as it opens`);
    // The battery dies before the first seed (no hide event): the next launch offers that start, with the same star cap.
    const again = boot(undefined, { storage: new Map(app.storage), store });
    assert.equal(again.$('resume-btn').hidden, false, `wave ${from}: offered`);
    assert.equal(again.$('resume-sub').textContent, `${Depths.level(id).name} · wave ${from} of 10`);
    again.click('resume-btn'); again.frame();
    assert.deepEqual([again.game().plan.id, again.game().wave, again.game().startWave, again.game().lives], [id, from, from, 3]);
  }
});

test('A run picked up after a relaunch shows its board through the count, with no opening curtain, and the first tap after it fires', () => {
  for (const wave of [8, 10]) {
    const app = boot(player({ run: kept({ wave }) }));
    app.click('resume-btn'); app.frame();
    const game = app.game();
    assert(game.stage && game.time - game.stage.introAt >= .6, `wave ${wave}: no curtain over the count`);
    assert(!game.floaters.some(item => item.intro), `wave ${wave}: no level title over the board`);
    if (wave < 10) assert(game.floaters.some(item => item.kind === 'title' && item.size === 'small' && item.text === `Wave ${wave} of 10`), 'the wave ribbon says where it picks up');
    else assert(game.buds.some(bud => bud.boss), 'the guardian is there to land');
    assert(countDone(app), 'the count ends');
    const shots = game.shotNumber; tap(app); app.frame();
    assert.equal(game.shotNumber, shots + 1, `wave ${wave}: the first tap after the count fires`);
  }
  // A level opened fresh still opens on its curtain, which holds taps for its first moment.
  const app = boot(player()), game = playLevel(app, 3); app.frame();
  assert(game.stage && game.time - game.stage.introAt < .6, 'a fresh level has its curtain');
  assert(game.floaters.some(item => item.intro), 'and its title');
});

test('The Resume card wakes the sound, so the count and the level are heard after a relaunch', () => {
  let woke = 0; const heard = [];
  const sound = { wake: () => { woke++; }, setEnabled: () => {}, play: type => { heard.push(woke ? type : `${type} (asleep)`); } };
  const app = boot(player({ run: kept() }), { sound });
  woke = 0; heard.length = 0; // the relaunch: nothing tapped yet
  app.click('resume-btn'); app.frame(); countDone(app); app.run(1);
  assert(woke >= 1, 'the tap wakes it');
  assert(heard.includes('tap'), 'the count ticks'); assert(heard.every(type => !type.endsWith('(asleep)')), `nothing is lost: ${heard.join(', ')}`);
});

test('In the app, the save made as the page hides reaches the phone\'s preferences at once, not on a timer', async () => {
  const settle = () => new Promise(resolve => setImmediate(resolve));
  // Meadow Rush: a new best kept as the home button is pressed.
  let prefs = new Map(), storage = new Map([['bloomshot.native.synced.v1', '1']]);
  let app = boot(player({ rush: { best: 1000, bestWave: 3, runs: 2, blooms: 40 } }), { storage, prefs }); await settle();
  app.click('levels-rush-btn'); app.frame();
  const game = app.game(); game.started = true; game.score = 5000; game.wave = 6;
  app.hide(); await settle();
  assert.equal(app.saved().rush.best, 5000, 'kept on the device');
  assert.deepEqual([JSON.parse(prefs.get(MAIN)).rush.best, JSON.parse(prefs.get(MAIN)).rush.bestWave], [5000, 6], 'and in the phone\'s preferences');
  // A level run when only pagehide comes (native.js does not listen for it).
  prefs = new Map(); storage = new Map([['bloomshot.native.synced.v1', '1']]);
  app = boot(player(), { storage, prefs }); await settle();
  playLevel(app, 3); shoot(app);
  app.fire('window', 'pagehide'); await settle();
  assert.equal(JSON.parse(prefs.get(MAIN) || '{}').run?.level, 3, 'the checkpoint is in the phone\'s preferences');
});

test('Powerups spent on a wave come back when the phone closes the app and that wave is played again; a cleared wave keeps them spent', () => {
  const bag = { sunburst: 1, dandelion: 1, beeline: 1, lullaby: 1 };
  let app = boot(player({ powers: bag })); const game = playLevel(app, 3); shoot(app); nextWave(app);
  app.click('power-right', { power: 'lullaby' }); app.frame();
  app.click('power-left', { power: 'sunburst' }); app.run(.5); shoot(app);
  assert.deepEqual([app.saved().powers.lullaby, app.saved().powers.sunburst], [0, 0], 'both spent');
  assert.deepEqual(plain(app.saved().run.spent), { lullaby: 1, sunburst: 1 }, 'and kept with the wave in the same save');
  assert.equal(app.saved().run.wave, 2);
  // The phone closes the app. Picking wave 2 up again gives them back, once.
  app = boot(undefined, { storage: new Map(app.storage) });
  app.click('resume-btn'); app.frame();
  assert.deepEqual([app.game().wave, app.saved().powers.lullaby, app.saved().powers.sunburst], [2, 1, 1], 'back for the wave played again');
  assert(!Object.hasOwn(app.saved().run, 'spent'), 'and no longer owed');
  app = boot(undefined, { storage: new Map(app.storage) });
  app.click('resume-btn'); app.frame();
  assert.deepEqual([app.saved().powers.lullaby, app.saved().powers.sunburst], [1, 1], 'a second relaunch gives nothing more');
  // A wave played through keeps what it spent: the next wave's checkpoint owes nothing.
  app = boot(player({ powers: bag })); playLevel(app, 3); shoot(app);
  app.click('power-right', { power: 'lullaby' }); app.frame();
  assert.deepEqual(plain(app.saved().run.spent), { lullaby: 1 });
  app.game().lullaby = 0; nextWave(app);
  assert.equal(app.saved().run.wave, 2); assert(!Object.hasOwn(app.saved().run, 'spent'), 'wave 2 owes nothing');
  assert.equal(app.saved().powers.lullaby, 0);
  // Meadow Rush keeps no checkpoint, so what it spends is simply spent.
  app = boot(player({ powers: bag })); app.click('levels-rush-btn'); app.frame(); shoot(app);
  app.click('power-right', { power: 'lullaby' }); app.frame();
  assert.equal(app.saved().powers.lullaby, 0); assert(!Object.hasOwn(app.saved(), 'run'));
});

test('A world preview leaves the kept run alone, even when a seed is fired in it', () => {
  const worlds = [...Levels.worlds, { id: 'fern', name: 'Fern Hollow', tagline: 'Soon.', description: 'Soon.', price: 0, theme: 'meadow', available: false, mechanic: 'Soon.' }];
  const app = boot(player({ run: kept() }), { worlds });
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'fern' }); assert(app.$('world-dialog').open, 'the world card opens');
  app.click('world-preview-btn'); app.frame();
  assert.equal(app.document.body.dataset.view, 'game', 'the preview board');
  shoot(app); app.hide(); app.show();
  assert.deepEqual(app.saved().run, kept(), 'kept through the preview');
  app.click('back-btn'); app.click('rush-btn'); app.frame();
  assert.equal(app.document.body.dataset.view, 'levels');
  assert.equal(app.$('resume-btn').hidden, false); assert.equal(app.$('resume-title').textContent, 'Resume level 3');
});

test('The kept level\'s own card says Resume, and picking a run up says where it is and the lives left', () => {
  const card = (app, id) => app.$('depth-map').innerHTML.split('<li').find(item => item.includes(`data-depth="${id}"`));
  let app = boot(player({ run: kept() }, 2));
  assert.match(card(app, 3), /<span class="depth-go">Resume<\/span>/, 'the next level\'s pill says Resume');
  assert.match(card(app, 3), /Resume wave 8 of 10\./, 'and its label says so');
  app.click('resume-btn'); app.frame();
  assert.equal(app.$('announcement').textContent, 'Level 3 · wave 8 of 10. 2 lives left. Get ready. 3, 2, 1.');
  // A cleared level holding the run says Resume in place of its stars (a tap there picks the run up), while the next
  // level still says Play.
  app = boot(player({ run: kept({ level: 1, wave: 8 }) }, 2));
  assert.match(card(app, 1), /<span class="depth-go">Resume<\/span>/, 'the cleared level\'s card says Resume');
  assert.doesNotMatch(card(app, 1), /depth-stars/, 'in place of its stars'); assert.match(card(app, 1), /3 of 3 stars\. Resume wave 8 of 10\./);
  assert.match(card(app, 3), /<span class="depth-go">Play<\/span>/);
  app.click('depth-map', { depth: '1' }); app.frame();
  assert.equal(app.game().wave, 8, 'and tapping it picks the run up');
  // A level with no run says Play, as before.
  app = boot(player({}, 2));
  assert.match(card(app, 3), /<span class="depth-go">Play<\/span>/);
  assert.match(card(app, 1), /depth-stars/, 'and a cleared one shows its stars');
  // A run left a moment ago through Levels reads the same.
  const game = playLevel(app, 3); shoot(app); nextWave(app); app.click('back-btn'); app.frame();
  assert.match(card(app, 3), /<span class="depth-go">Resume<\/span>/);
  app.click('resume-btn'); app.frame();
  assert.equal(app.$('announcement').textContent, `Level 3 · wave 2 of 10. ${game.lives} lives left. Get ready. 3, 2, 1.`);
});
test('A run picked up after a relaunch says its wave\'s hint (and the guardian\'s name) with where it is, and a foe\'s same tip is not told again', () => {
  const hint = (level, wave) => Depths.wave(level, wave).hint;
  let app = boot(player({ run: kept({ level: 1, wave: 3, lives: 1 }) }));
  app.click('resume-btn'); app.frame();
  assert.equal(app.$('announcement').textContent, `Level 1 · wave 3 of 10. ${hint(1, 3)} 1 life left. Get ready. 3, 2, 1.`);
  app = boot(player({ run: kept({ level: 3, wave: 10 }) }, 2));
  app.click('resume-btn'); app.frame();
  assert.equal(app.$('announcement').textContent, `Level 3 · wave 10 of 10. Mother Morel! ${hint(3, 10)} 2 lives left. Get ready. 3, 2, 1.`);
  // Level 3 wave 6's hint is the inkcap's own first tip: said with the pickup, it is not shown or said again after the count.
  app = boot(player({ run: kept({ level: 3, wave: 6 }) }));
  app.click('resume-btn'); app.frame();
  assert(app.$('announcement').textContent.includes(hint(3, 6)));
  const toasts = [];
  for (let i = 0; i < 300; i++) { app.frame(); if (app.$('toast').textContent && toasts.at(-1) !== app.$('toast').textContent) toasts.push(app.$('toast').textContent); }
  assert(!toasts.includes(hint(3, 6)), `the inkcap's tip is not repeated: ${JSON.stringify(toasts)}`);
  assert(toasts.some(text => /fibcap/i.test(text)), `another foe's first tip still shows: ${JSON.stringify(toasts)}`);
});

(async () => {
  for (const { name, fn } of tests) {
    try { await fn(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.stack }); }
  }
  const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.failed ? 1 : 0;
})();
