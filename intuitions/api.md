# Statistical intuitions API

The gallery's entries are small closed-form (or seeded Monte Carlo) computations, one statistical idea each. They share a single entry point, `submit({entry, params}) → {entry, params, result}`. The request and the response are plain JSON. Every page's `window.Intuitions`, the command line and any script call this same function, and the same request (seed included) always gives the same response.

The entries are:

- [`zscore-outliers`](#zscore-outliers): pooled vs stratified z-score outlier removal for two normal groups.
- [`threshold-model`](#threshold-model): discrete traits from a hidden normal liability, one or two traits, and the polychoric fit of a contingency table.
- [`correlation-geometry`](#correlation-geometry): correlations as angles between arrows, in five views: data as arrows, the cone of fixed correlation, the cosine-rule range of a third correlation, how far apart *k* arrows can be, and one matrix entry's feasible interval (a feasible-correlation calculator).
- [`typical-set`](#typical-set): where the probability mass is, in four views: the chi distribution as density × volume, the original script's cube criterion for six families against sampled radii, one-dimensional mixtures with their highest-density region at a water level, and one coordinate of a uniform point on the sphere.
- [`dag-adjustment`](#dag-adjustment): adjustment sets in linear-Gaussian causal graphs: the regression coefficient each set gives against the causal effect, the adjustment criterion, every path, the front-door estimate, and what conditioning on many colliders does.
- [`null-pvalues`](#null-pvalues): ways to break a p-value: under a true null, the p-values of a common shortcut beside a sound analysis, and the realised false-positive rate at α, in seven scenarios (a batch regressed out first, covariates removed one at a time, a t-test on bootstrap means, autocorrelated series, two-step filtering, paired data tested as independent, and pathway tests kept only where a pathway has a hit).

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node intuitions/cli.mjs request.json      # response JSON on stdout
node intuitions/cli.mjs < request.json    # or read the request from stdin ("-" also works)
```

The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request or invalid JSON, or 2 for a usage problem or an unreadable file.

**ES module.** Nothing here touches the DOM; it runs in Node 22 and in browsers:

```js
import { submit, ENTRIES } from './intuitions/api.js';
const { result } = submit({ entry: 'zscore-outliers', params: { meanDifference: 1.5, z: 3, sweep: null } });
```

Each entry is also importable on its own: `intuitions/<entry>/compute.js` exports `compute(params)` (validates, then returns `result`), `resolveParams(params)` and `DEFAULTS`.

**In a page** (https://vetr.dev/intuitions/ and each entry's page):

| Member | Does |
| --- | --- |
| `submit(request)` | Runs the request and returns the response. On an entry's own page it also shows the request there (controls, figures and the matching view: the threshold model's tab, or the panel of correlation-geometry, typical-set, dag-adjustment or null-pvalues, scrolled into view). An invalid request throws and leaves the page unchanged. It runs on the page's thread, so a large simulation blocks the page until it returns; the null-pvalues page's own controls run theirs in a Web Worker. |
| `getRequest()` | The request the page's controls currently describe (`null` on the index). |
| `getResult()` | The response for that request (`null` on the index). |
| `entries` | The entry names. |

## Request

| Field | Type | Meaning |
| --- | --- | --- |
| `entry` | string | Required. One of the entry names above. |
| `params` | object | The entry's parameters. Optional: anything left out takes its default, and the response's `params` lists every value used. |

Unknown fields are rejected, both in the request and in `params`. Values are never coerced: `"2.5"` is not a number.

## zscore-outliers

Two normal groups, A and B, are mixed. The **stratified** rule removes values beyond each group's own mean ± *z* SD, so it removes 2Φ(−*z*) of every group. The **pooled** rule removes values beyond the pooled mean ± *z* pooled SD. Units are group A's SD, with the pooled mean at 0.

### Parameters

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `meanDifference` | number 0–6 | `2` | B's mean minus A's, in SDs of A. A negative difference only mirrors the picture. |
| `sdRatio` | number 0.2–5 | `1` | B's SD divided by A's. |
| `proportionA` | number 0.01–0.99 | `0.8` | Share of the data in group A. |
| `z` | number 0.5–6 | `2.5` | The cutoff in SDs. |
| `sweep` | `"meanDifference"`, `"sdRatio"`, `"proportionA"`, `"z"` or `null` | `"meanDifference"` | Parameter to sweep across its whole range (with the others held fixed) for `result.sweep`; `null` skips the sweep. |

### Result

| Field | Meaning |
| --- | --- |
| `pooled` | `{mean, sd, cutoffs}` of the pooled distribution; `cutoffs` are ± *z* × `sd`. |
| `groups[]` | One entry per group, A then B (below). |
| `overall` | `stratifiedRemoved`, `pooledRemoved`, `removedByBoth`, `onlyPooled`, `onlyStratified`, each a share of all the data. |
| `sweep` | `null`, or `{parameter, values, stratified, pooledA, pooledB, pooledOverall}`: 121 values of the swept parameter (log-spaced for `sdRatio`) and, at each, the stratified share and the pooled rule's share of A, of B and of all values. |

Each group has:

| Field | Meaning |
| --- | --- |
| `group` | `"A"` or `"B"`. |
| `proportion`, `mean`, `sd` | The group's share of the data, its mean (pooled mean 0) and SD (A's is 1). |
| `cutoffs` | `[low, high]`, the group's own mean ± *z* SD. |
| `stratifiedRemoved` | Share of the group removed by the stratified rule, 2Φ(−*z*). |
| `pooledRemoved` | Share of the group removed by the pooled rule, split into `pooledRemovedBelow` and `pooledRemovedAbove` the pooled cutoffs. |
| `removedByBoth`, `onlyPooled`, `onlyStratified` | Shares of the group removed by both rules, only by the pooled rule, and only by the stratified rule. |
| `shareOfPooledRemovals` | The group's share of everything the pooled rule removes (`null` if it removes nothing). |

In the R function this follows (`prop_outliers()` in `prop_outliers_zscores_redux.R`, `stratify_direction = TRUE`), `lost` is `overall.onlyPooled`, `gained` is `overall.onlyStratified` and `net` is `overall.stratifiedRemoved − overall.pooledRemoved`.

### Method

Every share is an exact normal interval probability. Each piece (for example the part of a group's kept middle that lies beyond a pooled cutoff) is integrated directly rather than found by subtracting larger probabilities, and upper tails are computed as upper tails, so tiny shares keep their precision. The normal CDF is R's algorithm, and the results match the R redux to about 1e-10 relative error; the redux differs slightly only where it subtracts two upper-tail probabilities in log space.

The first R version, `prop_outliers()` in `prop_outliers_zscores.R`, has two errors that the redux fixed and that this port does not repeat: it sets the second group's weight to `1 - 0.5` whatever the first group's weight is, and its "middle" integrals count the part of a group's kept middle beyond only the nearer pooled cutoff, so a group wider than the pooled SD loses the part beyond the far one.

## threshold-model

An ordered discrete trait arises when a hidden normal liability with SD 1 is cut at thresholds: category *c* is the liability between threshold *c* and threshold *c* + 1. With two traits the liabilities are bivariate normal with correlation `rho`, and the thresholds cut the plane into the cells of a contingency table. Give either a model (`means`, `thresholds`, `rho`, `sample`) or a `table`, not both.

### Parameters: a model

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `means` | array of 1 or 2 numbers, each −3 to 3 | `[0.75, 0.85]` | Latent mean of each trait; its length sets the number of traits. |
| `thresholds` | array with one array per trait, each 1–5 increasing numbers from −4 to 4, at least 0.01 apart | `[[0, 1, 2], [0, 0.8, 1.9]]` (the first entry for one trait) | Thresholds on each trait's liability scale. |
| `rho` | number −1 to 1 | `0.4` | Latent correlation. Two traits only. |
| `sample` | `null` or `{n, seed}`: `n` an integer 1–100,000, `seed` an integer 0–4,294,967,295 (default 1) | `null` | Draw `n` individuals from the two-trait model, tabulate them and fit the table. Two traits only. |

### Parameters: a table

| Field | Type | Meaning |
| --- | --- | --- |
| `table` | array of 2–8 rows of 2–8 counts each (integers ≥ 0) | Rows are trait 1's categories in order, columns trait 2's. No row or column may be all zero. |

### Result

For a model:

| Field | Meaning |
| --- | --- |
| `mode` | `"model"`. |
| `traits[]` | Per trait: `mean`, `thresholds` and `categories[]`, each `{category, lower, upper, probability}` (`null` bounds are infinite). |
| `rho` | Two traits: the latent correlation. |
| `cells` | Two traits: cell probabilities, `cells[i][j]` for trait 1 category *i* and trait 2 category *j*. |
| `codeCorrelation` | Two traits: the Pearson correlation of the category numbers 0, 1, 2, … under `cells`, the attenuated correlation a naive analysis would see (`null` if a trait has no spread). |
| `cosPiApproximation` | Two traits, 2 × 2 only (else `null`): cos(π / (1 + √(*AD*/*BC*))) of the cells. |
| `sample` | `null`, or `{n, seed, counts, fit, unfittable}`: the sampled table (`counts[i][j]` as for `cells`), its fit (as below) and, when a category came out empty so the fit is undefined, `fit: null` with the reason in `unfittable`. |

For a table, `{mode: "table", fit}`. A fit has:

| Field | Meaning |
| --- | --- |
| `n` | Total count. |
| `thresholds` | `[trait 1, trait 2]` thresholds on the standardised liability (mean 0), from the cumulative margins. |
| `rho`, `se` | The two-step polychoric (tetrachoric for 2 × 2) correlation and its standard error. |
| `atBoundary` | `true` when the likelihood is largest at `rho` = ±1 (all counts on one diagonal of a 2 × 2 table, for example); `se` is then `null`. |
| `logLikelihood` | Multinomial log-likelihood at the fit, Σ *n*ᵢⱼ log *p*ᵢⱼ. |
| `expected` | Fitted counts, `n` × the cell probabilities. |
| `codeCorrelation` | Pearson correlation of the category numbers in the table. |
| `cosPiApproximation` | 2 × 2 only (else `null`): the cos-π shortcut applied to the counts. |

### Method

- **Cells** are bivariate normal rectangle probabilities from Genz's algorithm (as in R's mvtnorm), accurate to about 1e-15 for every `rho` from −1 to 1.
- **Fitting** is the two-step estimate (Olsson 1979; R's `polycor::polychor` default): thresholds are the normal quantiles of the cumulative margins, then `rho` maximises the likelihood with the thresholds held fixed, to about 1e-10. `se` is the inverse square root of the observed information in `rho` alone, so it treats the thresholds as known, like polycor's two-step `std.err`.
- **Sampling** draws two seeded uniforms per individual (mulberry32) and turns them into liabilities by inversion, so the same seed gives the same individuals in Node and every browser, and changing a mean or `rho` moves each individual continuously.
- **The cos-π shortcut**, used by `rtet()` in the original R, equals the latent correlation only when both traits are split at their medians. It is reported for comparison, not used.
- The original two-trait animation script summed a density grid to get its heatmap and indexed the grid with its axes swapped, so its cells applied trait 1's thresholds to trait 2 and vice versa. The cells here are exact and keep the traits apart.

## correlation-geometry

Centre a variable's observations and scale them to length 1: the variable is an arrow, and the correlation of two variables is the cosine of the angle between their arrows. A correlation matrix is valid (positive semidefinite) exactly when some unit arrows have those angles. `params.view` picks one of five computations, all in closed form; the other fields depend on the view. Angles are in degrees.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `view` | `"arrows"`, `"cone"`, `"cosine-rule"`, `"equicorrelation"` or `"entry-range"` | `"arrows"` | Which computation. |

### view "arrows"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `a`, `b` | arrays of 2 or 3 numbers (the same length), each −1,000 to 1,000, not all equal | `[1, 2, 4]`, `[1, 3, 2]` | Two variables' observations. |

Result: `n`; `means`; `vectors`, the two centred unit arrows; `r`, their dot product (Pearson's *r*); `angle` = cos⁻¹ *r*; `circleAngles`, with 3 observations each arrow's position on the great circle where the plane *x* + *y* + *z* = 0 meets the unit sphere (measured from (1, −1, 0)/√2 toward (1, 1, −2)/√6; `null` for 2). With 2 observations every arrow is ±(√½, −√½), so *r* is ±1.

### view "cone"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `b`, `a` | arrays of 3 numbers, not all equal | `[1, 0, -1]`, `[-1, 2, -1]` | Observations of B and of a third variable A (3 observations). |
| `rBC` | number −1 to 1 | `0.6` | The correlation a new variable C must have with B. |

C lies on the cone of half-angle cos⁻¹ `rBC` around B. With three observations it must also lie on the great circle of centred arrows, which the cone meets at two points. Result: `b`, `a` (unit arrows); `halfAngle`; `circle` (`centre` = `rBC`·B and `radius` of the cone's circle on the sphere); `meets`, C's two possible arrows (B turned by ± `halfAngle` within the plane); `rAB`; `withA`, A's correlation with each, and `anglesWithA`; `circleAngles` of `a`, `b` and `meets`. The two values in `withA` are the ends of the `cosine-rule` interval for `rAB` and `rBC`.

### view "cosine-rule"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `rAB`, `rBC` | numbers −1 to 1 | `0.8`, `0.7` | Two correlations. |
| `rAC` | number −1 to 1, or `null` | `null` | A value of the third to test. |

Result: `angles` (`AB`, `BC`); `interval` = [cos(α + β), cos(α − β)] = `rAB`·`rBC` ∓ √((1 − `rAB`²)(1 − `rBC`²)), the values of r_AC that keep the 3 × 3 matrix PSD; its `centre` and `halfWidth`; `forcedSign`, `"positive"` or `"negative"` when the interval excludes 0 (which happens exactly when `rAB`² + `rBC`² > 1, with the sign of `rAB`·`rBC`), else `null`; `detMax`, det *R* at the centre; and `rAC`: `null`, or `{value, det, feasible, angle}` with det *R* = 1 − `rAB`² − `rBC`² − `rAC`² + 2`rAB``rBC``rAC`.

### view "equicorrelation"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `k` | integer 2–100 (3–100 with `zeroPair`) | `3` | Number of variables. |
| `r` | number −1 to 1 | `-0.25` | The common correlation of every pair (with `zeroPair`, of every pair but variables 1 and 2). |
| `zeroPair` | boolean | `false` | Hold the correlation of variables 1 and 2 at 0. |

Result: `range`, the values of `r` for which the matrix is PSD: [−1/(*k* − 1), 1], or with `zeroPair` [(*k* − 3) ∓ √(*k*² + 2*k* − 7)] / (4(*k* − 2)); `feasible`; `eigenvalues`, `{value, multiplicity}` from largest (1 + (*k* − 1)*r* once and 1 − *r* × (*k* − 1); with `zeroPair`, 1, 1 − *r* × (*k* − 3) and the two roots of λ² − (2 + *r*(*k* − 3))λ + 1 + *r*(*k* − 3) − 2(*k* − 2)*r*² = 0); `smallestEigenvalue`; `det`; `angle`; `widestAngle` (cos⁻¹ of the lower end); and `arrows`, for all pairs equal and feasible, `{along, across}`: each arrow's length along the common direction and across it (the parts across are the vertices of a regular simplex; at the lower limit `along` is 0), else `null`.

### view "entry-range"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `matrix` | square array of 2–20 rows; 1s on the diagonal, symmetric, entries −1 to 1, PSD | a 4 × 4 example | A correlation matrix. |
| `cell` | `[row, column]`, two different indices counting from 0 | `[0, 3]` (for 2 or 3 variables, `[0, p − 1]`) | The entry to free. |
| `observations` | integer 3–200 | `6` | *n* for the sample curve in `expectedWidth`. |

With every other entry fixed, entry (*i*, *j*) can take any value in an interval: centre *c* = *r*ᵢᵀ*S*⁺*r*ⱼ ± √((1 − *r*ᵢᵀ*S*⁺*r*ᵢ)(1 − *r*ⱼᵀ*S*⁺*r*ⱼ)), where *S* is the correlation matrix of the other variables, *r*ᵢ and *r*ⱼ their correlations with *i* and *j*, and *S*⁺ the (pseudo-)inverse. Result: `p`; `cell`; `value`; `eigenvalues` (largest first) and `det` of the matrix; `singular` (smallest eigenvalue below 1e-9); `interval`, `centre` (the value that maximises det *R*), `width`, and `position` of `value` in the interval (0 at the lower end, `null` if the width is 0); `unexplained`, the shares of *i* and *j* the other variables leave unexplained (1 − *r*ᵢᵀ*S*⁺*r*ᵢ, 1 − *r*ⱼᵀ*S*⁺*r*ⱼ); `detOthers` (det *S*) and `detMax` (det *R* at the centre), so det *R* = `detOthers` × ((`width`/2)² − (*r* − `centre`)²); `widths`, every entry's interval width (`null` on the diagonal) and their `meanWidth`; and `expectedWidth`: `{observations, dimensions, uniform, sample}`, the expected width of one entry's interval for each *p* from 2 to 200, for a matrix drawn uniformly from all correlation matrices (LKJ, η = 1) and for the sample correlation matrix of `observations` observations of independent normal variables.

### Method

- **Eigenvalues** come from a cyclic Jacobi decomposition, accurate to rounding for these sizes. A matrix counts as PSD when its smallest eigenvalue is at least −1e-9.
- **The cone's intersections** are B turned by ± cos⁻¹ `rBC` about the normal (1, 1, 1)/√3 of the centred plane. The original script (`correlation-teaching-figures.R`) found them by picking the nearest of 199 samples of the cone's circle, and its circle function divides by the arrow's third coordinate, so it fails when that is 0.
- **The largest common correlation with one pair at 0** is the larger root of 2(*k* − 2)*c*² − (*k* − 3)*c* − 1 = 0 (from the 2 × 2 block of the matrix on 1₁ + 1₂ and the sum of the others); `corrmat_psd_puzzle.R` searched a grid of steps of 0.001.
- **One entry's interval** follows the fixed `coef_bounds()` in `compound-symmetry_correlation_constraint.R`. The copy in `3-way_correlation_constraint.R` returns the interval's centre as its lower end (it sets the free Cholesky entry to 0 instead of to minus the remaining length). Using the pseudo-inverse keeps the formula right when the other variables are linearly dependent, as in a sample matrix with *p* ≥ *n*.
- **Expected widths** are exact. Uniform over correlation matrices, the shares of *i* and *j* left unexplained by the other *p* − 2 are independent products of (1 − ρ²) over independent partial correlations ρ ~ 2 Beta(β, β) − 1, β = 1 + (*p* − 1 − *k*)/2 at C-vine level *k* (Lewandowski, Kurowicka and Joe, 2009), and E√(1 − ρ²) = Γ(β + ½)²/(β Γ(β)²). In a sample matrix of *n* observations each share is Beta((*n* − *p* + 1)/2, (*p* − 2)/2), and 0 once *p* ≥ *n* + 1. The dissertation figure (`valid_range_for_naivecorrelationproposal.R`) estimated the uniform curve by Monte Carlo, stepping the entry by 0.001 until the matrix stopped being positive definite.
- **Facts the scripts state differently:** det *R* is the squared volume of the parallelotope the arrows span (√det *R* is the volume); a full-rank set of *p* centred arrows from *n* observations needs *p* ≤ *n* − 1, so a sample correlation matrix is singular once *p* ≥ *n* (at *p* = *n* each entry sits at an end of its interval, and the intervals have width 0 from *p* = *n* + 1); whitening column-vector data uses the inverse of the transposed (lower) Cholesky factor.

## typical-set

In *k* dimensions a standard normal's density is highest at the mode, but the volume at distance *r* grows like *r*^(*k*−1), so the mass, density × volume, sits in a shell at *r* ≈ √*k*. `params.view` picks one of four computations; the other fields depend on the view. Closed forms throughout; the two optional samples are seeded Monte Carlo.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `view` | `"shell"`, `"cube"`, `"modes"` or `"sphere"` | `"shell"` | Which computation. |

### view "shell"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `k` | integer 1–1,000 | `10` | Dimensions. |
| `coverage` | number 0.5–0.99 | `0.9` | Share of the mass in the central shell (and in the ball `hdrRadius`). |
| `radius` | number 0–60 | `1` | Radius of a ball around the mode whose mass is reported. |

The distance *R* from the mode is chi-distributed with *k* degrees of freedom (*R*² is chi-square). Result: `mode` = √(*k* − 1), where the mass peaks; `mean` = √2 Γ((*k* + 1)/2)/Γ(*k*/2); `sd`; `median`; `shell`, `{lo, hi, width}`, the central `coverage` interval of *R*; `hdrRadius`, the radius of the ball around the mode holding `coverage` (a normal's highest-density region); `ball`, `{radius, mass, log10Mass}`, P(*R* ≤ `radius`), with its log10 so that a share below the smallest double is still reported (`null` for radius 0); `log10DensityRatio`, log10 of the density at `mode` over the density at the mode, −(*k* − 1)/(2 ln 10); `curve`, 241 radii from 0 with `log10Density` (the *k*-dimensional normal density at that distance), `log10Surface` (the area of the sphere of that radius; `null` at 0 for *k* > 1) and `mass` (the chi density, their product); and `sweep`, for 50 dimensions from 1 to 1,000 (about 20 a decade, rounded), `mode`, `mean`, `sd`, `lo`, `hi` and `hdrRadius`.

### view "cube"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `family` | `"normal"`, `"laplace"`, `"uniform"`, `"logistic"`, `"t3"` or `"cauchy"` | `"normal"` | The distribution of each of *k* independent coordinates: normal, Laplace, uniform and logistic with variance 1; *t* with 3 degrees of freedom and the Cauchy at scale 1. |
| `sample` | `null` or `{n, seed}`: `n` an integer 1–5,000, `seed` an integer 0–4,294,967,295 (default 1) | `null` | Draw `n` points in each dimension and report their distances from the centre. |

`density_x_volume.R` asks which cube [−*a*, *a*]^*k* has the largest minimum density × volume, (2*a* *d*(*a*))^*k*. That is largest at the *a*\* that maximises *a* *d*(*a*), the same for every *k*, so the corner's distance is exactly *a*\*√*k*. Result: `halfWidth` (*a*\*: 1 for the normal, *t* and Cauchy, 1/√2 for the Laplace, √3 for the uniform, 2*su* with *u* tanh *u* = ½ for the logistic); `sd` of one coordinate (`null` for the Cauchy); `withinHalfWidth`, P(|*X*| ≤ *a*\*); `dimensions`, 1 to 1,024 in powers of 2; for each, `distance` (*a*\*√*k*) and `log10CubeMass` (log10 of the cube's mass, *k* log10 `withinHalfWidth`); `exact`, for the normal only, the chi `median`, `lo` (5%) and `hi` (95%) at each dimension (else `null`); and `sample`, `null` or `{n, seed, median, lo, hi}`, the sampled distances' median and 5% and 95% quantiles (R's default type 7) at each dimension.

### view "modes"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `components` | array of 1–3 `{weight, location, scale, shape}`: `weight` 0.001–1,000 (relative), `location` −100 to 100, `scale` 0.001–100, `shape` `"normal"` or `"laplace"` | the "bathtub" mixture below | A mixture. `scale` is the normal's SD or the Laplace's scale *b* (SD √2 *b*). |
| `level` | number 0–1 | `0.5` | The water level as a share of the peak density. |

The three mixtures of `mode_pathologies.R`, with its relative masses as weights: the spike, `[{"weight": 2, "location": 0, "scale": 0.02, "shape": "laplace"}, {"weight": 90, "location": 6, "scale": 1, "shape": "normal"}]`; two bumps, weights 40 and 40 at −6 and 6 with scale 1; and the bathtub, `[{"weight": 0.9, "location": -10, "scale": 10, "shape": "normal"}, {"weight": 0.1, "location": 10, "scale": 1, "shape": "normal"}]`. Result: `weights` (normalised); `mean`, `sd`, `median`; `modes`, every local maximum `{x, density}`, highest first, and `mode` and `peak` from the first; `densityAtMean` and `densityAtMedian` as shares of the peak; `threshold` (`level` × `peak`); `regions`, the highest-density region where the density exceeds `threshold`, as intervals `{lo, hi, mass, containsMode}` (`null` ends are infinite); `covered`, their total mass; `curve`, `{x, density}` on a grid that resolves every component; and `coverage`, `{level, covered}` for levels 0, 0.01, …, 1.

### view "sphere"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `k` | integer 2–1,000 | `10` | Dimensions. |
| `band` | number 0.001–1 | `0.1` | Half-width of a band around the equator, \|*x*₁\| < `band`. |
| `sample` | `null` or `{n, seed}`: `n` an integer 1–20,000 | `null` | Draw `n` uniform points on the sphere (*k* standard normals scaled to length 1). |

One coordinate *x*₁ of a uniform point on the unit sphere in *k* dimensions has density Γ(*k*/2) / (√π Γ((*k* − 1)/2)) (1 − *x*²)^((*k*−3)/2). Result: `sd` (1/√*k*); `bandMass`, P(\|*x*₁\| < `band`) = *I*(`band`²; ½, (*k* − 1)/2), the regularized incomplete beta function, since *x*₁² is Beta(½, (*k* − 1)/2); `normalBandMass`, the same share under the normal approximation *x*₁ ~ N(0, 1/*k*); `curve`, `{x, density}` at 400 cell midpoints in (−1, 1); and `sample`, `null` or `{n, seed, edges, density, bandShare, sd}`: an 80-bin histogram scaled as a density, the sampled share in the band and the sampled root mean square of *x*₁.

### Method

- **Gamma and beta functions** (`lib/special.js`): log-gamma by Lanczos's approximation, the regularized incomplete gamma function by its series or continued fraction (each tail computed directly, and in logs), its inverse by safeguarded Newton steps, and the incomplete beta function by its continued fraction. Against R 4.6 they agree with `lgamma` to 1e-14, `pchisq` and `qchisq` to 1e-12 and `pbeta` to 2e-12 (relative). The chi mean uses Γ(*x* + ½)/Γ(*x*) by recurrence, which keeps the SD accurate at large *k*.
- **Highest-density regions** are found exactly: each crossing of the density and the level is bracketed on the grid and bisected to rounding, and each region's mass is a difference of the mixture's distribution function.
- **Samples** are drawn by inversion from mulberry32 (`shared/rng.js`); the *t* coordinates are a normal over the root of a chi-square of three squared normals. The same seed gives the same points in Node and every browser.
- **What the scripts do differently.** `density_x_volume.R` centres its intervals one grid step left of 0 (on −0.01) and reports the distance to the far end, so each distance is one step (0.01√*k*) too long; its comment says its Laplace has variance 1, but `dexp(abs(x))` has variance 2 (this entry uses the unit-variance Laplace the comment describes); and its unused mass-contained term adds an interval's width where it means the log of the width. The bathtub animation in `mode_pathologies.R` weights its first grid cell by `diff(c(0, x))[1]` = −50 instead of 0.01, which shrinks its normaliser to 0.99934 and puts its printed coverage off the exact value in 19 of 300 frames (3 with equal cells, from the grid alone). `marginal_dist_of_unit_hypersphere.R` computes its constant with `gamma()`, which overflows for *k* ≥ 344 and makes its density NaN there; log-gamma does not. The cube criterion itself is right for what it computes; it does not say where the mass is, since the cube at *a*\* holds a vanishing share of it, and a Cauchy's distance from the centre grows like *k*, not √*k*.

## dag-adjustment

A linear-Gaussian causal graph: each node is Σ *b* × parent + its own normal noise. The graph fixes the covariance of all the nodes, and from it, exactly, the coefficient of the outcome on the exposure in a regression that also includes an adjustment set. That is compared with the causal effect, the sum over directed paths of the products of their coefficients. `params.view` picks one of two computations.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `view` | `"adjust"` or `"colliders"` | `"adjust"` | Which computation. |

### view "adjust"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `graph` | a preset name, or a graph object (below) | `"confounder"` | The graph. The presets are `"confounder"`, `"mediator"`, `"collider"`, `"m-bias"`, `"front-door"` (backdoor_frontdoor.R's smoking graph, with genotype unobserved) and `"happiness"` (happiness_numeracy.R's graph and simulated coefficients). The response's `params.graph` is always the full object, so it can be edited and sent back. |
| `exposure`, `outcome` | node ids, different, observed | the preset's (required for a graph object) | Whose effect on whom. |
| `adjust` | array of node ids | `[]` | The adjustment set: observed nodes other than the exposure and outcome. |
| `mediator` | a node id or `null` | the preset's (`"Tar"` for `"front-door"`, else `null`) | A mediator for the front-door estimate. |
| `noise` | `"unit"` or `"standardized"` | `"unit"` | `"unit"`: each node's own noise has variance 1. `"standardized"`: each node's noise variance makes its total variance 1, so the coefficients are standardized path coefficients (dagitty's `impliedCovarianceMatrix`); a graph whose coefficients would explain all of a node's variance is rejected. |
| `sample` | `null` or `{n, seed}`: `n` an integer 1–5,000 | `null` | Draw `n` points from the graph. |

A graph object is `{name?, nodes, edges}`: 2–12 `nodes`, each `{id, latent?, x?, y?}` (an `id` of up to 24 letters, digits and underscores starting with a letter; `latent: true` for an unobserved node; `x` and `y` place it for drawing, with *y* downward, and when any is missing the page lays the graph out in layers), and up to 40 `edges`, each `{from, to, coefficient}` with a coefficient from −10 to 10, at most one per pair of nodes, with no directed cycle. An edge with coefficient 0 counts as absent, for the verdicts as well as the numbers.

Result: `nodes` (ids in graph order); `covariance`, the implied covariance of all the nodes, latent ones included; `noiseVariances`; `effect`, the causal effect of the exposure on the outcome; `estimate`, for `adjust`: `coefficient` (of the exposure, regressing the outcome on the exposure and the set), `bias` (`coefficient` − `effect`), `unbiased` (|`bias`| ≤ 1e-9 (1 + |`effect`|)), `valid` (the adjustment criterion of Shpitser, VanderWeele and Robins (2010): the set contains no descendant of a node on a causal path from the exposure to the outcome, listed in `forbidden`, and d-separates them in the graph without the first edges of the causal paths), `r2` (of the outcome on the exposure and the set), `partialCorrelation` and `conditionalCovariance` (of the exposure and the outcome given the set); `paths`, every path between the exposure and the outcome ignoring direction (up to 100, with `pathsTruncated`), each `{nodes, arrows, causal, open, blockedBy, openedBy}`: `arrows` gives the direction of each step (`"→"` or `"←"`), `blockedBy` the non-colliders in the set and the colliders with no adjusted descendant that block it, and `openedBy` the colliders the set opens; `sets`, every subset of the observed candidates (when there are at most 6), each `{adjust, coefficient, bias, unbiased, valid}`, else `null`; `frontDoor`, `null` or, with a `mediator` *M*, `{mediator, exposureToMediator, mediatorToOutcome, estimate, bias, unbiased, criterion, conditions}`: the estimate is β(*M* ~ exposure) × β(outcome ~ *M* + exposure), and `criterion` is Pearl's front-door criterion, whose three `conditions` are that *M* intercepts every directed path, that the exposure and *M* share no open back-door path, and that the exposure blocks every back-door path from *M* to the outcome; and `sample`, `null` or `{n, seed, coefficient, points}`: the sample's own regression coefficient and, for each point, the exposure and the outcome with the set regressed out of each (by the Frisch–Waugh theorem their slope is that coefficient).

### view "colliders"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `colliders` | integer 1–1,024 | `8` | *p*, the number of colliders. |
| `rYX` | number 0–0.99 | `0.15` | Cor(Y, X*ᵢ*). |
| `share` | number 0–0.999 | `0.5` | Cor(U, X*ᵢ*)² as a share of 1 − `rYX`². |

Y and U are independent with variance 1; each X*ᵢ* is caused by both, with Cor(X*ᵢ*, X*ⱼ*) = `rYX`² + Cor(U, X)² (collider_effects_on_R2.R's setup). Result: `rXX`, `rUX`; `r2`, the share of Y's variance the colliders explain; `partialCorrelation` and `semipartialCorrelation` of Y and U given the colliders, and their conditional `covariance`; and `curves`: `{shares, byCount}`, the script's 101 shares (0 to 0.99 by 0.01, and 0.999) and, for 1, 4, 16, 64, 256 and 1,024 colliders and for `colliders`, `r2` and `partialCorrelation` at each share.

### Method

- **Covariance and regressions.** Σ is built node by node in causal order, which is (*I* − *B*)^−ᵀ Ω (*I* − *B*)^−¹; regression coefficients and conditional covariances solve the normal equations Σ*SS* β = Σ*SY* by Gaussian elimination. Against dagitty 0.3.4 the implied covariances agree to 1e-12, and `valid` matches `isAdjustmentSet` for every set of every preset.
- **Many colliders.** With *d* = 1 + (*p* − 1)`rXX`, the conditional variances are (1 − `rXX` + *p* Cor(U, X)²)/*d* for Y and (1 − `rXX` + *p* `rYX`²)/*d* for U and the covariance −*p* `rYX` Cor(U, X)/*d*, written without the subtraction from 1 that loses digits when the colliders explain nearly all of Y or U.
- **Samples** are drawn in causal order with normal noise by inversion from mulberry32, so a seed gives the same points everywhere.
- **What the scripts do differently.** `happiness_numeracy.R` asks dagitty for the adjustment sets of nodes `"USD"` and `"JOY"`, which are not in its graph, and calls `is_Illnesser`, which does not exist (it looks like `ggdag::is_confounder` after a find-and-replace of "Confound" with "Illness"); both stop with errors, and the corrected call gives `{Illness}`. Its simulation is unseeded with 10,000 draws; seeded with a million, its regressions agree with the exact values within 4 standard errors. `age_causal.R` rounds its implied covariance to four decimals before conditioning (harmless at its coefficients), and its second graph leaves three coefficients for dagitty to draw at random without a seed. `collider_effects_on_R2.R`'s `diag2()` turns a whole-number 1/(1 − `rXX`) of 2 or more into an identity matrix of that size, so with one collider the Sherman–Morrison step fails ("non-conformable arguments"; its own grid never meets such a value), and its 1 − *BC*⁻¹*B*ᵀ loses digits at many colliders: at 1,024 its partial correlation was off by up to 4 × 10⁻⁵ in the cases checked and fell below −1 at `rYX` = 0.95, `share` = 0.999. Its animation interpolated linearly between grid values of `rYX`.

## null-pvalues

When the null hypothesis is true, a valid test's p-value is uniform on [0, 1], so it falls at or below α a share α of the time. Each scenario analyses null data two ways, a common shortcut and a sound analysis, and describes the p-values each gives. `params.scenario` picks the scenario; every scenario takes `alpha`, and its other fields are below. Closed forms where they exist (`"batch"`, `"enrichment"` and the sound analysis of `"stepwise"`); seeded Monte Carlo otherwise.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `scenario` | `"batch"`, `"stepwise"`, `"bootstrap"`, `"autocorrelation"`, `"two-step"`, `"pairing"` or `"enrichment"` | `"batch"` | Which scenario. |
| `alpha` | number 0.0001–0.5 | `0.05` | The threshold for the false-positive rates. |
| `replicates` | integer 100–100,000 | per scenario | Monte Carlo replicates (`"two-step"` has `features` instead). |
| `seed` | integer 0–4,294,967,295 | `1` | Seed of the Monte Carlo (and of `"enrichment"`'s sample). |

A request whose simulation would take more than about a billion random draws is rejected (`too_much_work`). Every result has `scenario`, `alpha`, `simulation` (`null` when exact, else `{replicates, seed}`, or `{features, seed}`) and two analyses, `shortcut` and `sound`, each with:

| Field | Meaning |
| --- | --- |
| `name` | What the analysis does. |
| `method` | `"exact"` or `"monte-carlo"`. |
| `count`, `rejections` | How many p-values were simulated and how many are at or below α (`null` when exact). |
| `rejectionRate` | P(p ≤ α), the realised false-positive rate (the power, in `"pairing"` with a mean change); `null` when there was nothing to test. |
| `se` | Its Monte Carlo standard error (`null` when exact). |
| `histogram` | `{edges, density}`: 20 bins of width 0.05, each (a, b] and the first [0, 0.05], as a density, so a uniform's is 1 in every bin. |
| `curve` | `{threshold, rate}`: the share of p-values at or below each threshold. Exact: 121 thresholds from 10⁻⁴ to 1, evenly spaced in log. Monte Carlo: the empirical distribution function at each of the 20 smallest p-values, then at about 30 ranks a decade. |

### scenario "batch"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `perBatch` | integer 4–100 | `10` | Samples per batch. |
| `batches` | integer 2–8 | `2` | *k*, the number of batches. |
| `treatedShare` | number 0–1 | `0.5` | Share treated in each odd-numbered batch, rounded to whole samples; even-numbered batches have the rest treated. |

The shortcut fits lm(y ~ treatment + batch), subtracts the fitted batch effects from y, then tests the treatment in lm(y − batch effects ~ treatment); the sound analysis is the first model's test. Both give the same coefficient and residuals, and the shortcut's *t* is the model's times `tRatio` = √((*n* − 2)/(*n* − *k* − 1)) / √(1 − *R*²), so its distribution is exact. Result: `n`; `treated`, per batch; `r2`, *R*² of the treatment on the batches; `df`, `{model, shortcut}`; `tRatio`. A design that puts each batch wholly in one arm is rejected (`not_estimable`).

### scenario "stepwise"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `n` | integer 20–500 | `100` | Observations. |
| `steps` | integer 1–200, at most `n` − 3 | `50` | *k*, the noise covariates removed one at a time. |
| `finalDf` | `"fitted"` or `"rescaled"` | `"fitted"` | The final test as lm() fits it, on *n* − 2 df, or with σ rescaled to *n* − 2 − *k* df. |
| `replicates` | | `2000` | |

The treatment and each covariate are genotypes (0, 1 or 2 copies at frequency ½) and y is N(0, 2²). Each step regresses y on the treatment and one new covariate and subtracts the covariate times its coefficient; the shortcut then tests the treatment in lm(y ~ treatment). The sound analysis (exact) is one model with the treatment and all *k* covariates, whose *t* has exactly *n* − 2 − *k* df. Result: `df`, `{final, joint}`.

### scenario "bootstrap"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `n` | integer 5–200 | `50` | Observations in each of two N(0, 1) groups. |
| `resamples` | integer 10–5,000 | `1000` | *B*, bootstrap resamples of each group. |
| `replicates` | | `500` | |

The shortcut is Welch's *t*-test (R's `t.test`) of one group's *B* bootstrap means against the other's. The sound analysis is p = 1 − \|1 − 2*P*\|, with *P* the share of all *B*² pairs of bootstrap means in which the first group's is the larger.

### scenario "autocorrelation"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `n` | integer 20–1,000 | `200` | Length of each of two independent series. |
| `phi` | number 0–0.99 | `0.7` | The AR(1) coefficient of each (stationary, variance 1). |
| `naive` | `"pearson"` or `"fisher"` | `"pearson"` | The shortcut: `cor.test`'s *t* = *r* √((*n* − 2)/(1 − *r*²)) on *n* − 2 df, or Fisher's *z* = atanh(*r*) √(*n* − 3) against the normal. |
| `fix` | `"effective-df"`, `"circular-shift"` or `"newey-west"` | `"effective-df"` | The sound analysis, one of the script's three (see Method). |
| `replicates` | | `2000` | |

Result: `varianceInflation`, (1 + φ²)/(1 − φ²), about how many times the variance of *r* exceeds the 1/*n* the shortcut assumes.

### scenario "two-step"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `n` | integer 30–500 | `100` | Observations per group. |
| `effect` | number 0–1 | `0.1` | The variant's effect in both groups, per SD of the genotype. |
| `features` | integer 100–100,000 | `20000` | Variants simulated. |
| `q` | number 0.001–0.5 | `0.05` | The first step's Benjamini–Hochberg cut. |

In each group of each variant, the genotype is scaled to SD 1 and y = `effect` × genotype + N(0, 1), so there is no interaction. The shortcut keeps the variants whose BH-adjusted p-value in either group's own lm(y ~ x) is below `q`; the sound analysis keeps those whose main effect in lm(y ~ x + group) is. Both then test the interaction, the x:group coefficient of lm(y ~ x × group). Result: `selected`, `{shortcut, sound}`, the variants each keeps; `discoveries`, `{shortcut, sound}`, how many of their interaction tests survive BH at α (all false).

### scenario "pairing"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `pairs` | integer 3–200 | `10` | People, each measured twice. |
| `betweenSD` | number 0–10 | `2` | SD of the people's levels. |
| `changeSD` | number 0–10 | `0.5` | SD of each person's change. |
| `noiseSD` | number 0.01–10 | `1` | SD of the noise added to each measurement. |
| `meanChange` | number −5 to 5 | `0` | The true mean change; 0 is the null. |
| `replicates` | | `10000` | |

The shortcut is Welch's two-sample `t.test(before, after)`; the sound analysis is the one-sample `t.test(after − before)`. Result: `correlation` of a person's two measurements; `bothReject`, the share of replicates in which both tests reject.

### scenario "enrichment"

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `genes` | integer 100–100,000 | `20000` | Genes. |
| `de` | integer 1–5,000, fewer than `genes` | `50` | DE genes, chosen at random. |
| `minSize`, `maxSize` | integers 1–1,000, `minSize` ≤ `maxSize` ≤ `genes` | `5`, `50` | Pathway sizes, equally likely. |
| `pathways` | integer 10–20,000 | `2000` | Pathways in the sample. |

Each pathway is tested by the one-sided hypergeometric (Fisher) test, P(X ≥ x) for its overlap x with the DE genes. The p-value's distribution over pathways is computed exactly: the sound analysis takes every pathway, the shortcut only those with at least one hit. Result: `nonEmptyShare`, the share of pathways with a hit; `sample`, one draw of the script's experiment (the DE genes, then `pathways` pathways of distinct genes): `{pathways, seed, nonEmpty, rejections, discoveries}`, the last two `{shortcut, sound}` counts of p ≤ α and of BH-adjusted p-values below α.

### Method

- **Student's *t*** (`lib/special.js`): the two-sided tail as the regularized incomplete beta function *I*(df/(df + *t*²); df/2, ½), for any positive df, and its inverse by bisection in log space on whichever argument keeps its digits. Against R 4.6 they agree with `pt` to 1e-12 and `qt` to 1e-11 (relative).
- **The script's tests, on the same data.** On R's own series and samples the JavaScript reproduces `cor.test`, Fisher's *z*, the script's `cor_test_effdf` (the *t* test of *r* on *n* / (1 + 2 Σ ρₓ(*k*) ρᵧ(*k*)) observations, lags 1 to ⌊*n*^⅓⌋ of R's `acf`), `cor_test_tts` (the middle 80% of *x* against every circular shift of *y*, p = (1 + #\|*r*ₛ\| ≥ \|*r*₀\|)/*n*), `cor_test_hac` (`sandwich::NeweyWest` with lag ⌊4 (*n*/100)^(2/9)⌋, VAR(1) prewhitening by least squares, `adjust = TRUE`, and `lmtest::coeftest`'s *t* on *n* − 2 df), `t.test`, the `lm` p-values of the two-step script and `p.adjust(…, "BH")`, all to 1e-10 or better, and `dhyper`, `phyper` and `fisher.test`'s one-sided p-values to 1e-12. The hypergeometric probabilities come from their ratio recurrence from the mode, normalised.
- **Simulations** draw from mulberry32 (`shared/rng.js`), normals by inversion; the same seed gives the same p-values in Node and every browser. Each scenario's rates agree with the original script's, rerun with seeds, within Monte Carlo error.
- **What the scripts do differently.** `stepwise_regression_inflate_false_disc.R`'s corrected p-value is `(1 - pt(t, df = n-2-50)) * 2` with a signed *t*: it exceeds 1 whenever *t* < 0, half the time, so the script counts one side only and reports about 10% where the procedure rejects about 21%; and the correction changes only the reference df, keeping σ on *n* − 2 (rescaling σ, `finalDf: "rescaled"`, gives about 6.5%). `bootstrap_ttest_demo.R` estimates the bootstrap difference's share from 5,000 random pairings; this entry uses all *B*² pairs. `fisher-cor-pval_deflation.R` defines `cor.sim` twice, and the second definition, which it runs, offers only `cor.test`, so its remedies are never called; its `cor_test_effdf` is NaN when *n*ₑff < 2, where this entry floors *n*ₑff − 2 at 1 as the script already does for the df. `two-step_multiple-testing.R`'s second part selects with `fits` from the first part (columns A and B) instead of its own combined fits (columns x and f), so its interaction p-values are uniform for the wrong reason; its second part also halves the sample, which this entry does not. `test-1s-vs-2s.R` compares a one-sample test of the paired differences with a two-sample test at a true change of 0.25, which measures power; here the change defaults to 0. `hypergeometric_bias.R` draws each pathway's genes with replacement, so about 0.1% repeat; here a pathway has exactly its stated number of distinct genes. `basic_batch_correction_error.R` is right, and its seeded simulation (20,000 replicates) gives 5.77% ± 0.16% against the exact 5.70%.

## Errors

An invalid request throws an `IntuitionsError` (in the CLI, JSON on stderr) that reports every problem at once:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid request: params.thresholds[0][1]: must exceed the threshold before it by at least 0.01; params.rho: applies only to two traits; give two means",
    "issues": [
      { "code": "out_of_range", "path": "params.thresholds[0][1]", "message": "must exceed the threshold before it by at least 0.01" },
      { "code": "not_applicable", "path": "params.rho", "message": "applies only to two traits; give two means" }
    ]
  }
}
```

That is the response to `{"entry": "threshold-model", "params": {"means": [0.2], "rho": 0.5, "thresholds": [[1, 0.5]]}}`. The top-level `code` is `invalid_request`; in the CLI it can also be `invalid_json`, `usage` or `unreadable_input`, which have no issues. The message names the first three issues.

Each issue has a `code`, a `path` and a `message`. The codes are:

- `unknown_entry`
- `unknown_field`
- `missing_field`
- `wrong_type`
- `out_of_range`
- `conflicting_fields` (a table and a model in one request)
- `not_applicable` (`rho` or `sample` with one trait)
- `empty_category` (a table row or column with no counts)
- `no_spread` (a variable whose values are all equal has no direction)
- `unknown_node` (a node id that is not in the graph)
- `not_observed` (an unobserved node as the exposure, outcome, mediator or in the adjustment set)
- `duplicate_node`, `duplicate_edge` (two nodes with one id; two edges between one pair of nodes)
- `cyclic` (a directed cycle, or an edge from a node to itself)
- `not_standardizable` (standardized noise, but a node's coefficients explain all of its variance)
- `not_symmetric` (a matrix entry that differs from its mirror)
- `not_positive_semidefinite` (no arrows have these correlations; the message gives the smallest eigenvalue)
- `not_estimable` (a batch design in which treatment and batch cannot be told apart)
- `too_much_work` (a simulation of more than about a billion random draws)

Paths are `entry`, a top-level field, `params`, or a parameter such as `params.z`, `params.thresholds[0][1]`, `params.sample.n`, `params.table[1]` (a row), `params.table[*][1]` (a column), `params.matrix[2][0]`, `params.cell[1]`, `params.components[0].scale`, `params.graph.edges[1].to` `params.adjust[0]` or `params.replicates`. An empty path means the request as a whole.

## Worked examples

The CLI prints one line; the responses below are shown indented.

**What does a pooled 2.5-SD cutoff do to a group that is 20% of the data and 2 SD away?** `zscore.json`:

```json
{"entry": "zscore-outliers", "params": {"meanDifference": 2, "proportionA": 0.8, "z": 2.5, "sweep": null}}
```

`node intuitions/cli.mjs zscore.json` prints:

```json
{
  "entry": "zscore-outliers",
  "params": { "meanDifference": 2, "sdRatio": 1, "proportionA": 0.8, "z": 2.5, "sweep": null },
  "result": {
    "pooled": { "mean": 0, "sd": 1.2806248474865698, "cutoffs": [-3.2015621187164243, 3.2015621187164243] },
    "groups": [
      {
        "group": "A", "proportion": 0.8, "mean": -0.3999999999999999, "sd": 1, "cutoffs": [-2.9, 2.1],
        "stratifiedRemoved": 0.01241933065155227, "pooledRemoved": 0.00270094787232033,
        "pooledRemovedBelow": 0.0025427924625545228, "pooledRemovedAbove": 0.00015815540976580751,
        "removedByBoth": 0.00270094787232033, "onlyPooled": 0, "onlyStratified": 0.00971838277923194,
        "shareOfPooledRemovals": 0.1651177880823706
      },
      {
        "group": "B", "proportion": 0.19999999999999996, "mean": 1.6, "sd": 1, "cutoffs": [-0.8999999999999999, 4.1],
        "stratifiedRemoved": 0.01241933065155227, "pooledRemoved": 0.05462702377752534,
        "pooledRemovedBelow": 7.871632765612767e-7, "pooledRemovedAbove": 0.05462623661424878,
        "removedByBoth": 0.006210452489052703, "onlyPooled": 0.04841657128847264, "onlyStratified": 0.006208878162499574,
        "shareOfPooledRemovals": 0.8348822119176293
      }
    ],
    "overall": {
      "stratifiedRemoved": 0.01241933065155227, "pooledRemoved": 0.01308616305336133,
      "removedByBoth": 0.003402848795666804, "onlyPooled": 0.009683314257694526, "onlyStratified": 0.009016481855885466
    },
    "sweep": null
  }
}
```

The pooled rule removes 1.31% of all values, close to the 1.24% intended, which hides what it does to each group: it removes 5.46% of B (4.4 times the intended share) and 0.27% of A, so B, one fifth of the data, makes up 83% of what is removed.

**A two-trait model with a sample.** `model.json`:

```json
{"entry": "threshold-model", "params": {"means": [0, 0.5], "thresholds": [[0.5], [1]], "rho": 0.5, "sample": {"n": 200, "seed": 7}}}
```

`node intuitions/cli.mjs model.json` prints:

```json
{
  "entry": "threshold-model",
  "params": { "means": [0, 0.5], "thresholds": [[0.5], [1]], "rho": 0.5, "sample": { "n": 200, "seed": 7 } },
  "result": {
    "mode": "model",
    "traits": [
      {
        "mean": 0, "thresholds": [0.5],
        "categories": [
          { "category": 0, "lower": null, "upper": 0.5, "probability": 0.691462461274013 },
          { "category": 1, "lower": 0.5, "upper": null, "probability": 0.30853753872598694 }
        ]
      },
      {
        "mean": 0.5, "thresholds": [1],
        "categories": [
          { "category": 0, "lower": null, "upper": 1, "probability": 0.691462461274013 },
          { "category": 1, "lower": 1, "upper": null, "probability": 0.30853753872598694 }
        ]
      }
    ],
    "rho": 0.5,
    "cells": [[0.5462444438570894, 0.14521801741692353], [0.14521801741692353, 0.16331952130906338]],
    "codeCorrelation": 0.3193185978215757,
    "cosPiApproximation": 0.5167558564768534,
    "sample": {
      "n": 200, "seed": 7,
      "counts": [[96, 40], [32, 32]],
      "fit": {
        "n": 200,
        "thresholds": [[0.46769879911450835], [0.35845879325119373]],
        "rho": 0.3216458561930828, "se": 0.10863954041375079, "atBoundary": false,
        "logLikelihood": -252.12377098495512,
        "expected": [[96.00000000000001, 40], [31.999999999999996, 31.999999999999996]],
        "codeCorrelation": 0.20008168266626034,
        "cosPiApproximation": 0.3319870848689476
      },
      "unfittable": null
    }
  }
}
```

Both traits are split at their 69th percentile, so a latent correlation of 0.5 shows up as a correlation of 0.32 between the 0/1 codes, and the cos-π shortcut says 0.52. This sample of 200 happens to land 1.6 standard errors below the true 0.5.

**Fitting a table.** `table.json`:

```json
{"entry": "threshold-model", "params": {"table": [[70, 5], [15, 10]]}}
```

`node intuitions/cli.mjs table.json` prints:

```json
{
  "entry": "threshold-model",
  "params": { "table": [[70, 5], [15, 10]] },
  "result": {
    "mode": "table",
    "fit": {
      "n": 100,
      "thresholds": [[0.6744897501960817], [1.0364333894937894]],
      "rho": 0.6606050832082203, "se": 0.13077617349259493, "atBoundary": false,
      "logLikelihood": -91.42855814670992,
      "expected": [[70, 4.999999999999999], [14.999999999999996, 10]],
      "codeCorrelation": 0.4042260417272216,
      "cosPiApproximation": 0.7146058932792196
    }
  }
}
```

The tetrachoric correlation is 0.66 ± 0.13. With margins of 75/25 and 85/15 the cos-π shortcut overstates it at 0.71, and the 0/1 codes correlate at only 0.40.

**Can A and C be uncorrelated when A~B is 0.8 and B~C is 0.7?** `cosine.json`:

```json
{"entry": "correlation-geometry", "params": {"view": "cosine-rule", "rAB": 0.8, "rBC": 0.7, "rAC": 0}}
```

`node intuitions/cli.mjs cosine.json` prints:

```json
{
  "entry": "correlation-geometry",
  "params": { "view": "cosine-rule", "rAB": 0.8, "rBC": 0.7, "rAC": 0 },
  "result": {
    "view": "cosine-rule", "rAB": 0.8, "rBC": 0.7,
    "angles": { "AB": 36.86989764584401, "BC": 45.5729959991943 },
    "interval": [0.131514294287429, 0.9884857057125709],
    "centre": 0.5599999999999999, "halfWidth": 0.42848570571257094,
    "forcedSign": "positive", "detMax": 0.18359999999999996,
    "rAC": { "value": 0, "det": -0.13000000000000006, "feasible": false, "angle": 90 }
  }
}
```

No: the arrows are 36.9° and 45.6° apart, so A and C are at most 82.4° apart and r_AC is at least 0.13. With r_AC = 0, det *R* would be −0.13.

**The feasible-correlation calculator.** `entry.json` frees entry (0, 2) of a 3 × 3 matrix:

```json
{"entry": "correlation-geometry", "params": {"view": "entry-range", "matrix": [[1, 0.7, 0.5], [0.7, 1, 0.6], [0.5, 0.6, 1]], "cell": [0, 2]}}
```

`node intuitions/cli.mjs entry.json` prints (abridged: `expectedWidth`'s four arrays run to p = 200 and are cut here to their first three values):

```json
{
  "entry": "correlation-geometry",
  "params": { "view": "entry-range", "matrix": [[1, 0.7, 0.5], [0.7, 1, 0.6], [0.5, 0.6, 1]], "cell": [0, 2], "observations": 6 },
  "result": {
    "view": "entry-range", "p": 3, "cell": [0, 2], "value": 0.5,
    "eigenvalues": [2.2037112930360805, 0.5135104761655941, 0.2827782307983255],
    "det": 0.32000000000000006, "singular": false,
    "interval": [-0.15131427428342809, 0.991314274283428],
    "centre": 0.42, "width": 1.1426285485668561, "position": 0.5700140042014006,
    "unexplained": [0.51, 0.64], "detOthers": 1, "detMax": 0.3264000000000001,
    "widths": [[null, 1.3856406460551018, 1.1426285485668561], [1.3856406460551018, null, 1.2369316876852983], [1.1426285485668561, 1.2369316876852983, null]],
    "meanWidth": 1.2550669607690854,
    "expectedWidth": { "observations": 6, "dimensions": [2, 3, 4], "uniform": [2, 1.4410123895799147, 1.1249999999999998], "sample": [2, 1.5614022587660903, 1.1250000000000004] }
  }
}
```

Given r_AB = 0.7 and r_BC = 0.6, r_AC can be anything from −0.15 to 0.99; 0.5 sits 57% of the way up. The centre 0.42 = 0.7 × 0.6 is the completion with the largest determinant. A matrix that is not positive semidefinite, such as `[[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]]`, is rejected with exit status 1 and the issue `{"code": "not_positive_semidefinite", "path": "params.matrix", "message": "is not positive semidefinite (its smallest eigenvalue is -0.8), so no set of arrows has these correlations"}`.

**Where is a 100-dimensional normal's mass?** `shell.json`:

```json
{"entry": "typical-set", "params": {"view": "shell", "k": 100, "radius": 7}}
```

`node intuitions/cli.mjs shell.json` prints (abridged: `curve`'s arrays have 241 values and `sweep`'s 50, cut here to two):

```json
{
  "entry": "typical-set",
  "params": { "view": "shell", "k": 100, "coverage": 0.9, "radius": 7 },
  "result": {
    "view": "shell", "k": 100, "coverage": 0.9,
    "mode": 9.9498743710662, "mean": 9.97503163955105, "sd": 0.7062179479137426, "median": 9.966650853520875,
    "shell": { "lo": 8.827766714465069, "hi": 11.150879490157001, "width": 2.323112775691932 },
    "hdrRadius": 10.885678840157926,
    "ball": { "radius": 7, "mass": 0.0000041007655781351365, "log10Mass": -5.3871350566165 },
    "log10DensityRatio": -21.497576854210962,
    "curve": { "radius": [0, 0.05623098090802725], "log10Density": [-39.908993417905755, -39.90968002080775], "log10Surface": [null, -161.37799094501784], "mass": [0, 5.156191447484109e-202] },
    "sweep": { "k": [1, 2], "mode": [0, 1], "mean": [0.7978845608028654, 1.2533141373155003], "sd": [0.6028102749890869, 0.6551363775620335], "lo": [0.06270677794321378, 0.3202914122718575], "hi": [1.9599639845400545, 2.447746830680816], "hdrRadius": [1.6448536269514726, 2.1459660262893476] }
  }
}
```

90% of the mass lies between 8.8 and 11.2 from the mode, where the density is 10⁻²¹·⁵ of its value at the mode. A ball of radius 7 around the mode, reaching seven SDs out along every axis, holds 0.0004% of it.

**Does adjusting for income show what numeracy does to satisfaction?** `numeracy.json`, on happiness_numeracy.R's graph:

```json
{"entry": "dag-adjustment", "params": {"graph": "happiness", "exposure": "Numeracy", "adjust": ["Income"]}}
```

`node intuitions/cli.mjs numeracy.json` prints (abridged: `params.graph` is the full graph object, and `covariance` and `noiseVariances` are left out):

```json
{
  "entry": "dag-adjustment",
  "params": { "view": "adjust", "graph": { "name": "happiness", "nodes": ["…"], "edges": ["…"] }, "exposure": "Numeracy", "outcome": "Satisfaction", "adjust": ["Income"], "mediator": null, "noise": "unit", "sample": null },
  "result": {
    "view": "adjust", "nodes": ["Numeracy", "Satisfaction", "Income", "Illness"],
    "effect": 4,
    "estimate": {
      "adjust": ["Income"], "coefficient": -2, "bias": -6, "unbiased": false, "valid": false, "forbidden": ["Income"],
      "r2": 0.918918918918919, "partialCorrelation": -0.5547001962252289,
      "conditionalCovariance": [[0.33333333333333337, -0.6666666666666661], [-0.6666666666666661, 4.333333333333329]]
    },
    "paths": [
      { "nodes": ["Numeracy", "Income", "Satisfaction"], "arrows": ["→", "→"], "causal": true, "open": false, "blockedBy": ["Income"], "openedBy": [] },
      { "nodes": ["Numeracy", "Income", "Illness", "Satisfaction"], "arrows": ["→", "←", "→"], "causal": false, "open": true, "blockedBy": [], "openedBy": ["Income"] }
    ],
    "pathsTruncated": false,
    "sets": [
      { "adjust": [], "coefficient": 4, "bias": 0, "unbiased": true, "valid": true },
      { "adjust": ["Income"], "coefficient": -2, "bias": -6, "unbiased": false, "valid": false },
      { "adjust": ["Illness"], "coefficient": 4, "bias": 0, "unbiased": true, "valid": true },
      { "adjust": ["Income", "Illness"], "coefficient": 0, "bias": -4, "unbiased": false, "valid": false }
    ],
    "frontDoor": null,
    "sample": null
  }
}
```

No. Numeracy's effect, all through income, is +4. Adjusting for income blocks that path and opens Numeracy → Income ← Illness → Satisfaction, where income is a collider, so the coefficient comes out −2. Adjusting for nothing, or for illness, gives 4.

**How wrong is it to regress out a batch first when the treatment is unbalanced across batches?** `batch.json`:

```json
{"entry": "null-pvalues", "params": {"scenario": "batch", "treatedShare": 0.8}}
```

`node intuitions/cli.mjs batch.json` prints (abridged: each `histogram` has 21 edges and 20 densities and each `curve` 121 points, cut here to two):

```json
{
  "entry": "null-pvalues",
  "params": { "scenario": "batch", "alpha": 0.05, "perBatch": 10, "batches": 2, "treatedShare": 0.8 },
  "result": {
    "scenario": "batch", "alpha": 0.05, "simulation": null,
    "n": 20, "treated": [8, 2], "r2": 0.36000000000000004, "df": { "model": 17, "shortcut": 18 }, "tRatio": 1.2862393885688164,
    "shortcut": {
      "name": "Batch regressed out first", "method": "exact", "count": null, "rejections": null,
      "rejectionRate": 0.12077052485856765, "se": null,
      "histogram": { "edges": [0, 0.05], "density": [2.415410497171353, 1.490498250112895] },
      "curve": { "threshold": [0.0001, 0.00010797751623277097], "rate": [0.0012543786893703596, 0.0013315511380306384] }
    },
    "sound": {
      "name": "Batch in the model", "method": "exact", "count": null, "rejections": null,
      "rejectionRate": 0.05, "se": null,
      "histogram": { "edges": [0, 0.05], "density": [1, 1] },
      "curve": { "threshold": [0.0001, 0.00010797751623277097], "rate": [0.0001, 0.00010797751623277097] }
    }
  }
}
```

With 8 of 10 treated in one batch and 2 of 10 in the other, the batch accounts for 36% of the treatment's variance. Regressing it out first inflates the treatment's *t* by 1.29, and a test at 0.05 rejects a true null 12.1% of the time; at 0.0001 it rejects 12.5 times too often.
