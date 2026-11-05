// Logo sheets (R's read_logo, render_logo_sheet and svg_read.R): one logo per
// occupied cell, e.g. for the backs of the tags, scaled to fit the cell less
// a margin and centred. An SVG logo becomes filled polygons (engraved black
// unless use_file_colors), strokes dropped; a PNG or JPEG logo is embedded as
// an image. Logos arrive as data: URLs.

import { bounds, union } from '../../shared/polygon.js';
import { NameTagsError } from './request.js';

/**
 * @typedef {import('./geometry.js').Polygon} Polygon
 * @typedef {{ type: 'svg', polygons: Polygon[], fills: string[], dim: number[] } | { type: 'png' | 'jpeg', href: string, dim: number[] }} Logo
 * @typedef {{ name: string, attrs: Record<string, string>, children: XmlNode[] }} XmlNode
 * @typedef {{ x: number[], y: number[], idx: number[] }} ShapePoints
 */

// ---------- data URLs ----------

/** @param {string} url */
function dataUrlBytes(url) {
  const comma = url.indexOf(',');
  const meta = url.slice(5, comma);
  const body = url.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    const bin = atob(body.replace(/\s/g, ''));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  return new TextEncoder().encode(decodeURIComponent(body));
}

/** Pixel size of a PNG or JPEG from its header. @param {Uint8Array} b @param {'png' | 'jpeg'} type */
function imageSize(b, type) {
  if (type === 'png') {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (b.length < 24 || !sig.every((v, i) => b[i] === v)) throw new Error('not a PNG file');
    const u32 = (/** @type {number} */ o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    return [u32(16), u32(20)];
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('not a JPEG file');
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) throw new Error('corrupt JPEG marker');
    const marker = b[o + 1];
    const len = (b[o + 2] << 8) | b[o + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [(b[o + 7] << 8) | b[o + 8], (b[o + 5] << 8) | b[o + 6]];
    }
    o += 2 + len;
  }
  throw new Error('no JPEG frame header');
}

// ---------- a small XML reader (enough for SVG files) ----------

const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });
/** @param {string} s */
const decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e] ?? m;
});
/** Drops a namespace prefix, as xml2::xml_ns_strip does. @param {string} n */
const local = (n) => n.slice(n.indexOf(':') + 1);

/** @param {string} text @returns {XmlNode} */
export function parseXml(text) {
  /** @type {XmlNode} */
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE(?:[^[>]|\[[^\]]*\])*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/gi;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) {
      const name = local(m[1]);
      if (stack.length < 2 || stack[stack.length - 1].name !== name) throw new Error(`mismatched closing tag </${m[1]}>`);
      stack.pop();
    } else if (m[2]) {
      /** @type {Record<string, string>} */
      const attrs = {};
      for (const a of m[3].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[local(a[1])] = decodeEntities(a[2] ?? a[3]);
      const node = { name: local(m[2]), attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  if (stack.length !== 1) throw new Error(`unclosed <${stack[stack.length - 1].name}>`);
  const svg = root.children.find((c) => c.name === 'svg');
  if (!svg) throw new Error('no <svg> element');
  return svg;
}

// ---------- SVG shapes (svg_read.R) ----------

/** parse_svg_color: a fill or stroke as #rrggbb, a colour name, or null for none. @param {string | undefined} v */
function parseColor(v) {
  if (v === undefined) return null;
  const s = v.trim();
  if (s === '' || s === 'none' || s === 'transparent') return null;
  if (/^url\(/i.test(s)) return '#000000';
  const rgb = /^rgb\(([^)]*)\)$/i.exec(s.replace(/\s/g, ''));
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => (p.endsWith('%') ? Number(p.slice(0, -1)) / 100 : Number(p) / 255));
    return `#${parts.map((p) => Math.round(Math.min(1, Math.max(0, p)) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${[...s.slice(1)].map((h) => h + h).join('')}`.toUpperCase();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^[a-z]+$/i.test(s)) return s.toLowerCase();
  throw new Error(`unsupported SVG colour "${v}"`);
}

/** @param {XmlNode} node */
function styleProps(node) {
  /** @type {Record<string, string>} */
  const props = {};
  for (const decl of (node.attrs.style ?? '').split(';')) {
    const k = decl.indexOf(':');
    if (k > 0) props[decl.slice(0, k).trim()] = decl.slice(k + 1).trim();
  }
  for (const a of ['fill', 'stroke', 'display', 'visibility']) if (node.attrs[a] !== undefined && props[a] === undefined) props[a] = node.attrs[a];
  return props;
}

/** @typedef {number[]} Matrix [a, b, c, d, e, f] as SVG's matrix() */
/** @param {Matrix} m @param {Matrix} t */
const mul = (m, t) => [m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1], m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3],
  m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5]];

/** parse_svg_transform. @param {string | undefined} value @returns {Matrix} */
function parseTransform(value) {
  let m = [1, 0, 0, 1, 0, 0];
  for (const call of (value ?? '').matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const a = call[2].trim().split(/[\s,]+/).map(Number);
    const r = (/** @type {number} */ deg) => deg * Math.PI / 180;
    /** @type {Matrix} */
    let t;
    switch (call[1]) {
      case 'matrix': t = a.slice(0, 6); break;
      case 'translate': t = [1, 0, 0, 1, a[0], a.length > 1 ? a[1] : 0]; break;
      case 'scale': t = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0]; break;
      case 'rotate': {
        const c = Math.cos(r(a[0]));
        const s = Math.sin(r(a[0]));
        t = [c, s, -s, c, 0, 0];
        if (a.length === 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'skewX': t = [1, 0, Math.tan(r(a[0])), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan(r(a[0])), 0, 1, 0, 0]; break;
      default: throw new Error(`unsupported SVG transform ${call[1]}`);
    }
    m = mul(m, t);
  }
  return m;
}

/** @param {number[]} p0 @param {number[]} p1 @param {number[]} p2 @param {number[]} p3 @param {number} n */
function cubic(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]]);
  }
  return out;
}

/** flatten_arc: an elliptical arc as n points. */
function arc(/** @type {number[]} */ p0, /** @type {number} */ rx0, /** @type {number} */ ry0, /** @type {number} */ phiDeg,
  /** @type {boolean} */ large, /** @type {boolean} */ sweep, /** @type {number[]} */ p1, /** @type {number} */ n) {
  if (rx0 === 0 || ry0 === 0 || (p0[0] === p1[0] && p0[1] === p1[1])) return [p1];
  const phi = phiDeg * Math.PI / 180;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1p = cp * dx + sp * dy;
  const y1p = -sp * dx + cp * dy;
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  const lambda = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2;
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2;
  let coef = Math.sqrt(Math.max(0, num / (rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2)));
  if (large === sweep) coef = -coef;
  const cxp = coef * rx * y1p / ry;
  const cyp = -coef * ry * x1p / rx;
  const cx = cp * cxp - sp * cyp + (p0[0] + p1[0]) / 2;
  const cy = sp * cxp + cp * cyp + (p0[1] + p1[1]) / 2;
  const ang = (/** @type {number} */ ux, /** @type {number} */ uy, /** @type {number} */ vx, /** @type {number} */ vy) => {
    const a = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)))));
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const out = [];
  for (let i = 1; i <= n; i++) {
    const th = th1 + dth * i / n;
    out.push([cx + rx * Math.cos(th) * cp - ry * Math.sin(th) * sp, cy + rx * Math.cos(th) * sp + ry * Math.sin(th) * cp]);
  }
  return out;
}

/** parse_svg_path_d: points with their subpath index; a close adds the subpath's start. @param {string} d @param {number} curveN @returns {ShapePoints} */
function parsePath(d, curveN) {
  const tok = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:[0-9]*\.[0-9]+|[0-9]+\.?)(?:[eE][-+]?[0-9]+)?/g) ?? [];
  /** @type {ShapePoints} */
  const out = { x: [], y: [], idx: [] };
  let sub = 0;
  const add = (/** @type {number[][]} */ pts) => { for (const [x, y] of pts) { out.x.push(x); out.y.push(y); out.idx.push(sub); } };
  let i = 0;
  let cmd = '';
  let cur = [0, 0];
  let start = [0, 0];
  /** @type {number[] | null} */
  let lastCtrl = null;
  let lastCmd = '';
  const next = () => {
    if (i >= tok.length || /[A-Za-z]/.test(tok[i])) throw new Error(`SVG path data ends early: ${d.slice(0, 60)}`);
    return Number(tok[i++]);
  };
  while (i < tok.length) {
    if (/^[A-Za-z]$/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const base = rel ? cur : [0, 0];
    const up = cmd.toUpperCase();
    const pt = () => { const x = next(); const y = next(); return [base[0] + x, base[1] + y]; };
    if (up === 'Z') {
      add([start]); cur = start; lastCtrl = null; lastCmd = 'Z';
      if (i < tok.length && !/[A-Za-z]/.test(tok[i])) throw new Error('number after Z in SVG path data');
      continue;
    }
    if (up === 'M') {
      const p = pt(); sub++;
      add([p]); cur = start = p;
      cmd = rel ? 'l' : 'L'; lastCtrl = null; lastCmd = 'M';
      continue;
    }
    if (up === 'L') { const p = pt(); add([p]); cur = p; lastCtrl = null; } else if (up === 'H') {
      const v = next(); const p = [rel ? cur[0] + v : v, cur[1]]; add([p]); cur = p; lastCtrl = null;
    } else if (up === 'V') {
      const v = next(); const p = [cur[0], rel ? cur[1] + v : v]; add([p]); cur = p; lastCtrl = null;
    } else if (up === 'C') {
      const c1 = pt(); const c2 = pt(); const p = pt();
      add(cubic(cur, c1, c2, p, curveN)); lastCtrl = c2; cur = p;
    } else if (up === 'S') {
      const c1 = (lastCmd === 'C' || lastCmd === 'S') && lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
      const c2 = pt(); const p = pt();
      add(cubic(cur, c1, c2, p, curveN)); lastCtrl = c2; cur = p;
    } else if (up === 'Q' || up === 'T') {
      /** @type {number[]} */
      const q = up === 'Q' ? pt() : ((lastCmd === 'Q' || lastCmd === 'T') && lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur);
      const p = pt();
      add(cubic(cur, [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])], [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])], p, curveN));
      lastCtrl = q; cur = p;
    } else if (up === 'A') {
      const rx = next(); const ry = next(); const phi = next(); const fa = next(); const fs = next(); const p = pt();
      add(arc(cur, rx, ry, phi, fa !== 0, fs !== 0, p, curveN)); cur = p; lastCtrl = null;
    } else {
      throw new Error(`unsupported SVG path command ${cmd}`);
    }
    lastCmd = up;
  }
  return out;
}

/** svg_shape_points. @param {XmlNode} node @param {number} curveN @returns {ShapePoints} */
function shapePoints(node, curveN) {
  const num = (/** @type {string} */ a, def = 0) => (node.attrs[a] === undefined ? def : Number(node.attrs[a].replace(/[a-z%]+$/i, '')));
  const ellipse = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ rx, /** @type {number} */ ry) => {
    const n = 4 * curveN;
    const th = Array.from({ length: n }, (_, k) => 2 * Math.PI * (k + 1) / n);
    return { x: th.map((t) => cx + rx * Math.cos(t)), y: th.map((t) => cy + ry * Math.sin(t)), idx: th.map(() => 1) };
  };
  switch (node.name) {
    case 'path': return parsePath(node.attrs.d ?? '', curveN);
    case 'rect': {
      const x = num('x'); const y = num('y'); const w = num('width'); const h = num('height');
      return { x: [x, x + w, x + w, x], y: [y, y, y + h, y + h], idx: [1, 1, 1, 1] };
    }
    case 'circle': return ellipse(num('cx'), num('cy'), num('r'), num('r'));
    case 'ellipse': return ellipse(num('cx'), num('cy'), num('rx'), num('ry'));
    case 'line': return { x: [num('x1'), num('x2')], y: [num('y1'), num('y2')], idx: [1, 1] };
    default: { // polyline, polygon
      const v = (node.attrs.points ?? '').trim().split(/[\s,]+/).map(Number);
      return { x: v.filter((_, k) => k % 2 === 0), y: v.filter((_, k) => k % 2 === 1), idx: v.filter((_, k) => k % 2 === 0).map(() => 1) };
    }
  }
}

const SHAPES = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'];
const SKIP = ['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker', 'metadata', 'namedview', 'title', 'desc', 'style', 'linearGradient', 'radialGradient'];

/**
 * read_svg_shapes: every drawable shape with all ancestor transforms applied,
 * curves flattened to `curveN` points per segment.
 * @param {string} text @param {number} [curveN]
 * @returns {{ x: number[], y: number[], idx: number[], fill: string | null, tag: string }[]}
 */
export function readSvgShapes(text, curveN = 16) {
  const svg = parseXml(text);
  /** @type {{ x: number[], y: number[], idx: number[], fill: string | null, tag: string }[]} */
  const shapes = [];
  /** @param {XmlNode} node @param {Matrix} m @param {Record<string, string>} inherited */
  const walk = (node, m, inherited) => {
    if (SKIP.includes(node.name)) return;
    const props = { ...inherited, ...styleProps(node) };
    if (props.display === 'none' || props.visibility === 'hidden') return;
    const mm = mul(m, parseTransform(node.attrs.transform));
    if (['text', 'use', 'image'].includes(node.name)) {
      throw new Error(`SVG <${node.name}> elements are not supported; convert them to paths (Inkscape: Path > Object to Path) first`);
    }
    if (SHAPES.includes(node.name)) {
      const pts = shapePoints(node, curveN);
      if (pts.x.length) {
        shapes.push({
          x: pts.x.map((x, k) => mm[0] * x + mm[2] * pts.y[k] + mm[4]),
          y: pts.x.map((x, k) => mm[1] * x + mm[3] * pts.y[k] + mm[5]),
          idx: pts.idx,
          fill: node.name === 'line' || node.name === 'polyline' ? null : parseColor(props.fill ?? '#000000'),
          tag: node.name,
        });
      }
    }
    for (const child of node.children) walk(child, mm, props);
  };
  walk(svg, [1, 0, 0, 1, 0, 0], {});
  if (!shapes.length) throw new Error('no drawable shapes in the SVG');
  return shapes;
}

/**
 * read_logo: a logo sized to fit `box` (inches).
 * @param {string} url data: URL @param {number[]} box
 * @returns {Logo}
 */
function loadLogo(url, box) {
  const type = /^data:image\/svg\+xml/i.test(url) ? 'svg' : /^data:image\/png/i.test(url) ? 'png' : 'jpeg';
  const bytes = dataUrlBytes(url);
  if (type !== 'svg') {
    const dim0 = imageSize(bytes, type);
    const s = Math.min(box[0] / dim0[0], box[1] / dim0[1]);
    return { type, href: url, dim: [dim0[0] * s, dim0[1] * s] };
  }
  const shapes = readSvgShapes(new TextDecoder().decode(bytes)).filter((sh) => sh.fill !== null); // filled shapes only
  if (!shapes.length) throw new Error('the logo SVG has no filled shapes');
  const all = shapes.flatMap((sh) => sh.x.flatMap((x, k) => [x, sh.y[k]]));
  const [x0, y0, x1, y1] = bounds([all]);
  const s = Math.min(box[0] / (x1 - x0), box[1] / (y1 - y0));
  const ymax = (y1 - y0) * s;
  /** @type {Polygon[]} */
  const polygons = [];
  /** @type {string[]} */
  const fills = [];
  for (const sh of shapes) {
    const xs = sh.x.map((x) => (x - x0) * s);
    const ys = sh.y.map((y) => ymax - (y - y0) * s); // y up
    if (new Set(xs.map((x, k) => `${x},${ys[k]}`)).size === 1) continue; // a lone point
    /** @type {Map<number, number[]>} */
    const subs = new Map();
    sh.idx.forEach((id, k) => { if (!subs.has(id)) subs.set(id, []); /** @type {number[]} */ (subs.get(id)).push(xs[k], ys[k]); });
    const rings = [...subs.values()].filter((r) => new Set(r.flatMap((_, k) => (k % 2 ? [] : [`${r[k]},${r[k + 1]}`]))).size >= 3)
      .map((r) => (r[0] === r[r.length - 2] && r[1] === r[r.length - 1] ? r : [...r, r[0], r[1]]));
    if (!rings.length) continue;
    const valid = union(rings, 'evenodd'); // st_make_valid of the shape's rings
    if (!valid.length) continue;
    polygons.push(valid.flat());
    fills.push(/** @type {string} */ (sh.fill));
  }
  return { type: 'svg', polygons, fills, dim: [(x1 - x0) * s, ymax] };
}

/**
 * A logo read once per distinct file, with errors reported against `path`.
 * @param {string} url @param {number[]} cell @param {import('./request.js').LogoOptions} opts @param {string} path
 */
export function readLogo(url, cell, opts, path) {
  const box = [cell[0] - cell[0] / opts.margin_div, cell[1] - cell[0] / opts.margin_div];
  try {
    return loadLogo(url, box);
  } catch (error) {
    const message = `cannot read the logo: ${/** @type {Error} */ (error).message}`;
    throw new NameTagsError('invalid_logo', message, [{ code: 'invalid_logo', path, message }]);
  }
}

/**
 * One cell of a logo sheet: the logo centred in the cell, nudged by center_adj_prop.
 * @param {Logo} logo @param {number[]} origin @param {number[]} cell @param {import('./request.js').LogoOptions} opts
 * @returns {import('./svg.js').CellDrawing}
 */
export function logoDrawing(logo, origin, cell, opts) {
  const x = origin[0] + opts.center_adj_prop[0] * cell[0] + (cell[0] - logo.dim[0]) / 2;
  const y = origin[1] + opts.center_adj_prop[1] * cell[1] + (cell[1] - logo.dim[1]) / 2;
  if (logo.type !== 'svg') return { origin, layers: [], images: [{ x, y, w: logo.dim[0], h: logo.dim[1], href: logo.href }] };
  return {
    origin,
    layers: [{ kind: 'shape', polygons: logo.polygons, dx: x - origin[0], dy: y - origin[1] }],
    fills: opts.use_file_colors ? logo.fills : logo.fills.map(() => '#000000'),
  };
}
