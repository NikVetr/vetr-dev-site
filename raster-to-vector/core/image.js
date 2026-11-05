// Preprocessing before quantization, as R/io.R: optional downscale (the R
// version's ImageMagick Box resize, reproduced here), integer
// nearest-neighbour upscale, and padding by replicated edge pixels. Images
// are RGBA bytes, row by row from the top left.

/** @typedef {{ width: number, height: number, data: Uint8Array }} Rgba */

const Q = 65535; // ImageMagick's 16-bit quantum range
const EPS = 1e-12; // MagickEpsilon

/**
 * Shrinks so that the longer side is at most maxDim, as R's
 * magick::image_resize(img, "NxN", filter = "Box") does with ImageMagick 6 (Q16):
 * the size keeps the aspect ratio (each side rounded), each output pixel averages
 * the input pixels under its footprint, colour weighted by alpha, in two passes
 * (along the axis that shrinks less first) with a 16-bit image in between.
 * @param {Rgba} img @param {number} maxDim
 * @returns {Rgba}
 */
export function downscale(img, maxDim) {
  if (Math.max(img.width, img.height) <= maxDim) return img;
  const s = Math.min(maxDim / img.width, maxDim / img.height);
  const width = Math.max(Math.floor(s * img.width + 0.5), 1);
  const height = Math.max(Math.floor(s * img.height + 0.5), 1);
  // 16-bit channels, alpha stored as ImageMagick 6 stores it, as opacity
  const n = img.width * img.height;
  const q = new Uint16Array(n * 4);
  for (let i = 0; i < n * 4; i++) q[i] = (i & 3) === 3 ? Q - img.data[i] * 257 : img.data[i] * 257;
  const xf = width / img.width;
  const yf = height / img.height;
  let out;
  if (xf > yf) {
    out = boxPass(boxPass({ w: img.width, h: img.height, q }, width, xf, true), height, yf, false);
  } else {
    out = boxPass(boxPass({ w: img.width, h: img.height, q }, height, yf, false), width, xf, true);
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i++) {
    const v = (i & 3) === 3 ? Q - out.q[i] : out.q[i];
    data[i] = ((v + 128) - ((v + 128) >> 8)) >> 8; // ScaleQuantumToChar
  }
  return { width, height, data };
}

/**
 * One pass of ImageMagick 6's HorizontalFilter / VerticalFilter with the Box filter.
 * @param {{ w: number, h: number, q: Uint16Array }} src @param {number} size output length along the axis
 * @param {number} factor size / input length @param {boolean} horizontal
 */
function boxPass(src, size, factor, horizontal) {
  const len = horizontal ? src.w : src.h;
  const across = horizontal ? src.h : src.w;
  const w = horizontal ? size : src.w;
  const h = horizontal ? src.h : size;
  const q = new Uint16Array(w * h * 4);
  let scale = Math.max(1 / factor + EPS, 1);
  let support = scale * 0.5;
  if (support < 0.5) {
    support = 0.5;
    scale = 1;
  }
  const at = (/** @type {number} */ along, /** @type {number} */ other) => 4 * (horizontal ? other * src.w + along : along * src.w + other);
  const to = (/** @type {number} */ along, /** @type {number} */ other) => 4 * (horizontal ? other * w + along : along * w + other);
  for (let x = 0; x < size; x++) {
    const bisect = (x + 0.5) / factor + EPS;
    const start = Math.trunc(Math.max(bisect - support + 0.5, 0));
    const stop = Math.trunc(Math.min(bisect + support + 0.5, len));
    const count = stop - start;
    if (count <= 0) continue;
    // every Box weight is 1; normalized by the reciprocal of their sum
    const weight = count === 1 ? 1 : 1 * reciprocal(count);
    for (let y = 0; y < across; y++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let opacity = 0;
      let gamma = 0;
      for (let i = start; i < stop; i++) {
        const p = at(i, y);
        const alpha = weight * (1 / Q) * (Q - src.q[p + 3]);
        r += alpha * src.q[p];
        g += alpha * src.q[p + 1];
        b += alpha * src.q[p + 2];
        opacity += weight * src.q[p + 3];
        gamma += alpha;
      }
      gamma = reciprocal(gamma);
      const o = to(x, y);
      q[o] = clampToQuantum(gamma * r);
      q[o + 1] = clampToQuantum(gamma * g);
      q[o + 2] = clampToQuantum(gamma * b);
      q[o + 3] = clampToQuantum(opacity);
    }
  }
  return { w, h, q };
}

/** ImageMagick's PerceptibleReciprocal. @param {number} x */
function reciprocal(x) {
  const sign = x < 0 ? -1 : 1;
  return sign * x >= EPS ? 1 / x : sign / EPS;
}

/** @param {number} v */
function clampToQuantum(v) {
  if (v <= 0) return 0;
  if (v >= Q) return Q;
  return Math.trunc(v + 0.5);
}

/**
 * Integer nearest-neighbour upscale (the original's `resmul`).
 * @param {Rgba} img @param {number} factor
 * @returns {Rgba}
 */
export function upscale(img, factor) {
  if (factor === 1) return img;
  return remap(img, img.width * factor, img.height * factor, (c) => Math.floor(c / factor), (r) => Math.floor(r / factor));
}

/**
 * Pads by replicating the edge rows and columns n times.
 * @param {Rgba} img @param {number} n
 * @returns {Rgba}
 */
export function pad(img, n) {
  const clamp = (/** @type {number} */ v, /** @type {number} */ max) => Math.min(Math.max(v - n, 0), max - 1);
  return remap(img, img.width + 2 * n, img.height + 2 * n, (c) => clamp(c, img.width), (r) => clamp(r, img.height));
}

/**
 * @param {Rgba} img @param {number} width @param {number} height
 * @param {(c: number) => number} col source column of each output column
 * @param {(r: number) => number} row source row of each output row
 * @returns {Rgba}
 */
function remap(img, width, height, col, row) {
  const data = new Uint8Array(width * height * 4);
  for (let r = 0; r < height; r++) {
    const sr = row(r);
    for (let c = 0; c < width; c++) {
      const s = 4 * (sr * img.width + col(c));
      data.set(img.data.subarray(s, s + 4), 4 * (r * width + c));
    }
  }
  return { width, height, data };
}
