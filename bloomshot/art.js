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
  // Room for a level's open flowers in all seven variations, their closed sprites and the boss (prewarm fills it).
  const flowerCache = new Map(), FLOWER_CACHE = 96;
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
          warmMark(surface);
          const context = surface.getContext('2d'); context.scale(3, 3);
          paintFlower(context, size / 2, size / 2, r, type, o, time, phase);
          sprite = { surface, size };
          if (flowerCache.size >= FLOWER_CACHE) flowerCache.delete(flowerCache.keys().next().value);
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
  // Every sprite painted (or sheet frame baked) bumps this count, so the app can tell a frame that paid for a first
  // paint from one that is really slow (the quality governor skips the former).
  let painted = 0;
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
  // A boss is one of a kind, so it always wears the first variation and its open sprite can be painted ahead.
  function variantOf(bud) {
    if (!flowerVariants.has(bud)) flowerVariants.set(bud, bud.boss ? 0 : ((Math.floor(Number(bud.x) || 0) * 31 + Math.floor(Number(bud.y) || 0) * 17) % 7 + 7) % 7);
    return flowerVariants.get(bud);
  }
  function seedOf(bud) {
    let seed = budSeeds.get(bud);
    if (seed === undefined) { seed = idSeed(bud.id != null ? bud.id : `${Math.round(Number(bud.x) || 0)}:${Math.round(Number(bud.startY ?? bud.y) || 0)}`); budSeeds.set(bud, seed); }
    return seed;
  }
  function makeSurface(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (typeof OffscreenCanvas !== 'undefined') { try { return warmMark(new OffscreenCanvas(w, h)); } catch (error) { /* fall back below */ } }
    if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
      const surface = document.createElement('canvas'); surface.width = w; surface.height = h; return warmMark(surface);
    }
    return null;
  }
  // Painting into a sprite's canvas only records the strokes: the browser does the real work (and hands the result
  // to the GPU) the first time the sprite is drawn somewhere. While the warm-up runs, every canvas it paints into is
  // noted here, and the warm-up then draws each one once onto the board, nearly invisibly, so that cost lands in the
  // level's intro instead of on a bloom's first frame in play.
  let warmDirty = null;
  function warmMark(surface) { if (warmDirty && surface) warmDirty.add(surface); return surface; }
  // A sprite painted once at 3x inside the box (x0, y0)-(x1, y1) around its own origin. Null where there is no canvas
  // (node), and callers then draw plain paths.
  function atlasSprite(key, x0, y0, x1, y1, paint) {
    if (atlas.has(key)) return atlas.get(key);
    const w = Math.ceil((x1 - x0) * 3), h = Math.ceil((y1 - y0) * 3), surface = makeSurface(w, h);
    let sprite = null;
    const g = surface && surface.getContext('2d');
    if (g) { g.scale(3, 3); g.translate(-x0, -y0); paint(g); sprite = { surface, x: x0, y: y0, w: w / 3, h: h / 3 }; painted++; }
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
  // At most sixteen sheets are kept (a level's flowers need ten to sixteen, all baked ahead by prewarm). A full cache only frees a sheet no bloom has drawn for a few seconds; otherwise the
  // new bloom goes petal by petal, so boards that mix sizes (gems, geodes) never make sheets churn. Bosses are not
  // cached at all, so they never push a sheet out.
  const SHEET_COLS = 6, SHEET_SCALE = 2.25, SHEET_MAX = 16, SHEET_IDLE = 180;
  const sheets = new Map(), sheetOf = new WeakMap();
  let sheetClock = 0;
  const sheetDone = sheet => { for (let k = 1; k < sheet.frames; k++) if (!sheet.baked[k]) return false; return true; };
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
    sheets.set(key, sheet); sheetOf.set(surface, sheet);
    return sheet;
  }
  // The frame nearest this age, painted now if it never has been. Petals open in order from the lead (0, 1, -1, 2,
  // -2 ...): each grows from nothing and swings from its folded angle to its open one with a little overshoot, and an
  // outer petal catches the light as it arrives.
  function sheetFrame(sheet, sprite, age) {
    const k = clamp(Math.round((age - sheet.from) / sheet.step), 0, sheet.frames - 1);
    // Frame 0 is the layer before it starts to open: never drawn, so never painted.
    if (k === 0 || sheet.baked[k]) return k;
    sheet.baked[k] = 1; painted++; warmMark(sheet.surface);
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
    // A boss gets no white frame: its hit is held long (hit-stop and slow motion), so its own bud cracks instead.
    const white = !still && age < FLASH && !bud.boss;
    if (!sprites.ready || !readBase(ctx)) {
      // No canvas to paint sprites into (node): the white frame, then the plain crossfade, with shards as paths.
      if (white) drawSilhouette(ctx, x, y, r, type, 1.08);
      else drawFlower(ctx, x, y, r, type, age / UNFURL, time, variant);
      ctx.restore();
      if (!still) { ctx.save(); drawShards(ctx, x, y, r, type, impact, seed, age, quality); ctx.restore(); }
      return;
    }
    const alpha = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    if (white) {
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
  // A flower that has sunk out of sight past the danger line gets no flare (its light would hang on the soil).
  function drawFlares(ctx, buds, time, options, line = Infinity) {
    if (options.reducedMotion) return;
    const glints = !((Number(options.quality) || 0) >= 1);
    let started = false, glow = null, alpha = 1, op = 'source-over', shine = 0;
    for (const bud of buds) {
      if (!bud || typeof bud.flareAt !== 'number') continue;
      const age = time - bud.flareAt;
      // A flower's flare lasts .35 s and its ring .5 s.
      if (!(age >= 0 && age < .5)) continue;
      if (!started) { started = true; ctx.save(); alpha = ctx.globalAlpha; op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; glow = goldSprite(); }
      if (age >= .35) continue;
      const seen = sinkAlpha(bud, time, line, false);
      if (!(seen > 0)) continue;
      const q = age / .35, r = Number(bud.r) || 13, x = Number(bud.x) || 0, y = Number(bud.y) || 0, radius = r * (2.6 + q * .9);
      ctx.globalAlpha = alpha * (1 - q) * seen;
      if (glow) dab(ctx, glow, x, y, radius / 40);
      else circle(ctx, x, y, radius * .55, 'rgba(255,236,170,.6)');
      if (glints && q < 2 / 3) shine++;
    }
    if (!started) return;
    ctx.globalCompositeOperation = op;
    // A thin gold ring opens around each flower as the light reaches it.
    ctx.strokeStyle = '#ffe08a';
    for (const bud of buds) {
      if (!bud || typeof bud.flareAt !== 'number') continue;
      const q = (time - bud.flareAt) / .5, seen = q >= 0 && q < 1 ? sinkAlpha(bud, time, line, false) : 0;
      if (!(seen > 0)) continue;
      const r = Number(bud.r) || 13;
      ctx.globalAlpha = alpha * (1 - q) * .9 * seen; ctx.lineWidth = 2.6 * (1 - q) + .6;
      ctx.beginPath(); ctx.arc(Number(bud.x) || 0, Number(bud.y) || 0, r * (1.2 + ease(q) * 1.6), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    if (shine) {
      // The glint catches the upper right petal.
      ctx.beginPath();
      for (const bud of buds) {
        if (!bud || typeof bud.flareAt !== 'number') continue;
        const q = (time - bud.flareAt) / .35, r = Number(bud.r) || 13;
        if (!(q >= 0 && q < 2 / 3) || !(sinkAlpha(bud, time, line, false) > 0)) continue;
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

  // Feel: the finale camera, the pod's slingshot pose, comet seeds and the danger drama. Glows and veils are
  // sprites made once at 3x (OffscreenCanvas, else a page canvas); in Node there is no surface and plain shapes
  // stand in. draw() sets frameAhead (seeds glide between physics steps in slow motion) and the quality tier.
  let frameAhead = 0, feelQuality = 0, feelOpts = null, aimSince = null, lockTarget = null, lockSince = 0;
  const feelSprites = new Map();
  const easeBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  // Squash, lean and ring timings follow the real clock, so the tutorial's slow motion never makes them sluggish.
  const feelClock = time => feelOpts && Number.isFinite(feelOpts.realTime) ? feelOpts.realTime : Number(time) || 0;
  function feelSurface(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return warmMark(new OffscreenCanvas(w, h));
    if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return warmMark(canvas);
    }
    return null;
  }
  // A soft round glow, cached per key: `stops` run from the center (0) to clear at the rim (1).
  function feelGlow(key, radius, stops) {
    if (feelSprites.has(key)) return feelSprites.get(key);
    const px = Math.ceil(radius * 6) + 2, canvas = feelSurface(px, px);
    let sprite = null;
    if (canvas) {
      const g = canvas.getContext('2d'), c = px / 2, fill = g.createRadialGradient(c, c, 0, c, c, radius * 3);
      for (const [at, color] of stops) fill.addColorStop(at, color);
      g.fillStyle = fill; g.fillRect(0, 0, px, px); painted++;
      sprite = { canvas, size: px / 3 };
    }
    feelSprites.set(key, sprite);
    return sprite;
  }
  function drawGlowSprite(ctx, sprite, x, y, scale) {
    const size = sprite.size * (scale || 1);
    ctx.drawImage(sprite.canvas, x - size / 2, y - size / 2, size, size);
  }
  // A gradient strip (vertical unless `across`), stretched to any size when drawn: streaks, edge light, the danger band.
  function feelStrip(key, across, stops) {
    if (feelSprites.has(key)) return feelSprites.get(key);
    const w = across ? 96 : 4, h = across ? 4 : 96, canvas = feelSurface(w, h);
    let sprite = null;
    if (canvas) {
      const g = canvas.getContext('2d'), fill = across ? g.createLinearGradient(0, 0, w, 0) : g.createLinearGradient(0, 0, 0, h);
      for (const [at, color] of stops) fill.addColorStop(at, color);
      g.fillStyle = fill; g.fillRect(0, 0, w, h); painted++;
      sprite = canvas;
    }
    feelSprites.set(key, sprite);
    return sprite;
  }
  // A full-board vignette in one color: clear in the middle, deepening toward the edges and corners.
  function veilSprite(rgb) {
    const key = 'veil|' + rgb;
    let sprite = feelSprites.get(key);
    if (sprite === undefined) {
      const canvas = feelSurface(420, 560);
      sprite = null;
      if (canvas) {
        const g = canvas.getContext('2d');
        g.scale(1, 560 / 420);
        const fill = g.createRadialGradient(210, 210, 60, 210, 210, 300);
        fill.addColorStop(0, `rgba(${rgb},0)`); fill.addColorStop(.4, `rgba(${rgb},.08)`); fill.addColorStop(.62, `rgba(${rgb},.5)`);
        fill.addColorStop(.85, `rgba(${rgb},.9)`); fill.addColorStop(1, `rgba(${rgb},1)`);
        g.fillStyle = fill; g.fillRect(0, 0, 420, 420); painted++;
        sprite = canvas;
      }
      feelSprites.set(key, sprite);
    }
    return sprite;
  }
  const VEILS = ['38,18,64', '232,36,84', '236,40,80', '120,240,200'];
  function feelVeil(ctx, rgb, alpha) {
    if (!(alpha > .002)) return;
    const sprite = veilSprite(rgb);
    ctx.save(); ctx.globalAlpha = clamp(alpha, 0, 1);
    if (sprite) ctx.drawImage(sprite, 0, 0, 420, 560);
    else { ctx.globalAlpha *= .35; ctx.fillStyle = `rgb(${rgb})`; ctx.fillRect(0, 0, 420, 560); }
    ctx.restore();
  }
  // One tapered ribbon through a seed's trail into its head: full width at the seed, a point at the tail.
  function trailX(trail, start, n, hx, i) { return i < n ? trail[start + i].x : hx; }
  function trailY(trail, start, n, hy, i) { return i < n ? trail[start + i].y : hy; }
  function cometEdge(ctx, trail, start, n, hx, hy, i, width, sign) {
    const x = trailX(trail, start, n, hx, i), y = trailY(trail, start, n, hy, i);
    const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
    let dx = trailX(trail, start, n, hx, b) - trailX(trail, start, n, hx, a), dy = trailY(trail, start, n, hy, b) - trailY(trail, start, n, hy, a);
    const length = Math.hypot(dx, dy) || 1, w = width * i / n * sign;
    dx /= length; dy /= length;
    ctx.lineTo(x - dy * w, y + dx * w);
  }
  function cometTrail(ctx, trail, hx, hy, width, color, alpha) {
    if (!Array.isArray(trail) || trail.length < 2) return;
    let start = 0;
    for (let i = trail.length - 1; i > 0; i--) if (trail[i].move) { start = i; break; }
    const n = trail.length - start;
    if (n < 2 || !Number.isFinite(trail[start].x)) return;
    ctx.beginPath(); ctx.moveTo(trail[start].x, trail[start].y);
    for (let i = 1; i <= n; i++) cometEdge(ctx, trail, start, n, hx, hy, i, width, 1);
    for (let i = n; i >= 1; i--) cometEdge(ctx, trail, start, n, hx, hy, i, width, -1);
    ctx.closePath();
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
  }
  // The pod pulls back and leans toward the aim like a slingshot, and kicks back along the shot when it fires.
  // podPose returns how far the seed sits drawn back in the pod, against the aim, like a stretched band.
  const podPull = { x: 0, y: 0 };
  function podPose(ctx, state, time, x, y) {
    const aim = state.aim, live = state.status !== 'won' && state.status !== 'lost', now = feelClock(time);
    let hold = 0, lean = 0, rx = 0, ry = 0;
    podPull.x = podPull.y = 0;
    if (live && Array.isArray(aim) && aim.length > 1 && aim[0] && aim[1] && Number.isFinite(aim[1].x) && Number.isFinite(aim[0].x)) {
      if (aimSince === null || now < aimSince) aimSince = now;
      hold = ease((now - aimSince) / .15);
      const dx = aim[1].x - aim[0].x, dy = aim[1].y - aim[0].y, length = Math.hypot(dx, dy) || 1;
      const off = Math.atan2(dy, dx) + Math.PI / 2;
      lean = clamp(off / 1.2, -1, 1) * .18 * hold;
      podPull.x = -dx / length * 4 * hold; podPull.y = -dy / length * 4 * hold;
    } else aimSince = null;
    if (Number.isFinite(state.recoilAt)) {
      const t = (time - state.recoilAt) / .18;
      if (t >= 0 && t < 1) {
        const push = 5 * (1 - easeBack(t)), a = Number.isFinite(state.recoilAngle) ? state.recoilAngle : -Math.PI / 2;
        rx = -Math.cos(a) * push; ry = -Math.sin(a) * push;
      }
    }
    if (!hold && !rx && !ry) return podPull;
    ctx.translate(x + rx, y + 19 + ry); ctx.rotate(lean); ctx.scale(1 + .06 * hold, 1 - .1 * hold); ctx.translate(-x, -y - 19);
    return podPull;
  }
  function heartPath(ctx, px, y) {
    ctx.beginPath(); ctx.moveTo(px, y + 30);
    ctx.bezierCurveTo(px - 7, y + 26, px - 3, y + 21, px, y + 25);
    ctx.bezierCurveTo(px + 3, y + 21, px + 7, y + 26, px, y + 30);
  }
  // A lost life: the heart cracks down the middle and its halves tip apart and fall.
  function brokenHeart(ctx, px, y, age) {
    const k = clamp(age / .7, 0, 1), fall = 18 * k * k, tilt = .5 * ease(k);
    ctx.save();
    if (k < .35) { ctx.globalAlpha = (1 - k / .35) * .8; circle(ctx, px, y + 26, 5 + k * 26, null, '#ff8fb0', 2 - k * 4); }
    for (const side of [-1, 1]) {
      ctx.save(); ctx.globalAlpha = 1 - k * k;
      ctx.translate(px + side * (.6 + 3.2 * k), y + 30 + fall); ctx.rotate(side * tilt); ctx.translate(-px, -y - 30);
      ctx.beginPath(); ctx.moveTo(px, y + 18); ctx.lineTo(px + .9, y + 22.6); ctx.lineTo(px - 1.1, y + 25.2); ctx.lineTo(px + .8, y + 27.6); ctx.lineTo(px, y + 31.5);
      ctx.lineTo(px + side * 10, y + 31.5); ctx.lineTo(px + side * 10, y + 18); ctx.closePath(); ctx.clip();
      heartPath(ctx, px, y); ctx.fillStyle = '#ef668e'; ctx.fill(); ctx.strokeStyle = '#c8517a'; ctx.lineWidth = .65; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  // A breach leaves a wilted ghost of each lost flower on the line: a bent stem with its head hanging, in the
  // flower's own colors gone dusty. It tips over, sinks and fades. Each type is drawn once into a sprite.
  function dusty(hex, amount) {
    const n = parseInt(String(hex).slice(1), 16), dust = [150, 128, 116];
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (dust[i] - v) * amount));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function paintWilt(g, type) {
    const tint = FLOWERS[type] || FLOWERS.coral, petal = dusty(tint.base, .42), edge = dusty(tint.dark, .38), stem = '#7f9156';
    g.lineCap = 'round'; g.lineJoin = 'round';
    // The stem rises from the foot (0, 0), bends over and hangs the head down to the right.
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-1.5, -12, 2, -22, 9, -21); g.quadraticCurveTo(12.5, -20.5, 12.5, -16.5);
    g.strokeStyle = '#ffffff'; g.lineWidth = 3.4; g.globalAlpha = .7; g.stroke(); g.globalAlpha = 1;
    g.strokeStyle = stem; g.lineWidth = 1.7; g.stroke();
    g.beginPath(); g.ellipse(-3.2, -8, 4.6, 1.7, .55, 0, TAU); g.fillStyle = '#93a463'; g.fill(); g.strokeStyle = '#6c7d48'; g.lineWidth = .6; g.stroke();
    // Five petals droop from the head in a loose bell.
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i - 2) * .38, px = 12.5 + Math.cos(a) * 4.6, py = -15 + Math.sin(a) * 4.6;
      g.beginPath(); g.ellipse(px, py, 5.4, 2.6, a, 0, TAU);
      g.fillStyle = petal; g.fill(); g.strokeStyle = edge; g.lineWidth = .7; g.stroke();
    }
    g.beginPath(); g.arc(12.5, -16.2, 2.3, 0, TAU); g.fillStyle = stem; g.fill(); g.strokeStyle = '#5f7040'; g.lineWidth = .6; g.stroke();
  }
  function wiltSprite(type) {
    const key = 'wilt|' + type;
    if (feelSprites.has(key)) return feelSprites.get(key);
    const w = 36, h = 36, canvas = feelSurface(w * 3, h * 3);
    let sprite = null;
    if (canvas) {
      const g = canvas.getContext('2d'); g.scale(3, 3); g.translate(10, 30);
      paintWilt(g, type);
      sprite = { canvas, w, h, ox: 10, oy: 30 };
    }
    feelSprites.set(key, sprite);
    return sprite;
  }
  function drawWilts(ctx, state, time, reducedMotion) {
    const wilts = Array.isArray(state.wilts) ? state.wilts : [];
    for (const w of wilts) {
      const age = time - w.at;
      if (!(age >= 0 && age < 1.2) || !Number.isFinite(w.x) || !Number.isFinite(w.y)) continue;
      const k = age / 1.2, e = reducedMotion ? 0 : ease(k), side = Math.floor(w.x / 7) % 2 ? 1 : -1;
      const s = clamp((Number(w.r) || 11) / 11, .8, 1.6) * 1.4, type = FLOWERS[w.type] ? w.type : 'coral', sprite = wiltSprite(type);
      ctx.save(); ctx.globalAlpha = .95 * (1 - k * k);
      // The foot stays on the line while the whole flower tips over and sinks below it.
      ctx.translate(w.x, w.y + 14 * e); ctx.scale(side * s, s); ctx.rotate(.08 + .5 * e);
      if (sprite) ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy, sprite.w, sprite.h);
      else paintWilt(ctx, type);
      ctx.restore();
    }
  }

  // Screen-space overlays after the board: the finale's dusk vignette, the last-life pulse, the red flash of a
  // lost life and the mint glow of a close call. Each is a cached veil drawn with an alpha; nothing here filters.
  function drawFeelOverlay(ctx, state, time, options) {
    const reduced = Boolean(options.reducedMotion), d = options.danger, live = state.status !== 'lost' && state.status !== 'won';
    if (!reduced) feelVeil(ctx, '38,18,64', Number(options.vignette) || 0);
    if (d && state.mode === 'rush') {
      // The last life breathes at 1 Hz between .10 and .18 at the middle of each edge (the veil is half strength
      // there and full in the corners), and holds still at .12 with reduced motion.
      if (d.lastLife && live) feelVeil(ctx, '232,36,84', 2 * (reduced ? .12 : .14 + Math.sin(feelClock(time) * TAU) * .04));
      if (!reduced && d.redFlash > 0) {
        ctx.save(); ctx.globalAlpha = .22 * clamp(d.redFlash, 0, 1); ctx.fillStyle = 'rgb(255,70,90)'; ctx.fillRect(0, 0, 420, 560); ctx.restore();
        feelVeil(ctx, '236,40,80', .55 * d.redFlash);
      }
      if (!reduced && d.mintFlash > 0) feelVeil(ctx, '120,240,200', .3 * d.mintFlash);
    }
    // The frame is done: seeds outside draw() (the collection showcase) draw where they are.
    frameAhead = 0; feelOpts = null;
  }

  function drawLauncher(ctx, state, time, colors, style, kick, reducedMotion) {
    const x = (state.launcher && Number(state.launcher.x)) || 210;
    const y = (state.launcher && Number(state.launcher.y)) || 498;
    const rush = state.mode === 'rush';
    const left = rush ? (state.lives == null ? 3 : state.lives) : state.shotsLeft == null ? 3 : state.shotsLeft;
    const k = reducedMotion ? 0 : clamp(Number(kick) || 0, 0, 1), next = FLOWERS[state.nextType];
    ctx.save();
    const pull = reducedMotion ? null : podPose(ctx, state, time, x, y);
    // A shot pushes the pod down and wide for a blink before it springs back, with a puff of air around it.
    if (k > 0) {
      circle(ctx, x, y, 20 + (1 - k) * 18, null, next ? next.light : '#ffffff', 3 * k);
      ctx.translate(x, y); ctx.scale(1 + .13 * k, 1 - .13 * k); ctx.translate(-x, -y);
    }
    const halo = reducedMotion ? null : feelGlow('pod-halo', 30, [[0, 'rgba(18,188,193,.5)'], [.62, 'rgba(18,188,193,.28)'], [1, 'rgba(18,188,193,0)']]);
    if (halo) drawGlowSprite(ctx, halo, x, y + 2);
    else { ctx.shadowColor = '#12bcc199'; ctx.shadowBlur = 16; }
    circle(ctx, x, y + 2, 22, 'rgba(5,155,150,.15)');
    circle(ctx, x, y, 19.5, '#50d7bb', '#ffffff', 1.5);
    circle(ctx, x, y, 14.7, '#d6ffee', '#9be9d8', 1);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    if (next && rush && !state.armed && state.status !== 'lost' && state.status !== 'won') circle(ctx, x, y, 17.1, null, next.base, 2.2);
    if (rush && state.armed && POWER_TINT[state.armed] && state.status !== 'lost' && state.status !== 'won') {
      // An armed powerup sits in the launcher in place of the seed, with a ring that breathes.
      const beat = .5 + Math.sin(time * 5) * .5;
      circle(ctx, x, y, 22 + beat * 3, null, POWER_TINT[state.armed], 2.4);
      drawPowerIcon(ctx, state.armed, x, y, 12.5, time);
    } else if (state.status === 'aiming' || !state.status || (rush && state.status !== 'lost')) drawSeed(ctx, x + (pull ? pull.x : 0), y + (pull ? pull.y : 0), 8.4, time, false, style);
    ctx.restore();
    // Lives (Rush) or shots left sit still under the pod; a heart just lost cracks in two and falls away. Rush hearts
    // are drawn a third bigger so they read on a small phone.
    ctx.save(); ctx.fillStyle = colors.ink; ctx.globalAlpha = .7;
    if (rush) { ctx.translate(x, y + 27); ctx.scale(1.3, 1.3); ctx.translate(-x, -y - 27); ctx.globalAlpha = 1; }
    const broken = rush && !reducedMotion && state.heartBreak && Number.isFinite(state.heartBreak.at) ? state.heartBreak : null;
    for (let i = 0; i < 3; i++) {
      const px = x + (i - 1) * (rush ? 11 : 9);
      if (rush) {
        heartPath(ctx, px, y);
        ctx.fillStyle = i < left ? '#ef668e' : 'rgba(255,255,255,.40)'; ctx.fill();
        ctx.strokeStyle = i < left ? '#c8517a' : 'rgba(143,178,171,.7)'; ctx.lineWidth = .65; ctx.stroke();
        if (broken && broken.index === i && i >= left && time - broken.at >= 0 && time - broken.at < .7) brokenHeart(ctx, px, y, time - broken.at);
      } else if (i < left) {
        ctx.beginPath(); ctx.ellipse(px, y + 27, 1.9, 3, .45, 0, TAU); ctx.fill();
      } else circle(ctx, px, y + 27, 1.7, null, colors.fine, .7);
    }
    ctx.restore();
  }

  // Rush tempo: as the multiplier climbs, warm light streams up the glasshouse and its edges glow.
  // Stateless (a function of time), so it costs nothing to keep and nothing to reset. Streaks and edges are
  // cached gradient strips, so a frame makes no gradients.
  function drawTempo(ctx, state, time) {
    const heat = clamp((Number(state.tempo) || 1) - 1, 0, 1);
    if (!(heat > 0) || state.status === 'lost') return;
    // Normal blending: additive light vanishes against the bright meadow sky.
    ctx.save(); ctx.lineCap = 'round';
    const streak = feelStrip('tempo-streak', false, [[0, 'rgba(255,214,120,0)'], [.35, 'rgba(255,206,104,1)'], [1, 'rgba(255,240,190,0)']]);
    const count = 5 + Math.round(heat * 13), speed = 170 + heat * 280, peak = .22 + heat * .3;
    for (let i = 0; i < count; i++) {
      const x = 34 + (i * 137.508) % 352, length = 16 + heat * 34 + (i % 3) * 9, width = 1.4 + (i % 2) * .9;
      const y = 610 - ((time * speed * (.75 + (i % 4) * .12) + i * 211.7) % 720);
      if (streak) { ctx.globalAlpha = peak; ctx.drawImage(streak, x - width / 2, y, width, length); }
      else { ctx.globalAlpha = peak * .5; ctx.strokeStyle = 'rgb(255,206,104)'; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + length); ctx.stroke(); }
    }
    const glow = .10 + heat * .22 + Math.sin(time * 5.5) * .03 * heat;
    const edge = feelStrip('tempo-edge', true, [[0, 'rgba(255,190,90,1)'], [1, 'rgba(255,190,90,0)']]);
    ctx.globalAlpha = clamp(glow, 0, 1);
    if (edge) { ctx.drawImage(edge, 0, 0, 34, 560); ctx.translate(420, 0); ctx.scale(-1, 1); ctx.drawImage(edge, 0, 0, 34, 560); }
    else { ctx.globalAlpha *= .5; ctx.fillStyle = 'rgb(255,190,90)'; ctx.fillRect(0, 0, 12, 560); ctx.fillRect(408, 0, 12, 560); }
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
  const DANGER_TAG_X = 74;
  function drawRushBoundary(ctx, state, theme, time, reducedMotion) {
    const y = clamp(Number(state.dangerY) || 448, 100, 510);
    const night = theme === 'moon' || Boolean(root.BloomScenery && root.BloomScenery.dark(theme));
    const threat = state.status === 'lost' || state.status === 'won' ? 0 : threatOf(state, y);
    // A heartbeat: two quick swells, then a rest, quicker the closer the flowers are.
    const beat = reducedMotion ? .5 : Math.pow(Math.max(0, Math.sin((Number(time) || 0) * (5 + threat * 5))), 6);
    const heat = Math.pow(threat, 1.5) * (.5 + .5 * beat);
    ctx.save();
    // A rosy band that swells up from the line and fades below it, from two cached strips (no gradient per frame).
    const reach = 15 + heat * 70, up = feelStrip('line-up', false, [[0, 'rgba(255,60,110,0)'], [1, 'rgba(255,60,110,1)']]);
    const down = feelStrip('line-down', false, [[0, 'rgba(255,60,110,1)'], [1, 'rgba(255,60,110,0)']]);
    if (up && down) {
      ctx.globalAlpha = .08 + heat * .5; ctx.drawImage(up, 22, y - reach, 376, reach); ctx.drawImage(down, 22, y, 376, 33);
      // The line's own glow, tighter and brighter as the danger beats.
      if (heat > .05) { const g = 4 + heat * 10; ctx.globalAlpha = Math.min(1, heat * 1.3) * .7; ctx.drawImage(up, 24, y - g, 372, g); ctx.drawImage(down, 24, y, 372, g); }
      ctx.globalAlpha = 1;
    } else { ctx.globalAlpha = .08 + heat * .5; ctx.fillStyle = 'rgba(255,60,110,.5)'; ctx.fillRect(22, y - reach * .4, 376, reach * .4 + 12); ctx.globalAlpha = 1; }
    drawWilts(ctx, state, Number(time) || 0, reducedMotion);
    ctx.beginPath(); ctx.moveTo(24, y + .8); ctx.lineTo(396, y + .8);
    ctx.strokeStyle = night ? 'rgba(255,234,238,.55)' : 'rgba(255,255,255,.9)'; ctx.lineWidth = 3 + heat * 2.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(396, y);
    ctx.setLineDash([8, 5]); ctx.lineDashOffset = reducedMotion ? 0 : -(Number(time) || 0) * (8 + threat * 30);
    ctx.strokeStyle = heat > .3 ? '#ff3d6e' : night ? '#ff91b1' : '#e86189'; ctx.lineWidth = 1.6 + heat * 1.6; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    for (const x of [28, 392]) {
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath();
      ctx.fillStyle = night ? '#ffd8e5' : '#e86189'; ctx.fill();
    }
    // The tag sits at the line's left end, clear of the sun fan over the pod and of every aim line.
    const tx = DANGER_TAG_X;
    ctx.font = '600 12px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (heat > .05) { ctx.translate(tx, y + 15); ctx.scale(1 + heat * .14, 1 + heat * .14); ctx.translate(-tx, -y - 15); }
    // Painted level scenes are busy behind the label, so it sits on its own little tag there.
    if (root.BloomScenery && root.BloomScenery.has(theme)) {
      const w = ctx.measureText('Danger line').width + 16;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(tx - w / 2, y + 6, w, 18, 9); else ctx.rect(tx - w / 2, y + 6, w, 18);
      ctx.fillStyle = night ? 'rgba(38,24,58,.82)' : 'rgba(255,250,240,.94)'; ctx.fill();
      ctx.strokeStyle = night ? 'rgba(255,145,177,.65)' : 'rgba(232,97,137,.6)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.fillStyle = night ? '#ffcedd' : '#a54164'; ctx.fillText('Danger line', tx, y + 15);
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
  // Its mood follows its health: determined brows and gritted teeth at half, then sweat and a shiver near the end.
  function bossMood(bud) {
    const max = Math.max(1, Number(bud.maxHp) || 1), health = clamp((Number(bud.hp) || 0) / max, 0, 1);
    return { determined: health <= .5, sweat: health <= .2 };
  }
  // The shiver: a +/-.04 rad wobble at 6 Hz around the bloom's middle, shared by its leaves, face and crown.
  // The ring and crown are drawn without the clock, so the face leaves its tilt here for them.
  const bossTilt = { bud: null, angle: 0 };
  function bossWobble(ctx, bud, time, still) {
    const angle = still || !bossMood(bud).sweat ? 0 : Math.sin(time * TAU * 6) * .04;
    bossTilt.bud = bud; bossTilt.angle = angle;
    if (angle) { ctx.translate(bud.x, bud.y); ctx.rotate(angle); ctx.translate(-bud.x, -bud.y); }
  }
  function drawBossLeaves(ctx, bud, time, still) {
    const r = Number(bud.r) || 24, sway = still ? 0 : Math.sin(time * 1.6) * .06;
    ctx.save(); bossWobble(ctx, bud, time, still);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(bud.x + side * r * .35, bud.y + r * .55); ctx.rotate(side * (1.05 + sway));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-r * .45, -r * .35, -r * .35, -r * 1.05, 0, -r * 1.25); ctx.bezierCurveTo(r * .38, -r * 1.02, r * .45, -r * .35, 0, 0);
      ctx.fillStyle = '#52b86a'; ctx.fill(); ctx.strokeStyle = '#256b3f'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(r * .05, -r * .6, 0, -r * 1.1); ctx.strokeStyle = 'rgba(220,255,210,.7)'; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawBossFace(ctx, bud, time, still) {
    const r = Number(bud.r) || 24, blink = still ? 1 : (time % 3.4 < .12 ? .15 : 1), hurt = Boolean(bud.bloomed) || (typeof bud.hitAt === 'number' && time - bud.hitAt < .3);
    const mood = bossMood(bud), ink = '#4a2340';
    ctx.save(); bossWobble(ctx, bud, time, still); ctx.translate(bud.x, bud.y + r * .12);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      // Eyes narrow once it means business; a hit squeezes them shut.
      ctx.save(); ctx.translate(side * r * .26, 0); ctx.scale(1, hurt ? .2 : blink * (mood.determined ? .82 : 1));
      ctx.beginPath(); ctx.ellipse(0, 0, r * .13, r * .17, 0, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.stroke();
      circle(ctx, side * -r * .02, r * .03, r * .075, '#2d1630'); circle(ctx, side * -r * .04, -r * .03, r * .028, '#ffffff');
      ctx.restore();
      ctx.beginPath();
      if (mood.determined) { ctx.moveTo(side * r * .43, -r * .31); ctx.lineTo(side * r * .1, -r * .13); ctx.lineWidth = 2.5; }
      else { ctx.moveTo(side * r * .4, -r * .26); ctx.lineTo(side * r * .14, -r * .18); ctx.lineWidth = 1.6; }
      ctx.strokeStyle = ink; ctx.stroke();
    }
    if (mood.determined && !hurt) {
      // Gritted teeth: a little white bar with two tooth lines.
      const w = r * .36, h = r * .15, y = r * .26;
      roundRect(ctx, -w / 2, y, w, h, h * .45); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w / 2 + 2, y + h / 2); ctx.lineTo(w / 2 - 2, y + h / 2);
      for (const tx of [-w / 6, w / 6]) { ctx.moveTo(tx, y + 1); ctx.lineTo(tx, y + h - 1); }
      ctx.lineWidth = .8; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, r * .3, r * .1, hurt ? Math.PI + .3 : .3, hurt ? -.3 : Math.PI - .3); ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.stroke();
    }
    if (mood.sweat) {
      // A drop of sweat runs down its brow and starts again, with a smaller one on the other side.
      for (const [side, phase, size] of [[1, 0, 1], [-1, .55, .7]]) {
        const k = still ? .3 : (time * .9 + phase) % 1, s = r * .1 * size;
        const x = side * r * .58, y = -r * .5 + k * r * .22;
        ctx.save(); ctx.globalAlpha *= still ? 1 : Math.min(1, (1 - k) * 4) * Math.min(1, k * 8);
        ctx.beginPath(); ctx.moveTo(x, y - s * 1.9);
        ctx.bezierCurveTo(x + s * .25, y - s * 1.1, x + s, y - s * .3, x + s, y + s * .2);
        ctx.arc(x, y + s * .2, s, 0, Math.PI);
        ctx.bezierCurveTo(x - s, y - s * .3, x - s * .25, y - s * 1.1, x, y - s * 1.9); ctx.closePath();
        ctx.fillStyle = '#9fdcff'; ctx.fill(); ctx.strokeStyle = '#3f8fd2'; ctx.lineWidth = 1; ctx.stroke();
        circle(ctx, x - s * .35, y, s * .28, 'rgba(255,255,255,.9)');
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawBossRing(ctx, bud) {
    const r = (Number(bud.r) || 24) + (bud.shell ? 11 : 7), hp = Math.max(0, Number(bud.hp) || 0), max = Math.max(1, Number(bud.maxHp) || 1), gap = .09;
    ctx.save(); ctx.lineCap = 'round';
    if (bossTilt.bud === bud && bossTilt.angle) { ctx.translate(bud.x, bud.y); ctx.rotate(bossTilt.angle); ctx.translate(-bud.x, -bud.y); }
    for (let i = 0; i < max; i++) {
      const a0 = -Math.PI / 2 + i * TAU / max + gap / 2, a1 = a0 + TAU / max - gap;
      ctx.beginPath(); ctx.arc(bud.x, bud.y, r, a0, a1); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5.4; ctx.stroke();
      ctx.beginPath(); ctx.arc(bud.x, bud.y, r, a0, a1); ctx.strokeStyle = i < hp ? (FLOWERS[bud.type] || FLOWERS.coral).dark : 'rgba(120,120,140,.35)'; ctx.lineWidth = 3; ctx.stroke();
    }
    drawBossCrown(ctx, bud.x, bud.y - (Number(bud.r) || 24) - 14);
    ctx.restore();
  }
  function drawBossCrown(ctx, x, crownY) {
    ctx.beginPath(); ctx.moveTo(x - 10, crownY + 6); ctx.lineTo(x - 12, crownY - 4); ctx.lineTo(x - 5, crownY + 1); ctx.lineTo(x, crownY - 8);
    ctx.lineTo(x + 5, crownY + 1); ctx.lineTo(x + 12, crownY - 4); ctx.lineTo(x + 10, crownY + 6); ctx.closePath();
    ctx.fillStyle = '#ffd64f'; ctx.fill(); ctx.strokeStyle = '#a8701f'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke();
    circle(ctx, x, crownY + 1.5, 1.8, '#ef5a7d');
  }
  // The boss's last hit is the level's hero frame, so it never turns into a white disc: through the crack (the
  // first .125 s of its bloom, held by the hit-stop and the slow motion) its leaves stay behind it and its face
  // squeezes shut on top, fading as the casing pops, while the crown is knocked up and away. 0 when not cracking.
  function bossCrack(bud, age, still) {
    if (!bud.boss || !bud.bloomed || still || !(age >= 0) || age >= .125) return 0;
    const burst = (age - .065) / .06;
    return burst <= 0 ? 1 : 1 - Math.pow(clamp(burst, 0, 1), 1.6);
  }
  function drawBossCrownFlying(ctx, bud, age) {
    const r = Number(bud.r) || 24, k = clamp(age / .125, 0, 1), side = (Number(bud.impactAngle) || 0) > -Math.PI / 2 ? -1 : 1;
    ctx.save(); ctx.translate(bud.x + side * k * r * .7, bud.y - r - 14 - ease(k) * r * .9); ctx.rotate(side * k * .9);
    drawBossCrown(ctx, 0, 0); ctx.restore();
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
  // How much of a spent flower still shows: it fades as it sinks to the danger line once it has finished opening,
  // gone 26 px past it (and the tutorial fades a step's flowers out with bud.fade).
  function sinkAlpha(bud, time, line, still) {
    let sink = 1;
    if (bud.bloomed && line < Infinity) {
      const over = bud.y + (bud.r || 16) - (line - 8), age = typeof bud.bloomAt === 'number' ? time - bud.bloomAt : Infinity;
      if (over > 0) sink = 1 - clamp(over / 26, 0, 1) * (still ? 1 : clamp((age - UNFURL) / .25, 0, 1));
    }
    if (typeof bud.fade === 'number') sink *= clamp(bud.fade, 0, 1);
    return Math.max(0, sink);
  }
  // Briar patches: a thorny vine ties each patch together, so the player can see which three must bloom together.
  // Once a whole patch has bloomed for good the vine has done its job and withers away; it also sinks out with its
  // flowers, so no bare bramble is left lying on the danger line.
  function drawBriars(ctx, buds, time, line, still) {
    const patches = new Map();
    for (const bud of buds) if (bud.briar) { if (!patches.has(bud.group)) patches.set(bud.group, []); patches.get(bud.group).push(bud); }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const base = ctx.globalAlpha;
    for (const patch of patches.values()) {
      if (patch.length < 2) continue;
      let alpha = 1, done = true, last = -Infinity;
      for (const bud of patch) {
        alpha = Math.min(alpha, sinkAlpha(bud, time, line, still));
        if (!bud.bloomed || bud.regrowAt) done = false;
        else if (typeof bud.bloomAt === 'number') last = Math.max(last, bud.bloomAt);
      }
      if (done) alpha *= still ? 0 : 1 - clamp((time - last - .2) / .45, 0, 1);
      if (alpha <= .01) continue;
      ctx.globalAlpha = base * alpha;
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
    // Four little arrowheads snap in around the flower the line ends on and turn slowly, so the shot reads as
    // locked on. They sit outside the flower's own rings (a boss's health, a relay's crown).
    const target = points.target;
    if (target && !target.bloomed && Number.isFinite(target.x) && Number.isFinite(target.y)) {
      const now = feelClock(time);
      if (target !== lockTarget || now < lockSince) { lockTarget = target; lockSince = now; }
      const k = reducedMotion ? 1 : clamp((now - lockSince) / .2, 0, 1), e = reducedMotion ? 1 : easeBack(k);
      const radius = (Number(target.r) || 12) + (target.boss ? 15 : 11) + 18 * (1 - e);
      const spin = Math.PI / 4 + (reducedMotion ? 0 : now * .9), pulse = reducedMotion ? 1 : 1 + .08 * Math.sin(now * 7);
      ctx.globalAlpha = clamp(k * 2.5, 0, 1); ctx.lineJoin = 'round';
      for (let i = 0; i < 4; i++) {
        const a = spin + i * TAU / 4;
        ctx.save(); ctx.translate(target.x + Math.cos(a) * radius, target.y + Math.sin(a) * radius); ctx.rotate(a); ctx.scale(pulse, pulse);
        ctx.beginPath(); ctx.moveTo(-3.4, 0); ctx.lineTo(4.2, -5); ctx.quadraticCurveTo(2.4, 0, 4.2, 5); ctx.closePath();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.2; ctx.stroke();
        ctx.fillStyle = dot; ctx.fill(); ctx.strokeStyle = ring; ctx.lineWidth = .9; ctx.stroke();
        ctx.restore();
      }
    } else lockTarget = null;
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

  // The chain HUD for Rush and the levels: a sun fan of eight petals over the seed pod that fills from good shots,
  // and a multiplier badge by the pod. Everything with a gradient or a glow is painted once into a 3x sprite, so a
  // frame costs a few drawImage calls, one arc and one short label.
  const hudCache = new Map();
  // scale: how finely it is painted (3x by default; a soft full-board wash looks the same at 1x for a ninth of the cost).
  function hudSprite(key, w, h, paint, scale) {
    if (hudCache.has(key)) return hudCache.get(key);
    const k = scale || 3;
    let surface = null;
    if (typeof OffscreenCanvas !== 'undefined') surface = new OffscreenCanvas(Math.ceil(w * k), Math.ceil(h * k));
    else if (typeof document !== 'undefined' && document.createElement) { surface = document.createElement('canvas'); surface.width = Math.ceil(w * k); surface.height = Math.ceil(h * k); }
    const c = surface && surface.getContext('2d');
    const sprite = c ? { surface, w, h } : null;
    if (c) { c.scale(k, k); paint(c); painted++; warmMark(surface); }
    hudCache.set(key, sprite);
    return sprite;
  }
  // The fan's hub sits 3 px under the pod's center, so its top petal stays clear of the danger line's tag.
  // Its petals are 12 px long, big enough to read as the meter for Super Bloom; the danger line's tag sits at the
  // line's left end, so nothing covers the fan.
  const SUN = { x: 210, y: 501, inner: 22, outer: 34, half: 4.8, arc: Math.PI * 150 / 180, petals: 8 };
  // One fan petal, its base at the origin and its tip pointing up.
  function sunPetalPath(ctx, length, half) {
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-half * 1.25, -length * .22, -half * .95, -length * .82, 0, -length);
    ctx.bezierCurveTo(half * .95, -length * .82, half * 1.25, -length * .22, 0, 0); ctx.closePath();
  }
  function paintLitPetal(ctx, length, half) {
    ctx.save(); ctx.shadowColor = 'rgba(255,176,32,.75)'; ctx.shadowBlur = 4;
    sunPetalPath(ctx, length, half);
    const fill = ctx.createLinearGradient(0, 0, 0, -length);
    fill.addColorStop(0, '#f39a12'); fill.addColorStop(.45, '#ffc93a'); fill.addColorStop(1, '#fff1a6');
    ctx.fillStyle = fill; ctx.fill(); ctx.restore();
    sunPetalPath(ctx, length, half); ctx.lineWidth = .9; ctx.strokeStyle = '#c9770c'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -length * .2); ctx.quadraticCurveTo(half * .18, -length * .55, 0, -length * .8);
    ctx.strokeStyle = 'rgba(255,253,232,.8)'; ctx.lineWidth = .8; ctx.lineCap = 'round'; ctx.stroke();
  }
  // An unlit petal is a soft cream shape with a gold rim, so the empty meter reads on bright and dark scenes alike.
  function paintEmptyPetal(ctx, length, half) {
    sunPetalPath(ctx, length, half); ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(255,248,226,.62)'; ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,250,240,.9)'; ctx.stroke();
    ctx.lineWidth = 1.1; ctx.strokeStyle = '#c98a1a'; ctx.stroke();
  }
  const fanAngle = slot => -Math.PI / 2 - SUN.arc / 2 + slot * SUN.arc / (SUN.petals - 1);
  // The whole resting fan with its first `lit` petals lit, painted in the fan box's own coordinates.
  const FAN_BOX = { x: 164, y: 455, w: 92, h: 56 }, WHEEL_STEPS = 16;
  function paintFan(c, lit) {
    c.save(); c.translate(-FAN_BOX.x, -FAN_BOX.y);
    for (let i = 0; i < SUN.petals; i++) {
      c.globalAlpha = i < lit ? 1 : .8;
      drawSunPetal(c, null, fanAngle(i), 1, i < lit ? paintLitPetal : paintEmptyPetal);
    }
    c.restore();
  }
  // One step of the turning Super Bloom wheel: every petal lit, the ones entering and leaving the arc faded.
  function paintWheel(c, step) {
    c.save(); c.translate(-FAN_BOX.x, -FAN_BOX.y);
    for (let i = -1; i < SUN.petals; i++) {
      const slot = i + step / WHEEL_STEPS, edge = clamp(Math.min(slot + 1, SUN.petals - slot), 0, 1);
      if (edge <= 0) continue;
      c.globalAlpha = edge; drawSunPetal(c, null, fanAngle(slot), 1, paintLitPetal);
    }
    c.restore();
  }
  function litPetalSprite() {
    const length = SUN.outer - SUN.inner, half = SUN.half, pad = 5;
    return hudSprite('petal:lit', half * 2 + pad * 2, length + pad * 2, c => { c.translate(half + pad, length + pad); paintLitPetal(c, length, half); });
  }
  function drawSunPetal(ctx, sprite, angle, scale, paint) {
    const length = SUN.outer - SUN.inner, half = SUN.half;
    ctx.save(); ctx.translate(SUN.x + Math.cos(angle) * SUN.inner, SUN.y + Math.sin(angle) * SUN.inner);
    ctx.rotate(angle + Math.PI / 2); if (scale !== 1) ctx.scale(scale, scale);
    if (sprite) ctx.drawImage(sprite.surface, -sprite.w / 2, 5 - sprite.h, sprite.w, sprite.h);
    else paint(ctx, length, half);
    ctx.restore();
  }
  const BADGE = {
    1: { fill: '#fffaf0', edge: '#dcc48c', ink: '#7a5a22', ring: '#c9a24c' },
    2: { fill: '#5cb8ff', edge: '#1d6ad6', ink: '#ffffff', ring: '#2582e6' },
    3: { fill: '#a983ff', edge: '#6a46cc', ink: '#ffffff', ring: '#7550e0' },
    4: { fill: '#ff6f9a', edge: '#c92d63', ink: '#ffffff', ring: '#e2477c' },
    5: { fill: '#ffc93a', edge: '#d0820c', ink: '#6a3f00', ring: '#e59a12' }
  };
  const badgeSprite = mult => hudSprite('badge:' + mult, 44, 44, c => paintBadge(c, BADGE[mult], 17));
  function paintBadge(ctx, tint, r) {
    const c = r + 5;
    ctx.save(); ctx.shadowColor = 'rgba(40,60,70,.32)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.5;
    circle(ctx, c, c, r, tint.edge); ctx.restore();
    const face = ctx.createLinearGradient(0, c - r, 0, c + r);
    face.addColorStop(0, '#ffffff'); face.addColorStop(.18, tint.fill); face.addColorStop(1, tint.fill);
    circle(ctx, c, c - .6, r - 2.2, face);
    ctx.save(); ctx.globalAlpha = .45; ctx.beginPath(); ctx.ellipse(c - r * .28, c - r * .42, r * .4, r * .2, -.5, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
  }
  function drawChainHud(ctx, state, time, options) {
    if (state.status === 'lost' || state.status === 'won') return;
    const still = Boolean(options && options.reducedMotion);
    const superLeft = Math.max(0, Number(state.superBloom) || 0), sun = clamp(Number(state.sun) || 0, 0, 1);
    if (!state.scripted) {
      const lit = litPetalSprite();
      // During a Super Bloom the wheel turns: petals rise in on the left and sink out on the right, and the gold
      // drains back from the right as the six seconds run down. Otherwise it fills left to right, an eighth at a time.
      const turning = superLeft > 0 && !still;
      const filled = superLeft > 0 ? superLeft / 6 * SUN.petals : sun * SUN.petals;
      ctx.save();
      if (turning) {
        // The turning wheel is one of 16 cached steps; a wedge clip from the left end to the drain line hides the rest.
        const step = Math.floor(((time * 1.15) % 1) * WHEEL_STEPS) % WHEEL_STEPS;
        const wheel = hudSprite('wheel:' + step, FAN_BOX.w, FAN_BOX.h, c => paintWheel(c, step));
        ctx.beginPath(); ctx.moveTo(SUN.x, SUN.y); ctx.arc(SUN.x, SUN.y, 52, fanAngle(-1.6), fanAngle(Math.min(filled, SUN.petals + .6))); ctx.closePath(); ctx.clip();
        if (wheel) ctx.drawImage(wheel.surface, FAN_BOX.x, FAN_BOX.y, FAN_BOX.w, FAN_BOX.h);
        else { ctx.translate(FAN_BOX.x, FAN_BOX.y); paintWheel(ctx, step); }
      } else {
        // The resting fan is one sprite per number of lit petals; only the petal filling now and a fresh one are drawn on top.
        const whole = Math.min(SUN.petals, Math.floor(filled + 1e-9)), part = filled - whole;
        const fan = hudSprite('fan:' + whole, FAN_BOX.w, FAN_BOX.h, c => paintFan(c, whole));
        const breathe = state.superQueued && !still ? 1 + Math.sin(time * 4) * .03 : 1;
        if (breathe !== 1) { ctx.translate(SUN.x, SUN.y); ctx.scale(breathe, breathe); ctx.translate(-SUN.x, -SUN.y); }
        if (fan) ctx.drawImage(fan.surface, FAN_BOX.x, FAN_BOX.y, FAN_BOX.w, FAN_BOX.h);
        else { ctx.save(); ctx.translate(FAN_BOX.x, FAN_BOX.y); paintFan(ctx, whole); ctx.restore(); }
        if (part > 0 && whole < SUN.petals) {
          ctx.globalAlpha = .35 + .65 * part;
          drawSunPetal(ctx, lit, fanAngle(whole), .45 + .55 * part, paintLitPetal);
        }
        // The next petal to fill glows softly, so the meter invites the next good shot; when one is left it pulses faster.
        if (!still && superLeft <= 0 && !state.superQueued && whole < SUN.petals && part < .25) {
          const beat = .5 + .5 * Math.sin(time * (whole === SUN.petals - 1 ? 9 : 4.5));
          ctx.globalAlpha = .16 + .3 * beat; drawSunPetal(ctx, lit, fanAngle(whole), .92 + .08 * beat, paintLitPetal);
        }
        const since = time - (Number(state.sunAt) || -1);
        if (!still && whole > 0 && superLeft <= 0 && since >= 0 && since < .28) {
          const fresh = 1 - since / .28;
          ctx.globalAlpha = 1; drawSunPetal(ctx, lit, fanAngle(whole - 1), 1 + .35 * fresh * fresh, paintLitPetal);
        }
      }
      ctx.restore();
    }
    // The multiplier badge: hidden until a chain earns x2, its ring the time left to keep the chain going. During a
    // Super Bloom it shows the doubled value in gold, so 'double points' and the badge agree.
    const base = clamp(Math.round(Number(state.mult) || 1), 1, 5), doubled = superLeft > 0, shown = doubled ? base * 2 : base;
    if (shown < 2) return;
    const mult = doubled ? 5 : base, tint = BADGE[mult], r = 17, x = 352, y = 516;
    const since = time - (Number(state.multAt) || -1), pulse = !still && mult > 1 && since >= 0 && since < .2 ? 1.25 - .25 * (since / .2) : 1;
    const left = clamp((Number(state.comboLeft) || 0) / (Number(state.comboWindow) || 1.1), 0, 1);
    const badge = badgeSprite(mult);
    ctx.save(); ctx.translate(x, y); if (pulse !== 1) ctx.scale(pulse, pulse);
    ctx.beginPath(); ctx.arc(0, 0, r + 3.6, 0, TAU); ctx.strokeStyle = 'rgba(255,252,240,.7)'; ctx.lineWidth = 3.2; ctx.stroke();
    if (left > 0) {
      ctx.beginPath(); ctx.arc(0, 0, r + 3.6, -Math.PI / 2, -Math.PI / 2 + TAU * left);
      ctx.strokeStyle = tint.ring; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.stroke();
    }
    if (badge) ctx.drawImage(badge.surface, -r - 5, -r - 5, badge.w, badge.h);
    else { ctx.save(); ctx.translate(-r - 5, -r - 5); paintBadge(ctx, tint, r); ctx.restore(); }
    ctx.font = `700 ${shown >= 10 ? 13 : 15}px Fredoka, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = tint.ink; ctx.fillText('×' + shown, 0, .5);
    ctx.restore();
  }

  // A score pop. Its size grows with the chain multiplier; the type is set at 15 px and scaled, so the white
  // outline grows with it. Pops from a Super Bloom wear a gold rim.
  function drawPop(ctx, floater, reducedMotion) {
    // A pop can wait a beat (wait, seconds) so the bloom under it reads first; it never grows past full size, and
    // a chain adding to it (bumpAt) gives it a small nudge.
    const life = Math.max(0, floater.life), wait = Math.max(0, Number(floater.wait) || 0), duration = (floater.maxLife || .8) - wait;
    const age = duration - life;
    if (age < 0) return;
    const bump = Number.isFinite(floater.bumpAt) ? (floater.maxLife - life) - floater.bumpAt : Infinity;
    const scale = reducedMotion ? 1 : (Math.min(1, .45 + age * 8) - Math.max(0, age - .15) * .12) * (bump >= 0 && bump < .14 ? 1 + .12 * Math.sin(bump / .14 * Math.PI) : 1);
    const size = clamp(Number(floater.size) || 15, 8, 40), grow = Math.max(.7, scale) * size / 15;
    ctx.save(); ctx.translate(floater.x, floater.y - (reducedMotion ? 0 : ease(age / duration) * 26));
    ctx.scale(grow, grow);
    ctx.globalAlpha = Math.min(1, life / .25); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 15px Fredoka, system-ui, sans-serif'; ctx.lineJoin = 'round';
    if (floater.golden) { ctx.lineWidth = 6.2; ctx.strokeStyle = '#ffd04a'; ctx.strokeText(floater.text, 0, 0); }
    ctx.lineWidth = floater.golden ? 3 : 3.4; ctx.strokeStyle = floater.golden ? '#fffbe8' : '#ffffff'; ctx.strokeText(floater.text, 0, 0);
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

  // Super Bloom gilds the frame, never the play area: a warm glow along the edges and a lit rim, painted once, and a
  // thin shimmer of light that climbs through the garden. Gold laid over a teal lake or a blue cave greys it, so the
  // middle of the board keeps its own colors. A frame draws both with an alpha that fades in over .35 s and out over
  // the last .6 s.
  function paintGoldSky(c) {
    // Narrow and rich rather than wide and pale: a thin strong glow stays gold, a wide faint one only greys.
    const edge = (x0, y0, x1, y1, a) => {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(255,186,40,${a})`); g.addColorStop(.5, `rgba(255,200,70,${a * .32})`); g.addColorStop(1, 'rgba(255,210,90,0)');
      return g;
    };
    // Inside the rim only, so the board's dark frame keeps its own color instead of going muddy.
    c.save(); roundRect(c, 18, 18, 384, 524, 25); c.clip();
    c.fillStyle = edge(0, 18, 0, 52, .7); c.fillRect(18, 18, 384, 34);
    c.fillStyle = edge(0, 542, 0, 512, .6); c.fillRect(18, 512, 384, 30);
    c.fillStyle = edge(18, 0, 38, 0, .6); c.fillRect(18, 18, 20, 524);
    c.fillStyle = edge(402, 0, 382, 0, .6); c.fillRect(382, 18, 20, 524);
    c.restore();
    c.save(); c.shadowColor = '#ffa810'; c.shadowBlur = 8; c.strokeStyle = '#ffd95c'; c.lineWidth = 3.4; c.globalAlpha = .95;
    roundRect(c, 18, 18, 384, 524, 25); c.stroke(); c.restore();
    c.strokeStyle = 'rgba(255,253,236,.8)'; c.lineWidth = 1.2; roundRect(c, 18, 18, 384, 524, 25); c.stroke();
  }
  function paintGoldBand(c) {
    // A slim tilted ribbon of warm light, brightest along its spine, with a hairline of white through the middle.
    c.save(); c.translate(210, 120); c.rotate(-.16);
    const g = c.createLinearGradient(0, -24, 0, 24);
    g.addColorStop(0, 'rgba(255,214,110,0)'); g.addColorStop(.4, 'rgba(255,214,110,.18)'); g.addColorStop(.5, 'rgba(255,244,200,.32)');
    g.addColorStop(.6, 'rgba(255,214,110,.18)'); g.addColorStop(1, 'rgba(255,214,110,0)');
    c.fillStyle = g; c.fillRect(-260, -24, 520, 48);
    c.restore();
  }
  function drawGoldSky(ctx, state, time, still) {
    const left = Number(state.superBloom) || 0, fade = Math.min(1, (6 - left) / .35, left / .6);
    if (!(fade > 0)) return;
    const sky = hudSprite('sky:gold', 420, 560, paintGoldSky, 1), band = hudSprite('sky:band', 420, 240, paintGoldBand, 1);
    ctx.save(); ctx.globalAlpha = fade;
    if (sky) ctx.drawImage(sky.surface, 0, 0, 420, 560);
    else { ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 3.2; roundRect(ctx, 18, 18, 384, 524, 25); ctx.stroke(); }
    if (band) {
      // The band climbs from below the pod to above the top in about five seconds, then starts again.
      const y = still ? 120 : 560 - ((time * 150) % 800);
      ctx.globalAlpha = fade * (still ? .7 : .9); ctx.drawImage(band.surface, 0, y - 120, 420, 240);
    }
    ctx.restore();
  }
  function drawAtmosphere(ctx, state, time, options) {
    const golden = state.mode === 'rush' && state.superBloom > 0;
    if (golden) drawGoldSky(ctx, state, time, options.reducedMotion);
    if (options.reducedMotion) return;
    ctx.save();
    const fever = state.feverTime > 0 && !golden;
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
    const count = fever || golden ? 24 : 10;
    for (let i = 0; i < count; i++) {
      const x = 22 + ((i * 61.13 + Math.sin(time * .3 + i) * 14) % 376 + 376) % 376;
      const y = 28 + ((i * 79.87 - time * (5 + i % 3)) % 485 + 485) % 485;
      ctx.globalAlpha = (fever || golden ? .55 : .23) * (.55 + Math.sin(time * 1.3 + i * 2) * .3);
      sparkle(ctx, x, y, fever || golden ? 3 + i % 3 : 2.1, golden ? i % 3 ? '#fff4c2' : '#ffd25a' : '#ffffff', i * .21);
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
  // stay put as the trail ages instead of flickering from frame to frame. The ribbon is one tapered path into
  // the seed's drawn head (hx, hy), and firefly glows come from a cached sprite.
  function drawKeepsakeTrail(ctx, ball, style, r, time, hot, hx, hy) {
    const trail = ball.trail, spec = style.trail, accents = spec.accents;
    cometTrail(ctx, trail, Number.isFinite(hx) ? hx : ball.x, Number.isFinite(hy) ? hy : ball.y, r * (hot ? 1 : .78), spec.ribbon, hot ? .62 : .45);
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i], key = Math.abs(Math.round(p.x * 7.3 + p.y * 13.1));
      if (p.move || key % (hot ? 2 : 3)) continue;
      const f = (i + 1) / trail.length, size = r * (.55 + f * .75), color = accents[key % accents.length], spin = key * .37;
      ctx.save(); ctx.globalAlpha = Math.min(1, f * 1.15);
      if (spec.kind === 'blossoms') { ctx.translate(p.x, p.y); ctx.rotate(spin + time * 1.6); ctx.scale(.75, .75); sakuraPetal(ctx, size); ctx.fillStyle = color; ctx.fill(); }
      else if (spec.kind === 'fireflies') {
        const blink = .35 + .65 * Math.max(0, Math.sin(time * 9 + key)), fx = p.x + Math.sin(time * 3 + key) * 3, fy = p.y + Math.cos(time * 2.4 + key) * 3, s = size * .45;
        const glow = feelGlow('firefly|' + color, 10.8, [[0, color + 'bb'], [.35, color + '4d'], [1, color + '00']]);
        ctx.globalAlpha *= blink;
        if (glow) drawGlowSprite(ctx, glow, fx, fy, s / 3); else circle(ctx, fx, fy, s * 2, color + '33');
        circle(ctx, fx, fy, s * .8, color); circle(ctx, fx - s * .15, fy - s * .15, s * .38, '#fffbe6');
      }
      else if (spec.kind === 'flakes') goldFlake(ctx, p.x, p.y, size * .8, color, spin + time * 4);
      else if (spec.kind === 'stars') { ctx.globalAlpha *= .45 + .55 * Math.abs(Math.sin(time * 6 + key)); sparkle(ctx, p.x, p.y, size * 1.1, color, spin); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  // A soft colored halo under a seed, cached per color and size, in place of a per-frame shadow blur.
  function seedHalo(color, r, blur) {
    const R = r + 1.3 + blur, edge = (r + 1.3) / R;
    return feelGlow(`halo|${color}|${r}|${blur}`, R, [[0, color + '80'], [edge, color + '80'], [Math.min(.99, edge + 4 / R), color + '38'], [1, color + '00']]);
  }
  function seedStretch(ctx, ball, x, y, reducedMotion) {
    // Fresh off the pod the seed is stretched along its flight, then snaps round.
    const age = Number(ball.age);
    if (reducedMotion || !(age >= 0 && age < .08)) return;
    const s = 1 + .35 * (1 - age / .08);
    ctx.translate(x, y); ctx.rotate(Math.atan2(Number(ball.vy) || 0, Number(ball.vx) || 0)); ctx.scale(s, 1 / Math.sqrt(s)); ctx.translate(-x, -y);
  }
  function drawProjectile(ctx, ball, index, time, reducedMotion, fever, style) {
    // In slow motion a seed is drawn where it is between two physics steps, so it glides instead of stepping.
    const ox = frameAhead ? (Number(ball.vx) || 0) * frameAhead : 0, oy = frameAhead ? (Number(ball.vy) || 0) * frameAhead : 0;
    if (ball.power && POWER_TINT[ball.power]) {
      if (ox || oy) { ctx.save(); ctx.translate(ox, oy); drawPowerShot(ctx, ball, time, reducedMotion); ctx.restore(); }
      else drawPowerShot(ctx, ball, time, reducedMotion);
      return;
    }
    if (style && style.seed) { drawStyledProjectile(ctx, ball, time, reducedMotion, fever, style, index); return; }
    const c = FLOWERS[ball.type] || FLOWERS[['coral', 'gold', 'lilac'][index % 3]];
    const r = ball.r || 5.5, trail = ball.trail || [], x = ball.x + ox, y = ball.y + oy, hot = Boolean(fever || ball.hot);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // A comet: one tapered ribbon in the flower's color (a turning rainbow when the chain runs hot) and a bright
    // core along its last few samples. On a struggling phone only the first three seeds keep their tails.
    if (!reducedMotion && trail.length > 1 && !(feelQuality >= 1 && index >= 3)) {
      cometTrail(ctx, trail, x, y, r * .95, hot ? `hsl(${Math.round(time * 240) % 360},95%,66%)` : c.base, .55);
      const start = Math.max(0, trail.length - 7);
      ctx.beginPath(); ctx.moveTo(trail[start].x, trail[start].y);
      for (let i = start + 1; i < trail.length; i++) {
        if (trail[i].move) ctx.moveTo(trail[i].x, trail[i].y);
        else ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.lineTo(x, y); ctx.strokeStyle = '#fffbe1'; ctx.lineWidth = r * .55; ctx.globalAlpha = .8; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!reducedMotion) {
      const glow = feelGlow(`seed|${c.light}`, r * 4.2, [[0, c.light + 'aa'], [1, c.light + '00']]);
      ctx.globalCompositeOperation = 'lighter';
      if (glow) drawGlowSprite(ctx, glow, x, y); else circle(ctx, x, y, r * 2.4, c.light + '44');
      ctx.globalCompositeOperation = 'source-over';
    }
    const halo = reducedMotion ? null : seedHalo(c.base, r, fever ? 19 : 12);
    if (halo) drawGlowSprite(ctx, halo, x, y);
    else { ctx.shadowColor = c.base; ctx.shadowBlur = fever ? 19 : 12; }
    seedStretch(ctx, ball, x, y, reducedMotion);
    circle(ctx, x, y, r + 1.3, c.base);
    ctx.shadowBlur = 0;
    circle(ctx, x, y, r * .78, '#fffdf2');
    circle(ctx, x - r * .23, y - r * .27, r * .27, '#ffffff');
    if (fever && !reducedMotion) {
      ctx.globalAlpha = .85;
      sparkle(ctx, x, y, r * 1.95, '#fffce999', time + index);
    }
    ctx.restore();
  }

  function drawStyledProjectile(ctx, ball, time, reducedMotion, fever, style, index) {
    const s = style.seed, r = ball.r || 5.5, hot = fever || ball.hot;
    const x = ball.x + (frameAhead ? (Number(ball.vx) || 0) * frameAhead : 0), y = ball.y + (frameAhead ? (Number(ball.vy) || 0) * frameAhead : 0);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (!reducedMotion && (ball.trail || []).length > 1 && !(feelQuality >= 1 && index >= 3)) drawKeepsakeTrail(ctx, ball, style, r, time, hot, x, y);
    if (!reducedMotion) {
      const pulse = style.id === 'firefly' ? 1 + Math.sin(time * 8) * .22 : 1, gr = r * 4.4 * (hot ? 1.25 : 1);
      const glow = feelGlow(`styled|${style.id}|${hot ? 1 : 0}`, gr, [[0, s.light + 'cc'], [1, s.light + '00']]);
      ctx.globalCompositeOperation = 'lighter';
      if (glow) drawGlowSprite(ctx, glow, x, y, pulse); else circle(ctx, x, y, gr * .55 * pulse, s.light + '44');
      ctx.globalCompositeOperation = 'source-over';
    }
    const halo = reducedMotion ? null : seedHalo(s.base, r, hot ? 19 : 12);
    if (halo) drawGlowSprite(ctx, halo, x, y);
    else { ctx.shadowColor = s.base; ctx.shadowBlur = hot ? 19 : 12; }
    seedStretch(ctx, ball, x, y, reducedMotion);
    if (style.id === 'gilded') {
      // The gilded body is a cached metal sprite; in Node it falls back to the plain gradient.
      const key = `gilded|${r}`;
      let metal = feelSprites.get(key);
      if (metal === undefined) {
        const size = (r + 1.3) * 2 + 2, canvas = feelSurface(Math.ceil(size * 3), Math.ceil(size * 3));
        metal = null;
        if (canvas) {
          const g = canvas.getContext('2d'); g.scale(3, 3);
          const c = size / 2, fill = g.createLinearGradient(c - r, c - r, c + r, c + r);
          fill.addColorStop(0, s.core); fill.addColorStop(.45, s.light); fill.addColorStop(.7, s.base); fill.addColorStop(1, s.rim);
          circle(g, c, c, r + 1.3, fill); metal = { canvas, size };
        }
        feelSprites.set(key, metal);
      }
      if (metal) ctx.drawImage(metal.canvas, x - metal.size / 2, y - metal.size / 2, metal.size, metal.size);
      else {
        const fill = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        fill.addColorStop(0, s.core); fill.addColorStop(.45, s.light); fill.addColorStop(.7, s.base); fill.addColorStop(1, s.rim);
        circle(ctx, x, y, r + 1.3, fill);
      }
    } else circle(ctx, x, y, r + 1.3, s.base);
    ctx.shadowBlur = 0;
    if (style.id === 'sakura') blossom(ctx, x, y, r * 1.15, s.light, reducedMotion ? 0 : time * 3);
    else if (style.id === 'moonlit') { circle(ctx, x, y, r * .8, s.core); circle(ctx, x + r * .32, y - r * .12, r * .62, s.light); }
    else if (style.id !== 'gilded') circle(ctx, x, y, r * .74, s.core);
    circle(ctx, x - r * .25, y - r * .28, r * .25, '#ffffff');
    if (hot && !reducedMotion) { ctx.globalAlpha = .85; sparkle(ctx, x, y, r * 1.95, '#ffffffaa', time); }
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

  const glowMote = hex => feelGlow('pglow|' + hex, 8, [[0, '#ffffff'], [.35, hex], [1, hex + '00']]);
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
      // A glow mote is one cached sprite per color, scaled and faded, never a gradient per frame.
      ctx.globalCompositeOperation = 'lighter';
      const gr = size * 3.2, hex = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffcd45';
      const sprite = glowMote(hex);
      ctx.globalAlpha = f;
      if (sprite) drawGlowSprite(ctx, sprite, particle.x, particle.y, gr / 8);
      else { ctx.globalAlpha = f * .5; circle(ctx, particle.x, particle.y, gr * .5, hex); }
      ctx.restore(); return;
    }
    if (particle.kind === 'light') {
      // The finale's light: a warm glow on the flower that swells and fades, gilding it instead of bleaching the board.
      const q = 1 - f, rr = size + ease(q) * (particle.grow || 40), sprite = goldSprite();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .62 * f * f;
      if (sprite) dab(ctx, sprite, particle.x, particle.y, rr / 40); else circle(ctx, particle.x, particle.y, rr * .5, 'rgba(255,224,130,.5)');
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
    // Stage pieces: a ribbon title, a trick stamp and the lost-life band.
    if (floater.kind === 'title') { drawTitle(ctx, floater, reducedMotion); return; }
    if (floater.kind === 'trick') { drawStamp(ctx, floater, reducedMotion); return; }
    if (floater.kind === 'life') { drawLifeBand(ctx, floater, reducedMotion); return; }
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
    let size = wave ? 36 : praise ? (value.length > 10 ? 34 : 40) : combo ? 43 : bonus ? 31 : 21;
    ctx.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
    // A long banner (a boss's name) shrinks to fit the board.
    const wide = wave ? Number(ctx.measureText(value).width) || 0 : 0;
    if (wide > 330) { size = Math.max(22, Math.floor(size * 330 / wide)); ctx.font = `700 ${size}px Fredoka, system-ui, sans-serif`; }
    // A restrained metallic relief gives the number the finish of a small trophy.
    const fill = ctx.createLinearGradient(0, -size * .5, 0, size * .5);
    face.stops.forEach((color, i) => fill.addColorStop([0, .3, .57, 1][i], color));
    ctx.lineJoin = 'round';
    // A banner gets a dark rim under its cream line, so gold lettering still reads on the gold sky and amber scenes.
    if (wave) { ctx.lineWidth = 7; ctx.strokeStyle = '#5a3412'; ctx.strokeText(value, 0, .8); }
    ctx.lineWidth = praise ? 3.2 : wave ? 3 : 2.1; ctx.strokeStyle = '#fffce5';
    ctx.shadowColor = 'rgba(53,53,89,.45)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
    ctx.strokeText(value, 0, 0); ctx.fillStyle = face.under; ctx.fillText(value, 0, 1.7);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.fillStyle = fill; ctx.fillText(value, 0, 0);
    if (combo || bonus || wave) {
      const width = praise ? ctx.measureText(value).width : 0;
      ctx.font = `600 ${wave ? 14 : 13}px Fredoka, system-ui, sans-serif`;
      const label = wave || praise ? String(floater.label || '') : combo ? 'chain!' : 'extra seeds';
      ctx.shadowColor = 'rgba(255,255,255,.95)'; ctx.shadowBlur = 4;
      // A cream outline keeps the small line readable on the dark caves as well as the bright meadow.
      ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(255,252,236,.92)'; ctx.strokeText(label, 0, size * .62);
      ctx.fillStyle = '#245866'; ctx.fillText(label, 0, size * .62);
      ctx.shadowBlur = 0;
      const offset = wave ? clamp(Math.min(wide, 330) / 2 + 16, 124, 182) : praise ? width / 2 + 14 : combo ? 49 : 43;
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

  // The stage: ribbon titles, trick stamps, the lost-life band, the level curtain, the harvest orbs and the
  // boss's health vine. Each piece is painted once into a 3x sprite and reused; without a canvas (in node) there
  // is no sprite and the same painter draws live paths instead.
  const stageCache = new Map();
  function stageSprite(key, w, h, paint, scale) {
    if (stageCache.has(key)) { const hit = stageCache.get(key); stageCache.delete(key); stageCache.set(key, hit); return hit; }
    const k = scale || 3, pw = Math.max(1, Math.ceil(w * k)), ph = Math.max(1, Math.ceil(h * k));
    let surface = null;
    if (typeof OffscreenCanvas !== 'undefined') surface = new OffscreenCanvas(pw, ph);
    else if (typeof document !== 'undefined' && document.createElement) { surface = document.createElement('canvas'); surface.width = pw; surface.height = ph; }
    if (!surface) return null;
    const c = surface.getContext('2d'); c.scale(k, k); paint(c); painted++; warmMark(surface);
    const sprite = { surface, w, h, k };
    if (stageCache.size >= 64) stageCache.delete(stageCache.keys().next().value);
    stageCache.set(key, sprite);
    return sprite;
  }
  // Lettering is only cached once the font has arrived, so a sprite never keeps a fallback face.
  // A face that has arrived stays arrived, so the check (a style lookup each call) runs only until it does.
  const fontsIn = new Set();
  function fontReady(font) {
    if (fontsIn.has(font)) return true;
    const fonts = typeof document !== 'undefined' && document.fonts;
    const ready = !fonts || typeof fonts.check !== 'function' || fonts.check(font);
    if (ready) fontsIn.add(font);
    return ready;
  }
  function measure(ctx, font, text) { ctx.font = font; return Number(ctx.measureText(String(text)).width) || 0; }
  function shade(hex, amount) {
    const n = parseInt(String(hex).slice(1), 16) || 0, to = amount < 0 ? 255 : 0, a = Math.min(1, Math.abs(amount));
    const ch = shift => Math.round(((n >> shift) & 255) * (1 - a) + to * a);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  const backOut = (k, s) => { k = clamp(k, 0, 1) - 1; return 1 + (s + 1) * k * k * k + s * k * k; };
  // Keeps a piece of width w on the board.
  const onBoard = (x, w) => w >= 376 ? 210 : clamp(Number(x) || 210, 22 + w / 2, 398 - w / 2);

  // Ribbon titles: 'Level 4' over the level's name, 'Wave 3 of 10', a boss's name card and 'Level 4 clear!'.
  // A cream band with an arched edge and a sprig of leaves at each end; a boss gets a berry band, dark leaves
  // and gold lettering.
  const TITLE = { big: { title: 26, label: 14, pad: 30, h: 58, bare: 40, min: 168, leaf: 1 }, small: { title: 18, label: 12, pad: 22, h: 42, bare: 30, min: 118, leaf: .72 } };
  function titleLayout(ctx, floater) {
    const look = floater.size === 'small' ? TITLE.small : TITLE.big, text = String(floater.text || ''), label = floater.label ? String(floater.label) : '';
    const tf = `700 ${look.title}px Fredoka, system-ui, sans-serif`, lf = `600 ${look.label}px Fredoka, system-ui, sans-serif`;
    ctx.save(); const wide = Math.max(measure(ctx, tf, text), label ? measure(ctx, lf, label) : 0); ctx.restore();
    const bw = Math.min(330, Math.max(look.min, wide + look.pad * 2)), bh = label ? look.h : look.bare, boss = Boolean(floater.boss);
    return { look, text, label, tf, lf, bw, bh, boss, w: Math.ceil(bw + 64 * look.leaf + 8), h: Math.ceil(bh + 40) };
  }
  function ribbonPath(c, hw, hh, sag, rr) {
    c.beginPath(); c.moveTo(-hw + rr, -hh);
    c.quadraticCurveTo(0, -hh - sag * 2, hw - rr, -hh); c.quadraticCurveTo(hw, -hh, hw, -hh + rr);
    c.lineTo(hw, hh - rr); c.quadraticCurveTo(hw, hh, hw - rr, hh);
    c.quadraticCurveTo(0, hh - sag * 2, -hw + rr, hh); c.quadraticCurveTo(-hw, hh, -hw, hh - rr);
    c.lineTo(-hw, -hh + rr); c.quadraticCurveTo(-hw, -hh, -hw + rr, -hh); c.closePath();
  }
  function paintTitle(c, L) {
    const hw = L.bw / 2, hh = L.bh / 2, s = L.look.leaf, boss = L.boss, sag = L.bh * .07, rr = Math.min(14, L.bh * .3);
    const greens = boss ? ['#2f6a3e', '#45844f', '#24512f'] : ['#47b462', '#7bd57b', '#36985a'], vein = boss ? '#183a22' : '#2a7744';
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const side of [-1, 1]) {
      c.save(); c.translate(side * (hw - 7), 2); c.scale(s, s);
      c.beginPath(); c.moveTo(side * 2, -7); c.bezierCurveTo(side * 10, -19, side * 25, -17, side * 25, -9); c.bezierCurveTo(side * 25, -3, side * 18, -3, side * 18, -8);
      c.strokeStyle = greens[0]; c.lineWidth = 1.6; c.stroke();
      leaf(c, 0, 1, 23, 12, side * (Math.PI / 2 + .62), greens[2], vein);
      leaf(c, 0, 0, 29, 14, side * (Math.PI / 2 - .04), greens[0], vein);
      leaf(c, 0, -2, 21, 11, side * (Math.PI / 2 - .72), greens[1], vein);
      c.restore();
    }
    c.save(); c.shadowColor = boss ? 'rgba(46,8,44,.5)' : 'rgba(96,64,22,.34)'; c.shadowBlur = 9; c.shadowOffsetY = 3.5;
    ribbonPath(c, hw, hh, sag, rr);
    const band = c.createLinearGradient(0, -hh, 0, hh);
    if (boss) { band.addColorStop(0, '#94417f'); band.addColorStop(1, '#561f50'); } else { band.addColorStop(0, '#fffbf1'); band.addColorStop(1, '#f6e3b9'); }
    c.fillStyle = band; c.fill(); c.restore();
    ribbonPath(c, hw, hh, sag, rr); c.strokeStyle = boss ? '#f6c754' : '#d9ac5c'; c.lineWidth = 2.2; c.stroke();
    ribbonPath(c, hw - 3.6, hh - 3.6, sag, Math.max(2, rr - 3.6)); c.strokeStyle = boss ? 'rgba(255,214,120,.5)' : 'rgba(255,255,255,.85)'; c.lineWidth = 1.1; c.stroke();
    if (boss) {
      // Gold studs at the ends, like a storybook villain's title plate.
      for (const side of [-1, 1]) { circle(c, side * (hw - 9), 0, 3.4, '#ffd64f', '#a8701f', 1.1); circle(c, side * (hw - 9) - .9, -.9, 1.1, '#fff6c8'); }
    } else {
      blossom(c, -hw + 3, hh * .42, 7.5 * s, '#ff86ac', .4);
      blossom(c, hw - 3, hh * .42, 7.5 * s, '#a98bff', -.3);
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const ty = L.label ? -L.bh * .14 : 1, ly = L.bh * .25, size = L.look.title;
    c.font = L.tf;
    if (boss) {
      c.fillStyle = '#2a0a26'; c.fillText(L.text, 0, ty + 2);
      const gold = c.createLinearGradient(0, ty - size / 2, 0, ty + size / 2);
      gold.addColorStop(0, '#fffbe0'); gold.addColorStop(.45, '#ffe07a'); gold.addColorStop(1, '#f5a623');
      c.fillStyle = gold; c.fillText(L.text, 0, ty);
    } else {
      c.fillStyle = '#ffffff'; c.fillText(L.text, 0, ty + 1.4);
      c.fillStyle = '#1f5546'; c.fillText(L.text, 0, ty);
    }
    if (L.label) { c.font = L.lf; c.fillStyle = boss ? '#ffcbe3' : '#9c6a2c'; c.fillText(L.label, 0, ly); }
    c.restore();
  }
  // Layouts are measured once per callout and kept on it (as a hidden field, so copies of the floater stay plain).
  function layoutOf(ctx, floater, kind, make) {
    const held = floater.__layout;
    if (held && held.kind === kind && held.text === floater.text && held.label === floater.label) return held.value;
    const value = make(ctx, floater);
    try { Object.defineProperty(floater, '__layout', { value: { kind, text: floater.text, label: floater.label, value }, configurable: true, writable: true, enumerable: false }); } catch (error) { /* frozen: measure again next time */ }
    return value;
  }
  function drawTitle(ctx, floater, reducedMotion) {
    const life = Math.max(0, floater.life == null ? 1 : floater.life), duration = floater.maxLife || 1.2, age = Math.max(0, duration - life);
    const L = layoutOf(ctx, floater, 'title', titleLayout);
    let scale = 1, alpha = Math.min(1, life / .26);
    if (!reducedMotion) {
      // A boss's card slams down; every other title springs up and then floats.
      if (L.boss) { const k = clamp(age / .16, 0, 1); scale = 1 + .55 * (1 - k) * (1 - k); alpha *= Math.min(1, age / .07); }
      else { scale = age < .18 ? .3 + .7 * backOut(age / .18, 2.4) : 1; alpha *= Math.min(1, age / .05); }
    }
    ctx.save();
    // A boss's card holds its place under the boss instead of drifting up into it.
    const hold = L.boss ? age * 12 : 0;
    ctx.translate(onBoard(floater.x, L.w - 8), (Number(floater.y) || 210) + hold + (reducedMotion ? 0 : Math.sin(age * 3.4) * 1.6));
    if (!reducedMotion) ctx.rotate(Math.sin(age * 2.3 + .6) * .012);
    ctx.scale(scale, scale); ctx.globalAlpha *= alpha;
    const key = `title|${L.boss ? 'boss' : floater.size === 'small' ? 'small' : 'big'}|${L.text}|${L.label}`;
    const sprite = fontReady(L.tf) ? stageSprite(key, L.w, L.h, c => { c.translate(L.w / 2, L.h / 2); paintTitle(c, L); }) : null;
    if (sprite) ctx.drawImage(sprite.surface, -L.w / 2, -L.h / 2, L.w, L.h); else paintTitle(ctx, L);
    if (!reducedMotion && age < .75) {
      const k = age / .75, hw = L.bw / 2, hh = L.bh / 2;
      ctx.globalAlpha *= Math.sin(k * Math.PI);
      sparkle(ctx, -hw + 10 - k * 8, -hh - 6 - k * 10, 4.2, '#fffbe0', k * 2);
      sparkle(ctx, hw - 16 + k * 9, -hh - 2 - k * 12, 3.2, '#fffbe0', -k * 2);
      sparkle(ctx, hw - 4 + k * 6, hh + 4 + k * 6, 2.6, '#fffbe0', k);
    }
    ctx.restore();
  }

  // Trick stamps: a colored band stamped on at -6 degrees, a medallion with the trick's own mark, and the bonus
  // on a cream tag tucked under it.
  const STAMPS = { slam: ['#ff5d94', 'star'], hat: ['#a47dff', 'hat'], trick: ['#ffb534', 'swirl'], close: ['#3ccf9a', 'heart'], tunnel: ['#45adff', 'arch'], rebound: ['#ff7433', 'arrow'], bank: ['#7b8cff', 'chevrons'] };
  function stampLayout(ctx, floater) {
    const kind = STAMPS[floater.trick] ? floater.trick : 'trick', [color, glyph] = STAMPS[kind];
    const text = String(floater.text || ''), label = floater.label ? String(floater.label) : '';
    const tf = '700 19px Fredoka, system-ui, sans-serif', lf = '700 13px Fredoka, system-ui, sans-serif';
    ctx.save(); const tw = measure(ctx, tf, text), lw = label ? measure(ctx, lf, label) : 0; ctx.restore();
    const medal = 19, bw = Math.min(300, Math.max(112, tw + 36 + medal)), bh = 32;
    return { kind, color, glyph, text, label, tf, lf, lw, medal, bw, bh, w: Math.ceil(bw + medal + 22), h: 86 };
  }
  function stampGlyph(c, glyph, deep) {
    c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff'; c.lineCap = 'round'; c.lineJoin = 'round';
    if (glyph === 'star') {
      c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4.7 : 10.6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r + .9); }
      c.closePath(); c.lineWidth = 1.8; c.fill(); c.stroke();
    } else if (glyph === 'hat') {
      roundRect(c, -6.6, -10.5, 13.2, 13, 2.2); c.fill();
      c.beginPath(); c.ellipse(0, 2.8, 11.2, 3.2, 0, 0, TAU); c.fill();
      c.fillStyle = deep; c.fillRect(-6.6, -1.9, 13.2, 2.9);
      circle(c, -3.6, -7.6, 1.1, 'rgba(255,255,255,.9)');
    } else if (glyph === 'swirl') {
      c.beginPath(); for (let i = 0; i <= 44; i++) { const t = i / 44, a = t * TAU * 1.8 - 1, r = .8 + t * 9.6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.lineWidth = 2.7; c.stroke();
    } else if (glyph === 'heart') {
      c.beginPath(); c.moveTo(0, 9.5); c.bezierCurveTo(-14, .5, -8.5, -11.5, 0, -4.2); c.bezierCurveTo(8.5, -11.5, 14, .5, 0, 9.5); c.fill();
      circle(c, -4.6, -4.2, 1.6, deep);
    } else if (glyph === 'arch') {
      c.beginPath(); c.moveTo(-10.5, 8.5); c.lineTo(-10.5, 0); c.arc(0, 0, 10.5, Math.PI, 0); c.lineTo(10.5, 8.5); c.lineTo(5, 8.5); c.lineTo(5, 0);
      c.arc(0, 0, 5, 0, Math.PI, true); c.lineTo(-5, 8.5); c.closePath(); c.fill();
    } else if (glyph === 'arrow') {
      c.beginPath(); c.moveTo(7.5, 9); c.lineTo(7.5, -1); c.arc(1.5, -1, 6, 0, Math.PI, true); c.lineTo(-4.5, 2.5); c.lineWidth = 3; c.stroke();
      c.beginPath(); c.moveTo(-9.5, 1.5); c.lineTo(.5, 1.5); c.lineTo(-4.5, 9.5); c.closePath(); c.fill();
    } else {
      c.beginPath(); c.moveTo(-8, -7.5); c.lineTo(-1.5, 0); c.lineTo(-8, 7.5); c.moveTo(.5, -7.5); c.lineTo(7, 0); c.lineTo(.5, 7.5);
      c.lineWidth = 3.2; c.stroke();
    }
  }
  // The bonus tag tucked under the band: painted live each frame (a plain shape and one line of text, no blur), so
  // the cached body serves every bonus a trick can pay.
  function paintStampTag(c, S) {
    if (!S.label) return;
    const deep = shade(S.color, .42), dark = shade(S.color, .2), hw = S.bw / 2, hh = S.bh / 2, w = S.lw + 18, x = hw - w - 10;
    c.save(); c.translate(S.medal / 2 - 2, 0); c.lineJoin = 'round';
    roundRect(c, x, hh - 6.5, w, 25, 9); c.fillStyle = 'rgba(40,30,60,.2)'; c.fill();
    roundRect(c, x, hh - 8, w, 25, 9); c.fillStyle = '#fffaf0'; c.fill(); c.strokeStyle = dark; c.lineWidth = 1.6; c.stroke();
    c.font = S.lf; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = deep; c.fillText(S.label, x + w / 2, hh + 8.5);
    c.restore();
  }
  function paintStamp(c, S, tag) {
    const deep = shade(S.color, .42), dark = shade(S.color, .2), hw = S.bw / 2, hh = S.bh / 2, mx = -hw, tx = S.medal / 2;
    if (tag !== false) paintStampTag(c, S);
    c.save(); c.translate(S.medal / 2 - 2, 0); c.lineJoin = 'round';
    c.save(); c.shadowColor = 'rgba(40,30,60,.35)'; c.shadowBlur = 7; c.shadowOffsetY = 3;
    roundRect(c, -hw, -hh, S.bw, S.bh, hh); c.fillStyle = S.color; c.fill(); c.restore();
    c.save(); roundRect(c, -hw, -hh, S.bw, S.bh, hh); c.clip();
    c.fillStyle = 'rgba(255,255,255,.24)'; c.fillRect(-hw, -hh, S.bw, S.bh * .36);
    c.fillStyle = 'rgba(40,10,40,.12)'; c.fillRect(-hw, hh * .3, S.bw, S.bh);
    c.restore();
    roundRect(c, -hw, -hh, S.bw, S.bh, hh); c.strokeStyle = '#ffffff'; c.lineWidth = 2.6; c.stroke();
    c.setLineDash([3.2, 3]); roundRect(c, -hw + 4.5, -hh + 4.5, S.bw - 9, S.bh - 9, hh - 4.5); c.strokeStyle = 'rgba(255,255,255,.62)'; c.lineWidth = 1.1; c.stroke(); c.setLineDash([]);
    c.save(); c.shadowColor = 'rgba(40,30,60,.35)'; c.shadowBlur = 6; c.shadowOffsetY = 2.5; circle(c, mx, 0, S.medal, dark); c.restore();
    circle(c, mx, 0, S.medal, null, '#ffffff', 2.8); circle(c, mx, 0, S.medal - 4.2, null, 'rgba(255,255,255,.5)', 1);
    c.save(); c.translate(mx, 0); stampGlyph(c, S.glyph, deep); c.restore();
    c.font = S.tf; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3.6; c.strokeStyle = deep; c.strokeText(S.text, tx, .5); c.fillStyle = '#ffffff'; c.fillText(S.text, tx, 0);
    c.restore();
  }
  function drawStamp(ctx, floater, reducedMotion) {
    const life = Math.max(0, floater.life == null ? 1 : floater.life), duration = floater.maxLife || 1.1, age = Math.max(0, duration - life);
    const S = layoutOf(ctx, floater, 'stamp', stampLayout);
    // A stamp in the pod's lane (lane) is a little smaller and sits square, like a tag on the score. It drops onto
    // its place at its own size instead of shrinking down from a giant, so even mid-drop it never reaches over the
    // pod, the seed or the sun fan beside it, nor past the board's edge.
    const lane = Boolean(floater.lane), size = lane ? .8 : 1;
    let scale = 1, alpha = Math.min(1, life / .22), drop = 0;
    if (!reducedMotion) {
      // Stamped on: it drops from above the page, squashes once and lifts away as it fades.
      if (age < .11) { const k = age / .11; if (lane) drop = -18 * (1 - k * k); else scale = 1.75 - .75 * k * k; alpha *= k; }
      else if (age < .3) scale = 1 - .07 * Math.sin((age - .11) / .19 * Math.PI);
      if (life < .22) scale *= 1 + (1 - life / .22) * .08;
    }
    ctx.save(); ctx.translate(lane ? clamp(Number(floater.x) || 104, 22 + S.w * size / 2, 398 - S.w * size / 2) : onBoard(floater.x, S.w), (Number(floater.y) || 200) + drop);
    ctx.rotate((lane ? -3 : -6) * Math.PI / 180); ctx.scale(scale * size, scale * size);
    ctx.globalAlpha *= alpha;
    const key = `trick|${S.kind}|${S.text}`;
    const sprite = fontReady(S.tf) ? stageSprite(key, S.w, S.h, c => { c.translate(S.w / 2, S.h / 2); paintStamp(c, S, false); }) : null;
    if (sprite) { paintStampTag(ctx, S); ctx.drawImage(sprite.surface, -S.w / 2, -S.h / 2, S.w, S.h); } else paintStamp(ctx, S);
    if (!reducedMotion && age >= .1 && age < .38) {
      // Ink flicks out from the edge as it lands.
      // In the lane they stay tight to the stamp, clear of the pod.
      const k = (age - .1) / .28, rx = S.bw / 2 + (lane ? 4 + k * 8 : 18 + k * 16), ry = S.bh / 2 + (lane ? 6 + k * 8 : 12 + k * 14), fl = lane ? 6 : 9;
      ctx.globalAlpha *= 1 - k; ctx.strokeStyle = S.color; ctx.lineWidth = .8 + 2.4 * (1 - k); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + .3, c = Math.cos(a), s = Math.sin(a); ctx.moveTo(c * rx, s * ry); ctx.lineTo(c * (rx + fl), s * (ry + fl * .78)); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // The lost-life band: soft red, white lettering, a cracked heart, and a shudder as it lands.
  function paintLifeBand(c, L) {
    const hw = L.bw / 2, hh = L.bh / 2;
    c.save(); c.shadowColor = 'rgba(120,20,50,.35)'; c.shadowBlur = 7; c.shadowOffsetY = 3;
    roundRect(c, -hw, -hh, L.bw, L.bh, hh);
    const band = c.createLinearGradient(0, -hh, 0, hh); band.addColorStop(0, '#ff8a9c'); band.addColorStop(1, '#e8506e');
    c.fillStyle = band; c.fill(); c.restore();
    c.save(); roundRect(c, -hw, -hh, L.bw, L.bh, hh); c.clip(); c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(-hw, -hh, L.bw, L.bh * .34); c.restore();
    roundRect(c, -hw, -hh, L.bw, L.bh, hh); c.strokeStyle = '#ffffff'; c.lineWidth = 2.2; c.stroke();
    const hx = -hw + 18;
    c.beginPath(); c.moveTo(hx, 7); c.bezierCurveTo(hx - 11, 0, hx - 7, -9.5, hx, -3.6); c.bezierCurveTo(hx + 7, -9.5, hx + 11, 0, hx, 7);
    c.fillStyle = '#ffffff'; c.fill();
    c.beginPath(); c.moveTo(hx + .5, -3.4); c.lineTo(hx - 1.6, -.4); c.lineTo(hx + 1.4, 1.6); c.lineTo(hx - .4, 5.2);
    c.strokeStyle = '#e8506e'; c.lineWidth = 1.3; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
    c.font = L.tf; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = 3.2; c.strokeStyle = '#c23a5a'; c.strokeText(L.text, 9, .5); c.fillStyle = '#ffffff'; c.fillText(L.text, 9, 0);
  }
  function drawLifeBand(ctx, floater, reducedMotion) {
    const life = Math.max(0, floater.life == null ? 1 : floater.life), duration = floater.maxLife || 1.1, age = Math.max(0, duration - life);
    const L = layoutOf(ctx, floater, 'life', () => {
      const text = String(floater.text || ''), tf = '700 16px Fredoka, system-ui, sans-serif';
      ctx.save(); const tw = measure(ctx, tf, text); ctx.restore();
      const bw = Math.min(300, Math.max(124, tw + 54));
      return { text, tf, bw, bh: 30, w: Math.ceil(bw + 16), h: 46 };
    }), text = L.text, tf = L.tf;
    let scale = 1, dx = 0, alpha = Math.min(1, life / .25);
    if (!reducedMotion) { scale = age < .2 ? .55 + .45 * backOut(age / .2, 2) : 1; if (age < .4) dx = Math.sin(age * 58) * 5 * (1 - age / .4); alpha *= Math.min(1, age / .05); }
    ctx.save(); ctx.translate(onBoard(floater.x, L.w) + dx, Number(floater.y) || 380); ctx.scale(scale, scale); ctx.globalAlpha *= alpha;
    const sprite = fontReady(tf) ? stageSprite(`life|${text}`, L.w, L.h, c => { c.translate(L.w / 2, L.h / 2); paintLifeBand(c, L); }) : null;
    if (sprite) ctx.drawImage(sprite.surface, -L.w / 2, -L.h / 2, L.w, L.h); else paintLifeBand(ctx, L);
    ctx.restore();
  }

  // Everything the stage draws over the board: the boss's vine, the harvest, then the opening curtain on top.
  function drawStage(ctx, state, time, options) {
    const stage = state.stage, harvest = Array.isArray(state.harvest) ? state.harvest : null;
    if (!stage && !(harvest && harvest.length)) return;
    const still = Boolean(options && options.reducedMotion), cam = options && options.camera;
    ctx.save();
    // The vine and the harvest belong to the HUD, so they hold still while the camera leans in.
    if (!still && cam && Number(cam.zoom) > 1.001) {
      const z = Number(cam.zoom), fx = Number.isFinite(cam.fx) ? cam.fx : 210, fy = Number.isFinite(cam.fy) ? cam.fy : 280;
      ctx.translate(fx, fy); ctx.scale(1 / z, 1 / z); ctx.translate(-fx, -fy);
    }
    if (stage && stage.vine) drawBossVine(ctx, stage.vine, time, still);
    if (!still && harvest && harvest.length) drawHarvest(ctx, harvest);
    if (!still && stage && stage.glow > 0) {
      // Where the orbs land, the corner flares a little more with each one.
      const g = clamp(stage.glow, 0, 1), sprite = orbSprite(), gy = Math.max(6, HARVEST_TO.y);
      ctx.globalAlpha = g; glowAt(ctx, sprite, HARVEST_TO.x, gy, 34 + g * 60);
      sparkle(ctx, HARVEST_TO.x - 6, gy + 8, 4 + g * 9, '#ffffff', time * 2);
    }
    ctx.restore();
    if (!still && stage && typeof stage.introAt === 'number') drawCurtain(ctx, time - stage.introAt);
  }

  // Harvest orbs: each bloom's light lifts off its flower and arcs into the score at the top right, quicker as
  // it goes. They all share one glow sprite; the colored core is the flower's own.
  // Where the orbs fly: the board's top edge right under the score readout (the app gives the readout's place in
  // board space, above the board, so y is negative). They leave the board there and the app carries each one on to
  // the score as a spark on the page; the glow that sees them off sits just inside the edge. Returns the exit point.
  const HARVEST_TO = { x: 392, y: -6 };
  function setHarvestTarget(x, y) {
    if (Number.isFinite(x)) HARVEST_TO.x = clamp(x, 30, 390);
    if (Number.isFinite(y)) HARVEST_TO.y = clamp(y, -6, 10);
    return { x: HARVEST_TO.x, y: HARVEST_TO.y };
  }
  function orbSprite() {
    return stageSprite('orb', 32, 32, c => {
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,250,1)'); g.addColorStop(.2, 'rgba(255,248,200,.95)'); g.addColorStop(.48, 'rgba(255,214,112,.42)'); g.addColorStop(1, 'rgba(255,190,80,0)');
      c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    });
  }
  function glowAt(ctx, sprite, x, y, d) {
    if (sprite) ctx.drawImage(sprite.surface, x - d / 2, y - d / 2, d, d);
    else circle(ctx, x, y, d * .28, 'rgba(255,240,180,.8)');
  }
  // Points along an orb's path go into reused scratch objects, so a full harvest allocates nothing per frame.
  const ORB_AT = { x: 0, y: 0 }, ORB_AHEAD = { x: 0, y: 0 }, TAIL = new Float64Array(24);
  function orbPoint(orb, u, out) {
    const p = u * u, q = 1 - p, x0 = orb.x, y0 = orb.y, i = orb.i || 0;
    const x1 = x0 + (HARVEST_TO.x - x0) * .15 + (i % 3 - 1) * 22, y1 = y0 * .45 - (i % 4) * 8;
    out.x = q * q * x0 + 2 * q * p * x1 + p * p * HARVEST_TO.x; out.y = q * q * y0 + 2 * q * p * y1 + p * p * HARVEST_TO.y;
    return out;
  }
  function cometTail(ctx, orb, u, tail, width, alpha) {
    for (let j = 0; j <= 5; j++) {
      const v = u - tail * (1 - j / 5), a = orbPoint(orb, v, ORB_AT), b = orbPoint(orb, v + .01, ORB_AHEAD);
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, w = width * j / 5;
      TAIL[j * 4] = a.x - dy / len * w; TAIL[j * 4 + 1] = a.y + dx / len * w; TAIL[j * 4 + 2] = a.x + dy / len * w; TAIL[j * 4 + 3] = a.y - dx / len * w;
    }
    ctx.globalAlpha = alpha; ctx.beginPath(); ctx.moveTo(TAIL[0], TAIL[1]);
    for (let j = 1; j <= 5; j++) ctx.lineTo(TAIL[j * 4], TAIL[j * 4 + 1]);
    for (let j = 5; j >= 0; j--) ctx.lineTo(TAIL[j * 4 + 2], TAIL[j * 4 + 3]);
    ctx.closePath(); ctx.fill();
  }
  function drawHarvest(ctx, harvest) {
    const sprite = orbSprite();
    ctx.save(); ctx.lineCap = 'round';
    for (const orb of harvest) {
      const dur = orb.dur || .55, u = ((Number(orb.t) || 0) - (orb.delay || 0)) / dur, color = orb.color || '#ffd148';
      if (!(u >= -.3 && u < 1)) continue;
      if (u < 0) {
        // The light gathers on the flower before it lifts off.
        const k = 1 + u / .3; ctx.globalAlpha = k; glowAt(ctx, sprite, orb.x, orb.y, 10 + k * 22);
        circle(ctx, orb.x, orb.y, 1.5 + k * 3, color, '#ffffff', 1.2); continue;
      }
      const size = 6.2 * Math.min(1, .55 + u / .1 * .45) * (1 - .25 * u);
      // A comet tail in the flower's own color: one tapered shape along the path, a faint wide one under a brighter core.
      const tail = Math.min(u, .2);
      if (tail > .01) { ctx.fillStyle = color; cometTail(ctx, orb, u, tail, size * 1.25, .26); cometTail(ctx, orb, u, tail * .7, size * .62, .5); }
      const at = orbPoint(orb, u, ORB_AT);
      ctx.globalAlpha = 1; glowAt(ctx, sprite, at.x, at.y, size * 5.6);
      circle(ctx, at.x, at.y, size, color, '#ffffff', 1.5);
      circle(ctx, at.x - size * .25, at.y - size * .28, size * .38, '#ffffff');
    }
    ctx.restore();
  }

  // The boss's health vine across the top: one leaf per hit left. A lost leaf falls, a pale stretch of stem shows
  // the damage and shrinks, and a hit shakes the vine. Stems are cached once and cropped; leaves are cached per
  // hit count.
  const VINE = { x: 90, y: 18, w: 240, left: 56, top: -4, width: 308, height: 44 };
  const vineY = x => VINE.y + Math.sin((x - VINE.x) / VINE.w * TAU * 1.5) * 1.6;
  function vineStem(c, from, to) {
    c.beginPath();
    for (let x = from; x <= to + .01; x += 6) { if (x === from) c.moveTo(x, vineY(x)); else c.lineTo(x, vineY(x)); }
  }
  function paintVineBase(c, type) {
    const tone = FLOWERS[type] || FLOWERS.coral;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.save(); c.shadowColor = 'rgba(40,30,20,.28)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
    roundRect(c, VINE.x - 30, VINE.y - 13, VINE.w + 54, 26, 13); c.fillStyle = 'rgba(255,248,228,.9)'; c.fill(); c.restore();
    roundRect(c, VINE.x - 30, VINE.y - 13, VINE.w + 54, 26, 13); c.strokeStyle = '#e2c287'; c.lineWidth = 1.4; c.stroke();
    roundRect(c, VINE.x - 27.5, VINE.y - 10.5, VINE.w + 49, 21, 10.5); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1; c.stroke();
    vineStem(c, VINE.x, VINE.x + VINE.w); c.strokeStyle = 'rgba(120,96,58,.45)'; c.lineWidth = 3.2; c.stroke();
    vineStem(c, VINE.x, VINE.x + VINE.w); c.strokeStyle = '#c8b083'; c.lineWidth = 1.8; c.stroke();
    // A curl at the far end, and the boss's own little crowned bloom at the near end.
    const ex = VINE.x + VINE.w, ey = vineY(ex);
    c.beginPath(); c.moveTo(ex, ey); c.bezierCurveTo(ex + 8, ey - 2, ex + 13, ey - 9, ex + 8, ey - 11); c.bezierCurveTo(ex + 4, ey - 12, ex + 3, ey - 7, ex + 7, ey - 6);
    c.strokeStyle = '#4aa45c'; c.lineWidth = 1.6; c.stroke();
    const bx = VINE.x - 13, by = VINE.y;
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; circle(c, bx + Math.cos(a) * 5, by + Math.sin(a) * 5, 4.2, tone.base); }
    circle(c, bx, by, 4.6, tone.seed || '#fff3a0', tone.dark, 1.1);
    c.beginPath(); c.moveTo(bx - 5, by - 8); c.lineTo(bx - 6, by - 13); c.lineTo(bx - 2.5, by - 10.5); c.lineTo(bx, by - 14.5); c.lineTo(bx + 2.5, by - 10.5); c.lineTo(bx + 6, by - 13); c.lineTo(bx + 5, by - 8); c.closePath();
    c.fillStyle = '#ffd64f'; c.fill(); c.strokeStyle = '#a8701f'; c.lineWidth = 1; c.stroke();
    c.restore();
  }
  function paintVineStem(c, color, light) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    vineStem(c, VINE.x, VINE.x + VINE.w); c.strokeStyle = color; c.lineWidth = 4.4; c.stroke();
    c.translate(0, -1); vineStem(c, VINE.x, VINE.x + VINE.w); c.strokeStyle = light; c.lineWidth = 1.3; c.stroke();
    c.restore();
  }
  const vineSlot = (i, max) => VINE.x + VINE.w * (i + .5) / max;
  const vineLeafSize = max => clamp(VINE.w / max * 1.15, 11, 18);
  function paintVineLeaves(c, max, hp) {
    const length = vineLeafSize(max);
    for (let i = 0; i < max; i++) {
      const x = vineSlot(i, max), y = vineY(x);
      if (i >= hp) { circle(c, x, y, 1.7, '#a3845a'); continue; }
      leaf(c, x, y, length, length * .6, i % 2 ? Math.PI - .8 : .8, i % 2 ? '#3fa957' : '#55c467', '#2a7744');
    }
  }
  let vineLeavesKey = '';
  function vinePiece(key, paint) {
    return stageSprite(key, VINE.width, VINE.height, c => { c.translate(-VINE.left, -VINE.top); paint(c); });
  }
  // Draws the board-x range [from, to] of a vine sprite (or paints it live, clipped, without one).
  function vineBlit(ctx, sprite, paint, from, to) {
    if (!(to > from)) return;
    if (sprite) {
      const k = sprite.k, sx = (from - VINE.left) * k, sw = (to - from) * k;
      ctx.drawImage(sprite.surface, sx, 0, sw, sprite.surface.height, from, VINE.top, to - from, sprite.surface.height / k);
      return;
    }
    ctx.save(); ctx.beginPath(); ctx.rect(from, VINE.top, to - from, VINE.height); ctx.clip(); paint(ctx); ctx.restore();
  }
  function drawBossVine(ctx, vine, time, still) {
    const bud = vine.bud;
    if (!bud || vine.shownAt == null || time < vine.shownAt) return;
    let alpha = 1;
    if (bud.bloomed) { const after = time - (Number(bud.bloomAt) || time); if (after > .45) return; alpha = 1 - clamp(after / .45, 0, 1); }
    const max = Math.max(1, Math.round(Number(vine.max) || 1)), hp = bud.bloomed ? 0 : clamp(Math.round(Number(bud.hp) || 0), 0, max);
    const reveal = still ? 1 : ease((time - vine.shownAt) / .45), right = VINE.left + (VINE.width - 4) * reveal;
    const since = time - (Number(vine.shakeAt) || -100), shake = !still && since >= 0 && since < .2 ? Math.sin(since * 95) * 3 * (1 - since / .2) : 0;
    const xHp = VINE.x + VINE.w * hp / max, xLag = VINE.x + VINE.w * clamp(Math.max(hp, Number(vine.lag) || 0), 0, max) / max;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(shake, 0);
    const type = FLOWERS[bud.type] ? bud.type : 'coral';
    const paintBase = c => paintVineBase(c, type), paintLag = c => paintVineStem(c, '#ffe58a', '#fffbe6'), paintLive = c => paintVineStem(c, '#3c9a50', '#9de58f');
    const paintLeaves = c => paintVineLeaves(c, max, hp);
    vineBlit(ctx, vinePiece(`vine|base|${type}`, paintBase), paintBase, VINE.left, right);
    vineBlit(ctx, vinePiece('vine|lag', paintLag), paintLag, VINE.x - 3, Math.min(right, xLag + 2));
    vineBlit(ctx, vinePiece('vine|live', paintLive), paintLive, VINE.x - 3, Math.min(right, xHp + 2));
    // A boss only ever loses leaves, so the sprite for the count it just left is let go (up to 19 of them a fight).
    const leavesKey = `vine|leaves|${max}|${hp}`;
    if (vineLeavesKey !== leavesKey) { if (vineLeavesKey) stageCache.delete(vineLeavesKey); vineLeavesKey = leavesKey; }
    // Once it blooms only the leaf scars are left, for the .45 s the vine fades: painted live, not a new sprite at
    // the busiest moment of the level.
    vineBlit(ctx, bud.bloomed ? null : vinePiece(leavesKey, paintLeaves), paintLeaves, VINE.left, right);
    // Lost leaves drop off and tumble away.
    const length = vineLeafSize(max);
    for (const fall of vine.fallen || []) {
      const age = time - fall.at;
      if (still || age < 0 || age > .9 || fall.i >= max) continue;
      const x0 = vineSlot(fall.i, max), spin = fall.spin || 1;
      ctx.save(); ctx.globalAlpha *= 1 - age / .9;
      leaf(ctx, x0 + spin * age * 24, vineY(x0) + age * 26 + age * age * 150, length, length * .6, (fall.i % 2 ? Math.PI - .8 : .8) + spin * age * 6, '#6cc274', '#2a7744');
      ctx.restore();
    }
    // The name waits while the boss's own card shows it, then comes in under the vine.
    const card = (Number(vine.cardUntil) || 0) - time, named = clamp((reveal - .6) / .4, 0, 1) * (card > 0 ? clamp(1 - card / .25, 0, 1) : 1);
    if (vine.name && named > 0) {
      ctx.globalAlpha *= named;
      ctx.font = '700 13px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,250,236,.97)'; ctx.strokeText(vine.name, VINE.x + VINE.w / 2, VINE.y + 19);
      ctx.fillStyle = (FLOWERS[type] || FLOWERS.coral).dark; ctx.fillText(vine.name, VINE.x + VINE.w / 2, VINE.y + 19);
    }
    ctx.restore();
  }

  // The opening curtain: two leafy borders, cached once, part off the top and bottom over .6 s.
  const CURTAIN = { top: 190, bottom: 300 };
  function paintCurtain(c, h, seed) {
    const rand = rng(seed), edge = h - 50;
    const body = c.createLinearGradient(0, 0, 0, edge);
    body.addColorStop(0, '#153d2b'); body.addColorStop(.7, '#1f5638'); body.addColorStop(1, '#286a42');
    c.fillStyle = body; c.fillRect(0, 0, 420, edge + 2);
    const tones = ['#1b4d34', '#235f3e', '#2c6f48', '#18462f', '#2f7a4d'];
    for (let i = 0; i < 100; i++) { const y = rand() * (edge + 4); leaf(c, rand() * 440 - 10, y, 18 + rand() * 20, 10 + rand() * 8, rand() * TAU, tones[y > edge * .6 && i % 3 === 0 ? 4 : i % 4], i % 6 === 0 ? '#1a4a31' : null); }
    c.save(); c.shadowColor = 'rgba(6,32,20,.55)'; c.shadowBlur = 10; c.shadowOffsetY = 7;
    for (let x = -8; x < 432; x += 12) leaf(c, x + rand() * 6, edge - 6, 27 + rand() * 13, 14 + rand() * 5, Math.PI + (rand() - .5) * .8, rand() < .5 ? '#27673f' : '#30774a', null);
    c.restore();
    const fronts = ['#3d8d53', '#4ea862', '#5cbb6b', '#46a05c'];
    for (let x = -4; x < 432; x += 17) leaf(c, x + rand() * 8, edge - 9 + rand() * 4, 19 + rand() * 14, 11 + rand() * 4, Math.PI + (rand() - .5) * 1.2, fronts[Math.floor(rand() * 4)], '#286a42');
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    const vy = x => edge - 11 + Math.sin(x * .045 + seed) * 4;
    c.beginPath(); for (let x = -10; x <= 430; x += 10) { if (x === -10) c.moveTo(x, vy(x)); else c.lineTo(x, vy(x)); }
    c.strokeStyle = '#5e4126'; c.lineWidth = 4.2; c.stroke(); c.strokeStyle = 'rgba(176,132,82,.8)'; c.lineWidth = 1.3; c.stroke();
    // Tendrils curl off the vine, and little flowers sit along it.
    for (let x = 30 + rand() * 20; x < 400; x += 70 + rand() * 40) {
      const y = vy(x), d = rand() < .5 ? 1 : -1;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + d * 6, y + 10, x + d * 16, y + 12, x + d * 15, y + 5); c.bezierCurveTo(x + d * 14, y + 1, x + d * 9, y + 3, x + d * 11, y + 6);
      c.strokeStyle = '#6cc070'; c.lineWidth = 1.4; c.stroke();
    }
    const petals = ['#ff86ac', '#ffd148', '#a98bff', '#6cc4ff', '#ff9a5c'];
    for (let i = 0, x = 16 + rand() * 12; x < 412; i++, x += 36 + rand() * 24) {
      leaf(c, x - 4, vy(x) + 1, 11, 6, Math.PI + .9, '#5cbb6b', null);
      blossom(c, x, vy(x) + 1, 7.5 + rand() * 3, petals[i % petals.length], rand() * TAU);
    }
    c.restore();
  }
  function curtainSprite(which) {
    const h = CURTAIN[which];
    return stageSprite(`curtain|${which}`, 420, h, c => paintCurtain(c, h, which === 'top' ? 11 : 29), 2);
  }
  function drawCurtain(ctx, age) {
    if (!(age >= 0 && age < .6)) return;
    const move = Math.pow(age / .6, 2.2);
    for (const which of ['top', 'bottom']) {
      const h = CURTAIN[which], sprite = curtainSprite(which);
      ctx.save();
      if (which === 'top') ctx.translate(0, -move * (h + 12));
      else { ctx.translate(0, 560 + move * (h + 12)); ctx.scale(1, -1); }
      if (sprite) ctx.drawImage(sprite.surface, 0, 0, 420, h); else paintCurtain(ctx, h, which === 'top' ? 11 : 29);
      ctx.restore();
    }
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
    // Feel: seeds glide a fraction of a step ahead in slow motion, and the finale camera leans in, backdrop and all.
    feelOpts = options; frameAhead = Number(options.ahead) || 0; feelQuality = Number(options.quality) || 0;
    const camera = options.camera;
    if (camera && camera.zoom > 1.001 && !options.reducedMotion) { ctx.translate(camera.fx, camera.fy); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.fx, -camera.fy); }
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
    drawBriars(ctx, buds, time, rush ? Number(state.dangerY) || 448 : Infinity, options.reducedMotion);
    if (rush) drawLullaby(ctx, state, time, options.reducedMotion, buds, false);
    // Bloom rings are drawn under the flowers, never on top of aiming feedback.
    for (const bud of buds) {
      if (bud.bloomed && !bud.leaving && !options.reducedMotion && typeof bud.bloomAt === 'number') {
        const age = time - bud.bloomAt;
        if (age >= 0 && age < .85) {
          const c = FLOWERS[bud.type] || FLOWERS.coral;
          if (age < .16) {
            // A brief additive flash sells the instant of impact; a cached sprite per color, faded with alpha.
            // A big flower (a boss) gets a softer, tighter one, so its own crack and petals stay readable.
            const big = (bud.r || 13) > 18, f = 1 - age / .16, fr = (bud.r || 13) * (big ? 1.25 + (1 - f) * 1 : 1.4 + (1 - f) * 1.9), sprite = flashSprite(bud.type);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            if (sprite) { ctx.globalAlpha *= f * (big ? .5 : 1); ctx.drawImage(sprite.surface, bud.x - fr, bud.y - fr, fr * 2, fr * 2); }
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
    // The finale's light glows under the flowers, so it gilds the garden around the last bloom and never bleaches it.
    for (const particle of state.particles || []) if (particle.kind === 'light') drawParticle(ctx, particle, time, options.reducedMotion);
    const unfurling = pickUnfurls(buds, time, options), line = rush ? Number(state.dangerY) || 448 : Infinity;
    unfurlOptions.time = time; unfurlOptions.reducedMotion = Boolean(options.reducedMotion); unfurlOptions.quality = Number(options.quality) || 0;
    findTremble(state);
    for (const bud of buds) {
      if (bud.gift) { if (!bud.bloomed) drawGift(ctx, bud, time, options.reducedMotion); continue; }
      const age = typeof bud.bloomAt === 'number' ? time - bud.bloomAt : Infinity;
      // Every bloom takes the same .55 s, whether it unfurls petal by petal or crossfades (over budget).
      const openness = bud.bloomed ? (options.reducedMotion || typeof bud.bloomAt !== 'number' ? 1 : clamp(age / UNFURL, 0, 1)) : 0;
      const hp = Math.max(1, Number(bud.hp) || 1), maxHp = Math.max(hp, Number(bud.maxHp) || 1), radius = bud.r || 16;
      // A spent flower that has finished opening fades as it sinks to the danger line, gone 26 px past it.
      // The tutorial fades the last step's flowers out (bud.fade, 1 to 0 in real time) as the next card comes up.
      const sink = sinkAlpha(bud, time, line, options.reducedMotion);
      if (sink <= 0) continue;
      ctx.save();
      if (sink < 1) ctx.globalAlpha *= sink;
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
      const crack = bossCrack(bud, age, options.reducedMotion);
      if (bud.boss && !bud.bloomed) drawBossLeaves(ctx, bud, time, options.reducedMotion);
      else if (crack > 0) { const a = ctx.globalAlpha; ctx.globalAlpha = a * crack; drawBossLeaves(ctx, bud, time, false); ctx.globalAlpha = a; }
      if (bud.briar && !bud.bloomed) drawThorns(ctx, bud);
      if (bud.puff) { if (!bud.bloomed) drawPuffcap(ctx, bud, time, options.reducedMotion); }
      else if (bud.geode && !bud.bloomed) drawGeode(ctx, bud, time);
      else if (bud.gem && !bud.bloomed) drawGem(ctx, bud, time, options.reducedMotion);
      else if (bud.bloomed && unfurling.has(bud)) drawUnfurl(ctx, bud, age, unfurlOptions);
      else if (!options.reducedMotion && !bud.boss && (bud.bloomed ? age >= 0 && age < FLASH : time - bud.hitAt >= 0 && time - bud.hitAt < FLASH)) drawSilhouette(ctx, bud.x, bud.y, radius, bud.type, 1.08);
      else drawFlower(ctx, bud.x, bud.y, radius, bud.type, openness, time, flowerVariants.get(bud));
      if (bud.briar && bud.bloomed && bud.regrowAt) drawRegrow(ctx, bud, time);
      if (bud.shield && !bud.bloomed) drawCup(ctx, bud);
      if (bud.shell && !bud.bloomed) drawShell(ctx, bud);
      if (bud.boss && !bud.bloomed) { drawBossFace(ctx, bud, time, options.reducedMotion); drawBossRing(ctx, bud); }
      else if (crack > 0) { const a = ctx.globalAlpha; ctx.globalAlpha = a * crack; drawBossFace(ctx, bud, time, false); drawBossCrownFlying(ctx, bud, age); ctx.globalAlpha = a; }
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
    drawFlares(ctx, buds, time, options, line);
    if (rush) drawLullaby(ctx, state, time, options.reducedMotion, buds, true);
    for (const bumper of state.bumpers || []) {
      if (bumper.kind === 'rock' && root.BloomScenery) root.BloomScenery.drawRock(ctx, bumper, options.theme);
      else drawBumper(ctx, bumper, options.selectedBumper === bumper.id, time, colors, options.reducedMotion);
    }
    if (options.showAim !== false && state.aim && (state.status !== 'flying' || options.showAim === true)) drawAim(ctx, state.aim, colors, time, state.nextType, options.reducedMotion);
    drawLauncher(ctx, state, time, colors, options.keepsake, options.kick, options.reducedMotion);

    const balls = Array.isArray(state.balls) ? state.balls : state.ball ? [state.ball] : [];
    if (rush) drawChainHud(ctx, state, time, options);
    for (const particle of state.particles || []) if (particle.kind !== 'light') drawParticle(ctx, particle, time, options.reducedMotion);
    if (!rush) drawGuide(ctx, state, balls, time, options.reducedMotion);
    drawChainLinks(ctx, state, time, options);
    balls.forEach((ball, index) => drawProjectile(ctx, ball, index, time, options.reducedMotion, state.feverTime > 0, options.keepsake));

    for (const floater of state.floaters || []) {
      if (floater.kind === 'pop') drawPop(ctx, floater, options.reducedMotion);
      else drawCallout(ctx, floater, options.reducedMotion);
    }
    drawStage(ctx, state, time, options);
    ctx.restore();
    if (options.flash > 0 && !options.reducedMotion) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const v = ctx.createRadialGradient(210, 280, 60, 210, 280, 380);
      v.addColorStop(0, `rgba(255,248,220,${options.flash * .28})`); v.addColorStop(1, `rgba(255,190,230,${options.flash * .12})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, 420, 560); ctx.restore();
    }
    drawFeelOverlay(ctx, state, time, options);
  }

  // Warm-up. Everything a level can need is painted ahead, in small slices the app runs while the level's intro plays,
  // so the first Super Bloom, trick, title, finale and bloom of each flower never pay for a paint on the frame they
  // appear. prewarm({ flowers: [{ type, r }], board: [{ x, y, r, type }], boss: { type, r, x, y, max }, callouts })
  // returns { step(ms) } which paints jobs until ms have passed and returns true once every job is done.
  const warmClock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  function warmCallout(ctx, floater) {
    if (!ctx || !floater) return;
    if (floater.kind === 'title') {
      const L = titleLayout(ctx, floater);
      if (fontReady(L.tf)) stageSprite(`title|${L.boss ? 'boss' : floater.size === 'small' ? 'small' : 'big'}|${L.text}|${L.label}`, L.w, L.h, c => { c.translate(L.w / 2, L.h / 2); paintTitle(c, L); });
    } else if (floater.kind === 'trick') {
      const S = stampLayout(ctx, floater);
      if (fontReady(S.tf)) stageSprite(`trick|${S.kind}|${S.text}`, S.w, S.h, c => { c.translate(S.w / 2, S.h / 2); paintStamp(c, S, false); });
    } else if (floater.kind === 'life') {
      const text = String(floater.text || ''), tf = '700 16px Fredoka, system-ui, sans-serif';
      ctx.save(); const tw = measure(ctx, tf, text); ctx.restore();
      const bw = Math.min(300, Math.max(124, tw + 54)), L = { text, tf, bw, bh: 30, w: Math.ceil(bw + 16), h: 46 };
      if (fontReady(tf)) stageSprite(`life|${text}`, L.w, L.h, c => { c.translate(L.w / 2, L.h / 2); paintLifeBand(c, L); });
    }
  }
  function prewarm(plan) {
    plan = plan || {};
    const jobs = [], scratch = makeSurface(4, 4), sctx = scratch && scratch.getContext('2d', { willReadFrequently: true }), add = fn => jobs.push(fn);
    let next = 0;
    // The HUD: the gold sky and its band, the sun fan at every count, the turning wheel, the badges.
    add(() => hudSprite('sky:gold', 420, 560, paintGoldSky, 1)); add(() => hudSprite('sky:band', 420, 240, paintGoldBand, 1));
    add(litPetalSprite);
    for (let i = 0; i <= SUN.petals; i++) add(() => hudSprite('fan:' + i, FAN_BOX.w, FAN_BOX.h, c => paintFan(c, i)));
    for (let i = 0; i < WHEEL_STEPS; i++) add(() => hudSprite('wheel:' + i, FAN_BOX.w, FAN_BOX.h, c => paintWheel(c, i)));
    for (let m = 1; m <= 5; m++) add(() => badgeSprite(m));
    // Light: the finale's gold, each color's bloom flash and glow motes, the orbs, the veils and the curtains.
    add(goldSprite); add(headSprite); add(orbSprite);
    for (const type of Object.keys(FLOWERS)) { add(() => flashSprite(type)); add(() => glowMote(FLOWERS[type].base.slice(0, 7))); }
    // Each color's seed (its glow and its halo, plain and in Super Bloom) and the wilted ghost a lost life leaves.
    for (const type of Object.keys(FLOWERS)) {
      const c = FLOWERS[type];
      add(() => { feelGlow(`seed|${c.light}`, 5.5 * 4.2, [[0, c.light + 'aa'], [1, c.light + '00']]); seedHalo(c.base, 5.5, 12); seedHalo(c.base, 5.5, 19); });
      add(() => wiltSprite(type));
    }
    for (const hex of ['#ff5d94', '#ffd148', '#a47dff', '#45adff', '#ff7433']) add(() => glowMote(hex));
    for (const rgb of VEILS) add(() => veilSprite(rgb));
    add(() => curtainSprite('top')); add(() => curtainSprite('bottom'));
    // Lettering: titles, the boss's card, stamps and life bands (each only once its font is in).
    for (const floater of plan.callouts || []) add(() => warmCallout(sctx, floater));
    // The boss's vine.
    if (plan.boss && FLOWERS[plan.boss.type]) {
      const type = plan.boss.type, max = Math.max(1, Math.round(plan.boss.max || 1));
      add(() => vinePiece(`vine|base|${type}`, c => paintVineBase(c, type)));
      add(() => vinePiece('vine|lag', c => paintVineStem(c, '#ffe58a', '#fffbe6'))); add(() => vinePiece('vine|live', c => paintVineStem(c, '#3c9a50', '#9de58f')));
    }
    // Flowers: every sprite a bloom needs for each kind and size, then every frame of its unfurl sheets, and the
    // open flower in each of its seven variations (a wave that has not come down yet blooms into any of them; the
    // boss always wears the first).
    // The kinds on the board right now go first, each with its unfurl sheets right behind it, so the first blooms
    // of the level are ready soonest.
    const kinds = (plan.flowers || []).filter(f => FLOWERS[f.type] && Number(f.r) > 0);
    const onBoard = new Set((plan.board || []).map(bud => bud && `${bud.type}:${Number(bud.r) || 11}`));
    kinds.sort((a, b) => Number(onBoard.has(`${b.type}:${b.r}`)) - Number(onBoard.has(`${a.type}:${a.r}`)));
    if (plan.boss && FLOWERS[plan.boss.type]) kinds.push({ type: plan.boss.type, r: Number(plan.boss.r) || 24, boss: true });
    for (const { type, r, boss } of kinds) {
      add(() => {
        const set = spritesFor({ id: `warm:${type}:${r}` }, type, r);
        if (!set.ready) return;
        const frames = [];
        for (const [sheet, sprite] of [[set.sheet, set.outer], [set.innerSheet, set.innerPetal]]) {
          if (!sheet || !sprite) continue;
          for (let k = 1; k < sheet.frames; k++) frames.push(() => { sheetFrame(sheet, sprite, sheet.from + k * sheet.step); sheet.used = sheetClock; });
        }
        jobs.splice(next, 0, ...frames);
      });
      add(() => drawFlower(sctx, 0, 0, r, type, 0, 0, 0));
      for (let v = 0; v < (boss ? 1 : 7); v++) add(() => drawFlower(sctx, 0, 0, r, type, 1, 0, v));
    }
    // The flowers on the board now, resting open, as each one will look once it blooms.
    for (const bud of (plan.board || []).slice(0, 40)) {
      if (!bud || !FLOWERS[bud.type]) continue;
      add(() => drawFlower(sctx, Number(bud.x) || 0, Number(bud.y) || 0, Number(bud.r) || 11, bud.type, 1, 0, ((Math.floor(Number(bud.x) || 0) * 31 + Math.floor(Number(bud.y) || 0) * 17) % 7 + 7) % 7));
    }
    const dirty = new Set();
    // Each canvas a job painted into is drawn once into a single pixel of the target (the board, drawn over in full
    // on the next frame) at an alpha no one can see: that makes the browser rasterize it, and upload it where the
    // board lives on the GPU, now. Without a target the scratch canvas takes the draws. An unfurl sheet still being
    // baked frame by frame goes through the scratch canvas instead, read back at once so nothing keeps hold of its
    // pixels: each frame is rasterized as it is baked, and the next one bakes in place rather than into a copy.
    function dab1(ctx, surface) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .004; ctx.shadowBlur = 0;
      try { ctx.drawImage(surface, 0, 0, 1, 1); } catch (error) { /* drawn when first needed */ }
      ctx.restore();
    }
    function touch(target) {
      if (!dirty.size) return;
      const ctx = target && typeof target.drawImage === 'function' ? target : sctx;
      for (const surface of dirty) {
        const sheet = sheetOf.get(surface);
        if (sheet && !sheetDone(sheet)) { if (sctx) { dab1(sctx, surface); try { sctx.getImageData(0, 0, 1, 1); } catch (error) { /* flushed when first drawn */ } } }
        else if (ctx) dab1(ctx, surface);
      }
      dirty.clear();
    }
    return {
      step(ms, target) {
        const end = warmClock() + (Number(ms) > 0 ? Number(ms) : 3);
        while (next < jobs.length) {
          warmDirty = dirty;
          try { jobs[next++](); } catch (error) { /* a sprite that cannot be painted ahead is painted when first drawn */ }
          warmDirty = null;
          touch(target);
          if (warmClock() >= end) break;
        }
        return next >= jobs.length;
      },
      get left() { return jobs.length - next; },
      get total() { return jobs.length; }
    };
  }

  root.BloomArt = { draw, drawFlower, drawGarden, drawMoon, koiFish, drawProjectile, drawParticle, drawSeed, drawPowerIcon, drawUnfurl, drawChainLinks,
    prewarm, setHarvestTarget, paints: () => painted };
})(typeof window !== 'undefined' ? window : globalThis);
