// Motion arrows trace each moving phase of a demonstration in the trainer's 3-D
// scene. A phase is a stretch of one repetition in which the working joint
// travels without stopping or reversing. Its arrow is that joint's own sampled
// path, set just clear of the body, so it points and curves the way the limb
// moves. The geometry is fixed in world space for the whole phase and fades in
// and out at its ends, so the arrow neither follows the limb nor jumps.
import { movementPose, movementCycleSeconds, mixPoint } from './pose.js';
import { movementCamera, workingRegion } from './camera.js';
import { cross, scaledTo } from './movements/geometry.js';

/** @typedef {import('./pose.js').Movement} Movement */
/** @typedef {ReturnType<typeof movementPose>} Pose */
/** @typedef {import('./surface.js').SurfaceMesh} SurfaceMesh */
/** @typedef {{start:number, end:number, paths:number[][][]}} Phase */
/** @typedef {{points:number[][], strength:number, flow:number, still:boolean}} Arrow */
/** @typedef {{key:string, seconds:number, reverse:boolean}} ArrowClock */

const sub = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.map((v, i) => v - b[i]);
const dot = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (/** @type {number[]} */ a) => Math.hypot(a[0], a[1], a[2]);
const smooth = (/** @type {number} */ t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const fingertip = (/** @type {Pose['arms'][number]} */ arm) => mixPoint(arm.fingers[1][1], arm.fingers[2][1], 0.5);
const pelvis = (/** @type {Pose} */ p) => mixPoint(p.legs[0].hip, p.legs[1].hip, 0.5);

// The joints that can carry an arrow for each working region: [point, sided].
// The one that travels farthest in a repetition is traced.
/** @type {Record<string, [(p:Pose, i:number) => number[], boolean][]>} */
const candidates = {
  head: [[p => p.face, false], [p => p.crown, false]],
  shoulders: [[(p, i) => p.arms[i].shoulder, true], [(p, i) => p.arms[i].elbow, true]],
  arms: [[(p, i) => p.arms[i].palm, true], [(p, i) => p.arms[i].elbow, true]],
  wrists: [[(p, i) => p.arms[i].palm, true], [(p, i) => fingertip(p.arms[i]), true], [(p, i) => p.arms[i].thumb, true]],
  hands: [[(p, i) => fingertip(p.arms[i]), true], [(p, i) => p.arms[i].thumb, true]],
  body: [[p => p.crown, false], [p => p.neck, false], [p => p.centre, false],
    [(p, i) => p.arms[i].shoulder, true], [(p, i) => p.arms[i].palm, true],
    [(p, i) => p.legs[i].knee, true], [(p, i) => p.legs[i].toe, true]],
  pelvis: [[p => p.centre, false], [pelvis, false]],
  thighs: [[(p, i) => p.legs[i].knee, true]],
  shins: [[(p, i) => p.legs[i].ankle, true]],
  feet: [[(p, i) => p.legs[i].toe, true], [(p, i) => p.legs[i].ankle, true]],
};

const stillSpan = 0.012; // metres; less travel than this is a hold, not a movement
const minimumSpan = 0.10; // smaller paths are magnified about their centre to stay legible
// Each phase fades in, and out again, over 18% of its length, or 0.2 s if longer.
const fade = 0.18, shortestFade = 0.2;
const flowRate = 1.5; // light bands per second of demonstration time

/** @param {Movement} move */
const moveKey = (move) => [move.family, move.pose, move.motion, move.animation, move.raisedSupport, move.equipment?.join('+')].join('/');

// Sides alternate each repetition (ankle circles every two). Identify the
// repeating pattern so each distinct repetition is analysed once.
const repeats = new Map();
/** @param {Movement} move @param {number} cycle */
function repeatCycles(move, cycle) {
  const key = moveKey(move);
  if (repeats.has(key)) return repeats.get(key);
  /** @param {Pose} p */
  const joints = (p) => [p.crown, p.centre, ...p.arms.map(fingertip), ...p.legs.map((l) => l.toe)].flat();
  /** @param {number} n */
  const repeatsAfter = (n) => [0.29, 0.71].every((f) => {
    const a = joints(movementPose(move, f * cycle)), b = joints(movementPose(move, (f + n) * cycle));
    return a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  });
  const period = repeatsAfter(2) ? 2 : repeatsAfter(4) ? 4 : 0;
  repeats.set(key, period);
  return period;
}

/** @param {number[][]} path */
function span(path) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of path) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return length(sub(hi, lo));
}
/** @param {number[][]} path */
function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += length(sub(path[i], path[i - 1]));
  return total;
}

// Body volumes the arrow keeps clear of: [from, to, radius] in metres. The
// fitted skin extends beyond these joints, by up to 7 cm around the head, so
// the radii enclose nearly all sampled vertices of the three trainer bodies.
/** @param {Pose} p @returns {[number[], number[], number][]} */
function capsules(p) {
  const up = scaledTo(sub(p.crown, p.skull), 1);
  const head = p.skull.map((v, k) => v + 0.03 * up[k]);
  // The trunk is wider than it is deep: two capsules side by side.
  const across = scaledTo(sub(p.arms[1].shoulder, p.arms[0].shoulder), 0.065), hip = pelvis(p);
  /** @type {[number[], number[], number][]} */
  const list = [[head, head, 0.135], [p.arms[0].shoulder, p.arms[1].shoulder, 0.10], [p.legs[0].hip, p.legs[1].hip, 0.13]];
  for (const s of [-1, 1]) {
    const side = across.map((v) => s * v);
    list.push([p.neck.map((v, k) => v + side[k]), hip.map((v, k) => v + side[k]), 0.15]);
  }
  for (const a of p.arms) list.push([a.shoulder, a.elbow, 0.08], [a.elbow, a.wrist, 0.055],
    [a.wrist, fingertip(a), 0.07], [a.palm, a.thumb, 0.05]);
  for (const l of p.legs) list.push([l.hip, l.knee, 0.12], [l.knee, l.ankle, 0.09], [l.ankle, l.toe, 0.065]);
  return list;
}
/** Distance from a point to a capsule's surface. @param {number[]} q @param {[number[], number[], number]} capsule */
function clearance(q, [a, b, radius]) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const aqx = q[0] - a[0], aqy = q[1] - a[1], aqz = q[2] - a[2];
  const t = Math.max(0, Math.min(1, (aqx * abx + aqy * aby + aqz * abz) / (abx * abx + aby * aby + abz * abz || 1)));
  return Math.hypot(aqx - abx * t, aqy - aby * t, aqz - abz * t) - radius;
}

/** @type {number[][]} */
const directions = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1])
  if (x || y || z) directions.push(scaledTo([x, y, z], 1));
const offsets = [0.035, 0.05, 0.065, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22];
const clear = 0.018; // metres of air between the arrow's centreline and the body volumes

// Smooth and, if small, enlarge the sampled path, then move it the least
// distance that clears the body at the start, middle and end of the phase,
// preferring offsets across the line of sight of the movement's own view.
/** @param {number[][]} samples @param {Pose[]} poses @param {ReturnType<typeof shot>} camera */
function placePath(samples, poses, {view, inFrame}) {
  let path = samples.map((p) => [...p]);
  // Round off the sampling corners, keeping both ends in place.
  for (let pass = 0; pass < 2; pass++) {
    const cut = [path[0]];
    for (let i = 0; i + 1 < path.length; i++) {
      if (i > 0) cut.push(mixPoint(path[i], path[i + 1], 0.25));
      if (i + 2 < path.length) cut.push(mixPoint(path[i], path[i + 1], 0.75));
    }
    cut.push(path[path.length - 1]);
    path = cut;
  }
  const size = span(path);
  if (size < minimumSpan) {
    const centre = [0, 1, 2].map((k) => path.reduce((sum, p) => sum + p[k], 0) / path.length);
    const factor = Math.min(6, minimumSpan / size);
    path = path.map((p) => p.map((v, k) => centre[k] + (v - centre[k]) * factor));
  }
  // A full circle stops short of its own tail.
  const total = pathLength(path), grown = span(path);
  if (length(sub(path[path.length - 1], path[0])) < 0.3 * grown && total > 2.2 * grown) {
    let travelled = 0, cut = path.length;
    for (let i = 1; i < path.length; i++) {
      travelled += length(sub(path[i], path[i - 1]));
      if (travelled > 0.85 * total) { cut = i; break; }
    }
    path = path.slice(0, cut);
  }
  const chord = scaledTo(sub(path[path.length - 1], path[0]), 1);
  const along = length(sub(path[path.length - 1], path[0])) > 0.3 * span(path) ? chord : [0, 0, 0];
  const bodies = poses.flatMap(capsules);
  const probe = Array.from({length: 16}, (_, i) => path[Math.round((i * (path.length - 1)) / 15)]);
  // The smallest clearance of the shifted path, or the first one found below `need`.
  /** @param {number[]} shift @param {number} need */
  const worst = (shift, need) => {
    let least = Infinity;
    for (const p of probe) {
      const q = [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
      if (q[1] < 0.012 || !inFrame(q)) return -Infinity; // under the floor or out of the shot
      for (const capsule of bodies) {
        least = Math.min(least, clearance(q, capsule));
        if (least < need) return least;
      }
    }
    return least;
  };
  let best = null, bestScore = Infinity;
  for (const d of directions) {
    for (const distance of offsets) {
      // Behind the body from the camera is worst; in front of it hides the limb a little.
      const facing = dot(d, view);
      const score = distance + (facing < 0 ? -0.12 : 0.04) * facing + 0.08 * Math.abs(dot(d, along));
      if (score >= bestScore) break;
      if (worst(d.map((v) => v * distance), clear) >= clear) {
        best = d.map((v) => v * distance);
        bestScore = score;
        break;
      }
    }
  }
  if (!best) {
    // Nothing is fully clear: take the roomiest of the far offsets, or else the path itself.
    let roomiest = -Infinity;
    best = [0, 0, 0];
    for (const d of directions) {
      const shift = d.map((v) => v * 0.12), room = worst(shift, -Infinity) + 0.05 * dot(d, view);
      if (room > roomiest) { roomiest = room; best = shift; }
    }
  }
  const shift = /** @type {number[]} */ (best);
  return path.map((p) => p.map((v, k) => v + shift[k]));
}

// The movement's own camera: the direction toward the viewer, and whether a point
// falls inside the frame it fits to the working joints. Wider views show more.
/** @param {Movement} move */
function shot(move) {
  const {yaw, pitch, centerY, centerZ, width, height} = movementCamera(move);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return {
    view: [-sy * cp, sp, cy * cp],
    inFrame: (/** @type {number[]} */ [x, y, z]) =>
      Math.abs(x * cy + z * sy - sy * centerZ) < 0.45 * width
      && Math.abs(centerY * cp - centerZ * cy * sp - y * cp + (z * cy - x * sy) * sp) < 0.45 * height,
  };
}

const analyses = new Map();
/** The moving phases of repetition `k`, in seconds from its start.
 * @param {Movement} move @param {number} k @returns {Phase[]} */
export function motionPhases(move, k) {
  const cycle = movementCycleSeconds(move), period = repeatCycles(move, cycle);
  const slot = period ? k % period : k;
  const key = moveKey(move) + '|' + slot;
  if (analyses.has(key)) return analyses.get(key);
  const n = Math.max(36, Math.min(108, Math.round(cycle * 9))), step = cycle / n;
  const poses = Array.from({length: n + 1}, (_, j) => movementPose(move, (slot + j / n) * cycle));
  /** @type {{path:number[][], size:number, point:(p:Pose, i:number) => number[]}[]} */
  const tracks = [];
  /** @param {[(p:Pose, i:number) => number[], boolean][]} options */
  const follow = (options) => {
    for (const [point, sided] of options)
      for (const i of sided ? [0, 1] : [0]) {
        const path = poses.map((p) => point(p, i));
        tracks.push({path, size: span(path), point});
      }
    return tracks.reduce((a, b) => b.size > a.size ? b : a);
  };
  let lead = follow(candidates[workingRegion(move)] ?? candidates.body);
  // When the named region holds still, trace whatever part of the body moves.
  if (lead.size < stillSpan) lead = follow(Object.values(candidates).flat());
  /** @type {Phase[]} */
  const phases = [];
  if (lead.size >= stillSpan) {
    // A sided joint moving with its partner, like both arms in a reach, gets an arrow each.
    const traced = tracks.filter((t) => t === lead || (t.point === lead.point && t.size >= 0.6 * lead.size));
    const velocity = Array.from({length: n}, (_, j) => traced.map((t) => sub(t.path[j + 1], t.path[j]).map((v) => v / step)));
    const speed = velocity.map((v) => Math.max(...v.map(length)));
    const peak = Math.max(...speed);
    /** @param {number} a @param {number} b */
    const turning = (a, b) => velocity[a].reduce((sum, v, t) => sum + dot(v, velocity[b][t]), 0);
    const cuts = [];
    let run = -1;
    for (let j = 0; j <= n; j++) {
      const moving = j < n && speed[j] > 0.12 * peak;
      if (moving && run < 0) run = j;
      // Split a run where the joint slows to reverse its direction.
      if (moving && run >= 0 && j - run >= 2 && j + 2 < n && speed[j] <= speed[j - 1] && speed[j] <= speed[j + 1]
        && turning(j - 2, j + 2) < 0) {
        cuts.push([run, j]);
        run = j;
      }
      if (!moving && run >= 0) { cuts.push([run, j]); run = -1; }
    }
    const camera = shot(move);
    for (const [from, to] of cuts) {
      if ((to - from) * step < 0.12) continue;
      const samples = traced.map((t) => t.path.slice(from, to + 1));
      const sizes = samples.map(span), largest = Math.max(...sizes);
      if (largest < stillSpan) continue;
      const scene = [poses[from], poses[Math.round((from + to) / 2)], poses[to]];
      const paths = samples.filter((_, t) => sizes[t] >= 0.4 * largest).map((path) => placePath(path, scene, camera));
      phases.push({start: from * step, end: to * step, paths});
    }
  }
  analyses.set(key, phases);
  if (analyses.size > 24) analyses.delete(analyses.keys().next().value);
  return phases;
}

/** The arrows to draw at `seconds`. Under Still, the phase at or just before that
 * moment is shown whole and unanimated. `previous` is the last result's clock for
 * this view; demonstration time that runs backwards (a program easing out of a hold)
 * reverses the arrow, but only while it is faint at the end of a phase.
 * @param {Movement} move @param {number} seconds
 * @param {{still?:boolean, previous?:ArrowClock}} [options]
 * @returns {{arrows:Arrow[], clock:ArrowClock}} */
export function motionArrows(move, seconds, {still = false, previous} = {}) {
  const cycle = movementCycleSeconds(move);
  const k = Math.max(0, Math.floor(seconds / cycle));
  const local = seconds - k * cycle;
  const phases = motionPhases(move, k);
  const key = moveKey(move);
  let phase = phases.find((ph) => local >= ph.start && local <= ph.end);
  if (still) {
    phase ??= phases.findLast((ph) => ph.end <= local) ?? phases[0];
    return {
      arrows: phase ? phase.paths.map((points) => ({points, strength: 1, flow: 0, still: true})) : [],
      clock: {key, seconds, reverse: false},
    };
  }
  const duration = phase ? phase.end - phase.start : 1;
  const fading = Math.min(duration / 2, Math.max(fade * duration, shortestFade));
  const strength = phase ? smooth(Math.min(local - phase.start, phase.end - local) / fading) : 0;
  let reverse = false;
  if (previous?.key === key && Math.abs(seconds - previous.seconds) < 1) {
    const change = seconds - previous.seconds;
    const backwards = change < -1e-6 ? true : change > 1e-6 ? false : previous.reverse;
    reverse = strength < 0.2 ? backwards : previous.reverse;
  }
  const clock = {key, seconds, reverse};
  if (!phase || strength <= 0) return {arrows: [], clock};
  const flow = (reverse ? phase.end - local : local - phase.start) * flowRate;
  return {
    arrows: phase.paths.map((points) => ({points: reverse ? [...points].reverse() : points, strength, flow, still: false})),
    clock,
  };
}

// Evenly spaced points along a polyline, with their arc lengths.
/** @param {number[][]} path @param {number} spacing */
function resample(path, spacing) {
  const total = pathLength(path);
  const count = Math.max(2, Math.ceil(total / spacing));
  const out = [path[0]], at = [0];
  let segment = 1, before = 0;
  for (let i = 1; i <= count; i++) {
    const s = (i / count) * total;
    while (segment < path.length - 1 && before + length(sub(path[segment], path[segment - 1])) < s) {
      before += length(sub(path[segment], path[segment - 1]));
      segment++;
    }
    const piece = length(sub(path[segment], path[segment - 1])) || 1;
    out.push(mixPoint(path[segment - 1], path[segment], Math.min(1, (s - before) / piece)));
    at.push(s);
  }
  return {points: out, at, total};
}

const palettes = {
  light: {core: [0, 124, 188], glint: [0, 186, 232], halo: [0, 150, 214], alpha: 0.9, glow: 0.2},
  dark: {core: [104, 226, 255], glint: [226, 252, 255], halo: [40, 190, 255], alpha: 0.95, glow: 0.36},
};
const sides = 10;
const cosines = Array.from({length: sides}, (_, j) => Math.cos((2 * Math.PI * j) / sides));
const sines = Array.from({length: sides}, (_, j) => Math.sin((2 * Math.PI * j) / sides));

/** Add one arrow to the scene as glass: a tapered tube ending in a cone, whose
 * outline is stronger than its middle, inside a soft halo. Light bands travel
 * from tail to head unless the arrow is still.
 * @param {SurfaceMesh} mesh @param {Arrow} arrow
 * @param {{project:(p:number[])=>number[], scale:number, size:number, dark:boolean, opacity:number}} view */
export function drawArrow(mesh, arrow, {project, scale, size, dark, opacity}) {
  const palette = dark ? palettes.dark : palettes.light;
  const radius = Math.max(2.6, Math.min(6.5, 0.0085 * size)) / scale;
  const origin = project([0, 0, 0]);
  // The unit vector toward the viewer, for the glass's stronger outline.
  const toward = scaledTo([[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis) => project(axis)[2] - origin[2]), 1);
  const {points, at, total} = resample(arrow.points, Math.max(2 * radius, pathLength(arrow.points) / 90));
  if (total < 4 * radius) return;
  const headLength = Math.min(5.2 * radius, 0.4 * total), headRadius = 0.5 * headLength;
  const wavelength = 9 * radius;
  // Parallel-transported frames along the path.
  const tangents = points.map((_, i) => scaledTo(sub(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]), 1));
  let normal = cross(tangents[0], Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const frames = tangents.map((t) => {
    normal = scaledTo(sub(normal, t.map((v) => v * dot(normal, t))), 1);
    return [normal, cross(t, normal)];
  });
  /** Where the path reaches arc length s. @param {number} s */
  const frameAt = (s) => {
    let i = 1;
    while (i < at.length - 1 && at[i] < s) i++;
    const f = Math.max(0, Math.min(1, (s - at[i - 1]) / ((at[i] - at[i - 1]) || 1)));
    return {centre: mixPoint(points[i - 1], points[i], f), tangent: tangents[i], frame: frames[i]};
  };
  const neck = total - headLength;
  /** @type {{centre:number[], tangent:number[], frame:number[][], r:number, slope:number, s:number, head:boolean}[]} */
  const rings = [];
  for (let i = 0; i < points.length && at[i] < neck; i++)
    rings.push({centre: points[i], tangent: tangents[i], frame: frames[i], s: at[i], head: false, slope: 0,
      r: radius * (0.4 + 0.6 * smooth(at[i] / (0.3 * total)))});
  const base = frameAt(neck);
  rings.push({...base, r: radius, s: neck, head: false, slope: 0});
  for (const f of [0, 0.34, 0.67, 1]) {
    const s = neck + f * headLength;
    rings.push({...frameAt(Math.min(s, total)), r: headRadius * (1 - f), s, head: true, slope: headRadius / headLength});
  }
  const fadeIn = arrow.strength * opacity;
  const tube = {points: [[rings[0].centre]], colors: [[[...palette.core, 0]]]};
  const halo = {points: [[rings[0].centre]], colors: [[[...palette.halo, 0]]]};
  for (const ring of rings) {
    if (ring.r === 0) {
      tube.points.push([ring.centre]);
      tube.colors.push([[...palette.core, fadeIn * palette.alpha]]);
      halo.points.push([ring.centre]);
      halo.colors.push([[...palette.halo, 0]]);
      continue;
    }
    const band = arrow.still ? 0.5 : 0.5 + 0.5 * Math.cos(2 * Math.PI * (ring.s / wavelength - arrow.flow));
    const [n, b] = ring.frame, c = ring.centre;
    // How squarely each vertex faces the viewer, from the ring's frame.
    const towardN = dot(n, toward), towardB = dot(b, toward), towardT = ring.slope * dot(ring.tangent, toward);
    const norm = Math.sqrt(1 + ring.slope * ring.slope);
    const shine = ring.head ? 0.25 : arrow.still ? 0.2 : 0.55 * band;
    const color = palette.core.map((v, k) => v + (palette.glint[k] - v) * shine);
    const stripe = ring.head ? 1 : 0.6 + 0.4 * band, glow = ring.head ? 1 : 0.75 + 0.25 * band;
    const outer = ring.r * (ring.head ? 1.8 : 2.1);
    const tubeRing = [], tubeColors = [], haloRing = [], haloColors = [];
    for (let j = 0; j < sides; j++) {
      const cos = cosines[j], sin = sines[j];
      const rx = cos * n[0] + sin * b[0], ry = cos * n[1] + sin * b[1], rz = cos * n[2] + sin * b[2];
      const facing = Math.abs(cos * towardN + sin * towardB + towardT) / norm;
      tubeRing.push([c[0] + rx * ring.r, c[1] + ry * ring.r, c[2] + rz * ring.r]);
      tubeColors.push([color[0], color[1], color[2], fadeIn * palette.alpha * (0.5 + 0.5 * (1 - facing) ** 1.5) * stripe]);
      haloRing.push([c[0] + rx * outer, c[1] + ry * outer, c[2] + rz * outer]);
      haloColors.push([palette.halo[0], palette.halo[1], palette.halo[2], fadeIn * palette.glow * facing * facing * glow]);
    }
    tube.points.push(tubeRing);
    tube.colors.push(tubeColors);
    halo.points.push(haloRing);
    halo.colors.push(haloColors);
  }
  mesh.glass(tube.points, tube.colors);
  mesh.glass(halo.points, halo.colors);
}
