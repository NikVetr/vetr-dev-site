# Signature API

Signature correction cleans up a signature drawn with a trackpad, mouse, stylus or finger. It smooths each stroke, globally with Fourier thresholding and locally with wavelet thresholding. It then gives the stroke a pen's varying width: wider where the pen moved slowly, narrower where it moved fast. The result is a filled outline, written as SVG with a transparent background. It can also morph the signature into a second one. It is a port of Nik Vetr's R script `interpolate_signature_frequency_series.R` (2023), with its bugs fixed (see [Differences from the R script](#differences-from-the-r-script)).

It has a single entry point, `submit(request) → result`. The request and the result are plain JSON. The web page, `window.Signature` and the command line all call this same function. Nothing is random, so the same request always gives the same result. The page keeps signatures in the browser: nothing is uploaded.

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node signature/cli.mjs signature.csv --svg out.svg > result.json   # the defaults, for a CSV or SVG file
node signature/cli.mjs request.json --svg out.svg                  # result JSON on stdout, the SVG to out.svg
node signature/cli.mjs request.json --svg - > out.svg              # only the SVG, on stdout
node signature/cli.mjs request.json --frames frames/               # also each morph frame, frames/frame-0001.svg, ...
node signature/cli.mjs < request.json                              # the request from stdin ("-" also works)
```

In a request read by the CLI, the signature may be given as `"file": "path"` instead of `strokes`, `csv`, `matrix` or `svg`. The path names a `.csv`, an `.svg`, or a `.json` holding a strokes array or `{strokes}`. It is resolved from the request file's folder, or from the working directory for stdin. `morph.target` may be `{"file": "path"}` as well.

The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr. It exits with 1 for an invalid request or invalid JSON, and with 2 for a usage problem or an unreadable file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers:

```js
import { submit } from './signature/core/index.js';
const result = submit({ csv: 'x,y,t\n...', smooth: { fourier: { strength: 2 } } });
```

**In the page** (https://vetr.dev/signature/), `window.Signature` has:

| Member | Does |
| --- | --- |
| `submit(request)` | The core's `submit`; it returns the result and leaves the page as it is. |
| `load(request)` | Puts a request's signature and settings into the page and shows the correction. It returns the result. An invalid request throws a `SignatureError` and leaves the page unchanged. |
| `getRequest()` | The request the page currently describes: its strokes and settings, without the morph. |
| `getResult()` | The result on display, or `null`. |
| `exportSvgText()` | The SVG on display, or `null`. |
| `exportPngBlob({ height, unit, dpi, color })` | A Promise of a transparent PNG of the outline. `height` is in `unit` (`"mm"`, `"in"` or `"px"`; default 20 mm), `dpi` defaults to 300 and is written into the file, and `color` defaults to the SVG's. |

## Request

A request holds one signature, in exactly one of four forms, and optional settings. Unknown fields are rejected at every level. Lengths marked "× height" are in units of the signature's height: its bounding box's height, or its width if it is flat.

**The signature:**

| Field | Form |
| --- | --- |
| `strokes` | `[{ points: [{ x, y, t?, pressure? }, ...] }, ...]`. `t` is in milliseconds and must not decrease within a stroke. `pressure` runs from 0 to 1. Either field must be given for every point or for none. |
| `csv` | CSV text with a header row naming `x` and `y`, and optionally `t`, `pressure` and `stroke` (quoted names and R's unnamed row-name column are fine; other columns are ignored, with an `IGNORED_COLUMNS` warning). The pen lifts where `stroke` changes; without that column, where `t` jumps by more than `input.penUpGap`, or at a row whose `x` and `y` are empty or `NA`. |
| `matrix` | A 2 × n matrix as R writes one to JSON: `[[x1, x2, ...], [y1, y2, ...]]`. A column of two `null`s lifts the pen. |
| `svg` | An SVG document or bare path data (`"M 10 10 C 20 0 30 20 40 10"`). Each subpath, `polyline`, `polygon` and `line` is one pen stroke, read as a centreline. Curves and arcs are flattened, and `transform` attributes on elements and groups are applied. |

Input without `t` has no speed to measure, so its widths come from curvature (see `width.source`).

**Settings:**

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `input.penUpGap` | number > 0 | `50` | CSV only: a pause of more than this many milliseconds between samples lifts the pen (the R script's rule). |
| `input.yAxis` | `"down"`, `"up"` | `"down"` | `"up"` flips y, for coordinates from R plots or other y-up sources. Output is always y down, as in SVG. |
| `resample.step` | `"auto"` or number > 0 | `"auto"` | Each stroke is resampled at equal steps along its length; `"auto"` is a hundredth of the height, in input units. A stroke shorter than half a step is a dot. |
| `smooth.fourier.strength` | number ≥ 0 | `1` | Fourier smoothing over each whole stroke, mirrored at its end: frequencies weaker than strength × the R script's threshold are dropped. That threshold is σ·sqrt(2 log(N)² / log 2), with σ the median magnitude of the upper half of the frequencies / 0.6745. `0` is off and `1` is the script's own threshold; the effect grows up to about 10. |
| `smooth.wavelet.filter` | `"haar"`, `"d4"`, `"mb4"`, `"d6"`, `"la8"` | `"mb4"` | MODWT filter (`shared/wavelet.js`, waveslim's filters). |
| `smooth.wavelet.levels` | `"auto"` or integer 1–12 | `"auto"` | `"auto"` is the script's floor(log2(2n) / 2) for a stroke of n points mirrored to 2n. More levels smooth over longer stretches. |
| `smooth.wavelet.rule` | `"energy"`, `"noise"` | `"energy"` | The soft threshold: `"energy"` is the largest coefficient magnitude outside the strongest coefficients that hold `keepEnergy` of the energy (the script's `wavelet_smooth`); `"noise"` is `noiseMultiplier` × sd(d1) (its `wavelet_smooth_noise_thresh`). |
| `smooth.wavelet.keepEnergy` | number, 0 < x ≤ 1 | `0.999` | Energy rule: the share of the coefficients' energy kept. Lower is smoother; `1` keeps every coefficient. The script used 0.999. |
| `smooth.wavelet.noiseMultiplier` | number ≥ 0 | `3` | Noise rule: the threshold in units of sd(d1). |
| `smooth.wavelet.thresholdSmooth` | boolean | `false` | Also soft-threshold the level-J smooth, as the script's energy rule does. That pulls each stroke toward its centre (see below). |
| `smooth.wavelet.strength` | number ≥ 0 | `1` | Scales the wavelet threshold everywhere; `0` turns wavelet smoothing off. |
| `smooth.local` | array | `[]` | Regions `{ stroke, from, to, strength }`: on stroke `stroke` (from 0), between shares `from` and `to` of its length, the wavelet threshold is scaled by `strength` (0 leaves the region nearly unsmoothed, 3 smooths it three times as hard). Where regions overlap, the later one counts. Each coefficient takes the strength at the sample its filter is centred on, so a region's edge blends over the filter's span. |
| `width.source` | `"auto"`, `"speed"`, `"curvature"`, `"pressure"`, `"constant"` | `"auto"` | What sets the width. `"auto"` is `"speed"` when every point has `t`, else `"curvature"`. `"speed"`: the measured speed, smoothed as time per unit length, so a pause counts as slow. `"curvature"`: the speed the two-thirds power law predicts. `"pressure"`: the device's pressure. `"constant"`: `width.max` everywhere. |
| `width.min`, `width.max` | numbers > 0 (× height) | `0.01`, `0.035` | The narrowest and widest pen. Speeds map to widths through their spread over the whole signature: the 5% slowest points get `max` and the 5% fastest `min`. Pressure maps linearly, 0 to `min` and 1 to `max`. |
| `width.exponent` | number 0–2 | `1/3` | Two-thirds power law (Lacquaniti, Terzuolo & Viviani 1983): speed ∝ curvature^(−exponent). `1/3` is the law, larger values exaggerate it, and `0` gives constant speed. |
| `width.straightRadius` | number > 0 (× height) | `1` | Bends wider than this radius count as straight, so a straight run is fast but not infinitely fast: speed ∝ (curvature + 1 / (straightRadius × height))^(−exponent). |
| `width.geometryWeight` | number 0–1 | `0.25` | `"speed"` only: the power law's share of the log speed, which steadies speeds measured from uneven polling. |
| `width.smoothing` | number > 0 (× height) | `0.05` | Gaussian bandwidth along the stroke for speed, curvature and pressure. |
| `width.taper.length` | number ≥ 0 (× height) | `0.06` | Each stroke's ends narrow over this length, at most a third of the stroke; `0` turns tapering off. |
| `width.taper.floor` | number 0–1 | `0.25` | The width at the very end, as a share of the untapered width. |
| `output.color` | `"#rgb"`, `"#rrggbb"` or a colour name | `"#1b1b1b"` | The ink. |
| `output.height` | `null` or number > 0 | `null` | The SVG's `height` attribute, in `output.unit`; the width follows the outline's aspect. `null` uses the input's units as px. |
| `output.unit` | `"px"`, `"mm"`, `"in"`, `"pt"` | `"px"` | Unit of `output.height`, so the SVG places at a physical size in documents. |
| `output.margin` | number ≥ 0 (× height) | `0.05` | Transparent space around the outline. |
| `output.digits` | integer 0–6 | `2` | Decimals in the SVG. |
| `morph` | `null` or object | `null` | Morph into a second signature; see below. |

**Morph** (`morph`), from this signature at p = 0 to the target at p = 1:

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `morph.target` | object | (required) | The second signature: `{ strokes }`, `{ csv }`, `{ matrix }` or `{ svg }`. |
| `morph.method` | `"wavelet"`, `"linear"`, `"corrected"` | `"wavelet"` | `"wavelet"`: the script's `wavelet_smooth_interpolate`, which interpolates the two strokes' MODWT coefficients after soft-thresholding each at `noiseMultiplier` / (its share of the larger raw sample count) × sd(d1). `"linear"`: the script's comparison, interpolating the two strokes smoothed by its Fourier threshold. `"corrected"`: interpolates the two strokes as this request's smoothing settings correct them. |
| `morph.strokes` | `"all"`, `"first"` | `"all"` | `"first"` morphs the first strokes only, each resampled to the larger raw sample count, as the script did. `"all"` pairs every stroke (see below). |
| `morph.props` | array of 1–2000 numbers 0–1 | `[0, 0.25, 0.5, 0.75, 1]` | The frames' positions. The script's first try was 0:4/4, and its animation was 1:150/150 at 60 frames a second. |
| `morph.noiseMultiplier` | number ≥ 0 | `50` | `"wavelet"` only: the script's base threshold multiplier. |
| `morph.loop` | number 0–10 | `0` | `"wavelet"` only: the detail coefficients are scaled by 1 + loop · 4p(1 − p), a "loopier" middle as the script's notes suggest. At `0` the inverse transform is linear, so the wavelet morph is exactly the interpolation of the two smoothed signatures. |

Both signatures are centred on their bounding boxes, and the shorter is scaled up to the longer's total ink length. With equal stroke counts, strokes pair in order. Otherwise the strokes with the most samples in the signature that has more pair in drawing order with the other's. Each stroke left over is paired with a stroke of no length in the other signature, placed where the leftover crosses a paired stroke (or at the paired stroke's nearest point). The R script began this matching but did not finish it. A t-bar or an i-dot then grows out of its letter. Widths are interpolated too; a stroke of no length has width 0.

## Result

| Field | Meaning |
| --- | --- |
| `strokes` | The corrected strokes: `[{ points: [[x, y, width], ...] }]`, in input units (y down). A dot is one point. |
| `outline` | The filled outline: polygons, each `[outer ring, hole, ...]`, each ring `[[x, y], ...]` (closed implicitly). The union of every stroke's ribbon, so overlapping strokes have no seams. |
| `svg` | The SVG document: one `<path>` of the outline, filled, `fill-rule="evenodd"`, transparent background. |
| `viewBox` | `[x, y, width, height]` of the SVG: the outline's bounds plus the margin. |
| `height` | The signature's height in input units, the unit of the "× height" settings. |
| `widthSource` | The width source used (`"auto"` resolved). |
| `morph` | `null`, or `{ frames: [{ p, strokes: [{ points: [[x, y, width], ...] }] }] }`, in the morph's centred coordinates. A frame has one stroke per stroke pair. |
| `warnings` | `[{ code, message }]`: `IGNORED_COLUMNS` for CSV columns not read. |
| `settings` | Every setting as used, defaults filled in (the morph without its target). |

## Errors

An invalid request throws a `SignatureError` (from the CLI, `{"error": {...}}` on stderr). `code` is `INVALID_REQUEST` and `issues` lists every problem found, each `{ code, path, message }`:

| Issue code | When |
| --- | --- |
| `UNKNOWN_FIELD` | A field the request does not have (a misspelling, say). |
| `INVALID_FIELD` | A value of the wrong type or range; the message says what it must be. |
| `MISSING_INPUT`, `CONFLICTING_INPUT` | None, or more than one, of `strokes`, `csv`, `matrix`, `svg` (also for `morph.target`). |
| `EMPTY_INPUT` | The signature has no points. |
| `BAD_CSV` | No `x` and `y` columns, or a row that is not numbers (up to five rows are listed). |
| `BAD_SVG` | Malformed path data, a transform that is not understood, or nothing drawable. |
| `PARTIAL_FIELD` | `t` or `pressure` on some points but not all. |
| `TIME_BACKWARDS` | `t` decreases within a stroke. |
| `MISSING_TIME`, `MISSING_PRESSURE` | `width.source` is `"speed"` or `"pressure"` but the signature lacks it. |

A signature whose points all coincide throws a `SignatureError` with code `DEGENERATE_INPUT` and no issues.

## Differences from the R script

The port reproduces the script's functions (its tests compare them with the script, run in R 4.6, to 1e-10). It fixes these bugs:

- **The smooth is thresholded too (`:178`).** `wavelet_smooth` soft-thresholds the level-J smooth coefficients as well as the details, and the smooth holds a stroke's position. On the example signature at `keepEnergy` 0.99, this pulls points 6.9 px from where they were on average, against 2.0 px for the details alone, and shrinks the stroke's width to 80% against 91%. Letters visibly collapse. The default thresholds only the details, which differs from the script. `thresholdSmooth: true` restores the script's behaviour.
- **Strokes were smoothed where they sit.** The script centred the whole signature, then smoothed each stroke with the energy rule. For a stroke far from the centre, the rule's energy is then almost all position, so the threshold depends on where the stroke is. As `hershey_vec.R` does, each stroke is now centred on its own mean before smoothing.
- **`wavelet_smooth(sx1, threshold_multiplier = 100)` (`:556`, `:586`)** stops with "unused argument". Its intent, the noise rule at a multiplier of 100, is `rule: "noise", noiseMultiplier: 100`.
- **`if (class(d) %in% c("matrix", "data.frame"))` (`:126` and others).** A matrix's class has two elements, so this is an error in R ≥ 4.2. For a two-column data frame, the `unlist()` it guards concatenates x and y into one series. Here each coordinate is always its own series.
- **Equal ink length (`:436-439`)** multiplies each signature by its length / the longer length, which shortens the shorter one further (377 → 330 against 431 on the examples). The morph divides instead.
- **`intersect_func` (`:336-375`)** checks only the first segment's x range, uses `TRUE` in place of the x coordinate for y, and stops on downward vertical segments. The morph's stroke pairing uses a parametric test of both segments.
- **Mirrored output.** The script's smoothers and morph return the mirrored series `c(x, rev(x))`, which traces each stroke out and back. Here only the first half is kept, which draws the same line once.

## Example

`signature/examples/request.json` is a single hook drawn in 380 ms:

```json
{
  "strokes": [{ "points": [
    { "x": 10, "y": 10, "t": 0 }, { "x": 30, "y": 12, "t": 40 }, { "x": 48, "y": 10, "t": 80 },
    { "x": 46, "y": 40, "t": 160 }, { "x": 40, "y": 58, "t": 260 }, { "x": 28, "y": 60, "t": 330 },
    { "x": 20, "y": 52, "t": 380 }
  ] }],
  "width": { "min": 0.02, "max": 0.06 },
  "output": { "height": 15, "unit": "mm", "digits": 1 }
}
```

```sh
node signature/cli.mjs signature/examples/request.json --svg hook.svg > hook.json
```

The result's `widthSource` is `"speed"`, because every point has a time. Its `height` is `50`, the hook's height in input units. The stroke is resampled at steps of a hundredth of that, to 222 points. The fast top bar is thin and the slower curve wide, from 0.275 at the tapered start up to 3, which is 0.06 × 50. The `outline` is one polygon of 460 points with no holes, and `warnings` is empty. The SVG begins:

```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="8.5 7 42.7 56.6" width="11.3mm" height="15mm"><path fill="#1b1b1b" fill-rule="evenodd" d="M45 9.5L45.5 9.5L45.9 9.6L46.4 9.7…
```

Its viewBox is the outline's bounds plus a margin of 0.05 × 50 = 2.5 on each side. `height="15mm"` sets its size when placed in a document. The width follows from the aspect: 42.7 / 56.6 × 15 mm = 11.3 mm.
