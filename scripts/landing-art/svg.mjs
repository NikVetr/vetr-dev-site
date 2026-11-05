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

/** A number with at most `d` decimals and no trailing zeros. */
export function num(x, d = 1) {
  const s = (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Rounds every number in SVG path data to `d` decimals and drops repeated points. */
export function roundPath(path, d = 1) {
  const rounded = path.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (m) => num(Number(m), d));
  return rounded.replace(/([ML])(-?[\d.]+)[ ,](-?[\d.]+)(?:L\2[ ,]\3(?![\d.]))+/g, '$1$2 $3');
}

/** Path data of a polyline [[x, y], ...], optionally closed. */
export function polyline(points, close = false, d = 1) {
  const p = points.map(([x, y], i) => `${i ? 'L' : 'M'}${num(x, d)} ${num(y, d)}`).join('');
  return close ? `${p}Z` : p;
}

/** Escapes text for SVG content and attributes. */
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
 */
export function art({ name, body, defs = '', css = '', loop = '', period, frames }) {
  const scope = `[data-art="${name}"]`;
  const style = [
    css.replaceAll('&', scope),
    // The page never animates without the visitor's leave: only while playing, and never
    // under reduced motion (landing.js does not set data-playing then either).
    loop && `@media (prefers-reduced-motion: no-preference) {\n${loop.replaceAll('&', `${scope}[data-playing]`)}\n}`,
  ].filter(Boolean).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" data-period="${period}"${frames ? ` data-frames="${frames}"` : ''} focusable="false">
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
  const body = frames.map((f, k) => `<g class="frame"${k ? ` style="animation-delay:${num(k * dt, 6)}s"` : ''}>${f}</g>`).join('\n');
  return {
    frames: n,
    body,
    css: `& .frame + .frame { opacity: 0; }`,
    loop: `& .frame { animation: ${name}-frame ${period}s step-end infinite; }
@keyframes ${name}-frame { 0% { opacity: 1; } ${num(100 / n, 6)}% { opacity: 0; } 100% { opacity: 0; } }`,
  };
}
