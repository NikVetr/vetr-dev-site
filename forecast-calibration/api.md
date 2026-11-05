# Forecast Calibration API

Forecast Calibration compares stated probabilities with what happened. It has a single entry point, `submit(request) → result`. The request and the result are plain JSON. The web page, `window.ForecastCalibration` and the command line all call this same function, and the same request (seed included) always gives the same result.

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node forecast-calibration/cli.mjs request.json            # result JSON on stdout
node forecast-calibration/cli.mjs < request.json          # or read the request from stdin ("-" also works)
node forecast-calibration/cli.mjs request.json --svg plot.svg   # also write the calibration plot
```

The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request or invalid JSON, or 2 for a usage problem or an unreadable file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers:

```js
import { submit, renderSvg, binsCsv, parseTable } from './forecast-calibration/core/index.js';
const result = submit({ table: 'probability,outcome\n0.7,1\n0.7,0\n0.9,1\n' });
const svg = renderSvg(result, { width: 720, height: 600, theme: 'light', worldOpacity: 0.01 });
```

**In the page** (https://vetr.dev/forecast-calibration/):

| Member | Does |
| --- | --- |
| `submit(request)` | Runs the request, loads it into the table and settings, and returns the result. An invalid request throws and leaves the page unchanged. |
| `getRequest()` | Returns the request the page's table and settings currently describe. |
| `getResult()` | Returns the result on display, or `null` while the table has problems. |
| `exportSvgText()` | Returns the plot as SVG text, 720 × 600, in the current theme. |
| `exportPngBlob()` | Returns a Promise of the same plot as a PNG `Blob`, 1440 × 1200. |
| `exportBinsCsv()` | Returns the per-bin table as CSV text. |

## Request

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `predictions` | array | (required, or `table`) | One object per prediction: `probability`, `outcome`, optional `text`. |
| `table` | string | (required, or `predictions`) | The same predictions as CSV or TSV text. |
| `bins` | `"distinct"` or integer 2–100 | `"distinct"` | `"distinct"` gives one bin per stated probability; an integer K gives K equal-width bins. |
| `simulations` | integer 100–1,000,000 | `100000` | Number of simulated worlds behind the p-values and intervals. |
| `plotWorlds` | integer 0–10,000, at most `simulations` | `2000` | Number of those worlds returned in `worlds` and drawn in the plot. |
| `interval` | number, 0 < x < 1 | `0.95` | Central share of simulated worlds used for each bin's `interval`. |
| `seed` | integer 0–4,294,967,295 | `1` | Seed for the simulated worlds. |

Give exactly one of `predictions` and `table`. Unknown fields are rejected, both in the request and in each prediction.

A prediction object has these fields:

- `probability` is a number strictly between 0 and 1. Exactly 0 and exactly 1 are rejected: a 0% or 100% forecast that turns out wrong has infinite log loss, so the scores would be undefined. Use 0.01 or 0.99 instead.
- `outcome` is `true` or `false`, or `1` or `0`.
- `text` is an optional string. It is only carried for display and does not enter the analysis.

A `table` has these rules:

- The first non-blank line is a header naming the columns `probability`, `outcome` and, optionally, `text`. Columns can come in any order and names are case-insensitive.
- Cells are tab-separated if the header line contains a tab, and comma-separated otherwise.
- Cells containing commas, quotes or line breaks are wrapped in double quotes, with quotes inside doubled (`""`).
- Blank lines are skipped.
- A probability is written as a number (`0.7`, `.7`, `7e-1`) or a percentage (`70%`).
- An outcome is one of `1`, `0`, `true`, `false`, `yes` or `no`, case-insensitive.

## Result

| Field | Meaning |
| --- | --- |
| `n` | Number of predictions. |
| `settings` | The settings used, with defaults filled in: `bins`, `simulations`, `plotWorlds`, `interval`, `seed`. |
| `bins[]` | One entry per non-empty bin, in order of stated probability (see below). |
| `calibration.weighted` | `{statistic, p}` for the squared calibration error weighted by bin size. |
| `calibration.unweighted` | `{statistic, p}` for the same error with every bin weighted equally. |
| `logLoss.total`, `logLoss.mean` | Total log loss (natural log) and the total divided by `n`. |
| `logLoss.coinFlip` | Total log loss of saying 50% every time, `n log 2`, for reference. |
| `logLoss.p` | Monte Carlo p-value of the total log loss. |
| `logLoss.expected` | `{mean, sd}` of total log loss for a calibrated forecaster at these probabilities, in closed form. |
| `logLoss.simulated` | `{mean, sd}` of total log loss over the simulated worlds. It matches `expected` up to Monte Carlo error. |
| `worlds` | Hits per bin in each of the first `plotWorlds` simulated worlds: an array of arrays aligned with `bins`. |

Each bin has these fields:

| Field | Meaning |
| --- | --- |
| `label` | `"70%"` for a distinct bin, `"[60%, 70%)"` for an equal-width bin. |
| `probabilityRange` | `[from, to]`. Both equal the stated probability for a distinct bin; for an equal-width bin they are the bin edges. |
| `meanProbability` | Mean stated probability of the bin's predictions. This is where the bin is plotted. |
| `n`, `hits` | Number of predictions in the bin, and how many of them happened. |
| `frequency` | `hits / n`. |
| `interval` | `[low, high]`: the central `interval` share of the bin's simulated frequencies. |
| `position` | `"below"`, `"inside"` or `"above"`, comparing `frequency` with `interval`. |

## Method

- **Bins.** With `"distinct"`, every distinct stated probability is a bin. With K equal-width bins, bin k covers [k/K, (k+1)/K); a probability within 1e-9 of an edge counts as being on the edge, so 0.29 falls in [29%, 30%). Empty bins are omitted.
- **Simulated worlds.** In each world, every prediction independently comes true with exactly its stated probability (a calibrated forecaster). The random numbers come from mulberry32 seeded with `seed`, so a given request draws the same worlds in Node and in every browser. One set of worlds is used for all tests, the intervals and the plot.
- **Calibration error.** Write f_b for bin b's frequency, p_b for its mean stated probability and n_b for its size. The weighted statistic is Σ_b (n_b / n)(f_b − p_b)². The unweighted statistic is the mean over bins of (f_b − p_b)².
- **Log loss.** The total is −Σ_i [y_i log p_i + (1 − y_i) log(1 − p_i)], using the natural log. For a calibrated forecaster its expected value is −Σ [p log p + (1 − p) log(1 − p)] and its variance is Σ p(1 − p)(log(p / (1 − p)))².
- **p-values.** Each p-value is the share of simulated worlds whose statistic is strictly greater than the observed one. Worlds that tie with the observed value are not counted. A small p means a calibrated forecaster would rarely do as badly. For log loss, a p close to 1 means less loss than calibrated forecasts at these probabilities usually incur, which is the signature of underconfidence. A p of 0 means no simulated world exceeded the observed value, so the true p is below 1 / `simulations`.
- **Intervals.** Each interval is the sample quantile of the simulated frequencies at (1 − `interval`) / 2 and 1 − (1 − `interval`) / 2, computed like R's `quantile(type = 1)`.

## Errors

An invalid request throws a `ForecastCalibrationError` (in the CLI, JSON on stderr) that reports every problem at once:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid request: predictions[1].probability: is exactly 1: a 0% or 100% forecast that turns out wrong has infinite log loss, ...",
    "issues": [
      { "code": "out_of_range", "path": "predictions[1].probability", "message": "is exactly 1: a 0% or 100% forecast that turns out wrong has infinite log loss, so stated probabilities must lie strictly between 0 and 1 (for example 0.01 or 0.99)" }
    ]
  }
}
```

The top-level `code` is `invalid_request`. In the CLI it can also be `invalid_json`, `usage` or `unreadable_input`, and those have no issues.

Each issue has a `code`, a `path` and a `message`. The issue codes are:

- `unknown_field`
- `missing_field`
- `conflicting_fields` (both `predictions` and `table` were given)
- `wrong_type`
- `out_of_range`
- `table_syntax`

The `path` takes one of these forms:

- `predictions[i].field`, where i is the 0-based index into `predictions`.
- A setting's name, such as `seed`.
- `""` for the request as a whole.
- `table`, for problems in a table. These issues also carry `line`, the 1-based line number in the table text (the header is line 1).

## Worked example

`request.json`:

```json
{
  "predictions": [
    { "text": "It snows in town at least once", "probability": 0.6, "outcome": true },
    { "text": "The bike lane opens before summer", "probability": 0.6, "outcome": false },
    { "text": "I run a half marathon", "probability": 0.6, "outcome": true },
    { "text": "The grant renewal is approved", "probability": 0.9, "outcome": true },
    { "text": "The bakery is still open at year end", "probability": 0.9, "outcome": true },
    { "text": "Rent goes up at renewal", "probability": 0.9, "outcome": false }
  ],
  "simulations": 10000,
  "plotWorlds": 3,
  "seed": 1
}
```

`node forecast-calibration/cli.mjs request.json` prints the following (shown indented here; the CLI prints it on one line):

```json
{
  "n": 6,
  "settings": { "bins": "distinct", "simulations": 10000, "plotWorlds": 3, "interval": 0.95, "seed": 1 },
  "bins": [
    { "label": "60%", "probabilityRange": [0.6, 0.6], "meanProbability": 0.6, "n": 3, "hits": 2,
      "frequency": 0.6666666666666666, "interval": [0, 1], "position": "inside" },
    { "label": "90%", "probabilityRange": [0.9, 0.9], "meanProbability": 0.9, "n": 3, "hits": 2,
      "frequency": 0.6666666666666666, "interval": [0.3333333333333333, 1], "position": "inside" }
  ],
  "calibration": {
    "weighted": { "statistic": 0.029444444444444457, "p": 0.5877 },
    "unweighted": { "statistic": 0.029444444444444457, "p": 0.5877 }
  },
  "logLoss": {
    "total": 4.451248103715836,
    "mean": 0.7418746839526392,
    "coinFlip": 4.1588830833596715,
    "p": 0.1136,
    "expected": { "mean": 2.994283921202114, "sd": 1.1924237017439177 },
    "simulated": { "mean": 2.9812287799739896, "sd": 1.1805791379664528 }
  },
  "worlds": [[2, 1], [1, 2], [3, 3]]
}
```

This forecaster went 2 for 3 at both 60% and 90%. Neither bin is outside what a calibrated forecaster's worlds show (`position` is `"inside"` for both). The total log loss of 4.45 is above the 2.99 ± 1.19 expected and worse than saying 50% every time (4.16), but 11% of calibrated worlds did worse still (`logLoss.p` = 0.1136). With six predictions, none of this is evidence of miscalibration.
