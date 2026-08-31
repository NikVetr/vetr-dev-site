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
  for (const id of [...used].sort()) {
    fonts[id] = await doc.embedFont(await opts.loadFont(`${id}.ttf`), { subset: true });
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
          x: r.x, y: flip(r.y + r.h), width: r.w, height: r.h, color: color(r.fill),
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
      page.drawText(run.text, {
        x: run.x, y: flip(run.y), size: run.size, font, color: color(run.fill),
      });
    }
  }

  // Object streams shrink the file but some older RIPs choke on them; a pocket
  // guide is small enough that the plain form is not worth the risk.
  return doc.save({ useObjectStreams: false });
}
