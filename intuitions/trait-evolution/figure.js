// Figures for traits on a tree, as SVG strings (no DOM access). Lineages are ink; a clade
// that shifts to a second optimum is orange and bracketed by name; the band is where 95%
// of a single lineage would be. Each time figure is drawn whole once and then revealed up
// to the playback time through a clip shape, with a time front (a line or circle and a
// dot on every lineage alive at that time) redrawn on its own, so playback never redraws
// the paths. The 3-D view and the bridge are drawn whole at each time or level.

import { formatNumber } from '../lib/format.js';
import { renderScene } from '../lib/geom3d.js';
import { axisBottom, axisLeft, el, linePath, marker, niceTicks, scaleLinear, svgRoot, text, textWidth } from '../lib/plot.js';
import { fanLayout, rectangularLayout } from '../lib/tree.js';

/** @typedef {import('../lib/plot.js').Point} Point */
/** @typedef {import('../lib/plot.js').Scale} Scale */
/** @typedef {import('../lib/geom3d.js').Primitive} Primitive */
/** @typedef {import('../lib/geom3d.js').Camera} Camera */
/** @typedef {import('../lib/geom3d.js').Vec3} Vec3 */
/**
 * @typedef {{ newick: string, parent: number[], children: number[][], length: number[], label: (string | null)[], height: number[] }} TreeOut
 * @typedef {{ node: number, regime?: number, times: number[], values: number[] }} Branch
 */

/** A number for an axis tick. @param {number} v */
const tick = (v) => String(Number(v.toPrecision(6))).replace(/^-/, '−');

/** The margins every time figure shares, so their time axes line up. @param {number} width @param {number} labelWidth @param {boolean} compact */
export function timeFrame(width, labelWidth, compact) {
  const left = compact ? 6 : 46;
  const right = compact ? 6 : Math.max(14, Math.min(width * 0.3, labelWidth + 22));
  return { left, right, x: (/** @type {number} */ height) => scaleLinear([0, height], [left, width - right]) };
}

/** Width of the widest tip label, for the label column. @param {TreeOut} tree */
export function labelColumn(tree) {
  return Math.max(0, ...tree.children.map((kids, i) => (kids.length ? 0 : textWidth(tree.label[i] ?? '', 11.5))));
}

/** Where a branch is at time t, by linear interpolation between its steps, or null if not alive. @param {Branch} b @param {number} t */
export function valueAt(b, t) {
  const { times, values } = b;
  if (t < times[0] - 1e-12 || t > times[times.length - 1] + 1e-12) return null;
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo];
  const f = span > 0 ? Math.min(1, Math.max(0, (t - times[lo]) / span)) : 1;
  return values[lo] + f * (values[hi] - values[lo]);
}

/**
 * Labels spread apart vertically by at least `gap`, inside [top, bottom].
 * @template {{ y: number }} T
 * @param {T[]} items @param {number} gap @param {number} top @param {number} bottom
 * @returns {T[]}
 */
function spread(items, gap, top, bottom) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let pass = 0; pass < 50; pass++) {
    let moved = false;
    for (let i = 1; i < sorted.length; i++) {
      const overlap = sorted[i - 1].y + gap - sorted[i].y;
      if (overlap > 0.01) {
        sorted[i - 1].y -= overlap / 2;
        sorted[i].y += overlap / 2;
        moved = true;
      }
    }
    if (sorted.length) {
      const shiftDown = top - sorted[0].y;
      if (shiftDown > 0) for (const s of sorted) s.y += shiftDown;
      const shiftUp = sorted[sorted.length - 1].y - bottom;
      if (shiftUp > 0) for (const s of sorted) s.y -= shiftUp;
    }
    if (!moved) break;
  }
  return sorted;
}

/**
 * The phylogeny with time across, or as a fan with time outward. The whole tree is drawn
 * faint and its past again in ink inside `#<id>-clip`, which the page widens (or, for a
 * fan, grows) to the playback time; `#<id>-front` is the time front.
 * @param {{ tree: TreeOut, treeHeight: number, clade: { node: number, tips: string[] } | null }} result
 * @param {{ width: number, height: number, layout?: 'rectangular' | 'fan', id: string, compact?: boolean }} options
 */
export function treeFigure(result, { width, height, layout = 'rectangular', id, compact = false }) {
  const { tree, treeHeight } = result;
  const inClade = cladeMembers(tree, result.clade?.node ?? -1);
  const tipCount = tree.children.filter((k) => !k.length).length;
  if (layout === 'fan') return fanFigure(result, { width, height, id, compact, inClade, tipCount });
  const frame = timeFrame(width, labelColumn(tree), compact);
  const x = frame.x(treeHeight);
  const { y: rows, rows: n } = rectangularLayout(/** @type {any} */ (tree));
  const top = compact ? 6 : 12;
  const bottom = compact ? 6 : 12;
  const y = scaleLinear([0, Math.max(1, n - 1)], [top, height - bottom]);
  const gap = (height - top - bottom) / Math.max(1, n - 1);
  const segments = (/** @type {(node: number) => boolean} */ keep) => tree.parent.map((parent, node) => {
    if (!keep(node)) return '';
    const start = parent < 0 ? 0 : tree.height[parent];
    const horizontal = tree.height[node] > start ? `M${x(start).toFixed(2)} ${y(rows[node]).toFixed(2)}H${x(tree.height[node]).toFixed(2)}` : '';
    const kids = tree.children[node];
    const vertical = kids.length > 1 ? `M${x(tree.height[node]).toFixed(2)} ${y(rows[kids[0]]).toFixed(2)}V${y(rows[kids[kids.length - 1]]).toFixed(2)}` : '';
    return horizontal + vertical;
  }).join('');
  const parts = [
    el('defs', {}, el('clipPath', { id: `${id}-clip` }, el('rect', { x: 0, y: 0, width: x(treeHeight) + 1, height, class: 'reveal' }))),
    el('path', { d: segments(() => true), class: 'tree-future' }),
    el('g', { 'clip-path': `url(#${id}-clip)` },
      el('path', { d: segments((node) => !inClade[node]), class: 'tree-branch' }),
      inClade.some(Boolean) ? el('path', { d: segments((node) => inClade[node]), class: 'tree-branch clade' }) : ''),
  ];
  if (!compact && gap >= 10) {
    tree.children.forEach((kids, node) => {
      if (kids.length) return;
      parts.push(text(x(tree.height[node]) + 5, y(rows[node]) + 4, tree.label[node] ?? '', { class: `tip-label${inClade[node] ? ' clade' : ''}` }));
    });
  }
  if (!compact && result.clade) {
    const tips = tree.children.map((_, i) => i).filter((i) => !tree.children[i].length && inClade[i]);
    const ys = tips.map((i) => y(rows[i]));
    const bx = width - 8;
    parts.push(el('path', { d: `M${bx - 4} ${Math.min(...ys) - 4}H${bx}V${Math.max(...ys) + 4}H${bx - 4}`, class: 'clade-bracket' }));
  }
  parts.push(el('line', { x1: x(treeHeight), x2: x(treeHeight), y1: 2, y2: height - 2, class: 'front-line', id: `${id}-front` }));
  const label = `The tree, ${tipCount} tips, time from left to right${result.clade ? `; the orange clade (${result.clade.tips.join(', ')}) shifts to the second optimum` : ''}.`;
  return { svg: svgRoot({ width, height, label }, parts), x, showsLabels: !compact && gap >= 10 };
}

/** Which nodes are in the clade (the clade's node and all below it). @param {TreeOut} tree @param {number} clade */
function cladeMembers(tree, clade) {
  const member = tree.parent.map(() => false);
  if (clade < 0) return member;
  for (let node = 0; node < tree.parent.length; node++) {
    for (let n = node; n >= 0; n = tree.parent[n]) {
      if (n === clade) {
        member[node] = true;
        break;
      }
    }
  }
  return member;
}

/**
 * @param {{ tree: TreeOut, treeHeight: number, clade: { node: number, tips: string[] } | null }} result
 * @param {{ width: number, height: number, id: string, compact: boolean, inClade: boolean[], tipCount: number }} options
 */
function fanFigure(result, { width, height, id, compact, inClade, tipCount }) {
  const { tree, treeHeight } = result;
  const { angle } = fanLayout(/** @type {any} */ (tree));
  const labelRoom = compact ? 4 : labelColumn(tree) + 10;
  const R = Math.max(20, Math.min(width, height) / 2 - labelRoom);
  const cx = width / 2;
  const cy = height / 2;
  const r = scaleLinear([0, treeHeight], [0, R]);
  const at = (/** @type {number} */ radius, /** @type {number} */ a) => [cx + radius * Math.sin(a), cy - radius * Math.cos(a)];
  const segments = (/** @type {(node: number) => boolean} */ keep) => tree.parent.map((parent, node) => {
    if (!keep(node)) return '';
    const start = parent < 0 ? 0 : tree.height[parent];
    const [x0, y0] = at(r(start), angle[node]);
    const [x1, y1] = at(r(tree.height[node]), angle[node]);
    const radial = tree.height[node] > start ? `M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}` : '';
    const kids = tree.children[node];
    let arc = '';
    if (kids.length > 1 && tree.height[node] > 0) {
      const a0 = angle[kids[0]];
      const a1 = angle[kids[kids.length - 1]];
      const [ax, ay] = at(r(tree.height[node]), a0);
      const [bx, by] = at(r(tree.height[node]), a1);
      arc = `M${ax.toFixed(2)} ${ay.toFixed(2)}A${r(tree.height[node]).toFixed(2)} ${r(tree.height[node]).toFixed(2)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${bx.toFixed(2)} ${by.toFixed(2)}`;
    }
    return radial + arc;
  }).join('');
  const parts = [
    el('defs', {}, el('clipPath', { id: `${id}-clip` }, el('circle', { cx, cy, r: R + 1, class: 'reveal' }))),
    el('path', { d: segments(() => true), class: 'tree-future' }),
    el('g', { 'clip-path': `url(#${id}-clip)` },
      el('path', { d: segments((node) => !inClade[node]), class: 'tree-branch' }),
      inClade.some(Boolean) ? el('path', { d: segments((node) => inClade[node]), class: 'tree-branch clade' }) : ''),
  ];
  const arcGap = (2 * Math.PI * R) / Math.max(1, tipCount);
  if (!compact && arcGap >= 12) {
    tree.children.forEach((kids, node) => {
      if (kids.length) return;
      const a = angle[node];
      const [lx, ly] = at(r(tree.height[node]) + 6, a);
      const s = Math.sin(a);
      parts.push(text(lx, ly + 4 + 4 * Math.cos(a) * -1, tree.label[node] ?? '', { class: `tip-label${inClade[node] ? ' clade' : ''}`, 'text-anchor': s > 0.2 ? 'start' : s < -0.2 ? 'end' : 'middle' }));
    });
  }
  parts.push(el('circle', { cx, cy, r: R, class: 'front-ring', id: `${id}-front` }));
  const label = `The tree as a fan, ${tipCount} tips, time outward from the centre${result.clade ? `; the orange clade (${result.clade.tips.join(', ')}) shifts to the second optimum` : ''}.`;
  return { svg: svgRoot({ width, height, label }, parts), radius: r, centre: [cx, cy], showsLabels: !compact && arcGap >= 12 };
}

/**
 * The trait through time: one path per branch, the band where 95% of one lineage would
 * be, the optima or the burst time, and the tips' names at the end (spread apart). The
 * paths are inside `#<id>-clip`; `#<id>-front` holds the time front and `#<id>-tips`
 * the tip names, which the page shows once every tip is reached.
 * @param {any} result the tree view's result
 * @param {{ width: number, height: number, id: string, compact?: boolean, params?: any }} options
 */
export function phenogramFigure(result, { width, height, id, compact = false, params = {} }) {
  const { tree, treeHeight, branches, envelope: env } = result;
  const frame = timeFrame(width, labelColumn(tree), compact);
  const x = frame.x(treeHeight);
  const top = compact ? 6 : 16;
  const bottom = compact ? 6 : 42;
  const lows = [];
  const highs = [];
  for (const b of branches) for (const v of b.values) { lows.push(v); highs.push(v); }
  const band = (/** @type {{ mean: number[], sd: number[] }} */ e) => e.mean.map((m, i) => [m - 1.96 * e.sd[i], m + 1.96 * e.sd[i]]);
  const bands = [band(env), ...(env.clade ? [band(env.clade)] : [])];
  for (const bb of bands) for (const [lo, hi] of bb) { lows.push(lo); highs.push(hi); }
  const optima = result.model === 'ou' ? [{ value: params.theta, label: `θ = ${tick(params.theta)}`, cls: 'optimum' }]
    : result.model === 'shift' ? [{ value: params.theta, label: `θ₁ = ${tick(params.theta)}`, cls: 'optimum' }, { value: params.theta2, label: `θ₂ = ${tick(params.theta2)}`, cls: 'optimum clade' }] : [];
  for (const o of optima) { lows.push(o.value); highs.push(o.value); }
  let lo = Math.min(...lows);
  let hi = Math.max(...highs);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.04;
  const y = scaleLinear([lo - pad, hi + pad], [height - bottom, top]);
  const parts = [el('defs', {}, el('clipPath', { id: `${id}-clip` }, el('rect', { x: 0, y: 0, width: x(treeHeight) + 1, height, class: 'reveal' })))];
  if (!compact) parts.push(axisLeft({ scale: y, x: frame.left, ticks: niceTicks(lo - pad, hi + pad, Math.max(3, Math.floor((height - top - bottom) / 45))), format: tick, gridTo: width - frame.right }));
  bands.forEach((bb, k) => {
    const times = env.times;
    const from = k === 0 ? -Infinity : env.clade.from;
    /** @type {Point[]} */
    const upper = [];
    /** @type {Point[]} */
    const lower = [];
    times.forEach((/** @type {number} */ t, /** @type {number} */ i) => {
      if (t < from - 1e-12) return;
      upper.push([x(t), y(bb[i][1])]);
      lower.push([x(t), y(bb[i][0])]);
    });
    parts.push(el('path', { d: `${linePath(upper)}${[...lower].reverse().map(([px, py]) => `L${px.toFixed(2)} ${py.toFixed(2)}`).join('')}Z`, class: k === 0 ? (env.clade ? 'band ink' : 'band') : 'band clade' }));
  });
  for (const o of optima) {
    parts.push(el('line', { x1: frame.left, x2: x(treeHeight), y1: y(o.value), y2: y(o.value), class: `optimum-line${o.cls.includes('clade') ? ' clade' : ''}` }));
    if (!compact) parts.push(text(frame.left + 6, y(o.value) - 5, o.label, { class: `direct-label halo${o.cls.includes('clade') ? ' clade-text' : ''}` }));
  }
  if (result.model === 'burst' && !compact) {
    const tb = params.burstAt * treeHeight;
    parts.push(el('line', { x1: x(tb), x2: x(tb), y1: top, y2: height - bottom, class: 'burst-line' }), text(x(tb) + 4, top + 10, 'burst', { class: 'direct-label halo' }));
  }
  const pathOf = (/** @type {Branch} */ b) => linePath(b.times.map((t, i) => /** @type {Point} */ ([x(t), y(b.values[i])])));
  parts.push(el('g', { 'clip-path': `url(#${id}-clip)` },
    el('path', { d: branches.filter((/** @type {Branch} */ b) => b.regime !== 2).map(pathOf).join(''), class: 'lineage' }),
    branches.some((/** @type {Branch} */ b) => b.regime === 2) ? el('path', { d: branches.filter((/** @type {Branch} */ b) => b.regime === 2).map(pathOf).join(''), class: 'lineage clade' }) : ''));
  // Tip names at the right, spread apart, with a leader from each path's end.
  let showsLabels = false;
  if (!compact) {
    /** @type {{ y: number, end: number, label: string, ex: number, clade: boolean }[]} */
    const items = result.tips.map((/** @type {any} */ t) => ({ y: y(t.value), end: y(t.value), label: t.label, ex: x(tree.height[t.node]), clade: branches.find((/** @type {Branch} */ b) => b.node === t.node)?.regime === 2 }));
    const gap = 13;
    if (items.length * gap <= height - top - bottom + gap) {
      showsLabels = true;
      const placed = spread(items, gap, top + 4, height - bottom);
      const lx = x(treeHeight) + 8;
      parts.push(el('g', { id: `${id}-tips`, class: 'tip-names' }, placed.map((p) => [
        el('path', { d: `M${p.ex.toFixed(2)} ${p.end.toFixed(2)}L${(lx - 2).toFixed(2)} ${p.y.toFixed(2)}`, class: 'leader' }),
        text(lx, p.y + 4, p.label, { class: `tip-label${p.clade ? ' clade' : ''}` }),
      ]).flat()));
    }
    parts.push(axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(0, treeHeight, Math.max(3, Math.floor((width - frame.left - frame.right) / 70))), format: tick, label: params.tree && 'tips' in params.tree ? 'time, in tree heights' : 'time, in branch-length units', labelGap: 34 }));
    parts.push(text(frame.left - 40, top - 4, 'trait', { class: 'axis-label' }));
  }
  parts.push(el('g', { id: `${id}-front` }));
  const label = `The trait along every branch through time, ${result.tips.length} tips${optima.length ? `, with ${optima.map((o) => o.label).join(' and ')}` : ''}. The band is where 95% of a single lineage would be.`;
  return { svg: svgRoot({ width, height, label }, parts), x, y, showsLabels };
}

/**
 * The time front at t for a phenogram: a vertical line and a dot on every lineage alive.
 * @param {any} result @param {Scale} x @param {Scale} y @param {number} t @param {number} top @param {number} bottom
 */
export function phenogramFront(result, x, y, t, top, bottom) {
  const dots = [];
  for (const b of result.branches) {
    const v = valueAt(b, t);
    // At a split the daughters' dots stand for the parent's.
    if (v === null || (t >= b.times[b.times.length - 1] - 1e-12 && result.tree.children[b.node].length)) continue;
    dots.push(el('circle', { cx: x(t), cy: y(v), r: 3.2, class: b.regime === 2 ? 'front-dot clade' : 'front-dot' }));
  }
  return [el('line', { x1: x(t), x2: x(t), y1: top, y2: bottom, class: 'front-line' }), ...dots].join('');
}

/**
 * The rate σ²(t) through time, with the front line `#<id>-front`.
 * @param {any} result @param {{ width: number, height: number, id: string }} options
 */
export function rateFigure(result, { width, height, id }) {
  const { tree, treeHeight, envelope: env } = result;
  const frame = timeFrame(width, labelColumn(tree), false);
  const x = frame.x(treeHeight);
  const top = 10;
  const bottom = 8;
  const max = Math.max(...env.rate) * 1.1 || 1;
  const y = scaleLinear([0, max], [height - bottom, top]);
  /** @type {Point[]} */
  const line = env.times.map((/** @type {number} */ t, /** @type {number} */ i) => [x(t), y(env.rate[i])]);
  return svgRoot({ width, height, label: `The rate σ²(t) through time, from ${formatNumber(env.rate[0], 2)} at the root to ${formatNumber(env.rate[env.rate.length - 1], 2)} at the tips.` },
    axisLeft({ scale: y, x: frame.left, ticks: niceTicks(0, max, 2), format: tick, gridTo: width - frame.right }),
    el('path', { d: linePath(line), class: 'ink-line' }),
    text(frame.left - 40, top - 1, 'σ²(t)', { class: 'axis-label' }),
    el('line', { x1: x(treeHeight), x2: x(treeHeight), y1: 2, y2: height - 2, class: 'front-line', id: `${id}-front` }));
}

// ---------- Two traits in 3-D ----------

/** Branch colours for a tree of up to three tips: A, B, C as the gallery's slots 1–3. */
const TIP_STYLE = [{ line: 'a-stroke', mark: 'a-mark', shape: 'circle' }, { line: 'b-stroke', mark: 'b-mark', shape: 'triangle' }, { line: 'c-stroke', mark: 'c-mark', shape: 'square' }];

/**
 * The bivariate result as paths through (trait 1, trait 2, time), time up, inside a box,
 * with their shadows on the back walls (trait 1 against time, trait 2 against time), up
 * to time t, where a plane marks the present and a dot each lineage.
 * @param {any} result @param {Camera} camera @param {number} t
 */
export function bivariateScene(result, camera, t) {
  const { branches, tree, treeHeight } = result;
  const xs = branches.flatMap((/** @type {any} */ b) => b.x);
  const ys = branches.flatMap((/** @type {any} */ b) => b.y);
  const range = (/** @type {number[]} */ v) => {
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const pad = (hi - lo) * 0.06 || 1;
    return [lo - pad, hi + pad];
  };
  const [x0, x1] = range(xs);
  const [y0, y1] = range(ys);
  const X = (/** @type {number} */ v) => -1 + (2 * (v - x0)) / (x1 - x0);
  const Y = (/** @type {number} */ v) => -1 + (2 * (v - y0)) / (y1 - y0);
  const Z = (/** @type {number} */ v) => -1 + (2 * v) / treeHeight;
  const tips = tree.children.map((/** @type {number[]} */ _, /** @type {number} */ i) => i).filter((/** @type {number} */ i) => !tree.children[i].length);
  const few = tips.length <= 3;
  const styleOf = (/** @type {number} */ node) => (few && tips.includes(node) ? TIP_STYLE[tips.indexOf(node)] : null);
  /** @type {Primitive[]} */
  const parts = [];
  // The box: its edges, with the two walls the shadows fall on shaded.
  const c = /** @type {Vec3[]} */ ([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]);
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) parts.push({ kind: 'line', from: c[a], to: c[b], class: 'wire' });
  parts.push({ kind: 'patch', points: [c[3], c[2], c[6], c[7]], class: 'wall-patch' }, { kind: 'patch', points: [c[0], c[3], c[7], c[4]], class: 'wall-patch' });
  const now = Math.min(t, treeHeight);
  if (now > 0 && now < treeHeight) {
    const z = Z(now);
    parts.push({ kind: 'patch', points: [[-1, -1, z], [1, -1, z], [1, 1, z], [-1, 1, z]], class: 'now-patch' });
  }
  for (const b of branches) {
    /** @type {Vec3[]} */
    const pts = [];
    for (let i = 0; i < b.times.length && b.times[i] <= now + 1e-12; i++) pts.push([X(b.x[i]), Y(b.y[i]), Z(b.times[i])]);
    const k = pts.length;
    if (k < b.times.length && k > 0 && now > b.times[0]) {
      const f = (now - b.times[k - 1]) / (b.times[k] - b.times[k - 1]);
      pts.push([X(b.x[k - 1] + f * (b.x[k] - b.x[k - 1])), Y(b.y[k - 1] + f * (b.y[k] - b.y[k - 1])), Z(now)]);
    }
    if (pts.length < 2) continue;
    const style = styleOf(b.node);
    parts.push({ kind: 'path', points: pts.map(([px, , pz]) => /** @type {Vec3} */ ([px, 1, pz])), class: 'shadow' });
    parts.push({ kind: 'path', points: pts.map(([, py, pz]) => /** @type {Vec3} */ ([-1, py, pz])), class: 'shadow' });
    parts.push({ kind: 'path', points: pts, class: `path3 ${style ? style.line : 'ink-stroke'}` });
    const last = pts[pts.length - 1];
    const done = now >= b.times[b.times.length - 1] - 1e-12;
    if (!done) parts.push({ kind: 'point', at: last, class: style ? style.mark : 'ink-mark', size: 3.5 });
    else if (!tree.children[b.node].length) {
      parts.push({ kind: 'point', at: last, class: style ? style.mark : 'ink-mark', shape: /** @type {any} */ (style?.shape ?? 'circle'), size: 4.5 });
      parts.push({ kind: 'label', at: last, text: tree.label[b.node] ?? '', class: 'scene-label strong', dy: -9 });
    }
  }
  parts.push(
    { kind: 'label', at: [0, -1.2, -1.14], text: `trait 1, ${formatNumber(x0, 1)} to ${formatNumber(x1, 1)}`, class: 'scene-label small' },
    { kind: 'label', at: [1.22, 0, -1.14], text: `trait 2, ${formatNumber(y0, 1)} to ${formatNumber(y1, 1)}`, class: 'scene-label small' },
    { kind: 'label', at: [1, -1, 1.12], text: `time ↑ 0 to ${formatNumber(treeHeight, 2)}`, class: 'scene-label small' },
  );
  return renderScene(camera, parts, { label: `Two traits on the tree as paths through trait 1, trait 2 and time (up), to time ${formatNumber(now, 2)} of ${formatNumber(treeHeight, 2)}, with their shadows on the back walls.` });
}

// ---------- The bridge ----------

/** The outline of a region as SVG path data in pixel coordinates. @param {any} shape @param {Scale} x @param {Scale} y */
function regionPath(shape, x, y) {
  const k = x(1) - x(0);
  if (shape.radius) {
    const [cx, cy] = shape.centre;
    const r = shape.radius * k;
    return `M${(x(cx) - r).toFixed(2)} ${y(cy).toFixed(2)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
  // Two discs joined by a corridor: arcs round the outer sides, the corridor's edges between.
  const [left, right] = shape.circles;
  const [yLo, yHi] = shape.corridor.y;
  const xl = left.centre[0] + Math.sqrt(left.radius ** 2 - yHi ** 2);
  const xr = right.centre[0] - Math.sqrt(right.radius ** 2 - yHi ** 2);
  const rl = left.radius * k;
  const rr = right.radius * k;
  return `M${x(xl).toFixed(2)} ${y(yHi).toFixed(2)}A${rl} ${rl} 0 1 0 ${x(xl).toFixed(2)} ${y(yLo).toFixed(2)}`
    + `L${x(xr).toFixed(2)} ${y(yLo).toFixed(2)}A${rr} ${rr} 0 1 0 ${x(xr).toFixed(2)} ${y(yHi).toFixed(2)}Z`;
}

/**
 * The bridge at refinement level `level` (0: the straight line from start to end): every
 * path faint, the first one in blue with its points, the region, and the free bridge's
 * midpoint ellipse (95%).
 * @param {any} result @param {{ start: number[], end: number[] }} ends @param {{ width: number, height: number, level: number, levels: number }} options
 */
export function bridgeFigure(result, ends, { width, height, level, levels }) {
  const pad = 12;
  const left = 40;
  const bottom = 34;
  const xs = [ends.start[0], ends.end[0]];
  const ys = [ends.start[1], ends.end[1]];
  if (result.shape?.radius) {
    xs.push(result.shape.centre[0] - result.shape.radius, result.shape.centre[0] + result.shape.radius);
    ys.push(result.shape.centre[1] - result.shape.radius, result.shape.centre[1] + result.shape.radius);
  } else if (result.shape) {
    for (const c of result.shape.circles) { xs.push(c.centre[0] - c.radius, c.centre[0] + c.radius); ys.push(c.centre[1] - c.radius, c.centre[1] + c.radius); }
  } else {
    for (const p of result.paths) for (const q of p) { xs.push(q[0]); ys.push(q[1]); }
  }
  let [ax, bx] = [Math.min(...xs), Math.max(...xs)];
  let [ay, by] = [Math.min(...ys), Math.max(...ys)];
  const plotW = width - left - pad;
  const plotH = height - pad - bottom;
  // One scale for both axes, so a disc stays round.
  const k = Math.min(plotW / (bx - ax || 1), plotH / (by - ay || 1)) * 0.96;
  const cxp = (ax + bx) / 2;
  const cyp = (ay + by) / 2;
  ax = cxp - plotW / (2 * k);
  bx = cxp + plotW / (2 * k);
  ay = cyp - plotH / (2 * k);
  by = cyp + plotH / (2 * k);
  const x = scaleLinear([ax, bx], [left, width - pad]);
  const y = scaleLinear([ay, by], [height - bottom, pad]);
  const parts = [];
  parts.push(axisLeft({ scale: y, x: left, ticks: niceTicks(ay, by, 5), format: tick, gridTo: width - pad }));
  if (result.shape) parts.push(el('path', { d: regionPath(result.shape, x, y), class: 'region' }));
  const every = 2 ** (levels - level);
  const pick = (/** @type {number[][]} */ path) => path.filter((_, i) => i % every === 0);
  const opacity = Math.max(0.05, Math.min(0.5, 6 / Math.sqrt(result.paths.length * 4)));
  parts.push(el('path', { d: result.paths.map((/** @type {number[][]} */ p) => linePath(pick(p).map(([px, py]) => /** @type {Point} */ ([x(px), y(py)])))).join(''), class: 'bridge-path', style: `stroke-opacity: ${opacity.toFixed(3)}` }));
  if (level >= 1) {
    const { mean, cov } = result.midpoint.free;
    parts.push(el('clipPath', { id: 'bridge-area' }, el('rect', { x: left, y: pad, width: plotW, height: plotH })),
      el('path', { d: ellipse(mean, cov, 5.991, x, y), class: 'free-ellipse', 'clip-path': 'url(#bridge-area)' }));
  }
  const first = result.paths[0];
  if (first) {
    const shown = pick(first);
    parts.push(el('path', { d: linePath(shown.map(([px, py]) => /** @type {Point} */ ([x(px), y(py)]))), class: 'a-line' }));
    shown.forEach(([px, py], i) => {
      if (i === 0 || i === shown.length - 1) return;
      const fresh = level > 0 && i % 2 === 1; // added at this level
      parts.push(marker('circle', x(px), y(py), fresh ? 3.6 : 2.4, fresh ? 'a-mark' : 'hollow-a'));
    });
  }
  parts.push(marker('circle', x(ends.start[0]), y(ends.start[1]), 6, 'ink-mark'), text(x(ends.start[0]), y(ends.start[1]) + 20, 'start', { class: 'direct-label halo', 'text-anchor': 'middle' }));
  parts.push(marker('square', x(ends.end[0]), y(ends.end[1]), 6, 'ink-mark'), text(x(ends.end[0]), y(ends.end[1]) - 12, 'end', { class: 'direct-label halo', 'text-anchor': 'middle' }));
  parts.push(axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(ax, bx, Math.max(3, Math.floor(plotW / 70))), format: tick, label: '', labelGap: 30 }));
  parts.push(text(left + 4, pad + 10, 'trait 2', { class: 'axis-label halo' }), text(width - pad - 4, height - bottom - 6, 'trait 1', { class: 'axis-label halo', 'text-anchor': 'end' }));
  const points = level === 0 ? 2 : 2 ** level + 1;
  return svgRoot({ width, height, label: `${result.paths.length} bridges from start to end at refinement level ${level} of ${levels}, ${points} points each${result.shape ? `, kept inside the ${result.region}` : ''}. The first is drawn in blue with its points.` }, parts);
}

/** A covariance ellipse holding `q` of a bivariate normal (q is the chi-square quantile). @param {number[]} mean @param {number[][]} cov @param {number} q @param {Scale} x @param {Scale} y */
function ellipse(mean, cov, q, x, y) {
  const [[a, b], [, d]] = cov;
  const l1 = Math.sqrt(a);
  const l21 = b / l1;
  const l22 = Math.sqrt(Math.max(0, d - l21 * l21));
  const s = Math.sqrt(q);
  /** @type {Point[]} */
  const pts = Array.from({ length: 73 }, (_, i) => {
    const t = (2 * Math.PI * i) / 72;
    const u = s * Math.cos(t);
    const v = s * Math.sin(t);
    return [x(mean[0] + l1 * u), y(mean[1] + l21 * u + l22 * v)];
  });
  return `${linePath(pts)}Z`;
}
