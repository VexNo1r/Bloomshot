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
  var LEFT = 34, RIGHT = 386, PUFF_REACH = 74;

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
    topstacks: [[80, 70], [163, 70], [247, 70], [330, 70]]
  };
  // Three buds a cluster. The first is the crowned relay: a direct hit on it blooms the other two.
  var SHAPES = {
    tri: function (gi, wave) { return (wave + gi) % 3 === 0 ? [[0, 17], [-18, -13], [18, -13]] : [[0, -17], [-18, 13], [18, 13]]; },
    line: function () { return [[0, 0], [-23, 0], [23, 0]]; },
    // The crown sits on top, so a stack has to be cracked from the bottom or reached around.
    stack: function () { return [[0, -23], [0, 0], [0, 23]]; }
  };
  var TYPES = ['gold', 'coral', 'lilac'];

  // pace scales every fall speed in a level; it was tuned with qa/depths-bot.cjs so a casual player clears
  // the first level almost every time and the fourth about one try in four.
  function lv(id, key, name, twist, pace, waves) {
    return { id: id, key: key, name: name, twist: twist, pace: pace, waves: waves };
  }
  // Wave fields: f layout, s cluster shape (or one per cluster), d fall speed (px/s), hp and hp3 (how many
  // buds in every six take two or three hits), sway (side-to-side px), fast (clusters that fall 1.6x faster),
  // cup (clusters whose two outer buds wear acorn cups), cupAll (all three cupped, crown too), puffs (puffcap
  // spots), rocks ([x, y, length, degrees, slide px, slide Hz]), petal ([x, y, degrees] of the leaf you turn),
  // boss ({ hp, r, type, sway, x, y }), hint (shown when the wave starts), then (drops: the same fields plus
  // t, the earliest second it may arrive).
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
    lv(4, 'crystal', 'Crystal Caves', 'Everything at once', 1.32, [
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
      offsets.forEach(function (offset, bi) {
        var mix = (k * 5 + number + levelId) % 6, hp = mix < (spec.hp3 || 0) ? 3 : mix < (spec.hp3 || 0) + (spec.hp || 0) ? 2 : 1;
        var x = anchor[0] + offset[0], y = anchor[1] + offset[1];
        buds.push({ id: name + '-' + bi, group: name, x: x, y: y, baseX: x, startY: y, r: 11,
          type: TYPES[(gi + number + levelId) % 3], relay: bi === 0, hp: hp, maxHp: hp,
          shield: has(spec.cupAll, gi) || (bi > 0 && has(spec.cup, gi)),
          fall: has(spec.fast, gi) ? 1.6 : 1, sway: sway, swayW: 2 * Math.PI * .34, swayPhase: gi * 1.3 });
        k++;
      });
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
      buds.push({ id: tag + '-boss', group: tag + '-boss', x: b.x, y: b.y, baseX: b.x, startY: b.y, r: b.r, type: b.type,
        relay: false, hp: b.hp, maxHp: b.hp, boss: true, shield: false, fall: 1, sway: swayB, swayW: 2 * Math.PI * .22, swayPhase: 0 });
    }
    var drops = (spec.then || []).map(function (drop, i) {
      return { at: drop.t, buds: group(drop, tag + '-drop' + (i + 1), levelId, number + i + 1) };
    });
    var petal = spec.petal || [210, 350, 45];
    var bumpers = [{ id: 'petal', x: petal[0], y: petal[1], length: 64, angle: petal[2] * Math.PI / 180 }];
    (spec.rocks || []).forEach(function (rock, i) {
      bumpers.push({ id: tag + '-rock-' + i, kind: 'rock', x: rock[0], y: rock[1], baseX: rock[0], length: rock[2],
        angle: rock[3] * Math.PI / 180, slide: rock[4] || 0, slideW: 2 * Math.PI * (rock[5] || 0) });
    });
    return { level: levelId, wave: number, buds: buds, drops: drops, bumpers: bumpers, descent: Math.round(spec.d * level.pace * 10) / 10,
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
    total: TOTAL, waveCount: WAVES, free: FREE, puffReach: PUFF_REACH,
    level: byId, wave: wave, starsFor: starsFor, normalize: normalize, unlocked: unlocked, record: record });
});
