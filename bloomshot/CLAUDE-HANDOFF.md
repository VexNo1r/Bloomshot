# BLOOMSHOT — handoff to Codex

Updated October 4, 2026 by Claude after passes 5 to 8 and the Storybook redesign. This replaces the October 3 handoff. Read all of "Start here" before touching files.

## Start here

Trevor wants a beautiful, vibrant, fast mobile game that people love enough to pay for optional extras, live on iPhone, iPad and Android and earning money. Players should feel in control and feel they are progressing. Code and art are AI-assisted; never claim a human team made them.

**The design bar.** Trevor's words: the UI and text must look "made by a team of humans, not AI". On October 3 he said the old parchment-and-brass interface still looked AI-made, and he chose the "Storybook game" direction for the redesign. Every later pass must hold the rules in "Storybook rules" below, including store listing copy and the web page.

Keep purchases honest: exact contents and price shown, no fake scarcity, no misleading timers, no paid randomness, no frustration designed to sell relief. The app stores reject the rest anyway.

**Which copy is authoritative.** The GitHub repository, not any older zip or workspace copy:

- GitHub: https://github.com/VexNo1r/Bloomshot. Work on a branch and open every pull request against `main`. Do not stack pull requests on each other: Trevor merges from his phone, and on October 3 three stacked PRs merged into a feature branch instead of `main`. Never force-push `main`.
- Layout: `bloomshot/` is the game, `native/` the Capacitor Android/iOS shell, `docs/` release and store notes, `.github/workflows/` CI, cloud builds and the GitHub Pages deploy.
- Web build: `.github/workflows/pages.yml` publishes `bloomshot/` to https://vexno1r.github.io/Bloomshot/ once Pages is enabled with Source set to GitHub Actions (a setting only Trevor can change).
- `VexNo1r/harborline` is Trevor's separate lead-recovery product. The game never goes there.

## Saves (never reset)

Normal save `bloomshot.save.v1`; `?qa` uses `bloomshot.qa.v1`. Trevor plays in both. New fields are always additive and old saves load unchanged. Fields added since the last handoff: `keepsake` (the worn seed style, default `meadow`), `daily` (per-day records, latest 14), `garden.dailyBest` (stars per daily garden, latest 21), `garden.bouquets` (weeks already paid, latest 8), `rush.bestWave`. In the native app `native.js` mirrors every save to Capacitor Preferences and restores it if the OS wipes web storage.

## What changed, passes 5 to 8

**Pass 5, Garden Keepsakes.** Seed styles that change the seed, its trail and bloom particles, never physics. Meadow is free, Moonlit is earned by clearing all six Moon trials and never sold, and Sakura Breeze, Firefly Night and Gilded Leaf come together as the Keepsake Collection (`bloomshot.style.collection1`, entitlement `style_collection1`). Every style previews in motion on the Collection screen before it is earned or bought. A locked or refunded choice shows Meadow without erasing the saved choice. Code: `keepsakes.js` (catalog and unlock rules), `art.js` (styled seeds, trails, four particle kinds), `app.js` (shelf, preview, Moonlit reward, one `buyProduct` for every product).

**Pass 6, Rush tempo.** Each cleared wave raises the tempo by ×0.1, up to ×2: flowers descend faster, reload is quicker, and every bloom scores more. Clearing a wave shows a golden "Wave clear!" moment with the next tempo, and pressure keeps climbing the longer a run lasts. `rush.js` holds the numbers; `qa/test-rush.cjs` checks them.

**Pass 7, Launch Bundle offer.** `bloomshot.bundle.launch1` grants Koi and the Keepsake Collection in one purchase. It is shown only to a player who owns neither part, only when the store says it is on sale, with its price and the exact saving when the store reports comparable amounts (otherwise it says "less than buying both" with no number). Owning one part offers only the other part.

**Pass 8, the daily garden pays.** A daily garden's first clear pays 6, 8 or 10 seeds by stars, and each later new star pays 2. Any four daily clears in a Monday-to-Sunday week pay a 12-seed bouquet once. A missed day takes nothing away and nothing counts down. Every seed reward on the result screen names the next thing to plant or grow. Logic in `garden.js` (`grant` with `mode: 'daily'`, `week`).

**Native bridge (shipping thread).** `native.js`: real haptics through Capacitor Haptics (iPhone ignores `navigator.vibrate`), and the Preferences save mirror described above. `app.js` calls `haptic(kind)` for every buzz; any new buzz must call `haptic()` too, never `navigator.vibrate`, or iPhone stays silent. Neither haptics nor the save mirror has been tested on a real phone yet.

## Storybook redesign

The October 4 redesign replaced the whole interface. Rules for every later pass:

- **Type.** Two self-hosted open-source fonts in `assets/fonts/` (SIL Open Font License): Fredoka for titles, buttons, tags and canvas text, Nunito for body text. No system-ui on canvas, no other fonts.
- **No tracked uppercase.** No small spaced-out capital "eyebrow" labels and no letter-spaced canvas text. Tags are pill `.card-tag`s in sentence case.
- **Short game labels.** "Garden clear!", "Perfect!", "Wave 3 · ×1.2", "Get all three · $1.99". Cut any sentence that explains a feeling ("Beautiful chaos", "Room to grow"). Hints are a few words. Prices and what a purchase contains stay exact.
- **Chunky tactile UI.** Pill buttons with a solid darker bottom edge that presses down (green primary, gold for purchases, cream secondary), cream panels with an inked edge, ribbon titles with notched tails, filled tab icons. Colors are tokens at the top of `styles.css` (`--green*`, `--gold*`, `--pink*`, `--sky*`, `--cream`, `--edge`, `--ink`).
- **No AI-generated raster art in the UI.** The two image-generator PNGs were removed. Interface graphics are CSS and inline SVG; `assets/ui/lock.svg` is the padlock. `ART-PROVENANCE.md` records this honestly; keep it accurate.

Screenshots of every screen, and before/after sheets, are in `docs/screenshots/storybook/`.

## Code map

| File | Responsibility |
|---|---|
| keepsakes.js | Seed style catalog, unlock rules, product and entitlement ids |
| koi.js | Eight Koi boards, product and entitlement ids, free-board count |
| garden.js | Seeds, plots, rewards for every mode, daily and weekly bouquet |
| engine.js / rush.js | Puzzle physics with currents and gates; endless Rush with tempo |
| art.js | All canvas art: scenery, flowers, seeds and styles, particles, callouts |
| app.js | Screens, HUD, results, offers, chapters, keepsake shelf, game feel |
| native.js | Haptics and the native save mirror (shipping thread) |
| store*.js | Purchases (shipping thread; send requests instead of editing) |

Script order: store-config → store → levels → moon → koi → keepsakes → garden → engine → rush → art → meadow → sound → native → app → store-ui → pwa. `sw.js` ASSETS lists every shipped file, including the two fonts and `lock.svg`; bump `VERSION` whenever an asset changes (the Pages build replaces it with a content hash). The native copy step derives its file list from ASSETS.

## Verification

From `bloomshot/`, every suite must exit 0 (CI runs the same list in `.github/workflows/web-tests.yml`):

```text
node qa/test-engine.cjs
node qa/test-rush.cjs
node qa/test-pwa.cjs
node qa/test-sound.cjs
node qa/test-garden.cjs
node qa/test-save-integration.cjs
node qa/test-moon-engine.cjs
node qa/test-moon-levels.cjs
node qa/test-precache-streams.cjs
node qa/test-store.cjs
node qa/test-native.cjs
node qa/check-moon-pointer.cjs
node qa/test-koi-levels.cjs
node qa/test-keepsakes.cjs
```

Then in `native/`: `npm ci && npm run sync && npm run check`. Running the suites rewrites several `qa/*-results.json` files with new timestamps; commit only the ones your change actually affects. None of this is physical-device proof.

## Store state

Koi (`bloomshot.world.koi`, $4.99), Keepsake Collection (`bloomshot.style.collection1`, $1.99) and Launch Bundle (`bloomshot.bundle.launch1`, $5.99) are all `available: false` in `store-config.js`. Flip one only after a sandbox purchase and restore work for it. RevenueCat keys stay empty until Trevor's store accounts exist; he cannot pay the Apple ($99/yr) or Google ($25) fees until his next paycheck. Read `docs/STORES.md` and `docs/MOBILE-RELEASE.md`.

## What to do next

1. Get Trevor playing the redesigned build on his phone through GitHub Pages and ask what feels slow, unfair or flat.
2. When store accounts exist: products, RevenueCat entitlements, sandbox buy, cancel, restore and refund, then flip products to available one at a time.
3. More content in the order of the monetization plan: new earnable keepsakes and worlds; boosters only if earnable in play and never sold as relief from designed frustration.
4. Keep every new screen and line of text to the Storybook rules above.
5. Update this file at the end of every fourth pass.
