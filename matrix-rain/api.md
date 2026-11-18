# Matrix Rain

Open the page over HTTP, choose **Opening with image** or **Rain only**, then play or scrub the 16-second timeline. Upload a PNG, JPEG or WebP to replace the example photo. **Save frame as PNG** captures the current frame. **Record opening** records the whole sequence at 960 × 540 using the browser’s video encoder. Keep the tab visible during recording. The file format depends on the available encoder.

The choreography comes from `montgomery_lab/Matrix_GreenRain.R` at `fa27daf`. The original uses 30 rows, two waves of character trails, individually timed title letters, a 1× → 3× → 12× camera move, a screen grid and an early image apparition. The browser version adds a final zoom into the chosen image, an adjustable staggered CRT slot mask, and independent looping streams in rain-only mode. Its seed repeats the browser animation. Fonts, glyph streams and frame pixels differ from the R graphics device.

## Frame API

Run this from the repository root with Node 22, or call `window.MatrixRain.submit(request)` on the page.

```sh
echo '{"mode":"opening","title":"WAKE UP","alphabet":"ACGT","seed":777,"time":11.2,"crt":0.8}' | node matrix-rain/cli.mjs
```

All fields are optional. Defaults are opening mode, the title “THE MATRIX: CORRELATIONS”, alphabet “ACGT”, seed 777, time 4 seconds and CRT strength 0.76. Time ranges from 0 to 16 seconds, CRT strength from 0 to 1, and the seed is an unsigned 32-bit integer. Titles allow up to 40 characters and alphabets allow 1–64. The result contains time, zoom, glyph size and an array of glyphs with character, position, opacity and brightness, plus CRT strength, image opacity and image zoom. Coordinates use a 960 × 540 frame.

For repeated rendering, import `makeScene(options)`, `frame(scene,time)` and `paint(context,frame,image)` from `core.mjs`. Pass a decoded local image or null to the Canvas renderer. The public browser API also exposes `paint`. The CLI reads a JSON file argument or stdin. Invalid requests produce a JSON error on stderr with exit status 1. File and usage errors exit 2.
