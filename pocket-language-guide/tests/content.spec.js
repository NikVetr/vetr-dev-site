import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { counts, expectIncluded } from './counts.js';
import { parseTable } from '../core/csv.js';

const STUDIO = '/customize.html?target=zh-Hans&source=en';

// Which region is still unreviewed is a property of the data, not of the test, and
// it changes every time someone verifies one -- this spec named Singapore and broke
// the day Singapore was checked. So it asks the registry instead: find a language
// that offers both a confirmed region and an unconfirmed one, and drive that.
function withheldExample() {
  const regions = Object.fromEntries(
    parseTable(readFileSync('data/registry/regions.csv', 'utf8')).map((r) => [r.iso3166, r]),
  );
  const languages = parseTable(readFileSync('data/registry/languages.csv', 'utf8'));
  for (const lang of languages.filter((l) => l.status === 'ready')) {
    const codes = lang.regions.split(';').filter(Boolean);
    const unreviewed = codes.find((c) => regions[c]
      && Number(regions[c].confidence) < 2
      && regions[c].emergency_numbers.trim());
    if (unreviewed) return { target: lang.bcp47, region: unreviewed };
  }
  return null;
}

test.describe('local emergency numbers', () => {
  test('are printed only where a fluent speaker has confirmed them', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();

    // China's numbers came from the verified reference sheet, so they print.
    await expect(page.locator('#region')).toHaveValue('CN');
    const onSheet = () => page.evaluate(
      () => [...document.querySelectorAll('.face svg text')]
        .some((t) => t.textContent?.trim() === '110'),
    );
    expect(await onSheet()).toBe(true);

  });

  test('an unconfirmed region is withheld, and the sheet says why', async ({ page }) => {
    const example = withheldExample();
    // Every region being confirmed is a good outcome, not a failing test.
    test.skip(example === null, 'every region on file has been confirmed');
    const { target, region } = /** @type {{target:string, region:string}} */ (example);

    await page.goto(`/customize.html?target=${target}&source=en`);
    await expect(page.locator('.face.focused')).toBeVisible();
    await page.selectOption('#region', region);
    await expect(page.locator('#warnings li.warn', { hasText: 'not been checked' }))
      .toHaveCount(1);
  });
});

test.describe('adding your own term', () => {
  /** Start from a clean slate without clearing it again on later navigations. */
  /** @param {import('@playwright/test').Page} page */
  async function freshStudio(page) {
    await page.goto(STUDIO);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const base = await counts(page);
    expect(base.included).toBeGreaterThan(0);
    return base.included;
  }

  test('reaches the tree and the sheet, and survives a reload', async ({ page }) => {
    const base = await freshStudio(page);

    await page.locator('details.add-term summary').click();
    await page.selectOption('#add-section', 'introductions');
    await page.fill('#add-script', '我住在北京饭店');
    await page.fill('#add-gloss', 'I am staying at the Beijing Hotel');
    await page.getByRole('button', { name: 'Add to the sheet' }).click();

    await expectIncluded(page, base + 1);
    const mine = page.locator('.items li', { hasText: 'Beijing Hotel' });
    await expect(mine).toHaveCount(1);
    await expect(mine.locator('.tag.mine')).toBeVisible();
    await expect(page.locator('.face svg text', { hasText: /^饭$/ }).first()).toBeAttached();

    // Kept in local storage, so a reload does not lose it.
    await page.reload();
    await expectIncluded(page, base + 1);
    await expect(page.locator('.items li', { hasText: 'Beijing Hotel' })).toHaveCount(1);
  });

  test('a half-filled term is refused', async ({ page }) => {
    const base = await freshStudio(page);
    await page.locator('details.add-term summary').click();
    await page.fill('#add-script', '只有一边');
    await page.getByRole('button', { name: 'Add to the sheet' }).click();
    await expect(page.locator('details.add-term p')).toContainText('Both language fields');
    await expectIncluded(page, base);
  });
});

test.describe('entry layout', () => {
  test('one line puts every field on a single row', async ({ page }) => {
    await page.goto(STUDIO);
    await expect(page.locator('.face.focused')).toBeVisible();

    // How far the romanisation sits from the script it belongs to. Side by side
    // stacks them, so it is a line away; one line puts them beside each other, so
    // it is roughly the same baseline. Compared rather than fixed, because the two
    // fields are different sizes and each centres in its own cell.
    const baselineGap = async () => page.evaluate(() => {
      const runs = [...document.querySelectorAll('.face.focused svg text')];
      const script = runs.find((t) => t.textContent === '你');
      const pinyin = runs.find((t) => t.textContent?.trim() === 'nǐ');
      if (!script || !pinyin) return null;
      return Math.abs(Number(pinyin.getAttribute('y')) - Number(script.getAttribute('y')));
    });

    const stacked = await baselineGap();
    expect(stacked).not.toBeNull();

    await page.getByRole('radio', { name: 'One line' }).click();
    // The re-solve is debounced, and the status text does not change, so poll the
    // thing that actually moves rather than a proxy for it.
    await expect.poll(baselineGap).toBeLessThan(/** @type {number} */ (stacked) / 2);
  });
});
