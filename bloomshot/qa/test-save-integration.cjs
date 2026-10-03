'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Garden = require('../garden.js');
const Levels = require('../levels.js');
const Moon = require('../moon.js');
const Koi = require('../koi.js');
const Keepsakes = require('../keepsakes.js');
const Engine = require('../engine.js');
const Rush = require('../rush.js');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
const clone = value => JSON.parse(JSON.stringify(value));
function legacySave() {
  return { version: 1, progress: { 1: { best: 1234, stars: 3, attempts: 2 }, 2: { best: 5678, stars: 2, attempts: 5 } },
    daily: { 'daily-2026-10-01': { best: 1350, stars: 2, attempts: 1 } },
    rush: { best: 2100, bestWave: 3, runs: 5, blooms: 25 }, lastLevel: 2,
    settings: { sound: false, haptics: false, motion: false } };
}
// Future worlds still open as visual previews; one is added here so that path stays covered.
const FUTURE = { id: 'orchard', name: 'Night Orchard', tagline: 'Soon.', description: 'A future garden.', price: null, theme: 'moon', available: false, mechanic: 'Planned.' };
function fakeStore({ owned = [], live = false, available = false, price = '$4.99', stylePrice = '$1.99', mode = 'native' } = {}) {
  const have = new Set(owned), listeners = [], purchases = [];
  const catalog = [{ id: Koi.product, entitlement: Koi.entitlement, kind: 'world', price }, { id: Keepsakes.product, entitlement: Keepsakes.entitlement, kind: 'style', price: stylePrice }];
  return { mode, busy: false, purchases, isLive: () => live, owns: id => have.has(id), revoke: id => have.delete(id),
    products: () => catalog.map(item => ({ ...item, available, owned: have.has(item.entitlement) })),
    purchase: id => { purchases.push(id); have.add(catalog.find(item => item.id === id).entitlement); listeners.forEach(fn => fn({ type: 'entitlements' })); return Promise.resolve({ ok: true }); },
    subscribe: fn => { listeners.push(fn); } };
}
function boot(raw, { storageFails = false, search = '', otherSave, store } = {}) {
  const key = search.includes('qa') ? 'bloomshot.qa.v1' : 'bloomshot.save.v1';
  const storage = new Map();
  if (raw !== undefined) storage.set(key, JSON.stringify(raw));
  if (otherSave) storage.set(key === 'bloomshot.qa.v1' ? 'bloomshot.save.v1' : 'bloomshot.qa.v1', JSON.stringify(otherSave));
  const writes = [], nodes = new Map(), games = [], meadowDraws = [], boardDraws = [];
  let nextFrame, now = 0, uuid = 0;
  const noop = () => {};
  const brush = new Proxy({ globalAlpha: 1, createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }) }, { get: (target, name) => name in target ? target[name] : noop });
  function element(id = '') {
    const handlers = new Map(), childrenBySelector = new Map(), classes = new Set();
    const node = { id, dataset: {}, children: [], style: { setProperty: noop }, attributes: {}, nextElementSibling: { textContent: '' },
      hidden: false, disabled: false, open: false, checked: false, textContent: '', width: 0, height: 0,
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
  class ObservedRush extends Rush.RushGame { constructor() { super(); games.push(this); } }
  const context = vm.createContext({ console, structuredClone, URLSearchParams, Date, Math, Map, Set,
    document, location: { search }, navigator: {}, crypto: { randomUUID: () => 'test-run-' + (++uuid) },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => {
      if (storageFails) throw new Error('Storage blocked'); storage.set(name, value); writes.push({ key: name, value });
    } },
    performance: { now: () => now }, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout: () => 1, clearTimeout: noop,
    BloomLevels: { ...Levels, worlds: [...Levels.worlds, FUTURE] }, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, ...(store ? { BloomStore: store } : {}), BloomEngine: { ...Engine, Game: ObservedGame }, BloomRush: { RushGame: ObservedRush },
    BloomSound: { wake: noop, play: noop, setEnabled: noop }, BloomKeepsakes: Keepsakes,
    BloomArt: { draw: (ctx, state, time, options) => boardDraws.push(options.keepsake ? options.keepsake.id : 'meadow'), drawFlower: noop, drawMoon: noop, koiFish: noop,
      drawGarden: noop, drawProjectile: noop, drawParticle: noop, drawSeed: noop },
    BloomMeadow: { plots: Garden.plots.map((p, i) => ({ id: p.id, x: 65 + i * 50, y: 150, labelY: 180, accent: p.color })),
      draw: (ctx, options) => meadowDraws.push(clone(options)) }
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
    // An engine completion fixture tests the app's event boundary, not the run's physics.
    game.totalBlooms = blooms; game.wave = wave; game.score = 3200; game._lose(); frame(); return game;
  }
  return { $, click, frame, preview, finishRush, context, games, meadowDraws, boardDraws, writes, storage,
    saved: () => JSON.parse(storage.get(key)), key };
}

test('Startup migrates an old save once and preserves all existing progress and preferences', () => {
  const before = legacySave(); const app = boot(before); const after = app.saved();
  for (const field of ['progress', 'daily', 'rush', 'lastLevel', 'settings']) assert.deepEqual(after[field], before[field]);
  assert.equal(after.garden.seeds, 4); assert.equal(after.garden.starterSeeds, 4);
  assert.equal(Garden.summary(after.garden).totalStages, 0); assert(app.writes.length >= 1);
  assert.deepEqual(boot(after).saved(), after);
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
  assert.equal(app.$('result-dialog').open, true); assert.deepEqual(app.saved(), completed);
});
test('Restarting an unfinished run does not grant rewards', () => {
  const app = boot(legacySave()); const before = app.saved();
  const game = app.games.at(-1); game.totalBlooms = 24; game.wave = 3;
  app.click('restart-btn');
  assert.equal(app.games.length, 2); assert.deepEqual(app.saved(), before);
});
test('Visual previews grant no progress and restore the original in-progress run ID for its reward', () => {
  const app = boot(legacySave()); const original = app.games.at(-1); const before = app.saved();
  app.preview(); assert.equal(app.context.bloomshotState.preview, true);
  const previewGame = app.games.at(-1); previewGame.win(); app.frame();
  assert.deepEqual(app.saved(), before);
  app.click('worlds-btn'); app.click('rush-btn');
  assert.equal(app.context.bloomshotState.preview, false); assert.equal(app.context.bloomshotState.mode, 'rush');
  original.totalBlooms = 24; original.wave = 3; original._lose(); app.frame();
  assert.equal(app.saved().garden.totalSeedsEarned, 8);
  assert.deepEqual(app.saved().garden.receipts, ['test-run-1']);
});
test('Visual preview restoration retains an already-earned result amount without regranting', () => {
  const app = boot(legacySave()); app.finishRush(); app.click('garden-btn'); const earned = app.saved();
  app.preview(); app.click('worlds-btn'); app.click('rush-btn');
  assert.equal(app.$('reward-seeds').textContent, '+8 seeds'); assert.equal(app.$('garden-reward').hidden, false);
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
  assert.equal(app.$('reward-seeds').textContent, '+12 seeds'); assert.deepEqual(app.saved(), after);
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
  assert.equal(app.$('result-dialog').open, true); assert.equal(app.$('next-btn').textContent, 'See all eight pools');
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
  assert.match(notForSale.$('world-detail').innerHTML, /not on sale yet/); assert(!notForSale.$('world-detail').innerHTML.includes('data-buy'));
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
const moonThrough = count => Object.fromEntries(Moon.levels.slice(0, count).map(level => [level.id, { best: 700, stars: 2, attempts: 1 }]));
test('Keepsakes: a fresh garden wears Meadow, every style previews, and locked styles never go on the seed', () => {
  const before = legacySave(), app = boot(before);
  assert.equal(app.saved().keepsake, 'meadow'); assert.deepEqual(app.saved().settings, before.settings);
  app.click('collection-btn'); app.frame();
  const grid = app.$('keepsake-grid').innerHTML;
  for (const style of Keepsakes.styles) assert(grid.includes(`data-keepsake="${style.id}"`), style.id);
  assert.match(grid, /Wearing now/); assert.match(grid, /0 of 6 Moon trials/); assert.match(grid, /Keepsake Collection/);
  assert.match(app.$('keepsake-offer').innerHTML, /available in the Bloomshot app/); assert(!app.$('keepsake-offer').innerHTML.includes('data-buy'));
  for (const id of ['sakura', 'moonlit']) {
    app.click('keepsake-shelf', { keepsake: id }); app.frame();
    assert.equal(app.saved().keepsake, 'meadow'); assert.match(app.$('keepsake-grid').innerHTML, new RegExp(`data-keepsake="${id}" aria-pressed="true"`));
  }
  assert.match(app.$('keepsake-caption').innerHTML, /Earned, never sold/);
  app.click('rush-btn'); app.frame(); assert.equal(app.boardDraws.at(-1), 'meadow');
});
test('Clearing the last Moon trial earns Moonlit once, the result offers to wear it, and play draws it', () => {
  const before = legacySave(); before.moon = moonThrough(5);
  const app = boot(before);
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'moon' });
  assert.match(app.$('world-detail').innerHTML, /Clear all six trials to earn the Moonlit seed/);
  app.click('world-preview-btn'); const game = app.games.at(-1); assert.equal(game.level.id, 'moon-6');
  game.fire(0, -1); game.win(); for (let i = 0; i < 12; i++) app.frame(60);
  assert.equal(app.$('result-dialog').open, true); assert.equal(app.$('reward-flower').hidden, false);
  assert.match(app.$('reward-flower').innerHTML, /NEW KEEPSAKE EARNED/); assert.match(app.$('reward-flower').innerHTML, /data-wear="moonlit"/);
  assert.equal(app.saved().keepsake, 'meadow');
  app.click('reward-flower', { wear: 'moonlit' }); assert.equal(app.saved().keepsake, 'moonlit');
  app.click('retry-btn'); app.games.at(-1).fire(0, -1); app.games.at(-1).win(); for (let i = 0; i < 12; i++) app.frame(60);
  assert.equal(app.$('reward-flower').hidden, true, 'a replay does not announce it again');
  assert.equal(app.boardDraws.at(-1), 'moonlit');
  const reloaded = boot(app.saved()); reloaded.frame(); assert.equal(reloaded.boardDraws.at(-1), 'moonlit');
  reloaded.click('worlds-btn'); reloaded.click('worlds-grid', { world: 'moon' });
  assert.match(reloaded.$('world-detail').innerHTML, /You earned the Moonlit seed/);
});
test('The Keepsake Collection shows the store price, buys only through the store, and a refund falls back to Meadow without forgetting', () => {
  const save = legacySave(); save.settings.motion = true;
  const notForSale = boot(save, { store: fakeStore({ live: true, available: false }) });
  notForSale.click('collection-btn'); assert.match(notForSale.$('keepsake-offer').innerHTML, /not on sale yet/);
  assert(!notForSale.$('keepsake-offer').innerHTML.includes('data-buy'));
  const store = fakeStore({ live: true, available: true, stylePrice: '$1.99' }), app = boot(save, { store });
  app.click('collection-btn');
  const offer = app.$('keepsake-offer').innerHTML;
  assert.match(offer, /Get all three styles · \$1\.99/); assert.match(offer, /Sakura Breeze, Firefly Night and Gilded Leaf/);
  assert.match(offer, /no style changes how a shot flies/); assert.match(offer, /One payment/);
  app.click('keepsake-shelf', { keepsake: 'sakura' }); assert.equal(app.saved().keepsake, 'meadow'); assert.deepEqual(store.purchases, []);
  app.click('keepsake-shelf', { buy: Keepsakes.product }); assert.deepEqual(store.purchases, [Keepsakes.product]);
  assert.equal(app.$('keepsake-offer').innerHTML, ''); assert(!app.$('keepsake-grid').innerHTML.includes('Keepsake Collection'));
  app.click('keepsake-shelf', { keepsake: 'gilded' }); assert.equal(app.saved().keepsake, 'gilded');
  app.click('rush-btn'); app.frame(); assert.equal(app.boardDraws.at(-1), 'gilded');
  const game = app.games.at(-1); game.particles = []; game.events.push({ type: 'bloom', bud: { x: 200, y: 200, r: 12, type: 'gold' }, combo: 1, gain: 10 }); app.frame();
  assert(game.particles.some(p => p.kind === 'flake'), 'a bloom throws gold leaf'); assert(!game.particles.some(p => p.kind === 'blossom'));
  store.revoke(Keepsakes.entitlement); app.frame();
  assert.equal(app.boardDraws.at(-1), 'meadow'); assert.equal(app.saved().keepsake, 'gilded');
  assert.deepEqual(app.saved().koi, save.koi || {}); assert.deepEqual(app.saved().progress, save.progress);
});
const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  methodology: 'Executes the complete current app.js in an isolated Node VM using real garden/level/engine modules, fake localStorage, and DOM/canvas adapters. Completion fixtures exercise actual engine completion events and app handlers. No real browser or user saves are read or changed.',
  limitations: ['DOM and canvas adapters verify integration state, not visual appearance, accessibility behavior, or browser-specific storage.',
    'Completion fixtures do not measure gameplay difficulty; dedicated physics and Rush tests cover mechanics.'], results };
fs.writeFileSync(path.join(__dirname, 'save-integration-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
