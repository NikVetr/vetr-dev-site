# Message Collage API

Message Collage lays out a set of short messages, such as farewell or thank-you notes, as one dense card. Each message draws a font family, a style and a size, one global scale sets all the text, and the messages flow line by line into the free cells of a grid in a shuffled order. Several random layouts can be tried, keeping the one with the fewest empty cells. It has a single entry point, `submit(request) → result`. The request and the result are plain JSON. The web page, `window.MessageCollage` and the command line all call this same function, and the same request (seed included) always gives the same result. Messages are never sent anywhere.

It is a port of Nik Vetr's R message collage (NikVetr/message-collage). The layout fields and defaults match the R version; `rotation_deg` adds optional angles and `expand_messages` adds a glyph-aware finishing pass. Text is measured from the font files with fontkit exactly as the R version's showtext engine measures it, and R's random draws are reproduced with R's generator, so with `rotation_deg: 0`, `expand_messages: false` and the same request and font files the card is R's to the last bit: every line's cells, the global scale, the empty fraction and the colours.

## Ways in

**Command line.** This needs Node 22 and nothing else (no npm install):

```sh
node message-collage/cli.mjs request.json                        # result JSON on stdout
node message-collage/cli.mjs < request.json                      # or read the request from stdin ("-" also works)
node message-collage/cli.mjs request.json --svg card.svg         # also write the card, text as outlines
node message-collage/cli.mjs request.json --svg card.svg --text embedded   # selectable text, fonts embedded
node message-collage/cli.mjs request.json --pdf card.pdf         # the card as PDF, text as outlines
node message-collage/cli.mjs --messages notes.txt [request.json] # messages from a text file, one per line
```

`--messages` reads the messages from a text file, one per line with blank lines skipped, in place of the request's `messages`; without a request file the other fields take their defaults and stdin is not read. The exit status is 0 on success. On failure the CLI writes `{"error": {...}}` (see [Errors](#errors)) to stderr and exits with 1 for an invalid request, invalid JSON or a layout that failed, or 2 for a usage problem or an unreadable file.

**ES module.** The core has no DOM access and runs in Node 22 and in browsers. `submit` returns a Promise, because it reads the font files the request uses (once per process):

```js
import { submit, loadFaces, renderSvg, renderPdf } from './message-collage/core/index.js';
const result = await submit({ messages: ['Thank you!', 'Good luck out there.', 'We will miss you.'], fill: 0.5 },
  { onProgress: (p) => console.log(p.run, p.runs, p.empty_fraction, p.best_empty_fraction) });
const faces = await loadFaces(result.request.fonts, result.request.styles);
const svg = renderSvg(result, faces);                          // text as outlines
const svgText = renderSvg(result, faces, { text: 'embedded' }); // selectable text in embedded fonts
const pdf = renderPdf(result, faces);                           // Uint8Array
```

`submit` takes an optional second argument, `{ onProgress }`, called after each layout tried with `{ run, runs, empty_fraction, best_empty_fraction }`. It is not part of the JSON request.

**In the page** (https://vetr.dev/message-collage/). The page runs `submit` and the renderers in a Web Worker, so these calls return promises:

| Member | Does |
| --- | --- |
| `submit(request)` | Lays out the request, loads it into the page's inputs, shows the card and resolves with the result. An invalid request rejects with a `CollageError` and leaves the page showing what it showed. |
| `getRequest()` | Returns the request the page's inputs currently describe. |
| `getResult()` | Returns the result on display, or `null`. |
| `exportSvgText({ text })` | Resolves with the card as SVG text; `text` is `"outlines"` (default) or `"embedded"`. |
| `exportPngBlob({ width })` | Resolves with the card as a PNG `Blob`, `width` pixels wide (default: the page's PNG width field). |
| `exportPdfBlob()` | Resolves with the card as a PDF `Blob`. |
| `stop()` | Stops a running layout; the pending call rejects with an `Error`. |

## Request

Only `messages` is required. Unknown fields are rejected, and `null` means the default.

| Field | Default | Meaning |
| --- | --- | --- |
| `messages` | (required) | Array of 1 to 1,000 message strings, each at most 2,000 characters. Ends are trimmed of spaces, tabs and line breaks, and every run of whitespace becomes one space, as in R. |
| `fonts` | all five | Families to draw from, each once: `"Source Serif Pro"`, `"Inter"`, `"Courier Prime"`, `"Lobster Two"`, `"Playfair Display"` (serif, sans-serif, monospace, script, display). The order matters: draws index into this list. |
| `styles` | all four | Styles to draw from, each once: `"plain"`, `"bold"`, `"italic"`, `"bold-italic"`. |
| `size_range` | `[1, 3]` | Relative sizes are drawn uniformly from `[min, max]` (`0 < min <= max`) and divided by their mean, so they average 1. |
| `width_in`, `height_in` | `5`, `5` | Card width, and target height, in inches (0.5 to 60). The card grows downward when the messages need more room. |
| `grid_res` | `null` | Layout cells per inch (1 to 400). `null` uses the R version's rule, `ceiling(sqrt(total characters / sqrt(width_in × height_in)))`. |
| `fill` | `0.7` | The global text scale: set on single lines, the messages would cover `fill²` of the card. |
| `rotation_deg` | `0` | Maximum message angle in degrees (0 to 10). Deterministic angles shrink until conservative glyph bounds avoid other messages and card edges; zero preserves the horizontal R layout. The page example uses 4. |
| `expand_messages` | `false` | After angles are assigned, enlarge whole messages into spare space and make small local moves. Preserves text, line breaks, typefaces and angles; conservative glyph bounds must stay clear of other messages and card edges. Up to 1.8× each initial font size. Enabled in the page example. |
| `line_gap` | `0.2` | Gap between a message's lines, as a fraction of its cap height. |
| `message_gap` | `0.4` | Buffer below every line, as a fraction of its cap height. |
| `palette` | Royal1 + Royal2 | Text colours as `#rrggbb`. A colour may be repeated, as in R. |
| `background` | `"#191b30"` | Card background, `#rrggbb`. |
| `shuffle` | `true` | Shuffle the message order once per request. |
| `seed` | `1` | Integer, \|seed\| ≤ 2,147,483,647, with `seed + runs` within that range. The order is shuffled after R's `set.seed(seed)`, and run *k* is drawn after `set.seed(seed + k)`. |
| `runs` | `1` | Random layouts to try, 1 to 1,000; the one with the smallest empty fraction is kept (the first on ties). The page starts at 20. |

Every character of every message must be in every requested family's requested faces, since any message can draw any of them. All five cover Western European letters and the usual punctuation (curly quotes, dashes, ellipsis). Source Serif Pro and Inter also cover Central European, Turkish, Romanian, Vietnamese, Greek and Cyrillic; Playfair Display all of those but Greek; Courier Prime Central European, Turkish and Romanian; Lobster Two lacks some Czech, Turkish and Romanian letters (ď ě ň ř ť ů ş ț ș ă). A missing character is an error naming the family, not a substitution.

The R version's `cores` (results do not depend on it) and `text_engine` (this port measures as `"showtext"` does) are not fields here. The R version's `fonts` also accepts installed family names and font files; this port takes the bundled families.

## Result

| Field | Meaning |
| --- | --- |
| `card` | `width_in`, `height_in` (final, after growing), `grid_res`, `n_cols`, `n_rows` (final), `target_rows`, `margin` (0.04: the grid sits inside a margin of 4% of its size on each side), `background`, `cex_scale` (the global scale), `empty_fraction`, `seed` (the kept run's), `pointsize` (12). |
| `messages[]` | In layout order: `index` (1-based), `input_index` (1-based position in the request), `text`, `family`, `style` (R's face code: 1 plain, 2 bold, 3 italic, 4 bold-italic), `style_name`, `size` (relative), `cex` (`size × cex_scale × expansion`, with expansion 1 when disabled), `font_size_pt` (`12 × cex`), `color`, `restarts` (times the message started again elsewhere), `label` (`{x, y}`: the density mode of its cells, used for colouring, in plot cells). |
| `lines[]` | One per drawn line, by message then line: `message`, `line`, `text`; cells `col`, `end_col` (after the flush-right snap), `layout_col` (before it), `row`, `end_row` (1-based, row 1 at the top); `width`, `height`, `buffered_height` (cells); `just` (`null` for a first line, else `"left"`, `"right"`, `"more_left"` or `"more_right"`), `snapped`; `x`, `y`, `cap_height` (plot cells, y up: left edge and centre of the cap height); `x_in`, `center_in`, `baseline_in` (inches from the card's top-left corner); `family`, `style`, `style_name`, `cex`, `font_size_pt`, `color`. |
| `runs[]` | Every layout tried: `run`, `seed`, `empty_fraction`, `height_in`. |
| `fonts[]` | Each requested family's `category` and the face file of each requested style (`files`, relative to `message-collage/`). |
| `request` | The request with defaults filled in. |

With zero rotation, a renderer needs only `card` and `lines`: draw each line's `text` left-aligned at `x_in` on `baseline_in`, in `family` and `style_name` at `font_size_pt`, with characters one advance width apart (no kerning or ligatures), as they were measured. This is the R version's `--layout` JSON, except that it has no `regions` hulls (only the label points, on `messages[]`) and no `timing`.

When present, `messages[].rotation` is `{angle_deg, x_in, y_in}`: rotate all lines of that message clockwise around that point, measured in inches from the card’s top-left corner. The grid coordinates, line breaks, font choices and empty-cell fraction describe the unchanged horizontal layout. SVG, PNG and PDF exports all apply the same rotation. When expansion is enabled, `messages[].expansion` records the scale applied to that message. The returned physical positions, `cex` and `font_size_pt` already include it; render them directly. Grid coordinates, `size`, `card.cex_scale` and `empty_fraction` retain the underlying R layout for diagnostics. This finishing pass is deterministic and does not consume layout RNG draws.

The denser page example uses a 6.5 × 4.8-inch card, 32 grid cells per inch and `fill: 0.75`; the API defaults remain unchanged.

## Exports

- **SVG, outlined text** (`renderSvg(result, faces)`): each glyph's outline once in `<defs>`, placed with `<use>`. Exact in every viewer, as the R version's showtext output is; the text is not selectable. About 0.3 MB for the example.
- **SVG, selectable text** (`{ text: 'embedded' }`): `<text>` elements in the bundled fonts, embedded as base64 `@font-face` rules, with kerning and ligatures turned off so the measured widths hold. The text can be searched and copied, but the file carries every face used in full (about 2 MB for the example), and it needs a viewer that reads embedded web fonts, as browsers do; some editors and converters substitute other fonts.
- **PDF** (`renderPdf(result, faces)`): one page of the card's size, each glyph a form XObject; text as outlines, as in the R version's PDF.
- **PNG** (page only): the outlined SVG drawn on a canvas at a chosen width.

The card is `width_in × height_in` with units of points (72 per inch). The R version measures on a device whose size it passes in whole points (`72 × width` truncated), so a card whose size is not a whole number of points is measured a fraction of a point narrower than it is drawn, as in R. Text therefore never overruns its cells.

## Errors

Every problem throws (or, on the command line, prints) one error:

```json
{"error": {"code": "invalid_request", "message": "Invalid request: …", "issues": [{"code": "unknown_field", "path": "colour", "message": "…"}]}}
```

`issues` lists every problem found, each with a `code`, the request `path` it is on (a JSON path such as `messages[3]`, 0-based) and a `message`. Codes:

| `error.code` | When | Issue codes |
| --- | --- | --- |
| `invalid_request` | The request is not valid. | `wrong_type`, `missing_field`, `unknown_field`, `invalid_value`, `invalid_color`, `unknown_font`, `unknown_style`, `duplicate`, `empty_message`, `too_long`, `too_many` |
| `missing_glyphs` | A message has characters a requested family lacks. | `missing_glyphs`, one per message and family |
| `layout_collision` | Expansion could not clear an existing glyph collision. Try another seed or increase the line gaps. | none |
| `word_too_wide` | At the global scale, a word is wider than the card. With few, short messages the scale gets large; lower `fill` or the spread of `size_range`, or widen the card. | `word_too_wide`, one per message |
| `degenerate_region` | A message's cells all lie in one row or column of the kept layout, so the density that places its label has no width (R's `kde2d` stops here too). Change the size, `fill` or `seed`. | none |
| `invalid_json`, `unreadable_input`, `usage` | Command line only. | none |

## Example

`request.json`:

```json
{
  "messages": [
    "Thank you for every late evening spent untangling a stubborn bug with me.",
    "The team is better because you were part of it.",
    "Best of luck in the next chapter; they are lucky to have you.",
    "Thanks for keeping us laughing."
  ],
  "width_in": 4,
  "height_in": 3,
  "fill": 0.6,
  "seed": 3,
  "runs": 5
}
```

`node message-collage/cli.mjs request.json` prints (abridged to the card, the first message, its first two lines and the runs):

```json
{
  "card": {
    "width_in": 4, "height_in": 3, "grid_res": 8, "n_cols": 32, "n_rows": 24, "target_rows": 24, "margin": 0.04,
    "background": "#191b30", "cex_scale": 1.338838229590182, "empty_fraction": 0.2994791666666667, "seed": 4, "pointsize": 12
  },
  "messages": [
    {
      "index": 1, "input_index": 1, "text": "Thank you for every late evening spent untangling a stubborn bug with me.",
      "family": "Courier Prime", "style": 3, "style_name": "italic", "size": 1.225628266902522, "cex": 1.6409179789954556,
      "font_size_pt": 19.691015747945467, "color": "#F5CDB4", "restarts": 0, "label": { "x": 13.785714285714286, "y": 20.397959183673468 }
    }
  ],
  "lines": [
    {
      "message": 1, "line": 1, "text": "Thank you for every", "col": 1, "layout_col": 1, "row": 1, "width": 28.336602349777777,
      "height": 1.6434306346507925, "buffered_height": 2.191240846201057, "end_col": 29, "end_row": 3, "just": null, "snapped": false,
      "x": 0, "y": 22.904379576899473, "cap_height": 1.3695255288756605, "x_in": 0.14814814814814814, "center_in": 0.23791903045145002,
      "baseline_in": 0.317173980039162, "family": "Courier Prime", "style": 3, "style_name": "italic", "cex": 1.6409179789954556,
      "font_size_pt": 19.691015747945467, "color": "#F5CDB4"
    },
    {
      "message": 1, "line": 2, "text": "late evening spent", "col": 1, "layout_col": 1, "row": 3, "width": 26.91977223228889,
      "height": 1.6434306346507925, "buffered_height": 2.191240846201057, "end_col": 27, "end_row": 5, "just": "left", "snapped": false,
      "x": 0, "y": 20.904379576899473, "cap_height": 1.3695255288756605, "x_in": 0.14814814814814814, "center_in": 0.4694005119329315,
      "baseline_in": 0.5486554615206434, "family": "Courier Prime", "style": 3, "style_name": "italic", "cex": 1.6409179789954556,
      "font_size_pt": 19.691015747945467, "color": "#F5CDB4"
    }
  ],
  "runs": [
    { "run": 1, "seed": 4, "empty_fraction": 0.2994791666666667, "height_in": 3 },
    { "run": 2, "seed": 5, "empty_fraction": 0.3932291666666667, "height_in": 3 },
    { "run": 3, "seed": 6, "empty_fraction": 0.3736979166666667, "height_in": 3 },
    { "run": 4, "seed": 7, "empty_fraction": 0.3515625, "height_in": 3 },
    { "run": 5, "seed": 8, "empty_fraction": 0.3736979166666667, "height_in": 3 }
  ]
}
```

In full, the card has 10 lines: the four messages in Courier Prime italic, Courier Prime bold, Courier Prime plain and Lobster Two bold. The first run left the fewest cells empty, so it was kept.

## Method

1. **Fonts.** Each message draws a family and a style uniformly with replacement, and a size from `size_range`, divided by the mean of the sizes.
2. **Measurement.** Every word's width, a space's width, the cap height (the top of "M") and the full width × cap height, in grid cells: advance widths from the font file, unhinted, without kerning, at 12 pt × the relative size.
3. **Scale.** `cex_scale = fill × sqrt(n_cols × n_rows / Σ full width × cap height)`.
4. **Packing.** Messages in order, line by line, on an occupancy grid extended below its bottom edge. A line's block is its buffered height high; the first line takes the top-left-most free block wide enough for its first word, and takes as many words as fit the free run there. Each next line starts on the row below the previous line, within its span shifted by half the first word, and aligns left or right with it when the cells allow (right when both do and the previous line's centre is in the right half), otherwise as close as the free run allows. If no next line fits, the message's cells are forbidden and it starts again from its first word. Lines past the bottom grow the card. A line ending within 5% of the right edge moves flush right when the cells beside it are free.
5. **Colours.** Each message's label point is the mode of a kernel density of its cells (MASS's `kde2d`, 50 × 50 grid). In layout order, a message takes an unused colour if any is left, otherwise a colour drawn with probability softmax of its mean-normalised distance to the nearest message of that colour.
6. **Best of runs.** Steps 1 to 5 are repeated `runs` times with seeds `seed + 1, …`; the run with the smallest empty fraction is kept. Its colours, the last draws of a run, are drawn for it alone, which gives the same colours.
7. **Optional angles.** Each message receives a deterministic angle, reduced until its conservative glyph bounds clear other messages and the card edges.
8. **Optional expansion.** Three finite passes try small moves and uniform enlargement of each message around nine anchors. New placements keep a small clearance; the result is checked again for glyph-bound collisions and card overflow. Text, line breaks, fonts and angles stay fixed. This finishing step does not rerank the original grid layouts or change their diagnostics.

The R version's region-growing partition (`expand_blocks`, never called there) and its box fitter (`fit_text_box`, not used by the card) are not ported.

## Agreement with R

`tests/core.test.mjs` checks the result of four requests against the R version run on the same font files (`tests/fixtures/r-parity.json`, made by `node message-collage/tests/fixtures/make-r-parity.mjs` with a clone of the R version): a best of 3, an A6 card with a mixed-case palette, two fonts in a fixed order with equal sizes, and accented and curly-quoted punctuation on a small card. Every field is identical, and fontkit's measurements equal showtext's to the last bit.

Over 148 further requests (50 seeds of the example, and 98 with random card sizes, fonts, styles, size ranges, fills and gaps), every placement, scale, empty fraction and colour was identical. In 3 of them one or two label points differed by one density-grid step, where the density has exact ties that R breaks by the last bit of its C library's `exp` and `pow`. This port computes those correctly rounded, which glibc's are in all but about 0.1% of cases; none of the three changed a colour. Where R stops with `kde2d`'s "bandwidths must be strictly positive" in a run it does not keep, this port, which needs the label points of the kept run only, completes.
