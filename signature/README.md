# Signature Correction

Open `signature/` through a static server at the repository root. Draw with mouse,
pen or touch, or import CSV, JSON or SVG. Correction and export stay in the browser.

The linked colour timeline follows raw ink length, with a gap for every pen lift.
Drag a bar's ends to resize its span or its middle to move it. Arrow keys move the
focused end or bar by 1%; Shift makes that 10%; Home/End move to the limits. Exact
start/end, strength and falloff fields are available beside each bar. A whole-span
bar affects every stroke. Smoothing and thickness bars are applied in stack order.

Initial global and local suggestions have strength zero, leaving the existing
Fourier/wavelet correction unchanged until you increase their strength. The local
suggestion marks the largest raw second difference; it is a starting point for
inspection, not a claim that a particular letter needs correction.

“Move the ink directly” enables a radius-based canvas warp. Drag the corrected ink,
or enter a centre, radius and displacement and choose Apply warp. Undo/Redo restore
strokes, their view, smoothing settings, brush regions, bars, warps, output controls,
and the morph target and settings. Restoring history cancels pending imports and
example loads, so an older request cannot overwrite the restored state. Use
Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z; text fields retain native text undo. In the target
signature dialog, shortcuts affect that drawing pad.

Creation animation is opt-in and can also be replayed explicitly. Reduced-motion
preferences suppress it. Editor colours link the stroke to its timeline; downloads
use the selected ink colour. SVG, PNG and request JSON include the geometry edits;
request JSON can be loaded again or passed to the CLI.

See [api.md](api.md) for the callable API, CLI, parameters and transformation order,
and [docs/architecture.md](docs/architecture.md) for the maintained implementation.

```sh
NODE_NO_WARNINGS=1 node --test signature/tests/*.test.mjs
# Install the declared dev dependency in signature/ if Playwright is not present.
cd signature
npm run test:browser
```
