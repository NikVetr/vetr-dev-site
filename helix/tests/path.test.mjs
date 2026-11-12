import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {submit,designDrawing} from '../core/index.js';
import {normalizeRequest} from '../core/request.js';
import {hasIntersections,pathFrame} from '../core/path.js';
import {smoothPoints as direct} from '../../signature/core/smooth.js';
import {smoothPoints as publicApi} from '../../signature/core/index.js';

/** @type {[number,number][]} */const arc=Array.from({length:80},(_,i)=>[50-50*Math.cos(Math.PI*i/79),50*Math.sin(Math.PI*i/79)]);
/** @type {[number,number][]} */const bend=Array.from({length:100},(_,i)=>[i,12*Math.sin(i/99*2*Math.PI)]);
const path={points:arc,length:120,width:15,smoothing:.4};

test('absent/null path preserves original request and result; Signature public helper remains the same function',()=>{
  for(const mode of ['helix','braid'])assert.deepEqual(submit({mode,path:null}),submit({mode}));
  assert.equal(direct,publicApi);
});

test('drawn bends use open nonfolding envelopes and preserve endpoints and requested arc length',()=>{
  for(const points of [arc,bend,[[0,0],[50,0],[50,1],[0,1]]]){
    const f=pathFrame({...path,points:/** @type {[number,number][]} */(points)});
    assert.ok(!hasIntersections(f.envelope,true));assert.ok(f.width>0&&f.width<=path.width);
    assert.ok(Math.abs(f.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-f.points[i][0],p[1]-f.points[i][1]),0)-120)<1e-9);
    assert.deepEqual(f.at(0,0),f.points[0]);
    const end=f.at(1,0);assert.ok(Math.hypot(end[0]-f.points[f.points.length-1][0],end[1]-f.points[f.points.length-1][1])<1e-9);
    if(points===arc)assert.equal(f.width,15);
  }
  const tight=pathFrame({...path,points:[[0,0],[50,0],[50,1],[0,1]]});assert.ok(tight.narrowed);assert.ok(tight.width<1);
});

test('path geometry is deterministic and all export styles share exact transformed canvas and fills',()=>{
  for(const mode of ['helix','braid']){
    const r=submit({mode,path});assert.deepEqual(submit(r.request),r);
    const g=/** @type {any} */(r.geometry);assert.equal(g.path.length,120);assert.ok(g.fills.length>0);
    for(const group of g.fills)for(const poly of group.polygons)for(const ring of poly)for(let i=0;i<ring.length;i+=2){assert.ok(Number.isFinite(ring[i]));assert.ok(ring[i]>=0&&ring[i]<=r.width);assert.ok(ring[i+1]>=0&&ring[i+1]<=r.height);}
    for(const style of ['outline','strokes']){const other=submit({...r.request,output:{...r.request.output,style}});assert.equal(other.width,r.width);assert.equal(other.height,r.height);assert.deepEqual(other.geometry,r.geometry);}
    assert.ok(designDrawing(normalizeRequest({mode,path})).fills.length>0);
  }
});

test('bad guide shapes fail explicitly without exporting crossed or degenerate geometry',()=>{
  for(const points of [[],[[0,0],[0,0]],[[0,0],[10,10],[0,10],[10,0]],[[0,0],[1,0],[0,0]],[[0,0],[Infinity,1]]])assert.throws(()=>submit({path:{...path,points}}));
  assert.throws(()=>submit({path:{...path,width:0}}),/width/);
  assert.throws(()=>submit({path:{...path,points:Array(2049).fill([0,0])}}),/2048/);
});

test('CLI uses the same drawn geometry and reports path rejection as structured JSON',()=>{
  const input={mode:'braid',path};
  const run=spawnSync(process.execPath,['helix/cli.mjs'],{input:JSON.stringify(input),encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});
  assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),submit(input));
  const bad=spawnSync(process.execPath,['helix/cli.mjs'],{input:JSON.stringify({path:{points:[[0,0],[1,1],[0,1],[1,0]]}}),encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});
  assert.notEqual(bad.status,0);assert.equal(JSON.parse(bad.stderr).error.code,'crossing_path');
});
