(function (root, factory) {
  'use strict';
  var catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.BloomMoon = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PI = Math.PI;
  function gatePair(prefix, entry, exit, rotation) {
    return [
      { id: prefix + '-a', pair: prefix + '-b', x: entry[0], y: entry[1], r: 18, angle: 0 },
      { id: prefix + '-b', pair: prefix + '-a', x: exit[0], y: exit[1], r: 18, angle: rotation || 0 }
    ];
  }
  function petal(id, x, y, angle) { return { id: id, x: x, y: y, length: 52, angle: angle }; }
  function sprig(type, points, link) { return { type: type, points: points, link: link }; }
  // tune.budR enlarges targets and tune.linkAll links a whole sprig, so the
  // teaching trial forgives ordinary finger-aiming error.
  function board(number, name, subtitle, hint, par, sprigs, gates, bumpers, tune) {
    var id = 'moon-' + number, buds = [], t = tune || {};
    sprigs.forEach(function (sprig, group) {
      sprig.points.forEach(function (point, index) {
        var linked = (t.linkAll && sprig.link !== false) || (number <= 2 && index < 2);
        buds.push({ id: id + '-g' + group + '-b' + index, x: point[0], y: point[1], r: t.budR || 10.5,
          hp: 1, type: sprig.type, group: linked ? id + '-g' + group : null });
      });
    });
    return { id: id, worldId: 'moon', theme: 'moon', chapterIndex: number,
      name: name, subtitle: subtitle, description: hint, hint: hint, flowerId: 'moon-poppy',
      par: par, difficulty: number + 1, developerProof: true, free: true,
      rules: { shots: 5, ballsPerShot: 1, guide: false, autoBurst: false, ballLifetime: 7 },
      launcher: { x: 210, y: 498 }, buds: buds, gates: gates, bumpers: bumpers || [] };
  }
  var levels = [
    board(1, 'A Door in the Dark', 'One seed. Somewhere new.',
      'Aim straight into the lower moon gate. Your seed leaves its partner heading the same way. Then find the other three flower clusters.', 3, [
        sprig('gold', [[88,151],[60,128],[116,128]], false),
        sprig('lilac', [[307,109],[278,84],[336,84]]),
        sprig('coral', [[313,268],[341,246],[341,290]]),
        sprig('gold', [[88,351],[58,329],[58,373]])
      ], gatePair('m1', [210,385], [88,239], 0), [petal('m1-petal', 282,382, PI/4)], { linkAll: true }),
    board(2, 'Turn of the Moon', 'The doorway bends your journey.',
      'The lower-left gate turns your seed a quarter turn at the upper exit. Aim through it toward the gold flowers on the right.', 2, [
        sprig('gold', [[334,146],[361,121],[363,168]], false),
        sprig('lilac', [[99,114],[71,91],[128,91]]),
        sprig('coral', [[194,251],[163,230],[164,277]]),
        sprig('lilac', [[331,343],[357,319],[359,366]])
      ], gatePair('m2', [118,363], [248,174], PI/2), [petal('m2-petal', 224,355, -PI/4)], { linkAll: true }),
    board(3, 'Crescent Relay', 'Find the far side of the crescent.',
      'Enter the lower-right gate to leave the left gate turned toward the crescent. A wall return can catch a second cluster.', 3, [
        sprig('gold', [[57,132],[59,97],[88,108]]),
        sprig('lilac', [[194,95],[224,76],[245,104]]),
        sprig('coral', [[335,163],[360,139],[364,185]]),
        sprig('gold', [[210,292],[180,267],[181,314]]),
        sprig('lilac', [[74,328],[48,350],[79,364]], false)
      ], gatePair('m3', [310,382], [113,199], -PI/2), [petal('m3-petal', 122,409, PI/4)], { linkAll: true }),
    board(4, 'Crossed Stars', 'Two doors. Two different routes.',
      'The left entrance climbs into the right-hand sky. The right entrance turns you across the center. Choose which route opens the next shot.', 3, [
        sprig('gold', [[303,104],[276,80],[332,80]]),
        sprig('coral', [[83,104],[54,81],[111,79]]),
        sprig('lilac', [[203,267],[232,249],[234,287]]),
        sprig('gold', [[69,320],[44,295],[43,344]]),
        sprig('coral', [[335,287],[362,261],[365,308]]),
        sprig('lilac', [[207,150],[180,125],[181,173]]),
        sprig('gold', [[199,64],[223,90],[234,58]]),
        sprig('coral', [[72,416],[51,439],[83,448]], false)
      ], gatePair('m4-one', [127,403], [302,206], 0).concat(gatePair('m4-two', [304,393], [105,203], PI/2)),
      [petal('m4-petal', 206,365, -PI/4)], { linkAll: true }),
    board(5, 'Petal Observatory', 'A small turn changes the sky.',
      'Turn a leaf before firing to change the return path. The left gate climbs; the right gate turns toward the upper-left stars.', 3, [
        sprig('gold', [[302,91],[334,77],[337,114]]),
        sprig('lilac', [[62,96],[87,72],[97,110]]),
        sprig('coral', [[189,192],[215,169],[217,211]], false),
        sprig('gold', [[65,265],[41,242],[43,290]]),
        sprig('lilac', [[351,293],[375,270],[376,316]]),
        sprig('coral', [[205,417],[178,438],[232,440]])
      ], gatePair('m5-one', [92,375], [280,226], 0).concat(gatePair('m5-two', [329,383], [127,170], -PI/2)),
      [petal('m5-lower-petal', 209,334, 0), petal('m5-upper-petal', 260,116, -PI/4)], { linkAll: true }),
    board(6, 'Lunar Waltz', 'Make the whole sky answer.',
      'Open a route through one gate, then use the other side of the sky. Five seeds must reach eight clusters; look for wall and leaf returns.', 3, [
        sprig('gold', [[67,87],[94,66],[96,108]]),
        sprig('lilac', [[332,88],[305,64],[305,108]]),
        sprig('coral', [[168,456],[211,440],[254,456]]),
        sprig('gold', [[60,196],[40,171],[40,221]]),
        sprig('coral', [[355,204],[378,179],[378,228]], false),
        sprig('lilac', [[170,247],[198,227],[201,267]]),
        sprig('gold', [[77,345],[50,324],[50,370]]),
        sprig('coral', [[347,342],[374,319],[375,365]])
      ], gatePair('m6-one', [132,410], [302,252], 0).concat(gatePair('m6-two', [291,404], [113,248], PI/2)),
      [petal('m6-lower-petal', 215,355, PI/4), petal('m6-upper-petal', 210,151, -PI/4)], { linkAll: true })
  ];
  var hints = [
    'Aim into the lower gate. Your seed keeps its direction at the exit.',
    'The left gate turns your seed toward the gold flowers on the right.',
    'Enter the right gate. Catch a wall return along the far crescent.',
    'Left gate climbs. Right gate turns. Open a route for your next seed.',
    'Turn a leaf before firing. Change the return path through the gates.',
    'Eight clusters, five seeds. Link gate routes with wall and leaf returns.'
  ];
  levels.forEach(function (level, index) { level.hint = hints[index]; });
  return { levels: levels, id: 'moon', name: 'Moon Garden',
    label: 'Free development chapter', description: 'Six authored moon-gate challenges. Five single seeds, no guiding, and no automatic extra seeds.',
    version: 1 };
});
