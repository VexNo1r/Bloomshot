# BLOOMSHOT

A mobile-first botanical arcade game with Meadow Rush, a persistent illustrated meadow, 18 garden puzzles and six free Moon trials. Code and art are AI-assisted.

## Play

The owner-private playtest address is shared with Trevor in the project chat; sign in with the owning account. The exact deployed version is recorded in `WEB-RELEASE.json`; source changes in an open pull request are not automatically deployed. This is a private web release, not an App Store or Google Play release. Purchases are built and unit-tested but switched off: nothing is on sale anywhere, and the web version never sells (see `../docs/STORES.md`).

To run locally from this folder:

```powershell
node server.cjs
```

Open http://127.0.0.1:4387/ . Reuse an existing server; an optional port is `node server.cjs 4388`. The server binds only to localhost. A physical phone must use the hosted HTTPS link. No dependencies or build step are required. Restart the server after editing its MIME types.

## Play controls

- Rush: drag above the seed, or drag from the seed toward your target, then release one ball. The pod holds 4 seeds, fired no closer than .15 s apart; each flower a seed damages within 1.6 s of launch returns half a seed, once per flower per flight (guarded contacts share one quarter-seed allowance), and an empty slot regrows in 6x the wave reload (about 3.4 s on level 1). While the pod is empty the aim line is hollow: an aim held .2 s or more and let go up to .6 s before the next seed waits for it and fires. Let go sooner and the aim stays on the board; one quick tap on or near that line sends it once the seed is in, and a tap anywhere else aims there instead.
- Flowers descend after the first shot. Three breached clusters end the run.
- Gold relay flowers affect two neighbors. Six direct hits charge the manual Split, which adds two balls. Five balls maximum.
- Turn the leaf to redirect shots; two seconds between turns.
- In levels and Rush, the four powerup buttons sit directly above Split. Catch free gift bubbles on even regular waves for more; no purchases happen during play.
- Keyboard: arrows aim, Space/Enter fires, S splits, R turns the petal.
- Garden lets you plant six permanent flower patches with earned seeds. Its Garden puzzles section opens 18 three-volley puzzles; Collection shows earned flowers. Play resumes the current game. Start/switch to Rush through Play Meadow Rush in Garden.
- Moon has six playable trials with real paired gates that teleport a seed and rotate its direction. Each trial gives five single seeds, with no guidance or automatic extra balls. Matching gate marks, entry/exit pulses and a soft chime make crossings readable. New Moon stars earn seeds for your permanent meadow.
- Browsing, dialogs, hidden tabs, and short landscape screens pause play. Completed records save locally; unfinished runs do not survive a reload.

## Install and updates

Settings contains home-screen installation guidance, offline download status, and a Restart and update button when a new release is waiting. Updating preserves saved scores and restarts the run. iPhone/iPad use Safari's Share / Add to Home Screen; Android uses its browser installation option when available. Local browser offline reload and explicit updating passed. Physical-device and hosted-private installation are not yet verified; see the handoff for evidence.

## Verify

```powershell
foreach ($f in Get-ChildItem qa/test-*.cjs) { node $f; if ($LASTEXITCODE) { throw "FAILED: $f" } }
node qa/check-moon-pointer.cjs
```

Every suite must exit 0: 30 suites as of October 15, 2026, the same list CI runs in `../.github/workflows/web-tests.yml`. Running them rewrites several `qa/*-results.json` files; commit only the ones your change affects. Then, from `../native/`: `npm ci && npm run sync && npm run check`. These checks do not establish physical-device performance, perceived audio quality, fun, retention or revenue. The latest gameplay changes and evidence are described in `../docs/PLAYTEST-2026-10-15.md`.

Read `CLAUDE-HANDOFF.md` for the technical map and `../docs/LAUNCH-PLAN.md` for who does what next. `ART-PROVENANCE.md` contains the art provenance, UI prompts and generation modes. Moon is a free playable chapter; the Koi Conservatory has eight pools, the first two free and the rest behind a purchase that is not on sale yet.

## Your meadow

Choose one of six patches and plant your four starter seeds. Each patch grows through three visible stages costing 4, 8 and 14 seeds. Completed Rush runs and newly earned Garden and Moon stars earn seeds; previews and unfinished runs do not. Planting pairs a short visual reveal with a four-note chime. Meadow growth does not make shooting easier and saves alongside your scores.

## Native source

Android and iOS source projects live in `../native/` (Capacitor 8). Read `../native/README.md` before building. Earlier revisions compiled in GitHub Actions; the unsigned iOS simulator build at `06ae817` succeeded before the October 15 gameplay follow-up. The current follow-up passes source synchronization and 34-asset checks for both platforms; current compilation, simulator launch, real-device play and sandbox purchases remain unverified. No store account exists and nothing is on sale.
