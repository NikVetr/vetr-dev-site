// One open guide stroke. Points use y-up coordinates, matching the drawing API.
/** @typedef {[number, number]} Point */
export class PathPad {
  /** @param {HTMLCanvasElement} canvas @param {{start:()=>void,change:(points:Point[])=>void,cancel:()=>void,reject:(message:string)=>void}} events */
  constructor(canvas, events) {
    this.canvas=canvas; this.events=events; this.view=[0,0,600,200]; this.tooLong=false;
    /** @type {Point[]} */ this.points=[];
    /** @type {Point[] | null} */ this.before=null;
    /** @type {number | null} */ this.pointer=null;
    canvas.addEventListener('pointerdown', e=>{
      if(this.pointer!==null || (e.pointerType==='mouse'&&e.button!==0))return;
      e.preventDefault();canvas.focus();events.start();this.tooLong=false;this.before=this.points;this.view=[0,0,600,200];this.points=[this.point(e)];this.pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);this.paint();
    });
    canvas.addEventListener('pointermove',e=>{
      if(e.pointerId!==this.pointer)return;
      const p=this.point(e),last=this.points[this.points.length-1];
      if(Math.hypot(p[0]-last[0],p[1]-last[1])>=1){if(this.points.length>=2048)this.tooLong=true;else{this.points.push(p);this.paint();}}
    });
    canvas.addEventListener('pointerup',e=>{
      if(e.pointerId!==this.pointer)return;
      const end=this.point(e),last=this.points[this.points.length-1];
      if(Math.hypot(end[0]-last[0],end[1]-last[1])>=1){if(this.points.length>=2048)this.tooLong=true;else this.points.push(end);}
      this.pointer=null;
      if(this.tooLong){this.set(this.before??[]);events.reject('This stroke has more than 2,048 points. The previous guide was kept; draw a shorter, simpler path.');return;}
      this.before=null;this.paint();events.change(this.points.map(p=>[...p]));
    });
    canvas.addEventListener('pointercancel',e=>{if(e.pointerId===this.pointer)this.cancel();});
    new ResizeObserver(()=>this.paint()).observe(canvas);
  }
  /** @param {PointerEvent} e @returns {Point} */
  point(e){const r=this.canvas.getBoundingClientRect();return[Math.max(0,Math.min(600,(e.clientX-r.left)/r.width*600)),Math.max(0,Math.min(200,(r.bottom-e.clientY)/r.height*200))];}
  cancel(){if(this.pointer===null)return;this.pointer=null;const previous=this.before??[];this.set(previous);this.events.cancel();}
  /** @param {Point[]} points */
  set(points){this.pointer=null;this.before=null;this.points=points.map(p=>[...p]);
    if(points.length){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),scale=Math.max((x1-x0)/540,(y1-y0)/150,1e-6);this.view=[(x0+x1)/2-300*scale,(y0+y1)/2-100*scale,600*scale,200*scale];}else this.view=[0,0,600,200];
    this.paint();}
  paint(){
    const c=this.canvas,ratio=window.devicePixelRatio||1,w=c.clientWidth||300,h=c.clientHeight||100;
    c.width=Math.round(w*ratio);c.height=Math.round(h*ratio);
    const ctx=/** @type {CanvasRenderingContext2D} */(c.getContext('2d'));ctx.setTransform(c.width/600,0,0,c.height/200,0,0);
    ctx.clearRect(0,0,600,200);
    const [vx,vy,vw,vh]=this.view,at=(/** @type {Point} */[x,y])=>[(x-vx)/vw*600,200-(y-vy)/vh*200];ctx.lineWidth=2*600/w;ctx.strokeStyle='#2b66d5';ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
    this.points.forEach((p,i)=>{const [x,y]=at(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();
    if(this.points.length){ctx.fillStyle='#2b66d5';ctx.beginPath();ctx.arc(.../** @type {[number,number]} */(at(this.points[0])),4*600/w,0,2*Math.PI);ctx.fill();}
  }
}
