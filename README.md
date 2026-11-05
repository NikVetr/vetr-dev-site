# vetr.dev

The static site at https://vetr.dev, served by GitHub Pages with no build step. `index.html`, `style.css` and `assets/` are the landing page. Every tool or project lives in its own top-level folder with its own HTML, CSS, JavaScript and any tests, and the landing page links the public ones.

## The landing page

A wall of tiles, one per tool, each sized by how big the project is. Each tile is one link, named by its title, with a picture, the description and the date. To add a tool, copy a card in `index.html` with the tool's folder name in its ids and `data-art`, give its `<li>` a `data-size`, and draw its picture.

### Tile sizes

A tile's size is the `data-size` of its `<li>` in `index.html`: 3 large, 2 wide, 1 small. Change that one number to resize a tile. The sizes come from a project's size in code: the hand-written lines of the tool itself (JavaScript, HTML and CSS, without vendored code, tests or data) plus the lines of the R code it reproduces, for the ports that match an R original. That is 10,000 lines or more for large, 2,500 or more for wide. The gallery's thirteen entries show up in its code size.

| Tool | Web lines | R lines reproduced | Total | Size |
| --- | ---: | ---: | ---: | ---: |
| Pocket Language Guide | 39,474 | | 39,474 | 3 |
| Color Palette Extender | 20,611 | | 20,611 | 3 |
| Sankey Diagrams | 8,786 | 11,499 (polylines) | 20,285 | 3 |
| Statistical Intuitions (13 entries) | 17,702 | | 17,702 | 3 |
| autoCHAIR | 13,944 | | 13,944 | 3 |
| Multipanel Layout GUI | 6,943 | | 6,943 | 2 |
| Name Tags | 3,403 | 2,427 (keychain-lasercutter) | 5,830 | 2 |
| Table Seating | 2,995 | 1,397 (table-seating) | 4,392 | 2 |
| Raster to Vector | 2,294 | 1,440 (raster-to-vector) | 3,734 | 2 |
| Hypercube Rotation | 1,700 | 1,927 (shape_rotation) | 3,627 | 2 |
| Signature Correction | 2,952 | 491 | 3,443 | 2 |
| Crossword Generator | 2,308 | 982 (crossword) | 3,290 | 2 |
| Message Collage | 2,151 | 1,037 (message-collage) | 3,188 | 2 |
| Text in Image | 1,790 | 973 (text-in-image) | 2,763 | 2 |
| Photomosaic | 1,785 | 110 | 1,895 | 1 |
| Helix and Braid | 1,373 | 441 | 1,814 | 1 |
| Forecast Calibration | 1,474 | 39 | 1,513 | 1 |

Counted on 2026-11-05 as non-blank lines, R comment lines left out. The R lines are those of the R repository named in brackets, or for the others the R script in minor_scripts that the tool was ported from (interpolate_signature_frequency_series.R, imgdir2grid.R, draw_DNA.R with braided_lines.R, playingPreds.R).

The column count steps with the width, from one on a phone to seven on an ultrawide screen (`style.css`). Large tiles take two columns and two rows; a whole row when there are three columns; and two columns of one row at five or seven, where the rows of one-column tiles are tall. Wide tiles take two columns, but one at an odd count, which has no room for them. The cards are newest first, moved just enough that at every column count the tiles close up with no gaps in their order, so Tab order is the order you see. `grid-auto-flow: dense` fills any gap a changed size opens by moving a later small tile up.

The pictures are drawn from the tools themselves, from their default examples: `scripts/landing-art/cards/<name>.mjs` runs the tool's core (or, for the tools without one, its page in headless Chromium through `scripts/landing-art/browser.mjs`) and writes `assets/cards/<name>.svg`.

```sh
node scripts/landing-art/build.mjs            # every picture
node scripts/landing-art/build.mjs helix      # one
```

The cards that drive a page (agendamatic, layout-gui, sankey) need Playwright: set `PLAYWRIGHT` to an installed `playwright` package, or `npm ci` in any tool folder. `scripts/landing-art/svg.mjs` holds what the pictures share: the 320 × 180 canvas, the theme colours (`--art-*` in `style.css`), scoping each picture's style sheet to its card, and the flip-book.

`assets/landing.js` inlines each picture when its card nears the viewport, so it paints in the page's theme. Hovering a card with a mouse or pen, or focusing it from the keyboard, plays the picture's loop, which is seamless (its last frame leads back into its first, which is the still); leaving stops it. Touch never plays it, and nothing moves under `prefers-reduced-motion`. These loops are the page's only motion.

## Shared code and look

`shared/` holds what the newer tools (forecast-calibration, text-in-image, crossword, raster-to-vector, seating, name-tags, photomosaic, hypercube, signature, message-collage, helix and the intuitions gallery) have in common, so their copies cannot drift apart:

- **`shared/base.css`**, linked before each tool's own `style.css`: the colour tokens for both themes, the page frame, the layout (markup in reading order, input then results then settings, so a phone shows the result second, with a `.results-link` down to it from the first card; from 1000 px the results take the right column), cards, buttons and the `.file-button` file picker, inputs and the `[aria-invalid]` field style, a floor for phones and touch screens (controls and labelled checkboxes at least 44 px high, field text at least 16 px, the intuitions gallery's included), the `.issues` problem list, the `.stale-banner` and `.stale-dim` for a result that no longer matches its inputs (a tool that keeps its last valid result on view dims it and says why), the `.undo-note` that offers back what Load example or Clear replaced, and the dialog with its sticky `.dialog-head`. A tool's `style.css` keeps only what is particular to it. The intuitions gallery takes the tokens and the touch floor, and keeps its own type, layout and controls.
- **`shared/theme.js`**, a plain script in each page's `<head>`: one light or dark choice for the whole site, stored in this browser as `vetr:theme`, or else the system setting. It drives each tool's `#theme-toggle` and fires a `themechange` event for pages that draw in theme colours. The landing page loads it too, so it follows the same choice.
- **`shared/rng.js`**: the seeded generators of the cores, two different algorithms with different streams, so a tool keeps the one it was built on. `mulberry32(seed)` gives uniforms in [0, 1) (forecast-calibration, text-in-image, crossword, intuitions). `rMersenneTwister(seed)` is R's default generator, seeded as `set.seed()` seeds it, with R's uniform, normal and `sample()` draws, so a port of R code draws R's numbers (raster-to-vector, seating, name-tags, message-collage).
- **`shared/wavelet.js`**: the MODWT and its inverse (haar, d4, mb4, d6 and la8 filters; circular, or reflected for open curves), soft thresholding and the level-1 noise estimate, matching R's waveslim to 1e-12 (`shared/tests/`, run with `node --test` in `shared/`). **`shared/fft.js`** is R's `fft()` for any length, and **`shared/rstats.js`** R's `sum()`, `mean()` and `cumsum()`, accumulated as closely to R's long double as doubles allow, and its `seq()` (raster-to-vector, seating, signature, message-collage, name-tags and helix).
- **`shared/decode-png.mjs`**: a PNG decoder for the command lines, which have no canvas (Node only).
- **`shared/vendor/clipper.js`**: Clipper, the polygon unions and differences of name-tags, signature and helix. **`shared/polygon.js`** wraps it for flat rings (`[x0, y0, ..., x0, y0]`): union and difference under a fill rule, round offsets, areas and bounds (name-tags, signature and helix).
- **`shared/helix.js`**: the DNA double helix of R's `draw_DNA` as geometry, the strands' visible pieces and the base pairs as variable-width lines, and `ribbon()`, R's `polylines()` outline of such a line. name-tags draws its tags' helices with it, and `helix/` (the helix and braid generator) its helices.
- **`shared/vendor/fontkit.esm.js`**: fontkit, which text-in-image, name-tags and message-collage read glyph outlines and advance widths with. It is a copy of the Pocket Language Guide's bundle; `VERSIONS.md` and `LICENSES.md` beside it say where it comes from.

One tool reads another's files: message-collage loads the upright Inter and Source Serif Pro faces from `name-tags/fonts/` rather than keeping copies, so moving or renaming them breaks it (`message-collage/core/catalogue.js` lists the paths).

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
