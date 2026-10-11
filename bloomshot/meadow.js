/* BLOOMSHOT — a little cultivated landscape, with room to grow. */
(function (root) {
  'use strict';

  const W = 420, H = 330, TAU = Math.PI * 2;
  const PLOTS = Object.freeze([
    { id: 'sunbell', x: 89, y: 69, rx: 47, ry: 29, angle: -.13, type: 'gold', accent: '#f5c65f', seed: 217 },
    { id: 'coral', x: 298, y: 64, rx: 56, ry: 31, angle: .13, type: 'coral', accent: '#fa899d', seed: 409 },
    { id: 'lilac', x: 192, y: 126, rx: 47, ry: 30, angle: -.16, type: 'lilac', accent: '#b598e7', seed: 641 },
    { id: 'honey', x: 80, y: 207, rx: 52, ry: 32, angle: .12, type: 'gold', accent: '#f1c45c', seed: 887 },
    { id: 'moon', x: 323, y: 187, rx: 49, ry: 34, angle: -.17, type: 'lilac', accent: '#d5ccf4', seed: 1051 },
    { id: 'dawn', x: 230, y: 265, rx: 62, ry: 33, angle: .08, type: 'coral', accent: '#ffc78e', seed: 1297 }
  ].map(p => Object.freeze(Object.assign(p, { labelX: p.x, labelY: p.y + p.ry + 12 }))));
  const byId = Object.fromEntries(PLOTS.map(p => [p.id, p]));
  // Decorations stand on open grass, clear of the beds, their labels and the path. The icon box frames each
  // one for its card: [center x, center y, size] in meadow units.
  const DECOR = Object.freeze([
    { id: 'bench', x: 96, y: 143, accent: '#e2b47a', icon: [96, 133, 46] },
    { id: 'birdhouse', x: 388, y: 152, accent: '#7cc0ec', icon: [389, 129, 54] },
    { id: 'lilies', x: 355, y: 285, accent: '#f59ac0', icon: [357, 284, 92] },
    { id: 'beehive', x: 58, y: 304, accent: '#f6cf72', icon: [58, 287, 44] },
    { id: 'lanterns', x: 222, y: 198, accent: '#ffe08a', icon: [222, 186, 34], posts: [[128, 296], [222, 198], [263, 146], [212, 62]] },
    { id: 'tree', x: 172, y: 221, accent: '#ec6a5c', icon: [178, 194, 76] }
  ].map(d => Object.freeze(d)));
  const decorById = Object.fromEntries(DECOR.map(d => [d.id, d]));
  // A friend moves in with each decoration. x, y is where to tap it; icon frames its portrait as
  // [center x, center y, size] in the friend's own drawing units.
  const FRIENDS = Object.freeze([
    { id: 'biscuit', decorId: 'bench', x: 92, y: 128, icon: [1, -3, 30] },
    { id: 'pip', decorId: 'birdhouse', x: 393, y: 108, icon: [0, -.5, 16] },
    { id: 'hopper', decorId: 'lilies', x: 339, y: 290, icon: [0, -1, 13] },
    { id: 'buzz', decorId: 'beehive', x: 58, y: 287, icon: [0, -.4, 6.6] },
    { id: 'glimmer', decorId: 'lanterns', x: 142, y: 280, icon: [.5, -.3, 10.5] },
    { id: 'nutmeg', decorId: 'tree', x: 152, y: 213, icon: [-1, -7, 21] }
  ].map(f => Object.freeze(f)));
  const friendById = Object.fromEntries(FRIENDS.map(f => [f.id, f]));
  // Seconds since each friend was tapped, for this frame. A tap plays a short reaction.
  let pokes = {};
  const REACT = 1.1;
  function reaction(id) { const t = pokes[id]; return Number.isFinite(t) && t > 0 && t < REACT ? t / REACT : 0; }
  const plantData = new Map(), foliageCache = new Map();
  let background = null;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      n = n + Math.imul(n ^ (n >>> 7), 61 | n) ^ n;
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function ellipse(ctx, x, y, rx, ry, angle, fill, stroke, lineWidth) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), angle || 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }
  function leaf(ctx, x, y, length, width, angle, fill, vein) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-width, -length * .25, -width * .7, -length * .75, 0, -length);
    ctx.bezierCurveTo(width * .73, -length * .74, width * .95, -length * .25, 0, 0);
    ctx.fillStyle = fill; ctx.fill();
    if (vein) {
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.quadraticCurveTo(width * .09, -length * .55, 0, -length * .9);
      ctx.lineWidth = .55; ctx.strokeStyle = vein; ctx.stroke();
    }
    ctx.restore();
  }
  function bedCurves(p, expand) {
    const rx = p.rx + (expand || 0), ry = p.ry + (expand || 0) * .65;
    return [[-rx * .95, -ry * .06], [
      [-rx * 1.11, -ry * .70, -rx * .52, -ry * 1.13, -rx * .05, -ry * .97],
      [rx * .36, -ry * 1.15, rx * .93, -ry * .68, rx, -ry * .18],
      [rx * 1.09, ry * .40, rx * .53, ry * 1.09, rx * .09, ry * .92],
      [-rx * .39, ry * 1.08, -rx * .86, ry * .70, -rx * .95, -ry * .06]]];
  }
  function bedPath(ctx, p, expand) {
    const [[x, y], curves] = bedCurves(p, expand);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (const c of curves) ctx.bezierCurveTo(c[0], c[1], c[2], c[3], c[4], c[5]);
    ctx.closePath();
  }
  function surface(width, height) {
    let canvas;
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(width, height);
    else if (typeof document !== 'undefined') { canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; }
    return canvas && canvas.getContext('2d') ? canvas : null;
  }
  // ---------- The painted map ----------
  // The map is painted once, like the level scenes: sun from the upper right, soft shadows, no outlines on the
  // ground, and tree canopies from beyond the edges framing the corners. It borrows brushes from the scene
  // painter's kit when that is loaded; without it the soft shapes fall back to plain fills.
  const PATH = [[202, 350], [[205, 305, 143, 302, 153, 264], [156, 230, 237, 237, 242, 186], [248, 144, 257, 118, 235, 99], [209, 80, 171, 65, 187, 33], [195, 15, 215, 3, 221, -18]]];
  const BRANCHES = [[184, 46, 150, 46, 128, 75], [246, 114, 267, 105, 280, 88], [246, 158, 223, 150, 215, 144], [156, 252, 144, 220, 118, 220], [236, 213, 263, 211, 280, 197], [159, 277, 182, 274, 189, 273]]
    .map(([x, y, cx, cy, ex, ey]) => [[x, y], [[cx, cy, ex, ey]]]);
  const POND = [[-38, -7], [[-27, -34, 12, -28, 30, -17], [54, 0, 28, 23, 6, 22], [-20, 27, -45, 13, -38, -7]]];
  const scaled = ([[x, y], curves], k) => [[x * k, y * k], curves.map(c => c.map(n => n * k))];
  function trace(ctx, [[x, y], curves], close) {
    ctx.moveTo(x, y);
    for (const c of curves) c.length === 6 ? ctx.bezierCurveTo(c[0], c[1], c[2], c[3], c[4], c[5]) : ctx.quadraticCurveTo(c[0], c[1], c[2], c[3]);
    if (close) ctx.closePath();
  }
  // Evenly spaced points along a run of curves, each with its unit normal: [x, y, nx, ny].
  function along([start, curves], spacing) {
    const pts = [start];
    let [x0, y0] = start;
    for (const c of curves) {
      for (let i = 1; i <= 40; i++) {
        const t = i / 40, u = 1 - t;
        pts.push(c.length === 6
          ? [u * u * u * x0 + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * c[4], u * u * u * y0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5]]
          : [u * u * x0 + 2 * u * t * c[0] + t * t * c[2], u * u * y0 + 2 * u * t * c[1] + t * t * c[3]]);
      }
      x0 = c[c.length - 2]; y0 = c[c.length - 1];
    }
    const out = [];
    let next = 0, run = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay);
      if (!d) continue;
      for (; next <= run + d; next += spacing) { const k = (next - run) / d; out.push([ax + (bx - ax) * k, ay + (by - ay) * k, (ay - by) / d, (bx - ax) / d]); }
      run += d;
    }
    return out;
  }
  function cover(ctx, style, mode, alpha = 1) {
    ctx.save(); if (mode) ctx.globalCompositeOperation = mode; ctx.globalAlpha = alpha; ctx.fillStyle = style; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  // A soft-edged stroke: the line is drawn far off the canvas and only its blurred shadow lands in place.
  function softLine(ctx, draw, color, width, blur) {
    const m = ctx.getTransform ? ctx.getTransform() : null, far = 3000;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = width;
    if (m) {
      ctx.shadowColor = color; ctx.shadowBlur = blur * (Math.hypot(m.a, m.b) || 1); ctx.shadowOffsetX = far * m.a; ctx.shadowOffsetY = far * m.b;
      ctx.translate(-far, 0); ctx.strokeStyle = '#000';
    } else ctx.strokeStyle = color;
    ctx.beginPath(); draw(); ctx.stroke(); ctx.restore();
  }
  // A rounded, slightly irregular stone outline around (x, y), turned to `angle`.
  function pebble(ctx, x, y, rx, ry, angle, r) {
    const c = Math.cos(angle), s = Math.sin(angle), pts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i + r() * .4) / 7 * TAU, k = .84 + r() * .26, px = Math.cos(a) * rx * k, py = Math.sin(a) * ry * k;
      pts.push([x + px * c - py * s, y + px * s + py * c]);
    }
    const mid = i => [(pts[i][0] + pts[(i + 1) % 7][0]) / 2, (pts[i][1] + pts[(i + 1) % 7][1]) / 2];
    const [mx, my] = mid(6); ctx.moveTo(mx, my);
    for (let i = 0; i < 7; i++) { const [nx, ny] = mid(i); ctx.quadraticCurveTo(pts[i][0], pts[i][1], nx, ny); }
    ctx.closePath();
  }
  // A ring of fieldstones along an edge: no two alike, a gap here and there, contact shadows, three weathered
  // tones, sunlit tops, and moss on the shady side of some.
  function cobbles(ctx, pts, seed, size) {
    const r = rng(seed), stones = [];
    for (const [x, y, nx, ny] of pts) {
      if (r() < .07) continue;
      const k = .62 + r() * .72, slide = (r() - .5) * 1.6, sink = (r() - .5) * 1.1;
      stones.push([x + ny * slide + nx * sink, y - nx * slide + ny * sink, size * k * (1 + r() * .25), size * k * (.62 + r() * .2), Math.atan2(ny, nx) + Math.PI / 2 + (r() - .5) * .7, r()]);
    }
    ctx.beginPath(); stones.forEach(([x, y, rx, ry, a]) => { ctx.moveTo(x - .7 + rx * 1.12, y + 1.4); ctx.ellipse(x - .7, y + 1.4, rx * 1.12, ry * 1.15, a, 0, TAU); });
    ctx.fillStyle = 'rgba(34,40,24,.42)'; ctx.fill();
    ['#9d9580', '#b0a78f', '#c2b9a0'].forEach((tone, t) => {
      ctx.beginPath(); stones.forEach(([x, y, rx, ry, a, pick], i) => { if (Math.floor(pick * 3) === t) pebble(ctx, x, y, rx, ry, a, rng(seed + i)); });
      ctx.fillStyle = tone; ctx.fill();
    });
    ctx.beginPath(); stones.forEach(([x, y, rx, ry, a]) => { const ox = .22 * rx, oy = -.3 * ry; ctx.moveTo(x + ox + rx * .55, y + oy); ctx.ellipse(x + ox, y + oy, rx * .55, ry * .42, a, 0, TAU); });
    ctx.fillStyle = 'rgba(250,246,228,.4)'; ctx.fill();
    ctx.beginPath(); stones.forEach(([x, y, rx, ry, a, pick]) => { if (pick > .6) { ctx.moveTo(x - .3 * rx + rx * .5, y + .35 * ry); ctx.ellipse(x - .3 * rx, y + .35 * ry, rx * .5, ry * .4, a, 0, TAU); } });
    ctx.fillStyle = 'rgba(96,150,72,.62)'; ctx.fill();
  }
  // Grass blades rooted at `half` out from a line, leaning in over it, in a shaded and a lit tone.
  function fringe(ctx, pts, half, seed, keep = .7) {
    const r = rng(seed), blades = [[], []];
    for (const [x, y, nx, ny] of pts) {
      if (r() > keep) continue;
      const bx = x - nx * half, by = y - ny * half, reach = 2 + r() * 2.8;
      blades[r() < .6 ? 0 : 1].push([bx, by, bx + nx * reach + (r() - .5) * 1.6, by + ny * reach - 1.3]);
    }
    ['rgba(56,128,76,.85)', 'rgba(150,204,110,.9)'].forEach((tone, t) => {
      ctx.beginPath(); blades[t].forEach(([x, y, tx, ty]) => { ctx.moveTo(x - .9, y + .3); ctx.lineTo(tx, ty); ctx.lineTo(x + .9, y - .3); });
      ctx.fillStyle = tone; ctx.fill();
    });
  }
  function paintLawn(ctx, soft) {
    const lawn = ctx.createLinearGradient(400, 0, 40, 330);
    lawn.addColorStop(0, '#c9e897'); lawn.addColorStop(.45, '#a0d585'); lawn.addColorStop(1, '#66b47e');
    cover(ctx, lawn);
    const r = rng(71043);
    // Broad, uneven patches so the grass never reads as one flat fill.
    for (let i = 0; i < 16; i++) {
      const x = r() * W, y = r() * H, s = 30 + r() * 50, rgb = i % 3 ? '42,124,84' : '244,252,186', a = i % 3 ? .12 : .2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(-.45); ctx.scale(1.5, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
      g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.6, `rgba(${rgb},${a * .5})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(-s, -s, s * 2, s * 2); ctx.restore();
    }
    // Mown stripes: wide, soft bands on the diagonal, the way a lawn looks after the mower.
    const stripes = ctx.createLinearGradient(0, 0, 260, 424), n = 14;
    for (let i = 0; i < n; i++) {
      const tone = i % 2 ? 'rgba(255,255,226,.085)' : 'rgba(22,92,62,.06)';
      stripes.addColorStop(i / n + .012, tone); stripes.addColorStop((i + 1) / n - .012, tone);
    }
    cover(ctx, stripes);
    // Grass: tufts gathered in loose drifts rather than sprinkled evenly, darker at the root and lit at the tips.
    const tufts = [];
    for (let i = 0; i < 90; i++) {
      const cx = r() * W, cy = r() * H, spread = 8 + r() * 16, many = 2 + Math.floor(r() * 7);
      for (let j = 0; j < many; j++) tufts.push([cx + (r() - .5) * spread * 2, cy + (r() - .5) * spread, .55 + r() * .9, r()]);
    }
    for (let i = 0; i < 160; i++) tufts.push([r() * W, r() * H, .45 + r() * .3, r()]);
    for (const [tone, from, count] of [['rgba(34,110,70,.24)', 0, 4], ['rgba(232,248,176,.32)', .5, 3]]) {
      ctx.beginPath();
      for (const [x, y, k, j] of tufts) for (let b = 0; b < count; b++) {
        const bx = x + (b - count / 2) * 1.2 * k, h = (2.3 + ((b + Math.floor(j * 3)) % 3) * .9) * k, lean = (b - count / 2) * .6 + .5, by = y - h * from;
        ctx.moveTo(bx - .55 * (1 - from), by); ctx.lineTo(bx + lean, y - h); ctx.lineTo(bx + .55 * (1 - from), by);
      }
      ctx.fillStyle = tone; ctx.fill();
    }
    // Warm light pooling in from the upper right.
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const sun = ctx.createRadialGradient(410, -30, 10, 410, -30, 320);
    sun.addColorStop(0, 'rgba(255,238,180,.5)'); sun.addColorStop(.5, 'rgba(255,238,180,.12)'); sun.addColorStop(1, 'rgba(255,238,180,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  function paintPaths(ctx) {
    const main = () => trace(ctx, PATH), branches = () => BRANCHES.forEach(b => trace(ctx, b));
    // The path is worn a little into the lawn: a soft dip, damp edges, the sandy middle, a paler trodden line.
    softLine(ctx, main, 'rgba(30,88,56,.42)', 27, 4); softLine(ctx, branches, 'rgba(30,88,56,.4)', 15, 3);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [tone, wMain, wBranch] of [['#a88d60', 22.5, 12], ['#d6bd8c', 19.5, 9.6], ['rgba(250,234,196,.55)', 10, 4.2]]) {
      ctx.strokeStyle = tone;
      ctx.beginPath(); main(); ctx.lineWidth = wMain; ctx.stroke();
      ctx.beginPath(); branches(); ctx.lineWidth = wBranch; ctx.stroke();
    }
    ctx.restore();
    // Gravel in three tones, scattered across the path's width.
    const r = rng(5531), grit = [[], [], []];
    for (const [pts, half] of [[along(PATH, 1.5), 8.5], ...BRANCHES.map(b => [along(b, 2), 4])]) {
      for (const [x, y, nx, ny] of pts) { const o = (r() - .5) * 2 * half; grit[Math.floor(r() * 3)].push([x + nx * o, y + ny * o, .45 + r() * .8, r() * TAU]); }
    }
    ['rgba(128,98,62,.5)', 'rgba(255,248,226,.7)', 'rgba(176,144,98,.55)'].forEach((tone, t) => {
      ctx.beginPath(); grit[t].forEach(([x, y, s, a]) => { ctx.moveTo(x + s, y); ctx.ellipse(x, y, s, s * .7, a, 0, TAU); });
      ctx.fillStyle = tone; ctx.fill();
    });
    // Flat stepping slabs set flush into the gravel, alternating a little from side to side: a flat face with a
    // thin sunlit edge and a thin shaded one, so they read as laid stone rather than domes.
    const slabs = along(PATH, 22).filter(([, y]) => y < H + 6 && y > -6).map(([x, y, nx, ny], i) => {
      const o = i % 2 ? 2.4 : -2.4, rr = rng(900 + i), a = Math.atan2(ny, nx) + (rr() - .5) * .5, c = Math.cos(a), s = Math.sin(a), pts = [];
      const rx = 7 + rr() * 1.6, ry = 5 + rr() * 1;
      for (let k = 0; k < 6; k++) { const t = (k + (rr() - .5) * .5) / 6 * TAU, px = Math.cos(t) * rx * (.86 + rr() * .2), py = Math.sin(t) * ry * (.86 + rr() * .2); pts.push([x + nx * o + px * c - py * s, y + ny * o + px * s + py * c]); }
      return pts;
    });
    const slab = (dx, dy) => { ctx.beginPath(); slabs.forEach(pts => pts.forEach(([x, y], k) => k ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy))); };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = 2.2;
    for (const [dx, dy, tone] of [[-.9, 1.5, 'rgba(84,62,34,.34)'], [.55, -.55, '#efe7d2'], [-.35, .45, '#9f9174'], [0, 0, '#d3c7aa']]) {
      slab(dx, dy); ctx.fillStyle = tone; ctx.strokeStyle = tone; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // Grass leaning in over the path's edges, so it sits in the lawn rather than on it.
    [[along(PATH, 2.4), 10.4], ...BRANCHES.map(b => [along(b, 2.6), 5.6])].forEach(([pts, half], i) => {
      fringe(ctx, pts, half, 61 + i); fringe(ctx, pts.map(([x, y, nx, ny]) => [x, y, -nx, -ny]), half, 83 + i);
    });
  }
  function paintBedGround(ctx, p, soft) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    // The raised bed's shadow falls on the lawn away from the sun.
    soft(ctx, () => { ctx.save(); ctx.translate(-2.4, 4.6); bedPath(ctx, p, 4.5); ctx.restore(); }, 'rgba(24,70,46,.45)', 7);
    // Damp dark earth under the edging, so the gaps between the cobbles read as soil.
    bedPath(ctx, p, 4.4); ctx.fillStyle = '#5a3f2c'; ctx.fill();
    // Rich soil, shaded under the far rim and warmer toward the near side.
    const soil = ctx.createLinearGradient(0, -p.ry, p.rx * .3, p.ry);
    soil.addColorStop(0, '#80593a'); soil.addColorStop(.4, '#9d754b'); soil.addColorStop(1, '#b58d5c');
    bedPath(ctx, p, 1); ctx.fillStyle = soil; ctx.fill();
    ctx.save(); bedPath(ctx, p, 1); ctx.clip();
    // Tilled rows: a shaded furrow with a lit ridge just above it.
    // Each row fades out toward its ends, so the rows look hoed by hand rather than ruled across the bed.
    const fade = (rgb, a, span) => {
      const g = ctx.createLinearGradient(-span, 0, span, 0);
      g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(.22, `rgba(${rgb},${a})`); g.addColorStop(.78, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      return g;
    };
    ctx.lineCap = 'round';
    for (let row = -1.5; row <= 1.5; row++) {
      const y = row * p.ry * .44 + 1.5, span = p.rx * (.92 - Math.abs(row) * .14), lean = row * 1.4;
      const furrow = () => { ctx.beginPath(); ctx.moveTo(-span, y + 2 - lean); ctx.bezierCurveTo(-span * .4, y - 2.5, span * .4, y + 3.5, span, y - 1 + lean); };
      furrow(); ctx.strokeStyle = fade('64,38,18', .3, span); ctx.lineWidth = 4.2; ctx.stroke();
      furrow(); ctx.strokeStyle = fade('56,32,14', .38, span); ctx.lineWidth = 1.7; ctx.stroke();
      ctx.save(); ctx.translate(.3, -2.5); furrow(); ctx.strokeStyle = fade('236,196,140', .3, span); ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
    }
    // Clods of earth, each lit on top.
    const r = rng(p.seed), clods = [];
    for (let i = 0; i < 44; i++) clods.push([(r() - .5) * p.rx * 1.9, (r() - .5) * p.ry * 1.9, .55 + r() * 1.25]);
    ctx.beginPath(); clods.forEach(([x, y, s]) => { ctx.moveTo(x + s * 1.2, y + .5); ctx.ellipse(x, y + .5, s * 1.2, s * .8, 0, 0, TAU); });
    ctx.fillStyle = 'rgba(62,38,20,.5)'; ctx.fill();
    ctx.beginPath(); clods.forEach(([x, y, s]) => { ctx.moveTo(x + .2 + s * .8, y - .35); ctx.ellipse(x + .2, y - .35, s * .8, s * .48, 0, 0, TAU); });
    ctx.fillStyle = 'rgba(226,182,124,.55)'; ctx.fill();
    // The rim's shadow on the soil along the far edge.
    softLine(ctx, () => { ctx.save(); ctx.translate(-.8, -3.4); bedPath(ctx, p, 1); ctx.restore(); }, 'rgba(38,20,8,.6)', 6, 4);
    ctx.restore();
    cobbles(ctx, along(bedCurves(p, 2.7), 5.2), p.seed, 3.1);
    fringe(ctx, along(bedCurves(p, 2.7), 2.4), 4.2, p.seed + 5, .55);
    ctx.restore();
  }
  function paintPond(ctx, soft) {
    ctx.save(); ctx.translate(355, 285); ctx.rotate(-.22);
    const shape = k => trace(ctx, scaled(POND, k), true);
    soft(ctx, () => { ctx.save(); ctx.translate(-2, 4); shape(1.18); ctx.restore(); }, 'rgba(22,68,48,.42)', 7);
    ctx.beginPath(); shape(1.12); ctx.fillStyle = '#4f5136'; ctx.fill();
    const water = ctx.createRadialGradient(-4, 6, 2, 0, 2, 50);
    water.addColorStop(0, '#125a6a'); water.addColorStop(.55, '#278a96'); water.addColorStop(1, '#5fbdb9');
    ctx.beginPath(); shape(1); ctx.fillStyle = water; ctx.fill();
    ctx.save(); ctx.beginPath(); shape(1); ctx.clip();
    // The sky in the water, the bank's shadow under the far edge, and a few slow rings.
    soft(ctx, () => ctx.ellipse(8, -9, 30, 6.5, -.12, 0, TAU), 'rgba(214,248,242,.42)', 6);
    softLine(ctx, () => { ctx.save(); ctx.translate(-.6, -3.4); shape(1); ctx.restore(); }, 'rgba(6,36,44,.6)', 7, 5);
    for (let i = 0; i < 3; i++) ellipse(ctx, 6 + i * 2, 6, 9 + i * 8, 2.4 + i * 2, 0, null, 'rgba(226,255,246,' + (.26 - i * .06) + ')', .7);
    ellipse(ctx, 22, -10, 5.6, 3.3, -.25, '#5aa86a'); ellipse(ctx, 21.4, -10.6, 4.4, 2.4, -.25, '#86c47c');
    ctx.restore();
    cobbles(ctx, along(scaled(POND, 1.1), 6), 3301, 3.6);
    fringe(ctx, along(scaled(POND, 1.1), 2.4), 4.6, 3307, .6);
    ctx.restore();
    // Reeds and cattails at the far end of the pond.
    const r = rng(4409), reeds = [];
    for (let i = 0; i < 9; i++) reeds.push([392 + r() * 18, 276 + r() * 6, 18 + r() * 14, (r() - .4) * 7]);
    soft(ctx, () => ctx.ellipse(398, 281, 15, 4, 0, 0, TAU), 'rgba(22,66,46,.38)', 4);
    for (const [tone, w] of [['#3f7d4c', 1.5], ['#7cbf6a', .7]]) {
      ctx.beginPath(); reeds.forEach(([x, y, h, lean]) => { ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * .2, y - h * .6, x + lean + (w < 1 ? .4 : 0), y - h); });
      ctx.strokeStyle = tone; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
    }
    reeds.filter((_, i) => i % 3 === 0).forEach(([x, y, h, lean]) => {
      ctx.save(); ctx.translate(x + lean * .9, y - h * .92); ctx.rotate(lean * .03);
      ellipse(ctx, 0, 0, 1.6, 4, 0, '#7a4a2a'); ellipse(ctx, .5, -.8, .7, 2.6, 0, 'rgba(214,150,96,.6)');
      ctx.restore();
    });
  }
  // Little clumps of wildflowers on open grass.
  function paintTufts(ctx, soft) {
    for (const [x, y, petal] of [[24, 228, '#fff1a2'], [30, 263, '#ffffff'], [387, 46, '#f9c8da'], [396, 240, '#fff1a2'], [120, 304, '#ffffff'], [312, 236, '#f9c8da'], [150, 96, '#ffffff']]) {
      soft(ctx, () => ctx.ellipse(x + 2, y + 1.5, 8, 2.6, 0, 0, TAU), 'rgba(26,84,52,.3)', 3);
      for (let i = 0; i < 5; i++) leaf(ctx, x - 2 + i * 1.8, y + 1, 6 + (i % 3) * 1.6, 2.2, (i - 2) * .42, i % 2 ? '#4e9a5e' : '#79b96c');
      for (const [dx, dy] of [[-1.5, -6], [3.5, -8], [7, -4.5]]) {
        for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; ellipse(ctx, x + dx + Math.cos(a) * 1.25, y + dy + Math.sin(a) * 1.25, 1.1, .8, a, petal); }
        ellipse(ctx, x + dx, y + dy, .7, .7, 0, '#f2b33f');
      }
    }
  }
  // Tree canopies from beyond the edges, and low shrubs, each casting a soft shadow down and to the left.
  function paintCanopies(ctx, kit, soft) {
    const leafy = { dark: '#2a6046', mid: '#4b9358', lit: '#a3d27a', glint: '#dcf2a4' };
    const shrub = { dark: '#2f6a4a', mid: '#58a061', lit: '#b2dc84', glint: '#e4f6b0' };
    const groups = [
      [leafy, [[-14, -10, 42], [36, -18, 28], [-22, 42, 26]]],
      [leafy, [[430, -14, 40], [392, -24, 26], [438, 34, 22]]],
      [shrub, [[-12, 172, 24]]], [shrub, [[436, 238, 26]]],
      [shrub, [[-8, 324, 30], [26, 346, 18]]], [shrub, [[432, 330, 24]]]
    ];
    for (const [pal, parts] of groups) {
      soft(ctx, () => parts.forEach(([x, y, s]) => { ctx.moveTo(x - 9 + s * 1.05, y + 13); ctx.arc(x - 9, y + 13, s * 1.05, 0, TAU); }), 'rgba(18,62,48,.36)', 14);
      parts.forEach(([x, y, s], i) => {
        if (kit) kit.clump(ctx, x, y, s, pal, .62, -.78, Math.round(x * 7 + y * 3) + i);
        else ellipse(ctx, x, y, s, s, 0, pal.mid);
      });
    }
    // Blossom on the low shrubs, on their sunny side.
    const r = rng(2207);
    for (const [x, y, s, petal] of [[-12, 172, 24, '#f6c1d4'], [-8, 324, 30, '#fff4d8'], [436, 238, 26, '#f6c1d4'], [432, 330, 24, '#fff4d8']]) {
      for (let i = 0; i < 7; i++) {
        const a = -1.3 + r() * 1.9, d = s * (.35 + r() * .5), fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d;
        ellipse(ctx, fx - .4, fy + .6, 2.2, 1.7, 0, 'rgba(40,80,50,.3)');
        ellipse(ctx, fx, fy, 2.1, 1.8, 0, petal); ellipse(ctx, fx + .5, fy - .5, 1, .8, 0, 'rgba(255,255,255,.8)');
      }
    }
  }
  function paintBackground(ctx) {
    const kit = root.BloomScenery && root.BloomScenery.kit;
    const soft = kit ? kit.soft : (c, draw, color) => { c.beginPath(); draw(); c.fillStyle = color; c.fill(); };
    paintLawn(ctx, soft);
    paintPaths(ctx);
    PLOTS.forEach(p => paintBedGround(ctx, p, soft));
    paintPond(ctx, soft);
    paintTufts(ctx, soft);
    paintCanopies(ctx, kit, soft);
    // The grade: warm where the sun comes in, cooler in the far corner, a gentle vignette, then paper tooth.
    const grade = ctx.createLinearGradient(420, 0, 0, 330);
    grade.addColorStop(0, 'rgba(255,222,150,.5)'); grade.addColorStop(1, 'rgba(60,100,150,.42)');
    cover(ctx, grade, 'soft-light');
    const vignette = ctx.createRadialGradient(215, 160, 150, 210, 165, 290);
    vignette.addColorStop(0, 'rgba(30,60,50,0)'); vignette.addColorStop(1, 'rgba(30,60,50,.24)');
    cover(ctx, vignette, 'multiply');
    if (kit) kit.grain(ctx, .06);
  }
  function plants(p) {
    if (plantData.has(p.id)) return plantData.get(p.id);
    const random = rng(p.seed + 31), result = [];
    // Staggered, unequal rows follow each bed rather than a UI grid.
    const rows = [[-.46, [-.45,.04,.48]],[-.04,[-.67,-.25,.2,.65]],[.42,[-.47,.02,.48]]];
    rows.forEach(([yy, xs], row) => xs.forEach((xx, col) => {
      const x = xx * p.rx + (random() - .5) * 4, y = yy * p.ry + (random() - .5) * 3;
      let type = p.type;
      if (p.id === 'honey' && col === 0) type = 'coral';
      if (p.id === 'moon' && col === 1) type = 'gold';
      if (p.id === 'dawn' && (row + col) % 3 === 0) type = 'gold';
      result.push({ x, y, type, variant: (row + col) % 3, phase: random() * TAU, tall: 9 + random() * 7, row, col });
    }));
    plantData.set(p.id, result); return result;
  }
  function paintPlantFoliage(ctx, p, level, growth) {
    const all = plants(p);
    all.forEach((plant, index) => {
      ctx.save(); ctx.translate(plant.x, plant.y);
      ctx.scale(1, growth === undefined ? 1 : Math.max(.03, growth));
      const x = 0, y = 0;
      if (!level) {
        // A tiny paired seed and furrow is an invitation, not an empty card.
        ellipse(ctx, x, y + 2, 2.7, 1.1, -.25, 'rgba(103,116,65,.22)');
        ellipse(ctx, x -.8, y, .85, 1.3, -.5, '#eee0a0');
        if (index % 3 === 0) ellipse(ctx, x + 1.5, y + .2, .65, 1, .4, '#e9d08c');
        ctx.restore(); return;
      }
      const height = level === 1 ? 5.5 : plant.tall * (level === 2 ? .72 : 1);
      ellipse(ctx, x, y + 2, level === 1 ? 4 : 7.5, level === 1 ? 1.6 : 2.5, 0, 'rgba(45,111,67,.12)');
      ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.quadraticCurveTo(x - 1.5, y - height * .48, x + .3, y - height);
      ctx.strokeStyle = '#318b61'; ctx.lineWidth = level === 1 ? .85 : 1.15; ctx.stroke();
      leaf(ctx, x, y - height * .2, level === 1 ? 5 : 8.5, level === 1 ? 2.3 : 3.2, -.94, '#3ca67d', '#a8dea3');
      leaf(ctx, x, y - height * .34, level === 1 ? 5.4 : 9.7, level === 1 ? 2.5 : 3.7, .83, '#6cbd79', '#d4e9a2');
      if (level === 3) leaf(ctx, x + 1, y + .4, 10, 4.2, -1.75, '#5ab180', '#b9d99c');
      if (level === 1 && index % 3 === 0) leaf(ctx, x, y - 3, 5.8, 1.7, .05, '#b6d67e', '#e7edaa');
      ctx.restore();
    });
  }
  function drawFoliage(ctx, p, level, growth) {
    if (growth < 1) { paintPlantFoliage(ctx, p, level, growth); return; }
    const key = p.id + ':' + level;
    let entry = foliageCache.get(key);
    if (!entry) {
      const canvas = surface(360, 246);
      if (canvas) {
        const c = canvas.getContext('2d'); c.scale(2, 2); c.translate(90, 68);
        paintPlantFoliage(c, p, level); entry = canvas;
        if (foliageCache.size >= 24) foliageCache.delete(foliageCache.keys().next().value);
        foliageCache.set(key, entry);
      }
    }
    if (entry) ctx.drawImage(entry, -90, -68, 180, 123);
    else paintPlantFoliage(ctx, p, level);
  }
  function getLevel(state, p, supplied) {
    let value = state && state.levels && state.levels[p.id];
    if (value === undefined && Array.isArray(supplied)) {
      const record = supplied.find(item => item && item.id === p.id);
      value = record && record.level;
    }
    return clamp(Math.floor(Number(value) || 0), 0, 3);
  }
  function drawBed(ctx, p, level, time, motion, reveal) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    const progress = reveal === undefined ? 1 : clamp(reveal, 0, 1);
    const growth = 1 - Math.pow(1 - progress, 3);
    ctx.save(); ctx.globalAlpha *= growth;
    drawFoliage(ctx, p, level, growth);
    if (level > 1) {
      const art = root.BloomArt;
      plants(p).forEach((plant, i) => {
        const open = level === 3 || i % 2 === 0;
        const r = level === 3 ? (i % 3 === 0 ? 9.5 : 7.5) : (open ? 5.5 : 3.5);
        const height = plant.tall * (level === 2 ? .72 : 1);
        const sway = motion ? Math.sin(time * .85 + plant.phase) * (level === 3 ? 1.15 : .65) : 0;
        ctx.save(); ctx.translate(plant.x, plant.y); ctx.rotate(sway * .026);
        ctx.translate(.3 + sway * .3, -height * growth);
        const flowerScale = (.15 + growth * .85) * (1 + Math.sin(progress * Math.PI) * .09);
        ctx.scale(flowerScale, flowerScale);
        if (art && typeof art.drawFlower === 'function') art.drawFlower(ctx, 0, 0, r, plant.type, open ? 1 : 0, 0, plant.variant);
        else ellipse(ctx, 0, 0, r * .7, r * .7, 0, p.accent);
        ctx.restore();
      });
    }
    ctx.restore();
    // The copper planting stake is also a consistent focal point for selection.
    const mx = p.rx * .7, my = p.ry * .65;
    ctx.beginPath(); ctx.moveTo(mx, my + 3); ctx.lineTo(mx + .6, my - 5);
    ctx.strokeStyle = '#906c43'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.save(); ctx.translate(mx + .6, my - 6); ctx.rotate(.2);
    leaf(ctx, 0, 3, 8.7, 3.6, .25, '#e4b876', '#fff0c5'); ctx.restore();
    ctx.restore();
  }
  function selectedBed(ctx, p, time, motion) {
    const pulse = motion ? .5 + .5 * Math.sin(time * 2) : .5;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    bedPath(ctx, p, 6); ctx.strokeStyle = 'rgba(255,246,175,' + (.57 + pulse * .2) + ')'; ctx.lineWidth = 3.6; ctx.stroke();
    bedPath(ctx, p, 6); ctx.strokeStyle = '#b5874f'; ctx.lineWidth = 1.15; ctx.stroke();
    const mx = p.rx * .7 + .6, my = p.ry * .65 - 10;
    ellipse(ctx, mx, my, 5.4, 5.4, 0, '#ffe5a2', '#aa7951', .85);
    ctx.beginPath(); ctx.moveTo(mx - 2, my); ctx.lineTo(mx -.2, my + 1.7); ctx.lineTo(mx + 2.5, my - 2);
    ctx.strokeStyle = '#846133'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
  function slab(ctx, x, y, w, h, r, fill, stroke, lineWidth) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || .6; ctx.stroke(); }
  }
  const shade = 'rgba(28,106,77,.2)', ink = '#6b4a2b';
  function paintBench(ctx) {
    ellipse(ctx, 0, 1.5, 21, 4.2, 0, shade);
    slab(ctx, -15.5, -19, 2.6, 19, 1, '#7a5432');
    slab(ctx, 12.9, -19, 2.6, 19, 1, '#7a5432');
    for (const y of [-20, -14.6]) {
      slab(ctx, -18, y, 36, 3.8, 1.4, '#b97f48', ink, .55);
      ctx.beginPath(); ctx.moveTo(-16.5, y + 1); ctx.lineTo(16.5, y + 1); ctx.strokeStyle = 'rgba(255,229,178,.65)'; ctx.lineWidth = .7; ctx.stroke();
    }
    slab(ctx, -19.5, -8.6, 39, 5.2, 1.6, '#c48a50', ink, .6);
    slab(ctx, -19, -8.3, 38, 1.7, .8, '#e6b77c');
    slab(ctx, -16.8, -3.6, 2.8, 5.2, .8, ink);
    slab(ctx, 14, -3.6, 2.8, 5.2, .8, ink);
  }
  // Biscuit naps on the bench; a tap lifts her head and swishes the tail.
  function cat(ctx, time, motion) {
    const r = reaction('biscuit'), awake = r > 0;
    const lift = awake ? Math.min(1, r * 4, (1 - r) * 5) * 2.4 : 0;
    const breathe = motion && !awake ? Math.sin(time * 1.6) * .25 : 0;
    const swish = awake ? Math.sin(r * 18) * .55 : motion ? Math.sin(time * .8) * .08 : 0;
    ctx.save(); ctx.translate(7, 1); ctx.rotate(swish); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(5, 0, 7, -3, 5, -6.5);
    ctx.strokeStyle = '#a8622c'; ctx.lineWidth = 3.2; ctx.stroke(); ctx.strokeStyle = '#f0a35e'; ctx.lineWidth = 2.1; ctx.stroke();
    ctx.restore();
    ellipse(ctx, 1, -.5 - breathe, 8.6, 4.2 + breathe, 0, '#f0a35e', '#a8622c', .6);
    for (const sx of [-1, 2.5, 6]) {
      ctx.beginPath(); ctx.moveTo(sx, -4.4 - breathe); ctx.quadraticCurveTo(sx + .9, -2.6, sx + .2, -1.1);
      ctx.strokeStyle = '#d17c3a'; ctx.lineWidth = .8; ctx.stroke();
    }
    ellipse(ctx, -5.6, 3, 1.9, 1.1, 0, '#fbe3c4', '#a8622c', .45);
    ctx.save(); ctx.translate(-7, -3.2 - lift); ctx.rotate(awake ? -.12 : .08);
    for (const [a, b, c] of [[[-3.3, -1.6], [-3.4, -5.6], [-.7, -2.9]], [[.9, -2.9], [2.9, -5.7], [3.2, -1.5]]]) {
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath();
      ctx.fillStyle = '#f0a35e'; ctx.fill(); ctx.strokeStyle = '#a8622c'; ctx.lineWidth = .5; ctx.stroke();
    }
    ellipse(ctx, 0, 0, 3.9, 3.3, 0, '#f0a35e', '#a8622c', .6);
    ellipse(ctx, -.4, 1.3, 2, 1.3, 0, '#fbe3c4');
    ellipse(ctx, -.5, .6, .5, .38, 0, '#e47a7a');
    for (const ex of [-1.9, 1]) {
      if (awake) { ellipse(ctx, ex, -.6, .62, .8, 0, '#2b2b22'); ellipse(ctx, ex + .2, -.9, .2, .2, 0, '#fff'); }
      else { ctx.beginPath(); ctx.moveTo(ex - .8, -.6); ctx.quadraticCurveTo(ex, .1, ex + .8, -.6); ctx.strokeStyle = '#7a4520'; ctx.lineWidth = .5; ctx.stroke(); }
    }
    ctx.restore();
    if (!awake && motion) {
      const z = (time * .45) % 1;
      ctx.save(); ctx.globalAlpha *= Math.sin(z * Math.PI) * .7; ctx.fillStyle = '#2c4a3e';
      ctx.font = '600 5px Fredoka, system-ui, sans-serif'; ctx.fillText('z', -11 - z * 3, -8 - z * 7); ctx.restore();
    }
  }
  function bird(ctx, x, y, time, motion) {
    const r = reaction('pip');
    const hop = r ? Math.sin(r * Math.PI) * 12 : motion ? Math.max(0, Math.sin(time * 1.7)) ** 12 * 2.4 : 0;
    ctx.save(); ctx.translate(x, y - hop); birdBody(ctx, r); ctx.restore();
  }
  function birdBody(ctx, r) {
    ctx.beginPath(); ctx.moveTo(-2.6, -.4); ctx.lineTo(-6.2, -2); ctx.lineTo(-5.6, .7); ctx.closePath(); ctx.fillStyle = '#4f93c8'; ctx.fill();
    ellipse(ctx, 0, 0, 3.8, 2.9, -.15, '#6aaee0', '#3f7fb0', .45);
    ellipse(ctx, .9, 1, 2.3, 1.6, -.1, '#f6c48f');
    ellipse(ctx, 2.9, -1.9, 2.1, 2.1, 0, '#6aaee0', '#3f7fb0', .45);
    ellipse(ctx, 3.5, -2.2, .48, .48, 0, '#23333a');
    ctx.beginPath(); ctx.moveTo(4.8, -2); ctx.lineTo(6.3, -1.5); ctx.lineTo(4.7, -1.1); ctx.closePath(); ctx.fillStyle = '#f2b14e'; ctx.fill();
    // Wings beat while Pip flutters up after a tap.
    if (r) { const flap = Math.sin(r * 70); ellipse(ctx, -.8, -1.4 - flap * 1.6, 3.6, 1.3, -.45 - flap * .55, '#4f93c8', '#3f7fb0', .4); }
  }
  function paintBirdhouse(ctx, time, motion) {
    ellipse(ctx, 0, 1, 8.5, 2.6, 0, shade);
    slab(ctx, -1.7, -25, 3.4, 26, 1, '#8a6239', ink, .5);
    ctx.beginPath(); ctx.moveTo(-8, -24.5); ctx.lineTo(8, -24.5); ctx.lineTo(8, -36.5); ctx.lineTo(0, -43.5); ctx.lineTo(-8, -36.5); ctx.closePath();
    ctx.fillStyle = '#f3e3bd'; ctx.fill(); ctx.strokeStyle = '#9b7448'; ctx.lineWidth = .8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10.8, -35.4); ctx.lineTo(0, -46); ctx.lineTo(10.8, -35.4); ctx.lineTo(9.2, -33.8); ctx.lineTo(0, -42.6); ctx.lineTo(-9.2, -33.8); ctx.closePath();
    ctx.fillStyle = '#e0816a'; ctx.fill(); ctx.strokeStyle = '#a8513f'; ctx.lineWidth = .6; ctx.stroke();
    ellipse(ctx, 0, -31.5, 2.7, 2.9, 0, '#5a3b24');
    ellipse(ctx, 0, -26.6, 1, 1, 0, '#8a6239');
    bird(ctx, 5.4, -42.3, time, motion);
  }
  function lily(ctx, x, y, size, pink) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, .62);
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i * TAU / 8 + .2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(size * .42, -size * .5, 0, -size); ctx.quadraticCurveTo(-size * .42, -size * .5, 0, 0);
      ctx.fillStyle = i % 2 ? (pink ? '#f59ac0' : '#fbe6ef') : (pink ? '#ffc4dc' : '#ffffff'); ctx.fill();
      ctx.strokeStyle = pink ? '#d96d9b' : '#e2b6c8'; ctx.lineWidth = .35; ctx.stroke(); ctx.restore();
    }
    ellipse(ctx, 0, 0, size * .3, size * .3, 0, '#ffd36b'); ctx.restore();
  }
  function paintLilies(ctx, time, motion) {
    ctx.save(); ctx.rotate(-.22);
    for (const [x, y, rx, ry, a] of [[4, 12, 7, 3.7, .3], [31, 5, 5.6, 3, -.2], [-26, -7, 5.2, 2.8, .5], [-1, -14, 4.6, 2.5, .1]]) {
      ellipse(ctx, x, y, rx, ry, a, '#4ab684', '#168c7c', .6);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rx * .9, y - ry * .3); ctx.lineTo(x + rx * .9, y + ry * .2); ctx.closePath(); ctx.fillStyle = '#83d6cb'; ctx.fill();
    }
    lily(ctx, 4, 11, 5.4, true); lily(ctx, 31, 4.4, 4.4, false); lily(ctx, 19.5, -9.6, 4.2, true);
    // Hopper takes the big pad, blinks now and then, and jumps when tapped.
    const r = reaction('hopper'), jump = r ? Math.sin(r * Math.PI) * 10 : 0;
    ctx.save(); ctx.translate(-17, 3.6); ctx.rotate(.22);
    ellipse(ctx, 0, 1.2, 4.6 - jump * .15, 2.2 - jump * .07, 0, 'rgba(10,80,70,.2)');
    ctx.translate(0, -jump); if (r) ctx.scale(1 - jump * .012, 1 + jump * .025);
    frogBody(ctx, time, motion);
    ctx.restore(); ctx.restore();
  }
  function frogBody(ctx, time, motion) {
    ellipse(ctx, 0, 0, 4.4, 3.3, 0, '#5fbf5b', '#2f8a3a', .5);
    ellipse(ctx, 0, .9, 2.8, 1.7, 0, '#b9e68a');
    const blink = motion && time % 4.3 < .14;
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 2.2, -2.7, 1.55, 1.55, 0, '#6fcf6a', '#2f8a3a', .45);
      if (blink) { ctx.beginPath(); ctx.moveTo(side * 2.2 - 1, -2.7); ctx.lineTo(side * 2.2 + 1, -2.7); ctx.strokeStyle = '#2f5a2a'; ctx.lineWidth = .5; ctx.stroke(); }
      else ellipse(ctx, side * 2.2, -2.8, .62, .7, 0, '#1f2b22');
    }
    ctx.beginPath(); ctx.moveTo(-1.6, -.4); ctx.quadraticCurveTo(0, .6, 1.6, -.4); ctx.strokeStyle = '#2f6a32'; ctx.lineWidth = .45; ctx.stroke();
  }
  function bee(ctx, x, y, angle) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ellipse(ctx, -.2, -1.4, 1.2, .85, -.3, 'rgba(255,255,255,.88)', 'rgba(120,140,150,.5)', .25);
    ellipse(ctx, 0, 0, 2, 1.35, 0, '#f7c943', '#6b4a1f', .35);
    for (const s of [-.5, .6]) { ctx.beginPath(); ctx.moveTo(s, -1.2); ctx.lineTo(s, 1.2); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = .55; ctx.stroke(); }
    ctx.restore();
  }
  function paintBeehive(ctx, time, motion) {
    ellipse(ctx, 0, 1, 13, 3.2, 0, shade);
    slab(ctx, -8, -3, 2.2, 4, .6, ink); slab(ctx, 5.8, -3, 2.2, 4, .6, ink);
    slab(ctx, -11, -5.5, 22, 3.2, 1, '#9b7044', ink, .5);
    const dome = () => { ctx.beginPath(); ctx.moveTo(-10.5, -5.2); ctx.bezierCurveTo(-11.5, -20, -6.4, -27, 0, -27); ctx.bezierCurveTo(6.4, -27, 11.5, -20, 10.5, -5.2); ctx.closePath(); };
    const straw = ctx.createLinearGradient(-8, -26, 8, -5);
    straw.addColorStop(0, '#f8d985'); straw.addColorStop(1, '#e1a64a');
    dome(); ctx.fillStyle = straw; ctx.fill(); ctx.strokeStyle = '#b9823a'; ctx.lineWidth = .7; ctx.stroke();
    ctx.save(); dome(); ctx.clip();
    for (let i = 1; i <= 4; i++) {
      const y = -5.2 - i * 4.6;
      ctx.beginPath(); ctx.moveTo(-12, y); ctx.quadraticCurveTo(0, y + 2.6, 12, y);
      ctx.strokeStyle = '#c38a3c'; ctx.lineWidth = .9; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, y - 1.1); ctx.quadraticCurveTo(0, y + 1.5, 12, y - 1.1);
      ctx.strokeStyle = 'rgba(255,240,190,.55)'; ctx.lineWidth = .5; ctx.stroke();
    }
    ctx.restore();
    ellipse(ctx, 0, -8, 2.7, 1.9, 0, '#5a3b24');
    const t = motion ? time : 1.3, buzz = reaction('buzz'), swirl = buzz ? Math.sin(buzz * Math.PI) : 0;
    for (let i = 0; i < 3; i++) {
      const a = t * (1.2 + i * .35) + i * 2.1 + buzz * (9 + i * 2), r = (13 + i * 3) * (1 + swirl * .7);
      bee(ctx, Math.cos(a) * r, -15 + Math.sin(a * 1.3) * r * .45, Math.cos(a) > 0 ? .25 : -.25);
    }
  }
  function lanternGlow(ctx, x, y, time, motion) {
    const flicker = motion ? .82 + Math.sin(time * 5.3 + x) * .1 + Math.sin(time * 8.1 + y) * .06 : .9;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 13);
    glow.addColorStop(0, `rgba(255,232,150,${.55 * flicker})`); glow.addColorStop(1, 'rgba(255,232,150,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill();
  }
  function paintLantern(ctx, time, motion, x) {
    ellipse(ctx, 0, 1, 4.5, 1.6, 0, shade);
    slab(ctx, -1.1, -15, 2.2, 15.6, .8, '#6b5a45');
    lanternGlow(ctx, 0, -18, time, motion);
    slab(ctx, -3.2, -21.5, 6.4, 7.4, 1.3, '#ffe7a0', '#5c4a35', .7);
    ctx.beginPath(); ctx.moveTo(0, -21.3); ctx.lineTo(0, -14.4); ctx.strokeStyle = 'rgba(92,74,53,.55)'; ctx.lineWidth = .45; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -21.3); ctx.lineTo(0, -24.6); ctx.lineTo(4, -21.3); ctx.closePath(); ctx.fillStyle = '#5c4a35'; ctx.fill();
    ellipse(ctx, 0, -25, .9, .9, 0, '#5c4a35');
  }
  function paintTree(ctx, time, motion) {
    ellipse(ctx, 5, 0, 31, 7, 0, shade);
    ctx.beginPath(); ctx.moveTo(-5, .5); ctx.bezierCurveTo(-3, -8, -4.5, -16, -3.4, -24); ctx.lineTo(3.2, -24);
    ctx.bezierCurveTo(3.6, -15, 3, -7, 5.4, .5); ctx.closePath();
    ctx.fillStyle = '#9a6a3f'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = .6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(.2, -2); ctx.quadraticCurveTo(-1.2, -11, .4, -21); ctx.strokeStyle = 'rgba(255,220,170,.4)'; ctx.lineWidth = .8; ctx.stroke();
    const clumps = [[-15, -30, 13], [14, -31, 13.5], [0, -42, 15], [-7, -25, 12], [8, -24, 12], [0, -32, 14]];
    for (const [x, y, r] of clumps) ellipse(ctx, x + 1.5, y + 2.5, r, r * .92, 0, '#2f8a63');
    for (const [x, y, r] of clumps) ellipse(ctx, x, y, r, r * .92, 0, '#52b37f');
    for (const [x, y, r] of clumps) ellipse(ctx, x - r * .25, y - r * .28, r * .55, r * .45, -.4, 'rgba(160,226,150,.55)');
    for (const [x, y] of [[-12, -34], [5, -45], [15, -27], [-3, -23], [-18, -23], [10, -38], [-6, -41]]) {
      ellipse(ctx, x, y, 2.2, 2.1, 0, '#ec6a5c', '#b8473d', .4); ellipse(ctx, x - .6, y - .7, .7, .6, 0, '#ffc2b5');
    }
    ctx.save(); ctx.translate(-19, 0); squirrel(ctx, time, motion); ctx.restore();
    // A rope swing hangs from under the leaves and drifts in the breeze.
    const sway = motion ? Math.sin(time * 1.5) * .13 : .05;
    ctx.save(); ctx.translate(22, -19); ctx.rotate(sway);
    ctx.strokeStyle = '#a07c52'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(-3.2, 0); ctx.lineTo(-3.2, 15); ctx.moveTo(3.2, 0); ctx.lineTo(3.2, 15); ctx.stroke();
    slab(ctx, -5, 14.4, 10, 2.3, .8, '#c48a50', ink, .5);
    ctx.restore();
  }
  // Nutmeg sits under the apple tree with an acorn, and hops with a flick of the tail when tapped.
  function squirrel(ctx, time, motion) {
    const r = reaction('nutmeg'), hop = r ? Math.abs(Math.sin(r * Math.PI * 2)) * 6 * (1 - r * .4) : 0;
    const flick = r ? Math.sin(r * 22) * .35 : motion ? Math.sin(time * 2.2) * .06 : 0;
    ellipse(ctx, 0, .6, 5.5 - hop * .25, 1.6, 0, shade);
    ctx.save(); ctx.translate(0, -hop); squirrelBody(ctx, flick); ctx.restore();
  }
  function squirrelBody(ctx, flick) {
    ctx.save(); ctx.translate(-2.5, -3); ctx.rotate(flick);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-7, -1, -7.5, -10, -2.5, -12.5); ctx.bezierCurveTo(1, -14, 2.2, -10, -.4, -9);
    ctx.bezierCurveTo(-3, -8, -2.6, -3, 1, -1.5); ctx.closePath();
    ctx.fillStyle = '#d48b52'; ctx.fill(); ctx.strokeStyle = '#8f5228'; ctx.lineWidth = .5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1.5, -1.8); ctx.bezierCurveTo(-5.4, -3, -5.6, -9, -2.4, -11); ctx.strokeStyle = 'rgba(255,225,180,.55)'; ctx.lineWidth = .8; ctx.stroke();
    ctx.restore();
    ellipse(ctx, 1, -4.3, 3.4, 4.4, -.12, '#c47a45', '#8f5228', .5);
    ellipse(ctx, 1.9, -3.4, 1.8, 2.8, -.1, '#f3d7b0');
    ellipse(ctx, 1, -12.2, .8, 1.3, -.3, '#c47a45', '#8f5228', .4);
    ellipse(ctx, 2.2, -9.6, 2.9, 2.6, 0, '#c47a45', '#8f5228', .5);
    ellipse(ctx, 3.4, -10, .52, .62, 0, '#2b2b22'); ellipse(ctx, 3.55, -10.25, .18, .18, 0, '#fff');
    ellipse(ctx, 5, -9.2, .45, .38, 0, '#5a3b24');
    ellipse(ctx, 4.1, -5.2, 1.25, 1.45, 0, '#b07a3c', '#7a5432', .35); ellipse(ctx, 4.1, -6.4, 1.45, .7, 0, '#7a5432');
    ellipse(ctx, 0, -.2, 1.6, .8, 0, '#a8622c'); ellipse(ctx, 2.8, -.2, 1.6, .8, 0, '#a8622c');
  }
  // Glimmer drifts by the first lantern and loops the loop when tapped.
  function firefly(ctx, time, motion) {
    const r = reaction('glimmer'), t = motion ? time : 0, home = friendById.glimmer;
    let x = home.x + Math.sin(t * .9) * 6, y = home.y + Math.sin(t * 1.8) * 3;
    if (r) { const a = r * TAU; x += Math.sin(a) * 13; y -= (1 - Math.cos(a)) * 8; }
    const glow = .5 + (motion ? Math.sin(time * 3) * .18 : 0) + (r ? Math.sin(r * Math.PI) * .5 : 0);
    const reach = 11 + glow * 6, halo = ctx.createRadialGradient(x + 2.2, y + 1, 0, x + 2.2, y + 1, reach);
    halo.addColorStop(0, `rgba(255,246,120,${Math.min(.95, glow + .2)})`); halo.addColorStop(.45, `rgba(240,255,150,${Math.min(.5, glow * .5)})`); halo.addColorStop(1, 'rgba(240,255,150,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x + 2.2, y + 1, reach, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x, y); fireflyBody(ctx); ctx.restore();
  }
  function fireflyBody(ctx) {
    ctx.save(); ctx.scale(2, 2);
    ellipse(ctx, -.3, -1.3, 1.4, .75, -.35, 'rgba(255,255,255,.85)', 'rgba(120,140,150,.5)', .2);
    ellipse(ctx, 1.4, .6, 1.4, 1.1, .2, '#f4ff9c', '#c8d65a', .25);
    ellipse(ctx, -.2, 0, 1.7, 1.15, .2, '#4a4636');
    ellipse(ctx, -1.8, -.3, .9, .9, 0, '#4a4636'); ellipse(ctx, -2, -.5, .25, .25, 0, '#fff');
    ctx.restore();
  }
  function paintDecor(ctx, d, time, motion) {
    if (d.id === 'lanterns') {
      d.posts.forEach(([x, y]) => { ctx.save(); ctx.translate(x, y); paintLantern(ctx, time, motion, x); ctx.restore(); });
      firefly(ctx, time, motion);
      return;
    }
    ctx.save(); ctx.translate(d.x, d.y);
    if (d.id === 'bench') { paintBench(ctx); ctx.save(); ctx.translate(-3, -12); cat(ctx, time, motion); ctx.restore(); }
    else if (d.id === 'birdhouse') paintBirdhouse(ctx, time, motion);
    else if (d.id === 'lilies') paintLilies(ctx, time, motion);
    else if (d.id === 'beehive') paintBeehive(ctx, time, motion);
    else if (d.id === 'tree') paintTree(ctx, time, motion);
    ctx.restore();
  }
  // Pops a new decoration up from the grass; for lanterns each post lights in turn.
  function drawDecorPiece(ctx, d, time, motion, reveal) {
    if (reveal === undefined || reveal >= 1) { paintDecor(ctx, d, time, motion); return; }
    const pop = t => { t = clamp(t, 0, 1); const s = 1.9; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
    const parts = d.id === 'lanterns' ? d.posts.map((p, i) => [p, i * .14]) : [[[d.x, d.y], 0]];
    for (const [[x, y], delay] of parts) {
      const t = clamp((reveal - delay) / (1 - delay * 3), 0, 1), scale = Math.max(.001, pop(t));
      ctx.save(); ctx.globalAlpha *= Math.min(1, t * 2.5);
      ctx.translate(x, y); ctx.scale(scale, scale); ctx.translate(-x, -y);
      if (d.id === 'lanterns') { ctx.translate(x, y); paintLantern(ctx, time, motion, x); }
      else paintDecor(ctx, d, time, motion);
      ctx.restore();
    }
  }
  function builtDecor(state) {
    const list = state && Array.isArray(state.decor) ? state.decor : [];
    return DECOR.filter(d => list.includes(d.id));
  }
  // A card picture: the decoration on a round patch of grass (or water, for the lilies).
  function drawDecorIcon(ctx, id, size) {
    const d = decorById[id]; if (!ctx || !d) return;
    const [cx, cy, box] = d.icon, scale = size / box;
    ctx.save(); ctx.scale(scale, scale); ctx.translate(box / 2 - cx, box / 2 - cy);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, box / 2, 0, TAU); ctx.clip();
    if (background) ctx.drawImage(background, 0, 0, W, H); else paintBackground(ctx);
    pokes = {}; paintDecor(ctx, d, 1.3, false);
    ctx.restore(); ctx.restore();
  }
  // A friend's portrait on a round patch of grass (water for Hopper). Not yet met: a silhouette.
  const friendBodies = { biscuit: ctx => cat(ctx, 1.3, false), pip: ctx => birdBody(ctx, 0), hopper: ctx => frogBody(ctx, 1, false),
    buzz: ctx => bee(ctx, 0, 0, 0), glimmer: fireflyBody, nutmeg: ctx => squirrelBody(ctx, 0) };
  function drawFriendIcon(ctx, id, size, met) {
    const f = friendById[id]; if (!ctx || !f) return;
    pokes = {};
    ctx.save();
    const back = ctx.createLinearGradient(0, 0, 0, size);
    if (id === 'hopper') { back.addColorStop(0, '#8ad9d4'); back.addColorStop(1, '#3fa8b0'); }
    else { back.addColorStop(0, '#dff5cf'); back.addColorStop(1, '#a4dcb2'); }
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, TAU); ctx.fillStyle = back; ctx.fill();
    const [cx, cy, box] = f.icon, scale = size * .78 / box;
    const paint = target => { target.save(); target.translate(size / 2, size / 2); target.scale(scale, scale); target.translate(-cx, -cy); friendBodies[id](target); target.restore(); };
    if (met) paint(ctx);
    else {
      const layer = surface(Math.ceil(size), Math.ceil(size));
      if (layer) {
        const c = layer.getContext('2d'); paint(c);
        c.globalCompositeOperation = 'source-in'; c.fillStyle = 'rgba(44,74,62,.42)'; c.fillRect(0, 0, size, size);
        ctx.drawImage(layer, 0, 0);
      }
    }
    ctx.restore();
  }
  function butterfly(ctx, x, y, scale, phase, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(phase * .6) * .23); ctx.scale(scale, scale);
    const span = .54 + .46 * Math.abs(Math.sin(phase * 3.2));
    ellipse(ctx, -2.3 * span, -1.4, 3.3 * span, 3.8, -.5, color, 'rgba(247,252,220,.7)', .45);
    ellipse(ctx, 2.3 * span, -1.4, 3.3 * span, 3.8, .5, color, 'rgba(247,252,220,.7)', .45);
    ellipse(ctx, -1.8 * span, 2, 2.3 * span, 2.2, .5, '#ffdf9e');
    ellipse(ctx, 1.8 * span, 2, 2.3 * span, 2.2, -.5, '#ffdf9e');
    ellipse(ctx, 0, .1, .58, 3.2, 0, '#708451'); ctx.restore();
  }
  function draw(ctx, options) {
    if (!ctx) return;
    options = options || {};
    const width = Math.max(1, Number(options.width) || W), height = Math.max(1, Number(options.height) || H);
    const motion = options.motion === true, time = motion ? Math.max(0, Number(options.time) || 0) : 0;
    ctx.save(); ctx.scale(width / W, height / H);
    if (!background) {
      background = surface(W * 3, H * 3);
      if (background) { const c = background.getContext('2d'); c.scale(3, 3); paintBackground(c); }
    }
    if (background) ctx.drawImage(background, 0, 0, W, H); else paintBackground(ctx);
    const levels = PLOTS.map(p => getLevel(options.state, p, options.plots));
    const reveal = motion && options.growth;
    PLOTS.forEach((p, index) => {
      if (reveal && reveal.plotId === p.id && Number.isFinite(reveal.progress) && reveal.progress < 1) {
        const progress = clamp(reveal.progress, 0, 1);
        const oldLevel = clamp(Math.floor(Number(reveal.fromStage) || 0), 0, 3);
        ctx.save(); ctx.globalAlpha *= Math.pow(1 - progress, 2);
        drawBed(ctx, p, oldLevel, time, motion); ctx.restore();
        drawBed(ctx, p, levels[index], time, motion, progress);
      } else drawBed(ctx, p, levels[index], time, motion);
    });
    pokes = motion && options.pokes && typeof options.pokes === 'object' ? options.pokes : {};
    const built = builtDecor(options.state);
    built.forEach(d => drawDecorPiece(ctx, d, time, motion, reveal && reveal.decorId === d.id && Number.isFinite(reveal.progress) ? reveal.progress : undefined));
    const selected = byId[options.selectedId];
    if (selected) selectedBed(ctx, selected, time, motion);
    // A few tiny moving accents make the whole place feel alive without busy UI.
    if (motion) {
      for (let i = 0; i < 3; i++) {
        const a = time * .13 + i * 2.1;
        const x = 73 + i * 134 + Math.sin(a) * 12, y = 107 + Math.sin(a * .8 + i) * 24;
        butterfly(ctx, x, y, .7 + i * .08, time * 1.6 + i, i === 1 ? '#e9b2ef' : '#ffcc88');
      }
      ctx.save(); ctx.globalAlpha = .25;
      const progress = (time * .13) % 1;
      ellipse(ctx, 356, 289, 6 + progress * 23, 1.4 + progress * 6, -.22, null, '#f5ffe3', .9);
      ctx.restore();
    }
    ctx.restore();
  }
  function hitTest(x, y, width, height) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const w = Number(width) || W, h = Number(height) || H;
    if (w <= 0 || h <= 0 || x < 0 || y < 0 || x > w || y > h) return null;
    const xx = x * W / w, yy = y * H / h;
    let closest = null, distance = Infinity;
    PLOTS.forEach(p => {
      const dx = xx - p.x, dy = yy - p.y, c = Math.cos(p.angle), s = Math.sin(p.angle);
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      const d = Math.pow(lx / (p.rx + 9), 2) + Math.pow(ly / (p.ry + 10), 2);
      if (d <= 1 && d < distance) { closest = p.id; distance = d; }
    });
    return closest;
  }
  function ensureBackground() {
    if (!background) {
      background = surface(W * 3, H * 3);
      if (background) { const c = background.getContext('2d'); c.scale(3, 3); paintBackground(c); }
    }
  }
  root.BloomMeadow = Object.freeze({ draw, hitTest, drawDecorIcon: (ctx, id, size) => { ensureBackground(); drawDecorIcon(ctx, id, size); }, drawFriendIcon,
    plots: PLOTS, decor: DECOR, friends: FRIENDS, reactSeconds: REACT, width: W, height: H });
})(typeof window !== 'undefined' ? window : globalThis);
