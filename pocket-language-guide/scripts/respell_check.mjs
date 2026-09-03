// Run one reading language's respelling table over real corpus data.
//
//   node scripts/respell_check.mjs es              every target, ten rows each
//   node scripts/respell_check.mjs es zh-Hans      one target, all its rows
//   node scripts/respell_check.mjs en --score      agreement against the curated sheets
//   node scripts/respell_check.mjs en de --diff    only the rows a curated sheet disagrees with
//   node scripts/respell_check.mjs es --gaps      every IPA symbol still reaching the page
//   node scripts/respell_check.mjs es --units     phonemes spelt by decomposition
//   node scripts/respell_check.mjs --charset      rewrite data/respell/charset.json
//   node scripts/respell_check.mjs --charset --check   fail if that file is stale
//
// This exists because a rule table cannot be written by reading the format. Every
// rule interacts with the target's own inventory and phonotactics, so the only way
// to know what a rule does is to run it over a real `ipa` column -- and the only
// way to know whether a table is finished is to read its output on rows a fluent
// reader can judge.
//
// `--score` and `--diff` need a curated sheet to compare against, which today means
// an English reader: `data/respell/overrides/<target>__en__en-US.csv`. For every
// other reader there is no labelled set, so the obligation is different and the
// script says so rather than printing a meaningless zero.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { loadCorpus, loadLanguage, loadRespellOverrides, loadRespellRules } from '../core/pack.js';
import { createRespeller, phonemesOf } from '../core/respell.js';

const loadText = (/** @type {string} */ rel) => readFile(rel, 'utf8');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [source, only] = args.filter((a) => !a.startsWith('--'));
if (!source && !flags.has('--charset')) {
  console.error('usage: node scripts/respell_check.mjs <source> [target] [--score|--diff|--all|--gaps]');
  console.error('       node scripts/respell_check.mjs --charset [--check]');
  process.exit(2);
}

const CHARSET = 'data/respell/charset.json';

const corpus = await loadCorpus(loadText);
const groups = [...new Set(Object.values(corpus.sections).map((s) => s.group))];
const ready = Object.values(corpus.languages).filter((l) => l.status === 'ready').map((l) => l.bcp47);

// A table's accent is part of its identity rather than of the reader's language,
// so it comes from the filename: `en` has one for `en-US` and could have more.
// Read the directory rather than its `index.json`, so a table under construction
// can be run before it is listed.
const tables = (await readdir('data/respell/rules'))
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => f.replace(/\.json$/, '').split('__'))
  .map(([src, acc]) => ({ source: src, accent: acc }));

/** Rows the reader can actually judge: a filled `ipa` cell, in row order. */
async function rowsFor(/** @type {{source:string, accent:string, rules:any}} */ table,
  /** @type {string} */ target) {
  const [rows, curated] = await Promise.all([
    loadLanguage(loadText, target, groups),
    loadRespellOverrides(loadText, target, table.source, table.accent)
      .catch(() => /** @type {Record<string,string>} */ ({})),
  ]);
  const ipa = Object.entries(rows)
    .map(([id, row]) => ({ id, text: row.text ?? '', ipa: (row.ipa ?? '').trim() }))
    .filter((r) => r.ipa);
  const respeller = createRespeller({
    rules: table.rules, target, targetIpa: ipa.map((r) => r.ipa),
  });
  return ipa.map((r) => ({ ...r, out: respeller.respell(r.ipa), want: curated[r.id] ?? '' }));
}

/**
 * Every character the shipped rule tables can put on a page, per reading language.
 *
 * `scripts/subset_fonts.py` unions the characters the *corpus* contains, which is
 * the right rule for every other field and the wrong one for this column, because
 * a generated respelling is computed at load time and so is in no CSV. Korean is
 * the sharp case: the subsetter ships the ~2,350 KS X 1001 Hangul syllables, and a
 * transcription of Arabic can ask for one outside that set -- which in the PDF is a
 * box, there being no system font to fall back to. Committing the set keeps the
 * font build a pure function of the repository.
 */
async function charset() {
  /** @type {Record<string,string>} */ const out = {};
  // The *published* tables, from `index.json`, not every file in the directory:
  // the font subset should cover what ships, and a table under construction does
  // not. Reading the directory here would also make the committed charset depend
  // on an uncommitted file.
  for (const { source: src, accent: acc } of tables.filter(
    (t) => corpus.respellRules.has(`${t.source}__${t.accent}`),
  )) {
    const table = { source: src, accent: acc, rules: await loadRespellRules(loadText, src, acc) };
    /** @type {Set<string>} */ const chars = new Set();
    for (const target of ready) {
      if (target === src) continue;
      for (const r of await rowsFor(table, target)) for (const ch of r.out) chars.add(ch);
    }
    out[src] = [...chars].sort().join('');
  }
  return out;
}

if (flags.has('--charset')) {
  const built = await charset();
  const text = `${JSON.stringify(built, null, 2)}\n`;
  if (flags.has('--check')) {
    const held = await readFile(CHARSET, 'utf8').catch(() => '');
    if (held !== text) {
      console.error(`${CHARSET} is stale -- run \`npm run respell:charset\` and commit the result`);
      process.exit(1);
    }
    const n = Object.entries(built).map(([k, v]) => `${k} ${[...v].length}`).join(', ');
    console.log(`respell charset current  ${n}`);
  } else {
    await writeFile(CHARSET, text);
    for (const [k, v] of Object.entries(built)) console.log(`${k}  ${[...v].length} characters`);
  }
  process.exit(0);
}

const found = tables.find((t) => t.source === source);
if (!found) {
  console.error(`no rule table for a ${source} reader. `
    + `Tables live in data/respell/rules/<source>__<accent>.json and are listed in that `
    + `directory's index.json; content/RESPELL-SYSTEMS.md says what each one should derive from.`);
  process.exit(1);
}
const table = { ...found, rules: await loadRespellRules(loadText, source, found.accent) };
const targets = only ? [only] : ready.filter((l) => l !== source);

/**
 * A symbol the table has no rule for, counted from the *output*.
 *
 * `spellSlot` passes an unmapped symbol through rather than dropping it, so a gap
 * in the table is visible as an IPA character reaching the page -- which is also
 * the only definition of a gap that matters, since it is what the reader would see.
 * This is the completeness measure a table can be held to when there is no curated
 * sheet to score it against, and every reader but English is in that position.
 */
const IPA_ONLY = /[\u0250-\u02af\u02b0-\u02ff\u0300-\u036f\u1d00-\u1d7f]/u;
/**
 * Except the two marks a stress device emits on purpose. Both fall inside the
 * ranges above -- the combining acute is in the same block as the IPA
 * diacritics -- so without this the Russian table's 13,035 stress marks report as
 * the largest gap in the corpus.
 */
const DEVICE_MARKS = new Set(['\u0301', '\u02b9']);

/** Ignore what a reviewer would not call a disagreement. */
const loose = (/** @type {string} */ s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const width = (/** @type {string} */ s) => [...s].reduce(
  (n, c) => n + (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(c) ? 2 : 1), 0,
);
const pad = (/** @type {string} */ s, /** @type {number} */ n) => s + ' '.repeat(Math.max(1, n - width(s)));

let totals = { rows: 0, exact: 0, near: 0, judged: 0 };
/** @type {Map<string, {count:number, examples:Set<string>}>} */ const gaps = new Map();
for (const target of targets) {
  const rows = await rowsFor(table, target);
  for (const r of rows) {
    for (const ch of r.out) {
      if (!IPA_ONLY.test(ch) || DEVICE_MARKS.has(ch)) continue;
      const g = gaps.get(ch) ?? { count: 0, examples: new Set() };
      g.count += 1;
      if (g.examples.size < 3) g.examples.add(`${target} ${r.ipa} -> ${r.out}`);
      gaps.set(ch, g);
    }
  }
  // Before the `continue`, or `--gaps` reports its findings against zero rows.
  totals.rows += rows.length;
  if (flags.has('--gaps') || flags.has('--units')) continue;
  const judged = rows.filter((r) => r.want);
  const exact = judged.filter((r) => r.out === r.want).length;
  const near = judged.filter((r) => loose(r.out) === loose(r.want)).length;
  totals = {
    rows: totals.rows,
    judged: totals.judged + judged.length,
    exact: totals.exact + exact,
    near: totals.near + near,
  };

  const pct = (/** @type {number} */ n) => (judged.length ? `${((n / judged.length) * 100).toFixed(1)}%` : '--');
  console.log(`\n\x1b[1m${target}\x1b[0m  ${rows.length} rows`
    + (judged.length ? `  ${judged.length} curated  exact ${pct(exact)}  loose ${pct(near)}` : '  no curated sheet'));

  let show = rows;
  if (flags.has('--diff')) show = judged.filter((r) => r.out !== r.want);
  else if (!flags.has('--all') && !only) show = rows.slice(0, 10);
  if (flags.has('--score')) continue;
  for (const r of show) {
    console.log(`  ${pad(r.text, 22)}${pad(r.ipa, 26)}${pad(r.out, 24)}${r.want && r.want !== r.out ? `\x1b[31mwant ${r.want}\x1b[0m` : ''}`);
  }
}

if (flags.has('--units')) {
  // **The review list `--gaps` cannot produce.** `spellSlot` walks a slot's
  // *string*, so a phoneme with no rule of its own is spelt one codepoint at a
  // time -- and if the table maps the bare diacritic, the result is plausible
  // letters rather than raw IPA. `--gaps` then reports "none" while Hindi /ɟʰ/
  // prints as `ji` plus whatever `ʰ` gives; the Japanese table had exactly that,
  // spelling /ɟʰ/ as ジュハ on 77 rows.
  //
  // Decomposition is not itself wrong -- dropping Russian palatalisation and
  // approximating the Arabic emphatics are documented choices, and both show up
  // here. So this is a list to read, not a bar to clear: every entry is a phoneme
  // whose spelling nobody decided directly.
  const keys = new Set([
    ...(table.rules.phonemes ?? []).map((/** @type {any} */ r) => r.ipa),
    ...Object.values(table.rules.targets ?? {}).flatMap(
      (/** @type {any} */ t) => (t.phonemes ?? []).map((/** @type {any} */ r) => r.ipa),
    ),
  ]);
  // The engine strips tone before it tokenises, when the policy says to -- so
  // scanning the raw column tokenises a string the table never sees. Vietnamese
  // writes `a˩ˀ`: raw, the tone letter blocks the glottal mark from binding and both
  // come out as skipped one-character units, hiding ten real phonemes from a
  // tone-dropping reader. Every such table had the same blind spot; only Vietnamese
  // triggers it.
  const tone = (table.rules.policy?.tone ?? 'keep') === 'drop';
  /** @type {Map<string, {count:number, langs:Set<string>}>} */ const units = new Map();
  for (const target of targets) {
    for (const row of await rowsFor(table, target)) {
      const seen = tone ? row.ipa.replace(/[\u02E5-\u02E9]/g, '') : row.ipa;
      for (const unit of phonemesOf(seen.replace(/\s+/g, ''))) {
        if (unit.length < 2 || keys.has(unit)) continue;
        const held = units.get(unit) ?? { count: 0, langs: new Set() };
        held.count += 1;
        held.langs.add(target);
        units.set(unit, held);
      }
    }
  }
  const ranked = [...units].sort((a, b) => b[1].count - a[1].count);
  console.log(`\n\x1b[1m${ranked.length} phonemes spelt by decomposition\x1b[0m rather than by a `
    + `rule of their own, against ${keys.size} rule keys. Read them: a diacritic mapped to `
    + `nothing is a decision, and a diacritic mapped to a letter is usually a bug.`);
  for (const [unit, held] of ranked) {
    console.log(`  \x1b[1m${unit}\x1b[0m  ${String(held.count).padStart(5)}x   ${[...held.langs].join(' ')}`);
  }
  if (!ranked.length) console.log('  none -- every phoneme the corpus produces has its own rule.');
  process.exit(0);
}

if (flags.has('--gaps')) {
  const ranked = [...gaps].sort((a, b) => b[1].count - a[1].count);
  console.log(`\n\x1b[1m${ranked.length} unmapped symbols\x1b[0m reaching the page across `
    + `${targets.length} targets, ${totals.rows} rows:`);
  for (const [ch, g] of ranked) {
    console.log(`  \x1b[1m${ch}\x1b[0m  U+${ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`
      + `  ${String(g.count).padStart(5)}x   ${[...g.examples].join('   ')}`);
  }
  if (!ranked.length) console.log('  none -- every symbol in every target has a rule.');
  process.exit(0);
}

if (totals.judged) {
  const p = (/** @type {number} */ n) => `${((n / totals.judged) * 100).toFixed(1)}%`;
  console.log(`\n\x1b[1mALL\x1b[0m  ${totals.rows} rows  ${totals.judged} curated`
    + `  exact ${p(totals.exact)}  loose ${p(totals.near)}`);
} else {
  console.log(`\n\x1b[1mALL\x1b[0m  ${totals.rows} rows generated. No curated sheet exists for a `
    + `${source} reader, so there is nothing to score against: read the output instead.`);
}
