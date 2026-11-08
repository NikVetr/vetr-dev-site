import {test,expect} from '@playwright/test';
const request={mode:'rounds',guests:Array.from({length:12},(_,i)=>({id:['Fred','Bob','Sam','Chris','Ada','Jo','Kit','Lee','Max','Nia','Pat','Robin'][i],category:i%3,travelWeight:i===1?3:1,...(!i&&{fixedSeat:{table:'A',seat:1}})})),tables:[{id:'A',capacity:4,x:0,y:0},{id:'B',capacity:4,x:1,y:0},{id:'C',capacity:4,x:0,y:1}],rounds:3,roundOptions:{iterations:600,seed:4}};
/** @param {import('@playwright/test').Page} page */
async function open(page){await page.goto('./');await expect(page.locator('html')).toHaveAttribute('data-ready','true')}
/** @param {import('@playwright/test').Page} page @param {string} key */
async function shortcut(page,key){await page.locator('h1').click();await page.keyboard.press(key)}
test('real rounds load through files; locked seats, selected SVG and all-round CSV survive undo/redo',async({page})=>{
 /** @type {string[]} */const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
 await page.locator('#request-file').setInputFiles({name:'rounds.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(request))});
 await expect(page.locator('#round-controls')).toBeVisible();
 await expect(page.locator('#planning-mode')).toHaveValue('rounds');
 await expect(page.locator('.replay-head')).toBeHidden();
 await expect(page.locator('#guest-rows .fixedSeat').first()).toHaveValue('A:2');
 await expect(page.locator('#chart .guest')).toHaveCount(12);
 expect(await page.evaluate(()=>{const app=/** @type {any} */(window).Seating;return app.getResult().rounds.every((/** @type {any} */r)=>r.tables[0].seats[1]==='Fred')})).toBe(true);
 await page.locator('#round-next').click();
 await expect(page.locator('#round-number')).toHaveValue('1');
 expect(await page.evaluate(()=>/** @type {any} */(window).Seating.exportSvgText())).toContain('Round 2 of 3');
 const csv=await page.evaluate(()=>/** @type {any} */(window).Seating.exportSeatingCsv());expect(csv.split('\n')).toHaveLength(38);expect(csv).toContain('3,A,2,Fred,0');
 await shortcut(page,'Control+z');await expect(page.locator('#round-number')).toHaveValue('0');
 await shortcut(page,'Meta+Shift+z');await expect(page.locator('#round-number')).toHaveValue('1');
 await shortcut(page,'Meta+z');await shortcut(page,'Control+z');
 await expect(page.locator('#planning-mode')).toHaveValue('static');await expect(page.locator('.replay-head')).toBeVisible();
 await shortcut(page,'Control+Shift+z');await expect(page.locator('#round-controls')).toBeVisible();
 await expect(page.locator('#guest-rows .fixedSeat').first()).toHaveValue('A:2');
 await page.locator('#theme-toggle').click();await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#chart svg')).toHaveAttribute('aria-label','Round 1 of 3');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
 expect(errors).toEqual([]);
});
test('mobility and round settings have history; invalid locks retain the previous result and flag the field',async({page})=>{
 await open(page);await page.evaluate(req=>/** @type {any} */(window).Seating.submit(req),request);
 const weight=page.locator('#guest-rows .travelWeight').nth(1);await weight.fill('8');await page.locator('h1').click();
 await expect(page.locator('#stale')).toContainText('guests changed');
 await shortcut(page,'Control+z');await expect(weight).toHaveValue('3');
 await shortcut(page,'Meta+Shift+z');await expect(weight).toHaveValue('8');
 await page.locator('#round-maxTravel').fill('4');await page.locator('h1').click();
 await shortcut(page,'Meta+z');await expect(page.locator('#round-maxTravel')).toHaveValue('1');
 await page.locator('#guest-rows .fixedSeat').nth(1).fill('A:2');await page.locator('#run').click();
 await expect(page.locator('#issues')).toContainText('another guest is fixed in this seat');
 await expect(page.locator('#guest-rows .fixedSeat').nth(1)).toHaveAttribute('aria-invalid','true');
 await expect(page.locator('#round-controls')).toBeVisible();
 await expect(page.locator('#redo')).toBeDisabled();
});

test('a delayed rounds example cannot overwrite a later Clear action',async({page})=>{
 await open(page);let requested=false;
 /** @type {()=>void} */let release=()=>{};
 const held=new Promise(resolve=>{release=()=>resolve(undefined)});
 await page.route('**/examples/rounds-demo.json',async route=>{requested=true;await held;await route.continue()});
 await page.locator('#load-round-example').click();await expect.poll(()=>requested).toBe(true);
 await page.locator('#clear-all').click();
 const response=page.waitForResponse('**/examples/rounds-demo.json');release();await response;
 await page.waitForTimeout(100); // Allow the superseded fetch's JSON continuation to run.
 await expect(page.locator('#guest-count')).toHaveText('0 guests');
 await expect(page.locator('#planning-mode')).toHaveValue('static');
 await shortcut(page,'Control+z');await expect(page.locator('#guest-count')).toHaveText('39 guests');
});
