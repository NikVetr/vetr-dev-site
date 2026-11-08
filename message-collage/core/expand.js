// Optional finishing pass: grow whole messages into spare space around their actual
// glyph bounds. The R grid layout, line breaks, typefaces and angles are retained.
import { CollageError } from './request.js';
import { inkBoxes, overlaps, rotated } from './rotation.js';

/** @typedef {import('./rotation.js').Point} Point */

/** @param {Point[]} points */
function bounds(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/** @param {ReturnType<typeof bounds>} a @param {ReturnType<typeof bounds>} b */
function separated(a, b) {
  return a.left >= b.right || a.right <= b.left || a.top >= b.bottom || a.bottom <= b.top;
}

/** Add a small clearance around a rotated rectangle. @param {Point[]} points @returns {Point[]} */
function padded(points) {
  const [a, b, , d] = points;
  const w = Math.hypot(b[0] - a[0], b[1] - a[1]), h = Math.hypot(d[0] - a[0], d[1] - a[1]);
  const u = [(b[0] - a[0]) / w, (b[1] - a[1]) / w], v = [(d[0] - a[0]) / h, (d[1] - a[1]) / h];
  return points.map(([x, y], i) => {
    const sx = i === 0 || i === 3 ? -1 : 1, sy = i < 2 ? -1 : 1;
    return [x + 0.006 * (sx * u[0] + sy * v[0]), y + 0.006 * (sx * u[1] + sy * v[1])];
  });
}

/** @param {import('./index.js').Result} result @param {Map<string, import('./fonts.js').Face>} faces */
export function expandMessages(result, faces) {
  const boxes = inkBoxes(result, faces).map(box => {
    const rotation = result.messages[box.message - 1].rotation;
    return { ...box, points: rotation ? rotated(box.points, rotation) : box.points };
  });
  const transforms = result.messages.map(() => ({ scale: 1, x: 0, y: 0 }));
  // Bottom messages tend to border the largest unused spaces. Three finite passes let
  // each benefit from neighbours' small moves, without changing the original RNG stream.
  for (let pass = 0; pass < 3; pass++) for (const message of [...result.messages].reverse()) {
    const own = boxes.filter(box => box.message === message.index);
    const other = boxes.filter(box => box.message !== message.index).map(box => ({ ...box, bounds: bounds(box.points) }));
    const box = bounds(own.flatMap(line => line.points));
    /** @param {Point[][]} polygons @param {boolean} [clearance] */
    const legal = (polygons, clearance = true) => polygons.every(polygon => {
      const shape = clearance ? padded(polygon) : polygon, b = bounds(shape), margin = clearance ? 0.025 : 0;
      return b.left >= margin && b.top >= margin && b.right <= result.card.width_in - margin && b.bottom <= result.card.height_in - margin
        && other.every(other => separated(b, other.bounds) || !overlaps(shape, other.points));
    });
    let best = { scale: 1, x: 0, y: 0, dx: 0, dy: 0, points: own.map(line => line.points), legal: legal(own.map(line => line.points), false) };
    for (const dx of [0, -0.06, 0.06, -0.12, 0.12]) for (const dy of [0, -0.06, 0.06, -0.12, 0.12]) {
      for (const x of [box.left, (box.left + box.right) / 2, box.right]) for (const y of [box.top, (box.top + box.bottom) / 2, box.bottom]) {
        /** @param {number} scale @returns {Point[][]} */
        const move = scale => own.map(line => line.points.map(([px, py]) => [x + scale * (px - x) + dx, y + scale * (py - y) + dy]));
        if (!legal(move(1))) continue;
        let lo = 1, hi = Math.min(1.45, 1.8 / transforms[message.index - 1].scale);
        for (let step = 0; step < 11; step++) {
          const scale = (lo + hi) / 2;
          if (legal(move(scale))) lo = scale;
          else hi = scale;
        }
        if (!best.legal || lo > best.scale + 1e-8) best = { scale: lo, x, y, dx, dy, points: move(lo), legal: true };
      }
    }
    own.forEach((line, i) => { line.points = best.points[i]; });
    const transform = transforms[message.index - 1], scale = best.scale;
    transform.scale *= scale;
    transform.x = scale * transform.x + (1 - scale) * best.x + best.dx;
    transform.y = scale * transform.y + (1 - scale) * best.y + best.dy;
  }
  for (const [i, box] of boxes.entries()) {
    const b = bounds(box.points);
    if (b.left < 0 || b.top < 0 || b.right > result.card.width_in || b.bottom > result.card.height_in || boxes.slice(i + 1).some(other => other.message !== box.message && overlaps(box.points, other.points))) {
      throw new CollageError('layout_collision', `Message ${result.messages[box.message - 1].input_index} has no clear space to expand; try a new seed or increase the line gaps.`);
    }
  }
  // Store the finished physical geometry directly; every renderer and the landing card
  // consumes these same positions. Original grid cells remain available for diagnostics.
  for (const message of result.messages) {
    const { scale, x, y } = transforms[message.index - 1];
    for (const line of result.lines.filter(line => line.message === message.index)) {
      line.x_in = scale * line.x_in + x;
      line.center_in = scale * line.center_in + y;
      line.baseline_in = scale * line.baseline_in + y;
      line.font_size_pt *= scale;
      line.cex *= scale;
    }
    message.font_size_pt *= scale;
    message.cex *= scale;
    message.expansion = scale;
    if (message.rotation) {
      message.rotation.x_in = scale * message.rotation.x_in + x;
      message.rotation.y_in = scale * message.rotation.y_in + y;
    }
  }
}
