// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
// Directory viewports: phone portrait and landscape, a tablet and desktops from 1366 to 2560.
const viewports = [[390, 844], [844, 390], [768, 1024], [1200, 900], [1280, 800], [1366, 768], [1440, 900], [1700, 1000], [1920, 1080], [2240, 1200], [2560, 1440]];
// Wells set directly around the layouts' aspect-ratio boundaries (1.2 and 2.45) and at the smallest sizes.
const wells = [[242, 136], [230, 280], [200, 300], [300, 252], [395, 162], [400, 162], [315, 84], [333, 96], [651, 261]];

test(`Rating Prediction text stays inside its panes throughout the loop in ${engine}`, async () => {
  const browser = await openPage('', { engine });
  const { page, errors } = browser;
  try {
    const art = page.locator('[data-art="media-ratings"]');
    const card = page.locator('.project-card').filter({ has: art });
    /** @param {string} where */
    const check = async (where) => {
      await art.scrollIntoViewIfNeeded(); await art.locator('.bin-9').waitFor();
      await card.hover();
      await page.waitForFunction(() => document.querySelector('[data-art="media-ratings"]')?.hasAttribute('data-playing'));
      for (let time = 0; time < 12000; time += 750) {
        const issues = await art.evaluate(async (/** @type {Element} */ el, /** @type {number} */ t) => {
          for (const a of el.getAnimations({ subtree: true })) { a.pause(); a.currentTime = t; }
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const found = [];
          const picture = el.getBoundingClientRect();
          /** @param {DOMRect} a @param {{left:number,right:number,top:number,bottom:number}} b */
          const inside = (a, b) => a.left >= b.left - .5 && a.right <= b.right + .5 && a.top >= b.top - .5 && a.bottom <= b.bottom + .5;
          /** @param {DOMRect} a @param {DOMRect} b */
          const overlap = (a, b) => a.left < b.right - .5 && a.right > b.left + .5 && a.top < b.bottom - .5 && a.bottom > b.top + .5;
          const texts = [...el.querySelectorAll('.film, .label, .caption:not(.scale), .scale > span')].map(node => {
            const range = document.createRange(); range.selectNodeContents(node);
            return { node, name: node.textContent, box: range.getBoundingClientRect() };
          });
          const graphics = [...el.querySelectorAll('.forecast-layout svg')], charts = [...el.querySelectorAll('.forecast-plot svg')];
          for (const { node, name, box } of texts) {
            // The pane's content box: text may not run into its padding or across its divider.
            const pane = /** @type {HTMLElement} */ (node.closest('.rating-input, .forecast-plot'));
            const style = getComputedStyle(pane), r = pane.getBoundingClientRect(), px = (/** @type {string} */ v) => parseFloat(v) || 0;
            const content = { left: r.left + px(style.borderLeftWidth) + px(style.paddingLeft), right: r.right - px(style.borderRightWidth) - px(style.paddingRight), top: r.top + px(style.borderTopWidth) + px(style.paddingTop), bottom: r.bottom - px(style.borderBottomWidth) - px(style.paddingBottom) };
            if (!inside(box, picture)) found.push(`${name} leaves the picture`);
            if (!inside(box, content)) found.push(`${name} leaves its pane`);
            for (const g of graphics) if (overlap(box, g.getBoundingClientRect())) found.push(`${name} overlaps the ${g.getAttribute('class') ?? 'chart'}`);
          }
          for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
            if (overlap(texts[i].box, texts[j].box)) found.push(`${texts[i].name} overlaps ${texts[j].name}`);
          }
          for (const g of graphics) if (!inside(g.getBoundingClientRect(), picture)) found.push(`the ${g.getAttribute('class') ?? 'chart'} leaves the picture`);
          for (const chart of charts) {
            const box = chart.getBoundingClientRect();
            if (box.height < 14) found.push(`a chart is squeezed to ${box.height.toFixed(1)} px`);
            for (const mark of chart.querySelectorAll('.dot, .position, .bar')) if (!inside(mark.getBoundingClientRect(), box)) found.push(`a ${mark.getAttribute('class')} mark leaves its chart`);
          }
          return found;
        }, time);
        assert.deepEqual(issues, [], `${where} at ${time} ms`);
      }
    };
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await check(`${width}×${height} viewport`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [width, height] of wells) {
      await art.evaluate((/** @type {HTMLElement} */ el, /** @type {number[]} */ [w, h]) => { Object.assign(el.style, { width: `${w}px`, height: `${h}px`, aspectRatio: 'auto', flex: 'none' }); }, [width, height]);
      await check(`${width}×${height} well`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
