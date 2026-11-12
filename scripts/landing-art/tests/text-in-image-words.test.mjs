import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {decodePng} from '../../../shared/decode-png.mjs';
import {submit} from '../../../text-in-image/core/index.js';
import {wordRuns,revealTime} from '../cards/text-in-image.mjs';
import {visibleWords} from '../../../assets/players/text-in-image.js';

test('Alice reveals every fitted glyph in whole words, left to right on each actual line',()=>{
 const text=readFileSync(new URL('../../../text-in-image/examples/alice-chapter-1.txt',import.meta.url),'utf8').trim().split(/\n\s*\n/).slice(0,10).join(' ');
 const result=submit({image:decodePng(readFileSync(new URL('../../../text-in-image/examples/alice-drink-me.png',import.meta.url))),text,layout:{wrap:'word',n_rounds:12},color:{background:'#14253d'},render:{contrast_adjust:true,glow:3}});
 const words=wordRuns(result.glyphs);
 assert.equal(words.length,950);
 assert.equal(words.map(w=>w.text).join(' '),text.replace(/\s+/g,' '));
 assert.deepEqual(words.flatMap(w=>w.glyphs),result.glyphs.filter(g=>g.char.trim()));
 for(let i=1;i<words.length;i++){assert.ok(words[i].line>=words[i-1].line);if(words[i].line===words[i-1].line)assert.ok(words[i].left>words[i-1].left);}
 const times=words.map((_,i)=>revealTime(i,words.length));
 assert.equal(times[0],250);assert.equal(times[19],3100);assert.equal(times.at(-1),14000);
 for(let i=0;i<times.length;i++){assert.equal(visibleWords(times,times[i]-.01),i);assert.equal(visibleWords(times,times[i]),i+1);}
 assert.equal(visibleWords(times,0),0);assert.equal(visibleWords(times,17999),words.length);
});
