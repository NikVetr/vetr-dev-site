import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../../scripts/landing-art/browser.mjs';

test('an edited session fills the phone viewport, accepts input, and records feedback', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('stretch-snack/', { engine, width: 390, height: 844, touch: true });
  const { page } = app;
  try {
    const setup = page.locator('#toggle-settings');
    await setup.tap();
    await page.locator('#fit summary').tap();
    await page.locator('#heightCm').fill('175');
    await setup.tap();
    assert.equal(await setup.getAttribute('aria-expanded'), 'false', 'Done must accept the first tap after typing');
    await page.locator('.edit-step').first().click();
    await page.locator('#edit-reps').fill('3');
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.locator('#start').click();
    assert.match(await page.locator('#player-cue').textContent(), /3 repetitions/);
    await page.waitForTimeout(1100);
    // WebKit fails this click if the root is promoted above the active modal.
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await page.locator('#step-clock').textContent();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#step-clock').textContent(), paused);
    await page.getByRole('button', { name: 'End session' }).click();
    await page.locator('#feedback-items select').first().selectOption('uncomfortable');
    await page.locator('#delay').selectOption('60');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel check-in' }).click();
    assert.equal(await page.locator('#later').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('saving and adapting a routine on a phone keeps mobility limits and preserves the saved original', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('stretch-snack/', {engine, width: 390, height: 844, touch: true});
  const {page} = app;
  try {
    await page.locator('#toggle-settings').tap();
    await page.getByRole('button', {name: '1 min', exact: true}).tap();
    await page.locator('.edit-step').first().tap();
    await page.locator('#edit-reps').fill('3');
    await page.getByRole('button', {name: 'Apply', exact: true}).tap();
    await page.locator('#open-routines').tap();
    await page.locator('#routine-name').fill('Window seat');
    await page.locator('#save-routine').tap();
    assert.equal(await page.locator('#routine-choice').inputValue(), 'Window seat');
    assert.equal(await page.locator('#use-routine').isEnabled(), true);
    await page.reload({waitUntil: 'networkidle'});
    await page.locator('#toggle-settings').tap();
    await page.getByRole('button', {name: 'Custom', exact: true}).tap();
    await page.locator('#custom-time').fill('30');
    await page.locator('#fit summary').tap();
    await page.getByLabel('Avoid active leg movement').check();
    const current = await page.locator('#steps').innerText();
    await page.locator('#open-routines').tap();
    assert.match(await page.locator('#review-steps').innerText(), /Avoid active leg movement/);
    assert.match(await page.locator('#review-fit').innerText(), /Shorten by 30/);
    assert.equal(await page.locator('#use-routine').isEnabled(), false);
    await page.locator('[data-close="saved-routines"]').tap();
    assert.equal(await page.locator('#steps').innerText(), current);
    await page.locator('#open-routines').tap();
    const rows = page.locator('.review-step');
    await rows.first().locator('input').fill('15');
    await rows.last().locator('select').selectOption('seated-neck-tilt');
    await rows.last().locator('input').fill('15');
    await page.locator('#use-routine').tap();
    assert.equal(await page.locator('#saved-routines').isVisible(), false);
    assert.match(await page.locator('#steps').innerText(), /3 reps/);
    assert.equal(await page.locator('#steps .step').last().getAttribute('data-move'), 'seated-neck-tilt');
    assert.ok(await page.getByLabel('Avoid active leg movement').isChecked());
    await page.locator('#open-routines').tap();
    assert.equal(await rows.last().locator('input').inputValue(), '30');
    assert.match(await rows.last().innerText(), /Avoid active leg movement/);
    assert.equal(await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      return dialog.scrollWidth <= dialog.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    }), true);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('backtracking and live timing preserve transfer time, the paused state and the original routine', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const app = await openPage('stretch-snack/', {engine, width: 375, height: 740, touch: true});
  const {page} = app;
  try {
    // Use the public saved-routine flow to exercise a specific floor transfer.
    await page.evaluate(() => {
      localStorage.setItem('vetr:stretch-snack:saved-routines', JSON.stringify([{name: 'Floor break', steps: [
        {id: 'standing-shoulder-roll', seconds: 15}, {id: 'supine-pelvic-tilt', seconds: 20},
      ]}]));
    });
    await page.locator('#toggle-settings').tap();
    await page.locator('#location').selectOption('open-area');
    await page.getByRole('radio', {name: 'Moderate', exact: true}).check();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('radio', {name: 'Any', exact: true}).isChecked(), true);
    await page.locator('#fit summary').tap();
    await page.locator('#allow-floor').check();
    await page.locator('#open-routines').tap();
    await page.locator('#use-routine').tap();
    await page.locator('#start').tap();
    await page.locator('#pause').tap();
    assert.equal(await page.locator('#previous').isDisabled(), true);
    await page.locator('#skip').tap();
    assert.equal(await page.locator('#pause').innerText(), 'Resume');
    assert.match(await page.locator('#player-cue').innerText(), /Change position/);
    assert.equal(await page.locator('#shorten').isDisabled(), true, 'keep the transfer plus five seconds of movement');
    await page.locator('#previous').tap();
    assert.match(await page.locator('#player-cue').innerText(), /Change position/);
    assert.equal(await page.locator('#step-clock').innerText(), '0:30');
    assert.equal(await page.locator('#total-clock').innerText(), '0:50 total left');
    await page.locator('#extend').tap();
    assert.equal(await page.locator('#step-clock').innerText(), '0:40');
    assert.equal(await page.locator('#total-clock').innerText(), '1:00 total left');
    await page.locator('#finish').tap();
    assert.equal(await page.locator('#feedback-items select').count(), 0);
    await page.locator('#feedback [data-close="feedback"]').last().tap();
    await page.locator('#start').tap();
    await page.locator('#pause').tap();
    assert.equal(await page.locator('#step-clock').innerText(), '0:15');
    assert.equal(await page.locator('#total-clock').innerText(), '0:35 total left');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('a backrest confirmation belongs to the current seat when a profile is saved or restored', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const {page, close, errors} = await openPage('stretch-snack/', {engine});
  try {
    await page.locator('#fit summary').click();
    const ball = page.getByLabel('Massage ball', {exact: true});
    const back = page.getByLabel('Chair with a firm back', {exact: true});
    await ball.check();
    await back.check();
    await page.locator('#save-profile').click();
    await page.locator('#load-profile').click();
    assert.ok(await back.isChecked());
    await page.locator('#location').selectOption('train-seat');
    await page.locator('#load-profile').click();
    assert.ok(await ball.isChecked());
    assert.equal(await back.isChecked(), false);
    await page.reload();
    assert.ok(await ball.isChecked());
    assert.equal(await back.isChecked(), false);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

// Render a reference frame with the public renderer and compare the pixels of
// the actual planner or session canvas, including on the browser's top layer.
async function frameDifference(page, selector, id, time, options, previous, progress = 1) {
  return page.evaluate(async ({selector,id,time,options,previous,progress}) => {
    const {moves} = await import('./core/catalog.js');
    const {renderMovement} = await import('./demo.js');
    const {movementCamera,blendCamera} = await import('./camera.js');
    const move = moves.find(m => m.id === id);
    const target = movementCamera(move,options);
    const camera = previous ? blendCamera(movementCamera(moves.find(m => m.id === previous.id),previous.options),target,progress) : target;
    const scene = document.querySelector(selector), reference = document.createElement('canvas');
    reference.style.cssText = 'position:fixed;visibility:hidden;width:'+scene.clientWidth+'px;height:'+scene.clientHeight+'px';
    document.body.append(reference);
    try {
      renderMovement(reference, move, time, {camera,location:'plane-seat',dark:document.documentElement.dataset.theme === 'dark'});
      const pixels = canvas => canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      const actual = pixels(scene), expected = pixels(reference);
      if (actual.length !== expected.length) return 1;
      let different = 0;
      for (let i=0; i<actual.length; i+=4) {
        if ([0,1,2,3].some(channel => Math.abs(actual[i+channel]-expected[i+channel]) > 12)) different++;
      }
      return different / (actual.length/4);
    } finally { reference.remove(); }
  }, {selector,id,time,options,previous,progress});
}

test('camera controls apply in the planner and session, retain independent settings and honor reduced motion', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const {page,close,errors} = await openPage('stretch-snack/',{engine,width:375,height:740,touch:true});
  try {
    await page.emulateMedia({reducedMotion:'reduce'});
    const previewId = await page.locator('#steps .selected').getAttribute('data-move');
    const settings = page.locator('#camera-settings');
    await page.locator('nav [data-camera-settings]').tap();
    assert.ok(await page.locator('#camera-hint').isVisible());
    await page.locator('#camera-rotation').uncheck();
    await settings.getByRole('button',{name:'Done'}).tap();
    assert.ok(await frameDifference(page,'#preview-canvas',previewId,2,{zoom:true,rotation:false}) < 0.002);
    await page.reload({waitUntil:'networkidle'});
    await page.locator('nav [data-camera-settings]').tap();
    assert.equal(await page.locator('#camera-rotation').isChecked(),false);
    assert.equal(await page.locator('#camera-zoom').isChecked(),true);
    await page.locator('#camera-fixed').check();
    assert.ok(await page.locator('#camera-zoom').isDisabled());
    await settings.getByRole('button',{name:'Done'}).tap();
    await page.locator('#start').tap();
    await page.locator('#player [data-camera-settings]').tap();
    assert.equal(await page.locator('#pause').innerText(),'Resume');
    await page.locator('#camera-guided').check();
    assert.equal(await page.locator('#camera-rotation').isChecked(),false);
    await settings.getByRole('button',{name:'Done'}).tap();
    // HTMLDialogElement dispatches close on the next browser update.
    await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
    await page.locator('#pause').tap();
    assert.ok(await frameDifference(page,'#player-canvas',previewId,2,{zoom:true,rotation:false}) < 0.002);
    await page.locator('#player [data-camera-settings]').tap();
    await page.locator('#camera-zoom').uncheck();
    await page.locator('#camera-rotation').check();
    await settings.getByRole('button',{name:'Done'}).tap();
    assert.equal(await page.locator('#pause').innerText(),'Resume');
    assert.ok(await frameDifference(page,'#player-canvas',previewId,2,{zoom:false,rotation:true}) < 0.002);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    assert.deepEqual(errors,[]);
  } finally {await close();}
});

test('the live camera freezes mid-blend, eases directly between seated moves and opens wide for a floor transfer', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const {page,close,errors} = await openPage('stretch-snack/',{engine,width:390,height:740});
  try {
    await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});
    await page.clock.pauseAt(new Date('2030-01-01T00:00:02Z'));
    const first = 'seated-neck-turn', second = 'seated-knee-extend', third = 'supine-knee-roll';
    await page.evaluate(async ids => {
      const {moves} = await import('./core/catalog.js');
      const {startSession} = await import('./session.js');
      const steps = ids.map((id,i) => ({id,move:moves.find(m=>m.id === id),seconds:i===2 ? 20 : 5,transition:i===2 ? 15 : 0}));
      startSession(steps,'plane-seat',()=>{});
    },[first,second,third]);
    const press = id => page.locator('#'+id).evaluate(button => button.click());
    const fixed = {zoom:false,rotation:false};
    await page.clock.fastForward(600);
    await press('pause');
    assert.ok(await frameDifference(page,'#player-canvas',first,0.6,{}, {id:first,options:fixed},0.5) < 0.005);
    const frozen = await page.locator('#player-canvas').evaluate(c=>c.toDataURL());
    await page.clock.fastForward(1700);
    assert.equal(await page.locator('#player-canvas').evaluate(c=>c.toDataURL()),frozen);
    await press('pause');
    await page.clock.fastForward(1000);
    await press('skip');
    await press('pause');
    assert.ok(await frameDifference(page,'#player-canvas',second,0,{}, {id:first,options:{}},0) < 0.005);
    await press('pause');
    await page.clock.fastForward(1300);
    await press('pause');
    assert.ok(await frameDifference(page,'#player-canvas',second,1.3,{}) < 0.005);
    await press('pause');
    await page.clock.fastForward(4000);
    assert.match(await page.locator('#player-cue').innerText(),/Change position/);
    assert.ok(await frameDifference(page,'#player-canvas',third,0,fixed) < 0.005);
    await press('previous');
    assert.ok(await frameDifference(page,'#player-canvas',second,0,fixed) < 0.005);
    assert.deepEqual(errors,[]);
  } finally {await close();}
});
