import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {openPage} from '../browser.mjs';
import {selectionScore} from '../collage-search.mjs';

/** @type {Awaited<ReturnType<typeof import('../collage-search.mjs').search>>} */
const fixture=JSON.parse(readFileSync(new URL('../fixtures/collage-layouts.json',import.meta.url),'utf8'));

test('selected collage compositions preserve every input and balance blank area with empty blocks',()=>{
  const input=JSON.parse(readFileSync(new URL('../../../message-collage/examples/request.json',import.meta.url),'utf8'));
  assert.equal(fixture.provenance.starts,1024);
  for(const layout of fixture.layouts){
    assert.deepEqual(layout.result.messages.map(m=>m.text).sort(),[...input.messages].sort());
    assert.equal(layout.result.request.rotation_deg,4);assert.equal(layout.result.request.warp_strength,1);
    assert.ok(Math.abs(Math.log(layout.result.card.width_in/layout.result.card.height_in/layout.target_ratio))<.08,'physical composition matches intended aspect');
    assert.equal(layout.score,selectionScore(layout.metrics,layout.result.card.width_in/layout.result.card.height_in,layout.target_ratio));
  }
  assert.ok(selectionScore({empty_fraction:.5,largest_empty_rectangle_fraction:.01},1,1)<selectionScore({empty_fraction:.45,largest_empty_rectangle_fraction:.1},1,1),'dispersed gaps can beat less total whitespace concentrated in a block');
});

test('whole collage tile fills its well at desktop/mobile ratios and preserves its animation clock', {timeout:60000},async()=>{
  const browser=await openPage('');const page=/** @type {import('../../../name-tags/node_modules/playwright').Page} */(browser.page);
  try{
    mkdirSync('tmp/output/collage-density',{recursive:true});
    const card=page.locator('[data-mosaic-key="message-collage"]'),art=card.locator('.card-art');
    for(const [width,height] of [[390,844],[477,900],[768,1024],[1440,900],[1920,1080],[2160,1080],[2560,1440],[844,390]]){
      await page.setViewportSize({width,height});await art.scrollIntoViewIfNeeded();await art.locator('svg[data-period]').waitFor();await page.waitForTimeout(100);
      const geometry=await card.evaluate(el=>{
        const art=/** @type {HTMLElement} */(el.querySelector('.card-art')),visible=[...el.querySelectorAll('.collage-layout')].filter(svg=>getComputedStyle(svg).display!=='none');
        const well=art.getBoundingClientRect(),rect=/** @type {SVGRectElement} */(visible[0]?.querySelector('rect')),drawing=rect?.getBoundingClientRect();
        const desc=/** @type {Element} */(el.querySelector('p')).getBoundingClientRect(),date=/** @type {Element} */(el.querySelector('.project-date')).getBoundingClientRect();
        return{count:visible.length,ratio:well.width/well.height,profile:visible[0]?.getAttribute('data-profile'),fill:drawing?drawing.width*drawing.height/(well.width*well.height):0,gap:date.top-desc.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(geometry.count,1);assert.equal(geometry.overflow,false);assert.ok(geometry.fill>.83,`${width}: drawn composition fills the picture well (${geometry.fill})`);assert.ok(geometry.gap<18,`${width}: no transferred whitespace beneath description`);
      const expected=geometry.ratio<=1?'portrait':geometry.ratio>=1.32?'wide':'square';assert.equal(geometry.profile,expected);
      await page.emulateMedia({reducedMotion:'reduce'});await card.screenshot({path:`tmp/output/collage-density/card-${width}.png`});await page.emulateMedia({reducedMotion:'no-preference'});
    }
    await page.setViewportSize({width:1440,height:900});await card.hover();await page.waitForFunction(()=>!!document.querySelector('[data-art="message-collage"][data-playing]'));
    await page.waitForTimeout(80);await page.mouse.move(0,0);await page.waitForTimeout(80);
    const clock=()=>art.evaluate(el=>el.getAnimations({subtree:true}).map(a=>a.currentTime));
    const before=await clock();assert.ok(before.length);await page.waitForTimeout(100);assert.deepEqual(await clock(),before);
    assert.deepEqual(browser.errors,[]);
  }finally{await browser.close();}
});
