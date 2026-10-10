'use strict';
// The first-time tutorial, played by a bot on the real engine: every step's control does what the card says it
// does to the flowers on the board, a miss goes back a step instead of getting stuck, and a player who acts
// within a second or two of each card finishes well inside 46 seconds. Run: node qa/test-tutorial.cjs
const assert = require('node:assert/strict');
const Rush = require('../rush.js');
const Tutorial = require('../tutorial.js');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
// Plays the whole tutorial. `react` is how long the bot reads a card before acting; `aim` can be swapped to miss.
function play({ react = 0.9, aim = null, splitAfter = 0.5 } = {}) {
  const game = new Rush.RushGame({ scripted: true }), t = Tutorial.create(), log = [];
  t.begin(game);
  const perStep = Array.from({ length: Tutorial.steps.length }, () => ({ blooms: 0, sunburst: 0, split: 0, time: 0 }));
  let guard = 0, before = 0;
  const dt = 1 / 60;
  while (t.phase !== 'end' && guard++ < 60 * 200) {
    const step = t.index, p = t.current, wait = p && p.allow.includes('split') ? splitAfter : react;
    // The bot acts once each time a card has been up for its reading time.
    if (p && t.clock >= wait && before < wait) {
      for (const action of p.allow) {
        if (action === 'fire') { const [x, y] = (aim && aim(step)) || p.finger; if (game.fire(x - 210, y - 498)) break; }
        else if (action === 'rotate') { if (game.rotate('petal')) break; }
        else if (action === 'split') { if (game.split()) break; }
        else if (action.startsWith('power:')) {
          const id = action.slice(6);
          if (id === 'lullaby' ? game.lull() : game.armed !== id && game.arm(id)) { if (id === 'lullaby') t.spend(id); break; }
        }
      }
    }
    before = t.clock;
    t.tick(game, dt);
    game.step(dt * t.scale);
    for (const event of game.drainEvents()) {
      t.observe(event); log.push(event.type);
      const s = perStep[Math.max(0, t.index)];
      if (s && event.type === 'bloom' && String(event.bud.id).startsWith(`t${t.index + 1}-`)) s.blooms++;
      if (s && event.type === 'sunburst') s.sunburst = event.count;
      if (s && event.type === 'split') s.split++;
    }
    if (perStep[t.index]) perStep[t.index].time += dt;
  }
  return { game, t, perStep, log, guard };
}

test('There are seven steps, one for each control, in the order they are introduced', () => {
  assert.deepEqual(Tutorial.steps.map(s => s.id), ['fire', 'petal', 'split', 'sunburst', 'dandelion', 'beeline', 'lullaby']);
});
test('Every card points at something the player can find: the board, a button on the page, or a powerup in the tray', () => {
  const fs = require('node:fs'), path = require('node:path');
  const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const Powers = require('../powers.js');
  for (const step of Tutorial.steps) for (const prompt of step.prompts) {
    if (prompt.also) assert(page.includes(`id="${prompt.also}"`) || page.includes(`id = '${prompt.also}'`), `${prompt.also} is on the page`);
    if (prompt.target === 'petal') { assert.equal(step.id, 'petal', 'only the petal step lights the petal'); assert(prompt.allow.includes('rotate')); continue; }
    if (prompt.target === 'board') { assert(prompt.allow.includes('fire'), `${step.id}: a board card asks for a shot`); assert(prompt.finger, `${step.id}: and shows where to drag`); continue; }
    if (prompt.target.startsWith('power:')) { assert(Powers.ids.includes(prompt.target.slice(6)), prompt.target); assert(prompt.allow.includes(prompt.target), `${step.id}: the highlighted powerup works`); continue; }
    assert(page.includes(`id="${prompt.target}"`) || page.includes(`id = '${prompt.target}'`), `${prompt.target} is on the page`);
  }
});
test('A player who acts about a second after each card finishes in well under 46 seconds', () => {
  const run = play({ react: 0.9 });
  assert.equal(run.t.phase, 'end');
  assert(run.t.elapsed < 40, `took ${run.t.elapsed.toFixed(1)} s`);
});
test('Even reading each card for two seconds, the whole tutorial stays under 46 seconds', () => {
  const run = play({ react: 2, splitAfter: 1.2 });
  assert.equal(run.t.phase, 'end');
  assert(run.t.elapsed < 46, `took ${run.t.elapsed.toFixed(1)} s`);
});
test('Each control does what its card says to the flowers on the board', () => {
  const { perStep } = play();
  const [fire, petal, split, sun, dandelion, bee] = perStep;
  assert(fire.blooms >= 3, `aim and fire bloomed ${fire.blooms}`);
  assert(petal.blooms >= 1, 'the turned petal banks the seed into the bunch on the right');
  assert(split.split === 1, 'Split turns one seed into three');
  assert(sun.sunburst >= 10, `Sunburst caught ${sun.sunburst}`);
  assert(dandelion.blooms >= 7, `Dandelion bloomed ${dandelion.blooms} across the three bunches`);
  assert(bee.blooms >= 7, `Bee Line bloomed ${bee.blooms} behind the cups`);
});
test('Without turning, the petal sends a straight shot away from the bunch; turned, it sends it in', () => {
  const game = new Rush.RushGame({ scripted: true }), t = Tutorial.create();
  t.begin(game); t.next(game);
  assert.equal(t.step.id, 'petal');
  game.fire(0, -1);
  for (let i = 0; i < 240; i++) game.step(1 / 120);
  assert.equal(game.drainEvents().filter(e => e.type === 'bloom').length, 0, 'the unturned petal misses');
  t.next(game); t.index = 0; t.next(game);
  game.rotate('petal'); game.fire(0, -1);
  for (let i = 0; i < 240; i++) game.step(1 / 120);
  assert(game.drainEvents().some(e => e.type === 'bloom'), 'the turned petal banks into the bunch');
});
test('While a card waits the game almost stops, and once the control is used it plays at full speed', () => {
  const game = new Rush.RushGame({ scripted: true }), t = Tutorial.create();
  t.begin(game);
  for (let i = 0; i < 60; i++) t.tick(game, 1 / 60);
  assert.equal(t.phase, 'prompt');
  assert(t.scale <= Tutorial.SLOW + .01, `scale ${t.scale}`);
  game.fire(72, -284); for (const e of game.drainEvents()) t.observe(e);
  for (let i = 0; i < 30; i++) t.tick(game, 1 / 60);
  assert(t.scale > .9, `scale ${t.scale}`);
});
test('Only the control on the card works while it waits', () => {
  const game = new Rush.RushGame({ scripted: true }), t = Tutorial.create();
  t.begin(game); t.index = 2; t.next(game);
  for (let i = 0; i < 60; i++) t.tick(game, 1 / 60);
  assert.equal(t.step.id, 'sunburst');
  assert.equal(t.allows('power:sunburst'), true);
  for (const other of ['fire', 'split', 'rotate', 'power:dandelion', 'power:beeline', 'power:lullaby']) assert.equal(t.allows(other), false, other);
});
test('A missed shot goes back to the card that sets it up, with the step\'s free use restored', () => {
  const run = play({ aim: step => step === 3 ? [40, 470] : null });
  assert.equal(run.t.phase, 'end');
  assert(run.perStep[3].sunburst >= 10, 'the second try still caught the crowd');
});
test('Flowers stop just above the line and never cost a life, and the run never clears or ends by itself', () => {
  const game = new Rush.RushGame({ scripted: true }), t = Tutorial.create();
  t.begin(game);
  for (let i = 0; i < 120 * 90; i++) game.step(1 / 120);
  assert.equal(game.lives, 3); assert.equal(game.status, 'flying');
  assert(game.buds.every(b => b.y + b.r < game.dangerY), 'every flower is above the line');
  assert(!game.drainEvents().some(e => ['life', 'won', 'lost', 'cleared'].includes(e.type)));
});
test('The tutorial hands out its own powerups, one of each a step', () => {
  const t = Tutorial.create(), game = new Rush.RushGame({ scripted: true });
  t.begin(game);
  for (const id of ['sunburst', 'dandelion', 'beeline', 'lullaby']) assert.equal(t.count(id), 1);
  t.spend('sunburst'); assert.equal(t.count('sunburst'), 0);
  t.next(game); assert.equal(t.count('sunburst'), 1);
});
test('It ends with everything left on the board blooming and a card to start playing', () => {
  const run = play();
  assert(run.game.buds.every(b => b.bloomed), 'the finale blooms what was left');
  assert.equal(run.t.view().title, "You're ready!");
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
