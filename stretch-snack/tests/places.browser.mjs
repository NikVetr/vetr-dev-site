import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {openPage} from '../../scripts/landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
const key = 'vetr:stretch-snack:saved-routines';
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));

for (const [width, height] of [[390, 844], [1440, 960]]) {
  test(`selected places match the CLI and the easier swap releases travel time at ${width}px`, async () => {
    const {page, close, errors} = await openPage('stretch-snack/', {engine, width, height, touch: width < 700});
    try {
      if (width < 700) await page.locator('#toggle-settings').click();
      const here = page.locator('#available input[value="plane-seat"]');
      const away = page.locator('#available input[value="plane-lavatory"]');
      assert.ok(await here.isChecked() && await here.isDisabled());
      assert.equal(await away.isChecked(), false);
      await page.getByRole('button', {name: '5 min', exact:true}).click();
      await page.getByRole('button', {name: 'Calves & feet', exact:true}).click();
      await away.check();
      const handhold = page.getByRole('checkbox', {name: 'Secure fixed handhold at Airplane lavatory'});
      assert.equal(await handhold.isChecked(), false);
      await handhold.check();
      const segments = page.locator('#steps .place-segment');
      assert.equal(await segments.count(), 1, 'ordinary calf movements fit the seat');
      const entry = page.locator('#library details[data-move="standing-toe-lift"]');
      await page.locator('#open-library').click();
      await page.locator('#library-query').fill('Standing toe lifts');
      await entry.locator('summary').click();
      await entry.locator('select').selectOption('favorite');
      assert.match(await entry.locator('.easier-option').innerText(), /Also works in your seat · Seated toe lifts/);
      await page.locator('[data-close="library"]').click();
      assert.deepEqual(await segments.locator('h3').allTextContents(), ['Airplane seat with a neighbor', 'Airplane lavatory · about 1 min away']);
      assert.match(await page.locator('#plan-note').innerText(), /return to your seat/);
      const request = {seconds: 300, targets:['calves'], availableLocations:['plane-lavatory'],
        equipmentByLocation:{'plane-lavatory':['support']}, favoriteIds:['standing-toe-lift']};
      const expected = JSON.parse(execFileSync(process.execPath, [cli], {input: JSON.stringify(request), encoding:'utf8'}));
      const rendered = await segments.evaluateAll(groups => groups.map(g =>
        Array.from(g.querySelectorAll('.step'), row => ({id:row.getAttribute('data-move'), location:row.getAttribute('data-location')}))));
      assert.deepEqual(rendered, expected.segments.map(s => s.steps.map(i => ({id:expected.steps[i].id,location:s.location}))));
      assert.deepEqual(await page.evaluate(req => window['StretchSnack'].submit(req).segments, request), expected.segments);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width < 700) {
        await page.locator('#steps [data-move="standing-toe-lift"] .edit-step').click();
        assert.equal(await page.locator('#edit-place').inputValue(), 'plane-lavatory');
        const i = expected.steps.findIndex(s => s.id === 'standing-toe-lift');
        assert.equal(Number(await page.locator('#edit-seconds').inputValue()), expected.steps[i].seconds - expected.transitionSeconds[i], 'movement time excludes the visit');
        await page.locator('#edit-easier button').click();
        assert.equal(await page.locator('#edit-move').inputValue(), 'seated-toe-lift');
        assert.equal(await page.locator('#edit-place').inputValue(), 'plane-seat');
        await page.getByRole('button', {name:'Apply', exact:true}).click();
      } else {
        await page.locator('#open-library').click();
        await page.locator('#library-query').fill('Standing toe lifts');
        await entry.locator('summary').click();
        await entry.getByRole('button', {name:'Swap this step'}).click();
        assert.ok(await page.locator('#library').isHidden());
      }
      assert.equal(await segments.count(), 1);
      const activeSeconds = expected.totalSeconds - expected.transitionSeconds.reduce((a,b) => a+b, 0);
      const clock = Math.floor(activeSeconds/60) + ':' + String(activeSeconds%60).padStart(2,'0');
      assert.ok((await page.locator('#routine-summary').innerText()).startsWith(clock + ' ·'));
      assert.equal(await page.locator('#steps .step[data-move="seated-toe-lift"]').count(), 1 + expected.steps.filter(s => s.id === 'seated-toe-lift').length);
      assert.equal(await page.locator('#steps .step.selected').count(), 1);
      await away.uncheck();
      await away.check();
      assert.equal(await handhold.isChecked(), false, 'each visit requires an explicit fixture confirmation');
      assert.deepEqual(errors, []);
    } finally { await close(); }
  });
}

test('saved routes keep their named places and old saves resolve to the seat', async () => {
  const {page, close, errors} = await openPage('stretch-snack/', {engine, width:390, height:844, touch:true});
  try {
    const prior = [
      {name:'Old seat', steps:[{id:'seated-chin-tuck', seconds:30}]},
      {name:'Two places', steps:[{id:'seated-neck-turn', location:'plane-seat', seconds:15},
        {id:'standing-neck-turn', location:'plane-lavatory', seconds:80}]},
    ];
    await page.evaluate(({key, prior}) => localStorage.setItem(key, JSON.stringify(prior)), {key, prior});
    const show = () => page.locator('#open-routines').click();
    await show();
    assert.ok(await page.locator('#use-routine').isEnabled());
    await page.locator('#use-routine').click();
    assert.equal(await page.locator('#steps .step').getAttribute('data-location'), 'plane-seat');
    await show();
    await page.locator('#routine-choice').selectOption('Two places');
    assert.ok(await page.locator('#use-routine').isDisabled());
    assert.match(await page.locator('.review-step .error').last().innerText(), /outside your selected, reachable places/);
    await page.locator('[data-close="saved-routines"]').click();
    await page.locator('#toggle-settings').click();
    await page.locator('#available input[value="plane-lavatory"]').check();
    await show();
    assert.equal(await page.locator('#routine-choice').inputValue(), 'Two places');
    assert.ok(await page.locator('#use-routine').isEnabled());
    await page.locator('#use-routine').click();
    assert.equal(await page.locator('.place-segment').count(), 2);
    assert.match(await page.locator('.step').last().innerText(), /20 s moving/);
    await show();
    await page.locator('#name-routine').click();
    await page.locator('#routine-name').fill('My flight');
    await page.locator('#save-routine').click();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.deepEqual(saved.slice(0, 2), prior);
    assert.deepEqual(saved[2], {name:'My flight', steps:prior[1].steps});
    assert.ok(await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      return dialog.scrollWidth <= dialog.clientWidth;
    }));
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
