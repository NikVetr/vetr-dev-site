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

    const controlLabels = await page.evaluate(() => ({
        previousAccessibleName: document.getElementById('btn-prev-item').getAttribute('aria-label'),
        nextAccessibleName: document.getElementById('btn-next-item').getAttribute('aria-label')
    }));
    expect(controlLabels).toEqual({
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

test('current item theme updates preserve its moved layout slot', async ({ page }) => {
    await loadFresh(page);
    const panel = page.locator('[data-panel-id="current-item"]');
    await panel.locator('.panel-move-button').click();
    await page.locator('#panel-move-menu [data-slot-id="input"]').click();

    await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.updateItem(state.getState().items[0].id, { themeColor: 2 });
    });
    await expect(panel).toHaveClass(/panel-slot-input/);
    await expect(panel).toHaveClass(/theme-2/);

    await page.locator('#resizer-top-main').focus();
    await page.keyboard.press('Home');
    const geometry = await panel.evaluate(element => ({
        width: element.getBoundingClientRect().width,
        minimum: Number.parseFloat(getComputedStyle(element).getPropertyValue('--panel-min-inline'))
    }));
    expect(geometry.width).toBeGreaterThanOrEqual(geometry.minimum - 1);
});

test('complex panels keep their controls when moved into compact slots', async ({ page }) => {
    await loadFresh(page);
    const scenarios = [
        {
            panel: 'input',
            selectors: [
                '#btn-edit-csv', '#btn-add-item', 'input[data-field="name"]',
                'input[data-field="lead"]', '.agenda-color-button', '.btn-stage', '.btn-delete'
            ],
            variance: true
        },
        {
            panel: 'tracker',
            selectors: ['#btn-popout', '.timeline-track', '.timeline-block', '.axis-tick-label:not([hidden])']
        },
        {
            panel: 'current-item',
            selectors: ['.notes-toolbar button', '.notes-area']
        }
    ];

    for (const scenario of scenarios) {
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await page.locator(`[data-panel-id="${scenario.panel}"] .panel-move-button`).click();
        await page.locator('#panel-move-menu [data-slot-id="overall-status"]').click();
        if (scenario.variance) {
            await page.evaluate(async () => {
                const state = await import('/agendamatic/js/state.js');
                state.ensureExpectedSnapshot();
                state.updateTracker({ varianceMode: true });
            });
            await expect(page.locator('.agenda-header')).toHaveClass(/variance-grid/);
        }
        const geometry = await page.locator(`[data-panel-id="${scenario.panel}"]`).evaluate(
            (panel, selectors) => {
                const panelRect = panel.getBoundingClientRect();
                const visible = element => element.getClientRects().length > 0 &&
                    getComputedStyle(element).visibility !== 'hidden';
                const required = selectors.flatMap(selector => [...panel.querySelectorAll(selector)]);
                return {
                    overflow: [
                        panel.scrollWidth - panel.clientWidth,
                        panel.scrollHeight - panel.clientHeight
                    ],
                    agendaOverflow: panel.querySelector('#agenda-container')
                        ? panel.querySelector('#agenda-container').scrollWidth -
                            panel.querySelector('#agenda-container').clientWidth
                        : 0,
                    missing: selectors.filter(selector => {
                        const matches = [...panel.querySelectorAll(selector)];
                        return matches.length === 0 || matches.some(element => !visible(element));
                    }),
                    clipped: required.filter(visible).filter(element => {
                        const rect = element.getBoundingClientRect();
                        return rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1 ||
                            rect.top < panelRect.top - 1 || rect.bottom > panelRect.bottom + 1;
                    }).map(element => element.id || element.className)
                };
            },
            scenario.selectors
        );
        expect(geometry.overflow).toEqual([0, 0]);
        expect(geometry.agendaOverflow).toBeLessThanOrEqual(0);
        expect(geometry.missing).toEqual([]);
        expect(geometry.clipped).toEqual([]);
    }
});

test('meeting controls explain each phase and stay contained', async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1117 });
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
    await expect(popup.locator('#btn-popout-prev')).toHaveAttribute('aria-keyshortcuts', 'Backspace');
    await expect(popoutPrimary).toHaveAttribute('aria-keyshortcuts', 'Space');
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
    await expect.poll(() => page.locator('.timeline-block.active').evaluate(
        element => getComputedStyle(element).backgroundImage
    )).toContain('linear-gradient');
    await expect.poll(() => popup.locator('.timeline-block.active').evaluate(
        element => getComputedStyle(element).backgroundImage
    )).toContain('linear-gradient');

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

    for (const viewport of [
        { width: 1600, height: 350, stacked: false },
        { width: 600, height: 260, stacked: false },
        { width: 320, height: 480, stacked: true }
    ]) {
        await popup.setViewportSize(viewport);
        await expect.poll(() => popup.evaluate(() => {
            const rect = element => element.getBoundingClientRect();
            const panes = [...document.querySelectorAll('.popout-pane')];
            const tracker = rect(document.querySelector('.popout-tracker-pane'));
            const overall = rect(document.querySelector('.popout-overall-pane'));
            const controls = [...document.querySelectorAll('.popout-action:not([hidden])')];
            return {
                documentOverflow: [
                    document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    document.documentElement.scrollHeight - document.documentElement.clientHeight
                ],
                panesContained: panes.every(pane => {
                    const box = rect(pane);
                    return box.left >= 0 && box.top >= 0 &&
                        box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
                }),
                controlsContained: controls.length === 2 && controls.every(control => {
                    const box = rect(control);
                    return box.left >= 0 && box.right <= innerWidth + 1 &&
                        box.top >= 0 && box.bottom <= innerHeight + 1;
                }),
                controlsTallEnough: controls.every(control => rect(control).height >= 24),
                stacked: tracker.bottom <= overall.top + 1
            };
        })).toEqual({
            documentOverflow: [0, 0],
            panesContained: true,
            controlsContained: true,
            controlsTallEnough: true,
            stacked: viewport.stacked
        });
    }

    await page.locator('#btn-stop').click();
    await expect(controls).toHaveAttribute('data-phase', 'paused');
    await expect(primary).toHaveAccessibleName('Resume meeting');
    await expect(popoutCurrentStatus).toHaveAccessibleName(/paused; .* on Welcome/);
    await expect(popoutPrimary).toHaveAccessibleName('Resume meeting');

    const pausedTextFits = await primary.evaluate(button => {
        const text = button.querySelector('.next-item-text');
        const buttonRect = button.getBoundingClientRect();
        const textRect = text.getBoundingClientRect();
        return text.scrollWidth <= text.clientWidth &&
            textRect.left >= buttonRect.left && textRect.right <= buttonRect.right;
    });
    expect(pausedTextFits).toBe(true);

    await page.setViewportSize({ width: 600, height: 900 });
    const mobileControls = await page.evaluate(() => {
        const controls = document.querySelector('.next-item-controls').getBoundingClientRect();
        const button = document.getElementById('btn-next-item');
        const buttonRect = button.getBoundingClientRect();
        const text = button.querySelector('.next-item-text');
        return {
            primaryWidth: buttonRect.width,
            primaryInControls: buttonRect.left >= controls.left && buttonRect.right <= controls.right,
            textFits: text.scrollWidth <= text.clientWidth
        };
    });
    expect(mobileControls.primaryWidth).toBeGreaterThan(300);
    expect(mobileControls.primaryInControls).toBe(true);
    expect(mobileControls.textFits).toBe(true);

    await page.setViewportSize({ width: 2048, height: 1117 });
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
        ['horizontal', 'vertical'].includes(value.orientation) &&
        value.minimum <= value.now &&
        value.now <= value.maximum &&
        value.valueText?.includes('percent') &&
        (
            (value.disabled === 'false' && value.tabIndex === 0) ||
            (value.disabled === 'true' && value.tabIndex === -1 && value.minimum === value.maximum)
        ) &&
        value.touchAction === 'none'
    ))).toBe(true);
    expect(metadata.some(value => value.disabled === 'false')).toBe(true);

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

    const lowerHandle = page.locator('#resizer-main-bottom');
    await lowerHandle.focus();
    await page.keyboard.press('End');
    const lowerGeometry = await page.evaluate(() => {
        const lower = document.querySelector('.lower-panels').getBoundingClientRect();
        const trackerSection = document.querySelector('.tracker-section');
        const bottomSection = document.querySelector('.bottom-section');
        const tracker = trackerSection.getBoundingClientRect();
        const bottom = bottomSection.getBoundingClientRect();
        const requiredHeight = section => Math.max(...[...section.querySelectorAll(':scope > .box')]
            .map(panel => Number.parseFloat(getComputedStyle(panel).getPropertyValue('--panel-min-block')) || 0));
        return {
            bottomGap: Math.abs(lower.bottom - bottom.bottom),
            trackerHeight: tracker.height,
            bottomHeight: bottom.height,
            trackerMinimum: requiredHeight(trackerSection),
            bottomMinimum: requiredHeight(bottomSection)
        };
    });
    expect(lowerGeometry.bottomGap).toBeLessThan(1);
    expect(lowerGeometry.trackerHeight).toBeGreaterThanOrEqual(lowerGeometry.trackerMinimum - 1);
    expect(lowerGeometry.bottomHeight).toBeGreaterThanOrEqual(lowerGeometry.bottomMinimum - 1);

    const trackerHandle = page.locator('#resizer-tracker');
    const trackerHandleBox = await trackerHandle.boundingBox();
    await page.mouse.move(
        trackerHandleBox.x + trackerHandleBox.width / 2,
        trackerHandleBox.y + trackerHandleBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(trackerHandleBox.x - 120, trackerHandleBox.y, { steps: 12 });
    const duringResize = await page.evaluate(() => {
        const annotations = [...document.querySelectorAll(
            '.axis-label-layer, .axis-label-curves, .overflow-labels-container, .progress-guide-line'
        )];
        return {
            resizing: document.body.classList.contains('resizing-panels'),
            annotationCount: annotations.length,
            annotationsHidden: annotations.every(element => getComputedStyle(element).visibility === 'hidden')
        };
    });
    expect(duringResize.resizing).toBe(true);
    expect(duringResize.annotationCount).toBeGreaterThan(0);
    expect(duringResize.annotationsHidden).toBe(true);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => {
        const tracker = document.querySelector('[data-panel-id="tracker"]');
        const trackerRect = tracker.getBoundingClientRect();
        const labels = [...tracker.querySelectorAll('.axis-tick-label:not([hidden]), .overflow-label')];
        return {
            resizing: document.body.classList.contains('resizing-panels'),
            labelsVisible: labels.length > 0 && labels.every(label => getComputedStyle(label).visibility === 'visible'),
            labelsContained: labels.every(label => {
                const rect = label.getBoundingClientRect();
                return rect.left >= trackerRect.left - 1 && rect.right <= trackerRect.right + 1 &&
                    rect.top >= trackerRect.top - 1 && rect.bottom <= trackerRect.bottom + 1;
            }),
            trackerOverflow: [
                tracker.scrollWidth - tracker.clientWidth,
                tracker.scrollHeight - tracker.clientHeight
            ]
        };
    })).toEqual({
        resizing: false,
        labelsVisible: true,
        labelsContained: true,
        trackerOverflow: [0, 0]
    });

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
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items[0].name;
    })).toBe(original + ' changed');
    await name.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(name).toHaveValue(original);

    await name.press('Tab');
    await expect.poll(() => page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items[0].name;
    })).toBe(original);
});
