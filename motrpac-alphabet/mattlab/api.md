# Mattlab Logo Painter API

The editor works entirely in the browser. No uploads, server or external libraries are required.

`window.MattlabPainter.submit(request)` and `require('./api.js').submit(request)` return a structured result. The CLI uses that same function:

```sh
node motrpac-alphabet/mattlab/cli.cjs request.json
```

Omit the filename to read JSON from standard input. Standard output is one JSON result; errors set a nonzero exit status. Successful SVG requests return `{ "ok": true, "svg": "<svg …>" }`. Invalid requests return `{ "ok": false, "error": { "code": "INVALID_REQUEST", "message": "…" } }`; malformed JSON or unreadable files use `INPUT_ERROR`.

Operations:

- `svg`: supply `fills`, an object mapping all twenty `PainterCore.FACES` IDs to hex colors or `none`, and optional `options` (`name`, `glyph`, `background`: `white`, `transparent`, or a hex color, `outline`, `outlineOnly`). This uses the editor's exact paths and exporter. Missing or unknown faces are rejected.
- `sheet`: supply `entries`, an array of `{key, label, fills}` studies, and optional `options` (`title`, `columns`, `outline`, `labels`, `nonblankOnly`, `background`). This uses the character-sheet exporter on a white sheet by default; a hex `background` changes the sheet color with automatic text/outline contrast. `nonblankOnly: true` omits entries whose actual fills are all white or transparent, independently of their status; it defaults to false. An entirely blank filtered selection returns `INVALID_REQUEST`.
- `validate`: supply `project`, a saved project JSON object. Returns `{ok:true, project}` with the validated current model, including migration of supported older projects.

`PainterCore.presetFills("nv-1")` and `presetFills("nv-2")` return the supplied logo arrangements with corrected corners. The older `reference` preset remains callable for existing integrations, while the editor gallery uses NV-1/NV-2.

The lower-level modules are also callable: `PainterCore` owns geometry and SVG/PNG export, `PainterModel` owns saved studies and Undo/Redo, `PainterColor` owns color transformations, `PainterGlyphs` owns the starting letter studies, and `PainterSheet` owns sheet layout and SVG/PNG export. PNG functions return promises of blobs and require a browser canvas. Node consumers can require the corresponding `.js` files. They throw descriptive errors for invalid inputs.

```js
const Core = require('./core.js');
const {submit} = require('./api.js');
const result = submit({
  operation: 'svg',
  fills: Core.presetFills('reference'),
  options: {name: 'Mattlab', background: 'transparent'}
});
```
