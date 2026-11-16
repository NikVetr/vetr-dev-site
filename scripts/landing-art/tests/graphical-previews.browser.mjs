// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { openPage } from '../browser.mjs';
import { previewSimulation, histogram } from '../cards/stan2r.mjs';

const css=readFileSync(new URL('../../../style.css',import.meta.url),'utf8');
const names=['stan2r','motrpac-alphabet'];
const art=names.map(name=>readFileSync(new URL(`../../../assets/cards/${name}.svg`,import.meta.url),'utf8'));

test('Stan preview histograms are cumulative draws from the shared sampler',()=>{
  const result=previewSimulation();
  assert.deepEqual(result.model.edges,[{from:'trials',to:'successes'},{from:'theta',to:'successes'}]);
  let states=0;
  for(const group of art[0].matchAll(/<g class="samples samples-\d+" data-draws="(\d+)">(.*?)(?=<g class="samples|<\/svg>)/gs)){
    states++;
    const count=Number(group[1]);
    for(const [id,bins,upper] of /** @type {[string,number,number][]} */([['theta',16,1],['successes',21,21]])){
      const section=group[2].match(new RegExp(`<g data-variable="${id}">(.*?)(?:</g>|$)`,'s'));
      assert.ok(section);
      const counts=[...section[1].matchAll(/data-count="(\d+)"/g)].map(m=>Number(m[1]));
      assert.deepEqual(counts,histogram(result.samples[id],count,bins,upper));
      assert.equal(counts.reduce((a,b)=>a+b,0),count);
    }
  }
  assert.equal(states,7);
});

test('graph simulations advance and alphabet pieces move and resize, with logo painting retained',async()=>{
 const browser=await openPage('about:blank');const {page}=browser;
 try{
  await page.setContent(`<style>${css}.card-art{width:320px!important;height:180px!important;min-height:0!important;flex:none!important}</style>`+names.map((name,i)=>`<div class="card-art" data-art="${name}">${art[i]}</div>`).join(''));
  const stan=page.locator('[data-art="stan2r"]'),alphabet=page.locator('[data-art="motrpac-alphabet"]');
  for(const theme of ['light','dark']){
   await page.evaluate((/** @type {string} */ theme)=>{document.documentElement.dataset.theme=theme;},theme);
   await page.evaluate(()=>{for(const e of document.querySelectorAll('[data-art]'))e.setAttribute('data-started','');});
   /** @param {number} time */
   const seek=async time=>page.evaluate((/** @type {number} */ time)=>{for(const a of document.getAnimations()){a.pause();a.currentTime=time;}},time);
   for(const [i,count]of [8,24,64,128,256,512,1024].entries()){
    await seek((i*11+5)/100*9000);
    const visible=await stan.locator('.samples').evaluateAll((/** @type {Element[]} */ elements)=>elements.filter(el=>Number(getComputedStyle(el).opacity)>.5).map(el=>Number(el.getAttribute('data-draws'))));
    assert.deepEqual(visible,[count]);
   }
   await seek(600);
   const before=await alphabet.locator('.piece-0-1').boundingBox();assert.ok(before);
   const paintBefore=await alphabet.locator('.paint-0').evaluate((/** @type {Element} */ el)=>getComputedStyle(el).fill);
   await seek(7500);
   const after=await alphabet.locator('.piece-0-1').boundingBox();assert.ok(after);
   assert.ok(Math.abs(before.x-after.x)>1 || Math.abs(before.y-after.y)>1,'piece changes position');
   assert.ok(after.width>before.width*1.2,'piece resizes to its authored seed geometry');
   assert.notEqual(await alphabet.locator('.paint-0').evaluate((/** @type {Element} */ el)=>getComputedStyle(el).fill),paintBefore);
   for(const preview of [stan,alphabet]){
    const box=await preview.boundingBox();assert.ok(box);
    /** @type {{left:number,right:number,top:number,bottom:number}[]} */
    const labels=await preview.locator('text').evaluateAll((/** @type {Element[]} */ elements)=>elements.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
    assert.ok(labels.every(r=>r.left>=box.x-.5&&r.right<=box.x+box.width+.5&&r.top>=box.y-.5&&r.bottom<=box.y+box.height+.5),'all labels stay in the preview');
   }
  }
  assert.deepEqual(browser.errors,[]);
 }finally{await browser.close();}
});
