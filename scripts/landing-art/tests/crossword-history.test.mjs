import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {build,readHistory,replay,sampleChanges} from '../cards/crossword.mjs';
import {loadFaces} from '../../../message-collage/core/fonts.js';
import {submit} from '../../../crossword/core/index.js';
import {fieldMask,morphField} from '../../../crossword/examples/suits.mjs';
const example=JSON.parse(readFileSync(new URL('../../../crossword/examples/heart-example.json',import.meta.url),'utf8'));
const saved=JSON.parse(readFileSync(new URL('../../../crossword/examples/suits-history.json',import.meta.url),'utf8'));

test('the suit targets keep the saved heart picture exactly',()=>{
 assert.deepEqual(fieldMask(morphField('heart','heart',0)),example.request.target.mask);
 assert.deepEqual(fieldMask(morphField('club','heart',1)),example.request.target.mask);
});

test('suit history chains real refinements from the saved heart back to a heart, keeping rejected states',()=>{
 const {segments,states}=readHistory();
 assert.deepEqual(segments.map(s=>`${s.from}>${s.to}`),['heart>diamond','diamond>spade','spade>club','club>heart']);
 segments.forEach((s,k)=>{
  const start=k?segments[k-1].result:example.result.crosswords[0].refined;
  const rescore=(/** @type {string[]} */mask,/** @type {any} */init)=>submit({entriesText:example.request.entriesText,target:{mask},init,search:{nIter:0}}).crosswords[0].orig.score;
  // The final state is a valid core result for its suit; the morph scores are the start grid's against the moving target.
  assert.equal(rescore(fieldMask(morphField(s.to,s.to,0)),s.result),s.result.score);
  const mid=s.morph[Math.floor(s.morph.length/2)];
  assert.equal(rescore(fieldMask(morphField(s.from,s.to,mid.t)),start),mid.score);
  assert.equal(s.morph.at(-1)?.t,1);
  for(let i=1;i<states[k].length;i++)if(!s.frames[i].accepted){assert.deepEqual(states[k][i].grid,states[k][i-1].grid);assert.equal(states[k][i].score,states[k][i-1].score)}
  const sampled=sampleChanges(states[k]);
  assert.ok(sampled.length>=4&&sampled.every(st=>states[k].includes(st)));
  assert.ok(sampled.every((st,i)=>!i||st.iteration>sampled[i-1].iteration));
  assert.equal(sampled.at(-1)?.grid.join('\n'),states[k].at(-1)?.grid.join('\n'));
 });
 assert.throws(()=>replay({...saved.segments[0],frames:saved.segments[0].frames.filter((/** @type {any} */_,/** @type {number} */i)=>i!==3)}),/not consecutive/);
});

test('preview plays one continuous history over the morphing target and rests on the saved heart',async()=>{
 const svg=await build(),{segments}=readHistory();
 const period=Number(svg.match(/data-period="([\d.]+)"/)?.[1]);
 assert.ok(period>=16&&period<=24);
 // Each layer is a strip of items 1,000 units apart; one stepped translation shows item i.
 /** @param {string} kind */
 const steps=kind=>[...(svg.match(new RegExp(`@keyframes crossword-${kind} \\{(.*?)\\} \\}`))?.[1]??'').matchAll(/([\d.]+)% \{ transform:translate\((-?\d+)px,0\)/g)].map(m=>[Number(m[1]),Number(m[2])]);
 for(const kind of ['targets','grids','captions']){
  const st=steps(kind);
  assert.ok(st.length>1&&st[0][0]===0&&st.every(([t,x],i)=>x===-1000*i&&(!i||t>st[i-1][0])),`${kind} step through their strip in order`);
 }
 assert.equal(steps('targets').length,1+segments.length*saved.morphSteps);
 assert.equal(svg.match(/class="trace"/g)?.length,1);
 // The moving cursor and curtain stay out of transformed groups, so browsers can move them without repainting the page.
 assert.match(svg,/<\/g><rect class="curtain"[^>]*\/><circle class="cursor"[^>]*\/><g class="captions">/);
 // Every displayed frame is exactly a recorded grid, fitted to the 192-unit box centred at (132, 102);
 // at rest the first, the saved heart, shows.
 const {states:all}=readHistory(),/** @type {string[][]} */expected=[example.result.crosswords[0].refined.grid.map((/** @type {string[]} */row)=>row.map(ch=>ch||'.').join('')),...all.flatMap(st=>sampleChanges(st).map(x=>x.grid))];
 const frames=[...(svg.match(/<g class="grids">(.*?)<\/g><\/g><g class="loss">/)?.[1]??'').matchAll(/<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)">(.*?)<\/g>/g)];
 assert.equal(frames.length,expected.length);
 assert.equal(steps('grids').length,expected.length);
 expected.forEach((grid,f)=>{
  const [,tx,ty,scale,paths]=frames[f],rows=grid.length,cols=grid[0].length,pitch=192/Math.max(rows,cols);
  assert.ok(Math.abs(Number(scale)-pitch)<1e-5&&Math.abs(Number(tx)-(132-cols*pitch/2))<1e-3&&Math.abs(Number(ty)-(102-rows*pitch/2))<1e-3,`frame ${f} fits the box`);
  const got=[...paths.matchAll(/<path class="l(\d+)" d="M([^"]+)"\/>/g)].flatMap(m=>m[2].split('L').map(pt=>{const [c,r]=pt.split(' ');return `${r},${c},${String.fromCodePoint(Number(m[1]))}`;})).sort();
  assert.deepEqual(got,grid.flatMap((row,r)=>[...row].flatMap((ch,c)=>ch==='.'?[]:[`${r},${c},${ch}`])).sort(),`frame ${f}`);
 });
 const keys=[...(svg.match(/@keyframes crossword-cursor \{(.*?)\} \}/)?.[1]??'').matchAll(/([\d.]+)% \{ transform:translate\(([\d.-]+)px/g)].map(m=>[Number(m[1]),Number(m[2])]);
 assert.ok(keys.length>20&&keys[0][0]===0&&keys.at(-1)?.[0]===100);
 assert.ok(keys.every((k,i)=>!i||(k[0]>keys[i-1][0]&&k[1]>=keys[i-1][1])),'the cursor moves forward in time and along the trace');
 assert.doesNotMatch(svg,/NaN|undefined/);
});

test('preview glyph ink bounds are centered in the cells, independent of font baseline metrics',async()=>{
 const svg=await build(),face=(await loadFaces(['Inter'],['bold'])).get('Inter|bold');assert.ok(face);
 let count=0;
 for(const match of svg.matchAll(/<marker id="crossword-letter-(\d+)"[^>]*>[\s\S]*?<path class="letters"[^>]+transform="translate\(([^)]+)\) scale\(([^)]+)\)"/g)){
  const glyph=/** @type {any} */(face.font.glyphForCodePoint(Number(match[1]))),box=glyph.bbox,[x,y]=match[2].split(' ').map(Number),[sx,sy]=match[3].split(' ').map(Number);
  assert.ok(Math.abs(x+sx*(box.minX+box.maxX)/2-.5)<1e-5);assert.ok(Math.abs(y+sy*(box.minY+box.maxY)/2-.5)<1e-5);count++;
 }
 assert.ok(count>=20);assert.match(svg,/x="\.14" y="\.14" width="\.9"/);assert.doesNotMatch(svg,/crossword-fill/);
});
