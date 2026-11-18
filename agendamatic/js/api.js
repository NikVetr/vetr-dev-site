import { calculateAdjustedIntervals, getExpectedVsActualData, normalizeClockTime, normalizeState } from './state.js';
import { parseDuration } from './utils.js';
import { generateMarkdown, generatePlainText, generateDocx } from './export.js';

const formats = { markdown: generateMarkdown, text: generatePlainText, html: generateDocx };

/** @param {string} path @param {string} message @returns {never} */
function invalid(path, message) {
    throw Object.assign(new Error(message), {
        code: 'invalid_request', issues: [{ code: 'invalid_value', path, message }],
    });
}

/** @param {any} value @param {string} path */
function timestamp(value, path) {
    if (typeof value !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/i.test(value) || !Number.isFinite(Date.parse(value))) {
        invalid(path, 'Expected an ISO timestamp with a timezone.');
    }
    return new Date(value);
}

/** @param {any} request */
export function submit(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) invalid('', 'Expected an agenda request object.');
    for (const key of Object.keys(request)) {
        if (!['agenda', 'at', 'format'].includes(key)) invalid(key, 'Unknown request field.');
    }
    const { agenda, format } = request;
    const at = timestamp(request.at, 'at');
    if (!agenda || !Array.isArray(agenda.items)) invalid('agenda.items', 'Expected a saved agenda or an agenda items array.');
    if (format !== undefined && (typeof format !== 'string' || !Object.hasOwn(formats, format))) invalid('format', 'Choose markdown, text or html.');
    if (!normalizeClockTime(agenda.settings?.startTime, null)) invalid('agenda.settings.startTime', 'Expected a valid local clock time.');
    const buffer = agenda.settings.buffer ?? 0;
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 30) invalid('agenda.settings.buffer', 'Expected 0–30 whole minutes.');
    const ids = new Set();
    for (const [key, items] of Object.entries({ items: agenda.items, stagedItems: agenda.stagedItems ?? [] })) {
        if (!Array.isArray(items)) invalid('agenda.' + key, 'Expected an array.');
        for (const [i, item] of items.entries()) {
            const path = 'agenda.' + key + '[' + i + ']';
            if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) invalid(path + '.id', 'Expected a unique nonempty item ID.');
            ids.add(item.id);
            if (typeof item.name !== 'string' || !item.name.trim()) invalid(path + '.name', 'Expected an item name.');
            const minutes = parseDuration(item.duration);
            if (!Number.isFinite(minutes) || Math.round(minutes * 10) <= 0 || minutes > 525600) invalid(path + '.duration', 'Expected a positive agenda duration.');
        }
    }
    for (const key of ['startedAt', 'scheduledStartAt', 'pausedAt', 'completedAt', 'activeStartedAt', 'activeWallStartedAt']) {
        const value = agenda.tracker?.[key];
        if (value != null) timestamp(value, 'agenda.tracker.' + key);
    }
    const state = normalizeState(agenda);
    const schedule = calculateAdjustedIntervals(at, state);
    const variance = getExpectedVsActualData(state, at);
    const content = format === undefined ? {} : { content: formats[format]({}, state, at) };
    // The browser returns the same ISO dates and detached data as the JSON CLI.
    return JSON.parse(JSON.stringify({ schedule, variance, ...content }));
}
