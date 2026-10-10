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
    lilac: { dark: '#7351d2', base: '#a079fa', light: '#cbb0ff', tip: '#ede2ff', heart: '#7363ca', seed: '#eaffaf' }
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
    const ctx = surface.getContext('2d');
    if (scenery(theme)) { ctx.save(); ctx.scale(w / 420, h / 560); root.BloomScenery.paint(ctx, theme); ctx.restore(); }
    else paintGarden(ctx, w, h, theme, rush);
    return surface;
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
    else if (scenery(theme)) { ctx.save(); ctx.scale(w / 420, h / 560); root.BloomScenery.paint(ctx, theme); ctx.restore(); }
    else paintGarden(ctx, w, h, theme, rush);
  }

  function petal(ctx, radius, breadth, bend, color, light, dark, index, shape) {
    ctx.save(); ctx.rotate(bend);
    ctx.beginPath(); ctx.moveTo(-radius * .085, radius * .12);
    if (shape === 'gold') {
      // Sunstar rays have a keen tip and a folded, tapering midrib.
      ctx.bezierCurveTo(-breadth * .88, -radius * .25, -breadth * .68, -radius * .68, 0, -radius);
      ctx.bezierCurveTo(breadth * .32, -radius * .67, breadth * .9, -radius * .33, radius * .08, radius * .12);
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

  function paintFlower(ctx, x, y, r, type, openness, time, phase) {
    if (!ctx) return;
    type = FLOWERS[type] ? type : 'coral';
    const c = FLOWERS[type], o = clamp(Number(openness) || 0, 0, 1);
    r = Math.max(2, Number(r) || 16);
    ctx.save(); ctx.translate(x, y);
    // Small stems and leaves belong to the target itself, not a background plant.
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.quadraticCurveTo(r * .05, r * .75, -r * .13, r * 1.04);
    ctx.strokeStyle = '#26a578'; ctx.lineWidth = Math.max(1, r * .085); ctx.stroke();
    leaf(ctx, -r * .07, r * .80, r * .72, r * .38, -.86, '#4dca8d', '#219d80');
    leaf(ctx, -r * .04, r * .65, r * .60, r * .29, 1.02, '#8ada78', '#46b484');

    if (o < .94) {
      const a = 1 - ease(Math.max(0, o - .25) / .69);
      ctx.save(); ctx.globalAlpha *= a;
      // A fine outer ring makes the unbloomed target's hit area readable.
      circle(ctx, 0, 0, r + 2.2, 'rgba(255,255,255,.64)', 'rgba(255,255,255,.78)', .9);
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

    if (o > .001) {
      ctx.save();
      const bloom = ease(o);
      const pop = 1 + Math.sin(o * Math.PI) * .29;
      ctx.scale((.34 + bloom * .66) * pop, (.34 + bloom * .66) * pop);
      ctx.globalAlpha *= Math.min(1, o * 3.2);
      ctx.rotate(Math.sin(phase) * .25 + (1 - bloom) * .25);
      ctx.shadowColor = c.dark + '55'; ctx.shadowBlur = r * .48; ctx.shadowOffsetY = r * .15;
      const count = type === 'gold' ? 12 : type === 'lilac' ? 6 : 6;
      const pr = r * (type === 'lilac' ? 1.62 : 1.52);
      for (let i = 0; i < count; i++) {
        const breadth = type === 'gold' ? .25 : type === 'lilac' ? .35 : .65;
        petal(ctx, pr * (1 + Math.sin(i * 7.3 + phase) * .045), pr * breadth, i * TAU / count, c.base, c.light, c.dark, i, type);
      }
      ctx.shadowColor = 'transparent';
      if (type === 'gold') {
        ctx.save(); ctx.globalAlpha *= .92;
        for (let i = 0; i < 12; i++) petal(ctx, r * 1.03, r * .25, (i + .5) * TAU / 12, c.light, c.tip, c.base, i, 'gold');
        ctx.restore();
      } else if (type === 'coral') {
        ctx.save(); ctx.globalAlpha *= .85;
        for (let i = 0; i < 5; i++) petal(ctx, r * .95, r * .46, (i + .34) * TAU / 5, c.base, c.light, c.dark, i, 'coral');
        ctx.restore();
      } else {
        ctx.save();
        for (let i = 0; i < 3; i++) petal(ctx, r * 1.1, r * .28, (i + .25) * TAU / 3, c.light, c.tip, c.base, i, 'lilac');
        ctx.restore();
      }
      const heartSize = type === 'gold' ? .49 : type === 'coral' ? .32 : .24;
      circle(ctx, 0, 0, r * heartSize, c.heart, 'rgba(255,255,255,.65)', .6);
      circle(ctx, -r * .035, -r * .055, r * (heartSize - .07), c.seed);
      const seedCount = type === 'gold' ? 29 : type === 'coral' ? 15 : 7;
      for (let i = 0; i < seedCount; i++) {
        const ang = i * 2.39996, dist = Math.sqrt(i / seedCount) * r * (heartSize - .07);
        circle(ctx, Math.cos(ang) * dist, Math.sin(ang) * dist, Math.max(.48, r * .032), i % 3 ? c.heart : c.tip);
      }
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
    if (selected) {
      ctx.save(); ctx.strokeStyle = 'rgba(12,138,166,.5)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 5]); circle(ctx, 0, 0, length * .62, null, 'rgba(12,138,166,.42)', 1.2); ctx.setLineDash([]);
      const aa = a - .55;
      ctx.rotate(aa); ctx.beginPath(); ctx.moveTo(length * .62 - 3, -5); ctx.lineTo(length * .62 + 1, 0); ctx.lineTo(length * .62 + 5, -5);
      ctx.strokeStyle = colors.ink; ctx.stroke(); ctx.restore();
    }
    ctx.rotate(a);
    const half = length / 2 + 4.5;
    ctx.shadowColor = 'rgba(6,92,79,.26)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
    const jade = ctx.createLinearGradient(-half * .3, -8, half * .25, 8);
    jade.addColorStop(0, '#d0fff0'); jade.addColorStop(.25, '#83e1c1'); jade.addColorStop(.5, '#2cc39a'); jade.addColorStop(1, '#159b80');
    // Two leaf lobes retain the same paddle span while giving it a made object identity.
    ctx.beginPath(); ctx.moveTo(-half, 0);
    ctx.bezierCurveTo(-half * .8, -6.8, -half * .23, -8.8, 0, -5.7);
    ctx.bezierCurveTo(half * .31, -8.1, half * .84, -6.2, half, 0);
    ctx.bezierCurveTo(half * .7, 6.9, half * .25, 7.9, 0, 5.7);
    ctx.bezierCurveTo(-half * .32, 8.2, -half * .87, 6.5, -half, 0); ctx.closePath();
    ctx.fillStyle = jade; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#197f71'; ctx.lineWidth = .9; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-half + 3, -.8);
    ctx.bezierCurveTo(-half * .62, -5.5, -half * .27, -6.8, -9, -4.8);
    ctx.moveTo(9, -4.8); ctx.bezierCurveTo(half * .37, -6.3, half * .74, -5.1, half - 3, -.7);
    ctx.strokeStyle = 'rgba(239,255,241,.86)'; ctx.lineWidth = 1; ctx.stroke();
    // Incised veins angle toward each leaf tip from a fine brass central rib.
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const p = side * (10 + i * (half - 17) / 4);
      const height = (1 - Math.abs(p) / half) * 5.9 + .5;
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

  function drawLauncher(ctx, state, time, colors, style) {
    const x = (state.launcher && Number(state.launcher.x)) || 210;
    const y = (state.launcher && Number(state.launcher.y)) || 498;
    const rush = state.mode === 'rush';
    const left = rush ? (state.lives == null ? 3 : state.lives) : state.shotsLeft == null ? 3 : state.shotsLeft;
    ctx.save();
    ctx.shadowColor = '#12bcc199'; ctx.shadowBlur = 16;
    circle(ctx, x, y + 2, 22, 'rgba(5,155,150,.15)');
    circle(ctx, x, y, 19.5, '#50d7bb', '#ffffff', 1.5);
    circle(ctx, x, y, 14.7, '#d6ffee', '#9be9d8', 1);
    ctx.shadowColor = 'transparent';
    if (state.status === 'aiming' || !state.status || (rush && state.status !== 'lost')) drawSeed(ctx, x, y, 8.4, time, false, style);
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

  function drawRushBoundary(ctx, state, theme) {
    const y = clamp(Number(state.dangerY) || 448, 100, 510);
    const night = theme === 'moon' || Boolean(root.BloomScenery && root.BloomScenery.dark(theme));
    ctx.save();
    const warning = ctx.createLinearGradient(0, y - 15, 0, y + 33);
    warning.addColorStop(0, 'rgba(245,109,143,0)'); warning.addColorStop(.34, 'rgba(245,109,143,.08)'); warning.addColorStop(1, 'rgba(245,109,143,0)');
    ctx.fillStyle = warning; ctx.fillRect(22, y - 15, 376, 48);
    ctx.beginPath(); ctx.moveTo(24, y + .8); ctx.lineTo(396, y + .8);
    ctx.strokeStyle = night ? 'rgba(255,234,238,.55)' : 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(396, y);
    ctx.setLineDash([8, 5]); ctx.strokeStyle = night ? '#ff91b1' : '#e86189'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
    for (const x of [28, 392]) {
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath();
      ctx.fillStyle = night ? '#ffd8e5' : '#e86189'; ctx.fill();
    }
    ctx.font = '600 11px Fredoka, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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

  function drawAim(ctx, points, colors) {
    if (!Array.isArray(points) || points.length < 2) return;
    ctx.save(); ctx.lineCap = 'round';
    let carry = 0, distance = 0, afterGate = Infinity;
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
        circle(ctx, prev.x + dx * d / len, prev.y + dy * d / len, 2, colors.track, '#ffffff', .65);
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

  function drawCallout(ctx, floater, reducedMotion) {
    const life = Math.max(0, floater.life == null ? 1 : floater.life), duration = floater.maxLife || 1;
    const age = Math.max(0, duration - life), text = String(floater.text || '');
    const combo = floater.kind === 'combo' || /CHAIN|in bloom|BLOOM CHAIN/i.test(text);
    const bonus = floater.kind === 'bonus' || /BALLS/i.test(text);
    const wave = floater.kind === 'wave';
    const number = text.match(/[+]?\d+/)?.[0] || '';
    const value = wave ? text : number || text;
    const scale = reducedMotion ? 1 : .55 + .45 * (1 - Math.exp(-age * 12) * Math.cos(age * 22));
    const y = combo ? Math.max(118, floater.y) : floater.y;
    const fade = Math.min(1, life / .24) * (reducedMotion ? 1 : Math.min(1, age / .045));
    ctx.save(); ctx.translate(clamp(floater.x, 78, 342), y - (reducedMotion ? 0 : ease(age / duration) * 6));
    ctx.scale(scale, scale); ctx.globalAlpha = fade; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = wave ? 36 : combo ? 43 : bonus ? 31 : 21;
    ctx.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
    // A restrained metallic relief gives the number the finish of a small trophy.
    const face = ctx.createLinearGradient(0, -size * .5, 0, size * .5);
    face.addColorStop(0, '#fff8ba'); face.addColorStop(.3, '#ffe984'); face.addColorStop(.57, '#ffc956'); face.addColorStop(1, '#e99a4d');
    ctx.lineJoin = 'round'; ctx.lineWidth = 2.1; ctx.strokeStyle = '#fffce5';
    ctx.shadowColor = 'rgba(53,53,89,.45)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
    ctx.strokeText(value, 0, 0); ctx.fillStyle = '#be7e49'; ctx.fillText(value, 0, 1.7);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.fillStyle = face; ctx.fillText(value, 0, 0);
    if (combo || bonus || wave) {
      ctx.font = '600 13px Fredoka, system-ui, sans-serif';
      const label = wave ? String(floater.label || '') : combo ? 'chain!' : 'extra seeds';
      ctx.shadowColor = 'rgba(255,255,255,.95)'; ctx.shadowBlur = 4;
      ctx.fillStyle = '#245866'; ctx.fillText(label, 0, size * .62);
      ctx.shadowBlur = 0;
      const offset = wave ? 124 : combo ? 49 : 43;
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
    if (rush) drawRushBoundary(ctx, state, options.theme);
    else {
      drawLivingFoliage(ctx, time, colors, options.reducedMotion);
      drawVines(ctx, buds, time, colors, options.reducedMotion);
    }
    drawCurrents(ctx, state.currents, time, options.reducedMotion, options.theme);
    if (scenery(options.theme)) drawBurrows(ctx, state.gates, time, options.reducedMotion, options.theme);
    else drawGates(ctx, state.gates, time, options.reducedMotion);
    drawBriars(ctx, buds);
    // Bloom rings are drawn under the flowers, never on top of aiming feedback.
    for (const bud of buds) {
      if (bud.bloomed && !options.reducedMotion && typeof bud.bloomAt === 'number') {
        const age = time - bud.bloomAt;
        if (age >= 0 && age < .85) {
          const c = FLOWERS[bud.type] || FLOWERS.coral;
          if (age < .16) {
            // A brief additive flash sells the instant of impact.
            const f = 1 - age / .16, fr = (bud.r || 13) * (1.4 + (1 - f) * 1.9);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const flash = ctx.createRadialGradient(bud.x, bud.y, 0, bud.x, bud.y, fr);
            flash.addColorStop(0, `rgba(255,255,240,${.9 * f})`); flash.addColorStop(.45, c.light + Math.round(f * 170).toString(16).padStart(2, '0'));
            flash.addColorStop(1, c.base + '00');
            ctx.fillStyle = flash; ctx.fillRect(bud.x - fr, bud.y - fr, fr * 2, fr * 2); ctx.restore();
          }
          ctx.save(); ctx.globalAlpha = (1 - age / .85) * .56;
          const radius = (bud.r || 13) + ease(age / .85) * 37;
          circle(ctx, bud.x, bud.y, radius, null, c.base, 2.3 - age * 2);
          if (age > .1) circle(ctx, bud.x, bud.y, radius * .74, null, '#ffffff', 1.4);
          for (let i = 0; i < 5; i++) {
            const a = i * TAU / 5 + bud.x * .04 + age * .7;
            sparkle(ctx, bud.x + Math.cos(a) * radius, bud.y + Math.sin(a) * radius, (1 - age / .85) * 3.7, i % 2 ? c.light : '#ffffff', a);
          }
          ctx.restore();
        }
      }
    }
    for (const bud of buds) {
      const openness = bud.bloomed ? (options.reducedMotion || typeof bud.bloomAt !== 'number' ? 1 : clamp((time - bud.bloomAt) / .46, 0, 1)) : 0;
      const hp = Math.max(1, Number(bud.hp) || 1), maxHp = Math.max(hp, Number(bud.maxHp) || 1), radius = bud.r || 16;
      ctx.save();
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
      if (!flowerVariants.has(bud)) flowerVariants.set(bud, ((Math.floor(bud.x) * 31 + Math.floor(bud.y) * 17) % 7 + 7) % 7);
      if (!options.reducedMotion && typeof bud.spawnAt === 'number') {
        // A new Rush wave pops in with a little overshoot; only the drawing scales, never the hitbox.
        const k = (time - bud.spawnAt) / .42;
        if (k >= 0 && k < 1) {
          const back = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
          ctx.translate(bud.x, bud.y); ctx.scale(back, back); ctx.translate(-bud.x, -bud.y); ctx.globalAlpha *= Math.min(1, k * 3);
        }
      }
      if (!options.reducedMotion) {
        // Visual-only life: buds sway on their stems, open flowers breathe.
        // Collision geometry is untouched.
        const ph = (flowerVariants.get(bud) || 0) * 1.37;
        const sway = bud.bloomed ? Math.sin(time * 1.1 + ph) * .05 : Math.sin(time * 2.1 + ph) * .07;
        const breathe = bud.bloomed && openness >= 1 ? 1 + Math.sin(time * 1.7 + ph) * .035 : 1;
        ctx.translate(bud.x, bud.y); ctx.rotate(sway); ctx.scale(breathe, breathe); ctx.translate(-bud.x, -bud.y);
      }
      if (bud.boss && !bud.bloomed) drawBossLeaves(ctx, bud, time, options.reducedMotion);
      if (bud.briar && !bud.bloomed) drawThorns(ctx, bud);
      if (bud.puff) { if (!bud.bloomed) drawPuffcap(ctx, bud, time, options.reducedMotion); }
      else if (bud.geode && !bud.bloomed) drawGeode(ctx, bud, time);
      else if (bud.gem && !bud.bloomed) drawGem(ctx, bud, time, options.reducedMotion);
      else drawFlower(ctx, bud.x, bud.y, bud.r || 16, bud.type, openness, time, flowerVariants.get(bud));
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
      ctx.restore();
    }
    for (const bumper of state.bumpers || []) {
      if (bumper.kind === 'rock' && root.BloomScenery) root.BloomScenery.drawRock(ctx, bumper, options.theme);
      else drawBumper(ctx, bumper, options.selectedBumper === bumper.id, time, colors, options.reducedMotion);
    }
    if (options.showAim !== false && state.aim && (state.status !== 'flying' || options.showAim === true)) drawAim(ctx, state.aim, colors);
    drawLauncher(ctx, state, time, colors, options.keepsake);

    const balls = Array.isArray(state.balls) ? state.balls : state.ball ? [state.ball] : [];
    for (const particle of state.particles || []) drawParticle(ctx, particle, time, options.reducedMotion);
    if (!rush) drawGuide(ctx, state, balls, time, options.reducedMotion);
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

  root.BloomArt = { draw, drawFlower, drawGarden, drawMoon, koiFish, drawProjectile, drawParticle, drawSeed };
})(typeof window !== 'undefined' ? window : globalThis);
