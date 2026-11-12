import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import test from 'node:test';
import {openPage} from '../browser.mjs';

mkdirSync('tmp/agent/output/preview-polish-2026-11-11',{recursive:true});
const engine=/** @type {'chromium'|'webkit'|'firefox'} */(process.env.BROWSER_ENGINE??'chromium');

test(`Alice uses word order and a readable head close-up; pause/reduced motion work in ${engine}`,async()=>{
 const b=await openPage('',{engine});const p=b.page;
 try{
  const art=p.locator('[data-art="text-in-image"]'),card=p.locator('.project-card').filter({has:art});
  await art.scrollIntoViewIfNeeded();await art.locator('svg').waitFor();assert.equal(await art.locator('.word').count(),950);
  assert.equal(await art.locator('.word').first().getAttribute('data-text'),'Alice');
  await card.hover();await p.waitForFunction(()=>document.querySelector('[data-art="text-in-image"]')?.hasAttribute('data-playing'));
  await p.waitForFunction(()=>document.querySelector('[data-art="text-in-image"] .word:last-child')?.getAttribute('style')?.includes('hidden'));
  const seek=async(/** @type {number} */ t)=>{
   return art.evaluate(async(/** @type {Element} */ e,/** @type {number} */ time)=>{
    for(const a of e.getAnimations({subtree:true}))a.currentTime=time;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const words=[...e.querySelectorAll('.word')],flags=words.map(w=>getComputedStyle(w).visibility==='visible'),camera=e.querySelector('.camera');
    if(!camera)throw Error('No camera');
    const first=/** @type {SVGGraphicsElement} */(words[0]),m=first.getScreenCTM(),box=first.getBBox();
    const clock=Number(e.getAnimations({subtree:true})[0]?.currentTime??0)%18000;
    const due=words.map(w=>Number(w.getAttribute('data-reveal'))<=clock);
    return{flags,due,scale:(/** @type {SVGGraphicsElement} */(camera)).transform.baseVal.consolidate()?.matrix.a??1,letterHeight:box.height*Math.hypot(m?.b??0,m?.d??0)};
   },t);
  };
  const opening=await seek(1000);assert.ok(opening.scale>7.8);assert.ok(opening.letterHeight>=9,'the initial enlarged word must be readable at the native tile scale');assert.deepEqual(opening.flags,opening.due,'every due whole word follows the actual retained clock');assert.ok(opening.flags.some(Boolean)&&!opening.flags.every(Boolean));
  await art.screenshot({path:`tmp/agent/output/preview-polish-2026-11-11/alice-${engine}-head.png`});
  const middle=await seek(9000);assert.ok(middle.scale>1&&middle.scale<opening.scale);const visible=middle.flags.filter(Boolean).length;assert.ok(visible>100&&visible<900);assert.ok(middle.flags.every((/** @type {boolean} */v,/** @type {number} */i)=>v===(i<visible)),'words appear as a complete left-to-right prefix, not whole-line fades');
  await art.screenshot({path:`tmp/agent/output/preview-polish-2026-11-11/alice-${engine}-middle.png`});
  const full=await seek(15000);assert.equal(full.scale,1);assert.ok(full.flags.every(Boolean));
  await art.screenshot({path:`tmp/agent/output/preview-polish-2026-11-11/alice-${engine}-full.png`});
  await seek(6500);await p.mouse.move(0,0);await p.waitForTimeout(70);const frozen=await art.screenshot();await p.waitForTimeout(160);assert.deepEqual(await art.screenshot(),frozen,'camera and word reveal pause together');
  await card.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');await p.waitForFunction(()=>document.querySelector('[data-art="text-in-image"]')?.hasAttribute('data-playing'));await p.waitForTimeout(150);assert.notDeepEqual(await art.screenshot(),frozen,'keyboard focus resumes the retained timeline');
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>!document.querySelector('[data-art="text-in-image"]')?.hasAttribute('data-started'));
  assert.equal(await art.locator('.word').evaluateAll((/** @type {Element[]} */ words)=>words.every(w=>getComputedStyle(w).visibility==='visible')),true);
  assert.equal(await art.locator('.camera').evaluate((/** @type {Element} */ e)=>getComputedStyle(e).transform),'none');
  await p.setViewportSize({width:390,height:844});
  await card.evaluate((/** @type {HTMLElement} */ el)=>el.scrollIntoView({block:'center'}));
  await p.emulateMedia({reducedMotion:'no-preference'});
  await p.waitForFunction(()=>document.querySelector('[data-art="text-in-image"]')?.hasAttribute('data-playing'));
  for(const theme of ['light','dark']){
   await p.evaluate((/** @type {string} */ t)=>document.documentElement.dataset.theme=t,theme);
   const phone=await seek(2200);assert.ok(phone.letterHeight>=9);
   await art.screenshot({path:`tmp/agent/output/preview-polish-2026-11-11/alice-${engine}-phone-${theme}.png`});
  }
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();}
});

test(`crossword ink remains legible in both native themes in ${engine}`,async()=>{
 const b=await openPage('',{engine});const p=b.page;
 try{
  await p.emulateMedia({reducedMotion:'reduce'});const art=p.locator('[data-art="crossword"]');await art.scrollIntoViewIfNeeded();await art.locator('svg').waitFor();
  for(const theme of ['light','dark']){
   await p.evaluate((/** @type {string} */ theme)=>document.documentElement.dataset.theme=theme,theme);
   const colors=await art.evaluate((/** @type {Element} */ e)=>({letter:getComputedStyle(/** @type {Element} */(e.querySelector('.letters'))).fill,cell:getComputedStyle(/** @type {Element} */(e.querySelector('.cells'))).fill}));
   assert.equal(colors.letter,theme==='dark'?'rgb(255, 255, 255)':'rgb(27, 27, 27)');assert.equal(colors.cell,theme==='dark'?'rgb(22, 24, 29)':'rgb(255, 255, 255)');
   await art.screenshot({path:`tmp/agent/output/preview-polish-2026-11-11/crossword-${engine}-${theme}.png`});
  }
  await p.setViewportSize({width:390,height:844});await art.scrollIntoViewIfNeeded();await art.screenshot({path:`tmp/agent/output/preview-polish-2026-11-11/crossword-${engine}-phone.png`});assert.deepEqual(b.errors,[]);
 }finally{await b.close();}
});
