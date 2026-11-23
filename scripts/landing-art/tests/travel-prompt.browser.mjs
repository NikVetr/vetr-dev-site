import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from '../cards/travel-prompt.mjs';
import { openPage } from '../browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE || 'chromium');
const svg = readFileSync(new URL('../../../assets/cards/travel-prompt.svg', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../style.css', import.meta.url), 'utf8');

test('each preview selection and excerpt matches the real app after that edit', async () => {
  assert.equal(build(), svg, 'committed card matches its generator');
  const { page, close, errors } = await openPage('travel-prompt/?mode=lodging', { engine });
  try {
    const generated = [];
    for (const mode of ['lodging', 'restaurant', 'menu', 'outing']) {
      await page.locator('[data-mode="' + mode + '"]').click();
      if (mode !== 'menu') await page.locator('#place').fill('Kyoto Station');
      if (mode === 'lodging') await page.locator('#budget').fill('¥18,000');
      if (mode === 'menu') {
        await page.getByText('Paste menu text', { exact: true }).click();
        await page.locator('#menuText').fill('Yuzu soda · ¥600');
      }
      if (mode === 'restaurant' || mode === 'outing')
        await page.getByText(mode === 'restaurant' ? 'Food and drink preferences' : 'Outing interests', { exact: true }).click();
      for (const step of [0, 1]) {
        let selected;
        if (mode === 'lodging' || mode === 'menu') {
          selected = (mode === 'lodging' ? ['Per night', 'Whole stay'] : ['Food', 'Drinks'])[step];
          await page.getByRole('radio', { name: selected, exact: true }).check();
        } else {
          const slider = page.getByRole('slider', { name: mode === 'restaurant' ? 'Spicy food' : 'Museums and galleries' });
          await slider.press((mode === 'restaurant' ? ['ArrowRight', 'Home'] : ['ArrowLeft', 'End'])[step]);
          selected = await slider.getAttribute('aria-valuetext');
        }
        generated.push({ sample: mode + '-' + step, prompt: await page.locator('#prompt').inputValue(), selected });
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(new URL('../', page.url()).href);
    const art = page.locator('[data-art="travel-prompt"]');
    await art.scrollIntoViewIfNeeded();
    await art.locator('.tp-demo').waitFor();
    await art.hover();
    assert.equal(await art.getAttribute('data-started'), null);
    const visible = art.locator('.tp-frame:visible');
    assert.equal(await visible.count(), 1);
    assert.equal(await visible.getAttribute('data-sample'), 'lodging-0');
    assert.ok(await visible.locator('.tp-selected').isVisible());
    assert.ok(await visible.locator('.tp-excerpt').isVisible());
    for (const { sample, prompt, selected } of generated) {
      const frame = art.locator('[data-sample="' + sample + '"]');
      assert.equal(await frame.locator('.tp-selected,.tp-value').textContent(), selected);
      const excerpt = await frame.locator('.tp-excerpt').textContent();
      const goal = await frame.locator('.tp-goal').textContent();
      assert.ok(excerpt && prompt.includes(excerpt), sample + ' excerpt: ' + excerpt);
      assert.ok(goal && prompt.startsWith(goal), sample + ' opening: ' + goal);
    }
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test('one legible control and its matching output fit every card shape throughout the loop', async () => {
  const { page, close, errors } = await openPage('about:blank', { engine });
  try {
    const sizes = [[212, 90], [242, 136], [315, 84], [312, 176], [342, 234], [160, 240], [362, 404], [705, 284]];
    await page.setContent('<style>' + css + '</style>' + sizes.map(([w, h]) =>
      `<div class="card-art" data-art="travel-prompt" data-started="" style="width:${w}px;height:${h}px;flex:none;min-height:0">${svg}</div>`).join(''));
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (let step = 0; step < 8; step++) {
        await page.evaluate(time => { for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = time;
        } }, step * 3000 + 1000);
        const failures = await page.locator('[data-art]').evaluateAll(cards => cards.flatMap(card => {
          const visible = [...card.querySelectorAll('.tp-frame')].filter(frame => getComputedStyle(frame).visibility === 'visible');
          if (visible.length !== 1) return ['Visible frames: ' + visible.length];
          const frame = visible[0];
          const bad = [];
          for (const item of frame.querySelectorAll('.tp-mode,.tp-label,.tp-option,.tp-value,.tp-input,.tp-heading,.tp-goal,.tp-excerpt')) {
            if (!item.getClientRects().length) continue;
            const pane = item.closest('.tp-editor,.tp-output').getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(item);
            const rect = range.getBoundingClientRect();
            if (rect.top < pane.top - 1 || rect.bottom > pane.bottom + 1 || rect.left < pane.left - 1 || rect.right > pane.right + 1)
              bad.push(card.clientWidth + '×' + card.clientHeight + ' ' + item.textContent);
          }
          return bad;
        }));
        assert.deepEqual(failures, [], theme + ' frame ' + step);
        assert.equal(await page.locator('.tp-frame:visible').first().getAttribute('data-sample'),
          ['lodging','restaurant','menu','outing'][Math.floor(step / 2)] + '-' + step % 2);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
