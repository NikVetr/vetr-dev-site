// Imposition: turn a solved sheet into what you actually put through a printer.
//
// Every operation here is a LayoutPlan -> LayoutPlan transform, so the SVG and PDF
// renderers need to know nothing about cards, duplexing or n-up.
//
// The card split is the one that matters in practice. A 7x5in face halves into two
// 3.5x5in card sides, so four faces give eight sides -- which is four
// double-sided cards, not eight cards. Which half backs which depends on the axis
// the printer flips about, and getting it wrong is only discovered after cutting,
// so both orders are offered and the studio can overlay them for checking.

/** @typedef {import('../core/types.js').LayoutPlan} LayoutPlan */
/** @typedef {import('../core/types.js').Face} Face */

/**
 * Which axis the printer flips the sheet about when duplexing.
 * - `short-edge` for a landscape sheet turns it like a book page, so the front's
 *   left half ends up behind the back's right half. Nothing needs rotating.
 * - `long-edge` flips it top over bottom, so halves stay on the same side but the
 *   back comes out upside down and has to be pre-rotated.
 * @typedef {'short-edge'|'long-edge'} FlipAxis
 */

/**
 * Split every face down the middle. Output order is card 1 front, card 1 back,
 * card 2 front, card 2 back, and so on, so the pages can be printed duplex as they
 * come or run off one at a time.
 *
 * @param {LayoutPlan} plan
 * @param {{flip?:FlipAxis}} [opts]
 * @returns {LayoutPlan}
 */
export function splitCards(plan, opts = {}) {
  const flip = opts.flip ?? 'short-edge';
  if (plan.faces.length % 2 !== 0) {
    throw new Error(`card splitting needs an even number of faces, got ${plan.faces.length}`);
  }
  const halfW = plan.pageW / 2;
  /** @type {Face[]} */ const sides = [];

  for (let sheet = 0; sheet < plan.faces.length; sheet += 2) {
    const front = plan.faces[sheet];
    const back = plan.faces[sheet + 1];
    // Left card: front's left half. Its back is the other half of the reverse
    // face under a short-edge flip, or the same half under a long-edge flip.
    const pairs = flip === 'short-edge'
      ? [[[front, 0], [back, 1]], [[front, 1], [back, 0]]]
      : [[[front, 0], [back, 0]], [[front, 1], [back, 1]]];
    for (const card of pairs) {
      for (const [face, half] of card) {
        const cropped = crop(/** @type {Face} */ (face), /** @type {number} */ (half) * halfW, halfW);
        const isBack = face === back;
        sides.push(isBack && flip === 'long-edge' ? { ...cropped, rotate: 180 } : cropped);
      }
    }
  }

  return { ...plan, pageW: halfW, faces: sides };
}

/**
 * Keep only what falls in a vertical band, shifted to the band's own origin.
 * Column gutters mean nothing straddles the cut in practice, but a rect that does
 * is clipped rather than dropped.
 * @param {Face} face @param {number} x0 @param {number} width
 */
function crop(face, x0, width) {
  const x1 = x0 + width;
  return {
    rects: face.rects.flatMap((r) => {
      const left = Math.max(r.x, x0);
      const right = Math.min(r.x + r.w, x1);
      if (right - left <= 0.01) return [];
      return [{ ...r, x: left - x0, w: right - left }];
    }),
    // Text and icons are placed by origin: a run belongs to whichever half it
    // starts in, so it is never sliced through a glyph.
    runs: face.runs.filter((r) => r.x >= x0 - 0.01 && r.x < x1 - 0.01)
      .map((r) => ({ ...r, x: r.x - x0 })),
    icons: face.icons.filter((i) => i.x >= x0 - 0.01 && i.x < x1 - 0.01)
      .map((i) => ({ ...i, x: i.x - x0 })),
    hits: face.hits.flatMap((h) => {
      const left = Math.max(h.x, x0);
      const right = Math.min(h.x + h.w, x1);
      if (right - left <= 0.01) return [];
      return [{ ...h, x: left - x0, w: right - left }];
    }),
  };
}

/**
 * Tile faces onto larger paper, for people printing on Letter or A4 rather than
 * photo stock. Adds trim marks around each tile.
 * @param {LayoutPlan} plan
 * @param {{paperW:number, paperH:number, margin?:number, gap?:number, marks?:boolean}} paper
 * @returns {LayoutPlan}
 */
export function nUp(plan, paper) {
  const margin = paper.margin ?? 18;
  const gap = paper.gap ?? 9;
  const cols = Math.max(1, Math.floor((paper.paperW - 2 * margin + gap) / (plan.pageW + gap)));
  const rows = Math.max(1, Math.floor((paper.paperH - 2 * margin + gap) / (plan.pageH + gap)));
  const perSheet = cols * rows;

  /** @type {Face[]} */ const sheets = [];
  for (let start = 0; start < plan.faces.length; start += perSheet) {
    /** @type {Face} */ const sheet = { rects: [], runs: [], icons: [], hits: [] };
    for (let slot = 0; slot < perSheet; slot += 1) {
      const face = plan.faces[start + slot];
      if (!face) break;
      const dx = margin + (slot % cols) * (plan.pageW + gap);
      const dy = margin + Math.floor(slot / cols) * (plan.pageH + gap);
      for (const r of face.rects) sheet.rects.push({ ...r, x: r.x + dx, y: r.y + dy });
      for (const r of face.runs) sheet.runs.push({ ...r, x: r.x + dx, y: r.y + dy });
      for (const i of face.icons) sheet.icons.push({ ...i, x: i.x + dx, y: i.y + dy });
      for (const h of face.hits) sheet.hits.push({ ...h, x: h.x + dx, y: h.y + dy });
      if (paper.marks !== false) sheet.rects.push(...trimMarks(dx, dy, plan.pageW, plan.pageH));
    }
    sheets.push(sheet);
  }

  return { ...plan, pageW: paper.paperW, pageH: paper.paperH, faces: sheets };
}

/**
 * Short hairlines just outside each corner, to cut to.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 */
function trimMarks(x, y, w, h, len = 7, thickness = 0.25, fill = '#000000') {
  /** @type {import('../core/types.js').Rect[]} */ const marks = [];
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    const sx = cx === x ? -len : 0;
    const sy = cy === y ? -len : 0;
    marks.push({ x: cx + sx, y: cy - thickness / 2, w: len, h: thickness, fill });
    marks.push({ x: cx - thickness / 2, y: cy + sy, w: thickness, h: len, fill });
  }
  return marks;
}
