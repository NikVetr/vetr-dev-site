import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFontRegistry } from '../core/fonts.js';
import { createMeasurer } from '../core/measure.js';

const manifest = JSON.parse(await readFile('data/fonts/manifest.json', 'utf8'));
const registry = createFontRegistry((f) => readFile(`data/fonts/${f}`), manifest);
await registry.load([
  { stack: 'latin', weight: 400, italic: false },
  { stack: 'latin', weight: 700, italic: false },
  { stack: 'latin', weight: 400, italic: true },
  { stack: 'cjk-sc', weight: 700, italic: false },
  { stack: 'arabic', weight: 400, italic: false },
]);
const m = createMeasurer(registry);

/**
 * @param {Partial<import('../core/measure.js').RunStyle>} [over]
 * @returns {import('../core/measure.js').RunStyle}
 */
const style = (over = {}) => ({
  stack: 'latin', weight: 400, italic: false, size: 10, leading: 12,
  dir: 'ltr', wordBreak: 'space', slotAsRule: false, ...over,
});

test('width grows with size and with string length', () => {
  const s = style();
  const short = m.width('go', s);
  const long = m.width('go straight', s);
  assert.ok(long > short);
  assert.ok(Math.abs(m.width('go', style({ size: 20 })) - short * 2) < 0.01);
});

test('latin wraps at spaces and never mid-word', () => {
  const s = style({ size: 8, leading: 9 });
  const text = 'Please tell me where to get off';
  const { lines } = m.wrap(text, 40, s);
  assert.ok(lines.length > 1);
  for (const line of lines) {
    for (const piece of line) assert.ok(!piece.text.trim().includes(' '));
  }
  assert.equal(lines.flat().map((p) => p.text).join(''), text);
});

test('CJK breaks between characters but keeps closing punctuation attached', () => {
  const s = style({ stack: 'cjk-sc', weight: 700, size: 7, leading: 7.2, wordBreak: 'any' });
  const { lines } = m.wrap('请告诉我在哪站下车。', 20, s);
  assert.ok(lines.length > 1);
  assert.ok(!lines.some((l) => l[0].text.startsWith('。')));
});

test('lineCount matches wrap but does not build lines', () => {
  const s = style({ size: 8, leading: 9 });
  for (const w of [20, 35, 60, 200]) {
    const text = 'Please write the place name in Chinese';
    assert.equal(m.lineCount(text, w, s), m.wrap(text, w, s).lines.length, `width ${w}`);
  }
});

test('a slot is an unbreakable rule on the target side, an ellipsis on the source side', () => {
  const rule = m.wrap('我不吃{}', 200, style({ stack: 'cjk-sc', weight: 700, wordBreak: 'any', slotAsRule: true }));
  const slots = rule.lines.flat().filter((p) => p.type === 'slot');
  assert.equal(slots.length, 1);
  assert.ok(slots[0].w > 0);

  const ell = m.wrap('I do not eat {}', 200, style());
  assert.ok(ell.lines.flat().some((p) => p.text === '…'));
  assert.equal(ell.lines.flat().filter((p) => p.type === 'slot').length, 0);
});

test('arabic is shaped, so its width is not a naive per-glyph sum', () => {
  const s = style({ stack: 'arabic', size: 10, leading: 13 });
  const shaped = m.width('السلام عليكم', s);
  const perChar = [...'السلام عليكم'].reduce((sum, c) => sum + m.width(c, s), 0);
  assert.ok(shaped > 0);
  assert.ok(shaped < perChar, `shaped ${shaped} should be tighter than ${perChar}`);
});

test('baseline sits inside the line box', () => {
  const s = style({ size: 10, leading: 12 });
  const b = m.baselineOffset(s);
  assert.ok(b > 0 && b < s.leading, `baseline ${b} outside 0..${s.leading}`);
});


test('a hyphen that opens a word stays with it', () => {
  // Every language's number note lists the Japanese counters as `-tsu`, `-mai`,
  // `-hon`. The rule used to be unconditional, so it offered a break between the
  // hyphen and its own word and a bare `-` dangled at the end of a line.
  assert.deepEqual(m.atoms('-tsu -mai', style()), ['-tsu ', '-mai']);
  // A hyphen joining two words still offers one, which is what it is for.
  assert.deepEqual(m.atoms('no-pork', style()), ['no-', 'pork']);
});

test('a slash does not orphan a single letter', () => {
  // Gendered forms are written `solo/a`, `alérgico/a`, `vegetariano/a` in Italian,
  // Spanish and Portuguese. Breaking after the slash puts one letter on the next
  // line, which reads as a typo rather than as a wrap.
  assert.deepEqual(m.atoms('solo/a', style()), ['solo/a']);
  assert.deepEqual(m.atoms('alérgico/a a X', style()), ['alérgico/a ', 'a ', 'X']);
  // A slash between two real words still offers one, which is what it is for.
  assert.deepEqual(m.atoms('and/or', style()), ['and/', 'or']);
});

test('a number in an any-breaking script is one atom', () => {
  // Thai and Khmer digits are `Script=Thai`/`Script=Khmer`, so they were excluded
  // from `wordish` along with the letters and nothing glued them -- `๑๐๐` measured
  // as three atoms and a line could break inside a number. The shipped Thai pack
  // carries ๑๐, ๑๐๐ and ๑๐๐๐, so this was live rather than hypothetical.
  const s = style({ stack: 'latin', wordBreak: 'dict' });
  assert.deepEqual(m.atoms('๑๐๐', s), ['๑๐๐']);
  assert.deepEqual(m.atoms('១១៩', s), ['១១៩']);
  // And the letters around them still break, which is the whole point of `dict`.
  assert(m.atoms('ก๑๐๐ก', s).length > 1);
});

test('Khmer clusters hold together, so no line can open on a coeng', () => {
  // Khmer is in `BREAKS_ANYWHERE` and had no entry in `NO_LINE_START`, so every
  // codepoint was its own atom: ភ្នំពេញ measured as seven, and a line could open on
  // U+17D2, the coeng, whose only job is to bind the consonant after it into a
  // subscript -- which renders over a dotted circle when stranded. Nothing had
  // noticed because no Khmer pack exists yet. Found by the Burmese survey.
  const s = style({ stack: 'latin', wordBreak: 'dict' });
  const phnom = m.atoms('ភ្នំពេញ', s);
  assert(phnom.length < 7, `expected clusters, got ${phnom.length} atoms`);
  for (const atom of phnom) {
    assert(!/^[\u17B6-\u17D2\u17DD]/u.test(atom),
      `atom starts with a Khmer mark: ${JSON.stringify(atom)}`);
  }
});

test('Lao breaks between clusters and never opens a line on a mark', () => {
  // Lao was in neither `BREAKS_ANYWHERE` nor `NO_LINE_START`, which is Khmer's
  // defect inverted: every Lao letter was `wordish`, so the glue clause welded the
  // whole run into one unbreakable atom -- 8.78em for "I lost my passport" against
  // the 9.9-10.3em a column's 0.6 floor cap allows at 7pt, and an over-wide atom
  // overflows rather than splitting. Both halves of the fix are asserted here,
  // because either alone is a defect: no glue means one atom, and no
  // `NO_LINE_START` means a line can open on a bare tone mark over a dotted circle.
  const s = style({ stack: 'latin', wordBreak: 'dict' });
  const toilet = m.atoms('ຫ້ອງນ້ຳຢູ່ໃສ', s);
  assert(toilet.length > 1, `expected clusters, got one atom: ${JSON.stringify(toilet)}`);
  for (const atom of toilet) {
    // No dependent vowel, semivowel, tone mark or sign may open an atom, and no
    // pre-base vowel may end one -- it is written before a consonant it is
    // pronounced after.
    assert(!/^[ະ-ຽໆ່-ໍ]/u.test(atom),
      `atom starts with a Lao mark: ${JSON.stringify(atom)}`);
    assert(!/[ເ-ໄ]$/u.test(atom),
      `atom ends with a Lao pre-base vowel: ${JSON.stringify(atom)}`);
  }
  // ນ້ຳ is the sequence the whole cluster question turns on -- a tone mark and then
  // U+0EB3, which is spacing -- and it has to stay one atom.
  assert.deepEqual(m.atoms('ນ້ຳ', s), ['ນ້ຳ']);
});

test('a script that breaks anywhere still keeps a Latin word whole', () => {
  // `any` means between ideographs, kana and hangul -- not inside a romanisation
  // printed among them, which is what every reader-side note does.
  const s = style({ stack: 'cjk-sc', weight: 700, wordBreak: 'any' });
  assert.deepEqual(m.atoms('数juuichi', s), ['数', 'juuichi']);
  // And a digital time or a decimal is one number, not two. A Chinese note wrapped
  // `16:00` as `16:` and `00` before this.
  assert.deepEqual(m.atoms('是16:00了', s), ['是', '16:00', '了']);
  assert.deepEqual(m.atoms('是0.1元', s), ['是', '0.1', '元']);
});

test('a word wider than its whole column is broken rather than printed past it', () => {
  // The width solvers give every column a floor of its own widest unbreakable
  // word, so this is only reached when the floors could not all be met at once --
  // and then the word used to print straight over the next column, which is how a
  // Russian sheet came to read `пожалуйстаpozhaluysta`.
  const s = style({ size: 6, leading: 7 });
  const word = 'Rehydrationssalze';
  const avail = m.width(word, s) * 0.45;
  const { lines, width } = m.wrap(word, avail, s);
  assert.ok(lines.length >= 2, `expected a break, got ${lines.length} line(s)`);
  assert.ok(width <= avail + 0.01, `line is ${width.toFixed(2)}pt wide in ${avail.toFixed(2)}pt`);
  // Nothing is dropped and nothing is invented -- no hyphen is inserted, as
  // nowhere else in this engine inserts one either.
  assert.equal(lines.flat().map((p) => p.text).join(''), word);
  // The counted height and the painted one have to agree or the row is the wrong
  // size for what is drawn in it.
  assert.equal(m.lineCount(word, avail, s), lines.length);
});

test('the last-resort break keeps a combining mark with its base', () => {
  // Cutting per character would strand a mark at the start of a line over a
  // dotted circle. Arabic is the sharper case: the pieces are measured on the
  // accumulated string, because a join is narrower than the letters it joins.
  const s = style({ stack: 'arabic', dir: 'rtl', size: 6, leading: 7 });
  const word = 'الإسعافات';
  const avail = m.width(word, s) * 0.5;
  const { lines, width } = m.wrap(word, avail, s);
  assert.ok(lines.length >= 2);
  assert.ok(width <= avail + 0.01, `line is ${width.toFixed(2)}pt wide in ${avail.toFixed(2)}pt`);
  assert.equal(lines.flat().map((p) => p.text).join(''), word);
  for (const piece of lines.flat()) {
    assert.ok(!/^\p{Mn}/u.test(piece.text), `piece opens on a mark: ${piece.text}`);
  }
});

test('an unbreakable word is still measured at its full width', () => {
  // `maxAtomWidth` is what the width solvers use as a floor, so it must keep
  // reporting the word's real width: if it shrank to whatever the last-resort
  // break would allow, no column would ever ask for enough room and every long
  // word on the sheet would be cut in half.
  const s = style({ size: 6, leading: 7 });
  const word = 'Rehydrationssalze';
  assert.ok(Math.abs(m.maxAtomWidth(word, s) - m.width(word, s)) < 0.01);
});
