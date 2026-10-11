'use strict';
// The adaptive soundtrack inside sound.js: grooves, loops, layers, states and memory, against an instrumented
// Web Audio graph (a real-time context plus an offline renderer that records every node it is asked to build).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Depths = require('../depths.js');
const source = fs.readFileSync(path.join(__dirname, '../sound.js'), 'utf8');
const results = [];
const LAYERS = ['bed', 'pulse', 'kit', 'lead', 'fever', 'danger', 'bossPulse', 'bossKit'];
const GROOVES = ['home', 'meadow', 'roots', 'grotto', 'crystal', 'lake', 'fossil', 'ember', 'geode', 'briar', 'core'];
const MUSIC_BUS = 0.2, CAP = 12 * 1024 * 1024, RATE = 24000;
const MIX = { bed: 0.85, pulse: 0.8, kit: 0.75, lead: 0.72, fever: 0.6, danger: 0.8, bossPulse: 0.85, bossKit: 0.78 };

function fixture(options = {}) {
  const contexts = [], offline = [];
  class Parameter {
    constructor(value = 0) { this.value = value; this.events = []; }
    setValueAtTime(value, time) { assert(Number.isFinite(value) && Number.isFinite(time) && time >= 0); this.value = value; this.events.push({ kind: 'set', value, time }); return this; }
    linearRampToValueAtTime(value, time) { assert(Number.isFinite(value) && Number.isFinite(time)); this.events.push({ kind: 'linear', value, time }); return this; }
    exponentialRampToValueAtTime(value, time) { assert(value > 0 && Number.isFinite(value) && Number.isFinite(time)); this.events.push({ kind: 'exponential', value, time }); return this; }
    setTargetAtTime(value, time, constant) { assert(Number.isFinite(value) && Number.isFinite(time) && constant > 0); this.events.push({ kind: 'target', value, time }); return this; }
    cancelScheduledValues(time) { this.events.push({ kind: 'cancel', time }); return this; }
    cancelAndHoldAtTime(time) { this.events.push({ kind: 'hold', time }); return this; }
  }
  class Node {
    constructor(context, kind) { this.context = context; this.kind = kind; this.connections = []; this.disconnected = false; context.nodes.push(this); }
    connect(target) { this.connections.push(target); return target; }
    disconnect() { this.disconnected = true; this.connections = []; }
  }
  // The nodes both kinds of context can make.
  class Base {
    constructor(rate) { this.nodes = []; this.sampleRate = rate; this.destination = new Node(this, 'destination'); }
    createGain() { const n = new Node(this, 'gain'); n.gain = new Parameter(1); return n; }
    createBiquadFilter() { const n = new Node(this, 'filter'); n.type = 'lowpass'; n.frequency = new Parameter(350); n.Q = new Parameter(1); return n; }
    createOscillator() {
      const n = new Node(this, 'oscillator'); n.type = 'sine'; n.wave = null; n.frequency = new Parameter(440); n.detune = new Parameter(0); n.started = false; n.ended = false;
      n.setPeriodicWave = wave => { assert(wave && wave.kind === 'wave'); n.wave = wave; };
      n.start = time => { assert(!n.started); n.started = true; n.startAt = time; };
      n.stop = time => { n.stopAt = time; };
      return n;
    }
    createPeriodicWave(real, imag) { assert(real.length === imag.length && real.length > 1); return { kind: 'wave', real, imag }; }
    createBuffer(channels, length, rate) {
      assert(Number.isInteger(channels) && channels > 0 && Number.isInteger(length) && length > 0 && rate > 0);
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: channel => data[channel],
        copyToChannel(from, channel) { data[channel].set(from); } };
    }
    createBufferSource() {
      const n = new Node(this, 'source'); n.buffer = null; n.loop = false; n.started = false; n.ended = false;
      n.start = (time, offset = 0) => { assert(!n.started); n.started = true; n.startAt = time; n.offset = offset; };
      n.stop = time => { n.stopAt = time; };
      return n;
    }
  }
  class Audio extends Base {
    constructor() {
      super(48000); this.state = 'running'; this.currentTime = 0; this.suspendCalls = 0; this.resumeCalls = 0; contexts.push(this);
      // options.brokenSources: the live context refuses to start loops, the way an odd browser might.
      if (options.brokenSources) this.createBufferSource = () => { throw new Error('InvalidStateError'); };
    }
    createStereoPanner() { const n = new Node(this, 'pan'); n.pan = new Parameter(0); return n; }
    createWaveShaper() { return new Node(this, 'ceiling'); }
    createConvolver() { const n = new Node(this, 'convolver'); n.buffer = null; n.normalize = true; return n; }
    createDynamicsCompressor() { const n = new Node(this, 'compressor'); for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[key] = new Parameter(0); return n; }
    suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
    advance(seconds) {
      if (this.state !== 'running') return;
      this.currentTime += seconds;
      for (const node of this.nodes) if ((node.kind === 'oscillator' || node.kind === 'source') && node.started && !node.ended && node.stopAt <= this.currentTime + 1e-9) {
        node.ended = true; if (node.onended) node.onended();
      }
    }
  }
  class Offline extends Base {
    constructor(channels, length, rate) {
      if (options.rates && !options.rates.includes(rate)) throw new Error('NotSupportedError');
      super(rate); this.channels = channels; this.length = length; this.rendered = false; offline.push(this);
    }
    startRendering() {
      assert(!this.rendered, 'each offline context renders once'); this.rendered = true;
      const buffer = this.createBuffer(this.channels, this.length, this.sampleRate);
      if (!options.manual) return Promise.resolve(buffer);
      return new Promise(resolve => { this.finish = () => resolve(buffer); });
    }
  }
  const sandbox = { console }, timers = [];
  let clock = 0;
  // With options.timers, tasks queue up for the test to run, and every clock reading moves time on by .25 ms.
  if (options.timers) { sandbox.setTimeout = fn => { timers.push(fn); return timers.length; }; sandbox.performance = { now: () => (clock += 0.25) }; }
  sandbox.AudioContext = Audio;
  if (!options.noOffline) sandbox.OfflineAudioContext = Offline;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return {
    sound: sandbox.BloomSound, contexts, offline, timers,
    // Runs the queued tasks one at a time (and the promise jobs between them), counting how much each one did.
    async drain(perTask = []) {
      for (let guard = 0; guard < 5000 && timers.length; guard++) {
        const before = clock; timers.shift()(); perTask.push(clock - before);
        await new Promise(resolve => setImmediate(resolve));
      }
      return perTask;
    },
    get context() { return contexts[contexts.length - 1]; },
    tick(seconds) { for (const context of contexts) context.advance(seconds); },
    frame(state) { return sandbox.BloomSound.music.frame(state); },
    sources() { return this.context.nodes.filter(n => n.kind === 'source' && n.loop); },
    playing() { return this.sources().filter(n => n.started && !n.ended && !n.disconnected); },
    // The music's own chain: level gain -> lowpass (Q .6) -> bus gain.
    mixer() {
      const filter = this.context.nodes.find(n => n.kind === 'filter' && n.Q.value === 0.6);
      if (!filter) return null;
      const level = this.context.nodes.find(n => n.kind === 'gain' && n.connections.includes(filter));
      return { level, filter, bus: filter.connections[0] };
    }
  };
}
// Lets every pending render finish (renders resolve through promise jobs, one after another).
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const last = parameter => parameter.events[parameter.events.length - 1];
// Where a parameter ends up: its last scheduled value, or its plain value when nothing was scheduled.
const level = parameter => parameter.events.length ? last(parameter).value : parameter.value;
const inKey = frequency => { const semis = 12 * Math.log2(frequency / 261.6255653); const pc = ((Math.round(semis) % 12) + 12) % 12; return Math.abs(semis - Math.round(semis)) < 0.01 && [0, 2, 4, 5, 7, 9, 11].includes(pc); };
const pitchClass = f => ((Math.round(12 * Math.log2(f / 261.6255653)) % 12) + 12) % 12;
const on = snap => LAYERS.filter(layer => snap.layers[layer] > 0);
// A rendered note: an oscillator feeding straight into an envelope that rises from silence. Overtones feed their
// own decaying gains, which never start from zero, so they are not counted as notes.
const notesOf = ox => ox.nodes.filter(n => n.kind === 'oscillator' && n.connections[0] && n.connections[0].kind === 'gain' &&
  n.connections[0].gain.events.length && n.connections[0].gain.events[0].kind === 'set' && n.connections[0].gain.events[0].value === 0)
  .map(n => ({ f: last(n.frequency).value, detune: n.detune.value, at: n.startAt, osc: n }));
// Plays a groove with every layer on (and then its boss pair), so each of its eight loops gets rendered.
async function renderAll(h, groove) {
  const state = { route: 'game', groove, heat: 1, threat: 1, superBloom: true };
  const before = h.offline.length;
  h.frame(state); await settle(); h.frame({ ...state, boss: true }); await settle(); h.frame({ ...state, boss: true });
  return h.offline.slice(before);
}
async function playing(groove, state = {}, options = {}) {
  const h = fixture(options); h.sound.wake(); h.tick(1);
  h.frame({ route: 'game', groove, ...state }); await settle(); h.tick(0.1);
  return { h, snap: h.frame({ route: 'game', groove, ...state }) };
}
async function test(name, run) {
  const started = Date.now();
  try { await run(); results.push({ name, passed: true }); if (process.env.SOUND_TEST_TIMING) console.error(Date.now() - started, 'ms', name); }
  catch (error) { results.push({ name, passed: false, error: error.stack || error.message }); }
}

async function main() {
  await test('The groove table covers levels 1-10 and home; every groove is its own 4-bar loop at 96-112 BPM, mono at 24 kHz', async () => {
    const keys = Depths.levels.map(level => level.key);
    assert.equal(keys.length, 10);
    assert.deepEqual(keys, GROOVES.slice(1), 'each level key names its groove');
    const fingerprints = new Set();
    for (const groove of GROOVES) {
      const h = fixture(); h.sound.wake(); h.tick(1);
      const renders = await renderAll(h, groove);
      const snap = h.frame({ route: 'game', groove, heat: 1, threat: 1, superBloom: true, boss: true });
      assert.equal(snap.groove, groove, `${groove} plays its own groove, not a fallback`);
      assert(snap.playing);
      const bpm = 60 / snap.beat;
      assert(bpm >= 96 - 0.01 && bpm <= 112 + 0.01, `${groove} at ${bpm.toFixed(1)} BPM`);
      assert.equal(renders.length, LAYERS.length, `${groove} renders bed, pulse, kit, lead, fever, danger and the boss pair`);
      for (const ox of renders) {
        assert.equal(ox.channels, 1, 'mono'); assert.equal(ox.sampleRate, RATE, '24 kHz');
        assert(Math.abs(ox.length - (16 * snap.beat + 2) * RATE) < 1.5, `${groove}: ${ox.length} samples for sixteen beats plus a tail that folds back over the loop point (${(16 * snap.beat + 2) * RATE})`);
        assert(notesOf(ox).length + ox.nodes.filter(n => n.kind === 'source').length > 0, 'every layer has something to play');
      }
      // Every loop is exactly sixteen beats long, so all layers line up.
      for (const loop of h.sources()) assert(Math.abs(loop.buffer.length - 16 * snap.beat * RATE) <= 1);
      fingerprints.add(renders.map(ox => notesOf(ox).map(n => `${n.at.toFixed(3)}:${n.f.toFixed(2)}`).join(',')).join('|'));
    }
    assert.equal(fingerprints.size, GROOVES.length, 'the eleven grooves (variants included) all sound different');
    // Menus and endless Rush use home; a groove the music does not know falls back to home rather than silence.
    const menu = fixture(); menu.sound.wake(); menu.tick(1); menu.frame({ route: 'levels' }); await settle();
    assert.equal(menu.frame({ route: 'levels' }).groove, 'home');
    const unknown = fixture(); unknown.sound.wake(); unknown.tick(1);
    assert.equal(unknown.frame({ route: 'game', groove: 'nowhere' }).groove, 'home');
  });

  await test('Every note of every loop is in C major, between 60 Hz and 2.1 kHz', async () => {
    let counted = 0;
    for (const groove of GROOVES) {
      const h = fixture(); h.sound.wake(); h.tick(1);
      for (const ox of await renderAll(h, groove)) for (const note of notesOf(ox)) {
        assert(inKey(note.f), `${groove}: ${note.f.toFixed(2)} Hz is in C major`);
        assert(note.f >= 60 && note.f <= 2100, `${groove}: ${note.f.toFixed(1)} Hz`);
        assert(Math.abs(note.detune) <= 10, 'detune only thickens a note, never moves it');
        // Glides end on the note: every frequency event that starts a glide is above or at its target.
        assert(note.osc.frequency.events.every(e => e.value >= note.f - 1e-6));
        counted++;
      }
      // Noise only ever comes through the brush filters, which stay under 3.6 kHz.
      for (const ox of h.offline) for (const filter of ox.nodes.filter(n => n.kind === 'filter')) assert(filter.frequency.value <= 3600);
    }
    assert(counted > 3000, `${counted} notes checked`);
  });

  await test('Two waves before the boss its pulse and kit render ahead, so its groove is ready when it lands, but stay silent', async () => {
    const plain = fixture(), soon = fixture();
    for (const h of [plain, soon]) { h.sound.wake(); h.tick(1); }
    for (let i = 0; i < 12; i++) { plain.frame({ route: 'game', groove: 'meadow' }); soon.frame({ route: 'game', groove: 'meadow', bossSoon: true }); await settle(); }
    assert.equal(plain.offline.length, LAYERS.length - 2, 'otherwise the boss pair waits for the boss');
    assert.equal(soon.offline.length, LAYERS.length, 'every layer, the boss pair included, is rendered');
    assert.deepEqual(on(soon.frame({ route: 'game', groove: 'meadow', bossSoon: true })), on(plain.frame({ route: 'game', groove: 'meadow' })));
  });
  await test('Layer targets follow heat and threat; a boss wave swaps in its own pulse and kit', async () => {
    const cases = [
      [{ heat: 0 }, ['bed']], [{ heat: 0.19 }, ['bed']], [{ heat: 0.2 }, ['bed', 'pulse']], [{ heat: 0.45 }, ['bed', 'pulse', 'kit']],
      [{ heat: 0.7 }, ['bed', 'pulse', 'kit', 'lead']], [{ heat: 0.3, superBloom: true }, ['bed', 'pulse', 'lead', 'fever']],
      [{ threat: 0.49 }, ['bed']], [{ threat: 0.5 }, ['bed', 'danger']], [{ heat: 1, threat: 1, superBloom: true }, ['bed', 'pulse', 'kit', 'lead', 'fever', 'danger']],
      [{ boss: true }, ['bed', 'bossPulse']], [{ boss: true, heat: 0.5 }, ['bed', 'bossPulse', 'bossKit']],
      [{ boss: true, heat: 1, threat: 1, superBloom: true }, ['bed', 'lead', 'fever', 'danger', 'bossPulse', 'bossKit']]
    ];
    for (const [state, expected] of cases) {
      const { h, snap } = await playing('meadow', state);
      assert.deepEqual(on(snap), expected, JSON.stringify(state));
      for (const layer of expected) assert.equal(snap.layers[layer], MIX[layer]);
      // The live gains land on the targets once each loop is in.
      await settle(); h.frame({ route: 'game', groove: 'meadow', ...state });
      for (const loop of h.playing()) {
        const value = level(loop.connections[0].gain);
        assert(value === 0 || Object.values(MIX).includes(value));
      }
      const live = h.playing().map(loop => level(loop.connections[0].gain)).filter(v => v > 0).sort();
      assert.deepEqual(live, expected.map(layer => MIX[layer]).sort(), `${JSON.stringify(state)}: the playing loops match the targets`);
    }
    // Menus play the home bed alone, whatever the game was doing.
    const { snap: menu } = await playing('home', {}, {});
    assert.deepEqual(on(menu), ['bed']);
    const m = fixture(); m.sound.wake(); m.tick(1); m.frame({ route: 'levels', heat: 1, threat: 1, superBloom: true, boss: true }); await settle();
    assert.deepEqual(on(m.frame({ route: 'levels', heat: 1, threat: 1, superBloom: true, boss: true })), ['bed']);
    // Heat and threat rise at once but fall slowly, so the layers leave one by one after a chain.
    const { h } = await playing('meadow', { heat: 0.8 });
    const fall = [];
    for (let i = 0; i < 30; i++) { h.tick(0.1); fall.push(on(h.frame({ route: 'game', groove: 'meadow', heat: 0 })).join('+')); }
    const steps = fall.filter((value, i) => i === 0 || value !== fall[i - 1]);
    assert.deepEqual(steps, ['bed+pulse+kit+lead', 'bed+pulse+kit', 'bed+pulse', 'bed'], 'lead, then kit, then pulse');
    const { h: t } = await playing('meadow', { threat: 0.9 });
    for (let i = 0; i < 5; i++) { t.tick(0.1); t.frame({ route: 'game', groove: 'meadow', threat: 0 }); }
    assert(on(t.frame({ route: 'game', groove: 'meadow' })).includes('danger'), 'danger lingers a moment');
    t.tick(2); assert(!on(t.frame({ route: 'game', groove: 'meadow' })).includes('danger'), 'then leaves');
    // A chain that only brushes a threshold still brings its layer in for two whole beats: no stutter.
    const { h: f, snap: first } = await playing('meadow', { heat: 0.5 });
    assert(on(first).includes('kit'));
    const ticks = [];
    for (let i = 0; i < 30; i++) { f.tick(0.05); ticks.push(on(f.frame({ route: 'game', groove: 'meadow', heat: 0.3 })).includes('kit')); }
    const held = ticks.indexOf(false) * 0.05 + 0.1;
    // (The heat itself takes a moment to fall from .5 below .45; the two beats count from then.)
    assert(held >= 2 * first.beat && held <= 2 * first.beat + 0.3, `kit held ${held.toFixed(2)} s, two beats after the heat fell`);
    // The boss swap is clean: the regular pulse leaves at once when a boss wave starts.
    f.frame({ route: 'game', groove: 'meadow', heat: 0.5 });
    assert.deepEqual(on(f.frame({ route: 'game', groove: 'meadow', heat: 0.5, boss: true })), ['bed', 'bossPulse', 'bossKit']);
    // So does the Super Bloom sparkle when Super Bloom ends.
    f.frame({ route: 'game', groove: 'meadow', heat: 1, superBloom: true }); f.tick(0.1);
    assert(!on(f.frame({ route: 'game', groove: 'meadow', heat: 1 })).includes('fever'));
  });

  await test('Changes land on the next beat with 120 ms ramps, and every loop is phase-locked to one start time', async () => {
    const { h, snap } = await playing('crystal', { heat: 0 });
    const origin = snap.origin, beat = snap.beat, span = 16 * beat;
    const onGrid = time => Math.abs((time - origin) / beat - Math.round((time - origin) / beat)) < 1e-6;
    assert(snap.playing && Number.isFinite(origin));
    const loops = h.sources();
    assert.equal(loops.length, 6, 'the six regular layers all loop, silent until wanted');
    for (const loop of loops) {
      assert(loop.loop && loop.started);
      assert(onGrid(loop.startAt) || loop.startAt === origin, 'each loop starts on a beat');
      assert(Math.abs(loop.offset - (((loop.startAt - origin) % span) + span) % span) < 1e-6, 'at the point of the loop the groove has reached');
    }
    let checked = 0;
    for (const delay of [0.37, 0.91, 1.23, 2.6]) {
      h.tick(delay);
      const now = h.context.currentTime, heat = delay > 1 ? 0 : 0.5;
      for (let i = 0; i < 3; i++) h.frame({ route: 'game', groove: 'crystal', heat });
      for (const loop of h.sources()) {
        const events = loop.connections[0].gain.events, ramp = events[events.length - 1], set = events[events.length - 2];
        if (!ramp || ramp.time < now) continue;
        assert.equal(set.kind, 'set'); assert.equal(ramp.kind, 'linear');
        assert(onGrid(set.time) && set.time >= now && set.time <= now + beat + 0.03, 'the change waits for the next beat');
        assert(Math.abs(ramp.time - set.time - 0.12) < 1e-9, 'and ramps over 120 ms');
        checked++;
      }
    }
    assert(checked >= 4, `${checked} changes checked`);
    // A boss wave's loops join on a later beat at the same phase.
    h.tick(0.53); h.frame({ route: 'game', groove: 'crystal', boss: true, heat: 0.6 }); await settle(); h.tick(0.05);
    h.frame({ route: 'game', groove: 'crystal', boss: true, heat: 0.6 });
    const boss = h.sources().slice(6);
    assert.equal(boss.length, 2);
    for (const loop of boss) {
      assert(onGrid(loop.startAt) && loop.startAt >= h.context.currentTime - 0.1);
      assert(Math.abs(loop.offset - (((loop.startAt - origin) % span) + span) % span) < 1e-6);
    }
    assert.equal(new Set(h.sources().map(loop => loop.buffer.duration.toFixed(6))).size, 1, 'one loop length for every layer');
  });

  await test('The bed renders first and starts alone, so music begins as soon as one loop is ready', async () => {
    const h = fixture({ manual: true }); h.sound.wake(); h.tick(1);
    const state = { route: 'game', groove: 'ember', heat: 1, threat: 1, superBloom: true };
    let snap = h.frame(state);
    assert.equal(snap.rendering, 'ember:bed'); assert.equal(h.offline.length, 1, 'one render at a time');
    const order = [];
    for (let i = 0; i < 6; i++) {
      order.push(snap.rendering.split(':')[1]);
      h.offline[h.offline.length - 1].finish(); await settle(); h.tick(0.05);
      snap = h.frame(state);
      if (i === 0) { assert(snap.playing, 'the bed plays on its own'); assert.equal(h.sources().length, 1); }
    }
    assert.deepEqual(order, ['bed', 'pulse', 'kit', 'lead', 'fever', 'danger']);
    assert.equal(h.sources().length, 6);
    // The offline renderer may refuse 24 kHz; the next rate is tried.
    const strict = fixture({ rates: [22050] }); strict.sound.wake(); strict.tick(1); strict.frame({ route: 'game', groove: 'meadow' }); await settle();
    assert(strict.frame({ route: 'game', groove: 'meadow' }).playing);
    assert(strict.offline.every(ox => ox.sampleRate === 22050));
    // Leaving a groove drops its pending renders.
    const switcher = fixture({ manual: true }); switcher.sound.wake(); switcher.tick(1);
    switcher.frame({ route: 'game', groove: 'lake', heat: 1 }); assert(switcher.frame({ route: 'game', groove: 'lake', heat: 1 }).queued > 0);
    const next = switcher.frame({ route: 'game', groove: 'geode' });
    switcher.offline[0].finish(); await settle();
    assert.equal(switcher.frame({ route: 'game', groove: 'geode' }).rendering, 'geode:bed');
  });

  await test('Rendering never blocks a frame: each loop is made in later tasks, a slice of about 2 ms at a time', async () => {
    const h = fixture({ timers: true }); h.sound.wake(); h.tick(1);
    h.timers.length = 0;
    const state = { route: 'game', groove: 'core', heat: 1, threat: 1, superBloom: true };
    const snap = h.frame(state);
    assert.equal(snap.rendering, 'core:bed'); assert.equal(h.offline.length, 0, 'the frame itself builds nothing');
    const tasks = await h.drain();
    assert(h.offline.length >= 6, 'then every wanted loop renders');
    assert(tasks.length > h.offline.length * 2, `${tasks.length} tasks for ${h.offline.length} loops: big loops take several slices`);
    // Each slice stops once its 2 ms are up (one job may straddle the line; a job is one note).
    assert(Math.max(...tasks) <= 6, `the longest task read the clock for ${Math.max(...tasks)} ms`);
    h.tick(0.1); assert(h.frame(state).playing);
  });

  await test('Silent when the Music switch or the sound is off, and quiet states follow the screen', async () => {
    // Music off: the groove fades and stops, and nothing new is rendered or started.
    const { h } = await playing('lake', { heat: 1 });
    const band = h.playing(), renders = h.offline.length;
    h.sound.setMusic(false);
    const now = h.context.currentTime;
    for (const loop of band) assert(loop.stopAt <= now + 0.5, 'every loop stops');
    for (let i = 0; i < 10; i++) { h.tick(0.1); const snap = h.frame({ route: 'game', groove: 'lake', heat: 1 }); assert.equal(snap.playing, false); assert.equal(snap.groove, null); }
    assert.equal(h.offline.length, renders); assert.equal(h.playing().length, 0);
    h.sound.setMusic(true); h.frame({ route: 'game', groove: 'lake', heat: 1 }); await settle();
    assert(h.frame({ route: 'game', groove: 'lake', heat: 1 }).playing, 'switching it back on brings the music back');
    // Sound off silences the music too.
    const { h: s } = await playing('core', { heat: 0.5 });
    s.sound.setEnabled(false);
    const at = s.context.currentTime;
    for (const loop of s.playing()) assert(loop.stopAt <= at + 0.2);
    s.tick(0.5); assert.equal(s.frame({ route: 'game', groove: 'core' }).playing, false);
    // With sound off from the start, the music never even renders.
    const off = fixture(); off.sound.setEnabled(false); off.sound.wake();
    assert.equal(off.frame({ route: 'game', groove: 'meadow', heat: 1 }).playing, false); await settle();
    assert.equal(off.offline.length, 0);
    // Pause and dialogs: 40% and a 900 Hz lowpass. Menus: -6 dB and open.
    const { h: p } = await playing('grotto', { heat: 0.5 });
    const mix = p.mixer();
    assert(mix && mix.bus && mix.level, 'level -> lowpass -> bus');
    assert.equal(mix.bus.gain.value, MUSIC_BUS, 'the music bus sits at .2');
    p.frame({ route: 'game', groove: 'grotto', heat: 0.5, paused: true });
    assert(Math.abs(last(mix.level.gain).value - 0.4) < 1e-9); assert.equal(last(mix.filter.frequency).value, 900);
    p.tick(0.5); p.frame({ route: 'game', groove: 'grotto', heat: 0.5 });
    assert.equal(last(mix.level.gain).value, 1); assert.equal(last(mix.filter.frequency).value, 4200);
    p.frame({ route: 'levels' });
    assert(Math.abs(last(mix.level.gain).value - Math.pow(10, -6 / 20)) < 1e-9);
    // The result card: the groove fades out over .6 s.
    const { h: r } = await playing('fossil', { heat: 0.5 });
    const loops = r.playing(), start = r.context.currentTime;
    const snap = r.frame({ route: 'game', groove: 'fossil', heat: 0.5, result: true });
    assert.equal(snap.groove, null);
    const groupGain = loops[0].connections[0].connections[0].kind === 'pan' ? loops[0].connections[0].connections[0].connections[0] : loops[0].connections[0].connections[0];
    const fade = last(groupGain.gain);
    assert.equal(fade.value, 0); assert(Math.abs(fade.time - start - 0.6) < 1e-9);
    for (const loop of loops) assert(loop.stopAt <= start + 0.66);
    r.tick(1); assert.equal(r.playing().length, 0, 'the faded loops end and let go');
    // A hidden page suspends the audio, and coming back resumes it.
    const { h: v } = await playing('meadow');
    v.frame({ hidden: true }); assert.equal(v.context.suspendCalls, 1); assert.equal(v.context.state, 'suspended');
    v.frame({ hidden: true }); assert.equal(v.context.suspendCalls, 1, 'once');
    v.frame({ hidden: false, route: 'game', groove: 'meadow' }); await settle();
    assert.equal(v.context.resumeCalls, 1); assert.equal(v.context.state, 'running');
  });

  await test('Big moments duck the music 4 dB for .25 s, and muffle sweeps its lowpass down and back', async () => {
    for (const [type, data] of [['finale', { x: 210, type: 'gold' }], ['superBloom', { time: 6 }], ['boss', { bud: { x: 210 } }]]) {
      const { h } = await playing('briar', { heat: 0.5 });
      const bus = h.mixer().bus, now = h.context.currentTime;
      h.sound.play(type, data);
      const dip = bus.gain.events.filter(e => e.time >= now - 1e-9 && e.kind !== 'cancel' && e.kind !== 'hold');
      const low = MUSIC_BUS * Math.pow(10, -4 / 20);
      assert(dip.some(e => Math.abs(e.value - low) < 1e-9 && e.time <= now + 0.05), `${type} ducks the music by 4 dB`);
      const held = dip.filter(e => Math.abs(e.value - low) < 1e-9), back = dip[dip.length - 1];
      assert(Math.max(...held.map(e => e.time)) - now >= 0.25 - 1e-9, 'for a quarter second'); assert.equal(back.value, MUSIC_BUS); assert(back.time - now <= 0.6, 'then comes back');
    }
    const { h } = await playing('geode', { heat: 0.5 });
    const filter = h.mixer().filter, now = h.context.currentTime;
    h.sound.muffle(0.75, 0.5);
    const sweep = filter.frequency.events.filter(e => e.time >= now - 1e-9 && e.value !== undefined);
    const low = 4200 * 0.25 + 300, down = sweep.find(e => Math.abs(e.value - low) < 1e-6);
    assert(down && down.time <= now + 0.1, 'down to 4200 x (1 - amount) + 300 Hz');
    const lastLow = Math.max(...sweep.filter(e => Math.abs(e.value - low) < 1e-6).map(e => e.time)), end = sweep[sweep.length - 1];
    assert(lastLow - now >= 0.5, 'held for the given seconds'); assert.equal(end.value, 4200); assert(end.time - now <= 1.1, 'and back');
    // A pause during the muffle keeps the pause filter as the place it returns to.
    h.frame({ route: 'game', groove: 'geode', heat: 0.5, paused: true });
    assert.equal(last(filter.frequency).value, 900);
  });

  await test('The cache stays under 12 MB with least-recently-used eviction, never dropping the loops that play', async () => {
    const h = fixture(); h.sound.wake(); h.tick(1);
    let rendered = 0;
    for (const groove of [...GROOVES, 'meadow', 'core']) {
      const before = h.offline.length;
      await renderAll(h, groove); h.tick(0.2);
      const snap = h.frame({ route: 'game', groove, heat: 1, threat: 1, superBloom: true, boss: true });
      rendered += h.offline.slice(before).reduce((sum, ox) => sum + Math.round(16 * snap.beat * ox.sampleRate) * 4, 0);
      assert(snap.cacheBytes <= CAP, `${groove}: ${(snap.cacheBytes / 1048576).toFixed(2)} MB cached`);
      assert(snap.cacheBytes > 0 && snap.cached >= 8, 'the playing groove keeps all eight loops');
      for (let i = 0; i < 6; i++) { h.tick(0.1); h.frame({ route: 'game', groove, heat: 1, threat: 1, superBloom: true, boss: true }); }
      h.tick(1);
    }
    assert(rendered > 3 * CAP, 'the cap was really tested');
    // The groove just left is still (partly) cached; the oldest one has to render again in full.
    const recent = h.offline.length; await renderAll(h, 'meadow'); const recentRenders = h.offline.length - recent; h.tick(1);
    assert(recentRenders < LAYERS.length, 'meadow was played moments ago, so some of its loops are still cached');
    const old = h.offline.length; await renderAll(h, 'grotto');
    assert.equal(h.offline.length - old, LAYERS.length, 'grotto was the least recently used, so it was evicted');
    assert(h.frame({ route: 'game', groove: 'grotto' }).cacheBytes <= CAP);
  });

  await test('Without an offline renderer the music is silently off; cues and other states still work', async () => {
    const h = fixture({ noOffline: true }); h.sound.wake(); h.tick(1);
    for (const state of [{ route: 'game', groove: 'core', heat: 1, threat: 1, superBloom: true, boss: true }, { route: 'levels' }, { route: 'game', paused: true }]) {
      const snap = h.frame(state); assert.equal(snap.playing, false); assert.equal(snap.groove, null);
    }
    await settle();
    assert.equal(h.sources().length, 0); h.sound.muffle(0.75, 0.5); h.sound.music.stop();
    h.sound.play('finale', { x: 210 }); h.sound.play('bloom', { combo: 1, seedStep: 2 });
    assert(h.context.nodes.some(n => n.kind === 'oscillator'), 'cues still play');
  });

  await test('A music failure never reaches the game: frame() stays safe, the music goes quiet and cues carry on', async () => {
    const h = fixture({ brokenSources: true }); h.sound.wake(); h.tick(1);
    const state = { route: 'game', groove: 'meadow', heat: 1, threat: 1 };
    let snap = null;
    assert.doesNotThrow(() => { snap = h.frame(state); });
    await settle(); h.tick(0.1);
    // The bed is rendered and the live context throws while starting it: the frame still returns a snapshot.
    for (let i = 0; i < 5; i++) assert.doesNotThrow(() => { snap = h.frame({ ...state, heat: i / 4 }); h.tick(0.1); });
    assert.equal(snap.playing, false); assert.equal(snap.groove, null); assert.equal(snap.queued, 0);
    assert.doesNotThrow(() => { h.sound.muffle(0.75, 0.5); h.sound.music.stop(); h.frame({ hidden: true }); h.frame({ hidden: false }); });
    const before = h.context.nodes.length; h.sound.play('bloom', { combo: 1, seedStep: 2 });
    assert(h.context.nodes.slice(before).some(n => n.kind === 'oscillator'), 'cues still play');
    // The same failure inside frame() itself (cached loops attach there when a groove comes back) is caught too.
    const { h: back } = await playing('meadow'); back.frame({ route: 'levels' }); await settle(); back.tick(0.1);
    assert(back.frame({ route: 'levels' }).playing, 'a healthy context plays');
    back.context.createBufferSource = () => { throw new Error('InvalidStateError'); };
    let again = null;
    assert.doesNotThrow(() => { again = back.frame({ route: 'game', groove: 'meadow', heat: 1 }); });
    assert.equal(again.playing, false); assert.equal(back.frame({ route: 'game', groove: 'meadow' }).playing, false, 'and it stays quiet');
    back.tick(1); assert.equal(back.playing().length, 0, 'no loop is left running');
  });

  await test('Blooms climb the chord the music is playing right now', async () => {
    const { h, snap } = await playing('crystal');
    // Crystal: Fmaj7 | G6 | Em7 | Am7, one chord a bar.
    const triads = [[5, 9, 0], [7, 11, 2], [4, 7, 11], [9, 0, 4]];
    const into = snap.origin + 0.5 * snap.beat - h.context.currentTime;
    h.tick(into);
    for (let bar = 0; bar < 4; bar++) {
      const pitches = [];
      for (let k = 0; k < 6; k++) {
        const before = new Set(h.context.nodes);
        h.sound.play('bloom', { combo: 1 + k, seedStep: k, bud: { x: 210, type: 'gold' } });
        const voice = h.context.nodes.find(n => !before.has(n) && n.kind === 'oscillator');
        pitches.push(last(voice.frequency).value);
        h.tick(0.03);
      }
      for (const f of pitches) assert(triads[bar].includes(pitchClass(f)), `bar ${bar + 1}: ${f.toFixed(1)} Hz is a chord tone`);
      assert.equal(pitchClass(pitches[0]), triads[bar][0], 'the first seed rings the root');
      for (let k = 1; k < pitches.length; k++) assert(pitches[k] > pitches[k - 1], 'and the seeds climb');
      h.tick(4 * snap.beat - 0.18);
    }
    // With the music off, the same seeds walk the garden chords instead.
    h.sound.setMusic(false); h.tick(1);
    const before = new Set(h.context.nodes);
    h.sound.play('bloom', { combo: 1, seedStep: 0 });
    assert.equal(pitchClass(last(h.context.nodes.find(n => !before.has(n) && n.kind === 'oscillator').frequency).value), 0, 'C, the first garden chord');
  });

  await test('Budget: six to eight looping sources and no new nodes from frame to frame', async () => {
    const { h } = await playing('core', { heat: 1, threat: 1, superBloom: true });
    await renderAll(h, 'core'); h.tick(0.1);
    h.frame({ route: 'game', groove: 'core', heat: 1, threat: 1, superBloom: true, boss: true });
    const loops = h.playing();
    assert(loops.length >= 6 && loops.length <= 8, `${loops.length} loops`);
    const count = h.context.nodes.length;
    for (let i = 0; i < 200; i++) {
      h.tick(1 / 60);
      h.frame({ route: 'game', groove: 'core', heat: (i % 40) / 30, threat: (i % 25) / 20, superBloom: i % 90 < 30, boss: true, paused: i % 70 > 60 });
    }
    assert.equal(h.context.nodes.length, count, 'mixing reuses the same nodes');
    // Automation stays bounded: each change replaces the lane instead of piling up events.
    for (const loop of loops) assert(loop.connections[0].gain.events.length < 400);
  });

  const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
    limits: 'Instrumented Web Audio graph and offline-render scheduling tests; the rendered audio itself, perceived loudness and phone speakers need listening on a device.', results };
  console.log(JSON.stringify(report, null, 2)); if (report.failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
