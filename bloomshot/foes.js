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
    game.foeLooks = game.vents.length ? ['jelly'] : []; // B4: the jelly's look draws the vents before the first jelly is up
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
  // Moon jellies drift up out of vents in the lake bed, one pulse every JELLY.pulse s: a .3 s thrust (it squeezes and
  // shoots up 34 px, slick as soap: an aimed seed slides off it) and a .6 s glide (it opens wide and glows, drifting
  // 6 px more: any seed blooms it). So the verb is timing: shoot for the glide. It sways 8 px side to side as it climbs,
  // and a jelly nobody catches bursts at the top of the lake into three glowdrops, plain gold buds that fall like any
  // other (one group, so letting them reach the line costs one life). The jelly itself never costs a life: it rises
  // away from the line. A chain, a power or an uncredited strike always blooms it.
  const JELLY = { pulse: .9, thrust: .3, climb: 40, kick: 34, sway: 8, swayTime: 1.8, top: 70, r: 11,
    drops: { r: 8, y: 78, gap: 22, room: 6, shifts: [0, 22, -22, 44, -44] }, vent: { r: 11, room: 6, wait: .3, hurry: 1 } };
  const live = bud => !bud.bloomed && !bud.gift && !bud.inert;
  // How far a jelly has risen t s after it left its vent: whole pulses of 40 px, the thrust easing out over its 34 px,
  // then the glide's last 6 px at an even pace (continuous at every joint, so y(.9k) is exactly 40k up).
  function jellyRise(t) {
    const k = Math.floor(t / JELLY.pulse), f = t - JELLY.pulse * k;
    if (f < JELLY.thrust) { const u = 1 - f / JELLY.thrust; return JELLY.climb * k + JELLY.kick * (1 - u * u); }
    return JELLY.climb * k + JELLY.kick + (JELLY.climb - JELLY.kick) * (f - JELLY.thrust) / (JELLY.pulse - JELLY.thrust);
  }
  // Where in its pulse a jelly is at local time t: 0 <= f < .9, the thrust being f < .3.
  const jellyPhase = t => t - JELLY.pulse * Math.floor(t / JELLY.pulse);
  const jellyAt = (bud, t, out) => { out.x = bud.x0 + JELLY.sway * Math.sin(TAU * t / JELLY.swayTime); out.y = bud.y0 - jellyRise(t); return out; };
  const jellyTime = (game, bud) => (game.foeClock || 0) - (bud.born || 0);
  const jellyThrust = (game, bud) => jellyPhase(jellyTime(game, bud)) < JELLY.thrust;
  // A runtime piece joins the board the way rush's own spawns do (fresh hit and bloom clocks, so it pops in), and starts.
  // Jellies and worm pieces also do this in their own init, so a guardian's kit can simply place(game, make(...)[k]).
  function fresh(game, bud) {
    if (bud.hitAt === undefined) bud.hitAt = -100;
    if (bud.bloomAt === undefined) bud.bloomAt = -100;
    if (bud.spawnAt === undefined) bud.spawnAt = game.time || 0;
    bud.bloomed = Boolean(bud.bloomed);
    return bud;
  }
  const arrive = (game, bud) => place(game, fresh(game, bud));
  // The burst: three glowdrops 22 px apart where the jelly was. A spot needs room (r + 8 + 6 px) from every open piece
  // still in play; if the trio does not fit, it shifts 22 px right, left, then 44 px right, left, and any member still
  // blocked is skipped (a burst with no room at all just sparkles away).
  function jellyBurst(game, bud) {
    const x = bud.x, y = bud.y, D = JELLY.drops, group = `${bud.id}-drops`;
    game._pop(bud, 'jelly:burst');
    const others = game.buds.filter(other => live(other) && !other.ghost);
    const free = (px, chosen) => others.every(o => Math.hypot(o.x - px, o.y - D.y) >= o.r + D.r + D.room)
      && chosen.every(cx => Math.abs(cx - px) >= D.r * 2 + D.room);
    let best = [];
    for (const shift of D.shifts) {
      const chosen = [];
      for (const dx of [-D.gap, 0, D.gap]) { const px = clamp(x + shift + dx, 31, 389); if (free(px, chosen)) chosen.push(px); }
      if (chosen.length > best.length) best = chosen;
      if (chosen.length === 3) break;
    }
    best.forEach((px, k) => arrive(game, piece('glowdrop', `${group}-${k}`, group, px, D.y)));
    return { x, y, drops: best.length };
  }
  define('jelly', {
    r: JELLY.r, hp: 1, fall: 0, type: 'sky', hint: 'Moon jellies rise. Hit them when they glide!',
    // A vent (or a guardian's pad) spawns one with i = null: its id and group are the tag it is given.
    make(spot, tag, i) {
      const id = i == null ? tag : `${tag}-foe${i}`;
      return [piece('jelly', id, id, spot[1], spot[2], { x0: spot[1], y0: spot[2] })];
    },
    init(game, bud) { fresh(game, bud); if (!Number.isFinite(bud.x0)) bud.x0 = bud.x; if (!Number.isFinite(bud.y0)) bud.y0 = bud.y; },
    owns: bud => !bud.bloomed,
    step(game, bud) {
      jellyAt(bud, jellyTime(game, bud), bud); bud.baseX = bud.x;
      if (bud.y <= JELLY.top) jellyBurst(game, bud);
    },
    // Slippery in the thrust: an aimed seed glances off (rush emits jelly:guard). Powers and chains never slip.
    guard: (game, bud, hit, seed) => !game.scripted && !isPower(game, seed) && jellyThrust(game, bud),
    // It rises away from the line, so it never costs a life (its glowdrops do).
    breach: () => 'skip',
    predict(game, bud, seconds, out) {
      const t = jellyTime(game, bud) + Math.max(0, seconds - Math.max(0, game.lullaby || 0));
      jellyAt(bud, t, out);
      if (out.y <= JELLY.top) out.flags |= 1; // burst by then
    },
    // The bot shoots only for a glide (with a hair of margin for its own timing), and jellies near the top come first.
    value(game, bud, hit) {
      const f = jellyPhase(jellyTime(game, bud) + Math.max(0, (hit.time || 0) - Math.max(0, game.lullaby || 0)));
      if (f < JELLY.thrust + .03 || f > JELLY.pulse - .03) return -1;
      return clamp(10 + 60 * (1 - (bud.y - JELLY.top) / 320), 10, 70);
    }
  });
  // A glowdrop is a plain gold bud that falls a little faster than the rest; it only needs its own look.
  define('glowdrop', {
    r: JELLY.drops.r, hp: 1, fall: 1.25, type: 'gold', family: 'jelly',
    make(spot, tag, i) { const id = i == null ? tag : `${tag}-foe${i}`; return [piece('glowdrop', id, id, spot[1], spot[2])]; }
  });
  // Vents send the jellies: each tick a vent whose time has come spawns one (unless a piece sits on its mouth: then it
  // waits .3 s and tries again). On an empty board the next jelly hurries to come within a second, so a player who
  // cleared everything never waits on the lake. A vent with jellies still to send holds the wave open (Foes.holding).
  onTick('before', (game, dt) => {
    const vents = game.vents;
    if (!vents || !vents.length || !(dt > 0)) return;
    const clock = game.foeClock, V = JELLY.vent;
    let anyLive = null;
    for (const vent of vents) {
      if (vent.made >= vent.count) continue;
      if (anyLive === null) anyLive = game.buds.some(live);
      if (!anyLive && vent.nextAt > clock + V.hurry) vent.nextAt = clock + V.hurry;
      if (clock + 1e-9 < vent.nextAt) continue;
      if (game.buds.some(b => live(b) && !b.ghost && Math.hypot(b.x - vent.x, b.y - vent.y) < b.r + V.r + V.room)) { vent.nextAt = clock + V.wait; continue; }
      const jelly = arrive(game, make('jelly', ['jelly', vent.x, vent.y], `${vent.id}-j${vent.made}`, null)[0]);
      vent.made++; vent.nextAt += vent.every; anyLive = true;
      game.event('foe', { kind: 'jelly:spawn', bud: jelly, x: vent.x, y: vent.y, n: vent.made });
    }
  });

  // ── Glowworm (Level 5, `glowworm`) ──
  // A glowworm is five pieces crawling one track: a glowing gold head and four teal beads 21 / 20 px behind it. The
  // track is a lake-bed serpentine: a straight run to x 64 (or 356), a downward half-turn of radius 13 (26 px lower),
  // and back the other way, at WORM.speed px/s, while the whole worm sinks at a third of the wave's pace. Hit the head
  // and the light ripples down the body: every bead blooms in turn, a credited chain .07 s apart. Hit a bead instead
  // and the worm snaps there: that bead blooms, and the beads behind it become a worm of their own (the first one
  // lights up as its new head), which waits .3 s and then crawls on along the same track (an earned chain snaps it the
  // same way). Uncredited strikes, powers on a bead and the ripple's own links are plain. Each worm (and each piece split off) is one group: reaching the line costs one life.
  const WORM = { speed: 54, left: 64, right: 356, turn: 13, gaps: [0, -21, -41, -61, -81], pause: .3, sink: .35, ripple: .07 };
  // The point `s` px along a worm's track (x0, y0, heading dir), with its heading angle; negative s runs back along
  // the first straight. Pure and closed-form, so the game, the bot and the art agree.
  function trackAt(w, s, out) {
    const T = WORM.turn, arc = Math.PI * T, lap = arc + (WORM.right - WORM.left);
    let dir = w.dir < 0 ? -1 : 1;
    const first = Math.max(0, dir < 0 ? w.x0 - WORM.left : WORM.right - w.x0);
    if (s <= first) { out.x = w.x0 + dir * s; out.y = w.y0; out.a = dir < 0 ? Math.PI : 0; return out; }
    s -= first;
    const n = Math.floor(s / lap);
    s -= n * lap;
    if (n % 2) dir = -dir;
    const tx = dir < 0 ? WORM.left : WORM.right, y = w.y0 + 2 * T * n;
    if (s < arc) {
      const th = -Math.PI / 2 + dir * s / T;
      out.x = tx + T * Math.cos(th); out.y = y + T + T * Math.sin(th); out.a = Math.atan2(dir * Math.cos(th), -dir * Math.sin(th));
      return out;
    }
    out.x = tx - dir * (s - arc); out.y = y + 2 * T; out.a = dir < 0 ? 0 : Math.PI;
    return out;
  }
  // How far along its track a worm's head is at foe time `clock` (a split piece starts where it broke off, after its pause).
  const wormS = (w, clock) => w.s0 + WORM.speed * Math.max(0, clock - w.moveAt);
  const wormOf = (game, bud) => game.worms && game.worms.get(bud.worm) || null;
  const wormPieces = (game, key) => game.buds.filter(o => o.foe === 'glowworm' && o.worm === key && !o.bloomed);
  const TRACK = { x: 0, y: 0, a: 0 };
  function wormPose(game, bud, w, clock, sink, out) {
    trackAt(w, wormS(w, clock) + bud.off, out);
    out.y += w.drift + sink;
    return out;
  }
  // The beads behind a struck one break off as their own worm, its first bead the new head.
  function wormSplit(game, bud) {
    const w = wormOf(game, bud);
    if (!w) return;
    const behind = wormPieces(game, bud.worm).filter(o => o.off < bud.off).sort((a, b) => b.off - a.off);
    if (!behind.length) return;
    const now = game.foeClock, key = `${bud.worm}-s${++w.splits}`;
    game.worms.set(key, { G: key, dir: w.dir, x0: w.x0, y0: w.y0, s0: wormS(w, now), moveAt: now + WORM.pause, drift: w.drift, splits: 0, born: now });
    behind.forEach((o, k) => { o.group = key; o.worm = key; if (!k) { o.head = true; o.type = 'gold'; o.headAt = now; } });
    game.event('foe', { kind: 'glowworm:split', bud, x: bud.x, y: bud.y, n: behind.length, head: behind[0] });
  }
  define('glowworm', {
    r: 11, hp: 1, fall: 0, type: 'gold', hint: 'Glowworms! Hit the glowing head.',
    // [name, x, y, {dir}]: the head at (x, y) heading dir (-1 left, 1 right), the beads trailing behind it.
    make(spot, tag, i) {
      const G = i == null ? tag : `${tag}-foe${i}`, dir = (spot[3] || {}).dir < 0 ? -1 : 1, x = spot[1], y = spot[2];
      return WORM.gaps.map((off, k) => piece('glowworm', `${G}-${k}`, G, x + dir * off, y,
        k ? { r: 9, type: 'sky', seg: k, worm: G, off, dir, heading: dir < 0 ? Math.PI : 0 } : { head: true, worm: G, off, dir, heading: dir < 0 ? Math.PI : 0 }));
    },
    // The head lays the track down where it starts; every piece of the worm then follows it.
    init(game, bud) {
      fresh(game, bud);
      if (!game.worms) game.worms = new Map();
      if (bud.head && !game.worms.has(bud.worm)) game.worms.set(bud.worm, { G: bud.worm, dir: bud.dir, x0: bud.x, y0: bud.y, s0: 0, moveAt: bud.born, drift: 0, splits: 0, born: bud.born });
    },
    owns: bud => !bud.bloomed,
    step(game, bud) {
      const w = wormOf(game, bud);
      if (!w) return;
      wormPose(game, bud, w, game.foeClock, 0, TRACK);
      bud.x = bud.baseX = TRACK.x; bud.y = TRACK.y; bud.heading = TRACK.a;
    },
    bloomed(game, bud, chain, credit) {
      if (bud.head) {
        // A head the player earned (or a power) sends the light down its body: each bead blooms .07 s after the last.
        if (!credit && !isPower(game, game.striker)) return;
        const body = wormPieces(game, bud.worm).filter(o => o !== bud).sort((a, b) => b.off - a.off);
        body.forEach((o, k) => game.pending.push(game._linkBy(o.id, game.time + WORM.ripple * (k + 1), bud, 'worm', credit ? credit.by : null)));
        game.event('foe', { kind: 'glowworm:ripple', bud, x: bud.x, y: bud.y, n: body.length });
      } else if (credit && (chain ? !(game.due && game.due.via === 'worm') : !isPower(game, game.striker))) wormSplit(game, bud);
    },
    predict(game, bud, seconds, out) {
      const w = wormOf(game, bud);
      if (!w) return;
      const run = Math.max(0, seconds - Math.max(0, game.lullaby || 0));
      wormPose(game, bud, w, (game.foeClock || 0) + run, (game.descentSpeed || 0) * WORM.sink * run, out);
    },
    // The bot goes for heads (more for a longer body) and leaves beads alone unless one is nearly at the line.
    value(game, bud) {
      if (bud.head) return 40 + 10 * wormPieces(game, bud.worm).filter(o => !o.head).length;
      return (bud.y + bud.r) / (game.dangerY || 448) > .85 ? 0 : -5;
    }
  });
  // The whole worm sinks slowly with the wave (frozen in a Lullaby, like every foe clock).
  onTick('before', (game, dt) => {
    if (!game.worms || !game.worms.size || !(dt > 0)) return;
    const sink = (game.descentSpeed || 0) * WORM.sink * dt;
    for (const w of game.worms.values()) w.drift += sink;
  });


  return Object.freeze({ FOES, names, isFoe, entryOf, familyOf, credited, isPower, direct, chainable, owns, make, piece, place, init, initBud,
    step, onTick, sweep, guard, contact, hit, bloomed, popped, breach, holding, moves, predict, value, hint, rollPreview,
    hash01, orbitAt, lobAt, swapAt, clamp, smooth, TAU, ROLL, define });
});
