// The native app as the browser tests see it: the Capacitor plugins backed by local
// storage, and the release's pinned language inventory served from the checkout.
import { readFile } from 'node:fs/promises';
import { nativePackManifest } from '../scripts/native_packs.mjs';

const root = new URL('..', import.meta.url).pathname;

/** Exercise real app loaders with a persistent native bridge and local release assets.
 * Native transport/device checks remain separate from this browser integration. `page` may
 * be a browser context, for a test that opens several pages of one app.
 * @param {import('@playwright/test').Page|import('@playwright/test').BrowserContext} page */
export async function nativeFixture(page, { firstLaunch = false, small = false } = {}) {
  const manifest = await nativePackManifest(root);
  if (small) manifest.languages = Object.fromEntries(Object.entries(manifest.languages).filter(([code]) => ['en', 'zh-Hans', 'de', 'fr'].includes(code)));
  await page.route('**/data/native-packs.json', (route) => route.fulfill({ json: manifest }));
  await page.route(`${manifest.baseUrl}**`, async (route) => {
    const path = route.request().url().slice(manifest.baseUrl.length);
    await route.fulfill({ body: await readFile(root + path) });
  });
  const bundled = new Set(manifest.bundled);
  const managed = new Set(Object.values(manifest.languages).flatMap((pack) => [...pack.files, ...pack.fonts].map((file) => file.path)));
  // A successful read cannot secretly use the full web checkout instead of storage.
  await page.route((url) => url.hostname === '127.0.0.1' && url.pathname.startsWith('/data/'), async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    if (path === 'data/native-packs.json') return route.fulfill({ json: manifest });
    if (path === 'data/native.json') return route.fulfill({ json: { native: true, serviceWorker: false } });
    if (managed.has(path) && !bundled.has(path)) return route.fulfill({ status: 404, body: 'Not bundled' });
    return route.continue();
  });
  await page.addInitScript(({ firstLaunch }) => {
    if (!firstLaunch) localStorage.setItem('wanderwart.language-setup.v1', 'done');
    const missing = () => Object.assign(new Error('Missing file'), { code: 'OS-PLUG-FILE-0008' });
    const key = (directory, path) => `fixture.file.${directory}.${path}`;
    const read = (directory, path) => {
      const data = localStorage.getItem(key(directory, path));
      if (data === null) throw missing();
      return data;
    };
    globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      Preferences: {
        get: async ({ key }) => ({ value: localStorage.getItem(key) }),
        set: async ({ key, value }) => localStorage.setItem(key, value),
        remove: async ({ key }) => localStorage.removeItem(key),
        keys: async () => ({ keys: Object.keys(localStorage) }),
      },
      Filesystem: {
        readFile: async ({ directory, path }) => ({ data: read(directory, path) }),
        writeFile: async ({ directory, path, data }) => { localStorage.setItem(key(directory, path), data); return { uri: path }; },
        deleteFile: async ({ directory, path }) => { read(directory, path); localStorage.removeItem(key(directory, path)); },
        stat: async ({ directory, path }) => ({ type: 'file', size: atob(read(directory, path)).length }),
        readdir: async ({ directory, path }) => {
          const prefix = key(directory, path + '/');
          return { files: Object.keys(localStorage).filter((name) => name.startsWith(prefix)).map((name) => ({
            name: name.slice(prefix.length), type: 'file', size: atob(localStorage.getItem(name)).length,
          })) };
        },
      },
      CapacitorHttp: { request: async ({ url }) => {
        if (sessionStorage.getItem('fixture.offline')) throw new Error('Network offline');
        const response = await fetch(url);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let data = '';
        for (let i = 0; i < bytes.length; i += 0x8000) data += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { url, status: response.status, data: btoa(data) };
      } },
    } };
  }, { firstLaunch });
}
