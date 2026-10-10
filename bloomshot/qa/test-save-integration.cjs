'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Garden = require('../garden.js');
const Goals = require('../goals.js');
// Daily goals change with the date and pay their own seeds, so most tests keep them quiet; goal tests opt in.
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
// Flows that wait on the store or the share sheet run one after another once the synchronous tests are done.
const later = [];
function testAsync(name, fn) { later.push({ name, fn }); }
const settled = () => new Promise(resolve => setTimeout(resolve, 0));
const clone = value => JSON.parse(JSON.stringify(value));
function legacySave() {
  return { version: 1, progress: { 1: { best: 1234, stars: 3, attempts: 2 }, 2: { best: 5678, stars: 2, attempts: 5 } },
    daily: { 'daily-2026-10-01': { best: 1350, stars: 2, attempts: 1 } },
    rush: { best: 2100, bestWave: 3, runs: 5, blooms: 25 }, lastLevel: 2,
    settings: { sound: false, haptics: false, motion: false } };
}
// Future worlds still open as visual previews; one is added here so that path stays covered.
const FUTURE = { id: 'orchard', name: 'Night Orchard', tagline: 'Soon.', description: 'A future garden.', price: null, theme: 'moon', available: false, mechanic: 'Planned.' };
const BUNDLE = 'bloomshot.bundle.complete1';
// Mirrors store.js: a product grants one or more entitlements; owned means all of them, partial means some.
// Powerups are consumables: the store hands each purchase to the game's grant handler, then reports it, in the
// real store's shape: `items` lists [{ power, count }]; `power` is set only for one kind, and `count` is the total.
function fakeStore({ owned = [], live = false, available = false, price = '$4.99', stylePrice = '$1.99', bundlePrice = '$6.99', levelsPrice = '$2.99', amounts = [4.99, 1.99, 6.99, 2.99], currency = 'USD', mode = 'native', powers = false, powerPrice = '$0.25' } = {}) {
  const have = new Set(owned), listeners = [], purchases = [];
  let grant = null, serial = 0;
  const consumables = powers ? [...Powers.list.map(p => ({ id: p.product, entitlements: [], kind: 'power', consumable: true, power: p.id, count: 1, price: powerPrice, amount: .25, currency })),
    ...Powers.packs.map(p => ({ id: p.product, entitlements: [], kind: 'power', consumable: true, power: p.single, count: Object.values(p.contents).reduce((n, c) => n + c, 0), items: Object.entries(p.contents).map(([power, count]) => ({ power, count })), price: p.single ? '$0.99' : '$1.99', amount: p.single ? .99 : 1.99, currency }))] : [];
  const catalog = [...consumables, { id: Koi.product, entitlements: [Koi.entitlement], kind: 'world', price, amount: amounts[0], currency },
    { id: Keepsakes.product, entitlements: [Keepsakes.entitlement], kind: 'style', price: stylePrice, amount: amounts[1], currency },
    { id: BUNDLE, entitlements: [Depths.entitlement, Koi.entitlement, Keepsakes.entitlement], kind: 'bundle', price: bundlePrice, amount: amounts[2], currency },
    { id: Depths.product, entitlements: [Depths.entitlement], kind: 'levels', price: levelsPrice, amount: amounts[3], currency }];
  const handOver = (item, transaction) => grant({ productId: item.id, power: item.power, count: item.count, items: item.items || [{ power: item.power, count: item.count }], transaction });
  const held = item => item.entitlements.filter(e => have.has(e)).length;
  return { mode, busy: false, purchases, isLive: () => live, owns: id => have.has(id), revoke: id => have.delete(id),
    products: () => catalog.map(item => ({ ...item, entitlement: item.entitlements[0], available, owned: !item.consumable && held(item) === item.entitlements.length, partial: held(item) > 0 && held(item) < item.entitlements.length })),
    onConsumable: fn => { grant = fn; },
    // The store handing a purchase over again, as after a crash before it was finished.
    replay: (id, transaction) => handOver(catalog.find(entry => entry.id === id), transaction),
    purchase: id => {
      purchases.push(id); const item = catalog.find(entry => entry.id === id);
      if (item.consumable) { const transaction = `T${++serial}`; const kept = handOver(item, transaction); return Promise.resolve({ ok: kept, consumable: true, power: item.power, count: item.count, transaction }); }
      if (held(item) > 0) return Promise.resolve({ ok: false, reason: 'partly-owned' });
      item.entitlements.forEach(e => have.add(e)); listeners.forEach(fn => fn({ type: 'entitlements' })); return Promise.resolve({ ok: true, entitlements: item.entitlements });
    },
    subscribe: fn => { listeners.push(fn); } };
}
// A clock fixed at one local moment, so the daily garden and its week are known in advance.
function fixedDate(moment) {
  return class extends Date { constructor(...args) { if (args.length) super(...args); else super(moment); } static now() { return new Date(moment).getTime(); } };
}
function boot(raw, { storageFails = false, search = '', otherSave, store, native, today, goals = false } = {}) {
  const key = search.includes('qa') ? 'bloomshot.qa.v1' : 'bloomshot.save.v1';
  const storage = new Map();
  if (raw !== undefined) storage.set(key, JSON.stringify(raw));
  if (otherSave) storage.set(key === 'bloomshot.qa.v1' ? 'bloomshot.save.v1' : 'bloomshot.qa.v1', JSON.stringify(otherSave));
  const writes = [], reloads = [], nodes = new Map(), games = [], meadowDraws = [], boardDraws = [];
  let nextFrame, now = 0, uuid = 0;
  const noop = () => {};
  const brush = new Proxy({ globalAlpha: 1, createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }) }, { get: (target, name) => name in target ? target[name] : noop });
  function element(id = '') {
    const handlers = new Map(), childrenBySelector = new Map(), classes = new Set();
    const node = { id, dataset: {}, children: [], style: { setProperty: noop }, attributes: {}, nextElementSibling: { textContent: '' },
      hidden: false, disabled: false, open: false, checked: false, textContent: '', width: 0, height: 0, scrolled: 0, scrollIntoView: () => { node.scrolled++; },
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
  class ObservedGame extends Engine.Game { constructor(level) { super(level); games.push(this); } }
  class ObservedRush extends Rush.RushGame { constructor(options) { super(options); games.push(this); } }
  const context = vm.createContext({ console, structuredClone, URLSearchParams, Date: today ? fixedDate(today) : Date, Math, Map, Set,
    document, location: { search, reload: () => { reloads.push(true); } }, navigator: {}, crypto: { randomUUID: () => 'test-run-' + (++uuid) },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => {
      if (storageFails) throw new Error('Storage blocked'); storage.set(name, value); writes.push({ key: name, value });
    } },
    performance: { now: () => now }, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout: () => 1, clearTimeout: noop,
    BloomLevels: { ...Levels, worlds: [...Levels.worlds, FUTURE] }, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: goals ? Goals : QuietGoals, ...(store ? { BloomStore: store } : {}), ...(native ? { BloomNative: native } : {}), BloomEngine: { ...Engine, Game: ObservedGame }, BloomRush: { RushGame: ObservedRush }, BloomDepths: Depths, BloomPowers: Powers, BloomTutorial: require('../tutorial.js'), BloomPetals: require('../petals.js'), BloomScenery: { paint: noop, has: () => true },
    BloomSound: { wake: noop, play: noop, setEnabled: noop }, BloomKeepsakes: Keepsakes,
    BloomArt: { draw: (ctx, state, time, options) => boardDraws.push(options.keepsake ? options.keepsake.id : 'meadow'), drawFlower: noop, drawMoon: noop, koiFish: noop,
      drawGarden: noop, drawProjectile: noop, drawParticle: noop, drawSeed: noop, drawPowerIcon: noop },
    BloomMeadow: { plots: Garden.plots.map((p, i) => ({ id: p.id, x: 65 + i * 50, y: 150, labelY: 180, accent: p.color })),
      decor: Garden.decor.map((d, i) => ({ id: d.id, x: 40 + i * 60, y: 200, accent: '#ffffff', icon: [40 + i * 60, 190, 40] })),
      friends: Garden.decor.map((d, i) => ({ id: d.friend.id, decorId: d.id, x: 40 + i * 60, y: 180 })), reactSeconds: 1.1,
      drawDecorIcon: noop, drawFriendIcon: noop, draw: (ctx, options) => meadowDraws.push(clone(options)) }
  });
  context.window = context; context.addEventListener = noop;
  vm.runInContext(source, context, { filename: 'app.js' });
  function frame(milliseconds = 17) { now += milliseconds; const fn = nextFrame; assert.equal(typeof fn, 'function'); fn(now); }
  function click(id, dataset) {
    const target = dataset ? Object.assign(element(), { dataset }) : $(id);
    $(id).emit('click', { target });
  }
  function preview() { click('worlds-btn'); click('worlds-grid', { world: 'orchard' }); click('world-preview-btn'); }
  function finishRush(blooms = 24, wave = 3) {
    const game = games.at(-1); assert.equal(game.mode, 'rush');
    // The game opens on the level map, so the endless board is brought up first when it is not showing.
    if (context.bloomshotState.route !== 'game') click('levels-rush-btn');
    // An engine completion fixture tests the app's event boundary, not the run's physics.
    game.totalBlooms = blooms; game.wave = wave; game.score = 3200; game._lose(); frame(); return game;
  }
  return { $, click, frame, preview, finishRush, context, games, meadowDraws, boardDraws, writes, reloads, storage,
    saved: () => JSON.parse(storage.get(key)), key };
}

test('Startup migrates an old save once and preserves all existing progress and preferences', () => {
  const before = legacySave(); const app = boot(before); const after = app.saved();
  for (const field of ['progress', 'daily', 'rush', 'lastLevel', 'settings']) assert.deepEqual(after[field], before[field]);
  assert.equal(after.garden.seeds, 4); assert.equal(after.garden.starterSeeds, 4);
  assert.equal(Garden.summary(after.garden).totalStages, 0); assert(app.writes.length >= 1);
  assert.deepEqual(boot(after).saved(), after);
});
test('Music has its own switch: an old save shows it on, turning it off is saved and survives a reload, and older settings stay the same', () => {
  const before = legacySave(); const app = boot(before);
  assert.equal(app.$('toggle-music').checked, true, 'an old save, with no music setting, shows Music on');
  assert.deepEqual(app.saved().settings, before.settings, 'nothing is added to the settings until the switch is used');
  const music = []; app.context.BloomSound.setMusic = on => music.push(on);
  app.$('toggle-music').checked = false; app.$('toggle-music').emit('change');
  const saved = app.saved();
  assert.equal(saved.settings.music, false);
  assert.deepEqual({ ...saved.settings, music: undefined }, { ...before.settings, music: undefined }, 'the other settings are untouched');
  assert.deepEqual(music, [false]);
  const reloaded = boot(saved);
  assert.equal(reloaded.$('toggle-music').checked, false, 'off survives a reload'); assert.deepEqual(reloaded.saved().settings, saved.settings);
  // The soundtrack plays only with both Sound and Music on.
  const both = boot({ ...legacySave(), settings: { sound: true, haptics: false, motion: false } }), calls = [];
  both.context.BloomSound.setMusic = on => calls.push(on);
  both.$('toggle-music').checked = false; both.$('toggle-music').emit('change');
  both.$('toggle-music').checked = true; both.$('toggle-music').emit('change');
  both.$('toggle-sound').checked = false; both.$('toggle-sound').emit('change');
  assert.deepEqual(calls, [false, true, false]); assert.equal(both.saved().settings.music, true);
  // The soundtrack hears the board: home in the menus and endless Rush, a level's own groove in that level.
  const states = []; both.context.BloomSound.music = { frame: state => states.push(state) };
  both.frame(); assert.equal(states.at(-1).route, 'levels'); assert.equal(states.at(-1).groove, 'home');
  both.click('levels-rush-btn'); both.frame(200);
  assert.equal(states.at(-1).route, 'game'); assert.equal(states.at(-1).groove, 'home'); assert.equal(states.at(-1).threat >= 0, true);
  both.click('rush-btn'); both.frame(200); assert.equal(states.at(-1).route, 'levels'); assert.equal(states.at(-1).groove, 'home');
  both.click('depth-map', { depth: '1' }); both.frame(200);
  assert.equal(states.at(-1).route, 'game'); assert.equal(states.at(-1).groove, 'meadow');
  const count = states.length; both.frame(); assert.equal(states.length, count, 'about ten times a second, not every frame');
  for (const state of states) for (const key of ['heat', 'threat']) assert(Number.isFinite(state[key]));
});
test('Malformed individual daily entries cannot reset valid campaign, Rush, or planted meadow records', () => {
  const before = legacySave(); before.garden = Garden.plant(Garden.normalize(), 'moon').state;
  Object.assign(before.daily, { 'daily-2026-10-02': null, 'daily-2026-10-03': [], 'daily-2026-10-04': false,
    'daily-2026-10-05': 'bad', 'daily-2026-10-06': { best: 'bad', stars: 2 }, 'daily-2026-10-07': { best: 10, stars: 9 } });
  const after = boot(before).saved();
  for (const field of ['progress', 'rush', 'lastLevel', 'settings', 'garden']) assert.deepEqual(after[field], before[field]);
  assert.deepEqual(after.daily, { 'daily-2026-10-01': before.daily['daily-2026-10-01'] });
  assert.equal(after.garden.seeds, 0); assert.equal(after.garden.levels.moon, 1);
});
test('Actual selection and planting handlers persist exactly one stage, including a zero-balance reload', () => {
  const app = boot(legacySave()); app.click('garden-btn'); app.click('plot-markers', { plot: 'dawn' }); app.click('plant-btn');
  const after = app.saved(); assert.equal(after.garden.selectedId, 'dawn'); assert.equal(after.garden.levels.dawn, 1);
  assert.equal(after.garden.seeds, 0); assert.equal(after.garden.totalSeedsSpent, 4);
  app.click('plant-btn'); assert.deepEqual(app.saved(), after);
  const reloaded = boot(after); reloaded.click('garden-btn');
  assert.deepEqual(reloaded.saved().garden, after.garden); assert.equal(reloaded.$('plant-btn').disabled, true);
  assert.equal(reloaded.$('garden-seeds').textContent, '0');
});
test('Completed Rush rewards are saved before the result dialog and cannot repeat on dialog reopen', () => {
  const app = boot(legacySave()); app.finishRush();
  const completed = app.saved(); assert.equal(completed.garden.seeds, 12); assert.equal(completed.garden.totalSeedsEarned, 8);
  assert.equal(completed.rush.runs, 6); assert.equal(completed.garden.receipts.length, 1);
  assert.equal(app.$('result-dialog').open, false);
  for (let i = 0; i < 40; i++) app.frame();
  assert.equal(app.$('result-dialog').open, true); assert.equal(app.$('reward-seeds').textContent, '+8 seeds');
  app.click('grow-garden-btn'); app.click('rush-btn');
  assert.equal(app.context.bloomshotState.route, 'levels'); assert.equal(app.$('resume-btn').hidden, true, 'a finished run is not offered to resume');
  assert.deepEqual(app.saved(), completed);
});
test('Restarting an unfinished run does not grant rewards', () => {
  const app = boot(legacySave()); const before = app.saved();
  const game = app.games.at(-1); game.totalBlooms = 24; game.wave = 3;
  // Restart sits next to Split: the first tap on a run with progress only asks for a second one.
  app.click('restart-btn');
  assert.equal(app.games.length, 1, 'one tap does not wipe the run'); assert(app.$('restart-btn').classList.contains('armed'));
  assert.equal(app.$('restart-btn').attributes['aria-label'], 'Tap again to restart');
  app.click('restart-btn');
  // The restarted board is the first one played, so it shows the powerups tip once; nothing else changes.
  assert.equal(app.games.length, 2); assert.deepEqual({ ...app.saved(), powersMet: false }, before);
  assert.equal(app.$('restart-btn').classList.contains('armed'), false);
});
test('Starting an endless run over keeps a new best score and wave, and still pays nothing', () => {
  const app = boot(legacySave()); const before = app.saved();
  const game = app.games.at(-1); game.started = true; game.score = 5000; game.wave = 4;
  app.click('restart-btn'); app.click('restart-btn');
  assert.equal(app.games.length, 2);
  const after = app.saved();
  assert.equal(after.rush.best, 5000); assert.equal(after.rush.bestWave, 4);
  assert.equal(after.rush.runs, before.rush.runs, 'an abandoned run is not counted'); assert.deepEqual(after.garden, before.garden, 'and earns no seeds');
});
test('Visual previews grant no progress and restore the original in-progress run ID for its reward', () => {
  const app = boot(legacySave()); const original = app.games.at(-1); const before = app.saved();
  app.preview(); assert.equal(app.context.bloomshotState.preview, true);
  const previewGame = app.games.at(-1); previewGame.win(); app.frame();
  assert.deepEqual(app.saved(), before);
  app.click('worlds-btn'); app.click('rush-btn');
  assert.equal(app.context.bloomshotState.preview, false); assert.equal(app.context.bloomshotState.mode, 'rush');
  const count = app.games.length; app.click('levels-rush-btn'); assert.equal(app.games.length, count, 'the waiting run is picked up, not replaced');
  original.totalBlooms = 24; original.wave = 3; original._lose(); app.frame();
  assert.equal(app.saved().garden.totalSeedsEarned, 8);
  assert.deepEqual(app.saved().garden.receipts, ['test-run-1']);
});
test('Visual preview restoration never regrants an already-earned result', () => {
  const app = boot(legacySave()); app.finishRush(); app.click('garden-btn'); const earned = app.saved();
  app.preview(); app.click('worlds-btn'); app.click('rush-btn');
  assert.equal(app.context.bloomshotState.preview, false); assert.equal(app.context.bloomshotState.route, 'levels');
  for (let i = 0; i < 40; i++) app.frame();
  assert.deepEqual(app.saved(), earned);
});
test('Campaign integration supplies pre-mutation stars so only new stars earn seeds', () => {
  const app = boot(legacySave()); app.click('garden-btn'); app.click('level-grid', { level: '2' });
  app.games.at(-1).win(); app.frame();
  const saved = app.saved(); assert.equal(saved.progress[2].stars, 3); assert.equal(saved.garden.totalSeedsEarned, 2);
  assert.equal(saved.garden.campaignBest[2], 3); assert.equal(saved.garden.seeds, 6);
  app.click('retry-btn'); app.games.at(-1).win(); app.frame();
  assert.equal(app.saved().garden.seeds, 6); assert.equal(app.saved().garden.totalSeedsEarned, 2);
});
test('Reduced-motion planting draws the final saved growth and stops unnecessary meadow redraws', () => {
  const app = boot(legacySave()); app.click('garden-btn'); app.click('plant-btn'); app.frame();
  const draw = app.meadowDraws.at(-1); assert.equal(draw.motion, false); assert.equal(draw.state.levels.sunbell, 1);
  const frames = app.meadowDraws.length; app.frame(100); app.frame(100);
  assert.equal(app.meadowDraws.length, frames); assert.equal(app.saved().garden.levels.sunbell, 1);
});
test('QA and normal storage namespaces remain isolated', () => {
  const normal = legacySave(), qa = legacySave(); qa.rush.best = 9999;
  const app = boot(qa, { search: '?qa=1', otherSave: normal }); app.click('garden-btn'); app.click('plant-btn');
  assert.equal(app.saved().rush.best, 9999); assert.equal(app.saved().garden.seeds, 0);
  assert.deepEqual(JSON.parse(app.storage.get('bloomshot.save.v1')), normal);
  assert(app.writes.every(write => write.key === 'bloomshot.qa.v1'));
});
test('Unavailable device storage reports the limitation while keeping this visit playable', () => {
  const app = boot(legacySave(), { storageFails: true });
  assert.equal(app.context.bloomshotState.storageAvailable, false);
  app.click('garden-btn'); app.click('plant-btn');
  assert.equal(app.$('garden-seeds').textContent, '0'); assert.equal(app.$('meadow-canvas').dataset.stages, 1);
  assert.equal(app.saved().garden, undefined); assert.equal(app.writes.length, 0);
});
test('Moon trials use separate records, reward new stars, unlock the next trial, and keep Meadow progress', () => {
  const before = legacySave(), app = boot(before);
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'moon' }); app.click('world-preview-btn');
  const game = app.games.at(-1); assert.equal(game.level.id, 'moon-1'); assert.equal(app.context.bloomshotState.preview, false);
  assert.equal(game.rules.ballsPerShot, 1); assert.equal(game.rules.guide, false);
  game.fire(0, -1); game.win(); app.frame();
  const after = app.saved(); assert.equal(after.moon['moon-1'].stars, 3); assert.equal(after.garden.moonBest['moon-1'], 3);
  assert.equal(after.garden.seeds, 16); assert.deepEqual(after.progress, before.progress); assert.deepEqual(after.daily, before.daily);
  app.click('next-btn'); assert.equal(app.games.at(-1).level.id, 'moon-2');
  const reloaded = boot(after); assert.deepEqual(reloaded.saved().moon, after.moon);
  reloaded.click('worlds-btn'); reloaded.click('worlds-grid', { world: 'moon' }); reloaded.click('world-preview-btn');
  assert.equal(reloaded.games.at(-1).level.id, 'moon-2');
});
test('Locked Moon buttons and malformed individual Moon records cannot grant or erase progress', () => {
  const before = legacySave(); before.moon = { 'moon-1': null, 'moon-2': { best: 100, stars: 7 }, 'moon-6': { best: 400, stars: 1, attempts: 1 } };
  const app = boot(before); const initial = app.games.at(-1);
  app.click('world-detail', { trial: 'moon-2', chapter: 'moon' }); assert.equal(app.games.at(-1), initial);
  assert.deepEqual(app.saved().moon, { 'moon-6': before.moon['moon-6'] }); assert.deepEqual(app.saved().progress, before.progress);
  assert.equal(app.saved().garden.seeds, 4);
});
test('A world preview restores a Moon trial and its reward without leaking it to Meadow or daily records', () => {
  const app = boot(legacySave()); app.click('worlds-btn'); app.click('worlds-grid', { world: 'moon' }); app.click('world-preview-btn');
  app.games.at(-1).fire(0, -1); app.games.at(-1).win(); app.frame(); const after = app.saved();
  app.click('garden-btn'); app.preview(); app.games.at(-1).win(); app.frame();
  app.click('worlds-btn'); app.click('rush-btn');
  assert.equal(app.context.bloomshotState.level, 'moon-1'); assert.equal(app.context.bloomshotState.theme, 'moon');
  assert.deepEqual(app.saved(), after);
});
test('Koi pools 1 and 2 are free, keep their own records, and pools 3 to 8 never start without the pack', () => {
  const app = boot(legacySave());
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'koi' });
  assert.match(app.$('world-detail').innerHTML, /unlock in the Bloomshot app/); assert(!app.$('world-detail').innerHTML.includes('data-buy'));
  app.click('world-preview-btn'); let game = app.games.at(-1);
  assert.equal(game.level.id, 'koi-1'); assert.equal(app.context.bloomshotState.theme, 'koi'); assert.equal(game.rules.guide, false);
  game.fire(0, -1); game.win(); app.frame();
  let after = app.saved(); assert.equal(after.koi['koi-1'].stars, 3); assert.equal(after.garden.koiBest['koi-1'], 3); assert.deepEqual(after.moon, {});
  assert.equal(after.garden.seeds, 16);
  app.click('next-btn'); game = app.games.at(-1); assert.equal(game.level.id, 'koi-2');
  game.fire(0, -1); game.win(); for (let i = 0; i < 12; i++) app.frame(60);
  assert.equal(app.$('result-dialog').open, true); assert.equal(app.$('next-btn').textContent, 'See all pools');
  const started = app.games.length; app.click('next-btn');
  assert.equal(app.games.length, started); assert.equal(app.$('world-dialog').open, true);
  app.click('world-detail', { trial: 'koi-3', chapter: 'koi' }); assert.equal(app.games.length, started);
  after = app.saved(); assert.deepEqual(boot(after).saved().koi, after.koi);
  const paid = boot(after, { store: fakeStore({ owned: [Koi.entitlement] }) });
  paid.click('worlds-btn'); paid.click('worlds-grid', { world: 'koi' });
  assert(!paid.$('world-detail').innerHTML.includes('unlock-panel')); paid.click('world-preview-btn');
  assert.equal(paid.games.at(-1).level.id, 'koi-3');
});
test('The Koi unlock names its contents and store price and buys only through the store', () => {
  const save = legacySave(); save.koi = { 'koi-1': { best: 900, stars: 3, attempts: 1 }, 'koi-2': { best: 800, stars: 2, attempts: 2 } };
  const notForSale = boot(save, { store: fakeStore({ live: true, available: false }) });
  notForSale.click('worlds-btn'); notForSale.click('worlds-grid', { world: 'koi' });
  assert.match(notForSale.$('world-detail').innerHTML, /Not on sale yet/); assert(!notForSale.$('world-detail').innerHTML.includes('data-buy'));
  const store = fakeStore({ live: true, available: true, price: '$4.99' }), app = boot(save, { store });
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'koi' });
  const html = app.$('world-detail').innerHTML;
  assert.match(html, /Unlock all 8 pools · \$4\.99/); assert.match(html, /6 more pools/); assert.match(html, /one-time purchase/i);
  const started = app.games.length;
  app.click('world-detail', { trial: 'koi-3', chapter: 'koi' }); assert.equal(app.games.length, started);
  app.click('world-detail', { buy: Koi.product }); assert.deepEqual(store.purchases, [Koi.product]);
  assert(!app.$('world-detail').innerHTML.includes('unlock-panel'));
  app.click('world-detail', { trial: 'koi-3', chapter: 'koi' }); assert.equal(app.games.at(-1).level.id, 'koi-3');
  assert.deepEqual(app.saved().koi, save.koi);
});
test('Clearing a Rush wave shows the next tempo, and the HUD and result carry the tempo reached', () => {
  const app = boot(legacySave()); app.click('levels-rush-btn'); const game = app.games.at(-1);
  assert(game.fire(0, -1)); app.frame();
  // The opening seed flies up through the petal now, so it is cleared away before it can reach wave 2.
  for (const bud of game.buds) while (!bud.bloomed) game.strike(bud, true);
  game.balls = [];
  app.frame(20); app.frame(20);
  const banner = game.floaters.find(f => f.kind === 'wave');
  assert(banner, 'a wave-clear banner is shown'); assert.equal(banner.text, 'Wave clear!'); assert.equal(banner.label, 'next ×1.1');
  for (let i = 0; i < 50; i++) app.frame(20);
  assert.equal(game.wave, 2); assert.match(app.$('level-label').textContent, /^Wave 2 · ×1\.1$/);
  assert.match(app.$('game-hint').textContent, /×1\.1 points/);
  game._lose(); for (let i = 0; i < 40; i++) app.frame();
  assert.match(app.$('result-message').textContent, /tempo\u00a0×1\.1/);
});
test('The Complete Garden states its price and exact saving everywhere it is offered, buys all three at once, and then disappears', () => {
  const store = fakeStore({ live: true, available: true }), app = boot(legacySave(), { store });
  const saving = /\$2\.98 less than buying all three \(\$2\.99 \+ \$4\.99 \+ \$1\.99\)\./;
  const levelsMap = app.$('depth-map').innerHTML;
  assert.match(levelsMap, /Unlock levels 5 to 10 · \$2\.99/); assert.match(levelsMap, /Get everything · \$6\.99/); assert.match(levelsMap, saving);
  assert(levelsMap.indexOf('Unlock levels 5 to 10') < levelsMap.indexOf('Get everything'), 'the levels unlock comes first, the Complete Garden beside it');
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'koi' });
  const koiPanel = app.$('world-detail').innerHTML;
  assert.match(koiPanel, /Unlock all 8 pools · \$4\.99/); assert.match(koiPanel, /Get everything · \$6\.99/); assert.match(koiPanel, saving);
  app.click('collection-btn'); assert.match(app.$('keepsake-offer').innerHTML, /Get everything · \$6\.99/);
  app.click('keepsake-shelf', { keepsake: 'firefly' });
  app.click('keepsake-shelf', { buy: BUNDLE }); assert.deepEqual(store.purchases, [BUNDLE]);
  assert(store.owns(Depths.entitlement) && store.owns(Koi.entitlement) && store.owns(Keepsakes.entitlement));
  assert.equal(app.$('keepsake-offer').innerHTML, '');
  app.click('keepsake-shelf', { keepsake: 'firefly' }); assert.equal(app.saved().keepsake, 'firefly');
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'koi' });
  assert(!app.$('world-detail').innerHTML.includes('data-buy'));
  app.click('rush-btn'); assert(!app.$('depth-map').innerHTML.includes('data-buy'), 'nothing left to sell on the level map');
  app.click('keepsake-shelf', { buy: BUNDLE }); assert.deepEqual(store.purchases, [BUNDLE], 'an owned bundle never opens the store again');
});
test('Owning any part offers only the parts still missing, never the Complete Garden', () => {
  const koiOwner = boot(legacySave(), { store: fakeStore({ live: true, available: true, owned: [Koi.entitlement] }) });
  koiOwner.click('collection-btn');
  assert.match(koiOwner.$('keepsake-offer').innerHTML, /Get all three · \$1\.99/); assert(!koiOwner.$('keepsake-offer').innerHTML.includes(BUNDLE));
  assert(!koiOwner.$('depth-map').innerHTML.includes(BUNDLE)); assert.match(koiOwner.$('depth-map').innerHTML, /Unlock levels 5 to 10 · \$2\.99/);
  koiOwner.click('keepsake-shelf', { buy: BUNDLE }); assert.equal(koiOwner.context.BloomStore.purchases.length, 0);
  const styleOwner = boot(legacySave(), { store: fakeStore({ live: true, available: true, owned: [Keepsakes.entitlement] }) });
  styleOwner.click('worlds-btn'); styleOwner.click('worlds-grid', { world: 'koi' });
  assert.match(styleOwner.$('world-detail').innerHTML, /Unlock all 8 pools · \$4\.99/); assert(!styleOwner.$('world-detail').innerHTML.includes(BUNDLE));
  const levelsOwner = boot(legacySave(), { store: fakeStore({ live: true, available: true, owned: [Depths.entitlement] }) });
  levelsOwner.click('collection-btn'); assert(!levelsOwner.$('keepsake-offer').innerHTML.includes(BUNDLE));
});
test('Without comparable amounts the bundle still says it costs less, but names no number; off sale or on the website it is not offered', () => {
  const mixed = boot(legacySave(), { store: fakeStore({ live: true, available: true, amounts: [4.99, NaN, 6.99, 2.99] }) });
  mixed.click('collection-btn'); const html = mixed.$('keepsake-offer').innerHTML;
  assert.match(html, /Less than buying all three \(\$2\.99 \+ \$4\.99 \+ \$1\.99\)\./); assert(!/\$\d+\.\d+ less/.test(html));
  const offSale = boot(legacySave(), { store: fakeStore({ live: true, available: false }) });
  offSale.click('collection-btn'); assert(!offSale.$('keepsake-offer').innerHTML.includes(BUNDLE));
  const web = boot(legacySave(), { store: fakeStore({ live: false, available: true, mode: 'web' }) });
  web.click('collection-btn'); assert(!web.$('keepsake-offer').innerHTML.includes(BUNDLE));
});
const moonThrough = count => Object.fromEntries(Moon.levels.slice(0, count).map(level => [level.id, { best: 700, stars: 2, attempts: 1 }]));
test('Keepsakes: a fresh garden wears Meadow, every style previews, and locked styles never go on the seed', () => {
  const before = legacySave(), app = boot(before);
  assert.equal(app.saved().keepsake, 'meadow'); assert.deepEqual(app.saved().settings, before.settings);
  app.click('collection-btn'); app.frame();
  const grid = app.$('keepsake-grid').innerHTML;
  for (const style of Keepsakes.styles) assert(grid.includes(`data-keepsake="${style.id}"`), style.id);
  assert.match(grid, />Wearing</); assert.match(grid, /Moon 0\/6/); assert.match(grid, /Keepsake Collection/);
  assert.match(app.$('keepsake-offer').innerHTML, /Available in the Bloomshot app/); assert(!app.$('keepsake-offer').innerHTML.includes('data-buy'));
  for (const id of ['sakura', 'moonlit']) {
    app.click('keepsake-shelf', { keepsake: id }); app.frame();
    assert.equal(app.saved().keepsake, 'meadow'); assert.match(app.$('keepsake-grid').innerHTML, new RegExp(`data-keepsake="${id}" aria-pressed="true"`));
  }
  assert.match(app.$('keepsake-caption').innerHTML, /Earned, never sold/);
  app.click('levels-rush-btn'); app.frame(); assert.equal(app.boardDraws.at(-1), 'meadow');
});
test('Clearing the last Moon trial earns Moonlit once, the result offers to wear it, and play draws it', () => {
  const before = legacySave(); before.moon = moonThrough(5);
  const app = boot(before);
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'moon' });
  assert.match(app.$('world-detail').innerHTML, /Clear all 6 to earn the Moonlit seed/);
  app.click('world-preview-btn'); const game = app.games.at(-1); assert.equal(game.level.id, 'moon-6');
  game.fire(0, -1); game.win(); for (let i = 0; i < 12; i++) app.frame(60);
  assert.equal(app.$('result-dialog').open, true); assert.equal(app.$('reward-flower').hidden, false);
  assert.match(app.$('reward-flower').innerHTML, /New seed style!/); assert.match(app.$('reward-flower').innerHTML, /data-wear="moonlit"/);
  assert.equal(app.saved().keepsake, 'meadow');
  app.click('reward-flower', { wear: 'moonlit' }); assert.equal(app.saved().keepsake, 'moonlit');
  app.click('retry-btn'); app.games.at(-1).fire(0, -1); app.games.at(-1).win(); for (let i = 0; i < 12; i++) app.frame(60);
  assert.equal(app.$('reward-flower').hidden, true, 'a replay does not announce it again');
  assert.equal(app.boardDraws.at(-1), 'moonlit');
  const reloaded = boot(app.saved()); reloaded.click('levels-rush-btn'); reloaded.frame(); assert.equal(reloaded.boardDraws.at(-1), 'moonlit');
  reloaded.click('worlds-btn'); reloaded.click('worlds-grid', { world: 'moon' });
  assert.match(reloaded.$('world-detail').innerHTML, /Moonlit seed earned!/);
});
test('The Keepsake Collection shows the store price, buys only through the store, and a refund falls back to Meadow without forgetting', () => {
  const save = legacySave(); save.settings.motion = true;
  const notForSale = boot(save, { store: fakeStore({ live: true, available: false }) });
  notForSale.click('collection-btn'); assert.match(notForSale.$('keepsake-offer').innerHTML, /Not on sale yet/);
  assert(!notForSale.$('keepsake-offer').innerHTML.includes('data-buy'));
  const store = fakeStore({ live: true, available: true, stylePrice: '$1.99' }), app = boot(save, { store });
  app.click('collection-btn');
  const offer = app.$('keepsake-offer').innerHTML;
  assert.match(offer, /Get all three · \$1\.99/); assert.match(offer, /Sakura Breeze, Firefly Night and Gilded Leaf/);
  assert.match(offer, /Looks only: every shot flies the same/); assert.match(offer, /One payment/);
  app.click('keepsake-shelf', { keepsake: 'sakura' }); assert.equal(app.saved().keepsake, 'meadow'); assert.deepEqual(store.purchases, []);
  app.click('keepsake-shelf', { buy: Keepsakes.product }); assert.deepEqual(store.purchases, [Keepsakes.product]);
  assert.equal(app.$('keepsake-offer').innerHTML, ''); assert(!app.$('keepsake-grid').innerHTML.includes('Keepsake Collection'));
  app.click('keepsake-shelf', { keepsake: 'gilded' }); assert.equal(app.saved().keepsake, 'gilded');
  app.click('levels-rush-btn'); app.frame(); assert.equal(app.boardDraws.at(-1), 'gilded');
  const game = app.games.at(-1); game.particles = []; game.events.push({ type: 'bloom', bud: { x: 200, y: 200, r: 12, type: 'gold' }, combo: 1, gain: 10 }); app.frame();
  assert(game.particles.some(p => p.kind === 'flake'), 'a bloom throws gold leaf'); assert(!game.particles.some(p => p.kind === 'blossom'));
  store.revoke(Keepsakes.entitlement); app.frame();
  assert.equal(app.boardDraws.at(-1), 'meadow'); assert.equal(app.saved().keepsake, 'gilded');
  assert.deepEqual(app.saved().koi, save.koi || {}); assert.deepEqual(app.saved().progress, save.progress);
});
// Saturday 3 October 2026; its week runs Monday 28 September to Sunday 4 October.
const SATURDAY = '2026-10-03T12:00:00';
function finishDaily(app) {
  const game = app.games.at(-1); assert.equal(game.level.id, 'daily-2026-10-03');
  game.win(); for (let i = 0; i < 60 && !app.$('result-dialog').open; i++) app.frame(); assert(app.$('result-dialog').open);
  return game;
}
test('The daily garden card shows today, this week and the bouquet, and its first clear pays seeds plus the bouquet on the fourth day', () => {
  const save = legacySave(); save.daily = {}; save.garden = { seeds: 0, levels: {}, dailyBest: { 'daily-2026-09-28': 2, 'daily-2026-09-29': 1, 'daily-2026-10-01': 3 } };
  const app = boot(save, { today: SATURDAY });
  assert(app.$('garden-btn').classList.contains('has-daily'), 'the Garden tab marks a daily garden not yet cleared');
  app.click('garden-btn');
  assert.equal(app.$('daily-eyebrow').textContent, 'Saturday');
  assert.match(app.$('daily-status').innerHTML, /^.+, remixed\. Clear it for 6–10 seeds\.$/);
  assert.equal(app.$('daily-bouquet').textContent, 'Bouquet 3/4 · +12 seeds');
  const days = app.$('daily-week').innerHTML.match(/<span class="[^"]*">/g);
  assert.deepEqual(days, ['<span class="bloomed">', '<span class="bloomed">', '<span class="">', '<span class="bloomed">', '<span class="">', '<span class="today">', '<span class="later">']);
  app.click('daily-btn'); finishDaily(app);
  const saved = app.saved();
  assert.equal(saved.daily['daily-2026-10-03'].stars, 3); assert.equal(saved.garden.dailyBest['daily-2026-10-03'], 3);
  assert.equal(saved.garden.seeds, 10 + 12); assert.deepEqual(saved.garden.bouquets, ['week-2026-09-28']);
  assert.equal(app.$('result-eyebrow').textContent, 'Daily clear!');
  assert.equal(app.$('reward-seeds').textContent, '+22 seeds'); assert.equal(app.$('garden-reward').hidden, false);
  assert.match(app.$('reward-flower').innerHTML, /Weekly bouquet!.*\+12 bonus seeds/); assert.equal(app.$('reward-flower').hidden, false);
  assert.equal(app.$('reward-goal').textContent, 'Enough to plant Sunbell now.');
  // Playing it again the same day pays nothing more and never repeats the bouquet.
  app.click('retry-btn'); finishDaily(app);
  assert.equal(app.saved().garden.seeds, 22); assert.equal(app.$('garden-reward').hidden, true); assert.equal(app.$('reward-flower').hidden, true);
  app.click('result-garden-btn');
  assert(!app.$('garden-btn').classList.contains('has-daily'));
  assert.match(app.$('daily-status').innerHTML, /^<span class="daily-stars" aria-hidden="true">(<span>★<\/span>){3}<\/span> New garden tomorrow\.$/);
  assert.equal(app.$('daily-bouquet').textContent, 'Bouquet earned · +12 seeds');
});
test('A daily garden cleared before this update pays only for new stars, and the seed reward names the next thing to grow', () => {
  const save = legacySave(); save.daily = { 'daily-2026-10-03': { best: 9000, stars: 2, attempts: 3 } };
  save.garden = { seeds: 0, levels: { sunbell: 1 }, selectedId: 'sunbell' };
  const app = boot(save, { today: SATURDAY });
  assert(!app.$('garden-btn').classList.contains('has-daily'), 'a day already cleared is not marked as new');
  app.click('garden-btn'); assert.match(app.$('daily-status').innerHTML, /<span>★<\/span><span>★<\/span><span class="off">★<\/span><\/span> \+2 seeds per new star\./);
  app.click('daily-btn'); finishDaily(app);
  assert.equal(app.saved().garden.seeds, 2); assert.equal(app.$('reward-seeds').textContent, '+2 seeds');
  assert.equal(app.$('reward-goal').textContent, '6 more seeds to grow Sunbell.');
  assert.equal(app.saved().daily['daily-2026-10-03'].attempts, 4);
});
function fakeNative({ restored = false } = {}) {
  const calls = { haptic: [], mirror: [], restore: [] }; let reloading = false;
  return { calls, haptic: kind => calls.haptic.push(kind), mirror: (key, json) => calls.mirror.push({ key, json }),
    get reloading() { return reloading; },
    // A synchronous thenable keeps this suite synchronous while still exercising the .then(restored => ...) path.
    // Like the real bridge, a restore that wrote the backup back marks the page as about to reload.
    restore: key => { calls.restore.push(key); reloading = restored; return { then: fn => { fn(restored); } }; } };
}
test('Decorate: a card names what is missing, builds once with seeds, shows in the meadow and survives a reload', () => {
  const save = legacySave(); save.garden = { seeds: 25, levels: { sunbell: 3, coral: 3, lilac: 3, honey: 3, moon: 3, dawn: 3 } };
  let app = boot(save); app.click('garden-btn');
  const bench = app.$('decor-grid').querySelector('[data-decor="bench"]'), tree = app.$('decor-grid').querySelector('[data-decor="tree"]');
  assert.equal(app.$('decor-count').textContent, '0/6 built'); assert.equal(app.$('meadow-summary').textContent, 'Full bloom · 0/6 built');
  assert(bench.classList.contains('ready')); assert(!tree.classList.contains('ready'));
  assert.equal(tree.getAttribute('aria-label'), 'Apple tree. 100 seeds. Shade, apples and a rope swing.');
  assert(app.$('garden-btn').classList.contains('has-seeds'), 'an affordable decoration marks the Garden tab');
  app.click('decor-grid', { decor: 'tree' });
  assert.equal(app.$('toast').textContent, '75 more seeds for the apple tree.'); assert.deepEqual(app.saved().garden.decor, []);
  app.click('decor-grid', { decor: 'bench' });
  assert.deepEqual(app.saved().garden.decor, ['bench']); assert.equal(app.saved().garden.seeds, 5);
  assert.equal(app.$('toast').textContent, 'Garden bench built!');
  assert(bench.classList.contains('built')); assert.equal(bench.getAttribute('aria-disabled'), 'true');
  assert.equal(bench.querySelector('.decor-price').innerHTML, 'Built!');
  assert(!app.$('garden-btn').classList.contains('has-seeds'));
  assert.equal(app.$('decor-count').textContent, '1/6 built');
  app.click('decor-grid', { decor: 'bench' }); assert.equal(app.saved().garden.seeds, 5, 'a built decoration never charges again');
  app.frame(); const drawn = app.meadowDraws.at(-1);
  assert.deepEqual(drawn.state.decor, ['bench']); assert.equal(drawn.growth.decorId, 'bench');
  app = boot(app.saved()); app.click('garden-btn');
  assert(app.$('decor-grid').querySelector('[data-decor="bench"]').classList.contains('built'));
});
test('Meadow friends: each moves in with its decoration, says hello when tapped, and is met in the Collection', () => {
  const save = legacySave(); save.garden = { seeds: 0, levels: {}, decor: ['bench', 'lilies'] };
  const app = boot(save); app.click('garden-btn');
  const spots = app.$('friend-spots');
  assert.equal(spots.querySelector('[data-friend="biscuit"]').hidden, false); assert.equal(spots.querySelector('[data-friend="hopper"]').hidden, false);
  assert.equal(spots.querySelector('[data-friend="pip"]').hidden, true, 'Pip waits for the birdhouse');
  assert.match(spots.innerHTML, /aria-label="Biscuit the cat\. Say hi\."/);
  app.click('friend-spots', { friend: 'hopper' });
  assert.equal(app.$('friend-bubble').textContent, 'Ribbit!'); assert.equal(app.$('friend-bubble').hidden, false);
  app.frame(); assert(Number.isFinite(app.meadowDraws.at(-1).pokes.hopper), 'the meadow is told Hopper was just tapped');
  app.click('collection-btn');
  assert.equal(app.$('friend-count').textContent, '2/6');
  const grid = app.$('friend-grid').innerHTML;
  assert.match(grid, /<strong>Biscuit<\/strong><span class="friend-kind">Cat<\/span><p>Naps on the bench all day\.<\/p>/);
  assert.match(grid, /<strong>Hopper<\/strong>/); assert.match(grid, /Build the birdhouse to meet them\./); assert.match(grid, /Build the apple tree to meet them\./);
  assert.equal((grid.match(/<strong>\?\?\?<\/strong>/g) || []).length, 4);
  app.click('friend-grid', { friend: 'biscuit' }); assert.equal(app.$('toast').textContent, 'Biscuit: Mrrp?');
});
test('After the beds, the seed reward points at the cheapest decoration, and a finished meadow says so', () => {
  const full = { sunbell: 3, coral: 3, lilac: 3, honey: 3, moon: 3, dawn: 3 };
  const save = legacySave(); save.garden = { seeds: 0, levels: full, decor: ['bench'] };
  const settle = app => { for (let i = 0; i < 40; i++) app.frame(); };
  let app = boot(save); app.finishRush(24, 3); settle(app);
  assert.equal(app.$('reward-seeds').textContent, '+8 seeds'); assert.equal(app.$('reward-goal').textContent, '22 more seeds to build the birdhouse.');
  save.garden = { seeds: 30, levels: full, decor: ['bench'] };
  app = boot(save); app.finishRush(24, 3); settle(app); assert.equal(app.$('reward-goal').textContent, 'Enough to build the birdhouse now.');
  save.garden = { seeds: 0, levels: full, decor: Garden.decor.map(d => d.id) };
  app = boot(save); app.finishRush(24, 3); settle(app); assert.equal(app.$('reward-goal').textContent, 'Your meadow is complete!');
  app.click('result-garden-btn'); assert.equal(app.$('meadow-summary').textContent, 'Your meadow is complete!');
});
// Sunday 4 October 2026 offers: reach wave 4, clear 2 puzzles, grow or build in the meadow.
const GOAL_DAY = '2026-10-04T10:00:00';
const settle = app => { for (let i = 0; i < 60 && !app.$('result-dialog').open; i++) app.frame(); };
test("Today's goals: the Garden card lists all three with progress, and each one opens a place to play it", () => {
  assert.deepEqual(Goals.forDay('2026-10-04').map(g => g.id), ['rush-wave', 'puzzles', 'meadow']);
  const app = boot(legacySave(), { today: GOAL_DAY, goals: true }); app.click('garden-btn');
  assert.equal(app.$('goals-count').textContent, '0/3 done');
  const html = app.$('goals-list').innerHTML;
  assert.match(html, /Reach wave 4<\/span><span class="goal-count">0\/4<\/span>/); assert.match(html, /Clear 2 puzzles/); assert.match(html, /Grow or build in your meadow/);
  assert.equal((html.match(/\+4<\/span>/g) || []).length, 3); assert.equal(app.$('goals-bonus').textContent, 'Finish all 3 for +6 bonus seeds.');
  app.click('goals-list', { goal: 'rush' }); assert.equal(app.games.at(-1).mode, 'rush');
  app.click('garden-btn'); app.click('goals-list', { goal: 'moon' }); assert.equal(app.$('world-dialog').open, true);
});
test('A Rush run that reaches the wave goal pays 4 more seeds once, says so on the result, and remembers it today only', () => {
  let app = boot(legacySave(), { today: GOAL_DAY, goals: true }); app.finishRush(24, 5); settle(app);
  assert.equal(app.saved().garden.seeds, 4 + 10 + 4); assert.equal(app.$('reward-seeds').textContent, '+14 seeds');
  assert.equal(app.$('result-goals').hidden, false); assert.match(app.$('result-goals').innerHTML, /Goal done! Reach wave 4\.<\/span><span class="goal-today">1\/3 today/);
  assert.deepEqual(app.saved().goals, { day: '2026-10-04', progress: [4, 0, 0], done: [true, false, false], bonus: false });
  app.click('retry-btn'); app.finishRush(24, 6); settle(app);
  assert.equal(app.saved().garden.seeds, 18 + 11, 'the goal never pays twice'); assert.equal(app.$('result-goals').hidden, true);
  app = boot(app.saved(), { today: '2026-10-05T09:00:00', goals: true });
  assert.deepEqual(app.saved().goals.done, [false, false, false], 'a new day brings new goals');
});
test('Growing in the meadow and clearing two puzzles finish the day, paying each goal and the 6-seed bonus', () => {
  const save = legacySave(); save.garden = { seeds: 4, levels: {}, selectedId: 'sunbell' };
  const app = boot(save, { today: GOAL_DAY, goals: true }); app.click('garden-btn');
  app.click('plant-btn'); assert.equal(app.saved().garden.seeds, 4); assert.equal(app.$('toast').textContent, 'Goal done! Grow or build in your meadow. +4 seeds');
  app.click('rush-btn'); app.finishRush(24, 4); settle(app); assert.match(app.$('result-goals').innerHTML, /1\/3 today|2\/3 today/); app.click('result-garden-btn');
  app.click('level-grid', { level: '1' }); app.games.at(-1).win(); settle(app);
  assert.equal(app.$('result-goals').hidden, true);
  app.click('retry-btn'); app.games.at(-1).win(); settle(app);
  assert.match(app.$('result-goals').innerHTML, /All 3 goals done! \+6 bonus seeds\./); assert.doesNotMatch(app.$('result-goals').innerHTML, /today/);
  assert.equal(app.$('reward-seeds').textContent, '+10 seeds');
  assert.deepEqual(app.saved().goals, { day: '2026-10-04', progress: [4, 2, 1], done: [true, true, true], bonus: true });
  app.click('result-garden-btn'); assert.equal(app.$('goals-count').textContent, '3/3 done'); assert.equal(app.$('goals-bonus').textContent, 'All done! New goals tomorrow.');
});
test('Native bridge: planting buzzes through BloomNative only while the Vibration setting is on', () => {
  const on = legacySave(); on.settings.haptics = true;
  const loud = fakeNative(); const a = boot(on, { native: loud }); a.click('garden-btn'); a.click('plant-btn');
  assert.deepEqual(loud.calls.haptic, ['tap']);
  const quiet = fakeNative(); const b = boot(legacySave(), { native: quiet }); b.click('garden-btn'); b.click('plant-btn');
  assert.deepEqual(quiet.calls.haptic, []);
});
test('Native bridge: every save is mirrored exactly as stored, under the active storage key', () => {
  const bridge = fakeNative(); const app = boot(legacySave(), { native: bridge });
  app.click('garden-btn'); app.click('plant-btn');
  const last = bridge.calls.mirror.at(-1);
  assert.equal(last.key, 'bloomshot.save.v1'); assert.equal(last.json, app.storage.get('bloomshot.save.v1'));
  const qa = fakeNative(); boot(legacySave(), { native: qa, search: '?qa=1' });
  assert(qa.calls.mirror.every(call => call.key === 'bloomshot.qa.v1'));
});
test('Native bridge: a restored backup reloads the page once, and no restore means no reload', () => {
  const restored = fakeNative({ restored: true }); const a = boot(legacySave(), { native: restored });
  assert.deepEqual(restored.calls.restore, ['bloomshot.save.v1']); assert.equal(a.reloads.length, 1);
  const plain = fakeNative(); assert.equal(boot(legacySave(), { native: plain }).reloads.length, 0);
});
test('Native bridge: the real bridge in its web form changes nothing, vibrating exactly as before only while the Vibration setting is on', () => {
  const Native = require('../native.js'); const buzzes = [];
  const on = legacySave(); on.settings.haptics = true;
  const loud = boot(on, { native: Native.create({ navigator: { vibrate: pattern => buzzes.push(pattern) } }) }); loud.click('garden-btn'); loud.click('plant-btn');
  assert.deepEqual(buzzes, [12]); assert.equal(loud.reloads.length, 0);
  const quiet = []; const off = boot(legacySave(), { native: Native.create({ navigator: { vibrate: pattern => quiet.push(pattern) } }) }); off.click('garden-btn'); off.click('plant-btn');
  assert.deepEqual(quiet, []); assert.equal(off.reloads.length, 0);
});
test('Native bridge: when web storage is blocked the phone backup still gets every save, and the game runs without a bridge at all', () => {
  const bridge = fakeNative(); const blocked = boot(legacySave(), { storageFails: true, native: bridge });
  blocked.click('garden-btn'); blocked.click('plant-btn');
  assert(bridge.calls.mirror.length > 0); assert.equal(blocked.writes.length, 0);
  for (const call of bridge.calls.mirror) assert.equal(JSON.parse(call.json).version, 1);
  const app = boot(legacySave()); app.click('garden-btn'); app.click('plant-btn'); assert.equal(Garden.summary(app.saved().garden).totalStages, 1);
});
test('Native bridge: once a backup has been restored and a reload is pending, the page saves nothing, so it cannot overwrite the restore', () => {
  const bridge = fakeNative({ restored: true }); const app = boot(legacySave(), { native: bridge });
  app.click('garden-btn'); app.click('plant-btn');
  assert.equal(app.reloads.length, 1); assert.equal(app.writes.length, 0); assert.equal(bridge.calls.mirror.length, 0);
});
// Levels: the map on Play, the ten-wave runs and what they save.
const depthGame = app => { const game = app.games.at(-1); assert.equal(game.mode, 'rush'); assert(game.plan, 'a level is running'); return game; };
const settleLevel = app => { for (let i = 0; i < 40; i++) app.frame(); };
test('The game opens on the level map: level 1 is open, the rest wait their turn, and a locked card never starts', () => {
  // A brand-new player gets the tutorial first; skipping it lands on the map.
  const app = boot(undefined); app.click('tutorial-skip');
  assert.equal(app.context.bloomshotState.route, 'levels'); assert.equal(app.$('levels-view').hidden, false); assert.equal(app.$('game-view').hidden, true);
  assert(app.$('rush-btn').classList.contains('active'), 'Play is the active tab');
  const map = app.$('depth-map').innerHTML;
  for (let id = 1; id <= 10; id++) assert.match(map, new RegExp(`data-depth="${id}"`));
  assert.match(map, /class="depth-card next" type="button" data-depth="1"/); assert.match(map, /class="depth-card locked" type="button" data-depth="2"/);
  assert.match(map, /Sunny Meadow/); assert.match(map, /Crystal Caves/); assert.match(map, /Clear level 3 to open/);
  assert.match(map, /class="depth-card locked paid" type="button" data-depth="5"/); assert.match(map, /Starseed Core/); assert.match(map, /Clear level 4 to try it free/);
  assert(map.indexOf('id="depth-unlock"') > map.indexOf('data-depth="5"') && map.indexOf('id="depth-unlock"') < map.indexOf('data-depth="6"'), 'the unlock sits between level 5 (the free taste) and level 6');
  assert.match(map, /Levels 5 to 10 unlock in the Bloomshot app/); assert(!map.includes('data-buy'), 'the web build sells nothing');
  const started = app.games.length;
  app.click('depth-map', { depth: '2' }); assert.equal(app.games.length, started); assert.equal(app.$('toast').textContent, 'Clear level 1 to open Root Tunnels.');
  app.click('depth-map', { depth: '5' }); assert.equal(app.games.length, started); assert.equal(app.$('toast').textContent, 'Clear level 4 to try Glowworm Lake free.');
  app.click('depth-map', { depth: '6' }); assert.equal(app.games.length, started); assert.equal(app.$('toast').textContent, 'Fossil Beds is part of levels 5 to 10.');
  assert.equal(app.$('depth-unlock').scrolled, 2, 'and the map shows what the unlock holds');
  app.click('depth-map', { depth: '1' }); const game = depthGame(app);
  assert.equal(game.plan.id, 1); assert.equal(app.context.bloomshotState.theme, 'depth-meadow'); assert.equal(app.context.bloomshotState.route, 'game');
  app.frame(); assert.equal(app.$('level-label').textContent, 'Level 1 · Wave 1/10'); assert.equal(app.$('level-name').textContent, 'Sunny Meadow');
});
// The first-time tutorial, played through the app's own board and buttons the way a player would: wait about a
// second on each card, then do what it says.
const Tutorial = require('../tutorial.js');
const TRAY_GROUP = { sunburst: 'power-left', dandelion: 'power-left', beeline: 'power-right', lullaby: 'power-right' };
function tapTutorial(app, action, finger) {
  if (action === 'fire') {
    const [x, y] = finger, canvas = app.$('game-canvas');
    canvas.emit('pointerdown', { isPrimary: true, pointerId: 1, clientX: x, clientY: y }); canvas.emit('pointerup', { pointerId: 1, clientX: x, clientY: y });
  } else if (action === 'rotate') app.click('rotate-btn');
  else if (action === 'split') app.click('split-btn');
  else app.click(TRAY_GROUP[action.slice(6)], { power: action.slice(6) });
}
function playTutorial(app, react = .8) {
  let shown = '', since = 0, acted = false, seconds = 0;
  const box = app.$('tutorial');
  while (box.dataset.phase !== 'end' && seconds < 90) {
    app.frame(17); seconds += .017;
    const key = `${app.$('tutorial-step').textContent}|${app.$('tutorial-text').textContent}|${box.dataset.phase}`;
    if (key !== shown) { shown = key; since = 0; acted = false; } else since += .017;
    if (box.dataset.phase !== 'prompt' || acted || since < react) continue;
    const step = Tutorial.steps[parseInt(app.$('tutorial-step').textContent, 10) - 1];
    const prompt = step.prompts.find(p => p.text === app.$('tutorial-text').textContent);
    tapTutorial(app, prompt.allow[0], prompt.finger); acted = true;
  }
  return seconds;
}
test('A brand-new player starts in the tutorial; a returning player goes straight to the levels', () => {
  const fresh = boot(undefined); fresh.frame(); fresh.frame();
  assert.equal(fresh.context.bloomshotState.route, 'game'); assert.equal(fresh.$('level-name').textContent, 'How to play');
  assert.equal(fresh.$('level-label').textContent, 'Tutorial'); assert.equal(fresh.context.document.body.dataset.tutorial, 'on');
  assert.equal(fresh.$('tutorial').hidden, false); assert.equal(fresh.$('tutorial-title').textContent, 'Aim and fire');
  assert.equal(fresh.$('tutorial-step').textContent, '1 of 7'); assert.equal(fresh.saved().tutorial, false);
  const back = boot(legacySave());
  assert.equal(back.context.bloomshotState.route, 'levels'); assert.equal(back.$('tutorial').hidden, true); assert.equal(back.saved().tutorial, true);
  // Someone who started a level or Rush before the tutorial existed but never finished one has seen the powerups tip.
  assert.equal(boot({ version: 1, powersMet: true }).context.bloomshotState.route, 'levels');
  assert.equal(fresh.saved().powersMet, false, 'the tutorial does not count as having started a run');
});
test('Played through on the real board, the tutorial finishes in under 46 seconds, spends none of the player\'s powerups and records nothing', () => {
  const app = boot(undefined), before = app.saved();
  const seconds = playTutorial(app);
  assert.equal(app.$('tutorial').dataset.phase, 'end'); assert(seconds < 46, `took ${seconds.toFixed(1)} s`);
  assert.equal(app.$('tutorial-go').hidden, false); assert.equal(app.$('tutorial-go').textContent, 'Play level 1');
  const during = app.saved();
  assert.deepEqual(during.powers, before.powers, 'the tutorial hands out its own uses');
  assert.deepEqual(during.rush, before.rush); assert.deepEqual(during.depths, {}); assert.equal(during.garden.seeds, before.garden.seeds);
  app.click('tutorial-go');
  const game = depthGame(app); assert.equal(game.plan.id, 1); assert.equal(app.context.document.body.dataset.tutorial, '');
  assert.equal(app.$('tutorial').hidden, true); assert.equal(app.saved().tutorial, true); assert.equal(app.saved().powersMet, true, 'no powerups tip after learning them');
  assert.notEqual(app.$('toast').textContent, 'New: powerups! Tap one above the board, then fire.');
  assert.equal(boot(app.saved()).context.bloomshotState.route, 'levels', 'it plays once');
});
test('While a card waits, only the control it names works; anything else just nudges the card', () => {
  const app = boot(undefined), before = app.saved().powers;
  for (let i = 0; i < 30; i++) app.frame(17);
  assert.equal(app.$('tutorial').dataset.phase, 'prompt'); const game = app.games.at(-1);
  app.click('power-left', { power: 'sunburst' }); assert.equal(game.armed, null);
  assert.equal(app.$('tutorial').dataset.nudge, '1');
  app.click('split-btn'); app.click('rotate-btn'); assert.equal(app.$('tutorial').dataset.nudge, '1', 'each blocked tap nudges again');
  assert.equal(game.balls.length, 0); assert.deepEqual(app.saved().powers, before);
  tapTutorial(app, 'fire', Tutorial.steps[0].prompts[0].finger); assert.equal(game.balls.length, 1, 'the shot on the card fires');
});
test('The petal card lights the petal on the board and the Turn petal button; touching the petal never turns it, the button does', () => {
  const app = boot(undefined), box = app.$('tutorial');
  let seconds = 0;
  // Play the first card, then wait for the petal card.
  while (!(box.dataset.phase === 'prompt' && app.$('tutorial-step').textContent === '1 of 7') && seconds < 5) { app.frame(17); seconds += .017; }
  tapTutorial(app, 'fire', Tutorial.steps[0].prompts[0].finger);
  while (!(box.dataset.phase === 'prompt' && app.$('tutorial-step').textContent === '2 of 7') && seconds < 15) { app.frame(17); seconds += .017; }
  app.frame(17);
  assert.equal(app.$('tutorial-text').textContent, Tutorial.steps[1].prompts[0].text);
  assert.equal(app.$('tutorial-spot').hidden, false); assert.equal(app.$('tutorial-spot-2').hidden, false); assert.equal(app.$('tutorial-dim').hidden, false);
  const hole = app.$('tutorial-hole-1').attributes, petal = app.games.at(-1).bumpers[0];
  // The test board fills 420 x 560 at the origin, so the hole is centred on the petal itself.
  assert.equal(hole.x + hole.width / 2, petal.x); assert.equal(hole.y + hole.height / 2, petal.y); assert.equal(hole.rx, hole.width / 2);
  assert(app.$('tutorial-hole-2').attributes.width > 0, 'the Turn petal button has its own hole');
  const before = petal.angle, canvas = app.$('game-canvas');
  canvas.emit('pointerdown', { isPrimary: true, pointerId: 1, clientX: petal.x + 12, clientY: petal.y - 12 });
  canvas.emit('pointerup', { pointerId: 1, clientX: petal.x + 12, clientY: petal.y - 12 });
  assert.equal(app.games.at(-1).bumpers[0].angle, before, 'a touch on the board aims and never turns the petal');
  assert.equal(app.$('tutorial-text').textContent, Tutorial.steps[1].prompts[0].text, 'the card still waits for Turn petal');
  app.click('rotate-btn');
  assert.notEqual(app.games.at(-1).bumpers[0].angle, before, 'Turn petal turned it');
  for (let i = 0; i < 6; i++) app.frame(17);
  assert.equal(app.$('tutorial-text').textContent, Tutorial.steps[1].prompts[1].text); assert.equal(app.$('tutorial-spot-2').hidden, true);
});
test('Skip ends it for good, and How to play can start it again', () => {
  const app = boot(undefined); app.frame(); app.click('tutorial-skip');
  assert.equal(app.context.bloomshotState.route, 'levels'); assert.equal(app.saved().tutorial, true); assert.equal(app.$('tutorial').hidden, true);
  assert.equal(app.$('toast').textContent, 'You can play the tutorial again from the ? button.');
  app.click('help-btn'); assert.equal(app.$('tutorial-replay').hidden, false);
  app.click('tutorial-replay'); app.frame();
  assert.equal(app.context.bloomshotState.route, 'game'); assert.equal(app.$('level-name').textContent, 'How to play'); assert.equal(app.$('help-dialog').open, false);
  app.click('help-btn'); assert.equal(app.$('tutorial-replay').hidden, true, 'no replay button while it plays');
  app.$('help-dialog').close(); app.$('toast').textContent = '';
  app.click('tutorial-skip'); assert.equal(app.context.bloomshotState.route, 'levels'); assert.equal(app.$('toast').textContent, '', 'the reminder only shows the first time');
});
test('Clearing a level saves its stars, pays run and first-clear seeds once, opens the next level and Next starts it', () => {
  const app = boot(legacySave()); app.click('depth-map', { depth: '1' });
  let game = depthGame(app); game.started = true; game.wave = 10; game.totalBlooms = 200; game.lives = 2; game.score = 5400; game._clearLevel(); settleLevel(app);
  let saved = app.saved();
  assert.deepEqual(saved.depths, { 1: { stars: 2, best: 5400, wave: 10 } }); assert.equal(saved.garden.depthBest[1], 2);
  assert.equal(saved.garden.seeds, 4 + 24 + 10); assert.equal(app.$('reward-seeds').textContent, '+34 seeds');
  assert.equal(app.$('result-dialog').open, true); assert.equal(app.$('result-eyebrow').textContent, 'Level 1 clear!');
  assert.equal(app.$('result-stars').hidden, false); assert.match(app.$('result-message').textContent, /Level 2, Root Tunnels, is open!/);
  assert.equal(app.$('next-btn').hidden, false); assert.equal(app.$('next-btn').textContent, 'Level 2'); assert.equal(app.$('result-garden-btn').textContent, 'All levels');
  app.click('retry-btn'); game = depthGame(app); assert.equal(game.plan.id, 1);
  game.started = true; game.wave = 10; game.totalBlooms = 200; game.lives = 2; game._clearLevel(); settleLevel(app);
  assert.equal(app.saved().garden.seeds, saved.garden.seeds + 24, 'the same stars pay only the run');
  game = depthGame(app); app.click('next-btn'); game = depthGame(app);
  assert.equal(game.plan.id, 2); assert.equal(app.context.bloomshotState.theme, 'depth-roots');
  const reloaded = boot(app.saved()); assert.match(reloaded.$('depth-map').innerHTML, /class="depth-card next" type="button" data-depth="2"/);
  assert.match(reloaded.$('levels-summary').textContent, /1 of 10 cleared · 2 ★/);
});
test('A level opened by a first clear greets the player on the map until they play it', () => {
  const app = boot(legacySave()); app.click('depth-map', { depth: '1' });
  let game = depthGame(app); game.started = true; game.wave = 10; game.lives = 3; game._clearLevel(); settleLevel(app);
  app.click('result-garden-btn');
  assert.match(app.$('depth-map').innerHTML, /class="depth-card next fresh" type="button" data-depth="2"/); assert.match(app.$('depth-map').innerHTML, /<span class="depth-new">New!<\/span>/);
  assert.equal((app.$('depth-map').innerHTML.match(/ fresh"/g) || []).length, 1, 'only the new level');
  app.click('depth-map', { depth: '2' }); app.click('rush-btn');
  assert(!app.$('depth-map').innerHTML.includes('fresh'), 'played once, it is just the next level');
  game = depthGame(app); assert.equal(game.plan.id, 2);
  app.click('depth-map', { depth: '1' }); game = depthGame(app); game.started = true; game.wave = 10; game.lives = 3; game._clearLevel(); settleLevel(app);
  app.click('result-garden-btn'); assert(!app.$('depth-map').innerHTML.includes('fresh'), 'a replayed level opens nothing new');
});
test('Running out of lives keeps the best wave, pays for the blooms, and Start over restarts the same level', () => {
  const app = boot(legacySave()); app.click('depth-map', { depth: '1' });
  let game = depthGame(app); game.started = true; game.wave = 6; game.totalBlooms = 90; game.score = 2100; game._lose(); settleLevel(app);
  const saved = app.saved(); assert.deepEqual(saved.depths, { 1: { stars: 0, best: 2100, wave: 6 } }); assert.deepEqual(saved.garden.depthBest, {});
  assert.equal(saved.garden.seeds, 4 + 14);
  assert.equal(app.$('result-eyebrow').textContent, 'Out of lives'); assert.equal(app.$('result-title').textContent, 'Wave 6 of 10');
  assert.equal(app.$('next-btn').hidden, true); assert.equal(app.$('retry-btn').textContent, 'Start over');
  app.click('retry-btn'); game = depthGame(app); assert.equal(game.plan.id, 1); assert.equal(game.wave, 1);
  app.click('back-btn'); assert.equal(app.context.bloomshotState.route, 'levels');
  assert.match(app.$('depth-map').innerHTML, /Best: wave 6 of 10/); assert.match(app.$('depth-map').innerHTML, /class="depth-card locked" type="button" data-depth="2"/);
});
test('Back goes to the level map, and an unfinished level resumes from its card or the resume card without restarting', () => {
  const app = boot(legacySave()); app.click('depth-map', { depth: '1' });
  const game = depthGame(app); assert(game.fire(0, -1)); app.frame();
  app.click('back-btn'); assert.equal(app.context.bloomshotState.route, 'levels');
  assert.equal(app.$('resume-btn').hidden, false); assert.equal(app.$('resume-title').textContent, 'Resume level 1');
  const count = app.games.length;
  app.click('resume-btn'); assert.equal(app.context.bloomshotState.route, 'game'); assert.equal(app.games.length, count);
  app.click('rush-btn'); app.click('depth-map', { depth: '1' }); assert.equal(app.games.length, count); assert.equal(app.games.at(-1), game);
  app.click('restart-btn'); assert.equal(app.games.length, count + 1); assert.equal(depthGame(app).plan.id, 1);
  app.click('rush-btn'); app.click('levels-rush-btn'); assert.equal(app.games.at(-1).plan, null, 'Meadow Rush is endless');
});
const cleared = (...ids) => { const save = legacySave(); save.depths = Object.fromEntries(ids.map(id => [id, { stars: 2, best: 1000, wave: 10 }])); return save; };
test('The levels unlock says what it holds and what it costs, buys only through the store, and opens level 5', () => {
  const offSale = boot(cleared(1, 2, 3, 4), { store: fakeStore({ live: true, available: false }) });
  assert.match(offSale.$('depth-map').innerHTML, /Not on sale yet\. Levels 1 to 4 are free to play now\./); assert(!offSale.$('depth-map').innerHTML.includes('data-buy'));
  const store = fakeStore({ live: true, available: true }), app = boot(cleared(1, 2, 3, 4), { store });
  const map = app.$('depth-map').innerHTML;
  assert.match(map, /data-buy="bloomshot\.levels\.full">Unlock levels 5 to 10 · \$2\.99</); assert.match(map, /6 deeper levels/);
  assert.match(map, /One-time purchase, no ads/); assert.match(map, /One payment\. Restore it any time in Settings\./);
  assert.match(map, /class="depth-card paid taste next" type="button" data-depth="5"/); assert.match(map, /First 3 waves free/);
  assert.match(map, /class="depth-card locked paid" type="button" data-depth="6"/);
  const count = app.games.length;
  app.click('depth-map', { depth: '6' }); assert.equal(app.games.length, count, 'a paid level never starts before the unlock');
  app.click('depth-map', { buy: Depths.product }); assert.deepEqual(store.purchases, [Depths.product]);
  const after = app.$('depth-map').innerHTML;
  assert(!after.includes('depth-unlock'), 'the offer is gone once owned'); assert.match(after, /class="depth-card next" type="button" data-depth="5"/);
  assert.match(after, /class="depth-card locked" type="button" data-depth="6"/, 'deeper levels still open in order');
  app.click('depth-map', { depth: '5' }); const game = depthGame(app);
  assert.equal(game.plan.id, 5); assert.equal(app.context.bloomshotState.theme, 'depth-lake'); assert(game.currents.length > 0, 'the lake brings its currents');
  assert.deepEqual(app.saved().depths, cleared(1, 2, 3, 4).depths, 'buying changes no progress');
});
test('Clearing level 4 offers a free taste of level 5; with the levels owned, Next goes straight to level 5', () => {
  const free = boot(cleared(1, 2, 3)); free.click('depth-map', { depth: '4' });
  let game = depthGame(free); game.started = true; game.wave = 10; game.lives = 3; game._clearLevel(); settleLevel(free);
  assert.equal(free.$('result-eyebrow').textContent, 'Level 4 clear!');
  assert.equal(free.$('result-message').textContent, 'Try the first 3 waves of level 5, Glowworm Lake, free!');
  assert.equal(free.$('next-btn').hidden, false); assert.equal(free.$('next-btn').textContent, 'Try it free');
  assert(free.$('next-btn').classList.contains('button-primary'), 'the taste is play, so it is the main button');
  assert(!free.$('retry-btn').classList.contains('primary')); assert.equal(free.$('result-offer').hidden, true, 'nothing is sold on this card');
  free.click('result-garden-btn');
  assert.match(free.$('depth-map').innerHTML, /class="depth-card paid taste next fresh" type="button" data-depth="5"/, 'the map greets the taste as new');
  free.click('rush-btn'); free.click('depth-map', { depth: '4' }); game = depthGame(free); game.started = true; game.wave = 10; game.lives = 3; game._clearLevel(); settleLevel(free);
  free.click('next-btn'); game = depthGame(free);
  assert.equal(game.plan.id, 5); assert.equal(game.plan.taste, true); assert.equal(game.finalWave, 3); assert.equal(free.context.bloomshotState.theme, 'depth-lake');
  free.frame(); assert.equal(free.$('level-label').textContent, 'Level 5 · Wave 1/3');
  const owner = boot(cleared(1, 2, 3), { store: fakeStore({ owned: [Depths.entitlement] }) }); owner.click('depth-map', { depth: '4' });
  game = depthGame(owner); game.started = true; game.wave = 10; game.lives = 3; game._clearLevel(); settleLevel(owner);
  assert.match(owner.$('result-message').textContent, /Level 5, Glowworm Lake, is open!/); assert.equal(owner.$('next-btn').textContent, 'Level 5');
  assert(owner.$('next-btn').classList.contains('button-primary'));
  owner.click('next-btn'); assert.equal(depthGame(owner).plan.id, 5);
});
test('A won level counts its score up and chimes each star; with Animations off the score shows at once', () => {
  const win = save => {
    const app = boot(save), sounds = []; app.context.BloomSound.play = (type, data) => sounds.push(type === 'star' ? `star${data.index}` : type);
    app.click('depth-map', { depth: '2' }); const game = depthGame(app);
    game.started = true; game.wave = 10; game.lives = 3; game.score = 2400; game._clearLevel();
    for (let i = 0; i < 200 && !app.$('result-dialog').open; i++) app.frame();
    assert.equal(app.$('result-dialog').open, true);
    return { app, sounds, final: app.$('result-score').textContent };
  };
  const { app, sounds, final } = win({ ...cleared(1), settings: { sound: true, haptics: true, motion: true } }), score = () => Number(app.$('result-score').textContent.replace(/\D/g, ''));
  assert(Number(final.replace(/\D/g, '')) >= 2400, 'the dialog opens with the real score in place');
  assert.match(app.$('result-stars').innerHTML, /^<span class="on" style="--i:0">★<\/span><span class="on" style="--i:1">★<\/span><span class="on" style="--i:2">★<\/span>$/);
  app.frame(); assert.equal(score(), 0, 'then counts up from zero');
  app.frame(400); assert(score() > 0 && score() < Number(final.replace(/\D/g, '')));
  for (let i = 0; i < 12; i++) app.frame(100);
  assert.equal(app.$('result-score').textContent, final); assert.deepEqual(sounds.filter(s => s.startsWith('star')), ['star0', 'star1', 'star2']);
  const still = win({ ...cleared(1), settings: { sound: true, haptics: true, motion: false } });
  for (let i = 0; i < 12; i++) still.app.frame(100);
  assert.equal(still.app.$('result-score').textContent, still.final); assert.deepEqual(still.sounds.filter(s => s.startsWith('star')), []);
});
test('A save from before powerups starts with one of each, and counts survive a reload', () => {
  const app = boot(legacySave()), saved = app.saved();
  assert.deepEqual(saved.powers, { sunburst: 1, dandelion: 1, beeline: 1, lullaby: 1 }); assert.deepEqual(saved.powerReceipts, []);
  const later = { ...saved, powers: { sunburst: 0, dandelion: 5, beeline: 2, lullaby: 0 } };
  assert.deepEqual(boot(later).saved().powers, later.powers, 'an emptied powerup stays empty after a reload');
});
test('The powerups tip waits for the first level, not the level map', () => {
  const app = boot(legacySave());
  assert.equal(app.saved().powersMet, false); assert.notEqual(app.$('toast').textContent, 'New: powerups! Tap one above the board, then fire.');
  app.click('depth-map', { depth: '1' });
  assert.equal(app.$('toast').textContent, 'New: powerups! Tap one above the board, then fire.'); assert.equal(app.saved().powersMet, true);
});
test('Picking a powerup and firing spends exactly one; picking it again first puts it back', () => {
  const app = boot(cleared(1)); app.click('depth-map', { depth: '1' });
  const game = depthGame(app);
  assert.match(app.$('power-left').innerHTML, /data-power="sunburst"/); assert.match(app.$('power-right').innerHTML, /data-power="lullaby"/);
  app.click('power-left', { power: 'sunburst' }); assert.equal(game.armed, 'sunburst');
  assert.match(app.$('power-left').innerHTML, /power-chip armed/); assert.equal(app.$('game-hint').textContent, 'Sunburst ready. Fire into a crowd!');
  app.click('power-left', { power: 'sunburst' }); assert.equal(game.armed, null); assert.equal(app.saved().powers.sunburst, 1, 'putting it back is free');
  app.click('power-left', { power: 'sunburst' }); game.fire(0, -1); app.frame();
  assert.equal(app.saved().powers.sunburst, 0); assert.equal(game.armed, null);
  app.click('power-left', { power: 'sunburst' }); assert.equal(game.armed, null);
  assert.equal(app.$('toast').textContent, 'No Sunburst left. Gift bubbles in the waves hold more.', 'an empty powerup sells nothing mid-run');
  assert.match(app.$('power-left').innerHTML, /power-chip empty/);
});
test('Lullaby waits for the first shot, then spends one', () => {
  const app = boot(cleared(1)); app.click('depth-map', { depth: '1' });
  const game = depthGame(app);
  app.click('power-right', { power: 'lullaby' }); assert.equal(game.lullaby, 0); assert.equal(app.saved().powers.lullaby, 1);
  assert.equal(app.$('toast').textContent, 'Fire your first seed, then use Lullaby.');
  game.fire(0, -1); app.frame(); app.click('power-right', { power: 'lullaby' }); app.frame();
  assert(game.lullaby > 0); assert.equal(app.saved().powers.lullaby, 0);
});
test('A caught gift is saved at once, before the run ends', () => {
  const app = boot(cleared(1)); app.click('depth-map', { depth: '1' });
  const game = depthGame(app);
  game.started = true; game._collect({ gift: 'beeline', x: 120, y: 90 }); app.frame();
  assert.equal(app.saved().powers.beeline, 2); assert.match(app.$('game-hint').textContent, /You caught a Bee Line! You have 2\./);
  assert.match(app.$('power-right').innerHTML, /aria-label="Bee Line, 2 left\./);
});
test('The powerup shelf shows counts, never sells on the web or before launch, and buys exactly one per tap', () => {
  const web = boot(legacySave()); web.click('rush-btn');
  assert.match(web.$('power-shelf').innerHTML, /You have 1/); assert(!web.$('power-shelf').innerHTML.includes('data-buy'));
  assert.match(web.$('power-shelf').innerHTML, /You can buy more in the Bloomshot app\. Gift bubbles in the waves hold more, free\./);
  assert.equal(web.$('power-total').textContent, '4 in your bag');
  const offSale = boot(legacySave(), { store: fakeStore({ live: true, available: false, powers: true }) }); offSale.click('rush-btn');
  assert.match(offSale.$('power-shelf').innerHTML, /Not on sale yet\./); assert(!offSale.$('power-shelf').innerHTML.includes('data-buy'));
  const store = fakeStore({ live: true, available: true, powers: true }), app = boot(legacySave(), { store }); app.click('rush-btn');
  assert.match(app.$('power-shelf').innerHTML, /data-buy="bloomshot\.power\.dandelion"[^>]*>Get 1 · \$0\.25</);
  assert.match(app.$('power-shelf').innerHTML, /Each button buys exactly what it says\./);
  app.click('power-shelf', { buy: 'bloomshot.power.dandelion' });
  assert.deepEqual(store.purchases, ['bloomshot.power.dandelion']); assert.equal(app.saved().powers.dandelion, 2);
  assert.deepEqual(app.saved().powerReceipts, ['T1']);
  assert.equal(store.replay('bloomshot.power.dandelion', 'T1'), true, 'a replayed purchase is acknowledged');
  assert.equal(app.saved().powers.dandelion, 2, 'and adds nothing');
  store.replay('bloomshot.power.lullaby', 'T9'); assert.equal(app.saved().powers.lullaby, 2, 'a purchase finished after a restart still arrives');
  for (const id of ['sunburst', 'beeline']) assert.equal(app.saved().powers[id], 1, 'buying one never touches the others');
});
test('Packs on the shelf: five of one kind or the bag with three of each, shown in full, each counted once', () => {
  const offSale = boot(legacySave(), { store: fakeStore({ live: true, available: false, powers: true }) }); offSale.click('rush-btn');
  assert(!offSale.$('power-shelf').innerHTML.includes('Get 5') && !offSale.$('power-shelf').innerHTML.includes('Powerup Bag'));
  const store = fakeStore({ live: true, available: true, powers: true }), app = boot(legacySave(), { store }); app.click('rush-btn');
  const shelf = app.$('power-shelf').innerHTML;
  for (const p of Powers.list) assert.match(shelf, new RegExp(`data-buy="bloomshot\\.pack\\.${p.id}5"[^>]*>Get 5 · \\$0\\.99<`));
  assert.match(shelf, /Powerup Bag/); assert.match(shelf, /3 of each, 12 in all\./); assert.match(shelf, /data-buy="bloomshot\.pack\.bag12"[^>]*>Get the bag · \$1\.99</);
  app.click('power-shelf', { buy: 'bloomshot.pack.sunburst5' });
  assert.equal(app.saved().powers.sunburst, 6);
  assert.deepEqual(['dandelion', 'beeline', 'lullaby'].map(id => app.saved().powers[id]), [1, 1, 1]);
  app.click('power-shelf', { buy: 'bloomshot.pack.bag12' });
  assert.deepEqual(app.saved().powers, { sunburst: 9, dandelion: 4, beeline: 4, lullaby: 4 });
  assert.deepEqual(app.saved().powerReceipts, ['T1', 'T2']);
  assert.equal(store.replay('bloomshot.pack.bag12', 'T2'), true); assert.equal(store.replay('bloomshot.pack.sunburst5', 'T1'), true);
  assert.deepEqual(app.saved().powers, { sunburst: 9, dandelion: 4, beeline: 4, lullaby: 4 }, 'a pack handed over again adds nothing');
  store.replay('bloomshot.pack.bag12', 'T7'); assert.deepEqual(app.saved().powers, { sunburst: 12, dandelion: 7, beeline: 7, lullaby: 7 }, 'a bag finished after a restart still arrives whole');
  assert.deepEqual(store.purchases, ['bloomshot.pack.sunburst5', 'bloomshot.pack.bag12']);
});
const tasteReady = (store) => { const app = boot(cleared(1, 2, 3, 4), store ? { store } : {}); app.click('depth-map', { depth: '5' }); return { app, game: depthGame(app) }; };
test('The free taste plays the first three waves of level 5, records no progress, and pays only for its blooms', () => {
  const { app, game } = tasteReady();
  assert.equal(game.plan.id, 5); assert.equal(game.plan.taste, true); assert.equal(game.finalWave, 3);
  const before = app.saved();
  game.started = true; game.wave = 3; game.totalBlooms = 40; game.lives = 3; game.score = 1900; game._clearLevel(); settleLevel(app);
  const after = app.saved();
  assert.deepEqual(after.depths, before.depths, 'a taste records no level progress'); assert(!after.garden.depthBest[5], 'and earns no stars');
  assert.equal(after.garden.seeds, before.garden.seeds + 6, 'its blooms and waves pay like any finished run');
  assert.equal(app.$('result-eyebrow').textContent, 'Free taste done!'); assert.equal(app.$('result-stars').hidden, true);
  assert.equal(app.$('result-message').textContent, 'Waves 4 to 10 of Glowworm Lake, and the 5 levels below it, come with the one-time unlock.');
  assert.equal(app.$('result-offer').hidden, false); assert.match(app.$('result-offer').innerHTML, /Levels 5 to 10 unlock in the Bloomshot app/);
  assert.equal(app.$('next-btn').hidden, true); assert.equal(app.$('share-btn').hidden, true, 'a taste is not a clear to share');
  app.click('retry-btn'); const again = depthGame(app); assert.equal(again.plan.taste, true, 'Play the taste again replays the taste');
  again.started = true; again.wave = 2; again._lose(); settleLevel(app);
  assert.equal(app.$('result-eyebrow').textContent, 'Out of lives'); assert.equal(app.$('result-offer').hidden, true, 'nothing is offered after a loss');
  assert.equal(app.$('result-offer').innerHTML, '');
});
test('Bought from the taste card, the unlock gives way to the full level 5', () => {
  const store = fakeStore({ live: true, available: true }), { app, game } = tasteReady(store);
  game.started = true; game.wave = 3; game.lives = 2; game._clearLevel(); settleLevel(app);
  const offer = app.$('result-offer').innerHTML;
  assert.match(offer, /data-buy="bloomshot\.levels\.full">Unlock levels 5 to 10 · \$2\.99</); assert.match(offer, /Get everything · \$6\.99/);
  app.click('result-offer', { buy: Depths.product }); assert.deepEqual(store.purchases, [Depths.product]);
  assert.equal(app.$('result-offer').hidden, true); assert.equal(app.$('next-btn').hidden, false); assert.equal(app.$('next-btn').textContent, 'Play Glowworm Lake');
  app.click('next-btn'); const full = depthGame(app); assert.equal(full.plan.id, 5); assert.equal(full.plan.taste, false); assert.equal(full.finalWave, 10);
  app.click('rush-btn'); assert(!app.$('depth-map').innerHTML.includes('taste'), 'owned, level 5 is just the next level');
});
test('No taste before level 4 is cleared or once the levels are owned', () => {
  const early = boot(cleared(1, 2, 3)); const count = early.games.length;
  early.click('depth-map', { depth: '5' }); assert.equal(early.games.length, count);
  const owner = boot(cleared(1, 2, 3, 4), { store: fakeStore({ owned: [Depths.entitlement] }) });
  owner.click('depth-map', { depth: '5' }); assert.equal(depthGame(owner).plan.taste, false); assert.equal(depthGame(owner).finalWave, 10);
});
test('Level records are cleaned on load and a cleared level opens the next one', () => {
  const before = legacySave(); before.depths = { 1: { stars: 9, best: -5, wave: 3 }, 2: 'bad', 3: [], 12: { stars: 1, best: 1, wave: 1 } };
  const app = boot(before); assert.deepEqual(app.saved().depths, { 1: { stars: 3, best: 0, wave: 3 } });
  assert.match(app.$('depth-map').innerHTML, /class="depth-card next" type="button" data-depth="2"/);
  for (const field of ['progress', 'rush', 'daily', 'settings']) assert.deepEqual(app.saved()[field], before[field]);
});
testAsync('Buying says exactly what arrived: one, five, or the bag', async () => {
  const store = fakeStore({ live: true, available: true, powers: true }), app = boot(legacySave(), { store }); app.click('rush-btn');
  app.click('power-shelf', { buy: 'bloomshot.power.dandelion' }); await settled(); assert.equal(app.$('toast').textContent, '+1 Dandelion! You have 2.');
  app.click('power-shelf', { buy: 'bloomshot.pack.sunburst5' }); await settled(); assert.equal(app.$('toast').textContent, '+5 Sunburst! You have 6.');
  app.click('power-shelf', { buy: 'bloomshot.pack.bag12' }); await settled(); assert.equal(app.$('toast').textContent, '+12 powerups! 3 of each.');
  app.click('depth-map', { buy: BUNDLE }); await settled();
  assert.equal(app.$('toast').textContent, 'Complete Garden unlocked! Levels 5 to 10, Koi pools and seed styles are yours.');
});
const clearDepth = (app, id, lives = 3) => { app.click('depth-map', { depth: String(id) }); const game = depthGame(app); game.started = true; game.wave = 10; game.lives = lives; game.score = 5400; game._clearLevel(); settleLevel(app); return game; };
testAsync('A level clear shares a short note and the web link through the phone\'s share sheet', async () => {
  const shared = [], play = 'https://play.google.com/store/apps/details?id=dev.bloomshot.game';
  const bridge = { ...fakeNative(), link: play, share: async payload => { shared.push(payload); return { ok: true, via: 'sheet' }; } };
  const app = boot(cleared(1, 2, 3, 4), { native: bridge, store: fakeStore({ owned: [Depths.entitlement] }) });
  clearDepth(app, 5, 2); assert.equal(app.$('share-btn').hidden, false);
  app.click('share-btn'); await settled();
  assert.equal(shared.length, 1); assert.equal(shared[0].url, play, 'the app shares the link it was given (the Play Store page on Android)');
  assert.equal(shared[0].text, 'Bloomshot · Level 5, Glowworm Lake 🌸\n⭐⭐ 2/3 · 5,400 points');
  const lost = boot(cleared(1)); lost.click('depth-map', { depth: '2' }); const game = depthGame(lost); game.started = true; game.wave = 4; game._lose(); settleLevel(lost);
  assert.equal(lost.$('share-btn').hidden, true, 'a lost level has nothing to share');
});
testAsync('A new Meadow Rush best can be shared; without a share sheet the note is copied for pasting', async () => {
  const app = boot(legacySave()); let copied = null;
  app.context.navigator.clipboard = { writeText: async text => { copied = text; } };
  app.finishRush(); for (let i = 0; i < 40; i++) app.frame();
  assert.equal(app.$('share-btn').hidden, false);
  app.click('share-btn'); await settled();
  assert.equal(copied, 'Bloomshot · Meadow Rush 🌼\nNew best: wave 3 · 3,200 points\nhttps://vexno1r.github.io/Bloomshot/');
  assert.equal(app.$('toast').textContent, 'Copied! Paste it in a chat.');
  app.click('retry-btn'); app.finishRush(); for (let i = 0; i < 40; i++) app.frame();
  assert.equal(app.$('share-btn').hidden, true, 'a run that sets no new best shows no share');
});
testAsync('The daily garden shares its number, stars and a tiny picture of each shot, like a word-game grid', async () => {
  const shared = [], bridge = { ...fakeNative(), share: async payload => { shared.push(payload); return { ok: true }; } };
  const app = boot(legacySave(), { today: SATURDAY, native: bridge }); app.click('garden-btn'); app.click('daily-btn');
  const game = app.games.at(-1), total = game.buds.length;
  // Three shots: one misses, one blooms a few, the last blooms the rest and wins.
  const bloom = count => game.buds.slice(0, count).forEach(bud => { bud.bloomed = true; });
  game.event('ready', { blooms: 0 }); app.frame();
  bloom(Math.ceil(total * .3)); game.event('ready', { blooms: game.bloomedCount }); app.frame();
  bloom(total); finishDaily(app);
  assert.equal(app.$('share-btn').hidden, false);
  app.click('share-btn'); await settled();
  assert.match(shared[0].text, /^Bloomshot daily garden #3\n⭐+ \d\/3\n🍂🌷💐$/u);
  const cancelled = { ...fakeNative(), share: async () => ({ ok: false, cancelled: true }) }, quiet = boot(legacySave(), { today: SATURDAY, native: cancelled });
  quiet.click('garden-btn'); quiet.click('daily-btn'); finishDaily(quiet); quiet.click('share-btn'); await settled();
  assert.notEqual(quiet.$('toast').textContent, 'Sharing is not available here.', 'closing the share sheet is not an error');
  const copier = { ...fakeNative(), share: async () => ({ ok: true, via: 'copied' }) }, copy = boot(legacySave(), { today: SATURDAY, native: copier });
  copy.click('garden-btn'); copy.click('daily-btn'); finishDaily(copy); copy.click('share-btn'); await settled();
  assert.equal(copy.$('toast').textContent, 'Copied! Paste it in a chat.', 'a share that fell back to the clipboard says so');
  const none = { ...fakeNative(), share: async () => ({ ok: false }) }, stuck = boot(legacySave(), { today: SATURDAY, native: none });
  stuck.click('garden-btn'); stuck.click('daily-btn'); finishDaily(stuck); stuck.click('share-btn'); await settled();
  assert.equal(stuck.$('toast').textContent, 'Sharing is not available here.');
});
// The wave-6 checkpoint: a free, unlimited restart after a late loss, with stars capped at two and said so.
test('A level lost at wave 6 or later offers a free restart from wave 6 that starts there with three fresh lives', () => {
  const app = boot(legacySave()); app.click('depth-map', { depth: '1' });
  let game = depthGame(app); game.started = true; game.wave = 7; game.score = 2400; game.lives = 0; game._lose(); settleLevel(app);
  assert.equal(app.$('result-dialog').open, true); assert.equal(app.$('result-eyebrow').textContent, 'Out of lives');
  assert.equal(app.$('checkpoint-btn').hidden, false); assert.equal(app.$('checkpoint-btn').textContent, 'Try from wave 6');
  assert(app.$('checkpoint-btn').classList.contains('primary'), 'the restart from wave 6 leads');
  assert.equal(app.$('retry-btn').textContent, 'Start over'); assert(!app.$('retry-btn').classList.contains('primary'), 'starting over is the quiet choice');
  assert.match(app.$('result-message').textContent, /A run from wave 6 can earn up to two stars\.$/, 'the card says plainly what the restart can earn');
  const count = app.games.length;
  app.click('checkpoint-btn'); game = depthGame(app);
  assert.equal(app.games.length, count + 1, 'a new run'); assert.equal(game.plan.id, 1); assert.equal(game.plan.taste, false);
  assert.equal(game.wave, 6); assert.equal(game.startWave, 6); assert.equal(game.lives, 3); assert.equal(game.score, 0);
  assert.equal(app.$('result-dialog').open, false); assert.equal(app.$('checkpoint-btn').hidden, true);
  app.frame(); assert.equal(app.$('level-label').textContent, 'Level 1 · Wave 6/10');
  // Losing the restarted run late offers it again: the checkpoint has no limit.
  game.started = true; game.wave = 9; game._lose(); settleLevel(app);
  assert.equal(app.$('checkpoint-btn').hidden, false);
  app.click('retry-btn'); game = depthGame(app); assert.equal(game.wave, 1, 'Start over begins at wave 1'); assert.equal(game.startWave, 1);
  // An early loss offers only the usual restart.
  game.started = true; game.wave = 5; game._lose(); settleLevel(app);
  assert.equal(app.$('checkpoint-btn').hidden, true); assert.equal(app.$('retry-btn').textContent, 'Try again');
  assert.match(app.$('result-message').textContent, /Try a new angle\.$/);
});
test('A checkpoint run pays seeds only for the waves it played, so restarting at wave 6 is never a seed farm', () => {
  const app = boot(legacySave()); app.click('depth-map', { depth: '1' });
  let game = depthGame(app); game.started = true; game.wave = 6; game._lose(); settleLevel(app);
  const seeds = () => app.saved().garden.seeds, before = seeds();
  app.click('checkpoint-btn'); game = depthGame(app); assert.equal(game.startWave, 6);
  game.started = true; game._lose(); settleLevel(app);
  assert.equal(seeds() - before, 0, 'losing straight away at wave 6 earns nothing for waves 1 to 5');
  app.click('checkpoint-btn'); game = depthGame(app);
  game.started = true; game.wave = 8; game.totalBlooms = 40; game._lose(); settleLevel(app);
  assert.equal(seeds() - before, 4 + 2, 'forty blooms and the two waves it cleared');
});
test('A level cleared from the checkpoint records at most two stars and says how to earn three', () => {
  const app = boot(legacySave()); app.click('depth-map', { depth: '1' });
  let game = depthGame(app); game.started = true; game.wave = 8; game._lose(); settleLevel(app);
  app.click('checkpoint-btn'); game = depthGame(app); assert.equal(game.startWave, 6);
  game.started = true; game.wave = 10; game.lives = 3; game.score = 5000; game._clearLevel(); settleLevel(app);
  assert.equal(game.stars, 2); assert.equal(app.saved().depths[1].stars, 2, 'three lives kept, but only two stars from wave 6');
  assert.equal(app.$('result-message').textContent, 'Cleared from wave 6! Level 2 is open. Start at wave 1 for three stars.');
  assert.match(app.$('result-stars').innerHTML, /(class="on"[^]*){2}class="off"/);
  assert.equal(app.$('checkpoint-btn').hidden, true); assert.equal(app.$('retry-btn').textContent, 'Replay');
  // Replay starts the full run from wave 1, which can still earn the third star.
  app.click('retry-btn'); game = depthGame(app); assert.equal(game.wave, 1); assert.equal(game.startWave, 1);
  game.started = true; game.wave = 10; game.lives = 3; game._clearLevel(); settleLevel(app);
  assert.equal(app.saved().depths[1].stars, 3);
});
test('Nothing is offered for sale after a loss, even with the checkpoint showing, and a free taste has no checkpoint', () => {
  const store = fakeStore({ live: true, available: true }), app = boot(cleared(1, 2, 3), { store });
  app.click('depth-map', { depth: '4' });
  let game = depthGame(app); game.started = true; game.wave = 7; game._lose(); settleLevel(app);
  assert.equal(app.$('checkpoint-btn').hidden, false); assert.equal(app.$('result-offer').hidden, true); assert.equal(app.$('result-offer').innerHTML, '');
  app.click('checkpoint-btn'); game = depthGame(app); assert.equal(game.plan.id, 4); assert.equal(game.wave, 6);
  game.started = true; game.wave = 6; game._lose(); settleLevel(app);
  assert.equal(app.$('result-offer').hidden, true); assert.deepEqual(store.purchases, [], 'no purchase was started');
  const taste = boot(cleared(1, 2, 3, 4), { store: fakeStore({ live: true, available: true }) }); taste.click('depth-map', { depth: '5' });
  const sample = depthGame(taste); assert.equal(sample.plan.taste, true);
  sample.started = true; sample.wave = 3; sample._lose(); settleLevel(taste);
  assert.equal(taste.$('checkpoint-btn').hidden, true); assert.equal(taste.$('result-offer').hidden, true);
});
test('Super Bloom, trick shots and long chains reach the board, the hint line and the run summary', () => {
  const app = boot(legacySave()); app.click('depth-map', { depth: '1' });
  const game = depthGame(app); game.started = true; game.status = 'flying'; app.frame();
  game._charge(28.8, { by: 1 }); app.frame();
  assert.equal(app.$('fever-banner').hidden, false); assert.equal(app.$('fever-banner').textContent, 'Super Bloom!');
  assert.equal(app.$('fever-banner').getAttribute('aria-label'), 'Super Bloom, double points');
  assert(Number(app.$('game-canvas').dataset.superBloom) > 5); assert.equal(app.$('game-canvas').dataset.sun, '0.00');
  assert.equal(app.$('game-hint').textContent, 'Super Bloom! Seeds fly through flowers.');
  assert(game.floaters.some(f => f.kind === 'wave' && f.text === 'Super Bloom!' && f.label === 'seeds fly through flowers'), 'the first one says what it does');
  game.superBloom = .001; app.frame();
  assert.equal(game.superBloom, 0); assert.equal(app.$('fever-banner').hidden, true);
  assert.equal(app.$('game-hint').textContent, 'Drag up and let go. Crowns bloom their whole bunch.', 'the wave hint comes back');
  game.floaters = []; game._charge(48, { by: 1 }); app.frame();
  // Later ones leave the middle of the board to the flowers: the gold sky, the banner (straight away) and the hint say it.
  assert(!game.floaters.some(f => f.kind === 'wave' && f.text === 'Super Bloom!'), 'later ones keep the board clear');
  assert.equal(app.$('fever-banner').hidden, false); assert(app.$('fever-banner').classList.contains('soon'), 'the banner comes at once');
  assert.equal(app.$('game-hint').textContent, 'Super Bloom! Double points.');
  const bud = game.buds.find(b => !b.bloomed); game._trick('bank', bud, 1, false); app.frame();
  const stamp = game.floaters.find(f => f.kind === 'trick');
  assert.deepEqual({ trick: stamp.trick, text: stamp.text, label: stamp.label }, { trick: 'bank', text: 'Bank shot!', label: '+300' });
  assert(stamp.y > game.dangerY && stamp.y < 545, 'the stamp lands in the lane by the pod, under the danger line, clear of the flowers');
  assert.equal(app.$('announcement').textContent, 'Bank shot!');
  // One stamp at a time, at most one every two seconds; the trick still counts and is announced.
  const tricks = game.trickCount; game._trick('rebound', bud, 1, false); app.frame();
  assert.equal(game.floaters.filter(f => f.kind === 'trick').length, 1); assert.equal(game.floaters.find(f => f.kind === 'trick').trick, 'bank');
  assert.equal(game.trickCount, tricks + 1); assert.equal(app.$('announcement').textContent, 'Rebound!');
  // Praise waits for real chains: nothing at 5, the first word at 8, the next at 16.
  const praise = () => game.floaters.filter(f => f.kind === 'combo').map(f => f.text);
  game.floaters = []; game.event('bloom', { bud, gain: 100, combo: 5, mult: 2, chain: false }); app.frame(); assert.deepEqual(praise(), []);
  game.event('bloom', { bud, gain: 100, combo: 8, mult: 2, chain: false }); app.frame(); assert.deepEqual(praise(), ['Lovely!']);
  game.event('bloom', { bud, gain: 100, combo: 16, mult: 4, chain: false }); app.frame(); assert.deepEqual(praise(), ['Blooming!']);
  game.event('chainEnd', { chain: 6 }); app.frame(); assert.deepEqual(praise(), ['Blooming!'], 'a short chain ends quietly');
  game.event('chainEnd', { chain: 17 }); app.frame(); assert.deepEqual(praise(), ['17 in a row!']);
  // The endless run's summary counts its trick shots.
  app.click('back-btn'); app.click('levels-rush-btn');
  const run = app.games.at(-1); assert.equal(run.plan, null); run.started = true; run.trickCount = 3; run.totalBlooms = 30; run.wave = 4; run._lose(); settleLevel(app);
  assert.match(app.$('result-message').textContent, / · 3\u00a0tricks$/); assert.equal(app.$('checkpoint-btn').hidden, true);
});
(async () => {
for (const { name, fn } of later) {
  try { await fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  methodology: 'Executes the complete current app.js in an isolated Node VM using real garden/level/engine modules, fake localStorage, and DOM/canvas adapters. Completion fixtures exercise actual engine completion events and app handlers. No real browser or user saves are read or changed.',
  limitations: ['DOM and canvas adapters verify integration state, not visual appearance, accessibility behavior, or browser-specific storage.',
    'Completion fixtures do not measure gameplay difficulty; dedicated physics and Rush tests cover mechanics.'], results };
fs.writeFileSync(path.join(__dirname, 'save-integration-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
})();
