// Exact editor seed geometry and the supplied Mattlab painter’s NV-1 design.
import { createRequire } from 'node:module';
import { openPage } from '../browser.mjs';
import { art, esc, num } from '../svg.mjs';

const require = createRequire(import.meta.url);
const Core = require('../../../motrpac-alphabet/mattlab/core.js');
const Glyphs = require('../../../motrpac-alphabet/mattlab/glyphs.js');
// Clear space around each glyph, as a fraction of its height.
const PAD = 0.05;

export async function build() {
  const { page, errors, close } = await openPage('motrpac-alphabet/');
  /** @typedef {{x:number,y:number,width:number,height:number}} Box */
  /** @type {{letter: string, outline: Box, shapes: (Box & {markup:string})[]}[]} */
  let letters;
  /** @type {Box} */
  let logo;
  try {
    letters = await page.evaluate(() => ['A', 'Z'].map(letter => {
      const svg = document.querySelector(`.letter-card[data-letter="${letter}"] svg`);
      if (!svg) throw new Error(`Missing editor seed: ${letter}`);
      const root=/** @type {SVGSVGElement} */(svg), rootMatrix=root.getCTM();
      if(!rootMatrix) throw new Error('Missing glyph transform');
      /** @type {number[]} */
      const xs=[];
      /** @type {number[]} */
      const ys=[];
      const shapes = [...svg.querySelectorAll(':scope > g')].map(g => {
        const node=/** @type {SVGGElement} */(g), bbox=node.getBBox(), matrix=node.getCTM();
        if(!matrix) throw new Error('Missing glyph transform');
        const relative=rootMatrix.inverse().multiply(matrix);
        // The exact filled outline sets the letter's height; the loose box places its selection.
        const path=/** @type {SVGPathElement} */(node.querySelector('path')), length=path.getTotalLength();
        for(let i=0;i<=800;i++){const p=path.getPointAtLength(length*i/800), q=new DOMPoint(p.x,p.y).matrixTransform(relative);xs.push(q.x);ys.push(q.y);}
        const points=[[bbox.x,bbox.y],[bbox.x+bbox.width,bbox.y],[bbox.x,bbox.y+bbox.height],[bbox.x+bbox.width,bbox.y+bbox.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(relative));
        const x=Math.min(...points.map(p=>p.x)), y=Math.min(...points.map(p=>p.y));
        return {markup:g.outerHTML,x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
      });
      const x=Math.min(...xs), y=Math.min(...ys);
      return { letter, outline:{x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y}, shapes };
    }));
    logo = await page.evaluate((/** @type {string[]} */ faces) => {
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.innerHTML=faces.map(d=>`<path d="${d}"/>`).join('');
      document.body.append(svg);
      const {x,y,width,height}=svg.getBBox();
      svg.remove();
      return {x,y,width,height};
    }, Core.FACES.map((/** @type {{d:string}} */ face) => face.d));
    if (errors.length) throw new Error(errors.join('\n'));
  } finally { await close(); }
  const name = 'motrpac-alphabet';
  const design = Glyphs.getDesign('@nv-1');
  if (!design) throw new Error('Missing Mattlab NV-1 design');
  const fill = design.fills;
  const faces = Core.FACES.map((/** @type {{id:string,d:string}} */ face, /** @type {number} */ i) =>
    `<path class="paint-${i}" d="${esc(face.d)}" fill="${fill[face.id]}"/>`).join('');
  // One scale and baseline for the letters; each glyph's viewBox has the same relative clear space,
  // so equal CSS heights draw A, Z and the logo at the same height.
  const capHeight = Math.max(...letters.map(l => l.outline.height));
  const boxes = letters.map(({outline}) => {
    const pad = PAD * capHeight;
    return {x: outline.x - pad, y: outline.y + outline.height - capHeight - pad, width: outline.width + 2 * pad, height: capHeight + 2 * pad};
  });
  const logoPad = PAD * logo.height;
  const logoBox = {x: logo.x - logoPad, y: logo.y - logoPad, width: logo.width + 2 * logoPad, height: logo.height + 2 * logoPad};
  /** @param {{x:number,y:number,width:number,height:number}} b */
  const viewBox = b => `viewBox="${num(b.x)} ${num(b.y)} ${num(b.width)} ${num(b.height)}" style="aspect-ratio:${num(b.width)}/${num(b.height)}"`;
  const pairRatio = boxes.reduce((sum, b) => sum + b.width / b.height, 0), logoRatio = logoBox.width / logoBox.height;
  // Both editors work on light paper: keep the actual logo colours legible in dark mode too.
  const body = `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="logo-layout">
    <div class="group"><span>MotRPAC alphabet</span><div class="glyphs">
    ${letters.map((letter,k)=>`<svg xmlns="http://www.w3.org/2000/svg" ${viewBox(boxes[k])}>${letter.shapes.map((g,i)=>`<g class="piece-${k}-${i}" style="transform-origin:${num(g.x+g.width/2)}px ${num(g.y+g.height/2)}px">${g.markup}${i===1?`<g class="selection selection-${k}" fill="white" stroke="#396e9c" stroke-width="24"><rect x="${num(g.x-40)}" y="${num(g.y-40)}" width="${num(g.width+80)}" height="${num(g.height+80)}" fill="none" stroke-dasharray="50 35"/>${[[g.x-40,g.y-40],[g.x+g.width+40,g.y-40],[g.x-40,g.y+g.height+40],[g.x+g.width+40,g.y+g.height+40]].map(([x,y])=>`<rect x="${num(x-35)}" y="${num(y-35)}" width="70" height="70"/>`).join('')}</g>`:''}</g>`).join('')}</svg>`).join('')}
    </div></div><div class="group"><span>Mattlab</span><svg xmlns="http://www.w3.org/2000/svg" ${viewBox(logoBox)}>${faces}</svg></div></div></foreignObject>`;
  const loop = letters.flatMap((letter,k)=>letter.shapes.map((g,i)=>{
    const dx=(i%2?1:-1)*(110+i*25),dy=(i%3-1)*180,scale=.65+(i%3)*.1,start=4+k*14+i*2,end=start+12;
    return `& .piece-${k}-${i} { animation: ${name}-piece-${k}-${i} 9s ease-in-out infinite; }
      @keyframes ${name}-piece-${k}-${i} {0%,${start}%{transform:translate(${dx}px,${dy}px) scale(${scale})}${end}%,92%{transform:translate(0px,0px) scale(1)}100%{transform:translate(${dx}px,${dy}px) scale(${scale})}}`;
  })).join('\n') +
    letters.map((_,k)=>`& .selection-${k}{animation:${name}-select-${k} 9s linear infinite}
      @keyframes ${name}-select-${k}{0%,${6+k*14}%{opacity:0}${8+k*14}%,${19+k*14}%{opacity:1}${22+k*14}%,100%{opacity:0}}`).join('\n') +
    Core.FACES.map((_,i)=>`& .paint-${i} { animation: ${name}-paint-${i} 9s linear infinite; }
    @keyframes ${name}-paint-${i} { 0%,${30+i*1.8}% {fill:var(--art-line)} ${32+i*1.8}%,94% {fill:${fill[Core.FACES[i].id]}} 100% {fill:var(--art-line)} }`).join('\n');
  // --h is the shared glyph height: the larger of what fits in one row and what fits with the logo
  // below. When the second is larger the row is too wide at that height, so the logo wraps below.
  const lead = 'calc(var(--label)*1.25 + var(--label-gap))';
  const row = `min(calc(100cqh - 2*var(--pad-y) - ${lead}),calc((100cqw - 2*var(--pad-x) - var(--gap) - var(--pair) - 2px)/${num(pairRatio + logoRatio, 4)}))`;
  const stacked = `min(calc((100cqh - 2*var(--pad-y) - 2*${lead} - var(--row-gap))/2),calc((100cqw - 2*var(--pad-x) - var(--pair))/${num(pairRatio, 4)}),calc((100cqw - 2*var(--pad-x))/${num(logoRatio, 4)}))`;
  return art({ name, body, responsive:true, loop, period:9,
    css:`& .logo-layout{--label:clamp(10px,min(4.8cqw,10cqh),19px);--label-gap:1.5cqh;--pad-y:4cqh;--pad-x:3cqw;--gap:6cqw;--row-gap:4cqh;--pair:2.5cqw;box-sizing:border-box;height:100%;background:#fff;padding:var(--pad-y) var(--pad-x);display:flex;flex-wrap:wrap;align-items:center;align-content:center;justify-content:center;column-gap:var(--gap);row-gap:var(--row-gap);
  --h:max(${row},${stacked})}
& .group{display:flex;flex-direction:column;align-items:center;gap:var(--label-gap);min-width:0}
& .glyphs{display:flex;gap:var(--pair)}
& .logo-layout span{text-align:center;color:#53606c;font:var(--label)/1.25 system-ui,sans-serif;overflow-wrap:break-word}
& .logo-layout svg{display:block;height:var(--h);width:auto;overflow:visible}
& .selection{opacity:0}` });
}
