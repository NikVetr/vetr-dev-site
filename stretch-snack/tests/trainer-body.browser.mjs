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
    async function choose(container, shape, compareBuilds = false) {
      await container.getByRole('button', {name:'Trainer settings'}).click();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      if (compareBuilds) {
        const portraits = new Set();
        for (const build of ['Female','Androgynous','Male']) {
          await settings.getByRole('radio', {name:build, exact:true}).check();
          portraits.add(await image('#trainer-fit'));
        }
        assert.equal(portraits.size, 3, 'all three builds are visible before closing settings');
      }
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
    await choose(nav,'Androgynous',true);
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
    await choose(player,'Female',true);
    assert.equal(await page.locator('#pause').innerText(),'Resume');
    assert.ok((await image('#player-canvas')) !== paused, 'the paused frame updates immediately');
    await choose(player,'Male');
    assert.ok((await image('#player-canvas')) === paused, 'returning to the same shape reproduces the same pose');
    assert.deepEqual(app.errors,[]);
  } finally {await app.close();}
});

test('changing the trainer in the planner repaints the open directory card', async () => {
  const app = await openPage('#stretch-snack-title', {engine});
  const {page} = app;
  try {
    const art = page.locator('[data-art="stretch-snack"]');
    await art.hover();
    const canvas = art.locator('canvas');
    await canvas.waitFor();
    // Hold the same frame so only changing the trainer can change the pixels.
    const header = page.locator('#preview-motion');
    await header.hover();
    await page.waitForFunction(()=>!document.querySelector('[data-art="stretch-snack"][data-playing]'));
    await art.evaluate(async el=>{
      await el.querySelector('.progress').getAnimations()[0].ready;
      document.dispatchEvent(new Event('themechange'));
    });
    const original = await canvas.evaluate(c=>c.toDataURL());
    const editor = await page.context().newPage();
    await editor.goto(new URL('stretch-snack/',page.url()).href);
    await editor.getByRole('button',{name:'Trainer settings'}).click();
    await editor.getByRole('radio',{name:'Male',exact:true}).check();
    const matchesFrame = ({first,match})=>{
      const card = document.querySelector('[data-art="stretch-snack"] canvas');
      return card instanceof HTMLCanvasElement && (card.toDataURL() === first) === match;
    };
    await page.waitForFunction(matchesFrame,{first:original,match:false});
    await editor.getByRole('radio',{name:'Female',exact:true}).check();
    await page.waitForFunction(matchesFrame,{first:original,match:true});
    assert.deepEqual(app.errors,[]);
  } finally {await app.close();}
});
