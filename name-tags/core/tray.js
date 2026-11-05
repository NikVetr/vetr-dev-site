// Tray geometry: where each tag sits on the laser bed (R's tray.R). All
// lengths are inches on a page [0, page w] x [0, page h] with y up. Cells are
// numbered from the bottom-left, left to right, then upwards. A regular tray
// gives grid, cell_in, spacing_in (the gap between tags; pitch = cell +
// spacing) and first_center_in (the centre of cell 1); an irregular one gives
// centers_in, one [x, y] per cell in cell order.

/**
 * @typedef {{ name?: string, page_in: number[], cell_in: number[], grid?: number[], spacing_in?: number[], first_center_in?: number[], centers_in?: number[][] }} TrayInput
 * @typedef {{ name: string, page_in: [number, number], cell_in: [number, number], centers: [number, number][], n_cells: number }} Tray
 */

export const TRAY_PRESETS = Object.freeze({
  // The big 8x8 keychain tray, rotated so tags lie landscape: 2.185 x 1.237 in
  // cutouts on a 2.893 x 1.413 in pitch; these numbers place every tag centre
  // within 0.012 in of its cutout.
  keychain_big: Object.freeze({
    page_in: [23.77, 13.0],
    grid: [8, 8],
    cell_in: [2.19, 1.22],
    spacing_in: [0.705, 0.1926],
    first_center_in: [1.7, 1.56],
  }),
});

/**
 * Cell centres of a validated tray, and the cells that extend past the page.
 * @param {TrayInput} t
 * @returns {{ tray: Tray, outside: number[] }}
 */
export function trayGeometry(t) {
  const [cw, ch] = t.cell_in;
  /** @type {[number, number][]} */
  let centers;
  if (t.centers_in) {
    centers = t.centers_in.map(([x, y]) => [x, y]);
  } else {
    const [nx, ny] = /** @type {number[]} */ (t.grid);
    const [sx, sy] = /** @type {number[]} */ (t.spacing_in);
    const [fx, fy] = /** @type {number[]} */ (t.first_center_in);
    centers = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) centers.push([i * (cw + sx) + fx, j * (ch + sy) + fy]);
  }
  const [pw, ph] = t.page_in;
  const outside = centers.flatMap(([x, y], k) => (x - cw / 2 < 0 || x + cw / 2 > pw || y - ch / 2 < 0 || y + ch / 2 > ph ? [k + 1] : []));
  return {
    tray: { name: t.name ?? 'custom', page_in: [pw, ph], cell_in: [cw, ch], centers, n_cells: centers.length },
    outside,
  };
}

/**
 * Which sheet and cell each name goes to: in order, continuing on further
 * sheets, or as `cells` says, a new sheet starting whenever a cell repeats.
 * @param {number} nNames @param {number} nCells @param {number[] | null} cells 1-based
 * @returns {{ sheet: number, cell: number }[]}
 */
export function assignCells(nNames, nCells, cells) {
  if (!cells) return Array.from({ length: nNames }, (_, i) => ({ sheet: Math.floor(i / nCells) + 1, cell: (i % nCells) + 1 }));
  let sheet = 1;
  let used = new Set();
  return cells.map((cell) => {
    if (used.has(cell)) {
      sheet++;
      used = new Set();
    }
    used.add(cell);
    return { sheet, cell };
  });
}
