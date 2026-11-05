// What every card picture shares: the 320 × 180 canvas, the theme colours it paints with, the
// scoping of its style sheet to its own card, and the loop that runs only while the card is
// hovered or focused (assets/landing.js sets data-playing on the art then).
//
// A picture is inlined into the landing page, so its <style> applies to the whole document:
// every selector here starts with the picture's [data-art] scope and every id with its name.

export const W = 320;
export const H = 180;

/** Theme colours from style.css, which defines them for light and dark. */
export const INK = 'var(--art-ink)';
export const MUTED = 'var(--art-muted)';
export const LINE = 'var(--art-line)';
export const PAPER = 'var(--art-paper)';

/** A number with at most `d` decimals and no trailing zeros. @param {number} x */
export function num(x, d = 1) {
  const s = (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Rounds every number in SVG path data to `d` decimals and drops repeated points. @param {string} path */
export function roundPath(path, d = 1) {
  const rounded = path.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (/** @type {string} */ m) => num(Number(m), d));
  return rounded.replace(/([ML])(-?[\d.]+)[ ,](-?[\d.]+)(?:L\2[ ,]\3(?![\d.]))+/g, '$1$2 $3');
}

/** Path data of a polyline [[x, y], ...], optionally closed. @param {number[][]} points */
export function polyline(points, close = false, d = 1) {
  const p = points.map(([x, y], i) => `${i ? 'L' : 'M'}${num(x, d)} ${num(y, d)}`).join('');
  return close ? `${p}Z` : p;
}

/**
 * Path data made only of M, L and Z (a tool's polygons), mapped by `at` into the canvas and
 * simplified to within `tolerance` canvas units (Douglas-Peucker on each ring), rounded.
 * @param {string} path
 * @param {(x: number, y: number) => number[]} at
 * @param {number} tolerance
 */
export function simplifyPath(path, at, tolerance) {
  if (/[^MLZ\d\s.,eE+-]/.test(path)) throw new Error('simplifyPath: only M, L and Z are handled');
  return path.split(/(?=M)/).map((ring) => {
    const nums = (ring.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
    const points = [];
    for (let i = 0; i + 1 < nums.length; i += 2) points.push(at(nums[i], nums[i + 1]));
    const kept = douglasPeucker(points, tolerance);
    return kept.length < 3 ? '' : polyline(kept, /Z/i.test(ring));
  }).join('');
}

/** @param {number[][]} pts @param {number} tol @returns {number[][]} */
function douglasPeucker(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay);
  let worst = 0;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = len ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len : Math.hypot(px - ax, py - ay);
    if (d > worst) { worst = d; index = i; }
  }
  if (worst <= tol) return [pts[0], pts[pts.length - 1]];
  return [...douglasPeucker(pts.slice(0, index + 1), tol).slice(0, -1), ...douglasPeucker(pts.slice(index), tol)];
}

/** Escapes text for SVG content and attributes. @param {unknown} text */
export function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Assembles one picture.
 * @param {object} p
 * @param {string} p.name      the card's art name: [data-art] value, file name and id prefix
 * @param {string} p.body      the drawing, as it looks at rest
 * @param {string} [p.defs]    <defs> content (ids must start with `${name}-`)
 * @param {string} [p.css]     rules for the still picture; `&` stands for the card's scope
 * @param {string} [p.loop]    rules that run while playing; `&` stands for the playing scope
 * @param {number} p.period    the loop's period in seconds: every loop animation repeats on it
 * @param {number} [p.frames]  for a flip-book, its number of frames (for the loop checks)
 * @param {string} [p.player]  a script in assets/players/ that plays the loop instead of CSS
 */
export function art({ name, body, defs = '', css = '', loop = '', period, frames, player }) {
  const scope = `[data-art="${name}"]`;
  const style = [
    css.replaceAll('&', scope),
    // The page never animates without the visitor's leave: only while playing, and never
    // under reduced motion (landing.js does not set data-playing then either).
    loop && `@media (prefers-reduced-motion: no-preference) {\n${loop.replaceAll('&', `${scope}[data-playing]`)}\n}`,
  ].filter(Boolean).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" data-period="${num(period, 3)}"${frames ? ` data-frames="${frames}"` : ''}${player ? ` data-player="${player}"` : ''} focusable="false">
<style>
${style}
</style>
${defs ? `<defs>${defs}</defs>\n` : ''}${body}
</svg>
`;
}

/**
 * A flip-book: the frames stacked in place, frame 0 showing at rest. While playing, each frame
 * is opaque for its own 1/n of the period (one shared step animation, delayed k/n of the period
 * for frame k), so frame n - 1 is followed by frame 0 with no seam when the frames are a cycle.
 * @param {string} name
 * @param {string[]} frames  markup of each frame, drawn on the 320 × 180 canvas
 * @param {number} period    seconds for the whole cycle
 */
export function flipbook(name, frames, period) {
  const n = frames.length;
  const dt = period / n;
  const body = frames.map((f, k) => `<g class="frame${k ? '' : ' first'}"${k ? ` style="animation-delay:${num(k * dt, 6)}s"` : ''}>${f}</g>`).join('\n');
  return {
    frames: n,
    body,
    // Frame 0 is drawn at rest as it is drawn while playing (will-change), so the still is
    // exactly the loop's first frame.
    css: `& .frame + .frame { opacity: 0; }
& .frame.first { will-change: opacity; }`,
    loop: `& .frame { animation: ${name}-frame ${period}s step-end infinite; }
@keyframes ${name}-frame { 0% { opacity: 1; } ${num(100 / n, 6)}% { opacity: 0; } 100% { opacity: 0; } }`,
  };
}
