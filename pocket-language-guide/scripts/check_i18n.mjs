// Check the translation catalogues against the code that uses them.
//
//   npm run i18n            report
//   npm run i18n -- --check  fail on anything broken (wired into `npm run check`)
//
// Two kinds of drift, both silent without this. A `t('key')` whose key is not in
// `data/i18n/en.json` renders the bare key to a reader -- `t` warns in the console,
// but only if someone happens to open it. And a key left in the catalogue after its
// call site went away quietly asks seven translators to translate nothing.
//
// A key present in English but missing from another catalogue is neither: that is
// the designed fallback, and it is reported as coverage rather than as a fault.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');

/** Where strings are referenced from. */
const CODE = ['ui', '.'];

/**
 * The mechanism itself, not a consumer: its own doc comment shows the
 * `data-i18n="key"` form, which the scan would otherwise read as a real reference.
 */
const NOT_A_CONSUMER = new Set(['ui/i18n.js']);

/** @param {string} dir @returns {Promise<string[]>} */
async function sources(dir) {
  /** @type {string[]} */ const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (/\.(js|html)$/.test(entry.name)) out.push(join(dir, entry.name));
  }
  return out;
}

const files = (await Promise.all(CODE.map(sources))).flat()
  .filter((rel) => !NOT_A_CONSUMER.has(rel));
/** @type {Map<string, string[]>} */ const used = new Map();
for (const rel of files) {
  const text = await readFile(join(ROOT, rel), 'utf8');
  // `t('key')` and `warningText` aside, static markup carries the key in an
  // attribute. Both forms are matched so neither can drift on its own.
  const patterns = [
    /\bt\(\s*'([\w.-]+)'/g,
    /data-i18n(?:-title|-label)?="([\w.-]+)"/g,
    // Constant tables hold the key rather than the string, because they are built
    // at module load -- before a catalogue exists -- and resolved when the control
    // is drawn. Without this the scan calls all of them unused.
    /\b(?:caption|text|label|hint|title|note)Key:\s*'([\w.-]+)'/g,
    // ... and a few sit in a map from a value to its key, looked up at draw time
    // (which field is shown, which cut mode is chosen).
    /:\s*'((?:field|cut|common)\.[\w.-]+)'/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      if (!used.has(m[1])) used.set(m[1], []);
      /** @type {string[]} */ (used.get(m[1])).push(rel);
    }
  }
}

const english = JSON.parse(await readFile(join(ROOT, 'data/i18n/en.json'), 'utf8'));
const keys = new Set(Object.keys(english).filter((k) => !k.startsWith('_')));

// Warning keys are looked up by code rather than written out, so they are used by
// construction and cannot be found by grepping for `t(`.
const byCode = [...keys].filter((k) => k.startsWith('warn.') || k.startsWith('fix.'));

const missing = [...used.keys()].filter((k) => !keys.has(k)).sort();
const unused = [...keys]
  .filter((k) => !used.has(k) && !byCode.includes(k))
  .sort();

console.log(`${keys.size} keys in en.json, ${used.size} referenced in ${files.length} files`);
if (missing.length) {
  console.log(`\n${missing.length} referenced but not in the catalogue:`);
  for (const k of missing) console.log(`  ${k}   (${used.get(k)?.join(', ')})`);
}
if (unused.length) {
  console.log(`\n${unused.length} in the catalogue but never referenced:`);
  for (const k of unused) console.log(`  ${k}`);
}

// Coverage of the other catalogues, which is information rather than a fault.
const dir = await readdir(join(ROOT, 'data/i18n'));
const others = dir.filter((f) => f.endsWith('.json') && f !== 'en.json').sort();
if (others.length) console.log('\ntranslation coverage:');
for (const file of others) {
  const overlay = JSON.parse(await readFile(join(ROOT, 'data/i18n', file), 'utf8'));
  const have = [...keys].filter((k) => typeof overlay[k] === 'string').length;
  const strayKeys = Object.keys(overlay).filter((k) => !k.startsWith('_') && !keys.has(k));
  const pct = ((have / keys.size) * 100).toFixed(0);
  console.log(`  ${file.replace('.json', '').padEnd(9)} ${have}/${keys.size}  ${pct}%`
    + (strayKeys.length ? `  (${strayKeys.length} keys not in en.json)` : ''));
}

// A missing key is a defect in shipped behaviour -- the reader sees the bare key --
// so it fails the build. An unused key only wastes a translator's time, which is
// worth reporting but is not a reason to refuse a commit, and it is the normal
// transient state while a catalogue is written ahead of the call sites.
if (CHECK && missing.length) {
  throw new Error(`${missing.length} message key(s) are referenced but not defined`);
}
