// Optional, ordered editing stages. Coordinates on the timeline always refer to
// the raw ink, so edits cannot move the span that selected them.
import { cumulativeLength } from './resample.js';

/** @typedef {{kind:'smooth'|'thickness', from:number, to:number, strength:number, falloff:number, hairpin:'preserve'|'round'|'loop'}} Effect */
/** @typedef {{x:number,y:number,dx:number,dy:number,radius:number}} Warp */
/** @param {import('./resample.js').RawPoint[][]} raw */
export function timeline(raw) {
  const lengths = raw.map(s => { const a = cumulativeLength(s.map(p => p.x), s.map(p => p.y)); return a[a.length - 1]; });
  const ink = lengths.reduce((a,b) => a+b,0);
  const gap = (ink || 1) * 0.03;
  const weights = lengths.map(n => n || gap / 3);
  const total = weights.reduce((a,b) => a+b,0) + gap * Math.max(0, raw.length-1);
  let offset = 0;
  return weights.map(n => { const span = {from:offset/total, to:(offset+n)/total}; offset += n+gap; return span; });
}
/** @param {number} u @param {{from:number,to:number,falloff:number}} e */
export function influence(u,e) {
  const d = Math.max(e.from-u, u-e.to, 0);
  if (!d) return 1;
  if (!e.falloff || d >= e.falloff) return 0;
  const t = d/e.falloff;
  return 1-t*t*(3-2*t);
}
/** Gaussian averaging at a physical radius; end points remain fixed.
 * @param {ArrayLike<number>} a @param {number} radius */
function average(a,radius) {
  return Float64Array.from(a, (v,i) => {
    if (i===0 || i===a.length-1) return v;
    let sum=0, weight=0;
    for(let j=Math.max(0,i-Math.ceil(3*radius));j<=Math.min(a.length-1,i+Math.ceil(3*radius));j++) {
      const w=Math.exp(-0.5*((j-i)/radius)**2); sum+=a[j]*w;weight+=w;
    }
    return sum/weight;
  });
}
/** Separated, sharply reversing turns. @param {ArrayLike<number>} x @param {ArrayLike<number>} y @param {number} reach */
export function hairpins(x,y,reach) {
  const found=[];
  for(let i=reach;i<x.length-reach;i++) {
    const ax=x[i]-x[i-reach], ay=y[i]-y[i-reach], bx=x[i+reach]-x[i],by=y[i+reach]-y[i];
    const dot=(ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by)||1);
    if(dot < -0.65 && (!found.length || i-found[found.length-1]>2*reach)) found.push(i);
  }
  return found;
}
/** @param {{x:Float64Array,y:Float64Array,s:Float64Array}[]} strokes
 * @param {import('./resample.js').RawPoint[][]} raw @param {Effect[]} effects @param {Warp[]} warps @param {number} height */
export function editGeometry(strokes,raw,effects,warps,height) {
  const spans=timeline(raw);
  strokes.forEach((st,k)=> {
    const n=st.x.length, length=st.s[n-1]||1;
    const u=Array.from(st.s,v=>spans[k].from+(spans[k].to-spans[k].from)*v/length);
    for(const e of effects) {
      if(e.kind!=='smooth'||e.strength===0||n<3) continue;
      const reach=Math.max(1,Math.min(Math.floor((n-1)/4), Math.round(height*0.035/(length/(n-1)))));
      const turns=hairpins(st.x,st.y,reach);
      const x=average(st.x, Math.max(0.5,reach*e.strength)), y=average(st.y,Math.max(0.5,reach*e.strength));
      if(e.hairpin==='loop') for(const i of turns) {
        // A circular detour carried along the bridge between rounded endpoints.
        // The periodic offset is zero at both ends; this is intentionally a geometry edit.
        const radius=height*0.025*Math.min(e.strength,2);
        const loopReach=Math.min(Math.max(8,4*reach),i,n-1-i);
        const ax=st.x[i]-st.x[i-loopReach],ay=st.y[i]-st.y[i-loopReach], norm=Math.hypot(ax,ay)||1;
        const x0=x[i-loopReach],y0=y[i-loopReach],x1=x[i+loopReach],y1=y[i+loopReach];
        for(let j=i-loopReach;j<=i+loopReach;j++) {
          const t=(j-(i-loopReach))/(2*loopReach),theta=2*Math.PI*t;
          x[j]=x0*(1-t)+x1*t+radius*(Math.sin(theta)*ax/norm+(1-Math.cos(theta))*(-ay/norm));
          y[j]=y0*(1-t)+y1*t+radius*(Math.sin(theta)*ay/norm+(1-Math.cos(theta))*ax/norm);
        }
      }
      for(let i=0;i<n;i++) {
        let w=influence(u[i],e)*Math.min(1,e.strength);
        if(e.hairpin==='preserve' && turns.some(j=>Math.abs(i-j)<=reach)) w=0;
        st.x[i]+=(x[i]-st.x[i])*w; st.y[i]+=(y[i]-st.y[i])*w;
      }
    }
    for(const warp of warps) for(let i=0;i<n;i++) {
      const r=Math.hypot(st.x[i]-warp.x,st.y[i]-warp.y)/warp.radius;
      if(r<1) { const w=(1-r*r)**2; st.x[i]+=warp.dx*w;st.y[i]+=warp.dy*w; }
    }
  });
}
/** @param {Float64Array[]} widths @param {{s:Float64Array}[]} strokes @param {import('./resample.js').RawPoint[][]} raw @param {Effect[]} effects */
export function editWidths(widths,strokes,raw,effects) {
  const spans=timeline(raw);
  widths.forEach((w,k)=> { const s=strokes[k].s,total=s[s.length-1]||1;
    for(const e of effects) if(e.kind==='thickness') for(let i=0;i<w.length;i++) {
      const u=spans[k].from+(spans[k].to-spans[k].from)*s[i]/total;
      w[i]*=1+(e.strength-1)*influence(u,e);
    }
  });
}
/** Conservative proposals: a neutral global bar and a local bar around the
 * largest raw second difference. Users explicitly apply the proposed local edit.
 * @param {import('./resample.js').RawPoint[][]} raw @returns {Effect[]} */
export function suggestEffects(raw) {
  const spans=timeline(raw); let best=0,where=0.5;
  raw.forEach((s,k)=> {const arc=cumulativeLength(s.map(p=>p.x),s.map(p=>p.y));
    for(let i=1;i<s.length-1;i++) {const v=Math.hypot(s[i-1].x-2*s[i].x+s[i+1].x,s[i-1].y-2*s[i].y+s[i+1].y);
      if(v>best) {best=v;where=spans[k].from+(spans[k].to-spans[k].from)*arc[i]/(arc[arc.length-1]||1);}
    }
  });
  return [{kind:'smooth',from:0,to:1,strength:0,falloff:0,hairpin:'preserve'},
    {kind:'smooth',from:Math.max(0,where-.05),to:Math.min(1,where+.05),strength:0,falloff:.03,hairpin:'preserve'}];
}
