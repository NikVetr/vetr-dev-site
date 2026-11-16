const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const {openPage} = await import('../../../scripts/landing-art/browser.mjs');
  const output = path.resolve(__dirname, '../../../tmp/output/mattlab-integration');
  await fs.mkdir(output, {recursive:true});
  const session = await openPage('motrpac-alphabet/mattlab/', {width:1440,height:900});
  const {page, errors} = session;
  try {
    await page.waitForFunction(() => !!window.CardinalStudio);
    assert.equal(await page.locator('#editor-switch').getAttribute('role'), 'switch');
    assert.equal(await page.locator('#editor-switch').getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('.glyph-card[data-glyph="@original"]').count(), 0);
    assert.equal(await page.locator('#nv1Btn,#nv2Btn,#cardinalBtn').count(), 0);
    assert.equal(await page.locator('#galleryFilter').inputValue(), 'designs');
    assert.equal(await page.locator('#glyphStrip .glyph-card').count(), 3);
    assert.equal(await page.locator('.glyph-card[data-glyph="@cardinal"]').count(), 0);
    await page.selectOption('#galleryFilter', 'uppercase');
    assert.equal(await page.locator('#glyphStrip .glyph-card').count(), 26);
    assert.equal(await page.locator('#glyphStrip .glyph-card[data-glyph^="@"]').count(), 0);
    await page.selectOption('#galleryFilter', 'designs');
    for (const name of ['original-warm','nv-2','nv-1']) {
      await page.locator(`.glyph-card[data-glyph="@${name}"]`).click();
      const fills = await page.evaluate(() => (/** @type {Window & {CardinalStudio:{getFills:()=>Record<string,string>}}} */ (/** @type {unknown} */ (window))).CardinalStudio.getFills());
      assert.equal(fills['inner-fillet-upper-right'], fills['face-gray_top']);
      assert.equal(fills['inner-fillet-lower-left'], fills['face-red_left']);
      await page.mouse.move(10, 10);
      await page.locator('#artworkHost').screenshot({path:path.join(output,name+'.png')});
    }
    const first = page.locator('#artworkHost .paintable').first();
    const id = await first.getAttribute('id');
    const initial = await page.evaluate(id => window.CardinalStudio.getFills()[id], id);
    await page.locator('#customHex').fill('#123456');
    await page.locator('#customHex').press('Enter');
    // Activate the real SVG face through its existing keyboard interaction.
    await first.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(id => window.CardinalStudio.getFills()[id], id), '#123456');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(id => window.CardinalStudio.getFills()[id], id), initial);
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.evaluate(id => window.CardinalStudio.getFills()[id], id), '#123456');

    async function download(button) {
      const pending = page.waitForEvent('download');
      await page.locator(button).click();
      const file = await pending;
      assert.equal(await file.failure(), null);
      return fs.readFile(await file.path());
    }
    assert.equal(await page.locator('#whiteTool').count(), 0);
    await page.locator('#backgroundColor').fill('#152238');
    await page.locator('#backgroundColor').dispatchEvent('input');
    assert.equal(await page.locator('#editor-guides').getAttribute('stroke'), '#FFFFFF');
    assert.equal(await page.locator('#canvasViewport').evaluate((/** @type {Element} */ el) => getComputedStyle(el).backgroundColor), 'rgb(21, 34, 56)');
    await page.locator('#canvasBackground').selectOption('checker');
    assert.equal(await page.locator('#canvasViewport').evaluate((/** @type {Element} */ el) => el.classList.contains('checker')), true);
    await page.locator('#canvasBackground').selectOption('color');
    assert.equal(await page.locator('#backgroundColor').inputValue(), '#152238');
    const saved = await download('#saveProject');
    const project = JSON.parse(saved.toString());
    assert.equal(project.documents[project.currentGlyph].fills[id], '#123456');
    const svg = (await download('#exportSvg')).toString();
    assert.ok(svg.includes('fill="#123456"'));
    assert.doesNotMatch(svg, /id="background"/);
    await page.locator('#exportTransparent').uncheck();
    const opaque = (await download('#exportSvg')).toString();
    assert.match(opaque, /id="background"[^>]+fill="#152238"/);
    const png = await download('#exportPng');
    assert.deepEqual([...png.subarray(0,8)], [137,80,78,71,13,10,26,10]);
    await page.locator('#sheetScope').selectOption('saved');
    const sheet = (await download('#sheetSvgBtn')).toString();
    assert.ok(sheet.includes('<svg'));
    assert.ok(sheet.includes('#123456'));
    assert.ok(sheet.includes('fill="#152238"'));
    assert.ok(sheet.includes('stroke="#FFFFFF"'));
    const sheetPng = await download('#sheetPngBtn');
    assert.deepEqual([...sheetPng.subarray(0,8)], [137,80,78,71,13,10,26,10]);

    // Omit genuinely blank cells, including intentionally erased imported glyphs.
    await page.locator('#sheetScope').selectOption('digits');
    await page.locator('#sheetNonblankOnly').check();
    const compactSheet = (await download('#sheetSvgBtn')).toString();
    assert.match(compactSheet, /Character sheet containing 9 studies/);
    assert.doesNotMatch(compactSheet, /aria-label="3"/);
    const compactPng = await download('#sheetPngBtn');
    assert.deepEqual([...compactPng.subarray(0,8)], [137,80,78,71,13,10,26,10]);
    await page.locator('#sheetNonblankOnly').uncheck();
    assert.match((await download('#sheetSvgBtn')).toString(), /Character sheet containing 10 studies/);
    await page.locator('#sheetNonblankOnly').check();
    await page.waitForTimeout(400);
    await page.reload();
    assert.equal(await page.locator('#sheetNonblankOnly').isChecked(),true);

    // Import via the existing file control, then verify reload persistence.
    await page.locator('#projectFile').setInputFiles({name:'study.json',mimeType:'application/json',buffer:saved});
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(id => window.CardinalStudio.getFills()[id], id), '#123456');
    await page.reload();
    await page.waitForFunction(() => !!window.CardinalStudio);
    assert.equal(await page.evaluate(id => window.CardinalStudio.getFills()[id], id), '#123456');
    assert.equal(await page.locator('#backgroundColor').inputValue(), '#152238');
    assert.equal(await page.locator('#editor-guides').getAttribute('stroke'), '#FFFFFF');
    await page.locator('#cornerMode').selectOption('auto');
    await page.locator('.palette-row[data-family-id="slate"] .swatch').nth(2).click();
    await page.locator('#face-gray_top').focus();
    await page.keyboard.press('Enter');
    const cornerFills = await page.evaluate(() => (/** @type {Window & {CardinalStudio:{getFills:()=>Record<string,string>}}} */ (/** @type {unknown} */ (window))).CardinalStudio.getFills());
    assert.equal(cornerFills['inner-fillet-upper-right'], cornerFills['face-gray_top']);
    assert.notEqual(cornerFills['inner-fillet-upper-right'], cornerFills['face-red_top-right-leg-cell-2']);
    await page.screenshot({path:path.join(output,'desktop-dark-background.png'), fullPage:true});
    await page.locator('#backgroundColor').fill('#ffffff');
    await page.locator('#backgroundColor').dispatchEvent('input');
    assert.equal(await page.locator('#editor-guides').getAttribute('stroke'), '#172D38');
    await page.screenshot({path:path.join(output,'desktop.png'), fullPage:true});

    for (const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow at ' + width);
      const headerFits = await page.locator('.app-header').evaluate(el => [...el.children].every(c => c.getBoundingClientRect().right <= innerWidth));
      assert.ok(headerFits, 'Header stays inside viewport at ' + width);
      const separateControls = await page.evaluate(() => {
        const a = document.querySelector('.tool-section').getBoundingClientRect();
        const b = document.querySelector('.custom-color-row').getBoundingClientRect();
        return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      });
      assert.ok(separateControls, 'Brush and custom color controls do not overlap at ' + width);
      await page.screenshot({path:path.join(output,'mobile-' + width + '.png'), fullPage:true});
    }
    assert.deepEqual(errors, []);
    console.log('Mattlab browser workflow passed: painting, undo/redo, project import/persistence, SVG/PNG/sheet exports, desktop and mobile layout.');
  } finally { await session.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
