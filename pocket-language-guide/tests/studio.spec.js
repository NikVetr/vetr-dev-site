import { test, expect } from '@playwright/test';
import { counts, expectIncluded, expectIncludedNot, faceCount } from './counts.js';
import { translated, withoutPack } from './registry.js';

const STUDIO = '/customize.html?target=zh-Hans&source=en';

test.describe('studio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('solves the reference sheet and shows three panels', async ({ page }) => {
    /** @type {string[]} */ const failures = [];
    page.on('pageerror', (e) => failures.push(e.message));
    await page.goto(STUDIO);

    await expect(page.locator('.face.focused')).toBeVisible();
    const faces = await faceCount(page);
    await expect(page.locator('.studio > section')).toHaveCount(3);
    // Every face is reachable from the thumbnail strip.
    await expect(page.locator('.face-strip .face')).toHaveCount(faces);
    expect(failures).toEqual([]);
  });

  test('a face grid and a focused face swap places', async ({ page }) => {
    await page.goto(STUDIO);
    const faces = await faceCount(page);
    await expect(page.locator('.face.focused')).toHaveCount(1);
    await page.locator('#grid-toggle').click();
    await expect(page.locator('.face-grid .face')).toHaveCount(faces);
    await expect(page.locator('.face.focused')).toHaveCount(0);
    await page.locator('.face-grid .face').nth(2).click();
    await expect(page.locator('.face.focused')).toHaveCount(1);
    await expect(page.locator('.face-strip .face.current')).toHaveCount(1);
  });

  test('clicking a row on the page finds it in the content list', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.locator('.face.focused .hit').nth(3).click();
    await expect(page.locator('.items li.flash')).toHaveCount(1);
  });

  test('turning a section off re-solves with fewer items', async ({ page }) => {
    await page.goto(STUDIO);
    const all = await counts(page);
    expect(all.included).toBeGreaterThan(0);

    await page.locator('.tree summary input[type=checkbox]').first().uncheck();
    const fewer = await expectIncludedNot(page, all.included);
    expect(fewer.included).toBeLessThan(all.included);
    expect(fewer.total).toBe(all.total);

    await page.locator('.tree summary input[type=checkbox]').first().check();
    await expectIncluded(page, all.included);
  });

  test('a small card takes more faces instead of failing', async ({ page }) => {
    await page.goto(STUDIO);
    const faces = await faceCount(page);
    await expect(page.locator('.face-strip .face')).toHaveCount(faces);
    await page.getByRole('radio', { name: 'Credit card' }).click();
    // Auto takes more pairs rather than reporting an error, and says how many.
    // Counting elements rather than matching "4 faces", which "14 faces" contains.
    await expect.poll(() => page.locator('.face-strip .face').count()).toBeGreaterThan(4);
    await expect(page.locator('#warnings li.error')).toHaveCount(0);
    await expect(page.locator('.face.focused')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: /^Auto/ })).toContainText('·');
  });

  test('a pinned face count that cannot hold the content fails loudly, once', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.getByRole('radio', { name: 'Credit card' }).click();
    await page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: '2', exact: true }).click();
    await expect(page.locator('#status')).toContainText('nothing to lay out');
    // One message in the reader's terms, not that plus the breaker's internals.
    await expect(page.locator('#warnings li.error')).toHaveCount(1);
    await expect(page.locator('#warnings li.error')).toContainText('will not fit');
  });

  test('an unfittable sheet offers fixes that actually fix it', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.getByRole('radio', { name: 'A6' }).click();
    await page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: '2', exact: true }).click();
    await expect(page.locator('#status')).toContainText('nothing to lay out');

    const fix = page.locator('button.fix').first();
    await expect(fix).toContainText('faces instead of 2');
    await fix.click();

    // The remedy was verified before being offered, so it has to clear the error.
    await expect(page.locator('#warnings li.error')).toHaveCount(0);
    await expect(page.locator('.face.focused')).toBeVisible();
  });

  test('balancing is refused, with a reason, while the sheet does not fit', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.getByRole('radio', { name: 'Credit card' }).click();
    await page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: '2', exact: true }).click();
    await expect(page.locator('#status')).toContainText('nothing to lay out');
    await page.locator('#balance').click();
    await expect(page.locator('#diff p')).toContainText('does not fit yet');
  });

  test('auto reports the face count it settled on', async ({ page }) => {
    await page.goto(STUDIO);
    const faces = await faceCount(page);
    const auto = page.getByRole('radiogroup', { name: 'Faces' })
      .getByRole('radio', { name: /^Auto/ });
    await expect(auto).toHaveAttribute('aria-checked', 'true');
    // The point is that Auto reports what it resolved to, not that it resolved to
    // any particular number -- the count follows the content.
    await expect(auto).toContainText(String(faces));

    // Bigger type needs more of them, and auto says so.
    await page.getByRole('radio', { name: 'X-large' }).click();
    await expect.poll(async () => faceCount(page), { timeout: 120_000 })
      .toBeGreaterThan(faces);
    await expect(page.locator('#warnings li.error')).toHaveCount(0);
  });

  test('balancing proposes reasoned additions and applying them adds items', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.getByRole('radio', { name: 'Small' }).click();
    // Whatever it settles on, it must have settled: the balance panel refuses to
    // propose anything while the sheet does not fit.
    await expect(page.locator('#status')).toHaveText(/faces at \d/, { timeout: 90_000 });
    await expect(page.locator('#warnings li.error')).toHaveCount(0);

    // Work down the list the way a person would. Clicking rather than unchecking:
    // a solve blocks the main thread for a few hundred milliseconds, so uncheck's
    // immediate state assertion is a race against that, and what matters here is
    // that the selection ends up right.
    const full = await counts(page);
    const boxes = page.locator('.items input[type=checkbox]');
    const count = await boxes.count();
    for (let i = 0; i < count; i += 9) await boxes.nth(i).click({ force: true });
    const { included: before } = await expectIncludedNot(page, full.included);
    await page.locator('#balance').click();
    await expect(page.locator('#diff')).toBeVisible();
    await expect(page.locator('#diff p')).toContainText('whitespace');
    // Each proposal has to say what it costs and why it was chosen.
    await expect(page.locator('#diff li').first()).toContainText('pt;');

    await page.locator('#diff button.primary').click();
    await expect(page.locator('#diff')).toBeHidden();
    // Applying schedules a debounced re-solve; wait for the count to actually move.
    await expect(page.locator('#counts')).not.toContainText(`${before} of`);
    const after = Number((await page.locator('#counts').textContent())?.match(/(\d+) of/)?.[1]);
    expect(after).toBeGreaterThan(before);
  });

  test('exports a vector PDF, and card-splitting doubles the pages', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();

    const sheet = page.waitForEvent('download');
    await page.locator('#pdf').click();
    expect((await sheet).suggestedFilename()).toBe('chinese-simplified-pocket-guide.pdf');

    await page.getByRole('radio', { name: 'Short edge' }).click();
    await expect(page.locator('.panel-note')).toContainText('four double-sided cards');
    const cards = page.waitForEvent('download');
    await page.locator('#pdf').click();
    expect((await cards).suggestedFilename()).toBe('chinese-simplified-pocket-guide-cards.pdf');
  });

  test('a CSV round trip merges by concept_id instead of duplicating', async ({ page }) => {
    await page.goto(STUDIO);
    const before = await counts(page);

    const out = page.waitForEvent('download');
    await page.locator('#csv-out').click();
    const csv = await (await out).createReadStream();
    let text = '';
    for await (const chunk of csv) text += chunk;

    // Change one gloss and re-import; the count must not move.
    const edited = text.replace('Hello', 'Hi there');
    page.once('dialog', (d) => d.accept());
    await page.locator('#csv-file').setInputFiles({
      name: 'edited.csv', mimeType: 'text/csv', buffer: Buffer.from(edited, 'utf8'),
    });
    await expectIncluded(page, before.included);
    await expect(page.locator('.items li', { hasText: 'Hi there' })).toHaveCount(1);
  });
});

// Registry `status` is editorial intent; only rows on file decide what is offered.
// A language registered with none produced fifteen 404s and a blank sheet that said
// nothing about why. Which languages those are comes from the registry rather than a
// list here, because the list was wrong within a day of being written twice over --
// first Spanish, then Portuguese, each named as untranslated and then translated.
test('Custom takes a card size and a palette of your own', async ({ page }) => {
  await page.goto(STUDIO);
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });
  const before = await faceCount(page);

  // Card: the boxes stay shut until Custom is chosen, then they drive the geometry.
  const cardField = page.locator('.panel-field').filter({ hasText: 'Card' }).first();
  await expect(cardField.locator('.numeric-custom')).toBeHidden();
  await cardField.getByRole('radio', { name: 'Custom' }).click();
  const boxes = cardField.locator('.numeric-box');
  await expect(cardField.locator('.numeric-custom')).toBeVisible();
  // Pre-filled from the card that is already there, so nothing jumps.
  await expect(boxes.first()).toHaveValue('7');
  await expect(boxes.nth(1)).toHaveValue('5');
  await boxes.first().fill('4');
  await boxes.first().dispatchEvent('change');
  await boxes.nth(1).fill('3');
  await boxes.nth(1).dispatchEvent('change');
  // A smaller card needs more faces for the same content, which is the proof the
  // number reached the solver rather than only the input.
  await expect.poll(() => faceCount(page), { timeout: 120_000 })
    .toBeGreaterThan(before);

  // Colours: six swatches, and changing one repaints the sheet without touching
  // the theme's typography.
  const colourField = page.locator('.panel-field').filter({ hasText: 'Colours' }).first();
  await expect(colourField.locator('.swatches')).toBeHidden();
  await colourField.getByRole('radio', { name: 'Custom' }).click();
  await expect(colourField.locator('.swatches')).toBeVisible();
  await expect(colourField.locator('.swatch')).toHaveCount(6);
  /** How many marks on the focused face are painted in a given colour. */
  const painted = (/** @type {string} */ hex) => page.evaluate((want) => [
    ...document.querySelectorAll('.face.focused svg rect'),
  ].filter((r) => (r.getAttribute('fill') ?? '').toLowerCase() === want).length, hex);

  const communication = await painted('#0b67a3');
  expect(communication).toBeGreaterThan(0);
  await colourField.locator('.swatch').first().evaluate((node) => {
    /** @type {HTMLInputElement} */ (node).value = '#008080';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => painted('#008080'), { timeout: 120_000 }).toBe(communication);
  expect(await painted('#0b67a3')).toBe(0);
});

test('the gloss menu offers only languages with rows on file', async ({ page }) => {
  // Every registered language has a pack now, so the negative half of this is
  // served rather than found: one language is hollowed out in the coverage report
  // the page reads. Looping over a list that is empty in practice asserts nothing,
  // and this is the check that stopped the studio offering Spanish glosses, 404ing
  // on fifteen files and rendering a blank sheet in silence.
  const { code, coverage } = withoutPack('ko');
  await page.route('**/data/coverage.json', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(coverage),
  }));

  await page.goto('/customize.html?target=zh-Hans&source=en');
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });

  const offered = await page.locator('#source option').evaluateAll((os) => os.map((o) => o.value));
  for (const lang of translated) {
    if (lang.bcp47 === 'zh-Hans' || lang.bcp47 === code) continue;   // target, and the hollowed one
    expect(offered, `${lang.bcp47} has rows`).toContain(lang.bcp47);
  }
  expect(offered, `${code} was emptied`).not.toContain(code);
  expect(offered).not.toContain('zh-Hans');   // never a gloss into the target
});

test('the tree, the sheet and the term picker all call a section the same thing', async ({ page }) => {
  // Section headings follow the source language, and three separate places render
  // them. The tree and the picker kept using `title_en` after the sheet stopped, so
  // a German reader saw "Sozial + Basics" typeset beside "Social + basics" listed.
  await page.goto('/customize.html?target=ja&source=de');
  await expect(page.locator('.face.focused')).toBeVisible({ timeout: 90_000 });

  const inTree = await page.locator('.tree summary span:not(.count)').first().textContent();
  expect(inTree).toBe('Sozial + Basics');

  await page.locator('details.add-term summary').click();
  const inPicker = await page.locator('#add-section option').first().textContent();
  expect(inPicker).toBe(inTree);

  // And the sheet itself is typeset from the same string.
  const onSheet = await page.locator('.face svg text').evaluateAll(
    (nodes) => nodes.map((n) => n.textContent).filter(Boolean),
  );
  expect(onSheet).toContain('Sozial');
});

