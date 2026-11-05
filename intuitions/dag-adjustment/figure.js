// Figures for adjusting for the right variables, as SVG strings (no DOM access). In
// the graph, a node's role is shown by its outline and a word under it, never by
// colour alone: the exposure has a thick blue outline, the outcome a thick orange
// one, an adjusted node a square shaded box and an unobserved one a dashed outline.
// Edges on a non-causal path the adjustment leaves open are drawn red, thicker and
// dashed, and listed in words beside the figure.

import { formatNumber } from '../lib/format.js';
import { axisBottom, axisLeft, el, linePath, marker, niceTicks, scaleLinear, svgRoot, text, textWidth } from '../lib/plot.js';

/** @typedef {import('./compute.js').Graph} Graph */
/** @typedef {import('./compute.js').GraphNode} GraphNode */
/** @typedef {[number, number]} Point */

const NODE_H = 32;
const FONT = 13;

/**
 * Node positions in grid units: the graph's own, or, when any is missing, layers by
 * the longest path from a root, spread evenly within each layer.
 * @param {Graph} graph
 * @returns {Map<string, Point>}
 */
export function layout(graph) {
  if (graph.nodes.every((n) => n.x !== null && n.y !== null)) return new Map(graph.nodes.map((n) => [n.id, /** @type {Point} */ ([/** @type {number} */ (n.x), /** @type {number} */ (n.y)])]));
  const depth = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < graph.nodes.length; pass++) {
    for (const e of graph.edges) depth.set(e.to, Math.max(/** @type {number} */ (depth.get(e.to)), /** @type {number} */ (depth.get(e.from)) + 1));
  }
  /** @type {Map<number, string[]>} */
  const layers = new Map();
  for (const n of graph.nodes) {
    const d = /** @type {number} */ (depth.get(n.id));
    layers.set(d, [...(layers.get(d) ?? []), n.id]);
  }
  const widest = Math.max(...[...layers.values()].map((l) => l.length));
  /** @type {Map<string, Point>} */
  const at = new Map();
  for (const [d, ids] of layers) ids.forEach((id, i) => at.set(id, [((i + 0.5) * widest) / ids.length, d]));
  return at;
}

/**
 * The causal graph with each node's role and each edge's coefficient. Nodes carry
 * data-node so a page can toggle adjustment by clicking them.
 * @param {{ graph: Graph, exposure: string, outcome: string, adjust: string[], mediator: string | null }} params
 * @param {any} result the adjust view's result
 * @param {{ width: number, id?: string }} size
 */
export function dagFigure(params, result, { width, id = 'dag' }) {
  const { graph } = params;
  const at = layout(graph);
  const xs = [...at.values()].map((p) => p[0]);
  const ys = [...at.values()].map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const boxW = (/** @type {string} */ name) => Math.max(40, textWidth(name, FONT * 1.1) + 24); // labels are semibold
  const widestBox = Math.max(...graph.nodes.map((n) => boxW(n.id)));
  const padX = widestBox / 2 + 6;
  const rows = y1 - y0;
  const rowGap = width < 520 ? 92 : 104;
  const height = Math.round(rows * rowGap + NODE_H + 52);
  const sx = scaleLinear(x1 > x0 ? [x0, x1] : [x0 - 1, x0 + 1], [padX, width - padX]);
  const sy = scaleLinear(y1 > y0 ? [y0, y1] : [y0 - 1, y0 + 1], [NODE_H / 2 + 12, height - NODE_H / 2 - 30]);
  const pos = (/** @type {string} */ n) => /** @type {Point} */ ([sx(/** @type {Point} */ (at.get(n))[0]), sy(/** @type {Point} */ (at.get(n))[1])]);

  // Edges on an open non-causal path.
  const biasing = new Set();
  for (const p of result.paths) {
    if (p.causal || !p.open) continue;
    for (let i = 1; i < p.nodes.length; i++) biasing.add([p.nodes[i - 1], p.nodes[i]].sort().join('|'));
  }
  /** @type {[Point, Point][]} */
  const segments = [];
  const edges = graph.edges.map((e) => {
    const [ax, ay] = pos(e.from);
    const [bx, by] = pos(e.to);
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    // Leave each box at its border.
    const cut = (/** @type {string} */ name) => Math.min((boxW(name) / 2 + 3) / (Math.abs(dx) / len || 1e-9), (NODE_H / 2 + 3) / (Math.abs(dy) / len || 1e-9));
    const s = cut(e.from);
    const t = cut(e.to) + 4;
    const start = /** @type {Point} */ ([ax + (dx / len) * s, ay + (dy / len) * s]);
    const end = /** @type {Point} */ ([bx - (dx / len) * t, by - (dy / len) * t]);
    segments.push([start, end]);
    const zero = e.coefficient === 0;
    const bias = !zero && biasing.has([e.from, e.to].sort().join('|'));
    const cls = ['dag-edge', zero ? 'zero' : '', bias ? 'bias' : ''].filter(Boolean).join(' ');
    // The coefficient sits beside the middle of the edge, on whichever side is further
    // from the other nodes.
    const mx = (start[0] + end[0]) / 2;
    const my = (start[1] + end[1]) / 2;
    const nx = -dy / len;
    const ny = dx / len;
    const room = (/** @type {number} */ side) => Math.min(...graph.nodes.filter((n) => n.id !== e.from && n.id !== e.to)
      .map((n) => { const [px, py] = pos(n.id); return Math.hypot(mx + nx * 14 * side - px, my + ny * 14 * side - py); }), Infinity);
    const flip = room(1) > room(-1) + 1 ? 1 : room(-1) > room(1) + 1 ? -1 : ny > 0 || (ny === 0 && nx > 0) ? -1 : 1;
    return el('g', {},
      el('line', { x1: start[0], y1: start[1], x2: end[0], y2: end[1], class: cls, 'marker-end': `url(#${id}-${bias ? 'bias' : zero ? 'zero' : 'arrow'})` }),
      text(mx + nx * 11 * flip, my + ny * 11 * flip + 4, formatNumber(e.coefficient, Number.isInteger(e.coefficient) ? 0 : Number.isInteger(Math.round(e.coefficient * 1e6) / 1e5) ? 1 : 2), { class: `edge-label halo${zero ? ' zero' : ''}`, 'text-anchor': 'middle' }));
  });

  /**
   * Where a node's role words go: below it, above it, or below to one side, whichever
   * first keeps clear of every edge.
   * @param {number} cx @param {number} cy @param {number} w @param {string} words
   */
  const tagAt = (cx, cy, w, words) => {
    const tw = textWidth(words, 11) + 6;
    const candidates = [
      { x: cx, y: cy + NODE_H / 2 + 14, anchor: 'middle' },
      { x: cx, y: cy - NODE_H / 2 - 6, anchor: 'middle' },
      { x: cx + w / 2 + 4, y: cy + NODE_H / 2 + 8, anchor: 'start' },
      { x: cx - w / 2 - 4, y: cy + NODE_H / 2 + 8, anchor: 'end' },
    ];
    const clear = (/** @type {{ x: number, y: number, anchor: string }} */ c) => {
      const x0 = c.anchor === 'middle' ? c.x - tw / 2 : c.anchor === 'start' ? c.x : c.x - tw;
      return segments.every(([a, b]) => {
        for (let k = 0; k <= 24; k++) {
          const px = a[0] + ((b[0] - a[0]) * k) / 24;
          const py = a[1] + ((b[1] - a[1]) * k) / 24;
          if (px >= x0 - 2 && px <= x0 + tw + 2 && py >= c.y - 12 && py <= c.y + 4) return false;
        }
        return true;
      });
    };
    return candidates.find(clear) ?? candidates[0];
  };
  const nodes = graph.nodes.map((n) => {
    const [cx, cy] = pos(n.id);
    const w = boxW(n.id);
    const adjusted = params.adjust.includes(n.id);
    const roles = [
      n.id === params.exposure ? 'exposure' : '',
      n.id === params.outcome ? 'outcome' : '',
      adjusted ? 'adjusted' : '',
      n.latent ? 'unobserved' : '',
      n.id === params.mediator ? 'front door' : '',
    ].filter(Boolean);
    const cls = ['dag-node', n.id === params.exposure ? 'exposure' : '', n.id === params.outcome ? 'outcome' : '', adjusted ? 'adjusted' : '', n.latent ? 'latent' : ''].filter(Boolean).join(' ');
    const clickable = !n.latent && n.id !== params.exposure && n.id !== params.outcome;
    return el('g', { 'data-node': clickable ? n.id : null, class: clickable ? 'dag-toggle' : null },
      el('rect', { x: cx - w / 2, y: cy - NODE_H / 2, width: w, height: NODE_H, rx: adjusted ? 2 : NODE_H / 2, class: cls }),
      text(cx, cy + 4.5, n.id, { class: 'node-label', 'text-anchor': 'middle' }),
      roles.length ? (() => {
        const t = tagAt(cx, cy, w, roles.join(' · '));
        return text(t.x, t.y, roles.join(' · '), { class: 'node-role halo', 'text-anchor': t.anchor });
      })() : '');
  });

  const arrowHead = (/** @type {string} */ name, /** @type {string} */ cls) => el('marker', { id: `${id}-${name}`, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
    el('path', { d: 'M0 0L10 5L0 10Z', class: cls }));
  const roleText = `Exposure ${params.exposure}, outcome ${params.outcome}${params.adjust.length ? `, adjusting for ${params.adjust.join(', ')}` : ', no adjustment'}.`;
  return {
    height,
    svg: svgRoot({
      width, height, className: 'dag',
      label: `Causal graph with ${graph.nodes.length} variables: ${graph.edges.filter((e) => e.coefficient !== 0).map((e) => `${e.from} → ${e.to} (${formatNumber(e.coefficient)})`).join(', ')}. ${roleText}`,
    },
    el('defs', {}, arrowHead('arrow', 'arrow-head'), arrowHead('bias', 'arrow-head bias'), arrowHead('zero', 'arrow-head zero')),
    edges, nodes),
  };
}

/**
 * A simulated sample with the adjustment set regressed out of both the exposure and
 * the outcome, so the slope of the cloud is the adjusted coefficient. The solid line
 * has the model's adjusted coefficient, the dashed one the causal effect.
 * @param {any} result the adjust view's result, with a sample
 * @param {{ exposure: string, outcome: string, adjust: string[] }} params
 * @param {{ width: number, height: number }} size
 */
export function sampleFigure(result, params, { width, height }) {
  const { points } = result.sample;
  const left = 46;
  const right = 14;
  const top = 12;
  const bottom = 44;
  const spread = (/** @type {number} */ k) => {
    const sorted = points.map((/** @type {number[]} */ p) => p[k]).sort((/** @type {number} */ a, /** @type {number} */ b) => a - b);
    return Math.max(Math.abs(sorted[Math.floor(sorted.length * 0.005)]), Math.abs(sorted[Math.ceil(sorted.length * 0.995) - 1])) * 1.1 || 1;
  };
  const xr = spread(0);
  const yr = spread(1);
  const x = scaleLinear([-xr, xr], [left, width - right]);
  const y = scaleLinear([-yr, yr], [height - bottom, top]);
  const inside = (/** @type {number[]} */ p) => Math.abs(p[0]) <= xr && Math.abs(p[1]) <= yr;
  const line = (/** @type {number} */ slope, /** @type {string} */ cls) => {
    // Clip the line to the box.
    const lo = Math.max(-xr, slope === 0 ? -xr : Math.min(-yr / slope, yr / slope));
    const hi = Math.min(xr, slope === 0 ? xr : Math.max(-yr / slope, yr / slope));
    return el('line', { x1: x(lo), y1: y(slope * lo), x2: x(hi), y2: y(slope * hi), class: cls });
  };
  const adjusted = params.adjust.length > 0;
  return svgRoot({
    width, height,
    label: `${points.length} simulated points of ${params.outcome} against ${params.exposure}${adjusted ? `, each with ${params.adjust.join(', ')} regressed out` : ''}. The sample's slope is ${formatNumber(result.sample.coefficient)}; the model's adjusted coefficient is ${formatNumber(result.estimate.coefficient)} and the causal effect ${formatNumber(result.effect)}.`,
  },
  axisLeft({ scale: y, x: left, ticks: niceTicks(-yr, yr, 5), format: (v) => formatNumber(v, Number.isInteger(v) ? 0 : 1), gridTo: width - right }),
  axisBottom({ scale: x, y: height - bottom, ticks: niceTicks(-xr, xr, Math.max(3, Math.floor(width / 90))), format: (v) => formatNumber(v, Number.isInteger(v) ? 0 : 1), label: adjusted ? `${params.exposure}, with ${params.adjust.join(', ')} regressed out` : params.exposure, labelGap: 34 }),
  points.filter(inside).map((/** @type {number[]} */ p) => el('circle', { cx: x(p[0]), cy: y(p[1]), r: 2, class: 'sample-dot' })),
  line(result.effect, 'effect-line'),
  line(result.estimate.coefficient, 'ink-line'),
  text(left + 4, top + 10, adjusted ? `${params.outcome}, adjusted` : params.outcome, { class: 'axis-label halo' }));
}

/**
 * One measure against the share of the colliders' common correlation that comes from
 * U, one line per number of colliders, each labelled at its right end; the current
 * number is drawn heavier, with the current share marked.
 * @param {any} result the colliders view's result
 * @param {'r2' | 'partialCorrelation'} measure
 * @param {{ width: number, height: number }} size
 */
export function colliderCurveFigure(result, measure, { width, height }) {
  const left = 46;
  const right = 14;
  const top = 22;
  const bottom = 44;
  const x = scaleLinear([0, 1], [left, width - right]);
  const domain = /** @type {[number, number]} */ (measure === 'r2' ? [0, 1] : [-1, 0]);
  const y = scaleLinear(domain, [height - bottom, top]);
  const { shares, byCount } = result.curves;
  const current = result.colliders;
  /** @type {{ own: boolean, pts: Point[], label: string, cls: string }[]} */
  const lines = byCount.map((/** @type {any} */ c, /** @type {number} */ i) => {
    const pts = shares.map((/** @type {number} */ s, /** @type {number} */ j) => /** @type {Point} */ ([x(s), y(c[measure][j])]));
    const own = c.colliders === current;
    return { own, pts, label: `${own ? '● ' : ''}${c.colliders.toLocaleString('en-US')}`, cls: own ? 'ink-line heavy' : `seq-line s${Math.min(6, 1 + Math.round((i / Math.max(1, byCount.length - 1)) * 5))}` };
  });
  // Label each line where the lines are furthest apart, so every label sits by its own line.
  let best = 0;
  let bestGap = -1;
  for (let j = 5; j < shares.length - 5; j += 5) {
    const ys = lines.map((l) => l.pts[j][1]).sort((a, b) => a - b);
    const gap = Math.min(...ys.slice(1).map((v, i) => v - ys[i]));
    if (gap > bestGap) { bestGap = gap; best = j; }
  }
  const ends = lines.map((l) => ({ y: l.pts[best][1], t: l.label, own: l.own })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
  const overflow = ends[ends.length - 1].y - (height - bottom - 2);
  if (overflow > 0) ends.forEach((e) => { e.y -= overflow; });
  const labelX = x(shares[best]) + 6;
  const here = result[measure];
  const name = measure === 'r2' ? 'R² of Y on the colliders' : 'partial correlation of Y and U';
  return svgRoot({
    width, height,
    label: `The ${name} against the share of the colliders' correlation that comes from U, for ${byCount.map((/** @type {any} */ c) => c.colliders).join(', ')} colliders. With ${current} at share ${formatNumber(result.share)} it is ${formatNumber(here, 3)}.`,
  },
  axisLeft({ scale: y, x: left, ticks: measure === 'r2' ? [0, 0.25, 0.5, 0.75, 1] : [-1, -0.75, -0.5, -0.25, 0], format: (v) => formatNumber(v, v === 0 || Math.abs(v) === 1 ? 0 : 2), gridTo: width - right }),
  axisBottom({ scale: x, y: height - bottom, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => formatNumber(v, v === 0 || v === 1 ? 0 : 2), label: "share of the colliders' correlation from U", labelGap: 34 }),
  text(left - 8, 4, measure === 'r2' ? 'R²' : 'partial r', { class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'hanging' }),
  lines.filter((l) => !l.own).map((l) => el('path', { d: linePath(l.pts), class: l.cls })),
  lines.filter((l) => l.own).map((l) => el('path', { d: linePath(l.pts), class: l.cls })),
  el('line', { x1: x(result.share), x2: x(result.share), y1: top, y2: height - bottom, class: 'marker-line' }),
  marker('circle', x(result.share), y(here), 5, 'ink-mark'),
  text(labelX, top - 8, 'colliders', { class: 'axis-label halo' }),
  ends.map((e) => text(labelX, e.y - 3, e.t, { class: `${e.own ? 'direct-label strong' : 'direct-label'} halo` })));
}

/**
 * The many-collider graph: Y and U above, X₁ … X_p below, each caused by both.
 * @param {number} count
 * @param {{ width: number }} size
 */
export function colliderSchematic(count, { width }) {
  const height = 120;
  const shown = count <= 4 ? Array.from({ length: count }, (_, i) => `X${sub(i + 1)}`) : ['X₁', 'X₂', 'X₃', '…', `X${sub(count)}`];
  const yTop = 24;
  const yBottom = 92;
  const sx = (/** @type {number} */ i) => (width * (i + 1)) / (shown.length + 1);
  const tops = [['Y', width * 0.3], ['U', width * 0.7]];
  const parts = [];
  shown.forEach((name, i) => {
    if (name === '…') return;
    for (const [, tx] of tops) parts.push(el('line', { x1: /** @type {number} */ (tx), y1: yTop + 14, x2: sx(i), y2: yBottom - 16, class: 'dag-edge thin', 'marker-end': 'url(#collider-arrow)' }));
  });
  for (const [name, tx] of tops) parts.push(el('rect', { x: /** @type {number} */ (tx) - 16, y: yTop - 14, width: 32, height: 28, rx: 14, class: 'dag-node' }), text(/** @type {number} */ (tx), yTop + 4.5, String(name), { class: 'node-label', 'text-anchor': 'middle' }));
  shown.forEach((name, i) => {
    if (name === '…') parts.push(text(sx(i), yBottom + 5, '…', { class: 'node-label', 'text-anchor': 'middle' }));
    else parts.push(el('rect', { x: sx(i) - 18, y: yBottom - 14, width: 36, height: 28, rx: 2, class: 'dag-node adjusted' }), text(sx(i), yBottom + 4.5, name, { class: 'node-label', 'text-anchor': 'middle' }));
  });
  return svgRoot({ width, height, className: 'dag', label: `Y and U are independent; each of ${count} colliders X is caused by both, and all of them are adjusted for.` },
    el('defs', {}, el('marker', { id: 'collider-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, el('path', { d: 'M0 0L10 5L0 10Z', class: 'arrow-head' }))),
    parts);
}

/** Subscript digits. @param {number} n */
function sub(n) {
  return String(n).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('');
}
