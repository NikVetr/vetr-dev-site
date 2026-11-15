# MotRPAC Alphabet API

The open editor exposes `window.MotRPACAlphabet.exportFont(options)`. It returns a
Promise using the currently selected variant of each letter, including unsaved
canvas edits. No request leaves the browser.

```js
const result = await window.MotRPACAlphabet.exportFont({
  family: 'My Alphabet', // default: 'MotRPAC Alphabet'
  color: true           // false for ordinary monochrome outlines
});
// result.bytes: Uint8Array containing a .ttf file
// result.family: trimmed family name
// result.letters: included uppercase characters
// result.missing: A–Z letters with an empty selected variant
// result.format: descriptive font format
```

The returned bytes are the same font that the UI downloads. Lowercase code points
map to the matching uppercase design; space has a fixed 600-unit advance. Other
characters use the missing-glyph box. Each nonempty glyph gets 90-unit side
bearings. All letters use the same scale, with the tallest letter 1,600 units high
in a 2,048-unit em; each letter’s bottom aligns to the baseline. Translation and
rotation of individual pieces remain part of its design.

Native SVG path geometry is sampled adaptively, then rounded to integer font
units. Font export preserves filled contours and logo colours, omitting the
editor’s thin outline. Colour export uses OpenType COLR v0/CPAL tables and includes
ordinary glyph outlines; applications without colour support can render those
outlines. The font is a finished drawing, not the editor’s shape configuration.

## Build from contours in Node or another browser module

`font-export.js` has no DOM or package dependencies and exports `buildFont` and
`FontExportError`:

```js
import { buildFont } from './font-export.js';

const result = buildFont({
  family: 'Example', color: true,
  letters: [{
    letter: 'A',
    layers: [{
      fill: '#46257e',
      points: [{x: 0, y: 0}, {x: 100, y: 0}, {x: 50, y: 100}]
    }]
  }]
});
```

Supply unique A–Z letters, each with one or more solid closed contour layers in
painting order. Points use SVG coordinates (Y increases downwards); repeating
the starting point at the end is optional. Each layer represents one solid
editor shape; holes and SVG strokes are outside this API. Fill is `#rrggbb`.
Coordinates must be finite. Family names must contain 1–80 printable characters.
Invalid contours, duplicate letters, degenerate outlines and excessive font
dimensions throw `FontExportError` with a readable `message`.

The output has the same structure as the editor API. In Node, write it with
`await writeFile('alphabet.ttf', result.bytes)` from `node:fs/promises`.

The font tables follow the OpenType specifications for
[TrueType outlines](https://learn.microsoft.com/en-us/typography/opentype/spec/glyf)
and [COLR colour layers](https://learn.microsoft.com/en-us/typography/opentype/spec/colr).
