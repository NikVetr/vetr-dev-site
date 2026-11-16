// Independently optimized aspect-specific compositions; exact core glyph geometry.
// Regenerate the curated fixture with ../collage-search.mjs before building the art.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFaces,renderSvg} from '../../../message-collage/core/index.js';
import {art,num} from '../svg.mjs';

export async function build() {
  /** @type {{provenance:{request_sha256:string,fonts_sha256:Record<string,string>},layouts:{profile:string,target_ratio:number,result:import('../../../message-collage/core/index.js').Result}[]}} */
  const fixture=JSON.parse(readFileSync(new URL('../fixtures/collage-layouts.json',import.meta.url),'utf8'));
  const request=readFileSync(new URL('../../../message-collage/examples/request.json',import.meta.url));
  if(createHash('sha256').update(request).digest('hex')!==fixture.provenance.request_sha256)throw new Error('Collage example changed; regenerate collage-layouts.json with collage-search.mjs');
  if(fixture.layouts.map(layout=>layout.profile).join(',')!=='portrait,square,wide')throw new Error('Expected all three collage aspect profiles');
  const faces=await loadFaces(fixture.layouts[0].result.request.fonts,fixture.layouts[0].result.request.styles);
  for(const face of faces.values())if(createHash('sha256').update(face.bytes).digest('hex')!==fixture.provenance.fonts_sha256[face.file])throw new Error(`Collage font changed: ${face.file}; regenerate the preview fixture`);
  /** @type {Map<string,string>} */
  const glyphs=new Map();
  const layouts=fixture.layouts.map(({profile,result})=>{
    const svg=renderSvg(result,faces),end=svg.indexOf('</defs>');
    if(end<0)throw new Error('Missing collage glyph outlines');
    /** @type {Map<string,string>} */
    const ids=new Map();
    for(const [,oldId,path] of svg.slice(0,end).matchAll(/<path id="([^"]+)" d="([^"]+)"\/>/g)){
      if(!glyphs.has(path))glyphs.set(path,`message-collage-g${glyphs.size}`);
      ids.set(oldId,/** @type {string} */(glyphs.get(path)));
    }
    let line=0;
    const body=svg.slice(end+7).replace(/<\/svg>\s*$/,'').replace(/xlink:href="#([^"]+)"/g,(_,id)=>{
      if(!ids.has(id))throw new Error(`Unknown collage glyph ${id}`);
      return `href="#${ids.get(id)}"`;
    }).replace(/matrix\(([^)]+)\)/g,(_,/** @type {string} */values)=>{
      const matrix=values.split(/\s+/).map(Number);
      if(matrix.length!==6||matrix.some(v=>!Number.isFinite(v)))throw new Error('Invalid collage glyph transform');
      return `matrix(${matrix.map((v,i)=>num(v,i<4?7:4)).join(' ')})`;
    }).replace(/<g fill=/g,()=>{
      const message=result.lines[line++].message;
      return `<g class="collage-line" style="--arrival:${num((message-1)/result.messages.length*2,4)}s" fill=`;
    });
    if(line!==result.lines.length)throw new Error('Not all collage lines were preserved');
    return `<svg class="collage-layout collage-${profile}" data-profile="${profile}" width="100%" height="100%" viewBox="0 0 ${num(result.card.width_in*72,4)} ${num(result.card.height_in*72,4)}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
  });
  return art({name:'message-collage',responsive:true,period:8,
    defs:[...glyphs].map(([path,id])=>`<path id="${id}" d="${path}"/>`).join('\n'),
    body:`<rect width="100%" height="100%" fill="${fixture.layouts[0].result.card.background}"/>${layouts.join('\n')}`,
    css:`& .collage-layout{display:none}& .collage-square{display:block}
@container collage-preview (max-aspect-ratio:1/1){& .collage-square{display:none}& .collage-portrait{display:block}}
@container collage-preview (min-aspect-ratio:1.32/1){& .collage-square{display:none}& .collage-wide{display:block}}`,
    loop:`& .collage-line{animation:message-collage-write 8s ease-in-out infinite both;animation-delay:var(--arrival)}
@keyframes message-collage-write{0%,5%{opacity:0}15%,85%{opacity:1}100%{opacity:0}}`,
  });
}
