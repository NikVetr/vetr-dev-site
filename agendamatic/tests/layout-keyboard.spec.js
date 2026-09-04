import { test, expect } from '@playwright/test';

async function loadFresh(page) {
    await page.goto('/agendamatic/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/agendamatic/');
    await expect(page.locator('.box[data-panel-id]')).toHaveCount(7);
}

test('panel move controls swap and persist without making headers keyboard stops', async ({ page }) => {
    await loadFresh(page);

    await expect(page.locator('.panel-move-button')).toHaveCount(7);
    await expect(page.locator('[data-panel-id="tracker"] .panel-move-button')).toBeVisible();
    expect(await page.locator('[data-panel-id="input"] > .box-header').getAttribute('tabindex')).toBeNull();

    const compactControls = await page.evaluate(() => {
        const exportTitle = document.querySelector('[data-panel-id="export"] > .box-header h3');
        const previousLabel = document.querySelector('#btn-prev-item .next-item-text');
        return {
            exportTitleHeight: exportTitle.getBoundingClientRect().height,
            exportTitleLineHeight: Number.parseFloat(getComputedStyle(exportTitle).lineHeight),
            previousLabelOverflow: previousLabel.scrollWidth - previousLabel.clientWidth,
            previousAccessibleName: document.getElementById('btn-prev-item').getAttribute('aria-label'),
            nextAccessibleName: document.getElementById('btn-next-item').getAttribute('aria-label')
        };
    });
    expect(compactControls.exportTitleHeight).toBeLessThan(compactControls.exportTitleLineHeight * 1.5);
    expect(compactControls.previousLabelOverflow).toBeLessThanOrEqual(0);
    expect(compactControls).toMatchObject({
        previousAccessibleName: 'Previous agenda item',
        nextAccessibleName: 'Next agenda item'
    });

    const tracker = page.locator('[data-panel-id="tracker"]');
    await tracker.evaluate(element => element.style.height = '120px');
    const compactHeader = await tracker.evaluate(element => {
        const header = element.querySelector(':scope > .timeline-header').getBoundingClientRect();
        const title = element.querySelector(':scope > .timeline-header > h3').getBoundingClientRect();
        const controls = element.querySelector(':scope > .timeline-header > .timeline-controls').getBoundingClientRect();
        return {
            panelHeight: element.getBoundingClientRect().height,
            headerLeft: header.left,
            headerRight: header.right,
            titleRight: title.right,
            controlsLeft: controls.left,
            controlsRight: controls.right
        };
    });
    expect(compactHeader.panelHeight).toBeLessThanOrEqual(130);
    expect(compactHeader.titleRight).toBeLessThanOrEqual(compactHeader.controlsLeft);
    expect(compactHeader.controlsLeft).toBeGreaterThanOrEqual(compactHeader.headerLeft);
    expect(compactHeader.controlsRight).toBeLessThanOrEqual(compactHeader.headerRight);
    await tracker.evaluate(element => element.style.removeProperty('height'));

    const inputMove = page.locator('[data-panel-id="input"] .panel-move-button');
    await inputMove.click();
    await expect(page.locator('#panel-move-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel-move-menu')).toBeHidden();

    await inputMove.focus();
    await page.keyboard.press('Enter');
    await expect(inputMove).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#panel-move-menu')).toBeVisible();
    await expect(page.locator('#panel-move-menu')).toHaveAttribute('aria-label', 'Move Input panel to');
    await expect(page.locator('#panel-move-menu [data-slot-id="input"]')).toBeDisabled();

    expect(await page.evaluate(() => document.activeElement?.dataset.slotId)).toBe('export');
    await page.keyboard.press('Enter');
    await expect(page.locator('#panel-move-menu')).toBeHidden();
    await expect(page.locator('.panel-slot-export')).toHaveAttribute('data-panel-id', 'input');
    await expect(page.locator('.panel-layout-announcer')).toContainText('Input moved to the Import / Export position');

    const savedOrder = await page.evaluate(() => JSON.parse(localStorage.getItem('autochair_panel_order_v1')));
    expect(savedOrder.slice(0, 2)).toEqual(['export', 'input']);

    await page.reload();
    await expect(page.locator('.panel-slot-export')).toHaveAttribute('data-panel-id', 'input');
    await expect(page.locator('[data-panel-id="input"] .panel-move-button')).toHaveAttribute(
        'aria-label',
        /currently in the Import \/ Export position/
    );

    await page.locator('#btn-edit-csv').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#bulk-edit-modal')).toHaveClass(/visible/);
    expect(await page.locator('[data-panel-id="input"] .panel-move-button').evaluate(
        element => getComputedStyle(element).touchAction
    )).toBe('none');
});

test('separators expose range metadata and keyboard resizing persists', async ({ page }) => {
    await loadFresh(page);

    const handles = page.locator('.panel-resizer');
    await expect(handles).toHaveCount(8);
    const metadata = await handles.evaluateAll(elements => elements.map(element => ({
        role: element.getAttribute('role'),
        tabIndex: element.tabIndex,
        orientation: element.getAttribute('aria-orientation'),
        minimum: Number(element.getAttribute('aria-valuemin')),
        maximum: Number(element.getAttribute('aria-valuemax')),
        now: Number(element.getAttribute('aria-valuenow')),
        valueText: element.getAttribute('aria-valuetext'),
        disabled: element.getAttribute('aria-disabled'),
        touchAction: getComputedStyle(element).touchAction
    })));
    expect(metadata.every(value => (
        value.role === 'separator' &&
        value.tabIndex === 0 &&
        ['horizontal', 'vertical'].includes(value.orientation) &&
        value.minimum <= value.now &&
        value.now <= value.maximum &&
        value.valueText?.includes('percent') &&
        value.disabled === 'false' &&
        value.touchAction === 'none'
    ))).toBe(true);

    const vertical = page.locator('#resizer-top-main');
    const verticalContainer = page.locator('.top-section');
    await expect(vertical).toHaveAttribute('aria-orientation', 'vertical');
    await vertical.focus();
    await page.keyboard.press('ArrowRight');
    const arrowValue = await verticalContainer.evaluate(
        element => element.style.getPropertyValue('--top-left-width')
    );
    expect(Number.parseFloat(arrowValue)).toBeGreaterThan(0);

    await page.keyboard.press('Home');
    await expect(vertical).toHaveAttribute('aria-valuenow', await vertical.getAttribute('aria-valuemin'));
    await page.keyboard.press('End');
    await expect(vertical).toHaveAttribute('aria-valuenow', await vertical.getAttribute('aria-valuemax'));
    const persistedVertical = await verticalContainer.evaluate(
        element => element.style.getPropertyValue('--top-left-width')
    );

    const horizontal = page.locator('#resizer-main-top');
    await expect(horizontal).toHaveAttribute('aria-orientation', 'horizontal');
    await horizontal.focus();
    await page.keyboard.press('ArrowDown');
    expect(Number.parseFloat(await page.locator('.workspace-panels').evaluate(
        element => element.style.getPropertyValue('--main-top-height')
    ))).toBeGreaterThan(0);

    const savedSplits = await page.evaluate(() => JSON.parse(localStorage.getItem('autochair_layout_splits_v6')));
    expect(savedSplits['--top-left-width']).toBe(persistedVertical);
    expect(savedSplits['--main-top-height']).toMatch(/px$/);

    await page.reload();
    await expect.poll(() => verticalContainer.evaluate(
        element => element.style.getPropertyValue('--top-left-width')
    )).toBe(persistedVertical);
});

test('focused agenda fields retain native text undo', async ({ page }) => {
    await loadFresh(page);
    const name = page.locator('.agenda-row input[data-field="name"]').first();
    const original = await name.inputValue();

    await name.focus();
    await name.press('End');
    await name.pressSequentially(' changed');
    await expect(name).toHaveValue(original + ' changed');
    await name.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(name).toHaveValue(original);

    await name.press('Tab');
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items[0].name;
    })).toBe(original);
});
