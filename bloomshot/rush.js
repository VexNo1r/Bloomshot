(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.BloomRush = factory(root.BloomEngine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';
  if (!Engine || !Engine.Game) throw new Error('Load engine.js before rush.js.');
  const { Game, RADIUS, BOUNDS } = Engine;
  const TICK = 1 / 120, CAP = 5, FIRE_DELAY = 0.65, BALL_LIFE = 4, PUFF_REACH = 74;
  // A turning shell lets a shot through only near its opening (about 140 degrees of the circle). Briars
  // grow back unless their whole patch blooms within a few seconds of the first one.
  const SHELL_OPEN = .34, REGROW = 4;
  // Powerups. Sunburst blooms everything within reach of its first touch, Dandelion fans into three seeds,
  // Bee Line flies through flowers (cups and shells too) and blooms each one, Lullaby stops the falling for a
  // few seconds. A gift bubble holding one sometimes floats down in a wave; shooting it keeps the powerup.
  const SUN_REACH = 82, FAN = .2, LULLABY = 6, GIFT_CHANCE = .06, GIFT_R = 14;
  const SHOT_POWERS = ['sunburst', 'dandelion', 'beeline'], GIFTS = ['sunburst', 'dandelion', 'beeline', 'lullaby'];
  const open = bud => !bud.bloomed && !bud.gift;
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
      // Gifts need a source of chance from the app; without one (tests, the practice bot) none appear.
      this.random = options && typeof options.random === 'function' ? options.random : null;
      this.giftChance = this.random ? Number.isFinite(options.giftChance) ? options.giftChance : GIFT_CHANCE : 0;
      this.giftsLeft = 1; this.giftAt = null; this.armed = null; this.lullaby = 0; this.powersUsed = 0;
      if (first) this._applyWave(first);
      this._rollGift();
    }
    _applyWave(spec) {
      this.speed = spec.speed; this.descentSpeed = spec.descent; this.waveFireDelay = spec.fireDelay;
      this.waveHint = spec.hint || ''; this.bossWave = Boolean(spec.boss);
      this.drops = (spec.drops || []).map(drop => ({ at: drop.at, buds: drop.buds.map(bud => ({ ...bud })) }));
      // Water currents and tunnel mouths belong to the wave; the engine checks every one of them.
      this.currents = Engine.currentsFor(spec.currents || []); this.gates = Engine.gatesFor(spec.gates || []);
      this.regrowAfter = spec.regrow || REGROW; this.briarTimers = new Map();
    }
    // Reinforcements arrive at the top once their time comes and there is room above the live buds.
    _dropIn(waveTime) {
      const next = this.drops && this.drops[0];
      if (!next) return;
      const live = this.buds.filter(open), bottom = Math.max(...next.buds.map(bud => bud.y + bud.r));
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
      const power = this.armed, angle = Math.atan2(dy, dx), type = PALETTES[(this.shotNumber - 1) % PALETTES.length];
      this.armed = null;
      // A Dandelion fans out three seeds, even when that briefly goes past the usual five in the air.
      for (const offset of power === 'dandelion' ? [-FAN, 0, FAN] : [0]) this.spawnBall({ x: this.launcher.x, y: this.launcher.y,
        angle: angle + offset, speed: this.speed, type, power }, power === 'dandelion');
      this.event('launch', { wave: this.wave, count: power === 'dandelion' ? 3 : 1 });
      if (power) { this.powersUsed++; this.event('power', { power, x: this.launcher.x, y: this.launcher.y, angle }); }
      return true;
    }
    spawnBall(spec, force = false) {
      if ((!force && this.balls.length >= CAP) || this.over) return false;
      const speed = spec.speed || this.speed;
      this.balls.push({ id: ++this.ballSerial, x: spec.x, y: spec.y, r: RADIUS,
        vx: Math.cos(spec.angle) * speed, vy: Math.sin(spec.angle) * speed,
        speed, trail: [], age: 0, gateCooldown: 0, gateHops: 0, lane: null, type: spec.type || 'gold',
        power: SHOT_POWERS.includes(spec.power) ? spec.power : null, passed: [] });
      this.ball = this.balls[0] || null;
      return true;
    }
    // A shot powerup waits on the next shot; picking the same one again puts it back.
    arm(power) {
      if (this.over || !SHOT_POWERS.includes(power)) return false;
      this.armed = this.armed === power ? null : power;
      this.event('arm', { power: this.armed });
      return true;
    }
    lull() {
      if (!this.started || this.over || this.lullaby > 0) return false;
      this.lullaby = LULLABY; this.powersUsed++;
      this.event('power', { power: 'lullaby', x: 210, y: 250 });
      return true;
    }
    _rollGift() {
      this.giftAt = null;
      if (!this.random || this.giftsLeft <= 0 || this.bossWave) return;
      if (this.random() < this.giftChance) this.giftAt = 2 + this.random() * 4;
    }
    // The gift floats in near the top, clear of the flowers, and drifts down a little faster than they do.
    _spawnGift() {
      this.giftAt = null;
      const live = this.buds.filter(bud => !bud.bloomed);
      for (let tries = 0; tries < 10; tries++) {
        const x = 70 + this.random() * 280, y = 50;
        if (live.some(bud => Math.hypot(bud.x - x, bud.y - y) < bud.r + GIFT_R + 12)) continue;
        const power = GIFTS[Math.min(GIFTS.length - 1, Math.floor(this.random() * GIFTS.length))];
        this.giftsLeft--;
        this.buds.push({ id: `gift-${this.wave}-${this.ballSerial}`, group: `gift-${this.wave}`, x, y, baseX: x, startY: y, r: GIFT_R, type: 'gold',
          gift: power, relay: false, hp: 1, maxHp: 1, fall: 1.35, sway: 16, swayW: 1.4, swayPhase: this.random() * 6, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: this.time });
        this.event('giftAppear', { power, x, y });
        return;
      }
    }
    _collect(gift) {
      this.buds = this.buds.filter(bud => bud !== gift);
      this.event('gift', { power: gift.gift, x: gift.x, y: gift.y });
    }
    // A bee blooms whatever it touches; a big bloom only loses three of its rings to it.
    _beeHit(bud) {
      if (bud.boss) { for (let i = 0; i < 3 && !bud.bloomed; i++) this.strike(bud); }
      else { bud.hp = 1; this.strike(bud); }
      this.event('bee', { x: bud.x, y: bud.y });
    }
    // A sunburst opens at its first touch: that flower and every one within reach bloom in a ripple.
    _sunburst(ball, bud) {
      const x = ball.x, y = ball.y;
      ball.dead = true;
      const reach = this.buds.filter(other => open(other) && Math.hypot(other.x - x, other.y - y) <= SUN_REACH + other.r);
      for (const other of reach) {
        if (other.boss) { for (let i = 0; i < 4 && !other.bloomed; i++) this.strike(other); continue; }
        if (other === bud) { other.hp = 1; this.strike(other); continue; }
        if (!this.pending.some(item => item.id === other.id)) this.pending.push({ id: other.id, when: this.time + .05 + Math.hypot(other.x - x, other.y - y) / 700, force: true });
      }
      this.event('sunburst', { x, y, count: reach.length });
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
      if (bud.gift) { this._collect(bud); return; }
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
      // A geode cracks open into gems that still have to be bloomed (unless a big bloom sweeps it up).
      if (bud.geode && !bud.quiet) {
        const gems = this._gems(bud);
        this.buds.push(...gems);
        this.event('geode', { bud, count: gems.length });
      }
      if (bud.briar) this._briarBloomed(bud);
      // A puffcap blooms everything within reach a moment later; puffcaps it reaches go off in turn.
      if (bud.puff) {
        const near = this.buds.filter(other => other !== bud && open(other) && !queued(other) && Math.hypot(other.x - bud.x, other.y - bud.y) <= PUFF_REACH)
          .sort((a, b) => Math.hypot(a.x - bud.x, a.y - bud.y) - Math.hypot(b.x - bud.x, b.y - bud.y));
        near.forEach((other, index) => this.pending.push({ id: other.id, when: this.time + .09 + index * .045 }));
        this.event('puff', { bud, count: near.length });
      }
      // Blooming a boss blooms the rest of its wave.
      if (bud.boss) {
        this.buds.filter(other => open(other) && !queued(other)).forEach((other, index) => this.pending.push({ id: other.id, when: this.time + .25 + index * .06, force: true }));
        this.event('boss', { bud, gain });
      }
      if (this.combo % 12 === 0) { this.feverTime = 1.6; this.event('fever', { combo: this.combo }); }
      if (bud.relay && !chain) {
        this.buds.filter(other => other.group === bud.group && !other.bloomed && !this.pending.some(item => item.id === other.id))
          .slice(0, 2).forEach((other, index) => this.pending.push({ id: other.id, when: this.time + (index + 1) * 0.11 }));
      }
    }
    _gems(bud) {
      const spots = (bud.gems || 3) === 2 ? [[-20, 6], [20, 6]] : [[-22, 2], [22, 2], [0, 22]];
      return spots.map(([ox, oy], i) => {
        const x = Math.max(44, Math.min(376, bud.x + ox)), y = Math.min(this.dangerY - 40, bud.y + oy);
        return { id: bud.id + '-gem-' + i, group: bud.group, x, y, baseX: x, startY: y, r: 9, type: PALETTES[i % 3],
          relay: false, hp: 1, maxHp: 1, gem: true, shield: false, fall: bud.fall || 1, sway: 0, swayW: 0, swayPhase: 0,
          hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: this.time };
      });
    }
    // The first bloom in a briar patch starts its clock; blooming the whole patch stops it for good.
    _briarBloomed(bud) {
      const patch = this.buds.filter(other => other.group === bud.group);
      if (patch.every(other => other.bloomed)) {
        this.briarTimers.delete(bud.group); patch.forEach(other => { other.regrowAt = null; });
      } else if (!this.briarTimers.has(bud.group)) {
        const at = this.time + this.regrowAfter;
        this.briarTimers.set(bud.group, at); patch.forEach(other => { other.regrowAt = at; other.regrowSpan = this.regrowAfter; });
      }
    }
    _regrow() {
      for (const [group, at] of this.briarTimers) {
        if (this.time + 1e-10 < at) continue;
        this.briarTimers.delete(group);
        const patch = this.buds.filter(bud => bud.group === group), back = patch.filter(bud => bud.bloomed);
        patch.forEach(bud => { bud.regrowAt = null; });
        if (!back.length || back.length === patch.length) continue;
        for (const bud of back) { bud.bloomed = false; bud.hp = bud.maxHp; bud.bloomAt = -100; bud.hitAt = this.time; bud.spawnAt = this.time; }
        const x = back.reduce((sum, bud) => sum + bud.x, 0) / back.length, y = back.reduce((sum, bud) => sum + bud.y, 0) / back.length;
        this.event('regrow', { group, count: back.length, x, y });
      }
    }
    // Cups guard the underside of a bud; a shell guards everything but its turning opening.
    _guarded(bud, hit) {
      if (bud.shield && hit.ny > .28) return true;
      return Boolean(bud.shell) && hit.nx * Math.cos(bud.shellAngle || 0) + hit.ny * Math.sin(bud.shellAngle || 0) < SHELL_OPEN;
    }
    _loadWave() {
      const missed = this.buds.find(bud => bud.gift);
      if (missed) this.event('giftGone', { power: missed.gift, x: missed.x, y: missed.y });
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
      this._rollGift();
      this.level.subtitle = 'Wave ' + this.wave + '. Keep the flowers above the line.';
      this.event('wave', { wave: this.wave, speed: this.speed, descentSpeed: this.descentSpeed, buds: this.buds.length, tempo: this.tempo, hint: this.waveHint, boss: Boolean(this.bossWave) });
    }
    _lose() {
      if (this.over) return;
      this.status = 'lost'; this.lives = 0; this.balls = []; this.ball = null; this.armed = null; this.lullaby = 0;
      this.pending = []; this.pendingBalls = []; this.aim = []; this.nextWaveAt = null;
      this.event('lost', { wave: this.wave, elapsed: this.elapsed });
    }
    // Compatibility hooks never let the campaign's finish/win behavior end a Rush run.
    finishShot() { this.ball = this.balls[0] || null; }
    win() { if (this.started && !this.over && this.nextWaveAt === null) this.nextWaveAt = this.time + 0.7; }
    _clearLevel() {
      this.status = 'won'; this.balls = []; this.ball = null; this.armed = null; this.lullaby = 0; this.pending = []; this.aim = []; this.nextWaveAt = null;
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
      this.lullaby = Math.max(0, this.lullaby - dt);
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      if (this.time - this.lastHitAt > 1.1) this.combo = 0;
      const due = this.pending.filter(item => item.when <= this.time);
      this.pending = this.pending.filter(item => item.when > this.time);
      due.forEach(item => {
        const bud = this.buds.find(other => other.id === item.id);
        if (bud && item.force) { bud.hp = 1; bud.quiet = true; }
        this.strike(bud, true);
      });
      if (this.briarTimers && this.briarTimers.size) this._regrow();
      if (this.nextWaveAt !== null && this.time + 1e-10 >= this.nextWaveAt) this._loadWave();
      const waveTime = this.time - this.waveStart;
      if (this.giftAt !== null && waveTime >= this.giftAt) this._spawnGift();
      // During a Lullaby nothing falls; flowers still sway and shells still turn.
      for (const bud of this.buds) {
        if (this.lullaby <= 0) bud.y += this.descentSpeed * (bud.fall || 1) * dt;
        if (bud.sway) bud.x = bud.baseX + Math.sin(waveTime * bud.swayW + bud.swayPhase) * bud.sway;
        if (bud.shellSpin) bud.shellAngle += bud.shellSpin * dt;
      }
      for (const rock of this.bumpers) if (rock.slide) rock.x = rock.baseX + Math.sin(waveTime * rock.slideW) * rock.slide;
      if (this.plan) this._dropIn(waveTime);

      const breached = new Set(this.buds.filter(bud => !bud.bloomed && bud.y + bud.r >= this.dangerY).map(bud => bud.group));
      for (const group of breached) {
        if (this.status === 'lost' || this.waveBreaches >= 3) break;
        const member = this.buds.find(bud => bud.group === group && !bud.bloomed);
        // A gift that drifts past the line floats away; it never costs a life.
        if (member.gift) { this.buds = this.buds.filter(bud => bud !== member); this.event('giftGone', { power: member.gift, x: member.x, y: member.y }); continue; }
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
        // A current bends a shot toward its flow at a steady rate; the speed never changes.
        if (this.currents.length) {
          const lane = Engine.laneAt(this.currents, ball.x, ball.y);
          if (lane) { const v = Engine.steer(ball.vx, ball.vy, lane, dt); ball.vx = v.x; ball.vy = v.y; lane.lastUsed = this.time; }
          if (lane && lane !== ball.lane) { this.currentRides++; this.event('current', { lane: lane.id, x: ball.x, y: ball.y, angle: lane.angle }); }
          ball.lane = lane;
        }
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 22) ball.trail.shift();
        let remaining = dt;
        for (let i = 0; i < 5 && remaining > 1e-7; i++) {
          const duration = ball.gateCooldown > 1e-9 ? Math.min(remaining, ball.gateCooldown) : remaining;
          const d = { x: ball.vx * duration, y: ball.vy * duration };
          // A bee never touches the same flower twice.
          const world = ball.power === 'beeline' && ball.passed.length ? { bumpers: this.bumpers, gates: this.gates, buds: this.buds.filter(bud => !ball.passed.includes(bud.id)) } : this;
          const hit = Engine.earliest(world, ball, d);
          if (!hit) {
            ball.x += d.x; ball.y += d.y;
            ball.gateCooldown = Math.max(0, (ball.gateCooldown || 0) - duration);
            remaining -= duration; continue;
          }
          ball.x += d.x * hit.t; ball.y += d.y * hit.t;
          ball.gateCooldown = Math.max(0, (ball.gateCooldown || 0) - duration * hit.t);
          remaining = duration === remaining ? remaining * Math.max(0, 1 - hit.t) : remaining - duration * hit.t;
          // A tunnel mouth sends the shot out of its partner, turned by the difference between the two.
          if (hit.kind === 'gate') {
            const transfer = Engine.gateTransfer(this.gates, hit.item, ball.vx, ball.vy);
            if (transfer) {
              ball.x = transfer.x; ball.y = transfer.y; ball.vx = transfer.vx; ball.vy = transfer.vy;
              ball.trail = []; ball.gateCooldown = Engine.GATE_COOLDOWN; ball.gateHops = (ball.gateHops || 0) + 1;
              this.gatePasses++; hit.item.lastUsed = this.time; transfer.exit.lastUsed = this.time;
              this.event('gate', { entry: hit.item, exit: transfer.exit, x: transfer.exit.x, y: transfer.exit.y });
            }
            continue;
          }
          // A gift is caught and the shot flies on; a bee flies on through flowers; a sunburst opens on its first touch.
          if (hit.kind === 'bud' && hit.item.gift) { this._collect(hit.item); continue; }
          if (hit.kind === 'bud' && ball.power === 'beeline') { ball.passed.push(hit.item.id); this._beeHit(hit.item); continue; }
          if (hit.kind === 'bud' && ball.power === 'sunburst') { this._sunburst(ball, hit.item); break; }
          // An acorn cup turns away any shot that meets it from below; a shell, any shot that misses its opening.
          if (hit.kind === 'bud' && this._guarded(hit.item, hit)) this.event('shield', { bud: hit.item, x: ball.x, y: ball.y, shell: Boolean(hit.item.shell) });
          else if (hit.kind === 'bud') this.strike(hit.item);
          else this.event('bounce', { kind: hit.item && hit.item.kind === 'rock' ? 'rock' : hit.kind, x: ball.x, y: ball.y });
          const dot = ball.vx * hit.nx + ball.vy * hit.ny;
          ball.vx -= 2 * dot * hit.nx; ball.vy -= 2 * dot * hit.ny;
          ball.x += hit.nx * 0.08; ball.y += hit.ny * 0.08;
        }
      }
      this.balls = this.balls.filter(ball => !ball.dead && ball.y <= BOUNDS.bottom + RADIUS && ball.age < BALL_LIFE);
      this.ball = this.balls[0] || null;
      if (!this.buds.some(open) && this.pending.length === 0 && this.nextWaveAt === null && !(this.drops && this.drops.length)) {
        if (this.wave >= this.finalWave) { this._clearLevel(); return; }
        this.nextWaveAt = this.time + 0.7;
        this.event('cleared', { wave: this.wave, tempo: this.tempo, next: tempoFor(this.wave + 1) });
      }
    }
    snapshot() {
      return { mode: this.mode, level: this.plan ? this.plan.id : 'rush', status: this.status, score: this.score, finalWave: this.plan ? this.finalWave : null,
        wave: this.wave, tempo: this.tempo, lives: this.lives, elapsed: this.elapsed, started: this.started,
        speed: this.speed, descentSpeed: this.descentSpeed, balls: this.balls.length, currents: this.currents.length, gates: this.gates.length,
        fireCooldown: this.fireCooldown, rotateCooldown: this.rotateCooldown, splitCharge: this.splitCharge, splitReady: this.splitReady,
        combo: this.combo, bestCombo: this.bestCombo, bloomedCount: this.bloomedCount,
        directHits: this.directHits, rotationUsed: this.rotationUsed, armed: this.armed, lullaby: this.lullaby, powersUsed: this.powersUsed,
        buds: this.buds.map(({ id, x, y, hp, relay, bloomed, shield, puff, boss, shell, geode, gem, briar, gift }) => ({ id, x, y, hp, relay, bloomed,
          shield: Boolean(shield), puff: Boolean(puff), boss: Boolean(boss), shell: Boolean(shell), geode: Boolean(geode), gem: Boolean(gem), briar: Boolean(briar), gift: gift || null })),
        rocks: this.bumpers.filter(item => item.kind === 'rock').map(({ id, x, y, length, angle }) => ({ id, x, y, length, angle })) };
    }
  }
  return { RushGame, tempoFor, fireDelayFor, descentFor, SUN_REACH, LULLABY, GIFT_CHANCE, SHOT_POWERS };
});
