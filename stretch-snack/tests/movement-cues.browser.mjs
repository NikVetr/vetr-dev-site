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
            const labels = move.motion === 'ball-back' ? [regions[move.motion]] : [regions[move.motion],phase];
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
