// Canvas drawing for the page: the corrected outline from its SVG path data,
// variable-width strokes (the core's ribbons, filled without the union, which
// looks the same and is quick enough for animation), the raw polylines, the
// transparency checkerboard, and the transparent PNG export with its
// resolution written into the file.

import { ribbon } from './core/outline.js';

/**
 * @typedef {{ s: number, ox: number, oy: number }} View  canvas px = s × signature units + offset
 */

/** Sizes a canvas's backing store to its box and returns its context and pixel ratio. @param {HTMLCanvasElement} c */
export function prepare(c) {
  const r = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { ctx, dpr, w, h };
}

/** The view that fits a box [x, y, width, height] into w × h with a margin share. @param {number[]} box @param {number} w @param {number} h @param {number} margin */
export function fitView(box, w, h, margin) {
  const s = Math.min((w * (1 - 2 * margin)) / Math.max(box[2], 1e-9), (h * (1 - 2 * margin)) / Math.max(box[3], 1e-9));
  return { s, ox: w / 2 - s * (box[0] + box[2] / 2), oy: h / 2 - s * (box[1] + box[3] / 2) };
}

/** A light checkerboard, which reads as "transparent" in both themes. @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h @param {number} cell */
export function checkerboard(ctx, w, h, cell) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ececec';
  for (let y = 0; y < h; y += cell) for (let x = (Math.floor(y / cell) % 2) * cell; x < w; x += 2 * cell) ctx.fillRect(x, y, cell, cell);
}

/** Fills SVG path data (even-odd). @param {CanvasRenderingContext2D} ctx @param {string} d @param {View} v @param {string} color */
export function fillPath(ctx, d, v, color) {
  ctx.save();
  ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(d), 'evenodd');
  ctx.restore();
}

/** Strokes with widths, [[x, y, w], ...], filled as ribbons. @param {CanvasRenderingContext2D} ctx @param {{ points: number[][] }[]} strokes @param {View} v @param {string} color */
export function fillStrokes(ctx, strokes, v, color) {
  const path = new Path2D();
  for (const s of strokes) {
    if (!s.points.some((p) => p[2] > 0)) continue;
    const ring = ribbon(s.points.map((p) => p[0]), s.points.map((p) => p[1]), s.points.map((p) => p[2]));
    path.moveTo(ring[0][0], ring[0][1]);
    for (const [x, y] of ring.slice(1)) path.lineTo(x, y);
    path.closePath();
  }
  ctx.save();
  ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);
  ctx.fillStyle = color;
  ctx.fill(path, 'nonzero');
  ctx.restore();
}

/** Raw strokes as thin polylines. @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }[][]} strokes @param {View} v @param {string} color @param {number} lineWidth canvas px */
export function strokePolylines(ctx, strokes, v, color, lineWidth) {
  ctx.save();
  ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / v.s;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const s of strokes) {
    ctx.beginPath();
    ctx.moveTo(s[0].x, s[0].y);
    for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}

const PER_INCH = { in: 1, mm: 1 / 25.4 };

/**
 * Pixel size of the PNG for a height in a unit at a resolution.
 * @param {number[]} viewBox @param {number} height @param {'mm' | 'in' | 'px'} unit @param {number} dpi
 */
export function pngSize(viewBox, height, unit, dpi) {
  const h = Math.max(1, Math.round(unit === 'px' ? height : height * PER_INCH[unit] * dpi));
  return { width: Math.max(1, Math.round((h * viewBox[2]) / viewBox[3])), height: h };
}

/**
 * A transparent PNG of the outline, with its resolution in a pHYs chunk so
 * that documents place it at the chosen size.
 * @param {string} d SVG path data @param {number[]} viewBox
 * @param {{ height: number, unit: 'mm' | 'in' | 'px', dpi: number, color: string }} o
 * @returns {Promise<Blob>}
 */
export async function pngBlob(d, viewBox, o) {
  const { width, height } = pngSize(viewBox, o.height, o.unit, o.dpi);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const s = height / viewBox[3];
  fillPath(ctx, d, { s, ox: -viewBox[0] * s, oy: -viewBox[1] * s }, o.color);
  const blob = await new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('the browser made no PNG'))), 'image/png'));
  return withResolution(new Uint8Array(await /** @type {Blob} */ (blob).arrayBuffer()), o.dpi);
}

/** The PNG with a pHYs chunk (pixels per metre) after its header. @param {Uint8Array<ArrayBuffer>} png @param {number} dpi */
function withResolution(png, dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // the unit is the metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 8 + 25; // the signature, then IHDR (13 bytes of data, framed by 12)
  return new Blob([png.subarray(0, at), chunk, png.subarray(at)], { type: 'image/png' });
}

/** @type {Uint32Array | null} */
let table = null;
/** @param {Uint8Array} bytes */
function crc32(bytes) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
