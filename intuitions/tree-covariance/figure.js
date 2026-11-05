// Figures for a tree as a covariance matrix, as SVG strings (no DOM access). The tree is
// drawn with the root at the left and every branch labelled with its length; a shared
// path is heavy and blue, pruned parts faint and dashed, and a pruned node's extension a
// dotted continuation of its branch, as drawingSimple3TipTrees.R draws D′. The tips'
// arrows are A, B and C in the gallery's three slots (blue circle, orange triangle,
// green square).

import { formatNumber } from '../lib/format.js';
import { arcPoints, renderScene } from '../lib/geom3d.js';
import { normalize, scale } from '../lib/linalg.js';
import { axisBottom, axisLeft, el, linePath, marker, niceTicks, scaleLinear, svgRoot, text, textWidth } from '../lib/plot.js';
import { heights, rectangularLayout } from '../lib/tree.js';

/** @typedef {import('../lib/tree.js').Tree} Tree */
/** @typedef {import('../lib/plot.js').Point} Point */
/** @typedef {import('../lib/geom3d.js').Primitive} Primitive */
/** @typedef {import('../lib/geom3d.js').Vec3} Vec3 */
/** @typedef {import('../lib/plot.js').Shape} Shape */

export const ARROW_STYLE = [
  { line: 'a-stroke', mark: 'a-mark', swatch: 'a-line', shape: /** @type {Shape} */ ('circle') },
  { line: 'b-stroke', mark: 'b-mark', swatch: 'b-line', shape: /** @type {Shape} */ ('triangle') },
  { line: 'c-stroke', mark: 'c-mark', swatch: 'c-line', shape: /** @type {Shape} */ ('square') },
];

/** A length for a label: whole when it is, else up to three significant figures. @param {number} v */
export const len = (v) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(3)))).replace(/^-/, '−');

/**
 * The tree, root at the left. `strong` branches (by the node below them) are heavy and
 * blue; `faded` ones faint and dashed; `extensions` adds a dotted continuation beyond a
 * node with a label (D′); `notes` writes a value beside a node; `root` marks the root.
 * @param {Tree} tree
 * @param {{ width: number, height: number, label: string, strong?: Set<number>, faded?: Set<number>, extensions?: Map<number, { length: number, label: string }>,
 *   notes?: Map<number, string>, nodeLabels?: boolean, compact?: boolean }} options
 */
export function treeFigure(tree, { width, height, label, strong = new Set(), faded = new Set(), extensions = new Map(), notes = new Map(), nodeLabels = true, compact = false }) {
  const h = heights(tree);
  const { y: rows, rows: n } = rectangularLayout(tree);
  const reach = Math.max(...tree.parent.map((_, i) => h[i] + (extensions.get(i)?.length ?? 0)));
  const labelRoom = compact ? 4 : Math.max(...tree.label.map((l, i) => (tree.children[i].length ? 0 : textWidth(l ?? '', 13)))) + Math.max(0, ...[...notes.values()].map((s) => textWidth(s, 11.5) + 8)) + 14;
  const left = compact ? 6 : Math.max(40, textWidth(`root, ${tree.label[0] ?? ''}`, 12) + 12);
  const x = scaleLinear([0, reach || 1], [left, width - labelRoom]);
  const top = compact ? 8 : 24;
  const y = scaleLinear([0, Math.max(1, n - 1)], [top, height - (compact ? 8 : 18)]);
  const parts = [];
  for (let node = 0; node < tree.parent.length; node++) {
    const parent = tree.parent[node];
    const start = parent < 0 ? 0 : h[parent];
    const cls = strong.has(node) ? 'branch strong' : faded.has(node) ? 'branch faded' : 'branch';
    if (h[node] > start) {
      parts.push(el('line', { x1: x(start), x2: x(h[node]), y1: y(rows[node]), y2: y(rows[node]), class: cls }));
      if (!compact) parts.push(text((x(start) + x(h[node])) / 2, y(rows[node]) - 5, len(tree.length[node]), { class: `length-label${faded.has(node) ? ' faded' : ''}`, 'text-anchor': 'middle' }));
    }
    const kids = tree.children[node];
    if (kids.length > 1) {
      const cls2 = kids.every((k) => faded.has(k)) ? 'branch faded' : 'branch';
      parts.push(el('line', { x1: x(h[node]), x2: x(h[node]), y1: y(rows[kids[0]]), y2: y(rows[kids[kids.length - 1]]), class: cls2 }));
    }
    const ext = extensions.get(node);
    if (ext) {
      parts.push(el('line', { x1: x(h[node]), x2: x(h[node] + ext.length), y1: y(rows[node]), y2: y(rows[node]), class: 'extension' }));
      if (!compact) parts.push(text(x(h[node] + ext.length) + 4, y(rows[node]) + 4, ext.label, { class: 'node-name strong' }));
    }
  }
  if (!compact) {
    for (let node = 0; node < tree.parent.length; node++) {
      const isTip = !tree.children[node].length;
      const ext = extensions.get(node);
      const px = x(h[node] + (ext?.length ?? 0));
      if (isTip) parts.push(text(x(h[node]) + 5, y(rows[node]) + 4.5, tree.label[node] ?? '', { class: `tip-name${faded.has(node) ? ' faded' : ''}` }));
      else if (nodeLabels && !ext && node > 0) parts.push(text(x(h[node]) - 4, y(rows[node]) + 15, tree.label[node] ?? '', { class: 'node-name', 'text-anchor': 'end' }));
      const note = notes.get(node);
      if (note) parts.push(text(px + (isTip ? textWidth(tree.label[node] ?? '', 13) + 9 : ext ? textWidth(ext.label, 13) + 9 : 6), y(rows[node]) + 4, note, { class: 'node-note' }));
    }
    parts.push(marker('circle', x(0), y(rows[0]), 4, 'ink-mark'), text(x(0) - 7, y(rows[0]) + 4, `root, ${tree.label[0] ?? ''}`, { class: 'node-name', 'text-anchor': 'end' }));
  }
  return svgRoot({ width, height, label }, parts);
}

/**
 * The chosen tips as arrows from a common origin, with the angle between each pair.
 * Their dot products are the shared path lengths, so cos(angle) is the correlation.
 * @param {{ tips: string[], vectors: number[][], angles: { tips: string[], degrees: number, correlation: number }[] }} arrows
 * @param {import('../lib/geom3d.js').Camera} camera
 */
export function arrowsScene(arrows, camera) {
  const longest = Math.max(...arrows.vectors.map((v) => Math.hypot(...v)));
  const vectors = arrows.vectors.map((v) => /** @type {Vec3} */ (v.map((c) => c / longest)));
  /** @type {Primitive[]} */
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const end = /** @type {Vec3} */ ([0, 0, 0].map((_, i) => (i === k ? 1.1 : 0)));
    parts.push({ kind: 'line', from: /** @type {Vec3} */ (scale(end, -0.25)), to: end, class: 'axis3' });
  }
  vectors.forEach((v, i) => {
    const s = ARROW_STYLE[i];
    parts.push({ kind: 'line', from: [0, 0, 0], to: v, class: `arrow ${s.line}` },
      { kind: 'point', at: v, class: s.mark, shape: s.shape, size: 5.5 },
      { kind: 'label', at: /** @type {Vec3} */ (scale(v, 1.14)), text: arrows.tips[i], class: 'scene-label strong', dy: 4 });
  });
  for (const a of arrows.angles) {
    const i = arrows.tips.indexOf(a.tips[0]);
    const j = arrows.tips.indexOf(a.tips[1]);
    const radius = 0.22 + 0.07 * (i + j);
    const points = arcPoints(/** @type {Vec3} */ (normalize(vectors[i])), /** @type {Vec3} */ (normalize(vectors[j])), radius, 24);
    parts.push({ kind: 'path', points, class: 'angle-arc' }, { kind: 'label', at: /** @type {Vec3} */ (scale(points[12], 1.25)), text: `${Math.round(a.degrees)}°`, class: 'scene-label small', dy: 4 });
  }
  const pairs = arrows.angles.map((a) => `${a.tips.join(' and ')} at ${Math.round(a.degrees)}°`).join(', ');
  return renderScene(camera, parts, { label: `The tips ${arrows.tips.join(', ')} as arrows whose dot products are their shared path lengths: ${pairs}.` });
}

/**
 * Simulated values of two tips with the ellipse that holds 95% of them under the VCV.
 * @param {{ x: number[], y: number[] }} sample @param {number[][]} cov 2 × 2 @param {string[]} names
 * @param {{ width: number, height: number }} size
 */
export function scatterFigure(sample, cov, names, { width, height }) {
  const left = 44;
  const bottom = 40;
  const top = 12;
  const right = 12;
  const r = Math.max(Math.sqrt(cov[0][0]), Math.sqrt(cov[1][1])) * 3.2;
  const x = scaleLinear([-r, r], [left, width - right]);
  const y = scaleLinear([-r, r], [height - bottom, top]);
  const dots = sample.x.map((v, i) => (Math.abs(v) < r && Math.abs(sample.y[i]) < r ? `M${x(v).toFixed(1)} ${y(sample.y[i]).toFixed(1)}h0` : '')).join('');
  const [[a, b], [, d]] = cov;
  const l1 = Math.sqrt(a);
  const l21 = b / l1;
  const l22 = Math.sqrt(Math.max(0, d - l21 * l21));
  const q = Math.sqrt(5.991);
  /** @type {Point[]} */
  const ring = Array.from({ length: 73 }, (_, i) => {
    const t = (2 * Math.PI * i) / 72;
    return [x(l1 * q * Math.cos(t)), y(l21 * q * Math.cos(t) + l22 * q * Math.sin(t))];
  });
  const ticks = niceTicks(-r, r, Math.max(3, Math.floor((width - left - right) / 70)));
  const rho = b / Math.sqrt(a * d);
  return svgRoot({ width, height, label: `${sample.x.length} simulated pairs of tip values, ${names[0]} against ${names[1]}; their covariance under the tree is ${len(b)}, a correlation of ${formatNumber(rho, 2)}.` },
    axisLeft({ scale: y, x: left, ticks, format: (v) => String(v).replace('-', '−'), gridTo: width - right }),
    el('path', { d: dots, class: 'scatter-dots' }),
    el('path', { d: `${linePath(ring)}Z`, class: 'ellipse-ring' }),
    axisBottom({ scale: x, y: height - bottom, ticks, format: (v) => String(v).replace('-', '−'), label: names[0], labelGap: 32 }),
    text(left + 6, top + 12, names[1], { class: 'axis-label halo' }));
}

/**
 * The log-likelihoods as the root slides along the path between two tips: the
 * restricted one flat, the ordinary one changing, and the current root marked.
 * @param {any} sweep the reroot result's sweep @param {{ width: number, height: number }} size
 */
export function sweepFigure(sweep, { width, height }) {
  const left = 52;
  const right = 14;
  const top = 18;
  const bottom = 42;
  const total = sweep.marks[sweep.marks.length - 1].at;
  const x = scaleLinear([0, total], [left, width - right]);
  const values = [...sweep.reml, ...sweep.ml];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.12 || 1;
  const y = scaleLinear([lo - pad, hi + pad], [height - bottom, top]);
  /** @type {Point[]} */
  const ml = sweep.positions.map((/** @type {number} */ p, /** @type {number} */ i) => [x(p), y(sweep.ml[i])]);
  /** @type {Point[]} */
  const reml = sweep.positions.map((/** @type {number} */ p, /** @type {number} */ i) => [x(p), y(sweep.reml[i])]);
  const parts = [axisLeft({ scale: y, x: left, ticks: niceTicks(lo - pad, hi + pad, 4), format: (v) => String(v).replace('-', '−'), gridTo: width - right })];
  for (const m of sweep.marks) {
    parts.push(el('line', { x1: x(m.at), x2: x(m.at), y1: top, y2: height - bottom, class: 'grid' }), text(x(m.at), height - bottom + 16, m.label, { class: 'tick strong-tick', 'text-anchor': 'middle' }));
  }
  // The points stop short of the two tips, where the ordinary likelihood is unbounded.
  parts.push(el('path', { d: linePath(ml), class: 'b-line' }));
  parts.push(el('path', { d: linePath(reml), class: 'ink-line' }));
  if (sweep.current !== null) {
    const cx = x(sweep.current);
    parts.push(el('line', { x1: cx, x2: cx, y1: top - 6, y2: height - bottom, class: 'root-line' }));
  }
  parts.push(text(x(0) + 4, y(sweep.reml[0]) - 7, 'restricted, root integrated out', { class: 'direct-label halo' }));
  // The ordinary curve is labelled at its lowest point, below it.
  const low = sweep.ml.indexOf(Math.min(...sweep.ml));
  const lx = Math.min(width - right - textWidth('ordinary, root estimated') / 2, Math.max(left + textWidth('ordinary, root estimated') / 2, x(sweep.positions[low])));
  parts.push(text(lx, Math.min(height - bottom - 4, y(sweep.ml[low]) + 16), 'ordinary, root estimated', { class: 'direct-label halo', 'text-anchor': 'middle' }));
  parts.push(text((left + width - right) / 2, height - 6, `where the root is, from ${sweep.tips[0]} to ${sweep.tips[1]}`, { class: 'axis-label', 'text-anchor': 'middle' }));
  return svgRoot({ width, height, label: `Log-likelihoods as the root moves from ${sweep.tips[0]} to ${sweep.tips[1]}: the restricted one stays at ${formatNumber(sweep.reml[0], 3)}; the ordinary one, with the root's state estimated, changes and rises toward each tip.` }, parts);
}

/**
 * The index thumbnail: the tree with the path two tips share in blue, beside its
 * covariance matrix with that pair's cells outlined.
 * @param {any} result a covariance result @param {string[]} pair @param {{ width: number, height: number }} size
 */
export function covarianceThumbnail(result, pair, { width, height }) {
  const tree = /** @type {Tree} */ ({ parent: result.tree.parent, children: result.tree.children, length: result.tree.length, label: result.tree.label });
  const up = (/** @type {number} */ n) => { const out = []; for (let k = n; k >= 0; k = tree.parent[k]) out.push(k); return out; };
  const a = up(tree.label.indexOf(pair[0]));
  const b = up(tree.label.indexOf(pair[1]));
  const strong = new Set(a.filter((n) => n > 0 && b.includes(n)));
  const n = result.tips.length;
  const cell = Math.min((height - 12) / n, (width * 0.4) / n);
  const tw = width - n * cell - 18;
  const max = Math.max(...result.vcv.flat());
  const ia = result.tips.indexOf(pair[0]);
  const ib = result.tips.indexOf(pair[1]);
  const squares = result.vcv.flatMap((/** @type {number[]} */ row, /** @type {number} */ i) => row.map((c, j) => {
    const shade = Math.min(6, Math.round((c / max) * 6));
    const picked = (i === ia && j === ib) || (i === ib && j === ia);
    return el('rect', { x: tw + 12 + j * cell, y: 6 + i * cell, width: cell - 2, height: cell - 2, rx: 2, class: `seq-${shade} cell-fill${picked ? ' cell-picked' : ''}` });
  }));
  return svgRoot({ width, height, label: 'A tree and its covariance matrix.' },
    el('g', {}, treeFigure(tree, { width: tw, height, compact: true, strong, label: '' }).replace(/^<svg[^>]*>|<\/svg>$/g, '')),
    squares);
}
