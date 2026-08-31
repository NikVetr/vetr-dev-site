// Shared search over column-width fractions.
//
// Both width problems in the sheet reduce to "split an available width among n
// columns to minimise a cost": the per-row adaptive split of a phrase entry, and
// the widths shared across all rows of a reference table. They differ only in the
// cost function, so the search lives here once.

/**
 * Per-column floors and a shared ceiling, as fractions of the usable width.
 * `min` is per column because a column can never be narrower than its own widest
 * unbreakable word without overflowing.
 * @typedef {{min:number[], max:number, usable:number, step?:number}} Bounds
 */

/**
 * Exhaustive scan for two columns. The reference sheet searched a fixed grid of
 * 27 candidate fractions; matching that grid is what makes its look reproducible.
 * @param {(fractions:number[])=>number} cost
 * @param {Bounds} bounds
 * @returns {number[]}
 */
export function searchPair(cost, bounds) {
  const step = bounds.step ?? 0.02;
  const lo = bounds.min[0];
  const hi = Math.min(bounds.max, bounds.usable - bounds.min[1]);
  let best = [bounds.usable / 2, bounds.usable / 2];
  let bestCost = Infinity;
  for (let f = lo; f <= hi + 1e-9; f += step) {
    const candidate = [f, bounds.usable - f];
    const c = cost(candidate);
    if (c < bestCost) {
      bestCost = c;
      best = candidate;
    }
  }
  return best;
}

/**
 * Coordinate descent for three or more columns: repeatedly shift a step of width
 * from one column to another while that helps, halving the step when it stops.
 * Deterministic -- fixed iteration order, no randomness -- so the same input
 * always produces the same sheet.
 * @param {number[]} initial  fractions summing to `bounds.usable`
 * @param {(fractions:number[])=>number} cost
 * @param {Bounds} bounds
 * @returns {number[]}
 */
export function descend(initial, cost, bounds) {
  const n = initial.length;
  let current = initial.slice();
  let currentCost = cost(current);
  let step = bounds.usable * 0.08;
  const floor = bounds.usable * 0.004;

  while (step > floor) {
    let improved = false;
    for (let a = 0; a < n; a += 1) {
      for (let b = 0; b < n; b += 1) {
        if (a === b) continue;
        if (current[a] - step < bounds.min[a] || current[b] + step > bounds.max) continue;
        const trial = current.slice();
        trial[a] -= step;
        trial[b] += step;
        const c = cost(trial);
        if (c < currentCost - 1e-9) {
          current = trial;
          currentCost = c;
          improved = true;
        }
      }
    }
    if (!improved) step /= 2;
  }
  return current;
}

/**
 * Fractions proportional to natural widths, then repaired so every column meets
 * its floor. Used as a descent seed and as the reference point the cost functions
 * pull toward, so a column never ends up far narrower than its content wants
 * without a reason.
 * @param {number[]} naturals
 * @param {Bounds} bounds
 * @returns {number[]}
 */
export function proportional(naturals, bounds) {
  const total = naturals.reduce((a, b) => a + b, 0);
  const n = naturals.length;
  const raw = total > 0
    ? naturals.map((w) => (w / total) * bounds.usable)
    : naturals.map(() => bounds.usable / n);
  return repair(raw, bounds);
}

/**
 * Nearest valid split: lift every column to its floor, cap at the ceiling, and
 * take the difference from whichever columns have room above their floor. If the
 * floors alone exceed the usable width -- an unbreakable word wider than its
 * share -- they are scaled down together, because something has to overflow and
 * spreading it is the least bad option.
 * @param {number[]} fractions
 * @param {Bounds} bounds
 * @returns {number[]}
 */
export function repair(fractions, bounds) {
  const floors = bounds.min;
  const needed = floors.reduce((a, b) => a + b, 0);
  if (needed > bounds.usable) {
    const k = bounds.usable / needed;
    return floors.map((f) => f * k);
  }

  const out = fractions.map((f, i) => Math.min(bounds.max, Math.max(floors[i], f)));
  for (let pass = 0; pass < 8; pass += 1) {
    const excess = out.reduce((a, b) => a + b, 0) - bounds.usable;
    if (Math.abs(excess) < 1e-9) break;
    const room = out.map((f, i) => (excess > 0 ? f - floors[i] : bounds.max - f));
    const slack = room.reduce((a, b) => a + b, 0);
    if (slack <= 1e-9) break;
    for (let i = 0; i < out.length; i += 1) out[i] -= (excess * room[i]) / slack;
  }
  return out;
}
