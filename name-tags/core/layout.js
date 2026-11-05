// Tag layout (R's layout.R): measure each name's lines, place their glyph
// outlines, then fit the top line (b1), the helix (b2) and the bottom line
// (b3) inside the tag's inner box. Everything here is in inches in a
// cell-local frame ([0, cell w] x [0, cell h], y up); rendering adds the
// cell's offset on the sheet.
//
// Two artefacts of the R version's graphics devices are kept so fits match
// it: line sizes come from the PDF device's fallback metrics for a font it
// does not know (every character half an em wide, so sizes depend only on
// character counts), and glyphs are placed in the user units of a page-sized
// SVG device with R's default 4% axis padding, whose width is truncated to
// whole points (so 1 inch is about 1.08 units, slightly more across than up).

import { placeRectangles, rectInfo } from './boxes.js';
import { advance, capAscent, lineOutlines } from './font.js';
import { boundaryLength, bounds, erode, mapRings, polygonArea, polygonDistance } from './geometry.js';
import { dnaShape } from './helix.js';
import { hasDescender, toUpper } from './names.js';
import { brentMin } from './optim.js';
import { NameTagsError } from './request.js';
import { mean, median, roundHalfEven, rsum } from './rmath.js';

/**
 * @typedef {import('./geometry.js').Ring} Ring
 * @typedef {import('./geometry.js').Polygon} Polygon
 * @typedef {typeof import('./request.js').DEFAULT_STYLE} Style
 * @typedef {{ text: string, dx: number, dy: number, cex: number, w: number, lb: number, rb: number, h: number, vws: number, hws: number }} LineMetric
 * @typedef {{ chars: string[], glyphs: Polygon[] }} LineGlyphs  glyph outlines in device user units, one per inked character
 * @typedef {{ metrics: LineMetric[], glyphs: LineGlyphs[] }} Measured
 * @typedef {{ text: string, glyphs: Polygon[], lowerQ: number }} PlacedLine  glyphs in cell-local inches
 * @typedef {{ type: 'dna', dh_bounds: number[], ntwists: number, extend_straight: 1 | 2, extend_straight_by: number,
 *   topleft: number[], box_dim: number[], bbox: number[], prop_dist: number }} DnaDecoration
 * @typedef {{ objective: number, w1: number, w2: number, h2: number, ar1: number, ar3: number, ntwists: number, restarts: number }} Fit
 * @typedef {{ text: string[], lines: PlacedLine[], inner_box: number[], decoration: DnaDecoration | null, fit: Fit | null }} Tag
 */

/** @param {Style} style @param {number[]} cell */
export const innerBoxDims = (style, cell) => [cell[0] - cell[0] / style.inner_margin_div, cell[1] - cell[0] / style.inner_margin_div];

/** [xmin, ymin, xmax, ymax] of a box of size dims centred in the cell. @param {number[]} cell @param {number[]} dims */
export const centeredBox = (cell, dims) => [cell[0] / 2 - dims[0] / 2, cell[1] / 2 - dims[1] / 2, cell[0] / 2 + dims[0] / 2, cell[1] / 2 + dims[1] / 2];

// ---------- the R devices ----------

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]/u;
/** Terminal columns of a string (combining marks 0, wide East Asian 2), as the PDF device's fallback counts them. @param {string} s */
const columns = (s) => [...s].reduce((n, c) => n + (/\p{M}/u.test(c) ? 0 : WIDE.test(c) ? 2 : 1), 0);
/** Device points to inches on R's 7-inch null PDF device. @param {number} pts */
const pdfInches = (pts) => (pts / 504) / (1 / 7);
const strwidthIn = (/** @type {string} */ s) => pdfInches(6 * columns(s));
const LINE_HEIGHT_IN = pdfInches(10.56);
/** strheight of an n-line string in the default font (Helvetica: 14.4 pt per line, 8.616 pt "M" ascent). @param {number} n */
const blockHeightIn = (n) => pdfInches((n - 1) * 14.4 + 8.616);

/**
 * User units per inch, and the x/y aspect correction (R's xyrat()), on the
 * page-sized SVG device the R version measures glyphs on.
 * @param {number[]} page
 */
export function measureDevice(page) {
  const axis = (/** @type {number} */ len) => {
    const pin = Math.trunc(72 * len) / 72; // svg() sizes the device in whole points
    const t = 0.04 * (len - 0);
    return ((len + t) - (0 - t)) / pin;
  };
  const upiX = axis(page[0]);
  const upiY = axis(page[1]);
  return { upiX, upiY, xyr: upiX / upiY };
}

// ---------- measuring ----------

/**
 * line_metrics: the size and offset of each line before any fitting (also
 * the final arrangement when there is no decoration).
 * @param {string[]} lines @param {number[]} dimName @param {Style} style
 * @returns {LineMetric[]}
 */
export function lineMetrics(lines, dimName, style) {
  const nn = lines.length;
  const nw = lines.map(strwidthIn);
  const nhs = lines.map(() => LINE_HEIGHT_IN);
  const nh = blockHeightIn(nn);
  const vws = (nh - rsum(nhs)) * style.vws_scale * (hasDescender(lines[0]) ? style.vws_adj_yqpgj : 1);
  const hws = strwidthIn(' ');
  let ratio = style.name_cex_ratio_base;
  if (nn === 2 && [...lines[1]].length > 8) ratio = style.name_cex_ratio_base * style.name_cex_ratio_factor / ([...lines[1]].length / 8);

  const base = Math.min(dimName[0] / Math.max(...nw), dimName[1] / nh);
  let cex = lines.map((_, i) => base * (i === 0 ? 2 / (ratio + 1) : 2 * ratio / (ratio + 1)));
  const rescale = Math.min(dimName[0] / Math.max(...nw.map((w, i) => w * cex[i])),
    dimName[1] / rsum(nhs.map((h, i) => (h + vws * (nn - 1)) * cex[i])));
  cex = cex.map((c) => rescale * c * style.cex_scale);

  const newNw = cex.map((c, i) => c * nw[i]);
  const newNhs = cex.map((c, i) => c * nhs[i]);
  const newVws = mean(cex.map((c) => c * vws));
  const newHws = mean(cex.map((c) => c * hws));
  const newNh = rsum(newNhs) + newVws * (nn - 1);
  const dx = lines.map(() => 0);
  const dy = lines.map(() => 0);
  if (nn === 2) {
    // top line flush left at the top, bottom line flush right at the bottom
    dx[0] = newNw[0] / 2 - dimName[0] / 2;
    dy[0] = newNh / 2 - newNhs[0] / 2;
    dx[1] = dimName[0] / 2 - newNw[1] / 2;
    dy[1] = newNhs[1] / 2 - newNh / 2;
    // scooch the lines in if there is room
    const lb = dx.map((d, i) => d - newNw[i] / 2);
    const rb = dx.map((d, i) => d + newNw[i] / 2);
    const overlap = rb[0] - lb[1];
    const prop = newNw.map((w) => overlap / w);
    if (Math.max(...prop) < style.degree_name_overlap) {
      const which = Math.abs(prop[1]) > Math.abs(prop[0]) ? 1 : 0;
      const shiftIn = newNw[which] * style.degree_name_overlap - overlap;
      const room = [dimName[0] / 2 - rb[0], dimName[0] / 2 - -lb[1]];
      const each = room.map((r) => (r < shiftIn / 2 ? r : shiftIn / 2));
      dx[0] += each[0];
      dx[1] += -each[1];
    }
  }
  return lines.map((text, i) => ({
    text, dx: dx[i], dy: dy[i], cex: cex[i], w: newNw[i], lb: dx[i] - newNw[i] / 2, rb: dx[i] + newNw[i] / 2,
    h: newNhs[i], vws: newVws, hws: newHws,
  }));
}

/**
 * true_text_params: the glyph outlines of `text` at size `cex`, their ink
 * box centred on `center`, in device user units.
 * @param {string} text @param {number[]} center @param {number} cex @param {string} family @param {1 | 2} face
 * @param {{ upiX: number, upiY: number }} device
 * @returns {LineGlyphs}
 */
export function placeText(text, center, cex, family, face, device) {
  const { glyphs, unitsPerEm } = lineOutlines(text, family, face);
  const [x0, y0, x1, y1] = bounds(glyphs.flatMap((g) => g.rings));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const pts = 12 * cex / unitsPerEm / 72;
  // R's text_distortion measures the string's advance and "M" height in the
  // plain face whatever face it draws, so another face comes out stretched by
  // the ratio of those measures (this only reaches the small-caps scale).
  const sx = face === 1 ? 1 : advance(text, family, face) / advance(text, family, 1);
  const sy = face === 1 ? 1 : capAscent(family, face) / capAscent(family, 1);
  const kx = pts * device.upiX * sx;
  const ky = pts * device.upiY * sy;
  return {
    chars: glyphs.map((g) => g.char),
    glyphs: glyphs.map((g) => mapRings(g.rings, (x, y) => [(x - cx) * kx + center[0], (y - cy) * ky + center[1]])),
  };
}

/** All points' bounds of a list of glyphs. @param {Polygon[]} glyphs */
const glyphsBounds = (glyphs) => bounds(glyphs.flat());

/**
 * smallcaps_scale: the median ratio of each capital's ink area in the plain
 * face to its area in the reference face, so shrunken capitals keep about the
 * plain face's stroke weight. Areas are of each glyph's points taken as a
 * single ring, as in the R version.
 * @param {string[]} allLines @param {string} family @param {1 | 2} referenceFace
 */
export function smallcapsScale(allLines, family, referenceFace) {
  const chars = [...new Set([...toUpper(allLines.join(''))])].filter((c) => c !== ' ');
  const device = { upiX: 1, upiY: 1 };
  const areas = (/** @type {1 | 2} */ face) => placeText(chars.join(''), [0, 0], 1, family, face, device).glyphs.map((g) => Math.abs(ringAreaOf(singleRing(g))));
  const reg = areas(1);
  const ref = areas(referenceFace);
  return median(reg.map((a, i) => a / ref[i]));
}

/** A glyph's rings joined into one ring, as R's fix_polys does when given a single subpath id. @param {Polygon} glyph */
function singleRing(glyph) {
  const r = glyph.flat();
  if (r[0] !== r[r.length - 2] || r[1] !== r[r.length - 1]) r.push(r[0], r[1]);
  return r;
}

/** @param {Ring} r */
function ringAreaOf(r) {
  let a = 0;
  for (let k = 0; k + 3 < r.length; k += 2) a += r[k] * r[k + 3] - r[k + 2] * r[k + 1];
  return a / 2;
}

/**
 * The thickness of a glyph's strokes, taking it as a long thin rectangle of
 * the same area and perimeter (estimate_stroke_width).
 * @param {Polygon} glyph
 */
function strokeWidth(glyph) {
  const A = polygonArea(glyph);
  const P = boundaryLength(glyph);
  const b = -(P / 2);
  const disc = b * b - 4 * A;
  return Math.min((-b - Math.sqrt(disc)) / 2, (-b + Math.sqrt(disc)) / 2);
}

/**
 * apply_smallcaps: keep the first capital, shrink the rest by `scaleBy` as a
 * block, optionally thin the first capital's strokes to match, and set the
 * gap after it to the mean gap between the shrunken capitals.
 * @param {LineGlyphs} line @param {Style} style @param {number} scaleBy
 * @returns {LineGlyphs}
 */
function applySmallcaps(line, style, scaleBy) {
  let glyphs = line.glyphs.slice();
  if (style.thin_smallcaps_first_letter) {
    const first = glyphs[0];
    const [fx0, fy0, fx1, fy1] = glyphsBounds([first]);
    const remove = 1 - (1 * 0.5 + scaleBy * 0.5);
    const thinned = erode(first, remove * strokeWidth(first)).flat();
    if (!thinned.length) throw new Error('thinning the first small capital removed it entirely'); // cannot happen: at most half the stroke goes
    // back onto the original glyph's box
    const [tx0, ty0, tx1, ty1] = bounds(thinned);
    glyphs[0] = mapRings(thinned, (x, y) => [(x - tx0) / (tx1 - tx0) * (fx1 - fx0) + fx0, (y - ty0) / (ty1 - ty0) * (fy1 - fy0) + fy0]);
  }
  const lefts = glyphs.map((g) => glyphsBounds([g])[0]);
  const rights = glyphs.map((g) => glyphsBounds([g])[2]);
  const bottoms = glyphs.map((g) => glyphsBounds([g])[1]);
  // glyphs 2..n scaled and moved as one block
  const [rx0, ry0] = glyphsBounds(glyphs.slice(1));
  glyphs = [glyphs[0], ...glyphs.slice(1).map((g) => mapRings(g, (x, y) => [
    (x - rx0) * scaleBy + rights[0] + (lefts[1] - rights[0]) * scaleBy,
    (y - ry0) * scaleBy + bottoms[0] + (bottoms[1] - bottoms[0]) * scaleBy,
  ]))];

  // kern the first gap like the mean gap between the shrunken capitals
  const rest = glyphs.slice(1).map((g) => [singleRing(g)]);
  const first = glyphs[0];
  const dists = rest.length > 1
    ? rest.slice(1).map((g, i) => polygonDistance(rest[i], g))
    : [polygonDistance(first, rest[0])];
  const target = mean(dists) * mean([1, 1 / scaleBy]);
  const err = (/** @type {number} */ shift) => {
    const d = polygonDistance(first, mapRings(rest[0], (x, y) => [x + shift, y]));
    if (d <= 1e-5) return 1e6; // overlapping
    return (d - target) * (d - target);
  };
  const maxLeft = glyphsBounds([first])[0] - glyphsBounds([glyphs[1]])[0];
  const shift = brentMin(err, maxLeft, 10);
  return { chars: line.chars, glyphs: [first, ...glyphs.slice(1).map((g) => mapRings(g, (x, y) => [x + shift, y]))] };
}

/**
 * line_glyphs: a line's outlines at `center`, with capital J raised to the
 * baseline and small caps applied.
 * @param {string} text @param {number[]} center @param {number} cex @param {string} family @param {Style} style
 * @param {boolean} smallcapsOn @param {number} scaleBy @param {{ upiX: number, upiY: number }} device
 */
function lineGlyphs(text, center, cex, family, style, smallcapsOn, scaleBy, device) {
  let line = placeText(text, center, cex, family, 1, device);
  const visible = [...text.replaceAll(' ', '')];
  if (visible.length !== line.glyphs.length) {
    const message = `"${text}" has characters with no outline other than spaces; remove them`;
    throw new NameTagsError('unsupported_character', message, [{ code: 'unsupported_character', path: 'names', message }]);
  }
  if (style.raise_J && visible.includes('J') && visible.some((c) => c !== 'J')) {
    const baseline = median(line.glyphs.flatMap((g, i) => (visible[i] === 'J' ? [] : [glyphsBounds([g])[1]])));
    line = {
      chars: line.chars,
      glyphs: line.glyphs.map((g, i) => {
        if (visible[i] !== 'J') return g;
        const low = glyphsBounds([g])[1];
        return mapRings(g, (x, y) => [x, y - low + baseline]);
      }),
    };
  }
  if (smallcapsOn && visible.length > 1) line = applySmallcaps(line, style, scaleBy);
  return line;
}

/**
 * measure_tags: every tag's line metrics and glyph outlines, placed at its
 * cell, plus the small-caps scale and one helix twist's aspect ratio.
 * @param {string[][]} linesList @param {number[][]} centers @param {string} family @param {number[]} cell @param {number[]} page @param {Style} style
 */
export function measureTags(linesList, centers, family, cell, page, style) {
  const dimName = innerBoxDims(style, cell);
  const device = measureDevice(page);
  const scaleBy = style.smallcaps ? smallcapsScale(linesList.flat(), family, style.smallcaps_reference_face) : 1;
  /** @type {Measured[]} */
  const measured = linesList.map((lines, i) => {
    const metrics = lineMetrics(lines, dimName, style);
    const smallcapsOn = style.smallcaps && metrics[0].text === toUpper(metrics[0].text);
    return {
      metrics,
      glyphs: metrics.map((m) => lineGlyphs(m.text, [centers[i][0] + m.dx, centers[i][1] + m.dy], m.cex, family, style, smallcapsOn, scaleBy, device)),
    };
  });
  // one helix twist's top-nucleotide box: width / height, the optimizer's unit for b2
  const shape = dnaShape({ dhBounds: [-Math.PI / 2, Math.PI / 2], strandThickness: 0.01, extendStraight: 1, extendStraightBy: 0,
    topleft: [0, 0], forcedBox: null, boxDNA: false, extensionRealUnits: false, propDist: style.prop_dist, xyr: device.xyr });
  const b2h = Math.max(...shape.bp.map((bp) => Math.max(...bp.y) - Math.min(...bp.y))) * (1 - style.prop_dist);
  const b2w = Math.max(...shape.s1[0].x) - Math.min(...shape.s1[0].x);
  return { measured, meanIar2f: b2w / b2h, scaleBy };
}

// ---------- fitting ----------

/**
 * transform_points: maps v's range onto `rel` (fractions) of `span`.
 * @param {number[]} span @param {number[]} rel @param {number[]} vRange
 */
const warp = (span, rel, vRange) => {
  const lo = span[0] + rel[0] * (span[1] - span[0]);
  const hi = span[0] + rel[1] * (span[1] - span[0]);
  return (/** @type {number} */ v) => lo + (v - vRange[0]) * ((hi - lo) / (vRange[1] - vRange[0]));
};

/**
 * line_polys: a line's glyphs in the cell-local frame, optionally warped.
 * @param {LineGlyphs} line @param {number[]} center @param {number[]} cell
 * @param {((v: number) => number) | null} [mx] @param {((v: number) => number) | null} [my]
 * @returns {Polygon[]}
 */
function cellLocal(line, center, cell, mx = null, my = null) {
  const local = line.glyphs.map((g) => mapRings(g, (x, y) => [x - center[0] + cell[0] / 2, y - center[1] + cell[1] / 2]));
  if (!mx || !my) return local;
  return local.map((g) => mapRings(g, (x, y) => [mx(x), my(y)]));
}

/** Range of x (0) or y (1) over glyphs. @param {Polygon[]} glyphs @param {0 | 1} axis */
const axisRange = (glyphs, axis) => {
  const b = glyphsBounds(glyphs);
  return [b[axis], b[axis + 2]];
};


/**
 * layout_plain_tag: the measured lines scaled as a block to fit the inner
 * box, centred in the cell.
 * @param {Measured} m @param {number[]} center @param {number[]} cell @param {Style} style
 * @returns {Tag}
 */
export function layoutPlainTag(m, center, cell, style) {
  const dimName = innerBoxDims(style, cell);
  const local = m.glyphs.map((l) => cellLocal(l, center, cell));
  const [lx, ly, hx, hy] = glyphsBounds(local.flat());
  const s = Math.min(dimName[0] / (hx - lx), dimName[1] / (hy - ly));
  const mx = (/** @type {number} */ v) => cell[0] / 2 + (v - (lx + hx) / 2) * s;
  const my = (/** @type {number} */ v) => cell[1] / 2 + (v - (ly + hy) / 2) * s;
  const placed = m.glyphs.map((l) => cellLocal(l, center, cell, mx, my));
  return finishTag(m, placed, cell, dimName, style, null, null);
}

/**
 * @param {Measured} m @param {Polygon[][]} placed @param {number[]} cell @param {number[]} dimName @param {Style} style
 * @param {DnaDecoration | null} decoration @param {Fit | null} fit
 * @returns {Tag}
 */
function finishTag(m, placed, cell, dimName, style, decoration, fit) {
  const lines = m.metrics.map(({ text }, j) => {
    const [, y0, , y1] = glyphsBounds([placed[j][0]]);
    // a leading capital Q is drawn an eighth of its height lower
    return { text, glyphs: placed[j], lowerQ: style.lower_Q && text.startsWith('Q') ? -(y1 - y0) / 8 : 0 };
  });
  return { text: m.metrics.map((x) => x.text), lines, inner_box: centeredBox(cell, dimName), decoration, fit };
}

/**
 * layout_dna_tag: fit the three boxes, warp each line into its box, and
 * derive the helix's box and straight extension.
 * @param {Measured} m @param {number[]} center @param {number[]} cell @param {Style} style @param {number} meanIar2f
 * @param {() => number} unif
 * @param {(message: string) => void} warn
 * @returns {Tag}
 */
export function layoutDnaTag(m, center, cell, style, meanIar2f, unif, warn) {
  const dimName = innerBoxDims(style, cell);
  const propDist = style.prop_dist;
  const opt = style.optimizer;
  const totalWidth = 1;
  const totalHeight = dimName[1] / dimName[0];
  const [l1x0, l1y0, l1x1, l1y1] = glyphsBounds(m.glyphs[0].glyphs);
  const ar1 = (l1y1 - l1y0) / (l1x1 - l1x0);
  const line2 = m.glyphs[1].glyphs;
  const heights = line2.map((g) => axisRange([g], 1)[1] - axisRange([g], 1)[0]);
  const tallest = heights.indexOf(Math.max(...heights));
  const [l2x0, l2y0, l2x1, l2y1] = glyphsBounds(line2);
  const ar3 = heights[tallest] / (l2x1 - l2x0);
  const b3HeightCorr = (l2y1 - l2y0) / heights[tallest]; // b3 is sized from the tallest letter

  const geometry = { propDist, totalWidth, totalHeight, ar1, ar3, meanIar2f, opt };
  // A helix needs at least one twist; a fit with fewer is a poor local
  // optimum, so search again with twice the restarts (at most twice).
  let restarts = opt.restarts;
  let rect;
  let info;
  let ntwists = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    rect = placeRectangles(geometry, restarts, unif);
    info = rectInfo(rect, propDist, meanIar2f);
    ntwists = roundHalfEven(info.ar2Factor);
    if (ntwists >= 1) break;
    const name = m.metrics.map((x) => x.text).join(' ');
    if (attempt === 3) {
      const message = `no fit with a whole helix twist for "${name}" after ${restarts} restarts; raise style.optimizer.restarts`;
      throw new NameTagsError('fit_failed', message, [{ code: 'fit_failed', path: 'style.optimizer.restarts', message }]);
    }
    restarts *= 2;
    warn(`"${name}": fit had no whole helix twist; retrying with ${restarts} restarts`);
  }
  const r = /** @type {import('./boxes.js').Rectangles} */ (rect);
  const ri = /** @type {ReturnType<typeof rectInfo>} */ (info);

  const inner = centeredBox(cell, dimName);
  const spanX = [inner[0], inner[2]];
  const spanY = [inner[1], inner[3]];
  const xBuffer = (1 - ri.totalWidth) / 2;
  const yBuffer = (totalHeight - ri.totalHeight) / 2 / totalHeight;
  const local1 = cellLocal(m.glyphs[0], center, cell);
  const local2 = cellLocal(m.glyphs[1], center, cell);

  // top line into b1
  let xr = [r.b1.x + xBuffer, r.b1.x + r.b1.width + xBuffer];
  let yr = [(r.b1.y - r.b1.height + totalHeight) / totalHeight - yBuffer, (r.b1.y + totalHeight) / totalHeight - yBuffer];
  const placed1 = local1.map((g) => mapRings(g, (x, y) => [warp(spanX, xr, axisRange(local1, 0))(x), warp(spanY, yr, axisRange(local1, 1))(y)]));
  // bottom line into b3, scaled from its tallest letter
  xr = [r.b3.x + xBuffer, r.b3.x + r.b3.width + xBuffer];
  yr = [(-r.b3.y - r.b3.height + totalHeight) / totalHeight - yBuffer, (-r.b3.y + totalHeight) / totalHeight - yBuffer];
  yr[0] = yr[1] - (yr[1] - yr[0]) * b3HeightCorr;
  const w2x = warp(spanX, xr, axisRange(local2, 0));
  const w2y = warp(spanY, yr, axisRange(local2, 1));
  const placed2 = local2.map((g) => mapRings(g, (x, y) => [w2x(x), w2y(y)]));

  // the helix fills the space left of the bottom line's first letter
  const [b2x0, , b2x1] = glyphsBounds(placed2);
  const firstLow = axisRange([placed2[0]], 1)[0];
  const tl = [glyphsBounds(placed1)[0], glyphsBounds(placed2)[3]];
  const boxH = (tl[1] - firstLow) / (1 - propDist);
  const boxW = b2x0 - tl[0] - boxH * propDist;
  return finishTag(m, [placed1, placed2], cell, dimName, style, {
    type: 'dna',
    dh_bounds: [-Math.PI / 2, -Math.PI / 2 + Math.PI * ntwists],
    ntwists,
    extend_straight: ntwists % 2 === 0 ? 2 : 1,
    extend_straight_by: b2x1 - (tl[0] + boxW),
    topleft: tl,
    box_dim: [boxW, boxH],
    bbox: [tl[0], tl[1] - boxH, tl[0] + boxW, tl[1]],
    prop_dist: propDist,
  }, { objective: r.objective, w1: r.w1, w2: r.w2, h2: r.h2, ar1, ar3, ntwists, restarts });
}
