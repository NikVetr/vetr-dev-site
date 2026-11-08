# Raster to Vector API

Raster to Vector turns a raster image into an SVG of flat-colour regions with smooth outlines. Colours are quantized by weighted k-means, with k chosen by the Davies–Bouldin index. Short runs are cleaned up, and each colour's regions are traced to closed contours. The contours are smoothed, and the regions are painted in containment order. It is a port of the R vectorizer [github.com/NikVetr/raster-to-vector](https://github.com/NikVetr/raster-to-vector) (commit e51e7a3). It keeps the R version's request fields (in camelCase), defaults and random number generator, so the same request gives R's SVG.

It has a single entry point, `submit(request) → result`. The request and the result are plain JSON. The web page (through a worker), `window.RasterToVector` and the command line all call this same function. The same request, seed included, always gives the same result apart from `timings`.

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node raster-to-vector/cli.mjs --image in.png --svg out.svg > result.json   # the defaults, for one PNG
node raster-to-vector/cli.mjs request.json --svg out.svg                     # result JSON on stdout
node raster-to-vector/cli.mjs < request.json                                 # or read the request from stdin ("-" also works)
```

In a request read by the CLI, `image` may be the path of a PNG file instead of pixels. The path is resolved from the request file's folder, or from the working directory for stdin; `--image` sets it, from the working directory. The CLI decodes PNGs itself (any colour type and bit depth, not interlaced). JPEG must be converted to PNG first. `--svg` also writes the SVG.

The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr. It exits with 1 for an invalid request, an unreadable image, invalid JSON or a stage that could not proceed, and with 2 for a usage problem or an unreadable request file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers:

```js
import { submit } from './raster-to-vector/core/index.js';
const result = submit({ image: { width, height, data }, quantize: { k: 6 } }, { onProgress: (p) => console.log(p.stage, p.k) });
```

`onProgress` is optional. It is called with `{stage}` as each stage starts (`read`, `quantize`, `clean`, `trace`, `smooth`, `order`, `svg`), and with `{stage: 'quantize', k, step, of}` before each k is tried.

**In the page** (https://vetr.dev/raster-to-vector/). The computation runs in a worker, so `submit` returns a Promise:

| Member | Does |
| --- | --- |
| `submit(request)` | Converts the request, loads its image and options into the page, and resolves to the result. An invalid request rejects with a `RasterToVectorError` and leaves the page unchanged. |
| `getRequest()` | Returns the request the page's image and options currently describe. Its `image.data` is a `Uint8ClampedArray`; convert it with `Array.from` before writing the request as JSON. |
| `getResult()` | Returns the result on display, or `null`. |
| `undo()`, `redo()` | Restore the previous or next page checkpoint and return whether one was available. Pending rendering/loading is invalidated; saved results are restored without recomputation. |
| `exportSvgText()` | Returns the SVG on display, or `null`. |
| `decodeImage(source)` | Decodes a `Blob` or an image URL to `{width, height, data}` with the browser, without colour-profile conversion. |

The page's "Longest side" is 600 px by default, so that large photos stay quick; the API's `preprocess.maxDim` defaults to `null`, as in R. The page decodes PNG and JPEG through a canvas. For partly transparent pixels, the canvas's premultiplied storage can shift colour values slightly, so on such images the page and the CLI can differ. Pass pixels decoded elsewhere through `submit` to avoid this.

The page keeps up to 20 history checkpoints in memory, sharing decoded assets and completed results between them. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z navigate this history outside text/numeric editors and dialogs; those controls keep their native editing shortcuts. New changes after Undo discard the redo branch.

## Request

Unknown fields are rejected at every level. Every section and field except `image` is optional.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `image` | object | (required) | Decoded pixels: `{width, height, data}`, where `data` holds width × height × 4 RGBA values from 0 to 255, row by row from the top left (an array, `Uint8Array` or `Uint8ClampedArray`; a browser `ImageData` works). |
| `preprocess.maxDim` | integer ≥ 8 or `null` | `null` | Downscale so the longer side is at most this, as R's ImageMagick Box resize (reproduced exactly). |
| `preprocess.scale` | integer ≥ 1 | `1` | Integer nearest-neighbour upscale before tracing. |
| `preprocess.pad` | integer ≥ 0 | `3` | Edge pixels replicated around the image. |
| `quantize.k` | `"auto"` or integer ≥ 1 | `"auto"` | A number of colours, or `"auto"` to choose k by Davies–Bouldin over `kRange`. |
| `quantize.kRange` | array of distinct integers ≥ 2 | `[3, …, 10]` | Candidate values of k, in the order tried. Values above the number of colours clustered are left out (warning `K_REDUCED`). |
| `quantize.offset` | integer ≥ 0 | `0` | Added to the chosen k's position in `kRange`, to bias toward more colours (capped at the last). |
| `quantize.nTop` | integer ≥ 1 | `300` | Number of most frequent distinct colours that k-means clusters. Every pixel then takes its nearest centre. |
| `quantize.digits` | integer 0–6 | `2` | Colours are rounded to this many decimals (of 0–1 values) before counting. |
| `quantize.alphaThreshold` | number 0–1 | `0.1` | Pixels below this alpha are transparent. |
| `quantize.seeding` | `"weighted"`, `"unweighted"` | `"weighted"` | k-means++ starts drawn in proportion to colour count × squared distance, or to squared distance alone (the original's draw). |
| `quantize.space` | `"rgb"`, `"oklab"` | `"rgb"` | Clustering space; palette colours are mean RGBA pixel values either way. |
| `quantize.seed` | integer, \|seed\| ≤ 2147483647 | `1` | Seed of R's Mersenne-Twister, as `set.seed()` takes it. |
| `clean.minRun` | integer ≥ 1 | `3` | Runs shorter than this are absorbed into the next long-enough run; `1` leaves the labels as they are. |
| `clean.passes` | integer ≥ 1 | `1` | Each pass treats the rows, then the columns. |
| `trace.method` | `"marching_squares"`, `"original"` | `"marching_squares"` | Pixel-edge contours, or the original edge detection and chain following. |
| `trace.minLength` | integer ≥ 3 | `9` | Contours with fewer points are dropped (warning `DROPPED_CONTOURS`). |
| `trace.kconvInit` | integer ≥ 1 | `1` | Original tracer only: each mask is eroded by a window of this size before the dilation by one more. |
| `smooth.method` | `"wavelet"`, `"fourier"`, `"hadamard"`, `"none"` | `"wavelet"` | How contours are smoothed. |
| `smooth.wavelet.filter` | `"haar"`, `"d4"`, `"mb4"`, `"d6"`, `"la8"` | `"mb4"` | MODWT filter. |
| `smooth.wavelet.nLevels` | `"auto"` or integer ≥ 1 | `"auto"` | `"auto"` uses floor(log2(n) / 2) for a contour of n points (at least 1); any value is capped at floor(log2 n). |
| `smooth.wavelet.thresholdMultiplier` | number ≥ 0 | `3` | Soft threshold = multiplier × noise. |
| `smooth.wavelet.noise` | `"sd"`, `"mad"` | `"sd"` | Noise from the level-1 details: their standard deviation (original), or median(\|d1\|) / 0.6745. |
| `smooth.fourier.threshold` | `"original"`, `"universal"` | `"original"` | σ·sqrt(2 log(n)² / log 2), as the original, or σ·sqrt(2 log n). |
| `order.threshold` | number, 0 < x ≤ 1 | `0.95` | Share of a shape's area inside another above which it counts as contained. |
| `output.holes` | `"transparent"`, `"all"`, `"none"` | `"transparent"` | Cut holes only where the region filling them is transparent (the rest stack on top), every hole, or none. |
| `output.transparentAlpha` | number 0–1 | `0.2` | Colours below this alpha are not painted. |
| `output.digits` | integer 0–10 | `2` | Decimals in the SVG path data. |

## Result

| Field | Meaning |
| --- | --- |
| `width`, `height` | Size of the SVG: the image after `maxDim` and `scale`, in pixels. |
| `k` | Number of colours left after cleanup. |
| `dbi` | Davies–Bouldin index of each k tried, keyed by k (`null` where fewer than two clusters had pixels). The lowest wins, before `offset`. |
| `palette[]` | One entry per colour: `layer` (1-based number used by regions), `hex` (`#RRGGBB`), `alpha` (0–1), `share` (of the image's pixels), `transparent` (alpha below `output.transparentAlpha`; not painted). |
| `regions[]` | In paint order, one per SVG path (transparent layers included, though not drawn): `layer`, `frame` (the image rectangle, painted first in the most frequent border colour), `outer` (`[[x, y], …]`) and `holes` (`[[[x, y], …], …]`). Coordinates are on the image's pixel corners, x right and y down, so (0, 0) is the top-left corner. Rings are not closed (the first point is not repeated). |
| `svg` | The SVG document: `viewBox="0 0 width height"`, one `<path fill-rule="evenodd">` per painted region, outer ring then holes. |
| `warnings[]` | `{code, message, …}`: `K_REDUCED` (`k`: the values tried), `COLOURS_MERGED` (a colour vanished in cleanup), `DROPPED_CONTOURS` (`perLayer`: chains dropped per layer, as unclosed or too short; `pixels`: their points per layer), `LAYER_WITHOUT_CONTOURS` (`layers`). |
| `timings` | Seconds spent in `read`, `quantize`, `clean`, `trace`, `smooth`, `order` and `svg`. |
| `settings` | The request with defaults filled in, without `image`. |

## Example

`request.json`, next to a copy of the logo example:

```json
{
  "image": "logo_holes.png",
  "trace": { "method": "original" },
  "output": { "holes": "all", "digits": 1 }
}
```

```sh
node raster-to-vector/cli.mjs request.json --svg logo.svg > result.json
```

The result, with the region coordinates, the SVG and the settings shortened:

```json
{
  "width": 300, "height": 200, "k": 3,
  "dbi": { "3": 0 },
  "palette": [
    { "layer": 1, "hex": "#000000", "alpha": 0, "share": 0.7539333333333333, "transparent": true },
    { "layer": 2, "hex": "#1C3657", "alpha": 1, "share": 0.225, "transparent": false },
    { "layer": 3, "hex": "#F5A361", "alpha": 1, "share": 0.021066666666666668, "transparent": false }
  ],
  "regions": [
    { "layer": 1, "frame": true, "outer": [[-2, -2], [-2, -1], ...], "holes": [] },
    { "layer": 1, "frame": false, "outer": [[-2.8705077547596263, -2.8887477865014866], ...], "holes": [[...], [...], [...]] },
    ...
  ],
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 300 200\" width=\"300\" height=\"200\">\n<path d=\"M82.5,30.4L81.6,30.5 80.7,30.6 ...",
  "warnings": [{ "code": "K_REDUCED", "message": "the image has 3 distinct colours; k tried: 3", "k": [3] }],
  "timings": { "read": 0.008, "quantize": 0.062, "clean": 0.015, "trace": 0.093, "smooth": 0.038, "order": 0.068, "svg": 0.007 },
  "settings": { "preprocess": { "maxDim": null, "scale": 1, "pad": 3 }, ... }
}
```

The 11 regions are, in paint order: the frame and the background (both transparent, so not drawn), the ring, B and 8 (with their hole and counters cut, as `holes` is `"all"`), the transparent fill of the ring's hole (with the disc cut out) and of the four counters, and the disc. The image has only three colours, so k = 3 is the only candidate, and each cluster being a single colour gives an index of 0. `logo.svg` is byte for byte the SVG of `Rscript vectorize.R --image=logo_holes.png --request=…` with the same options.

## Method

The stages, each as the R version's (file names in `core/`):

1. **Preprocess** (`image.js`). The optional downscale reproduces ImageMagick 6's Box resize at 16 bits, colour weighted by alpha. The image is then upscaled and padded by replicating its edge pixels.
2. **Quantize** (`quantize.js`). Values are rounded to `digits`, and transparent pixels get the sentinel RGB = −1. The distinct colours are counted. Weighted k-means then runs on the `nTop` most frequent, for each k: 10k restarts from k-means++ starts, at most 5k − 1 updates each, keeping the least weighted sum of squares. Every pixel takes its nearest centre. The centres become mean pixel colours, rounded to 3 decimals. The Davies–Bouldin index is computed over all pixels, in the clustering space. The random numbers are R's own (`shared/rng.js`): Mersenne-Twister seeded as `set.seed()` seeds it, R's rejection sampling for uniform draws, and R's weighted draw. Distinct colours are ordered as R's `table()` orders their strings, in C collation.
3. **Clean** (`quantize.js`). Each pass absorbs runs shorter than `minRun` along rows, then along columns. Colours left without pixels are dropped.
4. **Trace**. Marching squares (`trace-ms.js`) turns every pixel edge between inside and outside into a unit segment with the inside on its left. The segments link into rings, turning left at saddles. The original tracer (`trace-original.js`) works on each mask with a margin: it dilates the mask up and left, finds Sobel edges, keeps the inner border near them, and thins it to a 4-connected line. It then follows chains greedily. R did its convolutions with ImageMagick; on binary masks they are exact window operations with ImageMagick's anchoring (the kernel origin reflected) and edge-replicating borders, reproduced here. Both tracers put vertices on pixel corners.
5. **Smooth** (`smooth.js`, `wavelet.js`). Each ring's x and y are smoothed as circular series. The wavelet method is a MODWT pyramid, which soft-thresholds every detail level at multiplier × noise and leaves the level-J smooth untouched. The Fourier method zeroes, for both coordinates, each frequency where both \|X + Y\| and \|X − Y\| fall below the threshold, as R's 2-D FFT does (any length, by Bluestein's algorithm). The Hadamard method applies a sequency-ordered Walsh transform, zero-padded to a power of two, soft-thresholded at the sd of its last 20 coefficients.
6. **Order** (`order.js`). The padded image's rectangle is added to the colour most frequent on its border. For every pair of shapes with overlapping bounding boxes, each one's share of area inside the other is computed. R uses sf (GEOS) for this, with `st_make_valid()` for self-intersecting rings, which fills them by the nonzero winding rule. Here the same areas come from an exact trapezoid sweep under that rule. Shapes paint in order of (containers − contained). A pair that is the same shape both ways is a hole and its filler; the member whose layer matches the nearest container is not painted.
7. **SVG** (`svg.js`). Each impostor ring becomes a hole of the smallest painted shape of its own layer that contains it, drawn with the filler's ring. Numbers are rounded as R's `round()` and written without trailing zeros.

**Agreement with the R version.** On the R repository's six examples (flat cartoon, logo with holes, anti-aliased drawing and smiley, a photo, Alice) with both tracers, and 18 more option sets, the JS result matches R's. That covers every smoothing method, both noise estimates, both Fourier thresholds, all hole modes, OKLab, unweighted seeding, fixed k, `kRange` with `offset`, `nTop`, `digits`, `maxDim` with `scale` and `pad`, `kconvInit` and extra cleanup passes. In each case k, the palette and every pixel's label are R's, as are every traced ring, the dropped chains and the paint order. Smoothed coordinates agree to 1e-12, and the SVG is byte-identical. The JS MODWT matches waveslim to 1e-14. JS takes 0.05–0.6 s on these examples, where R takes 0.4–4.8 s.

R's own result depends on its collation locale: `table()` orders the colour strings that k-means starts are drawn from by the locale's rules. The comparison ran R with `LC_COLLATE=C`. Under en_US.UTF-8, R's photo example differs: two palette colours shift by 1/255, and its original tracer loses the flower head. On the other examples the locale made no difference.

**Where this deliberately differs from R.** R's `clean.passes = 0` still runs one pass, as `1:0` counts down. Here `passes` must be at least 1, and `minRun: 1` skips cleanup. R's Hadamard smoothing stops with a subscript error when a contour has 9 to 16 points. Here that is a `HADAMARD_SHORT_CONTOUR` error that suggests `trace.minLength` 17. R reads 16-bit PNGs at full depth; the CLI's PNG decoder keeps each sample's high byte.

## Not ported

These R options are refused with a `NOT_PORTED` issue:

- `quantize.cores`: forked k-means restarts (`parallel::mclapply`). The restarts run in one thread, as R does with `cores = 1`.
- The R CLI's `--preview` (input | quantized | SVG as a PNG): plain Node has no SVG rasterizer. It is a usage error here, like any option the CLI does not have; use the page, or open the SVG.

An `image` given as a file path works only in the CLI (PNG only). R's numeric-array input (values in 0–1) is replaced by RGBA bytes.

## Errors

A problem throws a `RasterToVectorError` (in the CLI, JSON on stderr) that reports every problem at once:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request: quantize.cores: not ported: forked k-means restarts (parallel::mclapply) are R only; the restarts run in one thread here, as R does with cores = 1, so leave the field out; quantize.kRang: unknown field; quantize has k, kRange, offset, nTop, digits, alphaThreshold, seeding, space, seed; trace.method: must be one of: marching_squares, original; and 1 more",
    "issues": [
      { "code": "NOT_PORTED", "path": "quantize.cores", "message": "not ported: forked k-means restarts (parallel::mclapply) are R only; the restarts run in one thread here, as R does with cores = 1, so leave the field out" },
      { "code": "UNKNOWN_FIELD", "path": "quantize.kRang", "message": "unknown field; quantize has k, kRange, offset, nTop, digits, alphaThreshold, seeding, space, seed" },
      { "code": "INVALID_FIELD", "path": "trace.method", "message": "must be one of: marching_squares, original" },
      { "code": "INVALID_FIELD", "path": "clean.passes", "message": "must be an integer of at least 1 (R runs one pass for 0, as 1:0 counts down; use minRun: 1 for no cleanup)" }
    ]
  }
}
```

The issue codes are `MISSING_FIELD`, `UNKNOWN_FIELD`, `INVALID_FIELD`, `INVALID_IMAGE` and `NOT_PORTED`, as in R. Two stages can fail on a valid request, each with its own code and one issue. `CLEANUP_FAILED` (path `clean.minRun`) means a row or column has no run long enough to absorb the short ones into. `HADAMARD_SHORT_CONTOUR` (path `smooth.method`) is described above. The CLI's own problems use `USAGE`, `UNREADABLE_INPUT` and `INVALID_JSON`.
