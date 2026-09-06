# Optimizer implementation and performance

## Implementation

- The asynchronous Nelder–Mead solver yields after approximately 10 ms of computation, replacing the fixed five-iteration timer cadence. Restart boundaries also yield when needed, including when individual solves finish within one slice. This is cooperative scheduling: an individual objective evaluation or initialization can exceed the target, and browsers can throttle hidden tabs.
- Search progress updates state immediately. Intermediate path drawing is scheduled independently, at most approximately every 120 ms, and never awaited by the solver. Completion paints the final result even when animation frames are suspended. STOP/RESET cancel or invalidate pending paints.
- A bounded, per-run cache stores up to 20,000 metric-coordinate entries keyed by exported hex and vision state. Metric and CVD model are fixed in that run's closure. Role-specific constraint bindings are prepared once. Trajectory samples use the shared decoder/projection pipeline without recomputing distance scores or penalties.
- Gamut projection boundaries and extents each have a 32-entry cache keyed by all their arguments, including constraint ranges and sampling resolution. Full and constraint-aware geometry remain distinct. Cached values are read-only to callers; changed ranges generate new keys.
- Each optimization owns its seeded random stream, so overlapping asynchronous searches do not interfere. Classic seeded runs preserve their original results.

The objective still scores exact exported sRGB hex and the same quantized CVD previews. Constraint penalties, hard/gamut projection, tweak identities and final ranking are unchanged.

## Search choices

The UI's **Search strategy** control offers:

1. **Classic random restarts** (default): the original local search and start distribution.
2. **Adaptive random restarts**: expansion, contraction and shrink coefficients depend on dimension using [Gao & Han (2012)](https://doi.org/10.1007/s10589-010-9329-3). For dimension n > 1, the coefficients are 1 + 2/n, 0.75 − 0.5/n and 1 − 1/n; reflection remains 1.
3. **Hybrid color exploration**: adaptive local search plus up to four distinct one-color replacement candidates built from the current best palette and a fresh sampled palette. The best exact penalized candidate, including the fresh start, seeds local refinement. Every third start remains fresh; the first tweak start remains source-anchored. Candidates use the same role-aware encoding and feasibility checks as ordinary search. This is a heuristic exploration strategy, not a global-optimum guarantee.

Verbose output records each restart's stopping reason, search evaluation count and iteration count. The API's optional `maxEvaluationsPerRun` limits start screening plus local objective calls. Final diagnostic recomputation is excluded from that search count. The UI retains its existing iteration and restart controls. The solver preserves its best evaluated point when an evaluation cap interrupts an iteration; STOP preserves completed restarts as before.

Classic remains the default because quality gains from alternative strategies vary by workload. Population differential evolution, worker execution and dynamic redistribution of budgets among starts are further experiments, not shipped features.

## Speed validation

Measured 2026-09-05 in headless Chromium 143.0.7499.4 against archived application revision `e30e53b`. The fixed workload extends `#4477AA, #CC6677` by three colors: OKLab search, CIEDE2000, Machado simulations, equal vision weights, harmonic aggregation, sRGB clipping, hard L width 0.65, unrestricted a/b, 260 iterations and 48 trajectory samples.

| Workload, Classic strategy | Previous | Current |
| --- | ---: | ---: |
| Engine, 12 restarts, median of seeds 45 / 2026 / 910 | 2.82 s | 0.28 s |
| Complete UI, 12 restarts, seed 2026 | 3.63 s | 0.48 s |
| Complete UI, 48 restarts, seed 2026 | 13.48 s | 1.90 s |

Engine best palettes, scores, every restart score and objective-evaluation counts matched exactly. UI best palettes and scores also matched. Path drawing fell from 0.56 to 0.019 s for 12 restarts and from 2.17 to 0.135 s for 48, through geometry reuse and fewer intermediate paints. These timings are illustrative measurements, not universal speed factors or confidence intervals; instrumentation, warm-up, machine load and browser scheduling affect elapsed time.

An additional 252 objective-info snapshots matched the previous revision exactly across seven search spaces, six distance metrics and contiguous/discontiguous hard constraints. The permanent tests cover all six metrics with caching enabled/disabled, trajectory decoding, changed gamut constraints, concurrent seeds, evaluation caps, cancellation and source-anchored tweaks.

## Search-quality validation

The reproducible benchmark covers extensions, empty palettes, soft constraints, tweaks, disconnected custom windows and polar OKLCh/CAM16-UCS search. Following exploratory seeds 101–120, the final comparison uses held-out seeds 121–140: 20 paired seeds per case and three strategies. Each receives eight restarts with a cap of 500 search evaluations per restart and at most 1,000 iterations. Screening is charged against the cap. Actual counts ranged from 3,932 to 4,000 because convergence can end a restart early.

| Case | Classic median score | Adaptive median | Hybrid median | Adaptive / Hybrid paired wins out of 20 |
| --- | ---: | ---: | ---: | ---: |
| Extension | 41.315 | 41.333 | 41.367 | 11 / 13 |
| Empty palette | 49.997 | 50.161 | 50.347 | 15 / 16 |
| Soft constraints | 38.638 | 38.768 | 38.772 | 17 / 15 |
| Tweaks | 40.303 | 40.296 | 40.447 | 12 / 12 |
| Disconnected windows | 47.714 | 47.606 | 47.811 | 6 / 10 |
| Polar search | 47.657 | 48.016 | 48.044 | 15 / 17 |

Scores are comparable within a row, not across different configurations or metrics. Hybrid beat Classic in 83 of 120 paired cases, but its mean paired change was negative for disconnected windows despite a higher median score. Thus the results do not justify replacing Classic universally. All final palettes in this comparison satisfied their role-specific hard constraints and selected gamut, with no duplicate colors. The benchmark also records the weakest complete-palette pair separately for each vision state; an aggregate-score improvement does not guarantee improvement to each pair.

A separate comparison used a 300 ms wall-time target for each strategy, with the same 20 seeds per case. Hybrid beat Classic in 82 of 120 paired cases; Adaptive did so in 68. Hybrid median scores were higher in five cases and effectively tied in the disconnected case (47.847 versus 47.848). All results were feasible and duplicate-free. This run records only completed restarts, using the same cancellation contract as the UI; median actual durations were approximately 300.1–300.3 ms. Timing-dependent stopping is not seed-reproducible. These studies assess search reliability, not uncertainty about human observers.

## Reproduce

From `color-optimization/`, serve the app in one terminal:

```sh
node node_modules/http-server/bin/http-server . -p 18081 -c-1 -s
```

In another terminal, run the current implementation:

```sh
node scripts/profile-optimizer.cjs http://localhost:18081 /tmp/color-engine.json
node scripts/profile-optimizer-ui.cjs http://localhost:18081 /tmp/color-ui.json
node scripts/benchmark-search.mjs /tmp/color-search.json 121
node scripts/benchmark-search.mjs /tmp/color-search-wall.json 121 300
```

The last command gives each search a 300 ms wall-time target; the preceding command uses the common evaluation cap. Run timing studies serially. To compare an archived application, supply its extracted `color-optimization/` directory as the final argument to either `profile-optimizer*.cjs` script. For example, extract `git archive e30e53b color-optimization` into a temporary directory and pass that directory's `color-optimization/` subfolder. Playwright substitutes the archived JavaScript only inside the baseline browser session and asserts Classic output equivalence. Raw measurements stay outside the repository.
