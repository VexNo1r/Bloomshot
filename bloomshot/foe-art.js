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
        ctx.globalAlpha = still ? .9 : .6 + .35 * (.5 + .5 * Math.sin(time * CHROMA_ART.ready));
        stampWith(ctx, kit, chromaGlow(r, type), x, y);
        ctx.globalAlpha = 1;
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
        if (!still && quality <= 1) for (let k = 0; k < 3; k++) {
          const p = (((time + k * .5 + x * .003) % 1.5) + 1.5) % 1.5 / 1.5;
          ctx.globalAlpha = Math.sin(p * Math.PI) * .9;
          batStamp(ctx, kit, BAT_Z, x + r * .7 + p * 4 + k * 1.5, y - r * .9 - p * 10, 0, .7 + .4 * p);
        }
        ctx.globalAlpha = 1;
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
