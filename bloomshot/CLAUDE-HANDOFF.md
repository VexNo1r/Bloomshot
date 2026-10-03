# BLOOMSHOT — Claude handoff

Updated October 2, 2026 (Pacific). Current pass: six playable Moon trials, paired-gate physics, coordinated gate art and sound, permanent meadow rewards, private web publication and synchronized native source. Keep both handoff copies identical and rebuild the bundles after every pass. No message was sent to Claude; this document is for the user to share.

## Start here

The user wants a beautiful, vibrant mobile game with deliberate control, lasting progress, real challenge and optional purchases people value. Earlier builds were rejected as boring, too easy and too automatic. The interface should itself feel like thematic art. Animations must look and sound pleasing. Current art and balance still need the user's feedback. Code and art are AI-assisted; never claim a human team made them.

Approved order: mobile website proof, then App Store and Google Play work immediately afterward. The overall goal remains active until iPhone, iPad and Android releases support real revenue. A private web preview and native source projects do not complete that goal. Apple/Google developer accounts and Mac access were asked about; the user has not answered. Do not invent an answer or repeatedly ask the same question.

## Exact deliverables

Workspace: `C:/Users/trevo/Documents/Codex/2026-10-02/idea`

- Authoritative game: `outputs/bloomshot`
- Main handoff: `outputs/CLAUDE-HANDOFF.md`; identical copy inside the game folder
- Complete game bundle: `outputs/BLOOMSHOT-Claude-handoff.zip`
- Native source: `outputs/bloomshot-native`
- Native bundle: `outputs/BLOOMSHOT-native-source.zip`
- Hosting checkout: `outputs/bloomshot-site`
- Private play URL: https://bloomshot-meadow.trevor-owens1996.chatgpt.site

Private publication succeeded at 2026-10-03T02:44:00Z (October 2, 19:44 Pacific):

- Project: `appgprj_6ac04fc69fa881919f50dedb89a70cd6`
- Deployment: `appgdep_6ac06be95a10819191e10f8774a54fea`
- Version: `appgprj_6ac04fc69fa881919f50dedb89a70cd6~appgver_11582ca3b7988191bab8cdcdcf742637`
- Pushed source: `3d12655f71f9a1d366c3cceee4f9ad44e795a286`
- Worker version: `dd9f6269858015fa`

The native Sites result confirmed publication. Audience remains owner-private; sign in with the owning account. Hosted phone gameplay, private authentication while offline and actual home-screen installation remain unverified. No payments or store submission occurred. `WEB-RELEASE.json` records the distinction. Reuse this Site; do not create a duplicate or change its audience without instruction.

## Run locally and preserve saves

From `outputs/bloomshot`, run `node server.cjs`, then open http://127.0.0.1:4387/ . Task-owned server session 12304 was restored after the offline check. Verify it is still running before starting another. Optional port: `node server.cjs 4388`. Port 4173 is unrelated. The server is localhost-only; phones should use the hosted HTTPS link. No web dependency install or build is required.

Normal save: `bloomshot.save.v1`. URL `?qa=1` uses `bloomshot.qa.v1`. Neither is disposable: the user also plays in QA. Never reset these to simplify a test. Local, hosted and native origins have separate saves; there is no cloud save or migration. Unfinished runs remain in memory only.

Current QA save after real play: Rush best 2,100 and 21 cumulative blooms; two cleared Meadow gardens/six stars; Moon trial 1 cleared with three stars and 3,200 points; Moon trial 2 unlocked, later trials locked. Moon's 12-seed reward raised the existing balance from one to 13. Growing Sunbell cost eight, leaving five seeds and Sunbell at stage two; the other five beds remain empty. Reload preserved all of it. Normal saves were not reset or injected.

Backups under `work`: `pass2-baseline` (before Rush), `web-proof-baseline` (prior UI), `progression-baseline` (before meadow), and `moon-baseline` (app/catalog/garden/UI/worker before this integration). Native `www` and Site `dist` are generated copies, not authoring locations.

## What changed in this pass

Moon Garden is now an actual six-trial free chapter, opened through Worlds. Each trial has five single-seed shots, a seven-second seed lifetime, one optional petal turn between shots, no in-flight guidance and no automatic extra seeds. Gate routes and independent flowers provide challenge without padding flower health. Completed trials unlock the next; stars save separately from Meadow and award permanent meadow seeds. The final trial returns to the chapter path. Koi is the only remaining visual preview.

Paired gates transport a seed and rotate its velocity by the difference between gate orientations. Swept entry detection preserves speed and remaining travel in the tick. Exit clearance, a 0.12-second cooldown and a 12-passage limit prevent pathological loops. Invalid or unsafe gate pairs are ignored. The aim trace breaks at the teleport, then marks the exit direction rather than drawing a misleading connector across the board.

Gate art uses matching cyan/violet apertures, carved crescents, pearl rims, jade vines, pair marks and orientation notches. Passage pulses last 0.6 seconds and trigger bounded entry/exit particles plus a soft rising-fifth chime. Rapid cues are debounced. The existing detailed violet/cyan moon, lunar plains and crater shading are preserved. This is procedural AI-assisted art; provenance is documented.

The six boards are in `moon.js`: A Door in the Dark, Turn of the Moon, Crescent Relay, Crossed Stars, Petal Observatory and Lunar Waltz. Pars are 3, 2, 3, 3, 3, 3 shots. First boards have 12 buds; later ones reach 24. Early boards retain small two-flower links; later buds are independent. Short HUD hints and a scrollable illustrated trial path fit narrow screens.

Only new Moon stars grant rewards: first clear gives 8/10/12 seeds for 1/2/3 stars, then 2 per improved star. Immediate three stars and gradual one-to-three both total 12. Moon records and reward baselines are separate from Meadow. No paid content or entitlements are implemented; these six trials are free.

## Retained game and progression

Meadow Rush remains the default action mode. One seed per release, 0.65-second reload, four-second lifetime, at most five active balls. Flowers descend after the first shot. Three breached clusters end the run. Six direct hits charge a manual Split that adds two trajectories; cascades do not charge it. Gold crowned relays open at most two neighbors; cascaded relays do not propagate another relay. Petal turns have a two-second cooldown. Holding Space does not autofire.

Rush waves increase from 12 to 24 buds, descend faster and introduce two-hit flowers. Descent is capped at 32 logical pixels/second; seed speed at 650. Preserve player decisions and legible threats. User feedback, not solver success, must determine whether it is challenging and fun.

The separate Meadow puzzle campaign has 18 boards and 938 total buds, three volleys of three seeds, optional drag guidance, linked cascades and an earned automatic bonus. Those established rules are unchanged by Moon. Daily boards select from 12 later layouts. Collection flowers unlock with campaign completion. Do not describe all modes as single-seed games.

Garden has six persistent illustrated beds, path, pond, foliage and butterflies. Beds grow through three stages costing 4, 8 and 14 seeds. Four starter seeds are issued only when the garden field is absent. Players choose the bed; growth does not increase firing power. Planting has a 950 ms reveal, 28 bounded accents and a quiet four-note phrase; reduced motion displays the final state immediately. Meadow drawing is capped at 30 FPS while visible, and static when appropriate.

Rush rewards: `min(40, floor(blooms/4) + max(0, wave-1))`, minimum one for a positive-bloom run. Meadow and Moon first clears/new stars use the formula above. Daily boards do not currently award garden seeds. No unfinished run, loss or visual preview grants rewards. A 64-run receipt window plus per-mode star baselines prevent local duplicate awards. This is not secure purchased currency: never attach real money to local balances alone.

Menus, dialogs, hidden tabs and short landscape screens pause gameplay. World previews restore the original active run and reward receipt when closed. Changing game modes begins a new run. Existing progress survives settings updates. Malformed individual daily/Moon records are skipped rather than wiping the whole save.

## Code map

| File | Responsibility |
|---|---|
| index.html / styles.css | Responsive botanical shell, HUD, trial path, meadow controls and dialogs |
| app.js | Input, mode transitions, saves, rewards, HUD, effects/audio and results |
| engine.js | Meadow/Moon physics, gates, optional per-level rules and trace |
| rush.js | Descending action mode, formations, manual Split and breaches |
| moon.js | Six authored Moon boards and rule/route metadata |
| levels.js | Meadow boards, collection, worlds and daily selection |
| garden.js | Pure normalization, planting and reward accounting |
| meadow.js | Cached illustrated landscape and planting reveal |
| art.js | Flowers, detailed moon, gates, trails, bumpers and impact lettering |
| sound.js | Lazy Web Audio synthesis, event cues, bounds, shaping, mute and unlock |
| pwa.js / sw.js / manifest.webmanifest | Installation, offline shell and explicit updates |
| qa/ | Tests, route proofs, browser reports and design notes |

Script order: levels → moon → garden → engine → rush → art → meadow → sound → app → pwa. Physics uses 120 Hz fixed steps. Particles and voices are bounded. Sound uses warm mallet tones, gentle harmony/panning and at most 16 voices/32 oscillators. Mute fades scheduled notes; unlocking audio drops stale cues. No recorded soundtrack exists.

## Verification

Run from `outputs/bloomshot`:

```text
node qa/test-engine.cjs
node qa/test-rush.cjs
node qa/test-pwa.cjs
node qa/test-sound.cjs
node qa/test-garden.cjs
node qa/test-save-integration.cjs
node qa/test-moon-engine.cjs
node qa/test-moon-levels.cjs
node qa/check-moon-pointer.cjs
node qa/test-precache-streams.cjs
```

The first seven suites report 118 passing checks: 20 Meadow engine, 17 Rush, 20 worker, 12 sound, 20 garden domain, 14 whole-app save integration and 15 Moon engine. They ran against this pass. Whole-app tests use real game/domain classes with fake DOM/storage; they do not alter browser saves.

Moon route proofs are separate: all six recorded solutions match at 30, 60 and 144 FPS, use 3/2/3/3/3/3 shots and earn three stars. Every recorded route fails to clear when gates are removed. All 770 sampled opening shots leave flowers unbloomed. This does not prove optimality, a universal requirement to use gates or human difficulty. A stronger two-shot Moon 1 route is explicitly retained. Earlier easy Moon 4/6 routes still work on their preserved old geometry but bloom only 10/24 and 2/24 on the final boards. Read `qa/moon-design-notes.md` and the geometry controls before changing them.

Browser verification uses real pointer/keyboard controls and visible DOM state in Codex's in-app Chromium. No save injection or reset. Current report: `qa/moon-browser-results.json`. Narrow 320×568 and 390×844 layouts were exercised; the small layout has no horizontal overflow and the trial dialog scrolls. The current Moon chapter loaded after stopping the local server, confirming its module and assets were cached. The server was restored afterward. Screenshots are desktop viewport checks, not physical-device proof.

Important balance finding: the exact-angle Moon 1 teaching route was sensitive to integer pointer rounding. At the settled 390×844 layout, canvas rect (8,177,374,504.625), rounded second point (253,310) gave five total blooms instead of the solver's 11. A real Space shot followed by point (176,189) cleared in two shots, with five gate crossings, 3,200 points, three stars and 12 seeds, but that successful point is also narrow. Do not present this as a forgiving tutorial. Prioritize aim tolerance in the next pass, and read the pointer sensitivity report. Hint wrapping can slightly change canvas height, so always measure current geometry in UI tests.

`qa/check-moon-pointer.cjs` reproduces the discrepancy and verifies the integer route at 30/60/144 FPS. Only one of nine neighboring pixels clears that two-shot route. A bounded search did not establish a robust alternative; that is not proof none exists. Details: `qa/moon-pointer-sensitivity.md` and `.json`. This limitation is an explicit next-pass design priority.

Current screenshots: `moon-gates-preview.png`, `moon-trial-result.png` and `moon-earned-growth.png`. Previous `meadow-progress-preview.png`, `thematic-ui-preview.png`, `thematic-moon-preview.png` and `offline-play-preview.png` retain earlier UI/progression proof. Older images may show earlier geometry. Follow the current report rather than inferring release state from an old screenshot.

Audio stress submits 16,800 mixed events while respecting 16 voices/32 oscillators. Planting/gate scheduling, duplicate suppression, mute and cleanup pass. These tests do not establish pleasantness, phone loudness, perceptual audiovisual timing or physical-device audio latency. Listen on real speakers/headphones and obtain user feedback.

Streaming regression tests the actual worker with only three HTTP connections. The old headers-first negative control stalls at 3/21 headers. Current worker drains bodies independently, caches all 21 URLs including seven images and verifies every hash. Never reinstate a Promise.all barrier waiting for all headers before consuming image bodies. Failed installs preserve old cache.

## Native source

Capacitor 8.5.2 is pinned. Android Gradle and iOS Xcode/SPM source projects are generated and synchronized. All 18 native runtime assets, including `moon.js`, match authoritative source in `www` and both platform copies. Native shell excludes browser PWA installation UI/files and has no remote server URL.

From `outputs/bloomshot-native`:

```text
npm ci
npm run sync
npm run check
```

Keep it beside `bloomshot`. Do not edit generated copies. Read native `README.md` and `NATIVE-VERIFICATION.json`. The provisional ID `dev.bloomshot.game` is not claimed as owned/registered; confirm it before signing. No APK/IPA has been compiled, signed or installed. No billing or store submission exists.

The bounded local audit found no configured Android Studio, SDK, JDK or Gradle. No large SDKs were installed; about 8.8 GB disk remained in that audit. SideQuest ADB alone cannot compile. No Mac/Xcode access is established. Previously checked native prerequisites were Android Studio 2025.2.1+, JDK 21, SDK 36 and Mac/Xcode 26+; recheck official requirements when building. The developer-account/Mac question is still pending.

A scoped xcode→uuid 11.1.1 override addresses the checked CLI dependency advisory. Xcode parsing/UUID probes and `npm audit` passed previously; recheck when upgrading. This is not a full security review.

Native ZIP: 154 files, 5,751,024 bytes. SHA-256: `8fc33d114a5f55971f2209e605880c1c59ee151c70eb4e9c6db595883017cf2e`. CRC and every archived member hash were checked. Source, lockfile and Gradle wrapper JAR are included; node_modules, build/cache/signing files and local credentials are excluded. Repack with `python work/native-audit/package_native.py` after sync/check. Report: `work/native-audit/native-archive-report.json`.

## Publish and bundle the next pass

1. Reuse the Site project in `bloomshot-site/.openai/hosting.json`; static directory is `dist`. Use the Sites workflow open mode before editing hosted source.
2. Edit authoritative game files. Add runtime modules to `sw.js` ASSETS and matching worker tests.
3. Run `node work/prepare-release.cjs` from the workspace. It copies the runtime allowlist and hashes runtime plus worker logic into VERSION; docs/tests/server/screenshots stay out of the hosted app.
4. Follow the current Sites skill/workflow for exact-source Git push and archive. Keep credentials in memory/stdin only. On Windows, prepend `C:/Program Files/Git/bin` to process PATH and set process `TAR_OPTIONS=--force-local`.
5. Publish `work/bloomshot-web-release.tar.gz` from the exact pushed SHA with the owner-private operation. Preserve audience. Native success with URL confirms publication; do not invent success from a generic HTTP page.
6. Sync/check/repack native source after runtime changes. Update `WEB-RELEASE.json`, both handoffs and browser reports. Run `python work/package-handoff.py`, then verify CRC, every file byte and matching handoff copies. Keep native ZIP separate.

The worker validates MIME, rejects redirected/auth HTML, caches only scope-relative allowlisted GET resources and cleans only Bloomshot shell caches. Later releases wait for explicit Restart and update; they never reload an active player automatically. Browser cache/storage can still be evicted.

## What Claude should do next

1. Get physical phone play and listening feedback. Prioritize aim precision and gate readability, impact-to-note timing, dense-scene clarity, mute/reduced motion, interruptions, installation/offline and updates. Assess whether a finger can reproduce satisfying routes without pixel-perfect frustration. A solver clear is not a good-feeling game.
2. Tune challenge around readable choices: gate exit direction, alternate routes, endangered Rush clusters versus combos, and deliberate petal turns. Keep one-seed firing in Rush/Moon, manual Split and free retries. Record misses, first-loss wave and ability use in voluntary local playtest notes; adjust one variable at a time.
3. Playtest meadow progress: visible growth should feel worthwhile and 4/8/14 costs should create attainable goals. Connect spectacular results to meaningful earned changes, rather than simply raising particle counts. Preserve the art/UI relationship and detailed stylized moon.
4. Expand Moon into a complete premium-quality world beyond the free six-trial chapter. Gates now exist: build authored variety, distinctive flowers, progression and coordinated sound around them. The current six remain free. Koi currents and its authored content are still unbuilt; a reskin alone is insufficient paid value.
5. Build the existing native projects on configured machines after account/Mac details arrive. Confirm the owned app ID, produce debug builds and test them before signing/submission. Source generation is not an installable app. Do not regenerate everything from scratch.
6. Connect completed paid content to platform products, entitlement validation, delivery, restoration and refund handling. Verify sandbox purchases/restores before live billing. Owner agreements, banking/tax/payout steps require the owner's participation. Do not claim revenue before real payments work.

Purchase hypotheses, not live offers: permanent worlds with unique mechanics and authored levels (test range $3.99–$6.99); coordinated seed/trail/impact/celebration styles with honest previews ($1.99–$2.99); alternative play styles with explicit tradeoffs and dedicated challenges. Keep core tools earnable. Present truthful offers at completed milestones or through voluntary browsing. Avoid fake scarcity, misleading timers, paid randomness or deliberately unfair frustration to sell relief.

## References for release work

- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/android
- https://capacitorjs.com/docs/ios
- https://developer.apple.com/in-app-purchase/
- https://support.google.com/googleplay/android-developer/answer/9858738?hl=en
- https://support.google.com/googleplay/android-developer/answer/14151465?hl=en
- https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers

Verify requirements when acting. Enrollment, platform testing and review can prevent immediate publication even when development starts immediately. Keep the overall goal active.
