// Reading geometry back out of a PDF, without rasterising it.
//
// Two things in tests/golden.test.mjs need the same reader, and one reader is enough
// because both producers draw the same way.
//
// A rectangle arrives as `q <colour> ... 1 0 0 1 tx ty cm ... 0 0 m 0 H l W H l W 0 l
// h f Q` from `pdf-lib` and, byte for byte the same shape, from `xdvipdfmx`; LaTeX's
// `\hrule` and tcolorbox's `borderline` arrive instead as two-point strokes, which are
// the same rectangle stated differently. Text arrives as `1 0 0 1 x y Tm <hex> Tj`
// from `pdf-lib` and `x y Td [<hex>...] TJ` from `xdvipdfmx`.
//
// Rasterising was the obvious alternative and it is measurably unusable: the *same*
// PDF rendered by poppler/splash and poppler/cairo on one machine differs in 23.1% of
// its pixels at 72dpi and 15.7% at 150dpi, where the largest bug of the class these
// tests exist for -- the dropped GPOS mark offsets -- moved 0.87%. See the header of
// tests/golden.test.mjs.

import { inflateSync } from 'node:zlib';

/** A filled rectangle in page points, y measured up from the bottom as PDF does.
 * @typedef {{x:number, y:number, w:number, h:number, fill:string}} Shape */

/** Where one text-showing operation put its glyphs, and which glyph ids they were.
 * @typedef {{x:number, y:number, glyphs:string}} Placement */

/** @typedef {{shapes:Shape[], placements:Placement[]}} Marks */

/** @typedef {[number,number,number,number,number,number]} Matrix */

const IDENTITY = /** @type {Matrix} */ ([1, 0, 0, 1, 0, 0]);

/** @param {Matrix} a @param {Matrix} b */
function mul(a, b) {
  return /** @type {Matrix} */ ([
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ]);
}

/** @param {Matrix} m @param {number} x @param {number} y @returns {[number,number]} */
function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** The last six operands, as a matrix. @param {number[]} nums */
function matrixOf(nums) {
  const n = nums.slice(-6);
  return /** @type {Matrix} */ ([n[0], n[1], n[2], n[3], n[4], n[5]]);
}

/** @param {number} r @param {number} g @param {number} b */
function hex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

/**
 * Every deflated content stream in the file, in file order.
 *
 * The page tree is not walked: for both producers the content streams come first and in
 * page order, and nothing here needs a page *number* -- the column grid and the palette
 * are properties of the whole document, and reading a row's baselines needs only that
 * the marks of one page are not pooled with another's.
 *
 * Embedded font programs inflate too, and they have to be turned away rather than
 * merely yielding nothing: a font's binary happens to contain the bytes `Tj` and `TJ`,
 * which this walker would read as text-showing operations and report as ink at an
 * arbitrary position. A content stream is ASCII by construction here -- operators,
 * numbers and hex strings -- so that is the test.
 * @param {Uint8Array} bytes
 */
export function markingStreams(bytes) {
  const raw = Buffer.from(bytes);
  /** @type {string[]} */ const out = [];
  for (const m of raw.toString('binary').matchAll(/stream\r?\n/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const end = raw.indexOf('endstream', start, 'binary');
    /** @type {string} */ let body;
    try {
      body = inflateSync(raw.subarray(start, end)).toString('binary');
    } catch {
      // Not deflated, or not a stream we can read. Both producers deflate their
      // content streams, so anything unreadable here carries nothing to compare.
      continue;
    }
    if (!/^[\t\n\r\x20-\x7e]*$/.test(body)) continue;
    out.push(body);
  }
  return out;
}

const TOKEN = /-?\d*\.\d+|-?\d+|<[0-9A-Fa-f\s]*>|\/[^\s/[\]<>()]+|\([^)]*\)|[A-Za-z*'"]+|[[\]]/g;

/**
 * The page box, in points.
 *
 * Read here rather than shelled out to `pdfinfo` because the page box is the first thing
 * the acceptance test compares and a digest that simply asserted 504x360 back at itself
 * would be worth nothing. The original writes its page dictionaries into a compressed
 * object stream, so `/MediaBox` is not in the file's plain bytes; `markingStreams`
 * inflates it along with everything else, and an object stream of PDF dictionaries is
 * ASCII, so it survives the same gate.
 * @param {Uint8Array} bytes
 * @returns {[number, number]}
 */
export function pdfPageBox(bytes) {
  const where = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/;
  for (const text of [Buffer.from(bytes).toString('binary'), ...markingStreams(bytes)]) {
    const found = where.exec(text);
    if (found) return [Number(found[1]), Number(found[2])];
  }
  throw new Error('no /MediaBox in this PDF');
}

/**
 * Walk one content stream and collect axis-aligned filled rectangles and text
 * origins, both in page coordinates.
 *
 * Only what the two tests read is tracked: the graphics state stack, the CTM, the
 * fill colour, the line width and the text matrix. Curves, clipping, patterns and
 * shading are ignored -- a path that is not an axis-aligned rectangle is dropped
 * rather than approximated, because a wrong rectangle would be worse than none.
 * @param {string} stream
 * @returns {Marks}
 */
export function readMarks(stream) {
  let ctm = IDENTITY;
  let fill = '#000000';
  // Tracked separately from the fill, because a stroked shape takes `RG` and a filled
  // one takes `rg`, and the two are not kept in step. `pdf-lib` sets only `RG` when it
  // strokes an icon outline, so reading a stroke's colour off the fill reported every
  // icon in the document as black -- which is not a colour either sheet uses.
  let stroke = '#000000';
  let lineWidth = 1;
  /** @type {[Matrix, string, string, number][]} */ const stack = [];
  /** @type {[number,number][]} */ let path = [];
  /** @type {number[]} */ const nums = [];
  /** @type {string[]} */ let hexes = [];
  let tm = IDENTITY;
  let tlm = IDENTITY;
  let leading = 0;
  /** @type {Shape[]} */ const shapes = [];
  /** @type {Placement[]} */ const placements = [];

  const emitFill = () => {
    // Two distinct x values and two distinct y values, quantised, is a rectangle
    // however many times the path repeated a corner.
    const xs = [...new Set(path.map((p) => Math.round(p[0] * 100) / 100))];
    const ys = [...new Set(path.map((p) => Math.round(p[1] * 100) / 100))];
    if (path.length >= 4 && xs.length === 2 && ys.length === 2) {
      shapes.push({
        x: Math.min(xs[0], xs[1]),
        y: Math.min(ys[0], ys[1]),
        w: Math.abs(xs[1] - xs[0]),
        h: Math.abs(ys[1] - ys[0]),
        fill,
      });
    }
    path = [];
  };
  const emitStroke = () => {
    // A stroked segment is a rectangle a line width thick, centred on the segment.
    // This is how the original's `\hrule` and its 0.92pt row accent reach the page.
    if (path.length === 2) {
      const thick = lineWidth * (Math.hypot(ctm[0], ctm[1]) || 1);
      const [[x0, y0], [x1, y1]] = path;
      if (Math.abs(y1 - y0) < 0.01) {
        shapes.push({ x: Math.min(x0, x1), y: y0 - thick / 2, w: Math.abs(x1 - x0), h: thick, fill: stroke });
      } else if (Math.abs(x1 - x0) < 0.01) {
        shapes.push({ x: x0 - thick / 2, y: Math.min(y0, y1), w: thick, h: Math.abs(y1 - y0), fill: stroke });
      }
    }
    path = [];
  };
  const emitText = () => {
    const [x, y] = apply(mul(tm, ctm), 0, 0);
    placements.push({ x, y, glyphs: hexes.join('').replace(/[\s<>]/g, '') });
    hexes = [];
  };

  for (const token of stream.match(TOKEN) ?? []) {
    if (/^-?[\d.]+$/.test(token)) { nums.push(Number(token)); continue; }
    if (token.startsWith('<')) { hexes.push(token); continue; }
    switch (token) {
      case 'q': stack.push([ctm, fill, stroke, lineWidth]); break;
      case 'Q': {
        const held = stack.pop();
        if (held) { [ctm, fill, stroke, lineWidth] = held; }
        break;
      }
      case 'cm': if (nums.length >= 6) ctm = mul(matrixOf(nums), ctm); break;
      case 'w': if (nums.length) lineWidth = nums[nums.length - 1]; break;
      case 'rg': if (nums.length >= 3) fill = hex(nums[nums.length - 3], nums[nums.length - 2], nums[nums.length - 1]); break;
      case 'g': if (nums.length) fill = hex(nums[nums.length - 1], nums[nums.length - 1], nums[nums.length - 1]); break;
      case 'RG': if (nums.length >= 3) stroke = hex(nums[nums.length - 3], nums[nums.length - 2], nums[nums.length - 1]); break;
      case 'G': if (nums.length) stroke = hex(nums[nums.length - 1], nums[nums.length - 1], nums[nums.length - 1]); break;
      case 'm': if (nums.length >= 2) path = [apply(ctm, nums[nums.length - 2], nums[nums.length - 1])]; break;
      case 'l': if (nums.length >= 2) path.push(apply(ctm, nums[nums.length - 2], nums[nums.length - 1])); break;
      case 're': if (nums.length >= 4) {
        const [x, y, w, h] = nums.slice(-4);
        path = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map((p) => apply(ctm, p[0], p[1]));
      } break;
      case 'f': case 'F': case 'f*': case 'b': case 'b*': case 'B': case 'B*': emitFill(); break;
      case 'S': case 's': emitStroke(); break;
      case 'n': path = []; break;
      case 'BT': tm = IDENTITY; tlm = IDENTITY; hexes = []; break;
      case 'Tm': if (nums.length >= 6) { tlm = matrixOf(nums); tm = tlm; } break;
      case 'TL': if (nums.length) leading = nums[nums.length - 1]; break;
      case 'Td': case 'TD': if (nums.length >= 2) {
        const [tx, ty] = nums.slice(-2);
        if (token === 'TD') leading = -ty;
        tlm = mul(/** @type {Matrix} */ ([1, 0, 0, 1, tx, ty]), tlm);
        tm = tlm;
      } break;
      case 'T*': tlm = mul(/** @type {Matrix} */ ([1, 0, 0, 1, 0, -leading]), tlm); tm = tlm; break;
      case 'Tj': case 'TJ': case "'": case '"': emitText(); break;
      default: break;
    }
    nums.length = 0;
  }
  return { shapes, placements };
}

/**
 * The marks of each page that carries any, in file order.
 *
 * Needed wherever a mark's *neighbours* matter -- reading a row's baselines off a column
 * means walking down one page, and pooling four pages interleaves their rows into
 * nonsense.
 * @param {Uint8Array} bytes
 * @returns {Marks[]}
 */
export function pdfPages(bytes) {
  return markingStreams(bytes)
    .map(readMarks)
    // A zero-area rectangle is a path artefact rather than ink: `pdf-lib` emits a few
    // while setting up its graphics state, and tcolorbox emits more.
    .map((m) => ({ shapes: m.shapes.filter((s) => s.w > 0.05 && s.h > 0.05), placements: m.placements }))
    // A ToUnicode CMap is ASCII and inflates too, so it survives the gate in
    // `markingStreams`; it marks nothing, which is how it is told apart from a page.
    .filter((m) => m.shapes.length || m.placements.length);
}

/**
 * Every mark in the file, from every stream that carries any. Right for anything that is
 * a property of the whole document: the column grid, the palette, the rule weights.
 * @param {Uint8Array} bytes
 * @returns {Marks}
 */
export function pdfMarks(bytes) {
  /** @type {Marks} */ const all = { shapes: [], placements: [] };
  for (const page of pdfPages(bytes)) {
    all.shapes.push(...page.shapes);
    all.placements.push(...page.placements);
  }
  return all;
}
