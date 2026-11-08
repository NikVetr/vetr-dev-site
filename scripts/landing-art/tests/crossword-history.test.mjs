import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {build,sampleHistory} from '../cards/crossword.mjs';
import {loadFaces} from '../../../message-collage/core/fonts.js';
const example=JSON.parse(readFileSync(new URL('../../../crossword/examples/heart-example.json',import.meta.url),'utf8'));
const saved=JSON.parse(readFileSync(new URL('../../../crossword/examples/heart-history.json',import.meta.url),'utf8'));
const frames=saved.frames.map((/** @type {any} */f)=>({...f,grid:f.grid.map((/** @type {string} */r)=>[...r].map(c=>c==='.'?'':c))}));
test('recorded crossword history starts/ends at the actual saved optimizer result and retains rejection states',()=>{
 assert.equal(saved.seed,example.request.search.seed);assert.equal(saved.nIter,example.request.search.nIter);
 assert.equal(frames.length,saved.nIter+1);assert.deepEqual(frames[0].grid,example.result.crosswords[0].orig.grid);assert.deepEqual(frames.at(-1).grid,example.result.crosswords[0].refined.grid);
 assert.equal(frames[0].score,example.result.crosswords[0].orig.score);assert.equal(frames.at(-1).score,example.result.crosswords[0].refined.score);
 for(let i=1;i<frames.length;i++){assert.equal(frames[i].iteration,i);if(!frames[i].accepted){assert.deepEqual(frames[i].grid,frames[i-1].grid);assert.equal(frames[i].score,frames[i-1].score)}}
 const sampled=sampleHistory(frames);assert.equal(sampled[0],frames[0]);assert.equal(sampled.at(-1),frames.at(-1));assert.ok(sampled.every(f=>frames.includes(f)));
});
test('preview glyph ink bounds are centered in the cells, independent of font baseline metrics',async()=>{
 const svg=await build(),face=(await loadFaces(['Inter'],['bold'])).get('Inter|bold');assert.ok(face);
 let count=0;
 for(const match of svg.matchAll(/<g id="crossword-letter-(\d+)">[\s\S]*?<path class="letters"[^>]+transform="translate\(([^)]+)\) scale\(([^)]+)\)"/g)){
  const glyph=/** @type {any} */(face.font.glyphForCodePoint(Number(match[1]))),box=glyph.bbox,[x,y]=match[2].split(' ').map(Number),[sx,sy]=match[3].split(' ').map(Number);
  assert.ok(Math.abs(x+sx*(box.minX+box.maxX)/2-.5)<1e-5);assert.ok(Math.abs(y+sy*(box.minY+box.maxY)/2-.5)<1e-5);count++;
 }
 assert.ok(count>=20);assert.match(svg,/x="\.14" y="\.14" width="\.9"/);assert.doesNotMatch(svg,/crossword-fill/);
});
