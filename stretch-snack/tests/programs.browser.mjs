import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from '../../scripts/landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');

test('program picker checks the available space, accepts the program clock and carries its cues into playback', async () => {
  const {page, close, errors} = await openPage('stretch-snack/',{engine,width:375,height:812,touch:true});
  try {
    await page.locator('#open-programs').click();
    assert.equal(await page.locator('#routine-choice option').count(),12);
    await page.locator('#routine-choice').selectOption('starting-to-stretch');
    assert.equal(await page.locator('#review-steps li').count(),10);
    await page.locator('#program-time').click();
    assert.ok(await page.locator('#use-routine').isDisabled());
    assert.match(await page.locator('#review-steps').innerText(),/Mobility setting|Floor use is off|Needs/);
    await page.getByRole('button',{name:'Close saved routines'}).click();
    const edit=page.locator('#toggle-settings');
    if (!(await page.locator('#location').isVisible())) await edit.click();
    await page.locator('#location').selectOption('open-area');
    await page.locator('#discretion input[value=any]').check();
    await page.locator('#intensity input[value=moderate]').check();
    await page.locator('#fit summary').click();
    await page.locator('#allow-floor').check();
    for (const key of ['wall','step','towel','support','mat','chair']) await page.locator('#equipment input[value="'+key+'"]').check();
    await page.locator('#open-programs').click();
    await page.locator('#routine-choice').selectOption('starting-to-stretch');
    await page.locator('#program-time').click();
    assert.ok(await page.locator('#use-routine').isEnabled(),await page.locator('#review-steps .error:visible').allInnerTexts().then(x=>x.join(' ')));
    const rect=await page.locator('#saved-routines').boundingBox();
    assert.ok(rect.x>=0 && rect.x+rect.width<=376 && rect.y>=0 && rect.y+rect.height<=813);
    await page.locator('#use-routine').click();
    await page.locator('#start').click();
    await page.waitForFunction(()=>document.querySelector('#player-cue').textContent.includes('Round 1 of 3'));
    assert.match(await page.locator('#player-name').innerText(),/shoulder/i);
    assert.deepEqual(errors,[]);
  } finally {await close();}
});
