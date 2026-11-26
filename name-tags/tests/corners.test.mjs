// The angled-corners decoration: the DNA layout and fit with corner bands in place of
// the helix, clear of the text and inside the tag, through submit() and the CLI.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NameTagsError, submit } from '../core/index.js';
import { normalizeRequest } from '../core/request.js';
import { layoutDnaTag, measureTags } from '../core/layout.js';
import { tagCorners } from '../core/corners.js';
import { tagHelix } from '../core/helix.js';
import { polygonArea, union } from '../../shared/polygon.js';
import { rMersenneTwister } from '../../shared/rng.js';
import { CORNERS_STYLE } from '../presets.js';

const names = ['Marcus Davis', 'Alan Turing', 'Grace Hopper', 'Hedy Lamarr'];
const glyphPaths = (/** @type {string} */ svg) => [...svg.matchAll(/<path fill="#000000" fill-rule="evenodd" d="[^"]*"\/>/g)].map((m) => m[0]);

/** @param {string} name @param {any} [style] */
function laidOut(name, style = CORNERS_STYLE) {
  const s = normalizeRequest({ names: [name], decoration: 'corners', style });
  const center = s.tray.centers[0];
  const { measured, meanIar2f } = measureTags(s.lines, [center], s.font.family, s.tray.cell_in, s.tray.page_in, s.style);
  const tag = layoutDnaTag(measured[0], center, s.tray.cell_in, s.style, meanIar2f, rMersenneTwister(s.seed).unif, () => {});
  const adj = s.style.name_center_adj_prop.map((v, i) => v * s.tray.cell_in[i]);
  return { s, tag, adj };
}
const area = (/** @type {number[][][]} */ polygons) => polygons.reduce((a, p) => a + polygonArea(p), 0);

test('the corners use the DNA layout and fit unchanged, and keep every glyph', () => {
  for (const style of [undefined, CORNERS_STYLE]) {
    const dna = submit({ names, ...(style ? { style } : {}) });
    const corners = submit({ names: [...names, 'Cher'], decoration: 'corners', ...(style ? { style } : {}) });
    assert.deepEqual(corners.tags.slice(0, names.length).map(({ decoration, ...t }) => t), dna.tags.map(({ decoration, ...t }) => t));
    assert.deepEqual(corners.tags.map((t) => t.decoration), ['corners', 'corners', 'corners', 'corners', 'none']);
    // the corners are fill-only paths, so the glyphs are the sheet's other fill-only paths
    const kept = glyphPaths(corners.sheets[0].svg);
    for (const path of glyphPaths(dna.sheets[0].svg)) assert.ok(kept.includes(path), 'a glyph outline changed');
  }
});

test('the corner bands stay clear of the letters and inside the tag', () => {
  for (const name of names) {
    for (const style of [CORNERS_STYLE, undefined]) {
      const { s, tag, adj } = laidOut(name, style);
      const o = s.corners;
      const polys = tagCorners(tag, adj, o);
      assert.ok(polys.length, `${name}: drew something`);
      const glyphs = tag.lines.flatMap((l) => l.glyphs.map((g) => g.map((r) => r.map((v, k) => v + adj[k % 2] + (k % 2 ? l.lowerQ : 0)))));
      const both = area(union([...glyphs.flat(), ...polys.flat()], 'nonzero'));
      const apart = area(union(glyphs.flat(), 'nonzero')) + area(polys);
      assert.ok(Math.abs(both - apart) < 1e-6, `${name}: the bands overlap the letters by ${apart - both} sq in`);
      for (const p of polys) for (const r of p) for (let k = 0; k < r.length; k += 2) {
        assert.ok(r[k] > 0 && r[k] < s.tray.cell_in[0] && r[k + 1] > 0 && r[k + 1] < s.tray.cell_in[1], `${name}: outside the tag`);
      }
    }
  }
});

test('with the corner proportions the top-right leg comes down to the bottom line, as the R calls ask', () => {
  for (const name of names) {
    const { s, tag, adj } = laidOut(name);
    const bottomTop = Math.max(...tag.lines[1].glyphs.flat(2).filter((_, k) => k % 2).map((y) => y + adj[1]));
    const bottomRight = Math.max(...tag.lines[1].glyphs.flat(2).filter((_, k) => k % 2 === 0).map((x) => x + adj[0]));
    const polys = tagCorners(tag, adj, s.corners);
    // the lowest point right of the bottom line is the leg's level cut, at the bottom line's top
    const right = polys.flat(2).filter((_, k, a) => k % 2 === 1 && a[k - 1] > bottomRight + s.corners.line_width / 4); // past the underline's end
    assert.ok(Math.abs(Math.min(...right) - bottomTop) < 1e-6, `${name}: leg stops at ${Math.min(...right)}, line top ${bottomTop}`);
  }
});

test('the underline keeps the descender gaps the helix leaves', () => {
  for (const name of ['Alan Turing', 'Grace Hopper']) {
    const { s, tag, adj } = laidOut(name);
    const gaps = tagHelix(tag, adj).gaps ?? [];
    assert.ok(gaps.length, `${name} has descenders across the underline`);
    const polys = tagCorners(tag, adj, s.corners);
    const by0 = /** @type {any} */ (tag.decoration).bbox[1] + adj[1];
    const low = polys.flat(2).flatMap((v, k, a) => (k % 2 === 0 && Math.abs(a[k + 1] - by0) <= s.corners.line_width / 2 + 1e-6 ? [v] : []));
    for (const [a, b] of gaps) assert.ok(!low.some((x) => x > a + 1e-6 && x < b - 1e-6), `${name}: the underline crosses a descender`);
    if (name === 'Grace Hopper') assert.ok(low.some((x) => x > gaps[gaps.length - 1][1] - 1e-6), 'the underline resumes after the p');
  }
});

test('corner options are validated and only belong to the corners decoration', () => {
  assert.throws(() => submit({ names, decoration: 'corners', corners: { line_width: 0, angle: 90, extra: 1 } }), (/** @type {any} */ e) => {
    assert.ok(e instanceof NameTagsError);
    assert.deepEqual(e.issues.map((/** @type {any} */ i) => `${i.code} ${i.path}`), ['invalid_value corners.line_width', 'invalid_value corners.angle', 'unknown_field corners.extra']);
    return true;
  });
  assert.throws(() => submit({ names, decoration: 'corners', decoration_design: { mode: 'braid' } }), /requires decoration "dna"/);
  const plain = submit({ names, decoration: 'corners', style: CORNERS_STYLE, corners: { triangle: false, line_width: 0.03 } });
  assert.notEqual(plain.sheets[0].svg, submit({ names, decoration: 'corners', style: CORNERS_STYLE }).sheets[0].svg);
});

test('the command line draws the same sheet', () => {
  const request = { names, decoration: 'corners', style: { ...CORNERS_STYLE, optimizer: { ...CORNERS_STYLE.optimizer, restarts: 5 } } };
  const expected = submit(request);
  const dir = mkdtempSync(join(tmpdir(), 'name-tags-corners-'));
  try {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../cli.mjs', import.meta.url)), '--out', dir], { input: JSON.stringify(request), encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    assert.equal(run.status, 0, run.stderr);
    const actual = JSON.parse(run.stdout);
    actual.sheets = actual.sheets.map((/** @type {any} */ { path, ...sheet }) => ({ ...sheet, svg: readFileSync(path, 'utf8') }));
    assert.deepEqual(actual, expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
