# vetr.dev

The static site at https://vetr.dev, served by GitHub Pages with no build step. `index.html`, `style.css` and `assets/` are the landing page. Every tool or project lives in its own top-level folder with its own HTML, CSS, JavaScript and any tests, and the landing page links the public ones.

## The landing page

A compact introduction leads to one packed wall of tools, with irregular coloured boundaries for **Statistics**, **Art**, and **Everyday tools**. The boundaries follow the cards after placement; they do not reserve rectangular sections. Text labels and each card's accessible description identify its category as well as colour. Each tool has one tile, with a picture, a short description and its source date. To add a tool, copy a card in `index.html` with the tool's folder name in `data-mosaic-key` and `data-art`, choose its `data-category` and `data-size`, update the arrangements in `assets/landing-order.js`, and draw its picture on that shape's canvas.

### Tile sizes

A tile's shape is the `data-size` of its `<li>` in `index.html`: columns by rows, where a row is 0.68 of a column. The curated layout can adapt individual spans to fill each breakpoint, including a wider Photomosaic tile where needed. Each shape's picture well has the shape of the pictures drawn for it, so a picture changing shape is drawn again on the shape's canvas (`scripts/landing-art/svg.mjs`):

| Shape | Picture | Canvas |
| --- | --- | --- |
| `3x3` | landscape, 16:9 | 320 × 180 |
| `2x3` | about 6:5 | 264 × 220 (`WIDE`) |
| `2x2` | landscape, 16:9 or wider | 320 × 180 |
| `1x3` | portrait, 2:3 | 200 × 300 (`TALL`) |
| `1x2` | about 4:3, a 16:9 picture fits | 320 × 180 |

The size comes from a project's size in code: the hand-written lines of the tool itself (JavaScript, HTML and CSS, without vendored code, tests or data) plus the lines of the R code it reproduces, for the ports that match an R original. That is 10,000 lines or more for the largest tiles (3x3), 2,500 or more for the middle (2x3 or 2x2), less for the smallest (1x3 or 1x2). Within a size, the shape follows the picture. Where code size under-represents how much there is to see, the size is moved up, and the reason is in the last column.

| Tool | Web lines | R lines reproduced | Total | Shape | Adjusted |
| --- | ---: | ---: | ---: | --- | --- |
| Pocket Language Guide | 39,474 | | 39,474 | 3x3 | |
| Color Palette Extender | 20,611 | | 20,611 | 3x3 | |
| Sankey Diagrams | 8,786 | 11,499 (polylines) | 20,285 | 3x3 | |
| Statistical Intuitions (15 entries) | 20,297 | | 20,297 | 3x3 | 13 teaching entries, Hypercube and Forecast Calibration; six computed views in the preview |
| autoCHAIR | 13,944 | | 13,944 | 2x2 | down: one agenda and timeline, much of its code is styling |
| Multipanel Layout GUI | 6,943 | | 6,943 | 2x2 | |
| Name Tags | 3,403 | 2,427 (keychain-lasercutter) | 5,830 | 2x2 | |
| Table Seating | 2,995 | 1,397 (table-seating) | 4,392 | 1x3 | down to a tall one-column tile: its room is portrait |
| Raster to Vector | 2,294 | 1,440 (raster-to-vector) | 3,734 | 2x2 | |
| Hypercube Rotation | 1,700 | 1,927 (shape_rotation) | 3,627 | | no tile of its own: an entry in the Statistical Intuitions gallery, whose tile turns it on hover (as a `1x2` tile, give it back its card) |
| Signature Correction | 2,952 | 491 | 3,443 | 2x2 | |
| Crossword Generator | 2,308 | 982 (crossword) | 3,290 | 2x3 | up: a whole grid of answers to read |
| Message Collage | 2,151 | 1,037 (message-collage) | 3,188 | 2x3 | wider to show the rotated messages |
| Text in Image | 1,790 | 973 (text-in-image) | 2,763 | 2x3 | up: the text in the picture needs room to be read |
| Photomosaic | 1,785 | 110 | 1,895 | 2x2 | up: the individual photos need room to be seen |
| Helix and Braid | 1,373 | 441 | 1,814 | 1x3 | upright, as the tool draws a helix |
| Forecast Calibration | 1,474 | 39 | 1,513 | | listed inside Statistical Intuitions; its existing URL and API remain available |

Counted on 2026-11-05 as non-blank lines, R comment lines left out. The R lines are those of the R repository named in brackets, or for the others the R script in minor_scripts that the tool was ported from (interpolate_signature_frequency_series.R, imgdir2grid.R, draw_DNA.R with braided_lines.R, playingPreds.R).

The column count steps with the width, from one on a phone to ten on an ultrawide screen (`style.css`), with seven at 1366–1440 px; at two or four columns a 3x3 tile becomes 2x2. The compact masthead and smaller grid units make several complete cards visible at normal browser zoom. Curated sizes and orders for each column count keep all three categories connected across desktop widths, and the shared dense packer fills a rectangle with a flush lower edge. There is no runtime search. One column follows the thematic HTML order; narrow and landscape layouts can split a category, with a label on each connected component.

Section interiors use a subtle light or dark tint of their outline colour. Preview composition follows the available space: Photomosaic uses its full 4:3 image, with the description beside it in compact cards; the Figure Editor has a wider 3x2 tile at seven columns and puts its description beside the landscape preview. Taller cards keep the image above their text, and the portrait Helix/Seating previews sit beside their descriptions on phones.

`shared/mosaic.js` places cards in the curated order, pins their grid cells and puts the list in visual reading order whenever its column count changes: Tab and screen readers meet the cards as they appear. `assets/landing-clusters.js` then draws boundaries from the placed cells and positions their labels in the gutters. Boundaries redraw when actual track sizes change, including text reflow. Without JavaScript, CSS packs the thematic HTML order and links remain usable; decorative outlines are absent. On a phone, and on a phone held sideways, rows follow their content: each picture keeps its own shape, and one-column tiles sit beside their text. Descriptions wrap in full; cards never truncate them to meet a height target. See [site architecture](docs/architecture.md) for the layout flow.

The pictures are drawn from the tools themselves, from their default or explicitly selected examples: `scripts/landing-art/cards/<name>.mjs` runs the tool's core (or, for the tools without one, its page in headless Chromium through `scripts/landing-art/browser.mjs`) and writes `assets/cards/<name>.svg`.

Palette Town's preview follows 31 recorded states from a real optimizer run, with fixed input colors and moving candidates. Table Seating moves all 39 guests together between actual assignments; its offline route builder checks clearance continuously, including between keyframes. Regressions live in `scripts/landing-art/tests/`.

The image previews use examples available in their applications: Raster to Vector's fishcake swirl advances through raster, simplified colours, extracted outlines and smooth curves; Text in Image uses heavier whole-word Alice text on white; and Photomosaic uses its 1,200-cell Sunflower preset (three uses per photo and 45% display tint). The swirl example explicitly selects three colours and mb4 wavelet smoothing at multiplier 8; the core defaults stay unchanged. The original photo-matching example stays available. Message Collage exposes a rotation limit and uses denser, gently angled messages; its SVG, PNG and PDF exports share the same geometry. Optional Local warp moves neighbouring regions together with bounded letter deformation. Its strength defaults to zero in the app; the landing preview explicitly uses one (see the [Collage API](message-collage/api.md)). Crossword opens a saved 94-entry heart computed by its existing optimizer, so the page starts immediately; regenerate it with `node crossword/examples/build.mjs`. Load/Clear actions offer Undo.

The directory also lists **b64 — Base64 Link Decoder** (`2x2`) under Everyday tools and **Nonprofit Salary Benchmark** (`2x2`) under Everyday tools. b64's picture shows one real decoding layer at a time in large type. The benchmark picture is the generic app's actual initial histogram; its compact tile is an editorial size choice.

```sh
node scripts/landing-art/build.mjs            # every picture
node scripts/landing-art/build.mjs helix      # one
```

Workflow previews show input and output stages: Signature draws the raw input, scans to the core’s smoothed centreline, then applies its ink widths; Name Tags illustrates rearrangement into actual fitted layouts before a laser pass; Palette Town shows color-space and constraint setup, its verified best-of-12 optimization trace, then CVD comparisons. autoCHAIR reuses the app’s animated logo before its agenda tracker.

The Alice preview enables Text in Image’s optional low-contrast outline; the app leaves it off by default. The fishcake example tints its outer rim light pink before JPEG compression, so every vectorization stage uses the same input. Photomosaic crops around its subject to fill narrow preview wells without stretching the tiles.

The cards that drive a page (agendamatic, layout-gui, sankey) need Playwright: set `PLAYWRIGHT` to an installed `playwright` package, or `npm ci` in any tool folder. `scripts/landing-art/svg.mjs` holds what the pictures share: the 320 × 180 canvas, the theme colours (`--art-*` in `style.css`), scoping each picture's style sheet to its card, and the flip-book.

`assets/landing.js` inlines each picture when its card nears the viewport, so it paints in the page's theme. Hovering a card with a mouse or pen, or focusing it from the keyboard, plays its loop. Leaving pauses at the current frame; returning resumes from that point. CSS clocks and canvas players both retain their position. On narrow screens and devices with a coarse touch pointer, the panel nearest the viewport centre plays automatically. A compact sticky `vetr.dev` bar has an animation switch; its choice persists in the browser, and the switch remains available in the desktop header. Background tabs pause playback. `prefers-reduced-motion` always shows the authored still and disables the switch. These loops are the page's only motion.

Turning reduced motion on also cancels an already-running loop or a pending player download. Run `node --test scripts/tests/landing-playback.mjs` for pause/resume, frozen-frame, keyboard and touch checks (`BROWSER_ENGINE=webkit` selects WebKit through the `PLAYWRIGHT` installation). Run `node scripts/tests/landing-browser.mjs` to check reduced motion, packing and reading order, category-boundary coverage and label clearance, first-viewport density, text fit, accessible category descriptions, focus through resizing, and the b64/benchmark cards using the existing Playwright installation. Run `node --test shared/tests/mosaic.test.mjs` for rectangular packing and content-flow rows. Run `node --test scripts/tests/cluster-contours.mjs` for the grid-union geometry, including holes, concave boundaries and corner contacts.

## Finding your way around

Tool entry pages pair their names with their function: **Palette Town — Color Palette Extender**, **Wanderwart — Pocket Language Guide**, **autoCHAIR — Meeting Agenda Timer**, and **Multipanel Figure Editor**. Collection links sit inside each tool's existing header: vetr.dev, Source, Feedback, and Help where the tool needs it. Native help buttons and teaching-page breadcrumbs keep their original roles. `shared/tool-nav.css` styles the links and help panels; `shared/tool-nav.js` opens existing explanations. Tools retain their own header controls and visual design. Sankey keeps its own navigation and visual design. Its toolbar text-size slider scales the labels, nodes, ribbons and spacing together, including exports; larger sizes expand the canvas. Run `node --test shared/tests/tool-nav.browser.mjs` to verify cross-page help and dialog focus return. Wanderwart’s shell/mobile builders synchronize local copies from these shared files so its standalone server, offline cache and native bundle keep working.

The figure editor's canvas is keyboard-focusable. Tab and Shift+Tab enter and leave it normally; Page Down / Page Up select panels, arrows move the selection, and H opens help. Editing shortcuts act only when the canvas has focus. Run `node --test layout-gui/tests/keyboard.mjs` for the focused browser regressions.

The newer applications support **Cmd/Ctrl+Z** to undo and **Cmd/Ctrl+Shift+Z** to redo, with buttons beside their existing controls. Edits after an undo discard the redo branch. Text and numeric fields keep their native editing history while focused; move focus out of the field to undo application changes. Signature routes shortcuts to the active drawing pad, including its morph dialog. b64 and the benchmark retain their existing histories.

The salary benchmark opens with a generic, explicitly illustrative organization profile. `ceo-salary-benchmark/?profile=RP` selects its existing RP presentation and reference values; shared links preserve their profile. This is a presentation preset, not access control: the static source and data remain public. The comparison cohort and fitted models are unchanged; see the benchmark's `summary.md` for scope and URL details.

## Shared code and look

`shared/` holds what the newer tools (forecast-calibration, text-in-image, crossword, raster-to-vector, seating, name-tags, photomosaic, hypercube, signature, message-collage, helix and the intuitions gallery) have in common, so their copies cannot drift apart:

The shared frame uses compact headings, lightly rounded bordered panels and small desktop controls. Touch controls retain their larger targets. Tools can choose a layout suited to their work: Name Tags has a narrow settings column beside an individual-tag inspection grid, with a full-sheet view for exact tray placement. Its downloads always use the original physical sheet dimensions and positions.

- **`shared/base.css`**, linked before each tool's own `style.css`: the colour tokens for both themes, the page frame, the layout (markup in reading order, input then results then settings, so a phone shows the result second, with a `.results-link` down to it from the first card; from 1000 px the results take the right column), cards, buttons and the `.file-button` file picker, inputs and the `[aria-invalid]` field style, a floor for phones and touch screens (controls and labelled checkboxes at least 44 px high, field text at least 16 px, the intuitions gallery's included), the `.issues` problem list, the `.stale-banner` and `.stale-dim` for a result that no longer matches its inputs (a tool that keeps its last valid result on view dims it and says why), replacement notes, and the dialog with its sticky `.dialog-head`. A tool's `style.css` keeps only what is particular to it. The intuitions gallery takes the tokens and the touch floor, and keeps its own type, layout and controls.
- **`shared/history.js`**: bounded application histories, form-gesture checkpoints, and shortcuts that preserve native text editing. Each app captures its own editable state and immutable asset/result references, cancels superseded work on restore, and redraws the saved result. Animation frames, worker progress and theme changes do not add checkpoints. Teaching pages restore their validated, seeded requests, display settings, cameras and explicit timeline scrubs; invalid drafts retain native field undo. Run `node --test shared/tests/history.test.mjs shared/tests/history.browser.mjs` for history invariants and cross-app keyboard checks; individual tools also test uploads, result restoration and pending work. `BROWSER_ENGINE=webkit` selects WebKit when available through `PLAYWRIGHT`.
- **`shared/theme.js`**, a plain script in each page's `<head>`: one light or dark choice for the whole site, stored in this browser as `vetr:theme`, or else the system setting. It drives each tool's `#theme-toggle` and fires a `themechange` event for pages that draw in theme colours. The landing page loads it too, so it follows the same choice. On the first revisit to Crossword, Raster to Vector or Forecast Calibration, a valid older per-tool preference becomes the shared choice if none is saved; an existing shared choice takes precedence. Invalid values follow the system theme. Run `node --test shared/tests/theme.browser.mjs` for migration, cross-page precedence and unavailable-storage checks.
- **`shared/mosaic.js`**: the landing page and Intuitions gallery share deterministic dense placement, full-width content rows and DOM ordering that preserves keyboard focus. Their own layout files choose the cards and spans.
- **`shared/rng.js`**: the seeded generators of the cores, two different algorithms with different streams, so a tool keeps the one it was built on. `mulberry32(seed)` gives uniforms in [0, 1) (forecast-calibration, text-in-image, crossword, intuitions). `rMersenneTwister(seed)` is R's default generator, seeded as `set.seed()` seeds it, with R's uniform, normal and `sample()` draws, so a port of R code draws R's numbers (raster-to-vector, seating, name-tags, message-collage).
- **`shared/wavelet.js`**: the MODWT and its inverse (haar, d4, mb4, d6 and la8 filters; circular, or reflected for open curves), soft thresholding and the level-1 noise estimate, matching R's waveslim to 1e-12 (`shared/tests/`, run with `node --test` in `shared/`). **`shared/fft.js`** is R's `fft()` for any length, and **`shared/rstats.js`** R's `sum()`, `mean()` and `cumsum()`, accumulated as closely to R's long double as doubles allow, and its `seq()` (raster-to-vector, seating, signature, message-collage, name-tags and helix).
- **`shared/decode-png.mjs`**: a PNG decoder for the command lines, which have no canvas (Node only).
- **`shared/vendor/clipper.js`**: Clipper, the polygon unions and differences of name-tags, signature and helix. **`shared/polygon.js`** wraps it for flat rings (`[x0, y0, ..., x0, y0]`): union and difference under a fill rule, round offsets, areas and bounds (name-tags, signature and helix).
- **`shared/helix.js`**: the DNA double helix of R's `draw_DNA` as geometry, the strands' visible pieces and the base pairs as variable-width lines, and `ribbon()`, R's `polylines()` outline of such a line. name-tags draws its tags' helices with it, and `helix/` (the helix and braid generator) its helices.
- **`shared/vendor/fontkit.esm.js`**: fontkit, which text-in-image, name-tags and message-collage read glyph outlines and advance widths with. It is a copy of the Pocket Language Guide's bundle; `VERSIONS.md` and `LICENSES.md` beside it say where it comes from.

One tool reads another's files: message-collage loads the upright Inter and Source Serif Pro faces from `name-tags/fonts/` rather than keeping copies, so moving or renaming them breaks it (`message-collage/core/catalogue.js` lists the paths). The intuitions gallery's hypercube entry shows the landing page's `assets/cards/hypercube.svg`.

The tools import these by relative path (`../../shared/rng.js`), which works over HTTP from the site root and in Node from a clone. `shared/package.json` marks the folder as ES modules for Node.

`sankey/` keeps its own denser visual language and stylesheet, and its tests serve its folder alone, so it does not link `shared/`.

To run it locally, serve the repository root and open http://localhost:8000/:

```sh
python3 -m http.server 8000
```

## Programmatic access

Tools that scripts and agents can use follow one shape. `forecast-calibration/` is the reference implementation.

- **`core/`** holds ES modules with no DOM access, importable from Node 22 and from the browser. Anything random uses a seeded generator from `shared/rng.js`, so results are reproducible.
- **`submit(request) → result`** is the single entry point. It takes JSON and returns JSON. It validates the request and rejects unknown fields. Problems throw one typed error with a `code`, a `message` and a list of `issues`, each `{code, path, message}`; input is never silently coerced. The tool's page calls the same function.
- **`window.<ToolName>`** in the page exposes `submit` and the page's exporters (for example SVG text or a PNG blob). Where the page computes in a worker, as `text-in-image/` does, its `submit` returns a Promise.
- **`cli.mjs`** runs as `node <tool>/cli.mjs request.json`, or reads the request from stdin. It prints the result JSON on stdout. Errors go to stderr as JSON, with exit status 1 for an invalid request and 2 for a usage problem. It needs Node only, with no npm install.
- **`api.md`** gives the request and result schema, the errors and one worked example.
- **`/llms.txt`** lists every tool that has an API and links its `api.md`. Add an entry there when a new tool gains one.

`intuitions/` is a gallery that puts several small entries behind one entry point: the request names the entry, `submit({entry, params}) → {entry, params, result}`, each entry's DOM-free core is `intuitions/<entry>/compute.js`, and the gallery's library is `intuitions/lib/`: normal and bivariate-normal functions, `special.js` (gamma and beta functions and the distributions built on them), SVG plotting, `linalg.js` (vectors, cross products, symmetric eigendecomposition and the Cholesky factor), `geom3d.js` (a camera, SVG rendering of 3-D scenes, and turning them by drag or keyboard), `tree.js` (phylogenies: seeded Yule trees, Newick, rectangular and fan layouts, the tips' Brownian-motion covariance, independent contrasts and re-rooting) and `worker.js` (a Web Worker that runs `submit()` off a page's thread, for its Monte Carlo).

`hypercube/` replays trajectories solved in R rather than computing them: its plans are data files, `hypercube/plans/k<k>.json`, written by `scripts/export_web_plan.R` in [NikVetr/shape_rotation](https://github.com/NikVetr/shape_rotation), and its core's `submit(request, plan)` takes the decoded plan as a second argument (the page and the CLI load it). It draws its 3-D view with `intuitions/lib/geom3d.js`.

`photomosaic/` takes summaries rather than whole photos: its request carries the target's RGBA pixels and each photo's average colour, which the page and the command line compute from the images (`core/image.js` ports ImageMagick 6's scaling, so the averages are R's). Its command line therefore also takes images, `node photomosaic/cli.mjs --target target.png --photos folder/`, and reads JPEG with jpeg-js's decoder in `photomosaic/vendor/`.

`sankey/` predates this shape. Its `window.SankeyApp.submit` needs the page's DOM, so its command line, `sankey/scripts/render.cjs`, drives headless Chromium through Playwright, and its errors carry only a message. `sankey/api.md` describes it.

Core tests run with `node --test` in the tool's folder. Browser smoke tests use Playwright where a tool has them, through `npm ci` or a `node_modules` link to an existing install.

Teaching figures redraw after resize-observer delivery, coalescing layout changes into the next animation frame. Run `node --test intuitions/tests/resize.browser.mjs` to check that plots fit their containers, settle without continuing redraws, and preserve keyboard navigation. Chromium is the default; for WebKit, select an installed Playwright package that matches the available browser build:

```sh
PLAYWRIGHT="$PWD/ceo-salary-benchmark/node_modules/playwright" BROWSER_ENGINE=webkit node --test intuitions/tests/resize.browser.mjs
```

The shared browser helper also accepts Firefox. These engine checks supplement hands-on Safari/iOS and other device checks.

Name Tags starts with **Balanced lines**, using the existing optimizer with stronger preferences for similar name widths and more horizontal overlap. **Original proportions** restores the historical layout; core/CLI omission retains the original defaults. The named preset is available to scripts through `name-tags/presets.js`.
