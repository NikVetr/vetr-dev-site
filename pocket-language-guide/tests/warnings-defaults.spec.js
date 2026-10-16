import { test, expect } from '@playwright/test';

async function warningFixture(page) {
  await page.route('**/warning-fixture', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<button id="target" style="position:absolute;right:20px;top:20px">Settings</button><details id="record"><span id="count"></span><ul id="list"></ul></details>',
  }));
  await page.goto('/warning-fixture');
  await page.evaluate(async () => {
    const { createWarnings } = await import('/ui/warnings.js');
    window.reportWarnings = createWarnings({
      menu: document.querySelector('#record'), list: document.querySelector('#list'),
      count: document.querySelector('#count'), buttons: [document.querySelector('#target')], onFix() {},
    });
  });
}

test('warnings join the settings only after their distorted flight finishes', async ({ page }) => {
  await warningFixture(page);
  await page.evaluate(() => window.reportWarnings([{ code: 'test', severity: 'info', message: 'First notice' }]));
  const dialog = page.locator('dialog.warning-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#list li')).toHaveCount(0);
  await expect(page.locator('#target')).not.toHaveAttribute('data-warnings');
  await page.evaluate(() => {
    document.querySelector('dialog .speaker-close').click();
    document.querySelector('dialog').getAnimations()[0].pause();
  });
  await expect(dialog).toHaveAttribute('data-leaving', '1');
  const frames = await dialog.evaluate((el) => el.getAnimations()[0].effect.getKeyframes());
  expect(frames.some((frame) => String(frame.transform).includes('skewX'))).toBe(true);
  expect(new Set(frames.map((frame) => frame.clipPath)).size).toBeGreaterThan(2);
  await expect(page.locator('#list li')).toHaveCount(0);
  await expect(page.locator('#target')).not.toHaveAttribute('data-warnings');
  await dialog.evaluate((el) => el.getAnimations()[0].finish());
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#target')).toHaveAttribute('data-warnings', '1');
  await expect(page.locator('#list li')).toHaveText('First notice');

  await page.evaluate(() => window.reportWarnings([
    { code: 'test', severity: 'info', message: 'First notice' },
    { code: 'test', severity: 'info', message: 'Second notice' },
  ]));
  await expect(dialog).toBeVisible();
  await expect(page.locator('#target')).toHaveAttribute('data-warnings', '1');
  await page.evaluate(() => {
    document.querySelector('dialog .speaker-close').click();
    document.querySelector('dialog').getAnimations()[0].pause();
  });
  await expect(page.locator('#target')).toHaveAttribute('data-warnings', '1');
  await dialog.evaluate((el) => el.getAnimations()[0].finish());
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#target')).toHaveAttribute('data-warnings', '2');

  // A solve can resolve a warning before its animation ends. It must stay gone.
  await page.evaluate(() => {
    window.reportWarnings([
      { code: 'test', severity: 'info', message: 'First notice' },
      { code: 'test', severity: 'info', message: 'Resolved notice' },
    ]);
    document.querySelector('dialog .speaker-close').click();
    document.querySelector('dialog').getAnimations()[0].pause();
    window.reportWarnings([{ code: 'test', severity: 'info', message: 'First notice' }]);
  });
  await expect(page.locator('#target')).toHaveAttribute('data-warnings', '1');
  await dialog.evaluate((el) => el.getAnimations()[0].finish());
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#list li')).toHaveText('First notice');
});

test('reduced motion absorbs a dismissed warning without a flight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await warningFixture(page);
  await page.evaluate(() => window.reportWarnings([{ code: 'test', severity: 'error', message: 'A decision' }]));
  await expect(page.locator('#list li')).toHaveCount(0);
  await page.locator('dialog .speaker-close').click();
  await expect(page.locator('dialog.warning-dialog')).toHaveCount(0);
  await expect(page.locator('#target')).toHaveAttribute('data-warnings', '1');
  await expect(page.locator('#list li')).toHaveText('A decision');
});

test.describe('first card format on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const aspect = (page) => page.locator('.face.focused').evaluate((el) =>
    Number(getComputedStyle(el).getPropertyValue('--face-aspect')));

  test('defaults to a phone and preserves a saved paper choice on reopening', async ({ page }) => {
    await page.goto('/customize.html?target=zh-Hans&source=en');
    await expect.poll(() => aspect(page)).toBeCloseTo(184 / 399, 3);
    await page.getByRole('radio', { name: 'Credit card', exact: true }).click();
    await expect.poll(() => aspect(page)).toBeCloseTo(242.65 / 153, 2);
    const chosen = await aspect(page);
    await page.reload();
    await expect.poll(() => aspect(page)).toBeCloseTo(chosen, 3);
  });

  test('keeps a URL format and defaults even when older saved settings lack dimensions', async ({ page }) => {
    await page.goto('/customize.html?target=zh-Hans&source=en&geometry=card-7x5-4col');
    await expect.poll(() => aspect(page)).toBeCloseTo(1.4, 3);
    await page.evaluate(() => localStorage.setItem('plg.studio.zh-Hans__en', JSON.stringify({
      spec: { themeId: 'latex-reference' }, finish: { mode: '', flip: 'short-edge' }, dpi: 600,
    })));
    await page.goto('/customize.html?target=zh-Hans&source=en');
    await expect.poll(() => aspect(page)).toBeCloseTo(184 / 399, 3);
  });
});
