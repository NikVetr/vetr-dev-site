import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {analyze} from '../core/explorer-native.mjs';
import {examples} from '../examples.js';
import {diagramProjection} from '../diagram-projection.js';
import {layoutDiagram,bridgePath,movedRoute} from '../diagram-layout.js';
const require=createRequire(import.meta.url);
const ELK=require('../vendor/elk/elk.bundled.js');
const engine=new ELK();
/** @typedef {{x:number,y:number,width:number,height:number}} Box */
/** @param {Box} a @param {Box} b */
const overlaps=(a,b)=>a.x<b.x+b.width-.01&&b.x<a.x+a.width-.01&&a.y<b.y+b.height-.01&&b.y<a.y+a.height-.01;
/** @param {import('../diagram-layout.js').Point} a @param {import('../diagram-layout.js').Point} b @param {Box} rect */
function crossesBox(a,b,rect){
  if(Math.abs(a.x-b.x)<.01)return a.x>rect.x+.01&&a.x<rect.x+rect.width-.01&&Math.max(a.y,b.y)>rect.y+.01&&Math.min(a.y,b.y)<rect.y+rect.height-.01;
  if(Math.abs(a.y-b.y)<.01)return a.y>rect.y+.01&&a.y<rect.y+rect.height-.01&&Math.max(a.x,b.x)>rect.x+.01&&Math.min(a.x,b.x)<rect.x+rect.width-.01;
  throw Error('Expected orthogonal routing');
}

test('ELK arranges shared plates and expanded controls without node overlaps or unrelated-node crossings',async()=>{
  for(const key of ['hierarchical','grouped','multilevel']){
    const model=analyze(examples[/** @type {'hierarchical'|'grouped'|'multilevel'} */(key)].source),projection=diagramProjection(model);
    const sizes=Object.fromEntries(projection.nodes.map(node=>[node.id,{width:node.kind==='stochastic'?260:168,height:node.kind==='stochastic'?310:116,anchor:36}]));
    const diagram=await layoutDiagram(projection,sizes,true,engine);
    assert.deepEqual(Object.keys(diagram.positions).sort(),projection.nodes.map(n=>n.id).sort());
    const boxes=Object.fromEntries(projection.nodes.map(node=>{const p=diagram.positions[node.id],size=sizes[node.id];return [node.id,{x:p.x-size.width/2,y:p.y-size.anchor,width:size.width,height:size.height}];}));
    for(const [i,a]of Object.entries(boxes))for(const [j,b]of Object.entries(boxes))if(i<j)assert.ok(!overlaps(a,b),`${key}: ${i}/${j} overlap`);
    for(const plate of diagram.plates){
      for(const id of plate.members){const b=boxes[id];assert.ok(b.x>=plate.x&&b.y>=plate.y&&b.x+b.width<=plate.x+plate.width&&b.y+b.height<=plate.y+plate.height,`${key}: ${id} outside plate`);}
      for(const [id,b]of Object.entries(boxes))if(!plate.members.includes(id))assert.ok(!overlaps(plate,b),`${key}: plate encloses unrelated ${id}`);
    }
    for(const edge of projection.edges)assert.ok(diagram.routes.some(route=>route.from===edge.from&&route.to===edge.to),`${key}: missing ${edge.from}/${edge.to}`);
    for(const route of diagram.routes){
      assert.ok(route.points.length>=2);
      for(const p of route.points)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
      for(let i=1;i<route.points.length;i++)for(const [id,box]of Object.entries(boxes))if(id!==route.from&&id!==route.to)assert.ok(!crossesBox(route.points[i-1],route.points[i],box),`${key}: ${route.from}/${route.to} crosses ${id}`);
    }
  }
});

test('distinct outgoing ports keep edges separable, and legal node names cannot collide with the layout root',async()=>{
  const model=analyze('parameters{real diagram;real a;real b;}model{diagram~normal(0,1);a~normal(diagram,1);b~normal(diagram,1);}');
  const p=diagramProjection(model),sizes=Object.fromEntries(p.nodes.map(n=>[n.id,{width:168,height:116,anchor:36}]));
  const result=await layoutDiagram(p,sizes,true,engine),out=result.routes.filter(route=>route.from==='diagram');
  assert.equal(out.length,2);assert.notDeepEqual(out[0].points[0],out[1].points[0]);
});

test('true crossings have jumps while shared endpoints and parallel paths do not',()=>{
  const horizontal=[{x:0,y:50},{x:100,y:50}];
  const vertical=[{x:50,y:0},{x:50,y:100}];
  assert.match(bridgePath(horizontal,[vertical]),/ Q50,42 55,50/);
  assert.match(bridgePath(vertical,[horizontal]),/ Q58,50 50,55/);
  assert.doesNotMatch(bridgePath(horizontal,[[{x:0,y:50},{x:0,y:100}]]),/Q/);
  assert.doesNotMatch(bridgePath(horizontal,[[{x:0,y:60},{x:100,y:60}]]),/Q/);
});

test('dragging moves only its edge endpoints and leaves stored routes intact',()=>{
  const route={id:'e',from:'a',to:'b',kind:'value',points:[{x:0,y:0},{x:0,y:50},{x:100,y:50},{x:100,y:100}]};
  const original=JSON.stringify(route),moved=movedRoute(route,{a:{x:20,y:10},b:{x:-5,y:3}});
  assert.deepEqual(moved.points[0],{x:20,y:10});assert.deepEqual(moved.points.at(-1),{x:95,y:103});assert.equal(JSON.stringify(route),original);
  for(let i=1;i<moved.points.length;i++)assert.ok(moved.points[i].x===moved.points[i-1].x||moved.points[i].y===moved.points[i-1].y);
});
