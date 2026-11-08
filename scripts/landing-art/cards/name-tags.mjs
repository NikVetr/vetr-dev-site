// Accepted iterates of the actual winning BFGS restart and whole-twist refinement, then engraving.
import { readFileSync } from 'node:fs';
import { normalizeRequest } from '../../../name-tags/core/request.js';
import { submit } from '../../../name-tags/core/index.js';
import { BALANCED_STYLE } from '../../../name-tags/presets.js';
import { art, num, simplifyPath } from '../svg.mjs';

const PERIOD = 10;
const W=360,H=125;

export async function build() {
  const read = (/** @type {string} */ f) => readFileSync(new URL(`../../../name-tags/examples/${f}`, import.meta.url), 'utf8');
  // A real five-column tray fills the wide card; all fifteen names use the same core fit.
  const names = [...read('historical-figures.txt').trim().split('\n'),'Katherine Johnson','Dorothy Hodgkin','Mary Anning'];
  const tray = {...JSON.parse(read('tray-4x3.json')),name:'landing_5x3',grid:[5,3],page_in:[15,6]};
  const request={names,tray,style:BALANCED_STYLE};
  const normalized=normalizeRequest(request);
  /** @type {Parameters<NonNullable<NonNullable<Parameters<typeof submit>[1]>['onFitTrace']>>[1][][]} */
  const traces=[];
  const result=submit(request,{onFitTrace:(i,trace)=>(traces[i]??=[]).push(trace)});
  if (result.sheets.length !== 1) throw new Error('name-tags: the example should fill one sheet');
  const svg = result.sheets[0].svg;

  // The cells' extent on the page (inches, y up), mapped into the canvas (the sheet is 96 units
  // per inch, y down).
  const [cw, ch] = tray.cell_in;
  const [cols, rows] = tray.grid;
  const [sx, sy] = tray.spacing_in;
  const left = tray.first_center_in[0] - cw / 2;
  const bottom = tray.first_center_in[1] - ch / 2;
  const width = cols * cw + (cols - 1) * sx;
  const height = rows * ch + (rows - 1) * sy;
  const k = Math.min((W - 8) / width, (H - 4) / height) / 96;
  const top = (tray.page_in[1] - bottom - height) * 96;
  const ox = (W - width * 96 * k) / 2 - left * 96 * k;
  const oy = (H - height * 96 * k) / 2 - top * k;
  const at = (/** @type {number} */ x, /** @type {number} */ y) => [ox + x * k, oy + y * k];

  const paths = [...svg.matchAll(/<path ([^>]*?)d="([^"]+)"/g)];
  const cells = paths.filter(([, attrs]) => attrs.includes('stroke="#333333"')).map(([, , d]) => simplifyPath(d, at, 0.05)).join('');
  const engraving = paths.filter(([, attrs]) => attrs.includes('fill="#000000"')).map(([, , d]) => simplifyPath(d, at, 0.12)).join('');
  if (!cells || !engraving) throw new Error('name-tags: the sheet has no cells or engraving');

  // The SVG orders each cell's glyphs by line, followed by its helix.
  /** @type {string[]} */
  const groups = [];
  let tagIndex = -1, glyphIndex = 0;
  for (const [, attrs, d] of paths) {
    if (attrs.includes('stroke="#333333"')) { tagIndex++; glyphIndex = 0; continue; }
    if (!attrs.includes('fill="#000000"')) continue;
    const counts = result.tags[tagIndex].lines.map((/** @type {string} */ line) => [...line.replaceAll(' ', '')].length);
    const part = glyphIndex < counts[0] ? 0 : glyphIndex < counts[0] + counts[1] ? 1 : 2;
    const index = tagIndex * 3 + part;
    groups[index] = (groups[index] ?? '') + simplifyPath(d, at, 0.12);
    glyphIndex++;
  }
  const clips=[];
  const pieces=[];
  const motions=[];
  for(let i=0;i<result.tags.length;i++){
    const runs=traces[i];
    const previousFinal=runs.slice(0,-1).map(run=>run.stage).lastIndexOf(2);
    const stage1=runs.slice(previousFinal+1).filter(run=>run.stage===1);
    const winner=stage1.reduce((a,b)=>b.result.value<a.result.value?b:a);
    const final=runs.at(-1);
    if(!final||final.stage!==2)throw new Error('name-tags: missing final fit trace');
    const steps=[...winner.steps,...final.steps,{par:final.result.par,value:final.result.value}];
    const fit=result.tags[i].fit;
    if(JSON.stringify(final.result.par)!==JSON.stringify([fit.w1,fit.w2,fit.h2]))throw new Error('name-tags: trace endpoint does not match exported layout');
    const [cx,cy]=at(normalized.tray.centers[i][0]*96,(tray.page_in[1]-normalized.tray.centers[i][1])*96);
    const unit=(cw-cw/normalized.style.inner_margin_div)*96*k;
    const adjX=normalized.style.name_center_adj_prop[0]*cw*96*k,adjY=-normalized.style.name_center_adj_prop[1]*ch*96*k;
    const last=candidateBoxes(final.geometry,final.result.par);
    // Random BFGS starts may violate fit constraints; show their actual geometry within the physical tag.
    clips.push(`<clipPath id="name-tags-cell-${i}"><rect x="${num(cx-cw*96*k/2)}" y="${num(cy-ch*96*k/2)}" width="${num(cw*96*k)}" height="${num(ch*96*k)}"/></clipPath>`);
    for(let part=0;part<3;part++){
      const id=i*3+part;
      const source=last[part];
      const left=cx+adjX+source.x*unit,top=cy+adjY+source.y*unit;
      const path=part<2?`<path class="piece piece-${id}" d="${groups[id]}"/>`:
        `<rect class="piece reservation piece-${id}" x="${num(left)}" y="${num(top)}" width="${num(source.w*unit)}" height="${num(source.h*unit)}"/>`;
      pieces.push(`<g clip-path="url(#name-tags-cell-${i})" data-restart="${winner.run}">${path}</g>`);
      const frames=steps.map((step,j)=>{
        const box=candidateBoxes(final.geometry,step.par)[part];
        const sx=box.w/source.w,sy=box.h/source.h;
        const tx=cx+adjX+box.x*unit-sx*left,ty=cy+adjY+box.y*unit-sy*top;
        return `${num(5+29*j/(steps.length-1),5)}% { transform:matrix(${num(sx,6)},0,0,${num(sy,6)},${num(tx,5)},${num(ty,5)}); }`;
      });
      motions.push(`& .piece-${id} { animation:name-tags-fit-${id} ${PERIOD}s step-end infinite; }
@keyframes name-tags-fit-${id} { 0% ${frames[0].slice(frames[0].indexOf('{'))} ${frames.join(' ')} 100% { transform:none; } }`);
    }
  }
  return art({
    name: 'name-tags', period: PERIOD, width:W,height:H,
    defs: `${clips.join('')}<path id="name-tags-design" d="${engraving}"/>
<clipPath id="name-tags-etched"><rect class="scan-window" width="${W}" height="${H}"/></clipPath>
<mask id="name-tags-contact" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><use href="#name-tags-design" fill="white" stroke="white" stroke-width="1"/></mask>`,
    body: `<g class="cycle"><g class="layout"><g class="fitting">${pieces.join('')}</g><path class="fitted piece" d="${groups.filter((_,i)=>i%3===2).join('')}"/></g>
<g clip-path="url(#name-tags-etched)"><rect class="paper" width="${W}" height="${H}"/><use class="engraving" href="#name-tags-design"/></g>
<g class="laser-pass"><path class="laser" d="M0 0H${W}"/><g mask="url(#name-tags-contact)"><path class="contact" d="M0 0H${W}"/></g></g>
</g><path class="cells" d="${cells}"/>`,
    css: `& .engraving { fill: var(--art-ink); stroke: var(--art-ink); stroke-width: 0.18; fill-rule: evenodd; }
& .layout { opacity: 0; }
& .piece { fill: none; stroke: #8b939c; stroke-width: 0.45; transform-origin: 0 0; vector-effect:non-scaling-stroke; }
& .cells { fill: none; stroke: var(--art-muted); stroke-width: 0.6; stroke-linejoin: round; }
& .paper { fill: var(--art-paper); }
& .laser-pass { opacity: 0; }
& .laser { stroke: #c92926; stroke-width: 0.6; }
& .contact { stroke: #ff5145; stroke-width: 2.8; stroke-linecap: round; filter: drop-shadow(0 0 1px #ff3228); }`,
    loop: `& .layout { opacity: 1; }
${motions.join('\n')}
& .cycle { animation:name-tags-cycle ${PERIOD}s linear infinite; }
& .reservation { animation:name-tags-fitting ${PERIOD}s linear infinite; }
& .fitted { animation:name-tags-fitted ${PERIOD}s linear infinite; }
@keyframes name-tags-cycle { 0%,100% { opacity:0; } 4%,94% { opacity:1; } }
@keyframes name-tags-fitting { 0%,34% { opacity:1; } 40%,100% { opacity:0; } }
@keyframes name-tags-fitted { 0%,34% { opacity:0; } 40%,100% { opacity:1; } }
& .scan-window { animation: name-tags-reveal ${PERIOD}s linear infinite; }
& .laser, & .contact { animation: name-tags-scan ${PERIOD}s linear infinite; }
& .laser-pass { animation: name-tags-laser ${PERIOD}s linear infinite; }
@keyframes name-tags-reveal { 0%, 43% { transform: translateY(${-H}px); } 83%, 100% { transform: translateY(0); } }
@keyframes name-tags-scan { 0%, 43% { transform: translateY(0); } 83%, 100% { transform: translateY(${H}px); } }
@keyframes name-tags-laser { 0%, 42% { opacity: 0; } 43%, 82% { opacity: 1; } 83%, 100% { opacity: 0; } }`,
  });
}

/** The optimizer's three rectangles in a centered, y-down frame, in inner-width units.
 * @param {{ar1:number,ar3:number,propDist:number}} geometry @param {number[]} par
 */
export function candidateBoxes({ar1,ar3,propDist},[w1,w2,h2]){
  const h1=ar1*w1,w3=h2/ar3;
  const width=Math.max(w1,w2+propDist*h2+w3),height=h1+h2*(1+2*propDist);
  return [{x:-width/2,y:-height/2,w:w1,h:h1},
    {x:-width/2+w2+propDist*h2,y:-height/2+h1+propDist*h2,w:w3,h:h2},
    {x:-width/2,y:-height/2+h1+propDist*h2,w:w2,h:h2}];
}
