import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { nativePackManifest } from '../scripts/native_packs.mjs';

const root = new URL('..', import.meta.url).pathname;

/** Exercise real app loaders with a persistent native bridge and local release assets.
 * Native transport/device checks remain separate from this browser integration. */
async function nativeFixture(page, { firstLaunch = false, small = false } = {}) {
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
  await page.route('http://127.0.0.1:8097/data/**', async (route) => {
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

test('native downloads survive reload, supply print fonts offline, and can be deleted without personal data', async ({ page }) => {
  await nativeFixture(page);
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.evaluate(() => localStorage.setItem('plg.about', JSON.stringify({ name: 'Keep me' })));
  await page.locator('#site-menu').click();
  const settings = page.locator('dialog.speaker-settings');
  await settings.getByText('Languages on this device', { exact: true }).click();
  const hindi = settings.locator('[data-language="hi"]');
  await hindi.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(hindi.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('fixture.offline', 'true'));
  await page.goto('/customize.html?target=hi&source=en');
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 120_000 });
  expect(await page.evaluate(() => [...document.querySelectorAll('style[id^=plg-fonts]')].some((s) => s.textContent.includes('blob:')))).toBe(true);
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.locator('#site-menu').click();
  await settings.getByText('Languages on this device', { exact: true }).click();
  await hindi.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(hindi.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('plg.about')).name)).toBe('Keep me');
  await page.goto('/conversation.html?target=hi&source=en&board=spa');
  await expect(page.locator('dialog.native-download')).toBeVisible();
  await expect(page.locator('dialog.native-download')).toContainText('Network offline');
  await expect(page.locator('.board-cell')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.removeItem('fixture.offline'));
  await page.locator('dialog.native-download').getByRole('button', { name: 'Retry download' }).click();
  await expect(page.locator('.board-cell').first()).toBeVisible();
});

test('native first launch defaults to on-demand and remembers deferral', async ({ page }) => {
  await nativeFixture(page, { firstLaunch: true, small: true });
  await page.goto('/');
  const setup = page.locator('dialog.native-language-setup');
  await expect(setup).toBeVisible();
  await expect(setup.getByRole('button', { name: /Save every language.*[\d.]+ MB/ })).toBeVisible();
  await expect(setup.locator('input:checked')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('fixture.file.DATA.')))).toBe(false);
  await setup.getByRole('button', { name: 'Download as I go' }).click();
  await expect(page.locator('.card').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.card').first()).toBeVisible();
  await expect(setup).toHaveCount(0);
});

test('first-launch selection downloads only checked languages; settings can save all', async ({ page }) => {
  await nativeFixture(page, { firstLaunch: true, small: true });
  await page.goto('/');
  const setup = page.locator('dialog.native-language-setup');
  await setup.getByRole('checkbox', { name: 'German', exact: true }).check();
  await setup.getByRole('button', { name: /Save selected languages/ }).click();
  await expect(setup).toHaveCount(0);
  await expect(page.locator('.card').first()).toBeVisible();
  const states = () => page.evaluate(async () => (await (await import('./ui/platform/language-packs.js')).nativeLanguagePacks()).status());
  expect((await states()).de.state).toBe('installed');
  expect((await states()).fr.state).toBe('missing');
  await page.locator('#site-menu').click();
  await page.locator('dialog.speaker-settings').getByRole('button', { name: /Save every language/ }).click();
  await expect.poll(async () => (await states()).fr.state).toBe('installed');
  expect((await states()).en.state).toBe('bundled');
});

test('opening an unavailable native language automatically downloads and reuses it offline', async ({ page }) => {
  await nativeFixture(page);
  await page.goto('/conversation.html?target=de&source=en&board=spa');
  const dialog = page.locator('dialog.native-download');
  await expect(page.locator('.board-cell').first()).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(async () => (await (await import('./ui/platform/language-packs.js')).nativeLanguagePacks()).status().then((s) => s.de.state))).toBe('installed');
  await page.evaluate(() => sessionStorage.setItem('fixture.offline', 'true'));
  await page.reload();
  await expect(page.locator('.board-cell').first()).toBeVisible();
});

test('cancelling a download also dismisses language requests already queued by the page', async ({ page }) => {
  await nativeFixture(page);
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('fixture.offline', 'true'));
  await page.evaluate(async () => {
    const { requestLanguageDownload } = await import('./ui/native-languages.js');
    globalThis.downloadsDone = Promise.allSettled([requestLanguageDownload('de'), requestLanguageDownload('fr')]);
  });
  await expect(page.locator('dialog.native-download')).toBeVisible();
  await page.locator('dialog.native-download').evaluate((dialog) => dialog.close());
  expect(await page.evaluate(async () => (await globalThis.downloadsDone).map((result) => result.status))).toEqual(['rejected', 'rejected']);
  await expect(page.locator('dialog.native-download')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('fixture.file.DATA.')))).toBe(false);
});
