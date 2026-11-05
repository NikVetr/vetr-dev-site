// The tool's single entry point, as the R version's vectorize() followed by
// vectorize_response(). The page (through its worker), window.RasterToVector
// and cli.mjs all call submit(); nothing here touches the DOM.
//
// Stages: preprocess -> quantize -> clean -> trace -> smooth -> frame and
// paint order -> regions -> SVG.

import { downscale, pad, upscale } from './image.js';
import { frameContour, plottingOrder } from './order.js';
import { cleanLabels, CleanError, quantizeColors, relabelClusters } from './quantize.js';
import { normalizeRequest, RasterToVectorError } from './request.js';
import { smoothContour } from './smooth.js';
import { buildRegions, regionsToSvg } from './svg.js';
import { traceLayersMs } from './trace-ms.js';
import { traceLayersOriginal } from './trace-original.js';

export { DEFAULTS, RasterToVectorError } from './request.js';

/**
 * @typedef {import('./svg.js').PaletteEntry} PaletteEntry
 * @typedef {import('./svg.js').Region} Region
 * @typedef {{ code: string, message: string, [key: string]: unknown }} Warning
 * @typedef {{ stage: string, k?: number, step?: number, of?: number }} Progress
 * @typedef {{ width: number, height: number, k: number, dbi: Record<string, number | null>, palette: PaletteEntry[],
 *   regions: Region[], svg: string, warnings: Warning[], timings: Record<string, number>,
 *   settings: import('./request.js').Settings }} Result
 */

/**
 * Vectorizes an image. Same request (seed included), same result, apart from timings.
 * @param {unknown} request see api.md
 * @param {{ onProgress?: (progress: Progress) => void }} [options] called as each stage
 *   starts, and before each k is tried
 * @returns {Result}
 */
export function submit(request, { onProgress } = {}) {
  const { image, settings: s } = normalizeRequest(request);
  /** @type {Warning[]} */
  const warnings = [];
  /** @type {Record<string, number>} */
  const timings = {};
  let t0 = performance.now();
  /** Records the seconds the stage `done` took and reports the next one. @param {string} done @param {string} [next] */
  const tick = (done, next) => {
    const now = performance.now();
    timings[done] = Math.round(now - t0) / 1000;
    t0 = now;
    if (next) onProgress?.({ stage: next });
  };
  onProgress?.({ stage: 'read' });

  let img = image;
  if (s.preprocess.maxDim !== null) img = downscale(img, s.preprocess.maxDim);
  img = upscale(img, s.preprocess.scale);
  const { width, height } = img;
  const padN = s.preprocess.pad;
  const padded = pad(img, padN);
  const H = padded.height;
  const W = padded.width;
  tick('read', 'quantize');

  const q = s.quantize;
  const kRange = q.k === 'auto' ? [...q.kRange] : [q.k];
  const quant = quantizeColors(padded, { ...q, kRange }, (k, step, of) => onProgress?.({ stage: 'quantize', k, step, of }));
  if (quant.ks.length !== kRange.length || quant.ks.some((k, i) => k !== kRange[i])) {
    warnings.push({ code: 'K_REDUCED', message: `the image has ${quant.nDistinct} distinct colours; k tried: ${quant.ks.join(', ')}`, k: quant.ks });
  }
  tick('quantize', 'clean');

  let cleaned;
  try {
    cleaned = cleanLabels(quant.clusterInds, H, W, s.clean.minRun, s.clean.passes);
  } catch (error) {
    if (!(error instanceof CleanError)) throw error;
    throw new RasterToVectorError('CLEANUP_FAILED', error.message, [{ code: 'CLEANUP_FAILED', path: 'clean.minRun', message: error.message }]);
  }
  const { labels, centers } = relabelClusters(cleaned, quant.centers);
  if (centers.length < quant.centers.length) {
    warnings.push({ code: 'COLOURS_MERGED', message: `${quant.centers.length - centers.length} colour(s) vanished in cleanup or had no pixels` });
  }
  const K = centers.length;
  tick('clean', 'trace');

  const tr = s.trace;
  const traced = tr.method === 'original'
    ? traceLayersOriginal(labels, H, W, K, tr.minLength, tr.kconvInit)
    : traceLayersMs(labels, H, W, K, tr.minLength);
  const nDropped = traced.map((t) => t.dropped.length);
  if (nDropped.some((n) => n > 0)) {
    warnings.push({
      code: 'DROPPED_CONTOURS',
      message: `${nDropped.reduce((a, b) => a + b, 0)} traced chain(s) were not closed or were shorter than ${tr.minLength} pixels and were dropped`,
      perLayer: nDropped,
      pixels: traced.map((t) => t.dropped.reduce((a, d) => a + d.n, 0)),
    });
  }
  const lost = traced.flatMap((t, i) => (t.shapes.length === 0 ? [i + 1] : []));
  if (lost.length) warnings.push({ code: 'LAYER_WITHOUT_CONTOURS', message: 'some colours produced no closed contour', layers: lost });
  tick('trace', 'smooth');

  if (s.smooth.method === 'hadamard') {
    const short = traced.flatMap((t) => t.shapes).find((r) => r.x.length > 1 && 2 ** Math.ceil(Math.log2(r.x.length)) < 20);
    if (short) {
      const message = `Hadamard smoothing takes the sd of the last 20 of the 2^ceil(log2 n) coefficients, so every contour needs at least 17 points; one has ${short.x.length} (the R version stops with an error here). Set trace.minLength to 17 or more, or choose another smooth.method.`;
      throw new RasterToVectorError('HADAMARD_SHORT_CONTOUR', message, [{ code: 'HADAMARD_SHORT_CONTOUR', path: 'smooth.method', message }]);
    }
  }
  const smoothed = traced.map((t) => t.shapes.map((r) => smoothContour(r, s.smooth)));
  tick('smooth', 'order');

  const frame = frameContour(labels, H, W);
  smoothed[frame.layer - 1].push(frame.contour);
  const ord = plottingOrder(smoothed, frame.layer - 1, s.order.threshold);
  tick('order', 'svg');

  const share = new Float64Array(K);
  for (let r = padN; r < padN + height; r++) for (let c = padN; c < padN + width; c++) share[labels[r * W + c] - 1]++;
  /** @type {PaletteEntry[]} */
  const palette = centers.map((c, i) => ({
    layer: i + 1,
    hex: `#${c.slice(0, 3).map((v) => Math.trunc(255 * v + 0.5).toString(16).toUpperCase().padStart(2, '0')).join('')}`,
    alpha: c[3],
    share: share[i] / (width * height),
    transparent: c[3] < s.output.transparentAlpha,
  }));
  const regions = buildRegions(ord, smoothed, palette.map((p) => p.transparent), padN, s.output.holes);
  const svg = regionsToSvg(regions, palette, width, height, s.output.digits);
  tick('svg');

  /** @type {Record<string, number | null>} */
  const dbi = {};
  quant.ks.forEach((k, i) => { dbi[k] = quant.dbi[i] === null || Number.isNaN(quant.dbi[i]) ? null : quant.dbi[i]; });
  return { width, height, k: K, dbi, palette, regions, svg, warnings, timings, settings: s };
}
