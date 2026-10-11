/* Level scenery: one painted scene per campaign level, heading underground, plus the rocks and crystals
   that sit in the play area. Flat shapes with colored ink lines, cel shading toward the lower right and a
   light from the upper left, drawn as Canvas paths. Busy detail stays at the edges so flowers read. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      n = n + Math.imul(n ^ (n >>> 7), 61 | n) ^ n;
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }
  // A smooth path through points (Catmull-Rom as Bezier), the base of every organic shape here.
  function smooth(ctx, pts, closed) {
    const n = pts.length;
    if (n < 2) return;
    const at = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (closed) ctx.closePath();
  }
  function shape(ctx, pts, fill, line, width, closed = true) {
    ctx.beginPath(); smooth(ctx, pts, closed);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = width || 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  // An irregular rounded blob around a center: stones, bushes, cloud puffs, cave lumps.
  function blob(cx, cy, rx, ry, seed, rough = .12, count = 9) {
    const r = rng(seed), out = [];
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + (r() - .5) * .3, k = 1 + (r() - .5) * 2 * rough;
      out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return out;
  }
  // A ridge line across the board: points from left to right with gentle hand-drawn unevenness.
  function ridge(y, amp, seed, step = 46, x0 = -20, x1 = 440) {
    const r = rng(seed), out = [];
    for (let x = x0; x <= x1 + step; x += step) out.push([x, y + Math.sin(x * .013 + seed) * amp + (r() - .5) * amp * .8]);
    return out;
  }
  function band(ctx, top, bottomY, fill, line, width) {
    const pts = top.slice();
    ctx.beginPath(); smooth(ctx, pts, false);
    ctx.lineTo(pts[pts.length - 1][0], bottomY); ctx.lineTo(pts[0][0], bottomY); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (line) { ctx.beginPath(); smooth(ctx, pts, false); ctx.strokeStyle = line; ctx.lineWidth = width || 1.6; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  function dot(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  function stroke(ctx, pts, color, width, closed = false) {
    ctx.beginPath(); smooth(ctx, pts, closed); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function clipTo(ctx, pts, fn) { ctx.save(); ctx.beginPath(); smooth(ctx, pts, true); ctx.clip(); fn(); ctx.restore(); }
  // Cel shading: the same outline, filled darker and shifted toward the lower right inside the shape.
  function cel(ctx, pts, fill, dx, dy) {
    clipTo(ctx, pts, () => { ctx.beginPath(); smooth(ctx, pts.map(p => [p[0] - dx, p[1] - dy]), true); ctx.rect(-50, -50, 520, 660); ctx.fillStyle = fill; ctx.fill('evenodd'); });
  }
  function grassTuft(ctx, x, y, h, color, line, seed, lean = 0) {
    const r = rng(seed), blades = 4 + Math.floor(r() * 3);
    ctx.beginPath(); ctx.moveTo(x - blades * 2.2, y);
    for (let i = 0; i < blades; i++) {
      const bx = x - blades * 2.2 + i * 4.4 + 2.2, tall = h * (.6 + r() * .5);
      ctx.quadraticCurveTo(bx - 1 + lean * 3, y - tall * .5, bx + lean * 5 + (r() - .5) * 3, y - tall);
      ctx.quadraticCurveTo(bx + 1.5 + lean * 3, y - tall * .45, bx + 2.2, y);
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 1.1; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function daisy(ctx, x, y, r, petal, heart, line) {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * .62, y + Math.sin(a) * r * .62, r * .5, r * .3, a, 0, TAU);
      ctx.fillStyle = petal; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = .7; ctx.stroke();
    }
    dot(ctx, x, y, r * .38, heart);
  }
  function sparkle(ctx, x, y, s, color) {
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fillStyle = color; ctx.fill();
  }
  function frame(ctx, line, inner) {
    ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = line;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(13, 13, 394, 534, 28) : ctx.rect(13, 13, 394, 534); ctx.stroke();
    ctx.globalAlpha = .55; ctx.lineWidth = 1.2; ctx.strokeStyle = inner;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(16, 16, 388, 528, 25) : ctx.rect(16, 16, 388, 528); ctx.stroke();
    ctx.restore();
  }

  // ---------- Level 1: Sunny Meadow, the surface ----------
  // A cartoon cloud: overlapping puffs with one clean outline around the whole shape and a flat base.
  function cloud(ctx, x, y, w, seed, tint = '#ffffff', shade = '#dbeffa', line = '#9fcbe3') {
    const r = rng(seed), puffs = [], n = 4 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), rr = w * (.15 + Math.sin(t * Math.PI) * .15 + r() * .035);
      puffs.push([x - w / 2 + t * w, y - rr * .5, rr]);
    }
    const draw = grow => { ctx.beginPath(); for (const [px, py, rr] of puffs) { ctx.moveTo(px + rr + grow, py); ctx.arc(px, py, rr + grow, 0, TAU); } };
    ctx.save(); ctx.beginPath(); ctx.rect(x - w, y - w, w * 2, w + 1.2); ctx.clip();
    draw(1.5); ctx.fillStyle = line; ctx.fill();
    draw(0); ctx.fillStyle = tint; ctx.fill();
    ctx.beginPath(); ctx.rect(x - w, y - w * .13, w * 2, w); ctx.clip(); draw(0); ctx.fillStyle = shade; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(x - w / 2 - puffs[0][2] * .55, y + .4); ctx.lineTo(x + w / 2 + puffs[n - 1][2] * .55, y + .4);
    ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();
  }
  function lollipopTree(ctx, x, y, s, crown, dark, trunk) {
    ctx.fillStyle = trunk; ctx.fillRect(x - s * .12, y - s * .9, s * .24, s * .9);
    const pts = blob(x, y - s * 1.25, s * .62, s * .58, Math.round(x * 7 + y), .08, 8);
    shape(ctx, pts, crown, null); cel(ctx, pts, dark, -s * .18, s * .2); shape(ctx, pts, null, dark, .9);
  }
  function windmill(ctx, x, y, s) {
    const line = '#8f7a6a';
    ctx.beginPath(); ctx.moveTo(x - s * .32, y); ctx.lineTo(x - s * .2, y - s * 1.3); ctx.lineTo(x + s * .2, y - s * 1.3); ctx.lineTo(x + s * .32, y); ctx.closePath();
    ctx.fillStyle = '#f4e8d4'; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * .28, y - s * 1.3); ctx.lineTo(x, y - s * 1.62); ctx.lineTo(x + s * .28, y - s * 1.3); ctx.closePath();
    ctx.fillStyle = '#dd8f6f'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b8a28d'; ctx.fillRect(x - s * .07, y - s * .38, s * .14, s * .38);
    ctx.save(); ctx.translate(x, y - s * 1.28); ctx.rotate(.35);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      ctx.beginPath(); ctx.rect(-s * .05, -s * 1.05, s * .1, s * .95); ctx.fillStyle = '#a58a74'; ctx.fill();
      ctx.beginPath(); ctx.rect(s * .05, -s * 1.02, s * .2, s * .62); ctx.fillStyle = '#fbf6ec'; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = .8; ctx.stroke();
    }
    dot(ctx, 0, 0, s * .08, '#7d6656');
    ctx.restore();
  }
  function worm(ctx, x, y, s, flip) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
    const body = [[-16, 4], [-10, -3], [-2, 3], [6, -3], [12, 1]];
    stroke(ctx, body, '#a8505c', 8.4); stroke(ctx, body, '#f39aa4', 6.2);
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-12 + i * 6, [-1, 0, 0, -1][i], 3, .9, 2.2); ctx.strokeStyle = '#d9727f'; ctx.lineWidth = .7; ctx.stroke(); }
    dot(ctx, 13, -1, 3.6, '#f39aa4'); ctx.beginPath(); ctx.arc(13, -1, 3.6, -1.9, 1.5); ctx.strokeStyle = '#a8505c'; ctx.lineWidth = 1.1; ctx.stroke();
    dot(ctx, 14.2, -2.2, .9, '#3b2420');
    ctx.restore();
  }
  function pebble(ctx, x, y, w, h, seed, fill, shade, line) {
    const pts = blob(x, y, w, h, seed, .14, 8);
    shape(ctx, pts, fill, null); cel(ctx, pts, shade, w * .25, h * .4);
    shape(ctx, pts, null, line, 1.1);
    ctx.beginPath(); ctx.arc(x - w * .3, y - h * .3, Math.min(w, h) * .3, 3.6, 4.6); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.stroke();
  }
  function carrot(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(.18); ctx.scale(s, s);
    for (const [a, l] of [[-.5, 16], [0, 20], [.45, 15]]) {
      ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -l / 2 - 2, 3.4, l / 2, 0, 0, TAU);
      ctx.fillStyle = '#6cc070'; ctx.fill(); ctx.strokeStyle = '#3f8a48'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-5, 20, 0, 38); ctx.quadraticCurveTo(5, 20, 7, 0); ctx.closePath();
    ctx.fillStyle = '#f39a3d'; ctx.fill(); ctx.strokeStyle = '#b8611f'; ctx.lineWidth = 1.3; ctx.stroke();
    for (const [yy, side] of [[9, -1], [17, 1], [25, -1]]) { ctx.beginPath(); ctx.moveTo(side * 5, yy); ctx.lineTo(side * 1.5, yy + 1.5); ctx.strokeStyle = '#c96d24'; ctx.lineWidth = .9; ctx.stroke(); }
    ctx.restore();
  }
  // A leafy canopy: a cluster of rounded leaf masses, each outlined and shaded away from the sun.
  function canopy(ctx, masses, fill, shade, line, seed) {
    const r = rng(seed);
    for (const [x, y, rx, ry] of masses) {
      const pts = blob(x, y, rx, ry, Math.floor(r() * 1e6), .1, 10);
      shape(ctx, pts, fill, null); cel(ctx, pts, shade, -rx * .22, ry * .26); shape(ctx, pts, null, line, 1.7);
      // A few leaf-edge scallops for texture.
      for (let i = 0; i < 3; i++) {
        const a = -2.4 + i * .5 + r() * .2;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * rx * .55, y + Math.sin(a) * ry * .55, rx * .18, a - 1.2, a + .4);
        ctx.strokeStyle = 'rgba(255,255,220,.45)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
      }
    }
  }
  function bunny(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    for (const [ex, a] of [[-4, -.18], [4, .14]]) {
      ctx.save(); ctx.translate(ex, -14); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, -9, 3.6, 10, 0, 0, TAU); ctx.fillStyle = '#f7efe6'; ctx.fill(); ctx.strokeStyle = '#8a7462'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -8, 1.6, 7, 0, 0, TAU); ctx.fillStyle = '#f6b8c4'; ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(0, -6, 10, 9, 0, 0, TAU); ctx.fillStyle = '#f7efe6'; ctx.fill(); ctx.strokeStyle = '#8a7462'; ctx.lineWidth = 1.3; ctx.stroke();
    dot(ctx, -3.6, -7, 1.3, '#3b2a22'); dot(ctx, 3.6, -7, 1.3, '#3b2a22'); dot(ctx, 0, -4, 1.2, '#e98a9c');
    dot(ctx, -6.5, -3.5, 1.8, 'rgba(246,160,176,.6)'); dot(ctx, 6.5, -3.5, 1.8, 'rgba(246,160,176,.6)');
    ctx.restore();
  }
  // ---------- The painter's kit: light, air and texture ----------
  // Every scene is painted back to front. Far layers sink into the scene's air color, near layers keep their full
  // color, one key light per scene rims whatever faces it, and a last grading pass ties the whole picture together.
  // The scenery itself carries no ink lines: those belong to the flowers and pieces in play, so they read first.
  function lin(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }
  function rad(ctx, x, y, r, stops, x0 = x, y0 = y, r0 = 0) {
    const g = ctx.createRadialGradient(x0, y0, r0, x, y, r);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }
  const rgba = (rgb, a) => `rgba(${rgb},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  function wash(ctx, style, mode, alpha = 1, x = -10, y = -10, w = 440, h = 580) {
    ctx.save(); if (mode) ctx.globalCompositeOperation = mode; ctx.globalAlpha = alpha; ctx.fillStyle = style; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  // Air between layers: a band of the scene's air color laid over everything painted so far.
  function air(ctx, y0, y1, rgb, a0, a1) { wash(ctx, lin(ctx, 0, y0, 0, y1, [[0, rgba(rgb, a0)], [1, rgba(rgb, a1)]]), null, 1, -10, y0, 440, y1 - y0); }
  // A soft pool of light.
  function bloom(ctx, x, y, r, rgb, a, mode = 'screen') {
    ctx.save(); ctx.globalCompositeOperation = mode;
    ctx.fillStyle = rad(ctx, x, y, r, [[0, rgba(rgb, a)], [.3, rgba(rgb, a * .5)], [.65, rgba(rgb, a * .14)], [1, rgba(rgb, 0)]]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  // A shaft of light leaving a source, widening and fading along its length.
  function shaft(ctx, x, y, angle, length, w0, w1, rgb, a, mode = 'screen') {
    const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx, ex = x + dx * length, ey = y + dy * length;
    ctx.save(); ctx.globalCompositeOperation = mode;
    ctx.beginPath(); ctx.moveTo(x + nx * w0, y + ny * w0); ctx.lineTo(ex + nx * w1, ey + ny * w1); ctx.lineTo(ex - nx * w1, ey - ny * w1); ctx.lineTo(x - nx * w0, y - ny * w0); ctx.closePath();
    ctx.fillStyle = lin(ctx, x, y, ex, ey, [[0, rgba(rgb, a)], [.55, rgba(rgb, a * .4)], [1, rgba(rgb, 0)]]);
    ctx.fill(); ctx.restore();
  }
  // A soft-edged fill. The path is drawn far off the canvas and only its blurred shadow lands in place; shadow
  // offsets ignore the transform, so they are converted to device pixels. Without getTransform it stays crisp.
  function soft(ctx, path, color, blur) {
    const m = blur && ctx.getTransform ? ctx.getTransform() : null;
    if (!m) { ctx.beginPath(); path(); ctx.fillStyle = color; ctx.fill(); return; }
    const scale = Math.hypot(m.a, m.b) || 1, far = 3000;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = blur * scale; ctx.shadowOffsetX = far * m.a; ctx.shadowOffsetY = far * m.b;
    ctx.translate(-far, 0); ctx.beginPath(); path(); ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
  }
  // Rim light: a lit sliver along the side of a shape facing the light; (dx, dy) points toward the light.
  const rim = (ctx, pts, color, dx, dy) => cel(ctx, pts, color, dx, dy);
  // A shape filled with a gradient running from its lit side to its shaded side.
  function bounds(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  }
  function lit(ctx, pts, light, dark, from = 'top', mid) {
    const [x0, y0, x1, y1] = bounds(pts);
    const g = from === 'top' ? lin(ctx, 0, y0, 0, y1, mid ? [[0, light], [.45, mid], [1, dark]] : [[0, light], [1, dark]])
      : from === 'right' ? lin(ctx, x1, y0, x0, y1, mid ? [[0, light], [.5, mid], [1, dark]] : [[0, light], [1, dark]])
        : lin(ctx, x0, y0, x1, y1, mid ? [[0, light], [.5, mid], [1, dark]] : [[0, light], [1, dark]]);
    shape(ctx, pts, g, null);
  }
  // Paper tooth: a fine grain laid over the finished picture so the flat fills feel printed rather than digital.
  let grainTile = null;
  function grain(ctx, alpha) {
    if (grainTile === null) {
      grainTile = false;
      try {
        const size = 128, c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : document.createElement('canvas');
        c.width = size; c.height = size;
        const g = c.getContext('2d'), img = g.createImageData(size, size), r = rng(4242);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = 128 + (r() - .5) * 150 + (r() - .5) * 60;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0); grainTile = c;
      } catch (_) { grainTile = false; }
    }
    if (!grainTile) return;
    const pattern = ctx.createPattern(grainTile, 'repeat');
    if (pattern && pattern.setTransform && typeof DOMMatrix !== 'undefined' && ctx.getTransform) {
      const m = ctx.getTransform(); pattern.setTransform(new DOMMatrix().scale(1 / (Math.hypot(m.a, m.b) || 1)));
    }
    if (pattern) wash(ctx, pattern, 'overlay', alpha);
  }
  // The final grade: a color wash that warms or cools the picture, then a gentle vignette toward the corners.
  function grade(ctx, top, bottom, vignette, alpha = 1) {
    if (top) wash(ctx, lin(ctx, 0, 0, 0, 560, [[0, top], [1, bottom]]), 'soft-light', alpha);
    if (vignette) wash(ctx, rad(ctx, 210, 250, 400, [[0, 'rgba(0,0,0,0)'], [.5, 'rgba(0,0,0,0)'], [1, vignette]]), 'multiply');
  }
  // A clump of leaves: a scalloped round mass, painted shadow, body, then lit toward the light (lx, ly).
  function scallop(cx, cy, r, seed, bumps = 9, depth = .13) {
    const rr = rng(seed), out = [], n = bumps * 2, turn = rr() * TAU;
    for (let i = 0; i < n; i++) {
      const a = turn + (i + (rr() - .5) * .5) / n * TAU, k = i % 2 ? 1 - depth * (.6 + rr() * .8) : 1 + (rr() - .5) * depth;
      out.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
    }
    return out;
  }
  // A rounded leafy edge, then light modelled across the clump from its sunward side; a leafy tone break keeps
  // the lit cap from looking airbrushed.
  function clump(ctx, x, y, r, pal, lx, ly, seed) {
    const tips = Math.max(8, Math.round(r * .32)), body = scallop(x, y, r, seed, tips, .09);
    const cx = x + lx * r * .55, cy = y + ly * r * .55;
    shape(ctx, body, rad(ctx, cx, cy, r * 1.5, [[0, pal.lit], [.4, pal.mid], [.85, pal.dark], [1, pal.dark]], cx, cy, 0), null);
    clipTo(ctx, body, () => {
      ctx.save(); ctx.globalAlpha = .55;
      shape(ctx, scallop(x + lx * r * .62, y + ly * r * .62, r * .62, seed + 2, Math.round(tips * .9), .14), pal.lit, null);
      ctx.restore();
      if (pal.glint) { ctx.save(); ctx.globalAlpha = .7; shape(ctx, scallop(x + lx * r * .86, y + ly * r * .86, r * .3, seed + 3, 6, .18), pal.glint, null); ctx.restore(); }
    });
  }
  function leafFlecks(ctx, clumps, pal, lx, ly, seed, count = 7) {
    const r = rng(seed);
    for (const [x, y, rad0] of clumps) {
      for (let i = 0; i < count; i++) {
        const a = r() * TAU, d = rad0 * (.55 + r() * .5), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        const facing = Math.cos(a) * lx + Math.sin(a) * ly;
        ctx.save(); ctx.translate(px, py); ctx.rotate(a + 1.2 + r() * .6);
        ctx.beginPath(); ctx.ellipse(0, 0, 1.4 + r() * 1.6, 3 + r() * 2.6, 0, 0, TAU);
        ctx.fillStyle = facing > .2 ? pal.lit : facing < -.3 ? pal.dark : pal.mid; ctx.fill(); ctx.restore();
      }
    }
  }
  // Grass blades: tapered strokes, darker at the root, leaning with a breeze.
  function blade(ctx, x, y, h, w, lean) {
    ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * .25 + lean * .35, y - h * .55, x + lean, y - h);
    ctx.quadraticCurveTo(x + w * .25 + lean * .35, y - h * .55, x + w, y); ctx.closePath();
  }
  function sward(ctx, x0, x1, y, h, colors, seed, step = 2.4, skip) {
    const r = rng(seed);
    for (let pass = 0; pass < colors.length; pass++) {
      ctx.beginPath();
      for (let x = x0 + r() * step; x < x1; x += step * (.6 + r() * .8)) {
        if (skip && skip(x)) continue;
        const tall = h * (.45 + r() * .65) * (1 - pass * .12);
        blade(ctx, x + (r() - .5) * 2, y + pass * 1.6 + r() * 2, tall, .9 + r() * 1.1, (r() - .35) * h * .35);
      }
      ctx.fillStyle = colors[pass]; ctx.fill();
    }
  }

  // The new meadow: painted in light and air rather than outlined. Sun from the upper right; far hills sink into warm
  // haze, the near meadow is full color, the apple tree frames the left, and the soil we dig into is cut away below.
  const SUN = [334, 86], SUNWARD = [.62, -.78];
  // A cumulus cloud: round puffs on a flat base, lit from the sun's side, with a cool shaded belly.
  function cumulus(ctx, x, y, w, h, seed, pal, count) {
    const r = rng(seed), puffs = [], n = count || 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), pr = h * (.26 + .5 * Math.sin(Math.PI * (.1 + t * .8))) * (.75 + r() * .5);
      puffs.push([x - w / 2 + t * w + (r() - .5) * w / n * .6, y - pr * .78, pr]);
    }
    for (let i = 0; i < Math.max(2, Math.round(n / 3)); i++) { const pr = h * (.32 + r() * .22); puffs.push([x - w * .3 + r() * w * .6, y - h * .52 - pr * .5, pr]); }
    const union = (dx, dy, k, grow = 0) => {
      ctx.beginPath();
      for (const [px, py, pr] of puffs) { const R = pr * k + grow; ctx.moveTo(px + dx * pr + R, py + dy * pr); ctx.arc(px + dx * pr, py + dy * pr, R, 0, TAU); }
      ctx.moveTo(x + w * .56 + grow, y - h * .14); ctx.ellipse(x, y - h * .14, w * .56 + grow, h * .16 + grow, 0, 0, TAU);
    };
    soft(ctx, () => union(0, 0, 1, 2), pal.halo, 10);
    union(0, 0, 1); ctx.fillStyle = lin(ctx, 0, y - h * 1.2, 0, y, [[0, pal.body], [.62, pal.body], [1, pal.shade]]); ctx.fill();
    ctx.save(); union(0, 0, 1); ctx.clip();
    union(-.16, .3, .78); ctx.fillStyle = pal.belly; ctx.fill();
    union(SUNWARD[0] * .26, SUNWARD[1] * .26, .8); ctx.fillStyle = pal.lit; ctx.fill();
    ctx.restore();
  }
  function farTree(ctx, x, y, s, pal, seed) {
    ctx.fillStyle = pal.trunk; ctx.fillRect(x - s * .1, y - s * .7, s * .2, s * .7);
    clump(ctx, x, y - s * 1.05, s * .62, pal, SUNWARD[0], SUNWARD[1], seed);
  }
  // A copse: a few round trees grown together, the tallest in the middle, on one shared dark base.
  function copse(ctx, x, y, w, h, pal, seed) {
    const r = rng(seed), n = Math.max(2, Math.round(w / (h * .7)));
    soft(ctx, () => ctx.ellipse(x - h * .3, y + 1, w * .55, h * .14, 0, 0, TAU), 'rgba(30,70,40,.3)', 3);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? .5 : i / (n - 1), k = .62 + Math.sin(t * Math.PI) * .38 * (.8 + r() * .4);
      const tx = x - w / 2 + t * w, s = h * k;
      ctx.fillStyle = pal.trunk; ctx.fillRect(tx - s * .06, y - s * .5, s * .12, s * .5);
      clump(ctx, tx, y - s * .78, s * .5, pal, SUNWARD[0], SUNWARD[1], seed * 7 + i);
    }
  }
  function apple(ctx, x, y, s) {
    dot(ctx, x, y, s, '#b8372f');
    clipTo(ctx, blob(x, y, s, s, 1, 0, 12), () => { dot(ctx, x + s * .35, y - s * .35, s * .8, '#ec6650'); });
    dot(ctx, x + s * .38, y - s * .42, s * .26, 'rgba(255,240,220,.9)');
    stroke(ctx, [[x, y - s * .8], [x + s * .2, y - s * 1.45]], '#4a2e18', 1.1);
  }
  function wildflower(ctx, x, y, s, petal, heart, stem) {
    stroke(ctx, [[x, y], [x + s * .3, y + s * 2.2], [x + s * .1, y + s * 4.2]], stem, Math.max(.8, s * .28));
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU - .3;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s * .62, y + Math.sin(a) * s * .62, s * .55, s * .36, a, 0, TAU); ctx.fillStyle = petal; ctx.fill();
    }
    dot(ctx, x, y, s * .36, heart);
  }
  // A hill: lit along its crest, deeper toward its foot, with drifting cloud shadows across it.
  function hill(ctx, pts, light, dark, crest, shadows) {
    soft(ctx, () => smooth(ctx, pts.map(([x, y]) => [x, y - 4]), true), 'rgba(40,90,60,.26)', 9);
    lit(ctx, pts, light, dark, 'top');
    clipTo(ctx, pts, () => { for (const [x, y, w, h] of shadows) soft(ctx, () => ctx.ellipse(x, y, w, h, -.08, 0, TAU), 'rgba(36,92,84,.2)', 12); });
    rim(ctx, pts, crest, 3, -2.4);
  }
  function paintMeadow(ctx, framed) {
    const [sx, sy] = SUN, [lx, ly] = SUNWARD;
    // Sky: deep at the top, warm and pale at the horizon, brightest around the sun.
    wash(ctx, lin(ctx, 0, 0, 0, 320, [[0, '#2f86cc'], [.4, '#6bb8e8'], [.76, '#bfe4f2'], [1, '#f6f1d8']]));
    bloom(ctx, sx, sy, 300, '255,230,166', .55);
    bloom(ctx, sx, sy, 110, '255,248,220', .95);
    dot(ctx, sx, sy, 22, '#fffcf0'); bloom(ctx, sx, sy, 44, '255,255,240', .9);
    for (const [x, y, w, a] of [[118, 66, 140, .45], [236, 40, 96, .3], [64, 112, 74, .28], [180, 96, 60, .2]]) {
      soft(ctx, () => { ctx.ellipse(x, y, w / 2, 4.5, -.05, 0, TAU); }, `rgba(255,255,255,${a})`, 7);
    }
    // A low, hazy cloud bank along the horizon, then two near clouds lit from the sun's side.
    const bank = { halo: 'rgba(255,255,255,.3)', body: '#f7f6f4', shade: '#d8dcec', lit: '#fffcf0', belly: 'rgba(218,222,238,.75)' };
    cumulus(ctx, 150, 268, 360, 38, 21, bank, 8);
    cumulus(ctx, 350, 264, 200, 50, 22, bank, 6);
    cumulus(ctx, 54, 254, 110, 52, 24, bank);
    air(ctx, 200, 290, '246,242,222', 0, .6);
    cumulus(ctx, 236, 150, 132, 50, 3, { ...bank, halo: 'rgba(255,255,255,.4)' });
    cumulus(ctx, 98, 200, 64, 22, 8, bank);
    // Far blue hills, lit on their sunward slopes.
    const far = [[-20, 268], [36, 250], [92, 258], [150, 242], [206, 252], [262, 236], [318, 248], [370, 232], [440, 250]];
    band(ctx, far, 560, lin(ctx, 0, 232, 0, 300, [[0, '#93b6dc'], [1, '#b8d2e2']]), null);
    rim(ctx, far.concat([[440, 330], [-20, 330]]), 'rgba(222,236,246,.8)', 2.5, -1.6);
    air(ctx, 232, 300, '242,240,222', .05, .5);
    // The second ridge: green-grey with distance, copses and a windmill against the haze.
    const ridge2 = [[-20, 292], [40, 280], [110, 288], [180, 276], [250, 284], [320, 272], [380, 280], [440, 276]];
    band(ctx, ridge2, 560, lin(ctx, 0, 272, 0, 330, [[0, '#a6cfa8'], [1, '#8cba9a']]), null);
    rim(ctx, ridge2.concat([[440, 340], [-20, 340]]), 'rgba(226,244,206,.7)', 2, -1.5);
    const farPal = { dark: '#7aa98f', mid: '#8fbea0', lit: '#b6dab0', trunk: '#86998a' };
    for (const [x, w, h, s] of [[18, 40, 15, 1], [96, 26, 12, 2], [158, 52, 16, 3], [236, 30, 12, 4], [376, 46, 15, 5]]) copse(ctx, x, 286 + Math.sin(x * .02 + 1) * 4, w, h, farPal, s);
    for (const [x, s] of [[60, 9], [212, 8], [410, 10]]) farTree(ctx, x, 284 + Math.sin(x * .02 + 1) * 4, s, farPal, x);
    windmill(ctx, 318, 280, 15);
    air(ctx, 266, 336, '240,240,220', .05, .42);
    // Rolling hills in the middle distance.
    const hillL = [[-30, 380], [-10, 342], [40, 324], [100, 322], [160, 338], [220, 370], [260, 400], [-30, 410]];
    const hillR = [[150, 400], [200, 360], [262, 334], [330, 320], [392, 328], [450, 350], [450, 410], [150, 410]];
    hill(ctx, hillL, '#b6e28a', '#5aa463', 'rgba(238,252,190,.85)', [[60, 360, 70, 16], [180, 380, 40, 10]]);
    // The right hill, with cloud shadows drifting across it.
    soft(ctx, () => smooth(ctx, hillR.map(([x, y]) => [x, y - 4]), true), 'rgba(40,90,60,.26)', 9);
    clipTo(ctx, hillR, () => {
      lit(ctx, hillR, '#b2df86', '#55a060', 'top');
      for (const [x, y, w, h] of [[250, 370, 60, 14], [400, 362, 50, 12]]) soft(ctx, () => ctx.ellipse(x, y, w, h, -.08, 0, TAU), 'rgba(36,92,84,.2)', 12);
    });
    rim(ctx, hillR, 'rgba(238,252,190,.85)', 3, -2.4);
    // Copses along the crests and two round trees on the right hill, with shadows cast away from the sun.
    const hedge = { dark: '#367f4c', mid: '#55a35c', lit: '#93d06c', glint: '#c6ec8c', trunk: '#6b4a30' };
    for (const [x, y, w, h, s] of [[30, 334, 46, 20, 11], [92, 330, 30, 16, 12], [138, 340, 22, 13, 13], [226, 356, 26, 14, 14], [292, 334, 18, 12, 15]]) copse(ctx, x, y, w, h, hedge, s);
    for (const [x, y, s] of [[356, 330, 16], [392, 338, 11]]) {
      soft(ctx, () => ctx.ellipse(x - s * .8, y + 2, s * 1.2, s * .26, 0, 0, TAU), 'rgba(30,80,40,.35)', 4);
      ctx.fillStyle = lin(ctx, x - 2, 0, x + 2, 0, [[0, '#5e4029'], [1, '#a77a4c']]); ctx.fillRect(x - s * .1, y - s * .9, s * .2, s * .92);
      for (const [dx, dy, k, sd] of [[-.45, -1.25, .55, 1], [.44, -1.3, .52, 2], [0, -1.72, .6, 3], [0, -1.15, .62, 4]]) clump(ctx, x + dx * s, y + dy * s, s * k, hedge, lx, ly, Math.floor(x + sd * 17));
    }
    // A sandy path winding down out of the hills toward the burrow.
    const lane = [[262, 338], [250, 356], [226, 378], [236, 404], [214, 430], [212, 456]], laneL = [], laneR = [];
    lane.forEach(([x, y], i) => { const w = 2.5 + i * 5.5; laneL.push([x - w, y]); laneR.push([x + w, y]); });
    const lanePts = laneL.concat(laneR.reverse());
    shape(ctx, lanePts, lin(ctx, 0, 338, 0, 456, [[0, '#f2e3b8'], [1, '#d9bd84']]), null);
    rim(ctx, lanePts, 'rgba(170,134,80,.45)', -2, 2);
    air(ctx, 300, 420, '238,240,214', .12, 0);
    // The near meadow: a deep green field with long grass along its crest and wildflowers through it.
    const near = ridge(400, 5, 9, 70);
    band(ctx, near, 560, lin(ctx, 0, 392, 0, 456, [[0, '#78c45c'], [1, '#3a8a45']]), null);
    clipTo(ctx, near.concat([[440, 470], [-20, 470]]), () => { for (const [x, y] of [[90, 432], [330, 428]]) soft(ctx, () => ctx.ellipse(x, y, 80, 14, 0, 0, TAU), 'rgba(196,236,120,.35)', 12); });
    sward(ctx, -10, 430, 404, 16, ['#368543', '#55a54f', '#84c75d', '#b4e07c'], 19, 2.6, x => x > 190 && x < 248);
    const fr = rng(5);
    for (let i = 0; i < 34; i++) {
      const x = 20 + fr() * 380, y = 410 + fr() * 36;
      if (x > 176 && x < 256) continue;
      const kind = i % 4, s = 1.6 + (y - 410) / 36 * 1.8;
      wildflower(ctx, x, y, s, ['#fffaf0', '#ffd65c', '#ff9fbd', '#e9524b'][kind], kind === 1 ? '#f39a3d' : '#ffcf4a', '#3f8f4c');
    }
    // The ground: the grass lip overhangs a cut-away of the soil, which darkens with depth.
    const lip = ridge(454, 2.2, 11, 26);
    band(ctx, lip, 560, lin(ctx, 0, 450, 0, 560, [[0, '#9a663d'], [.45, '#7a4e31'], [1, '#4a2b1a']]), null);
    for (const [y, amp, seed, color] of [[490, 4, 12, 'rgba(176,120,76,.22)'], [500, 4, 12, 'rgba(60,34,18,.3)'], [530, 5, 14, 'rgba(46,26,14,.34)']]) {
      const pts = ridge(y, amp, seed, 50);
      soft(ctx, () => { smooth(ctx, pts, false); ctx.lineTo(440, 580); ctx.lineTo(-20, 580); ctx.closePath(); }, color, 5);
    }
    air(ctx, 454, 480, '30,16,8', .5, 0);
    const rs = rng(31);
    for (let i = 0; i < 140; i++) { const x = 4 + rs() * 412, y = 460 + rs() * 98; dot(ctx, x, y, .5 + rs() * 1.1, i % 3 ? 'rgba(44,24,12,.35)' : 'rgba(236,196,146,.3)'); }
    // Roots reaching down from the meadow.
    for (const [x, len, bend, w] of [[60, 70, 14, 3.4], [128, 46, -10, 2.4], [292, 58, 12, 2.8], [352, 80, -16, 3.6], [394, 40, 8, 2]]) {
      const pts = [[x, 456], [x + bend * .4, 456 + len * .4], [x + bend, 456 + len * .75], [x + bend * 1.3, 456 + len]];
      stroke(ctx, pts, 'rgba(40,20,10,.45)', w + 2.4); stroke(ctx, pts, '#c39a6a', w); stroke(ctx, pts.map(([px, py]) => [px + w * .3, py]), 'rgba(255,230,186,.5)', w * .35);
      stroke(ctx, [pts[1], [pts[1][0] + bend * .8 + 8, pts[1][1] + 14], [pts[1][0] + bend + 14, pts[1][1] + 26]], '#ad8456', w * .45);
    }
    for (const [x, y, w, h, s] of [[44, 490, 9, 6, 1], [76, 524, 6, 4.5, 2], [348, 504, 8, 5.5, 3], [388, 534, 10, 6, 4], [150, 536, 6, 4, 5], [272, 544, 7, 4.5, 6]]) {
      soft(ctx, () => ctx.ellipse(x - 1, y + h * .8, w * 1.05, h * .4, 0, 0, TAU), 'rgba(30,14,6,.5)', 2);
      const pts = blob(x, y, w, h, s, .14, 8);
      lit(ctx, pts, '#efe0c6', '#a08263'); rim(ctx, pts, 'rgba(255,250,236,.7)', 1.6, -1.6);
    }
    // The burrow under the launcher: the way down. Its far wall catches the light; the near rim is in shade.
    soft(ctx, () => smooth(ctx, blob(210, 503, 47, 35, 5, .05, 12), true), 'rgba(176,124,82,.55)', 4);
    const hole = blob(210, 504, 38, 27, 6, .05, 12);
    shape(ctx, hole, rad(ctx, 210, 512, 40, [[0, '#0e0603'], [.6, '#25140a'], [1, '#4a2b18']], 210, 520, 2), null);
    rim(ctx, hole, 'rgba(166,116,74,.6)', 0, 5);
    worm(ctx, 318, 524, .9, false);
    carrot(ctx, 112, 452, .82);
    // The grass lip itself, drawn last so it hangs over the soil.
    sward(ctx, -10, 430, 459, 14, ['#2c763b', '#4a9a4a', '#74bd59', '#a6dc74'], 77, 2.1);
    // The old apple tree: a tapering trunk lit on the sunward side, under a canopy of leaf clumps.
    const trunk = [[-10, 466], [6, 456], [16, 440], [22, 396], [20, 320], [24, 240], [16, 150], [30, 100], [58, 108], [50, 170], [52, 262], [48, 340], [56, 414], [68, 446], [94, 466]];
    soft(ctx, () => ctx.ellipse(40, 462, 66, 7, 0, 0, TAU), 'rgba(30,60,20,.5)', 6);
    shape(ctx, trunk, lin(ctx, 18, 0, 64, 0, [[0, '#4e2f1b'], [.55, '#8d5d38'], [1, '#c99258']]), null);
    rim(ctx, trunk, 'rgba(255,214,150,.8)', 3, -1);
    clipTo(ctx, trunk, () => {
      const br = rng(13);
      for (let i = 0; i < 18; i++) {
        const x = 16 + br() * 44, y = 170 + br() * 290, len = 16 + br() * 30;
        stroke(ctx, [[x, y], [x + (br() - .5) * 4, y + len * .5], [x + (br() - .5) * 3, y + len]], i % 3 ? 'rgba(60,34,18,.38)' : 'rgba(240,196,140,.28)', 1.2 + br());
      }
      wash(ctx, lin(ctx, 0, 120, 0, 250, [[0, 'rgba(24,40,20,.65)'], [1, 'rgba(24,40,20,0)']]), null, 1, 0, 120, 100, 130);
    });
    ctx.beginPath(); ctx.ellipse(35, 300, 4.5, 7.5, 0, 0, TAU); ctx.fillStyle = '#26160b'; ctx.fill();
    const bough = [[44, 214], [68, 196], [94, 184], [102, 190], [74, 206], [50, 228]];
    shape(ctx, bough, lin(ctx, 0, 184, 0, 228, [[0, '#c48d55'], [1, '#5e3a20']]), null);
    // The canopy keeps to the top-left corner, so flowers in play never sit on a busy patch of leaves.
    const crown = [[-4, 12, 44], [62, -6, 38], [112, 18, 26], [28, 62, 40], [84, 60, 26], [-14, 104, 32], [36, 112, 22], [92, 172, 12], [108, 180, 13], [100, 190, 10]];
    // One dark mass behind the clumps keeps the canopy a single shape; the clumps then catch the light in turn.
    ctx.beginPath(); for (const [x, y, r0] of crown) { ctx.moveTo(x + r0 * 1.06, y + 6); ctx.arc(x, y + 6, r0 * 1.06, 0, TAU); }
    ctx.fillStyle = '#1d4d32'; ctx.fill();
    const leafPal = { dark: '#235738', mid: '#428a45', lit: '#78b956', glint: '#b2dc74' };
    for (const [i, [x, y, r0]] of crown.entries()) clump(ctx, x, y, r0, leafPal, lx, ly, 100 + i * 7);
    leafFlecks(ctx, crown, leafPal, lx, ly, 61, 9);
    for (const [x, y] of [[24, 40], [74, 22], [46, 92], [104, 40], [6, 120], [88, 70]]) apple(ctx, x, y, 4.4);
    // Long shafts from the sun across the meadow.
    for (const [a, len, w, al] of [[2.32, 520, 34, .1], [2.18, 600, 22, .08], [2.5, 470, 18, .07]]) shaft(ctx, sx, sy, a, len, 10, w * 2.4, '255,244,200', al);
    // The rabbit watching from the right, half in the long grass.
    sward(ctx, 368, 430, 452, 30, ['#2c763b', '#4c9c4b', '#7cc35c', '#b0de7a'], 91, 3.2);
    soft(ctx, () => ctx.ellipse(356, 448, 14, 3.4, 0, 0, TAU), 'rgba(20,50,20,.45)', 3);
    bunny(ctx, 356, 446, .9);
    sward(ctx, 334, 380, 456, 9, ['#3b8a45', '#6fb556', '#a6dc74'], 92, 3);
    wildflower(ctx, 398, 412, 5, '#fffaf0', '#ffcf4a', '#3f8f4c');
    sward(ctx, -10, 70, 458, 24, ['#24663a', '#418a45', '#6ab355'], 93, 3);
    // Grade: warm light from above, cooler shade toward the soil, a gentle vignette and a fine paper grain.
    grade(ctx, 'rgba(255,226,170,.55)', 'rgba(80,96,150,.5)', 'rgba(70,64,96,.38)');
    grain(ctx, .07);
    if (framed) frame(ctx, '#5aa9c9', '#ffffff');
  }

  // ---------- The three garden worlds: the Meadow garden, the Moon Garden and the Koi Pond ----------
  // These sit behind the classic puzzles, Meadow Rush, the daily garden and the Moon and Koi worlds. Rush keeps its
  // side lanes clear, so the framing pulls further out to the edges there.
  // A small bloom seen from the front: petals shaded by which way they face the light, then the heart.
  function gardenBloom(ctx, x, y, r, pal, lx, ly, seed, count = 6) {
    const rr = rng(seed), turn = rr() * TAU;
    for (let i = 0; i < count; i++) {
      const a = turn + i / count * TAU, px = x + Math.cos(a) * r * .55, py = y + Math.sin(a) * r * .5;
      const facing = Math.cos(a) * lx + Math.sin(a) * ly;
      ctx.beginPath(); ctx.ellipse(px, py, r * .58, r * .4, a, 0, TAU);
      ctx.fillStyle = facing > .25 ? pal[2] : facing < -.35 ? pal[0] : pal[1]; ctx.fill();
    }
    dot(ctx, x, y, r * .32, pal[3]); dot(ctx, x + lx * r * .1, y + ly * r * .1, r * .16, pal[4] || 'rgba(255,255,255,.5)');
  }
  // A tall flower spike (foxglove, lupin, lavender): bells along a stem, shrinking toward the tip.
  function gardenSpike(ctx, x, y, h, pal, lean, seed) {
    const rr = rng(seed), tiers = Math.round(h / 3.2);
    stroke(ctx, [[x, y], [x + lean * .4, y - h * .5], [x + lean, y - h]], pal[3], 1.8);
    for (const [side, dy] of [[-1, 18], [1, 30]]) { ctx.save(); ctx.translate(x + side * 3, y - dy); ctx.rotate(side * .9); ctx.beginPath(); ctx.ellipse(0, -7, 2.6, 8, 0, 0, TAU); ctx.fillStyle = pal[3]; ctx.fill(); ctx.restore(); }
    // Florets packed in tiers up a tapering cone, lit on the sun side, tiny buds at the tip.
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, cx = x + lean * t * t, cy = y - h * (.3 + t * .7), w = h * .062 * (1 - t * .75) + .8;
      for (const k of [-1, 1]) {
        if (rr() < .12) continue;
        const fx = cx + k * w * .7, fy = cy + w * .2;
        ctx.beginPath(); ctx.ellipse(fx, fy, w * .62, w * .46, k * .6, 0, TAU);
        ctx.fillStyle = k > 0 ? pal[2] : pal[0]; ctx.fill();
        dot(ctx, fx + k * w * .1, fy - w * .12, w * .26, pal[1]);
      }
    }
  }
  // A big cosmos-like flower for the corners: two rings of broad, notched petals with a lit face and a deep heart.
  function gardenCosmos(ctx, x, y, r, pal, tilt, seed) {
    const rr = rng(seed);
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(1, .82);
    for (const ring of [0, 1]) {
      const n = 8, k = ring ? .78 : 1;
      for (let i = 0; i < n; i++) {
        const a = (i + ring * .5) / n * TAU + rr() * .1;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(r * .34 * k, -r * .18, r * .2 * k, -r * k, 0, -r * k * .96);
        ctx.bezierCurveTo(-r * .2 * k, -r * k, -r * .34 * k, -r * .18, 0, 0);
        ctx.fillStyle = lin(ctx, 0, 0, 0, -r * k, ring ? [[0, pal[0]], [1, pal[2]]] : [[0, pal[0]], [.6, pal[1]], [1, pal[1]]]); ctx.fill();
        stroke(ctx, [[0, -r * .2 * k], [0, -r * .8 * k]], 'rgba(255,255,255,.18)', 1);
        ctx.restore();
      }
    }
    dot(ctx, 0, 0, r * .24, pal[3]); dot(ctx, -r * .05, -r * .07, r * .13, pal[4]);
    ctx.restore();
  }
  // A flowering branch reaching in from a corner: dark wood, leaves, and blossom clusters lit from the sun.
  function gardenBranch(ctx, pts, width, pal, lx, ly, seed) {
    const r = rng(seed), outline = ribbon2(pts, width, .9);
    soft(ctx, () => smooth(ctx, outline.map(([x, y]) => [x + 4, y + 7]), true), 'rgba(40,40,60,.25)', 8);
    shape(ctx, outline, lin(ctx, 0, pts[0][1] - width, 0, pts[0][1] + width, [[0, '#8e6248'], [1, '#4a3024']]), null);
    rim(ctx, outline, 'rgba(255,226,196,.6)', lx * 2, ly * 2);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i], twig = [[x, y], [x + (r() - .3) * 26, y + 10 + r() * 16]];
      stroke(ctx, twig, '#5a3a2a', 1.6);
      for (let k = 0; k < 4; k++) {
        const a = r() * TAU, d = 5 + r() * 12, bx = twig[1][0] + Math.cos(a) * d, by = twig[1][1] + Math.sin(a) * d * .7;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, TAU); ctx.fillStyle = k % 2 ? pal.leaf : pal.leafLit; ctx.fill(); ctx.restore();
      }
      for (let k = 0; k < 5; k++) gardenBloom(ctx, x + (r() - .5) * 30, y + (r() - .3) * 22, 5 + r() * 3, pal.bloom, lx, ly, seed + i * 13 + k, 5);
    }
  }
  // A field of wildflowers in perspective: dabs of color in drifts, small and hazy far off, bigger close by.
  function flowerField(ctx, y0, y1, colors, greens, seed, skip) {
    const r = rng(seed);
    for (let row = 0; row < 56; row++) {
      const t = row / 55, y = y0 + (y1 - y0) * t * t, size = .6 + t * 3, n = Math.round(46 - t * 22);
      ctx.globalAlpha = .45 + t * .55;
      for (let i = 0; i < n; i++) {
        const x = r() * 440 - 10;
        if (skip && skip(x, y)) continue;
        // Flowers grow in drifts: where the drift is strong there are blooms of that patch's color, elsewhere grass.
        const drift = Math.sin(x * .021 + row * .23 + seed) * .6 + Math.sin(x * .0061 - row * .11 + seed * 2) * .6;
        const bloom = drift > .35 && r() < .75, patch = Math.floor(x / 70 + row / 18 + seed) % colors.length;
        const color = bloom ? colors[(patch + colors.length) % colors.length] : greens[Math.floor(r() * greens.length)];
        const s = size * (bloom ? 1 : 1.3) * (.8 + r() * .5);
        ctx.beginPath(); ctx.ellipse(x, y + r() * 3, s, s * (bloom ? .72 : .5), 0, 0, TAU); ctx.fillStyle = color; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function paintGardenMeadow(ctx, rush, framed) {
    const [lx, ly] = SUNWARD, sun = [338, 84], edge = rush ? 16 : 0;
    // Morning sky, brightest around the sun.
    wash(ctx, lin(ctx, 0, 0, 0, 380, [[0, '#4ea5e2'], [.45, '#93d1f0'], [.8, '#dff1ef'], [1, '#fbf1d6']]));
    bloom(ctx, sun[0], sun[1], 320, '255,228,170', .5);
    bloom(ctx, sun[0], sun[1], 110, '255,248,222', .95);
    dot(ctx, sun[0], sun[1], 21, '#fffcf0'); bloom(ctx, sun[0], sun[1], 42, '255,255,240', .9);
    for (const [x, y, w, a] of [[150, 70, 150, .4], [90, 116, 90, .3], [230, 40, 80, .25]]) soft(ctx, () => ctx.ellipse(x, y, w / 2, 4.5, .04, 0, TAU), `rgba(255,255,255,${a})`, 7);
    const puff = { halo: 'rgba(255,255,255,.3)', body: '#f8f6f2', shade: '#d9dbea', lit: '#fffcf0', belly: 'rgba(218,220,236,.75)' };
    cumulus(ctx, 150, 314, 380, 30, 31, puff, 9); cumulus(ctx, 360, 312, 200, 40, 32, puff, 6);
    air(ctx, 250, 324, '250,244,224', 0, .82);
    cumulus(ctx, 120, 176, 116, 42, 33, puff);
    // Two far ridges, blue-green with distance, with copses along them.
    const far = [[-20, 318], [50, 304], [120, 312], [190, 300], [260, 310], [330, 296], [400, 306], [440, 302]];
    band(ctx, far, 560, lin(ctx, 0, 296, 0, 360, [[0, '#9dbfdc'], [1, '#b2d2d8']]), null);
    rim(ctx, far.concat([[440, 380], [-20, 380]]), 'rgba(226,238,246,.75)', 2.5, -1.6);
    air(ctx, 296, 350, '246,242,222', .05, .45);
    const near = [[-20, 342], [60, 332], [140, 338], [220, 330], [300, 336], [380, 326], [440, 332]];
    band(ctx, near, 560, lin(ctx, 0, 326, 0, 400, [[0, '#a8d39a'], [1, '#86bb7e']]), null);
    rim(ctx, near.concat([[440, 400], [-20, 400]]), 'rgba(232,248,196,.7)', 2, -1.5);
    const farPal = { dark: '#73a487', mid: '#88b996', lit: '#b0d8a6', trunk: '#7f9484' };
    for (const [x, w, h, s] of [[40, 54, 18, 41], [134, 30, 14, 42], [262, 60, 18, 43], [380, 44, 16, 44]]) copse(ctx, x, 336 + Math.sin(x * .03) * 2, w, h, farPal, s);
    air(ctx, 326, 380, '246,242,222', .05, .3);
    // The wildflower meadow, rolling toward us in drifts of color.
    const meadowTop = ridge(366, 3, 37, 60);
    band(ctx, meadowTop, 560, lin(ctx, 0, 362, 0, 560, [[0, '#9ccf72'], [.4, '#6fb35a'], [1, '#3e8a44']]), null);
    clipTo(ctx, meadowTop.concat([[440, 600], [-20, 600]]), () => {
      for (const [x, y, w, h] of [[110, 400, 120, 16], [330, 430, 110, 18]]) soft(ctx, () => ctx.ellipse(x, y, w, h, 0, 0, TAU), 'rgba(40,96,70,.18)', 14);
      flowerField(ctx, 370, 476, ['#fff6ea', '#ffd45c', '#ff9fbd', '#b9a0f0', '#f6c140', '#ff8f8f'], ['#7cbf5e', '#5ea852', '#9ad06c', '#4f9a4c'], 5, (x, y) => Math.abs(x - 210) < 14 + (y - 370) * .3);
    });
    // A worn path through the flowers to where the launcher stands.
    const lane = [[214, 366], [208, 390], [218, 420], [206, 452], [210, 490], [210, 560]], laneL = [], laneR = [];
    lane.forEach(([x, y], i) => { const w = 1.5 + i * 5; laneL.push([x - w, y]); laneR.push([x + w, y]); });
    const lanePts = laneL.concat(laneR.reverse());
    shape(ctx, lanePts, lin(ctx, 0, 366, 0, 560, [[0, '#e2d3a2'], [1, '#bb9a66']]), null);
    rim(ctx, lanePts, 'rgba(140,110,64,.45)', -2, 2);
    clipTo(ctx, lanePts, () => { const pr = rng(54); for (let i = 0; i < 40; i++) dot(ctx, 190 + pr() * 40, 380 + pr() * 180, .6 + pr(), 'rgba(120,90,50,.35)'); });
    sward(ctx, -10, 430, 476, 16, ['#2f7a3d', '#4c9c4b', '#7cc35c', '#b4e07c'], 51, 2.6, x => Math.abs(x - 210) < 20);
    // Foreground: tall spikes and big cosmos flowers in the bottom corners, out of the way of play.
    const coral = ['#c63a5e', '#ef6585', '#ffa1b8', '#ffd17a', '#fff2d2'], lilac = ['#6a4fc4', '#9a7ef2', '#c8b4ff', '#ffe08a', '#f4eeff'];
    const white = ['#cfc8bd', '#f3efe6', '#ffffff', '#f2b83a', '#fffdf6'];
    for (const [x, h, pal, lean, sd] of [[22, 96, lilac, 4, 1], [40, 120, coral, -2, 2], [62, 84, white, 3, 3], [356, 90, white, -3, 4], [378, 124, coral, 2, 5], [398, 98, lilac, -3, 6]]) {
      gardenSpike(ctx, x + (x < 210 ? -edge : edge), 492, h, [pal[0], pal[1], pal[2], '#3f7a3a'], lean, sd);
    }
    const leaf = { dark: '#1f5a36', mid: '#3a8644', lit: '#73b856', glint: '#a8d877' };
    for (const [x, y, r0, s] of [[-6, 520, 34, 1], [44, 548, 30, 2], [96, 572, 26, 3], [428, 516, 36, 4], [376, 546, 30, 5], [322, 574, 24, 6]]) {
      const cx = x + (x < 210 ? -edge : edge); clump(ctx, cx, y, r0, leaf, lx, ly, 800 + s);
      const br = rng(810 + s), pal = [coral, lilac, white][s % 3];
      for (let i = 0; i < 5; i++) gardenBloom(ctx, cx + (br() - .5) * r0 * 1.4, y - r0 * .3 + (br() - .5) * r0 * .8, 4.5 + br() * 2.5, pal, lx, ly, 820 + s * 9 + i);
    }
    sward(ctx, -10, 120, 506, 30, ['#24663a', '#3d8a45', '#62ad55', '#9bd270'], 52, 3);
    sward(ctx, 300, 430, 506, 30, ['#24663a', '#3d8a45', '#62ad55', '#9bd270'], 53, 3);
    gardenCosmos(ctx, 26 - edge, 540, 30, ['#c63a72', '#f27aa6', '#ffd1e2', '#f2b33a', '#fff3c4'], .3, 61);
    gardenCosmos(ctx, 84 - edge, 566, 22, ['#e09a16', '#fbcb3c', '#fff0a8', '#b8561c', '#ffe9b0'], -.2, 62);
    gardenCosmos(ctx, 392 + edge, 548, 32, ['#6a4fc4', '#a687f6', '#e2d6ff', '#f2b33a', '#fff3c4'], -.4, 63);
    gardenCosmos(ctx, 340 + edge, 572, 20, ['#c63a72', '#f27aa6', '#ffd1e2', '#f2b33a', '#fff3c4'], .2, 64);
    // A blossoming branch reaches in over the top-left corner.
    gardenBranch(ctx, [[-30, 96 - edge], [10, 76 - edge], [48, 64 - edge], [86, 48 - edge], [114, 30 - edge]], 16,
      { leaf: '#4f8f4a', leafLit: '#8ac463', bloom: ['#e07f9c', '#f7b2c6', '#ffe4ec', '#f2b33a', '#fffaf0'] }, lx, ly, 71);
    for (const [a, len, w, al] of [[2.32, 560, 30, .1], [2.16, 520, 22, .08], [2.5, 480, 18, .07]]) shaft(ctx, sun[0], sun[1], a, len, 10, w * 2.4, '255,244,206', al);
    grade(ctx, 'rgba(255,228,176,.5)', 'rgba(80,100,150,.45)', 'rgba(60,70,90,.32)');
    grain(ctx, .06);
    if (framed) frame(ctx, '#4fb3a6', '#ffffff');
  }

  // The Moon Garden: a walled garden at night under a full moon. Cool moonlight from the upper right rims the
  // topiary and the glasshouse; a lantern and the glasshouse windows are the only warm light.
  function moonDisc(ctx, x, y, r) {
    bloom(ctx, x, y, r * 7, '170,170,255', .35); bloom(ctx, x, y, r * 2.6, '235,235,255', .6);
    dot(ctx, x, y, r, '#f4f1ff');
    clipTo(ctx, blob(x, y, r, r, 3, 0, 16), () => {
      for (const [cx, cy, cr, a] of [[-.3, -.2, .28, .16], [.28, .22, .22, .14], [.1, -.45, .14, .12], [-.38, .38, .16, .1], [.45, -.12, .1, .1]]) soft(ctx, () => ctx.arc(x + cx * r, y + cy * r, cr * r, 0, TAU), `rgba(150,150,205,${a})`, 2);
      soft(ctx, () => ctx.arc(x - r * .5, y + r * .45, r * 1.05, 0, TAU), 'rgba(120,120,190,.22)', 8);
    });
  }
  function moonTopiary(ctx, x, base, w, h, kind, seed) {
    const pal = { dark: '#161a45', mid: '#232a62', lit: '#3d4a92', glint: '#7f8fd8' };
    soft(ctx, () => ctx.ellipse(x - w * .2, base, w * .7, 4, 0, 0, TAU), 'rgba(8,8,30,.6)', 5);
    ctx.fillStyle = '#1a1438'; ctx.fillRect(x - 2, base - h * .25, 4, h * .25);
    if (kind === 'cone') {
      const pts = [[x, base - h], [x + w * .5, base - h * .22], [x + w * .3, base - h * .12], [x - w * .3, base - h * .12], [x - w * .5, base - h * .22]];
      shape(ctx, pts, lin(ctx, x + w, 0, x - w, 0, [[0, pal.lit], [.5, pal.mid], [1, pal.dark]]), null);
      rim(ctx, pts, 'rgba(170,190,255,.55)', 2, -1.5);
    } else {
      for (const [k, dy] of kind === 'stack' ? [[.42, .3], [.32, .66]] : [[.5, .45]]) clump(ctx, x, base - h * dy, w * k, pal, SUNWARD[0], SUNWARD[1], seed + k * 10);
    }
  }
  function moonflower(ctx, x, y, r, seed) {
    bloom(ctx, x, y, r * 4, '200,220,255', .3);
    gardenBloom(ctx, x, y, r, ['#b9c4ee', '#e4e9ff', '#ffffff', '#f6e7a8', '#ffffff'], SUNWARD[0], SUNWARD[1], seed, 5);
  }
  function paintGardenMoon(ctx, rush, framed) {
    const moon = [344, 92], edge = rush ? 14 : 0;
    wash(ctx, lin(ctx, 0, 0, 0, 430, [[0, '#0f1440'], [.45, '#1f2566'], [.8, '#3a3486'], [1, '#5b4a9c']]));
    bloom(ctx, 210, 450, 330, '200,130,230', .25);
    // A faint band of the galaxy, then stars: fine dust in the band, a few bright ones, the middle kept quiet.
    ctx.save(); ctx.translate(210, 210); ctx.rotate(-.55);
    soft(ctx, () => ctx.ellipse(0, 0, 340, 46, 0, 0, TAU), 'rgba(170,150,255,.12)', 30);
    soft(ctx, () => ctx.ellipse(-30, 6, 220, 20, 0, 0, TAU), 'rgba(220,200,255,.08)', 16);
    ctx.restore();
    const sr = rng(5101);
    for (let i = 0; i < 260; i++) {
      const x = sr() * 420, y = sr() * 400, band = Math.abs((y - 210) + (x - 210) * .62) < 50, inMiddle = x > 90 && x < 330 && y > 120 && y < 360;
      if (!band && sr() < .5) continue;
      if (inMiddle && sr() < .6) continue;
      dot(ctx, x, y, .35 + sr() * (band ? .6 : .9), `rgba(236,232,255,${.25 + sr() * .55})`);
    }
    for (const [x, y, s] of [[40, 60, 3], [118, 34, 2.4], [262, 50, 2.2], [396, 190, 2.6], [30, 236, 2.2], [210, 22, 2]]) { bloom(ctx, x, y, s * 5, '220,220,255', .45); sparkle(ctx, x, y, s, '#f4f0ff'); }
    moonDisc(ctx, moon[0], moon[1], 26);
    for (const [x, y, w] of [[300, 128, 150], [372, 150, 90]]) {
      soft(ctx, () => ctx.ellipse(x, y, w / 2, 6, -.05, 0, TAU), 'rgba(150,150,220,.35)', 6);
      soft(ctx, () => ctx.ellipse(x + 6, y - 3, w * .4, 2.5, -.05, 0, TAU), 'rgba(230,230,255,.35)', 3);
    }
    // Far hills, then the garden wall with the glasshouse glowing behind it.
    const far = [[-20, 392], [60, 378], [140, 386], [220, 370], [300, 382], [380, 366], [440, 374]];
    band(ctx, far, 560, lin(ctx, 0, 366, 0, 430, [[0, '#3b3d86'], [1, '#2c2d6c']]), null);
    rim(ctx, far.concat([[440, 440], [-20, 440]]), 'rgba(180,190,255,.45)', 2, -1.5);
    air(ctx, 366, 420, '90,76,160', .05, .4);
    // The glasshouse: a domed frame of panes, lamplit from inside, plants dark against the glow.
    const gx = 84, gy = 410, gw = 40, gh = 38;
    ctx.save(); ctx.beginPath(); ctx.moveTo(gx - gw, gy); ctx.lineTo(gx - gw, gy - gh * .45); ctx.quadraticCurveTo(gx - gw, gy - gh, gx, gy - gh); ctx.quadraticCurveTo(gx + gw, gy - gh, gx + gw, gy - gh * .45); ctx.lineTo(gx + gw, gy); ctx.closePath();
    ctx.fillStyle = rad(ctx, gx, gy - 8, gw * 1.2, [[0, '#ffd690'], [.6, '#e89a5a'], [1, '#7a4a6a']]); ctx.fill(); ctx.clip();
    for (const [x, y, r0] of [[gx - 22, gy - 6, 10], [gx - 8, gy - 2, 8], [gx + 16, gy - 8, 12], [gx + 30, gy - 2, 7]]) dot(ctx, x, y, r0, 'rgba(70,40,60,.7)');
    ctx.strokeStyle = 'rgba(40,34,80,.85)'; ctx.lineWidth = 1.4;
    for (let k = -gw; k <= gw; k += 10) { ctx.beginPath(); ctx.moveTo(gx + k, gy); ctx.quadraticCurveTo(gx + k * 1.02, gy - gh * .8, gx + k * .25, gy - gh); ctx.stroke(); }
    for (const t of [.25, .55, .8]) { ctx.beginPath(); ctx.moveTo(gx - gw, gy - gh * t * .6); ctx.quadraticCurveTo(gx, gy - gh * t * .6 - 6 - t * 18, gx + gw, gy - gh * t * .6); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#25285e'; ctx.fillRect(gx - gw - 2, gy - 2, gw * 2 + 4, 4);
    bloom(ctx, gx, gy - 16, 80, '255,190,110', .32);
    const wall = ridge(418, 1.5, 61, 40);
    soft(ctx, () => { smooth(ctx, wall.map(([x, y]) => [x, y - 3]), false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, 'rgba(8,8,30,.4)', 8);
    band(ctx, wall, 560, lin(ctx, 0, 414, 0, 470, [[0, '#2b2c66'], [1, '#1a1a46']]), null);
    rim(ctx, wall.concat([[440, 600], [-20, 600]]), 'rgba(170,180,255,.4)', 0, -2);
    for (const [x, w, h, kind, s] of [[30, 30, 70, 'cone', 1], [150, 30, 44, 'ball', 2], [276, 34, 52, 'stack', 3], [392, 32, 76, 'cone', 4], [344, 24, 38, 'ball', 5]]) moonTopiary(ctx, x + (x < 210 ? -edge : edge), 424, w, h, kind, s);
    // The lawn and a pale stone path to the launcher, silvered by the moon.
    const lawn = ridge(440, 2, 62, 50);
    band(ctx, lawn, 560, lin(ctx, 0, 436, 0, 560, [[0, '#2f3f7a'], [1, '#161a40']]), null);
    rim(ctx, lawn.concat([[440, 600], [-20, 600]]), 'rgba(150,170,255,.35)', 0, -2);
    for (const [x, y, w, h, s] of [[212, 452, 12, 4, 1], [206, 468, 16, 5, 2], [216, 486, 20, 6, 3], [208, 512, 30, 10, 4], [214, 544, 28, 9, 5]]) {
      soft(ctx, () => ctx.ellipse(x - 2, y + h * .5, w * 1.05, h * .6, 0, 0, TAU), 'rgba(6,6,24,.5)', 3);
      const pts = blob(x, y, w, h, s, .1, 10);
      lit(ctx, pts, '#a9aede', '#555a96'); rim(ctx, pts, 'rgba(230,236,255,.7)', 1.4, -1.6);
    }
    // Night flowers along the beds, glowing softly, and a lantern on a post for one warm note.
    const leaf = { dark: '#121640', mid: '#1f2a5e', lit: '#35478a', glint: '#5d72c0' };
    for (const [x, y, r0, s] of [[-4, 514, 34, 1], [46, 540, 28, 2], [104, 566, 24, 3], [424, 510, 36, 4], [372, 538, 30, 5], [318, 568, 24, 6]]) clump(ctx, x + (x < 210 ? -edge : edge), y, r0, leaf, SUNWARD[0], SUNWARD[1], 900 + s);
    const fr = rng(66);
    for (let i = 0; i < 14; i++) {
      const left = i % 2 === 0, x = left ? 6 + fr() * 100 - edge : 314 + fr() * 100 + edge, y = 494 + fr() * 50;
      moonflower(ctx, x, y, 4 + fr() * 3, 70 + i);
    }
    for (const [x, h, lean, s] of [[58, 80, 3, 1], [364, 86, -3, 2]]) gardenSpike(ctx, x + (x < 210 ? -edge : edge), 500, h, ['#5a63c8', '#8d9cf0', '#c4d0ff', '#2a3a6a'], lean, 300 + s);
    const lp = [96 - edge, 446];
    ctx.fillStyle = lin(ctx, lp[0] - 2, 0, lp[0] + 2, 0, [[0, '#14122e'], [1, '#3a3768']]); ctx.fillRect(lp[0] - 2, lp[1], 4, 60);
    bloom(ctx, lp[0], lp[1] - 4, 90, '255,190,110', .5);
    shape(ctx, [[lp[0] - 6, lp[1] - 12], [lp[0] + 6, lp[1] - 12], [lp[0] + 5, lp[1]], [lp[0] - 5, lp[1]]], '#ffd58a', null);
    ctx.fillStyle = '#2a2448'; ctx.fillRect(lp[0] - 8, lp[1] - 15, 16, 3.5); ctx.fillRect(lp[0] - 7, lp[1], 14, 2.5);
    bloom(ctx, lp[0], lp[1] - 6, 22, '255,236,180', .9);
    // Fireflies low in the garden.
    for (const [x, y] of [[40, 470], [130, 432], [300, 458], [384, 428], [250, 520], [160, 506]]) { bloom(ctx, x, y, 12, '220,255,150', .5); dot(ctx, x, y, 1.2, '#f6ffd0'); }
    grade(ctx, 'rgba(140,130,255,.35)', 'rgba(30,20,80,.5)', 'rgba(10,8,40,.45)');
    grain(ctx, .07);
    if (framed) frame(ctx, '#8f7fe8', '#e9e2ff');
  }

  // The Koi Conservatory's pond, seen from above: clear green-blue water over a pebbled floor, sunlight netting the
  // shallows, the glasshouse frame's shadow falling across it, lily pads at the edges and a jetty for the launcher.
  function koiPad(ctx, x, y, r, rot, seed, depth = 1) {
    soft(ctx, () => ctx.arc(x + 7 * depth, y + 9 * depth, r, 0, TAU), 'rgba(10,60,60,.32)', 6);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const notch = .32;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, notch, TAU - notch * .3); ctx.closePath();
    ctx.fillStyle = rad(ctx, -r * .3, -r * .35, r * 1.2, [[0, '#9fdc7a'], [.6, '#4fa85a'], [1, '#2c7d48']]); ctx.fill();
    ctx.strokeStyle = 'rgba(230,255,200,.35)'; ctx.lineWidth = 1;
    for (let k = 0; k < 7; k++) { const a = notch + (k + .5) / 7 * (TAU - notch * 1.3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a - .1) * r * .5, Math.sin(a - .1) * r * .5, Math.cos(a) * r * .88, Math.sin(a) * r * .88); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, r - 1, Math.PI * .9, Math.PI * 1.5); ctx.strokeStyle = 'rgba(240,255,220,.6)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  }
  function koiLily(ctx, x, y, r, pal, seed) {
    soft(ctx, () => ctx.arc(x + 5, y + 7, r * .9, 0, TAU), 'rgba(10,60,60,.3)', 4);
    for (const [k, n, turn] of [[1, 8, 0], [.7, 6, .4], [.42, 5, .9]]) {
      for (let i = 0; i < n; i++) {
        const a = turn + i / n * TAU;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, -r * k * .55, r * k * .24, r * k * .52, 0, 0, TAU);
        ctx.fillStyle = lin(ctx, 0, 0, 0, -r * k, [[0, pal[0]], [1, k < .5 ? pal[2] : pal[1]]]); ctx.fill(); ctx.restore();
      }
    }
    dot(ctx, x, y, r * .16, '#f5c64a');
  }
  function paintGardenKoi(ctx, rush, framed) {
    const edge = rush ? 14 : 0;
    // Deep water in the middle, shallower and brighter toward the banks, with the sky's glare at the top.
    wash(ctx, rad(ctx, 210, 250, 380, [[0, '#2aa2a1'], [.6, '#3fb4a8'], [1, '#6cc9b0']]));
    wash(ctx, lin(ctx, 0, 0, 0, 260, [[0, 'rgba(230,252,255,.35)'], [1, 'rgba(230,252,255,0)']]));
    // The pond floor: pebbles and sand seen through the water, softened by depth.
    const fr = rng(21);
    for (let i = 0; i < 60; i++) {
      const x = fr() * 420, y = fr() * 470, r0 = 4 + fr() * 12, mid = Math.abs(x - 210) < 140 && y < 420;
      soft(ctx, () => ctx.ellipse(x, y, r0, r0 * .7, fr() * 3, 0, TAU), mid ? `rgba(20,90,90,${.08 + fr() * .08})` : `rgba(200,240,210,${.08 + fr() * .1})`, 6);
    }
    for (const [x, y, w, h] of [[60, 120, 70, 120], [360, 300, 70, 140]]) soft(ctx, () => ctx.ellipse(x, y, w, h, .3, 0, TAU), 'rgba(240,236,190,.12)', 24);
    // Sunlight netting through the ripples: loose rings around a jittered grid, brightest in the shallows.
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const cr = rng(31);
    for (let row = 0; row < 18; row++) {
      for (let col = 0; col < 12; col++) {
        const cx = col * 38 + (row % 2) * 19 + (cr() - .5) * 12 - 10, cy = row * 32 + (cr() - .5) * 10 - 10;
        const pts = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + cr() * .5; pts.push([cx + Math.cos(a) * (15 + cr() * 6), cy + Math.sin(a) * (13 + cr() * 6)]); }
        const shallow = Math.min(1, Math.hypot(cx - 210, (cy - 250) * .8) / 260);
        if (cr() < .25) continue;
        stroke(ctx, pts, `rgba(210,255,240,${.025 + shallow * .07})`, .8 + cr() * 1.2, true);
      }
    }
    ctx.restore();
    for (const [a, len, w, al] of [[1.1, 620, 40, .1], [1.2, 600, 26, .08]]) shaft(ctx, 40, -20, a, len, 20, w * 2, '240,255,230', al);
    // The conservatory's iron glazing bars throw a faint slanted lattice of shadow over the water.
    ctx.save(); ctx.translate(210, 260); ctx.rotate(.32); ctx.globalAlpha = .5;
    for (let k = -6; k <= 6; k++) soft(ctx, () => ctx.rect(k * 74 - 2, -420, 4, 840), 'rgba(16,80,84,.16)', 3);
    for (let k = -5; k <= 5; k++) soft(ctx, () => ctx.rect(-420, k * 96 - 1.5, 840, 3), 'rgba(16,80,84,.12)', 3);
    ctx.restore();
    // Lily pads and two water lilies at the edges, ripples around them.
    for (const [x, y, r0, rot, s] of [[22, 150, 26, .4, 1], [58, 196, 16, 2.2, 2], [400, 110, 28, 1.6, 3], [370, 152, 15, 4.1, 4], [24, 380, 22, 3.2, 5], [398, 344, 24, .9, 6], [52, 432, 14, 5.2, 7], [376, 410, 16, 2.6, 8], [300, 24, 18, .3, 9], [120, 20, 14, 2.8, 10]]) {
      koiPad(ctx, x + (x < 210 ? -edge : edge), y, r0, rot, s);
    }
    koiLily(ctx, 26 - edge, 150, 12, ['#f7c0d0', '#ffe7ef', '#ffffff'], 1);
    koiLily(ctx, 398 + edge, 344, 11, ['#f4f0e4', '#ffffff', '#fffbe8'], 2);
    ctx.save(); ctx.globalAlpha = .3; ctx.strokeStyle = '#eafffa'; ctx.lineWidth = 1.1;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(70, 240, 18 + i * 13, 10 + i * 7, .2, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.ellipse(350, 210, 16 + i * 12, 9 + i * 6.5, -.2, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // The bank along the bottom: mossy stones either side of a wooden jetty that runs out to the launcher.
    const bank = ridge(478, 6, 71, 34);
    soft(ctx, () => { smooth(ctx, bank.map(([x, y]) => [x, y - 6]), false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, 'rgba(10,60,60,.4)', 10);
    band(ctx, bank, 560, lin(ctx, 0, 470, 0, 560, [[0, '#7aa86a'], [1, '#3f6e44']]), null);
    const stones = rng(72);
    for (let i = 0; i < 16; i++) {
      const x = i < 8 ? 8 + i * 22 + stones() * 8 : 268 + (i - 8) * 22 + stones() * 8, y = 482 + stones() * 16, w = 12 + stones() * 9, h = 9 + stones() * 6;
      if (Math.abs(x - 210) < 46) continue;
      soft(ctx, () => ctx.ellipse(x + 4, y + 6, w, h * .8, 0, 0, TAU), 'rgba(10,40,30,.45)', 4);
      const pts = blob(x, y, w, h, 700 + i, .14, 9);
      lit(ctx, pts, '#d9dccb', '#7f8a7a', 'other'); rim(ctx, pts, 'rgba(255,255,240,.6)', -1.5, -1.5);
      clipTo(ctx, pts, () => soft(ctx, () => ctx.ellipse(x - w * .2, y - h * .5, w * .6, h * .4, 0, 0, TAU), 'rgba(110,170,80,.55)', 3));
    }
    const plank = (x, y, w, h, tone) => { ctx.fillStyle = tone; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(255,240,210,.35)'; ctx.fillRect(x, y, w, 1.4); ctx.fillStyle = 'rgba(60,34,18,.35)'; ctx.fillRect(x, y + h - 1.2, w, 1.2); };
    soft(ctx, () => ctx.rect(176 + 6, 448 + 8, 68, 120), 'rgba(10,50,50,.45)', 6);
    for (let k = 0; k < 12; k++) plank(176, 448 + k * 10, 68, 9.4, ['#b88a5c', '#a87a4e', '#c39466'][k % 3]);
    for (const [x, y] of [[180, 452], [236, 452], [180, 512], [236, 512]]) { dot(ctx, x, y, 3.2, '#5e4028'); dot(ctx, x - .6, y - .6, 1.6, '#8c6a48'); }
    // A maple branch hangs over the top-right corner, its shadow falling on the water.
    const leaves = [[396, 20, 22], [420, 52, 20], [372, -4, 18], [350, 18, 13], [410, 86, 14]];
    for (const [x, y, r0] of leaves) soft(ctx, () => ctx.arc(x - 18 + edge, y + 26, r0, 0, TAU), 'rgba(10,60,60,.25)', 10);
    // Maple leaves: five pointed lobes, a lit half and a dark half either side of the midrib.
    const mr = rng(95);
    for (let i = 0; i < 16; i++) {
      const [bx, by, br] = leaves[i % leaves.length], a = mr() * TAU, d = mr() * br * .8, x = bx + edge + Math.cos(a) * d, y = by + Math.sin(a) * d, s = 9 + mr() * 6;
      ctx.save(); ctx.translate(x, y); ctx.rotate(mr() * TAU);
      const lobes = []; for (let k = 0; k < 10; k++) { const ang = k / 10 * TAU - Math.PI / 2, rr = k % 2 ? s * .45 : s * (k === 0 ? 1 : .85); lobes.push([Math.cos(ang) * rr, Math.sin(ang) * rr]); }
      ctx.beginPath(); lobes.forEach(([px, py], k) => k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath();
      ctx.fillStyle = ['#b8401f', '#d9602a', '#e9883a', '#a8321c'][i % 4]; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(255,220,140,.3)'; ctx.fillRect(0, -s, s, s * 2); ctx.restore();
      ctx.strokeStyle = 'rgba(90,24,10,.5)'; ctx.lineWidth = .8; for (let k = 0; k < 5; k++) { const ang = k / 5 * TAU - Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * s * .7, Math.sin(ang) * s * .7); ctx.stroke(); }
      ctx.restore();
    }
    grade(ctx, 'rgba(220,255,240,.35)', 'rgba(20,70,90,.45)', 'rgba(10,50,60,.35)');
    grain(ctx, .06);
    if (framed) frame(ctx, '#3badc6', '#e6fffb');
  }

  // ---------- Level 2: Root Tunnels ----------
  // Just under the meadow. Daylight pours down through the burrow we came in by, so the soil is warm and bright at
  // the top and sinks to deep umber below; the old tree's roots come down both sides, lit on the side facing the hole.
  const HOLE = [212, 18];
  // A tapering ribbon along the points, wide at the start; returns its outline.
  function ribbon2(pts, width, taper = .85) {
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      const dx = q[0] - o[0], dy = q[1] - o[1], len = Math.hypot(dx, dy) || 1, w = width * (1 - i / (pts.length - 1) * taper) / 2;
      left.push([p[0] - dy / len * w, p[1] + dx / len * w]); right.push([p[0] + dy / len * w, p[1] - dx / len * w]);
    }
    return left.concat(right.reverse());
  }
  // A root: bark modelled across its width toward the light, with grooves along its length and a rim where the light
  // catches it. No outline; a soft shadow behind lifts it off the soil.
  function bigRoot(ctx, pts, width, pal, seed, shadow = true) {
    const outline = ribbon2(pts, width);
    const [x0, , x1] = bounds(outline), toward = (x0 + x1) / 2 < HOLE[0] ? 1 : -1;
    if (shadow) soft(ctx, () => smooth(ctx, outline.map(([x, y]) => [x - toward * 3, y + 5]), true), 'rgba(40,18,6,.42)', 7);
    shape(ctx, outline, pal.dark, null);
    clipTo(ctx, outline, () => {
      // Round like a cylinder: the body sits a little toward the light, its lit band further still.
      shape(ctx, ribbon2(pts.map(([x, y]) => [x + toward * width * .12, y]), width * .78), pal.mid, null);
      ctx.save(); ctx.globalAlpha = .9; shape(ctx, ribbon2(pts.map(([x, y]) => [x + toward * width * .26, y]), width * .3), pal.lit, null); ctx.restore();
      const r = rng(seed);
      for (let k = 0; k < Math.max(4, width / 3); k++) {
        const off = (r() - .5) * width * .8, from = Math.floor(r() * (pts.length - 2));
        stroke(ctx, pts.slice(from, from + 2 + Math.floor(r() * 3)).map(([x, y]) => [x + off, y]), k % 3 ? 'rgba(60,30,12,.32)' : 'rgba(255,232,190,.3)', .8 + r() * 1.3);
      }
      wash(ctx, lin(ctx, 0, pts[0][1], 0, pts[0][1] + 60, [[0, 'rgba(30,14,4,.55)'], [1, 'rgba(30,14,4,0)']]), null, 1, x0 - 5, pts[0][1] - 5, x1 - x0 + 10, 70);
    });
    rim(ctx, outline, pal.rim, toward * 2.6, -1.2);
    return outline;
  }
  // A burrow in the soil: deep shade inside, the lip below catching light, a soft occlusion ring around it.
  function burrow(ctx, pts, seed, glow) {
    soft(ctx, () => smooth(ctx, pts.map(([x, y]) => [x, y + 2]), true), 'rgba(36,16,6,.45)', 8);
    const [x0, y0, x1, y1] = bounds(pts), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, h = y1 - y0;
    shape(ctx, pts, rad(ctx, cx, cy + h * .15, Math.max(x1 - x0, h) * .62, [[0, '#120703'], [.55, '#261207'], [1, '#4a2814']]), null);
    clipTo(ctx, pts, () => {
      // The roof overhangs, so the top of the opening is darkest; the floor of the tunnel catches a little light.
      soft(ctx, () => smooth(ctx, pts.map(([x, y]) => [x, y - h * .55]), true), 'rgba(8,3,0,.7)', 6);
      soft(ctx, () => ctx.ellipse(cx, y1 + h * .1, (x1 - x0) * .42, h * .28, 0, 0, TAU), 'rgba(150,96,56,.4)', 6);
    });
    rim(ctx, pts, 'rgba(226,170,112,.55)', 0, 3.5);
    const r = rng(seed);
    for (let i = 0; i < 7; i++) { const t = r(), x = x0 + t * (x1 - x0), y = edgeAt(pts, x) - 1; dot(ctx, x, y, .8 + r() * 1.2, 'rgba(240,196,140,.45)'); }
    if (glow) bloom(ctx, glow[0], glow[1], glow[2], '255,190,120', .18);
  }
  function grit(ctx, x0, y0, w, h, count, seed, keep) {
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const x = x0 + r() * w, y = y0 + r() * h;
      if (keep && !keep(x, y, r)) continue;
      dot(ctx, x, y, .5 + r() * 1.1, r() < .55 ? 'rgba(70,36,14,.3)' : 'rgba(255,226,180,.3)');
    }
  }
  function stone(ctx, x, y, w, h, seed, pal) {
    soft(ctx, () => ctx.ellipse(x, y + h * .7, w * 1.05, h * .45, 0, 0, TAU), 'rgba(40,18,6,.45)', 2.5);
    const pts = blob(x, y, w, h, seed, .16, 8);
    lit(ctx, pts, pal[0], pal[1]); rim(ctx, pts, pal[2], 1.2, -1.6);
  }
  function ant(ctx, x, y, s, carrying) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    for (const lx of [-3, 0, 3]) { stroke(ctx, [[lx, 0], [lx - 1.5, 3.5]], '#2a1a12', .8); stroke(ctx, [[lx, 0], [lx + 1.5, 3.5]], '#2a1a12', .8); }
    dot(ctx, -4.5, 0, 2.6, '#3b2418'); dot(ctx, 0, -.3, 2, '#3b2418'); dot(ctx, 4, -1, 2.3, '#3b2418');
    dot(ctx, -5.2, -.9, .9, 'rgba(255,220,180,.5)'); dot(ctx, 3.4, -1.9, .8, 'rgba(255,220,180,.5)');
    stroke(ctx, [[5, -2.5], [7.5, -5.5]], '#2a1a12', .7);
    if (carrying) { ctx.beginPath(); ctx.ellipse(1, -5.5, 3.6, 2, -.3, 0, TAU); ctx.fillStyle = '#8fd06a'; ctx.fill(); stroke(ctx, [[-1.6, -5], [3.6, -6]], 'rgba(60,120,50,.7)', .6); }
    ctx.restore();
  }
  // A seed sprouting toward the light: pale roots below, two leaves on a curling stem.
  function sprout(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    for (const [px, py] of [[-6, 6], [0, 9], [6, 5]]) stroke(ctx, [[0, 2], [px * .5, py * .6], [px, py + 4]], '#f0dcb2', 1);
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, -.2, 0, TAU); ctx.fillStyle = lin(ctx, -7, -5, 7, 5, [[0, '#e0a868'], [1, '#9a6534']]); ctx.fill();
    stroke(ctx, [[-2, -1], [2, 1.5]], 'rgba(110,67,34,.5)', .9);
    stroke(ctx, [[1, -4], [3, -12], [1, -20]], '#5aa85f', 1.6);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(1 + side * 4, -21, 4.4, 2.4, side * .5, 0, TAU); ctx.fillStyle = side > 0 ? '#9be07f' : '#6cbf66'; ctx.fill(); }
    ctx.restore();
  }
  function mole(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const body = blob(0, 0, 24, 15, 5, .05, 10);
    soft(ctx, () => ctx.ellipse(2, 14, 26, 5, 0, 0, TAU), 'rgba(20,8,2,.5)', 4);
    shape(ctx, body, lin(ctx, 0, -15, 0, 15, [[0, '#86716b'], [1, '#4e3d39']]), null); rim(ctx, body, 'rgba(255,220,190,.35)', 0, -2);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 15, 13, 7, 3.5, side * .3, 0, TAU); ctx.fillStyle = '#f0a5a4'; ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(-22, -2, 5, 4, 0, 0, TAU); ctx.fillStyle = '#f59aa5'; ctx.fill(); dot(ctx, -23.5, -3.4, 1.3, 'rgba(255,255,255,.7)');
    for (const ex of [-12, -4]) { ctx.beginPath(); ctx.arc(ex, -5, 2.4, .3, Math.PI - .3); ctx.strokeStyle = '#231816'; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.font = '600 9px Fredoka, sans-serif'; ctx.fillStyle = 'rgba(255,236,210,.8)'; ctx.fillText('z', 6, -20); ctx.font = '600 7px Fredoka, sans-serif'; ctx.fillText('z', 13, -27);
    ctx.restore();
  }
  function marble(ctx, x, y, r) {
    soft(ctx, () => ctx.ellipse(x + 1, y + r * .9, r, r * .35, 0, 0, TAU), 'rgba(20,8,2,.5)', 2);
    dot(ctx, x, y, r, '#3d8fc4');
    clipTo(ctx, blob(x, y, r, r, 1, 0, 12), () => { dot(ctx, x - r * .25, y - r * .3, r * .85, '#6cc3ee'); });
    ctx.beginPath(); ctx.moveTo(x - r * .6, y + r * .2); ctx.quadraticCurveTo(x, y - r * .5, x + r * .6, y + r * .1); ctx.strokeStyle = 'rgba(242,247,255,.85)'; ctx.lineWidth = 1.3; ctx.stroke();
    dot(ctx, x - r * .35, y - r * .42, r * .22, '#ffffff');
  }
  function shell(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    dot(ctx, 0, 0, 10.6, 'rgba(120,84,52,.35)');
    ctx.beginPath(); for (let a = 0; a < 3.2 * TAU; a += .2) { const rr = 1.4 * Math.exp(a * .16); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.strokeStyle = 'rgba(92,60,34,.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 10.6, 3.6, 5.6); ctx.strokeStyle = 'rgba(255,226,180,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
  function paintRoots(ctx, framed) {
    const [hx, hy] = HOLE;
    // The soil wall: warm where the daylight reaches, deep umber below, with soft strata between.
    wash(ctx, lin(ctx, 0, 0, 0, 560, [[0, '#d9a465'], [.35, '#b97f4c'], [.7, '#8f5a35'], [1, '#5e3820']]));
    const strata = [[96, 6, 21, 'rgba(255,214,160,.16)'], [104, 6, 21, 'rgba(110,60,26,.22)'], [196, 8, 22, 'rgba(110,60,26,.2)'], [292, 8, 23, 'rgba(255,214,160,.1)'], [300, 8, 23, 'rgba(90,48,20,.24)'], [400, 9, 24, 'rgba(70,36,14,.26)']];
    for (const [y, amp, seed, color] of strata) { const pts = ridge(y, amp, seed, 54); soft(ctx, () => { smooth(ctx, pts, false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, color, 6); }
    grit(ctx, 0, 40, 420, 520, 420, 404, (x, y, r) => !(Math.abs(x - 210) < 130 && y < 440 && r() < .7));
    // Far tunnels dug into the back of the wall, behind the roots and hazy with distance.
    for (const [pts, seed] of [[[[66, 352], [108, 344], [124, 358], [104, 370], [72, 368]], 1], [[[300, 98], [334, 92], [348, 104], [330, 114], [304, 112]], 2]]) burrow(ctx, pts, seed);
    air(ctx, 60, 460, '196,134,80', .35, .15);
    // The daylight: a bright pool at the hole, long shafts reaching down into the tunnels.
    bloom(ctx, hx, hy, 260, '255,214,150', .55);
    for (const [a, len, w0, w1, al] of [[1.66, 520, 18, 70, .2], [1.5, 470, 12, 48, .14], [1.82, 430, 10, 40, .12]]) shaft(ctx, hx, hy + 6, a, len, w0, w1, '255,236,190', al);
    // Small stones bedded in the wall, more of them toward the sides.
    const sr = rng(77), stonePal = ['#e8d6bc', '#9c8062', 'rgba(255,248,230,.7)'];
    for (let i = 0; i < 26; i++) {
      const side = i % 2, x = side ? 352 + sr() * 54 : 14 + sr() * 54, y = 70 + sr() * 360;
      stone(ctx, x, y, 2.8 + sr() * 4, 2.2 + sr() * 2.6, 900 + i, stonePal);
    }
    // The meadow overhead, seen from below: daylight through the grass, then a lip of dark topsoil with hair roots.
    wash(ctx, lin(ctx, 0, 0, 0, 30, [[0, '#fff3cf'], [1, '#bfe7a0']]), null, 1, -10, -10, 440, 40);
    sward(ctx, -10, 430, 30, 18, ['#2f7a3d', '#4b9a4a', '#7cc25c'], 141, 2.4);
    const lidTop = ridge(30, 3, 41, 26);
    ctx.beginPath(); smooth(ctx, lidTop, false); ctx.lineTo(440, 50); ctx.lineTo(-20, 50); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 26, 0, 50, [[0, '#4a2a16'], [1, '#6e4426']]); ctx.fill();
    for (let x = 18; x < 410; x += 13) stroke(ctx, [[x, 44], [x + 3, 52 + (x % 9)], [x - 1, 60 + (x * 3) % 14]], 'rgba(244,222,180,.6)', .9);
    // The hole itself: blue sky through it, grass leaning over its edge against the glare.
    const hole = blob(hx, hy + 14, 32, 17, 8, .06, 12);
    shape(ctx, hole, lin(ctx, 0, hy - 4, 0, hy + 32, [[0, '#9ed6f4'], [.55, '#e4f5fb'], [1, '#fff6dc']]), null);
    clipTo(ctx, hole, () => sward(ctx, hx - 40, hx + 40, hy + 34, 14, ['rgba(52,110,58,.85)', 'rgba(96,160,82,.75)'], 142, 2.6));
    bloom(ctx, hx, hy + 18, 80, '255,246,214', .75);
    // The old tree's roots come down both sides, branching into the soil; a young one hangs near the hole.
    const rootPal = { dark: '#6a3d1e', mid: '#a96e3e', lit: '#e2ad72', rim: 'rgba(255,232,186,.8)' };
    bigRoot(ctx, [[30, 40], [48, 100], [36, 168], [56, 240], [40, 316], [58, 390], [46, 446]], 34, rootPal, 1);
    bigRoot(ctx, [[50, 156], [80, 180], [96, 214], [92, 246]], 9, rootPal, 2);
    bigRoot(ctx, [[46, 306], [24, 334], [18, 368]], 8, rootPal, 3);
    bigRoot(ctx, [[392, 40], [370, 116], [386, 196], [364, 276], [382, 356], [370, 430]], 30, rootPal, 4);
    bigRoot(ctx, [[372, 232], [338, 254], [328, 286], [334, 312]], 8, rootPal, 5);
    bigRoot(ctx, [[160, 44], [166, 70], [158, 96]], 7, rootPal, 6);
    bigRoot(ctx, [[288, 44], [282, 74], [292, 104], [286, 122]], 6, rootPal, 7);
    carrot(ctx, 124, 22, .9);
    // Burrows along the edges: a worm in one, a line of ants in another.
    const worms = [[14, 262], [70, 250], [106, 266], [94, 292], [40, 298], [14, 294]];
    burrow(ctx, worms, 3); worm(ctx, 74, 278, 1, false);
    const ants = [[406, 150], [356, 140], [326, 156], [342, 178], [386, 182], [406, 178]];
    burrow(ctx, ants, 4);
    for (const [x, y, c] of [[338, 170, true], [352, 167, false], [366, 170, true], [380, 168, false]]) ant(ctx, x, y, 1, c);
    shell(ctx, 380, 330, 1);
    // The floor: the mole's chamber beside the launcher, a sprouting seed and a lost marble.
    const floor = ridge(452, 3, 51, 30);
    soft(ctx, () => { smooth(ctx, floor.map(([x, y]) => [x, y - 6]), false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, 'rgba(40,18,6,.35)', 10);
    band(ctx, floor, 560, lin(ctx, 0, 448, 0, 560, [[0, '#8d5c38'], [1, '#4c2c18']]), null);
    rim(ctx, floor.concat([[440, 600], [-20, 600]]), 'rgba(255,214,160,.35)', 0, -2.5);
    grit(ctx, 0, 456, 420, 104, 120, 505);
    for (const [x, y, w, h, s] of [[36, 482, 10, 7, 61], [74, 530, 8, 5, 62], [150, 520, 6, 4, 63], [270, 534, 7, 5, 64]]) stone(ctx, x, y, w, h, s, ['#dcc6a6', '#8a6c4e', 'rgba(255,240,210,.6)']);
    const den = [[296, 480], [350, 468], [400, 478], [400, 530], [340, 538], [292, 522]];
    burrow(ctx, den, 9, [348, 506, 60]); mole(ctx, 350, 508, .9);
    sprout(ctx, 40, 410, 1);
    marble(ctx, 236, 540, 5.5);
    // Near roots in the corners, almost in silhouette, give the picture a foreground.
    const nearPal = { dark: '#2e180b', mid: '#4a2a16', lit: '#7a4c2a', rim: 'rgba(255,214,160,.4)' };
    bigRoot(ctx, [[-14, 380], [14, 420], [6, 470], [24, 520], [10, 570]], 30, nearPal, 8);
    bigRoot(ctx, [[434, 300], [410, 360], [424, 430], [404, 500]], 26, nearPal, 9);
    grade(ctx, 'rgba(255,214,150,.6)', 'rgba(70,60,120,.55)', 'rgba(50,26,20,.5)');
    grain(ctx, .08);
    if (framed) frame(ctx, '#7a4f2a', '#f3d7a8');
  }

  // ---------- Level 3: Mushroom Grotto ----------
  // A violet cavern lit by its own mushrooms. A teal colony in the lower left is the key light, a warm amber colony
  // answers from the lower right, and between them the far hall sinks into lavender haze where the flowers play.
  // The old outlined rock wall, still used by the deeper levels.
  function caveWall(ctx, pts, fill, shade, line) { shape(ctx, pts, fill, null); cel(ctx, pts, shade, 6, 4); shape(ctx, pts, null, line, 1.8); }
  const GROTTO_KEY = [44, 486], GROTTO_WARM = [382, 496];
  const GROTTO_TEAL = { glow: '112,242,222', top: '#1f6f7e', mid: '#45c2b8', edge: '#c8fff2', gill: '#effff9', vein: 'rgba(40,150,150,.4)', stem: ['#dcf3ee', '#5c6c98'], spot: 'rgba(206,255,244,.7)' };
  const GROTTO_AMBER = { glow: '255,184,100', top: '#94462e', mid: '#e3934a', edge: '#ffe4aa', gill: '#fff4da', vein: 'rgba(170,96,40,.4)', stem: ['#f6e8d8', '#76648c'], spot: 'rgba(255,238,210,.7)' };
  const GROTTO_ROSE = { top: '#5a2650', mid: '#a4486e', edge: '#de7c96', gill: '#4e2c58', vein: 'rgba(30,12,36,.4)', stem: ['#d8c8de', '#5a4c7c'], spot: 'rgba(255,220,230,.7)' };
  // A mushroom: a stem that flares at the foot, gills under a domed cap. Glowing caps are lit from within, brightest
  // at the rim and gills; the others are lit from the side facing the key light. (x, y) is the foot, s the cap's
  // half-width, toward which side the light comes from.
  function grottoShroom(ctx, x, y, s, len, lean, pal, seed, dome = .64, toward = -1) {
    const r = rng(seed), bend = (r() - .5) * s * .7, glow = pal.glow, dh = s * dome;
    ctx.save(); ctx.translate(x, y); ctx.rotate(lean);
    if (glow) { bloom(ctx, 0, -len - dh * .3, s * 4.4, glow, .22); bloom(ctx, 0, -len - dh * .2, s * 2, glow, .3); }
    // The stem, lit at the top by the gills above it and sinking into shade at the foot.
    const sw = s * .19, bw = s * .3;
    const stem = [[-bw, 1], [-sw * 1.12 + bend * .6, -len * .45], [-sw + bend * .2, -len], [sw + bend * .2, -len], [sw * 1.12 + bend * .6, -len * .45], [bw, 1], [0, 3]];
    shape(ctx, stem, lin(ctx, -bw, 0, bw, 0, toward < 0 ? [[0, pal.stem[0]], [1, pal.stem[1]]] : [[0, pal.stem[1]], [1, pal.stem[0]]]), null);
    clipTo(ctx, stem, () => {
      if (glow) wash(ctx, lin(ctx, 0, -len, 0, -len * .3, [[0, rgba(glow, .8)], [1, rgba(glow, 0)]]), 'screen', 1, -s, -len - 2, s * 2, len);
      wash(ctx, lin(ctx, 0, -len * .4, 0, 2, [[0, 'rgba(34,20,64,0)'], [1, 'rgba(34,20,64,.7)']]), null, 1, -s, -len * .4, s * 2, len * .4 + 4);
      stroke(ctx, [[toward * sw * .45, -len * .92], [toward * sw * .6 + bend * .4, -len * .45], [toward * bw * .5, -3]], 'rgba(255,255,255,.22)', Math.max(.8, s * .06));
    });
    if (s > 16) {
      // A little skirt on the big ones.
      ctx.beginPath(); ctx.ellipse(bend * .22, -len * .8, sw * 1.7, s * .07, 0, 0, Math.PI); ctx.fillStyle = glow ? rgba(glow, .55) : 'rgba(220,200,230,.5)'; ctx.fill();
    }
    // The gills, then the cap over them.
    ctx.beginPath(); ctx.ellipse(0, -len, s * .94, s * .2, 0, 0, TAU);
    ctx.fillStyle = glow ? rad(ctx, 0, -len, s, [[0, pal.gill], [.75, pal.edge], [1, pal.mid]]) : pal.gill; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, -len, s * .94, s * .2, 0, 0, TAU); ctx.clip();
    for (let a = .12; a < Math.PI - .08; a += .2) { ctx.beginPath(); ctx.moveTo(0, -len - s * .06); ctx.lineTo(Math.cos(a) * s, -len + Math.sin(a) * s * .22); ctx.strokeStyle = pal.vein; ctx.lineWidth = .6; ctx.stroke(); }
    ctx.restore();
    const capPath = () => {
      ctx.beginPath(); ctx.moveTo(-s, -len + s * .02);
      ctx.bezierCurveTo(-s * 1.03, -len - dh * .8, -s * .5, -len - dh * 1.02, s * .05, -len - dh);
      ctx.bezierCurveTo(s * .6, -len - dh * .98, s * 1.04, -len - dh * .7, s, -len + s * .02);
      ctx.quadraticCurveTo(s * .55, -len + s * .15, 0, -len + s * .1); ctx.quadraticCurveTo(-s * .55, -len + s * .15, -s, -len + s * .02); ctx.closePath();
    };
    capPath();
    ctx.fillStyle = glow ? lin(ctx, 0, -len - dh, 0, -len + s * .1, [[0, pal.top], [.6, pal.mid], [1, pal.edge]])
      : lin(ctx, toward * s, -len - dh, -toward * s * .6, -len, [[0, pal.edge], [.4, pal.mid], [1, pal.top]]);
    ctx.fill();
    ctx.save(); capPath(); ctx.clip();
    // Freckles across the dome, smaller toward the rim.
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (.12 + r() * .76), d = .2 + r() * .62, px = Math.cos(a) * s * d * .95, py = -len - dh * .25 + Math.sin(a) * dh * d * .85, pr = s * (.045 + r() * .065) * (1.25 - d * .6);
      ctx.beginPath(); ctx.ellipse(px, py, pr * 1.3, pr, a * .2, 0, TAU); ctx.fillStyle = pal.spot; ctx.fill();
    }
    if (glow) {
      // Light from inside: the rim and lower dome glow, the crown stays deep.
      wash(ctx, rad(ctx, 0, -len + s * .25, s * 1.1, [[0, rgba(glow, .6)], [.55, rgba(glow, .2)], [1, rgba(glow, 0)]]), 'screen', 1, -s * 1.2, -len - dh - 2, s * 2.4, dh + s * .4);
      ctx.beginPath(); ctx.ellipse(-s * .34, -len - dh * .72, s * .3, dh * .14, -.4, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(toward * s * .42, -len - dh * .64, s * .3, dh * .14, toward * .5, 0, TAU); ctx.fillStyle = 'rgba(255,230,240,.18)'; ctx.fill();
    }
    ctx.restore();
    // The cap's thin lower lip.
    ctx.beginPath(); ctx.moveTo(-s, -len + s * .02); ctx.quadraticCurveTo(-s * .55, -len + s * .15, 0, -len + s * .1); ctx.quadraticCurveTo(s * .55, -len + s * .15, s, -len + s * .02);
    ctx.strokeStyle = glow ? rgba(glow, .8) : 'rgba(240,150,180,.45)'; ctx.lineWidth = Math.max(.8, s * .05); ctx.stroke();
    ctx.restore();
  }
  // A cave wall: deep violet rock, darkest at its outer edge, warmed by the colony at its foot. Soft bulges catch a
  // little light along the inner edge and deep seams run down between them.
  function grottoWall(ctx, pts, seed, light, lx, ly, side) {
    soft(ctx, () => smooth(ctx, pts.map(([x, y]) => [x - side * 5, y + 4]), true), 'rgba(16,8,36,.4)', 10);
    const [x0, , x1] = bounds(pts), outer = side < 0 ? x0 : x1, inner = side < 0 ? x1 : x0;
    shape(ctx, pts, lin(ctx, outer, 0, inner, 0, [[0, '#120b24'], [.55, '#1d1538'], [1, '#2a1f4c']]), null);
    clipTo(ctx, pts, () => {
      const r = rng(seed);
      for (let i = 0; i < 7; i++) {
        const y = 70 + i * 56 + r() * 30, ex = edgeAt(pts.filter(p => p[1] > 0).map(([x, yy]) => [yy, x]).sort((a, b) => a[0] - b[0]), y);
        soft(ctx, () => ctx.ellipse(ex + side * (12 + r() * 8), y, 10 + r() * 8, 26 + r() * 20, 0, 0, TAU), 'rgba(150,130,220,.12)', 12);
        soft(ctx, () => ctx.ellipse(ex + side * (24 + r() * 10), y + 30, 5, 22 + r() * 14, side * .1, 0, TAU), 'rgba(8,2,20,.4)', 8);
      }
      wash(ctx, rad(ctx, lx, ly, 300, [[0, rgba(light, .55)], [.3, rgba(light, .18)], [1, rgba(light, 0)]]), 'screen');
      wash(ctx, lin(ctx, 0, 20, 0, 160, [[0, 'rgba(10,4,24,.8)'], [1, 'rgba(10,4,24,0)']]), null, 1, -10, 20, 440, 140);
    });
    rim(ctx, pts, rad(ctx, lx, ly, 240, [[0, rgba(light, .75)], [.6, rgba(light, .2)], [1, rgba(light, 0)]]), -side * 1.8, 1.4);
  }
  // A shelf of rock grown out of a wall: a front face in shade, a mossy top lit by the colony that grows on it, and
  // moss hanging off its lip.
  function grottoLedge(ctx, x0, x1, y, side, seed, light) {
    const r = rng(seed), w = x1 - x0, tip = side < 0 ? x1 : x0, root = side < 0 ? x0 : x1, k = -side;
    const face = [[root, y - 2.5], [tip - k * 7, y - 2], [tip - k * 1.5, y + .5], [tip, y + 5], [tip - k * 3, y + 10], [tip - k * 13, y + 14], [root + k * w * .45, y + 19], [root + k * 9, y + 28], [root, y + 36]];
    soft(ctx, () => ctx.ellipse(tip - k * w * .4, y + 20, w * .42, 8, 0, 0, TAU), 'rgba(8,2,22,.5)', 9);
    shape(ctx, face, lin(ctx, 0, y - 2, 0, y + 30, [[0, '#45387a'], [.25, '#2e2458'], [1, '#22183f']]), null);
    grottoEdge(ctx, face, tip, y - 12, 44, light, .45);
    // The moss: a bumpy cushion along the top.
    const top = [], under = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, x = root + k * w * t; top.push([x, y - 1.5 - Math.sin(t * Math.PI) * 2 - r() * 2.2]); under.push([x, y + 2.4 + r() * 1.6 + (t > .85 ? 2 : 0)]); }
    shape(ctx, top.concat(under.reverse()), lin(ctx, 0, y - 6, 0, y + 5, [[0, rgba(light, .95)], [.4, '#4a9a8e'], [1, '#2a5060']]), null);
    for (let i = 0; i < 4; i++) {
      const x = root + k * w * (.35 + r() * .62), len = 6 + r() * 12, hang = [[x, y + 2], [x + (r() - .5) * 2, y + 2 + len * .5], [x + (r() - .5) * 3, y + 2 + len]];
      shape(ctx, ribbon2(hang, 2.6, .9), lin(ctx, 0, y, 0, y + len, [[0, '#3f8a80'], [1, rgba(light, .5)]]), null);
    }
  }
  function grottoMoss(ctx, x0, x1, y, seed, light, tilt = 0) {
    const r = rng(seed), w = x1 - x0, top = [], under = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, x = x0 + w * t, yy = y + tilt * w * t; top.push([x, yy - Math.sin(t * Math.PI) * 2.4 - r() * 2]); under.push([x, yy + 2.6 + r() * 1.4]); }
    shape(ctx, top.concat(under.reverse()), lin(ctx, 0, y - 5, 0, y + 5, [[0, rgba(light, .85)], [.4, '#3d8a7e'], [1, 'rgba(38,64,90,.6)']]), null);
  }
  // Hanging vines with beads of light, strung from the roof near the walls.
  function grottoVine(ctx, x, y, len, seed, light) {
    const r = rng(seed), pts = [];
    for (let i = 0; i <= 6; i++) pts.push([x + Math.sin(i * 1.1 + seed) * 3.4 + i * (r() - .5) * .8, y + len * i / 6]);
    stroke(ctx, pts, 'rgba(20,46,62,.9)', 1.9); stroke(ctx, pts.map(([px, py]) => [px - .5, py]), 'rgba(80,160,150,.5)', .7);
    for (let i = 1; i <= 6; i++) {
      const [px, py] = pts[i], side = i % 2 ? -1 : 1;
      ctx.beginPath(); ctx.ellipse(px + side * 3.4, py - 3, 3.2, 1.4, side * .7, 0, TAU); ctx.fillStyle = i % 3 ? '#2a5c62' : '#3f8a84'; ctx.fill();
      if (i > 1 && (i === 6 || r() < .5)) { bloom(ctx, px, py + 3, 10, light, .5); ctx.beginPath(); ctx.ellipse(px, py + 3, 1.5, 2.1, 0, 0, TAU); ctx.fillStyle = '#dcfff6'; ctx.fill(); }
    }
  }
  // Columns where stalactite and stalagmite have grown together, pinched at the waist.
  function grottoPillar(x, w, waist, y0, y1, seed) {
    const r = rng(seed), h = y1 - y0, j = () => (r() - .5) * w * .1;
    const L = [[x - w * .62, y0], [x - w * .34 + j(), y0 + h * .22], [x - waist / 2 + j(), y0 + h * .5], [x - w * .32 + j(), y0 + h * .78], [x - w * .66, y1]];
    const R = [[x + w * .7, y1], [x + w * .34 + j(), y0 + h * .76], [x + waist / 2 + j(), y0 + h * .48], [x + w * .3 + j(), y0 + h * .2], [x + w * .58, y0]];
    return L.concat(R);
  }
  // A cluster of stalagmites standing on one base line, each a soft cone.
  function grottoSpires(ctx, base, spires, fill, rimColor, dx) {
    for (const [x, tip, w] of spires) {
      const h = base - tip, pts = [[x - w / 2, base + 4], [x - w * .3, tip + h * .45], [x - w * .08, tip + 5], [x + w * .02, tip], [x + w * .1, tip + 6], [x + w * .32, tip + h * .5], [x + w / 2, base + 4]];
      shape(ctx, pts, fill, null); rim(ctx, pts, rimColor, dx, -.6);
    }
  }
  function grottoBat(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const line = 'rgba(26,16,48,.6)';
    stroke(ctx, [[-2, -13], [-1.4, -7]], '#241a3e', 1.3); stroke(ctx, [[2, -13], [1.4, -7]], '#241a3e', 1.3);
    // Hanging upside down, wings folded round like a cloak; the ears point at the floor.
    const body = [[0, -8], [7, -5], [10, 3], [8, 11], [3, 15], [-3, 15], [-8, 11], [-10, 3], [-7, -5]];
    soft(ctx, () => ctx.ellipse(0, 6, 12, 12, 0, 0, TAU), 'rgba(255,184,100,.16)', 6);
    shape(ctx, body, lin(ctx, 0, -8, 0, 15, [[0, '#2e2250'], [.55, '#4c3c78'], [1, '#7e6290']]), line, .9);
    stroke(ctx, [[-6, -3], [-3.6, 6], [-4.4, 12]], 'rgba(26,16,48,.45)', .8); stroke(ctx, [[6, -3], [3.6, 6], [4.4, 12]], 'rgba(26,16,48,.45)', .8);
    for (const ex of [-3.4, 3.4]) { ctx.beginPath(); ctx.moveTo(ex - 2, 13.6); ctx.lineTo(ex * 1.3, 19); ctx.lineTo(ex + 2, 13.8); ctx.closePath(); ctx.fillStyle = '#6a5290'; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = .8; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, 9.6, 5.4, 4.4, 0, 0, TAU); ctx.fillStyle = '#7a62a0'; ctx.fill();
    for (const ex of [-2.2, 2.2]) { ctx.beginPath(); ctx.arc(ex, 9.2, 1.3, Math.PI + .4, -.4); ctx.strokeStyle = '#f2e6ff'; ctx.lineWidth = .9; ctx.stroke(); }
    dot(ctx, 0, 11.8, .7, '#241a3e');
    stroke(ctx, [[-8.4, 9], [-3, 14.6]], 'rgba(255,200,140,.4)', 1); stroke(ctx, [[8.4, 9], [3, 14.6]], 'rgba(255,200,140,.4)', 1);
    ctx.restore();
  }
  function grottoSnail(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    soft(ctx, () => ctx.ellipse(0, 1, 16, 2.4, 0, 0, TAU), 'rgba(12,6,26,.5)', 3);
    const foot = [[-15, 0], [-6, -3], [8, -3], [13, -8], [15, -13], [18, -12], [18.6, -5], [14, 0], [0, 1.4]];
    shape(ctx, foot, lin(ctx, 0, -13, 0, 1, [[0, '#d8e6c4'], [1, '#8a9c8c']]), 'rgba(70,90,70,.5)', .9);
    for (const [ax, ay] of [[15, -12.6], [17.6, -11.8]]) { const tx = ax + .8 + (ax - 16), ty = ay - 6; stroke(ctx, [[ax, ay], [tx, ty]], 'rgba(90,110,80,.9)', .8); dot(ctx, tx, ty - .4, 1.1, '#e6f2d2'); }
    dot(ctx, 16.6, -10.2, .8, '#3a3a3a');
    ctx.beginPath(); ctx.arc(-2, -9, 9, 0, TAU);
    ctx.fillStyle = rad(ctx, -2, -9, 9, [[0, '#ffd890'], [.6, '#e0924a'], [1, '#9a4e2c']], 2, -6, 1); ctx.fill();
    ctx.strokeStyle = 'rgba(120,60,30,.45)'; ctx.lineWidth = .9; ctx.stroke();
    ctx.beginPath(); for (let a = 0; a < 2.6 * TAU; a += .2) { const rr = 1 + a * .46; ctx.lineTo(-2 + Math.cos(a) * rr, -9 + Math.sin(a) * rr); } ctx.strokeStyle = 'rgba(140,70,32,.55)'; ctx.lineWidth = .9; ctx.stroke();
    ctx.beginPath(); ctx.arc(-2, -9, 7.4, 3.5, 4.6); ctx.strokeStyle = 'rgba(255,246,220,.6)'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
  }
  // Spores drifting up from a colony: a loose plume of soft motes, thinning as it rises.
  function grottoSpores(ctx, x, y, w, h, n, light, seed) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const t = Math.pow(r(), .8), px = x + (r() - .5) * w * (.4 + t * .6) + Math.sin(t * 5 + seed) * 10, py = y - t * h, s = .6 + r() * 1.1 * (1 - t * .5);
      bloom(ctx, px, py, s * 4.5, light, .2 * (1 - t * .6));
      dot(ctx, px, py, s * .7, rgba(light, .7 * (1 - t * .55)));
    }
  }
  // A soft inner glow along a shape's edges, fading with distance from a light at (lx, ly).
  function grottoEdge(ctx, pts, lx, ly, r, rgb, a) {
    clipTo(ctx, pts, () => {
      for (const [w, k] of [[14, .2], [7, .35], [2.5, .6]]) {
        ctx.beginPath(); smooth(ctx, pts, true); ctx.strokeStyle = rad(ctx, lx, ly, r, [[0, rgba(rgb, a * k)], [.6, rgba(rgb, a * k * .4)], [1, rgba(rgb, 0)]]);
        ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.stroke();
      }
    });
  }
  // A giant mushroom far back in the hall, a hazy silhouette whose gills still glow and light the cap's rim.
  function grottoGiant(ctx, x, y, s, len, lean, top, under, light, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(lean);
    const dh = s * .5, stem = [[-s * .34, 2], [-s * .18, -len * .12], [-s * .13, -len * .55], [-s * .11, -len], [s * .11, -len], [s * .15, -len * .5], [s * .2, -len * .1], [s * .38, 2]];
    shape(ctx, stem, lin(ctx, 0, -len, 0, 0, [[0, under], [.3, top], [1, under]]), null);
    bloom(ctx, 0, -len + s * .05, s * 1.4, light, a);
    const cap = () => {
      ctx.beginPath(); ctx.moveTo(-s, -len + s * .04);
      ctx.bezierCurveTo(-s * .96, -len - dh * .9, -s * .4, -len - dh * 1.05, 0, -len - dh);
      ctx.bezierCurveTo(s * .45, -len - dh * 1.04, s * .98, -len - dh * .85, s, -len + s * .04);
      ctx.quadraticCurveTo(0, -len - s * .06, -s, -len + s * .04); ctx.closePath();
    };
    cap(); ctx.fillStyle = lin(ctx, 0, -len - dh, 0, -len + s * .04, [[0, top], [1, under]]); ctx.fill();
    ctx.save(); cap(); ctx.clip();
    wash(ctx, lin(ctx, 0, -len - dh * .3, 0, -len + s * .05, [[0, rgba(light, 0)], [1, rgba(light, a * .9)]]), 'screen', 1, -s - 2, -len - dh, s * 2 + 4, dh + s * .1);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -len + s * .015, s * .92, s * .07, 0, 0, Math.PI); ctx.fillStyle = rgba(light, a * 1.2); ctx.fill();
    ctx.restore();
  }
  function paintGrotto(ctx, framed) {
    const [kx, ky] = GROTTO_KEY, [wx, wy] = GROTTO_WARM, TEAL = GROTTO_TEAL.glow, AMBER = GROTTO_AMBER.glow, AIR = '120,102,186', HALL = '156,136,226';
    // The far hall: deep violet overhead, opening out into a lavender glow low down behind the flowers.
    wash(ctx, lin(ctx, 0, 0, 0, 560, [[0, '#1a1232'], [.16, '#281d4e'], [.45, '#3f3276'], [.7, '#54468c'], [.8, '#4c3f86'], [1, '#261c46']]));
    bloom(ctx, 214, 420, 300, '164,140,224', .34);
    for (const [x, w, waist, s] of [[52, 80, 36, 1], [372, 90, 40, 4]]) {
      const pts = grottoPillar(x, w, waist, 10, 440, s);
      shape(ctx, pts, lin(ctx, 0, 0, 0, 440, [[0, '#2c2258'], [.55, '#43367c'], [1, '#56488e']]), null);
    }
    const fr = rng(37), farRoof = [[440, -10], [-20, -10]];
    for (let x = -20; x <= 440; x += 16 + fr() * 14) { const deep = fr() < .3; farRoof.push([x, 50 + fr() * 8], [x + 5, deep ? 80 + fr() * 30 : 60 + fr() * 10], [x + 10, 52 + fr() * 6]); }
    shape(ctx, farRoof, '#291e50', null);
    air(ctx, 0, 470, AIR, .22, .3);
    // Giant mushrooms far back in the hall, hazy silhouettes whose gills still glow.
    grottoGiant(ctx, 300, 436, 56, 156, .05, '#382c70', '#4a3d86', AMBER, .2);
    grottoGiant(ctx, 120, 440, 74, 214, -.04, '#32276a', '#463a84', TEAL, .22);
    grottoGiant(ctx, 212, 438, 28, 66, .1, '#44387e', '#504390', TEAL, .14);
    air(ctx, 0, 470, AIR, .18, .26);
    // Slow wisps of spore haze hanging in the hall.
    for (const [x, y, w, h, a] of [[150, 130, 170, 12, .1], [300, 176, 130, 9, .08], [190, 300, 200, 14, .09], [110, 372, 120, 10, .08]]) soft(ctx, () => ctx.ellipse(x, y, w / 2, h, -.03, 0, TAU), `rgba(186,170,240,${a})`, 14);
    // The far floor, a ridge of distant colonies glowing faintly along it.
    band(ctx, ridge(424, 5, 31, 52), 560, lin(ctx, 0, 414, 0, 470, [[0, '#4e4188'], [1, '#3a2e6c']]), null);
    for (const [x, y, k] of [[150, 422, 1], [262, 418, .8], [96, 426, .6], [324, 424, .7], [196, 426, .5]]) { const c = x < 210 ? TEAL : AMBER; bloom(ctx, x, y, 30 * k, c, .18); dot(ctx, x, y - 1, 1.4 * k, rgba(c, .45)); }
    air(ctx, 384, 470, '160,140,220', 0, .22);
    // The middle distance: stalactites from the roof and rounded flowstone banked against the walls.
    for (const [x, w, h, s] of [[112, 34, 84, 4], [150, 18, 40, 5], [276, 20, 46, 6], [314, 38, 92, 7]]) {
      const r = rng(s), pts = [[x - w / 2, -4], [x - w * .32, h * .45], [x - w * .08 + (r() - .5) * 4, h * .86], [x + w * .02, h], [x + w * .14, h * .8], [x + w * .34, h * .4], [x + w / 2, -4]];
      shape(ctx, pts, lin(ctx, 0, 0, 0, h, [[0, '#211845'], [1, '#3c3070']]), null);
      grottoEdge(ctx, pts, x < 210 ? kx : wx, 300, 300, x < 210 ? TEAL : AMBER, .35);
    }
    for (const [pts, light, lx2, ly2] of [[[[-20, 480], [-20, 316], [14, 306], [40, 322], [56, 352], [76, 374], [98, 398], [116, 430], [126, 476]], TEAL, kx, ky],
      [[[440, 480], [440, 300], [404, 296], [378, 318], [360, 350], [338, 374], [318, 404], [304, 440], [298, 476]], AMBER, wx, wy]]) {
      shape(ctx, pts, lin(ctx, 0, 300, 0, 470, [[0, '#3a2e70'], [1, '#2a2054']]), null);
      grottoEdge(ctx, pts, lx2, ly2, 260, light, .7);
    }
    air(ctx, 40, 470, AIR, .08, .12);
    // The colonies' light reaching into the cave, teal from the left and amber from the right.
    bloom(ctx, kx + 10, ky + 20, 330, TEAL, .32);
    bloom(ctx, wx, wy + 20, 240, AMBER, .22);
    for (const [a, len, w, al] of [[-1.02, 380, 40, .06], [-1.28, 330, 28, .05], [-.82, 300, 24, .04]]) shaft(ctx, kx + 14, ky - 6, a, len, 18, w, TEAL, al);
    // Near walls with their ledges, and the roof.
    const left = [[-30, 10], [36, 26], [52, 64], [58, 112], [48, 156], [42, 196], [46, 230], [34, 276], [30, 310], [36, 346], [44, 380], [38, 412], [36, 444], [44, 474], [-30, 490]];
    const right = [[450, 10], [386, 26], [370, 70], [366, 120], [376, 160], [380, 196], [378, 236], [388, 268], [386, 300], [388, 340], [392, 384], [382, 430], [378, 474], [450, 490]];
    grottoWall(ctx, left, 11, TEAL, kx, ky, -1);
    grottoWall(ctx, right, 12, AMBER, wx, wy, 1);
    grottoEdge(ctx, left, 220, 300, 250, HALL, .3); grottoEdge(ctx, right, 200, 300, 250, HALL, .3);
    const roof = [[-20, -20], [440, -20], [440, 30], [402, 40], [360, 32], [318, 44], [272, 34], [226, 42], [184, 32], [136, 42], [92, 34], [50, 44], [-20, 34]];
    soft(ctx, () => smooth(ctx, roof.map(([x, y]) => [x, y + 7]), true), 'rgba(12,6,28,.6)', 10);
    shape(ctx, roof, lin(ctx, 0, 0, 0, 46, [[0, '#110b22'], [1, '#231a44']]), null);
    for (const [x, w, h] of [[30, 26, 66], [64, 12, 28], [104, 12, 18], [300, 10, 16], [350, 18, 34], [388, 28, 70]]) {
      const top = 30, pts = [[x - w / 2, top], [x - w * .22, top + h * .55], [x + w * .04, top + h], [x + w * .2, top + h * .5], [x + w / 2, top]];
      shape(ctx, pts, lin(ctx, x - w / 2, 0, x + w / 2, 0, [[0, '#251a46'], [1, '#150e2c']]), null);
      grottoEdge(ctx, pts, x < 210 ? kx : wx, 260, 300, x < 210 ? TEAL : AMBER, .45);
    }
    // The ledge colonies; the snail works along the lower right ledge.
    grottoLedge(ctx, 24, 86, 200, -1, 1, TEAL);
    grottoLedge(ctx, 338, 404, 192, 1, 2, AMBER);
    grottoLedge(ctx, 20, 80, 366, -1, 3, TEAL);
    grottoLedge(ctx, 350, 408, 302, 1, 4, AMBER);
    grottoShroom(ctx, 54, 200, 9, 10, -.22, GROTTO_TEAL, 3, .7, 1);
    grottoShroom(ctx, 70, 202, 14, 16, .06, GROTTO_TEAL, 1, .62, 1);
    grottoShroom(ctx, 86, 205, 6, 7, .32, GROTTO_TEAL, 2, .72, 1);
    grottoShroom(ctx, 340, 192, 7, 8, -.3, GROTTO_AMBER, 5, .72, -1);
    grottoShroom(ctx, 356, 191, 13, 14, .1, GROTTO_AMBER, 4, .62, -1);
    grottoShroom(ctx, 64, 366, 10, 11, .12, GROTTO_TEAL, 6, .66, 1);
    grottoShroom(ctx, 50, 364, 6, 7, -.24, GROTTO_ROSE, 7, .72, 1);
    grottoSnail(ctx, 368, 301, .7);
    for (const [x, len, s] of [[16, 160, 1], [32, 104, 2], [48, 64, 3], [384, 128, 4], [402, 180, 5]]) grottoVine(ctx, x, 34, len, s, x < 210 ? TEAL : AMBER);
    grottoBat(ctx, 350, 72, .86);
    // The floor dips into a basin, and the basin holds a still pool: the hall's lavender glow lies on its far half,
    // the dark roof on its near half, and each colony drops a long soft reflection into it.
    const floor = ridge(452, 3, 71, 40);
    soft(ctx, () => { smooth(ctx, floor.map(([x, y]) => [x, y - 8]), false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, 'rgba(18,10,40,.4)', 12);
    band(ctx, floor, 560, lin(ctx, 0, 446, 0, 560, [[0, '#3a2e6c'], [.3, '#2a204e'], [1, '#160e2c']]), null);
    grottoEdge(ctx, floor.concat([[440, 600], [-20, 600]]), 210, 400, 240, HALL, .4);
    const pool = [[90, 484], [124, 470], [170, 465], [214, 462], [262, 466], [300, 471], [334, 484], [326, 520], [286, 541], [210, 549], [134, 541], [96, 520]];
    soft(ctx, () => smooth(ctx, pool.map(([x, y]) => [x, y + 2]), true), 'rgba(10,4,24,.6)', 6);
    shape(ctx, pool, lin(ctx, 0, 462, 0, 549, [[0, '#8574bc'], [.12, '#5c4e9e'], [.45, '#34296c'], [1, '#18123a']]), null);
    clipTo(ctx, pool, () => {
      for (const [x, c, a, w] of [[kx + 56, TEAL, .45, 44], [wx - 54, AMBER, .36, 36]]) {
        wash(ctx, lin(ctx, x - w, 0, x + w, 0, [[0, rgba(c, 0)], [.5, rgba(c, a)], [1, rgba(c, 0)]]), 'screen', 1, x - w, 460, w * 2, 100);
      }
      soft(ctx, () => ctx.ellipse(210, 528, 52, 14, 0, 0, TAU), 'rgba(14,8,34,.5)', 6);
      const r = rng(81);
      for (let i = 0; i < 16; i++) { const y = 472 + Math.pow(r(), 1.3) * 74, x = 104 + r() * 212, w = 8 + r() * 30 * (1 - (y - 470) / 120); stroke(ctx, [[x - w / 2, y], [x + w / 2, y]], i % 3 ? 'rgba(210,200,255,.2)' : 'rgba(20,10,40,.3)', .8); }
    });
    stroke(ctx, pool.slice(0, 7), 'rgba(206,196,252,.4)', 1);
    // The launcher's stone: an island of moss in the middle of the pool.
    bloom(ctx, 210, 500, 80, '176,156,236', .18);
    soft(ctx, () => ctx.ellipse(212, 518, 58, 8, 0, 0, TAU), 'rgba(8,2,22,.6)', 6);
    const rock = [[156, 510], [164, 498], [186, 491], [214, 489], [244, 492], [262, 500], [266, 510], [252, 520], [214, 524], [172, 520]];
    shape(ctx, rock, lin(ctx, 0, 490, 0, 524, [[0, '#4c3e80'], [.5, '#2e2458'], [1, '#1a1234']]), null);
    const cap = [[160, 503], [168, 496], [180, 492], [194, 488], [208, 489], [222, 486], [236, 489], [250, 492], [262, 501], [244, 504], [214, 507], [184, 506]];
    shape(ctx, cap, lin(ctx, 0, 487, 0, 507, [[0, '#8fcabc'], [.45, '#55938e'], [1, '#33606e']]), null);
    grottoEdge(ctx, cap, 190, 480, 80, '210,255,244', .6);
    stroke(ctx, [[160, 512], [190, 519], [236, 519], [262, 511]], 'rgba(200,190,250,.3)', 1);
    // The colonies stand on mossy mounds in the corners, with dusky toadstools at their feet.
    for (const [pts, light, lx2, ly2] of [[[[-20, 600], [-20, 466], [24, 472], [66, 486], [100, 506], [128, 534], [140, 600]], TEAL, kx, ky], [[[440, 600], [440, 474], [402, 480], [360, 494], [324, 518], [300, 548], [296, 600]], AMBER, wx, wy]]) {
      soft(ctx, () => smooth(ctx, pts.map(([x, y]) => [x, y - 4]), true), 'rgba(8,2,22,.5)', 10);
      shape(ctx, pts, lin(ctx, 0, 466, 0, 560, [[0, '#33285e'], [1, '#140c28']]), null);
      clipTo(ctx, pts, () => wash(ctx, rad(ctx, lx2, ly2 + 10, 150, [[0, rgba(light, .45)], [1, rgba(light, 0)]]), 'screen'));
      grottoEdge(ctx, pts, lx2, ly2, 170, light, .4);
      clipTo(ctx, pts, () => soft(ctx, () => smooth(ctx, pts.slice(1, -1).map(([x, y]) => [x, y + 3]), false), rgba(light, .3), 6));
    }
    grottoShroom(ctx, 152, 556, 8, 12, .14, GROTTO_ROSE, 21, .7, -1);
    grottoShroom(ctx, 132, 548, 11, 18, -.06, GROTTO_ROSE, 22, .66, -1);
    grottoShroom(ctx, 14, 484, 8, 10, -.3, GROTTO_TEAL, 24, .7, 1);
    grottoShroom(ctx, 102, 526, 20, 28, .14, GROTTO_TEAL, 23, .6, 1);
    grottoShroom(ctx, 48, 528, 40, 44, -.06, GROTTO_TEAL, 25, .58, 1);
    grottoShroom(ctx, 286, 558, 7, 10, -.16, GROTTO_ROSE, 26, .7, 1);
    grottoShroom(ctx, 410, 494, 8, 11, .3, GROTTO_AMBER, 28, .7, -1);
    grottoShroom(ctx, 328, 538, 16, 22, -.16, GROTTO_AMBER, 27, .62, -1);
    grottoShroom(ctx, 378, 534, 34, 40, .08, GROTTO_AMBER, 29, .58, -1);
    grottoSpores(ctx, 56, 470, 90, 190, 16, TEAL, 1);
    grottoSpores(ctx, 376, 480, 70, 150, 11, AMBER, 2);
    // Foreground: dark lips of rock across the bottom corners, rimmed by the glow behind them.
    for (const [pts, light, lx2] of [[[[-20, 600], [-20, 532], [10, 536], [34, 554], [44, 600]], TEAL, 60], [[[440, 600], [440, 526], [420, 530], [400, 556], [394, 600]], AMBER, 360]]) {
      shape(ctx, pts, '#100a20', null); grottoEdge(ctx, pts, lx2, 500, 90, light, .7);
    }
    grade(ctx, 'rgba(150,120,220,.4)', 'rgba(40,30,90,.5)', 'rgba(22,10,46,.55)');
    grain(ctx, .08);
    if (framed) frame(ctx, '#7c64a8', '#b9a6e6');
  }

  // ---------- Level 4: Crystal Caves ----------
  // The old outlined crystals, still used by the rocks and the deeper levels.
  function crystal(ctx, x, y, w, h, tilt, palette) {
    const [light, mid, dark, line] = palette;
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    const tip = -h, shoulder = -h + w * .9;
    const body = [[-w / 2, 0], [-w / 2, shoulder], [0, tip], [w / 2, shoulder], [w / 2, 0]];
    ctx.beginPath(); ctx.moveTo(body[0][0], body[0][1]); for (const p of body.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath();
    ctx.fillStyle = mid; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, shoulder); ctx.lineTo(0, tip); ctx.lineTo(-w * .08, shoulder + 4); ctx.lineTo(-w * .08, 0); ctx.closePath(); ctx.fillStyle = light; ctx.fill();
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, shoulder); ctx.lineTo(w * .22, shoulder + 2); ctx.lineTo(w * .22, 0); ctx.closePath(); ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); ctx.moveTo(body[0][0], body[0][1]); for (const p of body.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath();
    ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * .32, -2); ctx.lineTo(-w * .32, shoulder + 3); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
  function crystalCluster(ctx, x, y, scale, palette, seed, spread = 1) {
    const r = rng(seed), parts = [[0, 1, 0], [-.55, .7, -.38], [.6, .62, .42], [-.95, .45, -.7], [.95, .42, .75]];
    for (const [dx, k, tilt] of parts.slice().reverse()) crystal(ctx, x + dx * 14 * scale * spread, y, 13 * scale * (.75 + r() * .3), 46 * scale * k * (.85 + r() * .3), tilt * .55, palette);
  }
  const BLUE = ['#b9f6ff', '#5fd0ec', '#2e93c4', '#123a5c'], VIOLET = ['#e3d5ff', '#a98cf5', '#6f52cc', '#2a1f5c'];

  // The new caves: deep blue rock, crystals that glow from within. The key light is a great cyan cluster hanging from
  // the upper left; its light breaks into soft cyan and violet shafts that cross the cave to the pool in the lower
  // right. Giant crystal pillars stand far back in the haze.
  const CRYSTAL_KEY = [44, 92];
  const CRYSTAL_CYAN = { hi: '#effdff', light: '#a6ecff', mid: '#55bdea', dark: '#22659f', deep: '#143e74', glow: '124,228,255' };
  const CRYSTAL_VIOLET = { hi: '#f6eeff', light: '#cdb6ff', mid: '#8c6ce8', dark: '#4c36a8', deep: '#2a1e6c', glow: '178,148,255' };
  const CRYSTAL_ICE = { hi: '#e2fbff', light: '#78d0f2', mid: '#3488c6', dark: '#1d5294', deep: '#12306c', glow: '110,214,255' };
  const CRYSTAL_AMETHYST = { hi: '#f2e8ff', light: '#b49cf4', mid: '#7356cc', dark: '#43309a', deep: '#261a66', glow: '170,136,255' };
  const CRYSTAL_FAR = { hi: '#4e7cba', light: '#3c68a8', mid: '#2f5894', dark: '#294c88', deep: '#24447c', glow: '120,190,255' };
  // One crystal: a six-sided prism with a faceted point, glowing from inside. (x, y) is its foot, angle 0 points up;
  // side is the face turned to the light (-1 left, 1 right); edges sets how strongly the facet edges catch light.
  function crystalPrism(ctx, x, y, w, h, angle, pal, side = -1, glow = .45, edges = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    const sh = -h + w * .85, tx = w * .04 * -side;
    const L = [-w / 2, sh], ML = [-w * .14, sh + w * .14], MR = [w * .18, sh + w * .12], R = [w / 2, sh], T = [tx, -h];
    const faces = [
      [[[-w / 2, 2], L, ML, [-w * .14, 2]], side < 0 ? [pal.mid, pal.light] : [pal.deep, pal.dark]],
      [[[-w * .14, 2], ML, MR, [w * .18, 2]], [pal.deep, pal.mid]],
      [[[w * .18, 2], MR, R, [w / 2, 2]], side > 0 ? [pal.mid, pal.light] : [pal.deep, pal.dark]]
    ];
    ctx.globalAlpha = .92;
    for (const [pts, [c0, c1]] of faces) poly(ctx, pts, lin(ctx, 0, 0, 0, sh, [[0, c0], [1, c1]]), null);
    poly(ctx, [L, T, ML], side < 0 ? pal.hi : pal.mid);
    poly(ctx, [ML, T, MR], pal.light);
    poly(ctx, [MR, T, R], side > 0 ? pal.hi : pal.mid);
    ctx.globalAlpha = 1;
    const body = [[-w / 2, 2], L, T, R, [w / 2, 2]];
    ctx.save(); poly(ctx, body, null); ctx.clip();
    // The core: a column of light up the middle, brightest just under the point.
    if (glow) {
      wash(ctx, lin(ctx, -w / 2, 0, w / 2, 0, [[0, rgba(pal.glow, 0)], [.45, rgba(pal.glow, glow)], [1, rgba(pal.glow, 0)]]), 'screen', 1, -w, -h, w * 2, h + 4);
      wash(ctx, rad(ctx, 0, sh, w * 1.2, [[0, rgba(pal.glow, glow)], [1, rgba(pal.glow, 0)]]), 'screen', 1, -w, -h, w * 2, h + 4);
    }
    // Reflections caught inside the stone: two faint slanted bands.
    if (h > 40 && edges > .5) for (const [t, k] of [[.42, .12], [.6, .07]]) poly(ctx, [[-w / 2, -h * t], [w / 2, -h * t - w * .5], [w / 2, -h * t - w * .5 - h * .05], [-w / 2, -h * t - h * .05]], `rgba(255,255,255,${k})`, null);
    const foot = Math.min(h * .45, 34);
    wash(ctx, lin(ctx, 0, 2, 0, -foot, [[0, 'rgba(8,8,36,.75)'], [1, 'rgba(8,8,36,0)']]), null, 1, -w, -foot, w * 2, foot + 4);
    ctx.restore();
    if (edges) {
      ctx.lineCap = 'round';
      for (const [a, b, al] of [[[-w * .14, -foot * .6], ML, .3], [ML, T, .5], [side < 0 ? L : R, T, .75], [[side < 0 ? -w / 2 : w / 2, -foot * .6], side < 0 ? L : R, .35]]) {
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = `rgba(255,255,255,${al * edges})`; ctx.lineWidth = Math.max(.6, w * .045); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // A cluster: crystals fanned out of one lump of host rock, the small ones behind, the big one in front, with soft
  // light around it. angle is where the cluster points (0 up), spread how far it fans.
  function crystalBloomCluster(ctx, x, y, size, angle, spread, pal, seed, side = -1, light = .3, n = 6, matrix = false) {
    const r = rng(seed), parts = [], ux = Math.sin(angle), uy = -Math.cos(angle), px = -uy, py = ux;
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2) / Math.ceil((n - 1) / 2), k = i === 0 ? 1 : .3 + r() * .45 * (1 - Math.abs(t) * .4);
      parts.push([angle + t * spread + (r() - .5) * .16, k, t * size * .3 + (r() - .5) * size * .1]);
    }
    if (light) { bloom(ctx, x + ux * size * .5, y + uy * size * .5, size * 2.8, pal.glow, light * .8); bloom(ctx, x + ux * size * .45, y + uy * size * .45, size * 1.1, pal.glow, light); }
    for (const [a, k, off] of parts.sort((p, q) => p[1] - q[1])) {
      const h = size * k * (.92 + r() * .16), w = Math.max(4, h * (.24 + r() * .08));
      crystalPrism(ctx, x + px * off - ux * size * .06, y + py * off - uy * size * .06, w, h, a, pal, side);
    }
    if (matrix) {
      const rock = blob(x - ux * size * .04, y - uy * size * .04 + 2, size * .3, size * .1, seed + 1, .2, 9);
      shape(ctx, rock, lin(ctx, 0, y - size * .1, 0, y + size * .1, [[0, '#1c2c5c'], [1, '#0c1434']]), null);
      rim(ctx, rock, rgba(pal.glow, .35), 0, -1.4);
    }
  }
  // A pale, blind cave fish, nosing round the pool.
  function crystalFish(ctx, x, y, s, flip) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
    const body = [[-11, 0], [-4, -5.4], [5, -4.6], [11, -1], [11.6, .6], [5, 4], [-4, 4.4]];
    soft(ctx, () => ctx.ellipse(0, 7, 13, 2.4, 0, 0, TAU), 'rgba(4,12,30,.4)', 3);
    poly(ctx, [[-10, 0], [-17, -5], [-15.6, 0], [-17, 5]], 'rgba(214,240,255,.75)', null);
    shape(ctx, body, lin(ctx, 0, -5, 0, 5, [[0, '#f4fbff'], [.6, '#cfe8f6'], [1, '#9cc4e0']]), 'rgba(70,120,170,.55)', .8);
    ctx.beginPath(); ctx.moveTo(-2, -4.6); ctx.quadraticCurveTo(1, -8.4, 4, -4.4); ctx.fillStyle = 'rgba(214,240,255,.8)'; ctx.fill();
    stroke(ctx, [[1, -2], [2.4, 0], [1, 2]], 'rgba(255,170,190,.7)', .9);
    dot(ctx, 7, -1.2, .9, 'rgba(60,90,140,.7)');
    stroke(ctx, [[-6, -2.6], [3, -3.4]], 'rgba(255,255,255,.8)', .8);
    ctx.restore();
  }
  function crystalSparkle(ctx, x, y, s, rgb) {
    bloom(ctx, x, y, s * 3, rgb, .4);
    sparkle(ctx, x, y, s, 'rgba(255,255,255,.95)');
    sparkle(ctx, x, y, s * .45, 'rgba(255,255,255,1)');
  }
  // A cliff of cleaved blue stone: straight cut edges, each cut face lit or shaded by where it faces the light.
  function crystalCliff(ctx, pts, side, lx, ly, rgb, seed) {
    soft(ctx, () => poly(ctx, pts.map(([x, y]) => [x - side * 6, y + 5]), null), 'rgba(4,6,26,.45)', 12);
    const [x0, , x1] = bounds(pts), outer = side < 0 ? x0 : x1, inner = side < 0 ? x1 : x0;
    poly(ctx, pts, lin(ctx, outer, 0, inner, 0, [[0, '#070b24'], [.55, '#0e1838'], [1, '#172a56']]), null);
    ctx.save(); poly(ctx, pts, null); ctx.clip();
    const r = rng(seed);
    // Cut faces along the inner edge.
    for (let i = 1; i < pts.length - 2; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], nx = by - ay, ny = -(bx - ax), len = Math.hypot(nx, ny) || 1, d = 12 + r() * 14;
      const face = [[ax, ay], [bx, by], [bx + side * d * .9, by + 4], [ax + side * d * 1.1, ay - 3]];
      const tl = Math.hypot(lx - ax, ly - ay), facing = ((lx - ax) * nx * -side + (ly - ay) * ny * -side) / (tl * len);
      poly(ctx, face, facing > .1 ? rgba(rgb, Math.min(.12, .04 + facing * .1) * Math.max(0, 1 - tl / 420)) : 'rgba(2,4,18,.22)', null);
    }
    wash(ctx, rad(ctx, lx, ly, 240, [[0, rgba(rgb, .34)], [.45, rgba(rgb, .1)], [1, rgba(rgb, 0)]]), 'screen');
    wash(ctx, lin(ctx, 0, 20, 0, 140, [[0, 'rgba(4,6,22,.7)'], [1, 'rgba(4,6,22,0)']]), null, 1, -10, 20, 440, 120);
    ctx.restore();
    // A thin catch of light along the cut edges that face the light, and only those.
    for (let i = 1; i < pts.length - 2; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], nx = by - ay, ny = -(bx - ax), len = Math.hypot(nx, ny) || 1;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, tl = Math.hypot(lx - mx, ly - my), facing = ((lx - mx) * nx * -side + (ly - my) * ny * -side) / (tl * len);
      if (facing > .15) stroke(ctx, [[ax, ay], [bx, by]], rgba(rgb, Math.min(.4, facing * .6) * Math.max(0, 1 - tl / 380)), 1.1);
    }
  }
  // A stand of tall crystals rising together from one base, each with a soft glow along its length.
  function crystalTower(ctx, parts, pal, side, halo = .22) {
    for (const [x, y, w, h, a] of parts) {
      const cx = x + Math.sin(a) * h * .5, cy = y - Math.cos(a) * h * .5;
      soft(ctx, () => ctx.ellipse(cx, cy, w * .9, h * .52, a, 0, TAU), rgba(pal.glow, halo), 16);
    }
    for (const [x, y, w, h, a] of parts) crystalPrism(ctx, x, y, w, h, a, pal, side, .5);
  }
  function paintCrystal(ctx, framed) {
    const [kx, ky] = CRYSTAL_KEY, CYAN = CRYSTAL_CYAN.glow, VIO = CRYSTAL_VIOLET.glow, AIR = '78,100,190';
    // Deep indigo cave air, lighter in the middle where the far hall gathers the glow.
    wash(ctx, lin(ctx, 0, 0, 0, 560, [[0, '#090c2c'], [.22, '#121c48'], [.55, '#1c3064'], [.78, '#223c74'], [1, '#0c1434']]));
    bloom(ctx, 230, 380, 300, '96,136,232', .3);
    // Giant crystal pillars far back in the haze.
    ctx.save(); ctx.globalAlpha = .55;
    crystalPrism(ctx, 150, 470, 66, 500, .14, CRYSTAL_FAR, 1, .1, .1);
    crystalPrism(ctx, 300, 470, 50, 360, -.12, CRYSTAL_FAR, -1, .1, .1);
    crystalPrism(ctx, 232, 466, 28, 170, .04, CRYSTAL_FAR, -1, .1, .1);
    ctx.restore();
    air(ctx, 0, 470, AIR, .34, .3);
    // The far floor, with clusters standing on it like a far forest.
    band(ctx, ridge(426, 5, 41, 50), 560, lin(ctx, 0, 416, 0, 470, [[0, '#26427a'], [1, '#182c5a']]), null);
    for (const [x, sz, pal] of [[110, 26, CRYSTAL_CYAN], [168, 16, CRYSTAL_VIOLET], [270, 20, CRYSTAL_CYAN], [318, 28, CRYSTAL_VIOLET], [214, 12, CRYSTAL_CYAN]]) crystalBloomCluster(ctx, x, 430, sz, 0, .6, pal, x, 1, .12, 4);
    air(ctx, 330, 470, AIR, .1, .34);
    // The key light: a great cluster hanging from the upper left; its light breaks into soft colored shafts.
    bloom(ctx, kx + 30, ky, 300, CYAN, .3);
    for (const [a, len, w, rgb, al] of [[.6, 640, 70, CYAN, .07], [.8, 600, 54, '196,170,255', .06], [.98, 560, 44, CYAN, .05], [.44, 600, 40, '255,196,232', .035], [1.16, 480, 32, '196,170,255', .04]]) shaft(ctx, kx + 22, ky - 4, a, len, 10, w, rgb, al);
    // Dust turning in the light near its source.
    const dr = rng(404);
    for (let i = 0; i < 9; i++) { const a = .45 + dr() * .7, d = 30 + Math.pow(dr(), 1.6) * 130, x = kx + 22 + Math.cos(a) * d, y = ky - 4 + Math.sin(a) * d; bloom(ctx, x, y, 4, '210,245,255', .45 * (1 - d / 180)); dot(ctx, x, y, .7, `rgba(235,250,255,${(.7 * (1 - d / 180)).toFixed(2)})`); }
    // A few far glints where the hall's crystals catch the light.
    for (const [x, y] of [[132, 300], [292, 214], [246, 370], [176, 402]]) { bloom(ctx, x, y, 10, '180,220,255', .22); dot(ctx, x, y, .8, 'rgba(220,240,255,.5)'); }
    // Near walls and the roof, dark cleaved stone.
    const left = [[-30, -10], [36, -10], [44, 40], [52, 96], [40, 150], [50, 204], [36, 258], [30, 306], [42, 356], [32, 414], [40, 470], [-30, 490]];
    const right = [[450, -10], [386, -10], [376, 44], [366, 98], [380, 150], [368, 206], [382, 258], [390, 304], [378, 356], [392, 412], [382, 470], [450, 490]];
    crystalCliff(ctx, left, -1, kx + 40, ky + 30, CYAN, 1);
    crystalCliff(ctx, right, 1, 380, 230, VIO, 2);
    const roof = [[-20, -20], [440, -20], [440, 28], [396, 38], [350, 30], [300, 42], [252, 32], [206, 40], [160, 30], [112, 42], [64, 32], [-20, 38]];
    soft(ctx, () => poly(ctx, roof.map(([x, y]) => [x, y + 7]), null), 'rgba(4,6,24,.6)', 10);
    poly(ctx, roof, lin(ctx, 0, 0, 0, 42, [[0, '#050822'], [1, '#101a44']]), null);
    for (const [x, w, h, c] of [[118, 12, 20, 1], [300, 10, 16, 0], [346, 16, 30, 1], [252, 8, 12, 0]]) {
      const pts = [[x - w / 2, 32], [x - w * .2, 32 + h * .55], [x + w * .04, 32 + h], [x + w * .2, 32 + h * .5], [x + w / 2, 32]];
      poly(ctx, pts, lin(ctx, x - w / 2, 0, x + w / 2, 0, [[0, '#1a2a5c'], [1, '#0b1434']]), null);
      if (c) crystalPrism(ctx, x + 1, 30 + h * .8, w * .55, h * .7, Math.PI + .05, x < 210 ? CRYSTAL_CYAN : CRYSTAL_VIOLET, 1, .4);
    }
    // A small cluster on each wall, then the key cluster hanging out of the upper left corner.
    crystalBloomCluster(ctx, 388, 222, 40, -.7, .6, CRYSTAL_VIOLET, 21, -1, .22, 5);
    crystalBloomCluster(ctx, 34, 214, 26, .7, .6, CRYSTAL_CYAN, 22, 1, .16, 4);
    crystalBloomCluster(ctx, 386, 96, 30, -2.5, .6, CRYSTAL_VIOLET, 23, -1, .16, 4);
    crystalBloomCluster(ctx, 8, 90, 66, 2.0, .7, CRYSTAL_CYAN, 24, 1, .32, 7);
    crystalBloomCluster(ctx, 52, 24, 34, 2.7, .6, CRYSTAL_CYAN, 25, 1, .16, 4);
    // The floor: dark cut stone, the fish pool, a slab for the launcher.
    const floor = [[-20, 456], [40, 450], [96, 456], [150, 449], [214, 454], [270, 448], [330, 455], [380, 449], [440, 454], [440, 600], [-20, 600]];
    soft(ctx, () => poly(ctx, floor.map(([x, y]) => [x, y - 8]), null), 'rgba(4,6,26,.4)', 12);
    poly(ctx, floor, lin(ctx, 0, 446, 0, 560, [[0, '#1a2c5e'], [.35, '#101c46'], [1, '#060a24']]), null);
    for (let i = 0; i < 8; i++) stroke(ctx, [floor[i], floor[i + 1]], i % 2 ? 'rgba(150,200,255,.28)' : 'rgba(150,200,255,.14)', 1);
    ctx.save(); poly(ctx, floor, null); ctx.clip();
    wash(ctx, rad(ctx, 70, 520, 200, [[0, rgba(CYAN, .3)], [1, rgba(CYAN, 0)]]), 'screen');
    wash(ctx, rad(ctx, 350, 520, 180, [[0, rgba(VIO, .26)], [1, rgba(VIO, 0)]]), 'screen');
    const fr = rng(55);
    for (let i = 0; i < 9; i++) { const x = 20 + fr() * 380, y = 466 + fr() * 76, w = 20 + fr() * 40; poly(ctx, [[x, y], [x + w, y - 3], [x + w * .8, y + 8], [x + w * .1, y + 10]], fr() < .5 ? 'rgba(120,170,255,.06)' : 'rgba(0,0,16,.2)', null); }
    ctx.restore();
    const pool = [[244, 520], [268, 508], [310, 505], [334, 514], [326, 532], [282, 541], [250, 534]];
    soft(ctx, () => smooth(ctx, pool.map(([x, y]) => [x, y - 1.5]), true), 'rgba(150,200,255,.4)', 4);
    shape(ctx, pool, lin(ctx, 0, 504, 0, 540, [[0, '#2a64a8'], [1, '#162c6c']]), null);
    clipTo(ctx, pool, () => {
      bloom(ctx, 330, 518, 52, VIO, .45); bloom(ctx, 276, 528, 44, CYAN, .3);
      for (const [x, y, w] of [[284, 513, 24], [270, 525, 14], [306, 530, 12]]) stroke(ctx, [[x - w / 2, y], [x + w / 2, y]], 'rgba(210,240,255,.35)', .9);
    });
    crystalFish(ctx, 288, 522, .78, false);
    bloom(ctx, 206, 500, 70, '140,190,255', .14);
    soft(ctx, () => ctx.ellipse(210, 520, 58, 8, 0, 0, TAU), 'rgba(2,4,20,.6)', 6);
    const slab = [[154, 512], [160, 500], [184, 492], [212, 489], [240, 492], [260, 500], [266, 511], [244, 520], [208, 523], [170, 520]];
    poly(ctx, slab, lin(ctx, 0, 488, 0, 524, [[0, '#3e5c98'], [.35, '#253f78'], [1, '#111e48']]), null);
    poly(ctx, [[160, 500], [184, 492], [212, 489], [240, 492], [260, 500], [236, 503], [206, 505], [176, 504]], lin(ctx, 150, 488, 270, 506, [[0, '#7aa6dc'], [1, '#4c74b4']]), null);
    stroke(ctx, [[160, 500], [184, 492], [212, 489], [240, 492], [260, 500]], 'rgba(220,240,255,.55)', 1);
    // The great stands of crystal rising in the bottom corners.
    crystalTower(ctx, [[2, 530, 26, 190, -.08], [88, 556, 16, 70, .44], [60, 558, 22, 120, .24], [28, 550, 36, 236, .08], [-8, 566, 20, 100, -.3]], CRYSTAL_ICE, -1, .16);
    crystalTower(ctx, [[424, 526, 26, 180, .08], [340, 560, 14, 60, -.46], [362, 560, 20, 110, -.24], [394, 550, 34, 220, -.08], [432, 566, 18, 90, .3]], CRYSTAL_AMETHYST, 1, .16);
    crystalBloomCluster(ctx, 128, 556, 22, .35, .6, CRYSTAL_VIOLET, 33, -1, .12, 3);
    for (const [x, y, w, h, a, pal] of [[106, 560, 9, 30, .7, CRYSTAL_ICE], [118, 562, 7, 20, .2, CRYSTAL_ICE], [314, 562, 9, 28, -.7, CRYSTAL_AMETHYST], [300, 564, 6, 16, -.2, CRYSTAL_AMETHYST]]) crystalPrism(ctx, x, y, w, h, a, pal, a < 0 ? 1 : -1, .4);
    // A dark lip of stone across the bottom hides where they root.
    const lip = [[-20, 600], [-20, 532], [30, 538], [80, 548], [116, 562], [120, 600]];
    const lipR = [[440, 600], [440, 528], [400, 540], [350, 552], [318, 566], [314, 600]];
    for (const pts of [lip, lipR]) { poly(ctx, pts, '#060a22', null); stroke(ctx, pts.slice(1, -1), 'rgba(150,200,255,.25)', 1); }
    // A hanging point of crystal in the top right corner, near and almost in silhouette.
    for (const [x, y, w, h, a] of [[430, 6, 24, 96, -2.75], [410, 0, 14, 54, -2.95]]) crystalPrism(ctx, x, y, w, h, a, { hi: '#3a4c8c', light: '#2a3a74', mid: '#1c285a', dark: '#141c46', deep: '#0c1232', glow: '120,140,255' }, -1, .15, .25);
    // A few glints on the brightest crystals.
    for (const [x, y, s, rgb] of [[84, 134, 4.4, CYAN], [62, 322, 3.6, CYAN], [362, 336, 3.4, VIO]]) crystalSparkle(ctx, x, y, s, rgb);
    grade(ctx, 'rgba(120,180,255,.3)', 'rgba(70,40,150,.5)', 'rgba(4,6,30,.6)');
    grain(ctx, .08);
    if (framed) frame(ctx, '#4b84b8', '#a8dcff');
  }

  // ---------- Shared bits for the deep levels ----------
  // A straight-edged shape for cut things: timber, basalt columns, dressed stone.
  function poly(ctx, pts, fill, line, width) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = width || 1.6; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  // A light source's glow, stepped in flat rings the way the grotto and crystal lights are.
  function halo(ctx, x, y, r, rgb, a = .1) {
    dot(ctx, x, y, r, `rgba(${rgb},${a})`); dot(ctx, x, y, r * .64, `rgba(${rgb},${a * 1.3})`); dot(ctx, x, y, r * .34, `rgba(${rgb},${a * 1.7})`);
  }
  // Fill in a straight-sided outline with nearly straight points, so a smooth path keeps its cut edges.
  function densify(pts, step, seed, jag = .8) {
    const r = rng(seed), out = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n + (k ? (r() - .5) * jag : 0), y0 + (y1 - y0) * k / n + (k ? (r() - .5) * jag : 0)]);
    }
    return out;
  }
  function bezierAt(p0, p1, p2, t) { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; }
  // Mirror a shape in still water and cut it into the thin slices a calm surface makes of it.
  function reflect(ctx, pts, waterY, fill, waterFill, seed) {
    const flipped = pts.map(([x, y]) => [x, waterY * 2 - y]);
    clipTo(ctx, [[-20, waterY], [440, waterY], [440, 600], [-20, 600]], () => clipTo(ctx, flipped, () => {
      ctx.fillStyle = fill; ctx.fillRect(-20, waterY, 460, 260);
      const r = rng(seed);
      for (let y = waterY + 4; y < waterY + 220; y += 2.6 + r() * 3 + (y - waterY) * .05) {
        const x = -30 + r() * 420, w = 30 + r() * 130;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.strokeStyle = waterFill; ctx.lineWidth = .7 + r() * .9 + (y - waterY) * .012; ctx.lineCap = 'round'; ctx.stroke();
      }
    }));
  }
  // Where a line crosses a shape's lower edge, read off points listed left to right.
  function edgeAt(pts, x) {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if ((x - x0) * (x - x1) <= 0 && x0 !== x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return pts[pts.length - 1][1];
  }

  // ---------- Level 5: Glowworm Lake ----------
  // A still lake under a roof strung with glowworm lines like a sky full of stars. The roof's teal light is the key,
  // gathering into a glow where the lake runs off into the far dark; the water holds all of it softly upside down.
  // A warm lantern on the mooring post is the one warm note.
  const LAKE_WATER = 336, LAKE_GLOW = '120,255,214', LAKE_WARM = '255,190,112';
  // A glowworm's fishing line: a silk thread strung with sticky beads, the lowest one glowing.
  function lakeSilk(ctx, x, y, len, seed, a = 1) {
    const r = rng(seed), sway = (r() - .5) * 5, p0 = [x, y], p1 = [x + sway, y + len * .5], p2 = [x + sway * .3, y + len];
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
    ctx.strokeStyle = `rgba(160,240,226,${(.2 * a).toFixed(3)})`; ctx.lineWidth = .55; ctx.lineCap = 'round'; ctx.stroke();
    const beads = Math.max(1, Math.round(len / 12));
    for (let i = 1; i <= beads; i++) {
      const [bx, by] = bezierAt(p0, p1, p2, Math.min(1, i / beads + (r() - .5) * .06));
      if (i === beads) { bloom(ctx, bx, by, 6, LAKE_GLOW, .5 * a); dot(ctx, bx, by, 1.15, `rgba(214,255,240,${(.95 * a).toFixed(3)})`); }
      else dot(ctx, bx, by, .45 + r() * .4, `rgba(190,255,236,${(.5 * a).toFixed(3)})`);
    }
  }
  // A glowworm herself: a soft grub on a ledge with a lantern for a tail, letting down her line.
  function lakeGlowworm(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    bloom(ctx, -14, -2.4, 18, LAKE_GLOW, .5);
    const segs = [[-14, -2.4, 4.4], [-9.4, -3.4, 4.8], [-4.6, -4, 5.1], [.4, -4.2, 5.3]];
    for (const [sx, sy, sr] of segs) dot(ctx, sx, sy, sr + .9, 'rgba(40,96,92,.8)');
    segs.forEach(([sx, sy, sr], i) => {
      dot(ctx, sx, sy, sr, i ? '#ddf1ea' : '#c4ffe8');
      ctx.beginPath(); ctx.arc(sx + .8, sy + .9, sr - .4, -.2, 1.9); ctx.strokeStyle = i ? 'rgba(150,190,184,.8)' : 'rgba(110,230,196,.8)'; ctx.lineWidth = 1.3; ctx.stroke();
    });
    dot(ctx, -14.6, -3.6, 1.2, '#ffffff');
    ctx.beginPath(); ctx.ellipse(6.4, -5.6, 6.2, 5.6, 0, 0, TAU); ctx.fillStyle = '#eaf7f2'; ctx.fill(); ctx.strokeStyle = 'rgba(40,96,92,.8)'; ctx.lineWidth = 1.1; ctx.stroke();
    stroke(ctx, [[8, -10.8], [9.5, -14.2]], 'rgba(40,96,92,.9)', .9); stroke(ctx, [[5, -11], [5.4, -14.6]], 'rgba(40,96,92,.9)', .9);
    dot(ctx, 9.6, -14.4, .9, '#2b625f'); dot(ctx, 5.4, -14.8, .9, '#2b625f');
    dot(ctx, 5, -6.4, 1.1, '#1d3a3a'); dot(ctx, 9.4, -6.2, 1.1, '#1d3a3a');
    ctx.beginPath(); ctx.arc(7.3, -4.6, 1.8, .4, Math.PI - .4); ctx.strokeStyle = '#1d3a3a'; ctx.lineWidth = .8; ctx.stroke();
    dot(ctx, 3.4, -4, 1.2, 'rgba(255,160,180,.5)'); dot(ctx, 11, -3.8, 1.2, 'rgba(255,160,180,.5)');
    ctx.restore();
  }
  // A lily pad lying flat on the water: lit along its far rim, its veins faint, a soft shadow on the water.
  function lakePad(ctx, x, y, rx, notch, seed) {
    const ry = rx * .38, outline = () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.ellipse(x, y, rx, ry, 0, notch + .3, notch - .3 + TAU); ctx.closePath(); };
    soft(ctx, () => ctx.ellipse(x + 1, y + 2, rx * 1.02, ry * 1.05, 0, 0, TAU), 'rgba(2,14,22,.5)', 3);
    outline(); ctx.fillStyle = lin(ctx, 0, y - ry, 0, y + ry, [[0, '#5fae8c'], [.5, '#357e6c'], [1, '#225a52']]); ctx.fill();
    const r = rng(seed);
    ctx.save(); outline(); ctx.clip();
    for (let i = 0; i < 5; i++) { const a = notch + .8 + i * 1.05 + r() * .2; stroke(ctx, [[x, y], [x + Math.cos(a) * rx, y + Math.sin(a) * ry]], 'rgba(170,240,205,.22)', .8); }
    ctx.beginPath(); ctx.ellipse(x, y + ry * .3, rx, ry, 0, 0, TAU); ctx.rect(x - rx * 2, y - ry * 3, rx * 4, ry * 6); ctx.fillStyle = 'rgba(190,255,225,.28)'; ctx.fill('evenodd');
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, Math.PI + .2, TAU - .2); ctx.strokeStyle = 'rgba(200,255,230,.35)'; ctx.lineWidth = .9; ctx.stroke();
  }
  function lakeLily(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    bloom(ctx, 0, -3, 14, '230,210,255', .25);
    for (const [a, l, c] of [[-2.6, 7, '#cdb8f0'], [-.55, 7, '#cdb8f0'], [-2.1, 8.4, '#e8defd'], [-1.05, 8.4, '#e8defd'], [-1.57, 9, '#f8f4ff']]) {
      ctx.save(); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.moveTo(-2.6, 0); ctx.quadraticCurveTo(-3, -l * .6, 0, -l); ctx.quadraticCurveTo(3, -l * .6, 2.6, 0); ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = 'rgba(122,98,168,.6)'; ctx.lineWidth = .8; ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(0, .5, 3.4, 1.6, 0, 0, TAU); ctx.fillStyle = '#ffd36b'; ctx.fill();
    ctx.restore();
  }
  // An axolotl surfacing at the edge of the pads, chin on her hands.
  function lakeAxolotl(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const ink = 'rgba(160,64,108,.75)';
    for (const side of [-1, 1]) {
      [[-.85, 9.5], [-.38, 10.5], [.08, 8.6]].forEach(([a, len], i) => {
        ctx.save(); ctx.translate(side * 11, -14 + i * 3.6); ctx.rotate(side > 0 ? a : Math.PI - a);
        ctx.beginPath(); ctx.ellipse(len * .5, 0, len * .55, 2.5, 0, 0, TAU); ctx.fillStyle = lin(ctx, 0, 0, len, 0, [[0, '#e86f9a'], [1, '#ffa6c4']]); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = .9; ctx.stroke();
        for (let k = 1; k < 4; k++) { const fx = len * (.18 + k * .2); stroke(ctx, [[fx - 1.2, -2.6], [fx + .6, 0], [fx - 1.2, 2.6]], 'rgba(255,224,236,.8)', .7); }
        ctx.restore();
      });
    }
    const head = [[-14.4, -2], [-13.6, -10.4], [-7, -16.6], [0, -17.8], [7, -16.6], [13.6, -10.4], [14.4, -2], [0, .6]];
    shape(ctx, head, lin(ctx, 0, -18, 0, 1, [[0, '#ffd8e4'], [1, '#eaa0ba']]), ink, 1.1);
    ctx.beginPath(); ctx.arc(-6, -12.4, 4.2, 3.5, 4.5); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
    for (const ex of [-5.8, 5.8]) { dot(ctx, ex, -9.4, 1.9, '#331427'); dot(ctx, ex - .6, -10.1, .65, '#ffffff'); }
    ctx.beginPath(); ctx.moveTo(-4.6, -5.4); ctx.quadraticCurveTo(0, -2.2, 4.6, -5.4); ctx.strokeStyle = '#331427'; ctx.lineWidth = 1; ctx.stroke();
    dot(ctx, -9.6, -6, 2, 'rgba(240,110,150,.45)'); dot(ctx, 9.6, -6, 2, 'rgba(240,110,150,.45)');
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(side * 7.8, .6, 3.8, 2.4, side * .2, 0, TAU); ctx.fillStyle = '#f6bcd0'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = .9; ctx.stroke();
      for (const k of [-1.2, 0, 1.2]) dot(ctx, side * 7.8 + k * 1.3, -1.1, .5, ink);
    }
    ctx.restore();
  }
  // A little rowboat, seen a touch from above so its seat and the far rim show; a jar of glowworms on the stern seat.
  function lakeBoat(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const line = 'rgba(58,32,20,.55)';
    soft(ctx, () => ctx.ellipse(2, 5, 50, 6, 0, 0, TAU), 'rgba(2,10,20,.55)', 4);
    ctx.beginPath(); ctx.moveTo(-46, -15); ctx.quadraticCurveTo(-4, -24, 50, -24); ctx.quadraticCurveTo(0, -6, -46, -15); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -24, 0, -10, [[0, '#3c2416'], [1, '#5e3a24']]); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-44, -16.4); ctx.quadraticCurveTo(-4, -24.4, 47, -23.4); ctx.strokeStyle = 'rgba(214,170,120,.8)'; ctx.lineWidth = 1.3; ctx.stroke();
    poly(ctx, [[-4, -21.6], [3, -22], [5, -11], [-2, -10.6]], lin(ctx, 0, -22, 0, -11, [[0, '#c9966a'], [1, '#8a5c3a']]), null);
    poly(ctx, [[-36, -18.6], [-26, -19.6], [-24, -13], [-34, -12.4]], lin(ctx, 0, -20, 0, -12, [[0, '#c9966a'], [1, '#8a5c3a']]), null);
    // The jar of glowworms: someone's night light.
    bloom(ctx, -30, -24, 26, LAKE_GLOW, .45);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-35.5, -31, 11, 14, 3.5) : ctx.rect(-35.5, -31, 11, 14); ctx.fillStyle = 'rgba(150,240,225,.32)'; ctx.fill(); ctx.strokeStyle = 'rgba(190,240,232,.8)'; ctx.lineWidth = .9; ctx.stroke();
    for (const [gx, gy] of [[-31.6, -21], [-27.4, -24], [-30.4, -27], [-27.2, -19.6]]) { bloom(ctx, gx, gy, 3.4, LAKE_GLOW, .6); dot(ctx, gx, gy, 1, '#c8ffec'); }
    stroke(ctx, [[-33.2, -28.6], [-33.2, -21]], 'rgba(255,255,255,.55)', .9);
    poly(ctx, [[-35, -34], [-25, -34], [-25.6, -31], [-34.4, -31]], '#b88a58', null);
    // The near side of the hull, planked, darker toward the water, lit along the gunwale by the jar.
    const hull = () => { ctx.beginPath(); ctx.moveTo(-46, -15); ctx.quadraticCurveTo(0, -6, 50, -24); ctx.quadraticCurveTo(44, 2, 18, 6); ctx.lineTo(-28, 6); ctx.quadraticCurveTo(-43, 3, -46, -15); ctx.closePath(); };
    hull(); ctx.fillStyle = lin(ctx, 0, -20, 0, 6, [[0, '#a06c44'], [.55, '#7a4e30'], [1, '#4a2c1a']]); ctx.fill();
    ctx.save(); hull(); ctx.clip();
    for (const k of [6, 11]) { ctx.beginPath(); ctx.moveTo(-46, -15 + k); ctx.quadraticCurveTo(0, -6 + k, 50, -24 + k); ctx.strokeStyle = 'rgba(40,20,10,.35)'; ctx.lineWidth = 1; ctx.stroke(); }
    wash(ctx, rad(ctx, -30, -14, 40, [[0, rgba(LAKE_GLOW, .25)], [1, rgba(LAKE_GLOW, 0)]]), 'screen', 1, -60, -30, 120, 40);
    ctx.restore();
    hull(); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-43, -13); ctx.quadraticCurveTo(0, -4.4, 46, -21.4); ctx.strokeStyle = 'rgba(232,190,140,.85)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();
    for (const bx of [-30, 4, 32]) dot(ctx, bx, bx > 20 ? -10.8 : bx > 0 ? -6.6 : -8.2, .9, 'rgba(40,20,10,.6)');
    ctx.beginPath(); ctx.arc(46, -15, 2.4, 0, TAU); ctx.strokeStyle = 'rgba(170,166,160,.8)'; ctx.lineWidth = 1.1; ctx.stroke();
    // An oar shipped over the side, its blade resting on the water.
    poly(ctx, [[-14, -28], [-11.6, -29.6], [34, -1], [31.6, .6]], lin(ctx, -14, -28, 34, 0, [[0, '#d0a474'], [1, '#9a7048']]), null);
    ctx.beginPath(); ctx.ellipse(38, 2.6, 7.6, 2.8, .45, 0, TAU); ctx.fillStyle = '#b88a5c'; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = .8; ctx.stroke();
    ctx.restore();
  }
  // A cushion of moss on stone, lit along its top by the far glow.
  function lakeMoss(ctx, x, y, w, seed) {
    const r = rng(seed), n = Math.max(5, Math.round(w / 2.4));
    for (let i = 0; i < n; i++) { const px = x + (r() - .5) * w, py = y + (r() - .5) * w * .22, k = 1 - Math.abs(px - x) / w; ctx.beginPath(); ctx.ellipse(px, py, 2.4 + r() * 2.4 * k, 1.6 + r() * 1.8 * k, 0, 0, TAU); ctx.fillStyle = 'rgba(52,104,80,.75)'; ctx.fill(); }
    for (let i = 0; i < n; i++) { const px = x + (r() - .5) * w * .8, py = y - 1.4 + (r() - .5) * w * .16; ctx.beginPath(); ctx.ellipse(px, py, 1.4 + r() * 1.6, .9 + r(), 0, 0, TAU); ctx.fillStyle = 'rgba(120,196,146,.42)'; ctx.fill(); }
  }
  // Rings spreading where a drip has fallen.
  function lakeRings(ctx, x, y, k, a = 1) {
    for (const [w, al] of [[7, .4], [14, .22], [22, .1]]) { ctx.beginPath(); ctx.ellipse(x, y, w * k, w * k * .26, 0, 0, TAU); ctx.strokeStyle = `rgba(190,250,240,${(al * a).toFixed(3)})`; ctx.lineWidth = .9; ctx.stroke(); }
  }
  // Mirror a shape in the water, fading with depth and cut into slices by the faint ripples.
  function lakeMirror(ctx, pts, fill, alpha, seed) {
    const W = LAKE_WATER, flipped = pts.map(([x, y]) => [x, W + (W - y) * .9]);
    ctx.save(); ctx.beginPath(); ctx.rect(-20, W, 460, 300); ctx.clip();
    ctx.globalAlpha = alpha; shape(ctx, flipped, fill, null); ctx.globalAlpha = 1;
    ctx.restore();
    void seed;
  }
  function paintLake(ctx, framed) {
    const W = LAKE_WATER, G = LAKE_GLOW, AIR = '40,110,120';
    // The cave air: near-black teal under the roof, opening to a misty teal glow over the far water.
    wash(ctx, lin(ctx, 0, 0, 0, W, [[0, '#07131e'], [.35, '#0d2433'], [.75, '#164050'], [1, '#2a6a70']]));
    bloom(ctx, 236, W - 10, 260, '90,210,190', .32);
    // Far back: the end wall of the cavern, and an arch where the lake runs on into a glowing tunnel. That glow is
    // the brightest thing in the cave air; everything else is lit by the roof.
    // The end wall: one dark face with a ragged opening where the lake runs on into a tunnel that bends away right.
    const hole = [[186, W + 2], [188, 306], [192, 282], [200, 260], [213, 244], [229, 237], [246, 239], [261, 249], [273, 266], [281, 290], [285, W + 2]];
    const inside = () => { ctx.beginPath(); smooth(ctx, hole, true); };
    inside(); ctx.fillStyle = lin(ctx, 0, 236, 0, W, [[0, '#2c7a74'], [.5, '#56b6a2'], [1, '#9cecd4']]); ctx.fill();
    ctx.save(); inside(); ctx.clip();
    bloom(ctx, 226, W - 4, 74, '210,255,238', .6);
    // The tunnel's far wall turning across from the right, and the reveal: the wall's own thickness in shadow.
    const bend = [[300, 236], [262, 250], [250, 272], [254, 298], [246, 318], [252, W + 4], [300, W + 4]];
    shape(ctx, bend, lin(ctx, 244, 0, 290, 0, [[0, '#327e76'], [1, '#1c5258']]), null);
    rim(ctx, bend, 'rgba(200,255,238,.22)', -1.2, 0);
    ctx.beginPath(); ctx.rect(150, 200, 180, 160); smooth(ctx, hole.map(([x, y]) => [x + 6, y + 7]), true);
    ctx.fillStyle = lin(ctx, 0, 236, 0, W, [[0, 'rgba(12,40,48,.8)'], [.7, 'rgba(12,40,48,.35)'], [1, 'rgba(12,40,48,0)']]); ctx.fill('evenodd');
    ctx.restore();
    const wall = () => { ctx.beginPath(); ctx.rect(-20, 96, 460, W + 2 - 96); smooth(ctx, hole, true); };
    wall(); ctx.fillStyle = lin(ctx, 0, 96, 0, W, [[0, 'rgba(10,30,42,0)'], [.14, '#0b202c'], [.6, '#123440'], [1, '#1c4c54']]); ctx.fill('evenodd');
    ctx.save(); wall(); ctx.clip('evenodd');
    wash(ctx, rad(ctx, 236, 330, 120, [[0, 'rgba(150,255,226,.22)'], [.45, 'rgba(150,255,226,.06)'], [1, 'rgba(150,255,226,0)']]), 'screen');
    const ws = rng(17);
    for (let i = 0; i < 7; i++) {
      const x = 30 + ws() * 360; if (Math.abs(x - 236) < 74) continue; const y = 150 + ws() * 90, len = 50 + ws() * 70;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (ws() - .5) * 8, y + len * .5, x + (ws() - .5) * 4, y + len);
      ctx.strokeStyle = lin(ctx, 0, y, 0, y + len, [[0, 'rgba(4,14,22,0)'], [.5, 'rgba(4,14,22,.18)'], [1, 'rgba(4,14,22,0)']]); ctx.lineWidth = 5 + ws() * 6; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.restore();
    air(ctx, 80, W, AIR, 0, .3);
    // Curtains of flowstone hanging from the roof between us and the end wall, threaded with far glowworms.
    const far = rng(303);
    for (const [x0, x1, depth, seed] of [[-20, 150, 190, 1], [126, 316, 110, 2], [270, 440, 200, 3]]) {
      const r = rng(seed), pts = [[x0, -10]];
      for (let i = 0; i <= 9; i++) { const t = i / 9; pts.push([x0 + (x1 - x0) * t, 20 + depth * Math.sin(t * Math.PI) * (.55 + r() * .45)]); }
      pts.push([x1, -10]);
      shape(ctx, pts, lin(ctx, 0, 0, 0, depth + 30, [[0, '#08141e'], [.7, '#10303c'], [1, '#1a4450']]), null);
      for (let i = 2; i < 9; i += 2) { const p = pts[i]; stroke(ctx, [[p[0], 30], [p[0] + 2, (30 + p[1]) / 2], [p[0], p[1] - 8]], 'rgba(4,12,20,.35)', 1.6); }
      for (let i = 0; i < 26; i++) { const x = x0 + 10 + far() * (x1 - x0 - 20), y = 24 + far() * depth * .7; if (Math.abs(x - 210) > 70 || y < 80) dot(ctx, x, y, .5 + far() * .5, `rgba(150,255,220,${(.2 + far() * .25).toFixed(2)})`); }
    }
    air(ctx, 60, W, AIR, .04, .26);
    // The far shore, low and quiet, with stalagmites standing in the shallows.
    const shore = [[-20, W + 1], [-20, W - 18], [26, W - 22], [66, W - 10], [112, W - 6], [170, W - 3], [200, W - 1], [272, W - 1], [310, W - 9], [356, W - 20], [440, W - 16], [440, W + 1]];
    shape(ctx, shore, lin(ctx, 0, W - 22, 0, W, [[0, '#1a4652'], [1, '#26605e']]), null);
    rim(ctx, shore, 'rgba(160,255,230,.22)', 0, -1.2);
    const stacks = [];
    for (const [x, w, h] of [[34, 14, 26], [52, 9, 14], [342, 10, 16], [362, 16, 30]]) {
      const b = W - 10, st = [[x - w / 2, b], [x - w * .42, b - h * .5], [x - w * .2, b - h], [x + w * .14, b - h * .96], [x + w * .4, b - h * .45], [x + w / 2, b]];
      shape(ctx, st, lin(ctx, 0, b - h, 0, b, [[0, '#18404c'], [1, '#22585c']]), null); rim(ctx, st, 'rgba(160,255,230,.24)', x < 210 ? 1 : -1, -.6); stacks.push(st);
    }
    air(ctx, W - 50, W + 2, '120,230,210', 0, .26);
    // The lake. It holds the glow of the far water and the dark of the roof, darkening toward us.
    wash(ctx, lin(ctx, 0, W, 0, 560, [[0, '#3a8a86'], [.08, '#25646c'], [.4, '#123848'], [1, '#081a28']]), null, 1, -10, W, 440, 600 - W);
    lakeMirror(ctx, shore, '#1a4a56', .8, 1);
    for (const st of stacks) lakeMirror(ctx, st, '#1a4a56', .6, 2);
    // The far glow lying on the water as a long soft column, broken into ripples.
    ctx.save(); ctx.beginPath(); ctx.rect(-20, W, 460, 300); ctx.clip();
    wash(ctx, lin(ctx, 180, 0, 292, 0, [[0, rgba(G, 0)], [.5, rgba(G, .3)], [1, rgba(G, 0)]]), 'screen', 1, 170, W, 132, 200);
    const rw = rng(606);
    for (let i = 0; i < 40; i++) {
      const t = Math.pow(rw(), 1.7), y = W + 3 + t * 200, x = 236 + (rw() - .5) * (40 + t * 120), w = (6 + rw() * 24) * (1 - t * .5);
      stroke(ctx, [[x - w / 2, y], [x + w / 2, y]], rgba(G, (.3 - t * .24) * (.5 + rw() * .5)), .9 + t);
    }
    for (let i = 0; i < 22; i++) { const y = W + 6 + Math.pow(rw(), 1.4) * 190, x = rw() * 420, w = 30 + rw() * 90; stroke(ctx, [[x, y], [x + w, y]], 'rgba(150,230,220,.06)', 1); }
    ctx.restore();
    // The roof, thick with glowworms, and their lines let down in colonies: long by the walls, short in the middle.
    const roof = [[-10, -10], [430, -10], [430, 36], [392, 46], [350, 36], [300, 48], [256, 38], [214, 44], [168, 36], [120, 48], [70, 40], [30, 50], [-10, 44]];
    soft(ctx, () => smooth(ctx, roof.map(([x, y]) => [x, y + 8]), true), 'rgba(2,8,14,.55)', 10);
    shape(ctx, roof, lin(ctx, 0, 0, 0, 50, [[0, '#04090f'], [1, '#0c1c26']]), null);
    const roofAt = x => edgeAt(roof.slice(2).reverse(), x);
    const rs = rng(505);
    for (let i = 0; i < 150; i++) {
      const x = 4 + rs() * 412, y = 4 + rs() * 42;
      if (y < roofAt(x) - 2) { const s = .4 + rs() * .8; if (rs() < .25) bloom(ctx, x, y, s * 6, G, .3); dot(ctx, x, y, s, `rgba(190,255,232,${(.45 + rs() * .5).toFixed(2)})`); }
    }
    bloom(ctx, 120, 30, 160, G, .14); bloom(ctx, 320, 34, 140, G, .12);
    const lines = [[40, 150], [48, 104], [56, 176], [64, 120], [72, 80], [86, 54], [98, 72], [112, 36], [140, 24], [148, 40], [156, 20], [164, 30], [196, 14], [214, 20], [232, 12],
      [262, 24], [272, 36], [280, 18], [292, 30], [318, 50], [330, 88], [338, 58], [348, 124], [358, 92], [368, 160], [378, 64], [386, 130]];
    for (const [x, len] of lines) { const top = roofAt(x) - 1; lakeSilk(ctx, x, top, len, x); }
    // Side walls drop into the lake and show again upside down in it.
    const left = [[-20, 30], [36, 42], [52, 92], [40, 138], [60, 196], [46, 252], [32, 292], [52, 318], [44, W + 1], [-20, W + 1]];
    const right = [[440, 30], [384, 44], [368, 100], [386, 150], [364, 210], [380, 266], [392, 304], [372, W + 1], [440, W + 1]];
    for (const wall of [left, right]) {
      lakeMirror(ctx, wall, '#061420', .7, 3);
      soft(ctx, () => smooth(ctx, wall.map(([x, y]) => [x + (wall === left ? 6 : -6), y + 4]), true), 'rgba(2,8,16,.5)', 10);
      shape(ctx, wall, lin(ctx, wall === left ? -20 : 440, 0, wall === left ? 60 : 360, 0, [[0, '#050d16'], [1, '#0f2430']]), null);
      clipTo(ctx, wall, () => wash(ctx, lin(ctx, 0, 40, 0, 200, [[0, 'rgba(120,255,214,.1)'], [1, 'rgba(120,255,214,0)']]), 'screen'));
      rim(ctx, wall, 'rgba(130,240,214,.22)', wall === left ? 1.6 : -1.6, -.4);
    }
    // Glowworms all along the walls, and long lines hanging off them.
    for (const [x, y] of [[14, 80], [24, 120], [12, 200], [30, 236], [10, 300], [404, 90], [396, 180], [410, 240], [400, 300], [20, 330], [406, 130], [26, 160], [414, 210]]) { bloom(ctx, x, y, 7, G, .4); dot(ctx, x, y, .9, '#c8ffec'); }
    // A ledge on the left wall where a glowworm sits fishing.
    const ledge = [[22, 152], [66, 146], [80, 151], [70, 160], [26, 164]];
    soft(ctx, () => ctx.ellipse(52, 164, 30, 5, 0, 0, TAU), 'rgba(2,8,16,.6)', 5);
    shape(ctx, ledge, lin(ctx, 0, 146, 0, 164, [[0, '#24505a'], [1, '#0c1e28']]), null);
    rim(ctx, ledge, 'rgba(160,255,230,.4)', 0, -1.4);
    lakeGlowworm(ctx, 52, 149, .9);
    lakeSilk(ctx, 62, 146, 110, 77);
    // Drips from the roof ring the water by the walls.
    for (const [x, y, k] of [[74, W + 26, .9], [352, W + 50, .8], [96, W + 92, .7]]) { lakeRings(ctx, x, y, k); dot(ctx, x, y - 7 * k, 1, 'rgba(210,255,250,.7)'); }
    // Glowworm light mirrored on the water under the walls: soft, short dashes, gathered at the edges.
    const rm = rng(707);
    for (let i = 0; i < 30; i++) {
      const side = i % 2, x = side ? 330 + rm() * 80 : 12 + rm() * 80, y = W + 6 + Math.pow(rm(), 1.5) * 110, w = 2 + rm() * 6;
      stroke(ctx, [[x - w / 2, y], [x + w / 2, y]], rgba(G, .14 + rm() * .22), 1);
    }
    // The near shore: a low shelf of stone out in the water with the launcher on it, and a lower slab stepping down
    // into the lake at its right end. The tunnel glow is behind it, so the tops catch the light and the faces are dark.
    const top = [[108, 494], [114, 484], [130, 474], [156, 467], [188, 462], [222, 460], [250, 462], [272, 468], [286, 478], [290, 488], [282, 496], [256, 502], [222, 505], [184, 505], [150, 503], [124, 500]];
    const face = [[108, 494], [106, 513], [130, 523], [176, 527], [222, 527], [262, 522], [286, 512], [290, 488]];
    const top2 = [[266, 500], [274, 491], [292, 486], [312, 486], [326, 492], [329, 500], [318, 506], [294, 509], [276, 507]];
    const face2 = [[266, 500], [266, 511], [290, 517], [316, 515], [329, 506], [329, 500]];
    ctx.save(); ctx.beginPath(); ctx.rect(-20, 512, 460, 80); ctx.clip(); ctx.globalAlpha = .5;
    shape(ctx, face.map(([x, y]) => [x, 1046 - y]), '#06141e', null); shape(ctx, face2.map(([x, y]) => [x, 1028 - y]), '#06141e', null);
    ctx.globalAlpha = 1; ctx.restore();
    soft(ctx, () => ctx.ellipse(210, 523, 116, 8, 0, 0, TAU), 'rgba(140,240,220,.16)', 8);
    for (const [f, t, y0, y1] of [[face2, top2, 486, 516], [face, top, 460, 527]]) {
      shape(ctx, f, lin(ctx, 0, y0 + 14, 0, y1, [[0, '#1d4250'], [1, '#0a1c28']]), null);
      clipTo(ctx, f, () => {
        for (const k of [.45, .75]) stroke(ctx, f.slice(1, -1).map(([x, y]) => [x, y0 + (y - y0) * k + 4]), 'rgba(140,230,220,.07)', 1.4);
        wash(ctx, lin(ctx, 0, y1 - 6, 0, y1, [[0, 'rgba(140,240,220,0)'], [1, 'rgba(140,240,220,.22)']]), 'screen', 1, 90, y1 - 8, 260, 10);
      });
      shape(ctx, t, lin(ctx, 0, y0, 0, y0 + 46, [[0, '#4e8c88'], [.5, '#33686c'], [1, '#22484f']]), null);
      clipTo(ctx, t, () => soft(ctx, () => ctx.ellipse(220, y0 + 10, 70, 10, 0, 0, TAU), 'rgba(170,255,236,.14)', 10));
      rim(ctx, t, 'rgba(190,255,236,.34)', 0, -1.4);
    }
    // Cracks and moss on the shelf, kept to its ends so the middle stays a quiet stage for the launcher.
    clipTo(ctx, top, () => { stroke(ctx, [[150, 480], [162, 487], [158, 497]], 'rgba(10,30,36,.16)', 1.4); stroke(ctx, [[151, 481.4], [163, 488.4], [159, 498]], 'rgba(170,240,226,.1)', .8); });
    for (const [pts, cx, cy, rx] of [
      [[[134, 476], [138, 462], [150, 454], [166, 452], [178, 458], [182, 470], [170, 476]], 158, 476, 26],
      [[[244, 470], [248, 458], [262, 450], [276, 452], [286, 462], [288, 476], [266, 478]], 266, 476, 24],
      [[[278, 470], [284, 462], [296, 460], [302, 468], [298, 476], [286, 478]], 292, 477, 12]]) {
      soft(ctx, () => ctx.ellipse(cx, cy, rx, 4, 0, 0, TAU), 'rgba(6,20,28,.5)', 4);
      shape(ctx, pts, lin(ctx, 0, cy - 26, 0, cy, [[0, '#4a8682'], [.5, '#2c5c62'], [1, '#183a46']]), null);
      rim(ctx, pts, 'rgba(190,255,236,.3)', 0, -1.4);
    }
    lakeMoss(ctx, 150, 457, 20, 11); lakeMoss(ctx, 122, 482, 18, 14); lakeMoss(ctx, 268, 455, 18, 12); lakeMoss(ctx, 306, 489, 16, 13);
    for (const [x, y, w] of [[96, 520, 5], [104, 524, 3.4], [336, 512, 4]]) { ctx.beginPath(); ctx.ellipse(x, y, w, w * .55, 0, 0, TAU); ctx.fillStyle = lin(ctx, 0, y - w, 0, y + w, [[0, '#3e7678'], [1, '#10283a']]); ctx.fill(); }
    // Broken light along the waterline.
    const wl = rng(808);
    for (let i = 0; i < 10; i++) { const x = 112 + wl() * 210, y = 524 + wl() * 6, w = 4 + wl() * 10; stroke(ctx, [[x, y], [x + w, y]], 'rgba(170,255,240,.18)', .9); }
    // The mooring post with its lantern, and the rowboat tied up to it.
    ctx.save(); ctx.beginPath(); ctx.rect(-20, 511, 200, 60); ctx.clip(); ctx.globalAlpha = .35; ctx.translate(0, 1022); ctx.scale(1, -1); lakeBoat(ctx, 58, 506, .9); ctx.restore();
    lakeRings(ctx, 60, 512, 2.6, .45);
    lakeBoat(ctx, 58, 506, .9);
    stroke(ctx, [[100, 492], [112, 497], [122, 488]], 'rgba(220,200,160,.8)', 1);
    bloom(ctx, 123, 456, 70, LAKE_WARM, .32);
    poly(ctx, [[118, 498], [118, 470], [128, 470], [128, 498]], lin(ctx, 118, 0, 128, 0, [[0, '#c48a5a'], [1, '#5e3a24']]), null);
    ctx.beginPath(); ctx.ellipse(123, 470, 5.6, 2, 0, 0, TAU); ctx.fillStyle = '#d8a876'; ctx.fill();
    stroke(ctx, [[117.5, 480], [128.5, 478.5]], 'rgba(230,214,176,.8)', 1.3); stroke(ctx, [[117.5, 484], [128.5, 482.5]], 'rgba(230,214,176,.8)', 1.3);
    // The lantern hung from a crook on the post.
    stroke(ctx, [[123, 470], [123, 452], [131, 448]], '#4a3020', 1.4);
    stroke(ctx, [[131, 448], [131, 452]], '#4a3020', .8);
    poly(ctx, [[127, 452], [135, 452], [136, 463], [126, 463]], 'rgba(255,214,140,.9)', null);
    poly(ctx, [[126, 452], [136, 452], [134, 449.6], [128, 449.6]], '#3a2618', null); poly(ctx, [[125.6, 463], [136.4, 463], [135, 465], [127, 465]], '#3a2618', null);
    bloom(ctx, 131, 458, 16, LAKE_WARM, .8); dot(ctx, 131, 458, 1.8, '#fff6d8');
    // Its light on the water.
    ctx.save(); ctx.beginPath(); ctx.rect(-20, 500, 460, 80); ctx.clip();
    for (let i = 0; i < 8; i++) { const y = 532 + i * 3.4, w = 14 - i; stroke(ctx, [[131 - w / 2 + (i % 2) * 2, y], [131 + w / 2, y]], rgba(LAKE_WARM, .32 - i * .03), 1); }
    ctx.restore();
    // Pads gathered in the right corner, a water lily, and an axolotl come up to see.
    lakePad(ctx, 392, 472, 20, 2.6, 1); lakePad(ctx, 350, 490, 13, .4, 2); lakePad(ctx, 410, 506, 16, 3.3, 3);
    lakeLily(ctx, 394, 468, .9);
    lakeRings(ctx, 366, 534, 1.3, .8);
    lakePad(ctx, 366, 542, 22, 4.5, 4);
    lakeAxolotl(ctx, 366, 536, 1.05);
    lakePad(ctx, 330, 552, 10, 1, 5);
    // Foreground: the dark lip of the roof overhanging the top corners.
    for (const [pts, dx] of [[[[-20, -20], [90, -20], [70, 10], [40, 30], [10, 60], [-20, 80]], 1], [[[440, -20], [330, -20], [356, 12], [390, 28], [420, 56], [440, 70]], -1]]) {
      shape(ctx, pts, '#03070c', null); rim(ctx, pts, 'rgba(120,240,210,.25)', dx, 1.6);
    }
    grade(ctx, 'rgba(120,230,210,.3)', 'rgba(30,50,110,.5)', 'rgba(2,10,20,.55)');
    grain(ctx, .08);
    if (framed) frame(ctx, '#3c8c98', '#a8f5e0');
  }

  // ---------- Level 6: Fossil Beds ----------
  // A night dig deep in the sandstone: the beds of old seas laid down in bands of ochre, rose, cream and grey clay,
  // cut back in terraces down to the floor of the pit. A work lamp hung from the gantry at the upper right is the key
  // light, pouring warm light down across the floor to the launcher and the half-dug skull; the far wall and the
  // side away from the lamp sink into a cool dusty lilac. The crew's mole sleeps in the shade by the finds crate.
  const FOSSIL_LAMP = [354, 46], FOSSIL_WARM = '255,204,136', FOSSIL_AIR = '230,196,178';
  const FOSSIL_BONE = ['#fbf0da', '#e8cfa6', '#b6927a'];
  // Sandstone laid down in tilted beds: each band a gentle ridge that dips toward the left.
  function fossilBed(y, amp, seed, tilt = .06) { return ridge(y, amp, seed, 52).map(([x, yy]) => [x, yy + (210 - x) * tilt]); }
  // Kept as it was: the sand rocks in play wear this little shell, ink line and all.
  function ammonite(ctx, x, y, r, rot, bone, shade, ink) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    dot(ctx, 0, 0, r, bone); ctx.beginPath(); ctx.arc(.8, .8, r - 1.4, -.4, 2.2); ctx.strokeStyle = shade; ctx.lineWidth = r * .22; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.strokeStyle = ink; ctx.lineWidth = 1.3; ctx.stroke();
    // The coil, then the ribs that cross each whorl.
    const k = Math.log(r / 1.2) / (3 * TAU), at = a => 1.2 * Math.exp(k * a);
    ctx.beginPath(); for (let a = 0; a <= 3 * TAU; a += .15) ctx.lineTo(Math.cos(a) * at(a), Math.sin(a) * at(a)); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke();
    for (let a = TAU * .9; a < 3 * TAU; a += .42) {
      const r0 = at(a - TAU), r1 = at(a) - .4;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a + .08) * r1, Math.sin(a + .08) * r1); ctx.strokeStyle = 'rgba(138,90,52,.55)'; ctx.lineWidth = .8; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(-r * .2, -r * .2, r * .62, 3.5, 4.5); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  // A shell in relief in the rock: lit on its upper right by the lamp, the whorls cut as grooves with a lit lip.
  function fossilShell(ctx, x, y, r, rot, alpha = 1, shadow = true) {
    ctx.save(); ctx.globalAlpha = alpha;
    if (shadow) soft(ctx, () => ctx.arc(x - r * .16, y + r * .22, r, 0, TAU), 'rgba(80,40,40,.42)', r * .35);
    ctx.translate(x, y);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = rad(ctx, r * .3, -r * .35, r * 1.45, [[0, FOSSIL_BONE[0]], [.5, FOSSIL_BONE[1]], [1, FOSSIL_BONE[2]]]); ctx.fill();
    ctx.rotate(rot);
    const k = Math.log(r / 1.2) / (3 * TAU), at = a => 1.2 * Math.exp(k * a);
    const spiral = (off, color, w) => { ctx.beginPath(); for (let a = 0; a <= 3 * TAU; a += .12) { const rr = Math.max(0, at(a) + off); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); };
    spiral(0, 'rgba(128,80,62,.5)', Math.max(.8, r * .07));
    spiral(-r * .07, 'rgba(255,246,226,.5)', Math.max(.5, r * .04));
    for (let a = TAU * .9; a < 3 * TAU; a += .42) {
      const r0 = at(a - TAU) + r * .04, r1 = at(a) - r * .05;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a + .08) * r1, Math.sin(a + .08) * r1); ctx.strokeStyle = 'rgba(150,100,76,.3)'; ctx.lineWidth = Math.max(.5, r * .05); ctx.stroke();
    }
    ctx.rotate(-rot);
    ctx.beginPath(); ctx.arc(0, 0, r * .93, -1.8, .2); ctx.strokeStyle = 'rgba(255,248,232,.7)'; ctx.lineWidth = Math.max(.7, r * .08); ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  // A hollow brushed out around a find: in shadow under its upper right lip, its far side catching the lamp.
  function fossilHollow(ctx, pts) {
    shape(ctx, pts, 'rgba(140,82,62,.26)', null);
    cel(ctx, pts, 'rgba(84,44,44,.34)', 2.8, -3.6);
    cel(ctx, pts, 'rgba(255,234,200,.34)', -1.8, 2.4);
  }
  function fossilBone(ctx, x, y, len, rot, k = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const h = len / 2, w = 1.6 * k, e = 2.3 * k, o = .8 * k;
    const path = () => {
      ctx.moveTo(-h + 2, -w); ctx.lineTo(h - 2, -w); ctx.arc(h - 1, -w - o, e, 2.4, .6, false); ctx.arc(h - 1, w + o, e, -.6, -2.4, false);
      ctx.lineTo(-h + 2, w); ctx.arc(-h + 1, w + o, e, .6, -2.4 + TAU, false); ctx.arc(-h + 1, -w - o, e, 2.4 - TAU, -.6 + TAU, false); ctx.closePath();
    };
    soft(ctx, () => { ctx.save(); ctx.translate(-1, 1.8); path(); ctx.restore(); }, 'rgba(80,40,40,.4)', 2.4);
    ctx.beginPath(); path(); ctx.fillStyle = lin(ctx, 0, -w - e, 0, w + e, [[0, FOSSIL_BONE[0]], [.55, FOSSIL_BONE[1]], [1, FOSSIL_BONE[2]]]); ctx.fill();
    stroke(ctx, [[-h + 3, -w * .4], [h - 4, -w * .4]], 'rgba(255,252,240,.75)', .8 * k);
    ctx.restore();
  }
  // A fish laid flat in the stone: every bone a pale stroke with a soft shadow just below it, no outline.
  function fossilFish(ctx, x, y, len, flip) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -1 : 1, 1);
    const spine = [[-len * .42, 0], [-len * .1, -1.6], [len * .2, -1], [len * .4, 1]];
    const ribs = [];
    for (let i = 0; i < 6; i++) {
      const sx = -len * .3 + i * len * .1, h = 7.5 - Math.abs(i - 2) * 1.2;
      for (const s of [-1, 1]) ribs.push([[sx, s * .4 - 1], [sx + 2.5, s * h * .7 - 1], [sx + 1, s * h - 1]]);
    }
    const head = [[-len * .42, -7], [-len * .62, -1], [-len * .44, 6], [-len * .34, 0]], tail = [[len * .38, 0], [len * .58, -8], [len * .52, 0], [len * .58, 8]];
    for (const [dx, dy, c, k] of [[flip ? 1 : -1, 1.6, 'rgba(84,44,40,.3)', 1], [0, 0, '#eedcbc', 1], [flip ? -.3 : .3, -.4, 'rgba(255,252,240,.6)', .4]]) {
      ctx.save(); ctx.translate(dx, dy);
      stroke(ctx, spine, c, 2.2 * k); for (const rb of ribs) stroke(ctx, rb, c, 1.1 * k);
      if (k === 1) { shape(ctx, head, c, null); poly(ctx, tail, c, null); }
      ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(-len * .46, -1.4, 1.8, 1.6, 0, 0, TAU); ctx.fillStyle = 'rgba(120,72,56,.6)'; ctx.fill();
    for (const a of [-5, -2, 2, 5]) stroke(ctx, [[len * .42, 0], [len * .55, a]], 'rgba(150,100,76,.4)', .7);
    ctx.restore();
  }
  function fossilTrilobite(ctx, x, y, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    const body = [[-7, -4], [-6.4, 4], [-3.6, 10], [0, 12.4], [3.6, 10], [6.4, 4], [7, -4]];
    const head = [[-10.6, 1], [-9.4, -6], [-4.6, -10.6], [0, -11.6], [4.6, -10.6], [9.4, -6], [10.6, 1], [7, -3.4], [0, -4.4], [-7, -3.4]];
    soft(ctx, () => { smooth(ctx, body.map(([px, py]) => [px - 1.2, py + 1.8]), true); smooth(ctx, head.map(([px, py]) => [px - 1.2, py + 1.8]), true); }, 'rgba(80,40,40,.4)', 2.4);
    shape(ctx, body, lin(ctx, 6, -4, -6, 12, [[0, FOSSIL_BONE[0]], [.6, FOSSIL_BONE[1]], [1, FOSSIL_BONE[2]]]), null);
    for (let i = 0; i < 6; i++) {
      const yy = -2.4 + i * 2.3, w = 6.8 - i * .62;
      ctx.beginPath(); ctx.moveTo(-w, yy); ctx.quadraticCurveTo(0, yy + 1.6, w, yy); ctx.strokeStyle = 'rgba(140,92,70,.45)'; ctx.lineWidth = .8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w + .6, yy + .9); ctx.quadraticCurveTo(0, yy + 2.5, w - .6, yy + .9); ctx.strokeStyle = 'rgba(255,248,232,.4)'; ctx.lineWidth = .6; ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, 3, 2.4, 8.4, 0, 0, TAU); ctx.fillStyle = lin(ctx, 2, -5, -2, 11, [[0, '#fff8e8'], [1, '#d9bd98']]); ctx.fill();
    shape(ctx, head, lin(ctx, 9, -11, -9, 1, [[0, FOSSIL_BONE[0]], [.6, FOSSIL_BONE[1]], [1, FOSSIL_BONE[2]]]), null);
    rim(ctx, head, 'rgba(255,252,240,.7)', .9, -1);
    ctx.beginPath(); ctx.ellipse(0, -7, 2.6, 3, 0, 0, TAU); ctx.fillStyle = lin(ctx, 2, -10, -2, -4, [[0, '#fffaf0'], [1, '#dcc09c']]); ctx.fill();
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 5, -6.4, 1.6, 1.2, 0, 0, TAU); ctx.fillStyle = 'rgba(150,100,76,.6)'; ctx.fill(); }
    ctx.restore();
  }
  // The star of the dig: a big, friendly dinosaur skull, half out of the floor, grinning. Modelled by the lamp from
  // the upper right; the dark of the mouth and the sockets does the drawing.
  function fossilSkull(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const boneLit = '#fdf3de', hollow = '#8c5a46', seam = 'rgba(150,96,74,.45)';
    const tooth = (tx, ty, dir) => {
      ctx.beginPath();
      if (dir < 0) { ctx.moveTo(tx - 3.6, ty + 2); ctx.quadraticCurveTo(tx - 1, ty - 8, tx + 1, ty - 7.4); ctx.quadraticCurveTo(tx + 3, ty - 4, tx + 3.6, ty + 2); }
      else { ctx.moveTo(tx - 3.8, ty - 2); ctx.quadraticCurveTo(tx - 3, ty + 7, tx, ty + 8); ctx.quadraticCurveTo(tx + 3, ty + 7, tx + 3.8, ty - 2); }
      ctx.fillStyle = lin(ctx, tx + 3, ty - 6, tx - 3, ty + 6, [[0, '#fff8e8'], [1, '#cfae8a']]); ctx.fill();
    };
    soft(ctx, () => ctx.ellipse(60, 16, 74, 12, -.06, 0, TAU), 'rgba(70,34,34,.5)', 10);
    shape(ctx, [[30, -2], [70, -8], [112, -14], [108, 0], [70, 8], [34, 10]], lin(ctx, 0, -12, 0, 10, [[0, '#6e4236'], [1, '#9a6650']]), null);
    for (const tx of [50, 63, 76, 89, 101]) tooth(tx, 8 - (tx - 40) * .1, -1);
    const jaw = [[12, 4], [40, 8], [74, 6], [104, 0], [114, -4], [113, 4], [98, 12], [66, 19], [34, 21], [10, 16]];
    shape(ctx, jaw, lin(ctx, 112, -2, 30, 22, [[0, '#f8ead0'], [.55, '#e2c49e'], [1, '#b08a76']]), null);
    rim(ctx, jaw, 'rgba(255,250,236,.7)', 1, -1.4);
    stroke(ctx, [[30, 13], [60, 14], [92, 8]], seam, 1);
    for (const tx of [52, 64, 76, 88, 100, 111, 121]) tooth(tx, -4 - (tx - 40) * .09, 1);
    const skull = [[-6, -34], [8, -52], [34, -60], [58, -54], [80, -42], [106, -33], [124, -27], [131, -17], [126, -10], [110, -11], [86, -7], [60, -4], [36, -1], [14, 4], [-4, -6]];
    shape(ctx, skull, lin(ctx, 112, -56, 20, 4, [[0, boneLit], [.5, '#ecd4ae'], [1, '#bc9a84']]), null);
    clipTo(ctx, skull, () => {
      soft(ctx, () => ctx.ellipse(16, -6, 46, 16, -.2, 0, TAU), 'rgba(130,86,86,.32)', 12);
      soft(ctx, () => ctx.ellipse(70, -52, 50, 9, .2, 0, TAU), 'rgba(255,252,240,.5)', 9);
    });
    rim(ctx, skull, 'rgba(255,252,240,.8)', 1.4, -2);
    // The eye socket under a happy brow, the long window in the snout, a nostril.
    const socket = blob(42, -30, 11.5, 10.5, 31, .05, 10), snout = [[64, -32], [80, -36], [94, -30], [82, -24], [68, -24]];
    for (const h of [socket, snout]) {
      shape(ctx, h, lin(ctx, 0, -38, 0, -20, [[0, '#6a3e32'], [1, hollow]]), null);
      cel(ctx, h, 'rgba(255,240,212,.5)', -1.2, 2);
    }
    ctx.beginPath(); ctx.ellipse(118, -22, 3.4, 2.4, -.3, 0, TAU); ctx.fillStyle = hollow; ctx.fill();
    ctx.beginPath(); ctx.moveTo(25, -43); ctx.quadraticCurveTo(40, -51, 58, -43); ctx.strokeStyle = 'rgba(160,110,86,.45)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(25, -45); ctx.quadraticCurveTo(40, -53, 58, -45); ctx.strokeStyle = 'rgba(255,252,240,.85)'; ctx.lineWidth = 1.4; ctx.stroke();
    stroke(ctx, [[2, -26], [10, -18], [8, -10]], seam, 1);
    stroke(ctx, [[100, -14], [106, -20]], seam, 1);
    // A seedling has taken root in the eye socket and reaches for the lamp.
    stroke(ctx, [[42, -26], [42, -36], [46, -44]], '#5e9e52', 1.5);
    for (const [lx, ly, a, c] of [[38.8, -40.6, -.6, '#6fb460'], [49.4, -46, .5, '#98d47a']]) { ctx.beginPath(); ctx.ellipse(lx, ly, 4.6, 2.4, a, 0, TAU); ctx.fillStyle = c; ctx.fill(); }
    ctx.restore();
  }
  // The dig crew: a sleepy mole sat back against the crate, hard hat slipping, brush still in paw. A character, so
  // he keeps soft colored lines; he sleeps in the shade, so only the top of his hat catches the lamp.
  function fossilMole(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const ink = 'rgba(64,42,40,.7)';
    soft(ctx, () => ctx.ellipse(0, 3, 22, 4.4, 0, 0, TAU), 'rgba(40,20,30,.5)', 4);
    const body = [[-17, 0], [-19, -16], [-14, -30], [0, -35], [14, -30], [19, -16], [17, 0], [0, 3]];
    shape(ctx, body, lin(ctx, 10, -34, -10, 2, [[0, '#8a7470'], [1, '#56443f']]), ink, 1.2);
    ctx.beginPath(); ctx.ellipse(0, -9, 11, 9.5, 0, 0, TAU); ctx.fillStyle = 'rgba(170,148,140,.55)'; ctx.fill();
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 11, 1.4, 7.4, 3.6, side * .22, 0, TAU); ctx.fillStyle = '#e8a2a2'; ctx.fill(); ctx.strokeStyle = 'rgba(165,94,96,.7)'; ctx.lineWidth = .9; ctx.stroke(); }
    poly(ctx, [[-13, -4], [7, -17], [8.6, -15], [-11.4, -1.8]], '#b88454', null);
    ctx.beginPath(); ctx.moveTo(7, -17.6); ctx.quadraticCurveTo(13, -24, 17, -21); ctx.quadraticCurveTo(15, -15, 9, -14.4); ctx.closePath(); ctx.fillStyle = '#5a4434'; ctx.fill();
    for (const [px, py] of [[-6, -8], [4, -11]]) { ctx.beginPath(); ctx.ellipse(px, py, 4.6, 3.4, -.5, 0, TAU); ctx.fillStyle = '#f09aa4'; ctx.fill(); ctx.strokeStyle = 'rgba(165,94,96,.7)'; ctx.lineWidth = .9; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -22, 7.6, 5.4, 0, 0, TAU); ctx.fillStyle = '#a28c84'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -21, 3.6, 2.8, 0, 0, TAU); ctx.fillStyle = '#f59aa5'; ctx.fill();
    dot(ctx, -1, -22, .9, 'rgba(255,255,255,.9)');
    for (const side of [-1, 1]) for (const k of [-1, 1]) stroke(ctx, [[side * 5, -20 + k], [side * 11, -21 + k * 2.4]], 'rgba(61,46,43,.4)', .6);
    for (const ex of [-6.2, 6.2]) { ctx.beginPath(); ctx.arc(ex, -28.4, 2.3, .3, Math.PI - .3); ctx.strokeStyle = '#2a1c1a'; ctx.lineWidth = 1.2; ctx.stroke(); }
    dot(ctx, -10.6, -24, 2, 'rgba(246,160,176,.45)'); dot(ctx, 10.6, -24, 2, 'rgba(246,160,176,.45)');
    // The hard hat, tipped down over one eye, its lamp off for the nap.
    ctx.save(); ctx.translate(1, -35.5); ctx.rotate(-.14);
    const dome = () => { ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-13, -14, 0, -14.6); ctx.quadraticCurveTo(13, -14, 14, 0); ctx.closePath(); };
    dome(); ctx.fillStyle = lin(ctx, 8, -15, -8, 0, [[0, '#ffd760'], [.6, '#e8b034'], [1, '#b98222']]); ctx.fill();
    dome(); ctx.strokeStyle = 'rgba(150,100,30,.6)'; ctx.lineWidth = 1; ctx.stroke();
    poly(ctx, [[-17, -.4], [17, -.4], [17, 2.8], [-17, 2.8]], lin(ctx, 0, -.4, 0, 2.8, [[0, '#f2c048'], [1, '#a87820']]), null);
    stroke(ctx, [[0, -14], [0, -1]], 'rgba(150,100,30,.45)', 1.2);
    ctx.beginPath(); ctx.ellipse(-8, -6.4, 3.8, 3.4, 0, 0, TAU); ctx.fillStyle = '#e8dcb4'; ctx.fill(); ctx.strokeStyle = 'rgba(150,100,30,.6)'; ctx.lineWidth = .9; ctx.stroke();
    ctx.beginPath(); ctx.arc(1, -1, 13.4, -1.9, -.7); ctx.strokeStyle = 'rgba(255,246,214,.8)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
    ctx.font = '600 9px Fredoka, sans-serif'; ctx.fillStyle = 'rgba(255,236,206,.75)'; ctx.fillText('z', -26, -40); ctx.font = '600 7px Fredoka, sans-serif'; ctx.fillText('z', -33, -49);
    ctx.restore();
  }
  // A bulb on the string: a warm glass drop under a little dark socket.
  function fossilBulb(ctx, x, y, tilt) {
    bloom(ctx, x, y + 8, 22, FOSSIL_WARM, .32);
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    poly(ctx, [[-2.2, -1], [2.2, -1], [2.2, 3.2], [-2.2, 3.2]], '#3e2e2a', null);
    ctx.beginPath(); ctx.ellipse(0, 7.6, 3.6, 4.6, 0, 0, TAU); ctx.fillStyle = rad(ctx, 0, 8, 4.8, [[0, '#fffbe6'], [.6, '#ffe7a4'], [1, '#f2b45a']]); ctx.fill();
    ctx.restore();
  }
  // A ladder of rough timber, lit along the edges that face the lamp.
  function fossilLadder(ctx, rails, rungs) {
    for (const [a, b] of rails) soft(ctx, () => { ctx.moveTo(a[0] - 4, a[1] + 3); ctx.lineTo(b[0] - 4, b[1] + 3); ctx.lineTo(b[0] - 1, b[1] + 3); ctx.lineTo(a[0] - 1, a[1] + 3); ctx.closePath(); }, 'rgba(60,30,40,.4)', 4);
    const [[l0, l1], [r0, r1]] = rails;
    for (let k = 0; k < rungs; k++) {
      const t = (k + .5) / rungs, ya = l0[1] + (l1[1] - l0[1]) * t, xa = l0[0] + (l1[0] - l0[0]) * t, xb = r0[0] + (r1[0] - r0[0]) * t, yb = r0[1] + (r1[1] - r0[1]) * t;
      soft(ctx, () => { ctx.rect(xa - 2, ya + 2, xb - xa, 2.6); }, 'rgba(60,30,40,.35)', 2);
      poly(ctx, [[xa, ya - 1.7], [xb, yb - 1.7], [xb, yb + 1.7], [xa, ya + 1.7]], lin(ctx, 0, ya - 1.7, 0, ya + 1.7, [[0, '#e0b27e'], [1, '#8a5c3c']]), null);
    }
    for (const [a, b] of rails) {
      const nx = 2.2, rail = [[a[0] - nx, a[1]], [b[0] - nx, b[1]], [b[0] + nx, b[1]], [a[0] + nx, a[1]]];
      poly(ctx, rail, lin(ctx, a[0] - nx, 0, a[0] + nx, 0, [[0, '#e8bc88'], [.45, '#b07c50'], [1, '#6e4630']]), null);
    }
  }
  function paintFossil(ctx, framed) {
    const [lx, ly] = FOSSIL_LAMP;
    // The far wall of the pit: warm sand high up near the lamp, sinking into a cool dusty lilac in the depths.
    wash(ctx, '#e4b47c');
    const farBeds = [[60, '#d9a46e'], [98, '#ecc490'], [136, '#cc8e64'], [180, '#e2b07a'], [212, '#b89ca0'], [224, '#d69c6c'], [274, '#c4845f'], [314, '#deac7a'], [356, '#b47a62'], [388, '#cf9870'], [426, '#ab7460']];
    farBeds.forEach(([y, color], i) => {
      const top = fossilBed(y, 5, 61 + i);
      soft(ctx, () => { smooth(ctx, top, false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, color, 3);
      stroke(ctx, top.map(([x, yy]) => [x, yy - .6]), 'rgba(255,240,214,.16)', 1.2);
    });
    wash(ctx, lin(ctx, 0, 0, 0, 560, [[0, 'rgba(255,255,255,0)'], [.45, 'rgba(200,170,190,.2)'], [1, 'rgba(110,80,130,.5)']]), 'multiply');
    // Fine laminations and grit, only toward the sides.
    const r = rng(616);
    for (let i = 0; i < 60; i++) {
      const left = i % 2 === 0, x = left ? 6 + r() * 80 : 334 + r() * 80, y = 40 + r() * 400, w = 10 + r() * 30;
      stroke(ctx, [[x, y + (210 - x) * .06], [x + w, y + (210 - x - w) * .06]], 'rgba(130,70,50,.14)', .9);
    }
    grit(ctx, 0, 30, 420, 420, 260, 617, (x, y, rr) => !(Math.abs(x - 210) < 140 && rr() < .85));
    // A great shell the size of a cartwheel, still asleep in the far wall, and the stepped cuts of an older dig.
    fossilShell(ctx, 336, 252, 58, 2.2, .13, false);
    for (const [x0, x1, y] of [[96, 170, 132], [250, 330, 330]]) { soft(ctx, () => ctx.rect(x0, y, x1 - x0, 6), 'rgba(120,70,70,.1)', 4); stroke(ctx, [[x0, y], [x1, y - 1]], 'rgba(255,236,206,.14)', 1.2); }
    air(ctx, 20, 460, FOSSIL_AIR, .34, .18);
    // The lamp's light: a warm pool high on the right and a broad cone down across the pit to the floor.
    bloom(ctx, lx, ly, 300, '255,214,160', .4);
    for (const [a, len, w0, w1, al] of [[1.88, 540, 14, 100, .05], [1.88, 540, 10, 72, .05], [1.88, 520, 6, 46, .05], [2.14, 480, 8, 54, .04], [2.14, 480, 4, 30, .04]]) shaft(ctx, lx - 4, ly + 8, a, len, w0, w1, '255,232,190', al);
    // The cut walls of the pit step inward as they go down; their beds carry on through them, bolder up close.
    const left = densify([[-20, 20], [30, 24], [34, 92], [29, 147], [48, 150], [51, 222], [47, 288], [64, 291], [67, 362], [61, 452], [-20, 452]], 9, 1);
    const right = densify([[440, 20], [392, 24], [387, 96], [391, 139], [375, 142], [372, 222], [377, 287], [356, 290], [353, 366], [359, 452], [440, 452]], 9, 2);
    const beds = [[20, '#e4b480'], [62, '#d49866'], [94, '#e8c08c'], [126, '#c4845e'], [168, '#deae7a'], [204, '#a8929a'], [216, '#d8a272'], [258, '#c68860'], [298, '#e2b282'], [336, '#b6785c'], [370, '#d49e6e'], [410, '#bf845e']];
    for (const [wall, side] of [[left, -1], [right, 1]]) {
      soft(ctx, () => smooth(ctx, wall.map(([x, y]) => [x - side * 7, y + 6]), true), 'rgba(70,36,46,.38)', 12);
      shape(ctx, wall, '#d8a26c', null);
      clipTo(ctx, wall, () => {
        beds.forEach(([y, color], i) => {
          const top = fossilBed(y + 8, 3, 80 + i);
          band(ctx, top, 600, color, null);
          stroke(ctx, top, 'rgba(255,238,208,.22)', 1);
          soft(ctx, () => { smooth(ctx, top.map(([x, yy]) => [x, yy + 1]), false); ctx.lineTo(440, top[top.length - 1][1] + 6); ctx.lineTo(-20, top[0][1] + 6); ctx.closePath(); }, 'rgba(110,56,40,.16)', 3);
        });
        const rl = rng(90 + side);
        for (let i = 0; i < 40; i++) { const x = side < 0 ? rl() * 60 : 352 + rl() * 70, y = 30 + rl() * 420, w = 6 + rl() * 20; stroke(ctx, [[x, y + (210 - x) * .06], [x + w, y + (210 - x - w) * .06]], 'rgba(120,64,44,.18)', .8); }
        // Away from the lamp the right wall falls into cool shade; the left wall takes the light full on.
        if (side > 0) wash(ctx, lin(ctx, 0, 0, 0, 460, [[0, 'rgba(120,96,150,.22)'], [1, 'rgba(84,62,120,.42)']]), 'multiply');
        else wash(ctx, lin(ctx, 0, 0, 0, 460, [[0, 'rgba(255,220,170,.22)'], [1, 'rgba(120,80,120,.18)']]), side < 0 ? 'soft-light' : null);
        // Each step's overhang throws a shadow down the face under it.
        for (const [x0, x1, y] of side < 0 ? [[-20, 52, 150], [-20, 66, 291]] : [[372, 440, 142], [353, 440, 290]]) soft(ctx, () => ctx.rect(x0, y, x1 - x0, 10), 'rgba(70,34,40,.3)', 6);
      });
      rim(ctx, wall, lin(ctx, 0, 20, 0, 452, side < 0 ? [[0, 'rgba(255,240,206,.42)'], [1, 'rgba(255,240,206,.12)']] : [[0, 'rgba(255,226,190,.2)'], [1, 'rgba(255,226,190,.04)']]), -side * 1.6, -1.2);
    }
    // The treads of the steps, catching the lamp from above.
    for (const [x0, x1, y] of [[29, 49, 148], [47, 65, 289.5], [376, 391, 140.5], [356, 377, 288.5]]) {
      poly(ctx, [[x0, y - 1.6], [x1, y + .4], [x1, y + 2.4], [x0, y + .4]], x0 < 200 ? '#f6dcae' : '#d8b496', null);
    }
    // Small stones bedded in the walls.
    const sr = rng(77);
    for (let i = 0; i < 18; i++) {
      const side = i % 2, x = side ? 360 + sr() * 50 : 6 + sr() * 50, y = 60 + sr() * 380;
      stone(ctx, x, y, 2.4 + sr() * 3.4, 1.8 + sr() * 2.2, 700 + i, side ? ['#d6c0b0', '#8a6c70', 'rgba(255,240,220,.35)'] : ['#e8d0b0', '#a07a5e', 'rgba(255,246,226,.5)']);
    }
    // Finds in the walls, each in the hollow someone has been brushing out.
    // Ribs of something very large curve out of the upper left wall, the rest of it still asleep in the rock.
    fossilHollow(ctx, blob(12, 92, 27, 54, 6, .12, 10));
    for (let i = 0; i < 5; i++) {
      const y = 52 + i * 18, len = 26 - i * 2.6, rib = ribbon2([[2, y], [2 + len * .55, y + 3], [2 + len * .9, y + 12], [2 + len, y + 22]], 5.4, .7);
      soft(ctx, () => smooth(ctx, rib.map(([x, yy]) => [x - 1.2, yy + 2]), true), 'rgba(80,40,40,.4)', 2.4);
      shape(ctx, rib, lin(ctx, 2, y, 2 + len, y + 22, [[0, FOSSIL_BONE[0]], [.6, FOSSIL_BONE[1]], [1, FOSSIL_BONE[2]]]), null);
      rim(ctx, rib, 'rgba(255,252,240,.7)', .6, -1.2);
    }
    for (let i = 0; i < 6; i++) {
      const y = 46 + i * 18, v = [[-6, y - 6], [3, y - 7.4], [8, y - 4], [9.6, y + .4], [8, y + 4.6], [3, y + 7], [-6, y + 6]];
      soft(ctx, () => smooth(ctx, v.map(([x, yy]) => [x - 1, yy + 1.8]), true), 'rgba(80,40,40,.4)', 2);
      shape(ctx, v, lin(ctx, 8, y - 7, -2, y + 7, [[0, FOSSIL_BONE[0]], [.6, FOSSIL_BONE[1]], [1, FOSSIL_BONE[2]]]), null);
      rim(ctx, v, 'rgba(255,252,240,.7)', .8, -1);
    }
    fossilHollow(ctx, blob(22, 214, 22, 20, 1, .14, 10)); fossilShell(ctx, 22, 214, 15, .5);
    fossilHollow(ctx, blob(32, 360, 15, 10, 4, .14, 10)); fossilBone(ctx, 32, 360, 18, .5);
    fossilHollow(ctx, blob(28, 418, 13, 9, 7, .14, 9)); fossilTrilobite(ctx, 28, 418, .8, -.5);
    fossilHollow(ctx, blob(398, 196, 30, 13, 2, .14, 10)); fossilFish(ctx, 400, 196, 46, true);
    fossilHollow(ctx, blob(398, 254, 17, 21, 3, .14, 10)); fossilTrilobite(ctx, 398, 254, 1.3, .25);
    fossilHollow(ctx, blob(402, 360, 12, 10, 5, .14, 10)); fossilShell(ctx, 402, 360, 8, 1);
    // Tools left on the steps: a trowel stuck in the sand and a soft brush.
    ctx.save(); ctx.translate(366, 283); ctx.rotate(.38);
    soft(ctx, () => { ctx.moveTo(-4, 0); ctx.lineTo(4, 10); ctx.lineTo(-2, 12); ctx.closePath(); }, 'rgba(60,30,40,.35)', 3);
    poly(ctx, [[-1.6, -14], [1.6, -14], [1.6, -4], [-1.6, -4]], lin(ctx, -1.6, 0, 1.6, 0, [[0, '#d09a64'], [1, '#7a4a2c']]), null);
    poly(ctx, [[0, -4], [5.6, 2], [0, 10], [-5.6, 2]], lin(ctx, -5, -4, 5, 10, [[0, '#eef2f4'], [1, '#8a96a2']]), null);
    ctx.restore();
    ctx.save(); ctx.translate(48, 285); ctx.rotate(-.12);
    soft(ctx, () => ctx.rect(-10, 1, 26, 3), 'rgba(60,30,40,.35)', 2);
    poly(ctx, [[-10, -1.6], [4, -1.6], [4, 1.6], [-10, 1.6]], lin(ctx, 0, -1.6, 0, 1.6, [[0, '#e0a86c'], [1, '#8a5a34']]), null);
    poly(ctx, [[4, -2.6], [8, -2.6], [8, 2.6], [4, 2.6]], lin(ctx, 0, -2.6, 0, 2.6, [[0, '#e8e2da'], [1, '#8a827a']]), null);
    ctx.beginPath(); ctx.moveTo(8, -3); ctx.quadraticCurveTo(15, -4, 16, 0); ctx.quadraticCurveTo(15, 4, 8, 3); ctx.closePath(); ctx.fillStyle = '#5a4434'; ctx.fill();
    ctx.restore();
    // The ladder up the right wall to the way out.
    fossilLadder(ctx, [[[374, 142], [390, 12]], [[390, 142], [406, 12]]], 8);
    // The top lip of the pit, dark against the lamp, with the string of bulbs pinned along under it.
    const roof = [[-10, -10], [430, -10], [430, 20], [380, 26], [320, 20], [250, 27], [190, 22], [120, 28], [60, 21], [-10, 27]];
    soft(ctx, () => smooth(ctx, roof.map(([x, y]) => [x, y + 6]), true), 'rgba(70,36,40,.4)', 8);
    shape(ctx, roof, lin(ctx, 0, 0, 0, 28, [[0, '#4a2c2c'], [1, '#7a4a3c']]), null);
    rim(ctx, roof, 'rgba(255,214,160,.5)', 0, 1.6);
    for (let x = 16; x < 410; x += 23) stroke(ctx, [[x, 23 + (x * 7) % 5], [x + 2, 30 + (x * 3) % 8]], 'rgba(244,214,180,.32)', .8);
    const hooks = [[-6, 26], [104, 28], [214, 25], [312, 24]], cable = [];
    for (let h = 0; h < hooks.length - 1; h++) {
      const [x0, y0] = hooks[h], [x1, y1] = hooks[h + 1];
      for (let t = 0; t < 1; t += .1) cable.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 12]);
    }
    cable.push(hooks[hooks.length - 1]);
    stroke(ctx, cable, 'rgba(50,32,30,.85)', 1.1);
    for (const [i, t] of [[4, .1], [8, -.08], [15, .06], [18, -.1], [25, .12]]) fossilBulb(ctx, cable[i][0], cable[i][1] - 1, t);
    // The work lamp, hung on its cable from a spike in the lip: the key light of the dig.
    stroke(ctx, [[lx + 6, 20], [lx + 3, ly - 14]], '#2a1c1a', 1.2);
    dot(ctx, lx + 6, 21, 1.6, '#3a2a26');
    ctx.save(); ctx.translate(lx, ly - 8); ctx.rotate(.42);
    poly(ctx, [[-6, -8], [6, -8], [13, 6], [-13, 6]], lin(ctx, -13, 0, 13, 0, [[0, '#3c5c5a'], [.5, '#6a908a'], [1, '#2c4442']]), null);
    stroke(ctx, [[-5.4, -7.4], [-12, 5.4]], 'rgba(220,255,246,.35)', .9);
    poly(ctx, [[-3, -11], [3, -11], [3, -8], [-3, -8]], '#2a2a28', null);
    ctx.beginPath(); ctx.ellipse(0, 6, 13, 3.2, 0, 0, TAU); ctx.fillStyle = '#fff6da'; ctx.fill();
    ctx.restore();
    bloom(ctx, lx - 3, ly + 2, 60, '255,226,170', .7); bloom(ctx, lx - 3, ly + 2, 16, '255,250,230', .9);
    // The floor of the dig, swept smooth in the middle where the lamp pools.
    const floor = fossilBed(452, 2, 91, .01);
    soft(ctx, () => { smooth(ctx, floor.map(([x, y]) => [x, y - 5]), false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, 'rgba(70,34,40,.32)', 10);
    band(ctx, floor, 600, lin(ctx, 0, 450, 0, 560, [[0, '#d8aa7c'], [.5, '#c08c6a'], [1, '#8e6464']]), null);
    rim(ctx, floor.concat([[440, 600], [-20, 600]]), 'rgba(255,236,200,.5)', 0, -2);
    for (const [y, seed, c] of [[490, 92, 'rgba(150,90,70,.14)'], [528, 93, 'rgba(120,70,70,.16)']]) { const pts = fossilBed(y, 3, seed, .01); soft(ctx, () => { smooth(ctx, pts, false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, c, 4); }
    bloom(ctx, 196, 500, 150, '255,214,160', .3);
    grit(ctx, 0, 456, 420, 104, 140, 718, (x) => Math.abs(x - 210) > 80);
    // Two boards laid over the soft floor: the crew's walkway, and the launcher's stand.
    for (const [x0, x1, y, tilt, seed] of [[150, 286, 487, -.012, 1], [132, 268, 501, .01, 2]]) {
      const dy = (x1 - x0) * tilt, top = [[x0, y], [x1, y + dy], [x1 - 3, y + dy + 10], [x0 - 3, y + 10]], edge = [[x0 - 3, y + 10], [x1 - 3, y + dy + 10], [x1 - 3, y + dy + 13], [x0 - 3, y + 13]];
      soft(ctx, () => { ctx.moveTo(x0 - 6, y + 12); ctx.lineTo(x1, y + dy + 12); ctx.lineTo(x1, y + dy + 16); ctx.lineTo(x0 - 6, y + 16); ctx.closePath(); }, 'rgba(70,34,30,.5)', 4);
      poly(ctx, edge, '#6e4632', null);
      poly(ctx, top, lin(ctx, x0, y, x1, y + 10, [[0, '#d8aa76'], [.6, '#c49464'], [1, '#a87a52']]), null);
      stroke(ctx, [top[0], top[1]], 'rgba(255,238,206,.55)', 1);
      const rp = rng(seed);
      for (let k = 0; k < 3; k++) { const t = .25 + k * .25, a = x0 + 6 + rp() * 40, b = x1 - 6 - rp() * 40; stroke(ctx, [[a, y + 10 * t + (a - x0) * tilt], [b, y + 10 * t + (b - x0) * tilt]], 'rgba(120,70,44,.2)', .7); }
      for (const nx of [x0 + 5, x1 - 6]) dot(ctx, nx, y + 5 + (nx - x0) * tilt, .8, 'rgba(70,40,30,.55)');
      soft(ctx, () => ctx.ellipse(x1 - 4, y + dy + 8, 8, 4, 0, 0, TAU), 'rgba(220,180,140,.6)', 3);
    }
    // The skull, in its own excavation hollow, with the string-and-peg grid that marks it out.
    const pit = blob(56, 506, 100, 44, 9, .1, 12);
    shape(ctx, pit, lin(ctx, 0, 462, 0, 550, [[0, '#9c6a58'], [.4, '#b88664'], [1, '#c89a72']]), null);
    cel(ctx, pit, 'rgba(84,44,50,.3)', 2, -5);
    rim(ctx, pit, 'rgba(255,236,200,.4)', -1, 2.4);
    fossilSkull(ctx, -6, 528, 1);
    fossilBone(ctx, 128, 545, 16, -.3);
    for (const [x, y] of [[12, 462], [150, 468]]) {
      soft(ctx, () => ctx.ellipse(x - 2, y + 4, 4, 1.4, 0, 0, TAU), 'rgba(60,30,30,.45)', 2);
      poly(ctx, [[x - 1.6, y - 16], [x + 1.6, y - 16], [x + 1.2, y + 4], [x - 1.2, y + 4]], lin(ctx, x - 1.6, 0, x + 1.6, 0, [[0, '#7a5034'], [1, '#d8aa78']]), null);
    }
    stroke(ctx, [[12, 448], [80, 455], [150, 454]], 'rgba(255,248,232,.75)', .7);
    ctx.beginPath(); ctx.moveTo(150, 452); ctx.quadraticCurveTo(158, 452, 163, 456); ctx.lineTo(150, 459); ctx.closePath(); ctx.fillStyle = lin(ctx, 150, 0, 163, 0, [[0, '#c84c40'], [1, '#f07a62']]); ctx.fill();
    for (const [x, y, w, h, sd] of [[172, 538, 5, 3.4, 71], [252, 542, 6, 3.8, 72], [312, 470, 4.4, 3, 73], [88, 462, 4, 2.8, 74]]) stone(ctx, x, y, w, h, sd, ['#f0dcc0', '#a07c64', 'rgba(255,248,232,.7)']);
    // The crate of finds in the right corner, in the shade, and the crew asleep against it.
    const crate = [[338, 470], [402, 466], [405, 522], [341, 526]];
    fossilShell(ctx, 358, 466, 9, 1.2); fossilBone(ctx, 384, 462, 20, -.4);
    soft(ctx, () => ctx.ellipse(370, 526, 40, 5, 0, 0, TAU), 'rgba(50,26,36,.5)', 6);
    poly(ctx, crate, lin(ctx, 338, 0, 405, 0, [[0, '#b0805c'], [.48, '#9a6c4c'], [.52, '#7e5640'], [1, '#6a4636']]), null);
    for (const y of [486, 505]) { stroke(ctx, [[340, y], [404, y - 1]], 'rgba(50,28,24,.45)', 1.1); stroke(ctx, [[340, y + 1.2], [404, y + .2]], 'rgba(255,226,190,.18)', .8); }
    stroke(ctx, [[339, 471], [402, 467]], 'rgba(255,232,196,.55)', 1.2);
    wash(ctx, rad(ctx, 384, 512, 96, [[0, 'rgba(90,70,130,.3)'], [1, 'rgba(90,70,130,0)']]), 'multiply');
    fossilMole(ctx, 350, 538, 1.1);
    // Near the corners: a coil of rope on the floor at the bottom right, nearly a silhouette.
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(412, 546 - k * 2.6, 20 - k * 2, 6.4 - k * .6, 0, 0, TAU); ctx.strokeStyle = k % 2 ? '#5a3a2c' : '#6e4a36'; ctx.lineWidth = 3.4; ctx.stroke(); }
    stroke(ctx, [[396, 538], [404, 535], [414, 537]], 'rgba(255,220,180,.3)', 1);
    grade(ctx, 'rgba(255,206,140,.42)', 'rgba(96,74,150,.45)', 'rgba(60,30,40,.5)');
    grain(ctx, .08);
    if (framed) frame(ctx, '#b27a48', '#fff0d2');
  }

  // ---------- Level 7: Ember Hollows ----------
  // Deep in the basalt the only light is the lava. It pools in the low corners and glows up through the cracks, so
  // every column is warm at its foot and sinks into cool violet above, and the column ends hanging from the roof are
  // lit from underneath. Smoke holds the glow in the middle distance; embers ride the heat up the walls.
  // A seam of magma: a wide soft glow, then a hot line with a white core. (The basalt rocks in play use it too.)
  function magma(ctx, pts, width = 1) {
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, c] of [[9, 'rgba(255,110,50,.10)'], [5, 'rgba(255,130,60,.22)'], [2.2, '#ff9a48'], [.9, '#ffe2a0']]) { path(); ctx.strokeStyle = c; ctx.lineWidth = w * width; ctx.stroke(); }
    ctx.restore();
  }
  const emberRGB = c => c[0] === '#' ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : c.slice(c.indexOf('(') + 1, -1).split(',').map(Number);
  function emberMix(c0, c1, t) {
    const a = emberRGB(c0), b = emberRGB(c1), k = Math.max(0, Math.min(1, t));
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  }
  function emberLine(ctx, pts, color, width) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  // The two lava pools, and how strongly their light reaches a point.
  const EMBER_POOLS = [[76, 510, 1], [364, 522, .8]];
  const emberHeat = (x, y) => Math.min(1, EMBER_POOLS.reduce((m, [px, py, k]) => Math.max(m, k * Math.exp(-((x - px) ** 2 + ((y - py) * 1.3) ** 2) / 26000)), 0) + .12);
  const EMBER_NEAR = { shade: '#1a1224', top: '#3a3152', mid: '#4a3048', foot: '#9a4a3c', hot: '#e0784a', lid: '#5a5276', lidWarm: '#a0645a' };
  const EMBER_FORE = { shade: '#0e0812', top: '#1c1526', mid: '#201420', foot: '#40201f', hot: '#7a3426', lid: '#2a2236', lidWarm: '#5a3030' };
  // A basalt column seen front-on: three faces of a hexagonal prism under its lid. All faces share the one light, the
  // glow from the floor, so the gradient runs on the scene's heights and warms with nearness to a pool; the face turned
  // to the glow (toward +1: the right face, -1: the left) gets all of it. Cross-joints break the shaft, and the lid is
  // thinner the nearer it sits to eye level.
  function emberColumn(ctx, x, top, w, bottom, o = {}) {
    const pal = o.pal || EMBER_NEAR, toward = o.toward || 0, tilt = o.tilt || 0, r = rng(o.seed || 7);
    const h = w * .19 * Math.max(.3, Math.min(1, (top - 60) / 260)), l = x - w / 2, rr = x + w / 2, a = x - w * .25, b = x + w * .25, T = px => top + (px - x) * tilt;
    const heat = o.heat ?? emberHeat(x, bottom - 20), foot = emberMix(pal.foot, pal.hot, (heat - .45) * 1.6);
    if (o.occlude !== false) soft(ctx, () => ctx.rect(l - 2, T(x) - h * 1.4, w + 4, bottom - top + h * 2), 'rgba(12,5,16,.5)', 9);
    const lift = toward > 0 ? [.14, .62, 1] : toward < 0 ? [1, .62, .14] : [.5, 1, .5];
    const faces = [[[l, T(l)], [a, T(a) + h], [a, bottom], [l, bottom]], [[a, T(a) + h], [b, T(b) + h], [b, bottom], [a, bottom]], [[b, T(b) + h], [rr, T(rr)], [rr, bottom], [b, bottom]]];
    faces.forEach((f, i) => poly(ctx, f, lin(ctx, 0, 30, 0, 476, [[0, emberMix(pal.shade, pal.top, lift[i])], [.52, emberMix(pal.shade, pal.mid, lift[i])], [1, emberMix(pal.shade, foot, lift[i] * (.5 + heat * .5))]])));
    ctx.save(); ctx.beginPath(); ctx.rect(l, T(x) - h * 2, w, bottom - T(x) + h * 3); ctx.clip();
    // Weathering streaks and chipped edges, then the joints: a dark gap and a lip below it catching what light there is.
    for (let i = 0; i < 4; i++) { const sx = l + 2 + r() * (w - 4), sy = top + h + r() * (bottom - top) * .7; stroke(ctx, [[sx, sy], [sx + (r() - .5) * 2, sy + 16 + r() * 50]], 'rgba(10,4,16,.16)', 1 + r() * 1.8); }
    for (let i = 0; i < 3; i++) { const side = r() < .5, cy = top + 30 + r() * (bottom - top - 40), ex = side ? l : rr, d = side ? 1 : -1, cw = 2 + r() * 3; poly(ctx, [[ex, cy], [ex + d * cw, cy + 3 + r() * 3], [ex, cy + 8 + r() * 6]], 'rgba(14,6,20,.55)'); }
    for (let y = top + 22 + r() * 34; y < bottom - 14; y += 30 + r() * 48) {
      const s = (r() - .5) * 3, j = [[l, y + s], [a, y + h + s * .3], [b, y + h - s * .3], [rr, y - s]];
      if (o.magmaBelow && y > o.magmaBelow && r() < .6) { magma(ctx, j, .5); continue; }
      emberLine(ctx, j, 'rgba(12,5,18,.6)', 1.2);
      const warm = Math.min(1, heat * Math.max(0, (y - 200) / 260));
      emberLine(ctx, j.map(([px, py]) => [px, py + 1.5]), warm > .2 ? `rgba(255,170,130,${(.06 + warm * .26).toFixed(3)})` : 'rgba(190,180,240,.1)', .9);
    }
    // The lit edge: the corner turned toward the glow, and a rim down the outside of the column, both fading upward.
    const ex = toward > 0 ? b : toward < 0 ? a : null, ox = toward > 0 ? rr - .7 : toward < 0 ? l + .7 : null;
    const fade = al => lin(ctx, 0, bottom, 0, Math.max(top, bottom - 300), [[0, `rgba(255,176,120,${(al * heat).toFixed(3)})`], [1, 'rgba(255,176,120,0)']]);
    if (ex !== null) {
      emberLine(ctx, [[ex, T(ex) + h], [ex, bottom]], fade(.35), 1); emberLine(ctx, [[ox, T(ox)], [ox, bottom]], fade(.75), 1.5);
      const cx = toward > 0 ? l + .7 : rr - .7;
      emberLine(ctx, [[cx, T(cx) + 2], [cx, bottom]], lin(ctx, 0, top, 0, bottom, [[0, 'rgba(150,140,230,.22)'], [1, 'rgba(150,140,230,0)']]), 1.2);
    }
    ctx.restore();
    // The lid sees only the cool air above, with a little warmth near the floor.
    const lid = [[l, T(l)], [a, T(a) - h], [b, T(b) - h], [rr, T(rr)], [b, T(b) + h], [a, T(a) + h]];
    poly(ctx, lid, lin(ctx, 0, T(x) - h, 0, T(x) + h, [[0, emberMix(pal.shade, pal.lid, .72)], [1, emberMix(pal.lid, pal.lidWarm, heat * Math.max(0, (top - 220) / 240))]]));
    emberLine(ctx, [[l + .5, T(l)], [a, T(a) + h - .4], [b, T(b) + h - .4], [rr - .5, T(rr)]], 'rgba(222,208,255,.24)', .9);
    if (o.chip) poly(ctx, [[b + (rr - b) * .1, T(b) - h * 1.1], [rr + 1, T(rr) - 1], [rr + 1, T(rr) + h * 2.6], [rr - w * .16, T(rr) + h * .6]], emberMix(pal.shade, pal.top, .3));
  }
  // A column end hanging from the roof, seen from below: its underside takes what glow climbs this high.
  function emberHang(ctx, x, w, by, glow, pal = EMBER_NEAR, haze = 0) {
    const h = w * .19 * Math.max(.3, Math.min(1, (190 - by) / 170)), l = x - w / 2, rr = x + w / 2, a = x - w * .25, b = x + w * .25;
    const fog = c => emberMix(c, '#3a2a4c', haze);
    soft(ctx, () => ctx.rect(l - 1, -20, w + 2, by + 20), 'rgba(10,4,14,.4)', 6);
    const faces = [[[l, -14], [a, -14], [a, by - h], [l, by]], [[a, -14], [b, -14], [b, by - h], [a, by - h]], [[b, -14], [rr, -14], [rr, by], [b, by - h]]];
    [.36, .7, .22].forEach((k, i) => poly(ctx, faces[i], lin(ctx, 0, Math.max(0, by - 90), 0, by, [[0, fog(emberMix(pal.shade, pal.top, k * .7))], [1, fog(emberMix(pal.shade, '#5e3a52', k))]])));
    for (let y = by - 22 - (x * 3 % 11); y > 4; y -= 30 + (x * 7 % 17)) emberLine(ctx, [[l, y], [a, y - h], [b, y - h], [rr, y]], `rgba(12,5,18,${(.5 - haze * .3).toFixed(3)})`, 1);
    const under = [[l, by], [a, by - h], [b, by - h], [rr, by], [b, by + h], [a, by + h]];
    poly(ctx, under, lin(ctx, 0, by - h, 0, by + h, [[0, fog(emberMix('#4a3048', '#b0645a', glow))], [1, fog(emberMix('#55344a', '#d88a68', glow))]]));
    emberLine(ctx, [[l + .5, by], [a, by + h - .3], [b, by + h - .3], [rr - .5, by]], `rgba(255,200,160,${(.12 + glow * .3).toFixed(3)})`, .8);
  }
  // A column of the far hall, flat in the smoke, lit only at its foot.
  function emberFar(ctx, x, top, w, bottom, c) {
    const h = w * .19 * Math.max(.3, Math.min(1, (top - 60) / 260)), l = x - w / 2, rr = x + w / 2, a = x - w * .25, b = x + w * .25;
    poly(ctx, [[l, top], [a, top + h], [b, top + h], [rr, top], [rr, bottom], [l, bottom]], lin(ctx, 0, top, 0, bottom, [[0, c.face], [.62, c.face], [1, c.foot]]));
    poly(ctx, [[l, top], [a, top + h], [a, bottom], [l, bottom]], c.side);
    poly(ctx, [[l, top], [a, top - h], [b, top - h], [rr, top], [b, top + h], [a, top + h]], c.lid);
  }
  // The lava: a lip of cooled rock with its back wall lit by the melt; the melt white-hot where it wells up, skinned
  // with dark crust toward its edges, and every crack in the crust glowing.
  function emberPool(ctx, x, y, rx, ry, seed) {
    const r = rng(seed), pool = blob(x, y, rx, ry, seed + 1, .09, 14), at = (a, k, dy = 0) => [x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k + dy];
    soft(ctx, () => ctx.ellipse(x, y + 1, rx + 12, ry + 7, 0, 0, TAU), 'rgba(16,4,10,.6)', 7);
    // The hollow it lies in: the far wall lit hot by the melt below it.
    const hollow = pool.map(([px, py]) => [x + (px - x) * 1.07, y + (py - y) * 1.3 - 3]);
    shape(ctx, hollow, lin(ctx, 0, y - ry * 1.3 - 3, 0, y, [[0, '#ffa058'], [.45, '#b04428'], [1, '#5a1c1c']]), null);
    shape(ctx, pool, rad(ctx, x - rx * .1, y, rx * 1.02, [[0, '#fff4c8'], [.2, '#ffd56c'], [.48, '#ff9a38'], [.8, '#ee5c22'], [1, '#c43a1a']]), null);
    clipTo(ctx, pool, () => {
      // The melt cools and darkens toward its edge, and floes of crust drift on it, each rimmed with light.
      ctx.beginPath(); smooth(ctx, pool, true); ctx.lineWidth = ry * .8; ctx.strokeStyle = 'rgba(120,28,16,.5)'; ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = r() * TAU, len = .2 + r() * .45, k = .52 + r() * .36, thick = .08 + r() * .1, floe = [];
        for (let t = 0; t <= 4; t++) floe.push(at(a + len * t / 4, k + thick * Math.sin(t / 4 * Math.PI) * (.6 + r() * .6)));
        for (let t = 4; t >= 0; t--) floe.push(at(a + len * t / 4, k - thick * Math.sin(t / 4 * Math.PI) * (.6 + r() * .6)));
        soft(ctx, () => smooth(ctx, floe, true), 'rgba(255,220,130,.75)', 2.2);
        shape(ctx, floe, i % 2 ? '#5a1c14' : '#6e2418', null);
        stroke(ctx, floe.slice(0, 5), 'rgba(255,150,80,.4)', .7);
      }
      for (let i = 0; i < 3; i++) { const bx = x - rx * .3 + r() * rx * .5, by = y - ry * .25 + r() * ry * .4; ctx.beginPath(); ctx.ellipse(bx, by, 2 + r() * 2.4, .9 + r() * .6, 0, 0, TAU); ctx.strokeStyle = 'rgba(255,250,224,.85)'; ctx.lineWidth = .7; ctx.stroke(); }
    });
    // The near rim of the hollow overlaps the melt; its edge catches the glow.
    const outer = [], inner = [];
    for (let a = .05; a <= Math.PI - .05 + 1e-6; a += (Math.PI - .1) / 10) { outer.push(at(a, 1.14, 4)); inner.unshift(at(a, .98, -1.4 - Math.sin(a) * 1.5)); }
    const rimPts = outer.concat(inner);
    shape(ctx, rimPts, lin(ctx, 0, y, 0, y + ry + 6, [[0, '#4a2228'], [1, '#22101a']]), null);
    stroke(ctx, inner.slice(1, -1), 'rgba(255,176,110,.7)', 1.1);
    bloom(ctx, x - rx * .1, y, rx * .8, '255,236,170', .3);
  }
  // Embers riding the heat up a wall: a curving drift from the source, thinning and cooling as they climb.
  function emberDrift(ctx, p0, p1, p2, n, seed, spread) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const t = Math.pow(r(), 1.35), [px, py] = bezierAt(p0, p1, p2, t), x = px + (r() - .5) * spread * (.4 + t), y = py + (r() - .5) * 16;
      const s = (1.5 - t * .7) * (.6 + r() * .8), a = (1 - t * .65) * (.7 + r() * .3);
      ctx.fillStyle = rad(ctx, x, y, s * 4.5, [[0, `rgba(255,120,40,${(a * .35).toFixed(3)})`], [1, 'rgba(255,120,40,0)']]); ctx.fillRect(x - s * 5, y - s * 5, s * 10, s * 10);
      dot(ctx, x, y, s * .75, `rgba(255,${Math.round(200 + 40 * (1 - t))},${Math.round(120 + 60 * (1 - t))},${a.toFixed(3)})`);
    }
  }
  // Obsidian: glassy black blades, cool violet on the facet facing up, the lava reflected along the foot.
  function emberShard(ctx, x, y, w, h, tilt) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    soft(ctx, () => ctx.ellipse(0, 0, w * 1.3, 2.2, 0, 0, TAU), 'rgba(10,2,8,.6)', 2);
    const blade = [[-w, 0], [-w * .8, -h * .62], [0, -h], [w * .9, -h * .58], [w, 0]];
    poly(ctx, blade, '#120a18');
    poly(ctx, [[-w, 0], [-w * .8, -h * .62], [0, -h], [w * .1, 0]], lin(ctx, 0, -h, 0, 0, [[0, '#5a5080'], [.5, '#2a2040'], [1, '#a8482c']]));
    emberLine(ctx, [[-w * .78, -h * .58], [0, -h + .8]], 'rgba(226,216,255,.6)', .8);
    emberLine(ctx, [[w * .92, -h * .08], [w * .82, -h * .5]], 'rgba(255,160,100,.55)', .8);
    ctx.restore();
  }
  // Glowing bracket fungus on a column face: fans of warm flesh brightest at the rim, gills beneath, a glow on the stone.
  function emberBracket(ctx, x, y, w, flip) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -1 : 1, 1);
    bloom(ctx, w * .5, w * .1, w * 2, '255,140,70', .22);
    soft(ctx, () => ctx.ellipse(w * .4, w * .36, w * .5, w * .12, 0, 0, TAU), 'rgba(16,6,14,.4)', 2);
    ctx.beginPath(); ctx.moveTo(0, w * .02); ctx.quadraticCurveTo(w * .55, w * .34, w * .98, w * .04); ctx.quadraticCurveTo(w * .5, w * .16, 0, -w * .06); ctx.closePath();
    ctx.fillStyle = '#8a3422'; ctx.fill();
    for (let k = 1; k < 6; k++) emberLine(ctx, [[0, 0], [w * k / 6, w * (.06 + .2 * Math.sin(k / 6 * Math.PI))]], 'rgba(255,170,110,.35)', .5);
    ctx.beginPath(); ctx.moveTo(0, -w * .3); ctx.bezierCurveTo(w * .46, -w * .56, w * 1.04, -w * .32, w, w * .02); ctx.quadraticCurveTo(w * .5, -w * .02, 0, -w * .04); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 0, w, 0, [[0, '#5a2420'], [.5, '#c45e36'], [.88, '#ffb070'], [1, '#ffe2a8']]); ctx.fill();
    for (const k of [.4, .7]) { ctx.beginPath(); ctx.ellipse(0, -w * .02, w * k, w * k * .44, -.08, -1.25, .05); ctx.strokeStyle = 'rgba(100,30,20,.32)'; ctx.lineWidth = .6; ctx.stroke(); }
    ctx.restore();
  }
  // The fire salamander, basking on a column top above the right-hand pool, its belly lit from below.
  function emberSalamander(ctx, x, y, s, flip) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
    const line = '#7a2618', skin = lin(ctx, 0, -12, 0, 2, [[0, '#c8462a'], [.6, '#e86438'], [1, '#ffa45e']]), spot = '#ffd36a';
    soft(ctx, () => ctx.ellipse(2, 1.5, 22, 2.4, 0, 0, TAU), 'rgba(12,4,10,.55)', 2);
    const tail = [[14, -3], [22, -2], [26, 4], [24, 12], [19, 15]];
    stroke(ctx, tail, line, 6); stroke(ctx, tail, '#d4502e', 4); stroke(ctx, tail.map(([px, py]) => [px + .8, py + .4]), 'rgba(255,170,100,.55)', 1.2);
    for (const [lx, ly, a] of [[-8, 0, -.5], [8, 0, .5]]) { ctx.save(); ctx.translate(lx, ly); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 1.6, 2, 3.4, 0, 0, TAU); ctx.fillStyle = '#b8402a'; ctx.fill(); ctx.restore(); }
    const body = [[-14, -2], [-8, -7.6], [4, -8], [15, -5], [16, -1], [4, .6], [-8, .6]];
    shape(ctx, body, skin, line, 1.1);
    stroke(ctx, [[-8, -.2], [4, 0], [13, -1.2]], 'rgba(255,214,150,.8)', 1.1);
    for (const [sx, sy, sr] of [[-4, -5, 1.6], [3, -6, 1.3], [9, -4.4, 1.2], [21, 0, 1], [24.4, 7, 1]]) dot(ctx, sx, sy, sr, spot);
    const head = [[-24, -3], [-22.4, -9.6], [-15, -12], [-9, -8.6], [-8, -2], [-15, .8], [-21.6, .6]];
    shape(ctx, head, skin, line, 1.1);
    stroke(ctx, [[-22, -.6], [-15, .2], [-9.5, -1.6]], 'rgba(255,214,150,.75)', 1);
    dot(ctx, -13, -10.4, 1.3, spot);
    dot(ctx, -18.4, -6.4, 2.2, '#2a0d0a'); dot(ctx, -19.1, -7.2, .8, '#ffffff');
    ctx.beginPath(); ctx.moveTo(-23, -2.2); ctx.quadraticCurveTo(-19, .2, -15.4, -2.6); ctx.strokeStyle = '#5a160e'; ctx.lineWidth = .9; ctx.stroke();
    dot(ctx, -14.6, -4.4, 1.5, 'rgba(255,200,170,.6)');
    for (const [lx, a] of [[-11, -.3], [6, .4]]) { ctx.save(); ctx.translate(lx, 0); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 1.8, 2.2, 3.6, 0, 0, TAU); ctx.fillStyle = '#e86438'; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = .9; ctx.stroke(); for (const t of [-1.4, 0, 1.4]) dot(ctx, t, 5.2, .7, line); ctx.restore(); }
    ctx.restore();
  }
  // The floor: the worn tops of short columns, a causeway in perspective, dark except where a pool lights it; the
  // gaps run with magma only right beside the lava.
  function emberFloor(ctx) {
    band(ctx, ridge(452, 1.6, 77, 40), 560, lin(ctx, 0, 450, 0, 560, [[0, '#2e1c2c'], [1, '#12080e']]), null);
    const r = rng(707), near = (x, y) => EMBER_POOLS.reduce((m, [px, py, k]) => Math.max(m, k * Math.exp(-((x - px) ** 2 + ((y - py) * 1.6) ** 2) / 7000)), 0);
    let y = 458, h = 3.6;
    for (let row = 0; y < 590; row++) {
      const w = h * 4, step = w * .76;
      for (let k = -1; k * step < 440; k++) {
        if (r() < .05) continue;
        const z = r() < .14 ? -h * (.8 + r() * .8) : (r() - .5) * h * .5, x = k * step + (row % 2) * step * .5 - 6, yy = y + (k % 2 ? h * .55 : 0) + z, heat = near(x, yy);
        const top = [[x - w / 2, yy], [x - w / 4, yy - h], [x + w / 4, yy - h], [x + w / 2, yy], [x + w / 4, yy + h], [x - w / 4, yy + h]];
        const lidC = emberMix(emberMix('#2c2034', '#36283e', r()), '#c06a3c', heat * 1.05);
        poly(ctx, [[x - w / 2, yy], [x - w / 4, yy + h], [x + w / 4, yy + h], [x + w / 2, yy], [x + w / 2, yy + h * 1.7 - z], [x - w / 2, yy + h * 1.7 - z]], emberMix('#140a12', '#62281e', heat));
        poly(ctx, top.map(([px, py]) => [x + (px - x) * .94, yy + (py - yy) * .9]), lin(ctx, 0, yy - h, 0, yy + h, [[0, emberMix(lidC, '#24182c', .3)], [1, lidC]]));
        emberLine(ctx, [[x - w * .44, yy - .2], [x - w * .23, yy - h * .82], [x + w * .2, yy - h * .82]], `rgba(214,196,250,${(.05 + (1 - heat) * .04).toFixed(3)})`, .7);
        if (heat > .5 && r() < (heat - .35) * .8) magma(ctx, [[x - w / 2, yy + h * .1], [x - w / 4, yy + h * 1.05], [x + w / 4, yy + h * 1.05], [x + w / 2, yy + h * .1]].slice(r() < .5 ? 0 : 1, 3 + (r() < .5)), .3 + heat * .2);
      }
      y += h * 1.9; h *= 1.21;
    }
    // The far floor sinks into the haze in the middle of the hall; at the walls it meets the columns in shadow.
    ctx.save(); ctx.translate(210, 452); ctx.scale(1, .2);
    ctx.fillStyle = rad(ctx, 0, 0, 220, [[0, 'rgba(110,56,74,.8)'], [.6, 'rgba(100,50,70,.4)'], [1, 'rgba(100,50,70,0)']]); ctx.fillRect(-220, -220, 440, 440);
    ctx.restore();
    for (const [x, w] of [[30, 90], [390, 90]]) soft(ctx, () => ctx.ellipse(x, 456, w, 7, 0, 0, TAU), 'rgba(16,6,14,.55)', 8);
  }
  // The roof: a vault of basalt whose column ends hang down, short over the middle, long at the walls.
  function emberRoof(ctx) {
    wash(ctx, lin(ctx, 0, -10, 0, 70, [[0, '#120c1e'], [1, 'rgba(18,12,30,0)']]), null, 1, -10, -10, 440, 80);
    const r = rng(303);
    for (const [x0, n, extra] of [[-6, 4, 40], [58, 3, 14], [104, 5, 8], [176, 3, 0], [226, 4, 4], [292, 3, 12], [340, 5, 30]]) {
      let x = x0;
      for (let i = 0; i < n; i++) {
        const w = 13 + r() * 10, d = Math.abs(x - 210) / 210, by = 14 + Math.pow(d, 2.2) * 120 + Math.sin(i / Math.max(1, n - 1) * Math.PI) * extra + r() * 8;
        emberHang(ctx, x, w, by, .14 + d * .26, EMBER_NEAR, .55);
        x += w * .84;
      }
    }
    air(ctx, -10, 200, '40,30,62', .2, 0);
    for (const [x, w, by, g] of [[-6, 36, 176, .42], [24, 30, 132, .4], [50, 24, 96, .36], [72, 20, 70, .3], [92, 18, 50, .26], [120, 16, 34, .2], [304, 16, 40, .22], [328, 20, 58, .28], [352, 24, 84, .34], [380, 30, 122, .4], [410, 36, 160, .44]]) emberHang(ctx, x, w, by, g);
  }
  // A long layer of smoke lying in the hall: a soft wavy band, thicker in the middle, its edges lost.
  function emberSmoke(ctx, y, x0, x1, thick, color, seed, blur = 12) {
    const top = ridge(y, thick * .4, seed, 36, x0, x1), under = ridge(y + thick, thick * .3, seed + 1, 44, x0, x1).reverse();
    const pts = top.map(([x, yy]) => [x, yy + (1 - Math.sin(Math.PI * (x - x0) / (x1 - x0))) * thick * .5]).concat(under.map(([x, yy]) => [x, yy - (1 - Math.sin(Math.PI * Math.max(0, Math.min(1, (x - x0) / (x1 - x0))))) * thick * .5]));
    soft(ctx, () => smooth(ctx, pts, true), color, blur);
  }
  function paintEmber(ctx, framed) {
    // The hollow: cool violet up in the dark, warming through mauve to a smoky rose where the lava light reaches.
    wash(ctx, lin(ctx, 0, 0, 0, 470, [[0, '#1c1832'], [.28, '#2a2042'], [.6, '#462a48'], [.84, '#633544'], [1, '#7c4240']]));
    bloom(ctx, 210, 474, 330, '255,128,80', .26);
    // The far hall: columns standing back into the smoke, stepping down toward the middle.
    const farA = { face: '#3a2a48', side: '#33243f', lid: '#4a3c5e', foot: '#6a3a48' };
    for (const [x, top, w] of [[6, 70, 30], [34, 112, 24], [58, 150, 28], [84, 200, 20], [104, 228, 26], [128, 270, 18], [150, 300, 24], [176, 334, 20], [196, 352, 16], [216, 344, 22], [240, 330, 18], [262, 306, 26], [286, 268, 20], [306, 236, 24], [330, 190, 30], [356, 150, 22], [380, 118, 26], [408, 86, 30]]) emberFar(ctx, x, top, w, 470, farA);
    air(ctx, 20, 470, '118,62,86', 0, .62);
    // Smoke hanging in the hall, holding the glow.
    for (const [y, x0, x1, th, c, sd] of [[118, 60, 300, 12, 'rgba(118,100,168,.14)', 1], [150, 150, 430, 16, 'rgba(118,100,168,.12)', 2], [214, -20, 250, 18, 'rgba(150,104,160,.13)', 3], [262, 170, 440, 22, 'rgba(170,100,130,.14)', 4], [330, -20, 300, 24, 'rgba(196,110,120,.14)', 5], [396, 100, 440, 26, 'rgba(214,120,110,.16)', 6]]) emberSmoke(ctx, y, x0, x1, th, c, sd);
    // The middle distance: shorter columns closing in from both sides.
    const farB = { face: '#3d2944', side: '#312136', lid: '#524266', foot: '#7c403e' };
    for (const [x, top, w] of [[74, 236, 30], [100, 302, 26], [124, 358, 30], [148, 404, 22], [280, 394, 24], [302, 348, 30], [328, 290, 26], [350, 242, 32]]) emberFar(ctx, x, top, w, 472, farB);
    air(ctx, 200, 470, '124,62,78', .1, .42);
    bloom(ctx, 210, 466, 200, '255,150,96', .18);
    emberRoof(ctx);
    // The walls: tall columns into the roof, then steps coming down toward the middle, each warmer than the last.
    for (const [x, top, w, sd] of [[-4, -40, 34, 11], [22, 120, 30, 1], [48, 232, 32, 2], [76, 326, 28, 3], [98, 410, 24, 4]]) emberColumn(ctx, x, top, w, 472, { toward: 1, seed: sd, magmaBelow: 360, chip: sd === 2 });
    for (const [x, top, w, sd, t] of [[426, -40, 36, 12, 0], [398, 92, 32, 5, 0], [372, 210, 30, 6, -.03], [348, 318, 30, 7, 0], [324, 420, 22, 8, .05]]) emberColumn(ctx, x, top, w, 472, { toward: -1, seed: sd, tilt: t, magmaBelow: 380, chip: sd === 6 });
    // A crack in the left wall bleeds a thread of lava down into the pool.
    const fall = [[29, 412], [30, 436], [28, 458], [31, 480], [38, 498]];
    bloom(ctx, 30, 460, 54, '255,120,50', .32);
    for (const [w, c] of [[9, 'rgba(255,110,50,.16)'], [4.4, '#c8481c'], [2.8, '#ff9338'], [1.1, '#ffe8a8']]) stroke(ctx, fall, c, w);
    magma(ctx, [[17, 416], [24, 411], [30, 412], [36, 409]], .75);
    // Bracket fungi on the left wall, the salamander basking on the right.
    for (const [x, y, w] of [[34, 352, 13], [34, 338, 9], [62, 404, 11]]) emberBracket(ctx, x, y, w, false);
    emberSalamander(ctx, 350, 318, 1.05, false);
    // The floor, the launch stone and the lava pools.
    emberFloor(ctx);
    soft(ctx, () => ctx.ellipse(210, 520, 80, 22, 0, 0, TAU), 'rgba(14,4,12,.6)', 10);
    const dais = [[148, 504], [180, 484], [240, 484], [272, 504], [240, 524], [180, 524]];
    poly(ctx, [[148, 504], [180, 524], [240, 524], [272, 504], [272, 520], [240, 542], [180, 542], [148, 520]], lin(ctx, 148, 0, 272, 0, [[0, '#6a3028'], [.35, '#3a1a24'], [.7, '#3a1a24'], [1, '#5a2a26']]));
    wash(ctx, lin(ctx, 0, 506, 0, 542, [[0, 'rgba(14,4,10,0)'], [1, 'rgba(14,4,10,.6)']]), null, 1, 148, 506, 124, 36);
    poly(ctx, dais, lin(ctx, 148, 0, 272, 0, [[0, '#7a4a48'], [.3, '#4e3446'], [.7, '#4e3446'], [1, '#6a4246']]));
    clipTo(ctx, dais, () => {
      soft(ctx, () => ctx.ellipse(210, 490, 56, 9, 0, 0, TAU), 'rgba(160,150,214,.16)', 8);
    });
    emberLine(ctx, [[149, 504], [180, 523.4], [240, 523.4], [271, 504]], 'rgba(255,186,150,.38)', 1);
    emberLine(ctx, [[149, 503.6], [180, 484.6], [240, 484.6], [271, 503.6]], 'rgba(220,206,255,.16)', .9);
    for (const [x, y, rx, ry, sd] of [[EMBER_POOLS[0][0], EMBER_POOLS[0][1], 60, 15, 21], [EMBER_POOLS[1][0], EMBER_POOLS[1][1], 40, 10, 31]]) {
      bloom(ctx, x, y - 8, rx * 2.4, '255,112,44', .34);
      emberPool(ctx, x, y, rx, ry, sd);
    }
    for (const [x, y, w, h, t] of [[132, 530, 4.6, 12, .3], [142, 534, 3.4, 8, -.2], [318, 550, 4.4, 10, -.3], [404, 520, 6, 20, .22], [394, 526, 4.2, 12, -.32], [10, 566, 12, 44, .12], [30, 566, 8, 26, .42], [-4, 560, 9, 30, -.2]]) emberShard(ctx, x, y, w, h, t);
    // The lava's light rising up the walls, and embers riding it.
    for (const [x, a, len, al] of [[66, -1.5, 330, .08], [96, -1.68, 240, .05], [372, -1.66, 300, .06]]) shaft(ctx, x, 516, a, len, 20, 46, '255,140,80', al);
    emberDrift(ctx, [66, 510], [20, 380], [44, 140], 30, 11, 36);
    emberDrift(ctx, [372, 524], [410, 400], [386, 200], 22, 12, 30);
    emberDrift(ctx, [104, 520], [136, 476], [116, 440], 6, 13, 26);
    // Foreground: a broken stump in the lower right corner, almost in silhouette.
    emberColumn(ctx, 408, 478, 58, 600, { pal: EMBER_FORE, toward: -1, seed: 9, tilt: .1, heat: .8 });
    grade(ctx, 'rgba(110,104,200,.5)', 'rgba(255,140,80,.45)', 'rgba(24,8,26,.6)');
    grain(ctx, .08);
    if (framed) frame(ctx, '#a5503a', '#ffb27a');
  }

  // ---------- Level 8: Geode Mine ----------
  // An old drift running back into the hill on sets of timber. Two lanterns hung at its mouth are the light: warm on
  // the near timbers and the floor, falling away down the tunnel into violet dark, where geodes in the walls glow cool
  // from within. The minecart and its mouse wait on the cross-track; a cobweb fills the corner nobody sweeps.
  // (The colour helpers emberMix and emberLine come from the Ember Hollows section above.)
  const GEODE_VP = [222, 298];
  const geodeAt = (x, y, k) => [GEODE_VP[0] + (x - GEODE_VP[0]) * k, GEODE_VP[1] + (y - GEODE_VP[1]) * k];
  const GEODE_LAMPS = [[58, 132], [362, 116]];
  const geodeLamp = (x, y) => Math.min(1, GEODE_LAMPS.reduce((m, [lx, ly]) => m + Math.exp(-((x - lx) ** 2 + (y - ly) ** 2) / 12000), 0));
  const GEODE_WOOD = { lit: '#e09c5c', mid: '#8e5a36', shade: '#4a2e26', dark: '#2e1e1c' };
  // A squared beam along a centre line, wide w0 at its start and w1 at its end, modelled across its width toward the
  // lit side (+1 or -1 along the normal), with grain running its length, a knot, and the lit arris picked out.
  function geodeBeam(ctx, x0, y0, x1, y1, w0, w1, side, seed, o = {}) {
    const pal = o.pal || GEODE_WOOD, fog = o.fog || 0, tint = c => fog ? emberMix(c, o.haze || '#2a2244', fog) : c;
    const len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len, r = rng(seed);
    const q = [[x0 + nx * w0 / 2, y0 + ny * w0 / 2], [x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x1 - nx * w1 / 2, y1 - ny * w1 / 2], [x0 - nx * w0 / 2, y0 - ny * w0 / 2]];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, wm = (w0 + w1) / 4;
    const warm = o.warm ?? .5, lit = emberMix(pal.mid, pal.lit, warm);
    poly(ctx, q, lin(ctx, mx + nx * wm * side, my + ny * wm * side, mx - nx * wm * side, my - ny * wm * side, [[0, tint(lit)], [.4, tint(pal.mid)], [1, tint(pal.shade)]]));
    if (fog > .7) return q;
    ctx.save(); ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (const p of q.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.clip();
    for (let i = 0; i < (o.grain ?? 7); i++) {
      const off = (r() - .5) * .86, t0 = r() * .5, t1 = t0 + .25 + r() * .5, w = w0 + (w1 - w0) * t0;
      const p = t => [x0 + (x1 - x0) * t + nx * off * w, y0 + (y1 - y0) * t + ny * off * w];
      stroke(ctx, [p(t0), p((t0 + t1) / 2).map((v, k) => v + (k ? ny : nx) * (r() - .5) * 2), p(t1)], i % 3 ? `rgba(40,20,14,${(.3 * (1 - fog)).toFixed(3)})` : `rgba(255,220,170,${(.18 * (1 - fog)).toFixed(3)})`, .7 + r() * .7);
    }
    if (o.dim) { ctx.fillStyle = lin(ctx, x0, y0, x1, y1, o.dim.map(([at, a]) => [at, `rgba(18,10,24,${a})`])); ctx.fillRect(Math.min(x0, x1) - 40, Math.min(y0, y1) - 40, Math.abs(x1 - x0) + 80, Math.abs(y1 - y0) + 80); }
    if (!o.noKnot && fog < .4) {
      const t = .25 + r() * .5, w = w0 + (w1 - w0) * t, kx = x0 + (x1 - x0) * t + nx * (r() - .5) * w * .4, ky = y0 + (y1 - y0) * t + ny * (r() - .5) * w * .4, a = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath(); ctx.ellipse(kx, ky, w * .13, w * .06, a, 0, TAU); ctx.fillStyle = 'rgba(46,24,16,.4)'; ctx.fill();
      for (const k of [1.6, 2.4]) { ctx.beginPath(); ctx.ellipse(kx, ky, w * .13 * k * 1.4, w * .06 * k, a, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = 'rgba(46,24,16,.22)'; ctx.lineWidth = .7; ctx.stroke(); }
    }
    ctx.restore();
    const e = side > 0 ? [q[0], q[1]] : [q[3], q[2]];
    emberLine(ctx, e.map(([px, py]) => [px - nx * side * .6, py - ny * side * .6]), `rgba(255,226,180,${(.45 * warm * (1 - fog)).toFixed(3)})`, 1);
    return q;
  }
  // An iron strap across a joint: a dark plate catching the lantern light along its top edge, with its rivets.
  function geodeStrap(ctx, pts, warm = .5) {
    soft(ctx, () => { ctx.moveTo(pts[0][0] + 1, pts[0][1] + 2); for (const [x, y] of pts.slice(1)) ctx.lineTo(x + 1, y + 2); ctx.closePath(); }, 'rgba(10,6,14,.5)', 2);
    poly(ctx, pts, lin(ctx, 0, pts[0][1], 0, pts[2][1], [[0, emberMix('#3a3240', '#6a5a58', warm)], [1, '#1e1a24']]));
    emberLine(ctx, [[pts[0][0] + .6, pts[0][1] + .6], [pts[1][0] - .6, pts[1][1] + .6]], `rgba(255,214,170,${(.2 + warm * .35).toFixed(3)})`, .8);
    const [cx, cy] = pts.reduce(([a, b], [x, y]) => [a + x / pts.length, b + y / pts.length], [0, 0]);
    for (const [px, py] of pts) { const x = cx + (px - cx) * .62, y = cy + (py - cy) * .5; dot(ctx, x, y, 1.3, '#16121c'); dot(ctx, x - .4, y - .4, .55, `rgba(255,230,200,${(.3 + warm * .4).toFixed(3)})`); }
  }
  // An amethyst point: a six-sided crystal lit from inside, pale at the tip, deep violet at the root.
  function geodePoint(ctx, x, y, w, h, tilt, glow = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    const body = [[-w / 2, 0], [-w / 2, -h * .68], [0, -h], [w / 2, -h * .68], [w / 2, 0]];
    poly(ctx, body, lin(ctx, 0, -h, 0, 0, [[0, '#c9a6ff'], [1, '#4a2a8a']]));
    poly(ctx, [[-w / 2, 0], [-w / 2, -h * .68], [0, -h], [-w * .08, 0]], lin(ctx, 0, -h, 0, 0, [[0, emberMix('#b48ae8', '#f4e6ff', glow)], [.6, '#9a6ae0'], [1, '#5a34a0']]));
    poly(ctx, [[w * .14, 0], [w * .14, -h * .82], [w / 2, -h * .68], [w / 2, 0]], 'rgba(30,14,70,.42)');
    emberLine(ctx, [[-w / 2 + .6, -h * .66], [0, -h + .8]], `rgba(255,248,255,${(.4 + glow * .4).toFixed(3)})`, .8);
    ctx.restore();
  }
  function geodeCluster(ctx, x, y, s, seed, n = 5, glow = 1) {
    const r = rng(seed), pts = [];
    for (let i = 0; i < n; i++) { const t = n === 1 ? .5 : i / (n - 1), big = Math.sin(t * Math.PI); pts.push([x + (t - .5) * s * 1.6 + (r() - .5) * s * .2, (t - .5) * 1.1 + (r() - .5) * .3, s * (.22 + big * .14), s * (.5 + big * .7 + r() * .3)]); }
    soft(ctx, () => ctx.ellipse(x, y + 1, s * 1.1, s * .2, 0, 0, TAU), 'rgba(14,8,26,.5)', 3);
    bloom(ctx, x, y - s * .6, s * 2.2, '176,130,255', .22 * glow);
    pts.sort((a, b) => a[3] - b[3]).forEach(([px, a, w, h]) => geodePoint(ctx, px, y, w, h, a * .7, glow));
  }
  // A geode broken open in the rock: a rough rind, a pale agate band, and a jagged mouth packed with amethyst that
  // glows from the hollow at its heart.
  function geodeHollow(ctx, x, y, rx, ry, seed, tilt = 0, glow = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    const r = rng(seed), rind = blob(0, 0, rx, ry, seed, .12, 12);
    bloom(ctx, 0, 0, rx * 2.4, '170,120,255', .16 * glow);
    soft(ctx, () => smooth(ctx, rind.map(([px, py]) => [px + 1.5, py + 2.5]), true), 'rgba(12,6,22,.55)', 4);
    shape(ctx, rind, lin(ctx, -rx, -ry, rx, ry, [[0, '#8a7a8c'], [.5, '#5e4e68'], [1, '#3a2e48']]), null);
    for (let i = 0; i < 8; i++) { const a = r() * TAU, k = .8 + r() * .14; dot(ctx, Math.cos(a) * rx * k, Math.sin(a) * ry * k, .6 + r() * .8, 'rgba(30,20,44,.4)'); }
    const mouth = [], n = 18, ox = -rx * .06, oy = -ry * .04;
    for (let i = 0; i < n; i++) { const a = i / n * TAU, k = (i % 2 ? .6 : .72) + (r() - .5) * .1; mouth.push([ox + Math.cos(a) * rx * k, oy + Math.sin(a) * ry * k]); }
    poly(ctx, mouth.map(([px, py]) => [ox + (px - ox) * 1.14, oy + (py - oy) * 1.14]), lin(ctx, 0, -ry, 0, ry, [[0, '#f2e6f8'], [1, '#a890c0']]));
    poly(ctx, mouth, rad(ctx, ox, oy + ry * .1, rx * .7, [[0, emberMix('#5a34a0', '#d8c0ff', glow)], [.45, '#5e3aa8'], [1, '#26124e']]));
    ctx.save(); ctx.beginPath(); ctx.moveTo(mouth[0][0], mouth[0][1]); for (const p of mouth.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.clip();
    for (let i = 0; i < n; i++) {
      const [px, py] = mouth[i], [qx, qy] = mouth[(i + 1) % n], len = .22 + r() * .34, tx = px + (ox - px) * len + (r() - .5) * 2, ty = py + (oy - py) * len + (r() - .5) * 2;
      const tone = .15 + r() * .55 + (py > oy ? .2 : 0), c = emberMix('#3a1e74', '#c8a8f8', tone);
      poly(ctx, [[px, py], [tx, ty], [qx, qy]], c);
      poly(ctx, [[px, py], [tx, ty], [(px + qx) / 2, (py + qy) / 2]], emberMix(c, '#1e0c40', .35));
    }
    for (let i = 0; i < 3; i++) { const a = r() * TAU, d = r() * .25; geodeGlint(ctx, ox + Math.cos(a) * rx * d, oy + Math.sin(a) * ry * d + ry * .1, 1.6 + r() * 1.4); }
    ctx.restore();
    bloom(ctx, ox, oy + ry * .1, rx * .45, '230,210,255', .26 * glow);
    ctx.restore();
  }
  function geodeGlint(ctx, x, y, s) { poly(ctx, [[x - s * .6, y], [x, y - s], [x + s * .6, y], [x, y + s * .5]], 'rgba(236,224,255,.75)'); }
  // A miner's lantern: a dark iron frame round warm glass and a steady flame, its light pooled about it.
  function geodeLantern(ctx, x, y) {
    bloom(ctx, x, y + 22, 150, '255,186,100', .34);
    bloom(ctx, x, y + 22, 48, '255,220,150', .5);
    emberLine(ctx, [[x, y - 10], [x, y + 4]], '#2a2230', 1.2);
    ctx.beginPath(); ctx.arc(x, y + 6, 3, 0, TAU); ctx.strokeStyle = '#3a3040'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 7, y + 14); ctx.quadraticCurveTo(x, y + 6, x + 7, y + 14); ctx.closePath(); ctx.fillStyle = lin(ctx, x - 7, 0, x + 7, 0, [[0, '#5a4e5a'], [1, '#2a2230']]); ctx.fill();
    poly(ctx, [[x - 8, y + 14], [x + 8, y + 14], [x + 9, y + 17], [x - 9, y + 17]], '#3a3040');
    poly(ctx, [[x - 7, y + 17], [x + 7, y + 17], [x + 6, y + 35], [x - 6, y + 35]], lin(ctx, x - 7, 0, x + 7, 0, [[0, '#ffe0a0'], [.5, '#fff3cc'], [1, '#ffbe6a']]));
    ctx.beginPath(); ctx.ellipse(x, y + 26, 2.4, 5, 0, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + 27.5, 1.6, 3, 0, 0, TAU); ctx.fillStyle = '#ffb347'; ctx.fill();
    for (const k of [-1, 1]) emberLine(ctx, [[x + k * 7, y + 17], [x + k * 6, y + 35]], '#2e2634', 1.5);
    emberLine(ctx, [[x, y + 17], [x, y + 35]], 'rgba(46,38,52,.55)', .9);
    poly(ctx, [[x - 8.5, y + 35], [x + 8.5, y + 35], [x + 6.5, y + 39], [x - 6.5, y + 39]], '#3a3040');
    emberLine(ctx, [[x - 4.4, y + 19], [x - 4, y + 32]], 'rgba(255,255,255,.75)', .9);
  }
  // The mouse, peeking over the rim of the cart.
  function geodeMouse(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const line = '#6a4e5a';
    for (const ex of [-7, 7]) { dot(ctx, ex, -10, 5.6, '#c4b0b8'); ctx.beginPath(); ctx.arc(ex, -10, 5.6, 0, TAU); ctx.strokeStyle = line; ctx.lineWidth = .9; ctx.stroke(); dot(ctx, ex, -9.6, 3.4, '#f4b0c0'); }
    const head = [[-8, 0], [-8.6, -6], [-4, -10], [4, -10], [8.6, -6], [8, 0], [0, 2]];
    shape(ctx, head, lin(ctx, -6, -10, 6, 2, [[0, '#e2d2d6'], [1, '#a8949e']]), line, 1);
    dot(ctx, -3.2, -4.4, 1.4, '#2a1a24'); dot(ctx, 3.2, -4.4, 1.4, '#2a1a24'); dot(ctx, -3.6, -4.9, .5, '#ffffff'); dot(ctx, 2.8, -4.9, .5, '#ffffff');
    dot(ctx, 0, -1.6, 1.4, '#e98a9c');
    for (const k of [-1, 1]) for (const d of [-1, 1]) stroke(ctx, [[k * 2.6, -1 + d * .6], [k * 9, -2 + d * 1.6]], 'rgba(90,70,80,.55)', .5);
    dot(ctx, -6, -2, 1.4, 'rgba(240,140,160,.45)'); dot(ctx, 6, -2, 1.4, 'rgba(240,140,160,.45)');
    for (const px of [-5, 5]) { ctx.beginPath(); ctx.ellipse(px, 2.6, 2.2, 1.6, 0, 0, TAU); ctx.fillStyle = '#f4b2c0'; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = .7; ctx.stroke(); }
    ctx.restore();
  }
  // The minecart: a riveted iron tub heaped with amethyst, the lantern light along its rolled rim.
  function geodeCart(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    soft(ctx, () => ctx.ellipse(0, 8, 50, 6, 0, 0, TAU), 'rgba(10,6,18,.6)', 5);
    geodeHollow(ctx, -26, -36, 11, 9, 44, -.4, .8);
    geodeCluster(ctx, -6, -32, 16, 41, 5, .9);
    geodePoint(ctx, 30, -32, 9, 20, .5, .8);
    geodeMouse(ctx, 14, -38, 1.15);
    const body = [[-44, -34], [44, -34], [36, 4], [-36, 4]];
    poly(ctx, body, lin(ctx, -44, -34, 30, 10, [[0, '#8a7c88'], [.45, '#5a5068'], [1, '#2e2838']]));
    clipTo(ctx, body, () => {
      for (const [bx, w] of [[-30, 5], [0, 5], [30, 5]]) poly(ctx, [[bx - w / 2, -34], [bx + w / 2, -34], [bx * .86 + w / 2, 4], [bx * .86 - w / 2, 4]], 'rgba(20,14,30,.28)');
      for (const [cx, cy, rr] of [[-24, -10, 6], [20, -20, 5], [8, -4, 4]]) soft(ctx, () => ctx.ellipse(cx, cy, rr * 1.6, rr, .3, 0, TAU), 'rgba(150,70,40,.3)', 4);
      wash(ctx, lin(ctx, 0, -34, 0, 4, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,6,20,.45)']]), null, 1, -50, -34, 100, 40);
    });
    for (const [bx, by] of [[-38, -28], [38, -28], [-33, -2], [33, -2], [-4, -28], [4, -28], [-4, -4], [4, -4]]) { dot(ctx, bx, by, 1.4, '#221c2a'); dot(ctx, bx - .4, by - .4, .6, 'rgba(255,220,190,.55)'); }
    poly(ctx, [[-47, -37], [47, -37], [47, -32], [-47, -32]], lin(ctx, 0, -37, 0, -32, [[0, '#c4aa98'], [1, '#4a4058']]));
    for (const wx of [-24, 24]) {
      dot(ctx, wx, 6, 8.4, '#221c2c');
      ctx.beginPath(); ctx.arc(wx, 6, 6.6, 3.4, 5.2); ctx.strokeStyle = 'rgba(220,190,170,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
      dot(ctx, wx, 6, 2.6, '#5a5068'); dot(ctx, wx - .6, 5.2, .9, 'rgba(255,230,200,.6)');
    }
    ctx.restore();
  }
  function geodePick(ctx, x, y, len, angle) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    soft(ctx, () => ctx.rect(-1, -len, 6, len), 'rgba(10,6,18,.4)', 3);
    poly(ctx, [[-2.4, 0], [2.4, 0], [2, -len], [-2, -len]], lin(ctx, -2.4, 0, 2.4, 0, [[0, '#e8b47a'], [.5, '#a06a40'], [1, '#5a3a26']]));
    emberLine(ctx, [[-.8, -4], [-.8, -len + 6]], 'rgba(255,236,200,.5)', .8);
    ctx.beginPath(); ctx.moveTo(-24, -len + 10); ctx.quadraticCurveTo(-10, -len - 6, 0, -len - 4); ctx.quadraticCurveTo(10, -len - 6, 24, -len + 10); ctx.quadraticCurveTo(10, -len - 1, 0, -len + 3); ctx.quadraticCurveTo(-10, -len - 1, -24, -len + 10); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -len - 6, 0, -len + 6, [[0, '#c8c0d0'], [1, '#4a4458']]); ctx.fill();
    stroke(ctx, [[-18, -len + 4], [-8, -len - 3], [0, -len - 2.4]], 'rgba(255,250,240,.7)', .9);
    poly(ctx, [[-4, -len - 5], [4, -len - 5], [4, -len + 5], [-4, -len + 5]], '#3a3448');
    ctx.restore();
  }
  // A cobweb strung in a corner: spokes and sagging rings, catching the lantern light.
  function geodeWeb(ctx, x, y, r, a0, a1, seed) {
    const rr = rng(seed), spokes = [];
    for (let i = 0; i <= 6; i++) spokes.push(a0 + (a1 - a0) * i / 6 + (i % 6 ? (rr() - .5) * .12 : 0));
    ctx.save(); ctx.lineCap = 'round';
    for (const a of spokes) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.strokeStyle = 'rgba(255,236,214,.34)'; ctx.lineWidth = .5; ctx.stroke(); }
    for (let k = 1; k <= 5; k++) {
      ctx.beginPath();
      spokes.forEach((a, i) => { const d = r * (k / 5.6) * (.92 + rr() * .1), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (!i) ctx.moveTo(px, py); else { const m = (a + spokes[i - 1]) / 2; ctx.quadraticCurveTo(x + Math.cos(m) * d * .84, y + Math.sin(m) * d * .84, px, py); } });
      ctx.strokeStyle = `rgba(255,236,214,${(.36 - k * .03).toFixed(3)})`; ctx.lineWidth = .5; ctx.stroke();
    }
    ctx.restore();
  }
  function paintGeode(ctx, framed) {
    const F = .17, A = geodeAt;
    // The drift: ceiling, walls and floor running back to a far end lost in violet dark.
    wash(ctx, '#1c1630');
    const near = [44, 50, 376, 466], [l, t, rr, b] = near;
    const surf = (pts, g) => poly(ctx, pts, g);
    surf([A(l, t, 1), A(rr, t, 1), A(rr, t, F), A(l, t, F)], lin(ctx, 0, t, 0, A(0, t, F)[1], [[0, '#4a3650'], [.5, '#33264a'], [1, '#221a38']]));
    surf([A(l, t, 1), A(l, t, F), A(l, b, F), A(l, b, 1)], lin(ctx, l, 0, A(l, 0, F)[0], 0, [[0, '#4e3c62'], [.55, '#352a50'], [1, '#241c3c']]));
    surf([A(rr, t, 1), A(rr, t, F), A(rr, b, F), A(rr, b, 1)], lin(ctx, rr, 0, A(rr, 0, F)[0], 0, [[0, '#4a3a60'], [.55, '#33284e'], [1, '#241c3c']]));
    surf([A(l, b, 1), A(rr, b, 1), A(rr, b, F), A(l, b, F)], lin(ctx, 0, b, 0, A(0, b, F)[1], [[0, '#4a3848'], [.6, '#33284a'], [1, '#261e3e']]));
    // The rock: bedding lines running back toward the far end, and broad soft facets.
    const r = rng(808);
    for (const [wall, x0, x1] of [[[A(l, t, 1), A(l, t, F), A(l, b, F), A(l, b, 1)], l, 1], [[A(rr, t, 1), A(rr, t, F), A(rr, b, F), A(rr, b, 1)], rr, 1]]) {
      void x1;
      clipTo(ctx, wall, () => {
        for (let i = 0; i < 7; i++) { const yy = t + 20 + r() * (b - t - 40), k1 = .3 + r() * .5; emberLine(ctx, [A(x0, yy, 1), A(x0, yy + (r() - .5) * 30, k1)], i % 2 ? 'rgba(14,8,26,.35)' : 'rgba(200,180,240,.1)', 1 + r()); }
        for (let i = 0; i < 6; i++) { const k = .35 + r() * .6, [fx, fy] = A(x0, t + 30 + r() * (b - t - 60), k); soft(ctx, () => ctx.ellipse(fx, fy, 30 * k, 50 * k, 0, 0, TAU), i % 2 ? 'rgba(16,10,30,.3)' : 'rgba(150,130,200,.1)', 14 * k); }
      });
    }
    clipTo(ctx, [A(l, t, 1), A(rr, t, 1), A(rr, t, F), A(l, t, F)], () => { for (let i = 0; i < 6; i++) { const xx = l + 20 + r() * (rr - l - 40), k1 = .3 + r() * .5; emberLine(ctx, [A(xx, t, 1), A(xx + (r() - .5) * 40, t, k1)], 'rgba(14,8,26,.3)', 1 + r() * 1.4); } });
    // The far end, and a lantern burning a long way down the drift.
    const [fx0, fy0] = A(l, t, F), [fx1, fy1] = A(rr, b, F);
    poly(ctx, [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]], lin(ctx, 0, fy0, 0, fy1, [[0, '#1a1430'], [1, '#2a1e3a']]));
    bloom(ctx, 214, 302, 46, '255,180,110', .22);
    dot(ctx, 214, 302, 1.6, 'rgba(255,214,160,.7)');
    // The track runs back down the drift from the turntable, on sleepers spaced in perspective.
    for (let z = 1; z < 7; z += .55 + z * .12) { const k = 1 / z; if (k < F + .02) break; const [sx0, sy] = A(186, b + 4, k), [sx1] = A(234, b + 4, k); poly(ctx, [[sx0, sy - 1.6 * k], [sx1, sy - 1.6 * k], [sx1, sy + 1.6 * k], [sx0, sy + 1.6 * k]], `rgba(30,18,26,${(.25 + k * .3).toFixed(3)})`); }
    for (const x of [194, 226]) { const [nx0, ny0] = A(x, b + 30, 1), [nx1, ny1] = A(x, b + 4, F + .02); ctx.beginPath(); ctx.moveTo(nx0, ny0); ctx.lineTo(nx1, ny1); ctx.strokeStyle = lin(ctx, 0, ny0, 0, ny1, [[0, 'rgba(210,190,220,.4)'], [1, 'rgba(210,190,220,0)']]); ctx.lineWidth = 1.2; ctx.stroke(); }
    // Older sets of timber, each further one dimmer, one of them sagging.
    for (const [k, sag, cap] of [[.3, 0, true], [.44, 2.4, true], [.64, -1.2, true]]) {
      const fog = Math.min(.92, (1 - k) * 1.5 + .12), haze = '#2a2246', warm = .1 + k * .2, W = 32 * k;
      const [lx0] = A(12, 0, k), [lx1] = A(44, 0, k), [rx0] = A(376, 0, k), [rx1] = A(408, 0, k), [, cy0] = A(0, 20, k), [, cy1] = A(0, 50, k), [, fy] = A(0, 470, k);
      soft(ctx, () => { ctx.rect(lx0 - 2, cy0, rx1 - lx0 + 4, (cy1 - cy0) + 4); ctx.rect(lx0 - 2, cy0, lx1 - lx0 + 4, fy - cy0); ctx.rect(rx0 - 2, cy0, rx1 - rx0 + 4, fy - cy0); }, `rgba(10,6,20,${(.5 * k).toFixed(3)})`, 8 * k);
      geodeBeam(ctx, (lx0 + lx1) / 2, fy, (lx0 + lx1) / 2 + sag * 4, cy0, W, W, -1, 10 + k * 100, { fog, haze, warm, grain: 3 });
      geodeBeam(ctx, (rx0 + rx1) / 2, fy, (rx0 + rx1) / 2, cy0, W, W, 1, 20 + k * 100, { fog, haze, warm, grain: 3 });
      if (cap) geodeBeam(ctx, lx0 - 6 * k, (cy0 + cy1) / 2 + sag, rx1 + 6 * k, (cy0 + cy1) / 2 - sag, (cy1 - cy0), (cy1 - cy0), 1, 30 + k * 100, { fog, haze, warm, grain: 3 });
      else { geodeBeam(ctx, lx0 - 4 * k, (cy0 + cy1) / 2, lx1 + 40 * k, (cy0 + cy1) / 2 + 3, cy1 - cy0, (cy1 - cy0) * .9, 1, 31, { fog, haze, warm, grain: 3 }); geodeBeam(ctx, rx1 + 4 * k, (cy0 + cy1) / 2, rx0 - 60 * k, (cy0 + cy1) / 2 + 6 * k, cy1 - cy0, (cy1 - cy0) * .9, 1, 32, { fog, haze, warm, grain: 3 }); }
    }
    // Air down the drift: violet haze thickest toward the far end.
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    wash(ctx, rad(ctx, GEODE_VP[0], GEODE_VP[1], 230, [[0, 'rgba(44,34,74,.55)'], [.45, 'rgba(44,34,74,.25)'], [1, 'rgba(44,34,74,0)']]));
    ctx.restore();
    // Geodes in the walls just inside the mouth, half behind the posts, and amethyst breaking out of the rock.
    geodeHollow(ctx, 70, 250, 22, 30, 51, .1, 1);
    geodeHollow(ctx, 352, 196, 16, 22, 52, -.1, .9);
    geodeHollow(ctx, 362, 372, 12, 16, 53, .15, .8);
    geodeCluster(ctx, 66, 402, 14, 61, 5, .9);
    geodeCluster(ctx, 352, 300, 11, 62, 4, .8);
    // The lanterns' light on the near walls, ceiling and floor.
    for (const [x, y] of GEODE_LAMPS) { bloom(ctx, x + (x < 210 ? 20 : -20), y + 20, 190, '255,166,92', .2); bloom(ctx, x, y + 120, 130, '255,166,92', .1); }
    // The near set: two posts, the cap and its knee braces, strapped with iron.
    soft(ctx, () => { ctx.rect(-10, 14, 440, 42); ctx.rect(8, 40, 42, 440); ctx.rect(370, 40, 42, 440); }, 'rgba(8,4,16,.55)', 10);
    const posts = [[12, 44, 1, 2], [376, 408, -1, 3]];
    for (const [x0, x1, s] of posts) {
      const inner = s > 0 ? x1 : x0, [bx] = A(inner, 0, .95), [, by0] = A(0, 50, .95), [, by1] = A(0, 470, .95);
      poly(ctx, [[inner, 50], [bx, by0], [bx, by1], [inner, 470]], lin(ctx, 0, 60, 0, 470, [[0, '#a06a44'], [.3, '#6a4430'], [1, '#2a1c1e']]));
    }
    // The knee braces go in first so the posts and cap cover their cut ends.
    for (const [ax, ay, bx2, by2, sd] of [[44, 140, 124, 50, 4], [376, 172, 290, 50, 5]]) {
      soft(ctx, () => { ctx.moveTo(ax, ay + 8); ctx.lineTo(bx2, by2 + 8); ctx.lineTo(bx2 + (ax < 210 ? 14 : -14), by2 + 8); ctx.lineTo(ax, ay + 24); ctx.closePath(); }, 'rgba(8,4,16,.45)', 6);
      geodeBeam(ctx, ax + (ax < 210 ? -14 : 14), ay + 10, bx2 + (ax < 210 ? 8 : -8), by2 - 12, 18, 18, ax < 210 ? -1 : 1, sd, { warm: .9, grain: 5, dim: [[0, .1], [.35, 0], [1, .35]] });
    }
    for (const [x0, x1, s, sd] of posts) geodeBeam(ctx, (x0 + x1) / 2, 472, (x0 + x1) / 2, 46, 32, 32, s, sd, { warm: .75, dim: [[0, .62], [.45, .3], [.82, 0], [1, .12]] });
    poly(ctx, [[44, 50], [376, 50], A(376, 50, .95), A(44, 50, .95)], lin(ctx, 0, 50, 0, 62, [[0, '#b07a4e'], [1, '#6a4430']]));
    geodeBeam(ctx, -10, 35, 430, 35, 30, 30, -1, 1, { warm: .6, dim: [[0, .3], [.17, 0], [.5, .4], [.83, 0], [1, .3]] });
    for (const pts of [[[24, 44], [46, 44], [46, 60], [24, 60]], [[374, 44], [396, 44], [396, 60], [374, 60]]]) geodeStrap(ctx, pts, .55);
    for (const pts of [[[12, 146], [46, 146], [46, 156], [12, 156]], [[374, 178], [408, 178], [408, 188], [374, 188]]]) geodeStrap(ctx, pts, .5);
    // A cobweb in the top left corner, its spider let down on a thread.
    geodeWeb(ctx, 45, 51, 52, 0, Math.PI / 2, 7);
    const [sx, sy] = [84, 84];
    emberLine(ctx, [[sx, 60], [sx, sy - 4]], 'rgba(255,236,214,.32)', .5);
    dot(ctx, sx, sy, 2.6, '#2a2032'); dot(ctx, sx, sy - 3.4, 1.8, '#2a2032');
    for (const k of [-1, 1]) for (const d of [-1, 0, 1]) stroke(ctx, [[sx, sy], [sx + k * 3.4, sy - 1 + d * 2], [sx + k * 4.6, sy + 1 + d * 2.4]], '#2a2032', .6);
    dot(ctx, sx - .8, sy - 3.8, .5, '#ffffff'); dot(ctx, sx + .8, sy - 3.8, .5, '#ffffff');
    // The lanterns, hung from the cap near each post.
    for (const [x, y] of GEODE_LAMPS) {
      const post = x < 210 ? 44 : 376, d = x < 210 ? 1 : -1, ay = y - 38;
      poly(ctx, [[post - d * 2, ay - 4], [post + d * 1.5, ay - 4], [post + d * 1.5, ay + 6], [post - d * 2, ay + 6]], '#241e2a');
      emberLine(ctx, [[post, ay - 1], [x, ay - 1], [x + d * 3, ay - 3.4]], '#2a2430', 2.2);
      emberLine(ctx, [[post, ay - 1.8], [x, ay - 1.8]], 'rgba(255,214,170,.45)', .7);
      ctx.beginPath(); ctx.moveTo(post, ay + 12); ctx.quadraticCurveTo(post + d * (x - post) * d * .2, ay + 2, x - d * 2, ay - .5); ctx.strokeStyle = '#2a2430'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.beginPath(); ctx.arc(post + d * 6, ay + 4.5, 2.6, 0, TAU); ctx.strokeStyle = '#2a2430'; ctx.lineWidth = 1; ctx.stroke();
      geodeLantern(ctx, x, y - 26);
    }
    // A coil of rope hung on a spike in the right post.
    dot(ctx, 392, 290, 2, '#221c2a');
    for (const [rx, ry, a] of [[10, 13, 0], [8.6, 11.4, .1], [7.2, 10, -.05]]) { ctx.beginPath(); ctx.ellipse(392 + a * 10, 304, rx, ry, a, 0, TAU); ctx.strokeStyle = '#5a3e2a'; ctx.lineWidth = 3.4; ctx.stroke(); ctx.strokeStyle = '#d2b07c'; ctx.lineWidth = 2; ctx.stroke(); }
    stroke(ctx, [[386, 316], [384, 330], [388, 344]], '#5a3e2a', 3.4); stroke(ctx, [[386, 316], [384, 330], [388, 344]], '#d2b07c', 2);
    // The gallery floor across the front, the cross-track and the turntable under the launcher.
    band(ctx, ridge(468, 1.6, 91, 40), 560, lin(ctx, 0, 466, 0, 560, [[0, '#4a3646'], [.5, '#33263e'], [1, '#1c1428']]), null);
    soft(ctx, () => ctx.rect(-10, 466, 440, 6), 'rgba(10,6,18,.5)', 5);
    for (const [x] of GEODE_LAMPS) soft(ctx, () => ctx.ellipse(x + (x < 210 ? 30 : -30), 480, 90, 14, 0, 0, TAU), 'rgba(255,180,110,.16)', 14);
    for (const x of [28, 392]) soft(ctx, () => ctx.ellipse(x, 472, 30, 5, 0, 0, TAU), 'rgba(8,4,14,.6)', 4);
    const rf = rng(919);
    for (let i = 0; i < 70; i++) { const x = 10 + rf() * 400, y = 474 + rf() * 84; if (Math.abs(x - 210) < 90 && rf() < .85) continue; dot(ctx, x, y, .6 + rf() * 1.1, rf() < .55 ? 'rgba(10,6,20,.4)' : 'rgba(220,190,200,.18)'); }
    for (let x = -6; x < 430; x += 22) poly(ctx, [[x - 8, 534], [x + 8, 534], [x + 10, 542], [x - 6, 542]], lin(ctx, 0, 534, 0, 542, [[0, '#6a4a38'], [1, '#2e1e1c']]));
    for (const y of [473, 482]) poly(ctx, [[184, y - 1.6], [236, y - 1.6], [237, y + 1.8], [183, y + 1.8]], 'rgba(40,24,26,.75)');
    for (const x of [194, 226]) { emberLine(ctx, [[x, 466], [x + (x - 210) * .04, 492]], '#2a2432', 2.2); emberLine(ctx, [[x, 466], [x + (x - 210) * .04, 492]], 'rgba(220,200,230,.4)', .7); }
    soft(ctx, () => ctx.ellipse(210, 506, 62, 17, 0, 0, TAU), 'rgba(10,6,18,.55)', 6);
    ctx.beginPath(); ctx.ellipse(210, 504, 56, 15, 0, 0, TAU); ctx.fillStyle = lin(ctx, 0, 489, 0, 519, [[0, '#6e5048'], [1, '#3a2834']]); ctx.fill();
    clipTo(ctx, blob(210, 504, 56, 15, 1, 0, 24), () => {
      for (let k = -4; k <= 4; k++) { emberLine(ctx, [[210 + k * 12.4, 486], [210 + k * 12.4, 522]], 'rgba(30,18,22,.45)', 1); emberLine(ctx, [[211.2 + k * 12.4, 486], [211.2 + k * 12.4, 522]], 'rgba(255,220,180,.08)', .7); }
      wash(ctx, rad(ctx, 210, 498, 56, [[0, 'rgba(255,206,150,.22)'], [1, 'rgba(255,206,150,0)']]), 'screen');
    });
    ctx.beginPath(); ctx.ellipse(210, 504, 56, 15, 0, 0, TAU); ctx.strokeStyle = '#2a2232'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(210, 503.2, 56, 15, 0, Math.PI * 1.06, Math.PI * 1.94); ctx.strokeStyle = 'rgba(255,220,190,.32)'; ctx.lineWidth = .9; ctx.stroke();
    for (const y of [528, 540]) { poly(ctx, [[-10, y - 2], [430, y - 2], [430, y + 2], [-10, y + 2]], lin(ctx, 0, y - 2, 0, y + 2, [[0, '#a898b0'], [1, '#2e2838']])); emberLine(ctx, [[-10, y - 1.2], [430, y - 1.2]], 'rgba(255,236,220,.35)', .7); }
    // The working corner: a cracked geode by the left post, the pickaxe leant there, the cart on the right.
    geodePick(ctx, 64, 470, 80, -.32);
    geodeHollow(ctx, 50, 512, 30, 22, 71, .12, .9);
    for (const [x, y, w, h, sd] of [[98, 548, 8, 5, 81], [120, 528, 5, 3.6, 82], [296, 552, 7, 4.6, 83]]) { soft(ctx, () => ctx.ellipse(x, y + h * .7, w, h * .4, 0, 0, TAU), 'rgba(10,6,18,.5)', 2); const pts = blob(x, y, w, h, sd, .16, 8); lit(ctx, pts, '#8a7a96', '#3a2e4a'); }
    geodeCluster(ctx, 134, 548, 9, 63, 3, .7);
    geodeCart(ctx, 354, 520, 1);
    // Dust hanging in the lantern light.
    const rd = rng(55);
    for (let i = 0; i < 18; i++) { const [lx, ly] = GEODE_LAMPS[i % 2], a = rd() * TAU, d = 20 + rd() * 70; dot(ctx, lx + Math.cos(a) * d * .7, ly + 30 + Math.sin(a) * d, .5 + rd() * .7, `rgba(255,226,180,${(.25 + rd() * .3).toFixed(3)})`); }
    grade(ctx, 'rgba(255,200,140,.35)', 'rgba(96,74,180,.45)', 'rgba(20,10,36,.6)');
    grain(ctx, .08);
    if (framed) frame(ctx, '#8664ae', '#f3c98a');
  }

  // ---------- Level 9: Briar Vault ----------
  // An old vault far under the roots. Through its great arch a green-gold shaft of daylight falls from some gap high
  // in the roof, filling the hall beyond with warm air and pooling on the floor at the launcher. The arch and its
  // pillars stand against that light, cool and mossy and rimmed with it; briars climb them and the roses catch it.
  // (leafGlyph and leaf stay as they were: the vault rocks in play are carved with them.)
  // A leaf cut into stone: the groove is dark on its upper left edge and catches light on the lower right.
  function leafGlyph(ctx, x, y, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    const leafPath = (dx, dy) => { ctx.beginPath(); ctx.moveTo(dx, -9 + dy); ctx.quadraticCurveTo(7 + dx, -2 + dy, dx, 9 + dy); ctx.quadraticCurveTo(-7 + dx, -2 + dy, dx, -9 + dy); };
    leafPath(.8, .8); ctx.strokeStyle = 'rgba(210,230,190,.28)'; ctx.lineWidth = 1.1; ctx.stroke();
    leafPath(0, 0); ctx.strokeStyle = 'rgba(18,26,20,.75)'; ctx.lineWidth = 1.2; ctx.stroke();
    stroke(ctx, [[0, -6], [0, 11]], 'rgba(18,26,20,.75)', 1.1);
    for (const k of [-1, 1]) for (const yy of [-2, 3]) stroke(ctx, [[0, yy], [k * 3.4, yy - 2.6]], 'rgba(18,26,20,.6)', .9);
    ctx.restore();
  }
  function leaf(ctx, x, y, len, angle) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * .5, -len * .36, len, 0); ctx.quadraticCurveTo(len * .5, len * .36, 0, 0); ctx.closePath();
    ctx.fillStyle = '#5f9a4e'; ctx.fill(); ctx.strokeStyle = '#24401f'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(len * .2, len * .03); ctx.quadraticCurveTo(len * .5, len * .3, len * .9, len * .03); ctx.closePath(); ctx.fillStyle = '#4c8240'; ctx.fill();
    stroke(ctx, [[len * .1, 0], [len * .8, -len * .02]], 'rgba(200,240,170,.55)', .8);
    ctx.restore();
  }
  const BRIAR_ARCH = [210, 204, 158, 190];
  // The same carving in the new light: a soft groove and a lit lip, no ink.
  function briarGlyph(ctx, x, y, s, rot, a = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    const leafPath = (dx, dy) => { ctx.beginPath(); ctx.moveTo(dx, -9 + dy); ctx.quadraticCurveTo(7 + dx, -2 + dy, dx, 9 + dy); ctx.quadraticCurveTo(-7 + dx, -2 + dy, dx, -9 + dy); };
    ctx.lineCap = 'round';
    leafPath(.7, .9); ctx.strokeStyle = `rgba(214,232,170,${(.22 * a).toFixed(3)})`; ctx.lineWidth = 1.3; ctx.stroke();
    leafPath(0, 0); ctx.strokeStyle = `rgba(14,24,20,${(.5 * a).toFixed(3)})`; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 11); ctx.stroke();
    ctx.restore();
  }
  // A leaf on a briar: lit toward the light on its upper side, deep green beneath, a pale midrib.
  function briarLeaf(ctx, x, y, len, angle, lit = .5) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * .45, -len * .4, len, 0); ctx.quadraticCurveTo(len * .5, len * .34, 0, 0); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -len * .3, 0, len * .3, [[0, emberMix('#3e6a3a', '#a8cc62', lit)], [.55, emberMix('#24442c', '#4e8040', lit)], [1, '#1a3024']]); ctx.fill();
    ctx.beginPath(); ctx.moveTo(len * .08, 0); ctx.quadraticCurveTo(len * .5, -len * .05, len * .9, 0); ctx.strokeStyle = `rgba(214,240,170,${(.18 + lit * .3).toFixed(3)})`; ctx.lineWidth = .6; ctx.stroke();
    ctx.restore();
  }
  // A rose: back petals in shadow, a cupped bloom whose upper edges take the light, a tight heart.
  function briarRose(ctx, x, y, r, rot = 0, lit = .6) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.ellipse(r * .2, r * .5, r * 1.1, r * .55, 0, 0, TAU); ctx.fillStyle = rad(ctx, r * .2, r * .5, r * 1.1, [[0, 'rgba(16,10,14,.4)'], [1, 'rgba(16,10,14,0)']]); ctx.fill();
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - .3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * .55, Math.sin(a) * r * .48, r * .58, r * .46, a, 0, TAU); ctx.fillStyle = i < 2 ? '#7a1830' : '#9a2440'; ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(0, 0, r * .72, r * .62, 0, 0, TAU); ctx.fillStyle = rad(ctx, -r * .25, -r * .3, r, [[0, emberMix('#c8405a', '#ff9aa8', lit)], [.6, '#b0304c'], [1, '#6a142a']]); ctx.fill();
    for (const [a0, a1, k] of [[3.4, 5.6, .58], [4, 6.2, .38], [2.6, 4.4, .24]]) { ctx.beginPath(); ctx.arc(0, -r * .04, r * k, a0, a1); ctx.strokeStyle = `rgba(255,${Math.round(170 + lit * 50)},${Math.round(180 + lit * 40)},${(.35 + lit * .4).toFixed(3)})`; ctx.lineWidth = r * .14; ctx.lineCap = 'round'; ctx.stroke(); }
    ctx.beginPath(); for (let a = 0; a < 2.2 * TAU; a += .35) { const rr = r * .05 + a * r * .028; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr - r * .06); } ctx.strokeStyle = 'rgba(90,14,34,.6)'; ctx.lineWidth = .7; ctx.stroke();
    ctx.restore();
  }
  // A briar cane: a tapering stem wandering where the points lead, thorns along it, leaves where it pleases and a rose
  // or a bud at the stops listed. `lit` says how much of the light reaches it.
  function briarCane(ctx, pts, w, seed, roses = [], lit = .5) {
    const r = rng(seed), outline = ribbon2(pts, w, .7);
    soft(ctx, () => smooth(ctx, outline.map(([x, y]) => [x + 2, y + 3]), true), 'rgba(10,18,14,.35)', 3);
    shape(ctx, outline, '#24301e', null);
    stroke(ctx, pts.map(([x, y]) => [x - w * .18, y - w * .12]), emberMix('#3a4a28', '#7a8a48', lit), w * .32);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], a = Math.atan2(y1 - y0, x1 - x0), seg = Math.hypot(x1 - x0, y1 - y0), ww = w * (1 - i / (pts.length - 1) * .7);
      for (let t = .15; t < 1; t += 9 / seg) {
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, side = r() < .5 ? -1 : 1, ta = a + side * 1.25;
        if (r() < .5) poly(ctx, [[x + Math.cos(a) * ww * .5, y + Math.sin(a) * ww * .5], [x + Math.cos(ta) * (ww * .5 + 3.4), y + Math.sin(ta) * (ww * .5 + 3.4)], [x - Math.cos(a) * ww * .2, y - Math.sin(a) * ww * .2]], '#5a4a2e');
        else if (r() < .4) briarSprig(ctx, x, y, 11 + r() * 6, a + side * (.7 + r() * .5), lit * (.6 + r() * .6), seed * 13 + i * 7 + Math.round(t * 50));
      }
    }
    for (const [i, rr, bud] of roses) {
      const [x, y] = pts[i];
      briarLeaf(ctx, x - 2, y + 2, 9, 2.5, lit); briarLeaf(ctx, x + 2, y + 1, 9, .4, lit);
      if (bud) { ctx.beginPath(); ctx.ellipse(x, y - rr * .2, rr * .45, rr * .7, (r() - .5) * .6, 0, TAU); ctx.fillStyle = lin(ctx, x, y - rr, x, y + rr * .4, [[0, '#d8506a'], [1, '#6a142a']]); ctx.fill(); stroke(ctx, [[x - rr * .4, y + rr * .2], [x, y + rr * .5], [x + rr * .4, y + rr * .2]], '#3a5a2a', 1.2); }
      else briarRose(ctx, x, y, rr, r() * 3, lit);
    }
  }
  // Moss: a mat lying along a surface, its edge ragged with tiny lumps, dark where it clings and lit only where it
  // faces up to the light, finely flecked rather than spotted. c(t) runs along the surface, n(t) points out of it.
  function briarMat(ctx, c, n, len, th, lit, seed, drip = 0) {
    const r = rng(seed), steps = Math.max(6, Math.round(len / 2.2)), outer = [], inner = [], crown = [], fleck = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, [x, y] = c(t), [nx, ny] = n(t), w = th(t), up = Math.max(0, -ny), bump = k % 2 ? r() * 1.5 : -r() * .5;
      outer.push([x + nx * (w * .6 + bump), y + ny * (w * .6 + bump)]);
      const tongue = w > 3 && r() < .14 ? w * (.4 + r() * .5) : 0; inner.unshift([x - nx * (w * .4 + r() * 1.1 + tongue), y - ny * (w * .4 + r() * 1.1 + tongue)]);
      crown.unshift([x + nx * (w * .6 - w * .7 * up), y + ny * (w * .6 - w * .7 * up)]);
      if (w > 2) for (let q = 0; q < 2; q++) { const d = w * (.6 - Math.pow(r(), .6) * (.3 + .6 * up)); fleck.push([x + nx * d + (r() - .5) * 2, y + ny * d + (r() - .5) * 2, up]); }
    }
    const body = outer.concat(inner), pal = briarMossPal(lit);
    soft(ctx, () => smooth(ctx, body.map(([x, y]) => [x + 1, y + 2.4]), true), 'rgba(8,16,10,.5)', 3);
    for (let k = 2; k < steps - 1; k += 3) if (r() < drip) { const [x, y] = inner[steps - k]; emberLine(ctx, [[x, y - 1], [x + (r() - .5) * 2, y + 3 + r() * 9]], 'rgba(36,66,40,.85)', .8 + r() * .7); }
    shape(ctx, body, pal.dark, null);
    clipTo(ctx, body, () => {
      shape(ctx, outer.concat(inner.map(([x, y], k) => [(x + crown[k][0]) / 2, (y + crown[k][1]) / 2])), pal.mid, null);
      soft(ctx, () => smooth(ctx, outer.concat(crown), true), pal.lit, 1.4);
      ctx.fillStyle = emberMix(pal.lit, '#c8dc80', .25); ctx.globalAlpha = .6;
      for (const [x, y, up] of fleck) if (r() < .3 + up * .7) { ctx.beginPath(); ctx.arc(x, y, .4 + r() * .35, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
  }
  function briarMossPal(lit) { return { dark: emberMix('#1a2e22', '#20382a', lit), mid: emberMix('#28442c', '#36583a', lit), lit: emberMix('#4a6e3a', '#90ae58', lit) }; }
  function briarMoss(ctx, x0, x1, y, seed, drip = 0, lit = .5) {
    const r = rng(seed), wob = r() * 9;
    briarMat(ctx, t => [x0 + (x1 - x0) * t, y - 1], () => [0, -1], x1 - x0, t => 3 + 2.6 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (.7 + .3 * Math.sin(t * 9 + wob)), lit, seed, drip);
  }
  // Ivy hanging in a curtain from a ledge: a few long strands, leaves alternating down them.
  function briarIvy(ctx, x, y, len, seed, lit = .4) {
    const r = rng(seed), sway = (r() - .5) * 10, pts = [[x, y], [x + sway * .4, y + len * .4], [x + sway, y + len * .75], [x + sway * .8, y + len]];
    stroke(ctx, pts, '#2a4428', 1.1);
    for (let k = 6; k < len; k += 6 + r() * 4) { const [px, py] = bezierAt([x, y], [x + sway * .6, y + len * .5], [x + sway * .8, y + len], k / len); briarLeaf(ctx, px, py, 4.6 + r() * 2.4 - k / len * 2, (k / 6) % 2 ? .9 : 2.2, lit * (1 - k / len * .6)); }
  }
  // The stone rabbit: a little shrine figure in the corner, mossy on the head, its back rimmed by the hall light.
  function briarStatue(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    soft(ctx, () => ctx.ellipse(4, 18, 32, 5, 0, 0, TAU), 'rgba(8,14,12,.55)', 4);
    const stoneG = (y0, y1) => lin(ctx, -20, y0, 20, y1, [[0, '#6a7868'], [.55, '#52604f'], [1, '#384438']]);
    poly(ctx, [[-22, 0], [22, 0], [22, 18], [-22, 18]], stoneG(0, 18));
    poly(ctx, [[-25, -5], [25, -5], [25, 1], [-25, 1]], lin(ctx, 0, -5, 0, 1, [[0, '#8a9a80'], [1, '#4a5848']]));
    briarGlyph(ctx, 0, 9, .55, Math.PI / 2, .9);
    for (const [ex, a, h] of [[-4.6, -.2, 26], [5.4, .5, 22]]) {
      ctx.save(); ctx.translate(ex, -38); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, -h / 2, 3.9, h / 2, 0, 0, TAU); ctx.fillStyle = stoneG(-h, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(.6, -h / 2 + 1, 1.7, h / 2 - 4.4, 0, 0, TAU); ctx.fillStyle = 'rgba(30,40,34,.45)'; ctx.fill();
      ctx.restore();
    }
    const body = [[-16, -5], [-17, -18], [-10, -28], [2, -30], [12, -24], [16, -12], [14, -5]];
    shape(ctx, body, stoneG(-30, -5), null); rim(ctx, body, 'rgba(226,236,170,.5)', 2, -1.5);
    const head = blob(0, -34, 11, 9.4, 7, .04, 10);
    shape(ctx, head, stoneG(-44, -24), null); rim(ctx, head, 'rgba(226,236,170,.55)', 1.6, -1.6);
    for (const ex of [-4.4, 4.4]) { ctx.beginPath(); ctx.arc(ex, -35, 2.2, .3, Math.PI - .3); ctx.strokeStyle = 'rgba(20,28,24,.7)'; ctx.lineWidth = 1.1; ctx.stroke(); }
    dot(ctx, 0, -31.6, 1.1, 'rgba(20,28,24,.6)'); stroke(ctx, [[-2, -29.4], [0, -28.4], [2, -29.4]], 'rgba(20,28,24,.55)', .8);
    ctx.beginPath(); ctx.ellipse(-12, -6, 5, 3, 0, 0, TAU); ctx.fillStyle = '#4a5848'; ctx.fill();
    stroke(ctx, [[8, -20], [11, -14], [9, -9]], 'rgba(20,28,24,.4)', .9);
    clipTo(ctx, head, () => { shape(ctx, scallop(-3, -45, 8.6, 9, 9, .2), lin(ctx, 0, -44, 0, -37, [[0, '#7a9a4c'], [1, '#2e4a2c']]), null); });
    briarMoss(ctx, -26, -12, -5, 41, .6, .5); briarMoss(ctx, 15, 24, -5, 42, 0, .55);
    ctx.restore();
  }
  // The toad, sitting on the fallen drum, its back warmed by the light from the hall.
  function briarToad(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const line = '#3a5a2a', skin = lin(ctx, 0, -18, 0, 2, [[0, '#a8be6a'], [1, '#6a8a44']]), dark = 'rgba(70,96,46,.7)';
    soft(ctx, () => ctx.ellipse(0, 2, 18, 3, 0, 0, TAU), 'rgba(10,18,12,.5)', 2.5);
    const body = [[-16, 0], [-17, -9], [-10, -16], [10, -16], [17, -9], [16, 0], [0, 2]];
    shape(ctx, body, skin, line, 1.1); rim(ctx, body, 'rgba(236,244,180,.5)', 1.4, -1.6);
    ctx.beginPath(); ctx.ellipse(0, -4, 9, 4.6, 0, 0, TAU); ctx.fillStyle = '#dcd99c'; ctx.fill();
    for (const [sx, sy, sr] of [[-11, -9, 1.6], [12, -6, 1.3], [7, -12, 1.1], [-6, -13, 1]]) dot(ctx, sx, sy, sr, dark);
    for (const ex of [-8, 8]) {
      dot(ctx, ex, -15, 5, '#a2b866'); ctx.beginPath(); ctx.arc(ex, -15, 5, Math.PI * .92, Math.PI * 2.08); ctx.strokeStyle = line; ctx.lineWidth = 1.1; ctx.stroke();
      dot(ctx, ex, -14.6, 3.2, '#e8d58a');
      ctx.beginPath(); ctx.ellipse(ex, -14.4, 2.4, 1.2, 0, 0, TAU); ctx.fillStyle = '#2a2a18'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex - 3.6, -16); ctx.quadraticCurveTo(ex, -18.4, ex + 3.6, -16); ctx.lineTo(ex + 3.6, -18); ctx.quadraticCurveTo(ex, -20.4, ex - 3.6, -18); ctx.closePath(); ctx.fillStyle = '#a2b866'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex - 3.6, -16); ctx.quadraticCurveTo(ex, -18.4, ex + 3.6, -16); ctx.strokeStyle = line; ctx.lineWidth = .9; ctx.stroke();
      dot(ctx, ex - 1.2, -13.6, .7, '#ffffff');
    }
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.quadraticCurveTo(0, -3, 8, -8); ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke();
    dot(ctx, -11, -6.4, 1.8, 'rgba(240,150,140,.45)'); dot(ctx, 11, -6.4, 1.8, 'rgba(240,150,140,.45)');
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * 9, 1, 5, 2.4, 0, 0, TAU); ctx.fillStyle = '#7a9a4e'; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = .9; ctx.stroke(); }
    ctx.restore();
  }
  // Dressed stone laid in courses, each block its own shade, mortar dark between, a cool lip along each top edge.
  function briarCourses(ctx, x0, y0, x1, y1, h, base, seed, lip = 'rgba(190,214,180,.12)') {
    const r = rng(seed);
    ctx.fillStyle = 'rgba(10,18,16,.55)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let y = y0, row = 0; y < y1; y += h, row++) {
      for (let x = x0 - (row % 2) * h * 1.1 - r() * 6; x < x1; ) {
        const w = h * (1.6 + r() * 1.2);
        poly(ctx, [[x + .8, y + .8], [x + w - .8, y + .8], [x + w - .8, y + h - .8], [x + .8, y + h - .8]], emberMix(base, r() < .5 ? '#1e2a26' : '#5a6a5a', r() * .28));
        emberLine(ctx, [[x + 1.4, y + 1.4], [x + w - 1.4, y + 1.4]], lip, .8);
        x += w;
      }
    }
  }
  // A rose sprig: a stalk with paired leaflets and one at its tip, the way rose leaves grow.
  function briarSprig(ctx, x, y, len, angle, lit, seed) {
    const r = rng(seed), ca = Math.cos(angle), sa = Math.sin(angle), bend = (r() - .5) * .3;
    const at = t => [x + ca * len * t - sa * len * bend * t * t, y + sa * len * t + ca * len * bend * t * t];
    stroke(ctx, [at(0), at(.5), at(1)], '#2a3a22', 1);
    const pairs = 2 + (r() < .6), size = len * .36;
    for (let k = 0; k < pairs; k++) {
      const t = .32 + k * .26, [px, py] = at(t);
      for (const side of [-1, 1]) briarLeaf(ctx, px, py, size * (1 - k * .1), angle + bend * t + side * (.85 + r() * .25), lit * (side < 0 ? 1 : .7));
    }
    const [tx, ty] = at(.96); briarLeaf(ctx, tx, ty, size * 1.05, angle + bend, lit);
  }
  // Briar foliage: sprigs crowding out from a dark heart, the back ones in shadow, the front ones lit.
  function briarBush(ctx, masses, lit, seed) {
    const r = rng(seed);
    for (const [x, y, r0] of masses) soft(ctx, () => ctx.ellipse(x, y + r0 * .15, r0 * .85, r0 * .6, 0, 0, TAU), 'rgba(8,18,12,.55)', r0 * .45);
    for (const layer of [0, 1]) for (const [x, y, r0] of masses) {
      const n = layer ? 4 : 5;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / (n - 1) - .5) * (layer ? 2.4 : 3.6) + (r() - .5) * .4;
        briarSprig(ctx, x + (r() - .5) * r0 * .3, y + (r() - .5) * r0 * .2, r0 * (layer ? .8 : 1.05) * (.8 + r() * .3), a, lit * (layer ? 1 : .45), seed * 7 + i + layer * 20);
      }
    }
  }
  // A near cane hanging in front of everything: almost a silhouette, only a cool edge where the hall light finds it.
  function briarFore(ctx, pts, w, seed) {
    const r = rng(seed);
    shape(ctx, ribbon2(pts, w, .75), '#0b140f', null);
    stroke(ctx, pts.map(([x, y]) => [x + w * .2, y - w * .25]), 'rgba(70,96,74,.35)', w * .22);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], a = Math.atan2(y1 - y0, x1 - x0), seg = Math.hypot(x1 - x0, y1 - y0);
      for (let t = .2; t < 1; t += 8 / seg) {
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, side = r() < .5 ? -1 : 1, ww = w * (1 - i / pts.length * .6);
        if (r() < .55) poly(ctx, [[x + Math.cos(a) * ww * .5, y + Math.sin(a) * ww * .5], [x + Math.cos(a + side * 1.2) * (ww * .5 + 4.5), y + Math.sin(a + side * 1.2) * (ww * .5 + 4.5)], [x - Math.cos(a) * ww * .3, y - Math.sin(a) * ww * .3]], '#0b140f');
        else {
          const la = a + side * (.6 + r() * .6), len = 12 + r() * 9;
          ctx.save(); ctx.translate(x, y); ctx.rotate(la);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * .45, -len * .42, len, 0); ctx.quadraticCurveTo(len * .5, len * .36, 0, 0); ctx.fillStyle = '#0d1812'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(len * .1, -len * .06); ctx.quadraticCurveTo(len * .45, -len * .4, len * .95, -.4); ctx.strokeStyle = 'rgba(96,130,96,.28)'; ctx.lineWidth = .8; ctx.stroke();
          ctx.restore();
        }
      }
    }
  }
  function paintBriar(ctx, framed) {
    const [ax, ay, R1, R2] = BRIAR_ARCH, opening = () => { ctx.moveTo(52, 470); ctx.lineTo(52, ay); ctx.arc(ax, ay, R1, Math.PI, 0); ctx.lineTo(368, 470); ctx.closePath(); };
    // The hall beyond the arch: deep green up in its vault, warming to gold where the light comes down.
    wash(ctx, lin(ctx, 0, 0, 0, 460, [[0, '#14221e'], [.3, '#1c2e2a'], [.62, '#283c34'], [.86, '#34483a'], [1, '#3c4e3a']]));
    const rw = rng(12);
    for (let y = 70; y < 300; y += 38) emberLine(ctx, [[40, y + rw() * 3], [380, y + rw() * 3]], 'rgba(10,18,16,.22)', 1.2);
    for (const [x, y, w, h, c] of [[120, 150, 70, 50, 'rgba(60,90,60,.16)'], [300, 120, 60, 40, 'rgba(60,90,60,.14)'], [230, 230, 90, 40, 'rgba(10,18,16,.2)']]) soft(ctx, () => ctx.ellipse(x, y, w, h, 0, 0, TAU), c, 20);
    // Its far arcade: three arches into further dark, the middle one with a glimpse of another lit room.
    for (const [cx, w, top, glow] of [[124, 52, 300, .3], [210, 64, 282, .8], [296, 52, 300, .3]]) {
      const path = () => { ctx.beginPath(); ctx.moveTo(cx - w / 2, 440); ctx.lineTo(cx - w / 2, top + w / 2); ctx.arc(cx, top + w / 2, w / 2, Math.PI, 0); ctx.lineTo(cx + w / 2, 440); ctx.closePath(); };
      path(); ctx.fillStyle = lin(ctx, 0, top, 0, 440, [[0, '#0e1a16'], [1, '#1a2a22']]); ctx.fill();
      ctx.save(); path(); ctx.clip(); bloom(ctx, cx, 446, w * 1.1, '190,214,150', .2 * glow); ctx.restore();
      ctx.beginPath(); ctx.arc(cx, top + w / 2, w / 2 + 3.5, Math.PI, 0); ctx.strokeStyle = 'rgba(120,150,110,.14)'; ctx.lineWidth = 7; ctx.stroke();
    }
    for (const x of [82, 167, 253, 338]) poly(ctx, [[x - 8, 296], [x + 8, 296], [x + 8, 440], [x - 8, 440]], lin(ctx, x - 8, 0, x + 8, 0, [[0, '#3a4c3c'], [1, '#26362e']]));
    // Briar let down in a curtain through the left arch; the right one half choked with fallen blocks.
    const rc = rng(404); ctx.save(); ctx.globalAlpha = .7;
    for (const [x, len, sw] of [[103, 64, 3], [110, 100, -2], [117, 40, 4], [129, 84, -3], [143, 52, 2]]) {
      const pts = [[x, 302], [x + sw, 302 + len * .5], [x + sw * .4, 302 + len]];
      stroke(ctx, pts, '#1e3226', 1.1);
      for (let k = 6 + rc() * 6; k < len - 2; k += 6 + rc() * 11) { const [px, py] = bezierAt(pts[0], pts[1], pts[2], k / len); briarLeaf(ctx, px, py, 3.6 + rc() * 2.6, rc() < .5 ? .5 + rc() * .6 : 2.1 + rc() * .6, 0); }
    }
    ctx.restore();
    for (const [x, y, w, h] of [[276, 424, 22, 16], [298, 428, 18, 12], [288, 412, 16, 12], [314, 432, 12, 8]]) { poly(ctx, [[x, y], [x + w, y + 1], [x + w - 1, y + h], [x + 1, y + h]], lin(ctx, 0, y, 0, y + h, [[0, '#3e5240'], [1, '#22302a']])); emberLine(ctx, [[x + 1, y + .8], [x + w - 1, y + 1.6]], 'rgba(200,220,160,.16)', .9); }
    band(ctx, [[-20, 438], [440, 438]], 470, lin(ctx, 0, 438, 0, 470, [[0, '#3a4a36'], [1, '#4a5840']]), null);
    for (const y of [446, 456]) emberLine(ctx, [[40, y], [380, y]], 'rgba(10,20,14,.25)', .8);
    air(ctx, 40, 470, '74,96,74', .06, .42);
    bloom(ctx, 238, 450, 160, '236,230,150', .28);
    // The light itself, falling from a gap high in the vault, through the hall and the arch, to the floor.
    const rays = () => { for (const [x, a, len, w0, w1, al] of [[112, 1.36, 600, 8, 46, .16], [138, 1.39, 600, 5, 22, .12], [156, 1.405, 590, 9, 40, .15], [184, 1.43, 570, 4, 20, .1], [96, 1.33, 520, 5, 24, .07]]) shaft(ctx, x, -30, a, len, w0, w1, '240,234,160', al); };
    ctx.save(); ctx.beginPath(); opening(); ctx.rect(-10, 458, 440, 120); ctx.clip(); rays(); ctx.restore();
    // The near wall the arch is built into, in the cool shade of this side of the vault.
    ctx.save(); ctx.beginPath(); ctx.rect(-10, -10, 440, 480); opening(); ctx.clip('evenodd');
    briarCourses(ctx, -10, -6, 430, 470, 24, '#26342e', 21);
    wash(ctx, rad(ctx, ax, ay, 300, [[0, 'rgba(0,0,0,0)'], [.55, 'rgba(8,14,12,.1)'], [1, 'rgba(8,14,12,.5)']]));
    ctx.restore();
    // The great arch: a soffit lit by the hall, voussoirs in shade, each with a rim of light along its inner edge.
    soft(ctx, () => { ctx.arc(ax, ay, R2 + 6, Math.PI, 0); ctx.arc(ax, ay, R1 - 4, 0, Math.PI, true); ctx.closePath(); }, 'rgba(6,12,10,.55)', 10);
    ctx.beginPath(); ctx.arc(ax, ay, R1, Math.PI, 0); ctx.arc(ax + 6, ay + 10, R1 - 10, 0, Math.PI, true); ctx.closePath();
    ctx.fillStyle = lin(ctx, ax - R1, 0, ax + R1, 0, [[0, '#3e4e40'], [.45, '#7a8660'], [1, '#4e5c48']]); ctx.fill();
    const n = 11;
    for (let i = 0; i < n; i++) {
      const key = i === 5, a0 = Math.PI + i * Math.PI / n, a1 = Math.PI + (i + 1) * Math.PI / n, out = key ? R2 + 8 : R2, inn = key ? R1 - 5 : R1, pts = [];
      for (let t = 0; t <= 4; t++) { const a = a0 + (a1 - a0) * t / 4; pts.push([ax + Math.cos(a) * (out - .9), ay + Math.sin(a) * (out - .9)]); }
      for (let t = 4; t >= 0; t--) { const a = a0 + (a1 - a0) * t / 4; pts.push([ax + Math.cos(a) * (inn + .5), ay + Math.sin(a) * (inn + .5)]); }
      const tone = [.1, .3, 0, .22, .05, .35, .12, -.05, .25, .02, .16][i];
      poly(ctx, pts, rad(ctx, ax, ay, out, [[R1 / out * .97, emberMix('#33443a', '#56685a', tone)], [1, emberMix('#24302a', '#3a4a40', tone)]]));
      const am = (a0 + a1) / 2;
      const facing = Math.max(0, Math.cos(am - Math.PI * 1.3));
      ctx.beginPath(); ctx.arc(ax, ay, inn + 2, a0 + .012, a1 - .012); ctx.strokeStyle = `rgba(226,232,170,${(.08 + .3 * facing).toFixed(3)})`; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(ax, ay, out - 2.4, a0 + .02, a1 - .02); ctx.strokeStyle = 'rgba(190,214,170,.1)'; ctx.lineWidth = 1; ctx.stroke();
      if (key) briarGlyph(ctx, ax, ay - (out + inn) / 2, .95, 0);
    }
    // Weather on the voussoirs: damp streaks run down from their outer edges, pale lichen here and there.
    ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, R2 + 8, Math.PI, 0); ctx.arc(ax, ay, R1 - 5, 0, Math.PI, true); ctx.closePath(); ctx.clip();
    const rv = rng(140), streaks = [], lichen = [];
    for (let k = 0; k < 18; k++) { const aa = Math.PI + .08 + rv() * (Math.PI - .16), l1 = R2 - 8 - rv() * 16; streaks.push([aa, l1]); if (rv() < .45) lichen.push([aa + .04, R1 + 6 + rv() * 20, 4 + rv() * 5]); }
    soft(ctx, () => { for (const [aa, l1] of streaks) { ctx.moveTo(ax + Math.cos(aa) * (R2 + 2), ay + Math.sin(aa) * (R2 + 2)); ctx.lineTo(ax + Math.cos(aa) * l1, ay + Math.sin(aa) * l1 + 9); ctx.lineTo(ax + Math.cos(aa + .025) * (R2 + 2), ay + Math.sin(aa + .025) * (R2 + 2)); ctx.closePath(); } }, 'rgba(10,18,14,.3)', 3);
    soft(ctx, () => { for (const [aa, d, rr] of lichen) { ctx.moveTo(ax + Math.cos(aa) * d + rr, ay + Math.sin(aa) * d); ctx.ellipse(ax + Math.cos(aa) * d, ay + Math.sin(aa) * d, rr, rr * .7, aa, 0, TAU); } }, 'rgba(150,176,112,.14)', 3);
    ctx.restore();
    // Pillars: drums of stone, their inner faces turned to the hall, capitals and plinths.
    for (const [x0, x1, side] of [[-4, 52, 0], [368, 424, 1]]) {
      const inner = side ? x0 : x1, d = side ? 1 : -1, ys = [222, 262, 300, 342, 388, 434];
      poly(ctx, [[inner, 214], [inner + d * 8, 220], [inner + d * 8, 462], [inner, 468]], lin(ctx, 0, 220, 0, 460, side ? [[0, '#7a8460'], [1, '#46523e']] : [[0, '#3a4a3c'], [1, '#26342c']]));
      for (let i = 0; i < ys.length - 1; i++) {
        const blk = [[x0, ys[i] + .8], [x1, ys[i] + .8], [x1, ys[i + 1] - .8], [x0, ys[i + 1] - .8]];
        poly(ctx, blk, lin(ctx, x0, 0, x1, 0, side ? [[0, '#4a5a4a'], [.5, '#36463a'], [1, '#26322c']] : [[0, '#24302a'], [.6, '#34443a'], [1, '#42524a']]));
        emberLine(ctx, [[x0 + 1, ys[i] + 1.6], [x1 - 1, ys[i] + 1.6]], 'rgba(190,214,170,.12)', .8);
        if (i === (side ? 1 : 2)) briarGlyph(ctx, (x0 + x1) / 2 + (side ? -4 : 4), (ys[i] + ys[i + 1]) / 2, 1, side ? .3 : -.3, .9);
      }
      wash(ctx, lin(ctx, 0, 300, 0, 470, [[0, 'rgba(6,12,10,0)'], [1, 'rgba(6,12,10,.4)']]), null, 1, x0, 300, x1 - x0, 170);
      emberLine(ctx, [[inner + d * .8, 224], [inner + d * .8, 432]], lin(ctx, 0, 224, 0, 432, side ? [[0, 'rgba(240,240,180,.6)'], [1, 'rgba(240,240,180,.2)']] : [[0, 'rgba(190,214,170,.22)'], [1, 'rgba(190,214,170,.05)']]), 1.4);
      poly(ctx, [[x0 - 8, 200], [x1 + 8, 200], [x1 + 4, 212], [x1, 222], [x0, 222], [x0 - 4, 212]], lin(ctx, 0, 200, 0, 222, [[0, '#56664e'], [.4, '#3e4c3e'], [1, '#1e2a24']]));
      for (let k = 0; k < 3; k++) { const cx = x0 + 10 + k * 17; ctx.beginPath(); ctx.arc(cx, 212, 4.4, Math.PI * .1, Math.PI * 1.9); ctx.strokeStyle = 'rgba(10,18,14,.4)'; ctx.lineWidth = 1.1; ctx.stroke(); }
      poly(ctx, [[x0 - 6, 434], [x1 + 6, 434], [x1 + 6, 462], [x0 - 6, 462]], lin(ctx, 0, 434, 0, 462, [[0, '#46564a'], [1, '#1e2a24']]));
      briarMoss(ctx, x0 - 8, x1 + 8, 200, 50 + side, .5, side ? .7 : .45);
      briarMoss(ctx, x0 - 6, x1 + 6, 434, 60 + side, .3, side ? .55 : .35);
    }
    // Moss cushions along the top of the arch, and ivy let down from its inner edge.
    for (const [a0, a1, sd, lit, big] of [[3.17, 3.78, 1, .4, 10], [4.6, 4.8, 2, .5, 5], [5.6, 6.08, 3, .5, 8]]) {
      const wob = sd * 2.3, A = t => a0 + (a1 - a0) * t;
      briarMat(ctx, t => [ax + Math.cos(A(t)) * (R2 - 1), ay + Math.sin(A(t)) * (R2 - 1)], t => [Math.cos(A(t)), Math.sin(A(t))], (a1 - a0) * R2,
        t => 1.5 + big * Math.pow(Math.sin(Math.PI * t), .7) * (.75 + .25 * Math.sin(t * 13 + wob)), lit, sd * 7, .4);
    }
    for (const [a, len, sd] of [[3.5, 34, 1], [3.66, 22, 2], [3.82, 12, 7], [5.76, 28, 3], [5.92, 46, 4], [6.08, 18, 8]]) briarIvy(ctx, ax + Math.cos(a) * (R1 - 2), ay + Math.sin(a) * (R1 - 2), len, sd, .55);
    // The floor in front of the arch: old flagstones in perspective, moss in the joints, the light pooled at the launcher.
    band(ctx, ridge(462, 1.2, 99, 40), 560, lin(ctx, 0, 460, 0, 560, [[0, '#34423a'], [1, '#18221e']]), null);
    soft(ctx, () => ctx.rect(-10, 458, 440, 8), 'rgba(6,12,8,.55)', 5);
    const rf = rng(77);
    for (const [y, h, step] of [[466, 12, 44], [478, 16, 52], [494, 20, 60], [514, 24, 70], [538, 30, 82]]) {
      let x = -10 - rf() * step;
      emberLine(ctx, [[-10, y], [430, y]], 'rgba(8,14,10,.5)', 1.2);
      emberLine(ctx, [[-10, y + 1.4], [430, y + 1.4]], 'rgba(200,220,160,.07)', .8);
      while (x < 430) { const xx = x + step * (.7 + rf() * .6); const lean = (xx - 210) * .14; emberLine(ctx, [[xx, y], [xx + lean, y + h]], 'rgba(8,14,10,.45)', 1.1); x = xx; }
      for (let k = 0; k < 4; k++) { const mx = rf() * 420, mw = 4 + rf() * 9; if (Math.abs(mx - 210) < 80) continue; soft(ctx, () => ctx.ellipse(mx, y + .5, mw, 1.8, 0, 0, TAU), 'rgba(62,98,50,.5)', 1.6); soft(ctx, () => ctx.ellipse(mx - mw * .2, y - .3, mw * .6, .9, 0, 0, TAU), 'rgba(140,176,90,.3)', 1); }
    }
    ctx.save(); ctx.beginPath(); ctx.rect(-10, 458, 440, 120); ctx.clip(); rays(); ctx.restore();
    soft(ctx, () => ctx.ellipse(222, 500, 100, 26, -.05, 0, TAU), 'rgba(236,228,140,.26)', 18);
    bloom(ctx, 218, 498, 96, '246,236,170', .2);
    // Petals fallen from the roses, gathered near the walls.
    for (const [x, y, a, c] of [[62, 488, .4, '#a02c46'], [140, 532, 2.2, '#b8384e'], [152, 524, 1.1, '#8e2440'], [286, 538, 2.8, '#b03448'], [298, 524, .2, '#a02c46'], [372, 482, 1.8, '#8e2440']]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      soft(ctx, () => ctx.ellipse(.6, 1.2, 3.2, 1.6, 0, 0, TAU), 'rgba(8,14,10,.4)', 1.2);
      ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 1.7, 0, 0, TAU); ctx.fillStyle = c; ctx.fill();
      ctx.beginPath(); ctx.ellipse(-.6, -.5, 1.8, .6, 0, 0, TAU); ctx.fillStyle = 'rgba(255,170,180,.35)'; ctx.fill();
      ctx.restore();
    }
    // A stone rabbit keeps watch in one corner; in the other, a toad sits on a fallen drum among the roses.
    briarStatue(ctx, 92, 506, 1.2);
    soft(ctx, () => ctx.ellipse(350, 548, 46, 6, 0, 0, TAU), 'rgba(6,12,8,.6)', 5);
    const drum = [[310, 508], [384, 502], [390, 542], [316, 548]];
    poly(ctx, drum, lin(ctx, 0, 504, 0, 546, [[0, '#5e6e54'], [.45, '#3e4e40'], [1, '#1e2a24']]));
    for (const x of [332, 350, 368]) emberLine(ctx, [[x, 507], [x + 1, 546]], 'rgba(8,14,10,.3)', 1.2);
    ctx.beginPath(); ctx.ellipse(312, 528, 8, 20, -.06, 0, TAU); ctx.fillStyle = lin(ctx, 304, 0, 320, 0, [[0, '#7a8a68'], [1, '#4e5e4a']]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(312, 528, 4.6, 12, -.06, 0, TAU); ctx.strokeStyle = 'rgba(8,14,10,.3)'; ctx.lineWidth = 1; ctx.stroke();
    briarMoss(ctx, 330, 382, 505, 70, .3, .6);
    briarToad(ctx, 352, 503, 1.05);
    // The briars: bushes on the capitals and plinths, canes climbing both pillars and over the arch, roses on them.
    const arcPts = (a0, a1, rr, wob, seed) => { const r = rng(seed), out = []; for (let a = a0; Math.sign(a1 - a0) * (a1 - a) > 0; a += (a1 - a0) / 9) out.push([ax + Math.cos(a) * (rr + (r() - .5) * wob), ay + Math.sin(a) * (rr + (r() - .5) * wob)]); return out; };
    briarBush(ctx, [[16, 452, 16], [40, 446, 12], [4, 430, 12], [56, 458, 10]], .4, 31);
    briarBush(ctx, [[406, 448, 16], [384, 452, 12], [416, 426, 12]], .55, 32);
    briarCane(ctx, [[34, 450], [46, 410], [30, 362], [48, 318], [32, 272], [44, 226]].concat(arcPts(3.2, 4.06, 174, 16, 3)), 5, 5, [[3, 7], [6, 7.6], [9, 6.2, true], [12, 5.8]], .45);
    briarCane(ctx, [[392, 446], [378, 404], [396, 350], [378, 292], [392, 236]].concat(arcPts(6.24, 5.5, 176, 14, 4)), 5, 6, [[2, 7.2], [7, 7.8], [11, 6, true], [12, 6.6]], .65);
    briarBush(ctx, [[14, 214, 12], [36, 206, 10], [-2, 196, 10]], .5, 33);
    briarBush(ctx, [[404, 212, 12], [384, 204, 10], [420, 196, 10]], .65, 34);
    for (const [x, y, r0, lit] of [[20, 440, 7.4, .4], [44, 434, 6, .5], [398, 438, 7.6, .6], [24, 204, 6.4, .5], [396, 200, 6.8, .7]]) briarRose(ctx, x, y, r0, x * .1, lit);
    briarCane(ctx, [[60, 548], [70, 526], [62, 504], [70, 486]], 3.4, 7, [[3, 6.2]], .5);
    briarCane(ctx, [[408, 552], [400, 524], [412, 494], [402, 474]], 3.4, 8, [[2, 6.6]], .6);
    // Motes drifting in the light, and a few fireflies along the walls.
    const rm = rng(929);
    for (let i = 0; i < 16; i++) { const t = rm(), x = 160 + t * 80 + (rm() - .5) * 40, y = 330 + t * 140 + rm() * 30; dot(ctx, x, y, .5 + rm() * .6, `rgba(255,250,210,${(.12 + rm() * .18).toFixed(3)})`); }
    for (const [x, y] of [[24, 120], [70, 168], [386, 140], [356, 262], [20, 300], [400, 380], [62, 404]]) { bloom(ctx, x, y, 10, '220,255,140', .4); dot(ctx, x, y, 1.1, 'rgba(240,255,190,.95)'); }
    // Foreground: briar in near silhouette against the light, top left and bottom right.
    briarFore(ctx, [[-14, 6], [10, 22], [34, 30], [56, 26], [72, 14], [84, -10]], 6, 35);
    briarFore(ctx, [[18, -10], [24, 14], [20, 40], [26, 62], [22, 80]], 3.6, 36);
    briarFore(ctx, [[436, 470], [414, 492], [402, 520], [404, 548], [396, 572]], 5.6, 37);
    grade(ctx, 'rgba(236,226,150,.3)', 'rgba(50,80,104,.45)', 'rgba(8,18,16,.62)');
    grain(ctx, .08);
    if (framed) frame(ctx, '#5e8a5a', '#d9e9a8');
  }

  // ---------- Level 10: Starseed Core ----------
  // The heart of the world, the bottom of the dig. The starseed lies half sunk in the floor behind the launcher and is
  // the only light: gold at its opening seam, rose where it spills up the roots, fading into a violet dark where old
  // stars hang in the dust. Every root of the world comes down the walls and curls in toward it, modelled toward it
  // and lit along the side that faces it, with a thread of gold running down each one. Two seed sprites keep watch.
  const GOLD = ['#fff4c8', '#ffd27a', '#e0a040', '#7a4a1a'];
  const CORE = [210, 540], CORE_AIR = '74,52,118', CORE_WARM = '255,196,124';
  const CORE_BARK = { dark: '#170e26', mid: '#2e1f46', lit: '#8c5274' };
  function coreMix(c0, c1, t) {
    const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), a = hex(c0), b = hex(c1), k = Math.max(0, Math.min(1, t));
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  }
  // Points pushed off a line along its normals; `taper` narrows the offset toward the end like the ribbon itself.
  function coreOffset(pts, off, taper = 0) {
    return pts.map((p, i) => {
      const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)], dx = q[0] - o[0], dy = q[1] - o[1], len = Math.hypot(dx, dy) || 1;
      const k = off * (1 - i / (pts.length - 1) * taper);
      return [p[0] - dy / len * k, p[1] + dx / len * k];
    });
  }
  // A smooth run of points along a Catmull-Rom curve through `pts`, `per` samples to each span.
  function coreSpline(pts, per = 6) {
    const out = [], n = pts.length, at = i => pts[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(j => .5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    out.push(pts[n - 1]);
    return out;
  }
  // The seed's light on an edge or a vein: strong close to it, falling away up the walls.
  const coreFall = (ctx, rgb, a, reach = 520) => rad(ctx, CORE[0], CORE[1], reach, [[0, rgba(rgb, a)], [.4, rgba(rgb, a * .6)], [1, rgba(rgb, a * .1)]]);
  // A root of the world: a tapering ribbon of bark, rounded toward the seed, with grooves along the grain, a warm rim
  // on the side that faces the light and a thread of gold running down it. `fog` sinks it into the violet air.
  function coreRoot(ctx, pts, width, seed, o = {}) {
    const fog = o.fog || 0, taper = o.taper ?? .8, glow = (o.glow ?? 1) * (1 - fog * .7), outline = ribbon2(pts, width, taper);
    const [x0, y0, x1, y1] = bounds(outline), dx = CORE[0] - (x0 + x1) / 2, dy = CORE[1] - (y0 + y1) / 2, d = Math.hypot(dx, dy) || 1, tx = dx / d, ty = dy / d;
    const tone = c => fog ? coreMix(c, o.haze || '#3c2c5c', fog) : c;
    if (o.shadow !== false) soft(ctx, () => smooth(ctx, outline.map(([x, y]) => [x - tx * 5, y - ty * 5 + 2]), true), `rgba(12,6,24,${(.55 * (1 - fog)).toFixed(3)})`, 9);
    shape(ctx, outline, tone(CORE_BARK.dark), null);
    clipTo(ctx, outline, () => {
      shape(ctx, ribbon2(pts.map(([x, y]) => [x + tx * width * .12, y + ty * width * .12]), width * .8, taper), tone(CORE_BARK.mid), null);
      ctx.save(); ctx.globalAlpha = .92 * (1 - fog * .6);
      shape(ctx, ribbon2(pts.map(([x, y]) => [x + tx * width * .27, y + ty * width * .27]), width * .34, taper), tone(CORE_BARK.lit), null);
      ctx.restore();
      if (fog < .6) {
        const r = rng(seed);
        for (let k = 0; k < Math.max(4, width / 3.4); k++) {
          const from = Math.floor(r() * (pts.length - 2)), run = pts.slice(from, from + 2 + Math.floor(r() * 3)), off = (r() - .5) * width * .7;
          stroke(ctx, coreOffset(run, off * (1 - from / (pts.length - 1) * taper)), k % 3 ? `rgba(14,6,26,${(.4 * (1 - fog)).toFixed(3)})` : `rgba(255,214,190,${(.2 * (1 - fog)).toFixed(3)})`, .8 + r() * 1.2);
        }
      }
      // Nearer the seed the bark warms.
      bloom(ctx, CORE[0], CORE[1], o.reach || 300, '255,140,110', .34 * (1 - fog));
    });
    rim(ctx, outline, coreFall(ctx, '255,196,140', .95 * (1 - fog)), tx * 3, ty * 3);
    if (glow > .05) {
      // The vein runs in the groove nearest the light and breaks where the bark closes over it.
      const cx = pts[pts.length - 1][0] - pts[0][0], cy = pts[pts.length - 1][1] - pts[0][1], vein = coreOffset(coreSpline(pts, 6), (cx * ty - cy * tx > 0 ? 1 : -1) * width * .14, taper);
      const r = rng(seed + 7), runs = [];
      for (let i = Math.floor(r() * 3); i < vein.length - 1;) { const len = 4 + Math.floor(r() * 9); runs.push(vein.slice(i, i + len + 1)); i += len + 1 + Math.floor(r() * 3); }
      for (const [w, a, rgb] of [[6, .22, '255,166,104'], [2.6, .6, '255,212,150'], [1, 1, '255,246,220']]) {
        const style = coreFall(ctx, rgb, a * glow, 520);
        for (const run of runs) stroke(ctx, run, style, w);
      }
    }
    return outline;
  }
  // A soft cloud of light: a bloom stretched into an ellipse.
  function coreHaze(ctx, x, y, rx, ry, rot, rgb, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx); bloom(ctx, 0, 0, rx, rgb, a); ctx.restore();
  }
  // Old stars in the dark: thickest along a faint band across the top, faint and tiny wherever flowers can be.
  function coreStars(ctx, seed) {
    const r = rng(seed), open = (x, y) => x > 64 && x < 356 && y > 26 && y < 450;
    const colors = ['255,246,222', '226,210,255', '200,240,236', '255,214,200'];
    for (let i = 0; i < 300; i++) {
      let x, y;
      if (i < 170) { const t = r(), n = (r() + r() + r() - 1.5) * 46; x = -20 + t * 460 - n * .38; y = 34 + t * 176 + n; }
      else { x = r() * 420; y = 20 + r() * 440; }
      const calm = open(x, y), a = calm ? .1 + r() * .22 : .3 + r() * .5, size = calm ? .35 + r() * .45 : .45 + r() * .9;
      dot(ctx, x, y, size, rgba(colors[i % 4], a));
    }
    for (const [x, y, s] of [[36, 118, 3.4], [54, 232, 2.4], [384, 92, 3], [396, 214, 2.2], [30, 352, 2.6], [404, 330, 3.2], [46, 60, 2], [372, 46, 2.4]]) {
      bloom(ctx, x, y, s * 4, '255,236,200', .3);
      sparkle(ctx, x, y, s, 'rgba(255,248,226,.85)');
    }
  }
  // Gold seed-crystals grown where the light pools: a six-sided point, its facet toward the seed lit, the far one dim.
  function coreShard(ctx, x, y, w, h, tilt, face) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); if (face > 0) ctx.scale(-1, 1);
    const body = [[-w / 2, 0], [-w / 2, -h * .7], [0, -h], [w / 2, -h * .7], [w / 2, 0]];
    poly(ctx, body, lin(ctx, 0, -h, 0, 0, [[0, '#ffe4a0'], [.55, '#d88a44'], [1, '#6a3424']]));
    poly(ctx, [[-w / 2, 0], [-w / 2, -h * .7], [0, -h], [-w * .06, 0]], lin(ctx, 0, -h, 0, 0, [[0, '#fffbe6'], [.5, '#ffd27a'], [1, '#c06a30']]));
    poly(ctx, [[w * .14, 0], [w * .14, -h * .84], [w / 2, -h * .7], [w / 2, 0]], 'rgba(70,24,40,.4)');
    stroke(ctx, [[-w / 2 + .5, -h * .68], [0, -h + .6]], 'rgba(255,252,236,.85)', .8);
    ctx.restore();
  }
  function coreCluster(ctx, x, y, s, seed, n, face) {
    const r = rng(seed), pts = [];
    for (let i = 0; i < n; i++) { const t = n === 1 ? .5 : i / (n - 1), big = Math.sin(t * Math.PI); pts.push([x + (t - .5) * s * 1.7 + (r() - .5) * s * .2, (t - .5) * 1.1 + (r() - .5) * .3, s * (.24 + big * .14), s * (.5 + big * .8 + r() * .3)]); }
    soft(ctx, () => ctx.ellipse(x, y + 1, s * 1.2, s * .22, 0, 0, TAU), 'rgba(18,6,24,.55)', 3);
    bloom(ctx, x, y - s * .5, s * 2.6, '255,196,110', .3);
    pts.sort((a, b) => a[3] - b[3]).forEach(([px, a, w, h]) => coreShard(ctx, px, y, w, h, a * .7, face));
  }
  // A seed sprite: a little sprouting seed with a face, sat on a root and lit warm from the seed's side. A character,
  // so it keeps soft colored lines.
  function coreSprite(ctx, x, y, s, face, wave) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    bloom(ctx, face * 4, -6, 24, CORE_WARM, .2);
    soft(ctx, () => ctx.ellipse(-face * 2, 1, 10, 2.4, 0, 0, TAU), 'rgba(16,6,26,.6)', 3);
    stroke(ctx, [[0, -13], [.8, -16.4], [2, -19]], '#4f9a68', 1.4);
    ctx.beginPath(); ctx.ellipse(5.4, -19.6, 4.2, 2, -.42, 0, TAU); ctx.fillStyle = lin(ctx, 2, -21, 9, -18, [[0, '#a8e8a4'], [1, '#55a070']]); ctx.fill();
    ctx.strokeStyle = 'rgba(40,104,74,.75)'; ctx.lineWidth = .7; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-2.6, -18, 2.6, 1.3, .5, 0, TAU); ctx.fillStyle = '#7cc488'; ctx.fill();
    const body = [[-8, 0], [-9, -7], [-5, -13], [3, -13.4], [8.6, -8], [8, 0], [0, 1.4]];
    shape(ctx, body, lin(ctx, face * 9, 0, -face * 8, -13, [[0, '#ffe0a4'], [.45, '#fbeacc'], [1, '#c8b0c4']]), null);
    rim(ctx, body, 'rgba(255,220,160,.9)', face * 1.6, 1.4);
    shape(ctx, body, null, 'rgba(146,84,72,.8)', 1);
    dot(ctx, -3, -6.4, 1.25, '#4a2a22'); dot(ctx, 3, -6.4, 1.25, '#4a2a22');
    dot(ctx, -2.6, -6.9, .4, 'rgba(255,255,255,.9)'); dot(ctx, 3.4, -6.9, .4, 'rgba(255,255,255,.9)');
    ctx.beginPath(); ctx.arc(0, -4.6, 1.8, .3, Math.PI - .3); ctx.strokeStyle = '#4a2a22'; ctx.lineWidth = .8; ctx.lineCap = 'round'; ctx.stroke();
    dot(ctx, -5.4, -4, 1.4, 'rgba(255,140,140,.5)'); dot(ctx, 5.4, -4, 1.4, 'rgba(255,140,140,.5)');
    if (wave) { const arm = [[7.6, -6], [12, -10], [13, -14]]; stroke(ctx, arm, 'rgba(146,84,72,.8)', 2.8); stroke(ctx, arm, '#fbe6c0', 1.4); }
    ctx.restore();
  }
  // The starseed, mostly below the floor of the world, its husk ribbed like a great seed and its seam opening on light.
  function coreSeed(ctx) {
    const seed = [[210, 452], [238, 460], [270, 484], [296, 520], [310, 566], [298, 618], [210, 648], [122, 618], [110, 566], [124, 520], [150, 484], [182, 460]];
    bloom(ctx, 210, 536, 250, '255,150,110', .38);
    soft(ctx, () => smooth(ctx, seed.map(([x, y]) => [210 + (x - 210) * 1.05, y - 3]), true), 'rgba(255,176,120,.55)', 16);
    shape(ctx, seed, rad(ctx, 210, 560, 150, [[0, '#ffd59a'], [.32, '#ee9c6e'], [.68, '#b85f6c'], [1, '#5e2a52']], 210, 530, 8), null);
    clipTo(ctx, seed, () => {
      // The husk turns away from the light inside it, so its flanks sink into plum.
      wash(ctx, lin(ctx, 110, 0, 310, 0, [[0, 'rgba(60,20,60,.5)'], [.3, 'rgba(60,20,60,0)'], [.7, 'rgba(60,20,60,0)'], [1, 'rgba(60,20,60,.5)']]), 'multiply');
      for (const k of [-.74, -.4, .4, .74]) {
        const rib = [[210 + k * 6, 456], [210 + k * 44, 486], [210 + k * 80, 528], [210 + k * 100, 580], [210 + k * 96, 640]];
        stroke(ctx, rib, 'rgba(96,30,64,.24)', 2.4);
        stroke(ctx, rib.map(([x, y]) => [x - Math.sign(k) * 1.6, y]), 'rgba(255,224,186,.18)', 1);
      }
      soft(ctx, () => ctx.ellipse(210, 470, 30, 11, 0, 0, TAU), 'rgba(255,236,204,.38)', 8);
    });
    rim(ctx, seed, 'rgba(255,220,180,.42)', 0, -1.6);
    const seam = [[210, 456], [208, 474], [212, 492], [209, 512], [212, 532], [210, 556]];
    for (const [w, c] of [[16, 'rgba(255,206,140,.13)'], [7, 'rgba(255,224,166,.32)'], [3, 'rgba(255,240,204,.7)'], [1.2, '#fffbea']]) stroke(ctx, seam, c, w);
    for (const [x, y] of [[198, 520], [223, 504], [203, 546], [219, 536]]) dot(ctx, x, y, .9, 'rgba(255,244,214,.8)');
  }
  // Specks of seed-light rising from the core along a curve, fading as they climb.
  function coreMotes(ctx, a, b, c, count, seed, spread) {
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const t = r(), [x, y] = bezierAt(a, b, c, t), px = x + (r() - .5) * spread, py = y + (r() - .5) * spread * .6, s = (.6 + r() * 1.3) * (1 - t * .5), al = (.85 - t * .6) * (.5 + r() * .5);
      if (s > 1.2) bloom(ctx, px, py, s * 5, CORE_WARM, al * .3);
      dot(ctx, px, py, s, `rgba(255,${226 + Math.round(r() * 20)},${170 + Math.round(r() * 50)},${al.toFixed(3)})`);
    }
  }
  function paintCore(ctx, framed) {
    // Violet dark above, warming through plum to rose where the seed's light reaches.
    wash(ctx, lin(ctx, 0, 0, 0, 560, [[0, '#18193a'], [.3, '#271f4c'], [.56, '#36275c'], [.78, '#4e2f66'], [.92, '#6c3664'], [1, '#7c3a5c']]));
    // Dust lit faintly from far below, and a pale band of old stars across the top.
    coreHaze(ctx, 110, 120, 170, 70, .36, '170,110,200', .16);
    coreHaze(ctx, 310, 70, 150, 50, .36, '100,190,210', .17);
    coreHaze(ctx, 120, 300, 150, 60, -.3, '110,140,230', .1);
    coreHaze(ctx, 200, 140, 260, 46, .36, '210,180,240', .1);
    coreHaze(ctx, 210, 400, 260, 120, 0, '200,100,150', .14);
    coreStars(ctx, 1010);
    // Rings of light rippling out from the seed, seen only toward the walls.
    const fade = lin(ctx, 0, 0, 420, 0, [[0, 'rgba(255,206,150,.22)'], [.22, 'rgba(255,206,150,0)'], [.78, 'rgba(255,206,150,0)'], [1, 'rgba(255,206,150,.22)']]);
    for (const [rr, w] of [[230, 1.2], [300, 1], [376, 1.3], [456, .9], [540, 1.1]]) { ctx.beginPath(); ctx.arc(210, 620, rr, Math.PI, TAU); ctx.strokeStyle = fade; ctx.lineWidth = w; ctx.stroke(); }
    // Far roots hanging down out of the dark, all leaning toward the light, almost lost in the air.
    for (const [pts, w, sd, fog] of [
      [[[120, -10], [112, 100], [130, 210], [154, 306], [174, 394], [188, 452]], 22, 1, .8], [[[302, -10], [314, 120], [294, 236], [264, 336], [242, 428]], 24, 2, .8],
      [[[206, -10], [200, 60], [210, 128], [204, 186]], 11, 3, .72], [[[66, -10], [80, 80], [104, 168]], 14, 4, .7], [[[358, -10], [344, 76], [326, 150]], 13, 5, .7]]) coreRoot(ctx, pts, w, sd, { fog, shadow: false, glow: .22 });
    air(ctx, 20, 470, CORE_AIR, .2, .06);
    // The shafts of light fanning up from the seam, kept off the middle of the board.
    for (const [a, al] of [[-.62, .05], [-.38, .04], [.38, .04], [.62, .05]]) shaft(ctx, 210, 474, -Math.PI / 2 + a, 470, 5, 64, '255,206,150', al);
    // The walls: dark earth wrapped in roots, the faces toward the seed catching it.
    for (const [wall, side] of [
      [[[-20, -10], [44, -10], [56, 70], [42, 150], [60, 238], [48, 326], [64, 404], [56, 472], [-20, 486]], -1],
      [[[440, -10], [376, -10], [364, 76], [378, 156], [360, 244], [372, 330], [356, 410], [366, 472], [440, 486]], 1]]) {
      const [x0, , x1] = bounds(wall);
      soft(ctx, () => smooth(ctx, wall.map(([x, y]) => [x - side * 8, y]), true), 'rgba(10,4,20,.5)', 14);
      shape(ctx, wall, side < 0 ? lin(ctx, x1, 0, x0, 0, [[0, '#3c2a54'], [.5, '#2a1d42'], [1, '#1a1230']]) : lin(ctx, x0, 0, x1, 0, [[0, '#3c2a54'], [.5, '#2a1d42'], [1, '#1a1230']]), null);
      clipTo(ctx, wall, () => { bloom(ctx, CORE[0], CORE[1], 340, '255,130,110', .3); grit(ctx, x0, 0, x1 - x0, 480, 70, 40 + side, null); });
      rim(ctx, wall, 'rgba(255,180,150,.28)', -side * 2, 1.2);
    }
    for (const [pts, w, sd] of [
      [[[30, -10], [44, 90], [30, 196], [48, 296]], 18, 11], [[[-10, 116], [22, 190], [42, 262], [34, 334]], 14, 12], [[[56, -10], [50, 40], [62, 92]], 9, 13],
      [[[392, -10], [378, 96], [392, 200], [372, 300]], 18, 14], [[[430, 140], [398, 206], [380, 278], [388, 350]], 14, 15], [[[362, -10], [370, 44], [358, 96]], 9, 16]]) coreRoot(ctx, pts, w, sd, { fog: .3, glow: .7 });
    // The roof of the world, lit from far below along its underside.
    const roof = [[-10, -10], [430, -10], [430, 26], [372, 34], [300, 24], [240, 36], [180, 26], [118, 38], [58, 28], [-10, 36]];
    shape(ctx, roof, lin(ctx, 0, 0, 0, 38, [[0, '#120c22'], [1, '#2a1d40']]), null);
    rim(ctx, roof, 'rgba(255,190,160,.3)', 0, 1.8);
    coreRoot(ctx, [[96, -10], [92, 30], [72, 72], [56, 114], [40, 164]], 16, 21, { glow: .6 });
    coreRoot(ctx, [[324, -10], [330, 34], [350, 78], [368, 124]], 15, 22, { glow: .6 });
    coreRoot(ctx, [[190, 16], [196, 34], [188, 52]], 7, 23, { glow: .4, fog: .2 });
    coreRoot(ctx, [[252, 20], [246, 40], [254, 58], [250, 70]], 6, 24, { glow: .4, fog: .2 });
    // The floor of the world: rooty earth dipping toward the seed, its top lit warm in the middle.
    const ground = [[-20, 458], [30, 466], [80, 482], [124, 498], [166, 508], [210, 512], [254, 508], [296, 498], [340, 482], [390, 466], [440, 458]];
    soft(ctx, () => { smooth(ctx, ground.map(([x, y]) => [x, y - 4]), false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, 'rgba(12,4,22,.5)', 10);
    band(ctx, ground, 600, lin(ctx, 0, 456, 0, 560, [[0, '#4a2c56'], [.5, '#352046'], [1, '#22132e']]));
    rim(ctx, ground.concat([[440, 600], [-20, 600]]), lin(ctx, 0, 0, 420, 0, [[0, 'rgba(255,190,150,.12)'], [.5, 'rgba(255,214,170,.6)'], [1, 'rgba(255,190,150,.12)']]), 0, -2.2);
    grit(ctx, 0, 462, 420, 100, 90, 1012, (x) => Math.abs(x - 210) > 96);
    // The seed, and the floor's near lip lying over its lower half.
    coreSeed(ctx);
    for (const [a, al] of [[-.18, .05], [.18, .05]]) shaft(ctx, 210, 470, -Math.PI / 2 + a, 150, 4, 26, '255,226,180', al);
    // The two great roots come down the walls and curl in to cradle the seed.
    coreRoot(ctx, [[-30, -10], [22, 80], [8, 180], [30, 280], [14, 370], [42, 440], [84, 486], [116, 516], [128, 566]], 64, 31, { taper: .72, reach: 260 });
    coreRoot(ctx, [[450, -10], [398, 90], [412, 200], [390, 300], [406, 390], [378, 450], [336, 490], [304, 518], [292, 566]], 60, 32, { taper: .72, reach: 260 });
    coreRoot(ctx, [[26, 300], [60, 330], [72, 372], [64, 410]], 12, 33, { glow: .8 });
    coreRoot(ctx, [[396, 236], [362, 262], [352, 300]], 11, 34, { glow: .8 });
    coreRoot(ctx, [[40, 470], [78, 516], [94, 566]], 22, 35, { glow: .8 });
    coreRoot(ctx, [[380, 470], [350, 516], [336, 566]], 20, 36, { glow: .8 });
    const lip = [[-20, 538], [60, 534], [120, 542], [164, 550], [210, 554], [256, 550], [300, 542], [360, 534], [440, 538]];
    soft(ctx, () => { smooth(ctx, lip.map(([x, y]) => [x, y - 3]), false); ctx.lineTo(440, 600); ctx.lineTo(-20, 600); ctx.closePath(); }, 'rgba(255,190,130,.35)', 6);
    band(ctx, lip, 600, lin(ctx, 0, 534, 0, 560, [[0, '#3a2040'], [1, '#1c0f22']]));
    rim(ctx, lip.concat([[440, 600], [-20, 600]]), lin(ctx, 0, 0, 420, 0, [[0, 'rgba(255,200,160,0)'], [.5, 'rgba(255,224,180,.7)'], [1, 'rgba(255,200,160,0)']]), 0, -1.8);
    // Gold seed-crystals where the light pools, and the two seed sprites keeping watch from the great roots.
    coreShard(ctx, 120, 512, 6.4, 14, -.42, 1); coreShard(ctx, 130, 516, 4, 8, .1, 1);
    coreShard(ctx, 300, 512, 6, 13, .45, -1);
    coreSprite(ctx, 74, 466, 1, 1, true);
    coreSprite(ctx, 350, 474, .9, -1, false);
    // Seed-light drifting up the walls.
    coreMotes(ctx, [120, 500], [40, 380], [56, 150], 26, 41, 26);
    coreMotes(ctx, [300, 500], [384, 380], [366, 170], 22, 42, 24);
    coreMotes(ctx, [170, 480], [130, 470], [96, 430], 6, 43, 10);
    // Foreground: two dark roots across the bottom corners, almost silhouettes.
    for (const [pts, w, side] of [[[[-26, 506], [26, 528], [62, 566]], 40, -1], [[[446, 498], [396, 528], [362, 566]], 36, 1]]) {
      const out = ribbon2(pts, w, .55);
      shape(ctx, out, '#140b1e', null);
      rim(ctx, out, 'rgba(255,170,140,.3)', -side * 1.6, -1.2);
    }
    coreCluster(ctx, 38, 550, 16, 91, 5, 1);
    coreCluster(ctx, 386, 546, 14, 92, 4, -1);
    grade(ctx, 'rgba(112,100,220,.42)', 'rgba(255,170,104,.42)', 'rgba(16,6,30,.58)');
    grain(ctx, .08);
    if (framed) frame(ctx, '#c4894a', '#ffe3a8');
  }

  // ---------- Obstacles in the play area ----------
  function stoneRock(ctx, half, seed) {
    const pts = [[-half, 0], [-half + 4, -8], [-half * .3, -10.5], [half * .4, -9.5], [half - 3, -7], [half + 1, 1], [half - 5, 8.5], [-half * .1, 10], [-half + 5, 8]];
    shape(ctx, pts, '#c9bfae', null); cel(ctx, pts, '#a89c88', 3, 5); shape(ctx, pts, null, '#5f5040', 1.7);
    stroke(ctx, [[-half * .5, -6], [-half * .1, -7.5], [half * .35, -6.6]], 'rgba(255,255,255,.7)', 1.4);
    const r = rng(seed);
    stroke(ctx, [[half * .1 + r() * 6, -2], [half * .2 + r() * 4, 3], [half * .32, 5]], 'rgba(95,80,64,.6)', 1);
    dot(ctx, -half * .45, 3, 1.2, 'rgba(95,80,64,.5)'); dot(ctx, half * .55, -1, .9, 'rgba(95,80,64,.5)');
  }
  function mossyRock(ctx, half, seed) {
    const pts = [[-half, 1], [-half + 3, -8], [-half * .2, -10.5], [half * .5, -9], [half, -2], [half - 3, 8], [-half * .2, 10], [-half + 4, 8]];
    shape(ctx, pts, '#6a5a86', null); cel(ctx, pts, '#54466f', 3, 5); shape(ctx, pts, null, '#241a36', 1.7);
    const moss = [[-half + 2, -6], [-half * .4, -11.5], [half * .2, -12], [half - 2, -5], [half * .3, -7], [-half * .3, -6.5]];
    shape(ctx, moss, '#7fc489', '#3f6b49', 1.1);
    const r = rng(seed);
    dot(ctx, -half * .2 + r() * 6, -12.5, 1.6, '#c9f2c7');
    ctx.save(); ctx.translate(half * .45, -9); mushroomTiny(ctx); ctx.restore();
  }
  function mushroomTiny(ctx) {
    ctx.fillStyle = '#f3e3cc'; ctx.fillRect(-1.3, -5, 2.6, 5);
    ctx.beginPath(); ctx.ellipse(0, -5.5, 4.5, 3, 0, Math.PI, TAU); ctx.closePath(); ctx.fillStyle = '#6fe0cf'; ctx.fill(); ctx.strokeStyle = '#2a6d63'; ctx.lineWidth = .9; ctx.stroke();
  }
  function crystalRock(ctx, half) {
    const pts = [[-half - 4, 0], [-half + 5, -9], [half - 5, -9], [half + 4, 0], [half - 5, 9], [-half + 5, 9]];
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); };
    path(); ctx.fillStyle = '#5fd0ec'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-half - 4, 0); ctx.lineTo(-half + 5, -9); ctx.lineTo(half - 5, -9); ctx.lineTo(half - 1, -2); ctx.lineTo(-half + 2, -2); ctx.closePath(); ctx.fillStyle = '#b9f6ff'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-half + 3, 3); ctx.lineTo(half - 1, 3); ctx.lineTo(half - 5, 9); ctx.lineTo(-half + 5, 9); ctx.closePath(); ctx.fillStyle = '#2e93c4'; ctx.fill();
    path(); ctx.strokeStyle = '#123a5c'; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-half + 7, -5.5); ctx.lineTo(half * .2, -5.5); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.stroke();
  }
  function logRock(ctx, half) {
    const pts = [[-half, -7], [half, -7], [half, 7], [-half, 7]];
    ctx.beginPath(); ctx.moveTo(-half + 3, -7.5); ctx.lineTo(half - 3, -7.5); ctx.quadraticCurveTo(half + 2, 0, half - 3, 7.5); ctx.lineTo(-half + 3, 7.5); ctx.closePath();
    ctx.fillStyle = '#c48a55'; ctx.fill(); ctx.strokeStyle = '#6e4322'; ctx.lineWidth = 1.6; ctx.stroke();
    for (const y of [-3, 2.5]) stroke(ctx, [[-half + 6, y], [0, y + .8], [half - 8, y]], 'rgba(110,67,34,.55)', 1);
    ctx.beginPath(); ctx.ellipse(-half + 3, 0, 4, 7.5, 0, 0, TAU); ctx.fillStyle = '#e8bf8a'; ctx.fill(); ctx.strokeStyle = '#6e4322'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-half + 3, 0, 2, 4, 0, 0, TAU); ctx.strokeStyle = '#b07c48'; ctx.lineWidth = .9; ctx.stroke();
    void pts;
  }
  // Deep-level rocks, each made of its own level's stuff and kept inside the same capsule.
  function slickRock(ctx, half, seed) {
    const pts = [[-half, 1], [-half + 4, -7.6], [-half * .3, -10.2], [half * .45, -9.4], [half - 2, -6], [half + 1, 2], [half - 5, 8.8], [-half * .15, 10], [-half + 5, 8.4]];
    shape(ctx, pts, '#3c5d72', null); cel(ctx, pts, '#2c4659', 3, 5); shape(ctx, pts, null, '#0c2030', 1.7);
    stroke(ctx, [[-half * .6, -6.4], [-half * .2, -8], [half * .3, -7.4]], 'rgba(205,250,255,.8)', 1.5);
    stroke(ctx, [[-half * .62, -2.4], [-half * .4, -3.4]], 'rgba(205,250,255,.5)', 1.1);
    dot(ctx, half * .48, -5.4, 1.3, 'rgba(225,255,255,.85)');
    const r = rng(seed), moss = [[half * .05, -9.6], [half * .3, -12], [half * .62, -10.6], [half * .8, -7], [half * .5, -7.4], [half * .2, -7.8]];
    shape(ctx, moss, '#3f8f7a', '#14403a', 1);
    dot(ctx, half * (.25 + r() * .3), -10.4, .9, '#a8ffdf');
    stroke(ctx, [[-half * .1, 9.6], [-half * .1 + .4, 13]], 'rgba(170,240,240,.6)', 1); dot(ctx, -half * .1 + .4, 14.2, 1.2, 'rgba(190,245,250,.8)');
  }
  function sandRock(ctx, half, seed) {
    const pts = [[-half - 1, 0], [-half + 3, -8.6], [-half * .2, -10.2], [half * .5, -9.6], [half, -4], [half - 1, 6], [half - 6, 9.6], [-half * .3, 10], [-half + 4, 8]];
    shape(ctx, pts, '#f0d2a2', null);
    clipTo(ctx, pts, () => {
      for (const [y, c] of [[-3.6, '#e8c08c'], [3.4, '#efcfa0'], [7, '#e2b682']]) band(ctx, ridge(y, 1, seed + y, 18, -half - 10, half + 10), 20, c, 'rgba(150,96,50,.4)', .9);
    });
    cel(ctx, pts, 'rgba(176,112,58,.32)', 3, 5); shape(ctx, pts, null, '#8a5530', 1.7);
    stroke(ctx, [[-half * .6, -7], [-half * .1, -8.4], [half * .4, -7.6]], 'rgba(255,250,236,.85)', 1.4);
    const sx = half * .32;
    dot(ctx, sx, 1, 6.2, 'rgba(160,104,56,.22)');
    ammonite(ctx, sx, 1, 5, .6, '#f6e2c0', '#e3c79c', '#8a5a34');
    dot(ctx, -half * .5, 2, 1.1, 'rgba(138,90,52,.5)'); dot(ctx, -half * .3, 6, .8, 'rgba(138,90,52,.5)');
  }
  function basaltRock(ctx, half, seed) {
    const top = [[-half + 3, -9.6], [half - 3, -9.6], [half + 2, -3.4], [-half - 2, -3.4]], mid = [[-half - 2, -3.4], [half + 2, -3.4], [half + 2, 4], [-half - 2, 4]], bot = [[-half - 2, 4], [half + 2, 4], [half - 3, 9.8], [-half + 3, 9.8]];
    poly(ctx, top, '#6a4356', null); poly(ctx, mid, '#4a2c3c', null); poly(ctx, bot, '#30192a', null);
    for (const y of [-3.4, 4]) stroke(ctx, [[-half - 2, y], [half + 2, y]], 'rgba(23,10,18,.8)', 1);
    const r = rng(seed), crack = [[-half * .74, -.6]];
    let cx = -half * .74;
    while (cx < half * .7) { cx += half * (.18 + r() * .2); crack.push([Math.min(cx, half * .72), (r() - .5) * 5.2]); }
    magma(ctx, crack, .6);
    const fork = crack[Math.min(2, crack.length - 1)];
    magma(ctx, [fork, [fork[0] + 4, fork[1] - 3.4], [fork[0] + 7, -5.6]], .45);
    poly(ctx, [[-half + 3, -9.6], [half - 3, -9.6], [half + 2, -3.4], [half + 2, 4], [half - 3, 9.8], [-half + 3, 9.8], [-half - 2, 4], [-half - 2, -3.4]], null, '#170a12', 1.7);
    poly(ctx, [[-half - 2, -3.4], [-half + 3, -9.6], [-half + 7, -3.4], [-half + 7, 4], [-half + 3, 9.8], [-half - 2, 4]], '#7a5064', '#170a12', 1.2);
    stroke(ctx, [[-half + 8, -7.6], [half - 6, -7.6]], 'rgba(255,214,190,.4)', 1.1);
  }
  function geodeRock(ctx, half, seed) {
    const pts = [[-half, 1], [-half + 4, -8.4], [-half * .3, -10.4], [half * .4, -9.8], [half - 2, -6], [half + 1, 2], [half - 5, 9], [-half * .1, 10.2], [-half + 5, 8.4]];
    shape(ctx, pts, '#7a6878', null); cel(ctx, pts, '#5c4b60', 3, 5);
    const r = rng(seed), wx = half * .06, rx = half * .56, n = 14, mouth = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU, k = (i % 2 ? .8 : 1) + (r() - .5) * .12; mouth.push([wx + Math.cos(a) * rx * k, -.6 + Math.sin(a) * 5.8 * k]); }
    poly(ctx, mouth.map(([x, y]) => [wx + (x - wx) * 1.12, -.6 + (y + .6) * 1.25]), '#efe2f8', '#b9a2d4', .9);
    poly(ctx, mouth, '#4a2d84', null);
    for (let i = 0; i < n; i++) {
      const [px, py] = mouth[i], [qx, qy] = mouth[(i + 1) % n], tx = px + (wx - px) * .5, ty = py + (-.6 - py) * .55;
      poly(ctx, [[px, py], [tx, ty], [qx, qy]], py < 0 ? '#c7a4ff' : '#8a5ad6', 'rgba(46,22,96,.7)', .6);
    }
    poly(ctx, mouth, null, '#2e1a5a', 1);
    sparkle(ctx, wx - rx * .3, -2.6, 2.6, '#ffffff');
    shape(ctx, pts, null, '#2a1e33', 1.7);
    for (const [dx, dy] of [[-.8, 5], [.78, -5.4], [-.66, -5]]) dot(ctx, half * dx, dy, .9, 'rgba(42,30,51,.5)');
  }
  function vaultRock(ctx, half, seed) {
    const pts = [[-half + 2, -9.6], [half - 2, -9.6], [half + 1, -6.6], [half + 1, 7.6], [half - 2, 10], [-half + 2, 10], [-half - 1, 7.6], [-half - 1, -6.6]];
    poly(ctx, pts, '#6b7764', null);
    clipTo(ctx, pts, () => { ctx.fillStyle = '#525d4d'; ctx.fillRect(-half - 4, 5, half * 2 + 8, 8); ctx.fillRect(half - 4, -12, 8, 24); });
    poly(ctx, pts, null, '#1f2820', 1.7);
    stroke(ctx, [[-half + 3, -7.6], [half - 4, -7.6]], 'rgba(200,220,180,.55)', 1.1);
    for (const x of [-half * .45, half * .45]) stroke(ctx, [[x, -9.4], [x + .6, 9.6]], 'rgba(18,26,20,.45)', 1);
    leafGlyph(ctx, 0, .6, .62, Math.PI / 2);
    const r = rng(seed), moss = [[-half - 1, -6], [-half + 2, -12], [-half * .5, -12.6], [-half * .1, -10.6], [-half * .1, -8.4], [-half * .6, -8], [-half + 1, -3]];
    shape(ctx, moss, '#6f9e50', '#2c4a26', 1.1);
    dot(ctx, -half * .6 + r() * 4, -11.4, 1, 'rgba(220,250,170,.7)');
    stroke(ctx, [[half * .55, -9.6], [half * .7, -13], [half * .9, -12.4]], '#3f6b37', 1.2);
    leaf(ctx, half * .7, -12.8, 5.4, -1.2);
  }
  function knotRock(ctx, half, seed) {
    const r = rng(seed);
    dot(ctx, 2, -4, 16, 'rgba(255,206,130,.10)'); dot(ctx, 2, -4, 10, 'rgba(255,206,130,.16)');
    // A length of root swelling into a knot, a gold crystal pushing out of it.
    const body = [[-half - 1, -1], [-half + 3, -7], [-half * .45, -7.4], [-half * .12, -10], [half * .22, -10.2], [half * .5, -7.2], [half - 3, -7], [half + 1, 0], [half - 3, 7.4], [half * .4, 7.6], [half * .1, 10], [-half * .3, 9.6], [-half * .5, 7.4], [-half + 3, 7.4]];
    shape(ctx, body, '#4f3058', null);
    clipTo(ctx, body, () => {
      for (const y of [-4.6, -.4, 4]) stroke(ctx, [[-half - 2, y + (r() - .5) * 2], [-half * .3, y + (r() - .5) * 2], [half * .3, y + (r() - .5) * 2.4], [half + 2, y]], 'rgba(22,10,32,.42)', 1.1);
      ctx.beginPath(); ctx.ellipse(-half * .1, 0, 6.4, 8, 0, 0, TAU); ctx.strokeStyle = 'rgba(22,10,32,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    });
    cel(ctx, body, '#3a2245', 2.6, 4.4); shape(ctx, body, null, '#1a0d22', 1.7);
    for (const [w, c] of [[4, 'rgba(255,190,110,.18)'], [1.8, 'rgba(255,215,140,.6)'], [.7, '#fff0c8']]) stroke(ctx, [[-half + 4, 2.6], [-half * .4, 1.4], [-half * .1, 3.4], [half * .4, 1.6], [half - 4, 2.8]], c, w);
    stroke(ctx, [[-half + 5, -5.6], [-half * .45, -5.8], [-half * .14, -8.2]], 'rgba(200,160,230,.45)', 1.1);
    crystal(ctx, half * .1, -5, 7.6, 14, .3, GOLD); crystal(ctx, half * .1 - 5, -4.4, 5, 9, -.45, GOLD);
    const curl = [[half * .55, 7], [half * .7, 11], [half * .86, 10.6], [half * .9, 8]];
    stroke(ctx, curl, '#1a0d22', 3.2); stroke(ctx, curl, '#6b4876', 1.4);
    sparkle(ctx, half * .42, -12, 2.4, '#fff6dc');
  }
  // Rocks are drawn at their collision size: a capsule `length` long and about 21 px thick.
  function drawRock(ctx, rock, theme) {
    const half = (Number(rock.length) || 50) / 2;
    ctx.save();
    if (rock.slide) {
      // Sliding crystals ride a groove, so the player can see the whole path they move along.
      const ux = Math.cos(rock.angle), uy = Math.sin(rock.angle), bx = rock.baseX ?? rock.x;
      ctx.beginPath(); ctx.moveTo(bx - rock.slide - ux * half, rock.y + 13 - uy * half); ctx.lineTo(bx + rock.slide + ux * half, rock.y + 13 + uy * half);
      ctx.strokeStyle = 'rgba(10,20,36,.45)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = 'rgba(160,220,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.translate(rock.x, rock.y); ctx.rotate(rock.angle || 0);
    ctx.save(); ctx.translate(2, 4); ctx.globalAlpha = .22; ctx.beginPath(); ctx.ellipse(0, 0, half + 4, 9, 0, 0, TAU); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    const seed = String(rock.id || '').length * 31 + Math.round(half);
    if (theme === 'depth-crystal') crystalRock(ctx, half);
    else if (theme === 'depth-lake') slickRock(ctx, half, seed);
    else if (theme === 'depth-fossil') sandRock(ctx, half, seed);
    else if (theme === 'depth-ember') basaltRock(ctx, half, seed);
    else if (theme === 'depth-geode') geodeRock(ctx, half, seed);
    else if (theme === 'depth-briar') vaultRock(ctx, half, seed);
    else if (theme === 'depth-core') knotRock(ctx, half, seed);
    else if (theme === 'depth-grotto') mossyRock(ctx, half, seed);
    else if (theme === 'depth-meadow') logRock(ctx, half);
    else stoneRock(ctx, half, seed);
    ctx.restore();
  }

  const SCENES = {
    'depth-meadow': { paint: paintMeadow, dark: false, ink: '#3c6a4c' },
    'depth-roots': { paint: paintRoots, dark: false, ink: '#4b2a16' },
    'depth-grotto': { paint: paintGrotto, dark: true, ink: '#e9dcff' },
    'depth-crystal': { paint: paintCrystal, dark: true, ink: '#d8f3ff' },
    'depth-lake': { paint: paintLake, dark: true, ink: '#d2f6ee' },
    'depth-fossil': { paint: paintFossil, dark: false, ink: '#6a4222' },
    'depth-ember': { paint: paintEmber, dark: true, ink: '#ffdcc4' },
    'depth-geode': { paint: paintGeode, dark: true, ink: '#efdcff' },
    'depth-briar': { paint: paintBriar, dark: true, ink: '#e4f0cf' },
    'depth-core': { paint: paintCore, dark: true, ink: '#ffe8bf' }
  };
  function has(theme) { return Object.prototype.hasOwnProperty.call(SCENES, theme); }
  // The board keeps its painted frame; a level card shows the same scene without it.
  function paint(ctx, theme, options) { if (has(theme)) SCENES[theme].paint(ctx, !(options && options.frame === false)); }
  // The garden worlds share the kit but not the level behaviours (burrows, cave water), so they have their own entry.
  const GARDENS = { meadow: paintGardenMeadow, moon: paintGardenMoon, koi: paintGardenKoi };
  const garden = theme => Object.prototype.hasOwnProperty.call(GARDENS, theme);
  function paintGarden(ctx, theme, rush, framed = true) { if (garden(theme)) GARDENS[theme](ctx, Boolean(rush), framed); }
  // A few brushes from the painter's kit, for the other painted screens (the Garden tab's map).
  const kit = Object.freeze({ lin, rad, rgba, soft, bloom, grain, clump, scallop, shape, smooth, clipTo });
  root.BloomScenery = Object.freeze({ has, paint, garden, paintGarden, drawRock, kit, dark: theme => has(theme) && SCENES[theme].dark, ink: theme => has(theme) ? SCENES[theme].ink : null, themes: Object.keys(SCENES) });
})(typeof window !== 'undefined' ? window : globalThis);
