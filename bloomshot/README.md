# BLOOMSHOT

A mobile-first botanical arcade game with Meadow Rush, a persistent illustrated meadow, 18 garden puzzles and six free Moon trials. Code and art are AI-assisted.

## Play

Private hosted proof: https://bloomshot-meadow.trevor-owens1996.chatgpt.site

Sign in with the owning account. This is a private web release, not an App Store or Google Play release. Purchases are not implemented.

To run locally from this folder:

```powershell
node server.cjs
```

Open http://127.0.0.1:4387/ . Reuse an existing server; an optional port is `node server.cjs 4388`. The server binds only to localhost. A physical phone must use the hosted HTTPS link. No dependencies or build step are required. Restart the server after editing its MIME types.

## Play controls

- Rush: drag above the seed, or drag from the seed toward your target, then release one ball. Reload takes 0.65 seconds.
- Flowers descend after the first shot. Three breached clusters end the run.
- Gold relay flowers affect two neighbors. Six direct hits charge the manual Split, which adds two balls. Five balls maximum.
- Turn the leaf to redirect shots; two seconds between turns.
- Keyboard: arrows aim, Space/Enter fires, S splits, R turns the petal.
- Garden lets you plant six permanent flower patches with earned seeds. Its Garden puzzles section opens 18 three-volley puzzles; Collection shows earned flowers. Play resumes the current game. Start/switch to Rush through Play Meadow Rush in Garden.
- Moon has six playable trials with real paired gates that teleport a seed and rotate its direction. Each trial gives five single seeds, with no guidance or automatic extra balls. Matching gate marks, entry/exit pulses and a soft chime make crossings readable. New Moon stars earn seeds for your permanent meadow.
- Browsing, dialogs, hidden tabs, and short landscape screens pause play. Completed records save locally; unfinished runs do not survive a reload.

## Install and updates

Settings contains home-screen installation guidance, offline download status, and a Restart and update button when a new release is waiting. Updating preserves saved scores and restarts the run. iPhone/iPad use Safari's Share / Add to Home Screen; Android uses its browser installation option when available. Local browser offline reload and explicit updating passed. Physical-device and hosted-private installation are not yet verified; see the handoff for evidence.

## Verify

```powershell
node qa/test-engine.cjs
node qa/test-rush.cjs
node qa/test-pwa.cjs
node qa/test-sound.cjs
node qa/test-garden.cjs
node qa/test-save-integration.cjs
node qa/test-moon-engine.cjs
node qa/test-moon-levels.cjs
node qa/test-precache-streams.cjs
```

Automated reports total 118 passing checks: 20 campaign-engine, 17 Rush, 20 PWA/service-worker, 12 audio-graph, 20 garden-domain, 14 save-integration and 15 Moon-engine checks. All six Moon solution routes replayed at 30, 60 and 144 Hz. A search across 770 opening shots found zero one-shot clears; this is not evidence of human difficulty or balance. The constrained-download regression also passed. These checks do not establish physical-device performance, perceived audio quality, fun, retention or revenue.

Read `CLAUDE-HANDOFF.md` for the release state, exact hosting source, tests and next priorities. `ART-PROVENANCE.md` contains the art provenance, UI prompts and generation modes. Moon is a free playable chapter; Koi remains a visual preview with Meadow geometry. The release sequence is mobile web proof, then iOS/Android packaging and real optional purchases.

## Your meadow

Choose one of six patches and plant your four starter seeds. Each patch grows through three visible stages costing 4, 8 and 14 seeds. Completed Rush runs and newly earned Garden and Moon stars earn seeds; previews and unfinished runs do not. Planting pairs a short visual reveal with a four-note chime. Meadow growth does not make shooting easier and saves alongside your scores.

## Native source

Android and iOS source projects are prepared in the sibling `bloomshot-native` folder and separate `BLOOMSHOT-native-source.zip`. Read its README before building. Generation and sync passed; no APK/iOS app was compiled or installed, no billing was added, and store publication remains outstanding. Keep both folders side by side for native sync.
