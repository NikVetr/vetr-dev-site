// The tool's single entry point (R/collage.R's make_collage). The page (through its worker),
// window.MessageCollage and cli.mjs all call submit(); nothing here touches the DOM.

import { rMersenneTwister } from '../../shared/rng.js';
import { assignColors, messageLabels } from './colors.js';
import { FAMILIES } from './catalogue.js';
import { faceKey, loadFaces, missingCharacters } from './fonts.js';
import { layoutMessages, snapLinesRight } from './layout.js';
import { measureMessages } from './measure.js';
import { CollageError, normalizeRequest, STYLE_CODES } from './request.js';
import { mean, roundHalfEven, sum } from './rmath.js';
import { rotateMessages } from './rotation.js';

export { CollageError, DEFAULTS, LIMITS, normalizeRequest, parseMessages, STYLE_NAMES } from './request.js';
export { FAMILIES, fontUrl } from './catalogue.js';
export { loadFaces } from './fonts.js';
export { renderPdf, renderSvg } from './render.js';

/**
 * @typedef {import('./request.js').Request} Request
 * @typedef {import('./request.js').StyleName} StyleName
 * @typedef {import('./fonts.js').Face} Face
 * @typedef {import('./measure.js').Dims} Dims
 * @typedef {import('./measure.js').FontChoice} FontChoice
 * @typedef {typeof measureMessages} Measure
 * @typedef {import('./layout.js').Just} Just
 * @typedef {{ run: number, runs: number, empty_fraction: number, best_empty_fraction: number }} Progress
 * @typedef {{ width_in: number, height_in: number, grid_res: number, n_cols: number, n_rows: number, target_rows: number,
 *   margin: number, background: string, cex_scale: number, empty_fraction: number, seed: number, pointsize: number }} Card
 * @typedef {{ index: number, input_index: number, text: string, family: string, style: number, style_name: StyleName,
 *   size: number, cex: number, font_size_pt: number, color: string, restarts: number, label: { x: number, y: number },
 *   rotation?: { angle_deg: number, x_in: number, y_in: number } }} Message
 * @typedef {{ message: number, line: number, text: string, col: number, layout_col: number, row: number, width: number,
 *   height: number, buffered_height: number, end_col: number, end_row: number, just: Just, snapped: boolean, x: number,
 *   y: number, cap_height: number, x_in: number, center_in: number, baseline_in: number, family: string, style: number,
 *   style_name: StyleName, cex: number, font_size_pt: number, color: string }} Line
 * @typedef {{ run: number, seed: number, empty_fraction: number, height_in: number }} Run
 * @typedef {{ card: Card, messages: Message[], lines: Line[], runs: Run[],
 *   fonts: { family: string, category: string, files: Record<string, string> }[], request: Request }} Result
 */

export const POINTSIZE = 12;
export const MARGIN = 0.04;

/**
 * Validates a request, reads the fonts it uses, tries `runs` random layouts and returns the one
 * with the fewest empty cells. Same request (seed included), same result.
 * @param {unknown} request see api.md
 * @param {{ onProgress?: (progress: Progress) => void }} [options] onProgress is called after each run
 */
export async function submit(request, { onProgress } = {}) {
  const req = normalizeRequest(request);
  const faces = await loadFaces(req.fonts, req.styles);
  checkGlyphs(req, faces);
  return makeCollage(req, faces, { onProgress });
}

/**
 * Every character of every message must be in every requested face, as any message may draw any
 * of them. Missing glyphs are an error rather than R's empty .notdef boxes.
 * @param {Request} req @param {Map<string, Face>} faces
 */
function checkGlyphs(req, faces) {
  /** @type {import('./request.js').Issue[]} */
  const issues = [];
  req.messages.forEach((text, i) => {
    for (const family of req.fonts) {
      const missing = [...new Set(req.styles.flatMap((style) => missingCharacters(/** @type {Face} */ (faces.get(faceKey(family, style))), text)))];
      if (missing.length) {
        issues.push({
          code: 'missing_glyphs',
          path: `messages[${i}]`,
          message: `${family} has no glyph for ${missing.map((ch) => `"${ch}" (U+${(/** @type {number} */ (ch.codePointAt(0))).toString(16).toUpperCase().padStart(4, '0')})`).join(', ')}; remove ${missing.length === 1 ? 'it' : 'them'} or leave ${family} out of fonts`,
        });
      }
    }
  });
  if (issues.length) {
    const shown = issues.slice(0, 3).map((issue) => `${issue.path}: ${issue.message}`);
    if (issues.length > 3) shown.push(`and ${issues.length - 3} more`);
    throw new CollageError('missing_glyphs', `Some characters are not in every font: ${shown.join('; ')}`, issues);
  }
}

/**
 * The pipeline after validation and font loading. `measure` can be replaced, as the R parity
 * tests do to give the layout R's own measurements.
 * @param {Request} req @param {Map<string, Face>} faces
 * @param {{ onProgress?: (progress: Progress) => void, measure?: Measure }} [options]
 * @returns {Result}
 */
export function makeCollage(req, faces, { onProgress, measure = measureMessages } = {}) {
  const n = req.messages.length;
  const order = req.shuffle ? rMersenneTwister(req.seed).uniform(n, n) : Array.from({ length: n }, (_, i) => i);
  const messages = order.map((i) => req.messages[i]);
  const gridRes = req.grid_res ?? Math.ceil(Math.sqrt(sum(messages.map((m) => [...m].length)) / Math.sqrt(req.width_in * req.height_in)));
  const nCols = roundHalfEven(req.width_in * gridRes);
  const nRows = roundHalfEven(req.height_in * gridRes);
  const pathOf = (/** @type {number} */ i) => `messages[${order[i]}]`;

  /** @type {ReturnType<typeof layoutRun> | null} */
  let best = null;
  /** @type {Run[]} */
  const runs = [];
  for (let run = 1; run <= req.runs; run++) {
    const r = layoutRun(messages, req, req.seed + run, nCols, nRows, faces, measure, pathOf);
    runs.push({ run, seed: r.seed, empty_fraction: r.emptyFraction, height_in: (req.height_in * r.grid.rows) / nRows });
    if (!best || r.emptyFraction < best.emptyFraction) best = r; // the first on ties, as which.min
    onProgress?.({ run, runs: req.runs, empty_fraction: r.emptyFraction, best_empty_fraction: best.emptyFraction });
  }
  const kept = /** @type {NonNullable<typeof best>} */ (best);

  // Colours are the last draws of a run, so they are drawn for the kept run only.
  const labels = messageLabels(kept.grid, n);
  const colors = assignColors(labels, req.palette, kept.rng);

  /** @type {Card} */
  const card = {
    width_in: req.width_in, height_in: (req.height_in * kept.grid.rows) / nRows, grid_res: gridRes,
    n_cols: nCols, n_rows: kept.grid.rows, target_rows: nRows, margin: MARGIN, background: req.background,
    cex_scale: kept.cexScale, empty_fraction: kept.emptyFraction, seed: kept.seed, pointsize: POINTSIZE,
  };
  /** @type {Message[]} */
  const msgs = messages.map((text, i) => {
    const { family, style, size } = kept.fonts[i];
    const cex = size * kept.cexScale;
    return {
      index: i + 1, input_index: order[i] + 1, text, family, style: STYLE_CODES[style], style_name: style, size, cex,
      font_size_pt: POINTSIZE * cex, color: colors[i], restarts: kept.restarts[i], label: labels[i],
    };
  });
  const result = {
    card,
    messages: msgs,
    lines: lineGeometry(kept, msgs, card),
    runs,
    fonts: req.fonts.map((family) => ({
      family,
      category: FAMILIES[/** @type {keyof typeof FAMILIES} */ (family)].category,
      files: Object.fromEntries(req.styles.map((style) => [style, FAMILIES[/** @type {keyof typeof FAMILIES} */ (family)].faces[style]])),
    })),
    request: req,
  };
  if (req.rotation_deg > 0) rotateMessages(result, faces);
  return result;
}

/**
 * One random layout: fonts, styles and sizes drawn as R draws them after set.seed(seed), then
 * measurement, the global scale and the grid layout.
 * @param {string[]} messages in layout order @param {Request} req @param {number} seed
 * @param {number} nCols @param {number} nRows @param {Map<string, Face>} faces @param {Measure} measure
 * @param {(i: number) => string} pathOf
 */
function layoutRun(messages, req, seed, nCols, nRows, faces, measure, pathOf) {
  const rng = rMersenneTwister(seed);
  const n = messages.length;
  const families = Array.from({ length: n }, () => req.fonts[rng.index(req.fonts.length)]);
  const styles = Array.from({ length: n }, () => req.styles[rng.index(req.styles.length)]);
  const [lo, hi] = req.size_range;
  const raw = Array.from({ length: n }, () => (lo === hi ? lo : lo + (hi - lo) * rng.unif())); // runif()
  const m = mean(raw);
  /** @type {FontChoice[]} */
  const fonts = raw.map((s, i) => ({ family: families[i], style: styles[i], size: s / m }));
  const dims = measure(messages, fonts, faces, nCols, nRows, req.width_in, req.height_in);
  const cexScale = Math.sqrt((nCols * nRows) / sum(dims.map((d) => d.total))) * req.fill;
  const { grid, lines, restarts } = layoutMessages(dims, nCols, nRows, cexScale, req.line_gap, req.message_gap, pathOf);
  let empty = 0;
  for (const v of grid.cells) if (v === 0) empty++;
  return { seed, rng, fonts, dims, cexScale, grid, lines, restarts, emptyFraction: longDoubleQuotient(empty, grid.cells.length) };
}

/**
 * Each line's cells, its drawing position in plot coordinates (cells, y up: left edge, and the
 * centre of its cap height) and in page inches from the top-left corner.
 * @param {ReturnType<typeof layoutRun>} run @param {Message[]} msgs @param {Card} card
 * @returns {Line[]}
 */
function lineGeometry(run, msgs, card) {
  const snaps = snapLinesRight(run.lines, run.grid);
  const toXIn = (/** @type {number} */ x) => (x + card.margin * card.n_cols) / ((1 + 2 * card.margin) * card.n_cols) * card.width_in;
  const toYIn = (/** @type {number} */ y) => ((1 + card.margin) * card.n_rows - y) / ((1 + 2 * card.margin) * card.n_rows) * card.height_in;
  return run.lines.flatMap((lines, i) => lines.map((l, j) => {
    const { col, snapped } = snaps[i][j];
    const m = msgs[i];
    const x = col - 1;
    const y = card.n_rows - l.ri + 1 - l.height / 2 - l.v_adj_s / 2;
    const capHeight = run.dims[i].h * run.cexScale;
    return {
      message: i + 1, line: j + 1, text: l.string, col, layout_col: l.ci, row: l.ri, width: l.width, height: l.height,
      buffered_height: l.buffered_height, end_col: col + l.end_ci - l.ci, end_row: l.end_ri, just: l.just, snapped,
      x, y, cap_height: capHeight, x_in: toXIn(x), center_in: toYIn(y), baseline_in: toYIn(y - capHeight / 2),
      family: m.family, style: m.style, style_name: m.style_name, cex: m.cex, font_size_pt: m.font_size_pt, color: m.color,
    };
  }));
}

/**
 * a / b as R's mean() of a logical vector gives it: the quotient in x87 long double (64-bit
 * significand), then rounded to double. Both roundings are to nearest, ties to even.
 * @param {number} a a whole number >= 0 @param {number} b a whole number > 0
 */
function longDoubleQuotient(a, b) {
  if (a === 0) return 0;
  const A = BigInt(a);
  const B = BigInt(b);
  let shift = 0; // scale so that the quotient has 64 significant bits
  while ((A << BigInt(Math.max(shift, 0))) / B < 1n << 63n && shift < 2000) shift++;
  const num = A << BigInt(shift);
  const q = roundDivide(num, B); // 64 (or 65 after rounding up) bits
  const extra = BigInt(q.toString(2).length - 53);
  const q53 = roundDivide(q, 1n << extra);
  return Number(q53) * 2 ** (Number(extra) - shift);
}

/** n / d rounded to nearest, ties to even. @param {bigint} n @param {bigint} d */
function roundDivide(n, d) {
  const q = n / d;
  const r2 = 2n * (n - q * d);
  return r2 > d || (r2 === d && q % 2n === 1n) ? q + 1n : q;
}
