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
  // Three tufted molehills with a dark hole on top, and a mole in sunglasses who peeks out of one of them. The tell
  // comes first: the next hill shivers and wobbles harder and harder for .7 s while crumbs of dirt hop off its top, and
  // just before he pops it bulges and two glints blink in its hole. Then he pops up with an overshoot, paws on the rim,
  // and looks about (his glasses catch the light now and then) until he ducks back down behind the hole's front lip.
  // Bonked, he squashes flat with his glasses knocked crooked while three stars circle his head, then shrinks away into
  // his flower. While he is up on an open hill that hill draws him, so the two share every wobble the board gives them;
  // with no hill left he brings his own little patch of dirt. Animations off: a rumbling hill shows three still cracks,
  // a crumb and the glints instead of the shake, and he is simply up or down.
  const MOLE_ART = { body: '#8a6a5c', face: '#a3826f', snout: '#f2b6a0', nose: '#d9707c', glasses: '#2b2b3a', ink: '#4b3424',
    mound: '#9a6a43', top: '#b9875a', clod: '#7e5535', pebble: '#d2a676', tuft: '#71b45b', tuftInk: '#3f7a35', hole: '#3b2a1e',
    star: '#ffe76b', starInk: '#c98a17' };
  // The hole on a hill (hill-local; the hill's center is the origin), and how far below it the mole hides.
  const HOLE = { y: -6.5, rx: 7, ry: 2.6, deep: 15, rumble: .7 };
  // The mole perches 4 px above his hill's center, so the hole is 2.5 px above his. He is drawn a little larger than
  // he is painted (SIZE), so his face reads at phone size; his round head still sits inside his r 10 body.
  const PERCH = 4, SIZE = 1.15;
  function moundPath(c) {
    c.beginPath(); c.moveTo(-15.5, 7.5);
    c.bezierCurveTo(-14.5, -2.5, -8.5, -10.5, 0, -10.5); c.bezierCurveTo(8.5, -10.5, 14.5, -2.5, 15.5, 7.5);
    c.quadraticCurveTo(0, 10, -15.5, 7.5); c.closePath();
  }
  // A flat patch of dirt for a mole with no hill left; its hole sits where a hill's does.
  function patchPath(c) {
    c.beginPath(); c.moveTo(-13, -2);
    c.bezierCurveTo(-11.5, -8.5, -6, -11.2, 0, -11.2); c.bezierCurveTo(6, -11.2, 11.5, -8.5, 13, -2);
    c.quadraticCurveTo(0, .5, -13, -2); c.closePath();
  }
  function paintTuft(c, x, y, lean) {
    for (const [dx, h, bend] of [[-1.7, 3.6, -1.5], [0, 4.8, .4 * lean], [1.7, 3.4, 1.6]]) {
      c.beginPath(); c.moveTo(x + dx * .6, y); c.quadraticCurveTo(x + dx, y - h * .55, x + dx + bend, y - h);
      c.lineWidth = 2; c.strokeStyle = MOLE_ART.tuftInk; c.stroke(); c.lineWidth = 1.05; c.strokeStyle = MOLE_ART.tuft; c.stroke();
    }
  }
  // The hole's front lip, drawn again over a mole in it, so he sits inside the hill rather than in front of it.
  function paintLip(c) {
    c.lineCap = 'round';
    c.beginPath(); c.ellipse(0, HOLE.y, HOLE.rx, HOLE.ry, 0, .04 * Math.PI, .96 * Math.PI); c.strokeStyle = MOLE_ART.ink; c.lineWidth = 1.1; c.stroke();
    c.beginPath(); c.ellipse(0, HOLE.y + .6, HOLE.rx - .6, HOLE.ry, 0, .16 * Math.PI, .84 * Math.PI); c.strokeStyle = MOLE_ART.pebble; c.lineWidth = 1.1; c.stroke();
  }
  function paintHole(c) {
    c.beginPath(); c.ellipse(0, HOLE.y, HOLE.rx, HOLE.ry, 0, 0, TAU); c.fillStyle = MOLE_ART.hole; c.fill();
    c.strokeStyle = MOLE_ART.ink; c.lineWidth = 1; c.stroke();
    paintLip(c);
  }
  // The molehill: a 30 x 18 mound, its lit top, clods and pebbles, three grass tufts and the hole. `cracked` adds the
  // still tell of a rumble (Animations off): three dark cracks running out from the hole.
  function paintMound(c, cracked) {
    const A = MOLE_ART; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.ellipse(0, 8.4, 16.5, 3.2, 0, 0, TAU); c.fillStyle = 'rgba(58,38,22,.24)'; c.fill();
    moundPath(c); c.fillStyle = A.mound; c.fill();
    c.save(); moundPath(c); c.clip();
    c.beginPath(); c.ellipse(-1.5, -6.8, 12.5, 6.4, -.06, 0, TAU); c.fillStyle = A.top; c.fill();
    c.beginPath(); c.ellipse(-7, -6.2, 4.2, 1.8, -.55, 0, TAU); c.fillStyle = 'rgba(255,238,205,.4)'; c.fill();
    for (const [x, y, r] of [[-9.5, 2.5, 1.3], [6.5, 4, 1.1], [10.5, -.5, 1], [-3, 5.6, .9], [1.5, 1.5, .7]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = A.clod; c.fill(); }
    for (const [x, y, r] of [[-5, -.5, .9], [4, -1.2, .8], [-12, 5, .7]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = A.pebble; c.fill(); }
    c.restore();
    moundPath(c); c.strokeStyle = A.ink; c.lineWidth = 1.4; c.stroke();
    paintHole(c);
    paintTuft(c, -11, 4.2, -1); paintTuft(c, 11.2, 3.2, 1); paintTuft(c, 2.5, 7.6, .4);
    if (cracked) {
      c.strokeStyle = A.ink; c.lineWidth = 1.2;
      for (const crack of [[[-5.5, -4.6], [-8, -1.6], [-7, 1.8], [-9.5, 4]], [[1.5, -3.8], [3.6, -.4], [2, 2.6]], [[7, -6.2], [10.2, -4.4], [11.6, -1.4]]]) {
        c.beginPath(); crack.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
      }
    }
  }
  function paintPatch(c) {
    const A = MOLE_ART; c.lineJoin = 'round';
    c.beginPath(); c.ellipse(0, -.6, 14, 2.4, 0, 0, TAU); c.fillStyle = 'rgba(58,38,22,.22)'; c.fill();
    patchPath(c); c.fillStyle = A.top; c.fill();
    c.save(); patchPath(c); c.clip();
    for (const [x, y, r] of [[-8, -3.2, 1], [7.5, -3.6, .9], [3, -2.4, .7]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = A.clod; c.fill(); }
    c.restore();
    patchPath(c); c.strokeStyle = A.ink; c.lineWidth = 1.3; c.stroke();
    paintHole(c);
  }
  // The mole, drawn from the middle of his hole up: a round brown head, a pale muzzle, pink snout and buck teeth,
  // whiskers, rosy cheeks, a tuft of hair and his sunglasses. `dazed` knocks the glasses crooked, shows one
  // x-ed out eye, raises a bump and turns his grin into an "o".
  function headPath(c) {
    c.beginPath(); c.moveTo(-7.8, 4); c.lineTo(-7.8, -6.6);
    c.bezierCurveTo(-7.8, -12.2, -4.3, -14.4, 0, -14.4); c.bezierCurveTo(4.3, -14.4, 7.8, -12.2, 7.8, -6.6);
    c.lineTo(7.8, 4); c.closePath();
  }
  function paintGlasses(c) {
    const A = MOLE_ART;
    c.lineCap = 'round'; c.strokeStyle = A.glasses; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(-7.7, -.9); c.lineTo(-6.3, -.4); c.moveTo(7.7, -.9); c.lineTo(6.3, -.4); c.stroke();
    c.beginPath(); c.moveTo(-1.3, -.3); c.quadraticCurveTo(0, -1.3, 1.3, -.3); c.lineWidth = 1.3; c.stroke();
    for (const side of [-1, 1]) {
      c.beginPath(); c.ellipse(side * 3.6, 0, 3.2, 2.5, side * .08, 0, TAU); c.fillStyle = A.glasses; c.fill();
      c.lineWidth = .9; c.strokeStyle = '#15151f'; c.stroke();
      c.beginPath(); c.moveTo(side * 3.6 - 2, -.4); c.lineTo(side * 3.6 - .7, -1.6); c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = .85; c.stroke();
    }
  }
  function paintMole(c, dazed) {
    const A = MOLE_ART; c.lineJoin = 'round'; c.lineCap = 'round';
    headPath(c); c.fillStyle = A.body; c.fill();
    c.save(); headPath(c); c.clip();
    c.beginPath(); c.ellipse(0, -3.2, 6.3, 6.4, 0, 0, TAU); c.fillStyle = A.face; c.fill();
    c.beginPath(); c.ellipse(-3.6, -11.8, 3, 1.3, -.5, 0, TAU); c.fillStyle = 'rgba(255,255,255,.24)'; c.fill();
    c.restore();
    headPath(c); c.strokeStyle = A.ink; c.lineWidth = 1.4; c.stroke();
    c.lineWidth = 1.1;
    for (const [x, a] of [[-1.7, -.5], [0, 0], [1.7, .5]]) { c.beginPath(); c.moveTo(x, -14); c.lineTo(x + Math.sin(a) * 2.2, -14 - Math.cos(a) * 2.5); c.stroke(); }
    if (dazed) {
      // A bump where the seed landed.
      c.beginPath(); c.ellipse(3.4, -14.1, 2.4, 1.8, .3, Math.PI, TAU); c.fillStyle = '#ff9fb0'; c.fill(); c.lineWidth = 1; c.stroke();
    }
    for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * 5.5, -3.7, 1.8, 1.15, 0, 0, TAU); c.fillStyle = 'rgba(255,135,160,.6)'; c.fill(); }
    c.strokeStyle = 'rgba(75,52,36,.78)'; c.lineWidth = .7;
    for (const side of [-1, 1]) for (const dy of [-1, 1]) { c.beginPath(); c.moveTo(side * 3.8, -4.4 + dy * .5); c.lineTo(side * 9, -5 + dy * 1.7); c.stroke(); }
    c.beginPath(); c.ellipse(0, -4.4, 4.1, 2.9, 0, 0, TAU); c.fillStyle = A.snout; c.fill(); c.strokeStyle = A.ink; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.ellipse(0, -5.9, 1.9, 1.25, 0, 0, TAU); c.fillStyle = A.nose; c.fill();
    c.beginPath(); c.arc(-.6, -6.3, .45, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    if (dazed) { c.beginPath(); c.ellipse(0, -2.4, 1.2, 1.5, 0, 0, TAU); c.fillStyle = '#5a2d2d'; c.fill(); }
    else {
      // Buck teeth under a little grin.
      c.beginPath(); c.moveTo(-2, -3.3); c.quadraticCurveTo(0, -2.2, 2, -3.3); c.strokeStyle = A.ink; c.lineWidth = .8; c.stroke();
      for (const side of [-1, 1]) { c.beginPath(); c.rect(side > 0 ? .1 : -1.3, -2.9, 1.2, 1.7); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = .6; c.strokeStyle = A.ink; c.stroke(); }
    }
    c.save();
    if (dazed) {
      // The glasses slid down to one side; the eye behind the other lens is seeing stars.
      c.strokeStyle = A.ink; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(-5.1, -11.1); c.lineTo(-2.3, -8.3); c.moveTo(-2.3, -11.1); c.lineTo(-5.1, -8.3); c.stroke();
      c.translate(1.8, -8); c.rotate(.42);
    } else c.translate(0, -9.6);
    paintGlasses(c);
    c.restore();
  }
  // Two pink paws resting on the rim of the hole.
  function paintPaws(c) {
    const A = MOLE_ART;
    for (const side of [-1, 1]) {
      c.beginPath(); c.ellipse(side * 5.9, .5, 2.7, 1.8, side * -.2, 0, TAU); c.fillStyle = A.snout; c.fill();
      c.strokeStyle = A.ink; c.lineWidth = .9; c.stroke();
      c.lineWidth = .6;
      for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(side * 5.9 + k * 1.1, -.4); c.lineTo(side * 5.9 + k * 1.2, .5); c.stroke(); }
    }
  }
  // The glasses' glint sweeping across both lenses (three frames), laid over the mole.
  function paintGlint(c, frame) {
    c.save(); c.translate(0, -9.6);
    c.beginPath(); for (const side of [-1, 1]) { c.moveTo(side * 3.6 + 3.2, 0); c.ellipse(side * 3.6, 0, 3.2, 2.5, side * .08, 0, TAU); }
    c.clip();
    const x = -7 + frame * 5;
    c.beginPath(); c.moveTo(x - 1.4, 3); c.lineTo(x + 1.6, -3); c.lineTo(x + 3.2, -3); c.lineTo(x + .2, 3); c.closePath();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.fill();
    c.restore();
  }
  function paintStar(c) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.5 : 3.6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.lineJoin = 'round'; c.fillStyle = MOLE_ART.star; c.fill(); c.strokeStyle = MOLE_ART.starInk; c.lineWidth = .9; c.stroke();
  }
  // Sprite definitions [key, box, paint]; every key is fixed (no animated value in it).
  const MOLE_SPRITES = {
    mound: [`foe:molehill:12:mound`, [-18, -14, 18, 12], c => paintMound(c, false)],
    cracked: [`foe:molehill:12:cracked`, [-18, -14, 18, 12], c => paintMound(c, true)],
    patch: [`foe:mole:10:patch`, [-16, -13, 16, 3], paintPatch],
    lip: [`foe:molehill:12:lip`, [-9, HOLE.y - 4, 9, HOLE.y + 4.5], paintLip],
    peek: [`foe:mole:10:peek`, [-11, -19, 11, 6], c => paintMole(c, false)],
    dazed: [`foe:mole:10:dazed`, [-11, -19, 11, 6], c => paintMole(c, true)],
    paws: [`foe:mole:10:paws`, [-10, -3, 10, 4], paintPaws],
    glint0: [`foe:mole:10:glint0`, [-8, -13, 8, -6], c => paintGlint(c, 0)],
    glint1: [`foe:mole:10:glint1`, [-8, -13, 8, -6], c => paintGlint(c, 1)],
    glint2: [`foe:mole:10:glint2`, [-8, -13, 8, -6], c => paintGlint(c, 2)],
    star: [`foe:mole:10:star`, [-5, -5, 5, 5], paintStar]
  };
  // A sprite placed with its point (px, py) at (x, y), turned and scaled about that point.
  function moleSprite(ctx, kit, name, x, y, px = 0, py = 0, turn = 0, sx = 1, sy = sx) {
    const [key, box, paint] = MOLE_SPRITES[name], sprite = kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    ctx.save(); ctx.translate(x + px, y + py); if (turn) ctx.rotate(turn); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy); if (px || py) ctx.translate(-px, -py);
    if (sprite) kit.blit(ctx, sprite); else paint(ctx);
    ctx.restore();
  }
  function warmMole(kit) { for (const [key, box, paint] of Object.values(MOLE_SPRITES)) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint); }
  // The tell. p runs 0 -> 1 over the rumble: the shiver (18 Hz, up to 2 px) and wobble (9 Hz) grow from half to full,
  // four crumbs hop off the top at 8 Hz, little shake marks flicker at both sides, the mound bulges in the last fifth,
  // and two glints blink in the hole in the last 40%. Animations off: cracks, two resting crumbs and steady marks.
  function drawMoleRumble(ctx, kit, x, y, until, clock, still, base = 'mound') {
    const p = clamp(1 - (until - clock) / HOLE.rumble, 0, 1), peeking = p > .6;
    let marks = 1;
    if (still) {
      moleSprite(ctx, kit, base === 'mound' ? 'cracked' : base, x, y);
      for (const [dx, dy] of [[-6, -13.8], [5.5, -14.8]]) kit.circle(ctx, x + dx, y + dy, 1.9, MOLE_ART.top, MOLE_ART.ink, .9);
    } else {
      const shiver = Math.sin(clock * 18 * TAU) * (1 + p), wobble = Math.sin(clock * 9 * TAU + 1.3) * .05 * (.4 + p);
      const bulge = Math.sin(clamp((p - .8) / .2, 0, 1) * Math.PI / 2);
      moleSprite(ctx, kit, base, x + shiver, y, 0, 8, wobble, 1 - .06 * bulge, 1 + .12 * bulge);
      for (let i = 0; i < 4; i++) {
        const bx = [-8.5, -3, 3.5, 9][i], hop = Math.abs(Math.sin(clock * 8 * Math.PI + i * 1.7)) * 4 * (.6 + .4 * p);
        kit.circle(ctx, x + shiver + bx, y - 11 + Math.abs(bx) * .28 - hop, 1.9, MOLE_ART.top, MOLE_ART.ink, .9);
      }
      marks = (.5 + .5 * p) * (Math.sin(clock * 9 * TAU) > -.3 ? 1 : .35);
      x += shiver;
    }
    // Shake marks: two short ink arcs at each side of the mound.
    ctx.save(); ctx.globalAlpha *= .8 * marks; ctx.strokeStyle = MOLE_ART.ink; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (const side of [-1, 1]) for (const [r, a] of [[19, .42], [23.5, .34]]) {
      ctx.beginPath(); ctx.arc(x, y + 1, r, side > 0 ? -a : Math.PI - a, side > 0 ? a : Math.PI + a); ctx.stroke();
    }
    ctx.restore();
    if (peeking) {
      const blink = still ? 1 : clamp((p - .6) / .1, 0, 1) * (Math.sin(clock * 30) > -.7 ? 1 : .2);
      ctx.save(); ctx.globalAlpha *= blink;
      for (const side of [-1, 1]) kit.circle(ctx, x + side * 2.3, y + HOLE.y - .2, .95, '#ffffff');
      ctx.restore();
    }
  }
  // The mole in the hole centered at (hx, hy): rising with an overshoot (0 -> 1.12 -> 1 over .18 s) after his pop,
  // looking about while up, sinking behind the front lip as he ducks. The clip keeps him out of the hill's front.
  function drawMolePeek(ctx, kit, mole, hx, hy, clock, still, quality) {
    let lift = 0, scale = 1, sy = 1, turn = 0, paws = true, glint = -1;
    const since = clock - mole.rumbleUntil;
    if (!still) {
      if (since < .18) {
        const k = clamp(since / .18, 0, 1);
        lift = HOLE.deep * (1 - k) * (1 - k); scale = k < .65 ? .35 + .77 * (k / .65) : 1.12 - .12 * ((k - .65) / .35); paws = k > .7;
      } else if (mole.phase === 'duck') {
        const k = clamp(1 - (mole.until - clock) / .2, 0, 1);
        lift = HOLE.deep * k * k; sy = 1 - .1 * k; paws = k < .35;
      } else {
        // Up: a slow look left and right, a little bob, and a glint over his glasses every 1.8 s (quality <= 1).
        turn = Math.sin(since * 3.4) * .1; sy = 1 + Math.sin(since * 9) * .025;
        const g = (since - .3) % 1.8;
        if (quality <= 1 && g >= 0 && g < .3) glint = Math.min(2, Math.floor(g / .1));
      }
    }
    scale *= SIZE;
    ctx.save();
    ctx.beginPath(); ctx.rect(hx - 16, hy - 40, 32, 40); ctx.moveTo(hx + HOLE.rx, hy); ctx.ellipse(hx, hy, HOLE.rx, HOLE.ry, 0, 0, TAU); ctx.clip();
    moleSprite(ctx, kit, 'peek', hx, hy + lift, 0, 0, turn, scale, scale * sy);
    if (glint >= 0) moleSprite(ctx, kit, 'glint' + glint, hx, hy + lift, 0, 0, turn, scale, scale * sy);
    ctx.restore();
    moleSprite(ctx, kit, 'lip', hx, hy - HOLE.y);
    if (paws) moleSprite(ctx, kit, 'paws', hx, hy, 0, 0, 0, SIZE);
  }
  // The live mole of a hill's group (the hill draws him while he is up on it).
  function moleOfHill(state, hill) {
    for (const bud of state.buds || []) if (bud.group === hill.group && bud.foe === 'mole' && !bud.bloomed) return bud;
    return null;
  }
  BloomFoeLook('molehill', {
    warm: warmMole,
    bud(ctx, hill, time, still, state, kit, quality) {
      const clock = Number(state.foeClock) || 0, mole = moleOfHill(state, hill), x = hill.x, y = hill.y;
      const his = Boolean(mole && mole.hill === hill.slot && !mole.loose);
      // The tell: this is the hill he is coming up through.
      if (his && mole.hidden && mole.phase === 'rumble' && hill.rumbleUntil > clock) { drawMoleRumble(ctx, kit, x, y, hill.rumbleUntil, clock, still); return; }
      const up = his && !mole.hidden && (mole.phase === 'up' || mole.phase === 'duck' || mole.phase === 'stay');
      // The hill squashes as he bursts out of it.
      const k = up && !still ? (clock - mole.rumbleUntil) / .16 : 1, give = k >= 0 && k < 1 ? Math.sin(k * Math.PI) * .14 : 0;
      moleSprite(ctx, kit, 'mound', x, y, 0, 8, 0, 1 + give, 1 - give);
      if (up) drawMolePeek(ctx, kit, mole, x, y + HOLE.y, clock, still, quality);
    }
  });
  BloomFoeLook('mole', {
    warm: warmMole,
    // Only a mole with no open hill under him draws himself, on his own patch of dirt.
    bud(ctx, mole, time, still, state, kit, quality) {
      if (!mole.loose || mole.hidden) return;
      const clock = Number(state.foeClock) || 0, hx = mole.x, hy = mole.y + PERCH + HOLE.y;
      moleSprite(ctx, kit, 'patch', mole.x, mole.y + PERCH);
      drawMolePeek(ctx, kit, mole, hx, hy, clock, still, quality);
    },
    // A mole whose hills are all gone rumbles up through bare ground: the patch shivers where he will appear.
    under(ctx, state, time, still, kit) {
      const clock = Number(state.foeClock) || 0;
      for (const mole of state.buds || []) {
        if (mole.foe !== 'mole' || mole.bloomed || !mole.hidden || !mole.anchor || !(mole.rumbleUntil > clock)) continue;
        drawMoleRumble(ctx, kit, mole.x, mole.y + PERCH, mole.rumbleUntil, clock, still, 'patch');
      }
    },
    // Bonk: flat for a beat (the hit-stop holds it), springs up tall with his glasses knocked crooked, then shrinks
    // into his opening flower; three stars circle where his head was for .5 s (quality <= 1). His bud's white bloom
    // flash is a disc that would cover his hill, so his ground is drawn back over it until the hill blooms itself.
    over(ctx, state, time, still, kit, quality) {
      for (const mole of state.buds || []) {
        if (mole.foe !== 'mole' || !mole.bloomed || typeof mole.bloomAt !== 'number') continue;
        const age = time - mole.bloomAt, hx = mole.x, hy = mole.y - PERCH + 1.5;
        if (age >= 0 && age < (mole.bonked ? .1 : .04)) {
          let hill = null;
          for (const bud of state.buds) if (bud.foe === 'molehill' && bud.group === mole.group && bud.slot === mole.hill) hill = bud;
          if (mole.loose) moleSprite(ctx, kit, 'patch', hx, hy - HOLE.y);
          else if (hill && !hill.bloomed) moleSprite(ctx, kit, 'mound', hx, hy - HOLE.y);
        }
        if (!mole.bonked || !(age >= 0 && age < .5)) continue;
        if (age < .36) {
          let sx = 1, sy = 1, fade = 1;
          if (!still) {
            if (age < .1) { sx = 1.3; sy = .7; }
            else if (age < .22) { const k = (age - .1) / .12; sx = 1.3 - .4 * k; sy = .7 + .42 * k; }
            else { const k = (age - .22) / .14; sx = .9 * (1 - k) + .05; sy = 1.12 * (1 - k) + .05; fade = 1 - k * .6; }
          }
          ctx.save(); ctx.globalAlpha *= fade;
          ctx.beginPath(); ctx.rect(hx - 18, hy - 40, 36, 40); ctx.moveTo(hx + HOLE.rx, hy); ctx.ellipse(hx, hy, HOLE.rx, HOLE.ry, 0, 0, TAU); ctx.clip();
          moleSprite(ctx, kit, 'dazed', hx, hy, 0, 0, 0, sx * SIZE, sy * SIZE);
          ctx.restore();
          // His hill is still there for the first beat (it blooms a moment after him).
          if (age < .1) moleSprite(ctx, kit, 'lip', hx, hy - HOLE.y);
        }
        if (quality > 1) continue;
        const grow = still ? 1 : clamp(age / .08, 0, 1) * clamp((.5 - age) / .15, 0, 1);
        for (let i = 0; i < 3; i++) {
          const a = (still ? 0 : age * 9) + i * TAU / 3, sx = hx + Math.cos(a) * 11.5, sy = hy - 19 + Math.sin(a) * 3.4;
          moleSprite(ctx, kit, 'star', sx, sy, 0, 0, still ? 0 : age * 6 + i, Math.max(.01, grow));
        }
      }
    }
  });

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
  // His face shows his mood (s.tier) under the same bushy white brows: Sleepy has droopy lids and a soft smile, Cranky
  // knits his brows into a V over a wobbly frown (with a little cross mark that throbs), Wide awake raises them over big
  // round eyes and a grin (with two twinkles). Asleep he shuts his eyes and snores; a yawn squeezes his eyes and opens
  // his mouth wide (it builds through the tell); dizzy, his eyes are spirals. His sun portals are little gold suns with
  // dark yawning mouths: one pops open, the next sprout peeks out and grows as it gets ready, the portal squashes as it
  // spits, then shrinks shut with a twist. In Sleepy the same portals open over his volley, as art only. The snooze Z
  // is a blue Z in a dream bubble that rocks as it drifts down a dotted path to a dashed ring over the launcher; once it
  // lands, the aim guide naps under a little "zz". Everything is cached once; Animations off keeps every mark still.
  const SUN = { ring: '#ffd65a', rim: '#c98a2c', ray: '#ff9f43', rayInk: '#d9762a', mouth: '#5a3b2a', throat: '#3c2418', tongue: '#ff8f8f',
    swirl: '#8a5f3c', bud: '#ffd148', budInk: '#c98a1a', z: '#9fd6ff', zInk: '#2f6aa8', bubble: '#eaf7ff', bubbleRim: '#5c9fcc',
    ink: '#654126', brow: '#fff2c7', browInk: '#b98a46', lid: '#d79a48', eye: '#694327', cheek: '#e8907a', cross: '#e2504a', tear: '#9fdcff' };
  const SUN_UP = 34, SUN_TILE = r => [-r * 1.62, -r * 1.62, r * 1.62, r * 1.62];
  // The same lazy Z path as bosses.js (art keeps no dependency on the rules): a straight drift with two side sways.
  function sunZ(p, clock) {
    const dx = p.to.x - p.from.x, dy = p.to.y - p.from.y, len = p.len || Math.hypot(dx, dy) || 1, u = clamp((clock - p.born) * 60 / len, 0, 1), w = 30 * Math.sin(4 * Math.PI * u);
    return { x: p.from.x + dx * u - dy / len * w, y: p.from.y + dy * u + dx / len * w, u };
  }
  // The face, painted per variant around its own centre. r is the guardian's radius.
  function sunBrow(c, r, shape) {
    const B = { sleepy: [[.11, -.25], [.27, -.37], [.45, -.2]], cranky: [[.08, -.13], [.25, -.3], [.47, -.36]],
      awake: [[.1, -.38], [.27, -.56], [.46, -.39]], yawn: [[.1, -.33], [.27, -.47], [.45, -.32]] }[shape];
    c.lineCap = 'round';
    for (const side of [-1, 1]) {
      // Bushy: a soft ink edge under a thick cream stroke, then two little tufts at the outer end.
      for (const [color, width] of [[SUN.browInk, 4.6], [SUN.brow, 3.4]]) {
        c.beginPath(); c.moveTo(side * r * B[0][0], r * B[0][1]); c.quadraticCurveTo(side * r * B[1][0], r * B[1][1], side * r * B[2][0], r * B[2][1]);
        c.strokeStyle = color; c.lineWidth = width; c.stroke();
      }
      c.beginPath(); c.moveTo(side * r * (B[2][0] - .06), r * (B[2][1] - .02)); c.lineTo(side * r * (B[2][0] + .05), r * (B[2][1] - .1)); c.strokeStyle = SUN.brow; c.lineWidth = 1.6; c.stroke();
    }
  }
  function sunEye(c, r, side, kind) {
    const x = side * r * .26, big = kind === 'awake', rx = r * (big ? .15 : .13), ry = r * (big ? .19 : .16);
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (kind === 'shut' || kind === 'blink') {
      // Shut: a lashed curve, smiling down (asleep) or a flat blink.
      c.beginPath(); c.moveTo(x - rx * 1.25, 0); c.quadraticCurveTo(x, kind === 'shut' ? r * .13 : r * .05, x + rx * 1.25, 0); c.strokeStyle = SUN.ink; c.lineWidth = 1.8; c.stroke();
      if (kind === 'shut') for (const k of [-.7, 0, .7]) { c.beginPath(); c.moveTo(x + rx * k, r * .07 + Math.abs(k) * -r * .02); c.lineTo(x + rx * k * 1.25, r * .15); c.lineWidth = 1; c.stroke(); }
      return;
    }
    if (kind === 'squeeze') {
      // Squeezed tight (a yawn, a hit): a chevron pointing in, with a crinkle at the outer corner.
      c.beginPath(); c.moveTo(x + side * rx * 1.1, -r * .09); c.lineTo(x - side * rx * .9, r * .01); c.lineTo(x + side * rx * 1.1, r * .09); c.strokeStyle = SUN.ink; c.lineWidth = 1.9; c.stroke();
      c.beginPath(); c.moveTo(x + side * rx * 1.5, -r * .12); c.lineTo(x + side * rx * 1.85, -r * .17); c.moveTo(x + side * rx * 1.55, r * .1); c.lineTo(x + side * rx * 1.9, r * .14); c.lineWidth = 1; c.stroke();
      return;
    }
    c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    c.beginPath(); c.arc(x - side * r * .015, r * .03, r * (big ? .06 : .075), 0, TAU); c.fillStyle = SUN.eye; c.fill();
    c.beginPath(); c.arc(x - side * r * .035, -r * .02, r * .03, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    if (big) { c.beginPath(); c.arc(x + side * r * .02, r * .07, r * .015, 0, TAU); c.fill(); }
    if (kind === 'sleepy' || kind === 'cranky') {
      // A heavy lid over the top of the eye: level and droopy when sleepy, slanted down to the nose when cranky.
      c.save(); c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.clip();
      const inner = kind === 'cranky' ? r * .04 : -r * .01, outer = kind === 'cranky' ? -r * .1 : -r * .04;
      c.beginPath(); c.moveTo(x - side * rx * 1.2, inner); c.lineTo(x + side * rx * 1.2, outer); c.lineTo(x + side * rx * 1.2, -ry * 1.2); c.lineTo(x - side * rx * 1.2, -ry * 1.2); c.closePath();
      c.fillStyle = SUN.lid; c.fill(); c.restore();
      c.beginPath(); c.moveTo(x - side * rx * 1.1, inner); c.lineTo(x + side * rx * 1.1, outer); c.strokeStyle = SUN.ink; c.lineWidth = 1.6; c.stroke();
    }
    c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.strokeStyle = SUN.ink; c.lineWidth = 1.2; c.stroke();
  }
  function sunMouth(c, r, kind) {
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = SUN.ink;
    if (kind === 'smile') { c.beginPath(); c.arc(0, r * .25, r * .11, .35, Math.PI - .35); c.lineWidth = 1.5; c.stroke(); }
    else if (kind === 'frown') {
      // A wobbly pout: a downturned curve with a little dip in the middle.
      c.beginPath(); c.moveTo(-r * .16, r * .39); c.quadraticCurveTo(-r * .08, r * .27, 0, r * .32); c.quadraticCurveTo(r * .08, r * .27, r * .16, r * .39); c.lineWidth = 1.7; c.stroke();
    } else if (kind === 'grin') {
      c.beginPath(); c.moveTo(-r * .2, r * .24); c.quadraticCurveTo(0, r * .3, r * .2, r * .24); c.quadraticCurveTo(r * .17, r * .5, 0, r * .5); c.quadraticCurveTo(-r * .17, r * .5, -r * .2, r * .24); c.closePath();
      c.fillStyle = SUN.mouth; c.fill();
      c.save(); c.clip();
      c.fillStyle = '#ffffff'; c.fillRect(-r * .22, r * .2, r * .44, r * .1);
      c.beginPath(); c.ellipse(0, r * .5, r * .11, r * .08, 0, 0, TAU); c.fillStyle = SUN.tongue; c.fill();
      c.restore(); c.lineWidth = 1.4; c.stroke();
    } else if (kind === 'snore') { c.beginPath(); c.ellipse(0, r * .34, r * .08, r * .1, 0, 0, TAU); c.fillStyle = '#815b32'; c.fill(); c.strokeStyle = '#f5c984'; c.lineWidth = 1; c.stroke(); }
    else if (kind === 'wobble') {
      c.beginPath(); c.moveTo(-r * .17, r * .33); for (let i = 1; i <= 6; i++) c.lineTo(-r * .17 + i * r * .057, r * .33 + (i % 2 ? -1 : 1) * r * .045); c.lineWidth = 1.6; c.stroke();
    } else if (kind === 'ouch') { c.beginPath(); c.ellipse(0, r * .33, r * .07, r * .05, 0, 0, TAU); c.fillStyle = SUN.mouth; c.fill(); c.lineWidth = 1.2; c.stroke(); }
  }
  // variant: sleepy, cranky, awake (and -blink), asleep (and asleep-cranky), yawn (no mouth: drawn scaled live), dizzy
  // (no eyes: spirals drawn live), hurt.
  function paintSunFace(c, r, variant) {
    const blink = variant.endsWith('-blink'), base = blink ? variant.slice(0, -6) : variant;
    for (const side of [-1, 1]) {
      c.beginPath(); c.ellipse(side * r * .45, r * .2, r * .12, r * .06, side * -.25, 0, TAU); c.fillStyle = SUN.cheek; c.globalAlpha = base === 'cranky' ? .95 : .7; c.fill(); c.globalAlpha = 1;
      c.beginPath(); c.moveTo(side * r * .32, r * .31); c.lineTo(side * r * .5, r * .37); c.strokeStyle = '#9d702b'; c.lineWidth = .8; c.stroke();
    }
    const brow = { sleepy: 'sleepy', cranky: 'cranky', awake: 'awake', asleep: 'sleepy', 'asleep-cranky': 'cranky', yawn: 'yawn', dizzy: 'awake', hurt: 'cranky' }[base] || 'sleepy';
    sunBrow(c, r, brow);
    const eye = blink ? 'blink' : base.startsWith('asleep') ? 'shut' : base === 'yawn' || base === 'hurt' ? 'squeeze' : base;
    if (base !== 'dizzy') for (const side of [-1, 1]) sunEye(c, r, side, eye);
    if (base === 'yawn') {
      // A sleepy tear at one squeezed eye.
      c.beginPath(); c.moveTo(r * .46, r * .02); c.quadraticCurveTo(r * .52, r * .1, r * .49, r * .14); c.arc(r * .46, r * .13, r * .035, 0, Math.PI); c.closePath(); c.fillStyle = SUN.tear; c.fill(); c.strokeStyle = '#3f8fd2'; c.lineWidth = .8; c.stroke();
    }
    const mouth = { sleepy: 'smile', cranky: 'frown', awake: 'grin', asleep: 'snore', 'asleep-cranky': 'snore', dizzy: 'wobble', hurt: 'ouch' }[base];
    if (mouth) sunMouth(c, r, mouth);
  }
  function paintSunYawnMouth(c, r) {
    c.beginPath(); c.ellipse(0, 0, r * .17, r * .21, 0, 0, TAU); c.fillStyle = SUN.mouth; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.ellipse(0, -r * .02, r * .1, r * .11, 0, 0, TAU); c.fillStyle = SUN.throat; c.fill();
    c.beginPath(); c.ellipse(0, r * .17, r * .13, r * .09, 0, 0, TAU); c.fillStyle = SUN.tongue; c.fill();
    c.restore();
    c.beginPath(); c.ellipse(0, 0, r * .17, r * .21, 0, 0, TAU); c.strokeStyle = SUN.ink; c.lineWidth = 1.5; c.stroke();
  }
  function paintSunSpiral(c, r) {
    const R = r * .15;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = SUN.ink; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU * 2.2, d = R * .85 * i / 28; if (i) c.lineTo(Math.cos(a) * d, Math.sin(a) * d); else c.moveTo(0, 0); }
    c.strokeStyle = SUN.eye; c.lineWidth = 1.1; c.lineCap = 'round'; c.stroke();
  }
  // A sun portal: eight rays (their own sprite, so they can turn), a gold ring and a dark yawning mouth with a tongue.
  function paintSunRays(c, r) {
    c.lineJoin = 'round';
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, w = .32;
      c.beginPath(); c.moveTo(Math.cos(a - w) * r * .92, Math.sin(a - w) * r * .92); c.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5); c.lineTo(Math.cos(a + w) * r * .92, Math.sin(a + w) * r * .92); c.closePath();
      c.fillStyle = SUN.ray; c.fill(); c.strokeStyle = SUN.rayInk; c.lineWidth = 1.1; c.stroke();
    }
  }
  function paintSunPortal(c, r) {
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = SUN.ring; c.fill(); c.strokeStyle = SUN.rim; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.arc(0, 0, r * .8, -2.6, -1.3); c.strokeStyle = '#fff6cf'; c.lineWidth = 1.6; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.ellipse(0, r * .05, r * .62, r * .58, 0, 0, TAU); c.fillStyle = SUN.mouth; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.ellipse(0, r * .55, r * .42, r * .26, 0, 0, TAU); c.fillStyle = SUN.tongue; c.fill();
    c.restore();
    c.beginPath(); c.ellipse(0, r * .05, r * .62, r * .58, 0, 0, TAU); c.strokeStyle = SUN.ink; c.lineWidth = 1.4; c.stroke();
  }
  function paintSunSwirl(c, r) {
    c.beginPath(); for (let i = 0; i <= 30; i++) { const a = i / 30 * TAU * 1.6, d = r * .48 * (1 - i / 34); if (i) c.lineTo(Math.cos(a) * d, Math.sin(a) * d); else c.moveTo(d, 0); }
    c.strokeStyle = SUN.swirl; c.lineWidth = 1.6; c.lineCap = 'round'; c.stroke();
  }
  // The next sprout, peeking out of a portal's mouth: a gold bud with a seam and a shine.
  function paintSunPeek(c, r) {
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = SUN.bud; c.fill(); c.strokeStyle = SUN.budInk; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.moveTo(0, -r * .85); c.quadraticCurveTo(r * .3, 0, 0, r * .85); c.strokeStyle = '#e2a628'; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.arc(-r * .3, -r * .3, r * .28, 0, TAU); c.fillStyle = 'rgba(255,255,255,.75)'; c.fill();
  }
  // The snooze Z: a chunky Z, white-rimmed and ink-edged so it reads on sky and grass alike, and its dream bubble.
  function sunZPath(c, h) {
    const w = h * .78, t = h * .24;
    c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2, -h / 2 + t); c.lineTo(-w / 2 + t * 1.25, h / 2 - t); c.lineTo(w / 2, h / 2 - t);
    c.lineTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2); c.lineTo(-w / 2, h / 2 - t); c.lineTo(w / 2 - t * 1.25, -h / 2 + t); c.lineTo(-w / 2, -h / 2 + t); c.closePath();
  }
  function paintSunZ(c, h) {
    c.lineJoin = 'round'; sunZPath(c, h);
    c.strokeStyle = SUN.zInk; c.lineWidth = 4.4; c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 2.4; c.stroke(); c.fillStyle = SUN.z; c.fill();
  }
  function paintSunDream(c, r) {
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = 'rgba(234,247,255,.72)'; c.fill(); c.strokeStyle = SUN.bubbleRim; c.lineWidth = 1.6; c.stroke();
    c.beginPath(); c.arc(0, 0, r * .78, -2.5, -1.6); c.strokeStyle = '#ffffff'; c.lineWidth = 1.6; c.lineCap = 'round'; c.stroke();
  }
  // The aim guide's nap: two little z's, the second smaller and higher.
  function paintSunZz(c) { c.save(); c.translate(-4, 3); paintSunZ(c, 11); c.restore(); c.save(); c.translate(7, -7); paintSunZ(c, 7.5); c.restore(); }
  const sunFace = (r, v) => [`kit:sunny:face:${r}:${v}`, [-r * .78, -r * .72, r * .78, r * .62], c => paintSunFace(c, r, v)];
  const SUN_SPRITES = {
    yawn: r => [`kit:sunny:yawn:${r}`, [-r * .22, -r * .26, r * .22, r * .26], c => paintSunYawnMouth(c, r)],
    spiral: r => [`kit:sunny:spiral:${r}`, [-r * .2, -r * .2, r * .2, r * .2], c => paintSunSpiral(c, r)],
    rays: r => [`kit:sunny:rays:${r}`, SUN_TILE(r), c => paintSunRays(c, r)],
    portal: r => [`kit:sunny:portal:${r}`, [-r - 2, -r - 2, r + 2, r + 2], c => paintSunPortal(c, r)],
    swirl: r => [`kit:sunny:swirl:${r}`, [-r * .6, -r * .6, r * .6, r * .6], c => paintSunSwirl(c, r)],
    peek: r => [`kit:sunny:peek:${r}`, [-r - 2, -r - 2, r + 2, r + 2], c => paintSunPeek(c, r)],
    z: h => [`kit:sunny:z:${h}`, [-h * .6, -h * .62, h * .6, h * .62], c => paintSunZ(c, h)],
    dream: r => [`kit:sunny:dream:${r}`, [-r - 2, -r - 2, r + 2, r + 2], c => paintSunDream(c, r)],
    zz: () => ['kit:sunny:zz', [-13, -15, 15, 13], paintSunZz]
  };
  const sunStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  const SUN_FACES = ['sleepy', 'sleepy-blink', 'cranky', 'cranky-blink', 'awake', 'awake-blink', 'asleep', 'asleep-cranky', 'yawn', 'dizzy', 'hurt'];
  // How wide his mouth is (0..1): it opens through a volley's or a yawn's tell, stays wide while a portal is open, and
  // closes as the last one shuts (Sleepy's art-only portals close half a second after the volley drops).
  function sunYawn(state, s, time) {
    const w = s.warning;
    if (w && (w.move === 'yawn' || w.move === 'sprouts') && w.until > w.at) return clamp((time - w.at) / Math.min(1.1, w.until - w.at), 0, 1);
    const clock = Number(s.kitAge) || 0; let open = 0;
    for (const p of s.portals || []) {
      if (!p.closed && !p.bloomed) return 1;
      const since = clock - (p.closed ? p.closedAt : p.shutAt);
      if (since >= 0 && since < .3) open = Math.max(open, 1 - since / .3);
    }
    for (const b of state.buds || []) if (b.sunnySprout && String(b.id).includes('-sprouts-')) {
      const since = time - (Number(b.spawnAt) || -9);
      if (since >= 0 && since < .6) open = Math.max(open, since < .3 ? 1 : 1 - (since - .3) / .3);
    }
    return open;
  }
  // Draws one portal at (x, y): open (0..1+ with the pop's overshoot), squash (0..1 of the spit), a peeking sprout.
  function drawSunPortal(ctx, kit, x, y, r, open, squash, peek, time, still, alpha = 1) {
    if (open <= .01) return;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= alpha;
    ctx.scale(open * (1 + .2 * squash), open * (1 - .2 * squash));
    sunStamp(ctx, kit, SUN_SPRITES.rays(r), 0, 0, still ? 0 : time * .7);
    sunStamp(ctx, kit, SUN_SPRITES.portal(r), 0, 0);
    sunStamp(ctx, kit, SUN_SPRITES.swirl(r), 0, r * .05, still ? 0 : -time * 2.4);
    if (peek > 0) sunStamp(ctx, kit, SUN_SPRITES.peek(9), 0, r * (.12 - .1 * peek) + (still ? 0 : Math.sin(time * 7) * .6), 0, .35 + .55 * peek);
    ctx.restore();
  }
  // A Sleepy volley's art-only portal, or a tell, may only show where no guardian piece or flower sits.
  function sunRoom(state, x, y, r) {
    return (state.buds || []).every(b => b.bloomed || b.hidden || b.sunnySprout || Math.hypot(b.x - x, b.y - y) >= (b.r || 12) + r + 2);
  }
  kitLook('sunny', {
    warm(kit) {
      const r = 24, jobs = [...SUN_FACES.map(v => sunFace(r, v)), SUN_SPRITES.yawn(r), SUN_SPRITES.spiral(r), SUN_SPRITES.rays(16), SUN_SPRITES.portal(16),
        SUN_SPRITES.swirl(16), SUN_SPRITES.peek(9), SUN_SPRITES.z(22), SUN_SPRITES.z(9), SUN_SPRITES.dream(13), SUN_SPRITES.zz()];
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    face(ctx, state, s, bud, time, still, kit) {
      if (!bud.boss) return false;
      const r = Number(bud.r) || 24, look = kit.BOSS_LOOKS.sunny, health = (Number(bud.hp) || 0) / Math.max(1, Number(bud.maxHp) || 1);
      // The face turns with his body: a sleepy sway, a dizzy wobble, a shiver when nearly beaten (as art.js poses him).
      let tilt = 0;
      if (!still) {
        tilt = s.mode === 'sleeping' ? -.05 + Math.sin(time * 1.5) * .025 : s.mode === 'dizzy' ? Math.sin(time * 9) * .095 : 0;
        if (health <= .2) tilt += Math.sin(time * TAU * 6) * .04;
      }
      ctx.translate(bud.x, bud.y); if (tilt) ctx.rotate(tilt); ctx.translate(r * (look.faceX || 0), r * look.faceY);
      const hurt = typeof bud.hitAt === 'number' && time - bud.hitAt >= 0 && time - bud.hitAt < .3, yawn = sunYawn(state, s, time);
      const mood = ['sleepy', 'cranky', 'awake'][clamp(s.tier | 0, 0, 2)], blink = !still && (time + r * .1) % 3.4 < .12;
      const variant = hurt ? 'hurt' : s.mode === 'dizzy' ? 'dizzy' : yawn > .12 ? 'yawn' : s.mode === 'sleeping' ? (s.tier === 1 ? 'asleep-cranky' : 'asleep') : mood + (blink ? '-blink' : '');
      sunStamp(ctx, kit, sunFace(r, variant), 0, 0);
      if (variant === 'yawn') sunStamp(ctx, kit, SUN_SPRITES.yawn(r), 0, r * .3 - r * .05 * (1 - yawn), 0, .7 + .3 * yawn, .25 + .75 * yawn);
      if (variant === 'dizzy') for (const side of [-1, 1]) sunStamp(ctx, kit, SUN_SPRITES.spiral(r), side * r * .26, 0, still ? side : side * time * 7);
      // A mood mark: Cranky's throbbing cross, Wide awake's two twinkles.
      if (variant === 'cranky' || variant === 'cranky-blink') {
        const k = still ? 1 : 1 + .14 * Math.max(0, Math.sin(time * 6)), x = r * .5, y = -r * .52;
        ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(r * .1, r * .1, r * .07, Math.PI, Math.PI * 1.5); ctx.strokeStyle = SUN.cross; ctx.lineWidth = 1.6; ctx.stroke(); }
        ctx.restore();
      } else if (variant === 'awake' || variant === 'awake-blink') {
        for (const [x, y, phase] of [[-r * .58, -r * .42, 0], [r * .6, -r * .48, 1.7]]) {
          const k = still ? .9 : .6 + .4 * Math.abs(Math.sin(time * 3 + phase));
          kit.sparkle(ctx, x, y, r * .11 * k, '#ffffff', .2);
        }
      }
      return true;
    },
    part(ctx, state, s, bud, time, still, kit, quality) {
      const clock = Number(s.kitAge) || 0;
      if (bud.bossPart === 'portal') {
        const age = clock - (Number(bud.born) || 0), r = bud.r || 16;
        const open = still ? 1 : age < .2 ? kit.easeBack(clamp(age / .2, 0, 1)) : 1;
        const since = clock - (bud.spitAt ?? -9), squash = !still && since >= 0 && since < .12 ? Math.sin(since / .12 * Math.PI) : 0;
        // The next sprout peeks out from .5 s and is all the way out by the spit at 1.6 s; after it, the mouth is empty.
        const peek = bud.spitAt == null ? clamp((age - .5) / 1.1, 0, 1) : 0;
        drawSunPortal(ctx, kit, bud.x, bud.y, r, open, squash, peek, time, still);
        return true;
      }
      if (bud.bossPart === 'z') {
        const age = clock - (Number(bud.born) || 0), pop = still ? 1 : kit.easeBack(clamp(age / .25, 0, 1));
        // Three small z's trail behind it along its path (full quality only).
        if (!still && quality === 0 && bud.from && bud.to) for (let k = 0; k < 3; k++) {
          const at = sunZ(bud, clock - .16 * (k + 1)); if (at.u <= 0) break;
          ctx.save(); ctx.globalAlpha *= .5 - k * .13; sunStamp(ctx, kit, SUN_SPRITES.z(9), at.x, at.y, Math.sin(time * 4 + k) * .3, .9 - k * .15); ctx.restore();
        }
        sunStamp(ctx, kit, SUN_SPRITES.dream(13), bud.x, bud.y, 0, pop);
        sunStamp(ctx, kit, SUN_SPRITES.z(22), bud.x, bud.y, still ? 0 : Math.sin(time * TAU * 2) * .1745, pop);
        return true;
      }
      return false;
    },
    over(ctx, state, s, time, still, kit) {
      const clock = Number(s.kitAge) || 0, w = s.warning;
      // Tells: through a volley's or a yawn's warning, a small portal swirls open over each sprout spot.
      if (w && (w.move === 'sprouts' || w.move === 'yawn') && w.until > w.at) {
        const p = clamp((time - w.at) / (w.until - w.at), 0, 1);
        for (const t of w.targets || []) {
          const spot = w.move === 'sprouts' ? t.role === 'sprout' && { x: t.x, y: t.y - SUN_UP } : t.role === 'portal' && t;
          if (!spot || !sunRoom(state, spot.x, spot.y, 16)) continue;
          drawSunPortal(ctx, kit, spot.x, spot.y, 16, .25 + .4 * p, 0, 0, time, still, .55 + .35 * p);
        }
      }
      // Sleepy's volley drops out of art-only portals that pop open, squash as they drop it, then shrink away.
      const real = s.portals || [];
      for (const b of state.buds || []) {
        if (!b.sunnySprout || !String(b.id).includes('-sprouts-')) continue;
        const since = time - (Number(b.spawnAt) || -9), x = b.baseX ?? b.x, y = (b.startY ?? b.y) - SUN_UP;
        if (since < 0 || since >= .6 || real.some(p => Math.abs(p.x - x) < 1 && Math.abs(p.y - y) < 1) || !sunRoom(state, x, y, 16)) continue;
        const open = still ? (since < .45 ? 1 : 0) : since < .1 ? kit.easeBack(since / .1) : since < .35 ? 1 : 1 - kit.smooth((since - .35) / .25);
        drawSunPortal(ctx, kit, x, y, 16, open, !still && since < .12 ? Math.sin(since / .12 * Math.PI) : 0, 0, time, still);
        // A quick streak shows the sprout dropping out of the mouth.
        if (!still && since < .16) { ctx.save(); ctx.globalAlpha *= 1 - since / .16; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, b.y - (b.r || 14)); ctx.strokeStyle = '#fff4aa'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore(); }
      }
      // Real portals closing by themselves (a twist as they shrink) or snapped shut by a seed (quicker, no twist).
      for (const p of real) {
        if (!p.closed && !p.bloomed) continue;
        const shut = !p.closed, since = clock - (shut ? p.shutAt : p.closedAt), span = shut ? .16 : .25;
        if (!(since >= 0 && since < span)) continue;
        const k = since / span;
        ctx.save(); ctx.translate(p.x, p.y); if (!still && !shut) ctx.rotate(k * 1.2);
        drawSunPortal(ctx, kit, 0, 0, p.r || 16, still ? 1 - k : 1 - kit.smooth(k), 0, 0, time, still);
        ctx.restore();
      }
      // The Z's way down: a dotted path to a dashed landing ring just above the launcher, while it is in flight.
      for (const z of (state.buds || [])) {
        if (z.bossPart !== 'z' || z.bloomed || !z.from || !z.to) continue;
        const now = sunZ(z, clock), pts = [];
        for (let i = 0; i <= 18; i++) { const u = now.u + (1 - now.u) * i / 18, at = sunZ(z, z.born + u * z.len / 60); pts.push([at.x, at.y]); }
        ctx.save(); ctx.globalAlpha *= .75; dotted(ctx, pts.slice(1), '#7fb8e8', 1.5, 9, still ? 0 : -time * 18); ctx.restore();
        ctx.save(); ctx.setLineDash([6, 6]); ctx.lineDashOffset = still ? 0 : -time * 8;
        for (const [color, width] of [['#fff6ce', 4], [SUN.zInk, 2]]) { ctx.beginPath(); ctx.arc(z.to.x, z.to.y, 20, 0, TAU); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
        ctx.restore();
        ctx.save(); ctx.globalAlpha *= .55; sunStamp(ctx, kit, SUN_SPRITES.z(9), z.to.x, z.to.y); ctx.restore();
      }
    },
    // Once a Z lands, the aim guide naps: art.js shows only its first 60 px, and a little "zz" dozes at the end.
    aim(ctx, state, s, time, still, kit) {
      const until = Number(state.aimNapUntil) || 0, left = until - (Number(state.time) || 0), aim = state.aim;
      if (!(left > 0) || !Array.isArray(aim) || aim.length < 2) return;
      let x = aim[0].x, y = aim[0].y, rest = 60;
      for (let i = 1; i < aim.length && rest > 0; i++) {
        const a = aim[i - 1], b = aim[i]; if (b.move) break;
        const len = Math.hypot(b.x - a.x, b.y - a.y); if (!len) continue;
        const k = Math.min(1, rest / len); x = a.x + (b.x - a.x) * k; y = a.y + (b.y - a.y) * k; rest -= len;
      }
      const fade = clamp(Math.min(left, 2.5 - left) / .2, 0, 1), bob = still ? 0 : Math.sin(time * 2.4) * 2;
      ctx.globalAlpha *= fade; sunStamp(ctx, kit, SUN_SPRITES.zz(), x + 6, y - 10 + bob, still ? 0 : Math.sin(time * 1.7) * .12);
    }
  });

  // ── Rootknot (Level 2, `root`) ──

  // ── Mother Morel (Level 3, `puff`) ──
  // A grand, motherly morel who dances. Her face shows her mood (s.tier) on her cream stem: Graceful has soft arched
  // brows, lashes and a gentle smile while spores twirl up around her cap; Tricky raises one brow over sideways eyes and
  // a lopsided smirk, with a twinkle; Stormy knits her brows over lidded eyes and a pout under her own grumpy rain cloud.
  // She hums with her eyes shut (little notes rising) while a partner dances, winks through a fakeout or a paint job,
  // puffs her cheeks to call the rain, peeks up from under her lowered bonnet, and squeezes her eyes when hit.
  // Her waltz partner is a puffcap in a lilac bow that leans into the turn (+-10 degrees), steps on the beat (three
  // beats a bar, six bars a turn, the downbeat deeper), trails spores and sheds a music note every bar on a faint
  // dance-floor ring; through the warning that ring shows dotted (#cbbfff, alpha .5) with three chevrons and a ghost
  // partner at each spot. Popped, it bursts into music notes; left alone, it twirls back into her. In Stormy's painted
  // waltz an invisible brush paints stripes across two partners (6 cached frames from +1.0 s for 1.3 s), which then
  // poof into fibcaps with the decoy grammar; the real one twinkles. A fakeout draws dotted arcs and "?" bubbles to its
  // three spots, then tosses the caps spinning, each landing spot glowing as it nears. Ink rain gathers three grumpy
  // cloudlets over dashed lanes through the warning; through the rain each cloud swells a bead of ink exactly where the
  // next drop appears and squashes as it lets go, then the clouds thin away. Animations off: no tilt, step, trail,
  // notes or spin; the wipe jumps at +2.3 s; every tell stays as a still mark.
  const MOREL_ART = { R: 58, spin: 1, bars: 6, ring: '#cbbfff', lilac: '#b58be0', lilacInk: '#6b4a9a', bowLight: '#dcc4fa', note: '#8f66d1',
    spore: '#f4ecff', ink: '#603f4d', eye: '#79576f', lid: '#ecd2ab', cheek: '#e6a28e', storm: '#de7476', mouth: '#7e4656',
    cloud: '#3d356b', cloudTop: '#6b61a6', cloudRim: '#e9dcff', drop: '#2f2a6b', fringe: '#5b4a73', stripe: '#fff7ff', wood: '#b07a4a' };
  const MOREL_FACES = ['graceful', 'graceful-blink', 'tricky', 'tricky-blink', 'stormy', 'stormy-blink', 'hum', 'wink', 'blow', 'bonnet', 'hurt'];
  // Where a partner dances (the same closed form as bosses.js and foes.js orbitAt; art keeps no dependency on the rules).
  function morelSpot(bx, by, a0, t) { const a = a0 + MOREL_ART.spin * t; return { x: bx + MOREL_ART.R * Math.cos(a), y: by + MOREL_ART.R * Math.sin(a), a }; }
  function morelBrow(c, r, side, shape) {
    const B = { soft: [[.11, -.24], [.25, -.36], [.39, -.25]], high: [[.1, -.31], [.24, -.45], [.39, -.32]], low: [[.1, -.19], [.25, -.23], [.41, -.2]],
      v: [[.08, -.14], [.25, -.24], [.42, -.33]], worry: [[.08, -.3], [.25, -.3], [.4, -.21]] }[shape];
    c.beginPath(); c.moveTo(side * r * B[0][0], r * B[0][1]); c.quadraticCurveTo(side * r * B[1][0], r * B[1][1], side * r * B[2][0], r * B[2][1]);
    c.strokeStyle = MOREL_ART.ink; c.lineWidth = shape === 'v' ? 2.2 : 1.45; c.lineCap = 'round'; c.stroke();
  }
  // kind: lash (open, with lashes), side (pupils glancing aside), half (a level lid), stern (a lid slanting to the nose),
  // up (pupils raised), shut (a happy closed arc with lashes), blink, squeeze (a chevron).
  function morelEye(c, r, side, kind) {
    const x = side * r * .24, rx = r * .11, ry = r * .13, A = MOREL_ART;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = A.ink;
    if (kind === 'shut' || kind === 'blink') {
      c.beginPath();
      if (kind === 'shut') c.arc(x, r * .05, rx * 1.05, Math.PI + .4, -.4); else { c.moveTo(x - rx * 1.1, r * .01); c.quadraticCurveTo(x, r * .05, x + rx * 1.1, r * .01); }
      c.lineWidth = 1.6; c.stroke();
      const ex = x + side * rx * (kind === 'shut' ? .97 : 1.1), ey = kind === 'shut' ? r * .01 : r * .01;
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + side * r * .075, ey - r * .03); c.moveTo(ex - side * r * .01, ey - r * .02); c.lineTo(ex + side * r * .045, ey - r * .085);
      c.lineWidth = 1; c.stroke();
      return;
    }
    if (kind === 'squeeze') {
      c.beginPath(); c.moveTo(x + side * rx * 1.1, -r * .08); c.lineTo(x - side * rx * .8, 0); c.lineTo(x + side * rx * 1.1, r * .08); c.lineWidth = 1.8; c.stroke();
      return;
    }
    const glance = kind === 'side' ? r * .04 : 0, up = kind === 'up' ? -r * .05 : 0;
    c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    c.beginPath(); c.arc(x + glance - side * r * .01, r * .025 + up, r * .068, 0, TAU); c.fillStyle = A.eye; c.fill();
    c.beginPath(); c.arc(x + glance - side * r * .03, -r * .02 + up, r * .026, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    if (kind === 'half' || kind === 'stern') {
      const inner = kind === 'stern' ? r * .03 : -r * .015, outer = kind === 'stern' ? -r * .08 : -r * .015;
      c.save(); c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.clip();
      c.beginPath(); c.moveTo(x - side * rx * 1.2, inner); c.lineTo(x + side * rx * 1.2, outer); c.lineTo(x + side * rx * 1.2, -ry * 1.2); c.lineTo(x - side * rx * 1.2, -ry * 1.2); c.closePath();
      c.fillStyle = A.lid; c.fill(); c.restore();
      c.beginPath(); c.moveTo(x - side * rx * 1.1, inner); c.lineTo(x + side * rx * 1.1, outer); c.lineWidth = 1.5; c.stroke();
    }
    c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.lineWidth = 1.15; c.stroke();
    if (kind === 'lash' || kind === 'side' || kind === 'up') {
      // Two lashes at the outer top corner: she is a lady.
      for (const k of [0, 1]) {
        const a = -Math.PI / 2 + side * (.75 + k * .45), px = x + rx * Math.cos(a), py = ry * Math.sin(a);
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * r * .07, py + Math.sin(a) * r * .07); c.lineWidth = 1; c.stroke();
      }
    }
  }
  function morelMouth(c, r, kind) {
    const A = MOREL_ART;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = A.ink;
    if (kind === 'smile') { c.beginPath(); c.arc(0, r * .22, r * .11, .35, Math.PI - .35); c.lineWidth = 1.5; c.stroke(); }
    else if (kind === 'smirk') {
      c.beginPath(); c.moveTo(-r * .11, r * .29); c.quadraticCurveTo(r * .03, r * .37, r * .15, r * .23); c.lineWidth = 1.5; c.stroke();
      c.beginPath(); c.moveTo(r * .13, r * .2); c.lineTo(r * .18, r * .25); c.lineWidth = 1; c.stroke();
    } else if (kind === 'pout') { c.beginPath(); c.arc(0, r * .41, r * .09, Math.PI + .55, -.55); c.lineWidth = 1.7; c.stroke(); }
    else if (kind === 'hum' || kind === 'oh') {
      c.beginPath(); c.ellipse(0, r * .3, r * (kind === 'hum' ? .05 : .04), r * (kind === 'hum' ? .065 : .05), 0, 0, TAU); c.fillStyle = A.mouth; c.fill(); c.lineWidth = 1; c.stroke();
    } else if (kind === 'blow') {
      c.beginPath(); c.ellipse(r * .05, r * .3, r * .065, r * .055, 0, 0, TAU); c.fillStyle = A.mouth; c.fill(); c.lineWidth = 1.7; c.stroke();
    } else if (kind === 'ouch') { c.beginPath(); c.ellipse(0, r * .31, r * .08, r * .07, 0, 0, TAU); c.fillStyle = A.mouth; c.fill(); c.lineWidth = 1.2; c.stroke(); }
  }
  function paintMorelFace(c, r, variant) {
    const A = MOREL_ART, blink = variant.endsWith('-blink'), base = blink ? variant.slice(0, -6) : variant, puffed = base === 'blow';
    for (const side of [-1, 1]) {
      c.save(); c.globalAlpha = base === 'stormy' ? .85 : puffed ? .8 : .65;
      c.beginPath(); c.ellipse(side * r * (puffed ? .4 : .42), r * .17, r * (puffed ? .15 : .1), r * (puffed ? .11 : .055), side * -.25, 0, TAU);
      c.fillStyle = base === 'stormy' ? A.storm : A.cheek; c.fill(); c.restore();
    }
    const brows = { graceful: ['soft', 'soft'], tricky: ['high', 'low'], stormy: ['v', 'v'], hum: ['high', 'high'], wink: ['high', 'low'], blow: ['v', 'v'],
      bonnet: ['worry', 'worry'], hurt: ['v', 'v'] }[base];
    morelBrow(c, r, -1, brows[0]); morelBrow(c, r, 1, brows[1]);
    const eyes = blink ? ['blink', 'blink'] : { graceful: ['lash', 'lash'], tricky: ['side', 'half'], stormy: ['stern', 'stern'], hum: ['shut', 'shut'],
      wink: ['side', 'shut'], blow: ['squeeze', 'squeeze'], bonnet: ['up', 'up'], hurt: ['squeeze', 'squeeze'] }[base];
    morelEye(c, r, -1, eyes[0]); morelEye(c, r, 1, eyes[1]);
    morelMouth(c, r, { graceful: 'smile', tricky: 'smirk', stormy: 'pout', hum: 'hum', wink: 'smirk', blow: 'blow', bonnet: 'oh', hurt: 'ouch' }[base]);
  }
  // The partner's lilac bow (drawn after any paint, so it stays on top).
  function paintMorelBow(c, k) {
    const A = MOREL_ART;
    c.lineJoin = 'round'; c.lineWidth = 1;
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * .6 * k, .8 * k); c.lineTo(side * 2.8 * k, 5.6 * k); c.lineTo(side * 1.1 * k, 5.1 * k); c.closePath();
      c.fillStyle = A.lilac; c.fill(); c.strokeStyle = A.lilacInk; c.stroke();
    }
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(side * 4.6 * k, -4.2 * k, side * 7.2 * k, -1 * k, side * 6.2 * k, 2.4 * k); c.bezierCurveTo(side * 4.8 * k, 3.8 * k, side * 2.4 * k, 2 * k, 0, 0); c.closePath();
      c.fillStyle = A.lilac; c.fill(); c.strokeStyle = A.lilacInk; c.stroke();
      c.beginPath(); c.moveTo(side * 1.6 * k, -.6 * k); c.quadraticCurveTo(side * 3.8 * k, -2.2 * k, side * 5 * k, -.6 * k); c.strokeStyle = A.bowLight; c.lineWidth = .9; c.stroke(); c.lineWidth = 1;
    }
    c.beginPath(); c.arc(0, .3 * k, 1.7 * k, 0, TAU); c.fillStyle = A.bowLight; c.fill(); c.strokeStyle = A.lilacInk; c.stroke();
  }
  // Wipe frame f (0..5): the left (f + 1) / 6 of the puffcap painted fibcap lilac with three white zig-zag stripes.
  function paintMorelWipe(c, r, f) {
    const A = MOREL_ART, k = r / 12, edge = -r + 2 * r * (f + 1) / 6;
    c.save(); c.beginPath(); c.ellipse(0, 0, r + .8, r * .9 + .8, 0, 0, TAU); c.clip();
    const brush = () => { c.beginPath(); c.moveTo(-r - 3, -r - 3); for (let i = 0; i <= 8; i++) c.lineTo(edge + (i % 2 ? 1.7 : -1.1) * k, -r + i * r / 4); c.lineTo(-r - 3, r + 3); c.closePath(); };
    brush(); c.fillStyle = A.lilac; c.fill();
    c.save(); brush(); c.clip();
    c.beginPath(); c.ellipse(r * .55, r * .2, r * .7, r * 1.1, 0, 0, TAU); c.fillStyle = '#9469c9'; c.fill();
    c.strokeStyle = A.stripe; c.lineWidth = 2.1 * k; c.lineJoin = 'miter'; c.lineCap = 'butt';
    for (const y of [-.58, -.08, .42]) {
      c.beginPath();
      for (let i = 0, x = -r - 2.6 * k; x <= r + 2.6 * k; i++, x += 2.6 * k) { const py = (y + (i % 2 ? -.12 : .12)) * r; if (i) c.lineTo(x, py); else c.moveTo(x, py); }
      c.stroke();
    }
    c.restore();
    brush(); c.strokeStyle = '#7f58b3'; c.lineWidth = 1; c.stroke();
    c.restore();
  }
  function paintMorelNote(c) {
    const A = MOREL_ART, head = () => { c.beginPath(); c.ellipse(-1.6, 3.6, 2.9, 2.1, -.4, 0, TAU); }, stem = () => { c.beginPath(); c.moveTo(1, 3.2); c.lineTo(1, -6); c.quadraticCurveTo(4, -4.6, 5.2, -1.4); };
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#ffffff'; c.lineWidth = 3.4; head(); c.stroke(); stem(); c.stroke();
    c.fillStyle = A.note; head(); c.fill(); c.strokeStyle = A.note; c.lineWidth = 1.5; stem(); c.stroke();
  }
  // A "?" bubble over a fakeout spot (a path, so it never waits on a web font).
  function paintMorelAsk(c) {
    const A = MOREL_ART;
    c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fillStyle = 'rgba(255,255,255,.94)'; c.fill(); c.strokeStyle = A.lilac; c.lineWidth = 1.6; c.stroke();
    c.beginPath(); c.moveTo(-.8, 7.6); c.lineTo(-3.6, 11.4); c.lineTo(2.2, 7.4); c.closePath(); c.fillStyle = 'rgba(255,255,255,.94)'; c.fill();
    c.beginPath(); c.arc(0, -2.1, 2.7, Math.PI * 1.02, Math.PI * 2.42); c.lineTo(0, 1.7); c.strokeStyle = A.lilacInk; c.lineWidth = 1.9; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.arc(0, 4.4, 1.15, 0, TAU); c.fillStyle = A.lilacInk; c.fill();
  }
  // A grumpy little ink cloud, with a pale rim so it reads on the dark Grotto.
  function paintMorelCloud(c) {
    const A = MOREL_ART, blobs = [[-9.5, 1.5, 6.5], [-3, -3.5, 7.5], [5, -2.5, 7], [10.5, 2, 5.5], [0, 3, 7.5]];
    for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x, y, r + 1.5, 0, TAU); c.fillStyle = A.cloudRim; c.fill(); }
    for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = A.cloud; c.fill(); }
    for (const [x, y, r] of blobs.slice(0, 4)) { c.beginPath(); c.arc(x - r * .2, y - r * .38, r * .48, 0, TAU); c.fillStyle = A.cloudTop; c.fill(); }
    c.lineCap = 'round'; c.strokeStyle = A.cloudRim; c.fillStyle = A.cloudRim;
    for (const side of [-1, 1]) {
      c.beginPath(); c.arc(side * 3.6, 2.4, 1.2, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(side * 5.6, -.8); c.lineTo(side * 1.9, .4); c.lineWidth = 1.1; c.stroke();
    }
    c.beginPath(); c.moveTo(-2, 6.2); c.quadraticCurveTo(0, 4.9, 2, 6.2); c.lineWidth = 1; c.stroke();
  }
  // A bead of ink, the same navy and pale rim as an inkcap's drop.
  function paintMorelBead(c) {
    const A = MOREL_ART, r = 4;
    c.beginPath(); c.moveTo(0, -r * 1.7); c.bezierCurveTo(r * .4, -r, r, -r * .2, r, r * .25); c.arc(0, r * .25, r, 0, Math.PI); c.bezierCurveTo(-r, -r * .2, -r * .4, -r, 0, -r * 1.7); c.closePath();
    c.fillStyle = A.drop; c.fill(); c.strokeStyle = A.cloudRim; c.lineWidth = 1.1; c.stroke();
    c.beginPath(); c.arc(-r * .35, 0, r * .28, 0, TAU); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill();
  }
  // The invisible painter's brush: a lilac tip at the origin on a little wooden handle.
  function paintMorelBrush(c) {
    const A = MOREL_ART;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(3, -3); c.lineTo(12, -12); c.strokeStyle = '#ffffff'; c.lineWidth = 4.4; c.stroke(); c.strokeStyle = A.wood; c.lineWidth = 2.4; c.stroke();
    c.beginPath(); c.moveTo(1.6, -1.6); c.lineTo(4.2, -4.2); c.strokeStyle = '#c9c9d6'; c.lineWidth = 3.2; c.stroke();
    c.beginPath(); c.ellipse(0, 0, 2.6, 4.2, Math.PI / 4, 0, TAU); c.fillStyle = A.lilac; c.fill(); c.strokeStyle = A.lilacInk; c.lineWidth = .9; c.stroke();
  }
  const morelFace = (r, v) => [`kit:puff:face:${r}:${v}`, [-r * .64, -r * .52, r * .64, r * .5], c => paintMorelFace(c, r, v)];
  const MOREL_SPRITES = {
    cap: (kit, r) => [`kit:puff:cap:${r}`, [-r - 7, -r - 7, r + 7, r + 8], c => kit.drawPuffcap(c, { x: 0, y: 0, r }, 0, true)],
    bow: r => [`kit:puff:bow:${r}`, [-r * .66, -r * .5, r * .66, r * .56], c => paintMorelBow(c, r / 12)],
    wipe: (r, f) => [`kit:puff:wipe:${r}:${f}`, [-r - 4, -r - 4, r + 4, r + 4], c => paintMorelWipe(c, r, f)],
    note: () => ['kit:puff:note', [-6, -9, 8, 8], paintMorelNote],
    ask: () => ['kit:puff:ask', [-10, -10, 10, 13], paintMorelAsk],
    cloud: () => ['kit:puff:cloud', [-18, -13, 18, 12], paintMorelCloud],
    bead: () => ['kit:puff:bead', [-6, -9, 6, 7], paintMorelBead],
    brush: () => ['kit:puff:brush', [-4, -15, 15, 4], paintMorelBrush]
  };
  const morelStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  // A puffcap in its bow, at the current origin.
  function morelCap(ctx, kit, r) { morelStamp(ctx, kit, MOREL_SPRITES.cap(kit, r), 0, 0); morelStamp(ctx, kit, MOREL_SPRITES.bow(r), r * .38, -r * .7, .35); }
  // A painted partner: the fibcap look (matte disc, rock, glint) at the current origin.
  function morelFib(ctx, state, id, r, time, still, kit, quality) {
    const look = LOOKS.fibcap;
    if (look && look.bud) { ctx.save(); look.bud(ctx, { id, foe: 'fibcap', x: 0, y: 0, r }, time, still, state, kit, quality); ctx.restore(); }
    else morelStamp(ctx, kit, MOREL_SPRITES.cap(kit, r), 0, 0);
  }
  // The dance floor: a dotted ring at R around her, flowing with the dancers (phase), and three chevrons on a warning.
  function morelFloor(ctx, x, y, alpha, phase, chevrons, turn) {
    const R = MOREL_ART.R, pts = [];
    for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; pts.push([x + R * Math.cos(a), y + R * Math.sin(a)]); }
    ctx.save(); ctx.globalAlpha *= alpha; dotted(ctx, pts, MOREL_ART.ring, 1.7, TAU * R / 40, phase); ctx.restore();
    if (!chevrons) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const a = turn + i * TAU / 3;
      ctx.save(); ctx.translate(x + R * Math.cos(a), y + R * Math.sin(a)); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(-3, -4.5); ctx.lineTo(2.5, 0); ctx.lineTo(-3, 4.5);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4.2; ctx.stroke(); ctx.strokeStyle = MOREL_ART.ring; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  const morelDancing = s => (s.parts || []).some(p => (p.bossPart === 'waltz' || p.bossPart === 'fibwaltz') && !p.bloomed);
  const morelCloudY = b => b.y + (b.r || 25) - 2;
  kitLook('puff', {
    warm(kit) {
      const r = 25, jobs = [...MOREL_FACES.map(v => morelFace(r, v)), MOREL_SPRITES.cap(kit, 12), MOREL_SPRITES.bow(12), MOREL_SPRITES.note(), MOREL_SPRITES.ask(),
        MOREL_SPRITES.cloud(), MOREL_SPRITES.bead(), MOREL_SPRITES.brush()];
      for (let f = 0; f < 6; f++) jobs.push(MOREL_SPRITES.wipe(12, f));
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
      if (LOOKS.fibcap && LOOKS.fibcap.warm) LOOKS.fibcap.warm(kit, 12);
    },
    face(ctx, state, s, bud, time, still, kit, quality) {
      if (!bud.boss) return false;
      const r = Number(bud.r) || 25, look = kit.BOSS_LOOKS.puff, health = (Number(bud.hp) || 0) / Math.max(1, Number(bud.maxHp) || 1), clock = Number(s.kitAge) || 0;
      const w = s.warning && time < s.warning.until ? s.warning : null, tier = clamp(s.tier | 0, 0, 2), bonnet = s.mode === 'bonnet';
      const hurt = typeof bud.hitAt === 'number' && time - bud.hitAt >= 0 && time - bud.hitAt < .3;
      const dancing = (s.parts || []).some(p => p.bossPart === 'waltz' && !p.bloomed);
      const painting = (s.parts || []).some(p => p.painting && p.bossPart === 'waltz' && !p.bloomed && clock - p.born >= 1 && clock - p.born < 2.3);
      const tossing = (s.lobs || []).some(l => l.look === 'puffcap' || l.look === 'fibcap'), blink = !still && (time + r * .1) % 3.7 < .12;
      const variant = hurt ? 'hurt' : bonnet ? 'bonnet' : w && w.move === 'ink' ? 'blow' : w && (w.move === 'fakeout' || w.move === 'fibwaltz') || tossing || painting ? 'wink'
        : tier < 2 && (dancing || w && w.move === 'waltz') ? 'hum' : ['graceful', 'tricky', 'stormy'][tier] + (blink ? '-blink' : '');
      // The face turns with her body: a shiver when nearly beaten (as art.js poses her).
      ctx.translate(bud.x, bud.y); if (!still && health <= .2) ctx.rotate(Math.sin(time * TAU * 6) * .04);
      const capTop = -r * (bonnet ? 1.37 : 1.67);
      // Mood marks, around her body: Graceful's twirling spores, Stormy's own grumpy cloud with a drizzle on her cap.
      const alpha = ctx.globalAlpha;
      if (tier === 0 && !still && quality === 0) {
        for (let i = 0; i < 5; i++) {
          const ph = (time * .28 + i / 5) % 1, a = time * 1.2 + i * TAU / 5;
          ctx.globalAlpha = alpha * Math.sin(Math.PI * ph) * .85;
          kit.circle(ctx, Math.cos(a) * r * (1.02 + .38 * ph), -r * .3 - r * 1.45 * ph + Math.sin(a) * r * .12, 1.4 + .9 * (1 - ph), MOREL_ART.spore, MOREL_ART.lilac, .7);
        }
        ctx.globalAlpha = alpha;
      } else if (tier === 2) {
        const cx = r * .34, cy = capTop - 7 + (still ? 0 : Math.sin(time * 1.3) * 1.2);
        ctx.lineCap = 'round'; ctx.strokeStyle = MOREL_ART.cloudRim; ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const k = still ? .45 : (time * 1.6 + i / 3) % 1, x = cx - 5 + i * 5 - k * 1.5, y = cy + 4 + k * 9;
          ctx.globalAlpha = alpha * (still ? .8 : (1 - k) * .9); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1, y + 3); ctx.stroke();
        }
        ctx.globalAlpha = alpha; morelStamp(ctx, kit, MOREL_SPRITES.cloud(), cx, cy, 0, .52);
      }
      // Humming: a note drifts up from her mouth now and then.
      if (variant === 'hum' && !still && quality <= 1) {
        for (let j = 0; j < 2; j++) {
          const ph = (time * .8 + j * .5) % 1;
          ctx.save(); ctx.globalAlpha *= Math.sin(Math.PI * ph); morelStamp(ctx, kit, MOREL_SPRITES.note(), r * .55 + ph * 9, r * .62 - ph * 24, Math.sin(ph * 6) * .3, .75); ctx.restore();
        }
      }
      ctx.translate(r * (look.faceX || 0), r * look.faceY + (bonnet ? r * .06 : 0));
      morelStamp(ctx, kit, morelFace(r, variant), 0, 0);
      if (variant === 'tricky' || variant === 'tricky-blink') {
        const k = still ? .9 : .55 + .45 * Math.abs(Math.sin(time * 2.6));
        kit.sparkle(ctx, r * .47, -r * .3, r * .12 * k, '#ffffff', .2);
      }
      return true;
    },
    part(ctx, state, s, bud, time, still, kit, quality) {
      if (bud.bossPart !== 'waltz' && bud.bossPart !== 'fibwaltz') return false;
      const clock = Number(s.kitAge) || 0, age = clock - (Number(bud.born) || 0), r = bud.r || 12, a0 = Number(bud.a0) || 0, b = s.boss, alpha = ctx.globalAlpha;
      // A trail of spores behind it on the floor, and a music note shed at every bar.
      if (!still && quality <= 1 && b) {
        const n = quality ? 4 : 8;
        for (let k = 1; k <= n; k++) {
          const t = age - k * .07; if (t < 0) break;
          const at = morelSpot(b.x, b.y, a0, t);
          ctx.globalAlpha = alpha * .6 * (1 - k / (n + 1)); kit.circle(ctx, at.x, at.y + r * .25, 2.5 - 1.5 * k / n, MOREL_ART.spore);
        }
        ctx.globalAlpha = alpha;
        const bar = TAU / (MOREL_ART.spin * MOREL_ART.bars), now = Math.floor(age / bar);
        for (let j = now; j >= now - 1 && j >= 1; j--) {
          const k = (age - j * bar) / .9; if (k < 0 || k >= 1) continue;
          const at = morelSpot(b.x, b.y, a0, j * bar), side = j % 2 ? 1 : -1;
          ctx.save(); ctx.globalAlpha *= k < .15 ? k / .15 : 1 - (k - .15) / .85;
          morelStamp(ctx, kit, MOREL_SPRITES.note(), at.x + side * (5 + 7 * k) + Math.sin(k * 7) * 2, at.y - r - 16 * k, Math.sin(k * 5) * .3 * side, .8 + .2 * k);
          ctx.restore();
        }
      }
      // It leans into the turn and steps on the beat: three beats a bar, six bars a turn, the downbeat deeper.
      let tilt = 0, sx = 1, sy = 1;
      if (!still) {
        tilt = -.1745 * Math.cos(a0 + MOREL_ART.spin * age);
        const beats = age * MOREL_ART.spin * MOREL_ART.bars * 3 / TAU, beat = Math.floor(beats), f = beats - beat, q = (beat % 3 === 0 ? .12 : .05) * (1 - f) * (1 - f);
        const pop = age < .3 ? kit.easeBack(clamp(age / .3, 0, 1)) : 1;
        sx = (1 + q) * pop; sy = (1 - q) * pop;
      }
      ctx.save(); ctx.translate(bud.x, bud.y + r * .9); if (tilt) ctx.rotate(tilt); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy); ctx.translate(0, -r * .9);
      if (bud.bossPart === 'fibwaltz') {
        // Painted: it poofs into a fibcap.
        const since = clock - (Number.isFinite(bud.paintedAt) ? bud.paintedAt : -9), poof = still || since >= .25 ? 1 : kit.easeBack(clamp(since / .25, 0, 1));
        if (poof !== 1) ctx.scale(poof, poof);
        morelFib(ctx, state, bud.id, r, time, still, kit, quality);
        ctx.restore();
        if (!still && since >= 0 && since < .35) {
          const k = since / .35; ctx.globalAlpha = alpha * (1 - k);
          kit.circle(ctx, bud.x, bud.y, r + 4 + 14 * k, null, '#ffffff', 2.6); kit.circle(ctx, bud.x, bud.y, r + 4 + 14 * k, null, MOREL_ART.lilac, 1.2);
          ctx.globalAlpha = alpha;
        }
        return true;
      }
      morelStamp(ctx, kit, MOREL_SPRITES.cap(kit, r), 0, 0);
      const wipe = age - 1;
      if (bud.painting && !still && wipe >= 0 && wipe < 1.3) {
        morelStamp(ctx, kit, MOREL_SPRITES.wipe(r, Math.min(5, Math.floor(wipe / 1.3 * 6))), 0, 0);
        morelStamp(ctx, kit, MOREL_SPRITES.brush(), -r + 2 * r * clamp(wipe / 1.3, 0, 1), Math.sin(time * 16) * r * .5, Math.sin(time * 16) * .25);
      }
      morelStamp(ctx, kit, MOREL_SPRITES.bow(r), r * .38, -r * .7, .35);
      ctx.restore();
      // The real one twinkles as the others are painted: find the spots!
      const spotted = clock - (Number.isFinite(bud.spottedAt) ? bud.spottedAt : -9);
      if (spotted >= 0 && spotted < 1.2) {
        const k = still ? 1 : Math.sin(Math.PI * spotted / 1.2);
        kit.sparkle(ctx, bud.x + r * .75, bud.y - r * .75, r * .5 * k, '#ffffff', .2); kit.sparkle(ctx, bud.x - r * .85, bud.y - r * .05, r * .3 * k, '#fff3b0', .5);
      }
      return true;
    },
    under(ctx, state, s, time, still, kit) {
      const b = s.boss, clock = Number(s.kitAge) || 0;
      if (!b || b.bloomed) return;
      // The dance floor while a partner dances.
      if (morelDancing(s)) morelFloor(ctx, b.x, b.y, .3, still ? 0 : -clock * MOREL_ART.R * MOREL_ART.spin, false, 0);
      // Ink clouds: gathering over their lanes through the warning, raining, then thinning away. Under the buds, so the
      // middle one gathers behind her skirt.
      const w = s.warning && time < s.warning.until ? s.warning : null, cy = morelCloudY(b);
      if (w && w.move === 'ink') {
        const p = clamp((time - w.at) / Math.max(.1, w.until - w.at), 0, 1), grow = still ? 1 : .3 + .7 * kit.smooth(p);
        for (const t of w.targets || []) if (t.role === 'ink') { ctx.save(); ctx.globalAlpha *= still ? 1 : .35 + .65 * p; morelStamp(ctx, kit, MOREL_SPRITES.cloud(), t.x, cy, 0, grow); ctx.restore(); }
      }
      const ink = s.ink;
      if (ink && Array.isArray(ink.lanes)) {
        const fade = clock > ink.until ? clamp(1 - (clock - ink.until) / .6, 0, 1) : 1;
        ctx.save(); ctx.globalAlpha *= .3 * fade; ctx.setLineDash([5, 9]); ctx.lineDashOffset = still ? 0 : -time * 30; ctx.lineCap = 'round';
        for (const x of ink.lanes) { ctx.beginPath(); ctx.moveTo(x, cy + 14); ctx.lineTo(x, (Number(state.dangerY) || 448) - 8); ctx.strokeStyle = MOREL_ART.cloudRim; ctx.lineWidth = 1.6; ctx.stroke(); }
        ctx.restore();
        ink.lanes.forEach((x, k) => {
          const since = clock - (ink.last ? ink.last[k] : -9), sq = !still && since >= 0 && since < .2 ? Math.sin(since / .2 * Math.PI) : 0;
          const bob = still ? 0 : Math.sin(time * 2 + k * 1.7) * 1.2, spread = (1 - fade) * 10 * (k - (ink.lanes.length - 1) / 2);
          ctx.save(); ctx.globalAlpha *= fade; morelStamp(ctx, kit, MOREL_SPRITES.cloud(), x + spread, cy + bob, 0, (1 + .12 * sq) * (1 + .2 * (1 - fade)), (1 - .12 * sq) * (1 + .2 * (1 - fade))); ctx.restore();
        });
      }
    },
    over(ctx, state, s, time, still, kit, quality) {
      const b = s.boss, clock = Number(s.kitAge) || 0;
      if (!b || b.bloomed) return;
      const w = s.warning && time < s.warning.until ? s.warning : null;
      if (w) {
        const p = clamp((time - w.at) / Math.max(.1, w.until - w.at), 0, 1);
        if (w.move === 'waltz' || w.move === 'fibwaltz') {
          // The dance floor, three chevrons turning the way she will dance, and a ghost partner at each starting spot.
          morelFloor(ctx, b.x, b.y, .5, still ? 0 : -time * MOREL_ART.R * MOREL_ART.spin, true, still ? 0 : time * MOREL_ART.spin);
          for (const t of w.targets || []) {
            if (t.role !== 'waltz') continue;
            ctx.save(); ctx.globalAlpha *= still ? .45 : .2 + .35 * p; ctx.translate(t.x, t.y); if (!still) ctx.scale(.6 + .4 * p, .6 + .4 * p); morelCap(ctx, kit, 12); ctx.restore();
          }
        } else if (w.move === 'fakeout') {
          // Dotted arcs from her to each spot, and a "?" bubble bobbing over it.
          for (const t of w.targets || []) {
            if (t.role !== 'fakeout') continue;
            const pts = []; for (let i = 0; i <= 20; i++) { const at = lobAt(b.x, b.y, t.x, t.y, 1, i / 20, 40); pts.push([at.x, at.y]); }
            ctx.save(); ctx.globalAlpha *= .85; dotted(ctx, pts.slice(2), MOREL_ART.lilac, 1.6, 8, still ? 0 : -time * 16); ctx.restore();
            const pop = still ? 1 : kit.easeBack(clamp(p / .3, 0, 1)), bob = still ? 0 : Math.sin(time * 4 + t.x * .1) * 1.6;
            morelStamp(ctx, kit, MOREL_SPRITES.ask(), t.x, t.y - (t.r || 12) - 13 + bob, still ? 0 : Math.sin(time * 3 + t.x) * .12, pop);
          }
        } else if (w.move === 'ink') {
          // Three dashed lanes flowing down from where the clouds gather, with a first bead hanging under each.
          const cy = morelCloudY(b);
          ctx.save(); ctx.setLineDash([7, 7]); ctx.lineDashOffset = still ? 0 : -time * 24; ctx.lineCap = 'round'; const base = ctx.globalAlpha;
          for (const t of w.targets || []) {
            if (t.role !== 'ink') continue;
            for (const [color, width, alpha] of [['#ffffff', 4, .55], [MOREL_ART.fringe, 2, 1]]) {
              ctx.globalAlpha = base * alpha; ctx.beginPath(); ctx.moveTo(t.x, cy + 16); ctx.lineTo(t.x, t.y - 20); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
            }
          }
          ctx.restore();
          for (const t of w.targets || []) if (t.role === 'ink') morelStamp(ctx, kit, MOREL_SPRITES.bead(), t.x, b.y + (b.r || 25) + 8, 0, still ? .8 : .3 + .5 * p);
        }
      }
      // Caps in flight: tossed up out of her, spinning once, each landing spot glowing as it nears.
      for (const l of s.lobs || []) {
        if (l.look !== 'puffcap' && l.look !== 'fibcap') continue;
        const t = clock - l.t0; if (t < 0) continue;
        const at = lobAt(l.x0, l.y0, l.x1, l.y1, l.T, t, 40), u = at.u;
        ctx.save(); ctx.globalAlpha *= .25 + .45 * u; ctx.beginPath(); ctx.ellipse(l.x1, l.y1 + 11, 4 + 8 * u, 1.8 + 2.4 * u, 0, 0, TAU); ctx.fillStyle = MOREL_ART.cloudRim; ctx.fill(); ctx.restore();
        if (!still && quality === 0) for (let k = 1; k <= 3; k++) {
          const back = lobAt(l.x0, l.y0, l.x1, l.y1, l.T, t - k * .05, 40); if (back.u <= 0) break;
          ctx.save(); ctx.globalAlpha *= .5 - k * .12; kit.circle(ctx, back.x, back.y, 2.3 - k * .4, MOREL_ART.spore); ctx.restore();
        }
        ctx.save(); ctx.translate(at.x, at.y); if (!still) ctx.rotate((l.turn || 1) * u * TAU); ctx.scale(.55 + .45 * u, .55 + .45 * u);
        if (l.look === 'fibcap') morelFib(ctx, state, 'morel-lob', 12, time, true, kit, quality); else morelStamp(ctx, kit, MOREL_SPRITES.cap(kit, 12), 0, 0);
        ctx.restore();
      }
      // Ink rain: under each cloud a bead swells exactly where the next drop appears.
      const ink = s.ink;
      if (ink && Array.isArray(ink.lanes) && clock < ink.until) {
        ink.lanes.forEach((x, k) => {
          const next = ink.t0 + .27 * k + .8 * (ink.made ? ink.made[k] : 0), lead = next - clock;
          if (next >= ink.until || lead < 0 || lead >= .35) return;
          morelStamp(ctx, kit, MOREL_SPRITES.bead(), x, b.y + (b.r || 25) + 8, 0, still ? 1 : .3 + .7 * (1 - lead / .35));
        });
      }
      // Partners: popped ones burst into music notes; ones left to the end twirl back into her.
      for (const p of s.partners || []) {
        const r = p.r || 12;
        if (p.closed) {
          const since = clock - (Number(p.closedAt) || 0); if (!(since >= 0 && since < .5)) continue;
          const k = since / .5, e = kit.smooth(k);
          ctx.save(); ctx.globalAlpha *= 1 - k * k; ctx.translate(p.x + (b.x - p.x) * e, p.y + (b.y - p.y) * e); if (!still) ctx.rotate(k * TAU); ctx.scale(1 - .6 * e, 1 - .6 * e);
          if (p.bossPart === 'fibwaltz') morelFib(ctx, state, p.id, r, time, true, kit, quality); else morelCap(ctx, kit, r);
          ctx.restore();
          continue;
        }
        if (!p.bloomed || p.bossPart !== 'waltz' || still || quality > 1) continue;
        const since = time - (Number(p.bloomAt) || -9); if (!(since >= 0 && since < .9)) continue;
        const k = since / .9, out = 6 + 34 * (1 - Math.pow(1 - k, 3));
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * .55;
          ctx.save(); ctx.globalAlpha *= 1 - k * k;
          morelStamp(ctx, kit, MOREL_SPRITES.note(), p.x + Math.cos(a) * out, p.y + Math.sin(a) * out * .8 - 10 * k, Math.sin(k * 6 + i) * .35, .7 + .5 * (1 - k));
          ctx.restore();
        }
      }
    }
  });

  // ── Crystal Heart (Level 4, `crystal`) ──

  // ── Lantern Lily (Level 5, `lotus`) ──


  root.BloomFoeArt = { define, LOOKS, has, bud, under, over, aim, warm, kitLook, KIT_LOOKS, kits };
})(typeof window !== 'undefined' ? window : globalThis);
