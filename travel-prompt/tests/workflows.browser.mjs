import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../scripts/landing-art/browser.mjs';

/** @typedef {Window & {shareResult?:{names:string[],text:string}, sharedPrompts?:string[], resolveGeo?:(result:{coords:{latitude:number,longitude:number}})=>void}} TestWindow */
const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE || 'chromium');
const open = () => openPage('travel-prompt/', { width: 390, height: 844, engine, touch: true });
const tile = (id) => '[data-mode="' + id + '"]';
test('lodging guest counts, child ages and budget period stay in the current lodging draft', async () => {
  const app = await open();
  const { page } = app;
  try {
    await page.locator(tile('lodging')).click();
    await page.getByText('Guests and rooms', { exact: true }).click();
    await page.getByLabel('Adults', { exact: true }).fill('2');
    await page.getByLabel('Children', { exact: true }).fill('1');
    await page.getByLabel('Rooms', { exact: true }).fill('1');
    await page.getByLabel('Child ages at check-in (optional)').fill('3, 6');
    assert.match(await page.locator('#guests-status').innerText(), /more ages than children/);
    assert.ok(await page.locator('#copy').isDisabled());
    await page.locator('#childAges').fill('4');
    await page.getByLabel('Budget for all rooms').fill('EUR 800');
    await page.getByLabel('Budget period').selectOption('stay');
    const prompt = page.locator('#prompt');
    assert.match(await prompt.inputValue(), /1 room, 2 adults, 1 child/);
    assert.match(await prompt.inputValue(), /Child ages supplied \(years at check-in\): 4/);
    assert.match(await prompt.inputValue(), /Budget for the whole stay: EUR 800/);
    assert.ok(await page.locator('#copy').isEnabled());
    await page.locator('#open-profiles').click();
    await page.locator('#profile-name').fill('Us');
    await page.locator('#save-profile').click();
    await page.getByRole('button', { name: 'Close saved profiles' }).click();
    assert.doesNotMatch(await page.evaluate(() => localStorage.getItem('vetr:travel-prompt:profiles:1')), /childAges|adults|children|EUR 800/);
    await page.locator(tile('restaurant')).click();
    assert.doesNotMatch(await prompt.inputValue(), /Booking:|EUR 800|Child ages supplied/);
    await page.locator(tile('lodging')).click();
    assert.match(await prompt.inputValue(), /Budget for the whole stay: EUR 800/);
    assert.equal(await page.locator('#childAges').inputValue(), '4');
    for (const width of [320, 390, 800, 1440]) {
      await page.setViewportSize({ width, height: 840 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'width ' + width);
    }
    await page.reload();
    await page.locator(tile('lodging')).click();
    assert.doesNotMatch(await prompt.inputValue(), /Booking:|Child ages supplied|EUR 800/);
    assert.equal(await page.locator('#budgetBasis').inputValue(), 'night');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('outing uses an existing group profile, saves new interests and keeps trip details local to its draft', async () => {
  const app = await open();
  const { page } = app;
  try {
    await page.evaluate(() => localStorage.setItem('vetr:travel-prompt:profiles:1', JSON.stringify({
      active: 'Train trip', entries: [{ name: 'Train trip', profile: {
        party: 'group', ordering: 'shared', people: [
          { name: 'Tess', access: 'Step-free routes', preferences: { quiet: 1 } },
          { name: 'Lee', diet: 'Vegan', preferences: { spice: 2 } }
        ]
      } }]
    })));
    await page.reload();
    await page.locator(tile('outing')).click();
    const prompt = page.locator('#prompt');
    assert.match(await prompt.inputValue(), /Tess: Accessibility requirements: Step-free routes/);
    assert.equal(await page.locator('#ordering-field').isVisible(), false);
    await page.getByLabel('Where?').fill('Rotterdam');
    await page.getByLabel('Visit date').fill('2027-02-12');
    await page.getByLabel('Time window').fill('10 am to noon');
    await page.getByLabel('Time available, including travel').fill('90 minutes');
    await page.getByText('Outing interests', { exact: true }).last().click();
    await page.getByRole('button', { name: 'Prefer · Museums and galleries', exact: true }).last().click();
    assert.match(await prompt.inputValue(), /Lee: Prefer: museums and galleries/);
    await page.locator('#open-profiles').click();
    await page.getByRole('button', { name: 'Update profile Train trip' }).click();
    await page.getByRole('button', { name: 'Close saved profiles' }).click();
    await page.locator(tile('restaurant')).click();
    assert.match(await prompt.inputValue(), /Vegan/);
    assert.doesNotMatch(await prompt.inputValue(), /Rotterdam|noon|90 minutes|museums/);
    await page.locator(tile('outing')).click();
    assert.match(await prompt.inputValue(), /Rotterdam/);
    assert.match(await prompt.inputValue(), /Timing: 10 am to noon/);
    assert.match(await prompt.inputValue(), /2027-02-12/);
    await page.reload();
    await page.locator(tile('outing')).click();
    assert.match(await prompt.inputValue(), /Lee: Prefer: museums and galleries/);
    assert.doesNotMatch(await prompt.inputValue(), /Rotterdam|2027-02-12|noon|90 minutes|Vegan/);
    for (const width of [320, 361, 390, 481, 601, 780, 1440]) {
      await page.setViewportSize({ width, height: 840 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'width ' + width);
      assert.ok(await page.locator('[data-mode]').evaluateAll(buttons =>
        buttons.every(b => b.scrollWidth <= b.clientWidth + 1)), 'mode labels at ' + width);
    }
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('phone group profile survives reload while trip data and location do not', async () => {
  const app = await open();
  const { page } = app;
  try {
    const prompt = page.locator('#prompt');
    await page.locator('#place').fill('Union Square station');
    await page.getByRole('button', { name: 'Group', exact: true }).click();
    await page.getByRole('button', { name: 'Share dishes' }).click();
    await page.getByLabel('Dietary requirements', { exact: true }).first().fill('vegan');
    await page.getByLabel('Allergies & cross-contact').last().fill('sesame');
    await page.getByLabel('Venue preference').first().selectOption('prefer');
    await page.getByText('Food and drink preferences', { exact: true }).first().click();
    await page
      .getByRole('button', { name: 'Prefer · Regional specialties', exact: true })
      .first()
      .click();
    assert.match(await prompt.inputValue(), /Group of 2.*sharing dishes/);
    assert.match(await prompt.inputValue(), /Prefer: regional specialties/);
    await page.locator('#open-profiles').click();
    await page.locator('#profile-name').fill('Dinner party');
    await page.locator('#save-profile').click();
    await page.getByRole('button', { name: 'Close saved profiles' }).click();
    await page.reload();
    assert.match(await prompt.inputValue(), /sesame/);
    assert.match(await prompt.inputValue(), /vegan/);
    assert.equal(await page.locator('#place').inputValue(), '');
    await page.getByRole('button', { name: 'Just me' }).click();
    assert.doesNotMatch(await prompt.inputValue(), /sesame/);
    await page.locator(tile('lodging')).click();
    await page.locator('#checkIn').fill('2027-03-02');
    await page.locator('#checkOut').fill('2027-03-01');
    assert.equal(await page.locator('#copy').isDisabled(), true);
    await page.locator('#checkOut').fill('2027-03-08');
    await page.locator('#budget').fill('€150');
    assert.match(await prompt.inputValue(), /Budget per night: €150/);
    assert.doesNotMatch(await prompt.inputValue(), /vegan/);
    await page.locator('#place').fill('Osaka');
    await page.locator(tile('restaurant')).click();
    assert.equal(await page.locator('#place').inputValue(), '');
    await page.locator(tile('lodging')).click();
    assert.equal(await page.locator('#place').inputValue(), 'Osaka');
    await page.getByRole('link', { name: 'Preview prompt' }).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true
    );
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
test('menu photos survive mode changes and are shared in displayed order only on request', async () => {
  const app = await open();
  const { page } = app;
  try {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data) => {
          /** @type {TestWindow} */ (window).shareResult = { names: data.files.map((f) => f.name), text: data.text };
        }
      });
    });
    await page.locator(tile('menu')).click();
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aaj8AAAAASUVORK5CYII=',
      'base64'
    );
    await page
      .locator('#photos')
      .setInputFiles(
        ['first', 'second', 'third'].map((s) => ({
          name: s + '.png',
          mimeType: 'image/png',
          buffer
        }))
      );
    await page.getByRole('button', { name: 'Move page 3 up' }).click();
    await page.locator(tile('restaurant')).click();
    await page.locator(tile('menu')).click();
    assert.match(await page.locator('#prompt').inputValue(), /3 menu photos/);
    assert.equal(await page.evaluate(() => /** @type {TestWindow} */ (window).shareResult), undefined);
    await page.locator('#share').click();
    assert.deepEqual(await page.evaluate(() => /** @type {TestWindow} */ (window).shareResult.names), [
      'first.png',
      'third.png',
      'second.png'
    ]);
    await page.getByRole('button', { name: 'Remove page 2' }).click();
    assert.match(await page.locator('#prompt').inputValue(), /2 menu photos/);
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false })
    );
    await page.locator('#notes').fill('No spicy dishes');
    assert.equal(await page.locator('#share').isHidden(), true);
    assert.equal(await page.locator('#photo-list a[download]').count(), 2);
    assert.equal(await page.locator('#copy').isEnabled(), true);
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true
    );
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('GPS is opt-in, removable and a late permission response targets the original request', async () => {
  const app = await open();
  const { page } = app;
  try {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success) {
            /** @type {TestWindow} */ (window).resolveGeo = success;
          }
        }
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('Permission denied');
          }
        }
      });
    });
    assert.equal(await page.evaluate(() => Boolean(/** @type {TestWindow} */ (window).resolveGeo)), false);
    await page.locator('#locate').click();
    await page.locator(tile('lodging')).click();
    await page.evaluate(() => /** @type {TestWindow} */ (window).resolveGeo({ coords: { latitude: 35, longitude: 135 } }));
    assert.doesNotMatch(await page.locator('#prompt').inputValue(), /135\.00000/);
    await page.locator(tile('restaurant')).click();
    assert.match(await page.locator('#prompt').inputValue(), /35\.00000, 135\.00000/);
    await page.locator('#remove-location').click();
    assert.doesNotMatch(await page.locator('#prompt').inputValue(), /135\.00000/);
    await page.locator('#copy').click();
    assert.match(await page.locator('#output-status').innerText(), /Copy command/);
    assert.equal(
      await page
        .locator('#prompt')
        .evaluate((e) => e.selectionStart === 0 && e.selectionEnd === e.value.length),
      true
    );
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('one tap after editing a destination shares the current prompt', async () => {
  const app = await open();
  const { page } = app;
  try {
    await page.evaluate(() => {
      /** @type {TestWindow} */ (window).sharedPrompts = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async ({ text }) => { /** @type {TestWindow} */ (window).sharedPrompts.push(text); }
      });
    });
    await page.locator(tile('lodging')).tap();
    await page.locator('#place').fill('Paris');
    await page.locator('#share').tap();
    await page.waitForFunction(() => /** @type {TestWindow} */ (window).sharedPrompts.length > 0, undefined, { timeout: 2500 });
    assert.deepEqual(await page.evaluate(() => /** @type {TestWindow} */ (window).sharedPrompts), [
      await page.locator('#prompt').inputValue()
    ]);
    assert.match(await page.locator('#prompt').inputValue(), /Search area or landmark: Paris/);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('a workflow chosen before startup opens directly and Back restores the trip draft', async () => {
  const app = await open();
  const {page} = app;
  try {
    await page.route('**/travel-prompt/app.mjs', route => route.abort());
    await page.reload();
    assert.equal(await page.locator('.workspace').getAttribute('inert'), '');
    const lodging = page.getByRole('link', {name: 'Find lodging'});
    assert.equal(await lodging.getAttribute('href'), '?mode=lodging');
    await page.unroute('**/travel-prompt/app.mjs');
    await lodging.click();
    await page.waitForSelector('.workspace:not([inert])');
    assert.equal(await page.locator('#trip-title').innerText(), 'Find somewhere to stay');
    assert.equal(await lodging.getAttribute('aria-current'), 'page');
    await page.locator('#place').fill('Kyoto');
    await page.getByRole('link', {name: 'Plan an outing'}).click();
    assert.equal(new URL(page.url()).search, '?mode=outing');
    assert.equal(await page.locator('#place').inputValue(), '');
    await page.goBack();
    await page.waitForSelector('a[data-mode="lodging"][aria-current="page"]');
    assert.equal(await page.locator('#place').inputValue(), 'Kyoto');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
