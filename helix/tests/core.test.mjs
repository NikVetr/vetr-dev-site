// Core tests: the R parity fixture (draw_DNA's strands, base pairs and outlines; braid_segment's
// cuts, depth order and strands), the braid's crossings, the three SVG styles, validation
// errors, the worked example in api.md and the command line. Run with `node --test` in helix/.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { dnaShape, ribbon } from '../../shared/helix.js';
import { seqLength } from '../../shared/rstats.js';
import { polygonArea, union } from '../../shared/polygon.js';
import { braidDrawing, braidFrame } from '../core/braid.js';
import { flatten } from '../core/draw.js';
import { drawDnaOptions, helixDrawing } from '../core/helix.js';
import { BRAID_DEFAULTS, HelixError, submit } from '../core/index.js';
import { normalizeRequest } from '../core/request.js';

const here = new URL('..', import.meta.url);
/** @type {{ cases: any[] }} */
const fixture = JSON.parse(readFileSync(new URL('tests/fixtures/r-parity.json', here), 'utf8'));
const helixCases = fixture.cases.filter((c) => c.request.mode === 'helix');
const braidCases = fixture.cases.filter((c) => c.request.mode === 'braid');
const arr = (/** @type {any} */ x) => (Array.isArray(x) ? x : [x]); // R's JSON writes one-element arrays as scalars
const sampled = (/** @type {number} */ n, k = 10) => [...new Set([...Array.from({ length: Math.ceil(n / k) }, (_, i) => i * k), n - 1])];

/** @param {number} a @param {number} b @param {number} tol @param {string} what */
function close(a, b, tol, what) {
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
}

/** @param {unknown} request */
function rejects(request) {
  try {
    submit(request);
  } catch (error) {
    assert.ok(error instanceof HelixError, String(error));
    return error;
  }
  throw new Error('the request was accepted');
}

test('helix: every strand piece and base pair R\'s draw_DNA draws, to 1e-9', () => {
  for (const c of helixCases) {
    const r = submit(c.request);
    const g = /** @type {any} */ (r.geometry);
    const pieces = [...g.strands[0].pieces, ...g.strands[1].pieces];
    const nStrand = c.pieces.length - c.segments.length;
    assert.equal(pieces.length, nStrand, `${c.name}: strand pieces`);
    // the tool places the drawing on its canvas (y down); R centres it: align at the first point
    const [X0, Y0] = pieces[0][0];
    const [x0, y0] = [arr(c.pieces[0].x)[0], arr(c.pieces[0].y)[0]];
    const tol = 1e-9 * Math.max(r.width, r.height);
    pieces.forEach((p, i) => {
      const rp = c.pieces[i];
      assert.equal(p.length, rp.n, `${c.name}: piece ${i} points`);
      sampled(p.length).forEach((k, j) => {
        close(p[k][0] - X0, arr(rp.x)[j] - x0, tol, `${c.name} piece ${i} x[${k}]`);
        close(Y0 - p[k][1], arr(rp.y)[j] - y0, tol, `${c.name} piece ${i} y[${k}]`);
        close(p[k][2], arr(rp.lwd)[j], 1e-12, `${c.name} piece ${i} lwd[${k}]`);
      });
    });
    // R draws a base pair once per position asked for; past the end of a helix with a
    // one-strand extension several ask for its last point, and the port keeps the first
    const index = arr(c.bp_index);
    const segs = index.map((_, i) => i).filter((i) => index.indexOf(index[i]) === i);
    assert.equal(g.basePairs.length, segs.length, `${c.name}: base pairs`);
    g.basePairs.forEach((/** @type {any} */ bp, /** @type {number} */ i) => {
      const s = c.segments[segs[i]];
      const piece = c.pieces[nStrand + segs[i]];
      close(bp.from[0] - X0, s[0] - x0, tol, `${c.name} bp ${i} x0`);
      close(Y0 - bp.from[1], s[1] - y0, tol, `${c.name} bp ${i} y0`);
      close(bp.to[0] - X0, s[2] - x0, tol, `${c.name} bp ${i} x1`);
      close(Y0 - bp.to[1], s[3] - y0, tol, `${c.name} bp ${i} y1`);
      assert.equal(bp.points, piece.n);
      close(bp.widths[0], arr(piece.lwd)[0], 1e-12, `${c.name} bp ${i} width`);
      close(bp.widths[1], arr(piece.lwd).at(-1), 1e-12, `${c.name} bp ${i} width`);
    });
  }
});

test('helix: the outline of a piece is R\'s polylines() polygon', () => {
  for (const c of helixCases) {
    const req = normalizeRequest(c.request);
    if (req.mode !== 'helix') throw new Error('helix case');
    const shape = dnaShape(drawDnaOptions(req.helix));
    const ref = shape.s1[0];
    for (const ring of c.rings) {
      const p = shape.pieces[ring.piece];
      const mine = ribbon(p.x, p.y, p.lwd, 1);
      assert.equal(mine.length / 2, ring.n, `${c.name}: ring ${ring.piece} points`);
      sampled(ring.n, 25).forEach((k, j) => {
        close(mine[2 * k] - ref.x[0], arr(ring.x)[j] - arr(c.pieces[0].x)[0], 1e-9, `${c.name} ring x[${k}]`);
        close(mine[2 * k + 1] - ref.y[0], arr(ring.y)[j] - arr(c.pieces[0].y)[0], 1e-9, `${c.name} ring y[${k}]`);
      });
    }
  }
});

test('braid: R\'s cuts, depth order between cuts and strand quadrilaterals', () => {
  for (const c of braidCases) {
    const r = submit(c.request);
    const g = /** @type {any} */ (r.geometry);
    const breaks = arr(c.breaks);
    const L = c.request.braid.length;
    if (c.request.braid.twists < 0) {
      // R adds the depth-swap cuts for twists > 0 only; this port adds them for either hand
      assert.equal(breaks.length, c.request.braid.minSegments + 1, c.name);
      assert.ok(g.breaks.length > breaks.length, c.name);
      for (const t of breaks) assert.ok(g.breaks.some((/** @type {number} */ u) => Math.abs(u - t) < 1e-9 * L), `${c.name}: cut ${t}`);
      continue;
    }
    assert.equal(g.breaks.length, breaks.length, `${c.name}: cuts`);
    g.breaks.forEach((/** @type {number} */ t, /** @type {number} */ i) => close(t, breaks[i], 1e-9 * L, `${c.name} cut ${i}`));
    g.layers.forEach((/** @type {any} */ layer, /** @type {number} */ j) => assert.deepEqual(layer.order, arr(c.order[j]), `${c.name}: order in segment ${j}`));
    close(g.strandWidth, c.request.braid.width / c.request.braid.colors.length, 1e-12, c.name);
    // each quadrilateral's near edge is centred on the strand's centreline there
    const first = c.quads[0].strands[arr(c.order[0]).indexOf(0)];
    const [X0, Y0] = g.strands[0].centerline[0];
    const [x0, y0] = [(first[0] + first[3]) / 2, (first[4] + first[7]) / 2];
    for (const q of c.quads) {
      arr(c.order[q.segment]).forEach((/** @type {number} */ strand, /** @type {number} */ d) => {
        const v = q.strands[d]; // x1..x4, y1..y4
        const [X, Y] = g.strands[strand].centerline[q.segment];
        close(X - X0, (v[0] + v[3]) / 2 - x0, 1e-9 * L, `${c.name} segment ${q.segment} strand ${strand} x`);
        close(Y0 - Y, (v[4] + v[7]) / 2 - y0, 1e-9 * L, `${c.name} segment ${q.segment} strand ${strand} y`);
        close(Math.hypot(v[3] - v[0], v[7] - v[4]), g.strandWidth, 1e-9 * L, `${c.name} strand width`);
      });
    }
  }
});

test('braid: at every crossing the strand in front is drawn over the other, here and in R', () => {
  let seen = 0;
  for (const c of braidCases) {
    const req = normalizeRequest(c.request);
    if (req.mode !== 'braid') throw new Error('braid case');
    const r = submit(c.request);
    const g = /** @type {any} */ (r.geometry);
    const internal = braidDrawing(req.braid).geometry((x, y) => [x, y]);
    const fills = braidDrawing(req.braid).fills;
    const breaks = arr(c.breaks);
    for (const [i, x] of g.crossings.entries()) {
      seen++;
      const layer = g.layers.find((/** @type {any} */ l) => l.from <= x.at && x.at <= l.to);
      assert.ok(layer.order.indexOf(x.over) > layer.order.indexOf(x.under), `${c.name}: crossing at ${x.at}`);
      if (req.braid.twists > 0) {
        const j = breaks.findIndex((/** @type {number} */ t, /** @type {number} */ k) => t <= x.at && x.at <= breaks[k + 1]);
        const order = arr(c.order[j]);
        assert.ok(order.indexOf(x.over) > order.indexOf(x.under), `${c.name}: R's order at ${x.at}`);
      }
      // the crossing point lies in the visible region of the strand in front only
      const [px, py] = /** @type {any} */ (internal).crossings[i].point;
      assert.ok(inside(px, py, fills[x.over].shapes[0]), `${c.name}: over at ${x.at}`);
      assert.ok(!inside(px, py, fills[x.under].shapes[0]), `${c.name}: under at ${x.at}`);
    }
  }
  assert.ok(seen > 50);
});

test('the visible regions do not overlap and together cover the whole drawing', () => {
  const area = (/** @type {number[][][]} */ polys) => polys.reduce((a, p) => a + polygonArea(p), 0);
  const cases = [
    ...braidCases.map((c) => /** @type {any} */ (normalizeRequest(c.request)).braid),
    { ...BRAID_DEFAULTS, colors: ['#111', '#222', '#333', '#444', '#555', '#666', '#777'], twists: -3.3, minSegments: 7 },
  ];
  for (const b of cases) {
    const regions = braidDrawing(b).fills.map((f) => f.shapes[0]);
    const tol = 1e-6 * b.length * b.width; // each strand is cut on its own Clipper grid, about 1e-8 of the extent
    close(regions.reduce((a, r) => a + area(r), 0), area(union(regions.flat(2), 'nonzero')), tol, 'regions overlap');
    // every strand's whole band, painted
    const fr = braidFrame(b);
    const bands = fr.breaks.slice(1).flatMap((t1, s) => fr.phases.map((_, i) => {
      const [c0, c1] = [fr.centre(fr.breaks[s], i), fr.centre(t1, i)];
      const e = fr.edge;
      return [c0[0] - e[0], c0[1] - e[1], c1[0] - e[0], c1[1] - e[1], c1[0] + e[0], c1[1] + e[1], c0[0] + e[0], c0[1] + e[1], c0[0] - e[0], c0[1] - e[1]];
    }));
    close(area(union(regions.flat(2), 'nonzero')), area(union(bands, 'nonzero')), tol, 'regions cover the bands');
  }
  // the helix's outlines: later colours cut away earlier ones
  const req = /** @type {any} */ (normalizeRequest({ helix: { colors: { strand1: '#a00', strand2: '#0a0', basePairs: '#00a' } } })).helix;
  const drawing = helixDrawing(req);
  const regions = flatten(drawing.fills);
  assert.equal(regions.length, 3);
  const painted = union(drawing.fills.flatMap((f) => f.shapes.flat(2)), 'nonzero');
  close(regions.reduce((a, r) => a + area(r.polygons), 0), area(painted), 1e-6 * area(painted), 'helix regions');
});

/** Even-odd point in polygons. @param {number} x @param {number} y @param {number[][][]} polygons */
function inside(x, y, polygons) {
  let k = false;
  for (const r of polygons.flat()) {
    for (let i = 0; i + 3 < r.length; i += 2) {
      if ((r[i + 1] > y) !== (r[i + 3] > y) && x < (r[i + 2] - r[i]) * (y - r[i + 1]) / (r[i + 3] - r[i + 1]) + r[i]) k = !k;
    }
  }
  return k;
}

test('helix: base pairs run from strand 1 towards strand 2, also with grooves', () => {
  // with a phase shift of 150° strand 2 is not opposite strand 1, so R's rule of pointing a
  // base pair towards the axis would point some away from strand 2
  const req = /** @type {any} */ (normalizeRequest({ helix: { phaseShift: 150 } }));
  const o = drawDnaOptions(req.helix);
  const shape = dnaShape(o);
  const t = seqLength(o.dhBounds[0], o.dhBounds[1], o.points);
  let away = 0;
  shape.bp.forEach((bp, i) => {
    const tk = t[shape.bpIndex[i]];
    const towards = Math.sign(Math.sin(tk + o.phaseShift) - Math.sin(tk));
    assert.equal(Math.sign(bp.x[bp.x.length - 1] - bp.x[0]), towards);
    if (towards !== (Math.sin(tk) >= 0 ? -1 : 1)) away++;
  });
  assert.ok(away > 0, 'R\'s rule would point some the other way');
});

test('the three styles share one canvas and draw what they say', () => {
  for (const mode of ['helix', 'braid']) {
    const svgs = ['filled', 'outline', 'strokes'].map((style) => submit({ mode, output: { style } }));
    for (const r of svgs) {
      assert.equal(r.width, svgs[0].width);
      assert.equal(r.height, svgs[0].height);
      assert.match(r.svg, new RegExp(`width="${Number(r.width.toFixed(3))}mm" height="${Number(r.height.toFixed(3))}mm"`));
    }
    assert.match(svgs[0].svg, /<g id="strand-1" fill="#[0-9A-Fa-f]{6}" fill-rule="evenodd">/);
    assert.doesNotMatch(svgs[0].svg, /stroke=/);
    assert.match(svgs[1].svg, /fill="none" stroke="#[0-9A-Fa-f]{6}" stroke-width="0.1"/);
    assert.match(svgs[2].svg, /stroke-linecap="round"/);
  }
  // one colour: the helix's outline is one path
  const one = submit({ output: { style: 'outline', unit: 'in' } });
  assert.equal(one.svg.match(/<path/g)?.length, 1);
  assert.match(one.svg, /stroke-width="0.0039"/);
  // three colours: one path each, cut where later parts cover earlier ones
  const three = submit({ helix: { colors: { strand1: '#aa0000', strand2: '#00aa00', basePairs: '#0000aa' } }, output: { style: 'outline' } });
  assert.equal(three.svg.match(/<path/g)?.length, 3);
  // a background, a margin and px
  const bg = submit({ output: { background: '#ffffff', margin: 5, unit: 'px' } });
  assert.match(bg.svg, /<rect width="[\d.]+" height="[\d.]+" fill="#ffffff"\/>/);
  assert.match(bg.svg, /<svg [^>]*width="[\d.]+" height="[\d.]+" viewBox/);
  assert.equal(bg.width, submit({ output: { unit: 'px' } }).width + 10);
});

test('the edge widens every piece by half its width on each side', () => {
  const thin = { strokeWidth: 0.001 }; // so the canvas follows the filled shapes
  const plain = submit({ output: thin });
  const edged = submit({ helix: { edgeWidth: 0.5 }, output: thin });
  close(edged.width - plain.width, 0.5, 0.01, 'width');
  close(edged.height - plain.height, 0.5, 0.01, 'height');
});

test('the helix\'s box: contain keeps the aspect ratio, stretch fills the box', () => {
  const contain = /** @type {any} */ (submit({ helix: { box: { width: 50, height: 50 } } }).geometry);
  const stretch = /** @type {any} */ (submit({ helix: { box: { width: 50, height: 50, fit: 'stretch' } } }).geometry);
  const span = (/** @type {any} */ g, /** @type {number} */ axis) => {
    const v = g.strands.flatMap((/** @type {any} */ s) => s.pieces.flat().map((/** @type {number[]} */ p) => p[axis]));
    return Math.max(...v) - Math.min(...v);
  };
  close(span(contain, 1), 50, 1e-9, 'contain height');
  assert.ok(span(contain, 0) < 10);
  close(span(stretch, 0), 50, 0.6, 'stretch width'); // the widest points are not sampled exactly
  close(span(stretch, 1), 50, 1e-9, 'stretch height');
});

test('no base pairs, an extension, and a single strand braid', () => {
  assert.equal(/** @type {any} */ (submit({ helix: { basePairsPerTurn: 0 } }).geometry).basePairs.length, 0);
  const ext = /** @type {any} */ (submit({ helix: { extension: { strands: 'strand2', length: 2, taper: true } } }).geometry);
  const widths = ext.strands[1].pieces.at(-1).map((/** @type {number[]} */ p) => p[2]);
  close(widths.at(-1), 0.5, 1e-12, 'a tapered extension ends at the thinnest width');
  const one = /** @type {any} */ (submit({ mode: 'braid', braid: { colors: ['#000'] } }).geometry);
  assert.equal(one.crossings.length, 0);
  assert.equal(one.strandWidth, 10);
});

test('invalid requests list every problem with its path', () => {
  const e = /** @type {HelixError} */ (rejects({
    mode: 'helix', colour: 'red', braid: {},
    helix: { turns: -1, points: 2.5, extension: { strands: 'left', size: 1 }, colors: { strand1: 'red' }, box: 'big' },
    output: { style: 'pdf', margin: -1 },
  }));
  assert.equal(e.code, 'invalid_request');
  const got = e.issues.map((i) => `${i.code} ${i.path}`).sort();
  assert.deepEqual(got, [
    'conflicting_fields braid',
    'invalid_color helix.colors.strand1',
    'out_of_range helix.extension.strands',
    'out_of_range helix.turns',
    'out_of_range output.margin',
    'out_of_range output.style',
    'unknown_field colour',
    'unknown_field helix.extension.size',
    'wrong_type helix.box',
    'wrong_type helix.points',
  ]);
  assert.match(e.message, /^Invalid request: /);
  assert.deepEqual(JSON.parse(JSON.stringify(e)).error.issues, e.issues);
  assert.equal(rejects([]).issues[0].code, 'wrong_type');
  assert.deepEqual(rejects({ mode: 'braid', braid: { colors: ['#123', 7, '#12'], minSegments: 0 } }).issues.map((i) => i.path),
    ['braid.colors[1]', 'braid.colors[2]', 'braid.minSegments']);
  assert.equal(rejects({ mode: 'braid', braid: { colors: [] } }).issues[0].code, 'out_of_range');
  assert.equal(rejects({ mode: 'knot' }).issues[0].path, 'mode');
  assert.equal(rejects({ mode: 'braid', braid: { minSegments: 5000, colors: Array(12).fill('#000') } }).issues[0].path, 'braid');
});

test('the worked example in api.md is what the command line prints', () => {
  const doc = readFileSync(new URL('api.md', here), 'utf8');
  const request = JSON.parse(/** @type {string} */ (/`request\.json`:\n\n```json\n([\s\S]*?)```/.exec(doc)?.[1]));
  const shown = JSON.parse(/** @type {string} */ (/prints \(abridged[^\n]*\n\n```json\n([\s\S]*?)```/.exec(doc)?.[1]));
  const cli = new URL('cli.mjs', here).pathname;
  const r = JSON.parse(execFileSync('node', [cli], { input: JSON.stringify(request), encoding: 'utf8' }));
  const g = r.geometry;
  assert.deepEqual({
    unit: r.unit, width: r.width, height: r.height, strokeWidth: r.strokeWidth, outlineWidth: r.outlineWidth,
    geometry: {
      strandWidth: g.strandWidth, breaks: g.breaks,
      strands: [{ color: g.strands[0].color, phase: g.strands[0].phase, centerline: g.strands[0].centerline.slice(0, 2) }],
      layers: g.layers.slice(0, 2), crossings: g.crossings.slice(0, 2),
    },
  }, shown);
  assert.equal(g.crossings.length, 6);
  assert.equal(r.svg.match(/<path id="strand-\d" fill="none" stroke="#[0-9A-F]{6}" stroke-width="0.1"/g)?.length, 3);
});

test('the command line writes the SVG and prints the result; errors are JSON with status 1 or 2', () => {
  const cli = new URL('cli.mjs', here).pathname;
  const dir = mkdtempSync(join(tmpdir(), 'helix-cli-'));
  try {
    const out = JSON.parse(execFileSync('node', [cli, '--svg', join(dir, 'h.svg')], { input: '{"helix": {"turns": 1}}', encoding: 'utf8' }));
    assert.equal(out.request.helix.turns, 1);
    assert.equal(readFileSync(join(dir, 'h.svg'), 'utf8'), submit({ helix: { turns: 1 } }).svg);
    const svg = execFileSync('node', [cli, '-', '--svg', '-'], { input: '{"mode": "braid"}', encoding: 'utf8' });
    assert.ok(svg.startsWith('<?xml'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const bad = spawnSync('node', [cli], { input: '{"helix": {"turns": 0}}', encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.issues[0].path, 'helix.turns');
  assert.equal(spawnSync('node', [cli], { input: '{', encoding: 'utf8' }).status, 1);
  assert.equal(spawnSync('node', [cli, 'a.json', 'b.json'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', [cli, '--svg'], { input: '{}', encoding: 'utf8' }).status, 2);
});
