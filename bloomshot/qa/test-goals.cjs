'use strict';
// Daily goals: selection, progress, one-time completion and the all-three bonus. Run: node qa/test-goals.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Goals = require('../goals.js');
const Garden = require('../garden.js');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
const DAY = '2026-10-09';
const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));
// Finds a date whose goals include the given id, so each rule is tested on a real day's set.
function dayWith(id) { const date = days.find(d => Goals.forDay(d).some(g => g.id === id)); assert(date, `no day offers ${id}`); return date; }
const slotOf = (date, id) => Goals.forDay(date).findIndex(g => g.id === id);

test('Browser and CommonJS builds expose the same API', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../goals.js'), 'utf8'), context);
  assert.deepEqual(Object.keys(context.BloomGoals).sort(), Object.keys(Goals).sort());
});
test('Every day has three goals, one in Rush, one puzzle and one to explore, the same for everyone', () => {
  for (const date of days) {
    const list = Goals.forDay(date);
    assert.deepEqual(list.map(g => g.group), ['rush', 'puzzle', 'explore']);
    assert.deepEqual(Goals.forDay(date), list);
  }
  const seen = new Set(days.flatMap(d => Goals.forDay(d).map(g => g.id)));
  assert.deepEqual([...seen].sort(), Goals.catalog.map(g => g.id).sort(), 'every goal comes up within two months');
  const sets = new Set(days.map(d => Goals.forDay(d).map(g => g.id).join()));
  assert(sets.size >= 10, 'the daily mix varies');
  assert.throws(() => Goals.forDay('2026-02-30'), TypeError); assert.throws(() => Goals.forDay('soon'), TypeError);
});
test('Goals read plainly and every one points at a place to play it', () => {
  for (const g of Goals.catalog) {
    assert(g.text.length <= 30, g.text); assert(Number.isInteger(g.target) && g.target >= 1);
    assert(['rush', 'puzzles', 'daily', 'moon', 'koi', 'meadow'].includes(g.play)); assert(Object.isFrozen(g));
  }
});
test('Rush blooms add up across runs, while the wave and chain goals keep the best run', () => {
  let date = dayWith('rush-blooms'), slot = slotOf(date, 'rush-blooms');
  let r = Goals.record(null, date, { type: 'rush', blooms: 30, wave: 3, chain: 5 });
  assert.equal(r.state.progress[slot], 30); assert.deepEqual(r.done, []);
  r = Goals.record(r.state, date, { type: 'rush', blooms: 25, wave: 2, chain: 2 });
  assert.equal(r.state.progress[slot], 50); assert.deepEqual(r.done, [slot]);
  date = dayWith('rush-wave'); slot = slotOf(date, 'rush-wave');
  r = Goals.record(null, date, { type: 'rush', blooms: 99, wave: 3, chain: 20 });
  assert.equal(r.state.progress[slot], 3);
  r = Goals.record(r.state, date, { type: 'rush', blooms: 1, wave: 2, chain: 1 }); assert.equal(r.state.progress[slot], 3);
  r = Goals.record(r.state, date, { type: 'rush', blooms: 1, wave: 6, chain: 1 }); assert.equal(r.state.progress[slot], 4); assert(r.done.includes(slot));
  date = dayWith('rush-chain'); slot = slotOf(date, 'rush-chain');
  r = Goals.record(null, date, { type: 'rush', blooms: 9, wave: 1, chain: 9 }); assert.equal(r.state.progress[slot], 8); assert(r.done.includes(slot));
});
test('Puzzle goals count clears in any garden mode; stars, daily, Moon and Koi each count only their own', () => {
  let date = dayWith('puzzles'), slot = slotOf(date, 'puzzles');
  let r = Goals.record(null, date, { type: 'clear', mode: 'moon', stars: 1 });
  r = Goals.record(r.state, date, { type: 'clear', mode: 'campaign', stars: 2 }); assert.equal(r.state.progress[slot], 2); assert(r.done.includes(slot));
  date = dayWith('perfect'); slot = slotOf(date, 'perfect');
  r = Goals.record(null, date, { type: 'clear', mode: 'koi', stars: 2 }); assert.equal(r.state.progress[slot], 0);
  r = Goals.record(r.state, date, { type: 'clear', mode: 'daily', stars: 3 }); assert.equal(r.state.progress[slot], 1);
  for (const id of ['daily', 'moon', 'koi']) {
    date = dayWith(id); slot = slotOf(date, id);
    const other = id === 'moon' ? 'koi' : 'moon';
    r = Goals.record(null, date, { type: 'clear', mode: other, stars: 3 }); assert.equal(r.state.progress[slot], 0, id);
    r = Goals.record(r.state, date, { type: 'clear', mode: id, stars: 1 }); assert.equal(r.state.progress[slot], 1, id); assert(r.done.includes(slot));
  }
  date = dayWith('meadow'); slot = slotOf(date, 'meadow');
  r = Goals.record(null, date, { type: 'rush', blooms: 50, wave: 9, chain: 9 }); assert.equal(r.state.progress[slot], 0);
  r = Goals.record(r.state, date, { type: 'meadow' }); assert.equal(r.state.progress[slot], 1); assert(r.done.includes(slot));
  r = Goals.record(null, date, { type: 'clear', mode: 'preview', stars: 3 }); assert.deepEqual(r.state.progress, [0, 0, 0]);
});
test('A goal completes once; finishing all three gives the bonus once', () => {
  const date = days.find(d => { const ids = Goals.forDay(d).map(g => g.id); return ids.includes('rush-wave') && ids.includes('puzzles') && ids.includes('meadow'); });
  assert(date, 'a day with wave, puzzles and meadow goals');
  let r = Goals.record(null, date, { type: 'rush', blooms: 5, wave: 4, chain: 1 }); assert.equal(r.done.length, 1); assert.equal(r.bonus, false);
  r = Goals.record(r.state, date, { type: 'rush', blooms: 5, wave: 9, chain: 1 }); assert.deepEqual(r.done, []);
  r = Goals.record(r.state, date, { type: 'clear', mode: 'campaign', stars: 1 });
  r = Goals.record(r.state, date, { type: 'clear', mode: 'campaign', stars: 1 }); assert.equal(r.done.length, 1);
  r = Goals.record(r.state, date, { type: 'meadow' }); assert.equal(r.done.length, 1); assert.equal(r.bonus, true);
  r = Goals.record(r.state, date, { type: 'meadow' }); assert.deepEqual(r.done, []); assert.equal(r.bonus, false);
  const s = Goals.summary(r.state, date); assert.equal(s.done, 3); assert.equal(s.bonus, true);
});
test('A new day starts fresh, and damaged or forged saves cannot mark a goal done', () => {
  const r = Goals.record(null, DAY, { type: 'meadow' });
  assert.deepEqual(Goals.normalize(r.state, '2026-10-10'), { day: '2026-10-10', progress: [0, 0, 0], done: [false, false, false], bonus: false });
  assert.deepEqual(Goals.normalize(JSON.parse(JSON.stringify(r.state)), DAY), r.state);
  for (const raw of [null, [], 'x', { day: DAY, progress: 'x', done: 'x' }]) assert.deepEqual(Goals.normalize(raw, DAY).done, [false, false, false]);
  const forged = Goals.normalize({ day: DAY, progress: [0, -5, 1e9], done: [true, true, true], bonus: true }, DAY);
  assert.equal(forged.done[0], false); assert.equal(forged.done[1], false); assert.equal(forged.bonus, false);
  assert.equal(forged.progress[2], Goals.forDay(DAY)[2].target);
  const before = JSON.stringify(r.state); Object.freeze(r.state); Goals.record(r.state, DAY, { type: 'meadow' });
  assert.equal(JSON.stringify(r.state), before, 'record never changes the caller state');
});
test('The garden pays 4 seeds per goal and a 6-seed bonus, once per day and slot', () => {
  const pay = (slot, runId = `goal-${DAY}-${slot}`) => ({ mode: 'goal', completed: true, runId, day: DAY, slot });
  let result = Garden.grant(Garden.normalize({ seeds: 0 }), pay(0)); assert.equal(result.awarded, 4);
  result = Garden.grant(result.state, pay(0)); assert.equal(result.awarded, 0); assert.equal(result.duplicate, true);
  result = Garden.grant(result.state, pay('bonus')); assert.equal(result.awarded, 6); assert.equal(result.state.seeds, 10);
  for (const bad of [pay(3), pay('extra'), { ...pay(1), day: '2026-02-30' }, { ...pay(1), day: undefined }]) assert.equal(Garden.grant(Garden.normalize(), bad).reason, 'invalid-reward');
  assert.deepEqual([Garden.daily.goalSeeds, Garden.daily.goalBonus], [4, 6]);
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  observations: { goalsPerDay: 3, groups: ['rush', 'puzzle', 'explore'], seedsPerGoal: 4, bonusForAllThree: 6, catalog: Goals.catalog.map(g => g.id) }, results };
fs.writeFileSync(path.join(__dirname, 'goals-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
