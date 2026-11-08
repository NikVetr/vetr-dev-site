import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {submit} from '../core/index.js';
import {normalizeRequest} from '../core/request.js';
import {boxCost} from '../core/boxes.js';
import {BALANCED_STYLE} from '../presets.js';
import {candidateBoxes} from '../../scripts/landing-art/cards/name-tags.mjs';
const request={names:['Ada Lovelace','Qian Xuesen'],tray:JSON.parse(readFileSync(new URL('../examples/tray-4x3.json',import.meta.url),'utf8')),style:BALANCED_STYLE};

test('observational BFGS tracing preserves output and records genuine initialization, accepted iterates and final refinement',()=>{
 const baseline=submit(request);
 /** @type {Parameters<NonNullable<NonNullable<Parameters<typeof submit>[1]>['onFitTrace']>>[1][][]} */
 const traces=[];
 const traced=submit(request,{onFitTrace:(i,trace)=>(traces[i]??=[]).push(trace)});
 assert.deepEqual(traced,baseline);
 const isolated=submit(request,{onFitTrace:(_,trace)=>{trace.result.par[0]=NaN;trace.geometry.opt.start_w1=-1;trace.steps[0].par[0]=NaN;}});
 assert.deepEqual(isolated,baseline,'observer snapshots must not alter search state');
 for(const [i,runs]of traces.entries()){
  const first=runs[0],g=first.geometry;
  assert.deepEqual(first.steps[0].par,[g.opt.start_w1*g.totalWidth,g.opt.start_w2*g.totalWidth,g.opt.start_w2/g.meanIar2f*g.totalHeight]);
  for(const run of runs){
   const cost=boxCost({...run.geometry,iar2fWeight:run.stage===1?0:g.opt.iar2f_weight});
   for(const [j,step]of run.steps.entries()){
    assert.equal(cost(step.par),step.value);
    if(j)assert.ok(step.value<=run.steps[j-1].value+1e-8);
   }
  }
  const winner=runs.filter(r=>r.stage===1).reduce((a,b)=>b.result.value<a.result.value?b:a);
  const final=runs.at(-1);
  assert.ok(final);
  assert.deepEqual(final.steps[0].par,winner.result.par);
  const fit=traced.tags[i].fit;
  assert.deepEqual(final.result.par,[fit.w1,fit.w2,fit.h2]);
  assert.equal(final.result.value,fit.objective);
  const [top,bottom,helix]=candidateBoxes(g,final.result.par);
  assert.equal(top.w,fit.w1);assert.equal(top.h,g.ar1*fit.w1);
  assert.equal(bottom.w,fit.h2/g.ar3);assert.equal(bottom.h,fit.h2);
  assert.equal(helix.w,fit.w2);assert.equal(helix.h,fit.h2);
  if(i===0){
   // Independent check against the exported glyph geometry, not only optimizer parameters.
   const normalized=normalizeRequest(request),[cx,cy]=normalized.tray.centers[0];
   const [cw,ch]=normalized.tray.cell_in,unit=cw-cw/normalized.style.inner_margin_div;
   const glyphs=[...traced.sheets[0].svg.matchAll(/<path fill="#000000"[^>]* d="([^"]+)"/g)];
   const coordinates=glyphs.slice(0,3).flatMap(g=>(g[1].match(/-?\d*\.?\d+/g)??[]).map(Number));
   const xs=coordinates.filter((_,j)=>j%2===0),ys=coordinates.filter((_,j)=>j%2===1);
   const expectedLeft=96*(cx+normalized.style.name_center_adj_prop[0]*cw+top.x*unit);
   const expectedTop=96*(normalized.tray.page_in[1]-cy-normalized.style.name_center_adj_prop[1]*ch+top.y*unit);
   assert.ok(Math.abs(Math.min(...xs)-expectedLeft)<.002);
   assert.ok(Math.abs(Math.min(...ys)-expectedTop)<.002);
   assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-top.w*unit*96)<.002);
  }
 }
});
