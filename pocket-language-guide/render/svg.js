// LayoutPlan -> SVG.
//
// One <svg> per face at exact physical size, in points, y measured downward from
// the top-left. Everything the plan carries is already positioned and broken into
// single lines, so this is a pure transcription with no layout decisions.
//
// Shading and rules are <rect>s rather than CSS backgrounds, and rules are rects
// rather than <line>s: a filled rect lands on exact device pixels, while a
// hairline stroke gets antialiased across two.

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** @param {string} s */
function esc(s) {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[/** @type {keyof XML_ESCAPES} */ (c)]);
}

/** @param {number} n */
function num(n) {
  return Number(n.toFixed(3)).toString();
}

/**
 * @typedef {Object} SvgOptions
 * @property {Record<string,{stack:string, weight:number, italic:boolean, family:string}>} faces
 *   font id -> the CSS family and style to render it with
 * @property {{viewBox:number, strokeWidth:number, linecap:string, linejoin:string, paths:Record<string,string[]>}} icons
 * @property {string} [background]
 * @property {boolean} [showBleed]  draw crop guides for a print shop
 * @property {number} [bleed]
 */

/**
 * @param {import('../core/types.js').Face} face
 * @param {import('../core/types.js').LayoutPlan} plan
 * @param {SvgOptions} opts
 * @returns {string}
 */
export function faceToSvg(face, plan, opts) {
  const { pageW, pageH } = plan;
  /** @type {string[]} */ const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(pageW)}pt" height="${num(pageH)}pt" `
    + `viewBox="0 0 ${num(pageW)} ${num(pageH)}">`,
  );
  out.push(`<rect x="0" y="0" width="${num(pageW)}" height="${num(pageH)}" fill="${opts.background ?? '#FFFFFF'}"/>`);
  if (face.rotate) {
    out.push(`<g transform="rotate(${num(face.rotate)} ${num(pageW / 2)} ${num(pageH / 2)})">`);
  }

  for (const r of face.rects) {
    const radius = r.r ? ` rx="${num(r.r)}"` : '';
    out.push(
      `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}"${radius} fill="${r.fill}"/>`,
    );
  }

  for (const icon of face.icons) {
    const paths = opts.icons.paths[icon.name];
    if (!paths) throw new Error(`icon "${icon.name}" is not in data/icons.json`);
    const k = icon.size / opts.icons.viewBox;
    out.push(
      `<g transform="translate(${num(icon.x)} ${num(icon.y)}) scale(${num(k)})" `
      + `fill="none" stroke="${icon.fill}" stroke-width="${opts.icons.strokeWidth}" `
      + `stroke-linecap="${opts.icons.linecap}" stroke-linejoin="${opts.icons.linejoin}">`
      + paths.map((d) => `<path d="${d}"/>`).join('')
      + '</g>',
    );
  }

  for (const run of face.runs) {
    const f = opts.faces[run.fontId];
    if (!f) throw new Error(`no CSS face registered for "${run.fontId}"`);
    const italic = f.italic ? ' font-style="italic"' : '';
    // Deliberately no `direction="rtl"`. With it, SVG anchors the text at its
    // right edge while pdf-lib anchors at the left, so the same plan drew in two
    // places -- and the two renderers agreeing by construction is the point of
    // having a plan at all. `run.x` is the left edge in both. A run is one word,
    // and the browser still shapes and orders it right-to-left from its own bidi
    // pass; what it must not do is re-anchor the line. It also leaves a numeral
    // piece like "1/2" alone, which `direction="rtl"` would have reversed.
    // `unicode-bidi: plaintext` resolves each run's direction from its own first
    // strong character instead of from the document's. Without it a neutral glued
    // to an Arabic word -- the colon in `الصين:`, every comma and full stop in an
    // Arabic note -- resolved at the LTR paragraph level and printed on the wrong
    // side of the word. The PDF path was already right, because fontkit reorders
    // per script run, so the two renderers disagreed. This changes no ink `x` and
    // no width, so nothing re-layouts.
    out.push(
      `<text x="${num(run.x)}" y="${num(run.y)}" font-family="${esc(f.family)}" `
      + `font-size="${num(run.size)}" font-weight="${f.weight}"${italic} `
      + `fill="${run.fill}" style="unicode-bidi:plaintext">${esc(run.text)}</text>`,
    );
  }

  if (face.rotate) out.push('</g>');
  if (opts.showBleed && opts.bleed) out.push(cropMarks(pageW, pageH, opts.bleed));
  out.push('</svg>');
  return out.join('\n');
}

/** Trim marks outside the bleed, for a print shop. @param {number} w @param {number} h @param {number} b */
function cropMarks(w, h, b) {
  const len = b * 0.8;
  /** @type {string[]} */ const marks = [];
  for (const [x, y] of [[b, b], [w - b, b], [b, h - b], [w - b, h - b]]) {
    const sx = x === b ? -1 : 1;
    const sy = y === b ? -1 : 1;
    marks.push(`M${x + sx * b} ${y}h${sx * len}`, `M${x} ${y + sy * b}v${sy * len}`);
  }
  return `<path d="${marks.join('')}" stroke="#000000" stroke-width="0.25" fill="none"/>`;
}

/**
 * A self-contained SVG per face, plus @font-face rules so the file renders the
 * same outside the app. Fonts are referenced, not embedded: a data-URI woff2 per
 * face would multiply a 30KB drawing by a megabyte.
 * @param {import('../core/types.js').LayoutPlan} plan
 * @param {SvgOptions} opts
 * @returns {string[]}
 */
export function planToSvg(plan, opts) {
  return plan.faces.map((face) => faceToSvg(face, plan, opts));
}
