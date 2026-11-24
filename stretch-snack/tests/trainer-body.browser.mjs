import assert from 'node:assert/strict';
import test from 'node:test';
import {openPage} from '../../scripts/landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
test('each trainer body is visible in the planner and paused player and survives a reload', async () => {
  const app = await openPage('stretch-snack/', {engine, width:360, height:740, touch:true});
  const {page} = app;
  try {
    await page.emulateMedia({reducedMotion:'reduce'});
    const settings = page.getByRole('dialog', {name:'Trainer settings'});
    async function choose(container, shape) {
      await container.getByRole('button', {name:'Trainer settings'}).click();
      const radio = settings.getByRole('radio', {name:shape, exact:true});
      await radio.check();
      assert.ok(await radio.isChecked());
      assert.ok(await settings.evaluate(el=>el.scrollWidth <= el.clientWidth));
      await settings.getByRole('button', {name:'Done'}).click();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }
    async function image(id) {
      return page.locator(id).evaluate((canvas)=>/** @type {HTMLCanvasElement} */ (canvas).toDataURL());
    }
    const nav = page.locator('nav');
    const female = await image('#preview-canvas');
    await choose(nav,'Androgynous');
    const midpoint = await image('#preview-canvas');
    await choose(nav,'Male');
    const male = await image('#preview-canvas');
    assert.equal(new Set([female,midpoint,male]).size, 3, 'all three shapes change the same motion frame');
    await page.reload({waitUntil:'networkidle'});
    assert.ok((await image('#preview-canvas')) === male, 'the selected shape persists');
    await page.locator('#start').click();
    await page.locator('#pause').click();
    const player = page.locator('#player');
    const paused = await image('#player-canvas');
    await choose(player,'Female');
    assert.equal(await page.locator('#pause').innerText(),'Resume');
    assert.ok((await image('#player-canvas')) !== paused, 'the paused frame updates immediately');
    await choose(player,'Male');
    assert.ok((await image('#player-canvas')) === paused, 'returning to the same shape reproduces the same pose');
    assert.deepEqual(app.errors,[]);
  } finally {await app.close();}
});
