# Matrix Rain

Use the settings panel to choose **Opening with reflection** or **Rain only**. Enter one hidden name or phrase per line. Each reads downward in a falling column, and the seed repeats its placement. **Add original lab names** appends the names from the R animation. Upload a PNG, JPEG or WebP to use your own reflection, or use the included green-lit portrait adapted from Nik’s headshot.

Play or scrub the 16-second preview. **Save frame as PNG** captures the current frame. **Record video** captures the full sequence at 960 × 540 using the browser’s video encoder. Keep the tab visible during recording. The file format depends on the available encoder.

The opening draws on `montgomery_lab/Matrix_GreenRain.R` at `fa27daf`. The rain moves toward the title, which locks into place at the center. Once the title dissolves, a faint outline appears on the glass. The final zoom brings the reflection into focus as the rain blurs. CRT slots and image details magnify together. The landing card shows the title lock with its own title, “The Extracellular Matrix.”

## Frame API

Run this from the repository root with Node 22, or call `window.MatrixRain.submit(request)` on the page.

```sh
echo '{"mode":"opening","title":"WAKE UP","alphabet":"ACGT","hiddenWords":["PAGÉ","ADA"],"seed":777,"time":11.2,"crt":0.8}' | node matrix-rain/cli.mjs
```

All fields are optional. Defaults are opening mode, the title “The Correlation Matrix”, alphabet “ACGT”, seed 777, time 4 seconds and CRT strength 0.76. Time ranges from 0 to 16 seconds, CRT strength from 0 to 1, and the seed is an unsigned 32-bit integer. Titles allow up to 40 characters and alphabets allow 1–64. The optional `hiddenWords` array accepts up to 84 entries of 1–30 characters each and defaults to an empty list.

The returned frame uses 960 × 540 coordinates. It includes the time, camera zoom, glyph size, CRT strength, and each glyph’s character, position, opacity and highlight flag. For the reflection, `outlineAlpha` and `imageAlpha` control the two layers, `imageZoom` scales the fitted image, and `maskPitch` gives the width of a CRT cell. `rainAlpha` and `rainBlur` control the rain during the focus change.

For repeated rendering, import `makeScene(options)`, `frame(scene,time)` and `paint(context,frame,image)` from `core.mjs`. Pass a decoded local image or null to the Canvas renderer. The public browser API also exposes `paint`. The CLI reads a JSON file argument or stdin. Invalid requests produce a JSON error on stderr with exit status 1. File and usage errors exit 2.
