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

/**
 * Where a string is allowed to break, as the text either side of each break.
 * Reading the atoms directly rather than a wrapped result, because a break
 * *opportunity* is the thing under test and whether a given width happens to use
 * it is not.
 * @param {string} text @param {import('../core/measure.js').RunStyle} s
 */
const atoms = (text, s) => m.wrap(text, 0.01, s).lines.map((l) => l.map((p) => p.text).join(''));

test('a hyphen that opens a word stays with it', () => {
  // Every language's number note lists the Japanese counters as `-tsu`, `-mai`,
  // `-hon`. The rule used to be unconditional, so it offered a break between the
  // hyphen and its own word and a bare `-` dangled at the end of a line.
  assert.deepEqual(atoms('-tsu -mai', style()), ['-tsu ', '-mai']);
  // A hyphen joining two words still offers one, which is what it is for.
  assert.deepEqual(atoms('no-pork', style()), ['no-', 'pork']);
});

test('a slash does not orphan a single letter', () => {
  // Gendered forms are written `solo/a`, `alérgico/a`, `vegetariano/a` in Italian,
  // Spanish and Portuguese. Breaking after the slash puts one letter on the next
  // line, which reads as a typo rather than as a wrap.
  assert.deepEqual(atoms('solo/a', style()), ['solo/a']);
  assert.deepEqual(atoms('alérgico/a a X', style()), ['alérgico/a ', 'a ', 'X']);
  // A slash between two real words still offers one, which is what it is for.
  assert.deepEqual(atoms('and/or', style()), ['and/', 'or']);
});

test('a script that breaks anywhere still keeps a Latin word whole', () => {
  // `any` means between ideographs, kana and hangul -- not inside a romanisation
  // printed among them, which is what every reader-side note does.
  const s = style({ stack: 'cjk-sc', weight: 700, wordBreak: 'any' });
  assert.deepEqual(atoms('数juuichi', s), ['数', 'juuichi']);
  // And a digital time or a decimal is one number, not two. A Chinese note wrapped
  // `16:00` as `16:` and `00` before this.
  assert.deepEqual(atoms('是16:00了', s), ['是', '16:00', '了']);
  assert.deepEqual(atoms('是0.1元', s), ['是', '0.1', '元']);
});
