import {rod, ellipsoid} from '../equipment.js';
import {chair, wallSection} from './fixtures-props.js';
import {add} from './geometry.js';
const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const frame = '#829894',
  rubber = '#b67541';

export function drawMobilityProps(mesh, p, move, _seconds, yaw = 0.58) {
  if (move.family !== 'mobility') return false;
  const id = move.animation;
  if (p.mobilityRoller) {
    const {at, axis} = p.mobilityRoller,
      half = axis.map((v) => v * 0.17);
    rod(
      mesh,
      add(
        at,
        half.map((v) => -v)
      ),
      add(at, half),
      0.078,
      rubber
    );
  } else if (p.mobilityBall) ellipsoid(mesh, p.mobilityBall, X, Y, Z, 0.047, 0.047, 0.047, rubber);
  else if (id === 'band-pass-through') rod(mesh, p.arms[0].palm, p.arms[1].palm, 0.009, rubber);
  else if (id === 'overhead-shoulder-stretch') {
    for (const s of [-1, 1]) rod(mesh, [s * 0.61, 0, 0.23], [s * 0.61, 1.87, 0.23], 0.023, frame);
    rod(mesh, [-0.62, 1.87, 0.23], [0.62, 1.87, 0.23], 0.024, frame);
  } else if (id === 'couch-stretch') {
    chair(mesh, [0, 0, -0.455], X, 0.366);
  } else if (['wall-angel', 'leg-swing-wall', 'side-leg-swing'].includes(id)) {
    const eyeX = -Math.sin(yaw),
      eyeZ = Math.cos(yaw);
    if (id === 'leg-swing-wall') wallSection(mesh, [0.599, 0, 0.04], Z, 1.08, 1.78, 1.25, eyeX < 0.01);
    else {
      const behind = id === 'wall-angel';
      wallSection(
        mesh,
        [0, 0, behind ? -0.143 : 0.439],
        X,
        1.08,
        1.9,
        behind ? 1.47 : 1.25,
        behind ? eyeZ >= 0 : eyeZ < 0,
        behind
      );
    }
  }
  return true;
}
