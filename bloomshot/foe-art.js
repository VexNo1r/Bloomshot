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
  // A fibbing mushroom that dares you to shoot it: a lilac party-hat cone with three white zig-zag stripes, on a cream
  // stem with a sly face (one eye open, one winking, a pink tongue stuck out). It wears the decoy grammar, so it never
  // reads as a target: a matte grey disc instead of the glossy jewel, no breathing, a slow +-6 degree rock on its stem
  // over 4 s, and a white glint bar sweeping its cap every 2.5 s (6 cached frames). Shot, it sneezes from its own record
  // on the foe clock (game.sneezes, so a Lullaby holds it too): "ah-" (it stretches tall, eyes squeezed, mouth open),
  // "CHOO!" (a .08 s 1.2 x .8 squash), then a gust ring, striped confetti, wind streaks behind every bud it blows away and
  // a comic "Achoo!". Animations off: no rock or glint; the sneeze shows its CHOO face, a still ring and the word.
  const FIB = { cap: '#b58be0', shade: '#9469c9', light: '#d6bdf3', gill: '#7f58b3', stripe: '#fff7ff', stem: '#efe2d0', stemShade: '#dccbb2',
    ink: '#5a3b78', eye: '#2a1a3d', tongue: '#ff7aa0', disc: '#cfc6d8', gust: '#c9a6f5', word: '#7b52e6' };
  const FIB_BOX = r => [-r * 1.34, -r * 1.64, r * 1.34, r * 1.34];
  const FIB_PIVOT = 14;
  function fibCapPath(c, k) {
    c.beginPath();
    c.moveTo(-13 * k, 3 * k);
    c.bezierCurveTo(-11 * k, -6 * k, -5.5 * k, -14 * k, .6 * k, -17.6 * k);
    c.bezierCurveTo(6 * k, -14 * k, 11 * k, -6 * k, 13 * k, 3 * k);
    c.quadraticCurveTo(0, 7.6 * k, -13 * k, 3 * k);
    c.closePath();
  }
  // face: 'wink' (on the board), 'ah' (winding up a sneeze) or 'choo' (sneezing). disc: the decoy's matte hit disc.
  function paintFibcap(c, r, face, disc) {
    const k = r / 12;
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (disc) { c.save(); c.globalAlpha = .45; c.beginPath(); c.arc(0, 0, r + 2.4, 0, TAU); c.fillStyle = FIB.disc; c.fill(); c.restore(); }
    // The stem, a little flared at the foot, shaded on its right.
    c.beginPath(); c.moveTo(-6.4 * k, 3 * k); c.bezierCurveTo(-7.6 * k, 7 * k, -8 * k, 11 * k, -6.6 * k, 13.4 * k);
    c.quadraticCurveTo(0, 15.4 * k, 6.6 * k, 13.4 * k); c.bezierCurveTo(8 * k, 11 * k, 7.6 * k, 7 * k, 6.4 * k, 3 * k); c.closePath();
    c.fillStyle = FIB.stem; c.fill();
    c.save(); c.clip(); c.beginPath(); c.ellipse(7.4 * k, 9 * k, 3.2 * k, 8 * k, 0, 0, TAU); c.fillStyle = FIB.stemShade; c.fill(); c.restore();
    c.strokeStyle = FIB.ink; c.lineWidth = 1.3; c.stroke();
    // The face on the stem.
    c.fillStyle = FIB.eye; c.strokeStyle = FIB.eye; c.lineWidth = 1.15 * Math.max(.8, k);
    if (face === 'wink') {
      c.beginPath(); c.ellipse(-2.9 * k, 6.9 * k, 1.35 * k, 1.75 * k, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(-3.3 * k, 6.3 * k, .5 * k, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      // The wink: a closed, pleased eye, and a cheeky brow over the open one.
      c.beginPath(); c.arc(2.9 * k, 6.2 * k, 1.6 * k, .15 * Math.PI, .85 * Math.PI); c.stroke();
      c.beginPath(); c.moveTo(-4.5 * k, 4.4 * k); c.quadraticCurveTo(-3 * k, 3.6 * k, -1.4 * k, 4.6 * k); c.stroke();
      // A smirk with the tongue stuck out of its right side.
      c.beginPath(); c.moveTo(-2.6 * k, 9.7 * k); c.quadraticCurveTo(.2 * k, 11.4 * k, 3 * k, 9.4 * k); c.stroke();
      c.beginPath(); c.moveTo(.4 * k, 10.5 * k); c.quadraticCurveTo(.3 * k, 13.4 * k, 1.9 * k, 13.4 * k); c.quadraticCurveTo(3.5 * k, 13.4 * k, 3.1 * k, 10.1 * k); c.closePath();
      c.fillStyle = FIB.tongue; c.fill(); c.lineWidth = .9; c.strokeStyle = FIB.ink; c.stroke();
      c.beginPath(); c.moveTo(1.8 * k, 11 * k); c.lineTo(1.9 * k, 12.4 * k); c.strokeStyle = '#d24d78'; c.lineWidth = .7; c.stroke();
    } else if (face === 'ah') {
      // Winding up: eyes squeezed into arcs under raised brows, mouth a little open.
      for (const side of [-1, 1]) {
        c.beginPath(); c.arc(side * 2.9 * k, 7.6 * k, 1.5 * k, 1.12 * Math.PI, 1.88 * Math.PI); c.stroke();
        c.beginPath(); c.moveTo(side * 4.4 * k, 4.6 * k); c.lineTo(side * 1.6 * k, 4 * k); c.stroke();
      }
      c.beginPath(); c.ellipse(0, 10.4 * k, 1.5 * k, 1.9 * k, 0, 0, TAU); c.fill();
    } else {
      // CHOO: eyes screwed shut (> <) and the mouth thrown wide open.
      for (const side of [-1, 1]) {
        c.beginPath(); c.moveTo(side * 4.2 * k, 5.6 * k); c.lineTo(side * 2 * k, 6.9 * k); c.lineTo(side * 4.2 * k, 8.2 * k); c.stroke();
      }
      c.beginPath(); c.ellipse(0, 10.8 * k, 2.8 * k, 2.4 * k, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(0, 12 * k, 1.6 * k, .9 * k, 0, 0, TAU); c.fillStyle = FIB.tongue; c.fill();
    }
    // The gills under the brim, then the cap: shaded, lit on the left, three zig-zag stripes, inked.
    c.beginPath(); c.ellipse(0, 4.4 * k, 12.4 * k, 2.6 * k, 0, 0, TAU); c.fillStyle = FIB.gill; c.fill();
    fibCapPath(c, k); c.fillStyle = FIB.cap; c.fill();
    c.save(); fibCapPath(c, k); c.clip();
    c.beginPath(); c.ellipse(9 * k, -2 * k, 7.5 * k, 15 * k, -.2, 0, TAU); c.fillStyle = FIB.shade; c.fill();
    c.beginPath(); c.ellipse(-6.4 * k, -5 * k, 1.9 * k, 6.5 * k, .45, 0, TAU); c.fillStyle = FIB.light; c.fill();
    c.strokeStyle = FIB.stripe; c.lineWidth = 2.1 * k; c.lineJoin = 'miter'; c.lineCap = 'butt';
    for (const y of [-11.4, -5.4, .6]) {
      c.beginPath();
      for (let i = 0, x = -16; x <= 16.1; i++, x += 2.6) { const py = (y + (i % 2 ? -1.5 : 1.5)) * k; if (i) c.lineTo(x * k, py); else c.moveTo(x * k, py); }
      c.stroke();
    }
    c.restore();
    c.lineJoin = 'round'; fibCapPath(c, k); c.strokeStyle = FIB.ink; c.lineWidth = 1.4; c.stroke();
  }
  // Glint frame f (0..5): a white bar partway across the cap, clipped to it.
  function paintFibGlint(c, r, f) {
    const k = r / 12, x = (-15 + f * 6.2) * k;
    c.save(); fibCapPath(c, k); c.clip();
    c.beginPath(); c.moveTo(x - 2 * k, 7 * k); c.lineTo(x + 1.8 * k, 7 * k); c.lineTo(x + 9.8 * k, -19 * k); c.lineTo(x + 6 * k, -19 * k); c.closePath();
    c.fillStyle = 'rgba(255,255,255,.72)'; c.fill();
    c.restore();
  }
  const fibLook = (r, face, disc = face === 'wink') => [`foe:fibcap:${r}:${face}`, FIB_BOX(r), c => paintFibcap(c, r, face, disc)];
  const fibGlint = (r, f) => [`foe:fibcap:${r}:glint${f}`, FIB_BOX(r), c => paintFibGlint(c, r, f)];
  // A stable 0..1 phase per piece, so two fibcaps never rock or glint in step.
  function phaseOf(id) { const s = String(id || ''); let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return h / 9973; }
  // Draws a cached look at (x, y) turned about a pivot `py` px below its origin (a stem's foot), scaled sx, sy.
  function stampPivot(ctx, kit, [key, box, paint], x, y, turn, py, sx = 1, sy = sx) {
    const sprite = kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    ctx.save(); ctx.translate(x, y + py); if (turn) ctx.rotate(turn); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy); ctx.translate(0, -py);
    if (sprite) kit.blit(ctx, sprite); else paint(ctx);
    ctx.restore();
  }
  BloomFoeLook('fibcap', {
    warm(kit, r) {
      const looks = [fibLook(r, 'wink'), fibLook(r, 'ah'), fibLook(r, 'choo')];
      for (let f = 0; f < 6; f++) looks.push(fibGlint(r, f));
      for (const [key, box, paint] of looks) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    bud(ctx, bud, time, still, state, kit, quality) {
      const r = bud.r || 12, k = r / 12, phase = phaseOf(bud.id);
      // Never breathes: it only rocks on its stem, slowly and a little, like someone pretending to be innocent.
      const turn = still ? 0 : Math.sin(time * TAU / 4 + phase * TAU) * 6 * Math.PI / 180;
      stampPivot(ctx, kit, fibLook(r, 'wink'), bud.x, bud.y, turn, FIB_PIVOT * k);
      if (still || quality > 1) return;
      const g = (time + phase * 2.5) % 2.5;
      if (g < .3) stampPivot(ctx, kit, fibGlint(r, Math.min(5, Math.floor(g / .3 * 6))), bud.x, bud.y, turn, FIB_PIVOT * k);
    },
    // Every sneeze still playing (its record stays a moment after the push): the wind-up, the CHOO and its gust.
    over(ctx, state, time, still, kit, quality) {
      const list = state.sneezes;
      if (!list || !list.length) return;
      const clock = Number(state.foeClock) || 0, r = 12, k = 1;
      for (const s of list) {
        const from = Number.isFinite(s.from) ? s.from : s.at - .18, wind = Math.max(.01, s.at - from), u = clock - from, g = u - wind;
        if (u < 0 || g > .75) continue;
        if (g < 0) {
          // "Ah-": it draws a breath, stretching tall and leaning back.
          const q = still ? 1 : kit.smooth(u / wind);
          stampPivot(ctx, kit, fibLook(r, still ? 'choo' : 'ah'), s.x, s.y, still ? 0 : -.14 * q, FIB_PIVOT * k, 1 - .1 * q, 1 + .16 * q);
          continue;
        }
        if (g < .08) stampPivot(ctx, kit, fibLook(r, 'choo'), s.x, s.y, still ? 0 : .1, FIB_PIVOT * k, still ? 1 : 1.2, still ? 1 : .8);
        // The gust: a ring out to the sneeze's reach (12 to 74 px over .3 s; one still ring with Animations off).
        if (g < .3) {
          const q = g / .3, rr = still ? 52 : 12 + 62 * (1 - Math.pow(1 - q, 3));
          ctx.globalAlpha = (1 - q) * .85;
          ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 + 4 * (1 - q); ctx.stroke();
          ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.strokeStyle = FIB.gust; ctx.lineWidth = 1 + 2.4 * (1 - q); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (!still && g < .3 && quality <= 1 && s.targets) {
          // Wind streaks trail every bud it blows, strongest at the middle of the push.
          const p = clamp(g / Math.max(.01, s.dur || .25), 0, 1), speed = 4 * p * (1 - p);
          if (speed > .05) {
            ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.lineWidth = 1.7; ctx.globalAlpha = .85 * speed;
            for (const { bud, ux, uy } of s.targets) {
              if (bud.bloomed) continue;
              const br = (bud.r || 11) + 3;
              for (const side of [-1, 1]) {
                const ox = bud.x - ux * br - uy * side * 4.5, oy = bud.y - uy * br + ux * side * 4.5;
                ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - ux * 9, oy - uy * 9); ctx.stroke();
              }
            }
            ctx.globalAlpha = 1;
          }
        }
        if (!still && g < .5 && quality === 0) {
          // Striped confetti: lilac and white scraps flung out, tumbling and falling.
          const q = g / .5, out = 8 + 48 * (1 - (1 - q) * (1 - q));
          ctx.globalAlpha = 1 - q * q;
          for (let i = 0; i < 8; i++) {
            const a = i * TAU / 8 + .35, x = s.x + Math.cos(a) * out, y = s.y + Math.sin(a) * out + 26 * q * q;
            ctx.save(); ctx.translate(x, y); ctx.rotate(a + q * 7 * (i % 2 ? 1 : -1));
            ctx.fillStyle = i % 2 ? FIB.stripe : FIB.cap; ctx.fillRect(-2.2, -1.1, 4.4, 2.2);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
        // "Achoo!": popped on with a little overshoot, floating up as it fades.
        const pop = still ? 1 : g < .12 ? kit.easeBack(g / .12) : 1, rise = still ? 0 : -12 * (g / .75);
        ctx.save(); ctx.globalAlpha = g > .55 ? Math.max(0, 1 - (g - .55) / .2) : 1;
        ctx.translate(clamp(s.x, 40, 380), Math.max(26, s.y - 26) + rise); ctx.rotate(-.12); ctx.scale(pop, pop);
        ctx.font = '700 14px Fredoka, Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeText('Achoo!', 0, 0);
        ctx.fillStyle = FIB.word; ctx.fillText('Achoo!', 0, 0);
        ctx.restore();
      }
    }
  });

  // ── Drippy Inkcap (Level 3, `inkcap`) ──
  // A shaggy ink cap: a tall pale-lilac bell with little upturned scales, a dark scalloped fringe where the ink gathers,
  // and a sleepy, heavy-lidded face. It is a real bud, so it sits on the glossy lilac target jewel. Before each drip it
  // gives a clear tell on the foe clock (bud.swellAt): for half a second it wobbles harder and harder (rocking from its
  // crown, squashing and stretching), puffs its cheeks and a bead of ink grows under its fringe (r 1 to 4); then "plip",
  // it springs up with an open mouth and the bead falls as a drop. A drop is a navy teardrop with a white glint, two
  // tiny eyes and a pale rim (so it reads on the dark Grotto), stretched as it falls. A gulped seed leaves a six-lobed
  // ink blot that splats in over .12 s and fades over .4 s (game.inkBlots, from the app). Animations off: no wobble or
  // stretch; the bead shows at full size through the swell and the faces still change.
  const INKY = { body: '#cbbfd6', top: '#e9e1f0', shade: '#b4a6c4', scale: '#958aa8', fringe: '#5b4a73', ink: '#3e3150', eye: '#2c2140',
    cheek: '#e8a3c6', drop: '#2f2a6b', dropInk: '#1d1840', rim: '#e9dcff', sheen: '#5a54a3' };
  const INK_BOX = r => [-r * 1.3, -r * 1.42, r * 1.3, r * 1.3];
  function inkBellPath(c, k) {
    c.beginPath(); c.moveTo(-11.6 * k, 7 * k);
    c.bezierCurveTo(-12.6 * k, -3 * k, -9 * k, -15.6 * k, 0, -15.6 * k);
    c.bezierCurveTo(9 * k, -15.6 * k, 12.6 * k, -3 * k, 11.6 * k, 7 * k);
    c.closePath();
  }
  function inkFringePath(c, k) {
    const w = 23.6 * k / 5;
    c.beginPath(); c.moveTo(-11.9 * k, 4.6 * k); c.lineTo(11.9 * k, 4.6 * k);
    for (let i = 0; i < 5; i++) c.arc(11.8 * k - (i + .5) * w, 7.3 * k, w / 2, 0, Math.PI);
    c.closePath();
  }
  // face: 'idle' (sleepy), 'swell' (cheeks puffed, straining) or 'plip' (eyes wide, mouth open as the drop lets go).
  function paintInkcap(c, r, face, kit) {
    const k = r / 12, lilac = kit && kit.FLOWERS && kit.FLOWERS.lilac || { tip: '#ede2ff', light: '#cbb0ff', base: '#a079fa' };
    c.lineJoin = 'round'; c.lineCap = 'round';
    // The target jewel: a glassy lilac disc with a bright rim (painted once, so its gradient costs nothing per frame).
    const disc = c.createRadialGradient(-r * .35, -r * .45, r * .1, 0, 0, r + 2.4);
    disc.addColorStop(0, 'rgba(255,255,255,.95)'); disc.addColorStop(.45, lilac.tip); disc.addColorStop(.85, lilac.light); disc.addColorStop(1, lilac.base);
    c.save(); c.globalAlpha = .9; c.beginPath(); c.arc(0, 0, r + 2.4, 0, TAU); c.fillStyle = disc; c.fill(); c.restore();
    c.beginPath(); c.arc(0, 0, r + 2.4, 0, TAU); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 1.3; c.stroke();
    // The bell, lit at its crown and shaded on its right, with rows of little upturned scales.
    inkBellPath(c, k); c.fillStyle = INKY.body; c.fill();
    c.save(); inkBellPath(c, k); c.clip();
    c.beginPath(); c.ellipse(9.5 * k, 0, 6 * k, 16 * k, 0, 0, TAU); c.fillStyle = INKY.shade; c.fill();
    c.beginPath(); c.ellipse(-1.5 * k, -11 * k, 7 * k, 3.6 * k, -.15, 0, TAU); c.fillStyle = INKY.top; c.fill();
    c.strokeStyle = INKY.scale; c.lineWidth = 1;
    for (const [x, y] of [[-4.5, -11.6], [1.5, -12.8], [6.5, -10.4], [-8.5, -6.4], [-3, -7.4], [3, -7], [8.6, -5.2], [-10, -1], [10, -.4]]) {
      c.beginPath(); c.moveTo((x - 1.5) * k, (y - .9) * k); c.lineTo(x * k, (y + .9) * k); c.lineTo((x + 1.5) * k, (y - .9) * k); c.stroke();
    }
    c.restore();
    inkBellPath(c, k); c.strokeStyle = INKY.ink; c.lineWidth = 1.4; c.stroke();
    // The face.
    c.fillStyle = INKY.eye; c.strokeStyle = INKY.eye; c.lineWidth = 1.15 * Math.max(.8, k);
    if (face === 'swell') {
      for (const side of [-1, 1]) {
        c.beginPath(); c.moveTo(side * 5.6 * k, -1 * k); c.lineTo(side * 3.4 * k, .1 * k); c.lineTo(side * 5.6 * k, 1.2 * k); c.stroke();
        c.beginPath(); c.ellipse(side * 7.2 * k, 2.6 * k, 2.2 * k, 1.5 * k, 0, 0, TAU); c.fillStyle = INKY.cheek; c.fill();
      }
      c.beginPath(); c.moveTo(-1.8 * k, 3.4 * k); c.quadraticCurveTo(-.9 * k, 2.6 * k, 0, 3.4 * k); c.quadraticCurveTo(.9 * k, 4.2 * k, 1.8 * k, 3.4 * k); c.stroke();
    } else if (face === 'plip') {
      for (const side of [-1, 1]) {
        c.beginPath(); c.arc(side * 4 * k, 0, 1.75 * k, 0, TAU); c.fillStyle = INKY.eye; c.fill();
        c.beginPath(); c.arc(side * 4 * k - .55 * k, -.6 * k, .6 * k, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      }
      c.beginPath(); c.ellipse(0, 3.6 * k, 1.5 * k, 1.9 * k, 0, 0, TAU); c.fillStyle = INKY.eye; c.fill();
    } else {
      // Sleepy: dark eyes under heavy lids, a small round mouth.
      for (const side of [-1, 1]) {
        c.beginPath(); c.ellipse(side * 4 * k, .3 * k, 1.6 * k, 1.7 * k, 0, 0, TAU); c.fillStyle = INKY.eye; c.fill();
        c.beginPath(); c.ellipse(side * 4 * k, -.5 * k, 2.1 * k, 1.5 * k, 0, Math.PI, TAU); c.fillStyle = INKY.body; c.fill();
        c.beginPath(); c.moveTo(side * 6.1 * k, -.4 * k); c.lineTo(side * 1.9 * k, -.4 * k); c.strokeStyle = INKY.eye; c.stroke();
      }
      c.beginPath(); c.arc(0, 3.5 * k, 1.05 * k, 0, TAU); c.fillStyle = INKY.eye; c.fill();
    }
    // The inky fringe, scalloped, with two drips already running down it.
    inkFringePath(c, k); c.fillStyle = INKY.fringe; c.fill(); c.strokeStyle = INKY.ink; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = INKY.drop;
    for (const x of [-7.1, 7.1]) { c.beginPath(); c.ellipse(x * k, 9.8 * k, .9 * k, 1.5 * k, 0, 0, TAU); c.fill(); }
    c.beginPath(); c.ellipse(-4 * k, 6 * k, 4 * k, .7 * k, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,.18)'; c.fill();
  }
  // A drop of ink, its body centred on the origin: a teardrop tip-up with a pale rim, a glint and two tiny eyes.
  function inkDropPath(c, s) {
    c.beginPath(); c.moveTo(0, -8.6 * s);
    c.bezierCurveTo(1.4 * s, -5 * s, 5.6 * s, -2.4 * s, 5.6 * s, 1.4 * s);
    c.arc(0, 1.4 * s, 5.6 * s, 0, Math.PI);
    c.bezierCurveTo(-5.6 * s, -2.4 * s, -1.4 * s, -5 * s, 0, -8.6 * s);
    c.closePath();
  }
  function paintInkDrop(c, r) {
    const s = r / 6;
    c.lineJoin = 'round';
    inkDropPath(c, s); c.strokeStyle = INKY.rim; c.lineWidth = 3.6; c.stroke();
    c.fillStyle = INKY.drop; c.fill(); c.strokeStyle = INKY.dropInk; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.ellipse(-2.3 * s, -1.4 * s, 1.1 * s, 2.1 * s, .5, 0, TAU); c.fillStyle = 'rgba(255,255,255,.92)'; c.fill();
    for (const side of [-1, 1]) { c.beginPath(); c.arc(side * 1.7 * s + .5 * s, 3 * s, .75 * s, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); }
  }
  // The splat a gulp leaves: six round lobes about a middle, two satellite flecks and a sheen.
  function paintInkBlot(c) {
    c.fillStyle = INKY.drop;
    c.beginPath(); c.arc(0, 0, 6.6, 0, TAU); c.fill();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + .25, d = i % 2 ? 7.4 : 6.6, rr = i % 2 ? 3.4 : 4.3;
      c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, TAU); c.fill();
    }
    for (const [a, d, rr] of [[.9, 13, 1.7], [3.4, 12.4, 1.3], [5.2, 13.4, 1.1]]) { c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, TAU); c.fill(); }
    c.beginPath(); c.ellipse(-2.6, -2.8, 2.6, 1.4, -.6, 0, TAU); c.fillStyle = INKY.sheen; c.fill();
  }
  const inkLook = (r, face, kit) => [`foe:inkcap:${r}:${face}`, INK_BOX(r), c => paintInkcap(c, r, face, kit)];
  const inkDrop = r => [`foe:inkdrop:${r}:drop`, [-r * 1.35, -r * 1.8, r * 1.35, r * 1.6], c => paintInkDrop(c, r)];
  const inkBlot = () => ['foe:inkdrop:blot', [-16, -16, 16, 16], paintInkBlot];
  BloomFoeLook('inkcap', {
    warm(kit, r) {
      for (const [key, box, paint] of [inkLook(r, 'idle', kit), inkLook(r, 'swell', kit), inkLook(r, 'plip', kit), inkDrop(6), inkBlot()]) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    bud(ctx, bud, time, still, state, kit) {
      const r = bud.r || 12, k = r / 12, clock = Number(state.foeClock) || 0;
      // The tell: the half second before a drip (never while the cap already has its three drops falling).
      const swell = Number.isFinite(bud.swellAt) && !bud.inkFull ? (clock - bud.swellAt) / .5 : -1, swelling = swell >= 0 && swell < 1;
      const since = Number.isFinite(bud.drippedAt) ? clock - bud.drippedAt : Infinity, plip = since >= 0 && since < .22;
      let turn = 0, sx = 1, sy = 1;
      if (!still && swelling) {
        // Wobbling harder and harder: rocking from its crown and squashing on the same beat.
        const amp = .35 + .65 * swell, beat = Math.sin(swell * TAU * 3);
        turn = beat * .1 * amp; sx = 1 + .06 * amp * Math.sin(swell * TAU * 6); sy = 2 - sx;
      } else if (!still && plip) {
        // Plip: it springs up as the drop lets go, then settles.
        const q = since / .22, spring = Math.sin(q * Math.PI) * (1 - q * .4);
        sy = 1 + .12 * spring; sx = 1 - .07 * spring;
      }
      // It rocks from its crown, and springs from its fringe.
      const face = swelling ? 'swell' : plip ? 'plip' : 'idle', pivot = plip && !swelling ? 9.6 * k : -15.6 * k;
      ctx.translate(bud.x, bud.y + pivot); if (turn) ctx.rotate(turn); ctx.scale(sx, sy); ctx.translate(0, -pivot);
      const [key, box, paint] = inkLook(r, face, kit), sprite = kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
      if (sprite) kit.blit(ctx, sprite); else paint(ctx);
      if (swelling) {
        // The bead of ink grows under the fringe's middle scallop (full size at once with Animations off).
        const rb = still ? 4 : 1 + 3 * kit.smooth(swell), s = rb / 6;
        const [dk, db, dp] = inkDrop(6), drop = kit.atlasSprite(dk, db[0], db[1], db[2], db[3], dp);
        ctx.translate(0, (9.4 + 8.6 * s) * k); ctx.scale(s * k, s * k);
        if (drop) kit.blit(ctx, drop); else dp(ctx);
      }
    }
  });
  BloomFoeLook('inkdrop', {
    warm(kit) { for (const [key, box, paint] of [inkDrop(6), inkBlot()]) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint); },
    bud(ctx, bud, time, still, state, kit, quality) {
      const r = bud.r || 6, age = (Number(state.foeClock) || 0) - (bud.born || 0);
      let sx = 1, sy = 1;
      if (!still) {
        // Falling, it stretches; just let go, it is longer still for a moment.
        const pull = age < .12 ? 1 - age / .12 : 0;
        sy = 1.15 + .25 * pull; sx = .93 - .1 * pull;
        if (quality === 0 && age > .08) {
          // Two faint drips trail it.
          for (let i = 1; i <= 2; i++) { ctx.globalAlpha = .28 / i; kit.circle(ctx, bud.x, bud.y - r * 1.6 - i * 5.5, 2.2 - .6 * i, INKY.drop); }
          ctx.globalAlpha = 1;
        }
      }
      const [key, box, paint] = inkDrop(r);
      stamp(ctx, kit, key, box, paint, bud.x, bud.y, 0, sx, sy);
    },
    // Gulps: each blot splats in with a little overshoot over .12 s, then fades over .4 s.
    over(ctx, state, time, still, kit, quality) {
      const blots = state.inkBlots;
      if (!blots || !blots.length) return;
      const [key, box, paint] = inkBlot();
      for (const blot of blots) {
        const age = time - blot.at;
        if (age < 0 || age >= .52) continue;
        const grow = still ? 1 : age < .12 ? Math.max(.05, kit.easeBack(age / .12)) : 1;
        ctx.globalAlpha = .8 * (age < .12 ? 1 : 1 - (age - .12) / .4);
        stamp(ctx, kit, key, box, paint, blot.x, blot.y, blot.turn || 0, grow);
        if (!still && quality <= 1 && age < .3) {
          // Ink flecks thrown off the splat.
          const q = age / .3;
          for (let i = 0; i < 4; i++) {
            const a = (blot.turn || 0) + i * TAU / 4 + .6, d = 10 + 16 * (1 - (1 - q) * (1 - q));
            kit.circle(ctx, blot.x + Math.cos(a) * d, blot.y + Math.sin(a) * d + 10 * q * q, 1.6 * (1 - q * .5), INKY.drop);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
  });

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

  // ── Lantern Lily (Level 5, `lotus`) ──


  root.BloomFoeArt = { define, LOOKS, has, bud, under, over, aim, warm, kitLook, KIT_LOOKS, kits };
})(typeof window !== 'undefined' ? window : globalThis);
