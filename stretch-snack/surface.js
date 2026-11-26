// Orthographic, double-sided Gouraud shading with a per-sample depth buffer.
// Geometry is projected in CSS pixels. The transparent layer is restricted to the visible mesh.
// Glass (translucent) rings are drawn after the opaque mesh, tested against its depth.
const layers = new WeakMap();
const keyLight = [-0.53, 0.64, 0.56];
// Glass behind an opaque surface still shows, at this fraction of its strength.
const hiddenGlass = 0.3;

/** @typedef {string | number[]} Color */
/** @typedef {{
 * surface(rings: number[][][], color: Color, ringColors?: Color[]): void,
 * indexed(points: number[][], faces: Uint16Array, color: Color): void,
 * triangles(points: number[][], indices: number[][], color: Color): void,
 * glass(rings: number[][][], rgba: number[][][]): void
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
    this.depth = new Float32Array(0);
    this.usedWidth = this.usedHeight = 0;
    // Glass vertices carry [r, g, b, alpha]; the strongest sample per pixel wins,
    // so overlapping faces of one translucent tube do not darken each other.
    this.glassPosition = new Float64Array(3 * 256);
    this.glassColor = new Float32Array(4 * 256);
    this.glassIndices = new Uint32Array(6 * 256);
    this.glassVertices = this.glassCount = 0;
    this.glassAlpha = new Float32Array(0);
    this.glassRgb = new Uint32Array(0);
  }

  glassVertex(p, rgba) {
    const i = this.glassVertices++;
    if (3 * i === this.glassPosition.length) {
      const position = new Float64Array(2 * this.glassPosition.length);
      position.set(this.glassPosition);
      this.glassPosition = position;
      const color = new Float32Array(2 * this.glassColor.length);
      color.set(this.glassColor);
      this.glassColor = color;
    }
    if (!Number.isFinite(p[0] + p[1] + p[2])) throw new RangeError('A projected glass vertex is not finite.');
    this.glassPosition.set([p[0], p[1], p[2]], 3 * i);
    this.glassColor.set([rgba[0], rgba[1], rgba[2], rgba[3]], 4 * i);
    return i;
  }

  glassTriangle(a, b, c) {
    if (this.glassCount + 3 > this.glassIndices.length) {
      const next = new Uint32Array(2 * this.glassIndices.length);
      next.set(this.glassIndices);
      this.glassIndices = next;
    }
    this.glassIndices[this.glassCount++] = a;
    this.glassIndices[this.glassCount++] = b;
    this.glassIndices[this.glassCount++] = c;
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
      this.depth = new Float32Array(this.canvas.width * this.canvas.height);
    } else {
      this.image.data.fill(0, 0, 4 * this.canvas.width * h);
      // Canvas filters may sample outside the drawImage source rectangle. Keep the unused
      // backing canvas transparent when a smaller pose or the hand inset follows a larger one.
      if (w < this.usedWidth) this.ctx.clearRect(w, 0, this.usedWidth - w, this.usedHeight);
      if (h < this.usedHeight) this.ctx.clearRect(0, h, Math.min(w, this.usedWidth), this.usedHeight - h);
    }
    this.usedWidth = w;
    this.usedHeight = h;
    this.depth.fill(-Infinity, 0, this.canvas.width * h);
    if (this.glassCount) {
      if (this.glassAlpha.length !== this.depth.length) {
        this.glassAlpha = new Float32Array(this.depth.length);
        this.glassRgb = new Uint32Array(this.depth.length);
      } else this.glassAlpha.fill(0, 0, this.canvas.width * h);
    }
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
    // Rings as in surface(), each vertex with its own [r, g, b, alpha 0–1]. Only faces
    // of one screen winding are drawn, so a closed tube shows a single layer.
    glass(rings, rgba) {
      if (rings.length < 2) return;
      const columns = rings.find((ring) => ring.length > 1)?.length ?? 0;
      if (columns < 3) return;
      let previous = 0, wasPole = false;
      for (let row = 0; row < rings.length; row++) {
        const ring = rings[row], pole = ring.length === 1;
        if (!pole && ring.length !== columns) throw new RangeError('Glass rings must have matching point counts, or one pole point.');
        if (rgba[row]?.length !== ring.length) throw new RangeError('Each glass vertex needs one RGBA color.');
        const start = layer.glassVertices;
        ring.forEach((p, j) => layer.glassVertex(project(p), rgba[row][j]));
        if (row) {
          for (let j = 0; j < columns; j++) {
            const next = (j + 1) % columns;
            const a = previous + (wasPole ? 0 : j), b = previous + (wasPole ? 0 : next);
            const c = start + (pole ? 0 : j), d = start + (pole ? 0 : next);
            if (a !== b) layer.glassTriangle(a, b, c);
            if (c !== d) layer.glassTriangle(b, d, c);
          }
        }
        previous = start;
        wasPole = pole;
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
    rgba = layer.image.data;
  for (let f = 0; f < layer.count; f += 3) {
    // Keep the vertex ids as integers from the index buffer throughout sorting.
    let i0 = layer.indices[f],
      i1 = layer.indices[f + 1],
      i2 = layer.indices[f + 2];
    const ax = p[3 * i0],
      ay = p[3 * i0 + 1];
    const originalArea =
      (p[3 * i1] - ax) * (p[3 * i2 + 1] - ay) - (p[3 * i2] - ax) * (p[3 * i1 + 1] - ay);
    if (Math.abs(originalArea) < 1e-8) continue;
    const side = originalArea < 0 ? 0 : 1;
    // Array-destructuring swaps here produced off-palette triangles after WebKit warmed up.
    // Swap the vertex ids explicitly so position, lighting and material travel together.
    if (p[3 * i0 + 1] > p[3 * i1 + 1]) {
      const previous = i0;
      i0 = i1;
      i1 = previous;
    }
    if (p[3 * i1 + 1] > p[3 * i2 + 1]) {
      const previous = i1;
      i1 = i2;
      i2 = previous;
    }
    if (p[3 * i0 + 1] > p[3 * i1 + 1]) {
      const previous = i0;
      i0 = i1;
      i1 = previous;
    }
    const a = 3 * i0,
      b = 3 * i1,
      c = 3 * i2;
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
    const l0 = light[2 * i0 + side],
      l1 = light[2 * i1 + side],
      l2 = light[2 * i2 + side];
    const c0 = colors[i0],
      c1 = colors[i1],
      c2 = colors[i2];
    // Interpolate one brightness value per sample for a uniform material.
    // The shirt, skin and individual chair surfaces can then shade without
    // drifting away from their source hue, even on a very narrow triangle.
    const solid = c0 === c1 && c0 === c2;
    const red = (c0 >> 16) & 255,
      green = (c0 >> 8) & 255,
      blue = c0 & 255;
    const dl1 = l1 - l0,
      dl2 = l2 - l0;
    const shadeX = (dl1 * dy2 - dl2 * dy1) * inv;
    const shadeY = (dx1 * dl2 - dx2 * dl1) * inv;
    // Ring meshes may explicitly change material between vertices. Only these
    // faces need three color gradients, with highlights clipped at the vertices.
    let gradient;
    if (!solid) {
      gradient = [16, 8, 0].map((shift) => {
        const start = Math.min(255, ((c0 >> shift) & 255) * l0);
        const d1 = Math.min(255, ((c1 >> shift) & 255) * l1) - start;
        const d2 = Math.min(255, ((c2 >> shift) & 255) * l2) - start;
        return [start, (d1 * dy2 - d2 * dy1) * inv, (dx1 * d2 - dx2 * d1) * inv];
      });
    }
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
      let zz = z + zx * xx + zy * yy;
      const start = row * stride + first,
        end = row * stride + last;
      // Write the published RGBA byte view. It owns channel clamping and can
      // cover a subrange of its backing buffer.
      if (!gradient) {
        let shade = l0 + shadeX * xx + shadeY * yy;
        for (let i = start; i < end; i++, zz += zx, shade += shadeX) {
          if (zz <= depth[i]) continue;
          depth[i] = zz;
          const offset = 4 * i;
          rgba[offset] = red * shade;
          rgba[offset + 1] = green * shade;
          rgba[offset + 2] = blue * shade;
          rgba[offset + 3] = 255;
        }
      } else {
        const [r, g, b] = gradient;
        let rr = r[0] + r[1] * xx + r[2] * yy;
        let gg = g[0] + g[1] * xx + g[2] * yy;
        let bb = b[0] + b[1] * xx + b[2] * yy;
        for (let i = start; i < end; i++, zz += zx, rr += r[1], gg += g[1], bb += b[1]) {
          if (zz <= depth[i]) continue;
          depth[i] = zz;
          const offset = 4 * i;
          rgba[offset] = rr;
          rgba[offset + 1] = gg;
          rgba[offset + 2] = bb;
          rgba[offset + 3] = 255;
        }
      }
    }
  }
}

// Interpolate color and alpha across each glass triangle. A sample hidden by the
// opaque mesh keeps part of its strength; each pixel keeps its strongest sample.
function rasterGlass(layer, width, height) {
  const p = layer.glassPosition, colors = layer.glassColor, indices = layer.glassIndices;
  const stride = layer.canvas.width, depth = layer.depth;
  const alpha = layer.glassAlpha, rgb = layer.glassRgb;
  let top = height, bottom = 0, leftmost = width, rightmost = 0;
  const planes = new Float64Array(15);
  for (let f = 0; f < layer.glassCount; f += 3) {
    let i0 = indices[f], i1 = indices[f + 1], i2 = indices[f + 2];
    const area = (p[3 * i1] - p[3 * i0]) * (p[3 * i2 + 1] - p[3 * i0 + 1]) - (p[3 * i2] - p[3 * i0]) * (p[3 * i1 + 1] - p[3 * i0 + 1]);
    // Glass is single-sided: of a closed tube's two layers only one winding is drawn.
    if (area < 1e-8) continue;
    if (p[3 * i0 + 1] > p[3 * i1 + 1]) { const previous = i0; i0 = i1; i1 = previous; }
    if (p[3 * i1 + 1] > p[3 * i2 + 1]) { const previous = i1; i1 = i2; i2 = previous; }
    if (p[3 * i0 + 1] > p[3 * i1 + 1]) { const previous = i0; i0 = i1; i1 = previous; }
    const a = 3 * i0, b = 3 * i1, c = 3 * i2;
    const x = p[a], y = p[a + 1];
    const dx1 = p[b] - x, dy1 = p[b + 1] - y, dx2 = p[c] - x, dy2 = p[c + 1] - y;
    const startY = Math.max(0, Math.ceil(y - 0.5)), endY = Math.min(height, Math.ceil(p[c + 1] - 0.5));
    if (startY >= endY) continue;
    const inv = 1 / (dx1 * dy2 - dx2 * dy1);
    // One plane per interpolated quantity (depth, red, green, blue, alpha):
    // its value at the first vertex, then its x and y slopes.
    for (let k = 0; k < 5; k++) {
      const v0 = k ? colors[4 * i0 + k - 1] : p[a + 2];
      const d1 = (k ? colors[4 * i1 + k - 1] : p[b + 2]) - v0;
      const d2 = (k ? colors[4 * i2 + k - 1] : p[c + 2]) - v0;
      planes[3 * k] = v0;
      planes[3 * k + 1] = (d1 * dy2 - d2 * dy1) * inv;
      planes[3 * k + 2] = (dx1 * d2 - dx2 * d1) * inv;
    }
    top = Math.min(top, startY);
    bottom = Math.max(bottom, endY);
    const longSlope = dx2 / dy2, upperSlope = dy1 ? dx1 / dy1 : 0;
    const lowerSlope = dy2 !== dy1 ? (dx2 - dx1) / (dy2 - dy1) : 0;
    for (let row = startY; row < endY; row++) {
      const yy = row + 0.5 - y;
      const left = x + yy * longSlope;
      const right = yy < dy1 ? x + yy * upperSlope : p[b] + (yy - dy1) * lowerSlope;
      const first = Math.max(0, Math.ceil(Math.min(left, right) - 0.5));
      const last = Math.min(width, Math.ceil(Math.max(left, right) - 0.5));
      leftmost = Math.min(leftmost, first);
      rightmost = Math.max(rightmost, last);
      const xx = first + 0.5 - x;
      let zz = planes[0] + planes[1] * xx + planes[2] * yy, rr = planes[3] + planes[4] * xx + planes[5] * yy;
      let gg = planes[6] + planes[7] * xx + planes[8] * yy, bb = planes[9] + planes[10] * xx + planes[11] * yy;
      let aa = planes[12] + planes[13] * xx + planes[14] * yy;
      const zx = planes[1], rx = planes[4], gx = planes[7], bx = planes[10], ax = planes[13];
      for (let i = row * stride + first, end = row * stride + last; i < end;
        i++, zz += zx, aa += ax, rr += rx, gg += gx, bb += bx) {
        const strength = zz > depth[i] ? aa : aa * hiddenGlass;
        if (strength <= alpha[i]) continue;
        alpha[i] = strength;
        rgb[i] = (Math.max(0, Math.min(255, rr)) << 16) | (Math.max(0, Math.min(255, gg)) << 8) | Math.max(0, Math.min(255, bb));
      }
    }
  }
  // Lay the glass over the opaque samples, or alone over the transparent backdrop.
  const data = layer.image.data;
  for (let row = top; row < bottom; row++) {
    for (let i = row * stride + leftmost, end = row * stride + rightmost; i < end; i++) {
      const strength = Math.min(1, alpha[i]);
      if (strength <= 0) continue;
      const o = 4 * i, color = rgb[i];
      const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
      if (data[o + 3]) {
        data[o] += (r - data[o]) * strength;
        data[o + 1] += (g - data[o + 1]) * strength;
        data[o + 2] += (b - data[o + 2]) * strength;
      } else {
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255 * strength;
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
  layer.vertices = layer.count = layer.glassVertices = layer.glassCount = 0;
  build(meshBuilder(layer, project));
  if (!layer.count && !layer.glassCount) return;
  const p = layer.position, glass = layer.glassPosition;
  let x0 = width,
    y0 = height,
    x1 = 0,
    y1 = 0;
  for (const [points, count] of [[p, layer.vertices], [glass, layer.glassVertices]]) {
    for (let i = 0; i < 3 * count; i += 3) {
      x0 = Math.min(x0, points[i]);
      y0 = Math.min(y0, points[i + 1]);
      x1 = Math.max(x1, points[i]);
      y1 = Math.max(y1, points[i + 1]);
    }
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
  for (const [points, count] of [[p, layer.vertices], [glass, layer.glassVertices]]) {
    for (let i = 0; i < 3 * count; i += 3) {
      points[i] = points[i] * density - left;
      points[i + 1] = points[i + 1] * density - top;
    }
  }
  raster(layer, w, h);
  if (layer.glassCount) rasterGlass(layer, w, h);
  layer.ctx.putImageData(layer.image, 0, 0, 0, 0, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(layer.canvas, 0, 0, w, h, left / density, top / density, w / density, h / density);
  ctx.restore();
}
