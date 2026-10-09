(function (root, factory) {
  'use strict';
  var garden = factory();
  if (typeof module === 'object' && module.exports) module.exports = garden;
  else root.BloomGarden = garden;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // A local, earned-only garden. Collection unlocks and game difficulty live elsewhere.
  var COSTS = Object.freeze([4, 8, 14]);
  var MAX_SEEDS = 1000000;
  var MAX_TOTAL = 1000000000;
  var RECEIPT_LIMIT = 64;
  // The daily garden pays once per new star, like any garden. Clearing any four daily gardens in one
  // Monday-to-Sunday week also gathers that week's bouquet. Missed days never take anything away.
  var DAILY_LIMIT = 21, BOUQUET_GOAL = 4, BOUQUET_SEEDS = 12, BOUQUET_LIMIT = 8;
  var DAY = 86400000;
  var STAGES = Object.freeze([
    Object.freeze({ stage: 1, name: 'First shoots', cost: COSTS[0] }),
    Object.freeze({ stage: 2, name: 'Young flowers', cost: COSTS[1] }),
    Object.freeze({ stage: 3, name: 'Full bloom', cost: COSTS[2] })
  ]);
  function plot(id, name, flowerId, type, color, description) {
    return Object.freeze({ id: id, name: name, flowerId: flowerId, type: type,
      color: color, description: description, costs: COSTS, stages: STAGES });
  }
  var plots = Object.freeze([
    plot('sunbell', 'Sunbell', 'sunbell', 'gold', '#F7C975', 'Golden bells catch the first light.'),
    plot('coral', 'Coral Cup', 'coral-cup', 'coral', '#F38F8D', 'Soft coral petals warm a little corner of the meadow.'),
    plot('lilac', 'Lilac Star', 'lilac-star', 'lilac', '#B8A0DC', 'A constellation of lilac flowers takes root.'),
    plot('honey', 'Honeyburst', 'honeyburst', 'gold', '#EAAF58', 'Honey-colored crowns gather the afternoon sun.'),
    plot('moon', 'Moon Poppy', 'moon-poppy', 'lilac', '#C5B6EB', 'Pale poppies bring a little moonlight to the meadow.'),
    plot('dawn', 'Dawn Crown', 'dawn-crown', 'coral', '#F19B90', 'Bright coral crowns greet a new day.')
  ]);
  // Decorations give seeds somewhere to go once the beds are growing. Bought with earned seeds only, once each,
  // in any order; costs rise so there is always a next thing to save for.
  function piece(id, name, cost, description) {
    return Object.freeze({ id: id, name: name, cost: cost, description: description });
  }
  var decor = Object.freeze([
    piece('bench', 'Garden bench', 20, 'A spot to sit and admire your work.'),
    piece('birdhouse', 'Birdhouse', 30, 'A bluebird moves in right away.'),
    piece('lilies', 'Water lilies', 40, 'Lilies for the pond, and a frog to go with them.'),
    piece('beehive', 'Beehive', 55, 'Busy bees for your Honeyburst.'),
    piece('lanterns', 'Lantern path', 75, 'Warm little lights along the path.'),
    piece('tree', 'Apple tree', 100, 'Shade, apples and a rope swing.')
  ]);
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function integer(value, maximum) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.floor(value))) : 0;
  }
  function validPlot(id) { return typeof id === 'string' && plots.some(function (p) { return p.id === id; }); }
  function findDecor(id) { return typeof id === 'string' ? decor.filter(function (d) { return d.id === id; })[0] || null : null; }
  // 'daily-YYYY-MM-DD' to a UTC day number, or null for anything that is not a real calendar date.
  function dailyDay(id) {
    var match = typeof id === 'string' && /^daily-(\d{4})-(\d{2})-(\d{2})$/.exec(id);
    if (!match) return null;
    var y = Number(match[1]), m = Number(match[2]) - 1, d = Number(match[3]), time = Date.UTC(y, m, d), date = new Date(time);
    return date.getUTCFullYear() === y && date.getUTCMonth() === m && date.getUTCDate() === d ? time / DAY : null;
  }
  function dailyId(day) { return 'daily-' + new Date(day * DAY).toISOString().slice(0, 10); }
  function weekStart(day) { return day - (new Date(day * DAY).getUTCDay() + 6) % 7; }
  function weekId(day) { return 'week-' + new Date(weekStart(day) * DAY).toISOString().slice(0, 10); }
  function validWeek(id) {
    var day = typeof id === 'string' && id.slice(0, 5) === 'week-' ? dailyDay('daily-' + id.slice(5)) : null;
    return day !== null && weekStart(day) === day;
  }
  function receiptId(value) {
    return typeof value === 'string' && value.length <= 160 && value.trim().length > 0 ? value.trim() : null;
  }
  function normalize(raw) {
    // Only an absent field receives starter seeds. An existing zero balance stays zero.
    var isNew = raw === undefined;
    var source = record(raw) ? raw : {};
    var levels = {};
    var savedLevels = own(source, 'levels') && record(source.levels) ? source.levels : {};
    plots.forEach(function (p) { levels[p.id] = own(savedLevels, p.id) ? integer(savedLevels[p.id], 3) : 0; });
    var receipts = [];
    if (own(source, 'receipts') && Array.isArray(source.receipts)) {
      // Walk backward so the most recent occurrence wins; storage never grows with run count.
      for (var i = source.receipts.length - 1; i >= 0 && receipts.length < RECEIPT_LIMIT; i--) {
        var id = receiptId(source.receipts[i]);
        if (id && receipts.indexOf(id) < 0) receipts.push(id);
      }
      receipts.reverse();
    }
    var campaignBest = {};
    var savedBest = own(source, 'campaignBest') && record(source.campaignBest) ? source.campaignBest : {};
    for (var level = 1; level <= 18; level++) {
      var best = own(savedBest, level) ? integer(savedBest[level], 3) : 0;
      if (best) campaignBest[level] = best;
    }
    var moonBest = {};
    var savedMoon = own(source, 'moonBest') && record(source.moonBest) ? source.moonBest : {};
    for (var trial = 1; trial <= 6; trial++) {
      var moonId = 'moon-' + trial;
      var moonStars = own(savedMoon, moonId) ? integer(savedMoon[moonId], 3) : 0;
      if (moonStars) moonBest[moonId] = moonStars;
    }
    var koiBest = {};
    var savedKoi = own(source, 'koiBest') && record(source.koiBest) ? source.koiBest : {};
    for (var pool = 1; pool <= 8; pool++) {
      var koiId = 'koi-' + pool;
      var koiStars = own(savedKoi, koiId) ? integer(savedKoi[koiId], 3) : 0;
      if (koiStars) koiBest[koiId] = koiStars;
    }
    var dailyBest = {};
    var savedDaily = own(source, 'dailyBest') && record(source.dailyBest) ? source.dailyBest : {};
    Object.keys(savedDaily).filter(function (id) {
      var stars = savedDaily[id];
      return dailyDay(id) !== null && Number.isInteger(stars) && stars >= 1 && stars <= 3;
    }).sort().slice(-DAILY_LIMIT).forEach(function (id) { dailyBest[id] = savedDaily[id]; });
    var bouquets = [];
    if (own(source, 'bouquets') && Array.isArray(source.bouquets)) source.bouquets.forEach(function (id) {
      if (validWeek(id) && bouquets.indexOf(id) < 0) bouquets.push(id);
    });
    bouquets = bouquets.sort().slice(-BOUQUET_LIMIT);
    var savedDecor = own(source, 'decor') && Array.isArray(source.decor) ? source.decor : [];
    var built = decor.filter(function (d) { return savedDecor.indexOf(d.id) >= 0; }).map(function (d) { return d.id; });
    return { version: 1,
      seeds: isNew ? 4 : (own(source, 'seeds') ? integer(source.seeds, MAX_SEEDS) : 0),
      selectedId: own(source, 'selectedId') && validPlot(source.selectedId) ? source.selectedId : 'sunbell',
      levels: levels, receipts: receipts, campaignBest: campaignBest, moonBest: moonBest, koiBest: koiBest,
      dailyBest: dailyBest, bouquets: bouquets, decor: built,
      starterSeeds: isNew ? 4 : (own(source, 'starterSeeds') ? integer(source.starterSeeds, 4) : 0),
      totalSeedsEarned: own(source, 'totalSeedsEarned') ? integer(source.totalSeedsEarned, MAX_TOTAL) : 0,
      totalSeedsSpent: own(source, 'totalSeedsSpent') ? integer(source.totalSeedsSpent, MAX_TOTAL) : 0 };
  }
  function grant(state, reward) {
    var next = normalize(state);
    var bouquet = null;
    function result(amount, reason, duplicate) {
      return { state: next, awarded: amount, seeds: amount, reason: reason, duplicate: !!duplicate, bouquet: bouquet };
    }
    if (!record(reward)) return result(0, 'invalid-reward');
    if (reward.completed !== true) return result(0, 'incomplete');
    var runId = receiptId(reward.runId);
    if (!runId) return result(0, 'invalid-run-id');
    if (next.receipts.indexOf(runId) >= 0) return result(0, 'duplicate', true);
    var earned = 0;
    if (reward.mode === 'rush') {
      if (!Number.isInteger(reward.blooms) || reward.blooms < 0 || !Number.isInteger(reward.wave) || reward.wave < 1) {
        return result(0, 'invalid-reward');
      }
      earned = Math.min(40, Math.floor(reward.blooms / 4) + Math.max(0, reward.wave - 1));
      if (reward.blooms > 0) earned = Math.max(1, earned);
    } else if (reward.mode === 'campaign' || reward.mode === 'moon' || reward.mode === 'koi') {
      var chapter = { moon: /^moon-[1-6]$/, koi: /^koi-[1-8]$/ }[reward.mode];
      var validLevel = chapter ? typeof reward.levelId === 'string' && chapter.test(reward.levelId) : Number.isInteger(reward.levelId) && reward.levelId >= 1 && reward.levelId <= 18;
      if (!validLevel || !Number.isInteger(reward.stars) || reward.stars < 1 || reward.stars > 3) return result(0, 'invalid-reward');
      var bests = reward.mode === 'moon' ? next.moonBest : reward.mode === 'koi' ? next.koiBest : next.campaignBest;
      // The caller supplies pre-run progress on the first award after upgrading an older save.
      var previous = Math.max(bests[reward.levelId] || 0, integer(reward.previousStars, 3));
      // Pay the same lifetime reward whether a player earns stars now or improves later.
      earned = previous === 0 ? 8 + (reward.stars - 1) * 2 : Math.max(0, reward.stars - previous) * 2;
      bests[reward.levelId] = Math.max(previous, reward.stars);
    } else if (reward.mode === 'daily') {
      var day = dailyDay(reward.levelId), kept = Object.keys(next.dailyBest).sort();
      if (day === null || !Number.isInteger(reward.stars) || reward.stars < 1 || reward.stars > 3) return result(0, 'invalid-reward');
      // Only recent days are remembered, so a garden older than all of them cannot be claimed again.
      if (kept.length >= DAILY_LIMIT && reward.levelId < kept[0]) return result(0, 'expired');
      var before = Math.max(next.dailyBest[reward.levelId] || 0, integer(reward.previousStars, 3));
      earned = before === 0 ? 6 + (reward.stars - 1) * 2 : Math.max(0, reward.stars - before) * 2;
      next.dailyBest[reward.levelId] = Math.max(before, reward.stars);
      Object.keys(next.dailyBest).sort().slice(0, -DAILY_LIMIT).forEach(function (id) { delete next.dailyBest[id]; });
      var thisWeek = week(next, reward.levelId);
      if (!thisWeek.claimed && thisWeek.cleared >= BOUQUET_GOAL) {
        next.bouquets = next.bouquets.concat(thisWeek.id).sort().slice(-BOUQUET_LIMIT);
        bouquet = { week: thisWeek.id, seeds: BOUQUET_SEEDS };
        earned += BOUQUET_SEEDS;
      }
    } else return result(0, 'invalid-mode');
    // Record even valid zero-seed results: the same completion cannot later be edited and claimed.
    next.receipts.push(runId);
    next.receipts = next.receipts.slice(-RECEIPT_LIMIT);
    var added = Math.min(earned, MAX_SEEDS - next.seeds);
    next.seeds += added;
    next.totalSeedsEarned = Math.min(MAX_TOTAL, next.totalSeedsEarned + added);
    return result(added, added ? 'awarded' : (earned ? 'balance-full' : 'no-new-reward'));
  }
  // The Monday-to-Sunday week around a daily garden: which days were cleared and whether its bouquet is gathered.
  function week(state, levelId) {
    var current = normalize(state), day = dailyDay(levelId);
    if (day === null) return null;
    var start = weekStart(day), days = [];
    for (var i = 0; i < 7; i++) {
      var id = dailyId(start + i);
      days.push({ id: id, stars: current.dailyBest[id] || 0, today: start + i === day, future: start + i > day });
    }
    var cleared = days.filter(function (d) { return d.stars > 0; }).length, id = weekId(day);
    return { id: id, days: days, cleared: cleared, goal: BOUQUET_GOAL, seeds: BOUQUET_SEEDS,
      claimed: current.bouquets.indexOf(id) >= 0 };
  }
  function plant(state, plotId) {
    var next = normalize(state);
    function result(success, reason, cost, stage) {
      return { state: next, success: success, reason: reason, cost: cost, stage: stage };
    }
    if (!validPlot(plotId)) return result(false, 'unknown-plot', 0, null);
    var current = next.levels[plotId];
    if (current >= 3) return result(false, 'complete', 0, current);
    var cost = COSTS[current];
    if (next.seeds < cost) return result(false, 'insufficient-seeds', cost, current);
    next.seeds -= cost;
    next.levels[plotId] = current + 1;
    next.selectedId = plotId;
    next.totalSeedsSpent = Math.min(MAX_TOTAL, next.totalSeedsSpent + cost);
    return result(true, 'planted', cost, current + 1);
  }
  function build(state, decorId) {
    var next = normalize(state), item = findDecor(decorId);
    function result(success, reason, cost) { return { state: next, success: success, reason: reason, cost: cost }; }
    if (!item) return result(false, 'unknown-decor', 0);
    if (next.decor.indexOf(item.id) >= 0) return result(false, 'built', item.cost);
    if (next.seeds < item.cost) return result(false, 'insufficient-seeds', item.cost);
    next.seeds -= item.cost;
    next.decor = decor.filter(function (d) { return d.id === item.id || next.decor.indexOf(d.id) >= 0; }).map(function (d) { return d.id; });
    next.totalSeedsSpent = Math.min(MAX_TOTAL, next.totalSeedsSpent + item.cost);
    return result(true, 'built', item.cost);
  }
  function select(state, plotId) {
    var next = normalize(state);
    if (validPlot(plotId)) next.selectedId = plotId;
    return next;
  }
  function summary(state) {
    var current = normalize(state);
    var totalStages = 0;
    var completedPlots = 0;
    var beds = plots.map(function (p) {
      var stage = current.levels[p.id];
      var cost = stage < 3 ? COSTS[stage] : null;
      totalStages += stage;
      if (stage === 3) completedPlots++;
      return { id: p.id, name: p.name, flowerId: p.flowerId, type: p.type, color: p.color,
        description: p.description, costs: p.costs, stages: p.stages,
        stage: stage, stageName: stage ? STAGES[stage - 1].name : 'Waiting to grow',
        nextCost: cost, canPlant: cost !== null && current.seeds >= cost,
        selected: current.selectedId === p.id };
    });
    var pieces = decor.map(function (d) {
      var done = current.decor.indexOf(d.id) >= 0;
      return { id: d.id, name: d.name, cost: d.cost, description: d.description, built: done, canBuild: !done && current.seeds >= d.cost };
    });
    var builtDecor = current.decor.length;
    return { seeds: current.seeds, selectedId: current.selectedId,
      totalStages: totalStages, completedPlots: completedPlots, totalPlots: plots.length,
      decor: pieces, builtDecor: builtDecor, totalDecor: decor.length,
      complete: completedPlots === plots.length && builtDecor === decor.length,
      totalSeedsEarned: current.totalSeedsEarned, totalSeedsSpent: current.totalSeedsSpent,
      nextCost: current.levels[current.selectedId] < 3 ? COSTS[current.levels[current.selectedId]] : null,
      plots: beds };
  }
  return Object.freeze({ plots: plots, decor: decor, normalize: normalize, grant: grant, plant: plant, build: build, select: select, summary: summary, week: week,
    daily: Object.freeze({ firstClear: [6, 8, 10], perStar: 2, bouquetGoal: BOUQUET_GOAL, bouquetSeeds: BOUQUET_SEEDS }) });
});
