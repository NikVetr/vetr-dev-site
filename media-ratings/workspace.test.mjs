import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openPage } from '../scripts/landing-art/browser.mjs';
import { predict } from './core.mjs';
import { jointCounts } from './detail.mjs';

test('paired counts preserve comparison rows and target columns on either item order', () => {
  const data = { scale: [0, 2], ids: ['a', 'b'], pairs: [[7, 0, 3, 5]] };
  const ab = jointCounts(data, 'a', 'b'),
    ba = jointCounts(data, 'b', 'a');
  assert.deepEqual(ab.rows, [
    [7, 3],
    [0, 5],
  ]);
  assert.deepEqual(ba.rows, [
    [7, 0],
    [3, 5],
  ]);
  assert.equal(ab.total, 15);
  assert.ok(Math.abs(ab.r - 35 / Math.sqrt(7 * 8 * 10 * 5)) < 1e-10);
  assert.equal(ab.r, ba.r);
});

test('catalog edits feed all rankings, detail and co-ratings at the chosen update time', async () => {
  const app = await openPage('media-ratings/');
  const { page } = app;
  try {
    /** @type {Record<string, number>} */
    const ratings = {};
    const films = JSON.parse(readFileSync(new URL('movielens.json', import.meta.url), 'utf8'));
    const rows = page.locator('.entry');
    await rows.first().waitFor();
    const ids = await rows.evaluateAll((els) => els.map((el) => el.dataset.id));
    assert.deepEqual(
      ids,
      predict(films, { model: 'reference' }).predictions.map((p) => p.itemId),
    );
    assert.equal(await page.locator('.board').count(), 6);
    const box = await page.locator('.analysis').boundingBox(),
      last = await page.locator('.board').last().boundingBox();
    assert.ok(last.y + last.height < 900 && box.width > 1000);
    await page.locator('#auto').uncheck();
    for (const [idx, value] of [
      [0, 1.5],
      [1, 5],
    ]) {
      const row = rows.nth(idx);
      await row.getByRole('radio', { name: value + ' stars', exact: true }).check();
      ratings[ids[idx]] = value;
    }
    assert.ok(await page.locator('#pending').isVisible());
    assert.equal(await page.locator('[data-key=expected] button').count(), 100);
    await page.locator('#apply').click();
    assert.ok(await page.locator('#pending').isHidden());
    const expected = predict(films, { model: 'reference', ratings });
    const score = {
      expected: (p) => p.expected,
      chance: (p) => p.chance,
      up: (p) => p.shift,
      down: (p) => -p.shift,
      absolute: (p) => Math.abs(p.shift),
      precision: (p) => p.expected / Math.max(0.01, p.sd ** 2),
    };
    for (const [key, fn] of Object.entries(score)) {
      const sorted = [...expected.predictions]
        .filter((p) => !['absolute', 'up', 'down'].includes(key) || fn(p) > 0)
        .sort((a, b) => fn(b) - fn(a));
      assert.deepEqual(
        await page
          .locator('.ranks[data-key=' + key + '] button')
          .evaluateAll((els) => els.map((el) => el.dataset.id)),
        sorted.map((p) => p.itemId),
      );
    }
    const pick = page.locator('.ranks[data-key=absolute] button').first();
    await pick.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const item = await page.locator('#detail').getAttribute('data-id');
    assert.equal(item, await page.locator('.ranks[data-key=absolute] button').nth(1).getAttribute('data-id'));
    assert.match(
      await page.locator('#external').getAttribute('href'),
      /^https:\/\/www\.imdb\.com\/title\/tt\d+\/$/,
    );
    const heat = page.locator('.heat');
    assert.equal(await heat.locator('tbody tr').count(), 10);
    const comp = page.locator('#comparison select');
    await comp.selectOption(ids[0]);
    assert.equal(await heat.locator('.observed th').innerText(), '1.5');
    await page.locator('#threshold').selectOption('5');
    assert.equal(await page.locator('.board h3').nth(1).innerText(), 'Chance of ≥ 5');
    assert.equal(await comp.inputValue(), ids[0]);
    await page.locator('#rated-only').check();
    assert.equal(await page.locator('.entry:visible').count(), 2);
    await page.locator('#auto').check();
    await rows
      .first()
      .getByRole('button', { name: /Clear rating/ })
      .click();
    assert.equal(await page.locator('.entry:visible').count(), 1);
    assert.equal(await page.locator('.ranks[data-key=expected] button').count(), 99);
    await page.locator('[data-key=stravl]').click();
    await rows.first().getByRole('radio', { name: 'No', exact: true }).check();
    assert.equal(await page.locator('.ranks[data-key=expected] button').count(), 11);
    assert.match(
      await page.locator('#external').getAttribute('href'),
      /^https:\/\/www\.openstreetmap\.org\/search/,
    );
    await page.locator('#model').selectOption('latentClass');
    assert.match(await page.locator('#weights').innerText(), /Taste components/);
    await page.locator('[data-key=movielens]').click();
    assert.equal(await page.locator('#rated-count').innerText(), '1 / 100 rated');
    await page.locator('#search').fill('Shawshank');
    assert.equal(await page.locator('.entry:visible').count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.ranks[data-key=expected] button').first().click();
    assert.ok(await page.locator('#detail-title').evaluate((e) => e === document.activeElement));
    const custom = {
      name: 'Two entries',
      items: [
        { itemId: '356', title: 'Alpha' },
        { itemId: '2', title: 'Beta' },
      ],
      scale: [0, 3],
      models: {
        fit: {
          kind: 'latent-class',
          components: [
            {
              weight: 1,
              probabilities: [
                [0.2, 0.8],
                [0.4, 0.6],
              ],
            },
          ],
        },
      },
    };
    await page
      .locator('#file')
      .setInputFiles({
        name: 'catalog.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(custom)),
      });
    await page.getByRole('radio', { name: '0', exact: true }).first().check();
    assert.ok(await page.locator('#external').isHidden());
    await page.getByRole('radio', { name: '3', exact: true }).last().check();
    assert.ok(await page.locator('#detail').isHidden());
    assert.match(await page.locator('.board').first().innerText(), /All entries rated/);
    await page
      .locator('#file')
      .setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page
      .locator('#status')
      .getByText(/Could not open catalog/)
      .waitFor();
    assert.equal(await page.locator('#rated-count').innerText(), '2 / 2 rated');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
