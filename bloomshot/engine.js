(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BloomEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WIDTH = 420, HEIGHT = 560, SPEED = 430, RADIUS = 5.5;
  const BOUNDS = { left: 22, right: 398, top: 22, bottom: 540 };
  const GATE_COOLDOWN = .12, MAX_GATE_HOPS = 12, GATE_CLEARANCE = .1;
  const copy = value => JSON.parse(JSON.stringify(value));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function rulesFor(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const number = (name, fallback, min, max) => Number.isFinite(source[name]) ? clamp(Math.floor(source[name]), min, max) : fallback;
    return { shots: number('shots', 3, 1, 9), ballsPerShot: number('ballsPerShot', 3, 1, 5),
      guide: source.guide !== false, autoBurst: source.autoBurst !== false,
      ballLifetime: Number.isFinite(source.ballLifetime) ? clamp(source.ballLifetime, 1, 20) : 9 };
  }
  function gatesFor(raw) {
    if (!Array.isArray(raw)) return [];
    const candidates = [], counts = new Map();
    for (const gate of raw.slice(0, 32)) {
      if (!gate || typeof gate !== 'object' || typeof gate.id !== 'string' || !gate.id.trim() || gate.id.length > 64) continue;
      counts.set(gate.id, (counts.get(gate.id) || 0) + 1);
      const r = gate.r === undefined ? 18 : gate.r, angle = gate.angle === undefined ? 0 : gate.angle;
      if (typeof gate.pair !== 'string' || gate.pair === gate.id || !Number.isFinite(gate.x) || !Number.isFinite(gate.y) ||
          !Number.isFinite(r) || r < 10 || r > 40 || !Number.isFinite(angle)) continue;
      // Every exit direction must leave the entire ball inside the playfield.
      const margin = r + RADIUS * 2 + GATE_CLEARANCE;
      if (gate.x < BOUNDS.left + margin || gate.x > BOUNDS.right - margin ||
          gate.y < BOUNDS.top + margin || gate.y > BOUNDS.bottom - margin) continue;
      candidates.push({ id: gate.id, pair: gate.pair, x: gate.x, y: gate.y, r,
        angle: angle % (Math.PI * 2), lastUsed: -100 });
    }
    const unique = candidates.filter(gate => counts.get(gate.id) === 1);
    return unique.filter(gate => unique.some(other => other.id === gate.pair && other.pair === gate.id));
  }
  // Koi currents: rotated water lanes that steer a seed toward their flow
  // direction at a bounded turn rate. Speed never changes, so paths bend
  // readably instead of accelerating unpredictably.
  function currentsFor(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const lane of raw.slice(0, 16)) {
      if (!lane || typeof lane !== 'object') continue;
      const { x, y, length, width, angle } = lane, turn = lane.turn === undefined ? 2.4 : lane.turn;
      if (![x, y, length, width, angle, turn].every(Number.isFinite) || length < 30 || length > 600 || width < 16 || width > 200 || turn <= 0 || turn > 8) continue;
      out.push({ id: String(lane.id || 'lane-' + out.length), x, y, length, width, angle, turn, ux: Math.cos(angle), uy: Math.sin(angle) });
    }
    return out;
  }
  function laneAt(currents, x, y) {
    for (const lane of currents) {
      const dx = x - lane.x, dy = y - lane.y;
      if (Math.abs(dx * lane.ux + dy * lane.uy) <= lane.length / 2 && Math.abs(-dx * lane.uy + dy * lane.ux) <= lane.width / 2) return lane;
    }
    return null;
  }
  function steer(vx, vy, lane, dt) {
    const current = Math.atan2(vy, vx), delta = Math.atan2(Math.sin(lane.angle - current), Math.cos(lane.angle - current));
    const turned = current + clamp(delta, -lane.turn * dt, lane.turn * dt), speed = Math.hypot(vx, vy);
    return { x: Math.cos(turned) * speed, y: Math.sin(turned) * speed };
  }
  function gateTransfer(gates, entry, vx, vy) {
    const exit = gates.find(gate => gate.id === entry.pair && gate.pair === entry.id);
    const speed = Math.hypot(vx, vy);
    if (!exit || !Number.isFinite(speed) || speed < 1e-9) return null;
    const turn = exit.angle - entry.angle, c = Math.cos(turn), s = Math.sin(turn);
    const rx = vx * c - vy * s, ry = vx * s + vy * c;
    const offset = exit.r + RADIUS + GATE_CLEARANCE;
    return { exit, vx: rx, vy: ry, x: exit.x + rx / speed * offset, y: exit.y + ry / speed * offset };
  }
  function circleHit(p, d, c, radius) {
    const mx = p.x - c.x, my = p.y - c.y;
    const a = d.x * d.x + d.y * d.y;
    const b = 2 * (mx * d.x + my * d.y);
    const z = mx * mx + my * my - radius * radius;
    if (a < 1e-12 || b >= 0) return null;
    const discriminant = b * b - 4 * a * z;
    if (discriminant < 0) return null;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (t < -1e-7 || t > 1) return null;
    const at = Math.max(0, t), hx = p.x + d.x * at - c.x, hy = p.y + d.y * at - c.y;
    const length = Math.hypot(hx, hy) || 1;
    return { t: at, nx: hx / length, ny: hy / length };
  }
  function capsuleHit(p, d, bumper, radius) {
    const ux = Math.cos(bumper.angle), uy = Math.sin(bumper.angle);
    const nx = -uy, ny = ux, half = bumper.length / 2;
    const a = { x: bumper.x - ux * half, y: bumper.y - uy * half };
    const b = { x: bumper.x + ux * half, y: bumper.y + uy * half };
    let best = null;
    for (const end of [a, b]) {
      const hit = circleHit(p, d, end, radius);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    const perpendicular = (p.x - a.x) * nx + (p.y - a.y) * ny;
    const velocity = d.x * nx + d.y * ny;
    if (Math.abs(velocity) > 1e-8) for (const side of [-1, 1]) {
      if (velocity * side >= 0) continue;
      const t = (side * radius - perpendicular) / velocity;
      if (t < 0 || t > 1) continue;
      const projection = (p.x + d.x * t - a.x) * ux + (p.y + d.y * t - a.y) * uy;
      if (projection >= 0 && projection <= bumper.length && (!best || t < best.t)) best = { t, nx: nx * side, ny: ny * side };
    }
    return best;
  }
  function earliest(state, p, d, includeBuds = true) {
    let hit = null;
    const consider = (candidate, kind, item) => {
      if (candidate && candidate.t >= 0 && candidate.t <= 1 && (!hit || candidate.t < hit.t)) hit = { ...candidate, kind, item };
    };
    if (d.x < 0) consider({ t: (BOUNDS.left + RADIUS - p.x) / d.x, nx: 1, ny: 0 }, 'wall');
    if (d.x > 0) consider({ t: (BOUNDS.right - RADIUS - p.x) / d.x, nx: -1, ny: 0 }, 'wall');
    if (d.y < 0) consider({ t: (BOUNDS.top + RADIUS - p.y) / d.y, nx: 0, ny: 1 }, 'wall');
    // A one-way petal lets seeds fly up through it and only catches the ones coming down.
    for (const bumper of state.bumpers) if (!bumper.oneWay || d.y > 0) consider(capsuleHit(p, d, bumper, RADIUS + 6), 'bumper', bumper);
    if (includeBuds) for (const bud of state.buds) if (!bud.bloomed) consider(circleHit(p, d, bud, RADIUS + bud.r), 'bud', bud);
    if ((p.gateCooldown || 0) <= 1e-9 && (p.gateHops || 0) < MAX_GATE_HOPS) {
      for (const gate of state.gates || []) consider(circleHit(p, d, gate, gate.r), 'gate', gate);
    }
    return hit;
  }
  class Game {
    constructor(level) {
      this.level = copy(level);
      this.rules = rulesFor(level.rules);
      this.starPar = level.rules && Number.isFinite(level.par) ? clamp(Math.floor(level.par), 1, this.rules.shots) : 1;
      this.gates = gatesFor(level.gates); this.gatePasses = 0;
      this.currents = currentsFor(level.currents); this.currentTime = 0; this.currentRides = 0;
      this.speed = clamp(420 + ((Number(level.difficulty || level.sourceLevelId || level.id) || 1) - 1) * 10, 420, 620);
      this.buds = copy(level.buds).map(bud => ({ ...bud, r: bud.r || 13, hp: bud.hp || 1, maxHp: bud.hp || 1, hitAt: -100, bloomed: false, bloomAt: -100 }));
      this.bumpers = copy(level.bumpers || []);
      this.launcher = copy(level.launcher || { x: 210, y: 498 });
      this.ball = null; this.balls = []; this.pendingBalls = []; this.time = 0; this.shotTime = 0;
      this.shotsLeft = this.rules.shots; this.status = 'aiming'; this.score = 0;
      this.combo = 0; this.bestCombo = 0; this.rotationUsed = false;
      this.pending = []; this.events = []; this.particles = []; this.floaters = [];
      this.aim = []; this.shotNumber = 0; this.lastShotBlooms = 0;
      this.feverTime = 0; this.guideCharge = this.rules.guide ? 1 : 0; this.guideTarget = null; this.ballSerial = 0;
      this.fixedAccumulator = 0; this.bonusUsed = false;
    }
    event(type, extra = {}) { this.events.push({ type, time: this.time, ...extra }); }
    drainEvents() { return this.events.splice(0); }
    get bloomedCount() { return this.buds.filter(bud => bud.bloomed).length; }
    get stars() {
      const spent = this.rules.shots - this.shotsLeft;
      return this.status === 'won' ? (spent <= this.starPar ? 3 : spent <= this.starPar + 1 ? 2 : 1) : 0;
    }
    rotate(id) {
      if (this.status !== 'aiming' || this.rotationUsed) return false;
      const bumper = this.bumpers.find(item => item.id === id);
      if (!bumper) return false;
      bumper.fromAngle = bumper.angle; bumper.angle = (bumper.angle + Math.PI / 2) % (Math.PI * 2); bumper.rotateAt = this.time;
      this.rotationUsed = true;
      this.event('rotate', { bumper });
      return true;
    }
    fire(dx, dy) {
      if (this.status !== 'aiming' || this.shotsLeft <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6 || dy / length > -0.12) return false;
      const angle = Math.atan2(dy, dx);
      this.balls = []; this.pendingBalls = [];
      for (let i = 0; i < this.rules.ballsPerShot; i++) {
        const spread = (i - (this.rules.ballsPerShot - 1) / 2) * 0.022;
        this.pendingBalls.push({ when: this.time + i * .12, x: this.launcher.x, y: this.launcher.y, angle: angle + spread, type: ['coral', 'gold', 'lilac'][i % 3] });
      }
      this.guideCharge = this.rules.guide ? 1 : 0; this.guideTarget = null; this.bonusUsed = false;
      this.shotsLeft--; this.shotNumber++; this.shotTime = 0; this.combo = 0; this.lastShotBlooms = 0;
      this.status = 'flying'; this.aim = [];
      this.event('launch');
      return true;
    }
    guide(point) {
      if (!this.rules.guide) { this.guideTarget = null; this.guideCharge = 0; return; }
      this.guideTarget = this.status === 'flying' && this.guideCharge > 0 && point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: clamp(point.x, 30, 390), y: clamp(point.y, 30, 470) } : null;
    }
    spawnBall(spec) {
      if (this.balls.length >= 5) return;
      this.balls.push({ id: ++this.ballSerial, x: spec.x, y: spec.y, r: RADIUS, vx: Math.cos(spec.angle) * this.speed, vy: Math.sin(spec.angle) * this.speed, speed: this.speed, trail: [], age: 0, gateCooldown: 0, gateHops: 0, type: spec.type || 'gold' });
      this.ball = this.balls[0] || null;
    }
    strike(bud, chain = false) {
      if (!bud || bud.bloomed) return;
      if (bud.hp > 1) { bud.hp--; bud.hitAt = this.time; this.score += 50; this.event('crack', { bud, chain }); return; }
      this.bloom(bud, chain);
    }
    bloom(bud, chain = false) {
      if (!bud || bud.bloomed) return;
      bud.bloomed = true; bud.bloomAt = this.time;
      this.combo++; this.lastShotBlooms++; this.bestCombo = Math.max(this.bestCombo, this.combo);
      const gain = 100 * Math.min(10, 1 + Math.floor((this.combo - 1) / 5));
      this.score += gain;
      this.event('bloom', { bud, gain, combo: this.combo, chain });
      if (this.rules.autoBurst && this.combo >= 12 && !this.bonusUsed && this.status === 'flying') {
        this.bonusUsed = true;
        [-2.2, -.94].forEach((angle, i) => {
          if (this.balls.length + this.pendingBalls.length < 5) this.pendingBalls.push({ when: this.time + i * .09, x: bud.x, y: bud.y, angle, type: bud.type });
        });
        this.event('burst', { bud, combo: this.combo });
      }
      if (this.combo % 12 === 0) { this.feverTime = 2.4; this.event('fever', { combo: this.combo }); }
      if (bud.group && !chain) {
        const siblings = this.buds.filter(other => other.group === bud.group && !other.bloomed && !this.pending.some(item => item.id === other.id));
        siblings.sort((a, b) => Math.hypot(a.x - bud.x, a.y - bud.y) - Math.hypot(b.x - bud.x, b.y - bud.y));
        siblings.forEach((other, index) => this.pending.push({ id: other.id, when: this.time + (index + 1) * 0.10 }));
      }
    }
    finishShot() {
      this.ball = null; this.balls = []; this.pendingBalls = []; this.rotationUsed = false; this.guideTarget = null;
      if (this.bloomedCount === this.buds.length) this.win();
      else if (this.pending.length > 0) this.status = 'flying';
      else if (this.shotsLeft <= 0 && this.pending.length === 0) { this.status = 'lost'; this.event('lost'); }
      else { this.status = 'aiming'; this.event('ready', { blooms: this.lastShotBlooms }); }
    }
    win() {
      if (this.status === 'won') return;
      this.status = 'won'; this.ball = null; this.balls = []; this.pendingBalls = []; this.guideTarget = null; this.aim = [];
      const bonus = this.shotsLeft * 500;
      this.score += bonus;
      this.event('won', { bonus, stars: this.stars });
    }
    step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      this.fixedAccumulator += Math.min(dt, .25);
      while (this.fixedAccumulator + 1e-10 >= 1 / 120) {
        this._tick(1 / 120);
        this.fixedAccumulator = Math.max(0, this.fixedAccumulator - 1 / 120);
      }
    }
    _tick(dt) {
      this.time += dt;
      this.feverTime = Math.max(0, this.feverTime - dt);
      const due = this.pending.filter(item => item.when <= this.time);
      this.pending = this.pending.filter(item => item.when > this.time);
      due.forEach(item => this.strike(this.buds.find(bud => bud.id === item.id), true));
      if (this.bloomedCount === this.buds.length && this.buds.length > 0 && this.status !== 'won') this.win();
      if (this.status !== 'flying') return;
      if (!this.rules.guide) { this.guideTarget = null; this.guideCharge = 0; }
      const launches = this.pendingBalls.filter(item => item.when <= this.time);
      this.pendingBalls = this.pendingBalls.filter(item => item.when > this.time);
      launches.forEach(spec => this.spawnBall(spec));
      if (this.guideTarget && this.guideCharge > 0) {
        this.guideCharge = Math.max(0, this.guideCharge - dt / 3);
        if (this.guideCharge === 0) this.guideTarget = null;
      }
      if (!this.balls.length && !this.pendingBalls.length && !this.pending.length) { this.finishShot(); return; }
      this.shotTime += dt;
      for (const ball of this.balls) {
      ball.age += dt;
      if (this.guideTarget && this.guideCharge > 0) {
        const dx = this.guideTarget.x - ball.x, dy = this.guideTarget.y - ball.y;
        if (Math.hypot(dx, dy) > 24) {
          const current = Math.atan2(ball.vy, ball.vx), desired = Math.atan2(dy, dx);
          const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
          const steered = current + clamp(delta, -1.7 * dt, 1.7 * dt);
          ball.vx = Math.cos(steered) * ball.speed; ball.vy = Math.sin(steered) * ball.speed;
        }
      }
      if (this.currents.length) {
        const lane = laneAt(this.currents, ball.x, ball.y);
        if (lane) { const v = steer(ball.vx, ball.vy, lane, dt); ball.vx = v.x; ball.vy = v.y; this.currentTime += dt; lane.lastUsed = this.time; }
        if (lane && lane !== ball.lane) { this.currentRides++; this.event('current', { lane: lane.id, x: ball.x, y: ball.y, angle: lane.angle }); }
        ball.lane = lane;
      }
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 22) ball.trail.shift();
      let remaining = dt;
      for (let i = 0; i < 5 && remaining > 1e-7; i++) {
        const duration = ball.gateCooldown > 1e-9 ? Math.min(remaining, ball.gateCooldown) : remaining;
        const d = { x: ball.vx * duration, y: ball.vy * duration };
        const hit = earliest(this, ball, d);
        if (!hit) {
          ball.x += d.x; ball.y += d.y;
          ball.gateCooldown = Math.max(0, (ball.gateCooldown || 0) - duration);
          remaining -= duration; continue;
        }
        ball.x += d.x * hit.t; ball.y += d.y * hit.t;
        ball.gateCooldown = Math.max(0, (ball.gateCooldown || 0) - duration * hit.t);
        remaining = duration === remaining ? remaining * Math.max(0, 1 - hit.t) : remaining - duration * hit.t;
        if (hit.kind === 'gate') {
          const transfer = gateTransfer(this.gates, hit.item, ball.vx, ball.vy);
          if (transfer) {
            ball.x = transfer.x; ball.y = transfer.y; ball.vx = transfer.vx; ball.vy = transfer.vy;
            ball.trail = []; ball.gateCooldown = GATE_COOLDOWN; ball.gateHops = (ball.gateHops || 0) + 1;
            this.gatePasses++; hit.item.lastUsed = this.time; transfer.exit.lastUsed = this.time;
            this.event('gate', { entry: hit.item, exit: transfer.exit, x: transfer.exit.x, y: transfer.exit.y });
          }
          continue;
        }
        if (hit.kind === 'bud') this.strike(hit.item);
        else this.event('bounce', { kind: hit.kind, x: ball.x, y: ball.y });
        const dot = ball.vx * hit.nx + ball.vy * hit.ny;
        ball.vx -= 2 * dot * hit.nx; ball.vy -= 2 * dot * hit.ny;
        ball.x += hit.nx * 0.08; ball.y += hit.ny * 0.08;
      }
      }
      if (this.bloomedCount === this.buds.length) { this.win(); return; }
      this.balls = this.balls.filter(ball => ball.y <= BOUNDS.bottom + RADIUS && ball.age < this.rules.ballLifetime);
      this.ball = this.balls[0] || null;
      if ((!this.balls.length && !this.pendingBalls.length && !this.pending.length) || (this.shotTime >= this.rules.ballLifetime + 3 && this.pending.length === 0)) this.finishShot();
    }
    trace(dx, dy) {
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-6 || dy >= -1) return [];
      const length = Math.hypot(dx, dy);
      let direction = { x: dx / length, y: dy / length };
      let p = { ...this.launcher, gateCooldown: 0, gateHops: 0 };
      const points = [{ x: p.x, y: p.y }];
      let distance = 350;
      const flowing = this.currents.length > 0, stepLength = this.speed / 120;
      for (let i = 0; i < (flowing ? 400 : this.gates.length ? 32 : 2) && distance > 1e-7; i++) {
        if (flowing) {
          // Mirror the per-tick steering so the aim line bends exactly like the seed.
          const lane = laneAt(this.currents, p.x, p.y);
          if (lane) { const v = steer(direction.x, direction.y, lane, 1 / 120); direction = v; }
        }
        let segment = p.gateCooldown > 1e-9 ? Math.min(distance, p.gateCooldown * this.speed) : distance;
        if (flowing) segment = Math.min(segment, stepLength);
        const d = { x: direction.x * segment, y: direction.y * segment };
        const hit = earliest(this, p, d);
        if (!hit) {
          p.x += d.x; p.y += d.y;
          if (!flowing || i % 3 === 0 || distance - segment <= 1e-7) points.push({ x: p.x, y: p.y });
          distance -= segment; p.gateCooldown = Math.max(0, p.gateCooldown - segment / this.speed); continue;
        }
        p.x += d.x * hit.t; p.y += d.y * hit.t;
        points.push({ x: p.x, y: p.y });
        if (hit.kind === 'bud') break;
        distance = segment === distance ? distance * (1 - hit.t) : distance - segment * hit.t;
        p.gateCooldown = Math.max(0, p.gateCooldown - segment * hit.t / this.speed);
        if (hit.kind === 'gate') {
          const transfer = gateTransfer(this.gates, hit.item, direction.x, direction.y);
          if (!transfer) break;
          p.x = transfer.x; p.y = transfer.y; p.gateCooldown = GATE_COOLDOWN; p.gateHops++;
          direction = { x: transfer.vx, y: transfer.vy };
          points.push({ x: p.x, y: p.y, move: true }); continue;
        }
        const dot = direction.x * hit.nx + direction.y * hit.ny;
        direction = { x: direction.x - 2 * dot * hit.nx, y: direction.y - 2 * dot * hit.ny };
        p.x += hit.nx * 0.1; p.y += hit.ny * 0.1;
      }
      return points;
    }
    snapshot() {
      return { level: this.level.id, status: this.status, score: this.score, shotsLeft: this.shotsLeft, balls: this.balls.length, combo: this.combo, guideCharge: this.guideCharge, buds: this.buds.map(({ id, bloomed }) => ({ id, bloomed })), rotationUsed: this.rotationUsed, gatePasses: this.gatePasses };
    }
  }
  return { Game, WIDTH, HEIGHT, SPEED, RADIUS, BOUNDS, GATE_COOLDOWN, circleHit, capsuleHit, earliest, clamp, laneAt, currentsFor, gatesFor, steer, gateTransfer };
});
