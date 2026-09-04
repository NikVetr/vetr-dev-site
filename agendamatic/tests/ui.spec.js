import { test, expect } from '@playwright/test';

async function loadFresh(page) {
    await page.goto('/agendamatic/');
    await expect(page.locator('.agenda-row')).toHaveCount(5);
}

test('desktop and mobile layouts keep every panel usable', async ({ page }) => {
    await loadFresh(page);
    await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 1440);

    await page.setViewportSize({ width: 1200, height: 800 });
    const compactDesktop = await page.evaluate(() => {
        const panelsFit = [
            '#agenda-container',
            '.export-panel',
            '.timeline-container',
            '.current-status-display',
            '.staging-container',
            '.current-item-box'
        ].every(selector => {
            const element = document.querySelector(selector);
            return element.scrollWidth - element.clientWidth <= 1 &&
                element.scrollHeight - element.clientHeight <= 1;
        });
        const headers = [...document.querySelectorAll('.agenda-header > div')];
        const cells = [...document.querySelectorAll('.agenda-row:first-child > *')];
        const columnsAlign = headers.every((header, index) => {
            const headerRect = header.getBoundingClientRect();
            const cellRect = cells[index].getBoundingClientRect();
            return Math.abs((headerRect.left + headerRect.right) - (cellRect.left + cellRect.right)) <= 2;
        });
        return { panelsFit, columnsAlign };
    });
    expect(compactDesktop).toEqual({ panelsFit: true, columnsAlign: true });

    await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.ensureExpectedSnapshot();
        state.updateTracker({ varianceMode: true });
    });
    const varianceFits = await page.evaluate(() => {
        const agenda = document.getElementById('agenda-container');
        const headers = [...document.querySelectorAll('.agenda-header > div')];
        const cells = [...document.querySelectorAll('.agenda-row:first-child > *')];
        return agenda.scrollWidth - agenda.clientWidth <= 1 && headers.every((header, index) => {
            const headerRect = header.getBoundingClientRect();
            const cellRect = cells[index].getBoundingClientRect();
            return Math.abs((headerRect.left + headerRect.right) - (cellRect.left + cellRect.right)) <= 2;
        });
    });
    expect(varianceFits).toBe(true);
    await page.evaluate(async () => {
        const { updateTracker } = await import('/agendamatic/js/state.js');
        updateTracker({ varianceMode: false });
    });

    await page.setViewportSize({ width: 1300, height: 900 });
    const intermediateToggle = page.locator('#btn-settings-toggle');
    await expect(intermediateToggle).toBeVisible();
    await intermediateToggle.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#settings-sidebar')).toHaveAttribute('aria-hidden', 'false');
    await page.keyboard.press('Escape');
    await expect(intermediateToggle).toHaveAttribute('aria-expanded', 'false');

    await page.setViewportSize({ width: 375, height: 812 });
    const narrowInput = await page.evaluate(() => {
        const agenda = document.getElementById('agenda-container');
        const header = document.querySelector('.agenda-header');
        const row = document.querySelector('.agenda-row');
        const rowRect = row.getBoundingClientRect();
        const childRects = [...row.children].map(child => child.getBoundingClientRect());
        const labeledHeaderRects = [...header.children]
            .filter(child => child.textContent.trim())
            .map(child => child.getBoundingClientRect());
        const headersOverlap = labeledHeaderRects.some((rect, index) => labeledHeaderRects.slice(index + 1).some(other => (
            Math.min(rect.right, other.right) - Math.max(rect.left, other.left) > 1 &&
            Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top) > 1
        )));
        return {
            agendaOverflow: agenda.scrollWidth - agenda.clientWidth,
            headerOverflow: header.scrollWidth - header.clientWidth,
            rowHeight: rowRect.height,
            childrenContained: childRects.every(rect => (
                rect.left >= rowRect.left - 1 && rect.right <= rowRect.right + 1 &&
                rect.top >= rowRect.top - 1 && rect.bottom <= rowRect.bottom + 1
            )),
            headersOverlap
        };
    });
    expect(narrowInput).toMatchObject({
        agendaOverflow: 0,
        headerOverflow: 0,
        childrenContained: true,
        headersOverlap: false
    });
    expect(narrowInput.rowHeight).toBeGreaterThan(50);

    await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.ensureExpectedSnapshot();
        state.updateTracker({ varianceMode: true });
    });
    await expect(page.locator('.agenda-header')).toHaveClass(/variance-grid/);
    const narrowVariance = await page.evaluate(() => {
        const agenda = document.getElementById('agenda-container');
        const input = document.querySelector('.input-box');
        const header = document.querySelector('.agenda-header');
        const row = document.querySelector('.agenda-row');
        const rowRect = row.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        const addButtonRect = document.getElementById('btn-add-item').getBoundingClientRect();
        return {
            agendaOverflow: agenda.scrollWidth - agenda.clientWidth,
            headerOverflow: header.scrollWidth - header.clientWidth,
            rowHeight: rowRect.height,
            inputContainsAgenda: addButtonRect.bottom <= inputRect.bottom + 1,
            childrenContained: [...row.children].every(child => {
                const rect = child.getBoundingClientRect();
                return rect.left >= rowRect.left - 1 && rect.right <= rowRect.right + 1 &&
                    rect.top >= rowRect.top - 1 && rect.bottom <= rowRect.bottom + 1;
            })
        };
    });
    expect(narrowVariance).toMatchObject({
        agendaOverflow: 0,
        headerOverflow: 0,
        inputContainsAgenda: true,
        childrenContained: true
    });
    expect(narrowVariance.rowHeight).toBeGreaterThan(70);
});

test('metadata edits persist immediately and additions and removals retain focus', async ({ page }) => {
    await loadFresh(page);
    await page.locator('#btn-metadata').click();
    const title = page.locator('#metadata-meeting-title');
    await expect(title).toBeFocused();
    await title.fill('Planning & Review Final');
    await page.locator('.metadata-group-header input').first().fill('Board members');
    await page.locator('.metadata-attendee-row input[type="text"]').first().fill('Ada Lovelace');

    await page.locator('#metadata-add-group').click();
    const secondGroup = page.locator('.metadata-attendee-group').nth(1);
    await expect(secondGroup.locator('.metadata-group-header input')).toBeFocused();
    await secondGroup.locator('.metadata-group-header input').fill('Staff');
    await secondGroup.locator('.metadata-add-attendee input').fill('Avery');
    await secondGroup.locator('.metadata-add-attendee button').click();
    await expect(secondGroup.locator('.metadata-attendee-row input[type="text"]')).toBeFocused();

    await page.locator('#metadata-add-action').click();
    const action = page.locator('.metadata-action-row').last();
    await expect(action.locator('input[placeholder="Action item"]')).toBeFocused();
    await action.locator('input[placeholder="Action item"]').fill('Send revised budget');
    await action.locator('input[type="checkbox"]').check();
    await action.locator('input[placeholder="Owner"]').fill('Avery');

    const beforeReload = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().metadata;
    });
    expect(beforeReload.title).toBe('Planning & Review Final');
    expect(beforeReload.attendeeGroups).toHaveLength(2);
    expect(beforeReload.attendeeGroups[0]).toMatchObject({ name: 'Board members' });
    expect(beforeReload.attendeeGroups[0].attendees[0]).toMatchObject({ name: 'Ada Lovelace' });
    expect(beforeReload.attendeeGroups[1]).toMatchObject({
        name: 'Staff',
        attendees: [{ name: 'Avery', present: false }]
    });
    expect(beforeReload.actionItems).toContainEqual(expect.objectContaining({
        text: 'Send revised budget',
        owner: 'Avery',
        done: true
    }));

    await page.reload();
    await page.locator('#btn-metadata').click();
    await expect(title).toHaveValue('Planning & Review Final');
    await expect(page.locator('.metadata-group-header input').first()).toHaveValue('Board members');
    await expect(page.locator('.metadata-attendee-row input[type="text"]').first()).toHaveValue('Ada Lovelace');
    const persistedSecondGroup = page.locator('.metadata-attendee-group').nth(1);
    await expect(persistedSecondGroup.locator('.metadata-group-header input')).toHaveValue('Staff');
    await expect(persistedSecondGroup.locator('.metadata-attendee-row input[type="text"]')).toHaveValue('Avery');
    await expect(page.locator('.metadata-action-row input[placeholder="Action item"]')).toHaveValue('Send revised budget');
    await expect(page.locator('.metadata-action-row input[placeholder="Owner"]')).toHaveValue('Avery');
    await expect(page.locator('.metadata-action-row input[type="checkbox"]')).toBeChecked();

    await persistedSecondGroup.getByRole('button', { name: 'Remove Avery' }).click();
    await expect(persistedSecondGroup.locator('.metadata-add-attendee input')).toBeFocused();
    await persistedSecondGroup.getByRole('button', { name: 'Remove Staff group' }).click();
    await expect(page.locator('.metadata-group-header input').first()).toBeFocused();

    await page.locator('#metadata-add-action').click();
    const actions = page.locator('.metadata-action-row');
    await actions.first().locator('.metadata-remove-attendee').click();
    await expect(actions.first().locator('.metadata-remove-attendee')).toBeFocused();
    await actions.first().locator('.metadata-remove-attendee').click();
    await expect(page.locator('#metadata-add-action')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#metadata-modal')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#btn-metadata')).toBeFocused();
});

test('metadata defaults to the local calendar date near UTC rollover', async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-09-04T06:30:00.000Z') });
    await loadFresh(page);
    await page.locator('#btn-metadata').click();
    await expect(page.locator('#metadata-date')).toHaveValue('2026-09-03');
    await context.close();
});

test('bulk editing preserves drafts and marks the true malformed line', async ({ page }) => {
    await loadFresh(page);
    await page.locator('.bulk-column-button[data-bulk-field="name"]').first().click();
    await expect(page.getByRole('textbox', { name: 'Edit Items', exact: true })).toBeFocused();
    await page.locator('#bulk-edit-text').fill('Draft A\nDraft B');
    await page.locator('input[name="bulk-format"][value="comma"]').check();
    await expect(page.locator('#bulk-edit-text')).toHaveValue('Draft A, Draft B');
    await page.locator('#bulk-edit-cancel').click();

    await page.locator('.bulk-column-button[data-bulk-field="name"]').first().click();
    await page.locator('#bulk-edit-text').fill('One\nTwo\nThree\nFour\nFive\n');
    await page.locator('#bulk-edit-apply').click();
    await expect(page.locator('.agenda-row')).toHaveCount(5);

    await page.locator('#btn-edit-csv').click();
    await expect(page.getByRole('textbox', { name: 'Edit Agenda CSV', exact: true })).toBeFocused();
    await page.locator('#bulk-edit-text').fill([
        'ID,Item,Lead,Color,Duration,Locked,Context,Preparation,Notes',
        'welcome,Welcome,Chair,#2196f3,5m,false,,,Opening',
        '',
        'Broken,row'
    ].join('\n'));
    await expect(page.locator('#bulk-edit-warning')).toContainText('row 4');
    await expect(page.locator('#bulk-edit-bad-rows')).toContainText('Row 4');
    const background = await page.locator('#bulk-edit-text').evaluate(element => element.style.backgroundImage);
    expect(background).toContain('linear-gradient');

    await page.locator('#bulk-edit-text').fill([
        'ID,Item,Lead,Color,Duration,Locked,Context,Preparation,Notes',
        'Broken,row',
        'Also,broken'
    ].join('\n'));
    await expect(page.locator('#bulk-edit-warning')).toContainText('rows 2, 3');
    await expect(page.locator('#bulk-edit-bad-rows')).not.toContainText('Row 1');

    await page.locator('#bulk-edit-cancel').click();
    await page.locator('.bulk-column-button[data-bulk-field="name"]').first().click();
    const clearedBackground = await page.locator('#bulk-edit-text').evaluate(element => element.style.backgroundImage);
    expect(clearedBackground).toBe('');
});

test('agenda and staging offer keyboard and touch-friendly movement controls', async ({ page }) => {
    await loadFresh(page);
    const firstName = await page.locator('.agenda-row input[data-field="name"]').first().inputValue();
    const secondName = await page.locator('.agenda-row input[data-field="name"]').nth(1).inputValue();

    await page.locator('.grip').first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.agenda-row input[data-field="name"]').nth(1)).toHaveValue(firstName);
    await expect(page.locator('.grip').nth(1)).toBeFocused();

    await page.getByRole('button', { name: `Move ${firstName} to staging` }).click();
    await page.getByRole('button', { name: `Move ${secondName} to staging` }).click();
    await expect(page.locator('.staging-item')).toHaveCount(2);
    await page.getByRole('button', { name: `Move ${secondName} up` }).click();
    await expect(page.locator('.staging-item-name').first()).toHaveText(secondName);
    await page.getByRole('button', { name: `Return ${secondName} to agenda` }).click();
    await expect(page.getByRole('button', { name: `Move ${secondName} to staging` })).toBeVisible();
});

test('staged items retain preset colors in light and dark mode', async ({ page }) => {
    await loadFresh(page);
    const firstName = await page.locator('.agenda-row input[data-field="name"]').first().inputValue();
    await page.getByRole('button', { name: `Move ${firstName} to staging` }).click();

    async function compareStagedToThemeReference() {
        return page.evaluate(() => {
            const card = document.querySelector('.staging-item');
            const referenceRow = [...document.querySelectorAll('.agenda-row')]
                .find(row => row.classList.contains(card.classList[1]));
            const referenceName = referenceRow.querySelector('input[data-field="name"]');
            const cardStyle = getComputedStyle(card);
            const rowStyle = getComputedStyle(referenceRow);
            const nameStyle = getComputedStyle(referenceName);
            return {
                card: [cardStyle.borderLeftColor, cardStyle.backgroundColor, cardStyle.color],
                reference: [rowStyle.borderLeftColor, nameStyle.backgroundColor, nameStyle.color]
            };
        });
    }

    const colors = await compareStagedToThemeReference();
    expect(colors.card).toEqual(colors.reference);

    await page.evaluate(async () => {
        const { updateSettings } = await import('/agendamatic/js/state.js');
        updateSettings({ darkMode: true });
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(async () => {
        const current = await compareStagedToThemeReference();
        return current.card.join('|') === current.reference.join('|');
    }).toBe(true);
});

test('Stop freezes live tracking and resume excludes the paused interval', async ({ page }) => {
    await loadFresh(page);
    await page.evaluate(async () => {
        const { updateSettings } = await import('/agendamatic/js/state.js');
        updateSettings({ syncSystemTime: true });
    });
    await page.locator('#btn-next-item').click();
    await page.waitForTimeout(1100);
    await page.locator('#btn-stop').click();
    await page.waitForTimeout(100);
    const paused = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return {
            ticker: document.querySelector('#current-status-tape').innerHTML,
            marker: document.querySelector('.current-time-marker').style.left,
            progress: document.querySelector('.progress-bar').style.width,
            scheduledStartAt: getState().tracker.scheduledStartAt,
            pausedAt: getState().tracker.pausedAt
        };
    });
    await page.waitForTimeout(1300);
    const stillPaused = await page.evaluate(() => ({
        ticker: document.querySelector('#current-status-tape').innerHTML,
        marker: document.querySelector('.current-time-marker').style.left,
        progress: document.querySelector('.progress-bar').style.width
    }));
    expect(stillPaused).toEqual({
        ticker: paused.ticker,
        marker: paused.marker,
        progress: paused.progress
    });

    await page.locator('#btn-next-item').click();
    const resumedStart = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().tracker.scheduledStartAt;
    });
    const shiftedBy = new Date(resumedStart) - new Date(paused.scheduledStartAt);
    expect(shiftedBy).toBeGreaterThanOrEqual(1200);
    expect(shiftedBy).toBeLessThan(3000);
});

test('Tracker renders buffer gaps and pop-out mirrors the active appearance', async ({ page }) => {
    await loadFresh(page);
    await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.importFromJSON(JSON.stringify({
            items: [
                { id: 'a', name: 'A', duration: '10m' },
                { id: 'b', name: 'B', duration: '10m' }
            ],
            settings: { startTime: '09:00', buffer: 10, darkMode: true, density: 'presentation' }
        }));
    });
    const blocks = await page.locator('.timeline-block').evaluateAll(elements => elements.map(element => ({
        left: Number.parseFloat(element.style.left),
        width: Number.parseFloat(element.style.width)
    })));
    expect(blocks[0].left).toBeCloseTo(0, 3);
    expect(blocks[0].width).toBeCloseTo(33.333, 2);
    expect(blocks[1].left).toBeCloseTo(66.667, 2);

    const popupPromise = page.waitForEvent('popup');
    await page.locator('#btn-popout').click();
    const popup = await popupPromise;
    await expect.poll(() => popup.locator('#popout-tracker').count()).toBe(1);
    const appearance = await popup.evaluate(() => ({
        display: getComputedStyle(document.body).display,
        theme: document.documentElement.getAttribute('data-theme'),
        density: document.documentElement.getAttribute('data-density')
    }));
    expect(appearance).toEqual({
        display: 'block',
        theme: 'dark',
        density: 'presentation'
    });
    await popup.close();
});

test('custom HSL colors round-trip and style every agenda view', async ({ page }) => {
    await loadFresh(page);
    await page.locator('.agenda-color-button').first().click();
    await page.locator('#item-color-hue').evaluate(element => {
        element.value = '137';
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#item-color-saturation').evaluate(element => {
        element.value = '83';
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#item-color-value')).toHaveText('#15e04e');
    await page.locator('#item-color-apply').click();

    await expect(page.locator('.agenda-row').first()).toHaveClass(/custom-item-color/);
    await expect(page.locator('.timeline-block').first()).toHaveClass(/custom-item-color/);
    await expect(page.locator('.current-item-box')).toHaveClass(/custom-item-color/);

    const persisted = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        return {
            stateColor: state.getState().items[0].customColor,
            sharedColor: state.decodeStateFromURL(state.encodeStateToURL()).items[0].customColor
        };
    });
    expect(persisted).toEqual({
        stateColor: '#15e04e',
        sharedColor: '#15e04e'
    });

    await page.locator('.bulk-column-button[data-bulk-field="themeColor"]').first().click();
    await expect(page.locator('#bulk-edit-text')).toHaveValue(/^#15e04e/m);
    await page.locator('#bulk-edit-cancel').click();

    const lightBackground = await page.locator('.agenda-row').first().locator('input[data-field="name"]').evaluate(element => getComputedStyle(element).backgroundColor);
    await page.evaluate(async () => {
        const { updateSettings } = await import('/agendamatic/js/state.js');
        updateSettings({ darkMode: true });
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.locator('.agenda-row').first().locator('input[data-field="name"]')
        .evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(lightBackground);

    await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.stageItem(state.getState().items[0].id);
    });
    await expect(page.locator('.staging-item').first()).toHaveClass(/custom-item-color/);
});
