# Canvas art review

The boss and scene-life review tools render the game's current Canvas code in installed Chromium, with repository files served directly into an isolated browser. They create labelled QA evidence in the workspace `outputs/` folder. These review artifacts are separate from the store upload graphics and the gameplay promotional clip.

- `bloomshot-boss-art-review.png` shows all ten actual authored boss encounters, waiting and after a launched seed. Unrelated escort buds are omitted only in this labelled silhouette review. Real boss parts, summons and hazards are retained.
- `bloomshot-scene-life-review.png` shows every full painted scene and enlarged pixels of its two occasional visitors.
- `bloomshot-scene-life-review.mp4` is a silent 24-second motion study. Two panels show the two scheduled visitors of each level, with ten levels in order. It uses the production `drawGarden` and `drawSceneLife` APIs; it is not the game's music-backed promotional preview.
- The matching JSON manifests record exact source hashes, browser version, capture method and measured draw times. The motion study is decoded at ten timestamps to verify different, nonblank frames. Reduced motion is checked by reading the cleared overlay's pixels.

The scene-life regression checks cover deterministic scheduling, long quiet intervals, at most two visitors, positions away from the central play area, balanced drawing state on phone/tablet sizes, fully cleared reduced-motion output and bounded sprite reuse. The cached visitors consume approximately 2.3 MB of decoded surfaces and add no new gradients or illustration paths to warmed frames. Browser draw measurements are desktop evidence; actual phone performance still requires native testing.

The boss checks exercise all ten actual encounter controllers and verify that drawing leaves colliders untouched. Hidden bodies and broken parts stay absent, the Starseed's inherited legacy shell flag adds no fossil armor, and ignited Ember escorts follow the real controller's effect clock and expiry.

The narrow projectile review preserves the falling flower clusters, gift bubbles and launcher because their existing silhouettes and feedback already read clearly at phone size. The ordinary shot alone gains the loaded almond seed's shaded center and incised seam inside its existing colored circular boundary. The five small body sprites total 40,500 decoded bytes. Seed-specific checks cover finite drawing, unchanged collision/trail inputs, the unchanged round boundary, cached reuse, reduced motion and separate keepsake/power branches.

The fullscreen effects review found a real rectangular light seam in an Ember Hollows capture. Replaying that exact paused state with only tempo removed eliminated the seam; the bloom flash was zero in that frame. The same pixel probes found nontransparent board-edge pixels in the bloom flash and danger/finale veils. The transparent foreground now fades only these background light layers through one cached mask and scratch surface (1,881,600 decoded bytes total). Flowers, seeds, warnings and colliders retain their own rendering. The ordinary framed renderer keeps its previous commands. `outputs/bloomshot-fullscreen-effects-final/` preserves the before/after pair and source hashes; `review-fullscreen-effects.cjs` repeats the real-state isolation and fails if any tested light layer paints an opaque board edge.

`outputs/bloomshot-seed-review/` contains paired phone captures and their exact source/state manifest. For this labelled QA comparison, both pictures use one live engine state and visual clock, with a browser-only switch between the prior and current production projectile body. CSS animations are disabled to prevent unrelated interface pixels from changing between captures. A guaranteed gift roll uses the existing gift controller with a QA probability of one, so its real bubble, bow and contained power icon can be inspected without constructing a fake object. These are comparison evidence, not final store uploads or native-phone captures.

From the repository root, using the bundled Node dependencies:

```powershell
$env:NODE_PATH='C:/Users/Trevor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
$node='C:/Users/Trevor/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $node bloomshot/qa/test-scene-life.cjs
& $node bloomshot/qa/test-boss-art.cjs
& $node bloomshot/qa/test-seed-art.cjs
& $node docs/store/graphics/review-scene-life.cjs
& $node docs/store/graphics/review-boss-art.cjs
& $node docs/store/graphics/review-fullscreen-effects.cjs
```

Artwork provenance is recorded in `bloomshot/ART-PROVENANCE.md`. Every illustrated path is game-native code; no raster-generation service, stock image or photo is used. Final store captures should be rerun once gameplay and UI sources are frozen, because their manifests reject any source change during capture.
