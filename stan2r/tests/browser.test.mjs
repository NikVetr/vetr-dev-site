import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const {chromium} = /** @type {typeof import('../../name-tags/node_modules/playwright')} */ (require(process.env.PLAYWRIGHT || '../../name-tags/node_modules/playwright'));
const root = fileURLToPath(new URL('../../', import.meta.url));
const base = 'http://127.0.0.1:4204';
const fixtures = JSON.parse(await readFile(new URL('./fixtures/native-reference.json',import.meta.url),'utf8')).fixtures;

test('browser conversion, failures, history, and responsive layout', {timeout:240000}, async () => {
  const server = spawn('python3',['-m','http.server','4204','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
  const browser = await chromium.launch({headless:true});
  try {
    for(let i=0;i<50;i++) {try {if((await fetch(base)).ok) break;} catch {} await new Promise(r=>setTimeout(r,100));}
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    /** @type {string[]} */
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/stan2r/`);
    await page.waitForFunction(()=>Boolean(window.Stan2R));
    const start=Date.now();
    for(const fixture of fixtures) {
      const result=await page.evaluate(request=>window.Stan2R.submit(request),fixture.request);
      assert.equal(result.code,fixture.code,`${fixture.name} ${fixture.request.mode}`);
    }
    console.log(`12 browser conversions including runtime startup: ${Date.now()-start}ms`);
    const unsupported=await page.evaluate(async()=>{try {await window.Stan2R.submit({source:'parameters {real x;} model {}'});}catch(e){return /** @type {{code:string}} */ (e).code;}});
    assert.equal(unsupported,'UNSUPPORTED_CONSTRUCT');
    const warned=await page.evaluate(()=>window.Stan2R.submit({source:'parameters {real mu; real<lower=0> sigma;} model {mu ~ normal(0,1); sigma ~ normal(mu,1);}'}));
    assert.match(warned.warnings.join('\n'),/draws differ from Stan's joint prior/);
    await page.click('#convert');
    await page.waitForFunction(()=>document.getElementById('status')?.textContent==='Converted');
    assert.match(await page.locator('#output').inputValue(),/sigma <-/);
    const original=await page.locator('#source').inputValue();
    await page.selectOption('#example','binomial');await page.click('#load-example');
    assert.match(await page.locator('#source').inputValue(),/binomial/);
    await page.click('#undo');assert.equal(await page.locator('#source').inputValue(),original);
    await page.locator('#redo').focus();await page.keyboard.press('Control+Shift+z');
    assert.match(await page.locator('#source').inputValue(),/binomial/);
    await page.locator('#source').focus();await page.keyboard.press('Control+End');await page.keyboard.type('\n// edit');await page.keyboard.press('Control+z');
    assert.ok(!(await page.locator('#source').inputValue()).endsWith('// edit'));
    await page.locator('#source').fill('parameters {real x;} model {x ~ invalid(1);}');await page.click('#convert');
    await page.waitForFunction(()=>document.getElementById('error')?.hidden===false);assert.match(await page.locator('#error').innerText(),/Semantic error/);
    await page.click('#load-example');await page.click('#convert');await page.waitForFunction(()=>document.getElementById('status')?.textContent==='Converted');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
    assert.equal(download.suggestedFilename(), 'model.R');
    const downloadedPath = await download.path();
    assert.ok(downloadedPath);
    assert.equal(await readFile(downloadedPath, 'utf8'), await page.locator('#output').inputValue());
    const screenshotDir=fileURLToPath(new URL('../../tmp/output/stan2r-review/',import.meta.url));await mkdir(screenshotDir,{recursive:true});
    await page.screenshot({path:`${screenshotDir}/desktop.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.click('#theme-toggle');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`${screenshotDir}/mobile.png`,fullPage:true});
    assert.deepEqual(errors,[]);
    const context=await browser.newContext();const offline=await context.newPage();
    await offline.route('https://webr.r-wasm.org/**',route=>route.abort());await offline.goto(`${base}/stan2r/`);await offline.click('#convert');
    await offline.waitForFunction(()=>document.getElementById('error')?.hidden===false);
    assert.match(await offline.locator('#error').innerText(),/Could not start the R runtime/);
    assert.equal(await offline.locator('#convert').isEnabled(),true);
    await context.close();
  } finally {await browser.close();server.kill();}
});
