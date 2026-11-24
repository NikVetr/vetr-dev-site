import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const engine = /** @type {'chromium' | 'webkit' | 'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');

// Compare the actual painted trainer, independent of button states and the timer.
async function fingerprint(canvas) {
  return canvas.evaluate(element => {
    const context = element.getContext('2d');
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let hash = 0;
    for (const channel of pixels) hash = (Math.imul(hash, 31) + channel) | 0;
    return hash;
  });
}

async function motionDuring(page, canvas, milliseconds) {
  const first = await fingerprint(canvas);
  await page.waitForTimeout(milliseconds);
  return (await fingerprint(canvas)) !== first;
}

test('desktop demonstrations follow the device until a user selects playback in the planner or session', async () => {
  const { page, close, errors } = await openPage('stretch-snack/', {engine, width: 1440, height: 900});
  try {
    const preview = page.locator('#preview-canvas'), player = page.locator('#player-canvas');
    const previewSwitch = page.locator('#animate'), sessionSwitch = page.locator('#player-animate');
    await page.locator('.step-picker').first().click();
    assert.ok(await motionDuring(page, preview, 650), 'normal-motion planner animates');

    await page.emulateMedia({reducedMotion:'reduce'});
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await previewSwitch.getAttribute('aria-label'), 'Play demonstration');
    assert.equal(await motionDuring(page, preview, 650), false, 'reduced-motion planner is still');
    await page.locator('#start').click();
    assert.equal(await sessionSwitch.getAttribute('aria-label'), 'Play demonstration');
    const clock = await page.locator('#step-clock').innerText();
    assert.equal(await motionDuring(page, player, 1250), false, 'reduced-motion session is still');
    assert.notEqual(await page.locator('#step-clock').innerText(), clock);
    await sessionSwitch.click();
    assert.ok(await motionDuring(page, player, 750), 'manual Play animates the reduced-motion session');
    await page.locator('#pause').click();
    assert.ok(await sessionSwitch.isDisabled());
    assert.equal(await motionDuring(page, player, 650), false, 'pausing the timer freezes the trainer');
    await page.locator('#pause').click();
    assert.ok(await motionDuring(page, player, 750), 'resuming the timer restores motion');

    await page.reload({waitUntil:'networkidle'});
    assert.equal(await previewSwitch.getAttribute('aria-label'), 'Pause demonstration');
    assert.ok(await motionDuring(page, preview, 650), 'explicit Play survives reload');
    await previewSwitch.click();
    await page.emulateMedia({reducedMotion:'no-preference'});
    assert.equal(await motionDuring(page, preview, 650), false, 'explicit Still survives a device change');
    const settings = page.locator('#camera-settings');
    await page.locator('nav [data-camera-settings]').click();
    assert.ok(await settings.getByLabel('Still', {exact:true}).isChecked());
    await settings.getByLabel('Automatic', {exact:true}).check();
    await settings.getByRole('button', {name:'Done'}).click();
    assert.ok(await motionDuring(page, preview, 650), 'restoring Device setting follows normal motion');
    await page.locator('#start').click();
    assert.ok(await motionDuring(page, player, 650), 'normal-motion session animates');
    await sessionSwitch.click();
    const held = await fingerprint(player);
    await page.waitForTimeout(1100);
    assert.equal(await fingerprint(player), held, 'session demonstration pause holds its pose and camera');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});
