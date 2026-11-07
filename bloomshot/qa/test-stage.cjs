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
// art: BloomArt pieces to add to the stand-in, such as the real art's spentFlower.
// search: the page's query string (`?alllevels` opens every level, as the review link does). timers: run setTimeout
// callbacks on the frame clock (most tests leave them unrun).
function boot(raw, art = {}, search = '', { timers = false } = {}) {
  const pending = new Map(); let timerId = 0;
  const storage = new Map();
  // The review link keeps its own save (app.js STORAGE), so the player is put under that key too.
  if (raw !== undefined) storage.set(search.includes('alllevels') ? 'bloomshot.qa.v1' : 'bloomshot.save.v1', JSON.stringify(raw));
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
    document, location: { search, reload: noop }, navigator: {}, crypto: { randomUUID: () => 'run' },
    localStorage: { getItem: name => storage.get(name) || null, setItem: (name, value) => { storage.set(name, value); } },
    performance: { now: () => now }, devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: fn => { nextFrame = fn; },
    setTimeout: timers ? (fn, ms = 0) => { pending.set(++timerId, { fn, at: now + ms }); return timerId; } : () => 1,
    clearTimeout: timers ? id => pending.delete(id) : noop,
    BloomLevels: Levels, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: QuietGoals,
    BloomEngine: { ...Engine, Game: ObservedGame }, BloomRush: { RushGame: ObservedRush }, BloomDepths: Depths, BloomPowers: Powers,
    BloomTutorial: require('../tutorial.js'), BloomPetals: require('../petals.js'), BloomScenery: { paint: noop, has: () => true },
    // The spy keeps each cue with the game clock it played at.
    BloomSound: { wake: noop, setEnabled: noop, play: (type, data) => sounds.push({ type, data: plain(data || {}), at: games.length ? games.at(-1).time : 0 }) },
    BloomKeepsakes: Keepsakes,
    BloomArt: { draw: noop, drawFlower: noop, drawMoon: noop, koiFish: noop, drawGarden: noop, drawProjectile: noop, drawParticle: noop, drawSeed: noop, drawPowerIcon: noop, podSlot: () => ({ x: 210, y: 498 }), ...art },
    BloomMeadow: { plots: Garden.plots.map((p, i) => ({ id: p.id, x: 65 + i * 50, y: 150, labelY: 180, accent: p.color })),
      decor: Garden.decor.map((d, i) => ({ id: d.id, x: 40 + i * 60, y: 200, accent: '#ffffff', icon: [40 + i * 60, 190, 40] })),
      friends: Garden.decor.map((d, i) => ({ id: d.friend.id, decorId: d.id, x: 40 + i * 60, y: 180 })), reactSeconds: 1.1,
      drawDecorIcon: noop, drawFriendIcon: noop, draw: noop }
  });
  context.window = context; context.addEventListener = noop;
  vm.runInContext(source, context, { filename: 'app.js' });
  function frame(milliseconds = 17) {
    now += milliseconds;
    for (const [id, t] of [...pending].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)) { pending.delete(id); t.fn(); }
    const fn = nextFrame; assert.equal(typeof fn, 'function'); fn(now);
  }
  // Frames for a span of game time (17 ms each), stopping early once `until` holds.
  function run(seconds, until) { for (let t = 0; t < seconds; t += .017) { frame(); if (until && until()) return true; } return false; }
  function click(id, dataset) { const target = dataset ? Object.assign(element(), { dataset }) : $(id); $(id).emit('click', { target }); }
  const cues = type => sounds.filter(s => s.type === type);
  return { $, click, frame, run, games, sounds, cues, game: () => games.at(-1) };
}
const titles = game => game.floaters.filter(f => f.kind === 'title');
// Values made inside the app's sandbox carry its own Object and Array, so they are copied out before a deep compare.
function plain(value) { return JSON.parse(JSON.stringify(value)); }
const level = (raw, id, art, search, opts) => { const app = boot(raw, art, search, opts); app.click('depth-map', { depth: String(id) }); app.frame(); return app; };
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
  // null strips the names the levels give their bosses, to check the fallback.
  else if (name === null) { delete game.events.at(-1).bossName; game.buds.forEach(bud => { if (bud.boss) delete bud.name; }); }
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
  // The level title has gone, and the first wave's tip has taken the top edge.
  assert.deepEqual(plain(titles(game).map(f => [f.text, f.label, f.size, f.y])), [['Wave 1 of 10', Depths.wave(1, 1).hint, 'small', 32]], 'the title has gone and the tip is up');
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
  assert(Math.abs(small[0].y - 32) < 1, 'it rides the top edge at y 32, above where the new buds land (floaters drift up a little each frame)');
  const starts = game.buds.map(b => b.enterAt);
  assert(starts.every(t => typeof t === 'number') && Math.max(...starts) - Math.min(...starts) <= .35 + 1e-9);
});
test('A depth wave shows "Wave 3 of 10" and keeps its hint', () => {
  const app = level(player(), 2), game = app.game(); app.run(1.3);
  game.started = true; game.wave = 2; game.drops = []; game._loadWave(); app.frame();
  assert.deepEqual(plain(titles(game).map(f => [f.text, f.size])), [['Wave 3 of 10', 'small']]);
  assert.equal(app.$('game-hint').textContent, Depths.wave(2, 3).hint || 'Wave 3 of 10.');
});
test('A foe the wave\'s own hint does not name is taught once in the toast and in the wave announcement', () => {
  // The level view hides #game-hint, so a first-contact hint written only there was never seen (a checkpoint start,
  // or an old save meeting batch-2 foes in later levels), and the wave's announcement replaced it in the same tick.
  const app = level(player(), 2), game = app.game(); app.run(1.3);
  const roly = 'Bump a rolypoly and it bowls into the rest!';
  assert(!Depths.wave(2, 8).hint && Depths.wave(2, 8).buds.some(b => b.foe === 'rolypoly'), 'L2 W8 has a rolypoly and no hint of its own');
  game.started = true; game.wave = 7; game.drops = []; game._loadWave(); app.frame();
  assert.equal(app.$('toast').textContent, roly); assert(app.$('toast').classList.contains('visible'), 'the toast shows');
  assert(app.$('announcement').textContent.startsWith('Wave 8 of 10.') && app.$('announcement').textContent.includes(roly), app.$('announcement').textContent);
  // Said once a run: the next wave with a rolypoly says nothing new.
  app.$('toast').textContent = ''; game.wave = 7; game.drops = []; game._loadWave(); app.frame();
  assert.equal(app.$('toast').textContent, ''); assert(!app.$('announcement').textContent.includes(roly));
});
// Keeps a guardian from starting a move (and its warning) for the rest of a test.
function quietBoss(game) { const st = game.bossState; st.next = 1e9; st.warning = null; game.bossWarning = null; st.boss.bossWarning = null; }
// Every text the toast showed, in order.
function toastLog(app) { const node = app.$('toast'), log = []; let text = node.textContent; Object.defineProperty(node, 'textContent', { get: () => text, set: v => { text = v; if (v) log.push(v); } }); return log; }
test('In a level a teaching tip is a toast: a guardian\'s turned-away tip once per 20 s, one that comes mid-toast waits', () => {
  // The level view hides #game-hint (styles.css), so a tip written only there reached nobody.
  const app = level(player(), 4, {}, '?alllevels'), game = app.game(); app.run(1.3);
  const boss = bossWave(app, 'Crystal Heart'); app.run(3); quietBoss(game);
  const tip = 'Find the beating heart', shield = () => { game.events.push({ type: 'shield', bud: boss, x: boss.x, y: boss.y }); app.frame(); };
  shield();
  assert.equal(app.$('toast').textContent, tip); assert(app.$('toast').classList.contains('visible'));
  app.$('toast').textContent = ''; app.run(2.9); shield();
  assert.equal(app.$('toast').textContent, '', 'not again within 20 s of play');
  game.time += 21; shield();
  assert.equal(app.$('toast').textContent, tip, 'again after 20 s');
  // A different tip right behind it waits for that toast to be read (this harness never runs the timer).
  app.$('toast').textContent = 'reading'; game.events.push({ type: 'geode', bud: { x: 210, y: 200, r: 12, type: 'lilac' }, count: 3 }); app.frame();
  assert.equal(app.$('toast').textContent, 'reading', 'the gem tip waits');
  assert.equal(app.$('game-hint').textContent, '3 gems! Bloom them before they fall.');
});
test('A guardian\'s turned-away tip stays quiet while a move is warned about or it changes mood', () => {
  const app = level(player(), 4, {}, '?alllevels'), game = app.game(); app.run(1.3);
  const boss = bossWave(app, 'Crystal Heart'); app.run(3); quietBoss(game); app.$('toast').textContent = '';
  const shield = () => { game.events.push({ type: 'shield', bud: boss, x: boss.x, y: boss.y }); app.frame(); };
  game.bossWarning = { move: 'mirrors', text: 'Mirror shards! Bank a seed off one.' }; shield();
  assert.equal(app.$('toast').textContent, '', 'a warned move: no pop-up'); assert.equal(app.$('game-hint').textContent, 'Mirror shards! Bank a seed off one.');
  game.bossWarning = null; game.bossState.shiftPending = true; shield();
  assert.equal(app.$('toast').textContent, '', 'a mood change: no pop-up');
  game.bossState.shiftPending = false; quietBoss(game); shield(); // (the pending change had raised its warning)
  assert.equal(app.$('toast').textContent, 'Find the beating heart', 'and it still teaches afterwards');
});
test('A fight that starts on the guardian\'s wave pops up no "new rule" at the first mood change', () => {
  // A run from wave 10 ("Try the boss", the boss preview) sends no wave event, so the baseline comes from startLevel.
  const app = level(player(), 4, {}, '?alllevels&bosses'), game = app.game(); const log = toastLog(app);
  assert(game.bossWave && game.buds.some(b => b.boss), 'the run starts on the guardian');
  game.started = true; app.run(1.5); const s = game.bossState; s.boss.hp = s.tierAt[0];
  assert(app.run(12, () => s.tier === 1), 'Crystal Heart turns Shining'); app.run(1);
  assert(!log.includes(Depths.wave(4, 10).hint), `no old opening hint as a rule (${log.join(' | ')})`);
});
test('A tip that waits is never lost: it shows after the toast before it, and not while the game is paused', () => {
  const app = level(player(), 6, {}, '?alllevels', { timers: true }), game = app.game(); app.run(1.3); const log = toastLog(app);
  app.run(3);
  game.events.push({ type: 'shield', bud: { x: 210, y: 200, r: 11, type: 'coral' } }); app.frame();
  const cups = 'Cups block shots from below. Hit them from the side.';
  assert.equal(log.at(-1), cups);
  game.events.push({ type: 'geode', bud: { x: 210, y: 200, r: 12, type: 'lilac' }, count: 3 }); app.frame();
  game.events.push({ type: 'giftAppear', power: 'lullaby', x: 210, y: 60 }); app.frame(); // any other toast in between
  const gems = '3 gems! Bloom them before they fall.';
  assert(!log.includes(gems), 'the gem tip waits for the toast being read');
  app.$('pause-dialog').open = true; app.run(4);
  assert(!log.includes(gems), 'not behind the pause card');
  app.$('pause-dialog').open = false; app.run(4);
  assert(log.includes(gems), `it shows once play is back (${log.join(' | ')})`);
  // Each toast had its full time on screen before the next.
});
test('Waiting tips are checked again as they show, a tip barely read comes back, and none is ever dropped', () => {
  const app = level(player(), 8, {}, '?alllevels&bosses', { timers: true }), game = app.game(); const log = toastLog(app);
  game.started = true; app.run(1.5); quietBoss(game); const boss = game.bossState.boss;
  const cups = 'Cups block shots from below. Hit them from the side.', shells = 'Shells only open on one side. Wait for the gap.', gems = '3 gems! Bloom them before they fall.';
  // Three first-time tips (and a guardian tip) arrive while a gift bubble's toast is up: every first-time one shows in turn.
  game.events.push({ type: 'giftAppear', power: 'lullaby', x: 210, y: 60 }); app.frame();
  game.events.push({ type: 'shield', bud: { x: 210, y: 200, r: 11, type: 'coral' } }); app.frame();
  game.events.push({ type: 'shield', shell: true, bud: { x: 210, y: 200, r: 11, type: 'coral' } }); app.frame();
  game.events.push({ type: 'geode', bud: { x: 210, y: 200, r: 12, type: 'lilac' }, count: 3 }); app.frame();
  game.events.push({ type: 'shield', bud: boss, x: boss.x, y: boss.y }); app.frame();
  // The guardian starts warning about a move before its tip's turn comes: that tip is let go.
  game.bossWarning = { move: 'lob', text: 'Gem lob! Catch them before they land.' };
  app.run(12);
  assert.deepEqual(log.filter(t => [cups, shells, gems].includes(t)), [cups, shells, gems], log.join(' | '));
  assert(!log.includes('Break a plate, aim through'), `no guardian tip over its warning (${log.join(' | ')})`);
  game.bossWarning = null;
  // A plain toast landing on a tip barely read puts that tip back: it shows again after the toast.
  const run = level(player(), 6, {}, '?alllevels', { timers: true }), g = run.game(); const seen = toastLog(run); run.run(4.5);
  g.events.push({ type: 'shield', bud: { x: 210, y: 200, r: 11, type: 'coral' } }); run.frame();
  assert.equal(seen.at(-1), cups); run.run(.3);
  g.events.push({ type: 'giftAppear', power: 'lullaby', x: 210, y: 60 }); run.frame();
  assert(seen.at(-1).startsWith('Gift bubble!')); run.run(3.2);
  assert.equal(seen.at(-1), cups, `the cup tip came back (${seen.join(' | ')})`);
});
test('Crystal Heart\'s wanted colour is said once, not again for a wrong-colour glance right after', () => {
  const app = level(player(), 4, {}, '?alllevels&bosses', { timers: true }), game = app.game(); const log = toastLog(app);
  game.started = true; app.run(1.5); const s = game.bossState; s.boss.hp = s.tierAt[1]; game.lives = 99;
  assert(app.run(60, () => log.some(t => t.startsWith('Crystal Heart wants'))), `the hues start (${log.join(' | ')})`);
  const wanted = log.find(t => t.startsWith('Crystal Heart wants')), heart = s.parts.find(p => p.bossPart === 'heart' && p.real);
  game.events.push({ type: 'shield', bud: heart, x: heart.x, y: heart.y }); app.frame(); app.run(5);
  assert.equal(log.filter(t => t === wanted).length, 1, log.join(' | '));
});
test('Ember Rose\'s new rule for each mood shows as a toast when the mood starts, once', () => {
  const app = level(player(), 7, {}, '?alllevels'), game = app.game(); app.run(1.3);
  const boss = bossWave(app, 'Ember Rose'), s = game.bossState; app.run(1.7);
  boss.hp = s.tierAt[0];
  const rule = 'Fire rings hit triple now. Tunnels hit once.';
  assert(app.run(12, () => app.$('toast').textContent === rule), `the Dancing rule is toasted (toast: ${app.$('toast').textContent})`);
  assert.equal(s.tier, 1);
  assert(app.$('announcement').textContent.includes('dancing') && app.$('announcement').textContent.includes(rule), `one announcement says both (${app.$('announcement').textContent})`);
  app.$('toast').textContent = ''; app.run(1.7); game.events.push({ type: 'bossStage', kind: 'ember', stage: 1, mood: 'Dancing', name: 'Ember Rose', x: boss.x, y: boss.y }); app.frame();
  assert.equal(app.$('toast').textContent, '', 'the same rule is not said twice');
});
test('A wish shows its "Wish!" stamp with Animations off too', () => {
  const app = level(player(false), 10, {}, '?alllevels'), game = app.game(); app.run(1.3);
  game.events.push({ type: 'foe', kind: 'wishstar:wish', x: 210, y: 200, path: [] }); app.frame();
  assert(game.floaters.some(f => f.kind === 'trick' && f.text === 'Wish!'), 'the stamp shows');
});
test('A pop-up is read aloud once: the toast is hidden from screen readers and the announcement carries it', () => {
  const tag = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').match(/<div id="toast"[^>]*>/)[0];
  assert(!/role="(status|alert|log)"|aria-live/.test(tag), `the toast is not a second live region: ${tag}`);
  assert(/aria-hidden="true"/.test(tag), 'the toast itself is hidden from screen readers');
  const app = boot(player());
  app.click('depth-map', { depth: '4' });
  assert.equal(app.$('toast').textContent, 'Clear level 3 to open Crystal Caves.');
  assert.equal(app.$('announcement').textContent, app.$('toast').textContent, 'the one live region says the same words');
});
test('A guardian fight\'s second lost life and its free Lullaby, in the same frame, are read as one announcement', () => {
  // Losing the second life drops the last-life gift bubble in the same tick: the gift's pop-up used to replace the
  // "1 life left" line before a screen reader read it.
  for (const id of [1, 4, 7]) {
    const app = level(player(), id, {}, '?alllevels'); app.run(1.3);
    const game = app.game(); bossWave(app); app.run(2);
    game.lives = 2;
    const bud = game.buds.find(b => !b.bloomed && !b.gift && !b.foe && !b.boss && !b.bossPart && !b.hidden && !b.inert);
    assert(bud, `L${id}: a flower to let through`);
    bud.y = game.dangerY + 2; app.frame();
    assert.equal(game.lives, 1); assert(game.buds.some(b => b.freeBossGift), `L${id}: the free Lullaby floats in`);
    const said = app.$('announcement').textContent;
    assert(said.includes('1 life left.') && said.endsWith('Gift bubble! Shoot it for a free Lullaby.'), `L${id}: ${said}`);
    // The next frame says nothing new, so the joined line stands; a later line is read on its own.
    app.frame(); assert.equal(app.$('announcement').textContent, said);
  }
});
test('The count after a pause clears the callouts frozen behind it, and keeps the wave ribbon and a guardian\'s name card', () => {
  for (const motion of [true, false]) {
    const app = level(player(motion), 1); app.run(1.3);
    const game = app.game(); game.started = true; game.floaters = [];
    game.floaters.push({ kind: 'wave', text: 'Wave clear!', x: 210, y: 290, life: 1, maxLife: 1 }, { kind: 'wave', text: 'Super Bloom!', x: 210, y: 250, life: 1.3, maxLife: 1.3 },
      { kind: 'trick', text: 'Hat trick!', x: 300, y: 470, life: 1, maxLife: 1 }, { kind: 'combo', text: 'Lovely!', x: 210, y: 92, life: 1, maxLife: 1 },
      { kind: 'pop', text: '+120', x: 120, y: 200, life: 1, maxLife: 1 }, { kind: 'title', size: 'small', text: 'Wave 2 of 10', x: 210, y: 32, life: 2, maxLife: 2 },
      { kind: 'title', boss: true, text: 'Old Sunny', x: 210, y: 178, life: 1.6, maxLife: 1.6 });
    app.click('pause-btn'); assert(app.$('pause-dialog').open, 'paused');
    assert.equal(game.floaters.length >= 7, true, 'the callouts wait behind the Paused card');
    app.click('pause-resume'); assert.equal(app.$('resume-count').hidden, false, 'the count runs');
    assert.deepEqual(plain(game.floaters.map(f => f.text)), ['Wave 2 of 10', 'Old Sunny'], `motion ${motion}: only the ribbon and the name card stay`);
  }
});
test('The count after a pause keeps the Super Bloom and Lullaby explainers while their effect still runs', () => {
  // The first Super Bloom of a session explains itself once; paused as it starts, the count must not take the
  // explainer away while seeds still fly through flowers, or it is never seen.
  const app = level(player(), 1); app.run(1.3);
  const game = app.game(); game.started = true;
  const words = () => plain(game.floaters.filter(f => f.kind === 'wave').map(f => f.text));
  game._startSuper(); app.frame();
  assert.deepEqual(words(), ['Super Bloom!'], 'the first Super Bloom explains itself');
  app.click('pause-btn'); app.click('pause-resume'); assert.equal(app.$('resume-count').hidden, false, 'the count runs');
  assert(game.superBloom > 0); assert.deepEqual(words(), ['Super Bloom!'], 'the count keeps it while the Super Bloom runs');
  assert(app.run(3, () => app.$('resume-count').hidden)); app.frame();
  assert.deepEqual(words(), ['Super Bloom!'], 'and it reads on after the count');
  game._endSuper(); app.run(2); assert.deepEqual(words(), []);
  // The Lullaby explainer, the same way; once its effect is over a pause takes it like any stale callout.
  assert(game.lull()); app.frame(); assert.deepEqual(words(), ['Lullaby']);
  app.click('pause-btn'); app.click('pause-resume'); assert.deepEqual(words(), ['Lullaby'], 'kept while the flowers doze');
  assert(app.run(3, () => app.$('resume-count').hidden));
  game.lullaby = 0; game.floaters.find(f => f.text === 'Lullaby').life = 1;
  app.click('pause-btn'); app.click('pause-resume'); assert.deepEqual(words(), [], 'gone once it has worn off');
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
  assert.deepEqual(plain([card.text, card.label, card.y, card.maxLife]), ['Mother Morel', 'Pop a nearby puffcap', 178, 1.6]);
  assert(card.y - 29 > boss.y + boss.r * 1.3, 'the card sits below the boss, not over it');
  const vine = game.stage.vine;
  assert.equal(vine.bud, boss); assert.equal(vine.name, 'Mother Morel'); assert.equal(vine.max, boss.maxHp); assert.equal(typeof vine.shownAt, 'number');
  // Enough hits to empty a leaf: the leaves that held those rings fall (the vine shows at most 20 leaves, each max/20 of
  // its health), the vine shakes, and the pale damage stretch shrinks back in about .4 s.
  const leaves = Math.min(20, boss.maxHp), per = boss.maxHp / leaves, hits = Math.max(3, Math.ceil(per - 1e-9));
  for (let i = 0; i < hits; i++) game.strike(boss);
  app.frame();
  const emptied = Array.from({ length: leaves }, (_, i) => i * per).filter(at => at >= boss.maxHp - hits - 1e-9 && at < boss.maxHp - 1e-9).length;
  assert(emptied >= 1, `${hits} hits empty at least one leaf`);
  assert.equal(vine.hp, boss.maxHp - hits); assert.equal(vine.fallen.length, emptied); assert(vine.lag > vine.hp, 'the damage shows first');
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
test('A guardian crit near the top of the board is called out below her name and health vine (y >= 70), a low one where it landed', () => {
  // The vine pill (y 5-31) and the name (y 37) are drawn over the floaters, so a word stamped higher lost its top.
  const app = level(player(), 2), game = app.game(); app.run(1.3);
  const crits = () => game.floaters.filter(f => f.kind === 'trick' && f.trick === 'boss').map(f => [f.text, Math.round(f.y)]); // one frame of drift up
  game.event('bossCritical', { kind: 'ember', bud: { x: 210, y: 52 }, damage: 3, via: 'ring' });
  game.event('bossCritical', { kind: 'core', bud: { x: 100, y: 300 }, damage: 2, via: 'shooting' });
  app.frame();
  assert.deepEqual(plain(crits()), [['Ring shot!', 70], ['Shooting star!', 266]]);
});
test('An unnamed guardian is called Big bloom and keeps its opening strategy', () => {
  const app = level(player(), 1); app.run(1.3);
  const game = app.game(), boss = bossWave(app, null);
  app.run(1, () => app.cues('bossLand').length > 0);
  const card = titles(game).find(f => f.boss);
  assert.equal(card.text, 'Big bloom'); assert.equal(card.label, 'Pop the bubble first');
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

// New best: gold at once, then one small ribbon and a soft chime when nothing bigger is showing.
const bests = game => game.floaters.filter(f => f.best);
const gold = app => app.$('score-value').classList.contains('record');
test('A level replay that passes the saved best turns the score gold at once, then shows one small "New best!" ribbon and a soft chime', () => {
  const app = level(player(), 1), game = app.game();
  assert(app.run(6, () => !titles(game).length), 'the opening titles clear'); game.started = true;
  game.score = 3000; app.frame();
  assert(!gold(app), 'matching the best is not beating it'); assert.equal(app.cues('newBest').length, 0);
  game.score = 3001; app.frame();
  assert(gold(app), 'the score turns gold the moment it passes the best');
  const [ribbon] = bests(game);
  assert(ribbon, 'the ribbon shows'); assert.equal(ribbon.kind, 'title'); assert.equal(ribbon.size, 'small'); assert.equal(ribbon.text, 'New best!');
  assert.equal(ribbon.label, undefined, 'one cached sprite for every run'); assert.equal(ribbon.y, 32);
  assert.equal(app.cues('newBest').length, 1); assert.equal(app.$('announcement').textContent, 'New best score!');
  app.run(2); assert.equal(bests(game).length, 0, 'the ribbon has gone'); assert.equal(app.cues('newBest').length, 1, 'once a run');
  game.score = 5000; app.frame(); assert(gold(app), 'gold for the rest of the run'); assert.equal(app.cues('newBest').length, 1);
  game._lose(); app.frame(); assert.equal(app.cues('record').length, 1, 'the end-of-run record cue still plays');
  app.click('restart-btn'); app.click('restart-btn'); app.frame();
  assert.notEqual(app.game(), game); assert(!gold(app), 'a new run starts in the usual color');
});
test('Endless Rush shows "New best!" too, with Animations on or off, and keeps its record fanfare for the end', () => {
  for (const motion of [true, false]) {
    const app = boot({ ...player(motion), rush: { best: 500, bestWave: 2, runs: 1, blooms: 10 } }); app.click('levels-rush-btn'); app.frame();
    const game = app.game(); assert(!game.plan);
    assert(app.run(6, () => !titles(game).length)); game.started = true;
    game.score = 501; app.frame();
    assert(gold(app)); assert.equal(bests(game).length, 1, `ribbon with motion ${motion}`); assert.equal(app.cues('newBest').length, 1);
    game._lose(); app.frame(); assert.equal(app.cues('record').length, 1, 'the record fanfare at the end');
  }
});
test('"New best!" waits behind a wave ribbon, steps aside for a guardian card, and never comes back', () => {
  const app = level(player(), 1), game = app.game();
  assert(app.run(6, () => !titles(game).length)); game.started = true;
  game.floaters.push({ kind: 'title', size: 'small', x: 210, y: 32, life: .6, maxLife: .6, text: 'Wave 2 of 10', label: 'Watch the gap' });
  game.score = 3500; app.frame();
  assert(gold(app), 'gold right away'); assert.equal(bests(game).length, 0, 'the ribbon waits'); assert.equal(app.cues('newBest').length, 0, 'and so does the chime');
  assert(app.run(1.5, () => bests(game).length > 0), 'it shows once the wave ribbon is gone');
  assert.equal(titles(game).filter(f => !f.best).length, 0); assert.equal(app.cues('newBest').length, 1);
  game.floaters.push({ kind: 'title', boss: true, x: 210, y: 178, life: 1.6, maxLife: 1.6, text: 'Old Bramble', label: 'Hit the glowing knots' });
  app.frame(); assert.equal(bests(game).length, 0, 'it steps aside for a guardian card');
  app.run(3); assert.equal(bests(game).length, 0); assert.equal(app.cues('newBest').length, 1, 'and does not come back');
});
test('Past the best, the caption under the score reads "Best · beaten!" to the end of the run; a new run shows the number again', () => {
  const app = level(player(), 1), game = app.game();
  assert(app.run(6, () => !titles(game).length)); game.started = true;
  assert.equal(app.$('best-value').textContent, '3,000', 'the best to beat');
  game.score = 3000; app.frame(); assert.equal(app.$('best-value').textContent, '3,000', 'matching it is not beating it');
  game.score = 3001; app.frame(); assert.equal(app.$('best-value').textContent, '· beaten!', 'the caption says so at once');
  game.score = 4000; app.run(.5); assert.equal(app.$('best-value').textContent, '· beaten!');
  game._lose(); app.run(.5); assert.equal(app.$('best-value').textContent, '· beaten!', 'it stays to the end of the run');
  app.click('restart-btn'); app.click('restart-btn'); app.frame();
  assert.notEqual(app.game(), game); assert.match(app.$('best-value').textContent, /^\d[\d,]*$/, 'a new run shows its best to beat');
  const fresh = boot(player()); fresh.click('levels-rush-btn'); fresh.frame(); const rush = fresh.game();
  assert(fresh.run(6, () => !titles(rush).length)); rush.started = true; rush.score = 9999; fresh.run(.2);
  assert.equal(fresh.$('best-value').textContent, '—', 'a first run has no best to beat');
});
test('"New best!" also waits while a guardian is still dropping in, then shows once its name card has gone', () => {
  const app = level(player(), 3); app.run(1.3);
  const game = app.game(), boss = bossWave(app, 'Mother Morel');
  assert(boss && app.cues('bossLand').length === 0, 'the guardian is still in the air');
  game.bestBar = 3000; game.score = 3001; app.frame();
  assert(gold(app), 'the score turns gold at once');
  assert.equal(bests(game).length, 0, 'no ribbon while the guardian drops in'); assert.equal(app.cues('newBest').length, 0, 'and no chime under its landing');
  assert(app.run(1, () => app.cues('bossLand').length > 0), 'it lands'); assert(titles(game).some(f => f.boss), 'its name card is up');
  assert.equal(bests(game).length, 0, 'the card speaks first');
  assert(app.run(3, () => bests(game).length > 0), 'the ribbon follows the card'); assert(!titles(game).some(f => f.boss));
  assert.equal(app.cues('newBest').length, 1, 'one chime');
});
test('Passing the best on the winning bloom leaves the finale win alone: gold score, no ribbon or chime, the record cue at the end', () => {
  const app = level(player(), 1), game = app.game();
  assert(app.run(6, () => !titles(game).length)); game.started = true;
  game.score = 3600; game.wave = 10; game._clearLevel(); app.run(3);
  assert.equal(game.status, 'won'); assert(gold(app));
  assert.equal(game.floaters.filter(f => f.best).length, 0, 'no ribbon over the win'); assert.equal(app.cues('newBest').length, 0, 'no chime over the win');
  assert.equal(app.cues('record').length, 1, 'the record cue still plays for the result');
});
test('Nothing for a first run, a level with no best, or the tutorial', () => {
  const quiet = (app, game, label) => {
    assert(app.run(6, () => !titles(game).length), label); game.started = true; game.score = 99999; app.run(.5);
    assert(!gold(app), `${label}: no gold`); assert.equal(bests(game).length, 0, `${label}: no ribbon`); assert.equal(app.cues('newBest').length, 0, `${label}: no chime`);
  };
  let app = boot(player()); app.click('levels-rush-btn'); app.frame(); quiet(app, app.game(), 'first endless run');
  app = level(player(), 3); quiet(app, app.game(), 'first time on level 3');
  app = boot({ ...player(), rush: { best: 500, bestWave: 2, runs: 1, blooms: 10 } }); app.click('tutorial-replay'); app.frame();
  assert(app.game().scripted, 'the tutorial is running'); quiet(app, app.game(), 'tutorial');
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
test('A piece passing under the guardian\'s name shows through it: the name fades to a ghost and eases back', () => {
  // The Starseed's top dome star (y 44 when she is at y 100) sits under her name at y 37; its number must stay readable.
  const nameAlpha = (time, withStar, reducedMotion, reuse) => {
    const b = reuse || stageBoard(time); b.floaters = []; b.harvest = [];
    if (withStar && !b.buds.some(x => x.id === 'sat')) b.buds.push({ id: 'sat', bossPart: 'satellite', x: 214, y: 44, r: 11, type: 'gold', hp: 1, maxHp: 1, bloomed: false, bloomAt: -100, hitAt: -100 });
    if (!withStar) b.buds = b.buds.filter(x => x.id !== 'sat');
    let alpha = null; const ctx = recordingContext([]);
    const spy = new Proxy(ctx, { get: (t, k) => k === 'fillText' ? (text, ...rest) => { if (text === 'Mother Morel') alpha = t.globalAlpha; } : Reflect.get(t, k), set: (t, k, v) => Reflect.set(t, k, v) });
    Art.draw(spy, b, time, { theme: 'meadow', reducedMotion }); return { alpha, board: b };
  };
  const clear = nameAlpha(9, false, true).alpha, under = nameAlpha(9, true, true).alpha;
  assert(clear > .9, `the name is solid with nothing under it (${clear})`);
  assert(Math.abs(under / clear - .28) < .02, `it is a ghost with a star under it (${under})`);
  // With Animations on it eases: a frame later it is on its way, and a quarter second later it is a ghost. A twin board
  // with nothing under the name runs alongside, since the vine's own alpha moves with time too.
  let run = nameAlpha(9, false, false), twin = nameAlpha(9, false, false);
  run = nameAlpha(9.017, true, false, run.board); twin = nameAlpha(9.017, false, false, twin.board);
  assert(run.alpha < twin.alpha && run.alpha > twin.alpha * .28 + .01, `easing (${run.alpha} of ${twin.alpha})`);
  for (let t = 9.034; t < 9.5; t += .017) { run = nameAlpha(t, true, false, run.board); twin = nameAlpha(t, false, false, twin.board); }
  assert(Math.abs(run.alpha / twin.alpha - .28) < .03, `settled (${run.alpha} of ${twin.alpha})`);
  // And back once the star has moved on.
  for (let t = 9.5; t < 9.9; t += .017) { run = nameAlpha(t, false, false, run.board); twin = nameAlpha(t, false, false, twin.board); }
  assert(run.alpha / twin.alpha > .97, `back (${run.alpha} of ${twin.alpha})`);
  // While the camera leans in, a piece is tested where it is drawn: board y 60 is drawn at y 37.6 at 1.16x about y 200.
  const leaning = (camera, piece) => {
    const b = stageBoard(9); b.floaters = []; b.harvest = []; b.buds.push({ id: 'bud', x: 205, y: piece, r: 12, type: 'coral', hp: 1, maxHp: 1, bloomed: false, bloomAt: -100, hitAt: -100 });
    let alpha = null; const ctx = recordingContext([]);
    const spy = new Proxy(ctx, { get: (t, k) => k === 'fillText' ? text => { if (text === 'Mother Morel') alpha = t.globalAlpha; } : Reflect.get(t, k), set: (t, k, v) => Reflect.set(t, k, v) });
    Art.draw(spy, b, 9, { theme: 'meadow', reducedMotion: false, camera }); return alpha;
  };
  const flat = leaning(null, 60), leaned = leaning({ zoom: 1.16, fx: 210, fy: 200 }, 60);
  assert(Math.abs(leaned / flat - .28) < .02, `the lean puts the bud under the name (${flat} / ${leaned})`);
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
test('With the real art, a clear harvests only the flowers still in full bloom: spent ones have faded away', () => {
  const app = level(player(), 1, { spentFlower: Art.spentFlower }), game = app.game(); app.run(1.3);
  clearWave(app, 30);
  assert(app.run(3, () => (game.harvest || []).length > 0), 'the wave clears');
  const fresh = game.buds.filter(b => b.bloomed && !b.gift && b.group !== 'extra');
  assert(fresh.length >= 4, `the wave's own blooms (${fresh.length})`);
  assert.equal(game.harvest.length, fresh.length, 'one orb for each flower still in full bloom');
  assert(game.harvest.every(orb => orb.bud.group !== 'extra'), 'none from the blooms 1.7 to 2 s old, faded by now');
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
