# Statistical intuitions API

The gallery's entries are small closed-form (or seeded Monte Carlo) computations, one statistical idea each. They share a single entry point, `submit({entry, params}) → {entry, params, result}`. The request and the response are plain JSON. Every page's `window.Intuitions`, the command line and any script call this same function, and the same request (seed included) always gives the same response.

The entries are:

- [`zscore-outliers`](#zscore-outliers): pooled vs stratified z-score outlier removal for two normal groups.
- [`threshold-model`](#threshold-model): discrete traits from a hidden normal liability, one or two traits, and the polychoric fit of a contingency table.

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
| `submit(request)` | Runs the request and returns the response. On an entry's own page it also shows the request there (controls, figures and, for the threshold model, the matching view). An invalid request throws and leaves the page unchanged. |
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

Paths are `entry`, a top-level field, `params`, or a parameter such as `params.z`, `params.thresholds[0][1]`, `params.sample.n`, `params.table[1]` (a row) or `params.table[*][1]` (a column). An empty path means the request as a whole.

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
