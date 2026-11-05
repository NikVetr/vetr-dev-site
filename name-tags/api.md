# Name Tags API

Name Tags lays out names, one per tag, in the cells of a laser-cut tray, and draws each tray-full as an SVG sheet for the laser cutter. A two-line name is fitted around a decoration by a small optimizer. It has a single entry point, `submit(request) → result`. The request and the result are plain JSON. The web page, `window.NameTags` and the command line all call this same function, and the same request (seed included) always gives the same result.

It is a port of Nik Vetr's R name-tag drawer (`nametag_submit(request)`), with the same request fields and defaults. The random numbers are R's: a seed draws the same optimizer restarts and stroke jitter as `set.seed(seed)` does in R, and the optimizer is R's `optim(method = "BFGS")`, so fits agree with R's (see [Agreement with R](#agreement-with-r)).

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node name-tags/cli.mjs request.json              # sheets written to the current directory, result JSON on stdout
node name-tags/cli.mjs request.json --out out/   # sheets written to out/
node name-tags/cli.mjs < request.json            # or read the request from stdin ("-" also works)
```

The sheets go to `--out`, else `output.dir` (read relative to the request file), else the current directory. In the printed result each sheet's `svg` text is replaced by the `path` it was written to. As in the R version's command line, files can be given by path, read relative to the request file (or the current directory for stdin):

- `names_file` instead of `names`: a `.txt` file with one name per line, or a `.csv` file with a `name` column and an optional `logo` column of logo files, one per name. The sheets are then named after the file (`team_names.txt` gives `team_names_grid_1.svg`) unless `output.prefix` is set.
- `tray` as a tray JSON file (any string ending in `.json` that is not a preset name).
- `logo.file`, and the CSV's logos: `.svg`, `.png` or `.jpg` files.

So the R repository's example requests run unchanged once their file paths are right. The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request or invalid JSON, or 2 for a usage problem or an unreadable file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers. Importing it loads the four bundled font files (top-level `await`), after which `submit` is synchronous:

```js
import { submit } from './name-tags/core/index.js';
const result = submit({ names: ['Ada Lovelace', 'Alan Turing'] }, { onProgress: (p) => console.log(p.done, p.total, p.name) });
// result.sheets[0].svg is the sheet's SVG text
```

`submit` takes an optional second argument, `{ onProgress }`, called after each tag with `{ done, total, name }`. It is not part of the JSON request, so the command line has no equivalent. The core also exports `parseNamesText(text)` and `parseNamesCsv(text)` (the names-file formats), `splitNameLines(name)`, `DEFAULTS`, `DEFAULT_STYLE`, `DEFAULT_HERSHEY_EKG`, `TRAY_PRESETS`, `FONTS` and `NameTagsError`.

**In the page** (https://vetr.dev/name-tags/). The page runs `submit` in a Web Worker, so these calls return promises:

| Member | Does |
| --- | --- |
| `submit(request)` | Runs the request, loads it into the page's inputs, shows the result and resolves with it. An invalid request rejects with a `NameTagsError` and leaves the page showing what it showed. |
| `getRequest()` | Returns the request the page's inputs currently describe. |
| `getResult()` | Returns the result on display, or `null`. |
| `exportSvgText(sheet)` | Returns a sheet's SVG text; `sheet` is 1-based and defaults to the sheet on display. |
| `stop()` | Stops a running fit; the pending `submit` rejects with an `Error`. |

## Request

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `names` | array | (required) | The names, each a string or `{name, logo}` (a logo for that tag; see `logo`). |
| `tray` | string or object | `"keychain_big"` | A preset name or a tray object (see below). |
| `cells` | array | in order | One cell number per name. A repeated cell starts a new sheet. |
| `font` | object | `{family: "Inter"}` | `family`: `"Inter"` or `"Source Serif Pro"`, the two bundled families. |
| `decoration` | string | `"dna"` | `"dna"`, `"none"`, `"hershey_ekg"` or `"logo"` (see [Decorations](#decorations)). |
| `logo` | object | see below | The logo for `decoration: "logo"`. |
| `style` | object | see below | Text sizing, small caps, and the optimizer. |
| `hershey_ekg` | object | see below | Pen widths and placement for the Hershey design. |
| `seed` | integer | `1` | Seed for every random draw, as R's `set.seed()`; from -2147483647 to 2147483647. |
| `ncores` | integer | `1` | Must be 1. The R version can run restarts in parallel, which draws different starts. |
| `output` | object | `{prefix: "nametags"}` | `prefix` names the sheets (`<prefix>_names_grid_<k>.svg`, or `_logos_grid_` for logos). `dir` is where the command line writes them. `pdf` must be `false`. |

Unknown fields are rejected at every level. `names_file` is accepted only by the command line, and `font.dir` (a font directory) only by the R version.

**Names.** A tag holds one or two lines. The first word goes on the top line and the remaining words below, or a single `|` sets the break (`"Mary Ann|Evans"`). A one-word name is one line and carries no decoration. When the top line has a descender (y q p g j) and `style.smallcaps` is on, the name is set in capitals (`"Hedy Lamarr"` becomes `HEDY` / `LAMARR`), with small capitals after each line's first letter. There may be up to 5,000 names of up to 200 characters.

**Tray.** All lengths are inches on a page with y up. Cells are numbered from the bottom-left, left to right, then upwards, and must lie inside the page. A regular tray gives:

| Field | Meaning |
| --- | --- |
| `name` | Optional label, reported back. |
| `page_in` | Page width and height. |
| `cell_in` | Tag width and height. |
| `grid` | Columns and rows. |
| `spacing_in` | Gap between neighbouring tags in x and y; the pitch is `cell_in + spacing_in`. |
| `first_center_in` | Centre of cell 1. |

An irregular tray gives `centers_in`, one `[x, y]` per cell in cell order, instead of `grid`, `spacing_in` and `first_center_in`. The preset `keychain_big` is the big 8 × 8 keychain tray: `page_in [23.77, 13]`, `grid [8, 8]`, `cell_in [2.19, 1.22]`, `spacing_in [0.705, 0.1926]`, `first_center_in [1.7, 1.56]`.

**Logo.**

| Field | Default | Meaning |
| --- | --- | --- |
| `file` | `null` | The logo for every tag: a `data:` URL of an SVG, PNG or JPEG image. A name's own `logo` overrides it. |
| `margin_div` | `7` | The logo fits the cell less `cell width / margin_div` on each axis. |
| `center_adj_prop` | `[0, -0.005]` | Nudge of the logo as a fraction of the cell's width and height. |
| `use_file_colors` | `false` | Keep an SVG logo's fill colours instead of black. |

**Style.** The defaults are R's `default_style()`.

| Field | Default | Meaning |
| --- | --- | --- |
| `inner_margin_div` | `4.5` | The inner box is the cell less `cell width / inner_margin_div` on both axes. |
| `name_center_adj_prop` | `[0.01, 0.01]` | Nudge of the whole name as a fraction of the cell. |
| `degree_name_overlap` | `0.4` | How far the two lines are pushed to overlap horizontally before fitting. |
| `name_cex_ratio_base`, `name_cex_ratio_factor` | `0.55`, `1.1` | Bottom-line to top-line size ratio before fitting. |
| `cex_scale` | `0.95` | Overall text scale before fitting. |
| `vws_scale`, `vws_adj_yqpgj` | `0.6`, `1.5` | Gap between the lines, and its factor when the top line has descenders. |
| `prop_dist` | `0.2` | Gap around the helix box, as a fraction of its height. |
| `smallcaps` | `true` | Apply the capitals rule and small caps. |
| `smallcaps_reference_face` | `2` | `2`: small capitals shrunk by the median ratio of each capital's area in the plain face to its area in bold, so strokes keep about the plain weight. `1`: full capitals. |
| `thin_smallcaps_first_letter` | `true` | Thin the first capital's strokes to match the small ones. |
| `raise_J`, `lower_Q` | `true`, `true` | Sit capital J on the baseline; drop a leading capital Q by an eighth of its height. |
| `optimizer` | see below | The fit. |

**Optimizer** (`style.optimizer`):

| Field | Default | Meaning |
| --- | --- | --- |
| `restarts` | `20` | BFGS fits per tag (1 to 1,000): the first from the fixed start, the rest from uniform random starts. |
| `start_w1`, `start_w2` | `0.5`, `0.4` | The fixed start's top-line and helix widths (fractions of the inner box width). |
| `big_penalty` | `1000` | Weight of the hard-constraint penalties. |
| `ratio_mean_b1b2_w`, `ratio_sd_b1b2_w` | `2.5`, `10` | Preferred top-line / helix width ratio. |
| `ratio_mean_b1b2_h`, `ratio_sd_b1b2_h` | `2.5`, `0.75` | Preferred top-line / helix height ratio. |
| `ratio_mean_b2b3_w`, `ratio_sd_b2b3_w` | `1`, `10` | Preferred helix / bottom-line width ratio. |
| `ratio_mean_b1_b2b3_w`, `ratio_sd_b1_b2b3_w` | `0.925`, `0.05` | Preferred top row / bottom row width ratio. |
| `sd_iar2f`, `iar2f_weight` | `0.2`, `1` | Pull towards a whole number of helix twists. |
| `mean_ntwists`, `sd_ntwists` | `1.4`, `0.35` | Preferred number of twists. |
| `two_stage_iar2f` | `true` | Fit first without the whole-twist pull, then once with it from the best start. |

**Hershey EKG** (`hershey_ekg`; the defaults are R's `default_hershey_ekg()`): `font` (`"HersheyScript"`, the only one bundled), `r_amp` (`0.7`, the heartbeat's R-wave height), `sampling_rate` (`800`), `stroke_points` (`200`, points per smoothed stroke), `smoothing_var_thresh` (`0.9999`), `bottom_line_lwd` and `top_line_lwd` (`0.01`, `0.0075`, pen widths), `lwd_pow`, `tail_pow`, `tail_prop_floor` (`2`, `2`, `0.5`), `top_scale` (`1.85`), `top_raise` (`0.75`) and `lowercase_bottom_line` (`true`). The script font has glyphs for printable ASCII except `@ < > [ ] { } \ ^ _`, and for the ISO-Latin-1 letters, which it draws without their accents, as R does.

## Result

| Field | Meaning |
| --- | --- |
| `tray` | `{name, page_in, cell_in, n_cells}`. |
| `sheets` | One per tray-full: `{kind, sheet, file, svg}`; `kind` is `"names"` or `"logos"`, `sheet` counts from 1, `file` is the file name and `svg` the SVG text (the command line replaces `svg` by `path`). |
| `tags` | One per name, in order: `{name, lines, sheet, cell, decoration, fit}`; for logo sheets `{name, sheet, cell, decoration: "logo", logo: {type}}`. |
| `warnings` | Strings, for example characters the font has no glyph for (drawn as its empty box) or a fit retried with more restarts. |

`decoration` is what the tag got: a one-line name under `"dna"` reports `"none"`. `fit` is `null` except for DNA tags, where it holds `objective` (the cost at the solution), `w1`, `w2`, `h2` (the top-line width, helix width and helix height, in inner-box widths), `ar1`, `ar3` (the lines' height / width ratios the fit used), `ntwists` and `restarts` (more than requested if a fit with no whole twist was retried).

**Sheets.** The page is drawn at 96 units per inch, the unit Inkscape calls px, with `width` and `height` in inches, so every program opens it at true size. Engraving is filled black paths (even-odd fill); the helix is also outlined at 0.75 px, as the R version draws it; each used cell has a 0.75 px grey (`#333333`) outline for registration.

## Decorations

- `dna`: the top line, a double helix and the bottom line are three boxes inside the tag. The cost (R's `place_rectangles_bfgs`) adds quadratic penalties for missing the inner box's width, exceeding its height, the helix being larger than the top line and the bottom row being narrower than it, plus truncated-normal negative log densities that prefer set ratios and a whole number of helix twists. BFGS with central-difference gradients minimises it from `restarts` starts. Each line is then stretched into its box. The helix's straight end underlines the bottom line, with gaps where that line's descenders cross it, and strands and base pairs are merged into one outline.
- `none`: the two lines staggered (top flush left, bottom flush right) and scaled as a block to fit the tag.
- `hershey_ekg`: the name in Hershey Simplex Script single-stroke letters with an EKG heartbeat running into the bottom line (lower-cased) and out of the top line. Strokes are smoothed by wavelet shrinkage, given a pen-like varying width and merged into one outline.
- `logo`: a sheet of logos instead of names, for example for the backs of the tags; give the same names and `cells` as the front so the backs line up. An SVG logo's filled shapes are engraved (black unless `use_file_colors`) and unfilled strokes are dropped; `<text>`, `<use>` and `<image>` elements must be converted to paths first. PNG and JPEG logos are embedded as images.

## Agreement with R

The JS version reproduces the R version's numbers, including three artefacts of R's graphics devices that the fits depend on: line sizes come from the PDF device's fallback metrics for a font it does not know (every character half an em wide), glyphs are placed in the user units of a page-sized SVG device with 4% axis padding and a width truncated to whole points (about 1.08 units per inch, 0.026% more across than up), and in the small-caps scale the bold face is measured with plain-face advances. Against the R version (commit 2bb206c) on the 12-name placeholder set in three styles and the example requests:

- **Optimizer.** From the same starts, the cost agrees to 2e-16 relative and the fitted sizes to 5e-10 or better (usually 1e-12), with the same number of gradient evaluations in all 576 runs compared; the same seed draws the same random starts.
- **Glyph outlines.** Within 2e-5 in of R's, which is the precision of R's own outlines (they pass through cairo's 1/256-point grid). Small-caps lines agree to 2e-4 in, because R measures the small-caps scale on a coarse rendering (a 1.6e-4 relative difference).
- **Fits and sheets.** Fitted sizes within 5e-5, the same number of helix twists everywhere, and the rendered sheets agree on 99.9988% or more of pixels at 200 pixels per inch (ink intersection over union 0.9987 to 1).

The differences that remain are by design: R writes its sheets with `width="2281pt"` and a page mapping shrunk by the truncation of the device width (0.04%); these sheets are exactly 96 units per inch with their size in inches. Polygon operations use Clipper on a grid of about 1e-9 of the shape's extent instead of GEOS, and the eroded first small capital is close to but not exactly GEOS's buffer (no input simplification).

## Errors

Every failure is a `NameTagsError` with `code`, `message` and `issues`, a list of `{code, path, message}`; `path` is the request field (`names[3]`, `style.optimizer.restarts`, `tray.cell_in`). An invalid request is rejected before any work, with every problem it has. `toJSON()` gives `{error: {code, message, issues}}`, the form the command line prints.

| Code | When |
| --- | --- |
| `invalid_request` | The request failed validation. Its issues have codes `unknown_field`, `missing_field`, `wrong_type`, `invalid_value`, `out_of_range`, `conflicting_fields`, `too_many`, `unsupported_character` (no Hershey glyph), `cli_only` (`names_file` outside the command line) and `r_only` (a setting only the R version has, such as `ncores` above 1 or `output.pdf`). |
| `invalid_logo` | A logo could not be read (not an SVG, PNG or JPEG, an unsupported SVG element, no filled shapes). |
| `unsupported_character` | A name holds a non-space character with no outline, such as a zero-width space. |
| `fit_failed` | No fit with a whole helix twist after doubling the restarts twice; raise `style.optimizer.restarts`. |

The command line adds `usage`, `unreadable_input` and `invalid_json`, with empty `issues`.

## Worked example

`name-tags/examples/three-names.json` puts three names on the 4 × 3 example tray, `name-tags/examples/tray-4x3.json`, with five restarts per tag:

```json
{
  "names": ["Ada Lovelace", "Alan Turing", "Grace Hopper"],
  "tray": "tray-4x3.json",
  "style": { "optimizer": { "restarts": 5 } },
  "seed": 1,
  "output": { "prefix": "demo" }
}
```

```sh
node name-tags/cli.mjs name-tags/examples/three-names.json --out out
```

writes `out/demo_names_grid_1.svg` and prints (reformatted here):

```json
{
  "tray": { "name": "example_4x3", "page_in": [12, 6], "cell_in": [2.5, 1.4], "n_cells": 12 },
  "sheets": [{ "kind": "names", "sheet": 1, "file": "demo_names_grid_1.svg", "path": "out/demo_names_grid_1.svg" }],
  "tags": [
    { "name": "Ada Lovelace", "lines": ["Ada", "Lovelace"], "sheet": 1, "cell": 1, "decoration": "dna",
      "fit": { "objective": 9.178099356032506, "w1": 0.8126909105409702, "w2": 0.44368466872870355, "h2": 0.09173273527182672,
               "ar1": 0.42029387302467425, "ar3": 0.17610211558917382, "ntwists": 2, "restarts": 5 } },
    { "name": "Alan Turing", "lines": ["Alan", "Turing"], "sheet": 1, "cell": 2, "decoration": "dna",
      "fit": { "objective": 6.929962255153962, "w1": 0.8416352747244981, "w2": 0.5388688398773048, "h2": 0.11061259180358624,
               "ar1": 0.3734910076373489, "ar3": 0.2618968386023296, "ntwists": 2, "restarts": 5 } },
    { "name": "Grace Hopper", "lines": ["Grace", "Hopper"], "sheet": 1, "cell": 3, "decoration": "dna",
      "fit": { "objective": 4.101165830375833, "w1": 0.9144618491601915, "w2": 0.3482466027126161, "h2": 0.13737791042564246,
               "ar1": 0.2747272402074764, "ar3": 0.22152351007574675, "ntwists": 1, "restarts": 5 } }
  ],
  "warnings": []
}
```

The R version gives the same request `w1` = 0.8126838, 0.8416300 and 0.9144574, and the same twists. The sheet starts:

```xml
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="12in" height="6in" viewBox="0 0 1152 576">
<rect x="0" y="0" width="1152" height="576" fill="#ffffff"/>
<path fill="none" stroke="#333333" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" d="M33.6 532.8L33.6 398.4L273.6 398.4L273.6 532.8L33.6 532.8"/>
<path fill="#000000" fill-rule="evenodd" d="M64.259 483.056L87.012 420.39L96.265 420.39L119.313 483.056…"/>
```

An invalid request, `{"names": ["Mary|Ann|Evans"], "seed": 1.5}`, exits with status 1 and prints to stderr:

```json
{"error":{"code":"invalid_request","message":"The request has 2 problems: names[0]: use exactly one \"|\" between two non-empty lines: \"Mary|Ann|Evans\"; seed: must be an integer from -2147483647 to 2147483647","issues":[{"code":"invalid_value","path":"names[0]","message":"use exactly one \"|\" between two non-empty lines: \"Mary|Ann|Evans\""},{"code":"invalid_value","path":"seed","message":"must be an integer from -2147483647 to 2147483647"}]}}
```
