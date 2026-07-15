/**
 * bulk-edit.js - Column and CSV agenda editing
 */

import { getState, replaceItems } from './state.js';

const PALETTE = ['#2196f3', '#9c27b0', '#4caf50', '#ff9800', '#e91e63', '#009688', '#795548', '#607d8b'];
const FIELD_LABELS = { name: 'Items', lead: 'Leads', themeColor: 'Colors', duration: 'Durations' };

let modal;
let title;
let textarea;
let formatControls;
let warning;
let badRows;
let activeField = null;

function escapeValue(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function splitEscaped(value, separator = ',') {
    const values = [];
    let current = '';
    let escaped = false;
    for (const character of value) {
        if (escaped) {
            current += character === 'n' ? '\n' : character;
            escaped = false;
        } else if (character === '\\') {
            escaped = true;
        } else if (character === separator) {
            values.push(current.trim());
            current = '';
        } else {
            current += character;
        }
    }
    if (escaped) current += '\\';
    values.push(current.trim());
    return values;
}

function closestTheme(hex) {
    if (/^[1-8]$/.test(String(hex).trim())) return Number(hex);
    if (!/^#[0-9a-f]{6}$/i.test(String(hex).trim())) {
        throw new Error(`Invalid color “${hex}”; use a six-digit hex code.`);
    }
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    let best = 0;
    let distance = Infinity;
    PALETTE.forEach((color, index) => {
        const candidate = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
        const nextDistance = candidate.reduce((sum, value, channel) => sum + ((value - rgb[channel]) ** 2), 0);
        if (nextDistance < distance) {
            distance = nextDistance;
            best = index;
        }
    });
    return best + 1;
}

function fieldValue(item, field) {
    return field === 'themeColor' ? PALETTE[(item.themeColor || 1) - 1] : item[field] || '';
}

function serializeColumn(field, format) {
    const values = getState().items.map(item => escapeValue(fieldValue(item, field)));
    return values.join(format === 'comma' ? ', ' : '\n');
}

function openModal(field = null) {
    activeField = field;
    const csvMode = field === null;
    title.textContent = csvMode ? 'Edit Agenda CSV' : `Edit ${FIELD_LABELS[field]}`;
    formatControls.hidden = csvMode;
    warning.textContent = '';
    badRows.textContent = '';
    textarea.value = csvMode ? serializeCsv() : serializeColumn(field, 'newline');
    modal.classList.add('visible');
    textarea.focus();
    validateCsv();
}

function closeModal() {
    modal.classList.remove('visible');
    activeField = null;
}

function serializeCsv() {
    const rows = ['Item,Lead,Color,Duration,Locked,Notes'];
    getState().items.forEach(item => rows.push([
        item.name,
        item.lead,
        PALETTE[(item.themeColor || 1) - 1],
        item.duration,
        item.locked ? 'true' : 'false',
        item.notes
    ].map(escapeValue).join(',')));
    return rows.join('\n');
}

function rowColumnCounts() {
    return textarea.value.split('\n').filter(row => row.trim()).map(row => splitEscaped(row).length);
}

function validateCsv() {
    if (activeField !== null) return true;
    const counts = rowColumnCounts();
    if (counts.length === 0) return true;
    const frequencies = new Map();
    counts.forEach(count => frequencies.set(count, (frequencies.get(count) || 0) + 1));
    const expected = [...frequencies.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const invalid = counts.map((count, index) => count === expected ? null : index + 1).filter(Boolean);
    warning.textContent = invalid.length
        ? `Unequal numbers of unescaped commas. Check row${invalid.length === 1 ? '' : 's'} ${invalid.join(', ')}.`
        : '';
    badRows.replaceChildren(...invalid.map(row => {
        const marker = document.createElement('span');
        marker.textContent = `Row ${row}`;
        return marker;
    }));
    return invalid.length === 0;
}

function applyColumn() {
    const format = document.querySelector('input[name="bulk-format"]:checked')?.value || 'newline';
    const values = format === 'comma'
        ? splitEscaped(textarea.value)
        : textarea.value.split('\n').map(value => splitEscaped(value.trim(), '\0')[0]);
    const current = getState().items;
    const count = Math.max(current.length, values.length);
    const items = Array.from({ length: count }, (_, index) => {
        const item = current[index] || { name: 'New Item', lead: '', duration: '10m', locked: false, notes: '', themeColor: (index % 8) + 1 };
        const rawValue = values[index];
        if (rawValue === undefined) return item;
        return {
            ...item,
            [activeField]: activeField === 'themeColor' ? closestTheme(rawValue) : rawValue
        };
    });
    replaceItems(items);
}

function applyCsv() {
    if (!validateCsv()) throw new Error('Fix the highlighted CSV rows before applying.');
    const rows = textarea.value.split('\n').filter(row => row.trim()).map(row => splitEscaped(row));
    if (rows.length === 0) throw new Error('CSV input is empty.');
    const header = rows[0].map(value => value.toLowerCase());
    const required = ['item', 'lead', 'color', 'duration', 'locked', 'notes'];
    if (required.some((column, index) => header[index] !== column)) {
        throw new Error(`CSV header must be: ${required.map(value => value[0].toUpperCase() + value.slice(1)).join(',')}`);
    }
    const current = getState().items;
    replaceItems(rows.slice(1).map((row, index) => ({
        ...(current[index] || {}),
        name: row[0],
        lead: row[1],
        themeColor: closestTheme(row[2]),
        duration: row[3] || '10m',
        locked: /^(true|1|yes)$/i.test(row[4]),
        notes: row[5] || ''
    })));
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
        if (button) openModal(button.dataset.bulkField);
    });
    document.getElementById('btn-edit-csv')?.addEventListener('click', () => openModal());
    document.getElementById('bulk-edit-close')?.addEventListener('click', closeModal);
    document.getElementById('bulk-edit-cancel')?.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeModal();
    });
    textarea.addEventListener('input', validateCsv);
    document.querySelectorAll('input[name="bulk-format"]').forEach(radio => {
        radio.addEventListener('change', event => {
            if (activeField) textarea.value = serializeColumn(activeField, event.target.value);
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
