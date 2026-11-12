// Three actual generic-reference app views: equal weights, automatic comparability weights,
// and the weighted scatterplot. No RP-specific data, targets or presentation is selected.
import { openPage } from '../browser.mjs';
import { art, esc } from '../svg.mjs';

export async function build() {
  const { page, errors, close } = await openPage('ceo-salary-benchmark/', { width: 1440, height: 900 });
  try {
    await page.waitForSelector('#salary-chart .bar-block');
    const expenses = Number(await page.locator('#target-expense').inputValue()) * 1e6;
    const staff = Number(await page.locator('#target-staff').inputValue());
    if (!(expenses > 0 && staff > 0)) throw new Error('benchmark: invalid reference inputs');
    const expenseLabel = new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:0}).format(expenses);
    // Render at the drawing's native dimensions so axes remain readable on the card.
    await page.locator('#chart-wrap').evaluate((/** @type {HTMLElement} */ el)=>{
      el.style.flex='none';el.style.width='320px';el.style.height='236px';el.style.minHeight='0';el.style.maxHeight='none';
    });
    await page.waitForFunction(()=>document.querySelector('#salary-chart')?.getAttribute('viewBox')==='0 0 320 236');
    // A single median marker remains readable as weights change in this small view.
    await page.locator('#quantile-granularity').selectOption('custom');
    await page.locator('#custom-quantiles').fill('50');
    await page.locator('#custom-quantiles').blur();
    /** @type {{label:string, chart:string, geometry:string}[]} */
    const views=[];
    const capture=async (/** @type {string} */ label)=>{
      const {chart,geometry}=await page.evaluate((/** @type {number} */ frame)=>{
        const source=/** @type {SVGSVGElement} */ (document.querySelector('#salary-chart'));
        // Preserve marks and values, but give card-scale axes readable type.
        // The app's outer ticks otherwise run beyond its narrow chart edge.
        for(const text of source.querySelectorAll('text'))text.style.fontSize='12px';
        for(const text of source.querySelectorAll('text.percentile'))text.textContent=text.textContent;
        for(const child of source.children){
          if(!(child instanceof SVGTextElement))continue;
          if(!child.hasAttribute('transform')){
            if(child.getAttribute('text-anchor')==='end')child.setAttribute('x',String(Number(child.getAttribute('x'))+6));
            const bounds=child.getBBox();
            if(bounds.x+bounds.width>316)child.setAttribute('text-anchor','end');
            if(bounds.x<4)child.setAttribute('text-anchor','start');
          }
        }
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
        clone.setAttribute('x','0');clone.setAttribute('y','26');
        clone.setAttribute('width','320');clone.setAttribute('height','236');
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
    return art({name:'ceo-salary-benchmark',period:12,width:320,height:280,
      body:`<rect width="320" height="280" fill="#fff" rx="4"/>${views.map(({label,chart},i)=>`<g class="view view-${i}"><text class="title" x="160" y="17">${esc(label)}</text>${chart}</g>`).join('')}<text class="inputs" x="160" y="276">Example: ${esc(expenseLabel)} expenses · ${staff} staff</text>`,
      css:`& .view:not(.view-0) { opacity:0; }
& .title, & .inputs { fill:#243542;font-family:ui-sans-serif,system-ui,sans-serif;text-anchor:middle; }
& .title { font-size:14px;font-weight:600; }
& .inputs { font-size:12px; fill:#586875; }
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
