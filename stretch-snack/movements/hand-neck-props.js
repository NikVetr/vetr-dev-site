import {ellipsoid, pad} from '../equipment.js';

export function drawHandNeckProps(mesh, pose, move, seconds) {
  if (pose.handBall) {
    const {center, radius} = pose.handBall;
    ellipsoid(mesh, center, [1,0,0], [0,1,0], [0,0,1], radius, radius, radius, '#bf8044');
    return true;
  }
  if (pose.headTowel) {
    const [x, y, z] = pose.headTowel;
    // Two rounded folded layers make the thin head support clear from the side.
    pad(mesh, [x, y - .014, z], .130, .106, .011, .018, '#779c9e');
    pad(mesh, [x + .004, y + .0095, z + .004], .123, .098, .011, .015, '#97b5b2');
    return true;
  }
  return false;
}
