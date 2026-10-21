'use strict';
// A practice player for the level campaign. It traces each candidate angle through the board as it stands,
// picks the shot whose first bud hit matters most (lowest, fastest, crowns, puffcaps, the boss) and fires
// with a little aim error, the way a good human would. Used to check every level can be cleared and that
// later levels are harder. Usage: play(levelId, { seed, noise }) -> { won, wave, lives, score, elapsed, supers, tricks, rate }, rate being
// shots a second outside Super Bloom. mash(levelId, { seed, mode }) is the opposite player: it taps every .12 s whatever
// the launcher shows, aiming anywhere upward (mode 'wild'), wiggling across the middle ('sweep') or roughly, within
// 12 degrees, at the lowest flower ('lazy'). -> { won, wave, lives, shots, taps, dry, rate }, dry being taps on an empty pod.
const Engine = require('../engine.js');
const { RushGame, bossMotion } = require('../rush.js');
const Depths = require('../depths.js');
const Bosses = require('../bosses.js');
const Foes = require('../foes.js');
// Each forecast slice holds x, y, r and flags (1: hidden, like a mole underground; 2: a ghost seeds pass through) at that moment.
const TRACE_STEPS = 90, TRACE_DT = 1 / 60, STRIDE = 4;

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function plan(id) { const level = Depths.level(id); return { id, name: level.name, waves: Depths.waveCount, wave: n => Depths.wave(id, n) }; }

// Follows one shot until it first touches a bud (or gives up), bouncing off walls, the leaf and rocks, bending
// in currents and passing through tunnels the way the game does.
function prepareTrace(game) {
  // A foe that moves on its own (a rolling rolypoly, a mole about to pop up) is forecast by foes.js, hidden or not.
  const movers = new Set(game.foeWave ? Foes.moves(game) : []), foreseen = bud => movers.has(bud);
  const originals = game.buds.filter(bud => !bud.bloomed && (!bud.hidden || foreseen(bud)) && bud.visible !== false);
  const rich = Boolean(game.bossState), moving = [], predicted = originals.map(bud => {
    // A flower a guardian carries (Rootknot's carousel) moves with the guardian's own forecast.
    const boss = bud.boss || rich && (bud.bossPart || bud.carried);
    if (!boss && !foreseen(bud)) return bud;
    const copy = { ...bud }, future = new Float64Array(TRACE_STEPS * STRIDE);
    moving.push({ original: bud, bud: copy, future, foe: !boss }); return copy;
  });
  const out = { x: 0, y: 0, r: 0, flags: 0 };
  // All angle candidates share these visible-position predictions. No next attack, shuffle, revival or
  // future vulnerability is simulated; the module caps predictions at an advertised transition.
  for (let step = 0; moving.length && step < TRACE_STEPS; step++) {
    const seconds = step * TRACE_DT, poses = rich ? Bosses.predictVisible(game, seconds) : null;
    for (const m of moving) {
      const b = m.original, at = step * STRIDE;
      if (m.foe) {
        Foes.predict(game, b, seconds, out);
        m.future[at] = out.x; m.future[at + 1] = out.y; m.future[at + 2] = out.r || b.r; m.future[at + 3] = out.flags;
        continue;
      }
      let pos = poses && poses.get(b.id);
      if (!pos) {
        const motion = bossMotion(b.bossKind, game.time - game.waveStart + seconds, b.sway || 0, b.swayW || 1);
        pos = { x: b.baseX + motion.x, y: b.y + (game.lullaby > seconds ? 0 : game.descentSpeed * b.fall * Math.max(0, seconds - game.lullaby)) + motion.y - (b.bossBob || 0), r: b.r };
      }
      m.future[at] = pos.x; m.future[at + 1] = pos.y; m.future[at + 2] = pos.r || b.r;
    }
  }
  const targets = rich ? Bosses.targets(game) : [], priorities = new Map(targets.map(t => [t.bud.id, t.priority]));
  return { state: { bumpers: game.bumpers, buds: predicted, gates: game.gates || [] }, moving, targets, priorities, rich, currents: game.currents || [] };
}
function trace(game, angle, bounces = 3, prepared = prepareTrace(game)) {
  const p = { x: game.launcher.x, y: game.launcher.y, gateCooldown: 0, gateHops: 0 }, dt = TRACE_DT;
  let vx = Math.cos(angle) * game.speed, vy = Math.sin(angle) * game.speed;
  const { state, moving, currents } = prepared;
  for (let step = 0; step < TRACE_STEPS; step++) {
    for (const m of moving) {
      const at = step * STRIDE, flags = m.future[at + 3];
      m.bud.x = m.future[at]; m.bud.y = m.future[at + 1]; m.bud.r = m.future[at + 2]; m.bud.hidden = Boolean(flags & 1); m.bud.ghost = Boolean(flags & 2);
    }
    const lane = currents.length && Engine.laneAt(currents, p.x, p.y);
    if (lane) { const v = Engine.steer(vx, vy, lane, dt); vx = v.x; vy = v.y; }
    let remaining = dt;
    for (let i = 0; i < 5 && remaining > 1e-7; i++) {
      const duration = p.gateCooldown > 1e-9 ? Math.min(remaining, p.gateCooldown) : remaining;
      const d = { x: vx * duration, y: vy * duration }, hit = Engine.earliest(state, p, d);
      if (!hit) { p.x += d.x; p.y += d.y; p.gateCooldown = Math.max(0, p.gateCooldown - duration); remaining -= duration; continue; }
      p.x += d.x * hit.t; p.y += d.y * hit.t;
      const time = step * dt + dt - remaining + duration * hit.t;
      p.gateCooldown = Math.max(0, p.gateCooldown - duration * hit.t);
      remaining -= duration * hit.t;
      if (hit.kind === 'bud') return { bud: { ...hit.item }, nx: hit.nx, ny: hit.ny, time, gateHops: p.gateHops, mirror: p.mirrorAt != null && time - p.mirrorAt <= 1.2 };
      if (hit.kind === 'gate') {
        const transfer = Engine.gateTransfer(state.gates, hit.item, vx, vy);
        if (!transfer) return null;
        p.x = transfer.x; p.y = transfer.y; vx = transfer.vx; vy = transfer.vy; p.gateCooldown = Engine.GATE_COOLDOWN; p.gateHops++;
        continue;
      }
      if (--bounces < 0) return null;
      if (hit.item && hit.item.bossMirror) p.mirrorAt = time; // a bank off Crystal Heart's mirror: a Mirror shot if it reaches the heart in 1.2 s
      const dot = vx * hit.nx + vy * hit.ny; vx -= 2 * dot * hit.nx; vy -= 2 * dot * hit.ny;
      p.x += hit.nx * .08; p.y += hit.ny * .08;
    }
    if (p.y > Engine.BOUNDS.bottom) return null;
  }
  return null;
}
function value(game, hit, timing, prepared) {
  const bud = hit.bud;
  if (prepared && prepared.rich && (bud.boss || bud.bossPart) && !Bosses.canHit(game, bud, hit, { gateHops: hit.gateHops, type: game.nextType, mirrorAt: hit.mirror ? 0 : null })) return -1;
  if (bud.bossPart === 'satellite' && bud.lit === false) return -1;
  // A foe knows its own rules: a decoy is never worth a seed, and some shots are better than others.
  if (bud.decoy) return -1;
  const foe = game.foeWave ? Foes.value(game, hit, prepared) : 0;
  if (foe === -1) return -1;
  if (bud.shield && hit.ny > .28) return -1;
  // A shell keeps turning while the shot flies, so check where its opening will be on arrival.
  if (bud.shell && !(prepared && prepared.rich && (bud.boss || bud.bossPart))) {
    const a = bud.shellAngle + bud.shellSpin * (hit.time + .03);
    if (hit.nx * Math.cos(a) + hit.ny * Math.sin(a) < .34 + timing) return -1;
  }
  const fall = Number.isFinite(bud.fall) ? Math.max(.15, bud.fall) : 1, danger = (bud.y + bud.r) / game.dangerY * fall;
  // Tactical parts get a soft bonus; an escort at the line still outranks a distant weakspot.
  const tactical = prepared && prepared.priorities.get(bud.id) || 0;
  let safety = 0, opportunity = 0;
  if (prepared && prepared.rich) {
    // The visible weakspots repay a successful hit with more damage or stop a displayed healing vine.
    // Keep that benefit soft, so an ordinary escort about to cross the line can still take priority.
    if (bud.bossPart === 'lantern' && bud.lit !== false) opportunity = 30;
    else if (bud.healing) opportunity = 20;
    else if (hit.mirror && bud.bossPart === 'heart' && bud.real) opportunity = 30; // Crystal Heart's Mirror shot lands double
    else if (bud.boss) {
      const s = game.bossState;
      if (bud.bossKind === 'geode' || bud.bossKind === 'sunny' && s.mode === 'dizzy' || bud.bossKind === 'fossil' && s.lockStage === 1 || bud.bossKind === 'core' && s.phase === 2) opportunity = 20;
      if (bud.bossKind === 'ember') opportunity = hit.gateHops > 0 ? 30 : s.mode === 'dive' ? 20 : 0;
    }
  }
  if (prepared && prepared.rich && bud.boss && bud.bossKind === 'fossil') {
    // Aim toward the center of the visible gaps, rather than grazing the legal edge. This only ranks
    // already legal shots; the actual angular velocities, aim error and game armor remain unchanged.
    const s = game.bossState, lockSpin = Number.isFinite(s.lockSpin) ? s.lockSpin : .52;
    const mouth = bud.shellAngle + bud.shellSpin * hit.time, inner = s.lockAngle + lockSpin * hit.time;
    const mouthDot = hit.nx * Math.cos(mouth) + hit.ny * Math.sin(mouth);
    const innerDot = game.bossState.lockStage === 0 ? 1 : hit.nx * Math.cos(inner) + hit.ny * Math.sin(inner);
    safety = 24 * Math.max(0, Math.min(1, mouthDot, innerDot) - .25);
  }
  return danger * 100 + Math.max(0, Math.min(95, tactical)) * .6 + safety + opportunity + (bud.relay ? 30 : 0) + (bud.puff ? 45 : 0) + (bud.boss ? 25 : 0) + (bud.regrowAt ? 40 : 0) + (bud.gem ? 15 : 0) + foe - hit.time * 20;
}
function play(levelId, options = {}) {
  const random = rng(options.seed || 1), noise = options.noise ?? 1.4;
  const game = new RushGame({ plan: plan(levelId), startWave: options.startWave || 1 });
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += random(); return (s - 3) / Math.sqrt(.5); };
  let think = 0, shots = 0, calm = 0, bossSeconds = 0, bossShots = 0, warnings = 0, livesLost = 0, bossLivesLost = 0, bossKillSeconds = null, bossReached = false, bossGuardEvents = 0;
  const maxTime = options.maxTime ?? 900;
  for (let t = 0; t < maxTime && !game.over; t += 1 / 60) {
    if (game.started && game.superBloom <= 0) calm += 1 / 60;
    if (game.started && game.bossWave) bossSeconds += 1 / 60;
    think -= 1 / 60;
    if (game.splitReady && random() < .5) game.split();
    // Like a person, it waits for a seed in the pod (and room in the air) instead of tapping into an empty one.
    if (think <= 0 && game.canFire) {
      let best = null;
      const prepared = prepareTrace(game);
      const angles = []; for (let deg = -170; deg <= -10; deg += options.angleStep ?? 2.5) angles.push(deg * Math.PI / 180);
      // Visible small parts deserve the same direct shot a player can line up by eye. Lead only the
      // current observed motion using the cached trajectory, and refine locally without an oracle.
      for (const target of prepared.targets.slice(0, 12)) {
        const moving = prepared.moving.find(m => m.original.id === target.bud.id); let x = target.bud.x, y = target.bud.y;
        if (moving) {
          const seconds = Math.hypot(x - game.launcher.x, y - game.launcher.y) / game.speed, at = Math.min(TRACE_STEPS - 1, Math.round(seconds / TRACE_DT)) * STRIDE;
          x = moving.future[at]; y = moving.future[at + 1];
        }
        const direct = Math.atan2(y - game.launcher.y, x - game.launcher.x);
        if (direct > -Math.PI + .16 && direct < -.16) for (const offset of [-.8, 0, .8]) angles.push(direct + offset * Math.PI / 180);
      }
      for (const angle of angles) {
        const hit = trace(game, angle, options.bounces ?? 3, prepared);
        if (!hit) continue;
        const score = value(game, hit, options.timing ?? .1, prepared);
        if (score > 0 && (!best || score > best.score)) best = { angle, score };
      }
      if (best || !prepared.rich) {
        const angle = (best ? best.angle : -Math.PI / 2) + gauss() * noise * Math.PI / 180;
        const calmShot = game.superBloom <= 0;
        if (game.fire(Math.cos(angle), Math.sin(angle))) { if (calmShot) shots++; if (game.bossWave) bossShots++; }
        // A Super Bloom reloads fast and the shots fly through flowers, so the player fires quicker while it lasts.
        think = game.superBloom > 0 ? .12 + random() * .1 : (options.think ?? .3) + random() * (options.thinkSpread ?? .35);
      } else think = .12; // visible armor is shut: wait for an opening instead of wasting the pod
    }
    game.step(1 / 60);
    for (const event of game.drainEvents()) {
      if (event.type === 'bossWarning') warnings++;
      if (event.type === 'shield' && event.bud && (event.bud.boss || event.bud.bossPart)) bossGuardEvents++;
      if (event.type === 'life') { livesLost++; if (event.wave === game.finalWave && bossKillSeconds == null) bossLivesLost++; }
      if (event.type === 'boss') bossKillSeconds = bossSeconds;
    }
    if (game.bossWave) bossReached = true;
  }
  const won = game.status === 'won', S = won ? 3 - game.lives : 3 + (10 - game.wave);
  const bossState = game.bossState;
  return { won: game.status === 'won', wave: game.wave, lives: game.lives, score: game.score, elapsed: Math.round(game.elapsed),
    supers: game.superCount, tricks: game.tricks, rate: +(shots / Math.max(1, calm)).toFixed(2),
    elapsedExact: +game.elapsed.toFixed(3), S, livesLost, powersUsed: game.powersUsed || 0, timedOut: !game.over,
    shots: game.shotNumber, refunds: game.refunds || 0,
    bossReached, bossWon: bossKillSeconds != null || Boolean(game.bossDefeated), bossSeconds: +bossSeconds.toFixed(3),
    bossKillSeconds: bossKillSeconds == null ? null : +bossKillSeconds.toFixed(3), bossLivesLost,
    bossP: bossKillSeconds == null ? null : +(bossLivesLost + bossKillSeconds / 50).toFixed(4), bossShots, warnings,
    bossDiagnostics: bossState ? { kind: bossState.kind, mode: bossState.mode, hp: bossState.boss.hp, maxHp: bossState.boss.maxHp,
      hits: bossState.hits, guards: bossState.guards, guardEvents: bossGuardEvents, criticalHits: bossState.crits, heals: bossState.heals, summons: bossState.summons } : null };
}
function mash(levelId, options = {}) {
  const random = rng(options.seed || 1), mode = options.mode || 'wild', game = new RushGame({ plan: plan(levelId) });
  let next = 0, shots = 0, calmShots = 0, calm = 0, taps = 0, dry = 0, livesLost = 0;
  for (let t = 0; t < (options.maxTime ?? 900) && !game.over; t += 1 / 60) {
    const calmNow = !(game.superBloom > 0), before = game.shotNumber;
    if (game.started && calmNow) calm += 1 / 60;
    next -= 1 / 60;
    if (next <= 0) {
      let deg;
      if (mode === 'wild') deg = -150 + random() * 120;
      else if (mode === 'sweep') deg = -90 + Math.sin(t * 2.3) * 45 + (random() - .5) * 10;
      else if (mode === 'fixed') deg = options.angle ?? -150;
      else if (mode === 'banks') deg = taps % 2 ? (options.rightAngle ?? -30) : (options.leftAngle ?? -150);
      else if (mode === 'ricochet') deg = -90 + Math.sin(t * 2.3) * 75;
      else {
        const low = game.buds.filter(b => !b.bloomed && !b.gift).sort((a, b) => b.y - a.y)[0];
        deg = low ? Math.atan2(low.y - game.launcher.y, low.x - game.launcher.x) * 180 / Math.PI + (random() - .5) * 24 : -90;
      }
      game.fire(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)); next = options.gap || .12; taps++;
    }
    game.step(1 / 60);
    for (const event of game.drainEvents()) { if (event.type === 'dry') dry++; if (event.type === 'life') livesLost++; }
    // Counted from the shot number across the tap and the step: a kept tap launches inside step().
    shots += game.shotNumber - before; if (calmNow) calmShots += game.shotNumber - before;
  }
  const won = game.status === 'won';
  return { won, wave: game.wave, lives: game.lives, shots, taps, dry, rate: +(calmShots / Math.max(1, calm)).toFixed(2),
    S: won ? 3 - game.lives : 3 + (10 - game.wave), elapsedExact: +game.elapsed.toFixed(3), livesLost, powersUsed: game.powersUsed || 0,
    timedOut: !game.over, superBlooms: game.superCount, tricks: game.tricks, refunds: game.refunds || 0 };
}
module.exports = { play, mash, plan, trace, prepareTrace, value };
