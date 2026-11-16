const assert = require('node:assert/strict');
const Glyphs = require('../glyphs.js');
const Edited = require('../edited-glyphs.js');
/** @typedef {Window & {CardinalStudio: {getProject:()=>any}, PainterModel: typeof import('../model.js')}} StudioWindow */

(async () => {
  const { openPage } = await import('../../../scripts/landing-art/browser.mjs');
  const session = await openPage('motrpac-alphabet/mattlab/');
  const { page, errors } = session;
  try {
    const read = () => page.evaluate(() => {
      const app = /** @type {StudioWindow} */ (/** @type {unknown} */ (window));
      const project = app.CardinalStudio.getProject();
      return { project, doc: project.documents[project.currentGlyph], palettes: app.PainterModel.getPalettes(project) };
    });
    const defaults = (await read()).project;
    for (const glyph of Object.keys(Edited)) {
      assert.deepEqual(defaults.documents[glyph].fills, {...Glyphs.seedFills(glyph)}, 'Exact imported defaults for ' + glyph);
      assert.equal(defaults.documents[glyph].cornerMode, 'manual');
    }
    await page.locator('.palette-row[data-family-id="navy"] .swatch').first().click();
    const before = await read();
    const faceId = Object.keys(before.doc.bindings).find(id => before.doc.bindings[id]?.familyId === 'cardinal');
    assert.ok(faceId);
    const pointForFace = async () => {
      await page.locator(`#${faceId}`).scrollIntoViewIfNeeded();
      return page.locator(`#${faceId}`).evaluate((/** @type {SVGGeometryElement} */ path) => {
      const box = path.getBBox();
      for (let x = 1; x < 10; x++) for (let y = 1; y < 10; y++) {
        const p = new DOMPoint(box.x + box.width*x/10, box.y + box.height*y/10);
        if (path.isPointInFill(p)) {
          const matrix = path.getScreenCTM();
          if (!matrix) throw new Error('Artwork is not on screen');
          const screen = p.matrixTransform(matrix);
          return {x:screen.x,y:screen.y};
        }
      }
      throw new Error('No paintable interior point');
      });
    };
    let point = await pointForFace();
    const otherFamilies = new Set(Object.values(before.doc.bindings).filter(Boolean).map(binding => binding.familyId));
    otherFamilies.delete('cardinal');
    const cycleRows = before.palettes.filter((/** @type {{id:string}} */ row) => !otherFamilies.has(row.id));
    const index = cycleRows.findIndex((/** @type {{id:string}} */ row) => row.id === 'cardinal');
    const next = cycleRows[(index+1)%cycleRows.length];
    const nextAgain = cycleRows[(index+2)%cycleRows.length];
    await page.mouse.click(point.x, point.y, {button:'right'});
    const after = await read();
    for (const [id,binding] of Object.entries(before.doc.bindings)) {
      if (binding?.familyId === 'cardinal') {
        assert.deepEqual(after.doc.bindings[id], {familyId:next.id,shade:binding.shade});
        assert.equal(after.doc.fills[id], next.colors[binding.shade]);
      } else assert.equal(after.doc.fills[id], before.doc.fills[id]);
    }
    assert.equal(after.project.settings.family, before.project.settings.family, 'hovered row is independent of selected brush');
    assert.equal(after.project.settings.brush, before.project.settings.brush);
    await page.locator('#canvasViewport').focus();
    await page.keyboard.press('Control+z');
    assert.deepEqual((await read()).doc.fills, before.doc.fills);
    await page.keyboard.press('Control+Shift+z');
    assert.deepEqual((await read()).doc.fills, after.doc.fills);
    await page.mouse.click(point.x,point.y,{button:'right'});
    const second = await read();
    assert.equal(second.doc.bindings[faceId].familyId,nextAgain.id);
    await page.keyboard.down('Shift');
    await page.mouse.click(point.x,point.y,{button:'right'});
    await page.keyboard.up('Shift');
    const reversed = await read();
    // Shift reverses the destination without merging the two color groups.
    for (const [id,binding] of Object.entries(second.doc.bindings)) {
      if (binding?.familyId === nextAgain.id) {
        assert.deepEqual(reversed.doc.bindings[id],{familyId:next.id,shade:binding.shade});
        assert.equal(reversed.doc.fills[id],next.colors[binding.shade]);
      } else assert.equal(reversed.doc.fills[id],second.doc.fills[id]);
    }
    await page.locator(`.palette-row[data-family-id="${next.id}"] .swatch`).first().click({button:'right'});
    assert.equal((await read()).doc.bindings[faceId].familyId,nextAgain.id);
    assert.equal((await read()).project.settings.brush,before.project.settings.brush);

    // Cycle through every available row and wrap in both directions. Other
    // groups must retain their exact fills and links, even across occupied rows.
    for (const direction of [1, -1]) {
      if (direction < 0) await page.keyboard.down('Shift');
      for (let step = 1; step <= cycleRows.length; step += 1) {
        const current = await read();
        const family = current.doc.bindings[faceId].familyId;
        await page.locator(`.palette-row[data-family-id="${family}"] .swatch`).first().click({button:'right'});
        const cycled = await read();
        const expected = cycleRows[((index+2+direction*step)%cycleRows.length+cycleRows.length)%cycleRows.length];
        for (const [id, binding] of Object.entries(before.doc.bindings)) {
          if (binding?.familyId === 'cardinal') {
            assert.deepEqual(cycled.doc.bindings[id], {familyId:expected.id, shade:binding.shade});
            assert.equal(cycled.doc.fills[id], expected.colors[binding.shade]);
          } else {
            assert.deepEqual(cycled.doc.bindings[id], binding, 'Other color groups remain independent');
            assert.equal(cycled.doc.fills[id], before.doc.fills[id]);
          }
        }
      }
      if (direction < 0) await page.keyboard.up('Shift');
    }

    // Repeated paint clicks include a genuine unlinked white/blank step.
    await page.locator('#whiteTool').click();
    point = await pointForFace();
    await page.mouse.click(point.x, point.y);
    await page.locator('.palette-row[data-family-id="navy"] .swatch').first().click();
    await page.locator('.palette-row[data-family-id="navy"] .swatch').nth(1).click();
    await page.locator('.palette-row[data-family-id="navy"] .swatch').first().click();
    const navy = (await read()).palettes.find((/** @type {{id:string}} */ row) => row.id === 'navy');
    point = await pointForFace();
    for (const fill of [...navy.colors, '#FFFFFF', navy.colors[0]]) {
      await page.mouse.click(point.x, point.y);
      const state = await read();
      assert.equal(state.doc.fills[faceId], fill);
      if (fill === '#FFFFFF') assert.equal(state.doc.bindings[faceId], null);
    }
    await page.keyboard.press('Control+z');
    assert.equal((await read()).doc.fills[faceId], '#FFFFFF');
    await page.keyboard.press('Control+Shift+z');
    assert.equal((await read()).doc.fills[faceId], navy.colors[0]);
    await page.locator('#whiteTool').click();
    point = await pointForFace();
    await page.mouse.click(point.x, point.y);
    await page.mouse.click(point.x, point.y);
    assert.equal((await read()).doc.fills[faceId], '#FFFFFF', 'Explicit White tool remains white');

    // Wheel changes tools only within the artwork, with a threshold for trackpads.
    await page.locator('#paintTool').click();
    /** @param {number} deltaY @param {WheelEventInit} extra */
    const wheel = (deltaY, extra = {}) => page.locator('#canvasViewport').evaluate((/** @type {Element} */ element, /** @type {WheelEventInit} */ init) => {
      const event = new WheelEvent('wheel', {bubbles:true,cancelable:true,...init});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, {deltaY,...extra});
    assert.equal(await wheel(1), true);
    assert.equal((await read()).project.settings.tool, 'paint', 'Tiny trackpad movement does not switch tool');
    const artworkBeforeWheel = (await read()).doc.fills;
    point = await pointForFace();
    await page.mouse.move(point.x, point.y);
    for (const tool of ['white','clear','pick','paint']) {
      await page.waitForTimeout(110);
      await page.mouse.wheel(0, 100);
      await page.waitForFunction((/** @type {string} */ expected) => (/** @type {StudioWindow} */ (/** @type {unknown} */ (window))).CardinalStudio.getProject().settings.tool === expected, tool);
    }
    await page.waitForTimeout(110);
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(() => (/** @type {StudioWindow} */ (/** @type {unknown} */ (window))).CardinalStudio.getProject().settings.tool === 'pick');
    assert.deepEqual((await read()).doc.fills, artworkBeforeWheel, 'Tool cycling does not alter artwork');
    assert.equal(await wheel(100, {ctrlKey:true}), false, 'Pinch/browser zoom is not captured');
    const outside = await page.locator('.app-header').evaluate((/** @type {Element} */ element) => {
      const event = new WheelEvent('wheel', {deltaY:100,bubbles:true,cancelable:true});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(outside, false, 'Page scrolling outside artwork is not captured');
    assert.equal((await read()).project.settings.tool, 'pick');

    // Load an older project: upgrade untouched blank starters, keep deliberate edits,
    // and move edited retired studies out of the ordinary character gallery.
    const legacy = (await read()).project;
    for (const glyph of ['A','D']) {
      legacy.documents[glyph].fills = Object.fromEntries(Object.keys(before.doc.fills).map(id=>[id,'#FFFFFF']));
      legacy.documents[glyph].bindings = {};
      legacy.documents[glyph].seedStatus = 'blank';
      legacy.documents[glyph].touched = glyph === 'D';
    }
    legacy.documents['!'].fills = {...legacy.documents['@original'].fills};
    legacy.documents['!'].seedStatus = 'guess';
    legacy.documents['!'].touched = false;
    legacy.documents['?'].fills = {...legacy.documents['@original'].fills};
    legacy.documents['?'].touched = true;
    legacy.documents['?'].cornerMode = 'manual';
    legacy.documents['@cardinal-slate'] = {...structuredClone(legacy.documents['@original']),glyph:'@cardinal-slate',touched:false};
    legacy.documents['@tonal-weave'] = {...structuredClone(legacy.documents['@original']),glyph:'@tonal-weave',touched:true};
    const buffer = Buffer.from(JSON.stringify(legacy));
    await page.locator('#projectFile').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer});
    await page.waitForFunction(()=>(/** @type {StudioWindow} */ (/** @type {unknown} */ (window))).CardinalStudio.getProject().documents.A.seedStatus==='curated');
    const restored = (await read()).project;
    assert.deepEqual(restored.documents.A.fills, {...Glyphs.seedFills('A')});
    assert.ok(Object.values(restored.documents['!'].fills).every(fill=>fill==='#FFFFFF'));
    assert.deepEqual(restored.documents['?'].fills, legacy.documents['?'].fills);
    assert.ok(Object.values(restored.documents.D.fills).every(fill=>fill==='#FFFFFF'));
    assert.equal(restored.documents['@cardinal-slate'],undefined);
    assert.ok(restored.documents['@tonal-weave'].touched);
    assert.equal(await page.locator('.glyph-card[data-glyph^="@"]:not([data-glyph="@original"])').count(),0);
    await page.selectOption('#galleryFilter','saved');
    assert.equal(await page.locator('.glyph-card[data-glyph="@tonal-weave"]').count(),1);
    await page.waitForTimeout(400);
    await page.reload();
    assert.equal(await page.locator('#galleryFilter').inputValue(),'saved');
    assert.deepEqual(errors,[]);
    console.log('Row remapping, shade/white click cycling, wheel tool selection, history, and safe starter migration pass.');
  } finally { await session.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
