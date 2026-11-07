// Gentle message rotations are a final, deterministic presentation step. The original
// grid layout stays available at rotation_deg=0. Every accepted angle keeps conservative
// glyph bounds inside the card and clear of all other messages.
import { faceKey } from './fonts.js';

/** @typedef {[number, number]} Point */
/** @typedef {{ message: number, points: Point[] }} Box */

/** Bounds of the actual outline control points, including italic overhangs and descenders.
 * @param {import('./index.js').Result} result @param {Map<string, import('./fonts.js').Face>} faces
 * @param {number} [padding] safety margin in inches around each line
 * @returns {Box[]}
 */
export function inkBoxes(result, faces, padding = 0) {
  return result.lines.map(line => {
    const face = faces.get(faceKey(line.family, line.style_name));
    if (!face) throw new Error(`Missing font ${line.family} (${line.style_name})`);
    const scale = line.font_size_pt / face.unitsPerEm / 72;
    let pen = 0, left = Infinity, right = -Infinity, top = -Infinity, bottom = Infinity;
    for (const char of line.text) {
      const glyph = face.font.glyphForCodePoint(/** @type {number} */ (char.codePointAt(0)));
      for (const command of glyph.path.commands) for (let i = 0; i < command.args.length; i += 2) {
        left = Math.min(left, pen + command.args[i]); right = Math.max(right, pen + command.args[i]);
        bottom = Math.min(bottom, command.args[i + 1]); top = Math.max(top, command.args[i + 1]);
      }
      pen += glyph.advanceWidth;
    }
    const x0 = line.x_in + left * scale - padding, x1 = line.x_in + right * scale + padding;
    const y0 = line.baseline_in - top * scale - padding, y1 = line.baseline_in - bottom * scale + padding;
    return { message: line.message, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] };
  });
}

/** Separating-axis test for two convex glyph-bound rectangles. @param {Point[]} a @param {Point[]} b */
export function overlaps(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < 2; i++) {
    const p = polygon[i], q = polygon[i + 1];
    const nx = p[1] - q[1], ny = q[0] - p[0];
    const aa = a.map(([x, y]) => x * nx + y * ny), bb = b.map(([x, y]) => x * nx + y * ny);
    if (Math.max(...aa) <= Math.min(...bb) + 1e-10 || Math.max(...bb) <= Math.min(...aa) + 1e-10) return false;
  }
  return true;
}

/** @param {Point[]} points @param {{ angle_deg: number, x_in: number, y_in: number }} rotation @returns {Point[]} */
export function rotated(points, rotation) {
  const angle = rotation.angle_deg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return points.map(([x, y]) => [rotation.x_in + c * (x - rotation.x_in) - s * (y - rotation.y_in),
    rotation.y_in + s * (x - rotation.x_in) + c * (y - rotation.y_in)]);
}

/** @param {import('./index.js').Result} result @param {Map<string, import('./fonts.js').Face>} faces */
export function rotateMessages(result, faces) {
  const boxes = inkBoxes(result, faces, 0.005);
  const max = result.request.rotation_deg;
  for (const message of result.messages) {
    const own = boxes.filter(box => box.message === message.index);
    const other = boxes.filter(box => box.message !== message.index);
    const points = own.flatMap(box => box.points);
    const x = points.map(p => p[0]), y = points.map(p => p[1]);
    const center = { x_in: (Math.min(...x) + Math.max(...x)) / 2, y_in: (Math.min(...y) + Math.max(...y)) / 2 };
    // Independent hash: changing the presentation must not consume layout/colour RNG draws.
    let hash = (Math.imul(result.request.seed ^ message.input_index, 0x45d9f3b) ^ 0x9e3779b9) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
    const sign = hash & 1 ? 1 : -1;
    const desired = max * (0.55 + (hash >>> 1) / 0x80000000 * 0.45);
    for (let angle = desired; angle >= 0.15; angle *= 0.75) {
      const rotation = { ...center, angle_deg: sign * angle };
      const candidates = own.map(box => rotated(box.points, rotation));
      if (candidates.some(polygon => polygon.some(([px, py]) => px < 0.02 || py < 0.02 || px > result.card.width_in - 0.02 || py > result.card.height_in - 0.02))) continue;
      if (candidates.some(polygon => other.some(box => overlaps(polygon, box.points)))) continue;
      message.rotation = rotation;
      own.forEach((box, i) => { box.points = candidates[i]; });
      break;
    }
  }
}
