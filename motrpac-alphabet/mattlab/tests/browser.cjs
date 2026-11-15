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
    assert.equal(await page.locator('.studio-links a').first().getAttribute('href'), '../');
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
    const saved = await download('#saveProject');
    const project = JSON.parse(saved.toString());
    assert.equal(project.documents[project.currentGlyph].fills[id], '#123456');
    const svg = (await download('#exportSvg')).toString();
    assert.ok(svg.includes('fill="#123456"'));
    const png = await download('#exportPng');
    assert.deepEqual([...png.subarray(0,8)], [137,80,78,71,13,10,26,10]);
    await page.locator('#sheetScope').selectOption('saved');
    const sheet = (await download('#sheetSvgBtn')).toString();
    assert.ok(sheet.includes('<svg'));
    assert.ok(sheet.includes('#123456'));
    const sheetPng = await download('#sheetPngBtn');
    assert.deepEqual([...sheetPng.subarray(0,8)], [137,80,78,71,13,10,26,10]);

    // Import via the existing file control, then verify reload persistence.
    await page.locator('#projectFile').setInputFiles({name:'study.json',mimeType:'application/json',buffer:saved});
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(id => window.CardinalStudio.getFills()[id], id), '#123456');
    await page.reload();
    await page.waitForFunction(() => !!window.CardinalStudio);
    assert.equal(await page.evaluate(id => window.CardinalStudio.getFills()[id], id), '#123456');
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
