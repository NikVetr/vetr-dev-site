import assert from 'node:assert/strict';
import { openPage } from '../landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE || 'chromium');
const session = await openPage('', { engine });
const { page, errors } = session;
const tile = page.locator('.project-card').filter({ has: page.locator('[data-art="intuitions"]') });
try {
  await tile.hover();
  await page.locator('.card-player').waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('.card-player, [data-playing]'));
  assert.equal(await page.locator('.card-player, [data-playing]').count(), 0);

  // Changing preference while the plan is still loading must also cancel the pending start.
  let release = () => {};
  let intercepted = false;
  const gate = new Promise((resolve) => { release = () => resolve(undefined); });
  await page.route('**/hypercube/plans/k4.json', async (/** @type {any} */ route) => {
    intercepted = true;
    await gate;
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Reload with the pointer outside the card, then enter after its listeners are ready.
  await page.mouse.move(0, 0);
  await page.reload();
  await tile.hover();
  for (let n = 0; n < 50 && !intercepted; n++) await page.waitForTimeout(100);
  assert.ok(intercepted, 'the delayed plan request was reached');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  release();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('.card-player, [data-playing]').count(), 0);
  await page.unroute('**/hypercube/plans/k4.json');

  for (const [width, height] of [[390, 844], [844, 390], [640, 900], [768, 1024], [1000, 900], [1200, 900], [1366, 768], [1440, 900], [1700, 1000], [1920, 1080], [2560, 1080], [720, 450], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(80);
    const result = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#projects > .grid > li')];
      const sorted = [...cards].sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      });
      let internalGaps = 0, bottomGaps = 0;
      // Packing stays dense even where the category contours interlock.
      for (const grid of document.querySelectorAll('#projects > .grid')) {
        const cells = new Set();
        for (const card of grid.children) {
          const style = getComputedStyle(card);
          const row = parseInt(style.gridRowStart), column = parseInt(style.gridColumnStart);
          const rows = Number(style.getPropertyValue('--h')) || 1, columns = Number(style.getPropertyValue('--w')) || 1;
          for (let y = row; y < row + rows; y++) for (let x = column; x < column + columns; x++) cells.add(`${x},${y}`);
        }
        const cols = Number(getComputedStyle(grid).getPropertyValue('--cols'));
        const lastRow = Math.max(...[...cells].map(cell => Number(cell.split(',')[1])));
        for (let x = 1; x <= cols; x++) if (!cells.has(`${x},${lastRow}`)) bottomGaps++;
        for (const cell of cells) {
          const [x, y] = cell.split(',').map(Number);
          for (let row = 1; row < y; row++) if (!cells.has(`${x},${row}`)) internalGaps++;
        }
      }
      const fullCards = cards.filter(card => {
        const r = card.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      }).length;
      const clipped = cards.filter(card => {
        const r = card.getBoundingClientRect();
        return [...card.querySelectorAll('h3, p, time')].some(child => {
          const c = child.getBoundingClientRect();
          return c.bottom > r.bottom + 1 || c.right > r.right + 1 || child.scrollWidth > child.clientWidth + 1;
        });
      }).map(card => card.querySelector('h3')?.textContent);
      const paths = /** @type {SVGGeometryElement[]} */ ([...document.querySelectorAll('.cluster-outlines path')]);
      const contourErrors = [];
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        for (const path of paths) {
          const matrix = path.getScreenCTM();
          if (!matrix) throw new Error('Missing SVG screen coordinates');
          for (const [x, y] of [[r.x + r.width / 2, r.y + r.height / 2], [r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]]) {
            const inside = path.isPointInFill(new DOMPoint(x, y).matrixTransform(matrix.inverse()));
            if (inside !== (path.getAttribute('data-category') === card.getAttribute('data-category'))) contourErrors.push(card.querySelector('h3')?.textContent);
          }
        }
      }
      const labels = [...document.querySelectorAll('.cluster-label')];
      const labelOverlaps = labels.filter(label => {
        const r = label.getBoundingClientRect();
        return cards.some(card => {
          const c = card.getBoundingClientRect();
          return r.left < c.right - 1 && r.right > c.left + 1 && r.top < c.bottom - 1 && r.bottom > c.top + 1;
        });
      }).map(label => label.textContent);
      const wall = document.querySelector('#projects > .grid');
      if (!wall) throw new Error('Missing landing grid');
      const columns = Number(getComputedStyle(wall).getPropertyValue('--cols'));
      return { overflow: document.documentElement.scrollWidth - innerWidth, order: cards.every((card, i) => card === sorted[i]), internalGaps, bottomGaps, fullCards, clipped, contourErrors, labelOverlaps, labels: labels.length, paths: paths.length, columns };
    });
    assert.ok(result.overflow <= 1, `${width}×${height}: overflow ${result.overflow}`);
    assert.ok(result.order, `${width}×${height}: DOM and visual order differ`);
    assert.equal(result.internalGaps, 0, `${width}×${height}: internal gaps in the wall`);
    assert.equal(result.bottomGaps, 0, `${width}×${height}: mosaic bottom is not flush`);
    assert.deepEqual(result.clipped, [], `${width}×${height}: clipped card text`);
    assert.equal(result.paths, 3, `${width}×${height}: missing category contours`);
    assert.deepEqual(result.contourErrors, [], `${width}×${height}: contours must surround only their own cards`);
    assert.deepEqual(result.labelOverlaps, [], `${width}×${height}: category labels cover cards`);
    if (height > 500 && result.columns >= 4) assert.equal(result.labels, 3, `${width}×${height}: fragmented desktop clusters`);
    const minimumFullCards = width === 1366 ? 4 : width === 1440 ? 6 : width === 1920 ? 8 : 0;
    assert.ok(result.fullCards >= minimumFullCards, `${width}×${height}: only ${result.fullCards} full cards visible`);
    if ([390, 1366, 1440, 1920].includes(width)) {
      const photo = page.locator('[data-art="photomosaic"]');
      await photo.scrollIntoViewIfNeeded();
      const image = photo.locator('svg > image');
      await image.waitFor();
      const bounds = await image.boundingBox();
      assert.ok(bounds && bounds.width >= 150 && bounds.height >= 112, `${width}×${height}: mosaic image is too small to inspect`);
    }
  }
  // Section tints remain distinct when the shared theme changes, without rebuilding paths.
  /** @type {string[][]} */
  const fills = [];
  for (const theme of ['light', 'dark']) {
    const colors = await page.evaluate((/** @type {string} */ theme) => {
      document.documentElement.dataset.theme = theme;
      return [...document.querySelectorAll('.cluster-outlines path')].map(path => getComputedStyle(path).fill);
    }, theme);
    assert.equal(new Set(colors).size, 3, `${theme}: section backgrounds must be distinct`);
    assert.ok(colors.every((/** @type {string} */ color) => color !== 'none' && color !== 'transparent'), `${theme}: missing section fill`);
    fills.push(colors);
  }
  assert.ok(fills[0].every((/** @type {string} */ color, /** @type {number} */ i) => color !== fills[1][i]), 'section fills follow the theme');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  assert.equal(await page.locator('h1').textContent(), 'vetr.dev');
  assert.equal(await page.locator('.project-card').count(), 17);
  assert.equal(await page.locator('#projects > .grid').count(), 1);
  assert.equal(await page.locator('#intro .tagline').textContent(), 'Tools for statistics, graphics, and everyday tasks.');
  assert.equal(await page.locator('.theme-links').count(), 0);
  assert.equal(await page.locator('#projects a[href="/forecast-calibration/"]').count(), 0);
  for (const id of ['statistics', 'art', 'everyday']) {
    assert.ok(await page.locator(`#category-${id}`).textContent(), 'each contour retains its accessible category name');
  }
  assert.equal(await page.locator('[data-mosaic-key=ceo-salary-benchmark]').getAttribute('data-category'), 'everyday');
  assert.equal(await page.locator('[data-category=stats-art]').count(), 0);
  assert.equal(await page.locator('[data-mosaic-key=b64]').getAttribute('data-size'), '2x2');
  const focusedCard = page.locator('a[href="/ceo-salary-benchmark/"]');
  await focusedCard.focus();
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForTimeout(80);
  assert.ok(await focusedCard.evaluate((/** @type {HTMLElement} */ el) => el === document.activeElement), 'resizing a later group preserves keyboard focus');
  await page.locator('[data-art="b64"]').scrollIntoViewIfNeeded();
  await page.locator('[data-art="b64"] svg').waitFor();
  assert.ok((await page.locator('[data-art="b64"]').textContent()).includes('https://vetr.dev/'));
  assert.equal(await page.locator('a[href="/b64/"]').count(), 1);
  await page.locator('[data-art="ceo-salary-benchmark"]').scrollIntoViewIfNeeded();
  await page.locator('[data-art="ceo-salary-benchmark"] svg').first().waitFor();
  assert.equal(await page.locator('a[href="/ceo-salary-benchmark/"]').count(), 1);
  assert.ok(!(await page.locator('[data-art="ceo-salary-benchmark"]').textContent()).includes('Rethink Priorities'));
  assert.deepEqual(errors, []);
  console.log('Landing: reduced motion, 13 resize states, flush packing/reading order, category contour coverage, clear labels, density, text fit, accessible categories and focus pass.');
} finally {
  await session.close();
}
