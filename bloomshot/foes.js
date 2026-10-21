(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BloomFoes = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // The level campaign's new pieces ("foes"): each is an ordinary bud with a `foe` name, so the engine, the art and
  // the bot keep treating it as a bud, and everything special about it lives in one registry entry below.
  //
  // Rules every foe keeps:
  // - All state moves inside the fixed 1/120 s tick and depends only on game.foeClock (which stops during a Lullaby)
  //   and hash01, never Math.random, so a run is identical at 30, 60 or 144 FPS.
  // - An uncredited strike (a test script, the tutorial, a scripted loop) is plain: it damages and blooms the foe
  //   with no special rule, so `while (!bud.bloomed) game.strike(bud, true)` always ends.
  // - A pop (a decoy, a burst) goes through game._pop: bloomed and popped, gone from the board, and it pays nothing.
  // - An inert piece never holds a wave open, never costs a life and is swept away when the wave ends.
  // - No foe reads or writes the seed pod (pod, podGrow, shotGap).
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const smooth = p => { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); };
  // A stable 0..1 number from an id and an integer (FNV-1a over "id:n"): the same on every run and every frame rate.
  function hash01(id, n = 0) {
    const s = `${id}:${n}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  // Shared closed-form motion, so the game, the aim line and the practice bot agree on where a piece will be.
  function orbitAt(cx, cy, R, omega, a0, t) { const a = a0 + omega * t; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }; }
  // A lob from (x0,y0) to (x1,y1) over T seconds, rising h px above the straight line at its middle.
  function lobAt(x0, y0, x1, y1, T, t, h = 40) {
    const u = clamp(t / Math.max(1e-6, T), 0, 1);
    return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u - 4 * h * u * (1 - u), u };
  }
  // Two pieces trading places over dur seconds from t0.
  function swapAt(a, b, t0, dur, t) {
    const e = smooth((t - t0) / Math.max(1e-6, dur));
    return { ax: a.x + (b.x - a.x) * e, ay: a.y + (b.y - a.y) * e, bx: b.x + (a.x - b.x) * e, by: b.y + (a.y - b.y) * e, e };
  }

  // name -> entry. Only `make` (or the static fields) is needed; a missing hook means "behave like a plain bud".
  //   r, hp, fall, type    defaults for piece()
  //   inert, decoy         inert: never holds a wave, never costs a life, swept at the end. decoy: the bot never shoots it
  //   family, hint         the first-contact hint (<= 52 characters) and the family it belongs to (molehill -> mole)
  //   make(spot, tag, i, levelId, number) -> [buds]; spot = [name, x, y, opts]
  //   init(game, bud)      once, the first time it is on the board (bud.born is already set)
  //   step(game, bud, dt)  every tick while it is unbloomed; dt is 0 during a Lullaby
  //   owns(bud)            true: the rush tick leaves its fall and sway alone right now
  //   guard(game, bud, hit, seed) -> true: the seed is turned away (a glance, no refund)
  //   contact(game, bud, ball, hit) -> 'absorb' (the seed is gone) | null; runs before every other bud rule
  //   hit(game, bud, chain, credited, seed) -> null (plain) | { pop, quiet, kind } | { blocked, feed } | { damage }
  //   bloomed(game, bud, chain, credit), popped(game, bud, kind)
  //   breach(game, bud)    -> 'life' (default) | 'fizzle' (default for inert) | 'skip' (never breaches)
  //   chainable(bud)       true when a puffcap or roll chain may take it although it is inert
  //   moving(game, bud)    true while the bot must forecast it (default: it has predict)
  //   resurfaces(game, bud) true while a hidden piece will publicly come back up (the bot keeps tracking it)
  //   predict(game, bud, seconds, out) writes out.x, out.y, out.r, out.flags (1 hidden, 2 ghost); pure
  //   value(game, bud, hit, prepared) -> the bot's added shot value, or -1 when the shot is wrong
  //   valueAny(game, hit, prepared) -> a bonus this foe lends a shot at any piece (a puffcap beside a fibcap)
  const FOES = Object.create(null), BEFORE = [], AFTER = [], ANY = [];
  function define(name, entry) {
    FOES[name] = Object.freeze({ name, ...entry });
    if (entry.valueAny) ANY.push(entry.valueAny);
    return FOES[name];
  }
  // World steps that are not one bud's (Moon Jelly vents before the buds, fibcap sneezes after them).
  function onTick(when, fn) { (when === 'before' ? BEFORE : AFTER).push(fn); }
  const entryOf = bud => bud && bud.foe ? FOES[bud.foe] || null : null;
  const isFoe = bud => Boolean(entryOf(bud));
  const names = () => Object.keys(FOES);
  const familyOf = name => FOES[name] ? FOES[name].family || name : name;
  // A strike is credited when a seed the player fired touches the piece, or a chain that seed started reaches it.
  function credited(game, chain) { return !game.scripted && (chain ? game.due != null && game.due.by != null : Boolean(game.striker)); }
  const isPower = (game, seed) => Boolean(seed && seed.power || game.powerPart || game.powerBoss);
  // A credited, unpowered seed's own touch: the only strike a foe's special rule answers.
  const direct = (game, chain, isCredited, seed) => !chain && isCredited && !isPower(game, seed);

  // A plain foe bud with the registry defaults; extra fields win.
  function piece(name, id, group, x, y, extra) {
    const e = FOES[name] || {}, hp = extra && extra.hp || e.hp || 1;
    const bud = { id, group, x, y, baseX: x, startY: y, r: e.r || 11, type: e.type || 'lilac', relay: false, hp, maxHp: hp,
      shield: false, fall: e.fall ?? 1, sway: 0, swayW: 0, swayPhase: 0, foe: name };
    if (e.inert) bud.inert = true;
    if (e.decoy) bud.decoy = true;
    return Object.assign(bud, extra || {});
  }
  // Builds the buds for one `foes` entry of a wave spec. A one-bud foe has id = group = `<tag>-foe<i>`; a foe of several
  // buds shares that group and numbers its ids `<group>-<k>`.
  function make(name, spot, tag, i, levelId, number) {
    const e = FOES[name];
    if (!e || !Number.isFinite(spot[1]) || !Number.isFinite(spot[2])) return [];
    if (e.make) return e.make(spot, tag, i, levelId, number);
    const id = `${tag}-foe${i}`, opts = spot[3] || {};
    return [piece(name, id, id, spot[1], spot[2], opts.type ? { type: opts.type } : null)];
  }
  function initBud(game, bud) { bud.born = game.foeClock || 0; const e = entryOf(bud); if (e && e.init) e.init(game, bud); }
  // A wave starts: the foe clock, vents and shared lists reset, and every foe on the board starts. Returns whether this
  // wave has (or will get) foes, which the rush tick uses to skip all foe work on every other wave.
  function init(game, spec) {
    game.foeClock = 0;
    // Vents send Moon Jellies, so they only run once the jelly is defined.
    game.vents = FOES.jelly ? (spec && spec.vents || []).map(v => ({ ...v, made: 0, nextAt: v.first })) : [];
    game.sneezes = []; game.worms = new Map();
    let any = game.vents.length > 0;
    for (const bud of game.buds) if (bud.foe) { any = true; initBud(game, bud); }
    if (!any && game.drops) any = game.drops.some(drop => drop.buds.some(bud => bud.foe));
    return any;
  }
  // A foe arriving mid-wave (a drop, a guardian's spawn, a dripped ink drop) joins the board and starts.
  function place(game, bud) {
    if (!game.buds.includes(bud)) game.buds.push(bud);
    game.foeWave = true;
    initBud(game, bud);
    return bud;
  }
  function step(game, dt) {
    const frozen = game.lullaby > 0, fdt = frozen ? 0 : dt;
    if (!frozen) game.foeClock = (game.foeClock || 0) + dt;
    for (let i = 0; i < BEFORE.length; i++) BEFORE[i](game, fdt);
    // A foe step may add buds (drops, splits); those start stepping next tick. The common case allocates nothing.
    const buds = game.buds;
    let any = false;
    for (let i = 0; i < buds.length; i++) if (buds[i].foe && !buds[i].bloomed) { any = true; break; }
    if (any) {
      for (const bud of buds.filter(other => other.foe && !other.bloomed)) {
        if (bud.born === undefined) initBud(game, bud);
        const e = entryOf(bud);
        if (e && e.step && !bud.bloomed) e.step(game, bud, fdt);
      }
    }
    for (let i = 0; i < AFTER.length; i++) AFTER[i](game, fdt);
  }
  function contact(game, bud, ball, hit) { const e = entryOf(bud); return e && e.contact ? e.contact(game, bud, ball, hit) || null : null; }
  function guard(game, bud, hit, seed) { const e = entryOf(bud); return Boolean(e && e.guard && e.guard(game, bud, hit, seed || {})); }
  function hit(game, bud, chain, isCredited, seed) {
    const e = entryOf(bud);
    return e && e.hit ? e.hit(game, bud, chain, isCredited, seed || null) || null : null;
  }
  function bloomed(game, bud, chain, credit) { const e = entryOf(bud); if (e && e.bloomed) e.bloomed(game, bud, chain, credit); }
  function popped(game, bud, kind) { const e = entryOf(bud); if (e && e.popped) e.popped(game, bud, kind); }
  // A puffcap or roll chain takes an inert piece only where its foe says so (a fibcap); an unbloomed real foe always.
  function chainable(bud) {
    const e = entryOf(bud);
    if (!e || bud.bloomed || bud.bossPart) return false;
    return e.chainable ? Boolean(e.chainable(bud)) : !bud.inert;
  }
  function breach(game, bud) {
    const e = entryOf(bud);
    if (!e) return 'life';
    return (e.breach && e.breach(game, bud)) || (bud.inert ? 'fizzle' : 'life');
  }
  function owns(bud) { const e = entryOf(bud); return Boolean(e && e.owns && e.owns(bud)); }
  // The bot's movers: unbloomed foes it must forecast (a rolling rolypoly, a swooping bat, a mole about to pop up).
  function moves(game) {
    const list = [];
    for (const bud of game.buds) {
      const e = entryOf(bud);
      if (!e || bud.bloomed || !e.predict || (e.moving && !e.moving(game, bud))) continue;
      if (bud.hidden && !(e.resurfaces && e.resurfaces(game, bud))) continue;
      list.push(bud);
    }
    return list;
  }
  // Writes where the piece will be `seconds` from now into out (x, y, r, flags: 1 hidden, 2 ghost).
  function predict(game, bud, seconds, out) {
    out.x = bud.x; out.y = bud.y; out.r = bud.r; out.flags = (bud.hidden ? 1 : 0) | (bud.ghost ? 2 : 0);
    const e = entryOf(bud);
    if (e && e.predict) e.predict(game, bud, seconds, out);
    return out;
  }
  // The bot's view of a shot at hit.bud: -1 when it is wrong (a decoy), else a bonus added to its score.
  function value(game, hit, prepared) {
    const bud = hit.bud, e = entryOf(bud);
    if (bud.decoy) return -1;
    let v = 0;
    if (e && e.value) { const own = e.value(game, bud, hit, prepared); if (own === -1) return -1; v += own || 0; }
    for (let i = 0; i < ANY.length; i++) v += ANY[i](game, hit, prepared) || 0;
    return v;
  }
  // When a wave ends (cleared, its guardian bloomed, the level lost), leftover inert pieces go with a soft puff.
  function sweep(game, why) {
    const left = game.buds.filter(bud => bud.foe && bud.inert && !bud.bloomed);
    for (const bud of left) game._pop(bud, bud.foe + ':fizzle');
    if (why === 'boss' || why === 'lost') game.vents = [];
  }
  // A vent with jellies still to send holds the wave open.
  const holding = game => Boolean(game.vents && game.vents.some(v => v.made < v.count));
  // The first-contact hint of a family, or of the family a kind belongs to (hint('molehill') is the mole's).
  function hint(family) {
    if (FOES[family]) family = familyOf(family);
    for (const name in FOES) if (familyOf(name) === family && FOES[name].hint) return FOES[name].hint;
    return '';
  }

  // The straight line a rolypoly would bowl along from (bud) away from a touch with normal (nx, ny): which pieces it
  // would cross (at most 4) and whether it would reach an open guardian. Pure; the bot and the aim preview use it.
  const ROLL_REACH = 363;
  function rollPreview(game, bud, nx, ny) {
    const len = Math.hypot(nx, ny) || 1, dx = -nx / len, dy = -ny / len;
    let touches = 0, boss = false;
    for (const other of game.buds) {
      if (other === bud || other.bloomed || other.hidden || other.ghost || other.gift) continue;
      if (!(other.boss || other.bossPart || !other.inert || chainable(other))) continue;
      const px = other.x - bud.x, py = other.y - bud.y, along = clamp(px * dx + py * dy, 0, ROLL_REACH);
      if (Math.hypot(px - dx * along, py - dy * along) > 12 + other.r) continue;
      if (other.boss) { if (game.bossState && game.bossState.vulnerable) boss = true; continue; }
      if (touches < 4) touches++;
    }
    return { touches, boss };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The foes. Each lives in its own block so they stay independent.
  // ---------------------------------------------------------------------------------------------------------------

  // ── Rolypoly (Level 2, `rolypoly`) ──
  // A shy pill bug, the first piece you use as a weapon. A seed's touch curls it into a ball that bowls away from the
  // touch, like a cue ball: where the seed lands decides the line. It rolls ROLL.speed px/s for ROLL.time s or until it
  // has bowled into ROLL.touches buds, bouncing off walls and rocks, and each bud it meets blooms outright as a chain
  // the seed earned. Then it uncurls and blooms itself. While it rolls it is a ghost (seeds pass through it), and a soft floor
  // above the line turns it back, so a roll never costs a life. A chain, a power or an uncredited strike just blooms it.
  const ROLL = { curl: .08, time: 1.1, speed: 330, touches: 4, r: 12, floor: 20 };
  function rollStep(game, bud, dt) {
    const roll = bud.roll, t = game.foeClock - bud.born, since = t - roll.t0;
    if (roll.done || dt <= 0 || since < ROLL.curl) return;
    if (!roll.rolling) { roll.rolling = true; game.event('foe', { kind: 'rolypoly:roll', bud, x: bud.x, y: bud.y, dx: roll.dx, dy: roll.dy }); }
    if (since >= ROLL.curl + ROLL.time || roll.touches >= ROLL.touches) {
      // Done: it uncurls and blooms itself, credited to the seed that bowled it.
      roll.done = true; bud.ghost = false;
      game.event('foe', { kind: 'rolypoly:end', bud, x: bud.x, y: bud.y, touches: roll.touches });
      game.pending.push(game._linkBy(bud.id, game.time, bud, 'roll', roll.by));
      return;
    }
    let remaining = dt;
    for (let i = 0; i < 4 && remaining > 1e-7; i++) {
      // The soft floor: a ball heading for the line turns back up before it gets there.
      if (bud.y + ROLL.r > game.dangerY - ROLL.floor) roll.dy = -Math.abs(roll.dy);
      const d = { x: roll.dx * ROLL.speed * remaining, y: roll.dy * ROLL.speed * remaining };
      const h = game.foeSweep(bud, d, ROLL.r, bud);
      if (!h) { bud.x += d.x; bud.y += d.y; roll.dist += Math.hypot(d.x, d.y); break; }
      bud.x += d.x * h.t; bud.y += d.y * h.t; roll.dist += Math.hypot(d.x, d.y) * h.t; remaining *= 1 - h.t;
      const dot = roll.dx * h.nx + roll.dy * h.ny;
      roll.dx -= 2 * dot * h.nx; roll.dy -= 2 * dot * h.ny;
      bud.x += h.nx * .08; bud.y += h.ny * .08;
      roll.bumpAt = game.foeClock; roll.nx = h.nx; roll.ny = h.ny;
      if (h.kind === 'bud' && h.item.rolledBy !== bud.id) {
        // Each bud it bowls into blooms outright as a chain the seed earned, one rising note per pin. A guardian or a
        // geode takes one ordinary chain hit instead.
        h.item.rolledBy = bud.id; roll.touches++;
        const whole = !h.item.boss && !h.item.bossPart && !h.item.geode;
        game.pending.push(game._linkBy(h.item.id, game.time + .02, bud, 'roll', roll.by, whole));
        game.event('foe', { kind: 'rolypoly:bowl', bud, x: bud.x, y: bud.y, k: roll.touches, nx: h.nx, ny: h.ny, target: h.item });
        if (roll.touches >= ROLL.touches) break;
      } else if (h.kind !== 'bud') game.event('foe', { kind: 'rolypoly:bump', bud, x: bud.x, y: bud.y, nx: h.nx, ny: h.ny });
    }
    bud.baseX = bud.x;
  }
  define('rolypoly', {
    r: ROLL.r, hp: 1, fall: 1, type: 'lilac', hint: 'Bump a rolypoly and it bowls into the rest!',
    make(spot, tag, i) { const id = `${tag}-foe${i}`; return [piece('rolypoly', id, id, spot[1], spot[2], { roll: null })]; },
    owns: bud => Boolean(bud.roll),
    hit(game, bud, chain, isCredited, seed) {
      if (bud.roll || !direct(game, chain, isCredited, seed)) return null;
      const n = seed.bossContact || { nx: 0, ny: 1 };
      bud.roll = { t0: game.foeClock - bud.born, by: seed.id, dx: -n.nx, dy: -n.ny, dist: 0, touches: 0, rolling: false, done: false, bumpAt: -100, nx: 0, ny: 0 };
      bud.ghost = true;
      game.event('foe', { kind: 'rolypoly:curl', bud, x: bud.x, y: bud.y, dx: -n.nx, dy: -n.ny });
      return { blocked: true, feed: true };
    },
    step(game, bud, dt) { if (bud.roll) rollStep(game, bud, dt); },
    bloomed(game, bud) { bud.ghost = false; },
    // Idle it is a plain sitter; rolling it is a ghost the bot's seeds would pass through.
    moving: (game, bud) => Boolean(bud.roll),
    predict(game, bud, seconds, out) { if (bud.roll) out.flags |= 2; },
    value(game, bud, hit) {
      if (bud.roll) return 0;
      const p = rollPreview(game, bud, hit.nx, hit.ny);
      return 12 * p.touches + (p.boss ? 40 : 0);
    }
  });

  // ── Peekaboo Mole (Level 2, `mole`) ──

  // ── Fibcap (Level 3, `fibcap`) ──

  // ── Drippy Inkcap (Level 3, `inkcap`) ──

  // ── Chroma Crystal (Level 4, `chroma`) ──

  // ── Echo Bat (Level 4, `bat`) ──

  // ── Moon Jelly (Level 5, `jelly`) ──

  // ── Glowworm (Level 5, `glowworm`) ──


  return Object.freeze({ FOES, names, isFoe, entryOf, familyOf, credited, isPower, direct, chainable, owns, make, piece, place, init, initBud,
    step, onTick, sweep, guard, contact, hit, bloomed, popped, breach, holding, moves, predict, value, hint, rollPreview,
    hash01, orbitAt, lobAt, swapAt, clamp, smooth, TAU, ROLL, define });
});
