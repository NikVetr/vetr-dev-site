# Example images

`cartoon_flat.png` and `logo_holes.png` come from the R version's examples (github.com/NikVetr/raster-to-vector, `examples/`, commit e51e7a3). Its `examples/make_examples.R` draws them, and they are free of restrictions.

- `cartoon_flat.png` (240 × 240): flat colours, no anti-aliasing; the eye whites contain pupils. The page loads it by default.
- `logo_holes.png` (300 × 200): a transparent background; a ring with a disc in its hole, and the letters "B8" with their counters.

`emoji-compressed.jpg` is the real 🍊 (U+1F34A) glyph rendered with the host's Noto Color Emoji font at 128 × 128, then encoded as JPEG at quality 0.5 with mild compression artefacts. It is used by the landing card and the page's **Example: tangerine, 6 colours** button. The example explicitly selects six quantized colours to retain the green leaf. Regenerate with `node raster-to-vector/examples/make-emoji.mjs`. Noto Emoji is by Google and contributors; the installed font is under the SIL Open Font License 1.1, whose document-output exception covers rendered glyph images. The font itself is not redistributed. Source: [googlefonts/noto-emoji](https://github.com/googlefonts/noto-emoji); provenance verified against the local package copyright notice.
