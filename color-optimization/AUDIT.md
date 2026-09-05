# Color optimization audit

Date: 2026-09-04. Reviewed commit: `eaaf4c4d4c6188d8fafaaf9e3811ab755d313476`.

Scope: color conversions and distance metrics, CVD simulation, objective construction, constraints and gamut projection, numerical search, resolvability diagnostics, image clustering, and test coverage. The findings below describe the reviewed revision; their locations and reproductions are historical. P1 findings affect the scientific meaning of scores or violate active constraints. P2 findings affect optional models, numerical search, or exceptional inputs.

## Resolution and regression checks

All eleven confirmed bugs below are addressed in the accompanying fixes:

| Findings | Current behavior | Regression coverage |
| --- | --- | --- |
| 1–2: CIEDE2000, CAM16 | Correct rotation term and model-specific response compression | `science.test.mjs`: all 34 Sharma pairs in both directions; independent CAM02/CAM16 fixtures |
| 3–4, 10: output and CVD consistency | Every distance uses exported 8-bit sRGB hex and the same quantized CVD preview, independent of the selected search gamut; legacy linear calls respect its encoded-sRGB convention | `science.test.mjs`, `cvd.test.mjs`: identical exported P3 red has zero separation; six metrics, two models, four vision states, three gamuts |
| 5: ordered lightness | Soft penalties use each decoded lightness logit | `science.test.mjs`: single and multiple additions agree for the same physical lightness |
| 6–7: individual modes and projection | Explicit hard/soft modes and source identities are bound to each output before hard clamping and projection; soft windows do not restrict starts | `constraintProjection.test.mjs`, existing `tweakInputs.test.mjs` |
| 8: ICtCp luminance | PQ honors peak luminance; the SDR distance option explicitly assumes 100 cd/m² white | `science.test.mjs`: 100/1000/10000 cd/m² fixtures and invalid luminance rejection |
| 9: solver | Returns the actual best simplex vertex; correct outside-contraction comparison; convergence checks objective spread and simplex diameter | `nelderMead.test.mjs`: synchronous/asynchronous limit, contraction, plateau and cancellation cases |
| 11: infeasible projection | Invalid trial projections receive infinite loss; a failed final/start projection raises a visible error instead of exporting a violating result | `constraintProjection.test.mjs`: incompatible hard window and gamut rejected |

Additional improvements: image clustering updates weighted OKLab centroids and selects eligible distinct seeds before frequency ranking; zero pair distances remain zero; invalid scoring coordinates, parameters and distances fail explicitly. Per-row diagnostic totals subtract penalties. The verbose deletion diagnostic is labeled as normal-vision-only and its misleading percentage column is removed. The UI identifies resolvability quality bands as heuristics and explains negative-order Lehmer behavior. Optimizer checkpoints use timers so a suspended animation-frame callback cannot stall a hidden tab (browser throttling or suspension can still limit progress).

Earlier discussions were cross-checked against `9bb2458`, `1357c3b`, `ca2c223`, and the current implementation. The latest historical commit did **not** fully resolve per-input mode propagation into gamut projection, and the promised violation ring was missing from the final star overlay. Both gaps are fixed here.

| Previously requested behavior | Verification |
| --- | --- |
| Full projected gamut, separate hidden-axis constraint boundary, no visible-axis hull inflation | Existing `gamutStarts.test.mjs` boundary tests; rendered paths and four-panel screenshots inspected |
| Hard windows have no center attraction; custom geometry stays literal | Existing objective/bounds and tweak tests |
| Custom constraints clear on colorspace changes; new drawings control optimization | Existing custom-state tests and a browser draw/switch/draw/run test |
| Hue/chroma edges follow the mouse; channel-bar preview updates before mouseup | Browser drags on a CSS-scaled canvas and live preview assertions |
| Individuated mode replaces globals; auto tweaks layer globals; local tweak windows never constrain added outputs | Existing tests plus explicit hard/soft and clipping combinations |
| Tweak replacement in resolvability, stable untweak ordering, source identities and first anchored restart | Existing `resolvability.test.mjs` and `tweakInputs.test.mjs`; browser tweak/untweak cleanup |
| Stars remain above masks, including invalid points | Browser pixel checks and inspected screenshot of a deliberately invalid point with its red ring |
| STOP retains completed restarts; RESET ignores late callbacks; independent desktop scrolling | Browser interaction assertions; existing cancellation tests |
| Final-best metadata includes distance and penalties | `constraintProjection.test.mjs` compares emitted diagnostics to returned metadata |

Current validation: `npm test` runs 98 Node tests and seven focused Chromium regressions. A separate fixed-seed feasibility check passed 63 cases (seven optimization spaces × three gamuts × three seeds, two restarts per case). This is a regression check, not evidence of global optimality or perceptual validity. Screenshot-only capture specs remain available separately; they are not the default test gate.

Remaining research work: calibrate penalty scales across metrics and palette sizes, validate quality bands with observers and viewing conditions, compare worst-pair/severity-aware objectives, and benchmark search quality against alternative algorithms. Image subsampling, bucket truncation and post-refinement separation also need broader evaluation. The search retains continuous constraint coordinates while scoring quantized output; exact raw-coordinate hard bounds need not survive sRGB clipping/quantization. These scientific/design questions are not silently resolved by changing coefficients. Existing tracked dependencies are not removed by the corrected artifact ignore rules.

## Original confirmed findings

### 1. P1: CIEDE2000 rotation term is incorrect

Location: `core/metrics.js:72`.

`Rt` uses `sin(deltaTheta)` instead of `sin(2 * deltaTheta)`. This changes the default distance metric and therefore both optimization and resolvability results, particularly around blue hues.

The implementation fails **10 of 34** published reference pairs at absolute tolerance `0.00005`. The first pair returns **1.869329** instead of **2.0425**; pair 29 returns **2.628432** instead of **2.0373**. Changing only that factor in an in-memory copy makes all 34 cases pass. Source: [Sharma's reference implementation](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/dataNprograms/deltaE2000.m) and [supplementary test data](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/dataNprograms/ciede2000testdata.txt).

Fix: correct the rotation term and add all 34 external fixtures, including hue-boundary cases, to the normal test suite.

### 2. P1: CAM16-UCS includes a CIECAM02-only transformation

Location: `core/camUcs.js:144–152`.

Both variants apply `HPE * CAT^-1` after adaptation. CAM16 compresses the adapted CAT16 responses directly; the HPE conversion belongs to CIECAM02. The current function is therefore a hybrid, despite being labeled CAM16-UCS. Source: [Colour's CAM16 implementation, steps 2–3](https://colour.readthedocs.io/en/latest/_modules/colour/appearance/cam16.html).

For XYZ `[57.06, 43.06, 31.96]`, white `[95.05, 100, 108.88]`, adapting luminance `31.83`, background `20`, and average surround, the reference J/M/h fixture gives UCS `[76.288225, 28.403162, 8.948176]`; this code gives `[76.428628, 27.766990, 9.566129]`. Source: [Colour 0.4.7 fixtures](https://raw.githubusercontent.com/colour-science/colour/v0.4.7/colour/appearance/tests/test_cam16.py).

Fix: branch the response-compression inputs by appearance model and validate both models against independent, chromatic fixtures under matching viewing conditions.

### 3. P1: The scored palette can differ materially from the exported palette

Locations: `optimizer/objective.js:243–246`, `core/colorSpaces.js:121`, `core/colorSpaces.js:419`.

Scoring uses continuous raw/projected coordinates, whereas every `encodeColor` path produces clamped, quantized sRGB hex. A P3 or Rec.2020 color outside sRGB is changed during export. Even sRGB results can collapse after 8-bit quantization; disabling optimization clipping also leaves out-of-gamut coordinates in the score.

Reproduction: use P3 pure red as a candidate, sRGB `#FF0000` as the fixed input, P3 optimization clipping, Lab76 distance, and only the normal-vision weight. The candidate receives distance **30.965280** but exports as **`#FF0000`**. The resulting two hex colors are identical and have actual distance zero. Hex colors are sRGB by definition: [CSS Color 4](https://www.w3.org/TR/css-color-4/#hex-notation).

Fix: define the output contract. For hex output, validate and rank the final sRGB palette, including quantization and duplicate detection. For wide-gamut output, preserve tagged coordinates through rendering, diagnostics, history, and export, with an explicit sRGB alternative. Continuous scoring can remain a search surrogate, followed by exact output validation and local discrete refinement.

### 4. P1: CVD matrices are applied in the wrong RGB basis for wide gamuts

Locations: `optimizer/objective.js:417–434`, `optimizer/optimizePalette.js:666–683`.

With optimization clipping enabled, the code converts XYZ to the selected gamut, applies the same CVD matrix to those components, then converts back using that gamut. The embedded Machado matrices are supplied for an sRGB basis, as documented in `citations.txt`; P3 and Rec.2020 have different primaries. A basis change requires transforming the operator, not simply reusing its entries. The author's [matrix-model description](https://www.inf.ufrgs.br/~oliveira/students_dissertations/Masters/Gustavo_Machado_Masters_thesis_UFRGS_2010.pdf) describes the simulation as an RGB linear operator.

Reproduction: the same fixed sRGB `#FF0000` gives protan Lab coordinates `[40.2452, -4.0143, 51.3770]` under the sRGB preset and `[41.4241, -2.9181, 46.8910]` under P3. This is not a change in the input color.

Fix: simulate in one documented reference basis, or conjugate the operator into each RGB basis. Decide separately how to handle unrenderable simulated colors. Use the same pipeline in optimization, closest-color diagnostics, and previews.

### 5. P1: Ordered lightness applies soft penalties to log-increments

Locations: `optimizer/objective.js:167–190`, `optimizer/objective.js:732–745`.

For multiple added colors, lightness parameters after the first encode log-increments. The code copies them to `zRows` before exponentiation and cumulative summation, then treats those original parameters as each color's lightness logit when calculating contiguous soft constraints.

Reproduction: two added OKLab colors, soft L bounds `[0.4, 0.6]`, and all six parameters zero produce lightnesses **0.5 and 0.731059**, yet both lightness penalties are effectively zero. The second color is far from the soft center but is scored as if it were centered.

Fix: compute soft penalties from decoded color coordinates or the correctly accumulated lightness logits. Test the same physical color as a single addition, one of several additions, and a tweak.

### 6. P1: Gamut projection ignores per-input soft modes and row identity

Locations: `optimizer/objective.js:243–244`, `core/hardConstraints.js:14–33`, `core/hardConstraints.js:142–210`.

The objective understands `pointModes`, tweak source indices, and per-row exclusions. Projection receives only `(row, prep)` and consults the channel-level `mode`. It cannot enforce the same row-specific feasible set and can hard-clamp a soft window.

Reproduction: manually individuated constraints around `#808080`, per-input widths `0.9`, per-input mode `soft`, and global channels `hard`. An already in-sRGB green candidate remains **`#00FF00`** with optimization clipping disabled, but becomes **`#7D996D`** when clipping is enabled. The raw optimizer color is unchanged; projection introduces the hard limit.

Fix: build one effective constraint object per optimized row, including its modes and source identity, and reuse it for initialization, decoding, projection, penalties, and validation. An already in-gamut candidate with only soft constraints should retain its coordinates.

### 7. P2: A per-input hard setting can silently become soft

Location: `optimizer/bounds.js:220–222`.

`perInputModes[i] === "soft" ? "soft" : mode` respects an explicit soft setting but substitutes the global channel mode for an explicit hard setting. With global channels soft and a manually individuated ordinary input set to hard, its generated `pointModes` are still `soft`.

Fix: preserve both valid explicit modes and use the global mode only when no per-input mode exists. Test all four combinations of global and per-input hard/soft settings.

### 8. P2: ICtCp ignores the supplied peak luminance

Location: `core/ictcp.js:41–48`.

`pqEncodeRelative(v, Lp)` never uses `Lp`. Consequently `linearRec2020ToICtCp({r:1,g:1,b:1}, Lp)` returns I=1 for peak luminances 100, 1000, and 10000 cd/m² alike. Under the function's documented relative-input contract, PQ should encode `v * Lp / 10000`; white at 100 cd/m² encodes near 0.508078, not 1. See the absolute-luminance contract in [Colour's ST2084 documentation](https://colour.readthedocs.io/en/latest/generated/colour.models.eotf_inverse_ST2084.html).

The default distance pipeline also implicitly maps SDR white to 10000 cd/m². This needs an explicit viewing/display assumption before ΔE_ITP labels have a defensible interpretation.

Fix: implement the documented peak scaling, expose or clearly document the reference white luminance, and add absolute-luminance fixtures. Review JzAzBz's separate luminance convention too: `core/colorSpaces.js:623–660` passes relative XYZ directly into an absolute PQ-like transform and normalizes only Jz.

### 9. P2: Nelder–Mead can discard its last improvement

Locations: `optimizer/nelderMead.js:85`, `optimizer/nelderMead.js:187`; contraction branches at lines 65–76 and 171–178.

The simplex is sorted at the start of each iteration. After the final reflection/expansion/contraction, the iteration-limit return uses `simplex[0]` without sorting again.

Reproduction for both sync and async variants: minimize `(x - 2)^2` from `[0]`, step 1, one iteration. The function evaluates and accepts x=2 with loss zero but returns **x=1, loss 1**. This affects restarts that exhaust their iteration budget.

There is also a nonstandard outside-contraction acceptance condition: it compares `fc` to the old worst value rather than the reflected value, permitting a contraction worse than the reflection. The established branch comparison and final ordering are visible in [SciPy's implementation](https://raw.githubusercontent.com/scipy/scipy/v1.16.2/scipy/optimize/_optimize.py).

Fix: retain the best incumbent or sort before returning, correct outside-contraction acceptance, and share the numerical step logic between sync/async versions.

### 10. P2: Legacy CVD optimization and previews use different transfer domains

Locations: `core/cvd.js:176–187`, `core/cvd.js:229–247`, `ui/resolvability.js:74–75`.

The legacy preview mixes gamma-encoded sRGB values. Its optimizer branch intentionally applies the same coefficients directly to linear RGB for backward compatibility. Therefore the preview does not show the simulation being optimized. The modern Machado model is the application's initialized default, so this finding specifically concerns the selectable legacy option.

For red under legacy deutan, optimizer Lab L is **83.6276**, while the preview hex decoded back to Lab has L **69.1919**. This is much larger than an 8-bit rounding discrepancy.

Fix: use the same transfer-domain pipeline everywhere, or restrict the historical calculation to an explicitly labeled comparison mode. Existing parity tests intentionally preserve this behavior and need to be reconsidered against a scientific specification.

### 11. P2: Gamut projection can return an out-of-gamut “projected” result

Location: `core/hardConstraints.js:65`.

After alternating projections and an anchor attempt fail, the function returns `constrained` without checking gamut membership. The objective can then score separately clamped RGB while returning out-of-gamut raw coordinates and a hex color violating the raw constraints.

Reproduction: an exact custom hard window around OKLab `[0.5, 0.5, 0.5]` returns an out-of-sRGB raw point and a finite score from `objectiveInfo`, with hex `#FF0000`. The ordinary clipped random-start path does reject some infeasible configurations; that protection does not establish this projection function's postcondition or cover every direct/anchored evaluation path.

Fix: return an explicit infeasible result or throw when no feasible projection is found. Validate the conjunction of gamut membership and every applicable hard constraint before accepting a result. Distinguish failure to find a feasible point from proof that the domain is empty.

## Statistical and scientific improvements

These are design recommendations, not all implementation bugs.

1. **Protect the weakest pair and vision condition.** `objective.js:309–312` takes a weighted arithmetic sum of per-state aggregates. Even selecting the minimum pairwise distance still averages across vision states: a good normal-vision result can compensate for near-zero tritan separation. Add an optional objective such as `min(state, severity, pair) distance`, or per-state minimum-separation constraints with a secondary average-distance objective. Evaluate a severity grid and report the worst pair in each state. Treat the UI weights as user preferences unless a defined target population supports a prevalence interpretation.

2. **Calibrate penalty units and palette-size dependence.** Color-distance metrics have different numeric scales, but the constraint coefficients and divisor 14.1 are constant. Switching from Lab distances to OKLab changes the tradeoff between separation and penalties. Penalties are summed over optimized colors while pairwise distances are averaged, so increasing the number of additions also changes that tradeoff. Use documented metric-specific scales and decide whether penalties represent a per-color average or total cost. Evaluate sensitivity over coefficients and palette size. The use of 1.96 to define widths is a penalty-shape convention, not a confidence interval inferred from data.

3. **Treat discriminability labels as unvalidated heuristics.** `core/resolvability.js:3–18` assigns one JND scale per metric and then labels distances using universal multiples `[1,2,5,10]`. In particular, OKLab being numerically smaller than Lab does not establish its threshold as Lab's threshold divided by 100. The [OKLab author's description](https://bottosson.github.io/posts/oklab/) explains a different perceptual transform. Measure or source thresholds for the intended display, mark size, background, spacing, task, and observer population. Until then, show the numeric distance and describe quality bands as heuristic. Evaluate background contrast separately from categorical pairwise separation.

4. **Benchmark optimization with fixed evaluation budgets and repeated seeds.** Add independent reference fixtures before evaluating algorithm quality. Compare the corrected solver with a reproducible farthest-point candidate baseline and a global-search-plus-local-refinement alternative. Record objective evaluations, final feasible/exported score, worst-pair distance, wall time, seed, and stop reason. Report median and spread across seeds; restart variability describes search reliability, not uncertainty about human perception. Add both parameter-space and objective tolerances; projection creates plateaus that can satisfy the current spread-only stopping rule. [SciPy's Nelder–Mead API](https://docs.scipy.org/doc/scipy-1.16.2/reference/optimize.minimize-neldermead.html) distinguishes these tolerances and supports dimension-adaptive parameters.

5. **Document aggregation and influence semantics.** The negative-order Lehmer option is not coordinatewise monotone: with the implemented p=-2 convention, distances `[1,2]` aggregate to 1.2, while `[1,10]` aggregate to about 1.0891. Improving one pair can lower the score. This may be intentional emphasis on small distances, but deserves an explicit choice. `computeInfluences` at `optimizer/optimizePalette.js:606–650` measures a normal-vision aggregate change after deletion; it omits CVD weights and penalties and changes the pair count. It is not a decomposition of the optimized score, so “% Influence” should not be interpreted that way. Label it precisely or recompute a clearly defined full-objective deletion diagnostic. Keep fixed–fixed pairs excluded from extension optimization if desired, but include them when evaluating the quality of the complete exported palette.

6. **Make image clustering consistent with its distance objective.** `ui/imageInput.js:651–679` assigns candidates by OKLab distance but updates centers by averaging gamma-encoded RGB. That update is not the centroid minimizing squared OKLab distances. Average in OKLab, or use medoids if the output should be an observed pixel. The auto-count stopping rule checks only the highest frequency-weighted candidate, so it can stop while a rarer candidate still exceeds the distance threshold; filter eligible candidates before ranking if the threshold is intended as a distinctness rule. Recheck separation after refinement. The 150-pixel downsampling limit, top-1024 bucket truncation, fixed three iterations, and spatially averaged marker positions should be tested on rare accents, thin features, gradients, and repeated colors in disconnected image regions.

7. **Fail visibly on invalid numerical inputs.** `core/means.js` drops nonfinite distances and several conversion paths substitute zero for invalid channels. These behaviors can hide a broken model or malformed candidate. Validate configuration and coordinates at API boundaries, then explicitly reject invalid candidates. Keep “invalid calculation” distinct from a real zero distance or black color.

## Original audit validation and limitations (before fixes)

- `node --test color-optimization/tests/*.test.mjs`: **67 passed, 0 failed**. Node reports the existing unspecified ES-module package-type warning.
- A separate audit harness evaluated the 34 published CIEDE2000 pairs and reproduced the findings above. Correcting the rotation factor only in an in-memory function made all 34 reference pairs pass; no source fix was applied.
- A Chromium Playwright smoke check loaded the application, ran one restart with 10 Nelder–Mead iterations and one added color, reached **Finished**, and observed no page exceptions or displayed error.
- The existing static server command was used on port 18080 because port 8080 was already occupied. The audit server was stopped afterward.
- Whitespace checks passed for both audit documents. A repository-wide `git diff --check` reported whitespace in pre-existing `pocket-language-guide` changes; those unrelated files were left untouched.
- Reproduction script: `/tmp/color-optimization-audit/scripts/reproduce.mjs`. Its numeric output: `/tmp/color-optimization-audit/output/reproductions.json`. Browser harness: `/tmp/color-optimization-audit/scripts/browser-smoke.cjs`. These are temporary audit artifacts, not project dependencies.
- Existing distance tests check finiteness and nonnegativity, which do not establish formula correctness. Several conversion tests check round trips, which can pass when forward and inverse implementations share the same wrong convention.
- No full screenshot regression suite, exhaustive UI interaction matrix, broad stochastic benchmark, human-observer study, dependency security audit, or implementation fixes were performed. No claim of exhaustive bug coverage or global optimization quality is made.

## Suggested order of work

1. Add external mathematical fixtures and correct CIEDE2000/CAM16.
2. Establish one output-color and CVD simulation contract across scoring, export, and diagnostics.
3. Unify row-specific constraint handling and fix ordered lightness penalties.
4. Correct solver returns, contraction, and luminance scaling; reject invalid results explicitly.
5. Benchmark exported palettes, calibrate objective tradeoffs, and validate discriminability claims.
