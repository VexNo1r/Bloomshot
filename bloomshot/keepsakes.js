(function (root, factory) {
  'use strict';
  var catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.BloomKeepsakes = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Garden Keepsakes: seed styles. A style changes how a seed, its trail and a bloom burst
  // look, never how a shot flies. Meadow is free, Moonlit is earned in the Moon Garden,
  // the three collection styles come with one purchase, and the three grown styles are
  // grown once each with seeds earned in play (garden.js keeps the list and the cost; they
  // are never sold). Every style can be previewed.
  var PRODUCT = 'bloomshot.style.collection1', ENTITLEMENT = 'style_collection1';
  var styles = [
    { id: 'meadow', name: 'Meadow', source: 'free',
      blurb: 'The classic. It takes the color of its flower.' },
    { id: 'moonlit', name: 'Moonlit', source: 'earned', requirement: 'Clear all six Moon Garden trials.',
      blurb: 'Pearl seed, starlight trail, a shower of stars.',
      seed: { base: '#c9c2f2', light: '#efeaff', core: '#fbf9ff', rim: '#8f86d6' },
      trail: { kind: 'stars', ribbon: '#b9b0ee', accents: ['#ffffff', '#e4defc', '#fff3c4'] },
      burst: { kind: 'star', share: .4, colors: ['#ffffff', '#e4defc', '#fff3c4', '#c9c2f2'] } },
    { id: 'sakura', name: 'Sakura Breeze', source: 'collection',
      blurb: 'Pink seed, petal trail, cherry-blossom blooms.',
      seed: { base: '#f7a1c0', light: '#ffd3e2', core: '#fff4f7', rim: '#e0628f' },
      trail: { kind: 'blossoms', ribbon: '#ffc0d6', accents: ['#ffd9e6', '#ffb3cc', '#ffffff'] },
      burst: { kind: 'blossom', share: .5, colors: ['#ffe3ec', '#ffc2d5', '#fff4f7', '#f9a8c4'] } },
    { id: 'firefly', name: 'Firefly Night', source: 'collection',
      blurb: 'Glowing seed with fireflies in its wake.',
      seed: { base: '#ffb53d', light: '#fff0a0', core: '#fffbe0', rim: '#d97c12' },
      trail: { kind: 'fireflies', ribbon: '#ffd36b', accents: ['#ffd23f', '#ffc12e', '#b9ec4f'] },
      burst: { kind: 'firefly', share: .35, colors: ['#ffd23f', '#ffb81f', '#b9ec4f'] } },
    { id: 'gilded', name: 'Gilded Leaf', source: 'collection',
      blurb: 'Gold seed that sheds gold leaf on every bloom.',
      seed: { base: '#e2b04a', light: '#fff1b8', core: '#fff9e2', rim: '#a8771c' },
      trail: { kind: 'flakes', ribbon: '#f0cd6e', accents: ['#ffe9a6', '#f2c04f', '#fffaf0'] },
      burst: { kind: 'flake', share: .45, colors: ['#ffe28a', '#f2c04f', '#d99a2b', '#fff3c9'] } },
    // Grown with earned seeds. seed.shape picks the body art.js paints: a water bead, a blackberry, a maple samara.
    { id: 'dewdrop', name: 'Dewdrop', source: 'grown', cost: 150,
      blurb: 'A water-bead seed. It drips dew as it flies and splashes every bloom.',
      seed: { base: '#79cfee', light: '#d3f4ff', core: '#f6fdff', rim: '#2d8fbd', shape: 'dew' },
      trail: { kind: 'beads', ribbon: '#a9e7f8', accents: ['#9fe2f7', '#62c6ec', '#c9f1ff'] },
      burst: { kind: 'splash', share: .45, colors: ['#b4ebfc', '#79cfee', '#9fe2f7', '#3fa6da'] } },
    { id: 'bramble', name: 'Bramble Berry', source: 'grown', cost: 250,
      blurb: 'A blackberry seed on a leafy, thorny vine. Blooms shake loose the berries.',
      seed: { base: '#6a3489', light: '#b07ad0', core: '#ead1f6', rim: '#3d1a54', shape: 'berry' },
      trail: { kind: 'brambles', ribbon: '#4f9a4c', accents: ['#62b65a', '#3f8a46', '#d8435d'] },
      burst: { kind: 'berry', share: .4, colors: ['#5a2878', '#d8435d', '#8a4fb0', '#62b65a'] } },
    { id: 'maple', name: 'Autumn Maple', source: 'grown', cost: 400,
      blurb: 'A whirling maple seed. Autumn leaves tumble after it and rain down on every bloom.',
      seed: { base: '#e8742c', light: '#ffc46c', core: '#fff1d6', rim: '#a5441a', shape: 'samara' },
      trail: { kind: 'leaves', ribbon: '#f4a64e', accents: ['#e0452b', '#f08a2a', '#f4c03c', '#b4532a'] },
      burst: { kind: 'maple', share: .45, colors: ['#e0452b', '#f08a2a', '#f4c03c', '#b4532a'] } }
  ];
  var byId = {};
  styles.forEach(function (style) { byId[style.id] = style; });
  function moonCleared(moonRecords, moonLevels) {
    return Array.isArray(moonLevels) && moonLevels.length > 0 && moonLevels.every(function (level) {
      var record = moonRecords && moonRecords[level.id];
      return Boolean(record && record.stars > 0);
    });
  }
  // context: { moon: save.moon, moonLevels: BloomMoon.levels, owns: function (entitlement), grown: save.garden.grown }
  function unlocked(id, context) {
    var style = byId[id]; if (!style) return false;
    if (style.source === 'free') return true;
    if (style.source === 'earned') return moonCleared(context && context.moon, context && context.moonLevels);
    // A grown style is opened only by the seeds spent on it, never by the paid collection.
    if (style.source === 'grown') return Boolean(context && Array.isArray(context.grown) && context.grown.indexOf(id) >= 0);
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
      // Dewdrop: drops flung out and pulled down hard, the first a ripple ring that spreads where the bloom was.
      else if (spec.kind === 'splash') {
        if (i === 0) { p.ripple = true; p.color = spec.colors[3]; p.vx = p.vy = 0; p.gravity = 0; p.drag = 0; p.spin = 0; p.life = p.maxLife = .7; p.size = 8; }
        else { p.vx *= 1.25; p.vy = p.vy * 1.1 - 40; p.gravity = 260; p.drag = .7; p.life = p.maxLife = .55 + rand() * .55; p.size = 1.8 + rand() * 1.8; }
      }
      // Bramble Berry: round berries that hop out and bounce, and every third a bramble leaf that spins away.
      else if (spec.kind === 'berry') {
        p.gravity = 210; p.drag = .55; p.vy -= 40;
        if (i % 3 === 2) { p.leaf = true; p.color = spec.colors[3]; p.gravity = 70; p.flutter = 10 + rand() * 12; p.size += 1; }
        else { p.color = spec.colors[i % 3]; p.size = 2 + rand() * 1.4; }
      }
      // Autumn Maple: leaves that tumble and sway down slowly, like a gust shaking a tree.
      else if (spec.kind === 'maple') { p.gravity = 40; p.drag = 1.4; p.flutter = 18 + rand() * 20; p.size = 3.6 + rand() * 2.4; p.life = p.maxLife = 1.3 + rand() * 1.1; }
      extras.push(p);
    }
    return extras;
  }
  return { styles: styles, byId: byId, product: PRODUCT, entitlement: ENTITLEMENT,
    collection: styles.filter(function (s) { return s.source === 'collection'; }).map(function (s) { return s.id; }),
    grown: styles.filter(function (s) { return s.source === 'grown'; }).map(function (s) { return s.id; }),
    unlocked: unlocked, resolve: resolve, burstExtras: burstExtras, moonCleared: moonCleared };
});
