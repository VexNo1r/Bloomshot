'use strict';
// Koi Conservatory: geometry, solvable lane routes, frame-rate equality,
// dependence on currents, opening survey and finger-aim tolerance.
// `node qa/test-koi-levels.cjs --solve` regenerates qa/koi-solutions.json.
process.env.BLOOM_WORLD = 'koi';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { Game, BOUNDS, laneAt } = require('../engine.js');
const koi = require('../koi.js');
const { run } = require('./aim-tolerance.cjs');
const { levels } = koi;
const solutionsFile = path.join(__dirname, 'koi-solutions.json'), reportFile = path.join(__dirname, 'koi-test-results.json');
const copy = x => JSON.parse(JSON.stringify(x));
function clone(game) { const g = new Game(game.level); Object.assign(g, copy(game)); g.events = []; return g; }
function settle(game, fps = 60) { for (let i = 0; i < fps * 11 && (game.status === 'flying' || game.pending.length); i++) { game.step(1 / fps); game.events = []; } assert.notEqual(game.status, 'flying'); return game; }
function shoot(current, angle, rotateId, fps = 60) { const g = clone(current); if (rotateId && !g.rotate(rotateId)) return null; if (!g.fire(Math.cos(angle), Math.sin(angle))) return null; return settle(g, fps); }
function validate(level) {
  assert.equal(level.worldId, 'koi'); assert.equal(level.rules.shots, 5); assert.equal(level.rules.ballsPerShot, 1);
  assert(level.buds.length >= 12 && level.buds.length <= 24, `${level.id}: bud count`);
  assert(level.hint.length <= 75 && level.name.length <= 18, `${level.id}: text must fit the mobile HUD`);
  assert(level.currents.length >= 1, `${level.id}: Koi boards need currents`);
  const game = new Game(level); assert.equal(game.currents.length, level.currents.length, `${level.id}: every lane must validate`);
  for (const bud of level.buds) {
    assert(bud.x - bud.r > BOUNDS.left && bud.x + bud.r < BOUNDS.right && bud.y - bud.r > BOUNDS.top && bud.y + bud.r < level.launcher.y - 24, `${level.id}: bud bounds ${bud.id}`);
    for (const other of level.buds) if (other !== bud) assert(Math.hypot(bud.x - other.x, bud.y - other.y) > bud.r + other.r + 1, `${level.id}: buds overlap`);
  }
  assert(!laneAt(game.currents, level.launcher.x, level.launcher.y), `${level.id}: launcher must sit in still water`);
}
function solve(level, width = 8) {
  let beam = [{ game: new Game(level), shots: [] }];
  const remaining = g => g.buds.filter(b => !b.bloomed).length;
  for (let depth = 0; depth < 5; depth++) {
    const unique = new Map();
    for (const node of beam) for (const rotateId of [null, ...node.game.bumpers.map(b => b.id)]) for (let deg = -171; deg <= -9; deg += 1.5) {
      const angle = deg * Math.PI / 180, g = shoot(node.game, angle, rotateId); if (!g) continue;
      const result = { game: g, shots: [...node.shots, { angleRadians: angle, rotateId, bloomsAfter: g.bloomedCount }] };
      if (g.status === 'won') { if (replay({ ...copy(level), currents: [] }, result.shots, 60).status !== 'won') return result; continue; }
      if (g.status !== 'aiming' || remaining(g) >= remaining(node.game)) continue;
      const key = g.buds.map(b => b.bloomed ? 1 : 0).join('') + g.bumpers.map(b => Math.round(b.angle * 1e4)).join(',');
      if (!unique.has(key) || unique.get(key).game.score < g.score) unique.set(key, result);
    }
    beam = [...unique.values()].sort((a, b) => remaining(a.game) - remaining(b.game) || b.game.score - a.game.score).slice(0, width);
  }
  return null;
}
function replay(level, shots, fps) { let g = new Game(level); for (const s of shots) { if (g.status !== 'aiming') break; if (s.rotateId) assert(g.rotate(s.rotateId)); assert(g.fire(Math.cos(s.angleRadians), Math.sin(s.angleRadians))); settle(g, fps); } return g; }
levels.forEach(validate);
assert.equal(koi.freeBoards, 2); assert.equal(koi.entitlement, 'world_koi');
assert(levels.every((l, i) => l.free === i < koi.freeBoards), 'Only the first boards are a free taster');
let records;
if (process.argv.includes('--solve')) {
  records = levels.map(level => { const r = solve(level); assert(r, `${level.id}: no route found`); console.log(`${level.id}: ${r.shots.length} shots`); return { id: level.id, par: level.par, shots: r.shots, score: r.game.score }; });
  fs.writeFileSync(solutionsFile, JSON.stringify({ method: 'Beam search over 1.5° aims and optional leaf turns; width 8; five shots max.', levels: records }, null, 2) + '\n');
} else records = JSON.parse(fs.readFileSync(solutionsFile)).levels;
const floors = [.9, .8, .7, .6, .55, .45, .4, .3];
const report = { generatedAt: new Date().toISOString(), levels: [] };
levels.forEach((level, i) => {
  const record = records.find(r => r.id === level.id); assert(record, `missing solution ${level.id}`);
  const outcomes = [30, 60, 144].map(fps => replay(level, record.shots, fps));
  for (const g of outcomes) { assert.equal(g.status, 'won', `${level.id}: replay`); assert.equal(g.score, outcomes[0].score, `${level.id}: frame-rate mismatch`); assert(g.currentTime > 0, `${level.id}: route must ride a current`); }
  const still = replay({ ...copy(level), currents: [] }, record.shots, 60);
  assert(still.status !== 'won', `${level.id}: recorded route must depend on the currents`);
  let lucky = 0, samples = 0;
  for (let deg = -171; deg <= -9; deg += 3) for (const r of [null, ...level.bumpers.map(b => b.id)]) { samples++; if (shoot(new Game(level), deg * Math.PI / 180, r).status === 'won') lucky++; }
  if (i === 0) assert(lucky <= Math.ceil(samples * .05), `${level.id}: lucky openers must stay rare`); else assert.equal(lucky, 0, `${level.id}: no one-shot clears`);
  const tolerance = run(level, 3, 40);
  assert(tolerance.clearRate >= floors[i], `${level.id}: clear rate ${tolerance.clearRate} below ${floors[i]}`);
  report.levels.push({ id: level.id, routeShots: record.shots.length, par: level.par, luckyOpeners: lucky, samples, clearRateAt3Deg: tolerance.clearRate, avgShots: tolerance.avgShots });
});
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log('PASS: eight Koi boards; lane routes replay at 30/60/144 FPS and need the currents; aim tolerance ' + report.levels.map(l => `${l.id} ${Math.round(l.clearRateAt3Deg * 100)}%`).join(', '));
