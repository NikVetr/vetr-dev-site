#!/usr/bin/env node
// Writes the synthetic example signatures, examples/*.csv (x, y in screen
// pixels, y down; t in milliseconds), as a trackpad would record them. No real
// person's signature is used: each is a made-up name set in the public-domain
// Hershey Simplex Script font (name-tags' glyph data), slanted, given a
// hand's wobble and a speed that follows the two-thirds power law, then
// sampled at 60 Hz with jittered timestamps and rounded to whole pixels.
// Seeded (shared/rng.js), so the files are reproducible:
//   node signature/scripts/make-examples.mjs

import { writeFileSync } from 'node:fs';
import { hersheyStrokes } from '../../name-tags/core/hershey.js';
import { rMersenneTwister } from '../../shared/rng.js';

const EXAMPLES = [
  { file: 'avery-quill.csv', text: 'Avery Quill', seed: 20230830, slant: 0.32, height: 150, rotate: -0.035 },
  { file: 'avery-quill-rough.csv', text: 'Avery Quill', seed: 20230830, slant: 0.32, height: 150, rotate: -0.035, wobble: 6, tremor: 8 },
  { file: 'juno-marsh.csv', text: 'Juno Marsh', seed: 20230831, slant: 0.18, height: 160, rotate: 0.02 },
];

/** Chaikin corner cutting, keeping the end points. @param {number[][]} p @param {number} rounds */
function chaikin(p, rounds) {
  let q = p;
  for (let r = 0; r < rounds; r++) {
    const out = [q[0]];
    for (let i = 0; i + 1 < q.length; i++) {
      const [a, b] = [q[i], q[i + 1]];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    out.push(q[q.length - 1]);
    q = out;
  }
  return q;
}

/** Points every `step` along a polyline. @param {number[][]} p @param {number} step */
function densify(p, step) {
  const out = [p[0]];
  for (let i = 0; i + 1 < p.length; i++) {
    const [a, b] = [p[i], p[i + 1]];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 1; j <= k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  return out;
}

/** A smooth random function of arc length: a sum of sinusoids. @param {() => number} unif @param {number} amp @param {number[]} wavelengths */
function wobble(unif, amp, wavelengths) {
  const terms = wavelengths.map((w) => ({ k: (2 * Math.PI) / (w * (0.7 + 0.6 * unif())), phase: 2 * Math.PI * unif(), a: amp * (0.5 + unif()) }));
  return (/** @type {number} */ s) => terms.reduce((sum, t) => sum + t.a * Math.sin(t.k * s + t.phase), 0) / Math.sqrt(terms.length);
}

/** @param {typeof EXAMPLES[number]} ex */
function makeSignature(ex) {
  const rng = rMersenneTwister(ex.seed);
  const scale = ex.height / 33; // Hershey script spans y from -21 to 12
  const [c, s] = [Math.cos(ex.rotate), Math.sin(ex.rotate)];
  // slant, rotate, y down, and a margin
  const place = (/** @type {number} */ x, /** @type {number} */ y) => {
    const px = scale * (x + ex.slant * y);
    const py = -scale * y;
    return [40 + c * px - s * py, 40 + ex.height * 0.65 + s * px + c * py];
  };
  const wx = wobble(rng.unif, ex.wobble ?? 3.2, [45, 80, 130]);
  const wy = wobble(rng.unif, ex.wobble ?? 3.2, [40, 70, 120]);
  const tx = wobble(rng.unif, ex.tremor ?? 0.9, [7, 11]);
  const ty = wobble(rng.unif, ex.tremor ?? 0.9, [6, 10]);
  const pace = wobble(rng.unif, 0.25, [120, 260]);
  const rows = [];
  let clock = 0;
  let ink = 0; // arc length over all strokes, so the wobble runs on across pen lifts
  for (const stroke of hersheyStrokes(ex.text)) {
    const path = densify(chaikin(stroke.x.map((x, i) => place(x, stroke.y[i])), 3), 0.5);
    // speed from the two-thirds power law on the intended path: v = K (kappa + kappa0)^(-1/3)
    const n = path.length;
    const kappa = path.map((p, i) => {
      const a = path[Math.max(0, i - 6)];
      const b = path[Math.min(n - 1, i + 6)];
      const turn = Math.atan2(b[1] - p[1], b[0] - p[0]) - Math.atan2(p[1] - a[1], p[0] - a[0]);
      const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn));
      return Math.abs(wrapped) / Math.max(1e-9, Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 1e-9);
    });
    let length = 0;
    const times = [0];
    for (let i = 1; i < n; i++) {
      const ds = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      length += ds;
      const ramp = Math.min(1, 0.35 + length / 25, 0.35 + (n - i) * 0.5 / 25); // accelerate off and slow onto the page
      const v = 120 * (kappa[i] + 1 / 400) ** (-1 / 3) * Math.exp(pace(ink + length)) * ramp; // px per second
      times.push(times[i - 1] + (ds / v) * 1000);
    }
    // the hand's path: the intended one, wobbled
    let s = 0;
    const hand = path.map((p, i) => {
      if (i) s += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]);
      return [p[0] + wx(ink + s) + tx(ink + s), p[1] + wy(ink + s) + ty(ink + s)];
    });
    // sample at 60 Hz with jittered timestamps, whole pixels
    const total = times[n - 1];
    let j = 0;
    for (let k = 0; ; k++) {
      const at = Math.min(total, k * (1000 / 60) + (k ? rng.norm() * 1.2 : 0));
      while (j + 1 < n - 1 && times[j + 1] < at) j++;
      const f = times[j + 1] > times[j] ? Math.min(1, Math.max(0, (at - times[j]) / (times[j + 1] - times[j]))) : 0;
      const x = hand[j][0] + (hand[j + 1][0] - hand[j][0]) * f;
      const y = hand[j][1] + (hand[j + 1][1] - hand[j][1]) * f;
      rows.push([Math.round(x), Math.round(y), Math.round((clock + at) * 10) / 10]);
      if (at >= total) break;
    }
    ink += length;
    clock += total + 140 + 120 * rng.unif(); // pen up: more than the 50 ms that splits strokes
  }
  return rows;
}

for (const ex of EXAMPLES) {
  const rows = makeSignature(ex);
  writeFileSync(new URL(`../examples/${ex.file}`, import.meta.url), `x,y,t\n${rows.map((r) => r.join(',')).join('\n')}\n`);
  console.log(ex.file, rows.length, 'samples');
}
