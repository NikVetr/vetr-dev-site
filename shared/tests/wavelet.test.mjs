// The shared MODWT against waveslim: node --test (from shared/). The fixtures
// are waveslim 1.8.5's output, written by tests/fixtures/make_wavelet_fixtures.R
// in github.com/NikVetr/raster-to-vector.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { imodwt, modwt, waveletFilter, waveletSmooth } from '../wavelet.js';

const json = (/** @type {string} */ p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const maxAbs = (/** @type {ArrayLike<number>} */ a, /** @type {ArrayLike<number>} */ b) => {
  assert.equal(a.length, b.length);
  return Math.max(0, ...Array.from(a, (v, i) => Math.abs(v - b[i])));
};

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
