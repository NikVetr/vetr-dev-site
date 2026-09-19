// Assemble the web bundle a native shell wraps.
//
//   node scripts/build_mobile.mjs [--quiet]
//
// Writes `dist/mobile/`, which Capacitor copies into the iOS and Android app. The
// app must work on the first launch after installation with no download, so this is
// a *closure* rather than a subset: every file the pages actually reach, and nothing
// else.
//
// **An allowlist, not a denylist.** The repository holds test fixtures, Python build
// environments, research notes, native build intermediates and an 8.6MB dump of
// glyph advance widths that was committed by accident and served to the public for a
// fortnight. A denylist would have shipped all of it and would go stale the next time
// somebody adds a directory. So this names what goes in, and fails if a file that is
// named cannot be found.
//
// **The packs are the whole size question.** They are 114MB of the repository's 172MB
// -- 2,756 thumbnails, 2,756 gzipped faces, and a 1.9MB index -- because both grow as
// the square of the language count. A phone application cannot carry that, and it
// does not have to: the gallery draws a card without a thumbnail whenever
// `packs/index.json` does not list the pair, so *trimming the index is what stops the
// request*. No gallery change, and nothing 404s. `PACK_SOURCES` says which reader
// languages get pre-rendered cards in the bundle; everyone else gets a card with a
// placeholder until they are online.

import { readFile, writeFile, mkdir, rm, cp, stat, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = join(ROOT, 'dist/mobile');
const QUIET = process.argv.includes('--quiet');

/**
 * Reader languages whose pre-rendered cards ride along.
 *
 * One source is 52 thumbnails and 52 faces, about 2.1MB. All 53 would be 114MB, and
 * the App Store's over-cellular limit alone makes that the wrong trade for a picture
 * of a card the reader is about to typeset anyway.
 */
const PACK_SOURCES = ['en'];

/** Directories copied whole, because every file in them is reachable at runtime. */
const DIRS = [
  'core', 'render', 'ui', 'vendor',
  'data/concepts', 'data/lang', 'data/registry', 'data/themes', 'data/i18n',
  'data/respell', 'data/boards', 'data/fonts',
];

/** Individual files, each of which some page names directly. */
const FILES = [
  'index.html', 'sheet.html', 'customize.html', 'conversation.html',
  'style.css', 'conversation.css', 'favicon.svg', 'manifest.webmanifest',
  'data/presets.json', 'data/icons.json', 'data/coverage.json',
  // `data/native.json` is not here: it is written below, overwriting the web's copy.
];

/**
 * Not in the bundle, and each for its own reason rather than by pattern.
 *
 * `sw.js` is the sharp one. A native WebView serves from the app's own container, so
 * a service worker adds a second cache in front of files that are already local --
 * pure overhead, and a stale-shell bug waiting to happen on an app that updates
 * through the store. `ui/app.js` registers it behind a `serviceWorker in navigator`
 * check, so omitting the file would 404 on every launch; the marker below is what
 * lets the page skip registration instead.
 */
const SKIP = new Set(['sw.js']);

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  /** @type {string[]} */ const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await walk(rel));
    else out.push(rel);
  }
  return out;
}

/** Every file the bundle should contain, as repository-relative paths. */
async function manifest() {
  /** @type {string[]} */ const files = [...FILES];
  for (const dir of DIRS) files.push(...await walk(dir));

  // The packs, trimmed to the sources that ride along, and the index trimmed with
  // them so the gallery never asks for one that did not.
  const index = JSON.parse(await readFile(join(ROOT, 'packs/index.json'), 'utf8'));
  const kept = index.packs.filter((/** @type {any} */ p) => PACK_SOURCES.includes(p.source));
  for (const pack of kept) {
    files.push(`packs/${pack.target}__${pack.source}/thumb.png`);
    files.push(`packs/${pack.target}__${pack.source}/face-1.svg.gz`);
  }
  return { files: files.filter((f) => !SKIP.has(f)), index: { ...index, packs: kept } };
}

/** @param {string[]} files */
async function report(files) {
  /** @type {Record<string, {n:number, bytes:number}>} */ const byClass = {};
  let total = 0;
  for (const file of files) {
    const { size } = await stat(join(OUT, file));
    const kind = file.startsWith('packs/') ? 'packs'
      : file.startsWith('data/fonts/') ? 'fonts'
        : file.startsWith('data/') ? 'data'
          : file.startsWith('vendor/') ? 'vendor' : 'code';
    (byClass[kind] ??= { n: 0, bytes: 0 });
    byClass[kind].n += 1;
    byClass[kind].bytes += size;
    total += size;
  }
  if (QUIET) return total;
  for (const [kind, { n, bytes }] of Object.entries(byClass).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${kind.padEnd(8)} ${String(n).padStart(5)} files ${(bytes / 1048576).toFixed(1).padStart(7)} MB`);
  }
  return total;
}

const { files, index } = await manifest();

// Rebuilt from nothing every time. An incremental copy accumulates the files a
// previous run needed and this one does not, which is how a bundle grows a
// dependency nobody can find in the source.
await rm(OUT, { recursive: true, force: true });
for (const file of files) {
  const to = join(OUT, file);
  await mkdir(dirname(to), { recursive: true });
  await cp(join(ROOT, file), to);
}

// The trimmed index, written rather than copied.
await writeFile(join(OUT, 'packs/index.json'), `${JSON.stringify(index, null, 1)}\n`);
files.push('packs/index.json');

// **The marker that tells the app it is native.** The web ships the same file saying
// `false`, so this is one small cached read rather than a 404 on every page load, and
// the two builds run byte-identical JavaScript -- the difference is a value in a data
// file, not a substitution across the sources.
await writeFile(join(OUT, 'data/native.json'), `${JSON.stringify({
  native: true,
  // No service worker in the bundle, so nothing should try to register one.
  serviceWorker: false,
  built: new Date().toISOString().slice(0, 10),
}, null, 1)}\n`);
files.push('data/native.json');

// Fail loudly on anything referenced but absent. Cheap here, and the alternative is
// a white screen on a device with no console attached.
/** @type {string[]} */ const missing = [];
for (const file of files) {
  try { await stat(join(OUT, file)); } catch { missing.push(file); }
}
if (missing.length) throw new Error(`bundle is missing: ${missing.join(', ')}`);

const total = await report(files);
if (!QUIET) {
  console.log(`dist/mobile  ${files.length} files  ${(total / 1048576).toFixed(1)} MB`
    + `  (packs for ${PACK_SOURCES.join(', ')})`);
}
