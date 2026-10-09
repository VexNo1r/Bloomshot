(function (root, factory) {
  'use strict';
  var goals = factory();
  if (typeof module === 'object' && module.exports) module.exports = goals;
  else root.BloomGoals = goals;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Three small goals a day: one in Rush, one puzzle, one somewhere else. Each pays seeds once, and all three
  // pay a bonus. A missed day costs nothing, nothing counts down, and tomorrow simply brings three new goals.
  function goal(id, group, text, target, play) {
    return Object.freeze({ id: id, group: group, text: text, target: target, play: play });
  }
  var catalog = Object.freeze([
    goal('rush-blooms', 'rush', 'Bloom 50 flowers in Rush', 50, 'rush'),
    goal('rush-wave', 'rush', 'Reach wave 4 in Rush', 4, 'rush'),
    goal('rush-chain', 'rush', 'Make an 8 chain in Rush', 8, 'rush'),
    goal('puzzles', 'puzzle', 'Clear 2 puzzles', 2, 'puzzles'),
    goal('perfect', 'puzzle', 'Get ★★★ on a puzzle', 1, 'puzzles'),
    goal('daily', 'puzzle', "Clear today's garden", 1, 'daily'),
    goal('moon', 'explore', 'Clear a Moon trial', 1, 'moon'),
    goal('koi', 'explore', 'Clear a Koi pool', 1, 'koi'),
    goal('meadow', 'explore', 'Grow or build in your meadow', 1, 'meadow')
  ]);
  var GROUPS = ['rush', 'puzzle', 'explore'];
  var DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function validDate(date) {
    var match = typeof date === 'string' && DATE.exec(date);
    if (!match) return false;
    var y = Number(match[1]), m = Number(match[2]) - 1, d = Number(match[3]), day = new Date(Date.UTC(y, m, d));
    return day.getUTCFullYear() === y && day.getUTCMonth() === m && day.getUTCDate() === d;
  }
  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // The same three goals for everyone on the same date, one from each group.
  function forDay(date) {
    if (!validDate(date)) throw new TypeError('forDay expects a date in YYYY-MM-DD format.');
    var h = hash('goals:' + date);
    return GROUPS.map(function (group, index) {
      var options = catalog.filter(function (g) { return g.group === group; });
      return options[(h >>> (index * 5)) % options.length];
    });
  }
  function fresh(date) { return { day: date, progress: [0, 0, 0], done: [false, false, false], bonus: false }; }
  // A save from another day (or a damaged one) starts today's goals from zero.
  function normalize(raw, date) {
    if (!validDate(date)) throw new TypeError('normalize expects a date in YYYY-MM-DD format.');
    var state = fresh(date);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.day !== date) return state;
    var list = forDay(date);
    list.forEach(function (g, i) {
      var value = Array.isArray(raw.progress) ? raw.progress[i] : 0;
      state.progress[i] = typeof value === 'number' && Number.isFinite(value) ? Math.min(g.target, Math.max(0, Math.floor(value))) : 0;
      state.done[i] = Array.isArray(raw.done) && raw.done[i] === true && state.progress[i] >= g.target;
    });
    state.bonus = raw.bonus === true && state.done.every(Boolean);
    return state;
  }
  function count(value) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; }
  // How far one finished run, clear or meadow action moves a goal. Returns [added, highest] where a goal
  // counts either a running total (added) or a best value (highest).
  function step(g, event) {
    var type = event.type, mode = event.mode;
    if (g.id === 'rush-blooms') return type === 'rush' ? [count(event.blooms), 0] : [0, 0];
    if (g.id === 'rush-wave') return type === 'rush' ? [0, count(event.wave)] : [0, 0];
    if (g.id === 'rush-chain') return type === 'rush' ? [0, count(event.chain)] : [0, 0];
    if (type === 'clear' && ['campaign', 'daily', 'moon', 'koi'].indexOf(mode) >= 0) {
      if (g.id === 'puzzles') return [1, 0];
      if (g.id === 'perfect') return [event.stars === 3 ? 1 : 0, 0];
      if (g.id === 'daily' || g.id === 'moon' || g.id === 'koi') return [mode === g.id ? 1 : 0, 0];
    }
    if (g.id === 'meadow') return [type === 'meadow' ? 1 : 0, 0];
    return [0, 0];
  }
  function record(state, date, event) {
    var next = normalize(state, date), list = forDay(date), done = [], bonus = false;
    if (!event || typeof event !== 'object') return { state: next, done: done, bonus: bonus };
    list.forEach(function (g, i) {
      var change = step(g, event);
      next.progress[i] = Math.min(g.target, Math.max(next.progress[i] + change[0], change[1], next.progress[i]));
      if (!next.done[i] && next.progress[i] >= g.target) { next.done[i] = true; done.push(i); }
    });
    if (!next.bonus && next.done.every(Boolean)) { next.bonus = true; bonus = true; }
    return { state: next, done: done, bonus: bonus };
  }
  function summary(state, date) {
    var current = normalize(state, date);
    var list = forDay(date).map(function (g, i) {
      return { id: g.id, text: g.text, target: g.target, play: g.play, slot: i, progress: current.progress[i], done: current.done[i] };
    });
    return { day: date, goals: list, done: current.done.filter(Boolean).length, bonus: current.bonus };
  }
  return Object.freeze({ catalog: catalog, forDay: forDay, normalize: normalize, record: record, summary: summary });
});
