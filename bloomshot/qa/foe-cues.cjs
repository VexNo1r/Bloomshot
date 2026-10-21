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

  // ── Fibcap (Level 3, `fibcap`) ──

  // ── Drippy Inkcap (Level 3, `inkcap`) ──

  // ── Chroma Crystal (Level 4, `chroma`) ──

  // ── Echo Bat (Level 4, `bat`) ──

  // ── Moon Jelly (Level 5, `jelly`) ──

  // ── Glowworm (Level 5, `glowworm`) ──

  // Guardians: every move's start has a voice (its own, or the guardian's instrument answering low), and a mood change
  // (Phase Bloom) has its own.
  ...['sunny', 'root', 'puff', 'crystal', 'lotus', 'fossil', 'ember', 'geode', 'briar', 'core'].map(kind => ['bossAbility', { kind, move: kind, act: 'start', x: 210 }]),
  ['bossStage', { kind: 'root', stage: 1, mood: 'Tangled', x: 210 }], ['bossStage', { kind: 'lotus', stage: 2, mood: 'Moonlit', x: 150 }],

  // ── Old Sunny (Level 1, `sunny`) ──

  // ── Rootknot (Level 2, `root`) ──
  ['bossAbility', { kind: 'root', move: 'toss', act: 'toss', x: 210 }], ['bossAbility', { kind: 'root', move: 'toss2', act: 'toss', x: 128 }],
  ['bossAbility', { kind: 'root', move: 'carousel', act: 'start', x: 200 }], ['bossAbility', { kind: 'root', move: 'carousel', act: 'creak', x: 190, n: 1 }],
  ['bossAbility', { kind: 'root', move: 'carousel', act: 'creak', x: 190, n: 2 }], ['bossAbility', { kind: 'root', move: 'carousel', act: 'fling', x: 230 }],
  ['bossAbility', { kind: 'root', move: 'carousel', act: 'snap', x: 170 }], ['bossAbility', { kind: 'root', move: 'snare', act: 'start', x: 145 }],
  ['bossAbility', { kind: 'root', move: 'snare', act: 'wither', x: 275 }], ['bossAbility', { kind: 'root', move: 'toss', act: 'start', x: 292 }],

  // ── Mother Morel (Level 3, `puff`) ──

  // ── Crystal Heart (Level 4, `crystal`) ──

  // ── Lantern Lily (Level 5, `lotus`) ──

];
