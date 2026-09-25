// The Morse signaller in a browser.
//
// `tests/morse.test.mjs` pins the table and the timing; this file pins the page:
// that typing shows code as you type, that what Morse cannot say is named rather
// than dropped silently, that Signal hands the beacon a Morse unit list and Stop
// takes it back, and that the gallery offers the page for the one language whose
// conversation is light.

import { test, expect } from '@playwright/test';

const SIGNAL = '/signal.html?target=morse&source=en';

test('what you type is shown as code, and what Morse cannot say is named', async ({ page }) => {
  await page.goto(SIGNAL);
  const text = page.locator('#signal-text');
  await expect(text).toBeVisible();
  await expect(page.locator('#signal-start')).toBeDisabled();

  await text.fill('help me');
  await expect(page.locator('#signal-code')).toHaveText('.... . .-.. .--. / -- .');
  await expect(page.locator('#signal-start')).toBeEnabled();
  await expect(page.locator('#signal-unsayable')).toHaveText('');

  // A character with no code is reported, not guessed, and the rest still encodes.
  await text.fill('救命 SOS');
  await expect(page.locator('#signal-code')).toHaveText('... --- ...');
  await expect(page.locator('#signal-unsayable')).toContainText('救 命');

  // The other direction: code read off someone else's light, back to letters.
  await page.locator('#signal-received').fill('.-- .... . .-. . / .. ...');
  await expect(page.locator('#signal-decoded')).toHaveText('WHERE IS');
});

test('Signal flashes the message as Morse, and Stop takes the screen back', async ({ page }) => {
  await page.goto(SIGNAL);
  await page.locator('#signal-text').fill('SOS');
  const start = page.locator('#signal-start');
  await start.click();

  // The beacon owns the screen: the same SOS surface the board's SOS uses, with the
  // code at its foot for the sender and nothing in the middle where the light is.
  const beacon = page.locator('.beacon-sos');
  await expect(beacon).toBeVisible();
  await expect(beacon.locator('.beacon-hint')).toContainText('... --- ...');
  await expect(start).toHaveText(/stop/i);
  // It flashes: lit and unlit both occur within one SOS at 8 wpm (150ms a unit).
  await expect(beacon).toHaveClass(/beacon-lit/, { timeout: 3000 });
  await expect(beacon).not.toHaveClass(/beacon-lit/, { timeout: 3000 });

  // Dismissing hands back, and the button says Signal again.
  await beacon.click();
  await expect(beacon).toHaveCount(0);
  await expect(start).toHaveText(/signal/i);
});

test('the gallery offers Signal for Morse, and no board', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.card', { hasText: 'Morse' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole('link', { name: 'Signal' })).toHaveAttribute('href', /signal\.html\?target=morse/);
  await expect(card.getByRole('link', { name: 'Converse' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Customise' })).toBeVisible();
});

test('Morse is a language to learn, not a language to speak', async ({ page }) => {
  // Its card is on the gallery, but it is never offered as the reader's own language:
  // nobody speaks Morse, and a board or a sheet glossed *into* dots would be nonsense.
  await page.goto('/');
  await expect(page.locator('.card', { hasText: 'Morse' })).toBeVisible({ timeout: 30_000 });
  const offered = await page.locator('.reader-picker, .speak').allTextContents();
  expect(offered.join(' ')).not.toMatch(/Morse/);
});

test('no speed setting can flash faster than the ceiling, and SOS keeps its own slow dot', async ({ page }) => {
  // The ceiling is the beacon's, not the page's: a speed the select never offered is
  // forced in here and still comes out at the floor. `data-unit` is the unit the
  // beacon is actually running, in ms.
  await page.goto(SIGNAL);
  await page.locator('#signal-text').fill('EEEE');
  await page.evaluate(() => {
    const speed = /** @type {HTMLSelectElement} */ (document.getElementById('signal-speed'));
    speed.add(new Option('20 wpm', '20'));
    speed.value = '20';
  });
  await page.locator('#signal-start').click();
  const beacon = page.locator('.beacon');
  await expect(beacon).toBeVisible();
  expect(Number(await beacon.getAttribute('data-unit'))).toBeGreaterThanOrEqual(170);
  await beacon.click();
  await expect(beacon).toHaveCount(0);

  // SOS from this page is the fixed 300ms dot, whatever the speed says.
  await page.locator('#signal-sos').click();
  await expect(beacon).toBeVisible();
  await expect(beacon).toHaveAttribute('data-unit', '300');
  await beacon.click();
});

test('a beacon stops when the page is hidden, and a lamp that answers late is released', async ({ page }) => {
  // A camera that takes its time: the fake stream resolves after the beacon has
  // already been dismissed, and the track it hands over must be stopped at once
  // rather than left lit until the page dies.
  await page.addInitScript(() => {
    /** @type {any} */ (window).__torchStops = 0;
    const track = {
      getCapabilities: () => ({ torch: true }),
      applyConstraints: () => Promise.resolve(),
      stop: () => { /** @type {any} */ (window).__torchStops += 1; },
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => new Promise((resolve) => setTimeout(() => resolve({ getVideoTracks: () => [track] }), 400)) },
    });
  });
  await page.goto(SIGNAL);
  await page.locator('#signal-text').fill('SOS');
  await page.locator('#signal-start').click();
  const beacon = page.locator('.beacon');
  await expect(beacon).toBeVisible();
  await beacon.click();
  await expect(beacon).toHaveCount(0);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => /** @type {any} */ (window).__torchStops)).toBe(1);

  // Backgrounding is a stop too: the timer, the frame and the lamp all go with it.
  await page.locator('#signal-start').click();
  await expect(beacon).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(beacon).toHaveCount(0);
  await expect(page.locator('#signal-start')).toHaveText(/signal/i);
});
