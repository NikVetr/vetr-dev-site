// The translation catalogues, checked as data.
//
// Seven of these files are written by someone who is not looking at the code that
// consumes them, and the failure modes are quiet: a placeholder dropped from a
// string prints the surrounding sentence with a number missing, and a placeholder
// misspelled prints `{fcaes}` to a reader. Neither shows up in a screenshot of the
// English build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const DIR = 'data/i18n';
const english = JSON.parse(await readFile(`${DIR}/en.json`, 'utf8'));
const files = (await readdir(DIR)).filter((f) => f.endsWith('.json') && f !== 'en.json');

/** @param {string} s */
const placeholders = (s) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

const keys = Object.keys(english).filter((k) => !k.startsWith('_'));

test('English is the complete catalogue and every value is a string', () => {
  assert.ok(keys.length > 100, `only ${keys.length} keys`);
  for (const k of keys) {
    assert.equal(typeof english[k], 'string', `${k} is not a string`);
    assert.ok(english[k].trim().length, `${k} is empty`);
  }
});

test('English has no stray placeholder syntax', () => {
  for (const k of keys) {
    // A lone brace is almost always a typo for a placeholder, and it prints.
    const braces = (english[k].match(/[{}]/g) ?? []).length;
    assert.equal(braces % 2, 0, `${k} has an unbalanced brace: ${english[k]}`);
  }
});

for (const file of files) {
  const code = file.replace('.json', '');
  const overlay = JSON.parse(await readFile(`${DIR}/${file}`, 'utf8'));
  const own = Object.keys(overlay).filter((k) => !k.startsWith('_'));

  test(`${code}: every key it defines exists in English`, () => {
    // An overlay is allowed to be incomplete -- that falls back -- but a key English
    // does not have is either a typo or a string nothing will ever ask for.
    const stray = own.filter((k) => !(k in english));
    assert.deepEqual(stray, [], `keys not in en.json: ${stray.join(', ')}`);
  });

  test(`${code}: placeholders match English exactly`, () => {
    /** @type {string[]} */ const wrong = [];
    for (const k of own) {
      const want = placeholders(english[k]);
      const got = placeholders(overlay[k]);
      if (want.size !== got.size || [...want].some((p) => !got.has(p))) {
        wrong.push(`${k}: expected {${[...want].join('} {')}}, got {${[...got].join('} {')}}`);
      }
    }
    assert.deepEqual(wrong, [], wrong.join('\n'));
  });

  test(`${code}: every value is a non-empty string`, () => {
    for (const k of own) {
      assert.equal(typeof overlay[k], 'string', `${k} is not a string`);
      assert.ok(overlay[k].trim().length, `${k} is empty`);
    }
  });

  test(`${code}: text is NFC-normalised`, () => {
    for (const k of own) {
      assert.equal(overlay[k], overlay[k].normalize('NFC'), `${k} is not NFC`);
    }
  });
}
