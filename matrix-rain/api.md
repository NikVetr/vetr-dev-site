# Matrix Rain

Use the settings panel to choose **Opening with reflection** or **Rain only**. Enter one hidden name or phrase per line. Each reads downward in a falling column, and the seed repeats its placement. **Add original lab names** appends the names from the R animation. Upload a PNG, JPEG or WebP to use your own reflection, or use the included green-lit portrait adapted from Nik’s recent photograph.

Play or scrub the 16-second preview. The 16:9 film fits beside the settings on desktop and above them on a phone. **Save frame as PNG** captures the current frame. **Record video** captures the full sequence at 960 × 540 using the browser’s video encoder. Keep the tab visible during recording. The file format depends on the available encoder.

The opening draws on `montgomery_lab/Matrix_GreenRain.R` at `fa27daf`. The camera begins moving as the rain starts. Each title stream reaches its letter and stops there. After the rain clears, the title blinks out in stages and a faster push closes in on the remaining central letters. “THE MONTGOMERY LAB” keeps its original “GO” close-up. A faint outline then appears against the lower edge of the glass. The browser computes this contour from the uploaded image’s luminance and transparency with a Sobel filter. As the image comes into focus, the camera moves into the default portrait’s sunglass lens or the center of an uploaded image, then fades to black. The CRT mask magnifies with the image. The landing card plays the same opening with its own title, “The Extracellular Matrix,” fitted to the card’s aspect ratio.

## Frame API

Run this from the repository root with Node 22, or call `window.MatrixRain.submit(request)` on the page.

```sh
echo '{"mode":"opening","title":"WAKE UP","alphabet":"ACGT","hiddenWords":["PAGÉ","ADA"],"seed":777,"time":11.2,"crt":0.8}' | node matrix-rain/cli.mjs
```

All fields are optional. Defaults are opening mode, the title “The Correlation Matrix”, alphabet “ACGT”, seed 777, time 4 seconds and CRT strength 0.76. Time ranges from 0 to 16 seconds, CRT strength from 0 to 1, and the seed is an unsigned 32-bit integer. Titles allow up to 40 characters and alphabets allow 1–64. The optional `hiddenWords` array accepts up to 84 entries of 1–30 characters each and defaults to an empty list.

The returned frame uses 960 × 540 coordinates. It includes the time, camera zoom, glyph size, CRT strength, and each glyph’s character, position, opacity highlight flag, column and kind (rain or title). For the reflection, `outlineAlpha` and `imageAlpha` control the two layers, `imageZoom` scales the fitted image, `maskPitch` gives the width of a CRT cell, `cameraProgress` tracks the push toward the focal point, and `blackout` gives the opacity of the final fade. `rainAlpha` and `rainBlur` control the rain during the focus change.

For repeated rendering, import `makeScene(options)`, `frame(scene, time, aspect = 16 / 9)` and `paint(context,frame,image)` from `core.mjs`. Pass a decoded local image or null to the Canvas renderer. An optional fourth argument, `{x, y}` in normalized image coordinates, sets the zoom target. The default points at the bundled portrait’s lens. The public browser API also exposes `paint`. The CLI reads a JSON file argument or stdin. Invalid requests produce a JSON error on stderr with exit status 1. File and usage errors exit 2.
