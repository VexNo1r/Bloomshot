'use strict';
// The stage: level intros, tumbling waves, the wave harvest, named boss showdowns and their art. Runs the real
// app.js on the real rush.js and depths.js with a DOM stand-in (the harness from test-save-integration) and a spy
// on BloomSound.play, then draws the stage pieces through art.js on a recording canvas.
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
const player = (motion = true) => ({ version: 1, tutorial: true, powersMet: true, depths: { 1: { stars: 3, best: 3000, wave: 10 }, 2: { stars: 2, best: 2000, wave: 10 } },
  settings: { sound: true, haptics: true, motion } });
function boot(raw) {
  const storage = new Map();
  if (raw !== undefined) storage.set('bloomshot.save.v1', JSON.stringify(raw));
  const nodes = new Map(), games = [], sounds = [];
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
  const document = { getElementById: $, createElement: () => element(), body: element('body'), hidden: false, addEventListener: noop };
  class ObservedGame extends Engine.Game { constructor(level) { super(level); games.push(this); } }
  class ObservedRush extends Rush.RushGame { constructor(options) { super(options); games.push(this); } }
  const context = vm.createContext({ console, structuredClone, URLSearchParams, Date, Math, Map, Set,
    document, location: { search: '', reload: noop }, navigator: {}, crypto: { randomUUID: () => 'run' },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => { storage.set(name, value); } },
    performance: { now: () => now }, devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; }, setTimeout: () => 1, clearTimeout: noop,
    BloomLevels: Levels, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: QuietGoals,
    BloomEngine: { ...Engine, Game: ObservedGame }, BloomRush: { RushGame: ObservedRush }, BloomDepths: Depths, BloomPowers: Powers,
    BloomTutorial: require('../tutorial.js'), BloomPetals: require('../petals.js'), BloomScenery: { paint: noop, has: () => true },
    // The spy keeps each cue with the game clock it played at.
    BloomSound: { wake: noop, setEnabled: noop, play: (type, data) => sounds.push({ type, data: plain(data || {}), at: games.length ? games.at(-1).time : 0 }) },
    BloomKeepsakes: Keepsakes,
    BloomArt: { draw: noop, drawFlower: noop, drawMoon: noop, koiFish: noop, drawGarden: noop, drawProjectile: noop, drawParticle: noop, drawSeed: noop, drawPowerIcon: noop },
    BloomMeadow: { plots: Garden.plots.map((p, i) => ({ id: p.id, x: 65 + i * 50, y: 150, labelY: 180, accent: p.color })),
      decor: Garden.decor.map((d, i) => ({ id: d.id, x: 40 + i * 60, y: 200, accent: '#ffffff', icon: [40 + i * 60, 190, 40] })),
      friends: Garden.decor.map((d, i) => ({ id: d.friend.id, decorId: d.id, x: 40 + i * 60, y: 180 })), reactSeconds: 1.1,
      drawDecorIcon: noop, drawFriendIcon: noop, draw: noop }
  });
  context.window = context; context.addEventListener = noop;
  vm.runInContext(source, context, { filename: 'app.js' });
  function frame(milliseconds = 17) { now += milliseconds; const fn = nextFrame; assert.equal(typeof fn, 'function'); fn(now); }
  // Frames for a span of game time (17 ms each), stopping early once `until` holds.
  function run(seconds, until) { for (let t = 0; t < seconds; t += .017) { frame(); if (until && until()) return true; } return false; }
  function click(id, dataset) { const target = dataset ? Object.assign(element(), { dataset }) : $(id); $(id).emit('click', { target }); }
  const cues = type => sounds.filter(s => s.type === type);
  return { $, click, frame, run, games, sounds, cues, game: () => games.at(-1) };
}
const titles = game => game.floaters.filter(f => f.kind === 'title');
// Values made inside the app's sandbox carry its own Object and Array, so they are copied out before a deep compare.
function plain(value) { return JSON.parse(JSON.stringify(value)); }
const level = (raw, id) => { const app = boot(raw); app.click('depth-map', { depth: String(id) }); app.frame(); return app; };
// Blooms every open flower so the wave clears on the next frame, after adding extra spent blooms when asked.
function clearWave(app, extra = 0) {
  const game = app.game(); game.started = true; game.drops = [];
  for (let i = 0; i < extra; i++) game.buds.push({ id: `extra-${i}`, group: 'extra', x: 60 + (i * 37) % 300, y: 80 + (i * 23) % 200, r: 11, type: 'coral', hp: 1, maxHp: 1, bloomed: true, bloomAt: game.time - 2 + i * .01, hitAt: -100 });
  for (const bud of game.buds.filter(b => !b.bloomed && !b.gift)) { bud.hp = 1; game.bloom(bud); }
}
// Loads the level's tenth wave (its big bloom), optionally naming it the way the rules package will.
function bossWave(app, name) {
  const game = app.game(); game.started = true; game.wave = 9; game.drops = []; game._loadWave();
  if (name) game.events.at(-1).bossName = name;
  app.frame();
  return game.buds.find(bud => bud.boss);
}

test('A level opens on its title ribbon, the intro cue plays and the first wave tumbles in within .35 s', () => {
  const app = level(player(), 1), game = app.game();
  const ribbon = titles(game);
  assert.equal(ribbon.length, 1, 'one title');
  assert.equal(ribbon[0].text, 'Level 1'); assert.equal(ribbon[0].label, Depths.level(1).name);
  assert.equal(ribbon[0].x, 210); assert.equal(ribbon[0].y, 210); assert.equal(ribbon[0].maxLife, 1.2);
  assert.equal(typeof game.stage.introAt, 'number');
  assert.deepEqual(app.cues('intro').map(s => s.data), [{ level: 1, boss: false }]);
  const open = game.buds.filter(b => !b.bloomed && !b.boss), starts = open.map(b => b.enterAt);
  assert(open.length > 4 && starts.every(t => typeof t === 'number'), 'every bud has an entry');
  assert(Math.max(...starts) - Math.min(...starts) <= .35 + 1e-9, 'the stagger stays within .35 s');
  assert(Math.min(...starts) >= game.stage.introAt, 'nothing enters before the intro');
  assert(open.every(b => b.enterDrop === 48 && b.enterDur === .4 && !b.enterBounce));
  // Left to right.
  const byX = [...open].sort((a, b) => a.x - b.x);
  for (let i = 1; i < byX.length; i++) assert(byX[i].enterAt >= byX[i - 1].enterAt);
  assert(game.buds.every(b => b.y === Depths.wave(1, 1).buds.find(s => s.id === b.id).y), 'hitboxes stay where the engine put them');
  app.run(1.3);
  const plops = app.cues('plop');
  assert(plops.length >= 1 && plops.length <= 8, `${plops.length} plops`);
  for (let i = 1; i < plops.length; i++) assert(plops[i].at - plops[i - 1].at >= .04 - 1e-9, 'plops are at least 40 ms apart');
  assert(plops.every((p, i) => p.data.i === i && Number.isFinite(p.data.x)));
  assert.equal(titles(game).length, 0, 'the title has gone');
  assert(game.buds.every(b => b.enterAt === undefined), 'enter fields clear once landed, so a later respawn pops in as before');
  assert.equal(app.cues('intro').length, 1, 'the intro plays once');
});
test('Endless Rush opens on "Rush", and each new wave shows its number and tempo', () => {
  const app = boot(player()); app.click('levels-rush-btn'); app.frame();
  const game = app.game();
  assert.equal(game.mode, 'rush'); assert(!game.plan);
  assert.deepEqual(plain(titles(game).map(f => [f.text, f.label])), [['Rush', 'how long can you last?']]);
  assert.deepEqual(app.cues('intro').map(s => s.data), [{ level: 0, boss: false }]);
  app.run(1.3); game.started = true; game._loadWave(); app.frame();
  const small = titles(game).filter(f => f.size === 'small');
  assert.deepEqual(plain(small.map(f => [f.text, f.label, f.maxLife])), [['Wave 2', '×1.1', .9]]);
  assert(Math.abs(small[0].y - 120) < 1, 'it sits at y 120 (floaters drift up a little each frame)');
  const starts = game.buds.map(b => b.enterAt);
  assert(starts.every(t => typeof t === 'number') && Math.max(...starts) - Math.min(...starts) <= .35 + 1e-9);
});
test('A depth wave shows "Wave 3 of 10" and keeps its hint', () => {
  const app = level(player(), 2), game = app.game(); app.run(1.3);
  game.started = true; game.wave = 2; game.drops = []; game._loadWave(); app.frame();
  assert.deepEqual(plain(titles(game).map(f => [f.text, f.size])), [['Wave 3 of 10', 'small']]);
  assert.equal(app.$('game-hint').textContent, Depths.wave(2, 3).hint || 'Wave 3 of 10.');
});
test('A cleared wave sends at most 24 orbs, latest first, that all land within 1.4 s and pluck', () => {
  const app = level(player(), 1), game = app.game(); app.run(1.3);
  clearWave(app, 30);
  assert(app.run(3, () => app.cues('pluck').length === 0 && (game.harvest || []).length > 0), 'the wave clears');
  const orbs = game.harvest.slice();
  assert.equal(orbs.length, 24, 'capped at 24');
  const latest = game.buds.filter(b => b.bloomed).sort((a, b) => b.bloomAt - a.bloomAt)[0];
  assert.equal(orbs[0].x, latest.x); assert.equal(orbs[0].y, latest.y);
  orbs.forEach((orb, i) => { assert.equal(orb.delay, i * .03); assert.equal(orb.dur, .55); assert.equal(orb.n, 24); assert.match(orb.color, /^#[0-9a-f]{6}$/i); });
  assert(game.floaters.some(f => f.kind === 'wave' && f.text === 'Wave clear!'), 'the banner stays');
  let seconds = 0;
  while (game.harvest.length && seconds < 2) { app.frame(); seconds += .017; }
  assert.equal(game.harvest.length, 0); assert(seconds <= 1.4, `landed in ${seconds.toFixed(2)} s`);
  const plucks = app.cues('pluck').map(s => s.data.i);
  assert.deepEqual(plucks, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 21], 'every orb of the first 12, then every third');
});
test('An orb rides its drifting flower until it lifts off', () => {
  const app = level(player(), 1), game = app.game(); app.run(1.3);
  clearWave(app, 30);
  assert(app.run(3, () => (game.harvest || []).length > 0), 'the wave clears');
  const orb = game.harvest.at(-1), start = orb.y;
  assert(orb.delay > .5, 'the last orb waits its turn');
  app.run(.4);
  assert(orb.t < orb.delay, 'still waiting');
  assert(orb.bud.y > start + 1, 'spent flowers keep drifting down');
  assert.equal(orb.y, orb.bud.y); assert.equal(orb.x, orb.bud.x);
  app.run(.4);
  assert(orb.t > orb.delay, 'lifted off');
  const lifted = orb.y; app.run(.1);
  assert.equal(orb.y, lifted, 'its path starts where it left the flower');
});
test('A finale skips the harvest; without one the same clear harvests', () => {
  for (const finale of [true, false]) {
    const app = level(player(), 1), game = app.game(); app.run(1.3);
    for (const bud of game.buds) { bud.bloomed = true; bud.bloomAt = game.time; }
    game.event('cleared', { wave: 1, tempo: 1, next: 1.1, ...(finale ? { finale: true } : {}) }); app.frame();
    assert.equal((game.harvest || []).length, finale ? 0 : game.buds.length, finale ? 'the sweep takes its place' : 'a normal clear harvests');
    assert(game.floaters.some(f => f.text === 'Wave clear!'));
  }
});
test('A boss wave drops its big bloom from 140 px, then its name card and health vine come up', () => {
  const app = level(player(), 3); app.run(1.3);
  const game = app.game(), boss = bossWave(app, 'Mother Morel');
  assert(boss, 'the boss is on the board');
  assert.equal(boss.enterDrop, 140); assert.equal(boss.enterDur, .8); assert.equal(boss.enterBounce, true);
  assert(Math.abs(boss.enterAt - (game.waveStart + .15)) < .02, 'it drops in after .15 s');
  assert.deepEqual(app.cues('intro').at(-1).data, { level: 3, boss: true });
  assert.equal(titles(game).filter(f => f.size === 'small').length, 0, 'the boss card speaks for the wave');
  assert.equal(app.cues('bossLand').length, 0, 'still in the air');
  assert(app.run(1, () => app.cues('bossLand').length > 0), 'it lands');
  const landed = app.cues('bossLand')[0];
  assert(landed.at - boss.enterAt < .8 * .4, 'the thud comes on first touchdown'); assert.equal(landed.data.x, boss.x);
  const card = titles(game).find(f => f.boss);
  assert.deepEqual(plain([card.text, card.label, card.y, card.maxLife]), ['Mother Morel', `${boss.maxHp} hits to bloom`, 160, 1.6]);
  const vine = game.stage.vine;
  assert.equal(vine.bud, boss); assert.equal(vine.name, 'Mother Morel'); assert.equal(vine.max, boss.maxHp); assert.equal(typeof vine.shownAt, 'number');
  // Three hits: three leaves fall, the vine shakes, and the pale damage stretch shrinks back in about .4 s.
  for (let i = 0; i < 3; i++) game.strike(boss);
  app.frame();
  assert.equal(vine.hp, boss.maxHp - 3); assert.equal(vine.fallen.length, 3); assert(vine.lag > vine.hp, 'the damage shows first');
  assert(Math.abs(vine.shakeAt - game.time) < .05, 'the crack shook the vine');
  app.run(.6);
  assert.equal(vine.lag, vine.hp, 'then it catches up');
  app.run(1); assert.equal(vine.fallen.length, 0, 'fallen leaves are let go');
  // The boss blooms by name.
  boss.name = 'Mother Morel'; boss.hp = 1; game.strike(boss); app.frame();
  const banner = game.floaters.find(f => f.kind === 'wave');
  assert.equal(banner.text, 'Mother Morel bloomed!'); assert.equal(banner.label, 'everything blooms');
  assert.match(app.$('announcement').textContent, /^Mother Morel bloomed\./);
});
test('An unnamed big bloom is called Big bloom, and its hit count reads right', () => {
  const app = level(player(), 1); app.run(1.3);
  const game = app.game(), boss = bossWave(app);
  app.run(1, () => app.cues('bossLand').length > 0);
  const card = titles(game).find(f => f.boss);
  assert.equal(card.text, 'Big bloom'); assert.equal(card.label, `${boss.maxHp} hits to bloom`);
  boss.hp = 1; game.strike(boss); app.frame();
  assert(game.floaters.some(f => f.kind === 'wave' && f.text === 'Big bloom!'));
});
test('A puff shows a spore ring as big as its reach', () => {
  const app = level(player(), 1), game = app.game(); app.run(.2);
  game.event('puff', { bud: { x: 200, y: 200, r: 12, type: 'gold', puff: true }, count: 2 }); app.frame();
  const ring = game.particles.find(p => p.kind === 'ring' && p.x === 200 && p.y === 200 && p.maxLife === .5);
  assert(ring, 'a ring at the puff'); assert.equal(ring.size + ring.grow, 74);
});
test('With motion off: the title still shows, but no curtain offsets, no enterAt, no orbs and a single pluck', () => {
  const app = level(player(false), 1), game = app.game();
  assert.equal(titles(game).length, 1, 'the title only');
  assert(game.buds.every(b => b.enterAt === undefined), 'no tumble');
  app.run(1.3); clearWave(app, 6);
  assert(app.run(3, () => app.cues('pluck').length > 0), 'the wave clears');
  assert.equal((game.harvest || []).length, 0, 'no orbs');
  app.run(1.5);
  assert.equal(app.cues('pluck').length, 1, 'one pluck');
  const boss = bossWave(app, 'Rootknot');
  assert.equal(boss.enterAt, undefined, 'the boss does not drop');
  assert.equal(app.cues('bossLand').length, 1, 'it is simply there');
  assert.equal(titles(game).find(f => f.boss).text, 'Rootknot');
  assert.equal(typeof game.stage.vine.shownAt, 'number', 'the vine is up');
});
test('The tutorial never gets the show, and a level picked up again does not replay its intro', () => {
  const fresh = boot(undefined); fresh.run(.5);
  const scripted = fresh.game();
  assert(scripted.scripted, 'the tutorial is running');
  assert.equal(scripted.stage, undefined); assert.equal(titles(scripted).length, 0); assert.equal(fresh.cues('intro').length, 0);
  assert(scripted.buds.every(b => b.enterAt === undefined));
  const app = level(player(), 1), game = app.game(); app.run(.3); game.started = true;
  const ribbons = titles(game).length;
  app.click('rush-btn'); app.click('resume-btn'); app.run(.3);
  assert.equal(app.game(), game, 'the same run'); assert.equal(app.cues('intro').length, 1, 'no second intro');
  assert(titles(game).length <= ribbons, 'no second title');
});

// The art: every stage piece draws through BloomArt.draw on a recording canvas. Sprites come from an
// OffscreenCanvas stand-in, so after the first frame the stage adds no gradients, and the vine caches per hp.
function recordingContext(calls) {
  const gradient = { addColorStop: (offset, color) => { assert(Number.isFinite(offset)); assert.equal(typeof color, 'string'); } };
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, shadowColor: 'transparent', shadowOffsetX: 0, shadowOffsetY: 0, lineCap: 'butt', lineJoin: 'miter', font: '', textAlign: 'start', textBaseline: 'alphabetic', lineDashOffset: 0 };
  return new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'createLinearGradient' || name === 'createRadialGradient') return (...args) => { args.forEach(a => assert(Number.isFinite(a), `${name} got ${a}`)); calls.push(name); return gradient; };
      if (name === 'measureText') return text => ({ width: String(text).length * 9 });
      return (...args) => { for (const a of args) if (typeof a === 'number') assert(Number.isFinite(a), `${String(name)} got ${a}`); calls.push(name); };
    },
    set(target, name, value) { if (['globalAlpha', 'lineWidth', 'shadowBlur'].includes(name)) assert(Number.isFinite(value), `${name} = ${value}`); target[name] = value; return true; }
  });
}
let surfaces = 0;
class StubCanvas { constructor(w, h) { surfaces++; this.width = w; this.height = h; this.calls = []; } getContext() { return recordingContext(this.calls); } }
const artContext = vm.createContext({ console, Math, Map, Set, WeakMap, Array, Object, Number, String, JSON, OffscreenCanvas: StubCanvas });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8'), artContext, { filename: 'art.js' });
const Art = artContext.BloomArt;
function board(extra = {}) {
  return { mode: 'rush', status: 'flying', wave: 10, lives: 3, tempo: 1, dangerY: 448, launcher: { x: 210, y: 498 }, bumpers: [], balls: [], particles: [], aim: [],
    buds: [], floaters: [], ...extra };
}
function stageBoard(time, hp = 9) {
  const boss = { id: 'boss', x: 210, y: 110, r: 26, type: 'lilac', boss: true, hp, maxHp: 9, bloomed: false, bloomAt: -100, hitAt: -100 };
  const harvest = Array.from({ length: 24 }, (_, i) => ({ x: 60 + i * 12, y: 300 - i * 4, color: '#ff5d94', delay: i * .03, dur: .55, t: .3 + i * .01, i, n: 24 }));
  const floaters = [{ kind: 'title', text: 'Level 3', label: 'Glowing Grotto', x: 210, y: 210, life: .9, maxLife: 1.2 }, { kind: 'title', size: 'small', text: 'Wave 3 of 10', x: 210, y: 120, life: .5, maxLife: .9 },
    { kind: 'title', boss: true, text: 'Mother Morel', label: '9 hits to bloom', x: 210, y: 160, life: 1, maxLife: 1.6 }, { kind: 'life', text: '2 lives left', x: 210, y: 380, life: .8, maxLife: 1.1 },
    ...['slam', 'hat', 'trick', 'close', 'tunnel', 'rebound', 'bank', 'mystery'].map((trick, i) => ({ kind: 'trick', trick, text: 'Trick shot!', label: '+600', x: 210, y: 80 + i * 40, life: .7, maxLife: 1.1 })),
    { kind: 'wave', text: 'Ammonite Queen bloomed!', label: 'everything blooms', x: 210, y: 250, life: 1, maxLife: 1.2 }];
  return board({ buds: [boss], harvest, floaters, stage: { introAt: time - .3, glow: .6, vine: { bud: boss, name: 'Mother Morel', max: 9, hp, lag: hp + 1, shakeAt: time - .05, shownAt: time - 1, fallen: [{ i: hp, at: time - .2, spin: 1 }] } } });
}
test('Every stage piece draws on the board, and after the first frame adds no gradients of its own', () => {
  const time = 5, options = { theme: 'meadow', reducedMotion: false };
  const plain = [], staged = [];
  Art.draw(recordingContext([]), stageBoard(time), time, options); // warm-up: sprites are made here
  const before = surfaces;
  // The plain board keeps the boss and the older wave banner, which already draws its own gradient.
  const plainBoard = stageBoard(time); plainBoard.harvest = []; plainBoard.floaters = plainBoard.floaters.filter(f => f.kind === 'wave'); plainBoard.stage = null;
  Art.draw(recordingContext(plain), plainBoard, time, options);
  Art.draw(recordingContext(staged), stageBoard(time), time, options);
  const count = (calls, name) => calls.filter(c => c === name).length;
  for (const name of ['createLinearGradient', 'createRadialGradient']) assert.equal(count(staged, name), count(plain, name), `${name} per frame`);
  assert.equal(surfaces, before, 'no new sprites on a repeat frame');
  // 24 orb glows, 3 ribbons, 8 stamps, the life band, the vine pieces and the two curtain strips.
  assert(count(staged, 'drawImage') - count(plain, 'drawImage') >= 24 + 3 + 8 + 1 + 2 + 2, 'orbs, ribbons, stamps, the vine and the curtain come from sprites');
});
test('The vine is cached per hit count, the curtain is two strips, and reduced motion keeps only what reads', () => {
  const options = { theme: 'meadow', reducedMotion: false };
  Art.draw(recordingContext([]), stageBoard(8, 6), 8, options);
  const before = surfaces;
  Art.draw(recordingContext([]), stageBoard(8.2, 6), 8.2, options);
  assert.equal(surfaces, before, 'same hit count, same sprites');
  Art.draw(recordingContext([]), stageBoard(8.4, 5), 8.4, options);
  assert.equal(surfaces, before + 1, 'one new leaves sprite for the new count');
  const moving = [], still = [];
  Art.draw(recordingContext(moving), stageBoard(9, 5), 9, options);
  Art.draw(recordingContext(still), stageBoard(9, 5), 9, { ...options, reducedMotion: true });
  const images = calls => calls.filter(c => c === 'drawImage').length;
  assert(images(still) < images(moving) - 24, 'no orbs or curtain with motion off');
  assert(images(still) >= 4, 'the vine still shows');
});

test('A sweating boss shivers its leaves, face and crown together, and holds still with motion off', () => {
  const rotations = (hp, reducedMotion) => {
    const calls = [], boss = { id: 'boss', x: 210, y: 110, r: 26, type: 'gold', boss: true, hp, maxHp: 9, bloomed: false, bloomAt: -100, hitAt: -100 };
    Art.draw(recordingContext(calls), board({ buds: [boss] }), 5.01, { theme: 'meadow', reducedMotion });
    return calls.filter(c => c === 'rotate').length;
  };
  assert.equal(rotations(1, false) - rotations(9, false), 3, 'leaves, face, ring and crown');
  assert.equal(rotations(1, true), rotations(9, true), 'no shiver with motion off');
});
test('The vine and orbs undo the camera lean only when the camera actually leaned', () => {
  const inverse = reducedMotion => {
    const scales = [], calls = [], context = recordingContext(calls);
    const proxy = new Proxy(context, { get: (target, name) => name === 'scale' ? (x, y) => { scales.push([x, y]); } : target[name], set: (target, name, value) => { target[name] = value; return true; } });
    const boss = { id: 'boss', x: 210, y: 110, r: 26, type: 'gold', boss: true, hp: 5, maxHp: 9, bloomed: false, bloomAt: -100, hitAt: -100 };
    const state = board({ buds: [boss], stage: { glow: 0, vine: { bud: boss, name: 'Old Sunny', max: 9, hp: 5, lag: 5, shakeAt: -100, shownAt: 1, fallen: [] } } });
    Art.draw(proxy, state, 6, { theme: 'meadow', reducedMotion, camera: { zoom: 1.2, fx: 210, fy: 200 } });
    return scales.filter(([x, y]) => Math.abs(x - 1 / 1.2) < 1e-9 && Math.abs(y - 1 / 1.2) < 1e-9).length;
  };
  assert.equal(inverse(false), 1, 'leaning in: the HUD pieces hold still');
  assert.equal(inverse(true), 0, 'motion off: there is no lean to undo');
});
test('A boss only loses leaves, so the vine lets go of the sprite for the count it left', () => {
  const options = { theme: 'meadow', reducedMotion: false };
  Art.draw(recordingContext([]), stageBoard(20, 4), 20, options);
  Art.draw(recordingContext([]), stageBoard(20.2, 3), 20.2, options);
  const before = surfaces;
  Art.draw(recordingContext([]), stageBoard(20.4, 3), 20.4, options);
  assert.equal(surfaces, before, 'the current count stays cached');
  Art.draw(recordingContext([]), stageBoard(20.6, 4), 20.6, options);
  assert.equal(surfaces, before + 1, 'the old count was let go');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
