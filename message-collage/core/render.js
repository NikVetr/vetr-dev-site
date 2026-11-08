// Drawing a result (R/render.R's render_card): the card's background, then each line left-aligned
// at x_in on its baseline, in its face, size and colour, with characters one advance width apart
// (no kerning or ligatures), as they were measured. The card is width_in x height_in; units are
// points (72 per inch).
//
// SVG text is either outlined (each glyph's outline as a path, as R's showtext draws it: exact
// everywhere, not selectable) or embedded (<text> in the bundled fonts, carried in the file:
// selectable and searchable, with kerning and ligatures turned off so it keeps the measured
// widths). PDF text is outlined.

import { faceKey } from './fonts.js';

/**
 * @typedef {import('./fonts.js').Face} Face
 * @typedef {import('./index.js').Result} Result
 * @typedef {import('./index.js').Line} Line
 * @typedef {{ face: Face, glyph: import('./fonts.js').Glyph, x: number }} Placed a glyph at x font units along its line
 */

const PT = 72;

/** @param {number} v */
const num = (v) => String(Math.round(v * 1000) / 1000);

// PDF numbers do not accept exponent notation. Use the same precise decimal
// serialization for every glyph matrix, including tiny warp/shear coefficients.
/** @param {number[]} values */
const matrixNumbers = (values) => values.map(v => v.toFixed(12)).join(' ');

/** @param {string} s */
const escapeXml = (s) => s.replace(/[&<>"]/g, (ch) => (/** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }))[ch]);

/**
 * The glyphs of a line and their offsets along it, in font units.
 * @param {Face} face @param {string} text @returns {Placed[]}
 */
function placeGlyphs(face, text) {
  let x = 0;
  return Array.from(text, (ch) => {
    const glyph = face.font.glyphForCodePoint(/** @type {number} */ (ch.codePointAt(0)));
    const placed = { face, glyph, x };
    x += glyph.advanceWidth;
    return placed;
  });
}

/** @param {Map<string, Face>} faces */
function lineFace(faces) {
  return (/** @type {Line} */ line) => {
    const face = faces.get(faceKey(line.family, line.style_name));
    if (!face) throw new Error(`the font ${line.family} (${line.style_name}) is not loaded`);
    return face;
  };
}

/** SVG path data of a glyph in font units (y up). @param {import('./fonts.js').Glyph} glyph */
function glyphPathData(glyph) {
  const letters = /** @type {Record<string, string>} */ ({ moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' });
  return glyph.path.commands.map(({ command, args }) => {
    const letter = letters[command];
    if (!letter) throw new Error(`unexpected outline command ${command}`);
    return letter + args.map(num).join(' ');
  }).join('');
}

/**
 * The card as SVG text.
 * @param {Result} result
 * @param {Map<string, Face>} faces the faces the result uses (loadFaces)
 * @param {{ text?: 'outlines' | 'embedded' }} [options]
 */
export function renderSvg(result, faces, { text = 'outlines' } = {}) {
  const { card } = result;
  const w = card.width_in * PT;
  const h = card.height_in * PT;
  const faceOf = lineFace(faces);
  const rotationOf = (/** @type {Line} */ line) => {
    const r = result.messages[line.message - 1].rotation;
    return r ? `rotate(${num(r.angle_deg)} ${num(r.x_in * PT)} ${num(r.y_in * PT)}) ` : '';
  };
  const head = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(card.width_in)}in" height="${num(card.height_in)}in" viewBox="0 0 ${num(w)} ${num(h)}">`;
  const background = `<rect width="${num(w)}" height="${num(h)}" fill="${card.background}"/>`;

  if (text === 'embedded') {
    /** @type {Map<Face, string>} */
    const used = new Map();
    for (const line of result.lines) {
      const face = faceOf(line);
      if (!used.has(face)) used.set(face, `f${used.size}`);
    }
    const css = [...used].map(([face, name]) => {
      const type = face.file.endsWith('.woff2') ? 'woff2' : 'ttf';
      return `@font-face{font-family:"${name}";src:url(data:font/${type};base64,${base64(face.bytes)}) format("${type === 'ttf' ? 'truetype' : 'woff2'}");}`;
    }).join('\n');
    const body = result.lines.map((line) => {
      const face = faceOf(line);
      if (line.glyph_transforms) {
        const chars = Array.from(line.text).map((ch, i) => {
          const [a, b, c, d, e, f] = /** @type {number[][]} */ (line.glyph_transforms)[i];
          return `<text transform="matrix(${matrixNumbers([a, b, -c, -d, e, f])})" font-size="${face.unitsPerEm}">${escapeXml(ch)}</text>`;
        }).join('');
        return `<g font-family="${used.get(face)}, ${escapeXml(line.family)}" fill="${line.color}" aria-label="${escapeXml(line.text)}">${chars}</g>`;
      }
      const rotation = rotationOf(line);
      return `<text x="${num(line.x_in * PT)}" y="${num(line.baseline_in * PT)}"${rotation ? ` transform="${rotation.trim()}"` : ''} font-family="${used.get(face)}, ${escapeXml(line.family)}" font-size="${num(line.font_size_pt)}" fill="${line.color}">${escapeXml(line.text)}</text>`;
    }).join('\n');
    return `${head}\n<title>Message collage</title>\n<style>\n${css}\ntext{font-kerning:none;font-variant-ligatures:none;font-feature-settings:"kern" 0,"liga" 0,"clig" 0,"calt" 0;text-rendering:geometricPrecision;white-space:pre}\n</style>\n${background}\n${body}\n</svg>\n`;
  }

  // Outlines: each glyph once in <defs> (font units), placed with <use> inside a line's scaled group.
  /** @type {Map<string, string>} */
  const defs = new Map();
  const faceIds = new Map();
  const body = result.lines.map((line) => {
    const face = faceOf(line);
    if (!faceIds.has(face)) faceIds.set(face, faceIds.size);
    const s = line.font_size_pt / face.unitsPerEm;
    const uses = placeGlyphs(face, line.text).map((p, i) => {
      if (!p.glyph.path.commands.length) return '';
      const id = `g${faceIds.get(face)}-${p.glyph.id}`;
      if (!defs.has(id)) defs.set(id, `<path id="${id}" d="${glyphPathData(p.glyph)}"/>`);
      if (line.glyph_transforms) return `<use xlink:href="#${id}" transform="matrix(${matrixNumbers(line.glyph_transforms[i])})"/>`;
      return `<use xlink:href="#${id}" x="${p.x}"/>`;
    }).join('');
    if (line.glyph_transforms) return `<g fill="${line.color}"><title>${escapeXml(line.text)}</title>${uses}</g>`;
    return `<g fill="${line.color}" transform="${rotationOf(line)}translate(${num(line.x_in * PT)} ${num(line.baseline_in * PT)}) scale(${s.toPrecision(8)} ${(-s).toPrecision(8)})"><title>${escapeXml(line.text)}</title>${uses}</g>`;
  }).join('\n');
  return `${head}\n<title>Message collage</title>\n<defs>\n${[...defs.values()].join('\n')}\n</defs>\n${background}\n${body}\n</svg>\n`;
}

/** @param {Uint8Array} bytes */
function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** @param {string} hex #rrggbb */
const pdfColor = (hex) => [1, 3, 5].map((i) => num(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');

/**
 * The card as a one-page PDF with outlined text: each glyph a form XObject in font units, drawn
 * with the line's colour, size and position. Quadratic outlines become cubic Béziers.
 * @param {Result} result @param {Map<string, Face>} faces
 * @returns {Uint8Array}
 */
export function renderPdf(result, faces) {
  const { card } = result;
  const w = card.width_in * PT;
  const h = card.height_in * PT;
  const faceOf = lineFace(faces);
  /** @type {Map<string, { n: number, data: string }>} */
  const forms = new Map();
  const faceIds = new Map();
  const content = [`${pdfColor(card.background)} rg 0 0 ${num(w)} ${num(h)} re f`];
  for (const line of result.lines) {
    const face = faceOf(line);
    if (!faceIds.has(face)) faceIds.set(face, faceIds.size);
    const s = line.font_size_pt / face.unitsPerEm;
    const x0 = line.x_in * PT;
    const y0 = h - line.baseline_in * PT;
    const rotation = !line.glyph_transforms && result.messages[line.message - 1].rotation;
    if (rotation) {
      const angle = -rotation.angle_deg * Math.PI / 180, c = Math.cos(angle), t = Math.sin(angle);
      const cx = rotation.x_in * PT, cy = h - rotation.y_in * PT;
      content.push(`q ${c.toPrecision(12)} ${t.toPrecision(12)} ${(-t).toPrecision(12)} ${c.toPrecision(12)} ${num(cx - c * cx + t * cy)} ${num(cy - t * cx - c * cy)} cm`);
    }
    content.push(`${pdfColor(line.color)} rg`);
    for (const [i, p] of placeGlyphs(face, line.text).entries()) {
      if (!p.glyph.path.commands.length) continue;
      const key = `G${faceIds.get(face)}_${p.glyph.id}`;
      if (!forms.has(key)) forms.set(key, { n: forms.size, data: pdfPath(p.glyph) });
      if (line.glyph_transforms) {
        const [a, b, c, d, e, f] = line.glyph_transforms[i];
        content.push(`q ${matrixNumbers([a, -b, c, -d, e, h - f])} cm /${key} Do Q`);
      } else content.push(`q ${s.toPrecision(8)} 0 0 ${s.toPrecision(8)} ${num(x0 + p.x * s)} ${num(y0)} cm /${key} Do Q`);
    }
    if (rotation) content.push('Q');
  }
  const formObjects = [...forms].map(([, f]) => f.data);
  const firstForm = 5;
  const xobjects = [...forms].map(([key, f]) => `/${key} ${firstForm + f.n} 0 R`).join(' ');
  const stream = content.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(w)} ${num(h)}] /Resources << /XObject << ${xobjects} >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ...formObjects.map((d) => `<< /Type /XObject /Subtype /Form /BBox [-100000 -100000 100000 100000] /Length ${d.length} >>\nstream\n${d}\nendstream`),
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info << /Title (Message collage) /Producer (vetr.dev message-collage) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out); // ASCII only, so string length = byte length
}

/** A glyph outline as PDF path operators in font units, filled by the nonzero rule. @param {import('./fonts.js').Glyph} glyph */
function pdfPath(glyph) {
  const ops = [];
  let cx = 0;
  let cy = 0;
  for (const { command, args } of glyph.path.commands) {
    if (command === 'moveTo') {
      [cx, cy] = args;
      ops.push(`${num(cx)} ${num(cy)} m`);
    } else if (command === 'lineTo') {
      [cx, cy] = args;
      ops.push(`${num(cx)} ${num(cy)} l`);
    } else if (command === 'quadraticCurveTo') {
      const [qx, qy, x, y] = args;
      const c1 = [cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy)];
      const c2 = [x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y)];
      ops.push(`${[...c1, ...c2, x, y].map(num).join(' ')} c`);
      [cx, cy] = [x, y];
    } else if (command === 'bezierCurveTo') {
      ops.push(`${args.map(num).join(' ')} c`);
      [cx, cy] = args.slice(4);
    } else if (command === 'closePath') {
      ops.push('h');
    } else {
      throw new Error(`unexpected outline command ${command}`);
    }
  }
  ops.push('f');
  return ops.join('\n');
}
