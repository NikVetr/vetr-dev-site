import { test, expect } from '@playwright/test';

async function loadFresh(page) {
    await page.goto('/agendamatic/');
    await expect(page.locator('.agenda-row')).toHaveCount(5);
}

test('item details dialog saves every authored field and keeps keyboard focus contained', async ({ page }) => {
    await loadFresh(page);
    const notesTrigger = page.locator('.agenda-row [data-action="notes"]').first();
    await notesTrigger.click();

    const modal = page.locator('#notes-modal');
    await expect(modal).toHaveAttribute('aria-hidden', 'false');
    await expect(modal.locator('[role="dialog"]')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#editor-textarea')).toBeFocused();
    await expect(modal.getByRole('button', { name: 'Bold', exact: true })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Code block', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close item details' })).toBeVisible();

    await page.locator('#editor-context').fill('Background for the decision');
    await page.locator('#editor-textarea').fill('agenda note');
    await page.locator('#editor-textarea').evaluate(element => element.setSelectionRange(0, 6));
    await modal.locator('.editor-toolbar [data-action="bold"]').click();
    await expect(page.locator('#editor-textarea')).toHaveValue('**agenda** note');
    await page.locator('#editor-prep').fill('Read appendix A');

    await page.locator('#modal-save').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#modal-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#modal-save')).toBeFocused();
    await page.locator('#modal-save').click();
    await expect(modal).toHaveAttribute('aria-hidden', 'true');
    await expect(notesTrigger).toBeFocused();

    const saved = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        const item = getState().items[0];
        return { context: item.context, notes: item.notes, prep: item.prep };
    });
    expect(saved).toEqual({
        context: 'Background for the decision',
        notes: '**agenda** note',
        prep: 'Read appendix A'
    });

    await notesTrigger.click();
    await page.locator('#editor-context').focus();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveAttribute('aria-hidden', 'true');
    await expect(notesTrigger).toBeFocused();
});

test('exports sanitize authored details and classify only real meeting hosts', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        const exports = await import('/agendamatic/js/export.js');
        const first = state.getState().items[0];
        state.updateItem(first.id, {
            context: 'Board <context> & risks\nSecond line',
            prep: 'Read appendix | A',
            notes: 'Private notes'
        });
        state.updateMetadata({
            title: 'Review <script>',
            url: 'javascript:alert(1)',
            attendeeGroups: [{
                id: 'board',
                name: 'Board',
                attendees: [{ id: 'person', name: 'Sam | Lee', present: true }]
            }],
            actionItems: [{ id: 'action', text: 'File <report>', owner: 'Sam', done: true }]
        });

        const options = {
            includeHeader: true,
            includeContext: true,
            includePrep: true,
            includeNotes: true,
            includeActionItems: true
        };
        const result = {
            markdown: exports.generateMarkdown(options),
            plain: exports.generatePlainText(options),
            doc: exports.generateDocx(options),
            disabled: exports.generateMarkdown({ ...options, includeContext: false, includePrep: false })
        };
        const meetingLinkOutput = url => {
            state.updateMetadata({ url });
            return exports.generatePlainText(options);
        };

        return {
            ...result,
            genericLookalike: meetingLinkOutput('https://notzoom.us/j/123'),
            suffixLookalike: meetingLinkOutput('https://zoom.us.evil.example/j/123'),
            zoom: meetingLinkOutput('https://department.zoom.us/j/123'),
            teams: meetingLinkOutput('https://teams.microsoft.com/l/meetup-join/123'),
            meet: meetingLinkOutput('https://meet.google.com/abc-defg-hij')
        };
    });

    expect(result.markdown).toContain('| Board: | ☑ Sam \\| Lee |  |  |  |  |');
    expect(result.markdown).toContain('Review &lt;script&gt; Agenda');
    expect(result.markdown).toContain('- [x] File &lt;report&gt; — Sam');
    expect(result.markdown).not.toContain('<script>');
    expect(result.markdown).not.toContain('javascript:');
    expect(result.markdown).toContain('| Context: Board &lt;context&gt; &amp; risks Second line |');
    expect(result.markdown).toContain('| Preparation: Read appendix \\| A |');
    expect(result.markdown.indexOf('| Context:')).toBeLessThan(result.markdown.indexOf('| Welcome |'));
    expect(result.plain).toContain('Context: Board <context> & risks\n      Second line');
    expect(result.plain).toContain('Preparation: Read appendix | A');
    expect(result.plain).toContain('[x] File <report> — Sam');
    expect(result.doc).toContain('<strong>Context:</strong> Board &lt;context&gt; &amp; risks<br>Second line');
    expect(result.doc).toContain('<strong>Preparation:</strong> Read appendix | A');
    expect(result.doc).toContain('File &lt;report&gt; — Sam');
    expect(result.doc).toContain('Review &lt;script&gt;');
    expect(result.doc).not.toContain('javascript:');
    for (const output of [result.markdown, result.plain, result.doc]) {
        expect(output).not.toContain('Add meeting context');
        expect(output).not.toContain('Review previous meeting notes');
        expect(output).not.toContain('Prepare materials for each agenda item');
    }
    expect(result.disabled).not.toContain('Board <context>');
    expect(result.disabled).not.toContain('Read appendix');
    expect(result.genericLookalike).toContain('Meeting link:');
    expect(result.genericLookalike).not.toContain('Zoom:');
    expect(result.suffixLookalike).toContain('Meeting link:');
    expect(result.suffixLookalike).not.toContain('Zoom:');
    expect(result.zoom).toContain('Zoom:');
    expect(result.teams).toContain('Microsoft Teams:');
    expect(result.meet).toContain('Google Meet:');
});

test('rewound active item stays live in generated minutes', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        const exports = await import('/agendamatic/js/export.js');
        state.importFromJSON(JSON.stringify({
            items: [
                { id: 'a', name: 'Reopened item', duration: '10m' },
                { id: 'b', name: 'Future item', duration: '10m' }
            ],
            settings: { startTime: '10:00', buffer: 0 },
            tracker: {
                isRunning: true,
                startedAt: '2026-09-03T10:00:00.000Z',
                scheduledStartAt: '2026-09-03T10:00:00.000Z',
                activeItemIndex: 0,
                activeItemId: 'a',
                activeStartedAt: '2026-09-03T10:00:00.000Z'
            }
        }));
        state.advanceToNextItem(new Date('2026-09-03T10:15:00.000Z'));
        state.retreatToPreviousItem();

        return {
            tracker: state.getState().tracker,
            markdown: exports.generateMarkdown(),
            plain: exports.generatePlainText(),
            doc: exports.generateDocx()
        };
    });

    expect(result.tracker).toMatchObject({
        activeItemId: 'a',
        completedDiffById: { a: 5 }
    });
    expect(result.markdown).toContain('| Live vs Expected:');
    expect(result.markdown).not.toContain('| Actual vs Expected:');
    expect(result.plain).toContain('\n   Live:');
    expect(result.plain).not.toContain('\n   Actual:');
    expect(result.doc).toContain('>live:');
    expect(result.doc).not.toContain('>actual:');
});

test('duration formatting is stable and share-copy fallbacks report their real result', async ({ page }) => {
    await loadFresh(page);
    const result = await page.evaluate(async () => {
        const { formatDuration, parseDuration } = await import('/agendamatic/js/utils.js');
        const { copyShareLink } = await import('/agendamatic/js/export.js');
        const state = await import('/agendamatic/js/state.js');

        let copiedValue = '';
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: command => {
                copiedValue = document.querySelector('textarea[aria-hidden="true"]')?.value || '';
                return command === 'copy';
            }
        });
        const missingApiSucceeded = await copyShareLink();

        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async () => { throw new Error('denied'); } }
        });
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: () => false
        });
        const rejectedApiSucceeded = await copyShareLink();

        const formatted = [
            formatDuration(0.1 + 0.2),
            formatDuration(25.333333333333336),
            formatDuration(60.300000000000004),
            formatDuration(59.999999999),
            formatDuration(Number.NaN)
        ];
        state.importFromJSON(JSON.stringify({
            items: [
                { id: 'a', name: 'A', duration: formatted[1] },
                { id: 'b', name: 'B', duration: formatted[2] }
            ]
        }));
        const normalizedDurations = state.getState().items.map(item => item.duration);

        state.importFromJSON(JSON.stringify({
            items: [
                { id: 'first', name: 'First', duration: '10m' },
                { id: 'locked', name: 'Locked', duration: '2.5m', locked: true },
                { id: 'last', name: 'Last', duration: '10m' }
            ],
            settings: { startTime: '10:00', buffer: 0 }
        }));
        state.updateTracker({
            isRunning: true,
            startedAt: '2026-01-02T10:00:00.000Z',
            scheduledStartAt: '2026-01-02T10:00:00.000Z',
            activeStartedAt: '2026-01-02T10:00:00.000Z',
            activeItemIndex: 0,
            activeItemId: 'first'
        });
        state.advanceToNextItem(new Date('2026-01-02T10:05:00.000Z'));

        return {
            formatted,
            parsed: formatted.map(parseDuration),
            normalizedDurations,
            fractionalRedistribution: state.getState().items.map(item => item.duration),
            missingApiSucceeded,
            rejectedApiSucceeded,
            copiedValue,
            failureText: document.querySelector('.notification')?.textContent,
            failureClass: document.querySelector('.notification')?.className
        };
    });

    expect(result.formatted).toEqual(['0.3m', '25.3m', '1h0.3m', '1h', '0m']);
    expect(result.parsed).toEqual([0.3, 25.3, 60.3, 60, 0]);
    expect(result.normalizedDurations).toEqual(['25.3m', '1h0.3m']);
    expect(result.fractionalRedistribution).toEqual(['5m', '2.5m', '15m']);
    expect(result.missingApiSucceeded).toBe(true);
    expect(result.rejectedApiSucceeded).toBe(false);
    const copiedUrl = new URL(result.copiedValue);
    expect(copiedUrl.searchParams.get('share')).toBe('1');
    expect(copiedUrl.searchParams.get('s')).toBeTruthy();
    expect(result.failureText).toContain('Unable to copy link');
    expect(result.failureClass).toContain('warning');
});

test('Locked, Notes, Duration, and CSV bulk editing validate and round-trip values', async ({ page }) => {
    await loadFresh(page);
    const modal = page.locator('#bulk-edit-modal');
    const textarea = page.locator('#bulk-edit-text');
    const lockedHeader = page.locator('.bulk-column-button[data-bulk-field="locked"]').first();
    await lockedHeader.click();
    await expect(modal).toHaveAttribute('aria-hidden', 'false');
    await expect(textarea).toHaveValue('false\ntrue\ntrue\nfalse\nfalse');
    await expect(textarea).toBeFocused();

    await page.locator('#bulk-edit-apply').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#bulk-edit-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#bulk-edit-apply')).toBeFocused();
    await textarea.fill('true\nfalse\ntrue\nfalse\ntrue');
    await page.locator('#bulk-edit-apply').click();
    await expect(modal).toHaveAttribute('aria-hidden', 'true');
    await expect(lockedHeader).toBeFocused();

    const validLocks = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items.map(item => item.locked);
    });
    expect(validLocks).toEqual([true, false, true, false, true]);

    await lockedHeader.click();
    await textarea.fill('yes\nfalse\ntrue\nfalse\ntrue');
    await page.locator('#bulk-edit-apply').click();
    await expect(page.locator('#bulk-edit-warning')).toContainText('use true or false');
    await expect(modal).toHaveClass(/visible/);
    await textarea.focus();
    await page.keyboard.press('Escape');
    await expect(lockedHeader).toBeFocused();

    const durationHeader = page.locator('.bulk-column-button[data-bulk-field="duration"]').first();
    const originalDurations = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items.map(item => item.duration);
    });
    await durationHeader.click();
    await textarea.fill('5m\nnot-a-duration\n15m\n10m\n5m');
    await page.locator('#bulk-edit-apply').click();
    await expect(page.locator('#bulk-edit-warning')).toContainText('Invalid Duration');
    const unchangedDurations = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items.map(item => item.duration);
    });
    expect(unchangedDurations).toEqual(originalDurations);
    await page.locator('#bulk-edit-cancel').click();

    const notesHeader = page.locator('.bulk-column-button[data-bulk-field="notes"]').first();
    const encodedNotes = [
        'First\\nline',
        'Comma\\, retained',
        'Slash\\\\ retained',
        '',
        'Final'
    ].join('\n');
    await notesHeader.click();
    await textarea.fill(encodedNotes);
    await page.locator('#bulk-edit-apply').click();
    await expect(notesHeader).toBeFocused();
    const notes = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items.map(item => item.notes);
    });
    expect(notes).toEqual(['First\nline', 'Comma, retained', 'Slash\\ retained', '', 'Final']);

    await page.locator('#btn-edit-csv').click();
    const csv = await textarea.inputValue();
    const csvLines = csv.split('\n');
    csvLines[1] = csvLines[1].replace(',true,', ',maybe,');
    await textarea.fill(csvLines.join('\n'));
    await page.locator('#bulk-edit-apply').click();
    await expect(page.locator('#bulk-edit-warning')).toContainText('Invalid Locked');
    await expect(modal).toHaveClass(/visible/);

    csvLines[1] = csvLines[1].replace(',maybe,', ',true,').replace(',5m,', ',invalid,');
    await textarea.fill(csvLines.join('\n'));
    await page.locator('#bulk-edit-apply').click();
    await expect(page.locator('#bulk-edit-warning')).toContainText('Invalid Duration');
    await expect(modal).toHaveClass(/visible/);
});

test('whole-agenda CSV keeps IDs and item details attached through structural edits', async ({ page }) => {
    await loadFresh(page);
    await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.replaceItems([
            {
                id: 'alpha',
                name: 'Alpha',
                lead: 'A',
                duration: '5m',
                locked: false,
                context: 'Context A, one',
                prep: 'Prep A\nstep',
                notes: 'Notes A',
                themeColor: 1
            },
            {
                id: 'beta',
                name: 'Beta',
                lead: 'B',
                duration: '10m',
                locked: true,
                context: 'Context B',
                prep: 'Prep B',
                notes: 'Notes B',
                themeColor: 2
            }
        ]);
    });

    const modal = page.locator('#bulk-edit-modal');
    const textarea = page.locator('#bulk-edit-text');
    await page.locator('#btn-edit-csv').click();
    let lines = (await textarea.inputValue()).split('\n');
    expect(lines[0]).toBe('ID,Item,Lead,Color,Duration,Locked,Context,Preparation,Notes');
    await textarea.fill([lines[0], lines[2], lines[1]].join('\n'));
    await page.locator('#bulk-edit-apply').click();

    let items = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items;
    });
    expect(items.map(item => item.id)).toEqual(['beta', 'alpha']);
    expect(items[0]).toMatchObject({ name: 'Beta', context: 'Context B', prep: 'Prep B', notes: 'Notes B' });
    expect(items[1]).toMatchObject({ name: 'Alpha', context: 'Context A, one', prep: 'Prep A\nstep', notes: 'Notes A' });

    await page.locator('#btn-edit-csv').click();
    lines = (await textarea.inputValue()).split('\n');
    await textarea.fill([
        lines[0],
        lines[1],
        ',Gamma,G,#4caf50,2.5m,false,Context G,Prep G,Notes G'
    ].join('\n'));
    await page.locator('#bulk-edit-apply').click();
    items = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items;
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'beta', name: 'Beta', context: 'Context B' });
    expect(items[1]).toMatchObject({ name: 'Gamma', duration: '2.5m', context: 'Context G', prep: 'Prep G' });
    expect(items[1].id).not.toBe('alpha');
    expect(items[1].id).not.toBe('beta');

    await page.locator('#btn-edit-csv').click();
    lines = (await textarea.inputValue()).split('\n');
    await textarea.fill([lines[0], lines[1], lines[1]].join('\n'));
    await page.locator('#bulk-edit-apply').click();
    await expect(page.locator('#bulk-edit-warning')).toContainText('Duplicate ID');
    await expect(modal).toHaveClass(/visible/);
    const idsAfterRejectedEdit = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items.map(item => item.id);
    });
    expect(idsAfterRejectedEdit).toEqual(items.map(item => item.id));
});

test('legacy six-column CSV preserves positional details and honors live-run guards', async ({ page }) => {
    await loadFresh(page);
    await page.evaluate(async () => {
        const state = await import('/agendamatic/js/state.js');
        state.replaceItems([
            {
                id: 'legacy-alpha',
                name: 'Alpha',
                lead: 'A',
                duration: '5m',
                locked: false,
                context: 'Keep context A',
                prep: 'Keep prep A',
                notes: 'Old notes A',
                themeColor: 1
            },
            {
                id: 'legacy-beta',
                name: 'Beta',
                lead: 'B',
                duration: '10m',
                locked: true,
                context: 'Keep context B',
                prep: 'Keep prep B',
                notes: 'Old notes B',
                themeColor: 2
            }
        ]);
    });

    const modal = page.locator('#bulk-edit-modal');
    const textarea = page.locator('#bulk-edit-text');
    const legacyCsv = [
        'Item,Lead,Color,Duration,Locked,Notes',
        'Alpha revised,A2,#2196f3,2.5m,true,New notes A',
        'Beta revised,B2,#9c27b0,7.5m,false,New notes B',
        'Gamma,G,#4caf50,3m,false,New notes G'
    ].join('\n');
    await page.locator('#btn-edit-csv').click();
    await textarea.fill(legacyCsv);
    await expect(page.locator('#bulk-edit-warning')).toHaveText('');
    expect(await textarea.evaluate(element => element.style.backgroundImage)).toBe('');
    await page.locator('#bulk-edit-apply').click();

    const items = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items;
    });
    expect(items[0]).toMatchObject({
        id: 'legacy-alpha',
        name: 'Alpha revised',
        duration: '2.5m',
        locked: true,
        context: 'Keep context A',
        prep: 'Keep prep A',
        notes: 'New notes A'
    });
    expect(items[1]).toMatchObject({
        id: 'legacy-beta',
        name: 'Beta revised',
        duration: '7.5m',
        locked: false,
        context: 'Keep context B',
        prep: 'Keep prep B',
        notes: 'New notes B'
    });
    expect(items[2]).toMatchObject({ name: 'Gamma', context: '', prep: '', notes: 'New notes G' });
    expect(items[2].id).toBeTruthy();

    await page.evaluate(async activeItemId => {
        const state = await import('/agendamatic/js/state.js');
        const now = new Date().toISOString();
        state.updateTracker({
            isRunning: true,
            startedAt: now,
            scheduledStartAt: now,
            activeStartedAt: now,
            activeItemIndex: 2,
            activeItemId
        });
    }, items[2].id);
    await page.locator('#btn-edit-csv').click();
    await textarea.fill(legacyCsv.split('\n').slice(0, 3).join('\n'));
    await page.locator('#bulk-edit-apply').click();
    await expect(page.locator('#bulk-edit-warning')).toContainText('active item cannot be removed');
    await expect(modal).toHaveClass(/visible/);
    const retainedIds = await page.evaluate(async () => {
        const { getState } = await import('/agendamatic/js/state.js');
        return getState().items.map(item => item.id);
    });
    expect(retainedIds).toEqual(items.map(item => item.id));
});

test('agenda controls keep accessible semantics and focus without page errors', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await loadFresh(page);
    const semantics = await page.evaluate(() => ({
        steppers: [...document.querySelectorAll('.time-spinner button')].every(button => (
            button.type === 'button' && Boolean(button.getAttribute('aria-label'))
        )),
        startTimes: [...document.querySelectorAll('.interval-start-btn')].every(button => (
            button.type === 'button' && button.getAttribute('aria-label')?.startsWith('Change start time')
        )),
        endTimes: [...document.querySelectorAll('.interval-end-btn')].every(button => (
            button.type === 'button' && button.getAttribute('aria-label')?.startsWith('Change end time')
        ))
    }));
    expect(semantics).toEqual({ steppers: true, startTimes: true, endTimes: true });
    await expect(page.getByRole('button', { name: 'Increase start time', exact: true })).toHaveAttribute('type', 'button');
    await expect(page.getByRole('button', { name: 'Decrease start time', exact: true })).toBeVisible();

    const durationUp = page.locator('.agenda-row [data-action="duration-up"]').first();
    await durationUp.focus();
    await page.keyboard.press('Enter');
    await expect(durationUp).toBeFocused();

    const lock = page.locator('.agenda-row input[data-field="locked"]').first();
    await lock.evaluate(element => {
        // Moving to the next control before the next frame must not let a stepper steal focus back.
        element.closest('.agenda-row').querySelector('[data-action="duration-up"]').click();
        element.focus();
        return new Promise(resolve => requestAnimationFrame(resolve));
    });
    await expect(lock).toBeFocused();
    await page.keyboard.press('Space');
    await expect(lock).toBeFocused();

    const colorButton = page.locator('.agenda-color-button').first();
    await colorButton.click();
    await expect(page.locator('#item-color-hue')).toBeFocused();
    await page.locator('#item-color-hue').evaluate(element => {
        element.value = '123';
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#item-color-apply').click();
    await expect(colorButton).toBeFocused();
    expect(pageErrors).toEqual([]);
});
