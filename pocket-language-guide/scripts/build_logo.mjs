// The logo as path data, for the cards.
//
// `favicon.svg` is the one drawing of the mark; the PNG icons are rasterised from
// it and this writes it out a third way, as the flat absolute path data the PDF and
// SVG renderers draw a `PathMark` from. Flat because neither renderer applies a
// transform to a path: the favicon's rounded rectangles sit inside rotated groups,
// and pdf-lib's `drawSvgPath` would draw them unrotated. So each shape is turned into
// cubic curves here, rotated into place, and scaled to a box one point tall, from
// which `logoMarks` in core/solve/index.js scales it to the band's type size.
//
//   node scripts/build_logo.mjs        writes core/logo-shapes.js

import { readFileSync, writeFileSync } from 'node:fs';

/** @typedef {[number, number]} Pt */
/** @typedef {[string, ...Pt[]]} Cmd */

const svg = readFileSync(new URL('../favicon.svg', import.meta.url), 'utf8');
const view = /viewBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/.exec(svg);
if (!view) throw new Error('favicon.svg has no viewBox');
const [vx, vy, vw, vh] = view.slice(1).map(Number);
const KAPPA = 0.5522847498;

/** @param {string|undefined} s @returns {(p: Pt) => Pt} */
function rotation(s) {
  const m = /rotate\(([\d.-]+)(?:,([\d.-]+),([\d.-]+))?\)/.exec(s ?? '');
  if (!m) return (p) => p;
  const a = (Number(m[1]) * Math.PI) / 180;
  const cx = Number(m[2] ?? 0);
  const cy = Number(m[3] ?? 0);
  return ([x, y]) => [
    cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
    cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a),
  ];
}

/**
 * A rounded rectangle as M/L/C/Z, in its own coordinates.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} rx @param {number} ry
 * @returns {Cmd[]}
 */
function roundedRect(x, y, w, h, rx, ry) {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ['M', [x + rx, y]], ['L', [x + w - rx, y]],
    ['C', [x + w - rx + kx, y], [x + w, y + ry - ky], [x + w, y + ry]],
    ['L', [x + w, y + h - ry]],
    ['C', [x + w, y + h - ry + ky], [x + w - rx + kx, y + h], [x + w - rx, y + h]],
    ['L', [x + rx, y + h]],
    ['C', [x + rx - kx, y + h], [x, y + h - ry + ky], [x, y + h - ry]],
    ['L', [x, y + ry]],
    ['C', [x, y + ry - ky], [x + rx - kx, y], [x + rx, y]],
    ['Z'],
  ];
}

/**
 * The favicon's one path: relative m/c/l/z, made absolute.
 * @param {string} d
 * @returns {Cmd[]}
 */
function pathCommands(d) {
  const tokens = d.match(/[a-zA-Z]|-?[\d.]+(?:e-?\d+)?/g) ?? [];
  /** @type {Cmd[]} */ const out = [];
  let cmd = '';
  /** @type {Pt} */ let cur = [0, 0];
  for (let i = 0; i < tokens.length;) {
    if (/^[a-zA-Z]$/.test(tokens[i])) { cmd = tokens[i]; i += 1; continue; }
    /** @param {number} n @returns {Pt} */
    const rel = (n) => [cur[0] + Number(tokens[i + n]), cur[1] + Number(tokens[i + n + 1])];
    if (cmd === 'm') { cur = rel(0); out.push(['M', cur]); i += 2; cmd = 'l'; }
    else if (cmd === 'l') { cur = rel(0); out.push(['L', cur]); i += 2; }
    else if (cmd === 'c') { const c = [rel(0), rel(2), rel(4)]; out.push(['C', c[0], c[1], c[2]]); cur = c[2]; i += 6; }
    else throw new Error(`unhandled path command ${cmd}`);
  }
  if (/z/i.test(d)) out.push(['Z']);
  return out;
}

/** @typedef {{fill:string, stroke?:string, strokeWidth?:number}} Style */
/** @type {(Style & {d:string})[]} */
const shapes = [];
/** @param {Pt} p @returns {Pt} */
const unit = ([x, y]) => [(x - vx) / vh, (y - vy) / vh];
/** @param {number} n */
const fmt = (n) => Number(n.toFixed(4)).toString();
/** @param {Cmd[]} cmds @param {(p: Pt) => Pt} transform @param {Style} style */
const emit = (cmds, transform, style) => {
  const d = cmds.map(([c, ...pts]) => c + pts.map((p) => unit(transform(p)).map(fmt).join(' ')).join(' ')).join('');
  shapes.push({ d, ...style });
};
/** @param {string} attrs @param {string} name */
const attr = (attrs, name) => new RegExp(`(?:^|\\s)${name}="([^"]+)"`).exec(attrs)?.[1];

// Each group in document order, which is also paint order: rear card, its lines,
// front bubble, its lines. A group's rotation applies to everything in it; a rect's
// own `transform` applies first. The bubble's near-white stroke is written as white.
for (const group of svg.matchAll(/<g id="[^"]+"([^>]*)>([\s\S]*?)<\/g>\s*(?:<\/g>)?/g)) {
  const [, attrs, body] = group;
  const groupFill = attr(attrs, 'fill') ?? '#000000';
  const inner = /<g transform="([^"]+)"[^>]*style="([^"]*)"/.exec(body);
  const outerRotate = rotation(inner?.[1]);
  const stroke = /stroke:(#[0-9a-f]{6})/.exec(inner?.[2] ?? '')?.[1];
  const strokeWidth = Number(/stroke-width:([\d.]+)/.exec(inner?.[2] ?? '')?.[1] ?? 0) / vh;
  /** @param {string} fill @returns {Style} */
  const style = (fill) => ({
    fill, ...(stroke ? { stroke: stroke === '#fffefe' ? '#ffffff' : stroke, strokeWidth } : {}),
  });
  for (const [, rect] of body.matchAll(/<rect ([^>]*)\/>/g)) {
    const num = (/** @type {string} */ name) => Number(attr(rect, name) ?? 0);
    const own = rotation(attr(rect, 'transform'));
    emit(roundedRect(num('x'), num('y'), num('width'), num('height'), num('rx'), num('ry') || num('rx')),
      (p) => outerRotate(own(p)), style(attr(rect, 'fill') ?? groupFill));
  }
  for (const [, d] of body.matchAll(/<path [^>]*d="([^"]+)"/g)) {
    emit(pathCommands(d), outerRotate, style(groupFill));
  }
}

const out = `// Generated by scripts/build_logo.mjs from favicon.svg -- do not edit.
//
// The mark as flat path data in a box one point tall and \`LOGO_ASPECT\` wide, in
// paint order. Coordinates alternate x, y throughout, which is what lets
// \`logoMarks\` scale and place it with one pass over the numbers.

export const LOGO_ASPECT = ${fmt(vw / vh)};

/** @type {{d:string, fill:string, stroke?:string, strokeWidth?:number}[]} */
export const LOGO_SHAPES = ${JSON.stringify(shapes, null, 2)};
`;
writeFileSync(new URL('../core/logo-shapes.js', import.meta.url), out);
console.log(`core/logo-shapes.js: ${shapes.length} shapes, aspect ${fmt(vw / vh)}`);
