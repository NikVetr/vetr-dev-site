// The speech adapter against a real engine, which is the one thing the fake in
// `tests/speech.test.mjs` cannot be.
//
// There is exactly one question worth a browser here: what the adapter says about a
// machine that has no voices, and whether a board on that machine is any worse off.
// A CI container usually is such a machine -- Chrome on Linux enumerates nothing
// without speech-dispatcher installed -- so the interesting path is the common one.
// This is A01 from the acceptance matrix.
//
// Nothing here plays audio. If the machine running it does have voices the test
// checks that they are described coherently and stops there; asking a build agent to
// produce sound proves nothing about a phone, and section 9.2's speaker, headphone,
// Bluetooth, silent-mode and interruption checks are physical-device work that this
// file does not attempt and must not be read as covering.

import { test, expect } from '@playwright/test';

test('no voices is a reported state, not a broken board', async ({ page }) => {
  await page.goto('/conversation.html?target=zh-Hans&source=en&board=spa');
  await expect(page.locator('.board-cell').first()).toBeVisible();

  const report = await page.evaluate(async () => {
    const { speech, resolveSpokenLocale } = await import('/ui/platform/speech.js');
    const capabilities = speech.getCapabilities('zh-Hans');
    // Only when the engine has nothing: a speak that cannot happen must still settle,
    // promptly and with a reason. Awaiting it is the assertion -- a hang fails here.
    const attempt = capabilities.voices.length ? null
      : await speech.speak({ text: '请停下来', locale: 'zh-Hans' })
        .then((outcome) => ({ outcome }), (/** @type {any} */ error) => ({ reason: error.reason }));
    return {
      capabilities,
      attempt,
      klingon: resolveSpokenLocale('tlh'),
      klingonReason: speech.getCapabilities('tlh').reason,
      // Importing the module, enumerating voices and asking about capabilities are
      // all things that happen without a tap, so none of them may have made a sound.
      speaking: speechSynthesis.speaking || speechSynthesis.pending,
    };
  });

  // The browser has the API, whatever it has installed behind it.
  expect(report.capabilities.provider).toBe('web-speech');
  expect(report.capabilities.locale).toBe('zh-CN');
  expect(report.speaking).toBe(false);
  // The two constructed languages, resolved by the real thing as by the fake.
  expect(report.klingon).toBeNull();
  expect(report.klingonReason).toBe('unmapped');

  if (report.capabilities.voices.length === 0) {
    // The usual CI machine. "Unavailable" is said honestly, and saying it costs the
    // board nothing: the grid rendered above and a message opens below.
    expect(['no-voice', 'loading']).toContain(report.capabilities.reason);
    expect(report.capabilities.offline).toBe('unknown');
    expect(report.attempt).toEqual({ reason: report.capabilities.reason });
  } else {
    // A developer machine with voices. Describe them; do not play them.
    for (const voice of report.capabilities.voices) {
      expect(voice.id).toBeTruthy();
      expect(['local', 'remote', 'unknown']).toContain(voice.offline);
      expect(voice.lang.toLowerCase()).toMatch(/^(zh-cn|zh-sg|cmn|zh-hans|zh-tw)\b/);
    }
  }

  // The whole point of the audio being optional: with none of it available, the
  // board still does the thing it is for.
  await page.locator('.board-cell:not(.board-cell-more):not(.board-cell-off)').first().click();
  await expect(page.locator('.board-message-text')).toBeVisible();
});
