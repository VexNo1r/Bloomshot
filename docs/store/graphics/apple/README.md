# Apple screenshots

Release gate: these are October 14 review drafts. The October 15 boss flower effects and new spell cues were added afterward. Retake from Trevor's approved final build before uploading; the current-source validator is expected to reject the old capture fingerprints until then.

Capture status: all ten requested images were regenerated and validated October 14, 2026 against the frozen game sources. The manifest identifies the exact source and PNG hashes. Owner review, native testing and App Store Connect validation remain release checks.

The requested final set is ten iPhone screenshots in `iphone-1290/`, one actual gameplay frame from each campaign level. Every PNG is 1290 × 2796 opaque RGB, rendered at a 430 × 932 browser viewport with a 3× pixel ratio. There are no added prices or captions.

This accepted dimension was checked October 12, 2026 against [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications). Check App Store Connect's device slots before submission; any additional required device class still needs its own capture. Earlier supplementary-size drafts have been preserved outside the repository under the workspace's `outputs/bloomshot-store-drafts/2026-10-14/apple/` folder and are not upload deliverables.

Run from the repository root:

```text
node docs/store/graphics/capture-google-play.cjs apple-iphone-1290
node docs/store/graphics/validate-store-media.cjs
```

The script requires Playwright, Sharp and Chromium. `NODE_PATH` can use the bundled Codex dependencies shown in the Google Play README. The manifest records the base Git commit, exact working-tree source hashes, viewport, browser and image hashes, and the script fails if game sources change during capture.

A disposable QA/mockstore profile and browser-only hook open existing authored levels; the shipped game is untouched. These are browser captures of the game UI, not iOS simulator or real-device screenshots. Native safe-area behavior still needs device verification.

The local promotional MP4 is a general/Google Play asset. It does not claim Apple's device-sized app-preview compliance. Apple's [app-preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/) define separate video dimensions and audio requirements.
