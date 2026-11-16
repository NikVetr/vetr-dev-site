import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openPage} from '../../scripts/landing-art/browser.mjs';
/** @typedef {import('../../name-tags/node_modules/playwright').Page} Page */
/** @param {Page} page */
async function settled(page) {
  await page.waitForFunction(()=>document.querySelector('#model-graph')?.getAttribute('aria-busy')!=='true' && /^1,000 draws/.test(document.querySelector('#explore-status')?.textContent??''));
}

test('graph stays fitted as nodes expand and uses distinct click, move and pan cursors', {timeout:60000}, async()=>{
  const browser=await openPage('stan2r/',{width:1440,height:900,scheme:'dark'}), page=/** @type {Page} */(browser.page);
  try {
    await settled(page);
    await page.selectOption('#example','hierarchical');
    await page.waitForSelector('[data-toggle-node="tau"]');await settled(page);
    for(const header of await page.locator('[data-toggle-node][aria-expanded="true"]').all()) {
      await header.evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));await settled(page);
    }
    assert.equal(await page.locator('[data-toggle-node][aria-expanded="true"]').count(),0);
    assert.equal(await page.locator('[data-toggle-node]').evaluateAll(nodes=>nodes.some(node=>[...node.querySelectorAll('text')].some(text=>text.textContent==='+'))),false,'collapsed nodes have no floating plus symbols');
    assert.equal(await page.locator('[data-toggle-node="mu"]').evaluate(el=>getComputedStyle(el).cursor),'pointer');
    assert.equal(await page.locator('.graph-scroll').evaluate(el=>getComputedStyle(el).cursor),'grab');
    for(const id of ['mu','tau','z','theta']) {
      await page.locator(`[data-toggle-node="${id}"]`).evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));await settled(page);
      assert.equal(await page.locator('#graph-zoom').inputValue(),'fit','opening nodes never forces a fixed magnification');
      const bounds=await page.evaluate(()=>{
        const holder=/** @type {HTMLElement} */(document.querySelector('.graph-scroll'));
        const graph=/** @type {Element} */(document.querySelector('#model-graph')).getBoundingClientRect();
        return {fits:graph.width<=holder.clientWidth+1&&graph.height<=holder.clientHeight+1};
      });
      assert.ok(bounds.fits,'expanded model fits its canvas');
    }
    await mkdir('tmp/output/stan-graph-navigation',{recursive:true});
    await page.screenshot({path:'tmp/output/stan-graph-navigation/fitted-desktop.png',fullPage:true});
    await page.selectOption('#graph-zoom','1');
    const background=await page.locator('.graph-scroll').evaluate(el=>{
      const holder=/** @type {HTMLElement} */(el),rect=holder.getBoundingClientRect();
      holder.scrollLeft=(holder.scrollWidth-holder.clientWidth)/2;
      holder.scrollTop=(holder.scrollHeight-holder.clientHeight)/2;
      for(let y=rect.top+20;y<rect.bottom-40;y+=20)for(let x=rect.left+30;x<rect.right-40;x+=20) {
        const target=document.elementFromPoint(x,y);
        if(target&&holder.contains(target)&&!target.closest('.model-node'))return {x,y,left:holder.scrollLeft,top:holder.scrollTop};
      }
      throw new Error('No background region available to pan');
    });
    const positions=await page.locator('[data-node]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform')));
    await page.mouse.move(background.x,background.y);await page.mouse.down();
    assert.equal(await page.locator('.graph-scroll').evaluate(el=>getComputedStyle(el).cursor),'grabbing');
    await page.mouse.move(background.x+25,background.y+25,{steps:3});await page.mouse.up();
    const scrolled=await page.locator('.graph-scroll').evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));
    assert.ok(Math.abs(scrolled.left-background.left)>10||Math.abs(scrolled.top-background.top)>10,'background drag pans an enlarged graph');
    assert.deepEqual(await page.locator('[data-node]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform'))),positions,'panning does not reposition nodes');
    assert.equal(await page.locator('.graph-scroll').evaluate(el=>getComputedStyle(el).cursor),'grab');
    await page.selectOption('#graph-zoom','fit');
    const node=page.locator('[data-toggle-node="mu"]');await node.scrollIntoViewIfNeeded();
    const box=await node.boundingBox();assert.ok(box);
    await page.mouse.move(box.x+box.width/2,box.y+20);await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+15,box.y+30,{steps:3});
    assert.equal(await page.locator('.graph-scroll').evaluate(el=>getComputedStyle(el).cursor),'grabbing','moving a node uses the moving cursor');
    await page.mouse.up();await settled(page);
    assert.equal(await page.locator('[data-toggle-node="mu"]').getAttribute('aria-expanded'),'true','drag does not collapse the node');
    assert.equal(await page.locator('[data-toggle-node="mu"]').evaluate(el=>getComputedStyle(el).cursor),'pointer');
    await page.setViewportSize({width:390,height:844});await settled(page);
    await page.screenshot({path:'tmp/output/stan-graph-navigation/fitted-mobile.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(browser.errors,[]);
  }finally{await browser.close();}
});
