# Sankey API

The Sankey editor at https://vetr.dev/sankey/ can be driven with JSON. It has a single entry point, `SankeyApp.submit(request)`, which validates a request, loads and draws it without opening a dialog, and returns the resulting project as plain JSON. The command line and the Node function below call this same function.

**This tool differs from the site's other tools with an API.** `submit` runs inside the web page, because laying out a diagram measures label text and draws SVG. There is no DOM-free core and no plain-Node `cli.mjs`. The command-line script, `scripts/render.cjs`, opens the page from disk in headless Chromium through Playwright and calls `SankeyApp.submit` there. It needs `npm ci` and a Chromium download, and it reports errors as plain text, not JSON.

## Ways in

**Command line.** Install once, from `sankey/`:

```sh
npm ci
npx playwright install chromium
```

Then, from the site root:

```sh
node sankey/scripts/render.cjs request.json diagram.svg       # or .png, .json, .zip
node sankey/scripts/render.cjs - diagram.svg < request.json   # "-" reads the request from stdin
```

From `sankey/`, `npm run render -- request.json diagram.svg` does the same.

The output file's extension chooses the format:

- `.svg`: the plot.
- `.png`: the plot at 2× resolution.
- `.json`: the project, as `getProject()` returns it.
- `.zip`: the R bundle.

On success the script writes `Wrote <output>` to stderr and exits with 0. Each run starts a fresh browser with a 1440 × 900 viewport. Setting `style.canvasWidth` and `style.canvasHeight` makes the output size independent of the viewport. The page is opened from disk, so no server is needed.

**Node.** `require('./sankey/scripts/render.cjs').renderSubmission(request, format)` returns a Promise of a `Buffer`. `format` is `svg`, `png`, `json` or `zip`.

**Python and R** call the command line. From Python, with the site root as the working directory:

```python
import json, subprocess

request = {"type": "table", "text": "A,B\nx,y\nx,z\n", "spec": {"format": "wide", "columns": ["A", "B"]}}
subprocess.run(["node", "sankey/scripts/render.cjs", "-", "diagram.svg"],
               input=json.dumps(request), text=True, check=True)
```

From R, write the request with `jsonlite::write_json(request, "request.json", auto_unbox = TRUE)` and run `system2("node", c("sankey/scripts/render.cjs", "request.json", "diagram.svg"))`.

**In the page**, `window.SankeyApp` has these members:

| Member | Does |
| --- | --- |
| `submit(request)` | Validates the request, replaces the working project with it and draws it. Returns a detached copy of the new project. An invalid request throws before anything is replaced, and the rejected data does not enter undo history or autosave. |
| `getProject()` | Returns a detached copy of the current project. |
| `setTextSize(pixels)` | Scales the current diagram's labels, nodes, ribbons and spacing together, preserves raw flows and node coordinates, resets presentation to native size, and records an undo step. Returns a detached project. Requires a finite positive number. |
| `exportSvgText()` | Returns the plot as shown, as SVG text. |
| `exportPngBlob()` | Returns a Promise of the plot as a PNG `Blob` at 2× resolution. |
| `exportBundle()` | Returns the R bundle as zip bytes (a `Uint8Array`). It holds the flow matrices, the resolved color matrices, `loc.csv`, a `sankey.R` script and `project.json`. |

There is no HTTP endpoint.

## Request

Every request is a JSON object whose `type` is `table`, `matrices` or `project`. The following are rejected:

- Unknown fields.
- Unknown names inside `style` and `params`.
- Values that are not JSON data, and numbers that are not finite.

A fresh `table` or `matrices` request starts from the application defaults, whatever was drawn before.

### `table`: build flows from a data table

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `text` | string | (required) | CSV or TSV text with a header row. |
| `spec` | object | inferred, as in the import dialog | How the table's columns become the diagram. See below. |
| `options` | object | none | `order`: `appearance`, `size` or `alphabetical` node order. `minShare`: a fraction of its stage (0.05 = 5%) below which a node is grouped into "Other". `topN`: keep this many nodes per stage and group the rest. |
| `labels` | string | `above` | Node labels `above` (nodes as wide as their labels), `inside`, `beside` or `none`. |
| `name` | string | `submitted table` | The table's name in the project. |
| `thickness` | number > 0 | `1` | Multiplier on strand thickness. |
| `style`, `params`, `stageParams` | | | See [Settings](#settings). |

`spec` uses the same converter as the import dialog. Supplying it keeps automated workflows explicit. It takes one of four formats:

- **Wide**: `{format: 'wide', columns: ['A', 'B', 'C'], id: 'id', weight: 'n', missing: 'drop'}`. Flows count transitions between consecutive `columns`. `id` and `weight` are optional. `missing` is `drop` or `keep`.
- **Long**: `{format: 'long', id: 'id', stage: 'wave', category: 'answer', weight: 'n', missing: 'keep', stageOrder: 'auto'}`. `weight` is optional. `stages` can select and order the stage values explicitly.
- **Links**: `{format: 'links', source: 'from', target: 'to', value: 'n', stage: 'step'}`. `value` and `stage` are optional.
- **Crosstab**: `{format: 'crosstab'}`.

Wide and long tables also keep each item's trajectory as weighted pathways, with item ids when `id` is given.

### `matrices`: give the flows directly

| Field | Meaning |
| --- | --- |
| `matrices` | (required) An array of numeric matrices, one per stage, even when there is only one. Rows are source nodes and columns are target nodes; adjacent stages must share dimensions. |
| `mode` | `layered` (default) or `graph`. Graph mode needs one square adjacency matrix over all `loc` rows. |
| `loc` | Node records (`set`, `node`, `x`, `y` and optional `width`, `label`, `cex`, `font`, `height`, `color`, `merge_col`). Generated when omitted. |
| `valueScale` | Converts values to strand thickness. Without it, matrix values are thicknesses in x data units. |
| `dimnames`, `stageNames`, `setNames` | Node names per stage (`{rows, cols}`), stage names and node-column names. |
| `colorMatrices`, `midMatrices` | Strand and mid-point color matrices shaped like `matrices`, with hex, CSS names, R `grayNN` or `NA`. |
| `nodeColors`, `mergeColors` | Node and merge-trunk colors, as objects keyed by `"set:node"`. |
| `paths`, `pathUnit` | Weighted pathways through the nodes, and what one unit counts (for example `patients`). |
| `style`, `params`, `stageParams`, `view` | See [Settings](#settings); `view` is `{xlim, ylim}` in data units. |

### `project`: reload a saved project

`{type: 'project', project}`, where `project` is a version-1 project object: the result of `submit` or `getProject()`, or a project file exported from the page. Its settings are taken from the project, with the same defaults and migration as opening the file in the page.

### Settings

- `style` uses the application's names, such as `palette`, `fontSize`, `labelCounts`, `canvasWidth` and `canvasHeight`. Explicit style values override the defaults that come with a `labels` choice.
- `params` uses the layout names in `js/layout.js`'s `DEFAULT_PARAMS`, such as `curvature`, `route` and `merge_frac`. These follow the arguments of `sankey_ribbons()` in the [polylines R code](https://github.com/NikVetr/polylines).
- `stageParams` is an array of per-stage overrides for routing and ordering.

`style.fontSize` sets the font size of a fresh submission independently of its canvas. To resize an existing diagram coherently, call `setTextSize(pixels)` in the page. Its returned project contains explicit canvas dimensions and can be passed to a `project` request in the browser, CLI or Node interface.

## Result

`submit` returns the project: the object that `getProject()` returns and that `.json` output and project files contain. Its main fields are:

| Field | Meaning |
| --- | --- |
| `app`, `version` | `"polylines-sankey"` and `1`. |
| `mode` | `layered` or `graph`. |
| `matrices`, `dimnames`, `stageNames`, `setNames` | The flows and their names. Table imports keep raw counts here. |
| `valueScale`, `valueScaleRef` | Thickness per unit of value, and the scale the data came with (the `thickness` multiplier is their ratio). |
| `loc`, `view` | Node positions and the plotted data limits. |
| `paths`, `pathUnit` | Weighted pathways, with member ids where the table had them. |
| `style`, `params`, `stageParams`, `presentation` | Every setting, with defaults filled in. |
| `sourceTable` | For table requests, the original table and the conversion settings, so the page can rebuild from it. |

The rest (`colorMatrices`, `midMatrices`, `nodeColors`, `mergeColors`, `flowOverrides`, `midOverrides`, `nodeSlots`, `manualOrder` and the migration flags) records colors and manual edits.

## Errors

An invalid request throws a `SankeyError`, an `Error` whose `name` is `"SankeyError"`. It carries only a `message`. There is no error code or list of issues, and validation stops at the first problem. Examples:

- `A submission needs type "table", "matrices" or "project".`
- `Unknown table submission field "colour".`
- `Unknown style setting "fontsize".`
- `Submission values must be finite JSON data.`
- `labels must be above, inside, beside or none.`
- `thickness must be a positive number.`
- `Stage 1 matrix row 2 has 1 values; expected 2.`

Problems found while converting a table, laying out the diagram or reading a project throw `SankeyError` with their own messages.

The command line prints the message as plain text on stderr, prefixed by Playwright with `page.evaluate: SankeyError: ` and followed by a stack trace. Invalid JSON, a usage problem, an unreadable file and an unsupported output extension also print a plain message. Every failure exits with 1 and leaves an existing output file untouched.

## Worked example

`request.json` (this is `sankey/examples/submission.json`):

```json
{
  "type": "table",
  "text": "patient_id,diagnosis,treatment,outcome\nP1,A,Surgery,Remission\nP2,A,Drug,Remission\nP3,B,Drug,Progression\n",
  "spec": {
    "format": "wide",
    "columns": ["diagnosis", "treatment", "outcome"],
    "id": "patient_id",
    "missing": "drop"
  },
  "labels": "above",
  "style": { "canvasWidth": 1000, "canvasHeight": 650 }
}
```

`node sankey/scripts/render.cjs request.json diagram.svg` prints `Wrote diagram.svg` on stderr and writes the three-column diagram: an SVG 923 × 613 px, the 1000 × 650 canvas cropped to the drawing with a 12 px margin.

`node sankey/scripts/render.cjs request.json project.json` writes the project. These are its data fields; the layout, style and source-table fields are left out here:

```json
{
  "app": "polylines-sankey",
  "version": 1,
  "mode": "layered",
  "matrices": [[[1, 1], [0, 1]], [[1, 0], [1, 1]]],
  "stageNames": ["diagnosis → treatment", "treatment → outcome"],
  "dimnames": [
    { "rows": ["A", "B"], "cols": ["Surgery", "Drug"] },
    { "rows": ["Surgery", "Drug"], "cols": ["Remission", "Progression"] }
  ],
  "paths": [
    { "nodes": [0, 0, 0], "weight": 1, "members": [{ "id": "P1", "weight": 1 }] },
    { "nodes": [0, 1, 0], "weight": 1, "members": [{ "id": "P2", "weight": 1 }] },
    { "nodes": [1, 1, 1], "weight": 1, "members": [{ "id": "P3", "weight": 1 }] }
  ],
  "pathUnit": "patients",
  "setNames": ["diagnosis", "treatment", "outcome"]
}
```

The first matrix counts diagnosis → treatment: diagnosis A went once to Surgery (P1) and once to Drug (P2), and B once to Drug (P3). The second counts treatment → outcome. Each patient is one pathway: P2's `[0, 1, 0]` is A → Drug → Remission.
