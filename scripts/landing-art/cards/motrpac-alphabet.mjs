// Exact editor seed geometry and the supplied Mattlab painter’s NV-1 design.
import { createRequire } from 'node:module';
import { openPage } from '../browser.mjs';
import { art, esc, num } from '../svg.mjs';

const require = createRequire(import.meta.url);
const Core = require('../../../motrpac-alphabet/mattlab/core.js');
const Glyphs = require('../../../motrpac-alphabet/mattlab/glyphs.js');

export async function build() {
  const { page, errors, close } = await openPage('motrpac-alphabet/');
  /** @type {{letter: string, viewBox: string, shapes: {markup:string, x:number,y:number,width:number,height:number}[]}[]} */
  let letters;
  try {
    letters = await page.evaluate(() => ['A', 'M', 'Z'].map(letter => {
      const svg = document.querySelector(`.letter-card[data-letter="${letter}"] svg`);
      if (!svg) throw new Error(`Missing editor seed: ${letter}`);
      return { letter, viewBox: svg.getAttribute('viewBox') || '',
        shapes: [...svg.querySelectorAll(':scope > g')].map(g => {
          const node=/** @type {SVGGElement} */(g), root=/** @type {SVGSVGElement} */(svg);
          const bbox=node.getBBox(), rootMatrix=root.getCTM(), matrix=node.getCTM();
          if(!rootMatrix || !matrix) throw new Error('Missing glyph transform');
          const relative=rootMatrix.inverse().multiply(matrix);
          const points=[[bbox.x,bbox.y],[bbox.x+bbox.width,bbox.y],[bbox.x,bbox.y+bbox.height],[bbox.x+bbox.width,bbox.y+bbox.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(relative));
          const x=Math.min(...points.map(p=>p.x)), y=Math.min(...points.map(p=>p.y));
          return {markup:g.outerHTML,x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
        }) };
    }));
    if (errors.length) throw new Error(errors.join('\n'));
  } finally { await close(); }
  const name = 'motrpac-alphabet';
  const design = Glyphs.getDesign('@nv-1');
  if (!design) throw new Error('Missing Mattlab NV-1 design');
  const fill = design.fills;
  const faces = Core.FACES.map((/** @type {{id:string,d:string}} */ face, /** @type {number} */ i) =>
    `<path class="paint-${i}" d="${esc(face.d)}" fill="${fill[face.id]}"/>`).join('');
  const pair = [letters[0], letters[2]];
  // Both editors work on light paper: keep the actual logo colours legible in dark mode too.
  const body = `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="logo-layout">
    <div class="alphabet"><span>MotRPAC alphabet</span>
    ${pair.map((letter,k)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${letter.viewBox}">${letter.shapes.map((g,i)=>`<g class="piece-${k}-${i}" style="transform-origin:${num(g.x+g.width/2)}px ${num(g.y+g.height/2)}px">${g.markup}${i===1?`<g class="selection selection-${k}" fill="white" stroke="#396e9c" stroke-width="24"><rect x="${num(g.x-40)}" y="${num(g.y-40)}" width="${num(g.width+80)}" height="${num(g.height+80)}" fill="none" stroke-dasharray="50 35"/>${[[g.x-40,g.y-40],[g.x+g.width+40,g.y-40],[g.x-40,g.y+g.height+40],[g.x+g.width+40,g.y+g.height+40]].map(([x,y])=>`<rect x="${num(x-35)}" y="${num(y-35)}" width="70" height="70"/>`).join('')}</g>`:''}</g>`).join('')}</svg>`).join('')}
    </div><div class="mattlab"><span>Mattlab</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="260 132 1004 748">${faces}</svg></div></div></foreignObject>`;
  const loop = pair.flatMap((letter,k)=>letter.shapes.map((g,i)=>{
    const dx=(i%2?1:-1)*(110+i*25),dy=(i%3-1)*180,scale=.65+(i%3)*.1,start=4+k*14+i*2,end=start+12;
    return `& .piece-${k}-${i} { animation: ${name}-piece-${k}-${i} 9s ease-in-out infinite; }
      @keyframes ${name}-piece-${k}-${i} {0%,${start}%{transform:translate(${dx}px,${dy}px) scale(${scale})}${end}%,92%{transform:translate(0px,0px) scale(1)}100%{transform:translate(${dx}px,${dy}px) scale(${scale})}}`;
  })).join('\n') +
    pair.map((_,k)=>`& .selection-${k}{animation:${name}-select-${k} 9s linear infinite}
      @keyframes ${name}-select-${k}{0%,${6+k*14}%{opacity:0}${8+k*14}%,${19+k*14}%{opacity:1}${22+k*14}%,100%{opacity:0}}`).join('\n') +
    Core.FACES.map((_,i)=>`& .paint-${i} { animation: ${name}-paint-${i} 9s linear infinite; }
    @keyframes ${name}-paint-${i} { 0%,${30+i*1.8}% {fill:var(--art-line)} ${32+i*1.8}%,94% {fill:${fill[Core.FACES[i].id]}} 100% {fill:var(--art-line)} }`).join('\n');
  return art({ name, body, responsive:true, loop, period:9,
    css:`& .logo-layout{box-sizing:border-box;height:100%;background:#fff;padding:4cqh 3cqw;display:grid;grid-template-columns:1.28fr 1fr;gap:3cqw}
& .logo-layout > div{display:grid;grid-template-rows:auto minmax(0,1fr);gap:1cqh 2cqw;min-width:0;min-height:0}
& .alphabet{grid-template-columns:repeat(2,minmax(0,1fr))}
& .logo-layout span{grid-column:1/-1;text-align:center;color:#53606c;font:clamp(10px,min(4.8cqw,10cqh),19px) system-ui,sans-serif}
& .logo-layout svg{width:100%;height:100%;min-height:0}
@container alphabet-preview (max-aspect-ratio:1.65/1){& .logo-layout{grid-template-columns:1fr;grid-template-rows:1.1fr 1fr;gap:3cqh}}
& .selection{opacity:0}` });
}
