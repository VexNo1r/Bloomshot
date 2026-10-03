(function (root, factory) {
  'use strict';
  var catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.BloomKoi = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Koi Conservatory: a paid garden pack. Water lanes steer a seed toward their
  // flow at a gentle, fixed turn rate; the seed never speeds up or slows down.
  // Boards 1 and 2 are a free taster; the rest unlock with the world purchase.
  var PI = Math.PI;
  var ENTITLEMENT = 'world_koi', PRODUCT = 'bloomshot.world.koi', FREE_BOARDS = 2;
  function lane(id, x, y, length, width, angle, turn) { return { id: id, x: x, y: y, length: length, width: width, angle: angle, turn: turn || 2.4 }; }
  function petal(id, x, y, angle) { return { id: id, x: x, y: y, length: 52, angle: angle }; }
  function sprig(type, points, link) { return { type: type, points: points, link: link }; }
  function board(number, name, subtitle, hint, par, sprigs, currents, bumpers) {
    var id = 'koi-' + number, buds = [];
    sprigs.forEach(function (sprig, group) {
      sprig.points.forEach(function (point, index) {
        buds.push({ id: id + '-g' + group + '-b' + index, x: point[0], y: point[1], r: 10.5,
          hp: 1, type: sprig.type, group: sprig.link === false ? null : id + '-g' + group });
      });
    });
    return { id: id, worldId: 'koi', theme: 'koi', chapterIndex: number,
      name: name, subtitle: subtitle, description: hint, hint: hint, flowerId: 'koi-lotus',
      par: par, difficulty: number + 1, free: number <= FREE_BOARDS,
      rules: { shots: 5, ballsPerShot: 1, guide: false, autoBurst: false, ballLifetime: 7 },
      launcher: { x: 210, y: 498 }, buds: buds, gates: [], currents: currents, bumpers: bumpers || [] };
  }
  var levels = [
    board(1, 'First Ripple', 'The water knows the way.',
      'The current carries your seed to the right. Let it drift into the far flowers.', 2, [
        sprig('gold', [[96,128],[70,106],[122,106]]),
        sprig('lilac', [[300,112],[274,90],[326,90]]),
        sprig('coral', [[350,350],[326,372],[374,372]]),
        sprig('gold', [[76,362],[52,384],[100,384]])
      ], [lane('k1-a', 210,250, 340,56, 0, 2.2)]),
    board(2, 'Lantern Bend', 'Up the reeds, across the top.',
      'Ride the left stream up, then the top stream sweeps your seed right.', 3, [
        sprig('coral', [[330,70],[304,56],[356,56]], false),
        sprig('gold', [[230,190],[204,176],[256,176]]),
        sprig('lilac', [[332,300],[306,286],[358,286]]),
        sprig('coral', [[150,352],[124,338],[176,338]]),
        sprig('gold', [[200,62],[176,48],[224,48]])
      ], [lane('k2-up', 64,300, 300,64, -PI/2, 2.6), lane('k2-top', 220,112, 280,52, 0, 2.2)]),
    board(3, 'Two Streams', 'They meet in the middle.',
      'Each stream angles your seed inward. Pick the side that reaches the cluster you need.', 3, [
        sprig('lilac', [[210,74],[184,60],[236,60]]),
        sprig('gold', [[72,170],[52,150],[92,150]]),
        sprig('coral', [[348,170],[328,150],[368,150]]),
        sprig('gold', [[210,250],[186,236],[234,236]], false),
        sprig('lilac', [[90,400],[66,420],[114,420]]),
        sprig('coral', [[330,400],[306,420],[354,420]])
      ], [lane('k3-left', 112,300, 210,58, -PI/4, 2.4), lane('k3-right', 308,300, 210,58, -3*PI/4, 2.4)]),
    board(4, 'Whirlpool Steps', 'Round and round the lotus.',
      'The streams circle the center. Enter at the right moment to orbit into the middle.', 3, [
        sprig('coral', [[210,222],[188,206],[232,206]], false),
        sprig('gold', [[210,272],[188,288],[232,288]]),
        sprig('lilac', [[64,70],[44,52],[88,52]]),
        sprig('lilac', [[356,70],[332,52],[376,52]]),
        sprig('gold', [[70,420],[48,438],[94,438]])
      ], [lane('k4-bottom', 210,380, 220,44, 0, 2.6), lane('k4-right', 330,250, 220,44, -PI/2, 2.6),
          lane('k4-top', 210,124, 220,44, PI, 2.6), lane('k4-left', 90,250, 220,44, PI/2, 2.6)]),
    board(5, 'Waterfall', 'Falling water. Find the side path.',
      'The center falls back toward you. Bank off the walls to climb beside it.', 3, [
        sprig('gold', [[210,64],[184,50],[236,50]]),
        sprig('coral', [[72,140],[50,124],[96,124]]),
        sprig('lilac', [[348,140],[326,124],[372,124]]),
        sprig('coral', [[210,214],[186,200],[234,200]]),
        sprig('gold', [[72,330],[50,346],[96,346]], false),
        sprig('lilac', [[348,330],[326,346],[372,346]])
      ], [lane('k5-fall', 210,300, 300,72, PI/2, 3.2)], [petal('k5-petal', 300,420, -PI/4)]),
    board(6, 'Koi Parade', 'Three streams, three directions.',
      'The streams alternate. Count the bends before you let go.', 3, [
        sprig('coral', [[350,64],[326,50],[374,50]]),
        sprig('gold', [[70,64],[46,50],[94,50]]),
        sprig('lilac', [[210,166],[186,152],[234,152]], false),
        sprig('gold', [[360,262],[338,246],[382,246]]),
        sprig('coral', [[60,262],[38,246],[82,246]]),
        sprig('lilac', [[210,358],[186,344],[234,344]])
      ], [lane('k6-high', 210,112, 330,40, 0, 2.4), lane('k6-mid', 210,212, 330,40, PI, 2.4), lane('k6-low', 210,310, 330,40, 0, 2.4)]),
    board(7, 'Reed Maze', 'Turn the leaf. Change the stream.',
      'A leaf turn sends your seed into a different current. Plan two shots ahead.', 3, [
        sprig('lilac', [[90,70],[66,56],[114,56]], false),
        sprig('coral', [[330,70],[306,56],[354,56]]),
        sprig('gold', [[150,200],[126,186],[174,186]]),
        sprig('lilac', [[300,240],[276,226],[324,226]]),
        sprig('gold', [[70,330],[48,346],[94,346]], false),
        sprig('coral', [[350,380],[328,396],[372,396]])
      ], [lane('k7-a', 110,270, 200,48, -PI/3, 2.6), lane('k7-b', 300,150, 200,48, -2*PI/3, 2.6)], [petal('k7-petal', 210,400, PI/4)]),
    board(8, 'Moon on the Water', 'Every stream at once.',
      'Six clusters, five seeds. Link the streams and the leaf into long routes.', 4, [
        sprig('gold', [[210,52],[186,40],[234,40]], false),
        sprig('coral', [[70,120],[48,104],[94,104]]),
        sprig('lilac', [[350,120],[326,104],[374,104]]),
        sprig('gold', [[130,250],[106,236],[154,236]]),
        sprig('coral', [[290,250],[266,236],[314,236]]),
        sprig('lilac', [[70,400],[48,418],[94,418]])
      ], [lane('k8-left', 60,280, 260,52, -PI/2, 2.6), lane('k8-top', 210,160, 240,44, 0, 2.2), lane('k8-right', 360,320, 220,52, PI/2, 2.6)],
      [petal('k8-petal', 230,400, -PI/4)])
  ];
  var hints = [
    'The current pushes right. Let your seed drift to the far flowers.',
    'Ride the left stream up. The top stream sweeps you right.',
    'Each stream angles inward. Pick the side for the cluster you need.',
    'The streams circle the center. Enter one to orbit inward.',
    'The center falls back toward you. Bank off a wall to climb.',
    'The streams alternate. Count the bends before you let go.',
    'A leaf turn sends your seed into a different stream.',
    'Six clusters, five seeds. Chain streams and the leaf together.'
  ];
  levels.forEach(function (level, index) { level.hint = hints[index]; });
  return { levels: levels, id: 'koi', name: 'Koi Conservatory', entitlement: ENTITLEMENT, product: PRODUCT, freeBoards: FREE_BOARDS };
});
