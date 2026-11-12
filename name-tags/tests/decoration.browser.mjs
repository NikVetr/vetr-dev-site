import assert from 'node:assert/strict';
import {test} from 'node:test';
import {openPage} from '../../scripts/landing-art/browser.mjs';
const engine=/** @type {'chromium'|'webkit'} */(process.env.BROWSER_ENGINE||'chromium');

test('decoration modal keeps drafts isolated, invalidates Apply and restores request/export history',async()=>{
 const b=await openPage('name-tags/',{engine});const{page}=b;
 try{
  await page.waitForSelector('html[data-ready=true]');
  const request=()=>page.evaluate(()=>/** @type {any} */(window).NameTags.getRequest());
  const initial=await request();
  const open=async()=>{await page.locator('#customize-decoration').click();await page.waitForFunction(()=>!/** @type {HTMLButtonElement} */(document.querySelector('#apply-decoration')).disabled);return page.frameLocator('#decoration-editor-host iframe');};
  let child=await open();
  await child.locator('input[name=mode][value=braid]').check();
  await page.waitForFunction(()=>!/** @type {HTMLButtonElement} */(document.querySelector('#apply-decoration')).disabled);
  await page.locator('#cancel-decoration').click();
  assert.deepEqual(await request(),initial);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'customize-decoration');
  child=await open();
  await child.locator('input[name=mode][value=braid]').check();
  const width=child.locator('input[type=number][data-path="braid.width"]');
  await width.fill('-1');
  await page.waitForFunction(()=>/** @type {HTMLButtonElement} */(document.querySelector('#apply-decoration')).disabled);
  // Parent-origin or old-frame messages must not reactivate Apply.
  await page.evaluate(()=>window.postMessage({type:'helix:change',sessionId:2,request:{mode:'helix'}},location.origin));
  assert.equal(await page.locator('#apply-decoration').isDisabled(),true);
  await page.evaluate(()=>{
    const frame=/** @type {HTMLIFrameElement} */(document.querySelector('#decoration-editor-host iframe'));
    window.dispatchEvent(new MessageEvent('message',{origin:'https://other.example',source:frame.contentWindow,data:{type:'helix:change',sessionId:2,request:{mode:'helix'}}}));
    /** @type {any} */(window).decorationSignals=[];
    window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.origin===location.origin)/** @type {any} */(window).decorationSignals.push({type:event.data.type,disabled:/** @type {HTMLButtonElement} */(document.querySelector('#apply-decoration')).disabled});});
  });
  assert.equal(await page.locator('#apply-decoration').isDisabled(),true);
  await width.fill('20');
  await page.waitForFunction(()=>!/** @type {HTMLButtonElement} */(document.querySelector('#apply-decoration')).disabled);
  const signals=await page.evaluate(()=>/** @type {any} */(window).decorationSignals);
  assert.equal(signals[0].type,'helix:invalid');assert.equal(signals[0].disabled,true);assert.equal(signals.at(-1).type,'helix:change');
  await page.locator('#apply-decoration').click();
  const applied=await request();assert.equal(applied.decoration_design.mode,'braid');assert.equal(applied.decoration_design.braid.width,20);
  assert.equal(await page.locator('#stale').isVisible(),true);
  await page.keyboard.press('Control+z');assert.deepEqual(await request(),initial);
  await page.keyboard.press('Control+Shift+z');assert.deepEqual(await request(),applied);
  // Generate is its own checkpoint; undo keeps the previously exported sheet.
  const oldSvg=await page.evaluate(()=>/** @type {any} */(window).NameTags.exportSvgText());
  await page.locator('#generate').click();
  await page.waitForFunction(()=>/** @type {any} */(window).NameTags.getResult()?.decoration_design?.mode==='braid');
  const newSvg=await page.evaluate(()=>/** @type {any} */(window).NameTags.exportSvgText());assert.notEqual(newSvg,oldSvg);
  await page.locator('#undo-replace').click();assert.equal(await page.evaluate(()=>/** @type {any} */(window).NameTags.exportSvgText()),oldSvg);
  await page.locator('#redo').click();assert.equal(await page.evaluate(()=>/** @type {any} */(window).NameTags.exportSvgText()),newSvg);
  child=await open();await child.locator('input[name=mode][value=helix]').check();
  await child.locator('input[type=number][data-path="helix.turns"]').focus();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!/** @type {HTMLDialogElement} */(document.querySelector('#decoration-dialog')).open);
  assert.deepEqual(await request(),applied);assert.equal(await page.evaluate(()=>document.activeElement?.id),'customize-decoration');
  await page.locator('#reset-decoration').click();assert.equal((await request()).decoration_design,undefined);
  await page.keyboard.press('Control+z');assert.deepEqual(await request(),applied);
  await page.locator('#decoration').selectOption('none');assert.equal((await request()).decoration_design,undefined);
  await page.locator('#decoration').selectOption('dna');assert.deepEqual((await request()).decoration_design,applied.decoration_design);
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();}
});
