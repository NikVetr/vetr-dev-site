// A real beta–binomial graph and cumulative, seeded draws from the app's sampler.
import { art, esc, num, INK, MUTED, LINE, PAPER } from '../svg.mjs';
import { examples } from '../../../stan2r/examples.js';
import { explore } from '../../../stan2r/core/explorer-native.mjs';

export function previewSimulation() {
  return explore({ source: examples.binomial.source, data: examples.binomial.data, draws: 1024, seed: 57 });
}

/** @param {number[][]} samples @param {number} count @param {number} bins @param {number} upper */
export function histogram(samples, count, bins, upper) {
  const counts = Array(bins).fill(0);
  for (const [value] of samples.slice(0, count)) counts[Math.min(bins - 1, Math.floor(value / upper * bins))]++;
  return counts;
}

export function build() {
  const name = 'stan2r', result = previewSimulation(), checkpoints = [8, 24, 64, 128, 256, 512, 1024];
  const blue = '#6897ba', green = '#64a48d';
  /** @type {Record<string,number[]>} */
  const positions = { theta: [34, 52], trials: [104, 52], successes: [69, 131] };
  const edges = result.model.edges.map(({from,to}) => {
    const a=positions[from], b=positions[to];
    if (!a || !b) throw new Error(`Unexpected preview dependency ${from} → ${to}`);
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
    return `<path d="M${num(a[0]+ux*19)} ${num(a[1]+uy*19)}L${num(b[0]-ux*21)} ${num(b[1]-uy*21)}" marker-end="url(#${name}-arrow)"/>`;
  }).join('');
  const graph = `<g class="model-edges" fill="none" stroke="${MUTED}" stroke-width="1.3">${edges}</g>
    <circle cx="34" cy="52" r="19" fill="${PAPER}" stroke="${blue}" stroke-width="1.6"/>
    <text x="34" y="59" text-anchor="middle" fill="${INK}" font-family="serif" font-style="italic" font-size="23">θ</text>
    <circle cx="104" cy="52" r="19" fill="${LINE}" stroke="${MUTED}"/>
    <text x="104" y="57" text-anchor="middle" fill="${INK}" font-size="15">20</text>
    <circle cx="69" cy="131" r="21" fill="${green}" fill-opacity=".15" stroke="${green}" stroke-width="1.6"/>
    <text x="69" y="137" text-anchor="middle" fill="${INK}" font-family="serif" font-style="italic" font-size="23">y</text>
    <text x="34" y="20" text-anchor="middle" fill="${MUTED}" font-size="10">Beta(2, 2)</text>
    <text x="104" y="20" text-anchor="middle" fill="${MUTED}" font-size="10">trials</text>
    <text x="69" y="170" text-anchor="middle" fill="${MUTED}" font-size="10">Binomial(20, θ)</text>
    <circle class="draw-pulse" r="3.5" cx="0" cy="0" fill="${blue}"/>
    <path d="M140 12V172" stroke="${LINE}"/>`;
  /** @param {number} count */
  const charts = count => {
    const items = [{id:'theta', bins:16, upper:1, y:76, color:blue, label:'θ · prior', ticks:['0','½','1']},
      {id:'successes',bins:21,upper:21,y:151,color:green,label:'y · prior predictive',ticks:['0','10','20']}];
    return items.map(({id,bins,upper,y,color,label,ticks}) => {
      const counts = histogram(result.samples[id],count,bins,upper),width=150/bins;
      const bars=counts.map((n,i)=>{
        // Shared probability scale for every checkpoint; no per-frame normalization to the maximum.
        const height=n/count*180;
        return `<rect data-count="${n}" x="${num(155+i*width)}" y="${num(y-height)}" width="${num(width-.8)}" height="${num(height)}" fill="${color}"/>`;
      }).join('');
      return `<g data-variable="${id}"><text x="155" y="${y-48}" fill="${INK}" font-size="11">${esc(label)}</text>${bars}<path d="M154 ${y}H306" stroke="${LINE}"/>${ticks.map((t,i)=>`<text x="${155+i*75}" y="${y+12}" text-anchor="${i===0?'start':i===2?'end':'middle'}" fill="${MUTED}" font-size="9">${t}</text>`).join('')}</g>`;
    }).join('')+`<text x="305" y="17" text-anchor="end" fill="${MUTED}" font-size="10">${count.toLocaleString('en-US')} draws</text>`;
  };
  const states=checkpoints.map((count,i)=>`<g class="samples samples-${i}" data-draws="${count}">${charts(count)}</g>`).join('');
  const loop = checkpoints.map((_,i)=>{
    const start=i*11,end=i===checkpoints.length-1?100:(i+1)*11;
    return `& .samples-${i}{animation:${name}-samples-${i} 9s step-end infinite}
      @keyframes ${name}-samples-${i}{0%{opacity:${i===0?1:0}}${start}%{opacity:1}${end}%{opacity:0}}`;
  }).join('\n')+`
    & .draw-pulse {animation:${name}-draw 9s ease-in-out infinite}
    @keyframes ${name}-draw {${Array.from({length:8},(_,i)=>{const p=i*12.5;return `${p}%,${p+1}%{transform:translate(42px,70px);opacity:0}${p+2.5}%{opacity:1}${p+9}%{transform:translate(60px,111px);opacity:1}${p+11.25}%,${p+12.5}%{transform:translate(60px,111px);opacity:0}`;}).join('')}}`;
  const defs=`<marker id="${name}-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" fill="${MUTED}"/></marker>`;
  return art({name,body:graph+states,defs,css:`& .samples{opacity:0}& .samples-6{opacity:1}& .draw-pulse{opacity:0}`,loop,period:9});
}
