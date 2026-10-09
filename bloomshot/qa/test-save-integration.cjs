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
const BUNDLE = 'bloomshot.bundle.launch1';
// Mirrors store.js: a product grants one or more entitlements; owned means all of them, partial means some.
function fakeStore({ owned = [], live = false, available = false, price = '$4.99', stylePrice = '$1.99', bundlePrice = '$5.99', amounts = [4.99, 1.99, 5.99], currency = 'USD', mode = 'native' } = {}) {
  const have = new Set(owned), listeners = [], purchases = [];
  const catalog = [{ id: Koi.product, entitlements: [Koi.entitlement], kind: 'world', price, amount: amounts[0], currency },
    { id: Keepsakes.product, entitlements: [Keepsakes.entitlement], kind: 'style', price: stylePrice, amount: amounts[1], currency },
    { id: BUNDLE, entitlements: [Koi.entitlement, Keepsakes.entitlement], kind: 'bundle', price: bundlePrice, amount: amounts[2], currency }];
  const held = item => item.entitlements.filter(e => have.has(e)).length;
  return { mode, busy: false, purchases, isLive: () => live, owns: id => have.has(id), revoke: id => have.delete(id),
    products: () => catalog.map(item => ({ ...item, entitlement: item.entitlements[0], available, owned: held(item) === item.entitlements.length, partial: held(item) > 0 && held(item) < item.entitlements.length })),
    purchase: id => {
      purchases.push(id); const item = catalog.find(entry => entry.id === id);
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
  class ObservedRush extends Rush.RushGame { constructor(options) { super(options); games.push(this); } }
  const context = vm.createContext({ console, structuredClone, URLSearchParams, Date: today ? fixedDate(today) : Date, Math, Map, Set,
    document, location: { search, reload: () => { reloads.push(true); } }, navigator: {}, crypto: { randomUUID: () => 'test-run-' + (++uuid) },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => {
      if (storageFails) throw new Error('Storage blocked'); storage.set(name, value); writes.push({ key: name, value });
    } },
    performance: { now: () => now }, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout: () => 1, clearTimeout: noop,
    BloomLevels: { ...Levels, worlds: [...Levels.worlds, FUTURE] }, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: goals ? Goals : QuietGoals, ...(store ? { BloomStore: store } : {}), ...(native ? { BloomNative: native } : {}), BloomEngine: { ...Engine, Game: ObservedGame }, BloomRush: { RushGame: ObservedRush }, BloomDepths: Depths, BloomScenery: { paint: noop, has: () => true },
    BloomSound: { wake: noop, play: noop, setEnabled: noop }, BloomKeepsakes: Keepsakes,
    BloomArt: { draw: (ctx, state, time, options) => boardDraws.push(options.keepsake ? options.keepsake.id : 'meadow'), drawFlower: noop, drawMoon: noop, koiFish: noop,
      drawGarden: noop, drawProjectile: noop, drawParticle: noop, drawSeed: noop },
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
  for (const bud of game.buds) while (!bud.bloomed) game.strike(bud, true);
  app.frame(20); app.frame(20);
  const banner = game.floaters.find(f => f.kind === 'wave');
  assert(banner, 'a wave-clear banner is shown'); assert.equal(banner.text, 'Wave clear!'); assert.equal(banner.label, 'next ×1.1');
  for (let i = 0; i < 50; i++) app.frame(20);
  assert.equal(game.wave, 2); assert.match(app.$('level-label').textContent, /^Wave 2 · ×1\.1$/);
  assert.match(app.$('game-hint').textContent, /×1\.1 points/);
  game._lose(); for (let i = 0; i < 40; i++) app.frame();
  assert.match(app.$('result-message').textContent, /tempo ×1\.1/);
});
test('The Launch Bundle states its price and saving, buys both parts at once, and then disappears', () => {
  const store = fakeStore({ live: true, available: true }), app = boot(legacySave(), { store });
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'koi' });
  const koiPanel = app.$('world-detail').innerHTML;
  assert.match(koiPanel, /Unlock all 8 pools · \$4\.99/); assert.match(koiPanel, /Get both · \$5\.99/);
  assert.match(koiPanel, /\$0\.99 less than buying both \(\$4\.99 \+ \$1\.99\)\./);
  app.click('collection-btn'); assert.match(app.$('keepsake-offer').innerHTML, /Get both · \$5\.99/);
  app.click('keepsake-shelf', { keepsake: 'firefly' });
  app.click('keepsake-shelf', { buy: BUNDLE }); assert.deepEqual(store.purchases, [BUNDLE]);
  assert(store.owns(Koi.entitlement) && store.owns(Keepsakes.entitlement));
  assert.equal(app.$('keepsake-offer').innerHTML, '');
  app.click('keepsake-shelf', { keepsake: 'firefly' }); assert.equal(app.saved().keepsake, 'firefly');
  app.click('worlds-btn'); app.click('worlds-grid', { world: 'koi' });
  assert(!app.$('world-detail').innerHTML.includes('data-buy'));
  app.click('keepsake-shelf', { buy: BUNDLE }); assert.deepEqual(store.purchases, [BUNDLE], 'an owned bundle never opens the store again');
});
test('Owning either part offers only the other part, never the bundle', () => {
  const koiOwner = boot(legacySave(), { store: fakeStore({ live: true, available: true, owned: [Koi.entitlement] }) });
  koiOwner.click('collection-btn');
  assert.match(koiOwner.$('keepsake-offer').innerHTML, /Get all three · \$1\.99/); assert(!koiOwner.$('keepsake-offer').innerHTML.includes(BUNDLE));
  koiOwner.click('keepsake-shelf', { buy: BUNDLE }); assert.equal(koiOwner.context.BloomStore.purchases.length, 0);
  const styleOwner = boot(legacySave(), { store: fakeStore({ live: true, available: true, owned: [Keepsakes.entitlement] }) });
  styleOwner.click('worlds-btn'); styleOwner.click('worlds-grid', { world: 'koi' });
  assert.match(styleOwner.$('world-detail').innerHTML, /Unlock all 8 pools · \$4\.99/); assert(!styleOwner.$('world-detail').innerHTML.includes(BUNDLE));
});
test('Without comparable amounts the bundle still says it costs less, but names no number; off sale or on the website it is not offered', () => {
  const mixed = boot(legacySave(), { store: fakeStore({ live: true, available: true, amounts: [4.99, NaN, 5.99] }) });
  mixed.click('collection-btn'); const html = mixed.$('keepsake-offer').innerHTML;
  assert.match(html, /Less than buying both \(\$4\.99 \+ \$1\.99\)\./); assert(!/\$0\.99 less/.test(html));
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
  const app = boot(undefined);
  assert.equal(app.context.bloomshotState.route, 'levels'); assert.equal(app.$('levels-view').hidden, false); assert.equal(app.$('game-view').hidden, true);
  assert(app.$('rush-btn').classList.contains('active'), 'Play is the active tab');
  const map = app.$('depth-map').innerHTML;
  for (const id of [1, 2, 3, 4]) assert.match(map, new RegExp(`data-depth="${id}"`));
  assert.match(map, /class="depth-card next" type="button" data-depth="1"/); assert.match(map, /class="depth-card locked" type="button" data-depth="2"/);
  assert.match(map, /Sunny Meadow/); assert.match(map, /Crystal Caves/); assert.match(map, /Clear level 3 to open/); assert.match(map, /6 more levels are on the way/);
  const started = app.games.length;
  app.click('depth-map', { depth: '2' }); assert.equal(app.games.length, started); assert.equal(app.$('toast').textContent, 'Clear level 1 to open Root Tunnels.');
  app.click('depth-map', { depth: '1' }); const game = depthGame(app);
  assert.equal(game.plan.id, 1); assert.equal(app.context.bloomshotState.theme, 'depth-meadow'); assert.equal(app.context.bloomshotState.route, 'game');
  app.frame(); assert.equal(app.$('level-label').textContent, 'Level 1 · Wave 1/10'); assert.equal(app.$('level-name').textContent, 'Sunny Meadow');
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
test('Running out of lives keeps the best wave, pays for the blooms, and Try again restarts the same level', () => {
  const app = boot(legacySave()); app.click('depth-map', { depth: '1' });
  let game = depthGame(app); game.started = true; game.wave = 6; game.totalBlooms = 90; game.score = 2100; game._lose(); settleLevel(app);
  const saved = app.saved(); assert.deepEqual(saved.depths, { 1: { stars: 0, best: 2100, wave: 6 } }); assert.deepEqual(saved.garden.depthBest, {});
  assert.equal(saved.garden.seeds, 4 + 14);
  assert.equal(app.$('result-eyebrow').textContent, 'Out of lives'); assert.equal(app.$('result-title').textContent, 'Wave 6 of 10');
  assert.equal(app.$('next-btn').hidden, true); assert.equal(app.$('retry-btn').textContent, 'Try again');
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
test('Level records are cleaned on load and a cleared level opens the next one', () => {
  const before = legacySave(); before.depths = { 1: { stars: 9, best: -5, wave: 3 }, 2: 'bad', 3: [], 12: { stars: 1, best: 1, wave: 1 } };
  const app = boot(before); assert.deepEqual(app.saved().depths, { 1: { stars: 3, best: 0, wave: 3 } });
  assert.match(app.$('depth-map').innerHTML, /class="depth-card next" type="button" data-depth="2"/);
  for (const field of ['progress', 'rush', 'daily', 'settings']) assert.deepEqual(app.saved()[field], before[field]);
});
const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  methodology: 'Executes the complete current app.js in an isolated Node VM using real garden/level/engine modules, fake localStorage, and DOM/canvas adapters. Completion fixtures exercise actual engine completion events and app handlers. No real browser or user saves are read or changed.',
  limitations: ['DOM and canvas adapters verify integration state, not visual appearance, accessibility behavior, or browser-specific storage.',
    'Completion fixtures do not measure gameplay difficulty; dedicated physics and Rush tests cover mechanics.'], results };
fs.writeFileSync(path.join(__dirname, 'save-integration-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
