/**
 * bulk-edit.js - Column and CSV agenda editing
 */

import { getState, replaceItems } from './state.js';
import { getItemColor, parseItemColor } from './colors.js';
import { focusAfterTransition, parseDuration } from './utils.js';

const FIELD_LABELS = {
    name: 'Items',
    lead: 'Leads',
    themeColor: 'Colors',
    duration: 'Durations',
    locked: 'Locked',
    notes: 'Notes'
};
const CSV_COLUMNS = [
    'ID',
    'Item',
    'Lead',
    'Color',
    'Duration',
    'Locked',
    'Context',
    'Preparation',
    'Notes'
];
const LEGACY_CSV_COLUMNS = ['Item', 'Lead', 'Color', 'Duration', 'Locked', 'Notes'];

let modal;
let title;
let textarea;
let formatControls;
let warning;
let badRows;
let activeField = null;
let activeFormat = 'newline';
let returnFocus = null;

function escapeValue(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function splitEscaped(value, separator = ',', trimValues = true) {
    const values = [];
    let current = '';
    let escaped = false;
    const appendCurrent = () => {
        values.push(trimValues ? current.trim() : current);
        current = '';
    };
    for (const character of value) {
        if (escaped) {
            current += character === 'n' ? '\n' : character;
            escaped = false;
        } else if (character === '\\') {
            escaped = true;
        } else if (character === separator) {
            appendCurrent();
        } else {
            current += character;
        }
    }
    if (escaped) current += '\\';
    appendCurrent();
    return values;
}

function fieldValue(item, field) {
    if (field === 'themeColor') return getItemColor(item);
    if (field === 'locked') return item.locked ? 'true' : 'false';
    return item[field] ?? '';
}

function serializeColumn(field, format) {
    const values = getState().items.map(item => escapeValue(fieldValue(item, field)));
    return values.join(format === 'comma' ? ', ' : '\n');
}

function openModal(field = null, trigger = document.activeElement) {
    activeField = field;
    returnFocus = trigger instanceof HTMLElement ? trigger : null;
    const csvMode = field === null;
    title.textContent = csvMode ? 'Edit Agenda CSV' : `Edit ${FIELD_LABELS[field]}`;
    formatControls.hidden = csvMode;
    warning.textContent = '';
    badRows.textContent = '';
    highlightBadRows([]);
    activeFormat = 'newline';
    const newlineRadio = document.querySelector('input[name="bulk-format"][value="newline"]');
    if (newlineRadio) newlineRadio.checked = true;
    textarea.value = csvMode ? serializeCsv() : serializeColumn(field, activeFormat);
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    focusAfterTransition(modal, () => textarea);
    validateCsv();
}

function closeModal() {
    const closingField = activeField;
    const previousFocus = returnFocus;
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    highlightBadRows([]);
    activeField = null;
    returnFocus = null;

    requestAnimationFrame(() => {
        const replacement = closingField === null
            ? document.getElementById('btn-edit-csv')
            : document.querySelector(`.bulk-column-button[data-bulk-field="${closingField}"]`);
        (previousFocus?.isConnected ? previousFocus : replacement)?.focus({ preventScroll: true });
    });
}

function getFocusableElements() {
    return [...modal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
}

function handleModalKeydown(event) {
    if (!modal?.classList.contains('visible')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) {
        event.preventDefault();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
    }
}

function parseLocked(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    throw new Error(`Invalid Locked value “${value}”; use true or false.`);
}

function parseDurationValue(value, allowDefault = false) {
    const normalized = String(value ?? '').trim();
    if (!normalized && allowDefault) return '10m';
    const minutes = parseDuration(normalized);
    if (!Number.isFinite(minutes) || Math.round(minutes * 10) <= 0 || minutes > 525600) {
        throw new Error(`Invalid Duration value “${value}”; use a positive value such as 5m, 2.5m, or 1h30m.`);
    }
    return normalized;
}

function serializeCsv() {
    const rows = [CSV_COLUMNS.join(',')];
    getState().items.forEach(item => rows.push([
        item.id,
        item.name,
        item.lead,
        getItemColor(item),
        item.duration,
        item.locked ? 'true' : 'false',
        item.context || '',
        item.prep || '',
        item.notes
    ].map(escapeValue).join(',')));
    return rows.join('\n');
}

function headerMatches(values, columns) {
    return values.length === columns.length && columns.every((column, index) => (
        values[index].trim().toLowerCase() === column.toLowerCase()
    ));
}

function rowColumnCounts() {
    return textarea.value.split('\n')
        .map((row, index) => ({ row: index + 1, value: row }))
        .filter(entry => entry.value.trim())
        .map(entry => {
            const values = splitEscaped(entry.value);
            return { row: entry.row, count: values.length, values };
        });
}

function highlightBadRows(rows) {
    if (rows.length === 0) {
        textarea.style.removeProperty('background-image');
        textarea.style.removeProperty('background-position');
        textarea.style.removeProperty('background-size');
        textarea.style.removeProperty('background-repeat');
        textarea.style.removeProperty('background-attachment');
        return;
    }
    const styles = getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight);
    const paddingTop = Number.parseFloat(styles.paddingTop);
    const highlight = 'linear-gradient(rgba(231, 76, 60, 0.11), rgba(231, 76, 60, 0.11))';
    textarea.style.backgroundImage = rows.map(() => highlight).join(',');
    textarea.style.backgroundPosition = rows
        .map(row => `0 ${paddingTop + ((row - 1) * lineHeight)}px`)
        .join(',');
    textarea.style.backgroundSize = rows.map(() => `100% ${lineHeight}px`).join(',');
    textarea.style.backgroundRepeat = rows.map(() => 'no-repeat').join(',');
    textarea.style.backgroundAttachment = 'local';
}

function validateCsv() {
    if (activeField !== null) return true;
    const rows = rowColumnCounts();
    if (rows.length === 0) {
        highlightBadRows([]);
        return true;
    }
    const expected = headerMatches(rows[0].values, LEGACY_CSV_COLUMNS)
        ? LEGACY_CSV_COLUMNS.length
        : CSV_COLUMNS.length;
    const invalid = rows.filter(entry => entry.count !== expected).map(entry => entry.row);
    warning.textContent = invalid.length
        ? `Each CSV row needs ${expected} fields. Check row${invalid.length === 1 ? '' : 's'} ${invalid.join(', ')}.`
        : '';
    badRows.replaceChildren(...invalid.map(row => {
        const marker = document.createElement('span');
        marker.textContent = `Row ${row}`;
        return marker;
    }));
    highlightBadRows(invalid);
    return invalid.length === 0;
}

function applyColumn() {
    const format = document.querySelector('input[name="bulk-format"]:checked')?.value || 'newline';
    const current = getState().items;
    const values = format === 'comma'
        ? splitEscaped(textarea.value)
        : textarea.value.split('\n').map(value => splitEscaped(value, '\0', false)[0]);
    while (values.length > current.length && values.at(-1) === '') values.pop();
    const count = Math.max(current.length, values.length);
    const items = Array.from({ length: count }, (_, index) => {
        const existingItem = current[index];
        const item = existingItem || { name: 'New Item', lead: '', duration: '10m', locked: false, notes: '', themeColor: (index % 8) + 1 };
        const rawValue = values[index];
        if (rawValue === undefined) return item;
        if (activeField === 'themeColor') return { ...item, ...parseItemColor(rawValue) };
        if (activeField === 'locked') return { ...item, locked: parseLocked(rawValue) };
        if (activeField === 'duration') {
            return { ...item, duration: parseDurationValue(rawValue, !existingItem) };
        }
        return { ...item, [activeField]: rawValue };
    });
    replaceItems(items);
}

function applyCsv() {
    if (!validateCsv()) throw new Error('Fix the highlighted CSV rows before applying.');
    const rows = textarea.value.split('\n')
        .filter(row => row.trim())
        .map(row => splitEscaped(row, ',', false));
    if (rows.length === 0) throw new Error('CSV input is empty.');
    const current = getState().items;
    const isCurrentFormat = headerMatches(rows[0], CSV_COLUMNS);
    const isLegacyFormat = headerMatches(rows[0], LEGACY_CSV_COLUMNS);
    if (!isCurrentFormat && !isLegacyFormat) {
        throw new Error(`CSV header must be: ${CSV_COLUMNS.join(',')} (or legacy ${LEGACY_CSV_COLUMNS.join(',')}).`);
    }
    const dataRows = rows.slice(1);
    if (isLegacyFormat) {
        replaceItems(dataRows.map((row, index) => {
            const existingItem = current[index];
            return {
                ...(existingItem || { context: '', prep: '' }),
                name: row[0],
                lead: row[1],
                ...parseItemColor(row[2]),
                duration: parseDurationValue(row[3], !existingItem),
                locked: parseLocked(row[4]),
                notes: row[5] || ''
            };
        }));
        return;
    }

    const currentById = new Map(current.map(item => [item.id, item]));
    const stagedIds = new Set((getState().stagedItems || []).map(item => item.id));
    const seenIds = new Map();
    dataRows.forEach((row, index) => {
        const id = row[0].trim();
        if (!id) return;
        const sourceRow = index + 2;
        if (seenIds.has(id)) {
            throw new Error(`Duplicate ID “${id}” on rows ${seenIds.get(id)} and ${sourceRow}.`);
        }
        if (stagedIds.has(id) && !currentById.has(id)) {
            throw new Error(`ID “${id}” on row ${sourceRow} belongs to a staged item.`);
        }
        seenIds.set(id, sourceRow);
    });

    replaceItems(dataRows.map(row => {
        const id = row[0].trim();
        const existingItem = id ? currentById.get(id) : null;
        return {
            ...(existingItem || {}),
            ...(id ? { id } : {}),
            name: row[1],
            lead: row[2],
            ...parseItemColor(row[3]),
            duration: parseDurationValue(row[4], !existingItem),
            locked: parseLocked(row[5]),
            context: row[6] || '',
            prep: row[7] || '',
            notes: row[8] || ''
        };
    }));
}

export function initBulkEdit() {
    modal = document.getElementById('bulk-edit-modal');
    title = document.getElementById('bulk-edit-title');
    textarea = document.getElementById('bulk-edit-text');
    formatControls = document.getElementById('bulk-edit-format');
    warning = document.getElementById('bulk-edit-warning');
    badRows = document.getElementById('bulk-edit-bad-rows');
    if (!modal || !textarea) throw new Error('Bulk editor markup is missing.');

    document.addEventListener('click', event => {
        const button = event.target.closest('.bulk-column-button');
        if (button) openModal(button.dataset.bulkField, button);
    });
    document.getElementById('btn-edit-csv')?.addEventListener('click', event => openModal(null, event.currentTarget));
    document.getElementById('bulk-edit-close')?.addEventListener('click', closeModal);
    document.getElementById('bulk-edit-cancel')?.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', handleModalKeydown);
    textarea.addEventListener('input', validateCsv);
    document.querySelectorAll('input[name="bulk-format"]').forEach(radio => {
        radio.addEventListener('change', event => {
            if (!activeField || event.target.value === activeFormat) return;
            const values = activeFormat === 'comma'
                ? splitEscaped(textarea.value)
                : textarea.value.split('\n').map(value => splitEscaped(value, '\0', false)[0]);
            activeFormat = event.target.value;
            textarea.value = values.map(escapeValue).join(activeFormat === 'comma' ? ', ' : '\n');
        });
    });
    document.getElementById('bulk-edit-apply')?.addEventListener('click', () => {
        try {
            activeField === null ? applyCsv() : applyColumn();
            closeModal();
        } catch (error) {
            warning.textContent = error.message;
        }
    });
}
