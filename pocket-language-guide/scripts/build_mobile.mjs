// Assemble the web bundle a native shell wraps.
//
//   node scripts/build_mobile.mjs [--quiet]
//
// Writes `dist/mobile/`, which Capacitor copies into the iOS and Android app. The
// starter English/Mandarin pair works on first launch without a download. Other
// language data and script fonts are installed explicitly from a pinned inventory.
//
// **An allowlist, not a denylist.** The repository holds test fixtures, Python build
// environments, research notes, native build intermediates and an 8.6MB dump of
// glyph advance widths that was committed by accident and served to the public for a
// fortnight. A denylist would have shipped all of it and would go stale the next time
// somebody adds a directory. So this names what goes in, and fails if a file that is
// named cannot be found.
//
// Previews grow with the square of the language count. Only the starter pair's
// previews ride along; trimming their index keeps the gallery from requesting a
// preview the application does not carry.

import { readFile, writeFile, mkdir, rm, cp, stat, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { nativePackManifest, STARTER_LANGUAGES } from './native_packs.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = join(ROOT, 'dist/mobile');
const QUIET = process.argv.includes('--quiet');

/** Directories copied whole, because every file in them is reachable at runtime. */
const DIRS = [
  'core', 'render', 'ui', 'vendor',
  'data/concepts', 'data/registry', 'data/themes', 'data/i18n',
  'data/respell', 'data/boards', 'data/flags',
];

/** Individual files, each of which some page names directly. */
const FILES = [
  'index.html', 'sheet.html', 'customize.html', 'conversation.html', 'signal.html', 'drill.html',
  'style.css', 'conversation.css', 'favicon.svg', 'manifest.webmanifest',
  'data/presets.json', 'data/icons.json', 'data/coverage.json', 'data/offline.json',
  'data/fonts/manifest.json', 'data/countries/index.json',
  // The header's two marks and the two that move while a page loads. The launcher
  // PNGs beside them are the web's; an app has its own icon, built into the native project.
  'data/brand/mark.svg', 'data/brand/mark-dark.svg',
  'data/brand/mark-loading.svg', 'data/brand/mark-loading-dark.svg',
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
  const languagePacks = await nativePackManifest(ROOT);
  /** @type {string[]} */ const files = [...FILES, ...languagePacks.bundled];
  for (const dir of DIRS) files.push(...await walk(dir));

  // The packs, trimmed to the sources that ride along, and the index trimmed with
  // them so the gallery never asks for one that did not.
  const index = JSON.parse(await readFile(join(ROOT, 'packs/index.json'), 'utf8'));
  const kept = index.packs.filter((/** @type {any} */ p) => STARTER_LANGUAGES.includes(p.source)
    && STARTER_LANGUAGES.includes(p.target));
  for (const pack of kept) {
    files.push(`packs/${pack.target}__${pack.source}/thumb.png`);
    files.push(`packs/${pack.target}__${pack.source}/face-1.svg.gz`);
  }
  return { files: [...new Set(files.filter((f) => !SKIP.has(f)))], index: { ...index, packs: kept }, languagePacks };
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

const { files, index, languagePacks } = await manifest();

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
await writeFile(join(OUT, 'data/native-packs.json'), `${JSON.stringify(languagePacks)}\n`);
files.push('data/native-packs.json');

// **The marker that tells the app it is native.** The web ships the same file saying
// `false`, so this is one small cached read rather than a 404 on every page load, and
// the two builds run byte-identical JavaScript -- the difference is a value in a data
// file, not a substitution across the sources.
await writeFile(join(OUT, 'data/native.json'), `${JSON.stringify({
  native: true,
  // No service worker in the bundle, so nothing should try to register one.
  serviceWorker: false,
  starter: STARTER_LANGUAGES,
  packsVersion: languagePacks.version,
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
    + `  (starter languages: ${STARTER_LANGUAGES.join(', ')})`);
}
