(function (root, factory) {
  'use strict';
  var depths = factory();
  if (typeof module === 'object' && module.exports) module.exports = depths;
  else root.BloomDepths = depths;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The level campaign: ten levels of ten waves, heading underground one layer per level. Levels 1 to 4
  // are free. Every wave is authored: its layout, its pace and the one or two things that make it tricky.
  var TOTAL = 10, WAVES = 10, FREE = 4;
  var LEFT = 34, RIGHT = 386, PUFF_REACH = 74, LAUNCHER = { x: 210, y: 498 };
  // Levels 5 to 10 unlock together with one purchase; the store owns the price and the entitlement check.
  var PRODUCT = 'bloomshot.levels.full', ENTITLEMENT = 'levels_full';

  // Cluster centers for each layout, in board coordinates (420 x 560, danger line at 448). The top* layouts
  // are for drops: reinforcements that arrive at the top once there is room for them.
  var FORMATIONS = {
    square: [[116, 112], [304, 112], [116, 210], [304, 210]],
    wall: [[70, 128], [140, 128], [210, 128], [280, 128], [350, 128]],
    vee: [[70, 96], [140, 134], [210, 172], [280, 134], [350, 96]],
    arch: [[70, 190], [140, 146], [210, 110], [280, 146], [350, 190]],
    grid: [[90, 110], [210, 110], [330, 110], [90, 205], [210, 205], [330, 205]],
    diamond: [[210, 92], [118, 152], [302, 152], [210, 212]],
    stairs: [[70, 96], [140, 130], [210, 164], [280, 198], [350, 232]],
    zigzag: [[70, 104], [140, 172], [210, 104], [280, 172], [350, 104]],
    ring: [[210, 96], [310, 134], [310, 208], [210, 246], [110, 208], [110, 134]],
    columns: [[96, 100], [96, 192], [210, 132], [210, 224], [324, 100], [324, 192]],
    stacks: [[80, 140], [163, 140], [247, 140], [330, 140]],
    stacks5: [[66, 140], [138, 140], [210, 140], [282, 140], [354, 140]],
    top5: [[70, 66], [140, 66], [210, 66], [280, 66], [350, 66]],
    top4: [[92, 66], [171, 66], [249, 66], [328, 66]],
    top3: [[105, 66], [210, 66], [315, 66]],
    topsides: [[70, 66], [140, 66], [280, 66], [350, 66]],
    topvee: [[70, 62], [140, 80], [210, 98], [280, 80], [350, 62]],
    topstacks: [[80, 70], [163, 70], [247, 70], [330, 70]],
    trio: [[100, 120], [210, 150], [320, 120]],
    cross: [[210, 92], [104, 160], [316, 160], [210, 228]],
    corners: [[86, 100], [334, 100], [86, 220], [334, 220]]
  };
  // Three buds a cluster. The first is the crowned relay: a direct hit on it blooms the other two.
  var SHAPES = {
    tri: function (gi, wave) { return (wave + gi) % 3 === 0 ? [[0, 17], [-18, -13], [18, -13]] : [[0, -17], [-18, 13], [18, 13]]; },
    line: function () { return [[0, 0], [-23, 0], [23, 0]]; },
    // The crown sits on top, so a stack has to be cracked from the bottom or reached around.
    stack: function () { return [[0, -23], [0, 0], [0, 23]]; }
  };
  var TYPES = ['gold', 'coral', 'lilac', 'sky', 'poppy'];

  // pace scales every fall speed in a level; it was tuned with qa/depths-bot.cjs so a casual player clears
  // the first level almost every time and the fourth about one try in four.
  function lv(id, key, name, twist, pace, waves) {
    return { id: id, key: key, name: name, twist: twist, pace: pace, waves: waves };
  }
  // Wave fields: f layout, s cluster shape (or one per cluster), d fall speed (px/s), hp and hp3 (how many
  // buds in every six take two or three hits), sway (side-to-side px), fast (clusters that fall 1.6x faster),
  // cup (clusters whose two outer buds wear acorn cups), cupAll (all three cupped, crown too), puffs (puffcap
  // spots), rocks ([x, y, length, degrees, slide px, slide Hz]), petal ([x, y, degrees] of the leaf you turn),
  // boss ({ hp, r, type, sway, x, y, shell }), hint (shown when the wave starts), then (drops: the same fields
  // plus t, the earliest second it may arrive).
  // Deeper levels add: currents ([x, y, length, width, degrees it flows, turn rate]), gates (tunnel pairs
  // [x, y, exit x, exit y, exit degrees]: a straight shot into the first hole leaves the second at that heading),
  // shell (clusters in turning shells that only open on one side) with spin (radians a second), geodes
  // ([x, y, hp, gems]: they crack into gems that must be bloomed too), and briar (crownless clusters that grow
  // back unless all three bloom within regrow seconds).
  var LEVELS = [
    lv(1, 'meadow', 'Sunny Meadow', 'Learn the ropes', 1.55, [
      { f: 'square', s: 'tri', d: 9, then: [{ t: 6, f: 'top3', s: 'tri' }], hint: 'Tap to shoot. Gold crowns bloom their whole cluster.' },
      { f: 'wall', s: 'tri', d: 9.5, then: [{ t: 7, f: 'top4', s: 'line' }] },
      { f: 'vee', s: 'tri', d: 10, hp: 1, then: [{ t: 6, f: 'top5', s: 'tri', hp: 1 }], hint: 'Ringed buds take two hits.' },
      { f: 'grid', s: 'tri', d: 10, hp: 2, then: [{ t: 7, f: 'topvee', s: 'tri', hp: 1 }] },
      { f: 'arch', s: 'line', d: 10.5, sway: 14, then: [{ t: 6, f: 'top4', s: 'tri', sway: 12 }, { t: 12, f: 'top3', s: 'tri', hp: 2 }], hint: 'These ones sway. Lead your shot.' },
      { f: 'diamond', s: ['tri', 'line', 'line', 'tri'], d: 11, hp: 2, fast: [3], then: [{ t: 6, f: 'top5', s: 'tri', fast: [0, 4] }], hint: 'Fast ones first!' },
      { f: 'zigzag', s: 'tri', d: 11, hp: 2, sway: 16, then: [{ t: 6, f: 'top4', s: 'line', hp: 2 }, { t: 12, f: 'topvee', s: 'tri', sway: 12 }] },
      { f: 'stairs', s: 'line', d: 11.5, hp: 2, fast: [0, 4], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'top4', s: 'tri', fast: [1, 2] }] },
      { f: 'grid', s: 'tri', d: 12, hp: 3, sway: 12, petal: [210, 360, 135], then: [{ t: 7, f: 'topvee', s: 'tri', hp: 2, sway: 14 }, { t: 13, f: 'top5', s: 'line', hp: 3 }] },
      { f: [[80, 178], [340, 178], [118, 248], [302, 248]], s: 'tri', d: 7, boss: { hp: 6, r: 24, type: 'gold', sway: 50, x: 210, y: 104 }, then: [{ t: 9, f: 'topsides', s: 'tri', hp: 1 }, { t: 18, f: 'topsides', s: 'line', hp: 2 }], hint: 'Big bloom! Hit it six times.' }
    ]),
    lv(2, 'roots', 'Root Tunnels', 'Bank around rocks', 1.55, [
      { f: 'square', s: 'tri', d: 10, rocks: [[150, 330, 50, 0], [270, 330, 50, 0]], then: [{ t: 6, f: 'top4', s: 'tri', hp: 1 }], hint: 'Rocks! Bounce your shots around them.' },
      { f: 'wall', s: 'tri', d: 10.5, hp: 1, rocks: [[106, 298, 74, -22], [314, 298, 74, 22]], petal: [210, 372, 45], then: [{ t: 6, f: 'top5', s: 'line', hp: 1 }] },
      { f: 'grid', s: 'tri', d: 10.5, hp: 2, rocks: [[210, 296, 60, 0], [86, 352, 44, 90]], then: [{ t: 7, f: 'top4', s: 'tri', hp: 2 }, { t: 13, f: 'top3', s: 'stack' }] },
      { f: 'stacks', s: 'stack', d: 11, hp: 1, rocks: [[124, 318, 46, 30], [296, 318, 46, -30]], then: [{ t: 6, f: 'topstacks', s: 'stack', hp: 1 }], hint: 'Crowns on top. Crack them from below or go around.' },
      { f: 'vee', s: 'tri', d: 11.5, hp: 2, sway: 14, rocks: [[210, 290, 84, 0]], petal: [210, 380, 135], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'topvee', s: 'line', sway: 14 }] },
      { f: 'zigzag', s: 'tri', d: 11.5, hp: 2, rocks: [[92, 332, 110, 36], [328, 332, 110, -36]], petal: [210, 384, 45], then: [{ t: 6, f: 'top4', s: 'stack', hp: 2 }, { t: 12, f: 'top5', s: 'tri', fast: [2] }] },
      { f: 'ring', s: 'tri', d: 12, hp: 2, fast: [3], rocks: [[210, 172, 40, 0], [210, 330, 50, 90]], petal: [150, 380, 45], then: [{ t: 6, f: 'topsides', s: 'tri', hp: 2 }, { t: 12, f: 'top3', s: 'stack', hp: 2, fast: [1] }] },
      { f: 'columns', s: 'stack', d: 12.5, hp: 3, sway: 16, rocks: [[150, 300, 40, 0], [270, 300, 40, 0]], then: [{ t: 6, f: 'topstacks', s: 'stack', hp: 2 }, { t: 12, f: 'top5', s: 'tri', hp: 3, sway: 12 }] },
      { f: 'grid', s: ['tri', 'stack', 'tri', 'stack', 'tri', 'stack'], d: 13, hp: 3, fast: [1], rocks: [[110, 322, 46, 0], [210, 292, 46, 0], [310, 322, 46, 0]], petal: [210, 384, 135], then: [{ t: 6, f: 'topvee', s: 'tri', hp: 3 }, { t: 12, f: 'topstacks', s: 'stack', hp: 2, fast: [0, 3] }] },
      { f: [[70, 182], [350, 182], [140, 236], [280, 236]], s: ['stack', 'stack', 'tri', 'tri'], d: 7.5, hp: 1, rocks: [[150, 304, 44, -25], [270, 304, 44, 25]], boss: { hp: 8, r: 24, type: 'coral', sway: 56, x: 210, y: 104 }, then: [{ t: 8, f: 'topsides', s: 'stack', hp: 2 }, { t: 16, f: 'topsides', s: 'tri', hp: 2 }], hint: 'Big bloom! Eight hits.' }
    ]),
    lv(3, 'grotto', 'Mushroom Grotto', 'Cups and puffcaps', 1.36, [
      { f: 'grid', s: 'tri', d: 11, puffs: [[210, 158]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 1, puffs: [[175, 104]] }], hint: 'Pop a puffcap to bloom everything near it.' },
      { f: 'wall', s: 'tri', d: 11.5, cup: [0, 1, 2, 3, 4], then: [{ t: 6, f: 'top4', s: 'tri', cup: [0, 1, 2, 3] }], hint: 'Cups block shots from below. Hit the crowns!' },
      { f: 'vee', s: 'tri', d: 11.5, cup: [1, 3], cupAll: [2], puffs: [[210, 100]], then: [{ t: 7, f: 'top5', s: 'line', hp: 2, cup: [0, 4] }], hint: 'Fully cupped? Bounce off the top wall.' },
      { f: 'ring', s: 'tri', d: 12, hp: 2, sway: 14, puffs: [[210, 171]], then: [{ t: 6, f: 'top4', s: 'tri', hp: 2, cup: [1, 2] }, { t: 12, f: 'top5', s: 'tri', puffs: [[210, 112]] }] },
      { f: 'columns', s: 'tri', d: 12, hp: 1, cup: [1, 5], cupAll: [0, 4], rocks: [[96, 300, 50, 0], [324, 300, 50, 0]], then: [{ t: 6, f: 'topvee', s: 'tri', hp: 2, cup: [0, 2, 4] }, { t: 12, f: 'top3', s: 'stack', cup: [0, 1, 2] }] },
      { f: 'stairs', s: 'line', d: 12.5, hp: 2, fast: [0, 4], puffs: [[124, 196], [296, 140]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, fast: [1, 3] }, { t: 12, f: 'top4', s: 'line', cup: [0, 1, 2, 3], puffs: [[210, 104]] }] },
      { f: 'diamond', s: 'tri', d: 12.5, hp: 2, sway: 18, cup: [0, 1, 2, 3], rocks: [[210, 300, 60, 0]], petal: [210, 384, 45], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, cup: [1, 3], sway: 14 }, { t: 12, f: 'topvee', s: 'tri', cupAll: [2], puffs: [[140, 114], [260, 116]] }] },
      { f: 'zigzag', s: 'tri', d: 13, hp: 3, cup: [1, 3], cupAll: [0], puffs: [[140, 112], [280, 112]], then: [{ t: 6, f: 'topstacks', s: 'stack', hp: 2, cup: [0, 3] }, { t: 12, f: 'top5', s: 'tri', hp: 3, fast: [0, 4] }] },
      { f: 'grid', s: 'tri', d: 13.5, hp: 2, cup: [0, 1, 2, 3, 4, 5], puffs: [[150, 158], [270, 158]], rocks: [[210, 322, 50, 0]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 3, cup: [0, 1, 3, 4] }, { t: 12, f: 'topvee', s: 'line', hp: 2, cupAll: [2], puffs: [[165, 116]] }] },
      { f: [[78, 176], [342, 176]], s: 'tri', d: 8, hp: 2, cup: [0, 1], puffs: [[146, 140], [274, 140]], rocks: [[150, 312, 40, 0], [270, 312, 40, 0]], boss: { hp: 9, r: 25, type: 'lilac', sway: 56, x: 210, y: 100 }, then: [{ t: 8, f: 'topsides', s: 'tri', hp: 2, cup: [0, 1, 2, 3] }, { t: 16, f: 'topsides', s: 'tri', hp: 2, puffs: [[210, 66]] }], hint: 'Big bloom! Puffcaps hurt it too.' }
    ]),
    lv(4, 'crystal', 'Crystal Caves', 'Everything at once', 1.4, [
      { f: 'grid', s: 'tri', d: 12.5, hp: 2, rocks: [[210, 312, 56, 0, 92, .25]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'top4', s: 'line', hp: 3 }], hint: 'Moving crystals. Time your shots.' },
      { f: 'wall', s: 'tri', d: 13, hp3: 2, cup: [0, 4], then: [{ t: 6, f: 'top5', s: 'tri', hp3: 2, cup: [1, 3] }, { t: 12, f: 'topvee', s: 'line', hp: 2 }], hint: 'Double rings take three hits.' },
      { f: 'vee', s: 'tri', d: 13, hp: 2, sway: 16, rocks: [[120, 322, 44, 0, 50, .3], [300, 322, 44, 0, 50, .3]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 3, sway: 14 }, { t: 12, f: 'topstacks', s: 'stack', hp: 2 }] },
      { f: 'stacks5', s: 'stack', d: 13.5, hp: 1, cup: [0, 1, 2, 3, 4], puffs: [[174, 214], [246, 214]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, cup: [0, 2, 4] }, { t: 12, f: 'topstacks', s: 'stack', hp3: 1, cup: [0, 1, 2, 3] }] },
      { f: 'ring', s: 'tri', d: 13.5, hp: 2, hp3: 1, fast: [2, 3], rocks: [[210, 171, 46, 90]], then: [{ t: 6, f: 'topvee', s: 'tri', hp: 2, fast: [0, 4] }, { t: 12, f: 'top5', s: 'line', hp3: 2 }] },
      { f: 'columns', s: 'tri', d: 14, hp: 3, sway: 16, rocks: [[150, 300, 40, 30], [270, 300, 40, -30], [210, 352, 40, 0, 70, .35]], petal: [210, 400, 45], then: [{ t: 6, f: 'top5', s: 'tri', hp: 3, sway: 16 }, { t: 12, f: 'top4', s: 'stack', hp: 2, fast: [1, 2] }] },
      { f: 'zigzag', s: 'tri', d: 14, hp: 1, cup: [0, 2, 4], cupAll: [1, 3], puffs: [[105, 140], [245, 140]], rocks: [[210, 302, 60, 0, 80, .3]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, cupAll: [0, 4], puffs: [[140, 112], [280, 112]] }, { t: 12, f: 'topvee', s: 'tri', hp3: 2, cup: [1, 2, 3] }] },
      { f: 'stairs', s: 'line', d: 14.5, hp: 2, hp3: 2, fast: [0, 2, 4], sway: 18, then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, hp3: 1, fast: [1, 3], sway: 14 }, { t: 12, f: 'topstacks', s: 'stack', hp3: 2, fast: [0, 3] }] },
      { f: 'grid', s: 'tri', d: 15, hp: 2, hp3: 1, sway: 10, cup: [0, 2], cupAll: [4], puffs: [[210, 158]], rocks: [[210, 322, 50, 0, 90, .3]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, hp3: 1, cup: [0, 2, 4], sway: 12 }, { t: 12, f: 'topvee', s: 'tri', hp3: 2, cupAll: [2], fast: [0, 4], puffs: [[120, 116], [280, 114]] }] },
      { f: [[76, 192], [344, 192], [140, 252], [280, 252]], s: 'tri', d: 8.5, hp: 2, cup: [0, 1, 2, 3], puffs: [[150, 138], [270, 138]], rocks: [[210, 304, 60, 0, 100, .3]], boss: { hp: 12, r: 26, type: 'coral', sway: 60, x: 210, y: 98 }, then: [{ t: 8, f: 'topsides', s: 'tri', hp: 2, hp3: 1, cup: [0, 1, 2, 3] }, { t: 16, f: 'topsides', s: 'stack', hp3: 2, fast: [0, 3] }, { t: 24, f: 'topsides', s: 'tri', hp: 3, puffs: [[210, 66]] }], hint: 'Crystal heart! Twelve hits.' }
    ]),
    lv(5, 'lake', 'Glowworm Lake', 'Ride the currents', 1.64, [
      { f: 'square', s: 'tri', d: 10.5, currents: [[210, 330, 330, 60, 0, 4]], then: [{ t: 6, f: 'top3', s: 'tri' }], hint: 'Currents bend shots. Follow the aim line.' },
      { f: 'wall', s: 'tri', d: 11, hp: 1, currents: [[118, 320, 170, 60, 180, 4.5], [302, 320, 170, 60, 0, 4.5]], then: [{ t: 6, f: 'top4', s: 'line', hp: 1 }] },
      { f: 'vee', s: 'tri', d: 11.5, hp: 1, cup: [0, 1, 3, 4], currents: [[210, 262, 340, 48, 180, 6]], then: [{ t: 7, f: 'top5', s: 'tri', cup: [1, 3] }], hint: 'Let the current carry shots sideways.' },
      { f: 'arch', s: 'line', d: 11.5, hp: 2, sway: 12, currents: [[112, 360, 160, 56, -55, 4], [308, 360, 160, 56, -125, 4]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 1 }, { t: 12, f: 'topvee', s: 'tri', hp: 2 }] },
      { f: 'grid', s: 'tri', d: 12, hp: 2, puffs: [[210, 158]], currents: [[210, 296, 80, 130, 90, 6]], then: [{ t: 6, f: 'top4', s: 'tri', hp: 2, puffs: [[210, 104]] }], hint: 'Falling water pushes shots aside.' },
      { f: 'columns', s: 'stack', d: 12, hp: 2, currents: [[210, 380, 330, 50, 0, 5], [210, 286, 330, 50, 180, 5]], then: [{ t: 6, f: 'topstacks', s: 'stack', hp: 2 }, { t: 12, f: 'top5', s: 'tri', fast: [1, 3] }], hint: 'Two currents, two ways. Plan the S-bend.' },
      { f: 'ring', s: 'tri', d: 12.5, hp: 2, cupAll: [0], cup: [3], currents: [[58, 300, 280, 36, -90, 5], [362, 300, 280, 36, -90, 5]], then: [{ t: 6, f: 'topsides', s: 'tri', hp: 2 }, { t: 12, f: 'top3', s: 'tri', cupAll: [1] }], hint: 'Ride the side streams up and over.' },
      { f: 'zigzag', s: 'tri', d: 13, hp: 2, hp3: 1, sway: 14, currents: [[140, 350, 200, 56, -30, 4.5], [290, 258, 200, 56, -150, 4.5]], then: [{ t: 6, f: 'top5', s: 'line', hp: 2 }, { t: 12, f: 'topvee', s: 'tri', hp3: 1, sway: 12 }] },
      { f: 'grid', s: ['tri', 'line', 'tri', 'line', 'tri', 'line'], d: 13.5, hp: 2, hp3: 1, cup: [0, 2, 3, 5], puffs: [[150, 158], [270, 158]], currents: [[210, 262, 340, 44, 180, 6], [210, 372, 330, 50, 0, 4]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, cup: [1, 3] }, { t: 12, f: 'topvee', s: 'line', hp3: 2 }] },
      { f: [[76, 192], [344, 192], [140, 250], [280, 250]], s: 'tri', d: 8, hp: 2, cup: [2, 3], currents: [[210, 352, 330, 56, 0, 4.5]], boss: { hp: 13, r: 26, type: 'lilac', sway: 56, x: 210, y: 100 }, then: [{ t: 8, f: 'topsides', s: 'tri', hp: 2, cup: [0, 1, 2, 3] }, { t: 16, f: 'topsides', s: 'line', hp: 2 }], hint: 'Big bloom! Thirteen hits.' }
    ]),
    lv(6, 'fossil', 'Fossil Beds', 'Turning shells', 1.26, [
      { f: 'square', s: 'tri', d: 10.5, shell: [0, 3], spin: 1.1, then: [{ t: 6, f: 'top3', s: 'tri', shell: [1] }], hint: 'Shells turn. Shoot through the opening.' },
      { f: 'wall', s: 'tri', d: 11, hp: 1, shell: [1, 3], spin: 1.3, rocks: [[150, 318, 52, 0], [270, 318, 52, 0]], then: [{ t: 6, f: 'top4', s: 'tri', shell: [1, 2] }] },
      { f: 'corners', s: 'tri', d: 11.5, shell: [0, 1, 2, 3], spin: 1, then: [{ t: 7, f: 'top4', s: 'tri', hp: 1 }], hint: 'Crowns in shells. Wait for the gap.' },
      { f: 'diamond', s: 'tri', d: 12, hp: 2, shell: [0, 3], cup: [1, 2], spin: 1.5, then: [{ t: 6, f: 'top5', s: 'tri', hp: 1, shell: [0, 4] }, { t: 12, f: 'top3', s: 'stack', cup: [1] }] },
      { f: 'ring', s: 'tri', d: 12, hp: 2, shell: [0, 2, 4], spin: 1.7, puffs: [[210, 171]], then: [{ t: 6, f: 'top4', s: 'tri', hp: 2, shell: [1, 2] }], hint: 'Puffcaps bloom shelled buds too.' },
      { f: 'grid', s: 'tri', d: 12.5, hp: 2, shell: [0, 1, 2, 3, 4, 5], spin: 1.3, rocks: [[110, 322, 46, 0], [310, 322, 46, 0]], then: [{ t: 6, f: 'topvee', s: 'tri', hp: 2 }, { t: 12, f: 'top4', s: 'tri', shell: [0, 3] }] },
      { f: 'zigzag', s: 'tri', d: 13, hp: 2, hp3: 1, sway: 14, shell: [0, 2, 4], spin: 1.9, then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, shell: [1, 3] }, { t: 12, f: 'topvee', s: 'line', hp3: 1, sway: 12 }] },
      { f: 'columns', s: 'tri', d: 13, hp: 2, fast: [2, 3], shell: [0, 1, 4, 5], spin: 2.1, rocks: [[210, 300, 60, 0, 70, .3]], then: [{ t: 6, f: 'topstacks', s: 'stack', hp: 2 }, { t: 12, f: 'top5', s: 'tri', fast: [0, 4], shell: [2] }] },
      { f: 'stairs', s: 'tri', d: 13.5, hp: 2, hp3: 1, shell: [0, 1, 2, 3, 4], spin: 2.3, rocks: [[150, 330, 44, 30], [270, 330, 44, -30]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, hp3: 1, shell: [0, 2, 4] }, { t: 12, f: 'topstacks', s: 'stack', hp3: 2 }] },
      { f: [[76, 192], [344, 192], [140, 252], [280, 252]], s: 'tri', d: 8.5, hp: 2, shell: [0, 1], cup: [2, 3], spin: 1.4, boss: { hp: 14, r: 26, type: 'gold', sway: 56, x: 210, y: 100, shell: 1.1 }, then: [{ t: 8, f: 'topsides', s: 'tri', hp: 2, shell: [0, 3] }, { t: 16, f: 'topsides', s: 'stack', hp: 2 }], hint: 'A shelled big bloom! Aim for the gap.' }
    ]),
    lv(7, 'ember', 'Ember Hollows', 'Tunnels', 1.7, [
      { f: 'grid', s: 'tri', d: 10.5, rocks: [[210, 300, 160, 0]], gates: [[80, 404, 350, 296, -125]], then: [{ t: 6, f: 'top3', s: 'tri' }], hint: 'Tunnels! Shoot in one, out the other.' },
      { f: [[110, 150], [210, 150], [310, 150]], s: 'tri', d: 11, cupAll: [0, 1, 2], gates: [[100, 404, 56, 92, 30], [320, 404, 364, 92, 150]], then: [{ t: 7, f: 'top3', s: 'tri', cup: [0, 1, 2] }], hint: 'All cupped? Tunnel in from above.' },
      { f: 'stacks', s: 'stack', d: 11.5, hp: 1, rocks: [[210, 292, 290, 0]], gates: [[150, 392, 64, 236, -62], [270, 392, 356, 236, -118]], then: [{ t: 6, f: 'topstacks', s: 'stack', hp: 1 }], hint: 'Walled off? Take the tunnels around.' },
      { f: 'ring', s: 'tri', d: 12, hp: 2, cupAll: [3], cup: [0], gates: [[300, 404, 210, 171, 90]], petal: [130, 380, 45], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'topvee', s: 'tri', cup: [2] }], hint: 'This tunnel drops shots into the ring.' },
      { f: 'zigzag', s: 'tri', d: 12.5, hp: 2, fast: [1, 3], gates: [[96, 404, 360, 250, -150], [324, 404, 60, 250, -30]], then: [{ t: 6, f: 'top5', s: 'line', hp: 2 }, { t: 12, f: 'top4', s: 'tri', fast: [0, 3] }] },
      { f: 'columns', s: 'stack', d: 12.5, hp: 2, cupAll: [2], cup: [0, 4], rocks: [[150, 300, 44, 0], [270, 300, 44, 0]], gates: [[210, 404, 210, 58, 90]], petal: [110, 384, 45], then: [{ t: 6, f: 'topsides', s: 'stack', hp: 2 }, { t: 12, f: 'topsides', s: 'tri', hp: 2, cup: [0, 3] }], hint: 'Up the chimney, down on top of them.' },
      { f: 'grid', s: 'tri', d: 13, hp: 2, hp3: 1, cup: [0, 1, 2], puffs: [[150, 158], [270, 158]], rocks: [[210, 300, 200, 0]], gates: [[150, 360, 62, 248, -45], [270, 360, 358, 248, -135]], petal: [330, 410, 45], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'topvee', s: 'tri', hp3: 1, cup: [1, 3] }] },
      { f: 'diamond', s: ['tri', 'stack', 'stack', 'tri'], d: 13, hp: 2, hp3: 1, fast: [3], cupAll: [0], rocks: [[210, 312, 60, 0, 90, .3]], gates: [[64, 404, 356, 140, 180], [356, 404, 64, 140, 0]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'topstacks', s: 'stack', hp: 2, hp3: 1 }] },
      { f: 'grid', s: 'tri', d: 13, hp: 2, hp3: 1, cupAll: [0, 2], cup: [1, 3, 4, 5], puffs: [[210, 158]], rocks: [[210, 300, 60, 0, 90, .3]], gates: [[100, 404, 56, 70, 35], [320, 404, 364, 70, 145]], then: [{ t: 6, f: 'top3', s: 'tri', hp: 2, cup: [0, 2] }, { t: 12, f: 'top3', s: 'tri', hp3: 1 }] },
      { f: [[80, 190], [340, 190]], s: 'tri', d: 8.5, hp: 2, cupAll: [0, 1], rocks: [[210, 300, 120, 0]], gates: [[100, 404, 56, 120, 60], [320, 404, 364, 120, 120]], boss: { hp: 15, r: 26, type: 'coral', sway: 58, x: 210, y: 100 }, then: [{ t: 8, f: 'topsides', s: 'tri', hp: 2, cup: [0, 3] }, { t: 16, f: 'topsides', s: 'stack', hp: 2 }], hint: 'Big bloom! Fifteen hits.' }
    ]),
    lv(8, 'geode', 'Geode Mine', 'Geodes and gems', 1.4, [
      { f: 'square', s: 'tri', d: 10.5, geodes: [[210, 150, 2, 3]], then: [{ t: 6, f: 'top3', s: 'tri' }], hint: 'Geodes crack into gems. Catch them!' },
      { f: 'wall', s: 'line', d: 11, hp: 1, geodes: [[120, 210, 2, 2], [300, 210, 2, 2]], rocks: [[210, 318, 60, 0, 90, .28]], then: [{ t: 6, f: 'top4', s: 'tri', hp: 1 }], hint: 'Mine carts roll by. Time your shots.' },
      { f: 'vee', s: 'tri', d: 11.5, hp: 1, cup: [1, 3], geodes: [[210, 252, 3, 3]], then: [{ t: 6, f: 'top5', s: 'line', hp: 1 }, { t: 12, f: 'top3', s: 'tri', geodes: [[158, 100, 2, 2]] }] },
      { f: 'grid', s: 'tri', d: 12, hp: 2, geodes: [[150, 158, 2, 3], [270, 158, 2, 3]], then: [{ t: 6, f: 'topvee', s: 'tri', hp: 1 }, { t: 12, f: 'top4', s: 'line', hp: 2 }] },
      { f: 'stacks5', s: 'stack', d: 12.5, hp: 1, cup: [0, 2, 4], geodes: [[102, 236, 2, 2], [318, 236, 2, 2]], rocks: [[210, 320, 56, 0, 100, .3]], then: [{ t: 6, f: 'topstacks', s: 'stack', hp: 1 }, { t: 12, f: 'top5', s: 'tri', hp: 2, cup: [1, 3] }] },
      { f: 'ring', s: 'tri', d: 12.5, hp: 2, geodes: [[210, 171, 3, 3]], rocks: [[120, 330, 50, 0, 60, .35], [300, 330, 50, 0, 60, .35]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'topvee', s: 'tri', hp3: 1 }], hint: 'Crack the big geode before it sinks.' },
      { f: 'zigzag', s: 'tri', d: 13, hp: 2, hp3: 1, fast: [1, 3], geodes: [[105, 240, 2, 3], [315, 240, 2, 3]], rocks: [[210, 330, 70, 0, 100, .32]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'top4', s: 'stack', hp: 2, fast: [1, 2] }] },
      { f: 'columns', s: 'stack', d: 13, hp: 2, cupAll: [2], cup: [0, 4], geodes: [[153, 150, 2, 2], [267, 150, 2, 2]], gates: [[210, 404, 210, 58, 90]], petal: [110, 384, 45], then: [{ t: 6, f: 'topsides', s: 'stack', hp: 2 }, { t: 12, f: 'topsides', s: 'tri', hp: 2, cup: [0, 3] }], hint: 'Up the shaft, down onto the cups.' },
      { f: 'grid', s: 'tri', d: 13.5, hp: 2, hp3: 1, shell: [1, 4], spin: 1.8, cup: [0, 2], geodes: [[150, 158, 3, 3], [270, 158, 3, 3]], rocks: [[210, 312, 60, 0, 100, .3]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, cup: [0, 4] }, { t: 12, f: 'top4', s: 'line', hp3: 1 }] },
      { f: [[76, 186], [344, 186]], s: 'tri', d: 8.5, hp: 2, cup: [0, 1], geodes: [[120, 260, 2, 3], [300, 260, 2, 3]], rocks: [[210, 330, 60, 0, 100, .3]], boss: { hp: 16, r: 26, type: 'coral', sway: 58, x: 210, y: 100 }, then: [{ t: 8, f: 'topsides', s: 'tri', hp: 2, geodes: [[210, 92, 2, 2]] }, { t: 16, f: 'topsides', s: 'stack', hp: 2, cup: [0, 3] }], hint: 'Big bloom! Sixteen hits.' }
    ]),
    lv(9, 'briar', 'Briar Vault', 'Briars grow back', 1.98, [
      { f: 'square', s: 'tri', d: 10.5, briar: [0, 1], regrow: 5, then: [{ t: 6, f: 'top3', s: 'tri' }], hint: 'Briars regrow. Bloom all three fast!' },
      { f: 'wall', s: 'line', d: 11, briar: [0, 2, 4], regrow: 4.5, puffs: [[70, 178], [210, 178], [350, 178]], then: [{ t: 6, f: 'top4', s: 'tri', hp: 1 }], hint: 'A puffcap blooms a whole briar patch.' },
      { f: 'vee', s: 'tri', d: 11.5, hp: 1, briar: [1, 3], cup: [0, 4], regrow: 4.5, then: [{ t: 6, f: 'top5', s: 'tri', briar: [1, 3] }] },
      { f: 'grid', s: 'tri', d: 12, hp: 1, briar: [0, 2, 3, 5], regrow: 4, rocks: [[210, 300, 64, 0]], then: [{ t: 6, f: 'topvee', s: 'tri', hp: 1, briar: [0, 4] }, { t: 12, f: 'top3', s: 'stack' }], hint: 'Crack ringed briars first, then bloom.' },
      { f: 'stacks', s: 'stack', d: 12, briar: [0, 1, 2, 3], regrow: 4, then: [{ t: 6, f: 'topstacks', s: 'stack', briar: [1, 2] }], hint: 'Stacked briars. Fire fast, bottom up.' },
      { f: 'ring', s: 'tri', d: 12.5, hp: 2, briar: [0, 2, 4], puffs: [[210, 171]], regrow: 4, then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, briar: [2] }, { t: 12, f: 'topvee', s: 'line' }] },
      { f: 'zigzag', s: 'line', d: 13, hp: 1, briar: [0, 1, 2, 3, 4], regrow: 4, gates: [[96, 404, 360, 250, -150], [324, 404, 60, 250, -30]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, briar: [0, 4] }, { t: 12, f: 'top4', s: 'line', hp: 1 }] },
      { f: 'columns', s: 'tri', d: 13, hp: 2, briar: [1, 3, 5], cup: [0, 2, 4], regrow: 4, currents: [[210, 330, 330, 56, 0, 4]], then: [{ t: 6, f: 'topstacks', s: 'stack', hp: 2 }, { t: 12, f: 'top5', s: 'tri', hp: 2, briar: [1, 3] }] },
      { f: 'grid', s: 'tri', d: 13.5, hp: 2, briar: [0, 1, 2, 3, 4, 5], regrow: 3.6, puffs: [[150, 158], [270, 158]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2, briar: [0, 2, 4] }, { t: 12, f: 'topvee', s: 'line', hp3: 1 }] },
      { f: [[80, 190], [340, 190]], s: 'tri', d: 8.5, hp: 1, briar: [0, 1], regrow: 4, boss: { hp: 17, r: 26, type: 'lilac', sway: 58, x: 210, y: 100 }, then: [{ t: 8, f: 'topsides', s: 'tri', hp: 1, briar: [0, 3] }, { t: 16, f: 'topsides', s: 'line', hp: 2 }], hint: 'Big bloom! Seventeen hits.' }
    ]),
    lv(10, 'core', 'Starseed Core', 'The final test', 1.6, [
      { f: 'grid', s: 'tri', d: 11, hp: 1, shell: [0, 2], spin: 1.3, currents: [[210, 330, 330, 56, 0, 4]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 1 }], hint: 'The last level. Everything you learned.' },
      { f: [[110, 150], [210, 150], [310, 150]], s: 'tri', d: 11.5, hp: 2, cupAll: [0, 2], cup: [1], gates: [[100, 404, 56, 92, 30], [320, 404, 364, 92, 150]], then: [{ t: 6, f: 'top3', s: 'tri', hp: 2, cup: [0, 1, 2] }] },
      { f: 'vee', s: 'tri', d: 12, hp: 1, briar: [1, 3], geodes: [[210, 252, 2, 3]], then: [{ t: 6, f: 'top5', s: 'line', hp: 2 }, { t: 12, f: 'top3', s: 'tri', briar: [1] }] },
      { f: 'ring', s: 'tri', d: 12, hp: 2, shell: [1, 4], spin: 1.6, puffs: [[210, 171]], currents: [[58, 300, 280, 36, -90, 5], [362, 300, 280, 36, -90, 5]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'topvee', s: 'tri', hp: 2, shell: [2] }] },
      { f: 'zigzag', s: 'tri', d: 12.5, hp: 2, briar: [0, 2, 4], regrow: 4.5, gates: [[96, 404, 360, 250, -150], [324, 404, 60, 250, -30]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'top4', s: 'tri', hp: 2, briar: [1, 2] }] },
      { f: 'grid', s: 'tri', d: 12.5, hp: 2, hp3: 1, shell: [0, 1, 2], spin: 1.8, geodes: [[150, 158, 2, 2], [270, 158, 2, 2]], rocks: [[210, 312, 60, 0, 90, .3]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'topvee', s: 'tri', hp3: 1 }] },
      { f: 'columns', s: 'tri', d: 13, hp: 2, briar: [1, 5], cup: [0, 2, 4], currents: [[210, 290, 330, 44, 180, 6]], then: [{ t: 6, f: 'topsides', s: 'tri', hp: 2, cup: [0, 3] }, { t: 12, f: 'top5', s: 'tri', hp: 2, briar: [2] }] },
      { f: 'diamond', s: ['tri', 'stack', 'stack', 'tri'], d: 13, hp: 2, hp3: 1, shell: [0, 3], spin: 2, geodes: [[210, 152, 2, 3]], gates: [[64, 404, 356, 140, 180], [356, 404, 64, 140, 0]], then: [{ t: 6, f: 'top5', s: 'tri', hp: 2 }, { t: 12, f: 'topstacks', s: 'stack', hp: 2, hp3: 1 }] },
      { f: 'grid', s: 'tri', d: 13.5, hp: 2, hp3: 1, cupAll: [1], shell: [0, 2], briar: [3, 5], spin: 2, puffs: [[150, 158], [270, 158]], gates: [[210, 404, 210, 58, 90]], currents: [[58, 340, 200, 36, -90, 5], [362, 340, 200, 36, -90, 5]], petal: [110, 384, 45], then: [{ t: 6, f: 'topsides', s: 'tri', hp: 2, shell: [1, 2] }, { t: 12, f: 'topsides', s: 'tri', hp: 2, briar: [0, 3] }] },
      { f: [[76, 196], [344, 196], [150, 256], [270, 256]], s: 'tri', d: 8.5, hp: 2, cup: [0, 1], briar: [2, 3], currents: [[210, 352, 330, 50, 180, 4]], boss: { hp: 18, r: 27, type: 'gold', sway: 60, x: 210, y: 100, shell: 1.1 }, then: [{ t: 8, f: 'topsides', s: 'tri', hp: 2, shell: [1, 2], spin: 1.5 }, { t: 16, f: 'topsides', s: 'line', hp3: 1, geodes: [[210, 90, 2, 3]] }, { t: 24, f: 'topsides', s: 'tri', hp: 2, briar: [0, 3] }], hint: 'The Starseed! Hit it through its shell.' }
    ])
  ];

  function byId(id) { return LEVELS.filter(function (level) { return level.id === id; })[0] || null; }
  function list(value, length) { return Array.isArray(value) ? value : Array.from({ length: length }, function () { return value; }); }
  function has(listValue, index) { return Array.isArray(listValue) && listValue.indexOf(index) >= 0; }

  // Turns one group spec (the wave itself or a drop) into fresh, plain bud objects.
  function group(spec, tag, levelId, number) {
    var anchors = typeof spec.f === 'string' ? FORMATIONS[spec.f] : spec.f, shapes = list(spec.s || 'tri', anchors.length);
    var buds = [], k = 0;
    anchors.forEach(function (anchor, gi) {
      var offsets = SHAPES[shapes[gi]](gi, number), name = tag + '-' + gi;
      // Sway never carries a bud past the side walls.
      var reach = Math.max.apply(null, offsets.map(function (o) { return Math.abs(o[0]); })) + 11;
      var sway = Math.max(0, Math.min(spec.sway || 0, anchor[0] - reach - LEFT, RIGHT - reach - anchor[0]));
      var briar = has(spec.briar, gi), shelled = has(spec.shell, gi);
      offsets.forEach(function (offset, bi) {
        var mix = (k * 5 + number + levelId) % 6, hp = mix < (spec.hp3 || 0) ? 3 : mix < (spec.hp3 || 0) + (spec.hp || 0) ? 2 : 1;
        var x = anchor[0] + offset[0], y = anchor[1] + offset[1];
        var bud = { id: name + '-' + bi, group: name, x: x, y: y, baseX: x, startY: y, r: 11,
          type: TYPES[(gi + number + levelId) % TYPES.length], relay: bi === 0 && !briar, hp: hp, maxHp: hp,
          shield: has(spec.cupAll, gi) || (bi > 0 && has(spec.cup, gi)),
          fall: has(spec.fast, gi) ? 1.6 : 1, sway: sway, swayW: 2 * Math.PI * .34, swayPhase: gi * 1.3 };
        // Shells start with their openings spread around and turn in opposite directions cluster to cluster.
        if (shelled) { bud.shell = true; bud.shellAngle = Math.PI / 2 + gi * 1.9 + bi * 2.1; bud.shellSpin = (gi % 2 ? -1 : 1) * (spec.spin || 1.2); }
        if (briar) bud.briar = true;
        buds.push(bud);
        k++;
      });
    });
    (spec.geodes || []).forEach(function (spot, i) {
      buds.push({ id: tag + '-geode-' + i, group: tag + '-geode-' + i, x: spot[0], y: spot[1], baseX: spot[0], startY: spot[1], r: 14,
        type: TYPES[(i + number + levelId) % TYPES.length], relay: false, hp: spot[2] || 2, maxHp: spot[2] || 2, geode: true, gems: spot[3] || 3,
        shield: false, fall: 1, sway: 0, swayW: 0, swayPhase: 0 });
    });
    (spec.puffs || []).forEach(function (spot, i) {
      buds.push({ id: tag + '-puff-' + i, group: tag + '-puff-' + i, x: spot[0], y: spot[1], baseX: spot[0], startY: spot[1], r: 12,
        type: 'gold', relay: false, hp: 1, maxHp: 1, puff: true, shield: false, fall: 1, sway: 0, swayW: 0, swayPhase: 0 });
    });
    return buds;
  }
  // Builds one wave of a level: the opening buds, any drops still to come, the leaf and the rocks.
  function wave(levelId, number) {
    var level = byId(levelId);
    if (!level || !Number.isInteger(number) || number < 1 || number > WAVES) throw new RangeError('No such wave.');
    var spec = level.waves[number - 1], tag = 'd' + levelId + '-' + number;
    var buds = group(spec, tag, levelId, number);
    if (spec.boss) {
      var b = spec.boss, reachB = b.r + 2, swayB = Math.max(0, Math.min(b.sway || 0, b.x - reachB - LEFT, RIGHT - reachB - b.x));
      var boss = { id: tag + '-boss', group: tag + '-boss', x: b.x, y: b.y, baseX: b.x, startY: b.y, r: b.r, type: b.type,
        relay: false, hp: b.hp, maxHp: b.hp, boss: true, shield: false, fall: 1, sway: swayB, swayW: 2 * Math.PI * .22, swayPhase: 0 };
      if (b.shell) { boss.shell = true; boss.shellAngle = Math.PI / 2; boss.shellSpin = b.shell; }
      buds.push(boss);
    }
    var drops = (spec.then || []).map(function (drop, i) {
      return { at: drop.t, buds: group(drop, tag + '-drop' + (i + 1), levelId, number + i + 1) };
    });
    var petal = spec.petal || [210, 350, 45];
    var bumpers = [{ id: 'petal', x: petal[0], y: petal[1], length: 64, angle: petal[2] * Math.PI / 180, oneWay: true }];
    (spec.rocks || []).forEach(function (rock, i) {
      bumpers.push({ id: tag + '-rock-' + i, kind: 'rock', x: rock[0], y: rock[1], baseX: rock[0], length: rock[2],
        angle: rock[3] * Math.PI / 180, slide: rock[4] || 0, slideW: 2 * Math.PI * (rock[5] || 0) });
    });
    var currents = (spec.currents || []).map(function (lane, i) {
      return { id: tag + '-current-' + i, x: lane[0], y: lane[1], length: lane[2], width: lane[3], angle: lane[4] * Math.PI / 180, turn: lane[5] || 2.4 };
    });
    // A tunnel's entry faces the launcher, so a straight shot into it leaves the exit at the exit's own heading.
    var gates = [];
    (spec.gates || []).forEach(function (pair, i) {
      var a = tag + '-gate-' + i + '-in', z = tag + '-gate-' + i + '-out', r = pair[5] || 17;
      gates.push({ id: a, pair: z, x: pair[0], y: pair[1], r: r, angle: Math.atan2(pair[1] - LAUNCHER.y, pair[0] - LAUNCHER.x) });
      gates.push({ id: z, pair: a, x: pair[2], y: pair[3], r: r, angle: pair[4] * Math.PI / 180 });
    });
    return { level: levelId, wave: number, buds: buds, drops: drops, bumpers: bumpers, currents: currents, gates: gates,
      descent: Math.round(spec.d * level.pace * 10) / 10, regrow: spec.regrow || 4,
      speed: Math.min(640, 470 + levelId * 12 + number * 5), fireDelay: Math.max(.42, .6 - levelId * .02 - number * .008),
      boss: Boolean(spec.boss), hint: spec.hint || '' };
  }

  // Stars are the lives kept: clear a level without losing one for all three.
  function starsFor(lives) { return Math.max(0, Math.min(3, Math.floor(Number(lives) || 0))); }
  function integer(value, max) { return Number.isInteger(value) && value >= 0 ? Math.min(max, value) : 0; }
  // Saved progress: { [levelId]: { stars, best, wave } }. Anything unknown or damaged is dropped.
  function normalize(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (var id = 1; id <= TOTAL; id++) {
      var item = raw[id];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      var entry = { stars: integer(item.stars, 3), best: integer(item.best, 1e9), wave: integer(item.wave, WAVES) };
      if (entry.stars || entry.best || entry.wave) out[id] = entry;
    }
    return out;
  }
  // A level opens when the one before it is cleared. Levels past the free ones also need the unlock.
  function unlocked(progress, id, ownsFull) {
    if (!byId(id)) return false;
    if (id > FREE && !ownsFull) return false;
    return id === 1 || Boolean(progress && progress[id - 1] && progress[id - 1].stars > 0);
  }
  function record(progress, id, result) {
    var next = normalize(progress), before = next[id] || { stars: 0, best: 0, wave: 0 };
    if (!byId(id)) return { progress: next, firstClear: false, newStars: 0 };
    var stars = result && result.won ? starsFor(result.lives) : 0;
    next[id] = { stars: Math.max(before.stars, stars), best: Math.max(before.best, integer(result && result.score, 1e9)),
      wave: Math.max(before.wave, integer(result && result.wave, WAVES)) };
    return { progress: next, firstClear: before.stars === 0 && stars > 0, newStars: Math.max(0, stars - before.stars) };
  }

  return Object.freeze({ levels: LEVELS.map(function (level) { return { id: level.id, key: level.key, name: level.name, twist: level.twist, waves: WAVES }; }),
    total: TOTAL, waveCount: WAVES, free: FREE, puffReach: PUFF_REACH, product: PRODUCT, entitlement: ENTITLEMENT,
    level: byId, wave: wave, starsFor: starsFor, normalize: normalize, unlocked: unlocked, record: record });
});
