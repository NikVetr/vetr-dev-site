// Line fitting and the font-size iteration, as R's text_layout.R. Layout works
// in the image's unit square (see region.js); a glyph's x is the left edge of
// its advance box and its y the line's reference height, which R's
// text(pos = 4) draws with the baseline a third of the cap height below.

import { layoutWords, wordSizeLimit } from './word-layout.js';
import { columnRuns, lineColumns, nearestRow } from './region.js';

/**
 * @typedef {import('./region.js').Region} Region
 * @typedef {{ lineWidths: 'band' | 'row', skipGaps: boolean, justify: boolean, wrap?: 'character'|'word' }} LayoutOptions
 * @typedef {{
 *   x: (number | null)[], y: (number | null)[], line: (number | null)[], block: (number | null)[],
 *   complete: boolean, gotThrough: number, propThrough: number | null,
 * }} Pass
 * @typedef {{ w: Map<string, number>, h: number }} Metrics  widths and "M" height in unit-square units
 */

/**
 * The text as one character per element, with each run of whitespace (line
 * breaks included) collapsed to a single space in character mode. Word mode
 * preserves explicit line breaks and collapses only horizontal whitespace.
 * @param {string} text @param {'character'|'word'} [wrap]
 */
export function prepareText(text, wrap = 'character') {
  return Array.from(wrap === 'word'
    ? text.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')
    : text.replace(/\s+/g, ' '));
}

/**
 * One greedy layout pass at fixed glyph metrics. Characters fill each
 * horizontal run of the current line left to right, breaking mid-word; a glyph
 * is placed before the overflow check, so the last one in a run can stick out
 * past its edge. A glyph that overflows a run moves the cursor to the next run,
 * and a full line moves down by lineH (at least one pixel row).
 * @param {string[]} txt
 * @param {number[]} w advance width of each element of txt
 * @param {number} lineH line pitch
 * @param {number} textH height of "M"; sets the band
 * @param {Region} region
 * @param {number} spaceW
 * @param {LayoutOptions} options
 * @returns {Pass}
 */
export function layoutPass(txt, w, lineH, textH, region, spaceW, { lineWidths, skipGaps, justify }) {
  const n = txt.length;
  const { pxlw, pxlh, nonemptyY } = region;
  const topY = nonemptyY[0];
  const minY = nonemptyY[nonemptyY.length - 1];
  /** @param {number} cy */
  const openLine = (cy) => {
    // skip vertical gaps one pixel row at a time
    for (;;) {
      const runs = columnRuns(lineColumns(region, cy, lineWidths, textH, skipGaps), region.width);
      if (runs.x.length > 0 || !(cy > minY)) return { ...runs, cy };
      cy -= pxlh;
    }
  };

  /** @type {(number | null)[]} */
  const x = new Array(n).fill(null);
  const y = x.slice();
  const line = x.slice();
  const block = x.slice();
  let ln = openLine(lineWidths === 'band' ? topY - 2 * textH / 3 : topY);
  if (!ln.x.length) return { x, y, line, block, complete: false, gotThrough: 0, propThrough: null }; // not even one line fits
  let cy = ln.cy;
  let cx = ln.x[0];
  let tw = ln.tw;
  let tsw = ln.tsw[0];
  let twtd = 0;
  let tswtd = 0;
  let lineI = 1;
  let currBlock = 1;
  let blockStart = 0;
  let complete = true;
  let gotThrough = 1;
  let goToNextLine = false;
  const placedX = /** @type {number[]} */ (x);

  for (let i = 0; i < n; i++) {
    x[i] = cx; y[i] = cy; line[i] = lineI; block[i] = currBlock;
    cx += w[i];
    twtd += w[i];
    tswtd += w[i];

    // overflowed the current run: continue in the next run of this line
    if (tswtd > tsw && !(twtd > tw)) {
      twtd += tsw - tswtd; // do not accumulate the overflow
      const k = countAtMost(ln.x, cx + 0.1 * pxlw);
      if (k >= ln.x.length) {
        goToNextLine = true;
      } else {
        if (justify) justifyBlock(placedX, blockStart, i, txt, w, tsw, tswtd, spaceW);
        cx = ln.x[k];
        currBlock++;
        blockStart = i + 1;
        tswtd = 0;
        tsw = ln.tsw[k];
      }
    }

    // line full: move down a line
    if (twtd > tw || goToNextLine) {
      goToNextLine = false;
      if (justify) justifyBlock(placedX, blockStart, i, txt, w, tsw, tswtd, spaceW);
      twtd = tswtd = 0;
      currBlock = 1;
      blockStart = i + 1;
      lineI++;

      // step down at least one non-empty pixel row
      const curRowY = region.rowY[nearestRow(region, cy)];
      const below = nonemptyY.find((v) => v < curRowY - lineH / 100); // rows run top to bottom
      ln = openLine(Math.min(cy - lineH, below ?? -Infinity));
      cy = ln.cy;
      if (!(cy > minY)) {
        complete = false;
        gotThrough = (i + 1) / n;
        break;
      }
      cx = ln.x[0];
      tw = ln.tw;
      tsw = ln.tsw[0];
    }
  }

  // how far through the region the text reached (fraction of paintable pixels)
  let propThrough = null;
  if (complete) {
    const lx = placedX[n - 1];
    const ly = /** @type {number} */ (y[n - 1]);
    let best = 0;
    let bestD = Infinity;
    for (let p = 0; p < region.px.length; p++) {
      const d = (region.px[p] - lx) ** 2 + (region.py[p] - ly) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    propThrough = (best + 1) / region.px.length;
  }
  return { x, y, line, block, complete, gotThrough, propThrough };
}

/**
 * Spreads the whitespace of one filled run so its text spans the run, then
 * centres it (on the final pass only). A lone non-space glyph is centred
 * instead. Updates x[start..end] in place.
 * @param {number[]} x @param {number} start @param {number} end inclusive
 * @param {string[]} txt @param {number[]} w
 * @param {number} tsw run width @param {number} tswtd width the run's glyphs take
 * @param {number} spaceW
 */
export function justifyBlock(x, start, end, txt, w, tsw, tswtd, spaceW) {
  const blockCenter = x[start] + tsw / 2;
  if (end <= start) return;
  let lo = start;
  let hi = end;
  if (txt[hi] === ' ') hi--;
  if (txt[lo] === ' ') lo++;
  const idx = [];
  for (let i = lo; i <= hi; i++) idx.push(i);
  const letters = idx.filter((i) => txt[i] !== ' ');
  if (letters.length === 1) {
    x[letters[0]] = blockCenter - w[letters[0]] / 1.5; // to accommodate pos = 4
  } else if (idx.length > 0) {
    const spaces = idx.length - letters.length;
    const perSpace = Math.max((tsw - tswtd) / spaces, -spaceW / 2); // never remove more than half a space
    let shift = 0;
    const incr = idx.map((i) => (shift += txt[i] === ' ' ? perSpace : 0));
    const moved = idx.map((i, j) => x[i] + incr[j]);
    const charCenter = x[lo] + (Math.max(...moved) - Math.min(...moved) + w[hi]) / 2;
    idx.forEach((i, j) => { x[i] = moved[j] + blockCenter - charCenter; });
  }
}

/**
 * Iterates the font size (cex) over nRounds layout passes: grow by
 * 1/sqrt(fraction of the region used) when the text fits, shrink by
 * sqrt(fraction placed) when it does not, damped by half; once both have been
 * seen, bisect. The last pass uses the fitting size that came closest to
 * filling the region, and is the only one justified.
 * @param {string[]} txt
 * @param {Region} region
 * @param {(cex: number) => Metrics} metrics
 * @param {number} initCex
 * @param {{ nRounds: number, lineHeight: number } & LayoutOptions} options
 */
export function fitTextSize(txt, region, metrics, initCex, { nRounds, lineHeight, justify, lineWidths, skipGaps, wrap = 'character' }) {
  const limit = wrap === 'word' ? wordSizeLimit(txt, metrics(1), region) : Infinity;
  let cex = Math.min(initCex, limit);
  /** @type {{ round: number, cex: number, ratio: number, complete: boolean, fraction_placed: number }[]} */
  const history = [];
  let pass;
  let m;
  for (let round = 1; ; round++) {
    m = metrics(cex);
    const widths = m.w;
    const final = round === nRounds;
    pass = (wrap === 'word' ? layoutWords : layoutPass)(txt, txt.map((c) => /** @type {number} */ (widths.get(c))), m.h * lineHeight, m.h, region,
      /** @type {number} */ (widths.get(' ')), { lineWidths, skipGaps, justify: final && justify });
    const ratio = pass.complete ? 1 / Math.sqrt(/** @type {number} */ (pass.propThrough)) + 1 / 400 : Math.sqrt(pass.gotThrough) - 1 / 400;
    history.push({ round, cex, ratio, complete: pass.complete, fraction_placed: pass.gotThrough });
    if (final) break;

    const fits = history.filter((h) => h.ratio > 1);
    const over = history.filter((h) => h.ratio < 1);
    if (wrap === 'word' && !fits.length) {
      // Whole words leave more unused shape fragments than character placement.
      // Establish a fitting lower bound promptly before spending passes on bisection.
      cex *= Math.max(0.25, 0.9 * Math.sqrt(pass.gotThrough));
    } else if (round !== 1 && fits.length && over.length) {
      cex = Math.max(...fits.map((h) => h.cex)) * 0.5 + Math.min(...over.map((h) => h.cex)) * 0.5;
    } else {
      cex = cex * ratio * 0.5 + cex * 0.5;
    }
    cex = Math.min(cex, limit);
    if (round === nRounds - 1 && fits.length) {
      // last pass: the fitting size that came closest to filling the region
      cex = fits.reduce((best, h) => (h.ratio < best.ratio ? h : best)).cex;
    }
  }
  return { pass, cex, widths: m.w, complete: pass.complete, fractionPlaced: pass.gotThrough, history };
}

/** Number of sorted values at most v (R's findInterval). @param {number[]} sorted @param {number} v */
export function countAtMost(sorted, v) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
