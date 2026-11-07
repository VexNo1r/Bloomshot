'use strict';
// Who's who, the field guide in How to play. Runs the real app.js on the real rules (foes.js, bosses.js, depths.js,
// rush.js) with a small DOM stand-in, and draws the guide's pictures through the real art.js, foe-art.js and scenery.js
// on recording canvases. Checks the catalog against the game itself (every foe family and guardian has an entry, at
// the level and wave it really first shows up), first contact and its save field, the "?" cards, the review link and
// that pictures are painted lazily, once each.
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
const Foes = require('../foes.js');
const Bosses = require('../bosses.js');
const Powers = require('../powers.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
// A QA-only hook (as check-responsive.cjs adds one) hands the catalog out, so it can be checked against the game, and
// startDepth, so a level can be started at a checkpoint wave, and guideScene, the board each picture is painted from.
const raw = read('app.js'), hook = 'window.__guideQA = { GUIDE, startDepth, guideScene };\n})();';
assert(/\}\)\(\);\s*$/.test(raw), 'the QA hook matches the end of app.js');
const source = raw.replace(/\}\)\(\);\s*$/, hook);
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
const plain = value => JSON.parse(JSON.stringify(value));
const player = (extra = {}) => ({ version: 1, tutorial: true, powersMet: true, podMet: true, settings: { sound: false, haptics: false, motion: true }, ...extra });

// A canvas context that records every call and checks every number it is given.
function recordingContext(calls) {
  const gradient = { addColorStop: (offset, color) => { assert(Number.isFinite(offset)); assert.equal(typeof color, 'string'); } };
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, shadowColor: 'transparent', shadowOffsetX: 0, shadowOffsetY: 0, lineCap: 'butt', lineJoin: 'miter', font: '', textAlign: 'start', textBaseline: 'alphabetic', lineDashOffset: 0, filter: 'none', imageSmoothingEnabled: true };
  return new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'createLinearGradient' || name === 'createRadialGradient' || name === 'createConicGradient') return (...args) => { args.forEach(a => assert(Number.isFinite(a), `${name} got ${a}`)); calls.push(name); return gradient; };
      if (name === 'createPattern') return () => ({ setTransform() {} });
      if (name === 'measureText') return text => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (name === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      if (name === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (name === 'getLineDash') return () => [];
      if (name === 'isPointInPath') return () => false;
      return (...args) => { for (const a of args) if (typeof a === 'number') assert(Number.isFinite(a), `${String(name)} got ${a}`); calls.push(name); };
    },
    set(target, name, value) { if (['globalAlpha', 'lineWidth', 'shadowBlur'].includes(name)) assert(Number.isFinite(value), `${name} = ${value}`); target[name] = value; return true; }
  });
}
class StubCanvas { constructor(w, h) { this.width = w; this.height = h; this.calls = []; } getContext() { return recordingContext(this.calls); } }

// The page: a DOM stand-in with a real little tree (createElement, appendChild, textContent) for the guide's list.
// art: true loads the real art.js, foe-art.js and scenery.js into the page; search is the query string.
function boot(save, { search = '', art = false, dpr = 1, paintMs = 0 } = {}) {
  const storage = new Map(), key = search.includes('alllevels') ? 'bloomshot.qa.v1' : 'bloomshot.save.v1';
  if (save !== undefined) storage.set(key, JSON.stringify(save));
  const nodes = new Map(), games = [], canvases = [], owner = new WeakMap(), scrolls = [];
  let nextFrame, now = 0, frames = 0;
  const noop = () => {};
  const brush = new Proxy({ globalAlpha: 1, createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 0 }) },
    { get: (target, name) => name in target ? target[name] : noop });
  function element(id = '', tag = 'div') {
    const handlers = new Map(), childrenBySelector = new Map(), classes = new Set();
    let text = '';
    const node = { id, tagName: tag.toUpperCase(), dataset: {}, children: [], style: { setProperty: noop }, attributes: {}, nextElementSibling: { textContent: '' },
      hidden: false, disabled: false, open: false, checked: false, width: 0, height: 0, scrollIntoView: (...args) => scrolls.push({ node, args }),
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
        toggle: (name, force) => { const active = force === undefined ? !classes.has(name) : force; active ? classes.add(name) : classes.delete(name); return active; }, contains: name => classes.has(name) },
      setAttribute: (name, value) => { node.attributes[name] = String(value); }, getAttribute: name => node.attributes[name], removeAttribute: name => { delete node.attributes[name]; },
      addEventListener: (name, fn) => { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
      emit: (name, extra = {}) => { const event = { target: node, preventDefault: noop, ...extra }; for (const fn of handlers.get(name) || []) fn(event); },
      appendChild: child => { if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1); child.parent = node; node.children.push(child); return child; },
      querySelector: selector => {
        if (!childrenBySelector.has(selector)) {
          const child = element(); const match = selector.match(/data-([\w-]+)="([^"]+)"/);
          if (match) child.dataset[match[1]] = match[2]; childrenBySelector.set(selector, child);
        }
        return childrenBySelector.get(selector);
      },
      closest: selector => selector.startsWith('[data-') && Object.keys(node.dataset).some(k => selector.includes('data-' + k)) ? node : null,
      getContext: () => node.calls ? recordingContext(node.calls) : brush, toDataURL: () => 'data:image/png;base64,test',
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 560, right: 420, bottom: 560 }),
      hasPointerCapture: () => false, releasePointerCapture: noop, setPointerCapture: noop, focus: noop,
      showModal: () => { node.open = true; }, close: () => { node.open = false; },
      parentElement: { insertBefore: child => nodes.set(child.id, child) }
    };
    Object.defineProperty(node, 'textContent', {
      get: () => node.children.length ? node.children.map(child => child.textContent).join('') : text,
      set: value => { for (const child of node.children) child.parent = null; node.children = []; text = String(value); }
    });
    Object.defineProperty(node, 'className', { get: () => [...classes].join(' '), set: value => { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(n => classes.add(n)); } });
    Object.defineProperty(node, 'innerHTML', { get: () => node.html || '', set: value => { node.html = value; node.children = value ? [{ textContent: '' }] : []; } });
    return node;
  }
  const $ = id => { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); };
  const document = { getElementById: $, body: element('body'), hidden: false, addEventListener: noop,
    createElement: tag => {
      const node = element('', tag);
      if (tag === 'canvas') { node.calls = []; canvases.push(node); node.getContext = () => { const ctx = recordingContext(node.calls); owner.set(ctx, node); return ctx; }; }
      return node;
    },
    createTextNode: value => ({ textContent: String(value) }) };
  class ObservedRush extends Rush.RushGame { constructor(options) { super(options); games.push(this); } }
  const context = vm.createContext({ console, structuredClone, URLSearchParams, Date, Math, Map, Set, WeakMap, Array, Object, Number, String, JSON, Uint8ClampedArray,
    document, location: { search, reload: noop }, navigator: {}, crypto: { randomUUID: () => 'run' },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => { storage.set(name, value); } },
    performance: { now: () => now }, devicePixelRatio: dpr, matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout: () => 1, clearTimeout: noop,
    BloomLevels: Levels, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: QuietGoals,
    BloomEngine: Engine, BloomRush: { ...Rush, RushGame: ObservedRush }, BloomDepths: Depths, BloomPowers: Powers, BloomFoes: Foes, BloomBosses: Bosses,
    BloomTutorial: require('../tutorial.js'), BloomPetals: require('../petals.js'), BloomScenery: { paint: noop, has: () => true, drawRock: noop },
    BloomSound: { wake: noop, setEnabled: noop, play: noop }, BloomKeepsakes: Keepsakes,
    BloomArt: { draw: noop, drawFlower: noop, drawMoon: noop, koiFish: noop, drawGarden: noop, drawProjectile: noop, drawParticle: noop, drawSeed: noop, drawPowerIcon: noop, podSlot: () => ({ x: 210, y: 498 }) },
    BloomMeadow: { plots: Garden.plots.map((p, i) => ({ id: p.id, x: 65 + i * 50, y: 150, labelY: 180, accent: p.color })),
      decor: Garden.decor.map((d, i) => ({ id: d.id, x: 40 + i * 60, y: 200, accent: '#ffffff', icon: [40 + i * 60, 190, 40] })),
      friends: Garden.decor.map((d, i) => ({ id: d.friend.id, decorId: d.id, x: 40 + i * 60, y: 180 })), reactSeconds: 1.1,
      drawDecorIcon: noop, drawFriendIcon: noop, draw: noop }
  });
  context.window = context; context.addEventListener = noop;
  // The real art, with a counter on the board drawing for the guide's own canvases (the game board draws too).
  const draws = [];
  if (art) {
    context.OffscreenCanvas = StubCanvas;
    for (const file of ['scenery.js', 'art.js', 'foe-art.js']) vm.runInContext(read(file), context, { filename: file });
    const draw = context.BloomArt.draw;
    // Each guide picture takes paintMs of the stubbed clock, so the per-frame budget is exercised (0: they are free).
    context.BloomArt.draw = function (ctx, state, time, options) {
      if (owner.has(ctx) && owner.get(ctx).className === 'guide-canvas') { draws.push({ ctx, state, options, frame: frames }); now += paintMs; }
      return draw.call(this, ctx, state, time, options);
    };
  }
  vm.runInContext(source, context, { filename: 'app.js' });
  function frame(milliseconds = 17) { now += milliseconds; frames++; const fn = nextFrame; assert.equal(typeof fn, 'function'); fn(now); }
  function click(id, dataset) { const target = dataset ? Object.assign(element(), { dataset }) : $(id); $(id).emit('click', { target }); }
  // The player's own game (the guide's one-wave sandbox boards are not it).
  const game = () => games.filter(g => !(g.plan && g.plan.waves === 1)).at(-1);
  const saved = () => JSON.parse(storage.get(key));
  // Opens How to play, then the Who's who section (the browser fires toggle when a details element opens).
  function openGuide() { click('help-btn'); $('guide-help').open = true; $('guide-help').emit('toggle'); }
  function closeGuide() { $('guide-help').open = false; $('guide-help').emit('toggle'); $('help-dialog').close(); }
  return { $, click, frame, game, saved, storage, canvases, draws, scrolls, openGuide, closeGuide, guide: context.__guideQA.GUIDE, startDepth: context.__guideQA.startDepth, scene: context.__guideQA.guideScene };
}
// The tree under a node, depth first.
function walk(node, out = []) { for (const child of node.children || []) { out.push(child); walk(child, out); } return out; }
const hasClass = (node, name) => typeof node.className === 'string' && node.className.split(' ').includes(name);
function entries(app) {
  return walk(app.$('guide-list')).filter(node => hasClass(node, 'guide-entry')).map(node => {
    const all = walk(node), art = all.find(n => hasClass(n, 'guide-art'));
    return { id: node.dataset.guide, node, met: !hasClass(node, 'unmet'), text: node.textContent, art, canvas: walk(art).find(n => n.tagName === 'CANVAS') || null,
      name: (all.find(n => hasClass(n, 'guide-name')) || {}).textContent || '', line: (all.find(n => hasClass(n, 'guide-line')) || {}).textContent || '' };
  });
}

// Where each piece first shows up, read from depths.js itself: the opening buds, the drops, rocks, currents, tunnels
// and Moon Jelly vents of every wave. Gift bubbles come from rush.js (every GIFT_EVERY-th regular wave).
function debuts() {
  const first = new Map(), see = (id, level, wave) => { if (!first.has(id)) first.set(id, { level, wave }); };
  for (let level = 1; level <= Depths.total; level++) for (let wave = 1; wave <= Depths.waveCount; wave++) {
    if (level === 1 && wave === Rush.GIFT_EVERY) see('gift', level, wave);
    const spec = Depths.wave(level, wave);
    for (const bud of [...spec.buds, ...spec.drops.flatMap(drop => drop.buds)]) {
      if (bud.boss) see(`boss-${bud.bossKind}`, level, wave);
      else if (bud.foe) see(Foes.familyOf(bud.foe), level, wave);
      else {
        if (bud.relay) see('crown', level, wave);
        if (bud.maxHp > 1 && !bud.geode) see('rings', level, wave);
        if (bud.shield) see('cup', level, wave);
        if (bud.puff) see('puffcap', level, wave);
        if (bud.shell) see('shell', level, wave);
        if (bud.geode) see('geode', level, wave);
        if (bud.briar) see('briar', level, wave);
      }
    }
    if (spec.bumpers.some(b => b.kind === 'rock')) see('rock', level, wave);
    if (spec.currents.length) see('current', level, wave);
    if (spec.gates.length) see('tunnel', level, wave);
    if (spec.vents.length) see('jelly', level, wave);
  }
  return first;
}

test('Every foes.js family and every guardian has an entry, under the level and wave it really first shows up in', () => {
  const app = boot(player(), { search: '?alllevels' }), guide = plain(app.guide), ids = guide.map(e => e.id), found = debuts();
  assert.equal(new Set(ids).size, ids.length, 'each id once');
  const families = [...new Set(Foes.names().map(Foes.familyOf))];
  assert(families.length >= 13, `the foe families (${families.length})`);
  for (const family of families) assert(ids.includes(family), `${family} has an entry`);
  for (const boss of Depths.bosses) {
    const entry = guide.find(e => e.id === `boss-${boss.kind}`);
    assert(entry, `${boss.name} has an entry`);
    assert.equal(entry.name, boss.name, 'a guardian goes by its name in depths.js'); assert.equal(entry.kind, 'guardian');
  }
  // Every entry is something the levels really have, met where they first have it, and in the order they are met.
  for (const entry of guide) {
    assert(found.has(entry.id), `${entry.id} is in the levels`);
    assert.deepEqual({ level: entry.level, wave: entry.wave }, found.get(entry.id), `${entry.id} debuts at level ${found.get(entry.id).level} wave ${found.get(entry.id).wave}`);
    assert(entry.name && entry.line, `${entry.id} has a name and a line`);
    assert(entry.line.length <= 70, `${entry.id}'s line is short (${entry.line.length})`);
    assert(/[.!]$/.test(entry.line), `${entry.id}'s line is a sentence`);
    assert(!/[$€£]|\bbuy\b|\bunlock|\bprice/i.test(entry.line), `${entry.id}'s line never sells`);
  }
  for (const id of found.keys()) assert(ids.includes(id), `${id} (in the levels) has an entry`);
  const order = guide.map(e => e.level * 100 + e.wave);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'level by level, in the order they are met');
  for (const family of families) assert.equal(guide.find(e => e.id === family).kind, 'foe');
  // The list on the page: every entry under its own level's heading, in catalog order.
  app.openGuide();
  const groups = walk(app.$('guide-list')).filter(n => hasClass(n, 'guide-level'));
  assert.deepEqual(groups.map(g => Number(g.dataset.level)), Depths.levels.map(l => l.id), 'a group per level');
  for (const group of groups) {
    const level = Depths.level(Number(group.dataset.level)), heading = walk(group).find(n => hasClass(n, 'guide-level-name'));
    assert.equal(heading.textContent, `Level ${level.id} · ${level.name}`, 'the heading reads its number and name');
    assert.deepEqual(walk(group).filter(n => hasClass(n, 'guide-entry')).map(n => n.dataset.guide), guide.filter(e => e.level === level.id).map(e => e.id));
    assert.equal(walk(group).filter(n => hasClass(n, 'guide-entry')).at(-1).dataset.guide.slice(0, 5), 'boss-', 'the guardian comes last');
  }
});

test('An old save without the field loads unchanged and is backfilled from its level progress', () => {
  const depths = { 1: { stars: 3, best: 3000, wave: 10 }, 2: { stars: 0, best: 900, wave: 4 }, 5: { stars: 0, best: 300, wave: 2 } };
  const old = player({ depths, powers: { sunburst: 2, dandelion: 0, beeline: 1, lullaby: 3 }, rush: { best: 2100, bestWave: 3, runs: 5, blooms: 25 } });
  const app = boot(old), saved = app.saved();
  assert.deepEqual(saved.met, ['crown', 'gift', 'rings', 'boss-sunny', 'rock', 'rolypoly', 'current', 'jelly'], 'level 1 cleared, level 2 to wave 4, level 5 to wave 2');
  for (const field of ['version', 'tutorial', 'powersMet', 'podMet', 'depths', 'powers', 'rush']) assert.deepEqual(saved[field], old[field], `${field} is kept as it was`);
  // The backfill is only what progress shows: no progress, nothing met.
  assert.deepEqual(boot(player()).saved().met, []);
  // A save that already has a list keeps it, with what its progress shows added in catalog order.
  assert.deepEqual(boot(player({ depths: { 3: { stars: 0, best: 10, wave: 1 } }, met: ['wishstar', 'crown'] })).saved().met, ['crown', 'puffcap', 'wishstar']);
  // A brand-new player (no save at all) starts with an empty list.
  assert.deepEqual(boot(undefined).saved().met, []);
});

test('A damaged met field is dropped, and unknown ids and repeats are cleaned out', () => {
  for (const met of ['rolypoly', { rolypoly: true }, ['rolypoly', 7], ['crown', null], 42, Array(500).fill('crown')]) {
    assert.deepEqual(boot(player({ met })).saved().met, [], `${JSON.stringify(met).slice(0, 40)} is dropped`);
  }
  assert.deepEqual(boot(player({ met: ['wishstar', 'nope', 'rolypoly', 'rolypoly', '__proto__', 'boss-sunny', 'boss-nobody'] })).saved().met, ['boss-sunny', 'rolypoly', 'wishstar']);
});

test('First contact is saved at a level start, a new wave, a drop, a foe arriving, a guardian and a gift bubble', () => {
  const app = boot(player({ depths: { 1: { stars: 3, best: 3000, wave: 10 } } }));
  const metNow = () => app.saved().met;
  assert(!metNow().includes('rock'));
  app.click('depth-map', { depth: '2' }); app.frame();
  let game = app.game();
  assert.equal(game.plan.id, 2);
  assert(metNow().includes('rock'), 'the first wave counts when the level starts (it sends no wave event)');
  assert(!metNow().includes('rolypoly') && !metNow().includes('mole'), 'nothing that is not on the board yet');
  // A foe arriving mid-wave (a drop, a guardian's toss) is met when it lands.
  const roly = Foes.make('rolypoly', ['rolypoly', 200, 150], 'qa', 0, 2, 1)[0];
  Foes.place(game, roly); game.event('foe', { kind: 'rolypoly:land', x: 200, y: 150, bud: roly }); app.frame();
  assert(metNow().includes('rolypoly'), 'a foe that lands is met');
  // The next waves: the mole's (wave 5), then the guardian's.
  game.started = true; game.wave = 4; game.drops = []; game._loadWave(); app.frame();
  assert(metNow().includes('mole'), 'the mole is met with his wave (his hills are on the board)');
  game.wave = 9; game.drops = []; game._loadWave(); app.frame();
  assert(metNow().includes('boss-root'), 'the guardian is met when its wave starts');
  // A drop brings what it holds.
  const app3 = boot(player({ depths: { 1: { stars: 3, best: 1, wave: 10 }, 2: { stars: 3, best: 1, wave: 10 } } }));
  app3.click('depth-map', { depth: '3' }); app3.frame();
  game = app3.game(); assert(!app3.saved().met.includes('cup'));
  // Reinforcements land at the top once there is room above the live buds, so these sit high.
  const cupped = Depths.wave(3, 2).buds.filter(bud => bud.shield).map(bud => ({ ...bud, id: `qa-${bud.id}`, y: bud.y - 100, startY: bud.y - 100 }));
  game.drops = [{ at: game.time, buds: cupped }]; game.started = true;
  for (let i = 0; i < 30 && !app3.saved().met.includes('cup'); i++) app3.frame();
  assert(app3.saved().met.includes('cup'), 'cups in a drop are met when it arrives');
  // A gift bubble floating in.
  const app2 = boot(player());
  app2.click('depth-map', { depth: '1' }); app2.frame();
  assert.deepEqual(app2.saved().met, ['crown'], 'level 1 opens on crowned flowers');
  app2.game().event('giftAppear', { power: 'sunburst', x: 200, y: 80 }); app2.frame();
  assert.deepEqual(app2.saved().met, ['crown', 'gift'], 'kept in catalog order');
});

test('Every entry is met live where it debuts, and every guardian however its fight opens', () => {
  // Each level from its start, then each wave where a piece debuts (as the waves come in play). The review link opens
  // every level and keeps its own save, which records first contact like the normal one.
  for (const level of Depths.levels) {
    const app = boot(player(), { search: '?alllevels' }), debut = plain(app.guide).filter(entry => entry.level === level.id);
    app.click('depth-map', { depth: String(level.id) }); app.frame();
    const game = app.game();
    assert.equal(game.plan.id, level.id);
    for (const wave of [...new Set(debut.map(entry => entry.wave))]) {
      if (wave > 1) { game.started = true; game.wave = wave - 1; game.drops = []; game._loadWave(); }
      const want = debut.filter(entry => entry.wave === wave).map(entry => entry.id), metAll = () => want.every(id => app.saved().met.includes(id));
      // A gift bubble floats in during its wave and a Moon Jelly rises from its vent, so a wave gets a few seconds.
      for (let i = 0; i < 360 && !metAll(); i++) { app.frame(); game.lives = Math.max(game.lives, 3); }
      for (const id of want) assert(app.saved().met.includes(id), `${id} is met in level ${level.id}, wave ${wave}`);
    }
  }
  // A run that starts on the guardian's wave (the guardian preview, a checkpoint) sends no wave event: the guardian is
  // met as the level starts. Crystal Heart opens as three hearts with her own bud hidden.
  for (const boss of Depths.bosses) {
    const app = boot(player(), { search: '?alllevels&bosses' }), level = Depths.levels.find(item => Depths.wave(item.id, Depths.waveCount).buds.some(bud => bud.bossKind === boss.kind));
    app.click('depth-map', { depth: String(level.id) }); app.frame();
    assert.equal(app.game().wave, Depths.waveCount);
    if (boss.kind === 'crystal') assert(app.game().buds.some(bud => bud.boss && bud.hidden) && app.game().buds.some(bud => bud.bossPart === 'heart'), 'Crystal Heart opens split');
    assert(app.saved().met.includes(`boss-${boss.kind}`), `${boss.name} is met when her wave opens the run`);
  }
});

test('The end of a run counts what it reached, as the next load would', () => {
  // A checkpoint start on wave 4 of level 5 meets its currents and glowworm; the Moon Jelly (wave 2, from the lily vents)
  // was never on this run's board. When the run ends, its progress (wave 4 reached) counts her, as reopening would.
  const cleared = { stars: 3, best: 3000, wave: 10 }, app = boot(player({ depths: { 1: cleared, 2: cleared, 3: cleared, 4: cleared } }));
  const before = plain(app.guide).filter(entry => entry.level <= 4).map(entry => entry.id);
  assert.deepEqual(app.saved().met, before, 'levels 1 to 4 cleared');
  app.startDepth(5, false, 4); app.frame();
  const game = app.game();
  assert.equal(game.plan.id, 5); assert.equal(game.wave, 4);
  assert.deepEqual(app.saved().met, [...before, 'current', 'glowworm'], 'what wave 4 has on the board');
  game.started = true; game._lose(); app.frame();
  assert.equal(app.saved().depths[5].wave, 4, 'the run is recorded');
  assert.deepEqual(app.saved().met, [...before, 'current', 'jelly', 'glowworm'], 'met as soon as the run ends');
  assert.deepEqual(boot(app.saved()).saved().met, app.saved().met, 'the same as the next load');
});

test('Only the levels record it: Meadow Rush and the tutorial record nothing', () => {
  const app = boot(player());
  app.click('tutorial-replay'); app.frame();
  assert(app.game().scripted, 'the tutorial is running');
  for (let i = 0; i < 60; i++) app.frame();
  assert.deepEqual(app.saved().met, [], 'the tutorial');
  // Endless Meadow Rush opens on crowned flowers and floats in gift bubbles, but the guide is about the levels.
  const rush = boot(player());
  rush.click('restart-btn'); rush.frame();
  const game = rush.game();
  assert(game.mode === 'rush' && !game.plan && game.buds.some(bud => bud.relay), 'a fresh Meadow Rush board with crowned flowers');
  game.event('giftAppear', { power: 'sunburst', x: 200, y: 80 }); game.started = true; game.wave = 2; game._loadWave();
  for (let i = 0; i < 30; i++) rush.frame();
  assert.deepEqual(rush.saved().met, [], 'Meadow Rush');
});

test('Unmet entries show only where to meet them: no name, line, picture or price; the count is right', () => {
  const app = boot(player({ met: ['crown', 'rock', 'wishstar'] }), { art: true });
  app.click('help-btn');
  assert.equal(app.$('guide-count').textContent, '3 of 34 met', 'the count is up before the section opens');
  assert.equal(app.draws.length, 0, 'opening How to play paints nothing');
  app.$('help-dialog').close();
  app.openGuide();
  for (let i = 0; i < 4; i++) app.frame();
  const list = entries(app), guide = plain(app.guide);
  assert.equal(list.length, guide.length);
  for (const item of list) {
    const entry = guide.find(e => e.id === item.id);
    assert.equal(item.art.getAttribute('aria-hidden'), 'true', 'the picture is hidden from screen readers');
    if (['crown', 'rock', 'wishstar'].includes(item.id)) {
      assert(item.met); assert.equal(item.name, entry.name); assert.equal(item.line, entry.line);
      assert(item.canvas, `${item.id} has its picture`); assert.equal(item.canvas.getAttribute('aria-hidden'), 'true');
      continue;
    }
    assert(!item.met, `${item.id} is not met`);
    assert.equal(item.line, `Meet it in Level ${entry.level}`);
    assert.equal(item.name, '', 'no name');
    assert(!item.text.includes(entry.name) && !item.text.includes(entry.line), `${item.id} gives nothing away`);
    assert.equal(item.canvas, null, 'no picture');
    assert.equal(item.text, `?${entry.kind === 'guardian' ? 'Guardian' : ''}Meet it in Level ${entry.level}`, 'paid levels look the same as free ones');
  }
  assert(!/[$€£]|\bbuy\b|\bunlock|\bprice|\bpurchase/i.test(app.$('guide-list').textContent), 'no price, buy or unlock anywhere');
  assert.equal(app.draws.length, 3, 'only the met entries are painted');
});

test('The review link and its guardian preview show every entry, met or not', () => {
  for (const search of ['?alllevels', '?alllevels&bosses']) {
    const app = boot(player(), { search });
    app.openGuide();
    assert.equal(app.$('guide-count').textContent, '34 of 34 met');
    const list = entries(app);
    assert.equal(list.length, 34);
    for (const item of list) { const entry = app.guide.find(e => e.id === item.id); assert(item.met); assert.equal(item.name, entry.name); assert.equal(item.line, entry.line); }
  }
});

test('Pictures are painted lazily through the board drawing, once each, at most 2x, and every entry draws', () => {
  const app = boot(player(), { search: '?alllevels', art: true, dpr: 3 });
  app.frame(); app.frame();
  assert.equal(app.draws.length, 0, 'nothing is painted on page load');
  app.click('help-btn'); app.frame();
  assert.equal(app.draws.length, 0, 'nor when How to play opens');
  app.$('guide-help').open = true; app.$('guide-help').emit('toggle');
  assert.equal(app.draws.length, 0, 'painting waits for the next frame');
  app.frame();
  assert(app.draws.length >= 1, 'it starts on the next frame');
  for (let i = 0; i < 40; i++) app.frame();
  const list = entries(app);
  assert.equal(app.draws.length, 34, 'one painting for each entry');
  for (const item of list) {
    assert(item.canvas, `${item.id} drew without an error`);
    assert.equal(item.canvas.width, 128, 'the backing store stops at 2x'); assert.equal(item.canvas.height, 128);
    const ops = item.canvas.calls;
    assert(ops.filter(op => /^(fill|stroke|drawImage|fillRect|arc|ellipse|bezierCurveTo|quadraticCurveTo|lineTo)$/.test(op)).length >= 8, `${item.id} drew something (${ops.length} calls)`);
    assert.equal(ops.filter(op => op === 'save').length, ops.filter(op => op === 'restore').length, `${item.id} balances save and restore`);
  }
  // Each painting is a still frame of a board holding just its piece, in its own level's look.
  for (const { state, options } of app.draws) {
    assert.equal(options.reducedMotion, true); assert.equal(options.backdrop, false); assert.equal(options.showAim, false);
    assert.match(options.theme, /^depth-/);
    assert(state.buds.length + state.bumpers.length + state.currents.length + state.gates.length > 0);
  }
  const guardians = app.draws.filter(d => d.state.buds.some(b => b.boss));
  assert.equal(guardians.length, 10, 'each guardian is drawn as in play');
  // Shut and open again: nothing is painted twice.
  app.closeGuide(); app.openGuide(); for (let i = 0; i < 5; i++) app.frame();
  assert.equal(app.draws.length, 34);
  // With the section shut, painting stops until it opens again.
  const fresh = boot(player(), { search: '?alllevels', art: true });
  fresh.openGuide(); fresh.closeGuide(); for (let i = 0; i < 5; i++) fresh.frame();
  assert.equal(fresh.draws.length, 0);
});

test('A newly met piece is painted on the next visit; nothing else is redrawn', () => {
  const app = boot(player({ depths: { 1: { stars: 3, best: 1, wave: 10 } } }), { art: true });
  app.openGuide(); for (let i = 0; i < 10; i++) app.frame();
  assert.equal(app.draws.length, 4, 'the four level 1 entries');
  assert.equal(app.$('guide-count').textContent, '4 of 34 met');
  app.closeGuide();
  app.click('depth-map', { depth: '2' }); app.frame();
  app.openGuide(); for (let i = 0; i < 10; i++) app.frame();
  assert.equal(app.$('guide-count').textContent, '5 of 34 met');
  assert.equal(app.draws.length, 5, 'only the rock is new');
  assert(entries(app).find(item => item.id === 'rock').canvas, 'and it shows');
  assert(entries(app).find(item => item.id === 'crown').canvas, 'the earlier pictures are kept');
});

test('Who\'s who stays open only beside Levels, and opened during a level it starts at that level', () => {
  const app = boot(player({ depths: { 1: { stars: 3, best: 3000, wave: 10 } } })), help = app.$('help-dialog'), guide = app.$('guide-help');
  const scrolled = () => app.scrolls.filter(item => hasClass(item.node, 'guide-level')).map(item => ({ level: item.node.dataset.level, args: plain(item.args) }));
  // On the levels map, Levels is the help for this screen; the guide opened there does not jump anywhere.
  app.openGuide();
  assert(app.$('levels-help').open && guide.open);
  assert.deepEqual(scrolled(), []);
  help.close();
  // Meadow Rush: left open, the guide would push its help far down. It shuts, and Meadow Rush's help opens.
  app.click('levels-rush-btn'); app.frame();
  assert.equal(app.game().mode, 'rush'); assert(!app.game().plan);
  app.click('help-btn');
  assert.equal(guide.open, false, 'Who\'s who shuts where Levels is not the help for this screen');
  assert(app.$('rush-help').open && !app.$('levels-help').open);
  // Opened there, it does not jump either.
  guide.open = true; guide.emit('toggle');
  assert.deepEqual(scrolled(), []);
  guide.open = false; help.close();
  // During level 2, Levels is this screen's help: the guide opens at Level 2's group, and stays open next time.
  app.click('depth-map', { depth: '2' }); app.frame();
  app.openGuide();
  assert(app.$('levels-help').open && guide.open);
  assert.deepEqual(scrolled(), [{ level: '2', args: [{ block: 'start' }] }], 'the level being played is brought to the top');
  const group = walk(app.$('guide-list')).find(node => hasClass(node, 'guide-level') && node.dataset.level === '2');
  assert.equal(app.scrolls.at(-1).node, group, 'its group on the page');
  help.close(); app.click('help-btn');
  assert.equal(guide.open, true, 'beside Levels it stays as the player left it');
  assert.equal(scrolled().length, 2, 'and starts at the level again');
});

test('Pictures are painted a few a frame: each frame stops once its 6 ms are spent', () => {
  // 10 ms a picture: one a frame. 4 ms: two a frame (the second runs over). Every picture is painted, each once.
  for (const [paintMs, perFrame] of [[10, 1], [4, 2]]) {
    const app = boot(player(), { search: '?alllevels', art: true, paintMs });
    app.openGuide();
    for (let i = 0; i < 40; i++) app.frame();
    assert.equal(app.draws.length, 34);
    const frames = new Map();
    for (const draw of app.draws) frames.set(draw.frame, (frames.get(draw.frame) || 0) + 1);
    assert.equal(frames.size, Math.ceil(34 / perFrame), `${paintMs} ms a picture takes ${Math.ceil(34 / perFrame)} frames`);
    assert(Math.max(...frames.values()) <= perFrame, `at most ${perFrame} a frame`);
  }
});

test('Each picture shows its own piece: the current on its dark lake water, shells and cups without a crown', () => {
  const app = boot(player(), { search: '?alllevels' }), guide = plain(app.guide), scene = id => app.scene(app.guide.find(entry => entry.id === id));
  // The current: its upstream end (the band's rounded tip, inside the square with a little air) on the lake's water.
  const current = scene('current'), lane = current.game.currents[0], [x0, y0, x1, y1] = current.box;
  assert(current.under && current.under.every(color => /^#[0-9a-f]{6}$/i.test(color)), 'painted on dark water');
  const tip = lane.x - Math.cos(lane.angle) * lane.length / 2;
  assert(tip > x0 && tip < x0 + 20, `the band's tip is in the picture (${tip} in ${x0}..${x1})`);
  assert(x1 - x0 >= 2.4 * lane.width && y1 - y0 >= lane.width, 'wide enough to show the band and its arrows');
  const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return (r + g + b) / 3; };
  assert(lum(current.under[0]) < 100 && lum(current.under[1]) < 100, 'the water is dark, as in play');
  // Shells and cups: just the shelled or cupped buds of the bunch, never its crowned bud (that is Crowned flower).
  for (const [id, test] of [['shell', bud => bud.shell], ['cup', bud => bud.shield]]) {
    const buds = scene(id).game.buds;
    assert(buds.length >= 2, `${id}: a bunch`);
    assert(buds.every(test) && buds.every(bud => !bud.relay), `${id}: every bud is a ${id}, none crowned`);
  }
  // A backing only where the guide asks for one (a piece pale on the card): two of the level's own colors, darker than
  // the card and darkest at the rim, so the piece stands off it. Every other piece sits on the card's own color.
  for (const entry of guide) {
    const under = scene(entry.id).under;
    if (!entry.under) { assert.equal(under, null, `${entry.id} is on the card's own color`); continue; }
    assert.deepEqual(plain(under), entry.under, `${entry.id} is painted on its own backing`);
    assert(under.length === 2 && under.every(color => /^#[0-9a-f]{6}$/i.test(color)), `${entry.id}: a middle and an edge color`);
    assert(lum(under[0]) < 150 && lum(under[1]) < lum(under[0]), `${entry.id}: darker than the card, darkest at the rim`);
  }
  assert(guide.filter(entry => entry.under).length <= 8, 'a backing stays the exception');
  // The lodestone's line agrees with its hint in play: it tugs seeds.
  assert.match(guide.find(entry => entry.id === 'lodestone').line, /\btugs?\b/);
  assert.match(Foes.hint('lodestone'), /\btug/);
});

test('Every picture is framed close enough to read: no piece is lost small in its round frame', () => {
  // The square each picture shows (guidePicture scales it to the 64 px frame, at most its zoom) against what is in it.
  // A guardian is drawn at least about half its board size, and a piece's own discs (each shown bud's radius at that
  // scale) cover at least a sixth of the round frame. The floors sit under every picture now and over the ones a
  // playtester found too small (Geode King .49, The Starseed .41, Crystal Heart .35; Glowworm 11%, Sweetheart Roses
  // 11%, Wishing Stars 15%, Peekaboo Mole 15%). Rocks and the current, which have no buds, are measured in real
  // Chromium by qa/check-responsive.cjs, with every other picture.
  const app = boot(player(), { search: '?alllevels' }), R = 32, found = [];
  for (const entry of app.guide) {
    const { game, box, zoom } = app.scene(entry), k = Math.min(64 / (box[2] - box[0]), 64 / (box[3] - box[1]), zoom);
    const shown = game.buds.filter(bud => !bud.hidden && bud.visible !== false && !bud.bloomed);
    const discs = [...shown.map(bud => bud.r), ...(game.gates || []).map(gate => gate.r)].reduce((sum, r) => sum + (r * k) ** 2, 0) / R ** 2;
    found.push({ id: entry.id, k: +k.toFixed(3), discs: +discs.toFixed(3) });
    if (entry.kind === 'guardian') assert(k >= .52, `${entry.name} is drawn at ${k.toFixed(2)} of its board size`);
    else if (discs) assert(discs >= .17, `${entry.name}'s pieces cover ${(discs * 100).toFixed(0)}% of the frame`);
  }
  assert.equal(found.filter(row => row.discs).length, app.guide.length - 2, 'every piece but the rock and the current has discs to measure');
});

test('Card text is readable: every name, line and tag reaches 4.5:1 against its card', () => {
  const css = read('styles.css'), token = name => css.match(new RegExp(`--${name}:(#[0-9a-f]{6})`, 'i'))[1];
  const hex = value => /^#[0-9a-f]{3}$/i.test(value) ? '#' + [...value.slice(1)].map(c => c + c).join('') : value;
  const rule = selector => { const at = css.indexOf(selector + '{'); assert(at >= 0, `${selector} has a rule`); return css.slice(at + selector.length + 1, css.indexOf('}', at)); };
  const prop = (selector, name) => { const value = rule(selector).match(new RegExp(`(?:^|;)${name}:([^;]+)`))[1].trim(); return hex(value.startsWith('var(--') ? token(value.slice(6, -1)) : value); };
  const luminance = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const card = prop('.guide-entry', 'background'), unmet = prop('.guide-entry.unmet', 'background');
  for (const [label, color, back] of [['name', prop('.guide-name', 'color'), card], ['line', prop('.guide-line', 'color'), card],
    ['"Meet it in Level N"', prop('.guide-entry.unmet .guide-line', 'color'), unmet], ['Guardian tag', prop('.guide-tag', 'color'), prop('.guide-tag', 'background')]]) {
    assert(ratio(color, back) >= 4.5, `${label}: ${color} on ${back} is ${ratio(color, back).toFixed(2)}:1`);
  }
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
