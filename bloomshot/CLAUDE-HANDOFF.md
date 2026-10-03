# BLOOMSHOT — handoff to Codex

Updated October 3, 2026 by Claude after four passes. This replaces the October 2 Codex → Claude handoff. Read all of "Start here" before touching files: the copy of the game in your old workspace is now out of date.

## Start here

Trevor wants a beautiful, vibrant, fast mobile game that people love enough to pay for optional extras, live on iPhone, iPad and Android and earning money. Art (background and foreground) is the top priority after the game being genuinely compelling. The interface should feel like part of the art. Players should feel in control and feel they are progressing. Code and art are AI-assisted; never claim a human team made them.

Keep purchases honest: exact contents and price shown, no fake scarcity, no misleading timers, no paid randomness, no frustration designed to sell relief. The app stores reject the rest anyway.

**Which copy is authoritative.** Claude worked from your October 2 handoff zip and moved it into a git repository. The newest code is that repository, not `outputs/bloomshot` in your workspace:

- GitHub: https://github.com/VexNo1r/Bloomshot. `main` holds passes 1 to 3 plus the store layer. Pass 4 (Koi) is on branch `koi-world` with its own pull request; the native shell is pull request #1 (`mobile-native-shell`). Work on branches and pull requests; never force-push `main`.
- Offline copy: `bloomshot.gitbundle` (full history) and `bloomshot-latest.zip` (snapshot) in Trevor's project files under `bloomshot/`.
- Layout: `bloomshot/` is the game, `native/` the Capacitor Android/iOS shell (once #1 merges), `docs/` release and store notes, `.github/workflows/` CI and cloud builds.
- `VexNo1r/harborline` is Trevor's separate lead-recovery product. The game never goes there.
- Before you edit anything, replace your `outputs/bloomshot` with the repo's `bloomshot/` folder (keep your `work/` scripts). Do not merge by hand from your old copy; four passes of changes would be lost.

Your original native project (`outputs/bloomshot-native`) never reached Claude. The release thread regenerated it as `native/` from your pinned Capacitor 8.5.2 settings, and both cloud builds have compiled once. Prefer `native/` over your old copy.

## Saves (never reset)

Normal save `bloomshot.save.v1`; `?qa` uses `bloomshot.qa.v1`. Trevor plays in both. New save fields are additive: `koi: {}` beside `moon: {}`, and `garden.koiBest` beside `garden.moonBest`. Old saves load unchanged.

## What Claude changed, passes 1 to 4

**Pass 1, game feel and scenery.** Living meadow backdrop (sun and rays, three rolling hill bands with wildflowers), stateless ambient life (drifting petals, motes, a butterfly every 17 s, swaying grass), and for Moon a nebula and stars. Trauma-based screen shake, short hit-stop on big moments, soft additive flash, colored `+points` pops that stack instead of overlapping, a score bump, a glowing seed. All skipped with reduced motion.

**Pass 2, interface as art.** Parchment shell with a petal pattern, brass hairlines, gilded board frame, rounded display type, jade pill buttons, a brass restart button, springy dialogs, illustrated level and world cards, a jade "pebble" on the active nav button. Tokens live at the top of the pass 2 block in `styles.css` (`--jade`, `--brass`, `--parchment`).

**Moon fix.** Your pointer report was right: Moon routes needed pixel-exact aim. Sprigs of buds now link (one hit blooms the sprig) with one deliberately unlinked sprig per board so no trial falls to a single lucky shot. A simulated careful finger with 3° of aim error now clears Moon 1 to 6 about 96/89/80/59/60/45% of the time, up from 72/58/25/3/13/0%. `qa/aim-tolerance.cjs` measures it and `qa/check-moon-pointer.cjs` now enforces floors.

**Pass 3, motion.** Buds sway and open flowers breathe; blooms throw a shockwave ring, glow motes and petals that flutter as they fall; a rainbow trail once a chain passes eight; a rising shimmer cue every fifth bloom in a chain.

**Pass 4, Koi Conservatory (the first paid world).** A real world with its own mechanic, not a reskin:

- Currents (`engine.js`: `currentsFor`, `laneAt`, `steer`). A lane is a rotated rectangle. Inside it a seed's heading turns toward the lane's flow at a bounded rate (default 2.4 rad/s); speed never changes. The aim trace sub-steps the same rule, so the dotted line shows the bend. A `current` event fires on lane entry and `game.currentRides` counts them.
- `koi.js`: eight boards, five single seeds each, no in-flight steering, one leaf turn between shots. First Ripple, Lantern Bend, Two Streams, Whirlpool Steps, Waterfall, Koi Parade, Reed Maze, Moon on the Water. Pools 1 and 2 are free; 3 to 8 need entitlement `world_koi` (product `bloomshot.world.koi`).
- Art (`art.js` `drawCurrents`, `koiFish`): translucent water ribbons with travelling streaks and chevrons, a koi swimming each lane, lanes brighten when used; lily pads in the koi backdrop; an illustrated koi-pond world card. Sound: two soft rising water drops on lane entry (`sound.js` `current`, a new `drop` note style).
- App flow (`app.js`): Moon and Koi now share one "chapter" path (`chapters`, `trialOpen`, `trialPaid`, `renderChapter`). Records save to `save.koi`; new stars pay meadow seeds exactly like Moon. After pool 2 without the pack, "Next" opens the conservatory screen instead of a locked board.
- Unlock panel: names the six extra pools, says it is one payment with no ads, timers or randomness, and shows the store's own price. On the website it only says pools 3 to 8 unlock in the app; when the store is live but the product is not on sale it says so; in test mode it says nothing is charged.

**Store layer (written by the release thread, not Claude's to edit).** `store.js`, `store-ui.js`, `store-config.js`: modes native (RevenueCat), mock (`localhost` plus `?mockstore=1`) and web (sells nothing). `bloomshot.world.koi` is still `available: false`; flip it only after a sandbox purchase and restore work. RevenueCat keys are empty until Trevor's accounts exist. Read `docs/STORES.md` and `docs/MOBILE-RELEASE.md`.

## Code map changes since your handoff

| File | New responsibility |
|---|---|
| koi.js | Eight Koi boards, product and entitlement ids, free-board count |
| engine.js | Adds currents and the `current` event |
| art.js | Adds scenery, ambient life, ring/glow particles, currents and koi; exports `koiFish` |
| app.js | Chapter flow for Moon and Koi, store gating and unlock panel, game-feel layer |
| garden.js | `koiBest` and `mode: 'koi'` rewards |
| store*.js | Purchases (release thread) |

Script order: store-config → store → levels → moon → koi → garden → engine → rush → art → meadow → sound → app → store-ui → pwa. `sw.js` ASSETS includes `koi.js` and the store files; Claude bumped `VERSION` by hand to `4b0c7e1d9a52f3c8`. Your `work/prepare-release.cjs` recomputes it, which is fine.

## Verification

From `bloomshot/`, every suite must exit 0 (CI runs the same list in `.github/workflows/web-tests.yml`):

```text
node qa/test-engine.cjs           (20)
node qa/test-rush.cjs             (17)
node qa/test-pwa.cjs              (20)
node qa/test-sound.cjs            (13)
node qa/test-garden.cjs           (21)
node qa/test-save-integration.cjs (16)
node qa/test-moon-engine.cjs      (15)
node qa/test-store.cjs            (14)
node qa/test-moon-levels.cjs
node qa/test-precache-streams.cjs
node qa/check-moon-pointer.cjs
node qa/test-koi-levels.cjs
```

`test-koi-levels` checks geometry, that each board has a recorded win that also fails in still water (the currents matter), replay at 30/60/144 FPS, no lucky one-shot openers past board 1, and aim-tolerance floors. Current tolerance at 3° error: 100/88/85/73/70/60/53/43% for pools 1 to 8. Use `node qa/test-koi-levels.cjs --solve` after moving any Koi geometry, and `BLOOM_WORLD=koi node qa/aim-tolerance.cjs 5 3 400` to measure one pool.

Screenshots for each pass are in the project files under `bloomshot/screenshots/`. None of this is physical-device proof, and Trevor has not yet given feedback on the Koi pools.

## Publish this build (your Site)

Your private Site (`bloomshot-meadow.trevor-owens1996.chatgpt.site`, project `appgprj_6ac04fc69fa881919f50dedb89a70cd6`) still serves the October 2 build. After replacing `outputs/bloomshot`, run your usual release steps: `node work/prepare-release.cjs`, push, publish the archive with the owner-private operation, update `WEB-RELEASE.json`. Reuse the Site; do not change its audience.

## Native

In `native/`, the copy step derives its file list from `sw.js` ASSETS, so `koi.js` and the store files flow through; run `npm run sync` and `npm run check` (CI does the same in the `native-packaging` job) and confirm the native `index.html` keeps the new script tags. For purchases: `npm i @revenuecat/purchases-capacitor`, then follow `docs/STORES.md` steps 1 to 7. The app id `dev.bloomshot.game` is still a placeholder. Trevor cannot pay the Apple ($99/yr) or Google ($25) fees until his next paycheck; build what needs no account first (the Android debug APK and unsigned simulator compile in `.github/workflows/`; both run from the Actions tab).

## What to do next

1. Put this build on the Site and get Trevor playing Koi on his phone. Ask what feels slow, unfair or flat.
2. Native: get the debug APK onto Trevor's Android phone, and mirror saves to Capacitor Preferences so an OS cleanup cannot erase a garden. Add Capacitor Haptics, because `navigator.vibrate` does nothing on iPhone.
3. When accounts exist: products, RevenueCat entitlements, sandbox buy/cancel/restore/refund, then flip Koi to `available: true`.
4. Rush pacing: Trevor asked for faster, rising pressure the longer a run lasts. Tune by measured first-loss wave, one variable at a time.
5. Next sellable content, in the order of the monetization plan: Garden Keepsakes (cosmetic seed, trail and bloom styles with honest previews), a bundle, then boosters if any (earnable in play, never sold as relief from designed frustration).
6. Keep updating this file at the end of every fourth pass.
