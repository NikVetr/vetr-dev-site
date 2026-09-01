// The shipped faces, checked through the subsetter that puts them in a PDF.
//
// pdf-lib re-subsets every face on the way into a document, and the subsetter it
// uses copies glyph data verbatim and then -- when the subset it produced is small
// enough for the short `loca` format -- halves every offset to store it. Halving an
// odd offset truncates it, and every glyph after that one is read from a byte off.
//
// The failure is silent in exactly the wrong way: the on-screen preview reads the
// woff2 through the browser and stays perfect, while the exported PDF loses most of
// its type. It appeared the first time a Latin face grew past 128KB of outlines,
// because fontTools only aligns glyph data when it is writing the short format
// itself. `scripts/subset_fonts.py` now pads every glyph to four bytes; this asserts
// the property that padding buys, rather than the padding itself, so any future
// change to the font pipeline is checked against what actually matters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';

const manifest = JSON.parse(await readFile('data/fonts/manifest.json', 'utf8'));

/** The bytes fontkit would hand pdf-lib for these glyphs. */
function subsetBytes(font, gids) {
  const subset = font.createSubset();
  const mapped = gids.map((gid) => subset.includeGlyph(gid));
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */ const chunks = [];
    subset.encodeStream()
      .on('data', (chunk) => chunks.push(chunk))
      .on('error', reject)
      .on('end', () => resolve({ bytes: Buffer.concat(chunks), mapped }));
  });
}

/** Whether a glyph draws anything, without letting a corrupt read throw. */
function draws(font, gid) {
  try {
    const path = font.getGlyph(gid).path;
    return Boolean(path && path.commands.length);
  } catch {
    return false;
  }
}

// Enough glyphs to reach past the offsets where the short format runs out, spread
// across the whole face so the sample is not all in the Latin block at the front.
const SAMPLE = 80;

for (const face of manifest.faces) {
  test(`${face.file}: survives the subsetter pdf-lib embeds it with`, async () => {
    const font = fontkit.create(await readFile(`data/fonts/${face.file}.ttf`));
    const step = Math.max(1, Math.floor(font.numGlyphs / SAMPLE));
    /** @type {number[]} */ const gids = [];
    for (let gid = 1; gid < font.numGlyphs && gids.length < SAMPLE; gid += step) {
      if (draws(font, gid)) gids.push(gid);
    }
    assert.ok(gids.length > 20, `only ${gids.length} drawable glyphs sampled`);

    const { bytes, mapped } = await subsetBytes(font, gids);
    const out = fontkit.create(bytes);
    const lost = gids.filter((gid, i) => !draws(out, mapped[i]));
    assert.deepEqual(lost, [], `${lost.length} of ${gids.length} glyphs came back blank `
      + 'or unreadable -- the PDF would print them as gaps');
  });
}
