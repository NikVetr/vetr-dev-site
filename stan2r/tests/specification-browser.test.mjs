import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const screenshotDir = fileURLToPath(new URL('../../tmp/output/stantheexplorer-review/', import.meta.url));
import { openPage } from '../../scripts/landing-art/browser.mjs';

/** @typedef {import('../../name-tags/node_modules/playwright').Page} Page */
/** @param {Page} page */
async function ready(page) { await page.waitForFunction(()=>/^1,000 draws/.test(document.querySelector('#explore-status')?.textContent??'') && !document.querySelector('#marginals')?.classList.contains('is-stale')); }

test('rendered model shares export equations, tracks changes and links source to expandable nodes', {timeout:60000}, async()=>{
  const browser = await openPage('stan2r/'); const page=/** @type {Page} */(browser.page);
  try {
    await ready(page);
    assert.equal(await page.title(),'Stan Studio — Model explorer & exports');
    assert.equal(await page.evaluate(()=>window.Stan2R === window.StanTheExplorer),true);
    assert.equal(await page.locator('#model-spec math').count(),4);
    assert.equal(await page.locator('#model-spec .katex-error').count(),0);
    assert.equal(await page.locator('#model-spec button math').count(),0,'math remains a semantic sibling of the navigation button');
    await page.locator('[data-equation="sigma"]').click();
    assert.equal(await page.getByRole('slider',{name:'sigma SD',exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('slider',{name:'mu SD',exact:true}).count(),1,'previous node remains open');
    const sourceSelection = await page.locator('#source').evaluate(el=>{const t=/** @type {HTMLTextAreaElement} */(el);return t.value.slice(t.selectionStart,t.selectionEnd);});
    assert.match(sourceSelection,/sigma/);
    await page.getByRole('slider',{name:'mu SD',exact:true}).fill('4');await ready(page);
    const tex = await page.locator('[data-equation="mu"] annotation').textContent();
    assert.match(tex??'',/\\left\(4\\right\)\^2/);
    await page.locator('.export-panel > summary').click();await page.locator('#export-model').click();
    const output = await page.locator('#explore-output').inputValue();
    assert.ok(output.includes((tex??'').replace('\\begin{aligned}','').replace('\\end{aligned}','')));
    await page.locator('#explore-format').selectOption('r');
    assert.ok(await page.locator('#r-options').isVisible());assert.match(await page.locator('#export-scope').textContent()??'',/original Stan source/);
    assert.equal(await page.locator('#explore-output').inputValue(),'');
    assert.ok(await page.locator('#download-exploration').isDisabled());
    await page.locator('#explore-format').selectOption('pymc');await page.locator('#export-model').click();
    assert.match(await page.locator('#explore-output').inputValue(),/import pymc as pm/);
    for(const example of ['hierarchical','grouped','multilevel']){
      await page.selectOption('#example',example);await ready(page);
      assert.ok(await page.locator('#model-spec math').count()>4);
      assert.equal(await page.locator('#model-spec .katex-error').count(),0);
      assert.doesNotMatch(await page.locator('#model-spec').innerText(),/Could not render/);
    }
    await mkdir(screenshotDir,{recursive:true});
    await page.screenshot({path:`${screenshotDir}/model-desktop.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.click('#theme-toggle');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${screenshotDir}/model-mobile.png`,fullPage:true});
    assert.deepEqual(browser.errors,[]);
  } finally { await browser.close(); }
});

test('legacy syntax reports migration and preserves the source editor', {timeout:60000}, async()=>{
  const browser=await openPage('stan2r/');const page=/** @type {Page} */(browser.page);
  try {
    await ready(page);
    const source='data { int N; real y[N]; } parameters { real mu; } model { mu ~ normal(0,1); y ~ normal(mu,1); }';
    await page.fill('#source',source);await page.locator('#inputs > summary').click();await page.fill('#data','{"N":2,"y":[1,2]}');await page.click('#build-model');await ready(page);
    assert.equal(await page.locator('#source').inputValue(),source);
    assert.match(await page.locator('#syntax-status').innerText(),/Legacy syntax/);
    assert.match(await page.locator('#normalized-source').textContent()??'',/array\[N\] real y/);
    await page.locator('[data-equation="mu"]').click();
    assert.equal(await page.locator('#syntax-migration').getAttribute('open'),'');
    assert.equal(await page.locator('#source').inputValue(),source);
    await page.fill('#source','parameters {real x;} model {x~unknown(1);}');await page.click('#build-model');
    await page.waitForFunction(()=>document.querySelector('#explore-error')?.getAttribute('hidden')===null);
    assert.equal(await page.locator('#model-spec math').count(),0,'failed build clears previous equations');
    assert.equal(await page.locator('#syntax-status').textContent(),'');
    assert.deepEqual(browser.errors,[]);
  } finally {await browser.close();}
});
