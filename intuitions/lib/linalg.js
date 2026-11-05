// Small dense linear algebra for the gallery: vector helpers, the eigen-
// decomposition of a symmetric matrix (up to a few hundred rows), the Cholesky factor of
// a positive-definite one, and a linear solve. Matrices are arrays of rows.

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
 * Householder reduction of a symmetric matrix to tridiagonal form (tred2 of EISPACK,
 * as in JAMA). Returns the diagonal, the subdiagonal (sub[i] = T[i][i − 1], sub[0] = 0)
 * and, with `vectors`, the orthogonal matrix that carries T back to the matrix.
 * @param {ArrayLike<number>[]} matrix symmetric, n × n
 * @param {boolean} vectors
 */
function tridiagonalize(matrix, vectors) {
  const n = matrix.length;
  const V = Array.from({ length: n }, (_, i) => Float64Array.from(matrix[i]));
  const d = Float64Array.from(V[n - 1]);
  const e = new Float64Array(n);
  for (let i = n - 1; i > 0; i--) {
    let scale = 0;
    let h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) {
        d[j] = V[i - 1][j];
        V[i][j] = 0;
        V[j][i] = 0;
      }
    } else {
      for (let k = 0; k < i; k++) {
        d[k] /= scale;
        h += d[k] * d[k];
      }
      let f = d[i - 1];
      let g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g;
      h -= f * g;
      d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j];
        V[j][i] = f;
        g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) {
          g += V[k][j] * d[k];
          e[k] += V[k][j] * f;
        }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) {
        e[j] /= h;
        f += e[j] * d[j];
      }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j];
        g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
        d[j] = V[i - 1][j];
        V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  if (!vectors) {
    // T's diagonal is left on V's; the last entry is never touched.
    for (let i = 0; i < n; i++) d[i] = V[i][i];
    e[0] = 0;
    return { d, e, V: null };
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i];
    V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) {
    d[j] = V[n - 1][j];
    V[n - 1][j] = 0;
  }
  V[n - 1][n - 1] = 1;
  e[0] = 0;
  return { d, e, V };
}

/**
 * Eigenvalues of a symmetric tridiagonal matrix by the implicit QL method (tql2), in
 * place on d; with V, its columns are turned into the eigenvectors.
 * @param {Float64Array} d diagonal @param {Float64Array} e subdiagonal, e[i] = T[i][i − 1] @param {Float64Array[] | null} V
 */
function tridiagonalQL(d, e, V) {
  const n = d.length;
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0;
  let tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n - 1 && Math.abs(e[m]) > eps * tst1) m++;
    if (m > l) {
      for (let iter = 0; iter < 100; iter++) {
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = Math.sqrt(p * p + 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r);
        d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1;
        let c2 = c;
        let c3 = c;
        const el1 = e[l + 1];
        let s = 0;
        let s2 = 0;
        for (let i = m - 1; i >= l; i--) {
          c3 = c2;
          c2 = c;
          s2 = s;
          g = c * e[i];
          h = c * p;
          r = Math.sqrt(p * p + e[i] * e[i]);
          e[i + 1] = s * r;
          s = e[i] / r;
          c = p / r;
          p = c * d[i] - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]);
          if (V) {
            for (let k = 0; k < n; k++) {
              const row = V[k];
              h = row[i + 1];
              row[i + 1] = s * row[i] + c * h;
              row[i] = c * row[i] - s * h;
            }
          }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1;
        e[l] = s * p;
        d[l] = c * p;
        if (!(Math.abs(e[l]) > eps * tst1)) break;
      }
    }
    d[l] += f;
    e[l] = 0;
  }
}

/**
 * Eigenvalues and eigenvectors of a symmetric matrix: Householder reduction to
 * tridiagonal form, then the implicit QL method, accurate to rounding and fast enough
 * for a few hundred rows. Values are sorted from largest to smallest; vectors[k] is
 * the unit eigenvector for values[k].
 * @param {ArrayLike<number>[]} matrix symmetric
 * @returns {{ values: number[], vectors: Vector[] }}
 */
export function symmetricEigen(matrix) {
  const n = matrix.length;
  const { d, e, V } = tridiagonalize(matrix, true);
  tridiagonalQL(d, e, V);
  const v = /** @type {Float64Array[]} */ (V);
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => d[j] - d[i]);
  return { values: order.map((i) => d[i]), vectors: order.map((i) => v.map((row) => row[i])) };
}

/**
 * The eigenvalues alone, largest first, which skips accumulating the vectors (about a
 * third of the work of symmetricEigen).
 * @param {ArrayLike<number>[]} matrix symmetric
 * @returns {Float64Array}
 */
export function symmetricEigenvalues(matrix) {
  const { d, e } = tridiagonalize(matrix, false);
  tridiagonalQL(d, e, null);
  return d.sort().reverse();
}

/**
 * Solves A x = b for a small square matrix by Gaussian elimination with partial
 * pivoting. Returns null when A is singular to working precision.
 * @param {Matrix} matrix @param {Vector} rhs
 * @returns {Vector | null}
 */
export function solve(matrix, rhs) {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  const size = Math.max(1e-300, ...matrix.flat().map(Math.abs));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) <= 1e-13 * size) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / a[col][col];
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = a[r][n];
    for (let c = r + 1; c < n; c++) sum -= a[r][c] * x[c];
    x[r] = sum / a[r][r];
  }
  return x;
}

/**
 * The lower-triangular Cholesky factor L of a symmetric positive-definite matrix
 * (A = L Lᵀ), or null when a pivot is not positive (the matrix is not positive definite
 * to working precision).
 * @param {ArrayLike<number>[]} matrix symmetric
 * @returns {Matrix | null}
 */
export function cholesky(matrix) {
  const n = matrix.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    let d = matrix[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    if (!(d > 1e-14 * Math.abs(matrix[j][j]))) return null;
    L[j][j] = Math.sqrt(d);
    for (let i = j + 1; i < n; i++) {
      let s = matrix[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / L[j][j];
    }
  }
  return L;
}
