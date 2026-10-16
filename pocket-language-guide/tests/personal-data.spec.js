import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('a refused restore keeps the failure visible and the previous data intact', async ({ page }) => {
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.face.focused')).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('plg.about', JSON.stringify({ name: 'before' }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'plg.about' && JSON.parse(value).name === 'after') throw new Error('simulated quota refusal');
      return set.call(this, key, value);
    };
    globalThis.__restorePage = true;
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const section = page.locator('dialog.speaker-settings fieldset').filter({ has: page.getByRole('button', { name: /^Load a copy/ }) });
  await section.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, created: 'test', about: { name: 'after' } })),
  });
  await expect(section.locator('[role=status]')).toContainText('simulated quota refusal');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('plg.about')).name)).toBe('before');
  expect(await page.evaluate(() => globalThis.__restorePage)).toBe(true);
});

const quiz = { pairs: { es__en: { n: [1, 0, 0], days: {}, rows: {} } } };
const cards = [{ id: 'test', name: 'Saved card', at: 1, target: 'es', source: 'en', spec: {},
  finish: { mode: '', flip: 'short-edge' }, dpi: 300,
  summary: { sections: 1, items: 2, faces: 2, width: 504, height: 360 } }];

test('native export storage shows its size, reports cleanup failure and preserves personal data', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.evaluate(async (savedCards) => {
    localStorage.setItem('plg.about', JSON.stringify({ name: 'keep me' }));
    localStorage.setItem('plg.speaker', JSON.stringify({ speaker_gender: 'feminine' }));
    localStorage.setItem('plg.cards', JSON.stringify(savedCards));
    let refuse = true;
    let files = [
      { name: '11111111-1111-4111-8111-111111111111--fixture.png', type: 'file', size: 2000000 },
      { name: 'unrelated.txt', type: 'file', size: 3000000 },
    ];
    globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: {
      readdir: async ({ path, directory }) => {
        if (path !== 'wanderwart-exports' || directory !== 'CACHE') throw new Error('unexpected directory');
        return { files };
      },
      deleteFile: async ({ path, directory }) => {
        if (path !== 'wanderwart-exports/11111111-1111-4111-8111-111111111111--fixture.png') throw new Error('unexpected file');
        if (directory !== 'CACHE') throw new Error('unexpected directory');
        if (refuse) { refuse = false; throw new Error('simulated native deletion refusal'); }
        files = files.filter((file) => !path.endsWith('/' + file.name));
      },
    } } };
    const { travelSection } = await import('/ui/travel-check.js');
    const section = travelSection({ nameOf: (code) => code,
      loadText: async () => { throw new Error('native languages must stay bundled'); } });
    section.id = 'native-storage-check';
    document.body.append(section);
    globalThis.__nativeRemaining = () => files.map((file) => file.name);
  }, cards);
  const section = page.locator('#native-storage-check');
  await expect(section).toContainText(/Temporary export copies: \u20682 MB\u2069/);
  const clear = section.getByRole('button', { name: 'Clear temporary export copies', exact: true });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(section.locator('.export-cache-status')).toHaveText('simulated native deletion refusal');
  await expect(clear).toBeEnabled();
  await expect(section).toContainText(/Temporary export copies: \u20682 MB\u2069/);
  await clear.click();
  await expect(section.locator('.export-cache-status')).toContainText('Temporary export copies cleared.');
  await expect(section).toContainText(/Temporary export copies: \u20680 MB\u2069/);
  expect(await page.evaluate(() => globalThis.__nativeRemaining())).toEqual(['unrelated.txt']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('plg.about')))).toEqual({ name: 'keep me' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('plg.speaker')))).toEqual({ speaker_gender: 'feminine' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('plg.cards')))).toEqual(cards);
});

for (const [part, key, value] of [['quiz', 'plg.drill-record', quiz], ['cards', 'plg.cards', cards]]) {
  test(`a backup can contain only ${part}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(([key, value]) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);
    await page.locator('#site-menu').click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save a copy', exact: true }).click();
    const download = await downloading;
    const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(backup[part]).toEqual(value);
  });
}
