'use strict';
// Shared fixtures for the foe suites (qa/test-foes-*.cjs): a one-wave board built from a real level's wave with the
// foes you name, fixed-rate stepping, and plain strike loops. Not a test itself.
const Depths = require('../depths.js');
const Foes = require('../foes.js');
const { RushGame } = require('../rush.js');

// A real wave of a level, optionally with its own buds removed and these foes ([name, x, y, opts]) added. The foes are
// built exactly as depths.js builds them, so ids, colors and defaults match the game.
function waveWith(levelId, number, foes = [], { keepBuds = true, keepDrops = false, hint } = {}) {
  const base = Depths.wave(levelId, number), tag = `t${levelId}-${number}`;
  const buds = keepBuds ? base.buds.map(bud => ({ ...bud })) : [];
  foes.forEach((spot, i) => { for (const bud of Foes.make(spot[0], spot, tag, i, levelId, number)) buds.push(bud); });
  return { ...base, buds, drops: keepDrops ? base.drops : [], hint: hint ?? base.hint };
}
// A game playing just that wave (one wave long), started and ready to fire.
function sandbox(levelId, number, foes, options = {}) {
  const spec = waveWith(levelId, number, foes, options);
  const plan = { id: levelId, name: 'Sandbox', waves: 1, wave: () => spec };
  const game = new RushGame({ plan, startWave: 1 });
  game.started = true;
  return game;
}
// Steps the game for `seconds` at `fps` frames a second (the game itself always ticks at 1/120 s inside).
function advance(game, seconds, fps = 60) { for (let t = 0; t < seconds - 1e-9; t += 1 / fps) game.step(1 / fps); return game; }
// Strikes a piece with no seed (an authored, uncredited strike) until it is gone; the count proves the loop ends.
function strikeOut(game, bud, limit = 200) { let n = 0; while (!bud.bloomed && n < limit) { game.strike(bud, true); n++; } return n; }
// Fires one aimed seed at a point and steps until it is gone (or `seconds` pass); returns the events it caused.
function shoot(game, x, y, seconds = 3, fps = 60) {
  const dx = x - game.launcher.x, dy = y - game.launcher.y, len = Math.hypot(dx, dy) || 1;
  game.fireCooldown = 0; game.shotGap = 0; if (game.pod != null) game.pod = Math.max(game.pod, 1);
  game.fire(dx / len, dy / len);
  const events = [];
  for (let t = 0; t < seconds; t += 1 / fps) { game.step(1 / fps); events.push(...game.drainEvents()); if (!game.balls.length && t > .1) break; }
  return events;
}
const foesOf = (game, name) => game.buds.filter(bud => bud.foe === name);
module.exports = { waveWith, sandbox, advance, strikeOut, shoot, foesOf, Foes, Depths, RushGame };
