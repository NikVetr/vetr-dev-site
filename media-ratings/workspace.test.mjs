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
    const films = JSON.parse(readFileSync(new URL('expanded.json', import.meta.url), 'utf8'));
    await page.locator('#library .entry').first().waitFor();
    assert.equal(await page.locator('#projection-title').innerText(), 'Movie preference fingerprint');
    assert.equal(await page.locator('#profile-count').innerText(), 'Catalog baseline');
    await page.locator('#model').selectOption('reference');
    const rows = page.locator('#library .entry');
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
      const row = page.locator('#library .entry[data-id="' + ids[idx] + '"]');
      await row.getByRole('radio', { name: value + ' stars', exact: true }).check();
      ratings[ids[idx]] = value;
    }
    assert.ok(await page.locator('#pending').isVisible());
    assert.equal(await page.locator('#profile-count').innerText(), 'Catalog baseline');
    assert.equal(await page.locator('[data-key=expected] button').count(), 500);
    await page.locator('#apply').click();
    assert.ok(await page.locator('#pending').isHidden());
    assert.equal(await page.locator('#profile-count').innerText(), '2 applied ratings');
    const expected = predict(films, { model: 'reference', ratings });
    const score = {
      expected: (p) => p.expected,
      chance: (p) => p.chance,
      up: (p) => p.shift,
      down: (p) => -p.shift,

      precision: (p) => p.expected / Math.max(0.01, p.sd ** 2),
    };
    for (const [key, fn] of Object.entries(score)) {
      const sorted = [...expected.predictions]
        .filter((p) => !['up', 'down'].includes(key) || fn(p) > 0)
        .sort((a, b) => fn(b) - fn(a));
      assert.deepEqual(
        await page
          .locator('.ranks[data-key=' + key + '] button')
          .evaluateAll((els) => els.map((el) => el.dataset.id)),
        sorted.map((p) => p.itemId),
      );
    }
    const pick = page.locator('.ranks[data-key=expected] button').first();
    await pick.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const item = await page.locator('#detail').getAttribute('data-id');
    assert.equal(item, await page.locator('.ranks[data-key=expected] button').nth(1).getAttribute('data-id'));
    assert.match(
      await page.locator('#external').getAttribute('href'),
      /^https:\/\/www\.imdb\.com\/title\/tt\d+\/$/,
    );
    const heat = page.locator('.heat');
    assert.equal(await heat.locator('tbody tr').count(), 10);
    const comp = page.locator('#comparison select');
    await comp.selectOption(ids[0]);
    assert.equal(await heat.locator('.observed th').innerText(), '1.5');
    const threshold = page.getByRole('radiogroup', { name: 'Minimum rating for chance ranking' });
    assert.equal(await threshold.getByRole('radio').count(), 10);
    await threshold.getByRole('radio', { name: '5 stars', exact: true }).click();
    await page.keyboard.press('ArrowLeft');
    assert.ok(await threshold.getByRole('radio', { name: '4.5 stars', exact: true }).isChecked());
    await page.keyboard.press('ArrowRight');
    assert.ok(await threshold.getByRole('radio', { name: '5 stars', exact: true }).isChecked());
    const atFive = predict(films, { model: 'reference', ratings, threshold: 5 }).predictions.sort(
      (a, b) => b.chance - a.chance,
    );
    assert.equal(
      await page.locator('.ranks[data-key=chance] .rank').first().getAttribute('data-id'),
      atFive[0].itemId,
    );
    assert.equal(await comp.inputValue(), ids[0]);
    assert.equal(await page.locator('#rated-list .entry').count(), 2);
    await page.locator('#auto').check();
    await page
      .locator('#rated-list .entry')
      .first()
      .getByRole('button', { name: /Clear rating/ })
      .click();
    assert.equal(await page.locator('#rated-list .entry').count(), 1);
    assert.equal(await page.locator('.ranks[data-key=expected] button').count(), 499);
    await page.locator('[data-key=stravl]').click();
    await rows.first().getByRole('radio', { name: 'No', exact: true }).check();
    assert.equal(await threshold.getByRole('radio').count(), 3);
    await threshold.getByRole('radio', { name: 'Maybe', exact: true }).click();
    assert.ok(await threshold.getByRole('radio', { name: 'Maybe', exact: true }).isChecked());
    assert.equal(await page.locator('.ranks[data-key=expected] button').count(), 11);
    assert.match(
      await page.locator('#external').getAttribute('href'),
      /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/,
    );
    assert.match(
      await page.getByRole('link', { name: 'Wikipedia' }).getAttribute('href'),
      /^https:\/\/en\.wikipedia\.org\/wiki\//,
    );
    assert.equal(await page.locator('#projection-title').innerText(), 'City preference fingerprint');
    await page.locator('#model').selectOption('latentClass');
    await page.locator('#taste details summary').click();
    assert.match(await page.locator('#weights').innerText(), /Taste components/);
    await page.setViewportSize({ width: 320, height: 844 });
    const choicesFitOneLine = () =>
      page.locator('#threshold, .info-row .choices').evaluateAll(
        (groups) =>
          groups.length > 1 &&
          groups.every((group) => {
            const cells = group.querySelectorAll('label');
            return (
              group.scrollWidth <= group.clientWidth + 1 &&
              cells[0].getBoundingClientRect().top === cells[cells.length - 1].getBoundingClientRect().top
            );
          }),
      );
    assert.ok(await choicesFitOneLine());
    await page.locator('#domains [data-key=expanded]').click();
    assert.equal(await page.locator('#rated-count').innerText(), '1 / 500 rated');
    assert.ok(await choicesFitOneLine());
    await page.locator('#search').fill('Shawshank');
    assert.equal(await page.locator('#library .entry:visible').count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.ranks[data-key=expected] button').first().click();
    assert.ok(await page.locator('#detail-title').evaluate((e) => e === document.activeElement));
    const custom = {
      name: 'Two entries',
      domain: 'books',
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
    await page.locator('#file').setInputFiles({
      name: 'catalog.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(custom)),
    });
    await page.getByRole('radio', { name: '0', exact: true }).first().check();
    assert.equal(await page.locator('#projection-title').innerText(), 'Book preference fingerprint');
    assert.ok(await page.locator('#external').isHidden());
    await rows.getByRole('radio', { name: '3', exact: true }).last().check();
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

test('expanded catalog, information ratings, sampled scatter, projections, and exchange', async () => {
  const app = await openPage('media-ratings/');
  const p = app.page;
  try {
    await p.locator('#library .entry').first().waitFor();
    assert.equal(await p.locator('#model').inputValue(), 'ratingsTags');
    assert.equal(await p.locator('#library .entry').count(), 500);
    await p.locator('.ranks[data-key=expected] button[data-id="50"]').click();
    assert.equal(
      await p.getByRole('link', { name: 'Rotten Tomatoes' }).getAttribute('href'),
      'https://www.rottentomatoes.com/m/usual_suspects',
    );
    assert.equal(
      await p.getByRole('link', { name: 'Wikipedia' }).getAttribute('href'),
      'https://en.wikipedia.org/wiki/The_Usual_Suspects',
    );
    await p.locator('#search').fill('Harry Potter');
    assert.equal(await p.locator('#library .entry:visible').count(), 8);
    await p.locator('#search').fill('');
    const d = p.locator('#divider');
    await d.focus();
    await p.keyboard.press('ArrowUp');
    assert.equal(await d.getAttribute('aria-valuenow'), '60');
    const box = await d.boundingBox();
    await p.mouse.move(box.x + 50, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + 50, box.y - 20);
    await p.mouse.up();
    assert.ok(Number(await d.getAttribute('aria-valuenow')) < 60);
    assert.equal(await p.locator('.board .ranks').first().getAttribute('data-key'), 'information');
    const quick = p.locator('.info-row').first(),
      id = await quick.getAttribute('data-id');
    await quick.getByRole('radio', { name: '4.5 stars', exact: true }).check();
    assert.equal(await p.locator('#rated-list .entry').getAttribute('data-id'), id);
    assert.ok(
      await p
        .locator('#library .entry[data-id="' + id + '"]')
        .getByRole('radio', { name: '4.5 stars', exact: true })
        .isChecked(),
    );
    await p.locator('.info-row[data-id="' + id + '"]').waitFor({ state: 'detached' });
    assert.equal(await p.locator('#library .entry').count(), 500);
    const shift = p.locator('.ranks:is([data-key=up],[data-key=down]) .rank').first();
    const target = await shift.getAttribute('data-id');
    assert.match(await shift.locator('.score').innerText(), /\d+\.\d{2} → \d+\.\d{2} \([+-]\d+\.\d{2}\)/);
    assert.equal(
      await shift.locator('.shift-delta').evaluate((el) => el.classList.contains('rise')),
      (await shift.locator('.shift-delta').innerText()).startsWith('(+'),
    );
    await p.locator('#search').fill('not-a-film');
    await shift.click();
    assert.ok(await p.locator('#library .entry[data-id="' + target + '"]').isVisible());
    assert.ok(
      await p
        .locator('#library .entry[data-id="' + target + '"] input')
        .first()
        .evaluate((e) => document.activeElement === e),
    );
    await p.locator('#facet').selectOption('Genre/Adventure');
    assert.ok((await p.locator('#library .entry:visible').count()) < 500);
    await p.locator('#facet').selectOption('');
    await p.locator('.heat').waitFor();
    await p.getByText('Sampled latent scores', { exact: true }).click();
    await p.locator('#comparison svg circle').first().waitFor();
    assert.match(await p.locator('#axes').innerText(), /between-class variance/);
    await p.locator('#threshold').getByRole('radio', { name: '4.5 stars', exact: true }).click();
    await p.locator('#exchange summary').click();
    const download = p.waitForEvent('download');
    await p.locator('#save-forecasts').click();
    const f = await download;
    await p
      .locator('#prediction-file')
      .setInputFiles({ name: 'predictions.csv', mimeType: 'text/csv', buffer: readFileSync(await f.path()) });
    await p.locator('#snapshot tbody tr').first().waitFor();
    assert.equal(await p.locator('#snapshot tbody tr').count(), 499);
    assert.equal(await p.locator('#snapshot tbody tr').first().locator('td').nth(5).innerText(), '4.5');
    const ratingfile = p.waitForEvent('download');
    await p.locator('#save-ratings').click();
    const supplied = readFileSync(await (await ratingfile).path());
    await p.locator('#rated-list .clear').click();
    await p
      .locator('#rating-file')
      .setInputFiles({ name: 'ratings.csv', mimeType: 'text/csv', buffer: supplied });
    await p.locator('#rated-list .entry').waitFor();
    assert.equal(await p.locator('#rated-list .entry').getAttribute('data-id'), id);
    const hybrid = await p.locator('[data-key=expected] .rank').first().innerText();
    await p.locator('#model').selectOption('latentClass');
    assert.equal(await p.locator('#rated-list .entry').getAttribute('data-id'), id);
    assert.match(await p.locator('#axes').innerText(), /between-class variance/);
    await p.locator('#model').selectOption('ratingsTags');
    assert.equal(await p.locator('[data-key=expected] .rank').first().innerText(), hybrid);
    assert.match(await p.locator('#formula').innerText(), /similar films/);
    await p.locator('#model').selectOption('reference');
    assert.match(await p.locator('#axes').innerText(), /latent variance/);
    assert.equal(await p.locator('#taste-plot polyline').count(), 2);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
