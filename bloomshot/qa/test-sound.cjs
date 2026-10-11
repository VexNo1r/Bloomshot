'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../sound.js'), 'utf8');
const results = [];
const MAX_VOICES = 16, MAX_OSCILLATORS = 40;
// Every cue the game sends, with the data its call sites pass.
const CUES = [
  ['bloom', { combo: 1, bud: { x: 100 } }], ['bloom', { combo: 7, chain: true, bud: { x: 300 } }], ['bloom', { combo: 14 }], ['bloom', { combo: 19 }],
  ['bounce', { kind: 'wall', x: 10 }], ['bounce', { kind: 'bumper', x: 200 }], ['bounce', { kind: 'rock', x: 400 }],
  ['launch', {}], ['launch', { wave: 2, count: 3 }], ['rotate', { bumper: {} }], ['tap', {}], ['crack', { bud: { x: 90 }, chain: true }],
  ['won', { bonus: 500, stars: 3 }], ['won', { wave: 10, lives: 1, stars: 1 }], ['burst', { combo: 12, bud: { x: 210 } }], ['split', { x: 200, count: 2 }],
  ['wave', { wave: 1 }], ['wave', { wave: 10, boss: true }], ['cleared', { wave: 3 }], ['plant', { x: 120 }], ['gate', { x: 300 }], ['current', { x: 50 }],
  ['shimmer', { combo: 5 }], ['shimmer', { combo: 20 }],
  ['friend', { kind: 'cat' }], ['friend', { kind: 'bluebird' }], ['friend', { kind: 'frog' }], ['friend', { kind: 'bee' }], ['friend', { kind: 'firefly' }], ['friend', { kind: 'squirrel' }],
  ['life', { lives: 2, x: 200 }], ['puff', { bud: { x: 210 }, count: 3 }], ['shield', { x: 210, shell: true }], ['boss', { bud: { x: 210 } }], ['drop', { wave: 3, buds: 4 }],
  ['geode', { bud: { x: 210 }, count: 3 }], ['regrow', { x: 210, count: 4 }], ['arm', { power: 'sunburst' }], ['arm', { power: null }],
  ['power', { power: 'sunburst' }], ['power', { power: 'dandelion' }], ['power', { power: 'beeline' }], ['power', { power: 'lullaby' }],
  ['sunburst', { x: 210, count: 5 }], ['bee', { x: 210 }], ['giftAppear', { power: 'bee', x: 210 }], ['gift', { power: 'bee', x: 210 }], ['gift', {}],
  ['fever', { combo: 12 }], ['lost', {}], ['lost', { wave: 4 }], ['star', { index: 0 }], ['star', { index: 1 }], ['star', { index: 2 }]
];
function fixture(options = {}) {
  const contexts = []; let wallTime = 100000;
  class Parameter {
    constructor(value = 0) { this.value = value; this.events = []; if (options.legacy) this.cancelAndHoldAtTime = undefined; }
    setValueAtTime(value, time) { assert(Number.isFinite(value) && Number.isFinite(time)); this.value = value; this.events.push({ kind: 'set', value, time }); return this; }
    linearRampToValueAtTime(value, time) { assert(Number.isFinite(value) && Number.isFinite(time)); this.events.push({ kind: 'linear', value, time }); return this; }
    exponentialRampToValueAtTime(value, time) { assert(value > 0 && Number.isFinite(value) && Number.isFinite(time)); this.events.push({ kind: 'exponential', value, time }); return this; }
    cancelScheduledValues(time) { this.events.push({ kind: 'cancel', time }); return this; }
    cancelAndHoldAtTime(time) { this.events.push({ kind: 'hold', time }); return this; }
  }
  class Node {
    constructor(context, kind) { this.context = context; this.kind = kind; this.connections = []; this.disconnected = false; context.nodes.push(this); }
    connect(target) { this.connections.push(target); return target; }
    disconnect() { this.disconnected = true; this.connections = []; }
  }
  class Audio {
    constructor(init) {
      this.options = init; this.state = options.suspended ? 'suspended' : 'running'; this.currentTime = 0; this.sampleRate = 44100;
      this.nodes = []; this.buffers = []; this.resumeCalls = 0; this.pendingResume = []; this.destination = new Node(this, 'destination'); contexts.push(this);
      if (options.legacy) this.createStereoPanner = undefined;
      if (options.noConvolver) this.createConvolver = undefined;
      if (options.noBuffer) this.createBuffer = undefined;
      if (options.noCompressor) this.createDynamicsCompressor = undefined;
    }
    createGain() { const n = new Node(this, 'gain'); n.gain = new Parameter(1); return n; }
    createBiquadFilter() { const n = new Node(this, 'filter'); n.frequency = new Parameter(350); n.Q = new Parameter(1); return n; }
    createWaveShaper() { return new Node(this, 'ceiling'); }
    createStereoPanner() { const n = new Node(this, 'pan'); n.pan = new Parameter(0); return n; }
    createConvolver() {
      if (options.convolverThrows) throw new Error('NotSupportedError');
      const n = new Node(this, 'convolver'); n.normalize = true; let buffer = null;
      Object.defineProperty(n, 'buffer', { get: () => buffer, set: value => { if (options.bufferRejected) throw new Error('NotSupportedError'); buffer = value; } });
      return n;
    }
    createDynamicsCompressor() {
      if (options.compressorThrows) throw new Error('NotSupportedError');
      const n = new Node(this, 'compressor');
      for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[key] = new Parameter(0);
      return n;
    }
    createBuffer(channels, length, rate) {
      assert(Number.isInteger(channels) && channels > 0 && Number.isInteger(length) && length > 0 && rate > 0);
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      const buffer = { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: channel => data[channel] };
      this.buffers.push(buffer); return buffer;
    }
    createOscillator() {
      const n = new Node(this, 'oscillator'); n.frequency = new Parameter(440); n.detune = new Parameter(0); n.started = false; n.ended = false;
      n.start = time => { assert(!n.started); n.started = true; n.startAt = time; };
      n.stop = time => { n.stopAt = time; };
      return n;
    }
    resume() { this.resumeCalls++; return new Promise((resolve, reject) => this.pendingResume.push({ resolve, reject })); }
    advance(seconds) {
      if (this.state !== 'running') return;
      this.currentTime += seconds;
      for (const node of this.nodes) if (node.kind === 'oscillator' && node.started && !node.ended && node.stopAt <= this.currentTime + 1e-9) {
        node.ended = true; if (node.onended) node.onended();
      }
    }
  }
  class Clock extends Date { static now() { return wallTime; } }
  const sandbox = { Date: Clock, console }, timers = [];
  if (options.timers) sandbox.setTimeout = (callback, delay) => { if (options.timers === 'throw') throw new Error('blocked'); timers.push({ callback, delay }); return timers.length; };
  if (!options.noAudio) sandbox[options.webkit ? 'webkitAudioContext' : 'AudioContext'] = Audio;
  vm.createContext(sandbox);
  if (options.random) vm.runInContext(`Math.random = ${options.random}`, sandbox);
  vm.runInContext(source, sandbox);
  return { sound: sandbox.BloomSound, contexts, timers,
    runTimers() { for (const timer of timers.splice(0)) timer.callback(); },
    get context() { return contexts[contexts.length - 1]; },
    tick(seconds) { wallTime += seconds * 1000; for (const context of contexts) context.advance(seconds); },
    async resume(reject = false) {
      const context = contexts[contexts.length - 1];
      if (!reject) context.state = 'running';
      for (const promise of context.pendingResume.splice(0)) reject ? promise.reject(new Error('blocked')) : promise.resolve();
      await Promise.resolve(); await Promise.resolve();
    },
    voices() { return this.context.nodes.filter(n => n.kind === 'oscillator' && n.onended && !n.ended && !n.disconnected); },
    oscillators() { return this.context.nodes.filter(n => n.kind === 'oscillator' && !n.ended && !n.disconnected); },
    master() { return this.context.nodes.find(n => n.kind === 'gain'); }
  };
}
// The oscillators that share a voice's envelope directly: its fundamental, plus a pad's chord notes.
const tones = (h, voice) => h.context.nodes.filter(n => n.kind === 'oscillator' && n.connections[0] === voice.connections[0]);
// Where a note's pitch automation settles (after any glide into it).
const target = osc => osc.frequency.events[osc.frequency.events.length - 1].value;
const inKey = frequency => { const semis = 12 * Math.log2(frequency / 261.6255653); const pc = ((Math.round(semis) % 12) + 12) % 12; return Math.abs(semis - Math.round(semis)) < 0.01 && [0, 2, 4, 5, 7, 9, 11].includes(pc); };
async function test(name, run) {
  const started = Date.now();
  try { await run(); results.push({ name, passed: true }); if (process.env.SOUND_TEST_TIMING) console.error(Date.now() - started, 'ms', name); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}
async function main() {
  await test('Public interface stays unchanged; audio remains lazy and unsupported browsers stay playable', () => {
    const h = fixture({ noAudio: true });
    assert.deepEqual(Object.keys(h.sound).sort(), ['play', 'setEnabled', 'wake']);
    h.sound.play('bloom'); h.sound.wake(); h.sound.setEnabled(false); h.sound.setEnabled(true);
    assert.equal(h.contexts.length, 0);
    const lazy = fixture(); lazy.sound.play('launch'); assert.equal(lazy.contexts.length, 0);
    lazy.sound.wake(); assert.equal(lazy.context.options.latencyHint, 'interactive');
  });
  await test('The first gesture cue survives async resume without duplicate resume calls', async () => {
    const h = fixture({ suspended: true }); h.sound.wake(); h.sound.wake(); h.sound.play('launch');
    assert.equal(h.context.resumeCalls, 1); assert.equal(h.voices().length, 0);
    await h.resume(); assert.equal(h.voices().length, 2);
    h.sound.wake(); assert.equal(h.voices().length, 2);
    const powered = fixture({ suspended: true }); powered.sound.wake(); powered.sound.play('power', { power: 'lullaby' });
    await powered.resume(); assert(powered.voices().length >= 4, 'A queued cue keeps the data that picks its sound');
  });
  await test('Blocked or stale unlock events never replay a backlog of old effects', async () => {
    const h = fixture({ suspended: true }); h.sound.wake();
    for (let i = 0; i < 500; i++) h.sound.play('bloom', { combo: i + 1 });
    h.tick(0.3); await h.resume(); assert.equal(h.voices().length, 0);
    const blocked = fixture({ suspended: true }); blocked.sound.wake(); blocked.sound.play('launch');
    await blocked.resume(true); blocked.sound.wake(); await blocked.resume(); assert.equal(blocked.voices().length, 0);
  });
  await test('Dense mixed events stay within sixteen voices and forty oscillators, at most four per note', () => {
    const h = fixture(); h.sound.wake(); let maxVoices = 0, maxOscillators = 0;
    const frames = 600, live = [], perNote = new Map();
    for (let frame = 0; frame < frames; frame++) {
      const before = h.context.nodes.length;
      for (const [type, data] of CUES) h.sound.play(type, Object.assign({}, data, { combo: data.combo || frame + 1, bud: { x: frame % 420 } }));
      for (const node of h.context.nodes.slice(before)) if (node.kind === 'oscillator') {
        live.push(node);
        // Each note's envelope is fed by its fundamental (or pad notes) directly and by partials through their own gains.
        const first = node.connections[0], envelope = first.gain.events[0].value > 0 ? first.connections[0] : first;
        perNote.set(envelope, (perNote.get(envelope) || 0) + 1);
      }
      for (let i = live.length - 1; i >= 0; i--) if (live[i].ended || live[i].disconnected) live.splice(i, 1);
      const voices = live.filter(n => n.onended).length;
      maxVoices = Math.max(maxVoices, voices); maxOscillators = Math.max(maxOscillators, live.length);
      assert(voices <= MAX_VOICES); assert(live.length <= MAX_OSCILLATORS);
      h.tick(1 / 120);
    }
    assert(perNote.size > 100 && Math.max(...perNote.values()) <= 4, 'No note uses more than four oscillators');
    h.tick(2); assert.equal(h.voices().length, 0); assert.equal(h.oscillators().length, 0);
    results.push({ name: 'Stress measurement', passed: true, eventsSubmitted: frames * CUES.length, maxVoices, maxOscillators });
  });
  await test('The final output curve is symmetric, finite, monotonic, and bounded below0.69', () => {
    const h = fixture(); h.sound.wake(); const ceiling = h.context.nodes.find(n => n.kind === 'ceiling');
    assert.equal(ceiling.connections[0], h.context.destination);
    const curve = ceiling.curve; assert.equal(curve.length, 2049);
    for (let i = 0; i < curve.length; i++) {
      assert(Number.isFinite(curve[i])); assert(Math.abs(curve[i]) < 0.69);
      assert(Math.abs(curve[i] + curve[curve.length - 1 - i]) < 1e-7);
      if (i) assert(curve[i] >= curve[i - 1]);
    }
    assert.equal(curve[1024], 0);
  });
  await test('The mix bus runs master, filters, a gentle compressor and a fixed trim into the ceiling', () => {
    const h = fixture(); h.sound.wake();
    const master = h.master(), compressor = h.context.nodes.find(n => n.kind === 'compressor');
    assert.equal(master.gain.value, 0.34, 'LEVEL is unchanged');
    const [highpass, lowpass] = h.context.nodes.filter(n => n.kind === 'filter');
    assert(master.connections.includes(highpass) && highpass.connections.includes(lowpass) && lowpass.connections.includes(compressor));
    assert(compressor.threshold.value < 0 && compressor.ratio.value > 1 && compressor.ratio.value <= 4 && compressor.knee.value > 0, 'Gentle settings');
    const trim = compressor.connections[0], ceiling = h.context.nodes.find(n => n.kind === 'ceiling');
    assert.equal(trim.kind, 'gain'); assert.equal(trim.connections[0], ceiling);
    for (const options of [{ noCompressor: true }, { compressorThrows: true }]) {
      const f = fixture(options); f.sound.wake();
      const plainLowpass = f.context.nodes.filter(n => n.kind === 'filter')[1], plainTrim = plainLowpass.connections[0];
      assert.equal(plainTrim.kind, 'gain'); assert.equal(plainTrim.connections[0].kind, 'ceiling');
      assert(plainTrim.gain.value > trim.gain.value, 'Without a compressor the trim does not take back make-up gain that never happened');
      f.sound.play('won'); assert(f.voices().length >= 5);
    }
  });
  await test('One shared reverb: a generated dark stereo impulse on three sends, returning into the master', () => {
    const h = fixture(); h.sound.wake();
    const convolvers = h.context.nodes.filter(n => n.kind === 'convolver');
    assert.equal(convolvers.length, 1); const [convolver] = convolvers;
    const impulse = convolver.buffer; assert.equal(impulse.numberOfChannels, 2);
    assert(impulse.duration >= 1.2 && impulse.duration <= 1.8, 'About a second and a half');
    const left = impulse.getChannelData(0), right = impulse.getChannelData(1);
    assert(left.every(Number.isFinite) && right.every(Number.isFinite));
    assert.equal(left[0], 0, 'Starts from silence'); assert(Math.abs(left[left.length - 1]) < 0.01, 'Decays away');
    const energy = (data, from, to) => { let sum = 0; for (let i = from; i < to; i++) sum += data[i] * data[i]; return sum; };
    const quarter = Math.floor(left.length / 4);
    assert(energy(left, 0, quarter) > 20 * energy(left, 3 * quarter, left.length), 'The tail decays');
    let same = 0; for (let i = 0; i < 2000; i++) if (left[1000 + i] === right[1000 + i]) same++;
    assert(same < 10, 'Left and right are decorrelated for width');
    const sends = h.context.nodes.filter(n => n.kind === 'gain' && n.connections.includes(convolver));
    assert.equal(sends.length, 3); assert(sends.every(s => s.gain.value > 0 && s.gain.value <= 1));
    const wet = convolver.connections[0]; assert.equal(wet.connections[0], h.master()); assert(wet.gain.value > 0 && wet.gain.value <= 0.4, 'A modest wet level');
    const before = h.context.nodes.length;
    for (let i = 0; i < 5; i++) { h.sound.play('bloom', { combo: i + 1 }); h.tick(0.05); }
    assert.equal(h.context.nodes.slice(before).filter(n => n.kind === 'convolver').length, 0, 'Notes never build their own reverb');
    const envelopes = h.voices().map(v => v.connections[0]);
    assert(envelopes.every(g => sends.some(s => g.connections.includes(s))), 'Every note feeds a send');
    const deterministic = fixture(); deterministic.sound.wake();
    assert.deepEqual(Array.from(deterministic.context.buffers[0].getChannelData(0).slice(800, 900)), Array.from(left.slice(800, 900)), 'The room is the same every time');
  });
  await test('Reverb missing, rejected or throwing falls back to a dry mix without interrupting play', () => {
    for (const options of [{ noConvolver: true }, { convolverThrows: true }, { noBuffer: true }, { bufferRejected: true }, { legacy: true, webkit: true, noConvolver: true, noCompressor: true }]) {
      const h = fixture(options); assert.doesNotThrow(() => h.sound.wake());
      for (const [type, data] of CUES) assert.doesNotThrow(() => h.sound.play(type, data));
      assert(h.voices().length > 0, JSON.stringify(options));
      for (const voice of h.voices()) {
        const envelope = voice.connections[0];
        assert(envelope.connections.length >= 1 && envelope.connections.every(n => n.kind !== 'convolver' && !(n.connections || []).some(m => m.kind === 'convolver')), 'Dry only');
      }
      h.tick(3); assert.equal(h.voices().length, 0);
      h.sound.play('bloom'); assert.equal(h.voices().length, 1);
    }
  });
  await test('Every cue type plays without throwing, stays under the caps, and lands every pitch in C major', () => {
    for (const [type, data] of CUES) {
      const h = fixture(); h.sound.wake(); h.tick(1);
      assert.doesNotThrow(() => h.sound.play(type, data), type);
      const voices = h.voices();
      assert(voices.length >= 1 && voices.length <= MAX_VOICES, `${type} ${JSON.stringify(data)} plays`);
      assert(h.oscillators().length <= MAX_OSCILLATORS);
      for (const voice of voices) {
        const envelope = voice.connections[0].gain.events;
        assert.equal(envelope[0].value, 0, `${type} starts from silence`);
        assert(envelope.some(e => e.kind === 'linear' && e.value > 0 && e.time >= voice.startAt + 0.003), `${type} has a soft attack`);
        assert.equal(envelope[envelope.length - 1].value, 0, `${type} ends at silence`);
        assert(envelope.every(e => e.value === undefined || (e.value >= 0 && e.value <= 0.16)), `${type} stays soft`);
        assert(voice.stopAt - h.context.currentTime <= 1.1, `${type} finishes within about a second`);
        for (const tone of tones(h, voice)) assert(inKey(target(tone)), `${type} ${JSON.stringify(data)}: ${target(tone).toFixed(2)} Hz is in C major`);
      }
      for (const osc of h.oscillators()) {
        assert(osc.frequency.events.every(e => Number.isFinite(e.value) && e.value > 60 && e.value <= 3600), `${type} keeps every partial between 60 Hz and 3.6 kHz`);
        assert(Math.abs(osc.detune.value) <= 13, `${type} detunes only a few cents`);
      }
      h.tick(2); assert.equal(h.voices().length, 0, `${type} ends`);
    }
  });
  await test('Variation is gentle and safe: a stubbed Math.random never breaks a cue or makes it louder', () => {
    const levels = {};
    for (const random of ['() => 0', '() => 0.999999', '() => NaN', '() => 7', '() => { throw new Error("no") }']) {
      const h = fixture({ random }); h.sound.wake(); h.tick(1);
      for (const [type, data] of CUES) { assert.doesNotThrow(() => h.sound.play(type, data)); h.tick(0.6); }
      h.tick(2); assert.equal(h.voices().length, 0);
      const f = fixture({ random }); f.sound.wake(); f.tick(1); f.sound.play('bloom', { combo: 3 });
      levels[random] = Math.max(...f.voices()[0].connections[0].gain.events.map(e => e.value || 0));
    }
    assert(Object.values(levels).every(v => v <= 0.15 + 1e-9 && v >= 0.15 * 0.89), JSON.stringify(levels));
    const spread = fixture(); spread.sound.wake(); const cents = new Set();
    for (let i = 0; i < 12; i++) { spread.sound.play('bounce', { kind: 'wall' }); cents.add(spread.voices().pop().detune.value.toFixed(3)); spread.tick(0.2); }
    assert(cents.size > 6, 'Repeated knocks are not identical');
  });
  await test('Bloom cues begin immediately with soft attacks and moderate harmonic frequencies', () => {
    const h = fixture(); h.sound.wake();
    for (let combo = 1; combo <= 40; combo++) {
      const before = h.context.nodes.length, now = h.context.currentTime;
      h.sound.play('bloom', { combo, bud: { x: 210 } });
      const nodes = h.context.nodes.slice(before), oscillators = nodes.filter(n => n.kind === 'oscillator');
      assert(oscillators.length >= 2 && oscillators.length <= 4); assert(oscillators.every(n => n.startAt === now));
      const fundamental = oscillators.find(n => n.onended);
      assert(fundamental.frequency.value >= 140 && fundamental.frequency.value <= 1100);
      for (const osc of oscillators) {
        assert(osc.frequency.value <= 3600);
        assert(osc.stopAt - osc.startAt < 0.5);
      }
      const envelope = nodes.find(n => n.kind === 'gain' && n.gain.events.some(e => e.kind === 'linear' && e.value > 0));
      assert.equal(envelope.gain.events[0].value, 0);
      assert(envelope.gain.events.some(e => e.kind === 'linear' && e.time > now && e.time <= now + 0.01));
      // Upper partials are quieter than the note and die away before it.
      for (const partialGain of nodes.filter(n => n.kind === 'gain' && n !== envelope && n.gain.events[0] && n.gain.events[0].value > 0)) {
        assert(partialGain.gain.events[0].value < 0.6);
        const fall = partialGain.gain.events.find(e => e.kind === 'exponential');
        assert(fall && fall.time <= envelope.gain.events[envelope.gain.events.length - 2].time);
      }
      h.tick(0.1);
    }
    h.sound.play('bloom', { combo: Infinity });
  });
  await test('Chains walk the bloom chords, and shimmer and fever arpeggiate the chord the chain is on', () => {
    const notes = combos => combos.map(combo => { const h = fixture(); h.sound.wake(); h.tick(1); h.sound.play('bloom', { combo }); return target(h.voices()[0]); });
    const first = notes([1, 2, 3, 4, 5]);
    for (let i = 1; i < 5; i++) assert(first[i] > first[i - 1], 'Within a chord the chain climbs');
    assert.deepEqual(notes([21, 22, 23]).map(f => f.toFixed(2)), first.slice(0, 3).map(f => f.toFixed(2)), 'The chord cycle repeats every twenty');
    const pitchClasses = frequencies => new Set(frequencies.map(f => ((Math.round(12 * Math.log2(f / 261.6255653)) % 12) + 12) % 12));
    for (const combo of [5, 10, 15, 20]) {
      const chord = pitchClasses(notes([combo - 4, combo - 3, combo - 2, combo - 1, combo]));
      const h = fixture(); h.sound.wake(); h.tick(1); h.sound.play('shimmer', { combo });
      const shimmer = h.voices().sort((a, b) => a.startAt - b.startAt).map(target);
      assert.equal(shimmer.length, 4);
      for (let i = 1; i < shimmer.length; i++) assert(shimmer[i] > shimmer[i - 1], 'The shimmer rises');
      assert(Math.min(...shimmer) > Math.max(...notes([combo])) * 0.99, 'It sits above the bloom note');
      for (const pc of pitchClasses(shimmer)) assert(chord.has(pc), `shimmer at ${combo} stays on its chord`);
    }
    const fever = fixture(); fever.sound.wake(); fever.tick(1); fever.sound.play('fever', { combo: 12 });
    const chord = pitchClasses(notes([11, 12, 13, 14, 15]));
    for (const pc of pitchClasses(fever.voices().map(target))) assert(chord.has(pc));
  });
  await test('Planting unfolds in four bounded notes; repeated cues stay capped and mute cancels the pending phrase', () => {
    const h = fixture(); h.sound.wake(); h.tick(2);
    const now = h.context.currentTime;
    h.sound.play('plant', { x: 298 });
    const notes = h.voices().sort((a, b) => a.startAt - b.startAt);
    assert.equal(notes.length, 4); assert(h.oscillators().length >= 8 && h.oscillators().length <= 16);
    notes.forEach((note, index) => {
      assert(Math.abs(note.startAt - (now + index * 0.14)) < 1e-9, 'Planting notes must unfold instead of starting together');
      assert(Math.abs(note.stopAt - note.startAt - 0.568) < 1e-9);
      if (index) assert(note.frequency.value > notes[index - 1].frequency.value, 'The planting phrase should rise');
      const envelope = note.connections[0].gain.events;
      assert.equal(envelope[0].value, 0);
      assert(envelope.some(e => e.kind === 'linear' && e.value > 0 && e.time > note.startAt));
      assert(envelope.every(e => e.value === undefined || (e.value >= 0 && e.value <= 0.11)), 'Plant voices must keep the existing quiet envelope');
      assert.equal(envelope[envelope.length - 1].value, 0);
    });
    const ceiling = h.context.nodes.find(n => n.kind === 'ceiling');
    assert.equal(ceiling.connections[0], h.context.destination);
    assert(Array.from(ceiling.curve).every(value => Number.isFinite(value) && Math.abs(value) < 0.69));
    h.sound.play('plant'); assert.equal(h.voices().length, 4, 'Repeated input in the same instant must not stack phrases');

    h.tick(0.07); h.sound.setEnabled(false);
    const nodeCount = h.context.nodes.length;
    h.sound.play('plant'); assert.equal(h.context.nodes.length, nodeCount);
    assert(h.oscillators().every(n => n.stopAt <= h.context.currentTime + 0.025), 'Mute must cancel notes that have not started yet');
    const master = h.master();
    assert(master.gain.events.some(e => e.kind === 'linear' && e.value === 0 && e.time <= h.context.currentTime + 0.025));
    h.tick(0.04); assert.equal(h.voices().length, 0); assert.equal(h.oscillators().length, 0);

    h.sound.setEnabled(true); h.tick(0.36);
    h.sound.play('plant'); assert.equal(h.voices().length, 4);
    for (let i = 0; i < 100; i++) {
      h.sound.play('plant'); h.sound.play('bloom', { combo: i + 1 });
      assert(h.voices().length <= MAX_VOICES); assert(h.oscillators().length <= MAX_OSCILLATORS); h.tick(0.04);
    }
    h.tick(2); assert.equal(h.voices().length, 0); assert.equal(h.oscillators().length, 0);
  });
  await test('Moon gates play a quiet two-note response, debounce rapid crossings, and obey mute and voice limits', () => {
    const h = fixture(); h.sound.wake(); h.tick(1);
    h.sound.play('gate', { x: 420 });
    const notes = h.voices().sort((a, b) => a.startAt - b.startAt);
    assert.equal(notes.length, 2); assert(h.oscillators().length >= 4 && h.oscillators().length <= 8);
    assert.equal(notes[0].startAt, 1);
    assert(notes[1].startAt > notes[0].startAt + 0.04 && notes[1].startAt < notes[0].startAt + 0.10);
    assert(notes[1].frequency.value > notes[0].frequency.value);
    for (const note of notes) {
      const events = note.connections[0].gain.events;
      assert.equal(events[0].value, 0);
      assert(events.some(e => e.kind === 'linear' && e.value > 0 && e.time > note.startAt));
      assert(events.every(e => e.value === undefined || (e.value >= 0 && e.value <= 0.08)));
      assert(note.stopAt - note.startAt < 0.4);
    }
    assert(h.context.nodes.filter(n => n.kind === 'pan').every(n => n.pan.value > 0 && n.pan.value <= 0.3));
    const initialNodes = h.context.nodes.length;
    for (let i = 0; i < 100; i++) h.sound.play('gate');
    h.tick(0.13); h.sound.play('gate');
    assert.equal(h.context.nodes.length, initialNodes, 'Overlapping crossings should share one quiet response');
    h.tick(0.011); h.sound.play('gate'); assert.equal(h.voices().length, 4);
    for (let i = 0; i < 400; i++) {
      h.sound.play('gate', { x: i % 420 }); h.sound.play('bloom', { combo: i + 1 });
      assert(h.voices().length <= MAX_VOICES); assert(h.oscillators().length <= MAX_OSCILLATORS); h.tick(0.01);
    }
    h.sound.setEnabled(false);
    const mutedNodes = h.context.nodes.length; h.sound.play('gate');
    assert.equal(h.context.nodes.length, mutedNodes);
    assert(h.oscillators().every(n => n.stopAt <= h.context.currentTime + 0.025));
    h.tick(0.04); assert.equal(h.voices().length, 0); assert.equal(h.oscillators().length, 0);
  });
  await test('Koi currents play two quiet rising water drops and debounce lane re-entry', () => {
    const h = fixture(); h.sound.wake(); h.tick(1);
    h.sound.play('current', { x: 100 });
    const notes = h.voices().sort((a, b) => a.startAt - b.startAt);
    assert.equal(notes.length, 2); assert.equal(h.oscillators().length, 2, 'Water drops are single sine oscillators');
    assert(notes[1].frequency.value > notes[0].frequency.value);
    for (const note of notes) {
      assert(note.frequency.events[0].value < target(note), 'A drop rises into its pitch');
      assert(note.connections[0].gain.events.every(e => e.value === undefined || (e.value >= 0 && e.value <= 0.06)));
      assert(note.stopAt - note.startAt < 0.3);
    }
    const nodes = h.context.nodes.length;
    for (let i = 0; i < 50; i++) h.sound.play('current');
    assert.equal(h.context.nodes.length, nodes, 'Rapid lane changes share one response');
    h.tick(2); assert.equal(h.voices().length, 0);
  });
  await test('Each meadow friend has its own short, quiet voice; taps are debounced and unknown friends stay silent', () => {
    const counts = {}, signatures = new Set();
    for (const kind of ['cat', 'bluebird', 'frog', 'bee', 'firefly', 'squirrel']) {
      const h = fixture(); h.sound.wake(); h.tick(1);
      h.sound.play('friend', { kind, x: 200 });
      const notes = h.voices(); counts[kind] = notes.length;
      assert(notes.length >= 2 && notes.length <= 4, kind);
      signatures.add(notes.map(n => Math.round(target(n))).join(','));
      for (const note of notes) {
        assert(note.connections[0].gain.events.every(e => e.value === undefined || (e.value >= 0 && e.value <= 0.09)), kind);
        assert(note.stopAt - h.context.currentTime < 0.65, `${kind} finishes quickly`);
        assert(target(note) < 1700, `${kind} is never shrill`);
      }
      const nodes = h.context.nodes.length;
      for (let i = 0; i < 20; i++) h.sound.play('friend', { kind });
      assert.equal(h.context.nodes.length, nodes, `${kind}: rapid taps share one voice`);
      h.tick(2); assert.equal(h.voices().length, 0);
    }
    const h = fixture(); h.sound.wake(); h.tick(1); h.sound.play('friend', { kind: 'dragon' }); h.sound.play('friend');
    assert.equal(h.voices().length, 0);
    assert.notEqual(counts.bluebird, counts.cat, 'friends sound different');
    assert.equal(signatures.size, 6, 'every friend has its own melody');
  });
  await test('Rush waves climb one C major scale step per wave up to a fifth, and a cleared wave rings a bounded rising chord', () => {
    const lowest = wave => { const h = fixture(); h.sound.wake(); h.tick(1); h.sound.play('wave', { wave }); return Math.min(...h.voices().map(target)); };
    const base = lowest(2);
    assert(Math.abs(base - 261.6255653) < 0.01, 'Wave two starts on middle C');
    assert(Math.abs(lowest(1) - base) < 1e-6);
    const climb = [2, 3, 4, 5, 6].map(lowest);
    for (let i = 1; i < climb.length; i++) assert(climb[i] > climb[i - 1], 'Each wave starts higher');
    climb.forEach(f => assert(inKey(f)));
    assert(Math.abs(lowest(6) / base - Math.pow(2, 7 / 12)) < 1e-6, 'Up to a fifth');
    assert(Math.abs(lowest(9) - lowest(6)) < 1e-6); assert(Math.abs(lowest(40) - lowest(6)) < 1e-6);
    const boss = fixture(); boss.sound.wake(); boss.tick(1); boss.sound.play('wave', { wave: 10, boss: true });
    assert.equal(boss.voices().length, 4, 'A boss wave adds a low root');
    const h = fixture(); h.sound.wake(); h.tick(1); h.sound.play('cleared', { wave: 4 });
    const voices = h.voices();
    const arpeggio = voices.filter(v => tones(h, v).length === 1).sort((a, b) => a.startAt - b.startAt);
    const pads = voices.filter(v => tones(h, v).length > 1);
    assert.equal(arpeggio.length, 4); assert.equal(pads.length, 1, 'over one soft chord');
    for (let i = 1; i < arpeggio.length; i++) assert(arpeggio[i].frequency.value > arpeggio[i - 1].frequency.value);
    assert(voices.every(n => n.frequency.value < 1600 && n.stopAt - n.startAt <= 0.62));
    const nodes = h.context.nodes.length; h.sound.play('cleared', { wave: 4 }); assert.equal(h.context.nodes.length, nodes);
    h.tick(3); assert.equal(h.voices().length, 0);
  });
  await test('Big moments flourish over a soft chord, finish within about a second, and stay soft', () => {
    for (const [type, data] of [['won', { stars: 3 }], ['boss', {}], ['sunburst', { x: 210 }], ['gift', { x: 210 }], ['cleared', { wave: 2 }], ['power', { power: 'lullaby' }]]) {
      const h = fixture(); h.sound.wake(); h.tick(1); const now = h.context.currentTime;
      h.sound.play(type, data);
      const voices = h.voices();
      assert(voices.some(v => tones(h, v).length >= 3), `${type} has a chord under it`);
      assert(voices.filter(v => tones(h, v).length === 1).length >= 3, `${type} has a melody`);
      assert(Math.max(...voices.map(v => v.stopAt)) - now <= 1.0, `${type} is short`);
      const pad = voices.find(v => tones(h, v).length >= 3);
      assert(Math.max(...pad.connections[0].gain.events.map(e => e.value || 0)) <= 0.04, `${type} keeps the chord in the background`);
    }
    const one = fixture(); one.sound.wake(); one.tick(1); one.sound.play('won', { stars: 1 });
    const three = fixture(); three.sound.wake(); three.tick(1); three.sound.play('won', { stars: 3 });
    assert(three.voices().length > one.voices().length, 'Full stars add a sparkle');
  });
  await test('Losing stays gentle: falling notes that land on home, quieter than a win', () => {
    for (const [type, data] of [['lost', {}], ['life', { lives: 1 }]]) {
      const h = fixture(); h.sound.wake(); h.tick(1); h.sound.play(type, data);
      const melody = h.voices().filter(v => tones(h, v).length === 1).sort((a, b) => a.startAt - b.startAt);
      for (let i = 1; i < melody.length; i++) assert(target(melody[i]) < target(melody[i - 1]), `${type} falls`);
      const last = target(melody[melody.length - 1]); const semis = Math.round(12 * Math.log2(last / 261.6255653));
      assert.equal(((semis % 12) + 12) % 12, 0, `${type} lands on C`);
      assert(h.voices().every(v => v.connections[0].gain.events.every(e => (e.value || 0) <= 0.1)), `${type} is soft`);
    }
    const loudest = type => { const h = fixture({ random: '() => 0' }); h.sound.wake(); h.tick(1); h.sound.play(type, {}); return Math.max(...h.voices().map(v => Math.max(...v.connections[0].gain.events.map(e => e.value || 0)))); };
    assert(loudest('lost') < loudest('won') && loudest('life') < loudest('won'), 'A loss is never louder than a win');
  });
  await test('Result stars chime upward one by one, the third a touch fuller, and three in a row all play', () => {
    const h = fixture(); h.sound.wake(); h.tick(1);
    const pitches = [], counts = [];
    for (let index = 0; index < 3; index++) {
      const before = h.voices().length; h.sound.play('star', { index, x: 210 });
      const added = h.voices().slice(before); counts.push(added.length); pitches.push(Math.min(...added.map(target)));
      for (const voice of added) {
        assert(voice.stopAt - h.context.currentTime < 0.5, 'Each star is short');
        assert(voice.connections[0].gain.events.every(e => (e.value || 0) <= 0.09), 'Each star is soft');
        assert(inKey(target(voice)));
      }
      h.tick(0.17);
    }
    assert(pitches[1] > pitches[0] && pitches[2] > pitches[1], 'The stars climb');
    assert(counts[0] >= 1 && counts[2] > counts[0], 'The third star is fuller');
    const fast = fixture(); fast.sound.wake(); fast.tick(1); fast.sound.play('star', { index: 0 });
    const nodes = fast.context.nodes.length; fast.sound.play('star', { index: 1 }); assert.equal(fast.context.nodes.length, nodes, 'Rate limited');
    fast.tick(0.09); fast.sound.play('star', { index: 1 }); assert(fast.context.nodes.length > nodes, 'A light limit');
    const odd = fixture(); odd.sound.wake(); odd.tick(1);
    for (const index of [undefined, -1, 9, NaN, '2']) { odd.sound.play('star', { index }); odd.tick(0.1); }
    odd.sound.play('star'); assert(odd.voices().length > 0);
  });
  await test('Position changes restrained stereo pan, with mono fallback for older implementations', () => {
    const h = fixture(); h.sound.wake(); h.sound.play('bloom', { bud: { x: 0 } }); h.tick(0.03);
    h.sound.play('bloom', { bud: { x: 420 } });
    const values = h.context.nodes.filter(n => n.kind === 'pan').map(n => n.pan.value);
    assert(values[0] < 0 && values[1] > 0); assert(values.every(v => Math.abs(v) <= 0.6));
    const legacy = fixture({ legacy: true, webkit: true }); legacy.sound.wake(); legacy.sound.play('bloom');
    assert.equal(legacy.voices().length, 1); legacy.sound.setEnabled(false); legacy.tick(0.04); assert.equal(legacy.voices().length, 0);
  });
  await test('Mute fades existing and future notes, blocks new effects, and re-enables cleanly', () => {
    const h = fixture(); h.sound.wake(); h.sound.play('won'); assert(h.voices().length >= 5);
    h.sound.setEnabled(false); h.sound.play('bloom');
    const master = h.master();
    assert(master.gain.events.some(e => e.kind === 'linear' && e.value === 0));
    assert(h.oscillators().every(n => n.stopAt <= h.context.currentTime + 0.025));
    h.tick(0.04); assert.equal(h.voices().length, 0); assert.equal(h.oscillators().length, 0);
    h.sound.setEnabled(true); h.sound.play('bloom'); assert.equal(h.voices().length, 1);
  });
  await test('setEnabled(false) fades every voice and the master smoothly, anchored at the current time (no clicks)', () => {
    for (const options of [{}, { legacy: true }]) {
      const h = fixture(options); h.sound.wake(); h.tick(5);
      for (const [type, data] of CUES.slice(0, 30)) h.sound.play(type, data);
      h.tick(0.12); const now = h.context.currentTime, playing = h.voices();
      assert(playing.length > 4);
      h.sound.setEnabled(false);
      for (const voice of playing) {
        const events = voice.connections[0].gain.events, at = events.findIndex(e => (e.kind === 'hold' || e.kind === 'cancel') && e.time === now);
        assert(at >= 0, 'Every voice holds where it is');
        const ramp = events.slice(at).find(e => e.kind === 'linear');
        assert(ramp && ramp.value === 0 && ramp.time > now + 0.01 && ramp.time <= now + 0.025, 'then ramps to silence, never a hard cut');
        assert(voice.stopAt >= ramp.time, 'Oscillators stop only after their fade');
      }
      // The master fade starts from a value set at this moment, not from a stale point long ago.
      const events = h.master().gain.events, last = events.length - 1;
      assert.equal(events[last].kind, 'linear'); assert.equal(events[last].value, 0); assert(events[last].time > now && events[last].time <= now + 0.025);
      assert.equal(events[last - 1].kind, 'set'); assert.equal(events[last - 1].time, now); assert(Math.abs(events[last - 1].value - 0.34) < 1e-9);
      h.tick(0.04); assert.equal(h.voices().length, 0);
      // Toggling back mid-fade continues from where the fade had reached.
      h.sound.setEnabled(true); h.tick(0.01); h.sound.setEnabled(false);
      const again = h.master().gain.events, set = again[again.length - 2];
      assert.equal(set.kind, 'set'); assert(set.value > 0.1 && set.value < 0.2, `continues from ${set.value}`);
    }
  });
  await test('Nodes are disconnected when voices end; only the shared bus stays connected', () => {
    for (const options of [{}, { noConvolver: true, noCompressor: true }, { legacy: true }]) {
      const h = fixture(options); h.sound.wake(); const shared = h.context.nodes.length;
      for (let round = 0; round < 3; round++) {
        for (const [type, data] of CUES) { h.sound.play(type, data); h.tick(0.05); }
        h.tick(0.3); if (round === 1) h.sound.setEnabled(false), h.tick(0.05), h.sound.setEnabled(true);
      }
      h.tick(3);
      const leftovers = h.context.nodes.slice(shared).filter(n => !n.disconnected);
      assert.equal(leftovers.length, 0, `${leftovers.length} voice nodes still connected (${JSON.stringify(options)})`);
      assert(h.context.nodes.slice(0, shared).every(n => !n.disconnected), 'The shared bus is never torn down');
      assert(h.context.nodes.slice(shared).every(n => n.kind !== 'oscillator' || n.stopAt !== undefined), 'Every oscillator was stopped');
    }
  });
  await test('The room is built just after the first gesture, so the first sound never waits on it', () => {
    const h = fixture({ timers: true }); h.sound.wake(); h.sound.play('launch');
    assert.equal(h.context.nodes.filter(n => n.kind === 'convolver').length, 0, 'Not built during the gesture');
    assert.equal(h.voices().length, 2, 'The first sound plays at once, dry');
    assert.equal(h.timers.length, 1); assert(h.timers[0].delay > 0 && h.timers[0].delay <= 100);
    h.runTimers(); h.tick(0.1);
    assert.equal(h.context.nodes.filter(n => n.kind === 'convolver').length, 1);
    h.sound.play('bloom', { combo: 2 });
    const sends = h.context.nodes.filter(n => n.kind === 'gain' && n.connections.some(m => m.kind === 'convolver'));
    assert(sends.some(send => h.voices().pop().connections[0].connections.includes(send)), 'Later notes reach the room');
    h.tick(3); assert.equal(h.voices().length, 0);
    // A context that closed before its room was built never gets one; the new context builds its own.
    const c = fixture({ timers: true }); c.sound.wake(); const first = c.context; first.state = 'closed'; c.sound.wake();
    c.runTimers();
    assert.equal(first.nodes.filter(n => n.kind === 'convolver').length, 0);
    assert.equal(c.context.nodes.filter(n => n.kind === 'convolver').length, 1);
    const blocked = fixture({ timers: 'throw' }); assert.doesNotThrow(() => blocked.sound.wake());
    assert.equal(blocked.context.nodes.filter(n => n.kind === 'convolver').length, 1, 'Without timers it is built at once');
  });
  await test('Repeated wake calls reuse the context and closed contexts recover safely', () => {
    const h = fixture(); for (let i = 0; i < 50; i++) h.sound.wake(); assert.equal(h.contexts.length, 1);
    assert.equal(h.context.nodes.filter(n => n.kind === 'convolver').length, 1, 'The room is built once');
    h.sound.play('bloom'); h.context.state = 'closed'; h.sound.wake();
    assert.equal(h.contexts.length, 2); h.sound.play('bloom'); assert.equal(h.voices().length, 1);
    assert.equal(h.context.nodes.filter(n => n.kind === 'convolver').length, 1, 'A new context gets its own room');
  });
  const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
    limits: 'Instrumented Web Audio API scheduling/graph tests, not a rendered browser audio capture or a listening assessment. Device speakers, perceptual loudness, and audio-to-screen latency still require on-device listening.', results };
  console.log(JSON.stringify(report, null, 2)); if (report.failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
