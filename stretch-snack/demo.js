// Orthographic figure with articulated limbs. World-space props, body and
// annotations share the same camera in the editor and during playback.
import { movementPose, mixPoint } from './pose.js';

/** @type {Record<string,string>} */
const regions = {
  'neck-turn': 'head',
  'neck-tilt': 'head',
  'shoulder-roll': 'shoulders',
  'shoulder-squeeze': 'shoulders',
  'chest-open': 'shoulders',
  'elbow-bend': 'arms',
  'band-open': 'arms',
  'overhead-reach': 'arms',
  'palm-turn': 'hands',
  'hand-open': 'hands',
  'towel-grip': 'hands',
  'wrist-bend': 'hands',
  'wrist-stretch': 'hands',
  'side-bend': 'body',
  'trunk-turn': 'body',
  'pelvic-tilt': 'pelvis',
  'seated-march': 'thighs',
  'hip-side': 'thighs',
  'knee-extend': 'shins',
  'knee-bend': 'thighs',
  'step-up': 'thighs',
  'heel-slide': 'shins',
  'knee-roll': 'thighs',
  'heel-lift': 'feet',
  'toe-lift': 'feet',
  'calf-stretch': 'shins',
  'foot-roll': 'feet',
};

/** @param {number[]} point */
const offset = (point, x = 0, y = 0, z = 0) => [point[0] + x, point[1] + y, point[2] + z];
const skin = ['#c5ab90', '#e4bd9b', '#a9816d'];
const shirt = ['#307975', '#68a59c', '#265956'];
const trousers = ['#45616b', '#6f8c8e', '#30474f'];
const amber = ['#cb763c', '#f2b55f', '#a2572d'];
const boot = ['#395157', '#627a77', '#243e41'];
const chair = ['#9bb6a6', '#b5cbb7', '#7f9d8d'];

/** @param {HTMLCanvasElement} canvas
 * @param {{motion:string, pose:string, equipment?:string[], name?:string}} move
 * @param {number} seconds @param {{location?:string,dark?:boolean}} [options] */
export function renderMovement(canvas, move, seconds, options = {}) {
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixels = Math.round(width * ratio),
    rows = Math.round(height * ratio);
  if (canvas.width !== pixels || canvas.height !== rows) {
    canvas.width = pixels;
    canvas.height = rows;
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx = context;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const dark = options.dark ?? false,
    seated = move.pose === 'seated',
    floor = move.pose === 'supine';
  const group = regions[move.motion];
  const handDetail = group === 'hands' && width >= 230;
  // A three-quarter view preserves clearance and reveals the lower legs in a seat.
  const yaw = floor ? 1.1 : group === 'head' ? -0.34 : -0.6;
  const pitch = floor ? 0.4 : 0.15;
  const scale = Math.min(
    height / (floor ? 0.98 : seated ? 1.84 : 2.15),
    width / (floor ? 2.32 : handDetail ? 2.35 : 1.67),
  );
  const originX = width * (handDetail ? 0.39 : 0.5) + (floor ? 0.04 : 0.08) * scale;
  const originY = height / 2 + scale * (floor ? 0.28 : seated ? 0.68 : 0.875);
  /** @param {number[]} point */
  const project = ([x, y, z]) => {
    const depth = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return [
      originX + (x * Math.cos(yaw) + z * Math.sin(yaw)) * scale,
      originY + (-y * Math.cos(pitch) + depth * Math.sin(pitch)) * scale,
      depth * Math.cos(pitch) + y * Math.sin(pitch),
    ];
  };
  // Render separately ordered primitives, so a raised wrist or knee can pass
  // in front of the trunk while the far limbs remain behind it.
  /** @type {{depth:number, paint:()=>void}[]} */
  const queue = [];
  /** @param {number[]} a @param {number[]} b @param {number} r1 @param {number} r2 @param {string[]} material */
  function line(a, b, r1, r2, material, layer = 0) {
    const p = project(a),
      q = project(b);
    queue.push({
      depth: (p[2] + q[2]) / 2 + layer,
      paint: () => {
        const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
        const nx = -Math.sin(angle),
          ny = Math.cos(angle),
          r = r1 * scale,
          end = r2 * scale;
        const grad = ctx.createLinearGradient(p[0] - nx * r, p[1] - ny * r, p[0] + nx * r, p[1] + ny * r);
        const lit = nx + ny >= 0;
        grad.addColorStop(0, material[lit ? 1 : 2]);
        grad.addColorStop(0.55, material[0]);
        grad.addColorStop(1, material[lit ? 2 : 1]);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p[0], p[1], r, angle + Math.PI / 2, angle + (3 * Math.PI) / 2);
        ctx.arc(q[0], q[1], end, angle - Math.PI / 2, angle + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
      },
    });
  }
  /** @param {number[]} at @param {number} rx @param {number} ry @param {string[]} material */
  function oval(at, rx, ry, material, angle = 0, layer = 0) {
    const [x, y, z] = project(at),
      r = rx * scale,
      h = ry * scale;
    queue.push({
      depth: z + layer,
      paint: () => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.scale(r, h);
        const grad = ctx.createRadialGradient(-0.32, -0.4, 0.07, 0.08, 0.08, 1.23);
        grad.addColorStop(0, material[1]);
        grad.addColorStop(0.63, material[0]);
        grad.addColorStop(1, material[2]);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    });
  }
  /** @param {number[][]} points @param {string} color */
  function face(points, color, layer = 0) {
    const projected = points.map(project);
    queue.push({
      depth: projected.reduce((sum, p) => sum + p[2], 0) / points.length + layer,
      paint: () => {
        ctx.beginPath();
        projected.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.55;
        ctx.stroke();
      },
    });
  }
  /** @param {number} x @param {number} y @param {number} z @param {number} dx @param {number} dy @param {number} dz @param {string[]} material */
  function block(x, y, z, dx, dy, dz, material, layer = 0) {
    const top = [
      [x, y + dy, z],
      [x + dx, y + dy, z],
      [x + dx, y + dy, z + dz],
      [x, y + dy, z + dz],
    ];
    face(top, material[1], layer);
    face([top[3], top[2], [x + dx, y, z + dz], [x, y, z + dz]], material[0], layer);
    const edge = yaw < 0 ? x + dx : x;
    face(
      [
        [edge, y + dy, z],
        [edge, y + dy, z + dz],
        [edge, y, z + dz],
        [edge, y, z],
      ],
      material[2],
      layer,
    );
  }
  const p = movementPose(move, seconds);
  /** @param {string} region @param {string[]} fallback */
  const shade = (region, fallback) => (group === region ? amber : fallback);
  const shadow = project([0, 0.01, floor ? 0.05 : 0.1]);
  ctx.beginPath();
  ctx.ellipse(
    shadow[0],
    shadow[1],
    scale * (floor ? 0.9 : 0.44),
    scale * (floor ? 0.105 : 0.08),
    floor ? -0.06 : 0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = dark ? 'rgba(0,0,0,.23)' : 'rgba(52,83,68,.13)';
  ctx.fill();
  if (seated) {
    block(-0.27, 0.395, -0.18, 0.54, 0.065, 0.55, chair, -0.12);
    block(-0.256, 0.46, -0.195, 0.512, 0.48, 0.05, chair, -0.24);
    for (const s of [-1, 1])
      for (const z of [-0.12, 0.29]) line([s * 0.205, 0.4, z], [s * 0.205, 0.025, z], 0.019, 0.014, chair, -0.18);
    if (['plane-seat', 'train-seat'].includes(options.location || ''))
      for (const s of [-1, 1]) {
        line([s * 0.27, 0.61, -0.14], [s * 0.27, 0.61, 0.24], 0.018, 0.021, chair);
        line([s * 0.27, 0.42, 0.18], [s * 0.27, 0.61, 0.18], 0.012, 0.012, chair);
      }
  }
  if (floor) block(-0.37, -0.022, -0.95, 0.74, 0.025, 2.03, chair, -1.1);
  if (move.motion === 'step-up') block(-0.28, 0, 0.24, 0.56, 0.14, 0.38, chair);
  if (
    move.pose === 'standing' &&
    ['hip-side', 'calf-stretch', 'knee-bend', 'heel-lift', 'step-up'].includes(move.motion)
  ) {
    const x = 0.32;
    line([x, 0.02, 0.27], [x, 1.055, 0.27], 0.016, 0.018, chair, -0.14);
    line([x, 1.055, 0.03], [x, 1.055, 0.55], 0.019, 0.019, chair, -0.11);
  }
  const hips = mixPoint(p.legs[0].hip, p.legs[1].hip, 0.5);
  for (const leg of p.legs) {
    line(leg.hip, leg.knee, 0.087, 0.063, shade('thighs', trousers));
    line(leg.knee, leg.ankle, 0.056, 0.032, shade('shins', trousers));
    line(leg.ankle, leg.toe, 0.037, 0.042, shade('feet', boot), 0.013);
  }
  if (move.motion === 'foot-roll') {
    const leg = p.legs[p.side === 1 ? 1 : 0];
    const pivot = offset(leg.ankle, 0, -0.072, 0.09 - 0.08 * p.a);
    if (move.equipment?.includes('roller'))
      line(offset(pivot, -0.095), offset(pivot, 0.095), 0.041, 0.041, amber, -0.022);
    else oval(pivot, 0.04, 0.04, amber, 0, -0.02);
  }
  // Rounded torso silhouette narrows at the waist; the shoulders follow each
  // other through a twist. Paint belts of facets from hip to collar.
  const torso = shade('body', shirt);
  const rings = [
    [0, 0.133, 0.098],
    [0.16, 0.15, 0.104],
    [0.5, 0.145, 0.099],
    [0.79, 0.169, 0.12],
    [0.93, 0.187, 0.109],
    [1, 0.097, 0.075],
  ];
  const shoulderLine = p.arms[1].shoulder.map((x, i) => x - p.arms[0].shoulder[i]);
  const len = Math.hypot(...shoulderLine);
  const horizontal = shoulderLine.map((v) => v / len);
  /** @param {number[]} ring @param {number} angle */
  const ringPoint = ([t, w, d], angle) => {
    const mid = mixPoint(hips, p.neck, t),
      dx = Math.cos(angle) * w,
      dz = Math.sin(angle) * d;
    if (floor && move.motion === 'pelvic-tilt' && t < 0.66) {
      // In the relaxed pose there is a small space under the lower back.
      // The tilt closes that space while the sacrum stays on the mat.
      mid[1] += Math.sin((t / 0.66) * Math.PI) * 0.034 * (1 - p.a);
    }
    return offset(
      mid,
      horizontal[0] * dx - horizontal[2] * dz,
      horizontal[1] * dx + (floor ? dz : 0),
      horizontal[2] * dx + (floor ? 0 : horizontal[0] * dz),
    );
  };
  for (let j = 1; j < rings.length; j++)
    for (let k = 0; k < 16; k++) {
      const t = (k * Math.PI) / 8,
        u = ((k + 1) * Math.PI) / 8;
      const material = j === 1 ? shade('pelvis', trousers) : torso;
      face(
        [ringPoint(rings[j - 1], t), ringPoint(rings[j - 1], u), ringPoint(rings[j], u), ringPoint(rings[j], t)],
        material[Math.cos(t + 0.64) > 0.53 ? 1 : Math.cos(t + 0.64) < -0.52 ? 2 : 0],
      );
    }
  line(p.neck, mixPoint(p.neck, p.skull, 0.75), 0.045, 0.046, skin);
  const headAngle = floor
    ? 1.32
    : Math.atan2(project(p.crown)[0] - project(p.skull)[0], project(p.skull)[1] - project(p.crown)[1]);
  oval(p.skull, 0.088, 0.116, shade('head', skin), headAngle);
  // Nose and ears make a left/right head turn visible on a featureless figure.
  oval(p.face, 0.018, 0.021, shade('head', skin), 0, 0.037);
  for (const eye of p.eyes) oval(eye, 0.006, 0.007, boot, 0, 0.015);
  for (const arm of p.arms) {
    line(arm.shoulder, mixPoint(arm.shoulder, arm.elbow, 0.48), 0.066, 0.055, shade('shoulders', shirt));
    line(mixPoint(arm.shoulder, arm.elbow, 0.52), arm.elbow, 0.047, 0.04, shade('arms', skin));
    line(arm.elbow, arm.wrist, 0.041, 0.027, shade('arms', skin));
    line(arm.wrist, arm.palm, 0.025, 0.031, shade('hands', skin), 0.01);
    for (const [base, tip] of arm.fingers) line(base, tip, 0.009, 0.006, shade('hands', skin), 0.012);
    line(arm.palm, arm.thumb, 0.014, 0.009, shade('hands', skin), 0.015);
  }
  if (move.motion === 'band-open') line(p.arms[0].palm, p.arms[1].palm, 0.008, 0.008, amber, 0.055);
  if (move.motion === 'towel-grip') {
    const grip = p.arms[p.side === 1 ? 1 : 0].palm;
    line(offset(grip, -0.043, -0.018, 0), offset(grip, 0.043, -0.018, 0), 0.018, 0.022, chair, 0.022);
  }
  for (const { paint } of queue.sort((a, b) => a.depth - b.depth)) paint();
  drawCue(ctx, move, p, project, scale, width, height, handDetail, dark);
}

/** @param {CanvasRenderingContext2D} ctx @param {{motion:string, pose:string}} move @param {ReturnType<typeof movementPose>} pose @param {(p:number[])=>number[]} project @param {number} scale @param {number} width @param {number} height @param {boolean} detail @param {boolean} dark */
function drawCue(ctx, move, pose, project, scale, width, height, detail, dark) {
  const group = regions[move.motion],
    arm = pose.arms[pose.side === 1 ? 1 : 0],
    leg = pose.legs[pose.side === 1 ? 1 : 0];
  /** @type {Record<string,number[]>} */
  const anchors = {
    head: pose.skull,
    shoulders: arm.shoulder,
    arms: arm.elbow,
    hands: arm.palm,
    body: pose.centre,
    pelvis: leg.hip,
    thighs: leg.knee,
    shins: leg.ankle,
    feet: leg.toe,
  };
  const [x, y] = project(anchors[group] ?? pose.centre);
  const ink = dark ? '#ffcd84' : '#8b4e22';
  ctx.save();
  ctx.lineWidth = Math.max(1.45, scale * 0.009);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (detail) {
    const radius = Math.min(height * 0.19, width * 0.112),
      cx = width * 0.77,
      cy = height * 0.53;
    ctx.beginPath();
    ctx.moveTo(x + 3, y);
    ctx.lineTo(cx - radius, cy);
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = dark ? '#213731' : '#edf2e7';
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.clip();
    const exaggeration = radius / (scale * 0.118);
    /** @param {number[]} point */
    const handPoint = (point) => {
      const [u, v] = project(point);
      return [cx + (u - x) * exaggeration, cy + (v - y) * exaggeration];
    };
    /** @param {number[]} from @param {number[]} to @param {number} thickness @param {string} color */
    const segment = (from, to, thickness, color) => {
      const [u, v] = handPoint(from),
        [q, r] = handPoint(to);
      ctx.beginPath();
      ctx.moveTo(u, v);
      ctx.lineTo(q, r);
      ctx.lineWidth = thickness * radius;
      ctx.strokeStyle = color;
      ctx.stroke();
    };
    segment(arm.elbow, arm.wrist, 0.4, '#a88c71');
    segment(arm.wrist, arm.palm, 0.48, '#c48652');
    for (const [base, tip] of arm.fingers) segment(base, tip, 0.14, '#d49b62');
    segment(arm.palm, arm.thumb, 0.19, '#ad724b');
    if (move.motion === 'towel-grip')
      segment(offset(arm.palm, 0, -0.016, -0.005), offset(arm.palm, -arm.s * 0.12, -0.016, -0.005), 0.22, '#7c9c8f');
    ctx.restore();
  } else if (move.motion === 'pelvic-tilt') {
    const [u, v] = project(pose.centre);
    arrow(ctx, u - scale * 0.04, v - scale * 0.22, u - scale * 0.018, v - scale * 0.12, 0.18, scale);
  } else if (move.motion === 'shoulder-squeeze') {
    for (const s of [-1, 1]) {
      const [u, v] = project(pose.arms[s === 1 ? 1 : 0].shoulder);
      arrow(ctx, u + s * scale * 0.15, v - scale * 0.073, u + s * scale * 0.068, v - scale * 0.041, 0, scale);
    }
  } else {
    // Direction of the highlighted joint relative to its relaxed pose,
    // independent of the sampled display frame.
    const start = movementPose(move, pose.side === -1 ? 0 : 4);
    const peak = movementPose(move, pose.side === -1 ? 2 : 6);
    /** @param {ReturnType<typeof movementPose>} frame */
    const pointAt = (frame) => {
      const a = frame.arms[pose.side === 1 ? 1 : 0],
        l = frame.legs[pose.side === 1 ? 1 : 0];
      switch (group) {
        case 'head':
          return move.motion === 'neck-turn' ? frame.face : frame.crown;
        case 'arms':
          return a.wrist;
        case 'shoulders':
          return move.motion === 'chest-open' ? a.elbow : a.shoulder;
        case 'body':
          return a.shoulder;
        case 'thighs':
          return l.knee;
        case 'shins':
          return l.ankle;
        default:
          return move.motion === 'heel-lift' ? l.ankle : l.toe;
      }
    };
    const a = project(pointAt(start)),
      b = project(pointAt(peak));
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      distance = Math.hypot(dx, dy);
    if (distance > scale * 0.007) {
      const dt = Math.min(0.215 * scale, Math.max(0.107 * scale, distance));
      const ox = x + (x > width * 0.5 ? 1 : -1) * scale * (group === 'head' ? 0.16 : 0.093);
      const oy = y - (group === 'head' ? 0.06 : 0.048) * scale;
      arrow(
        ctx,
        ox - ((dx / distance) * dt) / 2,
        oy - ((dy / distance) * dt) / 2,
        ox + ((dx / distance) * dt) / 2,
        oy + ((dy / distance) * dt) / 2,
        0.26,
        scale,
      );
    }
  }
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {number} bend @param {number} scale */
function arrow(ctx, x1, y1, x2, y2, bend, scale) {
  const dx = x2 - x1,
    dy = y2 - y1,
    r = Math.hypot(dx, dy);
  const cx = (x1 + x2) / 2 + dy * bend,
    cy = (y1 + y2) / 2 - dx * bend;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - cy, x2 - cx);
  const tip = Math.min(r * 0.48, Math.max(3.8, scale * 0.038));
  ctx.beginPath();
  ctx.moveTo(x2 - tip * Math.cos(angle - 0.54), y2 - tip * Math.sin(angle - 0.54));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - tip * Math.cos(angle + 0.54), y2 - tip * Math.sin(angle + 0.54));
  ctx.stroke();
}
