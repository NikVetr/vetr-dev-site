// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {generatePaletteTrace} from '../palette-trace.mjs';
import {build} from '../cards/color-optimization.mjs';
import {computeBounds} from '../../../color-optimization/optimizer/bounds.js';
import {decodeColor,isInGamut,normalizeWithRange,csRanges} from '../../../color-optimization/core/colorSpaces.js';
import {computeGamutExtent} from '../../../color-optimization/ui/gamutHull.js';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/palette-trace.json',import.meta.url),'utf8'));

test('Palette preview replays the actual winning baseline restart under all three displayed hard limits',async()=>{
 assert.deepEqual(await generatePaletteTrace(),fixture,'pinned baseline reproduces the complete fixture');
 assert.equal(fixture.score,Math.max(...fixture.scores.map((/** @type {{score:number}} */ s)=>s.score)));
 assert.equal(fixture.scores.find((/** @type {{run:number}} */ s)=>s.run===fixture.winnerRun).score,fixture.score);
 assert.deepEqual(fixture.trace.at(-1).hex,fixture.added);
 const bounds=computeBounds(fixture.inputs.map((/** @type {string} */ hex)=>decodeColor(hex,'oklab')),'oklab',fixture.config);
 for(const state of fixture.trace)for(const raw of state.raw){
  assert.ok(isInGamut(raw,'oklab','srgb'),'each displayed trajectory point is in gamut');
  const norm=/** @type {Record<string,number>} */(normalizeWithRange(raw,csRanges.oklab,'oklab'));
  for(const ch of ['l','a','b']){
   const [lo,hi]=/** @type {Record<string,number[]>} */(bounds.boundsByName)[ch];
   assert.ok(norm[ch]>=lo-1e-9&&norm[ch]<=hi+1e-9,`${ch} trajectory point remains inside its hard interval`);
  }
 }
});

test('Palette depicts independent tightening and a substantially smaller permitted projection',async()=>{
 const svg=await build();
 const states=[...svg.matchAll(/data-stage="Tighten ([Lab]) independently" data-widths="([^"]+)"/g)];
 assert.equal(states.length,15);
 const previous=[0,0,0];
 for(const [,label,values]of states){
  const channels=['L','a','b'],active=channels.indexOf(label),widths=values.split(',').map(Number);
  widths.forEach((w,i)=>{if(i!==active)assert.equal(w,previous[i]);else assert.ok(w>previous[i]);previous[i]=w;});
 }
 assert.deepEqual(previous,fixture.config.widths);
 /** @param {string} path */
 const points=path=>{const n=(path.match(/-?[\d.]+/g)||[]).map(Number);return Array.from({length:n.length/2},(_,i)=>[n[i*2],n[i*2+1]]);};
 /** @param {number[][]} p */
 const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
 const restricted=svg.match(/id="color-optimization-restricted"[^>]+d="([^"]+)"/);
 const original=svg.match(/id="color-optimization-clip-1"><path d="([^"]+)"/);
 assert.ok(restricted&&original);
 const polygon=points(restricted[1]);
 assert.ok(area(polygon)<area(points(original[1]))*.5,'the permitted region is less than half the full projected gamut');
 const extent=computeGamutExtent('oklab','srgb',1.1);
 const maxA=Math.max(Math.abs(extent.min.a),Math.abs(extent.max.a)),maxB=Math.max(Math.abs(extent.min.b),Math.abs(extent.max.b));
 const bounds=computeBounds(fixture.inputs.map((/** @type {string} */ hex)=>decodeColor(hex,'oklab')),'oklab',fixture.config);
 for(const [x,y]of polygon){
  const a=(x-251)/59*maxA,b=(90-y)/59*maxB;
  for(const [ch,v]of /** @type {[string,number][]} */([['a',a],['b',b]])){
   const [lo,hi]=/** @type {Record<string,number[]>} */(bounds.boundsByName)[ch];
   assert.ok(v>=lo-.5-.002&&v<=hi-.5+.002,'visible boundary respects asymmetric a/b limits after SVG rounding');
  }
 }
});
