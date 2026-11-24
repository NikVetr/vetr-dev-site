import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openPage } from '../scripts/landing-art/browser.mjs';
import { predict } from './core.mjs';
import { filmCheckSchema, sampleOffers, summarizeFilmChecks } from './film-check.mjs';

test('film checks sample five distinct ranks and count only displayed offers', () => {
  const ids = Array.from({ length: 30 }, (_, i) => String(i + 1));
  const selected = sampleOffers(ids, () => 0.99);
  assert.equal(selected.length, 5);
  assert.equal(new Set(selected.map((r) => r.itemId)).size, 5);
  assert(selected.every((r) => r.rank <= 20 && ids[r.rank - 1] === r.itemId));
  assert.deepEqual(sampleOffers([]), []);
  assert.equal(sampleOffers(['a']).length, 1);
  const p = Array(10).fill(0.1);
  const first = {
    itemId: 'a',
    rank: 1,
    outcome: 'unanswered',
    rating: null,
    forecasts: { personalized: p, reference: p },
  };
  const session = { id: 's', catalog: 'expanded', model: 'personalized', poolSize: 6, offers: [first] };
  const snapshot = { schema: filmCheckSchema, sessions: [session] };
  const final = {
    ...snapshot,
    sessions: [
      {
        ...session,
        offers: [
          { ...first, outcome: 'rated', rating: 5 },
          { ...first, itemId: 'b', rank: 2, outcome: 'unseen' },
        ],
      },
    ],
  };
  const s = summarizeFilmChecks([final, snapshot, final]);
  assert.equal(s.sessions, 1);
  assert.equal(s.offered, 2);
  assert.equal(s.responseRate, 0.5);
  assert(Math.abs(s.metrics.personalized.brier - 0.49) < 1e-12);
  assert.equal(summarizeFilmChecks(snapshot).metrics.reference, null);
  const conflict = structuredClone(final);
  conflict.sessions[0].offers[0].rating = 1;
  assert.throws(() => summarizeFilmChecks([final, conflict]), /Conflicting/);
  assert.throws(() => summarizeFilmChecks({}), /Expected a film/);
});

test('film validation and randomized checks use the active ranking and preserve unanswered offers across reloads', async () => {
  const { page, errors, close } = await openPage('rating-prediction/', { width: 390, height: 844 });
  try {
    await page.locator('#validation summary').click();
    const table = page.locator('#film-comparison table');
    await table.waitFor();
    const report = JSON.parse(
      readFileSync(new URL('validation/film-calibration.json', import.meta.url), 'utf8'),
    );
    assert.match(await table.innerText(), /Gaussian reference/);
    assert.match(await table.innerText(), new RegExp(report.models.recalibrated.logLoss.toFixed(4)));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const catalog = JSON.parse(readFileSync(new URL('expanded.json', import.meta.url), 'utf8'));
    const baseline = predict(catalog, { model: 'personalized' }).predictions;
    await page.locator('#film-check summary').click();
    await page.getByRole('button', { name: 'Start film check' }).click();
    const dialog = page.locator('#film-check-dialog');
    await dialog.getByRole('button', { name: 'Rate 4 stars', exact: true }).click();
    await dialog.getByRole('button', { name: 'Haven’t seen it', exact: true }).click();
    await dialog.getByRole('button', { name: 'Skip', exact: true }).click();
    await dialog.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.reload();
    await page.locator('#film-check summary').click();
    await page
      .locator('#film-check-summary')
      .getByText(/4 offered · 1 rated · 1 unseen · 1 skipped · 1 unanswered/)
      .waitFor();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export checks' }).click();
    const file = JSON.parse(readFileSync(await (await downloaded).path(), 'utf8'));
    const offers = file.sessions[0].offers;
    assert.equal(new Set(offers.map((o) => o.itemId)).size, 4);
    for (const o of offers) {
      assert.equal(o.itemId, baseline[o.rank - 1].itemId);
      assert.deepEqual(o.forecasts.personalized, baseline[o.rank - 1].probabilities);
    }
    assert.equal(summarizeFilmChecks(file).responseRate, 0.25);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});
