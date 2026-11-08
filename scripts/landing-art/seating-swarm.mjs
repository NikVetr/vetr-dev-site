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


/** Cells touched by the complete swept segment bounding box.
 * @param {Point} a @param {Point} b @param {number} padding @param {number} cell
 */
function cells(a, b, padding, cell) {
  const keys = [];
  for (let x = Math.floor((Math.min(a[0], b[0]) - padding) / cell); x <= Math.floor((Math.max(a[0], b[0]) + padding) / cell); x++) {
    for (let y = Math.floor((Math.min(a[1], b[1]) - padding) / cell); y <= Math.floor((Math.max(a[1], b[1]) + padding) / cell); y++) keys.push(`${x},${y}`);
  }
  return keys;
}

/** @typedef {{node:number,time:number,key:number,cost:number}} SearchNode */
class Frontier {
  /** @type {SearchNode[]} */ entries = [];
  /** @param {SearchNode} entry */
  push(entry) {
    const h = this.entries;
    h.push(entry);
    let child = h.length - 1;
    while (child) {
      const parent = (child - 1) >> 1;
      if (h[parent].cost <= entry.cost) break;
      h[child] = h[parent]; child = parent;
    }
    h[child] = entry;
  }
  pop() {
    const h = this.entries, best = h[0], last = /** @type {SearchNode} */ (h.pop());
    if (h.length) {
      let parent = 0;
      while (2 * parent + 1 < h.length) {
        let child = 2 * parent + 1;
        if (child + 1 < h.length && h[child + 1].cost < h[child].cost) child++;
        if (h[child].cost >= last.cost) break;
        h[parent] = h[child]; parent = child;
      }
      h[parent] = last;
    }
    return best;
  }
}

class BlockedDeparture extends Error {
  /** @param {number} guest */
  constructor(guest) { super(`No timed route for guest ${guest}`); this.guest = guest; }
}

/** Deterministic space/time reservation. Stationary guests are obstacles, and every
 * moving guest may wait for a clear segment. A blocked departure moves earlier in
 * the priority order on the next bounded attempt; the actual round seats never change.
 * @param {Point[]} starts @param {Point[]} ends
 * @param {{radius:number,width:number,height:number,obstacles:Obstacle[],frames?:number}} options
 * @returns {{paths:Point[][],priorityRetries:number}}
 */
export function planSwarm(starts, ends, { radius, width, height, obstacles, frames = 100 }) {
  if (!starts.length || starts.length !== ends.length) throw new Error('Swarm requires matching endpoints');
  const gap = radius * 2 + 1.2, step = gap * 1.12, margin = radius + 1;
  const moving = starts.map((p, i) => Math.hypot(p[0] - ends[i][0], p[1] - ends[i][1]) > 1e-8);
  const blockers = [
    ...obstacles.map(o => ({ ...o, gap: o.radius + radius + 1.3 })),
    ...starts.flatMap(([x, y], i) => moving[i] ? [] : [{ x, y, radius, gap }]),
  ];
  /** @param {Point} a @param {Point} b */
  const staticFree = (a, b) => blockers.every(o => closestApproach(a, b, [o.x, o.y], [o.x, o.y]).distance >= o.gap);
  /** @type {Point[]} */ const nodes = [];
  /** @type {Map<string,number>} */ const grid = new Map();
  for (let x = margin, col = 0; x <= width - margin; x += step, col++) {
    for (let y = margin, row = 0; y <= height - margin; y += step, row++) {
      const p = /** @type {Point} */ ([x, y]);
      if (staticFree(p, p)) { grid.set(`${col},${row}`, nodes.length); nodes.push(p); }
    }
  }
  /** @type {number[][]} */ const edges = nodes.map(() => []);
  for (const [key, i] of grid) {
    const [col, row] = key.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const j = grid.get(`${col + dx},${row + dy}`);
      if (j !== undefined && staticFree(nodes[i], nodes[j])) edges[i].push(j);
    }
  }
  /** @param {Point} p */
  const connect = p => nodes.map((q, i) => ({ i, distance: Math.hypot(p[0] - q[0], p[1] - q[1]) }))
    .filter(o => o.distance < step * 2.5 && staticFree(p, nodes[o.i]))
    .sort((a, b) => a.distance - b.distance).slice(0, 12).map(o => o.i);
  const departures = starts.map((p, i) => moving[i] ? connect(p) : []);
  const arrivals = ends.map((p, i) => new Set(moving[i] ? connect(p) : []));
  for (let i = 0; i < starts.length; i++) if (moving[i] && (!departures[i].length || !arrivals[i].size)) throw new Error(`No free grid connection for guest ${i}`);
  const order = starts.map((p, i) => ({ i, distance: Math.hypot(p[0] - ends[i][0], p[1] - ends[i][1]) }))
    .filter(o => moving[o.i]).sort((a, b) => b.distance - a.distance).map(o => o.i);

  /** @returns {Point[][]} */
  const attempt = () => {
    /** @type {Map<string,number[]>[]} */ const reserved = Array.from({ length: frames }, () => new Map());
    /** @type {Point[][]} */ const result = new Array(starts.length);
    /** @param {number} i @param {Point[]} path */
    const reserve = (i, path) => {
      result[i] = path;
      for (let t = 0; t < frames; t++) for (const key of cells(path[t], path[t + 1], gap / 2, gap * 2)) {
        const occupants = reserved[t].get(key) ?? [];
        occupants.push(i); reserved[t].set(key, occupants);
      }
    };
    /** @param {Point} a @param {Point} b @param {number} t */
    const clear = (a, b, t) => {
      const near = new Set(cells(a, b, gap / 2, gap * 2).flatMap(key => reserved[t].get(key) ?? []));
      for (const i of near) if (closestApproach(a, b, result[i][t], result[i][t + 1]).distance < gap) return false;
      return true;
    };
    starts.forEach((p, i) => { if (!moving[i]) reserve(i, Array.from({ length: frames + 1 }, () => /** @type {Point} */ ([...p]))); });
    for (const i of order) {
      const startNode = nodes.length, goalNode = startNode + 1, stride = startNode + 2;
      /** @param {number} node @returns {Point} */
      const point = node => node === startNode ? starts[i] : node === goalNode ? ends[i] : nodes[node];
      // The destination must remain free after arrival, including other guests' transit.
      const safeGoal = new Uint8Array(frames + 1); safeGoal[frames] = 1;
      for (let t = frames - 1; t >= 0; t--) safeGoal[t] = Number(!!safeGoal[t + 1] && clear(ends[i], ends[i], t));
      /** @type {Map<number,number>} */ const parent = new Map();
      const seen = new Set([startNode]), frontier = new Frontier();
      const heuristic = (/** @type {number} */ node) => Math.hypot(point(node)[0] - ends[i][0], point(node)[1] - ends[i][1]) / (step * Math.SQRT2);
      frontier.push({ node: startNode, time: 0, key: startNode, cost: heuristic(startNode) });
      /** @type {SearchNode|undefined} */ let found;
      while (frontier.entries.length) {
        const current = frontier.pop();
        if (current.node === goalNode) { found = current; break; }
        if (current.time >= frames) continue;
        const next = current.node === startNode ? [startNode, ...departures[i]] : [current.node, ...edges[current.node], ...(arrivals[i].has(current.node) ? [goalNode] : [])];
        for (const node of next) {
          const time = current.time + 1, key = time * stride + node;
          if (seen.has(key) || (node === goalNode && !safeGoal[time]) || !clear(point(current.node), point(node), current.time)) continue;
          seen.add(key); parent.set(key, current.key);
          frontier.push({ node, time, key, cost: time + heuristic(node) * 1.05 + node * 1e-7 });
        }
      }
      if (!found) throw new BlockedDeparture(i);
      const path = Array.from({ length: frames + 1 }, () => /** @type {Point} */ ([...ends[i]]));
      for (let key = found.key; key !== startNode; key = /** @type {number} */ (parent.get(key))) path[Math.floor(key / stride)] = [...point(key % stride)];
      path[0] = [...starts[i]]; reserve(i, path);
    }
    return result;
  };
  for (let retries = 0; retries <= 64; retries++) {
    try { return { paths: attempt(), priorityRetries: retries }; }
    catch (error) {
      if (!(error instanceof BlockedDeparture) || retries === 64) throw error;
      order.splice(order.indexOf(error.guest), 1); order.unshift(error.guest);
    }
  }
  throw new Error('Unreachable routing state');
}

/** Soften corners only when both adjacent segments still clear every guest/table.
 * Fixed endpoints and stationary guests stay exact. No interpolation curve is invented
 * between samples: the player follows these audited linear segments.
 * @param {Point[][]} paths @param {{radius:number,width:number,height:number,obstacles:Obstacle[]}} options
 */
export function softenSwarm(paths, { radius, width, height, obstacles }) {
  const gap = 2 * radius + 1.2;
  /** @param {Point} a @param {Point} b @param {Point} c @param {Point} d */
  const mightTouch = (a, b, c, d) => Math.min(a[0], b[0]) <= Math.max(c[0], d[0]) + gap && Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) - gap && Math.min(a[1], b[1]) <= Math.max(c[1], d[1]) + gap && Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) - gap;
  for (let pass = 0; pass < 6; pass++) for (const [i, path] of paths.entries()) {
    for (let t = 1; t < path.length - 1; t++) {
      const q = /** @type {Point} */ ([0, 1].map(axis => path[t][axis] * .5 + (path[t - 1][axis] + path[t + 1][axis]) * .25));
      if (Math.hypot(q[0] - path[t][0], q[1] - path[t][1]) < .001 || q[0] < radius + 1 || q[0] > width - radius - 1 || q[1] < radius + 1 || q[1] > height - radius - 1) continue;
      let safe = true;
      for (const [a, b, frame] of /** @type {[Point,Point,number][]} */ ([[path[t - 1], q, t - 1], [q, path[t + 1], t]])) {
        for (const o of obstacles) if (closestApproach(a, b, [o.x, o.y], [o.x, o.y]).distance < radius + o.radius + 1.3) { safe = false; break; }
        if (!safe) break;
        for (const [j, other] of paths.entries()) if (j !== i && mightTouch(a, b, other[frame], other[frame + 1]) && closestApproach(a, b, other[frame], other[frame + 1]).distance < gap) { safe = false; break; }
        if (!safe) break;
      }
      if (safe) path[t] = q;
    }
  }
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
