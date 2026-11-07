// Offline presentation paths, independent of the seating optimizer. The constraints apply
// to entire linear segments, including the time between emitted CSS keyframes.
/** @typedef {[number, number]} Point */
/** @typedef {{x:number,y:number,radius:number}} Obstacle */

/** Closest approach of two synchronized linear segments. @param {Point} a @param {Point} b @param {Point} c @param {Point} d */
export function closestApproach(a, b, c, d) {
  const x = a[0] - c[0], y = a[1] - c[1];
  const vx = b[0] - a[0] - d[0] + c[0], vy = b[1] - a[1] - d[1] + c[1];
  const speed = vx * vx + vy * vy;
  const time = speed ? Math.max(0, Math.min(1, -(x * vx + y * vy) / speed)) : 0;
  return { time, x: x + vx * time, y: y + vy * time, distance: Math.hypot(x + vx * time, y + vy * time), vx, vy };
}

/** Build a swarm transition, with endpoints fixed to actual seat assignments.
 * @param {Point[]} starts @param {Point[]} ends
 * @param {{radius:number,width:number,height:number,obstacles:Obstacle[],frames?:number}} options
 */
export function planSwarm(starts, ends, { radius, width, height, obstacles, frames = 100 }) {
  if (starts.length !== ends.length || !starts.length) throw new Error('Swarm requires matching endpoints');
  const clearance = radius * 2 + 1.2;
  // A gentle alternating bend breaks head-on symmetry before geometric relaxation.
  const paths = starts.map((a, i) => Array.from({ length: frames + 1 }, (_, frame) => {
    const t = frame / frames, bend = Math.sin(Math.PI * t) * 15;
    const angle = i * 2.399963229728653;
    return /** @type {Point} */ ([a[0] * (1 - t) + ends[i][0] * t + Math.cos(angle) * bend, a[1] * (1 - t) + ends[i][1] * t + Math.sin(angle) * bend]);
  }));
  // Move the adjacent keyframe points enough to separate their interpolated positions.
  const correct = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number} */ frame, /** @type {ReturnType<typeof closestApproach>} */ near, /** @type {number} */ gap) => {
    const u = frame > 0 ? 1 - near.time : 0, v = frame + 1 < frames ? near.time : 0;
    const denominator = (u * u + v * v) * (j < 0 ? 1 : 2);
    if (!denominator) throw new Error('Fixed swarm endpoints overlap');
    const normal = near.distance > 1e-8 ? [near.x / near.distance, near.y / near.distance] : Math.hypot(near.vx, near.vy) > 1e-8 ? [-near.vy / Math.hypot(near.vx, near.vy), near.vx / Math.hypot(near.vx, near.vy)] : [Math.cos(i + frame), Math.sin(i + frame)];
    const push = (gap - near.distance + 0.001) / denominator;
    for (const [k, weight] of [[frame, u], [frame + 1, v]]) for (let axis = 0; axis < 2; axis++) {
      paths[i][k][axis] += normal[axis] * push * weight;
      if (j >= 0) paths[j][k][axis] -= normal[axis] * push * weight;
    }
  };
  let worst = Infinity;
  for (let pass = 0; pass < 1200; pass++) {
    // Smooth the route while settling; the final passes only enforce separation.
    if (pass < 500) for (const path of paths) for (let frame = 1; frame < frames; frame++) for (let axis = 0; axis < 2; axis++) path[frame][axis] += 0.12 * ((path[frame - 1][axis] + path[frame + 1][axis]) / 2 - path[frame][axis]);
    worst = 0;
    for (let frame = 0; frame < frames; frame++) {
      for (let i = 0; i < paths.length; i++) {
        for (let j = i + 1; j < paths.length; j++) {
          const near = closestApproach(paths[i][frame], paths[i][frame + 1], paths[j][frame], paths[j][frame + 1]);
          if (near.distance < clearance) { worst = Math.max(worst, clearance - near.distance); correct(i, j, frame, near, clearance); }
        }
        for (const obstacle of obstacles) {
          const p = /** @type {Point} */ ([obstacle.x, obstacle.y]);
          const near = closestApproach(paths[i][frame], paths[i][frame + 1], p, p);
          const gap = radius + obstacle.radius + 1.3;
          if (near.distance < gap) { worst = Math.max(worst, gap - near.distance); correct(i, -1, frame, near, gap); }
        }
      }
    }
    for (const path of paths) for (let frame = 1; frame < frames; frame++) {
      path[frame][0] = Math.max(radius + 1, Math.min(width - radius - 1, path[frame][0]));
      path[frame][1] = Math.max(radius + 1, Math.min(height - radius - 1, path[frame][1]));
    }
    if (pass >= 500 && worst < 0.001) break;
  }
  if (worst >= 0.001) throw new Error(`Swarm routes did not separate: ${worst.toFixed(4)} px penetration`);
  return paths;
}

/** Audit complete paths, including the interior of every synchronized segment.
 * Radii should include visible strokes. This runs again after SVG coordinate rounding.
 * @param {Point[][]} paths
 * @param {{radius:number,width:number,height:number,obstacles:Obstacle[]}} options
 */
export function validateSwarm(paths, { radius, width, height, obstacles }) {
  let guestGap = Infinity, tableGap = Infinity, maxStep = 0;
  const frames = paths[0]?.length;
  if (!frames || frames < 2 || paths.some(path => path.length !== frames)) throw new Error('Swarm paths need a shared timeline');
  for (const path of paths) for (const [x, y] of path) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < radius || x > width - radius || y < radius || y > height - radius) throw new Error('Swarm path leaves the visible canvas');
  }
  for (let frame = 0; frame < frames - 1; frame++) for (let i = 0; i < paths.length; i++) {
    const [a, b] = [paths[i][frame], paths[i][frame + 1]];
    maxStep = Math.max(maxStep, Math.hypot(b[0] - a[0], b[1] - a[1]));
    for (let j = i + 1; j < paths.length; j++) guestGap = Math.min(guestGap, closestApproach(a, b, paths[j][frame], paths[j][frame + 1]).distance - 2 * radius);
    for (const obstacle of obstacles) {
      const p = /** @type {Point} */ ([obstacle.x, obstacle.y]);
      tableGap = Math.min(tableGap, closestApproach(a, b, p, p).distance - radius - obstacle.radius);
    }
  }
  if (guestGap < 0.2 || tableGap < 0.2) throw new Error(`Swarm paths collide: guest clearance ${guestGap}, table clearance ${tableGap}`);
  return { guestGap, tableGap, maxStep };
}
