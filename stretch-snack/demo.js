// The camera is fixed throughout a repetition, including a change of working side.
// All three views use the same posed mesh and depth-tested studio renderer.
import { movementPose, mixPoint } from './pose.js';
import { drawTrainer, drawHandDetail } from './trainer.js';
import { backBallCenter, backBallRadius, drawEquipment, drawTowel } from './equipment.js';
import { drawSurface } from './surface.js';

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
  'chin-tuck': 'head',
  'self-hug': 'wrists',
  'glute-squeeze': 'pelvis',
  'knee-squeeze': 'thighs',
  'quad-set': 'thighs',
  'foot-slide': 'shins',
  'ankle-circle': 'feet',
  'seated-pelvic-tilt': 'pelvis',
  'back-round': 'body',
  'back-arch': 'body',
  'weight-shift': 'pelvis',
  'palm-forward': 'wrists',
  'ball-back': 'body',
  'hamstring-lean': 'body',
};

// Profile views expose the fore/aft glide, trunk hinge and the actual contact
// between the ball, the upper back and the chair. View the glutes from behind.
const sideViews = {
  'ball-back': 1.55, 'chin-tuck': 1.12, 'back-round': 1.08, 'back-arch': 1.06,
  'seated-pelvic-tilt': 1.08, 'hamstring-lean': 1.04, 'glute-squeeze': 2.05,
};
const isometric = new Set(['glute-squeeze', 'knee-squeeze', 'quad-set']);

/** @param {HTMLCanvasElement} canvas
 * @param {{motion:string,pose:string,equipment?:string[],name?:string}} move
 * @param {number} seconds @param {{location?:string,dark?:boolean,preview?:boolean,seatedSequence?:boolean,cueOpacity?:number}} [options] */
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
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const seated = move.pose === 'seated',
    floor = move.pose === 'supine';
  const handDetail = !options.preview && regions[move.motion] === 'hands' && width >= 230;
  const reach = options.seatedSequence || move.motion === 'overhead-reach';
  const frontSeat = move.motion === 'hamstring-lean' || move.motion === 'quad-set';
  const sideLabel = !options.preview && (isometric.has(move.motion) || move.motion === 'ball-back');
  // Reserve some space beside the trainer for the annotation in a small well.
  const labelRoom = sideLabel && width < 300 && width < height * 2 ? Math.min(30, width * 0.15) : 0;
  // The sequence needs one view that shows both hands and the extending lower leg.
  const yaw = options.seatedSequence ? 0.93 : sideViews[move.motion] ?? (floor ? 1.22 : regions[move.motion] === 'head' ? 0.32 : 0.58);
  const pitch = floor ? 0.32 : 0.095;
  const cosYaw = Math.cos(yaw),
    sinYaw = Math.sin(yaw),
    cosPitch = Math.cos(pitch),
    sinPitch = Math.sin(pitch);
  const standingLift = move.motion === 'step-up' ? 0.16 : move.motion === 'heel-lift' ? 0.08 : 0;
  const stageHeight = floor ? 0.94 : seated ? (reach ? 1.81 : 1.49) : 1.88 + standingLift;
  const stageWidth = floor ? 2.36 : handDetail ? 1.85 : frontSeat ? 1.52 : options.preview ? 0.96 : 1.34;
  const scale = Math.min(height / stageHeight, (width - labelRoom) / stageWidth);
  const centerY = floor ? 0.22 : seated ? (reach ? 0.82 : 0.675) : 0.86 + standingLift / 2;
  const centerZ = floor ? 0.012 : frontSeat ? 0.41 : seated ? 0.2 : 0.06;
  const originX = width * (handDetail ? 0.37 : 0.5) + labelRoom - sinYaw * centerZ * scale;
  const originY = height * 0.5 + (centerY * cosPitch - centerZ * cosYaw * sinPitch) * scale;
  const project = ([x, y, z]) => {
    const depth = -x * sinYaw + z * cosYaw;
    return [
      originX + (x * cosYaw + z * sinYaw) * scale,
      originY + (-y * cosPitch + depth * sinPitch) * scale,
      depth * cosPitch + y * sinPitch,
    ];
  };
  const pose = movementPose(move, seconds);
  const [sx, sy] = project([0, 0, floor ? 0.02 : seated ? 0.12 : 0.1]);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale * (floor ? 1.02 : seated ? 0.48 : 0.43), scale * (floor ? 0.12 : 0.075));
  const shade = ctx.createRadialGradient(0, 0, 0.12, 0, 0, 1);
  shade.addColorStop(0, options.dark ? 'rgba(0,0,0,.29)' : 'rgba(57,79,77,.20)');
  shade.addColorStop(1, 'rgba(57,79,77,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
  drawSurface(ctx, width, height, project, (mesh) => {
    drawEquipment(mesh, pose, move, options.location, seconds);
    drawTrainer(mesh, pose, move);
  });
  const opacity = options.cueOpacity ?? 1;
  if (!options.preview && opacity > 0)
    drawCue(ctx, move, pose, project, scale, width, height, handDetail, options.dark ?? false, seconds, opacity);
}

/** @param {CanvasRenderingContext2D} ctx @param {{motion:string, pose:string}} move @param {ReturnType<typeof movementPose>} pose @param {(p:number[])=>number[]} project @param {number} scale @param {number} width @param {number} height @param {boolean} detail @param {boolean} dark @param {number} seconds @param {number} opacity */
function drawCue(ctx, move, pose, project, scale, width, height, detail, dark, seconds, opacity) {
  const group = regions[move.motion],
    arm = pose.arms[pose.side === 1 ? 1 : 0],
    leg = pose.legs[pose.side === 1 ? 1 : 0];
  /** @type {Record<string,number[]>} */
  const anchors = {
    head: pose.skull,
    shoulders: arm.shoulder,
    arms: arm.elbow,
    hands: arm.palm,
    wrists: arm.wrist,
    body: pose.centre,
    pelvis: leg.hip,
    thighs: leg.knee,
    shins: leg.ankle,
    feet: leg.toe,
  };
  const [x, y] = project(anchors[group] ?? pose.centre);
  const ink = dark ? '#ffcd84' : '#8b4e22';
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineWidth = Math.max(1.25, scale * 0.006);
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
    ctx.globalAlpha = 0.55 * opacity;
    ctx.stroke();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = dark ? '#213731' : '#edf2e7';
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.clip();
    const detailScale = radius / (scale * 0.138);
    const zoom = (point) => {
      const [u, v, z] = project(point);
      return [cx + (u - x) * detailScale, cy + (v - y) * detailScale, z];
    };
    drawSurface(ctx, width, height, zoom, (mesh) => {
      drawHandDetail(mesh, pose.side);
      if (move.motion === 'towel-grip') drawTowel(mesh, arm.palm);
      if (move.motion === 'wrist-stretch')
        drawHandDetail(mesh, -pose.side);
    });
    ctx.restore();
  } else if (isometric.has(move.motion)) {
    const glutes = move.motion === 'glute-squeeze', quad = move.motion === 'quad-set';
    const working = quad ? [leg] : pose.legs;
    const muscles = working.map(l => {
      if (glutes) return [l.hip[0], l.hip[1] + 0.022, l.hip[2] - 0.073];
      const point = mixPoint(l.hip, l.knee, quad ? 0.64 : 0.55);
      return [point[0] - (quad ? 0 : l.s * 0.045), point[1] + 0.033, point[2] + 0.014];
    });
    const phase = pose.activation < 0.03 ? 'Relax' : pose.activation >= 0.98 ? 'Hold' :
      seconds % 4 < 2 ? 'Tighten' : 'Release';
    const points = muscles.map(project);
    for (const [i, [px, py]] of points.entries()) {
      const hip = project(working[i].hip), knee = project(working[i].knee);
      const angle = glutes ? 0 : Math.atan2(knee[1] - hip[1], knee[0] - hip[0]);
      const length = glutes ? 0.058 * scale : 0.24 * Math.hypot(knee[1] - hip[1], knee[0] - hip[0]);
      ctx.beginPath();
      ctx.ellipse(px, py, Math.max(4, length), Math.max(2.6, scale * (glutes ? 0.048 : 0.030)), angle, 0, Math.PI * 2);
      ctx.globalAlpha = (0.10 + 0.37 * pose.activation) * opacity;
      ctx.fill();
      ctx.globalAlpha = 0.86 * opacity;
      ctx.stroke();
    }
    ctx.globalAlpha = opacity;
    const target = points.length === 1 ? points[0] : mixPoint(points[0], points[1], 0.5);
    label(ctx, target, [glutes ? 'Buttocks' : quad ? 'Front thigh' : 'Inner thighs', phase],
      width, height, dark, pose, project, scale);
  } else if (move.motion === 'ball-back') {
    const target = project(backBallCenter(pose));
    ctx.beginPath();
    ctx.arc(target[0], target[1], Math.max(3, backBallRadius * scale + 2), 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, target, [width < 220 ? 'Ball' : 'Massage ball'], width, height, dark, pose, project, scale);
  } else if (move.motion === 'ankle-circle') {
    ankleArrow(ctx, move, seconds, leg, project, width, height, scale);
  } else if (move.motion === 'palm-forward') {
    for (const hand of pose.arms) {
      const [u, v] = project(hand.palm);
      arrow(ctx, u - hand.s * scale * 0.035, v - scale * 0.048, u + hand.s * scale * 0.085, v - scale * 0.035, hand.s * 0.65, scale);
    }
  } else if (move.motion === 'seated-pelvic-tilt') {
    const [u, v] = project(mixPoint(pose.legs[0].hip, pose.legs[1].hip, 0.5));
    arrow(ctx, u + scale * 0.085, v - scale * 0.095, u - scale * 0.085, v - scale * 0.095, 0.5, scale, true);
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
        case 'wrists':
          return a.wrist;
        case 'shoulders':
          return move.motion === 'chest-open' ? a.elbow : a.shoulder;
        case 'body':
          return a.shoulder;
        case 'pelvis':
          return l.hip;
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

// Reserve space around the posed limbs at the height of each proposed label.
// This avoids reading pixels back from the drawing surface on every frame.
function labelSegments(pose, project, scale) {
  const pelvis = mixPoint(pose.legs[0].hip, pose.legs[1].hip, 0.5);
  const parts = [[pose.crown, pose.neck, 0.083], [pose.neck, pelvis, 0.15]];
  for (const arm of pose.arms)
    parts.push([arm.shoulder, arm.elbow, 0.064], [arm.elbow, arm.palm, 0.053]);
  for (const leg of pose.legs)
    parts.push([leg.hip, leg.knee, 0.079], [leg.knee, leg.ankle, 0.056], [leg.ankle, leg.toe, 0.044]);
  return parts.map(([from, to, r]) => ({a: project(from), b: project(to), radius: r * scale}));
}
function label(ctx, target, lines, width, height, dark, pose, project, scale) {
  const font = Math.max(10, Math.min(16, height * 0.044, width * 0.055));
  ctx.font = '600 ' + font + 'px system-ui, sans-serif';
  const pad = 5, lineHeight = font * 1.19;
  const w = Math.ceil(Math.max(...lines.map(line => ctx.measureText(line).width))) + 2 * pad;
  const h = Math.ceil(lines.length * lineHeight) + 2 * pad;
  const gap = Math.min(46, Math.max(16, height * 0.12));
  const parts = labelSegments(pose, project, scale);
  let bestCost = Infinity, x = 0, y = 0, lineX = 0, lineY = 0;
  for (const top of [target[1] - h - gap * 0.35, target[1] - h / 2, target[1] + gap * 0.35]) {
    const ty = Math.max(pad, Math.min(height - h - pad, top));
    let minX = target[0] - gap, maxX = target[0] + gap;
    for (const {a,b,radius} of parts) {
      if (Math.max(a[1],b[1]) + radius < ty || Math.min(a[1],b[1]) - radius > ty+h) continue;
      const lo = a[1] <= b[1] ? a : b, hi = lo === a ? b : a;
      const dy = Math.max(1e-5, hi[1] - lo[1]);
      const start = Math.max(0, Math.min(1, (ty - radius - lo[1]) / dy));
      const end = Math.max(0, Math.min(1, (ty + h + radius - lo[1]) / dy));
      const ax = lo[0] + (hi[0]-lo[0]) * start, bx = lo[0] + (hi[0]-lo[0]) * end;
      minX = Math.min(minX, ax - radius - 3, bx - radius - 3);
      maxX = Math.max(maxX, ax + radius + 3, bx + radius + 3);
    }
    for (const left of [true, false]) {
      const edge = left ? minX : maxX;
      const tx = Math.max(pad, Math.min(width-w-pad, left ? edge-w : edge));
      const lx = left ? tx+w : tx, ly = Math.max(ty+4, Math.min(ty+h-4, target[1]));
      const cost = Math.hypot(lx-target[0], ly-target[1]) + 8 * Math.abs(lx-edge);
      if (cost < bestCost) { bestCost = cost; x = tx; y = ty; lineX = lx; lineY = ly; }
    }
  }
  ctx.beginPath();
  ctx.moveTo(lineX, lineY);
  ctx.lineTo(target[0], target[1]);
  ctx.stroke();
  ctx.fillStyle = dark ? '#273a30' : '#fffdf6';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = dark ? '#ffdcaa' : '#653813';
  lines.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + (i + 0.5) * lineHeight));
}

// Copy the arc traced by the toes, including the reversal on the same foot.
// Cache its world points across animation frames.
const anklePaths = new Map();
function ankleArrow(ctx, move, seconds, leg, project, width, height, scale) {
  const cycle = Math.floor(seconds / 4) % 4;
  if (!anklePaths.has(cycle)) {
    const points = [];
    for (let i = 0; i <= 18; i++) {
      const frame = movementPose(move, 4 * cycle + 0.65 + (2.35 * i) / 18);
      points.push(frame.legs[leg.s === -1 ? 0 : 1].toe);
    }
    anklePaths.set(cycle, points);
  }
  const points = anklePaths.get(cycle).map(project);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const radius = Math.max(5, scale * 0.075);
  const factor = 2 * radius / Math.max(0.001, maxX - minX, maxY - minY);
  const [tx, ty] = project(leg.toe);
  const cx = Math.max(radius + 3, Math.min(width - radius - 3, tx + (tx < width/2 ? -1 : 1) * radius * 1.9));
  const cy = Math.max(radius + 3, Math.min(height - radius - 3, ty - radius));
  const path = points.map(([u,v]) => [cx + (u - (minX + maxX)/2) * factor, cy + (v - (minY + maxY)/2) * factor]);
  ctx.beginPath();
  ctx.moveTo(path[0][0], path[0][1]);
  for (const [u,v] of path.slice(1)) ctx.lineTo(u, v);
  ctx.stroke();
  const [x,y] = path.at(-1), [px,py] = path.at(-2);
  arrowhead(ctx, x, y, Math.atan2(y - py, x - px), radius * 0.5);
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {number} bend @param {number} scale */
function arrow(ctx, x1, y1, x2, y2, bend, scale, bothEnds = false) {
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
  arrowhead(ctx, x2, y2, angle, tip);
  if (bothEnds) arrowhead(ctx, x1, y1, Math.atan2(y1 - cy, x1 - cx), tip);
}
function arrowhead(ctx, x2, y2, angle, tip) {
  ctx.beginPath();
  ctx.moveTo(x2 - tip * Math.cos(angle - 0.54), y2 - tip * Math.sin(angle - 0.54));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - tip * Math.cos(angle + 0.54), y2 - tip * Math.sin(angle + 0.54));
  ctx.stroke();
}
