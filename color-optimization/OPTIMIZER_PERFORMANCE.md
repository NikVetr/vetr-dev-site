# Optimizer performance assessment

The current implementation has opportunities to reduce waiting and repeated computation before changing the search algorithm. Separately, its quantized, constrained objective warrants a comparison of global exploration strategies. The experiments below do not change the shipped optimizer.

## Measurements

Measured 2026-09-05 against optimizer revision `2b38bfb` in headless Chromium 143.0.7499.4. The engine experiment extends `#4477AA, #CC6677` with three colors, using OKLab search, CIEDE2000 distance, Machado simulations, equal vision weights, harmonic aggregation, sRGB clipping, hard L width 0.65, unrestricted a/b, 12 restarts, 260 iterations and 48 trajectory samples. Seeds: 45, 2026, 910. Each variant receives a warm-up; caches are cleared before each measured seed.

| Isolated engine variant | Median elapsed time, three seeds |
| --- | ---: |
| Current implementation; yield every 5 iterations | 2.84 s |
| Experimental yield every 32 iterations | 0.65 s |
| Above, plus a bounded color-coordinate cache | 0.61 s |

Every variant produced exactly the same best score, exported colors, evaluation count, per-restart scores and stopping reasons for each seed. A repeat invocation confirmed equivalence, with medians of 2.83, 0.69 and 0.64 s respectively. These are instrumentation experiments, not a universal speed guarantee: one workload, three seeds, sequential variant order and instrumentation overhead limit the timing inference.

A separate complete-UI experiment at 1920 × 1080, seed 2026, with the same scoring settings measured 3.46 → 1.19 s for 12 restarts and 13.14 → 4.74 s for 48 restarts when batching yields. A repeat measured 3.43 → 1.16 s and 12.86 → 3.46 s. Path-panel drawing consumed approximately 0.5 s for 12 restarts and 1.5–2.2 s for 48. All runs retained the same best score, 41.89075. These timings show run-to-run variability; they are not confidence intervals.

Across the three baseline engine runs, 47–55% of objective-info calls returned an already-seen ordered output palette. This includes trajectory/diagnostic calls; it does not imply the entire objective can be cached by hex. Caching metric coordinates avoided 75–80% of coordinate conversions but added only a modest speed benefit beyond batching yields.

**All 36 baseline restarts stopped at the 260-iteration limit.** Final restart scores ranged from 30.27 to 41.89. This demonstrates sensitivity to starting conditions and insufficient stopping evidence; it does not establish that the poorer runs converged to local optima. Increasing to 48 restarts did not improve the best result in the single UI seed tested.

## First priority: preserve results while reducing overhead

1. **Yield according to elapsed computation time.** `optimizer/optimizePalette.js` requests a timer yield every five Nelder–Mead iterations. Repeated nested timers incur a browser minimum delay, so much of a small problem's elapsed time is waiting ([timer behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout)). Use an elapsed-time budget, initially around 8–12 ms, rather than a fixed iteration count; larger palettes make each iteration more expensive. Validate STOP/RESET latency. A worker can subsequently keep expensive computation off the UI thread ([Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)).
2. **Decouple search progress from painting.** `main.js` awaits `requestAnimationFrame` in the per-restart progress callback. Despite timer-based checkpoints inside the solver, this still permits hidden-tab stalls between restarts. Schedule rendering independently, throttle intermediate updates and always draw the final result. Cache unchanged gamut/constraint geometry in the path panel, preserving distinct full-gamut and constraint-aware boundaries and the unclipped violation markers.
3. **Reuse deterministic calculations.** Cache color coordinates by exported hex, distance metric, CVD model and vision state with a bounded per-run cache. Hoist role-specific constraint intersections out of `objectiveInfo`; they are constant during a run. Decode sampled trajectories without recomputing their full distance objective. Do not cache the complete objective by exported palette: raw-parameter and constraint penalties can differ for the same hex colors.

## Second priority: improve exploration per evaluation

The distance score uses exported 8-bit sRGB colors and quantized CVD previews. This keeps optimization consistent with the actual output, but introduces plateaus. Gamut projection, hard constraints and disconnected allowed regions add non-smooth boundaries. Nelder–Mead is a local search; a single fixed simplex scale and independent random restarts may spend substantial effort in similar regions.

- **Improve starts and budget allocation.** Compare diverse feasible seeds, including farthest-point candidates evaluated across active vision states, with the current random starts. Stratify across disconnected windows. Preserve the source-anchored first start for tweaks. Screen starts with short budgets, then continue promising, diverse candidates while retaining some exploratory budget. Track objective evaluations and stopping reasons separately from iterations.
- **Introduce deliberate escape moves.** Compare constraint-respecting color-block perturbations with local refinement (a basin-hopping approach), or a differential-evolution population followed by local polishing. These are candidates for evaluation, not demonstrated improvements in this app. See [basin hopping](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.basinhopping.html) and [Storn & Price's differential evolution paper](https://link.springer.com/article/10.1023/A:1008202821328).
- **Tune the local stage.** Test physically scaled initial simplexes and dimension-adaptive coefficients ([Nelder–Mead options and Gao–Han reference](https://docs.scipy.org/doc/scipy/reference/optimize.minimize-neldermead.html)). Use stagnation diagnostics to trigger exploration; do not restore premature convergence based only on equal objective values at separated vertices. Any continuous search surrogate must still rank and refine the exact exported colors; reverting to unconstrained wide-gamut scoring would reintroduce the output/scoring mismatch.

Compare search variants under both equal objective-evaluation budgets and equal wall time, using at least 20 held-out seeds over empty palettes, extensions, tweaks, hard/soft constraints, disconnected windows and the supported metrics. Record best score, weakest pair by vision state, duplicate colors, feasibility, stopping reason and STOP latency. Variability across restarts measures search reliability, not uncertainty about human observers. Parallel restarts require independent deterministic random streams.

## Reproduce

From `color-optimization/`, serve the static app in one terminal:

```sh
node node_modules/http-server/bin/http-server . -p 18081 -c-1
```

In another terminal:

```sh
node scripts/profile-optimizer.cjs http://localhost:18081 /tmp/color-optimizer-profile.json
node scripts/profile-optimizer-ui.cjs http://localhost:18081 /tmp/color-optimizer-ui-profile.json
```

The scripts use Playwright route substitutions to instrument and experimentally modify only the test browser's module responses. They assert output equivalence for the tested settings and write raw measurements outside the repository. Neither script installs a production optimization change.
