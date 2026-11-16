import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openPage } from '../../scripts/landing-art/browser.mjs';

/** @typedef {import('../../name-tags/node_modules/playwright').Page} Page */
/** @param {Page} page */
async function ready(page) {
  await page.waitForFunction(() => /^1,000 draws/.test(document.querySelector('#explore-status')?.textContent ?? '') && !document.querySelector('#marginals')?.classList.contains('is-stale') && !!document.querySelector('[data-marginal]') && document.querySelector('#model-graph')?.getAttribute('aria-busy') !== 'true');
}
async function settled(/** @type {Page} */page) { await page.waitForFunction(()=>document.querySelector('#model-graph')?.getAttribute('aria-busy')!=='true'); }
const edgeNames=async(/** @type {Page} */page)=>(await page.locator('.dependency-edge title').allTextContents()).map(text=>text.split(' · ')[0]);
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
    assert.deepEqual(await page.locator('[data-node]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-node')).sort()), ['mu','sigma','y']);
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
    await page.getByRole('checkbox', {name:'Fix mu',exact:true}).check();await settled(page);
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
    const box = await node.locator('.node-name').boundingBox(); assert.ok(box);
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
    await page.locator('#example').selectOption('hierarchical'); await ready(page);
    assert.equal(await page.locator('[data-marginal="theta"]').count(),1);
    const edges = await edgeNames(page);
    for (const edge of ['mu → theta','tau → theta','z → theta','theta → y']) assert.ok(edges.includes(edge),edge);
    await page.locator('#graph-view').selectOption('plate');
    assert.equal(await page.locator('[data-plate][data-members~="theta"] .plate-outline').count(),1);
    assert.match(await page.locator('[data-node="theta"] .node-element').textContent() ?? '',/N/);
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
    await page.locator('[data-select-node="mu"]').click();
    await page.locator('#source').fill(`${await page.locator('#source').inputValue()}\n// changed`);
    assert.equal(await page.locator('.expanded-node-controls').first().getAttribute('disabled'), '');
    assert.ok(await page.locator('.expanded-node-controls input').first().isDisabled());
    assert.equal(await page.locator('#explore-output').inputValue(),'');
    assert.ok(await page.locator('#download-exploration').isDisabled());
    await page.getByRole('combobox',{name:'y element',exact:true}).selectOption('1');
    assert.ok(await page.locator('#marginals').evaluate(el=>el.classList.contains('is-stale')), 'changing displayed element cannot make stale results current');
    await page.locator('#export-model').click();
    assert.match(await page.locator('#error').innerText(),/Load the current model/);
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

test('linked priors retain only real dependencies, selection preserves focus and does not consume Undo', {timeout:60000}, async () => {
  const browser = await openPage('stan2r/');
  const page = /** @type {Page} */ (browser.page);
  try {
    await ready(page);
    await page.locator('#source').fill('data {int<lower=1> N;} parameters {real a; vector[N] b;} model {a ~ normal(0,1); b ~ normal(a, exp(a));}');
    await page.locator('#inputs').evaluate(el=>el.setAttribute('open',''));
    await page.locator('#data').fill('{"N":3}');
    await page.locator('#build-model').click();await ready(page);
    const node=page.locator('[data-node="b"]');
    await node.focus();await page.keyboard.press('Enter');await settled(page);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-node')),'b');
    assert.ok(await page.locator('[data-marginal="b"]').evaluate(el=>el.classList.contains('selected')));
    await page.getByRole('checkbox',{name:'Use constant for b Location',exact:true}).check();await settled(page);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Use constant for b Location');
    assert.ok((await edgeNames(page)).includes('a → b'),'scale still depends on a');
    await page.getByRole('checkbox',{name:'Use constant for b SD',exact:true}).check();await settled(page);
    const edges=await edgeNames(page);
    assert.ok(!edges.includes('a → b'),'both arguments are constants now');
    assert.ok(!edges.includes('N → b'),'the plate label carries dimension-only dependencies by default');
    await page.locator('#show-structure').check();await settled(page);
    assert.ok((await edgeNames(page)).includes('N → b'),'dimension toggle reveals the actual structural dependency');
    await page.getByRole('checkbox',{name:'Use constant for b Location',exact:true}).uncheck();await settled(page);
    assert.ok((await edgeNames(page)).includes('a → b'));
    // Numeric values outside the initial slider range must not leave a different thumb value.
    await page.getByRole('spinbutton',{name:'b SD value',exact:true}).fill('25');
    assert.equal(await page.getByRole('slider',{name:'b SD',exact:true}).inputValue(),'25');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'b SD value');
    await page.locator('#reset-scenario').click();await ready(page);
    await page.getByRole('checkbox',{name:'Fix b',exact:true}).check();await settled(page);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Fix b');
    assert.deepEqual(await edgeNames(page),['N → b']);
    await page.locator('#reset-scenario').click();await ready(page);
    await page.locator('#graph-view').selectOption('plate');
    const element=page.getByRole('combobox',{name:'b element',exact:true});
    await element.focus();await element.selectOption('2');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'b element');
    assert.match(await page.locator('[data-node="b"] .node-element').textContent()??'',/\[3\]/);
    assert.ok(await page.locator('[data-node="b"]').evaluate(el=>el.classList.contains('selected')));
    // Pick a different marginal after a real edit: Undo should undo that edit, not selection.
    await page.locator('[data-marginal="a"] [data-select-node]').click();
    const before=await summary(page,'a');
    await page.getByRole('slider',{name:'a SD',exact:true}).fill('2');
    await waitSummary(page,'a',await expectedSummary(page,{a:{args:{1:2}}},'a'));
    await page.locator('[data-toggle-node="b"]').click();
    await page.locator('#undo').click();
    await waitSummary(page,'a',before);
    assert.deepEqual(browser.errors,[]);
  } finally {await browser.close();}
});

test('grouped model shows indexed transforms and exports a PyMC fitting model', {timeout:60000}, async () => {
  const browser=await openPage('stan2r/');
  const page=/** @type {Page} */(browser.page);
  try {
    await ready(page);await page.locator('#example').selectOption('grouped');await ready(page);
    const edges=await edgeNames(page);
    assert.ok(edges.includes('theta → eta'));assert.ok(edges.includes('group → eta'));
    assert.equal(await page.getByRole('combobox',{name:'theta element',exact:true}).locator('option').count(),3);
    assert.equal(await page.getByRole('combobox',{name:'eta element',exact:true}).locator('option').count(),6);
    await page.getByRole('combobox',{name:'eta element',exact:true}).selectOption('4');
    await waitSummary(page,'eta',await expectedSummary(page,{},'theta',2));
    await page.locator('#graph-view').selectOption('plate');
    assert.match(await page.locator('[data-node="theta"] .node-element').textContent()??'',/J/);
    assert.match(await page.locator('[data-node="eta"] .node-element').textContent()??'',/N.*\[5\]/);
    await page.locator('.export-panel > summary').click();await page.locator('#explore-format').selectOption('pymc');
    await page.locator('#export-model').click();
    assert.match(await page.locator('#explore-output').inputValue(),/import pymc/);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-exploration').click()]);
    assert.equal(download.suggestedFilename(),'model.py');
    assert.deepEqual(browser.errors,[]);
    await mkdir(screenshotDir,{recursive:true});
    await page.screenshot({path:`${screenshotDir}/grouped.png`,fullPage:true});
  } finally {await browser.close();}
});

test('multiple nodes expand in place, sliders remain live during a pointer drag, and cards collapse accessibly', {timeout:60000}, async()=>{
  const browser=await openPage('stan2r/');const page=/** @type {Page} */(browser.page);
  try {
    await ready(page);
    const mu=page.locator('[data-toggle-node="mu"]'),sigma=page.locator('[data-toggle-node="sigma"]');
    assert.equal(await mu.getAttribute('aria-expanded'),'true');
    await sigma.click();await settled(page);
    assert.equal(await sigma.getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('.expanded-node-controls').count(),2);
    for(const id of ['mu','sigma']) {
      assert.equal(await page.locator(`[data-node="${id}"] .expanded-node-controls`).count(),1);
      assert.ok(await page.locator(`[data-controls-for="${id}"]`).evaluate(el=>el.getBoundingClientRect().bottom <= /** @type {Element} */(el.parentElement).getBoundingClientRect().bottom+1),'expanded controls fit inside their node');
    }
    const range=page.getByRole('slider',{name:'mu SD',exact:true});
    await range.scrollIntoViewIfNeeded();const box=await range.boundingBox();assert.ok(box);
    await page.mouse.move(box.x+box.width*.3,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.55,box.y+box.height/2,{steps:4});
    await page.waitForTimeout(180); // A simulation finishes while the pointer is still down.
    await page.mouse.move(box.x+box.width*.8,box.y+box.height/2,{steps:4});await page.mouse.up();
    const value=Number(await range.inputValue());assert.ok(value>4,'thumb continues moving after the simulation refresh');
    await waitSummary(page,'mu',await expectedSummary(page,{mu:{args:{1:value}}}));
    await range.focus();await page.keyboard.press('Control+z');
    await waitSummary(page,'mu',await expectedSummary(page,{}));
    await page.keyboard.press('Control+Shift+z');
    await waitSummary(page,'mu',await expectedSummary(page,{mu:{args:{1:value}}}));
    const beforeMove=await page.locator('[data-node="mu"]').getAttribute('transform');
    const siblingBefore=await page.locator('[data-node="sigma"]').getAttribute('transform');
    await mu.focus();await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('[data-node="sigma"]').getAttribute('transform'),siblingBefore,'moving one expanded node does not reflow its sibling');
    const moved=await page.locator('[data-node="mu"]').getAttribute('transform');
    const y=(/** @type {string|null} */t)=>Number(t?.match(/,([^,)]+)\)/)?.[1]);
    assert.equal(y(moved)-y(beforeMove),5,'expanded node moves by the requested keyboard step');
    await page.keyboard.press('Control+z');
    await sigma.focus();await page.keyboard.press('Enter');await settled(page);
    assert.equal(await sigma.getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('[data-controls-for="sigma"]').count(),0);
    assert.equal(await page.locator('[data-controls-for="mu"]').count(),1);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-toggle-node')),'sigma');
    await page.keyboard.press('Space');await settled(page);assert.equal(await sigma.getAttribute('aria-expanded'),'true');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const pageY=await page.evaluate(()=>scrollY);
    await page.locator('[data-select-node="sigma"]').evaluate(el=>/** @type {HTMLButtonElement} */(el).click());
    await settled(page);
    const viewport=await page.evaluate(pageY=>{
      const card=/** @type {Element} */(document.querySelector('[data-controls-for="sigma"]')).getBoundingClientRect();
      const area=/** @type {Element} */(document.querySelector('.graph-scroll')).getBoundingClientRect();
      return {samePagePosition:pageY===scrollY,visible:card.left>=area.left&&card.right<=area.right};
    },pageY);
    assert.ok(viewport.samePagePosition,'selecting a node scrolls only the diagram');assert.ok(viewport.visible,'the expanded card fits within the mobile diagram viewport');
    await mkdir(screenshotDir,{recursive:true});await page.screenshot({path:`${screenshotDir}/expanded-mobile.png`,fullPage:true});
    assert.deepEqual(browser.errors,[]);
  }finally{await browser.close();}
});

test('plate view groups matching repeated variables and reveals hidden structure through linked equations', {timeout:60000}, async()=>{
  const browser=await openPage('stan2r/');const page=/** @type {Page} */(browser.page);
  try {
    await ready(page);await page.locator('#example').selectOption('hierarchical');await ready(page);
    assert.equal(await page.locator('#graph-view').inputValue(),'plate');
    const shared=page.locator('[data-plate][data-members~="theta"]');
    const members=(await shared.getAttribute('data-members'))?.split(' ')??[];
    for(const name of ['z','theta','y'])assert.ok(members.includes(name),`${name} shares the observation plate`);
    assert.equal(await page.locator('[data-node="N"]').count(),0,'dimension-only input is hidden');
    assert.equal(await page.locator('[data-node="theta"] path.node-shape').count(),1,'deterministic symbol is a diamond');
    assert.equal(await page.locator('[data-node="y"] circle.node-shape').count(),1,'observed symbol is a filled circle');
    const before=await summary(page,'theta');
    await page.locator('[data-equation-control="N"]').click();await settled(page);
    assert.ok(await page.locator('#show-structure').isChecked());
    assert.equal(await page.locator('[data-node="N"] [data-toggle-node]').getAttribute('aria-expanded'),'true');
    assert.ok(await page.locator('.dimension-edge').count()>0);
    await page.locator('#graph-view').selectOption('flow');await settled(page);
    assert.equal(await page.locator('[data-plate]').count(),0);
    assert.equal(await summary(page,'theta'),before,'diagram view changes leave simulation draws unchanged');
    assert.deepEqual(browser.errors,[]);
  }finally{await browser.close();}
});
