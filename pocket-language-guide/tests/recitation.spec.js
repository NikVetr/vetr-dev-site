import { test, expect } from '@playwright/test';

const URL = '/drill.html?target=zh-Hans&source=en';
const CONFIG = 'plg.recitation.zh-Hans__en';

/** No microphone or speaker is used. @param {import('@playwright/test').Page} page */
async function fakeSpeech(page) {
  await page.addInitScript(() => {
    const g = /** @type {any} */ (globalThis);
    g.__spoken = [];
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(speechSynthesis, 'getVoices', { configurable: true, value: () => [
      { name: 'English', lang: 'en-US', localService: true, default: true, voiceURI: 'en' },
      { name: 'Chinese', lang: 'zh-CN', localService: true, default: false, voiceURI: 'zh' },
    ] });
    class Utterance { constructor(/** @type {string} */ text) { this.text = text; } }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(speechSynthesis, 'speak', { configurable: true, value: (/** @type {any} */ utterance) => {
      g.__spoken.push({ text: utterance.text, lang: utterance.lang });
      setTimeout(() => utterance.onend?.(), 5);
    } });
    Object.defineProperty(speechSynthesis, 'cancel', { configurable: true, value: () => {} });
    if (!sessionStorage.getItem('recitation-fixture')) {
      localStorage.setItem('plg.drill-record', JSON.stringify({ pairs: {} }));
      sessionStorage.setItem('recitation-fixture', '1');
    }
  });
}

/** Select one real corpus phrase through the phrase picker.
 * @param {import('@playwright/test').Page} page */
async function setup(page) {
  await page.goto(URL);
  const auto = page.getByRole('radio', { name: 'Full-auto', exact: true });
  await expect(auto).toBeEnabled();
  await expect(page.locator('input[name="drill-voice"][value="on"]')).toBeDisabled();
  await auto.click();
  const form = page.locator('.recitation-setup');
  await expect(form.locator('.recitation-phase')).toHaveCount(2);
  await form.locator('.drill-pick').evaluate((node) => { node.open = true; });
  await form.getByRole('button', { name: 'All off', exact: true }).click();
  const section = form.locator('.drill-pick .tree > li').first();
  await section.locator('summary input').check();
  await section.locator('details').evaluate((node) => { node.open = true; });
  const inputs = section.locator('.items input');
  for (let i = 1; i < await inputs.count(); i++) await inputs.nth(i).uncheck();
  const row = section.locator('.items li').first();
  const source = await row.locator('.gloss').innerText();
  const target = await row.locator('.script').innerText();
  await form.getByRole('checkbox', { name: 'Repeat the phrase list' }).uncheck();
  await expect(form.locator('.recitation-note')).toContainText('1 phrases ready');
  return { form, source, target };
}

test('Full-auto sequences real phrase fields, pauses/resumes/stops, and persists without grading', async ({ page }) => {
  await fakeSpeech(page);
  const { form, source, target } = await setup(page);
  await form.locator('.recitation-phase').nth(0).getByRole('spinbutton', { name: 'Pause after this phase (seconds)' }).fill('0.8');
  await form.locator('.recitation-phase').nth(1).getByRole('spinbutton', { name: 'Pause after this phase (seconds)' }).fill('2');
  const before = await page.evaluate(() => localStorage.getItem('plg.drill-record'));
  await form.getByRole('button', { name: 'Start full-auto', exact: true }).click();
  const stage = page.locator('dialog.recitation-stage');
  await expect(stage).toBeVisible();
  await expect(stage.locator('.recitation-text')).toHaveText(source);
  const bounds = await stage.boundingBox();
  expect(bounds.width).toBeGreaterThan(0.9 * page.viewportSize().width);
  expect(bounds.height).toBeGreaterThan(0.9 * page.viewportSize().height);
  await stage.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(stage.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await page.waitForTimeout(900);
  await expect(stage.locator('.recitation-text')).toHaveText(source);
  await stage.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(stage.locator('.recitation-text')).toHaveText(target);
  const spoken = await page.evaluate(() => /** @type {any} */ (globalThis).__spoken);
  expect(spoken.some((utterance) => utterance.lang.startsWith('en') && utterance.text.length)).toBe(true);
  expect(spoken.some((utterance) => utterance.lang.startsWith('zh') && utterance.text.length)).toBe(true);
  await stage.getByRole('button', { name: 'Stop and edit' }).click();
  await expect(stage).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('plg.drill-record'))).toBe(before);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), CONFIG);
  expect(saved.phases.map((phase) => phase.delayMs)).toEqual([800, 2000]);
  expect(saved.repeat).toBe(false);
  await page.reload();
  await page.getByRole('radio', { name: 'Full-auto', exact: true }).click();
  await expect(page.locator('.recitation-phase').nth(0).getByRole('spinbutton', { name: 'Pause after this phase (seconds)' })).toHaveValue('0.8');
  await expect(page.getByRole('checkbox', { name: 'Repeat the phrase list' })).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('plg.drill-record'))).toBe(before);
});

test('screen-only Full-auto finishes without speech or microphone access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeSpeech(page);
  const { form, target } = await setup(page);
  const phase = form.locator('.recitation-phase').nth(1);
  for (const value of ['source:script', 'target:roman']) {
    await phase.locator(`input[data-channel="screen"][value="${value}"]`).check();
  }
  const audio = form.locator('input[data-channel="audio"]:checked');
  while (await audio.count()) await audio.first().uncheck();
  for (const phase of await form.locator('.recitation-phase').all()) {
    await phase.getByRole('spinbutton', { name: 'Pause after this phase (seconds)' }).fill('0.2');
  }
  await form.getByRole('button', { name: 'Start full-auto', exact: true }).click();
  const stage = page.locator('dialog.recitation-stage');
  await expect(stage.locator('.recitation-status')).toHaveText('Finished');
  await expect(stage.locator('.recitation-text').first()).toHaveText(target);
  await expect(stage.locator('.recitation-text')).toHaveCount(3);
  const fits = await stage.locator('.recitation-line').evaluateAll((lines) => lines.every((box) => {
    const text = box.querySelector('.recitation-text');
    const bounds = box.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(text);
    return text.scrollWidth <= box.clientWidth + 1 && text.scrollHeight <= box.clientHeight + 1
      && [...range.getClientRects()].every((rect) => rect.left >= bounds.left - 1
        && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1);
  }));
  expect(fits).toBe(true);
  expect(await page.evaluate(() => /** @type {any} */ (globalThis).__spoken)).toEqual([]);
  await stage.getByRole('button', { name: 'Stop and edit' }).click();
  await expect(form).toBeVisible();
});

test('native Full-auto sends the timeline to the background plugin and disposes it on stop', async ({ page }) => {
  await fakeSpeech(page);
  const { form } = await setup(page);
  await page.evaluate(() => {
    const g = /** @type {any} */ (globalThis);
    g.__nativeCalls = [];
    let state = { status: 'stopped', index: -1 };
    g.Capacitor = { isNativePlatform: () => true, Plugins: { BackgroundRecitation: {
      addListener: async () => ({ remove: async () => { g.__nativeCalls.push('removeListener'); } }),
      getState: async () => state,
      start: async (plan) => { g.__nativePlan = plan; g.__nativeCalls.push('start'); return state = { status: 'playing', index: 0 }; },
      pause: async () => { g.__nativeCalls.push('pause'); return state = { ...state, status: 'paused' }; },
      resume: async () => { g.__nativeCalls.push('resume'); return state = { ...state, status: 'playing' }; },
      stop: async () => { g.__nativeCalls.push('stop'); return state = { status: 'stopped', index: -1 }; },
    } } };
  });
  await form.getByRole('button', { name: 'Start full-auto', exact: true }).click();
  const stage = page.locator('dialog.recitation-stage');
  await expect(stage).toBeVisible();
  await stage.getByRole('button', { name: 'Pause', exact: true }).click();
  await stage.getByRole('button', { name: 'Resume', exact: true }).click();
  await stage.getByRole('button', { name: 'Stop and edit' }).click();
  await expect(stage).toHaveCount(0);
  const result = await page.evaluate(() => {
    const g = /** @type {any} */ (globalThis);
    return { calls: g.__nativeCalls, plan: g.__nativePlan, spoken: g.__spoken };
  });
  expect(result.calls).toEqual(['start', 'pause', 'resume', 'stop', 'removeListener']);
  expect(result.plan.steps).toHaveLength(2);
  expect(result.plan.steps[0].audio[0].locale).toMatch(/^en/);
  expect(result.plan.steps[1].audio[0].locale).toMatch(/^zh/);
  expect(result.spoken).toEqual([]);
});
