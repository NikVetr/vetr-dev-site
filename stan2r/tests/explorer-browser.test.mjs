import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openPage } from '../../scripts/landing-art/browser.mjs';

/** @typedef {import('../../name-tags/node_modules/playwright').Page} Page */
/** @param {Page} page */
async function ready(page) {
  await page.waitForFunction(() => /^1,000 draws/.test(document.querySelector('#explore-status')?.textContent ?? '') && !document.querySelector('#marginals')?.classList.contains('is-stale') && !!document.querySelector('[data-marginal]'));
}
/** @param {Page} page @param {string} id */
const summary = (page, id) => page.locator(`[data-marginal="${id}"] > p`).innerText();
/** @param {Page} page @param {string} id @param {string} expected */
async function waitSummary(page, id, expected) {
  await page.waitForFunction(({ id, expected }) => document.querySelector(`[data-marginal="${id}"] > p`)?.textContent === expected && !document.querySelector('#marginals')?.classList.contains('is-stale'), { id, expected });
}
/** @param {Page} page @param {Record<string,any>} overrides @param {string} [id] @param {number} [index] */
async function expectedSummary(page, overrides, id = 'mu', index = 0) {
  return page.evaluate(async ({ overrides, id, index }) => {
    const source = /** @type {HTMLTextAreaElement} */ (document.querySelector('#source')).value;
    const data = JSON.parse(/** @type {HTMLTextAreaElement} */ (document.querySelector('#data')).value);
    const result = await window.Stan2R.explore({ source, data, draws: 1000, seed: 12345, overrides });
    const values = result.samples[id].map(row => row[index]);
    const mean = values.reduce((a,b) => a+b, 0)/values.length;
    const sd = Math.sqrt(values.reduce((a,b) => a+(b-mean)**2, 0)/(values.length-1));
    return `Mean ${mean.toPrecision(3)} · SD ${sd.toPrecision(3)}`;
  }, { overrides, id, index });
}

const screenshotDir = fileURLToPath(new URL('../../tmp/output/stan2r-explorer-browser/', import.meta.url));

test('explorer simulates without webR, applies priors and fixed scenarios, and restores history', { timeout: 60000 }, async () => {
  const browser = await openPage('stan2r/');
  const page = /** @type {Page} */ (browser.page);
  try {
    /** @type {string[]} */
    const runtimeRequests = [];
    page.on('request', request => { if (/webr\.r-wasm\.org/.test(request.url())) runtimeRequests.push(request.url()); });
    await page.reload(); await ready(page);
    assert.deepEqual(await page.locator('[data-node]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-node')).sort()), ['N','mu','sigma','y']);
    assert.deepEqual(await page.locator('[data-marginal]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-marginal')).sort()), ['mu','sigma','y']);
    const initial = await summary(page, 'mu');
    assert.equal(initial, await expectedSummary(page, {}));
    const originalSource = await page.locator('#source').inputValue();
    const initialSvg = await page.locator('[data-marginal="mu"] svg').evaluate(el => el.outerHTML);
    const expected = await expectedSummary(page, { mu: { args: { 1: 4 } } });
    await page.getByRole('slider', {name: 'mu SD', exact: true}).fill('4');
    await waitSummary(page, 'mu', expected);
    assert.equal(await page.locator('[data-marginal="mu"] .hist-reference').count(),1,'original prior stays visible on the shared histogram scale');
    assert.ok(await page.locator('#comparison-key').isVisible());
    assert.notEqual(expected, initial);
    assert.equal(await page.locator('#source').inputValue(), originalSource, 'scenario never rewrites source');
    await page.locator('#reset-scenario').focus(); await page.keyboard.press('Control+z');
    await waitSummary(page, 'mu', initial);
    await page.keyboard.press('Control+Shift+z'); await waitSummary(page, 'mu', expected);
    await page.getByRole('checkbox', {name:'Fix mu',exact:true}).check();
    await page.getByRole('spinbutton', {name:'Fixed value for mu',exact:true}).fill('3');
    await waitSummary(page, 'mu', 'Mean 3.00 · SD 0.00');
    assert.ok(await page.getByRole('slider', {name:'mu SD',exact:true}).isDisabled());
    await page.locator('#reset-scenario').click(); await waitSummary(page, 'mu', initial);
    assert.equal(await page.locator('[data-marginal="mu"] svg').evaluate(el=>el.outerHTML), initialSvg, 'same seed exactly restores histogram');
    assert.equal(await page.getByRole('checkbox', {name:'Fix mu',exact:true}).isChecked(), false);
    // SVG nodes remain keyboard reachable, move with arrows, and participate in history.
    const node = page.locator('[data-node="mu"]');
    const before = await node.getAttribute('transform');
    await node.focus(); await page.keyboard.press('ArrowRight');
    const moved = await node.getAttribute('transform'); assert.notEqual(moved, before);
    await page.keyboard.press('Control+z'); assert.equal(await node.getAttribute('transform'), before);
    assert.equal(await page.locator('[data-marginal="mu"] svg').count(),1,'position-only undo retains current histograms');
    await page.keyboard.press('Control+Shift+z'); assert.equal(await node.getAttribute('transform'), moved);
    const box = await node.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+15,{steps:5}); await page.mouse.up();
    const dragged = await node.getAttribute('transform'); assert.notEqual(dragged,moved);
    await page.locator('#undo').click(); assert.equal(await node.getAttribute('transform'),moved);
    await page.locator('#redo').click(); assert.equal(await node.getAttribute('transform'),dragged);
    await ready(page);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await mkdir(screenshotDir,{recursive:true});
    await page.screenshot({path:`${screenshotDir}/desktop.png`,fullPage:true});
    assert.deepEqual(runtimeRequests,[],'exploration never downloads R');
    assert.deepEqual(browser.errors,[]);
  } finally { await browser.close(); }
});

test('hierarchical plates, transformed marginals, vector selection, exports and stale source', { timeout: 60000 }, async () => {
  const browser = await openPage('stan2r/');
  const page = /** @type {Page} */ (browser.page);
  try {
    await ready(page);
    await page.locator('#example').selectOption('hierarchical'); await page.locator('#load-example').click();
    assert.ok(await page.locator('#explore-stale').isVisible());
    assert.equal(await page.locator('#node-controls').getAttribute('disabled'), '');
    assert.ok(await page.locator('#node-controls input').first().isDisabled());
    await page.locator('#build-model').click(); await ready(page);
    assert.equal(await page.locator('[data-marginal="theta"]').count(),1);
    const edges = await page.locator('.dependency-edge title').allTextContents();
    for (const edge of ['mu → theta','tau → theta','z → theta','theta → y']) assert.ok(edges.includes(edge),edge);
    await page.locator('#graph-view').selectOption('plate');
    assert.equal(await page.locator('[data-node="theta"] .plate-outline').count(),1);
    assert.match(await page.locator('[data-node="theta"] .plate-label').textContent() ?? '',/N/);
    await page.getByRole('combobox',{name:'theta element',exact:true}).selectOption('2');
    await waitSummary(page,'theta',await expectedSummary(page,{},'theta',2));
    assert.match(await page.locator('[data-marginal="theta"] svg').getAttribute('aria-label')??'',/element 3/);
    await page.locator('.export-panel > summary').click();
    await page.locator('#export-model').click();
    assert.match(await page.locator('#explore-output').inputValue(),/\\begin\{aligned\}/);
    assert.ok(await page.locator('#download-exploration').isEnabled());
    await page.locator('#explore-format').selectOption('python');
    assert.equal(await page.locator('#explore-output').inputValue(),'');
    assert.ok(await page.locator('#download-exploration').isDisabled());
    await page.locator('#export-model').click();
    assert.match(await page.locator('#explore-output').inputValue(),/numpy/);
    await page.locator('#source').fill(`${await page.locator('#source').inputValue()}\n// changed`);
    assert.equal(await page.locator('#node-controls').getAttribute('disabled'), '');
    assert.ok(await page.locator('#node-controls input').first().isDisabled());
    assert.equal(await page.locator('#explore-output').inputValue(),'');
    assert.ok(await page.locator('#download-exploration').isDisabled());
    await page.locator('#export-model').click();
    assert.match(await page.locator('#explore-error').innerText(),/Build the current model/);
    assert.equal(await page.locator('#explore-output').inputValue(),'');
    await page.locator('#build-model').click(); await ready(page);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#theme-toggle').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await mkdir(screenshotDir,{recursive:true});
    await page.screenshot({path:`${screenshotDir}/mobile-dark.png`,fullPage:true});
    await page.locator('#source').fill('parameters {real x;} model {target += -square(x);}');
    await page.locator('#build-model').click();
    await page.waitForFunction(()=>document.querySelector('#explore-error')?.textContent && !/** @type {HTMLButtonElement} */(document.querySelector('#build-model')).disabled);
    assert.equal(await page.locator('[data-marginal]').count(),0);
    assert.equal(await page.locator('[data-node]').count(),0);
    assert.ok(await page.locator('#explore-error').isVisible());
    assert.deepEqual(browser.errors,[]);
  } finally { await browser.close(); }
});

test('rapid prior edits keep the latest result and source edits discard pending worker replies', { timeout: 60000 }, async () => {
  const browser = await openPage('stan2r/');
  const page = /** @type {Page} */ (browser.page);
  try {
    await page.route('**/stan2r/core/simulation-worker.js',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:`const deliver = self.postMessage.bind(self); self.postMessage = (...args) => setTimeout(() => deliver(...args), 250);\n${await response.text()}`});
    });
    await page.reload(); await ready(page);
    const expected=await expectedSummary(page,{mu:{args:{1:3.5}}});
    const input=page.getByRole('spinbutton',{name:'mu SD value',exact:true});
    await input.fill('1');
    await page.waitForFunction(()=>document.querySelector('#explore-status')?.textContent==='Simulating…');
    await input.fill('2.5');await input.fill('3.5');
    await waitSummary(page,'mu',expected);
    await input.fill('4');
    await page.waitForFunction(()=>document.querySelector('#explore-status')?.textContent==='Simulating…');
    await page.locator('#source').fill(`${await page.locator('#source').inputValue()}\n// invalidate pending result`);
    await page.waitForTimeout(500);
    assert.equal(await summary(page,'mu'),expected,'pending simulation must not replace the previous result after source changes');
    assert.ok(await page.locator('#marginals').evaluate(el=>el.classList.contains('is-stale')));
    assert.ok(await page.locator('#explore-stale').isVisible());
    assert.deepEqual(browser.errors,[]);
  } finally { await browser.close(); }
});
