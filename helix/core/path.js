// Optional drawn-path geometry. Straight-mode generators remain unchanged.
// Reuse Signature's arc-length resampling and smoothing; map the original strand
// drawing through a checked centreline/normal frame with a bounded-width envelope.
import {cumulativeLength,resampleStroke} from '../../signature/core/resample.js';
import {smoothPoints} from '../../signature/core/smooth.js';
import {DEFAULTS as SIGNATURE_DEFAULTS} from '../../signature/core/request.js';
import {bounds} from '../../shared/polygon.js';
import {HelixError} from './request.js';

/** @typedef {[number,number]} Point */
/** @typedef {{points:Point[],length:number,width:number,smoothing:number}} PathSettings */
/** @typedef {import('./draw.js').Drawing} Drawing */
const SAMPLES=256;
/** @param {string} code @param {string} message */
const problem=(code,message)=>new HelixError(code,message,[{code,path:'path.points',message}]);
/** @param {Point} a @param {Point} b @param {Point} c */
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
/** @param {Point} a @param {Point} b @param {Point} c @param {Point} d */
function intersects(a,b,c,d){
 if(Math.max(a[0],b[0])<Math.min(c[0],d[0])-1e-10||Math.max(c[0],d[0])<Math.min(a[0],b[0])-1e-10||Math.max(a[1],b[1])<Math.min(c[1],d[1])-1e-10||Math.max(c[1],d[1])<Math.min(a[1],b[1])-1e-10)return false;
 return cross(a,b,c)*cross(a,b,d)<=1e-16&&cross(c,d,a)*cross(c,d,b)<=1e-16;
}
/** @param {Point[]} points @param {boolean} [closed] */
export function hasIntersections(points,closed=false){
 const n=points.length-1;
 for(let i=0;i<n;i++)for(let j=i+2;j<n;j++)if(!(closed&&i===0&&j===n-1)&&intersects(points[i],points[i+1],points[j],points[j+1]))return true;
 return false;
}
/** @param {Point} p @param {Point} a @param {Point} b */
function pointSegmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}

/** A smooth, open path in output units, with width capped before any offsets fold.
 * @param {PathSettings} settings
 */
export function pathFrame(settings){
 const raw=settings.points.filter((p,i)=>!i||Math.hypot(p[0]-settings.points[i-1][0],p[1]-settings.points[i-1][1])>1e-10);
 if(raw.length<2)throw problem('degenerate_path','Draw a path with at least two distinct points.');
 if(hasIntersections(raw))throw problem('crossing_path','The path crosses itself. Draw one open path without crossings.');
 const x=raw.map(p=>p[0]),y=raw.map(p=>p[1]),rawLength=cumulativeLength(x,y).at(-1)??0;
 if(rawLength<1e-9||Math.hypot(x[x.length-1]-x[0],y[y.length-1]-y[0])<rawLength*1e-5)throw problem('degenerate_path','Keep the path open, with distinct starting and ending points.');
 const sampled=resampleStroke(x,y,SAMPLES);
 const sm=smoothPoints(sampled.x,sampled.y,{...SIGNATURE_DEFAULTS.smooth,fourier:{strength:settings.smoothing},wavelet:{...SIGNATURE_DEFAULTS.smooth.wavelet,strength:settings.smoothing}},undefined);
 // Keep the drawn endpoints: a linear correction removes smoothing's endpoint drift.
 for(const values of [sm.x,sm.y]){const original=values===sm.x?sampled.x:sampled.y,a=original[0]-values[0],b=original[original.length-1]-values[values.length-1];for(let i=0;i<values.length;i++)values[i]+=a+(b-a)*i/(values.length-1);}
 const evenly=resampleStroke(sm.x,sm.y,SAMPLES),total=cumulativeLength(evenly.x,evenly.y).at(-1)??0;
 if(total<rawLength*1e-6)throw problem('degenerate_path','Smoothing collapsed this path. Reduce smoothing or draw a longer path.');
 const scale=settings.length/total;
 /** @type {Point[]} */const points=Array.from(evenly.x,(v,i)=>[(v-evenly.x[0])*scale,(evenly.y[i]-evenly.y[0])*scale]);
 if(hasIntersections(points))throw problem('crossing_path','Smoothing makes this path cross itself. Reduce smoothing or redraw the bend.');
 const arc=cumulativeLength(points.map(p=>p[0]),points.map(p=>p[1]));
 /** @type {Point[]} */const normal=points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy);if(n<1e-10)throw problem('degenerate_path','The path doubles back too sharply. Draw a gentler turn.');return[-dy/n,dx/n];});
 let width=settings.width,minRadius=Infinity;
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1],ax=b[0]-a[0],ay=b[1]-a[1],bx=c[0]-b[0],by=c[1]-b[1],ds=(Math.hypot(ax,ay)+Math.hypot(bx,by))/2;
  const turn=Math.abs(Math.atan2(ax*by-ay*bx,ax*bx+ay*by));if(turn>1e-8)minRadius=Math.min(minRadius,ds/turn);
 }
 width=Math.min(width,1.6*minRadius);
 // Nonlocal approaches also constrain the width; local turns are covered above.
 let clearance=Infinity;
 for(let i=0;i<points.length-1;i++)for(let j=i+2;j<points.length-1;j++){
  if(arc[j]-arc[i+1]<=2*settings.width)continue;
  const d=Math.min(pointSegmentDistance(points[i],points[j],points[j+1]),pointSegmentDistance(points[i+1],points[j],points[j+1]),pointSegmentDistance(points[j],points[i],points[i+1]),pointSegmentDistance(points[j+1],points[i],points[i+1]));
  clearance=Math.min(clearance,d);
 }
 width=Math.min(width,.8*clearance);
 /** @param {number} w @returns {Point[]} */
 const envelope=w=>{const left=points.map((p,i)=>/** @type {Point} */([p[0]+normal[i][0]*w/2,p[1]+normal[i][1]*w/2])),right=points.map((p,i)=>/** @type {Point} */([p[0]-normal[i][0]*w/2,p[1]-normal[i][1]*w/2])).reverse();return[...left,...right,left[0]];};
 let edge=envelope(width);
 for(let retry=0;retry<4&&hasIntersections(edge,true);retry++){width*=.5;edge=envelope(width);}
 if(width<settings.length*1e-5||hasIntersections(edge,true))throw problem('tight_path','This turn is too tight for a clean band. Draw a gentler path.');
 /** Normal coordinates along the smoothed centreline. @param {number} proportion @param {number} across @returns {Point} */
 const at=(proportion,across)=>{
  const s=Math.max(0,Math.min(1,proportion))*settings.length;let lo=0,hi=arc.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>>1;if(arc[mid]<=s)lo=mid;else hi=mid;}
  const u=Math.max(0,Math.min(1,(s-arc[lo])/(arc[hi]-arc[lo]))),a=points[lo],b=points[hi];
  let nx=normal[lo][0]+u*(normal[hi][0]-normal[lo][0]),ny=normal[lo][1]+u*(normal[hi][1]-normal[lo][1]);const n=Math.hypot(nx,ny);nx/=n;ny/=n;
  return[a[0]+u*(b[0]-a[0])+across*nx,a[1]+u*(b[1]-a[1])+across*ny];
 };
 return{points,normal,envelope:edge,at,length:settings.length,requestedWidth:settings.width,width,narrowed:width<settings.width*(1-1e-8),smoothing:settings.smoothing,minRadius:Number.isFinite(minRadius)?minRadius:null};
}

/** Bend a canonical horizontal drawing through the checked normal frame.
 * @param {Drawing} drawing @param {PathSettings} settings @returns {Drawing}
 */
export function bendDrawing(drawing,settings){
 const frame=pathFrame(settings),[x0,y0,x1,y1]=bounds(drawing.fills.flatMap(g=>g.shapes.flat(2))),L=x1-x0,H=y1-y0;
 if(!(L>0&&H>0))throw problem('degenerate_design','The design has no finite area to place along the path.');
 /** @param {number} x @param {number} y */const map=(x,y)=>frame.at((x-x0)/L,(y-(y0+y1)/2)/H*frame.width);
 /** Densify long source edges before bending; curved offsets must not become chords.
  * @param {number[]} line @returns {number[]}
  */
 const remap=line=>{
  const out=[];
  for(let i=0;i<line.length-2;i+=2){const n=Math.max(1,Math.ceil(Math.abs(line[i+2]-line[i])/L*SAMPLES));for(let j=0;j<n;j++){const u=j/n;out.push(...map(line[i]+u*(line[i+2]-line[i]),line[i+1]+u*(line[i+3]-line[i+1])));}}
  if(line.length>=2)out.push(...map(line[line.length-2],line[line.length-1]));return out;
 };
 const fills=drawing.fills.map(g=>({...g,shapes:g.shapes.map(shape=>shape.map(poly=>poly.map(remap)))})),lines=drawing.lines.map(g=>({...g,lines:g.lines.map(remap)}));
 return{fills,lines,strokeWidth:drawing.strokeWidth*frame.width/H,flatten:drawing.flatten,
  geometry:at=>({path:{points:frame.points.map(([x,y])=>at(x,y)),envelope:frame.envelope.map(([x,y])=>at(x,y)),length:frame.length,requestedWidth:frame.requestedWidth,width:frame.width,narrowed:frame.narrowed,smoothing:frame.smoothing,minRadius:frame.minRadius},
   fills:fills.map(g=>({id:g.id,color:g.color,polygons:g.shapes.flat().map(poly=>poly.map(r=>r.flatMap((v,i)=>i%2?[]:at(v,r[i+1]))))})),
   centerlines:lines.map(g=>({id:g.id,color:g.color,lines:g.lines.map(r=>r.flatMap((v,i)=>i%2?[]:at(v,r[i+1])))}))})};
}
