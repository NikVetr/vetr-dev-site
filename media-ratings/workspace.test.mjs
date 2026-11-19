import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openPage } from '../scripts/landing-art/browser.mjs';
import { predict, rankChanges } from './core.mjs';
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
    assert.equal(await page.locator('[data-key=expected] .rank').count(), 500);
    await page.locator('#apply').click();
    assert.ok(await page.locator('#pending').isHidden());
    assert.equal(await page.locator('#profile-count').innerText(), '2 applied ratings');
    const expected = predict(films, { model: 'reference', ratings });
    const places = rankChanges(expected.predictions);
    const score = {
      expected: (p) => p.expected,
      chance: (p) => p.chance,
      ratingChange: (p) => p.shift,
      rankChange: (p) => places.get(p.itemId).change,

      precision: (p) => p.expected / Math.max(0.01, p.sd ** 2),
    };
    for (const [key, fn] of Object.entries(score)) {
      const sorted = [...expected.predictions]
        .filter((p) => !['ratingChange', 'rankChange'].includes(key) || fn(p) > 0)
        .sort((a, b) => fn(b) - fn(a));
      assert.deepEqual(
        await page
          .locator('.ranks[data-key=' + key + '] .rank')
          .evaluateAll((els) => els.map((el) => el.dataset.id)),
        sorted.map((p) => p.itemId),
      );
    }
    const pick = page.locator('.ranks[data-key=expected] .rank').first();
    await pick.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const item = await page.locator('#detail').getAttribute('data-id');
    assert.equal(item, await page.locator('.ranks[data-key=expected] .rank').nth(1).getAttribute('data-id'));
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
    assert.equal(await page.locator('.ranks[data-key=expected] .rank').count(), 499);
    await page.locator('[data-key=stravl]').click();
    await rows.first().getByRole('radio', { name: 'No', exact: true }).check();
    assert.equal(await threshold.getByRole('radio').count(), 3);
    await threshold.getByRole('radio', { name: 'Maybe', exact: true }).click();
    assert.ok(await threshold.getByRole('radio', { name: 'Maybe', exact: true }).isChecked());
    assert.equal(await page.locator('.ranks[data-key=expected] .rank').count(), 11);
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
    await page.locator('#profile-method summary').click();
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
    assert.equal(await page.locator('#rated-count').innerText(), '1 / 500');
    assert.ok(await choicesFitOneLine());
    await page.locator('#search').fill('Shawshank');
    assert.equal(await page.locator('#library .entry:visible').count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.ranks[data-key=expected] .rank').first().click();
    assert.ok(
      await page.locator('#library .catalog-highlight').evaluate((e) => e.contains(document.activeElement)),
    );
    const custom = {
      name: 'Two entries',
      domain: 'books',
      items: [
        { itemId: '356', title: 'Alpha', annotations: { year: 1984 } },
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
    await page.locator('#facet').selectOption('Publication year/1984');
    assert.equal(await page.locator('#library .entry:visible').count(), 1);
    assert.equal(await page.locator('[data-key=expected] .rank').count(), 1);
    await page.locator('#facet').selectOption('');
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
    assert.equal(await page.locator('#rated-count').innerText(), '2 / 2');
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
    assert.equal(await p.locator('#model').inputValue(), 'personalized');
    assert.equal(await p.locator('#library .entry').count(), 500);
    await p.locator('.ranks[data-key=expected] .rank[data-id="50"]').click();
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
    const changeBoard = p.locator('[data-key=ratingChange]');
    if (!(await changeBoard.locator('.rank').count()))
      await p.getByRole('button', { name: 'Rating change: biggest gains. Show falls' }).click();
    const shift = changeBoard.locator('.forecast-row').first();
    const target = await shift.getAttribute('data-id');
    assert.match(await shift.locator('.score').innerText(), /\d+\.\d{2} → \d+\.\d{2} \([+-]\d+\.\d{2}\)/);
    assert.equal(
      await shift.locator('.shift-delta').evaluate((el) => el.classList.contains('rise')),
      (await shift.locator('.shift-delta').innerText()).startsWith('(+'),
    );
    await p.locator('#search').fill('not-a-film');
    await shift.locator('.rank').click();
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
    await p.locator('#model').selectOption('personalized');
    assert.equal(await p.locator('[data-key=expected] .rank').first().innerText(), hybrid);
    assert.match(await p.locator('#formula').innerText(), /similar films/);
    await p.locator('#model').selectOption('reference');
    assert.match(await p.locator('#axes').innerText(), /latent variance/);
    assert.equal(await p.locator('#taste-plot polyline').count(), 2);
    await p.getByLabel('Vertical principal component').selectOption('499');
    assert.match(await p.locator('#axes').innerText(), /PC500/);
    assert.equal(await p.locator('#taste-plot polyline').count(), 2);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('familiar next ratings, rank drops and in-place rating work across recommendation boards', async () => {
  const app = await openPage('media-ratings/');
  const p = app.page;
  try {
    const firstInfo = p.locator('.info-row').first();
    const familiar = p.getByRole('checkbox', { name: 'Weight by familiarity' });
    await firstInfo.waitFor();
    assert.ok(await familiar.isChecked());
    assert.equal(await firstInfo.getAttribute('data-id'), '356'); // Forrest Gump
    await familiar.uncheck();
    assert.equal(await firstInfo.getAttribute('data-id'), '786'); // Eraser
    await familiar.check();
    const header = p.locator('.information .board-head');
    assert.equal(await header.locator('small').count(), 0);
    const left = await header.locator('h3').boundingBox(),
      right = await familiar.boundingBox();
    assert.ok(right.x > left.x + left.width && right.y < left.y + left.height);
    await p.locator('#facet').selectOption('Release year/1999');
    const from1999 = p.locator('#library .entry:visible');
    assert.ok((await from1999.count()) > 1);
    assert.ok((await from1999.allTextContents()).every((t) => t.includes('(1999)')));
    assert.equal(await p.locator('[data-key=expected] .rank').count(), await from1999.count());
    await p.locator('#facet').selectOption('');
    const firstRow = p.locator('[data-key=expected] .forecast-row').first();
    const metric = firstRow.locator('.quick-rate');
    await firstRow.locator('.rank').hover();
    assert.equal(await metric.locator('.rate-cue').evaluate((e) => getComputedStyle(e).opacity), '0');
    await metric.hover();
    assert.equal(await metric.locator('.score').evaluate((e) => getComputedStyle(e).opacity), '0');
    const rowHeight = (await firstRow.boundingBox()).height;
    await metric.click();
    const pop = firstRow.locator(':popover-open');
    const buttonBox = await metric.boundingBox(),
      popBox = await pop.boundingBox();
    assert.ok(popBox.x >= buttonBox.x + buttonBox.width);
    assert.equal((await firstRow.boundingBox()).height, rowHeight);
    await p.keyboard.press('Escape');
    assert.equal(await metric.getAttribute('aria-expanded'), 'false');
    assert.ok(await metric.evaluate((e) => e === document.activeElement));
    const cutoffHeading = p.locator('h3:has(#threshold)');
    assert.match(await cutoffHeading.innerText(), /Chance of ≥\s*\(4\)/);
    await p.locator('#model').selectOption('ratingsTags'); // Reproduce the all-rising two-film baseline.
    for (const id of ['2571', '5618'])
      await p
        .locator('#library .entry[data-id="' + id + '"]')
        .getByRole('radio', { name: '5 stars', exact: true })
        .check();
    const direction = (panel) => p.getByRole('button', { name: new RegExp('^' + panel + ': biggest') });
    assert.equal(await direction('Rating change').getAttribute('data-direction'), 'up');
    assert.equal(await p.locator('[data-key=ratingChange] .rank').count(), 498);
    await direction('Rating change').click();
    assert.match(
      await p.locator('[data-key=ratingChange] .note').innerText(),
      /All 498 predicted ratings rose/,
    );
    await direction('Rank change').click();
    assert.equal(await p.locator('[data-key=rankChange] .rank').count(), 237);
    assert.match(
      await p.locator('[data-key=rankChange] .forecast-row .score').first().innerText(),
      /^#\d+ → #\d+ \(-\d+\)$/,
    );
    await direction('Rating change').click();
    const horizontal = p.getByLabel('Horizontal principal component');
    const vertical = p.getByLabel('Vertical principal component');
    assert.equal(await horizontal.locator('option').count(), 7);
    await horizontal.selectOption('6');
    await vertical.selectOption('6');
    assert.equal(await horizontal.inputValue(), '1'); // selecting the other axis swaps positions
    assert.match(await p.locator('#axes').innerText(), /PC7/);
    const center = p.getByRole('checkbox', { name: 'Remove overall rating level' });
    const expectedFirst = await p.locator('[data-key=expected] .rank').first().innerText();
    await center.check();
    assert.equal(await horizontal.inputValue(), '0');
    assert.equal(await p.locator('[data-key=expected] .rank').first().innerText(), expectedFirst);
    await p.locator('#axes summary').first().click();
    assert.ok(await p.locator('#axes details').first().locator('li').first().isVisible());
    await center.uncheck();
    await p.locator('#profile-method summary').click();
    const member = p.locator('#memberships button[data-class-index="2"]');
    await member.hover();
    assert.match(await p.locator('#class-signature').innerText(), /Most distinctive answer/);
    await member.click();
    await p.mouse.move(0, 0);
    assert.equal(await member.getAttribute('aria-pressed'), 'true');
    assert.match(await p.locator('#class-signature').innerText(), /Pinned class/);
    await member.focus();
    await p.keyboard.press('Escape');
    assert.equal(await member.getAttribute('aria-pressed'), 'false');
    await p.locator('#auto').uncheck();
    for (const key of ['expected', 'chance', 'rankChange', 'ratingChange', 'precision']) {
      const row = p.locator('.ranks[data-key=' + key + '] .forecast-row').first();
      await row.locator('.quick-rate').click();
      const id = await row.getAttribute('data-id');
      await row.getByRole('radio', { name: '2.5 stars', exact: true }).check();
      assert.ok(
        await p
          .locator('#library .catalog-highlight[data-id="' + id + '"]')
          .getByRole('radio', { name: '2.5 stars', exact: true })
          .isChecked(),
      );
      assert.ok(await row.getByRole('radio', { name: '2.5 stars', exact: true }).isChecked());
      await row.locator('.quick-rate').click();
      assert.equal(await row.locator('.choices').count(), 0);
    }
    const row = p.locator('[data-key=expected] .forecast-row').nth(15);
    const id = await row.getAttribute('data-id');
    await p.locator('#search').fill('absent title');
    await row.locator('.rank').click();
    assert.equal(await p.locator('#search').inputValue(), '');
    assert.ok(
      await p
        .locator('#library .catalog-highlight[data-id="' + id + '"]')
        .evaluate((e) => e.contains(document.activeElement)),
    );
    await p.getByLabel('Catalog sort order').selectOption('budget');
    await p
      .getByLabel('Filter catalog and rankings by annotation')
      .selectOption('Production budget/$100M to <$500M');
    assert.ok((await p.locator('#library .entry:visible').count()) > 0);
    await p.locator('#more-metadata summary').click();
    assert.match(await p.locator('#more-metadata dl').innerText(), /Production budget/);
    await p.locator('#domains [data-key=stravl]').click();
    await p.locator('#projection-title').getByText('City preference fingerprint').waitFor();
    assert.ok(await familiar.isChecked());
    assert.match(await firstInfo.locator('.score').getAttribute('title'), /12,905 respondents/);
    await p.locator('#auto').check();
    const city = p.locator('[data-key=chance] .forecast-row').first();
    const cityId = await city.getAttribute('data-id');
    await city.locator('.quick-rate').click();
    await city.getByRole('radio', { name: 'Yes', exact: true }).click();
    assert.equal(await p.locator('#rated-list .entry').getAttribute('data-id'), cityId);
    assert.equal(await p.locator('.forecast-row[data-id="' + cityId + '"]').count(), 0);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('volunteered and prompted film ratings keep their source through model switches, drafts and CSV', async () => {
  const app = await openPage('media-ratings/');
  const p = app.page;
  try {
    const model = p.locator('#model');
    await p.locator('#library .entry').first().waitFor();
    assert.equal(await model.inputValue(), 'personalized');
    await model.selectOption('ratingsTags');
    const shelf = (id) => p.locator('#library .entry[data-id="' + id + '"]');
    const source = (id) => p.locator('#rated-list .entry[data-id="' + id + '"] .rating-source');
    const stars = (row, value) => row.getByRole('radio', { name: value + ' stars', exact: true }).click();
    await stars(shelf('2571'), 5);
    const prompt = p.locator('.info-row').first();
    const suggested = await prompt.getAttribute('data-id');
    await stars(prompt, 4);
    await model.selectOption('personalized');
    const note = p.locator('#choice-note');
    assert.match(await note.innerText(), /picked 1 of 2/);
    assert.equal(await source('2571').inputValue(), 'volunteered');
    assert.equal(await source(suggested).inputValue(), 'suggested');
    const rank = p.locator('[data-key=expected] .forecast-row').first();
    const followed = await rank.getAttribute('data-id');
    await rank.locator('.rank').click();
    await stars(shelf(followed), 3);
    assert.equal(await source(followed).inputValue(), 'suggested');
    await stars(shelf(followed), 4);
    assert.equal(await source(followed).inputValue(), 'suggested');
    await p.locator('#auto').uncheck();
    await source(followed).selectOption('volunteered');
    await model.selectOption('latentClass');
    assert.ok(await note.isHidden());
    await model.selectOption('personalized');
    assert.ok(await p.locator('#pending').isVisible());
    assert.match(await note.innerText(), /picked 1 of 3/);
    await p.locator('#apply').click();
    assert.match(await note.innerText(), /picked 2 of 3/);
    await p.locator('#exchange summary').click();
    const download = p.waitForEvent('download');
    await p.locator('#save-ratings').click();
    const file = readFileSync(await (await download).path());
    const load = (buffer) =>
      p.locator('#rating-file').setInputFiles({ name: 'ratings.csv', mimeType: 'text/csv', buffer });
    for (const id of [followed, suggested])
      await p.locator('#rated-list .entry[data-id="' + id + '"] .clear').click();
    await load(file);
    await source(suggested).waitFor();
    assert.equal(await source(suggested).inputValue(), 'suggested');
    assert.equal(await source(followed).inputValue(), 'volunteered');
    const legacy = await p.locator('[data-key=expected] .rank').first().getAttribute('data-id');
    await load(Buffer.from('itemId,rating\n' + legacy + ',3\n2571,4\n'));
    await source(legacy).waitFor();
    assert.equal(await source(legacy).inputValue(), 'unknown');
    assert.equal(await source('2571').inputValue(), 'volunteered');
    await load(Buffer.from('itemId,rating,source\n2571,5,unknown\n' + legacy + ',5,typo\n'));
    await p.locator('#status').getByText('Unknown rating source in row 3.').waitFor();
    assert.equal(await source('2571').inputValue(), 'volunteered');
    await p.locator('#auto').check();
    assert.match(await note.innerText(), /picked 2 of 4/);
    const quick = p.locator('[data-key=chance] .forecast-row').first();
    const quickId = await quick.getAttribute('data-id');
    await quick.locator('.quick-rate').click();
    await stars(quick, 4);
    assert.equal(await source(quickId).inputValue(), 'suggested');
    await p.locator('#domains [data-key=stravl]').click();
    await p.locator('#projection-title').getByText('City preference fingerprint').waitFor();
    assert.equal(await model.locator('option[value=titleChoice]').count(), 0);
    assert.ok(await note.isHidden());
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('dated ratings round-trip and update the catalog prior, rankings and editable submission date', async () => {
  const app = await openPage('media-ratings/');
  const p = app.page;
  try {
    const rated = (id) => p.locator('#rated-list .entry[data-id="' + id + '"]');
    const file = (buffer) =>
      p.locator('#rating-file').setInputFiles({ name: 'ratings.csv', mimeType: 'text/csv', buffer });
    await p.locator('#library .entry').first().waitFor();
    const model = p.locator('#model');
    await p
      .locator('#library .entry[data-id="2571"]')
      .getByRole('radio', { name: '5 stars', exact: true })
      .click();
    await model.selectOption('personalized');
    assert.equal(
      await rated('2571').locator('.rating-date').inputValue(),
      new Date().toISOString().slice(0, 10),
    );
    await rated('2571').locator('.rating-source').selectOption('suggested'); // Isolate the calendar contribution.
    await p.locator('#auto').uncheck();
    await rated('2571').locator('.rating-date').fill('2000-04-05');
    const note = p.locator('#choice-note');
    assert.match(await note.innerText(), /uses 2019/);
    await p.locator('#exchange summary').click();
    await file(Buffer.from('itemId,rating\n356,2\n'));
    await rated('356').waitFor();
    assert.equal(await rated('356').locator('.rating-date').inputValue(), '');
    await p.locator('#apply').click();
    assert.match(await note.innerText(), /uses 2000/);
    const films = JSON.parse(readFileSync(new URL('expanded.json', import.meta.url), 'utf8'));
    const expected = predict(films, {
      model: 'ratingYear',
      ratings: { 2571: 5, 356: 2 },
      ratedOn: { 2571: '2000-04-05' },
    });
    const top = expected.predictions[0],
      first = p.locator('[data-key=expected] .forecast-row').first();
    assert.equal(await first.getAttribute('data-id'), top.itemId);
    await first.locator('.rank').click();
    assert.equal(await p.locator('#metrics dd').first().innerText(), top.prior.toFixed(2));
    assert.equal(
      await p.locator('#library .entry[data-id="' + top.itemId + '"] .entry-meta').innerText(),
      top.prior.toFixed(2),
    );
    await file(Buffer.from('itemId,rating,ratedOn\n2571,1,2015-02-29\n'));
    await p
      .locator('#status')
      .getByText(/YYYY-MM-DD/)
      .waitFor();
    assert.equal(await rated('2571').locator('.rating-date').inputValue(), '2000-04-05');
    const download = p.waitForEvent('download');
    await p.locator('#save-ratings').click();
    const csv = readFileSync(await (await download).path());
    assert.match(csv.toString(), /ratedOn/);
    await rated('2571').locator('.clear').click();
    await file(csv);
    await rated('2571').waitFor();
    assert.equal(await rated('2571').locator('.rating-date').inputValue(), '2000-04-05');
    assert.equal(await rated('356').locator('.rating-date').inputValue(), '');
    await rated('2571').locator('.rating-date').fill('');
    await p.locator('#auto').check();
    assert.match(await note.innerText(), /Undated/);
    const undated = await p.locator('[data-key=expected] .forecast-row').first().innerText();
    await model.selectOption('ratingsTags');
    assert.equal(await p.locator('[data-key=expected] .forecast-row').first().innerText(), undated);
    assert.equal(await p.locator('.rating-date').count(), 0);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('quick rating uses the active shelf, supports undo and attributes prompted answers correctly', async () => {
  const app = await openPage('media-ratings/');
  const p = app.page;
  try {
    const card = p.locator('#rapid-card'),
      dialog = p.locator('#rapid-rating');
    const start = p.getByRole('button', { name: 'Quick rate', exact: true });
    const rated = (id) => p.locator('#rated-list .entry[data-id="' + id + '"]');
    await p.locator('.info-row').first().waitFor();
    await p.locator('#facet').selectOption('Release year/1999');
    const first = await p.locator('.info-row').first().getAttribute('data-id');
    await p.locator('#auto').uncheck();
    await start.click();
    assert.equal(await p.locator('#rapid-order').inputValue(), 'familiarInfo');
    assert.equal(await card.getAttribute('data-id'), first);
    await p.keyboard.press('Shift+Digit4');
    const second = await card.getAttribute('data-id');
    assert.notEqual(first, second);
    await p.keyboard.press('s');
    assert.notEqual(await card.getAttribute('data-id'), second);
    await p.keyboard.press('b');
    assert.equal(await card.getAttribute('data-id'), second);
    await p.keyboard.press('Backspace');
    assert.equal(await card.getAttribute('data-id'), first);
    await p.keyboard.press('ArrowRight'); // Revise the previous 3.5 to four stars.
    await p.keyboard.press('Enter');
    await p.locator('#rapid-order').selectOption('title');
    const alphabetical = await card.getAttribute('data-id');
    await p.keyboard.press('1');
    await p.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await rated(first).locator('input:checked').inputValue(), '4');
    assert.equal(await rated(alphabetical).locator('input:checked').inputValue(), '1');
    assert.equal(await rated(first).locator('.rating-source').inputValue(), 'suggested');
    assert.equal(
      await rated(first).locator('.rating-date').inputValue(),
      new Date().toISOString().slice(0, 10),
    );
    assert.equal(await p.locator('#profile-count').innerText(), 'Catalog baseline');
    await p.locator('#apply').click();
    assert.equal(await p.locator('#profile-count').innerText(), '2 applied ratings');
    assert.ok((await p.locator('#rated-list input:checked').count()) === 2);
    await p.locator('#clear-all').click();
    assert.equal(await p.locator('#rated-list .entry').count(), 0);
    assert.ok(await p.locator('#pending').isVisible());
    await p.locator('#clear-all').click();
    assert.equal(await rated(first).locator('.rating-source').inputValue(), 'suggested');
    assert.ok(await p.locator('#pending').isHidden());
    await p.locator('#domains [data-key=stravl]').click();
    await p.getByRole('heading', { name: 'City preference fingerprint' }).waitFor();
    await start.click();
    assert.equal(await dialog.locator('#rapid-values button').count(), 3);
    for (let i = 0; i < 12; i++) await p.keyboard.press('s');
    assert.ok(await dialog.getByText('You’ve reached the end').isVisible());
    await dialog.locator('#rapid-back').click();
    await dialog.getByRole('button', { name: 'Rate Yes', exact: true }).click();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    assert.equal(await p.locator('#rated-list input:checked').inputValue(), '2');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
