import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {decodePng} from '../../../shared/decode-png.mjs';
import {measureChars} from '../../../text-in-image/core/font.js';
import {excerpt,fitIllustration,wordRuns,revealTime} from '../cards/text-in-image.mjs';
import {visibleWords} from '../../../assets/players/text-in-image.js';

const text=excerpt();
const image=decodePng(readFileSync(new URL('../../../text-in-image/examples/alice-drink-me.png',import.meta.url)));
const result=fitIllustration(image,text,'#14253d',3);

test('Alice reveals every fitted glyph in whole words, left to right on each actual line',()=>{
 const words=wordRuns(result.glyphs);
 assert.equal(words.length,1441);
 assert.equal(words.map(w=>w.text).join(' '),text.replace(/\s+/g,' '));
 assert.deepEqual(words.flatMap(w=>w.glyphs),result.glyphs.filter(g=>g.char.trim()));
 for(let i=1;i<words.length;i++){assert.ok(words[i].line>=words[i-1].line);if(words[i].line===words[i-1].line)assert.ok(words[i].left>words[i-1].left);}
 const times=words.map((_,i)=>revealTime(i,words.length));
 assert.equal(times[0],250);assert.equal(times[19],3100);assert.equal(times.at(-1),14000);
 for(let i=0;i<times.length;i++){assert.equal(visibleWords(times,times[i]-.01),i);assert.equal(visibleWords(times,times[i]),i+1);}
 assert.equal(visibleWords(times,0),0);assert.equal(visibleWords(times,17999),words.length);
});

test('the text covers continuous parts of the source drawing and reaches both shoes', () => {
  const {width, height, data} = image;
  const advances = measureChars([...new Set(text)]).width;
  const em = result.font_size_px / result.settings.render.scale * (1 + 2 * result.settings.render.margin);
  /** @type {Map<number, Uint8Array>} */
  const lines = new Map();
  for (const g of result.glyphs) {
    if (!g.char.trim() || g.x === null || g.y === null) continue;
    const y = Math.round((1 - g.y) * height - 1), x = g.x * width - 1;
    let ink = lines.get(y);
    if (!ink) { ink = new Uint8Array(width); lines.set(y, ink); }
    const advance = advances.get(g.char);
    assert.ok(advance !== undefined);
    ink.fill(1, Math.max(0, Math.floor(x)), Math.ceil(x + em * advance));
  }
  // Detect missing strips along an opaque baseline, including the sleeve and apron.
  for (const [y, ink] of lines) {
    let gap = 0;
    for (let x = 0; x < width; x++) {
      gap = !ink[x] && data[4 * (y * width + x) + 3] > 160 ? gap + 1 : 0;
      assert.ok(gap < width / 10, 'empty strip across the source at row ' + y);
    }
  }
  // Justified lines across the head (above the chin, row 100) hold enough words that
  // stretched spaces open no holes: ten paragraphs left gaps of six letter heights on the forehead.
  const letter = em * measureChars(['M']).height;
  for (const [y, ink] of lines) {
    if (y > 100) continue;
    let gap = 0;
    for (let x = ink.indexOf(1); x <= ink.lastIndexOf(1); x++) {
      gap = !ink[x] && data[4 * (y * width + x) + 3] > 160 ? gap + 1 : 0;
      assert.ok(gap < 2.5 * letter, 'a wide gap between words across the head at row ' + y);
    }
  }
  // Each separate stocking and shoe should receive a word at least once per
  // line pitch, even if another word already occupied the other leg.
  const pitch = letter * result.settings.layout.line_height;
  for (let y = Math.ceil(height * 0.80); y < height - 12; y++) {
    const nearby = [...lines].filter(([row]) => Math.abs(row - y) <= pitch);
    for (let x = 0; x < width;) {
      if (data[4 * (y * width + x) + 3] <= 175) { x++; continue; }
      const start = x++;
      while (x < width && data[4 * (y * width + x) + 3] > 175) x++;
      if (x - start >= 8) assert.ok(nearby.some(([, ink]) => ink.subarray(start, x).some(Boolean)),
        'missing stocking or shoe at row ' + y);
    }
  }
});
