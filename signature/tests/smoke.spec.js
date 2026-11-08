// Browser smoke tests: npx playwright test (from signature/).
import { expect, test } from '@playwright/test';

/** Draws a wave across the pad with the mouse, in small steps. @param {import('@playwright/test').Page} page */
async function drawWithMouse(page) {
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#pad').boundingBox());
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    await page.mouse.move(box.x + box.width * (0.15 + 0.7 * t), box.y + box.height * (0.5 - 0.25 * Math.sin(t * 9)));
  }
  await page.mouse.up();
}

test('opens on the example, exposes the API, and exports a transparent PNG at its resolution', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  await expect(page.locator('#pad-info')).toHaveText('8 strokes, 358 points, timed');
  await expect(page.locator('#status')).toHaveText('8 strokes, width from signing speed');
  const api = await page.evaluate(async () => {
    const S = window.Signature;
    const svg = S.exportSvgText();
    const own = S.submit(S.getRequest()).svg === svg;
    let error = null;
    try { S.load({ csv: 'x,y\n0,0\n1,1', smooth: { wavelet: { keepEnergy: 3 } }, colour: 1 }); } catch (e) { error = { name: e.name, paths: e.issues.map((i) => i.path).sort() }; }
    const png = new Uint8Array(await (await S.exportPngBlob({ height: 1, unit: 'in', dpi: 200 })).arrayBuffer());
    const chunks = [];
    for (let at = 8; at < png.length;) {
      const len = new DataView(png.buffer).getUint32(at);
      chunks.push(String.fromCharCode(...png.subarray(at + 4, at + 8)));
      if (chunks.at(-1) === 'pHYs') chunks.push(new DataView(png.buffer).getUint32(at + 8));
      at += 12 + len;
    }
    const bmp = await createImageBitmap(new Blob([png]));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const corner = ctx.getImageData(0, 0, 1, 1).data[3];
    return { svgStart: svg.slice(0, 40), own, error, chunks: chunks.filter((x) => x === 'pHYs' || typeof x === 'number'), height: bmp.height, corner };
  });
  expect(api.svgStart).toBe('<svg xmlns="http://www.w3.org/2000/svg" ');
  expect(api.own).toBe(true);
  expect(api.error).toEqual({ name: 'SignatureError', paths: ['colour', 'smooth.wavelet.keepEnergy'] });
  expect(api.chunks).toEqual(['pHYs', Math.round(200 / 0.0254)]);
  expect(api.height).toBe(200);
  expect(api.corner).toBe(0);
  expect(errors).toEqual([]);
});

test('draws with the mouse, corrects as it goes, undoes, and brushes a region', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  await page.click('#clear');
  await expect(page.locator('#result-empty')).toBeVisible();
  await drawWithMouse(page);
  await expect(page.locator('#pad-info')).toContainText('1 stroke,');
  await expect(page.locator('#pad-info')).toContainText('timed');
  await page.waitForFunction(() => window.Signature.getResult()?.strokes.length === 1);
  expect(await page.evaluate(() => window.Signature.getResult().widthSource)).toBe('speed');
  // a setting changes the correction
  const before = await page.evaluate(() => window.Signature.exportSvgText());
  await page.locator('[data-path="smooth.fourier.strength"]').fill('6');
  await page.waitForFunction((b) => window.Signature.exportSvgText() !== b, before);
  // brush a stretch of the stroke to smooth it more
  await page.check('input[name="brush"][value="more"]', { force: true });
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#result').boundingBox());
  const stroke = await page.evaluate(() => {
    const r = window.Signature.getResult();
    const c = document.getElementById('result');
    const rect = c.getBoundingClientRect();
    const [bx, by, bw, bh] = r.viewBox;
    const s = Math.min(rect.width * 0.94 / bw, rect.height * 0.94 / bh);
    const pt = r.strokes[0].points[Math.floor(r.strokes[0].points.length / 2)];
    return { x: rect.width / 2 + s * (pt[0] - bx - bw / 2), y: rect.height / 2 + s * (pt[1] - by - bh / 2) };
  });
  await page.mouse.move(box.x + stroke.x - 10, box.y + stroke.y);
  await page.mouse.down();
  await page.mouse.move(box.x + stroke.x + 10, box.y + stroke.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#brush-info')).toContainText('＋ 1 region smoothed more');
  expect(await page.evaluate(() => window.Signature.getRequest().smooth.local.length)).toBeGreaterThan(0);
  await page.click('#undo');
  await expect(page.locator('#brush-info')).toHaveText('No brushed regions.');
  await expect(page.locator('#result-empty')).toBeHidden();
  await page.click('#undo'); // the smoothing setting
  await page.click('#undo'); // the drawn stroke
  await expect(page.locator('#result-empty')).toBeVisible();
});

test('Undo after Clear or Import shows the signature as it was', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => /** @type {any} */ (window).Signature?.getResult());
  const pad = () => page.evaluate(() => /** @type {HTMLCanvasElement} */ (document.getElementById('pad')).toDataURL());
  const before = await pad();
  await page.click('#clear');
  await page.click('#undo');
  expect(await pad()).toBe(before);
  await page.setInputFiles('#import', new URL('../examples/juno-marsh.csv', import.meta.url).pathname);
  await expect.poll(pad).not.toBe(before);
  await page.click('#undo');
  expect(await pad()).toBe(before);
});

test('Undo restores local corrections after Clear, import and example replacement', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => /** @type {any} */ (window).Signature?.getResult());
  const local = [{ stroke: 0, from: 0.1, to: 0.8, strength: 3 }];
  const before = await page.evaluate((local) => {
    const request = /** @type {any} */ (window).Signature.getRequest();
    request.smooth.local = local;
    /** @type {any} */ (window).Signature.load(request);
    return /** @type {any} */ (window).Signature.exportSvgText();
  }, local);
  const regions = () => page.evaluate(() => /** @type {any} */ (window).Signature.getRequest().smooth.local);
  const restored = async () => {
    await expect.poll(regions).toEqual(local);
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).Signature.exportSvgText())).toBe(before);
    await expect(page.locator('#brush-info')).toHaveText('＋ 1 region smoothed more');
  };

  await page.click('#clear');
  await expect.poll(regions).toEqual([]);
  await page.click('#undo');
  await restored();

  await page.setInputFiles('#import', new URL('../examples/juno-marsh.csv', import.meta.url).pathname);
  await expect.poll(regions).toEqual([]);
  await page.click('#undo');
  await restored();

  await page.click('#example');
  await expect.poll(regions).toEqual([]);
  await page.click('#undo');
  await restored();

  // A JSON request can carry different local corrections; Undo must retain the previous set.
  await page.evaluate(() => {
    const request = /** @type {any} */ (window).Signature.getRequest();
    request.smooth.local = [{ stroke: 1, from: 0, to: 1, strength: 0.5 }];
    /** @type {any} */ (window).Signature.load(request);
  });
  await page.click('#undo');
  await restored();
});

test('morphs into the second example and plays when asked', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  await page.click('#morph-example');
  await expect(page.locator('#morph-play')).toBeEnabled();
  await expect(page.locator('#filmstrip li')).toHaveCount(5);
  await expect(page.locator('#morph-play')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#morph-play');
  await expect(page.locator('#morph-play')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#morph-p')).not.toHaveValue('0');
  await page.click('#morph-play');
  await expect(page.locator('#morph-play')).toHaveText('▶ Play');
  await page.locator('#morph-p').fill('120');
  await expect(page.locator('#morph-p-out')).toHaveText('100%');
  // with reduced motion, Play runs one cycle there and back, then stops on its own
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#morph-p').fill('0');
  await page.click('#morph-play');
  await expect(page.locator('#morph-play')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#morph-play')).toHaveAttribute('aria-pressed', 'false', { timeout: 8000 });
});

test('a moved slider keeps the thinnest pen at most the thickest, and a bad field is named by its label', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  await page.locator('[data-path="width.min"]').fill('6');
  await expect(page.locator('[data-path="width.max"]')).toHaveValue('6');
  await expect(page.locator('#issues')).toBeHidden();
  await page.click('details.more summary >> text=More smoothing settings');
  await page.locator('[data-path="smooth.wavelet.levels"]').fill('lots');
  await page.locator('[data-path="smooth.wavelet.levels"]').press('Enter');
  await page.locator('[data-path="smooth.wavelet.levels"]').blur();
  await expect(page.locator('#issues')).toContainText('Wavelet levels (auto or 1–12): must be');
  await expect(page.locator('[data-path="smooth.wavelet.levels"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#stale')).toBeVisible();
});

test('fits a 390 px phone without sideways scrolling and takes a finger-drawn stroke', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.click('#clear');
  const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator('#pad').boundingBox());
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const cdp = await context.newCDPSession(page);
  const at = (/** @type {number} */ t) => [{ x: box.x + box.width * (0.1 + 0.8 * t), y: box.y + box.height * (0.5 + 0.2 * Math.sin(t * 7)) }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= 30; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / 30) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#pad-info')).toContainText('1 stroke,');
  await page.waitForFunction(() => window.Signature.getResult()?.strokes.length === 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  const handle=page.getByRole('button',{name:'Move effect 2',exact:true});await handle.scrollIntoViewIfNeeded();
  const h=await handle.boundingBox();const start=await page.evaluate(()=>window.Signature.getRequest().effects[1].from);
  const scroll=await page.evaluate(()=>scrollY);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:h.x+h.width/2,y:h.y+h.height/2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:h.x+h.width/2-15,y:h.y+h.height/2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>window.Signature.getRequest().effects[1].from)).toBeLessThan(start);
  expect(await page.evaluate(()=>scrollY)).toBe(scroll);
  await context.close();
});

for (const modifier of ['Control', 'Meta']) test(`${modifier}+Z and Shift+Z preserve pad history and native text undo`, async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.Signature?.getResult());
  const original = await page.evaluate(() => window.Signature.getRequest().strokes);
  await page.click('#clear');
  await page.locator('#pad').focus();
  await page.keyboard.press(`${modifier}+z`);
  await expect.poll(() => page.evaluate(() => window.Signature.getRequest().strokes)).toEqual(original);
  await page.keyboard.press(`${modifier}+Shift+z`);
  await expect(page.locator('#result-empty')).toBeVisible();
  await page.keyboard.press(`${modifier}+z`);
  await expect.poll(() => page.evaluate(() => window.Signature.getRequest().strokes)).toEqual(original);
  // An editable field owns its native undo; the signature must stay unchanged.
  const field = page.locator('[data-path="resample.step"]');
  await field.locator('xpath=ancestor::details').evaluate(e => e.open = true);
  await field.fill('auto');
  await field.press('End');
  await field.press('a');
  await field.press(`${modifier}+z`);
  expect(await page.evaluate(() => window.Signature.getRequest().strokes)).toEqual(original);
  await field.fill('auto');
  await page.locator('#pad').focus();
  await page.keyboard.press(`${modifier}+Alt+z`);
  expect(await page.evaluate(() => window.Signature.getRequest().strokes)).toEqual(original);
  await page.click('#clear');
  await expect(page.locator('#redo')).toBeDisabled();
  await drawWithMouse(page);
  await page.keyboard.press(`${modifier}+z`);
  await expect(page.locator('#result-empty')).toBeVisible();
  await page.keyboard.press(`${modifier}+Shift+z`);
  await expect(page.locator('#pad-info')).toContainText('1 stroke,');
  // A dialog's history is separate from the primary signature.
  await page.click('#morph-draw');
  const b = await page.locator('#pad2').boundingBox();
  await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down();
  await page.mouse.move(b.x + 90, b.y + 60, {steps: 10}); await page.mouse.up();
  await page.locator('#pad2').focus();
  await page.keyboard.press(`${modifier}+z`);
  await expect(page.locator('#draw-done')).toBeDisabled();
  await page.keyboard.press(`${modifier}+Shift+z`);
  await expect(page.locator('#draw-done')).toBeEnabled();
  await expect(page.locator('#pad-info')).toContainText('1 stroke,');
});

test('effect bars, warp, exports and history share one request',async({page})=>{
 await page.goto('./');await page.waitForFunction(()=>window.Signature?.getResult());
 await expect(page.locator('.effect-row')).toHaveCount(2);
 const initial=await page.evaluate(()=>window.Signature.exportSvgText());
 await page.getByRole('button',{name:'＋ Thickness',exact:true}).click();
 await page.getByLabel('Width ×, effect 3',{exact:true}).fill('2');
 await page.getByLabel('Width ×, effect 3',{exact:true}).press('Tab');
 await expect.poll(()=>page.evaluate(()=>window.Signature.exportSvgText())).not.toEqual(initial);
 await page.getByRole('button',{name:'Start of effect 3',exact:true}).focus();
 await page.keyboard.press('ArrowRight');
 await expect.poll(()=>page.evaluate(()=>window.Signature.getRequest().effects[2].from)).toBe(.26);
 await page.keyboard.press('Control+z');
 await expect.poll(()=>page.evaluate(()=>window.Signature.getRequest().effects[2].from)).toBe(.25);
 await page.keyboard.press('Control+Shift+z');
 await expect.poll(()=>page.evaluate(()=>window.Signature.getRequest().effects[2].from)).toBe(.26);
 await page.getByText('Move the ink directly',{exact:true}).click();
 await page.getByLabel('Centre x',{exact:true}).fill('100');await page.getByLabel('Centre y',{exact:true}).fill('100');
 await page.getByLabel('Move x',{exact:true}).fill('20');await page.getByLabel('Radius',{exact:true}).fill('1000');
 await page.getByRole('button',{name:'Apply warp',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.Signature.getRequest().warps.length)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>window.Signature.submit(window.Signature.getRequest()).svg===window.Signature.exportSvgText())).toBe(true);
 const warped=await page.evaluate(()=>window.Signature.exportSvgText());
 await page.getByRole('button',{name:'Clear warps',exact:true}).click();
 await page.keyboard.press('Meta+z');
 await expect.poll(()=>page.evaluate(()=>window.Signature.exportSvgText())).toBe(warped);
 await page.click('#clear');await page.click('#undo');
 await expect.poll(()=>page.evaluate(()=>window.Signature.exportSvgText())).toBe(warped);
 await page.getByRole('button',{name:'Remove effect 3',exact:true}).click();
 await expect(page.locator('.effect-row')).toHaveCount(2);
});

test('drag spans and warp the canvas; creation respects reduced motion',async({page})=>{
 await page.goto('./');await page.waitForFunction(()=>window.Signature?.getResult());
 const bar=page.getByRole('button',{name:'Move effect 2',exact:true});await bar.scrollIntoViewIfNeeded();
 let b=await bar.boundingBox();const before=await page.evaluate(()=>window.Signature.getRequest().effects[1]);
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+35,b.y+b.height/2,{steps:6});await page.mouse.up();
 const after=await page.evaluate(()=>window.Signature.getRequest().effects[1]);expect(after.from).toBeGreaterThan(before.from);expect(after.to-after.from).toBeCloseTo(before.to-before.from,10);
 await page.getByText('Move the ink directly',{exact:true}).click();await page.getByLabel('Warp on canvas',{exact:true}).check();
 await page.locator('#result').scrollIntoViewIfNeeded();b=await page.locator('#result').boundingBox();
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+24,b.y+b.height/2+12,{steps:6});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>window.Signature.getRequest().warps.length)).toBe(1);
 expect(await page.evaluate(()=>window.Signature.getRequest().warps[0].dx)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Show creation',exact:true}).click();await expect(page.locator('.effect-rows')).toHaveClass(/revealing/);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.effect-rows')).not.toHaveClass(/revealing/);
 await page.getByRole('button',{name:'Show creation',exact:true}).click();await expect(page.locator('.effect-rows')).not.toHaveClass(/revealing/);
 await expect(page.locator('.creation-overlay')).toBeHidden();
});

test('output controls restore together with undo and redo',async({page})=>{
 await page.goto('./');await page.waitForFunction(()=>window.Signature?.getResult());
 await page.locator('#png-dpi').fill('600');await page.locator('#png-dpi').press('Tab');
 await page.locator('#result-heading').click();await page.keyboard.press('Control+z');
 await expect(page.locator('#png-dpi')).toHaveValue('300');
 await page.keyboard.press('Control+Shift+z');await expect(page.locator('#png-dpi')).toHaveValue('600');
});

test('morph target, settings and drawn target participate in main history',async({page})=>{
 await page.goto('./');await page.waitForFunction(()=>window.Signature?.getResult());
 const original=await page.evaluate(()=>window.Signature.getRequest().strokes);
 await page.click('#morph-example');await expect(page.locator('#morph-info')).toContainText('second example');
 await page.keyboard.press('Control+z');await expect(page.locator('#morph-info')).toHaveText('No second signature yet.');
 expect(await page.evaluate(()=>window.Signature.getRequest().strokes)).toEqual(original);
 await expect(page.locator('#morph-empty')).toBeVisible();
 await page.keyboard.press('Control+Shift+z');await expect(page.locator('#morph-info')).toContainText('second example');
 await page.locator('#morph-method').selectOption('linear');await page.locator('#morph-method').focus();
 await page.keyboard.press('Control+z');await expect(page.locator('#morph-method')).toHaveValue('wavelet');
 await page.keyboard.press('Control+Shift+z');await expect(page.locator('#morph-method')).toHaveValue('linear');
 await page.keyboard.press('Control+z');
 await page.locator('#morph-import').setInputFiles({name:'target.csv',mimeType:'text/csv',buffer:Buffer.from('x,y\n0,0\n20,30\n40,0')});
 await expect(page.locator('#morph-info')).toContainText('target.csv');await expect(page.locator('#redo')).toBeDisabled();
 await page.click('#morph-draw');const b=await page.locator('#pad2').boundingBox();
 await page.mouse.move(b.x+20,b.y+20);await page.mouse.down();await page.mouse.move(b.x+80,b.y+60,{steps:10});await page.mouse.up();
 await page.click('#draw-done');await expect(page.locator('#morph-info')).toContainText('drawn here');
 await page.keyboard.press('Meta+z');await expect(page.locator('#morph-info')).toContainText('target.csv');
 await page.keyboard.press('Meta+Shift+z');await expect(page.locator('#morph-info')).toContainText('drawn here');
 expect(await page.evaluate(()=>window.Signature.getRequest().strokes)).toEqual(original);
 // Non-text select controls use application history too.
 await page.getByLabel('Hairpins, effect 1',{exact:true}).selectOption('round');await page.getByLabel('Hairpins, effect 1',{exact:true}).focus();
 await page.keyboard.press('Control+z');await expect(page.getByLabel('Hairpins, effect 1',{exact:true})).toHaveValue('preserve');
});

for(const channel of ['main','target']) test(`undo cancels delayed ${channel} example and file reads`,async({page})=>{
 await page.goto('./');await page.waitForFunction(()=>window.Signature?.getResult());
 const original=await page.evaluate(()=>window.Signature.getRequest().strokes);
 // Establish a history state to restore while the request is in flight.
 await page.locator('[data-path="smooth.fourier.strength"]').fill('2');
 let release;const delayed=new Promise(resolve=>{release=resolve;});let reached;
 const started=new Promise(resolve=>{reached=resolve;});
 await page.route(channel==='main'?'**/examples/avery-quill.csv':'**/examples/juno-marsh.csv',async route=>{reached();await delayed;await route.fulfill({contentType:'text/csv',body:'x,y\n900,900\n950,980\n990,900'});});
 await page.click(channel==='main'?'#example':'#morph-example');await started;
 await page.keyboard.press('Control+z');release();await page.waitForTimeout(150);
 expect(await page.evaluate(()=>window.Signature.getRequest().strokes)).toEqual(original);
 await expect(page.locator('#morph-info')).toHaveText('No second signature yet.');
 await page.locator('[data-path="smooth.fourier.strength"]').fill('3');
 await page.evaluate(()=>{const read=File.prototype.text;File.prototype.text=function(){return new Promise(resolve=>{window.releaseSignatureRead=()=>read.call(this).then(resolve);});};});
 await page.locator(channel==='main'?'#import':'#morph-import').setInputFiles({name:'delayed.csv',mimeType:'text/csv',buffer:Buffer.from('x,y\n900,900\n950,980\n990,900')});
 await page.waitForFunction(()=>window.releaseSignatureRead);
 await page.locator('#result-heading').click();await page.keyboard.press('Meta+z');
 await page.evaluate(()=>window.releaseSignatureRead());await page.waitForTimeout(150);
 expect(await page.evaluate(()=>window.Signature.getRequest().strokes)).toEqual(original);
 await expect(page.locator('#morph-info')).toHaveText('No second signature yet.');
});

test('colour and imported morph settings restore and branch correctly',async({page})=>{
 await page.goto('./');await page.waitForFunction(()=>window.Signature?.getResult());
 const colour=async value=>page.locator('#ink').evaluate((el,v)=>{el.focus();el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await colour('#123456');await page.keyboard.press('Control+z');await expect(page.locator('#ink')).toHaveValue('#1b1b1b');
 await expect(page.locator('#results-card')).toHaveCSS('--ink','#1b1b1b');
 await colour('#abcdef');await expect(page.locator('#redo')).toBeDisabled();
 await page.keyboard.press('Control+z');await expect(page.locator('#ink')).toHaveValue('#1b1b1b');
 await page.evaluate(()=>{const req=window.Signature.getRequest();window.Signature.load({...req,morph:{target:{strokes:req.strokes},method:'linear',strokes:'first',loop:2}});});
 await expect(page.locator('#morph-info')).toContainText('imported request');await expect(page.locator('#morph-method')).toHaveValue('linear');
 await page.locator('#result-heading').click();await page.keyboard.press('Meta+z');
 await expect(page.locator('#morph-info')).toHaveText('No second signature yet.');await expect(page.locator('#morph-method')).toHaveValue('wavelet');
});
