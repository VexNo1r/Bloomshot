'use strict';
// The Guardian Hall: rematches of guardians already beaten, for ribbons only. The rules (Depths.hall) are checked on
// their own, then the real app.js runs on the real rush.js and depths.js in a VM with a DOM stand-in (the harness from
// test-resume, with the real daily goals so a rematch can be shown to give them no credit).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Garden = require('../garden.js');
const Goals = require('../goals.js');
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
// sound: a stand-in for BloomSound. native: a stand-in for BloomNative (its haptics). worlds: a different world list. prefs: run the real native.js first (as index.html
// does), as the native app with this map as the phone's preferences; its timers never fire, like a hidden app's.
function boot(raw, { search = '', store = null, storage = new Map(), sound = null, worlds = null, prefs = null, native = null } = {}) {
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
    BloomLevels: worlds ? { ...Levels, worlds } : Levels, BloomMoon: Moon, BloomKoi: Koi, BloomGarden: Garden, BloomGoals: Goals, ...(store ? { BloomStore: store } : {}), ...(native ? { BloomNative: native } : {}),
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
const shoot = app => { assert(app.game().fire(0, -1), 'a seed flies'); app.frame(); };
const openHall = app => { app.click('hall-btn'); assert.equal(app.$('hall-view').hidden, false, 'the Hall opens'); };
// Starts the rematch with the guardian of level id from the Hall, and fires its first seed (the clock starts there).
function rematch(app, id) {
  openHall(app); const before = app.game();
  app.click('hall-list', { hall: String(id) }); app.frame();
  const game = app.game(); assert.notEqual(game, before, `the rematch with guardian ${id} starts`);
  assert(game.plan.hall && game.plan.id === id && game.wave === 10 && game.startWave === 10 && game.lives === 3, 'on the level\'s guardian wave with three lives');
  shoot(app); return game;
}
// Blooms the guardian `seconds` after the first seed and plays on to the result card.
function win(app, seconds, lives = 3) {
  const game = app.game(); game.hallFrom = game.time - seconds; game.lives = lives;
  const boss = game.buds.find(b => b.boss); boss.hp = 1; game.bloom(boss);
  assert(app.run(8, () => app.$('result-dialog').open), 'the result shows'); assert.equal(game.status, 'won');
}
function lose(app) { const game = app.game(); game._lose(); assert(app.run(6, () => app.$('result-dialog').open), 'the result shows'); assert.equal(game.status, 'lost'); }
// Everything a rematch must never touch.
const economy = save => plain({ garden: save.garden, goals: save.goals, depths: save.depths, bossLosses: save.bossLosses, powers: save.powers, run: save.run, rush: save.rush, met: save.met });

test('The rules: ribbons by lives and par, never going down; best time kept; damaged records dropped', () => {
  const H = Depths.hall;
  assert.deepEqual(H.ribbons, ['bronze', 'silver', 'gold']);
  assert.deepEqual(Object.keys(H.par).map(Number), Depths.levels.map(level => level.id), 'a par for every guardian');
  for (const level of Depths.levels) assert(H.par[level.id] > 0 && H.par[level.id] % 5 === 0, 'pars are whole 5 s steps');
  assert(H.par[10] === Math.max(...Object.values(H.par)), 'the Starseed has the longest par');
  assert.equal(H.ribbonFor(3, { won: true, livesLost: 1, seconds: 5 }), 'bronze', 'a lost life is bronze however quick');
  assert.equal(H.ribbonFor(3, { won: true, livesLost: 0, seconds: H.par[3] + .1 }), 'silver');
  assert.equal(H.ribbonFor(3, { won: true, livesLost: 0, seconds: H.par[3] }), 'gold', 'par itself is gold');
  assert.equal(H.ribbonFor(3, { won: false, livesLost: 0, seconds: 1 }), '', 'a loss earns nothing');
  assert.equal(H.ribbonFor(11, { won: true, seconds: 1 }), '', 'no such guardian');
  let r = H.record({}, 2, { won: true, livesLost: 0, seconds: 30.04 });
  assert.deepEqual(r.hall, { 2: { wins: 1, bestTime: 30, ribbon: 'gold' } }); assert(r.newRibbon && !r.newBest);
  r = H.record(r.hall, 2, { won: true, livesLost: 2, seconds: 25.26 });
  assert.deepEqual(r.hall[2], { wins: 2, bestTime: 25.3, ribbon: 'gold' }, 'a bronze win keeps the gold ribbon and takes the faster time');
  assert.equal(r.ribbon, 'bronze'); assert(!r.newRibbon && r.newBest);
  const lost = H.record(r.hall, 2, { won: false, livesLost: 3, seconds: 1 });
  assert.deepEqual(lost.hall, r.hall, 'a loss writes nothing'); assert.equal(lost.ribbon, '');
  assert.deepEqual(H.record({ 5: { wins: 1, bestTime: 99, ribbon: 'bronze' } }, 5, { won: true, livesLost: 0, seconds: 120 }).hall[5], { wins: 2, bestTime: 99, ribbon: 'silver' }, 'bronze goes up to silver, the best time stays');
  assert.deepEqual(H.normalize({ 1: { wins: 2, bestTime: 19.96, ribbon: 'gold' }, 2: { wins: 0, bestTime: 9, ribbon: 'gold' }, 3: { wins: 1, bestTime: 9, ribbon: 'platinum' }, 4: { wins: 1, bestTime: -1, ribbon: 'bronze' },
    11: { wins: 1, bestTime: 9, ribbon: 'gold' }, 5: [1], 6: 'x', 7: { wins: 1.5, bestTime: 9, ribbon: 'gold' } }), { 1: { wins: 2, bestTime: 20, ribbon: 'gold' } });
  for (const junk of [null, undefined, 3, 'hall', [], [{ wins: 1 }]]) assert.deepEqual(H.normalize(junk), {});
});

test('Only beaten guardians open, and a paid level\'s only while the unlock is owned', () => {
  const H = Depths.hall, depths = cleared(4);
  assert(H.open(depths, {}, 4, false) && !H.open(depths, {}, 5, false) && !H.open(depths, {}, 5, true), 'level 5 not beaten: shut, owned or not');
  assert(!H.open({ 1: { stars: 0, best: 10, wave: 9 } }, {}, 1, true), 'reaching the guardian is not beating it');
  assert(H.beaten({}, { 6: { wins: 1, bestTime: 9, ribbon: 'bronze' } }, 6), 'a rematch win counts as beaten');
  assert(!H.open({ 6: { stars: 2, best: 1, wave: 10 } }, {}, 6, false), 'a beaten paid guardian stays shut without the unlock (a refund)');
  assert(H.open({ 6: { stars: 1, best: 1, wave: 10 } }, {}, 6, true), 'and opens with it');
  assert(!H.beaten(depths, {}, 0) && !H.beaten(depths, {}, 11));
});

test('An older save loads unchanged: no hall field is added, and a damaged one is cleaned', () => {
  const old = player({ powers: { sunburst: 2, dandelion: 1, beeline: 0, lullaby: 3 }, bossLosses: { 3: 1 } });
  const app = boot(old); app.click('settings-btn'); app.frame();
  app.click('hall-btn'); // opening the Hall writes nothing either
  const after = app.saved();
  assert(!Object.hasOwn(after, 'hall'), 'no hall field until a rematch is won');
  for (const key of ['depths', 'powers', 'bossLosses', 'tutorial', 'powersMet']) assert.deepEqual(after[key], old[key], `${key} kept`);
  const kept = boot(player({ hall: { 1: { wins: 3, bestTime: 18.25, ribbon: 'gold' }, 2: { wins: 1, bestTime: 9, ribbon: 'shiny' } } }));
  kept.click('hall-btn'); kept.game(); kept.frame();
  const hall = boot(undefined, { storage: kept.storage });
  hall.click('hall-btn');
  assert(hall.$('hall-list').innerHTML.includes('Gold ribbon · best 0:18.2') || hall.$('hall-list').innerHTML.includes('Gold ribbon · best 0:18.3'), hall.$('hall-list').innerHTML.slice(0, 400));
  assert(!hall.$('hall-list').innerHTML.includes('shiny'));
});

test('The Levels map shows the Hall only once a guardian is beaten; the Hall lists all ten, locked ones as silhouettes with no store text', () => {
  let app = boot(player({ depths: {} }));
  assert.equal(app.$('hall-btn').hidden, true, 'a new player sees no Hall');
  app = boot(player({ depths: { 1: { stars: 0, best: 900, wave: 10 } } }));
  assert.equal(app.$('hall-btn').hidden, true, 'reaching a guardian is not enough');
  app = boot(player({}, 2));
  assert.equal(app.$('hall-btn').hidden, false, 'one beaten guardian shows it');
  openHall(app);
  const html = app.$('hall-list').innerHTML, cards = html.split('<li ').slice(1);
  assert.equal(cards.length, 10, 'ten guardian cards');
  for (const [i, card] of cards.entries()) {
    const id = i + 1;
    if (id <= 2) { assert(card.includes(Depths.bosses[i].name) && card.includes(`data-hall="${id}"`), `guardian ${id} has a Rematch button`); continue; }
    assert(card.includes('locked') && card.includes(`Beat Level ${id} to meet them`), `guardian ${id} is locked`);
    assert(!card.includes(Depths.bosses[i].name), `guardian ${id}'s name stays hidden`);
    assert(!card.includes('data-hall='), `guardian ${id} has no button`);
  }
  assert.doesNotMatch(html, /\$|price|buy|unlock|data-buy/i, 'no prices, purchase buttons or offers');
  assert.equal(app.$('hall-summary').textContent, '2 of 10 beaten · 0 ribbons');
});

test('Locked and unowned guardians cannot be started, by button or by a stray tap', () => {
  const store = fakeStore({ owned: false });
  const app = boot(player({ depths: { ...cleared(4), 6: { stars: 1, best: 10, wave: 10 } } }), { store });
  openHall(app);
  const html = app.$('hall-list').innerHTML;
  assert(html.includes('Opens with levels 5 to 10') && !html.includes('data-hall="6"'), 'a beaten paid guardian without the unlock has no button');
  assert.doesNotMatch(html, /\$|price|buy|data-buy/i);
  const before = app.game();
  for (const id of ['5', '6', '7', '11', 'x']) { app.click('hall-list', { hall: id }); app.frame(); assert.equal(app.game(), before, `guardian ${id} does not start`); }
  assert.equal(app.$('hall-view').hidden, false, 'still in the Hall');
  store.answer(true); app.frame();
  assert(app.$('hall-list').innerHTML.includes('data-hall="6"'), 'owning the unlock opens the beaten paid guardian');
  assert(!app.$('hall-list').innerHTML.includes('data-hall="5"'), 'but not one never beaten');
  app.click('hall-list', { hall: '6' }); app.frame();
  assert(app.game().plan.hall && app.game().plan.id === 6, 'the owned, beaten guardian starts');
});

test('A rematch is the level\'s own guardian wave, the "Try the boss" start', () => {
  const app = boot(player({}, 3)), game = rematch(app, 3);
  const plain = new Rush.RushGame({ plan: { id: 3, name: 'x', waves: 10, wave: n => Depths.wave(3, n) }, startWave: 10 });
  const boss = game.buds.find(b => b.boss), same = plain.buds.find(b => b.boss);
  assert.equal(boss.name, 'Mother Morel'); assert.equal(boss.maxHp, same.maxHp); assert.equal(boss.bossKind, same.bossKind);
  assert.equal(game.speed, plain.speed); assert.equal(game.descentSpeed, plain.descentSpeed); assert.equal(game.bossWave, true);
  assert.equal(game.buds.filter(b => !b.gift).length, plain.buds.filter(b => !b.gift).length, 'the same escorts');
  assert.equal(app.$('level-name').textContent, 'Mother Morel');
  assert.equal(app.$('level-label').textContent, 'Guardian Hall');
  assert.match(app.$('score-value').textContent, /^0:0\d$/, 'the headline is the running clock, not points');
  assert.equal(app.$('score-display').attributes['aria-label'], 'Time');
  assert.equal(app.$('pause-levels-label').textContent, 'Hall'); assert.equal(app.$('back-btn').attributes['aria-label'], 'Back to the Guardian Hall');
});

test('A clean, quick win earns gold and nothing else: no seeds, stars, best, goals, powerups or level change', () => {
  const app = boot(player({ powers: { sunburst: 1, dandelion: 1, beeline: 1, lullaby: 1 } }, 3)), before = economy(app.saved());
  rematch(app, 2); win(app, Depths.hall.par[2] - 3);
  const after = app.saved();
  assert.deepEqual(after.hall, { 2: { wins: 1, bestTime: Depths.hall.par[2] - 3, ribbon: 'gold' } });
  assert.deepEqual(economy(after), before, 'garden seeds, goals, depths, boss losses, powers, run and Rush all unchanged');
  assert.equal(app.$('result-eyebrow').textContent, 'Guardian bloomed!'); assert.equal(app.$('result-title').textContent, 'Rootknot');
  assert.match(app.$('reward-flower').innerHTML, /New ribbon!.*Gold ribbon/);
  assert.equal(app.$('result-score').textContent, `0:${Depths.hall.par[2] - 3}.0`);
  assert.equal(app.$('garden-reward').hidden, true, 'no seed reward'); assert.equal(app.$('result-stars').hidden, true, 'no stars');
  assert.equal(app.$('result-goals').hidden, true, 'no goal news'); assert.equal(app.$('share-btn').hidden, true); assert.equal(app.$('checkpoint-btn').hidden, true);
  assert.equal(app.$('next-btn').textContent, 'Hall'); assert.equal(app.$('retry-btn').textContent, 'Rematch');
  // Rematch starts it again; Hall goes back to the Hall.
  app.click('retry-btn'); app.frame(); assert(app.game().plan.hall && app.game().plan.id === 2 && app.game().wave === 10, 'Rematch plays it again');
  shoot(app); win(app, Depths.hall.par[2] + 9);
  assert.deepEqual(app.saved().hall[2], { wins: 2, bestTime: Depths.hall.par[2] - 3, ribbon: 'gold' }, 'a slower silver keeps gold and the best time');
  assert.match(app.$('reward-flower').innerHTML, /Ribbon earned.*Silver ribbon.*You hold the gold ribbon/);
  app.click('next-btn'); assert.equal(app.$('hall-view').hidden, false, 'Hall returns to the Hall');
  assert.match(app.$('hall-list').innerHTML, /Gold ribbon · best 0:32\.0/);
});

test('Ribbons follow lives and par; a lost rematch writes nothing and counts no guardian loss', () => {
  const app = boot(player({}, 4)), before = economy(app.saved());
  rematch(app, 4); win(app, 5, 2);
  assert.equal(app.saved().hall[4].ribbon, 'bronze', 'a lost life is bronze');
  assert.match(app.$('result-message').textContent, /Keep all 3 lives for silver/);
  app.click('retry-btn'); app.frame(); shoot(app); win(app, Depths.hall.par[4] + .5);
  assert.equal(app.saved().hall[4].ribbon, 'silver', 'clean but over par is silver');
  assert.equal(app.$('result-message').textContent, 'No lives lost! Win in 1:00 or less for gold.');
  app.click('retry-btn'); app.frame(); shoot(app); lose(app);
  assert.deepEqual(app.saved().hall[4], { wins: 2, bestTime: 5, ribbon: 'silver' }, 'a loss changes nothing');
  assert.deepEqual(economy(app.saved()), before, 'and still no boss loss, seeds or goals');
  assert.equal(app.$('result-eyebrow').textContent, 'Out of lives'); assert.equal(app.$('retry-btn').textContent, 'Rematch');
  assert.equal(app.$('result-garden-btn').textContent, 'Hall'); assert.equal(app.$('result-garden-btn').hidden, false);
  assert.equal(app.$('checkpoint-btn').hidden, true, 'no Try the boss or wave-6 offer');
  app.click('result-garden-btn'); assert.equal(app.$('hall-view').hidden, false, 'Hall goes back to the Hall');
});

test('A rematch keeps no run of its own and leaves a kept level run alone', () => {
  const run = { level: 3, wave: 8, lives: 2, score: 4321, from: 1, blooms: 77, chain: 9, gift: false };
  const app = boot(player({ run }, 3));
  rematch(app, 1); app.hide();
  assert.deepEqual(app.saved().run, run, 'hiding mid-rematch keeps the level run as it was');
  app.show(); app.click('pause-resume'); app.run(3); win(app, 30);
  assert.deepEqual(app.saved().run, run, 'winning the rematch keeps it too');
  app.click('next-btn'); app.click('hall-back');
  assert.equal(app.$('resume-btn').hidden, false, 'the map still offers the kept run');
  app.click('resume-btn'); app.frame();
  assert(app.game().plan.id === 3 && app.game().wave === 8 && !app.game().plan.hall, 'and picks it up');
});

test('Back, Pause and Levels during a rematch go to the Hall, which offers to resume it', () => {
  const app = boot(player({}, 2)); const game = rematch(app, 1);
  app.click('back-btn'); assert.equal(app.$('hall-view').hidden, false, 'Back goes to the Hall');
  assert.match(app.$('hall-list').innerHTML, /data-hall="1"[^>]*aria-label="Resume the rematch with Old Sunny">Resume</);
  app.click('hall-list', { hall: '1' }); app.frame(); assert.equal(app.game(), game, 'Resume picks the same rematch up');
  assert.equal(app.$('game-view').hidden, false);
  app.run(3); app.click('pause-btn'); assert(app.$('pause-dialog').open, 'it pauses like a level');
  app.click('pause-levels'); assert.equal(app.$('hall-view').hidden, false, 'the Paused card\'s Hall button goes to the Hall');
  app.click('hall-back'); assert.equal(app.$('levels-view').hidden, false, 'and the Hall\'s Levels button to the map');
  assert.equal(app.$('resume-btn').hidden, true, 'the map does not offer a rematch as a level run');
});

test('A rematch won as the app closes keeps its ribbon: the guardian\'s cascade is settled as the page hides', () => {
  const app = boot(player({}, 2)), game = rematch(app, 1);
  game.hallFrom = game.time - 10; const boss = game.buds.find(b => b.boss); boss.hp = 1; game.bloom(boss); app.frame();
  assert(game.bossDown && game.status !== 'won', 'the guardian is down and its cascade is still blooming');
  app.fire('window', 'pagehide'); app.hide();
  assert.equal(game.status, 'won', 'the cascade is played out');
  const hall = app.saved().hall;
  assert(hall && hall[1] && hall[1].wins === 1 && hall[1].ribbon === 'gold', JSON.stringify(hall));
  assert(Math.abs(hall[1].bestTime - 10) < .2, 'with the time at the guardian\'s bloom');
});

test('The time shown is the time judged: rounded to tenths alike on the result, the save and the Hall card', () => {
  const app = boot(player({}, 2));
  const timed = (id, seconds) => { const game = rematch(app, id); game.hallTime = seconds; const boss = game.buds.find(b => b.boss); boss.hp = 1; game.bloom(boss);
    assert(app.run(8, () => app.$('result-dialog').open), 'the result shows'); };
  const label = () => app.$('result-dialog').querySelector('.score-label').textContent;
  timed(1, Depths.hall.par[1] + .04);
  assert.deepEqual(app.saved().hall[1], { wins: 1, bestTime: Depths.hall.par[1], ribbon: 'gold' }, 'a time that shows as par is gold');
  assert.equal(app.$('result-score').textContent, '0:20.0'); assert.equal(label(), 'Time', 'a first win has no earlier best to show');
  assert.equal(app.$('result-message').textContent, 'No lives lost, in 0:20 or less. Wonderful!');
  app.click('retry-btn'); app.frame(); shoot(app); app.game().hallTime = Depths.hall.par[1] + .06; const boss = app.game().buds.find(b => b.boss); boss.hp = 1; app.game().bloom(boss);
  assert(app.run(8, () => app.$('result-dialog').open));
  assert.equal(app.$('result-score').textContent, '0:20.1'); assert.equal(label(), 'Time · best 0:20.0');
  app.click('next-btn'); app.click('hall-back');
  timed(2, 18.46);
  assert.equal(app.$('result-score').textContent, '0:18.5'); assert.equal(label(), 'Time');
  app.click('next-btn'); assert.match(app.$('hall-list').innerHTML, /best 0:18\.5/);
});

test('A lesser win offers the next ribbon up from the one held', () => {
  const app = boot(player({}, 2));
  rematch(app, 1); win(app, 5);
  assert.equal(app.saved().hall[1].ribbon, 'gold');
  app.click('retry-btn'); app.frame(); shoot(app); win(app, 5, 2);
  assert.match(app.$('reward-flower').innerHTML, /Bronze ribbon.*You hold the gold ribbon/);
  assert.equal(app.$('result-message').textContent, 'You hold the gold ribbon. Race your best time!');
  app.click('next-btn'); app.click('hall-back');
  rematch(app, 2); win(app, Depths.hall.par[2] + 5);
  app.click('retry-btn'); app.frame(); shoot(app); win(app, 5, 1);
  assert.equal(app.$('result-message').textContent, 'Gold: no lives lost, in 0:35 or less.', 'a bronze win while holding silver points at gold');
});

test('A gift caught in a rematch is lent for it only, and is spent before the player\'s own', () => {
  const powers = { sunburst: 1, dandelion: 1, beeline: 1, lullaby: 1 };
  const app = boot(player({ powers }, 2)), game = rematch(app, 2);
  // The board plays its events out between frames (the guardian's entrance holds them a moment).
  const drain = () => assert(app.run(5, () => !game.events.some(e => e.type === 'gift' || e.type === 'power')), 'the event is handled');
  game.event('gift', { power: 'lullaby', x: 210, y: 200 }); drain();
  assert.deepEqual(app.saved().powers, powers, 'the save never gains it');
  assert.match(app.$('game-hint').textContent, /for this rematch/);
  game.event('power', { power: 'lullaby', x: 210, y: 400 }); drain();
  assert.deepEqual(app.saved().powers, powers, 'the lent one is used first');
  game.event('power', { power: 'lullaby', x: 210, y: 400 }); drain();
  assert.equal(app.saved().powers.lullaby, 0, 'then the player\'s own, as in a level');
  game.event('gift', { power: 'beeline', x: 210, y: 200 }); drain(); win(app, 40);
  assert.equal(app.saved().powers.beeline, 1, 'an unused lent gift goes with the rematch');
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
