// Recorded runs of the ordinary crossword optimizer, not an erase/refill effect: the saved
// heart, then the target morphs to a diamond, a spade, a club and back to the heart, and
// each time the crossword is refined from its current grid toward the new shape
// (crossword/examples/build-suits.mjs). Cell proportions and the offset shadow follow the
// original R drawing. Letter ink is centered geometrically so font ascent/descender
// metrics cannot shift it.
import {readFileSync} from 'node:fs';
import {loadFaces} from '../../../message-collage/core/fonts.js';
import {WIDE,art,num,simplifyPath} from '../svg.mjs';
import {fieldContours,fieldMask,morphField} from '../../../crossword/examples/suits.mjs';
import {packGrid} from '../../../crossword/examples/build-suits.mjs';

const {width:W,height:H}=WIDE;
const BOX=192,LEFT=(W-BOX)/2,TOP=6;
/** Seconds of each transition: the settled grid, the target's morph, then the refinement. */
const HOLD=.7,MORPH=1.5,CATCH=3.3,SEGMENT=HOLD+MORPH+CATCH;
/** At most this many displayed states per refinement, sampled among the grids it changed. */
const SAMPLES=12;
const LOSS={x:196,y:172,w:58,h:26};

/** @typedef {import('../../../crossword/examples/build-suits.mjs').Segment} Segment */
/** @typedef {{iteration:number,score:number,grid:string[]}} State */

/** Every iteration of a refinement with its grid, rejected ones keeping the previous grid. @param {Segment} segment @returns {State[]} */
export function replay(segment){
 /** @type {string[]|undefined} */let grid;
 return segment.frames.map((f,i)=>{
  if(f.iteration!==i)throw new Error('crossword: recorded iterations are not consecutive');
  if(f.accepted!==false){if(!f.grid)throw new Error('crossword: accepted state without its grid');grid=f.grid;}
  else if(f.grid)throw new Error('crossword: rejected state should not record a grid');
  return {iteration:f.iteration,score:f.score,grid:/** @type {string[]} */(grid)};
 });
}

/** Actual chain states at evenly spaced display times: the grid current at each, kept from the
 * iteration that produced it. The last change is always included.
 * @param {State[]} states @param {number} [count]
 */
export function sampleChanges(states,count=SAMPLES){
 const n=states.length-1,changes=states.filter((s,i)=>i&&s.grid.join('\n')!==states[i-1].grid.join('\n'));
 const picked=Array.from({length:count},(_,s)=>changes.filter(c=>c.iteration<=n*((s+1)/count)**2).at(-1));
 return [...new Set(picked)].filter(s=>s!==undefined);
}

/** Display time of a refinement iteration: early iterations, where most changes happen, get more time. @param {number} i @param {number} n */
const catchTime=(i,n)=>HOLD+MORPH+CATCH*Math.sqrt(i/n);

const name=(/** @type {string} */s)=>s[0].toUpperCase()+s.slice(1);

/** Reads the saved example and suit history and checks that they chain without gaps. */
export function readHistory(){
 const read=(/** @type {string} */f)=>readFileSync(new URL(`../../../crossword/examples/${f}`,import.meta.url),'utf8');
 const {request,result}=JSON.parse(read('heart-example.json'));
 const saved=JSON.parse(read('suits-history.json'));
 if(request.entriesText!==read('weather.txt')||request.target.mask.join('\n')!==read('heart-notched.txt').trim())throw new Error('crossword: regenerate saved example');
 /** @type {Segment[]} */const segments=saved.segments;
 const opening=result.crosswords[0].refined;
 if(saved.source!=='heart-example.json'||segments[0]?.from!=='heart'||segments.at(-1)?.to!=='heart')throw new Error('crossword: suit history must start and end at the saved heart');
 /** @type {State[][]} */const states=segments.map(replay);
 segments.forEach((s,k)=>{
  const before=k?segments[k-1].result:opening,first=states[k][0],last=states[k].at(-1);
  if(k&&s.from!==segments[k-1].to)throw new Error('crossword: suit transitions do not chain');
  if(first.grid.join('\n')!==packGrid(before.grid).join('\n'))throw new Error('crossword: a refinement does not start from the previous grid');
  if(s.morph.length!==saved.morphSteps||s.morph.at(-1)?.score!==first.score||states[k].length!==s.nIter+1)throw new Error('crossword: morph and refinement scores do not meet');
  if(!last||last.grid.join('\n')!==packGrid(s.result.grid).join('\n')||last.score!==s.result.score)throw new Error('crossword: a refinement does not end at its saved result');
 });
 return {opening,segments,states,morphSteps:/** @type {number} */(saved.morphSteps)};
}

export async function build(){
 const {opening,segments,states,morphSteps}=readHistory();
 const PERIOD=segments.length*SEGMENT;
 // One timeline of what is shown: target outline, grid, caption, and the penalty trace.
 /** @type {{start:number,from:string,to:string,t:number}[]} */const targets=[{start:0,from:'heart',to:'heart',t:0}];
 /** @type {{start:number,grid:string[],score:number}[]} */const grids=[{start:0,grid:packGrid(opening.grid),score:opening.score}];
 /** @type {{start:number,label:string,score:number}[]} */const captions=[{start:0,label:'Saved heart',score:opening.score}];
 /** @type {number[][]} */const trace=[[0,opening.score]];
 segments.forEach((s,k)=>{
  const t0=k*SEGMENT,step=MORPH/morphSteps,n=states[k].length-1;
  trace.push([t0+HOLD,trace[trace.length-1][1]]);
  s.morph.forEach((m,j)=>{
   const at=t0+HOLD+(j+1)*step;
   targets.push({start:at,from:s.from,to:s.to,t:m.t});
   captions.push({start:at,label:`${name(s.from)} → ${s.to}`,score:m.score});
   trace.push([at,m.score]);
  });
  states[k].slice(1).forEach(st=>trace.push([t0+catchTime(st.iteration,n),st.score]));
  for(const st of sampleChanges(states[k])){
   const at=t0+catchTime(st.iteration,n);
   grids.push({start:at,grid:st.grid,score:st.score});
   captions.push({start:at,label:`${name(s.to)} · MCMC ${st.iteration}/${s.nIter}`,score:st.score});
  }
 });
 if(trace.some(p=>!(p[1]>0)))throw new Error('crossword: the log-scaled penalty needs positive scores');
 const face=(await loadFaces(['Inter'],['bold'])).get('Inter|bold');
 if(!face)throw new Error('crossword: bundled bold font unavailable');
 const chars=[...new Set(grids.flatMap(g=>[...g.grid.join('')]).filter(ch=>ch!=='.'))];
 const glyphs=new Map(chars.map(ch=>{
  const glyph=/** @type {any} */(face.font.glyphForCodePoint(/** @type {number} */(ch.codePointAt(0))));
  const b=glyph.bbox;
  return [ch,{id:`crossword-letter-${ch.codePointAt(0)}`,path:glyph.path.toSVG(),cx:(b.minX+b.maxX)/2,cy:(b.minY+b.maxY)/2}];
 }));
 const scale=.49/face.capAscent;
 // Browsers paint a path's markers as one drawing; a positioned <use> per cell is costly to repaint.
 const defs=[...glyphs.values()].map(g=>`<marker id="${g.id}" markerUnits="userSpaceOnUse" markerWidth="1.1" markerHeight="1.1" overflow="visible"><rect class="shadow" x=".14" y=".14" width=".9" height=".9" fill="var(--art-ink)" fill-opacity=".68"/><rect class="cells" x=".05" y=".05" width=".9" height=".9" fill="var(--surface)" stroke="var(--art-ink)" stroke-width=".04"/><path class="letters" fill="var(--crossword-letter, var(--art-ink))" d="${g.path}" transform="translate(${num(.5-scale*g.cx,7)} ${num(.5+scale*g.cy,7)}) scale(${num(scale,10)} ${num(-scale,10)})"/></marker>`).join('');

 // The target is normalised like the picture-comparison term: trimmed and centred in a square.
 const outline=(/** @type {string} */from,/** @type {string} */to,/** @type {number} */t)=>{
  const field=morphField(/** @type {any} */(from),/** @type {any} */(to),t),mask=fieldMask(field);
  const rows=mask.flatMap((row,r)=>row.includes('#')?[r]:[]),cols=[...mask[0]].flatMap((_,c)=>mask.some(row=>row[c]==='#')?[c]:[]);
  const minR=rows[0],minC=cols[0],mr=rows[rows.length-1]-minR+1,mc=cols[cols.length-1]-minC+1,ms=Math.max(mr,mc),unit=BOX/ms;
  const rings=fieldContours(field).map(ring=>`M${ring.map(p=>p.join(' ')).join('L')}Z`).join('');
  return simplifyPath(rings,(c,r)=>[LEFT+(c-minC+(ms-mc)/2)*unit,TOP+(r-minR+(ms-mr)/2)*unit],.6);
 };
 const minScore=Math.min(...trace.map(p=>p[1])),maxScore=Math.max(...trace.map(p=>p[1]));
 const at=(/** @type {number[]} */[t,score])=>[LOSS.x+t/PERIOD*LOSS.w,LOSS.y+LOSS.h-(Math.log(score/minScore))/Math.log(maxScore/minScore)*LOSS.h];
 const tracePath=trace.map((p,i)=>`${i?'L':'M'}${at(p).map(v=>num(v,2)).join(' ')}`).join('');
 // A small suit above the trace where each target is reached.
 const suitIcon=(/** @type {string} */suit,/** @type {number} */x)=>{
  const field=morphField(/** @type {any} */(suit),/** @type {any} */(suit),0);
  return simplifyPath(fieldContours(field,1).map(ring=>`M${ring.map(p=>p.join(' ')).join('L')}Z`).join(''),(c,r)=>[x+(c-32)*.1,LOSS.y-3.9+(r-31)*.1],.12);
 };
 const reached=segments.map((s,k)=>{const time=k*SEGMENT+HOLD+MORPH;return {suit:s.to,time,x:at([time,1])[0]}});
 const p=(/** @type {number} */t)=>num(t/PERIOD*100,4);
 // Each layer (target, grid, caption) is a strip of its items placed SHIFT apart, far outside
 // the canvas; one stepped translation brings the current item into view. Browsers move the
 // strip without repainting it, and the loop runs a handful of animations, not one per item.
 const SHIFT=1000;
 /** @param {string} kind @param {{start:number}[]} items @param {(item:any)=>string} markup */
 const strip=(kind,items,markup)=>({
  body:`<g class="${kind}">${items.map((item,i)=>`<g${i?` transform="translate(${i*SHIFT} 0)"`:''}>${markup(item)}</g>`).join('')}</g>`,
  loop:`& .${kind} { animation: crossword-${kind} ${num(PERIOD,3)}s step-end infinite; }\n@keyframes crossword-${kind} { ${items.map((item,i)=>`${p(item.start)}% { transform:translate(${-i*SHIFT}px,0); }`).join(' ')} }`,
 });
 const targetLayer=strip('targets',targets,t=>`<path d="${outline(t.from,t.to,t.t)}"/>`);
 // A cell is a marker, so all cells of one letter in a frame are one path; the frame is fitted
 // to the box like the picture term: trimmed and centred in a square.
 const gridLayer=strip('grids',grids,g=>{
  const rows=g.grid.length,cols=g.grid[0].length,side=Math.max(rows,cols),pitch=BOX/side;
  /** @type {Map<string,string[]>} */const cells=new Map();
  g.grid.forEach((/** @type {string} */row,/** @type {number} */r)=>[...row].forEach((ch,c)=>{
   if(ch==='.')return;const glyph=glyphs.get(ch);if(!glyph)throw new Error('crossword: missing recorded glyph');
   cells.set(glyph.id,[...(cells.get(glyph.id)??[]),`${c} ${r}`]);
  }));
  return `<g transform="translate(${num(LEFT+(side-cols)*pitch/2,4)} ${num(TOP+(side-rows)*pitch/2,4)}) scale(${num(pitch,6)})">${[...cells].map(([id,points])=>`<path class="${id.replace('crossword-letter-','l')}" d="M${points.join('L')}"/>`).join('')}</g>`;
 });
 const markerCss=[...glyphs.values()].map(g=>`& .grids .${g.id.replace('crossword-letter-','l')} { marker:url(#${g.id}); }`).join('\n');
 const captionLayer=strip('captions',captions,c=>`<text class="step" x="7" y="212">${c.label}</text><text class="score" x="${LOSS.x+LOSS.w}" y="${LOSS.y+LOSS.h+9}">${Math.round(c.score).toLocaleString('en-US')}</text>`);
 // The cursor follows the trace at its vertices' times, moving linearly between them, and a
 // curtain uncovers the trace up to it. Neither may sit in a transformed group: there the
 // browser repaints the page each frame instead of moving them on the compositor.
 const kept=trace.filter((pt,i)=>i===0||i===trace.length-1||!(pt[1]===trace[i-1][1]&&pt[1]===trace[i+1][1]));
 const cursorKeys=kept.map(pt=>{const [x,y]=at(pt);return `${p(pt[0])}% { transform:translate(${num(x,2)}px,${num(y,2)}px); }`}).join(' ');
 const [cx,cy]=at(trace[0]);
 const suits=reached.map((m,i)=>`<path class="suit suit-${i}" d="${suitIcon(m.suit,m.x)}"/>`).join('');
 const suitLoop=reached.map((m,i)=>`& .suit-${i} { animation: crossword-suit-${i} ${num(PERIOD,3)}s step-end infinite; }\n@keyframes crossword-suit-${i} { 0% { opacity:0; } ${p(m.time)}% { opacity:1; } 100% { opacity:1; } }`).join('\n');
 const plot=`<g class="loss"><rect class="panel" x="${LOSS.x-4}" y="${LOSS.y-17}" width="${LOSS.w+8}" height="${LOSS.h+29}" rx="2"/><text x="${LOSS.x-1}" y="${LOSS.y-10}">Penalty (log)</text>${suits}<path class="trace" d="${tracePath}"/></g><rect class="curtain" x="${LOSS.x}" y="${LOSS.y-2}" width="${LOSS.w+1}" height="${LOSS.h+4}"/><circle class="cursor" r="1.6" style="transform:translate(${num(cx,2)}px,${num(cy,2)}px)"/>`;
 return art({name:'crossword',period:PERIOD,frames:grids.length,width:W,height:H,
  defs,
  body:`${targetLayer.body}${gridLayer.body}${plot}${captionLayer.body}`,
  css:`& .targets { fill:#dc8899; opacity:.13; }\n:root[data-theme="dark"] & { --crossword-letter:#fff; }\n& .step,& .score,& .loss text { font:7px Arial,sans-serif; fill:var(--art-ink); }\n& .score { text-anchor:end; }\n& .loss .panel,& .curtain { fill:var(--surface); }\n& .curtain { transform:scaleX(0); }\n& .grids path { fill:none; }\n${markerCss}\n& .trace { stroke:var(--art-muted); stroke-width:.8; fill:none; stroke-linejoin:round; }\n& .suit { fill:var(--art-muted); }\n& .cursor { fill:var(--art-ink); }`,
  loop:`${targetLayer.loop}\n${gridLayer.loop}\n${captionLayer.loop}\n${suitLoop}\n& .curtain { transform-origin:${LOSS.x+LOSS.w+1}px 0; animation:crossword-reveal ${num(PERIOD,3)}s linear infinite; }\n@keyframes crossword-reveal { 0% { transform:scaleX(1); } 100% { transform:scaleX(0); } }\n& .cursor { animation:crossword-cursor ${num(PERIOD,3)}s linear infinite; }\n@keyframes crossword-cursor { ${cursorKeys} }`});
}
