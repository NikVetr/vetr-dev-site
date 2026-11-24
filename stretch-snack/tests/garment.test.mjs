import assert from 'node:assert/strict';
import test from 'node:test';
import {moves} from '../core/catalog.js';
import {meshes} from '../form-motion/model.js';
import {basePose, movementPose} from '../pose.js';
import {drawTrainer, setTrainerBody} from '../trainer.js';

const unpack = (field, Type) => new Type(Uint8Array.from(atob(field), c => c.charCodeAt(0)).buffer);

// The tank, skin and leggings meet along the neckline, armholes, waist and calf cuffs.
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
  return [...edges.values()]
    .map(([a,b]) => ({a,b,start:name(a),end:name(b)}));
}
const panels = [meshes.body, meshes.tank, meshes.leggings];
const boundaries = panels.map(boundary);
const joins = [];
for (const [part, edges] of boundaries.entries()) {
  const neighbors = new Map();
  for (const [other, otherEdges] of boundaries.entries()) {
    if (other === part) continue;
    for (const {a, start, end} of otherEdges) neighbors.set(end + ';' + start, {other, vertex:a});
  }
  for (const {b, start, end} of edges) {
    const match = neighbors.get(start + ';' + end);
    assert.ok(match, 'every fabric boundary meets an adjacent triangle of another material');
    if (part < match.other) joins.push({part, vertex:b, other:match.other, adjacent:match.vertex});
  }
}
for (const [part, other] of [[0,1],[0,2],[1,2]])
  assert.ok(joins.filter(j => j.part === part && j.other === other).length > 40);

const shapeMix = {female:0, androgynous:0.5, male:1};
function fabricEdges(mesh, shape) {
  const faces = unpack(mesh.faces, Uint16Array), base = unpack(mesh.positions, Int16Array);
  const delta = unpack(mesh.shapeDelta, Int16Array);
  const rest = Array.from({length:base.length/3}, (_, i) =>
    [0,1,2].map(k => (base[3*i+k] + shapeMix[shape]*delta[3*i+k])/10000));
  const edges = new Map();
  for (let f = 0; f < faces.length; f += 3) {
    for (let j=0;j<3;j++) {
      const a = faces[f+j], b = faces[f+(j+1)%3], key = Math.min(a,b)*65536 + Math.max(a,b);
      if (edges.has(key)) continue;
      const d = distance(rest[a], rest[b]);
      if (d > .003) edges.set(key, {a, b, rest:d});
    }
  }
  return [...edges.values()];
}
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

for (const shape of ['female','androgynous','male']) {
  test(shape + ' garment seams stay together at the waist, cuffs, neckline and shoulders', t => {
    setTrainerBody(shape);
    t.after(()=>setTrainerBody('female'));
    for (const id of ['seated-wrist-stretch','seated-trunk-turn','standing-back-arch','supine-knee-roll',
      'seated-overhead-reach','standing-scaption','seated-elbow-opener','standing-towel-up-back',
      'hands-and-knees-pigeon','long-sitting-pancake','supine-rollover-straddle']) {
      const move=moves.find(m=>m.id===id);
      for (const time of [0,1,2,4,5,6]) {
        const surfaces=[];
        drawTrainer({indexed(points){surfaces.push(points);}},movementPose(move,time),move);
        for(const {part,vertex,other,adjacent} of joins) {
          assert.deepEqual(surfaces[part][vertex], surfaces[other][adjacent], id+' at '+time+' s');
        }
      }
    }
  });
  test(shape + ' fitted fabric avoids isolated long spikes during hip flexion, arm elevation and twisting', t => {
    setTrainerBody(shape);
    t.after(()=>setTrainerBody('female'));
    const edges = panels.map(p => fabricEdges(p,shape));
    for (const [id,part] of /** @type {const} */ ([
      ['hands-and-knees-pigeon',2],['long-sitting-pancake',2],['supine-knee-hug-both',2],
      ['supine-cross-twist',1],['standing-scaption',1],
    ])) {
      const move = moves.find(m=>m.id===id);
      for (const time of [.6,1.2,2,4.7,5.3,6]) {
        const surfaces = [];
        drawTrainer({indexed(points){surfaces.push(points);}},movementPose(move,time),move);
        const p = surfaces[part];
        let spike = 0, overstretched = 0;
        for (const {a,b,rest} of edges[part]) {
          const length = distance(p[a],p[b]);
          spike = Math.max(spike, length-rest);
          if (length > 2.5*rest) overstretched++;
        }
        assert.ok(spike < .04, id+' extends a single mesh edge by '+spike+' m');
        assert.ok(overstretched < .01*edges[part].length, id+' locally elongates the cloth');
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
