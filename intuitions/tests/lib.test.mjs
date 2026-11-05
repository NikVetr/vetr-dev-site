import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bvnRectangle, bvnUpper, dbvnorm, pbvnorm } from '../lib/bvn.js';
import { formatNumber, formatRatio, formatShare } from '../lib/format.js';
import { dnorm, pnorm, pnormInterval, pnormUpper, qnorm, standardNormal } from '../lib/normal.js';
import { mulberry32 } from '../../shared/rng.js';
import { niceTicks, scaleLinear, scaleLog } from '../lib/plot.js';
import { arcPoints, orientation, project, quatFromAxisAngle, quatMultiply, renderScene, rotateVector, sphereOutline, turn } from '../lib/geom3d.js';
import { cholesky, cross, dot, symmetricEigen } from '../lib/linalg.js';

const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-14) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('normal functions: known values, symmetry and far tails', () => {
  close(pnorm(0), 0.5, 0);
  close(pnorm(1.959963984540054), 0.975);
  close(qnorm(0.975), 1.959963984540054);
  close(dnorm(0), 1 / Math.sqrt(2 * Math.PI), 1e-16);
  close(pnorm(3, 1, 2), pnorm(1));
  // Upper tails are not 1 - p: they keep relative precision far out.
  assert.ok(Math.abs(pnormUpper(10) / 7.619853024160527e-24 - 1) < 1e-13);
  assert.equal(1 - pnorm(10), 0);
  for (const p of [1e-12, 0.01, 0.3, 0.5, 0.9, 0.999999]) close(pnorm(qnorm(p)), p, p * 1e-13 + 1e-16);
  assert.equal(qnorm(0), -Infinity);
  assert.equal(qnorm(1), Infinity);
  assert.ok(Number.isNaN(qnorm(1.5)));
});

test('pnormInterval picks the stable tail and handles infinite bounds', () => {
  close(pnormInterval(-Infinity, Infinity), 1, 0);
  close(pnormInterval(-1, 1), 0.6826894921370859);
  assert.ok(Math.abs(pnormInterval(9, 10) / (pnormUpper(9) - pnormUpper(10)) - 1) < 1e-14);
  assert.equal(pnormInterval(2, 1), 0);
  close(pnormInterval(0, Infinity, 1, 2), pnorm(0.5));
});

test('bivariate normal: closed forms at r = 0, ±1 and median orthants', () => {
  close(pbvnorm(0.3, -0.7, 0), pnorm(0.3) * pnorm(-0.7));
  close(pbvnorm(0.3, -0.7, 1), pnorm(-0.7));
  close(pbvnorm(0.3, -0.7, -1), 0, 0);
  close(pbvnorm(0.8, 0.5, -1), pnorm(0.8) - pnorm(-0.5));
  for (const r of [-0.95, -0.5, 0.2, 0.93, 0.999]) close(pbvnorm(0, 0, r), 0.25 + Math.asin(r) / (2 * Math.PI));
  close(bvnUpper(-Infinity, 1, 0.4), pnorm(-1));
  close(bvnUpper(Infinity, 1, 0.4), 0, 0);
  // Cells of a grid sum to 1.
  const edges = [-Infinity, -0.4, 0.9, Infinity];
  for (const r of [-0.99, 0, 0.6, 0.9999]) {
    let total = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) total += bvnRectangle([edges[i], edges[j]], [edges[i + 1], edges[j + 1]], r);
    close(total, 1, 1e-14);
  }
  close(dbvnorm(0, 0, 0), 1 / (2 * Math.PI));
});

test('the density is the derivative of the CDF in r (Plackett)', () => {
  for (const [h, k, r] of [[0.3, -0.5, 0.2], [1.2, 0.4, -0.7], [-0.6, -0.9, 0.95]]) {
    const step = 1e-6;
    close((pbvnorm(h, k, r + step) - pbvnorm(h, k, r - step)) / (2 * step), dbvnorm(h, k, r), 1e-8);
  }
});

test('seeded RNG is reproducible and its normals are standard', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const rng = mulberry32(7);
  const n = 40000;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const z = standardNormal(rng);
    assert.ok(Number.isFinite(z));
    sum += z;
    sumSq += z * z;
  }
  assert.ok(Math.abs(sum / n) < 4 / Math.sqrt(n));
  assert.ok(Math.abs(sumSq / n - 1) < 4 * Math.sqrt(2 / n));
});

test('formatting', () => {
  assert.equal(formatShare(0.0124193), '1.24%');
  assert.equal(formatShare(0.5), '50.0%');
  assert.equal(formatShare(0), '0%');
  assert.equal(formatShare(3.1e-7), '3.1 × 10⁻⁵%');
  assert.equal(formatNumber(-0.5), '−0.50');
  assert.equal(formatNumber(-0.001), '0.00');
  assert.equal(formatRatio(1.9234), '×1.92');
});

test('scales and ticks', () => {
  const x = scaleLinear([0, 10], [0, 100]);
  assert.equal(x(5), 50);
  assert.equal(x.invert(25), 2.5);
  assert.deepEqual(niceTicks(0, 1, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(niceTicks(-2.8, 2.8, 6), [-2, -1, 0, 1, 2]);
  const y = scaleLog([1e-4, 1], [100, 0]);
  close(y(1e-2), 50);
  close(y.invert(50), 1e-2);
});

test('symmetric eigen-decomposition reconstructs the matrix with orthonormal vectors', () => {
  const A = [[4, 1, -2, 0.5], [1, 3, 0, 1], [-2, 0, 5, -1], [0.5, 1, -1, 2]];
  const { values, vectors } = symmetricEigen(A);
  for (let i = 1; i < values.length; i++) assert.ok(values[i - 1] >= values[i]);
  vectors.forEach((u, a) => vectors.forEach((v, b) => close(dot(u, v), a === b ? 1 : 0, 1e-13)));
  A.forEach((row, i) => row.forEach((x, j) => close(values.reduce((sum, l, k) => sum + l * vectors[k][i] * vectors[k][j], 0), x, 1e-13)));
  const repeated = symmetricEigen([[1, 0.5, 0.5], [0.5, 1, 0.5], [0.5, 0.5, 1]]).values;
  [2, 0.5, 0.5].forEach((v, i) => close(repeated[i], v, 1e-14));
  assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
});

test('cholesky: L Lᵀ reproduces the matrix, and a matrix that is not positive definite gives null', () => {
  const A = [[4, 2, -2], [2, 10, 4], [-2, 4, 9]];
  const L = /** @type {number[][]} */ (cholesky(A));
  A.forEach((row, i) => row.forEach((v, j) => close(L[i].reduce((s, x, k) => s + x * L[j][k], 0), v, 1e-13)));
  assert.equal(L[0][1], 0);
  assert.equal(cholesky([[1, 2], [2, 1]]), null);
  assert.equal(cholesky([[1, 1], [1, 1]]), null);
});

test('geom3d: rotations, views, projection and arcs', () => {
  const q = quatFromAxisAngle([0, 0, 1], 90);
  rotateVector(q, [1, 0, 0]).forEach((v, i) => close(v, [0, 1, 0][i], 1e-15));
  const both = quatMultiply(quatFromAxisAngle([1, 0, 0], 90), q); // z-turn, then x-turn
  rotateVector(both, [1, 0, 0]).forEach((v, i) => close(v, [0, 0, 1][i], 1e-15));
  // The default view puts world z up on screen; turning right brings the front to the right.
  const view = orientation(0, 0);
  rotateVector(view, [0, 0, 1]).forEach((v, i) => close(v, [0, 1, 0][i], 1e-15));
  rotateVector(view, [0, -1, 0]).forEach((v, i) => close(v, [0, 0, 1][i], 1e-15));
  close(rotateVector(turn(view, 'right', 90), [0, -1, 0])[0], 1, 1e-15);
  const ortho = { rotation: view, width: 200, height: 100, scale: 50, distance: Infinity };
  const p = project(ortho, [0, 0, 1]);
  close(p.x, 100); close(p.y, 0); close(p.f, 1);
  const near = project({ ...ortho, distance: 5 }, [0, -1, 0]);
  close(near.f, 5 / 4);
  const arc = arcPoints([1, 0, 0], [0, 1, 0], 2, 8);
  close(arc[0][0], 2); close(arc[8][1], 2); close(Math.hypot(...arc[4]), 2, 1e-14);
  for (const point of sphereOutline(view)) close(rotateVector(view, point)[2], 0, 1e-14);
});

test('geom3d: the scene is drawn far to near, with labels last', () => {
  const camera = { rotation: orientation(0, 0), width: 100, height: 100, scale: 40, distance: Infinity };
  const svg = renderScene(camera, [
    { kind: 'label', at: [0, 0, 0], text: 'L' },
    { kind: 'point', at: [0, -1, 0], class: 'near' },
    { kind: 'point', at: [0, 1, 0], class: 'far' },
    { kind: 'line', from: [0, 1, 0], to: [0, -1, 0], class: 'cross', backClass: 'cross back' },
  ], { label: 'test' });
  assert.ok(svg.indexOf('far') < svg.indexOf('near'));
  assert.ok(svg.indexOf('near') < svg.indexOf('>L<'));
  assert.match(svg, /role="img" aria-label="test"/);
});
