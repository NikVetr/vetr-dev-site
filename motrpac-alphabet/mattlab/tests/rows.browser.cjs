const assert = require('node:assert/strict');
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
    await page.locator('.palette-row[data-family-id="navy"] .swatch').first().click();
    const before = await read();
    const faceId = Object.keys(before.doc.bindings).find(id => before.doc.bindings[id]?.familyId === 'cardinal');
    assert.ok(faceId);
    const point = await page.locator(`#${faceId}`).evaluate((/** @type {SVGGeometryElement} */ path) => {
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
    const index = before.palettes.findIndex((/** @type {{id:string}} */ row) => row.id === 'cardinal');
    const next = before.palettes[(index+1)%before.palettes.length];
    const nextAgain = before.palettes[(index+2)%before.palettes.length];
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
    // Moving into an occupied row combines its pieces, as dragging a row marker does.
    // Shift reverses the destination; Undo (checked above) restores the prior grouping.
    for (const [id,binding] of Object.entries(second.doc.bindings)) {
      if (binding?.familyId === nextAgain.id) {
        assert.deepEqual(reversed.doc.bindings[id],{familyId:next.id,shade:binding.shade});
        assert.equal(reversed.doc.fills[id],next.colors[binding.shade]);
      } else assert.equal(reversed.doc.fills[id],second.doc.fills[id]);
    }
    await page.locator(`.palette-row[data-family-id="${next.id}"] .swatch`).first().click({button:'right'});
    assert.equal((await read()).doc.bindings[faceId].familyId,nextAgain.id);
    assert.equal((await read()).project.settings.brush,before.project.settings.brush);

    // Load an older project: upgrade untouched blank starters, keep deliberate edits,
    // and move edited retired studies out of the ordinary character gallery.
    const legacy = (await read()).project;
    for (const glyph of ['B','D']) {
      legacy.documents[glyph].fills = Object.fromEntries(Object.keys(before.doc.fills).map(id=>[id,'#FFFFFF']));
      legacy.documents[glyph].bindings = {};
      legacy.documents[glyph].seedStatus = 'blank';
      legacy.documents[glyph].touched = glyph === 'D';
    }
    legacy.documents['@cardinal-slate'] = {...structuredClone(legacy.documents['@original']),glyph:'@cardinal-slate',touched:false};
    legacy.documents['@tonal-weave'] = {...structuredClone(legacy.documents['@original']),glyph:'@tonal-weave',touched:true};
    const buffer = Buffer.from(JSON.stringify(legacy));
    await page.locator('#projectFile').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer});
    await page.waitForFunction(()=>(/** @type {StudioWindow} */ (/** @type {unknown} */ (window))).CardinalStudio.getProject().documents.B.seedStatus==='guess');
    const restored = (await read()).project;
    assert.ok(Object.values(restored.documents.B.fills).some(fill=>fill!=='#FFFFFF'));
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
    console.log('Row remapping, shade preservation, history, repeated/reverse cycling, and safe starter migration pass.');
  } finally { await session.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
