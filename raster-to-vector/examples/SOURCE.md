# Example images

`cartoon_flat.png` and `logo_holes.png` come from the R version's examples (github.com/NikVetr/raster-to-vector, `examples/`, commit e51e7a3). Its `examples/make_examples.R` draws them, and they are free of restrictions.

- `cartoon_flat.png` (240 × 240): flat colours, no anti-aliasing; the eye whites contain pupils. The page loads it by default.
- `logo_holes.png` (300 × 200): a transparent background; a ring with a disc in its hole, and the letters "B8" with their counters.

`emoji-compressed.jpg` is the real 🍥 fishcake swirl (U+1F365) rendered with the host's Noto Color Emoji font at 128 × 128, then encoded as JPEG at quality 0.7. It is used by the landing card and the page's **Example: swirl, 3 colours** button. The named example selects three colours and mb4 wavelet smoothing with threshold multiplier 8; all other core settings retain their defaults. The shared settings are in `emoji-settings.js`, and do not change the application's startup example or the core/API defaults.

Regenerate the input with `node raster-to-vector/examples/make-emoji.mjs`, then the four-stage landing picture with `node scripts/landing-art/build.mjs raster-to-vector`. Its colour frame uses the core's quantization and cleanup functions; its traced frame is the same request with smoothing disabled; its smooth frame is the app's exported SVG. Thin contour strokes are display annotations over the actual path coordinates. The picture shows the smooth result at rest and cycles raster → colours → outlines → smooth on interaction.

Noto Emoji is by Google and contributors; the installed font is under the SIL Open Font License 1.1, whose document-output exception covers rendered glyph images. The font itself is not redistributed. Source: [googlefonts/noto-emoji](https://github.com/googlefonts/noto-emoji); provenance verified against `/usr/share/doc/fonts-noto-color-emoji/copyright`. The reference supplied by the user guided the stage sequence and the choice of emoji; its pixels are not included in the asset.
