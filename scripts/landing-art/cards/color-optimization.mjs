// @ts-check
// Palette Town: independent channel limits and a real winning search trajectory.
// The fixture records its full configuration, pinned source revision and restart
// scores; regenerate with node scripts/landing-art/palette-trace.mjs. Ordinary
// card builds never run or import a working-tree optimizer.
import {readFileSync} from 'node:fs';
import { applyCvdHex } from '../../../color-optimization/core/cvd.js';
import { computeBounds } from '../../../color-optimization/optimizer/bounds.js';
import { crc32, deflateSync } from 'node:zlib';
import { decodeColor, encodeColor, isInGamut, projectToGamut } from '../../../color-optimization/core/colorSpaces.js';
import { contrastColor } from '../../../color-optimization/core/metrics.js';
import { applyConstrainedChannelsToRange, hardContiguousHiddenConstraintRange, hardContiguousConstraintRange, buildGamutProjectionBoundary, computeGamutExtent, smoothBoundary } from '../../../color-optimization/ui/gamutHull.js';
import { art, esc, flipbook, num, polyline } from '../svg.mjs';

const FIELD = 24;
const PERIOD = 16;
const FIXTURE=JSON.parse(readFileSync(new URL('../fixtures/palette-trace.json',import.meta.url),'utf8'));
const INPUTS=/** @type {string[]} */(FIXTURE.inputs);
const ADDED=/** @type {string[]} */(FIXTURE.added);
const WIDTHS=/** @type {number[]} */(FIXTURE.config.widths);
/** @type {{hex:string[],raw:{l:number,a:number,b:number}[]}[]} */
const TRACE=FIXTURE.trace;

/** Clip the sampled hidden-L projection by the independently allowed a/b box.
 * @param {number[][]} polygon @param {number[]} box [left,right,top,bottom]
 */
function clipProjection(polygon,box){
 let points=polygon;
 for(const [axis,edge,sign]of [[0,box[0],1],[0,box[1],-1],[1,box[2],1],[1,box[3],-1]]){
  const input=points;points=[];
  for(let i=0;i<input.length;i++){
   const a=input[i],b=input[(i+1)%input.length];
   const insideA=(a[axis]-edge)*sign>=0,insideB=(b[axis]-edge)*sign>=0;
   if(insideA)points.push(a);
   if(insideA!==insideB){const t=(edge-a[axis])/(b[axis]-a[axis]);points.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
  }
 }
 return points;
}

/**
 * An RGB PNG of `n` × `n` pixels, as a data URI.
 * @param {number} n
 * @param {number[][]} rgb  rows of [r, g, b, r, g, b, ...]
 */
function png(n, rgb) {
  // Each row filtered with "Sub" (the difference from the pixel to its left), which suits a field.
  const raw = Buffer.alloc(n * (3 * n + 1));
  rgb.forEach((row, y) => {
    const o = y * (3 * n + 1);
    raw[o] = 1;
    row.forEach((v, i) => { raw[o + 1 + i] = (v - (i >= 3 ? row[i - 3] : 0) + 256) % 256; });
  });
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const file = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${file.toString('base64')}`;
}


export async function build() {
  if (JSON.stringify(TRACE.at(-1)?.hex) !== JSON.stringify(ADDED)) throw new Error('color-optimization: trace endpoint differs from verified palette');
  const gamut = 'srgb', side = 118, px = 192, py = 31;
  const simulationTypes=['none','deutan','protan','tritan'];
  // All displayed projections and simulations use the app's own color transforms.
  const views = ['lab', 'oklab'].map(space => {
    const range = computeGamutExtent(space, gamut, 1.1);
    const maxA = Math.max(Math.abs(range.min.a), Math.abs(range.max.a));
    const maxB = Math.max(Math.abs(range.min.b), Math.abs(range.max.b));
    const toXY = (/** @type {{a:number,b:number}} */ v) => [px + side/2 + v.a/maxA*side/2, py + side/2 - v.b/maxB*side/2];
    const boundary = smoothBoundary(buildGamutProjectionBoundary(space, gamut, range, true, {l:'l',x:'a',y:'b'})
      .map((/** @type {{a:number,b:number}} */ v) => {const [x,y]=toXY(v);return {x,y};}),1);
    const outline = polyline(boundary.filter((/** @type {unknown} */ _,/** @type {number} */ i)=>i%4===0)
      .map((/** @type {{x:number,y:number}} */ v)=>[v.x,v.y]),true);
    const fields = simulationTypes.map(type=>png(FIELD,Array.from({length:FIELD},(_,y)=>Array.from({length:FIELD},(_,x)=>{
      const v={l:range.min.l+.75*(range.max.l-range.min.l),a:((x+.5)/FIELD*2-1)*maxA,b:(1-(y+.5)/FIELD*2)*maxB};
      const hex=applyCvdHex(encodeColor(isInGamut(v,space,gamut)?v:projectToGamut(v,space,gamut,space),space),type,1,'machado2009');
      return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    }).flat())));
    return {space,range,toXY,outline,fields};
  });
  /** @type {Map<string,{bounds:any,id:string,path:string}>} */
  const regions=new Map();
  const region=(/** @type {number[]} */ widths)=>{
    const key=widths.join(',');if(regions.has(key))return regions.get(key);
    const bounds=computeBounds(INPUTS.map(hex=>decodeColor(hex,'oklab')),'oklab',{...FIXTURE.config,widths});
    const hidden=hardContiguousHiddenConstraintRange(bounds,'oklab',['a','b']);
    const range=hidden?applyConstrainedChannelsToRange(views[1].range,hidden.range,hidden.channels):views[1].range;
    const boundary=smoothBoundary(buildGamutProjectionBoundary('oklab',gamut,range,true,{l:'l',x:'a',y:'b'})
      .map((/** @type {{a:number,b:number}} */ v)=>{const[x,y]=views[1].toXY(v);return{x,y};}),1)
      .map((/** @type {{x:number,y:number}} */ v)=>[v.x,v.y]);
    const allowed=hardContiguousConstraintRange(bounds,'oklab');
    let clipped=boundary;
    if(allowed){
      const leftTop=views[1].toXY({a:allowed.range.min.a,b:allowed.range.max.b});
      const rightBottom=views[1].toXY({a:allowed.range.max.a,b:allowed.range.min.b});
      clipped=clipProjection(boundary,[leftTop[0],rightBottom[0],leftTop[1],rightBottom[1]]);
    }
    if(clipped.length<3)throw new Error('Palette: constrained projection is empty');
    const id=key===WIDTHS.join(',')?'':`-${regions.size}`;
    const result={bounds,id,path:polyline(clipped,true)};regions.set(key,result);return result;
  };
  /** @param {number} view @param {string[]} hexes @param {number} fixed @param {number} cvd @param {{l:number,a:number,b:number}[]} raw */
  const markers=(view,hexes,fixed,cvd,raw)=>hexes.map((hex,i)=>{
    const v=view===1&&i>=fixed?raw[i-fixed]:/** @type {{l:number,a:number,b:number}} */ (decodeColor(hex,views[view].space)),[x,y]=views[view].toXY(v);
    const display=applyCvdHex(hex,simulationTypes[cvd],1,'machado2009');
    const paint=`fill="${display}" stroke="${contrastColor(display)}" stroke-width="1"`;
    return i<fixed?`<circle cx="${num(x)}" cy="${num(y)}" r="4.2" ${paint}/>`:`<rect x="${num(x-4)}" y="${num(y-4)}" width="8" height="8" ${paint}/>`;
  }).join('');
  /** @param {string[]} colors @param {number} count */
  const swatches=(colors,count)=>colors.slice(0,count).map((hex,i)=>{
    const x=i<2?9:86,y=44+(i<2?i:i-2)*24;
    return `<rect x="${x}" y="${y}" width="67" height="21" rx="3" fill="${hex}"/><text class="hex" x="${x+33.5}" y="${y+10.5}" fill="${contrastColor(hex)}">${hex}</text>`;
  }).join('');
  /** @param {{view?:number, colors?:string[], count?:number, title:string, widths?:number[], trail?:number, click?:number[], cvd?:number}} options */
  const scene=({view=1,colors=[...INPUTS,...ADDED],count=5,title,widths=WIDTHS,trail=-1,click,cvd=0})=>{
    const restricted=region(widths);
    if(!restricted)throw new Error('Palette: missing constraint region');
    const tab=(/** @type {string} */ label,/** @type {number} */ x,/** @type {boolean} */ active)=>`<rect class="tab ${active?'active':''}" x="${x}" y="5" width="65" height="18" rx="4"/><text class="tab-label" x="${x+32.5}" y="14">${label}</text>`;
    let paths='';
    if(trail>=0) paths=ADDED.map((hex,i)=>`<path class="trail" stroke="${hex}" d="${polyline(TRACE.slice(0,trail+1).map(st=>views[1].toXY(st.raw[i])))}"/>`).join('');
    const controls=['l','a','b'].map((ch,i)=>{
      const [lo,hi]=restricted.bounds.boundsByName[ch],y=127+i*14;
      return `<g data-channel="${ch}" data-strength="${widths[i]}"><title>${ch==='l'?'L':ch} tightening: ${Math.round(widths[i]*100)}%; 0% allows the full channel range.</title><text class="setting channel" x="9" y="${y}">${ch==='l'?'L':ch}</text>
<path class="track" d="M25 ${y}H117"/><path class="range" d="M${num(25+lo*92)} ${y}H${num(25+hi*92)}"/>
<circle class="handle" cx="${num(25+lo*92)}" cy="${y}" r="2.6"/><circle class="handle" cx="${num(25+hi*92)}" cy="${y}" r="2.6"/>
<text class="setting" x="128" y="${y}">${Math.round(widths[i]*100)}%</text></g>`;
    }).join('');
    return `<g data-stage="${esc(title)}" data-widths="${widths.join(',')}" data-cvd="${simulationTypes[cvd]}">${tab('Lab',9,view===0)}${tab('OKLab',79,view===1)}
<text class="small" x="251" y="14">${['Original','Deutan','Protan','Tritan'][cvd]}</text>
<use href="#color-optimization-view-${view}-${cvd}"/>${view===1&&widths.some(w=>w>0)?`<use class="excluded" href="#color-optimization-excluded${restricted.id}"/><use class="constraint-boundary" href="#color-optimization-restricted${restricted.id}"/>`:''}
<text class="small" x="42" y="34">Input</text><text class="small" x="120" y="34">${trail>=0?'Optimize':'Added'}</text>
${swatches(colors.map(hex=>applyCvdHex(hex,simulationTypes[cvd],1,'machado2009')),count)}${paths}${markers(view,colors.slice(0,count),Math.min(count,2),cvd,TRACE[trail>=0?trail:TRACE.length-1].raw)}
<text class="setting" x="9" y="110">Tightening</text>${controls}<text class="small" x="251" y="158">a</text><text class="small" x="183" y="90">b</text>
<text class="caption" x="160" y="172">${title}</text>
${click?`<path class="cursor" d="M${num(click[0])} ${num(click[1])}l2 13 3-4 5 1Z"/>`:''}</g>`;
  };
  /** @type {string[]} */
  const frames=[];
  const hold=(/** @type {string} */ frame,/** @type {number} */ n)=>{for(let i=0;i<n;i++)frames.push(frame);};
  hold(scene({title:'Choose input colours',widths:[0,0,0],count:0}),3);
  const first=views[1].toXY(/** @type {{a:number,b:number}} */ (decodeColor(INPUTS[0],'oklab')));
  hold(scene({title:'Choose input colours',widths:[0,0,0],count:1,click:first}),4);
  hold(scene({title:'Choose input colours',widths:[0,0,0],count:2,click:views[1].toXY(/** @type {{a:number,b:number}} */ (decodeColor(INPUTS[1],'oklab')))}),4);
  hold(scene({title:'Explore colour spaces',widths:[0,0,0],count:2,view:0,click:[41,14]}),5);
  hold(scene({title:'Explore colour spaces',widths:[0,0,0],count:2,click:[111,14]}),4);
  const editing=[0,0,0];
  for(let ch=0;ch<3;ch++)for(let step=1;step<=5;step++){
    editing[ch]=WIDTHS[ch]*(step/5);
    const limits=region(editing);if(!limits)throw new Error('Palette: missing edited limits');
    const hi=limits.bounds.boundsByName[['l','a','b'][ch]][1];
    hold(scene({title:`Tighten ${['L','a','b'][ch]} independently`,count:2,widths:[...editing],click:[25+hi*92,127+ch*14]}),1);
  }
  hold(scene({title:'Independent hard limits',count:2}),4);
  for(let i=0;i<TRACE.length;i++) hold(scene({title:`Optimize · best of ${FIXTURE.config.nOptimRuns} starts`,colors:[...INPUTS,...TRACE[i].hex],trail:i}),1);
  hold(scene({title:'Compare colour vision',cvd:0}),4);
  for(let i=1;i<4;i++) hold(scene({title:'Compare colour vision',cvd:i,click:[251,14]}),7);
  hold(scene({title:'Optimized palette'}),6);
  // The authored still is the verified final palette; only started motion reveals the workflow.
  const book=flipbook('color-optimization',frames,PERIOD);
  // Firefox's <use> shadow tree does not retain the external [data-art] ancestor
  // for scoped paint selectors. Give reused geometry its paint directly so the
  // outline cannot become an opaque black polygon over the colorspace image.
  return art({name:'color-optimization',period:PERIOD,frames:book.frames,
    defs:[...regions.values()].map(({id,path})=>`<path id="color-optimization-restricted${id}" fill="none" stroke="#334155" stroke-width=".9" stroke-dasharray="3 2" d="${path}"/><path id="color-optimization-excluded${id}" fill-rule="evenodd" fill="white" fill-opacity=".52" d="${views[1].outline}${path}"/>`).join('')+views.map((v,i)=>`<clipPath id="color-optimization-clip-${i}"><path d="${v.outline}"/></clipPath>${v.fields.map((field,cvd)=>`<g id="color-optimization-view-${i}-${cvd}"><rect class="plot" fill="var(--surface)" stroke="var(--art-line)" x="${px}" y="${py}" width="${side}" height="${side}"/><image href="${field}" x="${px}" y="${py}" width="${side}" height="${side}" clip-path="url(#color-optimization-clip-${i})"/><path class="outline" fill="none" stroke="var(--art-muted)" stroke-width="1" d="${v.outline}"/></g>`).join('')}`).join(''),
    body:`<g class="finished">${scene({title:'Optimized palette'})}</g><g class="process">${book.body}</g>`,
    css:`${book.css}
& .process { display:none; }
& text { font-family:ui-sans-serif,system-ui,sans-serif;dominant-baseline:central; }
& .small, & .tab-label { font-size:11px;fill:var(--art-ink);text-anchor:middle; }
& .hex { font-size:10px;font-weight:600;text-anchor:middle; }
& .caption { font-size:12px;font-weight:600;fill:var(--art-ink);text-anchor:middle; }
& .setting { font-size:10px;fill:var(--art-muted); }
& .tab { fill:var(--art-paper);stroke:var(--art-line); }
& .tab.active { fill:var(--art-line);stroke:var(--art-muted); }
& .trail { fill:none;stroke-width:1;stroke-opacity:.6; }
& .track { fill:none;stroke:var(--art-line);stroke-width:3; }
& .range { fill:none;stroke:var(--art-ink);stroke-width:3; }
& .channel { font-weight:700;fill:var(--art-ink); }
& .handle { fill:var(--art-paper);stroke:var(--art-ink); }
& .cursor { fill:var(--art-ink);stroke:var(--art-paper);stroke-width:.8; }`,
    loop:`& .finished { display:none; } & .process { display:inline; }\n${book.loop}`,
  });
}
