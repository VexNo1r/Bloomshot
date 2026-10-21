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
  ['foe', { kind: 'fibcap:sneeze', x: 232 }], ['foe', { kind: 'fibcap:gust', x: 232, n: 3 }], ['foe', { kind: 'fibcap:pop', x: 150 }], ['foe', { kind: 'fibcap:fizzle', x: 270 }],
  ['foe', { kind: 'fibcap:land', x: 300 }],

  // ── Drippy Inkcap (Level 3, `inkcap`) ──
  ['foe', { kind: 'inkcap:drip', x: 150 }], ['foe', { kind: 'inkcap:gulp', x: 300 }], ['foe', { kind: 'inkdrop:pop', x: 210 }],
  ['foe', { kind: 'inkdrop:fizzle', x: 90 }],

  // ── Chroma Crystal (Level 4, `chroma`) ──
  // Every color's guard and match (poppy's match climbs highest), from data.color, from the bud, and with neither.
  ...['gold', 'coral', 'lilac', 'sky', 'poppy'].flatMap((color, i) => [['foe', { kind: 'chroma:guard', x: 110 + 50 * i, color }], ['foe', { kind: 'chroma:match', x: 110 + 50 * i, color }]]),
  ['foe', { kind: 'chroma:match', x: 200, bud: { type: 'sky', x: 200, y: 250 } }], ['foe', { kind: 'chroma:guard', x: 200 }],

  // ── Echo Bat (Level 4, `bat`) ──
  ['foe', { kind: 'bat:ping', x: 110 }], ['foe', { kind: 'bat:swoop', x: 310 }], ['foe', { kind: 'bat:catch', x: 200 }], ['foe', { kind: 'bat:startle', x: 260 }],

  // ── Moon Jelly (Level 5, `jelly`) ──
  ['foe', { kind: 'jelly:spawn', x: 110 }], ['foe', { kind: 'jelly:guard', x: 310 }], ['foe', { kind: 'jelly:burst', x: 200 }],

  // ── Glowworm (Level 5, `glowworm`) ──
  ['foe', { kind: 'glowworm:ripple', x: 250, n: 4 }], ['foe', { kind: 'glowworm:ripple', x: 60, n: 9 }], ['foe', { kind: 'glowworm:ripple', x: 200 }],
  ['foe', { kind: 'glowworm:ripple', x: 200, n: 0 }], ['foe', { kind: 'glowworm:split', x: 140 }], ['foe', { kind: 'glowworm:spawn', x: 300 }],

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
  ['bossAbility', { kind: 'root', move: 'toss', act: 'toss', x: 210 }], ['bossAbility', { kind: 'root', move: 'toss2', act: 'toss', x: 128 }],
  ['bossAbility', { kind: 'root', move: 'carousel', act: 'start', x: 200 }], ['bossAbility', { kind: 'root', move: 'carousel', act: 'creak', x: 190, n: 1 }],
  ['bossAbility', { kind: 'root', move: 'carousel', act: 'creak', x: 190, n: 2 }], ['bossAbility', { kind: 'root', move: 'carousel', act: 'fling', x: 230 }],
  ['bossAbility', { kind: 'root', move: 'carousel', act: 'snap', x: 170 }], ['bossAbility', { kind: 'root', move: 'snare', act: 'start', x: 145 }],
  ['bossAbility', { kind: 'root', move: 'snare', act: 'wither', x: 275 }], ['bossAbility', { kind: 'root', move: 'toss', act: 'start', x: 292 }],

  // ── Mother Morel (Level 3, `puff`) ──
  ['bossAbility', { kind: 'puff', move: 'waltz', act: 'start', x: 268 }], ['bossAbility', { kind: 'puff', move: 'fakeout', act: 'start', x: 210 }],
  ['bossAbility', { kind: 'puff', move: 'fibwaltz', act: 'start', x: 150 }], ['bossAbility', { kind: 'puff', move: 'fakeout', act: 'land', x: 250 }],
  ['bossAbility', { kind: 'puff', move: 'fibwaltz', act: 'paint', x: 210 }], ['bossAbility', { kind: 'puff', move: 'ink', act: 'ink', x: 170 }],
  ['bossAbility', { kind: 'puff', move: 'ink', act: 'start', x: 210 }], ['bossAbility', { kind: 'puff', move: 'puff', act: 'start', x: 320 }],
  ['bossStage', { kind: 'puff', stage: 1, mood: 'Tricky', x: 210 }], ['bossStage', { kind: 'puff', stage: 2, mood: 'Stormy', x: 190 }],
  ['bossCritical', { kind: 'puff', via: 'waltz', damage: 2, x: 240 }],

  // ── Crystal Heart (Level 4, `crystal`) ──
  ['bossAbility', { kind: 'crystal', move: 'heart', act: 'fake', x: 150 }], ['bossAbility', { kind: 'crystal', move: 'heart', act: 'reform', x: 270 }],
  ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'start', x: 210 }], ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'mirror', x: 210 }],
  ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'turn', x: 120, n: 1 }], ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'turn', x: 120, n: 2 }],
  ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'bank', x: 300 }], ['bossAbility', { kind: 'crystal', move: 'mirrors', act: 'shot', x: 210 }],
  ...['gold', 'coral', 'lilac', 'sky', 'poppy'].map(type => ['bossAbility', { kind: 'crystal', move: 'hues', act: 'start', x: 210, type }]),
  ['bossAbility', { kind: 'crystal', move: 'hues', act: 'start', x: 210, targets: [{ x: 210, y: 130, r: 30, role: 'hue', type: 'sky' }] }],
  ['bossAbility', { kind: 'crystal', move: 'hues', act: 'start', x: 210 }],

  // ── Lantern Lily (Level 5, `lotus`) ──
  ['bossAbility', { kind: 'lotus', move: 'reflect', act: 'start', x: 210 }], ['bossAbility', { kind: 'lotus', move: 'reflect', act: 'shot', x: 160 }],
  ['bossAbility', { kind: 'lotus', move: 'reflect', act: 'wane', x: 260 }], ['bossAbility', { kind: 'lotus', move: 'jellies', act: 'start', x: 210 }],
  ['bossAbility', { kind: 'lotus', move: 'jellies', act: 'release', x: 110 }], ['bossAbility', { kind: 'lotus', move: 'jellies', act: 'shut', x: 310 }],
  ['bossAbility', { kind: 'lotus', move: 'worm', act: 'start', x: 300 }], ['bossAbility', { kind: 'lotus', move: 'worm', act: 'home', x: 240 }],
  ['bossAbility', { kind: 'lotus', move: 'worm', act: 'puffback', x: 120 }], ['bossAbility', { kind: 'lotus', move: 'tide', act: 'start', x: 210 }],
  ['bossAbility', { kind: 'lotus', move: 'tide', act: 'rise', x: 210 }], ['bossAbility', { kind: 'lotus', move: 'tide', act: 'recede', x: 210 }],
  ['bossAbility', { kind: 'lotus', move: 'lotus', act: 'start', x: 210 }], ['bossCritical', { kind: 'lotus', damage: 2, via: 'moon', x: 200 }],
  ['bossStage', { kind: 'lotus', stage: 1, mood: 'Glowing', x: 210 }],

];
