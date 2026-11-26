// The editor header keeps every control visible or in a menu, without overlap or hidden overflow.
// BROWSER_ENGINE=webkit runs it in WebKit; screenshots go to the ignored tmp/output/alphabet-header/.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'} */ (process.env.BROWSER_ENGINE || 'chromium');
// The editor's globals are script-scoped, so page code that uses them is passed as strings.
const output = new URL('../../tmp/output/alphabet-header/', import.meta.url);
await mkdir(output, { recursive: true });

// Above 700 px the header is one line that must fit, short windows included.
// Phone headers, including short landscape below 701 px, scroll their second part by design.
const fitting = [701, 768, 900, 1024, 1280, 1366, 1440, 1600, 1920, 2560].map((width) => [width, 900]).concat([[844, 390], [1280, 560]]);
const scrolling = [[320, 700], [390, 844], [667, 375]];

// Each header action and the places it may appear; at least one must be reachable at every size.
/** @type {Record<string, string[]>} */
const actions = {
  'Editor switch': ['#editor-switch'],
  'Variant 1': ['[data-global-variant="0"]'],
  'Variant 2': ['[data-global-variant="1"]'],
  'Variant 3': ['[data-global-variant="2"]'],
  'Align left': ['[data-align-axis="x"][data-align-mode="min"]'],
  'Align horizontal center': ['[data-align-axis="x"][data-align-mode="mean"]'],
  'Align right': ['[data-align-axis="x"][data-align-mode="max"]'],
  'Align top': ['[data-align-axis="y"][data-align-mode="min"]'],
  'Align vertical center': ['[data-align-axis="y"][data-align-mode="mean"]'],
  'Align bottom': ['[data-align-axis="y"][data-align-mode="max"]'],
  'Distribute horizontally': ['#distribute-x'],
  'Distribute vertically': ['#distribute-y'],
  'Export JSON': ['#header-export-json', '#export-json'],
  'Import JSON': ['#header-import-json', '#import-json'],
  'Copy JSON': ['#copy-current-json', '#copy-letter-json'],
  Undo: ['#undo-action'],
  Redo: ['#redo-action'],
  History: ['#history-jump'],
  Reset: ['#reset-app'],
  'Active letter': ['#active-letter-label'],
};

// Serialized into the page: visible header pieces, and any two that intersect.
// Pieces in the scrolling right side count only where that side shows them.
function headerLayout() {
  const right = /** @type {HTMLElement} */ (document.querySelector('.header-right'));
  const view = right.getBoundingClientRect();
  const pieces = [...document.querySelectorAll('.menu-bar #editor-switch, .menu-bar summary, .header-right button, .header-right select, .header-right .header-word, .header-right .layout-section-label, #active-letter-label')]
    .filter((node) => !node.closest('.menu-popover'))
    .map((node) => {
      const box = node.getBoundingClientRect();
      if (!right.contains(node)) return { node, box };
      const left = Math.max(box.left, view.left), top = Math.max(box.top, view.top);
      return { node, box: new DOMRect(left, top, Math.min(box.right, view.right) - left, Math.min(box.bottom, view.bottom) - top) };
    })
    .filter(({ box }) => box.width > 1 && box.height > 1);
  const name = (/** @type {Element} */ node) => node.id || node.getAttribute('title') || node.textContent?.trim() || node.className;
  const overlaps = [];
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const a = pieces[i].box, b = pieces[j].box;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) {
        overlaps.push(`${name(pieces[i].node)} × ${name(pieces[j].node)}`);
      }
    }
  }
  return { overlaps, scrollWidth: right.scrollWidth, clientWidth: right.clientWidth, pageOverflow: document.documentElement.scrollWidth > innerWidth };
}

// Serialized into the page: whether a control is on screen, inside its clipping header or menu, and on top.
function reachable(/** @type {string} */ selector) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  const style = getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden' || node.closest('[hidden]')) return false;
  const box = node.getBoundingClientRect();
  if (box.width < 4 || box.height < 4) return false;
  const clip = /** @type {Element} */ (node.closest('.menu-popover, .header-right') ?? document.documentElement).getBoundingClientRect();
  const x = box.left + box.width / 2, y = box.top + box.height / 2;
  if (x < Math.max(0, clip.left) || x > Math.min(innerWidth, clip.right) || y < Math.max(0, clip.top) || y > Math.min(innerHeight, clip.bottom)) return false;
  const hit = document.elementFromPoint(x, y);
  return Boolean(hit && (node === hit || node.contains(hit)));
}

/**
 * Returns where each action is reachable: "header", or the name of the menu that holds it.
 * @param {any} page Playwright page
 */
async function reachableActions(page) {
  /** @type {Map<string, string>} */
  const found = new Map();
  const check = async (/** @type {string} */ where) => {
    for (const [action, selectors] of Object.entries(actions)) {
      for (const selector of selectors) {
        if (found.has(action)) break;
        const control = page.locator(selector);
        const place = await control.evaluate((/** @type {Element} */ node) => node.closest('.menu')?.querySelector('summary')?.textContent ?? 'header');
        if (place !== where) continue;
        await control.evaluate((/** @type {Element} */ node) => node.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
        if (await page.evaluate(reachable, selector)) found.set(action, where);
      }
    }
  };
  await check('header');
  for (const menu of await page.locator('.menu summary').allTextContents()) {
    await page.locator('.menu summary').filter({ hasText: new RegExp(`^${menu}$`) }).click();
    const popover = await page.locator('.menu[open] .menu-popover').boundingBox();
    const viewport = page.viewportSize();
    assert.ok(popover && viewport && popover.x >= 0 && popover.x + popover.width <= viewport.width + 0.5, `${menu} menu stays on screen`);
    await check(menu);
    await page.evaluate('closeMenus()');
  }
  return found;
}

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const run = await openPage('motrpac-alphabet/', { width: 1440, height: 900, scheme, engine });
  try {
    const { page, errors } = run;
    await page.waitForSelector('#shape-layer path');
    // Fill the history with the longest labels the editor writes.
    await page.evaluate(`for (let i = 0; i < 99; i += 1) {
      state.gridSize = 5 + i;
      saveState(i % 2 ? 'Polish stage' : 'Paste shapes');
    }`);

    for (const [width, height] of [...fitting, ...scrolling]) {
      await page.setViewportSize({ width, height });
      // The align tools move on the media-query change event, which fires with the next frame.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const label = `${width}×${height} ${scheme} ${engine}`;
      const layout = await page.evaluate(headerLayout);
      assert.deepEqual(layout.overlaps, [], `header pieces overlap at ${label}`);
      assert.equal(layout.pageOverflow, false, `page fits horizontally at ${label}`);
      const fits = width > 700;
      if (fits) assert.ok(layout.scrollWidth <= layout.clientWidth, `header right side fits without scrolling at ${label} (${layout.scrollWidth} > ${layout.clientWidth})`);

      const found = await reachableActions(page);
      const missing = Object.keys(actions).filter((action) => !found.has(action));
      if (fits) {
        assert.deepEqual(missing, [], `every header action is reachable at ${label}`);
        assert.equal(found.get('Undo'), 'header', `Undo stays in the header at ${label}`);
        assert.equal(found.get('Redo'), 'header', `Redo stays in the header at ${label}`);
        // The history menu shows whole labels: the select is at least as wide as its own content.
        await page.locator('.menu summary').filter({ hasText: /^Edit$/ }).click();
        const history = await page.locator('#history-jump').evaluate((/** @type {HTMLSelectElement} */ select) => {
          const fitted = select.getBoundingClientRect().width;
          select.style.width = 'max-content';
          const natural = select.getBoundingClientRect().width;
          select.style.width = '';
          return { fitted, natural };
        });
        assert.ok(history.fitted >= history.natural - 0.5, `history labels are not cut off at ${label} (${history.fitted} < ${history.natural})`);
        await page.screenshot({ path: fileURLToPath(new URL(`edit-menu-${width}-${scheme}-${engine}.png`, output)), clip: { x: 0, y: 0, width, height: 460 } });
        await page.evaluate('closeMenus()');
      }
      await page.screenshot({ path: fileURLToPath(new URL(`header-${width}x${height}-${scheme}-${engine}.png`, output)), clip: { x: 0, y: 0, width, height: Math.min(height, 110) } });
    }
    assert.deepEqual(errors, []);
    console.log(`Header fits and keeps every action reachable (${scheme}, ${engine}).`);
  } finally {
    await run.close();
  }
}

// Controls that move into menus on tablets work from the keyboard and by touch.
for (const touch of [false, true]) {
  const run = await openPage('motrpac-alphabet/', { width: 820, height: 1180, engine, touch });
  try {
    const { page, errors } = run;
    await page.waitForSelector('#shape-layer path');
    await page.evaluate('currentShapes().slice(0, 3).forEach((shape) => state.selectedIds.add(shape.id)); renderAll();');
    const shapeMenu = page.locator('#shape-menu');
    const lastLabel = () => page.evaluate('historyState.entries[historyState.index].label');
    const isOpen = () => shapeMenu.evaluate((/** @type {HTMLDetailsElement} */ menu) => menu.open);
    if (touch) {
      await shapeMenu.locator('summary').tap();
      await page.locator('#distribute-x').tap();
      assert.equal(await lastLabel(), 'Distribute X');
      assert.equal(await isOpen(), false, 'tapping a menu tool closes the menu');
      await page.locator('.menu summary').filter({ hasText: /^Edit$/ }).tap();
      await page.locator('#reset-app').tap();
      assert.equal(await lastLabel(), 'Reset');
    } else {
      await shapeMenu.locator('summary').focus();
      await page.keyboard.press('Enter');
      for (let i = 0; i < 12 && !(await page.evaluate(() => document.activeElement?.matches('[data-align-mode="min"][data-align-axis="y"]'))); i += 1) {
        await page.keyboard.press('Tab');
      }
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('title')), 'Align top', 'Tab reaches the align tools in the Shape menu');
      await page.keyboard.press('Enter');
      assert.equal(await lastLabel(), 'Align Y min');
      assert.equal(await isOpen(), false, 'a menu tool closes the menu');
      await page.locator('.menu summary').filter({ hasText: /^Edit$/ }).focus();
      await page.keyboard.press('Enter');
      for (let i = 0; i < 10 && !(await page.evaluate(() => document.activeElement?.id === 'history-jump')); i += 1) {
        await page.keyboard.press('Tab');
      }
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'history-jump', 'Tab reaches the history list in the Edit menu');
      await page.locator('#history-jump').selectOption('0');
      assert.equal(await page.evaluate('historyState.index'), 0);
    }
    assert.deepEqual(errors, []);
    console.log(`Tablet menu tools work by ${touch ? 'touch' : 'keyboard'} (${engine}).`);
  } finally {
    await run.close();
  }
}
