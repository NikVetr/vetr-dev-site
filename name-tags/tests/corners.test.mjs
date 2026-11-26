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
import { MIN_GAP, tagCorners } from '../core/corners.js';
import { polygonDistance } from '../core/geometry.js';
import { tagHelix } from '../core/helix.js';
import { polygonArea } from '../../shared/polygon.js';
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

test('every style cuts cleanly: pieces and letters a gap apart, inside the tag, no slivers or spikes', () => {
  for (const name of [...names, 'Qian Xuesen', 'Émilie du Châtelet', 'Li Wu']) {
    for (const style of [CORNERS_STYLE, undefined]) {
      let laid;
      try { laid = laidOut(name, style); } catch (e) { if (/** @type {any} */ (e).code === 'fit_failed') continue; throw e; }
      const { s, tag, adj } = laid;
      const glyphs = tag.lines.flatMap((l) => l.glyphs.map((g) => g.map((r) => r.map((v, k) => v + adj[k % 2] + (k % 2 ? l.lowerQ : 0)))));
      for (const design of ['lines', 'triangles', 'rails']) {
        const what = `${name} ${design}`;
        const polys = tagCorners(tag, adj, { ...s.corners, style: /** @type {any} */ (design) });
        assert.ok(polys.length, `${what}: drew something`);
        polys.forEach((p, i) => {
          assert.ok(polygonArea(p) > 1e-4, `${what}: a sliver of ${polygonArea(p)} sq in`);
          for (let j = i + 1; j < polys.length; j++) assert.ok(polygonDistance(p, polys[j]) >= MIN_GAP - 1e-6, `${what}: pieces ${polygonDistance(p, polys[j])} in apart`);
          for (const g of glyphs) assert.ok(polygonDistance(p, g) >= MIN_GAP - 1e-6, `${what}: ${polygonDistance(p, g)} in from a letter`);
          for (const r of p) {
            const m = r.length / 2 - 1;
            const pt = (/** @type {number} */ k) => [r[2 * ((k + m) % m)], r[2 * ((k + m) % m) + 1]];
            for (let k = 0; k < m; k++) {
              const [a, b, d] = [pt(k - 1), pt(k), pt(k + 1)];
              const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
              const l2 = Math.hypot(d[0] - b[0], d[1] - b[1]);
              if (l1 < 1e-6 || l2 < 1e-6) continue;
              assert.ok(((b[0] - a[0]) * (d[0] - b[0]) + (b[1] - a[1]) * (d[1] - b[1])) / (l1 * l2) > -0.95, `${what}: the outline doubles back`);
            }
            for (let k = 0; k < r.length; k += 2) {
              assert.ok(r[k] > MIN_GAP && r[k] < s.tray.cell_in[0] - MIN_GAP && r[k + 1] > MIN_GAP && r[k + 1] < s.tray.cell_in[1] - MIN_GAP, `${what}: at the tag's edge`);
            }
          }
        });
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
  assert.throws(() => submit({ names, decoration: 'corners', corners: { style: 'logo', line_width: 0.005, angle: 90, extra: 1 } }), (/** @type {any} */ e) => {
    assert.ok(e instanceof NameTagsError);
    assert.deepEqual(e.issues.map((/** @type {any} */ i) => `${i.code} ${i.path}`), ['invalid_value corners.style', 'invalid_value corners.line_width', 'invalid_value corners.angle', 'unknown_field corners.extra']);
    return true;
  });
  assert.throws(() => submit({ names, decoration: 'corners', decoration_design: { mode: 'braid' } }), /requires decoration "dna"/);
  const base = submit({ names, decoration: 'corners', style: CORNERS_STYLE });
  assert.deepEqual(submit({ names, decoration: 'corners', style: CORNERS_STYLE, corners: { style: 'lines' } }), base, 'lines is the default style');
  const svgs = new Set(['triangles', 'rails'].map((design) => submit({ names, decoration: 'corners', style: CORNERS_STYLE, corners: { style: design } }).sheets[0].svg));
  assert.equal(new Set([...svgs, base.sheets[0].svg]).size, 3, 'each style draws its own design');
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
