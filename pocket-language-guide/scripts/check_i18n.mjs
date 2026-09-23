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

/**
 * Data files that name a key rather than carrying the string. A geometry preset
 * whose caption is a description rather than a dimension says which key to draw it
 * from, so the reference lives in JSON and the scan has to follow it there.
 */
const DATA = ['data/presets.json'].concat(
  // Every conversation board names its own title and its buttons' labels by key --
  // that is the whole reason the chrome can be read in the owner's language -- so a
  // scan that skips them calls 54 live keys dead and cannot spot a real dead one.
  (await readdir(join(ROOT, 'data/boards')))
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort()
    .map((f) => `data/boards/${f}`),
);

const files = (await Promise.all(CODE.map(sources))).flat()
  .filter((rel) => !NOT_A_CONSUMER.has(rel))
  .concat(DATA);
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
    // is drawn. Without this the scan calls all of them unused. A bare `key:` is the
    // same thing under a shorter name -- `ui/board-display.js` lists its checkboxes as
    // `{ id, key }` -- and cost five false "unreferenced" entries until it was added.
    /\b"?(?:(?:caption|text|label|hint|title|note)Key|key)"?:\s*['"]([\w.-]+)['"]/g,
    // ... and a few sit in a map from a value to its key, looked up at draw time
    // (which field is shown, which cut mode is chosen).
    /:\s*'((?:field|cut|common|board)\.[\w.-]+)'/g,
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

// Some keys are looked up by code rather than written out, so they are used by
// construction and cannot be found by grepping for `t(`: a warning or a proposed
// fix by its own code, a field by its id (`ui/i18n.js` `warningText`), and a
// romanisation system by the slug `data/registry/languages.csv` lists it under.
const BY_CODE = ['warn.', 'fix.', 'field.', 'roman.', 'ornament.',
  'format.arrangement', 'format.split', 'format.head'];
const byCode = [...keys].filter((k) => BY_CODE.some((p) => k.startsWith(p)));

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

/**
 * Prose left in English counts as translated, which is how a gap hides.
 *
 * A key copied from `en.json` into a catalogue rather than left absent is *present*,
 * so coverage counts it and nothing ever reports it again: four sentences under
 * `format.headSpanTitle` sat in English in nineteen catalogues at 93% coverage.
 * Leaving the key out would have been visible; copying it was not.
 *
 * Three words is the line, and it needs no allowlist. Below it sit every value that
 * is *legitimately* the same in both languages -- the romanisation standards
 * `ALA-LC` and `BGN/PCGN`, French "Communication", a pattern like `{source} → {target}`
 * that has no words in it at all. Above it, a sentence.
 * @param {string} value
 */
function proseWords(value) {
  return value.replace(/\{[^}]*\}|[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean).length;
}

// Coverage of the other catalogues, which is information rather than a fault.
const dir = await readdir(join(ROOT, 'data/i18n'));
const others = dir.filter((f) => f.endsWith('.json') && f !== 'en.json').sort();
/** @type {Map<string, string[]>} */ const stillEnglish = new Map();
/** Held back so the coverage table stays the last thing printed, and so the
 * one-line summary `check_all.mjs` shows is a number rather than a tail of a list. */
/** @type {string[]} */ const coverage = [];
for (const file of others) {
  const overlay = JSON.parse(await readFile(join(ROOT, 'data/i18n', file), 'utf8'));
  const have = [...keys].filter((k) => typeof overlay[k] === 'string').length;
  for (const k of keys) {
    if (overlay[k] === english[k] && proseWords(english[k]) >= 3) {
      if (!stillEnglish.has(k)) stillEnglish.set(k, []);
      /** @type {string[]} */ (stillEnglish.get(k)).push(file.replace('.json', ''));
    }
  }
  const strayKeys = Object.keys(overlay).filter((k) => !k.startsWith('_') && !keys.has(k));
  const pct = ((have / keys.size) * 100).toFixed(0);
  coverage.push(`  ${file.replace('.json', '').padEnd(9)} ${have}/${keys.size}  ${pct}%`
    + (strayKeys.length ? `  (${strayKeys.length} keys not in en.json)` : ''));
}

if (stillEnglish.size) {
  const total = [...stillEnglish.values()].reduce((n, l) => n + l.length, 0);
  console.log(`\n${total} values still in English, over ${stillEnglish.size} keys:`);
  for (const [k, langs] of [...stillEnglish].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(langs.length).padStart(3)}  ${k.padEnd(30)} ${langs.join(' ')}`);
  }
}
if (coverage.length) console.log('\ntranslation coverage:');
for (const line of coverage) console.log(line);

// A missing key is a defect in shipped behaviour -- the reader sees the bare key --
// so it fails the build. An unused key only wastes a translator's time, which is
// worth reporting but is not a reason to refuse a commit, and it is the normal
// transient state while a catalogue is written ahead of the call sites.
if (CHECK && missing.length) {
  throw new Error(`${missing.length} message key(s) are referenced but not defined`);
}
