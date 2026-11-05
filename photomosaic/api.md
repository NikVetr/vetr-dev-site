# Photomosaic API

Photomosaic arranges a set of photos into a grid so that, from a distance, the grid reproduces a target picture. It has a single entry point, `submit(request) → result`. The request carries the target's pixels and each photo's average colour; the result is the photo for each cell, its cost, and the target averaged over each cell. Drawing the mosaic is left to the caller: the web page draws it on a canvas, and the command line can write it as a PNG. The web page, `window.Photomosaic` and the command line all call this same function, and the same request (seed included) always gives the same result.

It is a port of Nik Vetr's R script `imgdir2grid.R` (2024, after a 2023 grid of photos), which reads the photos and the target with ImageMagick (the magick package), matches them in HSL with `plotwidgets::rgb2hsl()` and assigns them with `clue::solve_LSAP()`. This computes what the script computes, including ImageMagick's scaling arithmetic: on the parity fixture (36 PNG photos, two targets) the photo summaries agree with R to 5 × 10⁻¹⁶, the cells exactly, every cost to 7 × 10⁻¹⁴ and the assignments cell for cell. On the bundled example, the page in Chromium gives R's total cost to 15 digits; the command line decodes JPEGs with a different decoder (see [Parity with R](#parity-with-r)). Two steps follow the script's evident intent rather than its letter: the target is scaled to exactly columns × rows (the script asks ImageMagick to fit it within that box, which for some shapes comes out a pixel short and stops the script), and each photo is drawn in the cell it was assigned (the script refills the cells by row, which scrambles every grid that is not square).

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
# from images: a target and a folder of photos (its .png, .jpg and .jpeg files, by name)
node photomosaic/cli.mjs --target target.png --photos photos/ > result.json
node photomosaic/cli.mjs --target target.png --photos photos/ --png mosaic.png --tile-width 200 --fit keep --tint 0
node photomosaic/cli.mjs --target target.png --photos photos/ --request-out request.json
# from a request as JSON (the page's "Request JSON" download, for example); "-" or nothing reads stdin
node photomosaic/cli.mjs request.json --metric lab
```

`--columns`, `--max-uses`, `--metric` and `--seed` set those request fields in either mode. `--png` draws the mosaic (images only): `--tile-width` pixels per column (default 200, the script's), `--fit keep` (each photo's own shape, as the script draws it) or `crop` (its centred square), and `--tint` from 0 to 1 (default 0). PNG files are read with `shared/decode-png.mjs` and JPEG files with jpeg-js's decoder (`vendor/`, Apache 2.0 and BSD licences in `vendor/LICENSES.md`); other formats the script read (HEIC, GIF, TIFF, BMP) are refused with a list, to be converted first. Like R, the command line does not apply a JPEG's EXIF orientation. It prints the result JSON on stdout and exits 0. On failure it writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request or invalid JSON, or 2 for a usage problem or an unreadable file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers:

```js
import { submit, summarisePhoto, scaleImage, layoutMosaic, composeMosaic, gridFor } from './photomosaic/core/index.js';
const mean = summarisePhoto({ width, height, data });   // a photo's [r, g, b, a] as R takes it, from RGBA pixels
const result = submit(request, { onProgress: ({ rowsDone, rows }) => {} });
const layout = layoutMosaic(result.grid, result.assignment, sizes, { tileWidth: 200, fit: 'keep' });
const rgba = composeMosaic(layout, (photo) => pixelsOf(photo), result.cells, 0);   // what --png draws
```

`onProgress` is called after each cell is placed. `scaleImage(image, columns, rows)` is the port of ImageMagick 6's ScaleImage (Q16) that both summaries use. `gridFor({count, width, height, columns, maxUses})` gives the grid a request would get, or throws its error.

**In the page** (https://vetr.dev/photomosaic/). The page runs `submit` in a Web Worker, so `submit` returns a promise:

| Member | Does |
| --- | --- |
| `submit(request)` | Runs a request and resolves with its result; the page is not changed. An invalid request rejects with a `PhotomosaicError`. |
| `generate()` | Runs the page's own photos, target and settings and shows the mosaic, as the Generate button does. |
| `getRequest()` | Returns the request the page's photos, target and settings describe. |
| `getResult()` | Returns the result on view, or `null`. |
| `exportPngBlob({tileWidth, fit, tint})` | Resolves with the mosaic as a PNG `Blob`; each option defaults to the page's setting. Photos are drawn from their files when the tile is wider than their thumbnails. |
| `stop()` | Stops a running assignment (the pending promise rejects with an `Error`). |

The page reads photos with the browser, so it takes whatever the browser decodes, with EXIF orientation applied. It halves a photo until it is at most 400 pixels wide before summarising it, and a target until neither side is over 1600 pixels; halving keeps the average colour to within a fraction of a level.

## Request

| Field | Required | Meaning |
| --- | --- | --- |
| `target` | yes | `{width, height, data}`: the target's size in pixels (whole numbers ≥ 1) and its RGBA bytes, row by row, as a base64 string of exactly width × height × 4 bytes. |
| `photos` | yes | Non-empty array of `{mean, name}`. `mean` is `[red, green, blue, alpha]`, each from 0 to 255: the photo's average as `summarisePhoto` computes it (the photo scaled to 200 pixels wide, then the mean of each channel). `name` is an optional string, echoed in the result. |
| `columns` | no | `null` (default): the script's grid, below. A whole number ≥ 1: that many columns, and round(columns × height / width) rows (at least 1). |
| `maxUses` | no | How many cells one photo may fill; default `1`, as in R. The script's grid rule then counts photos × maxUses. |
| `metric` | no | `"hsl-r"` (default, the script's) or `"lab"`. See [Method](#method). |
| `seed` | no | Seed of R's random number generator for the shuffle the script makes before matching, 0 to 2,147,483,647; default `1`. It decides only between equal costs. |

Unknown fields are rejected at every level.

## Result

| Field | Meaning |
| --- | --- |
| `grid` | `{rows, columns, cells, rule}`, `rule` being `"auto"` (the script's) or `"columns"`. |
| `assignment` | For each cell, row by row from the top left, the index in `photos` of the photo it gets. |
| `cost` | `{total, mean, perCell}`: the cost of each cell's match (row by row), their sum and their mean. `total` is least over all assignments that use each photo at most `maxUses` times. |
| `cells` | Each cell's `[r, g, b, a]` (0-255 integers): the target scaled to one pixel per cell, what the cell was matched on. |
| `uses` | For each photo, how many cells it fills. |
| `photos` | `{count, used, names}`: the number of photos, how many were used, and their names (`null` where none was given). |
| `settings` | `{columns, maxUses, metric, seed}` as used, defaults filled in. |
| `timings` | `{prepareMs, assignmentMs, totalMs}`: checking the request and scaling the target; the features and the assignment; all. |

## Method

1. **Grid.** With n photos (× maxUses) and a the target's height ÷ width once scaled to 200 pixels wide (its height as ImageMagick rounds it, round(200 × height / width)), the grid has ⌊√(n / a) · a⌋ rows and ⌊√(n / a)⌋ columns, so there are never more cells than photos; the photos left over are not used.
2. **Cells.** The target is scaled to columns × rows as ImageMagick 6's `-scale` does in its 16-bit arithmetic: each output pixel is the average of the area it covers, colour weighted by alpha, rounded to 16 and then 8 bits.
3. **Photos.** Each photo is scaled the same way to 200 pixels wide with its shape kept, and summarised by the mean of each channel.
4. **Features (`hsl-r`).** As the script computes them: magick's `as.numeric()` gives each channel on 0-1, and `rgb2hsl()`, which expects 0-255, divides by 255 again after setting alpha aside. With max and min of the three channels so scaled, the features are hue in degrees (0 to 360, from the largest channel as usual, 0 for a grey), saturation (max − min) / (max + min) (because lightness is tiny, 1 − |2L − 1| = 2L), lightness (max + min) / 2, which is at most 1/255, and alpha on 0-1. The cost of a photo for a cell is the sum of the squared differences of the four. Hue's spread in degrees makes it the main term, saturation the next, and lightness counts for almost nothing; hue is not treated as circular.
5. **Features (`lab`).** An option, not the script's: CIELAB L\*, a\*, b\* of the sRGB colour (D65 white) and alpha × 100 / 255, with the same squared-difference cost, so lightness and colour count as they are seen.
6. **Shuffle.** As the script does `sample(imgs)` before matching, the photos are put in the order R's `set.seed(seed); sample(n)` gives; equal costs go to the earlier photo in that order.
7. **Assignment.** Each cell gets its own photo (with maxUses k, each photo stands for k interchangeable slots) so that the total cost is least: the linear sum assignment problem. The script solves it with `clue::solve_LSAP()`, a covering Hungarian method on the matrix padded to square; this uses the Hungarian method in its shortest-augmenting-path form with row and column potentials, on the rectangular matrix, in O(cells² × slots). Both are exact; where several assignments tie, they can pick different ones. On the example (425 cells, 442 photos) `solve_LSAP` takes 6.6 s and this 0.1 s; 2,000 × 2,000 takes about 2 s.
8. **Drawing** (`layoutMosaic`). `keep`, the script's: each photo scaled to the tile width with its shape kept, each row as tall as its tallest photo, photos at the top of their row and the rest white (as `image_append` does). `crop`: each photo's centred square. The tint blends each tile towards its cell's colour, (1 − tint) × photo + tint × cell. Neither crop nor tint is in the script.

## Parity with R

`tests/fixtures/make-r-parity.R` runs the script's matching code on 36 PNG photos (example tiles at seven sizes from 9 × 7 to 40 × 40, five of the script's own Dirichlet colour squares, a grey, a black and a half-transparent ramp) against two targets, and `tests/core.test.mjs` checks the grid, every summary, feature and cost, the total and the assignment against it, and ImageMagick's heights for 120 sizes.

On the bundled example, R with `set.seed(1)` gives a total of 638,773.948078802 (`tests/fixtures/run-r-example.R`). Given the photo averages R computed, `submit` gives the same total to 7 × 10⁻¹⁵ and differs from R's assignment only in 16 cells where the costs tie; the page in Chromium, whose JPEG decoder matches ImageMagick's, gives that total too. jpeg-js, which the command line uses, decodes the example's JPEGs within 0.9 of a level per channel of libjpeg (0.4 on average), and with the script's hue-led cost that moves the command line's total to 651,329 (2% higher) with a different arrangement. PNG photos decode identically everywhere.

## Errors

A request that cannot be run throws a `PhotomosaicError` (in the CLI, JSON on stderr) with a `code`, a `message` and a list of `issues`, each `{code, path, message}`, `path` being 0-based. The request's fields are checked together and every problem found is listed; the grid is checked once they pass. The worked example's request with `"data": "AAAA"`, a photo with `"colour": "red"` and `"metric": "rgb"` gives:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid request: target.data: decodes to 3 bytes; 4 × 2 RGBA needs 32 (and 2 more issues)",
    "issues": [
      { "code": "wrong_length", "path": "target.data", "message": "decodes to 3 bytes; 4 × 2 RGBA needs 32" },
      { "code": "unknown_field", "path": "photos[0].colour", "message": "unknown field" },
      { "code": "out_of_range", "path": "metric", "message": "must be one of hsl-r, lab" }
    ]
  }
}
```

Issue codes: `unknown_field`, `missing_field`, `wrong_type`, `out_of_range`, `wrong_length`, and `too_few_photos` (on `photos` when the script's grid would have no cells, on `columns` when the grid asked for has more cells than photos × maxUses). The top-level codes are `invalid_request` and `internal_error`, and in the CLI also `invalid_json`, `usage` and `unreadable_input`, which have no issues.

## Worked example

A 4 × 2 target, reds on the left, blues on the right, lighter on top, and ten photos given by their averages; `request.json`:

```json
{
  "target": { "width": 4, "height": 2, "data": "3Dwy/8haPP88Wsj/KDyq/5YoKP+CPDL/Hih4/xQeWv8=" },
  "photos": [
    { "name": "poppies.jpg", "mean": [205, 70, 55, 255] },
    { "name": "sea.jpg", "mean": [50, 85, 190, 255] },
    { "name": "tomatoes.jpg", "mean": [160, 45, 40, 255] },
    { "name": "dusk.jpg", "mean": [35, 45, 110, 255] },
    { "name": "fox.jpg", "mean": [190, 100, 55, 255] },
    { "name": "lake.jpg", "mean": [45, 65, 160, 255] },
    { "name": "bricks.jpg", "mean": [120, 60, 55, 255] },
    { "name": "night.jpg", "mean": [20, 25, 80, 255] },
    { "name": "moss.jpg", "mean": [70, 110, 50, 255] },
    { "name": "sand.jpg", "mean": [200, 180, 140, 255] }
  ]
}
```

`node photomosaic/cli.mjs request.json` prints (laid out here for reading; timings vary):

```json
{
  "grid": { "rows": 2, "columns": 4, "cells": 8, "rule": "auto" },
  "assignment": [6, 4, 1, 5, 2, 0, 7, 3],
  "cost": {
    "total": 69.9499349726162,
    "mean": 8.743741871577026,
    "perCell": [1.2460053524805565, 51.020565901776855, 4.593850236319319, 1.4530205739671178, 6.250443219209013, 2.267550966470502, 2.777777925593014, 0.3407207967998286]
  },
  "cells": [[220, 60, 50, 255], [200, 90, 60, 255], [60, 90, 200, 255], [40, 60, 170, 255], [150, 40, 40, 255], [130, 60, 50, 255], [30, 40, 120, 255], [20, 30, 90, 255]],
  "uses": [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  "photos": {
    "count": 10, "used": 8,
    "names": ["poppies.jpg", "sea.jpg", "tomatoes.jpg", "dusk.jpg", "fox.jpg", "lake.jpg", "bricks.jpg", "night.jpg", "moss.jpg", "sand.jpg"]
  },
  "settings": { "columns": null, "maxUses": 1, "metric": "hsl-r", "seed": 1 },
  "timings": { "prepareMs": 0.6, "assignmentMs": 0.6, "totalMs": 1.3 }
}
```

The grid is the script's: the target scaled to 200 wide is 100 high, a = 0.5, and √(10 / 0.5) = 4.47 gives 2 rows and 4 columns; moss and sand are left out. The top row gets bricks, fox, sea and lake, the bottom row tomatoes, poppies, night and dusk: the script's cost matches hue and saturation and hardly sees lightness, so the dark bricks can take the light red cell. With `--metric lab` the assignment is `[0, 4, 1, 5, 2, 6, 3, 7]` (poppies, fox, sea, lake; tomatoes, bricks, dusk, night), total 480.5539079577967.

On the bundled example, `node photomosaic/cli.mjs --target photomosaic/examples/red-fuji.png --photos photomosaic/examples/photos --png mosaic.png --tile-width 32` gives a 25 × 17 grid of 425 of the 442 photos, an 800 × 544 PNG, in about 0.1 s of matching.

## The example

`examples/red-fuji.png` is Hokusai's *South Wind, Clear Sky* (*Red Fuji*), the Metropolitan Museum of Art's CC0 impression, and `examples/photos/` holds 442 CC0 or public-domain photographs from Wikimedia Commons as 64-pixel squares, none showing a person, chosen from 669 reviewed ones as those whose colours cover the print's. `examples/SOURCE.md` lists every file's source, author and licence.
