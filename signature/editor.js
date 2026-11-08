import { resampleStroke } from './core/resample.js';
import { timeline, influence } from './core/effects.js';

/** Colour is keyed to raw arc length, never to the edited geometry. @param {number} u */
export const timelineColor = u => `rgb(${Math.round(166-132*u)}, ${Math.round(66+35*u)}, ${Math.round(15+155*u)})`;
const el = (tag, text='', cls='') => {const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};

/** The effect editor owns presentation only; all geometry comes from submit(). */
export class EffectEditor {
  /** @param {{host:HTMLElement, canvas:HTMLCanvasElement, raw:()=>import('./core/resample.js').RawPoint[][],
   * state:()=>{effects:import('./core/effects.js').Effect[],warps:import('./core/effects.js').Warp[]},
   * result:()=>import('./core/index.js').Result|null, remember:()=>void, change:()=>void, render:()=>void,
   * point:(e:PointerEvent)=>{x:number,y:number}}} o */
  constructor(o) {
    this.o=o;this.active=-1;this.colour=true;this.warp=false;this.animation=0;this.frame=0;
    this.media=matchMedia('(prefers-reduced-motion: reduce)');
    const title=el('h3','Adjust along the stroke');
    const help=el('p','Colour follows the pen from first touch to final lift. Gaps mark lifts; distance follows ink length, not elapsed time. Drag the ends or middle of a bar; use Move for narrow spans. Downloads use the chosen ink.','muted small');
    this.line=el('div','','stroke-timeline');this.line.setAttribute('aria-label','Stroke timeline, from first pen down to last pen up');
    this.rows=el('div','','effect-rows');
    const actions=el('div','','toolbar');
    for(const [kind,text] of [['smooth','＋ Smoothing'],['thickness','＋ Thickness']]) {
      const b=el('button',text);b.type='button';b.addEventListener('click',()=>{
        o.remember();o.state().effects.push({kind:/** @type {'smooth'|'thickness'} */(kind),from:.25,to:.75,strength:1,falloff:.03,hairpin:'preserve'});
        this.active=o.state().effects.length-1;this.sync();o.change();
      });actions.append(b);
    }
    const colour=el('label','','check'); const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=true;
    toggle.addEventListener('change',()=>{this.colour=toggle.checked;o.render();});colour.append(toggle,' Link colours');actions.append(colour);
    const motion=el('label','','check');this.motion=document.createElement('input');this.motion.type='checkbox';this.motion.checked=false;
    this.motion.addEventListener('change',()=>{if(!this.motion.checked)this.stop();});motion.append(this.motion,' Creation animation');actions.append(motion);
    const replay=el('button','Show creation');replay.type='button';replay.addEventListener('click',()=>this.play());actions.append(replay);
    this.media.addEventListener('change',()=>{if(this.media.matches)this.stop();});
    o.host.append(title,help,this.line,this.rows,actions);
    this.buildWarp();
    this.rows.addEventListener('focusout',()=>requestAnimationFrame(()=>{if(!this.rows.contains(document.activeElement)){this.active=-1;o.render();}}));
    this.o.canvas.addEventListener('pointerdown',e=>this.warpDown(e),{capture:true});
    this.o.canvas.addEventListener('pointermove',e=>{if(this.warp&&!this.drag){this.hover=this.o.point(e);this.o.render();}this.warpMove(e);});
    this.o.canvas.addEventListener('pointerleave',()=>{this.hover=null;this.o.render();});
    this.o.canvas.addEventListener('pointerup',()=>this.warpEnd());
    this.o.canvas.addEventListener('pointercancel',()=>this.warpEnd());
    this.drag=null;
    this.overlay=document.createElement('canvas');this.overlay.className='creation-overlay';this.overlay.hidden=true;document.body.append(this.overlay);
    o.host.addEventListener('pointerdown',()=>{if(this.animation)this.stop();},{capture:true});
    o.host.addEventListener('keydown',()=>{if(this.animation)this.stop();},{capture:true});
  }
  stop() {this.overlay.hidden=true;cancelAnimationFrame(this.frame);this.animation=0;this.rows.classList.remove('revealing');this.o.render();}
  play() {
    if(this.media.matches||!this.o.result())return;
    this.o.host.closest('.results-card').scrollIntoView({block:'start',behavior:'instant'});
    this.animation=performance.now();this.rows.classList.add('revealing');
    const tick=()=>{if(performance.now()-this.animation>3200){this.stop();return;}this.o.render();this.frame=requestAnimationFrame(tick);};
    cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(tick);
  }
  created() {this.sync();if(this.motion.checked)this.play();}
  sync() {
    const spans=timeline(this.o.raw());this.line.replaceChildren();
    spans.forEach((s,i)=>{const seg=el('span','','timeline-stroke');seg.style.left=`${s.from*100}%`;seg.style.width=`${(s.to-s.from)*100}%`;seg.style.background=`linear-gradient(to right,${timelineColor(s.from)},${timelineColor(s.to)})`;seg.title=`Stroke ${i+1}`;this.line.append(seg);});
    this.rows.replaceChildren();
    this.o.state().effects.forEach((e,i)=>this.row(e,i));
    this.warpCount.textContent=`${this.o.state().warps.length} warp${this.o.state().warps.length===1?'':'s'}`;
  }
  /** @param {import('./core/effects.js').Effect} effect @param {number} i */
  row(effect,i) {
    const row=el('div','','effect-row');row.style.setProperty('--row',String(i));
    const note=el('p','Suggested span · strength 0 leaves it unchanged.','small muted');note.hidden=effect.kind!=='smooth'||effect.strength!==0;
    const top=el('div','','effect-top');const name=el('strong',`${i+1}. ${effect.kind==='smooth'?'Smoothing':'Thickness'}`);top.append(name);
    const remove=el('button','Remove');remove.type='button';remove.setAttribute('aria-label',`Remove effect ${i+1}`);
    remove.addEventListener('click',()=>{this.o.remember();this.o.state().effects.splice(i,1);this.active=-1;this.sync();this.o.change();});top.append(remove);row.append(top);
    const track=el('div','','effect-track');const bar=el('div','','effect-bar');track.append(bar);row.append(track);
    const update=()=>{bar.style.left=`${effect.from*100}%`;bar.style.width=`${(effect.to-effect.from)*100}%`;};update();
    const activate=()=>{this.active=i;this.o.render();};row.addEventListener('focusin',activate);row.addEventListener('pointerenter',activate);
    row.addEventListener('pointerleave',()=>{if(!row.contains(document.activeElement)&&!this.spanDrag){this.active=-1;this.o.render();}});
    const inputs={};
    const changed=()=>{note.hidden=effect.kind!=='smooth'||effect.strength!==0;update();for(const key of ['from','to'])inputs[key].value=String(Math.round(effect[key]*1000)/10);this.o.change();};
    for(const location of ['from','body','to','move']) {
      const part=location==='move'?'body':location;
      const b=el('button',location==='move'?'↔ Move':part==='body'?'↔':part==='from'?'[':']',`span-${location}`);b.type='button';b.setAttribute('aria-label',`${location==='move'?'Move':part==='body'?'Drag body of':part==='from'?'Start of':'End of'} effect ${i+1}`);if(location==='move')top.insertBefore(b,remove);else bar.append(b);
      const shift=delta=>{if(part==='body'){const d=Math.max(-effect.from,Math.min(1-effect.to,delta));effect.from+=d;effect.to+=d;}else effect[part]=Math.max(part==='to'?effect.from:0,Math.min(part==='from'?effect.to:1,effect[part]+delta));};
      b.addEventListener('keydown',ev=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();this.o.remember();shift(ev.key==='Home'?-1:ev.key==='End'?1:(ev.key==='ArrowLeft'?-1:1)*(ev.shiftKey?.1:.01));changed();});
      b.addEventListener('pointerdown',ev=>{if(ev.button!==0)return;ev.preventDefault();this.stop();activate();this.o.remember();b.setPointerCapture(ev.pointerId);this.spanDrag={x:ev.clientX,width:track.getBoundingClientRect().width};});
      b.addEventListener('pointermove',ev=>{if(!this.spanDrag)return;const d=(ev.clientX-this.spanDrag.x)/this.spanDrag.width;this.spanDrag.x=ev.clientX;shift(d);changed();});
      const end=()=>{this.spanDrag=null;};b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);
    }
    const controls=el('div','','effect-controls');row.append(controls);
    for(const [key,label,max,step,scale] of [['from','Start %',100,.1,100],['to','End %',100,.1,100],['strength',effect.kind==='thickness'?'Width ×':'Strength',4,.05,1],['falloff','Falloff %',100,.5,100]]) {
      const wrap=el('label',String(label));const input=document.createElement('input');input.type='number';input.min=key==='strength'&&effect.kind==='thickness'?'.05':'0';input.max=String(max);input.step=String(step);input.value=String(Math.round(effect[key]*Number(scale)*1000)/1000);input.setAttribute('aria-label',`${label}, effect ${i+1}`);inputs[key]=input;wrap.append(input);controls.append(wrap);
      input.addEventListener('change',()=>{const n=input.valueAsNumber/Number(scale);if(!input.checkValidity()||!Number.isFinite(n)||(key==='from'&&n>effect.to)||(key==='to'&&n<effect.from)){input.value=String(effect[key]*Number(scale));return;}this.o.remember();effect[key]=n;changed();});
      if(key==='strength'||key==='falloff') {
        const range=document.createElement('input');range.type='range';range.min=input.min;range.max=input.max;range.step=input.step;range.value=input.value;range.setAttribute('aria-label',`${label} slider, effect ${i+1}`);wrap.append(range);
        let held=false;range.addEventListener('pointerdown',()=>{this.o.remember();held=true;});range.addEventListener('pointerup',()=>{held=false;});range.addEventListener('pointercancel',()=>{held=false;});
        range.addEventListener('input',()=>{if(!held)this.o.remember();effect[key]=Number(range.value)/Number(scale);input.value=range.value;note.hidden=effect.kind!=='smooth'||effect.strength!==0;this.o.change();});input.addEventListener('change',()=>range.value=input.value);
      }
    }
    if(effect.kind==='smooth') {const wrap=el('label','Hairpins');const select=document.createElement('select');for(const mode of ['preserve','round','loop']){const opt=document.createElement('option');opt.value=mode;opt.textContent=mode;select.append(opt);}select.value=effect.hairpin;select.setAttribute('aria-label',`Hairpins, effect ${i+1}`);select.addEventListener('change',()=>{this.o.remember();effect.hairpin=/** @type {'preserve'|'round'|'loop'} */(select.value);this.o.change();});wrap.append(select);controls.append(wrap);}
    row.append(note);
    this.rows.append(row);
  }
  buildWarp() {
    const box=el('details','','warp-controls');box.append(el('summary','Move the ink directly'));
    const help=el('p','Enable Warp, then drag the corrected signature. Ink inside the radius follows; the edge stays still. Or enter a centre and displacement below, in signature units.','small muted');box.append(help);
    const toggle=el('label','','check');const check=document.createElement('input');check.type='checkbox';check.addEventListener('change',()=>{this.warp=check.checked;this.o.canvas.classList.toggle('warping',this.warp);this.o.render();if(this.warp){const off=document.querySelector('input[name="brush"][value="off"]');if(off instanceof HTMLInputElement){off.checked=true;off.dispatchEvent(new Event('change'));}}});toggle.append(check,' Warp on canvas');box.append(toggle);
    this.warpInputs={};const fields=el('div','','effect-controls');
    for(const [key,label,value] of [['x','Centre x',0],['y','Centre y',0],['dx','Move x',0],['dy','Move y',0],['radius','Radius',50]]) {const wrap=el('label',String(label));const input=document.createElement('input');input.type='number';input.step='any';input.value=String(value);if(key==='radius')input.min='.001';input.setAttribute('aria-label',String(label));wrap.append(input);fields.append(wrap);this.warpInputs[key]=input;}
    box.append(fields);const actions=el('div','','toolbar');const apply=el('button','Apply warp');apply.type='button';apply.addEventListener('click',()=>{const w=this.readWarp();if(!w)return;this.o.remember();this.o.state().warps.push(w);this.sync();this.o.change();});actions.append(apply);
    const clear=el('button','Clear warps');clear.type='button';clear.addEventListener('click',()=>{if(!this.o.state().warps.length)return;this.o.remember();this.o.state().warps=[];this.sync();this.o.change();});actions.append(clear);this.warpCount=el('span','','muted');actions.append(this.warpCount);box.append(actions);this.o.host.append(box);
  }
  readWarp() {
    const inputs=Object.values(this.warpInputs);if(inputs.some(i=>!i.reportValidity()||!Number.isFinite(i.valueAsNumber)))return null;
    return /** @type {import('./core/effects.js').Warp} */(Object.fromEntries(Object.entries(this.warpInputs).map(([k,i])=>[k,i.valueAsNumber])));
  }
  /** @param {PointerEvent} e */
  warpDown(e) {
    if(!this.warp||!this.o.result()||e.button!==0)return;
    e.preventDefault();e.stopImmediatePropagation();this.stop();const w=this.readWarp();if(!w)return;
    this.o.remember();const p=this.o.point(e);this.drag={...w,...p,dx:0,dy:0};this.o.state().warps.push(this.drag);this.o.canvas.setPointerCapture(e.pointerId);
  }
  /** @param {PointerEvent} e */
  warpMove(e) {if(!this.drag)return;const p=this.o.point(e);this.drag.dx=p.x-this.drag.x;this.drag.dy=p.y-this.drag.y;this.o.change();}
  warpEnd() {if(!this.drag)return;for(const [k,v] of Object.entries(this.drag))this.warpInputs[k].value=String(Math.round(v*1000)/1000);this.drag=null;this.sync();this.o.change();}
  /** @param {CanvasRenderingContext2D} ctx @param {{s:number,ox:number,oy:number}} view */
  drawWarp(ctx,view) {
    const p=this.drag??this.hover,radius=Number(this.warpInputs.radius.value);
    if(!this.warp||!p||!(radius>0))return;
    ctx.save();ctx.strokeStyle='#2265aa';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.beginPath();
    ctx.arc(p.x*view.s+view.ox,p.y*view.s+view.oy,radius*view.s,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  /** @param {CanvasRenderingContext2D} ctx @param {{s:number,ox:number,oy:number}} view */
  draw(ctx,view) {
    const result=this.o.result();if(!result)return;
    if(!this.colour&&this.active<0&&!this.animation){this.drawWarp(ctx,view);return;}
    const raw=this.o.raw(),spans=timeline(raw);
    const elapsed=this.animation?performance.now()-this.animation:Infinity;
    const reveal=Math.floor((elapsed-2300)/150);
    const effect=this.o.state().effects[this.animation&&reveal>=0 ? Math.min(reveal,this.o.state().effects.length-1) : this.active];
    const stage=Math.min(1,Math.max(0,(elapsed-1400)/900));
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    result.strokes.forEach((st,k)=> {const span=spans[k];if(!span)return;
      let points=st.points;
      if(elapsed<1000 && points.length>1) {
        const r=resampleStroke(raw[k].map(p=>p.x),raw[k].map(p=>p.y),points.length),t=elapsed/1000;
        points=points.map((p,i)=>[r.x[i]*(1-t)+p[0]*t,r.y[i]*(1-t)+p[1]*t,p[2]]);
      }
      if(points.length===1) {const p=points[0];ctx.globalAlpha=effect?.from>span.to||effect?.to<span.from? .14:1;ctx.fillStyle=timelineColor(span.from);ctx.beginPath();ctx.arc(p[0]*view.s+view.ox,p[1]*view.s+view.oy,p[2]*view.s/2,0,Math.PI*2);ctx.fill();}
      for(let i=1;i<points.length;i++) {const u=span.from+(span.to-span.from)*i/(st.points.length-1);const a=points[i-1],b=points[i];
        ctx.globalAlpha=effect ? .14+.86*influence(u,effect) : 1;
        ctx.strokeStyle=elapsed<1000?'#1b1b1b':timelineColor(u);ctx.lineWidth=Math.max(1,b[2]*view.s);
        ctx.beginPath();ctx.moveTo(a[0]*view.s+view.ox,a[1]*view.s+view.oy);ctx.lineTo(b[0]*view.s+view.ox,b[1]*view.s+view.oy);ctx.stroke();

      }
    });ctx.restore();
    this.drawWarp(ctx,view);
    this.overlay.hidden=!(this.animation&&elapsed>=1400&&elapsed<2600);
    if(!this.overlay.hidden) {
      const rect=this.o.canvas.getBoundingClientRect(),line=this.line.getBoundingClientRect(),dpr=ctx.canvas.width/rect.width;
      const height=Math.max(rect.height,line.bottom-rect.top);
      Object.assign(this.overlay.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${height}px`});
      this.overlay.width=ctx.canvas.width;this.overlay.height=Math.ceil(height*dpr);
      const ghost=this.overlay.getContext('2d');ghost.lineCap='round';ghost.lineWidth=2*dpr;
      const targetY=(line.top+10-rect.top)*dpr,targetX=(line.left-rect.left)*dpr,targetW=line.width*dpr;
      result.strokes.forEach((st,k)=>{const span=spans[k];for(let i=1;i<st.points.length;i++) {
        const u0=span.from+(span.to-span.from)*(i-1)/(st.points.length-1),u1=span.from+(span.to-span.from)*i/(st.points.length-1);
        const a=st.points[i-1],b=st.points[i];ghost.strokeStyle=timelineColor(u1);ghost.beginPath();
        ghost.moveTo((a[0]*view.s+view.ox)*(1-stage)+(targetX+u0*targetW)*stage,(a[1]*view.s+view.oy)*(1-stage)+targetY*stage);
        ghost.lineTo((b[0]*view.s+view.ox)*(1-stage)+(targetX+u1*targetW)*stage,(b[1]*view.s+view.oy)*(1-stage)+targetY*stage);ghost.stroke();
      }});
    }
  }
}
