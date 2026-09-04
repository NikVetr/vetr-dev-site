/**
 * export.js - Export functionality for JSON, Markdown, Text, and DOCX formats
 */

import {
    getState,
    exportToJSON,
    importFromJSON,
    calculateIntervals,
    calculateAdjustedIntervals,
    getExpectedVsActualData
} from './state.js';
import { escapeHtml, formatTime, formatInterval, formatDuration, parseDuration } from './utils.js';

function escapeMarkdownHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeMarkdownTableCell(value) {
    return escapeMarkdownHtml(value)
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, ' ')
        .trim();
}

function formatAgendaDateLine(date = new Date()) {
    return new Intl.DateTimeFormat([], {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    }).format(date);
}

function formatFileDate(date = new Date()) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function formatAgendaTimeWithZone(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'TBD';
    const time = new Intl.DateTimeFormat([], {
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
    const parts = new Intl.DateTimeFormat([], {
        timeZoneName: 'short'
    }).formatToParts(date);
    const tz = parts.find(part => part.type === 'timeZoneName')?.value || '';
    return `${time}${tz ? ` ${tz}` : ''}`;
}

function getAttendeeGroups(metadata, fallbackLeads = []) {
    if (Array.isArray(metadata?.attendeeGroups) && metadata.attendeeGroups.length) {
        return metadata.attendeeGroups;
    }
    const attendees = Array.isArray(metadata?.attendees) ? metadata.attendees : [];
    if (attendees.length) {
        return [{ name: metadata.attendeeGroup || 'Attendees', attendees }];
    }
    const uniqueLeads = [...new Set(fallbackLeads.map(value => String(value || '').trim()).filter(Boolean))];
    return uniqueLeads.length
        ? [{ name: 'Attendees', attendees: uniqueLeads.map(name => ({ name, present: false })) }]
        : [];
}

function getActionItems(metadata) {
    return Array.isArray(metadata?.actionItems)
        ? metadata.actionItems.filter(item => String(item?.text || '').trim())
        : [];
}

function safeMeetingUrl(value) {
    if (!value) return '';
    try {
        const url = new URL(String(value));
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

function hostMatches(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
}

function meetingLinkDetails(value) {
    const url = safeMeetingUrl(value);
    if (!url) return null;
    const host = new URL(url).hostname.toLowerCase();
    const label = ['zoom.us', 'zoom.com', 'zoomgov.com'].some(domain => hostMatches(host, domain))
        ? 'Zoom'
        : ['teams.microsoft.com', 'teams.live.com'].some(domain => hostMatches(host, domain))
            ? 'Microsoft Teams'
            : hostMatches(host, 'meet.google.com')
                ? 'Google Meet'
                : 'Meeting link';
    return { label, url };
}

function authoredValue(value) {
    return String(value ?? '').trim();
}

function formatPlainDetail(value) {
    return authoredValue(value).replace(/\r?\n/g, '\n      ');
}

function docDetailRow(label, value, columnCount) {
    const content = escapeHtml(authoredValue(value)).replace(/\r?\n/g, '<br>');
    return `<tr><td colspan="${columnCount}"><strong>${label}:</strong> ${content}</td></tr>\n`;
}

function getDocumentKind(state = getState()) {
    return state.tracker?.startedAt ? 'Minutes' : 'Agenda';
}

function getExportStem(state = getState()) {
    return getDocumentKind(state).toLowerCase();
}

function getExportItems(state = getState()) {
    return state.tracker?.startedAt ? calculateAdjustedIntervals().items : calculateIntervals();
}

function getActualityLabel(itemId, state = getState()) {
    if (!state.tracker?.completedAt && state.tracker?.activeItemId === itemId) {
        return 'live';
    }
    if (state.tracker?.completedAt || Object.prototype.hasOwnProperty.call(state.tracker?.completedDiffById || {}, itemId)) {
        return 'actual';
    }
    return 'projected';
}

function getItemDuration(item) {
    return item.adjustedDuration === undefined
        ? (item.duration || '0m')
        : formatDuration(item.adjustedDuration);
}

function formatMeetingLink(url) {
    const link = meetingLinkDetails(url);
    return link ? `[${link.label}](<${escapeMarkdownHtml(link.url)}>)` : '';
}

/**
 * Generate Markdown export of the agenda
 * @param {Object} options - Export options
 * @returns {string} Markdown content
 */
export function generateMarkdown(options = {}) {
    const state = getState();
    const {
        includeHeader = true,
        includeNotes = true,
        includePrep = false,
        includeContext = false,
        includeActionItems = false
    } = {
        ...state.exportOptions,
        ...options
    };

    const items = getExportItems(state);
    const stagedItems = state.stagedItems || [];
    const varianceData = getExpectedVsActualData();
    const varianceById = varianceData?.byId || {};
    const lines = [];
    const now = new Date();
    const kind = getDocumentKind(state);
    const metadata = state.metadata || {};
    const leads = items.map(item => item.lead);
    const attendeeGroups = getAttendeeGroups(metadata, leads);
    const tzName = new Intl.DateTimeFormat([], { timeZoneName: 'short' })
        .formatToParts(now)
        .find(part => part.type === 'timeZoneName')?.value || 'local';

    if (includeHeader) {
        const startTime = items.length > 0 ? formatAgendaTimeWithZone(items[0].startTime) : 'TBD';
        const endTime = items.length > 0 ? formatAgendaTimeWithZone(items[items.length - 1].endTime) : 'TBD';
        lines.push('autoCHAIR');
        lines.push(`${escapeMarkdownHtml(metadata.title || 'Meeting')} ${kind}`);
        lines.push(escapeMarkdownHtml(metadata.date || formatAgendaDateLine(now)));
        lines.push('');
        lines.push('| Location |  | Date |  | Time |  |');
        lines.push('| :---- | :---- | :---- | :---- | :---- | :---- |');
        lines.push(`| ${escapeMarkdownTableCell(metadata.location || 'TBD')} | ${formatMeetingLink(metadata.url)} | ${escapeMarkdownTableCell(metadata.date || formatAgendaDateLine(now))} |  | ${escapeMarkdownTableCell(`${startTime} - ${endTime}`)} |  |`);
        attendeeGroups.forEach(group => {
            const people = (group.attendees || [])
                .map(person => `${person.present ? '☑' : '☐'} ${person.name || ''}`)
                .join(', ');
            lines.push(`| ${escapeMarkdownTableCell(group.name || 'Attendees')}: | ${escapeMarkdownTableCell(people)} |  |  |  |  |`);
        });
        lines.push('');
    }

    const timeDescription = kind === 'Agenda'
        ? 'estimates'
        : (state.tracker?.completedAt ? 'recorded' : 'recorded, live, or projected as labeled');
    lines.push(`${kind} *(times are ${timeDescription} and in the ${tzName} time zone)*`);
    lines.push('');
    lines.push('| Start Time | End Time | Agenda Item | Time Allotted | Leader |');
    lines.push('| ----- | ----- | ----- | ----- | ----- |');
    items.forEach(item => {
        const varianceRow = varianceById[item.id];
        const start = formatAgendaTimeWithZone(item.startTime);
        const end = formatAgendaTimeWithZone(item.endTime);
        const leader = item.lead || 'TBD';
        const allotted = getItemDuration(item);
        const notesValue = includeNotes ? (item.notes || '') : '';
        const contextValue = includeContext ? authoredValue(item.context) : '';
        const prepValue = includePrep ? authoredValue(item.prep) : '';

        if (contextValue) lines.push(`| Context: ${escapeMarkdownTableCell(contextValue)} |  |  |  |  |`);
        lines.push(`| ${escapeMarkdownTableCell(start)} | ${escapeMarkdownTableCell(end)} | ${escapeMarkdownTableCell(item.name)} | ${escapeMarkdownTableCell(allotted)} | ${escapeMarkdownTableCell(leader)} |`);
        if (prepValue) lines.push(`| Preparation: ${escapeMarkdownTableCell(prepValue)} |  |  |  |  |`);
        if (notesValue) lines.push(`| Notes: ${escapeMarkdownTableCell(notesValue)} |  |  |  |  |`);

        if (varianceData) {
            const actuality = getActualityLabel(item.id, state);
            const expectedInterval = varianceRow?.expected
                ? `${formatAgendaTimeWithZone(varianceRow.expected.startTime)} - ${formatAgendaTimeWithZone(varianceRow.expected.endTime)}`
                : '-';
            const expectedDuration = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
                ? '-'
                : formatDuration(varianceRow.expectedDurationMinutes);
            const actualInterval = `${start} - ${end}`;
            const actualDuration = item.adjustedDuration ?? parseDuration(item.duration || '0m');
            const differenceMinutes = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
                ? null
                : actualDuration - varianceRow.expectedDurationMinutes;
            const difference = differenceMinutes === null
                ? '-'
                : `${differenceMinutes > 0 ? '+' : ''}${Number(differenceMinutes.toFixed(1))}m`;
            lines.push(`| ${escapeMarkdownTableCell(actuality[0].toUpperCase() + actuality.slice(1))} vs Expected: expected ${escapeMarkdownTableCell(expectedInterval)} (${escapeMarkdownTableCell(expectedDuration)}), ${escapeMarkdownTableCell(actuality)} ${escapeMarkdownTableCell(actualInterval)} (${escapeMarkdownTableCell(formatDuration(actualDuration))}), difference ${escapeMarkdownTableCell(difference)} |  |  |  |  |`);
        }
    });

    lines.push('');

    if (stagedItems.length > 0) {
        lines.push('Carry-forward items (for next meeting)');
        lines.push('');
        stagedItems.forEach(item => {
            lines.push(`- ${escapeMarkdownTableCell(item.name)} (${escapeMarkdownTableCell(item.duration || 'TBD')})${item.lead ? ` - ${escapeMarkdownTableCell(item.lead)}` : ''}`);
        });
        lines.push('');
    }

    lines.push('Decision items (during meeting)');
    lines.push('');
    lines.push('- [ ] ');
    lines.push('');
    if (includeActionItems) {
        lines.push('Action items (after meeting)');
        lines.push('');
        const actionItems = getActionItems(metadata);
        if (actionItems.length > 0) {
            actionItems.forEach(item => lines.push(`- [${item.done ? 'x' : ' '}] ${escapeMarkdownTableCell(item.text)}${item.owner ? ` — ${escapeMarkdownTableCell(item.owner)}` : ''}`));
        } else {
            lines.push('- [ ] ');
        }
        lines.push('');
    }
    lines.push(`*Generated by autoCHAIR on ${escapeMarkdownTableCell(now.toLocaleString())}*`);

    return lines.join('\n');
}

/**
 * Generate plain text export
 * @param {Object} options - Export options
 * @returns {string} Plain text content
 */
export function generatePlainText(options = {}) {
    const state = getState();
    const {
        includeHeader = true,
        includeNotes = true,
        includePrep = false,
        includeContext = false,
        includeActionItems = false
    } = {
        ...state.exportOptions,
        ...options
    };

    const items = getExportItems(state);
    const stagedItems = state.stagedItems || [];
    const varianceData = getExpectedVsActualData();
    const varianceById = varianceData?.byId || {};
    const lines = [];

    const kind = getDocumentKind(state);
    const metadata = state.metadata || {};
    if (includeHeader) {
        lines.push(`${(metadata.title || 'MEETING').toUpperCase()} ${kind.toUpperCase()}`);
        lines.push('='.repeat(50));
        lines.push('');
        const startTime = items.length > 0 ? formatTime(items[0].startTime) : 'TBD';
        const endTime = items.length > 0 ? formatTime(items[items.length - 1].endTime) : 'TBD';

        lines.push(`Date: ${metadata.date || new Date().toLocaleDateString()}`);
        lines.push(`Time: ${startTime} - ${endTime}`);
        if (metadata.location) lines.push(`Location: ${metadata.location}`);
        const link = meetingLinkDetails(metadata.url);
        if (link) lines.push(`${link.label}: ${link.url}`);
        getAttendeeGroups(metadata, items.map(item => item.lead)).forEach(group => {
            lines.push(`${group.name || 'Attendees'}: ${(group.attendees || []).map(person => `[${person.present ? 'x' : ' '}] ${person.name || ''}`).join(', ')}`);
        });
        lines.push('');
    }

    lines.push(`${kind.toUpperCase()} ITEMS`);
    lines.push('-'.repeat(50));
    lines.push('');

    items.forEach((item, index) => {
        const interval = formatInterval(item.startTime, item.endTime);
        const varianceRow = varianceById[item.id];
        const contextValue = includeContext ? authoredValue(item.context) : '';
        const prepValue = includePrep ? authoredValue(item.prep) : '';
        if (contextValue) lines.push(`Context: ${formatPlainDetail(contextValue)}`);
        lines.push(`${index + 1}. ${item.name}`);
        if (varianceData) {
            const actuality = getActualityLabel(item.id, state);
            const expectedInterval = varianceRow?.expected
                ? formatInterval(varianceRow.expected.startTime, varianceRow.expected.endTime)
                : '-';
            const expectedDuration = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
                ? '-'
                : formatDuration(varianceRow.expectedDurationMinutes);
            const actualDuration = item.adjustedDuration ?? parseDuration(item.duration || '0m');
            const differenceMinutes = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
                ? null
                : actualDuration - varianceRow.expectedDurationMinutes;
            const difference = differenceMinutes === null
                ? '-'
                : `${differenceMinutes > 0 ? '+' : ''}${Number(differenceMinutes.toFixed(1))}m`;
            lines.push(`   Expected: ${expectedInterval} (${expectedDuration})`);
            lines.push(`   ${actuality[0].toUpperCase() + actuality.slice(1)}:   ${interval} (${formatDuration(actualDuration)})`);
            lines.push(`   Difference: ${difference}`);
        } else {
            lines.push(`   Time: ${interval} (${getItemDuration(item)})`);
        }
        lines.push(`   Lead: ${item.lead || 'TBD'}`);
        if (item.locked) {
            lines.push('   [LOCKED]');
        }
        if (prepValue) {
            lines.push(`   Preparation: ${formatPlainDetail(prepValue)}`);
        }
        if (includeNotes && item.notes) {
            lines.push(`   Notes: ${item.notes}`);
        }
        lines.push('');
    });

    if (stagedItems.length > 0) {
        lines.push('CARRY FORWARD (NEXT MEETING)');
        lines.push('-'.repeat(50));
        stagedItems.forEach((item, index) => {
            lines.push(`${index + 1}. ${item.name}`);
            lines.push(`   Duration: ${item.duration}`);
            lines.push(`   Lead: ${item.lead || 'TBD'}`);
            lines.push('');
        });
    }

    if (includeActionItems) {
        lines.push('ACTION ITEMS');
        lines.push('-'.repeat(50));
        const actionItems = getActionItems(metadata);
        if (actionItems.length) {
            actionItems.forEach(item => lines.push(`[${item.done ? 'x' : ' '}] ${item.text}${item.owner ? ` — ${item.owner}` : ''}`));
        } else {
            lines.push('[ ] ');
        }
        lines.push('');
    }

    lines.push('='.repeat(50));
    lines.push(`Generated by autoCHAIR on ${new Date().toLocaleString()}`);

    return lines.join('\n');
}

/**
 * Generate DOCX content (simple XML format that Word can open)
 * This creates a basic Word-compatible document
 * @param {Object} options - Export options
 * @returns {string} DOCX-compatible XML content
 */
export function generateDocx(options = {}) {
    const state = getState();
    const {
        includeHeader = true,
        includeNotes = true,
        includePrep = false,
        includeContext = false,
        includeActionItems = false
    } = {
        ...state.exportOptions,
        ...options
    };

    const items = getExportItems(state);
    const stagedItems = state.stagedItems || [];
    const varianceData = getExpectedVsActualData();
    const varianceById = varianceData?.byId || {};

    // Build HTML content that can be opened in Word
    let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: 'Calibri', sans-serif; font-size: 11pt; line-height: 1.5; }
h1 { font-size: 18pt; font-weight: bold; margin-bottom: 12pt; }
h2 { font-size: 14pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; }
h3 { font-size: 12pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; }
table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
th, td { border: 1pt solid #333; padding: 6pt 8pt; text-align: left; }
th { background-color: #f0f0f0; font-weight: bold; }
.meta { color: #666; margin-bottom: 6pt; }
.notes { margin: 12pt 0; padding: 12pt; background: #f9f9f9; border-left: 3pt solid #333; }
ul { margin: 6pt 0; padding-left: 20pt; }
li { margin: 3pt 0; }
hr { border: none; border-top: 1pt solid #ccc; margin: 18pt 0; }
.footer { font-size: 9pt; color: #999; margin-top: 24pt; }
</style>
</head>
<body>`;

    const kind = getDocumentKind(state);
    const metadata = state.metadata || {};
    if (includeHeader) {
        html += `\n<h1>${escapeHtml(metadata.title || 'Meeting')} ${kind}</h1>\n`;
        const startTime = items.length > 0 ? formatTime(items[0].startTime) : 'TBD';
        const endTime = items.length > 0 ? formatTime(items[items.length - 1].endTime) : 'TBD';
        const totalDuration = items.length
            ? (items[items.length - 1].endTime - items[0].startTime) / 60000
            : 0;

        html += `<p class="meta"><strong>Date:</strong> ${escapeHtml(metadata.date || new Date().toLocaleDateString())}</p>\n`;
        html += `<p class="meta"><strong>Time:</strong> ${startTime} - ${endTime}</p>\n`;
        html += `<p class="meta"><strong>Duration:</strong> ${formatDuration(totalDuration)}</p>\n`;
        if (metadata.location) html += `<p class="meta"><strong>Location:</strong> ${escapeHtml(metadata.location)}</p>\n`;
        const link = meetingLinkDetails(metadata.url);
        if (link) html += `<p class="meta"><strong>${escapeHtml(link.label)}:</strong> <a href="${escapeHtml(link.url)}">${escapeHtml(link.url)}</a></p>\n`;
        getAttendeeGroups(metadata, items.map(item => item.lead)).forEach(group => {
            html += `<p class="meta"><strong>${escapeHtml(group.name || 'Attendees')}:</strong> ${(group.attendees || []).map(person => `${person.present ? '☑' : '☐'} ${escapeHtml(person.name)}`).join(', ')}</p>\n`;
        });
        html += '<hr>\n';
    }

    html += `<h2>${kind === 'Minutes' ? 'Minutes' : 'Agenda Items'}</h2>\n`;
    html += '<table>\n';
    if (varianceData) {
        html += '<tr><th>Expected Time</th><th>Actual / Projected Time</th><th>Item</th><th>Lead</th><th>Expected Duration</th><th>Actual / Projected Duration</th><th>Difference</th></tr>\n';
        items.forEach(item => {
            const varianceRow = varianceById[item.id];
            const actuality = getActualityLabel(item.id, state);
            const expectedInterval = varianceRow?.expected
                ? formatInterval(varianceRow.expected.startTime, varianceRow.expected.endTime)
                : '-';
            const actualInterval = formatInterval(item.startTime, item.endTime);
            const expectedDuration = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
                ? '-'
                : formatDuration(varianceRow.expectedDurationMinutes);
            const actualDuration = item.adjustedDuration ?? parseDuration(item.duration || '0m');
            const differenceMinutes = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
                ? null
                : actualDuration - varianceRow.expectedDurationMinutes;
            const difference = differenceMinutes === null
                ? '-'
                : `${differenceMinutes > 0 ? '+' : ''}${Number(differenceMinutes.toFixed(1))}m`;
            if (includeContext && authoredValue(item.context)) {
                html += docDetailRow('Context', item.context, 7);
            }
            html += `<tr><td>${escapeHtml(expectedInterval)}</td><td>${escapeHtml(`${actuality}: ${actualInterval}`)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.lead) || '-'}</td><td>${escapeHtml(expectedDuration)}</td><td>${escapeHtml(formatDuration(actualDuration))}</td><td>${escapeHtml(difference)}</td></tr>\n`;
            if (includePrep && authoredValue(item.prep)) {
                html += docDetailRow('Preparation', item.prep, 7);
            }
        });
    } else {
        html += '<tr><th>Time</th><th>Item</th><th>Lead</th><th>Duration</th></tr>\n';
        items.forEach(item => {
            const interval = formatInterval(item.startTime, item.endTime);
            const locked = item.locked ? ' (locked)' : '';
            if (includeContext && authoredValue(item.context)) {
                html += docDetailRow('Context', item.context, 4);
            }
            html += `<tr><td>${escapeHtml(interval)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.lead) || '-'}</td><td>${escapeHtml(getItemDuration(item))}${locked}</td></tr>\n`;
            if (includePrep && authoredValue(item.prep)) {
                html += docDetailRow('Preparation', item.prep, 4);
            }
        });
    }

    html += '</table>\n';

    if (stagedItems.length > 0) {
        html += '<h2>Carry Forward (Next Meeting)</h2>\n';
        html += '<p>The following items were moved to staging for a future meeting:</p>\n';
        html += '<ul>\n';
        stagedItems.forEach(item => {
            html += `<li><strong>${escapeHtml(item.name)}</strong> (${escapeHtml(item.duration)})${item.lead ? ` - ${escapeHtml(item.lead)}` : ''}</li>\n`;
        });
        html += '</ul>\n';
    }

    if (includeNotes) {
        const itemsWithNotes = items.filter(item => item.notes && item.notes.trim());
        if (itemsWithNotes.length > 0) {
            html += '<h2>Notes</h2>\n';
            itemsWithNotes.forEach(item => {
                html += `<h3>${escapeHtml(item.name)}</h3>\n`;
                html += `<div class="notes">${escapeHtml(item.notes).replace(/\n/g, '<br>')}</div>\n`;
            });
        }
    }

    if (includeActionItems) {
        html += '<h2>Action Items</h2><ul>\n';
        const actionItems = getActionItems(metadata);
        if (actionItems.length) {
            actionItems.forEach(item => {
                html += `<li>${item.done ? '☑' : '☐'} ${escapeHtml(item.text)}${item.owner ? ` — ${escapeHtml(item.owner)}` : ''}</li>\n`;
            });
        } else {
            html += '<li>☐ </li>\n';
        }
        html += '</ul>\n';
    }

    html += '<hr>\n';
    html += `<p class="footer">Generated by autoCHAIR on ${new Date().toLocaleString()}</p>\n`;
    html += '</body>\n</html>';

    return html;
}

/**
 * Download content as a file
 * @param {string} content - File content
 * @param {string} filename - File name
 * @param {string} mimeType - MIME type
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}

/**
 * Export agenda as Markdown file
 */
export function exportAsMarkdown() {
    const content = generateMarkdown();
    const date = formatFileDate();
    downloadFile(content, `${getExportStem()}-${date}.md`, 'text/markdown');
}

/**
 * Export agenda as JSON file
 */
export function exportAsJSON() {
    const content = exportToJSON();
    const date = formatFileDate();
    downloadFile(content, `${getExportStem()}-${date}.json`, 'application/json');
}

/**
 * Export agenda as plain text file
 */
export function exportAsText() {
    const content = generatePlainText();
    const date = formatFileDate();
    downloadFile(content, `${getExportStem()}-${date}.txt`, 'text/plain');
}

/**
 * Export agenda as Word document (HTML that Word can open)
 */
export function exportAsDocx() {
    const content = generateDocx();
    const date = formatFileDate();
    // Use .doc extension with HTML content - Word will open it correctly
    downloadFile(content, `${getExportStem()}-${date}.doc`, 'application/msword');
}

/**
 * Import agenda from JSON file
 * @param {File} file - JSON file
 * @returns {Promise<boolean>} Success status
 */
export function importFromJSONFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file provided'));
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const success = importFromJSON(content);
                if (success) {
                    resolve(true);
                } else {
                    reject(new Error('Invalid JSON format'));
                }
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };

        reader.readAsText(file);
    });
}

function copyWithExecCommand(value) {
    if (typeof document.execCommand !== 'function') return false;
    const previousFocus = document.activeElement;
    const input = document.createElement('textarea');
    input.value = value;
    input.readOnly = true;
    input.setAttribute('aria-hidden', 'true');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, input.value.length);

    let copied = false;
    try {
        copied = document.execCommand('copy') === true;
    } catch {
        copied = false;
    } finally {
        input.remove();
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
            previousFocus.focus({ preventScroll: true });
        }
    }
    return copied;
}

/**
 * Copy shareable link to clipboard
 * @returns {Promise<boolean>} Whether a clipboard method reported success
 */
export async function copyShareLink() {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('share', '1');
    const url = shareUrl.toString();
    let copied = false;

    if (globalThis.navigator?.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(url);
            copied = true;
        } catch {
            copied = false;
        }
    }
    if (!copied) copied = copyWithExecCommand(url);

    showNotification(
        copied ? 'Link copied to clipboard!' : 'Unable to copy link. Copy the address from your browser.',
        copied ? 'success' : 'warning'
    );
    return copied;
}

/**
 * Show a notification message
 * @param {string} message - Message to show
 * @param {string} type - Notification type ('success', 'warning', 'info')
 */
export function showNotification(message, type = 'info') {
    // Check if notification element exists
    let notification = document.querySelector('.notification');

    if (!notification) {
        notification = document.createElement('div');
        notification.className = 'notification';
        document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.className = `notification ${type}`;

    // Show notification
    setTimeout(() => {
        notification.classList.add('visible');
    }, 10);

    // Hide after 3 seconds
    setTimeout(() => {
        notification.classList.remove('visible');
    }, 3000);
}

/**
 * Initialize export functionality
 * @param {Object} elements - DOM elements
 */
export function initExport(elements) {
    const {
        exportMdBtn,
        exportTxtBtn,
        exportDocxBtn,
        exportJsonBtn,
        importJsonBtn,
        importInlineBtn,
        importFileInput,
        copyLinkBtn
    } = elements;

    if (exportMdBtn) {
        exportMdBtn.addEventListener('click', exportAsMarkdown);
    }

    if (exportTxtBtn) {
        exportTxtBtn.addEventListener('click', exportAsText);
    }

    if (exportDocxBtn) {
        exportDocxBtn.addEventListener('click', exportAsDocx);
    }

    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', exportAsJSON);
    }

    if (importFileInput) {
        // Settings sidebar import button
        if (importJsonBtn) {
            importJsonBtn.addEventListener('click', () => {
                importFileInput.click();
            });
        }

        // Inline import button in export panel
        if (importInlineBtn) {
            importInlineBtn.addEventListener('click', () => {
                importFileInput.click();
            });
        }

        importFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    await importFromJSONFile(file);
                    showNotification('Agenda imported successfully!', 'success');
                    window.dispatchEvent(new CustomEvent('autochair:data-imported'));
                } catch (err) {
                    showNotification('Failed to import: ' + err.message, 'warning');
                }
                // Reset input
                e.target.value = '';
            }
        });
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', copyShareLink);
    }
}
