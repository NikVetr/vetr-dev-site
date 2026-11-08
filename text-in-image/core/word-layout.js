// Whole-word placement is separate from the character fitter's R-compatible rules.
// A word must fit a single connected run; spaces may stretch, letters never do.
import { lineColumns } from './region.js';

/** Largest possible size of the longest word, even on a single pixel row.
 * @param {string[]} txt @param {import('./layout.js').Metrics} metrics @param {import('./region.js').Region} region
 */
export function wordSizeLimit(txt, metrics, region) {
  let longest = 0, word = 0, widest = 0;
  for (const char of [...txt, ' ']) {
    if (/\s/.test(char)) { longest = Math.max(longest, word); word = 0; }
    else word += /** @type {number} */ (metrics.w.get(char));
  }
  for (const row of region.nonempty) {
    let run = 0;
    for (let c = 0; c < region.width; c++) {
      run = region.hits[row * region.width + c] ? run + 1 : 0;
      widest = Math.max(widest, run);
    }
  }
  return longest > 0 ? widest / region.width / longest : Infinity;
}

/** @param {string[]} txt @param {number[]} w @param {number} lineH @param {number} textH
 * @param {import('./region.js').Region} region @param {number} spaceW
 * @param {import('./layout.js').LayoutOptions} options @returns {import('./layout.js').Pass}
 */
export function layoutWords(txt, w, lineH, textH, region, spaceW, { lineWidths, skipGaps, justify }) {
  const n = txt.length;
  /** @type {(number|null)[]} */
  const x = new Array(n).fill(null), y = x.slice(), line = x.slice(), block = x.slice();
  const minY = region.nonemptyY.at(-1) ?? 0;
  let cy = region.nonemptyY[0] - (lineWidths === 'band' ? 2 * textH / 3 : 0);
  let lineI = 1, runI = 0, cx = 0, lineUsed = false;
  /** @type {{left:number,width:number}[]} */
  let runs = [];
  /** @type {number[]} */
  let used = [];
  /** @type {number|null} */
  let pendingSpace = null;
  let lastX = region.px[0], lastY = region.py[0];
  const readRuns = () => {
    const columns = lineColumns(region, cy, lineWidths, textH, skipGaps);
    runs = [];
    for (let first = 0; first < columns.length;) {
      let end = first + 1;
      while (end < columns.length && columns[end] === columns[end - 1] + 1) end++;
      runs.push({ left: (columns[first] + 1) / region.width, width: (end - first) / region.width });
      first = end;
    }
    runI = 0;
    cx = runs[0]?.left ?? 0;
  };
  const closeRun = () => {
    if (justify && used.length && runs[runI]) {
      const spaces = used.filter(i => txt[i] === ' ');
      const slack = Math.max(0, runs[runI].left + runs[runI].width - cx);
      let shift = spaces.length ? 0 : slack / 2;
      for (const i of used) {
        x[i] = /** @type {number} */ (x[i]) + shift;
        if (txt[i] === ' ') shift += slack / spaces.length;
      }
    }
    used = [];
    pendingSpace = null;
  };
  const nextLine = (explicit = false) => {
    closeRun();
    // An empty narrow band is scanned one row at a time until the whole word fits.
    cy -= lineUsed || explicit ? Math.max(lineH, region.pxlh) : region.pxlh;
    if (lineUsed || explicit) lineI++;
    lineUsed = false;
    if (cy >= minY - 1e-9) readRuns(); else runs = [];
  };
  const place = (/** @type {number} */ i, /** @type {number} */ at = cx) => {
    x[i] = at; y[i] = cy; line[i] = lineI; block[i] = runI + 1;
  };
  readRuns();
  let i = 0;
  while (i < n) {
    if (/\s/.test(txt[i])) {
      // Whitespace has an anchor for consistent character counts, but no ink.
      x[i] = lastX; y[i] = lastY; line[i] = lineI; block[i] = runI + 1;
      if (txt[i] === '\n') nextLine(true); else pendingSpace = i;
      i++;
      continue;
    }
    let end = i + 1;
    while (end < n && !/\s/.test(txt[end])) end++;
    const wordWidth = w.slice(i, end).reduce((sum, value) => sum + value, 0);
    let found = false;
    while (cy >= minY - 1e-9) {
      const prefix = used.length && pendingSpace !== null ? spaceW : 0;
      if (runs[runI] && cx + prefix + wordWidth <= runs[runI].left + runs[runI].width + 1e-12) { found = true; break; }
      closeRun();
      if (++runI < runs.length) cx = runs[runI].left; else nextLine();
    }
    if (!found) break; // no part of an unfit word is placed
    if (used.length && pendingSpace !== null) {
      place(pendingSpace); used.push(pendingSpace); cx += spaceW;
    }
    pendingSpace = null;
    for (; i < end; i++) { place(i); used.push(i); lastX = cx; lastY = cy; cx += w[i]; }
    lineUsed = true;
  }
  closeRun();
  const complete = i === n;
  let propThrough = null;
  if (complete) {
    let best = 0, distance = Infinity;
    for (let p = 0; p < region.px.length; p++) {
      const d = (region.px[p] - lastX) ** 2 + (region.py[p] - lastY) ** 2;
      if (d < distance) { best = p; distance = d; }
    }
    propThrough = (best + 1) / region.px.length;
  }
  return { x, y, line, block, complete, gotThrough: i / n, propThrough };
}
