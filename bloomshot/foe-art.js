/* BLOOMSHOT — the level campaign's new pieces (foes.js), drawn in the storybook style of art.js. */
(function (root) {
  'use strict';
  // art.js calls these hooks only on a wave that has foes (game.foeWave):
  //   under(ctx, state, time, still, kit, quality)       below every bud (molehills, a glowworm's body, ink trails)
  //   bud(ctx, bud, time, still, state, kit, quality)    instead of the plain flower, for an unbloomed foe bud
  //   over(ctx, state, time, still, kit, quality)        above the buds (swoop arcs, sneeze cones, burst drops)
  //   aim(ctx, state, time, still, kit, quality)         after the aim guide (a rolypoly's roll arrow)
  // quality is the governor's tier (0 full, 1 lighter, 2 lightest): dust and trails only at 0, extra glints at <= 1.
  // A foe's own clock is state.foeClock (it stops during a Lullaby); bud.born is when that foe arrived.
  // kit is art.js's own toolbox: { atlasSprite, blit, drawFlower, circle, sparkle, starPath, roundRect, shade, FLOWERS,
  // TAU, clamp, ease, smooth, easeBounce, easeBack }. Rules: no per-frame gradients and no shadowBlur; anything with
  // detail is painted once into an atlas sprite (keys never hold an animated value); `still` (Animations off) freezes
  // every wobble and sweep but keeps each tell readable as a still mark.
  const LOOKS = Object.create(null);
  function define(name, look) { LOOKS[name] = look; return look; }
  const BloomFoeLook = define;
  const has = bud => Boolean(bud && bud.foe && LOOKS[bud.foe] && LOOKS[bud.foe].bud);
  function each(state, hook, ctx, time, still, kit, quality) {
    const seen = new Set();
    for (const bud of state.buds || []) {
      if (!bud.foe || seen.has(bud.foe)) continue;
      seen.add(bud.foe);
      const look = LOOKS[bud.foe];
      if (look && look[hook]) { ctx.save(); try { look[hook](ctx, state, time, still, kit, quality); } finally { ctx.restore(); } }
    }
    // A look may also draw for a wave whose foes are all gone (a burst's falling drops), keyed by state.foeLooks.
    for (const name of state.foeLooks || []) {
      if (seen.has(name)) continue;
      const look = LOOKS[name];
      if (look && look[hook]) { ctx.save(); try { look[hook](ctx, state, time, still, kit, quality); } finally { ctx.restore(); } }
    }
  }
  function bud(ctx, piece, time, still, state, kit, quality = 0) { ctx.save(); try { LOOKS[piece.foe].bud(ctx, piece, time, still, state, kit, quality); } finally { ctx.restore(); } }
  const under = (ctx, state, time, still, kit, quality = 0) => each(state, 'under', ctx, time, still, kit, quality);
  const over = (ctx, state, time, still, kit, quality = 0) => each(state, 'over', ctx, time, still, kit, quality);
  const aim = (ctx, state, time, still, kit, quality = 0) => each(state, 'aim', ctx, time, still, kit, quality);
  // Sprites a level will need, painted ahead during its intro: [[name, r, type], ...] -> each look's warm(kit, r, type).
  function warm(list, kit) { for (const [name, r, type] of list) { const look = LOOKS[name]; if (look && look.warm) look.warm(kit, r, type); } }

  // Shared helpers for the looks.
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  // A cached drawing placed at (x, y), turned and scaled: painted once at 3x into the atlas (or painted directly where
  // there is no canvas, as in node). box = [x0, y0, x1, y1] around the drawing's own origin.
  function stamp(ctx, kit, key, box, paint, x, y, turn = 0, sx = 1, sy = sx) {
    const sprite = kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    ctx.save(); ctx.translate(x, y); if (turn) ctx.rotate(turn); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    if (sprite) kit.blit(ctx, sprite); else paint(ctx);
    ctx.restore();
  }
  // Where a thrown piece is along its arc (the same as foes.js lobAt; art keeps no dependency on the rules).
  function lobAt(x0, y0, x1, y1, T, t, h = 40) {
    const u = clamp(t / Math.max(1e-6, T), 0, 1);
    return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u - 4 * h * u * (1 - u), u };
  }
  // A dotted line with a soft white edge, for tells drawn on the board (a roll arrow, a swoop arc).
  function dotted(ctx, points, color, dot = 2.1, gap = 7, phase = 0) {
    let carry = phase % gap;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i], len = Math.hypot(x1 - x0, y1 - y0);
      for (let d = gap - carry; d <= len; d += gap) {
        const k = d / len, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
        ctx.beginPath(); ctx.arc(x, y, dot + 1.1, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, dot, 0, TAU); ctx.fillStyle = color; ctx.fill();
      }
      carry = (carry + len) % gap;
    }
  }

  // -----------------------------------------------------------------------------------------------------------------
  // The looks. Each lives in its own block so they stay independent.
  // -----------------------------------------------------------------------------------------------------------------

  // ── Rolypoly (Level 2, `rolypoly`) ──
  // A lilac pill bug in a banded shell, facing the launcher: two dot eyes, rosy cheeks and antennae, little legs
  // paddling under the shell (three cached walk frames). Hit, it tucks into a curl, then rolls as a banded ball that
  // spins with the distance it covers, squashes against each piece it bowls into and leaves a few puffs of dust. When
  // the aim guide ends on it, a dashed arrow shows the way it will roll.
  const ROLY = { body: '#b9a8d6', band: '#9d8cc0', belly: '#e4dcf2', ink: '#4a3d63', face: '#7a68a6', cheek: '#ff9fbf', dust: '#d8c9a8' };
  const ROLY_BOX = r => [-r * 1.45, -r * 1.15, r * 1.45, r * 1.75];
  function paintRolyShell(c, r, frame) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    // Legs first, under the shell: four a side, each frame shifts them 1.5 px in a paddling wave.
    c.strokeStyle = ROLY.ink; c.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
      const ly = -r * .45 + i * r * .3, kick = (((i + frame + (side > 0 ? 1 : 0)) % 3) - 1) * 1.5;
      c.beginPath(); c.moveTo(side * r * .85, ly); c.lineTo(side * (r * 1.2 + 1), ly + kick + 1.2); c.stroke();
    }
    // Antennae curl out from the head toward the launcher.
    for (const side of [-1, 1]) {
      const tip = side * (r * .72 + (frame - 1) * .6);
      c.beginPath(); c.moveTo(side * r * .2, r * .9); c.quadraticCurveTo(side * r * .4, r * 1.35, tip, r * 1.42); c.stroke();
      c.beginPath(); c.arc(tip, r * 1.42, 1.3, 0, TAU); c.fillStyle = ROLY.ink; c.fill();
    }
    // The shell: a 26 x 20 oval, four bands, a pale belly rim and a highlight, inked.
    c.beginPath(); c.ellipse(0, -r * .08, r * 1.08, r * .84, 0, 0, TAU); c.fillStyle = ROLY.body; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.ellipse(0, r * .62, r * 1.2, r * .32, 0, 0, TAU); c.fillStyle = ROLY.belly; c.fill();
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(0, -r * .62 + i * r * .34, r * 1.2, r * .1, 0, 0, TAU); c.fillStyle = ROLY.band; c.fill(); }
    c.beginPath(); c.ellipse(-r * .38, -r * .5, r * .48, r * .2, -.25, 0, TAU); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill();
    c.restore();
    c.beginPath(); c.ellipse(0, -r * .08, r * 1.08, r * .84, 0, 0, TAU); c.strokeStyle = ROLY.ink; c.lineWidth = 1.4; c.stroke();
    // The head peeks out at the bottom: dot eyes with a catch-light and rosy cheeks.
    c.beginPath(); c.ellipse(0, r * .64, r * .6, r * .38, 0, 0, TAU); c.fillStyle = ROLY.face; c.fill(); c.lineWidth = 1.3; c.stroke();
    for (const side of [-1, 1]) {
      c.beginPath(); c.arc(side * r * .24, r * .6, r * .1, 0, TAU); c.fillStyle = '#1d1430'; c.fill();
      c.beginPath(); c.arc(side * r * .24 - r * .03, r * .56, r * .035, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      c.beginPath(); c.ellipse(side * r * .44, r * .74, r * .1, r * .06, 0, 0, TAU); c.fillStyle = ROLY.cheek; c.fill();
    }
  }
  // Half closed: the shell rounds up and the head tucks under, legs gone.
  function paintRolyCurl(c, r) {
    c.lineJoin = 'round';
    c.beginPath(); c.ellipse(0, 0, r * 1.02, r * .94, 0, 0, TAU); c.fillStyle = ROLY.body; c.fill();
    c.save(); c.clip();
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(0, -r * .66 + i * r * .38, r * 1.2, r * .11, 0, 0, TAU); c.fillStyle = ROLY.band; c.fill(); }
    c.beginPath(); c.ellipse(0, r * .82, r * .5, r * .26, 0, 0, TAU); c.fillStyle = ROLY.face; c.fill();
    c.beginPath(); c.ellipse(-r * .36, -r * .5, r * .44, r * .2, -.3, 0, TAU); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill();
    c.restore();
    c.beginPath(); c.ellipse(0, 0, r * 1.02, r * .94, 0, 0, TAU); c.strokeStyle = ROLY.ink; c.lineWidth = 1.4; c.stroke();
    // Squeezed-shut eyes: two little arcs.
    c.lineCap = 'round'; c.lineWidth = 1.2;
    for (const side of [-1, 1]) { c.beginPath(); c.arc(side * r * .2, r * .74, r * .08, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  }
  // Fully rolled: a sphere wrapped by three band arcs, the tucked head one darker plate.
  function paintRolyBall(c, r) {
    c.lineJoin = 'round';
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = ROLY.body; c.fill();
    c.save(); c.clip();
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.ellipse(i * r * .5, 0, r * .13, r * 1.2, 0, 0, TAU); c.fillStyle = ROLY.band; c.fill(); }
    c.beginPath(); c.ellipse(r * .82, 0, r * .28, r * .58, 0, 0, TAU); c.fillStyle = ROLY.face; c.fill();
    c.beginPath(); c.ellipse(-r * .3, -r * .46, r * .44, r * .19, -.4, 0, TAU); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill();
    c.restore();
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = ROLY.ink; c.lineWidth = 1.4; c.stroke();
  }
  const rolyWalk = (kit, r, f) => [`foe:rolypoly:${r}:walk${f}`, ROLY_BOX(r), c => paintRolyShell(c, r, f)];
  const rolyCurl = (kit, r) => [`foe:rolypoly:${r}:curl`, [-r - 2, -r - 2, r + 2, r + 2], c => paintRolyCurl(c, r)];
  const rolyBall = (kit, r) => [`foe:rolypoly:${r}:ball`, [-r - 2, -r - 2, r + 2, r + 2], c => paintRolyBall(c, r)];
  BloomFoeLook('rolypoly', {
    warm(kit, r) {
      for (const [key, box, paint] of [rolyWalk(kit, r, 0), rolyWalk(kit, r, 1), rolyWalk(kit, r, 2), rolyCurl(kit, r), rolyBall(kit, r)]) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    bud(ctx, bud, time, still, state, kit, quality) {
      const r = bud.r || 12, roll = bud.roll, x = bud.x, y = bud.y;
      if (roll) {
        const clock = Number(state.foeClock) || 0, since = clock - (bud.born || 0) - roll.t0;
        // The curl for its first .08 s, then the ball, spun by the distance it has rolled.
        if (since < .08 && !roll.done) { const [key, box, paint] = rolyCurl(kit, r); stamp(ctx, kit, key, box, paint, x, y); return; }
        const dir = Math.atan2(roll.dy, roll.dx);
        // A few puffs of dust trail the ball, spaced along its path so they keep their place as it rolls.
        if (!still && quality === 0 && !roll.done) {
          const gap = 13, lead = (roll.dist || 0) % gap;
          for (let k = 0; k < 3; k++) {
            const back = 10 + k * gap + lead, a = .5 * (1 - (k * gap + lead) / (3 * gap));
            if (back > (roll.dist || 0) + 10) break;
            ctx.globalAlpha = Math.max(0, a); kit.circle(ctx, x - Math.cos(dir) * back, y - Math.sin(dir) * back, 2.4 + k * .7, ROLY.dust);
          }
          ctx.globalAlpha = 1;
        }
        // Each bump squashes it for .1 s, wide along the surface it met and flat into it.
        const squash = still ? 0 : clamp(1 - (clock - roll.bumpAt) / .1, 0, 1), spin = still ? 0 : (roll.dist || 0) / r;
        const [key, box, paint] = rolyBall(kit, r);
        if (squash > 0) {
          const n = Math.atan2(roll.ny, roll.nx);
          ctx.save(); ctx.translate(x, y); ctx.rotate(n); ctx.scale(1 - .15 * squash, 1 + .15 * squash); ctx.rotate(spin - n);
          const sprite = kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
          if (sprite) kit.blit(ctx, sprite); else paint(ctx);
          ctx.restore();
        } else stamp(ctx, kit, key, box, paint, x, y, spin);
        return;
      }
      // Idle: the legs paddle through three frames every .4 s and the shell breathes (1 +- .02 every 2 s).
      const frame = still ? 0 : Math.floor(time / .4 * 3 + (bud.born || 0) * 7) % 3, breathe = still ? 1 : 1 + Math.sin(time * Math.PI + x * .07) * .02;
      const [key, box, paint] = rolyWalk(kit, r, frame);
      stamp(ctx, kit, key, box, paint, x, y, 0, breathe, 1 / breathe);
    },
    // When the aim guide ends on a rolypoly, a dashed arrow shows the way it will roll: straight away from the touch.
    aim(ctx, state) {
      const aim = state.aim, target = aim && aim.target;
      if (!target || target.foe !== 'rolypoly' || target.roll || target.bloomed || !aim.normal) return;
      const nx = -aim.normal.x, ny = -aim.normal.y, r = target.r || 12, x0 = target.x + nx * (r + 3), y0 = target.y + ny * (r + 3);
      const x1 = x0 + nx * 40, y1 = y0 + ny * 40;
      ctx.lineCap = 'round'; ctx.setLineDash([3, 4]);
      for (const [color, width] of [['#fff6ce', 3.5], ['#7a5aa8', 1.8]]) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
      ctx.setLineDash([]);
      // A 6 px arrowhead, cream-rimmed like the line.
      ctx.translate(x1, y1); ctx.rotate(Math.atan2(ny, nx)); ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-3, -4.5); ctx.lineTo(-3, 4.5); ctx.closePath();
      ctx.lineWidth = 2.4; ctx.strokeStyle = '#fff6ce'; ctx.stroke(); ctx.fillStyle = '#7a5aa8'; ctx.fill();
    }
  });

  // ── Peekaboo Mole (Level 2, `mole`) ──

  // ── Fibcap (Level 3, `fibcap`) ──

  // ── Drippy Inkcap (Level 3, `inkcap`) ──

  // ── Chroma Crystal (Level 4, `chroma`) ──

  // ── Echo Bat (Level 4, `bat`) ──

  // ── Moon Jelly (Level 5, `jelly`) ──

  // ── Glowworm (Level 5, `glowworm`) ──

  // -----------------------------------------------------------------------------------------------------------------
  // The guardians' kits (bosses.js). art.js calls these during a fight with a kit guardian (state.bossState.kind):
  //   under(ctx, state, s, time, still, kit, quality)          below every bud (Rootknot's holes, Lily's tide band)
  //   part(ctx, state, s, bud, time, still, kit, quality)      a boss part of a kit role (portal, z, knot, pad, waltz,
  //                                                            fibwaltz); return true when drawn, false for the usual art
  //   face(ctx, state, s, bud, time, still, kit, quality)      the guardian's face for its mood (s.tier); return true to
  //                                                            replace the usual face (bud.x, bud.y is the face's body)
  //   over(ctx, state, s, time, still, kit, quality)           above the buds (lob flights, tendrils, mirrors, moons, tells
  //                                                            of the current warning s.warning)
  //   aim(ctx, state, s, time, still, kit, quality)            after the aim guide
  //   warm(kit)                                                sprites to paint ahead during the level's intro
  // s is the guardian's state (s.tier, s.mode, s.warning, s.lobs, s.carried, s.age); the same rules as the foes apply.
  // -----------------------------------------------------------------------------------------------------------------
  const KIT_LOOKS = Object.create(null);
  function kitLook(kind, look) { KIT_LOOKS[kind] = look; return look; }
  function kitCall(hook, ctx, state, ...args) {
    const s = state && state.bossState, look = s && KIT_LOOKS[s.kind];
    if (!look || !look[hook]) return false;
    ctx.save(); try { return Boolean(look[hook](ctx, state, s, ...args)); } finally { ctx.restore(); }
  }
  const kits = {
    under: (ctx, state, time, still, kit, quality = 0) => kitCall('under', ctx, state, time, still, kit, quality),
    part: (ctx, state, bud, time, still, kit, quality = 0) => kitCall('part', ctx, state, bud, time, still, kit, quality),
    face: (ctx, state, bud, time, still, kit, quality = 0) => kitCall('face', ctx, state, bud, time, still, kit, quality),
    over: (ctx, state, time, still, kit, quality = 0) => kitCall('over', ctx, state, time, still, kit, quality),
    aim: (ctx, state, time, still, kit, quality = 0) => kitCall('aim', ctx, state, time, still, kit, quality),
    warm: (kind, kit) => { const look = KIT_LOOKS[kind]; if (look && look.warm) look.warm(kit); }
  };

  // ── Old Sunny (Level 1, `sunny`) ──

  // ── Rootknot (Level 2, `root`) ──

  // ── Mother Morel (Level 3, `puff`) ──

  // ── Crystal Heart (Level 4, `crystal`) ──
  // Glass, sparkle and a little mischief. The real heart is pink cut glass with a glowing core and a soft aura, beating
  // faster as her mood climbs, under a face for each mood (Calm: a gentle smile; Shining: starry eyes and an open
  // grin; Racing: set brows, gritted teeth and a bead of sweat). The two fakes are clear frosted glass with a
  // zig-zag crack, a matte disc behind them (never the target jewel), a glint that sweeps across them every 2.5 s and
  // a sly smirk that winks. A shattered fake bursts into six cut-glass pieces that spin out and fall; as it re-forms the
  // pieces fly back together and it pops back to size. The mirrors are icy blades with a white rim, a pink gem at the
  // pivot and a highlight sliding along them; a pip around the gem fills through each .8 s hold, so the turn never
  // surprises, and a seed banking off one makes the blade flash. While the hues are up the real heart turns the wanted
  // flower's color with its glyph on the forehead, inside a beaded ring that pulses at 1.2 Hz; when the aim guide ends on
  // it, a badge says whether the seed in the launcher will do. Animations off: no beat, aura pulse, glint, wink,
  // sweep, swoosh or ring pulse; the crack, the glyph, the ring, the badge and the hold pip all stay.
  const CRY = {
    glass: { light: '#ffffff', base: '#e6ecf8', mid: '#d0d9ec', dark: '#a9b5d0', ink: '#626d8f' },
    mirror: { blade: '#cfe8ff', top: '#eef8ff', low: '#a9cdf2', edge: '#7fa6d6', ink: '#4c6b99', gem: '#ff8cc6' },
    pink: '#ff72b2', ink: '#682d70', eye: '#7052b2', cheek: '#9fe0d7', matte: '#c3cde2',
    beat: [5.1, 6.6, 8.8], beatAmp: [.045, .05, .065], moods: ['calm', 'shining', 'racing']
  };
  // The guardian heart's outline, in units of its radius (as art.js draws the boss hearts).
  function heartPath(c) {
    c.beginPath(); c.moveTo(0, -.62); c.bezierCurveTo(-.62, -1.43, -1.41, -.73, -1.1, .05);
    c.bezierCurveTo(-.92, .46, -.25, .97, 0, 1.14); c.bezierCurveTo(.29, .93, .94, .46, 1.1, .05);
    c.bezierCurveTo(1.41, -.73, .62, -1.43, 0, -.62); c.closePath();
  }
  function facet(c, points, fill) { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = fill; c.fill(); }
  // Cut glass in five tones: the facets art.js gives the real heart, recolored.
  function paintGlassHeart(c, r, tones) {
    c.save(); c.scale(r, r); c.lineJoin = 'round'; c.lineCap = 'round';
    heartPath(c); c.fillStyle = tones.base; c.fill();
    c.save(); c.clip();
    facet(c, [[0, -.62], [-.85, -.83], [-1.03, -.12], [-.47, -.22]], tones.light);
    facet(c, [[0, -.62], [.91, -.8], [.95, -.06], [.42, -.23]], tones.base);
    facet(c, [[-.47, -.22], [0, .06], [0, 1.14], [-.91, .32]], tones.mid);
    facet(c, [[.42, -.23], [.95, -.06], [.82, .35], [0, 1.14], [0, .06]], tones.dark);
    facet(c, [[0, -.62], [-.47, -.22], [0, .06], [.42, -.23]], tones.top || tones.light);
    c.beginPath(); c.moveTo(-.86, -.69); c.lineTo(-1.03, -.2); c.lineTo(-.62, .26); c.strokeStyle = '#ffffff'; c.lineWidth = .065; c.stroke();
    c.restore();
    heartPath(c); c.strokeStyle = tones.ink; c.lineWidth = .06; c.stroke();
    c.restore();
  }
  // The seed glyphs (the tray's set): gold sun-dot, coral heart, lilac crescent, sky drop, poppy star; white with an
  // outline in the flower's dark tone, `size` px tall.
  function paintGlyph(c, kit, type, size) {
    const F = kit.FLOWERS[type] || kit.FLOWERS.gold, u = size / 9;
    c.save(); c.scale(u, u); c.lineJoin = 'round'; c.lineCap = 'round';
    const ink = () => { c.strokeStyle = F.dark; c.lineWidth = 2.4; c.stroke(); c.fillStyle = '#ffffff'; c.fill(); };
    if (type === 'gold') {
      c.strokeStyle = F.dark; c.lineWidth = 2.6;
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(Math.cos(a) * 2.9, Math.sin(a) * 2.9); c.lineTo(Math.cos(a) * 4.4, Math.sin(a) * 4.4); c.stroke(); }
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.1;
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(Math.cos(a) * 2.9, Math.sin(a) * 2.9); c.lineTo(Math.cos(a) * 4.4, Math.sin(a) * 4.4); c.stroke(); }
      c.beginPath(); c.arc(0, 0, 2.2, 0, TAU); ink();
    } else if (type === 'coral') {
      c.save(); c.translate(0, -.4); c.scale(3.6, 3.6); heartPath(c); c.restore(); ink();
    } else if (type === 'lilac') {
      c.beginPath(); c.arc(0, 0, 4.3, .55, TAU - .55); c.arc(1.9, -.6, 3.4, TAU - .9, .9, true); c.closePath(); ink();
    } else if (type === 'sky') {
      c.beginPath(); c.moveTo(0, -4.5); c.bezierCurveTo(1.2, -2.4, 3.4, -.2, 3.4, 1.4); c.arc(0, 1.4, 3.4, 0, Math.PI); c.bezierCurveTo(-3.4, -.2, -1.2, -2.4, 0, -4.5); c.closePath(); ink();
    } else {
      c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 2 : 4.6; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + .4); } c.closePath(); ink();
    }
    c.restore();
  }
  const heartBox = r => { const e = r * 1.45 + 3; return [-e, -e, e, e]; };
  // The real heart: art.js's own boss heart (with its glowing core) plus the crystal's forehead gem.
  const realHeart = (kit, r) => [`crystal:heart:real:${r}`, heartBox(r), c => {
    kit.paintTargetPart(c, 'heart', 'crystal', r, true, true);
    facet(c, [[0, -r * .44], [r * .09, -r * .33], [0, -r * .22], [-r * .09, -r * .33]], '#ffe1f0');
    c.beginPath(); c.moveTo(0, -r * .44); c.lineTo(r * .09, -r * .33); c.lineTo(0, -r * .22); c.lineTo(-r * .09, -r * .33); c.closePath(); c.strokeStyle = '#a43c89'; c.lineWidth = 1; c.stroke();
  }];
  // The real heart in the wanted flower's color, its glyph on a badge at the forehead.
  const hueHeart = (kit, r, type) => [`crystal:heart:hue:${type}:${r}`, heartBox(r), c => {
    const F = kit.FLOWERS[type];
    paintGlassHeart(c, r, { light: F.light, base: F.base, mid: kit.shade(F.base, .12), dark: F.dark, top: F.tip, ink: kit.shade(F.dark, .3) });
    kit.circle(c, 0, r * .08, r * .2, F.tip, F.light, 1.2);
    kit.circle(c, 0, -r * .45, 6.4, F.base, '#ffffff', 1.4);
    c.save(); c.translate(0, -r * .45); paintGlyph(c, kit, type, 9); c.restore();
  }];
  // A soft pink aura behind the real heart, painted once (the beat only changes its alpha).
  const heartAura = (kit, r) => [`crystal:aura:${r}`, [-r * 1.7, -r * 1.7, r * 1.7, r * 1.7], c => {
    const g = c.createRadialGradient(0, 0, r * .4, 0, 0, r * 1.65); g.addColorStop(0, 'rgba(255,150,205,.75)'); g.addColorStop(.55, 'rgba(255,160,215,.28)'); g.addColorStop(1, 'rgba(255,170,220,0)');
    c.fillStyle = g; c.fillRect(-r * 1.7, -r * 1.7, r * 3.4, r * 3.4);
  }];
  // A fake: clear frosted glass (no flower's color, so it never passes for the real heart in any hue) with a hollow
  // core and a zig-zag crack, on a matte disc.
  const fakeHeart = (kit, r) => [`crystal:heart:fake:${r}`, heartBox(r), c => {
    c.globalAlpha = .45; kit.circle(c, 0, 0, r + 2.4, CRY.matte); c.globalAlpha = 1;
    paintGlassHeart(c, r, CRY.glass);
    kit.circle(c, 0, r * .08, r * .2, null, CRY.glass.ink, 1.1);
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [color, width] of [[CRY.glass.ink, 2.6], ['#ffffff', 1.2]]) {
      // Across the right lobe, clear of the face.
      c.beginPath(); c.moveTo(r * .95, -r * .46); c.lineTo(r * .64, -r * .38); c.lineTo(r * .76, -r * .2); c.lineTo(r * .5, -r * .12);
      c.moveTo(r * .64, -r * .38); c.lineTo(r * .5, -r * .66);
      c.strokeStyle = color; c.lineWidth = width; c.stroke();
    }
  }];
  // The glint that sweeps a fake: a slanted white bar, drawn clipped to the heart.
  const fakeGlint = r => [`crystal:glint:${r}`, [-5, -r * 1.3, 5, r * 1.3], c => {
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.moveTo(-1.5, -r * 1.3); c.lineTo(4, -r * 1.3); c.lineTo(1.5, r * 1.3); c.lineTo(-4, r * 1.3); c.closePath(); c.fill();
  }];
  // Faces, one sprite per look, centered on the heart.
  function paintEye(c, r, side, { ry = .17, squint = 1, star = false }) {
    c.save(); c.translate(side * r * .26, 0); c.scale(1, squint);
    c.beginPath(); c.ellipse(0, 0, r * .13, r * ry, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = CRY.ink; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.arc(side * -r * .02, r * .03, r * .078, 0, TAU); c.fillStyle = CRY.eye; c.fill();
    c.beginPath(); c.arc(side * -r * .045, -r * .035, r * .03, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    if (star) { c.beginPath(); c.moveTo(r * .02, -r * .1); c.quadraticCurveTo(r * .035, -r * .015, r * .1, 0); c.quadraticCurveTo(r * .035, r * .015, r * .02, r * .1); c.quadraticCurveTo(r * .005, r * .015, -r * .06, 0); c.quadraticCurveTo(r * .005, -r * .015, r * .02, -r * .1); c.fillStyle = '#ffffff'; c.fill(); }
    c.restore();
  }
  function paintCheeks(c, r, color = CRY.cheek) {
    c.save(); c.globalAlpha = .75;
    for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * r * .46, r * .2, r * .11, r * .055, side * -.25, 0, TAU); c.fillStyle = color; c.fill(); }
    c.restore();
  }
  function paintFace(c, r, look) {
    c.translate(0, r * .04); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = CRY.ink;
    const brow = (side, x0, y0, x1, y1, w) => { c.beginPath(); c.moveTo(side * r * x0, r * y0); c.lineTo(side * r * x1, r * y1); c.lineWidth = w; c.strokeStyle = CRY.ink; c.stroke(); };
    if (look === 'hurt') {
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * r * .38, -r * .1); c.lineTo(side * r * .2, 0); c.lineTo(side * r * .38, r * .1); c.lineWidth = 1.8; c.stroke(); }
      paintCheeks(c, r, '#ffb0d1');
      c.beginPath(); c.ellipse(0, r * .34, r * .08, r * .1, 0, 0, TAU); c.fillStyle = CRY.ink; c.fill();
      return;
    }
    if (look === 'blink') {
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * r * .38, r * .02); c.quadraticCurveTo(side * r * .26, r * .1, side * r * .14, r * .02); c.lineWidth = 1.6; c.stroke(); brow(side, .4, -.26, .14, -.18, 1.6); }
      paintCheeks(c, r);
      c.beginPath(); c.arc(0, r * .28, r * .1, .3, Math.PI - .3); c.lineWidth = 1.4; c.stroke();
      return;
    }
    if (look === 'calm') {
      for (const side of [-1, 1]) { paintEye(c, r, side, {}); c.beginPath(); c.moveTo(side * r * .4, -r * .25); c.quadraticCurveTo(side * r * .28, -r * .33, side * r * .15, -r * .27); c.lineWidth = 1.5; c.stroke(); }
      paintCheeks(c, r);
      c.beginPath(); c.arc(0, r * .28, r * .1, .3, Math.PI - .3); c.lineWidth = 1.4; c.stroke();
    } else if (look === 'shining') {
      for (const side of [-1, 1]) { paintEye(c, r, side, { ry: .19, star: true }); brow(side, .4, -.36, .15, -.31, 1.6); }
      paintCheeks(c, r, '#ffb7dc');
      // An open grin with a little pink tongue.
      c.beginPath(); c.moveTo(-r * .15, r * .22); c.quadraticCurveTo(0, r * .5, r * .15, r * .22); c.closePath(); c.fillStyle = CRY.ink; c.fill();
      c.beginPath(); c.ellipse(0, r * .36, r * .07, r * .04, 0, 0, TAU); c.fillStyle = '#ff8fc0'; c.fill();
      // Two little stars of delight beside her.
      for (const [x, y, s] of [[-.82, -.66, .13], [.86, -.58, .1]]) {
        c.save(); c.translate(r * x, r * y); c.beginPath();
        for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, rr = i % 2 ? r * s * .32 : r * s; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = '#ff8cc6'; c.lineWidth = .8; c.stroke(); c.restore();
      }
    } else if (look === 'racing') {
      for (const side of [-1, 1]) { paintEye(c, r, side, { squint: .8 }); brow(side, .43, -.32, .1, -.14, 2.5); }
      paintCheeks(c, r, '#ff8fc0');
      const w = r * .36, h = r * .15, y = r * .22;
      c.beginPath(); c.moveTo(-w / 2 + h * .45, y); c.lineTo(w / 2 - h * .45, y); c.arc(w / 2 - h * .45, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2); c.lineTo(-w / 2 + h * .45, y + h); c.arc(-w / 2 + h * .45, y + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5); c.closePath();
      c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.3; c.stroke();
      c.beginPath(); c.moveTo(-w / 2 + 2, y + h / 2); c.lineTo(w / 2 - 2, y + h / 2); for (const tx of [-w / 6, w / 6]) { c.moveTo(tx, y + 1); c.lineTo(tx, y + h - 1); } c.lineWidth = .8; c.stroke();
      // A bead of sweat at her brow.
      c.beginPath(); c.moveTo(r * .62, -r * .5); c.quadraticCurveTo(r * .72, -r * .34, r * .66, -r * .28); c.arc(r * .62, -r * .3, r * .045, .4, Math.PI + .9); c.closePath();
      c.fillStyle = '#bfe8ff'; c.fill(); c.strokeStyle = '#5a9bd0'; c.lineWidth = .8; c.stroke();
    } else {
      // A fake: one eye half-lidded, the other winking (or both sly), and a lopsided smirk.
      const wink = look === 'wink';
      for (const side of [-1, 1]) {
        if (wink && side > 0) { c.beginPath(); c.moveTo(side * r * .38, r * .02); c.quadraticCurveTo(side * r * .26, -r * .1, side * r * .14, r * .02); c.lineWidth = 1.7; c.strokeStyle = CRY.glass.ink; c.stroke(); continue; }
        paintEye(c, r, side, { ry: .15 });
        c.save(); c.translate(side * r * .26, 0); c.beginPath(); c.ellipse(0, 0, r * .145, r * .165, 0, Math.PI, TAU); c.closePath(); c.fillStyle = CRY.glass.mid; c.fill();
        c.beginPath(); c.moveTo(-r * .14, 0); c.lineTo(r * .14, 0); c.strokeStyle = CRY.glass.ink; c.lineWidth = 1.3; c.stroke(); c.restore();
      }
      paintCheeks(c, r, '#d9b8ff');
      c.beginPath(); c.moveTo(-r * .16, r * .3); c.quadraticCurveTo(r * .02, r * .38, r * .2, r * .2); c.strokeStyle = CRY.glass.ink; c.lineWidth = 1.5; c.stroke();
      c.beginPath(); c.ellipse(r * .1, r * .33, r * .045, r * .035, -.5, 0, TAU); c.fillStyle = '#ff9fc4'; c.fill();
    }
  }
  const heartFace = (r, look) => [`crystal:face:${look}:${r}`, [-r * 1.05, -r * .85, r * 1.05, r * .7], c => paintFace(c, r, look)];
  // Six cut-glass pieces for a shattering (and re-forming) fake.
  const SHARD_SHAPES = [
    [[-4, -4], [5, -2], [0, 5]], [[-5, 0], [3, -5], [4, 3], [-2, 4]], [[-3, -5], [4, 0], [-3, 4]],
    [[-4, -3], [4, -4], [2, 4]], [[-5, -1], [1, -4], [5, 2], [-1, 4]], [[-3, -4], [3, -3], [4, 3], [-4, 2]]
  ];
  const SHARD_TONES = [CRY.glass.light, '#ffd3ec', CRY.glass.base, '#ffffff', '#d6e4ff', CRY.glass.mid];
  const glassPiece = i => [`crystal:piece:${i}`, [-7, -7, 7, 7], c => {
    facet(c, SHARD_SHAPES[i], SHARD_TONES[i]);
    c.lineJoin = 'round'; c.strokeStyle = '#7d89ad'; c.lineWidth = .8; c.stroke();
    c.beginPath(); c.moveTo(SHARD_SHAPES[i][0][0] * .6, SHARD_SHAPES[i][0][1] * .6); c.lineTo(SHARD_SHAPES[i][1][0] * .6, SHARD_SHAPES[i][1][1] * .6); c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.stroke();
  }];
  // The mirror blade, lying along x, its collider's 56 px segment inside; a white copy for the bank flash.
  const bladePath = (c, L) => { const h = L / 2; c.beginPath(); c.moveTo(-h - 2, 0); c.lineTo(-h + 4, -5.5); c.lineTo(h - 4, -5.5); c.lineTo(h + 2, 0); c.lineTo(h - 4, 5.5); c.lineTo(-h + 4, 5.5); c.closePath(); };
  const mirrorBlade = L => [`crystal:mirror:${L}`, [-L / 2 - 5, -9, L / 2 + 5, 9], c => {
    const M = CRY.mirror, h = L / 2; c.lineJoin = 'round'; c.lineCap = 'round';
    bladePath(c, L); c.fillStyle = M.blade; c.fill();
    c.save(); c.clip();
    facet(c, [[-h - 2, 0], [-h + 4, -5.5], [h - 4, -5.5], [h + 2, 0]], M.top);
    facet(c, [[-h - 2, 0], [h + 2, 0], [h - 4, 5.5], [-h + 4, 5.5]], M.low);
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = .9;
    for (const x of [-h * .5, 0, h * .5]) { c.beginPath(); c.moveTo(x - 3, -5.5); c.lineTo(x + 3, 5.5); c.stroke(); }
    c.restore();
    c.beginPath(); c.moveTo(-h + 4, -4.3); c.lineTo(h - 4, -4.3); c.strokeStyle = '#ffffff'; c.lineWidth = 1.4; c.stroke();
    bladePath(c, L); c.strokeStyle = M.ink; c.lineWidth = 1.4; c.stroke();
    facet(c, [[0, -4], [3, 0], [0, 4], [-3, 0]], M.gem); c.strokeStyle = '#a43c89'; c.lineWidth = .8; c.stroke();
    kit0circle(c, -.8, -1.2, .9, '#ffffff');
  }];
  function kit0circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); }
  const mirrorFlash = L => [`crystal:mirror:flash:${L}`, [-L / 2 - 6, -10, L / 2 + 6, 10], c => {
    c.lineJoin = 'round'; bladePath(c, L + 2); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = '#bfe3ff'; c.lineWidth = 2.4; c.stroke();
  }];
  const mirrorGlint = () => ['crystal:mirror:glint', [-4, -6, 4, 6], c => {
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.moveTo(-1, -5.5); c.lineTo(3, -5.5); c.lineTo(1, 5.5); c.lineTo(-3, 5.5); c.closePath(); c.fill();
  }];
  const backOut = k => { k = clamp(k, 0, 1) - 1; return 1 + 2.4 * k * k * k + 1.4 * k * k; };
  function crystalStamp(ctx, kit, [key, box, paint], x, y, turn = 0, sx = 1, sy = sx) { stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy); }
  // A shattering: the six pieces spin out from (x, y) and fall over .55 s, after a white star flash.
  function shatter(ctx, kit, x, y, age, still, quality) {
    if (age < 0 || age >= .6) return;
    if (still) {
      if (age >= .25) return;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + .3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); ctx.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); ctx.stroke(); }
      return;
    }
    if (age < .14) { const k = age / .14; ctx.globalAlpha = 1 - k; kit.sparkle(ctx, x, y, 10 + 22 * k, '#ffffff', .3); kit.circle(ctx, x, y, 8 + 26 * k, null, '#ffffff', 2.5 * (1 - k)); ctx.globalAlpha = 1; }
    const count = quality >= 2 ? 4 : 6;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / 6 + .35, v = 78 + (i % 3) * 22, px = x + Math.cos(a) * v * age, py = y + Math.sin(a) * v * age + 170 * age * age;
      ctx.globalAlpha = 1 - Foe0smooth((age - .3) / .3);
      crystalStamp(ctx, kit, glassPiece(i), px, py, (i % 2 ? 1 : -1) * (5 + i) * age, 1.15);
    }
    ctx.globalAlpha = 1;
  }
  const Foe0smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  kitLook('crystal', {
    warm(kit) {
      const r = 22;
      for (const job of [realHeart(kit, r), heartAura(kit, r), fakeHeart(kit, r), fakeGlint(r), mirrorBlade(56), mirrorFlash(56), mirrorGlint(),
        ...['calm', 'shining', 'racing', 'hurt', 'blink', 'sly', 'wink'].map(look => heartFace(r, look)),
        ...Object.keys(kit.FLOWERS).map(type => hueHeart(kit, r, type)), ...SHARD_SHAPES.map((_, i) => glassPiece(i))]) kit.atlasSprite(job[0], ...job[1], job[2]);
    },
    // The hearts are the kit's own drawing: the real one and the glass fakes.
    part(ctx, state, s, bud, time, still, kit, quality) {
      if (bud.bossPart !== 'heart') return false;
      const r = bud.r || 22, born = time - (Number.isFinite(bud.spawnAt) ? bud.spawnAt : -100);
      // Popping in (the fight's start, a re-form, a shuffle's revival): its pieces fly together, then it overshoots to size.
      const grow = still || born < 0 || born >= .34 ? 1 : backOut(born / .34);
      ctx.translate(bud.x, bud.y);
      if (!still && born >= 0 && born < .22) {
        const k = Foe0smooth(born / .22);
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + .35; ctx.globalAlpha = .4 + .6 * k; crystalStamp(ctx, kit, glassPiece(i), Math.cos(a) * 30 * (1 - k), Math.sin(a) * 30 * (1 - k), (1 - k) * 3); }
        ctx.globalAlpha = 1;
      }
      if (grow <= .02) return true;
      if (!bud.real) {
        // A fake: no beat (its slot bobs it), a glint sweeping it every 2.5 s, and a wink every few seconds.
        ctx.scale(grow, grow);
        crystalStamp(ctx, kit, fakeHeart(kit, r), 0, 0);
        const phase = (time + (bud.slot || 0) * .83) % 2.5;
        if (!still && quality < 2 && phase < .3) {
          ctx.save(); ctx.scale(r, r); heartPath(ctx); ctx.restore(); ctx.save(); ctx.clip();
          crystalStamp(ctx, kit, fakeGlint(r), -r * 1.1 + r * 2.2 * (phase / .3), 0); ctx.restore();
        }
        const wink = !still && (time + (bud.slot || 0) * 1.7) % 3.1 < .38;
        crystalStamp(ctx, kit, heartFace(r, wink ? 'wink' : 'sly'), 0, 0);
        return true;
      }
      const tier = clamp(s.tier || 0, 0, 2), boss = s.boss || {};
      const pulse = still ? 0 : Math.pow(Math.max(0, Math.sin(time * CRY.beat[tier])), 6);
      const hitAge = time - (Number.isFinite(boss.hitAt) ? boss.hitAt : -100), squash = !still && hitAge >= 0 && hitAge < .25 ? Math.sin(hitAge / .25 * Math.PI) : 0;
      ctx.globalAlpha = still ? .5 : .38 + .45 * pulse; crystalStamp(ctx, kit, heartAura(kit, r), 0, 0, 0, grow * (1 + .12 * pulse)); ctx.globalAlpha = 1;
      if (s.hue && kit.FLOWERS[s.hue]) {
        // The wanted color's beaded ring, pulsing at 1.2 Hz.
        const F = kit.FLOWERS[s.hue], k = still ? 0 : Math.sin(time * TAU * 1.2), rr = (r + 8) * (1 + .05 * k);
        ctx.globalAlpha = still ? .95 : .78 + .22 * k;
        kit.circle(ctx, 0, 0, rr, null, '#ffffff', 4.6); kit.circle(ctx, 0, 0, rr, null, F.base, 2.4);
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + (still ? 0 : time * .6); kit.circle(ctx, Math.cos(a) * rr, Math.sin(a) * rr, 2.4, F.light, F.dark, 1); }
        ctx.globalAlpha = 1;
      }
      const beat = grow * (1 + pulse * CRY.beatAmp[tier]);
      ctx.scale(beat * (1 + .12 * squash), beat * (1 - .1 * squash));
      crystalStamp(ctx, kit, s.hue && kit.FLOWERS[s.hue] ? hueHeart(kit, r, s.hue) : realHeart(kit, r), 0, 0);
      const blink = !still && (time + .7) % 3.4 < .12;
      crystalStamp(ctx, kit, heartFace(r, hitAge >= 0 && hitAge < .3 ? 'hurt' : blink ? 'blink' : CRY.moods[tier]), 0, 0);
      return true;
    },
    // A mirror's coming blades show faintly where they will stand, at their first angle.
    under(ctx, state, s, time, still, kit) {
      const w = s.warning;
      if (!w || w.move !== 'mirrors' || !(time < w.until)) return;
      const p = clamp(1 - (w.until - time) / Math.max(.1, w.until - w.at), 0, 1);
      for (const t of w.targets) if (t.role === 'mirror') {
        ctx.globalAlpha = still ? .4 : .2 + .4 * p;
        crystalStamp(ctx, kit, mirrorBlade(56), t.x, t.y, t.x < 210 ? .6 : -.6, still ? 1 : .75 + .25 * p);
      }
      ctx.globalAlpha = 1;
    },
    over(ctx, state, s, time, still, kit, quality) {
      const boss = s.boss || {};
      // Beaten: both fakes burst as she blooms.
      if (boss.bloomed) {
        for (const p of s.parts || []) if (p.bossPart === 'heart' && !p.real) shatter(ctx, kit, p.x, p.y, time - (boss.bloomAt ?? -100), still, quality);
        return;
      }
      for (const p of s.parts || []) if (p.bossPart === 'heart' && p.popped && p.bloomed) shatter(ctx, kit, p.popX ?? p.x, p.popY ?? p.y, time - p.bloomAt, still, quality);
      // Fresh shards leave a short glitter trail from the heart they tumbled out of.
      if (!still && quality < 2) for (const p of state.buds || []) {
        const age = time - (p.spawnAt ?? -100);
        if (!p.bossShard || p.bloomed || !p.shardFrom || age < 0 || age >= .35) continue;
        for (const k of [.3, .55, .8]) { ctx.globalAlpha = (1 - age / .35) * (1 - k * .5); kit.sparkle(ctx, p.shardFrom.x + (p.x - p.shardFrom.x) * k, p.shardFrom.y + (p.y - p.shardFrom.y) * k, 2.6, '#ffffff', k * 2); }
        ctx.globalAlpha = 1;
      }
      for (const m of state.bumpers || []) {
        if (!m.bossMirror) continue;
        const kitAge = Number(s.kitAge) || 0, age = kitAge - m.t0, left = m.kitUntil - kitAge, L = m.length || 56;
        const grow = still ? 1 : age < .35 ? backOut(age / .35) : 1, fade = clamp(left / .45, 0, 1);
        const u = age / 1, k = Math.floor(u), f = u - k;
        ctx.save(); ctx.translate(m.x, m.y); ctx.globalAlpha = fade * (still ? 1 : clamp(age / .12, 0, 1));
        // The turn: two white swooshes at the blade ends show which way it is going.
        if (!still && f >= .8 && age > 0) {
          ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2.4;
          for (const end of [0, Math.PI]) { ctx.beginPath(); ctx.arc(0, 0, L / 2 + 4, m.angle + end - m.dir * .5, m.angle + end, m.dir < 0); ctx.stroke(); }
        }
        ctx.rotate(m.angle); ctx.scale(grow * (.92 + .08 * fade), grow);
        crystalStamp(ctx, kit, mirrorBlade(L), 0, 0);
        // The highlight slides along the blade.
        if (!still && quality < 2) {
          const g = (time * .62 + m.x * .01) % 1, x = (g - .5) * (L - 8);
          ctx.globalAlpha *= .9 * Math.sin(g * Math.PI); crystalStamp(ctx, kit, mirrorGlint(), x, 0); ctx.globalAlpha = fade;
        }
        // A seed banked off it: the blade flashes white.
        const flash = time - (Number.isFinite(m.flashAt) ? m.flashAt : -100);
        if (flash >= 0 && flash < .28) { ctx.globalAlpha = fade * (1 - flash / .28); crystalStamp(ctx, kit, mirrorFlash(L), 0, 0, 0, still ? 1 : 1 + .08 * (1 - flash / .28)); ctx.globalAlpha = fade; }
        ctx.restore();
        // The hold pip: a ring around the pivot gem fills through each .8 s hold and is full while the blade turns.
        if (age >= 0) {
          const fill = f < .8 ? f / .8 : 1;
          ctx.save(); ctx.globalAlpha = fade; ctx.lineCap = 'round';
          kit.circle(ctx, m.x, m.y, 7, null, 'rgba(255,255,255,.9)', 3.4);
          ctx.beginPath(); ctx.arc(m.x, m.y, 7, -Math.PI / 2, -Math.PI / 2 + TAU * fill); ctx.strokeStyle = f < .8 ? '#ff72b2' : '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
        }
      }
    },
    // While the hues are up and the aim guide ends on the real heart, a badge says whether this seed will do.
    aim(ctx, state, s, time, still, kit) {
      const target = state.aim && state.aim.target;
      if (!s.hue || !target || target.bossPart !== 'heart' || !target.real || target.bloomed || !kit.FLOWERS[s.hue]) return;
      const match = state.nextType === s.hue, F = kit.FLOWERS[s.hue], x = target.x + (target.r || 22) * .9, y = target.y + (target.r || 22) * .85;
      kit.circle(ctx, x, y, 8.5, '#ffffff', match ? F.dark : '#8d84a3', 1.8);
      if (match) { ctx.save(); ctx.translate(x, y); paintGlyph(ctx, kit, s.hue, 8.5); ctx.restore(); }
      else { ctx.lineCap = 'round'; ctx.strokeStyle = '#8d84a3'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x - 3.4, y - 3.4); ctx.lineTo(x + 3.4, y + 3.4); ctx.moveTo(x + 3.4, y - 3.4); ctx.lineTo(x - 3.4, y + 3.4); ctx.stroke(); }
    }
  });

  // ── Lantern Lily (Level 5, `lotus`) ──


  root.BloomFoeArt = { define, LOOKS, has, bud, under, over, aim, warm, kitLook, KIT_LOOKS, kits };
})(typeof window !== 'undefined' ? window : globalThis);
