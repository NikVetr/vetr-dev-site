const { test, expect } = require('@playwright/test');

test.setTimeout(90000);
test.use({ viewport: { width: 1920, height: 1080 } });

test.beforeEach(async ({ page }) => {
  // Observe module-local state without adding a production debugging API.
  await page.route('**/main.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
      window.__colorTest = { state, get ui() { return ui; },
        redraw: () => { redrawMainColorWheels(); drawStatusMini(state, ui, currentVizOpts()); } };` });
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__colorTest?.ui?.panelMap?.none?.wheelMeta);
});

async function configureRun(page, colors = 3, runs = 2, iterations = 30) {
  await page.fill('#seed-input', '45');
  await page.fill('#colors-to-add', String(colors));
  await page.fill('#optim-runs', String(runs));
  await page.fill('#nm-iters', String(iterations));
}

async function finishRun(page) {
  await page.click('#run-btn');
  await expect(page.locator('#status-state')).toHaveText('Finished', { timeout: 60000 });
  await expect(page.locator('#error-text')).toBeEmpty();
}

async function wheelCoordinates(page, offsets) {
  await page.locator('#panels canvas').first().scrollIntoViewIfNeeded();
  return page.evaluate((offsets) => {
    const { canvas, wheelMeta: m } = window.__colorTest.ui.panelMap.none;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / (canvas.width / devicePixelRatio);
    return offsets.map(([x, y]) => ({ x: rect.left + (m.cx + x * m.radius) * scale,
      y: rect.top + (m.cy + y * m.radius) * scale }));
  }, offsets);
}

async function drawCustomRectangle(page) {
  const [start, end] = await wheelCoordinates(page, [[-0.15, -0.12], [0.2, 0.18]]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#constraint-topology')).toHaveValue('custom');
}

async function countMarkerPixels(page) {
  return page.locator('#status-mini').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let gold = 0, red = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b, a] = pixels.slice(i, i + 4);
      if (a > 160 && r > 220 && g > 150 && g < 215 && b < 95) gold++;
      if (a > 160 && r > 180 && g < 70 && b < 70) red++;
    }
    return { gold, red };
  });
}

test('default optimization preserves feasible paths and top-layer stars', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await configureRun(page);
  await finishRun(page);
  const result = await page.evaluate(async () => {
    const { state } = window.__colorTest;
    const { normalizeWithRange } = await import('/core/colorSpaces.js');
    const { normSatisfiesHardConstraints } = await import('/core/hardConstraints.js');
    return { colors: state.newColors, trails: state.nmTrails.length,
      feasible: state.rawNewColors.every((raw) => normSatisfiesHardConstraints(
        normalizeWithRange(raw, state.bounds.ranges, 'oklab'), state.bounds.constraintSets, 'contiguous')) };
  });
  expect(result.colors).toHaveLength(3);
  expect(new Set(result.colors).size).toBe(3);
  expect(result.trails).toBeGreaterThan(0);
  expect(result.feasible).toBe(true);
  expect((await countMarkerPixels(page)).gold).toBeGreaterThan(80);
  expect(errors).toEqual([]);
  await page.locator('#status-mini').screenshot({ path: testInfo.outputPath('default-paths.png') });
});

test('drawing after a colorspace switch replaces stale custom constraints', async ({ page }, testInfo) => {
  await page.click('#palette-clear');
  await drawCustomRectangle(page);
  expect(await page.evaluate(() => window.__colorTest.state.customConstraints.space)).toBe('oklab');
  await page.selectOption('#color-space', 'lab');
  expect(await page.evaluate(() => window.__colorTest.state.customConstraints))
    .toEqual({ space: 'lab', values: [], widths: {} });
  await drawCustomRectangle(page);
  expect(await page.evaluate(() => window.__colorTest.state.customConstraints.space)).toBe('lab');
  await configureRun(page, 2);
  await finishRun(page);
  expect(await page.evaluate(async () => {
    const { state } = window.__colorTest;
    const { normalizeWithRange } = await import('/core/colorSpaces.js');
    const { normSatisfiesHardConstraints } = await import('/core/hardConstraints.js');
    return state.rawNewColors.every((raw) => normSatisfiesHardConstraints(
      normalizeWithRange(raw, state.bounds.ranges, 'lab'), state.bounds.constraintSets, 'custom'));
  })).toBe(true);
  await page.locator('#panels').screenshot({ path: testInfo.outputPath('custom-lab-panels.png') });
  // A deliberately inconsistent diagnostic point must remain visible and be flagged.
  await page.evaluate(() => {
    const { state, redraw } = window.__colorTest;
    state.bestColors = ['#FF0000'];
    state.rawBestColors = [{ l: 50, a: 65, b: 40 }];
    redraw();
  });
  const pixels = await countMarkerPixels(page);
  expect(pixels.gold).toBeGreaterThan(20);
  expect(pixels.red).toBeGreaterThan(20);
  await page.locator('#status-mini').screenshot({ path: testInfo.outputPath('flagged-star.png') });
});

test('tweak defaults synchronize spaces and untoggling clears auto constraints', async ({ page }) => {
  await page.fill('#palette-input', '#4477AA, #CC6677');
  await page.uncheck('#sync-colorspaces');
  await page.selectOption('#colorwheel-space', 'lab');
  await page.click('#palette-tweak-all');
  await expect(page.locator('#colorwheel-space')).toHaveValue('oklab');
  const local = await page.evaluate(() => window.__colorTest.state.perInputConstraints);
  expect(local.autoEnabledForTweaks).toBe(true);
  expect(local.modes).toEqual(['soft', 'soft']);
  for (const widths of Object.values(local.widths)) expect(widths).toEqual([0.85, 0.85]);
  await configureRun(page, 1);
  await finishRun(page);
  expect(await page.evaluate(() => window.__colorTest.state.optimizedColorRoles.map((row) => row.kind)))
    .toEqual(['tweak', 'tweak', 'add']);
  await page.click('#palette-tweak-all');
  expect(await page.evaluate(() => window.__colorTest.state.tweakInputIndices)).toEqual([]);
  expect(await page.evaluate(() => window.__colorTest.state.perInputConstraints.enabled)).toBe(false);
});

test('STOP keeps completed restarts and RESET rejects late optimizer callbacks', async ({ page }) => {
  await configureRun(page, 2, 100, 50);
  await page.click('#run-btn');
  await page.waitForFunction(() => window.__colorTest.state.bestScores.length >= 1);
  await page.click('#run-btn');
  await expect(page.locator('#run-btn')).toHaveText('RUN', { timeout: 30000 });
  expect(await page.evaluate(() => window.__colorTest.state.newColors.length)).toBe(2);
  await page.click('#run-btn');
  await page.waitForFunction(() => window.__colorTest.state.running);
  await page.click('#reset-btn');
  await expect(page.locator('#status-state')).toHaveText('Waiting to run');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => ({ running: window.__colorTest.state.running,
    colors: window.__colorTest.state.newColors, results: window.__colorTest.state.runResults })))
    .toEqual({ running: false, colors: [], results: [] });
});

test('desktop settings and workspace scroll independently', async ({ page }) => {
  const result = await page.evaluate(() => {
    const controls = document.querySelector('.controls');
    const workspace = document.querySelector('.right-side');
    controls.scrollTop = 200;
    return { settingsScroll: controls.scrollTop, workspaceScroll: workspace.scrollTop,
      settingsOverflow: getComputedStyle(controls).overflowY, workspaceOverflow: getComputedStyle(workspace).overflowY };
  });
  expect(result.settingsScroll).toBeGreaterThan(0);
  expect(result.workspaceScroll).toBe(0);
  expect(result.settingsOverflow).toBe('auto');
  expect(result.workspaceOverflow).toBe('auto');
});

test('hue and chroma edge drags follow the pointer on a scaled canvas', async ({ page }) => {
  await page.click('#palette-clear');
  await page.selectOption('#color-space', 'oklch');
  await page.locator('#w-h').fill('0.4');
  await page.locator('#w-sc').fill('0.5');
  await page.locator('#panels canvas').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const { canvas } = window.__colorTest.ui.panelMap.none;
    canvas.style.transform = 'scale(0.85)';
    canvas.style.transformOrigin = 'top left';
  });
  for (const channel of ['c', 'h']) {
    const drag = await page.evaluate((ch) => {
      const { state, ui } = window.__colorTest;
      const { canvas, wheelMeta: m } = ui.panelMap.none;
      const bounds = state.bounds.boundsByName;
      const [lo, hi] = ch === 'h' ? state.bounds.boundsH : bounds.c;
      const target = ch === 'h' ? lo + 0.04 : lo + (hi - lo) * 0.7;
      const r = canvas.getBoundingClientRect();
      const scale = r.width / (canvas.width / devicePixelRatio);
      const point = (h, c) => {
        const radius = c * state.bounds.ranges.max.c / m.ranges.max.c * m.radius;
        return { x: r.left + (m.cx + Math.cos(h * 2 * Math.PI) * radius) * scale,
          y: r.top + (m.cy + Math.sin(h * 2 * Math.PI) * radius) * scale };
      };
      const h = (state.bounds.boundsH[0] + state.bounds.boundsH[1]) / 2;
      const c = (bounds.c[0] + bounds.c[1]) / 2;
      return { lo, hi, target, start: ch === 'h' ? point(lo, c) : point(h, hi),
        end: ch === 'h' ? point(target, c) : point(h, target) };
    }, channel);
    await page.mouse.move(drag.start.x, drag.start.y);
    await page.mouse.down();
    await page.mouse.move(drag.end.x, drag.end.y, { steps: 4 });
    await page.mouse.up();
    const actual = await page.evaluate((ch) => window.__colorTest.state.sliderConstraintBounds?.bounds[ch], channel);
    expect(actual).toBeDefined();
    expect(actual[channel === 'h' ? 0 : 1]).toBeCloseTo(drag.target, 2);
    expect(actual[channel === 'h' ? 1 : 0]).toBeCloseTo(channel === 'h' ? drag.hi : drag.lo, 6);
  }
});

test('custom channel-bar boundaries and marker preview before mouseup', async ({ page }) => {
  await page.click('#palette-clear');
  await page.selectOption('#constraint-topology', 'custom');
  const bar = page.locator('#panels .channel-bar').nth(1);
  await bar.scrollIntoViewIfNeeded();
  const rect = await bar.boundingBox();
  const x = rect.x + rect.width / 2;
  await page.mouse.move(x, rect.y + rect.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(x, rect.y + rect.height * 0.65, { steps: 5 });
  expect(await page.evaluate(() => Boolean(window.__colorTest.state.customConstraintPreview))).toBe(true);
  await expect(bar.locator('.channel-dot[data-role="constraint"]')).toHaveCount(1);
  await page.mouse.up();
  expect(await page.evaluate(() => window.__colorTest.state.customConstraintPreview)).toBeNull();
  expect(await page.evaluate(() => window.__colorTest.state.customConstraints.values.length)).toBe(1);
});
