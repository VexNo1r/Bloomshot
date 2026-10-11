'use strict';
// A practice player for the level campaign. It traces each candidate angle through the board as it stands,
// picks the shot whose first bud hit matters most (lowest, fastest, crowns, puffcaps, the boss) and fires
// with a little aim error, the way a good human would. Used to check every level can be cleared and that
// later levels are harder. Usage: play(levelId, { seed, noise }) -> { won, wave, lives, score, elapsed }.
const Engine = require('../engine.js');
const { RushGame } = require('../rush.js');
const Depths = require('../depths.js');

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function plan(id) { const level = Depths.level(id); return { id, name: level.name, waves: Depths.waveCount, wave: n => Depths.wave(id, n) }; }

// Follows one shot until it first touches a bud (or gives up), bouncing off walls, the leaf and rocks, bending
// in currents and passing through tunnels the way the game does.
function trace(game, angle, bounces = 3) {
  const p = { x: game.launcher.x, y: game.launcher.y, gateCooldown: 0, gateHops: 0 }, dt = 1 / 60;
  let vx = Math.cos(angle) * game.speed, vy = Math.sin(angle) * game.speed;
  const state = { bumpers: game.bumpers, buds: game.buds.filter(bud => !bud.bloomed), gates: game.gates || [] };
  const currents = game.currents || [];
  for (let step = 0; step < 90; step++) {
    const lane = currents.length && Engine.laneAt(currents, p.x, p.y);
    if (lane) { const v = Engine.steer(vx, vy, lane, dt); vx = v.x; vy = v.y; }
    let remaining = dt;
    for (let i = 0; i < 4 && remaining > 1e-7; i++) {
      const d = { x: vx * remaining, y: vy * remaining }, hit = Engine.earliest(state, p, d);
      if (!hit) { p.x += d.x; p.y += d.y; p.gateCooldown = Math.max(0, p.gateCooldown - remaining); break; }
      p.x += d.x * hit.t; p.y += d.y * hit.t;
      if (hit.kind === 'bud') return { bud: hit.item, nx: hit.nx, ny: hit.ny, time: step * dt };
      if (hit.kind === 'gate') {
        const transfer = Engine.gateTransfer(state.gates, hit.item, vx, vy);
        if (!transfer) return null;
        p.x = transfer.x; p.y = transfer.y; vx = transfer.vx; vy = transfer.vy; p.gateCooldown = Engine.GATE_COOLDOWN; p.gateHops++;
        remaining *= Math.max(0, 1 - hit.t); continue;
      }
      if (--bounces < 0) return null;
      const dot = vx * hit.nx + vy * hit.ny; vx -= 2 * dot * hit.nx; vy -= 2 * dot * hit.ny;
      p.x += hit.nx * .08; p.y += hit.ny * .08; remaining *= Math.max(0, 1 - hit.t);
    }
    if (p.y > Engine.BOUNDS.bottom) return null;
  }
  return null;
}
function value(game, hit, timing) {
  const bud = hit.bud;
  if (bud.shield && hit.ny > .28) return -1;
  // A shell keeps turning while the shot flies, so check where its opening will be on arrival.
  if (bud.shell) {
    const a = bud.shellAngle + bud.shellSpin * (hit.time + .03);
    if (hit.nx * Math.cos(a) + hit.ny * Math.sin(a) < .34 + timing) return -1;
  }
  const danger = (bud.y + bud.r) / game.dangerY * (bud.fall || 1);
  return danger * 100 + (bud.relay ? 30 : 0) + (bud.puff ? 45 : 0) + (bud.boss ? 25 : 0) + (bud.regrowAt ? 40 : 0) + (bud.gem ? 15 : 0) - hit.time * 20;
}
function play(levelId, options = {}) {
  const random = rng(options.seed || 1), noise = options.noise ?? 1.4;
  const game = new RushGame({ plan: plan(levelId) });
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += random(); return (s - 3) / Math.sqrt(.5); };
  let think = 0;
  for (let t = 0; t < 900 && !game.over; t += 1 / 60) {
    think -= 1 / 60;
    if (game.splitReady && random() < .5) game.split();
    if (think <= 0 && game.fireCooldown <= 1e-7 && game.balls.length < 5) {
      let best = null;
      for (let deg = -170; deg <= -10; deg += 2.5) {
        const angle = deg * Math.PI / 180, hit = trace(game, angle, options.bounces ?? 3);
        if (!hit) continue;
        const score = value(game, hit, options.timing ?? .1);
        if (score > 0 && (!best || score > best.score)) best = { angle, score };
      }
      const angle = (best ? best.angle : -Math.PI / 2) + gauss() * noise * Math.PI / 180;
      game.fire(Math.cos(angle), Math.sin(angle));
      think = (options.think ?? .3) + random() * (options.thinkSpread ?? .35);
    }
    game.step(1 / 60); game.drainEvents();
  }
  return { won: game.status === 'won', wave: game.wave, lives: game.lives, score: game.score, elapsed: Math.round(game.elapsed) };
}
module.exports = { play, plan, trace };
