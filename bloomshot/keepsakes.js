(function (root, factory) {
  'use strict';
  var catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.BloomKeepsakes = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Garden Keepsakes: seed styles. A style changes how a seed, its trail and a bloom burst
  // look, never how a shot flies. Meadow is free, Moonlit is earned in the Moon Garden,
  // and the three collection styles come with one purchase. Every style can be previewed.
  var PRODUCT = 'bloomshot.style.collection1', ENTITLEMENT = 'style_collection1';
  var styles = [
    { id: 'meadow', name: 'Meadow', source: 'free',
      blurb: 'The classic seed, in the colors of the flower it was picked from.' },
    { id: 'moonlit', name: 'Moonlit', source: 'earned', requirement: 'Clear all six Moon Garden trials.',
      blurb: 'A pearl seed that trails starlight and blooms with a scatter of tiny stars.',
      seed: { base: '#c9c2f2', light: '#efeaff', core: '#fbf9ff', rim: '#8f86d6' },
      trail: { kind: 'stars', ribbon: '#b9b0ee', accents: ['#ffffff', '#e4defc', '#fff3c4'] },
      burst: { kind: 'star', share: .4, colors: ['#ffffff', '#e4defc', '#fff3c4', '#c9c2f2'] } },
    { id: 'sakura', name: 'Sakura Breeze', source: 'collection',
      blurb: 'A blossom-pink seed that sheds cherry petals and bursts into falling sakura.',
      seed: { base: '#f7a1c0', light: '#ffd3e2', core: '#fff4f7', rim: '#e0628f' },
      trail: { kind: 'blossoms', ribbon: '#ffc0d6', accents: ['#ffd9e6', '#ffb3cc', '#ffffff'] },
      burst: { kind: 'blossom', share: .5, colors: ['#ffe3ec', '#ffc2d5', '#fff4f7', '#f9a8c4'] } },
    { id: 'firefly', name: 'Firefly Night', source: 'collection',
      blurb: 'A warm glowing seed with a wake of blinking fireflies that drift up from every bloom.',
      seed: { base: '#ffb53d', light: '#fff0a0', core: '#fffbe0', rim: '#d97c12' },
      trail: { kind: 'fireflies', ribbon: '#ffd36b', accents: ['#ffd23f', '#ffc12e', '#b9ec4f'] },
      burst: { kind: 'firefly', share: .35, colors: ['#ffd23f', '#ffb81f', '#b9ec4f'] } },
    { id: 'gilded', name: 'Gilded Leaf', source: 'collection',
      blurb: 'A burnished gold seed that flakes gold leaf as it flies and showers it on every bloom.',
      seed: { base: '#e2b04a', light: '#fff1b8', core: '#fff9e2', rim: '#a8771c' },
      trail: { kind: 'flakes', ribbon: '#f0cd6e', accents: ['#ffe9a6', '#f2c04f', '#fffaf0'] },
      burst: { kind: 'flake', share: .45, colors: ['#ffe28a', '#f2c04f', '#d99a2b', '#fff3c9'] } }
  ];
  var byId = {};
  styles.forEach(function (style) { byId[style.id] = style; });
  function moonCleared(moonRecords, moonLevels) {
    return Array.isArray(moonLevels) && moonLevels.length > 0 && moonLevels.every(function (level) {
      var record = moonRecords && moonRecords[level.id];
      return Boolean(record && record.stars > 0);
    });
  }
  // context: { moon: save.moon, moonLevels: BloomMoon.levels, owns: function (entitlement) }
  function unlocked(id, context) {
    var style = byId[id]; if (!style) return false;
    if (style.source === 'free') return true;
    if (style.source === 'earned') return moonCleared(context && context.moon, context && context.moonLevels);
    return Boolean(context && typeof context.owns === 'function' && context.owns(ENTITLEMENT));
  }
  // The style a player actually sees: an unknown, locked or refunded choice shows Meadow
  // without erasing the saved choice, so a restored purchase brings it back.
  function resolve(id, context) { return unlocked(id, context) ? byId[id] : byId.meadow; }
  // Signature particles a style adds to a bloom burst, on top of the flower's own petals.
  function burstExtras(style, x, y, count, random) {
    var spec = style && style.burst; if (!spec) return [];
    var rand = random || Math.random, extras = [], n = Math.min(24, Math.round(count * spec.share));
    for (var i = 0; i < n; i++) {
      var a = rand() * Math.PI * 2, speed = 40 + rand() * 120, life = .9 + rand() * 1.1;
      var p = { x: x, y: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 30, life: life, maxLife: life,
        kind: spec.kind, color: spec.colors[i % spec.colors.length], size: 2.4 + rand() * 2.6,
        rotation: a, spin: (rand() - .5) * 7, drag: 1.2, gravity: 60, phase: rand() * 6.28 };
      if (spec.kind === 'blossom') { p.gravity = 45; p.flutter = 16 + rand() * 22; p.size += 1; }
      else if (spec.kind === 'firefly') { p.gravity = -26; p.drag = 1.8; p.life = p.maxLife = 1.4 + rand() * 1.2; p.size = 1.6 + rand() * 1.4; }
      else if (spec.kind === 'flake') { p.gravity = 55; p.flutter = 10 + rand() * 14; }
      else if (spec.kind === 'star') { p.gravity = 20; p.drag = 1.6; p.size = 2 + rand() * 2.5; }
      extras.push(p);
    }
    return extras;
  }
  return { styles: styles, byId: byId, product: PRODUCT, entitlement: ENTITLEMENT,
    collection: styles.filter(function (s) { return s.source === 'collection'; }).map(function (s) { return s.id; }),
    unlocked: unlocked, resolve: resolve, burstExtras: burstExtras, moonCleared: moonCleared };
});
