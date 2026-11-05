# Vendored bundles

- `clipper.js`: clipper-lib 6.4.2 (Clipper 6.4.2.2, Boost Software License 1.0), the JavaScript translation of Angus Johnson's Clipper, as an ES module. name-tags, signature and helix union and cut polygons with it through `shared/polygon.js`. The changes from the npm release are listed in `LICENSES.md`; `clipper.d.ts` is hand-written.
- `fontkit.esm.js`: @pdf-lib/fontkit 1.1.1 (MIT), with pako 1.0.11 (MIT) and regenerator-runtime 0.14.1 (MIT) bundled in. text-in-image and name-tags read font outlines with it.

fontkit is an unchanged copy of `pocket-language-guide/vendor/fontkit.esm.js`, which that app builds with `npm run vendor` (`scripts/build_vendor.mjs`: esbuild, minified, licence comments left out). Do not edit it by hand. To update it, rebuild it there and copy it here. `fontkit.esm.d.ts` is hand-written. The licences are in `LICENSES.md`.
