/* BLOOMSHOT — a lush, luminous floral arcade, drawn in layers. */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const PAPER = {
    meadow: { top: '#bdeffe', bottom: '#8be8c5', ink: '#075e79', leaf: '#23b786', leafDark: '#087b68', fine: '#8de074', edge: '#38c4ba', halo: '#e7fff1', track: '#067e9f' },
    moon: { top: '#261c63', bottom: '#49348c', ink: '#e0e7ff', leaf: '#6a63d8', leafDark: '#3acdcc', fine: '#cb83e5', edge: '#9181ed', halo: '#9283ef', track: '#aefff5' },
    koi: { top: '#a2f3f2', bottom: '#44cdb7', ink: '#065e70', leaf: '#12a98d', leafDark: '#087f89', fine: '#89e6bb', edge: '#3badc6', halo: '#c6fff1', track: '#056c91' }
  };
  const FLOWERS = {
    coral: { dark: '#d32871', base: '#fa558b', light: '#ff94b0', tip: '#ffe1ce', heart: '#be526c', seed: '#ffec7e' },
    gold: { dark: '#eea31d', base: '#ffc735', light: '#ffe76b', tip: '#fffec8', heart: '#da8033', seed: '#fffac4' },
    lilac: { dark: '#7351d2', base: '#a079fa', light: '#cbb0ff', tip: '#ede2ff', heart: '#7363ca', seed: '#eaffaf' },
    // A forget-me-not blue with a sunny eye, and a poppy orange with a dark velvet heart.
    sky: { dark: '#1d6ad6', base: '#3aa6ff', light: '#8ed2ff', tip: '#e6f7ff', heart: '#f0a01c', seed: '#ffe46a' },
    poppy: { dark: '#d23c14', base: '#ff6a2a', light: '#ffa45e', tip: '#ffe4c6', heart: '#3a2546', seed: '#6b4a80' }
  };
  // How each flower opens: petal count, reach and breadth, the petal's outline, and the size of its heart.
  // inner is the second layer (petals as reach, breadth, turn offset, three FLOWERS colors and alpha; or a white ring).
  // The unfurl reads twist (how far each petal swings as it opens), the sepal colors of its casing shards, and how
  // spread the cracks run.
  const OPEN = {
    gold: { count: 12, reach: 1.52, breadth: .25, shape: 'gold', heart: .49, seeds: 29,
      inner: { count: 12, reach: 1.03, breadth: .25, offset: .5, fill: ['light', 'tip', 'base'], alpha: .92, shape: 'gold' },
      twist: .34, sepal: ['#62c46a', '#2f8d4e', '#c9f5a8'], cracks: .5 },
    coral: { count: 6, reach: 1.52, breadth: .65, shape: 'coral', heart: .32, seeds: 15,
      inner: { count: 5, reach: .95, breadth: .46, offset: .34, fill: ['base', 'light', 'dark'], alpha: .85, shape: 'coral' },
      twist: .62, sepal: ['#43c184', '#1f8a66', '#bff3d2'], cracks: .42 },
    lilac: { count: 6, reach: 1.62, breadth: .35, shape: 'lilac', heart: .24, seeds: 7,
      inner: { count: 3, reach: 1.1, breadth: .28, offset: .25, fill: ['light', 'tip', 'base'], alpha: 1, shape: 'lilac' },
      twist: .78, sepal: ['#3dae8c', '#1c7766', '#b8eedc'], cracks: .36 },
    sky: { count: 5, reach: 1.42, breadth: .66, shape: 'sky', heart: .26, seeds: 8,
      inner: { ring: .44 },
      twist: .5, sepal: ['#48c39b', '#1f8a72', '#c2f6e2'], cracks: .44 },
    poppy: { count: 6, reach: 1.56, breadth: .74, shape: 'coral', heart: .3, seeds: 13,
      inner: { count: 4, reach: 1.0, breadth: .62, offset: .5, fill: ['light', 'tip', 'base'], alpha: .9, shape: 'coral' },
      twist: .7, sepal: ['#78b84f', '#41782c', '#d9f4b0'], cracks: .5 }
  };

  const backdropCache = new Map();
  const flowerCache = new Map();
  const gateCache = new Map();
  const flowerVariants = new WeakMap();
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const ease = n => 1 - Math.pow(1 - clamp(n, 0, 1), 3);

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      n = n + Math.imul(n ^ (n >>> 7), 61 | n) ^ n;
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }

  function circle(ctx, x, y, r, fill, stroke, width) {
    ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = width || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function leaf(ctx, x, y, length, width, angle, color, vein) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-width * .7, -length * .23, -width * .55, -length * .75, 0, -length);
    ctx.bezierCurveTo(width * .66, -length * .68, width * .6, -length * .23, 0, 0);
    ctx.fillStyle = color; ctx.fill();
    if (vein) {
      ctx.beginPath(); ctx.moveTo(0, -length * .11); ctx.quadraticCurveTo(width * .04, -length * .55, 0, -length * .86);
      ctx.strokeStyle = vein; ctx.lineWidth = .65; ctx.stroke();
      ctx.globalAlpha *= .55;
      for (let i = 1; i <= 3; i++) {
        const y0 = -length * (i * .18 + .12);
        ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(width * .24, y0 - length * .1); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function branch(ctx, x, y, scale, flip, colors, opacity) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale * flip, scale); ctx.globalAlpha = opacity;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(26, -34, -6, -83, 25, -131);
    ctx.lineWidth = 1.1; ctx.strokeStyle = colors.leafDark; ctx.stroke();
    const leaves = [[7, -13, 27, 14, -.77], [11, -28, 30, 15, .97], [10, -46, 29, 12, -.8], [9, -64, 28, 12, .78], [12, -82, 22, 10, -.49], [17, -100, 22, 10, .75], [24, -123, 18, 8, .24]];
    leaves.forEach((p, i) => leaf(ctx, ...p, i % 2 ? colors.leaf : colors.fine, colors.leafDark));
    ctx.restore();
  }

  function drawMoon(ctx, x, y, radius, options) {
    if (!ctx) return;
    const r = Math.max(2, Number(radius) || 24), settings = options || {};
    ctx.save(); ctx.translate(x, y);
    if (settings.glow !== false) {
      const halo = ctx.createRadialGradient(-r * .1, -r * .1, r * .65, 0, 0, r * 2.15);
      halo.addColorStop(0, 'rgba(167,225,246,.19)'); halo.addColorStop(.5, 'rgba(171,167,246,.085)'); halo.addColorStop(1, 'rgba(165,181,248,0)');
      circle(ctx, 0, 0, r * 2.15, halo);
    }
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    const sphere = ctx.createRadialGradient(-r * .37, -r * .46, r * .10, r * .1, r * .12, r * 1.28);
    sphere.addColorStop(0, '#fffde6'); sphere.addColorStop(.37, '#ebf4ec'); sphere.addColorStop(.7, '#c8d6e5'); sphere.addColorStop(.88, '#9ba8cb'); sphere.addColorStop(1, '#7882b0');
    circle(ctx, 0, 0, r, sphere);
    // Irregular translucent maria and overlapping washes keep the moon illustrated.
    ctx.save(); ctx.scale(r, r);
    ctx.fillStyle = 'rgba(100,120,157,.13)';
    ctx.beginPath(); ctx.moveTo(-.63, -.38); ctx.bezierCurveTo(-.79, -.62, -.26, -.79, -.05, -.62);
    ctx.bezierCurveTo(.15, -.67, .30, -.43, .11, -.27); ctx.bezierCurveTo(.26, -.02, -.04, .19, -.26, .02);
    ctx.bezierCurveTo(-.58, .1, -.62, -.18, -.63, -.38); ctx.fill();
    ctx.beginPath(); ctx.moveTo(.24, -.1); ctx.bezierCurveTo(.49, -.34, .74, -.14, .67, .16);
    ctx.bezierCurveTo(.87, .31, .6, .56, .36, .49); ctx.bezierCurveTo(.13, .37, .06, .04, .24, -.1); ctx.fill();
    ctx.fillStyle = 'rgba(127,142,171,.105)';
    ctx.beginPath(); ctx.moveTo(-.7, .25); ctx.bezierCurveTo(-.36, .06, -.06, .27, -.12, .58);
    ctx.bezierCurveTo(-.39, .87, -.71, .67, -.7, .25); ctx.fill();
    ctx.restore();
    const craters = [[-.49,-.27,.14,.82],[-.21,-.53,.105,.93],[.12,-.67,.085,.65],[.37,-.37,.105,.82],[.52,.04,.16,.75],[-.14,.25,.13,.95],[-.46,.52,.115,.72],[.22,.56,.085,.79],[.69,.38,.063,.66],[-.72,.07,.075,.63],[.04,-.10,.055,1],[.05,.75,.055,.59]];
    for (const [cx, cy, cr, flat] of craters) {
      const px = cx * r, py = cy * r, rr = cr * r;
      const basin = ctx.createRadialGradient(px - rr * .2, py - rr * .35, .1, px, py, rr);
      basin.addColorStop(0, 'rgba(114,133,168,.26)'); basin.addColorStop(.62, 'rgba(134,153,182,.16)'); basin.addColorStop(1, 'rgba(190,203,218,0)');
      ctx.beginPath(); ctx.ellipse(px, py, rr, rr * flat, -.25, 0, TAU); ctx.fillStyle = basin; ctx.fill();
      ctx.beginPath(); ctx.ellipse(px, py, rr * .82, rr * flat * .82, -.25, .12, Math.PI * 1.02);
      ctx.strokeStyle = 'rgba(250,254,235,.52)'; ctx.lineWidth = Math.max(.35, r * .012); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(px, py, rr * .82, rr * flat * .82, -.25, Math.PI * 1.1, TAU - .1);
      ctx.strokeStyle = 'rgba(102,121,158,.23)'; ctx.lineWidth = Math.max(.35, r * .012); ctx.stroke();
    }
    const speck = rng(9073);
    for (let i = 0; i < 54; i++) {
      const a = speck() * TAU, d = Math.sqrt(speck()) * r * .96;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, r * (.009 + speck() * .011), i % 3 ? 'rgba(242,246,229,.22)' : 'rgba(103,124,163,.14)');
    }
    const limb = ctx.createLinearGradient(-r, -r * .2, r, r * .5);
    limb.addColorStop(0, 'rgba(255,252,220,.13)'); limb.addColorStop(.58, 'rgba(101,107,160,0)'); limb.addColorStop(1, 'rgba(67,64,126,.27)');
    circle(ctx, 0, 0, r, limb); ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r - .35, Math.PI * .93, Math.PI * 1.94);
    ctx.strokeStyle = 'rgba(247,255,229,.54)'; ctx.lineWidth = Math.max(.55, r * .018); ctx.stroke();
    ctx.restore();
  }

  const scenery = theme => root.BloomScenery && root.BloomScenery.has(theme);
  function makeBackdrop(w, h, theme, rush) {
    let surface;
    if (typeof OffscreenCanvas !== 'undefined') surface = new OffscreenCanvas(w, h);
    else if (typeof document !== 'undefined') { surface = document.createElement('canvas'); surface.width = w; surface.height = h; }
    else return null;
    paintBackdrop(surface.getContext('2d'), w, h, theme, rush);
    return surface;
  }
  // Level scenes and the garden worlds are painted in scenery.js; the older garden paper stays as a fallback.
  function paintBackdrop(ctx, w, h, theme, rush) {
    const painter = root.BloomScenery;
    if (scenery(theme)) { ctx.save(); ctx.scale(w / 420, h / 560); painter.paint(ctx, theme); ctx.restore(); }
    else if (painter && painter.garden && painter.garden(theme)) { ctx.save(); ctx.scale(w / 420, h / 560); painter.paintGarden(ctx, theme, rush); ctx.restore(); }
    else paintGarden(ctx, w, h, theme, rush);
  }

  function paintGarden(ctx, w, h, theme, rush) {
    const p = PAPER[theme] || PAPER.meadow;
    ctx.save(); ctx.scale(w / 420, h / 560);
    const wash = ctx.createLinearGradient(40, 0, 340, 560);
    wash.addColorStop(0, p.top); wash.addColorStop(.50, theme === 'moon' ? '#464094' : '#d8fff0'); wash.addColorStop(1, p.bottom);
    ctx.fillStyle = wash; ctx.fillRect(0, 0, 420, 560);
    const glow = ctx.createRadialGradient(196, 154, 15, 198, 220, 330);
    glow.addColorStop(0, theme === 'moon' ? 'rgba(207,129,255,.20)' : 'rgba(255,255,238,.78)'); glow.addColorStop(.8, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 420, 560);
    // Broad, soft color fields create depth without noise behind the targets.
    for (const [x, y, color] of [[12, 175, 'rgba(49,211,228,.22)'], [405, 295, 'rgba(242,111,217,.16)'], [160, 568, 'rgba(255,224,104,.38)']]) {
      const mist = ctx.createRadialGradient(x, y, 1, x, y, 190);
      mist.addColorStop(0, color); mist.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = mist; ctx.fillRect(0, 0, 420, 560);
    }
    paintScenery(ctx, theme, rush, p);
    if (theme === 'moon') {
      drawMoon(ctx, 370, 48, 25.5);
      ctx.save(); ctx.globalAlpha = .8;
      for (const star of [[39, 76], [87, 33], [382, 218], [22, 251], [332, 29]]) {
        ctx.beginPath(); ctx.moveTo(star[0] - 2.5, star[1]); ctx.lineTo(star[0] + 2.5, star[1]);
        ctx.moveTo(star[0], star[1] - 2.5); ctx.lineTo(star[0], star[1] + 2.5);
        ctx.strokeStyle = '#d5c3ff'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
    } else if (theme === 'koi') {
      for (const [x, y, r, a] of [[30, 210, 22, .4], [392, 170, 18, 2.2], [36, 470, 26, 1.1], [388, 420, 21, 3.4], [300, 34, 15, 4.6], [120, 30, 13, 5.5]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        const pad = ctx.createRadialGradient(-r * .3, -r * .3, 1, 0, 0, r);
        pad.addColorStop(0, '#7fe08a'); pad.addColorStop(1, '#249a62');
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, .25, TAU - .05); ctx.closePath(); ctx.fillStyle = pad; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = .8;
        for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(.5 + k) * r * .85, Math.sin(.5 + k) * r * .85); ctx.stroke(); }
        ctx.restore();
      }
      paintFlower(ctx, 392, 170, 8, 'coral', 1, 0, 2.2);
      paintFlower(ctx, 36, 470, 9, 'lilac', 1, 0, .6);
      ctx.save(); ctx.globalAlpha = .27; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.3;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.ellipse(346, 376, 25 + i * 19, 7 + i * 5.5, -.18, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(34, 119, 20 + i * 17, 7 + i * 6, .15, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    // Sunlit bokeh has no closed-bud silhouette, keeping playable targets distinct.
    const random = rng(14141);
    for (let i = 0; i < 70; i++) {
      const x = random() * 420, y = random() * 560, radius = 1 + random() * 9;
      ctx.globalAlpha = .04 + random() * .13;
      circle(ctx, x, y, radius, '#ffffff');
    }
    ctx.globalAlpha = 1;
    branch(ctx, rush ? -34 : -9, 574, 1.55, 1, p, .93);
    branch(ctx, rush ? 451 : 427, 575, 1.44, -1, p, .98);
    branch(ctx, -23, 347, .96, 1, p, .52);
    branch(ctx, 442, 314, .87, -1, p, .58);
    branch(ctx, -32, 167, .93, 1, p, .44);
    branch(ctx, 452, 146, .91, -1, p, .48);
    // Oversized, cropped blossoms belong to the lush border, outside the hit area.
    if (!rush) {
      paintFlower(ctx, -15, 388, 20, 'coral', 1, 0, .9);
      paintFlower(ctx, 431, 445, 23, 'lilac', 1, 0, 2.5);
    }
    paintFlower(ctx, 26, 557, 29, 'gold', 1, 0, 1.1);
    paintFlower(ctx, 72, 567, 22, 'coral', 1, 0, 2);
    paintFlower(ctx, 351, 570, 25, 'coral', 1, 0, .4);
    paintFlower(ctx, 399, 560, 27, 'lilac', 1, 0, 1.7);
    ctx.strokeStyle = theme === 'moon' ? 'rgba(177,139,255,.45)' : 'rgba(14,159,159,.27)'; ctx.lineWidth = 3;
    roundRect(ctx, 13, 13, 394, 534, 28); ctx.stroke();
    ctx.globalAlpha = .7; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
    roundRect(ctx, 16, 16, 388, 528, 25); ctx.stroke();
    ctx.restore();
  }


  // Painted depth: a warm sun (or nebula), raking light and three rolling
  // hill bands kept below the play area so targets stay readable.
  function paintScenery(ctx, theme, rush, p) {
    const night = theme === 'moon';
    ctx.save();
    if (night) {
      for (const [x, y, r, c] of [[90, 120, 170, 'rgba(255,92,201,.16)'], [330, 260, 190, 'rgba(84,226,255,.13)'], [210, 40, 150, 'rgba(176,120,255,.20)']]) {
        const neb = ctx.createRadialGradient(x, y, 2, x, y, r);
        neb.addColorStop(0, c); neb.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = neb; ctx.fillRect(0, 0, 420, 560);
      }
      const stars = rng(5101);
      for (let i = 0; i < 90; i++) {
        const x = stars() * 420, y = stars() * 430, big = stars() > .9;
        ctx.globalAlpha = .25 + stars() * .6;
        if (big) sparkle(ctx, x, y, 2.6, '#f4ecff', stars());
        else circle(ctx, x, y, .5 + stars() * .9, '#efe6ff');
      }
      ctx.globalAlpha = 1;
    } else {
      const sun = ctx.createRadialGradient(338, 58, 4, 338, 58, 230);
      sun.addColorStop(0, 'rgba(255,252,214,.95)'); sun.addColorStop(.18, 'rgba(255,236,150,.55)');
      sun.addColorStop(.5, 'rgba(255,214,140,.16)'); sun.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, 420, 560);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const a = 1.95 + i * .19, spread = .035 + (i % 3) * .018;
        ctx.beginPath(); ctx.moveTo(338, 58);
        ctx.lineTo(338 + Math.cos(a - spread) * 700, 58 + Math.sin(a - spread) * 700);
        ctx.lineTo(338 + Math.cos(a + spread) * 700, 58 + Math.sin(a + spread) * 700);
        ctx.closePath(); ctx.fillStyle = `rgba(255,250,215,${.025 + (i % 2) * .018})`; ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    const bands = night
      ? [[452, '#5b48b5', .55, 3], [486, '#4a3a9e', .7, 5], [516, '#35297c', .85, 7]]
      : theme === 'koi'
        ? [[456, '#7fe0d0', .5, 3], [488, '#4fc8b4', .65, 5], [518, '#2aa894', .8, 7]]
        : [[452, '#9fe6b0', .55, 3], [484, '#5fd193', .7, 5], [516, '#2fb57c', .85, 7]];
    bands.forEach(([base, color, alpha, seed], band) => {
      const r = rng(seed * 977);
      ctx.beginPath(); ctx.moveTo(-10, 570); ctx.lineTo(-10, base + 10);
      let x = -10;
      while (x < 430) {
        const w = 70 + r() * 90, h = 10 + r() * (18 + band * 6);
        ctx.quadraticCurveTo(x + w / 2, base - h, x + w, base + (r() - .5) * 10); x += w;
      }
      ctx.lineTo(430, 570); ctx.closePath();
      const g = ctx.createLinearGradient(0, base - 30, 0, 560);
      g.addColorStop(0, color); g.addColorStop(1, night ? '#21185a' : '#178a62');
      ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fill();
      // Rim light along each ridge, painted as a soft highlight.
      ctx.globalAlpha = alpha * .35; ctx.strokeStyle = night ? '#c9b6ff' : '#f6ffd8'; ctx.lineWidth = 1.4; ctx.stroke();
      // Tiny wildflowers dot the nearer slopes.
      ctx.globalAlpha = .9;
      const dots = night ? ['#cfa8ff', '#8ff6ff', '#ffd7f5'] : ['#ff7aa6', '#ffd44f', '#b48cff', '#ffffff'];
      for (let i = 0; i < 18 + band * 16; i++) {
        const fx = r() * 420, fy = base + 12 + r() * (560 - base);
        const c = dots[Math.floor(r() * dots.length)], s = .9 + r() * (1 + band * .6);
        for (let k = 0; k < 5; k++) circle(ctx, fx + Math.cos(k * 1.257) * s, fy + Math.sin(k * 1.257) * s, s * .75, c);
        circle(ctx, fx, fy, s * .55, night ? '#fff6c4' : '#fff3a8');
      }
    });
    ctx.restore();
  }

  function drawGarden(ctx, w, h, theme, options) {
    if (!ctx) return;
    w = w || 420; h = h || 560; theme = PAPER[theme] || scenery(theme) ? theme : 'meadow';
    // Six bounded background variants: three themes, with clear Rush side margins.
    const rush = options && options.mode === 'rush';
    const key = `${theme}:${rush ? 'rush' : 'garden'}`;
    let surface = backdropCache.get(key);
    if (!surface) { surface = makeBackdrop(840, 1120, theme, rush); if (surface) backdropCache.set(key, surface); }
    if (surface) ctx.drawImage(surface, 0, 0, w, h);
    else paintBackdrop(ctx, w, h, theme, rush);
  }

  function petal(ctx, radius, breadth, bend, color, light, dark, index, shape) {
    ctx.save(); ctx.rotate(bend);
    ctx.beginPath(); ctx.moveTo(-radius * .085, radius * .12);
    if (shape === 'gold') {
      // Sunstar rays have a keen tip and a folded, tapering midrib.
      ctx.bezierCurveTo(-breadth * .88, -radius * .25, -breadth * .68, -radius * .68, 0, -radius);
      ctx.bezierCurveTo(breadth * .32, -radius * .67, breadth * .9, -radius * .33, radius * .08, radius * .12);
    } else if (shape === 'sky') {
      // Forget-me-not petals are round fans that nearly touch their neighbours.
      ctx.bezierCurveTo(-breadth * 1.15, -radius * .28, -breadth * 1.05, -radius * .96, 0, -radius);
      ctx.bezierCurveTo(breadth * 1.05, -radius * .96, breadth * 1.15, -radius * .28, radius * .08, radius * .12);
    } else if (shape === 'lilac') {
      // Long iris standards curl to one side instead of forming a round daisy.
      ctx.bezierCurveTo(-breadth * .66, -radius * .16, -breadth * 1.1, -radius * .68, -radius * .07, -radius);
      ctx.quadraticCurveTo(radius * .04, -radius * 1.015, radius * .10, -radius * .94);
      ctx.bezierCurveTo(breadth * .98, -radius * .7, breadth * .38, -radius * .23, radius * .08, radius * .12);
    } else {
      // Broad cosmos petals carry three soft scallops along the outer lip.
      ctx.bezierCurveTo(-breadth, -radius * .17, -breadth * .97, -radius * .72, -radius * .33, -radius * .95);
      ctx.quadraticCurveTo(-radius * .24, -radius * 1.05, -radius * .13, -radius * .97);
      ctx.quadraticCurveTo(0, -radius * 1.09, radius * .11, -radius * .98);
      ctx.quadraticCurveTo(radius * .25, -radius * 1.055, radius * .35, -radius * .93);
      ctx.bezierCurveTo(breadth, -radius * .72, breadth * .88, -radius * .2, radius * .08, radius * .12);
    }
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 3, 0, -radius);
    gradient.addColorStop(0, dark); gradient.addColorStop(.38, color); gradient.addColorStop(.81, light); gradient.addColorStop(1, light);
    ctx.fillStyle = gradient; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.20)'; ctx.lineWidth = .6; ctx.stroke();
    // A few irregular growth lines give each petal a botanical feel.
    ctx.strokeStyle = dark; ctx.globalAlpha *= .2; ctx.lineWidth = .5;
    for (let j = -1; j <= 1; j++) {
      ctx.beginPath(); ctx.moveTo(j * radius * .035, -radius * .12);
      ctx.quadraticCurveTo(j * radius * .13, -radius * .45, j * radius * .1 + Math.sin(index) * radius * .035, -radius * .82);
      ctx.stroke();
    }
    if (shape === 'gold' || shape === 'lilac') {
      ctx.globalAlpha *= 2.1; ctx.strokeStyle = light; ctx.lineWidth = .75;
      ctx.beginPath(); ctx.moveTo(0, -radius * .23); ctx.quadraticCurveTo(radius * .04, -radius * .56, 0, -radius * .91); ctx.stroke();
    }
    ctx.restore();
  }

  function closedBudPath(ctx, r, type) {
    ctx.beginPath();
    if (type === 'gold') {
      ctx.moveTo(0, -r * 1.02);
      ctx.bezierCurveTo(r * .28, -r * .84, r * .20, -r * .66, r * .54, -r * .75);
      ctx.quadraticCurveTo(r * .64, -r * .5, r * .89, -r * .35);
      ctx.bezierCurveTo(r * .80, r * .42, r * .33, r * .81, 0, r * .84);
      ctx.bezierCurveTo(-r * .39, r * .82, -r * .88, r * .33, -r * .86, -r * .34);
      ctx.quadraticCurveTo(-r * .61, -r * .46, -r * .54, -r * .77);
      ctx.quadraticCurveTo(-r * .25, -r * .66, 0, -r * 1.02);
    } else if (type === 'sky') {
      // A round bell bud, gathered into a soft crown at the top.
      ctx.moveTo(0, -r * .78);
      ctx.quadraticCurveTo(r * .16, -r * 1.02, r * .34, -r * .8);
      ctx.bezierCurveTo(r * .92, -r * .62, r * .98, r * .36, r * .5, r * .74);
      ctx.bezierCurveTo(r * .22, r * .94, -r * .22, r * .94, -r * .5, r * .74);
      ctx.bezierCurveTo(-r * .98, r * .36, -r * .92, -r * .62, -r * .34, -r * .8);
      ctx.quadraticCurveTo(-r * .16, -r * 1.02, 0, -r * .78);
    } else if (type === 'poppy') {
      // A poppy bud: a plump teardrop with a twisted point.
      ctx.moveTo(r * .06, -r * 1.06);
      ctx.bezierCurveTo(r * .34, -r * .74, r * .9, -r * .36, r * .84, r * .2);
      ctx.bezierCurveTo(r * .78, r * .7, r * .3, r * .9, 0, r * .9);
      ctx.bezierCurveTo(-r * .32, r * .9, -r * .8, r * .66, -r * .84, r * .16);
      ctx.bezierCurveTo(-r * .88, -r * .36, -r * .3, -r * .7, r * .06, -r * 1.06);
    } else if (type === 'lilac') {
      ctx.moveTo(0, -r * 1.08);
      ctx.bezierCurveTo(r * .17, -r * .6, r * .84, -r * .49, r * .8, -r * .02);
      ctx.bezierCurveTo(r * .7, r * .36, r * .24, r * .72, 0, r * .92);
      ctx.bezierCurveTo(-r * .27, r * .71, -r * .83, r * .29, -r * .78, -r * .10);
      ctx.bezierCurveTo(-r * .77, -r * .47, -r * .19, -r * .62, 0, -r * 1.08);
    } else {
      ctx.moveTo(0, r * .87);
      ctx.bezierCurveTo(-r * .75, r * .73, -r * 1.00, r * .07, -r * .81, -r * .52);
      ctx.quadraticCurveTo(-r * .63, -r * 1.03, -r * .22, -r * .78);
      ctx.quadraticCurveTo(r * .04, -r * 1.03, r * .32, -r * .78);
      ctx.bezierCurveTo(r * .82, -r * .93, r * .99, -r * .31, r * .86, r * .15);
      ctx.quadraticCurveTo(r * .69, r * .76, 0, r * .87);
    }
    ctx.closePath();
  }

  // Small stems and leaves belong to the target itself, not a background plant.
  function paintStem(ctx, r) {
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.quadraticCurveTo(r * .05, r * .75, -r * .13, r * 1.04);
    ctx.strokeStyle = '#26a578'; ctx.lineWidth = Math.max(1, r * .085); ctx.stroke();
    leaf(ctx, -r * .07, r * .80, r * .72, r * .38, -.86, '#4dca8d', '#219d80');
    leaf(ctx, -r * .04, r * .65, r * .60, r * .29, 1.02, '#8ada78', '#46b484');
  }
  // The heart: a disc, a lighter seed bed and a sunflower spiral of seeds.
  function paintHeart(ctx, r, type) {
    const c = FLOWERS[type], form = OPEN[type], heartSize = form.heart;
    circle(ctx, 0, 0, r * heartSize, c.heart, 'rgba(255,255,255,.65)', .6);
    circle(ctx, -r * .035, -r * .055, r * (heartSize - .07), c.seed);
    const seedCount = form.seeds;
    for (let i = 0; i < seedCount; i++) {
      const ang = i * 2.39996, dist = Math.sqrt(i / seedCount) * r * (heartSize - .07);
      circle(ctx, Math.cos(ang) * dist, Math.sin(ang) * dist, Math.max(.48, r * .032), i % 3 ? c.heart : c.tip);
    }
  }
  // parts picks layers for the unfurl atlas (1 stem, 2 closed bud, 4 open flower); every other caller paints all three.
  function paintFlower(ctx, x, y, r, type, openness, time, phase, parts) {
    if (!ctx) return;
    type = FLOWERS[type] ? type : 'coral';
    const c = FLOWERS[type], o = clamp(Number(openness) || 0, 0, 1), layers = parts || 7;
    r = Math.max(2, Number(r) || 16);
    ctx.save(); ctx.translate(x, y);
    if (layers & 1) paintStem(ctx, r);

    if (o < .94 && layers & 2) {
      const a = 1 - ease(Math.max(0, o - .25) / .69);
      ctx.save(); ctx.globalAlpha *= a;
      // A glassy disc in the flower's own color, with a bright rim, marks the hit area and makes each target a jewel of color.
      const disc = ctx.createRadialGradient(-r * .35, -r * .45, r * .1, 0, 0, r + 2.4);
      disc.addColorStop(0, 'rgba(255,255,255,.95)'); disc.addColorStop(.45, c.tip); disc.addColorStop(.85, c.light); disc.addColorStop(1, c.base);
      ctx.save(); ctx.globalAlpha *= .9; circle(ctx, 0, 0, r + 2.4, disc); ctx.restore();
      circle(ctx, 0, 0, r + 2.4, null, 'rgba(255,255,255,.95)', 1.3);
      ctx.shadowColor = c.dark + '44'; ctx.shadowBlur = r * .5; ctx.shadowOffsetY = r * .15;
      const bud = ctx.createLinearGradient(-r, -r, r, r);
      bud.addColorStop(0, c.tip); bud.addColorStop(.24, c.light); bud.addColorStop(.65, c.base); bud.addColorStop(1, c.dark);
      closedBudPath(ctx, r, type);
      ctx.fillStyle = bud; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = c.dark; ctx.lineWidth = .8; ctx.stroke();
      ctx.beginPath();
      if (type === 'coral') {
        ctx.moveTo(-r * .72, -r * .28); ctx.bezierCurveTo(-r * .3, -r * .55, r * .61, -r * .33, r * .27, r * .25);
        ctx.bezierCurveTo(r * .05, r * .48, -r * .49, r * .10, -r * .14, -r * .14);
        ctx.moveTo(r * .74, -.03 * r); ctx.quadraticCurveTo(r * .22, r * .47, -.12 * r, r * .75);
      } else if (type === 'gold') {
        ctx.moveTo(0, -r * .87); ctx.quadraticCurveTo(-r * .2, -r * .11, 0, r * .73);
        ctx.moveTo(-r * .53, -r * .6); ctx.quadraticCurveTo(-r * .55, r * .1, 0, r * .73);
        ctx.moveTo(r * .51, -r * .61); ctx.quadraticCurveTo(r * .59, r * .02, 0, r * .73);
      } else if (type === 'sky') {
        ctx.moveTo(0, -r * .78); ctx.quadraticCurveTo(-r * .08, 0, 0, r * .86);
        ctx.moveTo(-r * .34, -r * .8); ctx.quadraticCurveTo(-r * .62, 0, -r * .3, r * .8);
        ctx.moveTo(r * .34, -r * .8); ctx.quadraticCurveTo(r * .62, 0, r * .3, r * .8);
      } else if (type === 'poppy') {
        ctx.moveTo(r * .06, -r * 1.02); ctx.bezierCurveTo(-r * .3, -r * .5, r * .42, -r * .1, -r * .1, r * .84);
        ctx.moveTo(r * .06, -r * 1.02); ctx.quadraticCurveTo(r * .62, -r * .2, r * .46, r * .7);
      } else {
        ctx.moveTo(0, -r * .95); ctx.bezierCurveTo(-r * .12, -r * .14, r * .29, r * .06, 0, r * .79);
        ctx.moveTo(-r * .68, -r * .21); ctx.quadraticCurveTo(-r * .13, r * .08, 0, r * .65);
        ctx.moveTo(r * .69, -r * .18); ctx.quadraticCurveTo(r * .16, r * .03, 0, r * .65);
      }
      ctx.strokeStyle = c.dark; ctx.globalAlpha *= .45; ctx.lineWidth = .85; ctx.stroke(); ctx.restore();
      // A warm pinprick is the seed tucked inside each bud.
      ctx.save(); ctx.globalAlpha *= a;
      ctx.beginPath(); ctx.ellipse(-r * .3, -r * .31, r * .15, r * .29, .6, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,.74)'; ctx.fill();
      ctx.restore();
    }

    if (o > .001 && layers & 4) {
      ctx.save();
      const bloom = ease(o);
      const pop = 1 + Math.sin(o * Math.PI) * .29;
      ctx.scale((.34 + bloom * .66) * pop, (.34 + bloom * .66) * pop);
      ctx.globalAlpha *= Math.min(1, o * 3.2);
      ctx.rotate(Math.sin(phase) * .25 + (1 - bloom) * .25);
      ctx.shadowColor = c.dark + '55'; ctx.shadowBlur = r * .48; ctx.shadowOffsetY = r * .15;
      const form = OPEN[type], count = form.count, pr = r * form.reach;
      for (let i = 0; i < count; i++) {
        petal(ctx, pr * (1 + Math.sin(i * 7.3 + phase) * .045), pr * form.breadth, i * TAU / count, c.base, c.light, c.dark, i, form.shape);
      }
      ctx.shadowColor = 'transparent';
      const inner = form.inner;
      // Sky: a white ring around the sunny eye, as on a real forget-me-not. The rest: a second, smaller layer of petals.
      if (inner.ring) circle(ctx, 0, 0, r * inner.ring, 'rgba(255,255,255,.92)');
      else {
        ctx.save(); if (inner.alpha !== 1) ctx.globalAlpha *= inner.alpha;
        for (let i = 0; i < inner.count; i++) petal(ctx, r * inner.reach, r * inner.breadth, (i + inner.offset) * TAU / inner.count, c[inner.fill[0]], c[inner.fill[1]], c[inner.fill[2]], i, inner.shape);
        ctx.restore();
      }
      paintHeart(ctx, r, type);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFlower(ctx, x, y, r, type, openness, time, fixedVariant) {
    if (!ctx) return;
    type = FLOWERS[type] ? type : 'coral';
    r = Math.max(2, Number(r) || 16);
    const o = clamp(Number(openness) || 0, 0, 1);
    const variant = Number.isInteger(fixedVariant) ? fixedVariant : ((Math.floor(x) * 31 + Math.floor(y) * 17) % 7 + 7) % 7;
    const phase = variant * .81;
    // Bloom choreography composites crisp sprites; dozens of simultaneous
    // blossoms should spend their frame budget on motion, not repeated shadows.
    if (o > 0 && o < 1) {
      const a = 1 - ease(Math.max(0, o - .25) / .69);
      if (a > 0) { ctx.save(); ctx.globalAlpha *= a; drawFlower(ctx, x, y, r, type, 0, time, variant); ctx.restore(); }
      const bloom = ease(o), scale = (.34 + bloom * .66) * (1 + Math.sin(o * Math.PI) * .29);
      ctx.save(); ctx.translate(x, y); ctx.rotate((1 - bloom) * .25); ctx.scale(scale, scale); ctx.translate(-x, -y);
      ctx.globalAlpha *= Math.min(1, o * 3.2); drawFlower(ctx, x, y, r, type, 1, time, variant); ctx.restore();
      return;
    }
    // Crisp 3x resting sprites retain petal veins, relief and soft shadows.
    if (o === 0 || o === 1) {
      const key = `${type}:${r.toFixed(2)}:${o}:${o ? variant : 0}`;
      let sprite = flowerCache.get(key);
      if (!sprite) {
        const size = Math.ceil(r * 4 + 12), pixels = size * 3;
        let surface;
        if (typeof OffscreenCanvas !== 'undefined') surface = new OffscreenCanvas(pixels, pixels);
        else if (typeof document !== 'undefined') { surface = document.createElement('canvas'); surface.width = pixels; surface.height = pixels; }
        if (surface) {
          const context = surface.getContext('2d'); context.scale(3, 3);
          paintFlower(context, size / 2, size / 2, r, type, o, time, phase);
          sprite = { surface, size };
          if (flowerCache.size >= 80) flowerCache.delete(flowerCache.keys().next().value);
          flowerCache.set(key, sprite);
        }
      }
      if (sprite) { ctx.drawImage(sprite.surface, x - sprite.size / 2, y - sprite.size / 2, sprite.size, sprite.size); return; }
    }
    paintFlower(ctx, x, y, r, type, o, time, phase);
  }

  // The bloom moment. A hit bud flashes white, cracks from the side it was struck, sheds its casing and unfurls petal
  // by petal from the far side, alternating left and right, before handing off to the resting sprite. Everything is
  // stateless (a function of the bud and its age) and composited from 3x sprites painted once with the same petal()
  // geometry, so a frame full of blooms costs drawImage calls, not gradients or shadows.
  const UNFURL = .55, FLASH = .035, UNFURL_MAX = 16, UNFURL_LOW = 6;
  const atlas = new Map();
  const budSeeds = new WeakMap(), budSprites = new WeakMap();
  const unfurlPick = new Set(), unfurlPool = [];
  const unfurlOptions = { time: 0, reducedMotion: false, quality: 0 };
  const NO_DASH = [], LINK_DOTS = [.1, 6], STREAM_WIDE = [12, 8], STREAM_FINE = [2.5, 13], SPORE_RING = [.1, 6], SPORE_REACH = 74;
  const CRACK_STEPS = [.26, .24, .2, .17, .13], PT = { x: 0, y: 0 };
  let trembleKey = null, trembleTime = 1;
  const bloomBack = (t, s) => { t = clamp(t, 0, 1) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  function easeBounce(t) {
    t = clamp(t, 0, 1);
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + .75; }
    if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + .9375; }
    t -= 2.625 / 2.75; return 7.5625 * t * t + .984375;
  }
  function hash01(seed, n) {
    let h = Math.imul(seed ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function variantOf(bud) {
    if (!flowerVariants.has(bud)) flowerVariants.set(bud, ((Math.floor(Number(bud.x) || 0) * 31 + Math.floor(Number(bud.y) || 0) * 17) % 7 + 7) % 7);
    return flowerVariants.get(bud);
  }
  function seedOf(bud) {
    let seed = budSeeds.get(bud);
    if (seed === undefined) { seed = idSeed(bud.id != null ? bud.id : `${Math.round(Number(bud.x) || 0)}:${Math.round(Number(bud.startY ?? bud.y) || 0)}`); budSeeds.set(bud, seed); }
    return seed;
  }
  function makeSurface(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch (error) { /* fall back below */ } }
    if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
      const surface = document.createElement('canvas'); surface.width = w; surface.height = h; return surface;
    }
    return null;
  }
  // A sprite painted once at 3x inside the box (x0, y0)-(x1, y1) around its own origin. Null where there is no canvas
  // (node), and callers then draw plain paths.
  function atlasSprite(key, x0, y0, x1, y1, paint) {
    if (atlas.has(key)) return atlas.get(key);
    const w = Math.ceil((x1 - x0) * 3), h = Math.ceil((y1 - y0) * 3), surface = makeSurface(w, h);
    let sprite = null;
    const g = surface && surface.getContext('2d');
    if (g) { g.scale(3, 3); g.translate(-x0, -y0); paint(g); sprite = { surface, x: x0, y: y0, w: w / 3, h: h / 3 }; }
    if (atlas.size >= 260) atlas.delete(atlas.keys().next().value);
    atlas.set(key, sprite);
    return sprite;
  }
  function blit(ctx, sprite) { ctx.drawImage(sprite.surface, sprite.x, sprite.y, sprite.w, sprite.h); }
  // One outer petal pointing up from the flower's center, with the same soft shadow the resting sprite gives it.
  function outerSprite(type, r) {
    const form = OPEN[type], c = FLOWERS[type], pr = r * form.reach, b = pr * form.breadth, pad = 2 + r * .2;
    const half = Math.max(b * 1.2, pr * .4) + pad;
    return atlasSprite(`o:${type}:${r.toFixed(2)}`, -half, -pr * 1.12 - pad, half, pr * .14 + pad, g => {
      g.shadowColor = c.dark + '55'; g.shadowBlur = r * .48;
      petal(g, pr, b, 0, c.base, c.light, c.dark, 0, form.shape);
    });
  }
  // The whole inner layer as paintFlower paints it (each petal at the layer's alpha), so it opens as one rosette.
  function innerSprite(type, r) {
    const inner = OPEN[type].inner, c = FLOWERS[type], e = r * (inner.ring || inner.reach * 1.12) + 3;
    return atlasSprite(`i:${type}:${r.toFixed(2)}`, -e, -e, e, e, g => {
      if (inner.ring) { circle(g, 0, 0, r * inner.ring, 'rgba(255,255,255,.92)'); return; }
      g.globalAlpha = inner.alpha;
      for (let i = 0; i < inner.count; i++) petal(g, r * inner.reach, r * inner.breadth, (i + inner.offset) * TAU / inner.count, c[inner.fill[0]], c[inner.fill[1]], c[inner.fill[2]], i, inner.shape);
    });
  }
  // One inner petal pointing up, as paintFlower paints it (no shadow); the inner sheet places it at the layer's alpha.
  function innerPetalSprite(type, r) {
    const inner = OPEN[type].inner, c = FLOWERS[type], pr = r * inner.reach, b = r * inner.breadth, pad = 2;
    const half = Math.max(b * 1.2, pr * .4) + pad;
    return atlasSprite(`q:${type}:${r.toFixed(2)}`, -half, -pr * 1.12 - pad, half, pr * .14 + pad,
      g => petal(g, pr, b, 0, c[inner.fill[0]], c[inner.fill[1]], c[inner.fill[2]], 0, inner.shape));
  }
  function heartSprite(type, r) {
    const e = r * OPEN[type].heart + 1.5;
    return atlasSprite(`h:${type}:${r.toFixed(2)}`, -e, -e, e, e, g => paintHeart(g, r, type));
  }
  function stemSprite(r) {
    return atlasSprite(`s:${r.toFixed(2)}`, -r * 1.1 - 3, -3, r * 1.05 + 3, r * 1.2 + 6, g => paintStem(g, r));
  }
  // The closed bud without its stem: it squashes, cracks and pops on its own.
  function budSprite(type, r) {
    const e = r * 1.25 + 6;
    return atlasSprite(`b:${type}:${r.toFixed(2)}`, -e, -e, e, e, g => paintFlower(g, 0, 0, r, type, 0, 0, 0, 2));
  }
  // The one-frame hit: the whole bud, stem and all, in pure white (its soft shadow becomes a white halo).
  function silhouetteSprite(type, rb) {
    const e = rb * 1.3 + 6;
    return atlasSprite(`w:${type}:${rb}`, -e, -e, e, e, g => {
      paintFlower(g, 0, 0, rb, type, 0, 0, 0, 3);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(-e, -e, e * 2, e * 2);
    });
  }
  // Soft additive light, painted once: a per-color bloom flash, a warm gold flare and a tight spark.
  function flashSprite(type) {
    const c = FLOWERS[type] || FLOWERS.coral;
    return atlasSprite(`f:${FLOWERS[type] ? type : 'coral'}`, -40, -40, 40, 40, g => {
      const flash = g.createRadialGradient(0, 0, 0, 0, 0, 40);
      flash.addColorStop(0, 'rgba(255,255,240,.9)'); flash.addColorStop(.45, c.light + 'aa'); flash.addColorStop(1, c.base + '00');
      g.fillStyle = flash; g.fillRect(-40, -40, 80, 80);
    });
  }
  // Warm, not white: on the bright meadow sky additive light should gild a flower, not bleach it.
  function goldSprite() {
    return atlasSprite('g:gold', -40, -40, 40, 40, g => {
      const glow = g.createRadialGradient(0, 0, 0, 0, 0, 40);
      glow.addColorStop(0, 'rgba(255,224,130,.82)'); glow.addColorStop(.28, 'rgba(255,196,72,.52)');
      glow.addColorStop(.62, 'rgba(255,160,50,.16)'); glow.addColorStop(1, 'rgba(255,150,40,0)');
      g.fillStyle = glow; g.fillRect(-40, -40, 80, 80);
    });
  }
  // A chain link's head: a tight warm glow with a four-point star baked in, added onto the scene so the star burns white.
  function headSprite() {
    return atlasSprite('g:head', -40, -40, 40, 40, g => {
      const glow = g.createRadialGradient(0, 0, 0, 0, 0, 40);
      glow.addColorStop(0, 'rgba(255,246,196,.95)'); glow.addColorStop(.18, 'rgba(255,214,96,.7)');
      glow.addColorStop(.5, 'rgba(255,176,60,.18)'); glow.addColorStop(1, 'rgba(255,160,50,0)');
      g.fillStyle = glow; g.fillRect(-40, -40, 80, 80);
      sparkle(g, 0, 0, 17, '#fffdf0', .3);
    });
  }
  // Draws a centered sprite at (x, y), radius-scaled, with no transform calls.
  function dab(ctx, sprite, x, y, scale) {
    ctx.drawImage(sprite.surface, x + sprite.x * scale, y + sprite.y * scale, sprite.w * scale, sprite.h * scale);
  }
  // Every sprite one bloom needs, painted together on its first frame (one small hitch, not one per stage) and kept
  // on the bud so later frames skip the key lookups. Null members mean there is no canvas to paint into.
  function spritesFor(bud, type, r) {
    let set = budSprites.get(bud);
    if (!set || set.type !== type || set.r !== r) {
      set = { type, r, stem: stemSprite(r), closed: budSprite(type, r), outer: outerSprite(type, r), inner: innerSprite(type, r),
        heart: heartSprite(type, r), white: silhouetteSprite(type, Math.max(4, Math.round(r))), sheet: null, innerSheet: null, innerPetal: null };
      set.ready = Boolean(set.stem && set.closed && set.outer && set.inner && set.heart && set.white);
      if (set.ready) {
        set.sheet = sheetFor('outer', type, r);
        if (!OPEN[type].inner.ring) { set.innerPetal = innerPetalSprite(type, r); set.innerSheet = sheetFor('inner', type, r); }
      }
      budSprites.set(bud, set);
    }
    return set;
  }
  function drawSilhouette(ctx, x, y, r, type, scale) {
    type = FLOWERS[type] ? type : 'coral';
    const rb = Math.max(4, Math.round(r)), k = r / rb * (scale || 1), sprite = silhouetteSprite(type, rb);
    if (sprite) { dab(ctx, sprite, x, y, k); return; }
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    circle(ctx, 0, 0, rb + 2.4, '#ffffff'); paintStem(ctx, rb); ctx.restore();
  }
  // The unfurl places dozens of sprites a frame. Rather than save, rotate, scale and restore around each one, it reads
  // the transform once and sets each sprite's full matrix in a single call.
  const BASE = new Float64Array(6), FRAME = new Float64Array(6);
  function readBase(ctx) {
    if (typeof ctx.getTransform !== 'function') return false;
    const m = ctx.getTransform();
    if (!m || !Number.isFinite(m.a) || !Number.isFinite(m.b) || !Number.isFinite(m.c) || !Number.isFinite(m.d) || !Number.isFinite(m.e) || !Number.isFinite(m.f)) return false;
    BASE[0] = m.a; BASE[1] = m.b; BASE[2] = m.c; BASE[3] = m.d; BASE[4] = m.e; BASE[5] = m.f;
    return true;
  }
  // FRAME = BASE x translate(x, y) x rotate(turn)
  function setFrame(x, y, turn) {
    const c = Math.cos(turn), s = Math.sin(turn);
    FRAME[4] = BASE[0] * x + BASE[2] * y + BASE[4]; FRAME[5] = BASE[1] * x + BASE[3] * y + BASE[5];
    FRAME[0] = BASE[0] * c + BASE[2] * s; FRAME[1] = BASE[1] * c + BASE[3] * s;
    FRAME[2] = BASE[2] * c - BASE[0] * s; FRAME[3] = BASE[3] * c - BASE[1] * s;
  }
  // Draws a sprite at FRAME x translate(ox, oy) x rotate(angle) x scale(sx, sy).
  function stamp(ctx, sprite, ox, oy, angle, sx, sy) {
    const c = Math.cos(angle), s = Math.sin(angle);
    ctx.setTransform((FRAME[0] * c + FRAME[2] * s) * sx, (FRAME[1] * c + FRAME[3] * s) * sx, (FRAME[2] * c - FRAME[0] * s) * sy, (FRAME[3] * c - FRAME[1] * s) * sy,
      FRAME[0] * ox + FRAME[2] * oy + FRAME[4], FRAME[1] * ox + FRAME[3] * oy + FRAME[5]);
    ctx.drawImage(sprite.surface, sprite.x, sprite.y, sprite.w, sprite.h);
  }
  function quadAt(t, ax, ay, cx, cy, bx, by) {
    const u = 1 - t; PT.x = u * u * ax + 2 * u * t * cx + t * t * bx; PT.y = u * u * ay + 2 * u * t * cy + t * t * by; return PT;
  }
  // sparkle()'s four-point star added to the current path, turned by computing its points rather than the transform.
  function starPath(ctx, x, y, size, turn) {
    const c = Math.cos(turn) * size, s = Math.sin(turn) * size;
    const X = (u, v) => x + u * c - v * s, Y = (u, v) => y + u * s + v * c;
    ctx.moveTo(X(0, -1), Y(0, -1));
    ctx.quadraticCurveTo(X(.16, -.13), Y(.16, -.13), X(1, 0), Y(1, 0));
    ctx.quadraticCurveTo(X(.15, .14), Y(.15, .14), X(0, 1), Y(0, 1));
    ctx.quadraticCurveTo(X(-.16, .14), Y(-.16, .14), X(-1, 0), Y(-1, 0));
    ctx.quadraticCurveTo(X(-.14, -.15), Y(-.14, -.15), X(0, -1), Y(0, -1));
    ctx.closePath();
  }
  // Index distance from the lead petal folded to (-n/2, n/2]; the opening order is 0, 1, -1, 2, -2 ...
  function foldIndex(i, lead, n) { let d = ((i - lead) % n + n) % n; if (d > n / 2) d -= n; return d; }
  function leadPetal(angle, n, rot) {
    // A petal at bend b points along b - PI/2 on screen.
    return ((Math.round((angle + Math.PI / 2 - rot) / (TAU / n)) % n) + n) % n;
  }
  // The heart pops between .2 and .32 s, overshooting to 1.25 before settling.
  function heartPop(age) {
    const k = (age - .2) / .12;
    if (k <= 0) return 0;
    if (k >= 1) return 1;
    return k < .55 ? 1.25 * (1 - Math.pow(1 - k / .55, 3)) : 1.25 - .25 * (.5 - .5 * Math.cos(Math.PI * (k - .55) / .45));
  }
  // Two or three jagged cracks race across the bud from the point it was struck, thick near the hit and fine at the
  // tips, with the flower's light leaking through. Drawn in the bud's own (current) frame as five batched strokes.
  const CRACKS = new Float64Array(3 * 6 * 2);
  function drawCracks(ctx, r, type, impact, seed, grow) {
    if (!(grow > 0)) return;
    const form = OPEN[type], c = FLOWERS[type], count = 2 + (seed & 1), side = impact + Math.PI, alpha = ctx.globalAlpha;
    const ox = Math.cos(side) * r * .94, oy = Math.sin(side) * r * .94;
    let reach = 0;
    for (let j = 0; j < count; j++) {
      const lane = count === 2 ? (j ? .5 : -.5) : j - 1;
      const heading = impact + lane * form.cracks * 1.6 + (hash01(seed, j + 40) - .5) * .25;
      const full = r * (lane === 0 ? 1.45 : 1.05) * (.85 + hash01(seed, j + 50) * .3);
      let x = ox, y = oy, left = full * grow, k = j * 12;
      CRACKS[k] = x; CRACKS[k + 1] = y;
      for (let s = 0; s < 5; s++) {
        const turn = heading + (s % 2 ? -1 : 1) * (.28 + hash01(seed, j * 7 + s + 60) * .4), step = Math.max(0, Math.min(left, full * CRACK_STEPS[s]));
        x += Math.cos(turn) * step; y += Math.sin(turn) * step; left -= step;
        CRACKS[k + 2 + s * 2] = x; CRACKS[k + 3 + s * 2] = y;
      }
      reach = count;
    }
    const trace = (from, to) => {
      ctx.beginPath();
      for (let j = 0; j < reach; j++) {
        const k = j * 12;
        ctx.moveTo(CRACKS[k + from * 2], CRACKS[k + from * 2 + 1]);
        for (let s = from + 1; s <= to; s++) ctx.lineTo(CRACKS[k + s * 2], CRACKS[k + s * 2 + 1]);
      }
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // A soft glow of the flower's light, then a dark seam and the bright crack itself, each thick at the root.
    trace(0, 5); ctx.strokeStyle = c.tip; ctx.globalAlpha = alpha * .45; ctx.lineWidth = 3.6; ctx.stroke();
    trace(0, 2); ctx.strokeStyle = c.dark; ctx.globalAlpha = alpha * .6; ctx.lineWidth = 2.5; ctx.stroke();
    trace(2, 5); ctx.lineWidth = 1.3; ctx.stroke();
    trace(0, 2); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = alpha; ctx.lineWidth = 1.5; ctx.stroke();
    trace(2, 5); ctx.lineWidth = .8; ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  // Curved wedges of the green casing fly off the struck side, spinning and falling: computed from age and the bud's
  // seed, never stored. They leave as the bud bursts, just after the white hit frame. Each wedge is an arc of the bud's
  // rim with a ragged inner edge; all of a bud's wedges are one path, filled and outlined once, then one highlight stroke.
  const SHARD_SPAN = .78;
  function shardPass(ctx, x, y, r, impact, seed, u, t, total, count, quality, highlight) {
    const side = impact + Math.PI;
    ctx.beginPath();
    for (let j = 0; j < count; j++) {
      const slot = quality >= 1 ? j * 2 : j;
      const dir = side + (total > 1 ? slot / (total - 1) - .5 : 0) * 2.2 + (hash01(seed, slot) - .5) * .35;
      const reach = 30 + hash01(seed, slot + 10) * 30, travel = reach * (1 - Math.pow(1 - u, 2.6));
      const px = x + Math.cos(dir) * (r * .8 + travel), py = y + Math.sin(dir) * (r * .8 + travel) + 200 * t * t;
      const size = Math.min(7.5, r * (.42 + hash01(seed, slot + 20) * .22)) * (1 - u * .3), spin = dir + (hash01(seed, slot + 30) - .5) * 30 * t;
      const cx = px - Math.cos(spin) * size * .55, cy = py - Math.sin(spin) * size * .55;
      if (highlight) {
        const from = spin - SHARD_SPAN * .7, radius = size * .82;
        ctx.moveTo(cx + Math.cos(from) * radius, cy + Math.sin(from) * radius); ctx.arc(cx, cy, radius, from, spin + SHARD_SPAN * .55);
      } else {
        ctx.moveTo(cx + Math.cos(spin - SHARD_SPAN) * size, cy + Math.sin(spin - SHARD_SPAN) * size);
        ctx.arc(cx, cy, size, spin - SHARD_SPAN, spin + SHARD_SPAN);
        ctx.lineTo(cx + Math.cos(spin + SHARD_SPAN * .4) * size * .45, cy + Math.sin(spin + SHARD_SPAN * .4) * size * .45);
        ctx.lineTo(cx + Math.cos(spin - SHARD_SPAN * .5) * size * .5, cy + Math.sin(spin - SHARD_SPAN * .5) * size * .5);
        ctx.closePath();
      }
    }
  }
  function drawShards(ctx, x, y, r, type, impact, seed, age, quality) {
    const t = age - .03;
    if (!(t >= 0 && t < .27) || quality >= 2) return;
    const total = 4 + (seed % 3 + 3) % 3, count = quality >= 1 ? Math.ceil(total / 2) : total;
    const u = t / .27, sepal = OPEN[type].sepal, alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * (u < .55 ? 1 : (1 - u) / .45); ctx.lineJoin = 'round';
    shardPass(ctx, x, y, r, impact, seed, u, t, total, count, quality, false);
    ctx.fillStyle = sepal[0]; ctx.fill(); ctx.strokeStyle = sepal[1]; ctx.lineWidth = .8; ctx.stroke();
    shardPass(ctx, x, y, r, impact, seed, u, t, total, count, quality, true);
    ctx.strokeStyle = sepal[2]; ctx.lineWidth = .9; ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  // Each layer's opening for one type and radius, baked into a sheet of frames with its lead petal pointing up and
  // turned into place when drawn: one drawImage instead of up to twelve petals and their highlights. The outer layer
  // has 24 frames from .03 s, the inner layer 19 from .12 s. Each frame is painted the first time a bloom reaches it.
  // Regular buds only (r <= 16); a boss's single bloom goes petal by petal.
  // At most twelve sheets are kept. A full cache only frees a sheet no bloom has drawn for a few seconds; otherwise the
  // new bloom goes petal by petal, so boards that mix sizes (gems, geodes) never make sheets churn. Bosses are not
  // cached at all, so they never push a sheet out.
  const SHEET_COLS = 6, SHEET_SCALE = 2.25, SHEET_MAX = 12, SHEET_IDLE = 180;
  const sheets = new Map();
  let sheetClock = 0;
  function sheetFor(layer, type, r) {
    const form = OPEN[type], outer = layer === 'outer';
    if (!(r <= 16) || (!outer && form.inner.ring)) return null;
    const key = `${layer}:${type}:${r.toFixed(2)}`;
    let sheet = sheets.get(key);
    if (sheet) { sheet.used = sheetClock; return sheet; }
    if (sheets.size >= SHEET_MAX) {
      let idleKey = null, idleAt = Infinity;
      for (const [name, entry] of sheets) if (entry.used < idleAt) { idleAt = entry.used; idleKey = name; }
      if (sheetClock - idleAt < SHEET_IDLE) return null;
      sheets.delete(idleKey);
    }
    const half = outer ? (r * form.reach * 1.12 + r * .5) * 1.12 : (r * form.inner.reach * 1.12 + 2) * 1.12;
    const frames = outer ? 24 : 19, cell = Math.ceil(half * 2 * SHEET_SCALE);
    const surface = makeSurface(cell * SHEET_COLS, cell * Math.ceil(frames / SHEET_COLS)), g = surface && surface.getContext('2d');
    if (!g) return null;
    sheet = { surface, g, type, outer, cell, half: cell / SHEET_SCALE / 2, frames, from: outer ? .03 : .12, step: outer ? .5 / 23 : .02, baked: new Uint8Array(frames), used: sheetClock };
    sheets.set(key, sheet);
    return sheet;
  }
  // The frame nearest this age, painted now if it never has been. Petals open in order from the lead (0, 1, -1, 2,
  // -2 ...): each grows from nothing and swings from its folded angle to its open one with a little overshoot, and an
  // outer petal catches the light as it arrives.
  function sheetFrame(sheet, sprite, age) {
    const k = clamp(Math.round((age - sheet.from) / sheet.step), 0, sheet.frames - 1);
    if (sheet.baked[k]) return k;
    sheet.baked[k] = 1;
    const g = sheet.g, cell = sheet.cell, h = sheet.half, form = OPEN[sheet.type], outer = sheet.outer, t = sheet.from + k * sheet.step;
    const n = outer ? form.count : form.inner.count, delay = outer ? .03 : .12, stagger = (outer ? .3 : .16) / n, span = outer ? .22 : .2;
    const twist = form.twist * (outer ? 1 : .6), wide = outer ? .5 : .55;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(k % SHEET_COLS * cell, Math.floor(k / SHEET_COLS) * cell, cell, cell);
    g.setTransform(SHEET_SCALE, 0, 0, SHEET_SCALE, (k % SHEET_COLS + .5) * cell, (Math.floor(k / SHEET_COLS) + .5) * cell);
    g.save(); g.beginPath(); g.rect(-h, -h, h * 2, h * 2); g.clip();
    g.imageSmoothingQuality = 'high';
    if (!outer) g.globalAlpha = form.inner.alpha;
    for (let i = 0; i < n; i++) {
      const d = foldIndex(i, 0, n), order = d > 0 ? d * 2 - 1 : -d * 2, p = (t - delay - order * stagger) / span;
      if (p <= 0) continue;
      const e = bloomBack(p, 1.7);
      g.save(); g.rotate(i * TAU / n - Math.sign(d) * twist * (1 - e)); g.scale(e * (wide + (1 - wide) * ease(p)), e); blit(g, sprite);
      if (outer && p < .45) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = .5 * (1 - p / .45) * (1 - p / .45); blit(g, sprite); }
      g.restore();
    }
    g.restore();
    return k;
  }
  function drawSheet(ctx, sheet, k, x, y, turn) {
    const cell = sheet.cell, h = sheet.half;
    setFrame(x, y, turn);
    ctx.setTransform(FRAME[0], FRAME[1], FRAME[2], FRAME[3], FRAME[4], FRAME[5]);
    ctx.drawImage(sheet.surface, k % SHEET_COLS * cell, Math.floor(k / SHEET_COLS) * cell, cell, cell, -h, -h, h * 2, h * 2);
  }
  // drawUnfurl(ctx, bud, age, {time, reducedMotion, quality}): one bloom, age seconds after bud.bloomAt.
  function drawUnfurl(ctx, bud, age, options) {
    if (!ctx || !bud) return;
    options = options || {};
    const type = FLOWERS[bud.type] ? bud.type : 'coral', r = Math.max(2, Number(bud.r) || 16);
    const x = Number(bud.x) || 0, y = Number(bud.y) || 0, variant = variantOf(bud);
    const time = Number.isFinite(options.time) ? options.time : (Number(bud.bloomAt) || 0) + (Number(age) || 0);
    age = Number(age);
    if (!(age < UNFURL)) { drawFlower(ctx, x, y, r, type, 1, time, variant); return; }
    if (!(age >= 0)) { drawFlower(ctx, x, y, r, type, 0, time, variant); return; }
    const still = Boolean(options.reducedMotion), quality = Number(options.quality) || 0;
    const impact = Number.isFinite(bud.impactAngle) ? bud.impactAngle : -Math.PI / 2, seed = seedOf(bud);
    const sprites = spritesFor(bud, type, r);
    ctx.save();
    if (!sprites.ready || !readBase(ctx)) {
      // No canvas to paint sprites into (node): the white frame, then the plain crossfade, with shards as paths.
      if (!still && age < FLASH) drawSilhouette(ctx, x, y, r, type, 1.08);
      else drawFlower(ctx, x, y, r, type, age / UNFURL, time, variant);
      ctx.restore();
      if (!still) { ctx.save(); drawShards(ctx, x, y, r, type, impact, seed, age, quality); ctx.restore(); }
      return;
    }
    const alpha = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    if (!still && age < FLASH) {
      // The hit frame: the whole bud in white, a touch larger.
      setFrame(x, y, 0); stamp(ctx, sprites.white, 0, 0, 0, r / Math.max(4, Math.round(r)) * 1.08, r / Math.max(4, Math.round(r)) * 1.08);
      ctx.setTransform(BASE[0], BASE[1], BASE[2], BASE[3], BASE[4], BASE[5]);
      drawShards(ctx, x, y, r, type, impact, seed, age, quality);
      ctx.restore();
      return;
    }
    const form = OPEN[type], phase = variant * .81, rot = Math.sin(phase) * .25, twist = still ? 0 : form.twist;
    setFrame(x, y, 0); stamp(ctx, sprites.stem, 0, 0, 0, 1, 1);
    // Outer petals: each grows from nothing and swings from its folded angle to its open one, overshooting a little.
    const n = form.count, outer = sprites.outer, lead = leadPetal(impact, n, rot), shine = !still && quality < 1, sheet = still ? null : sprites.sheet;
    const k = sheet ? sheetFrame(sheet, outer, age) : 0;
    if (sheet) sheet.used = sheetClock;
    if (k > 0) drawSheet(ctx, sheet, k, x, y, rot + lead * TAU / n);
    setFrame(x, y, rot);
    for (let i = 0; i < n && !sheet; i++) {
      const d = foldIndex(i, lead, n), order = d > 0 ? d * 2 - 1 : -d * 2;
      const p = (age - .03 - order * .3 / n) / .22;
      if (p <= 0) continue;
      const e = bloomBack(p, 1.7), length = 1 + Math.sin(i * 7.3 + phase) * .045, angle = i * TAU / n - Math.sign(d) * twist * (1 - e);
      stamp(ctx, outer, 0, 0, angle, e * (.5 + .5 * ease(p)), e * length);
      // Each petal catches the light as it arrives.
      if (shine && p < .45) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * .5 * (1 - p / .45) * (1 - p / .45);
        ctx.drawImage(outer.surface, outer.x, outer.y, outer.w, outer.h);
        ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha;
      }
    }
    // The inner layer follows from .12 s in the same order, from its own petal nearest the hit: from a sheet, or petal
    // by petal for a boss. The sky's white ring, and every layer with animations off, opens as one rosette.
    const inner = form.inner, m = inner.count, p = (age - .12) / .2, innerSheet = still ? null : sprites.innerSheet;
    const first = inner.ring ? 0 : leadPetal(impact, m, rot + inner.offset * TAU / m);
    if (innerSheet) {
      const j = sheetFrame(innerSheet, sprites.innerPetal, age);
      innerSheet.used = sheetClock;
      if (j > 0) drawSheet(ctx, innerSheet, j, x, y, rot + (first + inner.offset) * TAU / m);
    } else if (!still && sprites.innerPetal) {
      setFrame(x, y, rot); ctx.globalAlpha = alpha * inner.alpha;
      for (let i = 0; i < m; i++) {
        const d = foldIndex(i, first, m), order = d > 0 ? d * 2 - 1 : -d * 2, q = (age - .12 - order * .16 / m) / .2;
        if (q <= 0) continue;
        const e = bloomBack(q, 1.7);
        stamp(ctx, sprites.innerPetal, 0, 0, (i + inner.offset) * TAU / m - Math.sign(d) * twist * .6 * (1 - e), e * (.55 + .45 * ease(q)), e);
      }
      ctx.globalAlpha = alpha;
    } else if (p > 0) {
      const e = bloomBack(p, 1.7);
      setFrame(x, y, rot); stamp(ctx, sprites.inner, 0, 0, -twist * .5 * (1 - e), e, e);
    }
    // The closed bud squashes along the hit and cracks, then pops like a bubble over the petals pushing out.
    const burst = (age - .065) / .06, budAlpha = burst <= 0 ? 1 : 1 - Math.pow(clamp(burst, 0, 1), 1.6);
    if (budAlpha > 0) {
      const squash = still ? 0 : Math.sin(Math.PI * clamp(age / .1, 0, 1)) * .15, swell = 1 + .2 * ease(burst);
      // BASE x translate(x, y) x rotate(impact) x scale(along, across) x rotate(-impact)
      const ci = Math.cos(impact), si = Math.sin(impact), sa = (1 - squash) * swell, sc = (1 + squash * .7) * swell;
      const a = ci * ci * sa + si * si * sc, b = ci * si * (sa - sc), d = si * si * sa + ci * ci * sc;
      setFrame(x, y, 0);
      ctx.setTransform(FRAME[0] * a + FRAME[2] * b, FRAME[1] * a + FRAME[3] * b, FRAME[0] * b + FRAME[2] * d, FRAME[1] * b + FRAME[3] * d, FRAME[4], FRAME[5]);
      ctx.globalAlpha = alpha * budAlpha;
      blit(ctx, sprites.closed);
      if (!still) drawCracks(ctx, r, type, impact, seed, ease((age - FLASH * .5) / .035));
      ctx.globalAlpha = alpha;
    }
    // The heart pops last.
    const pop = still ? (age >= .2 ? 1 : 0) : heartPop(age);
    if (pop > 0) { setFrame(x, y, rot); stamp(ctx, sprites.heart, 0, 0, 0, pop, pop); }
    if (!still) { ctx.setTransform(BASE[0], BASE[1], BASE[2], BASE[3], BASE[4], BASE[5]); drawShards(ctx, x, y, r, type, impact, seed, age, quality); }
    // The last few frames melt into the resting sprite, so the hand-off at .55 s has no jump.
    if (age > UNFURL - .05) {
      ctx.setTransform(BASE[0], BASE[1], BASE[2], BASE[3], BASE[4], BASE[5]);
      ctx.globalAlpha = alpha * clamp((age - (UNFURL - .05)) / .05, 0, 1);
      drawFlower(ctx, x, y, r, type, 1, time, variant);
    }
    ctx.restore();
  }
  // Which fresh blooms get the full unfurl this frame: those closest to done, up to the budget. The rest crossfade.
  function pickUnfurls(buds, time, options) {
    sheetClock++; // once per drawn frame: how recently each sheet was used
    unfurlPick.clear();
    if (options.reducedMotion) return unfurlPick;
    const limit = (Number(options.quality) || 0) >= 2 ? UNFURL_LOW : UNFURL_MAX;
    for (const bud of buds) {
      if (!bud || !bud.bloomed || bud.gift || bud.puff || typeof bud.bloomAt !== 'number') continue;
      const age = time - bud.bloomAt;
      if (age >= 0 && age < UNFURL) unfurlPool.push(bud);
    }
    if (unfurlPool.length > limit) unfurlPool.sort((a, b) => a.bloomAt - b.bloomAt);
    for (let i = 0; i < unfurlPool.length && i < limit; i++) unfurlPick.add(unfurlPool[i]);
    unfurlPool.length = 0;
    return unfurlPick;
  }
  // The one group that will reach the danger line soonest, if it gets there within .8 s.
  function findTremble(state) {
    trembleKey = null; trembleTime = 1;
    const line = Number(state.dangerY);
    if (state.mode !== 'rush' || state.scripted || !(line > 0) || state.lullaby > 0 || state.status === 'won' || state.status === 'lost') return;
    const speed = Number(state.descentSpeed) || 0;
    let best = .8;
    for (const bud of Array.isArray(state.buds) ? state.buds : []) {
      if (!bud || bud.bloomed || bud.gift || bud.puff || !Number.isFinite(bud.y)) continue;
      const t = (line - (bud.y + (Number(bud.r) || 11))) / Math.max(1, speed * (Number(bud.fall) || 1));
      if (t < best) { best = t; trembleKey = bud.group == null ? bud : bud.group; trembleTime = t; }
    }
  }
  function trembles(bud) { return trembleKey !== null && !bud.bloomed && !bud.gift && !bud.puff && (bud.group == null ? bud : bud.group) === trembleKey; }
  // The finale sweep: each bloomed flower flares with gold light and a white glint as feel's wave passes it. The glows
  // are added in one 'lighter' pass; the glints, which grow and shrink as they twinkle, are one path and one fill.
  function drawFlares(ctx, buds, time, options) {
    if (options.reducedMotion) return;
    const glints = !((Number(options.quality) || 0) >= 1);
    let started = false, glow = null, alpha = 1, op = 'source-over', shine = 0;
    for (const bud of buds) {
      if (!bud || typeof bud.flareAt !== 'number') continue;
      const age = time - bud.flareAt;
      if (!(age >= 0 && age < .35)) continue;
      const q = age / .35, r = Number(bud.r) || 13, x = Number(bud.x) || 0, y = Number(bud.y) || 0, radius = r * (1.6 + q);
      if (!started) { started = true; ctx.save(); alpha = ctx.globalAlpha; op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; glow = goldSprite(); }
      ctx.globalAlpha = alpha * (1 - q);
      if (glow) dab(ctx, glow, x, y, radius / 40);
      else circle(ctx, x, y, radius * .55, 'rgba(255,236,170,.6)');
      if (glints && q < 2 / 3) shine++;
    }
    if (!started) return;
    ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha;
    if (shine) {
      // The glint catches the upper right petal.
      ctx.beginPath();
      for (const bud of buds) {
        if (!bud || typeof bud.flareAt !== 'number') continue;
        const q = (time - bud.flareAt) / .35, r = Number(bud.r) || 13;
        if (!(q >= 0 && q < 2 / 3)) continue;
        const twinkle = Math.sin(Math.PI * q * 1.5);
        if (twinkle > .02) starPath(ctx, (Number(bud.x) || 0) + r * .42, (Number(bud.y) || 0) - r * .46, r * .95 * twinkle, q * .9);
      }
      ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.restore();
  }
  function budById(buds, id) {
    for (let i = 0; i < buds.length; i++) if (buds[i] && buds[i].id === id) return buds[i];
    return null;
  }
  // Chains you can see: each queued bloom that knows its source draws how the bloom travels to it. Links are gathered
  // first (up to the budget) and then drawn kind by kind, so each stroke style is one call for all links of a kind;
  // every lit head is then added in one pass.
  const LINK_ITEM = [], LINK_TARGET = [], LINK_SLOT = [], HEADS = [], RINGS = [];
  const KIND_PUFF = 1, KIND_BOSS = 2, KIND_SUN = 4, KIND_RELAY = 8;
  const kindOf = item => item.via === 'puff' ? KIND_PUFF : item.via === 'boss' ? KIND_BOSS : item.via === 'sun' ? KIND_SUN : KIND_RELAY;
  // Where link i stands: its ends (L.fx, L.fy, L.tx, L.ty) and its eased progress k from item.at to item.when.
  const L = { fx: 0, fy: 0, tx: 0, ty: 0, k: 0, n: 0 };
  function linkAt(i, time) {
    const item = LINK_ITEM[i], target = LINK_TARGET[i];
    const at = Number.isFinite(item.at) ? item.at : time, when = Number.isFinite(item.when) ? item.when : time;
    L.fx = item.from.x; L.fy = item.from.y; L.tx = target.x; L.ty = target.y; L.n = LINK_SLOT[i];
    L.k = when > at ? clamp((time - at) / (when - at), 0, 1) : 1;
    return L;
  }
  // A relay arc bends 40 px off the straight line, always to the upper side.
  function relayBend(l) {
    const dx = l.tx - l.fx, dy = l.ty - l.fy, dist = Math.hypot(dx, dy) || 1, nx = dy / dist, ny = -dx / dist, flip = ny > 0 ? -1 : 1;
    PT.x = (l.fx + l.tx) / 2 + nx * 40 * flip; PT.y = (l.fy + l.ty) / 2 + ny * 40 * flip;
    return PT;
  }
  function beadPath(ctx, x, y, radius) { ctx.moveTo(x + radius, y); ctx.arc(x, y, radius, 0, TAU); }
  function drawChainLinks(ctx, state, time, options) {
    if (!ctx || !state) return;
    options = options || {};
    const pending = state.pending, quality = Number(options.quality) || 0;
    if (!Array.isArray(pending) || !pending.length || quality >= 2) return;
    const buds = Array.isArray(state.buds) ? state.buds : [], limit = quality >= 1 ? 12 : 24, still = Boolean(options.reducedMotion);
    time = Number(time) || 0;
    let count = 0, kinds = 0;
    for (let n = 0; n < pending.length && count < limit; n++) {
      const item = pending[n], from = item && item.from;
      if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.y)) continue;
      const target = budById(buds, item.id);
      if (!target || target.bloomed || !Number.isFinite(target.x) || !Number.isFinite(target.y)) continue;
      LINK_ITEM[count] = item; LINK_TARGET[count] = target; LINK_SLOT[count] = n; count++;
      kinds |= kindOf(item);
    }
    if (!count) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (still) {
      // Animations off: a faint dotted thread for as long as each bloom is on its way.
      ctx.setLineDash(LINK_DOTS); ctx.globalAlpha = .4; ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i < count; i++) { ctx.moveTo(LINK_ITEM[i].from.x, LINK_ITEM[i].from.y); ctx.lineTo(LINK_TARGET[i].x, LINK_TARGET[i].y); }
      ctx.stroke();
    } else {
      HEADS.length = 0;
      if (kinds & KIND_BOSS) {
        // A stream of gold pours from the big bloom toward each flower: a soft band with bright dashes flowing outward.
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (kindOf(LINK_ITEM[i]) !== KIND_BOSS) continue;
          const l = linkAt(i, time), e = ease(l.k), hx = l.fx + (l.tx - l.fx) * e, hy = l.fy + (l.ty - l.fy) * e;
          ctx.moveTo(l.fx, l.fy); ctx.lineTo(hx, hy); HEADS.push(hx, hy, 12, .85, l.n);
        }
        ctx.globalAlpha = .3; ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 6; ctx.stroke();
        ctx.setLineDash(STREAM_WIDE); ctx.lineDashOffset = -time * 110; ctx.globalAlpha = .9; ctx.strokeStyle = '#ffc531'; ctx.lineWidth = 2.6; ctx.stroke();
        ctx.setLineDash(STREAM_FINE); ctx.lineDashOffset = -time * 170; ctx.globalAlpha = 1; ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0;
      }
      if (kinds & KIND_SUN) {
        // A straight ray of sunlight with a bright head, its tail catching up.
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (kindOf(LINK_ITEM[i]) !== KIND_SUN) continue;
          const l = linkAt(i, time), e = ease(l.k), tail = Math.max(0, e - .5), dx = l.tx - l.fx, dy = l.ty - l.fy;
          ctx.moveTo(l.fx + dx * tail, l.fy + dy * tail); ctx.lineTo(l.fx + dx * e, l.fy + dy * e); HEADS.push(l.fx + dx * e, l.fy + dy * e, 12, 1, l.n);
        }
        ctx.globalAlpha = .4; ctx.strokeStyle = '#ffc93a'; ctx.lineWidth = 5; ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = '#ffe680'; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.strokeStyle = '#fffdf0'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (kinds & KIND_RELAY) {
        // A relay: a gold spark hops along an arc to the next flower in its cluster, three dots trailing it.
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (kindOf(LINK_ITEM[i]) !== KIND_RELAY) continue;
          const l = linkAt(i, time), bend = relayBend(l), cx = bend.x, cy = bend.y, e = smooth(l.k);
          for (let s = 0; s <= 10; s++) {
            const p = quadAt(Math.max(0, e - .45) + Math.min(e, .45) * s / 10, l.fx, l.fy, cx, cy, l.tx, l.ty);
            if (s) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          }
          const head = quadAt(e, l.fx, l.fy, cx, cy, l.tx, l.ty);
          HEADS.push(head.x, head.y, 11, 1, l.n);
        }
        ctx.globalAlpha = .4; ctx.strokeStyle = '#ffc93a'; ctx.lineWidth = 3.4; ctx.stroke();
        ctx.globalAlpha = .9; ctx.strokeStyle = '#fff3b8'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#fff8d8'; ctx.lineWidth = .6;
        for (let j = 3; j >= 1; j--) {
          ctx.beginPath();
          for (let i = 0; i < count; i++) {
            if (kindOf(LINK_ITEM[i]) !== KIND_RELAY) continue;
            const l = linkAt(i, time), bend = relayBend(l), p = quadAt(Math.max(0, smooth(l.k) - j * .09), l.fx, l.fy, bend.x, bend.y, l.tx, l.ty);
            beadPath(ctx, p.x, p.y, 2.7 - j * .45);
          }
          ctx.globalAlpha = 1 - j * .2; ctx.fill(); ctx.stroke();
        }
      }
      if (kinds & KIND_PUFF) {
        // One cloud of spores swells from each puffcap out to its reach, and a spore drifts to each flower it touches.
        // The cloud ends exactly at the puff's reach (PUFF_REACH in rush.js), so it shows which flowers it catches.
        RINGS.length = 0;
        const reach = Number(root.BloomRush && root.BloomRush.PUFF_REACH) || SPORE_REACH;
        for (let i = 0; i < count; i++) {
          if (kindOf(LINK_ITEM[i]) !== KIND_PUFF) continue;
          const l = linkAt(i, time), at = Number.isFinite(LINK_ITEM[i].at) ? LINK_ITEM[i].at : time;
          let seen = false;
          for (let r = 0; r < RINGS.length && !seen; r += 3) seen = RINGS[r] === l.fx && RINGS[r + 1] === l.fy && RINGS[r + 2] === at;
          if (seen) continue;
          RINGS.push(l.fx, l.fy, at);
          const u = clamp((time - at) / .4, 0, 1), radius = 8 + ease(u) * (reach - 8), fade = 1 - u * u;
          if (!(fade > .004)) continue;
          ctx.beginPath(); ctx.arc(l.fx, l.fy, radius, 0, TAU);
          ctx.globalAlpha = .28 * fade; ctx.lineWidth = 9; ctx.strokeStyle = '#fff3d6'; ctx.stroke();
          ctx.setLineDash(SPORE_RING); ctx.lineDashOffset = -time * 14;
          ctx.globalAlpha = .55 * fade; ctx.lineWidth = 4.2; ctx.strokeStyle = '#a77b52'; ctx.stroke();
          ctx.globalAlpha = .95 * fade; ctx.lineWidth = 2.8; ctx.strokeStyle = '#fff6e2'; ctx.stroke();
          ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0;
        }
        ctx.fillStyle = '#fff6e4'; ctx.strokeStyle = '#9c7149';
        for (let j = 3; j >= 0; j--) {
          ctx.beginPath();
          for (let i = 0; i < count; i++) {
            if (kindOf(LINK_ITEM[i]) !== KIND_PUFF) continue;
            const l = linkAt(i, time), dx = l.tx - l.fx, dy = l.ty - l.fy, dist = Math.hypot(dx, dy) || 1;
            const e = ease(l.k), wob = Math.sin(l.k * Math.PI * 3 + l.n) * 4 * (1 - l.k) * (1 - j * .2), s = Math.max(0, e - j * .08);
            beadPath(ctx, l.fx + dx * s - dy / dist * wob, l.fy + dy * s + dx / dist * wob, j ? 2.2 - j * .4 : 3.1);
          }
          ctx.globalAlpha = j ? .7 - j * .17 : 1; ctx.lineWidth = j ? .7 : 1; ctx.fill(); ctx.stroke();
        }
      }
      if (HEADS.length) {
        // Every head glows in one additive pass, each pulsing a little.
        const head = headSprite();
        ctx.globalCompositeOperation = 'lighter';
        for (let h = 0; h < HEADS.length; h += 5) {
          const x = HEADS[h], y = HEADS[h + 1], radius = HEADS[h + 2] * (1 + .12 * Math.sin(time * 31 + HEADS[h + 4] * 1.7));
          ctx.globalAlpha = HEADS[h + 3];
          if (head) dab(ctx, head, x, y, radius / 40);
          else circle(ctx, x, y, radius * .55, 'rgba(255,236,170,.6)');
        }
      }
    }
    ctx.restore();
    LINK_ITEM.length = 0; LINK_TARGET.length = 0; LINK_SLOT.length = 0;
  }
  function drawBumper(ctx, bumper, selected, time, colors, reducedMotion) {
    const x = Number(bumper.x) || 0, y = Number(bumper.y) || 0;
    const length = Number(bumper.length) || 62;
    let a = Number(bumper.angle) || 0;
    if (!reducedMotion && typeof bumper.fromAngle === 'number' && typeof bumper.rotateAt === 'number') {
      const progress = ease((time - bumper.rotateAt) / .19);
      let delta = a - bumper.fromAngle;
      if (delta < -Math.PI) delta += TAU;
      if (delta > Math.PI) delta -= TAU;
      a = bumper.fromAngle + delta * progress;
    }
    ctx.save(); ctx.translate(x, y);
    const half = length / 2 + 4.5;
    // A soft cream halo sits behind the petal so it reads on every scene, light or dark; while it can be turned it
    // breathes slowly, which is the cue that it is something to tap.
    const breathe = selected && !reducedMotion ? .5 + Math.sin(time * 2.6) * .5 : .5;
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, half + 12);
    halo.addColorStop(0, `rgba(255,250,232,${.42 + breathe * .2})`); halo.addColorStop(.62, `rgba(255,248,226,${.18 + breathe * .12})`); halo.addColorStop(1, 'rgba(255,248,226,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, half + 12, 0, TAU); ctx.fill();
    if (selected) {
      // The turn ring: cream dashes over a darker shadow, and an arrow showing which way it swings.
      ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(0, .8, length * .62, 0, TAU); ctx.strokeStyle = 'rgba(16,52,44,.38)'; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, length * .62, 0, TAU); ctx.strokeStyle = 'rgba(255,250,236,.95)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      ctx.rotate(a - .55);
      const r = length * .62;
      ctx.beginPath(); ctx.moveTo(r - 5, -6); ctx.lineTo(r, 0); ctx.lineTo(r + 5, -6);
      ctx.strokeStyle = 'rgba(16,52,44,.5)'; ctx.lineWidth = 4.2; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 2.2; ctx.stroke(); ctx.restore();
    }
    ctx.rotate(a);
    const jade = ctx.createLinearGradient(-half * .3, -9, half * .25, 9);
    jade.addColorStop(0, '#e2fff3'); jade.addColorStop(.24, '#8ef0cd'); jade.addColorStop(.52, '#2fcc9f'); jade.addColorStop(1, '#0f8c72');
    // Two leaf lobes retain the same paddle span while giving it a made object identity. The drawn leaf is a little
    // fuller than its bounce line, the way a sticker is; the bounce itself is unchanged.
    const lobes = () => {
      ctx.beginPath(); ctx.moveTo(-half, 0);
      ctx.bezierCurveTo(-half * .8, -8.2, -half * .23, -10.6, 0, -6.9);
      ctx.bezierCurveTo(half * .31, -9.7, half * .84, -7.4, half, 0);
      ctx.bezierCurveTo(half * .7, 8.3, half * .25, 9.5, 0, 6.9);
      ctx.bezierCurveTo(-half * .32, 9.8, -half * .87, 7.8, -half, 0); ctx.closePath();
    };
    // A cream sticker edge with a soft contact shadow lifts it off the scene.
    lobes(); ctx.shadowColor = 'rgba(14,44,36,.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 5.4; ctx.stroke(); ctx.shadowColor = 'transparent';
    lobes(); ctx.fillStyle = jade; ctx.fill();
    ctx.strokeStyle = '#0d6a5c'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-half + 3, -1);
    ctx.bezierCurveTo(-half * .62, -6.6, -half * .27, -8.1, -9, -5.8);
    ctx.moveTo(9, -5.8); ctx.bezierCurveTo(half * .37, -7.6, half * .74, -6.1, half - 3, -.9);
    ctx.strokeStyle = 'rgba(239,255,241,.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    // Incised veins angle toward each leaf tip from a fine brass central rib.
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const p = side * (10 + i * (half - 17) / 4);
      const height = (1 - Math.abs(p) / half) * 7 + .5;
      ctx.beginPath(); ctx.moveTo(p, -.4); ctx.quadraticCurveTo(p + side * 3, -height * .62, p + side * 6, -height);
      ctx.moveTo(p, .6); ctx.quadraticCurveTo(p + side * 3, height * .65, p + side * 6, height);
      ctx.strokeStyle = 'rgba(4,122,105,.48)'; ctx.lineWidth = .6; ctx.stroke();
    }
    const brass = ctx.createLinearGradient(0, -2, 0, 2);
    brass.addColorStop(0, '#ffedbb'); brass.addColorStop(.4, '#e6bd67'); brass.addColorStop(1, '#ac813d');
    roundRect(ctx, -half + 2, -1, (half - 2) * 2, 2, 1); ctx.fillStyle = brass; ctx.fill();
    circle(ctx, 0, 0, 7.8, '#ba8f49', '#f7dfa0', .8);
    circle(ctx, -.25, -.3, 6.1, '#f0d28c', '#a78449', .7);
    circle(ctx, 0, 0, 3.8, '#3eb392', '#f7e5b4', .75);
    ctx.beginPath(); ctx.moveTo(-1.7, .2); ctx.quadraticCurveTo(-.1, -2.1, 1.6, -.5); ctx.quadraticCurveTo(.7, 1.7, -1.7, .2);
    ctx.strokeStyle = '#eeffce'; ctx.lineWidth = .65; ctx.stroke();
    ctx.restore();
  }

  function drawLauncher(ctx, state, time, colors, style, kick, reducedMotion) {
    const x = (state.launcher && Number(state.launcher.x)) || 210;
    const y = (state.launcher && Number(state.launcher.y)) || 498;
    const rush = state.mode === 'rush';
    const left = rush ? (state.lives == null ? 3 : state.lives) : state.shotsLeft == null ? 3 : state.shotsLeft;
    const k = reducedMotion ? 0 : clamp(Number(kick) || 0, 0, 1), next = FLOWERS[state.nextType];
    ctx.save();
    // A shot pushes the pod down and wide for a blink before it springs back, with a puff of air around it.
    if (k > 0) {
      circle(ctx, x, y, 20 + (1 - k) * 18, null, next ? next.light : '#ffffff', 3 * k);
      ctx.translate(x, y); ctx.scale(1 + .13 * k, 1 - .13 * k); ctx.translate(-x, -y);
    }
    ctx.shadowColor = '#12bcc199'; ctx.shadowBlur = 16;
    circle(ctx, x, y + 2, 22, 'rgba(5,155,150,.15)');
    circle(ctx, x, y, 19.5, '#50d7bb', '#ffffff', 1.5);
    circle(ctx, x, y, 14.7, '#d6ffee', '#9be9d8', 1);
    ctx.shadowColor = 'transparent';
    if (next && rush && !state.armed && state.status !== 'lost' && state.status !== 'won') circle(ctx, x, y, 17.1, null, next.base, 2.2);
    if (rush && state.armed && POWER_TINT[state.armed] && state.status !== 'lost' && state.status !== 'won') {
      // An armed powerup sits in the launcher in place of the seed, with a ring that breathes.
      const beat = .5 + Math.sin(time * 5) * .5;
      circle(ctx, x, y, 22 + beat * 3, null, POWER_TINT[state.armed], 2.4);
      drawPowerIcon(ctx, state.armed, x, y, 12.5, time);
    } else if (state.status === 'aiming' || !state.status || (rush && state.status !== 'lost')) drawSeed(ctx, x, y, 8.4, time, false, style);
    ctx.fillStyle = colors.ink; ctx.globalAlpha = .7;
    for (let i = 0; i < 3; i++) {
      const px = x + (i - 1) * (rush ? 11 : 9);
      if (rush) {
        ctx.beginPath(); ctx.moveTo(px, y + 30);
        ctx.bezierCurveTo(px - 7, y + 26, px - 3, y + 21, px, y + 25);
        ctx.bezierCurveTo(px + 3, y + 21, px + 7, y + 26, px, y + 30);
        ctx.fillStyle = i < left ? '#ef668e' : 'rgba(255,255,255,.40)'; ctx.fill();
        ctx.strokeStyle = i < left ? '#c8517a' : 'rgba(143,178,171,.7)'; ctx.lineWidth = .65; ctx.stroke();
      } else if (i < left) {
        ctx.beginPath(); ctx.ellipse(px, y + 27, 1.9, 3, .45, 0, TAU); ctx.fill();
      } else circle(ctx, px, y + 27, 1.7, null, colors.fine, .7);
    }
    ctx.restore();
  }

  // Rush tempo: as the multiplier climbs, warm light streams up the glasshouse and its edges glow.
  // Stateless (a function of time), so it costs nothing to keep and nothing to reset.
  function drawTempo(ctx, state, time) {
    const heat = clamp((Number(state.tempo) || 1) - 1, 0, 1);
    if (!(heat > 0) || state.status === 'lost') return;
    // Normal blending: additive light vanishes against the bright meadow sky.
    ctx.save(); ctx.lineCap = 'round';
    const count = 5 + Math.round(heat * 13), speed = 170 + heat * 280;
    for (let i = 0; i < count; i++) {
      const x = 34 + (i * 137.508) % 352, length = 16 + heat * 34 + (i % 3) * 9;
      const y = 610 - ((time * speed * (.75 + (i % 4) * .12) + i * 211.7) % 720);
      const streak = ctx.createLinearGradient(x, y, x, y + length);
      streak.addColorStop(0, 'rgba(255,214,120,0)'); streak.addColorStop(.35, `rgba(255,206,104,${.22 + heat * .3})`); streak.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.strokeStyle = streak; ctx.lineWidth = 1.4 + (i % 2) * .9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + length); ctx.stroke();
    }
    const glow = .10 + heat * .22 + Math.sin(time * 5.5) * .03 * heat;
    for (const side of [0, 1]) {
      const edge = ctx.createLinearGradient(side ? 420 : 0, 0, side ? 386 : 34, 0);
      edge.addColorStop(0, `rgba(255,190,90,${glow})`); edge.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = edge; ctx.fillRect(side ? 386 : 0, 0, 34, 560);
    }
    ctx.restore();
  }

  // How close the lowest open flower is to the line, from 0 (far) to 1 (touching).
  function threatOf(state, y) {
    let threat = 0;
    for (const bud of Array.isArray(state.buds) ? state.buds : []) {
      if (!bud || bud.bloomed || bud.gift || !Number.isFinite(bud.y)) continue;
      threat = Math.max(threat, clamp(1 - (y - bud.y - (Number(bud.r) || 11)) / 110, 0, 1));
    }
    return threat;
  }
  function drawRushBoundary(ctx, state, theme, time, reducedMotion) {
    const y = clamp(Number(state.dangerY) || 448, 100, 510);
    const night = theme === 'moon' || Boolean(root.BloomScenery && root.BloomScenery.dark(theme));
    const threat = state.status === 'lost' || state.status === 'won' ? 0 : threatOf(state, y);
    // A heartbeat: two quick swells, then a rest, quicker the closer the flowers are.
    const beat = reducedMotion ? .5 : Math.pow(Math.max(0, Math.sin((Number(time) || 0) * (5 + threat * 5))), 6);
    const heat = Math.pow(threat, 1.5) * (.5 + .5 * beat);
    ctx.save();
    const reach = 15 + heat * 70;
    const warning = ctx.createLinearGradient(0, y - reach, 0, y + 33);
    warning.addColorStop(0, 'rgba(255,60,110,0)'); warning.addColorStop(.34 + heat * .36, `rgba(255,60,110,${.08 + heat * .5})`); warning.addColorStop(1, 'rgba(255,60,110,0)');
    ctx.fillStyle = warning; ctx.fillRect(22, y - reach, 376, reach + 33);
    if (heat > .05) { ctx.shadowColor = `rgba(255,50,100,${Math.min(1, heat * 1.3)})`; ctx.shadowBlur = 6 + heat * 14; }
    ctx.beginPath(); ctx.moveTo(24, y + .8); ctx.lineTo(396, y + .8);
    ctx.strokeStyle = night ? 'rgba(255,234,238,.55)' : 'rgba(255,255,255,.9)'; ctx.lineWidth = 3 + heat * 2.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(396, y);
    ctx.setLineDash([8, 5]); ctx.lineDashOffset = reducedMotion ? 0 : -(Number(time) || 0) * (8 + threat * 30);
    ctx.strokeStyle = heat > .3 ? '#ff3d6e' : night ? '#ff91b1' : '#e86189'; ctx.lineWidth = 1.6 + heat * 1.6; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    for (const x of [28, 392]) {
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath();
      ctx.fillStyle = night ? '#ffd8e5' : '#e86189'; ctx.fill();
    }
    ctx.font = '600 11px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (heat > .05) { ctx.translate(210, y + 15); ctx.scale(1 + heat * .14, 1 + heat * .14); ctx.translate(-210, -y - 15); }
    // Painted level scenes are busy behind the label, so it sits on its own little tag there.
    if (root.BloomScenery && root.BloomScenery.has(theme)) {
      const w = ctx.measureText('Danger line').width + 16;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(210 - w / 2, y + 6.5, w, 17, 8.5); else ctx.rect(210 - w / 2, y + 6.5, w, 17);
      ctx.fillStyle = night ? 'rgba(38,24,58,.82)' : 'rgba(255,250,240,.94)'; ctx.fill();
      ctx.strokeStyle = night ? 'rgba(255,145,177,.65)' : 'rgba(232,97,137,.6)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.fillStyle = night ? '#ffcedd' : '#a54164'; ctx.fillText('Danger line', 210, y + 15);
    ctx.restore();
  }

  // An acorn cup worn under a bud: shots from below glance off it, so it shows exactly which side is guarded.
  function drawCup(ctx, bud) {
    const r = (Number(bud.r) || 11) + 3.2, x = bud.x, y = bud.y + 1.5;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.bezierCurveTo(x - r, y + r * 1.15, x + r, y + r * 1.15, x + r, y); ctx.closePath();
    ctx.fillStyle = '#b5804a'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(110,64,28,.75)'; ctx.lineWidth = .9;
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath(); ctx.moveTo(x + k * 4.6 - 8, y); ctx.lineTo(x + k * 4.6 + 6, y + r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + k * 4.6 + 8, y); ctx.lineTo(x + k * 4.6 - 6, y + r); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(80,44,18,.28)'; ctx.fillRect(x, y, r + 2, r * 1.2);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.bezierCurveTo(x - r, y + r * 1.15, x + r, y + r * 1.15, x + r, y);
    ctx.strokeStyle = '#5a3417'; ctx.lineWidth = 1.5; ctx.stroke();
    roundRect(ctx, x - r - 1.5, y - 2.6, r * 2 + 3, 4.6, 2.3); ctx.fillStyle = '#dcaa70'; ctx.fill(); ctx.strokeStyle = '#5a3417'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r + 2, y - 1.2); ctx.lineTo(x - 2, y - 1.2); ctx.strokeStyle = 'rgba(255,240,210,.8)'; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  // A puffcap: a round little mushroom that bursts in a spore cloud and blooms everything around it.
  function drawPuffcap(ctx, bud, time, still) {
    const r = Number(bud.r) || 12, x = bud.x, y = bud.y, breathe = still ? 1 : 1 + Math.sin(time * 3.1 + x * .05) * .04;
    ctx.save(); ctx.translate(x, y); ctx.scale(breathe, 1 / breathe);
    circle(ctx, 0, 1, r + 6, 'rgba(255,240,200,.16)');
    ctx.beginPath(); ctx.moveTo(-r * .45, r * .55); ctx.quadraticCurveTo(0, r * 1.15, r * .45, r * .55); ctx.closePath(); ctx.fillStyle = '#e8d2b0'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * .9, 0, 0, TAU); ctx.fillStyle = '#fff4e2'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.beginPath(); ctx.ellipse(r * .25, r * .3, r, r * .9, 0, 0, TAU); ctx.rect(-r * 2, -r * 2, r * 4, r * 4); ctx.fillStyle = '#efd9bb'; ctx.fill('evenodd'); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * .9, 0, 0, TAU); ctx.strokeStyle = '#9a6e4c'; ctx.lineWidth = 1.5; ctx.stroke();
    for (const [sx, sy, sr] of [[-.42, .1, .13], [.38, .28, .1], [.1, .5, .09], [-.15, -.42, .08]]) circle(ctx, sx * r, sy * r, sr * r, '#e2c69f');
    // The pore on top, where the spores come out.
    ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5; ctx.lineTo(Math.cos(a) * 3.2, -r * .55 + Math.sin(a) * 2.2); ctx.lineTo(Math.cos(a + TAU / 10) * 1.3, -r * .55 + Math.sin(a + TAU / 10) * .9); }
    ctx.closePath(); ctx.fillStyle = '#b8875e'; ctx.fill();
    ctx.beginPath(); ctx.arc(-r * .35, -r * .3, r * .32, 3.5, 4.6); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  // A boss bloom sits on two big leaves, wears a crown and shows its hits left as a ring of segments.
  function drawBossLeaves(ctx, bud, time, still) {
    const r = Number(bud.r) || 24, sway = still ? 0 : Math.sin(time * 1.6) * .06;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(bud.x + side * r * .35, bud.y + r * .55); ctx.rotate(side * (1.05 + sway));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-r * .45, -r * .35, -r * .35, -r * 1.05, 0, -r * 1.25); ctx.bezierCurveTo(r * .38, -r * 1.02, r * .45, -r * .35, 0, 0);
      ctx.fillStyle = '#52b86a'; ctx.fill(); ctx.strokeStyle = '#256b3f'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(r * .05, -r * .6, 0, -r * 1.1); ctx.strokeStyle = 'rgba(220,255,210,.7)'; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.restore();
    }
  }
  function drawBossFace(ctx, bud, time, still) {
    const r = Number(bud.r) || 24, blink = still ? 1 : (time % 3.4 < .12 ? .15 : 1), hurt = typeof bud.hitAt === 'number' && time - bud.hitAt < .3;
    ctx.save(); ctx.translate(bud.x, bud.y + r * .12);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * r * .26, 0); ctx.scale(1, hurt ? .2 : blink);
      ctx.beginPath(); ctx.ellipse(0, 0, r * .13, r * .17, 0, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#4a2340'; ctx.lineWidth = 1.2; ctx.stroke();
      circle(ctx, side * -r * .02, r * .03, r * .075, '#2d1630'); circle(ctx, side * -r * .04, -r * .03, r * .028, '#ffffff');
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(side * r * .4, -r * .26); ctx.lineTo(side * r * .14, -r * .18); ctx.strokeStyle = '#4a2340'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, r * .3, r * .1, hurt ? Math.PI + .3 : .3, hurt ? -.3 : Math.PI - .3); ctx.strokeStyle = '#4a2340'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  }
  function drawBossRing(ctx, bud) {
    const r = (Number(bud.r) || 24) + (bud.shell ? 11 : 7), hp = Math.max(0, Number(bud.hp) || 0), max = Math.max(1, Number(bud.maxHp) || 1), gap = .09;
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < max; i++) {
      const a0 = -Math.PI / 2 + i * TAU / max + gap / 2, a1 = a0 + TAU / max - gap;
      ctx.beginPath(); ctx.arc(bud.x, bud.y, r, a0, a1); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5.4; ctx.stroke();
      ctx.beginPath(); ctx.arc(bud.x, bud.y, r, a0, a1); ctx.strokeStyle = i < hp ? (FLOWERS[bud.type] || FLOWERS.coral).dark : 'rgba(120,120,140,.35)'; ctx.lineWidth = 3; ctx.stroke();
    }
    const crownY = bud.y - (Number(bud.r) || 24) - 14;
    ctx.beginPath(); ctx.moveTo(bud.x - 10, crownY + 6); ctx.lineTo(bud.x - 12, crownY - 4); ctx.lineTo(bud.x - 5, crownY + 1); ctx.lineTo(bud.x, crownY - 8);
    ctx.lineTo(bud.x + 5, crownY + 1); ctx.lineTo(bud.x + 12, crownY - 4); ctx.lineTo(bud.x + 10, crownY + 6); ctx.closePath();
    ctx.fillStyle = '#ffd64f'; ctx.fill(); ctx.strokeStyle = '#a8701f'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke();
    circle(ctx, bud.x, crownY + 1.5, 1.8, '#ef5a7d');
    ctx.restore();
  }

  // A fossil shell turns around its bud. Shots only get in through the open side, so the gap is drawn wide and
  // clean; the coiled whorl at one lip makes it read as a shell rather than a ring.
  const SHELL_OPEN = Math.acos(.34);
  function shellPath(ctx, r, open) {
    ctx.beginPath(); ctx.arc(0, 0, r + 2.7, open, TAU - open); ctx.arc(0, 0, r - 2.7, TAU - open, open, true); ctx.closePath();
  }
  function drawShell(ctx, bud) {
    const r = (Number(bud.r) || 11) + 4.6, a = Number(bud.shellAngle) || 0, open = SHELL_OPEN;
    ctx.save(); ctx.translate(bud.x, bud.y); ctx.rotate(a);
    shellPath(ctx, r, open); ctx.fillStyle = '#ecd8ab'; ctx.fill();
    ctx.save(); ctx.clip();
    // Light comes from the upper left whichever way the shell has turned.
    ctx.rotate(-a);
    ctx.fillStyle = 'rgba(150,108,58,.32)'; ctx.beginPath(); ctx.arc(2.2, 2.6, r + 4, 0, TAU); ctx.arc(0, 0, r - 1, 0, TAU, true); ctx.fill('evenodd');
    ctx.beginPath(); ctx.arc(0, 0, r + 1.4, -2.7, -1.5); ctx.strokeStyle = 'rgba(255,250,232,.9)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.stroke();
    ctx.rotate(a);
    ctx.strokeStyle = 'rgba(122,86,46,.6)'; ctx.lineWidth = .9;
    for (let k = open + .22; k < TAU - open - .08; k += .34) {
      ctx.beginPath(); ctx.moveTo(Math.cos(k) * (r - 2.7), Math.sin(k) * (r - 2.7));
      ctx.quadraticCurveTo(Math.cos(k + .07) * r, Math.sin(k + .07) * r, Math.cos(k) * (r + 2.7), Math.sin(k) * (r + 2.7)); ctx.stroke();
    }
    ctx.restore();
    shellPath(ctx, r, open); ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke();
    // The whorl at the leading lip and a rounded cap at the other.
    const wx = Math.cos(open) * r, wy = Math.sin(open) * r;
    circle(ctx, wx, wy, 4.3, '#f6e8c4', '#7a5530', 1.3);
    ctx.beginPath(); ctx.arc(wx + .4, wy, 2.4, 0, 4.6); ctx.arc(wx + .2, wy - .6, 1, 4.6, 1.2); ctx.strokeStyle = '#8c6338'; ctx.lineWidth = .9; ctx.stroke();
    const cx = Math.cos(-open) * r, cy = Math.sin(-open) * r;
    circle(ctx, cx, cy, 2.8, '#e3c995', '#7a5530', 1.2);
    ctx.restore();
  }
  // A geode: a lumpy stone with amethyst showing through its cracks. Each hit opens the cracks wider.
  function idSeed(id) { let h = 7; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }
  function drawGeode(ctx, bud, time) {
    const r = Number(bud.r) || 14, max = Math.max(1, Number(bud.maxHp) || 1), crack = max > 1 ? clamp((max - (Number(bud.hp) || 1)) / (max - 1), 0, 1) : 0;
    const random = rng(idSeed(bud.id)), lumps = [];
    for (let i = 0; i < 9; i++) lumps.push(r * (.9 + random() * .16));
    ctx.save(); ctx.translate(bud.x, bud.y);
    const outline = () => {
      ctx.beginPath();
      for (let i = 0; i <= 9; i++) {
        const a0 = (i - .5) * TAU / 9, a1 = i * TAU / 9, k = lumps[i % 9];
        if (i === 0) ctx.moveTo(Math.cos(a0) * k, Math.sin(a0) * k);
        ctx.quadraticCurveTo(Math.cos(a1 - TAU / 18) * k * 1.06, Math.sin(a1 - TAU / 18) * k * 1.06, Math.cos(a1 + TAU / 36) * lumps[(i + 1) % 9], Math.sin(a1 + TAU / 36) * lumps[(i + 1) % 9]);
      }
      ctx.closePath();
    };
    outline(); ctx.fillStyle = '#a49ab3'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#7f7393'; ctx.beginPath(); ctx.arc(r * .55, r * .6, r * 1.15, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a49ab3'; ctx.beginPath(); ctx.arc(-r * .12, -r * .16, r * .98, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) circle(ctx, (random() - .5) * r * 1.5, (random() - .5) * r * 1.5, .9 + random() * .9, 'rgba(70,58,92,.35)');
    // The geode's crystal heart shows first at a chip in the upper left, then through spreading cracks.
    const glow = .55 + Math.sin(time * 3 + bud.x * .05) * .12;
    const crystals = [[-.35, -.42, .34], [.18, -.1, .26 + crack * .2], [-.1, .32, .22 + crack * .24], [.42, .36, crack * .3]];
    crystals.forEach(([cx, cy, size], i) => {
      if (size <= .02 || (i > 0 && crack <= 0 && i !== 1)) return;
      const s = size * r, x = cx * r, y = cy * r;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * .62, y - s * .1); ctx.lineTo(x + s * .32, y + s * .7); ctx.lineTo(x - s * .4, y + s * .62); ctx.lineTo(x - s * .64, y - s * .14); ctx.closePath();
      ctx.fillStyle = i === 1 && crack <= 0 ? '#8a6bc9' : '#b48cff'; ctx.fill(); ctx.strokeStyle = '#4b2f86'; ctx.lineWidth = .9; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x - s * .1, y + s * .1); ctx.lineTo(x + s * .62, y - s * .1); ctx.fillStyle = `rgba(240,226,255,${glow})`; ctx.fill();
    });
    if (crack > 0) {
      ctx.strokeStyle = '#3d2c58'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [sx, sy, ex, ey] of [[-r, -.1 * r, .1 * r, .05 * r], [.2 * r, -r, .05 * r, .2 * r], [.9 * r, .5 * r, .2 * r, .25 * r]].slice(0, crack >= 1 ? 3 : 2)) {
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo((sx * 2 + ex) / 3 + 2, (sy * 2 + ey) / 3 - 2); ctx.lineTo((sx + ex * 2) / 3 - 1.5, (sy + ey * 2) / 3 + 1.5); ctx.lineTo(ex, ey); ctx.stroke();
      }
    }
    ctx.restore();
    outline(); ctx.strokeStyle = '#4a3d5e'; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * .78, 3.5, 4.4); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
  }
  // Gems tumble out of a cracked geode: a cut stone in the flower's color, with a glint.
  const GEMS = { coral: ['#ff7aa2', '#ffc6d6', '#a5305a'], gold: ['#ffc94a', '#fff2b0', '#9a6516'], lilac: ['#a77cff', '#e0ceff', '#57359f'] };
  function drawGem(ctx, bud, time, still) {
    const r = Number(bud.r) || 9, [base, light, ink] = GEMS[bud.type] || GEMS.coral, bob = still ? 0 : Math.sin(time * 4 + bud.x) * .8;
    ctx.save(); ctx.translate(bud.x, bud.y + bob);
    const pts = [[0, -r * 1.05], [r * .9, -r * .38], [r * .62, r * .62], [0, r * 1.05], [-r * .62, r * .62], [-r * .9, -r * .38]];
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fillStyle = base; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * .9, -r * .38); ctx.lineTo(0, -r * 1.05); ctx.lineTo(r * .9, -r * .38); ctx.lineTo(r * .36, -r * .1); ctx.lineTo(-r * .36, -r * .1); ctx.closePath(); ctx.fillStyle = light; ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * .36, -r * .1); ctx.lineTo(r * .9, -r * .38); ctx.lineTo(r * .62, r * .62); ctx.lineTo(0, r * 1.05); ctx.closePath(); ctx.fillStyle = 'rgba(40,20,60,.2)'; ctx.fill();
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * .36, -r * .1); ctx.lineTo(r * .36, -r * .1); ctx.lineTo(0, r * 1.05); ctx.closePath(); ctx.strokeStyle = ink; ctx.globalAlpha *= .45; ctx.lineWidth = .8; ctx.stroke(); ctx.globalAlpha /= .45;
    sparkle(ctx, -r * .34, -r * .52, 2.6, '#ffffff', .3);
    ctx.restore();
  }
  // Briar patches: a thorny vine ties each patch together, so the player can see which three must bloom together.
  function drawBriars(ctx, buds) {
    const patches = new Map();
    for (const bud of buds) if (bud.briar) { if (!patches.has(bud.group)) patches.set(bud.group, []); patches.get(bud.group).push(bud); }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const patch of patches.values()) {
      if (patch.length < 2) continue;
      const pts = patch.slice().sort((a, b) => a.x - b.x || a.y - b.y);
      // A pale halo first, so the bramble reads on dark stone as well as on light sand.
      for (const [width, color] of [[7, 'rgba(255,241,214,.55)'], [4.4, '#5e3324'], [2, '#a4643c']]) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 9, b.x, b.y); }
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        for (let k = 1; k < 4; k++) {
          const t = k / 4, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + 9;
          const x = (1 - t) * (1 - t) * a.x + 2 * t * (1 - t) * mx + t * t * b.x, y = (1 - t) * (1 - t) * a.y + 2 * t * (1 - t) * my + t * t * b.y;
          const dx = 2 * (1 - t) * (mx - a.x) + 2 * t * (b.x - mx), dy = 2 * (1 - t) * (my - a.y) + 2 * t * (b.y - my), len = Math.hypot(dx, dy) || 1;
          const side = k % 2 ? 1 : -1, nx = -dy / len * side, ny = dx / len * side;
          ctx.beginPath(); ctx.moveTo(x + dx / len * 2.6, y + dy / len * 2.6); ctx.lineTo(x + nx * 6, y + ny * 6); ctx.lineTo(x - dx / len * 2.6, y - dy / len * 2.6); ctx.closePath();
          ctx.fillStyle = '#4a261b'; ctx.fill(); ctx.strokeStyle = 'rgba(255,241,214,.75)'; ctx.lineWidth = .9; ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  function drawThorns(ctx, bud) {
    const r = (Number(bud.r) || 11) + 1.5;
    ctx.save(); ctx.translate(bud.x, bud.y);
    for (let i = 0; i < 7; i++) {
      const a = i * TAU / 7 + .3, ux = Math.cos(a), uy = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(ux * r - uy * 2.6, uy * r + ux * 2.6); ctx.lineTo(ux * (r + 5), uy * (r + 5)); ctx.lineTo(ux * r + uy * 2.6, uy * r - ux * 2.6); ctx.closePath();
      ctx.fillStyle = '#6b3726'; ctx.fill(); ctx.strokeStyle = '#fff1d6'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  // A bloomed briar shows how long the patch has before it grows back: a ring that empties, turning red at the end.
  function drawRegrow(ctx, bud, time) {
    const span = Number(bud.regrowSpan) || 4, left = clamp((bud.regrowAt - time) / span, 0, 1), r = (Number(bud.r) || 11) + 7;
    if (left <= 0) return;
    ctx.save(); ctx.lineCap = 'round';
    circle(ctx, bud.x, bud.y, r, null, 'rgba(255,255,255,.75)', 4.2);
    ctx.beginPath(); ctx.arc(bud.x, bud.y, r, -Math.PI / 2, -Math.PI / 2 + left * TAU);
    ctx.strokeStyle = left < .3 ? '#e2445f' : '#4c8a3c'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.restore();
  }
  // Tunnel holes for the painted levels: a dark burrow in a ring of stones. The exit carries an arrow for the way
  // shots come out, and matching dots pair each entrance with its exit.
  const BURROWS = {
    'depth-ember': { rim: '#5b3b35', stone: '#7a4f44', lip: '#ff9b4f', hole: '#1b0d10', ink: '#2a1412', arrow: '#ffc27a' },
    'depth-geode': { rim: '#6d5238', stone: '#8c6a47', lip: '#e5b979', hole: '#170f1c', ink: '#3a2716', arrow: '#ffe2a6' },
    'depth-briar': { rim: '#56604c', stone: '#788670', lip: '#b8d48c', hole: '#111a12', ink: '#26301f', arrow: '#e6f5b8' },
    'depth-core': { rim: '#6a4a6e', stone: '#8d6b8c', lip: '#ffd36e', hole: '#1e0f24', ink: '#33183a', arrow: '#fff0b0' },
    default: { rim: '#5e5466', stone: '#7d7186', lip: '#c9b8e8', hole: '#151020', ink: '#2c2236', arrow: '#f2e8ff' }
  };
  const PAIR_DOTS = ['#ffcf4a', '#6fe0d2', '#ff8fb1'];
  function drawBurrows(ctx, gates, time, reducedMotion, theme) {
    if (!Array.isArray(gates) || !gates.length) return;
    const look = BURROWS[theme] || BURROWS.default;
    const pairKey = gate => [String(gate.id), String(gate.pair)].sort().join('|');
    const pairs = Array.from(new Set(gates.filter(Boolean).map(pairKey))).sort();
    gates.forEach(gate => {
      if (!gate || !Number.isFinite(gate.x) || !Number.isFinite(gate.y)) return;
      const r = clamp(Number(gate.r) || 17, 8, 40), index = Math.max(0, pairs.indexOf(pairKey(gate))), exit = /-out$/.test(String(gate.id));
      ctx.save(); ctx.translate(gate.x, gate.y);
      circle(ctx, 1.5, 2.5, r + 5.5, 'rgba(20,10,20,.28)');
      circle(ctx, 0, 0, r + 5, look.rim, look.ink, 1.5);
      for (let i = 0; i < 9; i++) {
        const a = i * TAU / 9 + index, x = Math.cos(a) * (r + 2.4), y = Math.sin(a) * (r + 2.4);
        ctx.beginPath(); ctx.ellipse(x, y, 4.4, 3.2, a, 0, TAU); ctx.fillStyle = look.stone; ctx.fill(); ctx.strokeStyle = look.ink; ctx.lineWidth = .9; ctx.stroke();
      }
      const hole = ctx.createRadialGradient(-r * .2, -r * .25, 1, 0, 0, r);
      hole.addColorStop(0, look.hole); hole.addColorStop(.75, look.hole); hole.addColorStop(1, look.rim);
      circle(ctx, 0, 0, r - .5, hole);
      ctx.beginPath(); ctx.arc(0, 0, r - 1.6, .2, Math.PI - .2); ctx.strokeStyle = look.lip; ctx.globalAlpha = .75; ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalAlpha = 1;
      const dots = Math.min(3, index + 1);
      for (let i = 0; i < dots; i++) circle(ctx, (i - (dots - 1) / 2) * 6, -r - 9, 2.6, PAIR_DOTS[index % PAIR_DOTS.length], look.ink, 1);
      if (exit) {
        ctx.save(); ctx.rotate(Number(gate.angle) || 0);
        ctx.beginPath(); ctx.moveTo(r + 4, -5); ctx.lineTo(r + 12, 0); ctx.lineTo(r + 4, 5); ctx.closePath();
        ctx.fillStyle = look.arrow; ctx.fill(); ctx.strokeStyle = look.ink; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.restore();
      }
      const age = Number.isFinite(gate.lastUsed) ? time - gate.lastUsed : Infinity;
      if (!reducedMotion && age >= 0 && age < .5) {
        const q = age / .5;
        ctx.globalAlpha = (1 - q) * .8; circle(ctx, 0, 0, r + 4 + ease(q) * 12, null, look.lip, 2 - q);
      }
      ctx.restore();
    });
  }

  function drawRelayCrown(ctx, bud) {
    const r = Number(bud.r) || 13, crownY = bud.y - r - 5;
    ctx.save();
    circle(ctx, bud.x, bud.y, r + 2.3, null, '#fff6ce', 3.3);
    circle(ctx, bud.x, bud.y, r + 2.3, null, '#dca53a', 1.35);
    ctx.beginPath(); ctx.moveTo(bud.x - 5.5, crownY + 3);
    ctx.lineTo(bud.x - 7, crownY - 3); ctx.lineTo(bud.x - 2.7, crownY - .6);
    ctx.lineTo(bud.x, crownY - 5.5); ctx.lineTo(bud.x + 2.7, crownY - .6);
    ctx.lineTo(bud.x + 7, crownY - 3); ctx.lineTo(bud.x + 5.5, crownY + 3); ctx.closePath();
    const gold = ctx.createLinearGradient(0, crownY - 5, 0, crownY + 3);
    gold.addColorStop(0, '#fff9c5'); gold.addColorStop(.5, '#ffdc72'); gold.addColorStop(1, '#dca444');
    ctx.strokeStyle = '#fffee7'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = gold; ctx.fill();
    ctx.strokeStyle = '#bc8b39'; ctx.lineWidth = .65; ctx.stroke();
    circle(ctx, bud.x, crownY + .5, .9, '#54b697');
    ctx.restore();
  }

  function drawAim(ctx, points, colors, time, type, reducedMotion) {
    if (!Array.isArray(points) || points.length < 2) return;
    ctx.save(); ctx.lineCap = 'round';
    const tint = FLOWERS[type], dot = tint ? tint.base : colors.track, ring = tint ? tint.dark : colors.track;
    // The dots drift along the path toward where the seed will go.
    let carry = reducedMotion ? 0 : (Number(time) || 0) * 26 % 11, distance = 0, afterGate = Infinity;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], next = points[i];
      if (!prev || !next || !Number.isFinite(prev.x) || !Number.isFinite(prev.y) || !Number.isFinite(next.x) || !Number.isFinite(next.y)) continue;
      // A teleport changes position without travelling through the intervening board.
      if (next.move) { carry = 0; afterGate = 0; continue; }
      const dx = next.x - prev.x, dy = next.y - prev.y, len = Math.hypot(dx, dy);
      if (!len) continue;
      for (let d = carry; d <= len; d += 11) {
        const fade = Math.max(clamp(1 - (distance + d) / 720, .16, .85), afterGate + d < 76 ? .78 - (afterGate + d) * .002 : 0);
        ctx.globalAlpha = fade;
        circle(ctx, prev.x + dx * d / len, prev.y + dy * d / len, tint ? 2.7 - Math.min(1.1, (distance + d) / 500) : 2, dot, '#ffffff', tint ? 1 : .65);
      }
      // Where the path turns off a petal, rock or wall, a small ring marks the bounce.
      const after = points[i + 1], ax = after ? after.x - next.x : 0, ay = after ? after.y - next.y : 0;
      const turn = after && !after.move ? (dx * ax + dy * ay) / (len * (Math.hypot(ax, ay) || 1)) : 1;
      if (tint && turn < .94 && distance + len < 640) {
        ctx.globalAlpha = clamp(1 - (distance + len) / 720, .3, .85);
        circle(ctx, next.x, next.y, 4.2, 'rgba(255,255,255,.55)', ring, 1.6);
      }
      if (prev.move && len > 12) {
        const d = Math.min(29, len - 3), x = prev.x + dx * d / len, y = prev.y + dy * d / len;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx)); ctx.globalAlpha = .92;
        ctx.beginPath(); ctx.moveTo(-4, -3.2); ctx.lineTo(0, 0); ctx.lineTo(-4, 3.2);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.strokeStyle = colors.track; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      }
      carry = (carry - len) % 11;
      if (carry < 0) carry += 11;
      distance += len;
      afterGate += len;
    }
    ctx.restore();
  }

  function paintGate(ctx, r, violet) {
    const color = violet ? '#b992ff' : '#76efde', light = violet ? '#f0d8ff' : '#dcfff0';
    const halo = ctx.createRadialGradient(0, 0, r * .75, 0, 0, r + 12);
    halo.addColorStop(0, violet ? 'rgba(151,97,241,.25)' : 'rgba(84,223,222,.24)'); halo.addColorStop(1, 'rgba(107,193,226,0)');
    circle(ctx, 0, 0, r + 12, halo);
    ctx.shadowColor = 'rgba(12,14,64,.38)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    circle(ctx, 0, 0, r + 2.2, '#565891', '#cfbfaa', 1.1); ctx.shadowColor = 'transparent';
    const well = ctx.createRadialGradient(-r * .35, -r * .45, 1, r * .12, r * .17, r * 1.2);
    well.addColorStop(0, violet ? '#564384' : '#356f88'); well.addColorStop(.46, violet ? '#302c62' : '#243b68'); well.addColorStop(1, '#181c45');
    circle(ctx, 0, 0, r - .1, well, '#2e426b', 1.5);
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
    const mist = ctx.createLinearGradient(-r, -r, r, r);
    mist.addColorStop(0, violet ? 'rgba(224,178,255,.02)' : 'rgba(178,250,232,.02)');
    mist.addColorStop(.65, violet ? 'rgba(191,120,255,.22)' : 'rgba(83,224,218,.24)'); mist.addColorStop(1, 'rgba(146,140,255,.02)');
    ctx.fillStyle = mist; ctx.fillRect(-r, -r, r * 2, r * 2);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(r * .08, r * .38, r * (.40 + i * .19), r * (.10 + i * .065), -.18, .12, Math.PI * 1.88);
      ctx.strokeStyle = i === 0 ? light : color; ctx.globalAlpha = .30 - i * .06; ctx.lineWidth = .65; ctx.stroke();
    }
    ctx.restore();
    // A carved moon sliver, with a pearl edge, cradles the dark aperture.
    const moon = ctx.createLinearGradient(-r, -r, r * .1, r);
    moon.addColorStop(0, '#fffce8'); moon.addColorStop(.37, '#e9ebf2'); moon.addColorStop(.77, '#a1b5d4'); moon.addColorStop(1, '#6d80b1');
    ctx.beginPath(); ctx.moveTo(r * .25, -r * .99);
    ctx.bezierCurveTo(-r * .85, -r * 1.2, -r * 1.36, r * .46, -r * .10, r * 1.03);
    ctx.bezierCurveTo(-r * .65, r * .40, -r * .62, -r * .65, r * .25, -r * .99);
    ctx.fillStyle = moon; ctx.fill(); ctx.strokeStyle = '#e6e8d8'; ctx.lineWidth = .5; ctx.stroke();
    for (const [x,y,size] of [[-.72,-.29,.095],[-.61,.23,.068],[-.47,-.65,.058]]) {
      circle(ctx, x * r, y * r, size * r, 'rgba(104,123,163,.25)');
      ctx.beginPath(); ctx.arc(x * r, y * r, size * r * .88, .2, Math.PI);
      ctx.strokeStyle = 'rgba(255,255,234,.62)'; ctx.lineWidth = .45; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r + 1.8, -.93, 1.14);
    ctx.strokeStyle = light; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r + 4.1, .30, 1.86);
    ctx.strokeStyle = '#c7b582'; ctx.lineWidth = .9; ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = .42 + i * .46, x = Math.cos(a) * (r + 3), y = Math.sin(a) * (r + 3);
      leaf(ctx, x, y, 5.1 - i * .3, 2.3, a + Math.PI * .65, i % 2 ? '#77b9b7' : '#a3d8cd', '#d9f1d7');
    }
    for (const a of [-1.58,-.96,2.12]) {
      const x = Math.cos(a) * (r + 2.6), y = Math.sin(a) * (r + 2.6);
      circle(ctx, x, y, 1.8, '#d1caa9', '#727898', .35);
      circle(ctx, x -.35, y -.35, 1.15, '#fff6dc');
    }
  }

  function drawGates(ctx, gates, time, reducedMotion) {
    if (!Array.isArray(gates) || !gates.length) return;
    const pairKey = gate => [String(gate.id), String(gate.pair)].sort().join('|');
    const pairs = Array.from(new Set(gates.filter(Boolean).map(pairKey))).sort();
    gates.forEach(gate => {
      if (!gate || !Number.isFinite(gate.x) || !Number.isFinite(gate.y)) return;
      const r = clamp(Number(gate.r) || 18, 8, 40), violet = String(gate.id) > String(gate.pair);
      const index = pairs.indexOf(pairKey(gate)), color = violet ? '#cea8ff' : '#94fff0';
      const key = r.toFixed(2) + ':' + violet;
      let sprite = gateCache.get(key);
      if (!sprite) {
        const size = Math.ceil((r + 14) * 2);
        let canvas;
        if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(size * 3, size * 3);
        else if (typeof document !== 'undefined') { canvas = document.createElement('canvas'); canvas.width = canvas.height = size * 3; }
        if (canvas) {
          const c = canvas.getContext('2d'); c.scale(3, 3); c.translate(size / 2, size / 2); paintGate(c, r, violet);
          sprite = { canvas, size };
          if (gateCache.size >= 16) gateCache.delete(gateCache.keys().next().value);
          gateCache.set(key, sprite);
        }
      }
      ctx.save(); ctx.translate(gate.x, gate.y);
      if (sprite) ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
      else paintGate(ctx, r, violet);
      // A fine compass notch shows the portal's rotational orientation.
      ctx.save(); ctx.rotate(Number(gate.angle) || 0);
      ctx.beginPath(); ctx.moveTo(r - .2, -2.5); ctx.lineTo(r + 3.7, 0); ctx.lineTo(r - .2, 2.5);
      ctx.strokeStyle = color; ctx.lineWidth = 1.25; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
      // Matching I / II strokes identify linked gates without adding a label panel.
      const marks = Math.min(3, index + 1);
      ctx.lineWidth = 1.15; ctx.strokeStyle = '#f8efd5'; ctx.lineCap = 'round';
      for (let i = 0; i < marks; i++) {
        const x = (i - (marks - 1) / 2) * 3.1;
        ctx.beginPath(); ctx.moveTo(x, -3.1); ctx.lineTo(x, 2.1); ctx.stroke();
      }
      if (!reducedMotion) {
        const drift = time * .45 + index * 1.4 + (violet ? 1 : 0);
        const a = -.65 + Math.sin(drift) * .24;
        ctx.save(); ctx.globalAlpha = .47 + Math.sin(drift * 1.2) * .15;
        sparkle(ctx, Math.cos(a) * (r - 4), Math.sin(a) * (r - 4), 1.7, color, .3); ctx.restore();
        const stamp = Number.isFinite(gate.lastUsed) ? gate.lastUsed : gate.hitAt;
        const age = Number.isFinite(stamp) ? time - stamp : Infinity;
        if (age >= 0 && age < .6) {
          const q = age / .6, ring = r + ease(q) * 14;
          ctx.save(); ctx.globalAlpha = (1 - q) * .72;
          circle(ctx, 0, 0, ring, null, color, 1.5 - q * .7);
          circle(ctx, 0, 0, r * (.5 + q * .42), null, '#fff9dc', .7);
          for (let i = 0; i < 4; i++) {
            const a = i * TAU / 4 + .5;
            sparkle(ctx, Math.cos(a) * ring, Math.sin(a) * ring, (1 - q) * 2.5, '#f2ffe7', a);
          }
          ctx.restore();
        }
      }
      ctx.restore();
    });
  }

  function drawSeed(ctx, x, y, r, time, flying, style) {
    const look = style && style.seed;
    ctx.save(); ctx.translate(x, y); ctx.rotate(flying ? time * 2.5 : -.35);
    ctx.shadowColor = look ? look.base + '88' : 'rgba(132,106,43,.23)'; ctx.shadowBlur = look ? 12 : 9; ctx.shadowOffsetY = 2;
    const seed = ctx.createRadialGradient(-r * .3, -r * .4, .2, 0, 0, r * 1.2);
    seed.addColorStop(0, look ? look.core : '#fffef1'); seed.addColorStop(.6, look ? look.light : '#f2dda0'); seed.addColorStop(1, look ? look.base : '#c8a465');
    ctx.beginPath(); ctx.ellipse(0, 0, r * .8, r, .4, 0, TAU); ctx.fillStyle = seed; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.lineWidth = .8; ctx.strokeStyle = look ? look.rim : '#af925c'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * .21, -r * .65); ctx.quadraticCurveTo(-r * .3, -r * .02, r * .19, r * .59);
    ctx.lineWidth = .7; ctx.strokeStyle = 'rgba(158,118,48,.40)'; ctx.stroke();
    ctx.restore();
  }

  function drawVines(ctx, buds, time, colors, reducedMotion) {
    const groups = new Map();
    for (const bud of buds) if (bud.group) {
      if (!groups.has(bud.group)) groups.set(bud.group, []);
      groups.get(bud.group).push(bud);
    }
    ctx.save(); ctx.lineCap = 'round';
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      // A minimum spanning vine communicates exactly which buds bloom together.
      const reached = [members[0]], unreached = members.slice(1);
      while (unreached.length) {
        let nearest = Infinity, pair = null, index = 0;
        for (const a of reached) for (let j = 0; j < unreached.length; j++) {
          const b = unreached[j], distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance < nearest) { nearest = distance; pair = [a, b]; index = j; }
        }
        const [a, b] = pair;
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const bend = Math.min(distance * .1, 12);
        const mx = (a.x + b.x) / 2 - dy / distance * bend;
        const my = (a.y + b.y) / 2 + dx / distance * bend;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.strokeStyle = a.bloomed && b.bloomed ? 'rgba(18,181,142,.55)' : 'rgba(48,178,134,.48)'; ctx.lineWidth = 1.65; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.x, a.y + 1); ctx.quadraticCurveTo(mx, my + 1, b.x, b.y + 1);
        ctx.strokeStyle = 'rgba(255,255,250,.62)'; ctx.lineWidth = .6; ctx.stroke();
        const lx = a.x * .25 + mx * .5 + b.x * .25, ly = a.y * .25 + my * .5 + b.y * .25;
        ctx.save(); ctx.globalAlpha = .62;
        leaf(ctx, lx, ly, Math.min(10, distance * .17), 4.5, Math.atan2(dy, dx) + .62, colors.fine, colors.leafDark);
        ctx.restore();
        // A glint travels along the stem while a linked bloom is opening.
        if (!reducedMotion && (a.bloomed || b.bloomed)) {
          const from = a.bloomed && (!b.bloomed || a.bloomAt < b.bloomAt) ? a : b;
          const age = time - (from.bloomAt || 0);
          if (age >= 0 && age < .35) {
            let q = age / .35; if (from === b) q = 1 - q;
            const x = (1-q)*(1-q)*a.x+2*(1-q)*q*mx+q*q*b.x;
            const y = (1-q)*(1-q)*a.y+2*(1-q)*q*my+q*q*b.y;
            ctx.save(); ctx.shadowColor = '#f3d68d'; ctx.shadowBlur = 8;
            circle(ctx, x, y, 2.2, '#fff3c6'); ctx.restore();
          }
        }
        reached.push(b); unreached.splice(index, 1);
      }
    }
    ctx.restore();
  }

  function drawLivingFoliage(ctx, time, colors, still) {
    const sway = still ? 0 : Math.sin(time * .55) * .035;
    ctx.save(); ctx.globalAlpha = .84;
    leaf(ctx, 13, 560, 78, 28, -.48 + sway, colors.leaf, colors.leafDark);
    leaf(ctx, 11, 560, 49, 21, .56 + sway * .7, colors.fine, colors.leafDark);
    leaf(ctx, 411, 560, 73, 26, .40 - sway, colors.leaf, colors.leafDark);
    leaf(ctx, 411, 560, 47, 21, -.64 - sway * .8, colors.fine, colors.leafDark);
    ctx.restore();
  }


  // Ambient life: drifting petals, glowing pollen, a passing butterfly and
  // grass that leans in the breeze. Pure functions of time, so it costs no state.
  const AMBIENT = {
    meadow: { petals: ['#ff8fb1', '#ffd45c', '#c2a2ff', '#ffffff'], mote: '255,246,190', grass: ['#2fb57c', '#5fd193', '#8de074'] },
    koi: { petals: ['#ff9d7a', '#ffe08a', '#ffffff', '#ffb4cf'], mote: '230,255,250', grass: ['#1f9d86', '#47c3a9', '#89e6bb'] },
    moon: { petals: ['#d9b8ff', '#9ff4ff', '#ffc8ef', '#ffffff'], mote: '200,180,255', grass: ['#4b3ca6', '#6a5bd0', '#8f7ff0'] },
    'depth-meadow': { petals: ['#ff8fb1', '#ffd45c', '#ffffff', '#c2a2ff'], mote: '255,246,190', motes: false },
    'depth-roots': { petals: ['#e6c492', '#f3dcb0', '#c99460'], mote: '255,232,190', butterfly: false, motes: false },
    'depth-grotto': { petals: ['#9ff7e6', '#c8fff4', '#f2b75a'], mote: '160,255,230', butterfly: false, motes: false },
    'depth-crystal': { petals: ['#b9f6ff', '#e3d5ff', '#ffffff'], mote: '190,240,255', butterfly: false, motes: false },
    'depth-lake': { petals: ['#a8f5e0', '#d2f6ee', '#7fd6c8'], mote: '170,255,225', butterfly: false },
    'depth-fossil': { petals: ['#e9cf9f', '#f6e4c0', '#c9a173'], mote: '255,240,200', butterfly: false, motes: false },
    'depth-ember': { petals: ['#5e4a46', '#7d625a', '#3f302e'], mote: '255,150,80', butterfly: false },
    'depth-geode': { petals: ['#c9a8ff', '#efdcff', '#9be8ff'], mote: '220,190,255', butterfly: false, motes: false },
    'depth-briar': { petals: ['#c8506a', '#e88aa0', '#d9e9a8'], mote: '230,255,170', butterfly: false },
    'depth-core': { petals: ['#ffe3a8', '#ffc46b', '#f7b0d0'], mote: '255,220,150', butterfly: false }
  };
  function drawAmbient(ctx, time, theme) {
    const a = AMBIENT[theme] || AMBIENT.meadow;
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const speed = 13 + (i * 7) % 11, life = 640;
      const y = ((i * 71 + time * speed) % life) - 40;
      const x = ((i * 97.3 + time * (9 + i % 4)) % 470) - 25 + Math.sin(time * .9 + i * 1.7) * 18;
      const spin = time * (1.2 + (i % 5) * .3) + i;
      ctx.save(); ctx.translate(x, y); ctx.rotate(spin * .6);
      ctx.scale(.35 + Math.abs(Math.cos(spin)) * .65, 1);
      ctx.globalAlpha = .62;
      const size = 3.2 + (i % 4);
      ctx.beginPath(); ctx.moveTo(0, size); ctx.bezierCurveTo(-size * 1.3, size * .1, -size, -size * .9, 0, -size);
      ctx.bezierCurveTo(size * .9, -size * 1.2, size * 1.3, size * .1, 0, size);
      ctx.fillStyle = a.petals[i % a.petals.length]; ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < (a.motes === false ? 0 : 9); i++) {
      const x = 30 + ((i * 131.7) % 360) + Math.sin(time * .5 + i * 2.1) * 20;
      const y = 520 - ((i * 63 + time * (6 + i % 3)) % 470);
      const pulse = .45 + Math.sin(time * 2.2 + i * 1.3) * .35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, `rgba(${a.mote},${.75 * pulse})`); g.addColorStop(1, `rgba(${a.mote},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - 9, y - 9, 18, 18);
    }
    ctx.globalCompositeOperation = 'source-over';
    const cycle = time % 17;
    if (cycle < 10 && theme !== 'moon' && a.butterfly !== false) {
      const q = cycle / 10, bx = -20 + q * 460, by = 150 + Math.sin(q * 9) * 34 + Math.sin(q * 23) * 6;
      const flap = Math.abs(Math.sin(time * 15));
      ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(q * 9) * .25 + .1);
      for (const side of [-1, 1]) {
        ctx.save(); ctx.scale(side * (.25 + flap * .75), 1);
        ctx.beginPath(); ctx.ellipse(5, -4, 6.5, 5, -.5, 0, TAU); ctx.fillStyle = '#ff7aa6'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(4, 3.5, 4.2, 3.4, .5, 0, TAU); ctx.fillStyle = '#ffd45c'; ctx.fill();
        circle(ctx, 6, -5, 1.4, '#ffffff');
        ctx.restore();
      }
      ctx.beginPath(); ctx.ellipse(0, 0, 1.2, 5, 0, 0, TAU); ctx.fillStyle = '#3b2b4a'; ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < (a.grass ? 46 : 0); i++) {
      const edge = i < 23, k = edge ? i : i - 23;
      const x = edge ? 10 + k * 4.6 : 410 - k * 4.6;
      if (x > 118 && x < 302) continue;
      const h = 12 + ((i * 37) % 19), lean = Math.sin(time * 1.5 + x * .05) * 4 + (edge ? -2 : 2);
      ctx.beginPath(); ctx.moveTo(x - 2, 548); ctx.quadraticCurveTo(x + lean * .3, 548 - h * .6, x + lean, 548 - h);
      ctx.quadraticCurveTo(x + lean * .3 + 1, 548 - h * .5, x + 2, 548);
      ctx.fillStyle = a.grass[i % 3]; ctx.globalAlpha = .9; ctx.fill();
    }
    ctx.restore();
  }

  // Koi lanes: translucent water ribbons whose streaks and chevrons travel
  // with the flow, plus a koi that swims each lane. Brightens while in use.
  function koiFish(ctx, x, y, angle, time, size, palette) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    const wag = Math.sin(time * 9) * .35;
    ctx.globalAlpha *= .92;
    ctx.save(); ctx.translate(-size * .9, 0); ctx.rotate(wag);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-size * .5, -size * .55, -size * .75, -size * .42);
    ctx.quadraticCurveTo(-size * .55, 0, -size * .75, size * .42); ctx.quadraticCurveTo(-size * .5, size * .55, 0, 0);
    ctx.fillStyle = palette[0]; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, size, size * .38, 0, 0, TAU);
    const body = ctx.createLinearGradient(0, -size * .4, 0, size * .4);
    body.addColorStop(0, '#fffaf2'); body.addColorStop(.55, palette[1]); body.addColorStop(1, palette[0]);
    ctx.fillStyle = body; ctx.fill();
    ctx.fillStyle = palette[0];
    ctx.beginPath(); ctx.ellipse(size * .25, -size * .05, size * .32, size * .2, .3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-size * .35, size * .08, size * .22, size * .15, -.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(size * .15, side * size * .42, size * .28, size * .1, side * .7 + wag * .4, 0, TAU); ctx.fill(); }
    circle(ctx, size * .72, -size * .14, size * .07, '#1b2a33');
    ctx.restore();
  }
  // Underground the water runs darker and pale cave fish swim it; in the Starseed Core the streams are light.
  const WATERS = {
    pond: { edge: '120,236,255', mid: '92,214,240', core: '160,246,255', fishes: [['#f0552f', '#ffb48a'], ['#f7a21b', '#ffe3a1'], ['#e8364f', '#ffd0d6'], ['#ffffff', '#ffe7c7']] },
    cave: { edge: '70,170,215', mid: '64,156,210', core: '130,214,240', fishes: [['#dfe9f3', '#f5f8fb'], ['#d6cfe6', '#f1ecf9']] },
    light: { edge: '255,214,130', mid: '255,196,110', core: '255,236,180', fishes: null }
  };
  function drawCurrents(ctx, currents, time, reducedMotion, theme) {
    if (!Array.isArray(currents) || !currents.length) return;
    const water = theme === 'depth-core' ? WATERS.light : scenery(theme) ? WATERS.cave : WATERS.pond, fishes = water.fishes;
    currents.forEach((lane, index) => {
      const L = lane.length, W = lane.width, ux = Math.cos(lane.angle), uy = Math.sin(lane.angle);
      const used = Number.isFinite(lane.lastUsed) ? clamp(1 - (time - lane.lastUsed) / .5, 0, 1) : 0;
      ctx.save(); ctx.translate(lane.x, lane.y); ctx.rotate(lane.angle);
      const ribbon = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
      ribbon.addColorStop(0, `rgba(${water.edge},0)`); ribbon.addColorStop(.2, `rgba(${water.mid},${.30 + used * .2})`);
      ribbon.addColorStop(.5, `rgba(${water.core},${.38 + used * .25})`); ribbon.addColorStop(.8, `rgba(${water.mid},${.30 + used * .2})`); ribbon.addColorStop(1, `rgba(${water.edge},0)`);
      ctx.fillStyle = ribbon; roundRect(ctx, -L / 2, -W / 2, L, W, W / 2); ctx.fill();
      ctx.beginPath(); roundRect(ctx, -L / 2, -W / 2, L, W, W / 2); ctx.clip();
      const shift = reducedMotion ? 0 : (time * 70) % 36;
      ctx.lineCap = 'round';
      for (let row = -1; row <= 1; row++) {
        ctx.strokeStyle = `rgba(255,255,255,${.42 + used * .3})`; ctx.lineWidth = 1.4;
        ctx.setLineDash([12, 24]); ctx.lineDashOffset = -shift - row * 11;
        ctx.beginPath();
        for (let x = -L / 2; x <= L / 2; x += 8) { const y = row * W * .28 + Math.sin(x * .05 + time * 2 + row) * 2.2; if (x === -L / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (let x = -L / 2 + shift; x < L / 2; x += 36) {
        const fade = Math.min(1, (x + L / 2) / 30, (L / 2 - x) / 30);
        ctx.globalAlpha = .55 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(x - 5, -6); ctx.lineTo(x + 2, 0); ctx.lineTo(x - 5, 6); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!reducedMotion && fishes) {
        const along = ((time * 34 + index * 97) % (L + 60)) - L / 2 - 30;
        koiFish(ctx, along, Math.sin(time * 1.3 + index) * W * .18, Math.cos(time * 1.3 + index) * .12, time + index, Math.min(13, W * .24), fishes[index % fishes.length]);
      } else if (!reducedMotion) {
        for (let k = 0; k < 4; k++) {
          const along = ((time * 46 + k * L / 4 + index * 53) % L) - L / 2;
          sparkle(ctx, along, Math.sin(time * 2 + k * 1.7) * W * .22, 2.2 + Math.sin(time * 5 + k) * .6, '#fff6d8', time + k);
        }
      }
      ctx.restore();
      ctx.save(); ctx.globalAlpha = .5 + used * .5; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
      ctx.translate(lane.x, lane.y); ctx.rotate(lane.angle); roundRect(ctx, -L / 2, -W / 2, L, W, W / 2); ctx.stroke(); ctx.restore();
    });
  }

  function drawPop(ctx, floater, reducedMotion) {
    const life = Math.max(0, floater.life), duration = floater.maxLife || .8, age = duration - life;
    const scale = reducedMotion ? 1 : Math.min(1.25, .4 + age * 9) - Math.max(0, age - .1) * .4;
    ctx.save(); ctx.translate(floater.x, floater.y - (reducedMotion ? 0 : ease(age / duration) * 26));
    ctx.scale(Math.max(.7, scale), Math.max(.7, scale));
    ctx.globalAlpha = Math.min(1, life / .25); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = floater.size || 15;
    ctx.font = `700 ${size}px Fredoka, system-ui, sans-serif`; ctx.lineJoin = 'round';
    ctx.lineWidth = 3.4; ctx.strokeStyle = '#ffffff'; ctx.strokeText(floater.text, 0, 0);
    ctx.fillStyle = floater.color || '#e2477c'; ctx.fillText(floater.text, 0, 0);
    ctx.restore();
  }

  function sparkle(ctx, x, y, size, color, rotation) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0);
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.quadraticCurveTo(size * .16, -size * .13, size, 0);
    ctx.quadraticCurveTo(size * .15, size * .14, 0, size); ctx.quadraticCurveTo(-size * .16, size * .14, -size, 0);
    ctx.quadraticCurveTo(-size * .14, -size * .15, 0, -size);
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }

  function drawAtmosphere(ctx, state, time, options) {
    if (options.reducedMotion) return;
    ctx.save();
    const fever = state.feverTime > 0;
    if (fever) {
      // Slow aurora-like color waves, never a flashing full-screen overlay.
      const wave = ctx.createLinearGradient(0, 130 + Math.sin(time * .9) * 80, 420, 430);
      wave.addColorStop(0, 'rgba(255,111,199,.19)'); wave.addColorStop(.35, 'rgba(137,150,255,.10)');
      wave.addColorStop(.7, 'rgba(102,240,223,.08)'); wave.addColorStop(1, 'rgba(255,232,106,.24)');
      ctx.fillStyle = wave; ctx.fillRect(15, 15, 390, 530);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.globalAlpha = .6;
      ctx.shadowColor = '#fe7cef'; ctx.shadowBlur = 18;
      roundRect(ctx, 18, 18, 384, 524, 25); ctx.stroke(); ctx.shadowBlur = 0;
    }
    const count = fever ? 24 : 10;
    for (let i = 0; i < count; i++) {
      const x = 22 + ((i * 61.13 + Math.sin(time * .3 + i) * 14) % 376 + 376) % 376;
      const y = 28 + ((i * 79.87 - time * (5 + i % 3)) % 485 + 485) % 485;
      ctx.globalAlpha = (fever ? .55 : .23) * (.55 + Math.sin(time * 1.3 + i * 2) * .3);
      sparkle(ctx, x, y, fever ? 3 + i % 3 : 2.1, '#ffffff', i * .21);
    }
    ctx.restore();
  }

  // Keepsake shapes, shared by trails and bloom-burst particles.
  function sakuraPetal(ctx, size) {
    ctx.beginPath(); ctx.moveTo(0, size);
    ctx.bezierCurveTo(-size * .95, size * .2, -size * .8, -size * .85, -size * .28, -size);
    ctx.quadraticCurveTo(0, -size * .78, 0, -size * .66);
    ctx.quadraticCurveTo(0, -size * .78, size * .28, -size);
    ctx.bezierCurveTo(size * .8, -size * .85, size * .95, size * .2, 0, size);
  }
  function blossom(ctx, x, y, size, color, rotation) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.fillStyle = color;
    for (let k = 0; k < 5; k++) { ctx.save(); ctx.rotate(k * TAU / 5); ctx.translate(0, -size * .52); ctx.scale(.62, .62); sakuraPetal(ctx, size * .8); ctx.fill(); ctx.restore(); }
    circle(ctx, 0, 0, size * .2, '#ffe9a8');
    ctx.restore();
  }
  function goldFlake(ctx, x, y, size, color, rotation) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
    const glint = Math.abs(Math.cos(rotation * 1.7));
    ctx.scale(.45 + glint * .55, 1);
    ctx.beginPath(); ctx.moveTo(-size * .7, -size * .5); ctx.lineTo(size * .2, -size * .85); ctx.lineTo(size * .75, size * .25); ctx.lineTo(-size * .3, size * .8); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    if (glint > .8) { ctx.globalAlpha *= (glint - .8) * 5; ctx.fillStyle = '#fffdf2'; ctx.fill(); }
    ctx.restore();
  }
  // A warm lit body inside a soft halo. Normal blending keeps it amber on the bright meadow
  // instead of washing out to white, and it still glows on the dark Moon sky.
  function fireflyGlow(ctx, x, y, size, color, blink) {
    ctx.save(); ctx.globalAlpha *= blink;
    const gr = size * 3.6, g = ctx.createRadialGradient(x, y, 0, x, y, gr);
    g.addColorStop(0, color + 'bb'); g.addColorStop(.35, color + '4d'); g.addColorStop(1, color + '00');
    ctx.fillStyle = g; ctx.fillRect(x - gr, y - gr, gr * 2, gr * 2);
    circle(ctx, x, y, size * .8, color); circle(ctx, x - size * .15, y - size * .15, size * .38, '#fffbe6');
    ctx.restore();
  }
  // Accents ride on real trail samples; a sample's own position picks its accent, so accents
  // stay put as the trail ages instead of flickering from frame to frame.
  function drawKeepsakeTrail(ctx, ball, style, r, time, hot) {
    const trail = ball.trail, spec = style.trail, accents = spec.accents;
    for (let i = 1; i < trail.length; i++) {
      if (trail[i].move) continue;
      const f = i / trail.length;
      ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = spec.ribbon; ctx.lineWidth = r * (hot ? 2 : 1.55) * f; ctx.globalAlpha = f * (hot ? .62 : .45); ctx.stroke();
    }
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i], key = Math.abs(Math.round(p.x * 7.3 + p.y * 13.1));
      if (p.move || key % (hot ? 2 : 3)) continue;
      const f = (i + 1) / trail.length, size = r * (.55 + f * .75), color = accents[key % accents.length], spin = key * .37;
      ctx.save(); ctx.globalAlpha = Math.min(1, f * 1.15);
      if (spec.kind === 'blossoms') { ctx.translate(p.x, p.y); ctx.rotate(spin + time * 1.6); ctx.scale(.75, .75); sakuraPetal(ctx, size); ctx.fillStyle = color; ctx.fill(); }
      else if (spec.kind === 'fireflies') fireflyGlow(ctx, p.x + Math.sin(time * 3 + key) * 3, p.y + Math.cos(time * 2.4 + key) * 3, size * .45, color, .35 + .65 * Math.max(0, Math.sin(time * 9 + key)));
      else if (spec.kind === 'flakes') goldFlake(ctx, p.x, p.y, size * .8, color, spin + time * 4);
      else if (spec.kind === 'stars') { ctx.globalAlpha *= .45 + .55 * Math.abs(Math.sin(time * 6 + key)); sparkle(ctx, p.x, p.y, size * 1.1, color, spin); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function drawProjectile(ctx, ball, index, time, reducedMotion, fever, style) {
    if (ball.power && POWER_TINT[ball.power]) { drawPowerShot(ctx, ball, time, reducedMotion); return; }
    if (style && style.seed) { drawStyledProjectile(ctx, ball, time, reducedMotion, fever, style); return; }
    const c = FLOWERS[ball.type] || FLOWERS[['coral', 'gold', 'lilac'][index % 3]];
    const r = ball.r || 5.5, trail = ball.trail || [];
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (!reducedMotion && trail.length > 1) {
      // A tapering ribbon connects actual physics samples, giving speed and weight.
      for (let i = 1; i < trail.length; i++) {
        if (trail[i].move) continue;
        const f = i / trail.length;
        ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y);
        ctx.strokeStyle = fever || (ball.hot && !reducedMotion) ? `hsl(${(time * 240 + i * 14) % 360},95%,66%)` : c.base;
        ctx.lineWidth = r * 1.65 * f; ctx.globalAlpha = f * .53; ctx.stroke();
      }
      const start = Math.max(0, trail.length - 7);
      ctx.beginPath(); ctx.moveTo(trail[start].x, trail[start].y);
      for (let i = start + 1; i < trail.length; i++) {
        if (trail[i].move) ctx.moveTo(trail[i].x, trail[i].y);
        else ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.lineTo(ball.x, ball.y); ctx.strokeStyle = '#fffbe1'; ctx.lineWidth = r * .55; ctx.globalAlpha = .8; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!reducedMotion) {
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, r * 4.2);
      glow.addColorStop(0, c.light + 'aa'); glow.addColorStop(1, c.light + '00');
      ctx.fillStyle = glow; ctx.fillRect(ball.x - r * 4.2, ball.y - r * 4.2, r * 8.4, r * 8.4);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.shadowColor = c.base; ctx.shadowBlur = fever ? 19 : 12;
    circle(ctx, ball.x, ball.y, r + 1.3, c.base);
    ctx.shadowBlur = 0;
    circle(ctx, ball.x, ball.y, r * .78, '#fffdf2');
    circle(ctx, ball.x - r * .23, ball.y - r * .27, r * .27, '#ffffff');
    if (fever && !reducedMotion) {
      ctx.globalAlpha = .85;
      sparkle(ctx, ball.x, ball.y, r * 1.95, '#fffce999', time + index);
    }
    ctx.restore();
  }

  function drawStyledProjectile(ctx, ball, time, reducedMotion, fever, style) {
    const s = style.seed, r = ball.r || 5.5, hot = fever || ball.hot;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (!reducedMotion && (ball.trail || []).length > 1) drawKeepsakeTrail(ctx, ball, style, r, time, hot);
    if (!reducedMotion) {
      const pulse = style.id === 'firefly' ? 1 + Math.sin(time * 8) * .22 : 1, gr = r * 4.4 * pulse * (hot ? 1.25 : 1);
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, gr);
      glow.addColorStop(0, s.light + 'cc'); glow.addColorStop(1, s.light + '00');
      ctx.fillStyle = glow; ctx.fillRect(ball.x - gr, ball.y - gr, gr * 2, gr * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.shadowColor = s.base; ctx.shadowBlur = hot ? 19 : 12;
    if (style.id === 'gilded') {
      const metal = ctx.createLinearGradient(ball.x - r, ball.y - r, ball.x + r, ball.y + r);
      metal.addColorStop(0, s.core); metal.addColorStop(.45, s.light); metal.addColorStop(.7, s.base); metal.addColorStop(1, s.rim);
      circle(ctx, ball.x, ball.y, r + 1.3, metal);
    } else circle(ctx, ball.x, ball.y, r + 1.3, s.base);
    ctx.shadowBlur = 0;
    if (style.id === 'sakura') blossom(ctx, ball.x, ball.y, r * 1.15, s.light, reducedMotion ? 0 : time * 3);
    else if (style.id === 'moonlit') { circle(ctx, ball.x, ball.y, r * .8, s.core); circle(ctx, ball.x + r * .32, ball.y - r * .12, r * .62, s.light); }
    else if (style.id !== 'gilded') circle(ctx, ball.x, ball.y, r * .74, s.core);
    circle(ctx, ball.x - r * .25, ball.y - r * .28, r * .25, '#ffffff');
    if (hot && !reducedMotion) { ctx.globalAlpha = .85; sparkle(ctx, ball.x, ball.y, r * 1.95, '#ffffffaa', time); }
    ctx.restore();
  }

  function drawGuide(ctx, state, balls, time, reducedMotion) {
    const point = state.guideTarget;
    if (!point || state.status !== 'flying' || !(state.guideCharge > 0)) return;
    const charge = clamp(state.guideCharge, 0, 1);
    ctx.save();
    const halo = ctx.createRadialGradient(point.x, point.y, 3, point.x, point.y, 47);
    halo.addColorStop(0, 'rgba(255,255,255,.52)'); halo.addColorStop(.5, 'rgba(130,247,235,.27)'); halo.addColorStop(1, 'rgba(122,238,226,0)');
    ctx.fillStyle = halo; circle(ctx, point.x, point.y, 47, halo);
    const nearest = balls.slice().sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y)).slice(0, 3);
    for (const ball of nearest) {
      ctx.beginPath(); ctx.moveTo(ball.x, ball.y);
      ctx.quadraticCurveTo((ball.x + point.x) / 2 + (point.y - ball.y) * .14, (ball.y + point.y) / 2 - (point.x - ball.x) * .14, point.x, point.y);
      ctx.strokeStyle = 'rgba(255,255,255,.52)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.save(); ctx.translate(point.x, point.y); if (!reducedMotion) ctx.rotate(time * .6);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.shadowColor = '#18c6cd'; ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = i / 72 * TAU, r = 15 + Math.cos(a * 6) * 3;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();
    ctx.beginPath(); ctx.arc(point.x, point.y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
    ctx.strokeStyle = '#24bbc2'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    sparkle(ctx, point.x, point.y, 6, '#ffffff', 0);
    ctx.restore();
  }

  function drawParticle(ctx, particle, time, reducedMotion) {
    const f = clamp((particle.life == null ? 1 : particle.life) / (particle.maxLife || 1), 0, 1);
    if (!f) return;
    const size = particle.size || 2.5, color = particle.color || '#ffcd45';
    ctx.save(); ctx.globalAlpha = Math.min(1, f * 1.8);
    if (particle.kind === 'ring') {
      const q = 1 - f, rr = (particle.size || 14) + ease(q) * (particle.grow || 46);
      ctx.globalAlpha = f * .8; ctx.lineWidth = 1 + f * 4; ctx.strokeStyle = color;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, rr, 0, TAU); ctx.stroke();
      ctx.restore(); return;
    }
    if (particle.kind === 'glow') {
      ctx.globalCompositeOperation = 'lighter';
      const gr = size * 3.2, g = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, gr);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.35, color); g.addColorStop(1, color + '00');
      ctx.globalAlpha = f; ctx.fillStyle = g; ctx.fillRect(particle.x - gr, particle.y - gr, gr * 2, gr * 2);
      ctx.restore(); return;
    }
    if (particle.kind === 'firefly') {
      const blink = reducedMotion ? 1 : .3 + .7 * Math.max(0, Math.sin(time * 7 + (particle.phase || 0)));
      fireflyGlow(ctx, particle.x, particle.y, size, color, blink); ctx.restore(); return;
    }
    if (particle.kind === 'star') {
      if (!reducedMotion) ctx.globalAlpha *= .4 + .6 * Math.abs(Math.sin(time * 6 + (particle.phase || 0)));
      sparkle(ctx, particle.x, particle.y, size * 1.4, color, particle.rotation || 0); ctx.restore(); return;
    }
    if (particle.kind === 'flake') { goldFlake(ctx, particle.x, particle.y, size, color, particle.rotation || 0); ctx.restore(); return; }
    if (particle.kind === 'blossom') {
      ctx.translate(particle.x, particle.y); ctx.rotate(particle.rotation || 0);
      ctx.scale(reducedMotion ? .8 : .45 + Math.abs(Math.cos((particle.rotation || 0) * .8)) * .55, 1);
      sakuraPetal(ctx, size); ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = 'rgba(214,82,128,.35)'; ctx.lineWidth = .6; ctx.stroke();
      ctx.restore(); return;
    }
    if (particle.kind === 'spark') {
      const vx = particle.vx || 0, vy = particle.vy || 0;
      ctx.beginPath(); ctx.moveTo(particle.x, particle.y); ctx.lineTo(particle.x - vx * .035, particle.y - vy * .035);
      ctx.lineWidth = Math.max(.8, size * .6); ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke();
      sparkle(ctx, particle.x, particle.y, size * .8, '#ffffff', particle.rotation || 0);
    } else if (particle.kind === 'pollen') {
      circle(ctx, particle.x, particle.y, size * 1.9, color + (color.length === 7 ? '33' : ''));
      circle(ctx, particle.x, particle.y, size * .72, '#fffbe3');
    } else {
      ctx.translate(particle.x, particle.y);
      ctx.rotate(reducedMotion ? 0 : typeof particle.rotation === 'number' ? particle.rotation : (particle.x + particle.y) * .04 + time);
      // The changing width is a tumbling petal catching air, driven by its spin.
      const tumble = reducedMotion ? .7 : .42 + Math.abs(Math.cos((particle.rotation || time) * .7)) * .58;
      ctx.scale(tumble, 1);
      ctx.beginPath(); ctx.moveTo(0, size); ctx.bezierCurveTo(-size * 1.3, size * .13, -size, -size * .9, 0, -size);
      ctx.bezierCurveTo(size * .9, -size * 1.2, size * 1.3, size * .1, 0, size);
      ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, size * .58); ctx.quadraticCurveTo(-size * .15, 0, 0, -size * .65);
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = .65; ctx.stroke();
    }
    ctx.restore();
  }

  // Callout lettering: gold for numbers and the first praise word, then each bigger word in a new flower's color.
  const FACES = [
    { stops: ['#fff8ba', '#ffe984', '#ffc956', '#e99a4d'], under: '#be7e49' },
    { stops: ['#fff0f4', '#ffb0c8', '#ff6f9a', '#d93c6c'], under: '#a8284f' },
    { stops: ['#f7f0ff', '#d6c2ff', '#a983ff', '#7550e0'], under: '#523aa6' },
    { stops: ['#effaff', '#b4e2ff', '#5cb8ff', '#2582e6'], under: '#1c5fae' },
    { stops: ['#fff3e8', '#ffc59a', '#ff8a45', '#e2531a'], under: '#a63a12' },
    { stops: ['#fffbe0', '#ffe27a', '#ff9fc4', '#9e7bff'], under: '#7a4fb8' }
  ];
  function drawCallout(ctx, floater, reducedMotion) {
    const life = Math.max(0, floater.life == null ? 1 : floater.life), duration = floater.maxLife || 1;
    const age = Math.max(0, duration - life), text = String(floater.text || '');
    const combo = floater.kind === 'combo' || /CHAIN|in bloom|BLOOM CHAIN/i.test(text);
    const bonus = floater.kind === 'bonus' || /BALLS/i.test(text);
    const wave = floater.kind === 'wave';
    const number = text.match(/[+]?\d+/)?.[0] || '';
    const praise = combo && floater.label != null, value = wave || praise ? text : number || text;
    const face = FACES[praise ? Math.max(0, Math.floor(Number(floater.tier) || 0)) % FACES.length : 0];
    const scale = reducedMotion ? 1 : .55 + .45 * (1 - Math.exp(-age * 12) * Math.cos(age * 22));
    const y = combo ? Math.max(118, floater.y) : floater.y;
    const fade = Math.min(1, life / .24) * (reducedMotion ? 1 : Math.min(1, age / .045));
    ctx.save(); ctx.translate(clamp(floater.x, 78, 342), y - (reducedMotion ? 0 : ease(age / duration) * 6));
    ctx.scale(scale, scale); ctx.globalAlpha = fade; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = wave ? 36 : praise ? (value.length > 10 ? 34 : 40) : combo ? 43 : bonus ? 31 : 21;
    ctx.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
    // A restrained metallic relief gives the number the finish of a small trophy.
    const fill = ctx.createLinearGradient(0, -size * .5, 0, size * .5);
    face.stops.forEach((color, i) => fill.addColorStop([0, .3, .57, 1][i], color));
    ctx.lineJoin = 'round'; ctx.lineWidth = praise ? 3.2 : 2.1; ctx.strokeStyle = '#fffce5';
    ctx.shadowColor = 'rgba(53,53,89,.45)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
    ctx.strokeText(value, 0, 0); ctx.fillStyle = face.under; ctx.fillText(value, 0, 1.7);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.fillStyle = fill; ctx.fillText(value, 0, 0);
    if (combo || bonus || wave) {
      const width = praise ? ctx.measureText(value).width : 0;
      ctx.font = '600 13px Fredoka, system-ui, sans-serif';
      const label = wave || praise ? String(floater.label || '') : combo ? 'chain!' : 'extra seeds';
      ctx.shadowColor = 'rgba(255,255,255,.95)'; ctx.shadowBlur = 4;
      // A cream outline keeps the small line readable on the dark caves as well as the bright meadow.
      ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(255,252,236,.92)'; ctx.strokeText(label, 0, size * .62);
      ctx.fillStyle = '#245866'; ctx.fillText(label, 0, size * .62);
      ctx.shadowBlur = 0;
      const offset = wave ? 124 : praise ? width / 2 + 14 : combo ? 49 : 43;
      ctx.globalAlpha *= .86;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * (offset - 2), 13); ctx.quadraticCurveTo(side * (offset + 7), 0, side * offset, -12);
        ctx.strokeStyle = '#c49645'; ctx.lineWidth = 1.1; ctx.stroke();
        for (let i = 0; i < 3; i++) leaf(ctx, side * (offset + 2), 8 - i * 7, 7, 3, side * (.9 + i * .1), '#eac76e', '#cda150');
      }
      if (!reducedMotion && age < .52) {
        ctx.globalAlpha *= 1 - age / .52;
        sparkle(ctx, -offset - 7 - age * 10, -18 - age * 7, 3.1, '#fff9cf', .3);
        sparkle(ctx, offset + 10 + age * 10, -9 - age * 9, 2.6, '#fff9cf', -.2);
      }
    }
    ctx.restore();
  }

  // Powerups, drawn like the rest of the board: flat shapes with a colored ink edge and one shade cut.
  // The same drawings serve the tray, the shelf, the launcher, the shot in flight and the gift bubbles.
  const POWER_TINT = { sunburst: '#ffb534', dandelion: '#cfe3f0', beeline: '#ffd23f', lullaby: '#b9a6ff' };
  // An arc from one angle to another that goes the way passing through a third.
  function arcVia(ctx, cx, cy, radius, from, to, via) {
    const turn = a => ((a % TAU) + TAU) % TAU;
    ctx.arc(cx, cy, radius, from, to, !(turn(via - from) < turn(to - from)));
  }
  function iconSun(ctx, r, time) {
    ctx.save(); ctx.rotate(time * .5);
    for (let i = 0; i < 10; i++) {
      const reach = r * (i % 2 ? .82 : 1);
      ctx.save(); ctx.rotate(i / 10 * TAU);
      ctx.beginPath(); ctx.moveTo(r * .46, -r * .17); ctx.quadraticCurveTo(reach * .8, -r * .09, reach, 0); ctx.quadraticCurveTo(reach * .8, r * .09, r * .46, r * .17); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#ffc94a' : '#ffad2e'; ctx.fill(); ctx.lineWidth = r * .07; ctx.strokeStyle = '#d8732a'; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    circle(ctx, 0, 0, r * .56, '#ffd54a');
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * .56, 0, TAU); ctx.clip();
    circle(ctx, r * .2, r * .22, r * .5, '#ffc23c');
    ctx.restore();
    circle(ctx, 0, 0, r * .56, null, '#d8732a', r * .08);
    ctx.beginPath(); ctx.ellipse(-r * .24, -r * .27, r * .12, r * .07, -.6, 0, TAU); ctx.fillStyle = '#fffbe0'; ctx.fill();
    ctx.fillStyle = '#7a3f17';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * r * .17, -r * .05, r * .055, r * .085, 0, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, r * .05, r * .17, .2 * Math.PI, .8 * Math.PI); ctx.lineWidth = r * .065; ctx.lineCap = 'round'; ctx.strokeStyle = '#7a3f17'; ctx.stroke();
    ctx.globalAlpha *= .7; circle(ctx, -r * .31, r * .13, r * .08, '#ff8c78'); circle(ctx, r * .31, r * .13, r * .08, '#ff8c78');
  }
  function puff(ctx, x, y, size, spokes, tilt) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt || 0);
    ctx.lineCap = 'round';
    for (let i = 0; i < spokes; i++) {
      const a = i / spokes * TAU, ex = Math.cos(a) * size, ey = Math.sin(a) * size;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.strokeStyle = '#b9cad6'; ctx.lineWidth = Math.max(.6, size * .05); ctx.stroke();
      circle(ctx, ex, ey, size * .16, '#ffffff', '#9fb5c6', Math.max(.5, size * .045));
    }
    ctx.restore();
  }
  function iconDandelion(ctx, r) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * .12, r * .98); ctx.quadraticCurveTo(r * .18, r * .45, 0, r * .05); ctx.strokeStyle = '#3f9e5e'; ctx.lineWidth = r * .11; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * .14, r * .72); ctx.quadraticCurveTo(r * .5, r * .55, r * .58, r * .7); ctx.quadraticCurveTo(r * .42, r * .82, r * .14, r * .72); ctx.fillStyle = '#5cc27a'; ctx.fill();
    ctx.lineWidth = r * .05; ctx.strokeStyle = '#2f8a4e'; ctx.stroke();
    circle(ctx, 0, -r * .2, r * .64, 'rgba(255,255,255,.92)', '#a9bfd0', r * .05);
    puff(ctx, 0, -r * .2, r * .52, 16, .1);
    circle(ctx, 0, -r * .2, r * .13, '#c08d4c', '#8d5f2c', r * .05);
    puff(ctx, r * .78, -r * .78, r * .16, 7, .4);
    puff(ctx, r * .92, -r * .44, r * .11, 6, 1.1);
  }
  function iconBee(ctx, r, time, flap) {
    const beat = flap == null ? .85 : flap;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save(); ctx.globalAlpha *= .9;
    for (const [x, y, w, h, a] of [[-r * .12, -r * .44, r * .3, r * .2, -.45], [r * .2, -r * .42, r * .24, r * .17, .3]]) {
      ctx.beginPath(); ctx.ellipse(x, y, w, h * beat, a, 0, TAU); ctx.fillStyle = 'rgba(226,246,255,.95)'; ctx.fill();
      ctx.lineWidth = r * .055; ctx.strokeStyle = '#7fb3d4'; ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-r * .62, 0); ctx.lineTo(-r * .84, r * .04); ctx.lineTo(-r * .62, r * .12); ctx.fillStyle = '#3b2a1e'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-r * .06, r * .04, r * .6, r * .42, 0, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#3b2a1e'; ctx.fillRect(-r * .3, -r * .5, r * .15, r); ctx.fillRect(r * .02, -r * .5, r * .15, r);
    ctx.fillStyle = '#f2b52c'; ctx.beginPath(); ctx.ellipse(r * .08, r * .3, r * .62, r * .2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(-r * .06, r * .04, r * .6, r * .42, 0, 0, TAU); ctx.lineWidth = r * .08; ctx.strokeStyle = '#7a4f12'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * .58, -r * .2); ctx.quadraticCurveTo(r * .7, -r * .62, r * .9, -r * .58); ctx.lineWidth = r * .05; ctx.strokeStyle = '#3b2a1e'; ctx.stroke();
    circle(ctx, r * .9, -r * .58, r * .05, '#3b2a1e');
    circle(ctx, r * .52, 0, r * .27, '#3b2a1e', '#24180f', r * .05);
    circle(ctx, r * .6, -r * .06, r * .09, '#ffffff'); circle(ctx, r * .62, -r * .05, r * .045, '#1b120b');
    circle(ctx, r * .44, r * .1, r * .05, '#ff8c9a');
  }
  function iconMoon(ctx, r, time) {
    const R = r * .66, cx = r * .42, cy = -r * .28, q = R * .82, d = Math.hypot(cx, cy);
    const a = (R * R - q * q + d * d) / (2 * d), h = Math.sqrt(Math.max(0, R * R - a * a));
    const px = a * cx / d, py = a * cy / d, ox = -cy / d * h, oy = cx / d * h;
    const p1 = [px + ox, py + oy], p2 = [px - ox, py - oy], away = Math.atan2(-cy, -cx);
    const shape = () => {
      ctx.beginPath();
      arcVia(ctx, 0, 0, R, Math.atan2(p1[1], p1[0]), Math.atan2(p2[1], p2[0]), away);
      arcVia(ctx, cx, cy, q, Math.atan2(p2[1] - cy, p2[0] - cx), Math.atan2(p1[1] - cy, p1[0] - cx), away);
      ctx.closePath();
    };
    shape(); ctx.fillStyle = '#c9b8ff'; ctx.fill();
    ctx.save(); shape(); ctx.clip(); circle(ctx, R * .28, R * .5, R * .9, '#ad98f2'); ctx.restore();
    shape(); ctx.lineWidth = r * .08; ctx.lineJoin = 'round'; ctx.strokeStyle = '#6a55c0'; ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-R * .5, -R * .02, R * .14, .15 * Math.PI, .85 * Math.PI); ctx.lineWidth = r * .06; ctx.strokeStyle = '#4b3a8f'; ctx.stroke();
    ctx.globalAlpha *= .7; circle(ctx, -R * .36, R * .3, R * .1, '#ff9fc0'); ctx.globalAlpha /= .7;
    const z = (x, y, s) => { ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.lineTo(x + s, y + s); ctx.lineWidth = s * .55; ctx.strokeStyle = '#6a55c0'; ctx.stroke(); };
    const lift = time ? Math.sin(time * 2) * r * .04 : 0;
    z(r * .5, -r * .5 + lift, r * .13); z(r * .78, -r * .82 + lift, r * .09);
    sparkle(ctx, r * .78, r * .38, r * .12, '#fff3b0', .2);
  }
  function drawPowerIcon(ctx, id, x, y, r, time, flap) {
    if (!ctx || !POWER_TINT[id]) return;
    ctx.save(); ctx.translate(x, y);
    if (id === 'sunburst') iconSun(ctx, r, time || 0);
    else if (id === 'dandelion') iconDandelion(ctx, r);
    else if (id === 'beeline') iconBee(ctx, r, time || 0, flap);
    else iconMoon(ctx, r, time || 0);
    ctx.restore();
  }
  // A gift bubble with a ribbon bow, holding the powerup it gives. It glows so it reads on dark scenes.
  function drawGift(ctx, bud, time, still) {
    const r = bud.r || 14, wobble = still ? 0 : Math.sin(time * 3 + bud.x * .05) * .04;
    let pop = 1;
    if (!still && typeof bud.spawnAt === 'number') { const k = clamp((time - bud.spawnAt) / .5, 0, 1); pop = .4 + .6 * ease(k); }
    ctx.save(); ctx.translate(bud.x, bud.y); ctx.scale((1 + wobble) * pop, (1 - wobble) * pop);
    const glow = ctx.createRadialGradient(0, 0, r * .4, 0, 0, r * 2.1);
    glow.addColorStop(0, 'rgba(255,244,190,.5)'); glow.addColorStop(1, 'rgba(255,244,190,0)');
    ctx.fillStyle = glow; ctx.fillRect(-r * 2.1, -r * 2.1, r * 4.2, r * 4.2);
    const skin = ctx.createRadialGradient(-r * .3, -r * .35, r * .1, 0, 0, r);
    skin.addColorStop(0, 'rgba(255,255,255,.75)'); skin.addColorStop(.55, 'rgba(214,240,255,.42)'); skin.addColorStop(1, 'rgba(176,214,255,.6)');
    circle(ctx, 0, 0, r, skin);
    drawPowerIcon(ctx, bud.gift, 0, r * .06, r * .66, still ? 0 : time, .8);
    circle(ctx, 0, 0, r, null, '#ffffff', 2);
    circle(ctx, 0, 0, r + 1.3, null, '#6fa6cf', 1);
    ctx.beginPath(); ctx.arc(0, 0, r * .74, 3.6, 4.4); ctx.lineCap = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
    // The bow sits on top like a gift tag.
    ctx.translate(0, -r - 1); ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(side * 9, -9, side * 11, 2, 0, 0); ctx.fillStyle = '#ff7aa6'; ctx.fill();
      ctx.lineWidth = 1.1; ctx.strokeStyle = '#c84f7c'; ctx.stroke();
    }
    circle(ctx, 0, 0, 2.4, '#ff9cbd', '#c84f7c', 1);
    ctx.restore();
    if (!still) sparkle(ctx, bud.x + Math.cos(time * 2) * (r + 6), bud.y + Math.sin(time * 2) * (r + 6), 2.6, '#fff8cf', time);
  }
  // A powered shot in flight: a spinning little sun, a bee on its dotted bee line, or a dandelion seed.
  function drawPowerShot(ctx, ball, time, reducedMotion) {
    const trail = ball.trail || [], tint = POWER_TINT[ball.power] || '#ffffff';
    ctx.save(); ctx.lineCap = 'round';
    if (!reducedMotion && trail.length > 1) {
      if (ball.power === 'beeline') {
        for (let i = 0; i < trail.length; i += 2) { ctx.globalAlpha = i / trail.length * .8; circle(ctx, trail[i].x, trail[i].y, 1.5, '#5b3d1c'); }
      } else {
        for (let i = 1; i < trail.length; i++) {
          if (trail[i].move) continue;
          const f = i / trail.length;
          ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y);
          ctx.strokeStyle = tint; ctx.lineWidth = 9 * f; ctx.globalAlpha = f * .45; ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    if (!reducedMotion) {
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, 26);
      glow.addColorStop(0, tint + '99'); glow.addColorStop(1, tint + '00');
      ctx.fillStyle = glow; ctx.fillRect(ball.x - 26, ball.y - 26, 52, 52);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (ball.power === 'beeline') {
      ctx.translate(ball.x, ball.y);
      const heading = Math.atan2(ball.vy || 0, ball.vx || 1);
      // The bee always flies right side up, facing the way it is going.
      if (Math.cos(heading) < 0) { ctx.scale(-1, 1); ctx.rotate(Math.PI - heading); } else ctx.rotate(heading);
      drawPowerIcon(ctx, 'beeline', 0, 0, 12, time, reducedMotion ? .85 : .35 + Math.abs(Math.sin(time * 40)) * .65);
    } else if (ball.power === 'sunburst') drawPowerIcon(ctx, 'sunburst', ball.x, ball.y, 12, reducedMotion ? 0 : time * 3);
    else {
      const away = Math.atan2(-(ball.vy || -1), -(ball.vx || 0));
      ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x + Math.cos(away) * 9, ball.y + Math.sin(away) * 9); ctx.strokeStyle = '#d9c7a4'; ctx.lineWidth = 1.2; ctx.stroke();
      puff(ctx, ball.x + Math.cos(away) * 10, ball.y + Math.sin(away) * 10, 6.5, 9, time);
      ctx.beginPath(); ctx.ellipse(ball.x, ball.y, 2.4, 4, away + Math.PI / 2, 0, TAU); ctx.fillStyle = '#c08d4c'; ctx.fill(); ctx.lineWidth = .9; ctx.strokeStyle = '#8d5f2c'; ctx.stroke();
    }
    ctx.restore();
  }
  // Lullaby: a soft dusk over the board, little z's over the dozing flowers and a moon that counts down.
  // The dusk goes under the flowers; the z's and the moon go over them.
  function drawLullaby(ctx, state, time, reducedMotion, buds, over) {
    const left = Number(state.lullaby) || 0;
    if (left <= 0) return;
    const fade = Math.min(1, left / .5) * Math.min(1, (6 - left) / .3 + .2);
    ctx.save();
    if (!over) { ctx.globalAlpha = .2 * fade; ctx.fillStyle = '#5b47b8'; ctx.fillRect(0, 0, 420, 560); ctx.restore(); return; }
    let shown = 0;
    for (const bud of buds) {
      if (bud.bloomed || bud.gift || shown >= 12) continue;
      const first = bud.group ? buds.find(other => other.group === bud.group && !other.bloomed) : bud;
      if (first !== bud) continue;
      shown++;
      const rise = reducedMotion ? 0 : (time * 12 + bud.x * .7) % 18;
      ctx.globalAlpha = fade * (reducedMotion ? .9 : .45 + .55 * (1 - rise / 18));
      const s = 3.6, x = bud.x + (bud.r || 12) * .8, y = bud.y - (bud.r || 12) - 4 - rise;
      ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.lineTo(x + s, y + s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.lineWidth = 1.7; ctx.strokeStyle = '#6a55c0'; ctx.stroke();
    }
    ctx.globalAlpha = fade;
    circle(ctx, 384, 38, 19, 'rgba(255,253,244,.94)', '#d9cdfa', 2);
    ctx.beginPath(); ctx.arc(384, 38, 19, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(left / 6, 0, 1)); ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#8b74e6'; ctx.stroke();
    drawPowerIcon(ctx, 'lullaby', 384, 39, 13, reducedMotion ? 0 : time);
    ctx.restore();
  }

  function draw(ctx, state, time, options) {
    if (!ctx) return;
    state = state || {}; options = options || {}; time = Number(time) || 0;
    const colors = PAPER[options.theme] || PAPER.meadow;
    ctx.save();
    const rush = state.mode === 'rush';
    drawGarden(ctx, 420, 560, options.theme, { mode: state.mode });
    if (!options.reducedMotion) drawAmbient(ctx, time, options.theme);
    drawAtmosphere(ctx, state, time, options);
    if (rush && !options.reducedMotion) drawTempo(ctx, state, time);
    const shake = options.shake;
    if (shake && !options.reducedMotion) { ctx.translate(210 + shake.x, 280 + shake.y); ctx.rotate(shake.r || 0); ctx.translate(-210, -280); }

    const buds = Array.isArray(state.buds) ? state.buds : [];
    if (rush) drawRushBoundary(ctx, state, options.theme, time, options.reducedMotion);
    else {
      drawLivingFoliage(ctx, time, colors, options.reducedMotion);
      drawVines(ctx, buds, time, colors, options.reducedMotion);
    }
    drawCurrents(ctx, state.currents, time, options.reducedMotion, options.theme);
    if (scenery(options.theme)) drawBurrows(ctx, state.gates, time, options.reducedMotion, options.theme);
    else drawGates(ctx, state.gates, time, options.reducedMotion);
    drawBriars(ctx, buds);
    if (rush) drawLullaby(ctx, state, time, options.reducedMotion, buds, false);
    // Bloom rings are drawn under the flowers, never on top of aiming feedback.
    for (const bud of buds) {
      if (bud.bloomed && !options.reducedMotion && typeof bud.bloomAt === 'number') {
        const age = time - bud.bloomAt;
        if (age >= 0 && age < .85) {
          const c = FLOWERS[bud.type] || FLOWERS.coral;
          if (age < .16) {
            // A brief additive flash sells the instant of impact; a cached sprite per color, faded with alpha.
            const f = 1 - age / .16, fr = (bud.r || 13) * (1.4 + (1 - f) * 1.9), sprite = flashSprite(bud.type);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            if (sprite) { ctx.globalAlpha *= f; ctx.drawImage(sprite.surface, bud.x - fr, bud.y - fr, fr * 2, fr * 2); }
            else {
              const flash = ctx.createRadialGradient(bud.x, bud.y, 0, bud.x, bud.y, fr);
              flash.addColorStop(0, `rgba(255,255,240,${.9 * f})`); flash.addColorStop(.45, c.light + Math.round(f * 170).toString(16).padStart(2, '0'));
              flash.addColorStop(1, c.base + '00');
              ctx.fillStyle = flash; ctx.fillRect(bud.x - fr, bud.y - fr, fr * 2, fr * 2);
            }
            ctx.restore();
          }
          ctx.save(); ctx.globalAlpha = (1 - age / .85) * .56;
          const radius = (bud.r || 13) + ease(age / .85) * 37;
          circle(ctx, bud.x, bud.y, radius, null, c.base, 2.3 - age * 2);
          if (age > .1) circle(ctx, bud.x, bud.y, radius * .74, null, '#ffffff', 1.4);
          // Five sparkles ride the ring, white and the flower's light color alternating: one path and fill per color.
          for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            for (let i = pass; i < 5; i += 2) {
              const a = i * TAU / 5 + bud.x * .04 + age * .7;
              starPath(ctx, bud.x + Math.cos(a) * radius, bud.y + Math.sin(a) * radius, (1 - age / .85) * 3.7, a);
            }
            ctx.fillStyle = pass ? c.light : '#ffffff'; ctx.fill();
          }
          ctx.restore();
        }
      }
    }
    const unfurling = pickUnfurls(buds, time, options);
    unfurlOptions.time = time; unfurlOptions.reducedMotion = Boolean(options.reducedMotion); unfurlOptions.quality = Number(options.quality) || 0;
    findTremble(state);
    for (const bud of buds) {
      if (bud.gift) { if (!bud.bloomed) drawGift(ctx, bud, time, options.reducedMotion); continue; }
      const age = typeof bud.bloomAt === 'number' ? time - bud.bloomAt : Infinity;
      // Every bloom takes the same .55 s, whether it unfurls petal by petal or crossfades (over budget).
      const openness = bud.bloomed ? (options.reducedMotion || typeof bud.bloomAt !== 'number' ? 1 : clamp(age / UNFURL, 0, 1)) : 0;
      const hp = Math.max(1, Number(bud.hp) || 1), maxHp = Math.max(hp, Number(bud.maxHp) || 1), radius = bud.r || 16;
      ctx.save();
      // A wave tumbles in from above (stage sets enterAt): a ghost waits in place, then the bud drops onto it.
      // Only the drawing moves; the bud is already live where the ghost is.
      let entering = false;
      if (!options.reducedMotion && typeof bud.enterAt === 'number') {
        const span = Number(bud.enterDur) > 0 ? Number(bud.enterDur) : .4;
        if (!(typeof bud.spawnAt === 'number' && bud.spawnAt > bud.enterAt + span)) {
          const k = (time - bud.enterAt) / span;
          entering = true;
          if (k < 0) ctx.globalAlpha *= .25;
          else if (k < 1) {
            const drop = Number.isFinite(bud.enterDrop) ? bud.enterDrop : 48;
            ctx.translate(0, -drop * (1 - (bud.enterBounce ? easeBounce(k) : bloomBack(k, 1.4))));
            ctx.globalAlpha *= Math.min(1, .25 + k * 3);
          }
        }
      }
      // The group about to cross the line trembles.
      const shaking = trembles(bud);
      if (shaking && !options.reducedMotion) {
        const amp = 1.5 * (.45 + .55 * clamp((.8 - trembleTime) / .35, 0, 1));
        ctx.translate(Math.sin(time * 22 * TAU + (flowerVariants.get(bud) || 0) * 2.1) * amp, 0);
      }
      if (!options.reducedMotion && !bud.bloomed && typeof bud.hitAt === 'number') {
        const hitAge = time - bud.hitAt;
        if (hitAge >= 0 && hitAge < .25) {
          const squash = Math.sin(hitAge / .25 * Math.PI);
          ctx.translate(bud.x, bud.y); ctx.scale(1 + squash * .18, 1 - squash * .20); ctx.translate(-bud.x, -bud.y);
        }
      }
      if (!bud.bloomed && hp > 1 && !bud.boss && !bud.geode) {
        for (let layer = 1; layer < hp; layer++) {
          const rr = radius + 2.5 + layer * 3;
          ctx.beginPath();
          for (let i = 0; i <= 48; i++) {
            const a = i / 48 * TAU, radial = rr + Math.cos(a * 8) * .9;
            const x = bud.x + Math.cos(a) * radial, y = bud.y + Math.sin(a) * radial;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.1; ctx.stroke();
          ctx.strokeStyle = layer === 1 ? '#24bcc7' : '#bc69e5'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
      // A descending flower retains its drawn variation instead of changing
      // petal orientation whenever its position crosses a pixel boundary.
      variantOf(bud);
      if (!entering && !options.reducedMotion && typeof bud.spawnAt === 'number') {
        // A new Rush wave pops in with a little overshoot; only the drawing scales, never the hitbox.
        const k = (time - bud.spawnAt) / .42;
        if (k >= 0 && k < 1) {
          const back = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
          ctx.translate(bud.x, bud.y); ctx.scale(back, back); ctx.translate(-bud.x, -bud.y); ctx.globalAlpha *= Math.min(1, k * 3);
        }
      }
      if (!options.reducedMotion) {
        // Visual-only life: buds nod on their stems, open flowers drift and breathe. Collision geometry is untouched.
        // A fresh bloom eases from the bud's quick nod into the flower's slow drift, and starts breathing only once open.
        const ph = (flowerVariants.get(bud) || 0) * 1.37, nod = Math.sin(time * 2.1 + ph) * .07;
        let sway = nod, breathe = 1;
        if (bud.bloomed) {
          sway = nod + (Math.sin(time * 1.1 + ph) * .05 - nod) * smooth(age / UNFURL);
          breathe = 1 + Math.sin(time * 1.7 + ph) * .035 * clamp((age - UNFURL) / .5, 0, 1);
        }
        ctx.translate(bud.x, bud.y); ctx.rotate(sway); ctx.scale(breathe, breathe); ctx.translate(-bud.x, -bud.y);
      }
      if (bud.boss && !bud.bloomed) drawBossLeaves(ctx, bud, time, options.reducedMotion);
      if (bud.briar && !bud.bloomed) drawThorns(ctx, bud);
      if (bud.puff) { if (!bud.bloomed) drawPuffcap(ctx, bud, time, options.reducedMotion); }
      else if (bud.geode && !bud.bloomed) drawGeode(ctx, bud, time);
      else if (bud.gem && !bud.bloomed) drawGem(ctx, bud, time, options.reducedMotion);
      else if (bud.bloomed && unfurling.has(bud)) drawUnfurl(ctx, bud, age, unfurlOptions);
      else if (!options.reducedMotion && (bud.bloomed ? age >= 0 && age < FLASH : time - bud.hitAt >= 0 && time - bud.hitAt < FLASH)) drawSilhouette(ctx, bud.x, bud.y, radius, bud.type, 1.08);
      else drawFlower(ctx, bud.x, bud.y, radius, bud.type, openness, time, flowerVariants.get(bud));
      if (bud.briar && bud.bloomed && bud.regrowAt) drawRegrow(ctx, bud, time);
      if (bud.shield && !bud.bloomed) drawCup(ctx, bud);
      if (bud.shell && !bud.bloomed) drawShell(ctx, bud);
      if (bud.boss && !bud.bloomed) { drawBossFace(ctx, bud, time, options.reducedMotion); drawBossRing(ctx, bud); }
      if (bud.relay && !bud.bloomed) drawRelayCrown(ctx, bud);
      if (!bud.bloomed && (bud.power || bud.burst || bud.kind === 'burst')) {
        ctx.save(); ctx.shadowColor = '#fff17a'; ctx.shadowBlur = options.reducedMotion ? 0 : 12;
        sparkle(ctx, bud.x, bud.y, (bud.r || 13) * .52, '#ffffff', -.1);
        ctx.restore();
      }
      if (!bud.bloomed && maxHp > 1 && !bud.boss) {
        for (let i = 0; i < Math.min(maxHp, 5); i++) {
          const x = bud.x + (i - (Math.min(maxHp, 5) - 1) / 2) * 5.5;
          circle(ctx, x, bud.y + radius + 9, 2, i < hp ? '#079aaa' : 'rgba(255,255,255,.28)', '#ffffff', .9);
        }
      }
      // Animations off: the trembling group shows a still red pip instead.
      if (shaking && options.reducedMotion) circle(ctx, bud.x, bud.y + radius + (maxHp > 1 && !bud.boss ? 17 : 10), 2.5, '#ff3d6e', '#ffffff', 1);
      ctx.restore();
    }
    drawFlares(ctx, buds, time, options);
    if (rush) drawLullaby(ctx, state, time, options.reducedMotion, buds, true);
    for (const bumper of state.bumpers || []) {
      if (bumper.kind === 'rock' && root.BloomScenery) root.BloomScenery.drawRock(ctx, bumper, options.theme);
      else drawBumper(ctx, bumper, options.selectedBumper === bumper.id, time, colors, options.reducedMotion);
    }
    if (options.showAim !== false && state.aim && (state.status !== 'flying' || options.showAim === true)) drawAim(ctx, state.aim, colors, time, state.nextType, options.reducedMotion);
    drawLauncher(ctx, state, time, colors, options.keepsake, options.kick, options.reducedMotion);

    const balls = Array.isArray(state.balls) ? state.balls : state.ball ? [state.ball] : [];
    for (const particle of state.particles || []) drawParticle(ctx, particle, time, options.reducedMotion);
    if (!rush) drawGuide(ctx, state, balls, time, options.reducedMotion);
    drawChainLinks(ctx, state, time, options);
    balls.forEach((ball, index) => drawProjectile(ctx, ball, index, time, options.reducedMotion, state.feverTime > 0, options.keepsake));

    for (const floater of state.floaters || []) {
      if (floater.kind === 'pop') drawPop(ctx, floater, options.reducedMotion);
      else drawCallout(ctx, floater, options.reducedMotion);
    }
    ctx.restore();
    if (options.flash > 0 && !options.reducedMotion) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const v = ctx.createRadialGradient(210, 280, 60, 210, 280, 380);
      v.addColorStop(0, `rgba(255,248,220,${options.flash * .28})`); v.addColorStop(1, `rgba(255,190,230,${options.flash * .12})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, 420, 560); ctx.restore();
    }
  }

  root.BloomArt = { draw, drawFlower, drawGarden, drawMoon, koiFish, drawProjectile, drawParticle, drawSeed, drawPowerIcon, drawUnfurl, drawChainLinks };
})(typeof window !== 'undefined' ? window : globalThis);
