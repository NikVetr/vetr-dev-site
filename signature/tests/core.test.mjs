// Unit tests: node --test (from signature/). The R reference values come from
// tests/fixtures/r-parity.json (make-r-parity.R, which sources the original
// script), and the waveslim ones from shared/tests/fixtures/wavelet.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { submit, SignatureError } from '../core/index.js';
import { pairStrokes, normalizePair, segmentIntersection, waveletInterpolate } from '../core/morph.js';
import { ribbon, signedArea, unionRings } from '../core/outline.js';
import { breakInteger, resampleBudget, resampleStroke } from '../core/resample.js';
import { fourierSmoothSeries, waveletSmoothSeries } from '../core/smooth.js';
import { measuredLogSpeed, powerLawLogSpeed, strokeWidths } from '../core/width.js';

const json = (/** @type {string} */ p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const R = json('fixtures/r-parity.json');
const maxAbs = (/** @type {ArrayLike<number>} */ a, /** @type {ArrayLike<number>} */ b) => {
  assert.equal(a.length, b.length);
  return Math.max(0, ...Array.from(a, (v, i) => Math.abs(v - b[i])));
};
const example = (/** @type {string} */ f) => readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8');
/** @type {import('../core/smooth.js').WaveletSettings} */
const WAVELET = { filter: 'mb4', levels: 'auto', rule: 'energy', keepEnergy: 0.999, noiseMultiplier: 3, thresholdSmooth: false, strength: 1 };
/** @param {number} n @param {(t: number) => number[]} f */
const curve = (n, f) => {
  const pts = Array.from({ length: n }, (_, i) => f(i / (n - 1)));
  return { x: Float64Array.from(pts, (p) => p[0]), y: Float64Array.from(pts, (p) => p[1]) };
};
/** Area of polygons (outer rings less holes). @param {[number, number][][][]} polys */
const area = (polys) => polys.reduce((s, p) => s + Math.abs(signedArea(p[0])) - p.slice(1).reduce((h, r) => h + Math.abs(signedArea(r)), 0), 0);

test('arc-length resampling and the point budget match interpolate_to_length_kd and break_integer', () => {
  const rs = R.resample;
  const strokes = [1, 2, 3].map((k) => ({ x: rs.x.filter((/** @type {number} */ _, /** @type {number} */ i) => rs.segs[i] === k), y: rs.y.filter((/** @type {number} */ _, /** @type {number} */ i) => rs.segs[i] === k) }));
  const out = resampleBudget(strokes, rs.n);
  assert.deepEqual(out.map((o) => o.x.length), [1, 2, 3].map((k) => rs.out_i.filter((/** @type {number} */ i) => i === k).length));
  assert.ok(maxAbs(out.flatMap((o) => Array.from(o.x)), rs.out_x) < 1e-10);
  assert.ok(maxAbs(out.flatMap((o) => Array.from(o.y)), rs.out_y) < 1e-10);
  for (const b of R.break_integer) assert.deepEqual(breakInteger(b.x, b.p), b.out, `break_integer(${b.x}, ${b.p})`);
  // equal steps: every step of a resampled polyline's own length, along the raw path
  const r = resampleStroke([0, 3, 3], [0, 0, 4], 8);
  assert.deepEqual(Array.from(r.s), Array.from({ length: 8 }, (_, i) => i));
  assert.deepEqual([r.x[3], r.y[3], r.x[5], r.y[5]], [3, 0, 3, 2]);
});

test('wavelet smoothing matches wavelet_smooth (smooth thresholded) and its details-only correction', () => {
  for (const c of R.wavelet_energy) {
    const s = { ...WAVELET, filter: c.filter, keepEnergy: c.keep };
    assert.ok(maxAbs(waveletSmoothSeries(c.x, { ...s, thresholdSmooth: true }), c.smooth_thresholded) < 1e-10, `${c.filter} ${c.keep} script`);
    assert.ok(maxAbs(waveletSmoothSeries(c.x, s), c.details_only) < 1e-10, `${c.filter} ${c.keep} details only`);
  }
  for (const c of R.wavelet_noise) {
    assert.ok(maxAbs(waveletSmoothSeries(c.x, { ...WAVELET, rule: 'noise', noiseMultiplier: c.multiplier }), c.out) < 1e-10);
  }
});

test('reflected wavelet smoothing matches the waveslim fixtures', () => {
  const cases = json('../../shared/tests/fixtures/wavelet/modwt_cases.json').cases.filter((/** @type {any} */ c) => c.boundary === 'reflection');
  assert.ok(cases.length >= 2);
  for (const c of cases) {
    const s = { ...WAVELET, filter: c.filter, levels: c.n_levels, rule: /** @type {const} */ ('noise'), noiseMultiplier: 3 };
    assert.ok(maxAbs(waveletSmoothSeries(c.x, s), c.smooth.sd_3) < 1e-12, c.name);
  }
});

test('a local strength of 0 leaves the middle of its region almost unsmoothed, and far points as they were', () => {
  const v = Array.from({ length: 240 }, (_, i) => Math.sin(i / 15) * 40 + ((i * 7919) % 13) - 6);
  const global = waveletSmoothSeries(v, WAVELET);
  const profile = Float64Array.from(v, (_, i) => (i >= 60 && i < 180 ? 0 : 1));
  const local = waveletSmoothSeries(v, WAVELET, profile);
  const change = (/** @type {Float64Array} */ out) => Math.max(...Array.from({ length: 21 }, (_, k) => Math.abs(out[110 + k] - v[110 + k])));
  assert.ok(change(local) < 0.1 * change(global), `${change(local)} against ${change(global)}`);
  for (let i = 0; i < 10; i++) assert.ok(Math.abs(local[i] - global[i]) < 1e-9, `point ${i} as globally smoothed`);
});

test('Fourier smoothing and both morph interpolations match the script', () => {
  for (const c of R.fourier) assert.ok(maxAbs(fourierSmoothSeries(c.x, 1), c.out) < 1e-10, c.coord);
  const m = R.morph;
  const props = m.props.map((/** @type {number} */ p) => 1 - p); // the script's prop weights its first signature; the tool's p its target
  waveletInterpolate(m.a, m.b, m.multipliers, props, 0).forEach((f, k) => assert.ok(maxAbs(f, m.wavelet[k]) < 1e-10, `wavelet frame ${k}`));
  const [fa, fb] = [fourierSmoothSeries(m.a, 1), fourierSmoothSeries(m.b, 1)];
  props.forEach((/** @type {number} */ p, /** @type {number} */ k) => assert.ok(maxAbs(fa.map((v, t) => (1 - p) * v + p * fb[t]), m.linear[k]) < 1e-10, `linear frame ${k}`));
  // the coefficients' inverse is linear, so without `loop` the wavelet morph interpolates the smoothed ends
  const [w0, w1, wh] = waveletInterpolate(m.a, m.b, m.multipliers, [0, 1, 0.5], 0);
  assert.ok(maxAbs(wh, w0.map((v, t) => (v + w1[t]) / 2)) < 1e-9);
});

test('morph normalisation equalises ink length, and segment intersections are found on both segments', () => {
  const nz = R.normalize;
  const [a, b] = normalizePair([nz.a_x.map((/** @type {number} */ x, /** @type {number} */ i) => ({ x, y: nz.a_y[i] }))], [nz.b_x.map((/** @type {number} */ x, /** @type {number} */ i) => ({ x, y: nz.b_y[i] }))]);
  assert.ok(maxAbs(a[0].map((p) => p.x), nz.a_scaled_x) < 1e-10);
  assert.ok(maxAbs(b[0].map((p) => p.x), nz.b_scaled_x) < 1e-10);
  for (const c of R.intersect) {
    const h = segmentIntersection([c.l1[0], c.l1[1]], [c.l1[2], c.l1[3]], [c.l2[0], c.l2[1]], [c.l2[2], c.l2[3]]);
    const got = h ? [c.l1[0] + h.a * (c.l1[2] - c.l1[0]), c.l1[1] + h.a * (c.l1[3] - c.l1[1])] : 'no intersection';
    if (typeof c.fixed === 'string') assert.equal(got, c.fixed, c.name);
    else assert.ok(maxAbs(/** @type {number[]} */ (got), c.fixed) < 1e-9, c.name);
  }
});

test('the two-thirds power law: speed goes as curvature^(-exponent)', () => {
  const w = { source: /** @type {const} */ ('curvature'), min: 0.01, max: 0.04, exponent: 1 / 3, straightRadius: 1e9, geometryWeight: 0, smoothing: 0.02, taper: { length: 0, floor: 1 } };
  const circle = (/** @type {number} */ r) => {
    const c = curve(400, (t) => [r * Math.cos(1.5 * Math.PI * t), r * Math.sin(1.5 * Math.PI * t)]);
    return { ...c, s: new Float64Array(400), raw: [], rawS: new Float64Array(0) };
  };
  const [big, small] = [powerLawLogSpeed(circle(80), 100, w), powerLawLogSpeed(circle(10), 100, w)];
  assert.ok(Math.abs(big[200] - small[200] - Math.log(8) / 3) < 1e-3, 'speed ratio 8^(1/3) for radii 80 and 10');
  // a straight run then a tight hook: thin where fast (straight), thick where slow (the hook)
  const pts = [...Array.from({ length: 60 }, (_, i) => [i, 0]), ...Array.from({ length: 40 }, (_, i) => [60 + 4 * Math.sin((Math.PI * i) / 39), 4 - 4 * Math.cos((Math.PI * i) / 39)])];
  const hook = { x: Float64Array.from(pts, (p) => p[0]), y: Float64Array.from(pts, (p) => p[1]), s: new Float64Array(pts.length), raw: [], rawS: new Float64Array(0) };
  const [wd] = strokeWidths([hook], 20, { ...w, straightRadius: 1 });
  assert.ok(wd[20] < wd[80], `straight ${wd[20]} thinner than the hook ${wd[80]}`);
});

test('measured speed: time per unit length, a pause counting as slow', () => {
  // 0 to 50 at 1 unit/ms, a 40 ms pause at 50, then 50 to 100 at 0.25 unit/ms
  const raw = [...Array.from({ length: 51 }, (_, i) => ({ x: i, y: 0, t: i })), ...Array.from({ length: 50 }, (_, i) => ({ x: 51 + i, y: 0, t: 90 + 4 * (i + 1) }))];
  raw.splice(51, 0, { x: 50, y: 0, t: 90 });
  const rawS = Float64Array.from(raw, (p) => p.x);
  const r = resampleStroke(raw.map((p) => p.x), raw.map((p) => p.y), 101);
  const ls = measuredLogSpeed({ ...r, raw, rawS }, 50, { source: 'speed', min: 0.01, max: 0.04, exponent: 1 / 3, straightRadius: 1, geometryWeight: 0, smoothing: 0.02, taper: { length: 0, floor: 1 } });
  assert.ok(Math.abs(ls[20] - Math.log(1)) < 0.01, `fast part ${Math.exp(ls[20])}`);
  assert.ok(Math.abs(ls[80] - Math.log(0.25)) < 0.01, `slow part ${Math.exp(ls[80])}`);
  assert.ok(ls[50] < ls[80], 'the pause is slower still');
});

test('outlines: a capsule for a straight stroke, one shape with a hole for a loop, no gap at a hairpin', () => {
  const line = curve(50, (t) => [100 * t, 0]);
  const cap = unionRings([ribbon(line.x, line.y, new Float64Array(50).fill(10))]);
  assert.equal(cap.length, 1);
  assert.ok(Math.abs(area(cap) - (100 * 10 + Math.PI * 25)) < 3, `capsule area ${area(cap)}`);
  const loop = curve(200, (t) => [50 * Math.cos(2.1 * Math.PI * t), 50 * Math.sin(2.1 * Math.PI * t)]);
  const ring = unionRings([ribbon(loop.x, loop.y, new Float64Array(200).fill(6))]);
  assert.equal(ring.length, 1);
  assert.equal(ring[0].length, 2, 'the loop leaves a hole');
  // out and straight back: the union is the one capsule, with no hole where the edges cross
  const h = unionRings([ribbon([0, 50, 100, 50, 0], [0, 0, 0, 0, 0], [8, 8, 8, 8, 8])]);
  assert.equal(h.length, 1);
  assert.equal(h[0].length, 1, 'no hole at the reversal');
  assert.ok(Math.abs(area(h) - (100 * 8 + Math.PI * 16)) < 2, `hairpin area ${area(h)}`);
  // a sharp V: the same area as the union of its two capsules
  const v = unionRings([ribbon([0, 50, 0], [0, 0, 12], [8, 8, 8])]);
  const caps = unionRings([ribbon([0, 50], [0, 0], [8, 8]), ribbon([50, 0], [0, 12], [8, 8])]);
  assert.equal(v[0].length, 1);
  assert.ok(Math.abs(area(v) - area(caps)) < 1, `V ${area(v)} against ${area(caps)}`);
  // two crossing strokes merge into one outline smaller than their sum
  const a = ribbon([0, 100], [0, 0], [10, 10]);
  const b = ribbon([50, 50], [-50, 50], [10, 10]);
  const u = unionRings([a, b]);
  assert.equal(u.length, 1);
  assert.ok(area(u) < Math.abs(signedArea(a)) + Math.abs(signedArea(b)) - 90);
});

test('stroke pairing for the morph: leftover strokes grow from where they cross a paired stroke', () => {
  const stem = Array.from({ length: 11 }, (_, i) => ({ x: 0, y: i * 10 }));
  const cross = [{ x: -20, y: 30 }, { x: 20, y: 30 }];
  const other = [Array.from({ length: 11 }, (_, i) => ({ x: 5, y: i * 20 }))];
  const pairs = pairStrokes([stem, cross], other);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs[0], { a: { stroke: 0 }, b: { stroke: 0 } });
  const anchor = /** @type {{ anchor: [number, number] }} */ (pairs[1].b).anchor;
  assert.ok(Math.abs(anchor[0] - 5) < 1e-9 && Math.abs(anchor[1] - 60) < 0.5, `the cross bar grows from 30% up the other stem: ${anchor}`);
  const r = submit({ csv: example('avery-quill.csv'), morph: { target: { csv: example('juno-marsh.csv') }, props: [0, 0.5, 1] } });
  const frames = /** @type {NonNullable<typeof r.morph>} */ (r.morph).frames;
  assert.equal(frames.length, 3);
  assert.equal(frames[0].strokes.length, 10, 'Juno Marsh has 10 strokes to Avery Quill\'s 8');
});

test('the examples correct end to end: speed widths, one SVG path, widths within bounds', () => {
  const r = submit({ csv: example('avery-quill.csv') });
  assert.equal(r.strokes.length, 8);
  assert.equal(r.widthSource, 'speed');
  assert.match(r.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="[-\d. ]+" width="[\d.]+" height="[\d.]+"><path fill="#1b1b1b" fill-rule="evenodd" d="M[^"]+"\/><\/svg>\n$/);
  const widths = r.strokes.flatMap((s) => s.points.map((p) => p[2]));
  assert.ok(Math.max(...widths) <= 0.035 * r.height + 1e-9 && Math.min(...widths) >= 0.25 * 0.01 * r.height - 1e-9);
  const untimed = submit({ matrix: [r.strokes[0].points.map((p) => p[0]), r.strokes[0].points.map((p) => p[1])], output: { height: 20, unit: 'mm' } });
  assert.equal(untimed.widthSource, 'curvature');
  assert.match(untimed.svg, /height="20mm"/);
});

test('input forms: CSV pen lifts at time gaps, SVG paths with transforms, matrix nulls', () => {
  const csv = 'x,y,t\n0,0,0\n10,0,10\n20,5,20\n30,5,100\n40,0,110\n';
  assert.equal(submit({ csv }).strokes.length, 2, 'the 80 ms gap lifts the pen');
  assert.equal(submit({ csv, input: { penUpGap: 100 } }).strokes.length, 1);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(100 0) scale(2)"><path d="M0 0 C 10 -10 20 10 30 0 M 0 20 l 30 0"/></g></svg>';
  const r = submit({ svg, smooth: { fourier: { strength: 0 }, wavelet: { strength: 0 } } });
  assert.equal(r.strokes.length, 2);
  const first = r.strokes[0].points;
  assert.ok(Math.abs(first[0][0] - 100) < 1e-9 && Math.abs(first[first.length - 1][0] - 160) < 1e-9);
  assert.equal(submit({ matrix: [[0, 10, 20, null, 0, 10], [0, 5, 0, null, 20, 20]] }).strokes.length, 2);
});

test('invalid requests are rejected with every problem listed', () => {
  /** @param {unknown} req @returns {SignatureError} */
  const fail = (req) => {
    try {
      submit(req);
    } catch (e) {
      assert.ok(e instanceof SignatureError);
      return e;
    }
    throw new Error('accepted');
  };
  const e = fail({ csv: 'x,y\n0,0\n1,1', smooth: { wavelet: { filtr: 'mb4', keepEnergy: 2 } }, width: { min: 0.05, max: 0.01 }, colour: 'red' });
  assert.equal(e.code, 'INVALID_REQUEST');
  assert.deepEqual(e.issues.map((i) => `${i.code} ${i.path}`).sort(), ['INVALID_FIELD smooth.wavelet.keepEnergy', 'INVALID_FIELD width.min', 'UNKNOWN_FIELD colour', 'UNKNOWN_FIELD smooth.wavelet.filtr']);
  assert.deepEqual(fail({}).issues.map((i) => i.code), ['MISSING_INPUT']);
  assert.deepEqual(fail({ csv: 'a,b\n1,2', svg: 'M0 0L1 1' }).issues.map((i) => i.code), ['CONFLICTING_INPUT']);
  assert.deepEqual(fail({ csv: 'a,b\n1,2' }).issues.map((i) => i.code), ['BAD_CSV']);
  assert.deepEqual(fail({ matrix: [[0, 1]], width: { source: 'speed' } }).issues.map((i) => i.code), ['INVALID_FIELD']);
  assert.deepEqual(fail({ strokes: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], width: { source: 'speed' } }).issues.map((i) => i.code), ['MISSING_TIME']);
  assert.deepEqual(fail({ strokes: [{ points: [{ x: 0, y: 0, t: 5 }, { x: 1, y: 1, t: 2, z: 1 }] }] }).issues.map((i) => i.code).sort(), ['TIME_BACKWARDS', 'UNKNOWN_FIELD']);
  assert.deepEqual(fail({ svg: 'M0 0L1 1', smooth: { local: [{ stroke: 3, from: 0.5, to: 0.2, strength: 1 }] } }).issues.map((i) => `${i.code} ${i.path}`), ['INVALID_FIELD smooth.local[0].to', 'INVALID_FIELD smooth.local[0].stroke']);
  assert.deepEqual(fail({ svg: 'M0 0L1 1', morph: { props: [2] } }).issues.map((i) => `${i.code} ${i.path}`).sort(), ['INVALID_FIELD morph.props', 'MISSING_INPUT morph.target']);
  assert.equal(fail({ strokes: [{ points: [{ x: 3, y: 3 }, { x: 3, y: 3 }] }] }).code, 'DEGENERATE_INPUT');
});
