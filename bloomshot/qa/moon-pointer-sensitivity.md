# Moon 1 pointer sensitivity

Runtime was left unchanged. The exact canvas rectangle used in this check is **x8, y177, width374, height504.625 CSS pixels**. Coordinates below are screen coordinates for that rectangle only; remeasure after resizing or moving the canvas.

For the integration check, restart Moon 1, press Space, and wait for the first shot to settle with two flowers bloomed. Click/release **(176,189)**. That integer point maps to **-1.614790283762623 radians** and clears the board in two shots: **12 flowers, 3,200 points, three stars**. Engine replays match at 30,60 and144FPS.

This route is brittle: **only one of the nine pixels in its 3×3 neighborhood clears in two shots**. Those counts describe a fixed coordinate grid, not player success probability.

The earlier fractional second-shot point (252.6150831659607,310.3651785714286) was meant to aim at -1.387998742226947 radians and produce11 total blooms. Integer (253,310) instead aims at -1.3870128182333892 radians and produces5 total blooms, matching browser QA. Nearby (251,310) gives11; (252,310) and(254,310) give4. The sensitivity is reproduced by the engine using the same coordinate mapping as app.js.

The conservative search requiring identical bloom outcomes across all neighboring pixels did not find a five-shot route. A broader search allowing different intermediate outcomes was stopped before completion; it did not establish a guaranteed robust route. Neither result proves one is impossible.

**Recommendation for the next pass:** reduce first-trial precision sensitivity with readable, wider gate-to-flower and return routes. Re-test normal pointer aiming and small coordinate perturbations before describing it as a learnable tutorial. An exact solver route does not establish fun, ordinary human difficulty, or physical-device usability.

Reproduce the compact check with `node qa/check-moon-pointer.cjs`. Full values and source hashes are saved in `moon-pointer-sensitivity.json`. Exploratory search helpers remain in the workspace's work directory; no runtime change was made for this investigation.
