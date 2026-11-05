# Hypercube Rotation API

The Hypercube Rotation page plays Nik Vetr's hypercube-rotation animation live: a rigid cube in up to nine dimensions turns a little every frame, and its orthographic shadow unfolds from a spinning line through every dimension and folds back into the line. It has a single entry point, `submit(request) → result`, which draws one frame of a precomputed trajectory (a *plan*) as SVG or returns its geometry. The request and the result are plain JSON. The web page, `window.Hypercube` and the command line all call this same function, and the same request always gives the same result.

The trajectories are not solved here. Nik's R pipeline ([NikVetr/shape_rotation](https://github.com/NikVetr/shape_rotation), branch `hardening`, `run_original.R` with its defaults: 720 forward steps, 120 steps per reference rotation, seed 1, ten timing candidates within ±10%) solves one for each maximum dimension `k` from 3 to 9, and its `scripts/export_web_plan.R` writes each as `plans/k<k>.json`. This tool replays and draws them; it does not run the optimizer.

| k | Name | Frames | Seconds | Numeral changes | File | R's face opacity |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | cube | 1,440 | 24.0 | 2 | 70 KB | 0.514 |
| 4 | tesseract | 1,488 | 24.8 | 33 | 97 KB | 0.408 |
| 5 | penteract | 1,518 | 25.3 | 124 | 124 KB | 0.329 |
| 6 | hexeract | 1,512 | 25.2 | 494 | 152 KB | 0.263 |
| 7 | hepteract | 1,510 | 25.2 | 977 | 181 KB | 0.208 |
| 8 | octeract | 1,684 | 28.1 | 2,309 | 240 KB | 0.169 |
| 9 | ennearact | 1,448 | 24.1 | 4,704 | 258 KB | 0.133 |

A frame is one of R's integration steps, 60 per second, numbered from 1 as R numbers them. R's videos keep every second step (30 fps), so video frame *n* is frame 2*n* − 1 here.

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node hypercube/cli.mjs request.json                    # result JSON on stdout
node hypercube/cli.mjs < request.json                  # or read the request from stdin ("-" also works)
node hypercube/cli.mjs request.json --svg frame.svg    # also write the SVG; the JSON then has "svgFile" instead of "svg"
node hypercube/cli.mjs request.json --frames 1-1448:2 --out frames/   # one SVG per frame: frames/frame-00001.svg, ...
node hypercube/cli.mjs request.json --plan my-plan.json               # another plan exported by export_web_plan.R
```

`--frames` takes frame numbers and ranges, `1,5,10-20` or `from-to:step`; the request must then leave out `frame` and `t`, and the CLI prints `{k, frames: [{frame, file, stage}]}`. `1-1448:2` with `k: 9` gives R's 724 video frames. The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request, invalid JSON or an unusable plan, or 2 for a usage problem or an unreadable file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers. A plan is read once and passed to `submit`, either as the plan itself or as a function from `k` to a plan:

```js
import { readFileSync } from 'node:fs';
import { decodePlan, submit } from './hypercube/core/index.js';
const plan = decodePlan(readFileSync('hypercube/plans/k5.json', 'utf8'));  // in a browser: await (await fetch(url)).text()
const { svg } = submit({ k: 5, t: 12, style: 'opaque' }, plan);
const { geometry } = submit({ k: 5, frame: 716, render: 'geometry' }, plan);
```

`decodePlan` checks the plan document and throws a `HypercubeError` (code `invalid_plan`) listing what is wrong. The core also exports `drawFrame(plan, frame, options)`, the draw list the page paints on its canvas, and `renderSvg(list)`.

**In the page** (https://vetr.dev/hypercube/):

| Member | Does |
| --- | --- |
| `submit(request)` | Returns a Promise of the result, loading the plan for `k` if needed. It also shows that frame on the page, paused, with the request's `k`, `style`, `faceAlpha` or `numerals`, and `camera`; `render`, `theme`, `size` and `caption` shape only the result. An invalid request rejects with a `HypercubeError` and leaves the page as it was. |
| `getRequest()` | The request the page's view describes: `{k, frame, style, faceAlpha or numerals, theme, camera}`. |
| `play()`, `pause()`, `isPlaying()`, `step(n)` | Playback; `step` moves `n` frames (negative for back), wrapping round the loop, and pauses. |
| `exportSvgText()` | The frame on view as SVG text, at the page's export size and caption setting. |
| `exportPngBlob()` | A Promise of the same frame as a PNG `Blob`, painted as the canvas paints it. |
| `exportWebmBlob(options)` | A Promise of one loop as a WebM `Blob`, recorded in real time (about 25 s) at 30 fps, every second frame, as R's videos are. `options`: `{signal, onProgress, frames}`, an `AbortSignal`, a `(done, total)` callback, and a number of video frames to stop after. It rejects if the tab is hidden while recording, since that would upset the timing, and in browsers that cannot record WebM. |

## Request

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `k` | integer | (required) | Maximum dimension; plans ship for 3 to 9. |
| `frame` | integer | `1` | Frame, from 1 to the plan's `frames`. |
| `t` | number | none | Instead of `frame`: seconds from the start of the loop, wrapping round it; frame = ⌊60 t⌋ mod frames + 1. Give at most one of `frame` and `t`. |
| `render` | string | `"svg"` | `"svg"` returns the frame as SVG text; `"geometry"` returns its vertices, faces in painting order and edges. |
| `style` | string | `"translucent"` | `"translucent"`: R's base renderer. `"opaque"`: R's lit RGL renderer with face numerals. See [Method](#method). |
| `faceAlpha` | number | the plan's | Face opacity from 0 to 1, `"translucent"` only. The plan's default is R's original 1/1.25<sup>k</sup>, rounded to 8 bits as R's colour was. |
| `numerals` | boolean | `true` | Print each face's dimension numeral, `"opaque"` only. Numerals are drawn only in the default view (see `camera`). |
| `theme` | string | `"light"` | `"light"`: R's colours on white. `"dark"`: the same faces on the site's dark surface (#16181d), edges #1f7fa8. |
| `size` | integer | `800` | Width and height in pixels, 16 to 4,096. R's frames are 800. |
| `camera` | array | `[1, 0, 0, 0]` | A unit quaternion `[w, x, y, z]` (length within 1e-6 of 1) turning the 3-D shadow before it is drawn, as intuitions/lib/geom3d.js turns its scenes. The default is R's camera, looking straight down the depth axis. |
| `caption` | boolean | `false` | Write the stage name in the top-left corner, as R's RGL frames do; `"svg"` only. |

Unknown fields are rejected.

## Result

| Field | Meaning |
| --- | --- |
| `k`, `frames`, `stepsPerSecond` | The plan: maximum dimension, frames in the loop, frames per second (60). |
| `frame`, `t` | The frame drawn and its time in seconds, (frame − 1) / 60. |
| `stage` | `{index, dimension, phase, label, start, length}`: the stage the frame belongs to, numbered from 0 in loop order; the dimension of the shadow; `"unfolding"`, `"full"` or `"folding"`; its name, as `"tesseract (ℝ⁴)"`; and its first frame and length. |
| `style`, `theme`, `size`, `camera` | As used. |
| `faceAlpha` | (`"translucent"`) The face opacity used. |
| `numerals`, `numeralsShown` | (`"opaque"`) Whether numerals were asked for, and whether they were drawn: only in the default view. |
| `counts` | `{faces, edges}` drawn. |
| `svg` | (`render: "svg"`) The frame as an SVG document. |
| `geometry` | (`render: "geometry"`) See below. |

`geometry` has:

| Field | Meaning |
| --- | --- |
| `vertices` | All 2<sup>k</sup> vertices as `[x, y, z]` in cube units after the camera: x right, y up, z toward the viewer. In the default view these are R's projected `x`, `y` and depth. Vertex *v* is the corner whose coordinate on axis *j* is +0.5 if bit *j* of *v* is set and −0.5 if not (R's `expand.grid` order; R's vertex *v* + 1). |
| `faces` | The faces drawn, in painting order: `{face, vertices, depth, fill, opacity, number?}`. `face` is the face's index (R's face row `face` + 1), `vertices` its four corners in cycle order, `depth` the mean z of the corners, `fill` and `opacity` its paint, and `number` its numeral when one is drawn. |
| `edges` | The edges drawn, as pairs of vertex indices. |
| `scale` | Pixels per cube unit. A vertex is drawn at (size/2 + x · scale, size/2 − y · scale). |
| `background`, `edgeColor`, `edgeWidth` | The frame's background, edge colour and edge width in pixels. |

## Errors

Every problem throws (or, on the command line, prints) one error, `{error: {code, message, issues}}`, with every issue found, each `{code, path, message}`:

| Code | When |
| --- | --- |
| `invalid_request` | The request breaks the rules above. Issue codes: `wrong_type`, `unknown_field`, `missing_field`, `out_of_range`, `invalid_choice`, `conflicting_fields` (`frame` with `t`), `not_applicable` (`faceAlpha` with `"opaque"`, `numerals` with `"translucent"`, `caption` with `"geometry"`). A `frame` beyond the plan's last frame is `out_of_range`. |
| `plan_unavailable` | No plan for that `k` was given (in the page: it could not be loaded). |
| `invalid_plan` | A plan document is not a usable plan (see `decodePlan`). |
| `usage`, `unreadable_input`, `invalid_json` | Command line only: bad arguments, a file that cannot be read, a request that is not JSON. |

## Method

**The motion** is R's. The cube's vertices are {±0.5}<sup>k</sup>. Every frame applies a small rotation, a product of Givens rotations in all coordinate planes, and the shadow is the first two coordinates, with the third as depth. Low dimensions get more time, on R's quadratic schedule; each new axis joins gradually by blending the incremental Givens angles. Each fold back down is optimized by L-BFGS-B over ten durations and restarts, then refined so that a cube edge ends exactly along the leaving axis just as that axis stops moving. The square→line and line→square changes tilt the projected square about its diagonal, and the closing line turn has the same direction as the opening one, so the loop has no seam. See the R repository's README and `docs/repair_notes.md` for the details and what was repaired from the original scripts.

**The plan.** Every frame's projected vertices and depths are linear in the base vertices, tilt stages included: [x y depth] = V A for a k × 3 matrix A per frame, stored as float32. The exporter refuses any frame where that fails by more than 1e-8 (the largest seen is 4.9e-10). The plan also holds each frame's stage and R's face-number plan: the number on every face at frame 1 and the frames at which a face's number changes.

**Translucent** is `draw_incremental_projection` in R's `render.R`: every face with any area is filled in one colour (#87CEFA) and opacity, in R's order (decreasing mean depth; with one colour and opacity the picture does not depend on the order), then every edge is stroked once, #00688B, 1.5 px at 800 px (R's `lwd = 2`), with round ends. The frame spans ±1.08 b in both directions, b = √k / 2, as R's `plot.window` with its 4% axis padding. R also fills faces of zero area, which draw nothing; they are skipped here (any face of area at most 1e-5 square units).

**Opaque** is R's `render_rgl.R` with `--face-alpha=1 --face-numbers`. RGL draws every face with depth testing; for a convex shadow that shows exactly the faces on its front supporting plane, which is R's own visibility rule (`face_label_visibility`) and is used here directly, with a tolerance of 1e-5 for the single-precision plan. A face within that tolerance behind the front surface is painted before the faces that cover it. Edges are those of the faces drawn, or all of them when no face faces the viewer (the line stages). A face's colour follows rgl's fragment shader at the face's centre: one white light at (2, 2, 2) relative to the viewer, observer 2√3 b from the cube's centre, black ambient, white specular, shininess 50, normals turned toward the viewer. RGL lights each pixel, so a large face shows a slight gradient there and none here. The numeral is R's texture: 132 px digit, #172C3A, centred in a 256 px square that is mapped onto the face as RGL maps it (first side along u, last along v, u mirrored on a face seen from behind) and multiplied by the face's colour. Fonts are Helvetica or Arial, else the browser's sans serif.

**Numerals and the camera.** R plans the numbers so that a face keeps its number while visible and changes only while hidden, at the frame and both neighbours, from R's fixed camera; a hidden face takes the number of its next appearance. That plan cannot hold for a camera that has been turned, so numerals are drawn only in the default view.

**Checks against R** (`tests/core.test.mjs`, with R's own frames in `tests/fixtures/r-parity.json`): faces and edges in R's order; vertex positions within 4 × 10<sup>−8</sup> of R's at 4 steps for each k (2 for k = 9, 3 for k = 8); the same translucent faces as R's, painted in R's depth order apart from exact ties; visibility identical to R's; numbers identical to R's plan; and at every numeral change for k = 5, 6 and 9, any copy of the face that is drawn is covered by faces painted over it. Frames drawn here and R's Cairo frames of the same steps differ only in anti-aliasing.

## Worked example

The cube (k = 3) at frame 711, the middle of its three-dimensional stage, opaque and lit, as geometry. `request.json`:

```json
{"k": 3, "frame": 711, "style": "opaque", "render": "geometry", "size": 200}
```

`node hypercube/cli.mjs request.json` prints (one line; spacing added here):

```json
{
  "k": 3,
  "frame": 711,
  "frames": 1440,
  "t": 11.833333333333334,
  "stepsPerSecond": 60,
  "stage": {
    "index": 2,
    "dimension": 3,
    "phase": "full",
    "label": "cube (ℝ³)",
    "start": 528,
    "length": 367
  },
  "style": "opaque",
  "numerals": true,
  "numeralsShown": true,
  "theme": "light",
  "size": 200,
  "camera": [1, 0, 0, 0],
  "counts": {
    "faces": 3,
    "edges": 9
  },
  "geometry": {
    "scale": 106.9167165165973,
    "vertices": [
      [0.5076294251484796, 0.1720989872701466, -0.6802163529209793],
      [0.5103995978133753, -0.6813278864137828, -0.1590111660771072],
      [0.48943094618152827, 0.6931768585927784, 0.17309876205399632],
      [0.4922011188464239, -0.160250015091151, 0.6943039488978684],
      [-0.4922011188464239, 0.160250015091151, -0.6943039488978684],
      [-0.48943094618152827, -0.6931768585927784, -0.17309876205399632],
      [-0.5103995978133753, 0.6813278864137828, 0.1590111660771072],
      [-0.5076294251484796, -0.1720989872701466, 0.6802163529209793]
    ],
    "faces": [
      {
        "face": 4,
        "vertices": [0, 1, 3, 2],
        "depth": 0.007043797988444567,
        "fill": "#273b47",
        "opacity": 1,
        "number": 3
      },
      {
        "face": 1,
        "vertices": [1, 3, 7, 5],
        "depth": 0.26060259342193604,
        "fill": "#0a0f12",
        "opacity": 1,
        "number": 3
      },
      {
        "face": 3,
        "vertices": [2, 3, 7, 6],
        "depth": 0.4266575574874878,
        "fill": "#7abbe2",
        "opacity": 1,
        "number": 3
      }
    ],
    "edges": [
      [1, 5],
      [2, 6],
      [3, 7],
      [0, 2],
      [1, 3],
      [5, 7],
      [0, 1],
      [2, 3],
      [6, 7]
    ],
    "background": "#ffffff",
    "edgeColor": "#00688B",
    "edgeWidth": 0.375
  }
}
```

Three of the cube's six faces face the camera, R's faces 2, 4 and 5 (R's visibility at this step), and all carry the numeral 3. Face 1 is turned almost edge-on to the light, so it is nearly black. The scale is 200 / (2 × 1.08 × √3 / 2) pixels per unit. With `"style": "translucent"` the same frame fills all six faces at opacity 0.514 and strokes all twelve edges; `--svg frame.svg` writes the drawing.
