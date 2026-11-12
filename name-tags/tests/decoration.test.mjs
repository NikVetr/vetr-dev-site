import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {submit,NameTagsError} from '../core/index.js';
import {normalizeRequest} from '../core/request.js';
import {customDecoration,fitCustomDecoration} from '../core/decoration.js';
import {tagHelix} from '../core/helix.js';
import {layoutDnaTag,measureTags} from '../core/layout.js';
import {rMersenneTwister} from '../../shared/rng.js';

const request={names:['Ada Lovelace','Alan Turing']};
const glyphPaths=(/** @type {string} */svg)=>[...svg.matchAll(/<path fill="#000000" fill-rule="evenodd" d="[^"]*"\/>/g)].map(m=>m[0]);

test('absent and null custom designs preserve legacy output; actual custom fills preserve every text path and fit',()=>{
 const baseline=submit(request);assert.deepEqual(submit({...request,decoration_design:null}),baseline);
 for(const design of [{mode:'helix',helix:{rotation:90}},{mode:'braid',braid:{width:20}},{mode:'braid',path:{points:[[0,0],[30,10],[60,0]],length:100,width:10,smoothing:1}}]){
  const result=submit({...request,decoration_design:design});
  assert.notEqual(result.sheets[0].svg,baseline.sheets[0].svg);
  assert.deepEqual(result.tags.map(({decoration_fit,...tag})=>tag),baseline.tags);
  for(const path of glyphPaths(baseline.sheets[0].svg))assert.ok(glyphPaths(result.sheets[0].svg).includes(path),'existing glyph outline changed');
  for(const tag of result.tags){const{box_in:b,bounds_in:c}=tag.decoration_fit;assert.ok(c[0]>=b[0]-1e-10&&c[1]>=b[1]-1e-10&&c[2]<=b[2]+1e-10&&c[3]<=b[3]+1e-10);}
 }
 const one=submit({names:['Cher'],decoration_design:{mode:'braid'}});assert.equal(one.tags[0].decoration,'none');assert.equal(one.tags[0].decoration_fit,undefined);
});

test('custom geometry fits uniformly and retains original straight underline descender gaps',()=>{
 const s=normalizeRequest({names:['Alan Turing']}),center=s.tray.centers[0];
 const {measured,meanIar2f}=measureTags(s.lines,[center],s.font.family,s.tray.cell_in,s.tray.page_in,s.style);
 const tag=layoutDnaTag(measured[0],center,s.tray.cell_in,s.style,meanIar2f,rMersenneTwister(s.seed).unif,()=>{});
 const adj=s.style.name_center_adj_prop.map((n,i)=>n*s.tray.cell_in[i]);
 const design=customDecoration(/** @type {any} */(normalizeRequest({...request,decoration_design:{mode:'braid'}}).decoration_design));
 const fitted=fitCustomDecoration(tag,adj,design),legacy=tagHelix(tag,adj);
 assert.deepEqual(fitted.gaps,legacy.gaps);assert.ok(fitted.gaps?.length,'Turing exercises a descender gap');assert.ok(fitted.underline.length);
 const[b0,b1,b2,b3]=fitted.fit.bounds_in,[s0,s1,s2,s3]=design.box;
 assert.ok(Math.abs((b2-b0)/(s2-s0)-(b3-b1)/(s3-s1))<1e-10,'fit must be uniform');
 for(const poly of fitted.underline)for(const ring of poly)for(let i=1;i<ring.length;i+=2)assert.ok(Math.abs(ring[i]-fitted.fit.box_in[1])<.025,'retired helix curl leaked into underline');
});

test('nested errors are structured and custom requests export identically through the CLI',()=>{
 for(const bad of [
  {...request,decoration_design:{mode:'braid',braid:{width:-1}}},
  {...request,decoration:'none',decoration_design:{mode:'helix'}},
  {...request,decoration_design:{path:{points:[[0,0],[0,0]]}}},
 ])assert.throws(()=>submit(bad),e=>e instanceof NameTagsError&&e.issues.some(i=>i.path.startsWith('decoration_design')));
 const req={...request,decoration_design:{mode:'braid',braid:{twists:3}}},expected=submit(req),dir=mkdtempSync(join(tmpdir(),'name-tags-custom-'));
 try{
  const run=spawnSync(process.execPath,[fileURLToPath(new URL('../cli.mjs',import.meta.url)),'--out',dir],{input:JSON.stringify(req),encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});
  assert.equal(run.status,0,run.stderr);const actual=JSON.parse(run.stdout);
  actual.sheets=actual.sheets.map((/** @type {any} */sheet)=>{const{path,...rest}=sheet;return{...rest,svg:readFileSync(resolve(path),'utf8')}});
  assert.deepEqual(actual,expected);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('drawn-band narrowing stays visible in custom result diagnostics and warnings',()=>{
 const result=submit({names:['Ada Lovelace'],decoration_design:{mode:'braid',path:{points:[[0,0],[20,0],[25,5],[20,10],[0,10]],length:100,width:30,smoothing:.5}}});
 assert.equal(result.decoration_path?.narrowed,true);assert.equal(result.decoration_path?.requestedWidth,30);
 assert.ok(result.decoration_path.width>0&&result.decoration_path.width<30);
 assert.ok(result.warnings.some(w=>w.includes('narrowed')));
});
