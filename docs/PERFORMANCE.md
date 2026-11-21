# Bloomshot: 60 FPS target and graphics settings

The release targets are the installed iPhone/iPad and Android apps. They share the packaged Canvas game, running in WKWebView and Android WebView. A website playtest or desktop phone profile cannot establish installed-app performance. Actual installations and phone measurements remain required.

Settings → Graphics defaults to **Maximum**, including existing saves. The choice uses the existing save/native backup path. Unknown choices fall back to Maximum without resetting progress.

| Choice | Board pixel-ratio cap | Scene pixel-ratio cap | Decorative effects |
| --- | --- | --- | --- |
| Maximum | 2.5 | 2 | Full, subject to the existing sustained-work governor |
| Balanced | 2 | 1.5 | Fewer shards, links and extra projectile tails |
| Performance | 1.5 | 1 | Lowest decorative tier |

Actual allocations also depend on screen size and device pixel ratio. Every choice targets 60 FPS. None changes physics, difficulty, aiming, rewards or purchases. The existing Animations preference still applies.

**Show frame rate** displays rolling local animation-callback timing during play. No timing report is sent or saved. Settings/paused dialogs, hidden pages and their resume intervals are excluded. It reports the observed rate, rather than substituting the target; callback delivery is not a GPU-presented-frame count.

## Rendering changes

- Projectile heads interpolate between the last two resolved 120 Hz physics positions. This removes one/three-tick visual movement variation at near-60 Hz without predicting past collisions. Tunnels clear the trail and draw directly at the exit. Presentation trails physics by at most one tick, about 8.3 ms; colliders and game rules are unchanged.
- High-rate Rush pointer moves update direction immediately and trace once per displayed frame. A release before that frame still fires the latest direction.
- Loaded/tray seeds reuse cached code-drawn shading, including their regrowth pop. The selected keepsake is warmed ahead of use. No raster artwork was generated.
- Resize, audio and presentation work count toward the warming/governor CPU budget. Sustained CPU work reduces optional effects and calm work restores them. CPU timing alone does not establish GPU performance.

## Installed-device acceptance

Record exact source/build, device, OS/WebView version, graphics choice, sound/animation settings and observations. Test Trevor's iPhone 13 and a real Android representative of the supported audience, installed through TestFlight/Play testing with the packaged offline assets.

1. With Maximum and Low Power/Battery Saver off, test Levels 1–3, a demanding late level and every boss. Include repeated shots, guards, Split, all powerups, heavy blooms, audio/haptics, Moon/Koi and a finale. Separate startup/warming from steady play.
2. Observe at least 60 seconds of active play per demanding scene. Engineering targets: callback average at least 58 FPS, P95 interval at most 20 ms, at most 1% of intervals above 25 ms, and no recurring visible hitch. These are acceptance targets, not verified device results. Visible stutter still fails even with a 60 FPS average.
3. Repeat after ten minutes to expose thermal/memory pressure. Check controls/safe areas, background/foreground, lock/unlock, interruptions, pause/resume, rotation and graphics changes. Progress and graphics choices must survive reopening.
4. Repeat demanding scenes in Balanced and Performance and record whether they help. If Maximum fails on the iPhone 13, investigate before release; do not silently lower the requested default.
5. If callbacks are near 60 but presentation hitches, inspect compositor/GPU timing with native platform tools. CPU/desktop measurements cannot clear that issue.

Native asset packaging, desktop measurements, synthetic CPU throttling, simulator compilation, actual installs and phone performance acceptance are separate evidence. No guarantee applies to untested devices, thermal states or OS power restrictions.
