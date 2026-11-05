// A small PNG decoder for the command line, where there is no canvas. Node
// only (it inflates with node:zlib); the page decodes images with the
// browser instead. Handles every non-interlaced PNG: greyscale, RGB, palette,
// with or without alpha or tRNS, 1-16 bits. 16-bit samples keep their high
// byte. Colour-space chunks (gAMA, iCCP, ...) are ignored, as the page ignores
// them when it decodes with colorSpaceConversion: "none".

import { inflateSync } from 'node:zlib';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * @param {Uint8Array} bytes the PNG file
 * @returns {{ width: number, height: number, data: Uint8ClampedArray }} RGBA, row-major
 */
export function decodePng(bytes) {
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error('not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  /** @type {Uint8Array | null} */
  let palette = null;
  /** @type {Uint8Array | null} */
  let trns = null;
  /** @type {Uint8Array[]} */
  const idat = [];
  for (let pos = 8; pos + 8 <= bytes.length;) {
    const length = view.getUint32(pos);
    const name = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const body = bytes.subarray(pos + 8, pos + 8 + length);
    if (name === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      depth = body[8];
      type = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNGs are not supported; save the image again without interlacing');
    } else if (name === 'PLTE') {
      palette = body;
    } else if (name === 'tRNS') {
      trns = body;
    } else if (name === 'IDAT') {
      idat.push(body);
    } else if (name === 'IEND') {
      break;
    }
    pos += 12 + length;
  }
  const channels = /** @type {Record<number, number>} */ ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[type];
  if (!width || !channels) throw new Error('the PNG has no valid header');
  if (type === 3 && !palette) throw new Error('the PNG has no palette');

  const inflated = inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, (channels * depth) >> 3); // bytes per pixel, for filtering
  const stride = Math.ceil((width * channels * depth) / 8);
  if (inflated.length < height * (stride + 1)) throw new Error('the PNG image data is truncated');
  const lines = new Uint8Array(height * stride);
  for (let r = 0; r < height; r++) {
    const filter = inflated[r * (stride + 1)];
    const src = inflated.subarray(r * (stride + 1) + 1, (r + 1) * (stride + 1));
    const out = lines.subarray(r * stride, (r + 1) * stride);
    const up = r > 0 ? lines.subarray((r - 1) * stride, r * stride) : new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = up[i];
      const c = i >= bpp ? up[i - bpp] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`the PNG uses an unknown filter (${filter})`);
      out[i] = v;
    }
  }

  // sample k (0-based, in channel units) of row r as stored, and as 0-255
  const maxValue = 2 ** depth - 1;
  /** @param {number} r @param {number} k */
  const raw = (r, k) => {
    const row = r * stride;
    if (depth === 16) return (lines[row + 2 * k] << 8) | lines[row + 2 * k + 1];
    if (depth === 8) return lines[row + k];
    const bits = k * depth;
    return (lines[row + (bits >> 3)] >> (8 - depth - (bits & 7))) & maxValue;
  };
  /** @param {number} r @param {number} k */
  const sample = (r, k) => (depth === 16 ? raw(r, k) >> 8 : depth === 8 || type === 3 ? raw(r, k) : Math.round((raw(r, k) * 255) / maxValue));
  // the colour that tRNS makes transparent, for greyscale and RGB
  /** @param {number} ch */
  const key = (ch) => (trns ? (trns[2 * ch] << 8) | trns[2 * ch + 1] : -1);

  const data = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const o = 4 * (r * width + c);
      const k = c * channels;
      if (type === 3) {
        const i = sample(r, k);
        const pal = /** @type {Uint8Array} */ (palette);
        data[o] = pal[3 * i]; data[o + 1] = pal[3 * i + 1]; data[o + 2] = pal[3 * i + 2];
        data[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (type === 0 || type === 4) {
        data[o] = data[o + 1] = data[o + 2] = sample(r, k);
        data[o + 3] = type === 4 ? sample(r, k + 1) : raw(r, k) === key(0) ? 0 : 255;
      } else {
        for (let ch = 0; ch < 3; ch++) data[o + ch] = sample(r, k + ch);
        const keyed = type === 2 && [0, 1, 2].every((ch) => raw(r, k + ch) === key(ch));
        data[o + 3] = type === 6 ? sample(r, k + 3) : keyed ? 0 : 255;
      }
    }
  }
  return { width, height, data };
}
