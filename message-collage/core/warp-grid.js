// Open-uniform cubic B-splines form a C2 partition of unity. Neighboring controls
// can therefore translate a region together without adding artificial stretch.
/** @typedef {{x:number,y:number,dx:number,dy:number}} Node */
/** @typedef {{width:number,height:number,cellsX:number,cellsY:number,columns:number,rows:number,knotsX:number[],knotsY:number[],nodes:Node[]}} Grid */

/** @param {number} cells */
const knots = cells => [0, 0, 0, 0, ...Array.from({length: cells - 1}, (_, i) => i + 1), cells, cells, cells, cells];

/** @param {number} width @param {number} height @returns {Grid} */
export function createWarpGrid(width, height) {
  const cellsX = 12, cellsY = 10, columns = cellsX + 3, rows = cellsY + 3;
  const knotsX = knots(cellsX), knotsY = knots(cellsY);
  // Greville positions describe each control's location. All controls, including
  // edge controls, may move; the text itself is checked against the fixed card.
  const nodes = Array.from({length: columns * rows}, (_, i) => {
    const x = i % columns, y = Math.floor(i / columns);
    return {x: (knotsX[x + 1] + knotsX[x + 2] + knotsX[x + 3]) / 3 / cellsX * width,
      y: (knotsY[y + 1] + knotsY[y + 2] + knotsY[y + 3]) / 3 / cellsY * height, dx: 0, dy: 0};
  });
  return {width, height, cellsX, cellsY, columns, rows, knotsX, knotsY, nodes};
}

/** Cubic basis values and their physical derivatives, including the one-sided
 * endpoint limit. @param {number} x @param {number} extent @param {number[]} knots
 */
function splineBasis(x, extent, knots) {
  const cells = knots.at(-1) ?? 0;
  const t = Math.min(cells - 1e-12, Math.max(0, x / extent * cells));
  /** @type {number[]} */ let basis = knots.slice(0, -1).map((v, i) => v <= t && t < knots[i + 1] ? 1 : 0);
  /** @type {number[]} */ let quadratic = [];
  for (let degree = 1; degree <= 3; degree++) {
    basis = Array.from({length: basis.length - 1}, (_, i) => {
      const left = knots[i + degree] - knots[i], right = knots[i + degree + 1] - knots[i + 1];
      return (left ? (t - knots[i]) / left * basis[i] : 0) + (right ? (knots[i + degree + 1] - t) / right * basis[i + 1] : 0);
    });
    if (degree === 2) quadratic = basis;
  }
  return basis.map((value, i) => {
    const left = knots[i + 3] - knots[i], right = knots[i + 4] - knots[i + 1];
    return [value, 3 * cells / extent * ((left ? quadratic[i] / left : 0) - (right ? quadratic[i + 1] / right : 0))];
  });
}

/** Sparse tensor-product weights: value, x derivative, y derivative.
 * @param {Grid} grid @param {[number,number]} point
 */
export function gridWeights(grid, [x, y]) {
  const bx = splineBasis(x, grid.width, grid.knotsX), by = splineBasis(y, grid.height, grid.knotsY);
  return grid.nodes.flatMap((_, j) => {
    const [vx, dx] = bx[j % grid.columns], [vy, dy] = by[Math.floor(j / grid.columns)];
    const b = [vx * vy, dx * vy, vx * dy];
    return b.some(v => v !== 0) ? [{j, b}] : [];
  });
}

/** A global bound on ||D(displacement)||₂. Each derivative is a convex combination
 * of adjacent control differences (the derivative B-spline coefficients). The
 * largest absolute coefficient bounds that matrix entry everywhere, not only at
 * glyph centres. Bounding both matrix 1- and infinity-norms also bounds the 2-norm.
 * A value below one makes identity + displacement injective on the entire card.
 * @param {Grid} grid
 */
export function gridGradientBound(grid) {
  const {nodes, columns, rows, knotsX, knotsY, cellsX, cellsY, width, height} = grid;
  let xx = 0, xy = 0, yx = 0, yy = 0;
  nodes.forEach((node, i) => {
    const x = i % columns, y = Math.floor(i / columns);
    if (x < columns - 1) {
      const factor = 3 * cellsX / width / (knotsX[x + 4] - knotsX[x + 1]), other = nodes[i + 1];
      xx = Math.max(xx, Math.abs(node.dx - other.dx) * factor);
      yx = Math.max(yx, Math.abs(node.dy - other.dy) * factor);
    }
    if (y < rows - 1) {
      const factor = 3 * cellsY / height / (knotsY[y + 4] - knotsY[y + 1]), other = nodes[i + columns];
      xy = Math.max(xy, Math.abs(node.dx - other.dx) * factor);
      yy = Math.max(yy, Math.abs(node.dy - other.dy) * factor);
    }
  });
  return Math.max(xx + xy, yx + yy, xx + yx, xy + yy);
}
