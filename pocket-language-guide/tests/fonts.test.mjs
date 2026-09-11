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
import { readFile, readdir } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { parseTable } from '../core/csv.js';
import { resolveField } from '../core/fonts.js';

const manifest = JSON.parse(await readFile('data/fonts/manifest.json', 'utf8'));

/**
 * The bytes fontkit would hand pdf-lib for these glyphs.
 * @param {any} font @param {number[]} gids
 */
function subsetBytes(font, gids) {
  const subset = font.createSubset();
  const mapped = gids.map((gid) => subset.includeGlyph(gid));
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */ const chunks = [];
    subset.encodeStream()
      .on('data', (/** @type {Buffer} */ chunk) => chunks.push(chunk))
      .on('error', reject)
      .on('end', () => resolve({ bytes: Buffer.concat(chunks), mapped }));
  });
}

/**
 * Whether a glyph draws anything, without letting a corrupt read throw.
 * @param {any} font @param {number} gid
 */
function draws(font, gid) {
  try {
    const path = font.getGlyph(gid).path;
    return Boolean(path && path.commands.length);
  } catch {
    return false;
  }
}

// Every face has to be able to draw Latin, whatever script it is for: the gloss
// column is the reader's language and the romanisation column is Latin by
// definition, and `core/pack.js` joins a region's emergency numbers with U+00B7.
//
// Noto Sans Arabic carries no Latin at all -- nineteen codepoints in U+0020..U+024F
// and not one letter. Because `scripts/subset_fonts.py` intersects the coverage it
// asks for with the source's own cmap, asking that stack for Latin silently yielded
// nothing, and every Latin character on an Arabic sheet drew glyph 0 -- which in
// Noto is a visible box, not a blank. The browser preview substituted a system font
// and hid it; the PDF embeds only the subset face and printed the boxes, in the
// emergency numbers among other places. The Arabic faces now merge in the Noto Sans
// Latin subset. This asserts the coverage rather than the merge, so a stack added
// from a family with the same gap is caught the same way.
const LATIN_REQUIRED = Array.from({ length: 0x7e - 0x21 + 1 }, (_, i) => String.fromCharCode(0x21 + i))
  .join('')
  // Not ASCII, but emitted by the sheet itself: U+00B7 between emergency numbers,
  // U+2026 as the open-slot marker, and the dashes as break opportunities.
  + '\u00b7\u2013\u2014\u2026';

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

  test(`${face.file}: draws Latin`, async () => {
    const font = fontkit.create(await readFile(`data/fonts/${face.file}.ttf`));
    const missing = [...LATIN_REQUIRED].filter((ch) => {
      const [glyph] = font.glyphsForString(ch);
      return !glyph || glyph.id === 0 || !draws(font, glyph.id);
    });
    assert.deepEqual(missing, [], `${missing.length} characters have no glyph in this face `
      + 'and would print as boxes in the PDF');
  });
}


// Every character a reader's respelling can emit, in the face that would draw it.
//
// The respelling column is the reader's own script -- `FIELD_SIDE.respell` is
// `source` in `core/fonts.js` -- so a Korean reader's Japanese sheet draws Hangul in
// the CJK-KR face and a Hindi reader's draws Devanagari. The faces are subset per
// script from what the corpus actually contains, and a rule table emits characters
// the *corpus* never does: the Korean table reaches 1,004 syllable blocks, 42 of them
// outside KS X 1001, and the Arabic one uses `پ ڤ گ چ ژ`, which no Arabic row writes.
//
// A character the subset missed does not fail anything at build time. It draws a box
// in the exported PDF, on a card someone is holding in a foreign country, which is
// the worst place in this project for a silent failure -- so it is asserted here,
// from `data/respell/charset.json`, which `scripts/respell_check.mjs --charset`
// derives from the tables' real output over all sixteen targets.
const charset = JSON.parse(await readFile('data/respell/charset.json', 'utf8'));
const byKey = (/** @type {Record<string,string>[]} */ rows, /** @type {string} */ key) => (
  Object.fromEntries(rows.map((r) => [r[key], r])));
const languages = byKey(parseTable(await readFile('data/registry/languages.csv', 'utf8')), 'bcp47');
const scripts = byKey(parseTable(await readFile('data/registry/scripts.csv', 'utf8')), 'iso15924');

for (const [reader, chars] of Object.entries(charset)) {
  test(`${reader}: every character its respellings emit has a glyph`, async () => {
    const iso = languages[reader]?.script;
    const stack = scripts[iso]?.font_stack;
    assert.ok(stack, `no font stack for ${reader} (script ${iso})`);
    const file = manifest.faces.find((/** @type {any} */ f) => f.stack === stack
      && f.weight === 400 && !f.italic)?.file;
    assert.ok(file, `no regular face in stack ${stack}`);
    const font = fontkit.create(await readFile(`data/fonts/${file}.ttf`));
    const missing = [.../** @type {string} */ (chars)].filter((c) => !/\s/.test(c)
      && !font.hasGlyphForCodePoint(/** @type {number} */ (c.codePointAt(0))));
    assert.deepEqual(missing, [], `${stack} cannot draw ${missing.map(
      (c) => `${c} U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`).join(', ')}`);
  });
}

test('a grafted face credits the font it borrowed glyphs from', async () => {
  // **The graft moves outlines, so the copyright has to move with them.** Two faces
  // here are built from more than one donor: a Latin face borrows the two conscript
  // blocks from Constructium, and a face whose family ships no Latin borrows Latin
  // from Noto Sans. Every donor is OFL 1.1, which asks that a redistributed copy
  // carry the notice -- and a font carries its own, in nameID 0. For a while the
  // Latin faces held Kreative Software's pIqaD and tengwar outlines under a notice
  // naming only the Noto authors, which is a licence gap rather than untidiness.
  const notices = async (/** @type {string} */ file) => {
    const font = fontkit.create(await readFile(`data/fonts/${file}.ttf`));
    return String(font.copyright ?? '');
  };

  // The conscript graft. `latin` is where it lands, because `scripts.csv` points both
  // `Piqd` and `Teng` at that stack rather than giving two languages a stack each.
  const latin = await notices('latin-400');
  assert.match(latin, /Noto/, 'the primary donor');
  assert.match(latin, /Kreative Software/, 'and the one the conscript blocks came from');

  // And the manifest rolls them up, gathered from the faces rather than hardcoded, so
  // a new donor cannot arrive without appearing there.
  assert.equal(manifest.license, 'SIL Open Font License 1.1');
  assert.ok(Array.isArray(manifest.copyright) && manifest.copyright.length > 1,
    'the manifest should list every notice');
  assert.ok(manifest.copyright.some((/** @type {string} */ c) => c.includes('Kreative Software')),
    'including the conscript donor');
  assert.ok(manifest.copyright.every((/** @type {string} */ c) => !c.includes('\n')),
    'one line each, or the roll-up is unreadable');
});

test('every corpus cell can be drawn by the face that will draw it', async () => {
  // The gap this closes, found by the currency sweep rather than by anything here:
  // the tests above check the *respelling* charset and a required Latin set per
  // face. Nothing checked the corpus's own cells against the side that renders
  // them, and the two are not the same question.
  //
  // `FIELD_SIDE` in `core/fonts.js` routes `roman` to `latin` whatever the pack's
  // script, so the seven `rupee-symbol` rows that print `₹` work only because
  // U+20B9 happens to be in all sixteen Latin faces. `֏` and `৳` are in none of
  // them, so a dram or taka symbol row written to that convention would have
  // printed boxes in the PDF with nothing to say so. And `numbers-money.baht-symbol`
  // really did ship that way in one pack: every language names the currency in its
  // own `text`, because that column is also the gloss, and `fil` alone wrote `฿` --
  // U+0E3F, in the Thai block, which the Latin stack never requests. Filipino is
  // never that concept's target, so the cell only ever reached a Filipino reader's
  // gloss column, drawn in Latin. `th <- fil` printed a box.
  //
  // `literal` is deliberately not checked, and that is a known gap rather than an
  // oversight. Sixty-two (language, face, codepoint) triples fail it today: Telugu,
  // Tamil and Hebrew literals explain a word using Latin transliteration (`ḍ ṭ ṁ ḷ
  // ṇ ṣ ẖ`) and a Lao one quotes `元`, none of which is in the target's own face.
  // The field is out of the default `fieldSet`, so nothing prints it unless a reader
  // turns the column on in the studio -- and the honest fix is a font fallback for a
  // codepoint the primary face lacks, which is a design decision and not a data
  // edit. Adding it here would only pin four packs' prose.
  const langs = parseTable(await readFile('data/registry/languages.csv', 'utf8'));
  const scripts = Object.fromEntries(parseTable(await readFile('data/registry/scripts.csv', 'utf8'))
    .map((r) => [r.iso15924, r]));
  const ready = langs.filter((l) => l.status === 'ready');

  // Accumulate the distinct codepoints each stack has to draw, rather than
  // re-checking a character once per cell: 95,000 cells, a few hundred codepoints.
  const COLUMNS = { text: 'script', text_alt: 'script_alt', ipa: 'ipa' };
  /** @type {Map<string, Map<number, string>>} */ const wanted = new Map();
  for (const lang of ready) {
    const dir = `data/lang/${lang.bcp47}`;
    let files;
    try { files = await readdir(dir); } catch { continue; }
    for (const file of files.filter((f) => f.endsWith('.csv'))) {
      for (const row of parseTable(await readFile(`${dir}/${file}`, 'utf8'))) {
        for (const [column, field] of Object.entries(COLUMNS)) {
          const value = (row[column] ?? '').trim();
          if (!value) continue;
          // The source is a placeholder: none of these three fields resolves
          // through it. `gloss` and `respell` do, but a language's gloss *is* its
          // own `text`, so checking `text` against its own stack covers both.
          const { stack } = resolveField(
            /** @type {any} */ (field), lang.script, 'Latn', scripts);
          if (!wanted.has(stack)) wanted.set(stack, new Map());
          for (const ch of value) {
            const cp = ch.codePointAt(0) ?? 0;
            if (cp > 0x20) wanted.get(stack)?.set(cp, `${lang.bcp47} ${column}`);
          }
        }
      }
    }
  }

  /** @type {string[]} */ const missing = [];
  for (const face of manifest.faces) {
    const need = wanted.get(face.stack);
    if (!need) continue;
    const font = fontkit.create(await readFile(`data/fonts/${face.file}.ttf`));
    const have = new Set(font.characterSet);
    for (const [cp, where] of need) {
      if (!have.has(cp)) {
        missing.push(`${face.file} cannot draw U+${cp.toString(16).toUpperCase().padStart(4, '0')} `
          + `${String.fromCodePoint(cp)} (${where})`);
      }
    }
  }
  assert.deepEqual(missing, [], `${missing.length} cell(s) route to a face without the glyph`);

  // Not vacuous: the accumulation has to have found real work to do.
  assert.ok(wanted.size >= 20, `expected every stack, got ${wanted.size}`);
  const total = [...wanted.values()].reduce((n, m) => n + m.size, 0);
  assert.ok(total > 2000, `expected thousands of distinct codepoints, got ${total}`);
});
