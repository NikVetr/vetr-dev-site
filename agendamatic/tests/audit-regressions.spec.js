import { test, expect } from '@playwright/test';

test('recorded intervals survive pauses, reload, completion, and rewind', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-04T09:00:00'));
    await page.goto('/agendamatic/');
    await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.importFromJSON(JSON.stringify({
            items: ['a', 'b'].map(id => ({ id, name: id, duration: '5m' })),
            settings: { syncSystemTime: true }
        }));
        (await import('/agendamatic/js/timer.js')).startTimer();
    });
    await page.clock.setFixedTime(new Date('2026-09-04T09:05:00'));
    await page.evaluate(async () => (await import('/agendamatic/js/state.js')).advanceToNextItem());
    await page.clock.setFixedTime(new Date('2026-09-04T09:06:00'));
    await page.evaluate(async () => (await import('/agendamatic/js/timer.js')).stopTimer());
    await page.clock.setFixedTime(new Date('2026-09-04T09:16:00'));
    await page.evaluate(async () => (await import('/agendamatic/js/timer.js')).startTimer());
    await page.reload();
    await page.clock.setFixedTime(new Date('2026-09-04T09:20:00'));
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        const summarize = () => state.calculateAdjustedIntervals().items.map(item => ({
            start: item.startTime.getHours() * 60 + item.startTime.getMinutes(),
            end: item.endTime.getHours() * 60 + item.endTime.getMinutes(),
            duration: item.adjustedDuration
        }));
        const live = summarize();
        state.advanceToNextItem();
        const completed = summarize();
        const minutes = (await import('/agendamatic/js/export.js')).generatePlainText();
        state.retreatToPreviousItem();
        return { live, completed, minutes, rewound: summarize(), delta: state.getState().tracker.overallDeltaMinutes };
    });
    const intervals = [{ start: 540, end: 545, duration: 5 }, { start: 545, end: 560, duration: 5 }];
    expect(result.live).toEqual(intervals);
    expect(result.completed).toEqual(intervals);
    expect(result.rewound).toEqual(intervals);
    expect(result.delta).toBe(0);
    expect(result.minutes).toContain('9:00-9:05 (5m)');
    expect(result.minutes).toContain('9:05-9:20 (5m)');
});

test('short items retain actual durations and exact completion boundaries', async ({ page }) => {
    await page.goto('/agendamatic/');
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        const start = new Date('2026-09-04T09:00:00Z');
        state.importFromJSON(JSON.stringify({
            items: ['a', 'b'].map(id => ({ id, name: id, duration: '0.5m' })),
            tracker: { startedAt: start, scheduledStartAt: start, activeStartedAt: start, activeItemId: 'a', isRunning: true }
        }));
        state.advanceToNextItem(new Date('2026-09-04T09:00:30Z'));
        const futureDuration = state.getState().items[1].duration;
        state.advanceToNextItem(new Date('2026-09-04T09:01:00Z'));
        return {
            futureDuration,
            durations: state.getState().items.map(item => item.duration),
            delta: state.getState().tracker.overallDeltaMinutes,
            end: state.calculateIntervals().at(-1).endTime.toISOString(),
            completion: state.getState().tracker.completedAt
        };
    });
    expect(result.futureDuration).toBe('0.5m');
    expect(result.durations).toEqual(['0.5m', '0.5m']);
    expect(result.delta).toBe(0);
    expect(result.end).toBe(result.completion);
});

test('duration drafts survive updates and invalid values are rejected visibly', async ({ page }) => {
    await page.goto('/agendamatic/');
    const duration = page.locator('input[data-field="duration"]').first();
    await duration.fill('1h30');
    // An unrelated update must not normalize or replace the focused draft.
    await page.evaluate(async () => (await import('/agendamatic/js/state.js')).updateMetadata({ title: 'Changed' }));
    await expect(duration).toHaveValue('1h30');
    await duration.press('End');
    await duration.pressSequentially('m');
    await duration.press('Tab');
    await expect(duration).toHaveValue('1h30m');
    await duration.fill('nonsense');
    await duration.press('Tab');
    await expect(page.locator('.notification')).toContainText('Enter a positive duration');
    await expect(duration).toHaveValue('1h30m');
});

test('midnight interval edits preserve the boundary date', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-04T23:50:00'));
    await page.goto('/agendamatic/');
    await page.evaluate(async () => {
        (await import('/agendamatic/js/state.js')).importFromJSON(JSON.stringify({
            items: [{ id: 'night', name: 'Night', duration: '20m' }], settings: { startTime: '23:50' }
        }));
    });
    await page.locator('.interval-time-btn[data-position="end"]').click();
    await page.locator('.interval-start-input').fill('00:15');
    await page.locator('.interval-start-input').evaluate(input => input.blur());
    await expect(page.locator('input[data-field="duration"]')).toHaveValue('25m');
});

test('notes keyboard formatting uses the same actions as the toolbar', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/agendamatic/');
    await page.locator('[data-action="notes"]').first().click();
    const editor = page.locator('#editor-textarea');
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await editor.fill('hello');
    await editor.press(`${modifier}+a`);
    await editor.press(`${modifier}+b`);
    await expect(editor).toHaveValue('**hello**');
    await editor.fill('hello');
    await editor.press(`${modifier}+a`);
    await editor.press(`${modifier}+i`);
    await expect(editor).toHaveValue('*hello*');
    await page.locator('#modal-save').click();
    expect(errors).toEqual([]);
});

test('staged items can be dragged to the bottom', async ({ page }) => {
    await page.goto('/agendamatic/');
    await page.evaluate(async () => {
        (await import('/agendamatic/js/state.js')).importFromJSON(JSON.stringify({
            items: [], stagedItems: ['a', 'b', 'c'].map(id => ({ id, name: id, duration: '5m' }))
        }));
    });
    await page.locator('.staging-item').first().evaluate(element => {
        const transfer = new DataTransfer();
        transfer.setData('application/x-agenda-source', 'staging');
        transfer.setData('text/plain', 'a');
        element.classList.add('dragging');
        const container = element.parentElement;
        container.dispatchEvent(new DragEvent('drop', {
            bubbles: true, cancelable: true, dataTransfer: transfer,
            clientY: container.getBoundingClientRect().bottom + 10
        }));
    });
    await expect(page.locator('.staging-item-name')).toHaveText(['b', 'c', 'a']);
});
