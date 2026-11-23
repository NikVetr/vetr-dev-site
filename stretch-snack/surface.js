// Orthographic, double-sided Gouraud shading with a per-sample depth buffer.
// Geometry is projected in CSS pixels. The transparent layer is restricted to the visible mesh.
const layers = new WeakMap();
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const keyLight = [-0.53, 0.64, 0.56];

/** @typedef {string | number[]} Color */
/** @typedef {{
 * surface(rings: number[][][], color: Color, ringColors?: Color[]): void,
 * indexed(points: number[][], faces: Uint16Array, color: Color): void,
 * triangles(points: number[][], indices: number[][], color: Color): void
 * }} SurfaceMesh */

function colorCode(color) {
  if (typeof color === 'string') {
    if (/^#[\da-f]{6}$/i.test(color)) return parseInt(color.slice(1), 16);
    if (/^#[\da-f]{3}$/i.test(color)) {
      const n = parseInt(color.slice(1), 16);
      return (((n >> 8) * 17) << 16) | ((((n >> 4) & 15) * 17) << 8) | ((n & 15) * 17);
    }
  } else if (
    Array.isArray(color) &&
    color.length === 3 &&
    color.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
    return (color[0] << 16) | (color[1] << 8) | color[2];
  }
  throw new TypeError('A surface color must be a hex color or an RGB byte triple.');
}

class Layer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.position = new Float64Array(3 * 1024);
    this.normal = new Float32Array(this.position.length);
    this.colors = new Uint32Array(1024);
    this.light = new Float32Array(2 * 1024);
    this.indices = new Uint32Array(6 * 1024);
    this.vertices = this.count = 0;
    this.image = null;
    this.pixels = new Uint32Array(0);
    this.depth = new Float32Array(0);
    this.usedWidth = this.usedHeight = 0;
  }

  vertex(p, color) {
    const i = this.vertices++;
    if (i === this.colors.length) {
      const xy = new Float64Array(6 * i);
      xy.set(this.position);
      this.position = xy;
      const colors = new Uint32Array(2 * i);
      colors.set(this.colors);
      this.colors = colors;
      // These work arrays are populated after all vertices are collected.
      this.normal = new Float32Array(6 * i);
      this.light = new Float32Array(4 * i);
    }
    if (!Number.isFinite(p[0] + p[1] + p[2])) throw new RangeError('A projected surface vertex is not finite.');
    this.position[3 * i] = p[0];
    this.position[3 * i + 1] = p[1];
    this.position[3 * i + 2] = p[2];
    this.colors[i] = color;
    return i;
  }

  triangle(a, b, c) {
    if (a === b || b === c || a === c) return;
    if (this.count + 3 > this.indices.length) {
      const next = new Uint32Array(2 * this.indices.length);
      next.set(this.indices);
      this.indices = next;
    }
    this.indices[this.count++] = a;
    this.indices[this.count++] = b;
    this.indices[this.count++] = c;
  }

  prepare(w, h) {
    if (!this.image || w > this.canvas.width || h > this.canvas.height) {
      // Reuse the same layer for the body and its smaller hand inset. Keep a little spare
      // space for moving extremities without retaining both dimensions of a rotated viewport.
      const newWidth = Math.ceil((w * 1.08) / 32) * 32;
      const newHeight = Math.ceil((h * 1.08) / 32) * 32;
      const wide = Math.max(this.canvas.width, newWidth),
        tall = Math.max(this.canvas.height, newHeight);
      const keepBoth = this.image && wide * tall <= 2 * newWidth * newHeight;
      this.canvas.width = keepBoth ? wide : newWidth;
      this.canvas.height = keepBoth ? tall : newHeight;
      this.image = this.ctx.createImageData(this.canvas.width, this.canvas.height);
      this.pixels = new Uint32Array(this.image.data.buffer);
      this.depth = new Float32Array(this.pixels.length);
    } else {
      this.pixels.fill(0, 0, this.canvas.width * h);
      // Canvas filters may sample outside the drawImage source rectangle. Keep the unused
      // backing canvas transparent when a smaller pose or the hand inset follows a larger one.
      if (w < this.usedWidth) this.ctx.clearRect(w, 0, this.usedWidth - w, this.usedHeight);
      if (h < this.usedHeight) this.ctx.clearRect(0, h, Math.min(w, this.usedWidth), this.usedHeight - h);
    }
    this.usedWidth = w;
    this.usedHeight = h;
    this.depth.fill(-Infinity, 0, this.canvas.width * h);
  }
}

function meshBuilder(layer, project) {
  return {
    surface(rings, color, ringColors) {
      if (rings.length < 2) return;
      const columns = rings.find((ring) => ring.length > 1)?.length ?? 0;
      if (columns < 3) return;
      let previous = 0,
        wasPole = false;
      const baseColor = colorCode(color);
      for (let row = 0; row < rings.length; row++) {
        const ring = rings[row];
        if (ring.length !== columns && ring.length !== 1)
          throw new RangeError('Surface rings must have matching point counts, or one pole point.');
        const first = ring[0];
        const pole =
          ring.length === 1 || ring.every((p) => p[0] === first[0] && p[1] === first[1] && p[2] === first[2]);
        const start = layer.vertices;
        const ink = ringColors?.[row] == null ? baseColor : colorCode(ringColors[row]);
        if (pole) layer.vertex(project(first), ink);
        else for (const p of ring) layer.vertex(project(p), ink);
        if (row) {
          for (let j = 0; j < columns; j++) {
            const next = (j + 1) % columns;
            const a = previous + (wasPole ? 0 : j),
              b = previous + (wasPole ? 0 : next);
            const c = start + (pole ? 0 : j),
              d = start + (pole ? 0 : next);
            layer.triangle(a, b, c);
            layer.triangle(b, d, c);
          }
        }
        previous = start;
        wasPole = pole;
      }
    },
    // Fixed model topology was validated when the mesh was packed. Add its
    // flat triangle list without allocating thousands of short arrays per frame.
    indexed(points, faces, color) {
      const start = layer.vertices, ink = colorCode(color);
      for (const point of points) layer.vertex(project(point), ink);
      for (let i = 0; i < faces.length; i += 3)
        layer.triangle(start + faces[i], start + faces[i + 1], start + faces[i + 2]);
    },
    triangles(points, indices, color) {
      const start = layer.vertices;
      const ink = colorCode(color);
      for (const p of points) layer.vertex(project(p), ink);
      for (const face of indices) {
        if (face.length !== 3 || face.some((i) => !Number.isInteger(i) || i < 0 || i >= points.length))
          throw new RangeError('A triangle needs three valid vertex indices.');
        layer.triangle(start + face[0], start + face[1], start + face[2]);
      }
    },
  };
}

function cameraDepthScale(project) {
  const origin = project([0, 0, 0]);
  const x = project([1, 0, 0]),
    y = project([0, 1, 0]),
    z = project([0, 0, 1]);
  const sx = Math.hypot(x[0] - origin[0], y[0] - origin[0], z[0] - origin[0]);
  const sy = Math.hypot(x[1] - origin[1], y[1] - origin[1], z[1] - origin[1]);
  const sz = Math.hypot(x[2] - origin[2], y[2] - origin[2], z[2] - origin[2]);
  return sz ? (sx + sy) / (2 * sz) : 1;
}

function shadeVertices(layer, depthScale, ambient) {
  const p = layer.position,
    normals = layer.normal,
    indices = layer.indices;
  normals.fill(0, 0, 3 * layer.vertices);
  for (let f = 0; f < layer.count; f += 3) {
    const a = 3 * indices[f],
      b = 3 * indices[f + 1],
      c = 3 * indices[f + 2];
    const ax = p[b] - p[a],
      ay = p[a + 1] - p[b + 1],
      az = depthScale * (p[b + 2] - p[a + 2]);
    const bx = p[c] - p[a],
      by = p[a + 1] - p[c + 1],
      bz = depthScale * (p[c + 2] - p[a + 2]);
    const nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let i = 0; i < layer.vertices; i++) {
    const a = 3 * i,
      x = normals[a],
      y = normals[a + 1],
      z = normals[a + 2];
    const length = Math.sqrt(x * x + y * y + z * z);
    const key = length ? (x * keyLight[0] + y * keyLight[1] + z * keyLight[2]) / length : 0;
    // Precompute both sides. Screen winding selects the camera-facing one during rasterization.
    layer.light[2 * i] = ambient + (1.08 - ambient) * Math.max(0, 0.25 + 0.75 * key);
    layer.light[2 * i + 1] = ambient + (1.08 - ambient) * Math.max(0, 0.25 - 0.75 * key);
  }
}

function raster(layer, width, height) {
  const p = layer.position,
    colors = layer.colors,
    light = layer.light;
  const stride = layer.canvas.width,
    depth = layer.depth,
    pixels = layer.pixels;
  for (let f = 0; f < layer.count; f += 3) {
    // Offsets into the packed [screen x, screen y, depth] positions.
    let a = 3 * layer.indices[f],
      b = 3 * layer.indices[f + 1],
      c = 3 * layer.indices[f + 2];
    const originalArea = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1]);
    if (Math.abs(originalArea) < 1e-8) continue;
    const side = originalArea < 0 ? 0 : 1;
    // Sweep sample centers between the long edge and the two shorter edges.
    if (p[a + 1] > p[b + 1]) [a, b] = [b, a];
    if (p[b + 1] > p[c + 1]) [b, c] = [c, b];
    if (p[a + 1] > p[b + 1]) [a, b] = [b, a];
    const x = p[a],
      y = p[a + 1],
      z = p[a + 2];
    const dx1 = p[b] - x,
      dy1 = p[b + 1] - y,
      dz1 = p[b + 2] - z;
    const dx2 = p[c] - x,
      dy2 = p[c + 1] - y,
      dz2 = p[c + 2] - z;
    const startY = Math.max(0, Math.ceil(y - 0.5)),
      endY = Math.min(height, Math.ceil(p[c + 1] - 0.5));
    if (startY >= endY) continue;
    const inv = 1 / (dx1 * dy2 - dx2 * dy1);
    const zx = (dz1 * dy2 - dz2 * dy1) * inv,
      zy = (dx1 * dz2 - dx2 * dz1) * inv;
    const i0 = a / 3,
      i1 = b / 3,
      i2 = c / 3;
    const l0 = light[2 * i0 + side],
      l1 = light[2 * i1 + side],
      l2 = light[2 * i2 + side];
    const c0 = colors[i0],
      c1 = colors[i1],
      c2 = colors[i2];
    const r = Math.min(255, (c0 >> 16) * l0);
    const g = Math.min(255, ((c0 >> 8) & 255) * l0);
    const bl = Math.min(255, (c0 & 255) * l0);
    const dr1 = Math.min(255, (c1 >> 16) * l1) - r,
      dr2 = Math.min(255, (c2 >> 16) * l2) - r;
    const dg1 = Math.min(255, ((c1 >> 8) & 255) * l1) - g,
      dg2 = Math.min(255, ((c2 >> 8) & 255) * l2) - g;
    const db1 = Math.min(255, (c1 & 255) * l1) - bl,
      db2 = Math.min(255, (c2 & 255) * l2) - bl;
    const rx = (dr1 * dy2 - dr2 * dy1) * inv,
      ry = (dx1 * dr2 - dx2 * dr1) * inv;
    const gx = (dg1 * dy2 - dg2 * dy1) * inv,
      gy = (dx1 * dg2 - dx2 * dg1) * inv;
    const bx = (db1 * dy2 - db2 * dy1) * inv,
      by = (dx1 * db2 - dx2 * db1) * inv;
    const longSlope = dx2 / dy2,
      upperSlope = dy1 ? dx1 / dy1 : 0;
    const lowerSlope = dy2 !== dy1 ? (dx2 - dx1) / (dy2 - dy1) : 0;
    for (let row = startY; row < endY; row++) {
      const yy = row + 0.5 - y;
      const left = x + yy * longSlope;
      const right = yy < dy1 ? x + yy * upperSlope : p[b] + (yy - dy1) * lowerSlope;
      const first = Math.max(0, Math.ceil(Math.min(left, right) - 0.5));
      const last = Math.min(width, Math.ceil(Math.max(left, right) - 0.5));
      const xx = first + 0.5 - x;
      let zz = z + zx * xx + zy * yy,
        red = r + rx * xx + ry * yy;
      let green = g + gx * xx + gy * yy,
        blue = bl + bx * xx + by * yy;
      const end = row * stride + last;
      for (let i = row * stride + first; i < end; i++, zz += zx, red += rx, green += gx, blue += bx) {
        if (zz <= depth[i]) continue;
        depth[i] = zz;
        pixels[i] = littleEndian
          ? 0xff000000 | ((blue + 0.5) << 16) | ((green + 0.5) << 8) | (red + 0.5)
          : ((red + 0.5) << 24) | ((green + 0.5) << 16) | ((blue + 0.5) << 8) | 255;
      }
    }
  }
}

/**
 * Renders filled triangles onto an existing Canvas2D context in its CSS-pixel coordinate system.
 * Rings wrap at the seam; use a one-point ring for a smooth pole. Ring colors blend along the mesh.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {(point:number[]) => number[]} project orthographic [screenX,screenY,depth], higher depth is nearer
 * @param {(mesh:SurfaceMesh) => void} build
 * @param {{density?:number,maxPixels?:number,ambient?:number}} [options]
 */
export function drawSurface(ctx, width, height, project, build, options = {}) {
  if (width <= 0 || height <= 0) return;
  const pixelBudget = options.maxPixels ?? 550000;
  const ambient = options.ambient ?? 0.65;
  const preferred = options.density ?? Math.min(3, Math.max(1.5, (1.5 * ctx.canvas.width) / width));
  if (!Number.isFinite(preferred) || preferred <= 0 || !Number.isFinite(pixelBudget) || pixelBudget < 1)
    throw new RangeError('Raster density and pixel budget must be positive.');
  if (!Number.isFinite(ambient) || ambient < 0 || ambient > 1)
    throw new RangeError('Ambient lighting must be between zero and one.');
  let layer = layers.get(ctx);
  if (!layer) {
    layer = new Layer();
    layers.set(ctx, layer);
  }
  layer.vertices = layer.count = 0;
  build(meshBuilder(layer, project));
  if (!layer.count) return;
  const p = layer.position;
  let x0 = width,
    y0 = height,
    x1 = 0,
    y1 = 0;
  for (let i = 0; i < 3 * layer.vertices; i += 3) {
    x0 = Math.min(x0, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    x1 = Math.max(x1, p[i]);
    y1 = Math.max(y1, p[i + 1]);
  }
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(width, x1);
  y1 = Math.min(height, y1);
  if (x0 >= x1 || y0 >= y1) return;
  const area = (x1 - x0 + 2) * (y1 - y0 + 2);
  // Supersample the destination's backing pixels while keeping fullscreen work bounded.
  const density = Math.min(preferred, Math.sqrt(pixelBudget / area));
  const left = Math.floor(x0 * density) - 1,
    top = Math.floor(y0 * density) - 1;
  const w = Math.ceil(x1 * density) + 1 - left,
    h = Math.ceil(y1 * density) + 1 - top;
  layer.prepare(w, h);
  shadeVertices(layer, cameraDepthScale(project), ambient);
  for (let i = 0; i < 3 * layer.vertices; i += 3) {
    p[i] = p[i] * density - left;
    p[i + 1] = p[i + 1] * density - top;
  }
  raster(layer, w, h);
  layer.ctx.putImageData(layer.image, 0, 0, 0, 0, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(layer.canvas, 0, 0, w, h, left / density, top / density, w / density, h / density);
  ctx.restore();
}
