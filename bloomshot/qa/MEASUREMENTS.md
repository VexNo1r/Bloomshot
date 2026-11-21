# Campaign and spam measurements

These tools run the game engine without rendering, save changes, purchases or native store calls. They are repeatable practice-player measurements. They do not establish human difficulty, touch controls or physical-device performance.

Run from the repository root:

```sh
node bloomshot/qa/test-depths-bot.cjs
node bloomshot/qa/measure-depths.cjs --smoke --workers 2 --output .work/campaign-smoke.json
```

The bot shares one table of 90 visible-motion forecasts between the angle candidates for each shot. It considers actual colliders and contact normals, current tunnels and currents, visible real hearts and lit stars, and the observed angular velocities of the shell locks. It adds seeded aim error after choosing a shot. It cannot simulate the next unannounced shuffle, attack or revival. Earned Split and Super Bloom are allowed; powerups are not used.

The shell-lock safety preference ranks legal shots toward the centers of the visible gaps. It does not widen the gaps, reduce aim noise or change the game's armor rules. Regression checks cover forecasts without live-collider mutation, hidden and decoy colliders, shell eligibility, tunnel exit/cooldown/provenance, and repeatable seeded outcomes.

## Tuning and validation

Run the tuning corpus while heldout seeds remain reserved:

```sh
node bloomshot/qa/measure-depths.cjs --groups average,boss,good --average 128 --boss 48 --good 16 --workers 2 --output .work/campaign-tuning.json
```

Freeze the game and bot before evaluating the disjoint validation streams:

```sh
node bloomshot/qa/measure-depths.cjs --groups heldout --heldout 32 --workers 2 --output .work/campaign-heldout.json
```

The complete default corpus combines 128 average campaigns, 32 heldout average campaigns, 48 boss-only fights and 16 good campaigns for each of the ten levels, totaling 2,240 cases. Boss-only cases start at wave ten with a fresh pod and three lives; they are different from reaching the boss at the end of a campaign. `--levels 1,6,10` restricts the selected levels.

| Profile | Aim noise | Delay after a normal shot | Trace bank allowance |
| --- | --- | --- | --- |
| Average / heldout / boss-only | 4 degrees | 0.5–1.0 seconds | 1 |
| Good | 2.5 degrees | 0.3–0.6 seconds | 2 |

Aim noise uses the bot's seeded approximation to a normal distribution. These labels describe software profiles; they are not calibrated populations of human players. Heldout streams change aim and reaction randomness on the same authored layouts, rather than introducing unseen levels. If validation results drive a new tuning change, those seeds have become tuning data and a new validation corpus is needed.

`S` is `3 - remaining lives` after a clear, or `3 + (10 - final wave)` after a loss. `P` is lives lost before the boss dies plus boss kill time divided by 50. Failed boss fights have no kill time: their `P` is null and their observed duration/pressure is reported separately. Reports include raw seeded results, per-level clear counts, lives, elapsed time, kill time, shield events, HP, shots, refunds and Wilson intervals for clear rates. Historical values in the recovered Claude README are comparison targets, not verification of the current game.

Both runners hash their gameplay and measurement sources. They stop scheduling further cases if sources change or a case throws. Check `finished`, `source_stable`, `completed` and `expected` before using a report. The campaign runner writes checkpoints and accepts `--resume` only for an unchanged corpus and sources; it rejects a checkpoint that observed source changes. A 900-second game-time cap marks unresolved runs as timeouts. Wall-clock timings are local engine/software observations.

## November 21 curve (turning shells and difficulty pass)

Measured with the batch-2 campaign runner (full-level `play` runs of `qa/depths-bot.cjs`, average and good profiles as in the table above; `lazy` and `wild` are `mash` modes), seeds `k * 977 + id * 13 + 9`. "Before" is the build before the per-level shells (offsets 1 to 96); "after" pools two never-used blocks of 96 seeds (offsets 301 to 396 and 501 to 596), 192 runs per level and profile. Mash rates are the 501 block.

| Level | Average before | Average after | Good before | Good after | Mash lazy / wild after |
| --- | --- | --- | --- | --- | --- |
| 1 | 100% | 100% | 100% | 100% | 80% / 4% |
| 2 | 99% | 99% | 100% | 100% | 18% / 0% |
| 3 | 100% | 98% | 100% | 99% | 9% / 1% |
| 4 | 74% | 77% | 93% | 91% | 0% / 0% |
| 5 | 85% | 82% | 95% | 95% | 5% / 0% |
| 6 | 76% | 79% | 96% | 94% | 0% / 0% |
| 7 | 72% | 75% | 89% | 91% | 0% / 0% |
| 8 | 52% | 75% | 89% | 92% | 1% / 0% |
| 9 | 44% | 68% | 88% | 93% | 0% / 0% |
| 10 | 42% | 62% | 86% | 93% | 0% / 0% |

The per-level shells alone moved Level 6 to 95% (its shells now turn fastest with the widest gap), Level 8 to 50% and Level 10 to 30% (slowest, narrowest); the pace, hp, cup, regrow and drop changes in `depths.js` then set the curve above. Within one block a level's rate moves by up to 7 points from seed luck alone (Level 5: 85% on seeds 1 to 96, 72% on 301 to 396 with nothing changed), so judge pooled rates, not one block. Levels 7 to 9 sit within that noise of each other.

An independent rerun on seed offset 701 (never used above, 96 runs each) reproduced the table within noise, a few points lower for the average bot: Level 10 58.3%, Level 8 71.9%, Level 6 76.0%; good bot Level 10 92.7%. Level 10 stays inside the 55-65% target. The pace changes in this pass did change fall speeds (pace multiplies every wave's fall time): Level 6 1.5 to 1.72 and Level 7 2.05 to 2.1 fall slower, Level 8 2.2 to 2.0, Level 9 2.7 to 2.65 and Level 10 2.3 to 2.2 fall faster, and Level 8 wave 5 lost one fast cluster. No wave's `d` changed.

## Repeated tapping and ricochets

```sh
node bloomshot/qa/measure-spam.cjs --levels 1 --seeds 16 --workers 2 --output .work/spam-comparison.json
```

Rapid policies tap every 0.12 seconds, regardless of pod availability. They do not use Split or select targets, except the explicitly labeled rough lowest-flower policy. They can receive the game's earned Super Bloom and ordinary ricochet rewards.

- `rapid_broad_cone`: random angles across a 120-degree upward cone.
- `rapid_middle_sweep`: a moving central sweep with small seeded wobble.
- `rapid_lazy_lowest`: rough aim within 12 degrees of the lowest visible flower.
- `fixed_straight`: repeated vertical shots.
- `fixed_bank_ANGLE`: eight selected fixed bank angles from −165 to −15 degrees.
- `alternating_banks_ANGLE`: four pairs of mirrored fixed bank angles.
- `wide_ricochet_sweep`: a deterministic sweep extending to shallow wall banks.
- `careful_average`, `careful_good`, `careful_fast`: the tracing player; fast retains 2.5-degree aim noise and two banks but fires as soon as the pod allows.

Fixed and alternating angles and the wide sweep are one deterministic case per policy. Their outcomes are not independent statistical samples. Stochastic policies and careful profiles use the specified seeded streams. Refund figures count accepted refund events; they are not the number of whole seeds restored. Keep the same policies and seeds for a before/after comparison, then validate the careful profiles on a larger stable campaign corpus.
