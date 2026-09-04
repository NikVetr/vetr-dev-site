import { test, expect } from '@playwright/test';

async function loadFresh(page) {
    await page.goto('/agendamatic/');
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    await page.goto('/agendamatic/');
    await expect(page.locator('.agenda-row')).toHaveCount(5);
}

test('optional alert delivery failures stay isolated and a failed threshold is not retried', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
        window.__alertAudit = {
            audioConstructors: 0,
            notificationConstructors: 0,
            resumeCalls: 0
        };
        class ThrowingNotification {
            static permission = 'granted';
            static requestPermission() {
                return Promise.resolve('granted');
            }
            constructor() {
                window.__alertAudit.notificationConstructors += 1;
                throw new Error('notification-constructor-failed');
            }
        }
        class ThrowingAudioContext {
            constructor() {
                window.__alertAudit.audioConstructors += 1;
                throw new Error('audio-context-failed');
            }
        }
        Object.defineProperty(window, 'Notification', {
            configurable: true,
            writable: true,
            value: ThrowingNotification
        });
        Object.defineProperty(window, 'AudioContext', {
            configurable: true,
            writable: true,
            value: ThrowingAudioContext
        });
    });
    await loadFresh(page);

    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        const alerts = await import('/agendamatic/js/alerts.js');
        const timer = await import('/agendamatic/js/timer.js');
        timer.destroyTimer();
        state.updateSettings({
            oneMinWarning: false,
            soundEffects: true,
            desktopNotifications: true
        });

        alerts.triggerAlert({ seconds: 60, itemName: 'Direct alert' });

        class ResumeRejectingAudioContext {
            constructor() {
                this.state = 'suspended';
                this.currentTime = 0;
                this.destination = {};
            }
            resume() {
                window.__alertAudit.resumeCalls += 1;
                return Promise.reject(new Error('audio-resume-failed'));
            }
            createOscillator() {
                return {
                    type: 'sine',
                    frequency: { value: 0 },
                    connect() {},
                    start() {},
                    stop() {}
                };
            }
            createGain() {
                return {
                    gain: {
                        setValueAtTime() {},
                        linearRampToValueAtTime() {},
                        exponentialRampToValueAtTime() {}
                    },
                    connect() {}
                };
            }
        }
        window.AudioContext = ResumeRejectingAudioContext;

        const now = new Date();
        state.importFromJSON(JSON.stringify({
            items: [{ id: 'retry', name: 'Retry', duration: '2m' }],
            settings: {
                alertOffsetsSeconds: [60],
                oneMinWarning: false,
                soundEffects: true,
                desktopNotifications: true
            },
            tracker: {
                isRunning: true,
                startedAt: now.toISOString(),
                scheduledStartAt: now.toISOString(),
                activeItemIndex: 0,
                activeItemId: 'retry',
                activeStartedAt: new Date(now.getTime() - 59000).toISOString()
            }
        }));
        alerts.processAlertTick();
        state.updateTracker({
            activeStartedAt: new Date(now.getTime() - 61000).toISOString()
        });
        alerts.processAlertTick();
        alerts.processAlertTick();
        await new Promise(resolve => setTimeout(resolve, 25));
        return window.__alertAudit;
    });

    expect(result).toEqual({
        audioConstructors: 1,
        notificationConstructors: 2,
        resumeCalls: 1
    });
    expect(pageErrors).toEqual([]);
});

test('unchecking desktop notifications cancels a pending permission request', async ({ page }) => {
    await page.addInitScript(() => {
        window.__permissionRequests = 0;
        window.__resolvePermission = null;
        class PendingNotification {
            static permission = 'default';
            static requestPermission() {
                window.__permissionRequests += 1;
                return new Promise(resolve => {
                    window.__resolvePermission = resolve;
                });
            }
        }
        Object.defineProperty(window, 'Notification', {
            configurable: true,
            value: PendingNotification
        });
    });
    await loadFresh(page);

    const checkbox = page.locator('#desktop-notifications');
    await checkbox.check();
    await expect.poll(() => page.evaluate(() => window.__permissionRequests)).toBe(1);
    await checkbox.uncheck();
    await page.evaluate(() => window.__resolvePermission('granted'));
    await page.waitForTimeout(25);

    const result = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        const checkbox = document.querySelector('#desktop-notifications');
        return {
            checked: checkbox.checked,
            pending: checkbox.dataset.permissionPending,
            busy: checkbox.getAttribute('aria-busy'),
            enabled: getState().settings.desktopNotifications
        };
    });
    expect(result).toEqual({
        checked: false,
        pending: undefined,
        busy: null,
        enabled: false
    });
});

test('Sync System Time anchors a new run to the exact current second', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        const timer = await import('/agendamatic/js/timer.js');
        timer.destroyTimer();
        state.resetState();
        state.updateSettings({ syncSystemTime: true });

        const RealDate = Date;
        const frozenTime = '2026-09-03T17:20:59.000Z';
        window.Date = class extends RealDate {
            constructor(...args) {
                super(...(args.length ? args : [frozenTime]));
            }
            static now() {
                return new RealDate(frozenTime).getTime();
            }
        };
        try {
            timer.startTimer();
            return {
                scheduledStartAt: state.getState().tracker.scheduledStartAt,
                activeStartedAt: state.getState().tracker.activeStartedAt,
                remaining: state.calculateAdjustedIntervals(new Date()).currentRemaining
            };
        } finally {
            window.Date = RealDate;
        }
    });

    expect(result.scheduledStartAt).toBe('2026-09-03T17:20:59.000Z');
    expect(result.activeStartedAt).toBe('2026-09-03T17:20:59.000Z');
    expect(result.remaining).toBeCloseTo(5, 8);
});

test('settings warnings render above the mobile drawer', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await loadFresh(page);
    await page.locator('#btn-settings-toggle').click();
    await page.locator('#alert-warning-offsets').fill('not-a-time');
    await page.locator('#alert-warning-offsets').dispatchEvent('change');
    await expect(page.locator('.notification')).toHaveClass(/visible/);

    const result = await page.evaluate(() => {
        const notification = document.querySelector('.notification');
        const sidebar = document.querySelector('#settings-sidebar');
        const rect = notification.getBoundingClientRect();
        const topElement = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
        );
        return {
            aboveDrawer: Number(getComputedStyle(notification).zIndex) >
                Number(getComputedStyle(sidebar).zIndex),
            topmost: topElement === notification || notification.contains(topElement)
        };
    });
    expect(result).toEqual({ aboveDrawer: true, topmost: true });
});

test('an exact starting threshold fires once per item and run across pause and resume', async ({ page }) => {
    await page.addInitScript(() => {
        window.__notificationCount = 0;
        class CountingNotification {
            static permission = 'granted';
            static requestPermission() {
                return Promise.resolve('granted');
            }
            constructor() {
                window.__notificationCount += 1;
            }
        }
        Object.defineProperty(window, 'Notification', {
            configurable: true,
            value: CountingNotification
        });
    });
    await loadFresh(page);

    const counts = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        const alerts = await import('/agendamatic/js/alerts.js');
        const timer = await import('/agendamatic/js/timer.js');
        timer.destroyTimer();
        const RealDate = Date;
        const frozenTime = '2026-09-03T17:20:00.000Z';
        window.Date = class extends RealDate {
            constructor(...args) {
                super(...(args.length ? args : [frozenTime]));
            }
            static now() {
                return new RealDate(frozenTime).getTime();
            }
        };
        try {
            state.importFromJSON(JSON.stringify({
                items: [{ id: 'one-minute', name: 'One minute', duration: '1m' }],
                settings: {
                    alertOffsetsSeconds: [60],
                    oneMinWarning: false,
                    soundEffects: false,
                    desktopNotifications: true
                },
                tracker: {
                    isRunning: true,
                    startedAt: frozenTime,
                    scheduledStartAt: frozenTime,
                    activeItemIndex: 0,
                    activeItemId: 'one-minute',
                    activeStartedAt: frozenTime
                }
            }));
            alerts.processAlertTick();
            alerts.processAlertTick();
            const initial = window.__notificationCount;

            state.updateTracker({ isRunning: false, pausedAt: frozenTime });
            alerts.processAlertTick();
            state.updateTracker({ isRunning: true, pausedAt: null });
            alerts.processAlertTick();
            const resumed = window.__notificationCount;

            state.updateTracker({
                activeStartedAt: new RealDate(
                    new RealDate(frozenTime).getTime() - 1500
                ).toISOString()
            });
            alerts.processAlertTick();
            const afterCrossing = window.__notificationCount;

            state.updateTracker({
                startedAt: '2026-09-03T17:20:00.001Z',
                activeStartedAt: frozenTime
            });
            alerts.processAlertTick();
            const newRun = window.__notificationCount;
            return { initial, resumed, afterCrossing, newRun };
        } finally {
            window.Date = RealDate;
        }
    });

    expect(counts).toEqual({
        initial: 1,
        resumed: 1,
        afterCrossing: 1,
        newRun: 2
    });
});
