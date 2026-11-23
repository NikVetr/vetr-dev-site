// Props share contact points and dimensions with the shoulder demonstrations.
import {ellipsoid, rod} from '../equipment.js';
import {add, mixPoint} from './geometry.js';

const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const cloth = '#9cb9ad',
  hem = '#708e86';

/** @typedef {{surface:(rings:number[][][],color:string)=>void}} Mesh */
/** @typedef {ReturnType<typeof import('../pose.js').basePose>} Pose */
/** @param {Mesh} mesh @param {boolean} alongSpine @param {number} radius @param {boolean} foam */
function roll(mesh, alongSpine, radius, foam) {
  const axis = alongSpine ? Z : X,
    center = [0, radius, alongSpine ? -0.42 : -0.31];
  const halfLength = alongSpine ? 0.32 : foam ? 0.224 : 0.189;
  /** @param {number} t */
  const at = t =>
    add(
      center,
      axis.map(v => v * t)
    );
  rod(mesh, at(-halfLength), at(halfLength), radius, foam ? '#699b9c' : cloth);
  for (const sign of [-1, 1]) {
    const end = at(sign * halfLength);
    const r = alongSpine ? [radius, radius, 0.008] : [0.008, radius, radius];
    ellipsoid(mesh, end, X, Y, Z, r[0], r[1], r[2], foam ? '#507c80' : cloth);
    if (!foam) rod(mesh, at(sign * (halfLength - 0.023)), at(sign * (halfLength - 0.017)), radius + 0.001, hem);
  }
}

/** @param {Pose} p */
export const upperBackBallCenter = p => [-0.082 + 0.012 * p.a, 0.032, -0.36];

/** @param {Mesh} mesh @param {Pose} p @param {import('../pose.js').Movement} move @param {number} _seconds */
export function drawUpperProps(mesh, p, move, _seconds) {
  switch (move.animation) {
    case 'pendulum': {
      // A wide, fixed rail permits a two-handed transfer before the free arm swings.
      for (const side of [-1, 1])
        rod(mesh, [side * 0.4, 0.009, 0.32], [side * 0.4, 1.055, 0.32], 0.015, '#9aaead');
      rod(mesh, [-0.415, 1.055, 0.32], [0.415, 1.055, 0.32], 0.02, '#9aaead');
      break;
    }
    case 'towel-up-back': {
      const top = p.arms[1].palm,
        bottom = p.arms[0].palm;
      const middle = add(mixPoint(top, bottom, 0.5), [0, 0, -0.02]);
      // A folded length of towel follows the trainer's two grips.
      const centers = [
        add(top, [0.003, 0.052, 0.004]),
        top,
        middle,
        bottom,
        add(bottom, [-0.006, -0.079, 0.009]),
      ];
      mesh.surface(
        centers.map(c =>
          [
            [-0.017, 0, -0.004],
            [0.017, 0, -0.004],
            [0.017, 0, 0.004],
            [-0.017, 0, 0.004],
          ].map(v => add(c, v))
        ),
        cloth
      );
      break;
    }
    case 'towel-extension':
    case 'roller-extension':
    case 'towel-spine-opener':
      roll(
        mesh,
        move.animation === 'towel-spine-opener',
        move.animation === 'roller-extension' ? 0.061 : 0.035,
        move.animation === 'roller-extension'
      );
      break;
    case 'ball-back':
      if (move.pose !== 'supine') return false;
      ellipsoid(mesh, upperBackBallCenter(p), X, Y, Z, 0.032, 0.032, 0.032, '#c98a48');
      break;
    default:
      return false;
  }
  return true;
}
