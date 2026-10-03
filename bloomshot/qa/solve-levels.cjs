'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { Game, BOUNDS, RADIUS } = require('../engine.js');
const catalog = require('../levels.js');
const outPath = path.join(__dirname, 'solutions.json');
const dt = 1 / 60;
let simulatedShots = 0;

function clone(game) {
  const result = new Game(game.level);
  Object.assign(result, JSON.parse(JSON.stringify(game)));
  result.events = [];
  return result;
}
function settle(game) {
  for (let i = 0; i < 1000 && (game.status === 'flying' || game.pending.length); i++) {
    game.step(dt);
    game.events.length = 0;
  }
  assert.notEqual(game.status, 'flying', 'shot must settle within bounded time');
  return game;
}
function shoot(game, angleRadians, rotate) {
  const next = clone(game);
  if (rotate && !next.rotate(next.bumpers[0].id)) return null;
  if (!next.fire(Math.cos(angleRadians), Math.sin(angleRadians))) return null;
  simulatedShots++;
  return settle(next);
}
function angles(game) {
  const found = new Map();
  function add(a) {
    if (a < -Math.PI + 0.125 || a > -0.125) return;
    found.set(Math.round(a * 10000), a);
  }
  add(-Math.PI / 2);
  for (const bud of game.buds) if (!bud.bloomed) {
    const a = Math.atan2(bud.y - game.launcher.y, bud.x - game.launcher.x);
    add(a);
    const delta = Math.asin(Math.min(0.9, (bud.r + RADIUS) / Math.hypot(bud.x - game.launcher.x, bud.y - game.launcher.y))) * 0.58;
    add(a - delta); add(a + delta);
    for (const wall of [BOUNDS.left + RADIUS, BOUNDS.right - RADIUS]) {
      add(Math.atan2(bud.y - game.launcher.y, 2 * wall - bud.x - game.launcher.x));
    }
  }
  for (let degrees = -171; degrees <= -9; degrees += 3) add(degrees * Math.PI / 180);
  return [...found.values()];
}
function key(game) {
  return game.buds.map(b => b.bloomed ? '0' : String(b.hp || 1)).join('') + ':' +
    game.bumpers.map(b => Math.round(((b.angle % Math.PI + Math.PI) % Math.PI) * 10000)).join(',');
}
function remainingHp(game) {
  return game.buds.reduce((sum, b) => sum + (b.bloomed ? 0 : b.hp || 1), 0);
}
function solve(level, width = 16) {
  let beam = [{ game: new Game(level), shots: [] }];
  for (let depth = 0; depth < 3; depth++) {
    const unique = new Map();
    for (const current of beam) {
      for (const rotate of [false, true]) {
        if (rotate && !current.game.bumpers.length) continue;
        for (const angle of angles(current.game)) {
          const next = shoot(current.game, angle, rotate);
          if (!next) continue;
          const shot = { angleRadians: angle, rotate,
            bumperId: rotate ? current.game.bumpers[0].id : null,
            bloomsAfter: next.bloomedCount, statusAfter: next.status };
          const result = { game: next, shots: [...current.shots, shot] };
          if (next.status === 'won') return result;
          const damageBefore = remainingHp(current.game);
          const damageAfter = remainingHp(next);
          if (next.status !== 'aiming' || next.shotsLeft <= 0 || damageAfter >= damageBefore) continue;
          const signature = key(next);
          if (!unique.has(signature) || unique.get(signature).game.score < next.score) unique.set(signature, result);
        }
      }
    }
    beam = [...unique.values()].sort((a, b) => remainingHp(a.game) - remainingHp(b.game) || b.game.bloomedCount - a.game.bloomedCount || b.game.score - a.game.score).slice(0, width);
    if (!beam.length) break;
  }
  return null;
}
function replay(level, shots) {
  const game = new Game(level);
  for (const shot of shots) {
    if (shot.rotate) assert(game.rotate(shot.bumperId));
    assert(game.fire(Math.cos(shot.angleRadians), Math.sin(shot.angleRadians)));
    settle(game);
  }
  assert.equal(game.status, 'won', 'recorded solution replay: ' + level.id);
  assert.equal(game.bloomedCount, level.buds.length);
  return game;
}

if (require.main === module) {
  const only = process.argv.find(arg => arg.startsWith('--only='));
  const requested = only ? new Set(only.split('=')[1].split(',').map(Number)) : null;
  const report = { generatedAt: new Date().toISOString(), timestep: dt,
    method: 'Angle grid + direct/grazing/wall aims; beam width 16; at most 3 shots. Each stored path is replayed.',
    levels: [], daily: [], simulatedShots: 0 };
  const started = Date.now();
  for (const level of catalog.levels.filter(l => !requested || requested.has(l.id))) {
    const start = Date.now(), result = solve(level);
    if (!result) {
      report.levels.push({ id: level.id, name: level.name, solved: false });
      console.log(JSON.stringify({ id: level.id, solved: false, seconds: (Date.now() - start) / 1000 }));
    } else {
      const verified = replay(level, result.shots);
      report.levels.push({ id: level.id, name: level.name, solved: true, shots: result.shots,
        score: verified.score, stars: verified.stars, shotsUsed: result.shots.length,
        authoredPar: level.par, parMet: result.shots.length <= level.par });
      console.log(JSON.stringify({ id: level.id, solved: true, shots: result.shots.length,
        par: level.par, seconds: (Date.now() - start) / 1000 }));
    }
    report.simulatedShots = simulatedShots;
    report.elapsedSeconds = (Date.now() - started) / 1000;
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  }
  if (!requested && report.levels.every(l => l.solved)) {
    const seen = new Set();
    for (let i = 0; i < 366 && seen.size < 12; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      const daily = catalog.dailyLevel(date);
      const source = catalog.levels.find(l => daily.subtitle.includes(l.name + '.'));
      if (seen.has(source.id)) continue;
      seen.add(source.id);
      const recorded = report.levels.find(l => l.id === source.id);
      const shots = recorded.shots.map(s => ({ ...s,
        angleRadians: Math.atan2(Math.sin(s.angleRadians), -Math.cos(s.angleRadians)) }));
      let game, finalShots = shots, mirroredPathWorks = true;
      try { game = replay(daily, shots); }
      catch (error) {
        // Stagger order and bonus-ball birth directions need not be mirror-symmetric.
        mirroredPathWorks = false;
        const result = solve(daily);
        assert(result, 'daily garden must have a solution: ' + date);
        finalShots = result.shots;
        game = replay(daily, finalShots);
      }
      report.daily.push({ date, sourceLevelId: source.id, solved: true, shots: finalShots, score: game.score, mirroredPathWorks });
    }
  }
  if (!requested && process.argv.includes('--survey')) {
    report.difficultySurvey = [];
    for (const level of catalog.levels) {
      const attempts = [];
      for (let deg = -165; deg <= -15; deg += 5) {
        const next = shoot(new Game(level), deg * Math.PI / 180, false);
        attempts.push({ degrees: deg, won: next.status === 'won', blooms: next.bloomedCount });
      }
      const coverages = attempts.map(a => a.blooms / level.buds.length).sort((a,b) => a-b);
      const data = { id: level.id, name: level.name, speed: new Game(level).speed,
        aims: attempts.length, oneVolleyWins: attempts.filter(a => a.won).length,
        winFraction: attempts.filter(a => a.won).length / attempts.length,
        medianBloomFraction: coverages[Math.floor(coverages.length / 2)], attempts };
      report.difficultySurvey.push(data);
      console.log(JSON.stringify({ survey: level.id, wins: data.oneVolleyWins, aims: data.aims,
        medianBloomFraction: data.medianBloomFraction, speed: data.speed }));
    }
  }
  report.simulatedShots = simulatedShots;
  report.elapsedSeconds = (Date.now() - started) / 1000;
  report.elapsedSeconds = (Date.now() - started) / 1000;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ solved: report.levels.filter(l => l.solved).length,
    total: report.levels.length, dailyMirrorsVerified: report.daily.length,
    simulatedShots, seconds: report.elapsedSeconds, output: outPath }));
  if (report.levels.some(l => !l.solved)) process.exitCode = 1;
}
module.exports = { solve, replay, settle, shoot, angles };
