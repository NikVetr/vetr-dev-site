// Unit tests of the DOM-free core: R-compatible numerics, the optimizer on
// known functions, names, trays, request errors, layout pieces and every
// decoration. Run with `node --test tests/*.test.mjs` from name-tags/.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { boxCost } from '../core/boxes.js';
import { erode, polygonArea, polygonDistance, ringArea } from '../core/geometry.js';
import { hersheyStrokes } from '../core/hershey.js';
import { findGaps } from '../core/helix.js';
import { NameTagsError, parseNamesCsv, parseNamesText, submit, TRAY_PRESETS } from '../core/index.js';
import { lineMetrics, measureDevice } from '../core/layout.js';
import { applyCapsRule, splitNameLines, toUpper } from '../core/names.js';
import { bfgs, brentMin } from '../core/optim.js';
import { dnorm, pnorm, rmod } from '../core/rmath.js';
import { DEFAULT_STYLE } from '../core/request.js';
import { rMersenneTwister } from '../../shared/rng.js';
import { assignCells, trayGeometry } from '../core/tray.js';

const R = JSON.parse(readFileSync(new URL('./fixtures/r-parity.json', import.meta.url), 'utf8'));
const LOGO = `data:image/svg+xml;base64,${Buffer.from(readFileSync(new URL('./fixtures/test_logo.svg', import.meta.url))).toString('base64')}`;

/** @param {string} svg */
const paths = (svg) => [...svg.matchAll(/<path ([^>]*)\/>/g)].map((m) => m[1]);
/** @param {() => unknown} fn */
function issuesOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof NameTagsError);
    return error.issues;
  }
  throw new Error('expected a NameTagsError');
}

test('random numbers match R set.seed() draws', () => {
  const a = rMersenneTwister(1);
  assert.deepEqual(R.runif_seed1.map(() => a.unif()), R.runif_seed1);
  const b = rMersenneTwister(42);
  const z = R.rnorm_seed42.map(() => b.norm());
  z.forEach((/** @type {number} */ v, /** @type {number} */ i) => assert.ok(Math.abs(v - R.rnorm_seed42[i]) < 1e-15));
});

test('distribution functions and %% match R', () => {
  for (const { x, mean, sd, p } of R.pnorm) assert.ok(Math.abs(pnorm(x, mean, sd) - p) <= 1e-15 * p);
  assert.equal(dnorm(0.3, 0, 0.2, true), R.dnorm_log);
  assert.equal(rmod(7.3, 2.453763494831886), R.mod);
});

test('BFGS with numerical gradients follows optim() on the Rosenbrock function', () => {
  const fr = (/** @type {number[]} */ x) => 100 * (x[1] - x[0] * x[0]) ** 2 + (1 - x[0]) ** 2;
  const r = bfgs(fr, [-1.2, 1]);
  r.par.forEach((v, i) => assert.ok(Math.abs(v - R.rosenbrock_bfgs.par[i]) < 1e-9));
  assert.ok(Math.abs(r.value - R.rosenbrock_bfgs.value) < 1e-12);
  assert.deepEqual([r.fevals, r.gevals], R.rosenbrock_bfgs.counts);
});

test('Brent minimisation follows optimize()', () => {
  const x = brentMin((v) => (v - 1 / 3) ** 2 + Math.sin(5 * v), -1, 2);
  assert.ok(Math.abs(x - R.brent.minimum) < 1e-12);
});

test('the box cost penalises infeasible boxes and non-positive sizes', () => {
  const cost = boxCost({ propDist: 0.2, totalWidth: 1, totalHeight: 0.6, ar1: 0.4, ar3: 0.2, meanIar2f: 2.45, opt: DEFAULT_STYLE.optimizer, iar2fWeight: 1 });
  assert.ok(cost([-0.1, 0.3, 0.1]) > 1e12);
  assert.ok(cost([0.8, 0.45, 0.09]) < cost([0.8, 0.9, 0.09]));
});

test('names split into one or two lines, with the capitals rule', () => {
  assert.deepEqual(splitNameLines('Cher'), ['Cher']);
  assert.deepEqual(splitNameLines('  Émilie  du Châtelet '), ['Émilie', 'du Châtelet']);
  assert.deepEqual(splitNameLines('Mary Ann|Evans'), ['Mary Ann', 'Evans']);
  assert.equal(typeof splitNameLines('a|b|c'), 'string');
  assert.deepEqual(applyCapsRule(['Hedy', 'Lamarr']), ['HEDY', 'LAMARR']);
  assert.deepEqual(applyCapsRule(['Ada', 'Lovelace']), ['Ada', 'Lovelace']);
  assert.equal(toUpper('straße'), 'STRAßE'); // R's toupper leaves ß alone
  assert.deepEqual(parseNamesText('Ada Lovelace\n\n Alan Turing \n'), ['Ada Lovelace', 'Alan Turing']);
  assert.deepEqual(parseNamesCsv('name,logo\n"Lovelace, Ada",a.svg\nAlan Turing,\n'), [{ name: 'Lovelace, Ada', logo: 'a.svg' }, { name: 'Alan Turing', logo: null }]);
});

test('the keychain_big preset and custom trays give the expected cells', () => {
  const { tray } = trayGeometry({ name: 'keychain_big', ...TRAY_PRESETS.keychain_big });
  assert.equal(tray.n_cells, 64);
  assert.deepEqual(tray.centers[0], [1.7, 1.56]);
  assert.ok(Math.abs(tray.centers[8][1] - (1.56 + 1.4126)) < 1e-12); // cell 9 = second row
  const custom = trayGeometry({ page_in: [12, 6], grid: [4, 3], cell_in: [2.5, 1.4], spacing_in: [0.3, 0.3], first_center_in: [1.6, 1.15] });
  assert.deepEqual(custom.tray.centers[11], [1.6 + 3 * 2.8, 1.15 + 2 * 1.7]);
  assert.deepEqual(trayGeometry({ page_in: [6, 3], cell_in: [2, 1], centers_in: [[5.5, 1]] }).outside, [1]);
  assert.deepEqual(assignCells(66, 64, null).slice(63).map((p) => [p.sheet, p.cell]), [[1, 64], [2, 1], [2, 2]]);
  assert.deepEqual(assignCells(4, 64, [1, 64, 3, 1]).map((p) => p.sheet), [1, 1, 1, 2]);
});

test('requests are checked before any work, every problem listed', () => {
  const issues = issuesOf(() => submit({ names: ['Ada Lovelace', 'a|b|c'], colour: 1, style: { restart: 2, optimizer: { restart: 2 } }, decoration: 'corner', ncores: 4 }));
  const paths_ = issues.map((i) => i.path);
  for (const p of ['colour', 'names[1]', 'style.restart', 'style.optimizer.restart', 'decoration', 'ncores']) assert.ok(paths_.includes(p), p);
  assert.equal(issuesOf(() => submit({})).find((i) => i.path === 'names')?.code, 'missing_field');
  assert.equal(issuesOf(() => submit({ names_file: 'x.txt' }))[0].code, 'cli_only');
  assert.equal(issuesOf(() => submit({ names: ['Ada Lovelace'], decoration: 'logo' }))[0].path, 'logo.file');
  assert.match(issuesOf(() => submit({ names: ['Ada Lovelace'], tray: { page_in: [6, 3], cell_in: [2, 1], centers_in: [[5.5, 1]] } }))[0].message, /past the page/);
  assert.equal(issuesOf(() => submit({ names: ['Ada Lovelace'], tray: 'no_such_tray' }))[0].path, 'tray');
  assert.equal(issuesOf(() => submit({ names: ['A B', 'C D'], cells: [1, 65] }))[0].code, 'out_of_range');
  assert.equal(issuesOf(() => submit({ names: ['Ada Lovelace'], decoration: 'hershey_ekg', font: { family: 'Arial' } }))[0].path, 'font.family');
  assert.equal(issuesOf(() => submit({ names: ['Ada 李'], decoration: 'hershey_ekg' }))[0].code, 'unsupported_character');
});

test('line metrics use the R device fallback widths', () => {
  const m = lineMetrics(['Ada', 'Lovelace'], [2.19 - 2.19 / 4.5, 1.22 - 2.19 / 4.5], DEFAULT_STYLE);
  assert.equal(m[0].w / m[0].cex, 0.25); // three half-em characters at 12 pt
  assert.equal(m[1].w / m[1].cex, 0.6666666666666666);
  const d = measureDevice([23.77, 13]);
  assert.ok(Math.abs(d.upiY - 1.08) < 1e-12 && d.upiX > d.upiY); // 4% padding; width truncated to 1711 pt
});

test('geometry: erosion, distance, gaps', () => {
  const sq = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0];
  const e = erode([sq], 0.1);
  assert.equal(e.length, 1);
  assert.ok(Math.abs(polygonArea(e[0]) - 0.64) < 1e-7); // Clipper works on a grid of ~2e-8 of the extent
  const circle = Array.from({ length: 201 }, (_, i) => [Math.cos(2 * Math.PI * i / 200), Math.sin(2 * Math.PI * i / 200)]).flat();
  const ring = erode([circle], 0.1);
  assert.equal(ring.length, 1); // no slivers left at the vertices
  assert.ok(Math.abs(Math.abs(ringArea(ring[0][0])) - Math.PI * 0.81) < 2e-3);
  assert.equal(polygonDistance([sq], [sq.map((v, i) => (i % 2 ? v : v + 3))]), 2);
  assert.equal(polygonDistance([sq], [sq.map((v) => v + 0.5)]), 0);
  assert.deepEqual(findGaps([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [0, 0, 2, 2, 0, 0, 0, 3, 3, 0], 1, 0), [[1, 2], [5, 7], [10, 10]]);
});

test('Hershey strokes join where one ends and a later one starts', () => {
  const s = hersheyStrokes('a lovelace');
  assert.deepEqual(s.map((st) => st.x.length), [21,17,35,32,21,13,16]); // points per stroke, as R's hershey_strokes() reads them back
});

test('a DNA fit matches the R fit for the same seed', () => {
  const res = submit({ names: R.two_names.names, style: { optimizer: { restarts: R.two_names.restarts } } });
  res.tags.forEach((t, i) => {
    const r = R.two_names.fit[i];
    assert.deepEqual(t.lines, R.two_names.lines[i]);
    assert.equal(t.fit.ntwists, r.ntwists);
    for (const k of ['w1', 'w2', 'h2', 'ar1', 'ar3']) assert.ok(Math.abs(t.fit[k] - r[k]) < 1e-4, `${k}: ${t.fit[k]} vs ${r[k]}`);
  });
});

test('every decoration writes a sheet with one outline per tag', () => {
  const people = ['Ada Lovelace', 'Cher', 'Mary Ann|Evans', 'Émilie du Châtelet'];
  const outlines = (/** @type {string} */ svg) => paths(svg).filter((p) => p.includes('fill="none"')).length;
  const none = submit({ names: people, decoration: 'none' });
  assert.deepEqual(none.tags.map((t) => t.decoration), ['none', 'none', 'none', 'none']);
  assert.deepEqual(none.tags[2].lines, ['MARY ANN', 'EVANS']);
  assert.equal(outlines(none.sheets[0].svg), 4);
  assert.equal(paths(none.sheets[0].svg).length - 4, people.join('').replace(/[ |]/g, '').length); // one path per glyph
  const dna = submit({ names: people, style: { optimizer: { restarts: 2 } } });
  assert.deepEqual(dna.tags.map((t) => t.decoration), ['dna', 'none', 'dna', 'dna']); // one-line names carry no helix
  assert.ok(dna.tags.filter((t) => t.fit).every((t) => t.fit.ntwists >= 1));
  const ekg = submit({ names: people.slice(0, 2), decoration: 'hershey_ekg' });
  assert.equal(outlines(ekg.sheets[0].svg), 2);
  assert.ok(paths(ekg.sheets[0].svg).length >= 4);
  const logo = submit({ names: people.slice(0, 2), decoration: 'logo', logo: { file: LOGO } });
  assert.equal(logo.sheets[0].kind, 'logos');
  assert.equal(logo.sheets[0].file, 'nametags_logos_grid_1.svg');
  assert.equal(paths(logo.sheets[0].svg).length - 2, 4); // framed square and disc per tag; the unfilled stroke is dropped
  const colours = submit({ names: ['Ada Lovelace'], decoration: 'logo', logo: { file: LOGO, use_file_colors: true } });
  assert.match(colours.sheets[0].svg, /fill="#CC0000"/);
});

test('names beyond a tray-full continue on further sheets', () => {
  const res = submit({ names: ['Ada Lovelace', 'Alan Turing', 'Grace Hopper'], decoration: 'none', tray: { page_in: [6, 3], grid: [2, 1], cell_in: [2.19, 1.22], spacing_in: [0.3, 0], first_center_in: [1.5, 1.5] } });
  assert.deepEqual(res.sheets.map((s) => s.file), ['nametags_names_grid_1.svg', 'nametags_names_grid_2.svg']);
  assert.match(res.sheets[0].svg, /width="6in" height="3in" viewBox="0 0 576 288"/);
});
