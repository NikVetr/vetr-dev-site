// Unit tests: node --test tests/*.test.mjs (from raster-to-vector/). The R
// reference values come from tests/fixtures (see make-r-parity.R).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { submit, RasterToVectorError } from '../core/index.js';
import { plottingOrder, shapeOverlaps } from '../core/order.js';
import { createRng } from '../core/rng.js';
import { traceLayersMs } from '../core/trace-ms.js';
import { allInWindow, sobelSum, traceLayersOriginal } from '../core/trace-original.js';
import { imodwt, modwt, waveletFilter, waveletSmooth } from '../core/wavelet.js';
import { decodePng } from '../decode-png.mjs';

const here = (/** @type {string} */ p) => fileURLToPath(new URL(p, import.meta.url));
const json = (/** @type {string} */ p) => JSON.parse(readFileSync(here(p), 'utf8'));
const R = json('fixtures/r-parity.json');
const maxAbs = (/** @type {ArrayLike<number>} */ a, /** @type {ArrayLike<number>} */ b) => {
  assert.equal(a.length, b.length);
  return Math.max(0, ...Array.from(a, (v, i) => Math.abs(v - b[i])));
};
/** @param {string} name */
const examplePng = (name) => {
  const png = decodePng(readFileSync(here(`../examples/${name}`)));
  return { width: png.width, height: png.height, data: png.data };
};
/** An RGBA image from a label grid and a palette of [r, g, b, a] bytes. @param {number[][]} labels @param {number[][]} palette */
const labelImage = (labels, palette) => ({
  width: labels[0].length,
  height: labels.length,
  data: Uint8Array.from(labels.flat().flatMap((l) => palette[l - 1])),
});
/** A grid of 1s with rectangles [r0, r1, c0, c1, label] (inclusive, 0-based) painted in order. @param {number} h @param {number} w @param {number[][]} rects */
const grid = (h, w, rects) => {
  const g = Array.from({ length: h }, () => new Array(w).fill(1));
  for (const [r0, r1, c0, c1, v] of rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = v;
  return g;
};
const shoelace = (/** @type {{ x: ArrayLike<number>, y: ArrayLike<number> }} */ r) => {
  let s = 0;
  for (let i = 0; i < r.x.length; i++) {
    const j = (i + 1) % r.x.length;
    s += r.x[i] * r.y[j] - r.x[j] * r.y[i];
  }
  return s / 2;
};
/** snake_case R request fields to camelCase. @param {any} v @returns {any} */
const camel = (v) => (Array.isArray(v) ? (v.length ? v : {}) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(x)]))
  : v);

// The R test image: background, a square ring with a hole, a disc in the hole, a bar touching the right edge.
const RING = grid(40, 48, [[5, 29, 5, 29, 2], [11, 23, 11, 23, 1], [14, 20, 14, 20, 3], [33, 37, 19, 47, 2]]);

test('MODWT, its inverse and smoothing match the waveslim fixtures to 1e-12', () => {
  const filters = json('fixtures/wavelet/filters.json');
  for (const [name, f] of Object.entries(filters)) {
    const { g, h } = waveletFilter(/** @type {any} */ (name));
    assert.deepEqual([g, h], [f.lowpass, f.highpass]);
  }
  for (const c of json('fixtures/wavelet/modwt_cases.json').cases) {
    const w = modwt(c.x, c.filter, c.n_levels, c.boundary);
    w.d.forEach((dj, j) => assert.ok(maxAbs(dj, c.d[j]) < 1e-12, `${c.name} ${c.filter} d${j + 1}`));
    assert.ok(maxAbs(w.s, c.s) < 1e-12);
    assert.ok(maxAbs(imodwt(w), c.reconstruction) < 1e-12);
    assert.ok(maxAbs(waveletSmooth(c.x, c.filter, c.n_levels, 3, 'sd', c.boundary), c.smooth.sd_3) < 1e-12);
    assert.ok(maxAbs(waveletSmooth(c.x, c.filter, c.n_levels, 3, 'mad', c.boundary), c.smooth.mad_3) < 1e-12);
  }
});

test('the generator reproduces R draws after set.seed()', () => {
  let rng = createRng(1);
  assert.deepEqual(Array.from({ length: 5 }, rng.unif), R.rng.runif_seed1);
  rng = createRng(1);
  assert.deepEqual(Array.from({ length: 20 }, () => rng.index(300) + 1), R.rng.sample300_seed1);
  rng = createRng(2);
  assert.deepEqual(Array.from({ length: 30 }, () => rng.weighted(R.rng.weights) + 1), R.rng.weighted_seed2);
});

test('the window and Sobel operations match ImageMagick on binary masks', () => {
  const mat = (/** @type {number[][]} */ rows) => ({ nrow: rows.length, ncol: rows[0].length, data: Uint8Array.from(rows.flat()) });
  const { random, blocks } = R.magick;
  const m = mat(random.mask);
  assert.deepEqual(Array.from(sobelSum(m).data), random.sobel.flat());
  const t = mat(random.mask[0].map((/** @type {number} */ _, /** @type {number} */ j) => random.mask.map((/** @type {number[]} */ row) => row[j])));
  assert.deepEqual(Array.from(sobelSum(t).data), random.sobel_t.flat());
  assert.deepEqual(Array.from(allInWindow(m, 2).data), random.conv2.flat());
  assert.deepEqual(Array.from(allInWindow(m, 3).data), random.conv3.flat());
  for (let k = 2; k <= 6; k++) assert.deepEqual(Array.from(allInWindow(mat(blocks.mask), k).data), blocks[`conv${k}`].flat(), `k = ${k}`);
});

test('areas of self-intersecting rings follow sf (st_make_valid: nonzero rule)', () => {
  const ring = (/** @type {number[][]} */ xy) => ({ x: xy.map((p) => p[0]), y: xy.map((p) => p[1]) });
  const square = (/** @type {number} */ s) => ring([[0, 0], [s, 0], [s, s], [0, s]]);
  const frame = ring([[-5, -5], [-5, 9], [9, 9], [9, -5]]);
  const loop = shapeOverlaps([ring(R.areas.double_loop.ring), square(4), frame], 2);
  assert.ok(Math.abs(loop[1][0] - R.areas.double_loop.area / 16) < 1e-12); // area 15 of the 4 × 4 square
  assert.ok(Math.abs(loop[0][1] - 1) < 1e-12);
  const bow = shapeOverlaps([ring(R.areas.bowtie.ring), square(2), frame], 2);
  assert.ok(Math.abs(bow[1][0] - R.areas.bowtie.area / 4) < 1e-12); // both lobes count
});

test('marching squares: rings on pixel edges, orientation marking holes', () => {
  const labels = Int32Array.from(RING.flat());
  const layers = traceLayersMs(labels, 40, 48, 3, 9);
  assert.equal(layers[1].shapes.length, 3); // the ring's outline, its hole, the edge bar
  const signed = layers[1].shapes.map(shoelace);
  assert.equal(signed.filter((a) => a > 0).length, 1);
  assert.equal(-signed.reduce((a, b) => a + b, 0), RING.flat().filter((v) => v === 2).length);
  assert.equal(layers[2].shapes.length, 1);
  assert.equal(Math.abs(shoelace(layers[2].shapes[0])), 49);
});

test('the original tracer: outline and hole on pixel corners, a region at the edge closes', () => {
  const layers = traceLayersOriginal(Int32Array.from(RING.flat()), 40, 48, 3, 9, 1);
  const areas = layers[1].shapes.map((s) => Math.abs(shoelace(s))).sort((a, b) => a - b);
  assert.deepEqual(areas.slice(1), [13 ** 2, 25 ** 2]);
  assert.ok(Math.max(...layers[1].shapes.flatMap((s) => Array.from(s.x))) >= 48);
  assert.deepEqual(layers.map((l) => l.dropped.length), [0, 0, 0]);
  assert.equal(Math.abs(shoelace(layers[2].shapes[0])), 49);
});

test('a pinch: the original tracer drops the chains, marching squares keeps them', () => {
  const pinch = labelImage(grid(30, 30, [[4, 11, 4, 11, 2], [12, 19, 12, 19, 2]]), [[255, 255, 255, 255], [0, 0, 0, 255]]);
  const original = submit({ image: pinch, quantize: { k: 2 }, trace: { method: 'original' } });
  const dropped = original.warnings.find((w) => w.code === 'DROPPED_CONTOURS');
  assert.ok(dropped && /** @type {number[]} */ (dropped.pixels)[1] > 0);
  const ms = submit({ image: pinch, quantize: { k: 2 } });
  assert.equal(ms.warnings.find((w) => w.code === 'DROPPED_CONTOURS'), undefined);
  assert.equal(ms.regions.filter((r) => r.layer === 2).length, 2);
});

test('whole runs reproduce the R version\'s SVG byte for byte', () => {
  for (const run of R.runs) {
    const result = submit({ image: examplePng(run.image), ...camel(run.request) });
    assert.equal(result.k, run.k, run.name);
    assert.deepEqual(result.palette.map((p) => p.hex), run.hex, run.name);
    assert.equal(result.svg, run.svg, run.name);
  }
});

test('the SVG is well formed: one evenodd path per painted region, frame first', () => {
  const result = submit({ image: examplePng('logo_holes.png') });
  const { svg } = result;
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 300 200" width="300" height="200">\n/);
  assert.ok(svg.endsWith('\n</svg>\n'));
  const paths = [...svg.matchAll(/<path d="([^"]*)" fill="#[0-9A-F]{6}"(?: fill-opacity="[0-9.]+")? fill-rule="evenodd"\/>/g)];
  const painted = result.regions.filter((r) => !result.palette[r.layer - 1].transparent);
  assert.equal(paths.length, painted.length);
  assert.equal(svg.split('<').length - 1, paths.length + 2); // nothing but the paths and the svg element
  for (const [, d] of paths) assert.match(d, /^(M-?\d+(\.\d+)?,-?\d+(\.\d+)?L(-?\d+(\.\d+)?,-?\d+(\.\d+)? ?)+Z)+$/);
  assert.ok(result.regions[0].frame);
  // the ring's hole and the counters of B and 8 are cut, as their filler is transparent
  assert.equal(result.regions.reduce((n, r) => n + r.holes.length, 0), 5);
});

test('an invalid request lists every problem, with unported R options named', () => {
  /** @param {unknown} request */
  const issues = (request) => {
    try {
      submit(request);
    } catch (error) {
      assert.ok(error instanceof RasterToVectorError);
      assert.equal(error.code, 'INVALID_REQUEST');
      return error.issues.map((i) => `${i.code} ${i.path}`);
    }
    assert.fail('expected an error');
  };
  assert.deepEqual(issues({}), ['MISSING_FIELD image']);
  assert.deepEqual(issues('logo.png'), ['INVALID_REQUEST ']);
  assert.deepEqual(issues({
    image: { width: 2, height: 2, data: [0, 0, 0] },
    quantize: { cores: 4, kRange: [3, 3], seeding: 'random' },
    smooth: { wavelet: { filtr: 'mb4' } },
    clean: { passes: 0 },
    colour: 1,
  }), [
    'INVALID_IMAGE image.data', 'NOT_PORTED quantize.cores', 'INVALID_FIELD quantize.kRange', 'INVALID_FIELD quantize.seeding',
    'UNKNOWN_FIELD smooth.wavelet.filtr', 'INVALID_FIELD clean.passes', 'UNKNOWN_FIELD colour',
  ]);
  assert.deepEqual(issues({ image: 'examples/logo_holes.png' }), ['INVALID_IMAGE image']);
});

test('stages that cannot proceed fail with a typed error', () => {
  const checker = labelImage(Array.from({ length: 12 }, (_, r) => Array.from({ length: 12 }, (_, c) => 1 + ((r + c) % 2))), [[255, 255, 255, 255], [0, 0, 0, 255]]);
  assert.throws(() => submit({ image: checker, quantize: { k: 2 }, preprocess: { pad: 0 } }), (/** @type {any} */ e) => e.code === 'CLEANUP_FAILED' && e.issues[0].path === 'clean.minRun');
  const small = labelImage(grid(20, 20, [[8, 10, 8, 10, 2]]), [[255, 255, 255, 255], [0, 0, 0, 255]]);
  assert.throws(() => submit({ image: small, quantize: { k: 2 }, smooth: { method: 'hadamard' } }), (/** @type {any} */ e) => e.code === 'HADAMARD_SHORT_CONTOUR');
  assert.equal(submit({ image: small, quantize: { k: 2 }, smooth: { method: 'hadamard' }, trace: { minLength: 17 } }).warnings[0].code, 'DROPPED_CONTOURS');
});

test('paint order puts contained shapes after their containers', () => {
  const square = (/** @type {number} */ a, /** @type {number} */ b) => ({ x: [a, b, b, a], y: [a, a, b, b] });
  const ord = plottingOrder([[square(0, 10), square(-1, 20)], [square(2, 5)], [square(3, 4)]], 0, 0.95);
  assert.deepEqual(ord.order, [1, 0, 2, 3]); // frame, big square, middle, smallest
});

test('the command line prints the result, writes the SVG and reports errors as JSON', () => {
  const cli = here('../cli.mjs');
  const logo = here('../examples/logo_holes.png');
  const out = JSON.parse(String(execFileSync(process.execPath, [cli, '--image', logo, '--svg', '/dev/null'])));
  assert.deepEqual(Object.keys(out), ['width', 'height', 'k', 'dbi', 'palette', 'regions', 'svg', 'warnings', 'timings', 'settings']);
  assert.equal(out.svg, R.runs[0].svg);
  const bad = spawnSync(process.execPath, [cli], { input: JSON.stringify({ image: logo, trace: { method: 'spline' } }) });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(String(bad.stderr)).error.issues[0].path, 'trace.method');
  assert.equal(spawnSync(process.execPath, [cli, '--image', logo, '--preview', 'p.png']).status, 2);
});
