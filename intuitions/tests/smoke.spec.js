import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page @param {string} path */
async function open(page, path) {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  return errors;
}

const overflow = (/** @type {import('@playwright/test').Page} */ page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the index lists every entry with thumbnails and exposes submit', async ({ page }) => {
  const errors = await open(page, './');
  await expect(page.locator('.entry-card')).toHaveCount(10);
  await expect(page.locator('.entry-card .thumb svg')).toHaveCount(10);
  const out = await page.evaluate(() => /** @type {any} */ (window).Intuitions.submit({ entry: 'zscore-outliers', params: { z: 3 } }).params.z);
  expect(out).toBe(3);
  expect(errors).toEqual([]);
});

test('outlier removal: controls, scrubbing and the API drive the figures and table', async ({ page }) => {
  const errors = await open(page, 'zscore-outliers/');
  await expect(page.locator('#density-plot svg')).toBeVisible();
  await expect(page.locator('#table-body tr')).toHaveCount(5);
  await expect(page.locator('#table-body tr').nth(2)).toContainText('5.46%'); // B under pooling at the defaults
  await page.locator('#z-number').fill('3');
  await expect(page.locator('#z-range')).toHaveValue('3');
  await expect(page.locator('#table-body tr').nth(1)).toContainText('0.270%'); // 2Φ(−3)

  // Dragging across the sweep chart sets the swept parameter (mean difference).
  await page.locator('#sweep-plot').scrollIntoViewIfNeeded();
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#sweep-plot svg').boundingBox());
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height * 0.4, { steps: 4 });
  await page.mouse.up();
  expect(Number(await page.locator('#meanDifference-number').inputValue())).toBeLessThan(1);

  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const response = app.submit({ entry: 'zscore-outliers', params: { meanDifference: 3, proportionA: 0.9, sweep: 'z' } });
    let error = null;
    try {
      app.submit({ entry: 'zscore-outliers', params: { z: 9 } });
    } catch (/** @type {any} */ e) {
      error = { name: e.name, code: e.code, path: e.issues[0].path };
    }
    return { b: response.result.groups[1].shareOfPooledRemovals > 0.5, request: app.getRequest(), error };
  });
  expect(api.b).toBe(true);
  expect(api.request).toEqual({ entry: 'zscore-outliers', params: { meanDifference: 3, sdRatio: 1, proportionA: 0.9, z: 2.5, sweep: 'z' } });
  expect(api.error).toEqual({ name: 'IntuitionsError', code: 'invalid_request', path: 'params.z' });
  await expect(page.locator('#meanDifference-number')).toHaveValue('3');
  await expect(page.locator('#sweep')).toHaveValue('z');
  expect(errors).toEqual([]);
});

test('threshold model: drag a threshold, sample two traits, fit the table', async ({ page }) => {
  const errors = await open(page, 'threshold-model/');
  await expect(page.locator('#bars-plot svg rect')).toHaveCount(4);
  const handle = page.locator('#liability-plot circle[data-drag="t0"]');
  await handle.scrollIntoViewIfNeeded();
  const at = /** @type {{ x: number, y: number, width: number, height: number }} */ (await handle.boundingBox());
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x - 80, at.y + at.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(Number(await page.locator('#one-t-0').inputValue())).toBeLessThan(0);

  // A threshold below its neighbour is marked invalid (aria-invalid="true", not ""), and cleared when fixed.
  await page.locator('#one-t-1').fill('-3.9');
  await expect(page.locator('#one-t-1')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#one-error')).toBeVisible();
  await page.locator('#one-t-1').fill('1');
  await expect(page.locator('#one-t-1')).not.toHaveAttribute('aria-invalid');

  await page.getByRole('tab', { name: 'Two traits' }).click();
  await expect(page.locator('#panel-two')).toBeVisible();
  await expect(page.locator('#table-plot .cell-text')).toHaveCount(16);
  await expect(page.locator('#two-stats')).toContainText('Fitted from 300 individuals');
  await page.locator('#two-rho-number').fill('-0.6');
  await expect(page.locator('#two-stats')).toContainText('−0.60');
  await page.locator('#two-k0').selectOption('2');
  await page.locator('#two-k1').selectOption('2');
  await expect(page.locator('#two-stats')).toContainText('cos-π shortcut');

  await page.getByRole('button', { name: "Fit the sample's table" }).click();
  await expect(page.locator('#panel-fit')).toBeVisible();
  await expect(page.locator('#count-grid input')).toHaveCount(4);
  await expect(page.locator('#fit-stats')).toContainText('Tetrachoric correlation');

  await page.locator('#count-grid input').nth(0).fill('0');
  await page.locator('#count-grid input').nth(1).fill('0');
  await expect(page.locator('#fit-issues')).toContainText('Row 0');
  await expect(page.locator('#fit-result')).toBeHidden();

  const fitted = await page.evaluate(() => /** @type {any} */ (window).Intuitions.submit({ entry: 'threshold-model', params: { table: [[40, 10], [15, 35]] } }).result.fit.rho);
  expect(fitted).toBeCloseTo(0.7127, 4);
  await expect(page.locator('#fit-issues')).toBeHidden();
  await expect(page.locator('#count-grid input').nth(0)).toHaveValue('40');
  expect(errors).toEqual([]);
});

test('correlation geometry: panels respond to controls, rotation, cell choice and the API', async ({ page }) => {
  const errors = await open(page, 'correlation-geometry/');
  await expect(page.locator('#arrows-readout')).toContainText('0.327');
  await page.locator('input[name="arrows-n"][value="2"]').check();
  await expect(page.locator('#arrows-readout')).toContainText('can only be 1 or −1');
  await page.locator('input[name="arrows-n"][value="3"]').check();

  // Rotation by keyboard and by drag both change the drawing; numbers do not change.
  const scene = page.locator('#cone-scene');
  await scene.scrollIntoViewIfNeeded();
  const before = await scene.innerHTML();
  await scene.focus();
  await page.keyboard.press('ArrowRight');
  const turned = await scene.innerHTML();
  expect(turned).not.toBe(before);
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await scene.boundingBox());
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4, { steps: 4 });
  await page.mouse.up();
  expect(await scene.innerHTML()).not.toBe(turned);
  await page.getByRole('button', { name: 'Reset view' }).nth(1).click();
  expect(await scene.innerHTML()).toBe(before);
  await expect(page.locator('#cone-readout')).toContainText('0.80 or −0.80');

  await page.locator('#cos-ab-number').fill('0.3');
  await expect(page.locator('#cosine-forced')).toContainText('Either sign');

  await page.locator('#equi-k-number').fill('4');
  await page.getByRole('button', { name: /Go to the limit/ }).click();
  await expect(page.locator('#equi-r-number')).toHaveValue('-0.33');
  await page.locator('#equi-r-number').fill('-0.5');
  await expect(page.locator('#equi-issue')).toContainText('No 4 arrows');
  await page.getByRole('tab', { name: 'One pair at 0' }).click();
  await expect(page.locator('#zero-plot svg')).toBeVisible();

  // Choose a cell, then make the matrix invalid and valid again.
  await page.locator('#entry-grid input[data-cell="1,2"]').focus();
  await expect(page.locator('#entry-readout')).toContainText('BC');
  await page.locator('#entry-grid input[data-cell="0,1"]').fill('-0.9');
  await expect(page.locator('#entry-issues')).toContainText('not positive semidefinite');
  await expect(page.locator('#entry-result')).toBeHidden();
  await page.locator('#entry-grid input[data-cell="0,1"]').fill('0.7');
  await expect(page.locator('#entry-issues')).toBeHidden();

  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const out = app.submit({ entry: 'correlation-geometry', params: { view: 'cosine-rule', rAB: 0.5, rBC: 0.6, rAC: -0.6 } });
    return { interval: out.result.interval, request: app.getRequest().params.view };
  });
  expect(api.interval[0]).toBeCloseTo(0.3 - Math.sqrt(0.75 * 0.64), 12);
  expect(api.request).toBe('cosine-rule');
  await expect(page.locator('#cos-ab-number')).toHaveValue('0.5');
  await expect(page.locator('#cosine-forced')).toContainText('impossible');
  expect(errors).toEqual([]);
});

test('probability mass: the shell, the cube, the water level and the sphere respond, and invalid fields are marked', async ({ page }) => {
  const errors = await open(page, 'typical-set/');
  await expect(page.locator('#shell-readout')).toContainText('between r = 1.99 and 4.28');
  await page.locator('#shell-k-number').fill('1000');
  await expect(page.locator('#shell-k-range')).toHaveValue('3');
  await expect(page.locator('#shell-readout')).toContainText('1,000 dimensions');
  await page.locator('#shell-k-number').fill('2.5');
  await expect(page.locator('#shell-k-number')).toHaveAttribute('aria-invalid', 'true');

  await page.locator('#cube-family').getByText('Cauchy').click();
  await expect(page.locator('#cube-readout')).toContainText('grows like k, not √k');
  await expect(page.locator('#cube-plot circle')).toHaveCount(11);

  await page.getByRole('button', { name: 'Two bumps' }).click();
  await expect(page.locator('#modes-stats')).toContainText('0.00');
  await expect(page.locator('#modes-readout')).toContainText('under 1% of its peak');
  await page.locator('#modes-components input[data-index="0"][data-key="scale"]').fill('0');
  await expect(page.locator('#modes-components input[data-index="0"][data-key="scale"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#modes-issues')).toContainText('Component 1, scale');
  await page.locator('#modes-components input[data-index="0"][data-key="scale"]').fill('1');
  await expect(page.locator('#modes-issues')).toBeHidden();

  await page.locator('#sphere-k-number').fill('3');
  await expect(page.locator('#sphere-readout')).toContainText('Archimedes');
  await expect(page.locator('#sphere-plot rect.hist-bar').first()).toBeVisible();

  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const out = app.submit({ entry: 'typical-set', params: { view: 'shell', k: 100, coverage: 0.5 } });
    return { mode: out.result.mode, request: app.getRequest().params };
  });
  expect(api.mode).toBeCloseTo(Math.sqrt(99), 12);
  expect(api.request).toEqual({ view: 'shell', k: 100, coverage: 0.5, radius: 1 });
  await expect(page.locator('#shell-k-number')).toHaveValue('100');
  expect(errors).toEqual([]);
});

test('adjustment: presets, sets, node clicks, the front door, invalid noise and the API', async ({ page }) => {
  const errors = await open(page, 'dag-adjustment/');
  await expect(page.locator('#adjust-verdict')).toContainText('Biased');
  await page.locator('#adjust-set input[value="Z"]').check();
  await expect(page.locator('#adjust-verdict')).toContainText('✓ Unbiased');
  await expect(page.locator('#adjust-sets tr.current')).toContainText('{Z}');

  await page.locator('#adjust-preset').getByText('Collider').click();
  await expect(page.locator('#adjust-verdict')).toContainText('✓ Unbiased');
  await page.locator('#dag-plot [data-node="C"]').click();
  await expect(page.locator('#adjust-verdict')).toContainText('✗ Biased');
  await expect(page.locator('#adjust-paths')).toContainText('opens the collider');
  await expect(page.locator('#adjust-set input[value="C"]')).toBeChecked();

  await page.locator('#adjust-preset').getByText('Front door').click();
  await expect(page.locator('#adjust-frontdoor')).toContainText('✓ Front door through Tar');
  await expect(page.locator('#adjust-set-hint')).toContainText('Genotype is unobserved');

  await page.locator('#adjust-preset').getByText('Income and happiness').click();
  await page.locator('#adjust-noise').selectOption('standardized');
  await expect(page.locator('#adjust-issues')).toContainText('explain 500% of its variance');
  await page.locator('#adjust-noise').selectOption('unit');
  await expect(page.locator('#adjust-issues')).toBeHidden();
  await page.locator('#edge-0-number').fill('11');
  await expect(page.locator('#edge-0-number')).toHaveAttribute('aria-invalid', 'true');

  await page.locator('#colliders-p-number').fill('1024');
  await expect(page.locator('#colliders-readout')).toContainText('1,024 colliders');

  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const graph = { nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], edges: [{ from: 'A', to: 'B', coefficient: 0.5 }, { from: 'C', to: 'A', coefficient: 0.5 }, { from: 'C', to: 'B', coefficient: 0.5 }] };
    const out = app.submit({ entry: 'dag-adjustment', params: { graph, exposure: 'A', outcome: 'B', adjust: ['C'] } });
    return { effect: out.result.effect, coefficient: out.result.estimate.coefficient, request: app.getRequest().params.exposure };
  });
  expect(api.effect).toBeCloseTo(0.5, 12);
  expect(api.coefficient).toBeCloseTo(0.5, 12);
  expect(api.request).toBe('A');
  await expect(page.locator('#adjust-verdict')).toContainText('✓ Unbiased');
  await expect(page.locator('#dag-plot [data-node="C"] rect')).toHaveClass(/adjusted/);
  expect(errors).toEqual([]);
});

test('null p-values: exact and simulated panels, more replicates, a shared α, invalid fields and the API', async ({ page }) => {
  const errors = await open(page, 'null-pvalues/');
  // Every Monte Carlo panel finishes in its worker.
  await expect(page.locator('.pv-figure[data-stale]')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('#batch-readout')).toContainText('5.70%');
  await expect(page.locator('#stepwise-status')).toContainText('2,000 replicates, seed 1');
  await expect(page.locator('#bootstrap-shortcut svg rect').first()).toBeVisible();

  await page.locator('#batch-treatedShare-number').fill('0.8');
  await expect(page.locator('#batch-readout')).toContainText('The batches account for 36.0%');
  await page.locator('#batch-treatedShare-number').fill('1');
  await expect(page.locator('#batch-issues')).toContainText('cannot be told apart');
  await expect(page.locator('#batch-treatedShare-number')).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Reset' }).first().click();
  await expect(page.locator('#batch-issues')).toBeHidden();

  await page.locator('#stepwise').getByText('σ rescaled').click();
  await expect(page.locator('#stepwise-stats')).toContainText('48', { timeout: 20_000 });
  await page.locator('#pairing-more').click();
  await expect(page.locator('#pairing-replicates')).toHaveValue('100000');
  await expect(page.locator('#pairing-more')).toBeDisabled();
  await expect(page.locator('#pairing-status')).toContainText('100,000 replicates', { timeout: 20_000 });
  await page.locator('#bootstrap-replicates').fill('100000');
  await expect(page.locator('#bootstrap-issues')).toContainText('the most a request may ask for is 1 billion');

  await page.locator('#alpha').fill('0.01');
  await expect(page.locator('#enrichment-readout')).toContainText('p ≤ 0.01');
  await expect(page.locator('#autocorrelation-readout')).toContainText('α = 0.01', { timeout: 20_000 });

  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const out = app.submit({ entry: 'null-pvalues', params: { scenario: 'pairing', meanChange: 0.25, replicates: 2000 } });
    return { paired: out.result.sound.rejectionRate, request: app.getRequest().params };
  });
  expect(api.paired).toBeGreaterThan(0.04);
  expect(api.request).toEqual({ scenario: 'pairing', alpha: 0.05, pairs: 10, betweenSD: 2, changeSD: 0.5, noiseSD: 1, meanChange: 0.25, replicates: 2000, seed: 1 });
  await expect(page.locator('#pairing-readout')).toContainText('true mean change of 0.25');
  await expect(page.locator('#alpha')).toHaveValue('0.05');
  expect(errors).toEqual([]);
});

test('Marchenko–Pastur: noise against the law, spikes past the threshold, the batch on PC 1, and the API', async ({ page }) => {
  const errors = await open(page, 'marchenko-pastur/');
  await expect(page.locator('[id$="-figures"][data-stale]')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('#noise-readout')).toContainText('from 0.466 to 1.735');
  await expect(page.locator('#noise-spectrum rect.hist-bar').first()).toBeVisible();
  await page.locator('#noise-n-number').fill('100');
  await page.locator('#noise-p-number').fill('150');
  await expect(page.locator('#noise-stats')).toContainText('Eigenvalues exactly 0', { timeout: 20_000 });
  await page.locator('#noise-replicates').fill('5000');
  await page.locator('#noise-p-number').fill('500');
  await expect(page.locator('#noise-issues')).toContainText('lower it or n and p');
  await page.locator('#noise-p-number').fill('600');
  await expect(page.locator('#noise-p-number')).toHaveAttribute('aria-invalid', 'true');

  await page.locator('#spikes-s0-number').fill('0.3');
  await expect(page.locator('#spikes-readout')).toContainText('θ = 0.3 stays in the bulk', { timeout: 20_000 });
  await page.locator('#spikes-s2-number').fill('0');
  await expect(page.locator('#spikes-stats')).not.toContainText('θ = 0.5', { timeout: 20_000 });

  await expect(page.locator('#pcs-before svg path.b-dot')).toHaveCount(100);
  await page.locator('#pcs-batchVariance-number').fill('0');
  await expect(page.locator('#pcs-readout')).toContainText('The batch is 0% of each feature', { timeout: 20_000 });
  await page.locator('#pcs-interactions').uncheck();
  await expect(page.locator('#pcs-status')).toContainText('seed 1', { timeout: 20_000 });

  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const out = app.submit({ entry: 'marchenko-pastur', params: { view: 'spikes', spikes: [0.2, 6, 2, 1, 0.1], replicates: 5 } });
    return { spikes: out.result.spikes.map((/** @type {any} */ s) => s.strength), request: app.getRequest().params };
  });
  expect(api.spikes).toEqual([6, 2, 1, 0.2, 0.1]);
  expect(api.request).toEqual({ view: 'spikes', n: 200, p: 100, spikes: [6, 2, 1], replicates: 5, seed: 1 });
  await expect(page.locator('#spikes-s0-number')).toHaveValue('6');
  await expect(page.locator('#spikes-readout')).toContainText('θ = 6', { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('traits on a tree: models, playback, reduced motion, 3-D, the bridge and the API', async ({ page }) => {
  const errors = await open(page, 'trait-evolution/');
  await expect(page.locator('#tree-phenogram svg')).toBeVisible();
  await expect(page.locator('#tree-readout')).toContainText('Brownian motion');
  await page.selectOption('#tree-model', 'ou');
  await expect(page.locator('#tree-readout')).toContainText('Pulled toward θ = 1.50');
  await expect(page.locator('#tree-alpha-number')).toHaveValue('4');
  // Playback runs only when asked, and pauses mid-way with the time front drawn.
  await expect(page.locator('#tree-time-out')).toHaveText('1.00 of 1.00');
  await page.locator('#tree-play').click();
  await expect(page.locator('#tree-play')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1500);
  await page.locator('#tree-play').click();
  const time = Number((await page.locator('#tree-time-out').textContent())?.split(' ')[0]);
  expect(time).toBeGreaterThan(0.02);
  expect(time).toBeLessThan(0.9);
  expect(await page.locator('#tree-pheno-front .front-dot').count()).toBeGreaterThan(1);
  await page.locator('input[name="tree-layout"][value="fan"]').check();
  await expect(page.locator('#tree-tree .front-ring')).toBeVisible();
  // A shift: the clade's paths are drawn in their own class.
  await page.selectOption('#tree-model', 'shift');
  await expect(page.locator('#tree-phenogram .lineage.clade')).toHaveCount(1);
  // A pasted tree that does not parse is marked, and the last result stays, dimmed.
  await page.locator('input[name="tree-source"][value="newick"]').check();
  await page.locator('#tree-newick').fill('((A:1,B:1):1,C:2');
  await page.locator('#tree-apply').click();
  await expect(page.locator('#tree-issues')).toContainText('at character 17');
  await expect(page.locator('#tree-figures')).toHaveAttribute('data-stale', 'true');
  // Two traits: arrow keys turn the scene.
  const before = await page.locator('#bivariate-scene svg').innerHTML();
  await page.locator('#bivariate-scene').focus();
  await page.keyboard.press('ArrowLeft');
  expect(await page.locator('#bivariate-scene svg').innerHTML()).not.toBe(before);
  // The bridge: the islands preset and the exact method.
  await page.locator('[data-bridge-preset="dumbbell"]').click();
  await expect(page.locator('#bridge-note')).toContainText('Approximate.');
  await page.locator('input[name="bridge-method"][value="whole-path"]').check();
  await expect(page.locator('#bridge-note')).toContainText('Exact for the drawn points.');
  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const r = app.submit({ entry: 'trait-evolution', params: { view: 'bivariate', seed: 4 } });
    return { tips: r.result.tips.length, request: app.getRequest() };
  });
  expect(api.tips).toBe(3);
  expect(api.request.params.seed).toBe(4);
  await expect(page.locator('#bivariate-seed')).toHaveValue('4');
  expect(errors).toEqual([]);
});

test('traits on a tree: with reduced motion asked for, playback moves in steps', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await open(page, 'trait-evolution/');
  await expect(page.locator('#tree-reduced')).toBeVisible();
  await page.locator('#tree-play').click();
  await page.waitForTimeout(1500);
  const time = Number((await page.locator('#tree-time-out').textContent())?.split(' ')[0]);
  expect(Math.round(time * 10) / 10).toBeCloseTo(time, 9); // tenths of the height
  await page.locator('#tree-play').click();
  expect(errors).toEqual([]);
});

test('a tree is a covariance matrix: shared paths, re-rooting, pruning steps and the API', async ({ page }) => {
  const errors = await open(page, 'tree-covariance/');
  await expect(page.locator('#covariance-readout')).toContainText('B and C share 40');
  await page.locator('#covariance-matrix button[data-i="A"][data-j="B"]').click();
  await expect(page.locator('#covariance-readout')).toContainText('share no branch');
  await expect(page.locator('#covariance-matrix button[data-i="A"][data-j="B"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#covariance-length-2').fill('60'); // D's branch
  await expect(page.locator('#covariance-newick')).toHaveValue('(A:50,(B:30,C:35)D:60)E;');
  // Every rooting: the restricted likelihood does not move.
  for (const name of ['At A', 'At B', 'Halfway along v₄', 'Halfway along v₃', 'At E']) {
    await page.locator('#reroot-presets').getByRole('button', { name }).click();
    await expect(page.locator('#reroot-stats dd').first()).toHaveText('−5.263');
  }
  await page.locator('#pruning-next').click();
  await expect(page.locator('#pruning-count')).toHaveText('Step 2 of 2');
  await expect(page.locator('#pruning-readout')).toContainText('add up to −5.263');
  await page.locator('#pruning-value-A').fill('1');
  await expect(page.locator('#pruning-stats dd').first()).not.toHaveText('−5.263');
  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const r = app.submit({ entry: 'tree-covariance', params: { view: 'reroot', root: { node: 'D', fraction: 0.5 } } });
    return { reml: r.result.reml, request: app.getRequest() };
  });
  expect(api.reml).toBeCloseTo(-5.262901333, 8);
  expect(api.request.params.root).toEqual({ node: 'D', fraction: 0.5 });
  await expect(page.locator('#reroot-fraction-number')).toHaveValue('0.5');
  expect(errors).toEqual([]);
});

test('the backpack fallacy: priors, sizes, the shared p-value, the script\'s average and the API', async ({ page }) => {
  const errors = await open(page, 'backpack-fallacy/');
  await expect(page.locator('#curves-plot svg')).toBeVisible();
  await expect(page.locator('#at-readout')).toContainText('96% against 16');
  await expect(page.locator('#at-table tbody tr')).toHaveCount(5);
  await expect(page.locator('#curves-figures')).not.toHaveAttribute('data-stale', 'true');
  // A normal prior with small effects: the backpack reasoning fails.
  await page.locator('input[name="curves-prior"][value="normal"]').check();
  await page.locator('#curves-scale-number').fill('0.25');
  await expect(page.locator('#at-readout')).toContainText('Here it fails');
  // A preset p-value redraws panel 2 and moves the line in panel 1.
  await page.getByRole('button', { name: '0.001', exact: true }).click();
  await expect(page.locator('#at-at-number')).toHaveValue('3');
  await expect(page.locator('#at-readout')).toContainText('p = 0.001');
  // Dragging across panel 1 sets the p-value.
  await page.locator('#curves-plot').scrollIntoViewIfNeeded();
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#curves-plot svg').boundingBox());
  await page.mouse.move(box.x + 60, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(Number(await page.locator('#at-at-number').inputValue())).toBeGreaterThan(3);
  // Sizes that repeat are marked; the last figure stays, dimmed.
  await page.locator('#curves-sizes').fill('2, 2');
  await expect(page.locator('#curves-issues')).toContainText('lists a group size twice');
  await expect(page.locator('#curves-sizes')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#curves-figures')).toHaveAttribute('data-stale', 'true');
  await page.locator('#curves-sizes').fill('4, 40, 400');
  await expect(page.locator('#at-table tbody tr')).toHaveCount(3);
  await page.locator('#curves-windowed').check();
  await expect(page.locator('#curves-legend')).toContainText('sliding average');
  await expect(page.locator('#curves-plot .k-line.dashed')).toHaveCount(2);
  const api = await page.evaluate(() => {
    const app = /** @type {any} */ (window).Intuitions;
    const r = app.submit({ entry: 'backpack-fallacy', params: { sizes: [2, 16], upTo: 3, window: 0, at: 1.30103 } });
    return { pairs: r.result.pairs.length, request: app.getRequest() };
  });
  expect(api.pairs).toBe(1);
  expect(api.request.params).toEqual({ prior: 'cauchy', scale: 1, sizes: [2, 16], upTo: 3, window: 0, at: 1.30103 });
  await expect(page.locator('#curves-sizes')).toHaveValue('2, 16');
  await expect(page.locator('#at-readout')).toContainText('p = 0.05');
  expect(errors).toEqual([]);
});

test('every page and view fits a 390 px phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['./', 'zscore-outliers/', 'correlation-geometry/', 'typical-set/', 'dag-adjustment/', 'null-pvalues/', 'marchenko-pastur/', 'trait-evolution/', 'tree-covariance/', 'backpack-fallacy/']) {
    await open(page, path);
    expect(await overflow(page)).toBe(0);
  }
  await open(page, 'threshold-model/');
  for (const tab of ['One trait', 'Two traits', 'From a table']) {
    await page.getByRole('tab', { name: tab }).click();
    expect(await overflow(page), tab).toBe(0);
  }
  await page.locator('#fit-rows').selectOption('6');
  await page.locator('#fit-cols').selectOption('6');
  expect(await overflow(page)).toBe(0);
  await open(page, 'correlation-geometry/');
  await page.locator('#entry-p').selectOption('8');
  await page.getByRole('tab', { name: 'One pair at 0' }).click();
  expect(await overflow(page)).toBe(0);
});
