# Moon Garden: authored challenge proof

Six free development challenges. This chapter is not a paid product, a purchase entitlement, or evidence of human difficulty/fun. Runtime source: `../moon.js`; browser global `BloomMoon`, CommonJS export with the same catalog.

All stages use five single seeds, no in-flight guiding, no automatic bonus seeds, a seven-second seed lifetime, the normal launcher at (210,498), and one-hit flowers. Difficulty uses routes and limited shots rather than extra flower health. The first two stages retain four small two-flower links each; their other flowers and all later flowers are independent.

| ID | Stage | Buds | Gate pairs | Petals | Recorded shots | Par |
|---|---|---:|---:|---:|---:|---:|
| moon-1 | A Door in the Dark | 12 | 1 | 1 | 3 teaching / 2 stronger | 3 |
| moon-2 | Turn of the Moon | 12 | 1 | 1 | 2 | 2 |
| moon-3 | Crescent Relay | 15 | 1 | 1 | 3 | 3 |
| moon-4 | Crossed Stars | 24 | 2 | 1 | 3 | 3 |
| moon-5 | Petal Observatory | 18 | 2 | 2 | 3 | 3 |
| moon-6 | Lunar Waltz | 24 | 2 | 2 | 3 | 3 |

## Authoring intent

1. **A Door in the Dark:** a straight launch visibly enters the lower gate, continues upward from its partner, blooms two linked flowers, and returns. Further angled shots cross the scene instead of replaying one automatic chain.
2. **Turn of the Moon:** a quarter-turn difference between paired gates redirects the outgoing path. A sparse four-cluster arrangement keeps the result legible.
3. **Crescent Relay:** independent flowers along the crescent require direct contacts, wall returns, and a rotated gate path.
4. **Crossed Stars:** two distinct pair routes connect the upper sky and side clusters. Two additional authored clusters make the earlier short route incomplete.
5. **Petal Observatory:** two rotatable petals let the player change the return path; both gate pairs feature in the stored solution.
6. **Lunar Waltz:** the final low crescent must be approached deliberately. Moving those flowers from the easily swept top crown changed the actual collision route; it did not just change a test target.

Gate `pair` values point to the reciprocal partner's ID. Every gate radius is 18. Angles rotate the incoming direction by `exit.angle - entry.angle`. The engine owns traversal physics/cooldown; this catalog owns positions and level rules.

## Executable routes and evidence

Run `node qa/test-moon-levels.cjs` to replay saved solutions and the geometry controls. `--solve` deterministically rebuilds the route file first. Search considers direct, grazing, reflected-wall and gate-directed angles and one petal turn per shot, with a beam of ten states and a maximum of five shots. This is a bounded search, not a proof of optimality.

- `moon-solutions.json`: actual firing angles and petal turns, bloom totals and gate passages.
- `moon-test-results.json`: all six outcomes match at 30, 60 and 144 FPS; every recorded route remains incomplete when gates are removed.
- All 770 sampled first shots (3-degree grid with each available single-petal turn) left flowers unbloomed. This does not rule out every possible exceptional angle.
- Geometry checks cover flower boundaries/non-overlap, local link sizes, gate reciprocity, full exit clearance and gate/flower/petal separation. Names and hints are bounded for the narrow mobile HUD.
- `moon-geometry-control-results.json`: preserved earlier two-shot routes for stages 4 and 6. They still win on their earlier geometry; on the final boards they bloom only 10/24 and 2/24 flowers respectively. Those checks prevent hiding previously known easier routes by merely omitting them from a report.
- All recorded final routes meet their authored par and earn three stars. Stage 1 deliberately records the teaching route; its known stronger two-shot route remains tested and documented.

No player completion rate, native device performance, commercial demand or universal requirement to use gates has been established. The no-gate control proves dependence of these specific recorded routes only.

## First challenge browser verification

No petal rotations. Fire these angles, waiting until each shot settles:

1. `-1.5707963267948966` radians (straight up): 2 flowers bloomed.
2. `-1.387998742226947` radians: 11 total flowers bloomed.
3. `-1.6157963267948965` radians: 12/12, three stars, 2,600 points.

For a direct engine replay, use `(cos(angle), sin(angle))` as the firing vector. Browser QA should exercise actual pointer aiming and release. The stronger two-shot sequence is `-2.029010725916235`, then `-1.9660107259162354`; it is preserved to avoid describing the teaching route as optimal.

Moon source is frozen for the current integration pass. Future runtime edits require rebuilding the web allowlist/release and resynchronizing native assets; this catalog contains no purchase locks.
