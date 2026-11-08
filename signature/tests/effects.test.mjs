import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {submit} from '../core/index.js';
import {timeline,influence,editGeometry,hairpins,suggestEffects} from '../core/effects.js';
const req=JSON.parse(readFileSync(new URL('../examples/request.json',import.meta.url),'utf8'));
test('absent and empty extensions preserve baseline geometry and exports exactly',()=> {
 const a=submit(req),b=submit({...req,effects:[],warps:[]});
 delete b.settings.effects;delete b.settings.warps;assert.deepEqual(a,b);
});
test('timeline encodes each pen lift and stays fixed through edits',()=> {
 const s=[[{x:0,y:0},{x:10,y:0}],[{x:20,y:0},{x:30,y:0}]];
 const t=timeline(s);assert.equal(t[0].from,0);assert.equal(t[1].to,1);assert(t[1].from>t[0].to);
 assert.equal(influence(.2,{from:.3,to:.6,falloff:.1}),0);
 assert.equal(influence(.3,{from:.3,to:.6,falloff:.1}),1);
 assert(Math.abs(influence(.25,{from:.3,to:.6,falloff:.1})-.5)<1e-12);
});
test('thickness multiplies widths while preserving coordinates; warp reaches SVG',()=> {
 const a=submit(req),b=submit({...req,effects:[{kind:'thickness',strength:2}]});
 a.strokes.forEach((s,k)=>s.points.forEach((p,i)=>assert.deepEqual(b.strokes[k].points[i],[p[0],p[1],2*p[2]])));
 const c=submit({...req,warps:[{x:30,y:30,dx:20,dy:0,radius:100}]});assert.notEqual(c.svg,a.svg);
 assert(c.strokes[0].points.some((p,i)=>p[0]>a.strokes[0].points[i][0]));
});
test('malformed edits produce structured field errors',()=> {
 for(const extra of [{effects:[{from:.9,to:.1}]},{effects:[{hairpin:'fake'}]},{warps:[{radius:0}]},{effects:[{kind:'thickness',strength:0}]},{effects:[{invented:true}]}])
 assert.throws(()=>submit({...req,...extra}),e=>e.code==='INVALID_REQUEST'&&e.issues.length>0);
});
test('hairpin modes differ, preserve protects the detected turn, suggestions are neutral',()=> {
 const raw=[Array.from({length:41},(_,i)=>({x:i<=20?i:40-i,y:i<=20?0:(i-20)*.03}))];
 const make=()=>[{x:Float64Array.from(raw[0],p=>p.x),y:Float64Array.from(raw[0],p=>p.y),s:Float64Array.from(raw[0],(_,i)=>i)}];
 assert(hairpins(make()[0].x,make()[0].y,2).length);
 const results=['preserve','round','loop'].map(hairpin=>{const st=make();editGeometry(st,raw,[{kind:'smooth',from:0,to:1,strength:1,falloff:0,hairpin}],[],40);return st[0];});
 assert.equal(results[0].x[20],20);assert.notDeepEqual(results[0],results[1]);assert.notDeepEqual(results[1],results[2]);
 assert(suggestEffects(raw).every(e=>e.strength===0));
});
test('edits affect every morph source method and leave the target unchanged',()=> {
 for(const method of ['wavelet','linear','corrected']) {
  const morph={target:{strokes:req.strokes},method,props:[0,.5,1]};
  const a=submit({...req,morph}),b=submit({...req,morph,warps:[{x:30,y:30,dx:15,dy:3,radius:100}],effects:[{kind:'thickness',strength:2}]});
  assert.notDeepEqual(a.morph.frames[0],b.morph.frames[0]);
  assert.deepEqual(a.morph.frames[2],b.morph.frames[2]);
  assert(b.morph.frames.every(f=>f.strokes.every(s=>s.points.every(p=>p.every(Number.isFinite)))));
 }
});
test('first-stroke morph retains whole-signature effect coordinates',()=> {
 const strokes=[{points:[{x:0,y:0},{x:10,y:10},{x:20,y:0}]},{points:[{x:30,y:0},{x:40,y:10},{x:50,y:0}]}];
 const r={strokes,morph:{target:{strokes},strokes:'first',method:'corrected',props:[0,1]}};
 const a=submit(r),b=submit({...r,effects:[{kind:'thickness',from:.75,to:1,falloff:0,strength:2}]});
 assert.deepEqual(a.morph,b.morph);
});

test('CLI uses the identical extended request computation',()=> {
 const request={...req,effects:[{kind:'smooth',from:.2,to:.8,strength:1,hairpin:'round'},{kind:'thickness',strength:1.5}],warps:[{x:30,y:30,dx:4,dy:2,radius:20}]};
 const cli=spawnSync(process.execPath,[fileURLToPath(new URL('../cli.mjs',import.meta.url))],{input:JSON.stringify(request),encoding:'utf8'});
 assert.equal(cli.status,0,cli.stderr);assert.deepEqual(JSON.parse(cli.stdout),submit(request));
});
