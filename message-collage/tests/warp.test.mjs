import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {submit,loadFaces,renderSvg,renderPdf,CollageError} from '../core/index.js';
import {applyMatrix,glyphGeometry,warpMessages} from '../core/warp.js';
import {overlaps} from '../core/rotation.js';
import {createWarpGrid,gridGradientBound} from '../core/warp-grid.js';

const example=JSON.parse(readFileSync(new URL('../examples/request.json',import.meta.url),'utf8'));
const baseline=submit({...example,warp_strength:0});
const warped=submit({...example,warp_strength:1});

test('warp is opt-in, deterministic and leaves packing, angles and the baseline exports intact',async()=>{
 const before=await baseline, after=await warped, omitted=await submit(example);
 assert.deepEqual(before,omitted);
 assert.equal(before.warp,undefined);
 assert.ok(before.lines.every(line=>!line.glyph_transforms));
 assert.deepEqual(after.card,before.card);
 assert.deepEqual(after.runs,before.runs);
 assert.deepEqual(after.messages,before.messages);
 assert.deepEqual(after.lines.map(({glyph_transforms,...line})=>line),before.lines);
 assert.deepEqual(after,await submit({...example,warp_strength:1}));
 assert.ok(after.warp);
 assert.ok(after.warp.accepted_steps>0);
 assert.ok(after.warp.glyph_box_area_after>after.warp.glyph_box_area_before*1.03,'the example gains at least 3% glyph-box area, avoiding the ineffective isolated-node result');
 assert.ok(after.warp.max_stretch<=1.12 && after.warp.min_stretch>=0.91);
 const faces=await loadFaces(before.request.fonts,before.request.styles);
 assert.equal(renderSvg(omitted,faces),renderSvg(before,faces));
 const clipped=structuredClone(before); clipped.request.warp_strength=1; clipped.lines[0].x_in=-100;
 assert.throws(()=>warpMessages(clipped,faces),error=>error instanceof CollageError && error.code==='layout_collision');
 for(const strength of [-0.1,1.01,'yes']) await assert.rejects(submit({...example,warp_strength:strength}),error=>error instanceof CollageError && error.issues.some(i=>i.path==='warp_strength'));
});

test('deformed glyph bounds remain inside the card, with no newly intersecting pairs',async()=>{
 for(const seed of [1,2]){
  const after=seed===1?await warped:await submit({...example,seed,warp_strength:0.6});
  const faces=await loadFaces(after.request.fonts,after.request.styles);
  assert.ok(after.warp);
  const grid=createWarpGrid(after.card.width_in,after.card.height_in);
  assert.equal(after.warp.basis,'cubic-bspline');
  assert.deepEqual(after.warp.cells,{x:grid.cellsX,y:grid.cellsY});
  assert.equal(after.warp.nodes.length,grid.nodes.length);
  grid.nodes=after.warp.nodes;
  assert.ok(gridGradientBound(grid)<=after.warp.gradient_bound+1e-12,'the entire grid is certified, including empty regions and free outer controls');
  const glyphs=glyphGeometry(after,faces);
  /** @type {number[][]} */ const affines=[];
  const originals=glyphs.map(g=>g.corners.map(p=>applyMatrix(g.matrix,p)));
  const polygons=glyphs.map(g=>{
   const saved=after.lines[g.line].glyph_transforms;
   assert.ok(saved);
   const m=/** @type {import('../core/warp.js').Matrix} */ (saved[g.char].map(v=>v/72));
   assert.ok(m.every(Number.isFinite));
   // Both coordinates and all outline control points are bounded by these quadrilaterals.
   const points=g.corners.map(p=>applyMatrix(m,p));
   assert.ok(points.every(([x,y])=>x>=0&&y>=0&&x<=after.card.width_in&&y<=after.card.height_in));
   const before=g.matrix, determinant=before[0]*before[3]-before[1]*before[2];
   const a=(m[0]*before[3]-m[2]*before[1])/determinant,b=(m[1]*before[3]-m[3]*before[1])/determinant;
   const c=(m[2]*before[0]-m[0]*before[2])/determinant,d=(m[3]*before[0]-m[1]*before[2])/determinant;
   affines.push([a,b,c,d,m[4]-a*before[4]-c*before[5],m[5]-b*before[4]-d*before[5]]);
   const tr=a*a+b*b+c*c+d*d,det=a*d-b*c,disc=Math.sqrt(Math.max(0,tr*tr-4*det*det));
   const high=Math.sqrt((tr+disc)/2),low=Math.sqrt((tr-disc)/2),strength=after.request.warp_strength;
   assert.ok(det>0,'no reflected/folded letter');
   assert.ok(high<=1+0.12*strength+1e-10 && low>=1-0.09*strength-1e-10);
   assert.ok(high/low<=1+0.16*strength+1e-10);
   return points;
  });
  // Exhaustive comparison is independent of the production spatial hash.
  let sharedPairs=0;
  for(let i=0;i<polygons.length;i++) if(polygons[i].length) for(let j=0;j<i;j++) if(polygons[j].length){
   const beforeOverlap=overlaps(originals[i],originals[j]);
   if(overlaps(polygons[i],polygons[j])) assert.ok(beforeOverlap,`new collision ${seed}:${i},${j}`);
   if(beforeOverlap){
    sharedPairs++;
    assert.ok(affines[i].every((v,k)=>Math.abs(v-affines[j][k])<1e-9),`shared affine map preserves relative ink geometry ${seed}:${i},${j}`);
   }
  }
  assert.ok(sharedPairs>0,'fixture exercises overlapping italic/control boxes');
 }
});

test('all warped export formats use the same saved glyph matrices and preserve characters',async()=>{
 const result=await warped,faces=await loadFaces(result.request.fonts,result.request.styles);
 const outlined=renderSvg(result,faces),text=renderSvg(result,faces,{text:'embedded'}),pdf=new TextDecoder().decode(renderPdf(result,faces));
 assert.equal(renderSvg(JSON.parse(JSON.stringify(result)),faces),outlined);
 assert.ok(result.lines[0].glyph_transforms);
 const first=result.lines[0].glyph_transforms[0];
 const values=(/** @type {number[]} */ m)=>m.map(v=>v.toFixed(12)).join(' ');
 assert.ok(outlined.includes(`matrix(${values(first)})`));
 assert.ok(text.includes(`matrix(${values([first[0],first[1],-first[2],-first[3],first[4],first[5]])})`));
 assert.ok(pdf.includes(`${values([first[0],-first[1],first[2],-first[3],first[4],result.card.height_in*72-first[5]])} cm`));
 assert.equal([...text.matchAll(/<text [^>]+>(.*?)<\/text>/g)].map(m=>m[1]).join(''),result.lines.map(line=>line.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')).join(''));
 assert.equal((text.match(/<text /g)||[]).length,result.lines.reduce((n,line)=>n+Array.from(line.text).length,0));
 assert.ok(text.includes('@font-face'));
 for(const [,operands] of pdf.matchAll(/q ([^\n]+) cm \/G/g)) assert.match(operands,/^-?\d+\.\d+( -?\d+\.\d+){5}$/,'PDF matrix operands must use plain decimal, including tiny shears');
 assert.ok(!outlined.includes('data:image')&&!text.includes('data:image'),'text remains vector/selectable, not flattened');
});
