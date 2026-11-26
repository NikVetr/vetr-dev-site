// The page's live adjustment on the GPU: the same per-pixel step as core/adjust.js's
// applyAdjust(), in a WebGL2 shader, with each tile's shift and the detail matrix from the core's
// adjustTerms(). The core does the rest (each tile's mean, the PNG export, the command line), and
// the page falls back to applyAdjust() where WebGL2 is missing.

import { FROM_LMS, TO_LMS, adjustTerms } from './core/index.js';

const VERTEX = `#version 300 es
in vec2 corner;  // of the unit square
in vec4 rect;    // the tile in pixels: x, y, width, height (per instance)
in vec3 shift;   // its shift in cube-rooted cone space (per instance)
in float apply;  // 1 for a tile, 0 for the picture under the tiles, copied
uniform vec2 size;
flat out vec3 tileShift;
flat out float tileApply;
void main() {
  vec2 p = rect.xy + corner * rect.zw;
  gl_Position = vec4(2.0 * p.x / size.x - 1.0, 1.0 - 2.0 * p.y / size.y, 0.0, 1.0);
  tileShift = shift;
  tileApply = apply;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D photos;  // the photos as drawn, row 0 at the top
uniform sampler2D target;  // the target's cells over the tiles, for detail
uniform bool detail;
uniform mat3 K;
uniform mat3 toLms;
uniform mat3 fromLms;
uniform float height;
flat in vec3 tileShift;
flat in float tileApply;
out vec4 color;
vec3 decode(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 encode(vec3 v) { return mix(12.92 * v, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), v)); }
vec3 cubeRoot(vec3 v) { return sign(v) * pow(abs(v), vec3(1.0 / 3.0)); }
void main() {
  ivec2 p = ivec2(int(gl_FragCoord.x), int(height - gl_FragCoord.y));
  vec4 c = texelFetch(photos, p, 0);
  if (tileApply == 0.0) { color = c; return; }
  vec3 lms = cubeRoot(toLms * decode(c.rgb));
  vec3 v = lms + tileShift;
  if (detail) v += K * (cubeRoot(toLms * decode(texelFetch(target, p, 0).rgb)) - lms);
  color = vec4(encode(clamp(fromLms * (v * v * v), 0.0, 1.0)), 1.0);
}`;

/** @param {number[][]} rows @returns {Float32Array} for uniformMatrix3fv with transpose */
const flat = (rows) => Float32Array.from(rows.flat());

/**
 * A WebGL2 renderer of the adjustment for one canvas, or null where WebGL2 is not available.
 * load() takes the photos as drawn and the tiles (once per drawing), loadDetail() the target's
 * cells laid over the tiles (once, when detail is first asked for), and render() draws the
 * adjusted picture and returns its canvas, to be drawn onto the visible one.
 */
export function createGpuAdjuster() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
  if (!gl) return null;
  const shader = (/** @type {number} */ type, /** @type {string} */ source) => {
    const s = /** @type {WebGLShader} */ (gl.createShader(type));
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`adjustment shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const program = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`adjustment program: ${gl.getProgramInfoLog(program)}`);
  gl.useProgram(program);
  const u = (/** @type {string} */ name) => gl.getUniformLocation(program, name);
  gl.uniformMatrix3fv(u('toLms'), true, flat(TO_LMS));
  gl.uniformMatrix3fv(u('fromLms'), true, flat(FROM_LMS));
  gl.uniform1i(u('photos'), 0);
  gl.uniform1i(u('target'), 1);

  gl.bindVertexArray(gl.createVertexArray());
  /** @param {string} name @param {number} size @param {number} divisor */
  const attribute = (name, size, divisor) => {
    const buffer = gl.createBuffer();
    const at = gl.getAttribLocation(program, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, size, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(at, divisor);
    return buffer;
  };
  attribute('corner', 2, 0);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const rects = attribute('rect', 4, 1);
  const shifts = attribute('shift', 3, 1);
  const applies = attribute('apply', 1, 1);

  const texture = (/** @type {number} */ unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    return t;
  };
  texture(0);
  texture(1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  /** @param {number} unit @param {ImageData | OffscreenCanvas} image */
  const upload = (unit, image) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
  };
  let count = 0;

  return {
    canvas,
    /** Whether the GPU has dropped this context (then the page draws on the CPU). */
    lost: () => gl.isContextLost(),
    /**
     * @param {ImageData} photos the picture as drawn, before adjustment
     * @param {{ x: number, y: number, width: number, height: number }[]} tiles inside it
     */
    load(photos, tiles) {
      canvas.width = photos.width;
      canvas.height = photos.height;
      gl.viewport(0, 0, photos.width, photos.height);
      gl.uniform2f(u('size'), photos.width, photos.height);
      gl.uniform1f(u('height'), photos.height);
      upload(0, photos);
      count = tiles.length;
      // instance 0 is the whole picture, copied; the tiles follow
      gl.bindBuffer(gl.ARRAY_BUFFER, rects);
      gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from([0, 0, photos.width, photos.height, ...tiles.flatMap((t) => [t.x, t.y, t.width, t.height])]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, applies);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(count + 1).fill(1, 1), gl.STATIC_DRAW);
    },
    /** @param {OffscreenCanvas} target the target's cells over the tiles, the size of the photos */
    loadDetail(target) {
      upload(1, target);
    },
    /**
     * @param {Float64Array} delta each tile's C - M (the core's tileDeltas)
     * @param {import('./core/adjust.js').Adjust} adjust
     */
    render(delta, adjust) {
      const { shifts: s, K } = adjustTerms(delta, adjust);
      const all = new Float32Array(3 * (count + 1));
      all.set(s, 3);
      gl.bindBuffer(gl.ARRAY_BUFFER, shifts);
      gl.bufferData(gl.ARRAY_BUFFER, all, gl.DYNAMIC_DRAW);
      gl.uniform1i(u('detail'), adjust.detail > 0 ? 1 : 0);
      gl.uniformMatrix3fv(u('K'), true, flat(K));
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count + 1);
      return canvas;
    },
  };
}
