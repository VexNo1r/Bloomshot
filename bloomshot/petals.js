(function (root, factory) {
  'use strict';
  var petals = factory();
  if (typeof module === 'object' && module.exports) module.exports = petals;
  else root.BloomPetals = petals;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The petal shower over a won result: a burst from behind the banner, then a light fall from the top of the
  // screen. Each piece is a petal, a leaf or a little blossom, drawn with an inked edge like the board pieces,
  // and it tumbles (turns and flips) and sways as it falls. Sizes are in CSS pixels.
  var COLORS = [
    ['#ff8fb0', '#d6466f'], ['#ffd45c', '#d8940e'], ['#b9a0f0', '#7d5fcf'],
    ['#ff9f7a', '#d9643f'], ['#fff6e2', '#d8bf8c'], ['#ffb3c8', '#e0608a']
  ];
  var LEAF = ['#86d9a0', '#2c9459'];
  var LIFE = 4, FADE = 0.8, GRAVITY = 560, DRAG = 1.7;

  function piece(random, x, y, vx, vy, delay) {
    var roll = random(), kind = roll < 0.12 ? 'leaf' : roll < 0.24 ? 'blossom' : 'petal';
    var color = kind === 'leaf' ? LEAF : COLORS[Math.floor(random() * COLORS.length)];
    var size = kind === 'blossom' ? 5 + random() * 2.5 : 6 + random() * 5;
    return { kind: kind, fill: color[0], ink: color[1], x: x, y: y, vx: vx, vy: vy, delay: delay, age: 0, size: size,
      spin: (random() - 0.5) * 7, angle: random() * Math.PI * 2, flip: random() * Math.PI * 2, flipRate: 4 + random() * 6,
      sway: 18 + random() * 26, swayRate: 1.6 + random() * 1.8, phase: random() * Math.PI * 2, fall: 110 + random() * 80 };
  }

  // width and height: the screen. origin: where the burst comes from (the result banner).
  function create(width, height, origin, random) {
    random = random || Math.random;
    var list = [], burst = width < 420 ? 46 : 60, rain = width < 420 ? 26 : 36;
    for (var i = 0; i < burst; i++) {
      var angle = -Math.PI / 2 + (random() - 0.5) * 2.3, speed = 280 + random() * 380;
      list.push(piece(random, origin.x + (random() - 0.5) * 40, origin.y + (random() - 0.5) * 12, Math.cos(angle) * speed, Math.sin(angle) * speed, random() * 0.12));
    }
    for (var j = 0; j < rain; j++) list.push(piece(random, random() * width, -20 - random() * 60, (random() - 0.5) * 40, 40 + random() * 50, 0.35 + random() * 0.9));
    return { width: width, height: height, pieces: list, time: 0 };
  }

  // Falling pieces slow to their own drift speed, so the burst settles into a gentle flutter.
  function step(state, dt) {
    state.time += dt;
    var alive = 0;
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (state.time < p.delay) { alive++; continue; }
      p.age += dt;
      if (p.age >= LIFE) continue;
      var drag = Math.exp(-DRAG * dt);
      p.vx *= drag; p.vy = p.vy * drag + GRAVITY * dt * 0.42;
      if (p.vy > p.fall) p.vy = p.fall + (p.vy - p.fall) * Math.exp(-4 * dt);
      p.x += (p.vx + Math.cos(p.age * p.swayRate + p.phase) * p.sway) * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt; p.flip += p.flipRate * dt;
      if (p.y < state.height + 40) alive++;
    }
    return alive > 0;
  }

  function petalPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.95, -s * 0.55, s * 0.78, s * 0.62, 0, s);
    ctx.bezierCurveTo(-s * 0.78, s * 0.62, -s * 0.95, -s * 0.55, 0, -s);
    ctx.closePath();
  }
  function leafPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.1);
    ctx.quadraticCurveTo(s * 0.8, 0, 0, s * 1.1);
    ctx.quadraticCurveTo(-s * 0.8, 0, 0, -s * 1.1);
    ctx.closePath();
  }

  function draw(ctx, state) {
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (state.time < p.delay || p.age >= LIFE) continue;
      var alpha = Math.min(1, p.age / 0.08, (LIFE - p.age) / FADE);
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      // The flip shows a petal edge-on now and then, the way a real one tumbles; it never vanishes completely.
      var face = Math.cos(p.flip), squash = 0.25 + 0.75 * Math.abs(face);
      ctx.scale(1, squash);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      var s = p.size;
      if (p.kind === 'blossom') {
        ctx.fillStyle = p.fill; ctx.strokeStyle = p.ink; ctx.lineWidth = 1.1;
        for (var k = 0; k < 5; k++) {
          ctx.save(); ctx.rotate(k * Math.PI * 2 / 5); ctx.translate(0, -s * 0.62);
          ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
        }
        ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fillStyle = '#ffd45c'; ctx.fill(); ctx.strokeStyle = '#d8940e'; ctx.stroke();
      } else {
        if (p.kind === 'leaf') leafPath(ctx, s); else petalPath(ctx, s);
        // The back of a petal is a shade deeper than its face.
        ctx.fillStyle = p.fill; ctx.fill();
        if (face < 0) { ctx.globalAlpha = alpha * 0.18; ctx.fillStyle = p.ink; ctx.fill(); ctx.globalAlpha = alpha; }
        ctx.strokeStyle = p.ink; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p.kind === 'leaf' ? -s * 0.85 : -s * 0.55); ctx.lineTo(0, s * (p.kind === 'leaf' ? 0.85 : 0.35));
        ctx.globalAlpha = alpha * 0.55; ctx.lineWidth = 0.9; ctx.stroke();
      }
      ctx.restore();
    }
  }

  return Object.freeze({ create: create, step: step, draw: draw, life: LIFE });
});
