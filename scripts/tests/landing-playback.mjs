import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openPage } from '../landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE || 'chromium');
/** @param {any} art @returns {Promise<number[]>} */
const times = (art) => art.evaluate((/** @type {HTMLElement} */ el) => el.getAnimations({ subtree: true }).map(a => Number(a.currentTime)));
/** @param {any} art */
const waitPaused = (art) => art.evaluate(async (/** @type {HTMLElement} */ el) => {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const animations = el.getAnimations({ subtree: true });
  return animations.length > 0 && animations.every(a => a.playState === 'paused');
});

test('CSS previews keep their frame on exit and resume their original clocks', async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    // Both continuously interpolated and stacked-frame animations are covered.
    for (const name of ['b64', 'raster-to-vector', 'text-in-image', 'matrix-rain', 'media-ratings', 'message-collage', 'photomosaic']) {
      const art = page.locator(`[data-art="${name}"]`);
      await art.scrollIntoViewIfNeeded(); await art.locator(':scope > svg').waitFor();
      assert.equal((await times(art)).length, 0, `${name}: starts still`);
      await art.hover(); await page.waitForTimeout(350);
      const started = await times(art); assert.ok(started.length, `${name}: has CSS animations`);
      await page.mouse.move(0, 0); assert.ok(await waitPaused(art), `${name}: pauses`);
      const paused = await times(art);
      const picture = await art.screenshot();
      await page.waitForTimeout(200);
      assert.deepEqual(await times(art), paused, `${name}: clock stays frozen`);
      assert.deepEqual(await art.screenshot(), picture, `${name}: visible frame stays frozen`);
      await art.hover(); await page.waitForTimeout(140);
      const resumed = await times(art);
      assert.ok(resumed.every((time, i) => time > paused[i] + 60), `${name}: resumes instead of restarting`);
      await page.mouse.move(0, 0);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('canvas previews retain their image on exit, resize and resume', async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    for (const name of ['intuitions', 'seating']) {
      const art = page.locator(`[data-art="${name}"]`);
      await art.hover(); const canvas = art.locator('canvas'); await canvas.waitFor();
      await page.waitForTimeout(350); await page.mouse.move(0, 0);
      await page.waitForTimeout(50);
      const picture = await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => { el.dataset.retained = 'yes'; return el.toDataURL(); });
      const paused = await times(art);
      await page.waitForTimeout(200);
      assert.ok(await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => el.toDataURL()) === picture, `${name}: canvas does not reset or keep running`);
      assert.deepEqual(await times(art), paused, `${name}: companion CSS stays paused`);
      await art.hover(); await page.waitForTimeout(160);
      assert.equal(await canvas.getAttribute('data-retained'), 'yes', `${name}: reuses the canvas`);
      assert.ok((await times(art))[0] > paused[0] + 50, `${name}: canvas clock resumes without restarting`);
      // A workflow may begin with an authored hold; wait for its next moving scene.
      await page.waitForFunction((/** @type {{name:string,picture:string}} */ {name,picture}) =>
        /** @type {HTMLCanvasElement} */ (document.querySelector(`[data-art="${name}"] canvas`)).toDataURL() !== picture,
      {name,picture}, {timeout:4000});
      await page.mouse.move(0, 0);
      await page.setViewportSize({ width: 1280, height: 840 });
      await page.waitForTimeout(80);
      assert.ok(await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => el.width === Math.round((el.parentElement?.clientWidth ?? 0) * devicePixelRatio)), `${name}: paused canvas follows resize`);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('desktop keyboard blur pauses; reduced motion resets; touch entry does not start previews', async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    const art = page.locator('[data-art="b64"]');
    const card = page.locator('.project-card').filter({ has: art });
    for (let i = 0; i < 30 && !(await card.evaluate((/** @type {HTMLElement} */ el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    assert.ok(await card.evaluate((/** @type {HTMLElement} */ el) => el === document.activeElement), 'Tab reaches the card');
    await art.locator('svg').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-art="b64"]')?.hasAttribute('data-playing'));
    await page.waitForTimeout(180);
    assert.equal(await art.getAttribute('data-playing'), '');
    await page.keyboard.press('Tab'); assert.ok(await waitPaused(art));
    const paused = await times(art);
    await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(120);
    assert.ok((await times(art))[0] > paused[0] + 50);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('[data-started]'));
    assert.equal(await art.getAttribute('data-started'), null);
    assert.equal((await times(art)).length, 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await card.dispatchEvent('pointerenter', { pointerType: 'touch' });
    assert.equal(await art.getAttribute('data-playing'), null);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});


test('mobile centre playback, sticky controls and saved choice override reduced motion', async () => {
  const browser = await openPage('', { engine, width: 390, height: 844, touch: true });
  const { page, errors } = browser;
  try {
    const button = page.locator('#preview-motion');
    const playing = page.locator('[data-playing]');
    await page.waitForFunction(() => document.querySelectorAll('[data-playing]').length === 1);
    const centre = async (/** @type {string} */ name) => {
      await page.locator(`[data-art="${name}"]`).evaluate((/** @type {HTMLElement} */ el) => el.closest('.project-card')?.scrollIntoView({block: 'center'}));
      await page.waitForFunction((/** @type {string} */ n) => document.querySelector(`[data-art="${n}"]`)?.hasAttribute('data-playing'), name);
      assert.equal(await playing.count(), 1, 'only the central panel plays');
    };
    await centre('signature');
    const art = page.locator('[data-art="signature"]');
    await page.waitForTimeout(180);
    const before = await times(art);
    assert.equal(Math.round((await page.locator('.mobile-bar').boundingBox()).y), 0, 'bar stays at viewport top');
    await button.tap(); assert.ok(await waitPaused(art));
    assert.equal(await button.getAttribute('aria-checked'), 'false');
    const paused = await times(art);
    await page.waitForTimeout(120); assert.deepEqual(await times(art), paused);
    await button.tap(); await page.waitForTimeout(120);
    assert.ok((await times(art))[0] > before[0], 'toggle resumes instead of resetting');
    await centre('raster-to-vector'); assert.ok(await waitPaused(art));
    const left = await times(art); await page.waitForTimeout(120); assert.deepEqual(await times(art), left);
    await centre('signature'); await page.waitForTimeout(120); assert.ok((await times(art))[0] > left[0]);
    await button.tap(); await page.reload();
    assert.equal(await button.getAttribute('aria-checked'), 'false', 'pause persists through reload');
    assert.equal(await playing.count(), 0);
    await button.tap(); await page.waitForFunction(() => document.querySelector('[data-playing]'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await centre('signature');
    assert.ok(await button.isEnabled()); assert.equal(await button.getAttribute('aria-checked'), 'true');
    const optedIn = await times(art);
    await page.waitForTimeout(120);
    assert.ok(optedIn.length && (await times(art))[0] > optedIn[0], 'explicit opt-in keeps CSS playing under reduced motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelectorAll('[data-playing]').length === 1);
    await page.setViewportSize({width: 844, height: 390});
    await page.waitForTimeout(150);
    assert.equal(await playing.count(), 1, 'touch landscape keeps a single active panel');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('reduced motion defaults off but permits persisted opt-in for CSS and canvas previews', async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const button = page.getByRole('switch', { name: 'Animations', exact: true });
    const art = page.locator('[data-art="b64"]');
    await art.hover(); await art.locator('svg').waitFor();
    assert.ok(await button.isEnabled(), 'system preference must not lock the switch');
    assert.equal(await button.getAttribute('aria-checked'), 'false');
    assert.equal(await art.getAttribute('data-started'), null);
    assert.equal((await times(art)).length, 0, 'starts with authored still');
    await button.click(); await art.hover();
    await page.waitForFunction(() => document.querySelector('[data-art="b64"]')?.getAnimations({ subtree: true }).length);
    const before = await times(art);
    await page.waitForTimeout(140);
    assert.ok((await times(art))[0] > before[0] + 50, 'CSS clocks actually run under reduced motion');
    await page.reload(); await art.hover();
    await page.waitForFunction(() => document.querySelector('[data-art="b64"]')?.hasAttribute('data-playing'));
    assert.equal(await button.getAttribute('aria-checked'), 'true', 'opt-in persists on reload');
    assert.ok((await times(art)).length, 'saved opt-in enables CSS too');
    const canvasArt = page.locator('[data-art="intuitions"]');
    await canvasArt.hover();
    const canvas = canvasArt.locator('canvas'); await canvas.waitFor();
    const picture = await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => el.toDataURL());
    await page.waitForFunction((/** @type {string} */ snapshot) =>
      /** @type {HTMLCanvasElement} */ (document.querySelector('[data-art="intuitions"] canvas')).toDataURL() !== snapshot,
    picture, { timeout: 4000 });
    await button.click(); await canvasArt.hover();
    assert.equal(await button.getAttribute('aria-checked'), 'false');
    assert.ok(await waitPaused(canvasArt), 'opt-out pauses rather than destroying the current frame');
    const paused = await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => el.toDataURL());
    await page.waitForTimeout(150);
    assert.equal(await canvas.evaluate((/** @type {HTMLCanvasElement} */ el) => el.toDataURL()), paused);
    await page.reload(); await art.hover(); await art.locator('svg').waitFor();
    assert.equal(await button.getAttribute('aria-checked'), 'false', 'opt-out persists on reload');
    assert.equal(await art.getAttribute('data-started'), null);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(100);
    assert.equal(await art.getAttribute('data-started'), null, 'explicit off also overrides the system default');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('autoCHAIR turns at agenda checkpoints, pauses, resumes and releases for reduced motion', async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    const art = page.locator('[data-art="agendamatic"]');
    await art.hover();
    const sprite = art.locator('.autochair-frames');
    await sprite.waitFor({state:'attached'});
    assert.equal(await art.locator('.agenda-scene').evaluate((/** @type {any} */ el) => getComputedStyle(el).opacity), '1');
    const positions = await art.evaluate((/** @type {any} */ el) => ({agenda:el.querySelector('.agenda-scene').getBoundingClientRect().right,
      chair:el.querySelector('.logo-turn').getScreenCTM().e}));
    assert.ok(positions.chair > positions.agenda, 'chair sits beside the agenda');
    const logo = await art.evaluate((/** @type {any} */ el) => {
      const still = el.querySelector('.logo-still'), turn = el.querySelector('.logo-turn');
      const matrix = turn.getScreenCTM();
      return {
        checkpoint: Number(turn.getAttribute('data-checkpoints').split(',')[0]) * 1000,
        clip: { x: matrix.e, y: matrix.f, width: matrix.a * 128, height: matrix.d * 108 },
        sameViewport: ['x', 'y', 'width', 'height', 'viewBox'].every(k => still.getAttribute(k) === turn.getAttribute(k)),
        sameSource: new URL(still.querySelector('image').getAttribute('href'), document.baseURI).href === turn.querySelector('image').getAttribute('href'),
      };
    });
    assert.ok(logo.sameViewport && logo.sameSource, 'rest and turn share the same source and framing');
    // Freeze the agenda clock without overriding CSS's ownership of play/pause.
    const seek = async (/** @type {number} */ time) => art.evaluate((/** @type {any} */ el, /** @type {number} */ time) => {
      for (const animation of el.getAnimations({subtree:true})) {
        animation.playbackRate = 0;
        animation.currentTime = time;
      }
    }, time);
    await seek(logo.checkpoint - 10);
    await page.waitForFunction(() => !document.querySelector('.logo-turn')?.hasAttribute('data-ready'));
    const still = await page.screenshot({clip:logo.clip});
    await seek(logo.checkpoint + 1);
    await page.waitForFunction(() => document.querySelector('.logo-turn')?.hasAttribute('data-ready') &&
      document.querySelector('.autochair-frames')?.getAttribute('data-frame') === '0');
    assert.deepEqual(await page.screenshot({clip:logo.clip}), still, 'the first turn frame is pixel-identical to rest');
    await art.evaluate((/** @type {any} */ el) => {
      for (const animation of el.getAnimations({subtree:true})) {
        animation.currentTime = 0;
        animation.playbackRate = 1;
      }
    });
    await page.waitForFunction(() => {
      const sprite = document.querySelector('.autochair-frames');
      const x = Number(sprite?.getAttribute('data-frame'));
      return sprite?.parentElement?.hasAttribute('data-ready') && x > 0 && x < 12;
    });
    await page.mouse.move(0, 0);
    const frame = await sprite.getAttribute('data-frame');
    await page.waitForTimeout(150);
    assert.equal(await sprite.getAttribute('data-frame'), frame, 'paused frame is retained');
    await art.hover();
    // Snapshot the clock in the same browser callback that observes the resumed
    // frame; a later protocol round trip may outlast this short turn.
    const resumed = await page.waitForFunction((/** @type {string} */ x) => {
      const sprite = document.querySelector('.autochair-frames');
      const host = sprite?.parentElement;
      if (!sprite || !host?.hasAttribute('data-ready') || sprite.getAttribute('data-frame') === x) return false;
      const clock = document.querySelector('[data-art="agendamatic"] .marker')?.getAnimations()[0];
      if (!clock?.effect) throw new Error('autoCHAIR marker has no animation clock');
      const time = Number(clock.currentTime)/1000, period = Number(clock.effect.getTiming().duration)/1000;
      const checkpoints = (host.getAttribute('data-checkpoints') ?? '').split(',').map(Number);
      const latest = checkpoints.filter(t => t <= time % period).at(-1);
      return { phase: time % period - (latest ?? Infinity) };
    }, frame);
    const { phase } = await resumed.jsonValue();
    assert.ok(phase >= 0 && phase < .8, 'turn occurs immediately after an agenda checkpoint');
    await page.waitForFunction(() => !document.querySelector('.logo-turn')?.hasAttribute('data-ready'));
    const resting = await sprite.getAttribute('data-frame');
    await page.waitForTimeout(50);
    assert.equal(await sprite.getAttribute('data-frame'), resting, 'chair stops between checkpoints');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('.autochair-frames'));
    assert.equal(await sprite.count(), 0);
    assert.equal(await art.getAttribute('data-started'), null);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('desktop sticky switches are keyboard operable and retain theme and motion choices', async () => {
  const browser = await openPage('', {engine});
  const {page,errors}=browser;
  try {
    const motion=page.getByRole('switch',{name:'Animations',exact:true});
    const theme=page.getByRole('switch',{name:'Dark mode',exact:true});
    assert.equal(await motion.getAttribute('aria-checked'),'true');
    assert.equal(await theme.getAttribute('aria-checked'),'false');
    await page.evaluate(()=>scrollTo(0,1000));
    assert.equal(Math.round((await page.locator('.mobile-bar').boundingBox()).y),0);
    await theme.focus();await page.keyboard.press('Space');
    assert.equal(await theme.getAttribute('aria-checked'),'true');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await motion.focus();await page.keyboard.press('Enter');
    assert.equal(await motion.getAttribute('aria-checked'),'false');
    await page.reload();
    assert.equal(await theme.getAttribute('aria-checked'),'true');
    assert.equal(await motion.getAttribute('aria-checked'),'false');
    for(const width of [320,390,844,1440]){
      await page.setViewportSize({width,height:900});
      const bounds=await page.locator('.mobile-bar').evaluate((/** @type {HTMLElement} */ el)=>[...el.querySelectorAll('a,button')].map(e=>e.getBoundingClientRect().toJSON()));
      assert.ok(bounds.every((/** @type {DOMRect} */ r)=>r.x>=0&&r.right<=width&&r.height>=32),`${width}: controls fit`);
      assert.ok(bounds[1].height>=44&&bounds[2].height>=44,'switches have touch-sized targets');
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('Media Ratings fills a wide card and interpolates its forecasts across the loop seam', async () => {
  const browser = await openPage('#media-ratings-title', { engine, width: 1440, height: 900 });
  const { page } = browser;
  try {
    const art = page.locator('[data-art="media-ratings"]');
    await art.locator('.bin-9').waitFor();
    await art.hover();
    await page.waitForFunction(() => document.querySelector('[data-art="media-ratings"]')?.hasAttribute('data-playing'));
    const heightAt = (/** @type {number} */ time) => art.evaluate((el, t) => {
      for (const a of el.getAnimations({ subtree: true })) { a.pause(); a.currentTime = t; }
      return el.querySelector('.bin-9').getBoundingClientRect().height;
    }, time);
    const first = await heightAt(0), middle = await heightAt(1000), next = await heightAt(1500);
    assert.ok(middle > Math.min(first, next) + 1 && middle < Math.max(first, next) - 1);
    assert.ok(Math.abs(first - await heightAt(12000)) < 0.1);
    const picture = await art.boundingBox();
    const title = await page.locator('#media-ratings-title').boundingBox();
    assert.ok(picture.width > 500 && title.x >= picture.x + picture.width);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const film = await art.locator('.film').boundingBox(), stars = await art.locator('.stars').boundingBox();
      assert.ok(stars.x > film.x + film.width, 'the stars clear the film title on a phone');
    }
  } finally { await browser.close(); }
});
