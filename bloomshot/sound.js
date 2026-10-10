(function (root) {
  'use strict';
  // Sixteen voices at most; small cues stop at nine and blooms at thirteen, so result cues always find room.
  // A voice is one note: a few sine partials under one envelope, never more than four oscillators.
  const MAX_VOICES = 16, MAX_OSCILLATORS = 40, LEVEL = 0.34;
  // One knob for overall loudness after the mix bus, and the compressor's automatic make-up gain
  // (7.2 dB for the settings below, per the Web Audio compressor algorithm) taken back out so that
  // quiet cues sound the same with or without a compressor.
  const OUTPUT = 1.9, MAKEUP = Math.pow(10, -7.2 / 20);
  const WET = 0.25, ROOM = 1.5;
  // Everything sits in C major. hz(n) is n semitones above middle C; step(n) is n scale steps (0 = C4, 7 = C5, -3 = F3).
  const hz = n => 261.6255653 * Math.pow(2, n / 12);
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const step = n => hz(12 * Math.floor(n / 7) + MAJOR[((n % 7) + 7) % 7]);
  // Blooms walk C6 / Am7 / Fmaj7 / G6, five notes each: warmth and movement without an ever-rising pitch ladder.
  const GARDENS = [[0, 2, 4, 5, 7], [-2, 0, 2, 4, 5], [-4, -2, 0, 2, 3], [-3, -1, 1, 2, 4]];
  const gardenFor = combo => GARDENS[Math.floor((combo - 1) / 5) % GARDENS.length];
  // Timbres: [ratio, level, decay seconds] partials over a sine fundamental. Upper partials die away first,
  // the way a struck bar or tine does; anything that would land above 3.6 kHz is left out.
  //   bell: a kalimba / celesta mallet, with an octave and a short stretched-octave tick for the strike.
  //   marimba: a tuned wooden bar (its fourth partial is two octaves up) for knocks that still have pitch.
  //   wood: an untuned soft knock (free-bar partials 2.76 and 5.4) for bounces.
  //   chime: a high glassy note with a slowly beating twin, for sparkles.
  //   drop: one sine that rises into its pitch, a water drop.
  //   pad: a soft chord swell under the big moments; the partials are the chord's own notes.
  const TIMBRES = {
    bell: { attack: 0.005, body: [0.07, 0.5], bend: [1.003, 0.05], space: 'mid', partials: [[2, 0.24, 0.24], [4.07, 0.07, 0.045]] },
    marimba: { attack: 0.004, body: [0.05, 0.42], bend: [1.006, 0.03], space: 'mid', partials: [[3.98, 0.26, 0.07], [9.2, 0.05, 0.02]] },
    wood: { attack: 0.004, body: [0.03, 0.35], bend: [1.045, 0.022], space: 'low', partials: [[2.76, 0.36, 0.045], [5.4, 0.12, 0.016]] },
    chime: { attack: 0.006, body: [0.09, 0.55], bend: [1, 0], space: 'high', partials: [[1.0028, 0.42, 0], [2, 0.12, 0.11]] },
    drop: { attack: 0.004, body: null, bend: [0.6, 0.045], space: 'mid', partials: [] },
    pad: { attack: 0.08, body: [0.3, 0.55], bend: [1, 0], space: 'high', partials: [] }
  };
  let context, master, sends = null, enabled = true, resuming = null;
  // The master fade is tracked here, so every new fade starts exactly where the last one is now.
  // (A ramp with no anchor before it would start from the context's time zero and jump: a click.)
  let fade = { from: 0, to: 0, start: 0, end: 0 };
  const voices = new Set(), recent = Object.create(null);
  let waiting = [];

  // Tiny per-note variation keeps repeats from sounding mechanical. It only ever softens a note,
  // so a stubbed or odd Math.random can never push a cue louder than its design.
  function chance() {
    try { const value = Math.random(); return value >= 0 && value <= 1 ? value : 0.5; } catch (_) { return 0.5; }
  }
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
  function fadeMaster(target) {
    const now = context.currentTime, gain = master.gain;
    const progress = fade.end > fade.start ? Math.max(0, Math.min(1, (now - fade.start) / (fade.end - fade.start))) : 1;
    const from = fade.from + (fade.to - fade.from) * progress;
    gain.cancelScheduledValues(now); gain.setValueAtTime(from, now); gain.linearRampToValueAtTime(target, now + 0.025);
    fade = { from, to: target, start: now, end: now + 0.025 };
  }
  function reap() {
    for (const voice of voices) if (voice.end <= context.currentTime) release(voice, true);
  }
  function setParam(parameter, value) { if (parameter && typeof parameter === 'object' && 'value' in parameter) parameter.value = value; }
  // A gentle bus compressor: busy chains and big flourishes settle together instead of piling up.
  function glue() {
    try {
      if (typeof context.createDynamicsCompressor !== 'function') return null;
      const compressor = context.createDynamicsCompressor();
      setParam(compressor.threshold, -24); setParam(compressor.knee, 12); setParam(compressor.ratio, 3);
      setParam(compressor.attack, 0.004); setParam(compressor.release, 0.2);
      return compressor;
    } catch (_) { return null; }
  }
  // One shared room: a stereo impulse of dark, decaying noise made once in code (about 1.5 s to silence).
  // Voices feed it through three fixed sends, so reverb costs no extra nodes per note.
  function room() {
    try {
      if (typeof context.createConvolver !== 'function' || typeof context.createBuffer !== 'function') return null;
      const rate = context.sampleRate || 44100, length = Math.floor(rate * ROOM), delay = Math.floor(rate * 0.014);
      const impulse = context.createBuffer(2, length, rate);
      const rumbleCoefficient = 1 - Math.exp(-2 * Math.PI * 160 / rate);
      // About 60 dB of decay over the room's length; cheap per sample, so the first tap never waits on it.
      const fall = Math.exp(-6.9 / ((ROOM - 0.014) * rate)), swell = Math.floor(rate * 0.008);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        let seed = channel ? 0x2545f491 : 0x9e3779b9, low = 0, rumble = 0, level = 1, smoothing = 0;
        for (let i = delay, n = 0; i < length; i++, n++) {
          // Bright for the first moments, then darker and darker, like a soft wooden room.
          if ((n & 63) === 0) smoothing = 1 - Math.exp(-2 * Math.PI * (650 + 3000 * Math.exp(-n / rate * 3.2)) / rate);
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          low += (seed / 2147483648 - 1 - low) * smoothing;
          rumble += (low - rumble) * rumbleCoefficient;
          data[i] = (low - rumble) * level * (n < swell ? n / swell : 1);
          level *= fall;
        }
      }
      const convolver = context.createConvolver();
      convolver.normalize = true; convolver.buffer = impulse;
      const wet = context.createGain(); wet.gain.value = WET;
      const bus = {};
      for (const [name, amount] of [['low', 0.3], ['mid', 0.5], ['high', 1]]) {
        const send = context.createGain(); send.gain.value = amount; send.connect(convolver); bus[name] = send;
      }
      convolver.connect(wet); wet.connect(master);
      return bus;
    } catch (_) { return null; }
  }
  function createContext() {
    const Audio = root.AudioContext || root.webkitAudioContext;
    if (!Audio) return;
    context = new Audio({ latencyHint: 'interactive' });
    master = context.createGain(); master.gain.value = enabled ? LEVEL : 0;
    fade = { from: master.gain.value, to: master.gain.value, start: 0, end: 0 };
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass'; highpass.frequency.value = 70; highpass.Q.value = 0.55;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 4200; lowpass.Q.value = 0.5;
    const compressor = glue(), trim = context.createGain();
    trim.gain.value = compressor ? OUTPUT * MAKEUP : OUTPUT;
    const ceiling = context.createWaveShaper(), curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const sample = i * 2 / (curve.length - 1) - 1;
      curve[i] = 0.82 * Math.tanh(sample / 0.82);
    }
    ceiling.curve = curve;
    // No oversampling stage after the curve: its output stays below 0.69 full scale.
    master.connect(highpass); highpass.connect(lowpass);
    if (compressor) { lowpass.connect(compressor); compressor.connect(trim); } else lowpass.connect(trim);
    trim.connect(ceiling); ceiling.connect(context.destination);
    // The room is built just after the first gesture's own sound, so that sound never waits on it.
    sends = null;
    const owner = context, build = () => { if (context === owner && !sends && context.state !== 'closed') sends = room(); };
    if (typeof root.setTimeout === 'function') { try { root.setTimeout(build, 30); } catch (_) { build(); } } else build();
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
        voices.clear(); resuming = null; sends = null; createContext();
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
  // One voice. options: chord (extra pad notes in Hz), from / bend (a pitch glide into the note),
  // bright (0..1 scales the upper partials), space ('low' | 'mid' | 'high' reverb send).
  function note(frequency, delay, duration, volume, pan = 0, style = 'bell', priority = 1, options = {}) {
    if (!context || !enabled || context.state !== 'running') return;
    reap();
    // Reserve room for result cues; never steal a ringing voice with a hard cutoff.
    if (voices.size >= (priority >= 2 ? MAX_VOICES : priority === 1 ? MAX_VOICES - 3 : 9)) return;
    let budget = MAX_OSCILLATORS;
    for (const voice of voices) budget -= voice.oscillators.length;
    if (budget < 1) return;
    const timbre = TIMBRES[style] || TIMBRES.bell;
    const at = context.currentTime + delay, end = at + duration + 0.018;
    const touch = 1 - 0.1 * chance(), cents = (chance() - 0.5) * (style === 'wood' ? 16 : 8);
    // Low notes lean a little more on their overtones, so they still read on a phone's small speaker.
    const lift = style === 'chime' ? 1 : Math.max(1, Math.min(2.4, 440 / frequency));
    const bright = (options.bright === undefined ? 1 : options.bright) * touch * touch * lift;
    const peak = volume * touch;
    const gain = context.createGain(), oscillator = context.createOscillator();
    const voice = { gain, end, released: false, nodes: [gain, oscillator], oscillators: [oscillator] };
    const envelope = gain.gain;
    envelope.setValueAtTime(0, at);
    envelope.linearRampToValueAtTime(peak, at + timbre.attack);
    // Struck sounds fall quickly from the strike, then ring; the last stretch is a short linear fade to silence.
    if (timbre.body && duration > timbre.body[0] * 2) envelope.exponentialRampToValueAtTime(peak * timbre.body[1], at + timbre.body[0]);
    envelope.exponentialRampToValueAtTime(Math.max(1e-5, peak * 0.001), at + duration);
    envelope.linearRampToValueAtTime(0, end);
    const from = options.from || timbre.bend[0], glide = options.from ? options.bend || 0.05 : timbre.bend[1];
    const tune = (source, ratio, spread = 0) => {
      source.type = 'sine';
      if (source.detune && typeof source.detune === 'object') source.detune.value = cents + spread;
      source.frequency.setValueAtTime(frequency * ratio * from, at);
      if (from !== 1 && glide > 0) source.frequency.exponentialRampToValueAtTime(frequency * ratio, at + Math.min(glide, duration / 2));
    };
    tune(oscillator, 1);
    oscillator.connect(gain);
    if (options.chord) {
      // Pad notes share the envelope at equal level, gently detuned against each other for warmth.
      options.chord.slice(0, Math.min(3, budget - 1)).forEach((pitch, index) => {
        const extra = context.createOscillator();
        tune(extra, pitch / frequency, index % 2 ? 5 : -4);
        extra.connect(gain); voice.nodes.push(extra); voice.oscillators.push(extra);
      });
    } else {
      for (const [ratio, level, decay] of timbre.partials) {
        if (voice.oscillators.length >= Math.min(4, budget) || frequency * ratio > 3600) continue;
        const partial = context.createOscillator(), partialGain = context.createGain();
        tune(partial, ratio);
        partialGain.gain.setValueAtTime(level * bright, at);
        // Low overtones of low notes also ring a little longer, so the note keeps its body on small speakers.
        const ring = ratio < 3 ? decay * Math.min(lift, 2) : decay;
        if (decay > 0) partialGain.gain.exponentialRampToValueAtTime(level * bright * 0.001, at + Math.min(ring, duration));
        partial.connect(partialGain); partialGain.connect(gain);
        voice.nodes.push(partial, partialGain); voice.oscillators.push(partial);
      }
    }
    if (typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner(); panner.pan.value = pan;
      gain.connect(panner); panner.connect(master); voice.nodes.push(panner);
    } else gain.connect(master);
    const send = sends && sends[options.space || timbre.space];
    if (send) gain.connect(send);
    voices.add(voice);
    oscillator.onended = () => {
      voice.released = false;
      release(voice, true);
    };
    for (const source of voice.oscillators) { source.start(at); source.stop(end); }
  }
  function phrase(frequencies, spacing, duration, volume, pan = 0, style = 'bell') {
    frequencies.forEach((frequency, index) => note(frequency, index * spacing, duration, volume, pan * 0.5, style, 2));
  }
  // A soft chord swell under a flourish: one voice, the chord's notes as its partials.
  function pad(steps, delay, duration, volume) {
    const [first, ...rest] = steps.map(step);
    note(first, delay, duration, volume, 0, 'pad', 2, { chord: rest });
  }
  // [Hz, delay, duration, style, options] per note: a meow glides down, a chirp and a squeak
  // rise, a ribbit is two low knocks that dip, a bee hums a whole-tone trill.
  const FRIENDS = {
    cat: [[hz(4 + 12), 0, 0.12, 'bell', { from: 0.94, bend: 0.05 }], [hz(2 + 12), 0.11, 0.34, 'bell', { from: 1.335, bend: 0.22 }]],
    bluebird: [[hz(2 + 24), 0, 0.07, 'drop', { from: 0.75, bend: 0.035 }], [hz(7 + 24), 0.09, 0.07, 'drop', { from: 0.75, bend: 0.035 }],
      [hz(2 + 24), 0.2, 0.07, 'drop', { from: 0.75, bend: 0.035 }], [hz(7 + 24), 0.29, 0.1, 'drop', { from: 0.75, bend: 0.035 }]],
    frog: [[hz(-10), 0, 0.1, 'marimba', { from: 1.12, bend: 0.06 }], [hz(-12), 0.13, 0.14, 'marimba', { from: 1.12, bend: 0.07 }]],
    bee: [[hz(-5), 0, 0.06, 'marimba', { from: 0.96 }], [hz(-3), 0.045, 0.06, 'marimba', { from: 0.96 }],
      [hz(-5), 0.09, 0.06, 'marimba', { from: 0.96 }], [hz(-3), 0.135, 0.09, 'marimba', { from: 0.96 }]],
    firefly: [[hz(19), 0, 0.2, 'chime'], [hz(24), 0.06, 0.24, 'chime'], [hz(28), 0.12, 0.34, 'chime']],
    squirrel: [[hz(19), 0, 0.06, 'drop'], [hz(21), 0.07, 0.06, 'drop'], [hz(24), 0.14, 0.09, 'drop']]
  };
  const FRIEND_LEVEL = { bell: 0.06, drop: 0.075, marimba: 0.07, chime: 0.022 };
  function play(type, data = {}) {
    if (!enabled || !context) return;
    if (context.state !== 'running') {
      // Keep the first gesture's sound through resume, not a backlog of old audio.
      if (waiting.length < 8) waiting.push({ type, data: { combo: data.combo, chain: data.chain, kind: data.kind, wave: data.wave, power: data.power, index: data.index, stars: data.stars, boss: data.boss, x: data.bud ? data.bud.x : data.x }, at: Date.now() });
      return;
    }
    const pan = panFor(data);
    if (type === 'bloom') {
      if (!allowed('bloom', 0.022)) return;
      const suppliedCombo = Number(data.combo);
      const combo = Number.isFinite(suppliedCombo) ? Math.max(1, Math.floor(suppliedCombo)) : 1;
      // A kalimba note from the chain's chord; a long chain rings a little brighter.
      const pitch = step(gardenFor(combo)[(combo - 1) % 5]), bright = Math.min(1, 0.8 + combo * 0.015);
      note(pitch, 0, data.chain ? 0.3 : 0.42, data.chain ? 0.1 : 0.15, pan, 'bell', 1, { bright });
    } else if (type === 'bounce') {
      if (!allowed('bounce', 0.075)) return;
      // Soft knocks: a rock sounds deeper than a wall, and the leaf answers with a small tuned tok.
      if (data.kind === 'bumper') note(hz(2), 0, 0.12, 0.07, pan, 'marimba', 0, { space: 'low' });
      else if (data.kind === 'rock') note(hz(-15), 0, 0.12, 0.085, pan, 'wood', 0);
      else note(hz(-10), 0, 0.09, 0.06, pan, 'wood', 0);
    } else if (type === 'launch') {
      if (!allowed('launch', 0.065)) return;
      // A soft thump that dips into its pitch, then a quiet kalimba ping as the seed leaves.
      note(hz(-3), 0, 0.12, 0.09, pan, 'marimba', 1, { from: 1.12, bend: 0.03, space: 'low' }); note(hz(4), 0.025, 0.16, 0.055, pan);
    } else if (type === 'rotate' || type === 'tap') {
      if (allowed('touch', 0.05)) note(hz(9), 0, 0.1, 0.075, pan, 'marimba', 0, { space: 'low' });
    } else if (type === 'crack') {
      if (allowed('crack', 0.045)) note(hz(7), 0, 0.12, 0.065, pan, 'marimba');
    } else if (type === 'won' && allowed('won', 0.6)) {
      // A rising kalimba arpeggio over a warm chord and a low marimba root; full stars add a high sparkle.
      pad([0, 2, 4], 0, 0.95, 0.03);
      note(hz(-12), 0, 0.5, 0.07, 0, 'marimba', 2);
      phrase([0, 4, 7, 12, 16].map(hz), 0.075, 0.62, 0.11);
      if (!(Number(data.stars) < 3)) note(hz(24), 0.4, 0.5, 0.04, 0, 'chime', 2);
    } else if ((type === 'burst' || type === 'split') && allowed('split', 0.16)) phrase([7, 12, 16].map(hz), 0.038, 0.32, 0.085, pan);
    else if (type === 'wave' && allowed('wave', 0.4)) {
      // Each Rush wave starts one step higher up the C major scale, up to a fifth, so the run audibly climbs.
      const lift = Math.min(4, Math.max(0, (Number(data.wave) || 1) - 2));
      phrase([0, 4, 5].map(n => step(n + lift)), 0.075, 0.4, 0.1);
      if (data.boss) note(step(lift - 7), 0, 0.6, 0.06, 0, 'marimba', 2);
    } else if (type === 'cleared' && allowed('cleared', 0.5)) {
      const lift = Math.min(4, Math.max(0, (Number(data.wave) || 1) - 1));
      phrase([4, 7, 9, 11].map(n => step(n + lift)), 0.055, 0.5, 0.11);
      pad([0, 2, 4].map(n => n + lift), 0, 0.6, 0.022);
    }
    else if (type === 'plant' && allowed('plant', 0.35)) phrase([0, 4, 7, 12].map(hz), 0.14, 0.55, 0.1, pan);
    else if (type === 'gate' && allowed('gate', 0.14)) {
      // A quiet rising fifth follows the seed through the paired apertures.
      note(hz(2), 0, 0.22, 0.075, pan * 0.5, 'bell', 1, { space: 'high' });
      note(hz(9), 0.072, 0.36, 0.06, pan * 0.5, 'bell', 1, { space: 'high' });
    }
    // Koi currents: two soft water drops when a seed slips into a lane.
    else if (type === 'current' && allowed('current', 0.18)) {
      note(hz(12), 0, 0.16, 0.06, pan * 0.5, 'drop');
      note(hz(19), 0.055, 0.2, 0.045, pan * 0.5, 'drop');
    }
    // Chain milestones: a quick rising celesta run through the chain's own chord, above the bloom notes.
    else if (type === 'shimmer' && allowed('shimmer', 0.3)) {
      const combo = Math.max(1, Math.floor(Number(data.combo) || 5));
      phrase(gardenFor(combo).slice(1).map(n => step(n + 7)), 0.045, 0.34, 0.045, pan * 0.5, 'chime');
    }
    // Meadow friends: a short, quiet voice for each one when tapped.
    else if (type === 'friend' && allowed('friend', 0.22)) {
      const voice = FRIENDS[data.kind];
      if (voice) voice.forEach(([frequency, delay, duration, style, options]) => note(frequency, delay, duration, FRIEND_LEVEL[style], pan * 0.5, style, 1, options));
    }
    // A life lost: a soft falling third that lands on home, never a buzzer.
    else if (type === 'life' && allowed('life', 0.15)) { note(hz(4), 0, 0.3, 0.09, pan * 0.5, 'bell', 2); note(hz(0), 0.12, 0.46, 0.08, pan * 0.5, 'bell', 2); }
    // Level pieces: a puffcap pops with a soft low drop and a sparkle, an acorn cup clinks, the boss blooms
    // with a full rising chord, and reinforcements land with two small plops.
    else if (type === 'puff' && allowed('puff', 0.12)) { note(hz(-5), 0, 0.2, 0.08, pan, 'drop'); note(hz(14), 0.06, 0.26, 0.04, pan, 'chime'); note(hz(21), 0.12, 0.22, 0.028, pan, 'chime'); }
    else if (type === 'shield' && allowed('shield', 0.09)) { note(hz(16), 0, 0.08, 0.07, pan, 'marimba', 0); note(hz(11), 0.035, 0.1, 0.058, pan, 'marimba', 0); }
    else if (type === 'boss' && allowed('boss', 0.8)) {
      pad([0, 4, 9], 0, 0.95, 0.032);
      note(hz(-12), 0, 0.6, 0.08, 0, 'marimba', 2);
      phrase([7, 12, 16, 19, 24].map(hz), 0.06, 0.68, 0.1);
      note(hz(28), 0.3, 0.5, 0.032, 0, 'chime', 2);
    }
    else if (type === 'drop' && allowed('drop', 0.5)) { note(hz(21), 0, 0.1, 0.055, 0, 'drop'); note(hz(16), 0.08, 0.13, 0.05, 0, 'drop'); }
    else if (type === 'geode' && allowed('geode', 0.12)) { note(hz(19), 0, 0.14, 0.05, pan, 'chime'); note(hz(24), 0.05, 0.18, 0.04, pan, 'chime'); note(hz(28), 0.1, 0.24, 0.032, pan, 'chime'); }
    else if (type === 'regrow' && allowed('regrow', 0.3)) { note(hz(-3), 0, 0.14, 0.06, pan, 'marimba'); note(hz(-7), 0.08, 0.2, 0.05, pan, 'marimba'); }
    // Powerups: arming ticks up, a Sunburst opens with a bright fanfare, a bee hums past each flower,
    // a Lullaby plays a music-box fall over a soft chord, and a gift bubble chimes when it arrives and when it is caught.
    else if (type === 'arm' && allowed('touch', 0.05)) {
      if (data.power) { note(hz(12), 0, 0.09, 0.065, 0, 'marimba', 0); note(hz(19), 0.05, 0.2, 0.04, 0, 'chime'); }
      else note(hz(7), 0, 0.1, 0.075, 0, 'marimba', 0);
    }
    else if (type === 'power' && allowed('power', 0.3)) {
      if (data.power === 'lullaby') { pad([0, 2, 4], 0, 0.95, 0.022); phrase([16, 12, 7].map(hz), 0.16, 0.6, 0.07); }
      else if (data.power === 'dandelion') { note(hz(21), 0, 0.12, 0.05, 0, 'drop'); note(hz(24), 0.04, 0.12, 0.045, -0.4, 'drop'); note(hz(26), 0.08, 0.14, 0.045, 0.4, 'drop'); }
      else if (data.power === 'beeline') { note(hz(-5), 0, 0.08, 0.07, 0, 'marimba', 1, { from: 0.94 }); note(hz(-3), 0.06, 0.12, 0.06, 0, 'marimba', 1, { from: 0.94 }); }
      else { note(hz(7), 0, 0.12, 0.07, 0, 'marimba'); note(hz(12), 0.05, 0.2, 0.05, 0, 'bell'); }
    }
    else if (type === 'sunburst' && allowed('sunburst', 0.3)) {
      pad([0, 2, 4], 0, 0.8, 0.03);
      phrase([4, 7, 12, 16, 19].map(hz), 0.032, 0.6, 0.095, pan);
      note(hz(24), 0.18, 0.5, 0.035, pan * 0.5, 'chime', 2);
    }
    else if (type === 'bee' && allowed('bee', 0.07)) { note(hz(-5), 0, 0.06, 0.075, pan, 'marimba', 1, { from: 0.96 }); note(hz(-3), 0.04, 0.07, 0.068, pan, 'marimba', 1, { from: 0.96 }); }
    else if (type === 'giftAppear' && allowed('gift', 0.5)) { note(hz(19), 0, 0.12, 0.07, pan, 'drop'); note(hz(24), 0.1, 0.16, 0.065, pan, 'drop'); note(hz(28), 0.18, 0.3, 0.03, pan, 'chime'); }
    else if (type === 'gift' && allowed('gift', 0.2)) {
      // The bubble pops, then a bright little run lands on a warm chord.
      note(hz(7), 0, 0.12, 0.06, pan, 'drop', 2);
      phrase([12, 16, 19, 24].map(hz), 0.05, 0.46, 0.09, pan, 'bell');
      pad([0, 2, 4], 0.03, 0.6, 0.022);
    }
    else if (type === 'fever' && allowed('fever', 1.0)) {
      const combo = Math.max(1, Math.floor(Number(data.combo) || 12));
      phrase(gardenFor(combo).map(n => step(n + 7)), 0.035, 0.45, 0.07, 0, 'bell');
    }
    // A run lost: a gentle walk down to home over a soft chord. Kind, not punishing.
    else if (type === 'lost' && allowed('lost', 0.6)) {
      phrase([7, 4, 2].map(hz), 0.13, 0.4, 0.085);
      note(hz(0), 0.39, 0.6, 0.085, 0, 'bell', 2);
      pad([-7, -3, 2], 0.36, 0.7, 0.022);
    }
    // Result stars: a sweet rising chime per star, the third a touch fuller.
    else if (type === 'star' && allowed('star', 0.08)) {
      const index = Math.max(0, Math.min(2, Math.floor(Number(data.index)) || 0));
      note(hz([12, 16, 19][index]), 0, 0.42, 0.065 + index * 0.005, pan * 0.5, 'bell', 2);
      note(hz([24, 28, 31][index]), 0.012, 0.36, 0.022, pan * 0.5, 'chime', 2);
      if (index === 2) note(hz(24), 0.06, 0.42, 0.03, pan * 0.5, 'chime', 2);
    }
  }
  root.BloomSound = {
    wake,
    setEnabled(value) {
      const changed = enabled !== Boolean(value); enabled = Boolean(value);
      waiting = [];
      if (!enabled) for (const voice of voices) release(voice);
      if (master && context && context.state !== 'closed') fadeMaster(enabled ? LEVEL : 0);
      if (changed && enabled) wake();
    },
    play
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
