// The Hershey + EKG tag design (R's hershey_ekg.R): the name in Hershey
// Simplex Script single-stroke letters, with an idealised EKG heartbeat trace
// running into the bottom line (through the connecting tail of a lowercase
// "a") and out of the top line. Strokes are smoothed (wavelet shrinkage),
// given a pen-like varying width, and merged into one filled outline.

import { bounds, bufferZero, mapRings, union } from './geometry.js';
import { ribbon } from './helix.js';
import { GLYPHS, SCRIPT_CHARS } from './hershey-data.js';
import { innerBoxDims } from './layout.js';
import { toLower } from './names.js';
import { cumsum, rsum, seqBy, seqLength } from './rmath.js';

/**
 * @typedef {{ x: number[], y: number[] }} Stroke
 * @typedef {typeof import('./request.js').DEFAULT_HERSHEY_EKG} HersheyEkg
 * @typedef {import('./geometry.js').Polygon} Polygon
 */

/** Characters the bundled Hershey Script font has no glyph for. @param {string} text */
export function unsupportedHersheyChars(text) {
  return [...new Set([...text])].filter((c) => !Object.hasOwn(SCRIPT_CHARS, /** @type {number} */ (c.codePointAt(0))));
}

/**
 * hershey_strokes: the pen-down strokes of a string, in Hershey units (y up),
 * glyphs placed one width apart from x = 0; strokes that end where a later
 * one starts are joined, as R chains the segments it reads back.
 * @param {string} text
 * @returns {Stroke[]}
 */
export function hersheyStrokes(text) {
  /** @type {number[][][]} */
  const raw = [];
  let pen = 0;
  for (const c of text) {
    const glyph = GLYPHS[SCRIPT_CHARS[/** @type {number} */ (c.codePointAt(0))]];
    const left = glyph.charCodeAt(0) - 82;
    const right = glyph.charCodeAt(1) - 82;
    let cur = null;
    for (let k = 2; k < glyph.length; k += 2) {
      if (glyph[k] === ' ' && glyph[k + 1] === 'R') {
        cur = null;
        continue;
      }
      const p = [pen + glyph.charCodeAt(k) - 82 - left, -(glyph.charCodeAt(k + 1) - 82)];
      if (!cur) raw.push((cur = []));
      cur.push(p);
    }
    pen += right - left;
  }
  const same = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a[0] === b[0] && a[1] === b[1];
  // R draws each vector as its own segment, so a lone point draws nothing
  const segs = raw.filter((s) => s.length > 1);
  /** @type {number[][][]} */
  const strokes = [];
  let cur = segs[0];
  for (const s of segs.slice(1)) {
    if (same(cur[cur.length - 1], s[0])) cur = [...cur, ...s.slice(1)];
    else {
      strokes.push(cur);
      cur = s;
    }
  }
  strokes.push(cur);
  // join strokes whose end meets a later stroke's start
  let i = 0;
  while (i < strokes.length - 1) {
    const end = strokes[i][strokes[i].length - 1];
    const j = strokes.findIndex((s, k) => k > i && same(end, s[0]));
    if (j >= 0) {
      strokes[i] = [...strokes[i], ...strokes[j].slice(1)];
      strokes.splice(j, 1);
    } else i++;
  }
  return strokes.map((s) => ({ x: s.map((p) => p[0]), y: s.map((p) => p[1]) }));
}

/** approx(x, y, v, ties = "ordered") for increasing x. @param {number[]} x @param {number[]} y @param {number} v */
function approx1(x, y, v) {
  let i = 0;
  let j = x.length - 1;
  if (v < x[i] || v > x[j]) return NaN;
  while (i < j - 1) {
    const ij = Math.floor((i + j) / 2);
    if (v < x[ij]) j = ij;
    else i = ij;
  }
  if (v === x[j]) return y[j];
  if (v === x[i]) return y[i];
  return y[i] + (y[j] - y[i]) * ((v - x[i]) / (x[j] - x[i]));
}

/** resample_stroke: n points at equal arc-length steps. @param {Stroke} s @param {number} n @returns {Stroke} */
export function resampleStroke(s, n) {
  const steps = s.x.slice(1).map((x, i) => {
    const dx = x - s.x[i];
    const dy = s.y[i + 1] - s.y[i];
    return Math.sqrt(rsum([dx * dx, dy * dy]));
  });
  const cum = [0, ...cumsum(steps)];
  const at = seqLength(0, Math.max(...cum), n);
  return { x: at.map((v) => approx1(cum, s.x, v)), y: at.map((v) => approx1(cum, s.y, v)) };
}

// waveslim's "mb4" (Morris minimum-bandwidth, length 4) filters, scaled for the MODWT
const MB4_LPF = [0.4801755, 0.8372545, 0.2269312, -0.1301477];
const MB4_HPF = [-0.1301477, -0.2269312, 0.8372545, -0.4801755];
const GT = MB4_LPF.map((v) => v / Math.sqrt(2));
const HT = MB4_HPF.map((v) => v / Math.sqrt(2));

/** waveslim::modwt(x, "mb4", nLevels), periodic boundary: d1..dJ, then sJ. @param {number[]} x @param {number} nLevels */
function modwt(x, nLevels) {
  const N = x.length;
  /** @type {number[][]} */
  const levels = [];
  let v = x;
  for (let j = 1; j <= nLevels; j++) {
    const W = new Array(N);
    const V = new Array(N);
    const step = 2 ** (j - 1);
    for (let t = 0; t < N; t++) {
      let k = t;
      W[t] = HT[0] * v[k];
      V[t] = GT[0] * v[k];
      for (let n = 1; n < 4; n++) {
        k -= step;
        if (k < 0) k += N;
        W[t] += HT[n] * v[k];
        V[t] += GT[n] * v[k];
      }
    }
    levels.push(W);
    v = V;
  }
  levels.push(v);
  return levels;
}

/** waveslim::imodwt for modwt()'s output. @param {number[][]} levels */
function imodwt(levels) {
  const J = levels.length - 1;
  let X = levels[J];
  const N = X.length;
  for (let j = J; j >= 1; j--) {
    const W = levels[j - 1];
    const out = new Array(N);
    const step = 2 ** (j - 1);
    for (let t = 0; t < N; t++) {
      let k = t;
      out[t] = (HT[0] * W[k]) + (GT[0] * X[k]);
      for (let n = 1; n < 4; n++) {
        k += step;
        if (k >= N) k -= N;
        out[t] += (HT[n] * W[k]) + (GT[n] * X[k]);
      }
    }
    X = out;
  }
  return X;
}

/**
 * wavelet_smooth: soft-threshold the MODWT coefficients at the level that
 * keeps `varThresh` of their energy, and invert.
 * @param {number[]} d @param {number} varThresh
 */
export function waveletSmooth(d, varThresh) {
  const nLevels = Math.max(1, Math.floor(Math.log2(d.length) / 2));
  const w = modwt(d, nLevels);
  const squares = w.flat().map((c) => c * c);
  const total = rsum(squares);
  const sorted = squares.slice().sort((a, b) => b - a);
  const limit = Math.max(varThresh, sorted[0] / total * 1.01);
  const k = cumsum(sorted).filter((c) => c / total <= limit).length;
  const threshold = Math.sqrt(sorted[k - 1]);
  return imodwt(w.map((level) => level.map((c) => Math.sign(c) * (Math.abs(c) - threshold) * (Math.abs(c) > threshold ? 1 : 0))));
}

/** var() of a numeric vector. @param {number[]} v */
function variance(v) {
  const m = rsum(v) / v.length;
  return rsum(v.map((x) => (x - m) * (x - m))) / (v.length - 1);
}

/**
 * smooth_stroke: jitter (to break ties), resample to n points about the
 * stroke's mean, and wavelet-smooth each coordinate, reflected to avoid edge
 * effects.
 * @param {Stroke} st @param {number} n @param {number} varThresh @param {() => number} norm
 * @returns {Stroke}
 */
export function smoothStroke(st, n, varThresh, norm) {
  const sd = Math.sqrt((variance(st.x) + variance(st.y)) / 1e9);
  const x = st.x.map((v) => v + norm() * sd);
  const y = st.y.map((v) => v + norm() * sd);
  const mx = rsum(x) / x.length;
  const my = rsum(y) / y.length;
  const r = resampleStroke({ x: x.map((v) => v - mx), y: y.map((v) => v - my) }, n);
  const sm = (/** @type {number[]} */ v) => waveletSmooth([...v, ...v.slice().reverse()], varThresh).slice(0, n);
  return { x: sm(r.x).map((v) => v + mx), y: sm(r.y).map((v) => v + my) };
}

/** Idealised EKG cycle: Gaussian P, Q, R, S and T waves (ekg_trace). @param {number} rAmp @param {number} samplingRate @returns {Stroke} */
export function ekgTrace(rAmp, samplingRate) {
  const n = Math.floor(1 * samplingRate);
  const t = seqLength(0, 1, n);
  const wave = (/** @type {number} */ center, /** @type {number} */ duration, /** @type {number} */ amplitude) => t.map((ti) => {
    const d = ti - center;
    const s = duration / 4;
    return amplitude * Math.exp(-(d * d) / (2 * (s * s)));
  });
  const pDur = 0.08;
  const qrsDur = 0.10;
  const tDur = 0.18;
  const qrsStart = 0.16;
  const tStart = qrsStart + qrsDur + 0.12;
  const waves = [wave(pDur / 2, pDur, 0.15), wave(qrsStart + qrsDur * 0.15, qrsDur / 3, -0.1), wave(qrsStart + qrsDur * 0.4, qrsDur / 2.5, rAmp),
    wave(qrsStart + qrsDur * 0.7, qrsDur / 3, -0.25), wave(tStart + tDur / 2, tDur, 0.3)];
  return { x: seqLength(0, 1, n), y: t.map((_, i) => waves[0][i] + waves[1][i] + waves[2][i] + waves[3][i] + waves[4][i]) };
}

/** Pen-like width: heavier on downstrokes, at bends, and where the pen slows (stroke_thickness). @param {number[]} x @param {number[]} y */
function strokeThickness(x, y) {
  const [wDir, wCurv, wSpeed, tmin, tmax, eps] = [0.5, 0.3, 0.2, 0.5, 2.0, 1e-6];
  const dx = x.slice(1).map((v, i) => v - x[i]);
  const dy = y.slice(1).map((v, i) => v - y[i]);
  const len = dx.map((v, i) => Math.sqrt(v * v + dy[i] * dy[i]) + eps);
  const dir = dx.map((_, i) => Math.max(0, -dy[i] / len[i]));
  dir.push(dir[dir.length - 1]);
  const curv = [0];
  for (let i = 0; i < dx.length - 1; i++) {
    const cos = (dx[i] * dx[i + 1] + dy[i] * dy[i + 1])
      / (Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) * Math.sqrt(dx[i + 1] * dx[i + 1] + dy[i + 1] * dy[i + 1]) + eps);
    curv.push(Math.acos(Math.min(1, Math.max(-1, cos))) / Math.PI);
  }
  curv.push(0);
  const inv = len.map((l) => 1 / l);
  const top = Math.max(...inv);
  const speed = inv.map((v) => v / top);
  speed.push(speed[speed.length - 1]);
  return dir.map((d, i) => tmin + (tmax - tmin) * ((wDir * d + wCurv * curv[i] + wSpeed * speed[i]) / (wDir + wCurv + wSpeed)));
}

/** First column of blending_simplex_path(2, n, shape = 1, pow_ends): the weight that tapers a stroke's start. @param {number} n @param {number} powEnds */
function taperWeights(n, powEnds) {
  const a = 10;
  const t = seqLength(0, 1, n);
  const breaks = [0, 0.5, 1];
  const sig = (/** @type {number} */ v) => 1 / (1 + Math.exp(-v));
  const pow = (/** @type {number} */ b, /** @type {number} */ e) => (e === 2 ? b * b : b ** e);
  return t.map((ti) => {
    const e = pow(Math.abs(ti * 2 - 1), powEnds) * Math.max(0, powEnds - 1) + 1;
    const w = [0, 1].map((i) => pow(sig(a * (ti - breaks[i])) - sig(a * (ti - breaks[i + 1])), e));
    return w[0] / (w[0] + w[1]);
  });
}

/** smooth_exp: exponentially weighted moving average of a stroke's points. @param {Stroke} d @param {number} [rate] @returns {Stroke} */
function smoothExp(d, rate = 0.5) {
  const n = d.x.length;
  const buffer = Math.ceil(10 / rate);
  const scale = 1 / rate; // R's dexp(x, rate) is exp(-x / scale) / scale
  const half = Array.from({ length: buffer + 1 }, (_, k) => Math.exp(-k / scale) / scale);
  const w0 = [...half.slice(1).reverse(), ...half];
  const sw = rsum(w0);
  const w = w0.map((v) => v / sw);
  const pad = (/** @type {number[]} */ v) => [...new Array(buffer).fill(v[0]), ...v, ...new Array(buffer).fill(v[n - 1])];
  const px = pad(d.x);
  const py = pad(d.y);
  const out = { x: new Array(n), y: new Array(n) };
  for (let i = 0; i < n; i++) {
    out.x[i] = rsum(w.map((wk, k) => px[i + k] * wk));
    out.y[i] = rsum(w.map((wk, k) => py[i + k] * wk));
  }
  return out;
}

/**
 * strokes_to_outline: each stroke's variable-width outline (buffer(0) of its
 * ribbon), all merged.
 * @param {Stroke[]} strokes @param {number} baseLwd @param {HersheyEkg} p
 * @returns {Polygon[]}
 */
function strokesToOutline(strokes, baseLwd, p) {
  const pieces = strokes.flatMap((s) => {
    const c = smoothExp(resampleStroke(s, s.x.length));
    const n = c.x.length;
    const head = taperWeights(Math.floor(n / 2), p.tail_pow).map((v) => 1 - v);
    const tail = taperWeights(Math.ceil(n / 2), p.tail_pow);
    const tails = [...head, ...tail].map((v) => v * (1 - p.tail_prop_floor) + p.tail_prop_floor);
    const thick = strokeThickness(c.x, c.y);
    const lwd = thick.map((t, i) => baseLwd * (p.lwd_pow === 2 ? t * t : t ** p.lwd_pow) * tails[i]);
    return bufferZero(ribbon(c.x, c.y, lwd, 1));
  });
  return union(pieces.flat(), 'nonzero');
}

/** @param {Stroke[]} strokes */
const concat = (strokes) => ({ x: strokes.flatMap((s) => s.x), y: strokes.flatMap((s) => s.y) });
const span = (/** @type {number[]} */ v) => Math.max(...v) - Math.min(...v);
/** A concatenated stroke list split back by the strokes' lengths. @param {Stroke} all @param {number[]} lengths */
const splitBack = (all, lengths) => {
  let k = 0;
  return lengths.map((len) => {
    const s = { x: all.x.slice(k, k + len), y: all.y.slice(k, k + len) };
    k += len;
    return s;
  });
};

/**
 * hershey_ekg_bottom: the EKG, then the tail of a lowercase "a", then the word.
 * @param {string} word @param {Stroke} ekg @param {HersheyEkg} p @param {() => number} norm
 */
function bottomStrokes(word, ekg, p, norm) {
  const strokes = hersheyStrokes(`a ${word}`).map((s) => smoothStroke(s, p.stroke_points, p.smoothing_var_thresh, norm));
  const nameVec = strokes.slice(1);
  let cat = concat(nameVec);
  const scale = span(ekg.y) / span(cat.y) / 1.5;
  cat = { x: cat.x.map((v) => v * scale), y: cat.y.map((v) => v * scale) };
  const a = { x: strokes[0].x.map((v) => v * scale), y: strokes[0].y.map((v) => v * scale) };
  const na = a.x.length;
  const tailRows = seqBy(0.75 * na, na, 1).map(Math.floor); // 1-based rows
  const minY = Math.min(...a.y);
  let best = 0;
  tailRows.forEach((row, i) => {
    if (a.y[row - 1] - minY < a.y[tailRows[best] - 1] - minY) best = i;
  });
  const start = tailRows[best] - 1;
  const tail = { x: a.x.slice(start), y: a.y.slice(start) };
  const dx = ekg.x[ekg.x.length - 1] - tail.x[0];
  const dy = ekg.y[ekg.y.length - 1] - tail.y[0];
  const trace = { x: [...ekg.x, ...tail.x.slice(1).map((v) => v + dx)], y: [...ekg.y, ...tail.y.slice(1).map((v) => v + dy)] };
  const ndx = trace.x[trace.x.length - 1] - cat.x[0];
  const ndy = trace.y[trace.y.length - 1] - cat.y[0];
  cat = { x: cat.x.map((v) => v + ndx), y: cat.y.map((v) => v + ndy) };
  return [trace, ...splitBack(cat, nameVec.map((s) => s.x.length))];
}

/**
 * hershey_ekg_top: the word with its last letter's exit tail cut, running
 * into a shortened EKG that continues straight on.
 * @param {string} word @param {Stroke} ekg @param {HersheyEkg} p @param {() => number} norm
 */
function topStrokes(word, ekg, p, norm) {
  const nameVec = hersheyStrokes(word).map((s) => smoothStroke(s, p.stroke_points, p.smoothing_var_thresh, norm));
  const last = nameVec[nameVec.length - 1];
  const minY = Math.min(...last.y);
  const lowest = last.y.map((v, i) => [Math.abs(v - minY), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 5).map((e) => e[1]);
  const cut = Math.max(...lowest) + 1;
  nameVec[nameVec.length - 1] = { x: last.x.slice(0, cut), y: last.y.slice(0, cut) };
  let cat = concat(nameVec);
  const scale = span(ekg.y) / span(cat.y) / 1.5;
  cat = { x: cat.x.map((v) => v * scale), y: cat.y.map((v) => v * scale) };
  const step = ekg.x[ekg.x.length - 1] - ekg.x[ekg.x.length - 2];
  const lead = seqBy(-0.5, 0, step);
  const headN = Math.trunc(ekg.x.length * 0.9);
  const ext = { x: [...lead, ...ekg.x.slice(0, headN)], y: [...lead.map(() => ekg.y[0]), ...ekg.y.slice(0, headN)] };
  const sx = ext.x[ext.x.length - 1] - ext.x[ext.x.length - 2];
  const sy = ext.y[ext.y.length - 1] - ext.y[ext.y.length - 2];
  const lx = ext.x[ext.x.length - 1];
  const ly = ext.y[ext.y.length - 1];
  const fx = [...ext.x, ...cumsum(new Array(200).fill(sx)).map((v) => lx + v)].map((v) => v * 0.8);
  const fy = [...ext.y, ...cumsum(new Array(200).fill(sy)).map((v) => ly + v)].map((v) => v * 0.8);
  const ndx = fx[0] - cat.x[cat.x.length - 1];
  const ndy = fy[0] - cat.y[cat.y.length - 1];
  cat = { x: cat.x.map((v) => v + ndx), y: cat.y.map((v) => v + ndy) };
  const split = splitBack(cat, nameVec.map((s) => s.x.length));
  const end = split[split.length - 1];
  return [...split.slice(0, -1), { x: [...end.x, ...fx], y: [...end.y, ...fy] }];
}

/**
 * layout_hershey_ekg_tag: the whole design for one tag, scaled to fit the
 * inner box and centred in the cell, as polygons in cell-local inches.
 * @param {string[]} lines @param {number[]} cell @param {import('./request.js').Style} style @param {HersheyEkg} p @param {() => number} norm
 */
export function tagHersheyEkg(lines, cell, style, p, norm) {
  const ekg = ekgTrace(p.r_amp, p.sampling_rate);
  const bottomWord = p.lowercase_bottom_line ? toLower(lines[lines.length - 1]) : lines[lines.length - 1];
  let geom = strokesToOutline(bottomStrokes(bottomWord, ekg, p, norm), p.bottom_line_lwd, p);
  if (lines.length === 2) {
    let top = strokesToOutline(topStrokes(lines[0], ekg, p, norm), p.top_line_lwd, p)
      .map((poly) => mapRings(poly, (x, y) => [x * p.top_scale, y * p.top_scale]));
    const shift = bounds(geom.flat())[2] - bounds(top.flat())[2];
    top = top.map((poly) => mapRings(poly, (x, y) => [x + shift, y + p.top_raise]));
    geom = union([...geom, ...top].flat(), 'nonzero');
  }
  const dim = innerBoxDims(style, cell);
  const [x0, y0, x1, y1] = bounds(geom.flat());
  const s = Math.min(dim[0] / (x1 - x0), dim[1] / (y1 - y0));
  const ox = (cell[0] - (x1 - x0) * s) / 2;
  const oy = (cell[1] - (y1 - y0) * s) / 2;
  return { polygons: geom.map((poly) => mapRings(poly, (x, y) => [(x - x0) * s + ox, (y - y0) * s + oy])) };
}
