'use strict';
// Fire-rate measurement: one set of players, any build (this one or an older checkout, to compare). Mashers tap every
// .12 s (wild, sweep, lazy; lazyReady and wildReady only tap when a shot is allowed), aimers trace their shots like qa/depths-bot.cjs
// (fast fires as soon as allowed, good and average think first, kid and kidEager aim worse).
// node qa/fire-rate-measure.cjs <build dir> <out.json> [players=a,b] [levels=1..10|0 for endless], then
// node qa/fire-rate-report.cjs <out.json> [more.json ...] for the table.
// env SEEDS (mashers, fast, kids per level, default 20), GOOD_SEEDS (2), AVG_SEEDS (3), ENDLESS (8), WORKERS (4)
const path = require('node:path');
const { fork } = require('node:child_process');
const dir = path.resolve(process.argv[2]);
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const GOOD = { noise: 2.5, think: .3, thinkSpread: .3, bounces: 2 }, AVERAGE = { noise: 4, think: .5, thinkSpread: .5, bounces: 1 };
const FAST = { noise: 2.5, think: 0, thinkSpread: 0, bounces: 2 };

function setup() {
  const { RushGame } = require(dir + '/rush.js'); const Depths = require(dir + '/depths.js');
  const Bot = require(dir + '/qa/depths-bot.cjs');
  const plan = id => { const level = Depths.level(id); return { id, name: level.name, waves: Depths.waveCount, wave: n => Depths.wave(id, n) }; };
  return { RushGame, plan, trace: Bot.trace };
}
function ready(game) {
  if (typeof game.canFire === 'function') return game.canFire();
  if (game.canFire !== undefined) return game.canFire;
  return !game.over && game.fireCooldown <= 1e-7 && game.balls.length < 5;
}
function meter(game) {
  const m = { ns: 0, nsT: 0, supT: 0, times: [], ft: 0, ftHit: 0, taps: 0, dropped: 0 };
  const fire = game.fire.bind(game);
  game.fire = (dx, dy) => {
    const sup = game.superBloom > 0, before = game.shotNumber; m.taps++;
    const ok = fire(dx, dy);
    if (game.shotNumber > before) { if (!sup) { m.ns++; m.times.push(game.time); } } else m.dropped++;
    return ok;
  };
  const tick = game._tick.bind(game);
  game._tick = dt => { if (game.started && !game.over) { if (game.superBloom > 0) m.supT += dt; else m.nsT += dt; } return tick(dt); };
  // A kept tap launches later, inside step(), so launches are also counted there by the change in shotNumber.
  const step = game.step.bind(game);
  game.step = dt => { const sup = game.superBloom > 0, before = game.shotNumber; step(dt); for (let i = before; i < game.shotNumber; i++) if (!sup) { m.ns++; m.times.push(game.time); } };
  return m;
}
function stats(game, m) {
  let burst = 0;
  for (let i = 0, j = 0; i < m.times.length; i++) { while (m.times[i] - m.times[j] > 1) j++; burst = Math.max(burst, i - j + 1); }
  // longest non-super gap between shots while flowers were on the board is hard to isolate; report gaps p90
  const gaps = []; for (let i = 1; i < m.times.length; i++) gaps.push(m.times[i] - m.times[i - 1]);
  gaps.sort((a, b) => a - b);
  return { sps: +(m.ns / Math.max(1e-6, m.nsT)).toFixed(3), burst, p10gap: gaps.length ? +gaps[Math.floor(gaps.length * .1)].toFixed(2) : null,
    p90gap: gaps.length ? +gaps[Math.floor(gaps.length * .9)].toFixed(2) : null, maxgap: gaps.length ? +gaps[gaps.length - 1].toFixed(2) : null,
    taps: m.taps, dropped: m.dropped, supers: game.superCount, tricks: game.trickCount, refunds: game.refunds || 0 };
}
function value(game, hit, timing) {
  const bud = hit.bud;
  if (bud.shield && hit.ny > .28) return -1;
  if (bud.shell) { const a = bud.shellAngle + bud.shellSpin * (hit.time + .03); if (hit.nx * Math.cos(a) + hit.ny * Math.sin(a) < .34 + timing) return -1; }
  const danger = (bud.y + bud.r) / game.dangerY * (bud.fall || 1);
  return danger * 100 + (bud.relay ? 30 : 0) + (bud.puff ? 45 : 0) + (bud.boss ? 25 : 0) + (bud.regrowAt ? 40 : 0) + (bud.gem ? 15 : 0) - hit.time * 20;
}
function spamRun(env, id, seed, mode, opts = {}) {
  const r = rng(seed), game = new env.RushGame(id ? { plan: env.plan(id) } : {}), m = meter(game); let next = 0;
  const limit = id ? 900 : 600, gap = opts.gap || .12;
  for (let t = 0; t < limit && !game.over; t += 1 / 60) {
    next -= 1 / 60;
    if (next <= 0 && (!opts.polite || ready(game))) {
      let deg;
      if (mode === 'wild') deg = -150 + r() * 120;
      else if (mode === 'sweep') deg = -90 + Math.sin(t * 2.3) * 45 + (r() - .5) * 10;
      else { const low = game.buds.filter(b => !b.bloomed && !b.gift).sort((a, b) => b.y - a.y)[0]; deg = low ? Math.atan2(low.y - 498, low.x - 210) * 180 / Math.PI + (r() - .5) * 24 : -90; }
      game.fire(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180));
      next = gap;
    }
    game.step(1 / 60); game.drainEvents();
  }
  return { won: game.status === 'won', wave: game.wave, lives: game.lives, t: Math.round(game.elapsed), ...stats(game, m) };
}
function aimRun(env, id, seed, o) {
  const random = rng(seed), game = new env.RushGame(id ? { plan: env.plan(id) } : {}), m = meter(game);
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += random(); return (s - 3) / Math.sqrt(.5); };
  let think = 0; const limit = id ? 900 : 600;
  for (let t = 0; t < limit && !game.over; t += 1 / 60) {
    think -= 1 / 60;
    if (game.splitReady && random() < .5) game.split();
    if (think <= 0 && ready(game)) {
      let best = null;
      for (let deg = -170; deg <= -10; deg += 2.5) {
        const angle = deg * Math.PI / 180, hit = env.trace(game, angle, o.bounces ?? 3);
        if (!hit) continue;
        const score = value(game, hit, o.timing ?? .1);
        if (score > 0 && (!best || score > best.score)) best = { angle, score };
      }
      const angle = (best ? best.angle : -Math.PI / 2) + gauss() * o.noise * Math.PI / 180;
      game.fire(Math.cos(angle), Math.sin(angle));
      think = game.superBloom > 0 ? .12 + random() * .1 : (o.think ?? .3) + random() * (o.thinkSpread ?? .35);
    }
    game.step(1 / 60); game.drainEvents();
  }
  return { won: game.status === 'won', wave: game.wave, lives: game.lives, t: Math.round(game.elapsed), ...stats(game, m) };
}
const PLAYERS = {
  wild: (env, id, s) => spamRun(env, id, s * 101 + id, 'wild'),
  sweep: (env, id, s) => spamRun(env, id, s * 101 + id, 'sweep'),
  lazy: (env, id, s) => spamRun(env, id, s * 101 + id, 'lazy'),
  lazyReady: (env, id, s) => spamRun(env, id, s * 101 + id, 'lazy', { polite: true }),
  wildReady: (env, id, s) => spamRun(env, id, s * 101 + id, 'wild', { polite: true }),
  wildSemi: (env, id, s) => spamRun(env, id, s * 101 + id, 'wild', { gap: .3 }),
  lazySemi: (env, id, s) => spamRun(env, id, s * 101 + id, 'lazy', { gap: .3 }),
  fast: (env, id, s) => aimRun(env, id, s * 53 + id, FAST),
  good: (env, id, s) => aimRun(env, id, s * 31 + id, GOOD),
  average: (env, id, s) => aimRun(env, id, s * 7919 + id, AVERAGE),
  kid: (env, id, s) => aimRun(env, id, s * 313 + id, { noise: 6, think: .4, thinkSpread: .5, bounces: 1 }),
  kidEager: (env, id, s) => aimRun(env, id, s * 317 + id, { noise: 6, think: .1, thinkSpread: .15, bounces: 1 }),
};
const nSeeds = p => p === 'good' ? Number(process.env.GOOD_SEEDS || 2) : p === 'average' ? Number(process.env.AVG_SEEDS || 3) : Number(process.env.SEEDS || 20);
if (process.env.MEASURE_CHILD) {
  process.on('message', job => {
    const env = setup(); const out = {};
    if (job.level) out[job.player] = Array.from({ length: job.n }, (_, i) => PLAYERS[job.player](env, job.level, job.from + i + 1));
    else out[job.player] = Array.from({ length: job.n }, (_, i) => PLAYERS[job.player](env, 0, job.from + i + 1));
    process.send(out); process.exit(0);
  });
} else {
  const players = (process.argv[4] || 'wild,sweep,lazy,lazyReady,fast,good,average').split(',');
  const levels = (process.argv[5] || '1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
  const jobs = [];
  for (const level of levels) for (const player of players) {
    const n = level ? nSeeds(player) : Number(process.env.ENDLESS || 8), chunk = 5;
    for (let from = 0; from < n; from += chunk) jobs.push({ level, player, from, n: Math.min(chunk, n - from) });
  }
  const results = {}; let running = 0, next = 0; const W = Number(process.env.WORKERS || 4), t0 = Date.now();
  const launch = () => {
    while (running < W && next < jobs.length) {
      const job = jobs[next++]; running++;
      const c = fork(__filename, [dir], { env: { ...process.env, MEASURE_CHILD: '1' } });
      c.on('message', r => { const L = results[job.level] || (results[job.level] = {}); const arr = L[job.player] || (L[job.player] = []); for (let i = 0; i < r[job.player].length; i++) arr[job.from + i] = r[job.player][i]; });
      c.on('exit', () => { running--; if (next < jobs.length) launch(); else if (running === 0) { require('node:fs').writeFileSync(process.argv[3], JSON.stringify(results)); console.log('done', dir, ((Date.now() - t0) / 1000).toFixed(0) + 's'); } });
      c.send(job);
    }
  };
  launch();
}
