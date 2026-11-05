# Helix and Braid API

Helix and Braid draws parametric DNA double helices and braided multi-strand lines as clean SVG, for figures, logos, laser cutting and decoration. It is a port of two of Nik Vetr's R functions: `draw_DNA` (`minor_scripts/postdoc/draw_DNA.R`, 2024), with the arguments its later version in the polylines package gained, and `braid_segment` (`braided_lines.R`, 2025). It has a single entry point, `submit(request) → result`. The request and the result are plain JSON. The web page, `window.Helix` and the command line all call this same function. Nothing is random, so the same request always gives the same result.

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node helix/cli.mjs request.json                  # result JSON on stdout
node helix/cli.mjs request.json --svg out.svg    # and the SVG to out.svg
node helix/cli.mjs request.json --svg - > out.svg  # only the SVG, on stdout
node helix/cli.mjs < request.json                # the request from stdin ("-" also works)
```

The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request or invalid JSON, or 2 for a usage problem or an unreadable file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers:

```js
import { submit } from './helix/core/index.js';
const result = submit({ helix: { turns: 3, rotation: 90 } });
// result.svg is the SVG text, result.geometry the strands and base pairs
```

It also exports `HELIX_DEFAULTS`, `BRAID_DEFAULTS`, `OUTPUT_DEFAULTS` and `HelixError`.

**In the page** (https://vetr.dev/helix/), `window.Helix` has:

| Member | Does |
| --- | --- |
| `submit(request)` | The core's `submit`; it returns the result and leaves the page as it is. |
| `load(request)` | Puts a request's settings into the page and draws it, returning the result. An invalid request throws a `HelixError` and leaves the page unchanged. |
| `getRequest()` | The request the page's controls describe. |
| `getResult()` | The result on display, or `null`. |
| `exportSvgText(style)` | The SVG of the drawing on display in a style (`"filled"`, `"outline"` or `"strokes"`; default the preview's). |
| `exportPngBlob({ width, background })` | A Promise of a PNG of the filled drawing, `width` pixels wide (default 2000), on `background` (a colour, or `null` for transparent; default the request's). |

## Request

```json
{ "mode": "helix", "helix": { ... }, "output": { ... } }
{ "mode": "braid", "braid": { ... }, "output": { ... } }
```

`mode` is `"helix"` (the default) or `"braid"`; give the settings object of that mode only. Every field is optional. Unknown fields are rejected at every level. Lengths are in the output unit (`output.unit`, millimetres by default). Angles are in degrees; rotations turn clockwise. Colours are `"#rgb"` or `"#rrggbb"`.

**Helix** (`helix`). The defaults are `draw_DNA()`'s, with its 10 × 10 box and 0.1 strand thickness scaled ten-fold, so the shape is the same. The last column names R's argument.

| Field | Default | Meaning | R |
| --- | --- | --- | --- |
| `turns` | `2.5` | Full turns of the helix, more than 0 (up to 100). | `dh_bounds` (`diff(dh_bounds) × frequency / 2π`) |
| `startAngle` | `90` | Phase of strand 1 where the helix starts. R's default `dh_bounds[1]` of −1.5π is −270°, the same angle. | `dh_bounds[1] × frequency` |
| `amplitude` | `1` | Half the helix's width before it is fitted to the box. As the box sets the size, this matters relative to `crossingGap` and `squareWave`. | `amplitude` |
| `frequency` | `1` | Turns per 2π of the axis: higher is a tighter pitch, a wider helix for its length. | `frequency` |
| `phaseShift` | `180` | Angle between the strands, 0 to 360. Values other than 180 give a major and a minor groove. | `phase_shift` |
| `points` | `1000` | Points along each strand (10 to 20,000). | `n_strand` |
| `basePairsPerTurn` | `12` | Base pairs per turn (0 for none). | `base_pair_interval` (`2π / (frequency × this)`) |
| `basePairGap` | `0.2` | The gap each base pair leaves before the far strand, as a share of the strands' widest separation; it also sets how much a base pair narrows towards that strand. From 0 to less than 1. | `proportional_distance` |
| `basePairThickness` | `1` | Base pairs' width relative to the strands'. | `bp_thickness` |
| `alternateSides` | `false` | Move every second base pair across the gap, so base pairs alternate between hanging from strand 1 and from strand 2. | `alternate_sides` |
| `partialDisplacement` | `true` | With `alternateSides`, move them only half the gap, so they float between the strands. | `partial_displacement` |
| `crossingGap` | `0.4` | Where the strands' centres are closer than this (across the helix, in amplitude units), the strand behind is not drawn: the gap that shows which strand passes in front. | `chirality_prop` |
| `squareWave` | `0.2` | From 0 (a sine wave) towards 1 (a squarer wave with flatter sides). | `prop_square_wave` |
| `strandThickness` | `1` | Strand width: each strand is from half to one and a half times this wide, widest in front, so its width shows depth. | `strand_thickness` |
| `edgeWidth` | `0` | An edge of the shape's own colour around every piece, as R's polygon borders (`par(lwd)`) bolden the drawing. | border `lwd` |
| `rotation` | `0` | Clockwise turn; at 0 the axis is vertical. | `rot` |
| `extension.strands` | `"none"` | Run straight on past the helix's end: `"strand1"`, `"strand2"`, `"both"` (a ladder of base pairs) or `"none"`. | `extend_straight` (`"1"`, `"2"`, `"b"`, `"n"`) |
| `extension.length` | `1` | Its length in turns of the helix. | `extend_straight_by` (`× 2π / frequency`) |
| `extension.taper` | `false` | Narrow the extension to the strand's thinnest width (the later polylines version), instead of keeping the width it ends the helix with (draw_DNA.R). | |
| `box.width`, `box.height` | `100`, `100` | The box the strands' centrelines are fitted to. | `box_dim`, `forced_box` |
| `box.fit` | `"contain"` | `"contain"` scales the helix to fit the box, keeping its shape; `"stretch"` scales width and height separately to fill it. | `box_dim` or `forced_box` |
| `box.includeExtension` | `true` | Fit the helix with its extension, or the helix alone (the extension then sticks out). | `box_DNA` (the opposite) |
| `colors.strand1`, `colors.strand2`, `colors.basePairs` | `"#000000"` | The three parts' colours. | `col` |

**Braid** (`braid`). The defaults are `braid_segment()`'s, with the three colours of its example.

| Field | Default | Meaning | R |
| --- | --- | --- | --- |
| `colors` | `["#E41A1C", "#377EB8", "#4DAF4A"]` | One colour per strand, 1 to 24 strands. | `cols` |
| `length` | `100` | Length of the braid, more than 0. | from `x0, y0` to `x1, y1` |
| `width` | `10` | The braid's total width; each strand is a `colors.length`-th of it. | `bwidth` (in points there) |
| `twists` | `2` | Full twists along the length; negative twists the other way, 0 lays the strands side by side. | `twists` |
| `minSegments` | `50` | Segments the braid is drawn in, before the cuts added where strands swap depth (1 to 5,000). | `min_segments` |
| `rotation` | `0` | Clockwise turn; at 0 the braid runs left to right. | the direction from `x0, y0` to `x1, y1` |

The work grows as strands × (segments + |twists| × strands²); a request over 40,000 is rejected.

**Output** (`output`):

| Field | Default | Meaning |
| --- | --- | --- |
| `style` | `"filled"` | The SVG in `result.svg`: `"filled"`, `"outline"` or `"strokes"` (see [SVG](#svg)). |
| `unit` | `"mm"` | `"mm"`, `"in"` or `"px"`: the unit of every length, and of the SVG's `width` and `height`. |
| `margin` | `0` | Space around the drawing. |
| `background` | `null` | A colour for a background rectangle, or `null` for none (transparent). |
| `strokeWidth` | `null` | Line width of the `"strokes"` style; `null` is the helix's strand thickness, or half a braid strand's width. |
| `outlineWidth` | `null` | Line width of the `"outline"` style; `null` is 0.1 mm, a common hairline for laser cutting. |

## Result

| Field | Meaning |
| --- | --- |
| `request` | The request with every default filled in. |
| `unit`, `width`, `height` | The canvas: the drawing's bounds in all three styles, plus the margin, in the output unit. |
| `strokeWidth`, `outlineWidth` | The line widths used. |
| `svg` | The SVG text of `output.style`. |
| `geometry` | What was drawn, in the SVG's coordinates (output units, x to the right, y down, from the canvas's top-left corner). |

**Helix geometry.** `strands` holds the two strands, each `{color, pieces}`: the visible stretches of its centreline, each a list of `[x, y, width]` points (the hidden strand is broken where the strands cross). `basePairs` holds `{from, to, widths, points}` for each base pair, in drawing order: from its point on strand 1 to its end, its width at both ends, and the number of points it is drawn with. A base pair narrows from `from` to `to` along a quadratic.

**Braid geometry.** `strandWidth` is each strand's width. `breaks` are the cuts across the braid, as distances along it from its start: R's even grid of `minSegments` segments plus every point where two strands swap depth. `strands` holds `{color, phase, centerline}` for each strand: its phase in radians and its centre at each cut. `layers` holds `{from, to, order}` for each segment between cuts: the strands from back to front, numbered from 0. `crossings` holds `{at, over, under, point}` for every point where two strands' centres cross: the distance along the braid, the strand in front, the one behind, and the point.

## SVG

The SVG's `width` and `height` carry the unit (`"61mm"`; no unit for px) and its `viewBox` is in that unit, so it opens at true size. All three styles share the canvas, so they line up when layered.

- `"filled"`: the drawing as painted. Each part is a group with its colour (`<g id="strand-1">`, `"strand-2"`, `"base-pairs"`; for a braid `"strand-1"` to `"strand-k"`), holding one even-odd filled path per piece: for a helix each visible stretch of strand and each base pair, overlapping as R draws them; for a braid each strand's visible region, which do not overlap.
- `"outline"`: the outline of what can be seen, as unfilled hairlines in each part's colour, for a laser cutter or a vinyl cutter. Where a later part of another colour covers an earlier one, the earlier one is cut away; parts of one colour merge, so a one-colour helix is a single outline.
- `"strokes"`: centrelines, for a pen plotter or a single-line engraving: the helix's visible strand stretches and each base pair as a line, or the braid strands' centres broken where a strand in front covers them. Round caps and joins.

## Errors

An invalid request throws a `HelixError` (on the command line, the JSON below on stderr):

```json
{ "error": { "code": "invalid_request", "message": "Invalid request: helix.turns: must be more than 0 and at most 100", "issues": [
  { "code": "out_of_range", "path": "helix.turns", "message": "must be more than 0 and at most 100" }
] } }
```

Every problem is listed, each with a `path` into the request. The issue codes are `unknown_field`, `wrong_type`, `out_of_range`, `invalid_color` and `conflicting_fields` (settings for the other mode). The command line adds `invalid_json`, `usage` and `unreadable_input`.

## Worked example

A three-strand braid, 60 mm long and 6 mm wide, with one twist, drawn as outlines. `request.json`:

```json
{
  "mode": "braid",
  "braid": { "colors": ["#E41A1C", "#377EB8", "#4DAF4A"], "length": 60, "width": 6, "twists": 1, "minSegments": 16 },
  "output": { "style": "outline" }
}
```

`node helix/cli.mjs request.json --svg braid.svg` writes the SVG and prints (abridged to the canvas, the cuts, strand 1's first two points, the first two segments' depth order and the first two crossings):

```json
{
  "unit": "mm",
  "width": 61,
  "height": 6.1,
  "strokeWidth": 1,
  "outlineWidth": 0.1,
  "geometry": {
    "strandWidth": 2,
    "breaks": [0, 3.75, 7.5, 10.000000000000002, 11.25, 15, 18.75, 20.000000000000004, 22.5, 26.25, 30, 33.75, 37.5, 40.00000000000001, 41.25, 45, 48.75, 50.00000000000001, 52.5, 56.25, 60],
    "strands": [
      { "color": "#E41A1C", "phase": 0, "centerline": [[0.5, 3.05], [4.25, 2.28463313526982]] }
    ],
    "layers": [
      { "from": 0, "to": 3.75, "order": [1, 2, 0] },
      { "from": 3.75, "to": 7.5, "order": [1, 2, 0] }
    ],
    "crossings": [
      { "at": 5.000000000000001, "over": 0, "under": 1, "point": [5.500000000000001, 2.05] },
      { "at": 15, "over": 2, "under": 1, "point": [15.5, 4.049999999999999] }
    ]
  }
}
```

The canvas is the braid's 60 × 6 mm plus half a hairline all round, and the strands' 16 even segments gain 4 cuts where pairs of strands swap depth (at 10, 20, 40 and 50 mm). Each pair of strands crosses twice, so there are 6 crossings; in the first, red (strand 0) passes over blue. `braid.svg` holds three paths, one per strand, `<path id="strand-1" fill="none" stroke="#E41A1C" stroke-width="0.1" ...>`.

## Method

**Helix** (`draw_DNA`). Strand 1 is x = amplitude · sin(f t), strand 2 the same shifted by the phase shift, both rising with t; their depths are the cosines of the same angles. The sines are pushed towards a square wave, x ← squareWave · |x|^(1 − squareWave) · sign(x) + (1 − squareWave) · x. A strand's width at each point is strandThickness × (0.5 + d²), with d its depth rescaled to 0–1. An extension continues one or both strands straight up from the last point, the other strand's points (for one) staying where it ended. Base pairs are placed every 2π / (f × basePairsPerTurn) along the axis at the nearest strand point: each runs from strand 1 towards strand 2 and stops `basePairGap` × the widest separation short of it (none where that leaves nothing); its width goes from strand 1's towards strand 2's, stopping the same share short, along a quadratic. Where the strands' centres are closer than `crossingGap`, the strand moving left (in R's frame) is the one behind and is left out. The drawing is rotated, scaled to the box and drawn: each visible stretch of strand and each base pair as a variable-width line, R's `polylines()`: at each point the line is offset by half its width at right angles to the next segment, and the two sides make one outline.

**Braid** (`braid_segment`). Strand i of k has phase φᵢ = 2π i / k; its centre is offset across the braid by sin(2π f t + φᵢ) × (k − 1) / (2k) × width, with f = twists / length, and its depth is the cosine. Each strand is a band a k-th of the width wide, measured across the braid. The braid is cut at an even grid of `minSegments` segments and wherever two strands swap depth (cos = cos), so the depth order is constant between cuts; there each strand is a quadrilateral, and the strands are painted back to front. This port resolves the painting into each strand's visible region (its quadrilaterals less those of the strands in front of it in each segment, merged), and its visible centreline (the parts no strand in front covers).

## Agreement with R

`tests/core.test.mjs` checks the port against R itself (`tests/fixtures/r-parity.json`, made by `node helix/tests/fixtures/make-r-parity.mjs`, which runs the two scripts' functions in R 4.6 with the polylines package's `polylines()`): six helices (R's defaults; the function's own example, rotated 135° with a two-strand ladder; one-strand extensions with alternating and with displaced base pairs; the polylines package's example; frequency 2, rotated 30°, without the square wave) and six braids (the four of `braided_lines.R`'s example, four strands with a negative twist, and one strand). Every strand point, width and base pair agrees to 1e-9 of the drawing's size (the outlines of the first strand piece and base pair too), and so do every cut and every segment's depth order of the braids, the strands' quadrilaterals (in every fourth segment) and the over-and-under of every crossing.

### Differences from the R scripts

These are corrections, or choices the scripts did not offer; the tests check each against R.

- **Outlines.** `draw_DNA.R` calls `polylines()` with its default `complex = FALSE`, which in the polylines version of the time made each piece the union of its segments' quadrilaterals, slightly buffered; the polylines package's `draw_DNA` switched to `complex = TRUE` (one outline per piece) in July 2024 as a bug fix. This port draws that outline, made simple under R's nonzero fill rule.
- **Base-pair direction.** R points each base pair from strand 1 towards the helix's axis, which reaches strand 2 only when the strands are half a turn apart (the default). Here base pairs point towards strand 2, so a groove (another `phaseShift`) draws them correctly. At 180° nothing changes.
- **Repeated base pairs.** With a one-strand extension, R draws a base pair at the helix's last point once for every position past the end, up to a dozen on top of each other (moved apart, with `alternateSides`). Here it is drawn once.
- **Hairlines.** R draws a 1-pixel black segment under every base pair, which the base pair covers; it is left out, and is the base pair's line in the `"strokes"` style. R's polygon borders are black whatever the fill; `edgeWidth` uses each part's colour.
- **Left-handed braids.** `braid_segment` adds the depth-swap cuts only when `twists > 0`, so with negative twists each segment is painted in the depth order at its middle, which is wrong wherever strands swap depth within it, and the braid is drawn with `min_segments` segments only. This port cuts at the swaps for either hand.
- **Seams.** R lets each quadrilateral reach 0.1% into the next segment to hide the seams between them; the merged visible regions have none, so this port does not.
- **Units.** R corrects for the plot's aspect ratio (`xyrat()`) and takes the braid's width in points; here everything is in the output unit. R centres the helix at `target_center` or a corner at `topleft_xy`; here the canvas fits the drawing.
