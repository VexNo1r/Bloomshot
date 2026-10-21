'use strict';
// The new pieces' sound cues, as [type, data] pairs test-sound.cjs plays and checks like every other cue (C major,
// soft, within about a second, 60 Hz to 3.6 kHz). Each foe lists every act it voices in its own block.
module.exports = [
  // Shared voices: a decoy's pop, a fade at the line or the wave's end, and a guard with no cue of its own.
  ['foe', { kind: 'nobody:pop', x: 120 }], ['foe', { kind: 'nobody:fizzle', x: 300 }], ['foe', { kind: 'nobody:guard', x: 200 }],

  // ── Rolypoly (Level 2, `rolypoly`) ──
  ['foe', { kind: 'rolypoly:curl', x: 150 }], ['foe', { kind: 'rolypoly:roll', x: 150 }], ['foe', { kind: 'rolypoly:bump', x: 30 }],
  ['foe', { kind: 'rolypoly:bowl', x: 200, k: 1 }], ['foe', { kind: 'rolypoly:bowl', x: 240, k: 4 }], ['foe', { kind: 'rolypoly:bowl', x: 240, k: 9 }],
  ['foe', { kind: 'rolypoly:end', x: 260 }], ['foe', { kind: 'rolypoly:land', x: 100 }],

  // ── Peekaboo Mole (Level 2, `mole`) ──
  ['foe', { kind: 'mole:rumble', x: 310, n: 1 }], ['foe', { kind: 'mole:rumble', x: 90, n: 2 }], ['foe', { kind: 'mole:pop', x: 276 }],
  ['foe', { kind: 'mole:duck', x: 344 }], ['foe', { kind: 'mole:bonk', x: 310 }], ['foe', { kind: 'molehill:guard', x: 250 }],

  // ── Fibcap (Level 3, `fibcap`) ──
  ['foe', { kind: 'fibcap:sneeze', x: 232 }], ['foe', { kind: 'fibcap:pop', x: 150 }], ['foe', { kind: 'fibcap:fizzle', x: 270 }],
  ['foe', { kind: 'fibcap:land', x: 300 }],

  // ── Drippy Inkcap (Level 3, `inkcap`) ──
  ['foe', { kind: 'inkcap:drip', x: 150 }], ['foe', { kind: 'inkcap:gulp', x: 300 }], ['foe', { kind: 'inkdrop:pop', x: 210 }],
  ['foe', { kind: 'inkdrop:fizzle', x: 90 }],

  // ── Chroma Crystal (Level 4, `chroma`) ──

  // ── Echo Bat (Level 4, `bat`) ──

  // ── Moon Jelly (Level 5, `jelly`) ──

  // ── Glowworm (Level 5, `glowworm`) ──

  // Guardians: every move's start has a voice (its own, or the guardian's instrument answering low), and a mood change
  // (Phase Bloom) has its own.
  ...['sunny', 'root', 'puff', 'crystal', 'lotus', 'fossil', 'ember', 'geode', 'briar', 'core'].map(kind => ['bossAbility', { kind, move: kind, act: 'start', x: 210 }]),
  ['bossStage', { kind: 'root', stage: 1, mood: 'Tangled', x: 210 }], ['bossStage', { kind: 'lotus', stage: 2, mood: 'Moonlit', x: 150 }],

  // ── Old Sunny (Level 1, `sunny`) ──
  ['bossAbility', { kind: 'sunny', move: 'yawn', act: 'start', x: 210 }], ['bossAbility', { kind: 'sunny', move: 'snooze', act: 'start', x: 240 }],
  ['bossAbility', { kind: 'sunny', move: 'yawn', act: 'spit', x: 146 }], ['bossAbility', { kind: 'sunny', move: 'yawn', act: 'shut', x: 274 }],
  ['bossAbility', { kind: 'sunny', move: 'snooze', act: 'zpop', x: 200 }], ['bossAbility', { kind: 'sunny', move: 'snooze', act: 'nap', x: 210 }],
  ['bossAbility', { kind: 'sunny', move: 'nap', act: 'start', x: 210 }], ['bossAbility', { kind: 'sunny', move: 'sprouts', act: 'start', x: 210 }],
  ['bossStage', { kind: 'sunny', stage: 1, mood: 'Cranky', x: 210 }], ['bossStage', { kind: 'sunny', stage: 2, mood: 'Wide awake', x: 230 }],

  // ── Rootknot (Level 2, `root`) ──

  // ── Mother Morel (Level 3, `puff`) ──

  // ── Crystal Heart (Level 4, `crystal`) ──
  ['bossAbility', { kind: 'crystal', move: 'heart', act: 'fake', x: 150 }], ['bossAbility', { kind: 'crystal', move: 'heart', act: 'reform', x: 270 }],
  ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'start', x: 210 }], ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'mirror', x: 210 }],
  ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'turn', x: 120, n: 1 }], ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'turn', x: 120, n: 2 }],
  ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'bank', x: 300 }], ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'shot', x: 210 }],
  ...['gold', 'coral', 'lilac', 'sky', 'poppy'].map(type => ['bossAbility', { kind: 'crystal', move: 'hues', act: 'start', x: 210, type }]),
  ['bossAbility', { kind: 'crystal', move: 'hues', act: 'start', x: 210, targets: [{ x: 210, y: 130, r: 30, role: 'hue', type: 'sky' }] }],
  ['bossAbility', { kind: 'crystal', move: 'hues', act: 'start', x: 210 }],

  // ── Lantern Lily (Level 5, `lotus`) ──

];
