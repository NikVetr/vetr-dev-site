// @ts-check
// Check the rendered exports, including animation states, rather than only the
// builders' intended coordinates. These drawings must stay readable at card size.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {openPage} from '../browser.mjs';

const css=readFileSync(new URL('../../../style.css',import.meta.url),'utf8');
const benchmark=readFileSync(new URL('../../../assets/cards/ceo-salary-benchmark.svg',import.meta.url),'utf8');
const sankey=readFileSync(new URL('../../../assets/cards/sankey.svg',import.meta.url),'utf8');
const engine=/** @type {'chromium'|'webkit'|'firefox'} */(process.env.BROWSER_ENGINE??'chromium');

test(`Benchmark axes remain legible and Sankey column extremes align in ${engine}`,async()=>{
 const browser=await openPage('about:blank',{engine});
 const {page}=browser;
 try{
  await page.setContent(`<style>${css}</style><div class="card-art" data-art="ceo-salary-benchmark" style="width:calc(100vw - 78px);max-width:345px;aspect-ratio:8/7">${benchmark}</div><div class="card-art" data-art="sankey" style="width:100%;max-width:538px;aspect-ratio:16/9">${sankey}</div>`);
  for(const width of [360,390,1440]){
   await page.setViewportSize({width,height:900});
   for(const theme of ['light','dark']){
    await page.evaluate((/** @type {string} */ theme)=>{document.documentElement.dataset.theme=theme;},theme);
    const art=page.locator('[data-art="ceo-salary-benchmark"]');
    await art.evaluate((/** @type {Element} */ el)=>{el.setAttribute('data-started','');for(const a of el.getAnimations({subtree:true}))a.pause();});
    for(const [index,time]of [0,5000,9000].entries()){
     await art.evaluate((/** @type {Element} */ el,/** @type {number} */ time)=>{for(const a of el.getAnimations({subtree:true}))a.currentTime=time;},time);
     const views=await art.locator('.view').evaluateAll((/** @type {Element[]} */ elements)=>elements.map(el=>Number(getComputedStyle(el).opacity)));
     assert.deepEqual(views,[0,1,2].map(i=>i===index?1:0),'one complete chart is visible in each phase');
     /** @type {{size:number,left:number,right:number,top:number,bottom:number}[]} */
     const labels=await art.locator(`.view-${index} > svg text`).evaluateAll((/** @type {Element[]} */ elements)=>elements.filter(el=>el.textContent?.trim()).map(el=>{
      const m=/** @type {SVGGraphicsElement} */(el).getScreenCTM();
      if(!m)throw new Error('Missing chart text transform');
      const b=el.getBoundingClientRect();
      return {size:parseFloat(getComputedStyle(el).fontSize)*Math.hypot(m.a,m.b),left:b.left,right:b.right,top:b.top,bottom:b.bottom};
     }));
     assert.ok(labels.length>=5,'axis text is present');
     const minimum=Math.min(...labels.map(l=>l.size));
     assert.ok(minimum>=10.5,`readable chart text at ${width}px (${minimum}px)`);
     const bounds=await art.boundingBox();assert.ok(bounds);
     assert.ok(labels.every(l=>l.left>=bounds.x-.25&&l.right<=bounds.x+bounds.width+.25&&l.top>=bounds.y-.25&&l.bottom<=bounds.y+bounds.height+.25),'chart labels fit the preview without clipping');
    }
    assert.doesNotMatch(await art.innerText(),/\bRP\b|Rethink Priorities/);
    const diagram=page.locator('[data-art="sankey"]');
    assert.equal(await diagram.locator('.caption').textContent(),'560 records');
    /** @type {{top:number,bottom:number}[]} */
    const columns=await diagram.locator('defs > path[id^="sankey-n"]').evaluateAll((/** @type {Element[]} */ elements)=>{
     /** @type {Map<number,{top:number,bottom:number}>} */
     const columns=new Map();
     for(const el of elements){
      const b=/** @type {SVGGraphicsElement} */(el).getBBox(),x=Math.round(b.x+b.width/2),prior=columns.get(x);
      columns.set(x,{top:Math.min(prior?.top??Infinity,b.y),bottom:Math.max(prior?.bottom??-Infinity,b.y+b.height)});
     }
     return [...columns.values()];
    });
    assert.equal(columns.length,3,'three stage columns remain');
    for(const edge of /** @type {const} */(['top','bottom'])){
     const values=columns.map(c=>c[edge]);
     assert.ok(Math.max(...values)-Math.min(...values)<=.2,`exported node ${edge}s align`);
    }
    /** @type {number[]} */
    const records=await diagram.locator('.patients > path').evaluateAll((/** @type {Element[]} */ elements)=>elements.map(el=>Number(el.getAttribute('data-record'))));
    assert.equal(records.length,80,'the same distributed subset of complete member paths remains');
    assert.equal(new Set(records).size,80);
    assert.ok(records.every(id=>id>=0&&id<560));
   }
  }
  assert.deepEqual(browser.errors,[]);
 }finally{await browser.close();}
});
