import assert from 'node:assert/strict';
import {readFileSync, mkdirSync} from 'node:fs';
import test from 'node:test';
import {openPage} from '../browser.mjs';

const output='tmp/output/preview-repairs';
mkdirSync(output,{recursive:true});
test('raster smoothing changes actual contours during its labeled sweep',async()=>{
 const b=await openPage('about:blank',{width:640,height:360});
 try{
  const svg=readFileSync('assets/cards/raster-to-vector.svg','utf8');
  await b.page.setContent(`<style>body{margin:0;--art-paper:#f3f5f8;--art-ink:#1b1b1b;--art-muted:#6a707a;--art-line:#d3d8e0}svg{width:640px;height:360px}</style><div data-art="raster-to-vector" data-started>${svg}</div>`);
  const art=b.page.locator('[data-art]');
  const seek=async (/** @type {number} */ time)=>art.evaluate((/** @type {Element} */el,/** @type {number} */t)=>{for(const animation of el.getAnimations({subtree:true})){animation.pause();animation.currentTime=t;}},time);
  await seek(7750);
  assert.equal(await art.locator('.process .frame').nth(3).locator('.active .label').textContent(),'Smooth');
  assert.equal(await art.locator('.process .frame').nth(3).locator(':scope > use').getAttribute('href'),'#raster-to-vector-traced');
  const raw=await art.screenshot({path:`${output}/raster-smooth-before.png`});
  await seek(9700);
  const smooth=await art.screenshot({path:`${output}/raster-smooth-after.png`});
  assert.notDeepEqual(raw,smooth,'the Smooth sweep changes the rendered image');
  const contours=await art.evaluate((/** @type {Element} */e)=>['traced','smooth'].map(id=>[...e.querySelectorAll(`#raster-to-vector-${id} path`)].map(p=>p.getAttribute('d')).join('')));
  assert.notEqual(contours[0],contours[1],'actual trace and smooth coordinates differ');
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();}
});
