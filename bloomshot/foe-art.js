/* BLOOMSHOT — the level campaign's new pieces (foes.js), drawn in the storybook style of art.js. */
(function (root) {
  'use strict';
  // art.js calls these hooks only on a wave that has foes (game.foeWave):
  //   under(ctx, state, time, still, kit)          below every bud (molehills, a glowworm's body, ink trails)
  //   bud(ctx, bud, time, still, state, kit)       instead of the plain flower, for an unbloomed foe bud
  //   over(ctx, state, time, still, kit)           above the buds (swoop arcs, sneeze cones, burst drops)
  //   aim(ctx, state, time, still, kit)            after the aim guide (a rolypoly's roll arrow)
  // kit is art.js's own toolbox: { atlasSprite, blit, drawFlower, circle, sparkle, starPath, roundRect, shade, FLOWERS,
  // TAU, clamp, ease, smooth, easeBounce, easeBack }. Rules: no per-frame gradients and no shadowBlur; anything with
  // detail is painted once into an atlas sprite (keys never hold an animated value); `still` (Animations off) freezes
  // every wobble and sweep but keeps each tell readable as a still mark.
  const LOOKS = Object.create(null);
  function define(name, look) { LOOKS[name] = look; return look; }
  const has = bud => Boolean(bud && bud.foe && LOOKS[bud.foe] && LOOKS[bud.foe].bud);
  function each(state, hook, ctx, time, still, kit) {
    const seen = new Set();
    for (const bud of state.buds || []) {
      if (!bud.foe || seen.has(bud.foe)) continue;
      seen.add(bud.foe);
      const look = LOOKS[bud.foe];
      if (look && look[hook]) { ctx.save(); try { look[hook](ctx, state, time, still, kit); } finally { ctx.restore(); } }
    }
    // A look may also draw for a wave whose foes are all gone (a burst's falling drops), keyed by state.foeLooks.
    for (const name of state.foeLooks || []) {
      if (seen.has(name)) continue;
      const look = LOOKS[name];
      if (look && look[hook]) { ctx.save(); try { look[hook](ctx, state, time, still, kit); } finally { ctx.restore(); } }
    }
  }
  function bud(ctx, piece, time, still, state, kit) { LOOKS[piece.foe].bud(ctx, piece, time, still, state, kit); }
  const under = (ctx, state, time, still, kit) => each(state, 'under', ctx, time, still, kit);
  const over = (ctx, state, time, still, kit) => each(state, 'over', ctx, time, still, kit);
  const aim = (ctx, state, time, still, kit) => each(state, 'aim', ctx, time, still, kit);
  // Sprites a level will need, painted ahead during its intro: [[name, r, type], ...] -> each look's warm(kit, r, type).
  function warm(list, kit) { for (const [name, r, type] of list) { const look = LOOKS[name]; if (look && look.warm) look.warm(kit, r, type); } }

  // -----------------------------------------------------------------------------------------------------------------
  // The looks. Each lives in its own block so they stay independent.
  // -----------------------------------------------------------------------------------------------------------------

  root.BloomFoeArt = { define, LOOKS, has, bud, under, over, aim, warm };
})(typeof window !== 'undefined' ? window : globalThis);
