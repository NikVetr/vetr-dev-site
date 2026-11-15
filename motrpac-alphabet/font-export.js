// OpenType/TrueType export of the editor's already transformed contours.
// COLR v0 supplies the logo colours; ordinary glyf outlines remain usable in
// applications that do not support colour fonts. No remote service is used.

/** @typedef {{x:number, y:number}} Point */
/** @typedef {{points:Point[], fill:string}} Layer */
/** @typedef {{letter:string, layers:Layer[]}} Letter */

const EM = 2048;
const CAP_HEIGHT = 1600;
const BEARING = 90;

export class FontExportError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.name = 'FontExportError'; }
}

class Bytes {
  data = /** @type {number[]} */ ([]);
  /** @param {number} n */
  u8(n) { this.data.push(n & 255); return this; }
  /** @param {number} n */
  u16(n) { return this.u8(n >>> 8).u8(n); }
  /** @param {number} n */
  u32(n) { return this.u16(n >>> 16).u16(n); }
  /** @param {number} n */
  zeros(n) { while (n--) this.u8(0); return this; }
  /** @param {string} s */
  tag(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  /** @param {number[] | Uint8Array} a */
  append(a) { for (const v of a) this.u8(v); return this; }
  finish() { return Uint8Array.from(this.data); }
}

/** @param {Point[][]} contours */
function extent(contours) {
  const pts = contours.flat();
  if (!pts.length) return [0, 0, 0, 0];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return [x0, y0, x1, y1];
}

/** @param {Point[]} points */
function contour(points) {
  const out = /** @type {Point[]} */ ([]);
  for (const p of points) {
    const q = { x: Math.round(p.x), y: Math.round(p.y) };
    const last = out.at(-1);
    if (!last || q.x !== last.x || q.y !== last.y) out.push(q);
  }
  const last = out.at(-1);
  if (last && out.length > 1 && out[0].x === last.x && out[0].y === last.y) out.pop();
  if (out.length < 3) throw new FontExportError('A shape is too small to form a font outline.');
  // All editor shapes are solid single contours. Equal winding avoids holes
  // where shapes overlap in the monochrome fallback.
  let area = 0;
  out.forEach((p, i) => { const q = out[(i + 1) % out.length]; area += p.x * q.y - q.x * p.y; });
  if (area > 0) out.reverse();
  return out;
}

/** @param {Point[][]} contours */
function glyphData(contours) {
  if (!contours.length) return new Uint8Array();
  const points = contours.flat();
  if (points.length > 65535 || contours.length > 32767) throw new FontExportError('A letter has too many outline points.');
  const b = new Bytes().u16(contours.length);
  for (const v of extent(contours)) {
    if (v < -32768 || v > 32767) throw new FontExportError('A letter is too wide for this font.');
    b.u16(v);
  }
  let end = -1;
  for (const c of contours) { end += c.length; b.u16(end); }
  b.u16(0); // no hinting program
  // The first flag also declares possible overlap for compatible rasterizers.
  for (let i = 0; i < points.length; i++) b.u8(i === 0 && contours.length > 1 ? 0x41 : 1);
  for (const axis of /** @type {const} */ (['x', 'y'])) {
    let last = 0;
    for (const p of points) {
      const delta = p[axis] - last;
      if (delta < -32768 || delta > 32767) throw new FontExportError('An outline exceeds the font coordinate range.');
      b.u16(delta); last = p[axis];
    }
  }
  return b.finish();
}

/** @param {Map<number, number>} mapping */
function cmap(mapping) {
  const entries = [...mapping.entries()].sort((a, b) => a[0] - b[0]);
  entries.push([65535, 0]);
  const n = entries.length, pow = 2 ** Math.floor(Math.log2(n));
  const sub = new Bytes().u16(4).u16(16 + 8 * n).u16(0).u16(2 * n)
    .u16(2 * pow).u16(Math.log2(pow)).u16(2 * n - 2 * pow);
  for (const [code] of entries) sub.u16(code);
  sub.u16(0);
  for (const [code] of entries) sub.u16(code);
  for (const [code, gid] of entries) sub.u16(gid - code);
  for (const _ of entries) sub.u16(0);
  return new Bytes().u16(0).u16(1).u16(3).u16(1).u32(12).append(sub.finish()).finish();
}

/** @param {string} family */
function nameTable(family) {
  const ps = family.replace(/[^A-Za-z0-9-]/g, '').slice(0, 50) || 'MotRPACAlphabet';
  const names = [[1, family], [2, 'Regular'], [3, `vetr.dev:${ps}:1.0`], [4, family], [5, 'Version 1.0'], [6, ps]];
  const records = new Bytes().u16(0).u16(names.length).u16(6 + 12 * names.length);
  const strings = new Bytes();
  for (const [id, value] of names) {
    const text = String(value);
    records.u16(3).u16(1).u16(0x409).u16(Number(id)).u16(text.length * 2).u16(strings.data.length);
    for (let i = 0; i < text.length; i++) strings.u16(text.charCodeAt(i));
  }
  return records.append(strings.finish()).finish();
}

/** @param {Uint8Array} bytes */
function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    sum = (sum + ((bytes[i] || 0) * 16777216 + (bytes[i + 1] || 0) * 65536 + (bytes[i + 2] || 0) * 256 + (bytes[i + 3] || 0))) >>> 0;
  }
  return sum;
}

/** @param {Record<string, Uint8Array>} tables */
function sfnt(tables) {
  const tags = Object.keys(tables).sort();
  const n = tags.length, pow = 2 ** Math.floor(Math.log2(n));
  const directory = new Bytes().u32(0x10000).u16(n).u16(pow * 16).u16(Math.log2(pow)).u16(n * 16 - pow * 16);
  let offset = 12 + n * 16, headOffset = 0;
  const body = new Bytes();
  for (const tag of tags) {
    const data = tables[tag];
    directory.tag(tag).u32(checksum(data)).u32(offset).u32(data.length);
    if (tag === 'head') headOffset = offset;
    body.append(data);
    const pad = (4 - data.length % 4) % 4;
    body.zeros(pad); offset += data.length + pad;
  }
  const result = directory.append(body.finish()).finish();
  new DataView(result.buffer).setUint32(headOffset + 8, (0xB1B0AFBA - checksum(result)) >>> 0);
  return result;
}

/**
 * Build a TrueType font from filled, already transformed SVG contours.
 * One common scale preserves head/stem sizes across letters. Each glyph is
 * cropped horizontally and translated onto the baseline (no per-letter stretch).
 * @param {{letters:Letter[], family?:string, color?:boolean}} request
 * @returns {{bytes:Uint8Array, family:string, letters:string[], missing:string[], format:string}}
 */
export function buildFont({ letters, family = 'MotRPAC Alphabet', color = true }) {
  if (!Array.isArray(letters) || !letters.length) throw new FontExportError('The alphabet has no letters to export.');
  if (typeof family !== 'string' || !family.trim() || family.length > 80 || /[\x00-\x1f]/.test(family)) throw new FontExportError('Use a font family name of 1–80 printable characters.');
  if (typeof color !== 'boolean') throw new FontExportError('color must be true or false.');
  family = family.trim();
  const seen = new Set();
  for (const letter of letters) {
    if (!/^[A-Z]$/.test(letter.letter) || seen.has(letter.letter)) throw new FontExportError('Letters must be unique A–Z characters.');
    seen.add(letter.letter);
    if (!Array.isArray(letter.layers) || !letter.layers.length) throw new FontExportError(`${letter.letter} has no filled shapes.`);
    for (const layer of letter.layers) {
      if (!/^#[0-9a-f]{6}$/i.test(layer.fill) || !Array.isArray(layer.points) || layer.points.length < 3 || layer.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new FontExportError(`${letter.letter} has an invalid contour or colour.`);
    }
  }
  const boxes = letters.map(l => extent(l.layers.map(s => s.points)));
  const maxHeight = Math.max(...boxes.map(b => b[3] - b[1]));
  if (!(maxHeight > 0)) throw new FontExportError('The alphabet has no height.');
  const scale = CAP_HEIGHT / maxHeight;
  /** @type {{contours:Point[][], advance:number}[]} */
  const glyphs = [
    { contours: [[{x:90,y:0},{x:90,y:1200},{x:710,y:1200},{x:710,y:0}], [{x:180,y:90},{x:620,y:90},{x:620,y:1110},{x:180,y:1110}]], advance: 800 },
    { contours: [], advance: 600 }
  ];
  const mapping = new Map([[32, 1]]);
  /** @type {{gid:number, layers:{gid:number, color:number}[]}[]} */
  const bases = [];
  const palette = /** @type {string[]} */ ([]);
  letters.forEach((letter, i) => {
    const box = boxes[i];
    const contours = letter.layers.map(layer => contour(layer.points.map(p => ({ x: BEARING + (p.x - box[0]) * scale, y: (box[3] - p.y) * scale }))));
    const advance = Math.round((box[2] - box[0]) * scale) + BEARING * 2;
    if (advance > 32767) throw new FontExportError(`${letter.letter} is too wide relative to the alphabet height.`);
    const gid = glyphs.length;
    glyphs.push({ contours, advance });
    mapping.set(letter.letter.charCodeAt(0), gid);
    mapping.set(letter.letter.toLowerCase().charCodeAt(0), gid);
    if (color) {
      const layers = letter.layers.map((layer, j) => {
        const fill = layer.fill.toLowerCase();
        if (!palette.includes(fill)) palette.push(fill);
        const layerId = glyphs.length;
        glyphs.push({ contours: [contours[j]], advance });
        return { gid: layerId, color: palette.indexOf(fill) };
      });
      bases.push({ gid, layers });
    }
  });
  if (glyphs.length > 65535) throw new FontExportError('Too many shapes for a single font.');
  const glyf = new Bytes(), loca = new Bytes(), hmtx = new Bytes();
  const allBounds = glyphs.map(g => extent(g.contours));
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    loca.u32(glyf.data.length);
    const data = glyphData(g.contours);
    glyf.append(data).zeros((4 - data.length % 4) % 4);
    hmtx.u16(g.advance).u16(allBounds[i][0]);
  }
  loca.u32(glyf.data.length);
  const bb = extent(glyphs.flatMap(g => g.contours));
  const head = new Bytes().u32(0x10000).u32(0x10000).u32(0).u32(0x5F0F3CF5).u16(3).u16(EM)
    .u32(0).u32(2082844800).u32(0).u32(2082844800);
  for (const v of bb) head.u16(v);
  head.u16(0).u16(8).u16(2).u16(1).u16(0);
  const maxp = new Bytes().u32(0x10000).u16(glyphs.length)
    .u16(Math.max(...glyphs.map(g => g.contours.reduce((s, c) => s + c.length, 0))))
    .u16(Math.max(...glyphs.map(g => g.contours.length))).u16(0).u16(0).u16(2).zeros(16);
  const hhea = new Bytes().u32(0x10000).u16(1800).u16(-248).u16(0)
    .u16(Math.max(...glyphs.map(g => g.advance))).u16(Math.min(...allBounds.map(b => b[0])))
    .u16(Math.min(...glyphs.map((g, i) => g.advance - allBounds[i][2])))
    .u16(Math.max(...allBounds.map(b => b[2]))).u16(1).u16(0).u16(0).zeros(8).u16(0).u16(glyphs.length);
  const os2 = new Bytes().u16(4).u16(Math.round(glyphs.reduce((s, g) => s + g.advance, 0) / glyphs.length))
    .u16(400).u16(5).u16(0).u16(1331).u16(1434).u16(0).u16(287).u16(1331).u16(1434).u16(0).u16(977)
    .u16(102).u16(530).u16(0).zeros(10).u32(1).zeros(12).tag('VETR').u16(192).u16(32).u16(122)
    .u16(1800).u16(-248).u16(0).u16(1800).u16(248).u32(1).u32(0).u16(CAP_HEIGHT).u16(CAP_HEIGHT).u16(0).u16(32).u16(1);
  /** @type {Record<string,Uint8Array>} */
  const tables = { head: head.finish(), hhea: hhea.finish(), maxp: maxp.finish(), 'OS/2': os2.finish(),
    hmtx: hmtx.finish(), loca: loca.finish(), glyf: glyf.finish(), cmap: cmap(mapping), name: nameTable(family),
    post: new Bytes().u32(0x30000).u32(0).u16(-150).u16(100).zeros(20).finish() };
  if (color) {
    const totalLayers = bases.reduce((s, b) => s + b.layers.length, 0);
    const colr = new Bytes().u16(0).u16(bases.length).u32(14).u32(14 + bases.length * 6).u16(totalLayers);
    let first = 0;
    for (const b of bases) { colr.u16(b.gid).u16(first).u16(b.layers.length); first += b.layers.length; }
    for (const b of bases) for (const l of b.layers) colr.u16(l.gid).u16(l.color);
    const cpal = new Bytes().u16(0).u16(palette.length).u16(1).u16(palette.length).u32(14).u16(0);
    for (const hex of palette) cpal.u8(parseInt(hex.slice(5,7),16)).u8(parseInt(hex.slice(3,5),16)).u8(parseInt(hex.slice(1,3),16)).u8(255);
    tables.COLR = colr.finish(); tables.CPAL = cpal.finish();
  }
  return { bytes: sfnt(tables), family, letters: letters.map(l => l.letter), missing: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter(l => !seen.has(l)), format: color ? 'TrueType with COLR/CPAL colour' : 'TrueType outlines' };
}
