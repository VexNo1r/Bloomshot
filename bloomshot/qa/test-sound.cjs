'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../sound.js'), 'utf8');
const results = [];
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
    constructor(init) { this.options = init; this.state = options.suspended ? 'suspended' : 'running'; this.currentTime = 0; this.nodes = []; this.resumeCalls = 0; this.pendingResume = []; this.destination = new Node(this, 'destination'); contexts.push(this); if (options.legacy) this.createStereoPanner = undefined; }
    createGain() { const n = new Node(this, 'gain'); n.gain = new Parameter(1); return n; }
    createBiquadFilter() { const n = new Node(this, 'filter'); n.frequency = new Parameter(350); n.Q = new Parameter(1); return n; }
    createWaveShaper() { return new Node(this, 'ceiling'); }
    createStereoPanner() { const n = new Node(this, 'pan'); n.pan = new Parameter(0); return n; }
    createOscillator() {
      const n = new Node(this, 'oscillator'); n.frequency = new Parameter(440); n.started = false; n.ended = false;
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
  const sandbox = { Date: Clock, console };
  if (!options.noAudio) sandbox[options.webkit ? 'webkitAudioContext' : 'AudioContext'] = Audio;
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { sound: sandbox.BloomSound, contexts,
    get context() { return contexts[contexts.length - 1]; },
    tick(seconds) { wallTime += seconds * 1000; for (const context of contexts) context.advance(seconds); },
    async resume(reject = false) {
      const context = contexts[contexts.length - 1];
      if (!reject) context.state = 'running';
      for (const promise of context.pendingResume.splice(0)) reject ? promise.reject(new Error('blocked')) : promise.resolve();
      await Promise.resolve(); await Promise.resolve();
    },
    voices() { return this.context.nodes.filter(n => n.kind === 'oscillator' && n.onended && !n.ended && !n.disconnected); },
    oscillators() { return this.context.nodes.filter(n => n.kind === 'oscillator' && !n.ended && !n.disconnected); }
  };
}
async function test(name, run) {
  try { await run(); results.push({ name, passed: true }); }
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
  });
  await test('Blocked or stale unlock events never replay a backlog of old effects', async () => {
    const h = fixture({ suspended: true }); h.sound.wake();
    for (let i = 0; i < 500; i++) h.sound.play('bloom', { combo: i + 1 });
    h.tick(0.3); await h.resume(); assert.equal(h.voices().length, 0);
    const blocked = fixture({ suspended: true }); blocked.sound.wake(); blocked.sound.play('launch');
    await blocked.resume(true); blocked.sound.wake(); await blocked.resume(); assert.equal(blocked.voices().length, 0);
  });
  await test('Dense mixed events stay within sixteen voices and thirty-two oscillators', () => {
    const h = fixture(); h.sound.wake(); let maxVoices = 0, maxOscillators = 0;
    const cues = ['bloom', 'bounce', 'launch', 'rotate', 'tap', 'won', 'burst', 'split', 'wave', 'life', 'crack', 'fever', 'lost', 'gate', 'current', 'shimmer'];
    for (let frame = 0; frame < 1200; frame++) {
      for (const cue of cues) h.sound.play(cue, { combo: frame + 1, kind: 'bumper', bud: { x: frame % 420 } });
      maxVoices = Math.max(maxVoices, h.voices().length); maxOscillators = Math.max(maxOscillators, h.oscillators().length);
      assert(h.voices().length <= 16); assert(h.oscillators().length <= 32); h.tick(1 / 120);
    }
    h.tick(2); assert.equal(h.voices().length, 0); assert.equal(h.oscillators().length, 0);
    results.push({ name: 'Stress measurement', passed: true, eventsSubmitted: 1200 * cues.length, maxVoices, maxOscillators });
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
  await test('Bloom cues begin immediately with soft attacks and moderate harmonic frequencies', () => {
    const h = fixture(); h.sound.wake();
    for (let combo = 1; combo <= 40; combo++) {
      const before = h.context.nodes.length, now = h.context.currentTime;
      h.sound.play('bloom', { combo, bud: { x: 210 } });
      const nodes = h.context.nodes.slice(before), oscillators = nodes.filter(n => n.kind === 'oscillator');
      assert.equal(oscillators.length, 2); assert(oscillators.every(n => n.startAt === now));
      for (const osc of oscillators) {
        assert(osc.frequency.value >= 140 && osc.frequency.value <= 1100);
        assert(osc.stopAt - osc.startAt < 0.5);
      }
      const envelope = nodes.find(n => n.kind === 'gain' && n.gain.events.some(e => e.kind === 'linear' && e.value > 0));
      assert.equal(envelope.gain.events[0].value, 0);
      assert(envelope.gain.events.some(e => e.kind === 'linear' && e.time > now && e.time <= now + 0.01));
      h.tick(0.1);
    }
    h.sound.play('bloom', { combo: Infinity });
  });
  await test('Planting unfolds in four bounded notes; repeated cues stay capped and mute cancels the pending phrase', () => {
    const h = fixture(); h.sound.wake(); h.tick(2);
    const now = h.context.currentTime;
    h.sound.play('plant', { x: 298 });
    const notes = h.voices().sort((a, b) => a.startAt - b.startAt);
    assert.equal(notes.length, 4); assert.equal(h.oscillators().length, 8);
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
    const master = h.context.nodes.find(n => n.kind === 'gain');
    assert(master.gain.events.some(e => e.kind === 'linear' && e.value === 0 && e.time <= h.context.currentTime + 0.025));
    h.tick(0.04); assert.equal(h.voices().length, 0); assert.equal(h.oscillators().length, 0);

    h.sound.setEnabled(true); h.tick(0.36);
    h.sound.play('plant'); assert.equal(h.voices().length, 4);
    for (let i = 0; i < 100; i++) {
      h.sound.play('plant'); h.sound.play('bloom', { combo: i + 1 });
      assert(h.voices().length <= 16); assert(h.oscillators().length <= 32); h.tick(0.04);
    }
    h.tick(2); assert.equal(h.voices().length, 0); assert.equal(h.oscillators().length, 0);
  });
  await test('Moon gates play a quiet two-note response, debounce rapid crossings, and obey mute and voice limits', () => {
    const h = fixture(); h.sound.wake(); h.tick(1);
    h.sound.play('gate', { x: 420 });
    const notes = h.voices().sort((a, b) => a.startAt - b.startAt);
    assert.equal(notes.length, 2); assert.equal(h.oscillators().length, 4);
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
      assert(h.voices().length <= 16); assert(h.oscillators().length <= 32); h.tick(0.01);
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
      assert(note.connections[0].gain.events.every(e => e.value === undefined || (e.value >= 0 && e.value <= 0.06)));
      assert(note.stopAt - note.startAt < 0.3);
    }
    const nodes = h.context.nodes.length;
    for (let i = 0; i < 50; i++) h.sound.play('current');
    assert.equal(h.context.nodes.length, nodes, 'Rapid lane changes share one response');
    h.tick(2); assert.equal(h.voices().length, 0);
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
    const h = fixture(); h.sound.wake(); h.sound.play('won'); assert.equal(h.voices().length, 4);
    h.sound.setEnabled(false); h.sound.play('bloom');
    const master = h.context.nodes.find(n => n.kind === 'gain');
    assert(master.gain.events.some(e => e.kind === 'linear' && e.value === 0));
    assert(h.oscillators().every(n => n.stopAt <= h.context.currentTime + 0.025));
    h.tick(0.04); assert.equal(h.voices().length, 0); assert.equal(h.oscillators().length, 0);
    h.sound.setEnabled(true); h.sound.play('bloom'); assert.equal(h.voices().length, 1);
  });
  await test('Repeated wake calls reuse the context and closed contexts recover safely', () => {
    const h = fixture(); for (let i = 0; i < 50; i++) h.sound.wake(); assert.equal(h.contexts.length, 1);
    h.sound.play('bloom'); h.context.state = 'closed'; h.sound.wake();
    assert.equal(h.contexts.length, 2); h.sound.play('bloom'); assert.equal(h.voices().length, 1);
  });
  const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
    limits: 'Instrumented Web Audio API scheduling/graph tests, not a rendered browser audio capture or a listening assessment. Device speakers, perceptual loudness, and audio-to-screen latency still require on-device listening.', results };
  console.log(JSON.stringify(report, null, 2)); if (report.failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
