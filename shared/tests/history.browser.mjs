import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const engine = process.env.BROWSER_ENGINE || 'chromium';
const focusPage = (page) => page.evaluate(() => document.activeElement?.blur());

test('Helix presets, both shortcut modifiers, new branches, and native editing', async () => {
  const browser = await openPage('helix/', { engine });
  const { page, errors } = browser;
  try {
    const request = () => page.evaluate(() => window.Helix.getRequest());
    const initial = await request();
    await page.getByRole('button', { name: 'Grooves', exact: true }).click();
    const grooves = await request();
    assert.notDeepEqual(grooves, initial);
    await page.keyboard.press('Control+z'); assert.deepEqual(await request(), initial);
    await page.keyboard.press('Meta+Shift+z'); assert.deepEqual(await request(), grooves);
    await page.keyboard.press('Meta+z');
    await page.getByRole('button', { name: 'Alternating', exact: true }).click();
    const branch = await request();
    await page.keyboard.press('Control+Shift+z'); assert.deepEqual(await request(), branch);
    // The numeric field's undo must not jump to a different preset.
    const number = page.locator('input[type="number"][data-path="helix.turns"]');
    await number.focus(); await number.selectText(); await page.keyboard.type('4');
    await page.keyboard.press('Control+z');
    assert.equal((await request()).helix.alternateSides, true);
    const guards = await page.evaluate(async () => {
      const { bindHistoryShortcuts } = await import('/shared/history.js');
      let calls = 0;
      const dispose = bindHistoryShortcuts({ undo: () => { calls++; return true; }, redo: () => { calls++; return true; } });
      const textarea = document.createElement('textarea'); document.body.append(textarea);
      const dialog = document.createElement('dialog'); dialog.innerHTML = '<button>Inside dialog</button>'; document.body.append(dialog);
      const send = (target, extra = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true, ...extra }));
      send(textarea); send(dialog.firstElementChild); send(document.body, { isComposing: true }); send(document.body, { altKey: true });
      const handled = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }); handled.preventDefault(); document.body.dispatchEvent(handled);
      dispose(); textarea.remove(); dialog.remove(); return calls;
    });
    assert.equal(guards, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Forecast restores table edits, clear, redo and persisted state', async () => {
  const browser = await openPage('forecast-calibration/', { engine });
  const { page, errors } = browser;
  try {
    const count = await page.locator('#rows tr').count();
    await page.getByLabel('Prediction 1', { exact: true }).fill('My forecast');
    await page.locator('#clear-rows').click();
    assert.equal(await page.locator('#rows tr').count(), 0);
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#rows tr').count(), count);
    assert.equal(await page.getByLabel('Prediction 1', { exact: true }).inputValue(), 'My forecast');
    await page.keyboard.press('Control+Shift+z'); assert.equal(await page.locator('#rows tr').count(), 0);
    await page.keyboard.press('Meta+z');
    await page.reload();
    assert.equal(await page.getByLabel('Prediction 1', { exact: true }).inputValue(), 'My forecast');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Hypercube restores dimension plans, face style and camera without recording playback', async () => {
  const browser = await openPage('hypercube/', { engine });
  const { page, errors } = browser;
  try {
    await page.evaluate(() => window.Hypercube.pause());
    await page.locator('#k').selectOption('4');
    await page.waitForFunction(() => document.querySelector('#loading').hidden && window.Hypercube.getRequest().k === 4);
    await page.keyboard.press('Control+z'); assert.equal(await page.locator('#k').inputValue(), '9');
    await page.keyboard.press('Meta+Shift+z'); assert.equal(await page.locator('#k').inputValue(), '4');
    const before = await page.evaluate(() => window.Hypercube.getRequest());
    await page.locator('[data-turn]').first().click();
    const turned = await page.evaluate(() => window.Hypercube.getRequest());
    assert.notDeepEqual(turned.camera, before.camera);
    await page.keyboard.press('Meta+z'); assert.deepEqual((await page.evaluate(() => window.Hypercube.getRequest())).camera, before.camera);
    await page.keyboard.press('Control+Shift+z'); assert.deepEqual((await page.evaluate(() => window.Hypercube.getRequest())).camera, turned.camera);
    await page.evaluate(() => window.Hypercube.play());
    await page.waitForTimeout(150);
    await page.evaluate(() => window.Hypercube.pause());
    await page.keyboard.press('Control+z'); assert.deepEqual((await page.evaluate(() => window.Hypercube.getRequest())).camera, before.camera);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('all thirteen teaching pages restore their canonical seeded requests', async () => {
  const entries = {
    'backpack-fallacy': (p) => { p.scale = 2; },
    'correlation-geometry': (p) => { p.a[0] = 2; },
    'dag-adjustment': (p) => { p.graph.edges[0].coefficient = 0.7; },
    'jacobian-adjustment': (p) => { p.jacobian = true; },
    'marchenko-pastur': (p) => { p.seed = 2; },
    'null-pvalues': (p) => { p.alpha = 0.1; },
    'probability-puzzles': (p) => { p.window = 6; },
    samplers: (p) => { p.seed = 2; },
    'threshold-model': (p) => { p.means[0] = 1; },
    'trait-evolution': (p) => { p.seed = 2; },
    'tree-covariance': (p) => { p.sample.seed = 2; },
    'typical-set': (p) => { p.k = 12; },
    'zscore-outliers': (p) => { p.z = 3; },
  };
  const browser = await openPage('intuitions/backpack-fallacy/', { engine });
  const { page, errors } = browser;
  try {
    for (const [entry, change] of Object.entries(entries)) {
      await page.goto(new URL(`/intuitions/${entry}/`, page.url()).href);
      await page.waitForSelector('html[data-ready="true"]');
      const get = () => page.evaluate(() => window.Intuitions.getRequest());
      const initial = await get();
      const modified = structuredClone(initial); change(modified.params);
      await page.evaluate((request) => window.Intuitions.submit(request), modified);
      const next = await get();
      assert.notDeepEqual(next, initial, entry);
      await focusPage(page);
      await page.keyboard.press('Control+z'); assert.deepEqual(await get(), initial, `${entry}: undo`);
      await page.keyboard.press('Meta+Shift+z'); assert.deepEqual(await get(), next, `${entry}: redo`);
      // A completed worker must not overwrite the restored request.
      await page.waitForTimeout(60);
      assert.deepEqual(await get(), next, `${entry}: settled`);
    }
    await page.locator('#z-range').evaluate((field) => {
      field.value = '4'; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.keyboard.press('Meta+z');
    assert.equal((await page.evaluate(() => window.Intuitions.getRequest())).params.z, 3);
    await page.keyboard.press('Control+Shift+z');
    assert.equal((await page.evaluate(() => window.Intuitions.getRequest())).params.z, 4);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
