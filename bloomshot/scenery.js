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
  function paintMeadow(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 320);
    sky.addColorStop(0, '#7fc6ee'); sky.addColorStop(.75, '#c4ebfa'); sky.addColorStop(1, '#e2f6fb');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 420, 560);
    // Sun, upper right: flat disc, two halos and short rounded rays.
    dot(ctx, 344, 78, 66, 'rgba(255,250,222,.30)'); dot(ctx, 344, 78, 48, 'rgba(255,246,204,.50)');
    ctx.save(); ctx.translate(344, 78);
    for (let i = 0; i < 10; i++) { ctx.rotate(TAU / 10); ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(0, -42); ctx.strokeStyle = '#f7d77a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke(); }
    ctx.restore();
    dot(ctx, 344, 78, 29, '#fff0a6'); ctx.beginPath(); ctx.arc(344, 78, 29, 0, TAU); ctx.strokeStyle = '#efc85f'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.beginPath(); ctx.arc(344, 78, 21, 4.4, 5.6); ctx.strokeStyle = '#fffbe2'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.stroke();
    // A far cloud bank and distant blue hills give the sky some depth.
    for (const [x, w, s] of [[60, 120, 21], [200, 150, 22], [350, 130, 23]]) cloud(ctx, x, 262, w, s, '#eef9fd', '#e1f2fa', '#c7e4f2');
    const hillsFar = [[-20, 268], [40, 246], [96, 258], [150, 238], [214, 252], [270, 236], [330, 250], [390, 240], [450, 256]];
    band(ctx, hillsFar, 560, '#b7d7ea', '#a3c7de', 1.2);
    cloud(ctx, 262, 128, 110, 3); cloud(ctx, 150, 196, 70, 8); cloud(ctx, 390, 176, 56, 13);
    for (const [x, y, s] of [[214, 82, 4.2], [226, 90, 3.2], [118, 132, 3.4]]) {
      ctx.beginPath(); ctx.moveTo(x - s, y - s * .4); ctx.quadraticCurveTo(x - s * .4, y - s, x, y); ctx.quadraticCurveTo(x + s * .4, y - s, x + s, y - s * .4);
      ctx.strokeStyle = '#4f7a96'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
    }
    // Rolling hills: separate mounds, each with a lit crest and a shaded flank.
    const back = ridge(296, 8, 2, 64);
    band(ctx, back, 560, '#aedcc4', '#93ccb1', 1.3);
    windmill(ctx, 330, 292, 21);
    for (const [x, s] of [[120, 8], [138, 6.5], [252, 7.5], [392, 9]]) lollipopTree(ctx, x, 296 + Math.sin(x * .013 + 2) * 8, s, '#9fd5bd', '#7fbea5', '#94ae9a');
    const mounds = [
      [[-30, 360], [30, 322], [110, 318], [190, 346], [240, 380], [-30, 400]],
      [[150, 384], [230, 330], [320, 318], [400, 332], [450, 360], [450, 410], [150, 410]]
    ];
    for (const [i, m] of mounds.entries()) {
      const pts = m;
      shape(ctx, pts, i ? '#93cf96' : '#9dd59e', null); cel(ctx, pts, i ? '#83c389' : '#8ccb90', -18, 14); shape(ctx, pts, null, '#6fb57b', 1.5);
      stroke(ctx, pts.slice(1, 4).map(p => [p[0], p[1] + 3]), 'rgba(255,255,230,.55)', 1.6);
    }
    // Little bushes dotted along the crests.
    for (const [x, y, k] of [[78, 330, 1], [104, 326, .8], [262, 334, .9], [300, 326, 1.1], [336, 328, .8], [160, 344, .7]]) {
      for (const [dx, dy, rr] of [[-5, 1, 5], [5, 1, 5], [0, -3, 6]]) { dot(ctx, x + dx * k, y + dy * k, (rr + 1.2) * k, '#5ea56b'); }
      for (const [dx, dy, rr] of [[-5, 1, 5], [5, 1, 5], [0, -3, 6]]) { dot(ctx, x + dx * k, y + dy * k, rr * k, '#7cc285'); }
      ctx.beginPath(); ctx.arc(x - 1.5 * k, y - 4.5 * k, 3 * k, 3.4, 4.6); ctx.strokeStyle = 'rgba(255,255,220,.6)'; ctx.lineWidth = 1.1; ctx.stroke();
    }
    // A sandy path winds down out of the hills toward the burrow.
    const lane = [[214, 336], [222, 362], [204, 392], [226, 426], [212, 452]], edgeL = [], edgeR = [];
    lane.forEach(([x, y], i) => { const w = 3 + i * 6; edgeL.push([x - w, y]); edgeR.push([x + w, y]); });
    shape(ctx, edgeL.concat(edgeR.reverse()), '#ecd9a8', '#c9ad78', 1.4);
    stroke(ctx, lane.slice(1).map(([x, y], i) => [x - 2 - i, y + 2]), 'rgba(255,250,230,.6)', 1.2);
    const near = ridge(404, 5, 9, 80);
    band(ctx, near, 560, '#88cb82', '#6db06f', 1.6);
    const r = rng(77);
    for (let i = 0; i < 34; i++) {
      const x = 30 + r() * 360, y = 412 + r() * 32;
      if (Math.abs(x - 210) < 70) continue;
      if (i % 3) grassTuft(ctx, x, y, 5 + r() * 4, '#79bf78', '#5a9e5e', i);
      else daisy(ctx, x, y - 2, 2.8, ['#ffffff', '#ffd6e4', '#fff1a8'][i % 3], '#ffc93f', '#c9d9c9');
    }
    // The ground: a grassy lip at the danger line, then a cut-away of the soil we are about to dig into.
    band(ctx, ridge(452, 2.4, 11, 26), 560, '#9a6a42', null);
    band(ctx, ridge(500, 5, 12, 50), 560, '#86593a', '#6f4529', 1.2);
    band(ctx, ridge(536, 4, 14, 60), 560, '#734b30', '#5f3b24', 1.1);
    const rs = rng(31);
    for (let i = 0; i < 70; i++) { const x = 16 + rs() * 388, y = 462 + rs() * 92; dot(ctx, x, y, .7 + rs() * 1, i % 2 ? 'rgba(60,34,18,.35)' : 'rgba(230,190,140,.35)'); }
    for (const [x, y, w, h, s] of [[44, 486, 9, 6, 1], [70, 520, 6, 4.5, 2], [352, 498, 8, 5.5, 3], [384, 530, 10, 6, 4], [150, 534, 6, 4, 5], [272, 540, 7, 4.5, 6]]) pebble(ctx, x, y, w, h, s, '#e2cfb2', '#c4ad8d', '#7e5d3f');
    // The burrow under the launcher: the way down.
    shape(ctx, blob(210, 500, 40, 30, 5, .06, 12), '#5a3a24', '#3e2616', 1.8);
    shape(ctx, blob(210, 504, 30, 21, 6, .05, 12), '#47301e', null);
    for (let x = 30; x < 400; x += 23) {
      if (Math.abs(x - 210) < 50) continue;
      const len = 8 + (x * 7) % 13;
      stroke(ctx, [[x, 457], [x + 2, 457 + len * .5], [x - 1, 457 + len]], '#d9bb8e', 1);
    }
    carrot(ctx, 112, 454, .82);
    worm(ctx, 318, 522, .9, false);
    for (let x = 18; x < 410; x += 14) grassTuft(ctx, x, 456, 9 + (x * 13) % 6, '#6cc06c', '#3f8f4c', x, ((x * 3) % 5 - 2) * .1);
    // The apple tree that frames the left side, and a rabbit watching from the right.
    const trunk = [[6, 458], [20, 432], [26, 380], [22, 300], [26, 220], [16, 150], [40, 120], [62, 136], [50, 180], [52, 260], [48, 340], [54, 420], [74, 458]];
    shape(ctx, trunk, '#b98352', null); cel(ctx, trunk, '#9a6a40', -9, 0); shape(ctx, trunk, null, '#6e4322', 1.9);
    for (const y of [200, 262, 320, 392]) stroke(ctx, [[36, y], [42, y + 6], [40, y + 18]], 'rgba(110,67,34,.55)', 1.3);
    shape(ctx, [[46, 214], [70, 196], [98, 186], [104, 194], [76, 206], [52, 226]], '#b98352', '#6e4322', 1.6);
    ctx.beginPath(); ctx.ellipse(38, 290, 5, 7, 0, 0, TAU); ctx.fillStyle = '#5a3a24'; ctx.fill(); ctx.strokeStyle = '#6e4322'; ctx.lineWidth = 1.2; ctx.stroke();
    canopy(ctx, [[18, 40, 54, 42], [88, 20, 48, 34], [52, 104, 50, 36], [120, 72, 34, 26], [-6, 132, 36, 30], [112, 190, 22, 16]], '#6cc073', '#55a861', '#2f6b46', 9);
    for (const [x, y] of [[30, 58], [74, 40], [56, 120], [120, 80], [100, 26], [10, 136]]) { dot(ctx, x, y, 4.4, '#ef6a5b'); ctx.beginPath(); ctx.arc(x, y, 4.4, 0, TAU); ctx.strokeStyle = '#a63b33'; ctx.lineWidth = 1; ctx.stroke(); dot(ctx, x - 1.4, y - 1.6, 1.2, '#ffd0c8'); }
    for (const [x, h, s] of [[386, 34, 1], [400, 26, 2], [372, 20, 3]]) grassTuft(ctx, x, 452, h, '#76c977', '#3f8f4c', s, -.3);
    bunny(ctx, 360, 446, .9);
    daisy(ctx, 394, 418, 5.5, '#ffffff', '#ffc93f', '#b7cbbd'); stroke(ctx, [[394, 424], [396, 440], [395, 452]], '#4c9a55', 1.4);
    frame(ctx, '#5aa9c9', '#ffffff');
  }

  // ---------- Level 2: Root Tunnels ----------
  function root2(ctx, pts, width, fill, line) {
    // A tapering root: a filled ribbon from thick to thin along the points.
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      const dx = q[0] - o[0], dy = q[1] - o[1], len = Math.hypot(dx, dy) || 1, w = width * (1 - i / pts.length * .85) / 2;
      left.push([p[0] - dy / len * w, p[1] + dx / len * w]); right.push([p[0] + dy / len * w, p[1] - dx / len * w]);
    }
    const outline = left.concat(right.reverse());
    shape(ctx, outline, fill, null); cel(ctx, outline, '#c9a26e', width * .2, 0); shape(ctx, outline, null, line, 1.6);
    stroke(ctx, pts.slice(0, -1).map((p, i) => [p[0] + (i % 2 ? 1 : -1) * width * .12, p[1]]), 'rgba(255,240,210,.45)', 1.1);
    return outline;
  }
  function ant(ctx, x, y, s, carrying) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    for (const lx of [-3, 0, 3]) { stroke(ctx, [[lx, 0], [lx - 1.5, 3.5]], '#2a1a12', .8); stroke(ctx, [[lx, 0], [lx + 1.5, 3.5]], '#2a1a12', .8); }
    dot(ctx, -4.5, 0, 2.6, '#3b2418'); dot(ctx, 0, -.3, 2, '#3b2418'); dot(ctx, 4, -1, 2.3, '#3b2418');
    stroke(ctx, [[5, -2.5], [7.5, -5.5]], '#2a1a12', .7);
    if (carrying) { ctx.beginPath(); ctx.ellipse(1, -5.5, 3.6, 2, -.3, 0, TAU); ctx.fillStyle = '#9ad46b'; ctx.fill(); ctx.strokeStyle = '#4c8a3a'; ctx.lineWidth = .7; ctx.stroke(); }
    ctx.restore();
  }
  function sprout(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    for (const [px, py] of [[-6, 6], [0, 9], [6, 5]]) stroke(ctx, [[0, 2], [px * .5, py * .6], [px, py + 4]], '#f0dcb2', 1);
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, -.2, 0, TAU); ctx.fillStyle = '#c98a4f'; ctx.fill(); ctx.strokeStyle = '#6e4322'; ctx.lineWidth = 1.2; ctx.stroke();
    stroke(ctx, [[-2, -1], [2, 1.5]], 'rgba(110,67,34,.5)', .9);
    stroke(ctx, [[1, -4], [3, -12], [1, -20]], '#5aa85f', 1.6);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(1 + side * 4, -21, 4.4, 2.4, side * .5, 0, TAU); ctx.fillStyle = '#7fcf73'; ctx.fill(); ctx.strokeStyle = '#3f8a48'; ctx.lineWidth = .9; ctx.stroke(); }
    ctx.restore();
  }
  function tunnel(ctx, pts, seed) {
    shape(ctx, pts, '#6b4126', '#4b2a16', 1.8);
    cel(ctx, pts, '#55311b', 4, 6);
    const r = rng(seed);
    for (let i = 0; i < 6; i++) dot(ctx, pts[0][0] + 10 + r() * 30, pts[2][1] + r() * 6, .8, 'rgba(255,220,170,.25)');
  }
  function mole(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const body = blob(0, 0, 24, 15, 5, .05, 10);
    shape(ctx, body, '#6e5a55', '#3d2e2b', 1.6); cel(ctx, body, '#5c4a46', 4, 4);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 15, 13, 7, 3.5, side * .3, 0, TAU); ctx.fillStyle = '#f2a9a8'; ctx.fill(); ctx.strokeStyle = '#a55e60'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(-22, -2, 5, 4, 0, 0, TAU); ctx.fillStyle = '#f59aa5'; ctx.fill(); ctx.strokeStyle = '#a55e60'; ctx.lineWidth = 1.1; ctx.stroke();
    for (const ex of [-12, -4]) { ctx.beginPath(); ctx.arc(ex, -5, 2.4, .3, Math.PI - .3); ctx.strokeStyle = '#231816'; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.font = '600 9px Fredoka, sans-serif'; ctx.fillStyle = 'rgba(255,240,220,.85)'; ctx.fillText('z', 6, -20); ctx.font = '600 7px Fredoka, sans-serif'; ctx.fillText('z', 13, -27);
    ctx.restore();
  }
  function marble(ctx, x, y, r) {
    dot(ctx, x, y, r, '#5fb7e8'); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = '#2b6f9a'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r * .6, y + r * .2); ctx.quadraticCurveTo(x, y - r * .5, x + r * .6, y + r * .1); ctx.strokeStyle = '#f2f7ff'; ctx.lineWidth = 1.4; ctx.stroke();
    dot(ctx, x - r * .35, y - r * .4, r * .22, '#ffffff');
  }
  function shell(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); for (let a = 0; a < 3.2 * TAU; a += .2) { const rr = 1.4 * Math.exp(a * .16); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.strokeStyle = '#8a6a4c'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 10.6, 0, TAU); ctx.strokeStyle = '#8a6a4c'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
  function paintRoots(ctx) {
    ctx.fillStyle = '#d4a06a'; ctx.fillRect(0, 0, 420, 560);
    const layers = [[70, '#cf9a63', '#bd8752'], [150, '#c99460', '#b47e4b'], [238, '#c28c58', '#ab7645'], [330, '#ba8452', '#a26e40'], [420, '#ad784a', '#93623a'], [470, '#9a6942', '#7f5433']];
    layers.forEach(([y, fill, line], i) => band(ctx, ridge(y, 7 + i, 20 + i, 54), 560, fill, line, 1.3));
    // Fine grit and small stones in every layer, thinner in the middle lanes.
    const r = rng(404);
    for (let i = 0; i < 260; i++) {
      const x = 16 + r() * 388, y = 30 + r() * 520, mid = Math.abs(x - 210) < 120 && y < 440;
      if (mid && r() < .65) continue;
      dot(ctx, x, y, .6 + r() * 1.1, r() < .5 ? 'rgba(90,52,24,.32)' : 'rgba(255,226,180,.35)');
    }
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : 0, x = side ? 360 + r() * 40 : 18 + r() * 42, y = 60 + r() * 380;
      pebble(ctx, x, y, 3 + r() * 4, 2.4 + r() * 2.6, 900 + i, '#d8c6ad', '#b9a386', '#7a5a3c');
    }
    // The meadow overhead: grass seen from below, dark topsoil and hair roots.
    band(ctx, ridge(36, 3, 41, 30), 0, '#5f3a20', null);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 420, 40); ctx.clip();
    ctx.fillStyle = '#5f3a20'; ctx.fillRect(0, 0, 420, 40);
    ctx.restore();
    band(ctx, ridge(36, 3, 41, 30), 46, '#7a4c2b', '#4b2a16', 1.6);
    ctx.fillStyle = '#6cc06c'; ctx.fillRect(0, 0, 420, 18);
    for (let x = 14; x < 420; x += 12) { ctx.beginPath(); ctx.moveTo(x - 6, 18); ctx.lineTo(x, 26 + (x * 7) % 5); ctx.lineTo(x + 6, 18); ctx.fillStyle = '#6cc06c'; ctx.fill(); }
    ctx.beginPath(); for (let x = 14; x < 420; x += 12) { ctx.moveTo(x - 6, 18); ctx.lineTo(x, 26 + (x * 7) % 5); ctx.lineTo(x + 6, 18); } ctx.strokeStyle = '#3f8f4c'; ctx.lineWidth = 1.1; ctx.stroke();
    for (let x = 24; x < 400; x += 17) stroke(ctx, [[x, 38], [x + 3, 46 + (x % 9)], [x - 1, 54 + (x * 3) % 14]], 'rgba(240,215,170,.75)', .9);
    // Two big roots come down the sides, branching into the soil; a short one hangs mid-board.
    const leftRoot = [[44, 30], [52, 90], [40, 160], [58, 236], [44, 310], [60, 380], [50, 430]];
    root2(ctx, leftRoot, 30, '#e6c492', '#7a4f2a');
    root2(ctx, [[54, 150], [80, 178], [92, 214]], 7, '#e6c492', '#7a4f2a');
    root2(ctx, [[50, 300], [26, 330], [22, 362]], 6, '#e6c492', '#7a4f2a');
    const rightRoot = [[376, 30], [366, 110], [382, 190], [364, 270], [380, 350], [370, 420]];
    root2(ctx, rightRoot, 28, '#e6c492', '#7a4f2a');
    root2(ctx, [[370, 230], [336, 252], [326, 284]], 7, '#e6c492', '#7a4f2a');
    root2(ctx, [[232, 32], [236, 56], [228, 78]], 7, '#e6c492', '#7a4f2a');
    carrot(ctx, 128, 20, .9);
    // Burrows along the edges: a worm in one, a sleeping mole at the bottom.
    tunnel(ctx, [[18, 262], [70, 252], [104, 266], [92, 290], [40, 296], [18, 292]], 3);
    worm(ctx, 74, 276, 1, false);
    tunnel(ctx, [[402, 150], [356, 142], [330, 156], [344, 176], [384, 180], [402, 176]], 4);
    for (const [x, y, c] of [[340, 168, true], [354, 165, false], [368, 168, true], [382, 166, false]]) ant(ctx, x, y, 1, c);
    shell(ctx, 380, 330, 1);
    sprout(ctx, 40, 410, 1);
    marble(ctx, 350, 404, 5.5);
    // The floor: deeper soil, stones, and the mole's chamber beside the launcher.
    band(ctx, ridge(452, 3, 51, 30), 560, '#86593a', '#5e3b22', 1.8);
    band(ctx, ridge(512, 4, 52, 44), 560, '#734b30', '#5a3720', 1.3);
    for (const [x, y, w, h, s] of [[36, 482, 10, 7, 61], [74, 530, 8, 5, 62], [150, 520, 6, 4, 63], [280, 530, 7, 5, 64], [392, 492, 9, 6, 65]]) pebble(ctx, x, y, w, h, s, '#d6c4aa', '#b49e80', '#6d4c30');
    tunnel(ctx, [[300, 482], [352, 470], [398, 480], [396, 528], [340, 534], [296, 520]], 9);
    mole(ctx, 350, 508, .9);
    frame(ctx, '#7a4f2a', '#f3d7a8');
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
  function paintGrotto(ctx) {
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
    frame(ctx, '#7c64a8', '#b9a6e6');
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
  function paintCrystal(ctx) {
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
    frame(ctx, '#4b84b8', '#a8dcff');
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
    else if (theme === 'depth-grotto') mossyRock(ctx, half, seed);
    else if (theme === 'depth-meadow') logRock(ctx, half);
    else stoneRock(ctx, half, seed);
    ctx.restore();
  }

  const SCENES = {
    'depth-meadow': { paint: paintMeadow, dark: false, ink: '#3c6a4c' },
    'depth-roots': { paint: paintRoots, dark: false, ink: '#4b2a16' },
    'depth-grotto': { paint: paintGrotto, dark: true, ink: '#e9dcff' },
    'depth-crystal': { paint: paintCrystal, dark: true, ink: '#d8f3ff' }
  };
  function has(theme) { return Object.prototype.hasOwnProperty.call(SCENES, theme); }
  function paint(ctx, theme) { if (has(theme)) SCENES[theme].paint(ctx); }
  root.BloomScenery = Object.freeze({ has, paint, drawRock, dark: theme => has(theme) && SCENES[theme].dark, ink: theme => has(theme) ? SCENES[theme].ink : null, themes: Object.keys(SCENES) });
})(typeof window !== 'undefined' ? window : globalThis);
