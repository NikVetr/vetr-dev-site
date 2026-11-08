// The tool's single entry point. The page (through its worker),
// window.TextInImage and cli.mjs all call submit(); nothing here touches the
// DOM. Stages, as R's text_in_image():
//   1. quantize colours (quantize.js)                       [optional]
//   2. rotate the picture, find paintable pixels (region.js)
//   3. measure glyphs, lay out lines, iterate the font size (layout.js)
//   4. colour each glyph from the pixels beneath it (colors.js)

import { glyphColors } from './colors.js';
import { inkCoverage, measureChars, missingChars } from './font.js';
import { fitTextSize, prepareText } from './layout.js';
import { quantizeOklab, toRaster } from './quantize.js';
import { regionRows, rotateRaster, unrotatePosition } from './region.js';
import { normalizeRequest, parseColor } from './request.js';
import { mulberry32 } from '../../shared/rng.js';

export { DEFAULTS, R_REPOSITORY, TextInImageError } from './request.js';
export { FONT } from './font.js';
export { renderSvg } from './svg.js';

/**
 * @typedef {{ char: string, x: number | null, y: number | null, line: number | null, block: number | null, placed: boolean, col: string | null }} Glyph
 * @typedef {ReturnType<typeof submit>} Result
 */

/**
 * Validates a request and fits its text into its image. Same request (seed
 * included), same result, timings aside.
 * @param {unknown} request see api.md
 */
export function submit(request) {
  const { image, text, settings } = normalizeRequest(request);
  const { layout, render } = settings;
  /** @type {Record<string, number>} */
  const timings = {};
  /** @template T @param {string} stage @param {() => T} run @returns {T} */
  const timed = (stage, run) => {
    const t0 = performance.now();
    const out = run();
    timings[stage] = performance.now() - t0;
    return out;
  };

  // 1. colour quantization; quantize: null keeps the image's colours
  const { raster, palette } = timed('quantize', () => (settings.quantize === null
    ? { raster: toRaster(image, 'white'), palette: null }
    : quantizeOklab(toRaster(image, settings.quantize.transparent_color), settings.quantize, mulberry32(settings.seed))));

  // 2. paintable region: text at `rotation` degrees counterclockwise is laid
  //    out horizontally on the picture turned clockwise by that angle
  const { rotated, region } = timed('region', () => {
    const rotated = rotateRaster(raster, layout.rotation);
    return { rotated, region: regionRows(rotated, settings.region.alpha_thresh) };
  });

  // 3. layout and font-size iteration, in the unit square; the canvas is the
  //    rotated picture at `scale` output pixels per image pixel, with `margin`
  //    of padding on every side
  const txt = prepareText(text, layout.wrap);
  const chars = [...new Set([...txt.filter(c => c !== '\n'), ' '])];
  const canvas = { width: rotated.width * render.scale, height: rotated.height * render.scale };
  const span = 1 + 2 * render.margin;
  const em = measureChars(chars);
  if (layout.wrap === 'word') em.width.set('\n', 0);
  const metrics = (/** @type {number} */ cex) => {
    const px = 12 * cex; // R's cex: 12 px per unit on its 72-ppi device
    return {
      w: new Map([...em.width].map(([c, v]) => [c, v * px * span / canvas.width])),
      h: em.height * px * span / canvas.height,
    };
  };
  const fit = timed('layout', () => {
    // first guess: the size at which the text's area (summed advances x line
    // pitch) equals the paintable area; metrics are linear in cex
    const m1 = metrics(1);
    const area = txt.reduce((sum, c) => sum + /** @type {number} */ (m1.w.get(c)), 0) * m1.h * layout.line_height;
    return fitTextSize(txt, region, metrics, Math.sqrt(region.paintableFraction / area), {
      nRounds: layout.n_rounds, lineHeight: layout.line_height, justify: layout.justify,
      lineWidths: layout.line_widths, skipGaps: layout.skip_gaps, wrap: layout.wrap,
    });
  });

  // 4. glyph colours, then positions back onto the unrotated picture
  const glyphs = timed('color', () => {
    const ink = settings.color.ink_compensation ? new Map(chars.map((c) => [c, inkCoverage(c)])) : null;
    const { x, y, line, block } = fit.pass;
    const cols = glyphColors({ txt, x, y, line }, fit.widths, rotated, region, ink,
      /** @type {import('./request.js').Rgb} */ (parseColor(settings.color.background)));
    return txt.map((char, i) => {
      const xi = x[i];
      const yi = y[i];
      const placed = xi !== null && yi !== null;
      const p = placed ? unrotatePosition(xi, yi, layout.rotation, rotated.width, rotated.height) : { x: null, y: null };
      return /** @type {Glyph} */ ({ char, x: p.x, y: p.y, line: line[i], block: block[i], placed, col: char === '\n' ? null : cols[i] });
    });
  });

  /** @type {string[]} */
  const warnings = [];
  if (!fit.complete) warnings.push(`text did not fit: ${(100 * fit.fractionPlaced).toFixed(1)}% of characters placed`);
  const missing = missingChars(chars);
  if (missing.length) warnings.push(`Liberation Sans Bold has no glyph for ${missing.map((c) => JSON.stringify(c)).join(' ')}; they are measured and drawn as its empty-box glyph`);

  return {
    cex: fit.cex,
    font_size_px: fit.cex * 12,
    complete: fit.complete,
    fraction_placed: fit.fractionPlaced,
    lines: glyphs.reduce((most, g) => Math.max(most, g.line ?? 0), 0),
    history: fit.history,
    glyphs,
    canvas,
    image: { width: image.width, height: image.height },
    palette,
    settings,
    timings_ms: timings,
    warnings,
  };
}
