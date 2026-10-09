(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.BloomRush = factory(root.BloomEngine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';
  if (!Engine || !Engine.Game) throw new Error('Load engine.js before rush.js.');
  const { Game, RADIUS, BOUNDS } = Engine;
  const TICK = 1 / 120, CAP = 5, FIRE_DELAY = 0.65, BALL_LIFE = 4, PUFF_REACH = 74;
  const PALETTES = ['gold', 'coral', 'lilac'];
  // Tempo: each wave adds a tenth to every score (up to x2 at wave 11) and reloads a little faster
  // (0.65 s down to 0.45 s by wave 9), so the run speeds up for the player as well as against them.
  const tempoFor = wave => Math.min(2, 1 + (wave - 1) * 0.1);
  const fireDelayFor = wave => Math.max(0.45, FIRE_DELAY - (wave - 1) * 0.025);
  // The opening curve is unchanged through wave 9; after it the flowers keep falling faster, so a
  // quick-firing player still meets rising pressure instead of a plateau.
  const descentFor = wave => wave <= 9 ? Math.min(32, 10.2 + (wave - 1) * 2.8) : Math.min(46, 32 + (wave - 9) * 1.8);

  function waveBuds(wave) {
    let anchors;
    if (wave === 1) anchors = [[116, 112], [304, 112], [116, 210], [304, 210]];
    else if (wave < 4) anchors = [[90, 109], [210, 109], [330, 109], [90, 211], [210, 211], [330, 211]];
    else anchors = [[90, 109], [210, 109], [330, 109], [90, 162], [210, 162], [330, 162], [135, 215], [285, 215]].slice(0, wave < 6 ? 7 : 8);
    const buds = [];
    anchors.forEach((anchor, gi) => {
      const offsets = (wave + gi) % 3 === 0 ? [[0, 17], [-18, -13], [18, -13]] : [[0, -17], [-18, 13], [18, 13]];
      offsets.forEach((offset, bi) => {
        const rawX = anchor[0] + offset[0];
        // Start with readable one-hit targets; half are layered by wave 6, two-thirds by wave 9.
        const layeredSixths = wave < 3 ? 0 : wave === 3 ? 1 : wave < 6 ? 2 : wave < 9 ? 3 : 4;
        const hp = (gi * 3 + bi + wave) % 6 < layeredSixths ? 2 : 1;
        buds.push({ id: 'rush-' + wave + '-' + gi + '-' + bi,
          group: 'rush-' + wave + '-' + gi, x: wave % 2 ? rawX : 420 - rawX,
          y: anchor[1] + offset[1], r: 11, type: PALETTES[(gi + wave - 1) % 3],
          relay: bi === 0, hp, maxHp: hp, hitAt: -100, bloomed: false, bloomAt: -100 });
      });
    });
    return buds;
  }

  class RushGame extends Game {
    // With a plan ({ id, name, waves, wave(n) }) the run is one campaign level: authored waves, a last
    // wave to clear, and stars for the lives kept. Without one it is endless Meadow Rush.
    constructor(options) {
      const plan = options && options.plan && typeof options.plan.wave === 'function' ? options.plan : null;
      const first = plan ? plan.wave(1) : null;
      super({ id: 'rush', name: plan ? plan.name : 'Meadow Rush', subtitle: 'Keep the glasshouse growing.',
        description: 'Tap to launch. Keep flowers above the line. Hit six buds to charge a manual split.',
        flowerId: null, par: 0, buds: first ? first.buds : waveBuds(1),
        bumpers: first ? first.bumpers : [{ id: 'petal', x: 210, y: 350, length: 64, angle: Math.PI / 4 }],
        launcher: { x: 210, y: 498 } });
      this.plan = plan; this.finalWave = plan ? plan.waves : Infinity; this.waveStart = 0;
      this.mode = 'rush'; this.wave = 1; this.lives = 3; this.dangerY = 448;
      this.started = false; this.elapsed = 0; this.fireCooldown = 0; this.rotateCooldown = 0;
      this.splitCharge = 0; this.directHits = 0; this.totalBlooms = 0;
      this.guideCharge = 0; this.guideTarget = null;
      this.waveBreaches = 0; this.nextWaveAt = null; this.lastHitAt = -100;
      this.speed = 460; this.descentSpeed = 10.2; this.waveFireDelay = FIRE_DELAY; this.waveHint = '';
      if (first) this._applyWave(first);
    }
    _applyWave(spec) {
      this.speed = spec.speed; this.descentSpeed = spec.descent; this.waveFireDelay = spec.fireDelay;
      this.waveHint = spec.hint || ''; this.bossWave = Boolean(spec.boss);
      this.drops = (spec.drops || []).map(drop => ({ at: drop.at, buds: drop.buds.map(bud => ({ ...bud })) }));
    }
    // Reinforcements arrive at the top once their time comes and there is room above the live buds.
    _dropIn(waveTime) {
      const next = this.drops && this.drops[0];
      if (!next) return;
      const live = this.buds.filter(bud => !bud.bloomed), bottom = Math.max(...next.buds.map(bud => bud.y + bud.r));
      if (!(waveTime >= next.at || !live.length) || !live.every(bud => bud.y - bud.r >= bottom + 12)) return;
      this.drops.shift();
      // Flowers that bloomed a while ago and still sit where the drop lands make way for it.
      this.buds = this.buds.filter(bud => !(bud.bloomed && this.time - bud.bloomAt > 1 && bud.y < bottom + 24));
      for (const bud of next.buds) this.buds.push({ ...bud, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: this.time });
      this.event('drop', { wave: this.wave, buds: next.buds.length });
    }
    get bloomedCount() { return this.totalBlooms || 0; }
    get stars() { return this.plan && this.status === 'won' ? Math.max(0, Math.min(3, this.lives)) : 0; }
    get over() { return this.status === 'lost' || this.status === 'won'; }
    get tempo() { return tempoFor(this.wave); }
    get splitReady() {
      return this.status === 'flying' && this.splitCharge >= 1 && this.balls.length > 0 && this.balls.length <= CAP - 2;
    }
    fire(dx, dy) {
      if (this.over || this.fireCooldown > 1e-7 || this.balls.length >= CAP || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6 || dy / length > -0.12) return false;
      this.started = true; this.status = 'flying';
      this.fireCooldown = this.plan ? this.waveFireDelay : fireDelayFor(this.wave); this.shotNumber++; this.aim = [];
      this.spawnBall({ x: this.launcher.x, y: this.launcher.y, angle: Math.atan2(dy, dx),
        speed: this.speed, type: PALETTES[(this.shotNumber - 1) % PALETTES.length] });
      this.event('launch', { wave: this.wave, count: 1 });
      return true;
    }
    spawnBall(spec) {
      if (this.balls.length >= CAP || this.over) return false;
      const speed = spec.speed || this.speed;
      this.balls.push({ id: ++this.ballSerial, x: spec.x, y: spec.y, r: RADIUS,
        vx: Math.cos(spec.angle) * speed, vy: Math.sin(spec.angle) * speed,
        speed, trail: [], age: 0, type: spec.type || 'gold' });
      this.ball = this.balls[0] || null;
      return true;
    }
    split() {
      if (!this.splitReady) return false;
      const source = this.balls.reduce((oldest, ball) => ball.age > oldest.age ? ball : oldest, this.balls[0]);
      const angle = Math.atan2(source.vy, source.vx);
      this.splitCharge = 0;
      for (const offset of [-0.30, 0.30]) this.spawnBall({ x: source.x, y: source.y,
        angle: angle + offset, speed: source.speed, type: source.type });
      this.event('split', { x: source.x, y: source.y, count: 2 });
      return true;
    }
    guide() { this.guideTarget = null; this.guideCharge = 0; }
    rotate(id) {
      if (this.over || this.rotateCooldown > 1e-7) return false;
      const bumper = this.bumpers.find(item => item.id === id && item.kind !== 'rock');
      if (!bumper) return false;
      bumper.fromAngle = bumper.angle;
      bumper.angle = (bumper.angle + Math.PI / 2) % (Math.PI * 2);
      bumper.rotateAt = this.time; this.rotationUsed = true; this.rotateCooldown = 2;
      this.event('rotate', { bumper });
      return true;
    }
    strike(bud, chain = false) {
      if (!bud || bud.bloomed || this.over) return;
      if (!chain) { this.directHits++; this.splitCharge = Math.min(1, this.splitCharge + 1 / 6); }
      if (this.splitCharge > 1 - 1e-8) this.splitCharge = 1;
      if (this.time - this.lastHitAt > 1.1) this.combo = 0;
      this.lastHitAt = this.time;
      if (bud.hp > 1) {
        const gain = Math.round(50 * this.tempo);
        bud.hp--; bud.hitAt = this.time; this.score += gain;
        this.event('crack', { bud, chain, gain });
        return;
      }
      this.bloom(bud, chain);
    }
    bloom(bud, chain = false) {
      if (!bud || bud.bloomed || this.over) return;
      if (this.time - this.lastHitAt > 1.1) this.combo = 0;
      this.lastHitAt = this.time;
      bud.bloomed = true; bud.bloomAt = this.time;
      this.totalBlooms++; this.lastShotBlooms++; this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const gain = Math.round(((chain ? 75 : 100) * Math.min(5, 1 + Math.floor((this.combo - 1) / 4)) + (bud.boss ? 1500 : 0)) * this.tempo);
      this.score += gain;
      this.event('bloom', { bud, gain, combo: this.combo, chain });
      const queued = other => this.pending.some(item => item.id === other.id);
      // A puffcap blooms everything within reach a moment later; puffcaps it reaches go off in turn.
      if (bud.puff) {
        const near = this.buds.filter(other => other !== bud && !other.bloomed && !queued(other) && Math.hypot(other.x - bud.x, other.y - bud.y) <= PUFF_REACH)
          .sort((a, b) => Math.hypot(a.x - bud.x, a.y - bud.y) - Math.hypot(b.x - bud.x, b.y - bud.y));
        near.forEach((other, index) => this.pending.push({ id: other.id, when: this.time + .09 + index * .045 }));
        this.event('puff', { bud, count: near.length });
      }
      // Blooming a boss blooms the rest of its wave.
      if (bud.boss) {
        this.buds.filter(other => !other.bloomed && !queued(other)).forEach((other, index) => this.pending.push({ id: other.id, when: this.time + .25 + index * .06, force: true }));
        this.event('boss', { bud, gain });
      }
      if (this.combo % 12 === 0) { this.feverTime = 1.6; this.event('fever', { combo: this.combo }); }
      if (bud.relay && !chain) {
        this.buds.filter(other => other.group === bud.group && !other.bloomed && !this.pending.some(item => item.id === other.id))
          .slice(0, 2).forEach((other, index) => this.pending.push({ id: other.id, when: this.time + (index + 1) * 0.11 }));
      }
    }
    _loadWave() {
      this.wave++; this.waveBreaches = 0; this.nextWaveAt = null; this.pending = []; this.waveStart = this.time;
      if (this.plan) {
        const spec = this.plan.wave(this.wave);
        const petal = this.bumpers.find(item => item.id === 'petal');
        this.buds = spec.buds.map(bud => ({ ...bud, hitAt: -100, bloomed: false, bloomAt: -100 }));
        // The leaf keeps the turn the player gave it; only its spot changes with the wave.
        this.bumpers = spec.bumpers.map(item => item.id === 'petal' && petal ? { ...item, angle: petal.angle } : { ...item });
        this._applyWave(spec);
      } else {
        this.buds = waveBuds(this.wave);
        this.speed = Math.min(650, 460 + (this.wave - 1) * 18);
        // Pressure keeps increasing after the opening waves; fixed hitboxes and four-second balls stay responsive.
        this.descentSpeed = descentFor(this.wave);
      }
      for (const bud of this.buds) bud.spawnAt = this.time;
      this.level.subtitle = 'Wave ' + this.wave + '. Keep the flowers above the line.';
      this.event('wave', { wave: this.wave, speed: this.speed, descentSpeed: this.descentSpeed, buds: this.buds.length, tempo: this.tempo, hint: this.waveHint, boss: Boolean(this.bossWave) });
    }
    _lose() {
      if (this.over) return;
      this.status = 'lost'; this.lives = 0; this.balls = []; this.ball = null;
      this.pending = []; this.pendingBalls = []; this.aim = []; this.nextWaveAt = null;
      this.event('lost', { wave: this.wave, elapsed: this.elapsed });
    }
    // Compatibility hooks never let the campaign's finish/win behavior end a Rush run.
    finishShot() { this.ball = this.balls[0] || null; }
    win() { if (this.started && !this.over && this.nextWaveAt === null) this.nextWaveAt = this.time + 0.7; }
    _clearLevel() {
      this.status = 'won'; this.balls = []; this.ball = null; this.pending = []; this.aim = []; this.nextWaveAt = null;
      this.event('won', { wave: this.wave, lives: this.lives, stars: this.stars, elapsed: this.elapsed });
    }
    step(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      this.fixedAccumulator += Math.min(dt, 0.25);
      while (this.fixedAccumulator + 1e-10 >= TICK) {
        this._tick(TICK);
        this.fixedAccumulator = Math.max(0, this.fixedAccumulator - TICK);
      }
    }
    _tick(dt) {
      this.time += dt;
      this.feverTime = Math.max(0, this.feverTime - dt);
      this.rotateCooldown = Math.max(0, this.rotateCooldown - dt);
      if (this.rotateCooldown <= 1e-7) this.rotationUsed = false;
      if (!this.started || this.over) return;
      this.elapsed += dt;
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      if (this.time - this.lastHitAt > 1.1) this.combo = 0;
      const due = this.pending.filter(item => item.when <= this.time);
      this.pending = this.pending.filter(item => item.when > this.time);
      due.forEach(item => {
        const bud = this.buds.find(other => other.id === item.id);
        if (bud && item.force) bud.hp = 1;
        this.strike(bud, true);
      });
      if (this.nextWaveAt !== null && this.time + 1e-10 >= this.nextWaveAt) this._loadWave();
      const waveTime = this.time - this.waveStart;
      for (const bud of this.buds) {
        bud.y += this.descentSpeed * (bud.fall || 1) * dt;
        if (bud.sway) bud.x = bud.baseX + Math.sin(waveTime * bud.swayW + bud.swayPhase) * bud.sway;
      }
      for (const rock of this.bumpers) if (rock.slide) rock.x = rock.baseX + Math.sin(waveTime * rock.slideW) * rock.slide;
      if (this.plan) this._dropIn(waveTime);

      const breached = new Set(this.buds.filter(bud => !bud.bloomed && bud.y + bud.r >= this.dangerY).map(bud => bud.group));
      for (const group of breached) {
        if (this.status === 'lost' || this.waveBreaches >= 3) break;
        const member = this.buds.find(bud => bud.group === group && !bud.bloomed);
        // A puffcap that drifts past the line just fizzles; it never costs a life.
        if (member.puff) { this.buds = this.buds.filter(bud => bud !== member); this.pending = this.pending.filter(item => item.id !== member.id); continue; }
        // A boss that reaches the line costs a life and climbs back to the top to try again.
        if (member.boss) {
          member.y = member.startY; member.spawnAt = this.time; this.waveBreaches++; this.lives--;
          this.event('life', { lives: this.lives, group, x: member.x, y: this.dangerY, wave: this.wave, boss: true });
          if (this.lives <= 0) { this._lose(); return; }
          continue;
        }
        const removed = new Set(this.buds.filter(bud => bud.group === group).map(bud => bud.id));
        this.buds = this.buds.filter(bud => bud.group !== group);
        this.pending = this.pending.filter(item => !removed.has(item.id));
        this.waveBreaches++; this.lives--;
        this.event('life', { lives: this.lives, group, x: member.x, y: this.dangerY, wave: this.wave });
        if (this.lives <= 0) { this._lose(); return; }
      }

      for (const ball of this.balls) {
        ball.age += dt;
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 22) ball.trail.shift();
        let remaining = dt;
        for (let i = 0; i < 5 && remaining > 1e-7; i++) {
          const d = { x: ball.vx * remaining, y: ball.vy * remaining };
          const hit = Engine.earliest(this, ball, d);
          if (!hit) { ball.x += d.x; ball.y += d.y; break; }
          ball.x += d.x * hit.t; ball.y += d.y * hit.t;
          // An acorn cup turns away any shot that meets it from below.
          if (hit.kind === 'bud' && hit.item.shield && hit.ny > .28) this.event('shield', { bud: hit.item, x: ball.x, y: ball.y });
          else if (hit.kind === 'bud') this.strike(hit.item);
          else this.event('bounce', { kind: hit.item && hit.item.kind === 'rock' ? 'rock' : hit.kind, x: ball.x, y: ball.y });
          const dot = ball.vx * hit.nx + ball.vy * hit.ny;
          ball.vx -= 2 * dot * hit.nx; ball.vy -= 2 * dot * hit.ny;
          ball.x += hit.nx * 0.08; ball.y += hit.ny * 0.08;
          remaining *= Math.max(0, 1 - hit.t);
        }
      }
      this.balls = this.balls.filter(ball => ball.y <= BOUNDS.bottom + RADIUS && ball.age < BALL_LIFE);
      this.ball = this.balls[0] || null;
      if (!this.buds.some(bud => !bud.bloomed) && this.pending.length === 0 && this.nextWaveAt === null && !(this.drops && this.drops.length)) {
        if (this.wave >= this.finalWave) { this._clearLevel(); return; }
        this.nextWaveAt = this.time + 0.7;
        this.event('cleared', { wave: this.wave, tempo: this.tempo, next: tempoFor(this.wave + 1) });
      }
    }
    snapshot() {
      return { mode: this.mode, level: this.plan ? this.plan.id : 'rush', status: this.status, score: this.score, finalWave: this.plan ? this.finalWave : null,
        wave: this.wave, tempo: this.tempo, lives: this.lives, elapsed: this.elapsed, started: this.started,
        speed: this.speed, descentSpeed: this.descentSpeed, balls: this.balls.length,
        fireCooldown: this.fireCooldown, rotateCooldown: this.rotateCooldown, splitCharge: this.splitCharge, splitReady: this.splitReady,
        combo: this.combo, bestCombo: this.bestCombo, bloomedCount: this.bloomedCount,
        directHits: this.directHits, rotationUsed: this.rotationUsed,
        buds: this.buds.map(({ id, x, y, hp, relay, bloomed, shield, puff, boss }) => ({ id, x, y, hp, relay, bloomed, shield: Boolean(shield), puff: Boolean(puff), boss: Boolean(boss) })),
        rocks: this.bumpers.filter(item => item.kind === 'rock').map(({ id, x, y, length, angle }) => ({ id, x, y, length, angle })) };
    }
  }
  return { RushGame, tempoFor, fireDelayFor, descentFor };
});
