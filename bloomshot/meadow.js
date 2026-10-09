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
    { id: 'lanterns', x: 222, y: 198, accent: '#ffe08a', icon: [222, 186, 34], posts: [[128, 296], [222, 198], [263, 126], [212, 62]] },
    { id: 'tree', x: 172, y: 221, accent: '#ec6a5c', icon: [178, 194, 76] }
  ].map(d => Object.freeze(d)));
  const decorById = Object.fromEntries(DECOR.map(d => [d.id, d]));
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
  function bedPath(ctx, p, expand) {
    const rx = p.rx + (expand || 0), ry = p.ry + (expand || 0) * .65;
    ctx.beginPath(); ctx.moveTo(-rx * .95, -ry * .06);
    ctx.bezierCurveTo(-rx * 1.11, -ry * .70, -rx * .52, -ry * 1.13, -rx * .05, -ry * .97);
    ctx.bezierCurveTo(rx * .36, -ry * 1.15, rx * .93, -ry * .68, rx, -ry * .18);
    ctx.bezierCurveTo(rx * 1.09, ry * .40, rx * .53, ry * 1.09, rx * .09, ry * .92);
    ctx.bezierCurveTo(-rx * .39, ry * 1.08, -rx * .86, ry * .70, -rx * .95, -ry * .06);
    ctx.closePath();
  }
  function surface(width, height) {
    let canvas;
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(width, height);
    else if (typeof document !== 'undefined') { canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; }
    return canvas && canvas.getContext('2d') ? canvas : null;
  }
  function stone(ctx, x, y, r, angle) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ellipse(ctx, 0, 2.1, r * 1.08, r * .62, 0, 'rgba(35,105,82,.14)');
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#f5f1d6'); g.addColorStop(.55, '#d2d5b4'); g.addColorStop(1, '#98b69e');
    ellipse(ctx, 0, 0, r, r * .58, 0, g, '#9ebfa4', .55);
    ctx.beginPath(); ctx.ellipse(0, -.7, r * .73, r * .40, 0, Math.PI * 1.07, Math.PI * 1.85);
    ctx.strokeStyle = 'rgba(255,255,228,.8)'; ctx.lineWidth = .7; ctx.stroke(); ctx.restore();
  }
  function path(ctx) {
    ctx.beginPath(); ctx.moveTo(202, 350);
    ctx.bezierCurveTo(205, 305, 143, 302, 153, 264);
    ctx.bezierCurveTo(156, 230, 237, 237, 242, 186);
    ctx.bezierCurveTo(248, 144, 257, 118, 235, 99);
    ctx.bezierCurveTo(209, 80, 171, 65, 187, 33);
    ctx.bezierCurveTo(195, 15, 215, 3, 221, -18);
  }
  function pathBranch(ctx, x, y, cx, cy, ex, ey) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.strokeStyle = '#a7cca5'; ctx.lineWidth = 11; ctx.stroke();
    ctx.strokeStyle = '#f5edc9'; ctx.lineWidth = 8.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,253,225,.7)'; ctx.lineWidth = 2; ctx.stroke();
  }
  function fern(ctx, x, y, size, lean, shade) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(lean);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(size * .2, -size * .5, size * .11, -size);
    ctx.lineWidth = 1; ctx.strokeStyle = '#258f78'; ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const yy = -size * (i * .145 + .13), xx = size * .12 * Math.sin(i * .45);
      const len = size * (.40 - i * .052);
      leaf(ctx, xx, yy, len, len * .27, -.90, shade || '#55b997', '#94dfac');
      leaf(ctx, xx, yy, len * .9, len * .24, .98, i % 2 ? '#84cf99' : '#3daf8c', '#d0ebac');
    }
    ctx.restore();
  }
  function paintPond(ctx) {
    ctx.save(); ctx.translate(355, 285); ctx.rotate(-.22);
    const shape = () => {
      ctx.beginPath(); ctx.moveTo(-38, -7); ctx.bezierCurveTo(-27, -34, 12, -28, 30, -17);
      ctx.bezierCurveTo(54, 0, 28, 23, 6, 22); ctx.bezierCurveTo(-20, 27, -45, 13, -38, -7); ctx.closePath();
    };
    shape(); ctx.strokeStyle = '#5ebf9b'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = '#dbdfb4'; ctx.lineWidth = 4.5; ctx.stroke();
    const water = ctx.createLinearGradient(-12, -24, 22, 26);
    water.addColorStop(0, '#319ba9'); water.addColorStop(.4, '#61cece'); water.addColorStop(1, '#b6eee0');
    shape(); ctx.fillStyle = water; ctx.fill();
    ctx.save(); shape(); ctx.clip();
    for (let i = 0; i < 4; i++) ellipse(ctx, 3 + i * 2, 4, 13 + i * 9, 3.1 + i * 2.6, 0, null, 'rgba(235,255,226,.42)', .8);
    ctx.beginPath(); ctx.moveTo(-23, -13); ctx.bezierCurveTo(-14, -19, 4, -22, 16, -16);
    ctx.strokeStyle = 'rgba(227,255,232,.63)'; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.restore();
    ellipse(ctx, -16, 6, 9, 4.8, -.4, '#4ab684', '#168c7c', .6);
    ctx.beginPath(); ctx.moveTo(-16, 6); ctx.lineTo(-8, 2.5); ctx.lineTo(-8, 6); ctx.fillStyle = '#83d6cb'; ctx.fill();
    ellipse(ctx, 19, -9, 6, 3.6, -.25, '#7bcc92', '#3aa387', .5);
    ctx.restore();
    [[322,274,5.1,-.6],[325,306,6.8,.2],[382,296,5,.5],[384,267,6.3,-.2]].forEach(p => stone(ctx, ...p));
    fern(ctx, 395, 294, 33, .3); fern(ctx, 322, 309, 19, -.55, '#6bbf91');
  }
  function paintBackground(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 420, 330);
    sky.addColorStop(0, '#bef0d6'); sky.addColorStop(.35, '#ccecbf'); sky.addColorStop(.70, '#9dddaf'); sky.addColorStop(1, '#80cbae');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(141, 51, 8, 168, 108, 283);
    sun.addColorStop(0, 'rgba(255,253,211,.75)'); sun.addColorStop(.7, 'rgba(255,249,209,.08)'); sun.addColorStop(1, 'rgba(247,255,205,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    const random = rng(71043);
    for (let i = 0; i < 175; i++) {
      const x = random() * W, y = random() * H, r = 1.2 + random() * 4;
      ellipse(ctx, x, y, r * 2, r, -.4, i % 3 ? 'rgba(59,154,108,.045)' : 'rgba(252,255,211,.13)');
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(ctx); ctx.strokeStyle = 'rgba(77,143,101,.2)'; ctx.lineWidth = 28; ctx.stroke();
    ctx.strokeStyle = '#b5cda3'; ctx.lineWidth = 25; ctx.stroke();
    ctx.strokeStyle = '#f3e8bf'; ctx.lineWidth = 21; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,218,.6)'; ctx.lineWidth = 14; ctx.stroke();
    pathBranch(ctx, 184, 46, 150, 46, 128, 75);
    pathBranch(ctx, 246, 114, 267, 105, 280, 88);
    pathBranch(ctx, 246, 158, 223, 150, 215, 144);
    pathBranch(ctx, 156, 252, 144, 220, 118, 220);
    pathBranch(ctx, 236, 213, 263, 211, 280, 197);
    pathBranch(ctx, 159, 277, 182, 274, 189, 273);
    // Pebble seams and a little bridge make the garden feel tended by hand.
    [[188,36,3.5,.2],[243,175,3,-.1],[164,250,3.1,.6],[178,307,4,.3],[231,94,2.4,.1]].forEach(p => stone(ctx, ...p));
    paintPond(ctx);
    PLOTS.forEach(p => {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.save(); ctx.translate(0, 3); bedPath(ctx, p, 5); ctx.fillStyle = 'rgba(28,106,77,.17)'; ctx.fill(); ctx.restore();
      bedPath(ctx, p, 4.2); ctx.fillStyle = '#62b991'; ctx.fill();
      bedPath(ctx, p, 1.7); ctx.fillStyle = '#abd69c'; ctx.fill();
      const soil = ctx.createLinearGradient(0, -p.ry, 4, p.ry);
      soil.addColorStop(0, '#abac79'); soil.addColorStop(.33, '#bcbc85'); soil.addColorStop(1, '#dbd09a');
      bedPath(ctx, p); ctx.fillStyle = soil; ctx.fill();
      ctx.save(); bedPath(ctx, p); ctx.clip();
      const soilNoise = rng(p.seed);
      for (let i = 0; i < 38; i++) {
        const xx = (soilNoise() - .5) * p.rx * 2, yy = (soilNoise() - .5) * p.ry * 2;
        ellipse(ctx, xx, yy, .45 + soilNoise() * 1.5, .4, -.4, i % 2 ? 'rgba(93,99,59,.15)' : 'rgba(255,242,195,.40)');
      }
      for (let row = -1; row <= 1; row++) {
        ctx.beginPath(); ctx.moveTo(-p.rx * .7, row * 12 + 3);
        ctx.bezierCurveTo(-p.rx * .3, row * 12 - 4, p.rx * .3, row * 12 + 5, p.rx * .72, row * 12 - 2);
        ctx.strokeStyle = 'rgba(103,122,71,.19)'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.strokeStyle = 'rgba(241,228,168,.43)'; ctx.lineWidth = .55; ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(-p.rx * .37, p.ry * .79, p.rx * .18, 2.2, .08, Math.PI * .12, Math.PI * .85);
      ctx.strokeStyle = '#7ab883'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    });
    // Border plants remain decorative, leaving the six planting islands readable.
    [[8,92,49,.16],[9,169,35,-.28],[3,281,47,.45],[28,332,43,-.5],[104,331,25,.52],[402,115,47,-.24],[422,225,35,-.3],[364,20,30,.74],[34,14,26,-.54],[273,338,26,.55]].forEach(p => fern(ctx, ...p));
    [[26,119,5.7,-.2],[20,150,4,.1],[391,141,5.3,.6],[133,31,4,-.4],[54,289,5.4,.2]].forEach(p => stone(ctx, ...p));
    for (const [x,y] of [[20,46],[30,263],[387,42],[396,240],[120,302]]) {
      for (let i = 0; i < 4; i++) leaf(ctx, x + i * 2, y, 6 + i * 1.3, 2.2, (i - 1.5) * .43, '#65b782', '#c5e39c');
      ellipse(ctx, x + 3, y - 5, 1.4, 1.3, 0, '#fff1a2');
    }
    const edge = ctx.createLinearGradient(0, H - 29, 0, H);
    edge.addColorStop(0, 'rgba(19,110,92,0)'); edge.addColorStop(1, 'rgba(19,110,92,.10)');
    ctx.fillStyle = edge; ctx.fillRect(0, H - 29, W, 29);
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
  function bird(ctx, x, y, time, motion) {
    const hop = motion ? Math.max(0, Math.sin(time * 1.7)) ** 12 * 2.4 : 0;
    ctx.save(); ctx.translate(x, y - hop);
    ctx.beginPath(); ctx.moveTo(-2.6, -.4); ctx.lineTo(-6.2, -2); ctx.lineTo(-5.6, .7); ctx.closePath(); ctx.fillStyle = '#4f93c8'; ctx.fill();
    ellipse(ctx, 0, 0, 3.8, 2.9, -.15, '#6aaee0', '#3f7fb0', .45);
    ellipse(ctx, .9, 1, 2.3, 1.6, -.1, '#f6c48f');
    ellipse(ctx, 2.9, -1.9, 2.1, 2.1, 0, '#6aaee0', '#3f7fb0', .45);
    ellipse(ctx, 3.5, -2.2, .48, .48, 0, '#23333a');
    ctx.beginPath(); ctx.moveTo(4.8, -2); ctx.lineTo(6.3, -1.5); ctx.lineTo(4.7, -1.1); ctx.closePath(); ctx.fillStyle = '#f2b14e'; ctx.fill();
    ctx.restore();
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
    // The frog takes the big pad and blinks now and then.
    ctx.save(); ctx.translate(-17, 3.6); ctx.rotate(.22);
    ellipse(ctx, 0, 1.2, 4.6, 2.2, 0, 'rgba(10,80,70,.2)');
    ellipse(ctx, 0, 0, 4.4, 3.3, 0, '#5fbf5b', '#2f8a3a', .5);
    ellipse(ctx, 0, .9, 2.8, 1.7, 0, '#b9e68a');
    const blink = motion && time % 4.3 < .14;
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 2.2, -2.7, 1.55, 1.55, 0, '#6fcf6a', '#2f8a3a', .45);
      if (blink) { ctx.beginPath(); ctx.moveTo(side * 2.2 - 1, -2.7); ctx.lineTo(side * 2.2 + 1, -2.7); ctx.strokeStyle = '#2f5a2a'; ctx.lineWidth = .5; ctx.stroke(); }
      else ellipse(ctx, side * 2.2, -2.8, .62, .7, 0, '#1f2b22');
    }
    ctx.beginPath(); ctx.moveTo(-1.6, -.4); ctx.quadraticCurveTo(0, .6, 1.6, -.4); ctx.strokeStyle = '#2f6a32'; ctx.lineWidth = .45; ctx.stroke();
    ctx.restore(); ctx.restore();
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
    const t = motion ? time : 1.3;
    for (let i = 0; i < 3; i++) {
      const a = t * (1.2 + i * .35) + i * 2.1, r = 13 + i * 3;
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
    // A rope swing hangs from under the leaves and drifts in the breeze.
    const sway = motion ? Math.sin(time * 1.5) * .13 : .05;
    ctx.save(); ctx.translate(22, -19); ctx.rotate(sway);
    ctx.strokeStyle = '#a07c52'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(-3.2, 0); ctx.lineTo(-3.2, 15); ctx.moveTo(3.2, 0); ctx.lineTo(3.2, 15); ctx.stroke();
    slab(ctx, -5, 14.4, 10, 2.3, .8, '#c48a50', ink, .5);
    ctx.restore();
  }
  function paintDecor(ctx, d, time, motion) {
    if (d.id === 'lanterns') {
      d.posts.forEach(([x, y]) => { ctx.save(); ctx.translate(x, y); paintLantern(ctx, time, motion, x); ctx.restore(); });
      return;
    }
    ctx.save(); ctx.translate(d.x, d.y);
    if (d.id === 'bench') paintBench(ctx);
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
    paintDecor(ctx, d, 1.3, false);
    ctx.restore(); ctx.restore();
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
  root.BloomMeadow = Object.freeze({ draw, hitTest, drawDecorIcon: (ctx, id, size) => { ensureBackground(); drawDecorIcon(ctx, id, size); }, plots: PLOTS, decor: DECOR, width: W, height: H });
})(typeof window !== 'undefined' ? window : globalThis);
