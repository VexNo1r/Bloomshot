'use strict';
// Measures how forgiving a Moon board is for a human aiming with a finger.
// A "careful player" picks the angle whose ±noise neighbourhood blooms the most
// on average, then fires with Gaussian aim error. Reports clear rate over runs.
const { Game } = require('../engine.js');
const { levels } = require(process.env.BLOOM_WORLD === 'koi' ? '../koi.js' : '../moon.js');
const copy = x => JSON.parse(JSON.stringify(x));
function clone(level, game) { const g = new Game(level); Object.assign(g, copy(game)); g.events = []; return g; }
function shoot(level, game, angle) {
  const g = clone(level, game); if (!g.fire(Math.cos(angle), Math.sin(angle))) return g;
  for (let i = 0; i < 60 * 11 && (g.status === 'flying' || (g.pending && g.pending.length)); i++) { g.step(1 / 60); g.events = []; }
  return g;
}
let seed = 12345; const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
const LO = -Math.PI + .16, HI = -.16, STEP = .5 * Math.PI / 180;
function sweep(level, game) {
  const out = []; for (let a = LO; a <= HI; a += STEP) out.push({ a, b: shoot(level, game, a).bloomedCount }); return out;
}
function bestRobust(samples, sigmaSteps) {
  let best = null;
  for (let i = 0; i < samples.length; i++) {
    let s = 0, w = 0;
    for (let k = -3 * sigmaSteps; k <= 3 * sigmaSteps; k++) { const j = i + k; if (j < 0 || j >= samples.length) continue; const wt = Math.exp(-(k * k) / (2 * sigmaSteps * sigmaSteps)); s += samples[j].b * wt; w += wt; }
    const v = s / w; if (!best || v > best.v) best = { a: samples[i].a, v };
  }
  return best;
}
function run(level, sigmaDeg, runs) {
  seed = 12345;
  let clears = 0, shotsUsed = [];
  const cache = new Map();
  for (let r = 0; r < runs; r++) {
    let g = new Game(level);
    for (let shot = 0; shot < level.rules.shots && g.status !== 'won'; shot++) {
      const key = g.buds.map(b => b.bloomed ? 1 : 0).join('');
      let plan = cache.get(key); if (!plan) { plan = bestRobust(sweep(level, g), Math.max(1, Math.round(sigmaDeg / .5))); cache.set(key, plan); }
      g = shoot(level, g, Math.max(LO, Math.min(HI, plan.a + gauss() * sigmaDeg * Math.PI / 180)));
    }
    if (g.status === 'won') { clears++; shotsUsed.push(g.level.rules.shots - g.shotsLeft); }
  }
  return { clearRate: clears / runs, avgShots: shotsUsed.length ? +(shotsUsed.reduce((a, b) => a + b, 0) / shotsUsed.length).toFixed(2) : null };
}
module.exports = { run, levels };
if (require.main !== module) return;
const which = process.argv[2] ? [Number(process.argv[2]) - 1] : levels.map((_, i) => i);
const sigma = Number(process.argv[3] || 1.5), runs = Number(process.argv[4] || 60);
for (const i of which) console.log(levels[i].id, `sigma ${sigma}°`, JSON.stringify(run(levels[i], sigma, runs)));
