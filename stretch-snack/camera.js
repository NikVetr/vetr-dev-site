/** @type {Record<string,string>} */
export const regions = {
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

// Orthographic views in metres. A shot stays put throughout the repetition,
// so the moving joint can be followed against stationary surroundings.
/** @typedef {{yaw:number, pitch:number, centerY:number, overviewY:number, centerZ:number, width:number, height:number, offsetX:number}} Camera */
/** @typedef {{motion:string, pose:string}} Movement */

// Front views separate the two limbs for sideways motion. Profile views show
// travel towards or away from the viewer and the contact point on a support.
/** @type {Record<string,number>} */
const angles = {
  'neck-turn': 0.23, 'neck-tilt': 0.13, 'chin-tuck': 1.12,
  'overhead-reach': 0.36, 'elbow-bend': 0.83, 'knee-extend': 1.19,
  'shoulder-roll': 0.87, 'shoulder-squeeze': 0.34, 'chest-open': 0.34,
  'band-open': 0.27, 'side-bend': 0.28, 'trunk-turn': 0.49, 'self-hug': 0.40,
  'ball-back': 1.55, 'back-round': 1.08, 'back-arch': 1.06,
  'palm-forward': 0.25, 'palm-turn': 0.35, 'wrist-bend': 0.83,
  'glute-squeeze': 2.05, 'seated-pelvic-tilt': 1.08, 'hamstring-lean': 1.04,
  'hip-side': 0.19, 'weight-shift': 0.26, 'knee-squeeze': 0.30,
  'knee-bend': 1.05, 'step-up': 1.09, 'calf-stretch': 1.21,
  'foot-slide': 1.13, 'quad-set': 1.05, 'seated-march': 0.83,
  'heel-lift': 1.06, 'toe-lift': 1.0, 'foot-roll': 1.10, 'ankle-circle': 0.69,
  'heel-slide': 1.28, 'pelvic-tilt': 1.48, 'knee-roll': 0.70,
};

/** @param {Movement} move @param {{zoom?:boolean,rotation?:boolean}} [options] @returns {Camera} */
export function movementCamera({motion, pose}, {zoom = true, rotation = true} = {}) {
  const seated = pose === 'seated', floor = pose === 'supine';
  const yaw = rotation ? angles[motion] ?? 0.58 : floor ? 1.18 : 0.58;
  const pitch = floor ? (rotation && motion === 'knee-roll' ? 0.82 : 0.34)
    : rotation && ['hands', 'feet'].includes(regions[motion]) ? 0.23 : 0.11;
  // Within each posture the overview fits even the farthest reach or step.
  const overviewY = floor ? 0.09 : seated ? 0.81 : 0.91;
  const full = {
    yaw, pitch, overviewY, centerY: overviewY,
    centerZ: floor ? 0.012 : seated ? 0.29 : 0.09,
    width: floor ? 2.36 : seated ? 1.63 : 1.70,
    height: floor ? 1.80 : seated ? 1.82 : 2.06, offsetX: 0,
  };
  if (!zoom) return full;
  // Seated and standing upper-body poses share the same rig above the pelvis.
  const lift = seated ? 0 : 0.40;
  /** @param {number} centerY @param {number} centerZ @param {number} width @param {number} height */
  const frame = (centerY, centerZ, width, height, offsetX = 0) =>
    ({yaw, pitch, overviewY, centerY, centerZ, width, height, offsetX});
  if (floor) return motion === 'knee-roll'
    ? frame(0.16, 0.14, 1.72, 1.40)
    : frame(0.20, motion === 'pelvic-tilt' ? 0.10 : 0.32, 1.45, 0.85);
  if (motion === 'overhead-reach') return frame(1.00, 0.10, 1.34, 1.37);
  if (motion === 'knee-extend' || motion === 'quad-set' || motion === 'hamstring-lean')
    return frame(motion === 'hamstring-lean' ? 0.61 : 0.40, 0.36, 1.40, motion === 'hamstring-lean' ? 1.38 : 0.99);
  if (motion === 'glute-squeeze' || motion === 'seated-pelvic-tilt') return frame(0.63 + lift, 0.07, 1.16, 0.96);
  if (motion === 'step-up' || motion === 'calf-stretch' || motion === 'weight-shift') return full;
  // Keep both planted heels and the hand on the fixed rail in the standing demonstration.
  if (motion === 'toe-lift' && !seated) return frame(0.57, 0.15, 1.10, 1.36);
  switch (regions[motion]) {
    case 'head': return frame(1.04 + lift, 0.04, 0.82, 0.76);
    case 'shoulders':
    case 'arms':
    case 'wrists': return frame(0.92 + lift, 0.07, motion === 'band-open' || motion === 'chest-open' ? 1.48 : 0.96, seated ? 0.99 : 1.23);
    case 'hands': return frame(0.89 + lift, 0.17, 1.34, 0.99, -0.11);
    case 'feet': return frame(0.28, seated ? 0.40 : 0.09, 1.01, 0.80);
    case 'shins':
    case 'thighs': return frame(seated ? 0.40 : 0.60, seated ? 0.26 : 0.05, 1.16, seated ? 0.99 : 1.32);
    default: return frame(0.84 + lift, 0.06, 1.20, 1.18);
  }
}

/** Ease the camera to rest at each endpoint. @param {Camera} from @param {Camera} to @param {number} progress @returns {Camera} */
export function blendCamera(from, to, progress) {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const t = progress * progress * (3 - 2 * progress);
  /** @param {number} a @param {number} b */
  const mix = (a, b) => a + (b - a) * t;
  return {
    yaw: mix(from.yaw, to.yaw), pitch: mix(from.pitch, to.pitch),
    overviewY: mix(from.overviewY, to.overviewY), centerY: mix(from.centerY, to.centerY), centerZ: mix(from.centerZ, to.centerZ),
    width: mix(from.width, to.width), height: mix(from.height, to.height),
    offsetX: mix(from.offsetX, to.offsetX),
  };
}

/** @param {Camera} camera @param {number} width @param {number} height @param {boolean} reserveInset */
export function cameraProjection(camera, width, height, reserveInset) {
  const {yaw, pitch, centerY, centerZ} = camera;
  const cosYaw = Math.cos(yaw),
    sinYaw = Math.sin(yaw),
    cosPitch = Math.cos(pitch),
    sinPitch = Math.sin(pitch);
  const scale = Math.min(height / camera.height, width / camera.width);
  const offsetX = reserveInset ? camera.offsetX : 0;
  const originX = width * (0.5 + offsetX) - sinYaw * centerZ * scale;
  // In a portrait pane, a long foot or arm sweep can set the scale by width.
  // Use the spare height to show more of the body around the working joint.
  const spare = Math.max(0, (height - camera.height * scale) / 2);
  const context = Math.min(spare, Math.max(-spare, (camera.overviewY - centerY) * cosPitch * scale));
  const originY = height * 0.5 + context + (centerY * cosPitch - centerZ * cosYaw * sinPitch) * scale;
  /** @param {number[]} point */
  const project = ([x, y, z]) => {
    const depth = -x * sinYaw + z * cosYaw;
    return [
      originX + (x * cosYaw + z * sinYaw) * scale,
      originY + (-y * cosPitch + depth * sinPitch) * scale,
      depth * cosPitch + y * sinPitch,
    ];
  };
  return {scale, project};
}
