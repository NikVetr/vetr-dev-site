import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdirSync} from 'node:fs';
import {openPage} from '../../scripts/landing-art/browser.mjs';
const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':'chromium';
const out='tmp/agent/output/helix-path-2026-11-11';mkdirSync(out,{recursive:true});

test(`drawn path controls, real pointer stroke, history and exports work in ${engine}`,async()=>{
 const ctx=await openPage('helix/',{engine});const {page}=ctx;
 try{
  await page.waitForSelector('html[data-ready]');
  const baseline=await page.evaluate(()=>(/** @type {any} */(window)).Helix.exportSvgText());
  await page.locator('#guide-mode').selectOption('drawn');
  await page.waitForSelector('#issues:not([hidden])');assert.equal(await page.locator('#export-svg').isDisabled(),true);
  await page.locator('#path-arc').click();await page.waitForSelector('#issues[hidden]',{state:'attached'});
  const arc=await page.evaluate(()=>(/** @type {any} */(window)).Helix.getResult());assert.ok(arc.request.path);assert.equal(arc.geometry.path.narrowed,false);
  await page.screenshot({path:`${out}/${engine}-arc-desktop.png`});
  await page.locator('#path-clear').click();await page.waitForSelector('#issues:not([hidden])');
  assert.equal(await page.evaluate(()=>(/** @type {any} */(window)).Helix.exportSvgText()),null);
  await page.locator('#undo').click();await page.waitForSelector('#issues[hidden]',{state:'attached'});
  assert.deepEqual(await page.evaluate(()=>(/** @type {any} */(window)).Helix.getResult()),arc);
  await page.locator('#redo').click();await page.waitForSelector('#issues:not([hidden])');
  await page.locator('#path-s').click();await page.waitForSelector('#issues[hidden]',{state:'attached'});
  assert.equal(await page.locator('#redo').isDisabled(),true);
  const beforeStroke=await page.evaluate(()=>(/** @type {any} */(window)).Helix.getResult());
  // Focus transfer from a form field queues its checkpoint during pointerdown.
  await page.locator('#path-width').focus();
  const box=await page.locator('#path-pad').boundingBox();assert.ok(box);
  await page.mouse.move(box.x+box.width*.08,box.y+box.height*.65);await page.mouse.down();
  for(let i=1;i<=30;i++)await page.mouse.move(box.x+box.width*(.08+.84*i/30),box.y+box.height*(.65-.35*Math.sin(Math.PI*i/30)));
  await page.mouse.up();await page.waitForSelector('#issues[hidden]',{state:'attached'});
  assert.ok((await page.evaluate(()=>(/** @type {any} */(window)).Helix.getRequest().path.points.length))>=20);
  const afterStroke=await page.evaluate(()=>(/** @type {any} */(window)).Helix.getResult());
  await page.locator('#undo').click();
  assert.deepEqual(await page.evaluate(()=>(/** @type {any} */(window)).Helix.getResult()),beforeStroke);
  assert.equal(await page.locator('#issues').isVisible(),false);
  await page.locator('#redo').click();
  assert.deepEqual(await page.evaluate(()=>(/** @type {any} */(window)).Helix.getResult()),afterStroke);
  const exports=await page.evaluate(async()=>{const a=(/** @type {any} */(window)).Helix;const png=await a.exportPngBlob({width:400});return{svg:a.exportSvgText(),png:[png.type,png.size],request:a.getRequest()};});
  assert.ok(exports.svg.includes('<svg'));assert.equal(exports.png[0],'image/png');assert.ok(exports.png[1]>1000);
  // Native number editing remains native; app undo is reached from a button.
  await page.locator('#path-width').fill('30');await page.locator('#path-smoothing').focus();
  await page.waitForFunction(()=>(/** @type {any} */(window)).Helix.getResult().request.path.width===30);
  await page.locator('#undo').focus();await page.keyboard.press('Control+z');
  await page.waitForFunction(()=>(/** @type {any} */(window)).Helix.getRequest().path.width===10);
  await page.keyboard.press('Control+Shift+z');await page.waitForFunction(()=>(/** @type {any} */(window)).Helix.getRequest().path.width===30);
  await page.keyboard.press('Meta+z');await page.waitForFunction(()=>(/** @type {any} */(window)).Helix.getRequest().path.width===10);
  for(const [width,height,theme] of [[390,844,'light'],[390,844,'dark'],[844,390,'dark']]){
    await page.setViewportSize({width,height});await page.evaluate((/** @type {string} */t)=>{document.documentElement.dataset.theme=t;},theme);
    await page.locator('#result-heading').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
    await page.screenshot({path:`${out}/${engine}-${width}-${theme}.png`});
  }
  await page.evaluate(()=>(/** @type {any} */(window)).Helix.load({}));assert.equal(await page.evaluate(()=>(/** @type {any} */(window)).Helix.exportSvgText()),baseline);
  assert.deepEqual(ctx.errors,[]);
 }finally{await ctx.close();}
});

test(`touch drawing and cancellation preserve an open path in ${engine}`,async()=>{
 const ctx=await openPage('helix/',{engine,width:390,height:844,touch:true});const {page}=ctx;
 try{
  await page.locator('#guide-mode').selectOption('drawn');await page.locator('#path-arc').tap();
  const initial=await page.evaluate(()=>(/** @type {any} */(window)).Helix.getRequest().path.points);
  await page.locator('#path-pad').evaluate((/** @type {HTMLCanvasElement} */canvas)=>{
   const r=canvas.getBoundingClientRect();
   const event=(/** @type {string} */type,/** @type {number} */x,/** @type {number} */y)=>new PointerEvent(type,{pointerId:8,pointerType:'touch',clientX:r.x+x*r.width,clientY:r.y+y*r.height,bubbles:true});
   // Synthetic events exercise touch routing; pointer capture only exists for a real active pointer.
   canvas.setPointerCapture=()=>{};
   canvas.dispatchEvent(event('pointerdown',.1,.7));canvas.dispatchEvent(event('pointermove',.3,.4));canvas.dispatchEvent(event('pointermove',.7,.3));canvas.dispatchEvent(event('pointerup',.8,.4));
  });
  await page.waitForFunction(()=>(/** @type {any} */(window)).Helix.getRequest().path.points.length===4);
  await page.locator('#undo').tap();assert.deepEqual(await page.evaluate(()=>(/** @type {any} */(window)).Helix.getRequest().path.points),initial);
  await page.locator('#path-pad').evaluate((/** @type {HTMLCanvasElement} */canvas)=>{const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:9,pointerType:'touch',clientX:r.x+10,clientY:r.y+10,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:9,pointerType:'touch',bubbles:true}));});
  assert.deepEqual(await page.evaluate(()=>(/** @type {any} */(window)).Helix.getRequest().path.points),initial);
  await page.locator('#path-pad').evaluate((/** @type {HTMLCanvasElement} */canvas)=>{
    const r=canvas.getBoundingClientRect();
    const event=(/** @type {string} */type,/** @type {number} */i)=>new PointerEvent(type,{pointerId:10,pointerType:'touch',clientX:r.x+(i%2?.8:.2)*r.width,clientY:r.y+r.height*.5,bubbles:true});
    canvas.dispatchEvent(event('pointerdown',0));for(let i=1;i<2050;i++)canvas.dispatchEvent(event('pointermove',i));canvas.dispatchEvent(event('pointerup',2050));
  });
  assert.ok(await page.locator('#path-feedback').isVisible());
  assert.match(await page.locator('#path-feedback').textContent(),/previous guide was kept/);
  assert.deepEqual(await page.evaluate(()=>(/** @type {any} */(window)).Helix.getRequest().path.points),initial);
  assert.deepEqual(ctx.errors,[]);
 }finally{await ctx.close();}
});
