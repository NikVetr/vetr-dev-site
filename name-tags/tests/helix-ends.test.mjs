// The tag helix's ends. The strand that does not run on into the underline ends
// square, without the hook R's repeated end points drew; the strand that does runs
// into the underline without the triangular bites its repeated junction point cut;
// where a base pair hangs from a strand's end, the notch between their square ends is
// filled to a corner. The merged laser outline never doubles back on itself.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeRequest } from '../core/request.js';
import { layoutDnaTag, measureTags } from '../core/layout.js';
import { tagHelix, tagHelixPieces } from '../core/helix.js';
import { pointInPolygon } from '../core/geometry.js';
import { ribbon, withoutRepeats } from '../../shared/helix.js';
import { rMersenneTwister } from '../../shared/rng.js';
import { BALANCED_STYLE } from '../presets.js';

/** Laid-out tags for each name, in both layout styles (odd and even twist counts). */
function tags() {
  return [undefined, BALANCED_STYLE].flatMap((style) => ['Marcus Davis', 'Ada Lovelace', 'Grace Hopper', 'Alan Turing'].map((name) => {
    const s = normalizeRequest({ names: [name], ...(style ? { style } : {}) });
    const center = s.tray.centers[0];
    const { measured, meanIar2f } = measureTags(s.lines, [center], s.font.family, s.tray.cell_in, s.tray.page_in, s.style);
    const tag = layoutDnaTag(measured[0], center, s.tray.cell_in, s.style, meanIar2f, rMersenneTwister(s.seed).unif, () => {});
    const adj = s.style.name_center_adj_prop.map((v, i) => v * s.tray.cell_in[i]);
    return { name, tag, adj, ...tagHelixPieces(tag, adj), polygons: tagHelix(tag, adj).polygons };
  }));
}
const cases = tags();

const unit = (/** @type {number} */ x, /** @type {number} */ y) => {
  const l = Math.hypot(x, y);
  return [x / l, y / l];
};
const inside = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number[][][]} */ polygons) => polygons.some((p) => pointInPolygon(x, y, p));

test('the examples cover both twist parities, so either strand is the one that stops', () => {
  const ends = new Set(cases.map((c) => /** @type {any} */ (c.tag.decoration).extend_straight));
  assert.deepEqual([...ends].sort(), [1, 2]);
});

test('the strand that does not run on ends square at its last helix point', () => {
  for (const c of cases) {
    const dec = /** @type {any} */ (c.tag.decoration);
    const piece = (dec.extend_straight === 1 ? c.shape.s2 : c.shape.s1).at(-1);
    assert.ok(piece, c.name);
    // draw_DNA repeats this strand's last point for the extension; the outline ignores the repeats
    const held = withoutRepeats(piece.x, piece.y, piece.lwd);
    const n = held.x.length;
    assert.ok(n < piece.x.length, `${c.name}: the strand's last point is repeated`);
    const [tx, ty] = unit(held.x[n - 1] - held.x[n - 2], held.y[n - 1] - held.y[n - 2]);
    const ring = ribbon(piece.x, piece.y, piece.lwd, 1);
    assert.equal(ring.length, 4 * n + 2, `${c.name}: one outline vertex each side per distinct point`);
    // the end cap is square to the strand and nothing reaches past it (R's repeats bent it into a hook)
    const [lx, ly, rx, ry] = [ring[2 * (n - 1)], ring[2 * (n - 1) + 1], ring[2 * n], ring[2 * n + 1]];
    const [cx, cy] = unit(rx - lx, ry - ly);
    assert.ok(Math.abs(cx * tx + cy * ty) < 0.05, `${c.name}: end cap at ${Math.acos(cx * tx + cy * ty)} rad`);
    const [mx, my] = [(lx + rx) / 2, (ly + ry) / 2];
    for (let k = 0; k < ring.length; k += 2) {
      const beyond = (ring[k] - mx) * tx + (ring[k + 1] - my) * ty;
      assert.ok(beyond < 0.05 * held.lwd[n - 1], `${c.name}: outline reaches ${beyond} past the end`);
    }
  }
});

test('the notch where a base pair hangs from a strand end is filled to a corner, without overshoot', () => {
  let corners = 0;
  for (const c of cases) {
    const { s1, bp } = c.shape;
    const first = s1[0];
    const end = s1[s1.length - 1];
    const last = withoutRepeats(end.x, end.y, end.lwd);
    const ends = [[first, 0, 1], [last, last.x.length - 1, last.x.length - 2]];
    for (const [strand, i, inner] of /** @type {[typeof last, number, number][]} */ (ends)) {
      const [px, py] = [strand.x[i], strand.y[i]];
      const b = bp.find((p) => p.x[0] === px && p.y[0] === py);
      if (!b) continue; // no base pair hangs here (strand 1 runs on)
      corners++;
      const [tx, ty] = unit(px - strand.x[inner], py - strand.y[inner]); // out of the strand's end
      const [dx, dy] = unit(b.x[b.x.length - 1] - px, b.y[b.y.length - 1] - py); // down the base pair
      let [nx, ny] = [-ty, tx];
      if (nx * dx + ny * dy > 0) [nx, ny] = [-nx, -ny]; // the strand's outer side
      const hs = strand.lwd[i] / 2;
      const hb = b.lwd[0] / 2;
      const at = (/** @type {number} */ a, /** @type {number} */ s) => [px + tx * a * hb + nx * s * hs, py + ty * a * hb + ny * s * hs];
      assert.ok(inside(at(0.5, 0.5)[0], at(0.5, 0.5)[1], c.polygons), `${c.name}: the notch is filled`);
      assert.ok(!inside(at(1.6, 1.6)[0], at(1.6, 1.6)[1], c.polygons), `${c.name}: the fill stops at the corner`);
    }
  }
  const even = cases.filter((c) => /** @type {any} */ (c.tag.decoration).extend_straight === 2).length;
  assert.equal(corners, cases.length + even, 'each helix starts with a corner; with an even twist count it ends with one too');
});

test('the merged outline has no slits or spikes (the boundary never doubles back)', () => {
  for (const c of cases) {
    for (const poly of c.polygons) {
      for (const r of poly) {
        const m = r.length / 2 - 1; // closed ring
        const pt = (/** @type {number} */ i) => [r[2 * ((i + m) % m)], r[2 * ((i + m) % m) + 1]];
        for (let i = 0; i < m; i++) {
          const [a, b, d] = [pt(i - 1), pt(i), pt(i + 1)];
          const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const l2 = Math.hypot(d[0] - b[0], d[1] - b[1]);
          if (l1 < 1e-3 || l2 < 1e-3) continue; // shallow crossings leave zigzags of a few 1e-4 in, far below a laser's kerf
          const cos = ((b[0] - a[0]) * (d[0] - b[0]) + (b[1] - a[1]) * (d[1] - b[1])) / (l1 * l2);
          assert.ok(cos > -0.95, `${c.name}: outline doubles back at (${b[0]}, ${b[1]})`);
        }
      }
    }
  }
});
