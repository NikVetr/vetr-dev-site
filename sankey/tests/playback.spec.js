const {test,expect}=require('@playwright/test');

test.beforeEach(async({page})=>{
  page.on('pageerror',error=>{throw error;});
  await page.goto('/index.html');
  await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.loadExample('cohort'));
});

test('complete patient slices accumulate and snapshot exports preserve progress without changing the project',async({page})=>{
  const result=await page.evaluate(()=>{
    const app=(/** @type {any} */(window)).SankeyApp;
    const before=JSON.stringify(app.getProject());
    const half=app.seekTrajectories(.5);
    const paths=document.querySelectorAll('.playback-unit').length;
    const moving=[...document.querySelectorAll('.playback-head')].filter(e=>e.getAttribute('opacity')==='1').length;
    const exported=app.exportSvgText();
    const full=app.seekTrajectories(1);
    return {half,paths,moving,full,exported,unchanged:before===JSON.stringify(app.getProject())};
  });
  expect(result.paths).toBe(560);
  expect(result.half.completed).toBeGreaterThan(0);
  expect(result.half.completed).toBeLessThan(560);
  expect(result.moving).toBeGreaterThan(1);
  expect(result.full.completed).toBe(560);
  expect(result.full.description).toBe('illustrative patients');
  expect(result.exported).toContain('playback-clip-559');
  expect(result.exported).toContain('playback-unit');
  expect(result.unchanged).toBe(true);
});

test('play, pause and reset work from the keyboard; paused progress is stable',async({page})=>{
  const play=page.locator('#trajectory-play');
  await play.focus(); await play.press('Space');
  await expect(play).toHaveText('Pause paths');
  await page.waitForFunction(()=>(/** @type {any} */(window)).SankeyApp.getPlayback().progress>.025);
  await play.press('Space');
  const paused=await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.getPlayback());
  await page.waitForTimeout(120);
  expect(await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.getPlayback())).toEqual(paused);
  await page.locator('#trajectory-reset').click();
  await expect(page.locator('.layer-playback')).toHaveCount(0);
  expect(await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.getPlayback().active)).toBe(false);
});

test('reduced motion steps records without starting a timer and supports seeking',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('#trajectory-play')).toHaveText('Next path');
  await page.locator('#trajectory-play').click();
  const first=await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.getPlayback());
  expect(first.playing).toBe(false); expect(first.completed).toBe(1);
  await page.waitForTimeout(100);
  expect(await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.getPlayback().progress)).toBe(first.progress);
  await page.locator('#trajectory-play').click();
  expect(await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.getPlayback().completed)).toBe(2);
  await page.locator('#trajectory-progress').focus();
  await page.locator('#trajectory-progress').press('End');
  expect(await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.getPlayback().completed)).toBe(560);
  await page.locator('#trajectory-play').click();
  expect(await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.getPlayback().completed)).toBe(1);
});

test('aggregate paths stay grouped, and matrices without complete trajectories cannot play',async({page})=>{
  const grouped=await page.evaluate(()=>{
    const app=(/** @type {any} */(window)).SankeyApp;app.loadExample('pathways');return app.seekTrajectories(1);
  });
  expect(grouped.total).toBe(17);
  expect(grouped.description).toBe('grouped paths (no IDs)');
  await expect(page.locator('.playback-unit[data-member="-1"]')).toHaveCount(17);
  await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.loadExample('labeled'));
  await expect(page.locator('#trajectory-play')).toBeDisabled();
  expect(await page.evaluate(()=>{
    try{(/** @type {any} */(window)).SankeyApp.playTrajectories();return '';}
    catch(error){return error instanceof Error?error.message:String(error);}
  })).toContain('complete paths');
});

test('text-size edits reset playback and new geometry retains the recorded data',async({page})=>{
  const result=await page.evaluate(()=>{
    const app=(/** @type {any} */(window)).SankeyApp;
    app.seekTrajectories(.4);const before=app.getProject();
    app.setTextSize(26);const reset=app.getPlayback();const after=app.getProject();
    const resized=app.seekTrajectories(.4);
    let error='';try{app.seekTrajectories(-1);}catch(e){error=e instanceof Error?e.message:String(e);}
    return {reset,resized,error,pathsMatch:JSON.stringify(before.paths)===JSON.stringify(after.paths),
      flowsMatch:JSON.stringify(before.matrices)===JSON.stringify(after.matrices),fontSize:after.style.fontSize};
  });
  expect(result.reset.active).toBe(false);
  expect(result.resized.total).toBe(560);
  expect(result.fontSize).toBe(26);
  expect(result.pathsMatch&&result.flowsMatch).toBe(true);
  expect(result.error).toContain('between 0 and 1');
});

for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  test(`trajectory controls fit at ${viewport.width} × ${viewport.height}`,async({page})=>{
    await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.seekTrajectories(.6));
    await page.setViewportSize(viewport);
    await expect.poll(async()=>await page.evaluate(()=>(/** @type {any} */(window)).SankeyApp.getPlayback().progress)).toBe(.6);
    await expect(page.locator('.playback-unit')).toHaveCount(560);
    await expect(page.locator('#trajectory-play')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    const bounds=await page.locator('.trajectory-controls').boundingBox();
    if (!bounds) throw new Error('Trajectory controls are not rendered');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);
    const plot=await page.locator('#stage').boundingBox();
    if (!plot) throw new Error('Plot panel is not rendered');
    expect(plot.height).toBeGreaterThan(180);
  });
}
