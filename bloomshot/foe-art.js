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
    // Head first along the body; the bob runs as a little wave from the head back.
    pieces.sort((a, b) => b.off - a.off);
    const at = pieces.map((p, k) => ({ p, k, x: p.x, y: p.y + (still ? 0 : 2 * Math.sin(TAU * 1.2 * time - .6 * k)) }));
    // The body: a dark teal band joining neighbors (a bloomed bead leaves a gap), under the beads.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = WORM_LOOK.ink; ctx.lineWidth = 9; ctx.globalAlpha = .75;
    ctx.beginPath();
    for (let i = 1; i < at.length; i++) {
      const a = at[i - 1], b = at[i];
      if (a.p.off - b.p.off > 21.5) continue;
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    // Tail to head, so the head sits on top.
    for (let i = at.length - 1; i >= 0; i--) {
      const { p, x, y } = at[i], r = p.r || 9;
      let s = 1;
      // A bead that has just become a head pops in over .15 s (0 -> 1.12 -> 1).
      if (!still && p.headAt != null) { const k = (clock - p.headAt) / .15; if (k >= 0 && k < 1) s = k < .7 ? 1.12 * kit.smooth(k / .7) : 1.12 - .12 * kit.smooth((k - .7) / .3); }
      if (p.head) {
        // Its lantern glow first, breathing slowly (steady with Animations off).
        const [lkey, lbox, lpaint] = wormLamp(r);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = still ? .6 : .5 + .15 * Math.sin(time * 3.1 + p.x * .02);
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
    }
    // The running light: one bead at a time, head to tail, .12 s each, once a second.
    if (still || quality > 1) return;
    const k = Math.floor(((time % 1) + 1) % 1 / .12);
    if (k >= at.length) return;
    const lit = at[k], [key, box, paint] = wormGlow(lit.p.r || 9);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55; stamp(ctx, kit, key, box, paint, lit.x, lit.y, 0, .8); ctx.restore();
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
