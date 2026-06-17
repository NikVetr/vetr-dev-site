/**
 * export.js - Export functionality for JSON, Markdown, Text, and DOCX formats
 */

import { getState, exportToJSON, importFromJSON, calculateIntervals, getExpectedVsActualData } from './state.js';
import { formatTime, formatInterval, formatDuration, parseDuration } from './utils.js';

function escapeMarkdownTableCell(value) {
    return String(value ?? '')
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

function splitLeads(leads, maxPerGroup = 5) {
    const unique = [...new Set((leads || []).filter(Boolean).map(v => String(v).trim()).filter(Boolean))];
    const board = unique.slice(0, maxPerGroup);
    const staff = unique.slice(maxPerGroup, maxPerGroup * 2);
    while (board.length < maxPerGroup) board.push('');
    while (staff.length < maxPerGroup) staff.push('');
    return { board, staff };
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
        includeContext = false
    } = {
        ...state.exportOptions,
        ...options
    };

    const items = calculateIntervals();
    const stagedItems = state.stagedItems || [];
    const varianceData = getExpectedVsActualData();
    const varianceById = varianceData?.byId || {};
    const lines = [];
    const now = new Date();
    const leads = items.map(item => item.lead);
    const leadGroups = splitLeads(leads);
    const tzName = new Intl.DateTimeFormat([], { timeZoneName: 'short' })
        .formatToParts(now)
        .find(part => part.type === 'timeZoneName')?.value || 'local';

    if (includeHeader) {
        const startTime = items.length > 0 ? formatAgendaTimeWithZone(items[0].startTime) : 'TBD';
        const endTime = items.length > 0 ? formatAgendaTimeWithZone(items[items.length - 1].endTime) : 'TBD';
        lines.push('autoCHAIR');
        lines.push('Board Meeting');
        lines.push(formatAgendaDateLine(now));
        lines.push('');
        lines.push('| Location |  | Date |  | Time |  |');
        lines.push('| :---- | :---- | :---- | :---- | :---- | :---- |');
        lines.push(`| TBD |  | ${escapeMarkdownTableCell(formatAgendaDateLine(now))} |  | ${escapeMarkdownTableCell(`${startTime} - ${endTime}`)} |  |`);
        lines.push(`| Board: | ${escapeMarkdownTableCell(leadGroups.board[0])} | ${escapeMarkdownTableCell(leadGroups.board[1])} | ${escapeMarkdownTableCell(leadGroups.board[2])} | ${escapeMarkdownTableCell(leadGroups.board[3])} | ${escapeMarkdownTableCell(leadGroups.board[4])} |`);
        lines.push(`| Staff: | ${escapeMarkdownTableCell(leadGroups.staff[0])} | ${escapeMarkdownTableCell(leadGroups.staff[1])} | ${escapeMarkdownTableCell(leadGroups.staff[2])} | ${escapeMarkdownTableCell(leadGroups.staff[3])} | ${escapeMarkdownTableCell(leadGroups.staff[4])} |`);
        lines.push('');
    }

    lines.push(`Agenda *(times are estimates and in the ${tzName} time zone)*`);
    lines.push('');
    lines.push('| Start Time | End Time | Agenda Item | Time Allotted | Leader |');
    lines.push('| ----- | ----- | ----- | ----- | ----- |');
    items.forEach(item => {
        const varianceRow = varianceById[item.id];
        const start = formatAgendaTimeWithZone(item.startTime);
        const end = formatAgendaTimeWithZone(item.endTime);
        const leader = item.lead || 'TBD';
        const allotted = item.duration || formatDuration(parseDuration(item.duration || '0m'));
        const contextValue = includeContext ? (item.context || '') : '';
        const prepValue = includePrep ? (item.prep || '') : '';
        const notesValue = includeNotes ? (item.notes || '') : '';

        lines.push(`| ${escapeMarkdownTableCell(start)} | ${escapeMarkdownTableCell(end)} | ${escapeMarkdownTableCell(item.name)} | ${escapeMarkdownTableCell(allotted)} | ${escapeMarkdownTableCell(leader)} |`);
        lines.push(`| Context: ${escapeMarkdownTableCell(contextValue || 'N/A')}  Preparation: ${escapeMarkdownTableCell(prepValue || 'N/A')} |  |  |  |  |`);
        lines.push(`| Notes: ${escapeMarkdownTableCell(notesValue)} |  |  |  |  |`);

        if (varianceData) {
            const expectedInterval = varianceRow?.expected
                ? `${formatAgendaTimeWithZone(varianceRow.expected.startTime)} - ${formatAgendaTimeWithZone(varianceRow.expected.endTime)}`
                : '-';
            const expectedDuration = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
                ? '-'
                : formatDuration(varianceRow.expectedDurationMinutes);
            const actualInterval = `${start} - ${end}`;
            const difference = varianceRow?.durationDifferenceMinutes === null || varianceRow?.durationDifferenceMinutes === undefined
                ? '-'
                : `${varianceRow.durationDifferenceMinutes > 0 ? '+' : ''}${varianceRow.durationDifferenceMinutes}m`;
            lines.push(`| Actual vs Expected: expected ${escapeMarkdownTableCell(expectedInterval)} (${escapeMarkdownTableCell(expectedDuration)}), actual ${escapeMarkdownTableCell(actualInterval)} (${escapeMarkdownTableCell(allotted)}), difference ${escapeMarkdownTableCell(difference)} |  |  |  |  |`);
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
    lines.push('Action items (after meeting)');
    lines.push('');
    const actionLeads = [...new Set(leads.filter(Boolean).map(v => String(v).trim()).filter(Boolean))];
    if (actionLeads.length > 0) {
        actionLeads.forEach(name => lines.push(`- [ ] ${escapeMarkdownTableCell(name)}`));
    } else {
        lines.push('- [ ] ');
    }
    lines.push('');
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
        includeContext = false
    } = {
        ...state.exportOptions,
        ...options
    };

    const items = calculateIntervals();
    const stagedItems = state.stagedItems || [];
    const varianceData = getExpectedVsActualData();
    const varianceById = varianceData?.byId || {};
    const lines = [];

    lines.push('MEETING AGENDA');
    lines.push('='.repeat(50));
    lines.push('');

    if (includeHeader) {
        const startTime = items.length > 0 ? formatTime(items[0].startTime) : 'TBD';
        const endTime = items.length > 0 ? formatTime(items[items.length - 1].endTime) : 'TBD';

        lines.push(`Date: ${new Date().toLocaleDateString()}`);
        lines.push(`Time: ${startTime} - ${endTime}`);
        lines.push('');
    }

    if (includeContext) {
        lines.push('CONTEXT');
        lines.push('-'.repeat(50));
        lines.push('[Add meeting context here]');
        lines.push('');
    }

    lines.push('AGENDA ITEMS');
    lines.push('-'.repeat(50));
    lines.push('');

    items.forEach((item, index) => {
        const interval = formatInterval(item.startTime, item.endTime);
        const varianceRow = varianceById[item.id];
        lines.push(`${index + 1}. ${item.name}`);
        if (varianceData) {
            const expectedInterval = varianceRow?.expected
                ? formatInterval(varianceRow.expected.startTime, varianceRow.expected.endTime)
                : '-';
            const expectedDuration = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
                ? '-'
                : formatDuration(varianceRow.expectedDurationMinutes);
            const difference = varianceRow?.durationDifferenceMinutes === null || varianceRow?.durationDifferenceMinutes === undefined
                ? '-'
                : `${varianceRow.durationDifferenceMinutes > 0 ? '+' : ''}${varianceRow.durationDifferenceMinutes}m`;
            lines.push(`   Expected: ${expectedInterval} (${expectedDuration})`);
            lines.push(`   Actual:   ${interval} (${item.duration})`);
            lines.push(`   Difference: ${difference}`);
        } else {
            lines.push(`   Time: ${interval} (${item.duration})`);
        }
        lines.push(`   Lead: ${item.lead || 'TBD'}`);
        if (item.locked) {
            lines.push('   [LOCKED]');
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

    if (includePrep) {
        lines.push('PREPARATION');
        lines.push('-'.repeat(50));
        lines.push('[ ] Review previous meeting notes');
        lines.push('[ ] Prepare materials for each agenda item');
        lines.push('[ ] Confirm attendance');
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
        includeContext = false
    } = {
        ...state.exportOptions,
        ...options
    };

    const items = calculateIntervals();
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

    html += '\n<h1>Meeting Agenda</h1>\n';

    if (includeHeader) {
        const startTime = items.length > 0 ? formatTime(items[0].startTime) : 'TBD';
        const endTime = items.length > 0 ? formatTime(items[items.length - 1].endTime) : 'TBD';
        const totalDuration = items.reduce((sum, item) => sum + parseDuration(item.duration), 0);

        html += `<p class="meta"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>\n`;
        html += `<p class="meta"><strong>Time:</strong> ${startTime} - ${endTime}</p>\n`;
        html += `<p class="meta"><strong>Duration:</strong> ${formatDuration(totalDuration)}</p>\n`;
        html += '<hr>\n';
    }

    if (includeContext) {
        html += '<h2>Context</h2>\n';
        html += '<p><em>Add meeting context and background information here.</em></p>\n';
    }

    html += '<h2>Agenda Items</h2>\n';
    html += '<table>\n';
    if (varianceData) {
        html += '<tr><th>Expected Time</th><th>Actual Time</th><th>Item</th><th>Lead</th><th>Expected Duration</th><th>Actual Duration</th><th>Difference</th></tr>\n';
        items.forEach(item => {
            const varianceRow = varianceById[item.id];
            const expectedInterval = varianceRow?.expected
                ? formatInterval(varianceRow.expected.startTime, varianceRow.expected.endTime)
                : '-';
            const actualInterval = formatInterval(item.startTime, item.endTime);
            const expectedDuration = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
                ? '-'
                : formatDuration(varianceRow.expectedDurationMinutes);
            const difference = varianceRow?.durationDifferenceMinutes === null || varianceRow?.durationDifferenceMinutes === undefined
                ? '-'
                : `${varianceRow.durationDifferenceMinutes > 0 ? '+' : ''}${varianceRow.durationDifferenceMinutes}m`;
            html += `<tr><td>${expectedInterval}</td><td>${actualInterval}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.lead) || '-'}</td><td>${expectedDuration}</td><td>${item.duration}</td><td>${difference}</td></tr>\n`;
        });
    } else {
        html += '<tr><th>Time</th><th>Item</th><th>Lead</th><th>Duration</th></tr>\n';
        items.forEach(item => {
            const interval = formatInterval(item.startTime, item.endTime);
            const locked = item.locked ? ' (locked)' : '';
            html += `<tr><td>${interval}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.lead) || '-'}</td><td>${item.duration}${locked}</td></tr>\n`;
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

    if (includePrep) {
        html += '<h2>Preparation</h2>\n';
        html += '<ul>\n';
        html += '<li>Review previous meeting notes</li>\n';
        html += '<li>Prepare materials for each agenda item</li>\n';
        html += '<li>Confirm attendance</li>\n';
        html += '</ul>\n';
    }

    html += '<hr>\n';
    html += `<p class="footer">Generated by autoCHAIR on ${new Date().toLocaleString()}</p>\n`;
    html += '</body>\n</html>';

    return html;
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
    const date = new Date().toISOString().split('T')[0];
    downloadFile(content, `agenda-${date}.md`, 'text/markdown');
}

/**
 * Export agenda as JSON file
 */
export function exportAsJSON() {
    const content = exportToJSON();
    const date = new Date().toISOString().split('T')[0];
    downloadFile(content, `agenda-${date}.json`, 'application/json');
}

/**
 * Export agenda as plain text file
 */
export function exportAsText() {
    const content = generatePlainText();
    const date = new Date().toISOString().split('T')[0];
    downloadFile(content, `agenda-${date}.txt`, 'text/plain');
}

/**
 * Export agenda as Word document (HTML that Word can open)
 */
export function exportAsDocx() {
    const content = generateDocx();
    const date = new Date().toISOString().split('T')[0];
    // Use .doc extension with HTML content - Word will open it correctly
    downloadFile(content, `agenda-${date}.doc`, 'application/msword');
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

/**
 * Copy shareable link to clipboard
 */
export function copyShareLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        showNotification('Link copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showNotification('Link copied to clipboard!', 'success');
    });
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
