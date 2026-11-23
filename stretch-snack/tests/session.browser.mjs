import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../../scripts/landing-art/browser.mjs';

test('an edited session fills the phone viewport, accepts input, and records feedback', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('stretch-snack/', { engine, width: 390, height: 844, touch: true });
  const { page } = app;
  try {
    const setup = page.locator('#toggle-settings');
    await setup.tap();
    await page.locator('#fit summary').tap();
    await page.locator('#heightCm').fill('175');
    await setup.tap();
    assert.equal(await setup.getAttribute('aria-expanded'), 'false', 'Done must accept the first tap after typing');
    await page.locator('.edit-step').first().click();
    await page.locator('#edit-reps').fill('3');
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.locator('#start').click();
    assert.match(await page.locator('#player-cue').textContent(), /3 repetitions/);
    await page.waitForTimeout(1100);
    // WebKit fails this click if the root is promoted above the active modal.
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await page.locator('#step-clock').textContent();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#step-clock').textContent(), paused);
    await page.getByRole('button', { name: 'End session' }).click();
    await page.locator('#feedback-items select').first().selectOption('uncomfortable');
    await page.locator('#delay').selectOption('60');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel check-in' }).click();
    assert.equal(await page.locator('#later').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('saving and adapting a routine on a phone keeps mobility limits and preserves the saved original', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('stretch-snack/', {engine, width: 390, height: 844, touch: true});
  const {page} = app;
  try {
    await page.locator('#toggle-settings').tap();
    await page.getByRole('button', {name: '1 min', exact: true}).tap();
    await page.locator('.edit-step').first().tap();
    await page.locator('#edit-reps').fill('3');
    await page.getByRole('button', {name: 'Apply', exact: true}).tap();
    await page.locator('#open-routines').tap();
    await page.locator('#routine-name').fill('Window seat');
    await page.locator('#save-routine').tap();
    assert.equal(await page.locator('#routine-choice').inputValue(), 'Window seat');
    assert.equal(await page.locator('#use-routine').isEnabled(), true);
    await page.reload({waitUntil: 'networkidle'});
    await page.locator('#toggle-settings').tap();
    await page.getByRole('button', {name: 'Custom', exact: true}).tap();
    await page.locator('#custom-time').fill('30');
    await page.locator('#fit summary').tap();
    await page.getByLabel('Avoid active leg movement').check();
    const current = await page.locator('#steps').innerText();
    await page.locator('#open-routines').tap();
    assert.match(await page.locator('#review-steps').innerText(), /Avoid active leg movement/);
    assert.match(await page.locator('#review-fit').innerText(), /Shorten by 30/);
    assert.equal(await page.locator('#use-routine').isEnabled(), false);
    await page.locator('[data-close="saved-routines"]').tap();
    assert.equal(await page.locator('#steps').innerText(), current);
    await page.locator('#open-routines').tap();
    const rows = page.locator('.review-step');
    await rows.first().locator('input').fill('15');
    await rows.last().locator('select').selectOption('seated-neck-tilt');
    await rows.last().locator('input').fill('15');
    await page.locator('#use-routine').tap();
    assert.equal(await page.locator('#saved-routines').isVisible(), false);
    assert.match(await page.locator('#steps').innerText(), /3 reps/);
    assert.equal(await page.locator('#steps .step').last().getAttribute('data-move'), 'seated-neck-tilt');
    assert.ok(await page.getByLabel('Avoid active leg movement').isChecked());
    await page.locator('#open-routines').tap();
    assert.equal(await rows.last().locator('input').inputValue(), '30');
    assert.match(await rows.last().innerText(), /Avoid active leg movement/);
    assert.equal(await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      return dialog.scrollWidth <= dialog.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    }), true);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('backtracking and live timing preserve transfer time, the paused state and the original routine', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('stretch-snack/', {engine, width: 375, height: 740, touch: true});
  const {page} = app;
  try {
    // Use the public saved-routine flow to exercise a specific floor transfer.
    await page.evaluate(() => {
      localStorage.setItem('vetr:stretch-snack:saved-routines', JSON.stringify([{name: 'Floor break', steps: [
        {id: 'standing-shoulder-roll', seconds: 15}, {id: 'supine-pelvic-tilt', seconds: 20},
      ]}]));
    });
    await page.locator('#toggle-settings').tap();
    await page.locator('#location').selectOption('open-area');
    await page.getByRole('radio', {name: 'Moderate', exact: true}).check();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('radio', {name: 'Any', exact: true}).isChecked(), true);
    await page.locator('#fit summary').tap();
    await page.locator('#allow-floor').check();
    await page.locator('#open-routines').tap();
    await page.locator('#use-routine').tap();
    await page.locator('#start').tap();
    await page.locator('#pause').tap();
    assert.equal(await page.locator('#previous').isDisabled(), true);
    await page.locator('#skip').tap();
    assert.equal(await page.locator('#pause').innerText(), 'Resume');
    assert.match(await page.locator('#player-cue').innerText(), /Change position/);
    assert.equal(await page.locator('#shorten').isDisabled(), true, 'keep the transfer plus five seconds of movement');
    await page.locator('#previous').tap();
    assert.match(await page.locator('#player-cue').innerText(), /Change position/);
    assert.equal(await page.locator('#step-clock').innerText(), '0:30');
    assert.equal(await page.locator('#total-clock').innerText(), '0:50 total left');
    await page.locator('#extend').tap();
    assert.equal(await page.locator('#step-clock').innerText(), '0:40');
    assert.equal(await page.locator('#total-clock').innerText(), '1:00 total left');
    await page.locator('#finish').tap();
    assert.equal(await page.locator('#feedback-items select').count(), 0);
    await page.locator('#feedback [data-close="feedback"]').last().tap();
    await page.locator('#start').tap();
    await page.locator('#pause').tap();
    assert.equal(await page.locator('#step-clock').innerText(), '0:15');
    assert.equal(await page.locator('#total-clock').innerText(), '0:35 total left');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
