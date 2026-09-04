import { test, expect } from '@playwright/test';

async function loadFresh(page) {
    await page.goto('/agendamatic/');
}

test('versioned links round-trip complete Unicode state and reject broken links safely', async ({ page, browser }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?test=links');
        state.initializeState();
        const imported = state.importFromJSON(JSON.stringify({
            items: [{ id: 'one', name: 'Résumé 🚀', duration: '25m', notes: '議事録 '.repeat(80), themeColor: 4, customColor: '#15e04e' }],
            stagedItems: [{ id: 'later', name: 'Later', duration: '5m' }],
            settings: { startTime: '09:30', pinStartTime: false, pinEndTime: false, density: 'compact' },
            exportOptions: { includeNotes: false, includeActionItems: true },
            metadata: {
                title: 'Planificación',
                attendeeGroup: 'Board',
                attendees: [{ name: 'Ada', present: true }],
                actionItems: [{ text: 'Ship it', owner: 'Ada', done: false }]
            }
        }));
        const encoded = state.encodeStateToURL();
        const decoded = state.decodeStateFromURL(encoded);
        return {
            imported,
            decoded
        };
    });

    expect(result.imported).toBe(true);
    expect(result.decoded.items[0]).toMatchObject({ name: 'Résumé 🚀', customColor: '#15e04e' });
    expect(result.decoded.settings).toMatchObject({ pinStartTime: false, pinEndTime: false, density: 'compact' });
    expect(result.decoded.exportOptions).toMatchObject({ includeNotes: false, includeActionItems: true });
    expect(result.decoded.metadata.attendeeGroups[0]).toMatchObject({ name: 'Board' });
    expect(result.decoded.metadata.actionItems[0]).toMatchObject({ text: 'Ship it', owner: 'Ada' });
    expect(result.decoded.tracker.startedAt).toBeNull();

    const sharedUrl = page.url();
    const recipient = await browser.newPage();
    await recipient.goto(sharedUrl);
    const received = await recipient.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState();
    });
    expect(received.items[0].name).toBe('Résumé 🚀');
    expect(received.metadata.title).toBe('Planificación');
    expect(received.settings.pinStartTime).toBe(false);
    await recipient.close();

    await page.evaluate(async () => {
        const { updateMetadata } = await import('/agendamatic/js/state.js');
        updateMetadata({ title: 'Keep local state' });
    });
    await page.goto('/agendamatic/?s=not-a-valid-state');
    const retainedTitle = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().metadata.title;
    });
    expect(retainedTitle).toBe('Keep local state');
});

test('buffer edits and redistribution preserve boundaries and locked durations', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?test=buffers');
        state.initializeState();
        const makeItems = () => [
            { id: 'a', name: 'A', duration: '10m', locked: false },
            { id: 'b', name: 'B', duration: '10m', locked: false },
            { id: 'c', name: 'C', duration: '10m', locked: false }
        ];
        state.importFromJSON(JSON.stringify({
            items: makeItems(),
            settings: { startTime: '09:00', buffer: 5, pinStartTime: true, pinEndTime: true }
        }));
        const unchangedBoundary = state.calculateIntervals()[1].startTime;
        state.updateIntervalTime(1, 'start', unchangedBoundary);
        const afterBoundaryEdit = state.getState().items.map(item => item.duration);

        state.updateTracker({
            isRunning: true,
            startedAt: '2026-01-02T08:59:00.000Z',
            scheduledStartAt: '2026-01-02T09:00:00.000Z',
            activeItemId: 'a',
            activeStartedAt: '2026-01-02T09:00:00.000Z'
        });
        state.advanceToNextItem(new Date('2026-01-02T09:15:00.000Z'));
        const afterAdvance = {
            durations: state.getState().items.map(item => item.duration),
            end: state.calculateIntervals().at(-1).endTime.toISOString(),
            nextStart: state.getState().tracker.activeStartedAt
        };

        state.importFromJSON(JSON.stringify({
            items: [
                { id: 'current', name: 'Current', duration: '5m', locked: false },
                { id: 'locked', name: 'Locked', duration: '10m', locked: true },
                { id: 'open', name: 'Open', duration: '5m', locked: false }
            ],
            settings: { startTime: '16:00', buffer: 0 }
        }));
        state.updateTracker({
            isRunning: true,
            startedAt: '2026-01-02T15:59:00.000Z',
            scheduledStartAt: '2026-01-02T16:00:00.000Z',
            activeItemId: 'current',
            activeStartedAt: '2026-01-02T16:00:00.000Z'
        });
        state.advanceToNextItem(new Date('2026-01-02T16:01:00.000Z'));
        const expanded = state.getState().items.map(item => item.duration);
        return { afterBoundaryEdit, afterAdvance, expanded };
    });

    expect(result.afterBoundaryEdit).toEqual(['10m', '10m', '10m']);
    expect(result.afterAdvance.durations[0]).toBe('15m');
    expect(result.afterAdvance.end).toBe('2026-01-02T09:40:00.000Z');
    expect(result.afterAdvance.nextStart).toBe('2026-01-02T09:20:00.000Z');
    expect(result.expanded).toEqual(['1m', '10m', '9m']);
});

test('JSON imports validate fields, IDs, durations, and settings', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?test=validation');
        state.initializeState();
        const before = state.exportToJSON();
        const rejected = state.importFromJSON('{"settings":{}}');
        const unchanged = state.exportToJSON() === before;
        const accepted = state.importFromJSON(JSON.stringify({
            items: [
                { id: 'duplicate', name: 7, lead: false, duration: 'nonsense', locked: 'false', notes: 12 },
                { id: 'duplicate', name: 'Second', duration: '0m' }
            ],
            settings: {
                startTime: '99:88',
                buffer: 900,
                density: 'giant',
                timerMode: 'backward',
                darkMode: 'false'
            },
            metadata: {
                attendeeGroups: [{ id: 'same', attendees: [{ id: 'person', name: 9 }, { id: 'person', name: 'Two' }] }]
            }
        }));
        const resultState = state.getState();
        const malformedSnapshotAccepted = state.importFromJSON(JSON.stringify({
            items: [{ id: 'safe', name: 'Safe', duration: '5m' }],
            tracker: {
                varianceMode: true,
                expectedSnapshot: { items: 'not-an-array' }
            }
        }));
        const sanitizedTracker = state.getState().tracker;
        const varianceData = state.getExpectedVsActualData();

        const normalizeDate = date => {
            state.importFromJSON(JSON.stringify({
                items: [{ id: 'date-item', name: 'Date', duration: '5m' }],
                metadata: { date, initialized: true }
            }));
            return state.getState().metadata.date;
        };
        const calendarDates = {
            leap: normalizeDate('2024-02-29'),
            impossible: normalizeDate('2026-02-29')
        };

        const malformedLifecycleAccepted = state.importFromJSON(JSON.stringify({
            items: [{ id: 'lifecycle', name: 'Lifecycle', duration: '10m' }],
            tracker: {
                isRunning: false,
                startedAt: null,
                completedAt: '2026-09-03T10:10:00.000Z',
                activeItemIndex: 1,
                activeItemId: null
            }
        }));
        const sanitizedLifecycle = state.getState().tracker;
        return {
            rejected,
            unchanged,
            accepted,
            normalizedState: resultState,
            malformedSnapshotAccepted,
            sanitizedTracker,
            varianceData,
            calendarDates,
            malformedLifecycleAccepted,
            sanitizedLifecycle
        };
    });

    expect(result).toMatchObject({
        rejected: false,
        unchanged: true,
        accepted: true,
        malformedSnapshotAccepted: true,
        sanitizedTracker: { expectedSnapshot: null, varianceMode: false },
        varianceData: null,
        calendarDates: { leap: '2024-02-29', impossible: '' },
        malformedLifecycleAccepted: true,
        sanitizedLifecycle: {
            isRunning: false,
            startedAt: null,
            activeItemIndex: 0,
            activeItemId: null,
            activeStartedAt: null,
            completedAt: null
        }
    });
    expect(result.normalizedState.items[0]).toMatchObject({ name: '7', lead: 'false', duration: '10m', locked: false, notes: '12' });
    expect(result.normalizedState.items[1].duration).toBe('10m');
    expect(new Set(result.normalizedState.items.map(item => item.id)).size).toBe(2);
    expect(result.normalizedState.settings).toMatchObject({
        startTime: '16:00',
        buffer: 30,
        density: 'comfortable',
        timerMode: 'countdown',
        darkMode: false
    });
    const attendeeIds = result.normalizedState.metadata.attendeeGroups[0].attendees.map(person => person.id);
    expect(new Set(attendeeIds).size).toBe(2);
});

test('tracker finishes, rewinds, and excludes pauses', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js?test=tracker');
        state.initializeState();
        const items = [
            { id: 'a', name: 'A', duration: '10m' },
            { id: 'b', name: 'B', duration: '10m' },
            { id: 'c', name: 'C', duration: '10m' }
        ];
        state.importFromJSON(JSON.stringify({ items, settings: { startTime: '10:00', buffer: 0 } }));
        state.updateTracker({
            isRunning: true,
            startedAt: '2026-01-02T10:00:00.000Z',
            scheduledStartAt: '2026-01-02T10:00:00.000Z',
            activeItemId: 'a',
            activeStartedAt: '2026-01-02T10:00:00.000Z'
        });
        state.advanceToNextItem(new Date('2026-01-02T10:10:00.000Z'));
        state.advanceToNextItem(new Date('2026-01-02T10:20:00.000Z'));
        state.advanceToNextItem(new Date('2026-01-02T10:30:00.000Z'));
        const completed = {
            completedAt: state.getState().tracker.completedAt,
            index: state.getState().tracker.activeItemIndex,
            id: state.getState().tracker.activeItemId
        };
        state.retreatToPreviousItem();
        const rewound = {
            completedAt: state.getState().tracker.completedAt,
            id: state.getState().tracker.activeItemId,
            pausedAt: state.getState().tracker.pausedAt
        };

        const liveState = await import('/agendamatic/js/state.js');
        const timer = await import('/agendamatic/js/timer.js');
        liveState.importFromJSON(JSON.stringify({
            items: [{ id: 'resume', name: 'Resume', duration: '10m' }],
            settings: { startTime: '10:00' },
            tracker: {
                isRunning: false,
                startedAt: '2026-01-02T10:00:00.000Z',
                scheduledStartAt: '2026-01-02T10:00:00.000Z',
                pausedAt: '2026-01-02T10:05:00.000Z',
                activeItemId: 'resume',
                activeStartedAt: '2026-01-02T10:00:00.000Z'
            }
        }));
        const RealDate = Date;
        window.Date = class extends RealDate {
            constructor(...args) {
                super(...(args.length ? args : ['2026-01-02T10:15:00.000Z']));
            }
            static now() { return new RealDate('2026-01-02T10:15:00.000Z').getTime(); }
        };
        timer.startTimer();
        window.Date = RealDate;
        const resumed = {
            scheduledStartAt: liveState.getState().tracker.scheduledStartAt,
            activeStartedAt: liveState.getState().tracker.activeStartedAt,
            accumulatedPauseMs: liveState.getState().tracker.accumulatedPauseMs
        };
        return { completed, rewound, resumed };
    });

    expect(result.completed.id).toBeNull();
    expect(result.completed.index).toBe(3);
    expect(result.completed.completedAt).not.toBeNull();
    expect(result.rewound).toMatchObject({ completedAt: null, id: 'c' });
    expect(result.rewound.pausedAt).toBe(result.completed.completedAt);
    expect(result.resumed).toEqual({
        scheduledStartAt: '2026-01-02T10:10:00.000Z',
        activeStartedAt: '2026-01-02T10:10:00.000Z',
        accumulatedPauseMs: 600000
    });
});
