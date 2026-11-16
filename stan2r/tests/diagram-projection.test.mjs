import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, explore } from '../core/explorer-native.mjs';
import { diagramProjection } from '../diagram-projection.js';
import { examples } from '../examples.js';

test('hierarchical repeated variables share a plate, with scalar priors outside and real dependencies intact',()=>{
  const model=analyze(examples.hierarchical.source), original=JSON.stringify(model);
  const projection=diagramProjection(model);
  assert.deepEqual(projection.plates.map(p=>p.members.sort()),[['theta','y','z']]);
  assert.deepEqual(projection.nodes.map(n=>n.id).sort(),['mu','tau','theta','y','z']);
  for (const [from,to] of [['z','theta'],['mu','theta'],['tau','theta'],['theta','y']]) assert.ok(projection.edges.some(e=>e.from===from&&e.to===to));
  const full=diagramProjection(model,{}, {showStructure:true});
  assert.ok(full.edges.some(e=>e.from==='N'&&e.to==='y'&&e.kind==='dimension'));
  assert.equal(JSON.stringify(model),original,'diagram projection never mutates the checked model');
});

test('group effects and observations have distinct plates and indexed paths are labeled',()=>{
  const projection=diagramProjection(analyze(examples.grouped.source));
  assert.deepEqual(projection.plates.find(p=>p.dimension==='J')?.members.sort(),['theta','z']);
  assert.deepEqual(projection.plates.find(p=>p.dimension==='N')?.members.sort(),['eta','group','y']);
  assert.equal(projection.edges.find(e=>e.from==='theta'&&e.to==='eta')?.label,'indexed by group');
});

test('matching sizes do not merge cross-indexed or aggregate-dependent repetitions',()=>{
  const source=`data{int N;array[N]int<lower=1,upper=N> perm;}parameters{vector[N] z;}transformed parameters{real q=sum(z);vector[N] gathered=z[perm];vector[N] shared=rep_vector(q,N);}model{z~normal(0,1);}`;
  const projection=diagramProjection(analyze(source));
  const group=(/** @type {string} */ id)=>projection.plates.find(p=>p.members.includes(id))?.id;
  assert.notEqual(group('z'),group('gathered'));
  assert.notEqual(group('z'),group('shared'));
  assert.equal(projection.edges.find(e=>e.from==='z'&&e.to==='q')?.label,'sum');
  assert.equal(projection.edges.find(e=>e.from==='z'&&e.to==='gathered')?.label,'indexed by perm');
});

test('a dimension input also used as a distribution argument remains visible; scenario links reflect active arguments',()=>{
  const model=analyze('data{int<lower=1>N;}parameters{real a;vector[N] z;}model{a~normal(0,1);z~normal(a,N);}');
  const p=diagramProjection(model,{z:{args:{0:3}}});
  assert.ok(p.nodes.some(n=>n.id==='N'));
  assert.ok(p.edges.some(e=>e.from==='N'&&e.to==='z'&&e.kind==='value'));
  assert.ok(!p.edges.some(e=>e.from==='a'&&e.to==='z'));
  const fixed=diagramProjection(model,{z:{fixed:0}});
  assert.ok(!fixed.edges.some(e=>e.to==='z'));
});

test('switching diagram projections preserves exact seeded samples',()=>{
  const request={source:examples.grouped.source,data:examples.grouped.data,draws:40,seed:7};
  const before=explore(request);diagramProjection(before.model);diagramProjection(before.model,{}, {showStructure:true});
  assert.deepEqual(explore(request).samples,before.samples);
});

test('same-size group selectors stay with their per-observation targets, not the gathered source',()=>{
  const model=analyze('data{int N;array[N]int<lower=1,upper=N> perm;}parameters{vector[N] z;vector[N] y;}model{z~normal(0,1);for(n in 1:N)y[n]~normal(z[perm[n]],1);}');
  const p=diagramProjection(model);
  const group=(/** @type {string} */ id)=>p.plates.find(plate=>plate.members.includes(id))?.id;
  assert.equal(group('perm'),group('y'));
  assert.notEqual(group('z'),group('y'));
});

test('replication sizes count as structural unless also used as values or bounds',()=>{
  const model=analyze('data{int<lower=1>N;}parameters{real q;}transformed parameters{vector[N] x=rep_vector(q,N);}model{q~normal(0,1);}');
  const compact=diagramProjection(model);
  assert.ok(!compact.nodes.some(node=>node.id==='N'));
  const full=diagramProjection(model,{}, {showStructure:true});
  assert.ok(full.edges.some(edge=>edge.from==='N'&&edge.to==='x'&&edge.kind==='dimension'));
  const value=analyze('data{int<lower=1>N;}parameters{real q;}transformed parameters{vector[N] x=rep_vector(q+N,N);}model{q~normal(0,1);}');
  assert.ok(diagramProjection(value).edges.some(edge=>edge.from==='N'&&edge.to==='x'&&edge.kind==='value'));
});

test('declared data bounds are structural, while parameter bounds remain genuine constraints',()=>{
  const dataBound=analyze('data{int<lower=1>J;int<lower=1,upper=J> group;}parameters{real x;}model{x~normal(group,1);}');
  assert.ok(!diagramProjection(dataBound).nodes.some(n=>n.id==='J'));
  assert.ok(diagramProjection(dataBound,{}, {showStructure:true}).edges.some(e=>e.from==='J'&&e.to==='group'&&e.kind==='dimension'&&e.label==='data bound'));
  const parameterBound=analyze('data{real lo;}parameters{real<lower=lo>x;}model{x~normal(0,1);}');
  assert.ok(diagramProjection(parameterBound).edges.some(e=>e.from==='lo'&&e.to==='x'&&e.kind==='value'));
});

test('a duplicated data-bound reference does not obscure its elementwise likelihood role',()=>{
  const model=analyze('data{int N;array[N]int<lower=0>k;array[N]int<lower=0,upper=k>x;}parameters{real<lower=0,upper=1>p;}model{p~beta(2,2);x~binomial(k,p);}');
  const d=diagramProjection(model),edge=d.edges.find(e=>e.from==='k'&&e.to==='x');
  assert.equal(edge?.kind,'value');assert.equal(edge.elementwise,true);assert.equal(edge.label,undefined);
  assert.ok(d.plates.some(plate=>plate.members.includes('k')&&plate.members.includes('x')));
});
