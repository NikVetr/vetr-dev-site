import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IntuitionsError } from '../lib/params.js';
import { symmetricEigen } from '../lib/linalg.js';
import {
  circleArrow, compute as computeCorrelation, cosineRuleInterval, det3, entryInterval, equicorrelationEigenvalues, expectedWidthSample,
  expectedWidthUniform, sampleMatrix, uniformMatrix, zeroPairRange,
} from '../correlation-geometry/compute.js';

/** Results are a union over views; tests read them untyped. @param {unknown} params @returns {any} */
const cg = (params) => computeCorrelation(params);
const close = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const minEig = (/** @type {number[][]} */ R) => symmetricEigen(R).values[R.length - 1];
/** The entry's interval by bisection on the smallest eigenvalue, independent of the formula. @param {number[][]} R @param {number} i @param {number} j */
function bruteInterval(R, i, j) {
  const at = (/** @type {number} */ r) => {
    const Q = R.map((row) => [...row]);
    Q[i][j] = Q[j][i] = r;
    return minEig(Q) >= -1e-10;
  };
  const edge = (/** @type {number} */ inside, /** @type {number} */ outside) => {
    if (at(outside)) return outside;
    for (let k = 0; k < 60; k++) {
      const mid = (inside + outside) / 2;
      if (at(mid)) inside = mid;
      else outside = mid;
    }
    return (inside + outside) / 2;
  };
  return [edge(R[i][j], -1), edge(R[i][j], 1)];
}
/** @param {unknown} params */
function issues(params) {
  try {
    cg(params);
  } catch (error) {
    assert.ok(error instanceof IntuitionsError);
    return error.issues.map((i) => `${i.code} ${i.path}`);
  }
  return assert.fail('accepted');
}

test('arrows: r is the dot product of the centred unit vectors and ignores shift and scale', () => {
  const r = cg({ view: 'arrows', a: [1, 2, 4], b: [1, 3, 2] });
  const pearson = (/** @type {number[]} */ x, /** @type {number[]} */ y) => {
    const mx = x.reduce((s, v) => s + v) / x.length;
    const my = y.reduce((s, v) => s + v) / y.length;
    let sxy = 0; let sxx = 0; let syy = 0;
    x.forEach((v, i) => { sxy += (v - mx) * (y[i] - my); sxx += (v - mx) ** 2; syy += (y[i] - my) ** 2; });
    return sxy / Math.sqrt(sxx * syy);
  };
  close(r.r, pearson([1, 2, 4], [1, 3, 2]));
  close(Math.cos((r.angle * Math.PI) / 180), r.r);
  for (const v of r.vectors) {
    close(v.reduce((/** @type {number} */ s, /** @type {number} */ x) => s + x, 0), 0, 1e-15);
    close(Math.hypot(...v), 1, 1e-15);
  }
  close(cg({ view: 'arrows', a: [1, 2, 4], b: [7, 13, 10] }).r, r.r, 1e-14);
  const two = cg({ view: 'arrows', a: [1, 5], b: [3, -2] });
  close(two.r, -1, 1e-15);
  two.vectors.forEach((/** @type {number[]} */ v) => close(Math.abs(v[0]), Math.SQRT1_2, 1e-15));
  assert.equal(two.circleAngles, null);
  assert.deepEqual(issues({ view: 'arrows', a: [2, 2, 2], b: [1, 2] }), ['no_spread params.a', 'wrong_type params.b']);
});

test('cone: C has two positions, each centred, unit and at rBC to B; A meets them at the cosine-rule ends', () => {
  for (const [angleB, angleA, rBC] of [[60, 150, 0.6], [10, 200, -0.35], [300, 20, 0.95], [45, 45, 0]]) {
    const out = cg({ view: 'cone', b: circleArrow(angleB), a: circleArrow(angleA), rBC });
    for (const c of out.meets) {
      close(c[0] + c[1] + c[2], 0, 1e-15);
      close(Math.hypot(...c), 1, 1e-15);
      close(c[0] * out.b[0] + c[1] * out.b[1] + c[2] * out.b[2], rBC, 1e-15);
    }
    const theta = Math.acos(rBC);
    const gap = ((angleA - angleB) * Math.PI) / 180;
    close(out.withA[0], Math.cos(gap - theta), 1e-14);
    close(out.withA[1], Math.cos(gap + theta), 1e-14);
    const { lo, hi } = cosineRuleInterval(out.rAB, rBC);
    close(Math.min(...out.withA), lo, 1e-12);
    close(Math.max(...out.withA), hi, 1e-12);
  }
  assert.deepEqual(issues({ view: 'cone', b: [1, 2], rBC: 2 }), ['wrong_type params.b', 'out_of_range params.rBC']);
});

test('cosine rule: the ends are where det R = 0 and the smallest eigenvalue changes sign', () => {
  for (const [a, b] of [[0.5, 0.6], [0.8, 0.7], [-0.8, 0.7], [0.3, -0.2], [0.999, 0.2]]) {
    const out = cg({ view: 'cosine-rule', rAB: a, rBC: b, rAC: 0 });
    const [lo, hi] = out.interval;
    close(det3(a, b, lo), 0, 1e-12);
    close(det3(a, b, hi), 0, 1e-12);
    const R = (/** @type {number} */ c) => [[1, a, c], [a, 1, b], [c, b, 1]];
    assert.ok(minEig(R(lo + 1e-6)) > 0 && minEig(R(hi - 1e-6)) > 0);
    if (lo > -1 + 1e-6) assert.ok(minEig(R(lo - 1e-6)) < 0);
    assert.ok(minEig(R(hi + 1e-6)) < 0);
    close(out.detMax, det3(a, b, a * b), 1e-15);
    assert.equal(out.rAC.feasible, lo <= 0 && hi >= 0);
  }
  // r_AC is forced to the sign of r_AB·r_BC exactly when r_AB² + r_BC² > 1.
  for (let a = -0.95; a <= 0.95; a += 0.1) {
    for (let b = -0.95; b <= 0.95; b += 0.1) {
      const sign = cg({ view: 'cosine-rule', rAB: Number(a.toFixed(2)), rBC: Number(b.toFixed(2)) }).forcedSign;
      const expected = a * a + b * b > 1 + 1e-9 ? (a * b > 0 ? 'positive' : 'negative') : null;
      if (Math.abs(a * a + b * b - 1) > 1e-6) assert.equal(sign, expected, `${a}, ${b}`);
    }
  }
});

test('equicorrelation: eigenvalues match a full decomposition, and the limits are where one reaches 0', () => {
  for (let k = 2; k <= 8; k++) {
    for (const zeroPair of k >= 3 ? [false, true] : [false]) {
      for (const r of [-0.4, -0.1, 0.25, 0.7]) {
        const R = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (__, j) => (i === j ? 1 : zeroPair && i + j === 1 ? 0 : r)));
        const full = symmetricEigen(R).values;
        const ours = equicorrelationEigenvalues(k, r, zeroPair).flatMap((e) => Array(e.multiplicity).fill(e.value)).sort((x, y) => y - x);
        ours.forEach((v, i) => close(v, full[i], 1e-12));
      }
      const [lo, hi] = zeroPair ? zeroPairRange(k) : [-1 / (k - 1), 1];
      close(cg({ view: 'equicorrelation', k, r: lo, zeroPair }).smallestEigenvalue, 0, 1e-12);
      if (zeroPair) close(cg({ view: 'equicorrelation', k, r: hi, zeroPair }).smallestEigenvalue, 0, 1e-12);
    }
  }
  close(zeroPairRange(3)[1], Math.SQRT1_2, 1e-15);
  assert.ok(Math.abs(zeroPairRange(100000)[1] - 0.5) < 1e-5);
  // The arrows' parts along and across the common direction give back r.
  const { arrows } = cg({ view: 'equicorrelation', k: 5, r: -0.15 });
  close(arrows.along ** 2 + arrows.across ** 2, 1, 1e-15);
  close(arrows.along ** 2 - arrows.across ** 2 / 4, -0.15, 1e-15);
  const below = cg({ view: 'equicorrelation', k: 4, r: -0.5 });
  assert.equal(below.feasible, false);
  assert.equal(below.arrows, null);
  assert.deepEqual(issues({ view: 'equicorrelation', k: 2, zeroPair: true }), ['out_of_range params.k']);
});

test('entry range: the interval matches bisection on the smallest eigenvalue', () => {
  for (const seed of [1, 2, 3]) {
    for (const p of [3, 5, 8]) {
      const R = uniformMatrix(p, seed);
      for (const [i, j] of [[0, 1], [0, p - 1], [p - 2, p - 1]]) {
        const e = entryInterval(R, i, j);
        const [lo, hi] = bruteInterval(R, i, j);
        close(e.lo, lo, 1e-9);
        close(e.hi, hi, 1e-9);
      }
    }
  }
  const out = cg({ view: 'entry-range' });
  assert.deepEqual(out.cell, [0, 3]);
  close(out.detMax, out.detOthers * (out.width / 2) ** 2, 1e-15);
  close(out.widths[0][3], out.width, 1e-15);
  assert.equal(out.widths[1][1], null);
});

test('entry range: a sample matrix is singular from p = n; widths are 0 from p = n + 1', () => {
  const n = 6;
  const atN = cg({ view: 'entry-range', matrix: sampleMatrix(n, n, 4), cell: [0, 1] });
  assert.equal(atN.singular, true);
  assert.ok(atN.width > 0.01);
  assert.ok(atN.position < 1e-6 || atN.position > 1 - 1e-6, `position ${atN.position}`);
  const above = cg({ view: 'entry-range', matrix: sampleMatrix(n + 1, n, 4), cell: [2, 5] });
  assert.ok(above.width < 1e-7);
  assert.ok(above.meanWidth < 1e-7);
  const below = cg({ view: 'entry-range', matrix: sampleMatrix(n - 1, n, 4) });
  assert.equal(below.singular, false);
});

test('entry range: invalid matrices are rejected with every problem named', () => {
  assert.deepEqual(issues({ view: 'entry-range', matrix: [[1, 0.9, 0.9], [0.9, 1, -0.9], [0.9, -0.9, 1]], cell: [0, 1] }), ['not_positive_semidefinite params.matrix']);
  assert.deepEqual(issues({ view: 'entry-range', matrix: [[1, 0.5], [0.4, 2]], cell: [0, 0] }),
    ['out_of_range params.matrix[1][1]', 'not_symmetric params.matrix[1][0]', 'out_of_range params.cell']);
  assert.deepEqual(issues({ view: 'entry-range', matrix: [[1]] }), ['wrong_type params.matrix']);
  assert.deepEqual(issues({ view: 'entry-range', cell: [0, 7], observations: 1 }), ['out_of_range params.cell[1]', 'out_of_range params.observations']);
  assert.deepEqual(issues({ view: 'nope' }), ['out_of_range params.view']);
  assert.deepEqual(issues({ view: 'cosine-rule', k: 3 }), ['unknown_field params.k']);
});

test('expected widths: closed forms at known points and against seeded simulation', () => {
  assert.equal(expectedWidthUniform(2), 2);
  close(expectedWidthUniform(3), 2 * (8 / (3 * Math.PI)) ** 2, 1e-15);
  assert.equal(expectedWidthSample(2, 10), 2);
  assert.equal(expectedWidthSample(11, 10), 0);
  assert.ok(expectedWidthSample(10, 10) > 0);
  // The onion sampler is uniform over correlation matrices, and sample matrices are
  // as described, if simulated mean widths sit within Monte Carlo error.
  for (const [p, draw, expected] of /** @type {[number, (seed: number) => number[][], number][]} */ ([
    [5, (seed) => uniformMatrix(5, seed), expectedWidthUniform(5)],
    [6, (seed) => sampleMatrix(6, 10, seed), expectedWidthSample(6, 10)],
  ])) {
    const reps = 3000;
    const w = Array.from({ length: reps }, (_, s) => {
      const e = entryInterval(draw(s + 1), 0, 1);
      return e.hi - e.lo;
    });
    const mean = w.reduce((a, b) => a + b) / reps;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / (reps - 1));
    assert.ok(Math.abs(mean - expected) < 4 * (sd / Math.sqrt(reps)), `p = ${p}: ${mean} vs ${expected}`);
    assert.ok(minEig(draw(7)) > -1e-12);
  }
});
