'use strict';
// The bloom moment in art.js: the petal-by-petal unfurl, the white hit frame, the tremble near the line, the finale
// flares, tumble-in entry offsets and the chain links. Loads art.js in a VM with a recording 2D context that tracks
// transforms and alpha, plus an OffscreenCanvas stub, so it can see what is drawn where. Run: node qa/test-bloomfx.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}

// Counters shared by every context, the visible one and the sprites painted offscreen.
const totals = { gradients: 0, surfaces: 0 };
// A 2D context that records every call, keeps a real save/restore stack and the current transform, and rejects
// non-finite numbers. drawImage calls are logged with where their center lands on screen and at what alpha.
function recorder(surface) {
  const calls = [], images = [], fills = [], arcs = [];
  let m = [1, 0, 0, 1, 0, 0], points = [];
  const stack = [];
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, shadowColor: 'transparent', shadowOffsetX: 0, shadowOffsetY: 0, lineCap: 'butt', lineJoin: 'miter', lineDashOffset: 0, font: '', textAlign: 'start', textBaseline: 'alphabetic', filter: 'none' };
  const gradient = { addColorStop: (offset, color) => { assert(Number.isFinite(offset)); assert.equal(typeof color, 'string'); } };
  const apply = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const mul = (a, b, c, d, e, f) => { m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; };
  const methods = {
    save() { stack.push({ m: m.slice(), state: { ...state } }); },
    restore() { const top = stack.pop(); if (top) { m = top.m; Object.assign(state, top.state); } },
    translate(x, y) { mul(1, 0, 0, 1, x, y); },
    scale(x, y) { mul(x, 0, 0, y, 0, 0); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); mul(c, s, -s, c, 0, 0); },
    transform(a, b, c, d, e, f) { mul(a, b, c, d, e, f); },
    setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    resetTransform() { m = [1, 0, 0, 1, 0, 0]; },
    getTransform() { return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }; },
    createLinearGradient() { totals.gradients++; return gradient; },
    createRadialGradient() { totals.gradients++; return gradient; },
    createPattern() { return gradient; },
    measureText() { return { width: 10 }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; },
    putImageData() {},
    beginPath() { points = []; },
    moveTo(x, y) { points.push([...apply(x, y), 'moveTo']); },
    arc(x, y, radius) { points.push([...apply(x, y), 'arc']); arcs.push({ x, y, radius }); },
    quadraticCurveTo(cx, cy, x, y) { points.push([...apply(x, y), 'quad']); },
    fill() { const [x, y] = apply(0, 0); fills.push({ style: state.fillStyle, alpha: state.globalAlpha, x, y, points: points.slice() }); if (surface) surface.styles.add(state.fillStyle); },
    drawImage(img, ...args) {
      let dx, dy, dw, dh;
      if (args.length >= 8) [, , , , dx, dy, dw, dh] = args;
      else if (args.length >= 4) [dx, dy, dw, dh] = args;
      else { [dx, dy] = args; dw = img.width; dh = img.height; }
      const [cx, cy] = apply(dx + dw / 2, dy + dh / 2);
      images.push({ img, cx, cy, w: dw * Math.hypot(m[0], m[1]), angle: Math.atan2(m[1], m[0]), cut: args.length >= 8, alpha: state.globalAlpha, op: state.globalCompositeOperation });
    }
  };
  const ctx = new Proxy(state, {
    get(target, name) {
      if (name === 'canvas') return surface || { width: 420, height: 560 };
      if (name in target) return target[name];
      return (...args) => {
        for (const a of args) if (typeof a === 'number') assert(Number.isFinite(a), `${String(name)} got ${a}`);
        calls.push(name);
        return methods[name] ? methods[name](...args) : undefined;
      };
    },
    set(target, name, value) {
      if (['globalAlpha', 'lineWidth', 'shadowBlur', 'lineDashOffset'].includes(name)) assert(Number.isFinite(value), `${name} = ${value}`);
      if (name === 'globalCompositeOperation' && surface && value === 'source-in') surface.silhouette = true;
      target[name] = value; return true;
    }
  });
  return { ctx, calls, images, fills, arcs };
}
class OffscreenCanvas {
  constructor(width, height) { this.width = width; this.height = height; this.id = ++totals.surfaces; this.context = null; this.styles = new Set(); }
  getContext() { if (!this.context) { this.rec = recorder(this); this.context = this.rec.ctx; } return this.context; }
}
function loadArt(withCanvas) {
  const context = vm.createContext({ console, Math, Map, Set, WeakMap, Array, Object, Number, String, JSON, Uint8ClampedArray, ...(withCanvas ? { OffscreenCanvas } : {}) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../art.js'), 'utf8'), context, { filename: 'art.js' });
  return context.BloomArt;
}
const Art = loadArt(true);
const PlainArt = loadArt(false);
const TYPES = ['coral', 'gold', 'lilac', 'sky', 'poppy'];
const SEPALS = new Set(['#62c46a', '#43c184', '#3dae8c', '#48c39b', '#78b84f']);
// Casing shards are one path per bud filled in its sepal color, one arc of the rim per shard: where each lands.
const shardsIn = fills => fills.filter(f => SEPALS.has(f.style)).flatMap(f => f.points.filter(p => p[2] === 'arc')).map(([x, y]) => ({ x, y }));
let serial = 0;
function bud(extra) { serial++; return { id: 'b' + serial, group: 'g' + serial, x: 120 + (serial % 7) * 20, y: 160 + (serial % 5) * 30, r: 11, type: 'coral', hp: 1, maxHp: 1, hitAt: -100, bloomed: false, bloomAt: -100, fall: 1, ...extra }; }
function rush(buds, extra) { return { mode: 'rush', buds, bumpers: [], balls: [], particles: [], floaters: [], dangerY: 448, descentSpeed: 10, lullaby: 0, status: 'playing', launcher: { x: 210, y: 498 }, lives: 3, pending: [], ...extra }; }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
// The surface an unfurl draws its stem from: the first image of any unfurl past the white frame.
function stemSurface(r) { const probe = recorder(); Art.drawUnfurl(probe.ctx, bud({ r, bloomed: true, bloomAt: 0 }), .1, { time: .1 }); return probe.images[0].img; }
// The resting closed-bud sprite for radius r, as drawFlower draws it.
function closedSurface(r, type = 'coral') { const probe = recorder(); Art.drawFlower(probe.ctx, 100, 100, r, type, 0, 0); return probe.images[0].img; }

test('An unfurl at .1 s composites atlas sprites and creates no gradients once warm', () => {
  for (const type of TYPES) for (const r of [11, 24]) {
    const b = bud({ type, r, bloomed: true, bloomAt: 5, impactAngle: -1.2 });
    Art.drawUnfurl(recorder().ctx, b, .04, { time: 5.04 }); // the first frame paints every sprite this bloom needs
    Art.drawUnfurl(recorder().ctx, b, .52, { time: 5.52 }); // and the hand-off paints the resting sprite
    for (const age of [.1, .2, .3, .45]) {
      const before = { ...totals }, { ctx, images } = recorder();
      Art.drawUnfurl(ctx, b, age, { time: 5 + age });
      assert.equal(totals.gradients, before.gradients, `${type} r${r} at ${age}: no new gradients`);
      assert.equal(totals.surfaces, before.surfaces, `${type} r${r} at ${age}: no new sprites`);
      // Stem, petal ring and closed bud or inner layer before the heart pops (.2 to .32 s); all four after.
      assert(images.length >= (age < .25 ? 3 : 4), `${type} at ${age} draws its petals from the atlas (${images.length} images)`);
      assert(images.every(image => image.img instanceof OffscreenCanvas), 'every image is an atlas sprite');
    }
  }
});
test('Regular buds open from baked sheets, turned so the first petal faces the hit; each frame is painted once', () => {
  const COUNT = { gold: 12, coral: 6, lilac: 6, sky: 5, poppy: 6 };
  for (const type of TYPES) for (const impact of [-Math.PI / 2, 0, 2.2, -2.8]) {
    const { ctx, images } = recorder();
    Art.drawUnfurl(ctx, bud({ type, bloomed: true, bloomAt: 1, impactAngle: impact }), .2, { time: 1.2 });
    const sheets = images.filter(i => i.cut);
    assert.equal(sheets.length, type === 'sky' ? 1 : 2, `${type}: outer and inner layers are one frame each (the sky's ring is a plain sprite)`);
    // The baked frame has its first petal pointing up (local -PI/2); turned into place it must face the impact.
    const off = Math.atan2(Math.sin(sheets[0].angle - Math.PI / 2 - impact), Math.cos(sheets[0].angle - Math.PI / 2 - impact));
    assert(Math.abs(off) <= Math.PI / COUNT[type] + 1e-9, `${type} hit at ${impact.toFixed(2)}: first petal ${off.toFixed(2)} rad off`);
    assert(images.length <= 8, `${type}: ${images.length} images at .2 s`);
  }
  const first = recorder(); Art.drawUnfurl(first.ctx, bud({ type: 'coral', bloomed: true, bloomAt: 1 }), .3, { time: 1.3 });
  const sheet = first.images.find(i => i.cut).img, painted = sheet.rec.calls.length;
  Art.drawUnfurl(recorder().ctx, bud({ type: 'coral', bloomed: true, bloomAt: 5 }), .3, { time: 5.3 });
  assert.equal(sheet.rec.calls.length, painted, 'another coral at the same age reuses the frame');
  // A boss's single bloom goes petal by petal.
  const boss = recorder(); Art.drawUnfurl(boss.ctx, bud({ type: 'coral', r: 24, bloomed: true, bloomAt: 1 }), .2, { time: 1.2 });
  assert(!boss.images.some(i => i.cut) && boss.images.length > 8, `boss: ${boss.images.length} images`);
});
test('From .55 s on the unfurl draws exactly the resting drawFlower path', () => {
  for (const type of TYPES) for (const age of [.55, .7, 3]) {
    const b = bud({ type, bloomed: true, bloomAt: 2, impactAngle: .4 });
    const a = recorder(), c = recorder();
    Art.drawUnfurl(a.ctx, b, age, { time: 2 + age });
    Art.drawFlower(c.ctx, b.x, b.y, b.r, type, 1, 2 + age);
    assert.deepEqual(a.calls, c.calls, `${type} at ${age}`);
    assert.deepEqual(a.images.map(i => [i.img.id, i.cx, i.cy, i.alpha]), c.images.map(i => [i.img.id, i.cx, i.cy, i.alpha]));
  }
});
test('The last frames blend into the resting sprite, so the hand-off has no jump', () => {
  const b = bud({ type: 'gold', bloomed: true, bloomAt: 1 });
  const rest = recorder(); Art.drawFlower(rest.ctx, b.x, b.y, b.r, 'gold', 1, 2); const full = rest.images[0].img;
  const late = recorder(); Art.drawUnfurl(late.ctx, b, .545, { time: 1.545 });
  const last = late.images[late.images.length - 1];
  assert.equal(last.img, full, 'the resting sprite is laid over the end of the unfurl');
  assert(last.alpha > .85 && last.alpha < 1, `nearly opaque at .545 s (${last.alpha.toFixed(2)})`);
  assert(near(last.cx, b.x) && near(last.cy, b.y), 'in the same place');
});
test('Forty blooms at once unfurl at most sixteen; the rest crossfade; quality 2 allows six', () => {
  const stem = stemSurface(11);
  const buds = Array.from({ length: 40 }, () => bud({ bloomed: true, bloomAt: 9.9 }));
  for (const [quality, cap] of [[0, 16], [1, 16], [2, 6]]) {
    const { ctx, images } = recorder();
    Art.draw(ctx, rush(buds), 10, { quality, showAim: false });
    assert.equal(images.filter(i => i.img === stem).length, cap, `quality ${quality}`);
  }
  // Closest to done first: the sixteen oldest blooms get the unfurl.
  const old = Array.from({ length: 16 }, () => bud({ bloomed: true, bloomAt: 9.6 }));
  const fresh = Array.from({ length: 10 }, () => bud({ r: 12, bloomed: true, bloomAt: 9.95 }));
  const { ctx, images } = recorder();
  Art.draw(ctx, rush([...fresh, ...old]), 10, { showAim: false });
  assert.equal(images.filter(i => i.img === stem).length, 16);
  assert.equal(images.filter(i => i.img === stemSurface(12)).length, 0, 'the youngest wait their turn');
});
test('Every bloom now takes .55 s, the crossfade path included', () => {
  const buds = Array.from({ length: 20 }, () => bud({ bloomed: true, bloomAt: 9.5 }));
  const { ctx, images } = recorder();
  Art.draw(ctx, rush(buds), 10, { showAim: false });
  const closed = closedSurface(11);
  // At .5 s of .55 the crossfading buds still show a trace of the closed bud; at the old .46 s ramp they would not.
  assert(images.some(i => i.img === closed && i.alpha > 0 && i.alpha < .2), 'a crossfading bud is still mid-bloom at .5 s');
});
test('The one-frame hit: a white silhouette within .035 s of a hit or a bloom, then the real bud', () => {
  const b = bud({ type: 'lilac', bloomed: true, bloomAt: 3 });
  const early = recorder(); Art.drawUnfurl(early.ctx, b, .01, { time: 3.01 });
  assert(early.images.some(i => i.img.silhouette), 'bloom: white frame at .01 s');
  const later = recorder(); Art.drawUnfurl(later.ctx, b, .05, { time: 3.05 });
  assert(!later.images.some(i => i.img.silhouette), 'bloom: the bud itself at .05 s');
  for (const [age, white] of [[.01, true], [.03, true], [.04, false], [.2, false]]) {
    const hit = bud({ hp: 2, maxHp: 3, hitAt: 7 - age });
    const { ctx, images } = recorder();
    Art.draw(ctx, rush([hit]), 7, { showAim: false });
    assert.equal(images.some(i => i.img.silhouette), white, `crack at ${age}`);
  }
  const still = recorder();
  Art.draw(still.ctx, rush([bud({ hp: 2, maxHp: 3, hitAt: 6.99 })]), 7, { reducedMotion: true, showAim: false });
  assert(!still.images.some(i => i.img.silhouette), 'no flash with animations off');
});
test('Cracks and casing shards fly from the struck side; quality and animations off thin them out', () => {
  const struck = bud({ type: 'poppy', bloomed: true, bloomAt: 1, impactAngle: 0 });
  const shards = (age, options, b = struck) => {
    const { ctx, fills } = recorder();
    Art.drawUnfurl(ctx, b, age, { time: 1 + age, ...options });
    return shardsIn(fills);
  };
  const shardFills = (age, options) => shards(age, options).length;
  const full = shardFills(.1, {});
  assert(full >= 4 && full <= 6, `4 to 6 shards (${full})`);
  assert.equal(shardFills(.1, { quality: 1 }), Math.ceil(full / 2), 'tier 1 halves them');
  assert.equal(shardFills(.1, { quality: 2 }), 0, 'tier 2 drops them');
  assert.equal(shardFills(.1, { reducedMotion: true }), 0, 'none with animations off');
  assert.equal(shardFills(.32, {}), 0, 'gone by .3 s');
  // Shards leave from the side that was hit: struck from the left (moving right) they fly out to the left, struck
  // from below they spray downward.
  // They fan out over about 70 degrees each side, so every one is on the struck side and together they are well clear.
  for (const [impact, along] of [[0, s => struck.x - s.x], [-Math.PI / 2, s => s.y - struck.y]]) {
    const flying = shards(.15, {}, { ...struck, impactAngle: impact }), mean = flying.reduce((sum, s) => sum + along(s), 0) / flying.length;
    assert(flying.length >= 4 && flying.every(s => along(s) > 2) && mean > struck.r * 1.5, `impact ${impact.toFixed(2)}: ${flying.map(f => `${f.x.toFixed(0)},${f.y.toFixed(0)}`).join(' ')}`);
  }
  // Without a canvas the shards are the same.
  const { ctx, fills } = recorder();
  PlainArt.drawUnfurl(ctx, struck, .1, { time: 1.1 });
  assert.equal(shardsIn(fills).length, full, 'the same shards without a canvas');
  // A bud's shards are a single fill whatever their number.
  const once = recorder(); Art.drawUnfurl(once.ctx, struck, .1, { time: 1.1 });
  assert.equal(once.fills.filter(f => SEPALS.has(f.style)).length, 1, 'one fill for all of them');
});
test('Animations off: blooms open at once with no shards, nothing trembles and nothing flares', () => {
  const now = 20, blooming = bud({ bloomed: true, bloomAt: now - .1 }), flaring = bud({ type: 'gold', bloomed: true, bloomAt: 10, flareAt: now - .1 });
  const low = bud({ type: 'sky', y: 448 - 11 - 4 });
  const moving = recorder(), still = recorder();
  Art.draw(moving.ctx, rush([blooming, flaring, low]), now, { showAim: false });
  Art.draw(still.ctx, rush([blooming, flaring, low]), now, { reducedMotion: true, showAim: false });
  assert(shardsIn(moving.fills).length, 'shards fly with animations on');
  assert(!still.fills.some(f => SEPALS.has(f.style)), 'no shards');
  assert(moving.images.some(i => i.op === 'lighter'), 'flares glow with animations on');
  assert(!still.images.some(i => i.op === 'lighter'), 'no flares');
  const closed = closedSurface(11, 'sky');
  const sky = still.images.find(i => i.img === closed);
  assert(near(sky.cx, low.x) && near(sky.cy, low.y), 'the low bud sits still');
  assert(still.fills.some(f => f.style === '#ff3d6e'), 'a red pip marks it instead');
  assert(!moving.fills.some(f => f.style === '#ff3d6e'), 'no pip when it can tremble');
});
test('Only the group about to cross the line trembles, by at most 1.5 px, and never during a Lullaby', () => {
  const low = bud({ type: 'coral', group: 'low', x: 200, y: 448 - 11 - 5 }), mate = bud({ type: 'coral', group: 'low', x: 230, y: 380 });
  const high = bud({ type: 'coral', group: 'high', x: 100, y: 300 });
  const closed = closedSurface(11);
  const offsets = (extra, time) => {
    const { ctx, images } = recorder();
    Art.draw(ctx, rush([low, mate, high], extra), time, { showAim: false });
    return images.filter(i => i.img === closed).map(i => i.cx);
  };
  let moved = 0;
  for (let i = 0; i < 12; i++) {
    const t = 30 + i * .013, [a, b, c] = offsets({}, t);
    assert(Math.abs(a - low.x) <= 1.5 + 1e-9 && Math.abs(b - mate.x) <= 1.5 + 1e-9, 'within 1.5 px');
    assert(near(c, high.x), 'the far group is calm');
    if (Math.abs(a - low.x) > .05) moved++;
  }
  assert(moved >= 6, `the low group shakes (${moved}/12 frames)`);
  // 5 px from the line at 10 px/s is .5 s away; at 2 px/s it is 2.5 s away and calm.
  const [slow] = offsets({ descentSpeed: 2 }, 30.004);
  assert(near(slow, low.x), 'too far off in time');
  const [lull] = offsets({ lullaby: 3 }, 30.004);
  assert(near(lull, low.x), 'calm during a Lullaby');
  const [tutorial] = offsets({ scripted: true }, 30.004);
  assert(near(tutorial, low.x), 'calm in the scripted tutorial, where flowers stop above the line');
});
test('Finale flares: gold light from 2.6r to 3.5r fading out over .35 s, a gold ring per flower, and a glint unless quality is lowered', () => {
  const b = bud({ type: 'coral', r: 12, bloomed: true, bloomAt: 1, flareAt: 5 });
  const glow = t => { const { ctx, images, fills, arcs } = recorder(); Art.draw(ctx, rush([b]), t, { showAim: false }); return { light: images.filter(i => i.op === 'lighter'), fills, rings: arcs.filter(a => near(a.x, b.x, .01) && near(a.y, b.y, .01) && a.radius > 12 * 1.15) }; };
  const start = glow(5.001).light[0], end = glow(5.34).light[0];
  assert(start && end, 'a glow is drawn');
  assert(near(start.w / 2, 12 * 2.6, .3) && start.alpha > .95, `starts at 2.6r, full strength (${(start.w / 2).toFixed(1)})`);
  assert(near(end.w / 2, 12 * 3.5, .5) && end.alpha < .05, `ends near 3.5r, faded (${(end.w / 2).toFixed(1)})`);
  assert.equal(glow(5.36).light.length, 0, 'the light is over after .35 s');
  assert(glow(5.2).rings.length >= 1 && glow(5.45).rings.length >= 1, 'a gold ring opens around the flower and outlasts the light');
  assert.equal(glow(5.51).rings.length, 0, 'and is gone after .5 s');
  assert.equal(glow(4.99).light.length, 0, 'nothing before flareAt');
  // The glint is a white four-point star centered on the upper right petal.
  const spot = [b.x + 12 * .42, b.y - 12 * .46];
  const centered = f => {
    const xs = f.points.map(p => p[0]), ys = f.points.map(p => p[1]);
    return xs.length >= 5 && Math.hypot((Math.min(...xs) + Math.max(...xs)) / 2 - spot[0], (Math.min(...ys) + Math.max(...ys)) / 2 - spot[1]) < 1.5;
  };
  const glint = q => { const { ctx, fills } = recorder(); Art.draw(ctx, rush([b]), 5.12, { showAim: false, quality: q }); return fills.filter(f => f.style === '#ffffff' && centered(f)); };
  assert.equal(glint(0).length, 1, 'a glint on the upper right petal');
  assert.equal(glint(1).length, 0, 'tier 1 drops the glint');
  // A flower that has sunk out of sight past the danger line (448) flares no light, ring or glint on the soil.
  const sunk = bud({ type: 'coral', r: 12, bloomed: true, bloomAt: 1, flareAt: 5, y: 480 });
  const { ctx, images, fills, arcs } = recorder(); Art.draw(ctx, rush([sunk]), 5.12, { showAim: false });
  assert.equal(images.filter(i => i.op === 'lighter').length, 0, 'no light');
  assert.equal(arcs.filter(a => near(a.x, sunk.x, .01) && near(a.y, sunk.y, .01)).length, 0, 'no ring');
  const sunkSpot = [sunk.x + 12 * .42, sunk.y - 12 * .46], onSpot = f => {
    const xs = f.points.map(p => p[0]), ys = f.points.map(p => p[1]);
    return xs.length >= 5 && Math.hypot((Math.min(...xs) + Math.max(...xs)) / 2 - sunkSpot[0], (Math.min(...ys) + Math.max(...ys)) / 2 - sunkSpot[1]) < 1.5;
  };
  assert.equal(fills.filter(f => f.style === '#ffffff' && onSpot(f)).length, 0, 'no glint');
});
test('Tumble-in: a ghost waits in place at .25, the bud drops in from above, then sits exactly where it lives', () => {
  const closed = closedSurface(11, 'gold');
  const at = (b, time, options) => { const { ctx, images } = recorder(); Art.draw(ctx, rush([b]), time, { showAim: false, ...options }); return images.find(i => i.img === closed); };
  const b = bud({ type: 'gold', x: 150, y: 200, enterAt: 10, enterDur: .4, enterDrop: 48, spawnAt: 9.9 });
  const before = at(b, 9.95);
  assert(near(before.cy, 200) && near(before.alpha, .25), 'ghost at its final place, alpha .25');
  const mid = at(b, 10.1), k = .25, back = 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);
  assert(mid.cy < 200 - 1, `above its final y mid-entry (${mid.cy.toFixed(1)})`);
  assert(near(mid.cy, 200 - 48 * (1 - back), 1e-6), 'easeOutBack(1.4) drop');
  for (const t of [10.4, 10.41, 12]) { const done = at(b, t); assert(near(done.cy, 200, 1e-9) && near(done.alpha, 1), `exact final y at k >= 1 (t ${t})`); }
  assert.equal(b.y, 200, 'the hitbox never moves');
  const boss = bud({ type: 'gold', x: 150, y: 200, enterAt: 10, enterDur: .8, enterDrop: 140, enterBounce: true });
  const quarter = at(boss, 10.2), bounce = 7.5625 * .25 * .25;
  assert(near(quarter.cy, 200 - 140 * (1 - bounce), 1e-6), 'enterBounce uses easeOutBounce');
  assert(near(at(b, 9.95, { reducedMotion: true }).cy, 200) && near(at(b, 9.95, { reducedMotion: true }).alpha, 1), 'animations off ignore enterAt');
  // A bud with no entry keeps today's spawn pop.
  const pop = at(bud({ type: 'gold', x: 150, y: 200, spawnAt: 9.9 }), 10);
  assert(pop.w < closed.width / 3, 'spawn pop still scales a new bud');
});
test('Chain links: queued blooms that know their source draw a link by kind; others draw nothing', () => {
  const target = bud({ x: 260, y: 220 }), other = bud({ x: 300, y: 250 });
  const base = { at: 4, when: 4.3, id: target.id, by: 1 };
  for (const via of ['relay', 'puff', 'boss', 'sun', undefined]) {
    const { ctx, calls } = recorder();
    Art.drawChainLinks(ctx, rush([target, other], { pending: [{ ...base, via, from: { x: 200, y: 180 } }] }), 4.15, {});
    assert(calls.filter(c => c === 'stroke').length >= 1, `${via} strokes a link`);
    assert(calls.includes('drawImage') || via === 'puff', `${via} has a lit head`);
  }
  const bare = recorder();
  Art.drawChainLinks(bare.ctx, rush([target], { pending: [{ id: target.id, when: 4.3 }, { id: target.id, when: 4.3, force: true }] }), 4.15, {});
  assert.equal(bare.calls.length, 0, 'items without from draw nothing');
  const gone = recorder();
  Art.drawChainLinks(gone.ctx, rush([target], { pending: [{ ...base, id: 'nobody', from: { x: 1, y: 2 } }] }), 4.15, {});
  assert.equal(gone.calls.length, 0, 'a link to a missing bud draws nothing');
  // In a full frame, pending items without from change nothing at all.
  const plain = recorder(), queued = recorder();
  Art.draw(plain.ctx, rush([target, other]), 4.15, { showAim: false });
  Art.draw(queued.ctx, rush([target, other], { pending: [{ id: target.id, when: 4.3 }] }), 4.15, { showAim: false });
  assert.deepEqual(queued.calls, plain.calls);
});
test('Links: at most 24, 12 at quality 1, none at quality 2, and a still dotted thread with animations off', () => {
  const buds = Array.from({ length: 30 }, (_, i) => bud({ x: 40 + i * 11, y: 260 }));
  const pending = buds.map(b => ({ id: b.id, when: 2.4, at: 2, via: 'relay', from: { x: 210, y: 120 } }));
  const heads = options => { const { ctx, images } = recorder(); Art.drawChainLinks(ctx, rush(buds, { pending }), 2.2, options); return images.filter(i => i.op === 'lighter').length; };
  assert.equal(heads({}), 24);
  assert.equal(heads({ quality: 1 }), 12);
  const off = recorder(); Art.drawChainLinks(off.ctx, rush(buds, { pending }), 2.2, { quality: 2 });
  assert.equal(off.calls.length, 0, 'quality 2 disables links');
  const still = recorder(); Art.drawChainLinks(still.ctx, rush(buds, { pending }), 2.2, { reducedMotion: true });
  assert.equal(still.images.length, 0, 'no moving lights');
  assert.equal(still.calls.filter(c => c === 'moveTo').length, 24, 'a thread for each link');
  assert(still.calls.includes('setLineDash') && still.calls.includes('stroke'), 'dotted');
  const later = recorder(); Art.drawChainLinks(later.ctx, rush(buds, { pending }), 2.39, { reducedMotion: true });
  assert.deepEqual(later.calls, still.calls, 'and they hold still');
});
test('After warm-up a worst-case frame (16 unfurls, 24 links, 40 flares) adds no gradients', () => {
  const now = 50, buds = [];
  for (let i = 0; i < 40; i++) buds.push(bud({ type: TYPES[i % 5], x: 40 + (i % 10) * 36, y: 80 + Math.floor(i / 10) * 60, bloomed: true, bloomAt: i < 16 ? now - .05 - i * .02 : now - 3, flareAt: now - .1 }));
  for (let i = 0; i < 24; i++) buds.push(bud({ type: TYPES[i % 5], x: 40 + (i % 12) * 30, y: 340 + Math.floor(i / 12) * 40 }));
  const pending = buds.slice(40).map((b, i) => ({ id: b.id, at: now - .1, when: now + .2, via: ['relay', 'puff', 'boss', 'sun'][i % 4], from: { x: 210, y: 60 } }));
  const busy = rush(buds, { pending });
  // The same board at rest: every flower open, nothing queued, nothing flaring.
  const calm = rush(buds.map(b => ({ ...b, bloomAt: b.bloomed ? now - 3 : -100, flareAt: undefined })));
  for (const state of [busy, calm]) Art.draw(recorder().ctx, state, now, { showAim: false }); // warm-up
  const count = state => { const before = totals.gradients; Art.draw(recorder().ctx, state, now, { showAim: false }); return totals.gradients - before; };
  assert.equal(count(busy), count(calm), 'the bloom features add no gradients to a frame');
});
test('Without any canvas (node), every feature still draws with plain paths', () => {
  const now = 8, b = bud({ bloomed: true, bloomAt: now - .1, flareAt: now - .1 }), t = bud({ x: 300, y: 300 });
  for (const age of [.01, .1, .3, .6]) { const { ctx, calls } = recorder(); PlainArt.drawUnfurl(ctx, b, age, { time: now }); assert(calls.length > 10, `age ${age}`); }
  const { ctx, calls } = recorder();
  PlainArt.draw(ctx, rush([b, t, bud({ hitAt: now - .01 })], { pending: [{ id: t.id, at: now - .1, when: now + .1, via: 'boss', from: { x: 10, y: 10 } }] }), now, { showAim: false });
  assert(calls.length > 100);
  assert.equal(calls.filter(c => c === 'save').length, calls.filter(c => c === 'restore').length, 'save and restore balance');
});
test('Saves and restores balance in every bloom feature', () => {
  for (const type of TYPES) for (const age of [.01, .05, .1, .2, .4, .54]) {
    const { ctx, calls } = recorder();
    Art.drawUnfurl(ctx, bud({ type, bloomed: true, bloomAt: 1 }), age, { time: 1 + age });
    assert.equal(calls.filter(c => c === 'save').length, calls.filter(c => c === 'restore').length, `${type} ${age}`);
  }
  const target = bud({ x: 100, y: 100 });
  for (const via of ['relay', 'puff', 'boss', 'sun']) {
    const { ctx, calls } = recorder();
    Art.drawChainLinks(ctx, rush([target], { pending: [{ id: target.id, at: 0, when: 1, via, from: { x: 0, y: 0 } }] }), .5, {});
    assert.equal(calls.filter(c => c === 'save').length, calls.filter(c => c === 'restore').length, via);
  }
});
test('Sheets never churn: a boss takes no slot, and boards that mix sizes reuse the cache instead of repainting', () => {
  const Fresh = loadArt(true);
  let now = 100;
  // One frame of fresh blooms, each a new bud, .2 s into its unfurl; returns the sheets it drew from.
  const frame = specs => {
    now += 1 / 60;
    const buds = specs.map(([type, r, extra], i) => bud({ type, r, x: 40 + i * 30, y: 120, bloomed: true, bloomAt: now - .2, ...extra }));
    const { ctx, images } = recorder();
    Fresh.draw(ctx, rush(buds), now, { showAim: false });
    return new Set(images.filter(i => i.cut).map(i => i.img));
  };
  const regular = TYPES.map(type => [type, 11]);
  // Gems (r 9) and geodes (r 14) on the same board as the regular buds: 9 + 6 + 4 sheets, more than the cache holds.
  const mixed = [['gold', 9], ['coral', 9], ['lilac', 9], ['poppy', 14], ['coral', 14]];
  // A boss bloom first: it goes petal by petal and must not hold sheet slots.
  frame([['gold', 24, { boss: true }], ['coral', 26, { boss: true }]]);
  const first = frame(regular);
  assert.equal(first.size, 9, 'every regular type opens from its sheets (sky has no inner sheet)');
  const seen = new Set(first);
  frame(mixed); frame(regular); frame(mixed);
  const settled = totals.surfaces;
  for (let round = 0; round < 20; round++) {
    for (const sheet of frame(regular)) seen.add(sheet);
    for (const sheet of frame(mixed)) seen.add(sheet);
  }
  assert.equal(totals.surfaces, settled, 'no new surfaces once the cache is warm');
  assert(seen.size <= 16, `at most sixteen sheets in use (${seen.size})`);
  for (const sheet of frame(regular)) assert(first.has(sheet), 'the regular buds keep their own sheets');
  // A size nobody has drawn for a few seconds gives up its slot to the sizes in play.
  for (let i = 0; i < 200; i++) frame(mixed);
  assert.equal(frame(mixed).size, 10, 'idle sheets make room for the gems and geodes now on the board');
});
test('Warmed up for a level, its flowers open in every variation and the boss blooms without painting anything new', () => {
  const Fresh = loadArt(true);
  const warm = Fresh.prewarm({ flowers: [{ type: 'sky', r: 12 }, { type: 'gold', r: 11 }], boss: { type: 'poppy', r: 27, max: 9 } });
  for (let guard = 0; guard < 1000 && !warm.step(1000); guard++);
  assert.equal(warm.left, 0, 'every warm-up job ran');
  const surfaces = totals.surfaces, paints = Fresh.paints();
  for (let v = 0; v < 7; v++) { Fresh.drawFlower(recorder().ctx, 100, 100, 12, 'sky', 1, 0, v); Fresh.drawFlower(recorder().ctx, 100, 100, 11, 'gold', 1, 0, v); }
  // Wherever it landed, the boss wears the variation that was painted ahead, and so does its last unfurl frame.
  for (const [x, y] of [[213, 101], [190, 140]]) {
    const boss = bud({ type: 'poppy', r: 27, boss: true, bloomed: true, bloomAt: 0, x, y });
    Fresh.drawUnfurl(recorder().ctx, boss, .53, { time: .53 }); Fresh.drawUnfurl(recorder().ctx, boss, .6, { time: .6 });
  }
  assert.equal(totals.surfaces, surfaces, 'no new sprite surfaces'); assert.equal(Fresh.paints(), paints, 'and nothing repainted');
  // A regular bloom's first frames, before its petals start to move, paint nothing either.
  const fresh = bud({ type: 'gold', r: 11, bloomed: true, bloomAt: 0 });
  for (const age of [.05, .1, .125]) Fresh.drawUnfurl(recorder().ctx, fresh, age, { time: age });
  assert.equal(Fresh.paints(), paints, 'frame 0 of a sheet is never painted');
});
test('The warm-up draws every canvas it paints onto the board once, invisibly, and an unfurl sheet only when complete', () => {
  const Fresh = loadArt(true), board = recorder(), before = totals.surfaces;
  const warm = Fresh.prewarm({ flowers: [{ type: 'lilac', r: 13 }], board: [{ type: 'lilac', r: 13, x: 100, y: 100 }] });
  for (let guard = 0; guard < 2000 && !warm.step(1000, board.ctx); guard++);
  assert.equal(warm.left, 0, 'every warm-up job ran');
  const touched = board.images.filter(i => i.w === 1 && near(i.cx, .5) && near(i.cy, .5));
  assert(touched.length > 20, `sprites were drawn onto the board (${touched.length})`);
  assert(touched.every(i => near(i.alpha, .004) && i.op === 'source-over'), 'at an alpha nobody can see');
  assert.equal(board.images.length, touched.length, 'and nothing else');
  const ids = touched.map(i => i.img.id);
  assert.equal(new Set(ids).size, ids.length, 'each canvas once');
  // The sprites a lilac bloom draws from were all rasterized ahead, its sheets once they were complete.
  const { ctx, images } = recorder();
  Fresh.drawUnfurl(ctx, bud({ type: 'lilac', r: 13, bloomed: true, bloomAt: 0 }), .2, { time: .2 });
  assert(images.length >= 3);
  for (const image of images) assert(ids.includes(image.img.id), `the unfurl's ${image.cut ? 'sheet' : 'sprite'} was warmed on the board`);
  assert.equal(totals.surfaces - before >= new Set(ids).size, true);
});
test("A boss's last hit cracks its own bud: no white disc, its face and leaves hold through the crack, the crown flies", () => {
  const LEAF = '#52b86a', CROWN = '#ffd64f';
  const boss = bud({ type: 'gold', r: 24, boss: true, hp: 0, maxHp: 6, bloomed: true, bloomAt: 3, impactAngle: -1.4, x: 210, y: 120 });
  const at = (time, options = {}) => { const rec = recorder(); Art.draw(rec.ctx, rush([boss]), time, { showAim: false, ...options }); return rec; };
  const early = at(3.01);
  assert(!early.images.some(i => i.img.silhouette), 'no white silhouette for a boss');
  const unfurl = recorder(); Art.drawUnfurl(unfurl.ctx, boss, .01, { time: 3.01 });
  assert(!unfurl.images.some(i => i.img.silhouette), 'nor in its unfurl');
  assert(unfurl.images.some(i => !i.img.silhouette && !i.cut), 'its own bud is drawn');
  const leaves = early.fills.filter(f => f.style === LEAF), crown = early.fills.filter(f => f.style === CROWN);
  assert.equal(leaves.length, 2, 'both leaves at .01 s'); assert(leaves.every(f => f.alpha > .95));
  assert.equal(crown.length, 1, 'the crown'); assert(crown[0].y < boss.y - boss.r - 14, 'knocked up off its head');
  const late = at(3.11), fading = late.fills.filter(f => f.style === LEAF);
  assert.equal(fading.length, 2); assert(fading.every(f => f.alpha < .95 && f.alpha > 0), 'fading as the casing pops at .11 s');
  const open = at(3.2);
  assert(!open.fills.some(f => f.style === LEAF || f.style === CROWN), 'gone once the petals are out');
  assert(!at(3.01, { reducedMotion: true }).fills.some(f => f.style === CROWN), 'animations off: no crack, the flower is simply open');
  // A regular bud keeps its one-frame white hit.
  const plain = bud({ type: 'gold', bloomed: true, bloomAt: 3 }), rec = recorder();
  Art.draw(rec.ctx, rush([plain]), 3.01, { showAim: false });
  assert(rec.images.some(i => i.img.silhouette), 'a regular bud still flashes white');
});
test("The finale's light glows under the flowers, never over them", () => {
  const flower = bud({ type: 'gold', x: 300, y: 200 });
  const light = { x: 120, y: 200, vx: 0, vy: 0, rotation: 0, life: .5, maxLife: .55, kind: 'light', color: '#ffd148', size: 50, grow: 70, gravity: 0, drag: 0 };
  const { ctx, images } = recorder();
  Art.draw(ctx, rush([flower], { particles: [light] }), 4, { showAim: false });
  const glow = images.findIndex(i => near(i.cx, light.x, .5) && near(i.cy, light.y, .5) && i.op === 'lighter');
  const bloom = images.findIndex(i => near(i.cx, flower.x, 2) && Math.abs(i.cy - flower.y) < 20 && i.op === 'source-over');
  assert(glow >= 0 && bloom >= 0, `both drawn (${glow}, ${bloom})`);
  assert(glow < bloom, 'the light is laid down before the flowers');
  assert.equal(images.filter(i => near(i.cx, light.x, .5) && near(i.cy, light.y, .5) && i.op === 'lighter').length, 1, 'and only once');
});
test('Briar vines wither once their patch has bloomed for good, and sink out with spent flowers', () => {
  const THORN = '#4a261b';
  const patch = extra => [0, 1, 2].map(i => bud({ briar: true, group: 'briar-a', x: 150 + i * 30, y: 200, ...extra(i) }));
  const vine = (buds, time) => { const { ctx, fills } = recorder(); Art.draw(ctx, rush(buds), time, { showAim: false }); return fills.filter(f => f.style === THORN); };
  assert(vine(patch(() => ({})), 10).length > 0, 'an open patch is tied by its vine');
  assert(vine(patch(i => i ? {} : { bloomed: true, bloomAt: 9, regrowAt: 13, regrowSpan: 4 }), 10).length > 0, 'a patch on its clock keeps it');
  const done = patch(() => ({ bloomed: true, bloomAt: 9.9, regrowAt: null }));
  const fresh = vine(done, 10), going = vine(done, 10.4), gone = vine(done, 11);
  assert(fresh.length > 0 && fresh.every(f => f.alpha > .95), 'a patch that just bloomed for good still shows it');
  assert(going.length > 0 && going.every(f => f.alpha < .95), 'then it withers');
  assert.equal(gone.length, 0, 'and is gone');
  const { ctx, fills } = recorder();
  Art.draw(ctx, rush(done), 10, { showAim: false, reducedMotion: true });
  assert.equal(fills.filter(f => f.style === THORN).length, 0, 'with animations off it goes at once');
  const sunk = patch(() => ({ bloomed: true, bloomAt: 5, regrowAt: 13, regrowSpan: 4, y: 470 }));
  assert.equal(vine(sunk, 10).length, 0, 'a spent patch past the danger line takes its vine with it');
});
test('The harvest leaves the board at its top edge under the score, wherever the score sits above it', () => {
  const Fresh = loadArt(true);
  assert.deepEqual({ ...Fresh.setHarvestTarget(318, -169) }, { x: 318, y: -6 }, 'clamped to the edge, not lost above it');
  assert.deepEqual({ ...Fresh.setHarvestTarget(500, 4) }, { x: 390, y: 4 });
});
test("The puff's spore cloud ends exactly at the puff's reach", () => {
  const target = bud({ x: 250, y: 220 }), from = { x: 200, y: 200 };
  const ring = time => {
    const { ctx, arcs } = recorder();
    Art.drawChainLinks(ctx, rush([target], { pending: [{ id: target.id, at: 0, when: .3, via: 'puff', from }] }), time, {});
    return Math.max(0, ...arcs.filter(a => near(a.x, from.x) && near(a.y, from.y) && a.radius > 6).map(a => a.radius));
  };
  const sizes = [.05, .15, .25, .35, .39].map(ring);
  assert(sizes.every((size, i) => !i || size >= sizes[i - 1]), `it only grows (${sizes.map(r => r.toFixed(1))})`);
  assert(sizes[sizes.length - 1] > 72 && Math.max(...sizes) <= 74 + 1e-9, `ends at the reach of 74 (${sizes[sizes.length - 1].toFixed(2)})`);
});

const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
