import assert from 'node:assert/strict';
import test from 'node:test';
import {moves} from '../core/catalog.js';
import {meshes} from '../form-motion/model.js';
import {basePose, movementPose} from '../pose.js';
import {drawTrainer, setTrainerBody} from '../trainer.js';

const unpack = (field, Type) => new Type(Uint8Array.from(atob(field), c => c.charCodeAt(0)).buffer);

// The fitted tank meets the skin around its scoop neck and both arm openings.
// Match all boundary edges in the exported topology, including winding, and
// inspect their rendered locations as each shape reaches and rotates.
function boundary(mesh) {
  const pos = unpack(mesh.positions, Int16Array);
  const faces = unpack(mesh.faces, Uint16Array);
  const edges = new Map();
  for (let f = 0; f < faces.length; f += 3) {
    for (let j = 0; j < 3; j++) {
      const a = faces[f+j], b = faces[f+(j+1)%3];
      const key = Math.min(a,b) + ',' + Math.max(a,b);
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [a,b]);
    }
  }
  const name = index => pos.subarray(3*index,3*index+3).join(',');
  return [...edges.values()].filter(([a,b]) => pos[3*a+1]>12000 && pos[3*b+1]>12000)
    .map(([a,b]) => ({a,b,start:name(a),end:name(b)}));
}
const skinEdges = new Map(boundary(meshes.body).map(e => [e.end+';'+e.start,e]));
const joins = boundary(meshes.tank).map(e=>[e,skinEdges.get(e.start+';'+e.end)]);
assert.ok(joins.length>100);
assert.ok(joins.every(([,skin])=>skin),'both armholes and neckline meet the neighboring skin triangles');

for (const shape of ['female','androgynous','male']) {
  test(shape + ' shoulder openings stay closed on both sides at rest, across the chest and overhead', t => {
    setTrainerBody(shape);
    t.after(()=>setTrainerBody('female'));
    for (const id of ['seated-wrist-stretch','seated-trunk-turn','standing-back-arch','supine-knee-roll',
      'seated-overhead-reach','standing-scaption','seated-elbow-opener','standing-towel-up-back']) {
      const move=moves.find(m=>m.id===id);
      for (const time of [0,1,2,4,5,6]) {
        const surfaces=[];
        drawTrainer({indexed(points){surfaces.push(points);}},movementPose(move,time),move);
        for(const [cloth,skin] of joins) {
          assert.deepEqual(surfaces[1][cloth.a],surfaces[0][skin.b],id+' at '+time+' s');
        }
      }
    }
  });
}

test('a unilateral upward reach carries its shoulder girdle while the resting shoulder stays still', () => {
  const move=moves.find(m=>m.id==='seated-overhead-reach');
  for (const [time,raised] of [[2,0],[6,1]]) {
    const p=movementPose(move,time), fixed=basePose(move,time);
    assert.ok(p.arms[raised].shoulder[1]>fixed.arms[raised].shoulder[1]+.035);
    assert.deepEqual(p.arms[1-raised].shoulder,fixed.arms[1-raised].shoulder);
    assert.ok(p.arms[raised].palm[1]>p.crown[1]);
  }
});
