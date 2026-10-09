(function (root, factory) {
  'use strict';
  var catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.BloomLevels = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Coordinates are authored, not randomly generated. Matching groups bloom together.
  var PI = Math.PI;
  function group(type, points) { return { type: type, points: points }; }
  function bumper(x, y, angle) { return { id: 'petal', x: x, y: y, length: 64, angle: angle }; }
  function garden(id, name, subtitle, description, flowerId, par, groups, bumpers) {
    var buds = [];
    groups.forEach(function (g, gi) {
      g.points.forEach(function (point, bi) {
        buds.push({ id: 'l' + id + '-g' + gi + '-b' + bi, x: point[0], y: point[1],
          r: 11, type: g.type, group: 'g' + gi });
      });
    });
    return { id: id, name: name, subtitle: subtitle, description: description,
      flowerId: flowerId, par: par, buds: buds, bumpers: bumpers,
      launcher: { x: 210, y: 498 } };
  }

  var flowers = [
    { id: 'sunbell', name: 'Sunbell', latin: 'The first light', color: '#F7C975', type: 'gold',
      description: 'Always the first one up in the morning.', unlockLevel: 1 },
    { id: 'coral-cup', name: 'Coral Cup', latin: 'A little warmth', color: '#F38F8D', type: 'coral',
      description: 'Holds sunshine like a cup of tea.', unlockLevel: 3 },
    { id: 'lilac-star', name: 'Lilac Star', latin: 'Quiet brilliance', color: '#B8A0DC', type: 'lilac',
      description: 'All points, no sharp edges.', unlockLevel: 6 },
    { id: 'honeyburst', name: 'Honeyburst', latin: 'Golden hour', color: '#EAAF58', type: 'gold',
      description: 'The bees line up for this one.', unlockLevel: 9 },
    { id: 'moon-poppy', name: 'Moon Poppy', latin: 'After the sun', color: '#C5B6EB', type: 'lilac',
      description: 'Only opens after dark.', unlockLevel: 12 },
    { id: 'dawn-crown', name: 'Dawn Crown', latin: 'Room to flourish', color: '#F19B90', type: 'coral',
      description: 'The meadow saves its best for last.', unlockLevel: 18 }
  ];

  var worlds = [
    { id: 'meadow', name: 'The Meadow', tagline: 'Puzzles, Rush and a daily garden.',
      description: '18 gardens to clear, 6 flowers to find and a new garden every day.',
      price: 0, theme: 'meadow', available: true,
      mechanic: 'Fire three seeds, steer them, and turn a petal to change the angle.' },
    { id: 'moon', name: 'Moon Garden', tagline: 'Shoot through the moon gates.',
      description: '6 trials, 5 seeds each. Fly into one gate and out of its twin.',
      price: 0, theme: 'moon', available: true,
      mechanic: 'Gates come in pairs. Read the exit, turn a leaf and make every seed count.' },
    { id: 'koi', name: 'Koi Conservatory', tagline: 'Ride the currents.',
      description: '8 pools, 5 seeds each. The water bends every shot.',
      price: 4.99, theme: 'koi', available: true,
      mechanic: 'Currents bend your seed the way the water flows. Same speed, new angle.' }
  ];

  // Dense, deliberately arranged flowerbeds. Each mask is an authored garden silhouette.
  // A row snakes into the next so linked groups remain local and cascades sweep visibly.
  function denseGarden(id, name, subtitle, description, flowerId, rows, phase) {
    var points = [], step = 27, top = 210 - (rows.length - 1) * step / 2;
    rows.forEach(function (row, ri) {
      var line = [];
      for (var ci = 0; ci < row.length; ci++) {
        if (row[ci] === 'o') line.push([210 + (ci - 5) * step, top + ri * step]);
      }
      if (ri % 2) line.reverse();
      points = points.concat(line);
    });
    var groups = [], groupCount = Math.ceil(points.length / 5), offset = 0;
    for (var gi = 0; gi < groupCount; gi++) {
      var size = Math.ceil((points.length - offset) / (groupCount - gi));
      groups.push(group(['gold', 'coral', 'lilac'][(gi + phase) % 3], points.slice(offset, offset + size)));
      offset += size;
    }
    var result = garden(id, name, subtitle, description, flowerId, id === 1 ? 1 : 2,
      groups, [bumper(id % 2 ? 95 : 325, 405, id % 2 ? -PI / 4 : PI / 4)]);
    result.buds.forEach(function (bud, bi) {
      var rank = (bi * 7 + id) % 20;
      var layered = id < 5 ? 0 : id < 8 ? 3 : id < 12 ? 7 : id < 16 ? 13 : 16;
      bud.hp = id >= 16 && rank < 3 ? 3 : rank < layered ? 2 : 1;
    });
    return result;
  }

  var levels = [
    denseGarden(1, 'First Burst', 'Three seeds. A whole lot of bloom.',
      'Aim up through the center. Your seed volley opens connected buds in waves.', 'sunbell', [
      '....ooo....', '...ooooo...', '..ooooooo..', '...ooooo...', '..ooooooo..', '...ooooo...', '....ooo....'
    ], 0),
    denseGarden(2, 'Diamond Days', 'Send a sparkle through the glasshouse.',
      'Sweep a volley through the wide middle and let the wall bounces keep it going.', 'sunbell', [
      '.....o.....', '....ooo....', '...ooooo...', '..ooooooo..', '.ooooooooo.', 'ooooooooooo',
      '.ooooooooo.', '..ooooooo..', '...ooooo...', '....ooo....', '.....o.....'
    ], 1),
    denseGarden(3, 'Wild at Heart', 'A garden with a pulse.',
      'Follow one curve or dive through the center. Every connected bloom adds to the burst.', 'coral-cup', [
      '.ooo...ooo.', 'ooooo.ooooo', 'ooooooooooo', '.ooooooooo.', '..ooooooo..', '...ooooo...', '....ooo....', '.....o.....'
    ], 1),
    denseGarden(4, 'Golden Halo', 'Around and around we grow.',
      'A glancing hit can carry the volley around the ring. Tap the petal to turn your approach.', 'coral-cup', [
      '...ooooo...', '..oo...oo..', '.oo.....oo.', 'oo.......oo', 'oo.......oo',
      'ooo.....ooo', '.ooo...ooo.', '..ooooooo..', '...ooooo...'
    ], 0),
    denseGarden(5, 'Butterfly Effect', 'A small touch. A big reaction.',
      'Layered buds need another hit. Guide your volley back through them to open both wings.', 'coral-cup', [
      '.ooo...ooo.', 'ooooo.ooooo', 'ooooo.ooooo', '.ooo...ooo.', '...ooooo...', '..ooooooo..', '...ooooo...'
    ], 2),
    denseGarden(6, 'Lilac Rush', 'A little wonderfully overgrown.',
      'Break into the curling bed and watch linked petals open behind the seeds.', 'lilac-star', [
      '..ooooooo..', '.ooooooooo.', '.oo.....oo.', '.oo.ooo.oo.', '.oo.ooo.oo.',
      '.oo.....oo.', '.ooooooooo.', '..ooooooo..'
    ], 2),
    denseGarden(7, 'Open Windows', 'Let the color spill out.',
      'Open one window and the next volley has a clear path through the garden.', 'lilac-star', [
      '.oooo.oooo.', '.oooo.oooo.', '.oooo.oooo.', '...........', '.oooo.oooo.', '.oooo.oooo.', '.oooo.oooo.'
    ], 0),
    denseGarden(8, 'Bloom Bridge', 'Across the glass, all at once.',
      'Catch the arch at an angle. A wall bounce can reach the flowers on the far side.', 'lilac-star', [
      '...ooooo...', '..ooooooo..', '.ooooooooo.', '.ooo...ooo.', 'ooo.....ooo',
      'ooo.....ooo', 'ooo.....ooo', '.ooo...ooo.'
    ], 1),
    denseGarden(9, 'Honeycomb', 'Make the whole room golden.',
      'The close-packed clusters make a long, bright chain. Look for a path through their edges.', 'honeyburst', [
      '..ooo.ooo..', '.ooooooooo.', '..ooooooo..', '.ooooooooo.', '..ooooooo..', '.ooooooooo.', '..ooo.ooo..'
    ], 0),
    denseGarden(10, 'Ribbon Riot', 'Color has a way of finding its way.',
      'Follow the ribbon, or cut across it. The volley keeps moving after the first bloom.', 'honeyburst', [
      '..ooooooo..', '.ooooooooo.', '.ooo.......', '..oooooo...', '...ooooooo.',
      '.......ooo.', '.ooooooooo.', '..ooooooo..'
    ], 1),
    denseGarden(11, 'Rose Window', 'A room full of stained-glass color.',
      'Aim between the spokes and let the seeds find their own way around the flowerbed.', 'honeyburst', [
      '....ooo....', '..ooooooo..', '.ooo.ooo.o.', 'oooo...oooo', 'ooo.....ooo',
      'oooo...oooo', '.o.ooo.ooo.', '..ooooooo..', '....ooo....'
    ], 2),
    denseGarden(12, 'Evening Fireworks', 'The garden saves some light for later.',
      'The first burst opens space for the next. Sweep through the bright center.', 'moon-poppy', [
      '.oo.....oo.', '.ooo...ooo.', '..ooooooo..', '...ooooo...', 'ooooooooooo',
      '...ooooo...', '..ooooooo..', '.ooo...ooo.', '.oo.....oo.'
    ], 2),
    denseGarden(13, 'Cross Pollination', 'A hundred little possibilities.',
      'Aim across the crossing beds. Each opening gives the following seeds a new route.', 'moon-poppy', [
      '...ooooo...', '...ooooo...', '.ooooooooo.', 'ooooooooooo', '.ooooooooo.', '...ooooo...', '...ooooo...'
    ], 1),
    denseGarden(14, 'Petal Spiral', 'Caught up in a good thing.',
      'Skim the outer bed to start a sweep. The curved shape rewards ricochets.', 'moon-poppy', [
      '..ooooooo..', '.ooooooooo.', 'ooo.....oo.', 'oo..ooo.oo.', 'oo..ooo.oo.',
      'oo......oo.', 'oooooooooo.', '.oooooooo..'
    ], 0),
    denseGarden(15, 'Lantern Festival', 'Every little light joins in.',
      'The clusters are close enough to share a spectacular volley. Turn the petal to spread the action.', 'moon-poppy', [
      '..ooo.ooo..', '.ooooooooo.', '..ooo.ooo..', '....ooo....', '.ooooooooo.', 'ooooooooooo', '.ooooooooo.'
    ], 1),
    denseGarden(16, 'Glasshouse Jungle', 'Beautifully out of hand.',
      'A dense bed with open lanes at the edges. Send the volley wide and bring it back.', 'moon-poppy', [
      '..ooooooo..', '.oo.ooo.oo.', '.ooooooooo.', '.ooo.o.ooo.', '.ooooooooo.', '.oo.ooo.oo.', '..ooooooo..'
    ], 2),
    denseGarden(17, 'Last Sunbeam', 'One more spectacular afternoon.',
      'The two sides join in the middle. Find a bounce that carries the volley across.', 'moon-poppy', [
      '.ooo...ooo.', '.oooo.oooo.', '..ooooooo..', '...ooooo...', '....ooo....',
      '...ooooo...', '..ooooooo..', '.oooo.oooo.', '.ooo...ooo.'
    ], 0),
    denseGarden(18, 'Full Bloom', 'Look what you started.',
      'Fill the glasshouse with color. Three volleys, one glorious final flowerbed.', 'dawn-crown', [
      '..oo...oo..', '.oooo.oooo.', '.ooooooooo.', '..ooooooo..', '...ooooo...',
      '..ooooooo..', '.ooooooooo.', '.oooo.oooo.', '..oo...oo..'
    ], 1)
  ];

  function dailyLevel(dateString) {
    if (typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      throw new TypeError('dailyLevel expects a date in YYYY-MM-DD format.');
    }
    var hash = 2166136261;
    for (var i = 0; i < dateString.length; i++) {
      hash = Math.imul(hash ^ dateString.charCodeAt(i), 16777619) >>> 0;
    }
    // Later authored boards, reflected exactly about the launcher's centerline.
    var source = levels[6 + (hash % 12)];
    return { id: 'daily-' + dateString, sourceLevelId: source.id, name: 'Daily Garden',
      subtitle: 'A fresh angle on ' + source.name + '.',
      description: 'A new garden every day.',
      flowerId: null, par: source.par,
      buds: source.buds.map(function (b) {
        return { id: 'daily-' + b.id, x: 420 - b.x, y: b.y, r: b.r, type: b.type, group: b.group, hp: b.hp };
      }),
      bumpers: source.bumpers.map(function (b) {
        return { id: b.id, x: 420 - b.x, y: b.y, length: b.length,
          angle: Math.atan2(Math.sin(PI - b.angle), Math.cos(PI - b.angle)) };
      }),
      launcher: { x: 420 - source.launcher.x, y: source.launcher.y }
    };
  }

  return { levels: levels, flowers: flowers, worlds: worlds, dailyLevel: dailyLevel };
});
