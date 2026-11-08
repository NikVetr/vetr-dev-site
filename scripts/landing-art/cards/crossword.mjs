// A recorded run of the ordinary crossword optimizer, not an erase/refill effect.
// Cell proportions and the offset shadow follow the original R drawing. Letter ink
// is centered geometrically so font ascent/descender metrics cannot shift it.
import {readFileSync} from 'node:fs';
import {loadFaces} from '../../../message-collage/core/fonts.js';
import {WIDE,art,num} from '../svg.mjs';

const {width:W,height:H}=WIDE;
const PERIOD=15,BOX=192,LEFT=(W-BOX)/2,TOP=6;

/** @typedef {{iteration:number,score:number,accepted:boolean|null,grid:string[][]}} Frame */
/** Actual chain states, evenly sampled among changed grids; always includes both ends.
 * @param {Frame[]} history
 */
export function sampleHistory(history){
 if(!history?.length||history[0].iteration!==0)throw new Error('crossword: regenerate recorded example history');
 const distinct=history.filter((frame,i)=>!i||JSON.stringify(frame.grid)!==JSON.stringify(history[i-1].grid));
 if(distinct.at(-1)!==history.at(-1))distinct.push(history[history.length-1]);
 if(distinct.length===1)return distinct;
 return Array.from(new Set(Array.from({length:Math.min(13,distinct.length)},(_,i)=>Math.round(i*(distinct.length-1)/(Math.min(13,distinct.length)-1))))).map(i=>distinct[i]);
}

export async function build(){
 const read=(/** @type {string} */f)=>readFileSync(new URL(`../../../crossword/examples/${f}`,import.meta.url),'utf8');
 const {request,result}=JSON.parse(read('heart-example.json'));
 const saved=JSON.parse(read('heart-history.json'));
 if(saved.seed!==request.search.seed||saved.nIter!==request.search.nIter)throw new Error('crossword: history settings differ from example');
 /** @type {Frame[]} */const history=saved.frames.map((/** @type {any} */f)=>({...f,grid:f.grid.map((/** @type {string} */row)=>[...row].map(ch=>ch==='.'?'':ch))}));
 if(request.entriesText!==read('weather.txt')||request.target.mask.join('\n')!==read('heart-notched.txt').trim())throw new Error('crossword: regenerate saved example');
 const frames=sampleHistory(history),last=history[history.length-1];
 if(JSON.stringify(last.grid)!==JSON.stringify(result.crosswords[0].refined.grid)||last.score!==result.crosswords[0].refined.score)throw new Error('crossword: history does not end at the saved result');
 const face=(await loadFaces(['Inter'],['bold'])).get('Inter|bold');
 if(!face)throw new Error('crossword: bundled bold font unavailable');
 const chars=[...new Set(frames.flatMap(f=>f.grid.flat()).filter(Boolean))];
 const glyphs=new Map(chars.map(ch=>{
  const glyph=/** @type {any} */(face.font.glyphForCodePoint(/** @type {number} */(ch.codePointAt(0))));
  const b=glyph.bbox;
  return [ch,{id:`crossword-letter-${ch.codePointAt(0)}`,path:glyph.path.toSVG(),cx:(b.minX+b.maxX)/2,cy:(b.minY+b.maxY)/2}];
 }));
 const scale=.49/face.capAscent;
 const defs=[...glyphs.values()].map(g=>`<g id="${g.id}"><rect class="shadow" x=".14" y=".14" width=".9" height=".9"/><rect class="cells" x=".05" y=".05" width=".9" height=".9"/><path class="letters" d="${g.path}" transform="translate(${num(.5-scale*g.cx,7)} ${num(.5+scale*g.cy,7)}) scale(${num(scale,10)} ${num(-scale,10)})"/></g>`).join('');
 const minScore=Math.min(...history.map((/** @type {Frame} */f)=>f.score)),maxScore=Math.max(...history.map((/** @type {Frame} */f)=>f.score));
 const lossX=203,lossY=177,lossW=53,lossH=25;
 const tracePoint=(/** @type {Frame} */f)=>[lossX+(f.iteration/request.search.nIter)*lossW,lossY+lossH-(f.score-minScore)/(maxScore-minScore||1)*lossH];
 const trace=(/** @type {number} */iteration)=>history.filter(f=>f.iteration<=iteration).map((f,i)=>`${i?'L':'M'}${tracePoint(f).map(v=>num(v,2)).join(' ')}`).join('');
 const frameMarkup=(/** @type {Frame} */f)=>{
  const rows=f.grid.length,cols=f.grid[0].length,side=Math.max(rows,cols),pitch=BOX/side;
  const x0=LEFT+(side-cols)*pitch/2,y0=TOP+(side-rows)*pitch/2;
  const cells=f.grid.flatMap((row,r)=>row.flatMap((letter,c)=>{
   if(!letter)return [];const g=glyphs.get(letter);if(!g)throw new Error('crossword: missing recorded glyph');
   return [`<use href="#${g.id}" x="${c}" y="${r}"/>`];
  })).join('');
  const [cx,cy]=tracePoint(f);
  const plot=`<g class="loss"><rect x="200" y="165" width="60" height="51" rx="2"/><text x="203" y="173">Penalty</text><path d="${trace(f.iteration)}"/></g>`;
  return `<g class="grid" transform="translate(${num(x0,4)} ${num(y0,4)}) scale(${num(pitch,6)})">${cells}</g>${plot}<circle class="cursor" cx="${num(cx,2)}" cy="${num(cy,2)}" r="1.8"/><text class="step" x="7" y="212">${f.iteration?`MCMC ${f.iteration}/${request.search.nIter}`:'Initial layout'}</text><text class="score" x="256" y="213">${Math.round(f.score).toLocaleString('en-US')}</text>`;
 };
 // Normalize the faint target like the picture-comparison term: trim, center in a square.
 const mask=request.target.mask;
 /** @type {number[][]} */const occupied=[];
 mask.forEach((/** @type {string} */row,/** @type {number} */r)=>[...row].forEach((v,c)=>{if(v==='#')occupied.push([r,c])}));
 const minR=Math.min(...occupied.map(p=>p[0])),maxR=Math.max(...occupied.map(p=>p[0])),minC=Math.min(...occupied.map(p=>p[1])),maxC=Math.max(...occupied.map(p=>p[1]));
 const mr=maxR-minR+1,mc=maxC-minC+1,ms=Math.max(mr,mc),unit=BOX/ms;
 const heart=mask.flatMap((/** @type {string} */row,/** @type {number} */r)=>[...row.matchAll(/#+/g)].map(match=>{const c=match.index,length=match[0].length;return `M${num(LEFT+(c-minC+(ms-mc)/2)*unit,3)} ${num(TOP+(r-minR+(ms-mr)/2)*unit,3)}h${num(unit*length,3)}v${num(unit+.02,3)}h${num(-unit*length,3)}Z`})).join('');
 const groups=frames.map((f,i)=>`<g class="frame frame-${i}${i===frames.length-1?' still':''}" data-iteration="${f.iteration}" data-score="${f.score}">${frameMarkup(f)}</g>`).join('');
 const p=(/** @type {number} */t)=>num(t/PERIOD*100,4);
 const times=frames.map((_,i)=>.9+i*10/(frames.length-1));
 const rules=frames.map((_,i)=>{const start=times[i],end=i===frames.length-1?14.35:times[i+1];return `& .frame-${i} { animation: crossword-state-${i} ${PERIOD}s step-end infinite; }\n@keyframes crossword-state-${i} { 0% { opacity:0; } ${p(start)}% { opacity:1; } ${p(end)}% { opacity:0; } 100% { opacity:0; } }`}).join('\n');
 return art({name:'crossword',period:PERIOD,frames:frames.length,width:W,height:H,defs,body:`<path class="target" d="${heart}"/>${groups}`,css:`& .target { fill:#dc8899; opacity:.11; }\n& .frame { opacity:0; }\n& .still { opacity:1; }\n& .shadow { fill:var(--art-ink); opacity:.68; }\n& .cells { fill:var(--surface); stroke:var(--art-ink); stroke-width:.04; }\n& .letters { fill:var(--art-ink); }\n& .step,& .score,& .loss text { font:7px Arial,sans-serif; fill:var(--art-ink); }\n& .score { text-anchor:end; }\n& .loss rect { fill:var(--surface); opacity:.92; }\n& .loss path { stroke:var(--art-muted); stroke-width:.8; fill:none; }\n& .cursor { fill:var(--art-ink); }`,loop:rules});
}
