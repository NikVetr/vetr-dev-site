# Polylines: project summary

## Purpose and repository layout

Polylines provides base-R graphics functions for variable-width polygonal lines and Sankey ribbons, plus a static browser editor for Sankey diagrams.

The R paths below are in the [polylines repository](https://github.com/NikVetr/polylines). The browser editor is `sankey/` in the vetr.dev site repository, served at https://vetr.dev/sankey/; its paths below are relative to `sankey/`.

| Path | Responsibility |
| --- | --- |
| `R/functions.R` | R utilities, `polylines()`, DNA drawing, Sankey input validation, layout, geometry, colors, and drawing. |
| `example_1.R`, `example_2.R`, `example_3.R` | Variable-width line and Sankey examples; the third script generates the Sankey demonstration figures. |
| `ggplot2_comparison.R`, `intermediate_workflow.R` | Supporting demonstration scripts. |
| `images/` | Figures used by the root README. |
| `tests/test_sankey.R` | R Sankey regression checks. |
| `sankey/` (vetr.dev site) | Browser application, documentation, and JavaScript/browser tests. |

The R code is sourced directly rather than installed as an R package. Base graphics and polygon geometry support vector output. Some operations require `sf`, `igraph`, or `png`; fixture generation uses `jsonlite`.

## R architecture

`sankey_ribbons()` accepts one flow matrix or successive stage matrices.
`sankey_ribbons_graph()` accepts an adjacency matrix over all location rows.
Location inputs describe node sets, indices, coordinates, and optional dimensions, labels, and fonts.

Layout validates dimensions, computes node faces, optionally adjusts node spacing and label fit, and stacks flows at each endpoint. Automatic, projected, Bezier-sampled, and explicit strand orders are supported. Thickness is expressed in visual horizontal-axis units, with `xyr` accounting for plot aspect ratio.

Bezier routing expands centerlines into constant perpendicular-width ribbons. Where cubic offsets would fold, tangent circular arcs and a straight segment preserve width and horizontal endpoint tangents. Boundary routing interpolates packed edges and optionally compensates their widths. Stored ribbon edges drive subsequent fills and borders.

`plot_sankey_ribbons()` renders ribbons, merge bands, node bodies, labels, and borders. Multi-stage objects dispatch to `plot_sankey_multi()`. Individual clipped ribbon bands preserve gaps near nodes. Colors may come from strands, nodes, merge trunks, and gradient midpoints. Gradient fills can be rasterized while retaining vector labels and borders.

## Browser architecture

The application uses ordinary HTML, CSS, and JavaScript script tags under a shared `window.SK` namespace. It has no runtime package dependencies, server component, or build step. Ordered scripts preserve direct opening from disk. SVG supplies vector export, gradients, and per-element interaction.

| Module | Responsibility |
| --- | --- |
| `layout.js` | R-compatible layout and ribbon geometry in isotropic plot pixels. |
| `shapes.js` | Clipping, merge bands, node bodies, bridges, and bounds. |
| `render.js`, `color.js` | Color resolution, text measurement/placement, and base SVG rendering. |
| `transform.js` | Wide, long, link-list, and crosstab conversion; filtering, grouping, ordering, and pathway aggregation. |
| `importer.js` | Import dialog, preview, role mapping, and conversion options. |
| `table-controls.js` | Retained source operations, sidebar row filters, and subset captions. |
| `column-strip.js` | Arrange strip positioning, column/value dragging, and hover beams. |
| `paths.js` | Pathway/member slices, trace geometry, hit testing, and annotation anchors. |
| `edit.js` | Layered-node merging and remapping related data. |
| `app.js` | Application state, layout orchestration, controls, interactions, trace overlays, inspector, history, persistence, and exports. |
| `submission.js`, `scripts/render.cjs` | JSON submission contract and headless CLI/Node export interface. |
| `csv.js`, `zip.js` | CSV parsing/formatting and store-only ZIP creation. |
| `examples.js`, `glyphs.js` | Bundled datasets and settings illustrations. |

### Data and rendering flow

1. Matrix/location CSVs or converted tables supply matrices, locations, names, and optional colors.
2. Wide/long imports retain the original table and conversion settings. A source query records enabled columns or stages, their order, row filters, per-stage filters, and value order.
3. Source queries rebuild matrices and weighted trajectories. Item identifiers, when supplied, remain attached to trajectories for individual tracing.
4. Raw counts remain unchanged; `valueScale` converts counts into geometric thickness. `valueScaleRef` defines the reference for the thickness multiplier.
5. The app measures available panel space, generates or adjusts locations, fits data limits, and invokes the geometry and color modules.
6. Base SVG rendering is followed by interaction overlays, share bars, trace labels, and inspector updates.

Generated table layouts balance column gaps and make room for constant-width turns. Automatic canvas widths can grow; fixed canvases accommodate required extra run by widening data limits. Automatic canvas heights start from each column's gap budget (what its nodes leave of the stacking span) and grow (`app.js` `labelRoom`, in `computeLayout`'s passes) until no node label reaches into the node above it in its column; a fixed canvas height is then a minimum. `sourceTable.minCanvasWidth`, `minCanvasHeight` and `spreadWidth` retain sizing information; fitting resets the first two. Presentation zoom and fit mode are separate from geometric data limits.

### State and interaction

Serializable state includes input matrices, locations, retained source data, styles, global/per-stage parameters, keyed edits, pathways, view limits, and presentation settings. Derived geometry, DOM state, and pointer interactions are managed separately in the controller.

The arrange strip shows columns above their nodes and supports hiding, reordering, filtering values, and ordering nodes; long value lists flow into numbered sub-columns, arrows at its ends scroll to columns out of view, and merges of an imported table's nodes are kept with the table (`sourceTable.merges`, recoded on every rebuild) and listed as one value, which can be split back. Sidebar filters operate on source rows; long-table stage filters operate on whole items. Rebuilds regenerate locations and clear manual node/strand edits, while retaining styling, global parameters and the thickness multiplier. Per-stage routing follows unchanged ordered adjacent column pairs; new or reversed pairs use global defaults.

Clicks and Shift-clicks emphasize nodes, strands, or pathway/item selections. Modifier hover identifies individual pathways or members. Dragging changes node positions or strand stacking. Collision handling constrains or pushes nodes. Traces reuse the base geometry and colors; gathering, overlap handling, count labels, percentages, and persistent substrand lines are configurable.

History keeps up to 100 serialized state snapshots. Browser autosave is debounced through localStorage. Project JSON preserves the serializable state and applies defaults/migration flags on load. CSV, table, project, and programmatic imports share candidate validation before replacing state. Validation covers data structure, layout, colors and base rendering; rejected candidates preserve working data and autosave. The import dialog invalidates its conversion immediately when text changes and reparses after a debounce.

Label rendering, fitted views, and annotation clearance share `render.labelGeometry()`, which combines placement, anchors and full font bounds. The separate compact text-height measure remains available for node sizing.

### Exports

SVG and PNG capture the visible drawing, including emphasized traces, with optional cropping. Other exports include location CSV, project JSON, and an R bundle ZIP with matrices, resolved colors, locations, optional manual stack order, and generated R drawing code. The R bundle uses the R renderer; browser interaction overlays are separate.

`SankeyApp.submit(request)` accepts JSON requests of type `table`, `matrices`, or `project` without GUI interaction and returns a detached project snapshot. Fresh data submissions start from application defaults. The browser API exposes SVG text, PNG Blobs, R bundle bytes and project snapshots. `scripts/render.cjs` submits through the same interface in an isolated headless Chromium process, accepts request files or stdin, and writes SVG, PNG, JSON or ZIP. It also exports `renderSubmission()` for Node callers. Python/R clients can invoke the CLI. The app has no HTTP submission service.

## Verification and running

From `sankey/`:

- `npm run serve`: Python HTTP server on localhost port 4183.
- `npm run test:unit`: Node tests for geometry, conversion, paths, edits, glyphs, and CSV handling.
- `npm run test:e2e`: Playwright Chromium interaction and SVG/pixel checks.
- `npm test`: both JavaScript suites.
- `npm run render -- examples/submission.json diagram.svg`: headless export using the bundled request example; requires Playwright Chromium.

From the polylines repository root:

- `Rscript tests/test_sankey.R`: R regressions.
- `Rscript webapp/tests/r_parity_fixtures.R`: regenerate 16 R reference cases, written to `webapp/tests/fixtures/r_parity.json` there; copy that file to `sankey/tests/fixtures/`.

Parity tests compare JavaScript offsets, centerlines, ribbon edges, adjusted locations, and merge lengths against checked-in R output. This supports maintaining independent R and browser implementations with consistent geometry. Browser tests additionally exercise UI behavior and exported drawings.

Browser dependencies and test reports are ignored within `sankey/`.
