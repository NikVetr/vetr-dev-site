// Offline support.
//
// The whole point of a pocket guide is being abroad without data, so the app has
// to work with the network off -- including export, which is why every renderer is
// client-side. The shell is precached on install; a language's corpus and fonts
// are two megabytes or so per script, far too much to cache speculatively, so they
// are fetched on request from the gallery's "save for offline".
//
// Scoped to /pocket-language-guide/, so nothing else on the site is affected.

// Bump on any change to SHELL or to a shell file's contents. There is no build
// step to do it automatically, so it is a manual step -- see summary.md.
const VERSION = 'plg-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const PACK_CACHE = `${VERSION}-packs`;

const SHELL = [
  './',
  'index.html',
  'sheet.html',
  'customize.html',
  'style.css',
  'favicon.svg',
  'manifest.webmanifest',
  'core/csv.js',
  'core/fonts.js',
  'core/measure.js',
  'core/pack.js',
  'core/sheet.js',
  'core/types.js',
  'core/solve/atoms.js',
  'core/solve/columnbreak.js',
  'core/solve/fractions.js',
  'core/solve/index.js',
  'core/solve/justify.js',
  'core/solve/rowsplit.js',
  'core/solve/weights.js',
  'render/fonts.js',
  'render/impose.js',
  'render/pdf.js',
  'render/svg.js',
  'ui/app.js',
  'ui/content-tree.js',
  'ui/export.js',
  'ui/gallery.js',
  'ui/io.js',
  'ui/preview.js',
  'ui/sheet-options.js',
  'ui/studio.js',
  'vendor/fontkit.esm.js',
  'vendor/pdf-lib.esm.js',
  'data/presets.json',
  'data/icons.json',
  'data/coverage.json',
  'data/registry/languages.csv',
  'data/registry/scripts.csv',
  'data/registry/sections.csv',
  'data/registry/paper.csv',
  'data/registry/regions.csv',
  'data/themes/latex-reference.json',
  'data/fonts/manifest.json',
  'packs/index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll fails the whole install if any single request fails, which would
    // leave no service worker at all; cache what we can and report the rest.
    const results = await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    const failed = SHELL.filter((_, i) => results[i].status === 'rejected');
    if (failed.length) console.warn('[plg] shell files not cached:', failed);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (!key.startsWith(VERSION)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Stale-while-revalidate: instant offline, and a background refresh means a
  // deploy is picked up on the next visit without a hard reload.
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    const fresh = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(url.pathname.includes('/data/') || url.pathname.includes('/packs/')
          ? PACK_CACHE : SHELL_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);

    if (cached) return cached;
    const response = await fresh;
    if (response) return response;
    return new Response('Offline and this file was never cached.', {
      status: 504, headers: { 'content-type': 'text/plain' },
    });
  })());
});

// The gallery asks for a language's data and fonts explicitly, so a reader
// chooses what to carry rather than downloading every script.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache-urls') return;
  event.waitUntil((async () => {
    const cache = await caches.open(PACK_CACHE);
    const results = await Promise.allSettled(data.urls.map((/** @type {string} */ u) => cache.add(u)));
    const failed = data.urls.filter((/** @type {string} */ _, /** @type {number} */ i) => results[i].status === 'rejected');
    event.source?.postMessage({
      type: 'cache-urls-done', ok: failed.length === 0, failed, total: data.urls.length,
    });
  })());
});
