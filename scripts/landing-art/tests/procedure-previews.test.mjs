import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PREVIEW_SMOOTH} from '../cards/signature.mjs';
import {submit as correctSignature,DEFAULTS} from '../../../signature/core/index.js';
import {readSignature} from '../../../signature/core/input.js';
import {inflateSync} from 'node:zlib';
import {build as palette} from '../cards/color-optimization.mjs';
import {applyCvdHex} from '../../../color-optimization/core/cvd.js';

/** Decode the builder's RGB PNG with Sub row filtering. @param {string} uri */
function pixels(uri){
 const bytes=Buffer.from(uri.split(',')[1],'base64');let width=0,height=0;
 /** @type {Buffer[]} */ const chunks=[];
 for(let offset=8;offset<bytes.length;){const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);}if(type==='IDAT')chunks.push(data);offset+=12+length;}
 const raw=inflateSync(Buffer.concat(chunks));
 /** @type {number[][]} */
 const rows=[];
 for(let y=0;y<height;y++){
  const offset=y*(1+width*3);
  assert.equal(raw[offset],1);
  /** @type {number[]} */
  const row=[];
  for(let i=0;i<width*3;i++)row.push((raw[offset+1+i]+(i>=3?row[i-3]:0))%256);
  rows.push(row);
 }
 return rows.flatMap(row=>Array.from({length:width},(_,x)=>`#${row.slice(x*3,x*3+3).map(v=>v.toString(16).padStart(2,'0')).join('')}`));
}

test('Palette field pixels use the same Machado CVD transform as app swatches in every displayed colorspace',async()=>{
 const svg=await palette();
 for(const space of [0,1]){
  const fields=[0,1,2,3].map(cvd=>{const group=svg.match(new RegExp(`<g id="color-optimization-view-${space}-${cvd}">(.*?)</g>`));assert.ok(group);const image=group[1].match(/<image href="([^"]+)"/);assert.ok(image);return pixels(image[1]);});
  for(const [cvd,type]of ['none','deutan','protan','tritan'].entries())assert.deepEqual(fields[cvd].map(x=>x.toUpperCase()),fields[0].map(hex=>applyCvdHex(hex,type,1,'machado2009')));
 }
 assert.match(svg,/id="color-optimization-excluded" fill-rule="evenodd"/);
 assert.match(svg,/class="constraint-boundary" href="#color-optimization-restricted"/);
 assert.doesNotMatch(svg,/class="click"/);
});


test('Signature preview uses the rough input and materially smooths that same input through the actual core',()=>{
 const csv=readFileSync(new URL('../../../signature/examples/avery-quill-rough.csv',import.meta.url),'utf8');
 const baseline=readFileSync(new URL('../../../signature/examples/avery-quill.csv',import.meta.url),'utf8');
 const raw=readSignature({csv},'',DEFAULTS.input,[],[]),original=readSignature({csv:baseline},'',DEFAULTS.input,[],[]);
 assert.ok(raw&&original);
 assert.deepEqual(raw.map(st=>st.map(p=>p.t)),original.map(st=>st.map(p=>p.t)));
 const corrected=correctSignature({csv,smooth:PREVIEW_SMOOTH});
 /** @param {number[][]} points */
 const length=points=>points.reduce((sum,p,i)=>sum+(i?Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]):0),0);
 const rawLength=raw.reduce((sum,st)=>sum+length(st.map(p=>[p.x,p.y])),0);
 const originalLength=original.reduce((sum,st)=>sum+length(st.map(p=>[p.x,p.y])),0);
 const correctedLength=corrected.strokes.reduce((sum,st)=>sum+length(st.points),0);
 assert.ok(rawLength>originalLength*1.5);
 assert.ok(correctedLength<rawLength*.8);
 assert.equal(corrected.strokes.length,raw.length);
 assert.deepEqual(corrected.warnings,[]);
});
