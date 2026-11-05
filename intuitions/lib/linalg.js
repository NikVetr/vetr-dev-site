// Small dense linear algebra for the gallery: vector helpers and the eigen-
// decomposition of a symmetric matrix. Matrices are arrays of rows. Sizes here are
// tens of rows at most, so clarity beats speed.

/** @typedef {number[]} Vector */
/** @typedef {number[][]} Matrix */

/** @param {Vector} a @param {Vector} b */
export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** @param {Vector} a */
export const norm = (a) => Math.sqrt(dot(a, a));

/** @param {Vector} a @param {number} k */
export const scale = (a, k) => a.map((x) => x * k);

/** a + k·b. @param {Vector} a @param {Vector} b @param {number} [k] */
export const addScaled = (a, b, k = 1) => a.map((x, i) => x + k * b[i]);

/** @param {Vector} a */
export const normalize = (a) => scale(a, 1 / norm(a));

/**
 * Cross product of two 3-vectors.
 * @param {Vector} a @param {Vector} b
 * @returns {[number, number, number]}
 */
export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** @param {Matrix} m @param {Vector} v */
export const matVec = (m, v) => m.map((row) => dot(row, v));

/**
 * Eigenvalues and eigenvectors of a symmetric matrix by cyclic Jacobi rotations,
 * accurate to rounding. Values are sorted from largest to smallest;
 * vectors[k] is the unit eigenvector for values[k].
 * @param {Matrix} matrix symmetric
 * @returns {{ values: number[], vectors: Vector[] }}
 */
export function symmetricEigen(matrix) {
  const n = matrix.length;
  const a = matrix.map((row) => [...row]);
  /** @type {Matrix} */
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  let total = 0;
  for (const row of a) for (const x of row) total += x * x;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off <= 1e-32 * total) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (apq === 0) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let r = 0; r < n; r++) {
          const arp = a[r][p];
          const arq = a[r][q];
          a[r][p] = c * arp - s * arq;
          a[r][q] = s * arp + c * arq;
        }
        for (let r = 0; r < n; r++) {
          const apr = a[p][r];
          const aqr = a[q][r];
          a[p][r] = c * apr - s * aqr;
          a[q][r] = s * apr + c * aqr;
        }
        for (let r = 0; r < n; r++) {
          const vrp = v[r][p];
          const vrq = v[r][q];
          v[r][p] = c * vrp - s * vrq;
          v[r][q] = s * vrp + c * vrq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => v.map((row) => row[i])) };
}
