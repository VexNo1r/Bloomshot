(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BloomFoes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // The level campaign's new pieces ("foes"): each is an ordinary bud with a `foe` name, so the engine, the art and
  // the bot keep treating it as a bud, and everything special about it lives in one registry entry below.
  //
  // Rules every foe keeps:
  // - All state moves inside the fixed 1/120 s tick and depends only on game time and hash01, never Math.random,
  //   so a run is identical at 30, 60 or 144 FPS.
  // - An uncredited strike (a test script, the tutorial, a scripted loop) is plain: it damages and blooms the foe
  //   with no special rule, so `while (!bud.bloomed) game.strike(bud, true)` always ends.
  // - A pop (a decoy, a burst) ends with bud.bloomed = true and bud.popped = true and pays nothing.
  // - An inert piece never holds a wave open, never costs a life and is swept away when the wave ends.
  // - No foe touches the seed pod.
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const smooth = p => { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); };
  // A stable 0..1 number from a text (a bud id) and an integer: the same on every run and every frame rate.
  function hash01(text, n = 0) {
    let h = 2166136261 ^ n;
    const s = String(text);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  // Shared closed-form motion, so the game, the aim line and the practice bot agree on where a piece will be.
  function orbitAt(cx, cy, radius, rate, phase, t) {
    const a = phase + rate * t;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, a };
  }
  // A lob from (x0,y0) to (x1,y1) over T seconds, rising `height` px above the straight line at its middle.
  function lobAt(x0, y0, x1, y1, T, height, t) {
    const p = clamp(t / Math.max(1e-6, T), 0, 1);
    return { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * p - 4 * height * p * (1 - p), p };
  }
  // Two pieces trading places over `dur` seconds from t0, along a shallow arc; returns where `a` is.
  function swapAt(a, b, t0, dur, t) {
    const p = smooth((t - t0) / Math.max(1e-6, dur));
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p - Math.sin(Math.PI * p) * 18, p };
  }

  // name -> entry. Every hook is optional; a missing hook means "behave like a plain bud".
  //   r, hp, fall          defaults for make()
  //   inert                never holds a wave open, never breaches (fizzles), swept on clear
  //   decoy                the practice bot never shoots it on purpose (must match an always-drawn tell)
  //   owns                 foe-owned motion: the tick skips the usual fall and sway for it
  //   hint                 first-contact hint (<= 52 characters)
  //   make(spot, base)     -> [buds]; spot = { x, y, ...opts }, base = { id, group, type, levelId, wave }
  //   init(game, bud)      when its wave starts or its drop lands
  //   step(game, bud, dt, waveTime)
  //   contact(game, bud, ball, hit) -> 'absorb' (the seed is gone) | null
  //   guard(game, bud, hit, seed)   -> true when the seed glances off (a cup-like block)
  //   hit(game, bud, chain, credited) -> null (plain) | { pop: true, quiet } | { blocked: true, feed }
  //   bloomed(game, bud), popped(game, bud, info)
  //   line(game, bud)      -> 'life' (default) | 'fizzle' when it reaches the danger line
  //   chainable(bud)       -> true when a puffcap/crown/boss chain may take it although it is inert
  //   predict(game, bud, seconds, out) writes out.x, out.y, out.r, out.hidden (pure; the bot's forecast)
  //   value(game, bud, hit, prepared) -> bonus for the bot's shot score, or -1 when the shot is wrong
  const FOES = Object.create(null);
  function define(name, entry) { FOES[name] = Object.freeze({ name, ...entry }); return FOES[name]; }
  const entryOf = bud => bud && bud.foe ? FOES[bud.foe] || null : null;
  const isFoe = bud => Boolean(entryOf(bud));
  const inert = bud => Boolean(bud && bud.inert);
  // A strike is credited when a seed the player fired touches the foe, or a chain that seed started reaches it.
  function credited(game, chain) {
    if (game.scripted) return false;
    if (!chain) return Boolean(game.striker);
    return Boolean(game.due && game.due.by != null);
  }

  // Builds the buds for one `foes` entry of a wave spec: [name, x, y, opts].
  function make(spec, tag, index, levelId, wave, type) {
    const [name, x, y, opts] = spec, entry = FOES[name];
    if (!entry || !Number.isFinite(x) || !Number.isFinite(y)) return [];
    const id = tag + '-' + name + '-' + index;
    const base = { id, group: id, type, levelId, wave };
    if (entry.make) return entry.make({ x, y, ...(opts || {}) }, base);
    const r = entry.r || 11, hp = entry.hp || 1;
    return [{ id, group: id, foe: name, x, y, baseX: x, startY: y, r, type, relay: false, hp, maxHp: hp,
      shield: false, fall: entry.fall ?? 1, sway: 0, swayW: 0, swayPhase: 0, inert: Boolean(entry.inert) || undefined }];
  }
  function initBud(game, bud) { const e = entryOf(bud); if (e && e.init) e.init(game, bud); }
  function init(game) { for (const bud of game.buds) if (bud.foe) initBud(game, bud); }
  function step(game, dt, waveTime) {
    // A foe step may add buds (drops, splits); those start stepping next tick. Most waves have no foes, so the
    // common case allocates nothing.
    const buds = game.buds;
    let any = false;
    for (let i = 0; i < buds.length; i++) if (buds[i].foe && !buds[i].bloomed) { any = true; break; }
    if (!any) return;
    const list = buds.filter(bud => bud.foe && !bud.bloomed);
    for (const bud of list) { const e = entryOf(bud); if (e && e.step) e.step(game, bud, dt, waveTime); }
  }
  function contact(game, bud, ball, hit) { const e = entryOf(bud); return e && e.contact ? e.contact(game, bud, ball, hit) || null : null; }
  function guard(game, bud, hit, seed) { const e = entryOf(bud); return Boolean(e && e.guard && e.guard(game, bud, hit, seed || {})); }
  function hit(game, bud, chain) {
    const e = entryOf(bud); if (!e || !e.hit) return null;
    return e.hit(game, bud, chain, credited(game, chain)) || null;
  }
  function bloomed(game, bud) { const e = entryOf(bud); if (e && e.bloomed) e.bloomed(game, bud); }
  function popped(game, bud, info) { const e = entryOf(bud); if (e && e.popped) e.popped(game, bud, info || {}); }
  function chainable(bud) { const e = entryOf(bud); return Boolean(e && (e.chainable ? e.chainable(bud) : !bud.inert)); }
  // What a foe does at the danger line: 'life' (the default, like any bud) or 'fizzle' (gone, no life).
  function line(game, bud) { const e = entryOf(bud); if (!e) return 'life'; if (e.line) return e.line(game, bud) || 'life'; return bud.inert ? 'fizzle' : 'life'; }
  function owns(bud) { const e = entryOf(bud); return Boolean(e && (typeof e.owns === 'function' ? e.owns(bud) : e.owns)); }
  // The bot forecast. Writes into `out` and returns true when the foe moves on its own (or hides and reappears).
  function predict(game, bud, seconds, out) {
    const e = entryOf(bud); if (!e || !e.predict) return false;
    out.hidden = false; out.r = bud.r;
    e.predict(game, bud, seconds, out); return true;
  }
  function forecasts(bud) { const e = entryOf(bud); return Boolean(e && e.predict); }
  function value(game, bud, hit, prepared) {
    const e = entryOf(bud); if (!e) return 0;
    if (bud.decoy || e.decoy) return -1;
    return e.value ? e.value(game, bud, hit, prepared) : 0;
  }
  // When a wave ends (cleared, its guardian bloomed, the level lost or the next wave loaded), leftover inert pieces
  // go with a soft puff instead of lingering.
  function sweep(game) {
    const left = game.buds.filter(bud => bud.foe && bud.inert && !bud.bloomed);
    if (!left.length) return;
    for (const bud of left) { bud.bloomed = true; bud.popped = true; bud.bloomAt = game.time; game.event('foe', { kind: bud.foe + ':sweep', bud, x: bud.x, y: bud.y }); }
    game.buds = game.buds.filter(bud => !left.includes(bud));
    game.pending = game.pending.filter(item => !left.some(bud => bud.id === item.id));
  }
  function hintFor(name) { const e = FOES[name]; return e && e.hint || ''; }

  // ---------------------------------------------------------------------------------------------------------------
  // The foes. Each lives in its own block so they stay independent.
  // ---------------------------------------------------------------------------------------------------------------

  return { define, FOES, entryOf, isFoe, inert, credited, make, init, initBud, step, contact, guard, hit, bloomed, popped,
    chainable, line, owns, predict, forecasts, value, sweep, hintFor, hash01, orbitAt, lobAt, swapAt, clamp, smooth, TAU };
});
