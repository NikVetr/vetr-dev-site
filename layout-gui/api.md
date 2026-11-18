# Multipanel Figure Editor

`window.FigureEditor.getProject()` returns a detached snapshot of the open layout
and its generator options. `window.FigureEditor.submit(project)` returns
`{matrix, code}` without changing the editor. Use the same JSON with
`node layout-gui/cli.mjs request.json` or pipe it on stdin.

```json
{"rows":2,"cols":3,"rects":[{"r0":0,"c0":0,"r1":2,"c1":1},{"r0":0,"c0":1,"r1":1,"c1":3}],"renderer":"mpl"}
```

Grid dimensions are positive integers (up to one million cells in the callable API).
Rectangle corners are zero-based grid boundaries. Reversed drags are accepted.
Panels must have area and stay within bounds without overlapping. The matrix has
one-based panel IDs in input order and zero for empty cells.

Optional fields are `aliases` and `colours` arrays aligned to panel order,
positive `aspect`, `labelMode` (`alpha` or `num`), and Boolean `incSetup`,
`incURL` (both default true), `incExample`, and `incLabels` (both default false).
The renderer defaults to R `layout`. Other renderer keys are `grid`, `gridExtra`,
`cowplot`, `patchwork`, `parfig`, `mpl`, `mpl_mosaic`, `mpl_axes`, `plotly`,
`bokeh`, `makie`, `plots`, `tiled`, `mma_grid`, `csv_inds`, `csv_dims`,
`csv_coords`, `json`, `yaml`, `textpos`, `tikz` and `tabularx`.
Each renderer uses the same options and output format as its editor tab.
Errors carry a code, message and issues with field paths. CLI exit codes are 1
for input or generator errors and 2 for usage or file errors.
