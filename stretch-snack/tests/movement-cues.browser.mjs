import assert from 'node:assert/strict';
import test from 'node:test';
import {openPage} from '../../scripts/landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');

test('the coach marks the working area and the hold or release phase of an isometric movement', async () => {
  const app = await openPage('stretch-snack/', {engine});
  try {
    const failures = await app.page.evaluate(async () => {
      const {renderMovement} = await import(new URL('demo.js',location.href).href);
      const {moves} = await import(new URL('core/catalog.js',location.href).href);
      const canvas = document.createElement('canvas');
      document.body.append(canvas);
      const ctx = canvas.getContext('2d'), fillText = ctx.fillText.bind(ctx);
      const regions = {'glute-squeeze':'Buttocks', 'knee-squeeze':'Inner thighs', 'quad-set':'Front thigh', 'ball-back':'Massage ball'};
      const failures = [], visible = [];
      const examples = moves.filter(m => m.motion in regions);
      for (const motion of Object.keys(regions))
        if (!examples.some(move => move.motion === motion)) failures.push(['missing',motion]);
      ctx.fillText = (text, x, y) => {
        const width = ctx.measureText(text).width;
        if (x < 0 || x+width > canvas.clientWidth || y <= 2 || y >= canvas.clientHeight-2) failures.push(['clipped',text,x,y]);
        visible.push(text);
        fillText(text,x,y);
      };
      for (const [width,height] of [[135,125],[640,360]]) for (const dark of [false,true]) {
        canvas.style.cssText = 'width:'+width+'px;height:'+height+'px';
        for (const move of examples) {
          for (const [time,phase] of [[0,'Relax'],[1,'Tighten'],[2,'Hold'],[3,'Release']]) {
            visible.length = 0;
            renderMovement(canvas, move, time, {dark});
            const labels = move.motion === 'ball-back' ? [width < 220 ? 'Ball' : 'Massage ball'] : [regions[move.motion],phase];
            if (visible.join('/') !== labels.join('/')) failures.push([move.id,time,visible.slice()]);
          }
        }
      }
      canvas.remove();
      return failures;
    });
    assert.deepEqual(failures, []);
    assert.deepEqual(app.errors, []);
  } finally {await app.close();}
});

test('the phone hand close-up uses the clear corner and magnifies the fingers through the exercise', async () => {
  const app = await openPage('stretch-snack/', {engine,width:440,height:956,touch:true,scheme:'dark'});
  try {
    const result = await app.page.evaluate(async () => {
      const {renderMovement} = await import(new URL('demo.js',location.href).href);
      const {movementCamera} = await import(new URL('camera.js',location.href).href);
      const {moves} = await import(new URL('core/catalog.js',location.href).href);
      const canvas = document.createElement('canvas');
      document.body.append(canvas);
      const ctx = canvas.getContext('2d',{willReadFrequently:true});
      const arc = ctx.arc.bind(ctx);
      /** @type {{x:number,y:number,r:number,covered:number}[]} */
      const lenses=[];
      ctx.arc = (x,y,r,start,end,reverse) => {
        if (!lenses.length) {
          // The main view and its leader have been painted, before the inset
          // obscures them. Count any opaque figure or prop inside the disk.
          const dpr = canvas.width/canvas.clientWidth;
          const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
          let covered=0;
          for (let row=Math.ceil(y-r); row<y+r; row+=2)
            for (let col=Math.ceil(x-r); col<x+r; col+=2) {
              if ((col-x)**2+(row-y)**2 >= (r-3)**2) continue;
              const at = 4*(Math.floor(row*dpr)*canvas.width+Math.floor(col*dpr));
              if (data[at+3]>200) covered+=4;
            }
          lenses.push({x,y,r,covered});
        }
        arc(x,y,r,start,end,reverse);
      };
      function render(id,t,w=408,h=343,zoom=true) {
        canvas.style.cssText='width:'+w+'px;height:'+h+'px;position:fixed';
        const move=moves.find(m=>m.id===id);
        lenses.length=0;
        renderMovement(canvas,move,t,{dark:true,camera:movementCamera(move,{zoom})});
        const lens=lenses[0];
        if (!lens || lens.x-lens.r<3 || lens.x+lens.r>w-3 || lens.y-lens.r<3 || lens.y+lens.r>h-3)
          throw Error('Clipped lens: '+id);
        if (lens.covered>Math.PI*lens.r**2*.005) throw Error('Lens covers the main view: '+id);
        return lens;
      }
      const open=render('seated-hand-open',2), dpr=canvas.width/canvas.clientWidth;
      // Measure the drawn shape, including the visible wrist. A large empty
      // circle with an unchanged miniature hand would fail this check.
      const pixels=new Uint32Array(ctx.getImageData(0,0,canvas.width,canvas.height).data.buffer);
      const background=pixels[Math.floor((open.y-open.r+4)*dpr)*canvas.width+Math.floor(open.x*dpr)];
      let left=Infinity,right=-Infinity;
      for(let y=Math.ceil(open.y-open.r);y<open.y+open.r;y++)
        for(let x=Math.ceil(open.x-open.r);x<open.x+open.r;x++)
          if((x-open.x)**2+(y-open.y)**2<(open.r-5)**2 &&
              pixels[Math.floor(y*dpr)*canvas.width+Math.floor(x*dpr)]!==background){
            left=Math.min(left,x);right=Math.max(right,x);
          }
      const closed=render('seated-hand-open',0);
      const otherSide=render('seated-hand-open',6);
      for(const [id,t] of [
        ['seated-towel-grip',2],['seated-wrist-lift-bottle',2],['standing-prayer-stretch',4],
        ['standing-ball-grip',12],['seated-wrist-press',4],['hands-and-knees-wrist-rock',3],
      ]) {
        render(id,t); render(id,t,280,210,false); render(id,t,640,300);
      }
      canvas.remove();
      return {open,closed,otherSide,width:right-left+1};
    });
    assert.ok(result.open.x>270 && result.open.y-result.open.r<14 && result.open.r>84);
    assert.ok(result.width>145, 'visible open hand and wrist should span at least 145 CSS pixels');
    for(const view of [result.closed,result.otherSide]) {
      assert.equal(view.x,result.open.x);
      assert.equal(view.y,result.open.y);
      assert.equal(view.r,result.open.r);
    }
    assert.deepEqual(app.errors,[]);
  } finally {await app.close();}
});
