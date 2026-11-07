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
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
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
function boot(raw, { search = '', store = null, storage = new Map() } = {}) {
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
  const document = { getElementById: $, createElement: () => element(), body: element('body'), hidden: false, addEventListener: listen(listeners.document) };
  class ObservedGame extends Engine.Game { constructor(level) { super(level); games.push(this); } }
  class ObservedRush extends Rush.RushGame { constructor(options) { super(options); games.push(this); } }
  const context = vm.createContext({ console, structuredClone, URLSearchParams, Date, Math, Map, Set,
    document, location: { search, reload: noop }, navigator: {}, crypto: { randomUUID: () => 'run' },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => { storage.set(name, value); } },
    performance: { now: () => now }, devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout: () => 1, clearTimeout: noop,
    BloomLevels: Levels, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: QuietGoals, ...(store ? { BloomStore: store } : {}),
    BloomEngine: { ...Engine, Game: ObservedGame }, BloomRush: { RushGame: ObservedRush }, BloomDepths: Depths, BloomPowers: Powers,
    BloomTutorial: require('../tutorial.js'), BloomPetals: require('../petals.js'), BloomScenery: { paint: noop, has: () => true },
    BloomSound: { wake: noop, setEnabled: noop, play: noop }, BloomKeepsakes: Keepsakes,
    BloomArt: { draw: noop, drawFlower: noop, drawMoon: noop, koiFish: noop, drawGarden: noop, drawProjectile: noop, drawParticle: noop, drawSeed: noop, drawPowerIcon: noop, podSlot: () => ({ x: 210, y: 498 }) },
    BloomMeadow: { plots: Garden.plots.map((p, i) => ({ id: p.id, x: 65 + i * 50, y: 150, labelY: 180, accent: p.color })),
      decor: Garden.decor.map((d, i) => ({ id: d.id, x: 40 + i * 60, y: 200, accent: '#ffffff', icon: [40 + i * 60, 190, 40] })),
      friends: Garden.decor.map((d, i) => ({ id: d.friend.id, decorId: d.id, x: 40 + i * 60, y: 180 })), reactSeconds: 1.1,
      drawDecorIcon: noop, drawFriendIcon: noop, draw: noop }
  });
  context.window = context; context.addEventListener = listen(listeners.window);
  vm.runInContext(source, context, { filename: 'app.js' });
  function frame(milliseconds = 17) { now += milliseconds; const fn = nextFrame; assert.equal(typeof fn, 'function'); fn(now); }
  function run(seconds, until) { for (let t = 0; t < seconds; t += .017) { frame(); if (until && until()) return true; } return false; }
  function click(id, dataset) { const target = dataset ? Object.assign(element(), { dataset }) : $(id); $(id).emit('click', { target }); }
  const hide = () => { document.hidden = true; fire('document', 'visibilitychange'); };
  const show = () => { document.hidden = false; fire('document', 'visibilitychange'); };
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
  // Another run: Meadow Rush, a garden puzzle, the daily garden.
  for (const other of ['levels-rush-btn', 'level-grid', 'daily-btn']) {
    app = boot(player({ progress: { 1: { best: 100, stars: 1, attempts: 1 } } })); started(app);
    if (other === 'level-grid') app.click('level-grid', { level: '1' }); else app.click(other);
    app.frame();
    assert(!Object.hasOwn(app.saved(), 'run'), `${other} lets it go`);
  }
  // Meadow Rush picked up from the board waiting behind the map, after a boot that offered the kept run.
  const storage = new Map(boot(player({ run: kept() })).storage);
  app = boot(undefined, { storage }); assert.equal(app.$('resume-btn').hidden, false);
  app.click('levels-rush-btn'); app.frame();
  assert.equal(app.game().plan, null, 'endless Rush'); assert(!Object.hasOwn(app.saved(), 'run'), 'Meadow Rush lets it go');
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
  const damaged = [['not an object', 'run'], ['a list', [3, 8]], ['null', null], ['no level', kept({ level: undefined })], ['level 0', kept({ level: 0 })], ['level 11', kept({ level: 11 })],
    ['level as text', kept({ level: '3' })], ['wave 0', kept({ wave: 0 })], ['wave 11', kept({ wave: 11 })], ['half a wave', kept({ wave: 2.5 })],
    ['no lives', kept({ lives: 0 })], ['four lives', kept({ lives: 4 })], ['lives as text', kept({ lives: '2' })], ['negative score', kept({ score: -1 })],
    ['score not a number', kept({ score: NaN })], ['score as text', kept({ score: '4321' })], ['score infinite', kept({ score: 1e400 })], ['from 0', kept({ from: 0 })], ['from 11', kept({ from: 11 })],
    ['from past the wave', kept({ wave: 4, from: 6 })], ['no from', kept({ from: undefined })], ['negative blooms', kept({ blooms: -3 })], ['half a bloom', kept({ blooms: 1.5 })],
    ['no chain', kept({ chain: undefined })], ['gift as text', kept({ gift: 'yes' })], ['no gift', kept({ gift: undefined })]];
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
  assert.deepEqual(after, loaded, 'everything else is as it loaded');
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
  // While the store is still answering, it is not offered and not lost; the answer brings it back.
  const store = fakeStore({ owned: false, ready: false });
  app = boot(player({ run: kept({ level: 6 }) }, 5), { store });
  assert.equal(app.$('resume-btn').hidden, true, 'not offered yet'); assert.deepEqual(app.saved().run, kept({ level: 6 }), 'but kept');
  store.answer(true);
  assert.equal(app.$('resume-btn').hidden, false, 'offered once the store says it is owned');
  app.click('resume-btn'); app.frame(); assert.deepEqual([app.game().plan.id, app.game().wave], [6, 8]);
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

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
