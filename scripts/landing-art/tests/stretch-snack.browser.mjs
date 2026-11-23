import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../browser.mjs';
import { prepare, stepCamera } from '../../../assets/players/stretch-snack.js';
import { cameraProjection } from '../../../stretch-snack/camera.js';
import { movementPose, repetitionSeconds } from '../../../stretch-snack/pose.js';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');

test('the working fingertips and feet stay in frame throughout the three moves and their camera transitions', () => {
  const {steps} = prepare();
  const width = 100, height = 125; // The compact desktop pose has the same 4:5 aspect as the larger views.
  for (const [i, step] of steps.entries()) {
    const next = steps[(i + 1) % steps.length];
    assert.deepEqual(stepCamera(step,step.seconds), stepCamera(next,0));
    for (let frame = 0; frame <= step.seconds * 60; frame++) {
      const seconds = frame / 60;
      const {project} = cameraProjection(stepCamera(step,seconds),width,height,false);
      const pose = movementPose(step.move, repetitionSeconds * seconds / step.seconds);
      const joints = step.move.motion === 'knee-extend'
        ? pose.legs.flatMap(leg => [leg.knee,leg.ankle,leg.toe])
        : pose.arms.flatMap(arm => [arm.elbow,arm.thumb,...arm.fingers.map(finger => finger[1])]);
      for (const joint of joints) {
        const [x,y] = project(joint);
        assert.ok(Math.min(x,y,width-x,height-y) >= 3, step.id+' cropped the moving limb at '+seconds+' s');
      }
    }
  }
});

test('Stretch Snack previews the actual session, its 15-second clock and its trainer', async () => {
  const {page, close, errors} = await openPage('#stretch-snack-title', {engine});
  try {
    const art = page.locator('[data-art="stretch-snack"]');
    await page.emulateMedia({reducedMotion:'reduce'});
    await art.locator('img').first().waitFor();
    for (const [width, height] of [[1440,900], [390,844], [320,568], [844,390], [1920,1080]]) {
      await page.setViewportSize({width,height});
      await art.scrollIntoViewIfNeeded();
      const fit = await art.evaluate(async el => {
        const images = [...el.querySelectorAll('.pose img')];
        await Promise.all(images.map(img => img.decode()));
        const box = el.getBoundingClientRect(), pose = el.querySelector('.pose').getBoundingClientRect();
        const visible = images.filter(img => getComputedStyle(img).display !== 'none');
        const canvas = document.createElement('canvas');
        canvas.width = visible[0].naturalWidth;
        canvas.height = visible[0].naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(visible[0],0,0);
        const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let first = canvas.height, last = 0;
        for (let i=3; i<pixels.length; i+=4) if (pixels[i]>180) {
          const y = Math.floor((i-3)/(4*canvas.width));
          first = Math.min(first,y); last = Math.max(last,y);
        }
        return visible.length === 1 && pose.height >= Math.min(box.height * .95,box.width * .60) &&
          (last-first) * pose.height / canvas.height > Math.min(box.height * .75,box.width * .47) &&
          [...el.querySelectorAll('[data-reading], .pose, .end, .pause')].filter(node => node.getClientRects().length)
            .every(node => {
              const r = node.getBoundingClientRect();
              return r.top >= box.top-1 && r.bottom <= box.bottom+1 && r.left >= box.left-1 && r.right <= box.right+1;
            });
      });
      assert.equal(fit, true, 'trainer, movement and timer fit at ' + width + '×' + height);
      assert.equal(await art.locator('canvas').count(), 0);
    }
    const stillErrors = await art.evaluate(async el => {
      const {prepare, heldSeconds, paintStep} = await import(new URL('assets/players/stretch-snack.js',location.href).href);
      const step = prepare().steps[0];
      return [...el.querySelectorAll('.pose img')].map(img => {
        const canvas = document.createElement('canvas');
        const width = img.naturalWidth, height = img.naturalHeight;
        canvas.style.cssText = 'position:fixed;width:'+width+'px;height:'+height+'px';
        document.body.append(canvas);
        paintStep(canvas, step, heldSeconds, img.classList.contains('dark-pose'));
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        const reference = ctx.getImageData(0,0,width,height).data;
        ctx.clearRect(0,0,width,height);
        ctx.drawImage(img,0,0);
        const stored = ctx.getImageData(0,0,width,height).data;
        let error = 0, channels = 0;
        for (let offset=0; offset<stored.length; offset+=4) {
          if (!stored[offset+3] && !reference[offset+3]) continue;
          for (let c=0; c<4; c++) error += Math.abs(stored[offset+c] - reference[offset+c]);
          channels += 4;
        }
        canvas.remove();
        return error/channels;
      });
    });
    // The committed first poses use WebP. Compare only pixels occupied in either rendering.
    for (const error of stillErrors) assert.ok(error < 4, 'held pose differs from the trainer by ' + error);

    // Read the real session dialog for the same three steps, including its final action.
    const studio = await page.context().newPage();
    await studio.goto(new URL('stretch-snack/', page.url()).href);
    const expected = await studio.evaluate(async () => {
      const {prepare} = await import(new URL('../assets/players/stretch-snack.js', location.href).href);
      const {startSession} = await import(new URL('session.js',location.href).href);
      const plan = prepare();
      startSession(plan.steps.map(step => ({...step, transition: 0})), 'roomy-seat', () => {});
      const fields = ['player-name','player-progress','step-clock','total-clock','player-next','skip'];
      const readings = plan.steps.map(() => {
        const values = fields.map(id => document.getElementById(id).textContent);
        document.getElementById('skip').click();
        return values;
      });
      return readings;
    });
    await studio.close();
    await page.setViewportSize({width:1440,height:900});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await art.hover();
    await art.locator('canvas').waitFor();
    const proof = await art.evaluate(async el => {
      const {renderMovement} = await import(new URL('stretch-snack/demo.js',location.href).href);
      const {movementCamera} = await import(new URL('stretch-snack/camera.js',location.href).href);
      const {repetitionSeconds} = await import(new URL('stretch-snack/pose.js',location.href).href);
      const {prepare} = await import(new URL('assets/players/stretch-snack.js',location.href).href);
      const clock = el.querySelector('.progress').getAnimations()[0];
      clock.pause(); await clock.ready;
      const next = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const {steps} = prepare();
      const fields = ['name','counter','clock','remaining','next','skip'];
      const readings = [];
      for (const [i, step] of steps.entries()) {
        document.documentElement.dataset.theme = i === 1 ? 'dark' : 'light';
        document.dispatchEvent(new Event('themechange'));
        clock.currentTime = step.start * 1000 + 240;
        await next();
        const labels = fields.map(key => el.querySelector('[data-reading="'+key+'"]').textContent);
        // Each midpoint uses the app's normal close-up and angle for that movement.
        clock.currentTime = (step.start + step.seconds / 2) * 1000;
        await next();
        const live = el.querySelector('canvas');
        const ref = document.createElement('canvas');
        ref.style.cssText = 'position:fixed;width:'+live.clientWidth+'px;height:'+live.clientHeight+'px';
        document.body.append(ref);
        renderMovement(ref, step.move, repetitionSeconds / 2, {
          location:'roomy-seat', dark:document.documentElement.dataset.theme === 'dark', camera:movementCamera(step.move),
        });
        readings.push({same:ref.toDataURL() === live.toDataURL(),labels});
        ref.remove();
      }
      const duration = clock.effect.getTiming().duration;
      clock.play();
      return {readings,duration};
    });
    assert.equal(proof.duration, 15000);
    assert.deepEqual(proof.readings, expected.map(labels => ({same:true,labels})));

    const header = page.locator('#preview-motion');
    await header.focus(); await header.hover();
    await page.waitForFunction(() => !document.querySelector('[data-art="stretch-snack"][data-playing]'));
    const paused = await art.evaluate(async el => {
      const clock = el.querySelector('.progress').getAnimations()[0];
      await clock.ready;
      return Number(clock.currentTime);
    });
    await page.waitForTimeout(125);
    assert.equal(await art.evaluate(el => Number(el.querySelector('.progress').getAnimations()[0].currentTime)), paused);
    await art.locator('..').focus();
    await page.waitForFunction(t => Number(document.querySelector('[data-art="stretch-snack"] .progress').getAnimations()[0].currentTime) > t+60, paused);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(() => !document.querySelector('[data-art="stretch-snack"] canvas'));
    assert.equal(await art.locator('[data-reading="name"]').textContent(), expected[0][0]);
    assert.equal(await art.locator('[data-reading="clock"]').textContent(), '0:03');
    assert.equal(await art.locator('[data-reading="remaining"]').textContent(), '0:13 total left');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    assert.equal(await art.locator('.dark-pose:visible').count(), 1);
    assert.equal(await art.locator('.light-pose:visible').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test('the seated trainer returns through one neutral pose at all three step changes', async () => {
  const {page, close} = await openPage('#stretch-snack-title', {engine});
  try {
    for (const [width,height] of [[1440,900],[390,844],[320,568],[1920,1080]]) {
      await page.setViewportSize({width,height});
      const art = page.locator('[data-art="stretch-snack"]');
      await art.hover();
      await art.locator('canvas').waitFor();
      const seams = await art.evaluate(async el => {
        const canvas = el.querySelector('canvas');
        const clock = el.querySelector('.progress').getAnimations()[0];
        clock.pause(); await clock.ready;
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        async function sample(seconds) {
          clock.currentTime = 1000 * seconds;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const box = canvas.getBoundingClientRect();
          return {box:[box.x,box.y,box.width,box.height], pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};
        }
        function error(before, after) {
          let delta = 0, channels = 0;
          if (before.pixels.length === after.pixels.length) {
            for (let i = 0; i < after.pixels.length; i += 4) {
              const a = before.pixels[i+3] / 255, b = after.pixels[i+3] / 255;
              if (!a && !b) continue;
              for (let k = 0; k < 3; k++) delta += Math.abs(a*before.pixels[i+k] - b*after.pixels[i+k]);
              channels += 3;
            }
          }
          return channels ? delta/channels : Infinity;
        }
        const results = [];
        for (const end of [5,10,15]) {
          const before = await sample(end - 1/30), at = await sample(end), after = await sample(end + 1/30);
          results.push({end, before:before.box, at:at.box, after:after.box, error:Math.max(error(before,at), error(at,after))});
        }
        return results;
      });
      for (const {end,before,at,after,error} of seams) {
        assert.deepEqual(before, at, 'the camera box moved entering '+end+' s ('+width+' px)');
        assert.deepEqual(before, after, 'the camera box moved at '+end+' s ('+width+' px)');
        assert.ok(error < 2, 'the trainer jumped by '+error.toFixed(2)+' channel levels at '+end+' s ('+width+' px)');
      }
    }
  } finally { await close(); }
});
