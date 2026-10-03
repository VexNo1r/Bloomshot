'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Garden = require('../garden.js');
const { flowers } = require('../levels.js');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function rush(runId, blooms = 24, wave = 3, more = {}) {
  return { runId, mode: 'rush', completed: true, blooms, wave, ...more };
}
function campaign(runId, levelId = 1, stars = 1, more = {}) {
  return { runId, mode: 'campaign', completed: true, levelId, stars, ...more };
}
test('Browser UMD and CommonJS expose the same public API', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../garden.js'), 'utf8'), context);
  assert.deepEqual(Object.keys(context.BloomGarden).sort(), Object.keys(Garden).sort());
  assert.equal(context.BloomGarden.normalize().seeds, 4);
});
test('Six beds match the existing earned flower catalog without changing its unlocks', () => {
  assert.deepEqual(Garden.plots.map(p => p.id), ['sunbell', 'coral', 'lilac', 'honey', 'moon', 'dawn']);
  Garden.plots.forEach(p => {
    const flower = flowers.find(f => f.id === p.flowerId);
    assert(flower); assert.equal(p.name, flower.name); assert.equal(p.type, flower.type);
    assert.deepEqual(p.costs, [4, 8, 14]);
    assert.deepEqual(p.stages.map(s => s.name), ['First shoots', 'Young flowers', 'Full bloom']);
  });
  assert.deepEqual(flowers.map(f => f.unlockLevel), [1, 3, 6, 9, 12, 18]);
});
test('Only an absent garden receives starter seeds; serialization cannot refill a spent balance', () => {
  const fresh = Garden.normalize();
  assert.equal(fresh.version, 1); assert.equal(fresh.seeds, 4); assert.equal(fresh.starterSeeds, 4);
  assert.equal(fresh.totalSeedsEarned, 0); assert.equal(Garden.summary(fresh).totalStages, 0);
  const planted = Garden.plant(fresh, 'moon').state;
  assert.equal(planted.seeds, 0); assert.equal(planted.levels.moon, 1);
  assert.deepEqual(Garden.normalize(JSON.parse(JSON.stringify(planted))), planted);
  [null, {}, [], false, 'corrupt', { seeds: 0 }].forEach(raw => assert.equal(Garden.normalize(raw).seeds, 0));
});
test('Malformed fields normalize to bounded safe values, ignoring inherited and unknown properties', () => {
  const raw = { seeds: Infinity, selectedId: '__proto__', levels: { sunbell: -4, coral: NaN, lilac: 2.9, honey: 100 },
    campaignBest: { 1: 30, 2: -1, 19: 3 }, receipts: ['a', null, ' ', 'a', 'b'], totalSeedsSpent: -5 };
  const state = Garden.normalize(raw);
  assert.equal(state.seeds, 0); assert.equal(state.selectedId, 'sunbell');
  assert.deepEqual(state.levels, { sunbell: 0, coral: 0, lilac: 2, honey: 3, moon: 0, dawn: 0 });
  assert.deepEqual(state.campaignBest, { 1: 3 }); assert.deepEqual(state.receipts, ['a', 'b']);
  assert.equal(Garden.normalize({ seeds: 1e99 }).seeds, 1000000);
  const inherited = Garden.normalize(Object.create({ seeds: 600, selectedId: 'moon', levels: { moon: 3 } }));
  assert.equal(inherited.seeds, 0); assert.equal(inherited.levels.moon, 0);
  const polluted = JSON.parse('{"levels":{"__proto__":{"polluted":true}},"campaignBest":{"constructor":3}}');
  assert.equal(Garden.normalize(polluted).levels.sunbell, 0); assert.equal({}.polluted, undefined);
});
test('All six beds are immediately selectable and the first shoots cost exactly four seeds', () => {
  Garden.plots.forEach(p => {
    const chosen = Garden.select(Garden.normalize(), p.id);
    assert.equal(chosen.selectedId, p.id);
    const planted = Garden.plant(chosen, p.id);
    assert.equal(planted.success, true); assert.equal(planted.cost, 4); assert.equal(planted.stage, 1);
    assert.equal(planted.state.seeds, 0); assert.equal(planted.state.levels[p.id], 1);
    assert.equal(planted.state.totalSeedsSpent, 4);
  });
});
test('Purchases are atomic, immutable, and fail without any partial progress', () => {
  const source = freeze(Garden.normalize()); const before = JSON.stringify(source);
  const first = Garden.plant(source, 'lilac');
  assert.equal(JSON.stringify(source), before); assert.notEqual(first.state.levels, source.levels);
  const blocked = Garden.plant(freeze(first.state), 'lilac');
  assert.equal(blocked.success, false); assert.equal(blocked.reason, 'insufficient-seeds');
  assert.equal(blocked.cost, 8); assert.deepEqual(blocked.state, first.state);
  assert.equal(Garden.plant(source, '__proto__').reason, 'unknown-plot');
  assert.deepEqual(Garden.select(source, 'missing'), source);
});
test('Each bed reaches full bloom after exactly 26 seeds and cannot be over-upgraded', () => {
  let state = Garden.normalize({ seeds: 156 });
  for (const p of Garden.plots) {
    for (const [index, cost] of [4, 8, 14].entries()) {
      const result = Garden.plant(state, p.id);
      assert(result.success); assert.equal(result.cost, cost); assert.equal(result.stage, index + 1); state = result.state;
    }
    const complete = Garden.plant(state, p.id);
    assert.equal(complete.reason, 'complete'); assert.deepEqual(complete.state, state);
  }
  assert.equal(state.seeds, 0); assert.equal(state.totalSeedsSpent, 156);
  const summary = Garden.summary(state);
  assert.equal(summary.totalStages, 18); assert.equal(summary.completedPlots, 6);
  assert(summary.plots.every(p => p.nextCost === null && !p.canPlant));
});
test('A decent Rush run awards eight seeds; weak positive runs still award one', () => {
  const state = Garden.plant(Garden.normalize(), 'sunbell').state;
  const decent = Garden.grant(state, rush('decent', 24, 3));
  assert.equal(decent.awarded, 8); assert.equal(decent.seeds, 8); assert.equal(decent.state.seeds, 8);
  assert.equal(Garden.plant(decent.state, 'sunbell').stage, 2);
  for (let blooms = 1; blooms <= 3; blooms++) assert.equal(Garden.grant(state, rush('weak-' + blooms, blooms, 1)).awarded, 1);
  assert.equal(Garden.grant(state, rush('empty', 0, 1)).awarded, 0);
  assert.equal(Garden.grant(state, rush('wave-credit', 0, 3)).awarded, 2);
});
test('Rush reward formula is deterministic over small runs and caps at forty seeds', () => {
  for (let blooms = 0; blooms <= 180; blooms++) for (let wave = 1; wave <= 12; wave++) {
    const expected = Math.min(40, Math.max(blooms > 0 ? 1 : 0, Math.floor(blooms / 4) + wave - 1));
    assert.equal(Garden.grant({ seeds: 0 }, rush('r', blooms, wave)).awarded, expected);
  }
});
test('Incomplete, missing-ID, malformed, and unknown-mode results cannot award or consume receipts', () => {
  const source = freeze(Garden.normalize());
  const bad = [null, {}, rush('r', 30, 3, { completed: false }), rush(''), rush('a'.repeat(161)),
    rush('r', -1), rush('r', 1.5), rush('r', 24, 0), rush('r', NaN), rush('r', 24, Infinity),
    rush('r', 24, 3, { mode: 'purchase' }), campaign('c', 0), campaign('c', 19), campaign('c', 1, 0), campaign('c', 1, 4)];
  for (const reward of bad) {
    const result = Garden.grant(source, reward);
    assert.equal(result.awarded, 0); assert.deepEqual(result.state, source);
  }
  const early = Garden.grant(source, rush('same', 24, 3, { completed: false }));
  assert.equal(Garden.grant(early.state, rush('same')).awarded, 8);
});
test('Duplicate completion IDs are idempotent across modes and edited reward payloads', () => {
  const first = Garden.grant(Garden.normalize(), rush('same'));
  for (const reward of [rush('same', 10000, 100), campaign('same', 2, 3)]) {
    const result = Garden.grant(first.state, reward);
    assert.equal(result.awarded, 0); assert.equal(result.duplicate, true); assert.equal(result.reason, 'duplicate');
    assert.deepEqual(result.state, first.state);
  }
  const empty = Garden.grant(Garden.normalize(), rush('empty', 0, 1));
  assert.equal(Garden.grant(empty.state, rush('empty', 30, 3)).awarded, 0);
});
test('Receipt history keeps the latest sixty-four unique completions', () => {
  let state = Garden.normalize();
  for (let i = 0; i < 100; i++) state = Garden.grant(state, rush('run-' + i, 1, 1)).state;
  assert.equal(state.seeds, 104); assert.equal(state.receipts.length, 64);
  assert.equal(state.receipts[0], 'run-36'); assert.equal(state.receipts[63], 'run-99');
  assert.equal(Garden.grant(state, rush('run-36')).duplicate, true);
});
test('Campaign first clears award eight plus star quality, then only two seeds per improved star', () => {
  let result = Garden.grant(Garden.normalize(), campaign('c1', 1, 1));
  assert.equal(result.awarded, 8);
  result = Garden.grant(result.state, campaign('c2', 1, 1)); assert.equal(result.awarded, 0);
  result = Garden.grant(result.state, campaign('c3', 1, 3)); assert.equal(result.awarded, 4);
  result = Garden.grant(result.state, campaign('c4', 1, 2)); assert.equal(result.awarded, 0);
  assert.equal(result.state.campaignBest[1], 3);
  const threeStarFirst = Garden.grant(result.state, campaign('level2', 2, 3));
  assert.equal(threeStarFirst.awarded, 12);
  assert.equal(Garden.grant(Garden.normalize(), campaign('two-star-first', 3, 2)).awarded, 10);
});
test('Immediate three stars and improvement from one to three earn equal lifetime seeds', () => {
  const fresh = Garden.normalize();
  const immediate = Garden.grant(fresh, campaign('immediate', 1, 3));
  const first = Garden.grant(fresh, campaign('first', 1, 1));
  const improved = Garden.grant(first.state, campaign('improved', 1, 3, { previousStars: 1 }));
  assert.equal(immediate.awarded, 12); assert.equal(first.awarded + improved.awarded, 12);
  assert.equal(immediate.state.seeds, improved.state.seeds);
  assert.equal(immediate.state.totalSeedsEarned, improved.state.totalSeedsEarned);
  const second = Garden.grant(first.state, campaign('second', 1, 2, { previousStars: 1 }));
  const third = Garden.grant(second.state, campaign('third', 1, 3, { previousStars: 2 }));
  assert.equal(third.state.seeds, immediate.state.seeds);
  assert.equal(third.state.totalSeedsEarned, immediate.state.totalSeedsEarned);
});
test('Existing campaign stars form the reward baseline without resetting unrelated progress', () => {
  const savedProgress = freeze({ 1: { best: 2400, stars: 2, attempts: 5 } });
  const reward = campaign('legacy', 1, 3, { previousStars: savedProgress[1].stars });
  const result = Garden.grant(Garden.normalize(), reward);
  assert.equal(result.awarded, 2); assert.equal(result.state.campaignBest[1], 3);
  assert.deepEqual(savedProgress, { 1: { best: 2400, stars: 2, attempts: 5 } });
  assert.equal(Garden.grant(Garden.normalize(), campaign('legacy-replay', 1, 2, { previousStars: 2 })).awarded, 0);
});
test('Campaign replay resistance remains after its run receipt has aged out', () => {
  let state = Garden.grant(Garden.normalize(), campaign('old', 1, 3)).state;
  for (let i = 0; i < 70; i++) state = Garden.grant(state, rush('later-' + i, 1, 1)).state;
  assert(!state.receipts.includes('old'));
  assert.equal(Garden.grant(state, campaign('old', 1, 3)).awarded, 0);
});
test('Grant, select, normalize, and summary never mutate caller-owned state or reward objects', () => {
  const source = freeze(Garden.normalize()); const reward = freeze(rush('immutable'));
  const before = JSON.stringify(source); const rewardBefore = JSON.stringify(reward);
  const grant = Garden.grant(source, reward); const selected = Garden.select(source, 'dawn');
  const normalized = Garden.normalize(source); const summary = Garden.summary(source);
  assert.equal(JSON.stringify(source), before); assert.equal(JSON.stringify(reward), rewardBefore);
  grant.state.receipts.push('later'); selected.levels.dawn = 3; normalized.levels.sunbell = 2; summary.plots[0].stage = 3;
  assert.equal(JSON.stringify(source), before); assert.equal(Garden.plots[0].stages[0].name, 'First shoots');
});
test('Summary provides affordable next actions and selection without side effects', () => {
  const state = Garden.select(Garden.normalize(), 'honey');
  const summary = Garden.summary(state);
  assert.equal(summary.selectedId, 'honey'); assert.equal(summary.nextCost, 4);
  assert.equal(summary.seeds, 4); assert.equal(summary.totalStages, 0); assert.equal(summary.completedPlots, 0);
  assert(summary.plots.every(p => p.canPlant && p.nextCost === 4 && p.stage === 0));
  assert.equal(summary.plots.filter(p => p.selected).length, 1);
});
test('Balance saturation never wraps and reports only seeds actually added', () => {
  const result = Garden.grant({ seeds: 999999 }, rush('near-limit', 500, 100));
  assert.equal(result.awarded, 1); assert.equal(result.state.seeds, 1000000); assert.equal(result.state.totalSeedsEarned, 1);
  const full = Garden.grant(result.state, rush('full', 500, 100));
  assert.equal(full.awarded, 0); assert.equal(full.reason, 'balance-full');
  assert.equal(full.state.seeds, 1000000); assert(full.state.receipts.includes('full'));
});
test('Moon rewards stay separate from Meadow records and survive normalization and receipt aging', () => {
  const reward = (runId, stars, extra = {}) => ({ runId, mode: 'moon', completed: true, levelId: 'moon-1', stars, ...extra });
  let state = Garden.grant(Garden.normalize(), campaign('meadow-first', 1, 3)).state;
  let result = Garden.grant(state, reward('moon-first', 1)); assert.equal(result.awarded, 8);
  result = Garden.grant(result.state, reward('moon-improved', 3)); assert.equal(result.awarded, 4);
  state = Garden.normalize(JSON.parse(JSON.stringify(result.state)));
  assert.equal(state.campaignBest[1], 3); assert.equal(state.moonBest['moon-1'], 3);
  for (let i = 0; i < 70; i++) state = Garden.grant(state, rush('moon-later-' + i, 0, 1)).state;
  assert.equal(Garden.grant(state, reward('moon-first', 3)).awarded, 0);
  assert.equal(Garden.grant(state, reward('bad-id', 3, { levelId: 'moon-7' })).reason, 'invalid-reward');
  assert.equal(Garden.grant(state, reward('wrong-type', 3, { levelId: 1 })).reason, 'invalid-reward');
  assert.equal(Garden.grant(Garden.normalize(), reward('legacy-moon', 3, { previousStars: 2 })).awarded, 2);
});
test('Koi pool rewards pay once per new star and keep their own records', () => {
  const reward = (runId, stars, extra = {}) => ({ runId, mode: 'koi', completed: true, levelId: 'koi-3', stars, ...extra });
  let result = Garden.grant(Garden.normalize(), reward('koi-first', 2)); assert.equal(result.awarded, 10);
  result = Garden.grant(result.state, reward('koi-same', 2)); assert.equal(result.awarded, 0);
  result = Garden.grant(result.state, reward('koi-better', 3)); assert.equal(result.awarded, 2);
  const state = Garden.normalize(JSON.parse(JSON.stringify(result.state)));
  assert.equal(state.koiBest['koi-3'], 3); assert.deepEqual(state.moonBest, {});
  assert.equal(Garden.grant(state, reward('koi-bad', 3, { levelId: 'koi-9' })).reason, 'invalid-reward');
  assert.equal(Garden.grant(state, reward('koi-moon-id', 3, { levelId: 'moon-1' })).reason, 'invalid-reward');
  assert.deepEqual(Garden.normalize({ koiBest: { 'koi-1': 9, 'koi-2': -1, 'koi-12': 3 } }).koiBest, { 'koi-1': 3 });
});
const daily = (runId, date, stars, extra = {}) => ({ runId, mode: 'daily', completed: true, levelId: 'daily-' + date, stars, ...extra });
test('A daily garden pays 6, 8 or 10 seeds on its first clear, then two per new star, once per day', () => {
  for (const [stars, seeds] of [[1, 6], [2, 8], [3, 10]]) assert.equal(Garden.grant(Garden.normalize(), daily('d' + stars, '2026-10-03', stars)).awarded, seeds);
  let result = Garden.grant(Garden.normalize(), daily('first', '2026-10-03', 1)); assert.equal(result.awarded, 6);
  result = Garden.grant(result.state, daily('again', '2026-10-03', 1)); assert.equal(result.awarded, 0); assert.equal(result.reason, 'no-new-reward');
  result = Garden.grant(result.state, daily('better', '2026-10-03', 3)); assert.equal(result.awarded, 4);
  assert.equal(Garden.grant(result.state, daily('better', '2026-10-03', 3)).duplicate, true);
  // A day already cleared before this update (the app passes its saved stars) pays only for new stars.
  assert.equal(Garden.grant(Garden.normalize(), daily('upgrade', '2026-10-02', 2, { previousStars: 2 })).awarded, 0);
  assert.equal(Garden.grant(Garden.normalize(), daily('upgrade2', '2026-10-02', 3, { previousStars: 2 })).awarded, 2);
  result = Garden.grant(result.state, daily('next-day', '2026-10-04', 2)); assert.equal(result.awarded, 8);
  assert.deepEqual(Garden.normalize(JSON.parse(JSON.stringify(result.state))).dailyBest, { 'daily-2026-10-03': 3, 'daily-2026-10-04': 2 });
  for (const bad of ['2026-02-30', '2026-13-01', '26-10-03', '2026-10-3']) assert.equal(Garden.grant(Garden.normalize(), daily('bad' + bad, bad, 2)).reason, 'invalid-reward');
  assert.equal(Garden.grant(Garden.normalize(), daily('no-stars', '2026-10-03', 0)).reason, 'invalid-reward');
  assert.equal(Garden.grant(Garden.normalize(), { ...daily('incomplete', '2026-10-03', 2), completed: false }).awarded, 0);
});
test('Any four cleared daily gardens in one Monday-to-Sunday week gather a 12-seed bouquet, once, and missed days take nothing away', () => {
  let state = Garden.normalize(), result;
  // Monday 28 Sep, Wednesday 30 Sep and Saturday 3 Oct 2026: gaps do not matter.
  for (const date of ['2026-09-28', '2026-09-30', '2026-10-03']) { result = Garden.grant(state, daily(date, date, 1)); state = result.state; assert.equal(result.bouquet, null); }
  let week = Garden.week(state, 'daily-2026-10-03');
  assert.equal(week.id, 'week-2026-09-28'); assert.equal(week.cleared, 3); assert.equal(week.goal, 4); assert.equal(week.claimed, false);
  assert.deepEqual(week.days.map(d => d.stars), [1, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual(week.days.map(d => d.today), [false, false, false, false, false, true, false]);
  assert.deepEqual(week.days.map(d => d.future), [false, false, false, false, false, false, true]);
  // A day in the following week counts toward that week, not this one.
  result = Garden.grant(state, daily('mon-next', '2026-10-05', 1)); assert.equal(result.bouquet, null); assert.equal(result.awarded, 6);
  result = Garden.grant(state, daily('sunday', '2026-10-04', 2));
  assert.deepEqual(result.bouquet, { week: 'week-2026-09-28', seeds: 12 }); assert.equal(result.awarded, 8 + 12);
  state = result.state; assert.deepEqual(state.bouquets, ['week-2026-09-28']); assert.equal(Garden.week(state, 'daily-2026-09-29').claimed, true);
  // A fifth clear or a better score in the same week never pays the bouquet twice.
  result = Garden.grant(state, daily('tuesday', '2026-09-29', 1)); assert.equal(result.bouquet, null); assert.equal(result.awarded, 6);
  result = Garden.grant(result.state, daily('sunday-3', '2026-10-04', 3)); assert.equal(result.bouquet, null); assert.equal(result.awarded, 2);
  assert.equal(Garden.week(Garden.normalize(), 'nope'), null);
});
test('Daily records keep the latest 21 days and 8 bouquets, reject malformed entries, and old days cannot be claimed again', () => {
  const dailyBest = {}; for (let d = 1; d <= 30; d++) dailyBest[`daily-2026-08-${String(d).padStart(2, '0')}`] = 2;
  Object.assign(dailyBest, { 'daily-2026-02-30': 3, 'daily-2026-09-01': 0, 'daily-2026-09-02': 7, 'nope': 2 });
  const state = Garden.normalize({ dailyBest, bouquets: ['week-2026-08-03', 'week-2026-08-04', 'week-2026-08-03', 'weekly', 4, 'week-2026-02-30'] });
  const kept = Object.keys(state.dailyBest);
  assert.equal(kept.length, 21); assert.equal(kept.sort()[0], 'daily-2026-08-10'); assert.equal(state.dailyBest['daily-2026-09-02'], undefined);
  assert.deepEqual(state.bouquets, ['week-2026-08-03']);
  assert.equal(Garden.grant(state, daily('rewind', '2026-08-02', 3)).reason, 'expired');
  // A remembered day can still improve; its full week (24 to 30 Aug) also gathers its unclaimed bouquet.
  const recent = Garden.grant(state, daily('recent', '2026-08-30', 3));
  assert.equal(recent.awarded, 2 + 12); assert.deepEqual(recent.bouquet, { week: 'week-2026-08-24', seeds: 12 });
  const weeks = Array.from({ length: 12 }, (_, i) => 'week-' + new Date(Date.UTC(2026, 5, 1 + i * 7)).toISOString().slice(0, 10));
  assert.deepEqual(Garden.normalize({ bouquets: weeks }).bouquets, weeks.slice(-8));
});
const report = {
  passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
  observations: { starterSeeds: 4, costsPerPlot: [4, 8, 14], completeMeadowCost: 156,
    decentRush: { blooms: 24, wave: 3, awarded: 8 }, weakPositiveRushMinimum: 1, rushRewardCap: 40,
    firstCampaignClearByStars: { 1: 8, 2: 10, 3: 12 }, improvedCampaignStar: 2, receiptWindow: 64,
    firstDailyClearByStars: { 1: 6, 2: 8, 3: 10 }, weeklyBouquet: { dailyClears: 4, seeds: 12 }, dailyMemoryDays: 21,
    limitations: ['Local save logic is not a server-authoritative payment or anti-tampering system.',
      'Rush receipt deduplication covers the most recent 64 completions; the UI must issue one unique ID per run.',
      'The caller must persist the initial garden and each successful state transition.',
      'This suite verifies domain behavior; browser rendering and storage integration need separate checks.'] },
  results
};
fs.writeFileSync(path.join(__dirname, 'garden-test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
