// Reading a signature into strokes of raw points {x, y, t?, pressure?}, from
// any of the request's four forms:
//
// - strokes: [{ points: [{ x, y, t?, pressure? }, ...] }, ...]
// - csv: text with a header naming x and y, and optionally t (milliseconds),
//   pressure and stroke. Without a stroke column the pen lifts where t jumps by
//   more than `penUpGap` (the R script's rule, with its 50), or at a row whose
//   x and y are empty or NA. Other columns are ignored, with a warning.
// - matrix: [[x1, x2, ...], [y1, y2, ...]], a 2 × n matrix as R writes it to
//   JSON; a column of nulls lifts the pen.
// - svg: an SVG document or bare path data. Each subpath, polyline or line is a
//   pen stroke (its centreline), curves flattened, element and group transforms
//   applied.
//
// Problems are pushed as issues {code, path, message}; the caller throws them.

/**
 * @typedef {import('./resample.js').RawPoint} RawPoint
 * @typedef {{ code: string, path: string, message: string }} Issue
 * @typedef {{ code: string, message: string }} Warning
 */

const num = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {Record<string, any>} source the object holding one of strokes, csv, matrix or svg
 * @param {string} at path of that object in the request ('' for the request itself)
 * @param {{ penUpGap: number, yAxis: 'down' | 'up' }} opts
 * @param {Issue[]} issues @param {Warning[]} warnings
 * @returns {RawPoint[][] | null}
 */
export function readSignature(source, at, opts, issues, warnings) {
  const forms = ['strokes', 'csv', 'matrix', 'svg'].filter((k) => source[k] !== undefined);
  const where = (/** @type {string} */ k) => (at ? `${at}.${k}` : k);
  if (forms.length !== 1) {
    issues.push({ code: forms.length ? 'CONFLICTING_INPUT' : 'MISSING_INPUT', path: at, message: forms.length
      ? `give one of strokes, csv, matrix, svg, not ${forms.join(' and ')}` : 'needs a signature: one of strokes, csv, matrix or svg' });
    return null;
  }
  const form = forms[0];
  const before = issues.length;
  const value = source[form];
  const strokes = form === 'strokes' ? readStrokes(value, where(form), issues)
    : form === 'csv' ? readCsv(value, where(form), opts.penUpGap, issues, warnings)
      : form === 'matrix' ? readMatrix(value, where(form), issues)
        : readSvg(value, where(form), issues);
  if (!strokes) return null;
  const kept = /** @type {RawPoint[][]} */ (strokes).filter((s) => s.length > 0);
  if (!kept.length && issues.length === before) issues.push({ code: 'EMPTY_INPUT', path: where(form), message: 'holds no points' });
  checkTimes(kept, where(form), issues);
  if (issues.length > before) return null;
  return opts.yAxis === 'up' ? kept.map((s) => s.map((p) => ({ ...p, y: -p.y }))) : kept;
}

/** Times, where given, are on every point and do not run backwards within a stroke. @param {RawPoint[][]} strokes @param {string} path @param {Issue[]} issues */
function checkTimes(strokes, path, issues) {
  for (const key of /** @type {const} */ (['t', 'pressure'])) {
    const has = strokes.flat().map((p) => p[key] !== undefined);
    if (has.some(Boolean) && !has.every(Boolean)) {
      issues.push({ code: 'PARTIAL_FIELD', path, message: `${key} is given for some points but not all; give it for every point or for none` });
    }
  }
  strokes.forEach((s, i) => {
    const back = s.findIndex((p, k) => k > 0 && p.t !== undefined && /** @type {number} */ (p.t) < /** @type {number} */ (s[k - 1].t));
    if (back > 0) issues.push({ code: 'TIME_BACKWARDS', path, message: `stroke ${i}: t decreases at point ${back}` });
  });
}

/** @param {unknown} value @param {string} path @param {Issue[]} issues */
function readStrokes(value, path, issues) {
  if (!Array.isArray(value)) {
    issues.push({ code: 'INVALID_FIELD', path, message: 'must be an array of strokes, each { points: [{ x, y, t?, pressure? }, ...] }' });
    return null;
  }
  return value.map((stroke, i) => {
    const sp = `${path}[${i}]`;
    if (!stroke || typeof stroke !== 'object' || !Array.isArray(stroke.points)) {
      issues.push({ code: 'INVALID_FIELD', path: sp, message: 'must be { points: [{ x, y, t?, pressure? }, ...] }' });
      return [];
    }
    for (const k of Object.keys(stroke)) if (k !== 'points') issues.push({ code: 'UNKNOWN_FIELD', path: `${sp}.${k}`, message: 'unknown field; a stroke has points' });
    return stroke.points.map((/** @type {any} */ p, /** @type {number} */ k) => {
      const pp = `${sp}.points[${k}]`;
      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        issues.push({ code: 'INVALID_FIELD', path: pp, message: 'must be { x, y, t?, pressure? }' });
        return { x: 0, y: 0 };
      }
      for (const key of Object.keys(p)) {
        if (!['x', 'y', 't', 'pressure'].includes(key)) issues.push({ code: 'UNKNOWN_FIELD', path: `${pp}.${key}`, message: 'unknown field; a point has x, y, t, pressure' });
      }
      for (const key of ['x', 'y']) if (!num(p[key])) issues.push({ code: 'INVALID_FIELD', path: `${pp}.${key}`, message: 'must be a finite number' });
      if (p.t !== undefined && !num(p.t)) issues.push({ code: 'INVALID_FIELD', path: `${pp}.t`, message: 'must be a finite number (milliseconds)' });
      if (p.pressure !== undefined && !(num(p.pressure) && p.pressure >= 0 && p.pressure <= 1)) {
        issues.push({ code: 'INVALID_FIELD', path: `${pp}.pressure`, message: 'must be a number from 0 to 1' });
      }
      /** @type {RawPoint} */
      const out = { x: p.x, y: p.y };
      if (p.t !== undefined) out.t = p.t;
      if (p.pressure !== undefined) out.pressure = p.pressure;
      return out;
    });
  });
}

/** @param {unknown} value @param {string} path @param {number} gap @param {Issue[]} issues @param {Warning[]} warnings */
function readCsv(value, path, gap, issues, warnings) {
  if (typeof value !== 'string') {
    issues.push({ code: 'INVALID_FIELD', path, message: 'must be CSV text with a header row naming x and y (and optionally t, pressure, stroke)' });
    return null;
  }
  const lines = value.split(/\r?\n/).filter((l) => l.trim() !== '');
  const unquote = (/** @type {string} */ s) => s.trim().replace(/^"(.*)"$/, '$1');
  const header = (lines[0] ?? '').split(',').map((h) => unquote(h).toLowerCase());
  const col = Object.fromEntries(['x', 'y', 't', 'pressure', 'stroke'].map((k) => [k, header.indexOf(k)]));
  if (col.x < 0 || col.y < 0) {
    issues.push({ code: 'BAD_CSV', path, message: `the header row must name columns x and y; it has ${header.map((h) => h || '(empty)').join(', ')}` });
    return null;
  }
  const ignored = header.filter((h, i) => !Object.values(col).includes(i) && h !== '');
  if (ignored.length) warnings.push({ code: 'IGNORED_COLUMNS', message: `CSV columns not used: ${ignored.join(', ')}` });
  /** @type {RawPoint[][]} */
  const strokes = [[]];
  let lastT = null;
  let lastStroke = null;
  const before = issues.length;
  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(',').map(unquote);
    const read = (/** @type {number} */ c) => (c < 0 || cells[c] === undefined || cells[c] === '' || cells[c].toUpperCase() === 'NA' ? null : Number(cells[c]));
    const [x, y, t, p, s] = [col.x, col.y, col.t, col.pressure, col.stroke].map(read);
    if (x === null && y === null) {
      if (strokes[strokes.length - 1].length) strokes.push([]);
      continue;
    }
    const bad = [['x', x], ['y', y], ['t', t], ['pressure', p], ['stroke', s]].filter(([k, v]) => (v === null ? k === 'x' || k === 'y' : !Number.isFinite(v)));
    if (bad.length) {
      if (issues.length - before < 5) issues.push({ code: 'BAD_CSV', path, message: `row ${r + 1}: ${bad.map(([k]) => k).join(', ')} not a number` });
      continue;
    }
    const lift = col.stroke >= 0 ? lastStroke !== null && s !== lastStroke : t !== null && lastT !== null && t - lastT > gap;
    if (lift && strokes[strokes.length - 1].length) strokes.push([]);
    /** @type {RawPoint} */
    const pt = { x: /** @type {number} */ (x), y: /** @type {number} */ (y) };
    if (t !== null) pt.t = t;
    if (p !== null) pt.pressure = p;
    strokes[strokes.length - 1].push(pt);
    lastT = t;
    lastStroke = s;
  }
  return strokes;
}

/** @param {unknown} value @param {string} path @param {Issue[]} issues */
function readMatrix(value, path, issues) {
  const ok = Array.isArray(value) && value.length === 2 && value.every((row) => Array.isArray(row)) && value[0].length === value[1].length;
  if (!ok) {
    issues.push({ code: 'INVALID_FIELD', path, message: 'must be a 2 × n matrix: [[x1, x2, ...], [y1, y2, ...]], rows of equal length' });
    return null;
  }
  const [xs, ys] = /** @type {unknown[][]} */ (value);
  /** @type {RawPoint[][]} */
  const strokes = [[]];
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] === null && ys[i] === null) {
      if (strokes[strokes.length - 1].length) strokes.push([]);
    } else if (num(xs[i]) && num(ys[i])) strokes[strokes.length - 1].push({ x: /** @type {number} */ (xs[i]), y: /** @type {number} */ (ys[i]) });
    else issues.push({ code: 'INVALID_FIELD', path: `${path}[*][${i}]`, message: 'a column must be two finite numbers, or two nulls to lift the pen' });
  }
  return strokes;
}

// ---------- SVG ----------

/** @typedef {[number, number, number, number, number, number]} Affine  a b c d e f: x' = a x + c y + e */

const IDENTITY = /** @type {Affine} */ ([1, 0, 0, 1, 0, 0]);
/** @param {Affine} m @param {Affine} n m then n applied after: n ∘ m */
const compose = (m, n) => /** @type {Affine} */ ([
  n[0] * m[0] + n[2] * m[1], n[1] * m[0] + n[3] * m[1], n[0] * m[2] + n[2] * m[3], n[1] * m[2] + n[3] * m[3],
  n[0] * m[4] + n[2] * m[5] + n[4], n[1] * m[4] + n[3] * m[5] + n[5]]);

/** An SVG transform attribute as one matrix. @param {string} text @param {string} path @param {Issue[]} issues */
function parseTransform(text, path, issues) {
  let m = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  const rest = text.replace(re, '').replace(/[\s,]/g, '');
  if (rest) issues.push({ code: 'BAD_SVG', path, message: `transform "${text}" is not understood` });
  for (const [, op, args] of text.matchAll(re)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    const rad = (/** @type {number} */ deg) => (deg * Math.PI) / 180;
    /** @type {Affine} */
    let t;
    if (op === 'matrix') t = /** @type {Affine} */ (a);
    else if (op === 'translate') t = [1, 0, 0, 1, a[0], a[1] ?? 0];
    else if (op === 'scale') t = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
    else if (op === 'skewX') t = [1, 0, Math.tan(rad(a[0])), 1, 0, 0];
    else if (op === 'skewY') t = [1, Math.tan(rad(a[0])), 0, 1, 0, 0];
    else {
      const [c, s] = [Math.cos(rad(a[0])), Math.sin(rad(a[0]))];
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
      t = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
    }
    m = compose(t, m); // the transform list applies right to left
  }
  return m;
}

const CURVE_STEPS = 16;

/**
 * Path data as polylines, one per subpath of two or more points, curves and
 * arcs flattened.
 * @param {string} d @param {string} path @param {Issue[]} issues
 * @returns {[number, number][][]}
 */
export function pathPolylines(d, path, issues) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  /** @type {[number, number][][]} */
  const out = [];
  /** @type {[number, number][]} */
  let cur = [];
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let cmd = '';
  /** @type {number[] | null} the last control point, for S and T */
  let ctrl = null;
  let i = 0;
  const take = (/** @type {number} */ k) => {
    const v = tokens.slice(i, i + k).map(Number);
    if (v.length < k || v.some((n) => !Number.isFinite(n))) throw new Error('short');
    i += k;
    return v;
  };
  const end = () => { if (cur.length > 1) out.push(cur); cur = []; };
  const to = (/** @type {number} */ nx, /** @type {number} */ ny) => {
    if (!cur.length) cur.push([x, y]);
    cur.push([nx, ny]);
    [x, y] = [nx, ny];
  };
  /** @param {(t: number) => number[]} f */
  const curve = (f) => { for (let k = 1; k <= CURVE_STEPS; k++) { const [px, py] = f(k / CURVE_STEPS); to(px, py); } };
  const reflect = () => (ctrl ? [2 * x - ctrl[0], 2 * y - ctrl[1]] : [x, y]);
  try {
    while (i < tokens.length) {
      if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
      else if (!cmd) throw new Error('number before a command');
      const C = cmd.toUpperCase();
      const [ox, oy] = cmd === C ? [0, 0] : [x, y];
      const pt = (/** @type {number[]} */ v, /** @type {number} */ k) => [ox + v[k], oy + v[k + 1]];
      let next = null;
      if (C === 'M') {
        end();
        [x, y] = pt(take(2), 0);
        [sx, sy] = [x, y];
        cmd = cmd === 'M' ? 'L' : 'l'; // further pairs are line-tos
      } else if (C === 'L') to(...(/** @type {[number, number]} */ (pt(take(2), 0))));
      else if (C === 'H') to(ox + take(1)[0], y);
      else if (C === 'V') to(x, oy + take(1)[0]);
      else if (C === 'Z') {
        if (cur.length) to(sx, sy);
        end();
      } else if (C === 'C' || C === 'S') {
        const v = take(C === 'C' ? 6 : 4);
        const [x0, y0] = [x, y];
        const c1 = C === 'C' ? pt(v, 0) : reflect();
        const c2 = pt(v, v.length - 4);
        const e = pt(v, v.length - 2);
        curve((t) => {
          const u = 1 - t;
          const [a, b, c, dd] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
          return [a * x0 + b * c1[0] + c * c2[0] + dd * e[0], a * y0 + b * c1[1] + c * c2[1] + dd * e[1]];
        });
        next = c2;
      } else if (C === 'Q' || C === 'T') {
        const v = take(C === 'Q' ? 4 : 2);
        const [x0, y0] = [x, y];
        const c = C === 'Q' ? pt(v, 0) : reflect();
        const e = pt(v, v.length - 2);
        curve((t) => {
          const u = 1 - t;
          return [u * u * x0 + 2 * u * t * c[0] + t * t * e[0], u * u * y0 + 2 * u * t * c[1] + t * t * e[1]];
        });
        next = c;
      } else if (C === 'A') {
        const [rx, ry, rot, large, sweep, ex, ey] = take(7);
        for (const [px, py] of arcPoints(x, y, rx, ry, rot, large, sweep, ox + ex, oy + ey)) to(px, py);
      }
      ctrl = next;
    }
  } catch {
    issues.push({ code: 'BAD_SVG', path, message: `path data "${d.slice(0, 60)}${d.length > 60 ? '…' : ''}" is malformed near token ${i + 1}` });
    return [];
  }
  end();
  return out;
}

/** Points along an elliptical arc (SVG implementation notes, F.6.5). @param {number[]} a x1 y1 rx ry rotation large sweep x2 y2 */
function arcPoints(...a) {
  const [x1, y1, rx0, ry0, rotDeg, large, sweep, x2, y2] = a;
  if (rx0 === 0 || ry0 === 0) return [[x2, y2]];
  const phi = (rotDeg * Math.PI) / 180;
  const [c, s] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = c * dx + s * dy;
  const yp = -s * dx + c * dy;
  let [rx, ry] = [Math.abs(rx0), Math.abs(ry0)];
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) [rx, ry] = [rx * Math.sqrt(lam), ry * Math.sqrt(lam)];
  const num2 = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (k * rx * yp) / ry;
  const cyp = (-k * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2;
  const cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (/** @type {number} */ ux, /** @type {number} */ uy, /** @type {number} */ vx, /** @type {number} */ vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  return Array.from({ length: CURVE_STEPS }, (_, j) => {
    const t = t1 + (dt * (j + 1)) / CURVE_STEPS;
    return [cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c];
  });
}

/** @param {unknown} value @param {string} path @param {Issue[]} issues */
function readSvg(value, path, issues) {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ code: 'INVALID_FIELD', path, message: 'must be an SVG document, or path data such as "M 10 10 C 20 0 30 20 40 10"' });
    return null;
  }
  const text = value.trim();
  if (!text.startsWith('<')) return pathPolylines(text, path, issues).map((pl) => pl.map(([x, y]) => ({ x, y })));
  /** @type {RawPoint[][]} */
  const strokes = [];
  /** @type {Affine[]} */
  const stack = [IDENTITY];
  const attr = (/** @type {string} */ tag, /** @type {string} */ name) => {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`));
    return m ? (m[2] ?? m[3]) : null;
  };
  for (const [tag, close, name] of text.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*>/g)) {
    if (close) { if (stack.length > 1) stack.pop(); continue; }
    const t = attr(tag, 'transform');
    const m = t ? compose(parseTransform(t, path, issues), stack[stack.length - 1]) : stack[stack.length - 1];
    const apply = (/** @type {[number, number][]} */ pl) => pl.map(([x, y]) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }));
    const n = (/** @type {string} */ k) => Number(attr(tag, k) ?? 0);
    if (name === 'path') strokes.push(...pathPolylines(attr(tag, 'd') ?? '', path, issues).map(apply));
    else if (name === 'polyline' || name === 'polygon') {
      const v = (attr(tag, 'points') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      /** @type {[number, number][]} */
      const pl = [];
      for (let k = 0; k + 1 < v.length; k += 2) pl.push([v[k], v[k + 1]]);
      if (name === 'polygon' && pl.length) pl.push(pl[0]);
      strokes.push(apply(pl));
    } else if (name === 'line') strokes.push(apply([[n('x1'), n('y1')], [n('x2'), n('y2')]]));
    if (!tag.endsWith('/>')) stack.push(m);
  }
  if (!strokes.length) issues.push({ code: 'BAD_SVG', path, message: 'has no path, polyline, polygon or line elements' });
  return strokes;
}
