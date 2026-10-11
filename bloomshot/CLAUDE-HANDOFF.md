# BLOOMSHOT — handoff to Codex

Updated October 9, 2026 by Claude after passes 9 to 11 and the level campaign (levels 1 to 10 and their unlock). This replaces the October 4 handoff. Read all of "Start here" before touching files.

## Start here

Trevor wants a beautiful, vibrant, fast mobile game that people love enough to pay for optional extras, live on iPhone, iPad and Android and earning money. Players should feel in control and feel they are progressing. Code and art are AI-assisted; never claim a human team made them.

**The design bar.** Trevor's words: the UI and text must look "made by a team of humans, not AI", and the scenery and sprites should look like the work of "a very successful and professional indie company that makes 2D art games", and be creative. He chose the "Storybook game" direction on October 3. Every later pass must hold the rules in "Storybook rules" below, including store listing copy and the web page.

Keep purchases honest: exact contents and price shown, no fake scarcity, no misleading timers, no paid randomness, no frustration designed to sell relief, no pressure aimed at children. The app stores reject the rest anyway. The game is meant to appeal to all ages but is not listed in a kids category.

**Which copy is authoritative.** The GitHub repository, not any older zip or workspace copy:

- GitHub: https://github.com/VexNo1r/Bloomshot. Work on a branch and open every pull request against `main`. Do not stack pull requests on each other: Trevor merges from his phone, and on October 3 three stacked PRs merged into a feature branch instead of `main`. A branch built on an unmerged PR still targets `main` and says "merge #N first". Never force-push `main`.
- Layout: `bloomshot/` is the game, `native/` the Capacitor Android/iOS shell, `docs/` release and store notes, `.github/workflows/` CI, cloud builds, the Android release bundle and the GitHub Pages deploy.
- Web build: `.github/workflows/pages.yml` publishes `bloomshot/` to https://vexno1r.github.io/Bloomshot/ once Pages is enabled with Source set to GitHub Actions (a setting only Trevor can change).
- `VexNo1r/harborline` is Trevor's separate lead-recovery product. The game never goes there.

## Saves (never reset)

Normal save `bloomshot.save.v1`; `?qa` uses `bloomshot.qa.v1`. Trevor plays in both. New fields are always additive and old saves load unchanged. Fields added since the last handoff: `garden.decor` (decorations built), `goals` (today's goals and progress, today only), `depths` (level campaign: `{ [levelId]: { stars, best, wave } }`, levels 1 to 10, cleaned on load), `garden.depthBest` (stars per level, for seed rewards), `powers` (powerup counts; a save without it starts with one of each), `powerReceipts` (the last 50 store transaction ids, so a purchase never counts twice) and `powersMet` (the one-time powerups tip was shown). In the native app `native.js` mirrors every save to Capacitor Preferences and restores it if the OS wipes web storage.

## What changed since October 4

**Pass 9, decorations.** Six things to build in the meadow once the beds are growing (bench, birdhouse, water lilies, beehive, lantern path, apple tree with swing), 20 to 100 seeds each, 320 in all. Built once, in any order. `garden.js` and `meadow.js`.

**Pass 10, today's goals.** Three goals a day, the same for everyone (one in Rush or the levels, one puzzle, one to explore). Each pays 4 seeds once and all three pay a 6-seed bonus. A missed day costs nothing and nothing counts down. `goals.js` (catalog and progress, `qa/test-goals.cjs`), paid by `garden.js`.

**Pass 11, meadow friends.** Each decoration brings a friend to tap (Biscuit the cat, Pip the bluebird, Hopper the frog, Buzz the bee, Glimmer the firefly, Nutmeg the squirrel). Looks and sound only; a Meadow friends shelf in the Collection.

**The level campaign.** Trevor's brief on October 9: the waves alone were not enough. He asked for ten levels of ten waves, each wave harder in a different way (a fast tactical puzzle, not just faster falling), the layout changing from wave to wave, a new background per level going down through underground layers, level 4 "somewhat difficult", levels 1 to 4 free and levels 5 to 10 behind one $2.99 purchase.

- Play now opens a level map (`levels` route): a card per level with a slice of its own scene, stacked the way the levels go down, a resume card, and Meadow Rush (endless) under "Endless".
- `depths.js` (`BloomDepths`) holds all 100 authored waves: formations, cluster shapes, fall speed, armor, sway, fast clusters, acorn cups, puffcaps, rocks (some sliding), the leaf, drops (reinforcements that arrive when there is room) and a big bloom boss on every wave 10. Deeper levels add water currents (5, Glowworm Lake), turning fossil shells (6, Fossil Beds), tunnels (7, Ember Hollows), geodes that crack into gems (8, Geode Mine), briars that grow back unless the whole patch blooms in time (9, Briar Vault), and everything together with a shelled final boss (10, Starseed Core). Stars are the lives kept.
- `rush.js` runs a level as a plan of ten waves on the Rush engine; without a plan it is endless Meadow Rush as before. Currents and tunnels reuse the engine's Koi and Moon physics (`laneAt`, `steer`, `gateTransfer`, exported from `engine.js`), so the aim line bends and jumps exactly like the shot.
- `scenery.js` (`BloomScenery`) paints the ten level scenes and their rock styles as procedural Canvas illustration. `art.js` draws the board pieces (cups, puffcaps, the big bloom, shells, geodes, gems, briar vines with a regrow ring, tunnel holes, themed water).
- Difficulty is tuned with `qa/depths-bot.cjs`, a practice player that traces shots through the board with aim error. A good bot clears every level; an average bot loses more lives as levels go deeper. `qa/test-depths.cjs` checks layout safety, every mechanic and the difficulty order.
- Rewards: `garden.js` mode `depths` pays seeds for blooms and waves (capped per run) and a first-clear bonus by stars.
- The unlock: levels 5 to 10 need entitlement `levels_full` from product `bloomshot.levels.full` ($2.99, `available: false` until a sandbox purchase works). The map shows the paid levels with their art and a lock, and one card between level 4 and level 5 says exactly what the unlock holds and its store price (or "not on sale yet", or "in the app" on the web). Clearing level 4 without it shows one quiet cream "See levels 5 to 10" button, with Replay staying the main green button. Nothing interrupts play to sell.

**Powerups (October 9).** Trevor asked for powerups that turn up free on rare occasions and can be bought one at a time for 25 cents. Four, in a tray beside the Fire! sign in the levels and Meadow Rush (keys 1 to 4 on a keyboard): Sunburst (the next shot blooms everything within reach of its first touch; a big bloom loses four rings), Dandelion (the next shot fans into three seeds), Bee Line (the next shot flies through flowers, cups and shells, blooming each; a big bloom loses three rings) and Lullaby (nothing falls for six seconds). A shot powerup is only spent when the shot is fired, and picking it again puts it back. Players start with one of each. A gift bubble holding a random one floats down in about one wave in seventeen, at most once a run and never in a big bloom wave; shooting it keeps the powerup, missing it costs nothing. `powers.js` (`BloomPowers`) holds the catalog, counts and the once-only grant; `rush.js` runs the effects and gifts (only when the app passes a chance source, so tests and the practice bot are unchanged); `qa/test-powers.cjs` covers both. The Powerups shelf on the Levels page shows counts and, once a product is on sale in the app, a "Get 1" button per powerup at the store's price. Nothing offers a purchase during a run or after a loss; an empty powerup's message points only to gift bubbles. Levels are still tuned without powerups, so they stay optional help.

**Look and sound pass (October 9).** Trevor asked for the game to be as visually appealing and its sound effects as pleasing as possible. A won result now unfurls its banner, pops its stars in one at a time (each with a rising chime, the `star` cue) and counts the score up; a win also sends a short shower of inked petals, leaves and blossoms over the card (`petals.js`, `BloomPetals`, drawn on `#petal-layer`, a manual popover so it can sit above the modal dialog; browsers without popovers skip the petals). All of it runs off the main frame loop and is skipped when Animations is off. Each screen settles in when it opens. A level opened by a first clear greets the player on the map (the card pops, its scene brightens out of the locked look, a pink "New!" tag) until it is played. The sound effects were rebuilt in `sound.js`: see that file's header for the instruments and the shared room echo.

**Background redo (October 10).** Trevor's verdict after playing: very good and almost ready to deploy, but first every background should look "much more professionally done, like it was made by a big budget indie studio". All ten level scenes, the three garden boards (Meadow, Moon Garden, Koi Pond), the world cards drawn from them and the Garden tab map were repainted in light and air instead of ink outlines:

- `scenery.js` opens with a painter's kit (`lin`, `rad`, `rgba`, `wash`, `air`, `bloom`, `shaft`, `soft`, `rim`, `lit`, `grain`, `grade`, `scallop`, `clump`, `leafFlecks`, `blade`, `sward`). `soft` draws a blurred fill with the shadow trick; `grade` is the last pass of every scene (soft-light color wash and vignette), then `grain`.
- Each scene has one key light and paints back to front: far layers, a band of the scene's air, nearer layers modelled toward the light with a rim and a soft contact shadow, a dark foreground frame in a corner, then the grade. Helpers that belong to one scene carry its prefix (`grotto…`, `fossil…`, `ember…`, `geode…`, `core…`).
- Readability rules still hold: the play area (x 30 to 390, y 30 to 445) stays calm and mid-valued, busy detail lives at the edges and below the danger line, and the launcher keeps a calm lit spot behind it.
- `BloomScenery.kit` hands a few brushes to `meadow.js`, whose Garden tab map now has a painted lawn, gravel path with stepping slabs, cobble-edged beds of hoed soil, a pond with reeds, and corner canopies. Its first paint takes about 120 to 200 ms once, then it is cached.
- The level map cards take their slice of each scene from `SCENE_SLICE` in `app.js`; retune it if a scene's best band moves.
- Each scene paints in about 7 to 21 ms in headless Chromium, once per level start. `qa/test-scenery.cjs` checks that every scene, garden board and rock paints without error or `Math.random`, the same way every time, with save and restore balanced.

Before and after pictures: `docs/screenshots/backgrounds/`.

**Growth changes (October 10).** Trevor picked the top five of a growth review. The game side (the Complete Garden on the unlock card, powerup packs on the shelf, the first three waves of level 5 free, a Share button and the daily garden result) is PR #23; the store side (products, the share sheet, the listing) is PR #22.

## Storybook rules

- **Type.** Two self-hosted open-source fonts in `assets/fonts/` (SIL Open Font License): Fredoka for titles, buttons, tags and canvas text, Nunito for body text. No system-ui on canvas, no other fonts.
- **No tracked uppercase.** No small spaced-out capital "eyebrow" labels and no letter-spaced canvas text. Tags are pill `.card-tag`s in sentence case.
- **Short game labels.** "Level 4 clear!", "Wave 3 of 10", "Unlock levels 5 to 10 · $2.99". Hints are a few words and fit one line (wave hints at most about 50 characters). Prices and what a purchase contains stay exact.
- **Chunky tactile UI.** Pill buttons with a solid darker bottom edge that presses down (green primary, gold for purchases, cream secondary), cream panels with an inked edge, ribbon titles with notched tails, filled tab icons. Colors are tokens at the top of `styles.css`; each level also tints the page (`body[data-theme="depth-…"]`).
- **Scene art.** Painted in light and air with the kit in `scenery.js`: one key light per scene, shapes modelled toward it with gradients and a lit rim, soft shadows, far layers sinking into haze, a final grade and paper grain. No ink outlines on scenery (those belong to the pieces in play); small hand-placed creatures keep soft colored lines and their personality. Seeded randomness so a scene is identical every time, and busy detail kept to the edges and below the danger line so falling flowers read instantly.
- **No AI-generated raster art.** Interface graphics are CSS and inline SVG; scenes and sprites are Canvas paths. `ART-PROVENANCE.md` records this honestly; keep it accurate.

Screenshots: `docs/screenshots/storybook/` (interface), `docs/screenshots/levels/` (levels 1 to 4 and the map), `docs/screenshots/levels-deep/` (levels 5 to 10 and the unlock).

## Code map

| File | Responsibility |
|---|---|
| depths.js | The ten levels and their waves, progress records, unlock rule, product ids |
| powers.js | The four powerups, their product ids, counts and the once-only purchase grant |
| petals.js | The petal shower over a won result (create, step, draw) |
| rush.js | Endless Rush with tempo, and the level runner: waves, drops, bosses, shells, geodes, briars, powerups and gift bubbles |
| engine.js | Puzzle physics, currents and gates (shared with the levels) |
| scenery.js | The painter's kit, the ten painted level scenes, the garden boards and the rocks |
| art.js | All other canvas art: flowers, board pieces, seeds and styles, particles, callouts |
| garden.js / meadow.js | Seeds, plots, decorations, friends, rewards for every mode |
| goals.js | Today's three goals |
| keepsakes.js / koi.js / moon.js / levels.js | Seed styles; Koi boards; Moon trials; garden puzzles and worlds |
| app.js | Screens, level map, HUD, results, offers, chapters, game feel |
| sound.js | Every sound, synthesized |
| native.js | Haptics and the native save mirror (shipping thread) |
| store*.js | Purchases (shipping thread; send requests instead of editing) |

Script order: store-config → store → levels → moon → koi → keepsakes → garden → goals → depths → powers → engine → rush → scenery → art → meadow → petals → sound → native → app → store-ui → pwa. `sw.js` ASSETS lists every shipped file; bump `VERSION` whenever an asset changes (the Pages build replaces it with a content hash). The native copy step derives its file list from ASSETS.

Every new buzz goes through `haptic(kind)` in `app.js`, never `navigator.vibrate`, or iPhone stays silent.

## Verification

From `bloomshot/`, every suite must exit 0 (CI runs the same list in `.github/workflows/web-tests.yml`): every `node qa/test-*.cjs` (18 suites, including `test-depths`, `test-powers`, `test-petals`, `test-scenery`, `test-goals` and `test-keepsakes`) and `node qa/check-moon-pointer.cjs`. Then in `native/`: `npm ci && npm run sync && npm run check`. Running the suites rewrites several `qa/*-results.json` files with new timestamps; commit only the ones your change actually affects. None of this is physical-device proof.

## Store state

Koi (`bloomshot.world.koi`, $4.99), Keepsake Collection (`bloomshot.style.collection1`, $1.99), Launch Bundle (`bloomshot.bundle.launch1`, $5.99) and Levels 5 to 10 (`bloomshot.levels.full`, $2.99) are all `available: false` in `store-config.js`. The four powerups are consumables, one product each: `bloomshot.power.sunburst`, `bloomshot.power.dandelion`, `bloomshot.power.beeline` and `bloomshot.power.lullaby` ($0.25 on Google Play; Apple's lowest price applies on iOS). The shipping thread adds them to `store-config.js` and the store's buy-and-grant path; the game registers `store.onConsumable(grant)` and saves before the store finishes the purchase. Flip one only after a sandbox purchase and restore work for it. Trevor is setting up Google Play first (the Android release bundle workflow and `docs/PLAY-LAUNCH.md` are on `main`); Apple waits. Read `docs/STORES.md` and `docs/MOBILE-RELEASE.md`.

## What to do next

1. Get Trevor playing the levels on his phone and ask which waves feel unfair, slow or flat; retune `depths.js` with the practice bot rather than by feel alone.
2. Google Play: products, RevenueCat entitlements, sandbox buy, cancel, restore and refund for each product, then flip products to available one at a time.
3. After the levels: decorations and goals keep the meadow fresh; new earnable keepsakes; boosters only if earnable in play and never sold as relief from designed frustration.
4. Keep every new screen, scene and line of text to the Storybook rules above. New scenes start from the painter's kit and a frame-by-frame look at Sunny Meadow and Root Tunnels.
5. Update this file at the end of every fourth pass.
