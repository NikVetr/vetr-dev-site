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

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = join(ROOT, 'dist/mobile');

// Built once for the whole file. It is a copy of forty megabytes and there is no
// reason to do it four times.
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
  // Not a benchmark, a tripwire. 114MB of the repository is pre-rendered packs and
  // the whole point of `PACK_SOURCES` is that they do not all come along; if this
  // ever fails, the trim has stopped working rather than the app having grown.
  assert.ok(byClass.packs < 10 * 1048576,
    `packs are ${(byClass.packs / 1048576).toFixed(0)}MB, so the index trim is not biting`);
  // The fonts are irreducible: the solver measures advance widths from the .ttf
  // through fontkit, so they are load-bearing for layout and not only for PDF export.
  assert.ok(byClass.fonts > byClass.packs, 'fonts should be the bundle, packs the extra');
  assert.ok(total < 120 * 1048576, `${(total / 1048576).toFixed(0)}MB is past what a phone app should carry`);
});
