import {rod, ellipsoid, pad} from '../equipment.js';
import {add, mixPoint as mix} from './geometry.js';

const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const rubber = '#ba7544',
  textile = '#7fa4a1',
  metal = '#9aaead';
function band(mesh, a, b) {
  rod(mesh, a, b, 0.007, rubber);
}
function thighBand(mesh, p) {
  const points = p.legs.map(l => mix(l.hip, l.knee, 0.83));
  const ring = dy =>
    Array.from({length: 28}, (_, i) => {
      const theta = (i * 2 * Math.PI) / 28,
        c = Math.cos(theta),
        s = Math.sin(theta);
      const at = mix(points[0], points[1], (c + 1) / 2);
      return add(at, [0.055 * c, dy, 0.087 * s]);
    });
  mesh.surface([ring(-0.014), ring(0.014)], rubber);
}
function scrunchCloth(mesh, p) {
  const rows = [];
  for (let i = 0; i <= 15; i++) {
    const t = i / 15;
    const line = [];
    for (let j = 0; j <= 8; j++) {
      const x = -0.26 + j * 0.065;
      const working = Math.max(0, 1 - Math.abs(x - p.side * 0.125) / 0.19);
      const amount = p.activation * working;
      line.push([x, 0.003 + 0.023 * amount * Math.sin(5 * Math.PI * t) ** 2, 0.47 + 0.27 * t - 0.087 * amount * t]);
    }
    // The mesh tool wraps each cross-section into a ring.
    rows.push([...line, ...[...line].reverse().map(([x, y, z]) => [x, y - 0.001, z])]);
  }
  mesh.surface(rows, textile);
}

/** Draw only the movement-specific objects; the shared studio owns the chair, rail, and mat. */
export function lowerBackBallCenter(p, move) {
  return move.pose === 'seated' ? [-0.08, 0.675 + 0.008 * p.a, -0.151] : [-0.077, 0.029, -0.123];
}
export function drawLowerProps(mesh, p, move, seconds) {
  const id = move.animation;
  const active = p.legs.find(l => l.s === p.side),
    other = p.legs.find(l => l.s !== p.side);
  switch (id) {
    case 'band-leg-press':
      p.arms.forEach((arm, index) => band(mesh, arm.palm, p.bandFootLoop[index]));
      band(mesh, p.bandFootLoop[0], p.bandFootLoop[1]);
      break;
    case 'knee-open-band':
      thighBand(mesh, p);
      break;
    case 'band-ankle-in':
    case 'band-ankle-out': {
      // Front chair legs taper from (±.226,.009,.2773) to (±.204,.409,.235).
      const end = id === 'band-ankle-in' ? [active.s * 0.2223, 0.076, 0.2702] : other.toe;
      for (const sign of [-1, 1])
        band(mesh, add(end, [0, 0.006, sign * 0.011]), add(active.toe, [active.s * 0.043, 0.005, sign * 0.019]));
      break;
    }
    case 'towel-scrunch':
      scrunchCloth(mesh, p);
      break;
    case 'towel-knee-lift': {
      // The roll is passed to the other side during the released interval.
      const phase = (seconds / 4) % 1;
      const travel = Math.min(1, Math.min(phase, 1 - phase) / 0.16);
      const x = active.s * 0.115 * travel * travel * (3 - 2 * travel);
      rod(mesh, [x - 0.09, 0.04, 0.383], [x + 0.09, 0.04, 0.383], 0.041, textile);
      break;
    }
    case 'knee-squeeze': {
      if (move.pose !== 'supine') return false;
      const at = mix(p.legs[0].knee, p.legs[1].knee, 0.5);
      ellipsoid(
        mesh,
        at,
        X,
        Y,
        Z,
        Math.max(0.03, (p.legs[1].knee[0] - p.legs[0].knee[0]) / 2 - 0.04),
        0.062,
        0.071,
        textile
      );
      break;
    }
    case 'ball-low-back': {
      const at = lowerBackBallCenter(p, move);
      ellipsoid(mesh, at, X, Y, Z, 0.031, 0.031, 0.031, rubber);
      break;
    }
    case 'leg-swing':
      pad(mesh, [0, 0.052, 0.044], 0.164, 0.203, 0.052, 0.016, '#9faeaa');
      break;
    case 'calf-stretch-step':
      pad(mesh, [0, 0.052, 0.25], 0.253, 0.172, 0.052, 0.015, '#9faeaa');
      break;
    case 'hip-flexor-stretch-step':
      pad(mesh, [0, 0.052, 0.324], 0.251, 0.16, 0.052, 0.016, '#9faeaa');
      break;
    case 'heel-toe-walk':
    case 'heel-walk':
    case 'toe-walk':
      // Continue the studio rail beside the walking loop. A second rail
      // follows the opposite straight so either turn stays within reach.
      rod(mesh, [0.32, 1.055, -0.55], [0.32, 1.055, 0.018], 0.02, metal);
      rod(mesh, [0.32, 0.01, -0.5], [0.32, 1.055, -0.5], 0.015, metal);
      rod(mesh, [-0.32, 1.055, -0.55], [-0.32, 1.055, 0.55], 0.02, metal);
      for (const z of [-0.5, 0.49]) rod(mesh, [-0.32, 0.01, z], [-0.32, 1.055, z], 0.015, metal);
      break;
    case 'quad-stretch':
    case 'march':
      if (move.pose !== 'standing') return false;
      rod(mesh, [-0.301, 1.055, 0.317], [0.32, 1.055, 0.317], 0.02, metal);
      rod(mesh, [-0.3, 0.012, 0.317], [-0.3, 1.055, 0.317], 0.014, metal);
      break;
    default:
      return false;
  }
  return true;
}

// A shoe has one forefoot bone. Show the toe and sole actions explicitly in
// an inset rather than implying that curling the toes rotates the whole ankle.
const toeShows = {
  'toe-curl': 'Curl toes',
  'toe-spread': 'Spread toes',
  'foot-dome': 'Lift arch',
  'towel-scrunch': 'Gather towel'
};
/** Whether the toe inset, rather than a motion arrow, shows this action. */
export const showsToeDetail = (move) => move.family === 'lower' && Object.hasOwn(toeShows, move.animation);
export function drawToeDetail(ctx, move, p, project, width, height, dark, opacity) {
  const id = move.animation,
    label = toeShows[id];
  if (!label) return false;
  const [x, y] = project(p.legs.find(l => l.s === p.side).toe);
  const radius = Math.min(width * 0.15, height * 0.165, 60);
  const cx = x > width * 0.57 ? radius + 9 : width - radius - 9,
    cy = Math.max(radius + 7, Math.min(height - radius - 14, height * 0.51));
  const ink = dark ? '#f2c88c' : '#854921',
    fill = dark ? '#39485d' : '#e0e6ef',
    bone = dark ? '#d6dfe9' : '#526071',
    working = dark ? '#dfa465' : '#bb7e4e';
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fillStyle = dark ? '#1d2635' : '#f8fafd';
  ctx.fill();
  ctx.stroke();
  ctx.translate(cx, cy);
  ctx.scale(radius, radius);
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = bone;
  ctx.fillStyle = fill;
  const a = p.activation;
  if (id === 'toe-spread') {
    ctx.beginPath();
    ctx.moveTo(-0.22, 0.53);
    ctx.bezierCurveTo(-0.32, 0.44, -0.24, 0.22, -0.33, -0.02);
    ctx.bezierCurveTo(-0.48, -0.4, 0.11, -0.46, 0.32, -0.21);
    ctx.bezierCurveTo(0.36, -0.01, 0.2, 0.11, 0.14, 0.36);
    ctx.bezierCurveTo(0.08, 0.57, -0.09, 0.64, -0.22, 0.53);
    ctx.fill();
    ctx.stroke();
    for (let j = 0; j < 5; j++) {
      const dx = (j - 2) * 0.061 * a;
      ctx.beginPath();
      ctx.ellipse(
        -0.267 + j * 0.138 + dx,
        -0.45 + 0.028 * j,
        0.085 - 0.009 * j,
        0.138 - 0.012 * j,
        dx * 1.8,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = working;
      ctx.fill();
      ctx.stroke();
    }
  } else {
    const doming = id === 'foot-dome',
      curling = !doming;
    const archY = 0.19 - (doming ? 0.29 * a : 0.046);
    const ball = 0.35 - (doming ? 0.12 * a : 0);
    ctx.beginPath();
    ctx.moveTo(-0.65, 0.15);
    ctx.bezierCurveTo(-0.68, -0.06, -0.49, -0.1, -0.48, -0.4);
    ctx.lineTo(-0.28, -0.41);
    ctx.bezierCurveTo(-0.27, -0.17, 0.06, -0.13, ball, -0.012);
    ctx.lineTo(ball, 0.17);
    ctx.bezierCurveTo(0.14, 0.24, 0.05, archY - 0.14, -0.14, archY);
    ctx.bezierCurveTo(-0.44, 0.28, -0.58, 0.34, -0.65, 0.15);
    ctx.fill();
    ctx.stroke();
    const toeX = ball + 0.29 - (curling ? 0.16 * a : 0),
      toeY = 0.12 + (curling ? 0.12 * a : 0);
    ctx.beginPath();
    ctx.moveTo(ball - 0.018, 0.0);
    ctx.bezierCurveTo(ball + 0.16, -0.008 - (curling ? 0.11 * a : 0), toeX + 0.1, toeY - 0.028, toeX, toeY);
    ctx.bezierCurveTo(toeX - 0.085, toeY + 0.065, ball + 0.088, 0.118, ball - 0.018, 0.173);
    ctx.closePath();
    ctx.fillStyle = working;
    ctx.fill();
    ctx.stroke();
    if (id === 'towel-scrunch') {
      ctx.beginPath();
      ctx.moveTo(-0.53, 0.32);
      for (let j = 0; j <= 20; j++) {
        const f = j / 20;
        ctx.lineTo(-0.49 + 1.17 * f, 0.32 - (0.015 + 0.07 * a) * Math.sin(f * 5 * Math.PI) ** 2);
      }
      ctx.strokeStyle = dark ? '#91bbb3' : '#498783';
      ctx.lineWidth = 0.055;
      ctx.stroke();
    }
  }
  if (radius > 30) {
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.font = '600 ' + Math.min(0.255, 12 / radius) + 'px system-ui,sans-serif';
    ctx.fillText(label, 0, 0.8);
  }
  ctx.restore();
  return true;
}
