// The camera is fixed throughout a repetition, including a change of working side.
// All three views use the same posed mesh and depth-tested studio renderer.
import { movementPose } from './pose.js';
import { drawTrainer, drawEquipment, drawHandDetail } from './trainer.js';
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
};

/** @param {HTMLCanvasElement} canvas
 * @param {{motion:string,pose:string,equipment?:string[],name?:string}} move
 * @param {number} seconds @param {{location?:string,dark?:boolean,preview?:boolean}} [options] */
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
  const reach = move.motion === 'overhead-reach';
  const yaw = floor ? 1.22 : regions[move.motion] === 'head' ? 0.32 : 0.58;
  const pitch = floor ? 0.32 : 0.095;
  const cosYaw = Math.cos(yaw),
    sinYaw = Math.sin(yaw),
    cosPitch = Math.cos(pitch),
    sinPitch = Math.sin(pitch);
  const stepHeight = move.motion === 'step-up' ? 0.16 : 0;
  const stageHeight = floor ? 0.94 : seated ? (reach ? 1.72 : 1.49) : 1.88 + stepHeight;
  const stageWidth = floor ? 2.36 : handDetail ? 1.85 : options.preview ? 0.96 : 1.34;
  const scale = Math.min(height / stageHeight, width / stageWidth);
  const centerY = floor ? 0.22 : seated ? (reach ? 0.79 : 0.675) : 0.86 + stepHeight / 2;
  const centerZ = floor ? 0.012 : seated ? 0.2 : 0.06;
  const originX = width * (handDetail ? 0.37 : 0.5) - sinYaw * centerZ * scale;
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
  if (!options.preview)
    drawCue(ctx, move, pose, project, scale, width, height, handDetail, options.dark ?? false);
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
    const detailScale = radius / (scale * 0.138);
    const zoom = (point) => {
      const [u, v, z] = project(point);
      return [cx + (u - x) * detailScale, cy + (v - y) * detailScale, z];
    };
    drawSurface(ctx, width, height, zoom, (mesh) => {
      drawHandDetail(mesh, arm, move.motion);
      if (move.motion === 'wrist-stretch')
        drawHandDetail(mesh, pose.arms[pose.side === 1 ? 0 : 1], move.motion);
    });
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
