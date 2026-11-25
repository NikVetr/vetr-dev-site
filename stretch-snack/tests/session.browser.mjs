import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../../scripts/landing-art/browser.mjs';
import { submit } from '../core/plan.js';

test('an away-first session budgets travel, carries it over a skip, and records the exercised location', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const {page, close, errors} = await openPage('stretch-snack/', {engine, width:390, height:844});
  try {
    const request = {
      location:'plane-seat', availableLocations:['plane-lavatory'], seconds:120,
      equipmentByLocation:{'plane-lavatory':['support']},
      steps:[
        {id:'standing-toe-lift', location:'plane-lavatory', seconds:80},
        {id:'standing-neck-turn', location:'plane-lavatory', seconds:20},
      ],
    };
    const plan = submit(request);
    assert.deepEqual(plan.transitionSeconds, [60,0]);
    await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});
    await page.clock.pauseAt(new Date('2030-01-01T00:00:02Z'));
    await page.evaluate(async plan => {
      const {moves} = await import(new URL('./core/catalog.js', document.baseURI).href);
      const {startSession} = await import(new URL('./session.js', document.baseURI).href);
      const steps = plan.steps.map((step,i) => ({
        ...step, move:moves.find(m=>m.id === step.id), transition:plan.transitionSeconds[i],
      }));
      startSession(steps,'plane-seat',(ids,origin,places) => {
        document.body.dataset.completed = JSON.stringify({ids,origin,places});
      });
    },plan);
    const press = id => page.locator('#'+id).evaluate(button=>button.click());
    assert.equal(await page.locator('#player-cue').innerText(), 'Go to the airplane lavatory.');
    assert.match(await page.locator('#travel-clock').innerText(), /^1:00/);
    await page.clock.fastForward(12000);
    await press('skip');
    assert.match(await page.locator('#travel-clock').innerText(), /^0:48/);
    assert.equal(await page.locator('#step-clock').innerText(),'1:08');
    await page.clock.fastForward(300);
    await press('arrived');
    assert.ok(await page.locator('#travel-controls').isHidden());
    assert.equal(await page.locator('#step-clock').innerText(),'0:20');
    assert.equal(await page.locator('#player-place').innerText(),'Airplane lavatory');
    assert.ok(await frameDifference(page,'#player-canvas','standing-neck-turn',0,{},
      {id:'standing-toe-lift',options:{}},.25,'plane-lavatory') < .005, 'confirming arrival preserves the in-flight camera');
    await page.clock.fastForward(1100);
    await press('finish');
    const actual = JSON.parse(await page.locator('body').getAttribute('data-completed'));
    assert.deepEqual(actual,{ids:['standing-neck-turn'],origin:'plane-seat',places:['plane-lavatory']});
    assert.deepEqual(errors,[]);
  } finally { await close(); }
});

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
    await page.getByRole('group', {name:'Movement visibility'}).getByRole('radio', {name:'Moderate', exact:true}).check();
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
    const back = page.getByLabel('Firm, high chair back or headrest', {exact: true});
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
async function frameDifference(page, selector, id, time, options, previous, progress = 1, location = 'plane-seat') {
  return page.evaluate(async ({selector,id,time,options,previous,progress,location}) => {
    const {moves} = await import(new URL('./core/catalog.js', document.baseURI).href);
    const {renderMovement} = await import(new URL('./demo.js', document.baseURI).href);
    const {movementCamera,blendCamera} = await import(new URL('./camera.js', document.baseURI).href);
    const move = moves.find(m => m.id === id);
    function cameraFor({id,options,previous,progress}) {
      const target = movementCamera(moves.find(m => m.id === id),options);
      return previous ? blendCamera(cameraFor(previous),target,progress) : target;
    }
    const camera = cameraFor({id,options,previous,progress});
    const scene = document.querySelector(selector), reference = document.createElement('canvas');
    reference.style.cssText = 'position:fixed;visibility:hidden;width:'+scene.clientWidth+'px;height:'+scene.clientHeight+'px';
    document.body.append(reference);
    try {
      renderMovement(reference, move, time, {camera,location,dark:document.documentElement.dataset.theme === 'dark'});
      const pixels = canvas => canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      const actual = pixels(scene), expected = pixels(reference);
      if (actual.length !== expected.length) return 1;
      let different = 0;
      for (let i=0; i<actual.length; i+=4) {
        if ([0,1,2,3].some(channel => Math.abs(actual[i+channel]-expected[i+channel]) > 12)) different++;
      }
      return different / (actual.length/4);
    } finally { reference.remove(); }
  }, {selector,id,time,options,previous,progress,location});
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

for (const override of [false,true]) test('the guided camera eases through skips, transfers and pauses with '+(override?'Play overriding reduced motion':'automatic playback'), async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const {page,close,errors} = await openPage('stretch-snack/',{engine,width:390,height:740});
  try {
    if (override) {
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.locator('#animate').click();
    }
    await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});
    await page.clock.pauseAt(new Date('2030-01-01T00:00:02Z'));
    const first = 'seated-neck-turn', second = 'seated-knee-extend', third = 'supine-knee-roll';
    await page.evaluate(async ids => {
      const {moves} = await import(new URL('./core/catalog.js', document.baseURI).href);
      const {startSession} = await import(new URL('./session.js', document.baseURI).href);
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
    await press('skip');
    const halfwayOpen = {id:first,options:{},previous:{id:first,options:fixed},progress:.5};
    assert.ok(await frameDifference(page,'#player-canvas',second,0,{},halfwayOpen,0) < .005, 'a paused skip retains its source view');
    await press('pause');
    await page.clock.fastForward(300);
    await press('pause');
    const partial = {id:second,options:{},previous:halfwayOpen,progress:.25};
    assert.ok(await frameDifference(page,'#player-canvas',second,.3,{},halfwayOpen,.25) < .005);
    await press('previous');
    assert.ok(await frameDifference(page,'#player-canvas',first,0,{},partial,0) < .005, 'backtracking retains the partially rendered pan');
    await press('skip');
    assert.ok(await frameDifference(page,'#player-canvas',second,0,{},partial,0) < .005, 'another tap keeps that camera');
    await press('pause');
    await page.clock.fastForward(1300);
    await press('pause');
    assert.ok(await frameDifference(page,'#player-canvas',second,1.3,{}) < 0.005);
    await press('pause');
    await page.clock.fastForward(4300); // .6 seconds into the floor transition
    assert.match(await page.locator('#player-cue').innerText(),/Change position/);
    assert.ok(await frameDifference(page,'#player-canvas',third,0,{}, {id:second,options:{}}, .5) < .005);
    await page.clock.fastForward(1000);
    assert.ok(await frameDifference(page,'#player-canvas',third,0,{}) < .005);
    await page.clock.fastForward(14000);
    await press('pause');
    assert.ok(await frameDifference(page,'#player-canvas',third,.6,{}) < .005, 'starting the movement holds the destination view');
    await press('previous');
    assert.ok(await frameDifference(page,'#player-canvas',second,0,{}, {id:third,options:{}}, 0) < .005);
    assert.deepEqual(errors,[]);
  } finally {await close();}
});

test('picking another movement on desktop glides the planner camera with explicit Play', async () => {
  const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
  const {page, close} = await openPage('stretch-snack/', {engine,width:1440,height:900});
  try {
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#animate').click();
    const rows = page.locator('#steps .step');
    const from = await rows.nth(0).getAttribute('data-move');
    const to = await rows.nth(1).getAttribute('data-move');
    await page.clock.install();
    await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+1000)));
    await rows.nth(1).locator('.step-picker').evaluate(button=>button.click());
    const difference = (time,progress) => frameDifference(page,'#preview-canvas',to,time,{}, {id:from,options:{}},progress);
    assert.ok(await difference(0,0) < .005);
    assert.ok(await difference(0,1) > .04, 'the destination has a visibly different view');
    for (let i=0;i<6;i++) await page.clock.fastForward(100);
    assert.ok(await difference(.6,.5) < .005, 'halfway through the camera transition');
    for (let i=0;i<6;i++) await page.clock.fastForward(100);
    assert.ok(await difference(1.2,1) < .005, 'the displayed view reaches its target');
  } finally {await close();}
});
