// What the native bundle may and may not contain.
//
// `scripts/build_mobile.mjs` assembles `dist/mobile/`, which a Capacitor shell copies
// into the application. Two failures matter and neither is visible on a device
// without a console attached: a file the app reaches that is not there, and a file
// that is there and should not be. The first is a white screen; the second is a
// repository's worth of test fixtures and research notes shipped to a store.
//
// The browser half -- that every page actually loads from the bundle with nothing
// 404ing -- is `tests/mobile-bundle.spec.js`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { nativePackManifest, STARTER_LANGUAGES } from '../scripts/native_packs.mjs';
import { parseTable } from '../core/csv.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = join(ROOT, 'dist/mobile');

// Built once for the whole file; subprocesses inherit the caller's CPU affinity.
execFileSync('node', ['scripts/build_mobile.mjs', '--quiet'], { cwd: ROOT });

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  /** @type {string[]} */ const out = [];
  for (const entry of await readdir(join(OUT, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await walk(rel));
    else out.push(rel);
  }
  return out;
}
const files = await walk('');
const present = new Set(files);

test('every entry point and its stylesheet is in the bundle', async () => {
  for (const page of ['index.html', 'sheet.html', 'customize.html', 'conversation.html',
    'style.css', 'conversation.css', 'manifest.webmanifest']) {
    assert.ok(present.has(page), `${page} is missing from the bundle`);
  }
  // A page the build forgets is a page that 404s inside the app with no address bar
  // to show it, so the list is checked against the directory rather than the script.
  const web = (await readdir(ROOT)).filter((f) => f.endsWith('.html'));
  for (const page of web) assert.ok(present.has(page), `${page} exists but is not bundled`);
});

test('nothing that belongs only to the repository is in the bundle', () => {
  const stray = files.filter((f) => /^(tests|scripts|content|docs|node_modules|\.git)\//.test(f)
    || /^(package|jsconfig|playwright|AGENTS|summary|README)/i.test(f)
    || f === 'shift');
  assert.deepEqual(stray, [], `these do not belong in an application bundle: ${stray.join(', ')}`);
});

test('no service worker, and the marker that says why', async () => {
  // A WebView serves from the application's own container, so a worker would be a
  // second cache in front of files that are already local -- and a stale-shell bug
  // on an app that updates through a store.
  assert.ok(!present.has('sw.js'), 'the bundle ships a service worker');
  const marker = JSON.parse(await readFile(join(OUT, 'data/native.json'), 'utf8'));
  assert.equal(marker.serviceWorker, false);
  assert.equal(marker.native, true);
  assert.deepEqual(marker.starter, STARTER_LANGUAGES);
  // And the web still says the opposite, so `registerOffline` reads a cached file
  // rather than a 404 on every page load.
  const web = JSON.parse(await readFile(join(ROOT, 'data/native.json'), 'utf8'));
  assert.equal(web.serviceWorker, true);
  assert.equal(web.native, false);
});

test('the pack index lists only packs that shipped', async () => {
  // The gallery draws a card without a thumbnail whenever the index does not list
  // the pair, so trimming the index is what stops it requesting a file the bundle
  // left out. If the two ever disagree, the app 404s on a picture.
  const index = JSON.parse(await readFile(join(OUT, 'packs/index.json'), 'utf8'));
  assert.ok(index.packs.length > 0, 'no packs at all, so every card is a placeholder');
  for (const pack of index.packs) {
    assert.ok(STARTER_LANGUAGES.includes(pack.source) && STARTER_LANGUAGES.includes(pack.target));
    const dir = `packs/${pack.target}__${pack.source}`;
    assert.ok(present.has(`${dir}/thumb.png`), `${dir} is in the index with no thumbnail`);
    assert.ok(present.has(`${dir}/face-1.svg.gz`), `${dir} is in the index with no face`);
  }
  // ...and the converse: nothing shipped that the index does not name.
  const named = new Set(index.packs.map((/** @type {any} */ p) => `${p.target}__${p.source}`));
  const orphans = files.filter((f) => f.startsWith('packs/') && f !== 'packs/index.json')
    .map((f) => f.split('/')[1]).filter((d) => !named.has(d));
  assert.deepEqual([...new Set(orphans)], [], 'packs shipped that the index does not list');
});

test('only starter language payloads and required font styles ship', async () => {
  const manifest = JSON.parse(await readFile(join(OUT, 'data/native-packs.json'), 'utf8'));
  const needed = new Set(STARTER_LANGUAGES.flatMap((code) =>
    [...manifest.languages[code].files, ...manifest.languages[code].fonts].map((entry) => entry.path)));
  assert.deepEqual(manifest.bundled, [...needed].sort());
  for (const path of needed) assert.ok(present.has(path), `starter payload missing: ${path}`);
  const managed = files.filter((path) => /^data\/(?:lang\/|(?:countries|emphasis)\/[^/]+\.csv$|fonts\/.*\.(?:ttf|woff2)$)/.test(path));
  assert.deepEqual(managed.sort(), [...needed].sort(), 'a non-starter language or unused font was bundled');
  // Corpus/UI metadata remains available before any language is downloaded.
  for (const path of ['data/concepts/core.csv', 'data/i18n/ja.json', 'data/registry/section-titles/ja.csv',
    'data/registry/emergency-labels/ja.csv', 'data/respell/rules/index.json', 'data/countries/index.json',
    'data/fonts/manifest.json', 'data/boards/index.json']) assert.ok(present.has(path), `${path} is required metadata`);
});

test('download inventory pins every payload to existing bytes and all usable font styles', async () => {
  const manifest = JSON.parse(await readFile(join(OUT, 'data/native-packs.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/);
  assert.equal(manifest.baseUrl,
    `https://raw.githubusercontent.com/NikVetr/vetr-dev-site/${manifest.sourceCommit}/pocket-language-guide/`);
  assert.deepEqual(manifest, await nativePackManifest(ROOT), 'inventory is not reproducible');
  const scriptRows = parseTable(await readFile(join(ROOT, 'data/registry/scripts.csv'), 'utf8'));
  const stacks = Object.fromEntries(scriptRows.map((row) => [row.iso15924, row.font_stack]));
  /** @type {{stack:string,file:string}[]} */
  const faces = JSON.parse(await readFile(join(ROOT, 'data/fonts/manifest.json'), 'utf8')).faces;
  const registry = parseTable(await readFile(join(ROOT, 'data/registry/languages.csv'), 'utf8'));
  /** @type {Set<string>} */ const checked = new Set();
  for (const row of registry) {
    /** @type {{files:{path:string,bytes:number,sha256:string}[],fonts:{path:string,bytes:number,sha256:string}[]}} */
    const language = manifest.languages[row.bcp47];
    assert.ok(language, `${row.bcp47}: language omitted from download inventory`);
    const variants = new Set(['latin', 'latin-cond', stacks[row.script]]
      .flatMap((stack) => [stack, `${stack}-serif`, `${stack}-cond`, `${stack}-cond-serif`]));
    const expectedFonts = faces.filter((face) => variants.has(face.stack))
      .flatMap((face) => [`data/fonts/${face.file}.ttf`, `data/fonts/${face.file}.woff2`]).sort();
    assert.deepEqual(language.fonts.map((entry) => entry.path).sort(), expectedFonts, `${row.bcp47}: incomplete font styles/formats`);
    const paths = new Set(language.files.map((entry) => entry.path));
    for (const group of (await readdir(join(ROOT, 'data/lang', row.bcp47))).filter((name) => name.endsWith('.csv'))) {
      assert.ok(paths.has(`data/lang/${row.bcp47}/${group}`), `${row.bcp47}/${group}: missing corpus data`);
    }
    for (const entry of [...language.files, ...language.fonts]) {
      assert.ok(/^data\//.test(entry.path) && !entry.path.includes('..') && !entry.path.includes('://'));
      if (checked.has(entry.path)) continue;
      checked.add(entry.path);
      const bytes = await readFile(join(ROOT, entry.path));
      assert.equal(entry.bytes, bytes.length, `${entry.path}: wrong size`);
      assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'), `${entry.path}: wrong digest`);
    }
  }
  const marker = JSON.parse(await readFile(join(OUT, 'data/native.json'), 'utf8'));
  assert.equal(marker.packsVersion, manifest.version);
});

test('every module the pages import is in the bundle', async () => {
  // The closure, walked rather than trusted. A relative import that resolves on the
  // web and not in the bundle is the one failure this whole script exists to stop,
  // and `DIRS` copying `core`, `render` and `ui` whole is an assumption until it is
  // checked against what the files actually say.
  /** @type {Set<string>} */ const seen = new Set();
  /** @type {string[]} */ const missing = [];
  const visit = async (/** @type {string} */ rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    let src;
    try { src = await readFile(join(OUT, rel), 'utf8'); } catch { missing.push(rel); return; }
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
      const next = new URL(m[1], `file:///${rel}`).pathname.replace(/^\//, '');
      await visit(next);
    }
  };
  for (const entry of ['ui/gallery.js', 'ui/sheet-options.js', 'ui/studio.js', 'ui/conversation.js']) {
    await visit(entry);
  }
  assert.deepEqual(missing, [], `imported but not bundled: ${missing.join(', ')}`);
  assert.ok(seen.size > 40, `only walked ${seen.size} modules, so the walk is not walking`);
});

test('the bundle is a sane size and is dominated by fonts, not packs', async () => {
  let total = 0;
  /** @type {Record<string, number>} */ const byClass = {};
  for (const file of files) {
    const { size } = await stat(join(OUT, file));
    total += size;
    const kind = file.startsWith('packs/') ? 'packs'
      : file.startsWith('data/fonts/') ? 'fonts' : 'rest';
    byClass[kind] = (byClass[kind] ?? 0) + size;
  }
  // Tripwires for accidentally restoring all language payloads or all previews.
  assert.ok(byClass.packs < 1 * 1048576,
    `packs are ${(byClass.packs / 1048576).toFixed(0)}MB, so the index trim is not biting`);
  // The starter scripts keep TTF for layout/export and WOFF2 for display.
  assert.ok(byClass.fonts > byClass.packs, 'fonts should be the bundle, packs the extra');
  assert.ok(total < 40 * 1048576, `${(total / 1048576).toFixed(0)}MB exceeds the starter installation budget`);
});
