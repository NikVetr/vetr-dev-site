import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../scripts/landing-art/browser.mjs';
/** @typedef {import('../../name-tags/node_modules/playwright').Page} Page */
/** @param {Page} page */
async function ready(page) {
  await page.waitForFunction(()=>/^1,000 draws/.test(document.querySelector('#explore-status')?.textContent??'') && !document.querySelector('#marginals')?.classList.contains('is-stale') && !!document.querySelector('[data-marginal]') && !/** @type {HTMLButtonElement} */(document.querySelector('#build-model')).disabled);
}

test('examples and files load automatically, while edited code uses one Load action', {timeout:60000}, async()=>{
  const browser=await openPage('stan2r/'),page=/** @type {Page} */(browser.page);
  try {
    await ready(page);
    const initial=await page.locator('#source').inputValue();
    assert.equal(await page.locator('#build-model').textContent(),'Load');
    assert.equal(await page.locator('#explorer #build-model').count(),0);
    assert.equal(await page.locator('#load-example').count(),0);
    assert.equal(await page.locator('#syntax-status').textContent(),'No version-specific syntax identified.');
    await page.selectOption('#example','hierarchical');await ready(page);
    assert.equal(await page.locator('[data-marginal="theta"]').count(),1);
    await page.click('#undo');await ready(page);
    assert.equal(await page.locator('#source').inputValue(),initial,'one Undo restores the preceding example and graph');
    await page.click('#redo');await ready(page);
    assert.equal(await page.locator('[data-marginal="theta"]').count(),1);
    const edited='parameters {real custom;} model {custom ~ normal(3, 1);}';
    await page.locator('#source').fill(edited);
    await page.locator('#inputs > summary').click();await page.locator('#data').fill('{}');
    assert.ok(await page.locator('#explore-stale').isVisible());
    assert.equal(await page.locator('[data-marginal="custom"]').count(),0);
    await page.click('#build-model');await ready(page);
    assert.equal(await page.locator('#source').inputValue(),edited);
    assert.equal(await page.locator('[data-marginal="custom"]').count(),1);
    await page.locator('#file').setInputFiles({name:'uploaded.stan',mimeType:'text/plain',buffer:Buffer.from('parameters {real uploaded;} model {uploaded ~ normal(0,1);}')});
    await page.waitForFunction(()=>!!document.querySelector('[data-marginal="uploaded"]'));await ready(page);
    assert.deepEqual(browser.errors,[]);
  } finally {await browser.close();}
});

test('a delayed failure from the previous model cannot clear a newly selected example', {timeout:60000}, async()=>{
  const browser=await openPage('stan2r/'),page=/** @type {Page} */(browser.page);
  try {
    await page.route('**/stan2r/core/compiler-worker.js',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:`const deliver=self.postMessage.bind(self);self.postMessage=message=>setTimeout(()=>deliver(message),message.error?700:0);\n${await response.text()}`});
    });
    await page.reload();await ready(page);
    await page.locator('#source').fill('parameters {real broken;} model {broken ~ invalid(1);}');
    await page.click('#build-model');
    await page.selectOption('#example','binomial');await ready(page);
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('[data-marginal="theta"]').count(),1);
    assert.equal(await page.locator('#explore-error').isHidden(),true);
    assert.match(await page.locator('#source').inputValue(),/binomial/);
    assert.equal(await page.locator('#build-model').isEnabled(),true);
    assert.deepEqual(browser.errors,[]);
  } finally {await browser.close();}
});
