(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./bosses.js'), require('./foes.js'));
  else root.BloomRush = factory(root.BloomEngine, root.BloomBosses, root.BloomFoes);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Bosses, Foes) {
  'use strict';
  if (!Engine || !Engine.Game) throw new Error('Load engine.js before rush.js.');
  const { Game, RADIUS, BOUNDS } = Engine;
  const TICK = 1 / 120, CAP = 5, FIRE_DELAY = 0.65, BALL_LIFE = 4, PUFF_REACH = 74;
  // The seed pod. The launcher holds POD seeds and each shot takes one; seeds leave it at least POD_GAP apart, so a
  // burst is quick but never instant. Each flower a timely seed touches (a bloom or a crack), once a flight,
  // or sets off (a crown or puffcap chain) puts REFUND back. Old ricochets still bloom without feeding the pod. An empty slot also
  // regrows on its own, one at a time, in POD_REGROW times the wave's reload (about 3.4 s on level 1, 2.5 s by level 9).
  // Super Bloom fires from the sun instead: a seed every SUPER_DELAY, and the pod keeps regrowing meanwhile.
  // A tap at most KEEP seconds before the next shot is allowed is kept and fires the moment it is, with the latest aim, so
  // a quick double tap or a tap a blink early is never lost. An aimed shot (the finger held at least HELD seconds) is kept
  // up to AIM_KEEP early, so letting go just before the seed regrows still fires it. Any other tap on an empty pod is
  // dropped and says so ('dry'); a kept tap that still cannot fire in time says why ('dropped').
  const POD = 4, POD_GAP = .15, POD_REGROW = 6, REFUND = .5, GLANCE = .25, KEEP = .15, HELD = .2, AIM_KEEP = .6;
  // A turning shell lets a shot through only near its opening (about 140 degrees of the circle). Briars
  // grow back unless their whole patch blooms within a few seconds of the first one.
  const SHELL_OPEN = .34, REGROW = 4;
  // Powerups. Sunburst blooms everything within reach of its first touch, Dandelion fans into three seeds,
  // Bee Line flies through flowers (cups and shells too) and blooms each one, Lullaby stops the falling for a
  // few seconds. A free gift floats down every other regular wave; shooting it keeps the powerup.
  const SUN_REACH = 82, FAN = .2, LULLABY = 6, GIFT_EVERY = 2, GIFT_R = 14;
  const SHOT_POWERS = ['sunburst', 'dandelion', 'beeline'], GIFTS = ['sunburst', 'dandelion', 'beeline', 'lullaby'];
  // Inert pieces (a decoy, an ink drop) never hold a wave open.
  const open = bud => !bud.bloomed && !bud.gift && !bud.inert;
  const PALETTES = ['gold', 'coral', 'lilac', 'sky', 'poppy'];
  // The danger line; a guardian's tide may raise it for a while, and every wave and loss puts it back.
  const DANGER_Y = 448;
  // A chain lives while blooms keep coming within COMBO_WINDOW seconds of each other.
  // The sun over the seed pod fills from blooms and tricks that a seed earned. Full, it starts Super Bloom: SUPER_TIME
  // seconds of fast reloads, double points for seed-earned blooms, and seeds that fly through up to PIERCE plain buds.
  // A level's first fill needs only FIRST_FILL of the sun. CLOSE_BAND is how near the line a Close call blooms.
  const COMBO_WINDOW = 1.1, SUN_FULL = 48, FIRST_FILL = .6, SUPER_TIME = 6, SUPER_DELAY = .22, PIERCE = 2, CLOSE_BAND = 36;
  // A bank shot is an aimed one: the seed's first touch, off two or more walls, within BANK_TIME of launch.
  const BANK_TIME = 1.6, SUN_PETALS = 8, CHARGE = { direct: 1, chained: .5, puff: 1, geode: 2, crack: 1, trick: 4 };
  // Clever shots are named and paid (times the tempo). One flight trick per bloom at most, the richest one; a hat
  // trick and a grand slam are once-per-seed milestones on top.
  const TRICKS = { slam: { name: 'Grand slam!', bonus: 2000 }, hat: { name: 'Hat trick!', bonus: 900 }, trick: { name: 'Trick shot!', bonus: 600 },
    close: { name: 'Close call!', bonus: 500 }, tunnel: { name: 'Tunnel shot!', bonus: 400 }, rebound: { name: 'Rebound!', bonus: 400 }, bank: { name: 'Bank shot!', bonus: 300 } };
  const multFor = combo => Math.max(1, Math.min(5, 1 + Math.floor((combo - 1) / 4)));
  // A Super Bloom seed flies through plain buds only; bosses, gifts, geodes, cups and shells stop it as usual.
  const pierceable = bud => !bud.boss && !bud.bossPart && !bud.gift && !bud.geode && !bud.shield && !bud.shell && !bud.foe;
  // Tempo: each wave adds a tenth to every score (up to x2 at wave 11) and reloads a little faster
  // (0.65 s down to 0.45 s by wave 9), so the run speeds up for the player as well as against them.
  const tempoFor = wave => Math.min(2, 1 + (wave - 1) * 0.1);
  const fireDelayFor = wave => Math.max(0.45, FIRE_DELAY - (wave - 1) * 0.025);
  // The opening curve is unchanged through wave 9; after it the flowers keep falling faster, so a
  // quick-firing player still meets rising pressure instead of a plateau.
  const descentFor = wave => wave <= 9 ? Math.min(32, 10.2 + (wave - 1) * 2.8) : Math.min(46, 32 + (wave - 9) * 1.8);

  // Continuous, bounded guardian paths. The collider follows this exact path; decoration never moves it.
  // Pure so the practice player can lead a guardian using the same visible motion as a human.
  function bossMotion(kind, time, amplitude, rate) {
    const t = time * rate, s = Math.sin, c = Math.cos;
    switch (kind) {
      case 'root': return { x: amplitude * Math.pow(s(t), 3), y: 0 };
      case 'puff': return { x: amplitude * .85 * s(t), y: 9 * (1 - c(2 * t)) };
      case 'crystal': return { x: amplitude * 2 / Math.PI * Math.asin(s(t)), y: 4 * (1 - c(2 * t)) };
      case 'lotus': return { x: amplitude * s(t), y: 12 * s(2 * t) };
      case 'fossil': return { x: amplitude * .7 * (s(t) + .3 * s(3 * t)), y: 5 * (1 - c(t)) };
      case 'ember': return { x: amplitude * s(t) * c(t * .5), y: 8 * s(t * 1.5) };
      case 'geode': return { x: amplitude * (.8 * s(t) + .2 * s(3 * t)), y: 7 * (1 - c(2 * t)) };
      case 'briar': return { x: amplitude * s(t * .8) * c(t * 1.7), y: 10 * s(t * 1.4) };
      case 'core': return { x: amplitude * (.65 * s(t) + .35 * s(2.3 * t)), y: 14 * s(t * 1.7) };
      default: return { x: amplitude * s(t), y: 0 };
    }
  }

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
          y: anchor[1] + offset[1], r: 11, type: PALETTES[(gi + wave - 1) % PALETTES.length],
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
      // A checkpoint run starts a level part way down, with fresh lives and no score; it can earn at most two stars.
      const startWave = plan ? Math.max(1, Math.min(plan.waves, Math.floor(Number(options.startWave) || 1))) : 1;
      const first = plan ? plan.wave(startWave) : null;
      super({ id: 'rush', name: plan ? plan.name : 'Meadow Rush', subtitle: 'Keep the glasshouse growing.',
        description: 'Tap to launch. Keep flowers above the line. Hit six buds to charge a manual split.',
        flowerId: null, par: 0, buds: first ? first.buds : waveBuds(1),
        bumpers: first ? first.bumpers : [{ id: 'petal', x: 210, y: 350, length: 64, angle: Math.PI / 4, oneWay: true }],
        launcher: { x: 210, y: 498 } });
      this.plan = plan; this.finalWave = plan ? plan.waves : Infinity; this.waveStart = 0;
      this.mode = 'rush'; this.wave = startWave; this.startWave = startWave; this.lives = 3; this.dangerY = DANGER_Y;
      this.started = false; this.elapsed = 0; this.fireCooldown = 0; this.rotateCooldown = 0;
      this.splitCharge = 0; this.directHits = 0; this.totalBlooms = 0;
      this.guideCharge = 0; this.guideTarget = null;
      this.waveBreaches = 0; this.nextWaveAt = null; this.lastHitAt = -100; this.bossDown = false;
      this.speed = 460; this.descentSpeed = 10.2; this.waveFireDelay = FIRE_DELAY; this.waveHint = '';
      // The app supplies randomness for placement and the first gift's type. A regular cadence avoids
      // long unlucky droughts; no gifts appear in simulations that omit this source.
      this.random = options && typeof options.random === 'function' ? options.random : null;
      // An explicit probability remains available to visual QA; normal play always uses the cadence.
      this.giftChance = this.random ? Number.isFinite(options.giftChance) ? Math.max(0, Math.min(1, options.giftChance)) : null : 0;
      this.giftWave = 0; this.giftsGiven = 0; this.giftOffset = null;
      this.giftAt = null; this.armed = null; this.lullaby = 0; this.powersUsed = 0;
      // A scripted run (the tutorial) has no waves of its own: its script sets the board, and it never clears or loses.
      this.scripted = Boolean(options && options.scripted);
      // The sun, Super Bloom and tricks. striker is the seed whose touch is being resolved and due the chain link
      // coming due, so every bloom knows which seed earned it; credits keeps each seed's tally after it is gone.
      this.sunCharge = 0; this.sunFills = 0; this.sunLit = 0; this.sunAt = -1; this.multAt = -1; this.superBloom = 0; this.superQueued = false; this.superCount = 0;
      this.trickCount = 0; this.striker = null; this.due = null; this.credits = new Map();
      this.waveBlooms = 0; this.waveBestChain = 0; this.waveTricks = 0; this.waveKinds = new Set();
      // The foes' own clock (it stops during a Lullaby), Moon Jelly vents, and a guardian's nap on the aim guide.
      this.foeClock = 0; this.foeWave = false; this.vents = []; this.aimNapUntil = 0; this.colorAhead = false;
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
      this.bossWarning = null; this.bossAbility = null; this.bossTurns = 0; this.bossActions = 0;
      this.bossNextAt = this.time + 4.5;
      this.dangerY = DANGER_Y; this.aimNapUntil = 0;
      // From Level 4 the seed tray marks each seed's color, for the crystals that open only to their own color.
      this.colorAhead = Boolean(this.plan && this.plan.id >= 4);
      if (Bosses) Bosses.init(this);
      // Most waves have no foes; the per-tick foe work only runs on a wave that has (or later gets) one.
      this.foeWave = Foes ? Foes.init(this, spec) : false;
    }
    // The seed k shots ahead (k = 0 is the one in the launcher).
    typeAhead(k) { return PALETTES[(this.shotNumber + k) % PALETTES.length]; }
    foeHint(family) { return Foes ? Foes.hint(family) : ''; }
    // Where a foe's own body (a rolling rolypoly) first meets a wall, a rock or a piece within d. Gifts and inert pieces
    // (except the ones a chain may take) are not in its way; neither is `skip`, its own bud.
    foeSweep(p, d, radius, skip) {
      const buds = this.buds.filter(bud => bud !== skip && !bud.bloomed && !bud.gift && (!bud.inert || Foes.chainable(bud)));
      return Engine.earliest({ bumpers: this.bumpers, gates: [], buds }, p, d, true, radius, skip);
    }
    // A chain link made outside a strike (a roll), credited to the seed `by`. A forced link opens the piece outright.
    _linkBy(id, when, from, via, by, force) {
      const item = this._link(id, when, from, via, force);
      item.by = this.scripted ? null : by ?? null;
      return item;
    }
    _bossStep(dt) { if (this.bossWave && Bosses) Bosses.step(this, dt); }
    // Reinforcements arrive at the top once their time comes and there is room above the live buds.
    _dropIn(waveTime) {
      const next = this.drops && this.drops[0];
      if (!next) return;
      const live = this.buds.filter(open), bottom = Math.max(...next.buds.map(bud => bud.y + bud.r));
      if (!(waveTime >= next.at || !live.length) || !live.every(bud => bud.y - bud.r >= bottom + 12)) return;
      this.drops.shift();
      // Flowers that bloomed a while ago and still sit where the drop lands make way for it.
      this.buds = this.buds.filter(bud => !(!bud.bossPart && bud.bloomed && this.time - bud.bloomAt > 1 && bud.y < bottom + 24));
      for (const bud of next.buds) {
        const fresh = { ...bud, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: this.time };
        this.buds.push(fresh);
        if (Foes && fresh.foe) Foes.place(this, fresh);
      }
      this.event('drop', { wave: this.wave, buds: next.buds.length });
    }
    get bloomedCount() { return this.totalBlooms || 0; }
    get stars() { return this.plan && this.status === 'won' ? Math.max(0, Math.min(this.startWave >= 10 ? 1 : this.startWave > 1 ? 2 : 3, this.lives)) : 0; }
    get over() { return this.status === 'lost' || this.status === 'won'; }
    get tempo() { return tempoFor(this.wave); }
    get mult() { return multFor(this.combo); }
    get comboWindow() { return COMBO_WINDOW; }
    get comboLeft() { return this.combo > 0 ? Math.max(0, COMBO_WINDOW - (this.time - this.lastHitAt)) : 0; }
    // How full the sun is, 0 to 1; a full sun waiting for the next wave reads as full.
    get sun() { return this.superQueued ? 1 : Math.max(0, Math.min(1, this.sunCharge / this._sunNeed())); }
    get tricks() { return this.trickCount; }
    // The flower the next seed will grow into; the aim line and launcher ring wear its color.
    get nextType() { return PALETTES[this.shotNumber % PALETTES.length]; }
    // How long one empty slot of the pod takes to regrow this wave.
    get regrowTime() { return POD_REGROW * (this.plan ? this.waveFireDelay : fireDelayFor(this.wave)); }
    get podSize() { return POD; }
    get canFire() { return !this.over && this.balls.length < CAP && this.shotGap <= 1e-7 && (this.superBloom > 0 || this.pod >= 1); }
    // Seconds until the next shot is allowed (0 when one is): the gap after a shot, or the regrow of an empty pod.
    get fireCooldown() {
      if (this.pod === undefined) return 0;
      if (this.superBloom > 0 || this.pod >= 1) return this.shotGap;
      return Math.max(this.shotGap, (1 - this.podGrow) * this.regrowTime);
    }
    // Setting it to zero (the tutorial between steps) hands over a full pod; a positive value only delays the next shot.
    set fireCooldown(value) {
      this.shotGap = Math.max(0, Number(value) || 0);
      if (!(value > 0)) { this.pod = POD; this.podGrow = 0; }
    }
    // While a Super Bloom lasts the pod regrows on its own and nothing feeds it; a seed still flying when it ends feeds
    // it like any other.
    _refund(amount, bud) {
      if (!(amount > 0) || this.pod >= POD || this.superBloom > 0) return;
      const slot = this.pod;
      this.podGrow += amount; this.refunds = (this.refunds || 0) + 1;
      this._growPod(0);
      this.event('podRefund', { amount, slot, pod: this.pod, grow: this.podGrow, x: bud ? bud.x : this.launcher.x, y: bud ? bud.y : this.launcher.y });
    }
    // A timely first hit earns the flight's refill, including the crown/puff chains it starts.
    // Returning to the same ringed bud cannot farm more seeds, and old accidental ricochets still
    // score and bloom normally without refilling the pod. Chain credit survives the seed's flight.
    _refundCredit(credit, bud) {
      if (!credit) return;
      const record = this._record(credit.by);
      if (record.refundEligible === undefined && credit.ball) record.refundEligible = (credit.ball.age || 0) <= BANK_TIME;
      if (!record.refundEligible || credit.ball && (credit.ball.age || 0) > BANK_TIME || record.refundedBuds.has(bud.id)) return;
      record.refundedBuds.add(bud.id); this._refund(REFUND, bud);
    }
    _refundGlance(ball, bud) {
      if (!ball || ball.glanced) return;
      ball.glanced = true;
      if ((ball.age || 0) <= BANK_TIME) this._refund(GLANCE, bud);
    }
    _growPod(dt) {
      if (this.pod >= POD) { this.podGrow = 0; return; }
      this.podGrow += dt / this.regrowTime;
      while (this.podGrow >= 1 - 1e-9 && this.pod < POD) { this.podGrow = Math.max(0, this.podGrow - 1); this.pod++; this.podAt = this.time; this.event('podSeed', { pod: this.pod }); }
      if (this.pod >= POD) this.podGrow = 0;
    }
    get splitReady() {
      return this.status === 'flying' && this.splitCharge >= 1 && this.balls.length > 0 && this.balls.length <= CAP - 2;
    }
    // held: how long the finger aimed before letting go, in seconds (0 for a tap or a key).
    fire(dx, dy, held = 0) {
      if (this.over || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6 || dy / length > -0.12) return false;
      if (!this.canFire) {
        if (this.balls.length >= CAP || this.scripted) return false;
        const wait = this.fireCooldown, aimed = held >= HELD;
        if (wait <= (aimed ? AIM_KEEP : KEEP) + 1e-9) {
          if (!this.kept) this.event('kept', { wait, aimed });
          this.kept = { dx, dy, aimed, until: this.time + wait + .05 }; return true;
        }
        if (!(this.superBloom > 0) && this.pod < 1) { this.dryTaps = (this.dryTaps || 0) + 1; this.dryAt = this.time; this.event('dry', { wait, grow: this.podGrow, aimed }); }
        return false;
      }
      return this._launch(dx, dy);
    }
    _launch(dx, dy) {
      this.started = true; this.status = 'flying'; this.kept = null;
      if (this.superBloom > 0) this.shotGap = SUPER_DELAY;
      else { this.shotGap = POD_GAP; this.pod--; }
      this.shotNumber++; this.aim = [];
      const power = this.armed, angle = Math.atan2(dy, dx), type = PALETTES[(this.shotNumber - 1) % PALETTES.length];
      this.armed = null;
      // A Dandelion fans out three seeds, even when that briefly goes past the usual five in the air.
      for (const offset of power === 'dandelion' ? [-FAN, 0, FAN] : [0]) this.spawnBall({ x: this.launcher.x, y: this.launcher.y,
        angle: angle + offset, speed: this.speed, type, power }, power === 'dandelion');
      this.event('launch', { wave: this.wave, count: power === 'dandelion' ? 3 : 1, angle, pod: this.pod });
      if (power) { this.powersUsed++; this.event('power', { power, x: this.launcher.x, y: this.launcher.y, angle }); }
      return true;
    }
    spawnBall(spec, force = false) {
      if ((!force && this.balls.length >= CAP) || this.over) return false;
      const speed = spec.speed || this.speed;
      this.balls.push({ id: ++this.ballSerial, x: spec.x, y: spec.y, r: RADIUS,
        vx: Math.cos(spec.angle) * speed, vy: Math.sin(spec.angle) * speed,
        speed, trail: [], age: 0, gateCooldown: 0, gateHops: 0, lane: null, type: spec.type || 'gold',
        power: SHOT_POWERS.includes(spec.power) ? spec.power : null, passed: [],
        walls: 0, bounces: 0, touches: 0, streak: 0, petalAt: -100, gateAt: -100, pierced: 0 });
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
      if (!this.random || this.giftWave === this.wave || this.bossWave || this.scripted) return;
      const due = this.giftChance === null ? this.wave % GIFT_EVERY === 0 : this.random() < this.giftChance;
      if (due) this.giftAt = 2 + this.random() * 2;
    }
    // The gift floats in near the top, clear of the flowers, and drifts slowly enough to line up a shot.
    _spawnGift() {
      this.giftAt = null;
      const live = this.buds.filter(bud => !bud.bloomed);
      for (let tries = 0; tries < 10; tries++) {
        const x = 70 + this.random() * 280, y = 50;
        if (live.some(bud => Math.hypot(bud.x - x, bud.y - y) < bud.r + GIFT_R + 12)) continue;
        // Cycle through all four free powers before repeating, from a random starting point.
        if (this.giftOffset === null) this.giftOffset = Math.min(GIFTS.length - 1, Math.floor(this.random() * GIFTS.length));
        const power = GIFTS[(this.giftOffset + this.giftsGiven) % GIFTS.length];
        this.giftWave = this.wave; this.giftsGiven++;
        this.buds.push({ id: `gift-${this.wave}-${this.ballSerial}`, group: `gift-${this.wave}`, x, y, baseX: x, startY: y, r: GIFT_R, type: 'gold',
          gift: power, relay: false, hp: 1, maxHp: 1, fall: .85, sway: 16, swayW: 1.4, swayPhase: this.random() * 6, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: this.time });
        this.event('giftAppear', { power, x, y });
        return;
      }
      // A crowded entrance delays the gift instead of silently consuming this wave's free drop.
      this.giftAt = this.time - this.waveStart + .75;
    }
    _collect(gift) {
      this.buds = this.buds.filter(bud => bud !== gift);
      this.event('gift', { power: gift.gift, x: gift.x, y: gift.y });
    }
    _bossLastLifeGift() {
      if (!this.bossWave || this.lives !== 1 || this.bossLastLifeGift || this.bossDown || this.over) return;
      const spot = [70, 350, 210].map(x => ({ x, y: 150 })).find(p => this.buds.every(b => b.bloomed || b.hidden || Math.hypot(b.x - p.x, b.y - p.y) > b.r + GIFT_R + 8));
      if (!spot) return;
      this.bossLastLifeGift = true;
      this.buds.push({ id: 'boss-lullaby-' + this.wave, group: 'boss-lullaby-' + this.wave, ...spot, baseX: spot.x, startY: spot.y, r: GIFT_R, type: 'gold',
        gift: 'lullaby', freeBossGift: true, relay: false, hp: 1, maxHp: 1, fall: .5, sway: 0, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: this.time });
      this.event('giftAppear', { power: 'lullaby', ...spot, freeBossGift: true });
    }
    _powerBossFor(bud) {
      return bud.boss ? bud : bud.bossPart ? this.buds.find(b => b.boss && b.id === bud.bossId) : null;
    }
    // A multi-part guardian is one opponent for paid ring damage. Its real proxy may be the only
    // hittable surface (Crystal), so route the stated dose to the owner once, without critical bonuses.
    _powerBossHit(boss, rings, ball, power) {
      const key=power+':'+boss.id;
      if (ball) { if (!ball.powerBosses) ball.powerBosses=[]; if (ball.powerBosses.includes(key)) return; ball.powerBosses.push(key); }
      const previous=this.powerBoss;this.powerBoss={boss,power};
      try { for(let n=0;n<rings && !boss.bloomed;n++)this.strike(boss); }
      finally { this.powerBoss=previous; }
    }
    _powerPartHit(bud) {
      const previous=this.powerPart;this.powerPart=true;
      try { bud.hp=1;this.strike(bud); }
      finally { this.powerPart=previous; }
    }
    // A bee blooms whatever it touches; each whole guardian loses three rings once this flight.
    _beeHit(bud) {
      const boss=this._powerBossFor(bud);
      if (boss) this._powerBossHit(boss,3,this.striker,'beeline');
      if (!bud.boss) this._powerPartHit(bud);
      this.event('bee', { x: bud.x, y: bud.y });
    }
    // A sunburst opens at its first touch: that flower and every one within reach bloom in a ripple.
    _sunburst(ball, bud) {
      const x = ball.x, y = ball.y;
      ball.dead = true;
      const reach = this.buds.filter(other => open(other) && !other.hidden && Math.hypot(other.x - x, other.y - y) <= SUN_REACH + other.r);
      const bosses=new Set();
      for(const other of reach){const boss=this._powerBossFor(other);if(boss && !bosses.has(boss)){bosses.add(boss);this._powerBossHit(boss,4,ball,'sunburst');}}
      for (const other of reach) {
        if (other.boss) continue;
        if (other.bossPart && (other.bossPart==='heart' || other.bossPart==='lantern')) { this._powerPartHit(other);continue; }
        if (other === bud) { other.hp = 1; this.strike(other); continue; }
        if (!this.pending.some(item => item.id === other.id)) this.pending.push(this._link(other.id, this.time + .05 + Math.hypot(other.x - x, other.y - y) / 700, { x, y }, 'sun', true));
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
      // A foe may pop (a decoy), turn the seed away, or change the damage; a plain answer leaves the strike as it is.
      const special = Foes && bud.foe && !bud.bossPart ? Foes.hit(this, bud, chain, Foes.credited(this, chain), this.striker) : null;
      if (special) {
        if (special.pop) { this._pop(bud, bud.foe + ':' + (special.quiet ? 'pop' : special.kind || 'pop')); return; }
        if (special.blocked) { if (special.feed && this._credit(false)) this._refundGlance(this.striker, bud); return; }
      }
      let impact = Bosses ? Bosses.resolve(this, bud, chain) : { target: bud, damage: 1 };
      if (impact.blocked) { if (impact.feed && this._credit(false)) this._refundGlance(this.striker, bud); return; }
      bud = impact.target || bud;
      if (special && special.damage) impact = { ...impact, damage: special.damage };
      if (!chain) { this.directHits++; this.splitCharge = Math.min(1, this.splitCharge + 1 / 6); }
      // A timely aimed flight feeds the pod once per flower, including its earned chains.
      const credit = this._credit(chain);
      this._refundCredit(credit, bud);
      if (this.splitCharge > 1 - 1e-8) this.splitCharge = 1;
      if (this.time - this.lastHitAt > COMBO_WINDOW) this.combo = 0;
      this.lastHitAt = this.time;
      if (bud.hp > (impact.damage || 1)) {
        const gain = Math.round(50 * this.tempo);
        bud.hp -= impact.damage || 1; bud.hitAt = this.time; this.score += gain;
        this.event('crack', { bud, chain, gain, hits: Math.max(0, (bud.maxHp || bud.hp + 1) - bud.hp) });
        if (bud.boss) this._charge(CHARGE.crack, credit);
        return;
      }
      bud.hp = 1; this.bloom(bud, chain);
    }
    // Who earned what is resolving now: the seed touching it, or the seed that started the chain coming due.
    // A strike with neither (a test, the tutorial's script) earns nothing and behaves exactly as it always has.
    _credit(chain) {
      if (this.scripted) return null;
      if (!chain && this.striker) return { by: this.striker.id, ball: this.striker };
      if (chain && this.due && this.due.by != null) return { by: this.due.by, ball: null };
      return null;
    }
    // A chain link waiting to bloom: who earned it, where it came from and how, for the sun, the art and the sound.
    _link(id, when, from, via, force) {
      const credit = this.striker ? this.striker.id : this.due && this.due.by != null ? this.due.by : null;
      const item = { id, when, by: this.scripted ? null : credit, from: { x: from.x, y: from.y }, via, at: this.time, depth: (this.due && this.due.depth || 0) + 1 };
      if (force) item.force = true;
      return item;
    }
    _sunNeed() { return SUN_FULL * (this.sunFills === 0 ? FIRST_FILL : 1); }
    // Seed-earned blooms and tricks fill the sun an eighth at a time. It never fills during a Super Bloom, and a sun
    // that fills between waves waits for the next wave so none of it is wasted.
    _charge(amount, credit) {
      if (!credit || !(amount > 0) || this.scripted || this.over || this.superBloom > 0 || this.superQueued) return;
      const need = this._sunNeed();
      this.sunCharge = Math.min(need, this.sunCharge + amount);
      const lit = Math.min(SUN_PETALS, Math.floor(this.sunCharge / need * SUN_PETALS + 1e-9));
      // sunAt and multAt only time the art's little pops, like bud.hitAt.
      while (this.sunLit < lit) { this.sunAt = this.time; this.event('sunPetal', { petal: this.sunLit++, of: SUN_PETALS }); }
      if (this.sunCharge < need - 1e-9) return;
      this.sunFills++;
      const resting = this.nextWaveAt !== null || this.bossDown || (!this.buds.some(open) && this.pending.length === 0 && !(this.drops && this.drops.length));
      if (resting) this.superQueued = true; else this._startSuper();
    }
    _startSuper() {
      this.superQueued = false; this.sunCharge = 0; this.sunLit = 0; this.superCount++;
      this.superBloom = SUPER_TIME; this.feverTime = SUPER_TIME; this.shotGap = Math.min(this.shotGap, SUPER_DELAY);
      this.event('superBloom', { time: SUPER_TIME });
    }
    _endSuper() { this.superBloom = 0; this.feverTime = 0; this.superQueued = false; }
    _record(by) {
      let record = this.credits.get(by);
      if (!record) { record = { blooms: 0, direct: 0, hat: false, slam: false, refundedBuds: new Set() }; this.credits.set(by, record); }
      return record;
    }
    // Each trick pays once a wave (a grand slam every time), so a wave rewards variety and every stamp stays special.
    _trick(kind, bud, by, always) {
      if (!always && this.waveKinds.has(kind)) return 0;
      this.waveKinds.add(kind);
      const def = TRICKS[kind], bonus = Math.round(def.bonus * this.tempo);
      this.score += bonus; this.trickCount++; this.waveTricks++;
      this.event('trick', { kind, name: def.name, bonus, x: bud.x, y: bud.y, seed: by });
      return CHARGE.trick;
    }
    // The flight tricks a direct bloom can earn, richest first.
    _flightTrick(ball, bud) {
      const aimed = !ball.touches, passedGate = (ball.gateHops || 0) > 0;
      if (aimed && passedGate && ball.bounces > 0) return 'trick';
      if (bud.y >= this.dangerY - CLOSE_BAND) return 'close';
      if (aimed && passedGate && this.time - ball.gateAt <= .6) return 'tunnel';
      if (this.time - ball.petalAt <= .4) return 'rebound';
      if (aimed && ball.walls >= 2 && ball.petalAt < 0 && ball.age <= BANK_TIME) return 'bank';
      return null;
    }
    bloom(bud, chain = false) {
      if (!bud || bud.bloomed || this.over) return;
      if (this.time - this.lastHitAt > COMBO_WINDOW) this.combo = 0;
      this.lastHitAt = this.time;
      bud.bloomed = true; bud.bloomAt = this.time;
      this.totalBlooms++; this.lastShotBlooms++; this.combo++; this.waveBlooms++;
      this.bestCombo = Math.max(this.bestCombo, this.combo); this.waveBestChain = Math.max(this.waveBestChain, this.combo);
      // During Super Bloom a seed-earned bloom pays double.
      const credit = this._credit(chain), mult = multFor(this.combo), boosted = Boolean(credit) && this.superBloom > 0;
      const queuedBefore = !chain && this.pending.some(item => item.id === bud.id);
      const gain = Math.round(((chain ? 75 : 100) * mult + (bud.boss ? 1500 : 0)) * this.tempo * (boosted ? 2 : 1));
      this.score += gain;
      const record = credit ? this._record(credit.by) : null, seedStep = record ? record.blooms : 0, link = chain ? this.due : null;
      if (record) { record.blooms++; if (!chain) record.direct++; }
      // A hat trick is a seed whose first three touches each open a flower no chain was already opening.
      const ball = !chain && credit ? credit.ball : null;
      if (ball && ball.touches === ball.streak && !queuedBefore) ball.streak++;
      this.event('bloom', { bud, gain, combo: this.combo, chain, mult, seed: credit ? credit.by : null, seedStep,
        via: link ? link.via || null : null, cascade: link ? link.depth || 1 : 0, from: link && link.from ? link.from : null, super: this.superBloom > 0 });
      if (this.combo > 1 && mult > multFor(this.combo - 1)) { this.multAt = this.time; this.event('mult', { mult }); }
      const queued = other => this.pending.some(item => item.id === other.id);
      // A geode cracks open into gems that still have to be bloomed (unless a big bloom sweeps it up).
      if (bud.geode && !bud.quiet) {
        const gems = this._gems(bud);
        this.buds.push(...gems);
        this.event('geode', { bud, count: gems.length });
      }
      if (bud.briar) this._briarBloomed(bud);
      if (Bosses) Bosses.bloomed(this, bud);
      if (Foes && bud.foe) Foes.bloomed(this, bud, chain, credit);
      // A puffcap blooms everything within reach a moment later; puffcaps it reaches go off in turn.
      if (bud.puff) {
        const near = this.buds.filter(other => other !== bud && (open(other) || other.foe && !other.bloomed && Foes.chainable(other)) && !queued(other) && Math.hypot(other.x - bud.x, other.y - bud.y) <= PUFF_REACH)
          .sort((a, b) => Math.hypot(a.x - bud.x, a.y - bud.y) - Math.hypot(b.x - bud.x, b.y - bud.y));
        near.forEach((other, index) => this.pending.push(this._link(other.id, this.time + .09 + index * .045, bud, 'puff')));
        this.event('puff', { bud, count: near.length });
      }
      // Blooming a boss blooms the rest of its wave, in a gold wave travelling outward from it.
      if (bud.boss) {
        this.buds.filter(other => open(other) && !queued(other))
          .sort((a, b) => Math.hypot(a.x - bud.x, a.y - bud.y) - Math.hypot(b.x - bud.x, b.y - bud.y))
          .forEach((other, index) => this.pending.push(this._link(other.id, this.time + .25 + index * .06, bud, 'boss', true)));
        // It is the wave's last beat: reinforcements still to come never arrive, and a sun that fills in the cascade
        // waits for the next wave instead of starting a Super Bloom over a garden that is already won.
        this.drops = []; this.bossDown = true; this.bossWarning = null; this.bossAbility = null; bud.bossWarning = null;
        if (Foes) Foes.sweep(this, 'boss');
        this.event('boss', { bud, gain, name: bud.name || null });
      }
      if (bud.relay && !chain) {
        this.buds.filter(other => other.group === bud.group && !other.bloomed && !this.pending.some(item => item.id === other.id))
          .slice(0, 2).forEach((other, index) => this.pending.push(this._link(other.id, this.time + (index + 1) * 0.11, bud, 'relay')));
      }
      if (!credit) return;
      // Tricks and the sun. Only blooms a seed earned count: a direct touch, or a chain that seed started.
      let charge = (chain ? CHARGE.chained : CHARGE.direct) + (bud.puff ? CHARGE.puff : 0) + (bud.geode ? CHARGE.geode : 0);
      const kind = !chain && credit.ball ? this._flightTrick(credit.ball, bud) : null;
      if (kind) charge += this._trick(kind, bud, credit.by);
      if (ball && ball.streak >= 3 && !record.hat) { record.hat = true; charge += this._trick('hat', bud, credit.by); }
      if (record.blooms >= 12 && !record.slam) { record.slam = true; charge += this._trick('slam', bud, credit.by, true); }
      this._charge(charge, credit);
    }
    // A pop (a decoy, a burst) ends a piece without a bloom: no score, refund, sun, chain or split charge.
    // A guardian's popped part stays in its list (the art skips it); anything else leaves the board.
    _pop(bud, kind) {
      if (!bud || bud.bloomed) return;
      bud.bloomed = true; bud.popped = true; bud.bloomAt = this.time;
      if (!bud.bossPart) this.buds = this.buds.filter(other => other !== bud);
      this.pending = this.pending.filter(item => item.id !== bud.id);
      if (Foes) Foes.popped(this, bud, kind);
      this.event('foe', { kind, bud: { id: bud.id, x: bud.x, y: bud.y, r: bud.r, type: bud.type, foe: bud.foe }, x: bud.x, y: bud.y });
    }
    _gems(bud) {
      const spots = (bud.gems || 3) === 2 ? [[-20, 6], [20, 6]] : [[-22, 2], [22, 2], [0, 22]];
      return spots.map(([ox, oy], i) => {
        // A last-second crack must leave time to see and catch its new gems before they cross the line.
        const x = Math.max(44, Math.min(376, bud.x + ox)), y = Math.min(this.dangerY - 70, bud.y + oy);
        return { id: bud.id + '-gem-' + i, group: bud.group, x, y, baseX: x, startY: y, r: 9, type: PALETTES[i % PALETTES.length],
          relay: false, hp: 1, maxHp: 1, gem: true, shield: false, fall: bud.fall || 1, sway: 0, swayW: 0, swayPhase: 0,
          hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: this.time, bossSummon: Boolean(bud.bossSummon) };
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
      if ((bud.boss || bud.bossPart) && Bosses && this.bossState) return !Bosses.canHit(this, bud, hit, this.striker || {});
      if (bud.foe && Foes && Foes.guard(this, bud, hit, this.striker)) return true;
      if (bud.shield && hit.ny > .28) return true;
      return Boolean(bud.shell) && hit.nx * Math.cos(bud.shellAngle || 0) + hit.ny * Math.sin(bud.shellAngle || 0) < SHELL_OPEN;
    }
    _loadWave() {
      const missed = this.buds.find(bud => bud.gift);
      if (missed) this.event('giftGone', { power: missed.gift, x: missed.x, y: missed.y });
      this.wave++; this.waveBreaches = 0; this.nextWaveAt = null; this.pending = []; this.waveStart = this.time; this.bossDown = false;
      this.waveBlooms = 0; this.waveBestChain = 0; this.waveTricks = 0; this.waveKinds.clear();
      // A seed still flying into the new wave keeps its tally, so its hat trick and grand slam stay once a seed.
      for (const id of this.credits.keys()) if (!this.balls.some(ball => ball.id === id)) this.credits.delete(id);
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
      const boss = this.buds.find(bud => bud.boss);
      this.event('wave', { wave: this.wave, speed: this.speed, descentSpeed: this.descentSpeed, buds: this.buds.length, tempo: this.tempo, hint: this.waveHint, boss: Boolean(this.bossWave), bossName: boss && boss.name || null });
      // A sun that filled while the last wave was clearing opens this one in Super Bloom.
      if (this.superQueued) this._startSuper();
    }
    _lose() {
      if (this.over) return;
      if (Bosses) Bosses.cleanup(this);
      if (Foes) Foes.sweep(this, 'lost');
      this.dangerY = DANGER_Y; this.aimNapUntil = 0;
      this.status = 'lost'; this.lives = 0; this.balls = []; this.ball = null; this.armed = null; this.lullaby = 0; this._endSuper(); this.kept = null;
      this.bossWarning = null; this.bossAbility = null; this.buds.forEach(bud => { bud.bossWarning = null; });
      this.pending = []; this.pendingBalls = []; this.aim = []; this.nextWaveAt = null;
      this.event('lost', { wave: this.wave, elapsed: this.elapsed });
    }
    // Compatibility hooks never let the campaign's finish/win behavior end a Rush run.
    finishShot() { this.ball = this.balls[0] || null; }
    win() { if (this.started && !this.over && this.nextWaveAt === null) this.nextWaveAt = this.time + 0.7; }
    _clearLevel() {
      this.vents = [];
      this.status = 'won'; this.balls = []; this.ball = null; this.armed = null; this.lullaby = 0; this.pending = []; this.aim = []; this.nextWaveAt = null; this._endSuper(); this.kept = null;
      this.bossWarning = null; this.bossAbility = null;
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
      this.shotGap = Math.max(0, this.shotGap - dt);
      this._growPod(dt);
      if (this.kept) {
        if (this.canFire) this._launch(this.kept.dx, this.kept.dy);
        else if (this.time > this.kept.until) {
          // It could not fire in time: five seeds went up meanwhile, or the pod ran out. Say so rather than drop it quietly.
          const reason = this.balls.length >= CAP ? 'cap' : !(this.superBloom > 0) && this.pod < 1 ? 'dry' : 'gap';
          this.event('dropped', { reason, aimed: this.kept.aimed }); this.kept = null; this.aim = [];
        }
      }
      if (this.superBloom > 0) {
        this.superBloom = Math.max(0, this.superBloom - dt); this.feverTime = this.superBloom;
        if (this.superBloom <= 1e-9) { this.superBloom = 0; this.event('superBloomEnd', {}); }
      }
      if (this.combo && this.time - this.lastHitAt > COMBO_WINDOW) {
        if (this.combo >= 5) this.event('chainEnd', { chain: this.combo });
        this.combo = 0;
      }
      const due = this.pending.filter(item => item.when <= this.time);
      this.pending = this.pending.filter(item => item.when > this.time);
      due.forEach(item => {
        const bud = this.buds.find(other => other.id === item.id);
        if (bud && item.force) { bud.hp = 1; bud.quiet = true; }
        // A chained flower opens away from whatever set it off.
        if (bud && item.from && !bud.bloomed) bud.impactAngle = Math.atan2(bud.y - item.from.y, bud.x - item.from.x);
        this.due = item; this.strike(bud, true); this.due = null;
      });
      if (this.briarTimers && this.briarTimers.size && !this.bossDown) this._regrow();
      if (this.nextWaveAt !== null && this.time + 1e-10 >= this.nextWaveAt) this._loadWave();
      const waveTime = this.time - this.waveStart;
      if (this.giftAt !== null && waveTime >= this.giftAt) this._spawnGift();
      // During a Lullaby nothing falls; flowers still sway and shells still turn.
      const foeWave = this.foeWave;
      for (const bud of this.buds) {
        const owned = foeWave && bud.foe && Foes.owns(bud);
        if (this.lullaby <= 0 && !bud.bossKind && !bud.bossPart && !bud.carried && !owned) bud.y += this.descentSpeed * (bud.fall || 1) * dt;
        if (bud.sway && !bud.bossKind && !bud.carried && !owned) bud.x = bud.baseX + Math.sin(waveTime * bud.swayW + bud.swayPhase) * bud.sway;
        if (bud.shellSpin) bud.shellAngle += bud.shellSpin * dt;
      }
      if (foeWave) Foes.step(this, dt);
      this._bossStep(dt);
      for (const rock of this.bumpers) if (rock.slide) rock.x = rock.baseX + Math.sin(waveTime * rock.slideW) * rock.slide;
      if (this.plan) this._dropIn(waveTime);

      // In a scripted run flowers stop just above the line instead of costing a life.
      if (this.scripted) for (const bud of this.buds) if (!bud.bloomed) bud.y = Math.min(bud.y, this.dangerY - bud.r - 4);
      // A piece that never costs a life (a decoy, an ink drop) just fizzles at the line.
      if (foeWave && !this.scripted) for (let i = this.buds.length - 1; i >= 0; i--) {
        const bud = this.buds[i];
        if (!bud.foe || bud.bloomed || bud.hidden || bud.y + bud.r < this.dangerY || Foes.breach(this, bud) !== 'fizzle') continue;
        this._pop(bud, bud.foe + ':fizzle');
      }
      const breached = new Set(this.scripted ? [] : this.buds.filter(bud => !bud.bloomed && !bud.bossPart && (!bud.hidden || bud.boss && bud.bossKind==='crystal') && bud.y + bud.r >= this.dangerY
        && !(foeWave && bud.foe && Foes.breach(this, bud) === 'skip')).map(bud => bud.group));
      for (const group of breached) {
        if (this.status === 'lost' || this.waveBreaches >= 3) break;
        const member = this.buds.find(bud => bud.group === group && !bud.bloomed);
        // A gift that drifts past the line floats away; it never costs a life.
        if (member.gift) { this.buds = this.buds.filter(bud => bud !== member); this.event('giftGone', { power: member.gift, x: member.x, y: member.y }); continue; }
        // A puffcap that drifts past the line just fizzles; it never costs a life.
        if (member.puff) { this.buds = this.buds.filter(bud => bud !== member); this.pending = this.pending.filter(item => item.id !== member.id); continue; }
        // A boss that reaches the line costs a life and climbs back to the top to try again.
        if (member.boss) {
          const lost = [{ x: member.x, y: member.y, type: member.type, r: member.r }];
          if (Bosses && this.bossState && this.bossState.boss===member) Bosses.breach(this); else member.y = member.startY;
          member.spawnAt = this.time; this.waveBreaches++; this.lives--;
          this.event('life', { lives: this.lives, group, x: member.x, y: this.dangerY, wave: this.wave, boss: true, buds: lost, index: this.lives });
          if (this.lives <= 0) { this._lose(); return; }
          continue;
        }
        const removed = new Set(this.buds.filter(bud => bud.group === group).map(bud => bud.id));
        const lost = this.buds.filter(bud => bud.group === group && !bud.bloomed).map(bud => ({ x: bud.x, y: bud.y, type: bud.type, r: bud.r }));
        this.buds = this.buds.filter(bud => bud.group !== group);
        this.pending = this.pending.filter(item => !removed.has(item.id));
        this.waveBreaches++; this.lives--;
        this.event('life', { lives: this.lives, group, x: member.x, y: this.dangerY, wave: this.wave, buds: lost, index: this.lives });
        if (this.lives <= 0) { this._lose(); return; }
      }

      this._bossLastLifeGift();
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
              ball.trail = []; ball.gateCooldown = Engine.GATE_COOLDOWN; ball.gateHops = (ball.gateHops || 0) + 1; ball.gateAt = this.time;
              this.gatePasses++; hit.item.lastUsed = this.time; transfer.exit.lastUsed = this.time;
              this.event('gate', { entry: hit.item, exit: transfer.exit, x: transfer.exit.x, y: transfer.exit.y });
            }
            continue;
          }
          // A gift is caught and the shot flies on; a bee flies on through flowers; a sunburst opens on its first touch.
          if (hit.kind === 'bud' && hit.item.gift) { this._collect(hit.item); continue; }
          // Some pieces swallow a seed outright (an ink drop): the seed is gone, nothing blooms.
          if (hit.kind === 'bud' && hit.item.foe && Foes && Foes.contact(this, hit.item, ball, hit) === 'absorb') { ball.dead = true; ball.touches++; this.striker = null; break; }
          // Every touch below is resolved with this seed as the striker, so its blooms and chains are credited to it.
          if (hit.kind === 'bud') hit.item.impactAngle = Math.atan2(hit.item.y - ball.y, hit.item.x - ball.x);
          ball.bossContact = { nx: hit.nx, ny: hit.ny }; this.striker = ball;
          if (hit.kind === 'bud' && ball.power === 'beeline') { ball.passed.push(hit.item.id); this._beeHit(hit.item); ball.touches++; this.striker = null; continue; }
          if (hit.kind === 'bud' && ball.power === 'sunburst') { this._sunburst(ball, hit.item); this.striker = null; break; }
          // In a Super Bloom a seed blooms plain buds outright and flies on through them, PIERCE times a flight. A pierce
          // counts as a touch first, so it never builds a hat trick or an aimed trick: the Super Bloom is the reward.
          if (hit.kind === 'bud' && this.superBloom > 0 && ball.pierced < PIERCE && pierceable(hit.item)) {
            ball.pierced++; ball.touches++; hit.item.hp = 1; this.strike(hit.item); this.striker = null; continue;
          }
          // An acorn cup turns away any shot that meets it from below; a shell, any shot that misses its opening.
          if (hit.kind === 'bud' && this._guarded(hit.item, hit)) {
            if (Bosses && Bosses.burns(this, hit.item, ball)) {
              ball.dead = true; ball.touches++; this.striker = null;
              this.event('bossBurn', { bud: hit.item, x: ball.x, y: ball.y, kind: 'ember' }); break;
            }
            if (hit.item.foe) this.event('foe', { kind: hit.item.foe + ':guard', bud: hit.item, x: ball.x, y: ball.y });
            else this.event('shield', { bud: hit.item, x: ball.x, y: ball.y, shell: Boolean(hit.item.shell) });
            // A turning shell is a timing shot, so the first time one turns a seed away the seed still wins back a little; a
            // cup, aimed at from below, wins nothing.
            if (hit.item.shell && this._credit(false)) this._refundGlance(ball, hit.item);
          }
          else if (hit.kind === 'bud') this.strike(hit.item);
          if (hit.kind === 'bud') ball.touches++;
          else {
            this.event('bounce', { kind: hit.item && hit.item.kind === 'rock' ? 'rock' : hit.kind, x: ball.x, y: ball.y, caught: Boolean(hit.item && hit.item.oneWay) });
            // Banks and rebounds: walls and the turned petal count toward this flight's tricks.
            if (hit.kind === 'wall') { ball.walls++; ball.bounces++; }
            else if (hit.item && hit.item.id === 'petal') { ball.bounces++; ball.petalAt = this.time; }
          }
          this.striker = null;
          const dot = ball.vx * hit.nx + ball.vy * hit.ny;
          ball.vx -= 2 * dot * hit.nx; ball.vy -= 2 * dot * hit.ny;
          ball.x += hit.nx * 0.08; ball.y += hit.ny * 0.08;
        }
      }
      this.balls = this.balls.filter(ball => !ball.dead && ball.y <= BOUNDS.bottom + RADIUS && ball.age < BALL_LIFE);
      this.ball = this.balls[0] || null;
      if (!this.scripted && !this.buds.some(open) && this.pending.length === 0 && this.nextWaveAt === null && !(this.drops && this.drops.length) && !(this.foeWave && Foes.holding(this))) {
        if (Foes) Foes.sweep(this, 'clear');
        if (this.wave >= this.finalWave) { this._clearLevel(); return; }
        // Every fifth wave of endless Rush ends on the finale, so its gold sweep gets time to land before the next wave.
        this.nextWaveAt = this.time + (!this.plan && this.wave % 5 === 0 ? 1.4 : 0.7);
        this.event('cleared', { wave: this.wave, tempo: this.tempo, next: tempoFor(this.wave + 1), blooms: this.waveBlooms, bestChain: this.waveBestChain, tricks: this.waveTricks });
      }
    }
    snapshot() {
      return { mode: this.mode, level: this.plan ? this.plan.id : 'rush', status: this.status, score: this.score, finalWave: this.plan ? this.finalWave : null,
        wave: this.wave, tempo: this.tempo, lives: this.lives, elapsed: this.elapsed, started: this.started,
        speed: this.speed, descentSpeed: this.descentSpeed, balls: this.balls.length, currents: this.currents.length, gates: this.gates.length,
        fireCooldown: this.fireCooldown, pod: this.pod, podGrow: this.podGrow, podSize: POD, kept: Boolean(this.kept), rotateCooldown: this.rotateCooldown, splitCharge: this.splitCharge, splitReady: this.splitReady,
        combo: this.combo, bestCombo: this.bestCombo, bloomedCount: this.bloomedCount,
        directHits: this.directHits, rotationUsed: this.rotationUsed, armed: this.armed, lullaby: this.lullaby, powersUsed: this.powersUsed,
        sun: this.sun, superBloom: this.superBloom, mult: this.mult, tricks: this.trickCount, startWave: this.startWave, bossWarning: this.bossWarning || null, bossReached: Boolean(this.bossReached), bossDefeated: Boolean(this.bossDefeated), bossLastLifeGift: Boolean(this.bossLastLifeGift),
        buds: this.buds.map(({ id, x, y, hp, relay, bloomed, shield, puff, boss, bossKind, shell, geode, gem, briar, gift }) => ({ id, x, y, hp, relay, bloomed, bossKind: bossKind || null,
          shield: Boolean(shield), puff: Boolean(puff), boss: Boolean(boss), shell: Boolean(shell), geode: Boolean(geode), gem: Boolean(gem), briar: Boolean(briar), gift: gift || null })),
        rocks: this.bumpers.filter(item => item.kind === 'rock').map(({ id, x, y, length, angle }) => ({ id, x, y, length, angle })) };
    }
  }
  return { RushGame, tempoFor, fireDelayFor, descentFor, SUN_REACH, LULLABY, GIFT_EVERY, SHOT_POWERS,
    COMBO_WINDOW, SUN_FULL, FIRST_FILL, SUPER_TIME, SUPER_DELAY, PIERCE, CLOSE_BAND, TRICKS, POD, POD_GAP, POD_REGROW, REFUND, GLANCE, KEEP, HELD, AIM_KEEP, bossMotion };
});
