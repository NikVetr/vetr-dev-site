// Cache one complete, versioned shell. An updated worker waits until tabs using
// the previous version close, keeping UI and catalog versions together.
const version = 'stretch-snack-16';
const shell = [
  './index.html',
  './style.css',
  './app.js',
  './session.js',
  './saved-routines.js',
  './check-in.js',
  './dom.js',
  './demo.js',
  './camera.js',
  './pose.js',
  './surface.js',
  './trainer.js',
  './equipment.js',
  './form-motion/model.js',
  './form-motion/retarget.js',
  './core/library/constraints.js',
  './core/library/programs.js',
  './core/library/program-sources.js',
  './core/library/fixtures.js',
  './core/library/floor.js',
  './core/library/yoga.js',
  './core/library/mobility.js',
  './core/program-dose.js',
  './movements/floor-rig.js',
  './movements/fixtures.js',
  './movements/fixtures-props.js',
  './movements/floor.js',
  './movements/yoga.js',
  './movements/mobility.js',
  './movements/mobility-props.js',
  './core/library/hand-neck.js',
  './core/library/lower.js',
  './core/library/sources.js',
  './core/library/upper.js',
  './movements/geometry.js',
  './movements/hand-neck-props.js',
  './movements/hand-neck.js',
  './movements/lower-props.js',
  './movements/lower.js',
  './movements/upper-props.js',
  './movements/upper.js',
  './core/catalog.js',
  './core/plan.js',
  './audio/cues.js',
  './audio/voice.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  '../shared/request.js',
  '../shared/theme.js',
  '../shared/tool-nav.css',
].map((path) => new URL(path, self.location.href).href);
const files = new Set(shell);
/** @type {ServiceWorkerGlobalScope} */
const worker = /** @type {any} */ (self);

worker.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const manifest = new URL('./audio/files.json', self.location.href);
      const response = await fetch(manifest, { cache: 'reload' });
      if (!response.ok) throw new Error('Speech catalog unavailable.');
      const clips = await response.json();
      const urls = [...shell, ...clips.map(/** @param {string} path */ (path) => new URL(path, manifest).href)];
      const cache = await caches.open(version);
      await cache.addAll(urls.map((url) => new Request(url, { cache: 'reload' })));
    })(),
  );
});
worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('stretch-snack-') && key !== version).map((key) => caches.delete(key)),
      );
      await worker.clients.claim();
    })(),
  );
});
worker.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const root = new URL('.', self.location.href);
  const entry =
    event.request.mode === 'navigate' &&
    (url.pathname === root.pathname || url.pathname === root.pathname + 'index.html') &&
    url.origin === root.origin;
  const asset = entry ? shell[0] : url.href;
  const voice = asset.startsWith(new URL('audio/clips/', root).href);
  if (event.request.method !== 'GET' || !(files.has(asset) || voice)) return;
  event.respondWith(caches.open(version).then(async (cache) => (await cache.match(asset)) ?? fetch(event.request)));
});

worker.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.tag !== 'stretch-snack-check-in') return;
  event.waitUntil(
    (async () => {
      const target = new URL('./#later', self.location.href);
      const windows = await worker.clients.matchAll({ type: 'window' });
      for (const client of windows) {
        if (new URL(client.url).pathname.startsWith(target.pathname)) {
          await client.focus();
          return;
        }
      }
      await worker.clients.openWindow(target.href);
    })(),
  );
});
