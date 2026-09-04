import { test, expect } from '@playwright/test';

async function loadFresh(page) {
    await page.goto('/agendamatic/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/agendamatic/');
    await expect(page.locator('.agenda-row')).toHaveCount(5);
}

test('reordering preserves the moved color and separates each colliding neighbor', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?edge=reorder-colors');
        state.initializeState();
        state.importFromJSON(JSON.stringify({
            items: [
                { id: 'outer-left', name: 'Outer left', duration: '5m', customColor: '#e0aa15' },
                { id: 'left', name: 'Left', duration: '5m', customColor: '#15e04e' },
                { id: 'right', name: 'Right', duration: '5m', customColor: '#15e04e' },
                { id: 'outer-right', name: 'Outer right', duration: '5m', customColor: '#8248d1' },
                { id: 'moved', name: 'Moved', duration: '5m', customColor: '#15e04e' }
            ],
            settings: { separateAdjacentColors: true }
        }));

        state.reorderItems(4, 2);
        const reordered = state.getState().items.map(item => ({ id: item.id, color: item.customColor }));

        state.importFromJSON(JSON.stringify({
            items: [
                { id: 'unstage-left', name: 'Left', duration: '5m', customColor: '#15e04e' },
                { id: 'unstage-right', name: 'Right', duration: '5m', customColor: '#15e04e' }
            ],
            stagedItems: [{ id: 'unstaged', name: 'Unstaged', duration: '5m', customColor: '#15e04e' }],
            settings: { separateAdjacentColors: true }
        }));
        state.unstageItem('unstaged', 1);
        const unstaged = state.getState().items.map(item => ({ id: item.id, color: item.customColor }));
        return { reordered, unstaged };
    });

    expect(result.reordered.map(item => item.id)).toEqual([
        'outer-left',
        'left',
        'moved',
        'right',
        'outer-right'
    ]);
    const colors = Object.fromEntries(result.reordered.map(item => [item.id, item.color]));
    expect(colors.moved).toBe('#15e04e');
    expect(colors.left).not.toBe(colors.moved);
    expect(colors.left).not.toBe(colors['outer-left']);
    expect(colors.right).not.toBe(colors.moved);
    expect(colors.right).not.toBe(colors['outer-right']);
    expect(colors['outer-left']).toBe('#e0aa15');
    expect(colors['outer-right']).toBe('#8248d1');

    const unstagedColors = Object.fromEntries(result.unstaged.map(item => [item.id, item.color]));
    expect(unstagedColors.unstaged).toBe('#15e04e');
    expect(unstagedColors['unstage-left']).not.toBe(unstagedColors.unstaged);
    expect(unstagedColors['unstage-right']).not.toBe(unstagedColors.unstaged);
});

test('legacy palette hex values stay presets and untouched picker Apply is a no-op', async ({ page }) => {
    await loadFresh(page);
    const normalized = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        const colors = await import('/agendamatic/js/colors.js');
        state.importFromJSON(JSON.stringify({
            items: [{
                id: 'preset',
                name: 'Preset',
                duration: '5m',
                themeColor: 8,
                customColor: '#2196F3'
            }]
        }));
        const item = state.getState().items[0];
        return {
            parsed: colors.parseItemColor('#2196F3'),
            item: { id: item.id, themeColor: item.themeColor, customColor: item.customColor }
        };
    });
    expect(normalized).toEqual({
        parsed: { themeColor: 1, customColor: null },
        item: { id: 'preset', themeColor: 1, customColor: null }
    });

    const before = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return { item: getState().items[0], url: location.href };
    });
    await page.locator('.agenda-color-button').click();
    await expect(page.locator('#item-color-value')).toHaveText('#2196f3');
    await page.locator('#item-color-apply').click();
    const after = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return { item: getState().items[0], url: location.href };
    });
    expect(after).toEqual(before);
});

test('metadata accepts real calendar dates and rejects impossible ones', async ({ page }) => {
    await loadFresh(page);
    const dates = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?edge=calendar-dates');
        state.initializeState();
        const normalize = date => {
            state.importFromJSON(JSON.stringify({
                items: [{ id: 'date-item', name: 'Date', duration: '5m' }],
                metadata: { date, initialized: true }
            }));
            return state.getState().metadata.date;
        };
        return {
            leap: normalize('2024-02-29'),
            ordinaryLeap: normalize('2000-02-29'),
            nonLeap: normalize('2026-02-29'),
            centuryNonLeap: normalize('1900-02-29'),
            shortMonth: normalize('2026-04-31'),
            invalidMonth: normalize('2026-13-01')
        };
    });

    expect(dates).toEqual({
        leap: '2024-02-29',
        ordinaryLeap: '2000-02-29',
        nonLeap: '',
        centuryNonLeap: '',
        shortMonth: '',
        invalidMonth: ''
    });
});

test('share marker overrides matching local runtime while ordinary reload resumes', async ({ page, context }) => {
    await loadFresh(page);
    const sourceUrl = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.importFromJSON(JSON.stringify({
            items: [{ id: 'running', name: 'Running agenda', duration: '10m' }],
            metadata: { title: 'Shared cleanly', initialized: true },
            tracker: {
                isRunning: true,
                startedAt: '2026-09-03T16:00:00.000Z',
                scheduledStartAt: '2026-09-03T16:00:00.000Z',
                activeItemIndex: 0,
                activeItemId: 'running',
                activeStartedAt: '2026-09-03T16:00:00.000Z'
            }
        }));
        return location.href;
    });

    await page.reload();
    const resumed = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().tracker;
    });
    expect(resumed).toMatchObject({
        isRunning: true,
        startedAt: '2026-09-03T16:00:00.000Z',
        activeItemId: 'running'
    });

    const sharedUrl = new URL(sourceUrl);
    sharedUrl.searchParams.set('share', '1');
    const recipient = await context.newPage();
    await recipient.goto(sharedUrl.toString());
    const received = await recipient.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return {
            tracker: getState().tracker,
            itemName: getState().items[0].name,
            title: getState().metadata.title,
            url: location.href
        };
    });

    expect(received.itemName).toBe('Running agenda');
    expect(received.title).toBe('Shared cleanly');
    expect(received.tracker).toMatchObject({
        isRunning: false,
        startedAt: null,
        activeItemId: null,
        completedAt: null
    });
    expect(new URL(received.url).searchParams.has('share')).toBe(false);
    expect(new URL(received.url).searchParams.get('s')).toBeTruthy();

    await recipient.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.updateMetadata({ title: 'Recipient copy' });
        state.updateTracker({
            isRunning: true,
            startedAt: '2026-09-03T17:00:00.000Z',
            scheduledStartAt: '2026-09-03T17:00:00.000Z',
            activeItemIndex: 0,
            activeItemId: 'running',
            activeStartedAt: '2026-09-03T17:00:00.000Z'
        });
    });
    await recipient.reload();
    const recipientReload = await recipient.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return {
            title: getState().metadata.title,
            tracker: getState().tracker,
            isolated: sessionStorage.getItem('agendamatic_isolated_share_v1')
        };
    });
    expect(recipientReload).toMatchObject({
        title: 'Recipient copy',
        tracker: {
            isRunning: true,
            startedAt: '2026-09-03T17:00:00.000Z',
            activeItemId: 'running'
        },
        isolated: '1'
    });

    await page.reload();
    const sourceReload = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return { title: getState().metadata.title, tracker: getState().tracker };
    });
    expect(sourceReload).toMatchObject({
        title: 'Shared cleanly',
        tracker: {
            isRunning: true,
            startedAt: '2026-09-03T16:00:00.000Z',
            activeItemId: 'running'
        }
    });

    await recipient.goto('/agendamatic/');
    const returnedToLocal = await recipient.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return {
            title: getState().metadata.title,
            tracker: getState().tracker,
            isolated: sessionStorage.getItem('agendamatic_isolated_share_v1')
        };
    });
    expect(returnedToLocal).toMatchObject({
        title: 'Shared cleanly',
        tracker: {
            isRunning: true,
            startedAt: '2026-09-03T16:00:00.000Z',
            activeItemId: 'running'
        },
        isolated: null
    });
    await recipient.close();
});

test('removing the active item starts its successor now and completes an exhausted run', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?edge=active-removal');
        state.initializeState();
        const RealDate = window.Date;
        const setNow = iso => {
            window.Date = class extends RealDate {
                constructor(...args) {
                    super(...(args.length ? args : [iso]));
                }
                static now() { return new RealDate(iso).getTime(); }
            };
        };
        const runningTracker = activeItemId => ({
            isRunning: true,
            startedAt: '2026-09-03T10:00:00.000Z',
            scheduledStartAt: '2026-09-03T10:00:00.000Z',
            activeItemIndex: 0,
            activeItemId,
            activeStartedAt: '2026-09-03T10:00:00.000Z'
        });

        try {
            state.importFromJSON(JSON.stringify({
                items: [
                    { id: 'delete-me', name: 'Delete', duration: '10m' },
                    { id: 'delete-next', name: 'Next', duration: '10m' }
                ],
                tracker: runningTracker('delete-me')
            }));
            setNow('2026-09-03T10:03:00.000Z');
            state.deleteItem('delete-me');
            const afterDelete = { ...state.getState().tracker };
            const afterDeleteIntervals = {
                plan: state.calculateIntervals()[0].startTime.toISOString(),
                adjusted: state.calculateAdjustedIntervals(
                    new Date('2026-09-03T10:03:00.000Z')
                ).items[0].startTime.toISOString()
            };

            window.Date = RealDate;
            state.importFromJSON(JSON.stringify({
                items: [
                    { id: 'stage-me', name: 'Stage', duration: '10m' },
                    { id: 'stage-next', name: 'Next', duration: '10m' }
                ],
                tracker: {
                    ...runningTracker('stage-me'),
                    isRunning: false,
                    pausedAt: '2026-09-03T10:04:00.000Z'
                }
            }));
            setNow('2026-09-03T11:00:00.000Z');
            state.stageItem('stage-me');
            const afterStage = { ...state.getState().tracker };
            const afterStageIntervals = {
                plan: state.calculateIntervals()[0].startTime.toISOString(),
                adjusted: state.calculateAdjustedIntervals(
                    new Date('2026-09-03T11:00:00.000Z')
                ).items[0].startTime.toISOString()
            };

            window.Date = RealDate;
            state.importFromJSON(JSON.stringify({
                items: [{ id: 'final', name: 'Final', duration: '10m' }],
                tracker: runningTracker('final')
            }));
            setNow('2026-09-03T10:05:00.000Z');
            state.deleteItem('final');
            const exhausted = {
                itemCount: state.getState().items.length,
                tracker: { ...state.getState().tracker }
            };
            return {
                afterDelete,
                afterDeleteIntervals,
                afterStage,
                afterStageIntervals,
                exhausted
            };
        } finally {
            window.Date = RealDate;
        }
    });

    expect(result.afterDelete).toMatchObject({
        isRunning: true,
        activeItemIndex: 0,
        activeItemId: 'delete-next',
        activeStartedAt: '2026-09-03T10:03:00.000Z',
        completedAt: null
    });
    expect(result.afterDeleteIntervals).toEqual({
        plan: '2026-09-03T10:03:00.000Z',
        adjusted: '2026-09-03T10:03:00.000Z'
    });
    expect(result.afterStage).toMatchObject({
        isRunning: false,
        pausedAt: '2026-09-03T10:04:00.000Z',
        activeItemIndex: 0,
        activeItemId: 'stage-next',
        activeStartedAt: '2026-09-03T10:04:00.000Z',
        completedAt: null
    });
    expect(result.afterStageIntervals).toEqual({
        plan: '2026-09-03T10:04:00.000Z',
        adjusted: '2026-09-03T10:04:00.000Z'
    });
    expect(result.exhausted.itemCount).toBe(0);
    expect(result.exhausted.tracker).toMatchObject({
        isRunning: false,
        pausedAt: null,
        activeItemIndex: 0,
        activeItemId: null,
        activeStartedAt: '2026-09-03T10:05:00.000Z',
        completedAt: '2026-09-03T10:05:00.000Z'
    });
});

test('live structural edits cannot cross the completed-active-future boundary', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?edge=live-structure');
        state.initializeState();
        state.importFromJSON(JSON.stringify({
            items: [
                { id: 'a', name: 'A', duration: '10m' },
                { id: 'b', name: 'B', duration: '10m' },
                { id: 'c', name: 'C', duration: '10m' },
                { id: 'd', name: 'D', duration: '10m' }
            ],
            stagedItems: [{ id: 'x', name: 'X', duration: '5m' }],
            settings: { startTime: '10:00', buffer: 0 },
            tracker: {
                isRunning: true,
                startedAt: '2026-09-03T10:00:00.000Z',
                scheduledStartAt: '2026-09-03T10:00:00.000Z',
                activeItemIndex: 1,
                activeItemId: 'b',
                activeStartedAt: '2026-09-03T10:10:00.000Z'
            }
        }));

        const activeMove = state.reorderItems(1, 3);
        state.reorderItems(0, 3);
        const afterCompletedCross = state.getState().items.map(item => item.id);
        state.reorderItems(3, 0);
        const afterFutureCross = state.getState().items.map(item => item.id);
        state.unstageItem('x', 0);
        const added = state.addItem({ name: 'New', duration: '5m' }, 0);
        const afterInsertions = state.getState().items.map(item => item.id);

        const beforeBulk = state.getState().items;
        let bulkError = null;
        try {
            state.replaceItems([
                beforeBulk[0],
                beforeBulk[2],
                beforeBulk[1],
                ...beforeBulk.slice(3)
            ]);
        } catch (error) {
            bulkError = error.message;
        }
        const afterBulk = state.getState().items.map(item => item.id);
        state.advanceToNextItem(new Date('2026-09-03T10:20:00.000Z'));

        return {
            activeMove,
            afterCompletedCross,
            afterFutureCross,
            addedId: added.id,
            afterInsertions,
            bulkError,
            afterBulk,
            nextActiveId: state.getState().tracker.activeItemId
        };
    });

    expect(result.activeMove).toBe(false);
    expect(result.afterCompletedCross).toEqual(['a', 'b', 'c', 'd']);
    expect(result.afterFutureCross).toEqual(['a', 'b', 'd', 'c']);
    expect(result.afterInsertions).toEqual([
        'a',
        'b',
        result.addedId,
        'x',
        'd',
        'c'
    ]);
    expect(result.bulkError).toContain('Future and new items must remain after the active item');
    expect(result.afterBulk).toEqual(result.afterInsertions);
    expect(result.nextActiveId).toBe(result.addedId);
});

test('completed timing uses tenth-minute precision and rewind keeps variance continuous', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?edge=precision-rewind');
        state.initializeState();
        const items = [
            { id: 'a', name: 'A', duration: '10m' },
            { id: 'b', name: 'B', duration: '10m' }
        ];
        const tracker = {
            isRunning: true,
            startedAt: '2026-09-03T10:00:00.000Z',
            scheduledStartAt: '2026-09-03T10:00:00.000Z',
            activeItemIndex: 0,
            activeItemId: 'a',
            activeStartedAt: '2026-09-03T10:00:00.000Z'
        };

        state.importFromJSON(JSON.stringify({
            items,
            settings: { startTime: '10:00', buffer: 0 },
            tracker
        }));
        state.advanceToNextItem(new Date('2026-09-03T10:10:45.000Z'));
        state.advanceToNextItem(new Date('2026-09-03T10:21:30.000Z'));
        const precisionState = state.getState();
        const varianceRows = state.getExpectedVsActualData().rows.map(row => ({
            id: row.id,
            actualDurationMinutes: row.actualDurationMinutes,
            durationDifferenceMinutes: row.durationDifferenceMinutes
        }));
        const precision = {
            durations: precisionState.items.map(item => item.duration),
            diffs: precisionState.tracker.completedDiffById,
            overall: precisionState.tracker.overallDeltaMinutes,
            rows: varianceRows
        };

        state.importFromJSON(JSON.stringify({
            items,
            settings: { startTime: '10:00', buffer: 0 },
            tracker
        }));
        state.advanceToNextItem(new Date('2026-09-03T10:15:00.000Z'));
        state.retreatToPreviousItem();
        const immediatelyRewound = {
            diff: state.getState().tracker.completedDiffById.a,
            overall: state.getState().tracker.overallDeltaMinutes,
            signed: state.calculateAdjustedIntervals(
                new Date('2026-09-03T10:15:00.000Z')
            ).signedDifference
        };
        const oneMinuteLater = state.calculateAdjustedIntervals(
            new Date('2026-09-03T10:16:00.000Z')
        ).signedDifference;
        state.advanceToNextItem(new Date('2026-09-03T10:16:00.000Z'));
        const afterReadvance = {
            diff: state.getState().tracker.completedDiffById.a,
            overall: state.getState().tracker.overallDeltaMinutes,
            activeId: state.getState().tracker.activeItemId
        };

        return { precision, immediatelyRewound, oneMinuteLater, afterReadvance };
    });

    expect(result.precision).toEqual({
        durations: ['10.8m', '10.8m'],
        diffs: { a: 0.8, b: 0.8 },
        overall: 1.6,
        rows: [
            { id: 'a', actualDurationMinutes: 10.8, durationDifferenceMinutes: 0.8 },
            { id: 'b', actualDurationMinutes: 10.8, durationDifferenceMinutes: 0.8 }
        ]
    });
    expect(result.immediatelyRewound).toEqual({ diff: 5, overall: 5, signed: 5 });
    expect(result.oneMinuteLater).toBe(6);
    expect(result.afterReadvance).toEqual({ diff: 6, overall: 6, activeId: 'b' });
});

test('tracker completion without a valid start is discarded during import', async ({ page }) => {
    await loadFresh(page);
    const tracker = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?edge=malformed-lifecycle');
        state.initializeState();
        state.importFromJSON(JSON.stringify({
            items: [{ id: 'a', name: 'A', duration: '10m' }],
            tracker: {
                isRunning: false,
                startedAt: null,
                completedAt: '2026-09-03T10:10:00.000Z',
                activeItemIndex: 1,
                activeItemId: null
            }
        }));
        return state.getState().tracker;
    });

    expect(tracker).toMatchObject({
        isRunning: false,
        startedAt: null,
        activeItemIndex: 0,
        activeItemId: null,
        activeStartedAt: null,
        completedAt: null
    });
});
