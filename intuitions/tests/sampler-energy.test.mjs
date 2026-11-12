import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {compute,resolveParams,integrationStages,DIVERGENCE,spaceOf} from '../samplers/compute.js';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/hmc-before-energy.json',import.meta.url),'utf8'));
test('energy diagnostics preserve every previous seeded result and default sampler decision',()=>{
 for(const {params,sha256} of baseline.cases){const {integration,...prior}=compute(params);assert.equal(createHash('sha256').update(JSON.stringify(prior)).digest('hex'),sha256);}
});
test('recorded energy and teaching parts are the actual leapfrog trajectory, including divergence',()=>{
 for(const coordinates of /** @type {const} */(['centred','non-centred','quantile'])){
  const p=resolveParams({view:'funnel',coordinates,iterations:120,seed:1});const r=compute(p);const space=spaceOf(p);
  for(let i=0;i<r.trajectories.length;i++){
   const stages=integrationStages(p,/** @type {any} */(r),i),path=r.trajectories[i],energy=r.integration.energy[i];
   assert.equal(stages.length,3*(path.length/2-1)+1);
   for(let j=0;j<stages.length;j++){
    const s=stages[j];assert.equal(s.potential,-space.logDensity(s.q));assert.equal(s.total,s.potential+s.kinetic);
    if(j%3===0){assert.deepEqual(s.q,path.slice(2*j/3,2*j/3+2));assert.equal(s.total,energy[j/3]);}
    if(j){const prev=stages[j-1];
     if(s.phase==='position'){assert.deepEqual(s.p,prev.p);assert.deepEqual(s.q,[prev.q[0]+p.step*prev.p[0],prev.q[1]+p.step*prev.p[1]]);}
     else{assert.deepEqual(s.q,prev.q);assert.deepEqual(s.p,[prev.p[0]+.5*p.step*prev.gradient[0],prev.p[1]+.5*p.step*prev.gradient[1]]);}
    }
   }
   const failed=energy.findIndex((/** @type {number} */ h,/** @type {number} */ j)=>j>0&&!(h-energy[0]<=DIVERGENCE));
   assert.equal(failed>=0,r.divergent.includes(i));
   if(failed>=0){assert.equal(failed,energy.length-1);assert.equal(r.accepted[i],0);}
  }
 }
 const r=compute({view:'funnel'}),i=r.divergent[0],h=r.integration.energy[i];assert.ok(h.at(-1)-h[0]>DIVERGENCE,'default example has a visible finite threshold crossing');
});
