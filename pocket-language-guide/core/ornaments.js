// Decorative ink only: these marks never participate in measurement or fitting.
// Coordinates are local to each mark so cut/fold/export use the same geometry.

import { LANGUAGE_MOTIFS, pathPen as pen, isLanguageEmblem, languageRule, languageCorner } from "./ornament-designs.js";

export { LANGUAGE_MOTIFS } from "./ornament-designs.js";

export const ORNAMENT_STYLES = /** @type {const} */ ([
  'classic', 'language', 'botanical', 'waves', 'mosaic', 'weave', 'laurel', 'starforge',
]);
/** @typedef {typeof ORNAMENT_STYLES[number]} OrnamentStyle */
/** @typedef {Exclude<OrnamentStyle, 'classic'|'language'>|import('./ornament-designs.js').LanguageMotif} Motif */
/** @typedef {import('./types.js').PathMark} PathMark */

/** @param {OrnamentStyle|undefined} style @param {string} target */
export function motifFor(style, target) {
  if (style === undefined || style === 'classic') return null;
  if (!ORNAMENT_STYLES.includes(style)) throw new Error(`unknown ornament style: ${style}`);
  if (style !== 'language') return style;
  const motif = LANGUAGE_MOTIFS[/** @type {keyof typeof LANGUAGE_MOTIFS} */ (target)];
  if (!motif) throw new Error(`no ornament design for language: ${target}`);
  return motif;
}

/** A horizontal ornament. All ink, including the stroke, stays inside its box.
 * @param {Motif} motif @param {number} x @param {number} y
 * @param {number} w @param {number} h @param {string} color
 * @returns {PathMark} */
export function ornamentRule(motif, x, y, w, h, color) {
  const strokeWidth = Math.min(0.3, h / 5);
  const pad = strokeWidth;
  const p = pen(w - pad * 2, h - pad * 2);
  if (isLanguageEmblem(motif)) {
    languageRule(motif, p, w - pad * 2, h - pad * 2);
  } else if (motif === 'botanical' || motif === 'laurel') {
    p.m(0, 55); p.c(18, 62, 23, 35, 43, 50);
    p.m(57, 50); p.c(77, 65, 82, 38, 100, 45);
    for (const [i, a] of [9, 22, 35, 65, 78, 91].entries()) {
      const s = i % 2 ? -1 : 1;
      p.m(a, 50); p.c(a - 3 * s, 50 - 15 * s, a - s, 50 - 32 * s, a + 7 * s, 50 - 38 * s);
      p.c(a + 8 * s, 50 - 13 * s, a + 4 * s, 50 - 5 * s, a, 50);
      if (motif === 'laurel') {
        p.m(a, 50); p.q(a - 6 * s, 50 + 38 * s, a - 8 * s, 50 + 30 * s);
        p.q(a - 7 * s, 50 + 8 * s, a, 50);
      }
    }
    p.m(43, 50); p.q(50, 5, 57, 50); p.q(50, 95, 43, 50);
    p.m(47, 50); p.l(53, 50);
  } else if (motif === 'waves') {
    for (const y0 of [35, 65]) {
      p.m(0, y0);
      for (let a = 0; a < 100; a += 20) {
        p.c(a + 5, y0 - 35, a + 15, y0 + 35, a + 20, y0);
      }
    }
  } else if (motif === 'mosaic') {
    p.m(0, 50); p.l(37, 50); p.m(63, 50); p.l(100, 50);
    for (const a of [5, 20, 40, 55, 75, 90]) {
      p.m(a - 4, 50); p.l(a + 1, 12); p.l(a + 6, 50);
      p.l(a + 1, 88); p.close();
    }
  } else if (motif === 'weave') {
    for (const y0 of [15, 65]) {
      p.m(0, y0);
      for (let a = 0; a < 100; a += 20) {
        p.l(a + 5, y0); p.l(a + 15, y0 + 20); p.l(a + 20, y0 + 20);
      }
    }
    for (let a = 5; a < 100; a += 20) {
      p.m(a, 85); p.l(a + 10, 15);
    }
  } else {
    p.m(0, 50); p.l(32, 50); p.l(40, 18); p.l(46, 50);
    p.m(54, 50); p.l(60, 82); p.l(68, 50); p.l(100, 50);
    p.m(46, 50); p.l(50, 5); p.l(54, 50); p.l(50, 95); p.close();
    p.m(10, 15); p.l(30, 15); p.m(70, 85); p.l(90, 85);
  }
  const d = p.d().replace(/-?\d+(?:\.\d+)?/g,
    n => String(Number((Number(n) + pad).toFixed(3))));
  return { x, y, w, h, d, stroke: color, strokeWidth };
}

/** Larger corner flourishes, used only where there is genuinely empty paper.
 * @param {Motif} motif @param {number} size @param {string} color
 * @param {number} x @param {number} y @param {boolean} right @param {boolean} bottom
 * @returns {PathMark} */
function corner(motif, size, color, x, y, right, bottom) {
  const pad = 0.35;
  const p = pen(size - 2 * pad, size - 2 * pad);
  if (isLanguageEmblem(motif)) {
    languageCorner(motif, p);
  } else if (motif === 'botanical' || motif === 'laurel') {
    p.m(5, 94); p.c(34, 72, 0, 28, 40, 12); p.c(69, 0, 84, 21, 94, 5);
    p.m(10, 88); p.c(48, 63, 18, 40, 54, 23); p.c(76, 14, 83, 28, 94, 16);
    for (const [a, b] of [[16, 65], [20, 42], [42, 26]]) {
      p.m(a, b); p.c(a - 16, b - 3, a - 12, b - 19, a, b - 24);
      p.c(a + 9, b - 12, a + 5, b - 5, a, b);
    }
    p.m(40, 48); p.c(67, 43, 70, 30, 62, 27); p.c(52, 23, 47, 34, 53, 37);
    p.m(31, 74); p.c(56, 72, 49, 52, 38, 60); p.c(32, 65, 40, 68, 43, 64);
  } else if (motif === 'waves') {
    for (const r of [26, 45, 64, 83]) {
      p.m(6, r); p.c(r * 0.65, r, r, r * 0.65, r, 6);
      p.m(6, r + 7); p.c(r * 0.75, r + 7, r + 7, r * 0.75, r + 7, 6);
    }
  } else if (motif === 'mosaic' || motif === 'weave') {
    for (const a of [8, 31, 54]) {
      p.m(a, a + 24); p.l(a, a); p.l(a + 24, a);
      p.m(a + 7, a + 31); p.l(a + 7, a + 7); p.l(a + 31, a + 7);
    }
    p.m(15, 80); p.l(23, 72); p.l(31, 80); p.l(23, 88); p.close();
    p.m(80, 15); p.l(88, 23); p.l(80, 31); p.l(72, 23); p.close();
  } else {
    p.m(6, 90); p.l(6, 6); p.l(90, 6);
    p.m(15, 68); p.l(15, 15); p.l(68, 15);
    p.m(28, 28); p.l(62, 36); p.l(36, 62); p.close();
    p.m(22, 85); p.l(32, 70); p.m(70, 32); p.l(85, 22);
  }
  // Mirror local coordinates once here; exports need only a translation.
  let coordinate = 0;
  const d = p.d().replace(/-?\d+(?:\.\d+)?/g, (n) => {
    const flip = coordinate++ % 2 ? bottom : right;
    const value = Number(n) + pad;
    return String(Number((flip ? size - value : value).toFixed(3)));
  });
  return { x, y, w: size, h: size, d, stroke: color, strokeWidth: 0.35 };
}

/** Keep corner art inside the printer-safe area, clear of content, running heads,
 * and phone reservations. Tight sheets simply have decorated rules.
 * @param {import('./types.js').SheetSpec} spec @param {import('./types.js').Face} face
 * @param {{insetX:number,insetY:number}} box @param {string} color
 * @returns {PathMark[]} */
export function cornerOrnaments(spec, face, box, color) {
  const motif = motifFor(spec.ornamentStyle, spec.target);
  if (!motif || spec.inkMode === 'low-ink') return [];
  const g = spec.geometry;
  const left = box.insetX + 1;
  const top = Math.max(box.insetY, g.pageH * (g.reserve?.top ?? 0)) + 1;
  const bottom = g.pageH - Math.max(box.insetY, g.pageH * (g.reserve?.bottom ?? 0)) - 1;
  const right = g.pageW - box.insetX - 1;
  const obstacles = [
    ...face.hits,
    ...face.runs.map(r => ({ x: r.x, y: r.y - r.size * 1.3,
      w: Math.max(r.size, r.text.length * r.size), h: r.size * 1.7 })),
  ];
  /** @type {PathMark[]} */ const out = [];
  for (const mirroredX of [false, true]) for (const mirroredY of [false, true]) {
    for (const size of [26, 20, 14, 9]) {
      const x = mirroredX ? right - size : left;
      const y = mirroredY ? bottom - size : top;
      if (x < left || y < top || x + size > right || y + size > bottom) continue;
      // A flourish must belong wholly to one half when the sheet is cut or folded.
      if (x < g.pageW / 2 && x + size > g.pageW / 2) continue;
      const collides = obstacles.some(o => x < o.x + o.w + 1 && x + size + 1 > o.x
        && y < o.y + o.h + 1 && y + size + 1 > o.y);
      if (collides) continue;
      out.push(corner(motif, size, color, x, y, mirroredX, mirroredY));
      break;
    }
  }
  return out;
}

/** Slender flourishes in the existing column gutters give dense cards a visible
 * motif without borrowing space from text. Leave the card-cut seam clear.
 * @param {import('./types.js').SheetSpec} spec
 * @param {{left:number,top:number,colWidth:number,height:number}} box
 * @param {string} color @returns {PathMark[]} */
export function gutterOrnaments(spec, box, color) {
  const motif = motifFor(spec.ornamentStyle, spec.target);
  const gap = spec.geometry.columnGap;
  if (!motif || spec.inkMode === 'low-ink' || gap < 2.5) return [];
  const width = Math.min(7, gap - 1.5);
  const height = Math.min(46, box.height - 4);
  if (height < 16) return [];
  /** @type {PathMark[]} */ const out = [];
  for (let c = 1; c < spec.geometry.columns; c += 1) {
    const x = box.left + c * box.colWidth + (c - 0.5) * gap - width / 2;
    if (x < spec.geometry.pageW / 2 && x + width > spec.geometry.pageW / 2) continue;
    for (let y = box.top + 2; y + height <= box.top + box.height - 2; y += 86) {
      const rule = ornamentRule(motif, 0, 0, height, width, color);
      const d = rule.d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, '$2 $1');
      out.push({ ...rule, x: x + rule.y, y: y + rule.x, w: rule.h, h: rule.w, d });
    }
  }
  return out;
}
