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
  // The move's label (art.js drawBossWarning) is drawn before the looks' under/over hooks: a tell drawn through draw()
  // is at full strength around the label and faint (.22) across it, so the words stay readable. draw() must only
  // multiply globalAlpha, never set it.
  function labelTell(ctx, w, draw) {
    if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) { draw(); return; }
    ctx.save(); ctx.font = '600 12px Fredoka';
    const width = Math.min(310, Math.max(130, ctx.measureText(String(w.text || 'A guardian is stirring')).width + 28)); ctx.restore();
    const x = clamp(w.x, width / 2 + 10, 410 - width / 2) - width / 2 - 2, y = clamp(w.y + 61, 45, 395) - 15;
    ctx.save(); ctx.beginPath(); ctx.rect(-120, -120, 660, 900); ctx.rect(x, y, width + 4, 30); ctx.clip('evenodd'); draw(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, width + 4, 30); ctx.clip(); ctx.globalAlpha *= .22; draw(); ctx.restore();
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
  // The mole's center (his r 10 hitbox) is 13 px above his hill's center, on his drawn head; the hole he peeks from is
  // 6.5 px below it. He is drawn a little larger than he is painted (SIZE), so his face reads at phone size; his head
  // spans about 10 px above his center to the hole, inside his r 10 body apart from the hair tips.
  const PERCH = 13, SIZE = 1.15;
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
    // The lost-anchor rumble's still tell: three cracks running out from the hole to the patch's edge.
    patchCracked: [`foe:mole:10:patch-cracked`, [-16, -13, 16, 3], c => {
      paintPatch(c); c.strokeStyle = MOLE_ART.ink; c.lineWidth = 1.2; c.lineCap = 'round';
      for (const crack of [[[-7.4, -5.6], [-9.6, -4.3], [-11.4, -2.7]], [[1.4, -3.9], [3, -2.3], [2.1, -.8]], [[7.2, -7.2], [9.5, -5.7], [11.6, -3.5]]]) {
        c.beginPath(); crack.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
      }
    }],
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
      moleSprite(ctx, kit, base === 'mound' ? 'cracked' : 'patchCracked', x, y);
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
    // A mole whose hills are all gone rumbles up through bare ground: the patch shivers where he will appear. It is
    // drawn over the buds, since his last hill has just bloomed on that spot.
    // Bonk: flat for a beat (the hit-stop holds it), springs up tall with his glasses knocked crooked, then shrinks
    // into his opening flower; three stars circle where his head was for .5 s (quality <= 1). His bud's white bloom
    // flash is a disc that would cover his hill, so his ground is drawn back over it until the hill blooms itself.
    over(ctx, state, time, still, kit, quality) {
      const clock = Number(state.foeClock) || 0;
      for (const mole of state.buds || []) {
        if (mole.foe !== 'mole' || mole.bloomed || !mole.hidden || !mole.anchor || !(mole.rumbleUntil > clock)) continue;
        drawMoleRumble(ctx, kit, mole.x, mole.y + PERCH, mole.rumbleUntil, clock, still, 'patch');
      }
      for (const mole of state.buds || []) {
        if (mole.foe !== 'mole' || !mole.bloomed || typeof mole.bloomAt !== 'number') continue;
        const age = time - mole.bloomAt, hx = mole.x, hy = mole.y + PERCH + HOLE.y;
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
  // A flower bud sealed in a six-sided crystal of its color: bevels in the color's tip, light, base and dark (lit from
  // the upper left), a gloss streak, the closed bud faintly inside, and the color's glyph on the front face, the same
  // glyph the launcher and seed tray show from Level 4, so coral and poppy differ by shape as well as hue. It breathes
  // a little and a twinkle runs round its corners. Whenever the seed in the launcher is its color it glows (a soft
  // halo pulsing, still under reduced motion), so the right moment is easy to see. A wrong seed makes it shiver
  // (app.js stamps bud.refusedAt and ripples rings); the right one cracks it with a white star and flings six shards
  // of its glass as the flower unfurls.
  const CHROMA_ART = { ready: 5.5, twinkle: 3, crack: .1, shards: .5, fling: 30 };
  const chromaBox = r => { const e = r + 3; return [-e, -e, e, e]; };
  function paintChroma(c, kit, r, type) {
    const F = kit.FLOWERS[type] || kit.FLOWERS.sky, R = r + 1, f = R * .6;
    const at = (k, rad) => [Math.cos(-Math.PI / 2 + k * Math.PI / 3) * rad, Math.sin(-Math.PI / 2 + k * Math.PI / 3) * rad];
    const hex = rad => { c.beginPath(); for (let k = 0; k < 6; k++) { const [px, py] = at(k, rad); c.lineTo(px, py); } c.closePath(); };
    c.lineJoin = 'round'; c.lineCap = 'round';
    // Six bevels between the outer edge and the front face: brightest at the upper left, darkest at the lower right.
    const tones = [F.light, F.base, F.dark, kit.shade(F.base, .22), F.light, F.tip];
    for (let k = 0; k < 6; k++) {
      const a = at(k, R), b = at(k + 1, R), p = at(k + 1, f), q = at(k, f);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.closePath();
      c.fillStyle = tones[k]; c.fill();
    }
    // The front face, a gloss streak across its upper left, and the closed bud faintly inside.
    hex(f); c.fillStyle = F.base; c.fill();
    c.save(); hex(f); c.clip();
    c.beginPath(); c.moveTo(-f, -f * .15); c.lineTo(-f * .1, -f); c.lineTo(f * .25, -f); c.lineTo(-f, f * .3); c.closePath();
    c.fillStyle = 'rgba(255,255,255,.28)'; c.fill();
    c.globalAlpha = .5;
    c.beginPath(); c.moveTo(0, -f * 1.02); c.bezierCurveTo(f * .62, -f * .45, f * .58, f * .55, 0, f * .78); c.bezierCurveTo(-f * .58, f * .55, -f * .62, -f * .45, 0, -f * 1.02);
    c.fillStyle = F.tip; c.fill(); c.lineWidth = .7; c.strokeStyle = F.dark; c.stroke();
    c.restore();
    // The edges between the facets, the face's rim, and the crystal's ink outline.
    c.strokeStyle = F.dark; c.globalAlpha = .55; c.lineWidth = .7;
    for (let k = 0; k < 6; k++) { const a = at(k, R), q = at(k, f); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(q[0], q[1]); c.stroke(); }
    hex(f); c.lineWidth = .8; c.stroke();
    c.globalAlpha = 1; hex(R); c.lineWidth = 1.4; c.stroke();
    // A glint on the brightest bevel, then the glyph on the face.
    c.beginPath(); c.arc(-R * .42, -R * .52, 1.1, 0, TAU); c.fillStyle = 'rgba(255,255,255,.95)'; c.fill();
    kit.paintGlyph(c, type);
  }
  // The ready halo: three soft rings of the color's light and a fine white rim, painted once (no gradient).
  function paintChromaGlow(c, kit, r, type) {
    const F = kit.FLOWERS[type] || kit.FLOWERS.sky, R = r + 1;
    for (const [d, w, a] of [[6, 3.4, .16], [4, 3, .32], [2.2, 2.4, .55]]) { c.beginPath(); c.arc(0, 0, R + d, 0, TAU); c.lineWidth = w; c.strokeStyle = F.light; c.globalAlpha = a; c.stroke(); }
    c.globalAlpha = .7; c.beginPath(); c.arc(0, 0, R + 1.3, 0, TAU); c.lineWidth = 1; c.strokeStyle = '#ffffff'; c.stroke();
  }
  // One shard of its glass: a sliver with a lit facet.
  function paintChromaShard(c, kit, type) {
    const F = kit.FLOWERS[type] || kit.FLOWERS.sky;
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-2.6, -3.6); c.lineTo(3.8, -.6); c.lineTo(-.8, 3.8); c.closePath(); c.fillStyle = F.base; c.fill();
    c.beginPath(); c.moveTo(-2.6, -3.6); c.lineTo(3.8, -.6); c.lineTo(.1, .1); c.closePath(); c.fillStyle = F.light; c.fill();
    c.beginPath(); c.moveTo(-2.6, -3.6); c.lineTo(3.8, -.6); c.lineTo(-.8, 3.8); c.closePath(); c.lineWidth = .8; c.strokeStyle = F.dark; c.stroke();
  }
  const chromaBody = (r, type) => [`foe:chroma:${r}:${type}`, chromaBox(r), (c, kit) => paintChroma(c, kit, r, type)];
  const chromaGlow = (r, type) => { const e = r + 9; return [`foe:chroma:${r}:${type}:glow`, [-e, -e, e, e], (c, kit) => paintChromaGlow(c, kit, r, type)]; };
  const chromaShard = type => [`foe:chroma:shard:${type}`, [-5, -5, 5, 5], (c, kit) => paintChromaShard(c, kit, type)];
  // stamp() with a kit-aware painter.
  const stampWith = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, c => paint(c, kit), x, y, turn, sx, sy);
  BloomFoeLook('chroma', {
    warm(kit, r, type) {
      for (const [key, box, paint] of [chromaBody(r, type), chromaGlow(r, type), chromaShard(type)]) kit.atlasSprite(key, box[0], box[1], box[2], box[3], c => paint(c, kit));
    },
    bud(ctx, bud, time, still, state, kit, quality) {
      const r = bud.r || 12, type = kit.FLOWERS[bud.type] ? bud.type : 'sky', x = bud.x, y = bud.y, R = r + 1;
      // Ready: the seed in the launcher is this color.
      if (state.nextType === type) {
        // Relative to the wave's tumble-in fade, so a ghost crystal stays a ghost.
        const a = ctx.globalAlpha;
        ctx.globalAlpha = a * (still ? .9 : .6 + .35 * (.5 + .5 * Math.sin(time * CHROMA_ART.ready)));
        stampWith(ctx, kit, chromaGlow(r, type), x, y);
        ctx.globalAlpha = a;
      }
      // A wrong seed sets it shivering for .15 s.
      const refused = time - (Number.isFinite(bud.refusedAt) ? bud.refusedAt : -100);
      const shiver = !still && refused >= 0 && refused < .15 ? Math.sin(refused * 95) * 1.5 * (1 - refused / .15) : 0;
      const breathe = still ? 1 : 1 + Math.sin(time * Math.PI * .8 + x * .05) * .015;
      stampWith(ctx, kit, chromaBody(r, type), x + shiver, y, 0, breathe);
      // A four-point twinkle at one corner every few seconds, a different corner each time.
      if (!still && quality <= 1) {
        const t = time + x * .013 + y * .007, phase = ((t % CHROMA_ART.twinkle) + CHROMA_ART.twinkle) % CHROMA_ART.twinkle;
        if (phase < .4) {
          const k = Math.floor(t / CHROMA_ART.twinkle) % 6, a = -Math.PI / 2 + ((k + 6) % 6) * Math.PI / 3, s = Math.sin(phase / .4 * Math.PI);
          kit.sparkle(ctx, x + Math.cos(a) * R, y + Math.sin(a) * R, 3.8 * s, '#ffffff', phase * 2);
        }
      }
    },
    over(ctx, state, time, still, kit) {
      for (const bud of state.buds || []) {
        if (bud.foe !== 'chroma') continue;
        const r = bud.r || 12, type = kit.FLOWERS[bud.type] ? bud.type : 'sky', F = kit.FLOWERS[type];
        // Under reduced motion the app's ripples are off, so a wrong seed shows one still ring for .2 s.
        if (still && !bud.bloomed) {
          const a = time - (Number.isFinite(bud.refusedAt) ? bud.refusedAt : -100);
          if (a >= 0 && a < .2) kit.circle(ctx, bud.x, bud.y, r + 7, null, F.base, 2.2);
        }
        if (!bud.bloomed || !bud.matched) continue;
        const age = time - bud.bloomAt;
        if (!(age >= 0 && age < CHROMA_ART.crack + CHROMA_ART.shards)) continue;
        if (age < CHROMA_ART.crack) {
          // The crack: the crystal holds for a blink with a white star split across it.
          stampWith(ctx, kit, chromaBody(r, type), bud.x, bud.y);
          ctx.lineCap = 'round';
          for (const [w, color] of [[2.6, F.dark], [1.2, '#ffffff']]) {
            ctx.beginPath();
            for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + .4, l = (k % 2 ? .7 : 1.05) * r; ctx.moveTo(bud.x, bud.y); ctx.lineTo(bud.x + Math.cos(a) * l, bud.y + Math.sin(a) * l); }
            ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke();
          }
          kit.sparkle(ctx, bud.x, bud.y, 6, '#ffffff', .3);
          continue;
        }
        // Then six shards fly out and fade.
        const q = (age - CHROMA_ART.crack) / CHROMA_ART.shards, out = still ? .45 : kit.ease(q);
        ctx.globalAlpha = still ? 1 - q : 1 - q * q;
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3 + Math.PI / 6, d = 6 + CHROMA_ART.fling * out;
          stampWith(ctx, kit, chromaShard(type), bud.x + Math.cos(a) * d, bud.y + Math.sin(a) * d, a + (still ? 0 : q * 5 * (k % 2 ? 1 : -1)), 1 - .3 * q);
        }
        ctx.globalAlpha = 1;
      }
    }
  });

  // ── Echo Bat (Level 4, `bat`) ──
  // A round lilac bat with big ears and rosy cheeks. Perched, it hugs a little sky crystal with its wings, eyes shut,
  // breathing, z's drifting up. When it wakes its eyes pop open, a gold "!" springs up over it and it hovers flapping
  // fast (8 Hz) while a dashed arc shows exactly where it will swoop, to a dashed ring where it will land. It swoops
  // flapping at 6 Hz, banked along the arc (at most 35 degrees), the rest of the arc still shown ahead of it, and lands
  // with a little hug squash. Caught or bloomed, its silhouette flutters up and away as the flower opens. Reduced
  // motion: no z's, breathing or flaps (wings spread), but the "!", the arc and the ring stay.
  const BAT_ART = { body: '#8f7ac2', wing: '#6d58a6', belly: '#c9b8ee', ink: '#3d2f63', cheek: '#ff9fbf', gem: '#9fd6ff', gemInk: '#3a74b8',
    alert: '#ffd148', cream: '#fff6ce', tellFlap: 16, swoopFlap: 12, bank: 35 * Math.PI / 180 };
  // Wing poses: [tip x, tip y, scallop depth] in radii; folded (perch, awake) hug the crystal instead.
  const BAT_WINGS = { flapUp: [1.75, -1.35, .9], flapDown: [1.85, .75, .7], spread: [2.25, -.35, 1] };
  const batBox = r => [-r * 2.45, -r * 1.95, r * 2.45, r * 1.4];
  function batGem(c, x, y, s) {
    c.beginPath(); for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); } c.closePath();
    c.fillStyle = BAT_ART.gem; c.fill();
    c.save(); c.clip(); c.beginPath(); c.moveTo(x - s, y - s); c.lineTo(x + s * .2, y - s); c.lineTo(x - s, y + s * .3); c.closePath(); c.fillStyle = 'rgba(255,255,255,.6)'; c.fill(); c.restore();
    c.lineWidth = .9; c.strokeStyle = BAT_ART.gemInk; c.stroke();
  }
  function batWing(c, r, side, [tx, ty, open], fill) {
    const S = [side * r * .42, -r * .2], T = [side * r * tx, r * ty], L = [side * r * .38, r * .42];
    const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    const P1 = lerp(T, L, .36), P2 = lerp(T, L, .7);
    P1[1] += r * .32 * open; P2[1] += r * .26 * open;
    c.beginPath(); c.moveTo(S[0], S[1]);
    c.quadraticCurveTo(side * r * tx * .5, Math.min(S[1], T[1]) - r * .35, T[0], T[1]);
    // The trailing edge scallops between the finger tips, each scallop bowing in toward the shoulder.
    let prev = T;
    for (const p of [P1, P2, L]) { const m = lerp(lerp(prev, p, .5), S, .25); c.quadraticCurveTo(m[0], m[1], p[0], p[1]); prev = p; }
    c.closePath(); c.fillStyle = fill || BAT_ART.wing; c.fill();
    if (fill) return;
    c.lineWidth = 1.3; c.strokeStyle = BAT_ART.ink; c.stroke();
    c.globalAlpha = .45; c.lineWidth = .8;
    for (const p of [P1, P2]) { c.beginPath(); c.moveTo(S[0], S[1]); c.lineTo(p[0], p[1]); c.stroke(); }
    c.globalAlpha = 1;
  }
  // frame: perch, awake, flapUp, flapDown, spread, or ghost (a flat silhouette of spread, for the fly-away).
  function paintBat(c, r, frame) {
    const flat = frame === 'ghost' ? BAT_ART.wing : null, wings = BAT_WINGS[flat ? 'spread' : frame], awake = frame !== 'perch';
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (wings) for (const side of [-1, 1]) batWing(c, r, side, wings, flat);
    // In flight it carries its crystal in its feet.
    if (wings && !flat) batGem(c, 0, r * .92, r * .34);
    // Ears, then the round body with its pale belly.
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * r * .58, -r * .3); c.lineTo(side * r * .74, -r * 1.16); c.lineTo(side * r * .12, -r * .62); c.closePath();
      c.fillStyle = flat || BAT_ART.body; c.fill();
      if (flat) continue;
      c.lineWidth = 1.3; c.strokeStyle = BAT_ART.ink; c.stroke();
      c.beginPath(); c.moveTo(side * r * .52, -r * .45); c.lineTo(side * r * .64, -r * .95); c.lineTo(side * r * .26, -r * .6); c.closePath(); c.fillStyle = BAT_ART.belly; c.fill();
    }
    c.beginPath(); c.ellipse(0, r * .05, r * .66, r * .74, 0, 0, TAU); c.fillStyle = flat || BAT_ART.body; c.fill();
    if (flat) return;
    c.save(); c.clip(); c.beginPath(); c.ellipse(0, r * .42, r * .42, r * .42, 0, 0, TAU); c.fillStyle = BAT_ART.belly; c.fill(); c.restore();
    c.beginPath(); c.ellipse(0, r * .05, r * .66, r * .74, 0, 0, TAU); c.lineWidth = 1.4; c.strokeStyle = BAT_ART.ink; c.stroke();
    // The face: shut, content eyes on the perch; big bright eyes and a little fanged "o" awake.
    for (const side of [-1, 1]) {
      const ex = side * r * .26, ey = -r * .12;
      if (awake) {
        c.beginPath(); c.arc(ex, ey, r * .19, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = .9; c.strokeStyle = BAT_ART.ink; c.stroke();
        c.beginPath(); c.arc(ex + side * r * .02, ey + r * .02, r * .11, 0, TAU); c.fillStyle = '#1d1430'; c.fill();
        c.beginPath(); c.arc(ex - r * .02, ey - r * .03, r * .045, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      } else { c.beginPath(); c.arc(ex, ey - r * .05, r * .13, Math.PI * .15, Math.PI * .85); c.lineWidth = 1.2; c.strokeStyle = BAT_ART.ink; c.stroke(); }
      c.beginPath(); c.ellipse(side * r * .45, r * .08, r * .1, r * .06, 0, 0, TAU); c.fillStyle = BAT_ART.cheek; c.fill();
    }
    if (awake) {
      c.beginPath(); c.ellipse(0, r * .16, r * .1, r * .085, 0, 0, TAU); c.fillStyle = '#3a1f4a'; c.fill();
      c.fillStyle = '#ffffff';
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * r * .02, r * .09); c.lineTo(side * r * .08, r * .09); c.lineTo(side * r * .05, r * .17); c.closePath(); c.fill(); }
    } else { c.beginPath(); c.arc(0, r * .1, r * .09, Math.PI * .2, Math.PI * .8); c.lineWidth = 1; c.strokeStyle = BAT_ART.ink; c.stroke(); }
    if (wings) return;
    // Folded: the crystal held at its tummy and both wings wrapped around it like a cloak.
    batGem(c, 0, r * .36, r * .42);
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * r * .48, -r * .26);
      c.quadraticCurveTo(side * r * 1.02, r * .3, side * r * .46, r * .8);
      c.quadraticCurveTo(side * r * .12, r * .92, -side * r * .1, r * .64);
      c.quadraticCurveTo(side * r * .34, r * .42, side * r * .48, -r * .26);
      c.closePath(); c.fillStyle = BAT_ART.wing; c.fill(); c.lineWidth = 1.3; c.strokeStyle = BAT_ART.ink; c.stroke();
      c.beginPath(); c.arc(side * r * .5, -r * .3, r * .07, 0, TAU); c.fillStyle = BAT_ART.ink; c.fill();
    }
  }
  // The gold "!" that springs up when it wakes, with a cream rim and an ink edge so it reads on any scene.
  function paintBatAlert(c) {
    const shape = () => { c.beginPath(); c.moveTo(-1.9, -6.2); c.lineTo(1.9, -6.2); c.lineTo(1, 1.6); c.lineTo(-1, 1.6); c.closePath(); c.moveTo(1.8, 4.6); c.arc(0, 4.6, 1.8, 0, TAU); };
    c.lineJoin = 'round';
    shape(); c.lineWidth = 3.6; c.strokeStyle = BAT_ART.cream; c.stroke();
    shape(); c.lineWidth = 1.5; c.strokeStyle = BAT_ART.ink; c.stroke(); c.fillStyle = BAT_ART.alert; c.fill();
  }
  function paintBatZ(c) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [w, color] of [[2.6, BAT_ART.cream], [1.2, BAT_ART.wing]]) { c.beginPath(); c.moveTo(-2, -2); c.lineTo(2, -2); c.lineTo(-2, 2); c.lineTo(2, 2); c.lineWidth = w; c.strokeStyle = color; c.stroke(); }
  }
  const batFrame = (r, frame) => [`foe:bat:${r}:${frame}`, batBox(r), c => paintBat(c, r, frame)];
  const BAT_ALERT = ['foe:bat:alert', [-4.5, -8.5, 4.5, 8.5], paintBatAlert], BAT_Z = ['foe:bat:z', [-3.5, -3.5, 3.5, 3.5], paintBatZ];
  const batStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  // Where the bat's arc is at u (0..1), and the dashed tell from u on to the landing.
  const batAt = (b, u) => { const v = 1 - u; return [v * v * b.x0 + 2 * v * u * b.cx + u * u * b.x2, v * v * b.y0 + 2 * v * u * b.cy + u * u * b.y2]; };
  function batDash(ctx, draw, offset) {
    ctx.setLineDash([5, 5]); ctx.lineDashOffset = offset; ctx.lineCap = 'round';
    for (const [color, width] of [[BAT_ART.cream, 3], [BAT_ART.wing, 1.5]]) { draw(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  BloomFoeLook('bat', {
    warm(kit, r) {
      for (const [key, box, paint] of [...['perch', 'awake', 'flapUp', 'flapDown', 'spread', 'ghost'].map(f => batFrame(r, f)), BAT_ALERT, BAT_Z]) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    bud(ctx, bud, time, still, state, kit, quality) {
      const r = bud.r || 11, b = bud.bat, clock = Number(state.foeClock) || 0, x = bud.x, y = bud.y;
      if (!b || b.mode === 'perch') {
        // Perched: breathing, a little hug squash as it lands, and z's drifting up.
        const land = clock - (b ? b.landAt : -100), hug = !still && land >= 0 && land < .2 ? Math.sin(land / .2 * Math.PI) : 0;
        const breathe = still ? 1 : 1 + Math.sin(time * Math.PI + x * .05) * .03;
        batStamp(ctx, kit, batFrame(r, 'perch'), x, y, 0, breathe * (1 + .12 * hug), (2 - breathe) * (1 - .12 * hug));
        const a = ctx.globalAlpha;
        if (!still && quality <= 1) for (let k = 0; k < 3; k++) {
          const p = (((time + k * .5 + x * .003) % 1.5) + 1.5) % 1.5 / 1.5;
          ctx.globalAlpha = a * Math.sin(p * Math.PI) * .9;
          batStamp(ctx, kit, BAT_Z, x + r * .7 + p * 4 + k * 1.5, y - r * .9 - p * 10, 0, .7 + .4 * p);
        }
        ctx.globalAlpha = a;
        return;
      }
      if (b.mode === 'tell') {
        // Awake: eyes pop open, then it hovers flapping hard until it goes; a gold "!" springs up above it.
        const age = clock - b.tellAt, flap = Math.floor(age * BAT_ART.tellFlap) % 2;
        const frame = still ? 'spread' : age < .12 ? 'awake' : flap ? 'flapUp' : 'flapDown';
        const pop = still ? 1 : age < .12 ? 1 + .18 * Math.sin(age / .12 * Math.PI) : 1, bob = still || age < .12 ? 0 : (flap ? -1.4 : 1.4);
        batStamp(ctx, kit, batFrame(r, frame), x, y + bob, 0, pop);
        const spring = still ? 1 : kit.easeBack(clamp(age / .18, 0, 1)), hop = still ? 0 : Math.abs(Math.sin(age * 9)) * -2;
        batStamp(ctx, kit, BAT_ALERT, x, y - r - 14 + hop, 0, spring);
        return;
      }
      // Swooping: flapping, banked along its path.
      const u = kit.smooth((clock - b.t0) / 1), v = 1 - u;
      const dx = 2 * v * (b.cx - b.x0) + 2 * u * (b.x2 - b.cx), dy = 2 * v * (b.cy - b.y0) + 2 * u * (b.y2 - b.cy);
      const bank = clamp(Math.atan2(dy, Math.abs(dx) || 1e-6) * (dx < 0 ? -1 : 1), -BAT_ART.bank, BAT_ART.bank);
      const frame = still ? 'spread' : Math.floor((clock - b.t0) * BAT_ART.swoopFlap) % 2 ? 'flapUp' : 'flapDown';
      batStamp(ctx, kit, batFrame(r, frame), x, y, still ? 0 : bank);
    },
    over(ctx, state, time, still, kit) {
      const clock = Number(state.foeClock) || 0;
      for (const bud of state.buds || []) {
        if (bud.foe !== 'bat') continue;
        const b = bud.bat, r = bud.r || 11;
        if (!bud.bloomed && b && b.mode !== 'perch') {
          // The dashed swoop from just clear of the bat to the landing, marching the way it will fly, and the ring.
          let a = b.mode === 'swoop' ? kit.smooth((clock - b.t0) / 1) : 0;
          while (a < 1) { const [px, py] = batAt(b, a); if (Math.hypot(px - bud.x, py - bud.y) > r + 4) break; a += .02; }
          const offset = still ? 0 : -clock * 24;
          if (a < 1) {
            const [sx, sy] = batAt(b, a), qx = b.cx + (b.x2 - b.cx) * a, qy = b.cy + (b.y2 - b.cy) * a;
            batDash(ctx, () => { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(qx, qy, b.x2, b.y2); }, offset);
          }
          batDash(ctx, () => { ctx.beginPath(); ctx.arc(b.x2, b.y2, 14, 0, TAU); }, offset);
        }
        // Bloomed: its silhouette flutters up 30 px and fades over .6 s.
        if (bud.bloomed && !still) {
          const age = time - bud.bloomAt;
          if (!(age >= 0 && age < .6)) continue;
          const k = age / .6;
          ctx.globalAlpha = .6 * (1 - k);
          batStamp(ctx, kit, batFrame(r, 'ghost'), bud.x, bud.y - 30 * kit.ease(k), Math.sin(age * 20) * .12, 1 - .25 * k);
          ctx.globalAlpha = 1;
        }
      }
    }
  });

  // ── Moon Jelly (Level 5, `jelly`) ──
  // A little moon jelly: a see-through blue bell with four lilac clover rings and a pale moon inside, a frilly hem,
  // four trailing tentacles, dot eyes and rosy cheeks. Its pulse is the whole tell. In the thrust ("not now") it
  // squashes, shuts its eyes tight, goes dim and glassy with a wet streak across it, and jets up on two little streaks;
  // in the glide ("now") it lights up: the bell turns bright, the moon inside glows, it smiles, and a moon-blue halo
  // with four twinkles opens around it. With Animations off it keeps the frame swap, the halo and the twinkles (they
  // are the rule); only the squash, the tentacle sway, the twinkling and the jet streaks stop. Vents are stone rings in
  // the lake bed whose hole glows and bubbles for the last second before a jelly comes up (a still bright ring with
  // Animations off). A burst leaves glowdrops: gold drops of light with their glow painted in, twinkling as they fall.
  const JELLY_LOOK = { dome: 'rgba(196,236,255,.8)', dim: 'rgba(118,170,222,.5)', inner: 'rgba(248,253,255,.85)', moon: '#fff6c8', rim: '#8ed2ff',
    frill: '#cbbfff', arm: '#b9a8ff', ink: '#4a6fa8', cheek: '#ff9fbf', vent: '#6c7a8a', hole: '#2c3440', bubble: '#bfe8ff', drop: '#ffd65a',
    dropLight: '#fff4aa', dropInk: '#c47a24' };
  const J_PULSE = .9, J_THRUST = .3;
  function paintJelly(c, r, frame) {
    const thrust = frame === 'thrust', L = JELLY_LOOK, w = r * 1.08, hem = r * .3, top = -r * 1.02;
    c.lineJoin = 'round'; c.lineCap = 'round';
    // Tentacles first, under the bell: wavy and splayed in the glide (two sway frames), bunched and streaming in a thrust.
    c.strokeStyle = L.arm; c.lineWidth = 1.7;
    for (let i = 0; i < 4; i++) {
      const u = (i - 1.5) / 1.5, x0 = u * w * .62, len = thrust ? r * 1.55 : r * 1.15 + (i % 2) * r * .18;
      const spread = thrust ? u * r * .12 : u * r * .4, wave = thrust ? 0 : (frame === 'rest1' ? -1 : 1) * (i % 2 ? 1 : -1) * r * .22;
      c.beginPath(); c.moveTo(x0, hem); c.bezierCurveTo(x0 + spread + wave, hem + len * .35, x0 + spread - wave, hem + len * .7, x0 + spread * 1.4, hem + len); c.stroke();
    }
    // The bell: a dome over a scalloped hem.
    const bell = () => {
      c.beginPath(); c.moveTo(-w, hem);
      c.bezierCurveTo(-w, top * .35, -w * .62, top, 0, top); c.bezierCurveTo(w * .62, top, w, top * .35, w, hem);
      for (let i = 5; i > 0; i--) { const x1 = -w + (i - 1) * w * .4, xm = x1 + w * .2; c.quadraticCurveTo(xm, hem + r * .2, x1, hem); }
      c.closePath();
    };
    bell(); c.fillStyle = thrust ? L.dim : L.dome; c.fill();
    c.save(); bell(); c.clip();
    // The inner bell, lit with its little moon in the glide, dim and glassy in a thrust, and the four clover rings.
    c.beginPath(); c.ellipse(0, -r * .2, w * .72, r * .62, 0, 0, TAU); c.fillStyle = thrust ? 'rgba(170,212,245,.3)' : L.inner; c.fill();
    if (!thrust) { c.beginPath(); c.arc(0, -r * .58, r * .2, 0, TAU); c.fillStyle = L.moon; c.fill(); }
    c.strokeStyle = L.frill; c.lineWidth = 1.1; c.globalAlpha = .85;
    for (const [ox, oy] of [[-.36, -.5], [.36, -.5], [-.14, -.78], [.14, -.78]]) { c.beginPath(); c.arc(ox * r, oy * r, r * .14, 0, TAU); c.stroke(); }
    c.globalAlpha = 1;
    // A wet glint: a soft white sheen on the dome, and in a thrust a slick streak across it.
    c.beginPath(); c.ellipse(-r * .42, -r * .55, r * .3, r * .14, -.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.75)'; c.fill();
    if (thrust) { c.beginPath(); c.moveTo(-w * .7, -r * .05); c.quadraticCurveTo(0, -r * .32, w * .75, -r * .28); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.4; c.stroke(); }
    // The frilly hem.
    c.beginPath(); c.ellipse(0, hem, w * 1.1, r * .17, 0, 0, TAU); c.fillStyle = L.frill; c.globalAlpha = .7; c.fill(); c.globalAlpha = 1;
    c.restore();
    bell(); c.strokeStyle = L.ink; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.moveTo(-w * .78, -r * .2); c.bezierCurveTo(-w * .6, top * .92, w * .6, top * .92, w * .78, -r * .2); c.strokeStyle = L.rim; c.lineWidth = 1.4; c.stroke();
    // The face: open dot eyes and a smile in the glide; squeezed-shut eyes and a little "o" in a thrust.
    c.strokeStyle = L.ink; c.fillStyle = L.ink; c.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      const ex = side * r * .3, ey = -r * .12;
      if (thrust) { c.beginPath(); c.moveTo(ex - side * r * .12, ey - r * .1); c.lineTo(ex + side * r * .04, ey); c.lineTo(ex - side * r * .12, ey + r * .1); c.stroke(); }
      else {
        c.beginPath(); c.arc(ex, ey, r * .11, 0, TAU); c.fill();
        c.beginPath(); c.arc(ex - r * .035, ey - r * .04, r * .04, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.fillStyle = L.ink;
      }
      c.beginPath(); c.ellipse(side * r * .52, r * .06, r * .11, r * .07, 0, 0, TAU); c.fillStyle = L.cheek; c.globalAlpha = .7; c.fill(); c.globalAlpha = 1; c.fillStyle = L.ink;
    }
    if (thrust) { c.beginPath(); c.arc(0, r * .12, r * .07, 0, TAU); c.stroke(); }
    else { c.beginPath(); c.arc(0, r * .02, r * .14, .25 * Math.PI, .75 * Math.PI); c.stroke(); }
  }
  // The glide's halo: a moon-blue glow painted once. It reads on the dark lake and on the bright water alike.
  function paintJellyHalo(c, r) {
    const R = r * 2.3, g = c.createRadialGradient(0, -r * .2, r * .3, 0, -r * .2, R);
    g.addColorStop(0, 'rgba(240,251,255,.95)'); g.addColorStop(.32, 'rgba(176,228,255,.6)'); g.addColorStop(.7, 'rgba(142,210,255,.16)'); g.addColorStop(1, 'rgba(142,210,255,0)');
    c.beginPath(); c.arc(0, -r * .2, R, 0, TAU); c.fillStyle = g; c.fill();
  }
  // The light down a vent's hole as a jelly comes up.
  function paintVentGlow(c, r) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
    g.addColorStop(0, 'rgba(230,248,255,.95)'); g.addColorStop(.4, 'rgba(142,210,255,.55)'); g.addColorStop(1, 'rgba(142,210,255,0)');
    c.save(); c.scale(1, .62); c.beginPath(); c.arc(0, 0, r * 1.5, 0, TAU); c.fillStyle = g; c.fill(); c.restore();
  }
  // A vent: a stone ring around a dark hole, a faint blue rim inside where the jellies live.
  function paintVent(c, r) {
    const L = JELLY_LOOK;
    c.beginPath(); c.ellipse(0, 1.5, r + 3, (r + 3) * .62, 0, 0, TAU); c.fillStyle = 'rgba(10,30,40,.35)'; c.fill();
    c.beginPath(); c.ellipse(0, 0, r + 1.5, (r + 1.5) * .6, 0, 0, TAU); c.fillStyle = L.vent; c.fill();
    c.beginPath(); c.ellipse(0, .6, r - 2.6, (r - 2.6) * .55, 0, 0, TAU); c.fillStyle = L.hole; c.fill();
    c.beginPath(); c.ellipse(0, .6, r - 3.4, (r - 3.4) * .5, 0, Math.PI * 1.05, Math.PI * 1.95); c.strokeStyle = 'rgba(142,210,255,.55)'; c.lineWidth = 1; c.stroke();
    for (const [a, s] of [[-2.6, 1.6], [-.4, 1.3], [2.2, 1.5], [.9, 1.1]]) { c.beginPath(); c.arc(Math.cos(a) * (r + .5), Math.sin(a) * (r + .5) * .6, s, 0, TAU); c.fillStyle = '#8a97a6'; c.fill(); }
    c.beginPath(); c.ellipse(0, 0, r + 1.5, (r + 1.5) * .6, 0, 0, TAU); c.strokeStyle = '#3f4a57'; c.lineWidth = 1.2; c.stroke();
  }
  // A glowdrop: a drop of gold light with its glow painted in.
  function paintGlowdrop(c, r) {
    const L = JELLY_LOOK, g = c.createRadialGradient(0, 0, r * .4, 0, 0, r + 6);
    g.addColorStop(0, 'rgba(255,214,90,.55)'); g.addColorStop(1, 'rgba(255,214,90,0)');
    c.beginPath(); c.arc(0, 0, r + 6, 0, TAU); c.fillStyle = g; c.fill();
    const drop = () => { c.beginPath(); c.moveTo(0, -r * 1.25); c.bezierCurveTo(r * .55, -r * .7, r, -r * .25, r, r * .15); c.arc(0, r * .15, r, 0, Math.PI); c.bezierCurveTo(-r, -r * .25, -r * .55, -r * .7, 0, -r * 1.25); c.closePath(); };
    drop(); c.fillStyle = L.drop; c.fill();
    c.beginPath(); c.arc(r * .12, r * .32, r * .6, 0, TAU); c.fillStyle = '#ffe58a'; c.fill();
    c.beginPath(); c.ellipse(-r * .34, -r * .2, r * .26, r * .42, -.35, 0, TAU); c.fillStyle = L.dropLight; c.fill();
    drop(); c.strokeStyle = L.dropInk; c.lineWidth = 1.3; c.lineJoin = 'round'; c.stroke();
  }
  const jellySprite = (r, frame) => [`foe:jelly:${r}:${frame}`, [-r * 1.4, -r * 1.3, r * 1.4, r * 2], c => paintJelly(c, r, frame)];
  const jellyHalo = r => [`foe:jelly:${r}:halo`, [-r * 2.5, -r * 2.7, r * 2.5, r * 2.3], c => paintJellyHalo(c, r)];
  const ventSprite = r => [`foe:vent:${r}:ring`, [-r - 5, -r, r + 5, r + 1], c => paintVent(c, r)];
  const ventGlow = r => [`foe:vent:${r}:glow`, [-r * 1.6, -r, r * 1.6, r], c => paintVentGlow(c, r)];
  const dropSprite = r => [`foe:glowdrop:${r}:orb`, [-r - 7, -r * 1.3 - 7, r + 7, r + 7], c => paintGlowdrop(c, r)];
  const warmJelly = (kit, r) => { for (const [key, box, paint] of [jellySprite(r, 'rest0'), jellySprite(r, 'rest1'), jellySprite(r, 'thrust'), jellyHalo(r), ventSprite(11), ventGlow(11), dropSprite(8)]) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint); };
  BloomFoeLook('jelly', {
    warm: (kit, r) => warmJelly(kit, r || 11),
    // The vents, under every bud. In its last second before a jelly comes up, a vent's rim lights and three bubbles rise.
    under(ctx, state, time, still, kit) {
      const clock = Number(state.foeClock) || 0;
      for (const vent of state.vents || []) {
        const done = vent.made >= vent.count, since = done ? clock - (vent.nextAt - vent.every) : 0;
        const fade = done ? 1 - since / .8 : 1;
        if (fade <= 0) continue;
        const [key, box, paint] = ventSprite(11);
        ctx.globalAlpha = fade; stamp(ctx, kit, key, box, paint, vent.x, vent.y); ctx.globalAlpha = 1;
        const lead = vent.nextAt - clock;
        if (done || lead > 1) continue;
        const p = clamp(1 - lead, 0, 1), [gkey, gbox, gpaint] = ventGlow(11);
        if (still) {
          ctx.globalAlpha = .9; stamp(ctx, kit, gkey, gbox, gpaint, vent.x, vent.y); ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.ellipse(vent.x, vent.y, 13.5, 8.4, 0, 0, TAU); ctx.strokeStyle = JELLY_LOOK.rim; ctx.lineWidth = 2.4; ctx.stroke();
          continue;
        }
        // The hole lights up from below and the rim brightens, then three bubbles wobble up 18 px.
        ctx.globalAlpha = .25 + .75 * p; stamp(ctx, kit, gkey, gbox, gpaint, vent.x, vent.y, 0, .8 + .3 * p);
        ctx.beginPath(); ctx.ellipse(vent.x, vent.y, 13, 8, 0, 0, TAU); ctx.strokeStyle = JELLY_LOOK.rim; ctx.globalAlpha = .3 + .7 * p; ctx.lineWidth = 1.4 + 1.2 * p; ctx.stroke(); ctx.globalAlpha = 1;
        for (let i = 0; i < 3; i++) {
          const q = clamp((p - i * .2) / .6, 0, 1);
          if (q <= 0 || q >= 1) continue;
          const bx = vent.x + (i - 1) * 5 + Math.sin((q + i) * 9) * 1.8, by = vent.y - 3 - q * 18;
          ctx.globalAlpha = 1 - q * q * q; kit.circle(ctx, bx, by, 2.4 + i * .6 + q, 'rgba(191,232,255,.4)', '#ffffff', 1.1);
        }
        ctx.globalAlpha = 1;
      }
      warmJelly(kit, 11); // painted once: the first jelly never waits on its sprites
    },
    bud(ctx, bud, time, still, state, kit, quality) {
      const r = bud.r || 11, t = (Number(state.foeClock) || 0) - (bud.born || 0), f = t - J_PULSE * Math.floor(t / J_PULSE), thrust = f < J_THRUST;
      if (!thrust) {
        // "Now": the halo opens through the glide (fading in over its first .08 s), and four twinkles sit around it.
        const g = (f - J_THRUST) / (J_PULSE - J_THRUST), glow = still ? .9 : clamp(g / .09, 0, 1) * (.78 + .17 * Math.sin(Math.PI * g));
        const [key, box, paint] = jellyHalo(r);
        ctx.globalAlpha = glow; stamp(ctx, kit, key, box, paint, bud.x, bud.y, 0, still ? 1 : .92 + .08 * glow); ctx.globalAlpha = 1;
        for (let i = 0; i < 4; i++) {
          const a = i * TAU / 4 + TAU / 8 + (still ? 0 : g * .9), tw = still ? 1 : .55 + .45 * Math.sin(g * 9 + i * 1.7);
          ctx.globalAlpha = glow; kit.sparkle(ctx, bud.x + Math.cos(a) * r * 1.65, bud.y - r * .2 + Math.sin(a) * r * 1.65, 1.6 + 1.5 * tw, '#ffffff', a);
        }
        ctx.globalAlpha = 1;
      } else if (!still && quality <= 1) {
        // "Not now": two little jet streaks under it while it shoots up.
        const k = 1 - f / J_THRUST;
        ctx.globalAlpha = .55 * k; ctx.strokeStyle = JELLY_LOOK.bubble; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(bud.x + side * 5, bud.y + r * 2); ctx.lineTo(bud.x + side * 6, bud.y + r * 2 + 8 * k); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      // The thrust squash: 1.12 x .8 over the pulse's first .1 s, back over the next .2 s.
      let sx = 1, sy = 1;
      if (!still && thrust) { const k = f < .1 ? kit.smooth(f / .1) : 1 - kit.smooth((f - .1) / .2); sx = 1 + .12 * k; sy = 1 - .2 * k; }
      const frame = thrust ? 'thrust' : still ? 'rest0' : `rest${Math.floor(t * 3.3) % 2}`;
      const [key, box, paint] = jellySprite(r, frame);
      stamp(ctx, kit, key, box, paint, bud.x, bud.y, 0, sx, sy);
    }
  });
  BloomFoeLook('glowdrop', {
    warm: (kit, r) => { const [key, box, paint] = dropSprite(r || 8); kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint); },
    bud(ctx, bud, time, still, state, kit, quality) {
      const r = bud.r || 8, [key, box, paint] = dropSprite(r);
      // A slow breath of light, and (quality allowing) a twinkle that turns on its tip.
      const breathe = still ? 1 : 1 + .05 * Math.sin(time * 4 + bud.x * .1);
      stamp(ctx, kit, key, box, paint, bud.x, bud.y, 0, breathe);
      if (!still && quality <= 1) {
        const tw = .5 + .5 * Math.sin(time * 5.5 + bud.x);
        ctx.globalAlpha = .4 + .6 * tw; kit.sparkle(ctx, bud.x - r * .3, bud.y - r * .55, 1.6 + 1.6 * tw, '#ffffff', time * 1.5); ctx.globalAlpha = 1;
      }
    }
  });

  // ── Glowworm (Level 5, `glowworm`) ──
  // A string of teal beads behind a round gold head that glows like a lantern, with antennae tipped in light, dot eyes
  // and a smile; the head turns to face the way it crawls and tilts through the turns. The worm is drawn after every
  // bud (in `over`), so it reads on top of the clusters it crawls past. A soft mint light runs head to tail every second
  // and the beads bob in a little wave; when the head is hit, each bead flashes a ring of light as it blooms, one after
  // another, in time with the chimes. A bead that becomes a new head pops in. With Animations off the worm is still:
  // no bob, no running light, no flashes (the head, its glow and the body all stay).
  const WORM_LOOK = { head: '#ffd65a', headShade: '#f2b43c', headLight: '#fff4aa', headInk: '#c47a24', bead: '#6fd3c4', shade: '#3c9c95',
    ink: '#2f6f6a', lit: '#b9fff0', cheek: '#ff9f8f' };
  function paintWormHead(c, r, frame) {
    const L = WORM_LOOK, g = c.createRadialGradient(0, 0, r * .6, 0, 0, r + 6);
    g.addColorStop(0, 'rgba(255,214,90,.45)'); g.addColorStop(1, 'rgba(255,214,90,0)');
    c.beginPath(); c.arc(0, 0, r + 6, 0, TAU); c.fillStyle = g; c.fill();
    c.lineCap = 'round'; c.lineJoin = 'round';
    // Antennae, leaning forward (the sprite faces right), each tipped with a bulb of light; two frames bob them.
    const bob = frame ? 1.2 : -.6;
    for (const [bx, lean] of [[-r * .05, -.15], [r * .35, .45]]) {
      const tx = bx + lean * r + r * .25, ty = -r * 1.55 + bob * (lean > 0 ? 1 : -.6);
      c.beginPath(); c.moveTo(bx, -r * .8); c.quadraticCurveTo(bx + lean * r * .2, -r * 1.3, tx, ty); c.strokeStyle = L.headInk; c.lineWidth = 1.3; c.stroke();
      c.beginPath(); c.arc(tx, ty, r * .2, 0, TAU); c.fillStyle = L.headLight; c.fill(); c.lineWidth = 1; c.stroke();
    }
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = L.head; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.arc(r * .2, r * .45, r * .95, 0, TAU); c.fillStyle = L.headShade; c.fill();
    c.beginPath(); c.arc(-r * .05, -r * .1, r * .82, 0, TAU); c.fillStyle = L.head; c.fill();
    c.beginPath(); c.ellipse(-r * .4, -r * .48, r * .32, r * .2, -.5, 0, TAU); c.fillStyle = L.headLight; c.fill();
    c.restore();
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = L.headInk; c.lineWidth = 1.4; c.stroke();
    // A happy face turned toward the way it crawls.
    for (const ex of [r * .05, r * .5]) {
      c.beginPath(); c.arc(ex, -r * .12, r * .12, 0, TAU); c.fillStyle = '#3a2a14'; c.fill();
      c.beginPath(); c.arc(ex - r * .04, -r * .17, r * .045, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    }
    c.beginPath(); c.arc(r * .28, r * .12, r * .22, .15 * Math.PI, .85 * Math.PI); c.strokeStyle = '#3a2a14'; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.ellipse(r * .72, r * .14, r * .12, r * .08, 0, 0, TAU); c.fillStyle = L.cheek; c.globalAlpha = .8; c.fill(); c.globalAlpha = 1;
  }
  function paintWormBead(c, r) {
    const L = WORM_LOOK;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = L.bead; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.arc(r * .35, r * .5, r * .9, 0, TAU); c.fillStyle = L.shade; c.fill();
    c.beginPath(); c.arc(-r * .1, -r * .12, r * .8, 0, TAU); c.fillStyle = L.bead; c.fill();
    // A little light glows inside every bead (the worm is lit all through), under a glassy highlight.
    c.beginPath(); c.arc(r * .08, r * .12, r * .46, 0, TAU); c.fillStyle = 'rgba(185,255,240,.75)'; c.fill();
    c.beginPath(); c.arc(r * .1, r * .14, r * .22, 0, TAU); c.fillStyle = '#e9fffa'; c.fill();
    c.beginPath(); c.ellipse(-r * .38, -r * .45, r * .28, r * .15, -.5, 0, TAU); c.fillStyle = 'rgba(240,255,252,.9)'; c.fill();
    c.restore();
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = L.ink; c.lineWidth = 1.3; c.stroke();
  }
  // The head's lantern light: a warm gold glow painted once, laid on with 'lighter' so it lights what it crawls past.
  function paintWormLamp(c, r) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
    g.addColorStop(0, 'rgba(255,240,170,.9)'); g.addColorStop(.35, 'rgba(255,214,90,.45)'); g.addColorStop(1, 'rgba(255,214,90,0)');
    c.beginPath(); c.arc(0, 0, r * 2.6, 0, TAU); c.fillStyle = g; c.fill();
  }
  // The running light (and a blooming bead's flash): a mint glow painted once, laid on with 'lighter'.
  function paintWormGlow(c, r) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 1.8);
    g.addColorStop(0, 'rgba(225,255,248,.95)'); g.addColorStop(.4, 'rgba(185,255,240,.55)'); g.addColorStop(1, 'rgba(185,255,240,0)');
    c.beginPath(); c.arc(0, 0, r * 1.8, 0, TAU); c.fillStyle = g; c.fill();
  }
  const wormHead = (r, f) => [`foe:glowworm:${r}:head${f}`, [-r - 7, -r * 1.9 - 2, r + 7, r + 7], c => paintWormHead(c, r, f)];
  const wormBead = r => [`foe:glowworm:${r}:bead`, [-r - 2, -r - 2, r + 2, r + 2], c => paintWormBead(c, r)];
  const wormGlow = r => [`foe:glowworm:${r}:glow`, [-r * 1.9, -r * 1.9, r * 1.9, r * 1.9], c => paintWormGlow(c, r)];
  const wormLamp = r => [`foe:glowworm:${r}:lamp`, [-r * 2.7, -r * 2.7, r * 2.7, r * 2.7], c => paintWormLamp(c, r)];
  const WORM_GROUPS = new Map();
  function drawWorm(ctx, pieces, time, clock, still, kit, quality) {
    // Head first along the body; the bob runs as a little wave from the head back. Each piece tumbles in with its wave
    // and trembles near the line as the per-bud pass would draw it (kit.budShift).
    pieces.sort((a, b) => b.off - a.off);
    const at = pieces.map((p, k) => {
      const m = kit.budShift(p, time, still);
      return { p, k, a: m.alpha, x: p.x + m.dx, y: p.y + m.dy + (still ? 0 : 2 * Math.sin(TAU * 1.2 * time - .6 * k)) };
    });
    // The body: a dark teal band joining neighbors (a bloomed bead leaves a gap), under the beads.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = WORM_LOOK.ink; ctx.lineWidth = 9; ctx.globalAlpha = .75 * Math.min(...at.map(q => q.a));
    ctx.beginPath();
    for (let i = 1; i < at.length; i++) {
      const a = at[i - 1], b = at[i];
      if (a.p.off - b.p.off > 21.5) continue;
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    // Tail to head, so the head sits on top.
    for (let i = at.length - 1; i >= 0; i--) {
      const { p, x, y, a: fade } = at[i], r = p.r || 9;
      let s = 1;
      ctx.save(); ctx.globalAlpha = fade;
      // A bead that has just become a head pops in over .15 s (0 -> 1.12 -> 1).
      if (!still && p.headAt != null) { const k = (clock - p.headAt) / .15; if (k >= 0 && k < 1) s = k < .7 ? 1.12 * kit.smooth(k / .7) : 1.12 - .12 * kit.smooth((k - .7) / .3); }
      if (p.head) {
        // Its lantern glow first, breathing slowly (steady with Animations off).
        const [lkey, lbox, lpaint] = wormLamp(r);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade * (still ? .6 : .5 + .15 * Math.sin(time * 3.1 + p.x * .02));
        stamp(ctx, kit, lkey, lbox, lpaint, x, y, 0, s); ctx.restore();
        // It faces the way it crawls and leans a little into the turns, antennae up.
        const a = Number.isFinite(p.heading) ? p.heading : 0, dx = Math.cos(a), face = dx < 0 ? -1 : 1, tilt = clamp(Math.atan2(Math.sin(a), Math.abs(dx)), -.3, .3);
        const [key, box, paint] = wormHead(r, still ? 0 : Math.floor(time * 2.4 + p.x * .01) % 2);
        ctx.save(); ctx.translate(x, y); ctx.rotate(face * tilt); ctx.scale(face * s, s);
        const sprite = kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
        if (sprite) kit.blit(ctx, sprite); else paint(ctx);
        ctx.restore();
      } else {
        const [key, box, paint] = wormBead(r);
        stamp(ctx, kit, key, box, paint, x, y, 0, s);
      }
      ctx.restore();
    }
    // The running light: one bead at a time, head to tail, .12 s each, once a second.
    if (still || quality > 1) return;
    const k = Math.floor(((time % 1) + 1) % 1 / .12);
    if (k >= at.length) return;
    const lit = at[k], [key, box, paint] = wormGlow(lit.p.r || 9);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55 * lit.a; stamp(ctx, kit, key, box, paint, lit.x, lit.y, 0, .8); ctx.restore();
  }
  BloomFoeLook('glowworm', {
    warm(kit, r) {
      const jobs = r >= 11 ? [wormHead(r, 0), wormHead(r, 1), wormGlow(r), wormLamp(r)] : [wormBead(r), wormGlow(r), wormHead(r, 0), wormHead(r, 1), wormLamp(r)];
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    // Each piece is drawn with its worm in `over`; a bloomed piece falls back to its flower.
    bud() {},
    over(ctx, state, time, still, kit, quality) {
      const clock = Number(state.foeClock) || 0, worms = WORM_GROUPS;
      worms.clear();
      for (const bud of state.buds || []) {
        if (bud.foe !== 'glowworm') continue;
        if (bud.bloomed) {
          // A bead (or head) that just bloomed flashes a ring of light: in a ripple they go off one after another.
          const age = time - (bud.bloomAt ?? -100);
          if (still || bud.popped || age < 0 || age >= .4) continue;
          const q = age / .4, [key, box, paint] = wormGlow(bud.r || 9);
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - q; stamp(ctx, kit, key, box, paint, bud.x, bud.y, 0, .7 + q * 1.1); ctx.restore();
          ctx.globalAlpha = 1 - q; kit.circle(ctx, bud.x, bud.y, (bud.r || 9) + 3 + q * 12, null, WORM_LOOK.lit, .6 + 1.8 * (1 - q)); ctx.globalAlpha = 1;
          continue;
        }
        if (bud.hidden || bud.visible === false) continue;
        const list = worms.get(bud.worm || bud.group);
        if (list) list.push(bud); else worms.set(bud.worm || bud.group, [bud]);
      }
      for (const pieces of worms.values()) { ctx.save(); drawWorm(ctx, pieces, time, clock, still, kit, quality); ctx.restore(); }
      worms.clear();
    }
  });

  // ── Amberkeeper (Level 6, `amberkeeper`) ──
  // A chubby golden trilobite seen from above, his half-moon head toward the launcher: big glossy kidney eyes with two
  // catch-lights each, rosy cheeks and a small smile, two genal spines curling back beside a back of six ridged segments,
  // and a fan tail. Little legs paddle under his side lobes as he falls (three cached walk frames) and he bobs a little.
  // His tell: he rears up (the head 14% larger and nearer, mouth an "o", antennae up, star catch-lights, tail fanned),
  // lifts 3 px off his shadow and his tail glows honey; dotted golden threads flow out of his tail to each bud he wants
  // and an amber ring closes round each one like a clock hand, flashing white on the last beat. A sealed bud sits in a
  // glossy amber bead (two bubbles, a fern curl, a crescent of light) that pops in with an overshoot and breathes like
  // jelly, and a honey thread stays strung from his tail to it, swaying and wobbling as it settles, motes sliding down
  // it. A hit mid-tell squeezes his eyes shut with a sweat drop and the threads snap back; at one hp his shell shows a
  // crack. Hatched from the Ammonite Queen's egg, he pops out between two amber shell halves. Animations off: no paddle,
  // bob, flow, wobble, shiver or twinkle; a tell shows its full dotted thread and a dotted ring.
  const AMBER_ART = {
    shell: '#e2a93b', lobe: '#c4862a', rim: '#ffe29a', ink: '#5a3812', belly: '#fff0c4', eye: '#2b1907', cheek: '#ff9f8a',
    bead: 'rgba(255,178,30,.42)', beadRim: '#c46f0a', beadLight: 'rgba(255,236,170,.85)', honey: '#ffc23d', honeyDark: 'rgba(104,58,8,.8)'
  };
  const KEEPER_BOX = r => [-r * 1.45, -r * 1.6, r * 1.45, r * 1.5];
  // A stable 0..1 from an id (art keeps no dependency on the rules' hash).
  function amberHash(id) { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; }
  // A four-point star catch-light.
  function amberStar(c, x, y, k) {
    c.beginPath(); c.moveTo(x, y - k); c.quadraticCurveTo(x + k * .18, y - k * .18, x + k, y); c.quadraticCurveTo(x + k * .18, y + k * .18, x, y + k);
    c.quadraticCurveTo(x - k * .18, y + k * .18, x - k, y); c.quadraticCurveTo(x - k * .18, y - k * .18, x, y - k); c.fill();
  }
  function paintKeeperEye(c, r, side, kind) {
    const A = AMBER_ART, x = side * r * .43, y = r * .55;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = A.ink;
    if (kind === 'squeeze') {
      // Squeezed shut: a chevron pointing in, under a worried brow.
      c.beginPath(); c.moveTo(x + side * r * .14, y - r * .1); c.lineTo(x - side * r * .09, y); c.lineTo(x + side * r * .14, y + r * .1); c.lineWidth = 1.7; c.stroke();
      return;
    }
    // The eye ridge (a pale crescent over each eye), then a glossy kidney of an eye bending round the brow.
    c.save(); c.translate(x, y); c.rotate(side * -.42);
    c.beginPath(); c.ellipse(0, -r * .02, r * .27, r * .22, 0, Math.PI * 1.05, Math.PI * 1.95); c.strokeStyle = A.rim; c.lineWidth = 1.6; c.stroke();
    c.beginPath(); c.moveTo(-r * .21, 0); c.bezierCurveTo(-r * .22, -r * .2, r * .22, -r * .2, r * .21, 0); c.bezierCurveTo(r * .2, r * .17, r * .06, r * .12, 0, r * .08);
    c.bezierCurveTo(-r * .06, r * .12, -r * .2, r * .17, -r * .21, 0); c.closePath();
    c.fillStyle = A.eye; c.fill(); c.strokeStyle = A.ink; c.lineWidth = 1; c.stroke();
    // A warm amber sheen low in the eye: they are compound eyes, glassy like the beads he makes.
    c.beginPath(); c.ellipse(r * .04, r * .05, r * .11, r * .04, 0, 0, TAU); c.fillStyle = 'rgba(214,138,40,.55)'; c.fill();
    c.restore();
    c.fillStyle = '#ffffff';
    if (kind === 'star') { amberStar(c, x - side * r * .05, y - r * .06, r * .11); c.beginPath(); c.arc(x + side * r * .07, y + r * .03, r * .03, 0, TAU); c.fill(); }
    else {
      c.beginPath(); c.arc(x - side * r * .05, y - r * .05, r * .062, 0, TAU); c.fill();
      c.beginPath(); c.arc(x + side * r * .07, y + r * .03, r * .028, 0, TAU); c.fill();
    }
  }
  const A_INK_DARK = '#3d2509';
  // pose: walk (frame 0-2), rear (the tell) or flinch.
  function paintKeeper(c, r, pose, frame) {
    const A = AMBER_ART, rear = pose === 'rear', flinch = pose === 'flinch', P = (x, y) => [x * r, y * r];
    c.lineJoin = 'round'; c.lineCap = 'round';
    // Legs, three a side, peeking out between his spines and his tail; each frame shifts them 1.5 px in a paddling wave.
    c.strokeStyle = A.ink; c.lineWidth = 1.3;
    for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
      const ly = -r * (.04 + i * .25), kick = flinch ? -1 : (((i + frame + (side > 0 ? 1 : 0)) % 3) - 1) * 1.5, out = r * (flinch ? .98 : rear ? 1.14 : 1.08);
      c.beginPath(); c.moveTo(side * r * .74, ly); c.quadraticCurveTo(side * r * .95, ly + kick * .3, side * out, ly + kick + 1.3); c.stroke();
    }
    // Antennae from under the front of his head: short and forward, raised and curled when he rears, drooped in a flinch.
    for (const side of [-1, 1]) {
      const [cx, cy, tx, ty] = rear ? [.42, 1.6, .74, 1.46] : flinch ? [.5, 1.08, .74, .9] : [.22, 1.3, .44, 1.34];
      const lift = rear ? 2 : 0, bx = side * r * .2, by = r * .96 + lift, x = side * r * tx, y = r * ty + lift;
      c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(side * r * cx, r * cy + lift, x, y); c.strokeStyle = A.ink; c.lineWidth = 1.05; c.stroke();
      c.beginPath(); c.arc(x, y, r * (rear ? .1 : .085), 0, TAU); c.fillStyle = rear ? A.honey : A.lobe; c.fill(); c.lineWidth = .9; c.stroke();
    }
    // The fan tail (pygidium): four ridges either side of a raised middle, spread wide when he rears.
    const fan = rear ? 1.22 : 1, ty = -r * .58, tail = () => { c.beginPath(); c.ellipse(0, ty, r * .6 * fan, r * .6, 0, 0, Math.PI, true); c.closePath(); };
    tail(); c.fillStyle = A.shell; c.fill();
    c.save(); tail(); c.clip();
    c.lineWidth = 1; c.strokeStyle = 'rgba(90,56,18,.5)';
    for (const k of [-2, -1, 1, 2]) { c.beginPath(); c.moveTo(k * r * .1, ty - r * .04); c.quadraticCurveTo(k * r * .2 * fan, ty - r * .3, k * r * .27 * fan, ty - r * .62); c.stroke(); }
    c.beginPath(); c.ellipse(0, ty - r * .1, r * .12, r * .3, 0, 0, TAU); c.fillStyle = A.lobe; c.fill();
    c.beginPath(); c.ellipse(-r * .3 * fan, ty - r * .3, r * .13, r * .07, -.7, 0, TAU); c.fillStyle = 'rgba(255,248,222,.65)'; c.fill();
    c.restore();
    tail(); c.strokeStyle = A.ink; c.lineWidth = 1.4; c.stroke();
    // The back: six plates, each ending in a little point swept toward the tail, so his sides are scalloped.
    const plates = [];
    for (let i = 0; i < 6; i++) { const yt = .32 - i * .155; plates.push({ yt, yb: yt - .155, w: .86 - i * .04 }); }
    const thorax = () => {
      c.beginPath(); c.moveTo(...P(-.7, .34)); c.lineTo(...P(.7, .34));
      for (const p of plates) { c.lineTo(...P(p.w - .02, p.yt - .01)); c.quadraticCurveTo(...P(p.w + .05, p.yt - .07), ...P(p.w + .02, p.yb - .005)); c.lineTo(...P(p.w - .04, p.yb + .025)); }
      c.lineTo(...P(.45, -.6)); c.lineTo(...P(-.45, -.6));
      for (const p of plates.slice().reverse()) { c.lineTo(...P(-p.w + .04, p.yb + .025)); c.lineTo(...P(-p.w - .02, p.yb - .005)); c.quadraticCurveTo(...P(-p.w - .05, p.yt - .07), ...P(-p.w + .02, p.yt - .01)); }
      c.closePath();
    };
    thorax(); c.fillStyle = A.shell; c.fill();
    c.save(); thorax(); c.clip();
    // Grooves between the plates (bowed toward his head, bending back at the tips) with a pale rim lit from above.
    for (const p of plates.slice(0, 5)) for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * r * .2, r * p.yb); c.quadraticCurveTo(side * r * .55, r * (p.yb + .05), side * r * (p.w - .04), r * (p.yb - .02));
      c.strokeStyle = 'rgba(90,56,18,.42)'; c.lineWidth = .85; c.stroke();
    }
    for (const p of plates) for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * r * .26, r * (p.yb + .045)); c.quadraticCurveTo(side * r * .55, r * (p.yb + .095), side * r * (p.w - .1), r * (p.yb + .03));
      c.strokeStyle = side < 0 ? 'rgba(255,240,190,.85)' : 'rgba(255,232,170,.5)'; c.lineWidth = .8; c.stroke();
    }
    // The raised middle lobe, ringed, lit down its left side.
    const axis = () => { c.beginPath(); c.moveTo(...P(-.21, .36)); c.lineTo(...P(-.15, -.6)); c.lineTo(...P(.15, -.6)); c.lineTo(...P(.21, .36)); c.closePath(); };
    axis(); c.fillStyle = A.lobe; c.fill();
    for (const p of plates.slice(0, 5)) { c.beginPath(); c.moveTo(-r * .19, r * p.yb); c.quadraticCurveTo(0, r * (p.yb + .07), r * .19, r * p.yb); c.strokeStyle = 'rgba(90,56,18,.5)'; c.lineWidth = .9; c.stroke(); }
    c.beginPath(); c.moveTo(...P(-.11, .3)); c.lineTo(...P(-.08, -.5)); c.strokeStyle = 'rgba(255,236,170,.8)'; c.lineWidth = 1.1; c.stroke();
    axis(); c.strokeStyle = 'rgba(90,56,18,.75)'; c.lineWidth = .9; c.stroke();
    c.restore();
    thorax(); c.strokeStyle = A.ink; c.lineWidth = 1.4; c.stroke();
    // Genal spines: two horns from the back corners of his head, sweeping back along his sides.
    const flare = rear ? 1.1 : 1;
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * r * 1.0, r * .42);
      c.quadraticCurveTo(side * r * 1.1 * flare, r * .02, side * r * .97 * flare, -r * .44);
      c.quadraticCurveTo(side * r * .9, -r * .02, side * r * .76, r * .3); c.closePath();
      c.fillStyle = A.lobe; c.fill(); c.strokeStyle = A.ink; c.lineWidth = 1.15; c.stroke();
      c.beginPath(); c.moveTo(side * r * 1.0, r * .26); c.quadraticCurveTo(side * r * 1.03 * flare, r * .0, side * r * .98 * flare, -r * .26);
      c.strokeStyle = 'rgba(255,236,170,.75)'; c.lineWidth = .7; c.stroke();
    }
    // The head: a half-moon shield, 14% larger and 2 px nearer when he rears at you.
    c.save();
    if (rear) { c.translate(0, r * .3 + 2); c.scale(1.14, 1.14); c.translate(0, -r * .3); }
    const head = () => { c.beginPath(); c.moveTo(-r * 1.0, r * .34); c.ellipse(0, r * .34, r * 1.0, r * .72, 0, Math.PI, 0, true); c.quadraticCurveTo(0, r * .1, -r * 1.0, r * .34); c.closePath(); };
    head(); c.fillStyle = A.shell; c.fill();
    c.save(); head(); c.clip();
    // The pale lip round the front edge, a shade along the back, the brow lobe (glabella) and a glossy highlight.
    c.beginPath(); c.ellipse(0, r * .34, r * 1.0, r * .72, 0, Math.PI * .08, Math.PI * .92); c.strokeStyle = A.belly; c.lineWidth = 2.8; c.stroke();
    c.beginPath(); c.ellipse(0, r * .2, r * .95, r * .15, 0, 0, TAU); c.fillStyle = 'rgba(196,134,42,.5)'; c.fill();
    c.beginPath(); c.ellipse(0, r * .34, r * .21, r * .2, 0, 0, TAU); c.fillStyle = A.lobe; c.fill();
    c.beginPath(); c.ellipse(-r * .07, r * .27, r * .09, r * .055, -.4, 0, TAU); c.fillStyle = 'rgba(255,246,214,.75)'; c.fill();
    c.beginPath(); c.ellipse(-r * .6, r * .4, r * .22, r * .075, -.6, 0, TAU); c.fillStyle = 'rgba(255,252,236,.7)'; c.fill();
    c.restore();
    head(); c.strokeStyle = A.ink; c.lineWidth = 1.4; c.stroke();
    // His face.
    const eye = flinch ? 'squeeze' : rear ? 'star' : 'open';
    paintKeeperEye(c, r, -1, eye); paintKeeperEye(c, r, 1, eye);
    for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * r * .62, r * .82, r * .13, r * .075, side * .2, 0, TAU); c.fillStyle = A.cheek; c.globalAlpha = .85; c.fill(); c.globalAlpha = 1; }
    c.strokeStyle = A.ink; c.lineCap = 'round';
    if (rear) { c.beginPath(); c.ellipse(0, r * .88, r * .08, r * .09, 0, 0, TAU); c.fillStyle = '#8a3b1c'; c.fill(); c.lineWidth = 1; c.stroke(); }
    else if (flinch) {
      c.beginPath(); c.moveTo(-r * .13, r * .88); c.quadraticCurveTo(-r * .065, r * .82, 0, r * .88); c.quadraticCurveTo(r * .065, r * .94, r * .13, r * .88); c.lineWidth = 1.2; c.stroke();
      // A sweat drop beside his head.
      c.beginPath(); c.moveTo(r * .9, r * .06); c.quadraticCurveTo(r * 1.03, r * .28, r * .95, r * .37); c.arc(r * .9, r * .32, r * .075, .3, Math.PI + .9); c.closePath();
      c.fillStyle = '#d9f1ff'; c.fill(); c.strokeStyle = '#5c8fb3'; c.lineWidth = .8; c.stroke();
    } else { c.beginPath(); c.arc(0, r * .77, r * .12, .22 * Math.PI, .78 * Math.PI); c.lineWidth = 1.25; c.stroke(); }
    c.restore();
  }
  // At one hp: a jagged crack across his back (plates three and four), lit along one lip, and two chips flaking off.
  function paintKeeperCrack(c, r) {
    const main = [[-.7, -.06], [-.46, -.2], [-.3, -.1], [-.08, -.27], [.12, -.13], [.34, -.3], [.52, -.18], [.68, -.26]], branch = [[-.08, -.27], [-.02, -.42]];
    c.lineCap = 'round'; c.lineJoin = 'miter';
    const line = (pts, dx, dy) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x * r + dx, y * r + dy) : c.moveTo(x * r + dx, y * r + dy)); };
    line(main, .55, .7); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 1.2; c.stroke();
    line(branch, .55, .7); c.lineWidth = .9; c.stroke();
    line(main, 0, 0); c.strokeStyle = A_INK_DARK; c.lineWidth = 1.5; c.stroke();
    line(branch, 0, 0); c.lineWidth = 1; c.stroke();
    c.lineJoin = 'round';
    for (const [x, y, a] of [[-.86, -.3, .4], [.8, -.02, -.6]]) {
      c.save(); c.translate(x * r, y * r); c.rotate(a);
      c.beginPath(); c.moveTo(-1.6, -1); c.lineTo(1.7, -.6); c.lineTo(.2, 1.5); c.closePath(); c.fillStyle = AMBER_ART.rim; c.fill(); c.strokeStyle = AMBER_ART.ink; c.lineWidth = .7; c.stroke();
      c.restore();
    }
  }
  // His tail's honey light: four concentric discs at alpha .1 (no gradient).
  function paintKeeperGlow(c, r) { for (const k of [2, 1.62, 1.28, .96]) { c.beginPath(); c.arc(0, 0, r * k, 0, TAU); c.fillStyle = 'rgba(255,194,61,.1)'; c.fill(); } }
  // Half an amber eggshell (the left half; mirrored for the right), its broken edge a zigzag.
  function paintKeeperShell(c) {
    const A = AMBER_ART;
    c.beginPath(); c.moveTo(.5, -7.5); c.bezierCurveTo(-4.6, -7.5, -6, -1.5, -5.6, 2.6); c.bezierCurveTo(-5.2, 6.4, -2.6, 7.6, .5, 7.6);
    c.lineTo(-1, 5); c.lineTo(1.2, 2.6); c.lineTo(-.8, 0); c.lineTo(1.2, -2.6); c.lineTo(-.6, -5); c.closePath();
    c.fillStyle = 'rgba(244,170,52,.88)'; c.fill(); c.strokeStyle = A.beadRim; c.lineWidth = 1.2; c.lineJoin = 'round'; c.stroke();
    c.beginPath(); c.moveTo(-3.6, -3.8); c.quadraticCurveTo(-4.6, -.6, -3.8, 2.2); c.strokeStyle = 'rgba(255,248,220,.85)'; c.lineWidth = 1.1; c.lineCap = 'round'; c.stroke();
  }
  // The bead: amber glass round a sealed bud (the flower shows through), a deeper amber low on the right, a crescent of
  // light at the upper left, two trapped bubbles and a fern curl caught inside.
  function paintAmberBead(c, R) {
    const A = AMBER_ART;
    c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = A.bead; c.fill();
    c.beginPath(); c.arc(0, 0, R - 2.3, -.15, 1.95); c.strokeStyle = 'rgba(196,111,10,.3)'; c.lineWidth = 3.2; c.stroke();
    c.beginPath(); c.moveTo(R * .14, R * .7); c.quadraticCurveTo(R * .48, R * .62, R * .5, R * .36); c.arc(R * .42, R * .36, R * .08, 0, -Math.PI * 1.6, true);
    c.strokeStyle = 'rgba(122,62,6,.62)'; c.lineWidth = .9; c.stroke();
    for (const [x, y, a] of [[.26, .66, -1.1], [.38, .58, -.7], [.47, .48, -.3]]) { c.beginPath(); c.ellipse(R * x, R * y, 1.2, .55, a, 0, TAU); c.fillStyle = 'rgba(122,62,6,.5)'; c.fill(); }
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.strokeStyle = A.beadRim; c.lineWidth = 1.8; c.stroke();
    c.beginPath(); c.arc(0, 0, R - 1.7, 0, TAU); c.strokeStyle = A.beadLight; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.arc(0, 0, R - 3.6, Math.PI * 1.04, Math.PI * 1.46); c.strokeStyle = 'rgba(255,255,255,.62)'; c.lineWidth = 2.8; c.stroke();
    c.beginPath(); c.arc(-R * .12, -R * .66, 1.1, 0, TAU); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill();
    for (const [x, y, b] of [[.36, -.42, 1.4], [.52, -.18, 1]]) { c.beginPath(); c.arc(R * x, R * y, b, 0, TAU); c.fillStyle = 'rgba(255,255,255,.7)'; c.fill(); c.strokeStyle = 'rgba(196,111,10,.45)'; c.lineWidth = .5; c.stroke(); }
  }
  const KEEPER_SPRITES = {
    walk: (r, f) => [`foe:amberkeeper:${r}:walk${f}`, KEEPER_BOX(r), c => paintKeeper(c, r, 'walk', f)],
    rear: r => [`foe:amberkeeper:${r}:rear`, KEEPER_BOX(r), c => paintKeeper(c, r, 'rear', 1)],
    flinch: r => [`foe:amberkeeper:${r}:flinch`, KEEPER_BOX(r), c => paintKeeper(c, r, 'flinch', 1)],
    crack: r => [`foe:amberkeeper:${r}:crack`, [-r, -r * .6, r, r * .2], c => paintKeeperCrack(c, r)],
    glow: r => [`foe:amberkeeper:${r}:glow`, [-2 * r, -2 * r, 2 * r, 2 * r], c => paintKeeperGlow(c, r)],
    shell: () => ['foe:amberkeeper:shell', [-7, -9, 3, 9], paintKeeperShell],
    bead: R => [`foe:amber:${R}:bead`, [-R - 2, -R - 2, R + 2, R + 2], c => paintAmberBead(c, R)]
  };
  const keeperStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  // His announced seal, from the rules' own pure forecast (guarded: art draws without foes.js too).
  function keeperPlan(state, keeper) {
    const F = root.BloomFoes && root.BloomFoes.FOES && root.BloomFoes.FOES.amberkeeper;
    return F && typeof F.amberPlan === 'function' ? F.amberPlan(state, keeper) : null;
  }
  // How he is drawn this frame, shared by his bud (the sprite) and `over` (the threads leave his drawn tail):
  // { v sprite, x, y offset from his bud, s scale, lift, k rear-up, u tell progress, plan, tail {x, y} offset }.
  function keeperFrame(state, keeper, clock, still, kit) {
    const r = keeper.r || 13, a = keeper.amber || {}, plan = keeperPlan(state, keeper), h = amberHash(keeper.id);
    const f = { v: 'walk', frame: 1, x: 0, y: 0, s: 1, lift: 0, k: 0, u: 0, plan, flinch: -1 };
    if (plan) {
      f.u = clamp((clock - plan.from) / Math.max(1e-6, plan.at - plan.from), 0, 1); f.k = still ? 1 : kit.smooth(Math.min(1, 4 * f.u));
      f.v = 'rear'; f.lift = 3 * f.k; f.s = 1 + .08 * f.k; f.y = -f.lift;
    } else if (clock - (a.flinchAt ?? -100) >= 0 && clock - a.flinchAt < .5) {
      f.v = 'flinch'; f.flinch = clock - a.flinchAt; if (!still) f.x = Math.sin(clock * 95) * 1;
    } else if (!still) { f.frame = Math.floor(clock * 7 + h * 3) % 3; f.y = Math.sin(clock * 4.2 + h * TAU) * .7; }
    // Hatched from the Queen's egg: he pops out with an overshoot over .3 s.
    const born = clock - (keeper.born || 0);
    if (!still && keeper.bossSource && born >= 0 && born < .3) f.s *= kit.easeBack(born / .3);
    // The threads spin out of the tip of his glowing tail.
    f.tail = { x: f.x, y: f.y - r * 1.16 * f.s };
    return f;
  }
  // A thread from the tip of his tail (tx, ty) to a bead or bud at (bx, by), radius R: it bows out to the side (`bow` px,
  // away from his middle) and sags `sag` px, and ends on the bead's rim. Returns the quadratic's three points.
  function amberThread(tx, ty, bx, by, R, bow, sag, k) {
    const dx = bx - tx, dy = by - ty, d = Math.hypot(dx, dy) || 1, out = Math.abs(dx) > 4 ? Math.sign(dx) : k % 2 ? 1 : -1;
    let nx = -dy / d, ny = dx / d; if (nx * out < 0) { nx = -nx; ny = -ny; }
    const cx = (tx + bx) / 2 + nx * bow, cy = (ty + by) / 2 + ny * bow + sag, ex = cx - bx, ey = cy - by, e = Math.hypot(ex, ey) || 1;
    return [tx, ty, cx, cy, bx + ex / e * R, by + ey / e * R];
  }
  const amberQuad = ([x0, y0, cx, cy, x1, y1], t) => { const m = 1 - t; return [m * m * x0 + 2 * m * t * cx + t * t * x1, m * m * y0 + 2 * m * t * cy + t * t * y1]; };
  const amberPoints = (q, upto, n = 12) => { const pts = []; for (let i = 0; i <= n; i++) pts.push(amberQuad(q, upto * i / n)); return pts; };
  const KEEPER_LAST = new WeakMap();
  const NO_SHIFT = { dx: 0, dy: 0, alpha: 1 };
  BloomFoeLook('amberkeeper', {
    warm(kit, r = 13) {
      const jobs = [KEEPER_SPRITES.walk(r, 0), KEEPER_SPRITES.walk(r, 1), KEEPER_SPRITES.walk(r, 2), KEEPER_SPRITES.rear(r), KEEPER_SPRITES.flinch(r),
        KEEPER_SPRITES.crack(r), KEEPER_SPRITES.glow(r), KEEPER_SPRITES.shell(), KEEPER_SPRITES.bead(15), KEEPER_SPRITES.bead(16)];
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    bud(ctx, bud, time, still, state, kit) {
      const r = bud.r || 13, clock = Number(state.foeClock) || 0, f = keeperFrame(state, bud, clock, still, kit), x = bud.x + f.x, y = bud.y + f.y, alpha = ctx.globalAlpha;
      if (f.v === 'rear') {
        // Rearing up: his shadow stays on the ground, and his tail lights up honey-gold as the tell runs.
        ctx.globalAlpha = alpha * .22 * f.k; ctx.beginPath(); ctx.ellipse(bud.x, bud.y + 1.5, r * 1.02, r * .9, 0, 0, TAU); ctx.fillStyle = AMBER_ART.ink; ctx.fill();
        ctx.globalAlpha = alpha * (still ? .6 : .35 + .35 * f.u); keeperStamp(ctx, kit, KEEPER_SPRITES.glow(r), x, y - r * .82 * f.s, 0, f.s);
        ctx.globalAlpha = alpha;
      }
      const sprite = f.v === 'rear' ? KEEPER_SPRITES.rear(r) : f.v === 'flinch' ? KEEPER_SPRITES.flinch(r) : KEEPER_SPRITES.walk(r, f.frame);
      keeperStamp(ctx, kit, sprite, x, y, 0, f.s);
      if (bud.hp === 1 && (Number(bud.maxHp) || 2) > 1) keeperStamp(ctx, kit, KEEPER_SPRITES.crack(r), x, y, 0, f.s);
    },
    over(ctx, state, time, still, kit, quality) {
      const A = AMBER_ART, clock = Number(state.foeClock) || 0, buds = state.buds || [], shift = b => kit.budShift ? kit.budShift(b, time, still) : NO_SHIFT;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const keeper of buds) {
        if (keeper.foe !== 'amberkeeper' || keeper.bloomed || keeper.hidden || keeper.visible === false) continue;
        const m = shift(keeper), f = keeperFrame(state, keeper, clock, still, kit), tx = keeper.x + m.dx + f.tail.x, ty = keeper.y + m.dy + f.tail.y;
        // Hatched: the two halves of the amber egg fly apart and fade.
        const born = clock - (keeper.born || 0);
        if (!still && keeper.bossSource && born >= 0 && born < .45) {
          const q = born / .45;
          ctx.save(); ctx.globalAlpha *= 1 - q * q;
          for (const side of [-1, 1]) {
            const [key, box, paint] = KEEPER_SPRITES.shell();
            ctx.save(); ctx.translate(keeper.x + m.dx + side * (3 + 20 * q), keeper.y + m.dy - 12 * q + 22 * q * q); ctx.rotate(side * 2.6 * q); ctx.scale(side, 1);
            const sprite = kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint); if (sprite) kit.blit(ctx, sprite); else paint(ctx);
            ctx.restore();
          }
          ctx.restore();
        }
        // 1. Sealed threads: one honey thread from his tail to each of his beads.
        let k = 0;
        for (const bead of buds) {
          if (bead.foe !== 'amber' || bead.bloomed || bead.keeper !== keeper.id || bead.hidden) continue;
          const bm = shift(bead), R = bead.r || 15, since = clock - (bead.sealedAt ?? -100);
          // It hangs with a slow sway; just sealed, it wobbles as it settles (the follow-through).
          let bow = 6 + (still ? 0 : Math.sin(clock * 2 + k) * 1.5);
          if (!still && since >= 0 && since < .5) bow += 6 * (1 - since / .5) * Math.cos(20 * since);
          const q = amberThread(tx, ty, bead.x + bm.dx, bead.y + bm.dy, R, bow, 8, k);
          const path = () => { ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.quadraticCurveTo(q[2], q[3], q[4], q[5]); };
          path(); ctx.strokeStyle = A.honeyDark; ctx.lineWidth = 3.8; ctx.stroke();
          ctx.save(); ctx.globalAlpha *= .95; path(); ctx.strokeStyle = A.honey; ctx.lineWidth = 2.1; ctx.stroke(); ctx.restore();
          if (quality <= 1) {
            ctx.save(); ctx.translate(-.35, -.4); path(); ctx.strokeStyle = 'rgba(255,250,220,.9)'; ctx.lineWidth = .75; ctx.stroke(); ctx.restore();
          }
          // Honey motes slide down the thread from him to the bead (one still mote with Animations off).
          const motes = still ? [.5] : quality === 0 ? [(clock * .7 + k * .5) % 1, (clock * .7 + k * .5 + .5) % 1] : quality === 1 ? [(clock * .7 + k * .5) % 1] : [];
          for (const t of motes) { const [x, y] = amberQuad(q, t); kit.circle(ctx, x, y, 1.6, '#fff3c4', 'rgba(104,58,8,.55)', .6); }
          k++;
        }
        // 2. A tell: dotted threads flow out of his tail to each bud he wants, and a ring closes round each like a clock hand.
        const plan = f.plan;
        if (plan) KEEPER_LAST.set(keeper, plan.ids.slice());
        const snap = !plan && !still && f.flinch >= 0 && f.flinch < .25 ? KEEPER_LAST.get(keeper) : null;
        const ids = plan ? plan.ids : snap || [];
        for (const id of ids) {
          const bud = buds.find(b => b.id === id);
          if (!bud || bud.bloomed || bud.hidden) continue;
          const bm = shift(bud), bx = bud.x + bm.dx, by = bud.y + bm.dy, R = (bud.r || 11) + 6;
          const q = amberThread(tx, ty, bx, by, R, 6 + (still ? 0 : Math.sin(clock * 2 + k) * 1.5), 8, k);
          // Snapped back after a flinch, the thread whips home to his tail over .25 s.
          const grow = snap ? 1 - kit.smooth(f.flinch / .25) : still ? 1 : kit.smooth(Math.min(1, f.u / .3));
          if (grow > .02) dotted(ctx, amberPoints(q, grow), '#e8a21c', 2.1, 6, still ? 0 : -clock * 30);
          if (snap) continue;
          const u = f.u, left = plan.at - clock, flash = !still && left < .2 && Math.floor(left / .1) % 2 === 0;
          if (still) {
            const ring = []; for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + i / 24 * TAU; ring.push([bx + R * Math.cos(a), by + R * Math.sin(a)]); }
            dotted(ctx, ring, '#e8a21c', 2.1, TAU * R / 24, 0);
          } else {
            // Six honey drops gather in from just outside as the ring closes.
            if (quality === 0) for (let i = 0; i < 6; i++) {
              const a = i * TAU / 6 + .5, d = (bud.r || 11) + 14 - 10 * u;
              ctx.save(); ctx.globalAlpha *= .35 + .65 * u; kit.circle(ctx, bx + d * Math.cos(a), by + d * Math.sin(a), 1.5 + .6 * u, A.honey, A.honeyDark, .7); ctx.restore();
            }
            ctx.beginPath(); ctx.arc(bx, by, R, -Math.PI / 2, -Math.PI / 2 + u * TAU); ctx.strokeStyle = A.honeyDark; ctx.lineWidth = 4; ctx.stroke();
            ctx.strokeStyle = flash ? '#ffffff' : A.honey; ctx.lineWidth = 2.4; ctx.stroke();
            // The hand: a bright bead at the ring's leading end.
            const a = -Math.PI / 2 + u * TAU; kit.circle(ctx, bx + R * Math.cos(a), by + R * Math.sin(a), 2.3, flash ? '#ffffff' : '#fff3c4', A.honeyDark, 1);
          }
          k++;
        }
      }
    }
  });
  BloomFoeLook('amber', {
    warm(kit) { for (const R of [15, 16]) { const [key, box, paint] = KEEPER_SPRITES.bead(R); kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint); } },
    // The bud inside is drawn first (it is earlier in the list), so it shows through the amber.
    bud(ctx, bud, time, still, state, kit, quality) {
      const R = Math.round(bud.r || 15), clock = Number(state.foeClock) || 0, h = amberHash(bud.id) * TAU;
      const pop = still ? 1 : kit.easeBack(clamp((clock - (bud.sealedAt ?? -100)) / .22, 0, 1)), sx = still ? 1 : 1 + .025 * Math.sin(clock * 3 + h);
      keeperStamp(ctx, kit, KEEPER_SPRITES.bead(R), bud.x, bud.y, 0, pop * sx, pop / sx);
      if (quality <= 1 && pop > .5) {
        const tw = still ? .8 : .5 + .5 * Math.max(0, Math.sin(clock * 2.3 + h));
        kit.sparkle(ctx, bud.x - R * .4 * pop, bud.y - R * .45 * pop, R * .2 * tw, '#ffffff', .2);
      }
    }
  });

  // ── Whizzbang (Level 7, `whizzbang`) ──
  // A round paper firework on a springy green coil, with a plum cone cap and a curly fuse, grinning. Lit, it squeezes its
  // eyes in delight: the fuse burns down under a riding spark, a countdown ring sweeps round it, it shivers and its coil
  // winds tight, and a dotted column shows where the rocket will fly (corner brackets on each flower it will pin, a gold
  // ring where it will bang). It flies stretched along its path on a flickering flame with a sparkle trail, "whee", and
  // bangs in gold and poppy rays. Aimed at, it shows the same column and a pill with how many flowers it would take.
  const WZ = { ink: '#732c48', poppy: '#ff7433', cream: '#fff2b1', gold: '#ffd148', plum: '#b63b65', leaf: '#8ab35e', leafInk: '#4f7a3a', fuse: '#9a6a43',
    deep: '#c94a2c', blush: '#ff9fb0', mouth: '#5b1f37', tongue: '#ff8f8f' };
  const WZ_FACES = ['calm', 'lit', 'fly'];
  function paintWhizzBody(c, r, face) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    // The cap: a plum cone with a cream stripe and a gold star dot at its tip, seated on the ball.
    const cone = () => { c.beginPath(); c.moveTo(-r * .66, -r * .72); c.quadraticCurveTo(0, -r * 1, r * .66, -r * .72); c.lineTo(r * .12, -r * 1.5); c.quadraticCurveTo(0, -r * 1.6, -r * .12, -r * 1.5); c.closePath(); };
    cone(); c.fillStyle = WZ.plum; c.fill();
    c.save(); c.clip(); c.beginPath(); c.moveTo(-r, -r * 1.12); c.lineTo(r, -r * 1.12); c.lineWidth = r * .17; c.strokeStyle = WZ.cream; c.stroke(); c.restore();
    cone(); c.strokeStyle = WZ.ink; c.lineWidth = 1.4; c.stroke();
    // The ball: poppy paper wrapped by two cream bands, a darker belly and a soft shine.
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = WZ.poppy; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.ellipse(r * .25, r * .7, r * 1.1, r * .55, 0, 0, TAU); c.fillStyle = WZ.deep; c.globalAlpha = .45; c.fill(); c.globalAlpha = 1;
    for (const [y, ry] of [[-r * .55, r * .3], [r * .38, r * .3]]) { c.beginPath(); c.ellipse(0, y, r * 1.12, ry, 0, .05, Math.PI - .05); c.strokeStyle = WZ.cream; c.lineWidth = r * .2; c.stroke(); }
    c.beginPath(); c.ellipse(-r * .46, -r * .3, r * .22, r * .13, -.7, 0, TAU); c.fillStyle = 'rgba(255,255,255,.6)'; c.fill();
    c.restore();
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = WZ.ink; c.lineWidth = 1.6; c.stroke();
    // The gold star dot on the cap.
    c.beginPath(); c.moveTo(0, -r * 1.79); for (let i = 1; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * .12 : r * .29; c.lineTo(Math.cos(a) * k, -r * 1.5 + Math.sin(a) * k); }
    c.closePath(); c.fillStyle = WZ.gold; c.fill(); c.strokeStyle = WZ.ink; c.lineWidth = .9; c.stroke();
    // The face, between the bands.
    const ey = -r * .02, ex = r * .34;
    c.strokeStyle = WZ.ink; c.fillStyle = WZ.ink;
    if (face === 'calm') {
      for (const side of [-1, 1]) { c.beginPath(); c.arc(side * ex, ey, r * .12, 0, TAU); c.fill(); c.beginPath(); c.arc(side * ex - r * .04, ey - r * .05, r * .045, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.fillStyle = WZ.ink; }
      c.beginPath(); c.arc(0, r * .1, r * .2, .25 * Math.PI, .75 * Math.PI); c.lineWidth = 1.5; c.stroke();
    } else if (face === 'lit') {
      // Squeezed > < with delight, and a wide open grin.
      c.lineWidth = 1.6;
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * (ex + r * .12), ey - r * .12); c.lineTo(side * (ex - r * .08), ey); c.lineTo(side * (ex + r * .12), ey + r * .12); c.stroke(); }
      c.beginPath(); c.moveTo(-r * .3, r * .1); c.quadraticCurveTo(0, r * .62, r * .3, r * .1); c.closePath(); c.fillStyle = WZ.mouth; c.fill(); c.lineWidth = 1.2; c.stroke();
      c.beginPath(); c.ellipse(0, r * .3, r * .12, r * .06, 0, 0, TAU); c.fillStyle = WZ.tongue; c.fill();
    } else {
      // Whee: round eyes looking up and an "O" mouth.
      for (const side of [-1, 1]) {
        c.beginPath(); c.arc(side * ex, ey - r * .04, r * .17, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.2; c.stroke();
        c.beginPath(); c.arc(side * ex, ey - r * .1, r * .08, 0, TAU); c.fillStyle = WZ.ink; c.fill();
      }
      c.beginPath(); c.ellipse(0, r * .3, r * .1, r * .13, 0, 0, TAU); c.fillStyle = WZ.mouth; c.fill(); c.lineWidth = 1.2; c.stroke();
    }
    for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * r * .62, r * .2, r * .13, r * .08, 0, 0, TAU); c.fillStyle = WZ.blush; c.globalAlpha = .8; c.fill(); c.globalAlpha = 1; }
  }
  // The springy coil under the bud: four kinks of green wire, inked.
  function paintWhizzStem(c, r) {
    const top = r * .9, pts = [[0, top], [-4, top + 2.5], [4, top + 5.5], [-4, top + 8.5], [4, top + 11.5], [0, top + 14]];
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [color, width] of [[WZ.leafInk, 3.4], [WZ.leaf, 1.8]]) { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
    c.beginPath(); c.ellipse(2.6, top + 15.2, 3.2, 1.6, .5, 0, TAU); c.fillStyle = WZ.leaf; c.fill(); c.strokeStyle = WZ.leafInk; c.lineWidth = .9; c.stroke();
  }
  // A 7 px four-point gold star with a white core; frame 1 is turned and a little smaller, so the spark fizzes.
  function paintWhizzSpark(c, frame) {
    const size = frame ? 3 : 3.6, turn = frame ? Math.PI / 4 : 0;
    c.beginPath(); for (let i = 0; i < 8; i++) { const a = turn + i * Math.PI / 4, k = i % 2 ? size * .32 : size; c.lineTo(Math.cos(a) * k, Math.sin(a) * k); }
    c.closePath(); c.fillStyle = WZ.gold; c.fill(); c.strokeStyle = WZ.poppy; c.lineWidth = .7; c.stroke();
    c.beginPath(); c.arc(0, 0, 1.15, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
  }
  // A 14 px poppy teardrop with a gold inner flame, pointing down from the origin; three flickers.
  function paintWhizzFlame(c, frame) {
    const len = [14, 12, 15.5][frame], lean = [0, 1.2, -1.2][frame];
    const drop = (w, l, color) => { c.beginPath(); c.moveTo(-w, 0); c.quadraticCurveTo(-w, l * .55, lean, l); c.quadraticCurveTo(w, l * .55, w, 0); c.quadraticCurveTo(0, -w * .7, -w, 0); c.closePath(); c.fillStyle = color; c.fill(); };
    drop(5.2, len, WZ.poppy); drop(2.8, len * .62, WZ.gold); drop(1.2, len * .3, '#fffbe6');
  }
  // The bang: eight tapered rays, gold and poppy by turns, each ending in a dot, round a cream heart.
  function paintWhizzBurst(c) {
    c.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, color = i % 2 ? WZ.poppy : WZ.gold, len = i % 2 ? 26 : 32, ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
      c.beginPath(); c.moveTo(ux * 6 + px * 3.2, uy * 6 + py * 3.2); c.lineTo(ux * len, uy * len); c.lineTo(ux * 6 - px * 3.2, uy * 6 - py * 3.2); c.closePath(); c.fillStyle = color; c.fill();
      c.beginPath(); c.arc(ux * (len + 4.5), uy * (len + 4.5), 2.6, 0, TAU); c.fill();
    }
    c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fillStyle = WZ.cream; c.fill();
    c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, k = i % 2 ? 2.2 : 5.6; c.lineTo(Math.cos(a) * k, Math.sin(a) * k); } c.closePath(); c.fillStyle = '#ffffff'; c.fill();
  }
  const WZ_SPRITES = {
    body: (r, face) => [`foe:whizzbang:${r}:${face}`, [-r - 3, -r * 2, r + 3, r + 3], c => paintWhizzBody(c, r, face)],
    stem: r => [`foe:whizzbang:${r}:stem`, [-7, r * .9 - 3, 8, r * .9 + 18], c => paintWhizzStem(c, r)],
    spark: f => [`foe:whizzbang:spark${f}`, [-5, -5, 5, 5], c => paintWhizzSpark(c, f)],
    flame: f => [`foe:whizzbang:flame${f}`, [-7, -5, 7, 18], c => paintWhizzFlame(c, f)],
    burst: () => ['foe:whizzbang:burst', [-40, -40, 40, 40], paintWhizzBurst],
    pill: n => [`foe:whizzbang:pill${n}`, [-18, -10, 18, 10], c => {
      const text = 'x' + n; c.font = '700 13px Fredoka, Nunito, sans-serif'; const w = Math.max(24, Math.min(34, c.measureText(text).width + 12));
      c.beginPath(); c.moveTo(-w / 2 + 7, -8.5); c.arcTo(w / 2, -8.5, w / 2, 8.5, 7); c.arcTo(w / 2, 8.5, -w / 2, 8.5, 7); c.arcTo(-w / 2, 8.5, -w / 2, -8.5, 7); c.arcTo(-w / 2, -8.5, w / 2, -8.5, 7); c.closePath();
      c.fillStyle = WZ.cream; c.fill(); c.strokeStyle = WZ.ink; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = WZ.ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 0, .8);
    }]
  };
  const wzStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  // Where along a flight path (d px from its nose) the rocket is, and which way it heads (as foes.js whizzAlong walks it).
  function wzAlong(path, d) {
    let left = Math.max(0, d), from = null, last = null;
    for (const q of path.pts || []) {
      if (!q) { from = null; continue; }
      if (from) {
        const l = Math.hypot(q[0] - from[0], q[1] - from[1]);
        last = [from, q];
        if (left <= l) { const k = l ? left / l : 0; return { x: from[0] + (q[0] - from[0]) * k, y: from[1] + (q[1] - from[1]) * k, a: Math.atan2(q[1] - from[1], q[0] - from[0]) }; }
        left -= l;
      }
      from = q;
    }
    const end = path.end || { x: 0, y: 0 };
    return { x: end.x, y: end.y, a: last ? Math.atan2(last[1][1] - last[0][1], last[1][0] - last[0][0]) : -Math.PI / 2 };
  }
  // The column tell: a dotted poppy line along the forecast flight, cream brackets on each flower it would pin, and a
  // dashed gold ring where it would bang. The one rules call in the art (see the spec: whizzPath is too big to copy).
  function wzColumn(ctx, state, plan, time, still) {
    if (!plan || !Array.isArray(plan.pts)) return;
    let run = [];
    const flush = () => { if (run.length > 1) dotted(ctx, run, WZ.poppy, 2.1, 7, still ? 0 : -time * 26); run = []; };
    for (const q of plan.pts) { if (!q) flush(); else run.push(q); }
    flush();
    const end = plan.end;
    if (end && Number.isFinite(end.x) && Number.isFinite(end.y)) {
      ctx.save(); ctx.globalAlpha *= .5; ctx.setLineDash([5, 4]); ctx.lineDashOffset = still ? 0 : -time * 12;
      ctx.beginPath(); ctx.arc(end.x, end.y, 34, 0, TAU); ctx.strokeStyle = WZ.gold; ctx.lineWidth = 2.4; ctx.stroke(); ctx.restore();
    }
  }
  // Over the buds: cream brackets on each flower the column would pin, and a ghost rocket where it will really leave
  // when that is not where it sits now (it keeps swaying while the striker flies and the fuse burns).
  function wzMarks(ctx, state, plan, bud, kit) {
    if (!plan) return;
    const r = Number(bud.r) || 12, p0 = Array.isArray(plan.pts) && plan.pts[0], lx = p0 ? p0[0] : bud.x, ly = p0 ? p0[1] + r : bud.y;
    if (Math.hypot(lx - bud.x, ly - bud.y) > 5) { ctx.save(); ctx.globalAlpha *= .42; wzStamp(ctx, kit, WZ_SPRITES.body(r, 'calm'), lx, ly); ctx.restore(); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const byId = new Map((state.buds || []).map(b => [b.id, b]));
    for (const pin of plan.pins || []) {
      const b = byId.get(pin.id); if (!b || b.bloomed || b.hidden) continue;
      const s = (Number(b.r) || 11) + 4, arm = 4.5;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath(); ctx.moveTo(b.x + sx * s, b.y + sy * (s - arm)); ctx.lineTo(b.x + sx * s, b.y + sy * s); ctx.lineTo(b.x + sx * (s - arm), b.y + sy * s);
        ctx.strokeStyle = WZ.ink; ctx.lineWidth = 3.4; ctx.stroke(); ctx.strokeStyle = WZ.cream; ctx.lineWidth = 1.8; ctx.stroke();
      }
    }
    return { x: lx, y: ly };
  }
  // A lit fuse's forecast, worked out once a frame and shared by the under and over hooks.
  const wzLitPlans = new WeakMap();
  function wzLitPlan(state, bud) {
    const W = wzRules(), w = bud.whizz; if (!W || typeof W.plan !== 'function' || !w) return null;
    const clock = Number(state.foeClock) || 0, seen = wzLitPlans.get(bud);
    if (seen && seen.clock === clock && seen.state === state) return seen.plan;
    const ahead = Math.max(0, (Number(w.fuse) || 1) - (clock - (Number(w.at) || 0)));
    let plan = null; try { plan = W.plan(state, bud, ahead, null, wzBossAt(state, ahead)); } catch (error) { plan = null; }
    wzLitPlans.set(bud, { clock, state, plan }); return plan;
  }
  // A rocket in flight: stretched along its heading on a flickering flame, a trail of sparkles behind.
  function wzFlight(ctx, bud, state, time, still, kit, quality) {
    const r = Number(bud.r) || 12, clock = Number(state.foeClock) || 0, w = bud.whizz, x = bud.x, y = bud.y;
    const speed = (wzRules() && wzRules().WHIZ && wzRules().WHIZ.speed) || 620, d = Math.min(Number(w.path.len) || 0, Math.max(0, (clock - (Number(w.flyAt) || 0)) * speed));
    const at = wzAlong(w.path, d), turn = at.a + Math.PI / 2, dots = quality >= 2 ? 0 : quality === 1 ? 4 : 8;
    for (let k = 0; k < dots; k++) {
      const back = 16 + k * 9; if (back > d) break;
      const p = wzAlong(w.path, d - back), tw = still ? 1 : .6 + .4 * Math.sin(time * 30 + k * 1.7), fade = 1 - k / (dots + 1);
      ctx.save(); ctx.globalAlpha *= fade * tw; kit.sparkle(ctx, p.x, p.y, 3.2 * fade + 1, k % 2 ? WZ.cream : WZ.gold, still ? 0 : time * 6 + k); ctx.restore();
    }
    const flame = still ? 0 : Math.floor(clock * 30) % 3;
    ctx.save(); ctx.translate(x, y); ctx.rotate(turn);
    wzStamp(ctx, kit, WZ_SPRITES.flame(flame), 0, r * .9, 0, 1, still ? 1 : 1 + .12 * Math.sin(time * 50));
    wzStamp(ctx, kit, WZ_SPRITES.body(r, 'fly'), 0, 0, 0, .85, 1.2);
    ctx.restore();
  }
  const wzRules = () => root.BloomFoes && root.BloomFoes.FOES && root.BloomFoes.FOES.whizzbang;
  const wzBossAt = (state, ahead) => root.BloomBosses && state.bossState && typeof root.BloomBosses.predictVisible === 'function' ? root.BloomBosses.predictVisible(state, ahead) : null;
  BloomFoeLook('whizzbang', {
    warm(kit, r = 12) {
      const jobs = [...WZ_FACES.map(f => WZ_SPRITES.body(r, f)), WZ_SPRITES.stem(r), WZ_SPRITES.spark(0), WZ_SPRITES.spark(1), ...[0, 1, 2].map(WZ_SPRITES.flame), WZ_SPRITES.burst()];
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    under(ctx, state, time, still) {
      // Each lit fuse's column, from where its rocket will really leave.
      for (const bud of state.buds || []) {
        const w = bud.foe === 'whizzbang' && !bud.bloomed && bud.whizz;
        if (w && w.mode === 'lit') wzColumn(ctx, state, wzLitPlan(state, bud), time, still);
      }
    },
    bud(ctx, bud, time, still, state, kit, quality) {
      const r = Number(bud.r) || 12, clock = Number(state && state.foeClock) || 0, w = bud.whizz, x = bud.x, y = bud.y;
      // Flying, it is drawn above the buds (the over hook), so the flowers it pins never cover it.
      if (w && w.mode !== 'lit') return;
      if (w) {
        // Lit: the coil winds tight, the body shivers, the fuse burns down under its spark and a countdown ring sweeps.
        const u = clamp((clock - (Number(w.at) || 0)) / Math.max(.05, Number(w.fuse) || 1), 0, 1), shiver = still ? 0 : .8 * Math.sin(clock * 70);
        ctx.save(); ctx.translate(x, y + r * .9); ctx.scale(1, 1 - .45 * u * u); ctx.translate(-x, -y - r * .9); wzStamp(ctx, kit, WZ_SPRITES.stem(r), x, y); ctx.restore();
        ctx.lineCap = 'round';
        for (const [color, width] of [['#fff2b1', 3.5], [WZ.poppy, 2]]) { ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + (1 - u) * TAU); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
        wzStamp(ctx, kit, WZ_SPRITES.body(r, 'lit'), x + shiver, y);
        const tip = wzFuse(ctx, x + shiver, y - r * 1.72, 7 * (1 - u), still ? 0 : time);
        wzStamp(ctx, kit, WZ_SPRITES.spark(still ? 0 : Math.floor(clock * 24) % 2), tip.x, tip.y, 0, still ? 1 : 1 + .15 * Math.sin(time * 40));
        return;
      }
      // Unlit: it bobs on its coil, leaning into its sway, a little curly fuse on top.
      const sway = Number(bud.sway) || 0, tilt = still || !sway ? 0 : .22 * Math.min(1, sway / 24) * Math.cos((Number(bud.swayW) || 0) * (clock - (Number(bud.born) || 0)) + (Number(bud.swayPhase) || 0));
      ctx.save(); ctx.translate(x, y); if (tilt) ctx.rotate(tilt);
      wzStamp(ctx, kit, WZ_SPRITES.stem(r), 0, 0);
      wzStamp(ctx, kit, WZ_SPRITES.body(r, 'calm'), 0, 0);
      wzFuse(ctx, 0, -r * 1.72, 7, still ? 0 : time);
      ctx.restore();
    },
    over(ctx, state, time, still, kit, quality) {
      for (const bud of state.buds || []) {
        const w = bud.foe === 'whizzbang' && !bud.bloomed && !bud.hidden && bud.whizz;
        if (w && w.mode === 'lit') { ctx.save(); wzMarks(ctx, state, wzLitPlan(state, bud), bud, kit); ctx.restore(); }
        if (w && (w.mode === 'fly' || w.mode === 'bang') && w.path) { ctx.save(); wzFlight(ctx, bud, state, time, still, kit, quality); ctx.restore(); }
      }
      // The bang: a burst of rays where a rocket went off, for .4 s after it blooms.
      for (const bud of state.buds || []) {
        if (bud.foe !== 'whizzbang' || !bud.bloomed || !bud.whizz || !bud.whizz.done || typeof bud.bloomAt !== 'number') continue;
        const e = (time - bud.bloomAt) / .4; if (!(e >= 0 && e < 1)) continue;
        ctx.save(); ctx.globalAlpha *= still ? .8 : 1 - e;
        const k = still ? 1 : .4 + .8 * kit.easeBack(e); wzStamp(ctx, kit, WZ_SPRITES.burst(), bud.x, bud.y, still ? 0 : e * .5, k);
        ctx.restore();
      }
    },
    aim(ctx, state, time, still, kit) {
      // Aimed at an unlit whizzbang: the column it would fly and how many flowers it would take.
      const aim = state.aim, target = aim && aim.target;
      if (!target || target.foe !== 'whizzbang' || target.whizz || target.bloomed) return;
      const W = wzRules(); if (!W || typeof W.plan !== 'function') return;
      let length = 0; for (let i = 1; i < aim.length; i++) if (aim[i] && aim[i - 1]) length += Math.hypot(aim[i].x - aim[i - 1].x, aim[i].y - aim[i - 1].y);
      const ahead = length / Math.max(1, Number(state.speed) || 520) + 1;
      let plan = null; try { plan = W.plan(state, target, ahead, null, wzBossAt(state, ahead)); } catch (error) { plan = null; }
      if (!plan) return;
      wzColumn(ctx, state, plan, time, still);
      // The count rides beside the launch spot: the column's top is under the wave banner while a wave opens.
      const at = wzMarks(ctx, state, plan, target, kit), r = Number(target.r) || 12, side = at.x > 210 ? -1 : 1;
      const n = Math.min(12, (plan.pins || []).length + (plan.bangs || []).length);
      wzStamp(ctx, kit, WZ_SPRITES.pill(n), clamp(at.x + side * (r + 24), 30, 390), at.y + r * .4);
    }
  });
  // The curly fuse: three little arcs rising `len` px from (x, y); returns its tip, where the spark rides.
  function wzFuse(ctx, x, y, len, time) {
    if (len <= .3) return { x, y };
    const wig = 1.7, n = 3, step = len / n, sway = Math.sin(time * 5) * .6;
    ctx.lineCap = 'round';
    for (const [color, width] of [[WZ.ink, 3.2], [WZ.fuse, 1.8]]) {
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 0; i < n; i++) ctx.quadraticCurveTo(x + (i % 2 ? -wig : wig) + sway * (i + 1) / n, y - step * (i + .5), x + sway * (i + 1) / n, y - step * (i + 1));
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    return { x: x + sway, y: y - len };
  }

  // ── Lodestone (Level 8, `lodestone`) ──
  // A round magnet rock prised from the mine roof: slate iron in a cream sticker rim, a red horseshoe band round its
  // belly with silver poles (it reads as a magnet at a glance), a cushion of moss over its top half (the part a seed
  // must touch) with one green tuft per hit left, and a kind face inside the horseshoe. A little compass needle of
  // light rides the rim, swaying shoulder to shoulder across the moss on the foe clock (the rules' own sway), and the
  // stone's eyes follow it. Beneath it a dashed sky arc marks how far its field reaches on the needle's side (the ring
  // shrinks as the moss wears), with chevrons drifting in toward the needle. Tugging a seed it strains ("> <") and a
  // dotted tether runs from the needle to the seed; a seed turned off its iron gets a smug look; a moss hit makes it
  // wince. When it opens, the iron clacks apart in two halves and its last tufts fly. While the aim guide ends on it, a
  // chip at the touch says what happens: a green leaf on the moss, a grey shield on the iron. Animations off: the
  // needle and arc still show the real field, but nothing breathes, drifts or glances, and the halves just fade.
  const LODE_ART = { iron: '#6f788b', light: '#9aa5b9', dark: '#4b5262', ink: '#2c303c', rim: '#fff4e2', fleck: '#c3cad6',
    band: '#e2504a', bandLight: '#ff8f84', bandDark: '#a3313a', silver: '#eef2f7', silverDark: '#9aa3b3', moss: '#86c450',
    mossLight: '#c4ea8e', mossDark: '#5d9a3e', mossInk: '#2f5a26', needle: '#fff6cf', field: '#45adff', fieldPale: '#c6e9ff',
    eye: '#232733', cheek: '#ff9f8f', mouth: '#fff0dc',
    jaw: 1.4, swing: 1, period: 5, rings: [40, 40, 60, 84], moss: 1.318, smug: .4, oof: .25, pull: .15, open: .4,
    tufts: [[], [0], [-.36, .36], [-.62, 0, .62]] };
  // The needle's angle, the same sway as foes.js (LODE.swing either side of straight up, once every LODE.period s on
  // the foe clock, from a phase hashed off the stone's id); kept here so the art has no dependency on the rules.
  const lodePhases = new Map();
  function lodePhase(id) {
    let p = lodePhases.get(id);
    if (p === undefined) {
      const s = `${id}:7`; let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      p = (h >>> 0) / 4294967296 * TAU;
      if (lodePhases.size > 64) lodePhases.clear();
      lodePhases.set(id, p);
    }
    return p;
  }
  const lodeNeedle = (bud, clock) => -Math.PI / 2 + LODE_ART.swing * Math.sin(TAU / LODE_ART.period * (clock - (bud.born || 0)) + lodePhase(bud.id));
  // The rock's lumpy outline (a circle with gentle bumps, never past r + .5).
  const LODE_LUMPS = [1, .95, .99, .94, 1.02, .96, .99, .93, 1.01, .96];
  function lodeOutline(c, r) {
    const n = LODE_LUMPS.length, pt = k => { const a = k / n * TAU - Math.PI / 2, q = r * LODE_LUMPS[k % n]; return [Math.cos(a) * q, Math.sin(a) * q]; };
    c.beginPath();
    for (let k = 0; k <= n; k++) {
      const [x0, y0] = pt(k), [x1, y1] = pt(k + 1), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      if (k === 0) c.moveTo(mx, my); else c.quadraticCurveTo(x0, y0, mx, my);
    }
    c.closePath();
  }
  // The iron with its horseshoe band (no moss, no face): the halves that fly apart are cut from this too.
  function paintLodeIron(c, r) {
    const L = LODE_ART;
    c.lineJoin = 'round'; c.lineCap = 'round';
    lodeOutline(c, r); c.lineWidth = 3.4; c.strokeStyle = L.rim; c.stroke();
    c.fillStyle = L.iron; c.fill();
    c.save(); lodeOutline(c, r); c.clip();
    c.beginPath(); c.arc(r * .3, r * .38, r * .95, 0, TAU); c.fillStyle = L.dark; c.fill();
    c.beginPath(); c.arc(-r * .06, -r * .1, r * .84, 0, TAU); c.fillStyle = L.iron; c.fill();
    c.beginPath(); c.ellipse(-r * .42, r * .12, r * .26, r * .5, .25, 0, TAU); c.fillStyle = L.light; c.globalAlpha = .55; c.fill(); c.globalAlpha = 1;
    // Flecks of ore and a hairline crack.
    for (const [fx, fy, fr] of [[-.18, .52, .07], [.36, .1, .06], [.08, .66, .05], [-.5, -.05, .05], [.55, .42, .05]]) { c.beginPath(); c.arc(fx * r, fy * r, fr * r + .3, 0, TAU); c.fillStyle = L.fleck; c.fill(); }
    c.beginPath(); c.moveTo(r * .62, r * .02); c.lineTo(r * .48, r * .2); c.lineTo(r * .56, r * .34); c.strokeStyle = L.dark; c.lineWidth = .8; c.stroke();
    c.restore();
    // The horseshoe: a red band hugging the lower rim, its ends silver poles that point up at the moss.
    const R = r * .74, w = r * .26, a0 = -.04, a1 = Math.PI + .04, pole = .46;
    c.lineCap = 'butt';
    c.beginPath(); c.arc(0, 0, R, a0, a1); c.lineWidth = w + 1.8; c.strokeStyle = L.ink; c.stroke();
    c.beginPath(); c.arc(0, 0, R, a0 + pole, a1 - pole); c.lineWidth = w; c.strokeStyle = L.band; c.stroke();
    c.beginPath(); c.arc(0, 0, R + w * .22, a0 + pole + .05, a1 - pole - .05); c.lineWidth = w * .3; c.strokeStyle = L.bandLight; c.stroke();
    c.beginPath(); c.arc(0, 0, R - w * .3, a0 + pole, a1 - pole); c.lineWidth = w * .25; c.strokeStyle = L.bandDark; c.globalAlpha = .7; c.stroke(); c.globalAlpha = 1;
    for (const [s0, s1] of [[a0, a0 + pole], [a1 - pole, a1]]) {
      c.beginPath(); c.arc(0, 0, R, s0, s1); c.lineWidth = w; c.strokeStyle = L.silver; c.stroke();
      c.beginPath(); c.arc(0, 0, R - w * .28, s0, s1); c.lineWidth = w * .3; c.strokeStyle = L.silverDark; c.stroke();
    }
    // Ink ticks where the poles meet the red, and a white glint on the band.
    c.strokeStyle = L.ink; c.lineWidth = .9; c.lineCap = 'round';
    for (const a of [a0 + pole, a1 - pole]) { c.beginPath(); c.moveTo(Math.cos(a) * (R - w / 2), Math.sin(a) * (R - w / 2)); c.lineTo(Math.cos(a) * (R + w / 2), Math.sin(a) * (R + w / 2)); c.stroke(); }
    c.beginPath(); c.arc(Math.cos(2.35) * R, Math.sin(2.35) * R, .9, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    lodeOutline(c, r); c.lineWidth = 1.5; c.strokeStyle = L.ink; c.stroke();
  }
  // One tuft at angle a on the rim: a soft moss bump with a two-leaf sprout standing up out of it (one per hit left).
  function paintLodeTuft(c, r, a) {
    const L = LODE_ART, ux = Math.cos(a), uy = Math.sin(a), tx = -uy, ty = ux, at = (d, s) => [ux * d + tx * s, uy * d + ty * s];
    c.lineCap = 'round'; c.lineJoin = 'round';
    const [bx, by] = at(r + .2, 0);
    c.beginPath(); c.arc(bx, by, 2.7, 0, TAU); c.fillStyle = L.moss; c.fill(); c.lineWidth = .9; c.strokeStyle = L.mossInk; c.stroke();
    c.beginPath(); c.arc(...at(r + 1, -.8), 1, 0, TAU); c.fillStyle = L.mossLight; c.fill();
    // The stem leans with the rim and a little to the right, then two leaves open off its tip.
    const [sx, sy] = at(r + 1.6, 0), [ex, ey] = at(r + 5.4, .5);
    c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(...at(r + 4, -.3), ex, ey); c.lineWidth = 2.3; c.strokeStyle = L.mossInk; c.stroke();
    c.lineWidth = 1.1; c.strokeStyle = L.mossLight; c.stroke();
    for (const side of [-1, 1]) {
      const la = Math.atan2(uy, ux) + side * .95, lx = ex + Math.cos(la) * 2.2, ly = ey + Math.sin(la) * 2.2;
      c.beginPath(); c.ellipse(lx, ly, 2.4, 1.35, la, 0, TAU); c.fillStyle = L.mossLight; c.fill(); c.lineWidth = .8; c.strokeStyle = L.mossInk; c.stroke();
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(lx + Math.cos(la) * .9, ly + Math.sin(la) * .9); c.lineWidth = .5; c.strokeStyle = L.moss; c.stroke();
    }
  }
  // The iron, the moss cushion over the top (its ends at the rules' moss line, ny = -.25) and hp sprouts.
  function paintLodeBody(c, r, hp) {
    const L = LODE_ART, m = L.moss, top = -Math.PI / 2;
    paintLodeIron(c, r);
    // The cushion: a scalloped crown along the rim and a fringe of little drips over the iron.
    const n = 7, cushion = () => {
      c.beginPath();
      for (let k = 0; k < n; k++) {
        const e0 = top - m + k / n * 2 * m, e1 = top - m + (k + 1) / n * 2 * m, em = (e0 + e1) / 2, q = r + (k % 2 ? 1.1 : 1.7);
        if (k === 0) c.moveTo(Math.cos(e0) * r, Math.sin(e0) * r);
        c.quadraticCurveTo(Math.cos(em) * (q + 1.1), Math.sin(em) * (q + 1.1), Math.cos(e1) * (r + .4), Math.sin(e1) * (r + .4));
      }
      const fr = [[.9, -.2], [.62, -.42], [.3, -.52], [0, -.58], [-.3, -.52], [-.62, -.42], [-.9, -.2]];
      for (let k = 0; k < fr.length; k++) {
        const [x0, y0] = k ? fr[k - 1] : [Math.sin(m), -Math.cos(m)], [x1, y1] = fr[k];
        c.quadraticCurveTo((x0 + x1) / 2 * r, ((y0 + y1) / 2 + .13) * r, x1 * r, y1 * r);
      }
      c.closePath();
    };
    c.save(); c.translate(0, 1.3); cushion(); c.fillStyle = L.ink; c.globalAlpha = .28; c.fill(); c.restore();
    cushion(); c.lineWidth = 2.2; c.strokeStyle = L.mossInk; c.stroke(); c.fillStyle = L.mossDark; c.fill();
    // Lit from the upper left: the fringe and right shoulder stay dark, a pale sheen along the crown.
    c.save(); cushion(); c.clip();
    c.beginPath(); c.arc(-r * .1, -r * .2, r * 1.02, 0, TAU); c.fillStyle = L.moss; c.fill();
    c.beginPath(); c.arc(-r * .1, -r * .08, r * .93, top - 1.05, top + .3); c.lineWidth = r * .13; c.strokeStyle = L.mossLight; c.globalAlpha = .85; c.stroke(); c.globalAlpha = 1;
    for (const [a, d] of [[-.85, .66], [.1, .74], [.7, .64], [-.35, .58]]) { c.beginPath(); c.arc(Math.cos(top + a) * d * r, Math.sin(top + a) * d * r, .7, 0, TAU); c.fillStyle = L.mossLight; c.fill(); }
    c.restore();
    for (const a of L.tufts[clamp(hp | 0, 1, 3)]) paintLodeTuft(c, r, top + a);
  }
  // Faces, inside the horseshoe. Calm and pull leave their pupils to the live draw (they follow the needle, or the
  // seed being tugged).
  function paintLodeFace(c, r, face) {
    const L = LODE_ART, ey = -r * .04, ex = r * .3;
    c.lineCap = 'round'; c.lineJoin = 'round';
    const cheeks = a => { c.globalAlpha = a; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * r * .53, r * .2, r * .13, r * .085, 0, 0, TAU); c.fillStyle = L.cheek; c.fill(); } c.globalAlpha = 1; };
    const white = (x, sy = 1) => { c.beginPath(); c.ellipse(x, ey, r * .17, r * .2 * sy, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = .8; c.strokeStyle = L.ink; c.stroke(); };
    const smile = (y, w, a0 = .2, a1 = .8) => { c.beginPath(); c.arc(0, y, w, a0 * Math.PI, a1 * Math.PI); c.lineWidth = 1.4; c.strokeStyle = L.ink; c.stroke(); c.lineWidth = .7; c.strokeStyle = L.mouth; c.stroke(); };
    if (face === 'calm') {
      for (const s of [-1, 1]) white(s * ex);
      cheeks(.75); smile(r * .2, r * .15);
    } else if (face === 'pull') {
      // Tugging: wide eyes on the seed under brows knit down hard, cheeks flushed, teeth gritted in a grin.
      for (const s of [-1, 1]) {
        white(s * ex);
        c.beginPath(); c.moveTo(s * (ex + r * .2), ey - r * .3); c.lineTo(s * (ex - r * .14), ey - r * .19); c.lineWidth = 1.6; c.strokeStyle = L.ink; c.stroke();
      }
      cheeks(1);
      c.beginPath(); c.moveTo(-r * .22, r * .19); c.quadraticCurveTo(0, r * .37, r * .22, r * .19); c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = .9; c.strokeStyle = L.ink; c.stroke();
      c.beginPath(); c.moveTo(-r * .17, r * .24); c.lineTo(r * .17, r * .24); c.lineWidth = .6; c.stroke();
    } else if (face === 'smug') {
      // A seed turned off its iron: lids half down, eyes slid aside, one brow up, a crooked smirk.
      for (const s of [-1, 1]) {
        white(s * ex);
        c.beginPath(); c.arc(s * ex + r * .08, ey + r * .06, r * .09, 0, TAU); c.fillStyle = L.eye; c.fill();
        c.save(); c.beginPath(); c.ellipse(s * ex, ey, r * .17, r * .2, 0, 0, TAU); c.clip();
        c.fillStyle = L.light; c.fillRect(s * ex - r * .2, ey - r * .25, r * .4, r * .24); c.restore();
        c.beginPath(); c.moveTo(s * ex - r * .17, ey - r * .01); c.lineTo(s * ex + r * .17, ey - r * .01); c.lineWidth = 1; c.strokeStyle = L.ink; c.stroke();
      }
      c.beginPath(); c.moveTo(r * .16, ey - r * .34); c.quadraticCurveTo(r * .3, ey - r * .44, r * .46, ey - r * .32); c.lineWidth = 1.2; c.strokeStyle = L.ink; c.stroke();
      cheeks(.6);
      c.beginPath(); c.moveTo(-r * .14, r * .25); c.quadraticCurveTo(r * .08, r * .3, r * .21, r * .15); c.lineWidth = 1.4; c.strokeStyle = L.ink; c.stroke(); c.lineWidth = .7; c.strokeStyle = L.mouth; c.stroke();
    } else {
      // A moss hit: "ow!", eyes squeezed to "> <", mouth a little "o".
      c.lineWidth = 2.2; c.strokeStyle = L.ink;
      const wince = () => { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * (ex + r * .14), ey - r * .14); c.lineTo(s * (ex - r * .1), ey); c.lineTo(s * (ex + r * .14), ey + r * .14); c.stroke(); } };
      wince(); c.lineWidth = 1.1; c.strokeStyle = '#ffffff'; wince();
      cheeks(.9);
      c.beginPath(); c.ellipse(0, r * .25, r * .09, r * .11, 0, 0, TAU); c.fillStyle = L.ink; c.fill(); c.lineWidth = .7; c.strokeStyle = L.mouth; c.stroke();
    }
  }
  // The compass needle (pointing along +x from the rim, its tip the point the field aims seeds at): a slim sliver of
  // light, white and sky on its outer half, silver on its inner half, and its glow, painted once.
  function paintLodeNeedle(c) {
    const L = LODE_ART;
    c.lineJoin = 'round';
    const sliver = () => { c.beginPath(); c.moveTo(-3, 0); c.lineTo(2.4, -2.1); c.lineTo(10.5, 0); c.lineTo(2.4, 2.1); c.closePath(); };
    sliver(); c.lineWidth = 2.4; c.strokeStyle = '#ffffff'; c.stroke(); c.fillStyle = L.needle; c.fill();
    c.beginPath(); c.moveTo(2.4, -2.1); c.lineTo(10.5, 0); c.lineTo(2.4, 0); c.closePath(); c.fillStyle = '#8ed2ff'; c.fill();
    c.beginPath(); c.moveTo(-3, 0); c.lineTo(2.4, -2.1); c.lineTo(2.4, 2.1); c.closePath(); c.fillStyle = L.silverDark; c.fill();
    sliver(); c.lineWidth = .9; c.strokeStyle = '#1d6ad6'; c.stroke();
    c.beginPath(); c.arc(2.4, 0, 1, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = .6; c.stroke();
  }
  function paintLodeGlow(c) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 10);
    g.addColorStop(0, 'rgba(230,247,255,.95)'); g.addColorStop(.4, 'rgba(142,210,255,.5)'); g.addColorStop(1, 'rgba(69,173,255,0)');
    c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.fillStyle = g; c.fill();
  }
  // Half of the iron (side -1 left, 1 right), cut along the middle with a jagged break.
  function paintLodeHalf(c, r, side) {
    c.save(); c.beginPath();
    const zig = [[0, -r - 4], [side * 1.5, -r * .5], [-side * 1.2, -r * .1], [side * 1.4, r * .3], [-side * .8, r * .7], [0, r + 4]];
    c.moveTo(...zig[0]); for (const p of zig.slice(1)) c.lineTo(...p);
    c.lineTo(side * (r + 6), r + 4); c.lineTo(side * (r + 6), -r - 4); c.closePath(); c.clip();
    paintLodeIron(c, r);
    c.restore();
    c.beginPath(); c.moveTo(0, -r); const zig2 = [[side * 1.5, -r * .5], [-side * 1.2, -r * .1], [side * 1.4, r * .3], [-side * .8, r * .7], [0, r]];
    for (const p of zig2) c.lineTo(...p);
    c.lineWidth = 1.3; c.strokeStyle = LODE_ART.ink; c.stroke();
  }
  // The aim chip: a moss leaf (it counts) or an iron shield (turned away), each in a cream rim.
  function paintLodeChip(c, moss) {
    const L = LODE_ART;
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (moss) {
      const leaf = () => { c.beginPath(); c.moveTo(-5, 4); c.quadraticCurveTo(-5, -4.5, 5, -5); c.quadraticCurveTo(4.5, 4, -5, 4); c.closePath(); };
      leaf(); c.lineWidth = 3; c.strokeStyle = L.rim; c.stroke(); c.fillStyle = L.moss; c.fill(); c.lineWidth = 1.1; c.strokeStyle = L.mossInk; c.stroke();
      c.beginPath(); c.moveTo(-4, 3); c.quadraticCurveTo(0, -.5, 3.6, -3.6); c.lineWidth = .9; c.strokeStyle = L.mossLight; c.stroke();
    } else {
      const shield = () => { c.beginPath(); c.moveTo(0, -5.5); c.lineTo(4.6, -3.8); c.quadraticCurveTo(4.6, 3, 0, 5.8); c.quadraticCurveTo(-4.6, 3, -4.6, -3.8); c.closePath(); };
      shield(); c.lineWidth = 3; c.strokeStyle = L.rim; c.stroke(); c.fillStyle = L.light; c.fill(); c.lineWidth = 1.1; c.strokeStyle = L.ink; c.stroke();
      c.beginPath(); c.moveTo(0, -3.8); c.lineTo(3, -2.6); c.quadraticCurveTo(3, 2, 0, 4); c.closePath(); c.fillStyle = L.dark; c.fill();
    }
  }
  const lodeBox = r => { const e = r + 10; return [-e, -e, e, r + 4]; };
  const lodeBody = (r, hp) => [`foe:lodestone:${r}:body${hp}`, lodeBox(r), c => paintLodeBody(c, r, hp)];
  const lodeFace = (r, face) => [`foe:lodestone:${r}:face-${face}`, [-r * .7, -r * .4, r * .7, r * .45], c => paintLodeFace(c, r, face)];
  const lodeHalf = (r, side) => [`foe:lodestone:${r}:half${side}`, [-r - 4, -r - 4, r + 4, r + 4], c => paintLodeHalf(c, r, side)];
  const LODE_NEEDLE = ['foe:lodestone:needle', [-5, -4, 12, 4], paintLodeNeedle];
  const LODE_GLOW = ['foe:lodestone:glow', [-10, -10, 10, 10], paintLodeGlow];
  const lodeChip = moss => [`foe:lodestone:chip-${moss ? 'moss' : 'iron'}`, [-7, -7.5, 7, 7.5], c => paintLodeChip(c, moss)];
  const stampLode = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  BloomFoeLook('lodestone', {
    warm(kit, r) {
      const jobs = [lodeBody(r, 3), lodeBody(r, 2), lodeBody(r, 1), lodeFace(r, 'calm'), lodeFace(r, 'pull'), lodeFace(r, 'smug'), lodeFace(r, 'oof'),
        lodeHalf(r, -1), lodeHalf(r, 1), LODE_NEEDLE, LODE_GLOW, lodeChip(true), lodeChip(false)];
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    // Its field under the buds: a dashed arc at the ring's reach on the needle's side, and chevrons drifting in.
    under(ctx, state, time, still, kit, quality) {
      const L = LODE_ART, clock = Number(state.foeClock) || 0;
      for (const bud of state.buds || []) {
        if (bud.foe !== 'lodestone' || bud.bloomed || bud.hidden || bud.visible === false) continue;
        const m = kit.budShift(bud, time, still), x = bud.x + m.dx, y = bud.y + m.dy, r = bud.r || 13;
        const R = L.rings[clamp(bud.hp | 0, 1, 3)], a = lodeNeedle(bud, clock);
        ctx.globalAlpha = m.alpha * (quality > 1 ? .55 : .75);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y, R, a - L.jaw, a + L.jaw); ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(198,233,255,.35)'; ctx.stroke();
        ctx.setLineDash([3, 6]); ctx.lineDashOffset = still ? 0 : -time * 9;
        ctx.lineWidth = 1.6; ctx.strokeStyle = L.field; ctx.stroke(); ctx.setLineDash([]);
        // The arc's two ends tick in toward the stone, so the wedge reads as a jaw.
        for (const e of [a - L.jaw, a + L.jaw]) { ctx.beginPath(); ctx.moveTo(x + Math.cos(e) * R, y + Math.sin(e) * R); ctx.lineTo(x + Math.cos(e) * (R - 6), y + Math.sin(e) * (R - 6)); ctx.stroke(); }
        if (still || quality > 0) continue;
        // Three chevrons slide from the arc toward the needle's tip, once every 1.2 s, fading in and out.
        const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
        ctx.strokeStyle = L.fieldPale; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
        for (const off of [-.75, 0, .75]) {
          const q = ((time / 1.2 + (off + 1) * .31) % 1 + 1) % 1, d = R - 4 - (R - r - 10) * q, e = a + off;
          const px = x + Math.cos(e) * d, py = y + Math.sin(e) * d, dir = Math.atan2(ty - py, tx - px);
          ctx.globalAlpha = m.alpha * .7 * Math.sin(q * Math.PI);
          ctx.save(); ctx.translate(px, py); ctx.rotate(dir);
          ctx.beginPath(); ctx.moveTo(-2.2, -3); ctx.lineTo(1.4, 0); ctx.lineTo(-2.2, 3); ctx.stroke(); ctx.restore();
        }
      }
    },
    bud(ctx, bud, time, still, state, kit, quality) {
      const L = LODE_ART, r = bud.r || 13, x = bud.x, y = bud.y, hp = clamp(bud.hp | 0, 1, 3), a = lodeNeedle(bud, Number(state.foeClock) || 0);
      const since = at => time - (Number.isFinite(at) ? at : -100);
      let face = 'calm', seed = null;
      if (!still) {
        seed = (state.balls || []).find(b => b && b.pullBy === bud.id && since(b.pullAt) >= 0 && since(b.pullAt) < L.pull) || null;
        if (since(bud.hitAt) >= 0 && since(bud.hitAt) < L.oof) face = 'oof';
        else if (seed) face = 'pull';
        else if (since(bud.guardAt) >= 0 && since(bud.guardAt) < L.smug) face = 'smug';
      }
      const breathe = still ? 1 : 1 + Math.sin(time * 2.2 + x * .05) * .015;
      stampLode(ctx, kit, lodeBody(r, hp), x, y, 0, breathe, 1 / breathe);
      stampLode(ctx, kit, lodeFace(r, face), x, y);
      if (face === 'calm' || face === 'pull') {
        // The pupils glance toward the needle (straight up with Animations off), or stare at the seed being tugged.
        const g = seed ? Math.atan2(seed.y - y, seed.x - x) : still ? -Math.PI / 2 : a, px = Math.cos(g) * r * .06, py = Math.sin(g) * r * .07;
        for (const s of [-1, 1]) {
          kit.circle(ctx, x + s * r * .3 + px, y - r * .04 + py, r * .1, L.eye);
          kit.circle(ctx, x + s * r * .3 + px - r * .035, y - r * .04 + py - r * .04, r * .035 + .2, '#ffffff');
        }
      }
      // The needle's glow, then the needle on the rim.
      const nx = x + Math.cos(a) * (r - .5), ny = y + Math.sin(a) * (r - .5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= still ? .55 : .45 + .2 * Math.sin(time * 4 + x * .03);
      stampLode(ctx, kit, LODE_GLOW, x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3)); ctx.restore();
      stampLode(ctx, kit, LODE_NEEDLE, nx, ny, a);
    },
    over(ctx, state, time, still, kit, quality) {
      const L = LODE_ART, clock = Number(state.foeClock) || 0;
      for (const bud of state.buds || []) {
        if (bud.foe !== 'lodestone') continue;
        const r = bud.r || 13;
        if (!bud.bloomed) {
          // A dotted tether from the needle's tip to the seed it is tugging.
          if (still || quality > 1 || bud.hidden) continue;
          const a = lodeNeedle(bud, clock), tx = bud.x + Math.cos(a) * (r + 7), ty = bud.y + Math.sin(a) * (r + 7);
          for (const b of state.balls || []) {
            const age = time - (Number.isFinite(b && b.pullAt) ? b.pullAt : -100);
            if (!b || b.pullBy !== bud.id || age < 0 || age >= L.pull) continue;
            ctx.globalAlpha = .8 * (1 - age / L.pull);
            dotted(ctx, [[tx, ty], [b.x, b.y]], L.field, 1.5, 7, time * 40);
            ctx.globalAlpha = 1;
          }
          continue;
        }
        // Opening: the iron clacks apart in two halves that tip out and drop; the last moss puffs fly up.
        const age = time - (Number.isFinite(bud.bloomAt) ? bud.bloomAt : -100);
        if (bud.popped || age < 0 || age >= L.open) continue;
        const q = age / L.open, out = still ? .4 : kit.ease(q);
        ctx.globalAlpha = still ? .7 * (1 - q) : 1 - q * q;
        for (const side of [-1, 1]) stampLode(ctx, kit, lodeHalf(r, side), bud.x + side * (2 + 14 * out), bud.y + (still ? 0 : 10 * q * q), still ? 0 : side * .7 * out);
        if (still || quality > 1) { ctx.globalAlpha = 1; continue; }
        for (let k = 0; k < 5; k++) {
          const e = -Math.PI / 2 + (k - 2) * .45, d = r + 22 * out;
          kit.circle(ctx, bud.x + Math.cos(e) * d, bud.y + Math.sin(e) * d + 30 * q * q, 2.4 * (1 - q * .5), k % 2 ? L.mossLight : L.moss, L.mossInk, .8);
        }
        ctx.globalAlpha = 1;
      }
    },
    // The aim guide ending on a stone: a leaf chip on the moss, a shield chip on the iron.
    aim(ctx, state, time, still, kit) {
      const aim = state.aim, target = aim && aim.target;
      if (!target || target.foe !== 'lodestone' || target.bloomed || !aim.normal) return;
      const r = target.r || 13, nx = aim.normal.x, ny = aim.normal.y, moss = ny <= -.25;
      const pop = still ? 1 : 1 + .08 * Math.sin(time * 8);
      stampLode(ctx, kit, lodeChip(moss), target.x + nx * (r + 9), target.y + ny * (r + 9), 0, pop);
    }
  });

  // ── Sweetheart Roses (Level 9, `sweetheart`) ──
  // Two shy coral rosebuds facing each other on a slack pink ribbon, a heart-shaped leaf tied at its lowest point. Each
  // bud is a cup of curled petals round a rolled heart, with two leafy sepals, a stub of stem and a little face on its
  // front petal: dot eyes glancing at its sweetheart, a smile and a rosy cheek. They lean in and back, never quite
  // touching. Touched, a rose blushes: it flushes hot pink in a soft glow and pops, squeezes its eyes into happy arcs and
  // hides behind a leaf, and the ribbon pulls taut; over its sweetheart a ring of hearts turns round a countdown arc that
  // empties in 1.2 s (blinking through its last .3 s), and that rose goes wide-eyed and bounces on its stem: me, now! A
  // kiss pops a big heart between them (an arrow through it for a Cupid shot) with little hearts flying out; a pout
  // puffs a grey "hmph" cloud and both turn their backs. The aim guide marks a shot that will land as a kiss with a
  // beating heart, the other rose of an idle pair with an open heart, and a rose already blushing with a grey ring.
  // Painted once into sprites; Animations off keeps the arc, the faces, the colours and the heart still.
  const SWH = { ink: '#9b1f55', face: '#6b2a4a', ribbon: '#ff9fc8', ribbonInk: '#b23a6e', blush: '#ff6f9e', blushInk: '#e0407a', leaf: '#83ac57',
    leafDark: '#527644', leafLight: '#b9d78c', cream: '#fff2f6', grey: '#d9d2dc', greyInk: '#9a91a3', cheek: '#ff7fa6', heart: '#ff5c93',
    gold: '#ffd148', goldInk: '#b8861f', window: 1.2 };
  const SWH_PAL = { rest: { dark: '#d32871', base: '#fa558b', light: '#ff94b0', tip: '#ffe1ce' }, blush: { dark: '#f47aaa', base: '#ffaac9', light: '#ffd3e3', tip: '#ffd0de' } };
  // The rule the game reads (foes.js blushLeft), or the same formula where the rules are not loaded (art tests).
  function swhLeft(state, bud, ahead = 0) {
    const rule = root.BloomFoes && root.BloomFoes.FOES && root.BloomFoes.FOES.sweetheart;
    if (rule && rule.blushLeft) return rule.blushLeft(state, bud, ahead);
    if (!bud || bud.bloomed || !(bud.blushUntil >= 0)) return 0;
    return Math.max(0, bud.blushUntil - (Number(state.foeClock) || 0) - Math.max(0, ahead - Math.max(0, state.lullaby || 0)));
  }
  const swhMate = (state, bud) => (state.buds || []).find(b => b.id === bud.mate) || null;
  const swhPhase = bud => ((String(bud.group || bud.id).length * 1.7 + (bud.baseX || bud.x || 0) * .031) % TAU);
  function swhStroke(c, width, color) { c.lineWidth = width; c.strokeStyle = color; c.stroke(); }
  function swhHeartPath(c, s) {
    c.beginPath(); c.moveTo(0, s * .95);
    c.bezierCurveTo(-s * 1.32, s * .02, -s * .98, -s * 1.08, 0, -s * .42);
    c.bezierCurveTo(s * .98, -s * 1.08, s * 1.32, s * .02, 0, s * .95); c.closePath();
  }
  // A pointed leaf from (x, y), len long at angle `turn`, with a midrib.
  function swhLeaf(c, x, y, len, wide, turn, fill, edge) {
    c.save(); c.translate(x, y); c.rotate(turn);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(len * .3, -wide, len * .75, -wide * .8, len, 0); c.bezierCurveTo(len * .75, wide * .8, len * .3, wide, 0, 0); c.closePath();
    c.fillStyle = fill; c.fill(); swhStroke(c, 1, edge);
    c.beginPath(); c.moveTo(len * .1, 0); c.quadraticCurveTo(len * .5, -wide * .12, len * .85, 0); swhStroke(c, .6, edge);
    c.restore();
  }
  // The rosebud, facing right (the right rose of a pair is mirrored, so the two face each other): a plump bud wound
  // round its rolled heart, the front petal's lip rising to the far side, a petal wrapping the near side up over it,
  // and three leafy sepals cupping it from below. Every piece is first stroked in white, so the whole bud keeps a soft
  // white rim like every other target on the board. A blushing bud is painted pale and glowing, with flustered lines.
  function paintSwhRose(c, r, blush) {
    const P = blush ? SWH_PAL.blush : SWH_PAL.rest;
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (blush) {
      const g = c.createRadialGradient(0, 0, r * .5, 0, 0, r * 1.75);
      g.addColorStop(0, 'rgba(255,170,205,.7)'); g.addColorStop(1, 'rgba(255,170,205,0)');
      c.beginPath(); c.arc(0, 0, r * 1.75, 0, TAU); c.fillStyle = g; c.fill();
    }
    const stem = () => { c.beginPath(); c.moveTo(0, r * .7); c.quadraticCurveTo(-r * .12, r * 1.05, -r * .04, r * 1.32); };
    const body = () => {
      c.beginPath(); c.moveTo(0, r * .9);
      c.bezierCurveTo(-r * .62, r * .9, -r * .98, r * .42, -r * .92, -r * .2);
      c.bezierCurveTo(-r * .86, -r * .72, -r * .42, -r * 1.04, r * .12, -r * 1.04);
      c.bezierCurveTo(r * .62, -r * 1.02, r * .98, -r * .64, r * .95, -r * .14);
      c.bezierCurveTo(r * .92, r * .44, r * .56, r * .9, 0, r * .9); c.closePath();
    };
    const front = () => {
      c.beginPath(); c.moveTo(-r * .93, -r * .36);
      c.bezierCurveTo(-r * 1.0, r * .4, -r * .52, r * .93, r * .02, r * .92);
      c.bezierCurveTo(r * .5, r * .9, r * .78, r * .62, r * .74, r * .1);
      c.bezierCurveTo(r * .42, -r * .04, r * .02, -r * .18, -r * .38, -r * .34);
      c.quadraticCurveTo(-r * .7, -r * .46, -r * .93, -r * .36); c.closePath();
    };
    const wrap = () => {
      c.beginPath(); c.moveTo(r * .3, r * .86);
      c.bezierCurveTo(r * .78, r * .66, r * 1.06, r * .2, r * .96, -r * .5);
      c.quadraticCurveTo(r * .8, -r * .66, r * .62, -r * .6);
      c.bezierCurveTo(r * .78, -r * .2, r * .8, r * .34, r * .3, r * .86); c.closePath();
    };
    const sepals = [[-r * .22, r * .76, r * .82, r * .27, 2.72], [r * .22, r * .78, r * .8, r * .26, .4], [-r * .02, r * .86, r * .5, r * .2, 1.95]];
    const sepal = ([x, y, len, wide, turn], fill) => {
      c.save(); c.translate(x, y); c.rotate(turn);
      c.beginPath(); c.moveTo(0, -wide * .4); c.bezierCurveTo(len * .35, -wide * 1.1, len * .8, -wide * .7, len, -wide * .9);
      c.bezierCurveTo(len * .8, -wide * .1, len * .4, wide * .9, 0, wide * .5); c.closePath();
      if (fill) { c.fillStyle = SWH.leaf; c.fill(); swhStroke(c, 1, SWH.leafDark); c.beginPath(); c.moveTo(len * .1, 0); c.quadraticCurveTo(len * .5, -wide * .25, len * .82, -wide * .7); swhStroke(c, .6, SWH.leafDark); }
      else swhStroke(c, 3.2, '#ffffff');
      c.restore();
    };
    // The white rim first, then the bud on top of it.
    c.save(); c.globalAlpha = .92;
    stem(); swhStroke(c, 5, '#ffffff'); body(); swhStroke(c, 3.4, '#ffffff'); wrap(); swhStroke(c, 3.4, '#ffffff');
    for (const s of sepals) sepal(s, false);
    c.restore();
    stem(); swhStroke(c, 3, SWH.leafDark); stem(); swhStroke(c, 1.5, SWH.leaf);
    // The bud: deeper toward its wound top, as a rose is.
    const shade = c.createLinearGradient(0, -r, 0, r * .3); shade.addColorStop(0, P.dark); shade.addColorStop(1, P.base);
    body(); c.fillStyle = shade; c.fill(); swhStroke(c, 1.3, SWH.ink);
    // The heart wound tight at the top: two petal edges spiralling into a curl.
    c.beginPath(); c.moveTo(-r * .66, -r * .52); c.bezierCurveTo(-r * .5, -r * .92, r * .4, -r * .98, r * .56, -r * .56); swhStroke(c, 1, SWH.ink);
    c.beginPath(); c.moveTo(-r * .4, -r * .5); c.bezierCurveTo(-r * .3, -r * .78, r * .24, -r * .82, r * .28, -r * .56);
    c.quadraticCurveTo(r * .26, -r * .38, r * .04, -r * .42); c.quadraticCurveTo(-r * .1, -r * .5, r * .02, -r * .6); swhStroke(c, .95, SWH.ink);
    c.beginPath(); c.moveTo(-r * .5, -r * .66); c.quadraticCurveTo(-r * .2, -r * .88, r * .2, -r * .8); swhStroke(c, 1.1, P.light);
    front(); c.fillStyle = P.light; c.fill(); swhStroke(c, 1.3, SWH.ink);
    // Its lip rolls back in a pale band, and a soft shine sits on the far shoulder.
    c.beginPath(); c.moveTo(-r * .84, -r * .34); c.quadraticCurveTo(-r * .6, -r * .4, -r * .38, -r * .3); c.bezierCurveTo(-r * .02, -r * .14, r * .38, -r * .02, r * .66, r * .1);
    swhStroke(c, 1.25, P.tip);
    c.beginPath(); c.ellipse(-r * .6, r * .2, r * .12, r * .28, .3, 0, TAU); c.fillStyle = 'rgba(255,255,255,.45)'; c.fill();
    wrap(); c.fillStyle = P.base; c.fill(); swhStroke(c, 1.2, SWH.ink);
    c.beginPath(); c.moveTo(r * .84, -r * .42); c.quadraticCurveTo(r * .94, 0, r * .66, r * .52); swhStroke(c, 1, P.light);
    for (const s of sepals) sepal(s, true);
    // A glint where the light comes from (the upper left, like every flower here).
    c.beginPath(); c.ellipse(-r * .5, -r * .66, r * .17, r * .08, -.75, 0, TAU); c.fillStyle = 'rgba(255,255,255,.8)'; c.fill();
    if (blush) {
      // Flustered: three little strokes fly off the side it faces.
      for (const a of [-1.45, -1.05, -.65]) {
        const x0 = r * .32 + Math.cos(a) * r * 1.12, y0 = -r * .1 + Math.sin(a) * r * 1.12, x1 = r * .32 + Math.cos(a) * r * 1.42, y1 = -r * .1 + Math.sin(a) * r * 1.42;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); swhStroke(c, 2.6, '#ffffff'); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); swhStroke(c, 1.3, SWH.blushInk);
      }
    }
  }
  // Faces, painted facing right (the way the rose looks), centred on the front petal. look: shy, eager, blush, pout.
  function paintSwhFace(c, r, look) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const E = [[-r * .1, r * .26, .9], [r * .34, r * .23, 1]];
    const cheek = (x, y, k, a = .85) => { c.save(); c.globalAlpha = a; c.beginPath(); c.ellipse(x, y, r * .13 * k, r * .085 * k, 0, 0, TAU); c.fillStyle = SWH.cheek; c.fill(); c.restore(); };
    if (look === 'blush') {
      // Squeezed shut with delight, three blush lines a cheek, and a heart-shaped leaf held up over the mouth.
      cheek(-r * .3, r * .44, 1.15, .95); cheek(r * .56, r * .4, 1.3, .95);
      for (const [x, y, k] of E) { c.beginPath(); c.moveTo(x - r * .11 * k, y + r * .04); c.quadraticCurveTo(x, y - r * .12 * k, x + r * .11 * k, y + r * .04); swhStroke(c, 1.3, SWH.face); }
      for (const [x, y] of [[-r * .32, r * .43], [r * .56, r * .39]]) for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x + i * r * .09 - r * .03, y + r * .05); c.lineTo(x + i * r * .09 + r * .03, y - r * .05); swhStroke(c, .8, SWH.blushInk); }
      c.save(); c.translate(r * .16, r * .66); c.rotate(-.28);
      c.beginPath(); c.moveTo(-r * .02, r * .3); c.quadraticCurveTo(-r * .2, r * .5, -r * .32, r * .62); swhStroke(c, 1.3, SWH.leafDark);
      swhHeartPath(c, r * .3); c.fillStyle = SWH.leaf; c.fill(); swhStroke(c, 1, SWH.leafDark);
      c.beginPath(); c.moveTo(0, r * .26); c.lineTo(0, -r * .1); swhStroke(c, .7, SWH.leafDark);
      c.beginPath(); c.ellipse(-r * .12, -r * .08, r * .08, r * .05, -.6, 0, TAU); c.fillStyle = SWH.leafLight; c.fill();
      c.restore();
      return;
    }
    if (look === 'pout') {
      // Looking away under flat lids, one cheek puffed round, a small turned-down "hmph".
      for (const [x, y, k] of E) {
        c.beginPath(); c.arc(x - r * .04, y + r * .02, r * .095 * k, 0, TAU); c.fillStyle = SWH.face; c.fill();
        c.beginPath(); c.moveTo(x - r * .14 * k, y - r * .03); c.lineTo(x + r * .12 * k, y - r * .05); swhStroke(c, 1.2, SWH.face);
      }
      cheek(-r * .3, r * .46, 1, .7);
      c.beginPath(); c.arc(r * .5, r * .5, r * .17, 0, TAU); c.fillStyle = 'rgba(255,127,166,.55)'; c.fill();
      c.beginPath(); c.arc(r * .5, r * .5, r * .17, -1.2, 1.4); swhStroke(c, .8, SWH.blushInk);
      c.beginPath(); c.arc(r * .1, r * .6, r * .09, Math.PI * 1.15, Math.PI * 1.85); swhStroke(c, 1.2, SWH.face);
      return;
    }
    cheek(-r * .3, r * .44, .85, .7); cheek(r * .54, r * .42, 1, .85);
    if (look === 'eager') {
      // Wide awake and shining: big eyes on the sweetheart, two catch-lights each, and an open "oh!".
      for (const [x, y, k] of E) {
        c.beginPath(); c.ellipse(x, y, r * .13 * k, r * .16 * k, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); swhStroke(c, 1, SWH.face);
        c.beginPath(); c.arc(x + r * .03, y + r * .02, r * .09 * k, 0, TAU); c.fillStyle = SWH.face; c.fill();
        c.beginPath(); c.arc(x + r * .06, y - r * .03, r * .035, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
        c.beginPath(); c.arc(x, y + r * .06, r * .018, 0, TAU); c.fill();
      }
      c.beginPath(); c.ellipse(r * .14, r * .52, r * .07, r * .085, 0, 0, TAU); c.fillStyle = SWH.face; c.fill();
      c.beginPath(); c.ellipse(r * .14, r * .57, r * .045, r * .03, 0, 0, TAU); c.fillStyle = SWH.cheek; c.fill();
      return;
    }
    // Shy: dot eyes glancing at the sweetheart, a tiny smile.
    for (const [x, y, k] of E) {
      c.beginPath(); c.ellipse(x + r * .02, y, r * .085 * k, r * .11 * k, 0, 0, TAU); c.fillStyle = SWH.face; c.fill();
      c.beginPath(); c.arc(x + r * .05, y - r * .04, r * .035, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    }
    c.beginPath(); c.arc(r * .14, r * .43, r * .1, .25 * Math.PI, .8 * Math.PI); swhStroke(c, 1.1, SWH.face);
  }
  // The ribbon's knot: a heart-shaped leaf on a little pink bow with two tails.
  function paintSwhKnot(c) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * 1, 2); c.quadraticCurveTo(side * 3.5, 6, side * 3, 9); swhStroke(c, 2.8, SWH.ribbonInk); c.beginPath(); c.moveTo(side * 1, 2); c.quadraticCurveTo(side * 3.5, 6, side * 3, 9); swhStroke(c, 1.5, SWH.ribbon); }
    c.save(); c.translate(0, -1.5); swhHeartPath(c, 4.6);
    swhStroke(c, 2.6, '#ffffff'); c.fillStyle = SWH.leaf; c.fill(); swhStroke(c, 1, SWH.leafDark);
    c.beginPath(); c.moveTo(0, 3.5); c.lineTo(0, -1.2); swhStroke(c, .6, SWH.leafDark);
    c.beginPath(); c.ellipse(-1.8, -1.6, 1.1, .7, -.6, 0, TAU); c.fillStyle = SWH.leafLight; c.fill();
    c.restore();
    c.beginPath(); c.arc(0, 2.4, 1.6, 0, TAU); c.fillStyle = SWH.ribbon; c.fill(); swhStroke(c, .9, SWH.ribbonInk);
  }
  function paintSwhHeart(c, s, fill, rim = '#ffffff') {
    c.lineJoin = 'round';
    swhHeartPath(c, s); swhStroke(c, Math.max(1.4, s * .4), rim); c.fillStyle = fill; c.fill(); swhStroke(c, .7, SWH.ink);
    c.beginPath(); c.ellipse(-s * .42, -s * .38, s * .24, s * .14, -.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill();
  }
  function paintSwhBig(c) {
    c.lineJoin = 'round';
    swhHeartPath(c, 9.5); swhStroke(c, 3.2, '#ffffff'); c.fillStyle = SWH.heart; c.fill(); swhStroke(c, 1.2, SWH.ink);
    c.save(); c.translate(0, .6); swhHeartPath(c, 5.6); c.fillStyle = SWH.cream; c.fill(); c.restore();
    c.save(); c.translate(0, 1); swhHeartPath(c, 2.6); c.fillStyle = '#ffb0c9'; c.fill(); c.restore();
    c.beginPath(); c.ellipse(-4.6, -4.4, 2.2, 1.2, -.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.9)'; c.fill();
  }
  // Cupid's arrow: a gold shaft and head with coral fletching, 26 px long, pointing right.
  function paintSwhArrow(c) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-12, 0); c.lineTo(9, 0); swhStroke(c, 3.6, '#ffffff'); swhStroke(c, 2, SWH.goldInk); c.beginPath(); c.moveTo(-12, 0); c.lineTo(9, 0); swhStroke(c, .9, SWH.gold);
    c.beginPath(); c.moveTo(13, 0); c.lineTo(7, -3.6); c.lineTo(8.4, 0); c.lineTo(7, 3.6); c.closePath(); swhStroke(c, 2.2, '#ffffff'); c.fillStyle = SWH.gold; c.fill(); swhStroke(c, .9, SWH.goldInk);
    for (const side of [-1, 1]) for (const x of [-12.5, -9.5]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x - 2.4, side * 3.6); c.lineTo(x + 1.6, side * 3.4); c.lineTo(x + 2.6, 0); c.closePath(); c.fillStyle = SWH.heart; c.fill(); swhStroke(c, .7, SWH.ink); }
  }
  // The pout's "hmph": a two-lobed grey cloud with a puff line.
  function paintSwhPuff(c) {
    c.lineJoin = 'round';
    const cloud = () => { c.beginPath(); c.arc(-2.4, .6, 3.3, Math.PI * .5, Math.PI * 1.6); c.arc(1.6, -.6, 3.9, Math.PI * 1.15, Math.PI * .35); c.lineTo(-2.4, 3.9); c.closePath(); };
    cloud(); swhStroke(c, 2.4, '#ffffff'); c.fillStyle = SWH.grey; c.fill(); swhStroke(c, .9, SWH.greyInk);
    c.beginPath(); c.arc(-1, -.4, 1.6, Math.PI * 1.1, Math.PI * 1.7); swhStroke(c, .8, '#ffffff');
  }
  const SWH_SPRITE = {
    rose: (r, blush) => [`foe:sweet:rose:${r}${blush ? ':blush' : ''}`, [-r * 1.8, -r * 1.8, r * 1.8, r * 1.55], c => paintSwhRose(c, r, blush)],
    face: (r, look) => [`foe:sweet:face-${look}:${r}`, [-r * .6, -r * .1, r * .85, r * 1.0], c => paintSwhFace(c, r, look)],
    knot: () => ['foe:sweet:knot', [-6.5, -8, 6.5, 11], paintSwhKnot],
    heart: () => ['foe:sweet:heart-6', [-5, -5, 5, 5], c => paintSwhHeart(c, 3.4, SWH.heart)],
    big: () => ['foe:sweet:heart-big', [-14, -12.5, 14, 12.5], paintSwhBig],
    arrow: () => ['foe:sweet:arrow', [-16, -5.5, 15, 5.5], paintSwhArrow],
    puff: () => ['foe:sweet:puff', [-7.5, -6.5, 7.5, 6.5], paintSwhPuff]
  };
  const swhStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  // Where each pair's ribbon runs: from the stem of the left rose to the stem of the right, sagging `sag` px.
  function swhRibbon(a, b, sa, sb, sag) {
    const r = a.r || 11, ax = a.x + sa.dx + r * .5, ay = a.y + sa.dy + r * .78, bx = b.x + sb.dx - r * .5, by = b.y + sb.dy + r * .78;
    return { ax, ay, bx, by, cx: (ax + bx) / 2, cy: (ay + by) / 2 + 2 * sag, kx: (ax + bx) / 2, ky: (ay + by) / 2 + sag };
  }
  BloomFoeLook('sweetheart', {
    warm(kit, r = 11) {
      const jobs = [SWH_SPRITE.rose(r, false), SWH_SPRITE.rose(r, true), ...['shy', 'eager', 'blush', 'pout'].map(v => SWH_SPRITE.face(r, v)),
        SWH_SPRITE.knot(), SWH_SPRITE.heart(), SWH_SPRITE.big(), SWH_SPRITE.arrow(), SWH_SPRITE.puff()];
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    // The ribbon between each pair, taut and pink while one of them blushes.
    under(ctx, state, time, still, kit, quality) {
      const clock = Number(state.foeClock) || 0;
      ctx.lineCap = 'round';
      for (const a of state.buds || []) {
        if (a.foe !== 'sweetheart' || a.side !== 0 || a.bloomed || a.hidden || a.visible === false) continue;
        const b = swhMate(state, a); if (!b || b.bloomed || b.hidden || b.visible === false) continue;
        const sa = kit.budShift(a, time, still), sb = kit.budShift(b, time, still), taut = swhLeft(state, a) > 0 || swhLeft(state, b) > 0;
        const sag = taut ? 3 : 8 + (still || quality >= 2 ? 0 : 2 * Math.sin(1.6 * clock + swhPhase(a))), R = swhRibbon(a, b, sa, sb, sag);
        ctx.save(); ctx.globalAlpha *= Math.min(sa.alpha, sb.alpha);
        for (const [width, color] of [[4.2, '#ffffff'], [2.6, SWH.ribbonInk], [1.4, taut ? SWH.blush : SWH.ribbon]]) {
          ctx.beginPath(); ctx.moveTo(R.ax, R.ay); ctx.quadraticCurveTo(R.cx, R.cy, R.bx, R.by); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
        }
        swhStamp(ctx, kit, SWH_SPRITE.knot(), R.kx, R.ky, still ? 0 : .12 * Math.sin(1.6 * clock + swhPhase(a) - .6));
        ctx.restore();
      }
    },
    bud(ctx, bud, time, still, state, kit) {
      const r = bud.r || 11, clock = Number(state.foeClock) || 0, mate = swhMate(state, bud), face = bud.side ? -1 : 1;
      const blush = swhLeft(state, bud) > 0, eager = !blush && mate && !mate.bloomed && swhLeft(state, mate) > 0;
      const since = t => clock - (Number.isFinite(t) ? t : -100), pout = since(bud.poutAt) >= 0 && since(bud.poutAt) < .5 || mate && since(mate.poutAt) >= 0 && since(mate.poutAt) < .5;
      // They lean in and back toward each other (an eager rose leans right in and bounces); a blush pops and fidgets.
      const ph = swhPhase(bud);
      let turn = still ? 0 : face * .06 * Math.sin(1.2 * clock + ph + bud.side * 1.3), size = 1, hop = 0;
      if (blush) {
        const k = since(bud.blushAt);
        size = still ? 1.04 : k < .12 ? 1 + .08 * kit.easeBack(clamp(k / .12, 0, 1)) : 1.04 + .04 * (1 - kit.smooth((k - .12) / .25));
        if (!still) turn = -face * (.08 + .05 * Math.sin(k * 16) * Math.max(0, 1 - k / .6));
      } else if (eager) { turn = face * (still ? .1 : .1 + .04 * Math.sin(clock * 9)); hop = still ? 0 : -1.6 * Math.abs(Math.sin(clock * 7)); }
      const look = blush ? 'blush' : pout ? 'pout' : eager ? 'eager' : 'shy', sx = (pout && !blush ? -face : face) * size;
      ctx.translate(bud.x, bud.y + hop); if (turn) ctx.rotate(turn);
      swhStamp(ctx, kit, SWH_SPRITE.rose(r, blush), 0, 0, 0, sx, size);
      swhStamp(ctx, kit, SWH_SPRITE.face(r, look), 0, 0, 0, sx, size);
    },
    // The tell over a blushing rose's sweetheart, the kiss and the pout.
    over(ctx, state, time, still, kit, quality) {
      const clock = Number(state.foeClock) || 0, ring = [6, 4, 1][clamp(quality | 0, 0, 2)];
      for (const a of state.buds || []) {
        if (a.foe !== 'sweetheart' || a.hidden || a.visible === false) continue;
        const r = a.r || 11, b = swhMate(state, a);
        // Tell: hearts turning round the sweetheart of a blushing rose, round an arc that empties as the blush runs out.
        const left = swhLeft(state, a);
        if (left > 0 && b && !b.bloomed && !b.hidden) {
          const sb = kit.budShift(b, time, still), x = b.x + sb.dx, y = b.y + sb.dy, k = clamp(left / SWH.window, 0, 1);
          const spin = still ? 0 : clock * 2, blink = !still && left < .3 && Math.floor(clock * 20) % 2 === 1;
          for (let i = 0; i < ring; i++) {
            const t = spin + i * TAU / ring - Math.PI / 2, hx = x + Math.cos(t) * (r + 9), hy = y + Math.sin(t) * (r + 9);
            swhStamp(ctx, kit, SWH_SPRITE.heart(), hx, hy, still ? 0 : .25 * Math.sin(clock * 6 + i), 1);
          }
          if (!blink) {
            ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.lineWidth = 3.6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.lineWidth = 2.2; ctx.strokeStyle = SWH.blush; ctx.stroke();
          }
        }
        // Pout: a grey "hmph" puffs up off the rose and fades.
        const pt = clock - (Number.isFinite(a.poutAt) ? a.poutAt : -100);
        if (pt >= 0 && pt < .5 && !a.bloomed) {
          const k = pt / .5, side = a.side ? 1 : -1;
          ctx.save(); ctx.globalAlpha *= 1 - k * k;
          swhStamp(ctx, kit, SWH_SPRITE.puff(), a.x + side * (r * .9 + (still ? 3 : 6 * k)), a.y - r - (still ? 4 : 10 * k), 0, still ? 1 : .8 + .4 * k);
          ctx.restore();
        }
        // Kiss: once per pair, from the rose whose touch made it (it carries the kiss); a bloomed rose keeps its x, y.
        const kt = clock - (Number.isFinite(a.kissAt) ? a.kissAt : -100);
        if (a.kiss && a.bloomed && kt >= 0 && kt < .6 && b) {
          const k = kt / .6, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 6;
          const fly = [8, 5, 0][clamp(quality | 0, 0, 2)];
          if (!still) for (let i = 0; i < fly; i++) {
            const t = i * TAU / fly - Math.PI / 2 + .3, d = 10 + 34 * kit.ease(k);
            ctx.save(); ctx.globalAlpha *= 1 - k; swhStamp(ctx, kit, SWH_SPRITE.heart(), mx + Math.cos(t) * d, my + Math.sin(t) * d - 8 * k, Math.sin(t) * .4, .8 + .3 * (1 - k)); ctx.restore();
          }
          ctx.save(); ctx.globalAlpha *= still ? .8 : 1 - k * k;
          const pop = still ? 1 : .3 + .9 * kit.easeBack(clamp(k / .35, 0, 1)) - .1 * clamp((k - .35) / .65, 0, 1);
          swhStamp(ctx, kit, SWH_SPRITE.big(), mx, my, 0, pop);
          if (a.kiss.cupid) { const slide = still ? 0 : 20 * kit.ease(k) - 10; swhStamp(ctx, kit, SWH_SPRITE.arrow(), mx + slide * Math.cos(-.35), my + slide * Math.sin(-.35), -.35, pop); }
          ctx.restore();
        }
      }
    },
    // On the aim guide: a beating heart where the seed lands as a kiss, an open heart on the other rose of an idle pair,
    // and a grey ring where a seed would only bounce off a rose that is already blushing.
    aim(ctx, state, time, still, kit) {
      const aim = state.aim, target = aim && aim.target;
      if (!target || target.foe !== 'sweetheart' || target.bloomed || !Array.isArray(aim) || aim.length < 2) return;
      const mate = swhMate(state, target); if (!mate || mate.bloomed) return;
      let length = 0; for (let i = 1; i < aim.length; i++) length += Math.hypot(aim[i].x - aim[i - 1].x, aim[i].y - aim[i - 1].y);
      const ahead = length / Math.max(1, Number(state.speed) || 1), end = aim[aim.length - 1], r = target.r || 11;
      const dash = (x0, y0, x1, y1, color, pattern) => {
        ctx.save(); ctx.setLineDash(pattern); ctx.lineCap = 'round';
        for (const [w, col] of [[3.4, '#ffffff'], [1.6, color]]) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }
        ctx.restore();
      };
      if (swhLeft(state, mate, ahead) > 0) {
        const beat = still ? 2 : 2 + .35 * Math.pow(Math.max(0, Math.sin(time * 8)), 4);
        dash(target.x, target.y, mate.x, mate.y, SWH.blush, [3, 4]);
        swhStamp(ctx, kit, SWH_SPRITE.heart(), end.x, end.y - 1, 0, beat);
      } else if (swhLeft(state, target) <= 0) {
        dash(target.x, target.y, mate.x, mate.y, SWH.ribbon, [2, 5]);
        ctx.save(); ctx.translate(mate.x, mate.y - r - 7); ctx.lineJoin = 'round'; swhHeartPath(ctx, 3.6);
        ctx.lineWidth = 3.2; ctx.strokeStyle = '#ffffff'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = SWH.blushInk; ctx.stroke(); ctx.restore();
      } else {
        ctx.save(); ctx.setLineDash([2, 3]);
        for (const [w, col] of [[3.2, '#ffffff'], [1.5, SWH.greyInk]]) { ctx.beginPath(); ctx.arc(target.x, target.y, r + 5, 0, TAU); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }
        ctx.restore();
      }
    }
  });

  // ── Wishing Stars (Level 10, `wishstar`) ──
  // Four chubby gold stars with rounded tips, a dark-gold edge, a blush and a big upright number (hand-drawn strokes, so a
  // cached sprite never keeps a fallback font). The star whose turn it is twinkles: brighter, a little bigger, a pale halo
  // and a glint circling it. A faint dotted route joins the four in order; each star rung in turn leaves a pale node on the
  // turning figure, joined to the one before by a solid gold line, and a dotted pointer crawls on to the next star, so the
  // figure reads as a little constellation being drawn (a broken chord's lines go grey). A star turned away shakes "not
  // yet". All four rung, the finished figure flashes and a shooting star streaks along the wish's hops. With Animations
  // off: no pulse, glint, shake, crawl or streak; the numbers, halo, size, lines and nodes all stay (the figure still turns).
  const WISH_ART = { R: 30, spin: .8, gold: '#ffd65a', bright: '#ffe680', shade: '#f2b43c', ink: '#8a5a14', numeral: '#6b3f0c',
    halo: '#fff4aa', node: '#fffbe0', line: '#ffd65a', broken: '#c9c1b3', pulse: 1.6, cheek: '#ff9f8f', glow: '255,244,170', hop: .08 };
  // A chubby five-point star (outer radius R, inner R * inner) centred on (x, y), its tips rounded off by `round` of an edge.
  function wishStarPath(c, R, inner = .52, x = 0, y = 0, round = .3) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const at = k => { const a = -Math.PI / 2 + ((k + 10) % 10) * Math.PI / 5, d = k % 2 ? R * inner : R; return [x + Math.cos(a) * d, y + Math.sin(a) * d]; };
      const [vx, vy] = at(i), [px, py] = at(i - 1), [nx, ny] = at(i + 1), k = i % 2 ? round * .5 : round;
      if (i) c.lineTo(vx + (px - vx) * k, vy + (py - vy) * k); else c.moveTo(vx + (px - vx) * k, vy + (py - vy) * k);
      c.quadraticCurveTo(vx, vy, vx + (nx - vx) * k, vy + (ny - vy) * k);
    }
    c.closePath();
  }
  // A four-point glint (as art.js sparkle), for the sprites, which are painted without the toolbox.
  function wishGlint(c, x, y, s, color) {
    c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x + s * .16, y - s * .13, x + s, y); c.quadraticCurveTo(x + s * .15, y + s * .14, x, y + s);
    c.quadraticCurveTo(x - s * .16, y + s * .14, x - s, y); c.quadraticCurveTo(x - s * .14, y - s * .15, x, y - s); c.fillStyle = color; c.fill();
  }
  // The numbers 1-5 as strokes in a unit box (a rounded bold sans), and a number h px tall drawn with them: a white
  // edge under it when `edge` is given.
  const WISH_DIGITS = {
    1: c => { c.moveTo(-.22, -.27); c.lineTo(.04, -.5); c.lineTo(.04, .5); },
    2: c => { c.moveTo(-.27, -.26); c.bezierCurveTo(-.24, -.56, .3, -.58, .28, -.24); c.bezierCurveTo(.26, -.02, .02, .12, -.28, .5); c.lineTo(.3, .5); },
    3: c => {
      c.moveTo(-.26, -.38); c.bezierCurveTo(-.12, -.56, .3, -.54, .27, -.26); c.bezierCurveTo(.25, -.08, .1, -.03, -.05, -.03);
      c.bezierCurveTo(.22, -.03, .33, .1, .31, .25); c.bezierCurveTo(.28, .54, -.15, .56, -.29, .36);
    },
    4: c => { c.moveTo(.13, .5); c.lineTo(.13, -.5); c.lineTo(-.31, .19); c.lineTo(.33, .19); },
    5: c => { c.moveTo(.27, -.5); c.lineTo(-.17, -.5); c.lineTo(-.22, -.05); c.bezierCurveTo(.02, -.18, .34, -.12, .32, .17); c.bezierCurveTo(.3, .52, -.13, .56, -.29, .36); }
  };
  function wishDigit(c, n, x, y, h, color, width, edge = null, edgeWidth = 0) {
    const path = WISH_DIGITS[n];
    if (!path) return;
    c.save(); c.translate(x, y); c.scale(h, h); c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); path(c);
    if (edge) { c.strokeStyle = edge; c.lineWidth = edgeWidth / h; c.stroke(); }
    c.strokeStyle = color; c.lineWidth = width / h; c.stroke();
    c.restore();
  }
  // A storybook gold star: a soft violet shadow, the shaded body, its lit face (the star again, nudged up-left, clipped),
  // a shine across the upper arms, the dark edge and a glint on the top arm. The Starseed's lent stars wear it too.
  function wishBody(c, R, fill = WISH_ART.gold, shade = WISH_ART.shade, ink = WISH_ART.ink, shine = 'rgba(255,255,240,.6)') {
    c.lineJoin = 'round'; c.lineCap = 'round';
    wishStarPath(c, R, .52, R * .03, R * .1); c.fillStyle = 'rgba(44,26,86,.3)'; c.fill();
    wishStarPath(c, R, .52); c.fillStyle = shade; c.fill();
    c.save(); c.clip();
    wishStarPath(c, R * .97, .52, -R * .07, -R * .1); c.fillStyle = fill; c.fill();
    c.beginPath(); c.ellipse(-R * .3, -R * .33, R * .34, R * .13, -.72, 0, TAU); c.fillStyle = shine; c.fill();
    c.restore();
    wishStarPath(c, R, .52); c.strokeStyle = ink; c.lineWidth = 1.4; c.stroke();
    wishGlint(c, -R * .1, -R * .6, R * .17, '#ffffff');
  }
  // A Wishing Star's sprite: the star and its number; the next one is brighter, with a pale halo ring.
  function paintWishStar(c, r, pip, next) {
    const A = WISH_ART, R = r + 2;
    if (next) { c.globalAlpha = .55; c.beginPath(); c.arc(0, 0, r + 6, 0, TAU); c.strokeStyle = A.halo; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1; }
    wishBody(c, R, next ? A.bright : A.gold);
    c.save(); wishStarPath(c, R, .52); c.clip(); c.globalAlpha = .45;
    for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * R * .47, R * .12, R * .12, R * .075, 0, 0, TAU); c.fillStyle = A.cheek; c.fill(); }
    c.restore();
    wishDigit(c, pip, 0, R * .06, R * .86, A.numeral, 2.3, '#ffffff', 4.6);
  }
  // The next star's warm light, laid on with 'lighter' under it so it glows on the night sky.
  function paintWishGlow(c, r) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r + 9);
    g.addColorStop(0, `rgba(${WISH_ART.glow},.9)`); g.addColorStop(.45, `rgba(${WISH_ART.glow},.35)`); g.addColorStop(1, `rgba(${WISH_ART.glow},0)`);
    c.beginPath(); c.arc(0, 0, r + 9, 0, TAU); c.fillStyle = g; c.fill();
  }
  // A rung star's place on the turning figure: a small pale star.
  function paintWishNode(c) { wishStarPath(c, 5, .5, 0, 0, .25); c.fillStyle = WISH_ART.node; c.fill(); c.strokeStyle = WISH_ART.shade; c.lineWidth = 1; c.stroke(); }
  const wishSprite = (r, pip, next) => [`wishstar:star:${r}:${pip}:${next ? 'next' : 'wait'}`, next ? [-r - 8, -r - 8, r + 8, r + 8] : [-r - 4, -r - 4, r + 4, r + 4],
    c => paintWishStar(c, r, pip, next)];
  const WISH_NODE = ['wishstar:node', [-6, -6, 6, 6], paintWishNode];
  const wishGlow = r => [`wishstar:glow:${r}`, [-r - 9, -r - 9, r + 9, r + 9], c => paintWishGlow(c, r)];
  const wishStamp = (ctx, kit, [key, box, paint], x, y, sx = 1) => stamp(ctx, kit, key, box, paint, x, y, 0, sx);
  // Where a star of its figure sits at foe time `clock` (the closed form of foes.js wishAt), for the stars already bloomed.
  function wishSpot(bud, clock, wy) {
    const a = bud.a0 + bud.dir * WISH_ART.spin * (clock - (bud.born || 0)) + bud.slot * TAU / 4;
    return { x: bud.wx + WISH_ART.R * Math.cos(a), y: wy + WISH_ART.R * Math.sin(a) };
  }
  // The stars by figure (bud.wish), each list in number order.
  function wishFigures(state) {
    const figs = new Map();
    for (const b of state.buds || []) if (b.foe === 'wishstar' && b.wish != null) { const list = figs.get(b.wish); if (list) list.push(b); else figs.set(b.wish, [b]); }
    for (const list of figs.values()) list.sort((a, b) => a.pip - b.pip);
    return figs;
  }
  // The number whose turn it is in a star's figure (the lowest still open).
  function wishNextOf(state, bud) {
    let n = 0;
    for (const o of state.buds || []) if (o.foe === 'wishstar' && o.wish === bud.wish && !o.bloomed && (!n || o.pip < n)) n = o.pip;
    return n;
  }
  // Dots that crawl from a line's start to its end (dotted() moves them back toward the start as its phase grows).
  const wishCrawl = (time, speed, gap) => gap - (time * speed) % gap;
  BloomFoeLook('wishstar', {
    warm(kit, r) {
      for (const pip of [1, 2, 3, 4]) for (const next of [false, true]) { const [key, box, paint] = wishSprite(r, pip, next); kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint); }
      for (const [key, box, paint] of [WISH_NODE, wishGlow(r)]) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    // art.js calls this once for every Wishing Star on the board, so it draws every figure that still has an open star.
    under(ctx, state, time, still, kit, quality) {
      const A = WISH_ART, clock = Number(state.foeClock) || 0;
      for (const stars of wishFigures(state).values()) {
        const open = stars.filter(b => !b.bloomed);
        if (!open.length) continue;
        const lead = open[0], wy = Number(lead.wy) || 0, m = kit.budShift(lead, time, still), at = [];
        for (const b of stars) { const p = b.bloomed ? wishSpot(b, clock, wy) : b; at[b.pip] = { x: p.x + m.dx, y: p.y + m.dy, b }; }
        ctx.save(); ctx.globalAlpha *= m.alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        // 1. The faint route, 1 to 4.
        if (quality <= 1) {
          const route = [1, 2, 3, 4].filter(k => at[k]).map(k => [at[k].x, at[k].y]);
          ctx.save(); ctx.globalAlpha *= .35; dotted(ctx, route, A.halo, 1.4, 6); ctx.restore();
        }
        // 2. Lines between neighbours already bloomed: gold over white while the chord holds, thin grey once it is broken.
        const broken = stars.some(b => b.bloomed && !b.rang);
        ctx.beginPath();
        for (let k = 1; k < 4; k++) if (at[k] && at[k + 1] && at[k].b.bloomed && at[k + 1].b.bloomed) { ctx.moveTo(at[k].x, at[k].y); ctx.lineTo(at[k + 1].x, at[k + 1].y); }
        if (broken) { ctx.strokeStyle = A.broken; ctx.lineWidth = 1.5; ctx.stroke(); }
        else { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = A.line; ctx.lineWidth = 2; ctx.stroke(); }
        // 3. A node where each bloomed star's place is (paler for a star bloomed out of the chord).
        let last = null;
        for (const p of at) if (p && p.b.bloomed) {
          if (p.b.pip < lead.pip && (!last || p.b.pip > last.b.pip)) last = p;
          ctx.save(); if (!p.b.rang) ctx.globalAlpha *= .5; wishStamp(ctx, kit, WISH_NODE, p.x, p.y); ctx.restore();
        }
        // 4. The pointer: dots crawling from the last bloomed place on to the star whose turn it is.
        const to = at[lead.pip];
        if (last && to) {
          const dx = to.x - last.x, dy = to.y - last.y, d = Math.hypot(dx, dy), r = (lead.r || 10) + 6;
          if (d > r + 8) {
            const ux = dx / d, uy = dy / d;
            dotted(ctx, [[last.x + ux * 6, last.y + uy * 6], [to.x - ux * r, to.y - uy * r]], broken ? A.broken : A.line, 1.5, 6, still ? 0 : wishCrawl(time, 14, 6));
          }
        }
        ctx.restore();
      }
    },
    bud(ctx, bud, time, still, state, kit, quality) {
      const A = WISH_ART, r = Number(bud.r) || 10, next = wishNextOf(state, bud) === bud.pip;
      let x = bud.x, s = next ? 1 : .94;
      if (next && !still) s += .07 * Math.sin(TAU * A.pulse * time);
      // "Not yet": a star turned away shakes for a quarter second (FOE_FX.wishstar.guard sets nopeAt; the rules never read it).
      const nope = time - (Number.isFinite(bud.nopeAt) ? bud.nopeAt : -100);
      if (!still && nope >= 0 && nope < .25) x += 2 * Math.sin(time * 60) * (1 - nope / .25);
      if (next) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= still ? .6 : .5 + .15 * Math.sin(TAU * A.pulse * time); wishStamp(ctx, kit, wishGlow(r), x, bud.y, s); ctx.restore(); }
      else ctx.globalAlpha *= .9;
      wishStamp(ctx, kit, wishSprite(r, bud.pip, next), x, bud.y, s);
      if (next && !still && quality <= 1) { const a = time * 2; kit.sparkle(ctx, x + Math.cos(a) * (r + 4), bud.y + Math.sin(a) * (r + 4), 2.5, '#ffffff', a); }
    },
    over(ctx, state, time, still, kit, quality) {
      const A = WISH_ART;
      for (const stars of wishFigures(state).values()) {
        // A wish: the finished figure flashes gold where it closed and fades (.9 s). A star stops where it blooms (its x, y
        // and wy freeze), so the last one's own place gives the figure's turn as it closed.
        if (stars.length < 4 || stars.some(b => !b.bloomed || !b.rang)) continue;
        const at0 = b => Number.isFinite(b.bloomAt) ? b.bloomAt : -100, last = stars.reduce((m, b) => at0(b) > at0(m) ? b : m), age = time - at0(last);
        if (age < 0 || age >= .9) continue;
        const turn = Math.atan2(last.y - last.wy, last.x - last.wx), k = 1 - age / .9;
        const at = stars.map(b => { const a = turn + (b.slot - last.slot) * TAU / 4; return { x: last.wx + A.R * Math.cos(a), y: last.wy + A.R * Math.sin(a) }; });
        ctx.save(); ctx.globalAlpha *= k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); at.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = A.bright; ctx.lineWidth = 3; ctx.stroke();
        for (const p of at) wishStamp(ctx, kit, WISH_NODE, p.x, p.y, still ? 1.3 : 1 + .6 * kit.easeBack(clamp(age / .3, 0, 1)));
        ctx.restore();
      }
      // The shooting star: from the fourth star along the wish's hops (FOE_FX.wishstar.wish stamps bud.wishPath, art only),
      // one hop every .08 s as the links fly, its tail shorter as the quality drops; with Animations off, a still dotted trail.
      for (const b of state.buds || []) {
        if (b.foe !== 'wishstar' || !Array.isArray(b.wishPath) || !b.wishPath.length) continue;
        const pts = [b, ...b.wishPath], n = pts.length - 1, age = time - (Number.isFinite(b.wishAt) ? b.wishAt : -100), end = n * A.hop;
        if (age < 0 || age >= end + .3) continue;
        if (still) { ctx.save(); ctx.globalAlpha *= .7; dotted(ctx, pts.map(p => [p.x, p.y]), A.bright, 1.5, 7); ctx.restore(); continue; }
        const along = u => { u = clamp(u, 0, n); const i = Math.min(n - 1, Math.floor(u)), f = u - i; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f }; };
        const u = age / A.hop, tail = quality >= 2 ? 0 : quality >= 1 ? 2 : 4;
        ctx.save(); ctx.globalAlpha *= age > end ? 1 - (age - end) / .3 : 1;
        for (let k = tail; k >= 1; k--) { const p = along(u - k * .22); kit.circle(ctx, p.x, p.y, 4.2 - k * .7, `rgba(${A.glow},${.75 - k * .14})`); }
        const head = along(u);
        kit.circle(ctx, head.x, head.y, 5, `rgba(${A.glow},.8)`); kit.sparkle(ctx, head.x, head.y, 6.5, '#ffffff', time * 6);
        ctx.restore();
      }
    }
  });

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
    const dx = p.to.x - p.from.x, dy = p.to.y - p.from.y, len = p.len || Math.hypot(dx, dy) || 1, u = clamp((clock - p.born) * 60 / len, 0, 1), w = -(p.side || 1) * 30 * Math.sin(4 * Math.PI * u);
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
    z: h => [`kit:sunny:z:${h}`, [-h * .39 - 2.4, -h * .5 - 2.4, h * .39 + 2.4, h * .5 + 2.4], c => paintSunZ(c, h)],
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
      const since = p.closed ? clock - p.closedAt : time - p.bloomAt;
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
        const peek = bud.spitAt == null && age < 1.6 ? clamp((age - .5) / 1.1, 0, 1) : 0;
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
        const p = clamp((time - w.at) / (w.until - w.at), 0, 1), open = .25 + .4 * p, reach = 24 * open;
        // The move's label (art.js drawBossWarning) is drawn before this hook, so a tell over it fades to keep it readable.
        ctx.save(); ctx.font = '600 12px Fredoka';
        const lw = Math.min(310, Math.max(130, ctx.measureText(String(w.text || 'A guardian is stirring')).width + 28));
        ctx.restore();
        const lx = clamp(w.x, lw / 2 + 10, 410 - lw / 2), ly = clamp(w.y + 61, 45, 395);
        for (const t of w.targets || []) {
          const spot = w.move === 'sprouts' ? t.role === 'sprout' && { x: t.x, y: t.y - SUN_UP } : t.role === 'portal' && t;
          if (!spot || !sunRoom(state, spot.x, spot.y, 16)) continue;
          const onLabel = Math.abs(spot.x - lx) < lw / 2 + reach && Math.abs(spot.y - ly) < 13 + reach;
          drawSunPortal(ctx, kit, spot.x, spot.y, 16, open, 0, 0, time, still, (onLabel ? .35 : 1) * (.55 + .35 * p));
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
        // A snapped-shut portal runs on the game clock, as the step's removal does (a Lullaby freezes only the kit clock).
        const shut = !p.closed, since = shut ? time - p.bloomAt : clock - p.closedAt, span = shut ? .16 : .25;
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
      // Toss tells: a dotted arc from the hole to the landing mark, marching that way. The move's label (art.js
      // drawBossWarning) is drawn before this hook, so an arc running through it fades to keep the words readable.
      const tells = rkTossTell(s);
      if (tells.length) {
        ctx.save(); ctx.font = '600 12px Fredoka';
        const lw = Math.min(310, Math.max(130, ctx.measureText(String(w.text || 'A guardian is stirring')).width + 28));
        ctx.restore();
        const lx = clamp(w.x, lw / 2 + 10, 410 - lw / 2);
        for (const t of tells) {
          const pts = []; for (let i = 0; i <= 16; i++) { const p = lobAt(t.fromX, row, t.x, t.y, .6, .6 * i / 16, 48); pts.push([p.x, p.y]); }
          ctx.save(); ctx.globalAlpha *= Math.abs(t.x - lx) < lw / 2 + 4 ? .35 : 1;
          dotted(ctx, pts, RK.rim, 1.9, 7, still ? 0 : -time * 16);
          ctx.restore();
        }
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
        const age = time - k.snappedAt; if (age < 0 || age > .5) continue; // on game time, like the riders' blooms
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
          // Centred where she will be as the tell ends: the first partner always opens at a0 = 0, R px to her right.
          const first = (w.targets || []).find(t => t.role === 'waltz'), fx = first ? first.x - MOREL_ART.R : b.x, fy = first ? first.y : b.y;
          morelFloor(ctx, fx, fy, .5, still ? 0 : -time * MOREL_ART.R * MOREL_ART.spin, true, still ? 0 : time * MOREL_ART.spin);
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
  // A moonlit showpiece. Her face shows her mood (s.tier): Dreamy has heavy lashed lids and a soft smile, Glowing big
  // starry eyes, rosy cheeks and an open laugh, Moonlit silver eyes under set brows with a gold crescent on her brow and
  // a sly smile; a hit squeezes her eyes, and with her lantern spent (the gutter) she is flustered, with a bead of sweat.
  // An aura of her mood's color breathes behind her: fireflies circle her when Glowing; when Moonlit a little crescent
  // moon rocks over her head between twinkling stars. The moon gate is a smiling moon in the sky that pours a beam
  // down her column (it brightens while she is under it: that is the moment to shoot) and its reflection on the lake,
  // upside down, wobbling 2 px at 1 Hz with ripples spreading; both pop in with an overshoot, flash when a seed passes
  // and wane over their last .4 s. The lily pads glow on the water, each with a lilac bud that swells before it lets a
  // jelly go and opens as it does, and two pips for the jellies still to come; a shut pad folds up with a splash, an
  // unshot one sinks in a ripple. Her lantern hops off its stem in an arc and rides the glowworm's head, swinging, while
  // its empty stem curls behind her; when the head is hit, a streak of gold light runs home, and when the worm puffs away
  // the lantern drifts home in mint sparkles. The tide is a pale blue band from the old line up to the raised one, its
  // foamy top lapping, after a dashed line and rising chevrons show where it will reach. Animations off: no wobble,
  // ripples, bob, sway, blink, twinkle or flight; the moons, beam, pads and pips, the riding lantern and every tell stay.
  const LILY = { moon: '#fff6ce', rim: '#e8d58a', crater: '#f3e4ad', craterLight: '#fffbe3', moonInk: '#c9a95a', moonCheek: '#ffc9a8',
    pad: '#6fbf73', padDark: '#3f8a52', padLight: '#a6dc8f', padVein: '#4f9e5e', bud: '#cbbfff', budLight: '#efe9ff', budInk: '#8f7fd6',
    tide: 'rgba(120,190,255,.18)', foam: '#e8f6ff', tideLine: '#7fc4ff', tideInk: '#3d78b8', ripple: '#d6ecff', ink: '#66416f',
    skin: '#ffe9c6', eye: '#5e918d', glowEye: '#3fa39b', silver: '#7f8fd8', cheek: '#f4a8c8', gold: '#ffe58a', goldInk: '#c99a3a',
    sweat: '#9fdcff', firefly: '#fff4aa', auras: ['255,186,224', '255,224,130', '196,218,255'], moods: ['dreamy', 'glowing', 'moonlit'],
    release: [.9, 2.1], close: 2.6, moonPop: .3, wane: .4, fly: .35, home: .6 };
  // Her face, in units of her radius, around the face's own centre (as art.js places a guardian's face).
  function lilyEye(c, r, side, kind) {
    const x = side * r * .26, L = LILY; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = L.ink;
    if (kind === 'blink') { c.beginPath(); c.moveTo(x - r * .13, 0); c.quadraticCurveTo(x, r * .09, x + r * .13, 0); c.lineWidth = 1.7; c.stroke(); return; }
    if (kind === 'squeeze') {
      c.beginPath(); c.moveTo(x + side * r * .13, -r * .09); c.lineTo(x - side * r * .1, r * .01); c.lineTo(x + side * r * .13, r * .09); c.lineWidth = 1.9; c.stroke(); return;
    }
    const rx = r * (kind === 'dreamy' ? .12 : .13), ry = r * (kind === 'glowing' ? .16 : kind === 'wide' ? .17 : kind === 'moonlit' ? .12 : .13);
    c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    const iris = kind === 'glowing' ? L.glowEye : kind === 'moonlit' ? L.silver : L.eye, ir = r * (kind === 'glowing' ? .095 : kind === 'wide' ? .05 : .078);
    c.beginPath(); c.arc(x - side * r * .01, r * (kind === 'dreamy' ? .04 : .02), ir, 0, TAU); c.fillStyle = iris; c.fill();
    c.beginPath(); c.arc(x - side * r * .01, r * (kind === 'dreamy' ? .04 : .02), ir * .45, 0, TAU); c.fillStyle = '#26404a'; c.fill();
    c.beginPath(); c.arc(x - side * r * .045, -r * .03, r * (kind === 'glowing' ? .038 : .028), 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    if (kind === 'glowing') { c.beginPath(); c.arc(x + side * r * .03, r * .07, r * .018, 0, TAU); c.fill(); }
    if (kind === 'dreamy' || kind === 'moonlit') {
      // A heavy lid: level and soft when dreamy, slanting down to the nose when moonlit.
      const inner = kind === 'moonlit' ? r * .01 : -r * .015, outer = kind === 'moonlit' ? -r * .07 : -r * .02;
      c.save(); c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.clip();
      c.beginPath(); c.moveTo(x - side * rx * 1.3, inner); c.lineTo(x + side * rx * 1.3, outer); c.lineTo(x + side * rx * 1.3, -ry * 1.3); c.lineTo(x - side * rx * 1.3, -ry * 1.3); c.closePath();
      c.fillStyle = kind === 'moonlit' ? '#e9d8f0' : L.skin; c.fill(); c.restore();
      c.beginPath(); c.moveTo(x - side * rx * 1.15, inner); c.lineTo(x + side * rx * 1.15, outer); c.lineWidth = 1.6; c.stroke();
      if (kind === 'dreamy') for (const k of [.55, 1]) { c.beginPath(); c.moveTo(x + side * rx * k, outer + (inner - outer) * (1 - k) * .5); c.lineTo(x + side * rx * (k + .35), outer - r * .07); c.lineWidth = 1.1; c.stroke(); }
    }
    c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.lineWidth = 1.2; c.stroke();
  }
  function lilyMouth(c, r, kind) {
    const L = LILY; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = L.ink;
    if (kind === 'soft') { c.beginPath(); c.arc(0, r * .24, r * .1, .4, Math.PI - .4); c.lineWidth = 1.5; c.stroke(); }
    else if (kind === 'laugh') {
      c.beginPath(); c.moveTo(-r * .17, r * .25); c.quadraticCurveTo(0, r * .29, r * .17, r * .25); c.quadraticCurveTo(r * .13, r * .47, 0, r * .47); c.quadraticCurveTo(-r * .13, r * .47, -r * .17, r * .25); c.closePath();
      c.fillStyle = '#8a3f5e'; c.fill(); c.save(); c.clip(); c.beginPath(); c.ellipse(0, r * .46, r * .1, r * .08, 0, 0, TAU); c.fillStyle = '#ff9fb8'; c.fill(); c.restore();
      c.lineWidth = 1.3; c.stroke();
    } else if (kind === 'smirk') { c.beginPath(); c.moveTo(-r * .13, r * .29); c.quadraticCurveTo(r * .02, r * .35, r * .15, r * .23); c.lineWidth = 1.6; c.stroke(); c.beginPath(); c.moveTo(r * .13, r * .21); c.lineTo(r * .17, r * .26); c.lineWidth = 1.1; c.stroke(); }
    else if (kind === 'ouch') { c.beginPath(); c.ellipse(0, r * .3, r * .07, r * .055, 0, 0, TAU); c.fillStyle = '#8a3f5e'; c.fill(); c.lineWidth = 1.2; c.stroke(); }
    else if (kind === 'wobble') { c.beginPath(); c.moveTo(-r * .15, r * .3); for (let i = 1; i <= 6; i++) c.lineTo(-r * .15 + i * r * .05, r * .3 + (i % 2 ? -1 : 1) * r * .035); c.lineWidth = 1.5; c.stroke(); }
  }
  // variant: dreamy, glowing, moonlit (each with -blink), hurt, flustered.
  function paintLilyFace(c, r, variant) {
    const L = LILY, blink = variant.endsWith('-blink'), base = blink ? variant.slice(0, -6) : variant;
    const mood = base === 'hurt' || base === 'flustered' ? 'dreamy' : base;
    for (const side of [-1, 1]) {
      c.beginPath(); c.ellipse(side * r * .44, r * .19, r * .11, r * .06, side * -.25, 0, TAU); c.fillStyle = L.cheek;
      c.globalAlpha = base === 'glowing' ? .9 : base === 'flustered' ? .95 : .6; c.fill(); c.globalAlpha = 1;
      // Brows: soft and high (dreamy), raised (glowing), set low toward the nose (moonlit), tilted up in worry (flustered).
      const B = { dreamy: [[.13, -.24], [.26, -.31], [.4, -.25]], glowing: [[.12, -.29], [.26, -.39], [.41, -.3]], moonlit: [[.1, -.17], [.25, -.24], [.42, -.27]],
        flustered: [[.1, -.3], [.24, -.3], [.4, -.22]], hurt: [[.1, -.17], [.25, -.24], [.42, -.27]] }[base];
      c.beginPath(); c.moveTo(side * r * B[0][0], r * B[0][1]); c.quadraticCurveTo(side * r * B[1][0], r * B[1][1], side * r * B[2][0], r * B[2][1]);
      c.strokeStyle = L.ink; c.lineWidth = base === 'moonlit' ? 2.2 : 1.5; c.lineCap = 'round'; c.stroke();
    }
    const eye = blink ? 'blink' : base === 'hurt' ? 'squeeze' : base === 'flustered' ? 'wide' : mood;
    for (const side of [-1, 1]) lilyEye(c, r, side, eye);
    lilyMouth(c, r, { dreamy: 'soft', glowing: 'laugh', moonlit: 'smirk', hurt: 'ouch', flustered: 'wobble' }[base]);
    if (base === 'moonlit') {
      // The gold crescent on her brow.
      c.save(); c.translate(0, -r * .44); c.beginPath(); c.arc(0, 0, r * .1, .5, TAU - .5); c.arc(r * .05, -r * .02, r * .08, TAU - .9, .9, true); c.closePath();
      c.fillStyle = L.gold; c.fill(); c.strokeStyle = L.goldInk; c.lineWidth = 1; c.stroke(); c.restore();
    }
    if (base === 'flustered') {
      c.beginPath(); c.moveTo(r * .5, -r * .3); c.quadraticCurveTo(r * .57, -r * .19, r * .54, -r * .14); c.arc(r * .5, -r * .15, r * .045, 0, Math.PI); c.closePath();
      c.fillStyle = L.sweat; c.fill(); c.strokeStyle = '#3f8fd2'; c.lineWidth = .8; c.stroke();
    }
  }
  // Her mood's aura: a soft ring of color painted once and breathed live.
  function paintLilyAura(c, r, tier) {
    const rgb = LILY.auras[tier], g = c.createRadialGradient(0, 0, r * .7, 0, 0, r * 2.1);
    g.addColorStop(0, `rgba(${rgb},.5)`); g.addColorStop(.45, `rgba(${rgb},.22)`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.beginPath(); c.arc(0, 0, r * 2.1, 0, TAU); c.fillStyle = g; c.fill();
  }
  // The moon: a smiling cream disc with craters at its edge, a rim and a shine.
  function paintLilyMoon(c, r) {
    const L = LILY;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = '#f6e6ab'; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.arc(-r * .1, -r * .12, r * .9, 0, TAU); c.fillStyle = L.moon; c.fill();
    for (const [x, y, k] of [[-.62, -.42, .17], [.6, .44, .15], [.63, -.3, .09], [-.56, .5, .1], [.05, -.72, .08]]) {
      c.beginPath(); c.arc(x * r, y * r, k * r, 0, TAU); c.fillStyle = L.crater; c.fill();
      c.beginPath(); c.arc((x - k * .25) * r, (y - k * .25) * r, k * r * .62, 0, TAU); c.fillStyle = L.craterLight; c.fill();
    }
    c.restore();
    c.lineCap = 'round'; c.strokeStyle = L.moonInk; c.lineWidth = 1.3;
    for (const side of [-1, 1]) { c.beginPath(); c.arc(side * r * .27, -r * .06, r * .12, .25, Math.PI - .25); c.stroke(); }
    c.beginPath(); c.arc(0, r * .16, r * .14, .4, Math.PI - .4); c.stroke();
    for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * r * .42, r * .14, r * .1, r * .055, 0, 0, TAU); c.fillStyle = L.moonCheek; c.globalAlpha = .6; c.fill(); c.globalAlpha = 1; }
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = L.rim; c.lineWidth = 1.8; c.stroke();
    c.beginPath(); c.arc(0, 0, r * .8, -2.55, -1.55); c.strokeStyle = '#ffffff'; c.lineWidth = 1.7; c.stroke();
  }
  function paintLilyGlow(c, r, rgb) {
    const g = c.createRadialGradient(0, 0, r * .3, 0, 0, r * 2.4);
    g.addColorStop(0, `rgba(${rgb},.8)`); g.addColorStop(.4, `rgba(${rgb},.35)`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.beginPath(); c.arc(0, 0, r * 2.4, 0, TAU); c.fillStyle = g; c.fill();
  }
  // The moonbeam: a soft cone of light from the high moon down her column, fading out below.
  function paintLilyBeam(c) {
    const g = c.createLinearGradient(0, 0, 0, 170);
    g.addColorStop(0, 'rgba(255,246,206,.55)'); g.addColorStop(.6, 'rgba(255,246,206,.18)'); g.addColorStop(1, 'rgba(255,246,206,0)');
    c.beginPath(); c.moveTo(-15, 0); c.lineTo(15, 0); c.lineTo(34, 170); c.lineTo(-34, 170); c.closePath(); c.fillStyle = g; c.fill();
  }
  // A lily pad: round with its notch at the top, veins, a lit rim and a soft shadow on the water.
  function paintLilyPad(c, r) {
    const L = LILY, notch = .34, pad = () => { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, -Math.PI / 2 + notch, -Math.PI / 2 - notch + TAU); c.closePath(); };
    c.beginPath(); c.ellipse(1.5, 2.6, r * 1.04, r * .98, 0, 0, TAU); c.fillStyle = 'rgba(10,40,48,.3)'; c.fill();
    pad(); c.fillStyle = L.pad; c.fill();
    c.save(); pad(); c.clip(); c.beginPath(); c.arc(-r * .18, -r * .2, r * .82, 0, TAU); c.fillStyle = L.padLight; c.globalAlpha = .45; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = L.padVein; c.lineWidth = 1; c.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + notch + .32 + i * (TAU - 2 * notch - .64) / 6; c.beginPath(); c.moveTo(Math.cos(a) * r * .18, Math.sin(a) * r * .18); c.lineTo(Math.cos(a) * r * .84, Math.sin(a) * r * .84); c.stroke(); }
    c.restore();
    pad(); c.strokeStyle = L.padDark; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
    c.beginPath(); c.arc(0, 0, r * .84, Math.PI * .92, Math.PI * 1.32); c.strokeStyle = '#dcf6c6'; c.lineWidth = 1.5; c.lineCap = 'round'; c.stroke();
  }
  // Its water-lily bud: closed (0), opening (1) and open (2), lilac with a gold heart.
  function paintLilyBud(c, k) {
    const L = LILY, petals = k ? 6 : 3, open = [0, .55, 1][k];
    c.lineJoin = 'round';
    for (let i = 0; i < petals; i++) {
      const a = -Math.PI / 2 + (i - (petals - 1) / 2) * (k ? TAU / petals : .5), len = 8.5 + open * 1.5, w = k ? 3.6 : 3.4;
      c.save(); c.rotate(k ? a + Math.PI / 2 : (i - 1) * .32 * (1 + open)); c.beginPath(); c.moveTo(0, 2); c.quadraticCurveTo(-w, -len * .45, 0, -len); c.quadraticCurveTo(w, -len * .45, 0, 2); c.closePath();
      c.fillStyle = i % 2 ? L.bud : L.budLight; c.fill(); c.strokeStyle = L.budInk; c.lineWidth = 1; c.stroke(); c.restore();
    }
    if (k) { c.beginPath(); c.arc(0, 0, 2.6 + open, 0, TAU); c.fillStyle = L.gold; c.fill(); c.strokeStyle = L.goldInk; c.lineWidth = .8; c.stroke(); }
  }
  // The little crescent moon over her head when Moonlit, with a sleepy smile.
  function paintLilyCrescent(c) {
    const L = LILY;
    c.beginPath(); c.arc(0, 0, 8, .6, TAU - .6); c.arc(4.2, -1.6, 6.6, TAU - 1.05, 1.05, true); c.closePath();
    c.fillStyle = L.moon; c.fill(); c.strokeStyle = L.rim; c.lineWidth = 1.4; c.lineJoin = 'round'; c.stroke();
    c.beginPath(); c.arc(-4.2, -.5, 1.4, .2, Math.PI - .2); c.strokeStyle = L.moonInk; c.lineWidth = 1; c.lineCap = 'round'; c.stroke();
  }
  const lilyFace = (r, v) => [`kit:lotus:face:${r}:${v}`, [-r * .8, -r * .72, r * .8, r * .62], c => paintLilyFace(c, r, v)];
  const LILY_SPRITES = {
    aura: (r, tier) => [`kit:lotus:aura:${r}:${tier}`, [-r * 2.2, -r * 2.2, r * 2.2, r * 2.2], c => paintLilyAura(c, r, tier)],
    moon: r => [`kit:lotus:moon:${r}`, [-r - 2, -r - 2, r + 2, r + 2], c => paintLilyMoon(c, r)],
    glow: (r, rgb) => [`kit:lotus:glow:${r}:${rgb}`, [-r * 2.5, -r * 2.5, r * 2.5, r * 2.5], c => paintLilyGlow(c, r, rgb)],
    beam: () => ['kit:lotus:beam', [-35, 0, 35, 171], paintLilyBeam],
    pad: r => [`kit:lotus:pad:${r}`, [-r - 2, -r - 2, r + 4, r + 5], c => paintLilyPad(c, r)],
    bud: k => [`kit:lotus:bud:${k}`, [-12, -12, 12, 12], c => paintLilyBud(c, k)],
    crescent: () => ['kit:lotus:crescent', [-10, -10, 10, 10], paintLilyCrescent],
    lantern: (kit, r) => [`kit:lotus:lantern:${r}`, [-r * 1.45 - 3, -r * 1.45 - 3, r * 1.45 + 3, r * 1.45 + 3], c => kit.paintTargetPart(c, 'lantern', 'lotus', r, true, true)]
  };
  const lilyStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  const LILY_FACES = ['dreamy', 'dreamy-blink', 'glowing', 'glowing-blink', 'moonlit', 'moonlit-blink', 'hurt', 'flustered'];
  const MOON_RGB = '255,246,206', PAD_RGB = '196,255,200', LAMP_RGB = '255,214,90', MINT_RGB = '185,255,240';
  const lilyArc = (a, b, u, h) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - 4 * h * u * (1 - u) });
  // One moon of the gate: the high one pours its beam; the low one is its reflection, upside down, wobbling in slices.
  function drawLilyMoon(ctx, kit, gate, state, s, time, still, quality) {
    const L = LILY, clock = Number(s.kitAge) || 0, r = Number(gate.r) || 18, low = Boolean(gate.moonLow);
    const born = clock - (Number(gate.kitAt) || 0), left = (Number(gate.kitUntil) || Infinity) - clock;
    let k = still ? 1 : born < L.moonPop ? kit.easeBack(clamp(born / L.moonPop, 0, 1)) : 1;
    if (left < L.wane) k *= clamp(left / L.wane, 0, 1);
    if (!(k > .01)) return;
    const used = (Number(state.time) || time) - (Number(gate.lastUsed) || -100), flash = used >= 0 && used < .35 ? 1 - used / .35 : 0;
    ctx.save(); ctx.translate(gate.x, gate.y);
    if (!low) {
      // The beam brightens while she is under it: the moment for a moon shot.
      const boss = s.boss, under = boss && !boss.bloomed ? clamp(1 - Math.abs(boss.x - gate.x) / 44, 0, 1) : 0;
      ctx.save(); ctx.globalAlpha *= clamp((.4 + .5 * under + .3 * flash) * k, 0, 1); lilyStamp(ctx, kit, LILY_SPRITES.beam(), 0, r * .5); ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= clamp((low ? .32 : .5) * k + .35 * flash + (still ? 0 : .07 * Math.sin(time * 2.2 + gate.x)), 0, 1);
    lilyStamp(ctx, kit, LILY_SPRITES.glow(r, MOON_RGB), 0, 0, 0, 1 + .15 * flash); ctx.restore();
    if (low) {
      // Four slices of the flipped moon, each swaying 2 px at 1 Hz a little after the one above it.
      for (let i = 0; i < 4; i++) {
        const y0 = -r - 2 + i * (r + 2) / 2, dx = still ? 0 : 2 * Math.sin(TAU * time + i * 1.1);
        ctx.save(); ctx.beginPath(); ctx.rect(-r - 6, y0, 2 * r + 12, (r + 2) / 2 + .6); ctx.clip();
        ctx.globalAlpha *= .9; lilyStamp(ctx, kit, LILY_SPRITES.moon(r), dx, 0, 0, k, -k * .9); ctx.restore();
      }
      // Glints of water across it, and rings spreading out on the lake.
      ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.3;
      for (const [y, w, ph] of [[-.38, .5, 0], [.06, .7, 1.7], [.48, .42, 3.1]]) {
        const dx = still ? 0 : 2 * Math.sin(TAU * time + ph);
        ctx.beginPath(); ctx.moveTo((-w * r + dx) * k, y * r * k); ctx.lineTo((w * r * .3 + dx) * k, y * r * k); ctx.stroke();
      }
      if (!still) for (let j = 0; j < (quality > 1 ? 1 : 2); j++) {
        const q = (time * .55 + j * .5) % 1, rr = (r + 4 + 16 * q) * k;
        ctx.save(); ctx.globalAlpha *= (1 - q) * .6; ctx.beginPath(); ctx.ellipse(0, r * .55, rr, rr * .32, 0, 0, TAU); ctx.strokeStyle = L.ripple; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
      }
    } else {
      lilyStamp(ctx, kit, LILY_SPRITES.moon(r), 0, 0, still ? 0 : Math.sin(time * .9) * .06, k * (1 + .08 * flash));
      if (!still && quality < 2) for (const [x, y, ph] of [[-r * 1.5, -r * .4, 0], [r * 1.45, r * .2, 2.1], [r * .9, -r * 1.05, 4.2]]) {
        const tw = Math.max(0, Math.sin(time * 2.6 + ph)); if (tw > .05) kit.sparkle(ctx, x, y, 3.4 * tw * k, '#fffbe6', .2);
      }
    }
    if (flash > 0) { ctx.globalAlpha *= flash; kit.circle(ctx, 0, 0, r + 3 + 12 * (1 - flash), null, '#ffffff', 2.4); }
    ctx.restore();
  }
  // The pad's bud: swelling in the last .35 s before each jelly, opening as one leaves (.15 s), then closing.
  function lilyBudState(p, clock) {
    let frame = 0, swell = 0;
    const last = p.releases && p.releases.length ? p.releases[p.releases.length - 1] : null, since = last == null ? Infinity : clock - last;
    if (since < .15) frame = since < .07 ? 1 : 2; else if (since < .45) frame = 2; else if (since < .6) frame = 1;
    for (const at of LILY.release) { const due = (Number(p.born) || 0) + at - clock; if (due > 0 && due < .35) swell = Math.max(swell, 1 - due / .35); }
    return { frame, swell, left: LILY.release.filter(at => (Number(p.born) || 0) + at > clock - 1e-9).length };
  }
  function drawLilyPad(ctx, kit, p, clock, time, still, scale = 1, alpha = 1, fold = 1) {
    const r = Number(p.r) || 16, side = p.x < 210 ? 1 : -1, bob = still ? 0 : Math.sin(time * 2.2 + p.x * .05);
    ctx.save(); ctx.translate(p.x, p.y + bob); ctx.globalAlpha *= alpha;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= (still ? .5 : .42 + .12 * Math.sin(time * 3 + p.x)) * scale; lilyStamp(ctx, kit, LILY_SPRITES.glow(r, PAD_RGB), 0, 0, 0, .8); ctx.restore();
    ctx.scale(scale * fold, scale);
    lilyStamp(ctx, kit, LILY_SPRITES.pad(r), 0, 0, side * .45);
    if (fold > .3) {
      const bud = lilyBudState(p, clock), grow = 1 + .28 * bud.swell + (still ? 0 : .04 * Math.sin(time * 5));
      if (bud.swell > 0 && !still) { ctx.save(); ctx.globalAlpha *= bud.swell * .8; kit.circle(ctx, 0, 0, 13 - 5 * bud.swell, null, LILY.bud, 1.6); ctx.restore(); }
      lilyStamp(ctx, kit, LILY_SPRITES.bud(bud.frame), 0, -1, 0, grow);
      // Pips for the jellies still to come, at the pad's lower rim.
      for (let i = 0; i < 2; i++) kit.circle(ctx, (i - .5) * 7, r * .62, 2.2, i < bud.left ? LILY.bud : 'rgba(60,110,80,.6)', LILY.budInk, .9);
    }
    ctx.restore();
  }
  // The tide: a pale band from the old line up to the raised one, its foamy top lapping.
  function drawLilyTide(ctx, state, time, still, quality) {
    const top = Number(state.dangerY) || 448; if (!(top < 447.5)) return;
    const wave = x => top + (still ? 0 : Math.sin(x * .055 + time * 2.4) * 1.6);
    ctx.save(); ctx.beginPath(); ctx.moveTo(22, 448);
    for (let x = 22; x <= 398; x += 12) ctx.lineTo(x, Math.min(447, wave(x)));
    ctx.lineTo(398, 448); ctx.closePath(); ctx.fillStyle = LILY.tide; ctx.fill();
    ctx.beginPath(); for (let x = 22; x <= 398; x += 12) { const y = Math.min(447, wave(x)); if (x === 22) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.strokeStyle = LILY.foam; ctx.globalAlpha *= .75; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    if (!still && quality === 0 && 448 - top > 8) for (let i = 0; i < 6; i++) {
      const q = (time * .5 + i * .37) % 1, x = 46 + i * 64 + Math.sin(time * 1.3 + i) * 6, y = 448 - (448 - top) * q;
      ctx.globalAlpha = .55 * (1 - q); ctx.beginPath(); ctx.arc(x, y, 1.6 + i % 2, 0, TAU); ctx.strokeStyle = LILY.foam; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  kitLook('lotus', {
    warm(kit) {
      const r = 26, jobs = [...LILY_FACES.map(v => lilyFace(r, v)), ...[0, 1, 2].map(t => LILY_SPRITES.aura(r, t)), LILY_SPRITES.moon(18), LILY_SPRITES.glow(18, MOON_RGB),
        LILY_SPRITES.beam(), LILY_SPRITES.pad(16), LILY_SPRITES.glow(16, PAD_RGB), ...[0, 1, 2].map(k => LILY_SPRITES.bud(k)), LILY_SPRITES.crescent(),
        LILY_SPRITES.lantern(kit, 9), LILY_SPRITES.glow(9, LAMP_RGB), LILY_SPRITES.glow(9, MINT_RGB)];
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    under(ctx, state, s, time, still, kit, quality) {
      const boss = s.boss, live = boss && !boss.bloomed;
      drawLilyTide(ctx, state, time, still, quality);
      for (const gate of state.gates || []) if (gate && gate.bossMoon && gate.kitDrawn) drawLilyMoon(ctx, kit, gate, state, s, time, still, quality);
      if (!live) return;
      // Her mood's aura, breathing.
      const r = Number(boss.r) || 26, tier = clamp(s.tier | 0, 0, 2);
      ctx.save(); ctx.globalAlpha *= still ? .8 : .7 + .2 * Math.sin(time * 1.7); lilyStamp(ctx, kit, LILY_SPRITES.aura(r, tier), boss.x, boss.y, 0, still ? 1 : 1 + .04 * Math.sin(time * 1.7)); ctx.restore();
      // With the lantern away on the worm, its stem curls empty behind her.
      const lantern = s.parts && s.parts.find(p => p.bossPart === 'lantern');
      if (lantern && lantern.hidden) {
        const sway = still ? 0 : Math.sin(time * 2.4) * 3, tipX = lantern.x - 4 + sway, tipY = lantern.y - lantern.r - 2;
        ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(boss.x + r * .55, boss.y + r * .35); ctx.quadraticCurveTo(tipX - 14, tipY - 26, tipX, tipY);
        ctx.arc(tipX + 3.5, tipY, 3.5, Math.PI, Math.PI * 2.2);
        ctx.strokeStyle = '#4a8064'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = '#bad99f'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    },
    part(ctx, state, s, bud, time, still, kit) {
      if (bud.bossPart !== 'pad') return false;
      const clock = Number(s.kitAge) || 0, age = clock - (Number(bud.born) || 0);
      drawLilyPad(ctx, kit, bud, clock, time, still, still ? 1 : age < .25 ? kit.easeBack(clamp(age / .25, 0, 1)) : 1);
      return true;
    },
    face(ctx, state, s, bud, time, still, kit) {
      if (!bud.boss) return false;
      const r = Number(bud.r) || 26, look = kit.BOSS_LOOKS.lotus || {}, health = (Number(bud.hp) || 0) / Math.max(1, Number(bud.maxHp) || 1);
      // The face turns with her body (art.js's gentle lotus sway, and the shiver when nearly beaten).
      let tilt = still ? 0 : Math.sin(time * 2) * .045;
      if (!still && health <= .2) tilt += Math.sin(time * TAU * 6) * .04;
      ctx.translate(bud.x, bud.y); if (tilt) ctx.rotate(tilt); ctx.translate(r * (look.faceX || 0), r * (look.faceY != null ? look.faceY : .08));
      const hurt = typeof bud.hitAt === 'number' && time - bud.hitAt >= 0 && time - bud.hitAt < .3, tier = clamp(s.tier | 0, 0, 2);
      const blink = !still && (time + r * .1) % 3.6 < .12, mood = LILY.moods[tier];
      const variant = hurt ? 'hurt' : s.mode === 'gutter' ? 'flustered' : mood + (blink ? '-blink' : '');
      lilyStamp(ctx, kit, lilyFace(r, variant), 0, 0);
      // Glowing: a twinkle in each eye.
      if (variant === 'glowing' && !still) for (const side of [-1, 1]) {
        const tw = .5 + .5 * Math.sin(time * 4 + side); kit.sparkle(ctx, side * r * .26 - side * r * .045, -r * .03, r * .05 * (.6 + .6 * tw), '#ffffff', .3);
      }
      return true;
    },
    over(ctx, state, s, time, still, kit, quality) {
      const L = LILY, clock = Number(s.kitAge) || 0, boss = s.boss, live = boss && !boss.bloomed, w = s.warning;
      const lantern = s.parts && s.parts.find(p => p.bossPart === 'lantern');
      // Tells, through each warning.
      if (live && w && w.until > w.at) {
        const p = clamp((time - w.at) / (w.until - w.at), 0, 1);
        if (w.move === 'reflect') {
          const [a, b] = [w.targets.find(t => t.role === 'moonIn'), w.targets.find(t => t.role === 'moonOut')];
          if (a && b) {
            ctx.save(); ctx.globalAlpha *= .35 + .3 * p; dotted(ctx, [[b.x, b.y + 22], [a.x, a.y - 22]], '#fff1b8', 1.6, 10, still ? 0 : time * 30); ctx.restore();
            for (const t of [a, b]) { ctx.save(); ctx.globalAlpha *= .3 + .45 * p; lilyStamp(ctx, kit, LILY_SPRITES.moon(18), t.x, t.y, 0, .35 + .55 * p, (t === a ? -1 : 1) * (.35 + .55 * p)); ctx.restore(); }
          }
        } else if (w.move === 'jellies') {
          for (const t of w.targets.filter(t => t.role === 'pad')) {
            ctx.save(); ctx.globalAlpha *= .3 + .45 * p; drawLilyPad(ctx, kit, { x: t.x, y: t.y, r: 16, born: Infinity, releases: [] }, clock, time, still, .45 + .5 * p); ctx.restore();
            if (!still) { const q = (time * 1.2) % 1; ctx.save(); ctx.globalAlpha *= (1 - q) * .7; ctx.beginPath(); ctx.ellipse(t.x, t.y + 6, 14 + 14 * q, (14 + 14 * q) * .35, 0, 0, TAU); ctx.strokeStyle = L.ripple; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore(); }
          }
        } else if (w.move === 'worm' && lantern && !lantern.hidden) {
          // The lantern stirs on its stem, and a dotted arc shows where it will land as the glowworm's head.
          const t = w.targets.find(t => t.role === 'worm');
          if (t) {
            const from = { x: lantern.x, y: lantern.y }, pts = []; for (let i = 0; i <= 14; i++) { const at = lilyArc(from, t, i / 14, 30); pts.push([at.x, at.y]); }
            ctx.save(); ctx.globalAlpha *= .5 + .4 * p; dotted(ctx, pts.slice(1, -1), L.gold, 1.6, 9, still ? 0 : -time * 22); ctx.restore();
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= .4 + .5 * p * (still ? 1 : .75 + .25 * Math.sin(time * 14)); lilyStamp(ctx, kit, LILY_SPRITES.glow(9, LAMP_RGB), lantern.x, lantern.y); ctx.restore();
          }
        } else if (w.move === 'tide') {
          // A dashed line where the tide will reach, chevrons climbing to it and the band filling in.
          const t = w.targets.find(t => t.role === 'tide');
          if (t) {
            ctx.save(); ctx.globalAlpha *= .1 + .25 * p; ctx.fillStyle = L.tide; ctx.fillRect(22, t.y, 376, 448 - t.y); ctx.restore();
            ctx.save(); ctx.setLineDash([9, 7]); ctx.lineDashOffset = still ? 0 : -time * 24;
            for (const [color, width] of [['#ffffff', 4], [L.tideLine, 2.2]]) { ctx.beginPath(); ctx.moveTo(26, t.y); ctx.lineTo(394, t.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
            ctx.restore();
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (const x of [70, 210, 350]) for (let j = 0; j < 2; j++) {
              const q = still ? .5 * j : (time * 1.4 + j * .5) % 1, y = 446 - (446 - t.y - 6) * q;
              ctx.save(); ctx.globalAlpha *= still ? .9 : Math.sin(Math.PI * q); ctx.beginPath(); ctx.moveTo(x - 7, y + 5); ctx.lineTo(x, y - 2); ctx.lineTo(x + 7, y + 5);
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = L.tideInk; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
            }
          }
        }
      }
      // Pads folding shut with a splash, or sinking away in a ripple.
      for (const p of s.pads || []) {
        if (!p.closed && !p.bloomed) continue;
        // A shut fold runs on the game clock, as the step's removal does (a Lullaby freezes only the kit clock).
        const shut = !p.closed, since = shut ? time - p.bloomAt : clock - p.closedAt, span = shut ? .3 : .5;
        if (!(since >= 0 && since < span)) continue;
        const k = since / span;
        if (shut) {
          drawLilyPad(ctx, kit, p, clock, time, still, 1 + .1 * k, 1 - k * k, Math.max(.02, 1 - kit.smooth(k)));
          ctx.save(); ctx.globalAlpha *= 1 - k; kit.circle(ctx, p.x, p.y, (p.r || 16) + 4 + 16 * k, null, '#c9f5d0', 2.2 * (1 - k) + .4); ctx.restore();
        } else {
          drawLilyPad(ctx, kit, p, clock, time, still, 1 - .45 * k, 1 - k);
          ctx.save(); ctx.globalAlpha *= (1 - k) * .7; ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 16 + 12 * k, (16 + 12 * k) * .35, 0, 0, TAU); ctx.strokeStyle = L.ripple; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
        }
      }
      // Her lantern riding the glowworm's head (after an arc off its stem), swinging as it crawls.
      const worm = s.worm, head = live && worm && !worm.done ? (state.buds || []).find(b => b.id === worm.head && !b.bloomed && !b.hidden) : null;
      if (head) {
        const hr = Number(head.r) || 11, seat = { x: head.x, y: head.y - hr - 9 + (still ? 0 : Math.sin(time * 4.2) * 1.4) }, t = clock - (Number(worm.at) || 0);
        const flying = !still && t >= 0 && t < L.fly && worm.from, at = flying ? lilyArc(worm.from, seat, kit.smooth(t / L.fly), 34) : seat;
        if (!flying) {
          ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(head.x - 3, head.y - hr * .7); ctx.quadraticCurveTo(head.x - 7, at.y + 2, at.x, at.y - 7);
          ctx.strokeStyle = '#4a8064'; ctx.lineWidth = 2.4; ctx.stroke(); ctx.strokeStyle = '#bad99f'; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= still ? .6 : .5 + .15 * Math.sin(time * 3.4); lilyStamp(ctx, kit, LILY_SPRITES.glow(9, LAMP_RGB), at.x, at.y); ctx.restore();
        lilyStamp(ctx, kit, LILY_SPRITES.lantern(kit, 9), at.x, at.y, flying ? (1 - t / L.fly) * -2.4 : still ? 0 : Math.sin(time * 3) * .16);
      }
      // The way home: a streak of gold light after a head hit, mint sparkles when the worm puffs away.
      const flight = s.flight;
      if (live && flight && lantern && !still) {
        const t = clock - flight.at, gold = flight.why === 'home', to = { x: lantern.x, y: lantern.y };
        if (t >= 0 && t < L.home) {
          const fade = 1 - t / L.home, pts = []; for (let i = 0; i <= 12; i++) { const at = lilyArc(flight.from, to, i / 12, 26); pts.push([at.x, at.y]); }
          ctx.save(); ctx.globalAlpha *= fade; dotted(ctx, pts, gold ? L.gold : '#b9fff0', 1.8, 8, -time * 40); ctx.restore();
          const u = clamp(t / .3, 0, 1), orb = lilyArc(flight.from, to, kit.smooth(u), 26);
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= fade; lilyStamp(ctx, kit, LILY_SPRITES.glow(9, gold ? LAMP_RGB : MINT_RGB), orb.x, orb.y, 0, .8); ctx.restore();
        }
      }
      if (!live) return;
      // Her mood's company: fireflies when Glowing, a rocking crescent moon and twinkles when Moonlit.
      const r = Number(boss.r) || 26;
      if (s.tier === 1) {
        const n = quality > 1 ? 3 : 5;
        for (let i = 0; i < n; i++) {
          const a = (still ? 0 : time * .9) + i * TAU / n, rad = r + 14 + 5 * Math.sin(i * 2.3 + (still ? 0 : time * 1.3));
          const x = boss.x + Math.cos(a) * rad, y = boss.y + Math.sin(a) * rad * .75, glow = still ? .8 : .35 + .65 * Math.abs(Math.sin(time * 2.7 + i * 1.9));
          ctx.save(); ctx.globalAlpha *= glow * .3; kit.circle(ctx, x, y, 4.2, L.firefly); ctx.globalAlpha = Math.min(1, glow + .1); kit.circle(ctx, x, y, 1.7, '#ffffff'); ctx.restore();
        }
      } else if (s.tier === 2) {
        const bob = still ? 0 : Math.sin(time * 1.6) * 2.5;
        lilyStamp(ctx, kit, LILY_SPRITES.crescent(), boss.x + r * .15, boss.y - r - 15 + bob, still ? -.2 : -.2 + Math.sin(time * 1.3) * .22);
        if (!still) for (const [dx, dy, ph] of [[-r * 1.15, -r * .7, 0], [r * 1.2, -r * .45, 2], [-r * .5, -r * 1.35, 4]]) {
          const tw = Math.max(0, Math.sin(time * 2.2 + ph)); if (tw > .05) kit.sparkle(ctx, boss.x + dx, boss.y + dy, 3.6 * tw, '#eef3ff', .3);
        }
      }
    }
  });


  // ── Ammonite Queen (Level 6, `fossil`) ──
  // A grand old ammonite, her face peeping from her shell's mouth behind her brass monocle, four little tentacles curling
  // under it. Her face shows her mood (s.tier): Regal is serene, half-lidded with lashes and a pleased small smile, in a
  // gold tiara set with her own five pearls (the middle one twinkles); Stony greys over with stern flat brows, stone
  // freckles and two hairline cracks creep over her shell and grit trickles from her rim; Brooding narrows her eyes, a
  // warm amber halo pulses behind her, and while her next egg is ready her tentacles cradle a little amber egg (a quiet
  // early tell that a hatch is coming). She puffs her cheeks to toss pearls, glares with stone-grey eyes to petrify,
  // coos with her eyes shut and a heart to lay her egg, squeezes her eyes when hit, and blinks now and then.
  // Pearl Volley: dotted lilac arcs to three marks, each a lilac ring with a little shell; the pearls spin along their
  // arcs with ghost trails, their landing shadows darkening as they near; a landed pearl twinkles in its turning shell.
  // Petrify: grey chips close in round each bud and a dotted ghost slab already shows the exact angle each slab will
  // take (bare-bed slabs add an arc of seabed dots); the slabs grow in with an overshoot, a bud asleep inside each, a
  // glint sliding along them, flash white when a seed banks off, and fade as they thaw. Hatch: an amber dotted arc and a
  // pulsing dotted egg at the mark; the egg tumbles along it with its shadow. In Brooding her lock ring spins faster,
  // with white motion arcs at its gap ends, and as each move lifts her, bubbles rise from under her. Animations off: no
  // twinkle, blink, sway, spin, trail, grit, bubbles or pulse; every tell stays as a still mark.
  const FOSSIL_ART = { ink: '#63524e', eye: '#5c8b91', lid: '#ecd2ab', cheek: '#e6a28e', mouth: '#7e4656', brass: '#b2955f', stoneEye: '#8e8a84',
    gold: '#f2c14e', goldDark: '#a8761f', goldLight: '#fff3b8', stone: '#cbbd9f', strata: '#a89a7c', stoneInk: '#7a6a52', chip: '#bfb197',
    tentacle: '#e9c9a0', pearl: '#fbf7ff', pearlRim: '#cbb6f2', pearlInk: '#8a6cc0', iris: '#ffe7f3', lilac: '#b58be0', amber: '#e8a21c',
    bed: '#9a7b58', heart: '#ff8fb1', halo: 'rgba(232,162,28,.12)' };
  const FOSSIL_FACES = ['regal', 'regal-blink', 'stony', 'stony-blink', 'brooding', 'brooding-blink', 'hurt', 'toss', 'glare', 'coo'];
  function fossilBrow(c, r, side, shape) {
    const B = { arch: [[.12, -.25], [.26, -.37], [.41, -.27]], flat: [[.1, -.22], [.26, -.235], [.42, -.215]], set: [[.1, -.19], [.25, -.27], [.42, -.3]],
      v: [[.08, -.15], [.25, -.25], [.42, -.33]], high: [[.11, -.31], [.26, -.44], [.41, -.33]] }[shape];
    c.beginPath(); c.moveTo(side * r * B[0][0], r * B[0][1]); c.quadraticCurveTo(side * r * B[1][0], r * B[1][1], side * r * B[2][0], r * B[2][1]);
    c.strokeStyle = FOSSIL_ART.ink; c.lineWidth = shape === 'flat' || shape === 'v' ? 2.2 : 1.5; c.lineCap = 'round'; c.stroke();
  }
  // kind: serene (a level lid, lashes), stern (a lid slanting to the nose), narrow (upper and lower lids), wide (pupils
  // up, lashes), glare (stone-grey eyes with a white star), shut (a happy closed arc with lashes), blink, squeeze.
  function fossilEye(c, r, side, kind) {
    const A = FOSSIL_ART, x = side * r * .26, rx = r * .12, ry = r * .13;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = A.ink;
    if (kind === 'shut' || kind === 'blink') {
      c.beginPath();
      if (kind === 'shut') c.arc(x, r * .05, rx * 1.05, Math.PI + .38, -.38); else { c.moveTo(x - rx * 1.1, r * .01); c.quadraticCurveTo(x, r * .055, x + rx * 1.1, r * .01); }
      c.lineWidth = 1.7; c.stroke();
      const ex = x + side * rx * (kind === 'shut' ? .98 : 1.1), ey = kind === 'shut' ? r * .005 : r * .01;
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + side * r * .075, ey - r * .035); c.lineWidth = 1.05; c.stroke();
      return;
    }
    if (kind === 'squeeze') {
      c.beginPath(); c.moveTo(x + side * rx * 1.1, -r * .085); c.lineTo(x - side * rx * .8, 0); c.lineTo(x + side * rx * 1.1, r * .085); c.lineWidth = 1.9; c.stroke();
      return;
    }
    const up = kind === 'wide' ? -r * .035 : 0;
    c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    c.beginPath(); c.arc(x - side * r * .012, r * .022 + up, r * .072, 0, TAU); c.fillStyle = kind === 'glare' ? A.stoneEye : A.eye; c.fill();
    c.fillStyle = '#ffffff';
    if (kind === 'glare') amberStar(c, x - side * r * .03, -r * .01, r * .055);
    else { c.beginPath(); c.arc(x - side * r * .038, -r * .02 + up, r * .028, 0, TAU); c.fill(); }
    if (kind !== 'wide') {
      // Lids: Regal's level and heavy (serene), Stony's and the glare's slanting to the nose, Brooding's narrowed top and bottom.
      const inner = kind === 'serene' ? -r * .005 : kind === 'narrow' ? r * .01 : r * .04, outer = kind === 'serene' ? -r * .005 : kind === 'narrow' ? -r * .035 : -r * .075;
      c.save(); c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.clip();
      c.beginPath(); c.moveTo(x - side * rx * 1.3, inner); c.lineTo(x + side * rx * 1.3, outer); c.lineTo(x + side * rx * 1.3, -ry * 1.3); c.lineTo(x - side * rx * 1.3, -ry * 1.3); c.closePath();
      c.fillStyle = A.lid; c.fill();
      if (kind === 'narrow') { c.beginPath(); c.moveTo(x - rx * 1.3, r * .085); c.quadraticCurveTo(x, r * .06, x + rx * 1.3, r * .085); c.lineTo(x + rx * 1.3, ry * 1.3); c.lineTo(x - rx * 1.3, ry * 1.3); c.closePath(); c.fill(); }
      c.restore();
      c.beginPath(); c.moveTo(x - side * rx * 1.12, inner); c.lineTo(x + side * rx * 1.12, outer); c.lineWidth = 1.6; c.stroke();
    }
    c.beginPath(); c.ellipse(x, 0, rx, ry, 0, 0, TAU); c.lineWidth = 1.15; c.stroke();
    if (kind === 'serene' || kind === 'wide' || kind === 'narrow') {
      // Two lashes at the outer corner: she is a queen.
      for (const k of [0, 1]) {
        const a = -Math.PI / 2 + side * (.8 + k * .45), px = x + rx * Math.cos(a), py = ry * Math.sin(a) + (kind === 'serene' ? r * .03 : 0);
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * r * .075, py + Math.sin(a) * r * .075); c.lineWidth = 1.05; c.stroke();
      }
    }
  }
  function fossilMouth(c, r, kind) {
    const A = FOSSIL_ART;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = A.ink;
    if (kind === 'smile') { c.beginPath(); c.arc(0, r * .2, r * .12, .38, Math.PI - .38); c.lineWidth = 1.5; c.stroke(); }
    else if (kind === 'flat') { c.beginPath(); c.moveTo(-r * .1, r * .32); c.quadraticCurveTo(0, r * .29, r * .1, r * .32); c.lineWidth = 1.6; c.stroke(); }
    else if (kind === 'soft') {
      c.beginPath(); c.moveTo(-r * .11, r * .28); c.quadraticCurveTo(0, r * .35, r * .11, r * .28); c.lineWidth = 1.6; c.stroke();
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * r * .11, r * .28); c.lineTo(side * r * .14, r * .25); c.lineWidth = 1.1; c.stroke(); }
    } else if (kind === 'tight') { c.beginPath(); c.arc(0, r * .41, r * .1, Math.PI + .6, -.6); c.lineWidth = 1.8; c.stroke(); }
    else if (kind === 'o' || kind === 'ouch') {
      c.beginPath(); c.ellipse(0, r * .31, r * (kind === 'o' ? .055 : .08), r * (kind === 'o' ? .065 : .07), 0, 0, TAU); c.fillStyle = A.mouth; c.fill(); c.lineWidth = 1.2; c.stroke();
    } else if (kind === 'coo') {
      // A little "3": she coos.
      c.beginPath(); c.moveTo(-r * .03, r * .24); c.quadraticCurveTo(r * .06, r * .25, r * .01, r * .29); c.quadraticCurveTo(r * .07, r * .32, -r * .02, r * .35); c.lineWidth = 1.4; c.stroke();
    }
  }
  function paintFossilFace(c, r, variant) {
    const A = FOSSIL_ART, blink = variant.endsWith('-blink'), base = blink ? variant.slice(0, -6) : variant, stony = base === 'stony' || base === 'glare';
    // Stony: a grey wash over her face (the face patch of her shell, as art.js paints it) and a few stone freckles.
    if (stony) {
      c.beginPath(); c.ellipse(r * .05, r * .06, r * .6, r * .56, -.15, 0, TAU); c.fillStyle = 'rgba(138,134,128,.32)'; c.fill();
      for (const [x, y, d] of [[-.38, -.32, .028], [.46, .34, .024], [-.48, .3, .022], [.08, .44, .02]]) { c.beginPath(); c.arc(r * x, r * y, r * d, 0, TAU); c.fillStyle = 'rgba(110,104,96,.55)'; c.fill(); }
    }
    const puffed = base === 'toss';
    for (const side of [-1, 1]) {
      c.save(); c.globalAlpha = stony ? .32 : puffed ? .85 : base === 'coo' ? .9 : .65;
      c.beginPath(); c.ellipse(side * r * (puffed ? .43 : .45), r * .2, r * (puffed ? .15 : .11), r * (puffed ? .11 : .055), side * -.25, 0, TAU);
      c.fillStyle = A.cheek; c.fill(); c.restore();
    }
    const brows = { regal: ['arch', 'arch'], stony: ['flat', 'flat'], brooding: ['set', 'set'], hurt: ['v', 'v'], toss: ['high', 'high'], glare: ['v', 'v'], coo: ['high', 'high'] }[base];
    fossilBrow(c, r, -1, brows[0]); fossilBrow(c, r, 1, brows[1]);
    const eye = blink ? 'blink' : { regal: 'serene', stony: 'stern', brooding: 'narrow', hurt: 'squeeze', toss: 'wide', glare: 'glare', coo: 'shut' }[base];
    fossilEye(c, r, -1, eye); fossilEye(c, r, 1, eye);
    fossilMouth(c, r, { regal: 'smile', stony: 'flat', brooding: 'soft', hurt: 'ouch', toss: 'o', glare: 'tight', coo: 'coo' }[base]);
    // Her brass monocle over her left eye, on its chain (the face hook replaces art.js's face, which drew it).
    c.beginPath(); c.arc(r * .26, 0, r * .21, 0, TAU); c.fillStyle = 'rgba(214,233,245,.16)'; c.fill(); c.strokeStyle = A.brass; c.lineWidth = 1.7; c.stroke();
    c.beginPath(); c.arc(r * .26, 0, r * .16, Math.PI * 1.1, Math.PI * 1.45); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.1; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.moveTo(r * .43, r * .11); c.bezierCurveTo(r * .74, r * .26, r * .58, r * .6, r * .77, r * .7); c.strokeStyle = A.brass; c.lineWidth = 1; c.stroke();
    if (base === 'coo') {
      c.save(); c.translate(r * .6, -r * .44); c.rotate(.2);
      c.beginPath(); c.moveTo(0, r * .07); c.bezierCurveTo(-r * .12, -r * .01, -r * .06, -r * .11, 0, -r * .045); c.bezierCurveTo(r * .06, -r * .11, r * .12, -r * .01, 0, r * .07); c.closePath();
      c.fillStyle = A.heart; c.fill(); c.strokeStyle = '#c84f78'; c.lineWidth = .9; c.stroke(); c.restore();
    }
  }
  // Regal's tiara: a gold band set under her five pearls (they are its jewels), four little spires between them and a
  // lilac gem in the middle.
  function paintFossilTiara(c, r) {
    const A = FOSSIL_ART;
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [x, top] of [[-.375, -1.17], [-.125, -1.27], [.125, -1.27], [.375, -1.17]]) {
      const mid = r * (top - .96) / 2;
      c.beginPath(); c.moveTo(r * (x - .065), -r * .96); c.quadraticCurveTo(r * (x - .02), mid, r * x, r * top); c.quadraticCurveTo(r * (x + .02), mid, r * (x + .065), -r * .96); c.closePath();
      c.fillStyle = A.gold; c.fill(); c.strokeStyle = A.goldDark; c.lineWidth = .9; c.stroke();
      c.beginPath(); c.arc(r * x, r * top, r * .03, 0, TAU); c.fillStyle = A.goldLight; c.fill();
    }
    const band = () => { c.beginPath(); c.moveTo(-r * .64, -r * .9); c.quadraticCurveTo(0, -r * 1.02, r * .64, -r * .9); };
    band(); c.strokeStyle = A.goldDark; c.lineWidth = 3.6; c.stroke();
    band(); c.strokeStyle = A.gold; c.lineWidth = 2.2; c.stroke();
    c.save(); c.translate(0, -.7); band(); c.strokeStyle = A.goldLight; c.lineWidth = .8; c.stroke(); c.restore();
    c.beginPath(); c.moveTo(0, -r * 1.02); c.lineTo(r * .05, -r * .955); c.lineTo(0, -r * .9); c.lineTo(-r * .05, -r * .955); c.closePath();
    c.fillStyle = A.lilac; c.fill(); c.strokeStyle = '#6b4a9a'; c.lineWidth = .7; c.stroke();
  }
  // Stony: stone freckles over her coil and two hairline cracks from her rim.
  function paintFossilStony(c, r) {
    const dots = [[-.9, -.42, .05], [-.74, -.76, .04], [-.48, -.96, .035], [-.22, -.68, .045], [-1.06, .04, .04], [-.86, .42, .05], [-.56, .68, .04],
      [-.36, -.3, .03], [.24, -.76, .04], [.56, -.56, .035], [-.62, -.14, .03], [-1.02, -.26, .03], [.8, -.24, .03], [-.22, .86, .035], [-.12, -1.04, .03]];
    for (const [x, y, d] of dots) {
      c.beginPath(); c.arc(r * x, r * y, r * d, 0, TAU); c.fillStyle = 'rgba(132,126,116,.85)'; c.fill();
      c.beginPath(); c.arc(r * (x - d * .35), r * (y - d * .35), r * d * .4, 0, TAU); c.fillStyle = 'rgba(232,226,214,.7)'; c.fill();
    }
    c.lineCap = 'round'; c.lineJoin = 'miter';
    for (const pts of [[[-1.32, -.36], [-1.08, -.3], [-.98, -.14], [-.76, -.12], [-.64, .02]], [[.18, -1.16], [.1, -.98], [.22, -.86], [.1, -.7]]]) {
      for (const [color, width, off] of [['rgba(255,250,240,.8)', 1, .5], ['#5e564c', .95, 0]]) {
        c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(r * x + off, r * y + off) : c.moveTo(r * x + off, r * y + off)); c.strokeStyle = color; c.lineWidth = width; c.stroke();
      }
    }
  }
  // Brooding's halo: three concentric amber discs at alpha .12 (no gradient), drawn under her.
  function paintFossilHalo(c, r) { for (const k of [1.95, 1.68, 1.44]) { c.beginPath(); c.arc(0, 0, r * k, 0, TAU); c.fillStyle = FOSSIL_ART.halo; c.fill(); } }
  // One of her little tentacles from (x0, y0) down `len` px, curling out at the tip toward `side`.
  function fossilTentacle(c, x0, y0, len, side, sway) {
    const A = FOSSIL_ART, x2 = x0 + side * len * .18 + sway, y2 = y0 + len;
    const path = () => { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + sway * .5 - side * len * .08, y0 + len * .6, x2, y2); c.arc(x2 + side * len * .14, y2, len * .14, Math.PI, side > 0 ? Math.PI * .1 : Math.PI * 1.9, side < 0); };
    path(); c.strokeStyle = A.ink; c.lineWidth = 3.6; c.stroke();
    path(); c.strokeStyle = A.tentacle; c.lineWidth = 2.1; c.stroke();
    c.beginPath(); c.moveTo(x0 - .5, y0 + 1); c.quadraticCurveTo(x0 + sway * .5 - side * len * .08 - .6, y0 + len * .6, x2 - .5, y2 - 1); c.strokeStyle = 'rgba(255,248,232,.8)'; c.lineWidth = .7; c.stroke();
  }
  // Four short tentacles curling under her face; frame f (0-2) sways them.
  function paintFossilTentacles(c, r, f) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    [[.06, -1, .38], [.22, -1, .46], [.4, 1, .46], [.56, 1, .36]].forEach(([x, side, len], i) => fossilTentacle(c, r * x, r * .8, r * len, side, (((i + f) % 3) - 1) * 1.3));
  }
  // Brooding with an egg ready: her tentacles curled round a little amber egg.
  function paintFossilCradle(c, r) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    fossilTentacle(c, r * .14, r * .8, r * .3, -1, 0); fossilTentacle(c, r * .48, r * .8, r * .3, 1, 0);
    c.save(); c.translate(r * .31, r * 1.08); c.scale(.72, .72); paintFossilEgg(c); c.restore();
    const A = FOSSIL_ART;
    for (const side of [-1, 1]) {
      const arm = () => { c.beginPath(); c.moveTo(r * (.31 + side * .1), r * .82); c.quadraticCurveTo(r * (.31 + side * .3), r * 1.08, r * (.31 + side * .08), r * 1.3); };
      arm(); c.strokeStyle = A.ink; c.lineWidth = 3.6; c.stroke(); arm(); c.strokeStyle = A.tentacle; c.lineWidth = 2.1; c.stroke();
    }
  }
  // A pearl, r 9 (it turns; its shine is a separate sprite that stays lit from the upper left).
  function paintFossilPearl(c) {
    const A = FOSSIL_ART, R = 9;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = A.pearl; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.ellipse(1.2, 3.4, R * 1.1, R * .38, -.35, 0, TAU); c.fillStyle = A.iris; c.fill();
    c.beginPath(); c.ellipse(-1.4, -1, R * 1.05, R * .16, -.35, 0, TAU); c.fillStyle = 'rgba(226,240,255,.8)'; c.fill();
    c.beginPath(); c.arc(0, 0, R - 1.7, -.25, 2); c.strokeStyle = A.pearlRim; c.lineWidth = 2.6; c.stroke();
    c.restore();
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.strokeStyle = A.pearlInk; c.lineWidth = 1.3; c.stroke();
  }
  function paintFossilShine(c) {
    c.beginPath(); c.ellipse(-3, -3.5, 3.1, 1.9, -.65, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    c.beginPath(); c.arc(2.9, -4.8, .9, 0, TAU); c.fill();
  }
  // The amber egg, a curled trilobite asleep inside.
  function paintFossilEgg(c) {
    const A = AMBER_ART, egg = () => { c.beginPath(); c.ellipse(0, 0, 6.6, 8.3, 0, 0, TAU); };
    egg(); c.fillStyle = 'rgba(240,164,44,.92)'; c.fill();
    c.save(); egg(); c.clip();
    c.beginPath(); c.ellipse(1.4, 2.2, 6.4, 7.6, 0, 0, TAU); c.fillStyle = 'rgba(196,111,10,.35)'; c.fill();
    c.lineCap = 'round';
    c.beginPath(); c.arc(.6, .8, 3.4, -.5, Math.PI * 1.55); c.strokeStyle = 'rgba(110,56,6,.6)'; c.lineWidth = 2.7; c.stroke();
    for (let i = 0; i < 5; i++) { const a = -.2 + i * .9; c.beginPath(); c.moveTo(.6 + Math.cos(a) * 2.1, .8 + Math.sin(a) * 2.1); c.lineTo(.6 + Math.cos(a) * 4.7, .8 + Math.sin(a) * 4.7); c.strokeStyle = 'rgba(255,214,140,.45)'; c.lineWidth = .7; c.stroke(); }
    c.restore();
    egg(); c.strokeStyle = A.beadRim; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.ellipse(0, 0, 5.2, 6.9, 0, 0, TAU); c.strokeStyle = A.beadLight; c.lineWidth = .8; c.stroke();
    c.beginPath(); c.ellipse(0, 0, 4.5, 6.1, 0, Math.PI * 1.08, Math.PI * 1.45); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.7; c.lineCap = 'round'; c.stroke();
  }
  function fossilRect(c, x, y, w, h, k) { c.beginPath(); c.moveTo(x + k, y); c.arcTo(x + w, y, x + w, y + h, k); c.arcTo(x + w, y + h, x, y + h, k); c.arcTo(x, y + h, x, y, k); c.arcTo(x, y, x + w, y, k); c.closePath(); }
  // A stone slab 30 x 12 round the 18 px capsule: sandstone, strata, an ammonite imprint, lit along its top; or all white.
  function paintFossilSlab(c, flash) {
    const A = FOSSIL_ART;
    fossilRect(c, -15, -6, 30, 12, 4.5); c.fillStyle = flash ? '#ffffff' : A.stone; c.fill();
    if (!flash) {
      c.save(); fossilRect(c, -15, -6, 30, 12, 4.5); c.clip();
      c.beginPath(); c.rect(-16, 3.2, 32, 4); c.fillStyle = 'rgba(122,106,82,.22)'; c.fill();
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(-16, -1.6); c.bezierCurveTo(-8, -2.9, 2, -.5, 16, -2.1); c.strokeStyle = A.strata; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.moveTo(-16, 2.5); c.bezierCurveTo(-6, 1.5, 4, 3.5, 16, 2.1); c.stroke();
      c.beginPath(); for (let i = 0; i <= 22; i++) { const a = i * .5, d = 3.4 * (1 - i / 26); const x = 9.4 + Math.cos(a) * d, y = .2 + Math.sin(a) * d; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.strokeStyle = 'rgba(122,106,82,.8)'; c.lineWidth = .8; c.stroke();
      c.restore();
      c.beginPath(); c.moveTo(-11, -4.5); c.lineTo(11, -4.5); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.1; c.lineCap = 'round'; c.stroke();
    }
    fossilRect(c, -15, -6, 30, 12, 4.5); c.strokeStyle = flash ? '#eadfc8' : A.stoneInk; c.lineWidth = 1.2; c.stroke();
  }
  function paintFossilChip(c) {
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-2.6, -1.3); c.lineTo(1.1, -2.6); c.lineTo(2.8, .8); c.lineTo(-.6, 2.4); c.closePath(); c.fillStyle = FOSSIL_ART.chip; c.fill(); c.strokeStyle = FOSSIL_ART.stoneInk; c.lineWidth = .8; c.stroke();
    c.beginPath(); c.moveTo(-1.8, -1.1); c.lineTo(.9, -2); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = .6; c.stroke();
  }
  // A pearl's landing mark: a little lilac spiral shell.
  function paintFossilMark(c) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const spiral = () => { c.beginPath(); for (let i = 0; i <= 26; i++) { const a = i * .45, d = 4.6 * (1 - i / 32); const x = Math.cos(a) * d, y = Math.sin(a) * d; if (i) c.lineTo(x, y); else c.moveTo(x, y); } };
    spiral(); c.strokeStyle = '#ffffff'; c.lineWidth = 2.6; c.stroke(); spiral(); c.strokeStyle = FOSSIL_ART.lilac; c.lineWidth = 1.3; c.stroke();
  }
  function paintFossilGlint(c) { c.beginPath(); c.ellipse(0, 0, 3.4, 1.1, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,.9)'; c.fill(); }
  const fossilFaceSprite = (r, v) => [`kit:fossil:face:${r}:${v}`, [-r * .74, -r * .62, r * .86, r * .8], c => paintFossilFace(c, r, v)];
  const FOSSIL_SPRITES = {
    tiara: r => [`kit:fossil:tiara:${r}`, [-r * .76, -r * 1.36, r * .76, -r * .84], c => paintFossilTiara(c, r)],
    stony: r => [`kit:fossil:stony:${r}`, [-r * 1.38, -r * 1.24, r * .9, r * .96], c => paintFossilStony(c, r)],
    halo: r => [`kit:fossil:halo:${r}`, [-r * 2, -r * 2, r * 2, r * 2], c => paintFossilHalo(c, r)],
    tentacles: (r, f) => [`kit:fossil:tentacles${f}:${r}`, [-r * .2, r * .7, r * .86, r * 1.42], c => paintFossilTentacles(c, r, f)],
    cradle: r => [`kit:fossil:cradle:${r}`, [-r * .2, r * .7, r * .86, r * 1.46], c => paintFossilCradle(c, r)],
    pearl: () => ['kit:fossil:pearl', [-10.5, -10.5, 10.5, 10.5], paintFossilPearl],
    shine: () => ['kit:fossil:shine', [-7, -7.5, 5, -.5], paintFossilShine],
    egg: () => ['kit:fossil:egg', [-8.5, -10.2, 8.5, 10.2], paintFossilEgg],
    slab: () => ['kit:fossil:slab:18', [-16.5, -7.5, 16.5, 7.5], c => paintFossilSlab(c, false)],
    slabFlash: () => ['kit:fossil:slabFlash:18', [-16.5, -7.5, 16.5, 7.5], c => paintFossilSlab(c, true)],
    chip: () => ['kit:fossil:chip', [-4, -4, 4, 4], paintFossilChip],
    mark: () => ['kit:fossil:mark', [-6.5, -6.5, 6.5, 6.5], paintFossilMark],
    glint: () => ['kit:fossil:glint', [-4.2, -2, 4.2, 2], paintFossilGlint],
    // The bud asleep in a slab: art.js's own closed flower, baked once per colour so a slab never paints a fresh flower.
    sleeper: (kit, type) => [`kit:fossil:sleeper:${type}`, [-17, -17, 17, 17], c => kit.drawFlower(c, 0, 0, 5.5, type, 0, 0, 0)]
  };
  const fossilStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  // Points along a lob from (x0, y0) to (x1, y1), arc height h, skipping the first `skip` of the way (inside her).
  function fossilArc(x0, y0, x1, y1, h, skip = .12, n = 12) { const pts = []; for (let i = 0; i <= n; i++) { const at = lobAt(x0, y0, x1, y1, 1, skip + (1 - skip) * i / n, h); pts.push([at.x, at.y]); } return pts; }
  // Her next egg is ready: Brooding, no egg in the air, and no keeper of hers still alive.
  const fossilEggReady = (state, s) => s.tier === 2 && !(s.lobs || []).some(l => l.look === 'egg')
    && !(state.buds || []).some(p => p.foe === 'amberkeeper' && p.bossSource === (s.boss && s.boss.id) && !p.bloomed);
  kitLook('fossil', {
    warm(kit) {
      const r = 26, jobs = [...FOSSIL_FACES.map(v => fossilFaceSprite(r, v)), FOSSIL_SPRITES.tiara(r), FOSSIL_SPRITES.stony(r), FOSSIL_SPRITES.halo(r),
        FOSSIL_SPRITES.tentacles(r, 0), FOSSIL_SPRITES.tentacles(r, 1), FOSSIL_SPRITES.tentacles(r, 2), FOSSIL_SPRITES.cradle(r), FOSSIL_SPRITES.pearl(), FOSSIL_SPRITES.shine(),
        FOSSIL_SPRITES.egg(), FOSSIL_SPRITES.slab(), FOSSIL_SPRITES.slabFlash(), FOSSIL_SPRITES.chip(), FOSSIL_SPRITES.mark(), FOSSIL_SPRITES.glint()];
      if (kit.FLOWERS) for (const type of Object.keys(kit.FLOWERS)) jobs.push(FOSSIL_SPRITES.sleeper(kit, type));
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
      // She hatches Amberkeepers: paint him (and his beads) now too.
      if (LOOKS.amberkeeper && LOOKS.amberkeeper.warm) LOOKS.amberkeeper.warm(kit, 13, 'gold');
    },
    under(ctx, state, s, time, still, kit) {
      const b = s.boss;
      if (!b || b.bloomed) return;
      // The lob arcs of a pearl or egg tell run behind her, so they rise out from behind her shell.
      const w = s.warning && time < s.warning.until ? s.warning : null;
      if (w && (w.move === 'pearls' || w.move === 'hatch')) labelTell(ctx, w, () => { for (const t of w.targets || []) {
        if (t.role === 'pearl') dotted(ctx, fossilArc(b.x, b.y, t.x, t.y, 56), FOSSIL_ART.lilac, 2, 7, still ? 0 : -time * 24);
        else if (t.role === 'egg') dotted(ctx, fossilArc(b.x, b.y, t.x, t.y, 64), FOSSIL_ART.amber, 2, 7, still ? 0 : -time * 24);
      } });
      if (s.tier !== 2) return;
      // Brooding: a warm halo pulses behind her at 1.4 Hz.
      ctx.globalAlpha *= still ? .5 : .5 + .15 * Math.sin(time * TAU * 1.4);
      fossilStamp(ctx, kit, FOSSIL_SPRITES.halo(Number(b.r) || 26), b.x, b.y);
    },
    face(ctx, state, s, bud, time, still, kit, quality) {
      if (!bud.boss) return false;
      const r = Number(bud.r) || 26, look = kit.BOSS_LOOKS.fossil || { faceX: .24, faceY: .24 }, health = (Number(bud.hp) || 0) / Math.max(1, Number(bud.maxHp) || 1);
      const w = s.warning && time < s.warning.until ? s.warning : null, tier = clamp(s.tier | 0, 0, 2);
      const hurt = Boolean(bud.bloomed) || typeof bud.hitAt === 'number' && time - bud.hitAt >= 0 && time - bud.hitAt < .3;
      const pearls = (s.parts || []).some(p => p.bossPart === 'pearl' && !p.bloomed), blink = !still && (time + r * .1) % 3.7 < .12;
      const variant = hurt ? 'hurt' : w && w.move === 'pearls' || pearls ? 'toss' : w && w.move === 'petrify' ? 'glare' : w && w.move === 'hatch' ? 'coo'
        : ['regal', 'stony', 'brooding'][tier] + (blink ? '-blink' : '');
      // The face turns with her body: a shiver when nearly beaten (as art.js poses her).
      ctx.translate(bud.x, bud.y); if (!still && health <= .2) ctx.rotate(Math.sin(time * TAU * 6) * .04);
      const alpha = ctx.globalAlpha;
      if (tier === 0) {
        fossilStamp(ctx, kit, FOSSIL_SPRITES.tiara(r), 0, 0);
        if (!still && quality === 0) { const k = Math.max(0, Math.sin(time * 2.4)); if (k > .05) kit.sparkle(ctx, -r * .025, -r * 1.17, r * .16 * k, '#ffffff', .3); }
      } else if (tier === 1) {
        ctx.globalAlpha = alpha * .85; fossilStamp(ctx, kit, FOSSIL_SPRITES.stony(r), 0, 0); ctx.globalAlpha = alpha;
        // Grit trickles from her rim.
        if (!still && quality === 0) for (let i = 0; i < 3; i++) {
          const ph = (time * .55 + i / 3) % 1;
          ctx.globalAlpha = alpha * Math.sin(Math.PI * ph) * .85; kit.circle(ctx, r * (-.86 + .5 * i), r * (.78 - .1 * i) + ph * r * .7, 1.3, FOSSIL_ART.chip, FOSSIL_ART.stoneInk, .5);
        }
        ctx.globalAlpha = alpha;
      }
      // Her tentacles sway at 3 fps; in Brooding, with an egg ready, they cradle it instead.
      if (fossilEggReady(state, s)) fossilStamp(ctx, kit, FOSSIL_SPRITES.cradle(r), 0, still ? 0 : Math.sin(time * 2.2) * .8);
      else fossilStamp(ctx, kit, FOSSIL_SPRITES.tentacles(r, still ? 1 : Math.floor(time * 3) % 3), 0, 0);
      fossilStamp(ctx, kit, fossilFaceSprite(r, variant), r * (look.faceX || 0), r * (look.faceY || 0));
      return true;
    },
    part(ctx, state, s, bud, time, still, kit, quality) {
      if (bud.bossPart !== 'pearl') return false;
      const clock = Number(s.kitAge) || 0, t = clock - (Number(bud.t0) || 0), T = Number(bud.T) || 1.05, h = Number(bud.h) || 56, u = clamp(t / T, 0, 1), alpha = ctx.globalAlpha;
      // Its landing shadow darkens and grows as it nears: the landing is the anticipation.
      if (Number.isFinite(bud.x1)) {
        ctx.globalAlpha = alpha * (still ? .4 : .25 + .35 * u); ctx.beginPath(); ctx.ellipse(bud.x1, bud.y1 + 3, 5 + 3 * u, 2 + u, 0, 0, TAU); ctx.fillStyle = '#6b4a9a'; ctx.fill();
        ctx.globalAlpha = alpha;
      }
      // Ghost copies behind it along the arc.
      if (!still && quality < 2 && Number.isFinite(bud.x0)) {
        const ghosts = quality === 0 ? [[.3, .85], [.18, .7], [.1, .55]] : [[.3, .85]];
        ghosts.forEach(([a, k], i) => {
          const back = t - .035 * (i + 1); if (back <= 0) return;
          const at = lobAt(bud.x0, bud.y0, bud.x1, bud.y1, T, back, h);
          ctx.globalAlpha = alpha * a; fossilStamp(ctx, kit, FOSSIL_SPRITES.pearl(), at.x, at.y, 0, k);
        });
        ctx.globalAlpha = alpha;
      }
      fossilStamp(ctx, kit, FOSSIL_SPRITES.pearl(), bud.x, bud.y, still ? 0 : clock * 5);
      fossilStamp(ctx, kit, FOSSIL_SPRITES.shine(), bud.x, bud.y);
      return true;
    },
    over(ctx, state, s, time, still, kit, quality) {
      const A = FOSSIL_ART, b = s.boss, clock = Number(s.kitAge) || 0;
      if (!b || b.bloomed) return;
      const r = Number(b.r) || 26, w = s.warning && time < s.warning.until ? s.warning : null, base = ctx.globalAlpha;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (w) {
        const p = clamp((time - w.at) / Math.max(.1, w.until - w.at), 0, 1);
        for (const t of w.targets || []) {
          if (w.move === 'pearls' && t.role === 'pearl') {
            // A lilac ring with a little shell where each pearl will land (its dotted arc is drawn under her).
            const pop = still ? 1 : kit.easeBack(clamp(p / .25, 0, 1));
            labelTell(ctx, w, () => { ctx.save(); ctx.translate(t.x, t.y); ctx.scale(pop, pop);
            kit.circle(ctx, 0, 0, 11, null, '#ffffff', 3.6); kit.circle(ctx, 0, 0, 11, null, A.lilac, 1.9);
            fossilStamp(ctx, kit, FOSSIL_SPRITES.mark(), 0, 0); ctx.restore(); });
          } else if (w.move === 'petrify' && t.role === 'stone') {
            // The ghost slab at the angle the slab will take, and six stone chips closing in on the bud.
            const R = t.bed ? (t.r || 17) : (t.r || 11) + 6, ca = Math.cos(t.angle || 0), sa = Math.sin(t.angle || 0), pts = [];
            for (const [x, y] of [[-15, -6], [15, -6], [15, 6], [-15, 6], [-15, -6]]) pts.push([t.x + x * ca - y * sa, t.y + x * sa + y * ca]);
            ctx.save(); ctx.globalAlpha = base * (still ? .35 : .15 + .25 * p); fossilStamp(ctx, kit, FOSSIL_SPRITES.slab(), t.x, t.y, t.angle || 0);
            ctx.globalAlpha = base * .8; dotted(ctx, pts, A.stoneInk, 1.5, 4.6, still ? 0 : -time * 10); ctx.restore();
            const d = still ? R : R + 10 * (1 - kit.smooth(p));
            for (let i = 0; i < 6; i++) {
              const a = i * TAU / 6 + (t.x + t.y) * .05 + (still ? 0 : p * 1.2);
              ctx.save(); ctx.globalAlpha = base * (still ? 1 : .4 + .6 * p); fossilStamp(ctx, kit, FOSSIL_SPRITES.chip(), t.x + d * Math.cos(a), t.y + d * Math.sin(a), a * 2); ctx.restore();
            }
            if (t.bed) {
              // A bare-bed slab rises from the seabed: an arc of brown dots under the mark.
              const arc = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (.15 + .7 * i / 10); arc.push([t.x + (R + 3) * Math.cos(a), t.y + 2 + (R * .55) * Math.sin(a)]); }
              dotted(ctx, arc, A.bed, 1.5, 5, 0);
            }
          } else if (w.move === 'hatch' && t.role === 'egg') {
            // A pulsing dotted egg at the mark (its amber dotted arc is drawn under her).
            const k = still ? 1 : 1 + .08 * Math.sin(time * 7), egg = [];
            for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU; egg.push([t.x + 6.6 * k * Math.cos(a), t.y + 8.3 * k * Math.sin(a)]); }
            labelTell(ctx, w, () => dotted(ctx, egg, A.amber, 1.5, 4.2, 0));
          }
        }
      }
      // The egg in flight, tumbling along its arc, its shadow growing at the mark.
      for (const l of s.lobs || []) {
        if (l.look !== 'egg') continue;
        const t = clock - l.t0; if (t < 0) continue;
        const at = lobAt(l.x0, l.y0, l.x1, l.y1, l.T, t, l.h || 64), u = at.u;
        ctx.save(); ctx.globalAlpha = base * (.2 + .3 * u); ctx.beginPath(); ctx.ellipse(l.x1, l.y1 + 8, 4 + 5 * u, 1.8 + 1.4 * u, 0, 0, TAU); ctx.fillStyle = '#6b4a2a'; ctx.fill(); ctx.restore();
        fossilStamp(ctx, kit, FOSSIL_SPRITES.egg(), at.x, at.y, still ? 0 : t * .8, .85 + .25 * u);
      }
      // Slabs: a bud asleep in each; they grow in, glint, flash white on a bank and fade as they thaw.
      for (const m of state.bumpers || []) {
        if (!m.bossStone) continue;
        const age = clock - m.t0, left = m.kitUntil - clock;
        if (left <= 0) continue;
        const grow = still ? 1 : age < .3 ? kit.easeBack(clamp(age / .3, 0, 1)) : 1, fade = clamp(left / .45, 0, 1);
        ctx.save(); ctx.translate(m.x, m.y); ctx.globalAlpha = base * fade; ctx.rotate(m.angle || 0); ctx.scale(grow, grow);
        fossilStamp(ctx, kit, FOSSIL_SPRITES.slab(), 0, 0);
        if (m.type && kit.FLOWERS && kit.FLOWERS[m.type]) { const k = (Number(m.r) || 11) / 11; ctx.globalAlpha = base * fade * .42; fossilStamp(ctx, kit, FOSSIL_SPRITES.sleeper(kit, m.type), 0, 0, 0, k); ctx.globalAlpha = base * fade; }
        if (!still && quality <= 1) {
          const g = (time * .5 + m.x * .01) % 1;
          ctx.globalAlpha = base * fade * Math.sin(g * Math.PI) * .9; fossilStamp(ctx, kit, FOSSIL_SPRITES.glint(), (g - .5) * 22, -4.4); ctx.globalAlpha = base * fade;
        }
        const flash = time - (Number.isFinite(m.flashAt) ? m.flashAt : -100);
        if (flash >= 0 && flash < .28) { ctx.globalAlpha = base * fade * (1 - flash / .28); fossilStamp(ctx, kit, FOSSIL_SPRITES.slabFlash(), 0, 0, 0, still ? 1 : 1 + .1 * (1 - flash / .28)); }
        ctx.restore();
      }
      // Landed pearls twinkle in their shells.
      for (const p of state.buds || []) {
        if (!p.pearl || p.bloomed || p.hidden || p.bossSource !== b.id) continue;
        const k = still ? .8 : .45 + .55 * Math.abs(Math.sin(time * 2.2 + p.x * .05));
        kit.sparkle(ctx, p.x + 3, p.y - 3, 3.4 * k, '#ffffff', .3);
      }
      // Brooding spins her lock ring faster: white motion arcs trail each gap end.
      if (s.tier === 2 && quality < 2 && !still && Number.isFinite(s.lockAngle)) {
        const R = r + 16, gap = Math.acos(.25), dir = Math.sign(Number(s.lockSpin) || 1);
        for (const end of [s.lockAngle + gap, s.lockAngle - gap]) for (const [from, to, a] of [[.5, .25, .25], [.25, .02, .6]]) {
          ctx.beginPath(); ctx.arc(b.x, b.y, R, end - dir * from, end - dir * to, dir < 0); ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      // Lifted by a move: bubbles rise from under her as she swims up.
      if (s.rise && quality <= 1 && !still) for (let i = 0; i < 3; i++) {
        const ph = (time * .9 + i / 3) % 1, x = b.x + r * (-.5 + .45 * i) + Math.sin(ph * 6 + i) * 2.5, y = b.y + r * 1.75 - ph * r * 1.1;
        ctx.save(); ctx.globalAlpha = base * Math.sin(Math.PI * Math.min(1, ph * 1.4)) * .9; kit.circle(ctx, x, y, 2.4 + i * .6, 'rgba(255,255,255,.3)', '#ffffff', 1.2);
        kit.circle(ctx, x - .8, y - .8, .7, '#ffffff'); ctx.restore();
      }
    }
  });

  // ── Ember Rose (Level 7, `ember`) ──
  // A flamenco fire-rose. Her face follows her mood (s.tier): Flickering is sly (half-moon eyes, a dimpled smile, a
  // flame curl that flicks on her crown), Dancing beams (closed ^ ^ eyes, rosy cheeks, a gold comb; she sings an "O"
  // through the castanet count and is out of breath in Olé), Blazing glares (round eyes with star glints, set brows, a
  // toothy grin under a crown of three flames). Her fire rings are wreaths of flame round a dark hole that turn, the "in"
  // ring marked with an up chevron and the "out" ring a down one, a gold arc counting down their life and a dotted ember
  // arc linking them; she swoops into one, shrinking and spinning, and bursts out of the other in a gold flash. A cinder is
  // a plum coal-seed licked by flames with a white catch ring near the bottom; a miss cools to a cracked coal that glows.
  // The castanets clack the count over three lamps above her head, with a dashed line where the stomp stops; the barrage
  // shows the whizzbangs to come with dotted columns up to her; Olé rings her with turning gold stars and a countdown.
  const EMB = { light: '#fff2b1', base: '#ff9652', dark: '#b63b65', ink: '#732c48', face: '#ffd396', eye: '#aa4b5a', poppy: '#ff7433', gold: '#ffd148',
    coal: '#3f302e', ash: '#5b3b35', hole: '#1b0d10', cheek: '#ff8f8f', lid: '#ee9e6a', petals: ['#e25b69', '#ffb56c', '#ffe5a0'], petalInk: '#c75565', sweat: '#9fdcff' };
  const EMB_LOOKS = ['calm', 'blink', 'hurt', 'sing', 'ole'];
  // A teardrop flame pointing up from (x, y): poppy outside, gold inside, inked.
  function embFlame(c, x, y, w, h, lean = 0, ink = 0) {
    const drop = (k, color) => {
      c.beginPath(); c.moveTo(x - w * k, y); c.quadraticCurveTo(x - w * k, y - h * k * .55, x + lean * k, y - h * k);
      c.quadraticCurveTo(x + w * k, y - h * k * .55, x + w * k, y); c.quadraticCurveTo(x, y + w * k * .8, x - w * k, y); c.closePath(); c.fillStyle = color; c.fill();
      if (k === 1 && ink) { c.strokeStyle = EMB.ink; c.lineWidth = ink; c.stroke(); }
    };
    drop(1, EMB.poppy); drop(.58, EMB.gold); drop(.25, '#fffbe6');
  }
  // Her face for a mood and a look, around its own centre (unit = her radius).
  function paintEmberFace(c, r, tier, look, frame) {
    c.save(); c.scale(r, r); c.lineCap = 'round'; c.lineJoin = 'round';
    const px = 1 / r, ink = EMB.ink, ex = .24, ey = -.02;
    // The crown first: it sits on her petals above the face.
    if (tier === 0) {
      // One flame curl that flicks from side to side.
      const lean = frame ? .09 : -.09;
      c.save(); c.translate(.05, -.46); embFlame(c, 0, 0, .17, .56, lean, 1.2 * px);
      c.beginPath(); c.arc(lean - .08, -.48, .09, -Math.PI * .1, Math.PI * 1.2); c.strokeStyle = EMB.poppy; c.lineWidth = 2.2 * px; c.stroke(); c.restore();
    } else if (tier === 1) {
      // A three-petal gold comb, worn to one side.
      c.save(); c.translate(-.24, -.5); c.rotate(-.35); c.scale(1.35, 1.35);
      c.beginPath(); c.moveTo(-.2, .02); c.lineTo(.2, .02); c.strokeStyle = ink; c.lineWidth = 3.2 * px; c.stroke(); c.strokeStyle = EMB.gold; c.lineWidth = 1.6 * px; c.stroke();
      for (const [a, k] of [[-.75, .12], [0, .15], [.75, .12]]) { c.beginPath(); c.ellipse(Math.sin(a) * .16, -.06 - Math.cos(a) * .14, k * .7, k, a, 0, TAU); c.fillStyle = EMB.gold; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.1 * px; c.stroke(); }
      c.beginPath(); c.arc(0, -.04, .05, 0, TAU); c.fillStyle = EMB.poppy; c.fill(); c.restore();
    } else {
      // A crown of three flames, the middle one tallest.
      for (const [x, h, lean] of [[-.25, .42, -.08], [.25, .42, .08], [0, .58, 0]]) embFlame(c, x, -.44, .15, h, lean, 1.1 * px);
    }
    // Cheeks.
    c.globalAlpha = tier === 1 ? .85 : .55;
    for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * .38, .17, .1, .06, 0, 0, TAU); c.fillStyle = EMB.cheek; c.fill(); }
    c.globalAlpha = 1; c.strokeStyle = ink; c.fillStyle = ink;
    const roundEyes = (size, glint) => {
      for (const side of [-1, 1]) {
        c.beginPath(); c.arc(side * ex, ey, size, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.2 * px; c.strokeStyle = ink; c.stroke();
        c.beginPath(); c.arc(side * ex, ey + .01, size * .58, 0, TAU); c.fillStyle = EMB.eye; c.fill();
        c.beginPath(); c.arc(side * ex, ey + .01, size * .28, 0, TAU); c.fillStyle = ink; c.fill();
        if (glint) { c.beginPath(); starPathLocal(c, side * ex - size * .3, ey - size * .32, size * .42); c.fillStyle = '#ffffff'; c.fill(); }
        else { c.beginPath(); c.arc(side * ex - size * .3, ey - size * .3, size * .2, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); }
      }
    };
    // Eyes.
    if (look === 'hurt') {
      c.lineWidth = 1.8 * px;
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * (ex + .09), ey - .08); c.lineTo(side * (ex - .06), ey); c.lineTo(side * (ex + .09), ey + .08); c.stroke(); }
    } else if (look === 'blink') {
      c.lineWidth = 1.7 * px; for (const side of [-1, 1]) { c.beginPath(); c.arc(side * ex, ey - .04, .09, .2 * Math.PI, .8 * Math.PI); c.stroke(); }
    } else if (look === 'ole') roundEyes(.13, false);
    else if (tier === 0) {
      // Sly half-moons: the lids come down to 45%, the eyes glance to the side.
      for (const side of [-1, 1]) {
        c.save(); c.beginPath(); c.ellipse(side * ex, ey, .115, .12, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.clip();
        c.beginPath(); c.arc(side * ex + .04, ey + .03, .07, 0, TAU); c.fillStyle = EMB.eye; c.fill();
        c.beginPath(); c.arc(side * ex + .04, ey + .03, .033, 0, TAU); c.fillStyle = ink; c.fill();
        c.fillStyle = EMB.lid; c.fillRect(side * ex - .2, ey - .2, .4, .188); c.restore();
        c.beginPath(); c.ellipse(side * ex, ey, .115, .12, 0, 0, TAU); c.lineWidth = 1.1 * px; c.stroke();
        c.beginPath(); c.moveTo(side * ex - .13, ey - .012); c.lineTo(side * ex + .13, ey - .012); c.lineWidth = 1.8 * px; c.stroke();
        c.beginPath(); c.moveTo(side * (ex + .1), ey - .03); c.lineTo(side * (ex + .16), ey - .08); c.lineWidth = 1.2 * px; c.stroke();
      }
    } else if (tier === 1) {
      c.lineWidth = 2 * px; for (const side of [-1, 1]) { c.beginPath(); c.arc(side * ex, ey + .05, .1, 1.12 * Math.PI, 1.88 * Math.PI); c.stroke(); }
    } else roundEyes(.135, true);
    // Brows (Blazing only): short and set.
    if (tier === 2 && look !== 'ole') for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * .37, -.25); c.lineTo(side * .13, -.17); c.strokeStyle = ink; c.lineWidth = 3.4 * px; c.stroke(); c.strokeStyle = EMB.dark; c.lineWidth = 2 * px; c.stroke();
    }
    c.strokeStyle = ink; c.fillStyle = ink;
    // Mouth.
    if (look === 'sing') { c.beginPath(); c.ellipse(0, .22, .085, .11, 0, 0, TAU); c.fillStyle = '#5b1f37'; c.fill(); c.lineWidth = 1.2 * px; c.stroke(); c.beginPath(); c.ellipse(0, .27, .05, .035, 0, 0, TAU); c.fillStyle = EMB.cheek; c.fill(); }
    else if (look === 'ole') {
      c.beginPath(); c.ellipse(0, .23, .055, .07, 0, 0, TAU); c.fillStyle = '#5b1f37'; c.fill(); c.lineWidth = 1.1 * px; c.stroke();
      // A drop of sweat on her brow.
      const sx = .42, sy = -.3, s = .07; c.beginPath(); c.moveTo(sx, sy - s * 1.8); c.bezierCurveTo(sx + s * .3, sy - s, sx + s, sy - s * .2, sx + s, sy + s * .2); c.arc(sx, sy + s * .2, s, 0, Math.PI);
      c.bezierCurveTo(sx - s, sy - s * .2, sx - s * .3, sy - s, sx, sy - s * 1.8); c.closePath(); c.fillStyle = EMB.sweat; c.fill(); c.lineWidth = .9 * px; c.strokeStyle = '#3c78a8'; c.stroke();
    } else if (look === 'hurt') { c.beginPath(); c.moveTo(-.12, .27); c.quadraticCurveTo(-.06, .2, 0, .26); c.quadraticCurveTo(.06, .32, .12, .25); c.lineWidth = 1.5 * px; c.stroke(); }
    else if (tier === 0) {
      c.beginPath(); c.arc(-.02, .14, .12, .22 * Math.PI, .78 * Math.PI); c.lineWidth = 1.6 * px; c.stroke();
      c.beginPath(); c.arc(.13, .2, .03, -.3 * Math.PI, .5 * Math.PI); c.lineWidth = 1.1 * px; c.stroke();
    } else if (tier === 1) {
      c.beginPath(); c.moveTo(-.15, .16); c.quadraticCurveTo(0, .4, .15, .16); c.closePath(); c.fillStyle = '#5b1f37'; c.fill(); c.lineWidth = 1.2 * px; c.stroke();
      c.beginPath(); c.ellipse(0, .27, .06, .035, 0, 0, TAU); c.fillStyle = EMB.cheek; c.fill();
    } else {
      // A toothy grin.
      c.beginPath(); c.moveTo(-.2, .15); c.quadraticCurveTo(0, .17, .2, .15); c.quadraticCurveTo(.16, .36, 0, .36); c.quadraticCurveTo(-.16, .36, -.2, .15); c.closePath();
      c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.3 * px; c.stroke();
      c.beginPath(); for (const x of [-.07, .07]) { c.moveTo(x, .16); c.lineTo(x, .33); } c.moveTo(-.18, .22); c.quadraticCurveTo(0, .25, .18, .22); c.lineWidth = .8 * px; c.stroke();
    }
    c.restore();
  }
  // A small four-point star in local units (sprites only).
  function starPathLocal(c, x, y, s) { c.moveTo(x, y - s); c.quadraticCurveTo(x + s * .16, y - s * .13, x + s, y); c.quadraticCurveTo(x + s * .15, y + s * .14, x, y + s); c.quadraticCurveTo(x - s * .16, y + s * .14, x - s, y); c.quadraticCurveTo(x - s * .14, y - s * .15, x, y - s); c.closePath(); }
  // Her flower for the teleport swoop: three layers of five blades round her face disk, with her singing face.
  function paintEmberSwoop(c, r) {
    c.save(); c.lineJoin = 'round';
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + layer * .43, len = r * (1.2 - layer * .23), wid = r * (.52 - layer * .08);
      c.save(); c.rotate(a); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(wid, -len * .45, 0, -len); c.quadraticCurveTo(-wid, -len * .45, 0, 0); c.closePath();
      c.fillStyle = EMB.petals[layer === 1 ? 1 : layer === 2 ? 2 : 0]; c.fill(); c.strokeStyle = EMB.petalInk; c.lineWidth = 1.2; c.stroke(); c.restore();
    }
    c.beginPath(); c.arc(0, r * .08, r * .52, 0, TAU); c.fillStyle = EMB.face; c.fill(); c.strokeStyle = '#db8960'; c.lineWidth = 1; c.stroke();
    c.restore();
    c.save(); c.translate(0, r * .05); paintEmberFace(c, r, 1, 'sing', 0); c.restore();
  }
  // A fire ring: twelve flame tongues round a dark hole with a plum rim.
  function paintEmberRing(c, r) {
    c.beginPath(); c.arc(0, 0, r * .98, 0, TAU); c.fillStyle = EMB.poppy; c.fill(); c.strokeStyle = EMB.ink; c.lineWidth = .9; c.stroke();
    for (let i = 0; i < 12; i++) { c.save(); c.rotate(i * TAU / 12 + (i % 2 ? .1 : 0)); embFlame(c, 0, -r * .74, r * (i % 2 ? .24 : .3), r * (i % 2 ? .5 : .66), (i % 2 ? .07 : -.07) * r, .9); c.restore(); }
    c.beginPath(); c.arc(0, 0, r * .86, 0, TAU); c.strokeStyle = EMB.gold; c.lineWidth = 2.4; c.stroke();
    c.beginPath(); c.arc(0, 0, r * .78, 0, TAU); c.fillStyle = EMB.hole; c.fill(); c.strokeStyle = EMB.dark; c.lineWidth = 2.6; c.stroke();
    c.beginPath(); c.arc(0, 0, r * .62, 0, TAU); c.strokeStyle = 'rgba(255,150,82,.45)'; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(0, 0, r * .8 + 1.6, 0, TAU); c.strokeStyle = EMB.ink; c.lineWidth = .9; c.stroke();
  }
  function paintEmberChevron(c, up) {
    c.lineCap = 'round'; c.lineJoin = 'round'; const k = up ? -1 : 1;
    for (const [color, width] of [['#fff6ce', 4.4], [EMB.dark, 2.2]]) { c.beginPath(); c.moveTo(-5, -k * 2.5); c.lineTo(0, k * 2.5); c.lineTo(5, -k * 2.5); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  }
  // A cinder: a plum coal-seed with a poppy rim and a gold glint, three flame licks on top (two frames).
  function paintEmberCinder(c, r, frame) {
    c.lineJoin = 'round';
    for (const [x, h, lean] of frame ? [[-r * .5, r * .85, -1.5], [r * .5, r * 1, 1.6], [0, r * 1.4, .8]] : [[-r * .5, r * 1, -.8], [r * .5, r * .85, 1.4], [0, r * 1.3, -1.2]]) embFlame(c, x, -r * .5, r * .32, h, lean, .8);
    c.beginPath(); c.ellipse(0, 0, r, r * .92, 0, 0, TAU); c.fillStyle = '#93365c'; c.fill(); c.strokeStyle = EMB.poppy; c.lineWidth = 2.2; c.stroke();
    c.beginPath(); c.moveTo(-r * .35, r * .1); c.lineTo(-r * .05, -r * .1); c.lineTo(r * .2, r * .2); c.moveTo(-r * .05, -r * .1); c.lineTo(r * .05, -r * .45);
    c.strokeStyle = EMB.gold; c.lineWidth = 1.6; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.ellipse(-r * .4, -r * .38, r * .22, r * .12, -.6, 0, TAU); c.fillStyle = 'rgba(255,241,186,.75)'; c.fill();
    c.beginPath(); c.ellipse(0, 0, r + 1, r * .92 + 1, 0, 0, TAU); c.strokeStyle = EMB.ink; c.lineWidth = .8; c.stroke();
  }
  // A coal on the floor, as long as its collider (26 + two 6 px caps): charcoal with ash, and its glowing cracks apart.
  function paintEmberCoal(c, cracks) {
    const pill = () => { c.beginPath(); c.moveTo(-13, -6); c.lineTo(13, -6); c.arc(13, 0, 6, -Math.PI / 2, Math.PI / 2); c.lineTo(-13, 6); c.arc(-13, 0, 6, Math.PI / 2, Math.PI * 1.5); c.closePath(); };
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (!cracks) {
      pill(); c.fillStyle = EMB.coal; c.fill(); c.save(); c.clip();
      c.beginPath(); c.ellipse(-4, -4, 14, 3, 0, 0, TAU); c.fillStyle = EMB.ash; c.fill();
      for (const [x, y] of [[-11, 2], [3, 3], [12, -1]]) { c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fillStyle = '#52403c'; c.fill(); }
      // Still hot underneath: a poppy glow along its belly, so it reads as a live coal on the dark floor.
      c.beginPath(); c.ellipse(0, 6.5, 17, 3.2, 0, 0, TAU); c.fillStyle = 'rgba(255,116,51,.6)'; c.fill();
      c.restore(); pill(); c.strokeStyle = '#231817'; c.lineWidth = 1.4; c.stroke(); return;
    }
    for (const [color, width] of [['rgba(255,150,82,.6)', 4.2], ['#ffb04a', 2], ['#fff0a0', .9]]) {
      c.beginPath(); c.moveTo(-15, 1); c.lineTo(-8, -1); c.lineTo(-3, 2); c.lineTo(4, -2); c.lineTo(9, 1); c.lineTo(15, -1); c.moveTo(-3, 2); c.lineTo(-1, 5); c.moveTo(4, -2); c.lineTo(6, -5);
      c.strokeStyle = color; c.lineWidth = width; c.stroke();
    }
  }
  // A castanet: two plum shells hinged on a gold string, opening to the right.
  function paintEmberCastanet(c) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [y, a] of [[-2.2, -.22], [2.2, .22]]) { c.save(); c.translate(-1, y); c.rotate(a); c.beginPath(); c.ellipse(1.5, 0, 5.2, 3.3, 0, 0, TAU); c.fillStyle = EMB.dark; c.fill(); c.strokeStyle = EMB.ink; c.lineWidth = 1.2; c.stroke(); c.beginPath(); c.ellipse(.6, -1, 2.4, 1, 0, 0, TAU); c.fillStyle = 'rgba(255,214,190,.6)'; c.fill(); c.restore(); }
    c.beginPath(); c.moveTo(-4.5, 0); c.quadraticCurveTo(-6.5, -3.5, -4, -5.6); c.strokeStyle = EMB.gold; c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.arc(-4.6, 0, 1.4, 0, TAU); c.fillStyle = EMB.gold; c.fill(); c.strokeStyle = EMB.ink; c.lineWidth = .8; c.stroke();
  }
  const EMB_SPRITES = {
    face: (r, tier, look, frame) => [`kit:ember:face:${r}:${tier}:${look}:${frame}`, [-r * .66, -r * 1.12, r * .66, r * .5], c => paintEmberFace(c, r, tier, look, frame)],
    swoop: r => [`kit:ember:swoop:${r}`, [-r * 1.25, -r * 1.25, r * 1.25, r * 1.25], c => paintEmberSwoop(c, r)],
    ring: r => [`kit:ember:ring:${r}`, [-r * 1.5, -r * 1.5, r * 1.5, r * 1.5], c => paintEmberRing(c, r)],
    chevron: up => [`kit:ember:chevron:${up ? 'in' : 'out'}`, [-7.5, -5.5, 7.5, 5.5], c => paintEmberChevron(c, up)],
    cinder: (r, f) => [`kit:ember:cinder:${r}:${f}`, [-r - 3, -r * 2.1, r + 3, r + 3], c => paintEmberCinder(c, r, f)],
    coal: cracks => [`kit:ember:coal:${cracks ? 'cracks' : 'body'}`, [-20, -8, 20, 8], c => paintEmberCoal(c, cracks)],
    castanet: () => ['kit:ember:castanet', [-8, -7, 8, 7], paintEmberCastanet]
  };
  const embStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  const embRings = state => (state.gates || []).filter(g => g && g.bossRing && g.kitDrawn && Number.isFinite(g.x) && Number.isFinite(g.y));
  kitLook('ember', {
    warm(kit) {
      const r = 26, jobs = [EMB_SPRITES.swoop(r), EMB_SPRITES.ring(18), EMB_SPRITES.chevron(true), EMB_SPRITES.chevron(false), EMB_SPRITES.cinder(9, 0), EMB_SPRITES.cinder(9, 1),
        EMB_SPRITES.coal(false), EMB_SPRITES.coal(true), EMB_SPRITES.castanet()];
      for (const tier of [0, 1, 2]) for (const look of EMB_LOOKS) for (const frame of tier === 0 && (look === 'calm' || look === 'blink') ? [0, 1] : [0]) jobs.push(EMB_SPRITES.face(r, tier, look, frame));
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
      // Her barrage sows whizzbangs, so their sprites are painted with hers.
      if (LOOKS.whizzbang && LOOKS.whizzbang.warm) LOOKS.whizzbang.warm(kit, 12);
    },
    under(ctx, state, s, time, still, kit) {
      // Coals on the floor: the cracks glow and breathe, and the coal fades out over its last second.
      const clock = Number(s.kitAge) || 0;
      for (const coal of state.bumpers || []) {
        if (!coal || !coal.bossCoal || !Number.isFinite(coal.x) || !Number.isFinite(coal.y)) continue;
        const left = Number.isFinite(coal.kitUntil) ? coal.kitUntil - clock : 4, fade = clamp(left, 0, 1), land = still ? 1 : clamp((clock - (Number(coal.kitAt) || 0)) / .18, 0, 1);
        if (fade <= 0) continue;
        ctx.save(); ctx.globalAlpha *= fade;
        embStamp(ctx, kit, EMB_SPRITES.coal(false), coal.x, coal.y, coal.angle || 0, 1.15 - .15 * land, .7 + .3 * land);
        ctx.globalAlpha *= still ? .9 : .75 + .25 * Math.sin(clock * 4 + coal.x * .1);
        embStamp(ctx, kit, EMB_SPRITES.coal(true), coal.x, coal.y, coal.angle || 0);
        ctx.restore();
      }
    },
    part(ctx, state, s, bud, time, still, kit, quality) {
      if (bud.bossPart !== 'cinder') return false;
      const clock = Number(s.kitAge) || 0, age = clock - (Number(bud.born) || 0), r = Number(bud.r) || 9, ghost = Boolean(bud.ghost) || age < .4;
      const grow = ghost ? .7 + .3 * clamp(age / .4, 0, 1) : 1;
      // A short ember trail above it as it falls.
      if (!ghost && quality === 0) for (let k = 1; k <= 3; k++) {
        ctx.save(); ctx.globalAlpha *= .55 - k * .14; kit.circle(ctx, bud.x + (still ? 0 : Math.sin(time * 9 + k) * 1.2), bud.y - r - 3 - k * 5.5, 2.4 - k * .45, k % 2 ? EMB.poppy : EMB.gold); ctx.restore();
      }
      // Near the bottom, a dashed white ring says: catch me.
      if (!ghost && bud.y > 300) {
        ctx.save(); ctx.globalAlpha *= still ? .85 : .55 + .35 * Math.sin(time * 7); ctx.setLineDash([3.5, 3]); ctx.lineDashOffset = still ? 0 : -time * 10;
        kit.circle(ctx, bud.x, bud.y, r + 5, null, '#ffffff', 1.8); ctx.restore();
      }
      ctx.save(); if (ghost) ctx.globalAlpha *= .55;
      embStamp(ctx, kit, EMB_SPRITES.cinder(r, still ? 0 : Math.floor(clock * 8) % 2), bud.x, bud.y, still ? 0 : Math.sin(time * 5 + r) * .08, grow);
      ctx.restore();
      return true;
    },
    face(ctx, state, s, bud, time, still, kit) {
      if (!bud.boss) return false;
      const r = Number(bud.r) || 26, look = kit.BOSS_LOOKS && kit.BOSS_LOOKS.ember || {}, tier = clamp(Number(s.tier) | 0, 0, 2), mode = s.mode || '';
      const health = (Number(bud.hp) || 0) / Math.max(1, Number(bud.maxHp) || 1);
      // Her face turns with her body (art.js's ember sway, faster in a dive) and shivers when she is nearly beaten.
      let tilt = still ? 0 : Math.sin(time * (mode === 'dive' ? 7 : 3.5)) * (mode === 'dive' ? .18 : .075);
      if (!still && health <= .2) tilt += Math.sin(time * TAU * 6) * .04;
      const w = s.warning, singing = w && w.move === 'stomp' && time < w.until, hurt = typeof bud.hitAt === 'number' && time - bud.hitAt >= 0 && time - bud.hitAt < .3;
      const blink = !still && (time + r * .1) % 3.6 < .12;
      const variant = hurt ? 'hurt' : mode === 'ole' ? 'ole' : singing ? 'sing' : blink ? 'blink' : 'calm';
      const frame = tier === 0 && (variant === 'calm' || variant === 'blink') && !still ? Math.floor(time * 6) % 2 : 0;
      ctx.translate(bud.x, bud.y); if (tilt) ctx.rotate(tilt); ctx.translate(r * (look.faceX || 0), r * (look.faceY != null ? look.faceY : .05));
      embStamp(ctx, kit, EMB_SPRITES.face(r, tier, variant, frame), 0, 0);
      return true;
    },
    over(ctx, state, s, time, still, kit, quality) {
      const clock = Number(s.kitAge) || 0, boss = s.boss, live = boss && !boss.bloomed, rings = embRings(state);
      const ringA = rings.find(g => /-ring-a$/.test(g.id)), ringB = rings.find(g => /-ring-b$/.test(g.id));
      // The dotted ember arc that links her rings while they are open.
      if (ringA && ringB) {
        const mx = (ringA.x + ringB.x) / 2, my = (ringA.y + ringB.y) / 2, bend = (ringB.x < ringA.x ? -1 : 1) * 46, pts = [];
        for (let i = 0; i <= 18; i++) { const u = i / 18, cx = mx + bend, cy = my; pts.push([(1 - u) * (1 - u) * ringA.x + 2 * u * (1 - u) * cx + u * u * ringB.x, (1 - u) * (1 - u) * ringA.y + 2 * u * (1 - u) * cy + u * u * ringB.y]); }
        const left = Math.min(...[ringA, ringB].map(g => Number.isFinite(g.kitUntil) ? g.kitUntil - clock : 6));
        ctx.save(); ctx.globalAlpha *= .55 * clamp(left / 1.5, .3, 1); dotted(ctx, pts.slice(2, -2), EMB.base, 1.7, 10, still ? 0 : time * 34); ctx.restore();
      }
      for (const g of rings) {
        const left = Number.isFinite(g.kitUntil) ? g.kitUntil - clock : 6, k = clamp(left / 1.5, 0, 1), born = clamp((clock - (Number(g.kitAt) || 0)) / .2, 0, 1);
        if (left <= 0) continue;
        const scale = (left < 1.5 ? .8 + .2 * k : 1) * (still ? 1 : .4 + .6 * kit.easeBack(born)), r = Number(g.r) || 18;
        ctx.save(); ctx.globalAlpha *= left < 1.5 ? .5 + .5 * k : 1;
        embStamp(ctx, kit, EMB_SPRITES.ring(18), g.x, g.y, still ? 0 : clock * 1.4 * (g === ringB ? -1 : 1), scale * r / 18);
        // Its life, counting down in gold just outside the flames.
        ctx.lineCap = 'round'; const R = r * 1.4 + 3, frac = clamp(left / 6, 0, 1);
        for (const [color, width] of [['rgba(255,246,206,.85)', 3.6], [EMB.gold, 2]]) { ctx.beginPath(); ctx.arc(g.x, g.y, R * scale, -Math.PI / 2, -Math.PI / 2 + frac * TAU); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
        embStamp(ctx, kit, EMB_SPRITES.chevron(g === ringA), g.x, g.y + (still ? 0 : Math.sin(time * 4) * 1.5) * (g === ringA ? -1 : 1), 0, scale);
        ctx.restore();
      }
      // The teleport dive: into ring A, shrinking and spinning, then out of ring B in a gold flash, down to her spot.
      if (boss && s.mode === 'ring' && ringA && ringB) {
        const u = clock - (Number(ringA.kitAt) || 0), from = s.ringFrom || { x: boss.x, y: boss.y }, landY = Number.isFinite(boss.startY) ? boss.startY : 100;
        if (u >= 0 && u < .45) {
          const sprite = EMB_SPRITES.swoop(26);
          if (still) embStamp(ctx, kit, sprite, u < .225 ? ringA.x : ringB.x, u < .225 ? ringA.y : ringB.y, 0, .6);
          else if (u < .25) {
            const k = u / .25, e = k * k, cx = (from.x + ringA.x) / 2, cy = (from.y + ringA.y) / 2 - 40;
            const at = q => ({ x: (1 - q) * (1 - q) * from.x + 2 * q * (1 - q) * cx + q * q * ringA.x, y: (1 - q) * (1 - q) * from.y + 2 * q * (1 - q) * cy + q * q * ringA.y });
            const puffs = quality >= 2 ? 0 : quality === 1 ? 2 : 4;
            for (let j = 1; j <= puffs; j++) { const q = Math.max(0, e - j * .07), p = at(q); ctx.save(); ctx.globalAlpha *= .5 * (1 - j / (puffs + 1)); kit.circle(ctx, p.x, p.y, 10 - j * 1.5, EMB.poppy); ctx.restore(); }
            const p = at(e); embStamp(ctx, kit, sprite, p.x, p.y, e * TAU, 1 - .7 * e);
          } else {
            const k = clamp((u - .25) / .2, 0, 1), e = kit.smooth(k), y = ringB.y + (landY - ringB.y) * e;
            ctx.save(); ctx.globalAlpha *= 1 - k; kit.circle(ctx, ringB.x, ringB.y, 18 + 18 * k, null, EMB.gold, 3.5 * (1 - k) + .5); ctx.restore();
            embStamp(ctx, kit, sprite, ringB.x, y, 0, .3 + .7 * kit.easeBack(k));
          }
        }
      }
      if (!live || boss.hidden) return;
      const r = Number(boss.r) || 26, w = s.warning;
      // Tells, through each warning.
      if (w && Number.isFinite(w.until) && time < w.until) {
        // Counted back from its end: a Lullaby pushes w.until (not w.at), so the count holds with her clock.
        const span = Math.max(.1, Number(root.BloomBosses && root.BloomBosses.telegraph) || 1.3), since = Math.max(0, span - (w.until - time)), p = clamp(since / span, 0, 1);
        const targets = Array.isArray(w.targets) ? w.targets : [];
        if (w.move === 'rings') {
          // Ghost fire rings swell where they will open, and fill their circles as the count runs.
          for (const t of targets.filter(t => t.role === 'ringA' || t.role === 'ringB')) {
            ctx.save(); ctx.globalAlpha *= .25 + .45 * p; embStamp(ctx, kit, EMB_SPRITES.ring(18), t.x, t.y, still ? 0 : time * 1.4, .45 + .45 * p); ctx.restore();
            ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(t.x, t.y, (Number(t.r) || 18) + 3, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.strokeStyle = EMB.poppy; ctx.lineWidth = 2.4; ctx.stroke(); ctx.restore();
            embStamp(ctx, kit, EMB_SPRITES.chevron(t.role === 'ringA'), t.x, t.y, 0, .8);
          }
        } else if (w.move === 'stomp') {
          // The castanet count: they clack at 0, .43 and .86 s, lighting a lamp over her head each time.
          const clicks = [0, .43, .86], lit = clicks.filter(t => since >= t).length;
          for (const side of [-1, 1]) {
            let pulse = 1;
            if (!still) for (const t of clicks) { const q = (since - t) / .12; if (q >= 0 && q < 1) pulse = 1 + .25 * Math.sin(Math.PI * q); }
            embStamp(ctx, kit, EMB_SPRITES.castanet(), boss.x + side * (r + 10), boss.y + 4, side < 0 ? Math.PI : 0, 1.2 * pulse, (side < 0 ? -1.2 : 1.2) * pulse);
          }
          for (let i = 0; i < 3; i++) {
            const x = boss.x + (i - 1) * 14, y = boss.y - r - 12;
            if (i < lit) kit.circle(ctx, x, y, 4.5, EMB.gold, EMB.ink, 1.5); else kit.circle(ctx, x, y, 4.5, 'rgba(115,44,72,.35)', '#fff2b1', 1.5);
          }
          // Where the stomp will stop the flowers.
          const line = (Number(state.dangerY) || 448) - 70;
          ctx.save(); ctx.globalAlpha *= .7; ctx.setLineDash([8, 6]); ctx.lineDashOffset = still ? 0 : -time * 18;
          for (const [color, width] of [['rgba(255,255,255,.55)', 4], [EMB.base, 2]]) { ctx.beginPath(); ctx.moveTo(28, line); ctx.lineTo(392, line); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
          ctx.restore();
          if (quality <= 1) {
            ctx.lineCap = 'round'; ctx.lineJoin = 'round'; let n = 0;
            for (const b of state.buds || []) {
              if (n >= 24 || b.bloomed || b.hidden || b.ghost || b.boss || b.bossPart || b.y >= line - (Number(b.r) || 11)) continue;
              n++; const y = b.y + (Number(b.r) || 11) + 5 + (still ? 0 : 1.5 * Math.sin(time * 8 + b.x * .05));
              for (const [color, width] of [['#fff6ce', 3.4], [EMB.dark, 1.6]]) { ctx.beginPath(); ctx.moveTo(b.x - 3.5, y - 2); ctx.lineTo(b.x, y + 1.5); ctx.lineTo(b.x + 3.5, y - 2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
            }
          }
        } else if (w.move === 'barrage') {
          // The whizzbangs to come, swelling in place, each with a dotted column up to her.
          const body = LOOKS.whizzbang ? WZ_SPRITES.body(12, 'calm') : null;
          labelTell(ctx, w, () => { for (const t of targets.filter(t => t.role === 'whizz')) {
            ctx.save(); ctx.globalAlpha *= .6; dotted(ctx, [[t.x, t.y - 22], [t.x, boss.y + r + 4]], EMB.poppy, 1.8, 8, still ? 0 : -time * 24); ctx.restore();
            if (body) { ctx.save(); ctx.globalAlpha *= .3 + .5 * p; embStamp(ctx, kit, body, t.x, t.y, 0, .55 + .45 * p); ctx.restore(); }
            const tw = still ? 1 : .7 + .3 * Math.sin(time * 14 + t.x);
            kit.sparkle(ctx, t.x + 9, t.y - 18, 4.2 * tw, EMB.gold, still ? 0 : time * 3); kit.circle(ctx, t.x + 9, t.y - 18, 1.2, '#ffffff');
          } });
        }
      }
      // Olé: out of breath, ringed by turning gold stars and a countdown of her opening.
      if (s.mode === 'ole') {
        const left = clamp(((Number(s.modeUntil) || 0) - (Number(s.age) || 0)) / 1.2, 0, 1), spin = still ? 0 : (Number(s.age) || 0) * 2;
        for (let i = 0; i < 6; i++) {
          const a = spin + i * TAU / 6, R = r + 10, tw = still ? 1 : .75 + .25 * Math.sin(time * 9 + i * 2);
          kit.sparkle(ctx, boss.x + Math.cos(a) * R * 1.12, boss.y + Math.sin(a) * R, 4.6 * tw, i % 2 ? '#fff2b1' : EMB.gold, a);
        }
        ctx.lineCap = 'round';
        for (const [color, width] of [['rgba(255,246,206,.9)', 4.4], [EMB.gold, 2.6]]) { ctx.beginPath(); ctx.arc(boss.x, boss.y, r + 20, -Math.PI / 2, -Math.PI / 2 + left * TAU); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
      }
    }
  });

  // ── Geode King (Level 8, `geode`) ──
  // His stone body, amethyst heart and cart stay art.js's own; the kit gives him a face for each mood, a brass miner's
  // lantern swinging off his crown, and every piece of his moves. Proud: half-lidded and chin up over a curled crystal
  // moustache. Grumbly: brows knit into a V, moustache drooping, a frown, three grumble dots over his crown. Magnetic:
  // wide sky eyes with star pupils, a sky jewel and lantern, a cool aura; he hums "O" while his heart pulls. Every
  // heave (s.rise) puffs his cheeks and kicks dust off the cart wheels. Tells sit on top of the shared footprints:
  // dotted arcs to each toss mark (the fool's gold mark carries a little brass cube, the real ones a gem), the dotted
  // arc and a pulsing ring at the shoulder a gem is lobbed at, and the magnet's needle fading in with chevrons on the
  // gems he will pull. Flights spin along their arcs over a landing shadow; fool's gold is a brassy striated cube with a
  // sly wink; a lobbed gem carries its countdown ring at the shoulder and a dashed catch ring once it is low; a burr is a
  // stone bar studded with amethyst spikes that shows its time left. While his heart pulls: a dashed sky ring, the
  // jaw wedge round a spinning needle on his rim, iron caps riveted on his plates and gold sparkles at the gaps.
  const GEO = { ink: '#453849', face: '#d4a2f0', lid: '#b47fdc', lilac: '#f2cdff', lilacDark: '#7751b2', eye: '#6258ab', cheek: '#ff9fb6',
    brass: '#d9a93a', brassLight: '#f6dc84', brassDark: '#8d764f', brassInk: '#5e4718', iron: '#7c8696', ironLight: '#b3bccb', ironDark: '#545d6c',
    ironInk: '#30353f', sky: '#9fd3ff', skyDeep: '#2f7fd0', dirt: '#8c6a47', dirtLight: '#c49a6c', dirtDark: '#5a4029', gold: '#ffd148',
    moods: ['proud', 'grumbly', 'magnetic'], lob: 72, toss: 46, lift: .8, burrLife: 6, tipX: .69, tipY: -1.22, blink: 3.4 };
  const GEO_GEMS = { coral: ['#ff7aa2', '#ffc6d6', '#a5305a'], gold: ['#ffc94a', '#fff2b0', '#9a6516'], lilac: ['#a77cff', '#e0ceff', '#57359f'] };
  const GEO_TOSS = ['sky', 'coral', 'lilac', 'poppy'];
  const GEO_FACES = ['proud', 'proud-blink', 'proud-heave', 'grumbly', 'grumbly-blink', 'grumbly-heave', 'magnetic', 'magnetic-blink', 'magnetic-hum', 'magnetic-heave', 'hurt'];
  // A face, centred where art.js puts the guardian's face (r * faceY below his middle), inside his amethyst disc.
  function paintGeodeFace(c, r, variant) {
    const G = GEO, [mood, look] = variant.split('-'), u = r / 26;
    c.lineCap = 'round'; c.lineJoin = 'round';
    const line = (w, color = G.ink) => { c.lineWidth = w * u; c.strokeStyle = color; c.stroke(); };
    // The forehead jewel (sky and glinting while Magnetic).
    const magnetic = mood === 'magnetic';
    c.beginPath(); c.moveTo(0, -r * .45); c.lineTo(r * .1, -r * .33); c.lineTo(0, -r * .21); c.lineTo(-r * .1, -r * .33); c.closePath();
    c.fillStyle = magnetic ? G.sky : '#e4d7eb'; c.fill(); line(1.1, magnetic ? G.skyDeep : '#65586f');
    c.beginPath(); c.moveTo(0, -r * .45); c.lineTo(r * .1, -r * .33); c.lineTo(0, -r * .33); c.closePath(); c.fillStyle = magnetic ? '#e6f7ff' : '#ffffff'; c.globalAlpha = .7; c.fill(); c.globalAlpha = 1;
    // Cheeks, puffed and bright on a heave.
    const heave = look === 'heave';
    c.globalAlpha = heave ? .95 : .6;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * r * .32, r * .12, r * (heave ? .11 : .085), r * (heave ? .085 : .055), 0, 0, TAU); c.fillStyle = G.cheek; c.fill(); }
    c.globalAlpha = 1;
    const ex = r * .2, ey = -r * .03;
    // Eyes.
    if (variant === 'hurt' || heave) {
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * (ex + r * .09), ey - r * .08); c.lineTo(s * (ex - r * .06), ey); c.lineTo(s * (ex + r * .09), ey + r * .08); line(2); }
    } else if (look === 'blink') {
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * ex, ey - r * .03, r * .1, .2 * Math.PI, .8 * Math.PI); line(1.8); }
    } else {
      const ry = mood === 'grumbly' ? .085 : mood === 'magnetic' ? .135 : .12, rx = mood === 'magnetic' ? .13 : .115;
      for (const s of [-1, 1]) {
        c.beginPath(); c.ellipse(s * ex, ey, r * rx, r * ry, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); line(1.2);
        if (magnetic) {
          c.beginPath(); c.arc(s * ex, ey + r * .01, r * .085, 0, TAU); c.fillStyle = '#5fb6ff'; c.fill(); line(.8, G.skyDeep);
          c.save(); c.translate(s * ex, ey + r * .01); c.beginPath();
          for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 - Math.PI / 2, q = k % 2 ? r * .018 : r * .06; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
          c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.restore();
        } else {
          const py = mood === 'proud' ? ey + r * .04 : ey + r * .01;
          c.beginPath(); c.arc(s * ex, py, r * .055, 0, TAU); c.fillStyle = G.eye; c.fill();
          c.beginPath(); c.arc(s * ex - r * .02, py - r * .025, r * .02, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
        }
        if (mood === 'proud') {
          // Heavy lids, half down: he is very pleased with himself.
          c.save(); c.beginPath(); c.ellipse(s * ex, ey, r * rx, r * ry, 0, 0, TAU); c.clip();
          c.fillStyle = G.lid; c.fillRect(s * ex - r * .14, ey - r * .15, r * .28, r * .14); c.restore();
          c.beginPath(); c.moveTo(s * ex - r * rx, ey - r * .01); c.lineTo(s * ex + r * rx, ey - r * .01); line(1.3);
        }
      }
    }
    // Brows: arched high (proud), a hard V (grumbly), level and set (magnetic).
    for (const s of [-1, 1]) {
      c.beginPath();
      if (mood === 'proud') { c.moveTo(s * r * .09, -r * .18); c.quadraticCurveTo(s * r * .2, -r * .3, s * r * .33, -r * .2); line(1.8); }
      else if (mood === 'grumbly') { c.moveTo(s * r * .07, -r * .12); c.lineTo(s * r * .34, -r * .24); line(2.6); }
      else { c.moveTo(s * r * .08, -r * .2); c.lineTo(s * r * .33, -r * .24); line(2); }
    }
    // The crystal moustache: curled up (proud), drooping (grumbly), bristling straight out (magnetic).
    const tip = mood === 'proud' ? -1 : mood === 'grumbly' ? 1 : 0;
    const stache = () => {
      c.beginPath();
      for (const s of [-1, 1]) {
        c.moveTo(s * r * .02, r * .13);
        c.quadraticCurveTo(s * r * .13, r * .2, s * r * .23, r * (.15 + tip * .02));
        c.quadraticCurveTo(s * r * .29, r * (.12 + tip * .06), s * r * .26, r * (.08 + tip * .11));
      }
    };
    stache(); line(3.8); stache(); line(2, G.lilac);
    c.beginPath(); c.arc(0, r * .125, r * .03, 0, TAU); c.fillStyle = G.lilacDark; c.fill();
    // Mouth, under the moustache.
    c.beginPath();
    if (variant === 'hurt') { c.moveTo(-r * .08, r * .29); c.quadraticCurveTo(-r * .04, r * .25, 0, r * .29); c.quadraticCurveTo(r * .04, r * .33, r * .08, r * .29); line(1.5); }
    else if (heave) { c.moveTo(-r * .07, r * .28); c.lineTo(r * .07, r * .28); line(1.8); }
    else if (look === 'hum') { c.ellipse(0, r * .3, r * .055, r * .07, 0, 0, TAU); c.fillStyle = G.ink; c.fill(); c.beginPath(); c.ellipse(0, r * .315, r * .03, r * .032, 0, 0, TAU); c.fillStyle = G.sky; c.fill(); }
    else if (mood === 'grumbly') { c.arc(0, r * .35, r * .08, 1.2 * Math.PI, 1.8 * Math.PI); line(1.6); }
    else { c.arc(0, r * .22, r * .07, .25 * Math.PI, .75 * Math.PI); line(1.5); }
  }
  // The miner's lantern, hanging from its bail at (0, 0): brass cap and base, glass glowing gold (sky when Magnetic).
  function paintGeodeLantern(c, glass) {
    const G = GEO, sky = glass === 'sky';
    const rr = (x, y, w, h, q) => { c.beginPath(); c.moveTo(x + q, y); c.arcTo(x + w, y, x + w, y + h, q); c.arcTo(x + w, y + h, x, y + h, q); c.arcTo(x, y + h, x, y, q); c.arcTo(x, y, x + w, y, q); c.closePath(); };
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.arc(0, 2.2, 2.3, Math.PI * 1.1, Math.PI * 1.9); c.lineWidth = 1.1; c.strokeStyle = G.brassInk; c.stroke();
    c.beginPath(); c.moveTo(-3.6, 4.4); c.lineTo(-2.4, 2.4); c.lineTo(2.4, 2.4); c.lineTo(3.6, 4.4); c.closePath(); c.fillStyle = G.brass; c.fill(); c.lineWidth = .9; c.stroke();
    rr(-3.2, 4.4, 6.4, 6.6, 1.6); c.fillStyle = sky ? G.sky : '#ffd76a'; c.fill(); c.stroke();
    rr(-2, 5.2, 2.4, 4.6, 1); c.fillStyle = sky ? '#e6f7ff' : '#fff4c2'; c.fill();
    c.beginPath(); c.moveTo(0, 4.6); c.lineTo(0, 10.8); c.lineWidth = .7; c.strokeStyle = G.brassDark; c.stroke();
    rr(-3.9, 10.8, 7.8, 1.9, .8); c.fillStyle = G.brass; c.fill(); c.lineWidth = .9; c.strokeStyle = G.brassInk; c.stroke();
    c.beginPath(); c.moveTo(-2.7, 3.2); c.lineTo(-1, 3.2); c.lineWidth = .6; c.strokeStyle = G.brassLight; c.stroke();
  }
  function paintGeodeGlow(c, rgb, R) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(${rgb},.75)`); g.addColorStop(.45, `rgba(${rgb},.3)`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = g; c.fill();
  }
  // Fool's gold: a chunky brass cube, striated like real pyrite, with a sly wink.
  function paintGeodePyrite(c, face = true) {
    const G = GEO;
    c.lineJoin = 'round'; c.lineCap = 'round';
    const poly = (pts, fill) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = fill; c.fill(); };
    const outline = [[-8.5, -5.5], [-5, -9], [8.5, -9], [8.5, 4], [5, 7.5], [-8.5, 7.5]];
    c.beginPath(); outline.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.lineWidth = 3.2; c.strokeStyle = '#fff3d0'; c.stroke();
    poly([[-8.5, -5.5], [-5, -9], [8.5, -9], [5, -5.5]], G.brassLight);
    poly([[5, -5.5], [8.5, -9], [8.5, 4], [5, 7.5]], '#a8812e');
    poly([[-8.5, -5.5], [5, -5.5], [5, 7.5], [-8.5, 7.5]], G.brass);
    // Striations across each face.
    c.lineWidth = .6; c.strokeStyle = G.brassDark; c.globalAlpha = .55;
    for (const y of [-2.5, 4.6]) { c.beginPath(); c.moveTo(-7.6, y); c.lineTo(4.2, y); c.stroke(); }
    for (const k of [.35, .7]) { c.beginPath(); c.moveTo(-8.5 + 3.5 * k + 1, -5.5 - 3.5 * k); c.lineTo(5 + 3.5 * k - 1, -5.5 - 3.5 * k); c.stroke(); }
    for (const k of [.35, .7]) { c.beginPath(); c.moveTo(5 + 3.5 * k, -5.5 - 3.5 * k + 1.2); c.lineTo(5 + 3.5 * k, 7.5 - 3.5 * k - 1.2); c.stroke(); }
    c.globalAlpha = 1;
    c.beginPath(); outline.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.lineWidth = 1.3; c.strokeStyle = G.brassInk; c.stroke();
    c.beginPath(); c.moveTo(-8.5, -5.5); c.lineTo(5, -5.5); c.lineTo(8.5, -9); c.moveTo(5, -5.5); c.lineTo(5, 7.5); c.lineWidth = .8; c.stroke();
    if (!face) return;
    // A wink, a cocked brow and a smirk: he knows he is not a real gem.
    c.beginPath(); c.arc(-4.4, .4, 1.5, 1.15 * Math.PI, 1.85 * Math.PI); c.lineWidth = 1.2; c.strokeStyle = G.brassInk; c.stroke();
    c.beginPath(); c.arc(1, .2, 1.2, 0, TAU); c.fillStyle = G.brassInk; c.fill();
    c.beginPath(); c.arc(.6, -.2, .4, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    c.beginPath(); c.moveTo(-.6, -2.6); c.quadraticCurveTo(1.2, -3.6, 2.8, -2.4); c.lineWidth = 1; c.strokeStyle = G.brassInk; c.stroke();
    c.beginPath(); c.moveTo(-4, 3.6); c.quadraticCurveTo(-.8, 5, 2.4, 2.8); c.lineWidth = 1.1; c.stroke();
    c.beginPath(); c.ellipse(-5.6, 3, 1.3, .8, 0, 0, TAU); c.fillStyle = '#f39a7c'; c.globalAlpha = .7; c.fill(); c.globalAlpha = 1;
  }
  // A real gem in flight, cut like art.js's loose gems (the same three colors).
  function paintGeodeGem(c, col, r) {
    const [base, light, ink] = GEO_GEMS[col] || GEO_GEMS.coral, pts = [[0, -r * 1.05], [r * .9, -r * .38], [r * .62, r * .62], [0, r * 1.05], [-r * .62, r * .62], [-r * .9, -r * .38]];
    const path = () => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); };
    c.lineJoin = 'round';
    path(); c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.globalAlpha = .8; c.stroke(); c.globalAlpha = 1; c.fillStyle = base; c.fill();
    c.beginPath(); c.moveTo(-r * .9, -r * .38); c.lineTo(0, -r * 1.05); c.lineTo(r * .9, -r * .38); c.lineTo(r * .36, -r * .1); c.lineTo(-r * .36, -r * .1); c.closePath(); c.fillStyle = light; c.fill();
    c.beginPath(); c.moveTo(r * .36, -r * .1); c.lineTo(r * .9, -r * .38); c.lineTo(r * .62, r * .62); c.lineTo(0, r * 1.05); c.closePath(); c.fillStyle = 'rgba(40,20,60,.2)'; c.fill();
    path(); c.lineWidth = 1.4; c.strokeStyle = ink; c.stroke();
    c.beginPath(); c.arc(-r * .34, -r * .52, 1.3, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
  }
  // The lobbed gem: a round brilliant in its flower's colors, an octagon with a table and lit facets.
  function paintGeodeLobGem(c, F, r) {
    const R = r + 1, T = R * .5, oct = (q, off = 0) => Array.from({ length: 8 }, (_, k) => { const a = k * Math.PI / 4 + Math.PI / 8 + off; return [Math.cos(a) * q, Math.sin(a) * q]; });
    const o = oct(R), t = oct(T);
    c.lineJoin = 'round';
    c.beginPath(); o.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.lineWidth = 3.4; c.strokeStyle = '#ffffff'; c.stroke();
    const tones = [F.dark, F.base, F.light, F.tip, F.light, F.base, F.dark, F.dark];
    for (let k = 0; k < 8; k++) {
      const a = o[k], b = o[(k + 1) % 8], p = t[(k + 1) % 8], q = t[k];
      c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...p); c.lineTo(...q); c.closePath(); c.fillStyle = tones[k]; c.fill();
    }
    c.beginPath(); t.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = F.base; c.fill(); c.lineWidth = .7; c.strokeStyle = F.dark; c.stroke();
    c.beginPath(); c.moveTo(...t[5]); c.lineTo(...t[6]); c.lineTo(...t[0]); c.closePath(); c.fillStyle = 'rgba(255,255,255,.45)'; c.fill();
    c.globalAlpha = .5; c.lineWidth = .6;
    for (let k = 0; k < 8; k++) { c.beginPath(); c.moveTo(...o[k]); c.lineTo(...t[k]); c.stroke(); }
    c.globalAlpha = 1;
    c.beginPath(); o.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.lineWidth = 1.4; c.strokeStyle = F.dark; c.stroke();
    c.beginPath(); c.arc(-T * .5, -T * .7, 1.3, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
  }
  // A burr: a 30 px bar of brown stone studded with amethyst spikes on both sides.
  function paintGeodeBurr(c, length) {
    const G = GEO, h = length / 2;
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const x = -h + 3 + i * (length - 6) / 4, side = i % 2 ? 1 : -1, tipX = x + side * 1.5, tipY = side * 12;
      c.beginPath(); c.moveTo(x - 3.8, 0); c.lineTo(tipX, tipY); c.lineTo(x + 3.8, 0); c.closePath(); c.fillStyle = '#b77eee'; c.fill(); c.lineWidth = 1; c.strokeStyle = G.lilacDark; c.stroke();
      c.beginPath(); c.moveTo(x - 1.6, side * 1); c.lineTo(tipX, tipY - side * 1.2); c.lineTo(x, side * 1); c.closePath(); c.fillStyle = G.lilac; c.fill();
    }
    c.beginPath(); c.moveTo(-h, -1); c.quadraticCurveTo(-h, -4.4, -h + 4, -4.2); c.quadraticCurveTo(0, -5.4, h - 4, -4); c.quadraticCurveTo(h + .5, -3.6, h, 0);
    c.quadraticCurveTo(h + .4, 4, h - 4, 4.2); c.quadraticCurveTo(0, 5.2, -h + 4, 4.3); c.quadraticCurveTo(-h - .4, 3.8, -h, -1); c.closePath();
    c.lineWidth = 3; c.strokeStyle = '#fff3d0'; c.stroke(); c.fillStyle = G.dirt; c.fill(); c.lineWidth = 1.3; c.strokeStyle = G.dirtDark; c.stroke();
    c.beginPath(); c.moveTo(-h + 4, -2.4); c.quadraticCurveTo(0, -3.4, h - 5, -2.2); c.lineWidth = 1.2; c.strokeStyle = G.dirtLight; c.stroke();
    for (const [x, y] of [[-8, 1.5], [3, 2], [9, .5]]) { c.beginPath(); c.arc(x, y, .8, 0, TAU); c.fillStyle = G.dirtDark; c.fill(); }
  }
  // An iron cap over a plate (the plate's own outline, steel blue, three rivets) while his heart pulls.
  function paintGeodeIron(c, r) {
    const G = GEO, p = pts => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x * r, y * r) : c.moveTo(x * r, y * r)); c.closePath(); };
    const shape = [[-.83, -.47], [-.44, -.94], [.53, -.74], [.93, -.1], [.57, .81], [-.52, .83], [-.96, .13]];
    c.lineJoin = 'round';
    p(shape); c.fillStyle = G.iron; c.fill();
    p([[-.83, -.47], [-.44, -.94], [.17, -.58], [-.06, .06], [-.88, .12]]); c.fillStyle = G.ironLight; c.fill();
    p([[.53, -.74], [.93, -.1], [.57, .81], [.13, .35]]); c.fillStyle = G.ironDark; c.fill();
    c.beginPath(); c.moveTo(-.6 * r, -.5 * r); c.lineTo(-.2 * r, -.78 * r); c.lineWidth = 1.2; c.strokeStyle = '#e6f2ff'; c.globalAlpha = .8; c.stroke(); c.globalAlpha = 1;
    // An iron strap across it, riveted at both ends, and a sky sheen of magnetism on its lit face.
    c.save(); p(shape); c.clip();
    c.beginPath(); c.moveTo(-r, .02 * r); c.lineTo(r, -.18 * r); c.lineTo(r, .14 * r); c.lineTo(-r, .34 * r); c.closePath(); c.fillStyle = G.ironDark; c.fill();
    c.beginPath(); c.moveTo(-r, .02 * r); c.lineTo(r, -.18 * r); c.lineWidth = .9; c.strokeStyle = G.ironLight; c.stroke();
    c.restore();
    c.beginPath(); c.moveTo(-.55 * r, -.62 * r); c.quadraticCurveTo(-.2 * r, -.82 * r, .2 * r, -.66 * r); c.lineWidth = 1.1; c.strokeStyle = GEO.sky; c.globalAlpha = .9; c.stroke(); c.globalAlpha = 1;
    p(shape); c.lineWidth = 1.5; c.strokeStyle = G.ironInk; c.stroke();
    for (const [x, y] of [[-.62, .17], [.6, -.02]]) { c.beginPath(); c.arc(x * r, y * r, 1.5, 0, TAU); c.fillStyle = G.ironLight; c.fill(); c.lineWidth = .8; c.strokeStyle = G.ironInk; c.stroke(); c.beginPath(); c.arc(x * r - .45, y * r - .45, .45, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); }
  }
  // A little grumble cloud with a scribble in it, over his crown while Grumbly.
  function paintGeodeGrumble(c) {
    const G = GEO, puffs = [[-5, 1, 3.6], [0, -1.6, 4.4], [5, 1, 3.6], [0, 2.4, 3.4]];
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [x, y, q] of puffs) { c.beginPath(); c.arc(x, y, q + 1.3, 0, TAU); c.fillStyle = G.ink; c.fill(); }
    for (const [x, y, q] of puffs) { c.beginPath(); c.arc(x, y, q, 0, TAU); c.fillStyle = '#e4d7eb'; c.fill(); }
    c.beginPath(); c.moveTo(-5.2, 1.4); c.lineTo(-2.8, -1.6); c.lineTo(-1, 1.6); c.lineTo(1, -1.8); c.lineTo(2.8, 1.6); c.lineTo(5, -1);
    c.lineWidth = 1.2; c.strokeStyle = G.ink; c.stroke();
  }
  // The Magnet Heart's needle, pointing along +x from his rim.
  function paintGeodeNeedle(c) {
    c.lineJoin = 'round';
    const sliver = () => { c.beginPath(); c.moveTo(-5, 0); c.lineTo(4, -3.4); c.lineTo(19, 0); c.lineTo(4, 3.4); c.closePath(); };
    sliver(); c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.stroke(); c.fillStyle = '#fff6cf'; c.fill();
    c.beginPath(); c.moveTo(4, -3.4); c.lineTo(19, 0); c.lineTo(4, 0); c.closePath(); c.fillStyle = '#8ed2ff'; c.fill();
    c.beginPath(); c.moveTo(-5, 0); c.lineTo(4, -3.4); c.lineTo(4, 3.4); c.closePath(); c.fillStyle = '#9aa3b3'; c.fill();
    sliver(); c.lineWidth = 1.1; c.strokeStyle = '#1d6ad6'; c.stroke();
    c.beginPath(); c.arc(4, 0, 1.5, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = .8; c.stroke();
  }
  const GEO_SPRITES = {
    face: (r, v) => [`kit:geode:face:${r}:${v}`, [-r * .55, -r * .55, r * .55, r * .5], c => paintGeodeFace(c, r, v)],
    lantern: glass => [`kit:geode:lantern:${glass}`, [-5, -1, 5, 14], c => paintGeodeLantern(c, glass)],
    glow: (rgb, R) => [`kit:geode:glow:${rgb}:${R}`, [-R, -R, R, R], c => paintGeodeGlow(c, rgb, R)],
    pyrite: (face = true) => [`kit:geode:pyrite:${face ? 'face' : 'plain'}`, [-11, -11, 11, 10], c => paintGeodePyrite(c, face)],
    gem: col => [`kit:geode:gem:${col}`, [-12, -12, 12, 12], c => paintGeodeGem(c, col, 10)],
    lobgem: (kit, type) => [`kit:geode:lobgem:${type}`, [-14, -14, 14, 14], c => paintGeodeLobGem(c, kit.FLOWERS[type] || kit.FLOWERS.sky, 10)],
    burr: length => [`kit:geode:burr:${length}`, [-length / 2 - 3, -13, length / 2 + 3, 13], c => paintGeodeBurr(c, length)],
    iron: r => [`kit:geode:iron:${r}`, [-r - 2, -r - 2, r + 2, r + 2], c => paintGeodeIron(c, r)],
    needle: () => ['kit:geode:needle', [-7, -5, 21, 5], paintGeodeNeedle],
    grumble: () => ['kit:geode:grumble', [-11, -9, 11, 8], paintGeodeGrumble]
  };
  const GEO_SKY = '159,211,255', GEO_WARM = '255,214,110';
  const geoStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  const geoGemCol = type => (GEO_GEMS[type] ? type : 'coral');
  // A toss flight's color: the landed gem's own (bosses.js picks GEO_TOSS[i % 4] by its place in the toss).
  function geodeFlightCol(s, l) { const same = s.lobs.filter(q => q.t0 === l.t0); return geoGemCol(GEO_TOSS[Math.max(0, same.indexOf(l)) % 4]); }
  const geoArc = (x0, y0, x1, y1, h, from = 0, n = 12) => Array.from({ length: n + 1 }, (_, k) => { const at = lobAt(x0, y0, x1, y1, 1, from + (1 - from) * k / n, h); return [at.x, at.y]; });
  // A tell's arc from his middle, dotted only once it has left his body (so it never crosses his face).
  const geoTellArc = (boss, x1, y1, h, r) => { const pts = geoArc(boss.x, boss.y, x1, y1, h, 0, 24), k = pts.findIndex(([x, y]) => Math.hypot(x - boss.x, y - boss.y) > r + 4); return pts.slice(Math.max(0, k)); };
  // The needle of his Magnet Heart (the rules' own closed form: mid + spin * t on the kit clock).
  const geodeNeedle = (m, clock) => m.mid + m.spin * clamp(clock - m.t0, 0, m.until);
  function drawGeodeLantern(ctx, kit, s, bud, time, still, quality) {
    const r = Number(bud.r) || 26, sky = (s.tier | 0) >= 2, swing = still ? 0 : .2 * Math.sin((Number(s.age) || 0) * 2);
    const px = bud.x + r * GEO.tipX, py = bud.y + r * GEO.tipY;
    ctx.save(); ctx.translate(px, py); ctx.rotate(swing);
    if (quality <= 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= still ? .55 : .45 + .12 * Math.sin(time * 3.3); geoStamp(ctx, kit, GEO_SPRITES.glow(sky ? GEO_SKY : GEO_WARM, 16), 0, 9.5); ctx.restore(); }
    geoStamp(ctx, kit, GEO_SPRITES.lantern(sky ? 'sky' : 'gold'), 0, 0, 0, 1.25);
    ctx.restore();
  }
  kitLook('geode', {
    warm(kit) {
      const r = 26, jobs = [...GEO_FACES.map(v => GEO_SPRITES.face(r, v)), GEO_SPRITES.lantern('gold'), GEO_SPRITES.lantern('sky'), GEO_SPRITES.glow(GEO_SKY, 16), GEO_SPRITES.glow(GEO_WARM, 16),
        GEO_SPRITES.glow(GEO_SKY, Math.round(r * 1.7)), GEO_SPRITES.pyrite(true), GEO_SPRITES.pyrite(false), ...Object.keys(GEO_GEMS).map(GEO_SPRITES.gem),
        ...['sky', 'coral', 'gold', 'lilac', 'poppy'].map(t => GEO_SPRITES.lobgem(kit, t)), GEO_SPRITES.burr(30), GEO_SPRITES.iron(13), GEO_SPRITES.needle(), GEO_SPRITES.grumble()];
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    under(ctx, state, s, time, still, kit, quality) {
      const boss = s.boss, clock = Number(s.kitAge) || 0;
      // Magnetic: a cool aura behind him, stronger while his heart pulls.
      if (boss && !boss.bloomed && (s.tier | 0) >= 2) {
        const r = Number(boss.r) || 26, on = Boolean(s.magnet);
        ctx.save(); ctx.globalAlpha *= (on ? .75 : .4) * (still ? 1 : .85 + .15 * Math.sin(time * (on ? 5 : 1.8)));
        geoStamp(ctx, kit, GEO_SPRITES.glow(GEO_SKY, Math.round(r * 1.7)), boss.x, boss.y); ctx.restore();
      }
      // Burrs on the shoulders: a fresh one wobbles as it lands; a thin arc counts down its time.
      for (const burr of state.bumpers || []) {
        if (!burr.bossBurr) continue;
        const age = clock - (Number(burr.t0) || 0), left = clamp(((Number(burr.kitUntil) || 0) - clock) / GEO.burrLife, 0, 1);
        const wob = still || age >= .4 ? 0 : Math.sin(age * 20) * .1 * (1 - age / .4), len = Number(burr.length) || 30;
        if (!still && quality <= 1) { ctx.globalAlpha = .25; ctx.beginPath(); ctx.ellipse(burr.x, burr.y + 7, len * .5, 3.5, 0, 0, TAU); ctx.fillStyle = '#1b1024'; ctx.fill(); ctx.globalAlpha = 1; }
        geoStamp(ctx, kit, GEO_SPRITES.burr(len), burr.x, burr.y, (Number(burr.angle) || 0) + wob);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(burr.x, burr.y, len / 2 + 6, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(255,248,220,.7)'; ctx.stroke();
        ctx.lineWidth = 1.6; ctx.strokeStyle = GEO.lilacDark; ctx.stroke();
      }
      // A heave: dust kicks off the cart wheels as he lifts.
      if (boss && s.rise && !still && quality === 0) {
        const r = Number(boss.r) || 26, q = (clock - s.rise.at) / GEO.lift;
        if (q >= 0 && q < 1) {
          ctx.globalAlpha = .55 * (1 - q);
          for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
            const d = side * (r * .77 + (k - 1) * 5 + side * q * 10), y = boss.y + r * 1.42 - q * 6 - k * 1.5;
            kit.circle(ctx, boss.x + d, y, 2.2 + q * 4 + k * .6, '#e9dcd0', null);
          }
          ctx.globalAlpha = 1;
        }
      }
    },
    part(ctx, state, s, bud, time, still, kit, quality) {
      const clock = Number(s.kitAge) || 0;
      if (bud.bossPart === 'pyrite') {
        // Fool's gold eases toward half strength over its last 40 px above the line.
        const line = Number(state.dangerY) || 470, fade = clamp((line - (bud.y + bud.r)) / 40, 0, 1);
        ctx.globalAlpha *= .5 + .5 * fade;
        const bob = still ? 0 : Math.sin(time * 3 + bud.x * .05) * .6;
        geoStamp(ctx, kit, GEO_SPRITES.pyrite(true), bud.x, bud.y + bob);
        // A glint runs along his top edge every 2 s.
        if (!still && quality <= 1) { const g = ((time + bud.x * .01) % 2 + 2) % 2; if (g < .45) kit.sparkle(ctx, bud.x - 6.5 + g / .45 * 14, bud.y + bob - 8.6, 3.2 * Math.sin(g / .45 * Math.PI), '#fffbe6', g * 3); }
        return true;
      }
      if (bud.bossPart !== 'lobgem') return false;
      const T = Number(bud.T) || 2.2, u = clamp((clock - (Number(bud.t0) || 0)) / T, 0, 1), type = kit.FLOWERS[bud.type] ? bud.type : 'sky';
      // Its landing: a shadow growing on the shoulder, a ring that counts down, and the rest of its arc dotted ahead.
      ctx.globalAlpha = .18 + .22 * u; ctx.beginPath(); ctx.ellipse(bud.x1, bud.y1 + 6, 6 + 6 * u, 2.5 + 1.5 * u, 0, 0, TAU); ctx.fillStyle = '#1b1024'; ctx.fill(); ctx.globalAlpha = 1;
      ctx.setLineDash([4, 4]); kit.circle(ctx, bud.x1, bud.y1, 16, null, '#fff6ce', 3.6); kit.circle(ctx, bud.x1, bud.y1, 16, null, '#b55c67', 1.8); ctx.setLineDash([]);
      ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(bud.x1, bud.y1, 20, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - u)); ctx.lineWidth = 2.4; ctx.strokeStyle = GEO.gold; ctx.stroke();
      dotted(ctx, geoArc(Number(bud.x0), Number(bud.y0), Number(bud.x1), Number(bud.y1), Number(bud.h) || GEO.lob, u, 10), kit.FLOWERS[type].dark, 1.6, 8, still ? 0 : time * 30);
      // Low enough to catch: a dashed white catch ring round it.
      if (bud.y > 300) { ctx.setLineDash([3, 3]); kit.circle(ctx, bud.x, bud.y, (bud.r || 10) + 5, null, '#ffffff', 1.6); ctx.setLineDash([]); }
      geoStamp(ctx, kit, GEO_SPRITES.lobgem(kit, type), bud.x, bud.y, still ? 0 : clock * 6);
      return true;
    },
    face(ctx, state, s, bud, time, still, kit, quality) {
      if (!bud.boss) return false;
      const r = Number(bud.r) || 26, tier = clamp(s.tier | 0, 0, 2), clock = Number(s.kitAge) || 0, mood = GEO.moods[tier];
      const health = (Number(bud.hp) || 0) / Math.max(1, Number(bud.maxHp) || 1);
      // His shiver near the end (art.js's own wobble) carries the face, lantern and dots with the body.
      if (!still && health <= .2) { ctx.translate(bud.x, bud.y); ctx.rotate(Math.sin(time * TAU * 6) * .04); ctx.translate(-bud.x, -bud.y); }
      drawGeodeLantern(ctx, kit, s, bud, time, still, quality);
      // Grumbly: three grumble dots puff up over his crown, one after another.
      if (tier === 1) {
        const bob = still ? 0 : Math.sin(time * 3.2), puff = still ? 1 : 1 + .06 * Math.sin(time * 6.4);
        geoStamp(ctx, kit, GEO_SPRITES.grumble(), bud.x - r * .55, bud.y - r * 1.62 - 1.5 * bob, still ? 0 : .08 * bob, puff);
      }
      const hurt = typeof bud.hitAt === 'number' && time - bud.hitAt >= 0 && time - bud.hitAt < .3;
      const heaving = s.rise && clock - s.rise.at >= 0 && clock - s.rise.at < GEO.lift;
      const blink = !still && (time + r * .1) % GEO.blink < .12;
      const variant = hurt ? 'hurt' : heaving && !still ? `${mood}-heave` : tier === 2 && s.magnet ? 'magnetic-hum' : mood + (blink ? '-blink' : '');
      ctx.translate(bud.x, bud.y + r * .05);
      geoStamp(ctx, kit, GEO_SPRITES.face(r, variant), 0, 0);
      return true;
    },
    over(ctx, state, s, time, still, kit, quality) {
      const boss = s.boss, clock = Number(s.kitAge) || 0;
      if (!boss || boss.bloomed) return;
      const r = Number(boss.r) || 26;
      // Toss flights: each piece spins along its arc over a shadow on its landing mark.
      for (const l of s.lobs || []) {
        if (l.look !== 'gem' && l.look !== 'pyrite') continue;
        const at = lobAt(l.x0, l.y0, l.x1, l.y1, l.T, clock - l.t0, l.h || GEO.toss);
        if (at.u >= 1) continue;
        if (quality <= 1) { ctx.globalAlpha = .15 + .2 * at.u; ctx.beginPath(); ctx.ellipse(l.x1, l.y1 + 5, 5 + 5 * at.u, 2 + 1.5 * at.u, 0, 0, TAU); ctx.fillStyle = '#1b1024'; ctx.fill(); ctx.globalAlpha = 1; }
        const turn = still ? 0 : (clock - l.t0) * (l.look === 'pyrite' ? 7 : 9);
        geoStamp(ctx, kit, l.look === 'pyrite' ? GEO_SPRITES.pyrite(false) : GEO_SPRITES.gem(geodeFlightCol(s, l)), at.x, at.y, turn);
      }
      // The Magnet Heart: the ring, the jaw round the needle, iron caps on his plates and sparkles at the gaps.
      const m = s.magnet;
      if (m) {
        const a = geodeNeedle(m, clock), left = m.until - clamp(clock - m.t0, 0, m.until), fade = clamp(left / .6, 0, 1);
        ctx.save(); ctx.globalAlpha *= fade; ctx.lineCap = 'round';
        if (quality <= 1) { ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.arc(m.x, m.y, m.R, a - m.jaw, a + m.jaw); ctx.closePath(); ctx.fillStyle = 'rgba(159,211,255,.13)'; ctx.fill(); }
        ctx.beginPath(); ctx.arc(m.x, m.y, m.R, 0, TAU); ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(230,247,255,.3)'; ctx.stroke();
        ctx.setLineDash([5, 6]); ctx.lineDashOffset = still ? 0 : -time * 14; ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(69,173,255,.75)'; ctx.stroke(); ctx.setLineDash([]);
        for (const e of [a - m.jaw, a + m.jaw]) { ctx.beginPath(); ctx.moveTo(m.x + Math.cos(e) * (r + 8), m.y + Math.sin(e) * (r + 8)); ctx.lineTo(m.x + Math.cos(e) * m.R, m.y + Math.sin(e) * m.R); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(159,211,255,.55)'; ctx.stroke(); }
        if (!still && quality === 0) {
          ctx.strokeStyle = '#e6f7ff'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
          for (const off of [-.85, -.3, .3, .85]) {
            const q = ((time / 1.1 + (off + 1) * .37) % 1 + 1) % 1, d = m.R - 6 - (m.R - r - 16) * q, e = a + off * m.jaw * .8;
            ctx.save(); ctx.globalAlpha *= .75 * Math.sin(q * Math.PI); ctx.translate(m.x + Math.cos(e) * d, m.y + Math.sin(e) * d); ctx.rotate(e + Math.PI);
            ctx.beginPath(); ctx.moveTo(-2.5, -3.4); ctx.lineTo(1.6, 0); ctx.lineTo(-2.5, 3.4); ctx.stroke(); ctx.restore();
          }
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= still ? .6 : .5 + .2 * Math.sin(time * 6);
        geoStamp(ctx, kit, GEO_SPRITES.glow(GEO_SKY, 16), m.x + Math.cos(a) * (r + 10), m.y + Math.sin(a) * (r + 10)); ctx.restore();
        geoStamp(ctx, kit, GEO_SPRITES.needle(), m.x + Math.cos(a) * (r - 3), m.y + Math.sin(a) * (r - 3), a);
        for (const p of s.parts || []) {
          if (p.bossPart !== 'plate') continue;
          if (!p.bloomed) { geoStamp(ctx, kit, GEO_SPRITES.iron(Number(p.r) || 13), p.x, p.y); continue; }
          // A gap: where the broken plate's quarter faces now (the rules' own angle), a gold sparkle to aim a curl at.
          const e = (Number(p.slot) || 0) * Math.PI / 2 + (Number(s.age) || 0) * .18, pulse = still ? 1 : .8 + .3 * Math.sin(time * 7 + p.slot);
          const gx = boss.x + Math.cos(e) * (r + 6), gy = boss.y + Math.sin(e) * (r + 6);
          kit.sparkle(ctx, gx, gy, 7.5 * pulse, '#fff3c4', .2); kit.sparkle(ctx, gx, gy, 5 * pulse, GEO.gold, .2);
        }
        ctx.restore();
      }
      // Tells on top of the shared footprints.
      const w = s.warning;
      if (!w || !Number.isFinite(w.until) || !(time < w.until)) return;
      const span = Math.max(.1, w.until - (Number(w.at) || 0)), prog = clamp(1 - (w.until - time) / span, 0, 1), phase = still ? 0 : time * 24;
      labelTell(ctx, w, () => { for (const t of w.targets || []) {
        if (t.role === 'toss') {
          dotted(ctx, geoTellArc(boss, t.x, t.y, GEO.toss, r), t.pyrite ? GEO.brassDark : GEO.lilacDark, 1.5, 8, phase);
          geoStamp(ctx, kit, t.pyrite ? GEO_SPRITES.pyrite(false) : GEO_SPRITES.gem('lilac'), t.x, t.y, 0, .62);
        } else if (t.role === 'shoulder') {
          dotted(ctx, geoArc(boss.x, boss.y + r, t.x, t.y, GEO.lob), GEO.lilacDark, 1.7, 8, phase);
          const pulse = still ? 0 : Math.sin(time * 8) * 2;
          kit.circle(ctx, t.x, t.y, 21 + pulse, null, 'rgba(255,248,220,.8)', 3.6); kit.circle(ctx, t.x, t.y, 21 + pulse, null, GEO.gold, 1.8);
          geoStamp(ctx, kit, GEO_SPRITES.lobgem(kit, 'lilac'), t.x, t.y, 0, .55);
        } else if (t.role === 'magnet') {
          // The needle fades in, pointing where it will start (straight down).
          ctx.save(); ctx.globalAlpha *= .25 + .75 * prog; geoStamp(ctx, kit, GEO_SPRITES.needle(), boss.x, boss.y + r - 3, Math.PI / 2); ctx.restore();
        } else if (t.role === 'pull') {
          // A gem he will pull: a chevron toward him (pop it during the tell and it stays out of his crust).
          const e = Math.atan2(boss.y - t.y, boss.x - t.x), d = (t.r || 10) + 7 + (still ? 0 : 3 * Math.sin(time * 9));
          ctx.save(); ctx.translate(t.x + Math.cos(e) * d, t.y + Math.sin(e) * d); ctx.rotate(e); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(-3, -4.5); ctx.lineTo(2.5, 0); ctx.lineTo(-3, 4.5);
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = GEO.skyDeep; ctx.stroke(); ctx.restore();
        }
      } });
    }
  });

  // ── Thornmother (Level 9, `briar`) ──
  // A rose guardian in a thorny bell of a skirt. Prickly, she looks down her nose under heavy lids with one brow up and a
  // smirk, a three-thorn tiara on her brow; her Bramble Reel creeps dotted vines out to the flowers it will hook (a dashed
  // hook ring on each), then reels them in on thorny vines that end in a curl round each stem; sap beads run up the vines
  // to her as they drink, and a snipped vine whips back. Smitten, her eyes are hearts: a dashed heart and two ghost roses
  // mark where her Sweetheart Vines will sprout (a heart bubbles over her head), and a pink rose-stem vine feeds her from
  // the pair; a kiss sweeps her off her feet in a column of hearts and petals, swooning (^ ^, a pucker, hearts rising)
  // inside a turning ring of hearts and a gold countdown arc. Wild, she grins with a thorn fang, petals flying off her
  // crown: a lasso loop twirls over her head while a dotted line, a ghost bow and the arch's dashed outline show the
  // throw; then five thorny knots slither down on a vine rope, a friendly leaf-snouted head in front and the coral satin
  // bow, ringed and breathing, second. Untied, the rope drops away; arriving, a bramble arch bursts up across that side
  // of the fan and shrivels at the end. Animations off keeps every tell, ring and arc as a still mark.
  const TM = { base: '#ea65b4', ink: '#623354', eye: '#66547b', lid: '#e98fc0', vine: '#43613b', vineLight: '#a2c77c', thorn: '#648549',
    thornLight: '#dae3a5', satin: '#ff9fc8', sap: '#ffe4bb', sapInk: '#b98d55', stem: '#5d7a46', stemPink: '#ffb9dc', coral: '#fa558b',
    coralDark: '#d32871', bowInk: '#a3285e', cheek: '#ff7fae', heart: '#ff5c93', gold: '#ffd148', goldInk: '#b8861f', knot: '#6f9a4a',
    knotDark: '#2f4a2a', cream: '#f4efc4', mouth: '#6e2450', tongue: '#ff8aa6', tell: '#ff6f9e' };
  // The rules' numbers the art needs (bosses.js THORN; the art keeps no dependency on the rules).
  const TM_SLOTS = [[-46, 30], [0, 44], [46, 30]], TM_TELL = 1.3, TM_LOVE = 2.5, TM_FLOAT = .5, TM_ARCH = 45;
  const TM_LASSO = { knots: 5, gap: 22, speed: 70, wig: 14, w: 4.2, phase: 1.6, R: 118, arch: [36, 58, 80] };
  const TM_LOOKS = ['calm', 'blink', 'hurt', 'swoon'];
  const tmArch = side => TM_LASSO.arch.map(d => { const a = d * Math.PI / 180; return { x: 210 + (side ? 1 : -1) * TM_LASSO.R * Math.cos(a), y: 498 - TM_LASSO.R * Math.sin(a) }; });
  // Where lasso knot k of a rope (born, sx, sy, ux, uy, len) sits at kit time `clock` (bosses.js thornKnot).
  function tmKnotAt(p, k, clock) {
    const L = TM_LASSO, t = Math.max(0, clock - p.born), head = Math.min(p.len, (L.knots - 1) * L.gap + L.speed * t), a = Math.max(0, head - k * L.gap);
    const w = L.wig * Math.sin(L.w * t - k * L.phase) * clamp(a / 40, 0, 1);
    return { x: p.sx + p.ux * a - p.uy * w, y: p.sy + p.uy * a + p.ux * w };
  }
  function tmStroke(c, width, color) { c.lineWidth = width; c.strokeStyle = color; c.stroke(); }
  function tmHeartPath(c, s) {
    c.beginPath(); c.moveTo(0, s * .95); c.bezierCurveTo(-s * 1.25, s * .1, -s * 1.05, -s * 1.05, 0, -s * .45);
    c.bezierCurveTo(s * 1.05, -s * 1.05, s * 1.25, s * .1, 0, s * .95); c.closePath();
  }
  // A vine from a to b that droops under its own weight (a cubic bezier: [ax, ay, c1x, c1y, c2x, c2y, bx, by]).
  function tmVine(ax, ay, bx, by, low = 6) { const droop = clamp(Math.hypot(bx - ax, by - ay) * .22, low, 26); return [ax, ay, ax + (bx - ax) * .2, ay + droop, bx - (bx - ax) * .2, by + droop, bx, by]; }
  function tmAt(v, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    const dx = 3 * u * u * (v[2] - v[0]) + 6 * u * t * (v[4] - v[2]) + 3 * t * t * (v[6] - v[4]), dy = 3 * u * u * (v[3] - v[1]) + 6 * u * t * (v[5] - v[3]) + 3 * t * t * (v[7] - v[5]);
    return { x: a * v[0] + b * v[2] + c * v[4] + d * v[6], y: a * v[1] + b * v[3] + c * v[5] + d * v[7], a: Math.atan2(dy, dx) };
  }
  function tmDrawVine(ctx, v, outer, inner, wo, wi) {
    for (const [w, col] of [[wo, outer], [wi, inner]]) { ctx.beginPath(); ctx.moveTo(v[0], v[1]); ctx.bezierCurveTo(v[2], v[3], v[4], v[5], v[6], v[7]); tmStroke(ctx, w, col); }
  }
  function tmThorn(ctx, x, y, a, side, size = 1) {
    const tx = Math.cos(a), ty = Math.sin(a), nx = -ty * side, ny = tx * side;
    ctx.beginPath(); ctx.moveTo(x - tx * 2 * size, y - ty * 2 * size); ctx.lineTo(x + (nx * 4.6 + tx * 1.6) * size, y + (ny * 4.6 + ty * 1.6) * size); ctx.lineTo(x + tx * 2 * size, y + ty * 2 * size); ctx.closePath();
    ctx.fillStyle = TM.thorn; ctx.fill(); tmStroke(ctx, .8, TM.thornLight);
  }
  // The move's label (art.js drawBossWarning) is drawn before this look's over hook, so a tell is drawn at full strength
  // around the label and faint across it, keeping the words readable.
  function tmTell(ctx, w, draw) {
    ctx.save(); ctx.font = '600 12px Fredoka';
    const width = Math.min(310, Math.max(130, ctx.measureText(String(w.text || 'A guardian is stirring')).width + 28)); ctx.restore();
    const x = clamp(w.x, width / 2 + 10, 410 - width / 2) - width / 2 - 2, y = clamp(w.y + 61, 45, 395) - 15;
    ctx.save(); ctx.beginPath(); ctx.rect(-120, -120, 660, 900); ctx.rect(x, y, width + 4, 30); ctx.clip('evenodd'); draw(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, width + 4, 30); ctx.clip(); ctx.globalAlpha *= .22; draw(); ctx.restore();
  }
  function tmSap(ctx, kit, x, y) { kit.circle(ctx, x, y, 2.5, TM.sap, TM.sapInk, .9); kit.circle(ctx, x - .8, y - .8, .7, '#ffffff'); }
  // A rope (a smooth line through the points) in the heart-vine strokes.
  function tmRope(ctx, pts, wo = 5, wi = 2.2) {
    const path = () => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    };
    ctx.save(); ctx.globalAlpha *= .4; path(); tmStroke(ctx, wo + 2.4, '#ffffff'); ctx.restore();
    path(); tmStroke(ctx, wo, TM.vine); path(); tmStroke(ctx, wi, TM.vineLight);
  }
  // A ball of twisted vine (r 9) with six cream thorns; the head adds a leaf snout, two friendly eyes and a curly tongue.
  function paintTmKnot(c, head) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const R = 8.6;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + .52; if (head && Math.cos(a) > .5) continue;
      const x = Math.cos(a) * (R - .8), y = Math.sin(a) * (R - .8), nx = -Math.sin(a) * 2.3, ny = Math.cos(a) * 2.3, tip = R + 4.8;
      c.beginPath(); c.moveTo(x - nx, y - ny); c.lineTo(Math.cos(a + .22) * tip, Math.sin(a + .22) * tip); c.lineTo(x + nx, y + ny); c.closePath();
      c.fillStyle = TM.cream; c.fill(); tmStroke(c, 1, TM.knotDark);
    }
    if (head) {
      const snout = () => { c.beginPath(); c.moveTo(4, -5.4); c.quadraticCurveTo(14, -8, 19.5, 0); c.quadraticCurveTo(14, 8, 4, 5.4); c.closePath(); };
      c.beginPath(); c.moveTo(19.4, 0); c.bezierCurveTo(23.2, .4, 23.4, -3.6, 21, -3.4); tmStroke(c, 2.6, TM.knotDark); c.beginPath(); c.moveTo(19.4, 0); c.bezierCurveTo(23.2, .4, 23.4, -3.6, 21, -3.4); tmStroke(c, 1.2, TM.cheek);
      snout(); c.fillStyle = '#9cc46a'; c.fill(); tmStroke(c, 1.4, TM.knotDark);
      c.beginPath(); c.moveTo(7, 0); c.quadraticCurveTo(12, -.6, 17, 0); tmStroke(c, .8, '#5f8c45');
      c.beginPath(); c.ellipse(13, -2.6, 2.6, 1, -.2, 0, TAU); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill();
    }
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = TM.knot; c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
    for (const [a, col] of [[-.95, '#8fbb5f'], [.25, '#a7cc7e'], [1.35, '#7aa652']]) { c.save(); c.rotate(a); c.beginPath(); c.ellipse(0, 0, R * 1.08, R * .42, 0, 0, TAU); c.fillStyle = col; c.fill(); tmStroke(c, .9, TM.vine); c.restore(); }
    c.restore();
    c.beginPath(); c.arc(0, 0, R, 0, TAU); tmStroke(c, 1.7, TM.knotDark);
    c.beginPath(); c.ellipse(-3, -3.8, 2.3, 1.1, -.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.62)'; c.fill();
    if (head) for (const side of [-1, 1]) {
      c.beginPath(); c.arc(2.8, side * 3.8, 2.6, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); tmStroke(c, .9, TM.knotDark);
      c.beginPath(); c.arc(3.6, side * 3.6, 1.4, 0, TAU); c.fillStyle = '#2d3a22'; c.fill();
      c.beginPath(); c.arc(4, side * 3.6 - .6, .55, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    }
  }
  // The coral satin bow tied over a knot: loops across the rope, notched tails trailing along it, a white rim and glints.
  function paintTmBow(c) {
    c.save(); c.scale(.8, .8); paintTmKnot(c, false); c.restore();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const loop = s => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-7, s * 2.5, -9, s * 13, -1.5, s * 14.6); c.bezierCurveTo(6, s * 15.8, 8.4, s * 4.5, 0, 0); c.closePath(); };
    const tail = s => { c.beginPath(); c.moveTo(0, -s * 1.4); c.lineTo(15.6, s * 4.4); c.lineTo(12.6, s * 6.8); c.lineTo(14.4, s * 10.4); c.lineTo(0, s * 2.6); c.closePath(); };
    for (const s of [-1, 1]) { tail(s); tmStroke(c, 4.2, '#ffffff'); loop(s); tmStroke(c, 4.2, '#ffffff'); }
    for (const s of [-1, 1]) { tail(s); c.fillStyle = TM.coralDark; c.fill(); tmStroke(c, 1.1, TM.bowInk); }
    for (const s of [-1, 1]) {
      loop(s); c.fillStyle = TM.coral; c.fill(); tmStroke(c, 1.2, TM.bowInk);
      c.beginPath(); c.moveTo(.6, s * 2.4); c.quadraticCurveTo(-2.2, s * 7.5, -.6, s * 11.4); tmStroke(c, 1, TM.bowInk);
      c.beginPath(); c.moveTo(-4.6, s * 6); c.quadraticCurveTo(-5.6, s * 10.5, -2.2, s * 12.6); tmStroke(c, 1.6, TM.satin);
      c.beginPath(); c.ellipse(3.2, s * 9.4, 1.5, 2.6, s * .5, 0, TAU); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill();
    }
    c.beginPath(); c.ellipse(0, 0, 3.6, 4.4, 0, 0, TAU); c.fillStyle = TM.coral; c.fill(); tmStroke(c, 1.2, TM.bowInk);
    c.beginPath(); c.moveTo(-1.6, -2.4); c.lineTo(-1.6, 2.4); tmStroke(c, .8, TM.bowInk);
    c.beginPath(); c.ellipse(1, -1.6, 1, 1.4, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
  }
  // The thorn arch: a 45 x 14 capsule of twisted bramble (a white edge so it reads), ten thorns, two tiny pink roses.
  function paintTmArch(c) {
    const h = TM_ARCH / 2, y = x => -1.6 * (1 - (x / h) * (x / h));
    c.lineCap = 'round'; c.lineJoin = 'round';
    const body = () => { c.beginPath(); c.moveTo(-h, 0); c.quadraticCurveTo(0, -3.2, h, 0); };
    for (let i = 0; i < 10; i++) {
      const x = -h + 2.5 + i * (2 * h - 5) / 9, side = i % 2 ? 1 : -1, a = side < 0 ? -.35 : .35;
      c.save(); c.translate(x, y(x) + side * 3.6); c.rotate(a * side);
      c.beginPath(); c.moveTo(-2.4, 0); c.lineTo(.9, side * 6.6); c.lineTo(2.4, 0); c.closePath(); c.fillStyle = TM.cream; c.fill(); tmStroke(c, 1, TM.knotDark);
      c.restore();
    }
    c.save(); c.globalAlpha = .85; body(); tmStroke(c, 12.8, '#ffffff'); c.restore();
    body(); tmStroke(c, 10.6, TM.knotDark); body(); tmStroke(c, 8, '#5f8a45');
    // Two strands twisting round each other.
    for (let i = -6; i <= 6; i++) { const x = i * h / 6.6, yy = y(x); c.beginPath(); c.moveTo(x - 2.6, yy - 3.4); c.quadraticCurveTo(x + .6, yy - .6, x + 2.2, yy + 3.4); tmStroke(c, 1.5, i % 2 ? '#a7cc7e' : '#86b35c'); }
    c.beginPath(); c.moveTo(-h + 3, -2.6); c.quadraticCurveTo(0, -5.4, h - 3, -2.6); tmStroke(c, 1, 'rgba(230,255,200,.6)');
    for (const [x, s] of [[-8.5, 1], [10.5, .85]]) {
      const yy = y(x) - 4.6;
      c.save(); c.translate(x + 3.4, yy + 1.2); c.rotate(.5); c.beginPath(); c.ellipse(0, 0, 2.8 * s, 1.3 * s, 0, 0, TAU); c.fillStyle = '#83ac57'; c.fill(); tmStroke(c, .7, TM.knotDark); c.restore();
      c.beginPath(); c.arc(x, yy, 3.5 * s, 0, TAU); c.fillStyle = TM.coral; c.fill(); tmStroke(c, 1, TM.bowInk);
      c.beginPath(); c.arc(x + .3, yy - .2, 1.8 * s, -2.2, 2.6); tmStroke(c, .8, TM.bowInk);
      c.beginPath(); c.arc(x - 1.2 * s, yy - 1.3 * s, .7 * s, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    }
  }
  // A curl of vine round a docked flower's stem (origin at the stem), with two thorns and a curling end.
  function paintTmCuff(c) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const curl = () => { c.beginPath(); c.arc(0, -4.6, 7.6, .08 * Math.PI, .92 * Math.PI); c.moveTo(7.5, -3.4); c.bezierCurveTo(10.4, -5.6, 9.6, -9.4, 7.4, -8.6); };
    c.save(); c.globalAlpha = .8; curl(); tmStroke(c, 5.6, '#ffffff'); c.restore();
    curl(); tmStroke(c, 3.6, TM.vine); curl(); tmStroke(c, 1.6, TM.vineLight);
    for (const a of [.32 * Math.PI, .68 * Math.PI]) { const x = Math.cos(a) * 7.6, y = -4.6 + Math.sin(a) * 7.6; tmThorn(c, x, y, a + Math.PI / 2, -1, .8); }
  }
  function paintTmHeart(c) { tmHeartPath(c, 4.3); c.lineJoin = 'round'; tmStroke(c, 2.6, '#ffffff'); c.fillStyle = TM.heart; c.fill(); tmStroke(c, .9, TM.bowInk); c.beginPath(); c.ellipse(-1.7, -1.5, 1, .7, -.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.9)'; c.fill(); }
  function paintTmPetal(c) {
    c.beginPath(); c.moveTo(-5.4, 0); c.bezierCurveTo(-3, -4.4, 3.6, -4.2, 5.6, 0); c.bezierCurveTo(3.6, 3.2, -3, 3.4, -5.4, 0); c.closePath();
    c.fillStyle = TM.base; c.fill(); c.lineWidth = .9; c.strokeStyle = '#a34080'; c.stroke();
    c.beginPath(); c.moveTo(-3.4, -.4); c.quadraticCurveTo(0, -2.4, 3.6, -.8); c.lineWidth = 1.1; c.strokeStyle = '#ffc5e0'; c.stroke();
  }
  // Her faces, around the face's middle (r is her radius; the skin is an ellipse 0.53r x 0.49r just above it).
  // tier: 0 Prickly, 1 Smitten, 2 Wild. look: calm, blink, hurt, swoon (Lovestruck).
  function paintTmFace(c, r, tier, look) {
    const u = r / 26, ink = TM.ink, shut = look === 'blink';
    c.lineCap = 'round'; c.lineJoin = 'round';
    const E = [-1, 1].map(side => [side, side * 6.4 * u, -3.4 * u]);
    const cheeks = (rx, ry, color, alpha, y = 2.2 * u, x = 10 * u) => { c.save(); c.globalAlpha = alpha; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * x, y, rx, ry, 0, 0, TAU); c.fillStyle = color; c.fill(); } c.restore(); };
    const closed = (down = false) => { for (const [, ex, ey] of E) { c.beginPath(); c.moveTo(ex - 3.2 * u, ey + (down ? -.6 : .8) * u); c.quadraticCurveTo(ex, ey + (down ? 2.4 : -2.6) * u, ex + 3.2 * u, ey + (down ? -.6 : .8) * u); tmStroke(c, 1.6 * u, ink); } };
    // A hit squeezes her eyes shut: > <.
    const squeeze = () => { for (const [side, ex, ey] of E) { c.beginPath(); c.moveTo(ex - side * 3 * u, ey - 2.6 * u); c.lineTo(ex + side * 2.2 * u, ey); c.lineTo(ex - side * 3 * u, ey + 2.6 * u); tmStroke(c, 1.7 * u, ink); } };
    if (look === 'swoon') {
      // Swept off her feet: eyes shut in bliss, flushed, a little pucker.
      cheeks(3.6 * u, 2.3 * u, '#ff6f9e', .85);
      for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(s * 10 * u + i * 1.9 * u - .6 * u, 3.4 * u); c.lineTo(s * 10 * u + i * 1.9 * u + .6 * u, 1 * u); tmStroke(c, .8 * u, '#d23a6e'); }
      closed(false);
      for (const [side, ex, ey] of E) { c.beginPath(); c.moveTo(ex + side * 3.1 * u, ey + .6 * u); c.lineTo(ex + side * 4.6 * u, ey - .6 * u); tmStroke(c, 1 * u, ink); }
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 3.2 * u, -10.4 * u); c.quadraticCurveTo(s * 6.4 * u, -12.6 * u, s * 9.6 * u, -10.8 * u); tmStroke(c, 1.1 * u, ink); }
      c.beginPath(); c.ellipse(.6 * u, 5.2 * u, 1.7 * u, 2 * u, 0, 0, TAU); c.fillStyle = '#d23a6e'; c.fill(); tmStroke(c, .9 * u, ink);
      c.beginPath(); c.arc(.1 * u, 4.6 * u, .5 * u, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      return;
    }
    if (tier === 0) {
      // Prickly: narrow eyes under heavy lids, one brow raised, a tight smirk, a three-thorn tiara.
      cheeks(2.8 * u, 1.6 * u, TM.cheek, .45);
      if (look === 'hurt') squeeze(); else if (shut) closed(true);
      else for (const [side, ex, ey] of E) {
        c.beginPath(); c.ellipse(ex, ey, 3.6 * u, 2.9 * u, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
        c.save(); c.clip();
        c.beginPath(); c.arc(ex + 1.1 * u, ey + .7 * u, 2.2 * u, 0, TAU); c.fillStyle = TM.eye; c.fill();
        c.beginPath(); c.arc(ex + 1.2 * u, ey + .8 * u, 1.1 * u, 0, TAU); c.fillStyle = '#33263f'; c.fill();
        c.beginPath(); c.arc(ex + .4 * u, ey + .1 * u, .6 * u, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
        c.beginPath(); c.rect(ex - 4 * u, ey - 4 * u, 8 * u, 3.7 * u); c.fillStyle = TM.lid; c.fill();
        c.restore();
        c.beginPath(); c.ellipse(ex, ey, 3.6 * u, 2.9 * u, 0, 0, TAU); tmStroke(c, .8 * u, ink);
        c.beginPath(); c.moveTo(ex - 3.8 * u, ey - .1 * u); c.quadraticCurveTo(ex, ey - .9 * u, ex + 3.8 * u, ey - .4 * u); tmStroke(c, 1.9 * u, ink);
        c.beginPath(); c.moveTo(ex + side * 3.6 * u, ey - .3 * u); c.lineTo(ex + side * 5.3 * u, ey - 1.9 * u); tmStroke(c, 1.2 * u, ink);
      }
      c.beginPath(); c.moveTo(-10 * u, -9.4 * u); c.quadraticCurveTo(-7 * u, -13.8 * u, -2.8 * u, -10.8 * u); tmStroke(c, 1.5 * u, ink);
      c.beginPath(); c.moveTo(2.8 * u, -8.6 * u); c.quadraticCurveTo(6.5 * u, -9.6 * u, 10 * u, -8.8 * u); tmStroke(c, 1.8 * u, ink);
      if (look === 'hurt') { c.beginPath(); c.moveTo(-3.4 * u, 5 * u); c.lineTo(-1.7 * u, 3.8 * u); c.lineTo(0, 5 * u); c.lineTo(1.7 * u, 3.8 * u); c.lineTo(3.4 * u, 5 * u); tmStroke(c, 1.3 * u, ink); }
      else {
        c.beginPath(); c.moveTo(-3.8 * u, 4.2 * u); c.quadraticCurveTo(.6 * u, 6.4 * u, 4.4 * u, 3 * u); tmStroke(c, 1.4 * u, ink);
        c.beginPath(); c.moveTo(3.8 * u, 2.2 * u); c.quadraticCurveTo(5.2 * u, 2.9 * u, 4.8 * u, 4.2 * u); tmStroke(c, 1 * u, ink);
      }
      // The tiara: a vine circlet on her brow with three thorns standing up, a tiny rose at the middle one.
      const R = 17.4 * u, cy = 2.2 * u;
      c.beginPath(); c.arc(0, cy, R, -2.2, -.94); tmStroke(c, 3 * u, TM.vine); c.beginPath(); c.arc(0, cy, R, -2.2, -.94); tmStroke(c, 1.3 * u, TM.vineLight);
      for (const [a, len] of [[-1.97, 5.4], [-Math.PI / 2, 7.6], [-1.17, 5.4]]) {
        const bx = Math.cos(a) * R, by = cy + Math.sin(a) * R, tx = Math.cos(a), ty = Math.sin(a), w = 2.1 * u;
        c.beginPath(); c.moveTo(bx - ty * w, by + tx * w); c.lineTo(bx + tx * len * u, by + ty * len * u); c.lineTo(bx + ty * w, by - tx * w); c.closePath();
        c.fillStyle = TM.cream; c.fill(); tmStroke(c, 1 * u, TM.knotDark);
      }
      c.beginPath(); c.arc(0, cy - R + .4 * u, 2.3 * u, 0, TAU); c.fillStyle = TM.coral; c.fill(); tmStroke(c, .9 * u, TM.bowInk);
      c.beginPath(); c.arc(.2 * u, cy - R + .2 * u, 1.1 * u, -2, 2.6); tmStroke(c, .7 * u, TM.bowInk);
      return;
    }
    if (tier === 1) {
      // Smitten: heart eyes with white glints, rosy cheeks, an open smile.
      cheeks(2.9 * u, 2.9 * u, TM.cheek, .75, 2.6 * u);
      if (look === 'hurt') squeeze(); else if (shut) closed(true);
      else for (const [, ex, ey] of E) {
        c.save(); c.translate(ex, ey - .4 * u); tmHeartPath(c, 3.7 * u); c.fillStyle = TM.coral; c.fill(); tmStroke(c, 1 * u, ink);
        c.beginPath(); c.ellipse(-1.4 * u, -1.2 * u, .9 * u, .65 * u, -.6, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.restore();
      }
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 3.2 * u, -9.8 * u); c.quadraticCurveTo(s * 6.6 * u, -12.2 * u, s * 9.8 * u, -10 * u); tmStroke(c, 1.2 * u, ink); }
      if (look === 'hurt') { c.beginPath(); c.ellipse(0, 5 * u, 1.8 * u, 1.4 * u, 0, 0, TAU); c.fillStyle = TM.mouth; c.fill(); tmStroke(c, 1 * u, ink); return; }
      const mouth = () => { c.beginPath(); c.moveTo(-4.2 * u, 3 * u); c.quadraticCurveTo(0, 3.9 * u, 4.2 * u, 3 * u); c.quadraticCurveTo(3.6 * u, 8.6 * u, 0, 8.7 * u); c.quadraticCurveTo(-3.6 * u, 8.6 * u, -4.2 * u, 3 * u); c.closePath(); };
      mouth(); c.fillStyle = TM.mouth; c.fill(); c.save(); c.clip(); c.beginPath(); c.ellipse(0, 8.4 * u, 2.6 * u, 1.8 * u, 0, 0, TAU); c.fillStyle = TM.tongue; c.fill(); c.restore();
      mouth(); tmStroke(c, 1.1 * u, ink);
      return;
    }
    // Wild: wide eyes with small pupils, brows angled in, a toothy grin with one thorn fang.
    cheeks(3 * u, 1.8 * u, '#ff5c7a', .7);
    if (look === 'hurt') squeeze(); else if (shut) closed(true);
    else for (const [side, ex, ey] of E) {
      c.beginPath(); c.arc(ex, ey - .4 * u, 4.1 * u, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); tmStroke(c, 1 * u, ink);
      c.beginPath(); c.arc(ex - side * .5 * u, ey - .2 * u, 1.35 * u, 0, TAU); c.fillStyle = '#33263f'; c.fill();
      c.beginPath(); c.arc(ex - side * .2 * u, ey - .7 * u, .45 * u, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
    }
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 11 * u, -12 * u); c.lineTo(s * 2.6 * u, -8.4 * u); tmStroke(c, 2.3 * u, ink); }
    if (look === 'hurt') { c.beginPath(); c.moveTo(-4.4 * u, 5 * u); c.lineTo(-2.2 * u, 3.6 * u); c.lineTo(0, 5 * u); c.lineTo(2.2 * u, 3.6 * u); c.lineTo(4.4 * u, 5 * u); tmStroke(c, 1.4 * u, ink); return; }
    const grin = () => { c.beginPath(); c.moveTo(-6.4 * u, 2.2 * u); c.quadraticCurveTo(0, 4.4 * u, 6.4 * u, 2.2 * u); c.quadraticCurveTo(4.8 * u, 9.2 * u, 0, 9.4 * u); c.quadraticCurveTo(-4.8 * u, 9.2 * u, -6.4 * u, 2.2 * u); c.closePath(); };
    grin(); c.fillStyle = TM.mouth; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.moveTo(-7 * u, 1.6 * u); c.lineTo(7 * u, 1.6 * u); for (let j = 0; j <= 6; j++) c.lineTo(6.6 * u - j * 2.2 * u, (j % 2 ? 5.4 : 4.2) * u); c.closePath(); c.fillStyle = '#ffffff'; c.fill();
    c.beginPath(); c.ellipse(1 * u, 9.4 * u, 2.6 * u, 1.6 * u, 0, 0, TAU); c.fillStyle = TM.tongue; c.fill();
    c.restore();
    grin(); tmStroke(c, 1.2 * u, ink);
    c.beginPath(); c.moveTo(-3.6 * u, 3.4 * u); c.lineTo(-2.3 * u, 8.4 * u); c.lineTo(-1 * u, 3.6 * u); c.closePath(); c.fillStyle = TM.thornLight; c.fill(); tmStroke(c, .8 * u, TM.vine);
  }
  const TM_SPRITE = {
    knot: () => ['kit:briar:knot', [-15, -15, 15, 15], c => paintTmKnot(c, false)],
    head: () => ['kit:briar:head', [-15, -15, 25, 15], c => paintTmKnot(c, true)],
    bow: () => ['kit:briar:bow', [-16, -19, 19, 19], paintTmBow],
    arch: () => ['kit:briar:arch', [-TM_ARCH / 2 - 9, -15, TM_ARCH / 2 + 9, 15], paintTmArch],
    cuff: () => ['kit:briar:cuff', [-12, -13, 12, 6], paintTmCuff],
    heart: () => ['kit:briar:heart', [-7, -7, 7, 7], paintTmHeart],
    petal: () => ['kit:briar:petal', [-7, -5, 7, 5], paintTmPetal],
    face: (tier, look) => [`kit:briar:face:${tier}:${look}`, [-21, -29, 21, 14], c => paintTmFace(c, 26, tier, look)]
  };
  const tmStamp = (ctx, kit, [key, box, paint], x, y, turn, sx, sy) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  // Reel vines seen docked last frame, per fight, so a snipped or dropped one can whip back to her (art memory only).
  const tmSeen = new WeakMap();
  const tmDocked = s => (s.carried || []).filter(p => p.carried && p.carried.reel && !p.bloomed && !p.hidden && p.visible !== false);
  const tmLove = s => s.mode === 'smitten' && s.modeUntil > s.age;
  kitLook('briar', {
    warm(kit) {
      for (const make of [TM_SPRITE.knot(), TM_SPRITE.head(), TM_SPRITE.bow(), TM_SPRITE.arch(), TM_SPRITE.cuff(), TM_SPRITE.heart(), TM_SPRITE.petal()]) kit.atlasSprite(make[0], ...make[1], make[2]);
      for (let tier = 0; tier < 3; tier++) for (const look of TM_LOOKS) { const [key, box, paint] = TM_SPRITE.face(tier, look); kit.atlasSprite(key, ...box, paint); }
      if (LOOKS.sweetheart && LOOKS.sweetheart.warm) LOOKS.sweetheart.warm(kit, 11, 'coral');
    },
    under(ctx, state, s, time, still, kit, quality) {
      const b = s.boss; if (!b || b.bloomed) return;
      const clock = Number(s.kitAge) || 0, r = b.r || 26, skirt = b.y + r * .6;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // The arch: bursts up out of the soil over .25 s (overshooting a little) and shrivels through its last .3 s.
      for (const rock of state.bumpers || []) {
        if (!rock.bossArch) continue;
        const grow = still ? 1 : kit.easeBack(clamp((clock - rock.kitAt) / .25, 0, 1)), wither = clamp((rock.kitUntil - clock) / .3, 0, 1);
        const out = Math.sin(rock.angle) * (rock.x - 210) - Math.cos(rock.angle) * (rock.y - 498) >= 0 ? 1 : -1;
        ctx.save(); ctx.translate(rock.x, rock.y); ctx.rotate(rock.angle); ctx.globalAlpha *= .35 + .65 * wither;
        ctx.translate(0, out * (1 - wither) * 3);
        tmStamp(ctx, kit, TM_SPRITE.arch(), 0, 0, 0, Math.max(.05, grow) * (Number(rock.length) || TM_ARCH) / TM_ARCH, out * Math.max(.05, Math.min(1.1, grow) * (.55 + .45 * wither)));
        ctx.restore();
      }
      // Bramble Reel: a thorny vine from her skirt to each docked flower (drawn to wherever it is, so it reels in), and
      // in the last .6 s before a drink a bead of sap runs up it to her.
      let seen = tmSeen.get(s); if (!seen) { seen = new Map(); tmSeen.set(s, seen); }
      const docked = tmDocked(s), live = new Set();
      for (const p of docked) {
        const ox = (TM_SLOTS[p.carried.slot] || [0])[0], v = tmVine(b.x + ox * .4, skirt, p.x, p.y + (p.r || 11) - 2, 18);
        live.add(p.id); seen.set(p.id, { p, ox, gone: null });
        tmDrawVine(ctx, v, TM.vine, TM.vineLight, 4, 1.6);
        if (quality === 0) [.3, .55, .8].forEach((t, i) => { const at = tmAt(v, t); tmThorn(ctx, at.x, at.y, at.a, i % 2 ? 1 : -1); });
        if (s.reel) {
          const left = s.reel.next - clock;
          if (still) { const at = tmAt(v, .5); tmSap(ctx, kit, at.x, at.y); }
          else if (left >= 0 && left < .6) { const at = tmAt(v, left / .6); tmSap(ctx, kit, at.x, at.y); }
        }
      }
      // Snipped or let go: the vine whips back to her skirt.
      for (const [id, e] of seen) {
        if (live.has(id)) continue;
        if (e.gone == null) e.gone = { at: time, x: e.p.x, y: e.p.y + (e.p.r || 11) - 2 };
        const k = (time - e.gone.at) / .3;
        if (k < 0 || k >= 1) { seen.delete(id); continue; }
        if (still) continue;
        const f = kit.ease(k), ax = b.x + e.ox * .4, x = e.gone.x + (ax - e.gone.x) * f, y = e.gone.y + (skirt - e.gone.y) * f;
        ctx.save(); ctx.globalAlpha *= 1 - k; tmDrawVine(ctx, tmVine(ax, skirt, x, y + 8 * Math.sin(k * Math.PI), 18), TM.vine, TM.vineLight, 4 - 2 * k, 1.6 - .6 * k); ctx.restore();
      }
      // Sweetheart Vines: a rose-stem vine from her skirt to the pair's ribbon knot, a heart-shaped leaf on it, and in
      // the last second before the next drink a bead of sap runs from the pair to her.
      for (const vine of s.vines || []) {
        if (vine.cut) continue;
        const roses = (state.buds || []).filter(p => p.group === vine.group && p.foe === 'sweetheart' && !p.bloomed && !p.hidden);
        if (!roses.length) continue;
        const mx = roses.reduce((t, p) => t + p.x, 0) / roses.length, my = roses.reduce((t, p) => t + p.y, 0) / roses.length + 14;
        const v = tmVine(b.x + Math.sign(mx - b.x) * 10, skirt, mx, my);
        ctx.save(); ctx.globalAlpha *= .45; tmDrawVine(ctx, v, '#ffffff', '#ffffff', 6.4, 0); ctx.restore();
        tmDrawVine(ctx, v, TM.stem, TM.stemPink, 4, 1.6);
        const leaf = tmAt(v, .5), side = mx < b.x ? -1 : 1;
        ctx.save(); ctx.translate(leaf.x, leaf.y); ctx.rotate(leaf.a - side * 2.3); ctx.translate(0, -5);
        tmHeartPath(ctx, 4); ctx.fillStyle = '#83ac57'; ctx.fill(); tmStroke(ctx, 1, TM.vine);
        ctx.beginPath(); ctx.moveTo(0, 3.6); ctx.lineTo(0, -1.4); tmStroke(ctx, .7, TM.vine); ctx.restore();
        const left = (Number(vine.next) || 0) - clock;
        if (still) { const at = tmAt(v, .3); tmSap(ctx, kit, at.x, at.y); }
        else if (left >= 0 && left < 1) { const at = tmAt(v, left); tmSap(ctx, kit, at.x, at.y); }
      }
      // The lasso's rope: from her skirt through the tail knot to the head.
      const knots = (s.parts || []).filter(p => p.bossPart === 'lasso' && !p.bloomed && !p.closed).sort((p, q) => q.k - p.k);
      if (knots.length) tmRope(ctx, [[b.x, skirt], ...knots.map(p => [p.x, p.y])]);
    },
    // Lasso knots, turned along the rope; the head leads and the bow (the answer) breathes inside a marching ring.
    part(ctx, state, s, piece, time, still, kit) {
      if (piece.bossPart !== 'lasso') return false;
      if (piece.bloomed || piece.closed) return true;
      const rope = (s.parts || []).filter(q => q.bossPart === 'lasso' && q.lasso === piece.lasso && !q.bloomed && !q.closed);
      const ahead = rope.find(q => q.k === piece.k - 1) || piece, behind = rope.find(q => q.k === piece.k + 1) || piece;
      const turn = ahead === behind ? Math.atan2(piece.uy || 1, piece.ux || 0) : Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
      const age = (Number(s.kitAge) || 0) - (Number(piece.born) || 0), pop = still ? 1 : kit.easeBack(clamp(age / .22, 0, 1));
      if (piece.bow) {
        const breathe = still ? 1 : 1 + .08 * Math.sin((Number(s.kitAge) || 0) * 6), rr = (piece.r || 9) + 7;
        ctx.save(); ctx.setLineDash([4, 3]); ctx.lineDashOffset = still ? 0 : -time * 14;
        ctx.beginPath(); ctx.arc(piece.x, piece.y, rr * breathe, 0, TAU); tmStroke(ctx, 3.4, '#ffffff'); tmStroke(ctx, 1.5, TM.coral); ctx.restore();
        tmStamp(ctx, kit, TM_SPRITE.bow(), piece.x, piece.y, turn, Math.max(.05, pop * breathe));
      } else tmStamp(ctx, kit, piece.k === 0 ? TM_SPRITE.head() : TM_SPRITE.knot(), piece.x, piece.y, turn, Math.max(.05, pop));
      return true;
    },
    face(ctx, state, s, boss, time, still, kit, quality) {
      if (!boss.boss) return false;
      const r = Number(boss.r) || 26, look = kit.BOSS_LOOKS.briar || {}, tier = clamp(s.tier | 0, 0, 2), health = (Number(boss.hp) || 0) / Math.max(1, Number(boss.maxHp) || 1);
      // The face sways with her body (art.js's briar tilt, and the shiver when nearly beaten).
      let tilt = still ? 0 : Math.sin(time * 2.2) * .065;
      if (!still && health <= .2) tilt += Math.sin(time * TAU * 6) * .04;
      ctx.translate(boss.x, boss.y); if (tilt) ctx.rotate(tilt); ctx.translate(0, r * (look.faceY != null ? look.faceY : -.08));
      const hurt = Boolean(boss.bloomed) || (typeof boss.hitAt === 'number' && time - boss.hitAt >= 0 && time - boss.hitAt < .3);
      const love = tmLove(s), blink = !still && (time + .7) % 3.3 < .12;
      tmStamp(ctx, kit, TM_SPRITE.face(tier, hurt ? 'hurt' : love ? 'swoon' : blink ? 'blink' : 'calm'), 0, 0);
      // Lovestruck: three small hearts rise off her crown, one a second.
      if (love && quality < 2) for (let i = 0; i < 3; i++) {
        const ph = still ? .3 + i * .2 : (time + i / 3) % 1;
        ctx.save(); ctx.globalAlpha *= still ? .9 : Math.sin(Math.PI * ph);
        tmStamp(ctx, kit, TM_SPRITE.heart(), (i - 1) * 9 + (still ? 0 : Math.sin(ph * TAU + i) * 2.4), -r * .72 - ph * 20, 0, .7 + .35 * ph); ctx.restore();
      }
      // Wild: two loose petals flutter off her crown (two frames, 6 a second).
      if (tier === 2 && !love && quality < 2) {
        const f = still ? 0 : Math.floor(time * 6) % 2;
        tmStamp(ctx, kit, TM_SPRITE.petal(), -r * .62 - f * 1.6, -r * .86 + f * 1.8, -.7 + f * .55);
        tmStamp(ctx, kit, TM_SPRITE.petal(), r * .7 + f * 1.4, -r * .98 - f * 1.4, .9 - f * .6, .85);
      }
      return true;
    },
    over(ctx, state, s, time, still, kit, quality) {
      const b = s.boss; if (!b || b.bloomed) return;
      const clock = Number(s.kitAge) || 0, r = b.r || 26, skirt = b.y + r * .6, w = s.warning;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // A curl of vine round each docked flower's stem (it reads as hooked even with Animations off).
      for (const p of tmDocked(s)) tmStamp(ctx, kit, TM_SPRITE.cuff(), p.x, p.y + (p.r || 11) - 2);
      // Tells, over the warning's 1.3 s.
      if (w && Number.isFinite(w.at) && Number.isFinite(w.x) && Number.isFinite(w.y) && ['reel', 'sweet', 'lasso'].includes(w.move)) tmTell(ctx, w, () => {
        const p = still ? 1 : clamp((time - w.at) / TM_TELL, 0, 1), march = still ? 0 : -time * 18;
        const ring = (x, y, rad, color, dash = [4, 3]) => { ctx.save(); ctx.setLineDash(dash); ctx.lineDashOffset = still ? 0 : -time * 12; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); tmStroke(ctx, 3.4, '#ffffff'); tmStroke(ctx, 1.7, color); ctx.restore(); };
        if (w.move === 'reel') for (const t of w.targets || []) {
          if (t.role === 'reel') {
            // A dotted vine creeps out to the flower, and a hook ring closes round it.
            const v = tmVine(b.x + clamp((t.x - b.x) * .4, -18, 18), skirt, t.x, t.y + (t.r || 11) - 2, 18), pts = [];
            for (let i = 0; i <= 20; i++) { const at = tmAt(v, p * i / 20); pts.push([at.x, at.y]); }
            dotted(ctx, pts, TM.vineLight, 2.1, 7, march);
            ring(t.x, t.y, (t.r || 11) + 4 + (still ? 0 : 4 * (1 - p)), TM.vine);
          } else if (t.role === 'bud') {
            // Where one of her own rosebuds will sprout: a dashed coral ring and a little sprout coming up.
            ring(t.x, t.y, (t.r || 10) + 3, TM.coralDark);
            const g = still ? 1 : kit.easeBack(clamp(p * 1.4, 0, 1));
            ctx.save(); ctx.translate(t.x, t.y + 5); ctx.scale(1.4 * g, 1.4 * g);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -7); tmStroke(ctx, 3.2, '#ffffff'); tmStroke(ctx, 1.5, TM.vine);
            for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 2.6, -6.4, 2.6, 1.3, side * -.5, 0, TAU); ctx.fillStyle = TM.vineLight; ctx.fill(); tmStroke(ctx, .8, TM.vine); }
            ctx.restore();
          }
        } else if (w.move === 'sweet') {
          const mid = (w.targets || []).find(t => t.role === 'sweet');
          if (mid) {
            // A dashed heart where the pair will sprout, their two ghosts, and a dotted pink vine filling toward them.
            ctx.save(); ctx.translate(mid.x, mid.y + 2); ctx.setLineDash([6, 5]); ctx.lineDashOffset = still ? 0 : -time * 12; tmHeartPath(ctx, (mid.r || 36) * .8);
            ctx.globalAlpha *= .55 + .45 * p; ctx.fillStyle = 'rgba(255,111,158,.16)'; ctx.fill(); tmStroke(ctx, 3.6, '#ffffff'); tmStroke(ctx, 1.8, TM.tell); ctx.restore();
            if (LOOKS.sweetheart && LOOKS.sweetheart.bud) for (const t of (w.targets || []).filter(t => t.role === 'rose')) {
              ctx.save(); ctx.globalAlpha *= .45;
              bud(ctx, { foe: 'sweetheart', id: 'ghost', x: t.x, y: t.y, r: 11, side: t.x < mid.x ? 0 : 1, blushUntil: -1, blushAt: -100, poutAt: -100, kissAt: -100 }, time, true, state, kit, quality);
              ctx.restore();
            }
            const v = tmVine(b.x + Math.sign(mid.x - b.x) * 10, skirt, mid.x, mid.y + 14), pts = [];
            for (let i = 0; i <= 20; i++) { const at = tmAt(v, p * i / 20); pts.push([at.x, at.y]); }
            dotted(ctx, pts, TM.satin, 2.1, 7, march);
            // Her anticipation: a heart bubbles up over her head.
            const beat = still ? 1.5 : 1.3 + .3 * Math.pow(Math.max(0, Math.sin(time * 7)), 3);
            tmStamp(ctx, kit, TM_SPRITE.heart(), b.x + r * .55, b.y - r * 1.25 - (still ? 0 : 3 * Math.sin(time * 3)), still ? 0 : .15 * Math.sin(time * 4), beat);
          }
        } else if (w.move === 'lasso') {
          const t = (w.targets || []).find(t => t.role === 'lasso');
          if (t) {
            // The throw's line, the arch's two rocks, and the bow where it will be: shoot that.
            const len = Math.hypot(t.ex - t.sx, t.ey - t.sy) || 1, ux = (t.ex - t.sx) / len, uy = (t.ey - t.sy) / len, pts = [];
            for (let i = 0; i <= 24; i++) { const k = p * i / 24; pts.push([t.sx + (t.ex - t.sx) * k, t.sy + (t.ey - t.sy) * k]); }
            dotted(ctx, pts, TM.vineLight, 2.1, 8, march);
            const [c0, c1, c2] = tmArch(t.side);
            ctx.save(); ctx.setLineDash([5, 4]); ctx.lineDashOffset = still ? 0 : -time * 10; ctx.globalAlpha *= .5 + .5 * p;
            for (const [a, c] of [[c0, c1], [c1, c2]]) {
              const l = Math.hypot(c.x - a.x, c.y - a.y);
              ctx.save(); ctx.translate((a.x + c.x) / 2, (a.y + c.y) / 2); ctx.rotate(Math.atan2(c.y - a.y, c.x - a.x));
              ctx.beginPath(); ctx.moveTo(-l / 2, -7); ctx.lineTo(l / 2, -7); ctx.arc(l / 2, 0, 7, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-l / 2, 7); ctx.arc(-l / 2, 0, 7, Math.PI / 2, Math.PI * 1.5);
              tmStroke(ctx, 3.4, '#ffffff'); tmStroke(ctx, 1.7, TM.vine); ctx.restore();
            }
            ctx.restore();
            const a = (TM_LASSO.knots - 2) * TM_LASSO.gap;
            if (still || Math.floor(time * 6) % 2 === 0) { ctx.save(); ctx.globalAlpha *= .7; tmStamp(ctx, kit, TM_SPRITE.bow(), t.sx + ux * a, t.sy + uy * a, Math.atan2(uy, ux)); ctx.restore(); }
          }
        }
      });
      // Her wind-up for the lasso: she swings a loop of vine round over her head on a vine held out to the side.
      if (w && w.move === 'lasso' && Number.isFinite(w.at) && time < w.until) {
        const spin = still ? 1 : Math.cos(time * 9), side = (w.targets || []).some(t => t.role === 'lasso' && t.side) ? 1 : -1;
        const hx = b.x + side * r * 1.05, hy = b.y + r * .05, lx = b.x + side * r * 1.15, ly = b.y - r * 1.45 + (still ? 0 : 1.5 * Math.sin(time * 9));
        tmRope(ctx, [[hx, hy], [hx + side * 6, hy - r * .7], [lx, ly + 4]], 4, 1.7);
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(side * .18);
        ctx.beginPath(); ctx.ellipse(0, 0, 5 + 13 * Math.abs(spin), 5.5, 0, 0, TAU); tmStroke(ctx, 6.6, 'rgba(255,255,255,.45)'); tmStroke(ctx, 4, TM.vine); tmStroke(ctx, 1.7, TM.vineLight);
        for (const a of [.6, 2.4, 3.9, 5.5]) { const x = Math.cos(a) * (5 + 13 * Math.abs(spin)), y = Math.sin(a) * 5.5; tmThorn(ctx, x, y, a + Math.PI / 2, -1, .7); }
        ctx.restore();
      }
      // Lovestruck: a ring of hearts turning round her and a gold arc counting down the 2.5 s.
      if (tmLove(s)) {
        const n = quality === 0 ? 8 : 4, spin = still ? 0 : clock * 1.5, R = r + 12, cy = b.y + 4;
        for (let i = 0; i < n; i++) { const a = spin + i * TAU / n; tmStamp(ctx, kit, TM_SPRITE.heart(), b.x + Math.cos(a) * R, cy + Math.sin(a) * R, still ? 0 : .25 * Math.sin(clock * 5 + i), 1.15); }
        const k = clamp((s.modeUntil - s.age) / TM_LOVE, 0, 1);
        for (const [wd, col] of [[4.4, '#ffffff'], [2.6, TM.gold]]) { ctx.beginPath(); ctx.arc(b.x, cy, R + 8, -Math.PI / 2, -Math.PI / 2 + TAU * k); tmStroke(ctx, wd, col); }
      }
      // Swept off her feet: a column of hearts and petals from where she was up to where she floats, for half a second.
      if (Number.isFinite(s.swoonAt) && Number.isFinite(s.swoonFrom)) {
        const k = (clock - s.swoonAt) / TM_FLOAT;
        if (k >= 0 && k < 1) {
          ctx.save(); ctx.globalAlpha *= still ? .6 : 1 - k;
          const from = s.swoonFrom + r * .9, to = b.y + r * 1.2;
          for (let i = 0; i < 6; i++) { const u = i / 5, y = from + (to - from) * u * .92; tmStamp(ctx, kit, TM_SPRITE.heart(), b.x + Math.sin(i * 2.1 + (still ? 0 : k * 4)) * 9, y, Math.sin(i * 1.3) * .3, 1.2 - .45 * u); }
          for (const [u, side] of [[.33, -1], [.7, 1]]) tmStamp(ctx, kit, TM_SPRITE.petal(), b.x + side * 13, from + (to - from) * u, side * (still ? .6 : .6 + k * 3));
          ctx.restore();
        }
      }
      // Untied: the rope falls slack from the knot that was shot, its knots dropping and shrinking away.
      if (!still) for (const cut of s.parts || []) {
        if (cut.bossPart !== 'lasso' || !cut.bloomed || cut.k == null) continue;
        const age = time - (Number(cut.bloomAt) || 0); if (age < 0 || age >= .5) continue;
        const k = age / .5, at = clock - age, drop = 160 * age * age;
        const pose = []; for (let j = 0; j < TM_LASSO.knots; j++) { const q = tmKnotAt(cut, j, at); pose.push([q.x + (j - cut.k) * 6 * k, q.y + drop + Math.abs(j - cut.k) * 10 * k]); }
        ctx.save(); ctx.globalAlpha *= 1 - k;
        const head = pose.slice(0, cut.k + 1), tail = [[b.x, skirt], ...pose.slice(cut.k).reverse()];
        if (head.length > 1) tmRope(ctx, head, 4, 1.7);
        if (tail.length > 1) tmRope(ctx, tail, 4, 1.7);
        pose.forEach(([x, y], j) => { if (j !== cut.k) tmStamp(ctx, kit, j === 0 ? TM_SPRITE.head() : TM_SPRITE.knot(), x, y, (j - cut.k) * k * 2, 1 - .5 * k); });
        ctx.restore();
      }
    }
  });

  // ── The Starseed (Level 10, `core`) ──
  // She keeps her old gold star body; her look adds a face for each mood on a clean seed plate (Wishful: dreamy half-closed
  // eyes looking up, a little "o" and sparkle freckles; Dazzling: big eyes with star catchlights, a wide grin and rosy
  // cheeks; Radiant: gold-rimmed eyes, set brows and an open smile, with eight slow rays behind her). Every trick she
  // borrows is a little gold star in its guardian's costume (a ripple ring, a portal, a puffcap, fins, a gem, a rope bow),
  // tied by a dotted gold tether to the star that lent it. The Constellation Dome numbers her stars on white badges and
  // draws its pentagram as they ring; the fakes are glass-blue, coral or thorny. Tells: a ghost of each coming piece at
  // its spot, the gem arcs, the lasso's crawl line and thorns, the rocket's orbit and the comets' lines. With Animations
  // off nothing pulses, flashes, turns or streams; every badge, tether, fuse, shadow and tell stays.
  // (The kit borrows the Wishing Stars' star, glint and numbers above: both are Level 10's.)
  const STAR_LOOK = { gold: '#ffd65a', bright: '#ffe680', shade: '#f2b43c', ink: '#8a5a14', pale: '#fff4aa', glass: '#bfe3ff', glassShade: '#93c4ea',
    glassInk: '#5b8fbf', coral: '#f2a08f', coralLight: '#ffd2c6', coralShade: '#d97f6e', coralInk: '#a5574a', lilac: '#c9a6f0', lilacShade: '#a687d8',
    lilacInk: '#73559f', thorn: '#9a6a43', night: '#3b3f7a', poppy: '#f2604f', poppyInk: '#9c3530', rope: '#b9824a', ropeInk: '#6e4a25',
    plate: '#e6f7dc', plateEdge: '#e7b866', faceInk: '#5b537b', eye: '#56718d', pupil: '#2f3d5a', mouth: '#8a3f5e', tongue: '#ff9fb8', cheek: '#f2a08f',
    // Copies of bosses.js STAR numbers the art needs (art keeps no dependency on the rules).
    glassWait: .3, glassSwap: .8, fuse: 4, gemT: 1.5, gemH: 70, life: { burr: 6, arch: 4 }, arch: [36, 58, 80], ring: 118, orbit: 58, swirlR: 42 };
  // Her face, r px, for a mood (0-2) or 'hurt'; blink closes the eyes. Painted about the face's middle (art.js faceY).
  function paintStarFace(c, r, tier, blink) {
    const L = STAR_LOOK, ink = L.faceInk, hurt = tier === 'hurt', py = -r * .03;
    c.lineCap = 'round'; c.lineJoin = 'round';
    // The seed plate: clean (a little of the spiral shows through), with its gold edge and a shine.
    c.globalAlpha = .9; c.beginPath(); c.arc(0, py, r * .55, 0, TAU); c.fillStyle = L.plate; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = L.plateEdge; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.arc(0, py, r * .47, -2.65, -1.65); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5; c.stroke();
    const ex = r * .25, ey = -r * .03;
    const brow = (side, pts, width) => { c.beginPath(); c.moveTo(side * r * pts[0][0], r * pts[0][1]); c.quadraticCurveTo(side * r * pts[1][0], r * pts[1][1], side * r * pts[2][0], r * pts[2][1]); c.strokeStyle = ink; c.lineWidth = width; c.stroke(); };
    const cheeks = alpha => { c.globalAlpha = alpha; for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * r * .39, r * .17, r * .1, r * .06, side * -.2, 0, TAU); c.fillStyle = L.cheek; c.fill(); } c.globalAlpha = 1; };
    if (hurt) {
      for (const side of [-1, 1]) {
        const x = side * ex; c.beginPath(); c.moveTo(x - side * r * .09, ey - r * .08); c.lineTo(x + side * r * .06, ey); c.lineTo(x - side * r * .09, ey + r * .08);
        c.strokeStyle = ink; c.lineWidth = 1.8; c.stroke();
        brow(side, [[.12, -.3], [.24, -.33], [.38, -.25]], 1.4);
      }
      cheeks(.6);
      c.beginPath(); c.ellipse(0, r * .27, r * .075, r * .06, 0, 0, TAU); c.fillStyle = L.mouth; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.1; c.stroke();
      return;
    }
    if (tier === 0) {
      // Wishful: dreamy eyes gazing up at the sky (the lower lids raised in a soft smile, the pupils high), a small "o"
      // and two sparkle freckles.
      for (const side of [-1, 1]) {
        const x = side * ex, rx = r * .12, base = ey + r * .05;
        const lids = () => { c.beginPath(); c.moveTo(x - rx, base); c.bezierCurveTo(x - rx, ey - r * .16, x + rx, ey - r * .16, x + rx, base); c.quadraticCurveTo(x, base - r * .07, x - rx, base); c.closePath(); };
        if (blink) { c.beginPath(); c.moveTo(x - rx, base - r * .02); c.quadraticCurveTo(x, base - r * .1, x + rx, base - r * .02); c.strokeStyle = ink; c.lineWidth = 1.7; c.stroke(); }
        else {
          lids(); c.fillStyle = '#ffffff'; c.fill();
          c.save(); c.clip(); c.beginPath(); c.arc(x + side * r * .015, ey - r * .055, r * .075, 0, TAU); c.fillStyle = L.eye; c.fill();
          c.beginPath(); c.arc(x + side * r * .015, ey - r * .05, r * .038, 0, TAU); c.fillStyle = L.pupil; c.fill(); c.restore();
          lids(); c.strokeStyle = ink; c.lineWidth = 1.2; c.stroke();
          c.beginPath(); c.moveTo(x + side * rx * .8, ey - r * .085); c.lineTo(x + side * r * .17, ey - r * .13); c.lineWidth = 1.3; c.stroke();
          c.beginPath(); c.arc(x - side * r * .02, ey - r * .085, r * .026, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
        }
        brow(side, [[.13, -.27], [.26, -.37], [.39, -.31]], 1.2);
        wishGlint(c, side * r * .39, r * .16, r * .07, L.shade);
      }
      c.beginPath(); c.ellipse(0, r * .26, r * .055, r * .07, 0, 0, TAU); c.fillStyle = L.mouth; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.1; c.stroke();
      c.beginPath(); c.arc(-r * .015, r * .245, r * .018, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      return;
    }
    const radiant = tier === 2;
    for (const side of [-1, 1]) {
      const x = side * ex, rx = r * (radiant ? .115 : .13), ry = r * (radiant ? .14 : .16);
      if (blink) {
        // Happy closed eyes (Dazzling), or set ones (Radiant).
        c.beginPath();
        if (radiant) { c.moveTo(x - rx, ey); c.quadraticCurveTo(x, ey + r * .05, x + rx, ey); }
        else { c.moveTo(x - rx, ey + r * .03); c.quadraticCurveTo(x, ey - r * .09, x + rx, ey + r * .03); }
        c.strokeStyle = ink; c.lineWidth = 1.8; c.stroke();
      } else {
        // Radiant's eyes wear gold rims.
        if (radiant) { c.beginPath(); c.ellipse(x, ey, rx + 1.2, ry + 1.2, 0, 0, TAU); c.fillStyle = L.gold; c.fill(); c.strokeStyle = L.shade; c.lineWidth = .7; c.stroke(); }
        c.beginPath(); c.ellipse(x, ey, rx, ry, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = ink; c.lineWidth = radiant ? .9 : 1.2; c.stroke();
        c.beginPath(); c.arc(x, ey + r * .02, r * (radiant ? .075 : .09), 0, TAU); c.fillStyle = L.eye; c.fill();
        c.beginPath(); c.arc(x, ey + r * .025, r * .045, 0, TAU); c.fillStyle = L.pupil; c.fill();
        if (radiant) wishGlint(c, x - r * .03, ey - r * .03, r * .055, '#ffffff');
        else { wishStarPath(c, r * .06, .5, x - r * .035, ey - r * .04, .2); c.fillStyle = '#ffffff'; c.fill(); }
        c.beginPath(); c.arc(x + r * .04, ey + r * .06, r * .018, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      }
      if (radiant) brow(side, [[.12, -.29], [.25, -.43], [.41, -.34]], 2);
      else brow(side, [[.13, -.3], [.26, -.39], [.39, -.31]], 1.4);
    }
    cheeks(radiant ? .45 : .8);
    // Dazzling: a wide grin with a row of teeth; Radiant: a deeper open smile.
    const w = r * (radiant ? .17 : .22), top = r * (radiant ? .2 : .17), low = r * (radiant ? .5 : .44);
    c.beginPath(); c.moveTo(-w, top); c.quadraticCurveTo(0, top + r * .05, w, top); c.quadraticCurveTo(w * .9, low, 0, low); c.quadraticCurveTo(-w * .9, low, -w, top); c.closePath();
    c.fillStyle = L.mouth; c.fill();
    c.save(); c.clip();
    c.beginPath(); c.ellipse(0, low, w * .55, r * .09, 0, 0, TAU); c.fillStyle = L.tongue; c.fill();
    if (!radiant) { c.beginPath(); c.moveTo(-w, top - 1); c.quadraticCurveTo(0, top + r * .05 - 1, w, top - 1); c.lineTo(w, top + r * .06); c.quadraticCurveTo(0, top + r * .1, -w, top + r * .06); c.closePath(); c.fillStyle = '#ffffff'; c.fill(); }
    c.restore();
    c.beginPath(); c.moveTo(-w, top); c.quadraticCurveTo(0, top + r * .05, w, top); c.quadraticCurveTo(w * .9, low, 0, low); c.quadraticCurveTo(-w * .9, low, -w, top); c.closePath();
    c.strokeStyle = ink; c.lineWidth = 1.2; c.stroke();
  }
  // Radiant's eight rays (long and short in turn): slim gold beams with white cores, turned live behind her.
  function paintStarRays(c, r) {
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8, len = r * (k % 2 ? 1.42 : 1.62), ca = Math.cos(a), sa = Math.sin(a), at = (u, v) => [ca * u - sa * v, sa * u + ca * v];
      for (const [w, color] of [[r * .13, 'rgba(255,196,64,.92)'], [r * .05, '#fff8d8']]) {
        c.beginPath(); c.moveTo(...at(r * .95, -w)); c.quadraticCurveTo(...at(len * .8, -w * .5), ...at(len, 0)); c.quadraticCurveTo(...at(len * .8, w * .5), ...at(r * .95, w)); c.closePath();
        c.fillStyle = color; c.fill();
      }
      wishGlint(c, ...at(len + 3, 0), 2.6, '#fff8d8');
    }
  }
  // A faceted gem (gold for the real one, coral for a fake).
  function paintStarGem(c, fill, light, shade, ink) {
    c.lineJoin = 'round';
    const outline = () => { c.beginPath(); c.moveTo(-11, -3); c.lineTo(-6, -10); c.lineTo(6, -10); c.lineTo(11, -3); c.lineTo(0, 12); c.closePath(); };
    outline(); c.fillStyle = 'rgba(44,26,86,.3)'; c.save(); c.translate(.4, 1.3); c.fill(); c.restore();
    outline(); c.fillStyle = fill; c.fill();
    c.beginPath(); c.moveTo(0, -3); c.lineTo(11, -3); c.lineTo(0, 12); c.closePath(); c.fillStyle = shade; c.fill();
    c.beginPath(); c.moveTo(-11, -3); c.lineTo(-6, -10); c.lineTo(6, -10); c.lineTo(11, -3); c.closePath(); c.fillStyle = light; c.fill();
    c.beginPath(); c.moveTo(-3.5, -10); c.lineTo(3.5, -10); c.lineTo(2.6, -3); c.lineTo(-2.6, -3); c.closePath(); c.fillStyle = '#ffffff'; c.globalAlpha = .55; c.fill(); c.globalAlpha = 1;
    c.beginPath(); c.moveTo(-11, -3); c.lineTo(11, -3); c.moveTo(-5.5, -3); c.lineTo(0, 12); c.lineTo(5.5, -3); c.strokeStyle = ink; c.lineWidth = .8; c.globalAlpha = .55; c.stroke(); c.globalAlpha = 1;
    outline(); c.strokeStyle = ink; c.lineWidth = 1.4; c.stroke();
    wishGlint(c, -5, -6.5, 2.6, '#ffffff');
  }
  // Old Sunny's portal (gold rim, five studs) or the Ammonite Queen's (a ribbed lilac shell rim), the lent star in its hole.
  function paintStarPortal(c, pearl) {
    const L = STAR_LOOK, r = 14;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = '#2c2152'; c.fill();
    c.beginPath(); for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU * 1.5, d = r * .8 * (1 - i / 32); if (i) c.lineTo(Math.cos(a) * d, Math.sin(a) * d); else c.moveTo(d, 0); }
    c.strokeStyle = '#5d4b9c'; c.lineWidth = 1.5; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = pearl ? L.lilacInk : L.ink; c.lineWidth = 6; c.stroke();
    c.strokeStyle = pearl ? L.lilac : L.gold; c.lineWidth = 4; c.stroke();
    if (pearl) {
      c.beginPath(); for (let k = 0; k < 12; k++) { const a = k * TAU / 12 + .2, ca = Math.cos(a), sa = Math.sin(a); c.moveTo(ca * (r - 2), sa * (r - 2)); c.lineTo(ca * (r + 2), sa * (r + 2)); }
      c.strokeStyle = L.lilacShade; c.lineWidth = 1.2; c.stroke();
      c.beginPath(); c.arc(0, 0, r + 1, -2.6, -1.4); c.strokeStyle = '#f3eaff'; c.lineWidth = 1.2; c.stroke();
    } else {
      c.beginPath(); c.arc(0, 0, r + .8, -2.6, -1.5); c.strokeStyle = '#fff6cf'; c.lineWidth = 1.2; c.stroke();
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5; c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r, 2.3, 0, TAU); c.fillStyle = L.bright; c.fill(); c.strokeStyle = L.ink; c.lineWidth = .9; c.stroke(); }
    }
    wishBody(c, 7.5);
  }
  // Mother Morel's partner in lilac, a gold star on its cap.
  function paintStarWaltz(c) {
    const L = STAR_LOOK, r = 12;
    c.beginPath(); c.moveTo(-r * .42, r * .5); c.quadraticCurveTo(0, r * 1.15, r * .42, r * .5); c.closePath(); c.fillStyle = '#f1e4f7'; c.fill(); c.strokeStyle = L.lilacInk; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.ellipse(0, 0, r, r * .88, 0, 0, TAU); c.fillStyle = L.lilac; c.fill();
    c.save(); c.clip(); c.beginPath(); c.ellipse(r * .25, r * .3, r, r * .88, 0, 0, TAU); c.rect(-r * 2, -r * 2, r * 4, r * 4); c.fillStyle = L.lilacShade; c.fill('evenodd'); c.restore();
    c.beginPath(); c.ellipse(0, 0, r, r * .88, 0, 0, TAU); c.strokeStyle = L.lilacInk; c.lineWidth = 1.5; c.stroke();
    for (const [sx, sy, sr] of [[-.5, .15, .13], [.42, .3, .1], [.12, .52, .09]]) { c.beginPath(); c.arc(sx * r, sy * r, sr * r, 0, TAU); c.fillStyle = '#ece0ff'; c.fill(); }
    c.beginPath(); c.arc(-r * .35, -r * .25, r * .34, 3.5, 4.6); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 1.6; c.lineCap = 'round'; c.stroke();
    c.save(); c.translate(0, -r * .5); wishBody(c, 6.5); c.restore();
  }
  // Ember Rose's firework: a gold star on two poppy fins and a nozzle (all white for its last-second flash).
  function paintStarRocket(c, white) {
    // A firework: the star rides a striped paper tube with two little fins, its fuse (drawn live) at the tube's foot.
    const L = STAR_LOOK, tube = () => { c.beginPath(); c.moveTo(-4.6, 4); c.lineTo(4.6, 4); c.lineTo(4.6, 17); c.quadraticCurveTo(0, 19, -4.6, 17); c.closePath(); };
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * 4.2, 10); c.quadraticCurveTo(side * 9.5, 13, side * 10, 19.5); c.quadraticCurveTo(side * 7, 17.6, side * 4.2, 17.4); c.closePath();
      c.fillStyle = white ? '#ffffff' : L.poppy; c.fill(); if (!white) { c.strokeStyle = L.poppyInk; c.lineWidth = 1.1; c.stroke(); }
    }
    tube(); c.fillStyle = '#ffffff'; c.fill();
    if (!white) {
      c.save(); tube(); c.clip(); c.beginPath(); for (let y = 0; y < 24; y += 5) { c.moveTo(-6, y); c.lineTo(6, y + 4.5); } c.strokeStyle = L.poppy; c.lineWidth = 2.6; c.stroke(); c.restore();
      tube(); c.strokeStyle = L.poppyInk; c.lineWidth = 1.2; c.stroke();
    }
    if (white) { wishStarPath(c, 12.6, .52); c.fillStyle = '#ffffff'; c.fill(); }
    else wishBody(c, 12);
  }
  // Rootknot's knot: a gold star tied round its middle with a rope bow.
  function paintStarKnot(c) {
    const L = STAR_LOOK;
    wishBody(c, 12.5);
    c.save(); wishStarPath(c, 12.5, .52); c.clip();
    c.beginPath(); c.moveTo(-14, 2); c.quadraticCurveTo(0, 5.5, 14, 2); c.strokeStyle = L.ropeInk; c.lineWidth = 4.2; c.stroke(); c.strokeStyle = L.rope; c.lineWidth = 2.6; c.stroke();
    c.beginPath(); for (let x = -10; x <= 10; x += 3.4) { const y = 2 + 3.5 * (1 - (x / 14) * (x / 14)); c.moveTo(x - 1, y - 1.2); c.lineTo(x + 1, y + 1.2); } c.strokeStyle = L.ropeInk; c.lineWidth = .7; c.stroke();
    c.restore();
    c.lineCap = 'round';
    for (const side of [-1, 1]) {
      c.beginPath(); c.ellipse(side * 4, .5, 4, 2.4, side * -.45, 0, TAU); c.strokeStyle = L.ropeInk; c.lineWidth = 2.8; c.stroke(); c.strokeStyle = L.rope; c.lineWidth = 1.5; c.stroke();
      c.beginPath(); c.moveTo(side * .8, 4.5); c.quadraticCurveTo(side * 2.5, 7.5, side * 3.5, 10); c.strokeStyle = L.ropeInk; c.lineWidth = 2.6; c.stroke(); c.strokeStyle = L.rope; c.lineWidth = 1.3; c.stroke();
    }
    c.beginPath(); c.arc(0, 4.2, 2, 0, TAU); c.fillStyle = L.rope; c.fill(); c.strokeStyle = L.ropeInk; c.lineWidth = 1; c.stroke();
  }
  // A lasso thorn: a coral ball with six short spikes.
  function paintStarThorn(c) {
    const L = STAR_LOOK;
    c.lineJoin = 'round';
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + k * TAU / 6, ca = Math.cos(a), sa = Math.sin(a);
      c.beginPath(); c.moveTo(ca * 6.5 - sa * 2.8, sa * 6.5 + ca * 2.8); c.lineTo(ca * 12.5, sa * 12.5); c.lineTo(ca * 6.5 + sa * 2.8, sa * 6.5 - ca * 2.8); c.closePath();
      c.fillStyle = L.thorn; c.fill(); c.strokeStyle = '#5e3f24'; c.lineWidth = .9; c.stroke();
    }
    c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fillStyle = L.coral; c.fill();
    c.save(); c.clip(); c.beginPath(); c.arc(2.5, 3, 8, 0, TAU); c.rect(-12, -12, 24, 24); c.fillStyle = L.coralShade; c.fill('evenodd'); c.restore();
    c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.strokeStyle = L.coralInk; c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.arc(-2.5, -2.6, 3.4, 3.4, 4.7); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.4; c.lineCap = 'round'; c.stroke();
  }
  // The gem burr: three pink and lilac crystals on a rock 40 px wide (its middle on the wall's line).
  function paintStarBurr(c) {
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-21, 4); c.quadraticCurveTo(-20, -3, -11, -3.5); c.quadraticCurveTo(-3, -6, 5, -4); c.quadraticCurveTo(16, -5, 20, 0); c.quadraticCurveTo(22, 6, 14, 7);
    c.lineTo(-15, 7); c.quadraticCurveTo(-22, 8, -21, 4); c.closePath(); c.fillStyle = '#8d6b8c'; c.fill(); c.strokeStyle = '#4b2f4d'; c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.moveTo(-16, 2); c.quadraticCurveTo(-6, -.5, 6, 1); c.strokeStyle = '#b392b1'; c.lineWidth = 1.1; c.stroke();
    for (const [x, h, w, tilt, light, dark] of [[-10, 18, 8, -.32, '#e6cdfb', '#b18ae0'], [11, 15, 7, .34, '#e6cdfb', '#b18ae0'], [1, 26, 9, .04, '#ffd0e6', '#ef8fc0']]) {
      c.save(); c.translate(x, -2); c.rotate(tilt);
      const top = -h, shoulder = -h + w * .7;
      c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, shoulder); c.lineTo(0, top); c.lineTo(0, 0); c.closePath(); c.fillStyle = light; c.fill();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, top); c.lineTo(w / 2, shoulder); c.lineTo(w / 2, 0); c.closePath(); c.fillStyle = dark; c.fill();
      c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, shoulder); c.lineTo(0, top); c.lineTo(w / 2, shoulder); c.lineTo(w / 2, 0); c.strokeStyle = '#6b3f7a'; c.lineWidth = 1.2; c.stroke();
      c.beginPath(); c.moveTo(-w * .22, -2); c.lineTo(-w * .22, shoulder + 1.5); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1; c.stroke();
      c.restore();
    }
    wishGlint(c, -1, -24, 2.6, '#ffffff');
  }
  // A thorn arch: one curved vine through its three points (pts, about the middle one), thorns along it, two gold buds.
  function paintStarArch(c, pts) {
    const L = STAR_LOOK, [a, m, b] = pts, ext = (p, q, d) => { const dx = p[0] - q[0], dy = p[1] - q[1], n = Math.hypot(dx, dy) || 1; return [p[0] + dx / n * d, p[1] + dy / n * d]; };
    const s = ext(a, m, 5), e = ext(b, m, 5), cx = 2 * m[0] - (s[0] + e[0]) / 2, cy = 2 * m[1] - (s[1] + e[1]) / 2;
    const at = u => [(1 - u) * (1 - u) * s[0] + 2 * u * (1 - u) * cx + u * u * e[0], (1 - u) * (1 - u) * s[1] + 2 * u * (1 - u) * cy + u * u * e[1]];
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 1; i < 12; i++) {
      const u = i / 12, [x, y] = at(u), [x2, y2] = at(u + .01), tx = x2 - x, ty = y2 - y, n = Math.hypot(tx, ty) || 1, side = i % 2 ? 1 : -1, nx = -ty / n * side, ny = tx / n * side;
      c.beginPath(); c.moveTo(x - tx / n * 3.2, y - ty / n * 3.2); c.quadraticCurveTo(x + nx * 5 - tx / n, y + ny * 5 - ty / n, x + nx * 10.5 + tx / n * 2, y + ny * 10.5 + ty / n * 2); c.lineTo(x + tx / n * 3.2, y + ty / n * 3.2); c.closePath();
      c.fillStyle = L.thorn; c.fill(); c.strokeStyle = '#5e3f24'; c.lineWidth = .9; c.stroke();
      c.beginPath(); c.arc(x + nx * 9.6 + tx / n * 1.8, y + ny * 9.6 + ty / n * 1.8, 1.3, 0, TAU); c.fillStyle = L.coral; c.fill();
    }
    c.beginPath(); c.moveTo(s[0], s[1]); c.quadraticCurveTo(cx, cy, e[0], e[1]);
    c.strokeStyle = '#3f5a35'; c.lineWidth = 8.5; c.stroke(); c.strokeStyle = '#7d9a52'; c.lineWidth = 5.2; c.stroke();
    c.save(); c.translate(-.8, -1.2); c.beginPath(); c.moveTo(s[0], s[1]); c.quadraticCurveTo(cx, cy, e[0], e[1]); c.strokeStyle = '#c3d98e'; c.lineWidth = 1.3; c.stroke(); c.restore();
    for (const u of [.3, .74]) { const [x, y] = at(u); c.save(); c.translate(x, y - 1); wishBody(c, 4.5); c.restore(); }
  }
  // A comet's head: a gold star with a white core and a night-blue edge.
  function paintStarComet(c) { wishBody(c, 12, STAR_LOOK.gold, STAR_LOOK.shade, STAR_LOOK.night); c.beginPath(); c.arc(-.4, .6, 3.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.92)'; c.fill(); }
  // A numbered dome badge: a white disk, its ink edge and the number.
  function paintStarPip(c, n) { c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = STAR_LOOK.ink; c.lineWidth = 1; c.stroke(); wishDigit(c, n, 0, .3, 9.4, STAR_LOOK.ink, 2.1); }
  // Glass-blue twin of a lent star (Crystal Heart's fake), with a white diagonal facet.
  function paintStarGlass(c) {
    const L = STAR_LOOK;
    wishBody(c, 12.5, L.glass, L.glassShade, L.glassInk, 'rgba(255,255,255,.7)');
    c.save(); wishStarPath(c, 12.5, .52); c.clip();
    c.beginPath(); c.moveTo(-11, 5); c.lineTo(5, -11); c.lineTo(9, -7); c.lineTo(-7, 9); c.closePath(); c.fillStyle = 'rgba(255,255,255,.65)'; c.fill();
    c.restore();
  }
  const STAR_SPRITES = {
    face: (r, tier, blink) => [`core:face:${r}:${tier}${blink ? ':blink' : ''}`, [-r * .62, -r * .64, r * .62, r * .58], c => paintStarFace(c, r, tier, blink)],
    rays: r => [`core:rays:${r}`, [-r * 1.92, -r * 1.92, r * 1.92, r * 1.92], c => paintStarRays(c, r)],
    swirlstar: ['core:lent:swirlstar', [-18, -15, 18, 16], c => {
      c.beginPath(); c.ellipse(0, 9, 16, 5, 0, 0, TAU); c.fillStyle = 'rgba(127,214,232,.6)'; c.fill(); c.strokeStyle = '#e9fbff'; c.lineWidth = 1.3; c.stroke();
      c.beginPath(); c.ellipse(0, 9.5, 10, 3, 0, 0, TAU); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1; c.stroke();
      wishBody(c, 12.5);
    }],
    portal: ['core:lent:portal', [-19, -19, 19, 19], c => paintStarPortal(c, false)],
    pearl: ['core:lent:pearl', [-19, -19, 19, 19], c => paintStarPortal(c, true)],
    waltz: ['core:lent:waltz', [-14, -15, 14, 15], paintStarWaltz],
    rocket: ['core:lent:rocket', [-15, -15, 15, 22], c => paintStarRocket(c, false)],
    flash: ['core:flash:rocket', [-15, -15, 15, 22], c => paintStarRocket(c, true)],
    glass: ['core:lent:glass', [-15, -15, 15, 15], c => wishBody(c, 12.5)],
    glassFake: ['core:glass:fake', [-15, -15, 15, 15], paintStarGlass],
    gem: ['core:lent:gem', [-13, -12, 13, 15], c => paintStarGem(c, STAR_LOOK.gold, STAR_LOOK.bright, STAR_LOOK.shade, STAR_LOOK.ink)],
    gemFake: ['core:gem:fake', [-13, -12, 13, 15], c => paintStarGem(c, STAR_LOOK.coral, STAR_LOOK.coralLight, STAR_LOOK.coralShade, STAR_LOOK.coralInk)],
    knot: ['core:lent:knot', [-15, -15, 15, 15], paintStarKnot],
    thorn: ['core:thorn', [-14, -14, 14, 14], paintStarThorn],
    comet: ['core:comet', [-15, -15, 15, 15], paintStarComet],
    sat: kit => ['core:sat', [-19, -19, 19, 19], c => kit.paintTargetPart(c, 'satellite', 'core', 11, true, true)],
    pip: n => [`core:pip:${n}`, [-10, -10, 10, 10], c => paintStarPip(c, n)],
    burr: ['core:burr', [-24, -31, 24, 9], paintStarBurr],
    ghost: ['core:ghost', [-13, -13, 13, 13], c => { wishStarPath(c, 11, .52); c.fillStyle = 'rgba(255,244,170,.3)'; c.fill(); c.strokeStyle = STAR_LOOK.pale; c.lineWidth = 1.5; c.stroke(); }],
    mark: ['core:mark', [-8, -8, 8, 8], c => wishBody(c, 6)]
  };
  const starStamp = (ctx, kit, [key, box, paint], x, y, turn = 0, sx = 1, sy = sx) => stamp(ctx, kit, key, box, paint, x, y, turn, sx, sy);
  // A thorn arch's sprite from its three points about the middle one (the arch's shape on a side never changes).
  function starArchSprite(side, rel) {
    const xs = rel.map(q => q[0]), ys = rel.map(q => q[1]), box = [Math.min(...xs) - 16, Math.min(...ys) - 16, Math.max(...xs) + 16, Math.max(...ys) + 16].map(Math.round);
    return [`core:arch:${side}`, box, c => paintStarArch(c, rel)];
  }
  const STAR_LENT = { swirlstar: 'swirlstar', waltz: 'waltz', rocket: 'rocket', knot: 'knot', thorn: 'thorn', comet: 'comet' };
  // The move's label (art.js drawBossWarning) is drawn before the kit's `over`: a tell on top of it fades to keep it readable.
  const STAR_LABELS = new Map();
  function starLabel(ctx, w) {
    const text = String(w.text || 'A guardian is stirring');
    let lw = STAR_LABELS.get(text);
    if (lw == null) { ctx.save(); ctx.font = '600 12px Fredoka'; lw = Math.min(310, Math.max(130, Number(ctx.measureText(text).width) + 28 || 130)); ctx.restore(); STAR_LABELS.set(text, lw); }
    return { x: clamp(w.x, lw / 2 + 10, 410 - lw / 2), y: clamp(w.y + 61, 45, 395), w: lw };
  }
  // How much a star on her ring dims while it crosses the move's label (1 = not at all, down to .4), so the words stay readable.
  function starShy(ctx, s, bud, time) {
    const w = s.warning, boss = s.boss;
    if (!boss || boss.bloomed || !w || !Number.isFinite(w.until) || !(w.until > w.at) || !(time < w.until) || !Number.isFinite(w.x) || !Number.isFinite(w.y)) return 1;
    const label = starLabel(ctx, w), r = Number(bud.r) || 11, out = Math.max(Math.abs(bud.x - label.x) - label.w / 2, Math.abs(bud.y - label.y) - 13);
    return 1 - .6 * clamp((r - out) / 8, 0, 1);
  }
  // A tell's filling ring (art.js marks every target but a portal this way; the portal's is drawn here).
  function starRing(ctx, kit, x, y, r, p, still) {
    ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash([4, 4]); kit.circle(ctx, x, y, r, null, '#fff6ce', 3); ctx.setLineDash([]);
    if (!still) { ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.strokeStyle = STAR_LOOK.gold; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  }
  // The tells of her current warning, filling as its 1.3 s runs.
  function starTells(ctx, s, w, time, still, kit) {
    const L = STAR_LOOK, boss = s.boss, p = clamp((time - w.at) / Math.max(.1, w.until - w.at), 0, 1), since = time - w.at, label = starLabel(ctx, w), T = w.targets || [];
    const shy = (x, y, r) => Math.abs(x - label.x) < label.w / 2 + r && Math.abs(y - label.y) < 13 + r * .4 ? .35 : 1;
    const grow = k => still ? 1 : k <= 0 ? 0 : kit.easeBack(clamp(k, 0, 1));
    const ghost = (sprite, x, y, r, scale, alpha = .6) => { if (scale <= .01) return; ctx.save(); ctx.globalAlpha *= alpha * shy(x, y, r); starStamp(ctx, kit, sprite, x, y, 0, scale); ctx.restore(); };
    const S = STAR_SPRITES;
    switch (w.move) {
      // The rider appears at the swirl's top (bosses.js STAR.swirl: radius 42, starting straight up), not in its middle.
      case 'swirl': for (const t of T) if (t.role === 'swirl') ghost(S.swirlstar, t.x, t.y - L.swirlR, 16, grow(p * 2.5)); break;
      case 'portal': case 'pearl': {
        const t = T.find(t => t.role === 'portal');
        if (!t) break;
        ghost(w.move === 'pearl' ? S.pearl : S.portal, t.x, t.y, 19, .3 + .7 * kit.smooth(p), .7);
        ctx.save(); ctx.globalAlpha *= shy(t.x, t.y, 23); starRing(ctx, kit, t.x, t.y, 23, p, still); ctx.restore();
        break;
      }
      case 'waltz': for (const t of T) if (t.role === 'waltz') ghost(S.waltz, t.x, t.y, 15, grow(p * 2.5)); break;
      case 'rocket': {
        const t = T.find(t => t.role === 'rocket');
        if (!t || !boss) break;
        // Her rocket circles her at STAR.rocket.R (58 px): the ring follows her, whatever she has drifted since the warning.
        const R = L.orbit, ring = [];
        for (let k = 0; k <= 48; k++) { const a = k / 48 * TAU; ring.push([boss.x + Math.cos(a) * R, boss.y + Math.sin(a) * R]); }
        ctx.save(); ctx.globalAlpha *= .3 + .45 * p; dotted(ctx, ring, L.pale, 1.2, 8, still ? 0 : time * 12); ctx.restore();
        ghost(S.rocket, t.x, t.y, 16, grow(p * 2.5));
        break;
      }
      case 'glass': for (const t of T) if (t.role === 'glass') ghost(t.real ? S.glass : S.glassFake, t.x, t.y, 13, grow(p * 2.5 - (t.slot || 0) * .3), t.real ? .85 : .65); break;
      case 'gem': {
        if (!boss) break;
        const x0 = boss.x, y0 = boss.y + (Number(boss.r) || 27);
        // The gold gem's arc is gold and its landing spot shows a gold gem (the one to catch); the coral ones show coral.
        for (const t of T) if (t.role === 'gem') {
          const arc = []; for (let k = 0; k <= 18; k++) { const q = lobAt(x0, y0, t.x, t.y, 1, k / 18 * p, L.gemH); arc.push([q.x, q.y]); }
          ctx.save(); ctx.globalAlpha *= t.real ? .9 : .6; dotted(ctx, arc, t.real ? L.gold : L.pale, t.real ? 1.6 : 1.3, 7); ctx.restore();
          ghost(t.real ? S.gem : S.gemFake, t.x, t.y, 13, grow(p * 2.5 - (t.slot || 0) * .3), t.real ? .9 : .55);
        }
        break;
      }
      case 'lasso': {
        const knot = T.find(t => t.role === 'knot');
        if (!knot || !boss) break;
        ctx.save(); ctx.globalAlpha *= .75;
        dotted(ctx, [[boss.x, boss.y], [boss.x + (knot.x - boss.x) * p, boss.y + (knot.y - boss.y) * p]], L.gold, 1.4, 7, still ? 0 : wishCrawl(time, 14, 7));
        ctx.restore();
        T.filter(t => t.role === 'arch').forEach((t, k) => ghost(S.thorn, t.x, t.y, 12, grow(p * 2.2 - k * .3), .7));
        break;
      }
      case 'dome': for (const t of T) {
        if (t.role !== 'satellite' || !t.pip) continue;
        const sat = (s.parts || []).find(q => q.id === t.id) || t;
        ghost(S.pip(t.pip), sat.x, sat.y, 8, grow((since - .2 * (t.pip - 1)) / .2), .9);
      } break;
      case 'starfall': for (const t of T) {
        if (t.role !== 'comet') continue;
        labelTell(ctx, w, () => { ctx.save(); ctx.globalAlpha *= .7; dotted(ctx, [[t.x0, t.y0], [t.x0 + (t.x1 - t.x0) * p, t.y0 + (t.y1 - t.y0) * p]], L.pale, 1.4, 8); ctx.restore(); });
        ghost(S.ghost, t.x1, t.y1, 11, .5 + .5 * p, .3 + .45 * p);
      } break;
      default: break;
    }
  }
  kitLook('core', {
    warm(kit) {
      const r = 27, jobs = [...[0, 1, 2].flatMap(t => [STAR_SPRITES.face(r, t, false), STAR_SPRITES.face(r, t, true)]), STAR_SPRITES.face(r, 'hurt', false), STAR_SPRITES.rays(r),
        STAR_SPRITES.sat(kit), ...[1, 2, 3, 4, 5].map(n => STAR_SPRITES.pip(n)), ...['swirlstar', 'portal', 'pearl', 'waltz', 'rocket', 'flash', 'glass', 'glassFake', 'gem', 'gemFake',
          'knot', 'thorn', 'comet', 'burr', 'ghost', 'mark'].map(k => STAR_SPRITES[k])];
      for (const side of [0, 1]) {
        // bosses.js starArch: the arch's three points round the launcher (210, 498), about the middle one.
        const pts = STAR_LOOK.arch.map(d => [(side ? 1 : -1) * STAR_LOOK.ring * Math.cos(d * Math.PI / 180), -STAR_LOOK.ring * Math.sin(d * Math.PI / 180)]);
        jobs.push(starArchSprite(side, pts.map(q => [q[0] - pts[1][0], q[1] - pts[1][1]])));
      }
      for (const lit of [true, false]) jobs.push([`core:ring:11:${lit}`, [-18.95, -18.95, 18.95, 18.95], c => kit.paintTargetPart(c, 'satellite', 'core', 11, lit, true)]);
      for (const [key, box, paint] of jobs) kit.atlasSprite(key, box[0], box[1], box[2], box[3], paint);
    },
    under(ctx, state, s, time, still, kit, quality) {
      const L = STAR_LOOK, boss = s.boss, live = boss && !boss.bloomed, parts = s.parts || [];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // Radiant: eight short rays turning slowly behind her.
      if (live && (s.tier | 0) >= 2 && quality < 2) { ctx.save(); ctx.globalAlpha *= still ? .9 : .8 + .15 * Math.sin(time * 2.2); starStamp(ctx, kit, STAR_SPRITES.rays(Number(boss.r) || 27), boss.x, boss.y, still ? 0 : time * .2); ctx.restore(); }
      // The dome's pentagram, 1 to 5 and back to 1: gold where both stars have rung (grey once a star broke out of turn), dotted where they have not.
      const dome = s.dome;
      if (dome) {
        const pips = []; for (const p of parts) if (p.bossPart === 'satellite' && p.pip) pips[p.pip] = p;
        const broken = pips.filter(p => p && p.bloomed).length > (dome.rings || 0), rung = [];
        for (let k = 1; k <= 5; k++) {
          const a = pips[k], b = pips[k % 5 + 1];
          if (!a || !b) continue;
          if (a.bloomed && b.bloomed) rung.push([a, b]);
          else if (quality <= 1) { ctx.save(); ctx.globalAlpha *= .38; dotted(ctx, [[a.x, a.y], [b.x, b.y]], L.pale, 1, 7); ctx.restore(); }
        }
        if (rung.length) {
          ctx.beginPath(); for (const [a, b] of rung) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
          if (broken) { ctx.strokeStyle = '#c9c1b3'; ctx.lineWidth = 1.6; ctx.stroke(); }
          else { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = L.gold; ctx.lineWidth = 2; ctx.stroke(); }
        }
      }
      // Tethers: a dotted gold line from each lending star (or her, lending her own) to the piece it lent.
      for (const p of parts) {
        if (!p.lent || p.bloomed || p.closed || p.hidden) continue;
        const from = p.lender != null && parts.find(q => q.id === p.lender) || boss;
        if (!from) continue;
        const dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy), a = (Number(from.r) || 11) + 3, b = (Number(p.r) || 12) + 5;
        if (d < a + b + 6) continue;
        const ax = from.x + dx / d * a, ay = from.y + dy / d * a, bx = p.x - dx / d * b, by = p.y - dy / d * b;
        let pts = [[ax, ay], [bx, by]];
        if (from !== boss && boss) {
          // A star across from its piece: the line bows round her rather than over her face.
          const sx = bx - ax, sy = by - ay, l2 = sx * sx + sy * sy || 1, u = clamp(((boss.x - ax) * sx + (boss.y - ay) * sy) / l2, 0, 1);
          const cx = ax + sx * u, cy = ay + sy * u, gap = Math.hypot(cx - boss.x, cy - boss.y), clear = (Number(boss.r) || 27) + 14;
          if (gap < clear) {
            const l = Math.sqrt(l2), nx = gap > .5 ? (cx - boss.x) / gap : -sy / l, ny = gap > .5 ? (cy - boss.y) / gap : sx / l, qx = cx + nx * 2 * (clear - gap), qy = cy + ny * 2 * (clear - gap);
            pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12, m = 1 - t; pts.push([m * m * ax + 2 * m * t * qx + t * t * bx, m * m * ay + 2 * m * t * qy + t * t * by]); }
          }
        }
        ctx.save(); ctx.globalAlpha *= .8;
        dotted(ctx, pts, L.gold, 1.1, 6, still ? 0 : wishCrawl(time, 10, 6));
        ctx.restore();
      }
      // Starfall: each comet's line on to its end, and a ghost star waiting there.
      for (const p of parts) {
        if (p.bossPart !== 'comet' || p.bloomed || p.closed) continue;
        ctx.save(); ctx.globalAlpha *= .55; dotted(ctx, [[p.x1, p.y1], [p.x, p.y]], L.pale, 1.3, 8); ctx.restore();
        ctx.save(); ctx.globalAlpha *= .55; starStamp(ctx, kit, STAR_SPRITES.ghost, p.x1, p.y1); ctx.restore();
      }
    },
    part(ctx, state, s, bud, time, still, kit, quality) {
      const L = STAR_LOOK, role = bud.bossPart, S = STAR_SPRITES, clock = Number(s.kitAge) || 0, age = clock - (Number(bud.born) || 0);
      if (role === 'satellite') {
        const shy = starShy(ctx, s, bud, time);
        if (!s.dome || !bud.pip || bud.bloomed) {
          if (shy >= 1) return false;
          // art.js's own satellite (sprite, the faded bloomed one, its health arc), dimmed while it crosses the label.
          const r = Math.max(3, Math.round(Number(bud.r) || 12)), e = r * 1.45 + 3, lit = !bud.bloomed && bud.lit !== false && !(bud.hp === 0);
          ctx.save(); ctx.globalAlpha *= shy * (bud.bloomed ? .28 : 1);
          starStamp(ctx, kit, [`core:ring:${r}:${lit}`, [-e, -e, e, e], c => kit.paintTargetPart(c, 'satellite', 'core', r, lit, true)], bud.x, bud.y);
          if (!bud.bloomed && Number(bud.maxHp) > 1) {
            ctx.beginPath(); ctx.arc(bud.x, bud.y, r + 3.5, -.5 * Math.PI, -.5 * Math.PI + TAU * clamp((Number(bud.hp) || 0) / bud.maxHp, 0, 1)); ctx.strokeStyle = '#fff4c5'; ctx.lineWidth = 1.4; ctx.stroke();
          }
          ctx.restore();
          return true;
        }
        // A dome star: whole, with its number (one hit, so no health arc); the next one pulses inside a gold halo.
        const next = bud.pip === s.dome.next, k = next && !still ? 1 + .08 * Math.sin(TAU * 1.6 * time) : 1;
        ctx.save(); ctx.globalAlpha *= shy;
        if (next) { kit.circle(ctx, bud.x, bud.y, 17 * k, null, '#ffffff', 3.6); kit.circle(ctx, bud.x, bud.y, 17 * k, null, L.gold, 2); }
        else ctx.globalAlpha *= .75;
        starStamp(ctx, kit, S.sat(kit), bud.x, bud.y, 0, k); starStamp(ctx, kit, S.pip(bud.pip), bud.x, bud.y, 0, k);
        ctx.restore();
        return true;
      }
      let sprite = null;
      if (role === 'portal') sprite = bud.pearly ? S.pearl : S.portal;
      else if (role === 'glass') {
        // The real glass star hides as glass while they shuffle (a little cup game), then shows gold again.
        const shuffling = !still && bud.real && age >= L.glassWait && age < L.glassWait + L.glassSwap;
        sprite = bud.real && !shuffling ? S.glass : S.glassFake;
      } else if (role === 'gem') sprite = bud.real ? S.gem : S.gemFake;
      else if (STAR_LENT[role]) sprite = S[STAR_LENT[role]];
      else return false;
      // A new piece pops in (.25 s).
      const pop = still ? 1 : kit.easeBack(clamp(age / .25, 0, 1));
      if (pop <= .01) return true;
      if (role === 'gem' && Number.isFinite(bud.x1)) {
        // Its shadow waits where it will land, growing as it falls.
        const u = clamp(age / L.gemT, 0, 1);
        ctx.save(); ctx.globalAlpha *= .14 + .26 * u; ctx.beginPath(); ctx.ellipse(bud.x1, bud.y1 + 8, 5 + 9 * u, 2 + 2.6 * u, 0, 0, TAU); ctx.fillStyle = '#2a1a4a'; ctx.fill(); ctx.restore();
      }
      if (role === 'comet' && Number.isFinite(bud.x1)) {
        // Its tail: circles back along its line, smaller and fainter (the two nearest at quality 1 and 2).
        const dx = bud.x0 - bud.x1, dy = bud.y0 - bud.y1, d = Math.hypot(dx, dy) || 1, n = quality >= 1 ? 2 : 4;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = n; k >= 1; k--) kit.circle(ctx, bud.x + dx / d * 8 * k, bud.y + dy / d * 8 * k, 8.5 - 1.5 * k, `rgba(255,214,110,${.7 - .13 * k})`);
        ctx.restore();
      }
      if (role === 'rocket') {
        // The fuse burns down from the nozzle over its 4 s, a spark at its tip; in its last second it flashes white.
        const left = clamp((L.fuse - age) / L.fuse, 0, 1), len = 12 * left, tip = 18 + len, wig = still ? 0 : Math.sin(time * 9) * 1.2;
        if (len > .5) {
          ctx.beginPath(); ctx.moveTo(bud.x, bud.y + 18); ctx.quadraticCurveTo(bud.x + 3 + wig, bud.y + 18 + len * .5, bud.x + wig * .5, bud.y + tip);
          ctx.strokeStyle = '#6e4a25'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.stroke();
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; kit.circle(ctx, bud.x + wig * .5, bud.y + tip, still ? 4.5 : 4 + Math.abs(Math.sin(time * 17)) * 1.5, 'rgba(255,150,60,.55)'); ctx.restore();
        kit.circle(ctx, bud.x + wig * .5, bud.y + tip, 2.4, 'rgba(255,214,90,.9)');
        kit.sparkle(ctx, bud.x + wig * .5, bud.y + tip, still ? 3.6 : 3.2 + Math.abs(Math.sin(time * 23)) * 1.6, '#ffffff', still ? .3 : time * 7);
        const last = age >= L.fuse - 1;
        if (last && still) starStamp(ctx, kit, S.flash, bud.x, bud.y, 0, 1.18 * pop);
        starStamp(ctx, kit, sprite, bud.x, bud.y, 0, pop);
        if (last && !still && Math.floor((age - (L.fuse - 1)) / .25) % 2 === 0) { ctx.save(); ctx.globalAlpha *= .85; starStamp(ctx, kit, S.flash, bud.x, bud.y, 0, pop); ctx.restore(); }
        return true;
      }
      starStamp(ctx, kit, sprite, bud.x, bud.y, 0, pop);
      return true;
    },
    face(ctx, state, s, bud, time, still, kit) {
      if (!bud.boss) return false;
      const r = Number(bud.r) || 27, look = kit.BOSS_LOOKS.core || {}, health = (Number(bud.hp) || 0) / Math.max(1, Number(bud.maxHp) || 1), tier = clamp(s.tier | 0, 0, 2);
      // The face moves with her body: the Supernova's stretch (art.js bossBodyPose) and the shiver near the end (bossWobble).
      ctx.translate(bud.x, bud.y);
      if (!still && s.mode === 'supernova') { const k = 1 + Math.sin(time * 8) * .025; ctx.scale(k, k); }
      if (!still && health <= .2) ctx.rotate(Math.sin(time * TAU * 6) * .04);
      ctx.translate(r * (look.faceX || 0), r * (look.faceY != null ? look.faceY : .03));
      const hurt = typeof bud.hitAt === 'number' && time - bud.hitAt >= 0 && time - bud.hitAt < .3, blink = !still && time % 3.4 < .12;
      starStamp(ctx, kit, hurt ? STAR_SPRITES.face(r, 'hurt', false) : STAR_SPRITES.face(r, tier, blink), 0, 0);
      return true;
    },
    over(ctx, state, s, time, still, kit) {
      const L = STAR_LOOK, w = s.warning, boss = s.boss, clock = Number(s.kitAge) || 0;
      if (boss && !boss.bloomed && w && Number.isFinite(w.until) && w.until > w.at && time < w.until) starTells(ctx, s, w, time, still, kit);
      // Her rocks on the board (art.js leaves kitDrawn walls to her): gem burrs and thorn arches, popping in and fading out
      // over their last half second.
      const arches = [[], []];
      for (const b of state.bumpers || []) {
        if (!b.kitDrawn || !(b.burr || b.thorn)) continue;
        if (b.thorn) { arches[b.x < 210 ? 0 : 1].push(b); continue; }
        const left = (Number(b.kitUntil) || 0) - clock, k = still ? 1 : kit.easeBack(clamp((L.life.burr - left) / .3, 0, 1));
        ctx.save(); ctx.globalAlpha *= clamp(left / .5, 0, 1); starStamp(ctx, kit, STAR_SPRITES.burr, b.x, b.y, 0, k); ctx.restore();
      }
      arches.forEach((walls, side) => {
        if (walls.length < 2) return;
        const ends = walls.map(b => { const h = (Number(b.length) || 0) / 2, ca = Math.cos(b.angle || 0), sa = Math.sin(b.angle || 0); return [[b.x - ca * h, b.y - sa * h], [b.x + ca * h, b.y + sa * h]]; });
        const [a, m] = ends[0], z = ends[1][1], rel = [a, m, z].map(q => [q[0] - m[0], q[1] - m[1]]);
        const left = (Number(walls[0].kitUntil) || 0) - clock, k = still ? 1 : kit.easeBack(clamp((L.life.arch - left) / .3, 0, 1));
        ctx.save(); ctx.globalAlpha *= clamp(left / .5, 0, 1); starStamp(ctx, kit, starArchSprite(side, rel), m[0], m[1], 0, k); ctx.restore();
      });
      // A comet nobody caught lands as a fallen star: a little gold star on it.
      for (const bud of state.buds || []) if (bud.fallenStar && !bud.bloomed && !bud.hidden && bud.visible !== false) starStamp(ctx, kit, STAR_SPRITES.mark, bud.x, bud.y - 1);
    }
  });

  root.BloomFoeArt = { define, LOOKS, has, bud, under, over, aim, warm, kitLook, KIT_LOOKS, kits };
})(typeof window !== 'undefined' ? window : globalThis);
