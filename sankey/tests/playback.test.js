const test = require('node:test');
const assert = require('node:assert/strict');
const SK = require('../js/layout.js');
require('../js/color.js');
require('../js/csv.js');
require('../js/transform.js');
require('../js/shapes.js');
require('../js/paths.js');
require('../js/playback.js');
require('../js/examples.js');

const load = (id) => {
  const example = SK.examples.find(e=>e.id===id);
  return SK.transform.build(SK.transform.parseTable(example.files[example.table]),example.importSpec,example.importOptions);
};
function layout(result) {
  const counts = result.dimnames.map(d=>d.rows.length).concat(result.dimnames.at(-1).cols.length);
  const loc = counts.flatMap((count,s)=>Array.from({length:count},(_,i)=>({set:s+1,node:i+1,x:s,y:1-(i+0.5)/count})));
  return SK.layout.computeLayout({mode:'layered',matrices:result.matrices,loc,valueScale:0.0005,params:{n:30}},
    {xlim:[-0.2,2.2],ylim:[0,1],width:900,height:600});
}

test('cohort playback uses the 560 existing synthetic records without inventing IDs or changing weights',()=>{
  const result = load('cohort'), before = JSON.stringify(result);
  const sequence = SK.playback.units(result.paths);
  assert.equal(sequence.kind,'records');
  assert.equal(sequence.items.length,560);
  assert.equal(new Set(sequence.items.map(item=>item.id)).size,560);
  for(const item of sequence.items) {
    assert.equal(item.id,result.paths[item.path].members[item.member].id);
    assert.equal(item.weight,1);
  }
  assert.equal(JSON.stringify(result),before);
});

test('aggregate counts stay 17 weighted complete paths, with no fabricated people',()=>{
  const result = load('pathways'), sequence = SK.playback.units(result.paths);
  assert.equal(sequence.kind,'paths');
  assert.equal(sequence.items.length,17);
  assert(sequence.items.every(item=>item.id===null&&item.member===-1));
  assert.equal(sequence.items.reduce((sum,item)=>sum+item.weight,0),560);
});

test('each playback shape follows all of its recorded stages and preserves the source data',()=>{
  const result = load('cohort'), before = JSON.stringify(result);
  const drawing = layout(result), plan = SK.playback.build(drawing,result.paths);
  assert.equal(plan.weight,560);
  plan.items.forEach(item=>{
    assert.equal(item.geometry.flows.length,2);
    assert(item.x1>item.x0);
    item.geometry.flows.forEach((flow,s)=>{
      assert.equal(flow.i,result.paths[item.path].nodes[s]);
      assert.equal(flow.j,result.paths[item.path].nodes[s+1]);
    });
    assert(item.geometry.polygon.every(point=>point.every(Number.isFinite)));
  });
  assert.equal(JSON.stringify(result),before);
});

test('progress reveals whole trajectories monotonically and accumulates every record',()=>{
  for(const total of [1,17,560]) for(let i=0;i<total;i++) {
    assert.equal(SK.playback.fraction(0,i,total),0);
    assert.equal(SK.playback.fraction(1,i,total),1);
    const travel=Math.max(.14,1/total);
    const end=(total>1 ? i/(total-1)*(1-travel) : 0)+travel;
    assert.equal(SK.playback.fraction(end,i,total),1);
    let previous=0;
    for(let step=0;step<=40;step++) {
      const next=SK.playback.fraction(step/40,i,total);
      assert(next>=previous && next<=1);
      previous=next;
    }
  }
});

test('missing trajectories, inconsistent records, marginal-only matrices and reversed flows fail explicitly',()=>{
  assert.throws(()=>SK.playback.units(null),/complete trajectories/);
  assert.throws(()=>SK.playback.units([{nodes:[0,0],weight:2,members:[{id:'a',weight:1}]}]),/sum/);
  const result=load('pathways'), drawing=layout(result);
  assert.throws(()=>SK.playback.build(drawing,[]),/complete trajectories/);
  const invalid=result.paths.map((p,i)=>({...p,weight:p.weight+(i===0?1:0)}));
  assert.throws(()=>SK.playback.build(drawing,invalid),/reproduce every flow/);
  drawing.flows[0].dir=-1;
  assert.throws(()=>SK.playback.build(drawing,result.paths),/forward flows/);
});
