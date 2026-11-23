# Matrix Rain

Use the settings panel to choose **Opening with reflection** or **Rain only**. Enter one hidden name or phrase per line. Each reads downward in a falling column, and the seed repeats its placement. **Add original lab names** appends the names from the R animation. Upload a PNG, JPEG or WebP to use your own reflection, or use the included green-lit portrait adapted from Nik’s recent photograph.

The studio opens on the portrait at 1.5 seconds. Play starts the 15.5-second opening from the beginning, or from a time you scrub to. The 16:9 film fits beside the settings on desktop and above them on a phone. **Save frame as PNG** captures the current frame. **Record video** captures the full sequence at 960 × 540 using the browser’s video encoder. Keep the tab visible during recording. The file format depends on the available encoder.

The animation follows the [July 2021 “THE MONTGOMERY LAB” script](https://github.com/NikVetr/montgomery_lab/blob/92928585e7795bbc0d1b5843ae28a20733314ffa/Matrix_GreenRain.R). The [April 2022 “THE EXTRACELLULAR MATRIX” revision](https://github.com/NikVetr/montgomery_lab/blob/ebc8888005cb597eb7962340b2fcbc6ad1d64937/Matrix_GreenRain.R) supplies the studio’s 16:9 framing and 30-row grid. Each trail advances in whole rows, lighting the letters already in those cells. Initial offsets span 6–59 rows. Trail lengths range from 9 to 24 characters in steps of three. Columns carrying hidden phrases start earlier and can have longer trails so the phrase can be read. A second pass brings the heads to the title. The camera moves continuously through both passes, and the CRT brightness pattern changes every half second.

The portrait enters from 0.25 to 1.5 seconds. A faint edge calculated from the supplied image accompanies its entrance. The fade ends before the first stream can reach the top of a bottom-aligned image, accounting for the seed, glyph size and view aspect ratio. At the studio defaults the portrait is gone by 2.65 seconds. The first logistic zoom centers on 8 seconds as streams lock into the title. The second centers on 14.75 seconds, closing in on the last letters as they fade. “THE MONTGOMERY LAB” keeps its original “GO” close-up. The CRT mask magnifies with the camera. The landing card plays the same 15.5-second opening with its own title, “The Extracellular Matrix,” fitted to the card.

At short, wide aspect ratios, the renderer adds rows and uses smaller rain lettering when a hidden phrase needs more space. During an opening, planted columns light their full phrase before the zoom can carry it out of view.

## Frame API

Run this from the repository root with Node 22, or call `window.MatrixRain.submit(request)` on the page.

```sh
echo '{"mode":"opening","title":"WAKE UP","alphabet":"ACGT","hiddenWords":["PAGÉ","ADA"],"seed":777,"time":11.2,"crt":0.8}' | node matrix-rain/cli.mjs
```

All fields are optional. Defaults are opening mode, the title “The Correlation Matrix”, alphabet “ACGT”, seed 777, time 4 seconds and CRT strength 0.76. The playback ends at 15.5 seconds. API times through 16 seconds still sample the closing hold. CRT strength ranges from 0 to 1, and the seed is an unsigned 32-bit integer. Titles allow up to 40 characters and alphabets allow 1–64. The optional `hiddenWords` array accepts up to 84 entries of 1–30 characters each and defaults to an empty list.

The returned frame uses 960 × 540 coordinates. It includes the time, camera zoom, title and rain font sizes (`size` and `rainSize`), CRT strength, and each glyph’s character, position, opacity, highlight flag, column and kind (rain or title). For the reflection, `outlineAlpha` and `imageAlpha` control the two layers, `imageZoom` scales the fitted image, `maskPitch` gives the width of a CRT cell, `cameraProgress` is zero for the fixed reflection, and `blackout` gives the opacity of the closing hold. `rainAlpha` and `rainBlur` remain available to callers painting custom frames.

For repeated rendering, import `makeScene(options)`, `frame(scene, time, aspect = 16 / 9)` and `paint(context,frame,image)` from `core.mjs`. Pass a decoded local image or null to the Canvas renderer. An optional fourth argument, `{x, y}` in normalized image coordinates, sets the focal point for custom camera frames. The public browser API also exposes `paint`. The CLI reads a JSON file argument or stdin. Invalid requests produce a JSON error on stderr with exit status 1. File and usage errors exit 2.
