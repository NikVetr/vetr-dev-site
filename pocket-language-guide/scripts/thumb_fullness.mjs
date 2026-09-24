// How full each pre-rendered first face is.
//
// The gallery shows `packs/<pair>/thumb.png`, which is face 1 of the pair's sheet,
// and a face that is a third blank is what a reader sees first. This reads the
// committed `face-1.svg.gz` of every pack rather than solving anything: the lowest
// ink in each column against the column's height is the fraction that is used, and
// the face's fullness is the mean over its columns. Pairs under the threshold are
// listed, worst first.
//
//   node scripts/thumb_fullness.mjs [--under 0.8] [--only <target>]

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const argv = process.argv.slice(2);
const under = argv.includes('--under') ? Number(argv[argv.indexOf('--under') + 1]) : 0.8;
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

/** @param {string} svg */
function fullness(svg) {
  const [, w, h] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) ?? [];
  const pageW = Number(w), pageH = Number(h);
  // Every drawn thing with a position: text runs and rects (row shades, rules).
  /** @type {{x:number, y:number}[]} */ const inks = [];
  for (const m of svg.matchAll(/<text[^>]* x="([-\d.]+)"[^>]* y="([-\d.]+)"/g)) inks.push({ x: Number(m[1]), y: Number(m[2]) });
  for (const m of svg.matchAll(/<rect[^>]* x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)) {
    const [x, y, rw, rh] = m.slice(1).map(Number);
    if (rw > pageW * 0.9 || rh > pageH * 0.9) continue; // the page and any bleed
    inks.push({ x, y: y + rh });
  }
  if (!inks.length) return { fill: 0, columns: 0 };
  // Columns by clustering x into the page's quarters is wrong for other column
  // counts, so cluster on gaps: sort the xs, split where the gap exceeds a tenth
  // of the width.
  const xs = [...new Set(inks.map((i) => Math.round(i.x)))].sort((a, b) => a - b);
  /** @type {number[][]} */ const groups = [];
  let last = -Infinity;
  for (const x of xs) {
    if (x - last > pageW * 0.1) groups.push([x]); else groups[groups.length - 1].push(x);
    last = x;
  }
  // Against the page, not against the lowest ink on the face: a face whose columns
  // all stop a third of the way down is balanced, and a third full.
  const top = Math.min(...inks.map((i) => i.y));
  const bottom = pageH - top;
  const fills = groups.map((g) => {
    const lo = g[0] - 1, hi = g[g.length - 1] + 1;
    const ys = inks.filter((i) => i.x >= lo && i.x <= hi).map((i) => i.y);
    return ys.length ? (Math.max(...ys) - top) / (bottom - top) : 0;
  });
  return { fill: fills.reduce((a, b) => a + b, 0) / fills.length, columns: fills.length };
}

const rows = [];
for (const dir of readdirSync('packs').sort()) {
  if (only && !dir.startsWith(`${only}__`)) continue;
  const file = `packs/${dir}/face-1.svg.gz`;
  if (!existsSync(file)) continue;
  const svg = gunzipSync(readFileSync(file)).toString('utf8');
  rows.push({ pair: dir, ...fullness(svg) });
}
rows.sort((a, b) => a.fill - b.fill);
const sparse = rows.filter((r) => r.fill < under);
console.log(`${rows.length} packs; ${sparse.length} under ${under}`);
for (const r of sparse.slice(0, 60)) console.log(`  ${r.pair.padEnd(18)} ${r.fill.toFixed(2)}  (${r.columns} col)`);
const byTarget = new Map();
for (const r of sparse) { const t = r.pair.split('__')[0]; byTarget.set(t, (byTarget.get(t) ?? 0) + 1); }
if (sparse.length) console.log('by target:', [...byTarget.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(' '));
