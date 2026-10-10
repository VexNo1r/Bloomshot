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
  function mushroom(ctx, x, y, w, h, cap, capDark, spots, glow, tilt = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    if (glow) { dot(ctx, 0, -h * .9, w * 1.25, glow + '22'); dot(ctx, 0, -h * .9, w * .85, glow + '30'); }
    ctx.beginPath(); ctx.moveTo(-w * .2, 0); ctx.quadraticCurveTo(-w * .26, -h * .5, -w * .16, -h * .82); ctx.lineTo(w * .16, -h * .82); ctx.quadraticCurveTo(w * .26, -h * .5, w * .2, 0); ctx.closePath();
    ctx.fillStyle = '#f3e3cc'; ctx.fill(); ctx.strokeStyle = '#5b3f52'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * .06, -h * .1); ctx.quadraticCurveTo(w * .12, -h * .45, w * .08, -h * .75); ctx.strokeStyle = '#d8c2a6'; ctx.lineWidth = 1.4; ctx.stroke();
    const capPts = [[-w * .55, -h * .78], [-w * .5, -h * 1.08], [-w * .2, -h * 1.3], [w * .2, -h * 1.3], [w * .5, -h * 1.08], [w * .55, -h * .78], [0, -h * .7]];
    shape(ctx, capPts, cap, null); cel(ctx, capPts, capDark, w * .12, h * .1); shape(ctx, capPts, null, '#4a2a3e', 1.4);
    for (const [sx, sy, sr] of spots) dot(ctx, sx * w, -h + sy * h, sr * w, '#fff2e4');
    ctx.beginPath(); ctx.arc(-w * .22, -h * 1.12, w * .16, 3.6, 4.7); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  function caveWall(ctx, pts, fill, shade, line) { shape(ctx, pts, fill, null); cel(ctx, pts, shade, 6, 4); shape(ctx, pts, null, line, 1.8); }
  function snail(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-4, -3, 10, -2); ctx.quadraticCurveTo(16, -8, 15, -13); ctx.lineTo(18, -12); ctx.quadraticCurveTo(19, -4, 14, 0); ctx.closePath();
    ctx.fillStyle = '#c9d7a8'; ctx.fill(); ctx.strokeStyle = '#59633c'; ctx.lineWidth = 1.1; ctx.stroke();
    for (const [ax, ay] of [[15, -13], [18, -12]]) { stroke(ctx, [[ax, ay], [ax + 1, ay - 6]], '#59633c', .9); dot(ctx, ax + 1, ay - 6.5, 1.1, '#59633c'); }
    dot(ctx, -2, -9, 9, '#f2b75a'); ctx.beginPath(); ctx.arc(-2, -9, 9, 0, TAU); ctx.strokeStyle = '#8a5a23'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); for (let a = 0; a < 2.6 * TAU; a += .2) { const rr = 1 + a * .45; ctx.lineTo(-2 + Math.cos(a) * rr, -9 + Math.sin(a) * rr); } ctx.strokeStyle = '#a86f2a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  function bat(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    stroke(ctx, [[0, -14], [0, -8]], '#1a1229', 1.4);
    const wings = [[-9, -6], [-12, 4], [-6, 12], [0, 14], [6, 12], [12, 4], [9, -6], [0, -9]];
    shape(ctx, wings, '#5d4a7e', '#1a1229', 1.4);
    stroke(ctx, [[-6, 0], [-4, 8]], 'rgba(26,18,41,.5)', 1); stroke(ctx, [[6, 0], [4, 8]], 'rgba(26,18,41,.5)', 1);
    // Hanging upside down, fast asleep.
    for (const ex of [-2.6, 2.6]) { ctx.beginPath(); ctx.arc(ex, 6, 1.6, Math.PI + .3, -.3); ctx.strokeStyle = '#f1e6ff'; ctx.lineWidth = 1; ctx.stroke(); }
    for (const ex of [-4, 4]) { ctx.beginPath(); ctx.moveTo(ex - 2, 12); ctx.lineTo(ex, 16); ctx.lineTo(ex + 2, 12); ctx.fillStyle = '#5d4a7e'; ctx.fill(); }
    ctx.restore();
  }
  function glowVine(ctx, x, len, seed) {
    const r = rng(seed), pts = [];
    for (let i = 0; i <= 5; i++) pts.push([x + Math.sin(i * 1.3 + seed) * 4, 30 + len * i / 5]);
    stroke(ctx, pts, '#2c6e64', 2.2); stroke(ctx, pts, '#3f9a8a', 1.1);
    for (let i = 1; i <= 5; i++) {
      const p = pts[i], side = i % 2 ? -1 : 1;
      ctx.beginPath(); ctx.ellipse(p[0] + side * 4, p[1] - 2, 3.4, 1.8, side * .6, 0, TAU); ctx.fillStyle = '#4fb39f'; ctx.fill();
      if (i > 1 && r() < .8) { dot(ctx, p[0], p[1] + 3, 7, 'rgba(143,245,227,.16)'); dot(ctx, p[0], p[1] + 3, 3, '#a8fbe9'); dot(ctx, p[0] - .8, p[1] + 2.2, 1, '#ffffff'); }
    }
  }
  function paintGrotto(ctx, framed) {
    const back = ctx.createLinearGradient(0, 0, 0, 560);
    back.addColorStop(0, '#4f3f6e'); back.addColorStop(.6, '#41335d'); back.addColorStop(1, '#2f2445');
    ctx.fillStyle = back; ctx.fillRect(0, 0, 420, 560);
    // Far pillars and hanging rock, pale with distance.
    for (const [x, w, s] of [[128, 46, 1], [304, 56, 2]]) {
      const col = [[x - w / 2, 560], [x - w * .32, 380], [x - w * .18, 300], [x - w * .3, 210], [x - w * .5, 40], [x + w * .5, 40], [x + w * .28, 200], [x + w * .2, 310], [x + w * .34, 400], [x + w / 2, 560]];
      shape(ctx, col, '#574776', 'rgba(130,110,170,.35)', 1.2);
      cel(ctx, col, '#4f406d', 8, 0);
      void s;
    }
    // A crack in the ceiling lets a shaft of daylight in.
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.beginPath(); ctx.moveTo(236, 36); ctx.lineTo(262, 36); ctx.lineTo(330, 452); ctx.lineTo(176, 452); ctx.closePath();
    ctx.fillStyle = 'rgba(190,170,255,.10)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(242, 36); ctx.lineTo(256, 36); ctx.lineTo(290, 452); ctx.lineTo(214, 452); ctx.closePath();
    ctx.fillStyle = 'rgba(220,210,255,.08)'; ctx.fill();
    ctx.restore();
    const rs = rng(55);
    for (let i = 0; i < 10; i++) { const x = 70 + rs() * 280, y = 70 + rs() * 330; stroke(ctx, [[x, y], [x + 6 + rs() * 8, y + 6], [x + 4, y + 14 + rs() * 8]], 'rgba(40,28,62,.40)', 1.1); }
    // Ceiling with stalactites, glow vines and a sleeping bat.
    caveWall(ctx, [[-10, -10], [430, -10], [430, 34], [380, 48], [330, 36], [276, 54], [262, 36], [236, 36], [220, 50], [160, 40], [100, 52], [40, 38], [-10, 46]], '#2f2443', '#261d38', '#1a1229');
    dot(ctx, 249, 36, 7, '#e9e2ff');
    for (const [x, w, h] of [[76, 18, 34], [118, 12, 20], [300, 16, 30], [342, 10, 18]]) {
      ctx.beginPath(); ctx.moveTo(x - w / 2, 44); ctx.quadraticCurveTo(x - w * .2, 44 + h * .6, x, 44 + h); ctx.quadraticCurveTo(x + w * .25, 44 + h * .55, x + w / 2, 44); ctx.closePath();
      ctx.fillStyle = '#2f2443'; ctx.fill(); ctx.strokeStyle = '#1a1229'; ctx.lineWidth = 1.5; ctx.stroke();
      stroke(ctx, [[x - w * .25, 48], [x - w * .1, 44 + h * .6]], 'rgba(150,130,200,.45)', 1.1);
    }
    glowVine(ctx, 54, 120, 1); glowVine(ctx, 158, 54, 2); glowVine(ctx, 334, 86, 3); glowVine(ctx, 372, 150, 4);
    bat(ctx, 290, 64, 1);
    // Side walls with ledges, each ledge growing glowing mushrooms.
    const left = [[-10, 40], [40, 52], [52, 124], [34, 170], [70, 214], [44, 256], [28, 330], [62, 380], [36, 452], [-10, 460]];
    caveWall(ctx, left, '#2c2140', '#231a34', '#160f22');
    const right = [[430, 40], [382, 52], [368, 112], [392, 160], [356, 204], [380, 270], [396, 320], [362, 380], [388, 452], [430, 460]];
    caveWall(ctx, right, '#2c2140', '#231a34', '#160f22');
    for (const [pts, c] of [[[[36, 214], [70, 214], [62, 222], [30, 222]], '#5f9a6a'], [[[350, 204], [384, 204], [384, 212], [356, 212]], '#5f9a6a'], [[[24, 380], [62, 380], [56, 388], [20, 388]], '#5f9a6a']]) shape(ctx, pts, c, '#3f6b49', 1.1);
    mushroom(ctx, 56, 216, 22, 22, '#6fe0cf', '#4fbfb0', [[-.2, -.18, .08], [.18, -.12, .06], [-.02, -.25, .05]], '#8ff5e3', .08);
    mushroom(ctx, 38, 214, 13, 13, '#6fe0cf', '#4fbfb0', [[0, -.2, .1]], '#8ff5e3', -.25);
    mushroom(ctx, 370, 206, 20, 20, '#f2b75a', '#d39540', [[-.15, -.15, .08], [.2, -.1, .06]], '#ffd27a', -.12);
    mushroom(ctx, 386, 206, 11, 11, '#f2b75a', '#d39540', [[0, -.2, .09]], '#ffd27a', .3);
    snail(ctx, 380, 270, .8);
    mushroom(ctx, 46, 382, 16, 16, '#6fe0cf', '#4fbfb0', [[.1, -.18, .09], [-.2, -.08, .06]], '#8ff5e3', .18);
    mushroom(ctx, 30, 382, 9, 9, '#e66a7e', '#c24c63', [[0, -.2, .1]], null, -.2);
    // Drifting spores, mostly near the walls.
    for (let i = 0; i < 46; i++) { const x = 30 + rs() * 360, y = 60 + rs() * 380; if (Math.abs(x - 210) < 110 && rs() < .7) continue; dot(ctx, x, y, .9 + rs() * .9, 'rgba(200,255,244,.5)'); }
    // Floor: rock, moss, a glowing puddle and the big mushroom patches.
    band(ctx, ridge(450, 4, 71, 36), 560, '#2d2243', '#1a1229', 1.8);
    band(ctx, ridge(474, 3, 72, 40), 560, '#33284b', null);
    shape(ctx, [[246, 510], [282, 500], [318, 506], [324, 520], [288, 530], [250, 524]], '#3f5f7a', '#1a1229', 1.4);
    for (const [x, y, w] of [[272, 512, 12], [300, 520, 8]]) stroke(ctx, [[x - w / 2, y], [x + w / 2, y]], 'rgba(143,245,227,.55)', 1.2);
    for (const [x, y, w, sd] of [[96, 458, 46, 1], [312, 462, 56, 2], [170, 540, 50, 3]]) shape(ctx, blob(x, y, w, 7, sd, .2, 9), '#5f9a6a', '#3f6b49', 1.2);
    mushroom(ctx, 42, 552, 44, 54, '#e66a7e', '#c24c63', [[-.25, -.2, .08], [.12, -.24, .07], [.3, -.05, .05], [-.05, -.02, .05]], null, -.08);
    mushroom(ctx, 86, 552, 26, 32, '#e66a7e', '#c24c63', [[-.1, -.2, .09], [.2, -.05, .07]], null, .14);
    mushroom(ctx, 20, 508, 15, 17, '#f2b75a', '#d39540', [[0, -.2, .1]], null, -.22);
    mushroom(ctx, 380, 552, 40, 50, '#6fe0cf', '#4fbfb0', [[-.2, -.2, .08], [.15, -.15, .07], [.3, 0, .05]], '#8ff5e3', .1);
    mushroom(ctx, 340, 554, 22, 26, '#e66a7e', '#c24c63', [[0, -.2, .1], [.25, -.05, .06]], null, -.12);
    mushroom(ctx, 402, 500, 13, 15, '#f2b75a', '#d39540', [[0, -.2, .1]], null, .25);
    if (framed) frame(ctx, '#7c64a8', '#b9a6e6');
  }

  // ---------- Level 4: Crystal Caves ----------
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
  function spike(ctx, x, y, w, h, down, fill, shade, line) {
    const s = down ? 1 : -1;
    const pts = [[x - w / 2, y], [x - w * .18, y + s * h * .55], [x, y + s * h], [x + w * .2, y + s * h * .5], [x + w / 2, y]];
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); smooth(ctx, pts, false); ctx.lineTo(x + w / 2, y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w * .05, y); ctx.lineTo(x, y + s * h); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fillStyle = shade; ctx.fill();
    ctx.beginPath(); smooth(ctx, pts, false); ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.stroke();
  }
  const BLUE = ['#b9f6ff', '#5fd0ec', '#2e93c4', '#123a5c'], VIOLET = ['#e3d5ff', '#a98cf5', '#6f52cc', '#2a1f5c'];
  function glowCluster(ctx, x, y, scale, palette, seed, spread, glow) {
    dot(ctx, x, y - 20 * scale, 62 * scale, glow + '14'); dot(ctx, x, y - 20 * scale, 40 * scale, glow + '1c');
    crystalCluster(ctx, x, y, scale, palette, seed, spread);
  }
  function caveFish(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-2, -6, 8, -1); ctx.quadraticCurveTo(-2, 5, -10, 0); ctx.closePath();
    ctx.fillStyle = '#d9fbff'; ctx.fill(); ctx.strokeStyle = '#2f6f9a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-15, -4); ctx.lineTo(-15, 4); ctx.closePath(); ctx.fillStyle = '#9fe9ff'; ctx.fill(); ctx.stroke();
    dot(ctx, 4, -1.4, .9, '#123a5c');
    ctx.restore();
  }
  function paintCrystal(ctx, framed) {
    const back = ctx.createLinearGradient(0, 0, 0, 560);
    back.addColorStop(0, '#233f69'); back.addColorStop(.6, '#1b3357'); back.addColorStop(1, '#13243d');
    ctx.fillStyle = back; ctx.fillRect(0, 0, 420, 560);
    // Giant crystals far back in the dark, pale and quiet.
    for (const [x, y, w, h, t] of [[96, 470, 64, 360, -.18], [330, 470, 54, 300, .2], [210, 470, 40, 200, .04]]) {
      ctx.save(); ctx.globalAlpha = .42; crystal(ctx, x, y, w, h, t, ['#3d6e9e', '#2d5784', '#244a73', '#2a5584']); ctx.restore();
    }
    // Faceted rock planes on the back wall.
    const facets = [[[20, 60], [140, 40], [120, 170], [30, 200]], [[290, 60], [400, 50], [400, 210], [250, 150]],
      [[24, 330], [110, 300], [130, 440], [20, 440]], [[310, 280], [396, 320], [400, 440], [290, 440]]];
    facets.forEach((f, i) => {
      ctx.beginPath(); ctx.moveTo(f[0][0], f[0][1]); for (const q of f.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath();
      ctx.fillStyle = ['#21416b', '#234670', '#1c375c', '#1a3458'][i]; ctx.fill(); ctx.strokeStyle = 'rgba(80,140,200,.30)'; ctx.lineWidth = 1; ctx.stroke();
    });
    // Two cold light beams slant down from crystals in the ceiling.
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const [x0, x1, x2] of [[120, 150, 260], [300, 318, 380]]) {
      ctx.beginPath(); ctx.moveTo(x0, 40); ctx.lineTo(x1, 40); ctx.lineTo(x2 + 50, 452); ctx.lineTo(x2 - 40, 452); ctx.closePath();
      ctx.fillStyle = 'rgba(150,220,255,.07)'; ctx.fill();
    }
    ctx.restore();
    // Ceiling with stalactites tipped in crystal.
    caveWall(ctx, [[-10, -10], [430, -10], [430, 30], [360, 40], [300, 30], [240, 44], [170, 32], [100, 44], [40, 34], [-10, 40]], '#142640', '#0f1d33', '#0a1424');
    for (const [x, w, h, c] of [[52, 26, 62, 1], [96, 16, 34, 0], [178, 20, 42, 1], [262, 14, 28, 0], [318, 24, 58, 1], [370, 18, 40, 0]]) {
      spike(ctx, x, 36, w, h, true, '#2a4d75', '#1f3c5f', '#0d1a2c');
      if (c) { ctx.save(); ctx.translate(x, 36 + h - 6); ctx.rotate(Math.PI); crystal(ctx, 0, 0, 7, 14, 0, BLUE); ctx.restore(); }
    }
    crystal(ctx, 135, 38, 12, 22, Math.PI, VIOLET); crystal(ctx, 309, 34, 10, 18, Math.PI, BLUE);
    // Side walls with crystal ledges.
    caveWall(ctx, [[-10, 30], [40, 40], [34, 150], [58, 196], [30, 260], [46, 360], [28, 450], [-10, 460]], '#142640', '#0f1d33', '#0a1424');
    caveWall(ctx, [[430, 30], [380, 40], [390, 120], [366, 170], [388, 250], [376, 340], [394, 450], [430, 460]], '#142640', '#0f1d33', '#0a1424');
    glowCluster(ctx, 42, 204, .82, VIOLET, 3, .75, '#b49cff');
    glowCluster(ctx, 380, 178, .76, BLUE, 4, .75, '#8fe9ff');
    glowCluster(ctx, 32, 366, .66, BLUE, 5, .75, '#8fe9ff');
    glowCluster(ctx, 386, 348, .7, VIOLET, 6, .75, '#b49cff');
    // Floor: dark rock, stalagmites, a still pool with a little cave fish, and big crystals in the corners.
    band(ctx, ridge(452, 4, 81, 36), 560, '#13243d', '#0a1424', 1.8);
    for (const [x, w, h] of [[110, 18, 26], [150, 12, 14], [290, 16, 22], [262, 10, 12]]) spike(ctx, x, 456, w, h, false, '#203f68', '#183255', '#0a1424');
    const pool = [[262, 512], [300, 500], [350, 504], [372, 520], [340, 536], [288, 534]];
    shape(ctx, pool, '#2f6f9a', '#0a1424', 1.6);
    shape(ctx, pool.map(([x, y]) => [x + (x - 316) * -.18, y + (y - 518) * -.3]), '#3b85b0', null);
    for (const [x, y, w] of [[296, 514, 14], [330, 524, 10], [318, 508, 8]]) stroke(ctx, [[x - w / 2, y], [x + w / 2, y]], 'rgba(190,240,255,.6)', 1.2);
    caveFish(ctx, 318, 520, .8);
    glowCluster(ctx, 54, 558, 1.3, BLUE, 7, 1, '#8fe9ff');
    glowCluster(ctx, 374, 558, 1.18, VIOLET, 8, 1, '#b49cff');
    crystalCluster(ctx, 136, 552, .45, VIOLET, 9, .9);
    const rs = rng(808);
    for (let i = 0; i < 18; i++) {
      const x = 28 + rs() * 364, y = 50 + rs() * 380;
      if (Math.abs(x - 210) < 120) continue;
      sparkle(ctx, x, y, 2 + rs() * 2.5, i % 3 ? 'rgba(210,248,255,.85)' : 'rgba(225,210,255,.85)');
    }
    for (const [x, y, s] of [[44, 150, 4], [380, 120, 3.4], [70, 500, 5], [362, 494, 4.4]]) sparkle(ctx, x, y, s, '#ffffff');
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
  // A glowworm's fishing line: a silk thread strung with sticky beads that catch the light.
  function silk(ctx, x, y, len, seed) {
    const r = rng(seed), sway = (r() - .5) * 5, p0 = [x, y], p1 = [x + sway, y + len * .5], p2 = [x + sway * .3, y + len];
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
    ctx.strokeStyle = 'rgba(170,245,230,.24)'; ctx.lineWidth = .6; ctx.lineCap = 'round'; ctx.stroke();
    const beads = Math.max(1, Math.round(len / 13));
    for (let i = 1; i <= beads; i++) {
      const [bx, by] = bezierAt(p0, p1, p2, Math.min(1, i / beads + (r() - .5) * .06));
      if (i === beads) { dot(ctx, bx, by, 3.2, 'rgba(130,255,215,.12)'); dot(ctx, bx, by, 1.25, '#c4ffea'); }
      else dot(ctx, bx, by, .55 + r() * .4, 'rgba(190,255,236,.55)');
    }
  }
  function glowSpeck(ctx, x, y, s) { dot(ctx, x, y, s * 2.6, 'rgba(120,255,210,.09)'); dot(ctx, x, y, s * .8, '#a8ffdf'); }
  // The glowworm herself: a soft grub on a ledge with a lantern for a tail, letting down her line.
  function glowworm(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    dot(ctx, -14, -2.4, 13, 'rgba(140,255,215,.08)'); dot(ctx, -14, -2.4, 8.5, 'rgba(140,255,215,.12)');
    const segs = [[-14, -2.4, 4.4], [-9.4, -3.4, 4.8], [-4.6, -4, 5.1], [.4, -4.2, 5.3]];
    for (const [sx, sy, sr] of segs) dot(ctx, sx, sy, sr + 1.2, '#2b625f');
    segs.forEach(([sx, sy, sr], i) => {
      dot(ctx, sx, sy, sr, i ? '#ddf1ea' : '#b8ffe3');
      ctx.beginPath(); ctx.arc(sx + .8, sy + .9, sr - .4, -.2, 1.9); ctx.strokeStyle = i ? '#b9d6cf' : '#7fe8c8'; ctx.lineWidth = 1.4; ctx.stroke();
    });
    dot(ctx, -14.6, -3.6, 1.2, '#ffffff');
    ctx.beginPath(); ctx.ellipse(6.4, -5.6, 6.2, 5.6, 0, 0, TAU); ctx.fillStyle = '#eaf7f2'; ctx.fill(); ctx.strokeStyle = '#2b625f'; ctx.lineWidth = 1.2; ctx.stroke();
    stroke(ctx, [[8, -10.8], [9.5, -14.2]], '#2b625f', .9); stroke(ctx, [[5, -11], [5.4, -14.6]], '#2b625f', .9);
    dot(ctx, 9.6, -14.4, .9, '#2b625f'); dot(ctx, 5.4, -14.8, .9, '#2b625f');
    dot(ctx, 5, -6.4, 1.1, '#1d3a3a'); dot(ctx, 9.4, -6.2, 1.1, '#1d3a3a');
    ctx.beginPath(); ctx.arc(7.3, -4.6, 1.8, .4, Math.PI - .4); ctx.strokeStyle = '#1d3a3a'; ctx.lineWidth = .8; ctx.stroke();
    dot(ctx, 3.4, -4, 1.2, 'rgba(255,160,180,.5)'); dot(ctx, 11, -3.8, 1.2, 'rgba(255,160,180,.5)');
    ctx.restore();
  }
  function lilyPad(ctx, x, y, rx, notch, seed) {
    const ry = rx * .4, outline = () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.ellipse(x, y, rx, ry, 0, notch + .28, notch - .28 + TAU); ctx.closePath(); };
    outline(); ctx.fillStyle = '#3d8a76'; ctx.fill();
    ctx.save(); outline(); ctx.clip(); ctx.beginPath(); ctx.ellipse(x - rx * .16, y - ry * .3, rx, ry, 0, 0, TAU); ctx.rect(x - rx * 2, y - ry * 3, rx * 4, ry * 6); ctx.fillStyle = '#2e7062'; ctx.fill('evenodd'); ctx.restore();
    outline(); ctx.strokeStyle = '#123d38'; ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.stroke();
    const r = rng(seed);
    for (let i = 0; i < 4; i++) { const a = notch + .9 + i * 1.25 + r() * .2; stroke(ctx, [[x, y], [x + Math.cos(a) * rx * .7, y + Math.sin(a) * ry * .7]], 'rgba(170,235,205,.32)', .9); }
    ctx.beginPath(); ctx.ellipse(x, y, rx - 2.5, ry - 1.4, 0, 3.4, 4.5); ctx.strokeStyle = 'rgba(200,255,225,.45)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function waterLily(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    for (const [a, l, c] of [[-2.6, 7, '#d9c6f6'], [-.55, 7, '#d9c6f6'], [-2.1, 8.4, '#efe6ff'], [-1.05, 8.4, '#efe6ff'], [-1.57, 9, '#f8f4ff']]) {
      ctx.save(); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.moveTo(-2.6, 0); ctx.quadraticCurveTo(-3, -l * .6, 0, -l); ctx.quadraticCurveTo(3, -l * .6, 2.6, 0); ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = '#7a62a8'; ctx.lineWidth = .9; ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(0, .5, 3.4, 1.6, 0, 0, TAU); ctx.fillStyle = '#ffd36b'; ctx.fill(); ctx.strokeStyle = '#b8862e'; ctx.lineWidth = .8; ctx.stroke();
    ctx.restore();
  }
  // An axolotl surfacing at the edge of the pads, chin on her hands.
  function axolotl(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const ink = '#99406a';
    for (const side of [-1, 1]) {
      [[-.85, 9.5], [-.38, 10.5], [.08, 8.6]].forEach(([a, len], i) => {
        ctx.save(); ctx.translate(side * 11, -14 + i * 3.6); ctx.rotate(side > 0 ? a : Math.PI - a);
        ctx.beginPath(); ctx.ellipse(len * .5, 0, len * .55, 2.5, 0, 0, TAU); ctx.fillStyle = '#ef80a7'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
        for (let k = 1; k < 4; k++) { const fx = len * (.18 + k * .2); stroke(ctx, [[fx - 1.2, -2.6], [fx + .6, 0], [fx - 1.2, 2.6]], 'rgba(255,220,232,.8)', .7); }
        ctx.restore();
      });
    }
    const head = [[-14.4, -2], [-13.6, -10.4], [-7, -16.6], [0, -17.8], [7, -16.6], [13.6, -10.4], [14.4, -2], [0, .6]];
    shape(ctx, head, '#f9c6d6', null); cel(ctx, head, '#eda5bd', -3, 2.4); shape(ctx, head, null, ink, 1.3);
    ctx.beginPath(); ctx.arc(-6, -12.4, 4.2, 3.5, 4.5); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
    for (const ex of [-5.8, 5.8]) { dot(ctx, ex, -9.4, 1.9, '#331427'); dot(ctx, ex - .6, -10.1, .65, '#ffffff'); }
    ctx.beginPath(); ctx.moveTo(-4.6, -5.4); ctx.quadraticCurveTo(0, -2.2, 4.6, -5.4); ctx.strokeStyle = '#331427'; ctx.lineWidth = 1; ctx.stroke();
    dot(ctx, -9.6, -6, 2, 'rgba(240,110,150,.45)'); dot(ctx, 9.6, -6, 2, 'rgba(240,110,150,.45)');
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(side * 7.8, .6, 3.8, 2.4, side * .2, 0, TAU); ctx.fillStyle = '#f9c6d6'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      for (const k of [-1.2, 0, 1.2]) dot(ctx, side * 7.8 + k * 1.3, -1.1, .55, ink);
    }
    ctx.restore();
  }
  // A little rowboat, seen a touch from above so its seat and the far rim show.
  function rowboat(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const ink = '#3a2318';
    ctx.beginPath(); ctx.ellipse(2, 4, 50, 6, 0, 0, TAU); ctx.fillStyle = 'rgba(4,10,24,.35)'; ctx.fill();
    // The far rim and the dark well of the boat.
    ctx.beginPath(); ctx.moveTo(-46, -15); ctx.quadraticCurveTo(-4, -24, 50, -24); ctx.quadraticCurveTo(0, -6, -46, -15); ctx.closePath();
    ctx.fillStyle = '#5a3824'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-44, -16.4); ctx.quadraticCurveTo(-4, -24.4, 47, -23.4); ctx.strokeStyle = '#b07d50'; ctx.lineWidth = 1.4; ctx.stroke();
    poly(ctx, [[-4, -21.6], [3, -22], [5, -11], [-2, -10.6]], '#b9875a', ink, 1);
    poly(ctx, [[-36, -18.6], [-26, -19.6], [-24, -13], [-34, -12.4]], '#b9875a', ink, 1);
    // A jam jar of glowworms on the stern seat: someone's night light.
    dot(ctx, -30, -24, 17, 'rgba(140,255,215,.07)'); dot(ctx, -30, -24, 10, 'rgba(140,255,215,.11)');
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-35.5, -31, 11, 14, 3.5) : ctx.rect(-35.5, -31, 11, 14); ctx.fillStyle = 'rgba(150,240,225,.30)'; ctx.fill(); ctx.strokeStyle = '#a9e3dc'; ctx.lineWidth = 1.1; ctx.stroke();
    for (const [gx, gy] of [[-31.6, -21], [-27.4, -24], [-30.4, -27], [-27.2, -19.6]]) glowSpeck(ctx, gx, gy, 1.3);
    stroke(ctx, [[-33.2, -28.6], [-33.2, -21]], 'rgba(255,255,255,.55)', .9);
    poly(ctx, [[-35, -34], [-25, -34], [-25.6, -31], [-34.4, -31]], '#c99a64', '#5a3a24', 1);
    // The near side of the hull, planked, darker toward the water.
    const hull = () => { ctx.beginPath(); ctx.moveTo(-46, -15); ctx.quadraticCurveTo(0, -6, 50, -24); ctx.quadraticCurveTo(44, 2, 18, 6); ctx.lineTo(-28, 6); ctx.quadraticCurveTo(-43, 3, -46, -15); ctx.closePath(); };
    hull(); ctx.fillStyle = '#9b6942'; ctx.fill();
    ctx.save(); hull(); ctx.clip();
    ctx.fillStyle = '#7d5133'; ctx.fillRect(-50, -1.5, 110, 12);
    for (const k of [6, 11]) { ctx.beginPath(); ctx.moveTo(-46, -15 + k); ctx.quadraticCurveTo(0, -6 + k, 50, -24 + k); ctx.strokeStyle = 'rgba(58,35,24,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
    hull(); ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-43, -13); ctx.quadraticCurveTo(0, -4.4, 46, -21.4); ctx.strokeStyle = '#d7a877'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
    for (const bx of [-30, 4, 32]) dot(ctx, bx, bx > 20 ? -10.8 : bx > 0 ? -6.6 : -8.2, .95, ink);
    ctx.beginPath(); ctx.arc(46, -15, 2.4, 0, TAU); ctx.strokeStyle = '#9a948e'; ctx.lineWidth = 1.2; ctx.stroke();
    // An oar shipped over the side, its blade resting on the water.
    poly(ctx, [[-14, -28], [-11.6, -29.6], [34, -1], [31.6, .6]], '#c49766', ink, 1.1);
    ctx.beginPath(); ctx.ellipse(38, 2.6, 7.6, 2.8, .45, 0, TAU); ctx.fillStyle = '#c49766'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
  }
  function paintLake(ctx, framed) {
    const water = 352;
    const back = ctx.createLinearGradient(0, 0, 0, water);
    back.addColorStop(0, '#1a2248'); back.addColorStop(.6, '#193452'); back.addColorStop(1, '#1d4c5c');
    ctx.fillStyle = back; ctx.fillRect(0, 0, 420, water);
    // Far back: curtains of flowstone hang from the roof, pale with distance and lit by their own far glowworms.
    const rf = rng(303);
    for (const [x0, x1, depth, seed] of [[-20, 170, 150, 1], [120, 300, 70, 2], [250, 440, 170, 3]]) {
      const r = rng(seed), pts = [[x0, 0]];
      for (let i = 0; i <= 9; i++) { const t = i / 9; pts.push([x0 + (x1 - x0) * t, 30 + depth * Math.sin(t * Math.PI) * (.62 + r() * .38)]); }
      pts.push([x1, 0]);
      shape(ctx, pts, '#1c2e50', 'rgba(110,170,215,.18)', 1.1);
      for (let i = 1; i < 9; i += 2) { const p = pts[i + 1]; stroke(ctx, [[p[0], 34], [p[0] + 2, (34 + p[1]) / 2], [p[0], p[1] - 6]], 'rgba(10,18,40,.22)', 1.2); }
      for (let i = 0; i < 16; i++) { const x = x0 + 10 + rf() * (x1 - x0 - 20), y = 40 + rf() * depth * .5; if (Math.abs(x - 210) > 90 || y < 70) dot(ctx, x, y, .5 + rf() * .5, 'rgba(150,255,220,.35)'); }
    }
    // The far shore, low and quiet, a few stalagmites standing in the shallows.
    const shore = [[-20, water + 1], [-20, water - 16], [24, water - 20], [64, water - 9], [110, water - 5], [170, water - 2], [250, water - 3], [310, water - 8], [356, water - 18], [440, water - 14], [440, water + 1]];
    shape(ctx, shore, '#1a3c55', 'rgba(130,210,220,.36)', 1.1);
    for (const [x, w, h] of [[30, 14, 24], [48, 9, 12], [348, 10, 14], [366, 16, 26]]) {
      const b = water - 10, stack = [[x - w / 2, b], [x - w * .42, b - h * .5], [x - w * .2, b - h], [x + w * .14, b - h * .96], [x + w * .4, b - h * .45], [x + w / 2, b]];
      shape(ctx, stack, '#1d4058', null); cel(ctx, stack, '#18354b', -w * .25, 0); shape(ctx, stack, null, 'rgba(130,190,225,.4)', 1.1);
    }
    // Still water. Reflections go in first, then the light falls off into the deep.
    ctx.fillStyle = '#15384b'; ctx.fillRect(0, water, 420, 560 - water);
    const left = [[-10, 30], [44, 44], [58, 94], [40, 138], [64, 196], [48, 256], [34, 296], [56, 330], [44, water + 1], [-10, water + 1]];
    const right = [[430, 30], [380, 46], [366, 102], [386, 150], [362, 212], [382, 268], [394, 314], [370, water + 1], [430, water + 1]];
    reflect(ctx, shore, water, '#183a50', '#15384b', 11);
    for (const wall of [left, right]) reflect(ctx, wall, water, '#0e1d30', '#15384b', wall[1][0]);
    const deep = ctx.createLinearGradient(0, water, 0, 560); deep.addColorStop(0, 'rgba(40,86,110,.4)'); deep.addColorStop(.3, 'rgba(15,32,57,0)'); deep.addColorStop(1, 'rgba(8,18,36,.55)');
    ctx.fillStyle = deep; ctx.fillRect(0, water, 420, 560 - water);
    stroke(ctx, [[60, water + .5], [360, water + .5]], 'rgba(160,230,240,.22)', 1);
    // Ceiling, thick with glowworms.
    const ceiling = [[-10, -10], [430, -10], [430, 40], [392, 52], [350, 40], [300, 54], [256, 42], [214, 50], [168, 40], [120, 54], [70, 44], [30, 56], [-10, 48]];
    caveWall(ctx, ceiling, '#131d38', '#0f182f', '#08101f');
    for (const [x, w, h] of [[66, 20, 30], [148, 12, 16], [278, 14, 22], [326, 18, 32], [198, 9, 10]]) {
      const top = edgeAt(ceiling.slice(2).reverse(), x) - 6;
      ctx.beginPath(); ctx.moveTo(x - w / 2, top); ctx.quadraticCurveTo(x - w * .25, top + h * .7, x, top + h); ctx.quadraticCurveTo(x + w * .3, top + h * .6, x + w / 2, top); ctx.closePath();
      ctx.fillStyle = '#131d38'; ctx.fill(); ctx.strokeStyle = '#08101f'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#131d38'; ctx.fillRect(x - w / 2 + 1, top - 3, w - 2, 4);
      stroke(ctx, [[x - w * .26, top + 4], [x - w * .1, top + h * .6]], 'rgba(120,190,220,.30)', 1);
    }
    const rs = rng(505);
    for (let i = 0; i < 90; i++) { const x = 6 + rs() * 408, y = 6 + rs() * 36; if (y < edgeAt(ceiling.slice(2).reverse(), x) - 3) glowSpeck(ctx, x, y, .5 + rs() * .7); }
    // Lines let down from the roof in little colonies: long ones by the walls, short ones over the middle.
    const lines = [[44, 112], [50, 78], [57, 134], [63, 92], [72, 60], [86, 40], [100, 66], [140, 24], [146, 40], [153, 20], [161, 30], [200, 12], [214, 18], [234, 10],
      [266, 22], [274, 34], [282, 18], [294, 28], [322, 46], [330, 84], [338, 54], [350, 120], [358, 88], [368, 144], [378, 62]];
    for (const [x, len] of lines) {
      const top = edgeAt(ceiling.slice(2).reverse(), x) - 1;
      glowSpeck(ctx, x, top, 1.1); silk(ctx, x, top, len, x);
    }
    // Side walls drop into the lake and show again upside down in it.
    caveWall(ctx, left, '#131d38', '#0f182f', '#08101f');
    caveWall(ctx, right, '#131d38', '#0f182f', '#08101f');
    for (const wall of [left, right]) for (let i = 2; i < wall.length - 3; i++) {
      const [x, y] = wall[i], k = wall === left ? 1 : -1;
      stroke(ctx, [[x - k * 10, y + 8], [x - k * 4, y + 18], [x - k * 12, y + 30]], 'rgba(100,150,200,.22)', 1.1);
    }
    for (const [x, y] of [[14, 80], [24, 120], [12, 200], [30, 236], [10, 300], [404, 90], [396, 180], [410, 240], [400, 300], [20, 330], [406, 130]]) glowSpeck(ctx, x, y, .9);
    // A ledge on the left wall where a glowworm sits fishing.
    shape(ctx, [[24, 152], [68, 146], [82, 151], [70, 160], [26, 164]], '#1a2a48', '#08101f', 1.4);
    stroke(ctx, [[32, 151], [70, 148]], 'rgba(140,210,230,.32)', 1);
    glowworm(ctx, 54, 149, .9);
    silk(ctx, 63, 145, 96, 77);
    // Drips from the roof ring the water by the walls.
    for (const [x, y, k] of [[70, water + 30, 1], [356, water + 56, .8], [92, water + 96, .7]]) {
      for (const [w, a] of [[7, .42], [14, .24], [22, .12]]) { ctx.beginPath(); ctx.ellipse(x, y, w * k, w * k * .26, 0, 0, TAU); ctx.strokeStyle = `rgba(190,245,250,${a})`; ctx.lineWidth = 1; ctx.stroke(); }
      dot(ctx, x, y - 7 * k, 1.1, 'rgba(210,250,255,.7)');
    }
    // Glowworm light lying on the water: short dashes, gathered under the walls, barely there in the middle.
    const rw = rng(606);
    for (let i = 0; i < 26; i++) {
      const side = i % 2, x = side ? 322 + rw() * 80 : 18 + rw() * 80, y = water + 6 + Math.pow(rw(), 1.6) * 100, w = 2 + rw() * 7;
      stroke(ctx, [[x - w / 2, y], [x + w / 2, y]], `rgba(160,255,225,${.16 + rw() * .2})`, 1);
      if (rw() < .4) dot(ctx, x, y, 2.4, 'rgba(140,255,220,.08)');
    }
    for (const [x, y, w] of [[120, 376, 70], [300, 388, 60], [180, 410, 46], [250, 430, 30]]) stroke(ctx, [[x - w / 2, y], [x + w / 2, y]], 'rgba(150,220,235,.08)', 1.2);
    for (const [x, y, w] of [[60, water - 4, 90], [360, water - 6, 100], [210, water - 2, 120]]) { ctx.beginPath(); ctx.ellipse(x, y, w, 5, 0, 0, TAU); ctx.fillStyle = 'rgba(170,220,240,.05)'; ctx.fill(); }
    // The near shore: flat stones stepping out into the lake, the launcher standing on the biggest.
    const front = [[104, 584], [108, 496], [128, 507], [166, 514], [214, 516], [262, 513], [304, 506], [322, 494], [328, 584]];
    shape(ctx, front, '#1d3a50', null); cel(ctx, front, '#183145', -14, 0);
    clipTo(ctx, front, () => { ctx.fillStyle = 'rgba(20,58,76,.72)'; ctx.fillRect(90, 536, 250, 40); stroke(ctx, [[96, 536], [330, 536]], 'rgba(170,240,240,.3)', 1.2); });
    shape(ctx, front, null, '#0a1526', 1.8);
    const top = [[108, 494], [120, 479], [150, 470], [188, 463], [224, 462], [260, 466], [292, 473], [314, 484], [320, 495], [302, 504], [262, 511], [214, 514], [166, 512], [128, 505]];
    shape(ctx, top, '#2a4b62', null); cel(ctx, top, '#24425a', -12, -7); shape(ctx, top, null, '#0a1526', 1.6);
    stroke(ctx, [[118, 486], [134, 474], [170, 467], [206, 464.6], [246, 466], [282, 472]], 'rgba(160,230,238,.36)', 1.2);
    for (const pts of [[[238, 515], [246, 524], [242, 534]], [[128, 512], [150, 520], [176, 523]], [[284, 510], [300, 514]], [[136, 488], [158, 494], [176, 490]], [[252, 492], [272, 497], [288, 494]]]) stroke(ctx, pts, 'rgba(6,12,26,.5)', 1.1);
    for (const [x, y, w] of [[126, 478, 7], [300, 478, 6], [182, 466, 5]]) for (const [dx, dy, rr] of [[-w * .6, 1, w * .55], [0, -1, w * .7], [w * .6, 1, w * .5]]) dot(ctx, x + dx, y + dy, rr, '#2f6a66');
    for (const [x, y, w] of [[126, 478, 7], [300, 478, 6], [182, 466, 5]]) { ctx.beginPath(); ctx.arc(x - 1, y - 1, w * .5, 3.5, 4.8); ctx.strokeStyle = 'rgba(170,240,220,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
    for (const [x, y] of [[120, 532], [140, 556], [300, 540], [316, 520]]) glowSpeck(ctx, x, y, .8);
    // The mooring post and the little rowboat tied up to it.
    rowboat(ctx, 58, 506, .9);
    stroke(ctx, [[100, 492], [112, 497], [122, 488]], '#d9c5a0', 1);
    poly(ctx, [[118, 496], [118, 470], [128, 470], [128, 496]], '#8a5a3a', '#3a2318', 1.3);
    poly(ctx, [[123, 470], [128, 470], [128, 496], [123, 496]], '#6e4529', null);
    ctx.beginPath(); ctx.ellipse(123, 470, 5.6, 2, 0, 0, TAU); ctx.fillStyle = '#c49766'; ctx.fill(); ctx.strokeStyle = '#3a2318'; ctx.lineWidth = 1.2; ctx.stroke();
    stroke(ctx, [[117.5, 479], [128.5, 477.5]], '#d9c5a0', 1.4); stroke(ctx, [[117.5, 483], [128.5, 481.5]], '#d9c5a0', 1.4);
    for (const [x, y, w] of [[54, 516, 46], [40, 530, 24], [86, 528, 18]]) stroke(ctx, [[x - w / 2, y], [x + w / 2, y]], 'rgba(170,240,240,.24)', 1);
    // Pads gathered in the right corner, a water lily, and an axolotl come up to see.
    lilyPad(ctx, 392, 472, 20, 2.6, 1); lilyPad(ctx, 350, 490, 13, .4, 2); lilyPad(ctx, 410, 506, 16, 3.3, 3);
    waterLily(ctx, 394, 468, .9);
    for (const [w, a] of [[26, .3], [36, .16]]) { ctx.beginPath(); ctx.ellipse(366, 534, w, w * .24, 0, 0, TAU); ctx.strokeStyle = `rgba(190,245,250,${a})`; ctx.lineWidth = 1; ctx.stroke(); }
    lilyPad(ctx, 366, 542, 22, 4.5, 4);
    axolotl(ctx, 366, 536, 1.05);
    lilyPad(ctx, 332, 552, 10, 1, 5);
    for (const [x, y, s] of [[30, 90, 2.4], [392, 106, 2], [60, 300, 2.2], [404, 332, 2]]) sparkle(ctx, x, y, s, 'rgba(200,255,240,.8)');
    if (framed) frame(ctx, '#3c8c98', '#a8f5e0');
  }

  // ---------- Level 6: Fossil Beds ----------
  // Sandstone laid down in tilted beds: each band a gentle ridge that dips toward the left.
  function bed(y, amp, seed, tilt = .07) { return ridge(y, amp, seed, 52).map(([x, yy]) => [x, yy + (210 - x) * tilt]); }
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
  function fishBones(ctx, x, y, len, flip, ink) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -1 : 1, 1);
    const spine = [[-len * .42, 0], [-len * .1, -1.6], [len * .2, -1], [len * .4, 1]];
    stroke(ctx, spine, ink, 2.6); stroke(ctx, spine, '#f8ecd4', 1.3);
    for (let i = 0; i < 6; i++) {
      const sx = -len * .3 + i * len * .1, h = 7.5 - Math.abs(i - 2) * 1.2;
      for (const s of [-1, 1]) { stroke(ctx, [[sx, s * .4 - 1], [sx + 2.5, s * h * .7 - 1], [sx + 1, s * h - 1]], ink, 2.2); stroke(ctx, [[sx, s * .4 - 1], [sx + 2.5, s * h * .7 - 1], [sx + 1, s * h - 1]], '#f8ecd4', 1); }
    }
    const head = [[-len * .42, -7], [-len * .62, -1], [-len * .44, 6], [-len * .34, 0]];
    shape(ctx, head, '#f8ecd4', ink, 1.2); dot(ctx, -len * .46, -1.4, 1.6, ink);
    poly(ctx, [[len * .38, 0], [len * .58, -8], [len * .52, 0], [len * .58, 8]], '#f8ecd4', ink, 1.1);
    for (const a of [-5, -2, 2, 5]) stroke(ctx, [[len * .42, 0], [len * .55, a]], 'rgba(138,90,52,.6)', .7);
    ctx.restore();
  }
  function trilobite(ctx, x, y, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    const ink = '#8a5a34';
    const body = [[-7, -4], [-6.4, 4], [-3.6, 10], [0, 12.4], [3.6, 10], [6.4, 4], [7, -4]];
    shape(ctx, body, '#f3e2c2', null); cel(ctx, body, '#e1c79c', -2, 2); shape(ctx, body, null, ink, 1.2);
    for (let i = 0; i < 6; i++) { const yy = -2.4 + i * 2.3, w = 6.8 - i * .62; ctx.beginPath(); ctx.moveTo(-w, yy); ctx.quadraticCurveTo(0, yy + 1.6, w, yy); ctx.strokeStyle = 'rgba(138,90,52,.75)'; ctx.lineWidth = .8; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, 3, 2.4, 8.4, 0, 0, TAU); ctx.fillStyle = '#fbf0dc'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = .9; ctx.stroke();
    const head = [[-10.6, 1], [-9.4, -6], [-4.6, -10.6], [0, -11.6], [4.6, -10.6], [9.4, -6], [10.6, 1], [7, -3.4], [0, -4.4], [-7, -3.4]];
    shape(ctx, head, '#f8ecd4', ink, 1.2);
    ctx.beginPath(); ctx.ellipse(0, -7, 2.6, 3, 0, 0, TAU); ctx.fillStyle = '#fbf0dc'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = .9; ctx.stroke();
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 5, -6.4, 1.6, 1.2, 0, 0, TAU); ctx.fillStyle = '#c9955c'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = .8; ctx.stroke(); }
    ctx.restore();
  }
  function bone(ctx, x, y, len, rot, ink) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const h = len / 2;
    ctx.beginPath(); ctx.moveTo(-h + 2, -1.6); ctx.lineTo(h - 2, -1.6); ctx.arc(h - 1, -2.4, 2.2, 2.4, 0.6, false); ctx.arc(h - 1, 2.4, 2.2, -.6, -2.4, false);
    ctx.lineTo(-h + 2, 1.6); ctx.arc(-h + 1, 2.4, 2.2, .6, -2.4 + TAU, false); ctx.arc(-h + 1, -2.4, 2.2, 2.4 - TAU, -.6 + TAU, false);
    ctx.closePath(); ctx.fillStyle = '#f8ecd4'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.lineJoin = 'round'; ctx.stroke();
    stroke(ctx, [[-h + 3, -.3], [h - 4, -.3]], 'rgba(255,255,255,.75)', .8);
    ctx.restore();
  }
  // The star of the dig: a big, friendly dinosaur skull, half out of the floor, grinning.
  function dinoSkull(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const ink = '#87562f', boneC = '#f8ecd4', shade = '#e8d2ad', hole = '#cf9f68';
    // The mouth sits open in a grin: dark inside, the lower jaw hinged a little away.
    shape(ctx, [[30, -2], [70, -8], [112, -14], [108, 0], [70, 8], [34, 10]], '#b98454', null);
    const jaw = [[12, 4], [40, 8], [74, 6], [104, 0], [114, -4], [113, 4], [98, 12], [66, 19], [34, 21], [10, 16]];
    for (const tx of [50, 63, 76, 89, 101]) { const ty = 8 - (tx - 40) * .1; ctx.beginPath(); ctx.moveTo(tx - 3.6, ty + 2); ctx.quadraticCurveTo(tx - 1, ty - 8, tx + 1, ty - 7.4); ctx.quadraticCurveTo(tx + 3, ty - 4, tx + 3.6, ty + 2); ctx.fillStyle = boneC; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke(); }
    shape(ctx, jaw, boneC, null); cel(ctx, jaw, shade, -4, 3); shape(ctx, jaw, null, ink, 1.6);
    stroke(ctx, [[30, 12], [60, 13], [92, 7]], 'rgba(135,86,47,.4)', 1);
    const skull = [[-6, -34], [8, -52], [34, -60], [58, -54], [80, -42], [106, -33], [124, -27], [131, -17], [126, -10], [110, -11], [86, -7], [60, -4], [36, -1], [14, 4], [-4, -6]];
    for (const tx of [52, 64, 76, 88, 100, 111, 121]) { const ty = -4 - (tx - 40) * .09; ctx.beginPath(); ctx.moveTo(tx - 3.8, ty - 2); ctx.quadraticCurveTo(tx - 3, ty + 7, tx, ty + 8); ctx.quadraticCurveTo(tx + 3, ty + 7, tx + 3.8, ty - 2); ctx.fillStyle = boneC; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke(); }
    shape(ctx, skull, boneC, null); cel(ctx, skull, shade, -6, 6); shape(ctx, skull, null, ink, 1.8);
    // Holes in the skull show the sand behind; the eye socket wears a happy brow.
    ctx.beginPath(); ctx.ellipse(42, -30, 11.5, 10.5, -.2, 0, TAU); ctx.fillStyle = hole; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(42, -30, 6, Math.PI + .5, -.5); ctx.strokeStyle = 'rgba(135,86,47,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    stroke(ctx, [[26, -42], [40, -48], [58, -42]], ink, 1.4);
    shape(ctx, [[64, -32], [80, -36], [94, -30], [82, -24], [68, -24]], hole, ink, 1.3);
    ctx.beginPath(); ctx.ellipse(118, -22, 3.4, 2.4, -.3, 0, TAU); ctx.fillStyle = hole; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke();
    stroke(ctx, [[14, -50], [30, -56], [52, -54]], 'rgba(255,255,255,.8)', 1.6);
    stroke(ctx, [[86, -38], [104, -31], [118, -27]], 'rgba(255,255,255,.7)', 1.3);
    stroke(ctx, [[2, -26], [10, -18], [8, -10]], 'rgba(135,86,47,.45)', 1);
    stroke(ctx, [[100, -14], [106, -20]], 'rgba(135,86,47,.45)', 1);
    // A seedling has taken root in the eye socket.
    stroke(ctx, [[42, -26], [41, -36], [44, -44]], '#5aa85f', 1.5);
    for (const [lx, ly, a] of [[38.6, -41, -.6], [48, -46, .5]]) { ctx.beginPath(); ctx.ellipse(lx, ly, 4.6, 2.4, a, 0, TAU); ctx.fillStyle = '#7fcf73'; ctx.fill(); ctx.strokeStyle = '#3f8a48'; ctx.lineWidth = .9; ctx.stroke(); }
    ctx.restore();
  }
  // A sleepy mole on the dig crew, sat back against the crate, hard hat slipping, brush still in paw.
  function moleDigger(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const ink = '#3d2e2b';
    const body = [[-17, 0], [-19, -16], [-14, -30], [0, -35], [14, -30], [19, -16], [17, 0], [0, 3]];
    shape(ctx, body, '#7a6560', null); cel(ctx, body, '#655350', -4, 3); shape(ctx, body, null, ink, 1.5);
    ctx.beginPath(); ctx.ellipse(0, -9, 11, 9.5, 0, 0, TAU); ctx.fillStyle = '#968079'; ctx.fill();
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 11, 1.4, 7.4, 3.6, side * .22, 0, TAU); ctx.fillStyle = '#f2a9a8'; ctx.fill(); ctx.strokeStyle = '#a55e60'; ctx.lineWidth = 1; ctx.stroke(); }
    // Paws folded over a little brush.
    poly(ctx, [[-13, -4], [7, -17], [8.6, -15], [-11.4, -1.8]], '#c08a57', '#6e4322', 1);
    ctx.beginPath(); ctx.moveTo(7, -17.6); ctx.quadraticCurveTo(13, -24, 17, -21); ctx.quadraticCurveTo(15, -15, 9, -14.4); ctx.closePath(); ctx.fillStyle = '#5a4434'; ctx.fill(); ctx.strokeStyle = '#2e2018'; ctx.lineWidth = 1; ctx.stroke();
    for (const [px, py] of [[-6, -8], [4, -11]]) { ctx.beginPath(); ctx.ellipse(px, py, 4.6, 3.4, -.5, 0, TAU); ctx.fillStyle = '#f59aa5'; ctx.fill(); ctx.strokeStyle = '#a55e60'; ctx.lineWidth = 1; ctx.stroke(); }
    // A long whiskery snout, a pink nose and eyes shut tight.
    ctx.beginPath(); ctx.ellipse(0, -22, 7.6, 5.4, 0, 0, TAU); ctx.fillStyle = '#a48e86'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -21, 3.6, 2.8, 0, 0, TAU); ctx.fillStyle = '#f59aa5'; ctx.fill(); ctx.strokeStyle = '#a55e60'; ctx.lineWidth = 1; ctx.stroke();
    dot(ctx, -1, -22, .9, '#ffffff');
    for (const side of [-1, 1]) for (const k of [-1, 1]) stroke(ctx, [[side * 5, -20 + k], [side * 11, -21 + k * 2.4]], 'rgba(61,46,43,.5)', .6);
    for (const ex of [-6.2, 6.2]) { ctx.beginPath(); ctx.arc(ex, -28.4, 2.3, .3, Math.PI - .3); ctx.strokeStyle = '#231816'; ctx.lineWidth = 1.2; ctx.stroke(); }
    dot(ctx, -10.6, -24, 2, 'rgba(246,160,176,.5)'); dot(ctx, 10.6, -24, 2, 'rgba(246,160,176,.5)');
    // The hard hat, tipped down over one eye, its lamp off for the nap.
    ctx.save(); ctx.translate(1, -35.5); ctx.rotate(-.14);
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-13, -14, 0, -14.6); ctx.quadraticCurveTo(13, -14, 14, 0); ctx.closePath(); ctx.fillStyle = '#f6c745'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(3, -14); ctx.quadraticCurveTo(11, -11, 13, -1); ctx.lineTo(14, 0); ctx.quadraticCurveTo(13, -14, 3, -14.6); ctx.fillStyle = '#dca42c'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-13, -14, 0, -14.6); ctx.quadraticCurveTo(13, -14, 14, 0); ctx.closePath(); ctx.strokeStyle = '#94661b'; ctx.lineWidth = 1.3; ctx.stroke();
    poly(ctx, [[-17, -.4], [17, -.4], [17, 2.8], [-17, 2.8]], '#f6c745', '#94661b', 1.2);
    stroke(ctx, [[0, -14], [0, -1]], 'rgba(148,102,27,.6)', 1.2);
    ctx.beginPath(); ctx.ellipse(-8, -6.4, 3.8, 3.4, 0, 0, TAU); ctx.fillStyle = '#fff3c4'; ctx.fill(); ctx.strokeStyle = '#94661b'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(-4.6, -9.6, 5.4, 3.6, 4.4); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    ctx.font = '600 9px Fredoka, sans-serif'; ctx.fillStyle = 'rgba(110,67,34,.8)'; ctx.fillText('z', -26, -40); ctx.font = '600 7px Fredoka, sans-serif'; ctx.fillText('z', -33, -49);
    ctx.restore();
  }
  function bulb(ctx, x, y, tilt = 0) {
    halo(ctx, x, y + 7, 16, '255,214,120', .16);
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    poly(ctx, [[-2.6, -1], [2.6, -1], [2.6, 3.4], [-2.6, 3.4]], '#5d4a3a', '#3e2f24', 1);
    ctx.beginPath(); ctx.ellipse(0, 8, 4, 5, 0, 0, TAU); ctx.fillStyle = '#fff3b8'; ctx.fill(); ctx.strokeStyle = '#b8802a'; ctx.lineWidth = 1.1; ctx.stroke();
    stroke(ctx, [[-1.4, 9.6], [-.6, 7], [.6, 9.4], [1.4, 7]], '#e8a23a', .8);
    dot(ctx, -1.5, 6.2, 1.1, '#ffffff');
    ctx.restore();
  }
  function paintFossil(ctx, framed) {
    ctx.fillStyle = '#f6e3c0'; ctx.fillRect(0, 0, 420, 560);
    const beds = [[54, '#f1d3a4', '#e0bd8c'], [112, '#f7e4c0', '#e6c99c'], [170, '#eecf9f', '#dcb886'], [232, '#f0cfa8', '#ddb38c'], [292, '#f4dbb0', '#e2bf90'], [350, '#e9c492', '#d5a978'], [404, '#e3b986', '#cd9f6e']];
    beds.forEach(([y, fill, line], i) => band(ctx, bed(y, 4 + i * .6, 60 + i), 560, fill, line, 1.3));
    // Fine laminations and grit, kept to the sides of the wall.
    const r = rng(616);
    for (let i = 0; i < 70; i++) {
      const left = i % 2 === 0, x = left ? 10 + r() * 80 : 330 + r() * 80, y = 40 + r() * 400, w = 8 + r() * 26;
      stroke(ctx, [[x, y + (210 - x) * .07], [x + w, y + (210 - x - w) * .07]], 'rgba(176,122,72,.22)', .9);
    }
    for (let i = 0; i < 160; i++) {
      const x = 12 + r() * 396, y = 30 + r() * 420;
      if (Math.abs(x - 210) < 130 && r() < .8) continue;
      dot(ctx, x, y, .6 + r() * 1, r() < .5 ? 'rgba(150,96,50,.3)' : 'rgba(255,248,230,.55)');
    }
    // Light falls off from the work lights down into the pit.
    const fall = ctx.createLinearGradient(0, 30, 0, 452);
    fall.addColorStop(0, 'rgba(255,246,222,.4)'); fall.addColorStop(.45, 'rgba(255,246,222,0)'); fall.addColorStop(1, 'rgba(176,104,60,.10)');
    ctx.fillStyle = fall; ctx.fillRect(0, 0, 420, 452);
    // Two faint shells pressed into the far wall.
    ctx.save(); ctx.globalAlpha = .22; ammonite(ctx, 118, 196, 9, .4, '#f5e2c0', '#e2c39a', '#b98858'); ammonite(ctx, 306, 338, 7, 2, '#f5e2c0', '#e2c39a', '#b98858'); ctx.restore();
    // The roof of the dig: a darker overhang, with a string of work lights hung under it.
    const roof = [[-10, -10], [430, -10], [430, 30], [380, 38], [320, 30], [250, 40], [190, 32], [120, 40], [60, 30], [-10, 38]];
    caveWall(ctx, roof, '#d9a874', '#c99561', '#8f5e33');
    for (let x = 20; x < 410; x += 26) stroke(ctx, [[x, 10 + (x * 7) % 9], [x + 14, 12 + (x * 3) % 7]], 'rgba(143,94,51,.35)', 1);
    // The cut walls of the pit step inward as they go down; the beds carry on through them.
    const left = densify([[-10, 26], [30, 30], [34, 92], [29, 147], [48, 150], [51, 222], [47, 288], [64, 291], [67, 362], [61, 452], [-10, 452]], 9, 1);
    const right = densify([[430, 26], [392, 30], [387, 96], [391, 139], [375, 142], [372, 222], [377, 287], [356, 290], [353, 366], [359, 452], [430, 452]], 9, 2);
    for (const wall of [left, right]) {
      shape(ctx, wall, '#daa86f', null);
      clipTo(ctx, wall, () => beds.forEach(([y], i) => band(ctx, bed(y + 10, 3, 80 + i), 560, ['#daa86f', '#d49f66', '#dcae78'][i % 3], 'rgba(140,86,42,.45)', 1.1)));
      cel(ctx, wall, 'rgba(150,88,38,.24)', wall === left ? 8 : -8, 0);
      shape(ctx, wall, null, '#8a5530', 1.8);
    }
    for (const [x0, x1, y] of [[30, 47, 148], [48, 63, 289], [376, 390, 140], [357, 376, 288]]) stroke(ctx, [[x0 + 1, y + 1.6], [x1 - 1, y + 1.6]], 'rgba(255,246,222,.9)', 1.6);
    // A ladder leans on the right wall, up to the way out.
    for (const [x0, x1] of [[366, 384], [382, 400]]) { stroke(ctx, [[x0 + 3, 146], [x1 + 3, 18]], 'rgba(150,96,50,.35)', 3.4); }
    for (let k = 0; k < 8; k++) {
      const t = (k + .5) / 8, yy = 146 - t * 128, xa = 366 + t * 18, xb = 382 + t * 18;
      poly(ctx, [[xa, yy - 1.6], [xb, yy - 1.6], [xb, yy + 1.6], [xa, yy + 1.6]], '#c49766', '#6e4322', 1);
    }
    for (const [x0, x1] of [[366, 384], [382, 400]]) { stroke(ctx, [[x0, 146], [x1, 14]], '#6e4322', 4.2); stroke(ctx, [[x0, 146], [x1, 14]], '#c79a68', 2.2); }
    // The work lights.
    const hooks = [[18, 34], [150, 38], [282, 36], [404, 34]], cable = [];
    for (let h = 0; h < hooks.length - 1; h++) {
      const [x0, y0] = hooks[h], [x1, y1] = hooks[h + 1];
      for (let t = 0; t < 1; t += .1) cable.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 15]);
    }
    cable.push(hooks[hooks.length - 1]);
    stroke(ctx, cable, '#4b3a2e', 1.3);
    for (const [x, y] of hooks) dot(ctx, x, y, 2, '#4b3a2e');
    for (const [i, t] of [[3, .1], [7, -.08], [12, .04], [16, .16], [20, -.12], [25, .06]]) bulb(ctx, cable[i][0], cable[i][1], t);
    // Fossils in the side walls, each in the little hollow someone has been brushing out.
    const hollow = (pts, seed) => { const h = blob(pts[0], pts[1], pts[2], pts[3], seed, .14, 10); shape(ctx, h, '#d6a670', null); cel(ctx, h, '#e9c08c', -2, -3); shape(ctx, h, null, '#9a693c', 1.2); };
    hollow([18, 214, 22, 20], 1); ammonite(ctx, 18, 214, 15, .5, '#f6e6c8', '#e3c79c', '#8a5a34');
    hollow([396, 196, 30, 13], 2); fishBones(ctx, 398, 196, 46, true, '#8a5a34');
    hollow([398, 254, 17, 21], 3); trilobite(ctx, 398, 254, 1.3, .25);
    hollow([30, 360, 14, 10], 4); bone(ctx, 30, 360, 18, .5, '#8a5a34');
    // Ribs of something very large curve out of the upper left wall, the rest of it still asleep in the rock.
    hollow([12, 92, 26, 52], 6);
    for (let i = 0; i < 5; i++) {
      const y = 52 + i * 18, len = 26 - i * 2.6, rib = [[4, y], [4 + len * .55, y + 3], [4 + len * .9, y + 12], [4 + len, y + 22]];
      stroke(ctx, rib, '#8a5a34', 5); stroke(ctx, rib, '#f8ecd4', 3); stroke(ctx, rib.slice(0, 3).map(([x, yy]) => [x, yy - .8]), 'rgba(255,255,255,.7)', .8);
    }
    for (let i = 0; i < 6; i++) { const y = 46 + i * 18, v = [[-6, y - 6], [3, y - 7.4], [8, y - 4], [9.6, y + .4], [8, y + 4.6], [3, y + 7], [-6, y + 6]]; shape(ctx, v, '#f6e8cc', null); cel(ctx, v, '#e3c79c', -1.4, 1.6); shape(ctx, v, null, '#8a5a34', 1.2); stroke(ctx, [[-1, y - 4], [4, y - 4.6]], 'rgba(255,255,255,.8)', .9); }
    hollow([404, 360, 12, 10], 5); ammonite(ctx, 404, 360, 8, 1, '#f6e6c8', '#e3c79c', '#8a5a34');
    // Tools left on the ledge: a trowel stuck in the sand and a soft brush.
    ctx.save(); ctx.translate(366, 284); ctx.rotate(.38);
    poly(ctx, [[-1.6, -14], [1.6, -14], [1.6, -4], [-1.6, -4]], '#a0693c', '#5a3a24', 1);
    poly(ctx, [[0, -4], [5.6, 2], [0, 10], [-5.6, 2]], '#cfd6dc', '#5d6a76', 1.1);
    stroke(ctx, [[-2.6, 1.6], [0, -1.8]], 'rgba(255,255,255,.8)', .9);
    ctx.restore();
    ctx.save(); ctx.translate(48, 285); ctx.rotate(-.12);
    poly(ctx, [[-10, -1.6], [4, -1.6], [4, 1.6], [-10, 1.6]], '#c08a57', '#6e4322', 1);
    poly(ctx, [[4, -2.6], [8, -2.6], [8, 2.6], [4, 2.6]], '#b8b0a6', '#5d554c', 1);
    ctx.beginPath(); ctx.moveTo(8, -3); ctx.quadraticCurveTo(15, -4, 16, 0); ctx.quadraticCurveTo(15, 4, 8, 3); ctx.closePath(); ctx.fillStyle = '#5a4434'; ctx.fill(); ctx.strokeStyle = '#2e2018'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // The floor of the dig, swept smooth in the middle.
    band(ctx, bed(452, 2, 91, .01), 560, '#e8c595', '#a8774a', 1.8);
    band(ctx, bed(498, 3, 92, .01), 560, '#e1b988', '#c39466', 1.2);
    band(ctx, bed(534, 3, 93, .01), 560, '#d9ae7d', '#bb8b5d', 1.1);
    const rf = rng(717);
    for (let i = 0; i < 46; i++) { const x = 16 + rf() * 388, y = 462 + rf() * 92; if (Math.abs(x - 210) < 70) continue; dot(ctx, x, y, .7 + rf(), i % 2 ? 'rgba(150,96,50,.3)' : 'rgba(255,248,230,.6)'); }
    for (const [x, y, w, h, sd] of [[164, 532, 6, 4, 71], [262, 540, 7, 4.5, 72], [300, 474, 5, 3.6, 73]]) pebble(ctx, x, y, w, h, sd, '#f0dcc0', '#d6bc96', '#8f5e33');
    // The skull, with the string-and-peg grid that marks it out.
    const pit = blob(60, 504, 98, 44, 9, .1, 12);
    shape(ctx, pit, '#d6a670', null); cel(ctx, pit, '#e4b885', 6, -6); shape(ctx, pit, null, 'rgba(154,105,60,.8)', 1.3);
    dinoSkull(ctx, -4, 526, 1);
    for (let i = 0; i < 3; i++) dot(ctx, 128 + i * 4, 512 - i * 2, 1.4 + i * .3, '#d4a36c');
    for (const [x, y] of [[14, 452], [146, 458]]) { poly(ctx, [[x - 1.6, y - 16], [x + 1.6, y - 16], [x + 1.2, y + 4], [x - 1.2, y + 4]], '#c49766', '#6e4322', 1); }
    stroke(ctx, [[14, 440], [80, 446], [146, 444]], 'rgba(255,255,255,.85)', .8);
    poly(ctx, [[146, 442], [158, 445], [146, 448]], '#ef6a5b', '#a63b33', .9);
    bone(ctx, 128, 546, 16, -.3, '#8a5a34');
    // A crate of finds and the sleepy dig crew in the right corner.
    const crate = [[340, 470], [402, 466], [404, 520], [342, 524]];
    ammonite(ctx, 360, 466, 9, 1.2, '#f6e6c8', '#e3c79c', '#8a5a34'); bone(ctx, 384, 462, 20, -.4, '#8a5a34');
    poly(ctx, crate, '#c48e58', '#6e4322', 1.6);
    poly(ctx, [[372, 468], [403, 466], [404, 520], [373, 522]], '#ac7846', null);
    for (const y of [486, 504]) stroke(ctx, [[342, y], [404, y - 1]], '#6e4322', 1.2);
    for (const x of [344, 400]) stroke(ctx, [[x, 472], [x + .4, 520]], '#6e4322', 1.1);
    stroke(ctx, [[345, 474], [372, 471]], 'rgba(255,240,210,.7)', 1.2);
    poly(ctx, crate, null, '#6e4322', 1.6);
    moleDigger(ctx, 352, 538, 1.1);
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
  const STONE = ['#7f8c78', '#66725f', '#525d4d', '#1f2820'];
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
  function stoneBlock(ctx, pts, tone, seed) {
    const [light, base, shade, ink] = STONE;
    poly(ctx, pts, [base, '#6b7764', '#616d5b'][tone % 3], null);
    clipTo(ctx, pts, () => {
      ctx.beginPath(); smooth(ctx, pts.map(([x, y]) => [x - 4, y - 4]), true); ctx.rect(-50, -50, 520, 660); ctx.fillStyle = shade; ctx.fill('evenodd');
      const r = rng(seed);
      for (let i = 0; i < 3; i++) { const p = pts[Math.floor(r() * pts.length)]; dot(ctx, p[0] + (r() - .5) * 20, p[1] + (r() - .5) * 14, .8 + r(), 'rgba(18,26,20,.3)'); }
    });
    poly(ctx, pts, null, ink, 1.5);
    stroke(ctx, [[pts[0][0] + 2, pts[0][1] + 2], [pts[1][0] - 2, pts[1][1] + 2]], light, 1.1);
  }
  function mossCap(ctx, x0, x1, y, seed, drip = 0) {
    const r = rng(seed), pts = [[x0, y + 2]];
    for (let x = x0; x <= x1; x += 6) pts.push([x, y - 2 - r() * 4]);
    pts.push([x1, y + 2]);
    for (let x = x1 - 4; x > x0; x -= 7) pts.push([x, y + 2 + r() * 3 + (r() < drip ? 6 + r() * 6 : 0)]);
    shape(ctx, pts, '#6f9e50', null); cel(ctx, pts, '#5a8a44', -2, 2.4); shape(ctx, pts, null, '#2c4a26', 1.2);
    for (let x = x0 + 4; x < x1 - 4; x += 9 + r() * 6) dot(ctx, x, y - 2 - r() * 2, 1.1, 'rgba(220,250,170,.55)');
  }
  function leaf(ctx, x, y, len, angle) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * .5, -len * .36, len, 0); ctx.quadraticCurveTo(len * .5, len * .36, 0, 0); ctx.closePath();
    ctx.fillStyle = '#5f9a4e'; ctx.fill(); ctx.strokeStyle = '#24401f'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(len * .2, len * .03); ctx.quadraticCurveTo(len * .5, len * .3, len * .9, len * .03); ctx.closePath(); ctx.fillStyle = '#4c8240'; ctx.fill();
    stroke(ctx, [[len * .1, 0], [len * .8, -len * .02]], 'rgba(200,240,170,.55)', .8);
    ctx.restore();
  }
  function rose(ctx, x, y, r, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - .3; dot(ctx, Math.cos(a) * r * .55, Math.sin(a) * r * .5, r * .55, '#c8455f'); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - .3; ctx.beginPath(); ctx.arc(Math.cos(a) * r * .55, Math.sin(a) * r * .5, r * .55, a - 1.2, a + 1.2); ctx.strokeStyle = '#6a1f36'; ctx.lineWidth = 1; ctx.stroke(); }
    dot(ctx, 0, 0, r * .55, '#a8344f');
    ctx.beginPath(); for (let a = 0; a < 2.4 * TAU; a += .3) { const rr = r * .06 + a * r * .035; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.strokeStyle = '#ef8ea2'; ctx.lineWidth = .9; ctx.stroke();
    ctx.beginPath(); ctx.arc(-r * .3, -r * .32, r * .4, 3.4, 4.6); ctx.strokeStyle = 'rgba(255,214,222,.75)'; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  // A briar: a thorny cane wandering along the stone, leaves and a rose or two where it pleases.
  function briar(ctx, pts, seed, roses = []) {
    stroke(ctx, pts, '#24401f', 3.6); stroke(ctx, pts, '#557a3c', 1.8);
    const r = rng(seed);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], a = Math.atan2(y1 - y0, x1 - x0), seg = Math.hypot(x1 - x0, y1 - y0);
      for (let t = .2; t < 1; t += 14 / seg) {
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, side = r() < .5 ? -1 : 1;
        if (r() < .55) { const ta = a + side * 1.2; poly(ctx, [[x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4], [x + Math.cos(ta) * 4.4, y + Math.sin(ta) * 4.4], [x - Math.cos(a) * 1.4, y - Math.sin(a) * 1.4]], '#7a5a3a', '#24401f', .6); }
        else leaf(ctx, x, y, 8 + r() * 4, a + side * (.9 + r() * .4));
      }
    }
    for (const [i, rr] of roses) { const [x, y] = pts[i]; leaf(ctx, x - 2, y + 2, 9, 2.4); leaf(ctx, x + 2, y + 1, 9, .5); rose(ctx, x, y, rr, r() * 3); }
  }
  function rabbitStatue(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const [light, base, shade, ink] = ['#a2ad98', '#8a9682', '#717d6a', '#2a3329'];
    poly(ctx, [[-22, 0], [22, 0], [22, 18], [-22, 18]], '#6f7b68', ink, 1.4);
    poly(ctx, [[-25, -5], [25, -5], [25, 1], [-25, 1]], base, ink, 1.4);
    stroke(ctx, [[-22, -3.4], [22, -3.4]], light, 1);
    leafGlyph(ctx, 0, 9, .55, Math.PI / 2);
    for (const [ex, a, h] of [[-4.6, -.2, 26], [5.4, .5, 22]]) {
      ctx.save(); ctx.translate(ex, -38); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, -h / 2, 3.9, h / 2, 0, 0, TAU); ctx.fillStyle = base; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(.6, -h / 2 + 1, 1.7, h / 2 - 4.4, 0, 0, TAU); ctx.fillStyle = shade; ctx.fill();
      ctx.restore();
    }
    const body = [[-16, -5], [-17, -18], [-10, -28], [2, -30], [12, -24], [16, -12], [14, -5]];
    shape(ctx, body, base, null); cel(ctx, body, shade, -3, 3); shape(ctx, body, null, ink, 1.4);
    const head = blob(0, -34, 11, 9.4, 7, .04, 10);
    shape(ctx, head, base, null); cel(ctx, head, shade, -2, 2.4); shape(ctx, head, null, ink, 1.4);
    for (const ex of [-4.4, 4.4]) { ctx.beginPath(); ctx.arc(ex, -35, 2.2, .3, Math.PI - .3); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke(); }
    dot(ctx, 0, -31.6, 1.2, ink); stroke(ctx, [[-2, -29.4], [0, -28.4], [2, -29.4]], ink, .8);
    ctx.beginPath(); ctx.ellipse(-12, -6, 5, 3, 0, 0, TAU); ctx.fillStyle = base; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke();
    stroke(ctx, [[-7, -40], [-3, -42.6], [1, -41]], light, 1.2);
    stroke(ctx, [[8, -20], [11, -14], [9, -9]], 'rgba(42,51,41,.5)', .9);
    for (const [mx, my, mr] of [[-6, -42, 3.4], [-2, -43.4, 2.8], [2, -42.6, 2.4], [-24, -5, 2.6], [-20, -6, 3], [-16, -5.4, 2.4], [20, -4.6, 2.2]]) dot(ctx, mx, my, mr + 1, '#2c4a26');
    for (const [mx, my, mr] of [[-6, -42, 3.4], [-2, -43.4, 2.8], [2, -42.6, 2.4], [-24, -5, 2.6], [-20, -6, 3], [-16, -5.4, 2.4], [20, -4.6, 2.2]]) dot(ctx, mx, my, mr, '#6f9e50');
    dot(ctx, -7, -43.4, 1, 'rgba(220,250,170,.6)');
    ctx.restore();
  }
  function toad(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const ink = '#2f4220', skin = '#8fae5e', dark = '#6f8f46';
    const body = [[-16, 0], [-17, -9], [-10, -16], [10, -16], [17, -9], [16, 0], [0, 2]];
    shape(ctx, body, skin, null); cel(ctx, body, dark, -3, 3); shape(ctx, body, null, ink, 1.4);
    ctx.beginPath(); ctx.ellipse(0, -4, 9, 4.6, 0, 0, TAU); ctx.fillStyle = '#dcd99c'; ctx.fill();
    for (const [sx, sy, sr] of [[-11, -9, 1.6], [12, -6, 1.3], [7, -12, 1.1], [-6, -13, 1]]) dot(ctx, sx, sy, sr, dark);
    for (const ex of [-8, 8]) {
      dot(ctx, ex, -15, 5, skin); ctx.beginPath(); ctx.arc(ex, -15, 5, Math.PI * .92, Math.PI * 2.08); ctx.strokeStyle = ink; ctx.lineWidth = 1.3; ctx.stroke();
      dot(ctx, ex, -14.6, 3.2, '#e8d58a');
      ctx.beginPath(); ctx.ellipse(ex, -14.4, 2.4, 1.2, 0, 0, TAU); ctx.fillStyle = '#2a2a18'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex - 3.6, -16); ctx.quadraticCurveTo(ex, -18.4, ex + 3.6, -16); ctx.lineTo(ex + 3.6, -18); ctx.quadraticCurveTo(ex, -20.4, ex - 3.6, -18); ctx.closePath(); ctx.fillStyle = skin; ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex - 3.6, -16); ctx.quadraticCurveTo(ex, -18.4, ex + 3.6, -16); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      dot(ctx, ex - 1.2, -13.6, .7, '#ffffff');
    }
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.quadraticCurveTo(0, -3, 8, -8); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke();
    dot(ctx, -11, -6.4, 1.8, 'rgba(240,150,140,.45)'); dot(ctx, 11, -6.4, 1.8, 'rgba(240,150,140,.45)');
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * 9, 1, 5, 2.4, 0, 0, TAU); ctx.fillStyle = skin; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke(); }
    ctx.restore();
  }
  function paintBriar(ctx, framed) {
    const back = ctx.createLinearGradient(0, 0, 0, 560);
    back.addColorStop(0, '#2a3a33'); back.addColorStop(.6, '#25332d'); back.addColorStop(1, '#1d2823');
    ctx.fillStyle = back; ctx.fillRect(0, 0, 420, 560);
    // The far wall: coursed stone, barely there, and an arcade beyond in the gloom.
    ctx.save(); ctx.strokeStyle = 'rgba(160,190,150,.07)'; ctx.lineWidth = 1;
    for (let y = 60, row = 0; y < 456; y += 30, row++) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(420, y); ctx.stroke(); for (let x = (row % 2) * 32; x < 420; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 30); ctx.stroke(); } }
    ctx.restore();
    for (const [x0, x1, top] of [[64, 152, 262], [152, 268, 232], [268, 356, 262]]) {
      const cx = (x0 + x1) / 2, rr = (x1 - x0) / 2 - 8;
      ctx.beginPath(); ctx.moveTo(x0 + 8, 456); ctx.lineTo(x0 + 8, top + rr); ctx.arc(cx, top + rr, rr, Math.PI, 0); ctx.lineTo(x1 - 8, 456); ctx.closePath();
      ctx.fillStyle = 'rgba(16,24,20,.32)'; ctx.fill(); ctx.strokeStyle = 'rgba(160,190,150,.13)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    for (const x of [64, 152, 268, 356]) poly(ctx, [[x - 8, 230], [x + 8, 230], [x + 8, 456], [x - 8, 456]], '#2c3b34', 'rgba(160,190,150,.13)', 1.1);
    // Green-gold daylight finds its way down from somewhere high above.
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const [x0, x1, x2, x3, a] of [[120, 176, 300, 200, .07], [150, 166, 250, 214, .06]]) {
      ctx.beginPath(); ctx.moveTo(x0, 30); ctx.lineTo(x1, 30); ctx.lineTo(x2, 456); ctx.lineTo(x3, 456); ctx.closePath(); ctx.fillStyle = `rgba(220,240,160,${a})`; ctx.fill();
    }
    ctx.restore();
    // Spandrels: the dark walling the great arch is built into.
    const spandrel = () => { ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(430, -10); ctx.lineTo(430, 204); ctx.lineTo(396, 204); ctx.arc(210, 200, 186, 0, Math.PI, true); ctx.lineTo(-10, 204); ctx.closePath(); };
    spandrel(); ctx.fillStyle = '#2e3a31'; ctx.fill();
    ctx.save(); spandrel(); ctx.clip();
    ctx.strokeStyle = 'rgba(12,18,14,.55)'; ctx.lineWidth = 1.2;
    for (let y = 8, row = 0; y < 210; y += 24, row++) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(420, y); ctx.stroke(); for (let x = (row % 2) * 22 + 6; x < 420; x += 44) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 24); ctx.stroke(); } }
    ctx.restore();
    // The great arch, stone by stone, the keystone carved with a leaf.
    const n = 11, r1 = 158, r2 = 188;
    for (let i = 0; i < n; i++) {
      const key = i === 5, a0 = Math.PI + i * Math.PI / n, a1 = Math.PI + (i + 1) * Math.PI / n, out = key ? r2 + 8 : r2, inn = key ? r1 - 6 : r1;
      const pts = [];
      for (let t = 0; t <= 4; t++) { const a = a0 + (a1 - a0) * t / 4; pts.push([210 + Math.cos(a) * out, 200 + Math.sin(a) * out]); }
      for (let t = 4; t >= 0; t--) { const a = a0 + (a1 - a0) * t / 4; pts.push([210 + Math.cos(a) * inn, 200 + Math.sin(a) * inn]); }
      poly(ctx, pts, ['#66725f', '#6b7764', '#616d5b'][i % 3], null);
      clipTo(ctx, pts, () => { ctx.beginPath(); ctx.arc(210, 200, inn + 7, 0, TAU); ctx.fillStyle = '#4b5647'; ctx.fill(); });
      poly(ctx, pts, null, '#1f2820', 1.5);
      ctx.beginPath(); ctx.arc(210, 200, out - 2.4, a0 + .02, a1 - .02); ctx.strokeStyle = 'rgba(190,210,170,.35)'; ctx.lineWidth = 1.1; ctx.stroke();
      if (key) leafGlyph(ctx, 210, 200 - (out + inn) / 2, .95, 0);
    }
    // Pillars: drums of stone, carved leaves on a few, capitals and plinths.
    for (const [x0, x1, side] of [[-2, 52, 0], [368, 422, 1]]) {
      const ys = [224, 262, 304, 342, 386, 432];
      for (let i = 0; i < ys.length - 1; i++) stoneBlock(ctx, [[x0, ys[i]], [x1, ys[i]], [x1, ys[i + 1]], [x0, ys[i + 1]]], i + side, i * 7 + side);
      for (const yi of side ? [1, 3] : [2, 4]) leafGlyph(ctx, (x0 + x1) / 2 + (side ? -4 : 4), (ys[yi] + ys[yi + 1]) / 2, 1, side ? .3 : -.3);
      stoneBlock(ctx, [[x0 - 8, 200], [x1 + 8, 200], [x1 + 4, 214], [x1, 224], [x0, 224], [x0 - 4, 214]], 0, 30 + side);
      for (let k = 0; k < 3; k++) { const cx = x0 + 10 + k * 17; ctx.beginPath(); ctx.arc(cx, 212, 4.4, Math.PI * .1, Math.PI * 1.9); ctx.strokeStyle = 'rgba(18,26,20,.65)'; ctx.lineWidth = 1.1; ctx.stroke(); }
      stoneBlock(ctx, [[x0 - 6, 432], [x1 + 6, 432], [x1 + 6, 458], [x0 - 6, 458]], 1, 40 + side);
      mossCap(ctx, x0 - 6, x1 + 6, 200, 50 + side, .5);
      mossCap(ctx, x0 - 4, x1 + 4, 432, 60 + side, .3);
    }
    // Moss along the top of the arch, and roots of ivy hanging from it.
    const rmo = rng(313);
    for (const [a0, a1] of [[3.2, 3.8], [4.52, 4.68], [5.62, 6.2]]) {
      const top = [], under = [];
      for (let a = a0; a <= a1 + .001; a += (a1 - a0) / 10) { top.push([210 + Math.cos(a) * (190 + rmo() * 5), 200 + Math.sin(a) * (190 + rmo() * 5)]); under.unshift([210 + Math.cos(a) * (184 - rmo() * 3), 200 + Math.sin(a) * (184 - rmo() * 3)]); }
      const pts = top.concat(under);
      shape(ctx, pts, '#6f9e50', null); cel(ctx, pts, '#5a8a44', -2, 2.4); shape(ctx, pts, null, '#2c4a26', 1.2);
      for (let k = 1; k < top.length - 1; k += 2) dot(ctx, top[k][0], top[k][1] + 1.6, 1.1, 'rgba(220,250,170,.55)');
    }
    for (const [a, len] of [[3.5, 30], [3.66, 18], [5.82, 26], [5.96, 40], [4.2, 12], [5.3, 14]]) {
      const x = 210 + Math.cos(a) * 158, y = 200 + Math.sin(a) * 158;
      stroke(ctx, [[x, y], [x + 2, y + len * .5], [x - 1, y + len]], '#3f6b37', 1.3);
      for (let k = 6; k < len; k += 7) leaf(ctx, x + (k % 14 ? 1 : -1), y + k, 5, k % 14 ? .6 : 2.5);
    }
    // The briars: up the pillars and over the arch.
    const arcPts = (a0, a1, rr, wob, seed) => { const r = rng(seed), out = []; for (let a = a0; Math.sign(a1 - a0) * (a1 - a) > 0; a += (a1 - a0) / 9) out.push([210 + Math.cos(a) * (rr + (r() - .5) * wob), 200 + Math.sin(a) * (rr + (r() - .5) * wob)]); return out; };
    briar(ctx, [[30, 470], [44, 420], [30, 370], [48, 320], [34, 270], [46, 226]].concat(arcPts(3.2, 4.1, 172, 18, 3)), 5, [[3, 6.4], [6, 7], [10, 6]]);
    briar(ctx, [[392, 466], [378, 410], [396, 350], [380, 290], [392, 236]].concat(arcPts(6.24, 5.5, 174, 16, 4)), 6, [[2, 6.6], [7, 7.2], [11, 5.6]]);
    // Fireflies and dust in the light.
    const rm = rng(929);
    for (let i = 0; i < 26; i++) {
      const x = rm() < .5 ? 20 + rm() * 70 : 330 + rm() * 70, y = 70 + rm() * 360;
      dot(ctx, x, y, 3, 'rgba(230,255,150,.12)'); dot(ctx, x, y, 1, 'rgba(240,255,190,.85)');
    }
    // The floor: old flagstones, moss in the joints.
    band(ctx, ridge(458, 1.4, 99, 40), 560, '#38443a', '#141c16', 1.8);
    ctx.save(); ctx.strokeStyle = 'rgba(14,20,16,.6)'; ctx.lineWidth = 1.2;
    for (const [y, xs] of [[478, [40, 104, 300, 360]], [504, [72, 140, 280, 344]], [534, [24, 98, 318, 392]]]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(420, y); ctx.stroke();
      for (const x of xs) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + (y === 534 ? 26 : y === 504 ? 30 : 26)); ctx.stroke(); }
    }
    ctx.restore();
    for (const [x, y] of [[40, 478], [104, 504], [300, 478], [344, 534], [98, 534]]) for (let k = 0; k < 4; k++) dot(ctx, x - 6 + k * 4, y + (k % 2) - .5, 1.8, '#5a8a44');
    // A stone rabbit keeps watch in one corner; in the other, a toad on a fallen drum among the roses.
    rabbitStatue(ctx, 94, 506, 1.22);
    briar(ctx, [[60, 540], [66, 520], [58, 500], [64, 486]], 7, [[3, 5.6]]);
    const drum = [[310, 508], [384, 502], [390, 542], [316, 548]];
    poly(ctx, drum, '#66725f', null);
    clipTo(ctx, drum, () => { ctx.fillStyle = '#4b5647'; ctx.fillRect(300, 530, 120, 30); });
    poly(ctx, drum, null, '#1f2820', 1.5);
    for (const x of [332, 350, 368]) stroke(ctx, [[x, 506.6], [x + 1, 546]], 'rgba(18,26,20,.4)', 1);
    ctx.beginPath(); ctx.ellipse(312, 528, 8, 20, -.06, 0, TAU); ctx.fillStyle = '#7f8c78'; ctx.fill(); ctx.strokeStyle = '#1f2820'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(312, 528, 4.6, 12, -.06, 0, TAU); ctx.strokeStyle = 'rgba(18,26,20,.5)'; ctx.lineWidth = 1; ctx.stroke();
    mossCap(ctx, 330, 380, 504, 70, .25);
    toad(ctx, 352, 502, 1.05);
    briar(ctx, [[404, 548], [398, 520], [408, 492], [400, 470]], 8, [[2, 6.4]]);
    if (framed) frame(ctx, '#5e8a5a', '#d9e9a8');
  }

  // ---------- Level 10: Starseed Core ----------
  const GOLD = ['#fff4c8', '#ffd27a', '#e0a040', '#7a4a1a'];
  // A great root: a tapering ribbon of bark with a vein of light running down it toward the seed.
  // The two edges of a ribbon that tapers along a line of points.
  function ribbon(pts, width, taper, r) {
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      const dx = q[0] - o[0], dy = q[1] - o[1], len = Math.hypot(dx, dy) || 1, w = width * (1 - i / (pts.length - 1) * taper) / 2 * (.9 + r() * .2);
      left.push([p[0] - dy / len * w, p[1] + dx / len * w]); right.push([p[0] + dy / len * w, p[1] - dx / len * w]);
    }
    return [left, right];
  }
  function coreRoot(ctx, pts, width, glow = .6) {
    const r = rng(Math.round(pts[0][0] * 13 + width)), [left, right] = ribbon(pts, width, .72, r);
    const outline = left.concat(right.slice().reverse());
    shape(ctx, outline, '#4b2e55', null); cel(ctx, outline, '#3a2245', width * .18, width * .08);
    // Bark: long grooves that follow the grain, and the odd knot.
    clipTo(ctx, outline, () => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, w = width * (1 - i / (pts.length - 1) * .72) / 2;
        for (const k of [-.55, .5, -.15]) {
          const off = k * w + (r() - .5) * 3, t0 = r() * .3, t1 = .55 + r() * .4;
          stroke(ctx, [[x0 + dx * t0 + nx * off, y0 + dy * t0 + ny * off], [x0 + dx * (t0 + t1) / 2 + nx * (off + 1.5), y0 + dy * (t0 + t1) / 2 + ny * (off + 1.5)], [x0 + dx * t1 + nx * off, y0 + dy * t1 + ny * off]], 'rgba(22,10,32,.42)', 1.1);
        }
        if (w > 12 && r() < .35) { const kx = x0 + dx * .5 - nx * w * .4, ky = y0 + dy * .5 - ny * w * .4; ctx.beginPath(); ctx.ellipse(kx, ky, 3.4, 2.2, Math.atan2(dy, dx), 0, TAU); ctx.strokeStyle = 'rgba(22,10,32,.5)'; ctx.lineWidth = 1.1; ctx.stroke(); }
      }
    });
    shape(ctx, outline, null, '#1a0d22', 1.7);
    stroke(ctx, left.slice(1, -1).map(([x, y], i) => [x + (pts[i + 1][0] - x) * .22, y + (pts[i + 1][1] - y) * .22]), 'rgba(200,160,230,.38)', 1.2);
    for (const [w, c] of [[5, `rgba(255,190,110,${.12 * glow})`], [2.4, `rgba(255,205,130,${.35 * glow})`], [.9, `rgba(255,236,190,${.9 * glow})`]]) stroke(ctx, pts.slice(1), c, w);
    return outline;
  }
  function seedSprite(ctx, x, y, s, wave) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    halo(ctx, 0, -6, 18, '255,220,140', .09);
    stroke(ctx, [[0, -13], [1, -18]], '#5aa85f', 1.3);
    ctx.beginPath(); ctx.ellipse(4, -19, 3.6, 1.8, -.4, 0, TAU); ctx.fillStyle = '#8fd67d'; ctx.fill(); ctx.strokeStyle = '#3f8a48'; ctx.lineWidth = .8; ctx.stroke();
    const body = [[-8, 0], [-9, -7], [-5, -13], [3, -13.4], [8.6, -8], [8, 0], [0, 1.4]];
    shape(ctx, body, '#fff1c6', null); cel(ctx, body, '#f6d48e', -2, 2); shape(ctx, body, null, '#b47a3a', 1.2);
    dot(ctx, -3, -6.4, 1.2, '#5a3418'); dot(ctx, 3, -6.4, 1.2, '#5a3418');
    ctx.beginPath(); ctx.arc(0, -4.6, 1.8, .3, Math.PI - .3); ctx.strokeStyle = '#5a3418'; ctx.lineWidth = .8; ctx.stroke();
    dot(ctx, -5.4, -4, 1.3, 'rgba(255,150,140,.55)'); dot(ctx, 5.4, -4, 1.3, 'rgba(255,150,140,.55)');
    if (wave) { stroke(ctx, [[7.6, -6], [12, -10], [13, -14]], '#b47a3a', 2.6); stroke(ctx, [[7.6, -6], [12, -10], [13, -14]], '#fff1c6', 1.3); }
    ctx.restore();
  }
  function paintCore(ctx, framed) {
    const back = ctx.createLinearGradient(0, 0, 0, 560);
    back.addColorStop(0, '#1b1432'); back.addColorStop(.45, '#271a42'); back.addColorStop(.78, '#3a2050'); back.addColorStop(1, '#5a2c5a');
    ctx.fillStyle = back; ctx.fillRect(0, 0, 420, 560);
    // Light welling up from the seed below the floor of the world.
    const well = ctx.createRadialGradient(210, 640, 40, 210, 640, 330);
    well.addColorStop(0, 'rgba(255,214,140,.55)'); well.addColorStop(.45, 'rgba(255,160,120,.18)'); well.addColorStop(1, 'rgba(255,140,120,0)');
    ctx.fillStyle = well; ctx.fillRect(0, 300, 420, 260);
    // Soft rings of light ripple out from it, seen only at the edges.
    const fade = ctx.createLinearGradient(0, 0, 420, 0);
    fade.addColorStop(0, 'rgba(255,215,150,.26)'); fade.addColorStop(.24, 'rgba(255,215,150,0)'); fade.addColorStop(.76, 'rgba(255,215,150,0)'); fade.addColorStop(1, 'rgba(255,215,150,.26)');
    for (const [rr, w] of [[250, 1.4], [318, 1.1], [392, 1.4], [470, 1], [552, 1.2]]) { ctx.beginPath(); ctx.arc(210, 650, rr, Math.PI, TAU); ctx.strokeStyle = fade; ctx.lineWidth = w; ctx.stroke(); }
    // Faint far roots in the dark, all bending toward the light.
    const rf = rng(77);
    for (const [pts, w] of [[[[120, -10], [112, 110], [134, 230], [160, 330], [176, 410]], 22], [[[300, -10], [316, 130], [292, 260], [258, 360], [244, 420]], 24], [[[206, -10], [198, 70], [210, 150], [204, 210]], 12]]) {
      const [l, rr] = ribbon(pts, w, .9, rf), out = l.concat(rr.reverse());
      shape(ctx, out, 'rgba(58,36,80,.55)', 'rgba(150,110,190,.12)', 1);
      stroke(ctx, pts.slice(1), 'rgba(255,200,130,.10)', 1.2);
    }
    // The roof of the world, roots pushing down through it.
    caveWall(ctx, [[-10, -10], [430, -10], [430, 28], [370, 38], [300, 26], [240, 38], [180, 28], [120, 40], [60, 30], [-10, 38]], '#20152f', '#1a1128', '#0e0818');
    coreRoot(ctx, [[96, -10], [92, 30], [70, 76], [52, 120], [34, 170]], 18, .5);
    coreRoot(ctx, [[322, -10], [330, 34], [352, 80], [372, 128]], 16, .5);
    coreRoot(ctx, [[190, 20], [196, 40], [188, 58]], 7, .35);
    coreRoot(ctx, [[252, 24], [246, 44], [254, 62], [250, 74]], 6, .35);
    // The two great roots come down the walls and curl in toward the seed.
    coreRoot(ctx, [[-20, -10], [22, 70], [10, 170], [30, 270], [16, 360], [44, 440], [110, 500], [176, 540], [204, 566]], 64, 1);
    coreRoot(ctx, [[440, -10], [398, 80], [412, 190], [390, 290], [406, 380], [372, 450], [306, 506], [244, 542], [216, 566]], 60, 1);
    coreRoot(ctx, [[26, 300], [60, 330], [72, 372], [64, 410]], 12, .7);
    coreRoot(ctx, [[396, 236], [362, 262], [352, 300]], 11, .7);
    coreRoot(ctx, [[40, 470], [80, 520], [96, 566]], 22, .8);
    coreRoot(ctx, [[380, 470], [350, 520], [338, 566]], 20, .8);
    // The starseed itself, mostly below the world, its seam just starting to open.
    const seed = [[210, 464], [236, 472], [270, 498], [298, 536], [314, 590], [298, 650], [210, 690], [122, 650], [106, 590], [122, 536], [150, 498], [184, 472]];
    halo(ctx, 210, 560, 130, '255,206,130', .07);
    shape(ctx, seed, '#c97868', null);
    clipTo(ctx, seed, () => {
      ctx.beginPath(); smooth(ctx, seed.map(([x, y]) => [210 + (x - 210) * .72, y + 18]), true); ctx.fillStyle = '#dc9472'; ctx.fill();
      ctx.beginPath(); smooth(ctx, seed.map(([x, y]) => [210 + (x - 210) * .42, y + 34]), true); ctx.fillStyle = '#eab281'; ctx.fill();
      for (const k of [-.8, -.5, -.22, .22, .5, .8]) stroke(ctx, [[210 + k * 6, 468], [210 + k * 40, 494], [210 + k * 76, 534], [210 + k * 100, 590]], 'rgba(130,56,74,.32)', 1.3);
      ctx.beginPath(); smooth(ctx, seed.map(([x, y]) => [x + 9, y + 6]), true); ctx.rect(-50, -50, 520, 660); ctx.fillStyle = 'rgba(130,52,84,.38)'; ctx.fill('evenodd');
    });
    shape(ctx, seed, null, '#6a2844', 2);
    stroke(ctx, [[164, 494], [186, 476], [204, 469]], 'rgba(255,240,210,.7)', 1.6);
    const seam = [[210, 468], [208, 486], [212, 504], [209, 524], [212, 544], [210, 564]];
    for (const [w, c] of [[11, 'rgba(255,230,160,.16)'], [5, 'rgba(255,236,180,.42)'], [1.8, '#fff4d0']]) stroke(ctx, seam, c, w);
    for (const [x, y] of [[198, 520], [222, 506], [203, 548], [219, 538]]) dot(ctx, x, y, 1, 'rgba(255,240,200,.8)');
    // Gold crystals and two little seedlings keeping the seed company.
    crystalCluster(ctx, 44, 556, .7, GOLD, 91, .9);
    crystalCluster(ctx, 384, 552, .62, GOLD, 92, .9);
    crystal(ctx, 118, 512, 7, 15, -.4, GOLD); crystal(ctx, 300, 512, 6, 13, .45, GOLD);
    seedSprite(ctx, 72, 468, 1, true);
    seedSprite(ctx, 352, 476, .9, false);
    // Star motes and little rings of light drifting at the edges.
    const rs = rng(1010);
    for (let i = 0; i < 40; i++) {
      const left = i % 2 === 0, x = left ? 12 + rs() * 76 : 332 + rs() * 76, y = 50 + rs() * 400, c = ['rgba(255,226,160,.9)', 'rgba(255,190,200,.85)', 'rgba(255,255,240,.9)'][i % 3];
      if (rs() < .35) sparkle(ctx, x, y, 2 + rs() * 2.6, c); else dot(ctx, x, y, .8 + rs() * .8, c);
    }
    for (const [x, y, rr] of [[56, 220, 9], [372, 170, 7], [30, 400, 6], [396, 352, 10], [90, 96, 5], [334, 420, 5]]) {
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.strokeStyle = 'rgba(255,220,160,.35)'; ctx.lineWidth = 1; ctx.stroke();
      dot(ctx, x, y, 1.4, 'rgba(255,240,200,.9)');
    }
    for (const [x, y, s] of [[60, 140, 4.4], [366, 96, 3.6], [24, 330, 3.6], [400, 300, 4.2], [108, 452, 3.2], [318, 448, 3.4]]) sparkle(ctx, x, y, s, '#fff6dc');
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
  root.BloomScenery = Object.freeze({ has, paint, drawRock, dark: theme => has(theme) && SCENES[theme].dark, ink: theme => has(theme) ? SCENES[theme].ink : null, themes: Object.keys(SCENES) });
})(typeof window !== 'undefined' ? window : globalThis);
