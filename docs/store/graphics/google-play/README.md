# Google Play graphics

Capture status: regenerated and validated October 14, 2026 against the frozen game sources. The manifest identifies the exact source and PNG hashes. These listing assets still need owner review and the release checks before public submission.

The eight phone images cover all ten campaign levels. Six are direct screenshots (Sunny Meadow, Crystal Caves, Glowworm Lake, Ember Hollows, Briar Vault and Starseed Core). Two are clearly framed marketing composites of actual gameplay crops: Root Tunnels with Mushroom Grotto, and Fossil Beds with Geode Mine. These pairs add only the actual level names in the game's Fredoka font. No prices or invented UI/mechanics are added. Every upload PNG is 1080 × 1920 opaque RGB. Upload the eight `phone-*.png` files in filename order.

`extras/level-map.png` is an optional map screenshot. `source-captures/` preserves the original whole-phone images behind the two composites; these are supporting evidence, not extra uploads beyond Play's eight-image limit. The Apple 1290-pixel set shows each level separately.

The 1024 × 500 feature graphic is a wide crop of the game's own Sunny Meadow renderer with no added lettering or prices. The video-banner copy uses the same scene. `icon-512.png` is unchanged.

The dimensions, eight-image limit and opaque PNG format match [Google's current preview-asset specifications](https://support.google.com/googleplay/android-developer/answer/9866151).

`CAPTURE-MANIFEST.json` records the base Git commit, hashes of the captured game source, browser version, viewport and individual image hashes. The source hashes identify the exact working-tree content even before its release commit is made.

Capture from the repository root:

```powershell
$env:NODE_PATH='C:/Users/Trevor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
& 'C:/Users/Trevor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' docs/store/graphics/capture-google-play.cjs
& 'C:/Users/Trevor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' docs/store/graphics/validate-store-media.cjs
```

The capture uses an isolated browser profile and the QA save, with mock ownership solely to open paid scenes. A browser-only export starts existing authored waves; no game file is changed. Every resource is served from repository bytes through Playwright request fulfillment, avoiding stale service workers and external networking. Seeded chance and a virtual clock keep each chosen moment repeatable. The script checks dimensions and absence of transparency, and fails if game sources change during the capture.

The captures show production game rendering in Chromium. They are not evidence of Android hardware testing or working store purchases.

`validate-store-media.cjs` checks both requested screenshot sets, their exact current-source hashes, image hashes, RGB opacity, dimensions, ten-level coverage and absence of stale screenshot filenames. It writes separate contact sheets and `STORE-MEDIA-RESULTS.json` under the workspace's `outputs/bloomshot-store-final/` folder. Those sheets are review evidence, not upload images.

The separate `capture-preview.cjs <output-directory>` records an approximately 28-second H.264/AAC promotional clip of the actual board and original game music/effects. It verifies file transfer, video and audio decoding, duration, frame dimensions and audible output. Its board-only dimensions differ from Apple's app-preview specifications; use it for general promotion or a Play listing's YouTube video after upload authorization.

The current preview was recorded October 14, 2026 into the workspace's `outputs/bloomshot-store-final/` folder. `bloomshot-preview.mp4` is 1080 × 1440 with a decoded duration of 27.9872 seconds; the adjacent manifest records exact game-source and file hashes. H.264 video, stereo 48 kHz AAC audio, transfer integrity and decoded frames at 2, 10, 18 and 24 seconds passed. Those four frames were visually inspected. This local file has not been uploaded to YouTube, and it is not an Apple device-size app preview.
