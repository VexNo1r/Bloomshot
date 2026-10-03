# Moon aim tolerance

Earlier passes found that Moon 1's teaching route cleared from only one of nine neighbouring pixels. Pass 2 fixed that by linking whole flower sprigs, so one hit blooms its whole cluster, on every Moon trial except one sprig per board. Gate routes are still required.

`node qa/check-moon-pointer.cjs` measures it. A simulated careful player picks the most forgiving angle for each shot and fires with 3° of Gaussian aim error, which is roughly a fingertip on a phone. It plays 40 runs per trial and asserts these clear-rate floors: 90/80/70/45/45/35%.

Results at the time of the change: Moon 1 98%, Moon 2 95%, Moon 3 75%, Moon 4 68%, Moon 5 63%, Moon 6 43%. Before the change they were 72%, 58%, 25%, 3%, 13% and 0%.

`node qa/aim-tolerance.cjs [trial] [sigmaDegrees] [runs]` explores other error levels. A simulated player is not a human playtest, so confirm on a real phone.
