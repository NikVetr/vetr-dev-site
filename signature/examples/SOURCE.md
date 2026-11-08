# Example signatures

All examples are synthetic. No real person's signature is used, and the names are made up.

- `avery-quill.csv`: "Avery Quill" (8 strokes, 358 samples, 7.3 s), the page's default.
- `avery-quill-rough.csv`: the same seeded Avery Quill path and timestamps, with wobble amplitude 6 px and tremor amplitude 1.8 px, for the landing workflow. Its correction uses Fourier strength 10 and wavelet energy retention 0.99 without thresholding the smooth coefficients; app defaults stay unchanged.
- `juno-marsh.csv`: "Juno Marsh" (10 strokes, 394 samples, 8.0 s), the default morph target. Its stroke count differs from Avery Quill's, so the morph pairs leftover strokes.

Columns: `x`, `y` in screen pixels (y down), `t` in milliseconds. Pen lifts are pauses of more than 50 ms, as the R script reads its signature files.

`../scripts/make-examples.mjs` writes them, seeded, so running it again gives the same files:

1. The name is set in Hershey Simplex Script, the public-domain single-stroke font, from name-tags' glyph data (`../../name-tags/core/hershey-data.js`; its terms are in `../../name-tags/vendor/LICENSES.md`), then slanted, turned slightly and scaled to 150 or 160 px tall.
2. The glyph polylines are rounded (Chaikin corner cutting, three rounds). The result is the intended path.
3. The pen's speed along that path follows the two-thirds power law: 120 · (curvature + 1/400)^(-1/3) px/s. It is varied slowly by up to about 25% and ramps up and down at each stroke's ends.
4. The hand's path is the intended one plus a smooth wobble of about 3 px (wavelengths 40-140 px) and a tremor of about 1 px (wavelengths 6-13 px).
5. That path is sampled at 60 Hz, as a trackpad reports it, with timestamps jittered by about 1.2 ms. Positions are rounded to whole pixels. Each pen lift lasts 140-260 ms.
