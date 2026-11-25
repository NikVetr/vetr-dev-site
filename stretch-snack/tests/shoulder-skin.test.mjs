import assert from 'node:assert/strict';
import test from 'node:test';
import {moves} from '../core/catalog.js';
import {meshes, rig} from '../form-motion/model.js';
import {movementPose} from '../pose.js';
import {drawTrainer, setTrainerBody} from '../trainer.js';

// Linear skinning shrank the raised shoulder cap to about 70% of its girth.
// Measure skin on the upper third of the right upper arm, around the posed arm axis.
const unpack = (field, Type) => new Type(Uint8Array.from(atob(field), c => c.charCodeAt(0)).buffer);
const joints = unpack(meshes.body.joints, Uint8Array), weights = unpack(meshes.body.weights, Uint8Array);
const rest = unpack(meshes.body.positions, Int16Array);
const arm = rig.boneNames.indexOf('mixamorig:RightArm');
const head = rig.restHeads[arm], axis = rig.restTails[arm].map((v, i) => v - head[i]);
const length2 = axis.reduce((sum, v) => sum + v * v, 0);
const cap = [];
for (let i = 0; i < rest.length / 3; i++) {
  if (![0, 1, 2, 3].some(k => joints[4*i+k] === arm && weights[4*i+k])) continue;
  const along = [0, 1, 2].reduce((sum, k) => sum + (rest[3*i+k] / 10000 - head[k]) * axis[k], 0) / length2;
  if (along > 0.12 && along < 0.3) cap.push(i);
}

function girth(move, seconds) {
  const pose = movementPose(move, seconds);
  /** @type {number[][]} */
  let skin = [];
  drawTrainer({indexed(points) { if (!skin.length) skin = points; }}, pose, move);
  const {shoulder, elbow} = pose.arms[0];
  const d = elbow.map((v, k) => v - shoulder[k]), dl = Math.hypot(...d);
  let sum = 0;
  for (const i of cap) {
    const w = skin[i].map((v, k) => v - shoulder[k]);
    const along = w.reduce((s, v, k) => s + v * d[k], 0) / dl;
    sum += Math.sqrt(Math.max(0, w.reduce((s, v) => s + v * v, 0) - along * along));
  }
  return sum / cap.length;
}

for (const shape of ['female', 'androgynous', 'male']) {
  test(shape + ' shoulder keeps its girth with the arms overhead', t => {
    setTrainerBody(shape);
    t.after(() => setTrainerBody('female'));
    const move = moves.find(m => m.id === 'seated-arms-up');
    assert.ok(move, 'seated-arms-up is in the library');
    const resting = girth(move, 0);
    for (const seconds of [1.5, 2]) {
      const ratio = girth(move, seconds) / resting;
      assert.ok(ratio > 0.85 && ratio < 1.15, 'raised shoulder girth ratio ' + ratio.toFixed(2) + ' at ' + seconds + ' s');
    }
  });
}
