// @ts-check
// Render the shipped SVG with the landing stylesheet, including <use> shadow trees.
// Numeric PNG tests cannot catch an opaque outline covering a correct color field.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodePng } from '../../../shared/decode-png.mjs';
import { openPage } from '../browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE ?? 'chromium');
const svg = readFileSync(new URL('../../../assets/cards/color-optimization.svg', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../style.css', import.meta.url), 'utf8');

test(`Palette's field remains visible through optimization and CVD views in ${engine}`, async () => {
  const browser = await openPage('about:blank', { engine });
  const { page } = browser;
  try {
    await page.setContent(`<style>${css}</style><div class="card-art" data-art="color-optimization" style="width:100%;height:360px;max-width:640px">${svg}</div>`);
    const art = page.locator('[data-art="color-optimization"]');
    const checkpoints = await art.evaluate((/** @type {HTMLElement} */ el) => {
      el.setAttribute('data-started', '');
      const frames = [...el.querySelectorAll('.frame')];
      const period = Number(el.querySelector('svg')?.dataset.period) * 1000;
      // Retain all objects before freezing: getAnimations() later omits future
      // delayed effects whose playbackRate is zero, although they still exist.
      const animations = el.getAnimations({subtree:true});
      for (let i = 0; i < frames.length; i++) {
        for (const animation of animations) { animation.playbackRate = 0; animation.currentTime = (i + .5) / frames.length * period; }
        const visible = frames.flatMap((f, j) => Number(getComputedStyle(f).opacity) > .5 ? [j] : []);
        if (visible.length !== 1 || visible[0] !== i) throw new Error(`Palette flipbook gap/overlap at frame ${i}: ${visible}`);
      }
      const stages = [['Explore colour spaces','none'], ['Optimize · best of 12 starts','none'],
        ...['deutan','protan','tritan'].map(cvd => ['Compare colour vision',cvd])];
      const times = stages.map(([stage,cvd]) => {
        const i = frames.findIndex(f => f.querySelector('[data-stage]')?.getAttribute('data-stage') === stage &&
          f.querySelector('[data-cvd]')?.getAttribute('data-cvd') === cvd);
        if (i < 0) throw new Error(`Missing Palette stage: ${stage}/${cvd}`);
        return (i + .5) / frames.length * period;
      });
      el.removeAttribute('data-started');
      return [0,...times];
    });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 500 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((/** @type {string} */ value) => { document.documentElement.dataset.theme = value; }, theme);
        /** @type {string[]} */ const fields = [];
        for (const [index,time] of checkpoints.entries()) {
          await art.evaluate((/** @type {Element} */ el, /** @type {number} */ at) => {
            el.toggleAttribute('data-started', at > 0);
            for (const animation of el.getAnimations({ subtree: true })) animation.currentTime = at;
          }, time);
          const clip = await art.locator(':scope > svg').evaluate((/** @type {SVGSVGElement} */ el) => {
            const matrix = el.getScreenCTM();
            if (!matrix) throw new Error('Missing SVG screen transform');
            const a = new DOMPoint(232, 74).matrixTransform(matrix), b = new DOMPoint(284, 111).matrixTransform(matrix);
            return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
          });
          const png = await page.screenshot({ clip });
          const { data, width: w, height: h } = decodePng(png);
          let colored = 0;
          for (let i = 0; i < data.length; i += 4) {
            const rgb = [data[i], data[i + 1], data[i + 2]];
            if (Math.max(...rgb) > 80 && Math.max(...rgb) - Math.min(...rgb) > 25) colored++;
          }
          assert.ok(colored / (w * h) > .65, `${engine} ${theme} ${width}px at ${time}ms: color field is covered or missing (${colored}/${w*h} colored pixels)`);
          if (index >= 3) fields.push(png.toString('base64'));
        }
        assert.equal(new Set(fields).size, 3, 'each CVD mode changes the rendered colorspace');
      }
    }
    assert.deepEqual(browser.errors, []);
  } finally { await browser.close(); }
});
