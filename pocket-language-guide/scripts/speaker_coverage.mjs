// Which languages declare speaker/listener wording or register, and which have it.
//
//   node scripts/speaker_coverage.mjs            the report
//   node scripts/speaker_coverage.mjs --json     the same, machine-readable
//   node scripts/speaker_coverage.mjs ru         the rows in `ru` worth reading through
//   node scripts/speaker_coverage.mjs ru --slashed   only the rows still to clean up
//
// **Reports rather than fails.** A declared axis with no variant rows yet is an
// honest, known state: the reader sees the language's default wording and the app
// tells them under the grid that that is what they are seeing. Turning that into a
// red build would mean either declaring fewer axes than the grammar warrants or
// writing wordings nobody has checked, and both are worse than an open gap.
// `scripts/validate_data.py` owns the things that *are* errors -- a variant whose
// base row does not exist, a key no language declares.
//
// The first-person count is a heuristic and is named as one: concepts whose **English**
// gloss begins with I / my / we / me. It is the same filter the original survey used
// and it is a reading list, not a denominator -- it is wrong in both directions and
// has to be. It over-counts, because most first-person sentences do not agree with
// anything. It also under-counts, and that is the more interesting half: Portuguese
// *obrigado / obrigada* inflects for the speaker and its English is "Thank you", and
// "Am I under arrest?" begins with a verb. No column in the corpus records which
// phrases agree in which language, and inventing one would be writing the survey's
// answer down twice. So whoever writes the wordings reads past this list, and the
// report counts what they wrote rather than what the list predicted.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseTable } from '../core/csv.js';
import { readAxes, variantKey } from '../core/speaker.js';
import { parseAlternates } from '../core/alternation.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (/** @type {string} */ rel) => parseTable(readFileSync(`${ROOT}/${rel}`, 'utf8'), rel);

/** Anything the traveller says about themselves, by its English gloss. */
const FIRST_PERSON = /^(i|i'm|i've|my|we|we're|we've|me)\b/i;

/** Every concept whose English realisation is the traveller talking about themselves. */
function candidates() {
  const dir = `${ROOT}/data/lang/en`;
  /** @type {Set<string>} */ const out = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.csv'))) {
    for (const row of read(`data/lang/en/${file}`)) {
      if (FIRST_PERSON.test(row.text ?? '')) out.add(row.concept_id);
    }
  }
  return out;
}

/** One language's pack, flattened, minus the variants file. */
function pack(/** @type {string} */ code) {
  const dir = `${ROOT}/data/lang/${code}`;
  /** @type {Record<string,Record<string,string>>} */ const rows = {};
  if (!existsSync(dir)) return rows;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.csv') && f !== 'variants.csv')) {
    for (const row of read(`data/lang/${code}/${file}`)) rows[row.concept_id] = row;
  }
  return rows;
}

/**
 * First-person rows with a slash to inspect, excluding lexical alternatives already
 * present in the English concept and intentional noun-gender templates. Per
 * `content/PROMPTS/speaker-variants.md`.
 *
 * This is a heuristic, not proof of a gender error. A feminine parked in `text_alt` is another part of that backlog,
 * but `text_alt` is a general second-wording cell — Hebrew fills all 136 of them with
 * the pointed spelling, Greek with a periphrasis — so counting it reported every
 * Hebrew row as suspect and told nobody anything. Which languages park a feminine
 * there is written down in the prompt instead, where it can say *which* rows.
 */
function slashed(/** @type {Record<string,Record<string,string>>} */ rows, /** @type {Set<string>} */ want,
  /** @type {Record<string,Record<string,string>>} */ english) {
  return Object.values(rows)
    .filter((r) => want.has(r.concept_id) && /\S\s*\/\s*\S/.test(r.text ?? '')
      // A concept such as "I / me" intentionally offers several readings. Likewise,
      // bracketed template alternatives belong to the noun in the blank, not the speaker.
      && !(english[r.concept_id]?.text ?? '').includes('/')
      && !parseAlternates(r.text ?? '').groups.length)
    .map((r) => r.concept_id);
}

const axes = readAxes([...read('data/registry/speaker-axes.csv'), ...read('data/registry/listener-axes.csv')]);
const want = candidates();
const english = pack('en');

// One language's worklist: every first-person concept it has a row for, with the
// English beside it, so whoever writes the variants is reading the same list the
// report counts against rather than grepping for one.
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (only) {
  const rows = pack(only);
  // `--slashed` narrows the worklist to the migration backlog: rows whose `text`
  // still carries a slashed dual form, which is the thing a reader has to do
  // grammar on at a hotel counter. The third column is the English, so whoever is
  // splitting the form can see which half is which.
  const wanted = process.argv.includes('--slashed')
    ? slashed(rows, want, english)
    : [...want].filter((id) => rows[id]);
  for (const id of wanted.sort()) {
    console.log([id, rows[id].text, english[id]?.text ?? ''].join('\t'));
  }
  process.exit(0);
}

const report = [];

for (const [code, list] of Object.entries(axes).sort()) {
  const rows = pack(code);
  const mine = [...want].filter((id) => rows[id]);
  const rel = `data/lang/${code}/variants.csv`;
  const variants = existsSync(`${ROOT}/${rel}`) ? read(rel) : [];
  const covered = new Set(variants.map((r) => r.concept_id));
  // Rebuild the complete key: listener, register and speaker axes can combine, and
  // default, unknown or duplicated components must not be accepted as valid keys.
  const unknown = variants.filter((r) => variantKey(list,
    Object.fromEntries(r.variant.split('|').map((part) => part.split('=')))) !== r.variant)
    .map((r) => r.variant);
  const stray = variants.filter((r) => !rows[r.concept_id]).map((r) => r.concept_id);
  report.push({
    language: code,
    axes: list.map((a) => a.axis),
    candidates: mine.length,
    covered: covered.size,
    rows: variants.length,
    slashed: slashed(rows, want, english),
    templateAlternates: Object.values(rows).filter((r) => parseAlternates(r.text ?? '').groups.length)
      .map((r) => r.concept_id),
    unknownKeys: [...new Set(unknown)],
    strayConcepts: stray,
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pad = (/** @type {string|number} */ s, /** @type {number} */ n) => String(s).padEnd(n);
  // Counts side by side rather than as a fraction: a variant is legitimately written
  // for a concept the first-person filter never listed, so `concepts` over `1st-person`
  // would be a ratio of two things that do not divide.
  console.log(`${pad('lang', 6)}${pad('wordings', 10)}${pad('concepts', 10)}${pad('1st-person', 12)}${pad('slashed', 9)}`);
  for (const r of report) {
    console.log(
      pad(r.language, 6)
      + pad(r.rows, 10)
      + pad(r.covered, 10)
      + pad(r.candidates, 12)
      + pad(r.slashed.length, 9)
      + (r.unknownKeys.length ? ` unknown keys: ${r.unknownKeys.join(', ')}` : '')
      + (r.strayConcepts.length ? ` no base row: ${r.strayConcepts.join(', ')}` : ''),
    );
  }
  const done = report.filter((r) => r.rows).length;
  console.log(`\n${done}/${report.length} declared languages have a variants file.`);
  console.log(`${report.reduce((n, r) => n + r.slashed.length, 0)} first-person rows have a slash to review (excluding lexical and template alternatives).`);
  console.log(`${report.reduce((n, r) => n + r.templateAlternates.length, 0)} rows carry intentional template gender alternatives.`);
}
