# Bloomshot launch plan: who does what, in order

Written October 12, 2026 by Claude from a fresh clone of `main` (commit `acedd16`). It replaces the "What to do next" list at the end of `bloomshot/CLAUDE-HANDOFF.md`; that file stays the technical map of the game. Two assistants work on this game, Claude (claude.ai/code, in this repository) and Codex (ChatGPT, on Trevor's PC and the `bloomshot-site` hosting). This page is the one list both work from. Trevor owns the money, the accounts and every decision.

## Verified on October 12

- `main` passes all 24 QA suites and the Moon pointer check locally and in CI. The native packaging check matches 32 assets. The native shell has not been compiled since October 3, before the background, color, fun, tutorial and growth passes; both cloud builds were started again today from `main` (Actions tab: "Android debug APK" and "iOS simulator build").
- The game runs clean in headless Chromium at 360, 390 and 820 px wide: every tab, a level, powerups, Restart, Settings, How to play and the tutorial replay, with no console errors, warnings, failed requests or page errors.
- The game is live nowhere a phone can reach: GitHub Pages is still off (the Pages workflow only builds as a check), the ChatGPT-hosted copy at `bloomshot-meadow.trevor-owens1996.chatgpt.site` is the October 2 build (its source repo `bloomshot-site` has not changed since), and there is no Android release because the upload key has not been made.
- Pull request 27 (the seed pod) is open, green and reviewed: one small hint bug was fixed on the branch and `main` was merged in, so it merges cleanly.

## The money path, plainly

Nothing can be sold until a store has approved the app, and no store has been paid for. The order that reaches the first dollar soonest:

1. Google Play first: new personal accounts must run a closed test with 12 testers for 14 days before production. That clock is the longest wait, so start it before anything else is perfect. Realistic first sale: three to five weeks after Trevor pays the $25 and the 12 testers are in.
2. Apple second ($99 a year): TestFlight and sandbox purchases need it; iOS players spend more per head, so it is worth doing right after Android is in its closed test.
3. The web version is free marketing: once GitHub Pages is on, anyone can play from a link and the share buttons send people there. It sells nothing, so it must point to the store listings once they exist (`BloomNative.link` in `native.js` already does this for Android).

What to expect: a casual game with no marketing budget converts roughly one to three players in a hundred to a purchase. The money comes from reach (the public web link, share results, short clips of real play) and from a listing that shows the game at its best. The products are already honest and already built; do not add timers, scarcity or paid randomness to chase revenue, the stores and the players both punish it. Ads were ruled out by Trevor; revisit only with 30 days of real numbers, never before launch.

## Trevor: about two hours, all of it only he can do

| # | Do this | Why | Where |
|---|---|---|---|
| T1 | Play the current build on your phone and the seed-pod build from PR 27, then merge PR 27 or say what to change | Nothing beats your own hands on the levels; the pod changes how every level feels | Playtest link from Claude (private, sign in) |
| T2 | Repo Settings, Pages, Source: **GitHub Actions** | One click. Every push to `main` then publishes the game at `https://vexno1r.github.io/Bloomshot/`, the tester and share link until the stores exist | GitHub, Bloomshot, Settings |
| T3 | Pay the Google Play Console fee ($25), Personal account, identity check, sign in to the Play Console app on an Android phone | Starts the only clock that matters | `docs/PLAY-LAUNCH.md` step 1 |
| T4 | Payments profile: bank and tax | No product can be created without it | `docs/PLAY-LAUNCH.md` step 2 |
| T5 | Make the upload key: one `SETUP_TOKEN` secret, run "Create Android upload key" once | Every signed Android build needs it; takes 10 taps | `docs/PLAY-LAUNCH.md` step 4 |
| T6 | Give Claude or Codex an effective date and a public contact email for the privacy policy | Both stores require a hosted policy; two blanks block the page | `docs/store/PRIVACY-POLICY.md` |
| T7 | Confirm the app id (`dev.bloomshot.game` or another) before the first upload | The first upload to any track claims it for good | `docs/MOBILE-RELEASE.md` |
| T8 | Line up 12 people with Android phones and collect the Gmail they use on Google Play, plus 3 spares | The closed test cannot start without them, and the 14 days restart if the count drops | `docs/PLAY-LAUNCH.md` step 7 |
| T9 | Create a free RevenueCat account | Purchases go through it; needed before the purchase test | `docs/STORES.md` |
| T10 | Later: Apple Developer Program ($99) | TestFlight, sandbox purchases, the App Store | `docs/MOBILE-RELEASE.md` |

## Codex: the hosting, the graphics and the PC-side work

Codex owns the `bloomshot-site` repository and the ChatGPT-hosted copy, the store graphics, and anything that needs Trevor's Windows PC or a real phone in the room. Each task is a branch and a pull request against `main`, named `codex/...`, never stacked.

| # | Task | Done when |
|---|---|---|
| C1 | **Refresh the hosted copy.** From `main`: `node .github/scripts/build-pages.cjs`, deploy `_site/` to the chatgpt.site project, commit the new `dist` to `bloomshot-site`, and update `bloomshot/WEB-RELEASE.json` (`source_commit`, `confirmed_at`, `version_id`). Ask Trevor whether to make it public so testers can open it until Pages is on | The hosted link runs the current game and WEB-RELEASE.json says which commit |
| C2 | **Retake the Google Play graphics** from the current game: the four 1080 x 1920 phone screenshots (level map going underground, Sunny Meadow mid-shot, Glowworm Lake or Crystal Caves mid-shot, the Starseed Core boss or a powerup in action) and the 1024 x 500 feature graphic, replacing `docs/store/graphics/google-play/`. No text or prices on them | `docs/store/LISTING.md` no longer says the screenshots predate the campaign |
| C3 | **Record the preview video**: 15 to 30 seconds of real level play, the game's own music, no narration; upload unlisted to YouTube for the Play listing and keep the file for Apple | A link in `docs/store/LISTING.md` |
| C4 | **Fill the privacy policy** once Trevor gives T6: replace the two bold blanks in `docs/store/PRIVACY-POLICY.md`; the Pages build then publishes `/privacy/` by itself | The page loads on a phone at `https://vexno1r.github.io/Bloomshot/privacy/` |
| C5 | **Real Android device test**: install the debug APK from the Actions run on an Android phone, play levels 1 to 4, the tutorial, Meadow Rush, one Moon trial, with sound; report touch feel, frame rate, audio, pause and resume, back button, and anything ugly, as GitHub issues with screenshots | The first real-device report exists; `docs/MOBILE-RELEASE.md` "Not verified by anyone yet" can be shortened |
| C6 | **Play Console data entry with Trevor**: paste `docs/store/LISTING.md`, answer the content rating, data safety and ads questionnaires exactly as LISTING.md says | The dashboard setup tasks are complete |

## Claude: the code, the tests and the handoff

| # | Task | State |
|---|---|---|
| K1 | Review PR 27, fix what it finds, merge `main` into it so it merges cleanly | Done October 12 |
| K2 | Start the Android debug and iOS simulator cloud builds on current `main` and read their results | Started October 12 |
| K3 | Publish a private phone-playable build of `main` and PR 27 for Trevor | Done October 12 |
| K4 | Fix whatever T1 and C5 find, retuning with `qa/depths-bot.cjs`, never by feel alone | Waiting on play reports |
| K5 | When T9 exists: put the Android public SDK key in `store-config.js`, flip `bloomshot.levels.full` to available, run "Android release bundle", walk Trevor through the sandbox buy, cancel, restore and refund checks in `docs/STORES.md` | Waiting on T3, T4, T5, T9 |
| K6 | Keep `bloomshot/CLAUDE-HANDOFF.md` and this page current after every merged pass | Ongoing |

## Working rules for two assistants in one repository

- Start every task from a fresh `main` (`git fetch origin main`), on your own branch, and open a pull request against `main`. Never stack a pull request on another; never force-push `main`. Trevor merges from his phone, so a pull request must merge cleanly and its description must say what to play to see the change.
- Run every `node qa/test-*.cjs` suite and `node qa/check-moon-pointer.cjs` from `bloomshot/` before pushing a game change, then `npm ci && npm run sync && npm run check` in `native/`. Commit only the `qa/*-results.json` files your change affects.
- Ownership, to avoid stepping on each other: Codex owns `bloomshot-site`, `docs/store/graphics/`, `bloomshot/WEB-RELEASE.json` and real-device reports. Claude owns game code, tests, `native/` and `CLAUDE-HANDOFF.md`. Either may edit `docs/` by pull request. Say in the pull request when you touch the other's files.
- Keep the Storybook rules in `CLAUDE-HANDOFF.md`: Fredoka and Nunito only, no tracked uppercase, short labels, painted scenes from the kit in `scenery.js`, no AI-generated raster art, `ART-PROVENANCE.md` kept true.
- Never: reset or migrate away a save, add ads or tracking, change a price without Trevor, offer a purchase mid-run or after a loss, claim a device test or a store step that did not happen. "Compiled", "ran on a phone" and "sandbox purchase passed" each need evidence in the pull request.

## Decisions only Trevor can make

1. PR 27, the seed pod: merge, or change. It was built on his own feedback that spamming shots made the game too easy.
2. The app id, before the first Play upload (T7). `dev.bloomshot.game` works on Google Play; Apple needs it unique, not owned. Pick once.
3. Launch prices stay as built: $2.99 for levels 5 to 10, $6.99 for the Complete Garden, $4.99 Koi, $1.99 Keepsakes, $0.25 powerups ($0.29 on iOS). Google Play price experiments can test $3.99 later with real data.
4. Whether the hosted web copies (chatgpt.site and GitHub Pages) are public now. Recommendation: yes. The web version sells nothing and a public link is how testers and friends find the game.
