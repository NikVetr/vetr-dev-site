import assert from 'node:assert/strict';
import test from 'node:test';
import { movementPose } from '../pose.js';
import { drawTrainer } from '../trainer.js';

// Material landmarks on the exported CC0 skin and tank. Each skin triangle
// sits about 10–13 mm inside its paired armhole triangle in the source A-pose.
// They previously crossed the fabric when retargeted to these catalog poses.
const underarms = [
  { skin: [330, 381, 331], cloth: [796, 25, 805] },
  { skin: [4679, 4680, 4704], cloth: [826, 386, 841] },
];
const minus = (a, b) => a.map((v, k) => v - b[k]);

test('skin beneath both tank armholes follows the fabric through shoulder rotations', () => {
  for (const [pose, motion] of [
    ['seated', 'wrist-stretch'], ['seated', 'trunk-turn'],
    ['standing', 'back-arch'], ['supine', 'knee-roll'],
  ]) {
    const move = { pose, motion };
    for (const seconds of [0, 1, 2, 6]) {
      const surfaces = [];
      drawTrainer({ indexed(points) { surfaces.push(points); } }, movementPose(move, seconds), move);
      for (const { skin, cloth } of underarms) {
        const [a, b, c] = cloth.map(i => surfaces[1][i]);
        const [u, v] = [minus(b, a), minus(c, a)];
        const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        const centre = a.map((_, k) => skin.reduce((sum, i) => sum + surfaces[0][i][k], 0) / skin.length);
        const depth = n.reduce((sum, value, k) => sum + value * (centre[k] - a[k]), 0) / Math.hypot(...n);
        assert.ok(depth < 0, `${pose} ${motion} at ${seconds}s: skin ${(depth * 1000).toFixed(1)} mm outside tank`);
      }
    }
  }
});
