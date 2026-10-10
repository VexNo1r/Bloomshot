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
  // C major pentatonic, for runs that climb without ever leaning on a half step.
  const PENTATONIC = [0, 2, 4, 7, 9];
  const pent = (k, base = 0) => hz(base + 12 * Math.floor(k / 5) + PENTATONIC[((k % 5) + 5) % 5]);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const num = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
  // Blooms walk C6 / Am7 / Fmaj7 / G6, five notes each: warmth and movement without an ever-rising pitch ladder.
  const GARDENS = [[0, 2, 4, 5, 7], [-2, 0, 2, 4, 5], [-4, -2, 0, 2, 3], [-3, -1, 1, 2, 4]];
  const gardenFor = combo => GARDENS[Math.floor((combo - 1) / 5) % GARDENS.length];
  // A chord is a scale degree (0 = C ... 5 = A) and its tones in scale steps: the triad plus any extras
  // (6 a seventh, 5 a sixth). Every chord is diatonic, so anything built from one stays in C major.
  const chord = ([degree, ...extra]) => ({ degree, tones: [0, 2, 4, ...extra].map(n => degree + n) });
  // The same four chords as the garden walk above, for the seed ladder when the music is off.
  const GARDEN_CHORDS = [[0, 5], [5, 6], [3, 6], [4, 5]].map(chord);
  // Puts a scale step in the octave that starts at `low`.
  const place = (n, low) => n + 7 * Math.ceil((low - n) / 7);
  // Timbres: [ratio, level, decay seconds, rise seconds] partials over a sine fundamental. Upper partials die away
  // first, the way a struck bar or tine does; anything that would land above 3.6 kHz is left out.
  //   bell: a kalimba / celesta mallet, with an octave and a short stretched-octave tick for the strike.
  //   marimba: a tuned wooden bar (its fourth partial is two octaves up) for knocks that still have pitch.
  //   wood: an untuned soft knock (free-bar partials 2.76 and 5.4) for bounces.
  //   chime: a high glassy note with a slowly beating twin, for sparkles.
  //   drop: one sine that rises into its pitch, a water drop.
  //   pad: a soft chord swell under the big moments; the partials are the chord's own notes.
  //   harp: a plucked string; its bright overtones fade fast and leave the round note.
  //   glass: a rubbed glass, a wide beating twin over a thin octave.
  //   pan: a steel pan; its octave blooms a moment after the strike.
  //   timp: a kettle drum's modes (1, 1.5, 2) for rolls and landings.
  //   thump: a low felt drum that drops into its pitch, with a knock on top so phones still hear it.
  const TIMBRES = {
    bell: { attack: 0.005, body: [0.07, 0.5], bend: [1.003, 0.05], space: 'mid', partials: [[2, 0.24, 0.24], [4.07, 0.07, 0.045]] },
    marimba: { attack: 0.004, body: [0.05, 0.42], bend: [1.006, 0.03], space: 'mid', partials: [[3.98, 0.26, 0.07], [9.2, 0.05, 0.02]] },
    wood: { attack: 0.004, body: [0.03, 0.35], bend: [1.045, 0.022], space: 'low', partials: [[2.76, 0.36, 0.045], [5.4, 0.12, 0.016]] },
    chime: { attack: 0.006, body: [0.09, 0.55], bend: [1, 0], space: 'high', partials: [[1.0028, 0.42, 0], [2, 0.12, 0.11]] },
    drop: { attack: 0.004, body: null, bend: [0.6, 0.045], space: 'mid', partials: [] },
    pad: { attack: 0.08, body: [0.3, 0.55], bend: [1, 0], space: 'high', partials: [] },
    harp: { attack: 0.004, body: [0.06, 0.55], bend: [1, 0], space: 'mid', partials: [[2, 0.42, 0.3], [3, 0.2, 0.16], [4, 0.1, 0.08]] },
    glass: { attack: 0.005, body: [0.05, 0.5], bend: [1, 0], space: 'high', partials: [[1.0045, 0.36, 0], [2.01, 0.22, 0.16], [4.2, 0.05, 0.04]] },
    pan: { attack: 0.006, body: [0.06, 0.58], bend: [1.004, 0.02], space: 'mid', partials: [[2, 0.5, 0.3, 0.025], [3, 0.2, 0.14], [4.02, 0.07, 0.05]] },
    timp: { attack: 0.01, body: null, bend: [1, 0], space: 'low', partials: [[1.5, 0.32, 0.5], [2, 0.18, 0.4]] },
    thump: { attack: 0.004, body: [0.04, 0.45], bend: [1.6, 0.06], space: 'low', partials: [[2, 0.32, 0.09], [2.76, 0.22, 0.04]] }
  };
  // Each flower has its own instrument for its bloom note: [timbre, level].
  const FLOWER_VOICES = { gold: ['bell', 1], coral: ['marimba', 1], lilac: ['harp', 0.88], sky: ['glass', 0.8], poppy: ['pan', 0.9] };
  // Short noise transients under the notes: [bandpass Hz, seconds, level]. Every band stays at or under 3.6 kHz.
  const CRUNCH = { crack: [1200, 0.03, 0.09], pop: [2000, 0.025, 0.07], thock: [300, 0.02, 0.12], click: [2400, 0.012, 0.06], burst: [1800, 0.16, 0.11] };
  let context, master, cueBus = null, sends = null, enabled = true, resuming = null;
  // The master fade is tracked here, so every new fade starts exactly where the last one is now.
  // (A ramp with no anchor before it would start from the context's time zero and jump: a click.)
  let fade = { from: 0, to: 0, start: 0, end: 0 };
  const voices = new Set(), recent = Object.create(null);
  let waiting = [], cueName = '', crunchNoise = null, crunchCursor = 0, transients = 0, roll = null;

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
    // Two buses meet at the master: the cues here, and the music (built when it first plays).
    cueBus = context.createGain(); cueBus.gain.value = 1; cueBus.connect(master);
    crunchNoise = null; transients = 0; roll = null;
    resetMusic();
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
  // bright (0..1 scales the upper partials), space ('low' | 'mid' | 'high' reverb send),
  // swell (seconds the note takes to grow to full, for crescendos).
  function note(frequency, delay, duration, volume, pan = 0, style = 'bell', priority = 1, options = {}) {
    if (!context || !enabled || context.state !== 'running') return null;
    reap();
    // Reserve room for result cues; never steal a ringing voice with a hard cutoff.
    if (voices.size >= (priority >= 2 ? MAX_VOICES : priority === 1 ? MAX_VOICES - 3 : 9)) return null;
    let budget = MAX_OSCILLATORS;
    for (const voice of voices) budget -= voice.oscillators.length;
    if (budget < 1) return null;
    const timbre = TIMBRES[style] || TIMBRES.bell;
    const at = context.currentTime + delay, end = at + duration + 0.018;
    const touch = 1 - 0.1 * chance(), cents = (chance() - 0.5) * (style === 'wood' ? 16 : 8);
    // Low notes lean a little more on their overtones, so they still read on a phone's small speaker.
    const lift = style === 'chime' || style === 'glass' ? 1 : Math.max(1, Math.min(2.4, 440 / frequency));
    const bright = (options.bright === undefined ? 1 : options.bright) * touch * touch * lift;
    const peak = volume * touch;
    const gain = context.createGain(), oscillator = context.createOscillator();
    const voice = { gain, end, released: false, nodes: [gain, oscillator], oscillators: [oscillator], tag: cueName };
    const envelope = gain.gain;
    envelope.setValueAtTime(0, at);
    const swell = options.swell > 0 && options.swell < duration * 0.9 ? options.swell : 0;
    envelope.linearRampToValueAtTime(peak, at + (swell || timbre.attack));
    // Struck sounds fall quickly from the strike, then ring; the last stretch is a short linear fade to silence.
    if (!swell && timbre.body && duration > timbre.body[0] * 2) envelope.exponentialRampToValueAtTime(peak * timbre.body[1], at + timbre.body[0]);
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
      for (const [ratio, level, decay, rise] of timbre.partials) {
        if (voice.oscillators.length >= Math.min(4, budget) || frequency * ratio > 3600) continue;
        const partial = context.createOscillator(), partialGain = context.createGain();
        tune(partial, ratio);
        // A partial with a rise starts low and blooms in just after the strike (the steel pan's octave).
        partialGain.gain.setValueAtTime(level * bright * (rise ? 0.25 : 1), at);
        if (rise) partialGain.gain.linearRampToValueAtTime(level * bright, at + rise);
        // Low overtones of low notes also ring a little longer, so the note keeps its body on small speakers.
        const ring = (ratio < 3 ? decay * Math.min(lift, 2) : decay) + (rise || 0);
        if (decay > 0) partialGain.gain.exponentialRampToValueAtTime(level * bright * 0.001, at + Math.min(ring, duration));
        partial.connect(partialGain); partialGain.connect(gain);
        voice.nodes.push(partial, partialGain); voice.oscillators.push(partial);
      }
    }
    if (typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner(); panner.pan.value = pan;
      gain.connect(panner); panner.connect(cueBus); voice.nodes.push(panner);
    } else gain.connect(cueBus);
    const send = sends && sends[options.space || timbre.space];
    if (send) gain.connect(send);
    voices.add(voice);
    oscillator.onended = () => {
      voice.released = false;
      release(voice, true);
    };
    for (const source of voice.oscillators) { source.start(at); source.stop(end); }
    return voice;
  }
  function phrase(frequencies, spacing, duration, volume, pan = 0, style = 'bell', delay = 0) {
    frequencies.forEach((frequency, index) => note(frequency, delay + index * spacing, duration, volume, pan * 0.5, style, 2));
  }
  // A soft chord swell under a flourish: one voice, the chord's notes as its partials.
  function pad(steps, delay, duration, volume, swell = 0) {
    const [first, ...rest] = steps.map(step);
    note(first, delay, duration, volume, 0, 'pad', 2, { chord: rest, swell });
  }
  // A crisp noise transient: one shared, seeded quarter second of noise through a band. Browsers (and the test
  // fixture) without buffer sources simply skip it; the note it sits under still plays.
  function noise() {
    if (!crunchNoise) {
      const rate = context.sampleRate || 44100, size = Math.floor(rate * 0.25);
      crunchNoise = context.createBuffer(1, size, rate);
      const data = crunchNoise.getChannelData(0);
      let seed = 0x6d2b79f5;
      for (let i = 0; i < size; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
    }
    return crunchNoise;
  }
  function crunch(kind, delay = 0, pan = 0, scale = 1) {
    if (!context || !enabled || context.state !== 'running' || typeof context.createBufferSource !== 'function' || transients >= 8) return;
    const [band, length, level] = CRUNCH[kind];
    try {
      const at = context.currentTime + delay, peak = clamp(level * scale, 0, 0.16);
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = noise();
      filter.type = 'bandpass'; filter.frequency.value = Math.min(3600, band); filter.Q.value = band < 600 ? 1.4 : 0.9;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + Math.min(0.003, length / 4));
      gain.gain.exponentialRampToValueAtTime(Math.max(1e-5, peak * 0.01), at + length);
      gain.gain.linearRampToValueAtTime(0, at + length + 0.004);
      const nodes = [source, filter, gain];
      source.connect(filter); filter.connect(gain);
      if (typeof context.createStereoPanner === 'function') {
        const panner = context.createStereoPanner(); panner.pan.value = pan * 0.6; gain.connect(panner); panner.connect(cueBus); nodes.push(panner);
      } else gain.connect(cueBus);
      // Each hit reads a different stretch of the same noise, so repeats never sound copied.
      crunchCursor = (crunchCursor + 0.0613) % (0.25 - length - 0.01);
      transients++;
      source.onended = () => { transients = Math.max(0, transients - 1); for (const node of nodes) { try { node.disconnect(); } catch (_) {} } };
      source.start(at, crunchCursor, length + 0.008);
      source.stop(at + length + 0.008);
    } catch (_) { /* A transient is decoration; never let it interrupt a cue. */ }
  }
  // A snare roll: the seeded noise looping through a band, struck faster and louder until the impact,
  // over a timpani swell on G that the finale resolves to C. The finale cuts it; otherwise it fades.
  function startRoll(duration) {
    cutRoll();
    const now = context.currentTime, voice = note(step(-10), 0, duration + 0.2, 0.075, 0, 'timp', 2, { swell: duration });
    roll = { voice, nodes: null, gain: null, end: now + duration + 0.2 };
    if (typeof context.createBufferSource !== 'function' || transients >= 8) return;
    try {
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = noise(); source.loop = true;
      filter.type = 'bandpass'; filter.frequency.value = 1700; filter.Q.value = 0.7;
      const g = gain.gain;
      g.setValueAtTime(0, now);
      for (let t = 0, k = 0; t < duration; k++) {
        const progress = t / duration, gap = 1 / (13 + 11 * progress), peak = 0.012 + 0.085 * Math.pow(progress, 1.6) * (k % 2 ? 0.82 : 1);
        g.setValueAtTime(peak * 0.25, now + t);
        g.linearRampToValueAtTime(peak, now + t + 0.004);
        g.exponentialRampToValueAtTime(peak * 0.22, now + t + gap * 0.92);
        t += gap;
      }
      g.linearRampToValueAtTime(0, now + duration + 0.18);
      source.connect(filter); filter.connect(gain); gain.connect(cueBus);
      const nodes = [source, filter, gain];
      source.onended = () => { for (const node of nodes) { try { node.disconnect(); } catch (_) {} } };
      source.start(now); source.stop(now + duration + 0.2);
      roll.nodes = nodes; roll.gain = gain;
    } catch (_) {}
  }
  function cutRoll() {
    if (!roll) return;
    const now = context.currentTime;
    if (roll.end > now) {
      if (roll.voice) release(roll.voice);
      if (roll.gain) {
        try { hold(roll.gain.gain, now); roll.gain.gain.linearRampToValueAtTime(0, now + 0.012); roll.nodes[0].stop(now + 0.03); } catch (_) {}
      }
    }
    roll = null;
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
  // The seed ladder: a seed's blooms climb the chord the music is on (the garden walk's chord when it is off),
  // root, third, fifth, octave and on, from G3..F4 up to about 1 kHz; past the top they dance on its last notes.
  function ladderPitch(seedStep, combo) {
    const current = musicChord() || GARDEN_CHORDS[Math.floor((combo - 1) / 5) % GARDEN_CHORDS.length];
    const base = place(current.degree, -3), triad = [0, 2, 4], rungs = [];
    for (let k = 0; rungs.length < 12; k++) {
      const pitch = step(base + 7 * Math.floor(k / 3) + triad[k % 3]);
      if (pitch > 1100) break;
      rungs.push(pitch);
    }
    const top = rungs.length;
    if (seedStep < top) return rungs[seedStep];
    return rungs[top + [-2, -3, -2, -1][(seedStep - top) % 4]];
  }
  function flowerOf(data) { const type = data.bud && data.bud.type || data.type; return FLOWER_VOICES[type] ? type : null; }
  // The levels in order, for cues that only know a level number.
  const LEVEL_GROOVES = [null, 'meadow', 'roots', 'grotto', 'crystal', 'lake', 'fossil', 'ember', 'geode', 'briar', 'core'];
  // The relative minor of a chord, for the darker colors (danger toms, the boss): C and A go to A, D and F to D, the rest to E.
  const MINOR_OF = [5, 1, 2, 1, 2, 5, 2];
  function play(type, data = {}) {
    if (!enabled || !context) return;
    if (!data || typeof data !== 'object') data = {};
    if (context.state !== 'running') {
      // Keep the first gesture's sound through resume, not a backlog of old audio.
      if (waiting.length < 8) {
        const kept = { x: data.bud ? data.bud.x : data.x, bud: data.bud ? { x: data.bud.x, type: data.bud.type } : undefined };
        for (const key of ['combo', 'chain', 'kind', 'wave', 'power', 'index', 'stars', 'boss', 'seedStep', 'type', 'mult', 'petal', 'notch', 'i', 'n', 'dur', 'finale', 'level', 'left', 'super']) if (data[key] !== undefined) kept[key] = data[key];
        waiting.push({ type, data: kept, at: Date.now() });
      }
      return;
    }
    cueName = type;
    try { cue(type, data); } finally { cueName = ''; }
  }
  function cue(type, data) {
    const pan = panFor(data);
    if (type === 'bloom') {
      if (!allowed('bloom', 0.022)) return;
      const suppliedCombo = Number(data.combo);
      const combo = Number.isFinite(suppliedCombo) ? Math.max(1, Math.floor(suppliedCombo)) : 1;
      // With a seed step the note climbs the music's chord; without one it walks the garden chords by combo.
      const seedStep = data.seedStep === null || data.seedStep === undefined ? NaN : Math.floor(Number(data.seedStep));
      const pitch = Number.isFinite(seedStep) && seedStep >= 0 ? ladderPitch(seedStep, combo) : step(gardenFor(combo)[(combo - 1) % 5]);
      // A long chain rings a little brighter; Super Bloom brighter still.
      const bright = Math.min(data.super ? 1.15 : 1, 0.8 + combo * 0.015 + (data.super ? 0.15 : 0));
      const flower = flowerOf(data), [style, level] = flower ? FLOWER_VOICES[flower] : ['bell', 1];
      note(pitch, 0, data.chain ? 0.3 : 0.42, (data.chain ? 0.1 : 0.15) * level, pan, style, 1, { bright });
      crunch('pop', 0, pan, data.chain ? 0.55 : 1);
    } else if (type === 'bounce') {
      if (!allowed('bounce', 0.075)) return;
      // Soft knocks: a rock sounds deeper than a wall, and the leaf answers with a small tuned tok.
      if (data.kind === 'bumper') { note(hz(2), 0, 0.12, 0.07, pan, 'marimba', 0, { space: 'low' }); crunch('click', 0, pan); }
      else if (data.kind === 'rock') { note(hz(-15), 0, 0.12, 0.085, pan, 'wood', 0); crunch('thock', 0, pan, 1.2); }
      else { note(hz(-10), 0, 0.09, 0.06, pan, 'wood', 0); crunch('thock', 0, pan); }
    } else if (type === 'launch') {
      if (!allowed('launch', 0.065)) return;
      // A soft thump that dips into its pitch, then a quiet kalimba ping as the seed leaves.
      note(hz(-3), 0, 0.12, 0.09, pan, 'marimba', 1, { from: 1.12, bend: 0.03, space: 'low' }); note(hz(4), 0.025, 0.16, 0.055, pan);
    } else if (type === 'rotate' || type === 'tap') {
      if (allowed('touch', 0.05)) note(hz(9), 0, 0.1, 0.075, pan, 'marimba', 0, { space: 'low' });
    } else if (type === 'crack') {
      if (allowed('crack', 0.045)) { note(hz(7), 0, 0.12, 0.065, pan, 'marimba'); crunch('crack', 0, pan); }
    } else if (type === 'won' && allowed('won', 0.6)) {
      // A rising kalimba arpeggio over a warm chord and a low marimba root; full stars add a high sparkle.
      // After a finale it waits half a second, so it lands after the sweep.
      const wait = data.finale ? 0.5 : 0;
      pad([0, 2, 4], wait, 0.95, 0.03);
      note(hz(-12), wait, 0.5, 0.07, 0, 'marimba', 2);
      phrase([0, 4, 7, 12, 16].map(hz), 0.075, 0.62, 0.11, 0, 'bell', wait);
      if (!(Number(data.stars) < 3)) note(hz(24), wait + 0.4, 0.5, 0.04, 0, 'chime', 2);
    } else if ((type === 'burst' || type === 'split') && allowed('split', 0.16)) phrase([7, 12, 16].map(hz), 0.038, 0.32, 0.085, pan);
    else if (type === 'wave' && allowed('wave', 0.4)) {
      // Each Rush wave starts one step higher up the C major scale, up to a fifth, so the run audibly climbs.
      const lift = Math.min(4, Math.max(0, (Number(data.wave) || 1) - 2));
      phrase([0, 4, 5].map(n => step(n + lift)), 0.075, 0.4, 0.1);
      if (data.boss) note(step(lift - 7), 0, 0.6, 0.06, 0, 'marimba', 2);
    } else if (type === 'cleared') {
      // After a finale the sweep is the wave's music, so a cleared wave adds nothing.
      if (data.finale || !allowed('cleared', 0.5)) return;
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
      duck();
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
    else bigMoment(type, data, pan);
  }
  // The newer cues: Super Bloom, tricks, the finale and its sweep, aim, danger, stage and result cues.
  function bigMoment(type, data, pan) {
    const flower = flowerOf(data), flowerStyle = flower ? FLOWER_VOICES[flower][0] : 'bell';
    // Super Bloom: a rising C-E-G-C over a warm chord, then a shimmer above it.
    if (type === 'superBloom' && allowed('superBloom', 0.8)) {
      duck();
      pad([0, 2, 4], 0, 1.0, 0.032);
      phrase([12, 16, 19, 24].map(hz), 0.065, 0.55, 0.1);
      [28, 31, 36].forEach((n, i) => note(hz(n), 0.27 + i * 0.06, 0.5, 0.028, (i - 1) * 0.3, 'chime', 2));
    }
    // It ends on a soft falling fifth, home again.
    else if (type === 'superBloomEnd' && allowed('superBloomEnd', 0.5)) { note(hz(7), 0, 0.32, 0.07, 0, 'bell', 1); note(hz(0), 0.15, 0.55, 0.065, 0, 'bell', 1); }
    // Each petal of the sun is the next note up the C major scale, quiet, like counting.
    else if (type === 'sunPetal' && allowed('sunPetal', 0.03)) {
      const petal = clamp(Math.floor(num(data.petal)), 0, 7);
      note(step(7 + petal), 0, 0.32, 0.045, 0, 'bell', 1, { space: 'high' });
      if (petal === 7) note(step(14), 0.05, 0.4, 0.025, 0, 'chime', 1);
    }
    // The multiplier rising: a two-note lift that sits higher for each step.
    else if (type === 'mult' && allowed('mult', 0.1)) {
      const [low, high] = { 2: [4, 7], 3: [7, 9], 4: [9, 11], 5: [11, 14] }[clamp(Math.floor(num(data.mult, 2)), 2, 5)];
      note(step(low), 0, 0.12, 0.06, 0, 'marimba', 1); note(step(high), 0.06, 0.32, 0.075, 0, 'bell', 1);
    }
    // A long chain lets go on a soft chord, the one the music is on.
    else if (type === 'chainEnd' && allowed('chainEnd', 0.4)) {
      const current = musicChord() || chord([0]), root = place(current.degree, -1), level = 0.045 + Math.min(0.02, num(data.chain) / 200);
      note(step(root), 0, 0.9, 0.03, 0, 'pad', 1, { chord: [step(root + 2), step(root + 4)], swell: 0.08 });
      [0, 2, 4].forEach((n, i) => note(step(root + 7 + n), 0.04 + i * 0.045, 0.5, level, pan * 0.4, 'bell', 1));
    }
    else if (type === 'trick' && allowed('trick', 0.1)) trick(String(data.kind || 'trick'), pan);
    // The finale: an impact chord, a sub thump and a burst of noise. It cuts the roll and ducks the music.
    else if (type === 'finale' && allowed('finale', 0.5)) {
      cutRoll(); duck();
      pad([-7, -3, 0, 2], 0, 1.0, 0.045);
      note(hz(-24), 0, 0.55, 0.14, 0, 'thump', 2);
      note(hz(-12), 0, 0.6, 0.08, 0, 'marimba', 2);
      [0, 4, 7].forEach(n => note(hz(n + 12), 0, 0.85, 0.075, pan * 0.4, 'bell', 2));
      note(hz(24), 0.02, 0.9, 0.07, pan * 0.4, flowerStyle, 2);
      crunch('burst', 0, pan);
    }
    // The drumroll into the finale.
    else if (type === 'roll' && allowed('roll', 0.5)) startRoll(clamp(num(data.dur, 0.9), 0.3, 0.86));
    // The sweep: each flaring flower plays the next note of a rising pentatonic run, in its own instrument.
    else if (type === 'sweep' && allowed('sweep', 0.02)) {
      const n = Math.max(1, Math.floor(num(data.n, 1))), i = clamp(Math.floor(num(data.i)), 0, n - 1);
      note(pent(n > 1 ? Math.round(i * 9 / (n - 1)) : 0, 12), 0, 0.45, 0.07, pan, flowerStyle, 1);
    }
    // Aiming: a very quiet wooden tick per notch of the dial, pitched by the notch, and a click when it locks on.
    else if (type === 'aimTick' && allowed('aim', 0.035)) {
      const notch = Math.round(num(data.notch));
      note(step(7 + ((notch % 7) + 7) % 7), 0, 0.05, 0.022, 0, 'wood', 0);
    }
    else if (type === 'aimLock' && allowed('aimLock', 0.08)) { note(step(11), 0, 0.06, 0.05, 0, 'marimba', 1); note(step(14), 0.035, 0.09, 0.045, 0, 'marimba', 1); }
    // The last life near the line: a soft low double thump.
    else if (type === 'heartbeat' && allowed('heartbeat', 0.4)) { note(hz(-12), 0, 0.16, 0.1, 0, 'thump', 1); note(hz(-17), 0.17, 0.22, 0.075, 0, 'thump', 1); }
    // A level opens with a harp run up its own first chord; a boss with a low drum under a rising minor line.
    else if (type === 'intro' && allowed('intro', 0.6)) {
      const groove = GROOVES[LEVEL_GROOVES[Math.floor(num(data.level))]] || GROOVES.home, first = groove.bars[0][0].chord;
      if (data.boss) {
        const minor = place(MINOR_OF[((first.degree % 7) + 7) % 7], -3);
        note(step(minor - 7), 0, 0.7, 0.12, 0, 'thump', 2);
        note(step(minor - 7), 0.02, 0.9, 0.06, 0, 'timp', 2);
        [0, 2, 4, 7].forEach((n, i) => note(step(minor + n), 0.12 + i * 0.085, 0.55, 0.075, 0, 'marimba', 2));
        pad([minor, minor + 2, minor + 4], 0.1, 0.95, 0.03);
      } else {
        const root = place(first.degree, -1), run = [0, 2, 4, 7, 9];
        run.forEach((n, i) => note(step(root + n), i * 0.06, 0.6, 0.075, (i - 2) * 0.12, 'harp', 2));
        pad(first.tones.slice(0, 3).map(n => place(n, 0)), 0, 0.95, 0.026, 0.2);
        note(step(root + 11), 0.32, 0.6, 0.05, 0, 'bell', 2);
      }
    }
    // The harvest: orbs land as rising glass plucks. Past the ninth (a big harvest) they twinkle on the top notes
    // instead of ringing one pitch over and over.
    else if (type === 'pluck' && allowed('pluck', 0.03)) {
      const i = Math.max(0, Math.floor(num(data.i))), k = i <= 8 ? i : 8 - [1, 0, 2, 0][(i - 9) % 4];
      note(pent(5 + k), 0, 0.24, 0.05, 0.25, 'glass', 1);
    }
    // New flowers plop into place.
    else if (type === 'plop' && allowed('plop', 0.035)) note(pent([0, 2, 4, 1, 3][Math.abs(Math.floor(num(data.i))) % 5]), 0, 0.14, 0.055, pan, 'drop', 1);
    // A boss lands: a low drum under a soft minor chord.
    else if (type === 'bossLand' && allowed('bossLand', 0.5)) {
      note(hz(-15), 0, 0.5, 0.13, pan * 0.5, 'thump', 2);
      note(hz(-3), 0.04, 0.5, 0.06, pan * 0.5, 'marimba', 2);
      pad([-2, 0, 2], 0.02, 0.9, 0.032);
      crunch('thock', 0, pan, 1.3);
    }
    // The result score counting up: small rising ticks, tick i of n climbing two octaves of pentatonic.
    else if (type === 'tally' && allowed('tally', 0.045)) {
      const n = clamp(Math.floor(num(data.n, 14)), 2, 14), i = clamp(Math.floor(num(data.i)), 0, n - 1);
      note(pent(3 + Math.round(i * 10 / (n - 1))), 0, 0.08, 0.04, 0, 'marimba', 1);
    }
    // A new best: a sparkle fanfare that cuts the end of the losing phrase short.
    else if (type === 'record' && allowed('record', 0.8)) {
      for (const voice of voices) if (voice.tag === 'lost') release(voice);
      pad([0, 2, 4], 0, 0.95, 0.034);
      note(hz(-12), 0, 0.5, 0.07, 0, 'marimba', 2);
      phrase([12, 16, 19, 24].map(hz), 0.07, 0.55, 0.1);
      note(hz(28), 0.28, 0.5, 0.034, -0.3, 'chime', 2); note(hz(31), 0.34, 0.5, 0.03, 0.3, 'chime', 2);
    }
    // Split is charged: a bright little rise.
    else if (type === 'splitReady' && allowed('splitReady', 0.5)) { note(hz(19), 0, 0.2, 0.05, 0, 'glass', 1); note(hz(26), 0.07, 0.32, 0.045, 0, 'glass', 1); }
    // Lullaby counting down its last seconds on a music box (E, D, C), then the flowers wake.
    else if (type === 'lullabyTick' && allowed('lullabyTick', 0.3)) note(step(6 + clamp(Math.round(num(data.left, 1)), 1, 3)), 0, 0.36, 0.045, 0, 'bell', 1, { space: 'high' });
    else if (type === 'lullabyWake' && allowed('lullabyWake', 0.5)) {
      note(hz(12), 0, 0.14, 0.06, 0, 'drop', 1); note(hz(16), 0.06, 0.14, 0.055, 0, 'drop', 1);
      note(hz(24), 0.12, 0.42, 0.05, 0, 'bell', 1); note(hz(31), 0.17, 0.32, 0.022, 0, 'chime', 1);
    }
    // A briar about to grow back: two dry knocks that climb as its time runs out.
    else if (type === 'briarTick' && allowed('briarTick', 0.2)) {
      const k = clamp(4 - Math.round(num(data.left, 2) * 2), 0, 3);
      note(step(5 + k), 0, 0.07, 0.06, pan, 'wood', 1); note(step(12 + k), 0.03, 0.09, 0.03, pan, 'marimba', 1);
    }
  }
  // Trick shots, each with its own small flourish.
  function trick(kind, pan) {
    if (kind === 'slam') {
      pad([0, 2, 4], 0, 0.95, 0.034); note(hz(-12), 0, 0.55, 0.07, 0, 'marimba', 2);
      [7, 12, 16, 19].forEach((n, i) => note(hz(n), i * 0.065, 0.3, 0.09, pan * 0.5, 'bell', 2));
      note(hz(24), 0.29, 0.62, 0.11, pan * 0.5, 'bell', 2);
    } else if (kind === 'hat') [16, 19, 24].forEach((n, i) => note(hz(n), i * 0.08, 0.4, 0.085, pan * 0.5, 'bell', 2));
    else if (kind === 'close') { note(hz(21), 0, 0.42, 0.05, pan * 0.5, 'chime', 2); note(hz(28), 0.05, 0.48, 0.04, pan * 0.5, 'chime', 2); note(hz(26), 0.1, 0.3, 0.035, pan * 0.5, 'glass', 2); }
    else if (kind === 'tunnel') {
      note(step(4), 0, 0.6, 0.032, 0, 'pad', 2, { chord: [step(7), step(9)], swell: 0.26 });
      note(hz(19), 0.24, 0.45, 0.08, pan * 0.5, 'bell', 2);
    } else if (kind === 'rebound') { note(hz(-5), 0, 0.1, 0.075, pan, 'wood', 2); note(hz(16), 0.04, 0.38, 0.08, pan * 0.5, 'bell', 2); }
    else if (kind === 'bank') { note(hz(7), 0, 0.22, 0.08, pan, 'marimba', 2); note(hz(14), 0.07, 0.3, 0.08, pan, 'marimba', 2); }
    else { note(hz(12), 0, 0.3, 0.08, pan * 0.5, 'bell', 2); note(hz(19), 0.07, 0.42, 0.08, pan * 0.5, 'bell', 2); }
  }

  // ---------------------------------------------------------------------------------------------
  // The soundtrack. Every groove is four bars (sixteen beats) of loops, rendered once in code by an
  // OfflineAudioContext on the audio thread (its graph laid out a couple of milliseconds at a time between frames),
  // mono at 24 kHz, and kept in a 12 MB least-recently-used cache. The bed renders first, then the layers in use.
  // Layers all start from one origin, so they stay phase-locked however late each one arrives; the live mix
  // only moves gains (on the next beat) and two filters. Without OfflineAudioContext the music is silently off.
  const MUSIC_RATE = 24000, MUSIC_BUS = 0.2, MUSIC_CACHE = 12 * 1024 * 1024, MUSIC_TAIL = 2, BEATS = 16;
  const DUCK = Math.pow(10, -4 / 20), MENU_LEVEL = Math.pow(10, -6 / 20), PAUSE_LEVEL = 0.4, PAUSE_CUTOFF = 900, OPEN_CUTOFF = 4200;
  const LAYERS = ['bed', 'pulse', 'kit', 'lead', 'fever', 'danger', 'bossPulse', 'bossKit'];
  // Live level and stereo place for each layer once it is on.
  const MIX = { bed: 0.85, pulse: 0.8, kit: 0.75, lead: 0.72, fever: 0.6, danger: 0.8, bossPulse: 0.85, bossKit: 0.78 };
  const PLACE = { bed: 0, pulse: -0.2, kit: 0.08, lead: 0.18, fever: -0.14, danger: 0, bossPulse: -0.16, bossKit: 0.08 };
  // Heat and threat rise at once and fall away slowly, so layers leave one by one after a chain instead of all at once.
  const HEAT_FALL = 0.35, THREAT_FALL = 0.5;
  // A layer that is no longer wanted stays two more beats, so a chain that flickers around a threshold never makes
  // the band stutter in and out. Fever (Super Bloom) and the boss swap change at once.
  const RELEASE_BEATS = 2;
  // Kit lanes per style, sixteen steps a bar: K a felt kick, S a brush swish, h a brush tap, W a wood knock.
  const KITS = {
    lilt: { K: 'x.......x.......', S: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', W: '..............x.', wood: 9 },
    skip: { K: 'x.....x...x.....', S: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', W: '...x.......x....', wood: 9 },
    bounce: { K: 'x..x....x.x.....', S: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', W: '......x.......x.', wood: 8 },
    glint: { K: 'x.......x..x....', S: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', W: '..x.......x.....', wood: 11 },
    drive: { K: 'x...x...x...x...', S: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', W: '..x...x...x...x.', wood: 7 },
    boss: { K: 'x...x...x...x.x.', S: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', W: '..x...x...x...x.', wood: 5, fill: true }
  };
  // Pulse styles. Marimba: one chord-tone index per slot (null rests), `per` slots a beat.
  // Bass: [beat, tone (0 root, 1 third, 2 fifth, 3 octave), beats long, velocity] per bar.
  const PULSES = {
    lilt: { per: 2, slots: [0, 2, 1, 2, 3, 2, 1, 2] },
    skip: { per: 2, slots: [0, 2, 3, 2, 1, 2, 3, 4] },
    bounce: { per: 2, slots: [0, null, 2, 3, null, 2, 1, null] },
    glint: { per: 4, slots: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1] },
    ripple: { per: 4, slots: [0, 2, 4, null, 3, 2, null, 1, 0, 2, 4, null, 3, 4, 2, null] },
    walk: { bass: [[0, 0, 0.9, 1], [1, 2, 0.45, 0.7], [1.5, 0, 0.45, 0.6], [2, 3, 0.9, 0.9], [3, 2, 0.45, 0.7], [3.5, 1, 0.45, 0.6]] },
    float: { bass: [[0, 0, 1.4, 1], [1.5, 2, 0.9, 0.7], [2.5, 3, 1.3, 0.8]] },
    stride: { bass: [[0, 0, 0.9, 1], [1.5, 2, 0.4, 0.7], [2, 3, 0.9, 0.8], [3, 2, 0.4, 0.7], [3.5, 1, 0.4, 0.6]] },
    eights: { bass: [[0, 0, 0.4, 1], [0.5, 0, 0.3, 0.6], [1, 3, 0.4, 0.8], [1.5, 0, 0.3, 0.6], [2, 0, 0.4, 0.9], [2.5, 0, 0.3, 0.6], [3, 2, 0.4, 0.8], [3.5, 3, 0.3, 0.7]] },
    march: { bass: [[0, 0, 0.35, 1], [0.5, 0, 0.3, 0.7], [1, 0, 0.35, 0.9], [1.5, 3, 0.3, 0.8], [2, 0, 0.35, 1], [2.5, 0, 0.3, 0.7], [3, 2, 0.35, 0.9], [3.5, 1, 0.3, 0.8]] }
  };
  // Danger toms over each bar, on the chord's relative minor: [beat, tone (0 root, 2 fifth, 3 octave), velocity].
  const TOMS = [[0, 0, 1], [0.75, 0, 0.5], [1.5, 2, 0.7], [2, 0, 0.85], [3, 3, 0.75], [3.5, 2, 0.6]];
  // Melodies: [beat, scale step (0 = C4), beats long, velocity]. Each sits on its groove's chords.
  const TUNES = {
    home: [[0, 9, 1.5, 1], [1.5, 8, 0.5, 0.7], [2, 7, 1, 0.85], [3, 4, 1, 0.75], [4, 5, 1.5, 0.95], [5.5, 7, 0.5, 0.7], [6, 9, 2, 0.85],
      [8, 10, 1, 0.95], [9, 9, 0.5, 0.75], [9.5, 7, 0.5, 0.7], [10, 5, 2, 0.85], [12, 6, 1, 0.9], [13, 8, 1, 0.8], [14, 4, 1.5, 0.85]],
    meadow: [[0, 4, 0.5, 0.8], [0.5, 7, 0.5, 0.8], [1, 9, 1, 1], [2, 8, 0.5, 0.75], [2.5, 7, 0.5, 0.75], [3, 8, 1, 0.85], [4, 8, 1, 0.95], [5, 6, 0.5, 0.7],
      [5.5, 4, 0.5, 0.7], [6, 8, 1.5, 0.85], [8, 7, 0.5, 0.8], [8.5, 9, 0.5, 0.8], [9, 12, 1, 1], [10, 11, 0.5, 0.75], [10.5, 9, 0.5, 0.75], [11, 7, 1, 0.85],
      [12, 5, 1, 0.9], [13, 7, 0.5, 0.75], [13.5, 10, 0.5, 0.8], [14, 9, 1.5, 0.9], [15.5, 8, 0.5, 0.7]],
    roots: [[0, 2, 1, 0.9], [1, 5, 0.5, 0.75], [1.5, 6, 0.5, 0.7], [2, 7, 1.5, 0.9], [3.5, 6, 0.5, 0.7], [4, 5, 1.5, 0.95], [5.5, 4, 0.5, 0.7], [6, 3, 1, 0.8],
      [7, 5, 1, 0.8], [8, 4, 1, 0.9], [9, 7, 1, 0.85], [10, 9, 1.5, 0.95], [11.5, 8, 0.5, 0.7], [12, 8, 1, 0.9], [13, 6, 1, 0.8], [14, 4, 2, 0.85]],
    grotto: [[0, 5, 0.5, 0.85], [1, 7, 0.5, 0.75], [1.5, 8, 0.5, 0.75], [2, 10, 1, 0.95], [3, 9, 0.5, 0.7], [3.5, 8, 0.5, 0.7], [4, 6, 1, 0.9], [5, 8, 0.5, 0.75],
      [6, 11, 1, 0.95], [7, 10, 0.5, 0.7], [7.5, 8, 0.5, 0.7], [8, 9, 1.5, 0.9], [9.5, 8, 0.5, 0.7], [10, 6, 1, 0.85], [11, 4, 1, 0.75],
      [12, 5, 0.5, 0.85], [12.5, 7, 0.5, 0.75], [13, 9, 1, 0.9], [14, 11, 0.5, 0.8], [14.5, 9, 0.5, 0.75], [15, 7, 1, 0.8]],
    fossil: [[0, 9, 2, 0.9], [2, 7, 1, 0.8], [3, 5, 1, 0.75], [4, 8, 1.5, 0.9], [5.5, 7, 0.5, 0.7], [6, 5, 2, 0.8], [8, 7, 1, 0.85], [9, 9, 1, 0.85],
      [10, 10, 1, 0.9], [11, 12, 1, 0.85], [12, 11, 1.5, 0.9], [13.5, 9, 0.5, 0.75], [14, 6, 2, 0.8]],
    crystal: [[0, 12, 0.5, 0.9], [0.5, 11, 0.5, 0.7], [1, 9, 0.5, 0.75], [1.5, 7, 0.5, 0.7], [2, 9, 1, 0.85], [3, 10, 0.5, 0.7], [3.5, 11, 0.5, 0.75],
      [4, 11, 1.5, 0.95], [5.5, 9, 0.5, 0.7], [6, 8, 1, 0.8], [7, 6, 1, 0.75], [8, 6, 0.5, 0.8], [8.5, 9, 0.5, 0.8], [9, 11, 1, 0.95], [10, 9, 0.5, 0.7],
      [10.5, 8, 0.5, 0.7], [11, 9, 1, 0.8], [12, 7, 1, 0.85], [13, 5, 0.5, 0.7], [13.5, 6, 0.5, 0.7], [14, 7, 0.5, 0.75], [14.5, 9, 0.5, 0.75], [15, 12, 1, 0.9]],
    geode: [[0, 11, 1, 0.9], [1, 6, 0.5, 0.7], [1.5, 8, 0.5, 0.75], [2, 9, 2, 0.9], [4, 12, 1, 0.95], [5, 7, 0.5, 0.7], [5.5, 10, 0.5, 0.75], [6, 9, 2, 0.85],
      [8, 8, 0.5, 0.8], [8.5, 11, 0.5, 0.8], [9, 13, 1, 0.95], [10, 12, 0.5, 0.75], [10.5, 11, 0.5, 0.75], [11, 8, 1, 0.8],
      [12, 9, 1.5, 0.9], [13.5, 7, 0.5, 0.7], [14, 5, 1, 0.8], [15, 6, 1, 0.75]],
    lake: [[0, 4, 0.5, 0.8], [0.5, 6, 0.5, 0.75], [1, 8, 0.5, 0.75], [1.5, 9, 1.5, 0.95], [3, 8, 1, 0.75], [4, 7, 0.5, 0.8], [4.5, 9, 0.5, 0.8], [5, 12, 1.5, 0.95],
      [6.5, 11, 0.5, 0.7], [7, 9, 1, 0.8], [8, 9, 0.5, 0.8], [8.5, 11, 0.5, 0.8], [9, 14, 1, 0.95], [10, 13, 0.5, 0.7], [10.5, 12, 0.5, 0.75], [11, 9, 1, 0.8],
      [12, 8, 1.5, 0.9], [13.5, 6, 0.5, 0.7], [14, 4, 1, 0.8], [15, 5, 0.5, 0.7], [15.5, 6, 0.5, 0.7]],
    ember: [[0, 5, 0.5, 0.85], [0.5, 7, 0.5, 0.75], [1, 9, 0.5, 0.8], [1.5, 12, 1, 1], [2.5, 11, 0.5, 0.75], [3, 9, 1, 0.85], [4, 8, 1, 0.9], [5, 11, 1, 0.95],
      [6, 10, 0.5, 0.75], [6.5, 9, 0.5, 0.75], [7, 8, 1, 0.8], [8, 7, 0.5, 0.85], [8.5, 10, 0.5, 0.8], [9, 12, 1.5, 1], [10.5, 11, 0.5, 0.75], [11, 10, 1, 0.85],
      [12, 8, 0.5, 0.85], [12.5, 9, 0.5, 0.8], [13, 11, 1, 0.95], [14, 6, 1, 0.8], [15, 8, 1, 0.8]],
    briar: [[0, 8, 0.5, 0.9], [1, 10, 0.5, 0.8], [1.5, 12, 0.5, 0.85], [2.5, 11, 0.5, 0.75], [3, 10, 0.5, 0.8], [3.5, 9, 0.5, 0.75], [4, 9, 1, 0.9], [5, 7, 0.5, 0.75],
      [5.5, 5, 0.5, 0.7], [6.5, 9, 0.5, 0.8], [7, 7, 1, 0.8], [8, 6, 0.5, 0.85], [8.5, 8, 0.5, 0.8], [9, 11, 1, 0.95], [10.5, 10, 0.5, 0.75], [11, 8, 1, 0.8],
      [12, 9, 0.5, 0.85], [12.5, 11, 0.5, 0.8], [13, 13, 1, 0.95], [14.5, 12, 0.5, 0.75], [15, 11, 1, 0.8]],
    core: [[0, 7, 0.5, 0.85], [0.5, 10, 0.5, 0.85], [1, 12, 1.5, 1], [2.5, 11, 0.5, 0.75], [3, 10, 1, 0.85], [4, 8, 0.5, 0.85], [4.5, 11, 0.5, 0.85], [5, 13, 1.5, 1],
      [6.5, 12, 0.5, 0.75], [7, 11, 1, 0.85], [8, 9, 0.5, 0.85], [8.5, 12, 0.5, 0.85], [9, 14, 1.5, 1], [10.5, 13, 0.5, 0.75], [11, 12, 1, 0.85],
      [12, 13, 1, 0.9], [13, 11, 1, 0.85], [14, 8, 1, 0.85], [15, 6, 1, 0.8]]
  };
  // The grooves. chords: one per bar, or two for a bar that changes halfway. Variants share their parent's feel.
  const SOURCE = {
    home: { bpm: 96, swing: 0.1, chords: [[0, 6], [5, 6], [3, 6], [4]], pulse: ['marimba', 'lilt'], kit: 'lilt', lead: 'bell' },
    meadow: { bpm: 104, swing: 0.06, chords: [[0], [4], [5, 6], [3, 6]], pulse: ['marimba', 'skip'], kit: 'skip', lead: 'bell' },
    roots: { from: 'meadow', bpm: 100, swing: 0.08, chords: [[5], [3], [0], [4]], pulse: ['bass', 'walk'], lead: 'harp' },
    grotto: { bpm: 98, swing: 0.12, chords: [[1, 6], [4], [2, 6], [5, 6]], pulse: ['marimba', 'bounce'], kit: 'bounce', lead: 'bell' },
    fossil: { from: 'grotto', bpm: 96, chords: [[5, 6], [1, 6], [3, 6], [2, 6]], pulse: ['bass', 'stride'], lead: 'harp' },
    crystal: { bpm: 108, swing: 0, chords: [[3, 6], [4, 5], [2, 6], [5, 6]], pulse: ['marimba', 'glint'], kit: 'glint', lead: 'bell' },
    geode: { from: 'crystal', bpm: 106, chords: [[2, 6], [3, 6], [4], [5]], pulse: ['marimba', 'ripple'] },
    lake: { bpm: 96, swing: 0.14, chords: [[0, 6], [3, 6], [5, 6], [4, 5]], pulse: ['bass', 'float'], kit: 'lilt', lead: 'harp' },
    ember: { bpm: 110, swing: 0.04, chords: [[5], [4], [3, 6], [4]], pulse: ['bass', 'eights'], kit: 'drive', lead: 'bell' },
    briar: { from: 'ember', bpm: 112, chords: [[1], [5], [4], [2, 6]], lead: 'harp' },
    core: { bpm: 112, swing: 0, chords: [[3], [4], [5], [[2], [4]]], pulse: ['bass', 'eights'], kit: 'drive', lead: 'bell' }
  };
  const GROOVES = {};
  for (const name of Object.keys(SOURCE)) {
    const own = SOURCE[name], spec = { ...(own.from ? SOURCE[own.from] : {}), ...own };
    // bars[b] = [{ at (beat), chord }]
    spec.bars = spec.chords.map((entry, bar) => Array.isArray(entry[0])
      ? entry.map((part, i) => ({ at: bar * 4 + i * (4 / entry.length), chord: chord(part) }))
      : [{ at: bar * 4, chord: chord(entry) }]);
    spec.tune = TUNES[name];
    GROOVES[name] = spec;
  }
  function chordAt(groove, beat) {
    const bar = groove.bars[Math.floor(clamp(beat, 0, BEATS - 1e-9) / 4)];
    let found = bar[0].chord;
    for (const part of bar) if (part.at <= beat + 1e-9) found = part.chord;
    return found;
  }
  // Chord tones from a root placed in the octave starting at `low`, rising: root, third, fifth (seventh), octave...
  function arpeggio(current, low, count) {
    const root = place(current.degree, low), shape = current.tones.map(n => n - current.degree).sort((a, b) => a - b), out = [];
    for (let k = 0; out.length < count; k++) out.push(root + 7 * Math.floor(k / shape.length) + shape[k % shape.length]);
    return out;
  }
  function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function hashName(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; }
  // The notes of one layer: { t (beats), s (scale step), d (beats), v, i (instrument) }.
  function score(name, layer) {
    const g = GROOVES[name], notes = [], random = seeded(hashName(name + layer));
    // Swing delays the off-beat eighths (and half as much the off sixteenths); a few laid-back milliseconds humanize.
    const swing = t => { const frac = t % 1; return t + (Math.abs(frac - 0.5) < 1e-6 ? g.swing : Math.abs(frac - 0.25) < 1e-6 || Math.abs(frac - 0.75) < 1e-6 ? g.swing / 2 : 0); };
    const add = (t, s, d, v, i, human = true) => notes.push({ t: swing(t) + (human ? random() * 0.012 : 0), s, d, v: v * (human ? 0.92 + random() * 0.08 : 1), i });
    if (layer === 'bed') {
      for (const bar of g.bars) bar.forEach((part, index) => {
        const length = (index + 1 < bar.length ? bar[index + 1].at : bar[0].at + 4) - part.at, c = part.chord;
        add(part.at, place(c.degree, -10), length, 1, 'root', false);
        const upper = c.tones.length > 3 ? c.tones.slice(1) : [c.tones[1], c.tones[2], c.degree + 7];
        for (const tone of upper) add(part.at, place(tone, 1), length, 1, 'pad', false);
      });
    } else if (layer === 'pulse' || layer === 'bossPulse') {
      const style = PULSES[layer === 'bossPulse' ? 'march' : g.pulse[1]], instrument = layer === 'bossPulse' ? 'bass' : g.pulse[0];
      for (let bar = 0; bar < 4; bar++) {
        if (style.bass) for (const [beat, tone, length, velocity] of style.bass) {
          const t = bar * 4 + beat, c = chordAt(g, t), root = place(c.degree, -12);
          add(t, root + [0, 2, 4, 7][tone], length, velocity, 'bass');
        } else style.slots.forEach((slot, index) => {
          if (slot === null) return;
          const t = bar * 4 + index / style.per, c = chordAt(g, t), tones = arpeggio(c, -1, 6);
          const accent = index % style.per === 0 ? (index === 0 ? 1 : 0.85) : 0.62;
          add(t, tones[slot], 1 / style.per, accent, 'marimba');
        });
      }
    } else if (layer === 'kit' || layer === 'bossKit') {
      const style = KITS[layer === 'bossKit' ? 'boss' : g.kit];
      for (let bar = 0; bar < 4; bar++) for (let sixteenth = 0; sixteenth < 16; sixteenth++) {
        const t = bar * 4 + sixteenth / 4, accent = sixteenth % 4 === 0 ? 1 : sixteenth % 2 === 0 ? 0.72 : 0.45;
        if (style.fill && bar === 3 && sixteenth >= 12) {
          const c = chordAt(g, t), minor = place(MINOR_OF[c.degree % 7], -10);
          add(t, minor + [7, 4, 2, 0][sixteenth - 12], 0.25, 0.9 - (sixteenth - 12) * 0.06, 'tom');
          continue;
        }
        if (style.K[sixteenth] === 'x') add(t, -10, 0.25, accent, 'kick');
        if (style.S[sixteenth] === 'x') add(t, 0, 0.5, 1, 'swish');
        if (style.h[sixteenth] === 'x') add(t, 0, 0.25, accent, 'tap');
        if (style.W[sixteenth] === 'x') add(t, style.wood, 0.25, 0.85, 'wood');
      }
    } else if (layer === 'lead') {
      for (const [t, s, d, v] of g.tune) add(t, s, d, v, g.lead);
    } else if (layer === 'fever') {
      const order = [0, 1, 2, 3, 2, 1];
      for (let k = 0; k < BEATS * 4; k++) {
        const t = k / 4, c = chordAt(g, t), tones = arpeggio(c, 5, 4);
        add(t, tones[order[k % order.length]], 0.25, (k % 4 === 0 ? 1 : 0.6) * (0.75 + 0.25 * ((k % 16) / 16)), 'glass');
      }
    } else if (layer === 'danger') {
      for (let bar = 0; bar < 4; bar++) {
        const c = chordAt(g, bar * 4), minor = place(MINOR_OF[c.degree % 7], -10);
        for (const [beat, tone, velocity] of TOMS) add(bar * 4 + beat, minor + [0, 2, 4, 7][tone], 0.5, velocity, 'tom');
        add(bar * 4, minor, 4, 1, 'drone', false); add(bar * 4, minor + 4, 4, 0.8, 'drone', false);
      }
    }
    return notes;
  }
  // Instrument levels inside a rendered loop, before the live mix.
  const VOICE_LEVEL = { root: 0.105, pad: 0.034, marimba: 0.33, bass: 0.24, bell: 0.27, harp: 0.26, glass: 0.135, wood: 0.13, kick: 0.32, tom: 0.26, tap: 0.065, swish: 0.09, drone: 0.035 };
  // Lays out one layer's notes in an offline context as a list of small jobs, so the graph can be built a slice at a
  // time between frames instead of in one long task. Every pitched note is an envelope fed directly by its
  // fundamental (and, for some instruments, overtones through their own decaying gains).
  function compose(ox, name, layer, beat) {
    const out = ox.createGain(); out.gain.value = 1;
    // The bed and the low layers are warmed by a gentle lowpass; the rest go straight out.
    const warmth = { bed: 1500, pulse: GROOVES[name].pulse[0] === 'bass' ? 1100 : 0, bossPulse: 1100, danger: 1000 }[layer];
    if (warmth) { const filter = ox.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = warmth; filter.Q.value = 0.5; out.connect(filter); filter.connect(ox.destination); }
    else out.connect(ox.destination);
    const waves = periodicWaves(ox), lanes = {}, jobs = [];
    for (const n of score(name, layer)) {
      const t = n.t * beat, d = n.d * beat, v = n.v * VOICE_LEVEL[n.i], f = step(n.s);
      if (n.i === 'tap' || n.i === 'swish') { (lanes[n.i] = lanes[n.i] || []).push({ t, v }); continue; }
      jobs.push(() => INSTRUMENTS[n.i](ox, out, waves, t, f, d, v));
    }
    for (const kind of Object.keys(lanes)) jobs.push(() => brushes(ox, out, kind, lanes[kind], BEATS * beat + MUSIC_TAIL));
    return jobs;
  }
  // Graph building runs in slices of about two milliseconds, each in its own task, so a level start never drops
  // a frame while its loops are laid out. Without timers (or if they throw) it simply runs straight through.
  const SLICE_MS = 2;
  const clock = () => root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now();
  function later(fn) {
    if (typeof root.setTimeout !== 'function') return false;
    try { root.setTimeout(fn, 0); return true; } catch (_) { return false; }
  }
  let waveCache = null;
  function periodicWaves(ox) {
    if (waveCache && waveCache.owner === ox) return waveCache;
    const wave = harmonics => { const imag = new Float32Array(harmonics), real = new Float32Array(harmonics.length); return ox.createPeriodicWave(real, imag); };
    waveCache = { owner: ox, pad: wave([0, 1, 0.45, 0.24, 0.13, 0.07, 0.04, 0.02]), bass: wave([0, 1, 0.55, 0.28, 0.12, 0.05]), bright: wave([0, 0, 0.6, 0.34, 0.2, 0.11, 0.06]) };
    return waveCache;
  }
  // An envelope that starts from silence at t; returns the gain node.
  function envelope(ox, out, t) { const gain = ox.createGain(); gain.gain.setValueAtTime(0, t); gain.connect(out); return gain; }
  function tone(ox, into, t, end, f, options = {}) {
    const oscillator = ox.createOscillator();
    if (options.wave) oscillator.setPeriodicWave(options.wave); else oscillator.type = 'sine';
    if (options.detune) oscillator.detune.value = options.detune;
    oscillator.frequency.setValueAtTime(f * (options.from || 1), t);
    if (options.from) oscillator.frequency.exponentialRampToValueAtTime(f, t + options.glide);
    oscillator.connect(into); oscillator.start(t); oscillator.stop(end);
    return oscillator;
  }
  // An overtone through its own gain that dies away faster than the note.
  function overtone(ox, into, t, end, f, level, decay, options) {
    const gain = ox.createGain(); gain.gain.setValueAtTime(level, t); gain.gain.exponentialRampToValueAtTime(level * 0.001, t + decay); gain.connect(into);
    tone(ox, gain, t, Math.min(end, t + decay + 0.02), f, options);
  }
  const INSTRUMENTS = {
    pad(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, rise = Math.min(0.55, d * 0.3), end = t + d + 1.1;
      g.linearRampToValueAtTime(v * 0.82, t + rise); g.linearRampToValueAtTime(v, t + d * 0.6); g.linearRampToValueAtTime(v * 0.86, t + d);
      g.exponentialRampToValueAtTime(v * 0.002, end - 0.05); g.linearRampToValueAtTime(0, end);
      for (const cents of [-7, 7]) tone(ox, e, t, end, f, { wave: waves.pad, detune: cents });
    },
    root(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, end = t + d + 0.9;
      g.linearRampToValueAtTime(v, t + 0.12); g.linearRampToValueAtTime(v * 0.7, t + d); g.exponentialRampToValueAtTime(v * 0.002, end - 0.05); g.linearRampToValueAtTime(0, end);
      tone(ox, e, t, end, f, { wave: waves.bass });
    },
    drone(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, end = t + d + 0.6;
      g.linearRampToValueAtTime(v, t + d * 0.45); g.linearRampToValueAtTime(v * 0.6, t + d); g.linearRampToValueAtTime(0, end);
      for (const cents of [-5, 5]) tone(ox, e, t, end, f, { wave: waves.pad, detune: cents });
    },
    marimba(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, ring = clamp(0.75 - f / 2400, 0.3, 0.6), end = t + ring + 0.02;
      g.linearRampToValueAtTime(v, t + 0.003); g.exponentialRampToValueAtTime(v * 0.35, t + 0.05); g.exponentialRampToValueAtTime(v * 0.001, t + ring); g.linearRampToValueAtTime(0, end);
      tone(ox, e, t, end, f, { from: 1.006, glide: 0.03 });
      if (f * 3.98 < 3600) overtone(ox, e, t, end, f * 3.98, 0.24, 0.06);
    },
    bass(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, end = t + Math.max(d, 0.2) + 0.25;
      g.linearRampToValueAtTime(v, t + 0.006); g.exponentialRampToValueAtTime(v * 0.5, t + 0.12); g.exponentialRampToValueAtTime(v * 0.2, t + Math.max(d, 0.2)); g.exponentialRampToValueAtTime(v * 0.001, end - 0.01); g.linearRampToValueAtTime(0, end);
      tone(ox, e, t, end, f, { wave: waves.bass });
    },
    bell(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, ring = clamp(0.5 + d * 0.35, 0.6, 1.4), end = t + ring + 0.02;
      g.linearRampToValueAtTime(v, t + 0.005); g.exponentialRampToValueAtTime(v * 0.5, t + 0.07); g.exponentialRampToValueAtTime(v * 0.001, t + ring); g.linearRampToValueAtTime(0, end);
      tone(ox, e, t, end, f);
      overtone(ox, e, t, end, f * 2, 0.24, 0.3);
      if (f * 4.07 < 3600) overtone(ox, e, t, end, f * 4.07, 0.07, 0.05);
    },
    harp(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, ring = clamp(0.8 + d * 0.4, 0.9, 1.8), end = t + ring + 0.02;
      g.linearRampToValueAtTime(v, t + 0.004); g.exponentialRampToValueAtTime(v * 0.6, t + 0.08); g.exponentialRampToValueAtTime(v * 0.001, t + ring); g.linearRampToValueAtTime(0, end);
      tone(ox, e, t, end, f);
      overtone(ox, e, t, end, f, 0.7, 0.32, { wave: waves.bright });
    },
    glass(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, end = t + 0.36;
      g.linearRampToValueAtTime(v, t + 0.004); g.exponentialRampToValueAtTime(v * 0.001, t + 0.34); g.linearRampToValueAtTime(0, end);
      tone(ox, e, t, end, f);
      overtone(ox, e, t, end, f * 1.0045, 0.4, 0.34);
    },
    wood(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, end = t + 0.14;
      g.linearRampToValueAtTime(v, t + 0.002); g.exponentialRampToValueAtTime(v * 0.001, t + 0.13); g.linearRampToValueAtTime(0, end);
      tone(ox, e, t, end, f, { from: 1.045, glide: 0.022 });
      overtone(ox, e, t, end, f * 2.76, 0.36, 0.045);
    },
    kick(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, end = t + 0.3;
      g.linearRampToValueAtTime(v, t + 0.002); g.exponentialRampToValueAtTime(v * 0.001, t + 0.28); g.linearRampToValueAtTime(0, end);
      tone(ox, e, t, end, f, { from: 2.2, glide: 0.05 });
      overtone(ox, e, t, end, f * 2.76, 0.18, 0.025);
    },
    tom(ox, out, waves, t, f, d, v) {
      const e = envelope(ox, out, t), g = e.gain, end = t + 0.5;
      g.linearRampToValueAtTime(v, t + 0.003); g.exponentialRampToValueAtTime(v * 0.001, t + 0.48); g.linearRampToValueAtTime(0, end);
      tone(ox, e, t, end, f, { from: 1.45, glide: 0.09 });
      overtone(ox, e, t, end, f * 1.5, 0.3, 0.12, { from: 1.3, glide: 0.08 });
    }
  };
  // Brushes: one looping noise source per lane, filtered to a soft hiss, struck by its gain.
  // Taps are short and high; swishes are longer and broader. Hits in one lane never overlap.
  let musicNoise = null;
  function brushes(ox, out, kind, hits, total) {
    if (!musicNoise || musicNoise.sampleRate !== ox.sampleRate) {
      const rate = ox.sampleRate, size = Math.floor(rate);
      musicNoise = ox.createBuffer(1, size, rate);
      const data = musicNoise.getChannelData(0); let seed = 0x1b873593;
      for (let i = 0; i < size; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
    }
    const source = ox.createBufferSource(), low = ox.createBiquadFilter(), high = ox.createBiquadFilter(), gain = ox.createGain();
    source.buffer = musicNoise; source.loop = true;
    high.type = 'highpass'; high.frequency.value = kind === 'tap' ? 2600 : 1300; high.Q.value = 0.6;
    low.type = 'lowpass'; low.frequency.value = 3600; low.Q.value = 0.5;
    source.connect(high); high.connect(low); low.connect(gain); gain.connect(out);
    const g = gain.gain, attack = kind === 'tap' ? 0.003 : 0.025, decay = kind === 'tap' ? 0.07 : 0.2;
    g.setValueAtTime(0, 0);
    hits.sort((a, b) => a.t - b.t).forEach((hit, index) => {
      const next = index + 1 < hits.length ? hits[index + 1].t : Infinity, fall = Math.min(decay, next - hit.t - attack - 0.012);
      if (fall <= 0.01) return;
      g.setValueAtTime(0, hit.t); g.linearRampToValueAtTime(hit.v, hit.t + attack);
      g.exponentialRampToValueAtTime(hit.v * 0.01, hit.t + attack + fall); g.linearRampToValueAtTime(0, hit.t + attack + fall + 0.008);
    });
    source.start(0); source.stop(total);
  }
  // Renders one layer: sixteen beats plus a tail, with the tail folded back onto the start so notes that ring
  // across the loop point carry on seamlessly. Resolves to an AudioBuffer exactly one loop long.
  function render(name, layer) {
    const Offline = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!Offline || !context) return Promise.resolve(null);
    const beat = 60 / GROOVES[name].bpm;
    let ox = null, rate = 0;
    for (const candidate of [MUSIC_RATE, 22050, 44100]) {
      try { ox = new Offline(1, Math.ceil((BEATS * beat + MUSIC_TAIL) * candidate), candidate); rate = candidate; break; } catch (_) { ox = null; }
    }
    if (!ox) return Promise.resolve(null);
    const length = Math.round(BEATS * beat * rate), owner = context;
    let jobs;
    try { jobs = compose(ox, name, layer, beat); } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      let settled = false, next = 0;
      const done = buffer => { if (!settled) { settled = true; resolve(buffer); } };
      const build = () => {
        if (context !== owner) { done(null); return; }
        const deadline = clock() + SLICE_MS;
        try {
          while (next < jobs.length) {
            jobs[next++]();
            if (next < jobs.length && clock() >= deadline && later(build)) return;
          }
          ox.oncomplete = event => done(event && event.renderedBuffer);
          const result = ox.startRendering();
          if (result && typeof result.then === 'function') result.then(done, reject);
        } catch (error) { reject(error); }
      };
      build();
    }).then(rendered => {
      if (!rendered || context !== owner) return null;
      const data = rendered.getChannelData(0);
      for (let i = length; i < data.length; i++) data[i - length] += data[i];
      const buffer = context.createBuffer(1, length, rendered.sampleRate);
      if (typeof buffer.copyToChannel === 'function') buffer.copyToChannel(data.subarray(0, length), 0);
      else buffer.getChannelData(0).set(data.subarray(0, length));
      return buffer;
    });
  }

  // Automation lanes: every scheduled point is remembered, so a new change always starts from the exact value
  // the parameter has at that moment (no jumps), with or without cancelAndHoldAtTime.
  function lane(parameter, value) { parameter.value = value; return { parameter, points: [[0, value, false]] }; }
  function laneValue(track, time) {
    const points = track.points; let previous = points[0];
    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      if (time < point[0]) {
        const span = point[0] - previous[0];
        if (span <= 0) return point[1];
        const k = (time - previous[0]) / span;
        return point[2] && previous[1] > 0 && point[1] > 0 ? previous[1] * Math.pow(point[1] / previous[1], k) : previous[1] + (point[1] - previous[1]) * k;
      }
      previous = point;
    }
    return previous[1];
  }
  function laneHold(track, time) {
    const value = laneValue(track, time), parameter = track.parameter;
    parameter.cancelScheduledValues(time); parameter.setValueAtTime(value, time);
    track.points = [[time, value, false]];
    return value;
  }
  function laneSet(track, time, value) { track.parameter.setValueAtTime(value, time); track.points.push([time, track.points[track.points.length - 1][1], false], [time, value, false]); }
  function laneRamp(track, time, value, exponential = false) {
    if (exponential) track.parameter.exponentialRampToValueAtTime(value, time); else track.parameter.linearRampToValueAtTime(value, time);
    track.points.push([time, value, exponential]);
  }

  // broken: the engine threw once (see giveUp); the music then stays off for the session.
  let musicOn = true, asleep = false, broken = false, mixer = null, band = null, warm = { heat: 0, threat: 0, at: 0 };
  const leaving = new Set(), cache = new Map(), queue = [], failed = new Set();
  let cacheBytes = 0, renderingKey = null;
  function resetMusic() {
    mixer = null; band = null; leaving.clear(); queue.length = 0; renderingKey = null; asleep = false;
    warm = { heat: 0, threat: 0, at: 0 };
  }
  // The music's own chain: level (menus, pause) -> lowpass (pause, muffle) -> bus (gain .2, ducks) -> master.
  function ensureMixer() {
    if (mixer) return mixer;
    const level = context.createGain(), filter = context.createBiquadFilter(), bus = context.createGain();
    filter.type = 'lowpass'; filter.Q.value = 0.6;
    mixer = { level: lane(level.gain, 1), filter: lane(filter.frequency, OPEN_CUTOFF), bus: lane(bus.gain, MUSIC_BUS), input: level, out: bus,
      sent: false, levelTarget: 1, base: OPEN_CUTOFF, muffle: { until: 0, low: OPEN_CUTOFF } };
    level.connect(filter); filter.connect(bus); bus.connect(master);
    return mixer;
  }
  const keyOf = (name, layer) => name + ':' + layer;
  function touch(key) { const entry = cache.get(key); if (entry) { cache.delete(key); cache.set(key, entry); } return entry; }
  // Only the playing groove's loops are protected; a groove fading out keeps its buffers through its sources
  // for those last moments, so the cache can already let them go.
  function inUse(key) {
    return Boolean(band) && key.startsWith(band.name + ':') && Boolean(band.layers[key.slice(band.name.length + 1)]);
  }
  function store(key, buffer) {
    const old = cache.get(key); if (old) { cacheBytes -= old.bytes; cache.delete(key); }
    const bytes = buffer.length * (buffer.numberOfChannels || 1) * 4;
    cache.set(key, { buffer, bytes }); cacheBytes += bytes;
    evict(key);
  }
  // Drops the least recently used loops until the cache fits, never one that is playing (or the one just made).
  function evict(keep) {
    for (const [other, entry] of cache) {
      if (cacheBytes <= MUSIC_CACHE) break;
      if (other === keep || inUse(other)) continue;
      cache.delete(other); cacheBytes -= entry.bytes;
    }
  }
  // Renders run one at a time, most wanted first: the bed, then the layers that are on, then the rest.
  function want(name, layer, priority) {
    const key = keyOf(name, layer);
    if (cache.has(key) || failed.has(key) || renderingKey === key) return;
    const queued = queue.find(job => job.key === key);
    if (queued) { queued.priority = Math.min(queued.priority, priority); }
    else queue.push({ key, name, layer, priority, order: queue.length });
    queue.sort((a, b) => a.priority - b.priority || a.order - b.order);
    pump();
  }
  // Each render starts in a task of its own (making an offline context costs a millisecond or two), never inside
  // the frame that asked for it.
  function pump() {
    if (renderingKey || !queue.length || !context) return;
    const job = queue.shift(), owner = context;
    renderingKey = job.key;
    const run = () => {
      if (context !== owner) return;
      let promise;
      try { promise = render(job.name, job.layer); } catch (_) { promise = Promise.resolve(null); }
      Promise.resolve(promise).then(buffer => {
        if (context !== owner) return;
        renderingKey = null;
        if (buffer) {
          store(job.key, buffer);
          if (band && band.name === job.name) { try { attachReady(band); } catch (_) { giveUp(); return; } }
        }
        else failed.add(job.key);
        pump();
      }, () => { if (context !== owner) return; renderingKey = null; failed.add(job.key); pump(); });
    };
    if (!later(run)) run();
  }
  function nextBeat(playing, time) {
    if (playing.origin === null) return time;
    return playing.origin + Math.ceil((time - playing.origin) / playing.beat - 1e-6) * playing.beat;
  }
  // Starts each rendered layer of the playing groove, phase-locked to the groove's origin. The bed comes first.
  function attachReady(playing) {
    if (!context || context.state !== 'running' || !mixer) return;
    for (const layer of LAYERS) {
      if (playing.layers[layer] || (playing.origin === null && layer !== 'bed')) continue;
      const entry = touch(keyOf(playing.name, layer));
      if (!entry) continue;
      const now = context.currentTime, buffer = entry.buffer;
      if (playing.origin === null) {
        playing.origin = now + 0.05; playing.span = buffer.duration; playing.beat = buffer.duration / BEATS;
        laneHold(playing.lane, now); laneSet(playing.lane, playing.origin, 0); laneRamp(playing.lane, playing.origin + 0.9, 1);
      }
      const when = layer === 'bed' && now < playing.origin ? playing.origin : nextBeat(playing, now + 0.03);
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.loop = true;
      const nodes = [source, gain];
      source.connect(gain);
      if (typeof context.createStereoPanner === 'function' && PLACE[layer]) {
        const panner = context.createStereoPanner(); panner.pan.value = PLACE[layer]; gain.connect(panner); panner.connect(playing.gain); nodes.push(panner);
      } else gain.connect(playing.gain);
      const track = lane(gain.gain, 0);
      playing.layers[layer] = { source, gain, track, nodes, level: 0 };
      playing.live++;
      source.onended = () => {
        for (const node of nodes) { try { node.disconnect(); } catch (_) {} }
        if (--playing.live <= 0 && playing.gone) finish(playing);
      };
      source.start(when, ((when - playing.origin) % playing.span + playing.span) % playing.span);
      setLayer(playing, layer, playing.targets[layer] || 0, when);
    }
  }
  // A layer's level changes on the next beat, with a 120 ms ramp.
  function setLayer(playing, layer, value, at) {
    const live = playing.layers[layer];
    if (!live || live.level === value) return;
    const now = context.currentTime, when = Math.max(at || 0, nextBeat(playing, now + 0.02));
    laneHold(live.track, now); laneSet(live.track, when, laneValue(live.track, now)); laneRamp(live.track, when + 0.12, value);
    live.level = value;
  }
  function newBand(name) {
    const gain = context.createGain();
    gain.connect(mixer.input);
    return { name, origin: null, span: 0, beat: 60 / GROOVES[name].bpm, gain, lane: lane(gain.gain, 0), layers: {}, targets: {}, wanted: {}, live: 0, gone: false };
  }
  // Fades a groove out and lets its sources go; its last source to end disconnects the groove.
  function leave(playing, seconds) {
    if (!playing || !context || playing.gone) return;
    const now = context.currentTime, end = now + Math.max(0.02, seconds);
    playing.gone = true;
    laneHold(playing.lane, now); laneRamp(playing.lane, end, 0);
    leaving.add(playing);
    for (const layer of Object.values(playing.layers)) { try { layer.source.stop(end + 0.05); } catch (_) {} }
    if (!playing.live) finish(playing);
  }
  function finish(playing) { leaving.delete(playing); try { playing.gain.disconnect(); } catch (_) {} evict(); }
  // The engine threw (an odd browser): the music goes quiet for the session, so play and the cues never stall on it.
  // The playing groove fades out, or failing that is cut from the mix, so no loop is left running.
  function giveUp() {
    const playing = band;
    broken = true; queue.length = 0; band = null;
    try { leave(playing, 0.1); } catch (_) { try { playing.gain.disconnect(); } catch (__) {} }
  }
  function stopMusic(seconds = 0.4) {
    queue.length = 0;
    if (band) { leave(band, seconds); band = null; }
  }
  function layersFor(menus, heat, threat, superBloom, boss) {
    const on = { bed: true };
    if (menus) return on;
    // A boss wave swaps in its own pulse and kit; its driving pulse plays from the start of the showdown.
    if (boss) { on.bossPulse = true; on.bossKit = heat >= 0.45; } else { on.pulse = heat >= 0.2; on.kit = heat >= 0.45; }
    on.lead = heat >= 0.7 || superBloom;
    on.fever = superBloom;
    on.danger = threat >= 0.5;
    return on;
  }
  // The level and filter follow the screen: menus a little quieter, pause quieter and muffled.
  function setLevel(value) {
    if (mixer.levelTarget === value) return;
    const now = context.currentTime;
    laneHold(mixer.level, now); laneRamp(mixer.level, now + 0.3, value);
    mixer.levelTarget = value;
  }
  function planFilter(sweep = 0.08) {
    const now = context.currentTime, track = mixer.filter, base = mixer.base, muffle = mixer.muffle;
    laneHold(track, now);
    if (now < muffle.until) {
      const low = Math.min(base, muffle.low), back = Math.max(muffle.until, now + sweep);
      laneRamp(track, now + sweep, low, true); laneSet(track, back, low); laneRamp(track, back + 0.35, base, true);
    } else laneRamp(track, now + sweep, base, true);
  }
  function duck() {
    if (!mixer || !context) return;
    const now = context.currentTime, track = mixer.bus;
    laneHold(track, now); laneRamp(track, now + 0.03, MUSIC_BUS * DUCK); laneSet(track, now + 0.28, MUSIC_BUS * DUCK); laneRamp(track, now + 0.5, MUSIC_BUS);
  }
  function sleep(hidden) {
    if (!context || context.state === 'closed') return;
    if (hidden) {
      if (asleep) return;
      asleep = true;
      try { if (typeof context.suspend === 'function') Promise.resolve(context.suspend()).catch(() => {}); } catch (_) {}
    } else if (asleep) { asleep = false; wake(); }
  }
  // The chord the music is playing right now, or null when no music is sounding.
  function musicChord() {
    if (!band || band.origin === null || !musicOn || !enabled || !context) return null;
    const now = context.currentTime;
    if (now < band.origin) return null;
    return chordAt(GROOVES[band.name], ((now - band.origin) / band.beat) % BEATS);
  }
  function snapshot() {
    return { playing: Boolean(band && band.origin !== null), groove: band ? band.name : null, origin: band ? band.origin : null, beat: band ? band.beat : 0,
      layers: band ? { ...band.targets } : {}, level: mixer ? mixer.levelTarget : 0, heat: warm.heat, threat: warm.threat,
      cacheBytes, cached: cache.size, rendering: renderingKey, queued: queue.length };
  }
  // Called by the app about ten times a second (and at once when the screen changes). state: route ('game' or a
  // menu), groove, boss, heat, threat, paused, superBloom, result, over, hidden. Returns what the mix is doing.
  function musicFrame(state) {
    state = state && typeof state === 'object' ? state : {};
    if (typeof state.hidden === 'boolean') sleep(state.hidden);
    if (state.hidden || broken || !context || context.state === 'closed' || !(root.OfflineAudioContext || root.webkitOfflineAudioContext)) return snapshot();
    if (!musicOn || !enabled) { stopMusic(0.4); return snapshot(); }
    if (context.state !== 'running') return snapshot();
    ensureMixer();
    if (sends && !mixer.sent) { mixer.out.connect(sends.mid); mixer.sent = true; }
    const now = context.currentTime, dt = clamp(now - warm.at, 0, 0.5); warm.at = now;
    const menus = state.route !== 'game', ended = !menus && Boolean(state.result || state.over);
    const name = menus || !GROOVES[state.groove] ? 'home' : state.groove;
    warm.heat = Math.max(menus ? 0 : clamp(num(state.heat), 0, 2), warm.heat - dt * HEAT_FALL);
    warm.threat = Math.max(menus ? 0 : clamp(num(state.threat), 0, 2), warm.threat - dt * THREAT_FALL);
    if (ended) {
      // The result card plays its own music: the groove fades out over .6 s, and the next board starts fresh.
      if (band) { leave(band, 0.6); band = null; }
      queue.length = 0;
    } else {
      if (!band || band.name !== name) {
        if (band) leave(band, 0.6);
        band = newBand(name);
        for (let i = queue.length - 1; i >= 0; i--) if (queue[i].name !== name) queue.splice(i, 1);
      }
      const on = layersFor(menus, warm.heat, warm.threat, Boolean(state.superBloom), Boolean(state.boss));
      const swapped = state.boss ? ['pulse', 'kit'] : ['bossPulse', 'bossKit'];
      for (const layer of LAYERS) {
        if (on[layer]) band.wanted[layer] = now;
        else if (!menus && layer !== 'fever' && !swapped.includes(layer) && band.targets[layer] > 0 && now - band.wanted[layer] < RELEASE_BEATS * band.beat) on[layer] = true;
      }
      want(name, 'bed', 0);
      LAYERS.forEach((layer, index) => {
        if (on[layer]) want(name, layer, 1 + index);
        else if (!menus && !layer.startsWith('boss')) want(name, layer, 20 + index);
      });
      for (const layer of LAYERS) band.targets[layer] = on[layer] ? MIX[layer] : 0;
      attachReady(band);
      for (const layer of LAYERS) setLayer(band, layer, band.targets[layer]);
      for (const layer of Object.keys(band.layers)) touch(keyOf(name, layer));
    }
    setLevel(menus ? MENU_LEVEL : state.paused ? PAUSE_LEVEL : 1);
    const base = !menus && state.paused ? PAUSE_CUTOFF : OPEN_CUTOFF;
    if (mixer.base !== base) { mixer.base = base; planFilter(0.12); }
    return snapshot();
  }

  root.BloomSound = {
    wake,
    setEnabled(value) {
      const changed = enabled !== Boolean(value); enabled = Boolean(value);
      waiting = [];
      if (!enabled) { for (const voice of voices) release(voice); if (context && context.state !== 'closed') stopMusic(0.1); }
      if (master && context && context.state !== 'closed') fadeMaster(enabled ? LEVEL : 0);
      if (changed && enabled) wake();
    },
    // The soundtrack's own switch. Off fades it out and stops rendering; on lets the next frame bring it back.
    setMusic(on) {
      musicOn = Boolean(on);
      if (!musicOn && context && context.state !== 'closed') stopMusic(0.4);
    },
    // Sweeps the music's lowpass down (amount 0..1 of the way to 300 Hz) and back after `seconds`.
    muffle(amount, seconds) {
      if (!context || !mixer || context.state !== 'running') return;
      const depth = clamp(num(amount), 0, 1), hold = clamp(num(seconds), 0, 4);
      mixer.muffle = { until: context.currentTime + 0.08 + hold, low: OPEN_CUTOFF * (1 - depth) + 300 };
      try { planFilter(0.08); } catch (_) { /* The filter sweep is decoration. */ }
    },
    // The app calls frame every frame, before the board steps, so a music failure must never escape it.
    music: {
      frame(state) {
        try { return musicFrame(state); } catch (_) { giveUp(); return snapshot(); }
      },
      stop() { if (context && context.state !== 'closed') stopMusic(0.4); return snapshot(); }
    },
    play
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
