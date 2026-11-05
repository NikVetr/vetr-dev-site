// Pixel work on RGBA images, done as the R script has ImageMagick do it: image_scale()
// (ImageMagick 6's ScaleImage), the shape-kept height of image_scale(img, "200"), the photo
// summaries and the grid rule.

/** @typedef {{ width: number, height: number, data: Uint8Array | Uint8ClampedArray }} Rgba RGBA, row-major */

/** The width R scales every photo to before averaging it (npix = "200"). */
export const SUMMARY_WIDTH = 200;

/**
 * The height ImageMagick gives a w × h image scaled to `width` with its shape kept (geometry
 * "<width>"): round(width / w × h), at least 1.
 * @param {number} w @param {number} h @param {number} width
 */
export function scaledHeight(w, h, width) {
  return Math.max(1, Math.floor((width / w) * h + 0.5));
}

const QUANTUM = 65535; // ImageMagick Q16, as R's magick links it
const QUANTUM_SCALE = 1 / QUANTUM;

/** ImageMagick's ClampToQuantum() without HDRI. @param {number} v */
const clampToQuantum = (v) => (v <= 0 ? 0 : v >= QUANTUM ? QUANTUM : Math.floor(v + 0.5));
/** ImageMagick's PerceptibleReciprocal(). @param {number} x */
const reciprocal = (x) => (Math.abs(x) >= 1e-12 ? 1 / x : (x < 0 ? -1 : 1) / 1e-12);

/**
 * Scales an image to columns × rows as ImageMagick 6's ScaleImage() (-scale, R's
 * image_scale()) does, in its Q16 arithmetic: each output pixel is the average of the input
 * it covers, weighted by the area covered and, for colour, by alpha; the result is rounded to
 * 16 bits and then to 8, as magick's image_data() reads it. It enlarges as well as shrinks.
 * An image is taken to have an alpha channel if any pixel is not opaque.
 * @param {Rgba} image @param {number} columns @param {number} rows
 * @returns {Rgba}
 */
export function scaleImage(image, columns, rows) {
  const { width: W, height: H, data: src } = image;
  if (columns === W && rows === H) return { width: W, height: H, data: Uint8ClampedArray.from(src) };
  let matte = false;
  for (let p = 3; p < src.length && !matte; p += 4) matte = src[p] !== 255;
  const xVector = new Float64Array(4 * W); // r, g, b premultiplied by alpha, and opacity
  const yVector = new Float64Array(4 * W);
  const scanline = rows === H ? xVector : new Float64Array(4 * W);
  const scaleScanline = new Float64Array(4 * columns);
  const out = new Uint8ClampedArray(4 * columns * rows);
  let readRows = 0;
  const readScanline = () => {
    const row = 4 * readRows * W;
    for (let x = 0; x < W; x++) {
      const p = row + 4 * x;
      const opacity = QUANTUM - 257 * src[p + 3];
      const alpha = matte ? QUANTUM_SCALE * (QUANTUM - opacity) : 1;
      xVector[4 * x] = alpha * 257 * src[p];
      xVector[4 * x + 1] = alpha * 257 * src[p + 1];
      xVector[4 * x + 2] = alpha * 257 * src[p + 2];
      xVector[4 * x + 3] = matte ? opacity : 0;
    }
    readRows++;
  };
  const toChar = (/** @type {number} */ q) => Math.floor((q + 128) / 257);
  let nextRow = true;
  let spanY = 1;
  let scaleY = rows / H;
  for (let y = 0; y < rows; y++) {
    if (rows === H) {
      readScanline();
    } else {
      while (scaleY < spanY) {
        if (nextRow && readRows < H) readScanline();
        for (let k = 0; k < 4 * W; k++) yVector[k] += scaleY * xVector[k];
        spanY -= scaleY;
        scaleY = rows / H;
        nextRow = true;
      }
      if (nextRow && readRows < H) {
        readScanline();
        nextRow = false;
      }
      for (let k = 0; k < 4 * W; k++) {
        scanline[k] = yVector[k] + spanY * xVector[k];
        yVector[k] = 0;
      }
      scaleY -= spanY;
      if (scaleY <= 0) {
        scaleY = rows / H;
        nextRow = true;
      }
      spanY = 1;
    }
    let line = scanline;
    if (columns !== W) {
      let r = 0, g = 0, b = 0, o = 0;
      let nextColumn = false;
      let spanX = 1;
      let t = 0;
      const put = () => {
        scaleScanline[4 * t] = r; scaleScanline[4 * t + 1] = g; scaleScanline[4 * t + 2] = b; scaleScanline[4 * t + 3] = o;
      };
      for (let x = 0; x < W; x++) {
        let scaleX = columns / W;
        while (scaleX >= spanX) {
          if (nextColumn) {
            r = g = b = o = 0;
            t++;
          }
          r += spanX * scanline[4 * x]; g += spanX * scanline[4 * x + 1]; b += spanX * scanline[4 * x + 2]; o += spanX * scanline[4 * x + 3];
          put();
          scaleX -= spanX;
          spanX = 1;
          nextColumn = true;
        }
        if (scaleX > 0) {
          if (nextColumn) {
            r = g = b = o = 0;
            nextColumn = false;
            t++;
          }
          r += scaleX * scanline[4 * x]; g += scaleX * scanline[4 * x + 1]; b += scaleX * scanline[4 * x + 2]; o += scaleX * scanline[4 * x + 3];
          spanX -= scaleX;
        }
      }
      if (spanX > 0) {
        const x = W - 1;
        r += spanX * scanline[4 * x]; g += spanX * scanline[4 * x + 1]; b += spanX * scanline[4 * x + 2]; o += spanX * scanline[4 * x + 3];
      }
      if (!nextColumn && t < columns) put();
      line = scaleScanline;
    }
    for (let x = 0; x < columns; x++) {
      const k = 4 * x;
      const gamma = reciprocal(matte ? QUANTUM_SCALE * (QUANTUM - line[k + 3]) : 1);
      const p = 4 * (y * columns + x);
      out[p] = toChar(clampToQuantum(gamma * line[k]));
      out[p + 1] = toChar(clampToQuantum(gamma * line[k + 1]));
      out[p + 2] = toChar(clampToQuantum(gamma * line[k + 2]));
      out[p + 3] = matte ? toChar(QUANTUM - clampToQuantum(line[k + 3])) : 255;
    }
  }
  return { width: columns, height: rows, data: out };
}

/**
 * The part [x, y, width, height] of an image.
 * @param {Rgba} image @param {[number, number, number, number]} rect
 * @returns {Rgba}
 */
export function cropImage(image, [x0, y0, w, h]) {
  const data = new Uint8ClampedArray(4 * w * h);
  for (let y = 0; y < h; y++) data.set(image.data.subarray(4 * ((y0 + y) * image.width + x0), 4 * ((y0 + y) * image.width + x0 + w)), 4 * y * w);
  return { width: w, height: h, data };
}

/**
 * A photo's summary, as the R script takes it: the photo scaled to 200 pixels wide with its
 * shape kept, then the mean of each channel, on 0-255.
 * @param {Rgba} photo
 * @returns {[number, number, number, number]} mean red, green, blue and alpha
 */
export function summarisePhoto(photo) {
  const small = scaleImage(photo, SUMMARY_WIDTH, scaledHeight(photo.width, photo.height, SUMMARY_WIDTH));
  const sums = [0, 0, 0, 0];
  const d = small.data;
  for (let p = 0; p < d.length; p += 4) {
    sums[0] += d[p]; sums[1] += d[p + 1]; sums[2] += d[p + 2]; sums[3] += d[p + 3];
  }
  const n = d.length / 4;
  return [sums[0] / n, sums[1] / n, sums[2] / n, sums[3] / n];
}

/**
 * The R script's grid for `count` photos and a width × height target: with a the target's
 * height / width once scaled to 200 pixels wide, ⌊√(count / a) · a⌋ rows by ⌊√(count / a)⌋
 * columns, so never more cells than photos.
 * @param {number} count @param {number} width @param {number} height
 */
export function autoGrid(count, width, height) {
  const aspect = scaledHeight(width, height, SUMMARY_WIDTH) / SUMMARY_WIDTH;
  const g = Math.sqrt(count / aspect);
  return { rows: Math.floor(g * aspect), columns: Math.floor(g) };
}
