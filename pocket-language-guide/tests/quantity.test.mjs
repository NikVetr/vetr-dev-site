// A quantity is the one answer this project does not translate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatDuration, supports, parseAmount, COMMON_WAITS, UNITS } from '../core/quantity.js';

/** Every language the registry calls ready. */
async function ready() {
  const csv = await readFile('data/registry/languages.csv', 'utf8');
  const [head, ...rows] = csv.split(/\r?\n/).filter(Boolean);
  const cols = head.split(',');
  const code = cols.indexOf('bcp47');
  const status = cols.indexOf('status');
  return rows.map((r) => r.split(',')).filter((f) => f[status] === 'ready').map((f) => f[code]);
}

test('plural rules come out right in the languages that have them', () => {
  // The reason a duration is stored as a number and a unit rather than as a
  // sentence. Russian needs three forms and picks by the last digit; Polish agrees
  // with Russian on 22 and not on 5; Arabic has a form for 3-10 of its own. None of
  // this is written down anywhere in this repository -- it is CLDR, which every
  // browser already ships.
  assert.equal(formatDuration({ kind: 'duration', amount: 1, unit: 'minute' }, 'ru'), '1 минута');
  assert.equal(formatDuration({ kind: 'duration', amount: 2, unit: 'minute' }, 'ru'), '2 минуты');
  assert.equal(formatDuration({ kind: 'duration', amount: 5, unit: 'minute' }, 'ru'), '5 минут');
  assert.equal(formatDuration({ kind: 'duration', amount: 22, unit: 'minute' }, 'pl'), '22 minuty');
  assert.equal(formatDuration({ kind: 'duration', amount: 5, unit: 'minute' }, 'pl'), '5 minut');
  assert.equal(formatDuration({ kind: 'duration', amount: 1, unit: 'minute' }, 'en'), '1 minute');
  assert.equal(formatDuration({ kind: 'duration', amount: 15, unit: 'minute' }, 'en'), '15 minutes');
  // Mandarin has no plural and no space; the formatter knows that too.
  assert.equal(formatDuration({ kind: 'duration', amount: 15, unit: 'minute' }, 'zh-Hans'), '15分钟');
});

test('every ready language can say a duration, or is refused by name', async () => {
  // The whole coverage claim, checked rather than asserted: this works in all 51
  // natural languages at once because none of them needs a translated string.
  const codes = await ready();
  const refused = codes.filter((c) => !supports(c));
  // The two constructed languages, and only those. They have no CLDR data, and a
  // board for one of them cannot offer a duration reply -- which is the honest
  // answer, not a defect to paper over.
  assert.deepEqual(refused.sort(), ['qya', 'tlh']);

  for (const code of codes.filter((c) => supports(c))) {
    for (const unit of UNITS) {
      const said = formatDuration({ kind: 'duration', amount: 15, unit }, code);
      assert.ok(said && said.length > 1, `${code} could not say 15 ${unit}`);
      // A numeral in *some* script. `\p{Nd}` rather than `\d`, because the
      // formatter uses each locale's own digits where that is the convention --
      // Bengali answers ১৫ and Burmese ၁၅, which is the localisation working, not
      // failing. Writing the test against ASCII digits would have called it a bug.
      assert.ok(/\p{Nd}/u.test(said), `${code} ${unit}: ${said} has no numeral`);
    }
  }
});

test('an unknown language is refused rather than answered in English', () => {
  // **`Intl` falls back to the runtime's default locale for a tag it does not know**,
  // which would put "15 minutes" on a Klingon screen. That is the silent
  // substitution this project refuses everywhere else, so it is refused here.
  assert.equal(supports('tlh'), false);
  assert.equal(supports('qya'), false);
  assert.equal(formatDuration({ kind: 'duration', amount: 15, unit: 'minute' }, 'tlh'), null);
  assert.equal(formatDuration({ kind: 'duration', amount: 15, unit: 'minute' }, 'qya'), null);
  // A malformed tag throws inside `Intl`; it must come back as "no", not as a crash.
  assert.equal(supports('not a tag'), false);
});

test('the offered waits are answers someone would actually give', () => {
  // Not an even scale: people say "about ten minutes", never "about eleven".
  assert.deepEqual(COMMON_WAITS.map((d) => `${d.amount}${d.unit[0]}`),
    ['5m', '10m', '15m', '30m', '1h', '2h']);
  for (const d of COMMON_WAITS) assert.ok(formatDuration(d, 'en'));
});

test('a typed amount is read strictly, because it is shown to a stranger as fact', () => {
  assert.deepEqual(parseAmount('20', 'minute'), { ok: true, value: { kind: 'duration', amount: 20, unit: 'minute' } });
  // Everything a keypad will happily produce that is not an answer.
  assert.equal(parseAmount('', 'minute').ok, false);
  assert.equal(parseAmount('  ', 'minute').ok, false);
  assert.equal(parseAmount('abc', 'minute').ok, false);
  assert.equal(parseAmount('-5', 'minute').ok, false);
  assert.equal(parseAmount('1.5', 'minute').ok, false);
  assert.equal(parseAmount('0', 'minute').ok, false);
  // Past the ceiling the answer is a different unit, not a bigger number.
  assert.equal(parseAmount('900', 'minute').ok, false);
  assert.equal(parseAmount('600', 'minute').ok, true);
  assert.equal(parseAmount('49', 'hour').ok, false);
  assert.equal(parseAmount('48', 'hour').ok, true);
  // Each refusal says which one it is, so the editor can say something useful.
  const tooBig = parseAmount('900', 'minute');
  const notNum = parseAmount('x', 'minute');
  assert.equal(tooBig.ok === false && tooBig.reason, 'too-large');
  assert.equal(notNum.ok === false && notNum.reason, 'not-a-number');
});

test('the same value reads correctly to both people at once', () => {
  // The point of keeping it structured: one value, two languages, no round trip
  // through anybody's prose.
  const wait = /** @type {import('../core/quantity.js').Duration} */ (
    { kind: 'duration', amount: 30, unit: 'minute' });
  assert.equal(formatDuration(wait, 'zh-Hans'), '30分钟');
  assert.equal(formatDuration(wait, 'en'), '30 minutes');
  assert.equal(formatDuration(wait, 'ru'), '30 минут');
  assert.equal(formatDuration(wait, 'ja'), '30 分');
});
