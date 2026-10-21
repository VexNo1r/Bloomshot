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
  // A mole in sunglasses living under a row of three molehills, 34 px apart. The hills are solid dirt: a seed's own
  // touch bounces off them with no refund. Every so often one hill rumbles for MOLE.rumble s (the tell: crumbs hop, the
  // mound wobbles, a low thump twice), then the mole pops up out of it for `up` s while that hill lets seeds through to
  // him (a ghost), and ducks back down over MOLE.duck s, still hittable. Bonk him and he blooms, and each of his hills
  // blooms after him, MOLE.link s apart, as a chain the seed earned. Then the next hill rumbles. He stops ducking once
  // he is low on the board (y + 10 past MOLE.deep) or has no other hill to go to, and if a chain blooms every hill while
  // he hides, he rumbles up where the last one was and stays up. Chains, powers and uncredited strikes are plain: they
  // bloom a hill where it stands and reach the mole even underground. Every time here is on the foe clock, so a
  // Lullaby holds the whole dance still, and the next hill to pop is public from its rumble on (the bot leads it then).
  // Hill k of group G has id `${G}-${k}` and slot k; the mole is `${G}-3`, perched MOLE.lift px above its hill.
  const MOLE = { wait: .5, rumble: .7, duck: .2, thump: .35, lift: 4, spread: 34, deep: 360, link: .1, up: 1.5 };
  function moleHills(game, mole) {
    const hills = [null, null, null];
    for (const bud of game.buds) if (bud.group === mole.group && bud.foe === 'molehill' && bud.slot >= 0 && bud.slot < 3) hills[bud.slot] = bud;
    return hills;
  }
  const openHill = hill => Boolean(hill && !hill.bloomed);
  function moleOf(game, hill) {
    for (const bud of game.buds) if (bud.group === hill.group && bud.foe === 'mole') return bud;
    return null;
  }
  // The next hill to pop: the first from hash01(G, 0) * 3, then one or two hills on from the one he left (never the
  // same one twice while another is open), stepping past bloomed hills. -1 when every hill has bloomed.
  function molePick(mole, hills) {
    const cur = mole.left, h = hash01(mole.group, mole.n);
    const base = cur < 0 ? Math.floor(h * 3) : (cur + 1 + Math.floor(h * 2)) % 3;
    for (let j = 0; j < 3; j++) { const k = (base + j) % 3; if (k !== cur && openHill(hills[k])) return k; }
    return openHill(hills[cur]) ? cur : -1;
  }
  // He rides his hill (the hills fall as usual); with no open hill under him he is loose and falls on his own.
  function molePerch(mole, hills) {
    const hill = mole.hill >= 0 ? hills[mole.hill] : null;
    if (openHill(hill) && !mole.anchor) { mole.loose = false; mole.x = mole.baseX = hill.x; mole.y = hill.y - MOLE.lift; }
    else mole.loose = true;
    return hill;
  }
  // A rumble starts at foe-clock time `at`: the chosen hill learns when he will pop out of it (rumbleUntil) and when he
  // will be gone again (downAt); the bot reads both. With no hill left, he rumbles where the last one bloomed (the lost
  // anchor) and will stay up.
  function moleRumble(game, mole, hills, at) {
    const k = molePick(mole, hills);
    if (k < 0) {
      const last = hills[mole.last];
      if (last) { mole.x = mole.baseX = last.x; mole.y = last.y - MOLE.lift; }
      mole.anchor = true;
    }
    mole.hill = k; mole.phase = 'rumble'; mole.hidden = true;
    mole.rumbleUntil = mole.until = at + MOLE.rumble; mole.thumpAt = at;
    mole.downAt = mole.anchor ? Infinity : mole.rumbleUntil + mole.up + MOLE.duck;
    if (k >= 0) { hills[k].rumbleUntil = mole.rumbleUntil; hills[k].downAt = mole.downAt; }
    molePerch(mole, hills);
  }
  // He stops ducking for good: low on the board, or nowhere else to go.
  function moleStay(mole, hill) {
    mole.phase = 'stay'; mole.until = Infinity; mole.downAt = Infinity;
    if (hill && mole.hill >= 0) hill.downAt = Infinity;
  }
  function moleStep(game, mole, dt) {
    const hills = moleHills(game, mole);
    molePerch(mole, hills);
    if (dt <= 0) return;
    const now = game.foeClock + 1e-9, open = hills.filter(openHill);
    for (let guard = 0; guard < 6; guard++) {
      const hill = mole.hill >= 0 ? hills[mole.hill] : null;
      // Every hill bloomed while he hid: he comes up where the last one was.
      if (mole.hidden && !mole.anchor && !open.length) { moleRumble(game, mole, hills, game.foeClock); continue; }
      if (mole.phase === 'wait') { if (now < mole.until) break; moleRumble(game, mole, hills, mole.until); continue; }
      if (mole.phase === 'rumble') {
        // The rumbling hill bloomed under him (a chain): the next open hill takes up the rumble, from the start.
        if (!mole.anchor && !openHill(hill)) { moleRumble(game, mole, hills, game.foeClock); continue; }
        while (mole.thumpAt <= now && mole.thumpAt < mole.until - 1e-9) {
          game.event('foe', { kind: 'mole:rumble', bud: mole, x: mole.x, y: mole.y + MOLE.lift, n: Math.round((mole.thumpAt - mole.until + MOLE.rumble) / MOLE.thump) + 1, until: mole.until });
          mole.thumpAt += MOLE.thump;
        }
        if (now < mole.until) break;
        // Peekaboo: up he pops, and the hill lets seeds through to him.
        mole.hidden = false; mole.n++; mole.left = mole.hill;
        if (hill) hill.ghost = true;
        if (mole.anchor) moleStay(mole, null); else { mole.phase = 'up'; mole.until = mole.rumbleUntil + mole.up; }
        game.event('foe', { kind: 'mole:pop', bud: mole, x: mole.x, y: mole.y, n: mole.n });
        continue;
      }
      if (mole.phase === 'up') {
        // The no-dive rule: once he is low, or has no other open hill, he stays up.
        if (mole.y + 10 > MOLE.deep || !open.some(other => other !== hill)) { moleStay(mole, hill); break; }
        if (now < mole.until) break;
        mole.phase = 'duck'; mole.until += MOLE.duck;
        game.event('foe', { kind: 'mole:duck', bud: mole, x: mole.x, y: mole.y });
        continue;
      }
      if (mole.phase === 'duck') {
        if (now < mole.until) break;
        mole.hidden = true;
        if (hill) hill.ghost = false;
        moleRumble(game, mole, hills, mole.until);
        continue;
      }
      break;
    }
  }
  define('molehill', {
    r: 12, hp: 1, fall: 1, type: 'gold', family: 'mole',
    // Solid dirt: a seed's own touch bounces off with no refund. A chain, a power or an uncredited strike blooms it.
    guard: (game, hill, hit, seed) => direct(game, false, credited(game, false), seed),
    // The bot forecasts the hill the mole is heading for, since it lets seeds through while he is up.
    moving: (game, hill) => hill.downAt > game.foeClock,
    predict(game, hill, seconds, out) {
      const ahead = Math.max(0, seconds - (game.lullaby || 0)), at = game.foeClock + ahead;
      out.y = hill.y + (game.descentSpeed || 0) * (hill.fall ?? 1) * ahead;
      out.flags = at >= hill.rumbleUntil - 1e-9 && at < hill.downAt ? 2 : 0;
    },
    value: () => -1,
    bloomed(game, hill) {
      hill.ghost = false;
      const mole = moleOf(game, hill);
      if (mole) mole.last = hill.slot;
    }
  });
  define('mole', {
    r: 10, hp: 1, fall: 1, type: 'coral', family: 'mole', hint: 'Moles pop up! Watch which hill rumbles.',
    // [name, x, y, {up}]: three hills in a row centered on (x, y), and the mole above them (its authored spot only
    // keeps the layout check honest; init puts him under his first hill).
    make(spot, tag, i) {
      const G = i == null ? tag : `${tag}-foe${i}`, x = spot[1], y = spot[2], opts = spot[3] || {};
      const hills = [-1, 0, 1].map((side, k) => piece('molehill', `${G}-${k}`, G, x + side * MOLE.spread, y, { slot: k, rumbleUntil: -1, downAt: -1 }));
      const mole = piece('mole', `${G}-3`, G, x, y - 26, { hidden: true, up: opts.up || MOLE.up, phase: 'wait', until: 0, hill: -1, left: -1, last: -1,
        n: 0, rumbleUntil: -1, downAt: -1, thumpAt: 0, loose: false, anchor: false, bonked: false });
      return [...hills, mole];
    },
    init(game, mole) {
      Object.assign(mole, { hidden: true, phase: 'wait', until: mole.born + MOLE.wait, n: 0, left: -1, last: -1, rumbleUntil: -1, downAt: -1, anchor: false, bonked: false });
      const hills = moleHills(game, mole);
      mole.hill = molePick(mole, hills);
      molePerch(mole, hills);
    },
    owns: mole => !mole.bloomed && !mole.loose,
    step: moleStep,
    // Bonk: his hills bloom one after another, nearest first, as chains of whoever bloomed him.
    bloomed(game, mole, chain, credit) {
      const hills = moleHills(game, mole), by = credit ? credit.by : null;
      mole.hidden = false; mole.phase = 'done';
      for (const hill of hills) if (hill) { hill.ghost = false; hill.rumbleUntil = hill.downAt = -1; }
      hills.filter(openHill).sort((a, b) => Math.hypot(a.x - mole.x, a.y - mole.y) - Math.hypot(b.x - mole.x, b.y - mole.y) || a.slot - b.slot)
        .forEach((hill, k) => game.pending.push(game._linkBy(hill.id, game.time + MOLE.link * (k + 1), mole, 'mole', by)));
      if (!chain && credit && credit.ball && !isPower(game, credit.ball)) {
        mole.bonked = true;
        game.event('foe', { kind: 'mole:bonk', bud: mole, x: mole.x, y: mole.y });
      }
    },
    // The bot: he moves while a pop is coming or under way; underground he is hidden (flag 1) until his rumble ends.
    moving: (game, mole) => mole.phase === 'rumble' || mole.phase === 'up' || mole.phase === 'duck',
    resurfaces: (game, mole) => mole.phase === 'rumble',
    predict(game, mole, seconds, out) {
      const ahead = Math.max(0, seconds - (game.lullaby || 0)), at = game.foeClock + ahead;
      out.y = mole.y + (game.descentSpeed || 0) * (mole.fall ?? 1) * ahead;
      out.flags = mole.phase !== 'wait' && at >= mole.rumbleUntil - 1e-9 && at < mole.downAt ? 0 : 1;
    },
    value: () => 30
  });

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
