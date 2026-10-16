import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { referenceSpec } from '../scripts/spec.mjs';
import { parseTable } from '../core/csv.js';

test('an imported palette is refused and an old stored payload stays inert in the actual preview', async ({ page }) => {
  const attack = '#000000"/><image href="x" onerror="globalThis.__injected=1"/><rect fill="#000000';
  const spec = await referenceSpec('es', 'en', { themeColors: { ink: attack }, scale: 1, autoFaces: false });
  const sections = parseTable(await readFile('data/registry/sections.csv', 'utf8'));
  spec.selection.sections = Object.fromEntries(sections.map(({ section_id: id }) => [id, id === 'social-basics']));
  await page.goto('/');
  const accepted = await page.evaluate(async (spec) => {
    const { readExport } = await import('./ui/saved-cards.js');
    const card = { name: 'test', at: 1, target: 'es', source: 'en', spec,
      finish: { mode: '', flip: 'short-edge' }, dpi: 300,
      summary: { sections: 1, items: 2, faces: 2, width: 504, height: 360 } };
    const result = readExport(JSON.stringify({ kind: 'wanderwart-card', version: 1, card }));
    // Simulate data already stored by a previous version, bypassing the new import gate.
    localStorage.setItem('plg.studio.es__en', JSON.stringify({ spec, finish: card.finish, dpi: card.dpi }));
    return result.ok;
  }, spec);
  expect(accepted).toBe(false);
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.face.focused svg')).toBeVisible();
  await expect(page.locator('svg image[onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__injected)).toBeUndefined();
  expect(await page.locator('.face.focused svg text').evaluateAll((nodes) => nodes.some((node) =>
    node.getAttribute('fill')?.includes('<image')))).toBe(true);
});

test('a partial geometry in an exported card inherits the other default dimensions', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('plg.studio.es__en', JSON.stringify({
    spec: { geometry: { pageW: 504 } }, finish: { mode: '', flip: 'short-edge' }, dpi: 300,
  })));
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.face.focused svg')).toBeVisible();
  expect(await page.locator('.face.focused svg').getAttribute('viewBox')).toBe('0 0 504 360');
});
