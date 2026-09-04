import { test, expect } from '@playwright/test';

async function loadFresh(page) {
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
        return {
            exportTitleHeight: exportTitle.getBoundingClientRect().height,
            exportTitleLineHeight: Number.parseFloat(getComputedStyle(exportTitle).lineHeight),
            previousAccessibleName: document.getElementById('btn-prev-item').getAttribute('aria-label'),
            nextAccessibleName: document.getElementById('btn-next-item').getAttribute('aria-label')
        };
    });
    expect(compactControls.exportTitleHeight).toBeLessThan(compactControls.exportTitleLineHeight * 1.5);
    expect(compactControls).toMatchObject({
        previousAccessibleName: 'Previous agenda item',
        nextAccessibleName: 'Start meeting'
    });

    const inputMove = page.locator('[data-panel-id="input"] .panel-move-button');
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

    await page.reload();
    await expect(page.locator('.panel-slot-export')).toHaveAttribute('data-panel-id', 'input');
    await expect(page.locator('[data-panel-id="input"] .panel-move-button')).toHaveAttribute(
        'aria-label',
        /currently in the Import \/ Export position/
    );

    await page.locator('#btn-edit-csv').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#bulk-edit-modal')).toHaveClass(/visible/);
});

test('meeting controls explain each phase and stay contained', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadFresh(page);
    await page.evaluate(async () => {
        const { updateSettings } = await import('/agendamatic/js/state.js');
        const start = new Date(Date.now() + 30 * 60_000);
        updateSettings({
            startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
        });
    });

    const controls = page.locator('.next-item-controls');
    const primary = page.locator('#btn-next-item');
    await expect(controls).toHaveAttribute('data-phase', 'idle');
    await expect(page.locator('#btn-prev-item')).toBeHidden();
    await expect(primary).toHaveAccessibleName('Start meeting');
    await expect(page.locator('.current-status-label')).toHaveText('MEETING STARTS IN');
    await expect(page.locator('#status-display .ticker-on-time')).toHaveText('NOT STARTED');
    await expect(page.locator('#status-display .status-display')).toHaveRole('status');
    await expect(page.locator('.current-status-display')).toHaveRole('status');
    await expect(page.locator('#status-display .ticker-container')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.current-status-ticker')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('.current-status-display').getAttribute('aria-label')).toMatch(
        /meeting starts in \d+ minutes/
    );

    const idleGeometry = await page.evaluate(() => {
        const controls = document.querySelector('.next-item-controls');
        const container = controls.getBoundingClientRect();
        const button = document.getElementById('btn-next-item').getBoundingClientRect();
        return {
            widthDifference: Math.abs(container.width - button.width),
            leftDifference: Math.abs(container.left - button.left),
            horizontalOverflow: controls.scrollWidth - controls.clientWidth,
            logoVisible: getComputedStyle(document.getElementById('next-item-logo-video')).display !== 'none'
        };
    });
    expect(idleGeometry.widthDifference).toBeLessThan(1);
    expect(idleGeometry.leftDifference).toBeLessThan(1);
    expect(idleGeometry.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(idleGeometry.logoVisible).toBe(true);

    const popupPromise = page.waitForEvent('popup');
    await page.locator('#btn-popout').click();
    const popup = await popupPromise;
    const popoutAgendaStatus = popup.locator('#popout-overall .status-display');
    const popoutCurrentStatus = popup.locator('#popout-current .current-status-display');
    const popoutPrimary = popup.locator('#btn-popout-next');
    await expect(popoutAgendaStatus).toHaveRole('status');
    await expect(popoutAgendaStatus).toHaveAccessibleName('Agenda status: meeting not started');
    await expect(popoutCurrentStatus).toHaveAccessibleName(/meeting starts in \d+ minutes/);

    await popup.keyboard.press('Space');
    await expect(controls).toHaveAttribute('data-phase', 'running');
    await expect(primary).toHaveAccessibleName('Next agenda item');
    await expect(page.locator('#btn-prev-item')).toBeVisible();
    await expect(page.locator('.current-status-label')).toContainText('TIME LEFT IN CURRENT ITEM');
    await expect(popoutAgendaStatus).toHaveAccessibleName('Agenda status: on time');
    await expect(popoutCurrentStatus).toHaveAccessibleName(/left on Welcome/);
    await expect(popoutPrimary).toHaveAccessibleName('Next agenda item');

    const runningGeometry = await page.evaluate(() => {
        const container = document.querySelector('.next-item-controls');
        const buttons = [...container.querySelectorAll('button')];
        const allContent = [...container.querySelectorAll('.next-item-text, .spacebar-icon, video')];
        const contentFits = allContent.every(element => {
            const button = element.closest('button').getBoundingClientRect();
            const rect = element.getBoundingClientRect();
            return rect.left >= button.left - 1 && rect.right <= button.right + 1 &&
                rect.top >= button.top - 1 && rect.bottom <= button.bottom + 1 &&
                element.scrollWidth <= element.clientWidth;
        });
        return {
            horizontalOverflow: container.scrollWidth - container.clientWidth,
            buttonsFit: buttons.every(button => button.getBoundingClientRect().right <= container.getBoundingClientRect().right + 1),
            contentFits,
            previousLogoVisible: getComputedStyle(document.getElementById('prev-item-logo-video')).display !== 'none',
            nextLogoVisible: getComputedStyle(document.getElementById('next-item-logo-video')).display !== 'none'
        };
    });
    expect(runningGeometry).toEqual({
        horizontalOverflow: 0,
        buttonsFit: true,
        contentFits: true,
        previousLogoVisible: true,
        nextLogoVisible: true
    });

    await page.locator('#btn-stop').click();
    await expect(controls).toHaveAttribute('data-phase', 'paused');
    await expect(primary).toHaveAccessibleName('Resume meeting');
    await expect(popoutCurrentStatus).toHaveAccessibleName(/paused; .* on Welcome/);
    await expect(popoutPrimary).toHaveAccessibleName('Resume meeting');
    await page.keyboard.press('Space');
    await expect(controls).toHaveAttribute('data-phase', 'running');

    await page.evaluate(async () => {
        const { updateTracker } = await import('/agendamatic/js/state.js');
        updateTracker({ overallDeltaMinutes: 2 });
    });
    await expect(page.locator('#status-display .status-display')).toHaveAttribute('aria-label', /behind/);
    await page.evaluate(async () => {
        const { updateTracker } = await import('/agendamatic/js/state.js');
        updateTracker({ overallDeltaMinutes: -2 });
    });
    await expect(page.locator('#status-display .status-display')).toHaveAttribute('aria-label', /ahead/);

    await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.getState().items.forEach(item => state.updateItem(item.id, { locked: false }));
    });
    for (let index = 0; index < 5; index += 1) await primary.click();
    await expect(controls).toHaveAttribute('data-phase', 'completed');
    await expect(primary).toHaveAccessibleName('Meeting complete');
    await expect(primary).toBeDisabled();
    await expect(popoutCurrentStatus).toHaveAccessibleName('Current status: meeting complete');
    await expect(popoutPrimary).toHaveAccessibleName('Meeting complete');
    await page.keyboard.press('Backspace');
    await expect(controls).toHaveAttribute('data-phase', 'paused');
    await expect(primary).toHaveAccessibleName('Resume meeting');
    await popup.close();
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
