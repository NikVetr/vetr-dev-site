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
//
// A fold is the same paper finished differently: rather than cutting a face into two
// cards, four half-pages become one four-panel card hinged at the middle. It reuses
// the split's own guarantee -- that a column never straddles the midline -- and
// differs only in where on the sheet each half-page is printed.

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
 * Impose the sheet as folded cards instead of cut ones.
 *
 * **The same paper, finished differently.** A cut turns one 7x5 face into two
 * independent 3.5x5 card sides; a fold turns *four* of those halves into one 3.5x5
 * card with four panels, hinged at the middle. Nothing about the layout changes --
 * both operations work on the same solved plan, and both rely on the same fact that
 * makes the cut safe, which is that a column never straddles the midline. So each
 * half of a face is already a valid 2-column page and the only question is where on
 * the paper each one goes.
 *
 * The answer is the printer's own 4-page imposition and it is not the reading order:
 * the front of the paper carries pages **4 and 1**, and the back carries **2 and 3**.
 * That is what puts the 1/2 leaf on top of the 4/3 leaf with page 1 facing out, so
 * folding the left half behind the right gives a card whose spine is on the left and
 * whose panels read 1, 2, 3, 4.
 *
 * `long-edge` takes the same arrangement and rotates the back of the sheet, exactly
 * as `splitCards` does and for the same reason: the printer's flip axis differs from
 * a book turn by 180 degrees, so pre-rotating cancels it. A 180-degree rotation of a
 * whole sheet side also swaps its halves, which is precisely the other half of what
 * the long-edge case needs -- so one `rotate` covers both and there is no second
 * arrangement to get wrong.
 *
 * The page size does not change. A fold card comes off the printer as the sheet it
 * was, which is the point.
 *
 * @param {LayoutPlan} plan
 * @param {{flip?:FlipAxis}} [opts]
 * @returns {LayoutPlan}
 */
export function foldCards(plan, opts = {}) {
  const flip = opts.flip ?? 'short-edge';
  if (plan.faces.length % 2 !== 0) {
    throw new Error(`folding needs an even number of faces, got ${plan.faces.length}`);
  }
  const halfW = plan.pageW / 2;
  // Every half-page in reading order. The column solver fills a face's columns left
  // to right before moving to the next face, so this is the order a reader would
  // meet them in.
  const pages = plan.faces.flatMap(
    (face) => [crop(face, 0, halfW), crop(face, halfW, halfW)],
  );

  /** @type {Face[]} */ const sheets = [];
  for (let card = 0; card < pages.length; card += 4) {
    const [p1, p2, p3, p4] = pages.slice(card, card + 4);
    const marks = foldMarks(halfW, plan.pageH);
    const front = join(p4, p1, halfW, marks);
    const back = join(p2, p3, halfW, marks);
    sheets.push(front);
    sheets.push(flip === 'long-edge' ? { ...back, rotate: 180 } : back);
  }

  return { ...plan, faces: sheets };
}

/**
 * Two half-pages side by side on one sheet.
 * @param {Face} left @param {Face} right @param {number} dx
 * @param {import('../core/types.js').Rect[]} extra
 */
function join(left, right, dx, extra) {
  const shift = (/** @type {any} */ item) => ({ ...item, x: item.x + dx });
  return {
    rects: [...left.rects, ...right.rects.map(shift), ...extra],
    runs: [...left.runs, ...right.runs.map(shift)],
    icons: [...left.icons, ...right.icons.map(shift)],
    hits: [...left.hits, ...right.hits.map(shift)],
  };
}

/**
 * Where to fold, marked at the two edges rather than down the middle.
 *
 * A line down the face would be printed on the finished card forever; a tick in the
 * top and bottom margin is enough to align a fold against and disappears into the
 * crease. Same hairline as `trimMarks`, for the same reason -- it has to survive a
 * 300dpi inkjet without being a feature.
 * @param {number} x @param {number} pageH
 */
function foldMarks(x, pageH, len = 4, thickness = 0.25, fill = '#000000') {
  return [
    { x: x - thickness / 2, y: 0, w: thickness, h: len, fill },
    { x: x - thickness / 2, y: pageH - len, w: thickness, h: len, fill },
  ];
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
