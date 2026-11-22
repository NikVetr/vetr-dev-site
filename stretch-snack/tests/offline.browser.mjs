// Exercise a fresh navigation in airplane mode after the first complete install.
import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../../scripts/landing-art/browser.mjs';
import { cues } from '../audio/cues.js';

test('offline navigation, planner, guided session and narration', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const { page, close, errors, stopServing } = await openPage('stretch-snack/', { engine, width: 390, height: 844, touch: true });
  // Take the actual HTTP origin offline. WebKit's network emulation can reject
  // navigation before the service worker gets a chance to serve the cached page.
  try {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 15000 });
    await page.locator('#open-routines').click();
    await page.locator('#routine-name').fill('Airplane mode');
    await page.locator('#save-routine').click();
    stopServing();
    await page.goto(new URL('./?trip=offline', page.url()).href, { waitUntil: 'networkidle' });
    await page.locator('#open-routines').click();
    assert.equal(await page.locator('#routine-choice').inputValue(), 'Airplane mode');
    await page.locator('#use-routine').click();
    await page.getByRole('button', { name: /start/i }).first().click();
    await page.locator('#player[open]').waitFor();
    await page.locator('#pause').click();
    const first = await page.locator('#player-name').innerText();
    await page.locator('#extend').tap();
    await page.locator('#skip').tap();
    await page.locator('#previous').tap();
    assert.equal(await page.locator('#player-name').innerText(), first);
    assert.equal(await page.locator('#step-clock').innerText(), '0:34');
    await page.locator('#shorten').tap();
    assert.equal(await page.locator('#step-clock').innerText(), '0:24');
    const samples = await page.evaluate(
      async (keys) => {
        const audio = new AudioContext();
        try {
          const lengths = [];
          for (const key of keys) {
            const res = await fetch('./audio/clips/' + key + '.mp3');
            if (!res.ok) throw new Error('Missing offline audio: ' + key);
            const buf = await audio.decodeAudioData(await res.arrayBuffer());
            lengths.push(buf.duration);
          }
          return lengths;
        } finally {
          await audio.close();
        }
      },
      [...cues.keys()],
    );
    assert.ok(samples.every((seconds) => seconds > 0.2));
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});
