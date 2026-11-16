// Exact editor seed geometry and the supplied Mattlab painter’s reference design.
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
  const design = Glyphs.getDesign('@original');
  if (!design) throw new Error('Missing Mattlab reference design');
  const fill = design.fills;
  const faces = Core.FACES.map((/** @type {{id:string,d:string}} */ face, /** @type {number} */ i) =>
    `<path class="paint-${i}" d="${esc(face.d)}" fill="${fill[face.id]}"/>`).join('');
  const pair = [letters[0], letters[2]];
  // Both editors work on light paper: keep the actual logo colours legible in dark mode too.
  const body = `<rect width="480" height="180" rx="5" fill="#fff"/>
    <text x="135" y="19" text-anchor="middle" fill="#5e6b78" font-size="12">MotRPAC alphabet</text>
    <text x="375" y="19" text-anchor="middle" fill="#5e6b78" font-size="12">Mattlab</text>
    ${pair.map((letter,k)=>`<svg x="${10+k*125}" y="30" width="115" height="145" viewBox="${letter.viewBox}" overflow="visible">${letter.shapes.map((g,i)=>`<g class="piece-${k}-${i}" style="transform-origin:${num(g.x+g.width/2)}px ${num(g.y+g.height/2)}px">${g.markup}${i===1?`<g class="selection selection-${k}" fill="white" stroke="#396e9c" stroke-width="24"><rect x="${num(g.x-40)}" y="${num(g.y-40)}" width="${num(g.width+80)}" height="${num(g.height+80)}" fill="none" stroke-dasharray="50 35"/>${[[g.x-40,g.y-40],[g.x+g.width+40,g.y-40],[g.x-40,g.y+g.height+40],[g.x+g.width+40,g.y+g.height+40]].map(([x,y])=>`<rect x="${num(x-35)}" y="${num(y-35)}" width="70" height="70"/>`).join('')}</g>`:''}</g>`).join('')}</svg>`).join('')}
    <svg x="280" y="35" width="190" height="135" viewBox="260 132 1004 748">${faces}</svg>`;
  const loop = pair.flatMap((letter,k)=>letter.shapes.map((g,i)=>{
    const dx=(i%2?1:-1)*(110+i*25),dy=(i%3-1)*180,scale=.65+(i%3)*.1,start=4+k*14+i*2,end=start+12;
    return `& .piece-${k}-${i} { animation: ${name}-piece-${k}-${i} 9s ease-in-out infinite; }
      @keyframes ${name}-piece-${k}-${i} {0%,${start}%{transform:translate(${dx}px,${dy}px) scale(${scale})}${end}%,92%{transform:translate(0px,0px) scale(1)}100%{transform:translate(${dx}px,${dy}px) scale(${scale})}}`;
  })).join('\n') +
    pair.map((_,k)=>`& .selection-${k}{animation:${name}-select-${k} 9s linear infinite}
      @keyframes ${name}-select-${k}{0%,${6+k*14}%{opacity:0}${8+k*14}%,${19+k*14}%{opacity:1}${22+k*14}%,100%{opacity:0}}`).join('\n') +
    Core.FACES.map((_,i)=>`& .paint-${i} { animation: ${name}-paint-${i} 9s linear infinite; }
    @keyframes ${name}-paint-${i} { 0%,${30+i*1.8}% {fill:var(--art-line)} ${32+i*1.8}%,94% {fill:${fill[Core.FACES[i].id]}} 100% {fill:var(--art-line)} }`).join('\n');
  return art({ name, body, css:'& .selection{opacity:0}', loop, period:9, width:480 });
}
