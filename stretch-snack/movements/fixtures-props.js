// Fixture geometry shares the skeleton's metre scale and depth buffer. A
// cutaway wall retains its sill, panel seams and the solid area at contact.
import {rod, pad, ellipsoid} from '../equipment.js';
import {add, mixPoint, scaledTo, cross} from './geometry.js';
import {
  rearWallZ,
  fixtureBallCenter,
  bedTop,
  chairHeelHeight,
  stepHeight,
  counterY,
  trayY,
  backCounterY
} from './fixtures.js';

const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const frame = '#91aaa9',
  fabric = '#aabebc',
  wood = '#bd9f81',
  wall = '#b9c8c6',
  seam = '#93a8a5',
  cloth = '#d5b781',
  band = '#b17847';
const scale = (p, t) => p.map((x) => x * t);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const unit = (p) => scaledTo(p, 1);

// Vertical rectangles of finite thickness; along is the wall's horizontal
// tangent. In a front view use the outside edge and contact panels only.
function panel(mesh, c, along, halfWidth, halfHeight, depth, color) {
  const normal = cross(along, Y);
  const corners = [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1]
  ];
  const rings = [
    [-depth, 0.98],
    [-depth * 0.62, 1],
    [depth * 0.62, 1],
    [depth, 0.98]
  ].map(([d, f]) =>
    corners.map(([w, h]) =>
      add(add(add(c, scale(normal, d)), scale(along, w * halfWidth * f)), [0, h * halfHeight * f, 0])
    )
  );
  // The cap's winding follows the perimeter. Reusing the same corner count
  // lets the renderer cap these solids without a separate geometry path.
  mesh.surface(
    [
      rings[0].map(() => add(c, scale(normal, -depth))),
      ...rings,
      rings.at(-1).map(() => add(c, scale(normal, depth)))
    ],
    color
  );
}
export function wallSection(mesh, center, along, width, height, contactHeight, solid = false, slide = false) {
  const at = (u, h, d = 0) => add(add(add(center, scale(along, u)), [0, h, 0]), scale(cross(along, Y), d));
  const half = width / 2;
  if (solid) {
    panel(mesh, at(0, height * 0.5), along, half, height * 0.5, 0.012, wall);
  } else {
    for (const edge of [-1, 1])
      panel(mesh, at(edge * (half - 0.021), height * 0.5), along, 0.021, height * 0.5, 0.009, wall);
    panel(mesh, at(0, height - 0.018), along, half, 0.018, 0.009, wall);
    panel(mesh, at(0, 0.159), along, half, 0.11, 0.004, wall);
    if (slide) {
      for (const s of [-1, 1]) panel(mesh, at(s * 0.305, 1.52), along, 0.098, 0.44, 0.004, wall);
    } else panel(mesh, at(0, contactHeight), along, half, 0.092, 0.004, wall);
  }
  panel(mesh, at(0, 0.047), along, half + 0.007, 0.045, 0.017, seam);
}
function ball(mesh, c, r, color) {
  ellipsoid(mesh, c, X, Y, Z, r, r, r, color);
}
export function chair(mesh, origin, axis = [1, 0, 0], height = 0.448) {
  const front = cross(axis, Y);
  const at = (x, y, z) => add(origin, add(scale(axis, x), add([0, y, 0], scale(front, z))));
  for (const s of [-1, 1]) {
    for (const z of [-0.16, 0.16])
      rod(mesh, at(s * 0.19, 0.013, z), at(s * 0.18, height - 0.04, z), 0.013, frame);
    rod(mesh, at(s * 0.18, height - 0.055, -0.164), at(s * 0.185, height + 0.407, -0.197), 0.014, frame);
  }
  // A square rounded seat can also be oriented ninety degrees.
  pad(mesh, at(0, height - 0.024, 0), 0.218, 0.218, 0.024, 0.033, fabric);
  panel(mesh, at(0, height + 0.306, -0.193), axis, 0.216, 0.118, 0.022, fabric);
}
function table(mesh, c, w, d, top) {
  pad(mesh, [c[0], top - 0.018, c[2]], w, d, 0.018, 0.023, wood);
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      const foot = [c[0] + x * (w - 0.037), 0, c[2] + z * (d - 0.04)];
      rod(mesh, add(foot, [0, 0.012, 0]), add(foot, [0, top - 0.035, 0]), 0.014, frame);
    }
}
export function drawBottle(mesh, arm) {
  const axis = unit(sub(arm.fingerJoints[3][0], arm.fingerJoints[0][0]));
  const reach = unit(sub(arm.palm, arm.wrist));
  const inward = unit(cross(axis, reach));
  const center = add(arm.palm, add(scale(reach, 0.026), scale(inward, 0.016)));
  const at = (d) => add(center, scale(axis, d));
  const shoulder = -0.06;
  rod(mesh, at(shoulder), at(0.063), 0.029, '#73acae');
  rod(mesh, at(-0.075), at(shoulder), 0.02, '#76aeaf');
  rod(mesh, at(-0.084), at(-0.073), 0.016, '#e7c290');
  rod(mesh, at(-0.026), at(0.017), 0.03, '#c3d5cb');
  ellipsoid(mesh, at(0.063), reach, axis, inward, 0.029, 0.004, 0.029, '#73acae');
}
function doorway(mesh, closed, solid = true) {
  const z = closed ? 0.681 : 0,
    middle = closed ? 0.363 : 0,
    width = closed ? 0.431 : 0.43,
    height = closed ? 1.83 : 1.99;
  for (const s of [-1, 1]) panel(mesh, [middle + s * width, height / 2, z], X, 0.02, height / 2, 0.038, wood);
  panel(mesh, [middle, height, z], X, width + 0.02, 0.024, 0.038, wood);
  if (closed) {
    // Place the latch near the jamb. The offset, solid leaf leaves a clear
    // view of the band and elbows from the side of the handle.
    if (solid) {
      panel(mesh, [middle, 0.915, z + 0.025], X, width - 0.02, 0.904, 0.018, '#acbdb5');
      for (const [y, h] of [
        [0.485, 0.355],
        [1.37, 0.332]
      ])
        panel(mesh, [middle, y, z + 0.003], X, width - 0.08, h, 0.006, '#b8c8bd');
    } else {
      for (const h of [0.21, 1.0, 1.57])
        panel(mesh, [middle, h, z + 0.01], X, width - 0.018, 0.042, 0.014, wall);
    }
    rod(mesh, [0, 1, z + 0.006], [0, 1, z - 0.044], 0.015, frame);
    ball(mesh, [0, 1, z - 0.061], 0.029, '#778e8b');
  }
}
function bed(mesh) {
  const center = [0.225, bedTop - 0.083, -0.017],
    w = 0.393,
    d = 0.942;
  pad(mesh, center, w, d, 0.083, 0.048, '#ced8cd');
  pad(mesh, add(center, [0, -0.096, 0]), w - 0.012, d - 0.012, 0.017, 0.035, wood);
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      const foot = add(center, [x * (w - 0.08), -center[1], z * (d - 0.085)]);
      rod(mesh, add(foot, [0, 0.01, 0]), add(foot, [0, bedTop - 0.17, 0]), 0.026, frame);
    }
  // Folded cover on the far side leaves the demonstration limb visible.
  pad(mesh, [0.49, bedTop + 0.005, -0.02], 0.114, 0.86, 0.006, 0.022, '#9bb8b6');
}
/** @param {import('../surface.js').SurfaceMesh} mesh @param {ReturnType<typeof import('../pose.js').basePose>} p
 * @param {import('../pose.js').Movement} move @param {number} _seconds @param {number} [cameraYaw] */
export function drawFixtureProps(mesh, p, move, _seconds, cameraYaw = 0.58) {
  // An opaque near wall would hide the demonstration. Show its cut edges and
  // its contact strip when the viewer moves outside that wall.
  const eyeX = -Math.sin(cameraYaw),
    eyeZ = Math.cos(cameraYaw);
  const id = move.animation;
  switch (id) {
    case 'wrist-lift-bottle':
      drawBottle(mesh, p.arms[0]);
      break;
    case 'head-press':
      for (const s of [-1, 1]) rod(mesh, [s * 0.087, 0.87, -0.208], [s * 0.087, 1.2, -0.178], 0.009, frame);
      panel(mesh, [0, 1.202, -0.16], X, 0.141, 0.096, 0.018, fabric);
      break;
    case 'elbow-back-press':
    case 'wall-squat':
    case 'ball-back':
    case 'ball-low-back':
      wallSection(mesh, [0, 0, rearWallZ(id) - 0.012], X, 0.86, 1.63, 1.15, eyeZ >= -0.01);
      if (id.startsWith('ball-')) ball(mesh, fixtureBallCenter(p, id), 0.038, band);
      break;
    case 'wall-press-side':
    case 'wall-press-out': {
      const active = p.arms[0],
        x = id === 'wall-press-out' ? -0.316 : -0.299;
      wallSection(
        mesh,
        [x - 0.012, 0, 0.114],
        Z,
        0.72,
        move.pose === 'standing' ? 1.48 : 1.1,
        active.elbow[1],
        eyeX >= -0.01
      );
      break;
    }
    case 'wall-press-forward':
    case 'wall-push-up':
    case 'wall-slide':
    case 'calf-stretch-wall':
    case 'wall-biceps-stretch': {
      const z = {
        'wall-press-forward': 0.367,
        'wall-push-up': 0.576,
        'wall-slide': 0.202,
        'calf-stretch-wall': 0.486,
        'wall-biceps-stretch': 0.511
      }[id];
      const height = id === 'wall-slide' ? 1.98 : 1.62;
      const solid = eyeZ < -0.05;
      const workingY = id === 'wall-press-forward' ? p.arms[0].palm[1] : 1.39;
      wallSection(
        mesh,
        [0, 0, z + (solid ? 0.012 : 0.004)],
        X,
        0.99,
        height,
        workingY,
        solid,
        id === 'wall-slide'
      );
      break;
    }
    case 'corner-stretch':
      for (const s of [-1, 1]) {
        const along = unit([s, 0, -1]),
          half = 0.4;
        wallSection(
          mesh,
          add([0, 0, 0.587], scale(along, half)),
          along,
          half * 2,
          1.66,
          1.36,
          s * eyeX + eyeZ < -0.05
        );
      }
      break;
    case 'counter-step-back':
      table(mesh, [0, 0, 0.74], 0.36, 0.224, counterY);
      break;
    case 'table-slide': {
      table(mesh, [0, 0, 0.528], 0.345, 0.328, trayY);
      const middle = mixPoint(p.arms[0].palm, p.arms[1].palm, 0.5);
      pad(mesh, [0, trayY + 0.004, middle[2] + 0.021], 0.173, 0.082, 0.004, 0.017, cloth);
      break;
    }
    case 'back-arch-table':
      table(mesh, [0, 0, -0.393], 0.343, 0.239, backCounterY);
      break;
    case 'band-row':
      doorway(mesh, true, eyeZ < -0.05);
      for (const arm of p.arms) {
        const knob = [arm.s * 0.023, 1, 0.615],
          hand = add(arm.palm, [0, -0.012, 0.018]);
        rod(mesh, knob, hand, 0.005, band);
        rod(mesh, hand, add(hand, [arm.s * 0.005, -0.048, -0.011]), 0.006, band);
      }
      break;
    case 'doorway-stretch':
      doorway(mesh, false);
      break;
    case 'knee-straighten-stretch':
      chair(mesh, [-0.122, 0, 0.839], [-1, 0, 0], chairHeelHeight);
      break;
    case 'chair-squat':
      chair(mesh, [0, 0, -0.239]);
      break;
    case 'hamstring-step':
      if (move.raisedSupport === 'chair') chair(mesh, [-0.141, 0, 0.817], [-1, 0, 0], chairHeelHeight);
      else pad(mesh, [-0.141, stepHeight / 2, 0.605], 0.165, 0.19, stepHeight / 2, 0.018, fabric);
      break;
    case 'seated-hip-flexor':
      chair(mesh, [0.162, 0, 0.051], [0, 0, 1]);
      break;
    case 'bed-edge-hip-stretch':
      bed(mesh);
      break;
    default:
      return false;
  }
  return true;
}
