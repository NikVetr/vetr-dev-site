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

  for (const [width, height] of [[390, 844], [844, 390], [768, 1024], [1000, 900], [1440, 900], [1700, 1000], [2000, 1080], [2560, 1080], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(80);
    const result = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.grid > li')];
      const sorted = [...cards].sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      });
      const cells = new Set();
      let internalGaps = 0;
      for (const card of cards) {
        const style = getComputedStyle(card);
        const row = parseInt(style.gridRowStart), column = parseInt(style.gridColumnStart);
        const rows = Number(style.getPropertyValue('--h')) || 1, columns = Number(style.getPropertyValue('--w')) || 1;
        for (let y = row; y < row + rows; y++) for (let x = column; x < column + columns; x++) cells.add(`${x},${y}`);
      }
      for (const cell of cells) {
        const [x, y] = cell.split(',').map(Number);
        for (let row = 1; row < y; row++) if (!cells.has(`${x},${row}`)) internalGaps++;
      }
      return { overflow: document.documentElement.scrollWidth - innerWidth, order: cards.every((card, i) => card === sorted[i]), internalGaps };
    });
    assert.ok(result.overflow <= 1, `${width}×${height}: overflow ${result.overflow}`);
    assert.ok(result.order, `${width}×${height}: DOM and visual order differ`);
    assert.equal(result.internalGaps, 0, `${width}×${height}: internal gaps in the wall`);
  }
  await page.locator('[data-art="b64"]').scrollIntoViewIfNeeded();
  await page.locator('[data-art="b64"] svg').waitFor();
  assert.ok((await page.locator('[data-art="b64"]').textContent()).includes('https://vetr.dev/'));
  assert.equal(await page.locator('a[href="/b64/"]').count(), 1);
  await page.locator('[data-art="ceo-salary-benchmark"]').scrollIntoViewIfNeeded();
  await page.locator('[data-art="ceo-salary-benchmark"] svg').first().waitFor();
  assert.equal(await page.locator('a[href="/ceo-salary-benchmark/"]').count(), 1);
  assert.ok(!(await page.locator('[data-art="ceo-salary-benchmark"]').textContent()).includes('Rethink Priorities'));
  assert.deepEqual(errors, []);
  console.log('Landing: reduced-motion cancellation, nine resize states, reading order, gap-free packing and both new cards pass.');
} finally {
  await session.close();
}
