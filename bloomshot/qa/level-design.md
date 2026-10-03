# BLOOMSHOT action-garden content

## Current delivered content

- The catalog in outputs/bloomshot/levels.js exports levels, flowers, worlds, and dailyLevel(dateString) through classic-browser BloomLevels and Node module.exports.
- Eighteen authored geometric flowerbeds contain 938 buds total, with 35–61 buds per board. The first has 35 buds in seven groups.
- Every group contains three to five connected buds. Targets have radius 11 and at least 27 pixels between centers. All sit within x=55..365 and y=65..380.
- Shapes include a diamond, heart, halo, butterfly, spiral, windows, arch, fireworks, and final crown. These are deterministic, explicitly authored masks, not random layouts.
- The launcher remains (210,498). Each length-64 petal bumper sits at x=95 or 325, y=405, at a diagonal; both quarter-turn orientations have target clearance. The center launch lane is open.
- Six collection flowers remain earned at levels 1,3,6,9,12,18. The latin field holds poetic display subtitles, not botanical Latin claims.
- The Glasshouse is free and playable. Moon Garden and Koi Conservatory remain clearly unavailable development previews with null prices. No working paid checkout is represented.

## Action and progression

The user rejected the original sparse, calm puzzle direction. This version is built for visible volleys and cascading flowers. The final root engine sends three staggered balls per volley, can add one two-ball bonus burst after 12 blooms, caps active balls at five, permits brief steering, and allows three volleys per board. Physics runs on fixed 120 Hz ticks. Speed rises from 420 on level 1 to 590 on level 18.

Durability now supplies progression beyond speed. Levels 1–4 use one-hit buds. Levels 5–7 make about 15% of buds two-hit, levels 8–11 about 35%, and levels 12–15 about 65%. Levels 16–18 make about 80% layered in total, including about 15% three-hit buds. The first layered board explains the mechanic. Selection is deterministic and spread through the bed.

Shown par is one volley on the opening board and two on later boards. The solver verifies possible solutions; it does not establish a mathematical minimum or human completion rate.

## Daily gardens

A supplied YYYY-MM-DD deterministically selects a board from 7–18 and mirrors its coordinates and bumper orientation. sourceLevelId preserves its speed tier, and hp preserves its durability. Daily gardens do not award a separate collection flower and never mutate the authored board.

Staggered volley order and bonus-ball birth angles need not be exact mirror symmetries. The solver therefore verifies the mirrored path and independently solves a daily board when needed; geometric reflection alone is not claimed to prove a runtime solution.

## Verification and reports

- Geometry audit passed for all 18 dense boards: target bounds, no overlapping target circles, three-to-five buds per group, and bumper clearance in both orientations.
- solve-levels.cjs searches actual engine trajectories at 60 FPS, records replayable paths in solutions.json, and can sample 31 evenly spaced aim directions using --survey.
- test-engine.cjs covers swept collisions, walls, capsules, state restrictions, scoring, three-ball volleys, five-ball cap enforcement, guide behavior, retry, daily speed, and solution replay at multiple frame rates.
- engine-test-results.json and solutions.json are the current machine-readable runtime evidence once regenerated against the final engine.

The initial dense build without durability was too forgiving: all 18 gardens had a straight-center one-volley solution, and 24–27 of 31 sampled aim directions cleared each entire board. That measurement motivated durability. Do not cite that initial survey as evidence of balanced final difficulty.

## Monetization boundary

Free gameplay and earned flowers work locally. The planned permanent map packs and possible power-ups need product implementation and payment integration before they can be offered for purchase. Preview copy must not imply released content or a completed store.


## Final verified run

Against the final three-ball volley engine with one optional two-ball burst, five-ball cap, layered hp, speed progression, and fixed 120 Hz physics:

- All 18 boards have verified solutions within two volleys without using guide. Fourteen solve in one; boards 13,16,17,18 use two in the recorded paths. The beam search is not a proof that these counts are minimal.
- All 12 possible daily source variants have verified, replayed solutions.
- All 20 engine tests pass. Recorded solutions match both winning outcome and exact score at 30,60,144 FPS.
- Swept collisions, paddle rotation limits, pending-cascade loss, retry state, score idempotence, hp cracking, guide trajectory/drain/refill, staged ball launches, five-ball cap, and daily speed preservation pass.
- For 31 equally spaced launch angles from -165 to -15 degrees, one-volley winners on boards 1–4 were 12,3,9,13; boards 5–7 were 3,3,2; boards 8–15 were zero or one each; boards 16–18 were zero each. This demonstrates a broad difficulty increase, not smooth per-level balance or measured human success rates.
- The prior frame-rate-dependent failure is fixed by the engine's constant simulation tick.

Commands from the workspace root:

    node work/qa/solve-levels.cjs --survey
    node work/qa/test-engine.cjs

The solver completed 6,727 candidate volleys plus replay/daily checks in about 21 seconds for this run. Reports are solutions.json and engine-test-results.json beside these scripts. Browser appearance and human play feel remain separate from this physics/state audit.
