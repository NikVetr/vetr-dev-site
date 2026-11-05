// The gallery's SVG plot module. Figures are built as SVG markup strings, with no DOM
// access, so the same code draws a page's figure, an index thumbnail or a test
// fixture. Colours come from CSS classes (see style.css), so one SVG serves light
// and dark themes. Sizes are CSS pixels: pages render at the figure's real width
// rather than scaling a fixed viewBox, so text stays legible on a phone.

/** @typedef {[number, number]} Point */

/** @param {unknown} value */
export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

/** Coordinates to two decimals keep paths compact. @param {number} v */
export const r2 = (v) => Math.round(v * 100) / 100;

/**
 * An element as markup. Attributes that are null, undefined or false are left out;
 * children are markup strings (or nested arrays of them).
 * @param {string} tag
 * @param {Record<string, string | number | boolean | null | undefined>} [attrs]
 * @param {...(string | string[] | null | undefined | false)} children
 */
export function el(tag, attrs = {}, ...children) {
  const attributes = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeXml(typeof v === 'number' ? r2(v) : v)}"`))
    .join('');
  const inner = children.flat().filter(Boolean).join('');
  return `<${tag}${attributes}${inner ? `>${inner}</${tag}>` : '/>'}`;
}

/**
 * A text element; its content is escaped.
 * @param {number} x
 * @param {number} y
 * @param {string} content
 * @param {Record<string, string | number | boolean | null | undefined>} [attrs]
 */
export function text(x, y, content, attrs = {}) {
  return `<text x="${r2(x)}" y="${r2(y)}"${Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('')}>${escapeXml(content)}</text>`;
}

/**
 * @typedef {((v: number) => number) & { invert: (p: number) => number, domain: [number, number], range: [number, number] }} Scale
 */

/**
 * @param {[number, number]} domain
 * @param {[number, number]} range
 * @returns {Scale}
 */
export function scaleLinear(domain, range) {
  const [d0, d1] = domain;
  const [p0, p1] = range;
  const k = (p1 - p0) / (d1 - d0);
  const scale = /** @type {Scale} */ ((/** @type {number} */ v) => p0 + (v - d0) * k);
  scale.invert = (p) => d0 + (p - p0) / k;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/**
 * Base-10 log scale; the domain must be positive.
 * @param {[number, number]} domain
 * @param {[number, number]} range
 * @returns {Scale}
 */
export function scaleLog(domain, range) {
  const inner = scaleLinear([Math.log10(domain[0]), Math.log10(domain[1])], range);
  const scale = /** @type {Scale} */ ((/** @type {number} */ v) => inner(Math.log10(v)));
  scale.invert = (p) => 10 ** inner.invert(p);
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/**
 * Round-numbered ticks (steps of 1, 2 or 5 times a power of ten) inside [lo, hi].
 * @param {number} lo
 * @param {number} hi
 * @param {number} count roughly how many
 */
export function niceTicks(lo, hi, count) {
  const raw = (hi - lo) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw * 0.999) ?? 10 * power;
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const ticks = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i++) ticks.push(Number((i * step).toFixed(decimals)));
  return ticks;
}

/**
 * Powers of ten inside [lo, hi], thinned to at most `max` ticks.
 * @param {number} lo
 * @param {number} hi
 * @param {number} max
 */
export function logTicks(lo, hi, max) {
  const powers = [];
  for (let e = Math.ceil(Math.log10(lo) - 1e-9); e <= Math.floor(Math.log10(hi) + 1e-9); e++) powers.push(e);
  const every = Math.ceil(powers.length / Math.max(1, max));
  const top = powers[powers.length - 1];
  return powers.filter((e) => (top - e) % every === 0).map((e) => 10 ** e);
}

/**
 * Isolines of a grid by marching squares, as path data in pixels.
 * @param {Float64Array} values row-major, ny rows of nx @param {number} nx @param {number} ny
 * @param {number} level @param {(i: number, j: number) => Point} at pixel of grid point (i, j)
 */
export function isoline(values, nx, ny, level, at) {
  let d = '';
  const v = (/** @type {number} */ i, /** @type {number} */ j) => values[j * nx + i];
  const cross = (/** @type {number} */ i0, /** @type {number} */ j0, /** @type {number} */ i1, /** @type {number} */ j1) => {
    const a = v(i0, j0);
    const b = v(i1, j1);
    const t = (level - a) / (b - a);
    const p0 = at(i0, j0);
    const p1 = at(i1, j1);
    return [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])];
  };
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const code = (v(i, j) > level ? 1 : 0) | (v(i + 1, j) > level ? 2 : 0) | (v(i + 1, j + 1) > level ? 4 : 0) | (v(i, j + 1) > level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const bottom = () => cross(i, j, i + 1, j);
      const right = () => cross(i + 1, j, i + 1, j + 1);
      const top = () => cross(i, j + 1, i + 1, j + 1);
      const left = () => cross(i, j, i, j + 1);
      /** @type {Record<number, (() => number[])[][]>} */
      const SEGMENTS = {
        1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[right, top]], 5: [[left, top], [bottom, right]],
        6: [[bottom, top]], 7: [[left, top]], 8: [[top, left]], 9: [[top, bottom]], 10: [[bottom, left], [top, right]],
        11: [[top, right]], 12: [[right, left]], 13: [[right, bottom]], 14: [[bottom, left]],
      };
      for (const [from, to] of SEGMENTS[code]) {
        const p = from();
        const q = to();
        d += `M${r2(p[0])} ${r2(p[1])}L${r2(q[0])} ${r2(q[1])}`;
      }
    }
  }
  return d;
}

/** @param {Point[]} points */
export function linePath(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`).join('');
}

/**
 * A closed area between a top line and either a constant baseline or a bottom line
 * (given in the same x order as the top).
 * @param {Point[]} top
 * @param {number | Point[]} bottom
 */
export function areaPath(top, bottom) {
  if (!top.length) return '';
  const lower = typeof bottom === 'number' ? [[top[top.length - 1][0], bottom], [top[0][0], bottom]] : [...bottom].reverse();
  return `${linePath(top)}${lower.map(([x, y]) => `L${r2(x)} ${r2(y)}`).join('')}Z`;
}

/**
 * A horizontal axis: baseline, ticks and labels, and an optional title below.
 * @param {{ scale: Scale, y: number, ticks: number[], format?: (v: number) => string, label?: string, labelGap?: number }} options
 */
export function axisBottom({ scale, y, ticks, format = String, label, labelGap = 34 }) {
  const [x0, x1] = scale.range;
  return el('g', { class: 'axis' },
    el('line', { x1: Math.min(x0, x1), x2: Math.max(x0, x1), y1: y, y2: y, class: 'axis-line' }),
    ticks.map((t) => el('line', { x1: scale(t), x2: scale(t), y1: y, y2: y + 5, class: 'axis-line' })),
    ticks.map((t) => text(scale(t), y + 18, format(t), { class: 'tick', 'text-anchor': 'middle' })),
    label ? text((x0 + x1) / 2, y + labelGap, label, { class: 'axis-label', 'text-anchor': 'middle' }) : '');
}

/**
 * A vertical axis with optional horizontal gridlines across `gridTo`.
 * @param {{ scale: Scale, x: number, ticks: number[], format?: (v: number) => string, gridTo?: number }} options
 */
export function axisLeft({ scale, x, ticks, format = String, gridTo }) {
  return el('g', { class: 'axis' },
    gridTo === undefined ? '' : ticks.map((t) => el('line', { x1: x, x2: gridTo, y1: scale(t), y2: scale(t), class: 'grid' })),
    ticks.map((t) => text(x - 6, scale(t) + 4, format(t), { class: 'tick', 'text-anchor': 'end' })));
}

/**
 * The root element. `label` becomes the accessible name; `description` a <desc>.
 * @param {{ width: number, height: number, label: string, description?: string, className?: string }} options
 * @param {...(string | string[])} children
 */
export function svgRoot({ width, height, label, description, className }, ...children) {
  return el('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${r2(width)} ${r2(height)}`,
    role: 'img', 'aria-label': label, class: ['plot', className].filter(Boolean).join(' '),
  }, description ? el('desc', {}, escapeXml(description)) : '', ...children);
}

/**
 * Approximate rendered width of a label in the plot font, for placing labels so
 * that they stay inside the figure.
 * @param {string} content
 * @param {number} [size] font size in px
 */
export function textWidth(content, size = 12) {
  return content.length * size * 0.56;
}

/** @typedef {'circle' | 'triangle' | 'square' | 'diamond'} Shape */

/**
 * A point marker. Shapes carry identity alongside colour (circle for A, triangle for
 * B, and so on), so no series is told apart by colour alone.
 * @param {Shape} shape
 * @param {number} x
 * @param {number} y
 * @param {number} size radius-like size in px
 * @param {string} className
 */
export function marker(shape, x, y, size, className) {
  const s = size;
  if (shape === 'circle') return el('circle', { cx: x, cy: y, r: s, class: className });
  if (shape === 'square') return el('rect', { x: x - s * 0.88, y: y - s * 0.88, width: s * 1.76, height: s * 1.76, class: className });
  if (shape === 'diamond') return el('path', { d: `M${r2(x)} ${r2(y - s * 1.2)}L${r2(x + s * 1.2)} ${r2(y)}L${r2(x)} ${r2(y + s * 1.2)}L${r2(x - s * 1.2)} ${r2(y)}Z`, class: className });
  return el('path', { d: `M${r2(x)} ${r2(y - s * 1.25)}L${r2(x + s * 1.15)} ${r2(y + s * 0.8)}L${r2(x - s * 1.15)} ${r2(y + s * 0.8)}Z`, class: className });
}

const SERIES_SHAPES = /** @type {const} */ (['circle', 'triangle', 'square', 'diamond']);

/**
 * The marker of the k-th series: the categorical colour k mod 6 (style.css's k0–k5) and a
 * shape, filled for the first four and hollow after, so no two of the first ten share both.
 * @param {number} k
 * @returns {{ shape: Shape, mark: string }}
 */
export function seriesMark(k) {
  return { shape: SERIES_SHAPES[k % 4], mark: `${k >= 4 ? 'k-hollow' : 'k-mark'} k${k % 6}` };
}

/**
 * A small legend swatch: a line sample (optional) with a marker on it.
 * @param {{ line?: string, shape?: Shape, mark?: string, fill?: string }} options classes
 */
export function swatch({ line, shape, mark, fill }) {
  return el('svg', { width: 26, height: 14, viewBox: '0 0 26 14', class: 'plot', 'aria-hidden': 'true' },
    fill ? el('rect', { x: 1, y: 2, width: 24, height: 10, rx: 2, class: fill }) : '',
    line ? el('line', { x1: 1, x2: 25, y1: 7, y2: 7, class: line }) : '',
    shape && mark ? marker(shape, 13, 7, 4, mark) : '');
}
