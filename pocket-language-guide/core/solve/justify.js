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
 * How much an item may grow to bring its column to the foot of the face, as a
 * fraction of its own height.
 *
 * **The gap ceilings stay, and this is what they leave.** A gap may only stretch so
 * far because an underfull column has to stay visibly underfull rather than open into
 * a ladder of canyons, so slack past the ceilings used to sit at the foot of the
 * column and the columns of a face ended at different heights. That remainder now
 * goes into the items themselves, in equal shares -- each row a little taller, the
 * room split above and below its words, its shading and its rule moving with it -- so
 * no gap widens past its ceiling and nothing opens between two rows.
 *
 * A quarter, because that is where the two cases part. Measured over the default
 * sheets and the small cards, every column in the middle of a sheet that ended short
 * did so by at most 22% of its items' height, and most by under 10%; the columns
 * short by more were the last of a sheet, which the breaker lets run short on
 * purpose, at 36-82%. Stretching those would be the canyon again, drawn as rows.
 */
const MAX_GROW = 0.25;

/**
 * Absolute y offsets for a column's atoms, flush to both edges where the glue
 * allows it -- and, with `flush`, where its items can take the rest.
 * @param {import('./atoms.js').Atom[]} atoms  the atoms of one column, in order
 * @param {number} top      y of the column's first baseline box
 * @param {number} slack    height - natural content height
 * @param {boolean} [flush] share what the gaps cannot take between the items
 * @returns {{offsets:number[], grow:number[], residual:number, room:number}} `grow`
 *   is how much taller each atom is set; `residual` is what is still left at the
 *   foot; `room` is what the gaps could not take, which is space a row could fill
 *   whether or not the items were grown into it
 */
export function placeColumn(atoms, top, slack, flush = false) {
  const gaps = atoms.slice(1).map((a) => a.gapBefore);
  const { extra, residual: room } = distribute(gaps, slack);
  // Headings keep their size: a heading's rule sits under its title, and only rows
  // and notes have room inside them to give.
  const grown = flush
    ? distribute(atoms.map((a) => (a.kind === 'heading'
      ? { natural: a.height, stretch: 0, max: 0 }
      : { natural: a.height, stretch: 1, max: a.height * MAX_GROW })), room)
    : { extra: atoms.map(() => 0), residual: room };
  /** @type {number[]} */ const offsets = [];
  let y = top;
  atoms.forEach((atom, i) => {
    if (i > 0) y += atom.gapBefore.natural + extra[i - 1];
    offsets.push(y);
    y += atom.height + grown.extra[i];
  });
  return { offsets, grow: grown.extra, residual: grown.residual, room };
}

/**
 * An atom's paint set `extra` taller. What spans the whole atom -- its shading, its
 * accent bar, its hit box -- stretches; what sits on its foot, the rule under a row,
 * moves down with it; everything else comes down by half, so the new room is shared
 * above and below the words.
 * @param {import('./atoms.js').Paint} paint @param {number} height @param {number} extra
 * @returns {import('./atoms.js').Paint}
 */
export function grownPaint(paint, height, extra) {
  const spans = (/** @type {{y:number, h:number}} */ b) => b.y < 0.01 && Math.abs(b.h - height) < 0.01;
  const foot = (/** @type {{y:number, h:number}} */ b) => Math.abs(b.y + b.h - height) < 0.01;
  const half = extra / 2;
  return {
    rects: paint.rects.map((r) => (spans(r) ? { ...r, h: r.h + extra }
      : foot(r) ? { ...r, y: r.y + extra } : { ...r, y: r.y + half })),
    runs: paint.runs.map((r) => ({ ...r, y: r.y + half })),
    icons: paint.icons.map((i) => ({ ...i, y: i.y + half })),
    hits: paint.hits.map((h) => (spans(h) ? { ...h, h: h.h + extra } : { ...h, y: h.y + half })),
    ...(paint.paths ? { paths: paint.paths.map((p) => ({ ...p, y: p.y + half })) } : {}),
  };
}
