// Column widths inside an item -- the port of the reference sheet's
// \cheat_choose_split, generalised.
//
// Each item is a small grid. Fields stacked in the same grid column share a width.
// Phrase rows solve that split per row, so a long phrase can borrow width from a
// short gloss; reference tables solve one split for the whole group, which is what
// the reference achieved with eight hand-tuned `\reftable*` variants.
//
// The reference's objective is reproduced: dominate on the taller side's height,
// then on imbalance, then on total ink, then nudge toward the natural width ratio.

import { isTargetSide } from '../fonts.js';
import { searchPair, descend, proportional, repair } from './fractions.js';

const W_TALLEST = 10000;
const W_IMBALANCE = 20;
const W_TOTAL = 4;

// Height is a step function of width, so plain descent stalls on plateaus. This
// term -- bounded by the column count, and worth far less than one line of text --
// orders otherwise-equal splits by how much width each column still wants, giving
// the search a direction to move in.
const W_SHORTFALL = 120;

// Once a row is two lines tall because its gloss wrapped, narrowing the other
// columns costs nothing, and the solver will happily squeeze the target script to
// a couple of characters. Wrapping is not equally acceptable everywhere: the
// target language's own writing is what the reader points at, so it resists
// wrapping harder than an English gloss does. Weighted well below one line of
// height, this only ever breaks ties -- it never makes the sheet taller.
const W_WRAP = 200;
const AVERSION_TARGET = 3;
const AVERSION_SOURCE = 1;

/** @param {Cell} cell */
function aversion(cell) {
  return isTargetSide(cell.fs.field) ? AVERSION_TARGET : AVERSION_SOURCE;
}

/**
 * @typedef {Object} Cell
 * @property {string} text
 * @property {import('../measure.js').RunStyle} style
 * @property {import('../types.js').FieldStyle} fs
 */

/** @typedef {ReturnType<import('../measure.js').createMeasurer>} Measurer */

/**
 * @typedef {Object} SplitResult
 * @property {number[]} widths   points, per grid column
 * @property {number} height     tallest column, in points
 */

/**
 * Fractional floor per grid column: no column may be narrower than its own widest
 * unbreakable word. Without this a long gloss like "Wednesday" has nowhere to go
 * and simply overflows into its neighbour.
 * @param {Cell[][]} columns @param {number} avail @param {Measurer} measurer
 */
function floors(columns, avail, measurer) {
  return columns.map((cells) => Math.min(
    0.6,
    Math.max(0.02, ...cells.map((c) => measurer.maxAtomWidth(c.text, c.style) / avail)),
  ));
}

/** @param {Cell[][]} columns @param {Measurer} measurer */
function naturalWidths(columns, measurer) {
  return columns.map((cells) => Math.max(0, ...cells.map((c) => measurer.width(c.text, c.style))));
}

/**
 * How far each column falls short of the width its content wants, normalised so
 * the term stays bounded regardless of type scale.
 * @param {number[]} fractions @param {number[]} naturals @param {number} avail
 */
function shortfall(fractions, naturals, avail) {
  let total = 0;
  for (let j = 0; j < fractions.length; j += 1) {
    if (naturals[j] <= 0) continue;
    total += Math.max(0, naturals[j] - fractions[j] * avail) / naturals[j];
  }
  return total;
}

/**
 * @param {Cell[][]} columns  cells stacked in each grid column
 * @param {number} avail      content width in points, gutters already removed
 * @param {{minFrac:number, maxFrac:number}} template
 * @param {Measurer} measurer
 * @returns {SplitResult}
 */
export function chooseSplit(columns, avail, template, measurer) {
  const live = columns.map((cells) => cells.filter((c) => c.text !== ''));
  const naturals = naturalWidths(live, measurer);
  const bounds = {
    min: floors(live, avail, measurer).map((f) => Math.max(f, template.minFrac)),
    max: template.maxFrac,
    usable: 1,
  };
  const target = proportional(naturals, bounds);

  // One pass per candidate: heights and wrap aversion come out of the same line
  // counts, because line counting is the hot path in the whole engine.
  /** @param {number[]} fractions */
  const measure = (fractions) => {
    const heights = live.map((cells, j) => {
      let h = 0;
      for (const c of cells) h += measurer.lineCount(c.text, fractions[j] * avail, c.style) * c.style.leading;
      return h;
    });
    let wrap = 0;
    live.forEach((cells, j) => {
      for (const c of cells) {
        const extra = measurer.lineCount(c.text, fractions[j] * avail, c.style) - 1;
        if (extra > 0) wrap += extra * aversion(c);
      }
    });
    return { heights, wrap };
  };

  /** @param {number[]} fractions */
  const cost = (fractions) => {
    const { heights, wrap } = measure(fractions);
    const tallest = Math.max(...heights);
    const shortest = Math.min(...heights);
    const total = heights.reduce((a, b) => a + b, 0);
    const drift = fractions.reduce((d, f, j) => d + Math.abs(f - target[j]), 0);
    return tallest * W_TALLEST + (tallest - shortest) * W_IMBALANCE + total * W_TOTAL
      + wrap * W_WRAP + shortfall(fractions, naturals, avail) * W_SHORTFALL + drift;
  };

  const fractions = solveFractions(live.length, target, cost, bounds);
  return {
    widths: fractions.map((f) => f * avail),
    height: Math.max(0, ...measure(fractions).heights),
  };
}

/**
 * One split shared by every row of a group. Minimises the table's real height --
 * each row is as tall as its tallest cell -- rather than any single cell's wrap.
 * @param {Cell[][][]} rows   rows -> grid columns -> cells
 * @param {number} avail
 * @param {{minFrac:number, maxFrac:number}} template
 * @param {Measurer} measurer
 * @returns {{widths:number[], height:number, rowHeights:number[]}}
 */
export function chooseSharedWidths(rows, avail, template, measurer) {
  const cols = rows[0].length;
  /** @type {Cell[][]} */
  const pooled = Array.from(
    { length: cols },
    (_, j) => rows.flatMap((row) => row[j]).filter((c) => c.text !== ''),
  );
  const naturals = naturalWidths(pooled, measurer);
  const bounds = {
    min: floors(pooled, avail, measurer).map((f) => Math.max(f, template.minFrac)),
    max: template.maxFrac,
    usable: 1,
  };
  const seed = proportional(naturals, bounds);

  // A row is as tall as its tallest cell; heights and wrap aversion share one
  // pass over the line counts, which is the engine's hot path.
  /** @param {number[]} fractions */
  const measure = (fractions) => {
    /** @type {number[]} */ const rowHeights = [];
    let wrap = 0;
    for (const row of rows) {
      let tallest = 0;
      row.forEach((cells, j) => {
        for (const c of cells) {
          if (c.text === '') continue;
          const lines = measurer.lineCount(c.text, fractions[j] * avail, c.style);
          tallest = Math.max(tallest, lines * c.style.leading);
          if (lines > 1) wrap += (lines - 1) * aversion(c);
        }
      });
      rowHeights.push(tallest);
    }
    return { rowHeights, wrap };
  };

  /** @param {number[]} fractions */
  const cost = (fractions) => {
    const { rowHeights, wrap } = measure(fractions);
    return rowHeights.reduce((a, b) => a + b, 0) * W_TALLEST + wrap * W_WRAP
      + shortfall(fractions, naturals, avail) * W_SHORTFALL
      + fractions.reduce((d, f, j) => d + Math.abs(f - seed[j]), 0);
  };

  const fractions = solveFractions(cols, seed, cost, bounds);
  const { rowHeights } = measure(fractions);
  return {
    widths: fractions.map((f) => f * avail),
    height: rowHeights.reduce((a, b) => a + b, 0),
    rowHeights,
  };
}

/**
 * Two columns are searched exhaustively on the reference's fraction grid. Three or
 * more use coordinate descent from two seeds -- proportional and even -- because
 * the cost surface is a step function and a single start can settle on a plateau.
 * @param {number} n
 * @param {number[]} seed
 * @param {(fractions:number[])=>number} cost
 * @param {import('./fractions.js').Bounds} bounds
 */
function solveFractions(n, seed, cost, bounds) {
  if (n <= 1) return [bounds.usable];
  if (n === 2) return searchPair(cost, bounds);

  const even = repair(Array.from({ length: n }, () => bounds.usable / n), bounds);
  let best = seed;
  let bestCost = Infinity;
  for (const start of [seed, even]) {
    const result = descend(start, cost, bounds);
    const c = cost(result);
    if (c < bestCost) {
      bestCost = c;
      best = result;
    }
  }
  return best;
}
