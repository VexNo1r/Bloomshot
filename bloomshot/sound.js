(function (root) {
  'use strict';
  const MAX_VOICES = 16, LEVEL = 0.34;
  // C6 / Am7 / Fmaj7 / G6: warmth and movement, without an ever-rising pitch ladder.
  const gardens = [
    [261.63, 329.63, 392, 440, 523.25],
    [220, 261.63, 329.63, 392, 440],
    [174.61, 220, 261.63, 329.63, 349.23],
    [196, 246.94, 293.66, 329.63, 392]
  ];
  let context, master, enabled = true, resuming = null;
  const voices = new Set(), recent = Object.create(null);
  let waiting = [];

  function hold(parameter, time) {
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(time);
    else { parameter.cancelScheduledValues(time); parameter.setValueAtTime(parameter.value, time); }
  }
  function release(voice, immediate = false) {
    if (voice.released) return;
    voice.released = true;
    if (!immediate && context && context.state !== 'closed') {
      const now = context.currentTime;
      hold(voice.gain.gain, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.018);
      for (const oscillator of voice.oscillators) {
        try { oscillator.stop(Math.min(voice.end, now + 0.022)); } catch (_) {}
      }
      return;
    }
    for (const node of voice.nodes) { try { node.disconnect(); } catch (_) {} }
    voices.delete(voice);
  }
  function reap() {
    for (const voice of voices) if (voice.end <= context.currentTime) release(voice, true);
  }
  function createContext() {
    const Audio = root.AudioContext || root.webkitAudioContext;
    if (!Audio) return;
    context = new Audio({ latencyHint: 'interactive' });
    master = context.createGain(); master.gain.value = enabled ? LEVEL : 0;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 2900; lowpass.Q.value = 0.55;
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass'; highpass.frequency.value = 55; highpass.Q.value = 0.55;
    const ceiling = context.createWaveShaper(), curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const sample = i * 2 / (curve.length - 1) - 1;
      curve[i] = 0.82 * Math.tanh(sample / 0.82);
    }
    ceiling.curve = curve;
    // No oversampling stage after the curve: its output stays below 0.69 full scale.
    master.connect(highpass); highpass.connect(lowpass); lowpass.connect(ceiling); ceiling.connect(context.destination);
    for (const key of Object.keys(recent)) delete recent[key];
  }
  function flush() {
    if (!context || context.state !== 'running' || !enabled) return;
    const queued = waiting; waiting = [];
    for (const event of queued) if (Date.now() - event.at < 200) play(event.type, event.data);
  }
  function wake() {
    if (!enabled) return;
    try {
      if (!context || context.state === 'closed') {
        for (const voice of voices) release(voice, true);
        voices.clear(); resuming = null; createContext();
      }
      if (!context) return;
      if (context.state === 'running') { flush(); return; }
      if (!resuming) {
        resuming = Promise.resolve(context.resume()).then(() => { resuming = null; flush(); }, () => { resuming = null; waiting = []; });
      }
    } catch (_) { waiting = []; /* Audio failure never interrupts play. */ }
  }
  function panFor(data) {
    const x = data.bud && Number.isFinite(data.bud.x) ? data.bud.x : data.x;
    return Number.isFinite(x) ? Math.max(-0.6, Math.min(0.6, (x - 210) / 350)) : 0;
  }
  function allowed(key, gap) {
    if (recent[key] !== undefined && context.currentTime - recent[key] < gap) return false;
    recent[key] = context.currentTime; return true;
  }
  function note(frequency, delay, duration, volume, pan = 0, style = 'bell', priority = 1) {
    if (!context || !enabled || context.state !== 'running') return;
    reap();
    // Reserve room for blooms and result cues; do not steal a ringing voice with a hard cutoff.
    if (voices.size >= MAX_VOICES || (priority === 0 && voices.size >= 9)) return;
    const at = context.currentTime + delay, end = at + duration + 0.018;
    const gain = context.createGain(), oscillator = context.createOscillator();
    const voice = { gain, end, released: false, nodes: [gain, oscillator], oscillators: [oscillator] };
    const attack = style === 'wood' ? 0.008 : 0.006;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.type = style === 'wood' ? 'triangle' : 'sine';
    // A water drop rises quickly into its pitch; bells and wood settle onto theirs.
    oscillator.frequency.setValueAtTime(frequency * (style === 'drop' ? 0.56 : 1.003), at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, at + (style === 'drop' ? 0.05 : Math.min(0.075, duration / 2)));
    oscillator.connect(gain);
    if (style === 'bell') {
      const partial = context.createOscillator(), partialGain = context.createGain();
      partial.type = 'sine'; partial.frequency.value = frequency * 2;
      partialGain.gain.setValueAtTime(0.15, at);
      partialGain.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(0.14, duration));
      partial.connect(partialGain); partialGain.connect(gain);
      voice.nodes.push(partial, partialGain); voice.oscillators.push(partial);
    }
    if (typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner(); panner.pan.value = pan;
      gain.connect(panner); panner.connect(master); voice.nodes.push(panner);
    } else gain.connect(master);
    voices.add(voice);
    oscillator.onended = () => {
      voice.released = false;
      release(voice, true);
    };
    for (const source of voice.oscillators) { source.start(at); source.stop(end); }
  }
  function phrase(frequencies, spacing, duration, volume, pan = 0) {
    frequencies.forEach((frequency, index) => note(frequency, index * spacing, duration, volume, pan * 0.5, 'bell', 2));
  }
  // [frequency, delay, duration, style] per note: a meow falls, a chirp and a squeak rise, a ribbit is two low knocks.
  const FRIENDS = {
    cat: [[783.99, 0, 0.14, 'bell'], [622.25, 0.11, 0.3, 'bell']],
    bluebird: [[2349.32, 0, 0.07, 'drop'], [2793.83, 0.09, 0.07, 'drop'], [2349.32, 0.2, 0.07, 'drop'], [2793.83, 0.29, 0.08, 'drop']],
    frog: [[146.83, 0, 0.09, 'wood'], [130.81, 0.12, 0.12, 'wood']],
    bee: [[233.08, 0, 0.05, 'wood'], [246.94, 0.045, 0.05, 'wood'], [233.08, 0.09, 0.05, 'wood'], [246.94, 0.135, 0.07, 'wood']],
    firefly: [[1567.98, 0, 0.18, 'bell'], [2093, 0.06, 0.2, 'bell'], [2637.02, 0.12, 0.26, 'bell']],
    squirrel: [[1567.98, 0, 0.06, 'drop'], [1760, 0.07, 0.06, 'drop'], [2093, 0.14, 0.08, 'drop']]
  };
  function play(type, data = {}) {
    if (!enabled || !context) return;
    if (context.state !== 'running') {
      // Keep the first gesture's sound through resume, not a backlog of old audio.
      if (waiting.length < 8) waiting.push({ type, data: { combo: data.combo, chain: data.chain, kind: data.kind, wave: data.wave, x: data.bud ? data.bud.x : data.x }, at: Date.now() });
      return;
    }
    const pan = panFor(data);
    if (type === 'bloom') {
      if (!allowed('bloom', 0.022)) return;
      const suppliedCombo = Number(data.combo);
      const combo = Number.isFinite(suppliedCombo) ? Math.max(1, Math.floor(suppliedCombo)) : 1;
      const chord = gardens[Math.floor((combo - 1) / 5) % gardens.length];
      note(chord[(combo - 1) % chord.length], 0, data.chain ? 0.30 : 0.44, data.chain ? 0.105 : 0.155, pan);
    } else if (type === 'bounce') {
      if (!allowed('bounce', 0.075)) return;
      note(data.kind === 'bumper' ? 293.66 : 146.83, 0, 0.08, data.kind === 'bumper' ? 0.075 : 0.043, pan, 'wood', 0);
    } else if (type === 'launch') {
      if (!allowed('launch', 0.065)) return;
      note(220, 0, 0.10, 0.10, pan, 'wood'); note(329.63, 0.025, 0.15, 0.085, pan);
    } else if (type === 'rotate' || type === 'tap') {
      if (allowed('touch', 0.05)) note(349.23, 0, 0.09, 0.07, pan, 'wood', 0);
    } else if (type === 'crack') {
      if (allowed('crack', 0.045)) note(392, 0, 0.105, 0.083, pan, 'wood');
    } else if (type === 'won' && allowed('won', 0.6)) phrase([261.63, 329.63, 392, 523.25], 0.10, 0.74, 0.13);
    else if ((type === 'burst' || type === 'split') && allowed('split', 0.16)) phrase([329.63, 440, 523.25], 0.038, 0.31, 0.105, pan);
    else if (type === 'wave' && allowed('wave', 0.4)) {
      // Each Rush wave starts a semitone higher (up to a fifth), so the run audibly climbs.
      const lift = Math.pow(2, Math.min(7, Math.max(0, (Number(data.wave) || 1) - 2)) / 12);
      phrase([261.63, 392, 440].map(f => f * lift), 0.075, 0.40, 0.11);
    } else if (type === 'cleared' && allowed('cleared', 0.5)) {
      const lift = Math.pow(2, Math.min(7, Math.max(0, (Number(data.wave) || 1) - 1)) / 12);
      phrase([392, 523.25, 659.25, 783.99].map(f => f * lift), 0.055, 0.5, 0.12);
    }
    else if (type === 'plant' && allowed('plant', 0.35)) phrase([261.63, 329.63, 392, 523.25], 0.14, 0.55, 0.105, pan);
    else if (type === 'gate' && allowed('gate', 0.14)) {
      // A quiet rising fifth follows the seed through the paired apertures.
      note(293.66, 0, 0.22, 0.078, pan * 0.5);
      note(440, 0.072, 0.36, 0.064, pan * 0.5);
    }
    // Koi currents: two soft water drops when a seed slips into a lane.
    else if (type === 'current' && allowed('current', 0.18)) {
      note(523.25, 0, 0.16, 0.06, pan * 0.5, 'drop');
      note(783.99, 0.055, 0.2, 0.045, pan * 0.5, 'drop');
    }
    // Chain milestones: a quick rising shimmer above the bloom notes.
    else if (type === 'shimmer' && allowed('shimmer', 0.3)) phrase([783.99, 987.77, 1174.66, 1567.98], 0.045, 0.32, 0.05, pan * 0.5);
    // Meadow friends: a short, quiet voice for each one when tapped.
    else if (type === 'friend' && allowed('friend', 0.22)) {
      const voice = FRIENDS[data.kind];
      if (voice) voice.forEach(([frequency, delay, duration, style]) => note(frequency, delay, duration, style === 'wood' ? 0.085 : 0.06, pan * 0.5, style));
    }
    else if (type === 'life' && allowed('life', 0.15)) phrase([220, 174.61], 0.105, 0.25, 0.12, pan);
    else if (type === 'fever' && allowed('fever', 1.0)) phrase([261.63, 329.63, 392], 0.04, 0.52, 0.085);
    else if (type === 'lost' && allowed('lost', 0.6)) phrase([329.63, 261.63, 220], 0.115, 0.40, 0.105);
  }
  root.BloomSound = {
    wake,
    setEnabled(value) {
      const changed = enabled !== Boolean(value); enabled = Boolean(value);
      waiting = [];
      if (!enabled) for (const voice of voices) release(voice);
      if (master && context && context.state !== 'closed') {
        hold(master.gain, context.currentTime);
        master.gain.linearRampToValueAtTime(enabled ? LEVEL : 0, context.currentTime + 0.025);
      }
      if (changed && enabled) wake();
    },
    play
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

