// node --test layout-gui/tests/keyboard.mjs
// Reuses the site's browser helper; install Playwright in a tool folder or set PLAYWRIGHT.
import assert from 'node:assert/strict';
import test from 'node:test';
import { openPage } from '../../scripts/landing-art/browser.mjs';

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
test(`figure shortcuts stay in the canvas while Tab reaches fields, Copy and help at ${viewport.width} × ${viewport.height}`, async () => {
    const app = await openPage('layout-gui/', viewport);
    const { page } = app;
    try {
        const canvas = page.locator('#canvas');
        const box = await canvas.boundingBox();
        assert.ok(box);
        if (viewport.height === 390) {
            assert.ok(box.height >= 240, 'short landscape retains useful canvas height');
            assert.ok(box.y + box.height <= viewport.height, 'the full canvas stays on screen');
        }
        await canvas.dblclick({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
        await canvas.dblclick({ position: { x: box.width * 0.6, y: box.height * 0.6 } });
        const snapshot = () => page.evaluate(async () => {
            const { state } = await import(new URL('modules/state.js', location.href).href);
            return { rects: state.rects, selected: state.stickyFocus, mod: state.modLatch };
        });
        const focused = () => page.evaluate(() => document.activeElement?.id);
        /** @param {string} id @param {boolean} [backwards] */
        const tabTo = async (id, backwards = false) => {
            for (let i = 0; i < 70; i++) {
                await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
                if (await focused() === id) return;
            }
            assert.fail(`Cannot reach #${id} by ${backwards ? 'Shift+Tab' : 'Tab'}`);
        };

        assert.equal((await snapshot()).rects.length, 2);
        assert.equal(await focused(), 'canvas', 'pointer editing gives the canvas keyboard focus');
        await page.keyboard.press('Escape');
        await page.keyboard.press('PageDown');
        assert.equal((await snapshot()).selected, 0);
        await page.keyboard.press('PageDown');
        assert.equal((await snapshot()).selected, 1);
        await page.keyboard.press('PageUp');
        assert.equal((await snapshot()).selected, 0);

        await page.keyboard.press('Tab');
        assert.notEqual(await focused(), 'canvas', 'Tab leaves the canvas');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await focused(), 'canvas', 'Shift+Tab returns to the canvas');
        await tabTo('rows', true);
        const beforeFieldEdit = await snapshot();
        const oldRows = await page.locator('#rows').inputValue();
        await page.keyboard.press('ArrowUp');
        assert.equal(await page.locator('#rows').inputValue(), String(Number(oldRows) + 1));
        assert.deepEqual((await snapshot()).rects, beforeFieldEdit.rects, 'numeric arrows do not move a panel');
        await page.keyboard.press('Control+z');
        assert.deepEqual((await snapshot()).rects, beforeFieldEdit.rects, 'field Undo does not undo the layout');

        await tabTo('copyBtn');
        assert.equal(await focused(), 'copyBtn');
        await tabTo('helpBtn', true);
        const beforeHelp = await snapshot();
        await page.keyboard.press('Enter');
        assert.equal(await focused(), 'helpClose');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Control+z');
        await page.keyboard.press('m');
        assert.deepEqual(await snapshot(), beforeHelp, 'help controls do not edit the canvas');
        await page.keyboard.press('Escape');
        assert.equal(await focused(), 'helpBtn', 'closing help returns to the button');

        await tabTo('canvas');
        const beforeMove = await snapshot();
        await page.keyboard.press('ArrowRight');
        const moved = await snapshot();
        assert.equal(moved.rects[0].c0, beforeMove.rects[0].c0 + 1);
        assert.equal(moved.rects[0].c1, beforeMove.rects[0].c1 + 1);
        await page.keyboard.press('Backspace');
        assert.equal((await snapshot()).rects.length, 1, 'deletion still works within the canvas');
        await page.keyboard.press('Control+z');
        assert.deepEqual((await snapshot()).rects, moved.rects, 'canvas Undo still restores the deleted panel');
        await page.keyboard.press('h');
        assert.equal(await focused(), 'helpClose');
        await page.keyboard.press('Escape');
        assert.equal(await focused(), 'canvas', 'H then Escape returns to the editor');
        assert.equal(await canvas.getAttribute('tabindex'), '0');
        assert.equal(await canvas.evaluate((/** @type {HTMLElement} */ el) => getComputedStyle(el).outlineStyle), 'solid');
        assert.deepEqual(app.errors, []);
    } finally {
        await app.close();
    }
});
}

test('stacked figure panels keep the toolbox and code in normal page flow', async () => {
    const app = await openPage('layout-gui/', { width: 390, height: 844 });
    try {
        for (const [width, height] of [[390, 844], [768, 1024], [720, 450]]) {
            await app.page.setViewportSize({ width, height });
            await app.page.waitForFunction(() => {
                const sidebar = document.querySelector('.sidebar');
                return sidebar && sidebar.clientHeight >= sidebar.scrollHeight - 2;
            });
            const layout = await app.page.evaluate(() => {
                const sidebar = /** @type {HTMLElement} */ (document.querySelector('.sidebar'));
                const main = /** @type {HTMLElement} */ (document.querySelector('.main'));
                const output = /** @type {HTMLElement} */ (document.querySelector('.coderenderer'));
                const footer = /** @type {HTMLElement} */ (document.querySelector('footer'));
                return {
                    overflow: document.documentElement.scrollWidth - innerWidth,
                    sidebarHeight: sidebar.clientHeight,
                    mainScroll: main.scrollHeight - main.clientHeight,
                    outputHeight: output.clientHeight,
                    outputBeforeFooter: output.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top,
                };
            });
            assert.equal(layout.overflow, 0);
            assert.equal(layout.mainScroll, 0, 'the page scrolls, instead of nested canvas/control scroll areas');
            assert.ok(layout.sidebarHeight > 300, 'all toolbox controls have room');
            assert.ok(layout.outputHeight > 300, 'code remains visible below its settings');
            assert.equal(layout.outputBeforeFooter, true);
        }
        assert.deepEqual(app.errors, []);
    } finally {
        await app.close();
    }
});
