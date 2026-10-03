'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Garden = require('../garden.js');
const Levels = require('../levels.js');
const Moon = require('../moon.js');
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
function boot(raw, { storageFails = false, search = '', otherSave } = {}) {
  const key = search.includes('qa') ? 'bloomshot.qa.v1' : 'bloomshot.save.v1';
  const storage = new Map();
  if (raw !== undefined) storage.set(key, JSON.stringify(raw));
  if (otherSave) storage.set(key === 'bloomshot.qa.v1' ? 'bloomshot.save.v1' : 'bloomshot.qa.v1', JSON.stringify(otherSave));
  const writes = [], nodes = new Map(), games = [], meadowDraws = [];
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
    BloomLevels: Levels, BloomMoon: Moon, BloomGarden: Garden, BloomEngine: { ...Engine, Game: ObservedGame }, BloomRush: { RushGame: ObservedRush },
    BloomSound: { wake: noop, play: noop, setEnabled: noop }, BloomArt: { draw: noop, drawFlower: noop, drawMoon: noop },
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
  function preview() { click('worlds-btn'); click('worlds-grid', { world: 'koi' }); click('world-preview-btn'); }
  function finishRush(blooms = 24, wave = 3) {
    const game = games.at(-1); assert.equal(game.mode, 'rush');
    // An engine completion fixture tests the app's event boundary, not the run's physics.
    game.totalBlooms = blooms; game.wave = wave; game.score = 3200; game._lose(); frame(); return game;
  }
  return { $, click, frame, preview, finishRush, context, games, meadowDraws, writes, storage,
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
  app.click('world-detail', { moon: 'moon-2' }); assert.equal(app.games.at(-1), initial);
  assert.deepEqual(app.saved().moon, { 'moon-6': before.moon['moon-6'] }); assert.deepEqual(app.saved().progress, before.progress);
  assert.equal(app.saved().garden.seeds, 4);
});
test('Koi preview restores a Moon trial and its reward without leaking it to Meadow or daily records', () => {
  const app = boot(legacySave()); app.click('worlds-btn'); app.click('worlds-grid', { world: 'moon' }); app.click('world-preview-btn');
  app.games.at(-1).fire(0, -1); app.games.at(-1).win(); app.frame(); const after = app.saved();
  app.click('garden-btn'); app.preview(); app.games.at(-1).win(); app.frame();
  app.click('worlds-btn'); app.click('rush-btn');
  assert.equal(app.context.bloomshotState.level, 'moon-1'); assert.equal(app.context.bloomshotState.theme, 'moon');
  assert.equal(app.$('reward-seeds').textContent, '+12 seeds'); assert.deepEqual(app.saved(), after);
});
const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  methodology: 'Executes the complete current app.js in an isolated Node VM using real garden/level/engine modules, fake localStorage, and DOM/canvas adapters. Completion fixtures exercise actual engine completion events and app handlers. No real browser or user saves are read or changed.',
  limitations: ['DOM and canvas adapters verify integration state, not visual appearance, accessibility behavior, or browser-specific storage.',
    'Completion fixtures do not measure gameplay difficulty; dedicated physics and Rush tests cover mechanics.'], results };
fs.writeFileSync(path.join(__dirname, 'save-integration-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
