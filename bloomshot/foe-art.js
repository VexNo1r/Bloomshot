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
  // Three dark holes on his row of soil. Before a toss, little antennae peek out of the hole and a dotted arc shows where
  // the rolypoly will land; then it spins out as a ball with its shadow running along the ground, squashes as it touches
  // down and puffs up dust. The carousel's knot is a gnarled ball of roots that shoots a tendril round each flower it
  // grabs, curls a root over it and turns the ring (its tell is the ring itself, dotted, with arrows that way round);
  // snapped, it bursts into wood chips as its tendrils whip back; letting go, it sinks away as the flowers fly. The snare
  // is a thorny root that bursts up across one side of the launcher's fan and shrivels away. His face changes with his
  // mood: Grumpy (heavy brows, a frown), Tangled (wavy brows, crossed eyes, roots knotted round him) and Furious (a steep
  // scowl, a shout, red cheeks, a throbbing anger mark and steam). Animations off keeps every tell as a still mark.
  const RK = { soil: '#3b2a1e', rim: '#6b4a33', lip: '#8a6544', crumb: '#7d5a3c', bark: '#7a5537', dark: '#4f3420', light: '#a67a4c',
    hi: '#9a6a43', outline: '#3e2a1c', ink: '#433329', thorn: '#f1e2b6', dust: '#c9ad82', cream: '#fff6ce', tell: '#b55c67',
    leaf: '#92c36b', leafDark: '#5f8c45', skin: '#c6a473', eye: '#648741', blush: '#e46b4f', anger: '#e0473a', mouth: '#4a2418',
    tongue: '#d9625a', sweat: '#9fdcff', sweatInk: '#3f8fd2', roly: '#4a3d63', nose: '#98754c', noseInk: '#715334' };
  const RK_HOLES = [128, 210, 292], RK_RING = 30, RK_GATHER = .25, RK_SPIN = 1.6, RK_THROW = .3, RK_SNARE = 82;
  const rkRow = s => s.boss.y + (s.boss.r || 24) * .7;
  const rkSmooth = p => { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); };
  const rkOut = p => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
  function rkStroke(c, width, color) { c.lineWidth = width; c.strokeStyle = color; c.stroke(); }
  function paintRkHole(c) {
    c.beginPath(); c.ellipse(0, 1.6, 17.5, 6.8, 0, 0, TAU); c.fillStyle = RK.lip; c.fill();
    c.beginPath(); c.ellipse(0, 0, 15, 5, 0, 0, TAU); c.fillStyle = RK.soil; c.fill(); rkStroke(c, 2, RK.rim);
    c.beginPath(); c.ellipse(0, -.6, 10.5, 2.4, 0, Math.PI * 1.05, Math.PI * 1.95); rkStroke(c, 1.2, '#5a4030');
    for (const [x, y, r] of [[-16.5, 3.4, 1.5], [15.8, 4.2, 1.3], [-9, 6.4, 1.1], [11.5, -4.8, .9], [4, 6.9, .9]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = RK.crumb; c.fill(); }
    // A tuft of grass at the hole's edge.
    c.lineCap = 'round';
    for (const [x, a] of [[-12, -.5], [-10.5, -.1], [-9, .35]]) { c.beginPath(); c.moveTo(x, -3.5); c.quadraticCurveTo(x + Math.sin(a) * 2, -7, x + Math.sin(a) * 4, -9.5); rkStroke(c, 1.3, RK.leafDark); }
  }
  // A gnarled ball of roots: stubby roots twisting out, two twisted bands, a swirl and a highlight; cracked after one hit.
  function paintRkKnot(c, r, cracked) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + .3;
      c.beginPath(); c.moveTo(Math.cos(a) * r * .55, Math.sin(a) * r * .55);
      c.quadraticCurveTo(Math.cos(a + .55) * r * 1.2, Math.sin(a + .55) * r * 1.2, Math.cos(a + .3) * r * 1.48, Math.sin(a + .3) * r * 1.48);
      rkStroke(c, 3.6, RK.outline); rkStroke(c, 2, i % 2 ? RK.bark : RK.hi);
    }
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = RK.bark; c.fill(); rkStroke(c, 1.7, RK.outline);
    c.save(); c.beginPath(); c.arc(0, 0, r - .8, 0, TAU); c.clip();
    for (const k of [-1, 1]) { c.beginPath(); c.ellipse(0, 0, r * .95, r * .4, k * .75, 0, TAU); rkStroke(c, 1.5, RK.dark); }
    c.beginPath(); c.arc(-r * .3, -r * .35, r * .55, Math.PI * 1.05, Math.PI * 1.7); rkStroke(c, 1.6, RK.light);
    c.restore();
    // The heart of the knot: a little swirl.
    c.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU * 1.4, d = r * (.08 + .3 * i / 24); if (i) c.lineTo(Math.cos(a) * d, Math.sin(a) * d); else c.moveTo(Math.cos(a) * d, Math.sin(a) * d); }
    rkStroke(c, 1.3, RK.dark);
    if (cracked) {
      c.beginPath(); c.moveTo(-r * .75, -r * .2); c.lineTo(-r * .3, r * .05); c.lineTo(-r * .05, -r * .3); c.lineTo(r * .3, r * .1); c.lineTo(r * .7, -r * .1);
      rkStroke(c, 2.4, RK.cream); rkStroke(c, 1, RK.outline);
    }
  }
  function paintRkChip(c) {
    c.beginPath(); c.moveTo(-3.5, -1.5); c.lineTo(-.5, -3); c.lineTo(3.6, -1); c.lineTo(2, 2.6); c.lineTo(-2.6, 2); c.closePath();
    c.fillStyle = RK.light; c.fill(); c.lineJoin = 'round'; rkStroke(c, 1, RK.outline);
    c.beginPath(); c.moveTo(-2, 0); c.lineTo(2, -.6); rkStroke(c, .8, RK.dark);
  }
  function paintRkLeaf(c) {
    c.beginPath(); c.moveTo(-4, 0); c.quadraticCurveTo(0, -3.6, 4.2, 0); c.quadraticCurveTo(0, 3.6, -4, 0); c.closePath();
    c.fillStyle = RK.leaf; c.fill(); c.lineJoin = 'round'; rkStroke(c, .9, RK.leafDark);
    c.beginPath(); c.moveTo(-3, 0); c.lineTo(3, 0); rkStroke(c, .6, RK.leafDark);
  }
  // The snare: a thick root along its collider (x from -41 to 41), arched a little away from the launcher, its ends
  // diving into dirt mounds, six cream-tipped thorns and a sprouting leaf.
  function paintRkSnare(c) {
    const h = RK_SNARE / 2;
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const x of [-h, h]) { c.beginPath(); c.ellipse(x, 3, 8.5, 4.2, 0, 0, TAU); c.fillStyle = RK.lip; c.fill(); rkStroke(c, 1.2, RK.rim); }
    const arch = () => { c.beginPath(); c.moveTo(-h, 1); c.bezierCurveTo(-h * .5, -5, h * .5, -5, h, 1); };
    arch(); rkStroke(c, 10, RK.outline); arch(); rkStroke(c, 7, RK.rim);
    c.beginPath(); c.moveTo(-h + 4, -1.6); c.bezierCurveTo(-h * .5, -6.6, h * .5, -6.6, h - 4, -1.6); rkStroke(c, 1.8, RK.hi);
    // Bark rings.
    for (let i = -2; i <= 2; i++) { const x = i * h / 3, y = -3.6 + Math.abs(i) * .7; c.beginPath(); c.moveTo(x - 1.2, y - 2.6); c.quadraticCurveTo(x + 1.4, y, x - 1.2, y + 2.8); rkStroke(c, 1, RK.dark); }
    // Thorns, alternating sides along the arch.
    for (let i = 0; i < 6; i++) {
      const x = -h + 9 + i * (2 * h - 18) / 5, y = -3.4 + Math.abs(x) / h * 2.4, side = i % 2 ? 1 : -1, base = y + side * 3.2;
      c.beginPath(); c.moveTo(x - 2.6, base); c.lineTo(x + side * .8, base + side * 6.4); c.lineTo(x + 2.6, base); c.closePath();
      c.fillStyle = RK.thorn; c.fill(); rkStroke(c, 1, RK.outline);
    }
    c.save(); c.translate(-h * .25, -6.2); c.rotate(-.7); paintRkLeaf(c); c.restore();
  }
  // Rootknot's three moods, painted around the face's middle (r is his radius). variant: open, blink or hurt.
  function paintRkFace(c, r, tier, variant) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const ink = RK.ink;
    // Cheeks: soft on Grumpy and Tangled, a hot flush when Furious.
    for (const side of [-1, 1]) {
      c.beginPath(); c.ellipse(side * r * .45, r * .21, r * .12, r * .06, side * -.25, 0, TAU);
      c.globalAlpha = tier === 2 ? .75 : .55; c.fillStyle = tier === 2 ? RK.blush : '#e6a28e'; c.fill(); c.globalAlpha = 1;
    }
    for (const side of [-1, 1]) {
      const ex = side * r * .26;
      if (variant === 'hurt') { c.beginPath(); c.moveTo(ex - side * r * .1, -r * .09); c.lineTo(ex + side * r * .06, 0); c.lineTo(ex - side * r * .1, r * .09); rkStroke(c, 1.8, ink); continue; }
      if (variant === 'blink') { c.beginPath(); c.moveTo(ex - r * .12, r * .01); c.quadraticCurveTo(ex, r * .07, ex + r * .12, r * .01); rkStroke(c, 1.6, ink); continue; }
      const rx = r * .13, ry = tier === 2 ? r * .11 : tier === 1 ? r * .17 : r * .15;
      c.save(); c.beginPath(); c.ellipse(ex, 0, rx, ry, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.clip();
      const [px, py, pr] = tier === 1 ? [side < 0 ? r * .05 : -r * .03, side < 0 ? -r * .04 : r * .05, r * .065] : tier === 2 ? [-side * r * .03, r * .01, r * .06] : [0, r * .045, r * .075];
      c.beginPath(); c.arc(ex + px, py, pr, 0, TAU); c.fillStyle = RK.eye; c.fill();
      c.beginPath(); c.arc(ex + px - pr * .35, py - pr * .4, pr * .38, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      // Lids: heavy and flat when Grumpy, slanting down to the middle when Furious.
      if (tier !== 1) {
        c.beginPath();
        if (tier === 0) { c.rect(ex - rx - 1, -ry - 1, rx * 2 + 2, ry * .72); }
        else { c.moveTo(ex - rx - 1, -ry - 1); c.lineTo(ex + rx + 1, -ry - 1); c.lineTo(ex + side * (rx + 1), -ry * .5 - side * ry * .55); c.lineTo(ex - side * (rx + 1), -ry - 1 + ry * .25); c.closePath(); }
        c.fillStyle = RK.skin; c.fill();
      }
      c.restore();
      c.beginPath(); c.ellipse(ex, 0, rx, ry, 0, 0, TAU); rkStroke(c, 1.2, ink);
      if (tier === 0) { c.beginPath(); c.moveTo(ex - rx, -ry * .28); c.lineTo(ex + rx, -ry * .28); rkStroke(c, 1.3, ink); }
    }
    // Brows.
    for (const side of [-1, 1]) {
      c.beginPath();
      if (tier === 0) { c.moveTo(side * r * .45, -r * .27); c.lineTo(side * r * .1, -r * .16); rkStroke(c, 2.9, ink); }
      else if (tier === 1) {
        for (let i = 0; i <= 8; i++) { const k = i / 8, x = side * r * (.44 - .32 * k), y = -r * (.31 + .04 * k) + Math.sin(k * Math.PI * 3) * r * .03; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        rkStroke(c, 2.1, ink);
      } else { c.moveTo(side * r * .46, -r * .37); c.lineTo(side * r * .07, -r * .12); rkStroke(c, 3.5, ink); }
    }
    // Grumpy's knitted wrinkles between the brows.
    if (tier === 0) for (const x of [-r * .035, r * .035]) { c.beginPath(); c.moveTo(x, -r * .25); c.lineTo(x, -r * .17); rkStroke(c, 1, ink); }
    // His knobbly nose.
    c.beginPath(); c.ellipse(0, r * .17, r * .095, r * .13, 0, 0, TAU); c.fillStyle = RK.nose; c.fill(); rkStroke(c, 1, RK.noseInk);
    // The mouth.
    if (variant === 'hurt') { c.beginPath(); c.ellipse(0, r * .43, r * .06, r * .07, 0, 0, TAU); c.fillStyle = RK.mouth; c.fill(); rkStroke(c, 1.2, ink); }
    else if (tier === 0) { c.beginPath(); c.arc(0, r * .52, r * .16, Math.PI + .55, -.55); rkStroke(c, 1.8, ink); }
    else if (tier === 1) {
      c.beginPath(); for (let i = 0; i <= 12; i++) { const k = i / 12, x = -r * .18 + k * r * .36, y = r * .42 + Math.sin(k * Math.PI * 4) * r * .035; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      rkStroke(c, 1.7, ink);
      // A drop of worry on his brow.
      const x = r * .52, y = -r * .32, d = r * .075;
      c.beginPath(); c.moveTo(x, y - d * 1.9); c.bezierCurveTo(x + d, y - d * .4, x + d, y + d, x, y + d); c.bezierCurveTo(x - d, y + d, x - d, y - d * .4, x, y - d * 1.9); c.closePath();
      c.fillStyle = RK.sweat; c.fill(); rkStroke(c, .9, RK.sweatInk);
    } else {
      const w = r * .36, h = r * .19, y = r * .33;
      c.beginPath(); c.moveTo(-w / 2, y); c.lineTo(w / 2, y); c.quadraticCurveTo(w / 2, y + h, 0, y + h); c.quadraticCurveTo(-w / 2, y + h, -w / 2, y); c.closePath();
      c.fillStyle = RK.mouth; c.fill();
      c.save(); c.clip();
      c.beginPath(); c.ellipse(0, y + h * .95, w * .28, h * .3, 0, 0, TAU); c.fillStyle = RK.tongue; c.fill();
      // A row of teeth along the top, zig-zag at the bottom.
      c.beginPath(); c.moveTo(-w / 2, y - 1); c.lineTo(w / 2, y - 1);
      for (let j = 0; j <= 4; j++) c.lineTo(w / 2 - w * j / 4, y + h * (j % 2 ? .42 : .26));
      c.closePath(); c.fillStyle = '#ffffff'; c.fill();
      c.restore();
      c.beginPath(); c.moveTo(-w / 2, y); c.lineTo(w / 2, y); c.quadraticCurveTo(w / 2, y + h, 0, y + h); c.quadraticCurveTo(-w / 2, y + h, -w / 2, y); c.closePath(); rkStroke(c, 1.3, ink);
    }
  }
  // Tangled: two roots wrapped round his middle and a curl knotted on his head.
  function paintRkTangle(c, r) {
    c.lineCap = 'round';
    for (const [rot, rx, ry, y] of [[.32, 1.08, .36, .62], [-.36, 1.04, .32, .7]]) {
      c.save(); c.translate(0, r * y); c.rotate(rot); c.beginPath(); c.ellipse(0, 0, r * rx, r * ry, 0, .12, Math.PI - .12);
      rkStroke(c, 3.6, RK.outline); rkStroke(c, 2.1, '#8b6a3e'); c.restore();
    }
    c.beginPath(); c.moveTo(r * .1, -r * .9); c.bezierCurveTo(r * .2, -r * 1.35, r * .62, -r * 1.25, r * .5, -r * 1.02);
    c.bezierCurveTo(r * .4, -r * .86, r * .22, -r * 1.06, r * .36, -r * 1.22);
    rkStroke(c, 3.2, RK.outline); rkStroke(c, 1.8, '#8b6a3e');
    c.save(); c.translate(r * .9, r * .62); c.rotate(.5); paintRkLeaf(c); c.restore();
    c.save(); c.translate(-r * .95, r * .78); c.rotate(-2.4); paintRkLeaf(c); c.restore();
  }
  // Furious's anger mark: four curved brackets round a point.
  function paintRkAnger(c) {
    c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2); c.beginPath(); c.arc(3.4, 3.4, 2.7, Math.PI, Math.PI * 1.5); rkStroke(c, 3.2, '#ffffff'); rkStroke(c, 1.7, RK.anger); c.restore(); }
  }
  const rkSprite = {
    hole: () => [`kit:root:hole`, [-19, -11, 19, 9], paintRkHole],
    knot: (r, cracked) => [`kit:root:knot:${r}:${cracked ? 'cracked' : 'whole'}`, [-r * 1.6, -r * 1.6, r * 1.6, r * 1.6], c => paintRkKnot(c, r, cracked)],
    chip: () => [`kit:root:chip`, [-5, -5, 5, 5], paintRkChip],
    leaf: () => [`kit:root:leaf`, [-5, -5, 5, 5], paintRkLeaf],
    snare: () => [`kit:root:snare`, [-RK_SNARE / 2 - 10, -16, RK_SNARE / 2 + 10, 12], paintRkSnare],
    face: (r, tier, variant) => [`kit:root:face:${r}:${tier}:${variant}`, [-r * .62, -r * .62, r * .62, r * .66], c => paintRkFace(c, r, tier, variant)],
    tangle: r => [`kit:root:tangle:${r}`, [-r * 1.35, -r * 1.45, r * 1.35, r * 1.2], c => paintRkTangle(c, r)],
    anger: () => [`kit:root:anger`, [-8, -8, 8, 8], paintRkAnger]
  };
  const rkStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  // A rolypoly ball in flight, drawn by the Rolypoly's own look (rolled up, spun by `spin`).
  function rkBall(ctx, state, kit, x, y, spin, time, still, quality) {
    if (!LOOKS.rolypoly) { kit.circle(ctx, x, y, 12, '#b9a8d6', RK.roly, 1.4); return; }
    bud(ctx, { foe: 'rolypoly', x, y, r: 12, born: 0, roll: { done: true, dist: spin * 12, dx: 1, dy: 0, bumpAt: -100, nx: 0, ny: 1, t0: 0 } }, time, still, state, kit, quality);
  }
  // A tendril of root from the knot to a flower, bent back against the turn.
  function rkTendril(ctx, ax, ay, bx, by, lag) {
    const mx = (ax + bx) / 2 - ax, my = (ay + by) / 2 - ay, cs = Math.cos(-lag), sn = Math.sin(-lag);
    const path = () => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + mx * cs - my * sn, ay + mx * sn + my * cs, bx, by); };
    path(); rkStroke(ctx, 4.8, RK.outline); path(); rkStroke(ctx, 3, RK.bark);
    ctx.globalAlpha *= .8; path(); rkStroke(ctx, 1, RK.light); ctx.globalAlpha /= .8;
  }
  const rkTossTell = s => (s.warning && /^toss/.test(s.warning.move) ? s.warning.targets.filter(t => t.role === 'toss') : []);
  kitLook('root', {
    warm(kit) {
      for (const make of [rkSprite.hole(), rkSprite.knot(10, false), rkSprite.knot(10, true), rkSprite.chip(), rkSprite.leaf(), rkSprite.snare(), rkSprite.tangle(24), rkSprite.anger()]) kit.atlasSprite(make[0], ...make[1], make[2]);
      for (let tier = 0; tier < 3; tier++) for (const v of ['open', 'blink', 'hurt']) { const [key, box, paint] = rkSprite.face(24, tier, v); kit.atlasSprite(key, ...box, paint); }
      if (LOOKS.rolypoly && LOOKS.rolypoly.warm) LOOKS.rolypoly.warm(kit, 12);
    },
    under(ctx, state, s, time, still, kit, quality) {
      if (!s.boss || s.boss.bloomed) return;
      const row = rkRow(s), tells = rkTossTell(s), clock = s.kitAge;
      // The holes, one jiggling with antennae peeking out when a rolypoly is about to come out of it.
      for (const x of RK_HOLES) {
        const tell = tells.some(t => t.fromX === x), jig = tell && !still ? Math.sin(time * 38) * 1.1 : 0;
        if (tell) {
          ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = RK.roly; ctx.lineWidth = 1.5;
          for (const side of [-1, 1]) {
            const wag = still ? 0 : Math.sin(time * 9 + side) * 2.2, tx = x + side * 5 + wag, ty = row - 11;
            ctx.beginPath(); ctx.moveTo(x + side * 2.5, row - 1); ctx.quadraticCurveTo(x + side * 3, row - 7, tx, ty); ctx.stroke();
            kit.circle(ctx, tx, ty, 1.6, RK.roly);
          }
          ctx.restore();
        }
        rkStamp(ctx, kit, rkSprite.hole(), x + jig, row);
      }
      // Where a tossed rolypoly has just landed, a ring of dust spreads along the ground.
      if (!still) for (const p of state.buds) {
        if (!p.rootToss || p.kitLandAt == null) continue;
        const age = clock - p.kitLandAt; if (age < 0 || age > .4) continue;
        const e = rkOut(age / .4);
        ctx.save(); ctx.globalAlpha = .55 * (1 - age / .4);
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 9, 9 + 17 * e, 3 + 4 * e, 0, 0, TAU); rkStroke(ctx, 2.2 - e, RK.dust);
        if (quality === 0) for (const side of [-1, 1]) for (let k = 0; k < 2; k++) kit.circle(ctx, p.x + side * (8 + 20 * e + k * 5), p.y + 9 - 3 * k * e, 2.4 - k * .6, RK.dust);
        ctx.restore();
      }
      // The carousel: a tendril from the knot to each flower it carries (they shoot out over its first quarter second).
      const knot = s.parts.find(p => p.bossPart === 'knot' && !p.bloomed && !p.closed);
      if (knot) {
        const reach = still ? 1 : rkOut((clock - knot.born) / RK_GATHER), lag = still ? .2 : .35;
        for (const p of s.carried) if (p.carried && p.carried.knot === knot.id) rkTendril(ctx, knot.x, knot.y, knot.x + (p.x - knot.x) * reach, knot.y + (p.y - knot.y) * reach, lag);
      }
      // Letting go: the tendrils whip back into the knot as it sinks away and the flowers fly.
      for (const p of s.carried) {
        const c = p.carried; if (!c || !(clock > c.until) || c.knot == null) continue;
        const e = rkSmooth((clock - c.until) / RK_THROW); if (e >= 1) continue;
        const kx = c.cx, ky = c.cy + c.sink * (c.until - c.t0);
        ctx.save(); ctx.globalAlpha *= 1 - e; rkTendril(ctx, kx, ky, kx + (p.x - kx) * (1 - e), ky + (p.y - ky) * (1 - e), -.5 * e); ctx.restore();
      }
    },
    part(ctx, state, s, piece, time, still, kit) {
      if (piece.bossPart !== 'knot') return false;
      const age = s.kitAge - (piece.born || 0), pop = still ? 1 : 1 + .25 * Math.sin(Math.PI * clamp(age / .3, 0, 1)) * (1 - clamp(age / .3, 0, 1));
      const turn = still ? 0 : RK_SPIN * Math.max(0, age - RK_GATHER) + Math.sin(time * 3) * .08, pulse = still ? 1 : 1 + Math.sin(time * 6.5) * .05;
      const r = piece.r || 10, x = piece.x, y = piece.y;
      // The ring it turns, faintly, and a dashed cream target ring that says: shoot here.
      ctx.save(); ctx.globalAlpha *= .3; ctx.beginPath(); ctx.arc(x, y, RK_RING, 0, TAU); rkStroke(ctx, 1.4, RK.bark); ctx.restore();
      ctx.save(); ctx.setLineDash([4, 3]); ctx.lineDashOffset = still ? 0 : -time * 14;
      ctx.beginPath(); ctx.arc(x, y, (r + 6) * pulse, 0, TAU); rkStroke(ctx, 3.2, RK.cream); rkStroke(ctx, 1.3, RK.tell); ctx.restore();
      rkStamp(ctx, kit, rkSprite.knot(r, piece.hp < piece.maxHp), x, y, turn, pop);
      // Its two hits, as pips below it.
      for (let i = 0; i < (piece.maxHp || 2); i++) kit.circle(ctx, x + (i - ((piece.maxHp || 2) - 1) / 2) * 6, y + r + 9, 2.2, i < piece.hp ? '#fff4c5' : 'rgba(255,255,255,.3)', RK.outline, .9);
      return true;
    },
    face(ctx, state, s, boss, time, still, kit, quality) {
      if (!boss.boss) return false;
      const r = boss.r || 24, tier = clamp(s.tier || 0, 0, 2), w = s.warning;
      // The same lean his body takes while he winds up a move, and the shiver near the end, so the face stays on him.
      ctx.translate(boss.x, boss.y);
      if (!still && w && Number.isFinite(w.until) && time < w.until) ctx.rotate(-.07);
      if (!still && boss.hp / Math.max(1, boss.maxHp) <= .2) ctx.rotate(Math.sin(time * TAU * 6) * .04);
      if (tier >= 1) rkStamp(ctx, kit, rkSprite.tangle(r), 0, 0);
      const hurt = Boolean(boss.bloomed) || (typeof boss.hitAt === 'number' && time - boss.hitAt >= 0 && time - boss.hitAt < .3), blink = !still && time % 3.4 < .12;
      rkStamp(ctx, kit, rkSprite.face(r, tier, hurt ? 'hurt' : blink ? 'blink' : 'open'), 0, r * .14);
      if (tier === 2) {
        const throb = still ? 1 : 1 + Math.max(0, Math.sin(time * 7)) * .22;
        rkStamp(ctx, kit, rkSprite.anger(), r * .62, -r * .6, 0, throb);
        // Steam puffs off his head.
        if (!still && quality <= 1) for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
          const ph = (time * .9 + k * .5 + (side > 0 ? .25 : 0)) % 1;
          ctx.globalAlpha = .55 * Math.sin(Math.PI * ph); kit.circle(ctx, side * (r * .55 + ph * 6), -r * .95 - ph * 14, 2.4 + ph * 3.2, '#ffffff');
        }
        ctx.globalAlpha = 1;
      }
      return true;
    },
    over(ctx, state, s, time, still, kit, quality) {
      if (!s.boss || s.boss.bloomed) return;
      const clock = s.kitAge, row = rkRow(s), w = s.warning;
      // Toss tells: a dotted arc from the hole to the landing mark, marching that way.
      for (const t of rkTossTell(s)) {
        const pts = []; for (let i = 0; i <= 16; i++) { const p = lobAt(t.fromX, row, t.x, t.y, .6, .6 * i / 16, 48); pts.push([p.x, p.y]); }
        dotted(ctx, pts, RK.rim, 1.9, 7, still ? 0 : -time * 16);
      }
      // A carousel tell: the ring itself, dotted, with arrows the way it will turn.
      if (w && w.move === 'carousel') {
        const mark = w.targets.find(t => t.role === 'knot');
        if (mark) {
          const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU; pts.push([mark.x + Math.cos(a) * RK_RING, mark.y + Math.sin(a) * RK_RING]); }
          dotted(ctx, pts, RK.bark, 1.6, 7, still ? 0 : time * RK_SPIN * RK_RING);
          const spin = still ? -.6 : time * RK_SPIN;
          for (const k of [0, Math.PI]) {
            const a = spin + k, ax = mark.x + Math.cos(a) * RK_RING, ay = mark.y + Math.sin(a) * RK_RING;
            ctx.save(); ctx.translate(ax, ay); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -4.2); ctx.lineTo(-3, 4.2); ctx.closePath();
            ctx.lineJoin = 'round'; rkStroke(ctx, 2.4, RK.cream); ctx.fillStyle = RK.bark; ctx.fill(); ctx.restore();
          }
        }
      }
      // A snare tell: its exact line, dashed.
      if (w && w.move === 'snare') for (const t of w.targets.filter(t => t.role === 'snare')) {
        const a = t.side ? .6109 : -.6109, h = RK_SNARE / 2, dx = Math.cos(a) * h, dy = Math.sin(a) * h;
        ctx.save(); ctx.setLineDash([6, 6]); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(t.x - dx, t.y - dy); ctx.lineTo(t.x + dx, t.y + dy);
        rkStroke(ctx, 4, RK.cream); rkStroke(ctx, 2, RK.tell); ctx.restore();
      }
      // Rolypolies in flight: dirt sprays out of the hole, a shadow runs along the ground, the ball spins along its arc
      // (stretched as it leaves) and squashes as it touches down.
      for (const l of s.lobs) {
        if (l.look !== 'rolypoly') continue;
        const t = clock - l.t0, u = clamp(t / l.T, 0, 1), p = lobAt(l.x0, l.y0, l.x1, l.y1, l.T, t, l.h || 40);
        if (!still && t < .3) {
          const k = t / .3, n = quality === 0 ? 5 : quality === 1 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i - (n - 1) / 2) * .45, v = 70 + (i % 2) * 22;
            ctx.globalAlpha = 1 - k; kit.circle(ctx, l.x0 + Math.cos(a) * v * t, l.y0 + Math.sin(a) * v * t + 240 * t * t, 1.8 + (i % 2) * .6, RK.lip);
          }
          ctx.globalAlpha = 1;
        }
        const gx = l.x0 + (l.x1 - l.x0) * u, gy = l.y0 + (l.y1 - l.y0) * u + 10, height = Math.max(0, gy - 10 - p.y);
        ctx.save(); ctx.globalAlpha = .28 * (1 - clamp(height / 70, 0, .65)); ctx.beginPath(); ctx.ellipse(gx, gy, Math.max(3, 10 - height * .07), 3, 0, 0, TAU); ctx.fillStyle = RK.soil; ctx.fill(); ctx.restore();
        const dir = Math.sign(l.x1 - l.x0) || 1, land = clamp((u - .86) / .14, 0, 1), leave = clamp(1 - u / .14, 0, 1);
        const sx = still ? 1 : 1 + .2 * land - .1 * leave, sy = still ? 1 : 1 - .22 * land + .14 * leave;
        ctx.save(); ctx.translate(p.x, p.y + 12 * (1 - sy)); ctx.scale(sx, sy); rkBall(ctx, state, kit, 0, 0, still ? 0 : dir * u * 9, time, still, quality); ctx.restore();
      }
      // A thump: three little impact strokes over a rolypoly that has just landed.
      if (!still) for (const p of state.buds) {
        if (!p.rootToss || p.kitLandAt == null || p.bloomed) continue;
        const age = clock - p.kitLandAt; if (age < 0 || age > .22) continue;
        ctx.save(); ctx.globalAlpha = 1 - age / .22; ctx.lineCap = 'round';
        for (const a of [-2.2, -Math.PI / 2, -.94]) { const d0 = 15 + age * 30, d1 = d0 + 5; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * d0, p.y + Math.sin(a) * d0); ctx.lineTo(p.x + Math.cos(a) * d1, p.y + Math.sin(a) * d1); rkStroke(ctx, 2, RK.rim); }
        ctx.restore();
      }
      // Each carried flower wears a curl of root (it reads as grabbed even with Animations off).
      const knot = s.parts.find(p => p.bossPart === 'knot' && !p.bloomed && !p.closed);
      if (knot) for (const p of s.carried) {
        if (!p.carried || p.carried.knot !== knot.id || p.bloomed) continue;
        const a = Math.atan2(knot.y - p.y, knot.x - p.x), rr = (p.r || 11) + 1.5;
        ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(p.x, p.y, rr, a - .95, a + .95); rkStroke(ctx, 3.6, RK.outline); ctx.beginPath(); ctx.arc(p.x, p.y, rr, a - .95, a + .95); rkStroke(ctx, 2, RK.bark);
        rkStamp(ctx, kit, rkSprite.leaf(), p.x + Math.cos(a + .95) * rr, p.y + Math.sin(a + .95) * rr, a + 2.4, .8); ctx.restore();
      }
      // Letting go: the knot sinks back into the soil as the flowers fly, with a streak behind each.
      const thrown = s.carried.filter(p => p.carried && p.carried.knot != null && clock > p.carried.until);
      if (thrown.length && !still) {
        const c = thrown[0].carried, e = rkSmooth((clock - c.until) / RK_THROW);
        if (e < 1) {
          rkStamp(ctx, kit, rkSprite.knot(10, false), c.cx, c.cy + c.sink * (c.until - c.t0) + 6 * e, (clock - c.until) * 14, 1 - e);
          if (quality <= 1) for (const p of thrown) {
            const ring = { a: Math.atan2(p.y - c.cy - c.sink * (c.until - c.t0), p.x - c.cx) };
            ctx.save(); ctx.globalAlpha = .5 * (1 - e); ctx.lineCap = 'round';
            for (const off of [-4, 4]) { const nx = -Math.sin(ring.a) * off, ny = Math.cos(ring.a) * off; ctx.beginPath(); ctx.moveTo(p.x + nx - Math.cos(ring.a) * 14, p.y + ny - Math.sin(ring.a) * 14); ctx.lineTo(p.x + nx - Math.cos(ring.a) * 26, p.y + ny - Math.sin(ring.a) * 26); rkStroke(ctx, 1.6, '#ffffff'); }
            ctx.restore();
          }
        }
      }
      // Snap! The knot bursts into wood chips, its tendrils whip back and a cream flash rings out.
      for (const k of s.parts) {
        if (k.bossPart !== 'knot' || k.snappedAt == null) continue;
        const age = clock - k.snappedAt; if (age < 0 || age > .5) continue;
        const e = rkOut(age / .5);
        if (!still) {
          ctx.save(); ctx.globalAlpha = 1 - e; ctx.beginPath(); ctx.arc(k.x, k.y, 10 + 30 * e, 0, TAU); rkStroke(ctx, 3 * (1 - e) + .5, RK.cream); ctx.restore();
          for (const end of k.ends || []) { const f = rkSmooth(age / .18); if (f >= 1) continue; ctx.save(); ctx.globalAlpha = 1 - f; rkTendril(ctx, k.x, k.y, end.x + (k.x - end.x) * f, end.y + (k.y - end.y) * f, .6 * f); ctx.restore(); }
          for (let i = 0; i < (quality === 2 ? 3 : 6); i++) {
            const a = i * TAU / 6 + .4, v = 85 + (i % 3) * 18;
            ctx.save(); ctx.globalAlpha = 1 - age / .5; rkStamp(ctx, kit, rkSprite.chip(), k.x + Math.cos(a) * v * age, k.y + Math.sin(a) * v * age + 260 * age * age, age * (i % 2 ? 9 : -9)); ctx.restore();
          }
        }
      }
      // The snare: bursts up out of the soil over .25 s (overshooting a little) and shrivels through its last .3 s.
      for (const b of state.bumpers || []) {
        if (!b.bossSnare) continue;
        const grow = still ? 1 : kit.easeBack(clamp((clock - b.kitAt) / .25, 0, 1)), wither = clamp((b.kitUntil - clock) / .3, 0, 1);
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle); ctx.globalAlpha *= .35 + .65 * wither;
        ctx.translate(0, (1 - wither) * 3); rkStamp(ctx, kit, rkSprite.snare(), 0, 0, 0, Math.max(.05, grow), Math.max(.05, Math.min(1.1, grow) * (.55 + .45 * wither)));
        ctx.restore();
      }
    }
  });

  // ── Mother Morel (Level 3, `puff`) ──

  // ── Crystal Heart (Level 4, `crystal`) ──

  // ── Lantern Lily (Level 5, `lotus`) ──


  root.BloomFoeArt = { define, LOOKS, has, bud, under, over, aim, warm, kitLook, KIT_LOOKS, kits };
})(typeof window !== 'undefined' ? window : globalThis);
