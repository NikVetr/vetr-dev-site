import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from '../../scripts/landing-art/browser.mjs';
/** @typedef {import('../../name-tags/node_modules/playwright').Page} Page */
/** @param {Page} page */
async function ready(page) {
  await page.waitForFunction(()=>/^1,000 draws/.test(document.querySelector('#explore-status')?.textContent??'')&&document.querySelector('#model-graph')?.getAttribute('aria-busy')!=='true');
}

test('workspace fills desktop, resizes and collapses without altering the model or history', {timeout:60000}, async()=>{
  const browser=await openPage('stan2r/',{width:1440,height:900,scheme:'dark'}),page=/** @type {Page} */(browser.page);
  try {
    await ready(page);
    const source=await page.locator('#source').inputValue(),histogram=await page.locator('#marginals').innerHTML();
    const area=await page.locator('#workspace').boundingBox();assert.ok(area&&area.x<14&&area.width>1410);
    const initialGraph=await page.locator('.graph-scroll').boundingBox(),drawing=await page.locator('#model-graph').boundingBox();
    assert.ok(initialGraph&&drawing&&drawing.width<=initialGraph.width&&drawing.height<=initialGraph.height,'fit shows the complete default model');
    const undoBefore=await page.locator('#undo').isDisabled();
    const divider=page.locator('#dock-resizer'),width=Number(await divider.getAttribute('aria-valuenow'));
    await divider.focus();await page.keyboard.press('ArrowRight');
    assert.equal(Number(await divider.getAttribute('aria-valuenow')),width+10);
    const handle=await divider.boundingBox();assert.ok(handle);
    await page.mouse.move(handle.x+4,handle.y+50);await page.mouse.down();await page.mouse.move(handle.x+54,handle.y+50);await page.mouse.up();
    assert.equal(Number(await divider.getAttribute('aria-valuenow')),width+60);
    await page.locator('#toggle-code').click();assert.ok(await page.locator('#code-panel').isHidden());
    await page.locator('#focus-graph').click();assert.ok(await page.locator('#editors').isHidden());
    await page.locator('#focus-graph').click();assert.ok(await page.locator('#spec-panel').isVisible());assert.ok(await page.locator('#code-panel').isHidden(),'restore preserves individual panel choices');
    await page.locator('[data-equation="mu"]').click();assert.ok(await page.locator('#code-panel').isVisible(),'linked equation reveals source');
    await page.locator('#toggle-distributions').click();
    const expanded=await page.locator('.graph-scroll').boundingBox();assert.ok(expanded&&initialGraph&&expanded.height>initialGraph.height+100);
    await page.locator('#toggle-distributions').click();
    assert.equal(await page.locator('#source').inputValue(),source);assert.equal(await page.locator('#marginals').innerHTML(),histogram);
    assert.equal(await page.locator('#undo').isDisabled(),undoBefore,'panel/navigation changes do not change history availability');
    await page.setViewportSize({width:2560,height:1440});await ready(page);
    const wide=await page.locator('#workspace').boundingBox();assert.ok(wide&&wide.width>2530);
    await page.setViewportSize({width:390,height:844});await ready(page);
    for(const control of await page.locator('.expanded-node-controls').all()) {
      assert.ok(await control.evaluate(el=>el.getBoundingClientRect().bottom<=/** @type {Element} */(el.parentElement).getBoundingClientRect().bottom+1),'responsive controls fit inside their node');
    }
    assert.deepEqual(browser.errors,[]);
  } finally {await browser.close();}
});

test('workspace panels remain reachable on narrow screens and panel changes preserve prior Undo', {timeout:60000},async()=>{
  const browser=await openPage('stan2r/',{width:390,height:844}),page=/** @type {Page} */(browser.page);
  try {
    await ready(page);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const code=await page.locator('#code-panel').boundingBox(),spec=await page.locator('#spec-panel').boundingBox(),graph=await page.locator('#explorer').boundingBox();
    assert.ok(code&&spec&&graph&&code.height>300&&spec.height>200&&spec.y>=code.y+code.height&&graph.y>=spec.y+spec.height,'stacked panels retain their content height without overlapping');
    await page.getByRole('slider',{name:'mu SD',exact:true}).fill('4');
    await page.waitForFunction(()=>!document.querySelector('#marginals')?.classList.contains('is-stale'));
    await page.locator('#toggle-code').click();await page.locator('#toggle-spec').click();
    assert.ok(await page.locator('#editors').isHidden());
    await page.locator('#toggle-distributions').click();
    await page.locator('#focus-graph').focus();await page.keyboard.press('Control+z');
    await page.waitForFunction(()=>/** @type {HTMLInputElement|null} */(document.querySelector('[aria-label="mu SD"]'))?.value==='2');
    await page.locator('#toggle-code').click();assert.ok(await page.locator('#source').isVisible());
    for(const width of [844,1000]) {
      await page.setViewportSize({width,height:700});await ready(page);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no page overflow at ${width}`);
    }
    assert.deepEqual(browser.errors,[]);
  } finally {await browser.close();}
});
