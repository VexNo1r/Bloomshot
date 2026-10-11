/* BLOOMSHOT — camera, time and the shot.
 *
 * The presentation clock for the big moments. A level's last flower goes into slow motion while the camera
 * leans in; the hit freezes for a blink (a hit-stop) and the camera kicks before it settles back. Smaller beats
 * get a dip (a short slow-down) or a punch (a quick zoom). A governor watches frame time and turns the extras
 * down on a slow phone. Everything here is real-time presentation: no DOM, no Math.random and no game rules,
 * so the same inputs always give the same picture. With motion off every request is refused and the output
 * stays neutral.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BloomFeel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const EASE = {
    linear: k => k,
    outCubic: k => 1 - Math.pow(1 - k, 3),
    inOutSine: k => -(Math.cos(Math.PI * k) - 1) / 2,
    // Overshoots past the target before settling; callers clamp where a value must not cross a floor.
    outBack: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
  };
  // Every timing is in seconds of real time, so slow motion never slows the camera that frames it.
  const FINALE = { scale: .22, scaleIn: .08, zoom: 1.16, zoomIn: .25, vignette: .45, vignetteIn: .3, hold: .95 };
  const RELEASE = { scale: .22, zoom: .6, vignette: .5 };
  const IMPACT = { kick: .025, dur: .04 };
  // An impact nothing built up to (a chain or a cascade ended the level) leans in and slows down on its own.
  const COLD = { scale: .4, scaleIn: .05, zoom: 1.08, zoomIn: .2, vignette: .25 };
  const DIP = { scale: .45, in: .04, hold: .25, out: .12 };
  const PUNCH = { zoom: 1.06, in: .06, out: .3 };
  const ZOOM_MAX = 1.2, BUSY_TAIL = .1, PAN_RATE = 10, BOARD = { width: 420, height: 560 };
  const STOP_MAX = .09, STOP_WINDOW = 1;

  function channel(value) { return { value, from: value, to: value, t: 0, dur: 0, ease: EASE.linear, active: false }; }
  function tween(ch, to, dur, ease) { ch.from = ch.value; ch.to = to; ch.t = 0; ch.dur = Math.max(1e-6, dur); ch.ease = ease; ch.active = true; }
  function settle(ch, value) { ch.value = ch.from = ch.to = value; ch.t = 0; ch.active = false; }
  function advance(ch, dt) {
    if (!ch.active) return;
    ch.t += dt;
    const k = clamp(ch.t / ch.dur, 0, 1);
    ch.value = ch.from + (ch.to - ch.from) * ch.ease(k);
    if (k >= 1) { ch.value = ch.to; ch.active = false; }
  }

  // create({ motion }) -> { request(kind, opts), step(realDt), setMotion(on), reset(), out }
  // out = { scale, zoom, fx, fy, vignette, busy, phase }: the game-time scale, the camera zoom about (fx, fy)
  // in board space, the finale vignette's strength, and whether any beat is still playing.
  function create(options) {
    let motion = !(options && options.motion === false);
    const scale = channel(1), zoom = channel(1), vignette = channel(0);
    const out = { scale: 1, zoom: 1, fx: BOARD.width / 2, fy: BOARD.height / 2, vignette: 0, busy: false, phase: 'idle' };
    let phase = 'idle', hold = 0, tail = 0;

    function write() {
      out.scale = clamp(scale.value, .05, 1);
      out.zoom = clamp(zoom.value, 1, ZOOM_MAX);
      out.vignette = clamp(vignette.value, 0, 1);
      out.phase = phase;
      out.busy = phase !== 'idle' || tail > 0;
      return out;
    }
    // While the camera is wide the focus jumps straight to the new point; once zoomed it pans there over a few
    // frames, because moving the zoom's center in one step would jump the whole picture.
    const aim = { x: BOARD.width / 2, y: BOARD.height / 2 };
    function focus(opts) {
      if (!opts || !Number.isFinite(opts.x) || !Number.isFinite(opts.y)) return;
      aim.x = clamp(opts.x, 0, BOARD.width); aim.y = clamp(opts.y, 0, BOARD.height);
      if (zoom.value <= 1.001) { out.fx = aim.x; out.fy = aim.y; }
    }
    function pan(dt) {
      if (zoom.value <= 1.001) { out.fx = aim.x; out.fy = aim.y; return; }
      const k = 1 - Math.exp(-dt * PAN_RATE);
      out.fx += (aim.x - out.fx) * k; out.fy += (aim.y - out.fy) * k;
    }
    function idle() { phase = 'idle'; tail = BUSY_TAIL; }
    function release() {
      phase = 'release';
      tween(scale, 1, RELEASE.scale, EASE.outCubic);
      tween(zoom, 1, RELEASE.zoom, EASE.outBack);
      tween(vignette, 0, RELEASE.vignette, EASE.outCubic);
    }
    function reset() {
      settle(scale, 1); settle(zoom, 1); settle(vignette, 0);
      phase = 'idle'; hold = 0; tail = 0;
      out.fx = aim.x = BOARD.width / 2; out.fy = aim.y = BOARD.height / 2;
      return write();
    }
    const cinematic = () => phase === 'finale' || phase === 'impact' || phase === 'release';

    function request(kind, opts) {
      if (!motion) return false;
      if (kind === 'finale') {
        if (phase === 'finale') return false;
        focus(opts);
        phase = 'finale'; hold = FINALE.hold;
        tween(scale, FINALE.scale, FINALE.scaleIn, EASE.outCubic);
        tween(zoom, FINALE.zoom, FINALE.zoomIn, EASE.inOutSine);
        tween(vignette, FINALE.vignette, FINALE.vignetteIn, EASE.outCubic);
      } else if (kind === 'impact') {
        // A kick a little further in, then the long settle back. A cold impact ({ x, y, cold: true }) with the camera
        // still wide gets a short lean-in and slow-down first, so the end is never flat.
        if (opts) focus(opts);
        phase = 'impact';
        if (opts && opts.cold && zoom.value <= 1.001) {
          tween(scale, COLD.scale, COLD.scaleIn, EASE.outCubic);
          tween(zoom, COLD.zoom, COLD.zoomIn, EASE.outCubic);
          tween(vignette, COLD.vignette, COLD.zoomIn, EASE.outCubic);
        } else tween(zoom, Math.min(ZOOM_MAX, zoom.value + IMPACT.kick), IMPACT.dur, EASE.outCubic);
      } else if (kind === 'release') {
        if (!cinematic() || phase === 'release') return false;
        release();
      } else if (kind === 'dip') {
        if (cinematic()) return false;
        phase = 'dip'; hold = DIP.hold;
        tween(scale, DIP.scale, DIP.in, EASE.outCubic);
      } else if (kind === 'punch') {
        if (cinematic()) return false;
        if (phase !== 'dip') phase = 'punch';
        if (opts) focus(opts);
        tween(zoom, PUNCH.zoom, PUNCH.in, EASE.outCubic);
      } else return false;
      write();
      return true;
    }

    function step(realDt) {
      const dt = clamp(Number(realDt) || 0, 0, .1);
      if (!motion) return reset();
      advance(scale, dt); advance(zoom, dt); advance(vignette, dt); pan(dt);
      // A punch that lands during a dip still springs back on its own.
      if (zoom.to > 1 && !zoom.active && phase !== 'finale' && phase !== 'impact') tween(zoom, 1, PUNCH.out, EASE.outCubic);
      if (phase === 'finale') { hold -= dt; if (hold <= 0) release(); }
      else if (phase === 'impact') { if (!zoom.active) release(); }
      else if (phase === 'release') { if (!scale.active && !zoom.active && !vignette.active) idle(); }
      else if (phase === 'dip') {
        hold -= dt;
        if (hold <= 0 && scale.to < 1) tween(scale, 1, DIP.out, EASE.inOutSine);
        if (hold <= 0 && !scale.active && !zoom.active) idle();
      } else if (phase === 'punch') { if (!zoom.active && zoom.value <= 1) idle(); }
      else tail = Math.max(0, tail - dt);
      return write();
    }
    function setMotion(on) {
      const next = on !== false;
      if (next === motion) return;
      motion = next;
      if (!motion) reset();
    }
    reset();
    return { request, step, setMotion, reset, out };
  }

  // The camera draws translate(fx, fy) · scale(zoom) · translate(-fx, -fy); this maps a screen point back to the board.
  function toBoard(point, out) {
    const z = out && out.zoom > 1 ? out.zoom : 1, fx = out ? Number(out.fx) || 0 : 0, fy = out ? Number(out.fy) || 0 : 0;
    return { x: fx + (point.x - fx) / z, y: fy + (point.y - fy) / z };
  }
  function toScreen(point, out) {
    const z = out && out.zoom > 1 ? out.zoom : 1, fx = out ? Number(out.fx) || 0 : 0, fy = out ? Number(out.fy) || 0 : 0;
    return { x: fx + (point.x - fx) * z, y: fy + (point.y - fy) * z };
  }

  // Hit-stop: a frozen blink on a big hit. Each request gets at most .09 s, and all of them together at most .09 s
  // in any rolling second, so a cascade of hits never stutters. Callable directly or as .request().
  // A priority request (the finale's impact, once per wave) still gets at most .09 s but is not cut short by the
  // smaller stops just before it, such as the crack that left a boss on its last ring; it counts against later ones.
  function createHitStop() {
    const grants = [];
    function request(seconds, nowSeconds, priority) {
      const want = Number(seconds) || 0, now = Number(nowSeconds) || 0;
      if (!(want > 0)) return 0;
      while (grants.length && grants[0].at <= now - STOP_WINDOW) grants.shift();
      let used = 0;
      for (const grant of grants) used += grant.seconds;
      const granted = Math.max(0, Math.min(want, STOP_MAX, priority === true ? STOP_MAX : STOP_MAX - used));
      if (granted > 1e-6) grants.push({ at: now, seconds: granted });
      return granted > 1e-6 ? granted : 0;
    }
    request.request = request;
    return request;
  }

  // Quality governor: an average (alpha .1) of what each sample measures. createGovernor() measures frame time: two
  // seconds above 19 ms steps to tier 1, two seconds above 25 ms to tier 2, and it never steps back down within a page
  // session. createGovernor({ slow, slower, recover }) sets the two thresholds in ms, and with recover (seconds) a run
  // that long under 80% of slow steps back down one tier. sample(seconds, span) measures a cost rather than a frame
  // time when span (the real seconds the sample covers) is given, so a phone capped at 30 Hz doing little work per
  // frame is never mistaken for a slow one. Samples over 100 ms (tab switches) are ignored.
  function createGovernor(options) {
    const o = options || {}, SLOW = o.slow > 0 ? o.slow : 19, SLOWER = o.slower > 0 ? o.slower : 25, RECOVER = o.recover > 0 ? o.recover : 0;
    let ema = 0, primed = false, tier = 0, slow = 0, slower = 0, calm = 0;
    function sample(realDt, span) {
      const ms = (Number(realDt) || 0) * 1000;
      if (!(ms > 0) || ms > 100) return tier;
      const dt = Number(span) > 0 ? Math.min(.1, Number(span)) : ms / 1000;
      ema = primed ? ema + (ms - ema) * .1 : ms; primed = true;
      slow = ema > SLOW ? slow + dt : 0;
      slower = ema > SLOWER ? slower + dt : 0;
      if (tier < 2 && slower >= 2) { tier = 2; calm = 0; }
      else if (tier < 1 && slow >= 2) { tier = 1; calm = 0; }
      if (RECOVER && tier > 0) {
        calm = ema < SLOW * .8 ? calm + dt : 0;
        if (calm >= RECOVER) { tier--; calm = 0; slow = 0; slower = 0; }
      }
      return tier;
    }
    sample.sample = sample;
    Object.defineProperty(sample, 'tier', { get: () => tier });
    Object.defineProperty(sample, 'average', { get: () => ema / 1000 });
    return sample;
  }

  // Where a flying seed meets the target within the horizon (seconds of game time), using the same collision
  // query the Rush engine runs: walls, petals and open flowers, without tunnels or currents. Returns null unless
  // the first thing it meets is the target. The scratch world is reused so a frame allocates nothing extra.
  // lead ({ vx, vy }, optional) is the target's own velocity: a boss sways 40 px/s or more, so the seed is swept
  // against it in its moving frame, or a shot at its edge would build a finale and then miss (or hit unannounced).
  const world = { bumpers: [], gates: [], buds: [] }, from = { x: 0, y: 0 }, travel = { x: 0, y: 0 }, relative = { x: 0, y: 0 };
  function predictHit(Engine, game, ball, target, horizon, lead) {
    if (!Engine || typeof Engine.earliest !== 'function' || !game || !ball || !target) return null;
    const h = Number(horizon) > 0 ? Number(horizon) : .2;
    const lx = lead ? Number(lead.vx) || 0 : 0, ly = lead ? Number(lead.vy) || 0 : 0;
    const moving = (lx || ly) && typeof Engine.circleHit === 'function' && Number.isFinite(Engine.RADIUS);
    world.bumpers = Array.isArray(game.bumpers) ? game.bumpers : [];
    world.buds.length = 0;
    for (const bud of Array.isArray(game.buds) ? game.buds : []) if (!bud.bloomed && !bud.gift && !(moving && bud === target)) world.buds.push(bud);
    from.x = ball.x; from.y = ball.y; travel.x = (ball.vx || 0) * h; travel.y = (ball.vy || 0) * h;
    let result = null;
    if (moving) {
      relative.x = travel.x - lx * h; relative.y = travel.y - ly * h;
      const own = Engine.circleHit(from, relative, target, Engine.RADIUS + (Number(target.r) || 0));
      // Anything else the seed meets first (a wall, a petal, another flower) takes the shot.
      const other = own ? Engine.earliest(world, from, travel) : null;
      if (own && !(other && other.t < own.t)) result = { t: own.t * h, x: from.x + travel.x * own.t, y: from.y + travel.y * own.t, nx: own.nx, ny: own.ny };
    } else {
      const hit = Engine.earliest(world, from, travel);
      if (hit && hit.kind === 'bud' && hit.item === target) result = { t: hit.t * h, x: from.x + travel.x * hit.t, y: from.y + travel.y * hit.t, nx: hit.nx, ny: hit.ny };
    }
    world.buds.length = 0; world.bumpers = [];
    return result;
  }

  return { create, toBoard, toScreen, createHitStop, createGovernor, predictHit, ease: EASE,
    timings: { FINALE, RELEASE, IMPACT, COLD, DIP, PUNCH, ZOOM_MAX, BUSY_TAIL, STOP_MAX } };
});
