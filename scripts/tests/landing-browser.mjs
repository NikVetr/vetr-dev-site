import assert from 'node:assert/strict';
import { openPage } from '../landing-art/browser.mjs';

const session = await openPage('');
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
  await page.reload();
  await tile.hover();
  await page.waitForTimeout(100);
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
      const cards = [...document.querySelectorAll('.grid > li')];
      const sorted = [...cards].sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      });
      let internalGaps = 0;
      // Each thematic section has its own grid coordinates; merging them could conceal gaps.
      for (const grid of document.querySelectorAll('.grid')) {
        const cells = new Set();
        for (const card of grid.children) {
          const style = getComputedStyle(card);
          const row = parseInt(style.gridRowStart), column = parseInt(style.gridColumnStart);
          const rows = Number(style.getPropertyValue('--h')) || 1, columns = Number(style.getPropertyValue('--w')) || 1;
          for (let y = row; y < row + rows; y++) for (let x = column; x < column + columns; x++) cells.add(`${x},${y}`);
        }
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
      return { overflow: document.documentElement.scrollWidth - innerWidth, order: cards.every((card, i) => card === sorted[i]), internalGaps, fullCards, clipped };
    });
    assert.ok(result.overflow <= 1, `${width}×${height}: overflow ${result.overflow}`);
    assert.ok(result.order, `${width}×${height}: DOM and visual order differ`);
    assert.equal(result.internalGaps, 0, `${width}×${height}: internal gaps in the wall`);
    assert.deepEqual(result.clipped, [], `${width}×${height}: clipped card text`);
    const minimumFullCards = width === 1366 ? 4 : width === 1440 ? 6 : width === 1920 ? 8 : 0;
    assert.ok(result.fullCards >= minimumFullCards, `${width}×${height}: only ${result.fullCards} full cards visible`);
  }
  assert.equal(await page.locator('h1').textContent(), 'vetr.dev');
  assert.equal(await page.locator('.project-card').count(), 18);
  assert.equal(await page.locator('.theme-group').count(), 3);
  for (const id of ['design-make', 'plan-communicate', 'explore-compare']) {
    await page.locator(`.theme-links a[href="#${id}"]`).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), id);
    await page.keyboard.press('Tab');
    assert.ok(await page.locator(`#${id} .project-card`).first().evaluate((/** @type {HTMLElement} */ el) => el === document.activeElement));
  }
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
  console.log('Landing: reduced motion, 13 resize states, per-group packing/reading order, density, unclipped text, theme navigation, resize focus and both new cards pass.');
} finally {
  await session.close();
}
