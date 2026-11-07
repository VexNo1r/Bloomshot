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

  // ── Amberkeeper (Level 6, `amberkeeper`) ──
  ['foe', { kind: 'amberkeeper:tell', x: 210, n: 0 }], ['foe', { kind: 'amberkeeper:seal', x: 180, n: 2 }], ['foe', { kind: 'amberkeeper:flinch', x: 240 }],
  ['foe', { kind: 'amberkeeper:break', x: 150, freed: 0 }], ['foe', { kind: 'amberkeeper:break', x: 210, freed: 2 }], ['foe', { kind: 'amberkeeper:break', x: 270, freed: 9 }],
  ['foe', { kind: 'amberkeeper:break', x: 210 }], ['foe', { kind: 'amberkeeper:hatch', x: 210 }], ['foe', { kind: 'amber:clink', x: 120 }],
  ['foe', { kind: 'amber:crack', x: 300 }], ['foe', { kind: 'amber:shatter', x: 180 }], ['foe', { kind: 'amber:melt', x: 90 }], ['foe', { kind: 'amber:pop', x: 330 }],
  ['foe', { kind: 'amber:fizzle', x: 60 }],

  // ── Whizzbang (Level 7, `whizzbang`) ──
  ['foe', { kind: 'whizzbang:light', x: 140, fuse: 1 }], ['foe', { kind: 'whizzbang:light', x: 280, fuse: .5 }], ['foe', { kind: 'whizzbang:light', x: 210 }],
  ['foe', { kind: 'whizzbang:launch', x: 210, n: 4 }], ['foe', { kind: 'whizzbang:pin', x: 210, k: 1 }], ['foe', { kind: 'whizzbang:pin', x: 210, k: 9 }],
  ['foe', { kind: 'whizzbang:tunnel', x: 300 }], ['foe', { kind: 'whizzbang:bang', x: 210, n: 2 }], ['foe', { kind: 'whizzbang:bang', x: 60, n: 9 }],

  // ── Lodestone (Level 8, `lodestone`) ──
  ['foe', { kind: 'lodestone:pull', x: 112 }], ['foe', { kind: 'lodestone:guard', x: 300 }],
  ...[2, 1, 0].map(hp => ['foe', { kind: 'lodestone:moss', x: 150, hp, curl: hp === 0 }]), ['foe', { kind: 'lodestone:moss', x: 150 }],
  ['foe', { kind: 'lodestone:open', x: 210, curl: true, gems: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }] }], ['foe', { kind: 'lodestone:open', x: 60 }],

  // ── Sweetheart Roses (Level 9, `sweetheart`) ──
  ['foe', { kind: 'sweetheart:blush', x: 187 }], ['foe', { kind: 'sweetheart:pout', x: 233 }], ['foe', { kind: 'sweetheart:kiss', x: 210 }],
  ['foe', { kind: 'sweetheart:kiss', x: 210, cupid: true }],

  // ── Wishing Stars (Level 10, `wishstar`) ──
  ...[1, 2, 3, 4].map(pip => ['foe', { kind: 'wishstar:ring', x: 150 + 30 * pip, pip }]), ['foe', { kind: 'wishstar:ring', x: 210 }],
  ['foe', { kind: 'wishstar:wish', x: 230, n: 3 }], ['foe', { kind: 'wishstar:guard', x: 190 }],

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

  // ── Ammonite Queen (Level 6, `fossil`) ──
  ['bossAbility', { kind: 'fossil', move: 'pearls', act: 'start', x: 210 }], ['bossAbility', { kind: 'fossil', move: 'pearls', act: 'land', x: 160 }],
  ['bossAbility', { kind: 'fossil', move: 'pearls', act: 'catch', x: 260, bonus: 475 }], ['bossAbility', { kind: 'fossil', move: 'petrify', act: 'start', x: 210 }],
  ['bossAbility', { kind: 'fossil', move: 'petrify', act: 'clack', x: 96 }], // petrify:stone is silent: it lands on the start's tick
  ['bossAbility', { kind: 'fossil', move: 'petrify', act: 'bank', x: 210 }], ['bossAbility', { kind: 'fossil', move: 'petrify', act: 'thaw', x: 324, n: 3 }],
  ['bossAbility', { kind: 'fossil', move: 'hatch', act: 'start', x: 210 }],
  ['bossAbility', { kind: 'fossil', move: 'fossil', act: 'start', x: 292 }], ['bossCritical', { kind: 'fossil', damage: 3, via: 'fossil', x: 210 }],
  ['bossStage', { kind: 'fossil', stage: 1, mood: 'Stony', x: 210 }], ['bossStage', { kind: 'fossil', stage: 2, mood: 'Brooding', x: 210 }],

  // ── Ember Rose (Level 7, `ember`) ──
  ['bossAbility', { kind: 'ember', move: 'ember', act: 'start', x: 128 }], ['bossAbility', { kind: 'ember', move: 'rings', act: 'start', x: 200 }],
  ['bossAbility', { kind: 'ember', move: 'rings', act: 'land', x: 292 }], ...[1, 2, 3].map(n => ['bossAbility', { kind: 'ember', move: 'stomp', act: 'click', n, x: 210 }]),
  ['bossAbility', { kind: 'ember', move: 'stomp', act: 'click', x: 210 }], ['bossAbility', { kind: 'ember', move: 'stomp', act: 'start', x: 210 }],
  ['bossAbility', { kind: 'ember', move: 'barrage', act: 'start', x: 160 }], ['bossAbility', { kind: 'ember', move: 'cinder', act: 'catch', x: 90 }],
  ['bossAbility', { kind: 'ember', move: 'cinder', act: 'coal', x: 330 }], ['bossAbility', { kind: 'ember', move: 'cinder', act: 'coal', x: 50, out: true }],
  ['bossStage', { kind: 'ember', stage: 1, mood: 'Dancing', x: 210 }], ['bossStage', { kind: 'ember', stage: 2, mood: 'Blazing', x: 210 }],
  ['bossCritical', { kind: 'ember', via: 'ring', damage: 3, x: 292 }], ['bossCritical', { kind: 'ember', via: 'ole', damage: 2, x: 210 }],
  ['bossCritical', { kind: 'ember', via: 'whizz', damage: 3, x: 160 }],

  // ── Geode King (Level 8, `geode`) ──
  ['bossAbility', { kind: 'geode', move: 'pyrite', act: 'start', x: 210 }], ['bossAbility', { kind: 'geode', move: 'pyrite', act: 'land', x: 100, n: 3, fools: 1 }],
  ['bossAbility', { kind: 'geode', move: 'pyrite', act: 'land', x: 320, n: 4, fools: 2 }], ['bossAbility', { kind: 'geode', move: 'pyrite', act: 'land', x: 320 }],
  ['bossAbility', { kind: 'geode', move: 'pyrite', act: 'fool', x: 120 }], ['bossAbility', { kind: 'geode', move: 'pyrite', act: 'crumble', x: 300 }],
  ['bossAbility', { kind: 'geode', move: 'pyrite', act: 'fade', x: 80 }], ['bossAbility', { kind: 'geode', move: 'lob', act: 'start', x: 210 }],
  ['bossAbility', { kind: 'geode', move: 'lob', act: 'catch', x: 180 }], ['bossAbility', { kind: 'geode', move: 'lob', act: 'land', x: 150 }],
  ['bossAbility', { kind: 'geode', move: 'lob', act: 'knock', x: 270 }], ['bossAbility', { kind: 'geode', move: 'magnet', act: 'start', x: 210 }],
  ['bossAbility', { kind: 'geode', move: 'magnet', act: 'pull', x: 210, marks: [{}, {}, {}, {}, {}] }], ['bossAbility', { kind: 'geode', move: 'magnet', act: 'pull', x: 210 }],
  ['bossAbility', { kind: 'geode', move: 'magnet', act: 'shot', x: 230 }], ['bossAbility', { kind: 'geode', move: 'magnet', act: 'end', x: 210 }],
  ['bossAbility', { kind: 'geode', move: 'geode', act: 'start', x: 128 }],
  ['bossStage', { kind: 'geode', stage: 1, mood: 'Grumbly', x: 210 }], ['bossStage', { kind: 'geode', stage: 2, mood: 'Magnetic', x: 210 }],

  // ── Thornmother (Level 9, `briar`) ──
  ['bossAbility', { kind: 'briar', move: 'reel', act: 'start', x: 210 }], ['bossAbility', { kind: 'briar', move: 'reel', act: 'snip', x: 164 }],
  ['bossAbility', { kind: 'briar', move: 'reel', act: 'drink', x: 210 }], ['bossAbility', { kind: 'briar', move: 'reel', act: 'drop', x: 256 }],
  ['bossAbility', { kind: 'briar', move: 'reel', act: 'sprout', x: 210 }], ['bossAbility', { kind: 'briar', move: 'sweet', act: 'start', x: 100 }],
  ['bossAbility', { kind: 'briar', move: 'sweet', act: 'kiss', x: 210 }], ['bossAbility', { kind: 'briar', move: 'sweet', act: 'cut', x: 320 }],
  ['bossAbility', { kind: 'briar', move: 'lasso', act: 'start', x: 210 }], ['bossAbility', { kind: 'briar', move: 'lasso', act: 'untie', x: 180 }],
  ['bossAbility', { kind: 'briar', move: 'lasso', act: 'wrap', x: 147 }], ['bossAbility', { kind: 'briar', move: 'lasso', act: 'wither', x: 273 }],
  ['bossAbility', { kind: 'briar', move: 'briar', act: 'start', x: 100 }],
  ['bossStage', { kind: 'briar', stage: 1, mood: 'Smitten', x: 210 }], ['bossStage', { kind: 'briar', stage: 2, mood: 'Wild', x: 230 }],
  ['bossCritical', { kind: 'briar', via: 'heart', damage: 2, x: 210 }],

  // ── The Starseed (Level 10, `core`) ──
  ...['satellites', 'swirl', 'portal', 'waltz', 'glass', 'dome', 'pearl', 'rocket', 'gem', 'lasso', 'starfall', 'supernova'].map(move => ['bossAbility', { kind: 'core', move, act: 'start', x: 210 }]),
  ...['swirl', 'portal', 'waltz', 'glass', 'pearl', 'rocket', 'gem', 'lasso'].map(move => ['bossAbility', { kind: 'core', move, act: 'answer', x: 180 }]),
  ...['swirl', 'portal', 'waltz', 'glass', 'pearl', 'rocket', 'gem', 'lasso'].map(move => ['bossAbility', { kind: 'core', move, act: 'home', x: 260 }]),
  ...[1, 2, 3, 4, 5].map(n => ['bossAbility', { kind: 'core', move: 'dome', act: 'ring', x: 150 + 20 * n, n }]), ['bossAbility', { kind: 'core', move: 'dome', act: 'ring', x: 210 }],
  ['bossAbility', { kind: 'core', move: 'dome', act: 'shoot', x: 230 }], ['bossAbility', { kind: 'core', move: 'portal', act: 'spit', x: 100 }],
  ['bossAbility', { kind: 'core', move: 'pearl', act: 'spit', x: 320 }], ['bossAbility', { kind: 'core', move: 'rocket', act: 'burst', x: 260 }],
  ['bossAbility', { kind: 'core', move: 'gem', act: 'land', x: 120 }], ['bossAbility', { kind: 'core', move: 'lasso', act: 'arch', x: 150 }],
  ...[0, 1, 2].map(n => ['bossAbility', { kind: 'core', move: 'starfall', act: 'streak', x: 86 + 124 * n, n }]),
  ['bossAbility', { kind: 'core', move: 'starfall', act: 'catch', x: 200, n: 4 }], ['bossAbility', { kind: 'core', move: 'starfall', act: 'land', x: 300 }],
  ['bossStage', { kind: 'core', stage: 1, mood: 'Dazzling', x: 210 }], ['bossStage', { kind: 'core', stage: 2, mood: 'Radiant', x: 210 }],

];
