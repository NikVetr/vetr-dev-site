# Text in Image API

Text in Image writes a text inside the shape of a picture. Lines are wrapped to the picture's non-background pixels, each character takes the colour of the pixels beneath it, and the letter size is iterated until the text just fills the shape. It is a port of the R tool [github.com/NikVetr/text-in-image](https://github.com/NikVetr/text-in-image) and keeps its existing request defaults, with an optional whole-word layout.

It has a single entry point, `submit(request) → result`. The request and the result are plain JSON. The web page (through a worker), `window.TextInImage` and the command line all call this same function. The same request, seed included, always gives the same result apart from `timings_ms`.

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node text-in-image/cli.mjs request.json                                   # result JSON on stdout
node text-in-image/cli.mjs < request.json                                 # or read the request from stdin ("-" also works)
node text-in-image/cli.mjs request.json --svg fill.svg --background white  # also write the text fill as SVG
```

In a request read by the CLI, `image` may be the path of a PNG file instead of pixels. The path is resolved from the request file's folder, or from the working directory for stdin. The CLI decodes PNGs itself (any colour type and bit depth, not interlaced); JPEG and other formats must be converted to PNG first. `--background` takes the same colours as `renderSvg` (default `black`).

The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request, an unusable input or invalid JSON, or 2 for a usage problem or an unreadable request file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers. Importing it loads the bundled font (a file read in Node, a fetch in a browser), after which `submit` and `renderSvg` are synchronous:

```js
import { submit, renderSvg } from './text-in-image/core/index.js';
const result = submit({ image: { width, height, data }, text: 'Alice was beginning to get very tired' });
const svg = renderSvg(result, { background: '#7f7f7f' });
```

**In the page** (https://vetr.dev/text-in-image/). The computation runs in a worker, so `submit` returns a Promise:

| Member | Does |
| --- | --- |
| `submit(request)` | Runs the request, loads its image, text and settings into the page, and resolves to the result. An invalid request rejects with a `TextInImageError` and leaves the page unchanged. |
| `getRequest()` | Returns the request the page's image, text and settings currently describe. Its `image.data` is a `Uint8ClampedArray`; convert it with `Array.from` before writing the request as JSON. |
| `getResult()` | Returns the result on display, or `null`. |
| `undo()`, `redo()` | Restore the previous or next page checkpoint and return whether one was available. Pending rendering/loading is invalidated; saved results are restored without recomputation. |
| `exportSvgText()` | Returns the text fill on display as SVG text, on the page's background colour. |
| `exportPngBlob()` | Returns a Promise of the same fill as a PNG `Blob`, at the result's `canvas` size. |
| `decodeImage(source, maxSide?)` | Decodes a `Blob` or an image URL to `{width, height, data}` with the browser, without colour-profile conversion, optionally scaled down so the longer side is at most `maxSide`. |

The page scales uploaded images down to its "Longest image side" (800 px by default) before building the request. Its background control sets both `color.background` and the SVG background. The page starts with **Keep words together** enabled (`layout.wrap: "word"`) and eight size rounds to fit the shape more closely. Load example also enables whole words; API and CLI requests that omit `layout.wrap` retain character wrapping for compatibility with R.

The page keeps up to 20 history checkpoints in memory, sharing decoded assets and completed results between them. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z navigate this history outside text/numeric editors and dialogs; those controls keep their native editing shortcuts. New changes after Undo discard the redo branch.

## Request

Unknown fields are rejected at every level. Every section and field except `image` and `text` is optional.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `image` | object | (required) | Decoded pixels: `{width, height, data}`, where `data` holds width × height × 4 RGBA values from 0 to 255, row by row from the top left (an array, `Uint8Array` or `Uint8ClampedArray`; a browser `ImageData` works). |
| `text` | string or array of strings | (required) | The text. Array elements are joined with spaces. Character mode collapses every whitespace run into one space. Word mode collapses horizontal whitespace, normalizes CRLF/CR to LF, and preserves explicit line breaks and blank lines. |
| `seed` | integer 0–4,294,967,295 | `1` | Seed for the k-means starts. |
| `quantize` | object or `null` | see below | Colour reduction. `null` uses the image's colours as they are. |
| `quantize.method` | `"oklab_kmeans"` | `"oklab_kmeans"` | The quantizer. `"tsne_kde_kmeans"` is refused (see [Not ported](#not-ported)). |
| `quantize.k` | integer 1–256 | `15` | Number of colours. It cannot exceed the image's number of distinct colours. |
| `quantize.weight_pow` | number 0–10 | `0.5` | Each distinct colour weighs its pixel count to this power: 1 weighs every pixel equally, smaller values give rare colours more pull. |
| `quantize.grid` | number, 0 < x ≤ 1 | `0.01` | OKLab rounding that defines "distinct" colours. |
| `quantize.restarts` | integer 1–100 | `5` | k-means runs from fresh k-means++ starts; the best is kept. |
| `quantize.transparent_color` | colour | `"white"` | For an image with no transparent pixel: pixels within √3/3 (in 0–1 RGB) of this colour become background. |
| `quantize.transparency_thresh` | number 0–1 | `0.99` | A pixel is opaque, and quantized, when alpha^0.5 is at least this. The rest become background. |
| `quantize.denoise` | `"none"` | `"none"` | `"original"` is refused (see [Not ported](#not-ported)). |
| `region.alpha_thresh` | number 0–1 | `0.2` | A pixel may hold text when its alpha exceeds this and it is not pure white. |
| `font.family`, `font.face` | `"Liberation Sans"`, `2` | the same | The one bundled font, Liberation Sans Bold. Other values are refused. |
| `layout.n_rounds` | integer 1–50 | `5` | Layout passes of the size iteration. |
| `layout.line_height` | number, 0 < x ≤ 10 | `1.21` | Line pitch as a multiple of the capital height (the height of "M"). |
| `layout.justify` | boolean | `true` | Spread the spaces of each run of a line so the text spans it, on the last pass. |
| `layout.rotation` | number −360–360 | `0` | Writing angle, degrees counterclockwise. |
| `layout.line_widths` | `"band"` or `"row"` | `"band"` | `"band"`: a line may use the columns paintable over the whole height of its capitals. `"row"`: the columns of the single pixel row nearest the line. |
| `layout.wrap` | `"character"` or `"word"` | `"character"` | Character mode retains the R layout. Word mode keeps each whitespace-delimited word (including attached punctuation) in one connected shape run, preserves explicit newlines, and reduces the font size for long words. |
| `layout.skip_gaps` | boolean | `true` | Skip lines that fall in a vertical gap of the shape instead of writing into it. |
| `color.ink_compensation` | boolean | `false` | Brighten each glyph so that, covering only part of its box, it averages with `color.background` to the pixel colour. |
| `color.background` | colour | `"black"` | The background ink compensation aims for. |
| `render.scale` | number, 0 < x ≤ 50 | `5` | Output pixels per image pixel. Changes `font_size_px` and the canvas, not the layout. |
| `render.margin` | number 0–1 | `0.04` | Padding around the picture on the canvas, as a share of its size on each side. |

A colour is written `#rrggbb` or `#rgb`, or is `"black"` or `"white"`.

**Images without transparency.** An image in which every pixel is fully opaque is treated as having no alpha channel, as the R version treats an RGB image: pixels close to `quantize.transparent_color` (white unless set; always white with `quantize: null`) become background. So a JPEG photo on white paper works, and a PNG with a transparent background is used as drawn. This differs from the R version only for a PNG that has an alpha channel but no transparent pixel, which R reads as RGBA and so does not make near-white pixels background.

## Result

| Field | Meaning |
| --- | --- |
| `cex` | Letter size in R's `cex` units (12 px each). |
| `font_size_px` | Letter size in output pixels, `12 × cex`. |
| `complete` | Whether every character is placed, including whitespace. In word mode, an unfit word is wholly unplaced; explicit whitespace consumes no ink. This final status is computed from the glyphs, independently of the size search's stopping condition. |
| `fraction_placed` | Share of characters placed. |
| `lines` | Number of lines written. |
| `history[]` | One entry per layout pass: `round`, `cex`, `ratio` (above 1: the search considered the pass fitting; below 1: it considered it exhausted), `complete`, `fraction_placed`. These are the original size-search diagnostics: in character mode a pass can have `complete: false` and `fraction_placed: 1` when its last character exhausts the last line. The final `complete` field and warnings report actual placement; the historical size search and output geometry are unchanged. |
| `glyphs[]` | One entry per character of the text (see below). |
| `canvas` | `{width, height}` of the output in pixels: the (rotated) picture at `render.scale`. |
| `image` | `{width, height}` of the input. |
| `palette` | With quantization: `colors` (`#rrggbb`, in cluster order), `proportions` (share of opaque pixels), and `error` (`mean` and 99th percentile `p99` of the OKLab distance from each opaque pixel to its palette colour). `null` with `quantize: null`. |
| `settings` | The request with defaults filled in, without `image` and `text`. |
| `timings_ms` | Milliseconds spent in `quantize`, `region`, `layout` and `color`. |
| `warnings[]` | Plain-text warnings: text that did not fit, and characters the font has no glyph for (drawn as its empty box). |

Each glyph has these fields:

| Field | Meaning |
| --- | --- |
| `char` | One character (code point) of the text; spaces included. |
| `x`, `y` | Where the character was placed, in the picture's unit square: x from 0 (left) to 1 (right), y from 0 (bottom) to 1 (top). `null` when not placed. |
| `line`, `block` | Its line (from 1, top) and its run within the line (from 1, left), counted on the rotated picture. `null` when not placed. |
| `placed` | Whether it was placed. |
| `col` | Its colour, `#rrggbb` (`#rrggbbaa` for a partly transparent pixel with `quantize: null`). `null` when not placed, and for blank characters with ink compensation. |

**Drawing glyphs yourself.** `renderSvg` is the reference. With W × H the canvas, m the margin and s = 1 + 2m, a glyph's anchor is at canvas pixel X = (x + m) / s × W + 7.2, Y = (1 + m − y) / s × H (y down). The character is drawn at `font_size_px` with its origin on the anchor's x and its baseline h / 3 below the anchor, where h is the height of "M" (1409 / 2048 em); with `rotation`, it is turned counterclockwise by that angle about the anchor. The 7.2 px is the offset of R's `text(pos = 4)`, half of R's 14.4 px character height, whatever the letter size.

## renderSvg(result, options)

Returns the text fill as an SVG document of `canvas` size: a background rectangle, each distinct character's outline once in `<defs>`, and one `<use>` per placed, non-blank glyph. The outlines are the font's, so the SVG needs no font and draws the same in every viewer. `options.background` is a colour as above (default `"black"`). An invalid background throws a `TextInImageError` with one `wrong_type` issue at `background`.

## Method

The stages, each as the R version's (file names in `core/`):

1. **Colours** (`quantize.js`). Opaque pixels are converted to OKLab. Their distinct colours (OKLab rounded to `grid`) are clustered by weighted k-means with weighted k-means++ starts, each colour weighing its pixel count ^ `weight_pow`; the best of `restarts` runs is kept. Every opaque pixel then takes its nearest centre, and each palette colour is the mean sRGB of its pixels. Random numbers come from mulberry32 seeded with `seed`.
2. **Region** (`region.js`). The picture is turned clockwise by `rotation` (nearest neighbour, on a grid large enough to hold it). Paintable pixels are those with alpha above `alpha_thresh` that are not pure white.
3. **Layout** (`layout.js`, `word-layout.js`). Advance widths and the height of "M" come from the font's units, unhinted and without kerning. In the default character mode, characters fill each horizontal run of the current line left to right and break mid-word; a full line moves down by `line_height` × the height of "M", stepping past rows with no room. The first letter size makes the text's area equal the paintable area. Each pass then grows the size by 1/√(share of the region used) when the text fit and shrinks it by √(share placed) when it did not, damped by half; once both have been seen, it bisects. The last pass uses the fitting size that came closest to filling the region and is the only one justified.
   In word mode, each entire word must fit before it is placed: a narrow run is skipped, and long words constrain the initial font size. Before a fitting size is found, unsuccessful passes shrink more quickly; later passes bisect as above. Words are never hyphenated or split, even across disjoint pieces of one line. Justification stretches only spaces (a lone word is centered), and explicit newlines advance a full line. Too few size rounds can still leave text unplaced, reported through `complete`, `fraction_placed` and `warnings`.
4. **Colour** (`colors.js`). Each placed glyph takes the most frequent colour among the pixels of its line's nearest pixel row, between the midpoints to its neighbours. With ink compensation the colour c becomes (c − background × (1 − p)) / p with p = √(ink coverage), scaled into range, where ink coverage is the glyph's outline area over its advance × "M" height. Positions are then turned back counterclockwise onto the picture.

**Agreement with the R version.** On the R repository's Alice example (689 × 660 px, chapter 1, 11,201 characters) with default settings, the JS result has a letter size within 0.02% of R's (30.18 px), the same 116 lines, all characters placed, 97% of characters on the same line as in R, and the same 15 palette colours to within an OKLab distance of 0.014 with the same colour error (mean 0.0096, 99th percentile 0.077). Rotation, row line widths without gap skipping, ink compensation and `quantize: null` agree as closely, with at most one line more (125 against 124, for `quantize: null`). The small differences come from R's metrics being rounded to whole pixels at its 1200 px measuring size, from the two random number generators, and, for ink compensation, from R estimating ink coverage by counting pixels more than 90% inked, which reads about 5% lower than the exact outline area used here.

## Not ported

These R options are refused with an `r_only` issue that names the R repository:

- `quantize.method: "tsne_kde_kmeans"`: the original quantizer (t-SNE embedding of the colours, KDE-weighted resampling, weighted k-means with k chosen by the Davies–Bouldin index). Its fields (`ncol_range`, `kde_thresh` and the rest) go with it.
- `quantize.denoise: "original"` and `quantize.dist_w`: the noisy-pixel denoiser and its weight.
- `font.family` other than `"Liberation Sans"` and `font.face` other than `2`: other fonts and faces.
- `render.backgrounds`: the R version writes one PNG per background. Here each SVG has one background, given to `renderSvg` or the CLI's `--background`.

The R version's diagnostic files (processed image, paintable-pixel map, palette and embedding plots, character boxes, glyph CSV) are not produced; the result's `palette` and `glyphs` carry the same information as data.

## Errors

A problem throws a `TextInImageError` (in the CLI, JSON on stderr) that reports every problem at once:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid request: quantize.method: the t-SNE + KDE + weighted k-means quantizer exists only in the R implementation (https://github.com/NikVetr/text-in-image); use \"oklab_kmeans\", or run the R version; layout.rotaton: unknown field; ...",
    "issues": [
      { "code": "r_only", "path": "quantize.method", "message": "the t-SNE + KDE + weighted k-means quantizer exists only in the R implementation (https://github.com/NikVetr/text-in-image); use \"oklab_kmeans\", or run the R version" },
      { "code": "unknown_field", "path": "layout.rotaton", "message": "unknown field; layout has n_rounds, line_height, justify, rotation, line_widths, wrap, skip_gaps" },
      { "code": "out_of_range", "path": "layout.n_rounds", "message": "must be an integer from 1 to 50" }
    ]
  }
}
```

The top-level `code` is one of:

- `invalid_request`: the request breaks the schema. Its issue codes are `unknown_field`, `missing_field`, `wrong_type`, `out_of_range`, `r_only` (an R option this version does not have) and, in the CLI, `unreadable_image` (an image path that cannot be read or decoded).
- `unusable_input`: a valid request that cannot be carried out, found while processing: an image with no opaque or no paintable pixels, or `quantize.k` above the image's number of distinct colours. Its one issue has code `unusable_input`.
- In the CLI only, `invalid_json`, `usage` and `unreadable_input`, which have no issues.
- In the page only, `internal_error` if the worker fails.

Each issue has a `code`, a `path` (such as `layout.n_rounds`, `image.data[4]`, or `""` for the request as a whole) and a `message`.

## Worked example

`request.json`, in the repository root:

```json
{
  "image": "text-in-image/examples/alice-drink-me.png",
  "text": "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.",
  "quantize": { "k": 6 },
  "layout": { "rotation": 10 }
}
```

`node text-in-image/cli.mjs request.json --svg fill.svg --background white` prints the following (shown indented, with 100 of the 104 glyphs and the timings left out; the CLI prints it on one line):

```json
{
  "cex": 15.543156593715825,
  "font_size_px": 186.5178791245899,
  "complete": true,
  "fraction_placed": 1,
  "lines": 15,
  "history": [
    { "round": 1, "cex": 15.961852424069466, "ratio": 0.9582689228305229, "complete": false, "fraction_placed": 0.9230769230769231 },
    { "round": 2, "cex": 15.628799776431142, "ratio": 0.9780806756909203, "complete": false, "fraction_placed": 0.9615384615384616 },
    { "round": 3, "cex": 15.457513411000509, "ratio": 1.0319125327897465, "complete": true, "fraction_placed": 1 },
    { "round": 4, "cex": 15.543156593715825, "ratio": 1.0178760831782687, "complete": true, "fraction_placed": 1 },
    { "round": 5, "cex": 15.543156593715825, "ratio": 1.0178760831782687, "complete": true, "fraction_placed": 1 }
  ],
  "glyphs": [
    { "char": "A", "x": 0.5362657712347909, "y": 0.9222749053215709, "line": 1, "block": 1, "placed": true, "col": "#f5e4c0" },
    { "char": "l", "x": 0.4501842239958899, "y": 0.8538368743107245, "line": 2, "block": 1, "placed": true, "col": "#150807" },
    ...
    { "char": "o", "x": 0.571544453626289, "y": 0.1085799257114603, "line": 15, "block": 1, "placed": true, "col": "#150807" },
    { "char": ".", "x": 0.6687462578197017, "y": 0.11989833180295834, "line": 15, "block": 2, "placed": true, "col": "#958257" }
  ],
  "canvas": { "width": 1925, "height": 2915 },
  "image": { "width": 295, "height": 540 },
  "palette": {
    "colors": ["#daad73", "#150807", "#492511", "#745129", "#958257", "#f5e4c0"],
    "proportions": [0.1511009093833153, 0.17924500716395217, 0.16447849352320243, 0.13403900698850843, 0.11924325272668791, 0.25189333021433374],
    "error": { "mean": 0.06217871187770626, "p99": 0.13531657134686012 }
  },
  "settings": {
    "seed": 1,
    "quantize": { "method": "oklab_kmeans", "k": 6, "weight_pow": 0.5, "grid": 0.01, "restarts": 5, "transparent_color": "white", "transparency_thresh": 0.99, "denoise": "none" },
    "region": { "alpha_thresh": 0.2 },
    "font": { "family": "Liberation Sans", "face": 2 },
    "layout": { "n_rounds": 5, "line_height": 1.21, "justify": true, "rotation": 10, "line_widths": "band", "skip_gaps": true, "wrap": "character" },
    "color": { "ink_compensation": false, "background": "black" },
    "render": { "scale": 5, "margin": 0.04 }
  },
  "timings_ms": { "quantize": ..., "region": ..., "layout": ..., "color": ... },
  "warnings": []
}
```

Fifteen lines of 186 px letters fill Alice, tilted 10° counterclockwise. The first three passes were too large or too small; the fourth, at cex 15.54, fit with a little room left (`ratio` 1.018), and the last pass reused it. With six colours, the lightest, `#f5e4c0`, is the most common, at a quarter of the opaque pixels. `fill.svg` is the 1925 × 2915 px drawing on white.
