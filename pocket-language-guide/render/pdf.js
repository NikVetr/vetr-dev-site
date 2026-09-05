// LayoutPlan -> vector PDF.
//
// Text stays text: pdf-lib embeds a subset of each face and encodes runs through
// fontkit, which is the same shaper the solver measured with, so glyph advances in
// the file match the positions the layout committed to. Output is selectable and
// searchable, and a sheet's PDF is tens of kilobytes rather than a rasterised
// megabyte.
//
// PDF's y axis points up from the bottom-left; the plan's points down from the
// top-left. That conversion happens here and nowhere else.

import { PDFDocument, rgb, degrees } from '../vendor/pdf-lib.esm.js';
import * as fontkit from '../vendor/fontkit.esm.js';

/** @param {string} hex `#RRGGBB` */
function color(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** A rounded rectangle as an SVG path, since pdf-lib's rectangles are square.
 * @param {number} w @param {number} h @param {number} r */
function roundedRect(w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  return `M${k} 0h${w - 2 * k}a${k} ${k} 0 0 1 ${k} ${k}v${h - 2 * k}`
    + `a${k} ${k} 0 0 1 ${-k} ${k}h${-(w - 2 * k)}a${k} ${k} 0 0 1 ${-k} ${-k}`
    + `v${-(h - 2 * k)}a${k} ${k} 0 0 1 ${k} ${-k}Z`;
}

/**
 * Draw one run, moving any mark the shaper offset into place.
 *
 * **`pdf-lib` emits one `Tj` of glyph ids and no positioning at all.** Read the
 * content stream and a run is `<0001000200030004> Tj` -- so every glyph is placed by
 * its own advance and every GPOS `xOffset`/`yOffset` is discarded. For twenty of the
 * twenty-two languages that costs nothing, because their marks are drawn near their
 * own origin and need no shift: Noto Sans Thai's tone marks come back at an offset of
 * -3/1000 and are right where they fall. Hebrew's niqqud are the opposite. They are
 * zero-advance glyphs whose outlines sit at *positive* x, 52..228, and they rely
 * wholly on the `mark` feature: `shalom` pointed asks for +539 and +227, so dropping
 * the offsets put every point under the next letter along. A pointed column is the
 * learner's column, so wrong vowels there are worse than no vowels, and it is printed
 * -- which is this project's worst place for a silent failure.
 *
 * So each glyph the shaper offset is drawn on its own, at the position it asked for.
 * **Guarded by proof rather than by a list of scripts:** a glyph is only redrawn alone
 * if laying out its own codepoints alone yields the same glyph id. That is true of
 * Hebrew, which has no contextual forms, and false of Arabic, where an isolated
 * codepoint would come back as the isolated form and undo the joining -- and there the
 * run is drawn whole, exactly as before. Runs whose glyphs all sit at zero offset,
 * which is almost all of them, take the single-call path untouched.
 *
 * @param {any} page @param {any} font @param {any} shaper
 * @param {import('../core/types.js').TextRun} run
 * @param {number} y  already flipped into PDF space
 * @param {any} paint
 */
function drawRun(page, font, shaper, run, y, paint) {
  const laid = shaper ? shaper.layout(run.text) : null;
  const shifted = laid?.positions.some((/** @type {any} */ p) => p.xOffset || p.yOffset);
  if (!laid || !shifted) {
    page.drawText(run.text, { x: run.x, y, size: run.size, font, color: paint });
    return;
  }

  // Every glyph has to survive being drawn alone, or none of them are: half a run
  // repositioned and half not would be worse than the misplacement it is fixing.
  const pieces = laid.glyphs.map((/** @type {any} */ glyph, /** @type {number} */ i) => {
    const text = String.fromCodePoint(...(glyph.codePoints ?? []));
    const alone = shaper.layout(text);
    return alone.glyphs.length === 1 && alone.glyphs[0].id === glyph.id
      ? { text, pos: laid.positions[i] } : null;
  });
  if (pieces.some((/** @type {any} */ piece) => piece === null)) {
    page.drawText(run.text, { x: run.x, y, size: run.size, font, color: paint });
    return;
  }

  // **Only the offset glyphs are drawn alone.** Each `drawText` is its own
  // `BT`/`Tf`/`Tm`/`Tj`/`ET` block, about forty bytes of operators, and a glyph at
  // zero offset does not need one: it lands where its predecessor's advance put it.
  // So consecutive unoffset glyphs are flushed together, which is almost all of them
  // -- a pointed Hebrew word is a handful of marks among its letters. Grouping is safe
  // for the same reason the per-glyph path is: every glyph here has been shown to keep
  // its identity out of context, so a group of them does too.
  const em = run.size / shaper.unitsPerEm;
  /** @type {{text:string, x:number, y:number, open:boolean}[]} */ const blocks = [];
  let pen = 0;
  for (const piece of /** @type {{text:string, pos:any}[]} */ (pieces)) {
    const flat = !piece.pos.xOffset && !piece.pos.yOffset;
    const last = blocks[blocks.length - 1];
    // Extend the open block only if it is also unoffset and ends where this begins.
    if (flat && last?.open) last.text += piece.text;
    else {
      blocks.push({
        text: piece.text,
        x: run.x + (pen + piece.pos.xOffset) * em,
        // The plan's y grows downward and PDF's upward, and this one is already in
        // PDF space -- so a mark the shaper pushes *down* moves toward smaller y.
        y: y + piece.pos.yOffset * em,
        open: flat,
      });
    }
    pen += piece.pos.xAdvance;
  }
  for (const block of blocks) {
    page.drawText(block.text, { x: block.x, y: block.y, size: run.size, font, color: paint });
  }
}

/**
 * @typedef {Object} PdfOptions
 * @property {(file:string)=>Promise<Uint8Array>} loadFont  resolves `<id>.ttf`
 * @property {{viewBox:number, strokeWidth:number, paths:Record<string,string[]>}} icons
 * @property {string} [title]
 * @property {string} [language]  BCP-47, for assistive technology
 * @property {Date} [date]        pin it to keep pre-rendered packs byte-stable
 */

/**
 * @param {import('../core/types.js').LayoutPlan} plan
 * @param {PdfOptions} opts
 * @returns {Promise<Uint8Array>}
 */
export async function planToPdf(plan, opts) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const used = new Set(plan.faces.flatMap((f) => f.runs.map((r) => r.fontId)));
  /** @type {Record<string, import('../vendor/pdf-lib.esm.js').PDFFont>} */ const fonts = {};
  // The same faces again as fontkit objects. `pdf-lib` keeps its embedder's shaper
  // private and `drawRun` needs the positions it threw away, so this reads each file
  // once more -- a few hundred kilobytes for the life of one export, against
  // re-parsing per run.
  /** @type {Record<string, any>} */ const shapers = {};
  for (const id of [...used].sort()) {
    const bytes = await opts.loadFont(`${id}.ttf`);
    fonts[id] = await doc.embedFont(bytes, { subset: true });
    shapers[id] = fontkit.create(bytes);
  }

  doc.setTitle(opts.title ?? 'Pocket language guide');
  doc.setCreator('Pocket Language Guide (vetr.dev)');
  doc.setProducer('Pocket Language Guide');
  if (opts.language) doc.setLanguage(opts.language);
  const date = opts.date ?? new Date();
  doc.setCreationDate(date);
  doc.setModificationDate(date);

  for (const face of plan.faces) {
    const page = doc.addPage([plan.pageW, plan.pageH]);
    // A whole-page rotation, which printers honour, rather than transforming every
    // run: imposition uses it so the back of a card is not printed upside down.
    if (face.rotate) page.setRotation(degrees(face.rotate));
    const flip = (/** @type {number} */ y) => plan.pageH - y;

    for (const r of face.rects) {
      if (r.r) {
        page.drawSvgPath(roundedRect(r.w, r.h, r.r), {
          x: r.x, y: flip(r.y), color: color(r.fill), borderWidth: 0,
        });
      } else {
        page.drawRectangle({
          x: r.x,
          y: flip(r.y + r.h),
          width: r.w,
          height: r.h,
          color: color(r.fill),
          ...(r.opacity === undefined ? {} : { opacity: r.opacity }),
        });
      }
    }

    for (const icon of face.icons) {
      const paths = opts.icons.paths[icon.name];
      if (!paths) throw new Error(`icon "${icon.name}" is not in data/icons.json`);
      const scale = icon.size / opts.icons.viewBox;
      for (const d of paths) {
        page.drawSvgPath(d, {
          x: icon.x,
          y: flip(icon.y),
          scale,
          borderColor: color(icon.fill),
          borderWidth: opts.icons.strokeWidth * scale,
          borderLineCap: 1,
        });
      }
    }

    for (const run of face.runs) {
      const font = fonts[run.fontId];
      if (!font) throw new Error(`font ${run.fontId} was not embedded`);
      drawRun(page, font, shapers[run.fontId], run, flip(run.y), color(run.fill));
    }
  }

  // Object streams shrink the file but some older RIPs choke on them; a pocket
  // guide is small enough that the plain form is not worth the risk.
  return doc.save({ useObjectStreams: false });
}
