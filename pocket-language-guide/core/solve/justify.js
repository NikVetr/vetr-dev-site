// Flush the top and bottom of every column.
//
// The reference sheet did this with TeX glue: `plus 0.17fil` after each row,
// `0.14fil` after a table, `0.22fil` between sections. Only the ratios matter, so
// the same effect is water-filling with a per-gap ceiling: distribute the column's
// slack in proportion to each gap's stretch weight, clamp any gap that hits its
// maximum, and redistribute what is left among the rest.

/** @typedef {{natural:number, stretch:number, max:number}} Gap */

/**
 * @param {Gap[]} gaps   the interior gaps of one column, in order
 * @param {number} slack points to absorb
 * @returns {{extra:number[], residual:number}} extra height per gap, and any
 *   slack that could not be absorbed without exceeding a gap's ceiling
 */
export function distribute(gaps, slack) {
  const extra = gaps.map(() => 0);
  if (slack <= 0 || !gaps.length) return { extra, residual: Math.max(0, slack) };

  const open = new Set(gaps.map((_, i) => i).filter((i) => gaps[i].stretch > 0));
  let remaining = slack;

  while (open.size) {
    let weight = 0;
    for (const i of open) weight += gaps[i].stretch;
    if (weight <= 0) break;

    const step = remaining / weight;
    /** @type {number[]} */ const clamped = [];
    for (const i of open) {
      if (step * gaps[i].stretch > gaps[i].max) clamped.push(i);
    }
    if (!clamped.length) {
      for (const i of open) extra[i] = step * gaps[i].stretch;
      remaining = 0;
      break;
    }
    for (const i of clamped) {
      extra[i] = gaps[i].max;
      remaining -= gaps[i].max;
      open.delete(i);
    }
  }

  return { extra, residual: Math.max(0, remaining) };
}

/**
 * Absolute y offsets for a column's atoms, flush to both edges where the glue
 * allows it.
 * @param {import('./atoms.js').Atom[]} atoms  the atoms of one column, in order
 * @param {number} top      y of the column's first baseline box
 * @param {number} slack    height - natural content height
 * @returns {{offsets:number[], residual:number}}
 */
export function placeColumn(atoms, top, slack) {
  const gaps = atoms.slice(1).map((a) => a.gapBefore);
  const { extra, residual } = distribute(gaps, slack);
  /** @type {number[]} */ const offsets = [];
  let y = top;
  atoms.forEach((atom, i) => {
    if (i > 0) y += atom.gapBefore.natural + extra[i - 1];
    offsets.push(y);
    y += atom.height;
  });
  return { offsets, residual };
}
