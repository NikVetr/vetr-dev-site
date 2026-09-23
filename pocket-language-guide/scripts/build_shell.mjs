// Generate the service worker's precache list.
//
//   npm run shell
//
// This was a hand-written array in sw.js, and it drifted the moment a module was
// added: seven shipped files were missing, so the studio would have failed with the
// network off -- the one situation the app exists for. The list is now derived from
// what is actually on disk, and its version is a hash of those files' contents, so
// the worker re-primes when any of them changes.
//
// Language data and packs are deliberately excluded: they are megabytes per
// language and are cached on request by the gallery's "Save offline".
//
// `--check` verifies the committed files are current instead of rewriting them, so
// `npm run check` catches a module that was added without regenerating.
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');
const INDEX_PATH = 'data/respell/overrides/index.json';
const RULES_INDEX_PATH = 'data/respell/rules/index.json';

/** Directories whose contents belong in the shell, searched recursively. */
const CODE_DIRS = ['core', 'render', 'ui'];

/** Individual files the app cannot start without. */
const ENTRY_FILES = [
  'index.html', 'sheet.html', 'customize.html', 'conversation.html',
  'style.css', 'conversation.css',
  'favicon.svg', 'manifest.webmanifest',
  'vendor/fontkit.esm.js', 'vendor/pdf-lib.esm.js',
  'data/presets.json', 'data/icons.json', 'data/coverage.json', 'data/native.json',
  'data/fonts/manifest.json',
  // The only *face* in the shell, and only because of two cards. Every other
  // script-glyph badge in the gallery is drawn by the reader's own system font --
  // that is the whole reason the badge can be a character rather than an image --
  // but pIqaD and tengwar are not in Unicode, so no operating system anywhere
  // has a glyph for U+F8E4 or U+E003 and the Klingon and Quenya cards would show
  // two boxes. `style.css` reaches this file through a `unicode-range`-scoped
  // `@font-face`, so a page with no conscript character on it never fetches it;
  // offline there is no such thing as "never", so it is precached. 89KB against
  // a 4.4MB shell, and it is the same file either pack downloads anyway.
  'data/fonts/latin-400.woff2',
  'packs/index.json',
  'data/respell/overrides/index.json',
];

/** Everything in these directories, non-recursively. */
// data/i18n is in here because the interface has to keep working offline in the
// reader's own language, not fall back to English the moment the network goes.
// `data/boards` holds the conversation boards, which are small JSON files a board
// page cannot open without -- and a board is the one surface meant to work in a
// basement with no signal, so it is precached rather than fetched on demand.
/**
 * The pair a board opens with when the query string names none: `ui/conversation.js`
 * falls back to Mandarin for the listener and the reader's own language for the
 * owner, which for a first visit is English.
 */
const DEFAULT_BOARD_PAIR = ['zh-Hans', 'en'];

const DATA_DIRS = ['data/registry', 'data/registry/section-titles',
  'data/registry/emergency-labels', 'data/themes', 'data/respell/overrides',
  'data/respell/rules', 'data/i18n', 'data/boards', 'data/brand'];

/**
 * The corpus a conversation board needs, for every pair a board declares.
 *
 * **A board is the one surface that has to work with no preparation.** Everything
 * else in the app is something a reader chose in advance: they browsed the gallery,
 * they opened a sheet, and if they meant to use it abroad they saved the pair.
 * Someone face down on a massage table in a country whose language they do not speak
 * did not do any of that, and has no signal to do it now.
 *
 * Measured rather than assumed: offline without the pair saved, the board came up
 * with zero buttons and `LoadError: data/concepts/social.csv: HTTP 504`, because
 * `loadCorpus` reads every concept group and `loadLanguage` asks for every group of
 * each language. So the shell carries them.
 *
 * Bounded by *declared board pairs*, not by languages, which is what keeps this from
 * growing with the registry: 204KB of concepts plus 284KB for the one pair a board
 * serves today, against a 4.4MB shell. The fonts are not here and are not needed --
 * a board draws in the system stack, with no `ensureFontCss` and no subset.
 */
async function boardCorpus() {
  /** @type {string[]} */ const out = [];
  let index;
  try {
    index = JSON.parse(await readFile(join(ROOT, 'data/boards/index.json'), 'utf8'));
  } catch {
    return out;  // no boards shipped yet
  }
  // **Bounded by the default pair, not by what the boards can serve.** They used to
  // declare one pair each and the shell carried both its languages; the pairs are
  // computed from the corpus now, and every board that is not the massage one serves
  // most of the registry -- so "every language a board mentions" is every language,
  // and the shell would grow from 4.4MB to something nobody downloads on a hotel
  // wifi. The concept bank below is language-independent and every pair needs it, so
  // it stays; the *rows* are the two the app opens with when nobody has chosen. Any
  // other pair is a pair someone picked, which means they were in the app with a
  // connection, which is when Save for offline is the honest answer -- the same rule
  // a sheet has always followed.
  const languages = new Set(DEFAULT_BOARD_PAIR);
  if (!index.boards.length) return out;
  const groups = (await readdir(join(ROOT, 'data/concepts')))
    .filter((f) => f.endsWith('.csv'));
  for (const group of groups) out.push(`data/concepts/${group}`);
  for (const code of languages) {
    for (const group of groups) {
      // A language legitimately has no file for some groups, and `loadLanguage`
      // tolerates that -- but the shell may not name a file that is not there.
      const rel = `data/lang/${code}/${group}`;
      try {
        await stat(join(ROOT, rel));
        out.push(rel);
      } catch { /* this pack does not carry that group */ }
    }
    // The wordings that depend on who is speaking, where the language has any. Same
    // rule as the groups above: absent for most, and the shell may not name a file
    // that is not there. It belongs here rather than in the registry scan because it
    // is per language and only the board's own pairs are carried.
    try {
      await stat(join(ROOT, `data/lang/${code}/variants.csv`));
      out.push(`data/lang/${code}/variants.csv`);
    } catch { /* this language asks nothing about the speaker, or has no wordings yet */ }
  }
  return out;
}

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  /** @type {string[]} */ const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await walk(rel));
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

// A Set because the generated respell index is named explicitly (it may not exist
// yet on a fresh checkout) and is also found by the data-directory scan once it
// does; without dedup the first run and every run after it disagreed.
const files = [...new Set([
  ...ENTRY_FILES,
  ...(await boardCorpus()),
  ...(await Promise.all(CODE_DIRS.map(walk))).flat(),
  ...(await Promise.all(DATA_DIRS.map(async (dir) => (await readdir(join(ROOT, dir)))
    // `.png` for `data/brand`, the launcher icons the manifest names: an icon the
    // worker never cached is a broken install prompt offline.
    .filter((f) => f.endsWith('.csv') || f.endsWith('.json') || f.endsWith('.png'))
    .map((f) => `${dir}/${f}`)))).flat(),
])].sort();

// Which curated respelling files exist. Without this the app guessed, and asking
// for `zh-Hans__ja__ja-US.csv` -- a pair nobody has hand-curated -- 404ed on the
// happy path and left "Save offline" stuck on "Partly saved".
const overrides = files
  .filter((f) => f.startsWith('data/respell/overrides/') && f.endsWith('.csv'))
  .map((f) => f.slice('data/respell/overrides/'.length, -'.csv'.length));
const overrideIndex = `${JSON.stringify(overrides, null, 2)}\n`;

// And which reading languages have a *finished* respelling rule table. Most have
// none yet, and a pair whose reader has none simply gets no generated respelling --
// so this list is what stops the app asking for sixteen files that were never
// written.
//
// **`status: 'ready'` is required, and absent means draft.** This list used to be
// every file in the directory, which meant a table shipped the moment it existed:
// a half-written Portuguese draft with the literal string `PLACEHOLDER` in it went
// into the gallery's thumbnails on the next `npm run shell`, and each rebuild
// silently re-added tables that had been taken out. A table is worked on in place,
// because `respell_check.mjs` reads the directory so it can be run before it is
// published -- so being finished has to be a claim its author makes, the same way
// `languages.csv` carries `status` and the gallery honours it.
const ready = await Promise.all(files
  .filter((f) => f.startsWith('data/respell/rules/') && f.endsWith('.json')
    && !f.endsWith('/index.json'))
  .map(async (f) => {
    const table = JSON.parse(await readFile(join(ROOT, f), 'utf8'));
    return table.status === 'ready' ? f.slice('data/respell/rules/'.length, -'.json'.length) : '';
  }));
const rulesIndex = `${JSON.stringify(ready.filter(Boolean), null, 2)}\n`;

// This script's own output, so write it before checking that the list is real.
if (!CHECK) {
  await writeFile(join(ROOT, INDEX_PATH), overrideIndex);
  await writeFile(join(ROOT, RULES_INDEX_PATH), rulesIndex);
}

// Fail loudly rather than shipping a worker that precaches a 404.
const missing = [];
for (const file of files) {
  try {
    await stat(join(ROOT, file));
  } catch {
    missing.push(file);
  }
}
if (missing.length) {
  throw new Error(`shell list names files that do not exist: ${missing.join(', ')}`);
}

const hash = createHash('sha256');
for (const file of files) {
  hash.update(file);
  hash.update(await readFile(join(ROOT, file)));
}
const version = hash.digest('hex').slice(0, 12);

const manifest = `${JSON.stringify({
  note: 'Generated by scripts/build_shell.mjs. Do not edit.',
  version,
  files,
}, null, 2)}\n`;

// The browser only re-runs install when sw.js itself changes, so the version has
// to live in the worker too.
const swPath = join(ROOT, 'sw.js');
const sw = await readFile(swPath, 'utf8');
const nextSw = sw.replace(/^const VERSION = '[^']*';$/m, `const VERSION = 'plg-${version}';`);
if (nextSw === sw && !sw.includes(`plg-${version}`)) {
  throw new Error('could not find the VERSION line in sw.js');
}

if (CHECK) {
  const onDisk = await readFile(join(ROOT, 'data/shell.json'), 'utf8').catch(() => '');
  const indexOnDisk = await readFile(join(ROOT, INDEX_PATH), 'utf8').catch(() => '');
  const rulesOnDisk = await readFile(join(ROOT, RULES_INDEX_PATH), 'utf8').catch(() => '');
  if (onDisk !== manifest || nextSw !== sw || indexOnDisk !== overrideIndex
    || rulesOnDisk !== rulesIndex) {
    throw new Error('data/shell.json is stale -- run `npm run shell` and commit the result');
  }
  console.log(`shell manifest current  ${files.length} files, version plg-${version}`);
} else {
  await writeFile(join(ROOT, 'data/shell.json'), manifest);
  await writeFile(swPath, nextSw);
  console.log(`data/shell.json  ${files.length} files, version plg-${version}`);
}
