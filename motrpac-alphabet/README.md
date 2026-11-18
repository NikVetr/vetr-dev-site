# MotRPAC Alphabet Editor

Build letters from the MotRPAC logo’s geometric pieces, adjust their positions,
stems and colours, and export SVG artwork or an installable font. The starting
alphabet includes hand-tuned designs; edits and selected variants are saved in
this browser. The MotRPAC/Mattlab lightswitch at the start of either header opens
the other editor, preserving their independent saved projects. Its position and dimensions match across both pages at each screen size.

Serve the repository root with `python3 -m http.server 8000`, then open
`http://localhost:8000/motrpac-alphabet/`. There is no build step or runtime
dependency download.

Choose a letter below the canvas and a numbered variant. Shift-click selects
multiple shapes. The existing alignment, stem and polish controls operate on
selected shapes, or on the whole letter when nothing is selected. Use Undo/Redo
to step back through edits. Cmd/Ctrl-Z and Cmd/Ctrl-Shift-Z undo and redo editor
changes; while typing in an input they retain the browser’s text-editing behaviour.
Export JSON to keep a portable copy of the designs;
browser storage is not a backup.

**File → Export Font** previews the selected variant of every nonempty letter
and downloads a `.ttf` font. Choose logo colours or a single-colour outline font.
All letters share one scale and baseline; their relative widths and component
sizes are preserved. Lowercase characters use the corresponding uppercase
designs. Empty selected variants are omitted and listed in the dialog; numbers
and punctuation are not designed. Colour fonts include ordinary outlines for
applications without colour-font support. The editor’s thin decorative outline
is omitted from the font; SVG export retains it.

The [API](api.md) exposes font export from the open editor and a DOM-independent
font builder from transformed contours. JSON and SVG remain the editable/vector
formats; a font contains the finished outlines.

## Checks

- `npm test`: font structure, metrics, cmap, colour layers, validation and checksums.
- `npm run check`: type-check the standalone font builder with an installed `tsc`.
- `npm run test:browser`: export, preview, download, selected variants and phone
  dialog checks in Chromium. Uses the repository’s existing Playwright install;
  install dependencies in another tool folder or set `PLAYWRIGHT` to its package.

Browser artifacts are written to ignored `tmp/output/alphabet-font/` at the
repository root. The font writer adds no dependencies. See
[summary.md](summary.md) for the editor’s geometry and persistence model.

The starting C, F and K use recovered hand-edited shapes. B starts with two
closed bowls and includes the July exported design as its third variant.
Fresh projects and the editor’s reset-to-defaults action use these designs.
Opening an existing project restores its saved variants and selections.
