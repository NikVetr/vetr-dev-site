import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { predict } from './core.mjs';
import { submitRatingRequest } from './group-profiles.mjs';
import { ratingsCSV } from './exchange.mjs';
import { openPage } from '../scripts/landing-art/browser.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('expanded.json', import.meta.url), 'utf8'));
const profiles = [
  { name: 'Alex', ratings: { 2571: 5, 260: 4 }, volunteered: ['2571'], ratedOn: { 2571: '2019-01-01' } },
  { name: 'Sam', ratings: { 356: 2, 260: 1 } },
  { name: 'Kim', ratings: { 50: 5 } },
];
test('group scores reproduce individual predictions, including dates, unequal profiles and shared ratings', () => {
  const group = submitRatingRequest({ catalog, profiles, threshold: 4 });
  assert.ok('names' in group);
  assert.equal(group.predictions.length, 496);
  assert.deepEqual(group.names, ['Alex', 'Sam', 'Kim']);
  const item = group.predictions[0];
  const forecasts = profiles.map(
    ({ name, ...request }) =>
      predict(catalog, { ...request, threshold: 4, targetId: item.itemId }).predictions[0],
  );
  assert.deepEqual(
    item.means,
    forecasts.map((p) => p.expected),
  );
  assert.ok(Math.abs(item.joint - forecasts.reduce((a, p) => a * p.chance, 1)) < 1e-12);
  assert.ok(Math.abs(item.expected - forecasts.reduce((a, p) => a + p.expected, 0) / 3) < 1e-12);
  assert.ok(group.predictions.every((p, i, rows) => !i || p.joint <= rows[i - 1].joint + 1e-12));
  assert.ok(group.axes.length > 0 && group.axes.every((a) => a.positions.length === 3 && a.range >= 0));
  assert.deepEqual(group.shared[0].observed, [4, 1, null]);
  const surprise = group.surprises.find((s) => s.itemId === '260' && s.profile === 0);
  assert.equal(
    surprise.expected,
    predict(catalog, { ratings: profiles[2].ratings, targetId: '260' }).predictions[0].expected,
  );
  const byMean = submitRatingRequest({ catalog, profiles, threshold: 5, order: 'mean' }).predictions;
  assert.ok(byMean.every((p, i) => !i || p.expected <= byMean[i - 1].expected));
  assert.throws(() => submitRatingRequest({ catalog, profiles: [profiles[0]] }), { code: 'invalid_request' });
  assert.throws(() => submitRatingRequest({ catalog, profiles, threshold: 7 }), { code: 'invalid_request' });
});

test('import separate group profiles, change threshold and order, reject mismatched catalogs and inspect an item', async () => {
  const app = await openPage('rating-prediction/', { width: 390, height: 844 });
  const p = app.page;
  const upload = (i) => ({
    name: 'ratings.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(ratingsCSV(catalog, profiles[i].ratings)),
  });
  try {
    await p.locator('#group-open').click();
    await p.locator('#group-files').setInputFiles([upload(0), upload(1), upload(2)]);
    const rows = p.locator('#group-table-body tr');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 30);
    assert.equal(await p.locator('#group-members input').nth(1).inputValue(), 'ratings (2)');
    await p.locator('#group-members input').first().fill('Alex');
    await p.locator('#group-members input').first().press('Enter');
    await p.locator('#group-sort').selectOption('mean');
    await p.locator('#group-cutoff input[value="5"]').check();
    assert.ok((await p.locator('#group-axes .group-dot').count()) >= 3);
    assert.ok(
      await p
        .locator('#group-shared')
        .innerText()
        .then((t) => t.includes('Star Wars')),
    );
    const first = await rows.first().innerText();
    await p
      .locator('#group-files')
      .setInputFiles({
        name: 'bad.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('catalog,itemId,rating\nOther,2571,4'),
      });
    await p.waitForFunction(() => document.querySelector('#group-message').textContent.includes('bad.csv'));
    assert.equal(await rows.first().innerText(), first);
    assert.equal(await p.locator('#group-members input').count(), 3);
    await p.locator('#group-more').click();
    assert.equal(await rows.count(), 80);
    const title = await rows.first().locator('button').innerText();
    await rows.first().locator('button').click();
    assert.equal(await p.locator('#detail-title').innerText(), title);
    assert.equal(await p.locator('#rated-list .entry').count(), 0);
    await p.locator('#group-open').click();
    assert.equal(await p.locator('#group-members input').count(), 3);
    await p.locator('#group-members button').first().click();
    assert.equal(await p.locator('#group-members input').count(), 2);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
