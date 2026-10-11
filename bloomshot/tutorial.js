(function (root, factory) {
  'use strict';
  const tutorial = factory();
  if (typeof module === 'object' && module.exports) module.exports = tutorial;
  else root.BloomTutorial = tutorial;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The first-time tutorial: one short guided run on the Sunny Meadow board, about half a minute long. Each step
  // brings in one control. While it waits for the player the game nearly stops and the control is lit up; once
  // the player uses it, the game runs at full speed so they see what it did to the flowers coming down.
  // This file is the script and its clock. app.js draws the card and the spotlight and asks it what is allowed.
  const SLOW = 0.08, CREEP = 0.2, EASE = 7, DESCENT = 8, INTRO = 0.25;
  const LAUNCHER = { x: 210, y: 498 };
  const TYPES = ['coral', 'gold', 'lilac'];
  // Three buds a bunch. The crown comes first, placed where a shot from below meets it first.
  const SHAPES = {
    crown: [[0, 16], [-17, -12], [17, -12]],
    line: [[-23, 0], [0, 0], [23, 0]],
    stack: [[0, 23], [0, 0], [0, -23]]
  };
  function bud(game, id, group, x, y, type, extra) {
    return Object.assign({ id, group, x, y, baseX: x, startY: y, r: 11, type, relay: false, hp: 1, maxHp: 1, shield: false,
      fall: 1, sway: 0, swayW: 0, swayPhase: 0, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: game.time }, extra || {});
  }
  function bunch(game, tag, x, y, shape, type, extra) {
    return SHAPES[shape].map(([dx, dy], i) => bud(game, `${tag}-${i}`, tag, x + dx, y + dy, type, Object.assign({ relay: i === 0 }, extra || {})));
  }
  // A tight crowd, all within a Sunburst's reach of wherever the shot first touches it.
  function crowd(game, tag, cx, cy) {
    const spots = [[0, 0]];
    for (let i = 0; i < 6; i++) spots.push([Math.cos(i * Math.PI / 3) * 24, Math.sin(i * Math.PI / 3) * 24]);
    for (let i = 0; i < 6; i++) spots.push([Math.cos((i + .5) * Math.PI / 3) * 40, Math.sin((i + .5) * Math.PI / 3) * 40]);
    return spots.map(([dx, dy], i) => bud(game, `${tag}-${i}`, `${tag}-${i}`, cx + dx, cy + dy, TYPES[i % 3]));
  }
  const leaf = degrees => ({ id: 'petal', x: 210, y: 330, length: 64, angle: degrees * Math.PI / 180 });

  // Each step: what it is called, what it sets on the board, the prompts in order (what to say, what to light up,
  // which input is open, and when it is done), what counts as it working, and the line shown while it plays out.
  // `retry` is the prompt to go back to when a shot misses.
  const STEPS = [
    { id: 'fire', title: 'Aim and fire',
      setup: game => [...bunch(game, 't1-a', 282, 196, 'crown', 'coral'), ...bunch(game, 't1-b', 136, 168, 'crown', 'gold')],
      prompts: [{ text: 'Drag up from the seed to aim, then let go.', target: 'board', finger: [282, 214], allow: ['fire'], until: (g, s) => s.launch > 0 }],
      works: s => s.bloom > 0, retry: 0, show: 1.1, done: 'A crowned flower blooms its whole bunch.' },
    { id: 'petal', title: 'Turn the petal', leaf: 45,
      setup: game => bunch(game, 't2-a', 344, 330, 'line', 'lilac'),
      prompts: [
        { text: 'Seeds bounce off this petal. Tap it or Turn petal to swing it.', target: 'petal', also: 'rotate-btn', allow: ['rotate'], until: (g, s) => s.rotate > 0 },
        { text: 'Now fire straight at the petal.', target: 'board', finger: [210, 342], allow: ['fire'], until: (g, s) => s.launch > 0 }],
      works: s => s.bloom > 0, retry: 1, show: 1.1, done: 'Rocks and walls bounce seeds too.' },
    { id: 'split', title: 'Split', charge: true,
      setup: game => [...bunch(game, 't3-a', 140, 154, 'line', 'gold'), ...bunch(game, 't3-b', 280, 154, 'line', 'coral'), ...bunch(game, 't3-c', 210, 96, 'crown', 'lilac')],
      prompts: [
        { text: 'Six hits charge Split. Fire a seed!', target: 'board', finger: [210, 210], allow: ['fire'], until: (g, s) => s.launch > 0 },
        { text: 'Tap Split while it flies!', target: 'split-btn', allow: ['split'], speed: CREEP, until: (g, s) => s.split > 0, lost: g => !g.balls.length }],
      works: s => s.split > 0, retry: 0, show: 1.2, done: 'One seed became three.' },
    { id: 'sunburst', title: 'Sunburst', power: 'sunburst',
      setup: game => crowd(game, 't4', 210, 178),
      prompts: [
        { text: 'Sunburst makes your next seed burst wide. Tap it.', target: 'power:sunburst', allow: ['power:sunburst'], until: g => g.armed === 'sunburst' },
        { text: 'Now fire into the crowd!', target: 'board', finger: [210, 226], allow: ['fire', 'power:sunburst'], until: (g, s) => s.launch > 0, lost: g => g.armed !== 'sunburst' }],
      works: s => s.sunburst > 0, retry: 0, show: 1.2, done: 'Sunburst blooms everything around it.' },
    { id: 'dandelion', title: 'Dandelion', power: 'dandelion',
      setup: game => [...bunch(game, 't5-a', 148, 202, 'crown', 'gold'), ...bunch(game, 't5-b', 210, 202, 'crown', 'lilac'), ...bunch(game, 't5-c', 272, 202, 'crown', 'coral')],
      prompts: [
        { text: 'Dandelion fires three seeds at once. Tap it.', target: 'power:dandelion', allow: ['power:dandelion'], until: g => g.armed === 'dandelion' },
        { text: 'Fire straight up!', target: 'board', finger: [210, 262], allow: ['fire', 'power:dandelion'], until: (g, s) => s.launch > 0, lost: g => g.armed !== 'dandelion' }],
      works: s => s.power.dandelion > 0, retry: 0, show: 1.2, done: 'Three seeds, three bunches.' },
    { id: 'beeline', title: 'Bee Line', power: 'beeline',
      setup: game => [...bunch(game, 't6-a', 210, 250, 'stack', 'coral', { shield: true }), ...bunch(game, 't6-b', 210, 174, 'stack', 'gold', { shield: true }), ...bunch(game, 't6-c', 210, 98, 'stack', 'lilac', { shield: true })],
      prompts: [
        { text: 'Cups block shots, but Bee Line flies through. Tap it.', target: 'power:beeline', allow: ['power:beeline'], until: g => g.armed === 'beeline' },
        { text: 'Fire at the cups!', target: 'board', finger: [210, 300], allow: ['fire', 'power:beeline'], until: (g, s) => s.launch > 0, lost: g => g.armed !== 'beeline' }],
      works: s => s.power.beeline > 0, retry: 0, show: 1.3, done: 'Right through the cups!' },
    { id: 'lullaby', title: 'Lullaby', power: 'lullaby', intro: 1,
      setup: game => [70, 140, 210, 280, 350].flatMap((x, i) => bunch(game, `t7-${i}`, x, 44, 'crown', TYPES[i % 3], { fall: 8 })),
      prompts: [{ text: 'They are falling fast! Tap Lullaby to stop them.', target: 'power:lullaby', allow: ['power:lullaby'], until: g => g.lullaby > 0 }],
      works: () => true, retry: 0, show: 1.3, done: 'Lullaby stops them falling for 6 seconds.' }
  ];
  // Counted per attempt: launches, petal turns, splits, sunburst openings, blooms among this step's flowers, and
  // powerups fired.
  const ACTIONS = ['launch', 'rotate', 'split', 'sunburst'];

  function create() {
    const t = {
      steps: STEPS.length, index: -1, prompt: 0, phase: 'intro', clock: 0, elapsed: 0, scale: 1, goal: 1,
      seen: null, powers: {}, finished: false, finaleAt: 0,
      // Sets up the board for the run: a gentle fall, no petal yet, and the first step.
      begin(game) {
        game.started = true; game.status = 'flying'; game.descentSpeed = DESCENT; game.lives = 3;
        this.next(game);
      },
      next(game) {
        this.index++; this.prompt = 0; this.clock = 0;
        if (this.index >= STEPS.length) { this.finale(game); return; }
        const step = STEPS[this.index];
        // Flowers from the last step that are still closed make way; ones that just bloomed finish opening.
        game.buds = game.buds.filter(b => b.bloomed && game.time - b.bloomAt < 1.2).concat(step.setup(game));
        game.bumpers = step.leaf === undefined ? [] : [leaf(step.leaf)];
        game.balls = []; game.ball = null; game.pending = []; game.armed = null; game.lullaby = 0;
        game.fireCooldown = 0; game.rotateCooldown = 0; game.rotationUsed = false;
        if (step.charge) game.splitCharge = 1;
        this.refill(); this.attempt(); this.phase = 'intro'; this.goal = 1;
      },
      // The tutorial hands out its own uses, one of each a step, so it never spends the player's powerups.
      refill() { for (const id of ['sunburst', 'dandelion', 'beeline', 'lullaby']) this.powers[id] = 1; },
      attempt() { this.seen = { launch: 0, rotate: 0, split: 0, sunburst: 0, bloom: 0, power: { sunburst: 0, dandelion: 0, beeline: 0, lullaby: 0 } }; },
      count(id) { return this.powers[id] || 0; },
      spend(id) { this.powers[id] = Math.max(0, (this.powers[id] || 0) - 1); },
      get step() { return STEPS[this.index] || null; },
      get current() { return this.step && this.phase === 'prompt' ? this.step.prompts[this.prompt] : null; },
      // Only what the card asks for works while it waits; between prompts the board just plays out.
      allows(action) { const p = this.current; return Boolean(p && p.allow.includes(action)); },
      observe(event) {
        if (!this.seen || this.finished) return;
        if (ACTIONS.includes(event.type)) this.seen[event.type]++;
        if (event.type === 'power' && event.power in this.seen.power) this.seen.power[event.power]++;
        if (event.type === 'bloom' && this.step && String(event.bud && event.bud.id).startsWith(`t${this.index + 1}-`)) this.seen.bloom++;
      },
      // Called every frame with real seconds; sets how fast the game should run.
      tick(game, dt) {
        if (this.finished) return;
        this.elapsed += dt; this.clock += dt;
        const step = this.step;
        if (this.phase === 'finale') { this.goal = 1; if (this.clock >= 1.2) this.phase = 'end'; }
        else if (this.phase === 'end') this.goal = 1;
        else if (this.phase === 'intro') { this.goal = 1; if (this.clock >= (step.intro || INTRO)) this.enter('prompt'); }
        else if (this.phase === 'prompt') {
          const p = step.prompts[this.prompt];
          this.goal = p.speed || SLOW;
          if (p.until(game, this.seen)) {
            if (this.prompt + 1 < step.prompts.length) { this.prompt++; this.clock = 0; }
            else this.enter(step.works(this.seen) ? 'show' : 'watch');
          } else if (p.lost && p.lost(game, this.seen)) this.retry(game, step);
        } else if (this.phase === 'watch') {
          this.goal = 1;
          if (step.works(this.seen)) this.enter('show');
          else if (!game.balls.length && !game.pending.length && this.clock > .3) this.retry(game, step);
        } else if (this.phase === 'show') {
          this.goal = 1;
          if (this.clock >= step.show) this.next(game);
        }
        // The slow-down eases in and out rather than snapping.
        this.scale += (this.goal - this.scale) * Math.min(1, dt * EASE);
        if (Math.abs(this.goal - this.scale) < .005) this.scale = this.goal;
      },
      enter(phase) { this.phase = phase; this.clock = 0; },
      // A miss goes back to the prompt that sets the shot up again, with the step's uses and Split charge restored.
      retry(game, step) { this.prompt = step.retry; this.refill(); this.attempt(); this.enter('prompt'); game.fireCooldown = 0; if (step.charge) game.splitCharge = 1; },
      // The run ends with everything left on the board bursting into bloom.
      finale(game) {
        this.phase = 'finale'; this.clock = 0;
        const open = game.buds.filter(b => !b.bloomed && !b.gift);
        open.forEach((b, i) => game.pending.push({ id: b.id, when: game.time + .12 + i * .05, force: true }));
        game.lullaby = 0;
      },
      finish() { this.finished = true; this.phase = 'done'; this.scale = 1; this.goal = 1; },
      // What the card should show right now.
      view() {
        const step = this.step;
        if (this.phase === 'finale' || this.phase === 'end') return { phase: this.phase, number: STEPS.length, total: STEPS.length, title: "You're ready!", text: 'Ten levels are waiting, deeper every time.', target: null };
        if (!step) return { phase: this.phase, number: 0, total: STEPS.length, title: '', text: '', target: null };
        const p = step.prompts[this.prompt];
        const text = this.phase === 'show' ? step.done : this.phase === 'watch' ? 'Watch it go…' : p.text;
        return { phase: this.phase, number: this.index + 1, total: STEPS.length, title: step.title, text,
          target: this.phase === 'prompt' ? p.target : null, also: this.phase === 'prompt' ? p.also || null : null, finger: this.phase === 'prompt' ? p.finger || null : null };
      }
    };
    return t;
  }

  return Object.freeze({ create, steps: STEPS.map(s => ({ id: s.id, title: s.title, power: s.power || null,
    prompts: s.prompts.map(p => ({ text: p.text, target: p.target, also: p.also || null, allow: [...p.allow], finger: p.finger || null })) })), launcher: LAUNCHER, SLOW, CREEP });
});
