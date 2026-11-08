// Three actual generic-reference app views: equal weights, automatic comparability weights,
// and the weighted scatterplot. No RP-specific data, targets or presentation is selected.
import { openPage } from '../browser.mjs';
import { art, esc } from '../svg.mjs';

export async function build() {
  const { page, errors, close } = await openPage('ceo-salary-benchmark/', { width: 1440, height: 900 });
  try {
    await page.waitForSelector('#salary-chart .bar-block');
    // Ask the real responsive renderer for the thumbnail's wide chart proportions.
    await page.locator('#chart-wrap').evaluate((/** @type {HTMLElement} */ el)=>{
      el.style.flex='none';el.style.width='640px';el.style.height='200px';el.style.minHeight='0';el.style.maxHeight='none';
    });
    await page.waitForFunction(()=>document.querySelector('#salary-chart')?.getAttribute('viewBox')==='0 0 640 200');
    /** @type {{label:string, chart:string, geometry:string}[]} */
    const views=[];
    const capture=async (/** @type {string} */ label)=>{
      const {chart,geometry}=await page.evaluate((/** @type {number} */ frame)=>{
        const source=/** @type {SVGSVGElement} */ (document.querySelector('#salary-chart'));
        const clone=/** @type {SVGSVGElement} */ (source.cloneNode(true));
        const original=[source,...source.querySelectorAll('*')],copied=[clone,...clone.querySelectorAll('*')];
        original.forEach((element,i)=>{
          const style=getComputedStyle(element);
          for(const prop of ['fill','stroke','stroke-width','stroke-dasharray','paint-order','font-size','font-family','font-weight','text-anchor','opacity']) copied[i].setAttribute(prop,style.getPropertyValue(prop));
          for(const attr of ['tabindex','role','aria-label','aria-labelledby'])copied[i].removeAttribute(attr);
          const id=copied[i].getAttribute('id');
          if(id)copied[i].setAttribute('id',`ceo-salary-benchmark-${frame}-${id}`);
          for(const attr of [...copied[i].attributes]){
            if(attr.value.includes('url(#'))copied[i].setAttribute(attr.name,attr.value.replaceAll('url(#',`url(#ceo-salary-benchmark-${frame}-`));
          }
        });
        clone.setAttribute('x','0');clone.setAttribute('y','22');
        clone.setAttribute('width','320');clone.setAttribute('height','88');
        const geometry=JSON.stringify([...source.querySelectorAll('.bar-block')].map(el=>['x','y','width','height'].map(attr=>el.getAttribute(attr))));
        return {chart:clone.outerHTML,geometry};
      },views.length);
      views.push({label,chart,geometry});
    };
    // Clear all weighting components to make the first state explicit, even if defaults change.
    for(const checkbox of await page.locator('#weighting-field input[type="checkbox"]').all()) await checkbox.uncheck();
    await capture('Equal weights');
    await page.locator('#weighting-field input[value="comparability"]').check();
    await page.waitForFunction(()=>document.querySelector('#weighting-description')?.textContent?.toLowerCase().includes('automatic'));
    await capture('Automatic weights');
    if(views[0].geometry===views[1].geometry)throw new Error('benchmark: automatic weights did not change the histogram');
    await page.locator('#chart-tab-scatter').click();
    await page.waitForSelector('#salary-chart .scatter-point');
    await capture('Weighted scatterplot');
    if(errors.length)throw new Error(`benchmark card: ${errors.join('; ')}`);
    return art({name:'ceo-salary-benchmark',period:12,width:320,height:125,
      body:`<rect width="320" height="125" fill="#fff" rx="4"/>${views.map(({label,chart},i)=>`<g class="view view-${i}"><text class="title" x="160" y="14">${esc(label)}</text>${chart}</g>`).join('')}<text class="reference" x="160" y="119">Generic reference · $10m / 50 staff</text>`,
      css:`& .view:not(.view-0) { opacity:0; }
& .title, & .reference { fill:#243542;font-family:ui-sans-serif,system-ui,sans-serif;text-anchor:middle; }
& .title { font-size:13px;font-weight:600; }
& .reference { font-size:10px; }
& .view > svg { background:#fff; }`,
      loop:`& .view-0 { animation:benchmark-equal 12s linear infinite; }
& .view-1 { animation:benchmark-weighted 12s linear infinite; }
& .view-2 { animation:benchmark-scatter 12s linear infinite; }
@keyframes benchmark-equal { 0%,28%,100% { opacity:1; } 32%,94% { opacity:0; } }
@keyframes benchmark-weighted { 0%,28%,65%,100% { opacity:0; } 32%,61% { opacity:1; } }
@keyframes benchmark-scatter { 0%,61%,100% { opacity:0; } 65%,94% { opacity:1; } }`,
    });
  }finally{await close();}
}
