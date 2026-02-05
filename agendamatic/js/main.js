/**
 * main.js - Entry point for Agendamatic
 * Initializes all modules and wires together the application
 */

import { initializeState, getState, subscribe, updateSettings, updateExportOptions, updateItem, resetState } from './state.js';
import { initAgenda, handleAddItem } from './agenda.js';
import { initTimer } from './timer.js';
import { initTooltips } from './tooltips.js';
import { initExport, showNotification } from './export.js';
import { formatTime, parseTime } from './utils.js';

/**
 * Format a Date as HH:MM (24-hour) for settings storage
 * @param {Date} date - Date object
 * @returns {string} Time string
 */
function formatTimeValue(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
}

/**
 * Step the meeting start time by delta minutes and return HH:MM
 * @param {number} deltaMinutes - Minutes to add/subtract
 * @returns {string} Updated time string
 */
function getSteppedStartTime(deltaMinutes) {
    const state = getState();
    const currentTime = parseTime(state.settings.startTime);
    currentTime.setMinutes(currentTime.getMinutes() + deltaMinutes);
    return formatTimeValue(currentTime);
}

/**
 * Initialize the application
 */
function init() {
    // Initialize state first
    initializeState();

    // Initialize tooltip system
    initTooltips();

    // Request location once to prompt timezone permissions
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(() => {}, () => {});
    }

    // Get DOM elements
    const elements = getElements();

    // Initialize modules
    initAgenda(elements.agendaContainer);

    initTimer({
        timelineTrack: elements.timelineTrack,
        timelineAxis: elements.timelineAxis,
        currentTimeMarker: elements.currentTimeMarker,
        statusDisplay: elements.statusDisplay,
        statusClock: elements.statusClock,
        currentItemPanel: elements.currentItemPanel,
        currentStatusDisplay: elements.currentStatusDisplay,
        currentStatusTape: elements.currentStatusTape,
        currentStatusItem: elements.currentStatusItem,
        currentStatusNextItem: elements.currentStatusNextItem,
        currentStatusNextLine: elements.currentStatusNextLine,
        progressBar: elements.progressBar,
        startButton: elements.startButton,
        stopButton: elements.stopButton,
        nextItemButton: elements.nextItemButton
    });

    initExport({
        exportMdBtn: elements.exportMdBtn,
        exportTxtBtn: elements.exportTxtBtn,
        exportDocxBtn: elements.exportDocxBtn,
        exportJsonBtn: elements.exportJsonBtn,
        importJsonBtn: elements.importJsonBtn,
        importInlineBtn: elements.importInlineBtn,
        importFileInput: elements.importFileInput,
        copyLinkBtn: elements.copyLinkBtn
    });

    // Set up event listeners
    setupEventListeners(elements);

    // Apply initial settings
    applySettings(getState());

    // Subscribe to state changes for settings updates
    subscribe((state) => {
        applySettings(state);
        syncStartTimeInputs(state);
    });

    // Initial sync of start time inputs
    syncStartTimeInputs(getState());

    console.log('Agendamatic initialized');
}

/**
 * Get all required DOM elements
 * @returns {Object} Object containing DOM elements
 */
function getElements() {
    return {
        // Agenda
        agendaContainer: document.getElementById('agenda-container'),
        addItemBtn: document.getElementById('btn-add-item'),

        // Timeline
        timelineTrack: document.getElementById('timeline-track'),
        timelineAxis: document.getElementById('timeline-axis'),
        currentTimeMarker: document.getElementById('current-time-marker'),
        startButton: document.getElementById('btn-start'),
        stopButton: document.getElementById('btn-stop'),

        // Status
        statusDisplay: document.getElementById('status-display'),
        statusClock: document.getElementById('status-clock'),

        // Current item
        currentItemPanel: document.getElementById('current-item-panel'),
        notesArea: document.getElementById('notes-area'),

        // Progress
        progressBar: document.getElementById('progress-bar'),

        // Current status panel
        currentStatusDisplay: document.getElementById('current-status-display'),
        currentStatusTape: document.getElementById('current-status-tape'),
        currentStatusItem: document.getElementById('current-status-item'),
        currentStatusNextItem: document.getElementById('current-status-next-item'),
        currentStatusNextLine: document.getElementById('current-status-next'),

        // Export
        exportMdBtn: document.getElementById('btn-export-md'),
        exportTxtBtn: document.getElementById('btn-export-txt'),
        exportDocxBtn: document.getElementById('btn-export-docx'),
        exportJsonBtn: document.getElementById('btn-export-json'),
        importJsonBtn: document.getElementById('btn-import-json'),
        importInlineBtn: document.getElementById('btn-import-inline'),
        importFileInput: document.getElementById('import-file-input'),
        copyLinkBtn: document.getElementById('btn-copy-link'),

        // Export options
        includeHeaderCheckbox: document.getElementById('include-header'),
        includeNotesCheckbox: document.getElementById('include-notes'),
        includePrepCheckbox: document.getElementById('include-prep'),
        includeContextCheckbox: document.getElementById('include-context'),

        // Settings
        startTimeInput: document.getElementById('start-time'),
        darkModeCheckbox: document.getElementById('dark-mode'),
        soundEffectsCheckbox: document.getElementById('sound-effects'),
        syncSystemTimeCheckbox: document.getElementById('sync-system-time'),
        pinStartTimeCheckbox: document.getElementById('pin-start-time'),
        pinEndTimeCheckbox: document.getElementById('pin-end-time'),
        densitySelect: document.getElementById('density'),
        showProgressBarCheckbox: document.getElementById('show-progress-bar'),
        bufferInput: document.getElementById('buffer'),
        timerModeSelect: document.getElementById('timer-mode'),
        oneMinWarningCheckbox: document.getElementById('one-min-warning'),
        overtimeFlashCheckbox: document.getElementById('overtime-flash'),
        resetBtn: document.getElementById('btn-reset'),
        nextItemButton: document.getElementById('btn-next-item')
    };
}

/**
 * Set up event listeners for UI elements
 * @param {Object} elements - DOM elements
 */
function setupEventListeners(elements) {
    // Add item button
    if (elements.addItemBtn) {
        elements.addItemBtn.addEventListener('click', handleAddItem);
    }

    // Notes area - save on change
    if (elements.notesArea) {
        elements.notesArea.addEventListener('input', (e) => {
            const itemId = e.target.dataset.itemId;
            if (itemId) {
                updateItem(itemId, { notes: e.target.value });
            }
        });
    }

    // Export options
    setupExportOptionsListeners(elements);

    // Settings
    setupSettingsListeners(elements);

    // Notes toolbar
    setupNotesEditor(elements);

    // Reset button
    if (elements.resetBtn) {
        elements.resetBtn.addEventListener('click', () => {
            if (confirm('Reset all agenda items and settings to defaults?')) {
                resetState();
                showNotification('Reset to defaults', 'success');
            }
        });
    }

    // Settings time spinner buttons
    const settingsTimeWrapper = document.querySelector('.settings-time-wrapper');
    if (settingsTimeWrapper) {
        settingsTimeWrapper.querySelectorAll('.settings-time-spinner button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const action = btn.dataset.action;
                const delta = action === 'settings-time-up' ? 5 : -5;
                updateSettings({ startTime: getSteppedStartTime(delta) });
            });
        });
    }
}

/**
 * Set up a time input with scroll wheel support
 * @param {HTMLInputElement} input - Time input element
 * @param {Function} onChange - Callback when time changes
 */
function setupTimeInput(input, onChange) {
    // Scroll wheel
    input.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 5 : -5;
        onChange(getSteppedStartTime(delta));
    });

    // Direct input change
    input.addEventListener('change', (e) => {
        const value = e.target.value;
        // Try to parse various formats
        const time = parseTimeString(value);
        if (time) {
            const hours = time.getHours().toString().padStart(2, '0');
            const mins = time.getMinutes().toString().padStart(2, '0');
            onChange(`${hours}:${mins}`);
        }
    });
}

/**
 * Parse a time string in various formats
 * @param {string} str - Time string
 * @returns {Date|null} Date object or null
 */
function parseTimeString(str) {
    if (!str) return null;

    // Try parsing with parseTime utility
    const result = parseTime(str);
    if (result && !isNaN(result.getTime())) {
        return result;
    }

    return null;
}

/**
 * Sync start time inputs between agenda panel and settings
 * @param {Object} state - Current state
 */
function syncStartTimeInputs(state) {
    const settingsStartTime = document.getElementById('start-time');

    if (state.settings.startTime) {
        const time = parseTime(state.settings.startTime);
        const displayTime = formatTime(time);

        if (settingsStartTime) {
            settingsStartTime.value = state.settings.startTime;
        }
    }
}

/**
 * Set up export options listeners
 * @param {Object} elements - DOM elements
 */
function setupExportOptionsListeners(elements) {
    const checkboxes = [
        { el: elements.includeHeaderCheckbox, key: 'includeHeader' },
        { el: elements.includeNotesCheckbox, key: 'includeNotes' },
        { el: elements.includePrepCheckbox, key: 'includePrep' },
        { el: elements.includeContextCheckbox, key: 'includeContext' }
    ];

    checkboxes.forEach(({ el, key }) => {
        if (el) {
            // Set initial value from state
            el.checked = getState().exportOptions[key];

            el.addEventListener('change', (e) => {
                updateExportOptions({ [key]: e.target.checked });
            });
        }
    });
}

/**
 * Set up settings listeners
 * @param {Object} elements - DOM elements
 */
function setupSettingsListeners(elements) {
    const state = getState();

    // Start time
    if (elements.startTimeInput) {
        elements.startTimeInput.value = state.settings.startTime;
        elements.startTimeInput.addEventListener('change', (e) => {
            updateSettings({ startTime: e.target.value });
        });

        // Scroll wheel support
        elements.startTimeInput.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 5 : -5;
            updateSettings({ startTime: getSteppedStartTime(delta) });
        });
    }

    // Dark mode
    if (elements.darkModeCheckbox) {
        elements.darkModeCheckbox.checked = state.settings.darkMode;
        elements.darkModeCheckbox.addEventListener('change', (e) => {
            updateSettings({ darkMode: e.target.checked });
        });
    }

    // Sound effects
    if (elements.soundEffectsCheckbox) {
        elements.soundEffectsCheckbox.checked = state.settings.soundEffects;
        elements.soundEffectsCheckbox.addEventListener('change', (e) => {
            updateSettings({ soundEffects: e.target.checked });
        });
    }

    // Sync system time
    if (elements.syncSystemTimeCheckbox) {
        elements.syncSystemTimeCheckbox.checked = state.settings.syncSystemTime;
        elements.syncSystemTimeCheckbox.addEventListener('change', (e) => {
            updateSettings({ syncSystemTime: e.target.checked });
        });
    }

    // Pin start time
    if (elements.pinStartTimeCheckbox) {
        elements.pinStartTimeCheckbox.checked = state.settings.pinStartTime !== false;
        elements.pinStartTimeCheckbox.addEventListener('change', (e) => {
            updateSettings({ pinStartTime: e.target.checked });
        });
    }

    // Pin end time
    if (elements.pinEndTimeCheckbox) {
        elements.pinEndTimeCheckbox.checked = state.settings.pinEndTime !== false;
        elements.pinEndTimeCheckbox.addEventListener('change', (e) => {
            updateSettings({ pinEndTime: e.target.checked });
        });
    }

    // Density
    if (elements.densitySelect) {
        elements.densitySelect.value = state.settings.density;
        elements.densitySelect.addEventListener('change', (e) => {
            updateSettings({ density: e.target.value });
        });
    }

    // Show progress bar
    if (elements.showProgressBarCheckbox) {
        elements.showProgressBarCheckbox.checked = state.settings.showProgressBar;
        elements.showProgressBarCheckbox.addEventListener('change', (e) => {
            updateSettings({ showProgressBar: e.target.checked });
        });
    }

    // Buffer
    if (elements.bufferInput) {
        elements.bufferInput.value = state.settings.buffer;
        elements.bufferInput.addEventListener('change', (e) => {
            updateSettings({ buffer: parseInt(e.target.value, 10) || 0 });
        });
    }

    // Timer mode
    if (elements.timerModeSelect) {
        elements.timerModeSelect.value = state.settings.timerMode;
        elements.timerModeSelect.addEventListener('change', (e) => {
            updateSettings({ timerMode: e.target.value });
        });
    }

    // One min warning
    if (elements.oneMinWarningCheckbox) {
        elements.oneMinWarningCheckbox.checked = state.settings.oneMinWarning;
        elements.oneMinWarningCheckbox.addEventListener('change', (e) => {
            updateSettings({ oneMinWarning: e.target.checked });
        });
    }

    // Overtime flash
    if (elements.overtimeFlashCheckbox) {
        elements.overtimeFlashCheckbox.checked = state.settings.overtimeFlash;
        elements.overtimeFlashCheckbox.addEventListener('change', (e) => {
            updateSettings({ overtimeFlash: e.target.checked });
        });
    }
}

/**
 * Set up markdown toolbar for the current item notes
 * @param {Object} elements - DOM elements
 */
function setupNotesEditor(elements) {
    const toolbar = document.querySelector('.notes-toolbar');
    const notesArea = elements.notesArea;

    if (!toolbar || !notesArea) return;

    toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        applyMarkdownAction(notesArea, action);
    });

    notesArea.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'b') {
                e.preventDefault();
                applyMarkdownAction(notesArea, 'bold');
            } else if (e.key === 'i') {
                e.preventDefault();
                applyMarkdownAction(notesArea, 'italic');
            }
        }
    });
}

/**
 * Apply a markdown action to a textarea selection
 * @param {HTMLTextAreaElement} textarea - Notes textarea
 * @param {string} action - Action name
 */
function applyMarkdownAction(textarea, action) {
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let replacement = '';
    let cursorOffset = 0;

    switch (action) {
        case 'bold':
            replacement = `**${selectedText}**`;
            cursorOffset = selectedText ? replacement.length : 2;
            break;
        case 'italic':
            replacement = `*${selectedText}*`;
            cursorOffset = selectedText ? replacement.length : 1;
            break;
        case 'heading':
            replacement = `## ${selectedText}`;
            cursorOffset = replacement.length;
            break;
        case 'bullet':
            replacement = selectedText
                ? selectedText.split('\n').map(line => `- ${line}`).join('\n')
                : '- ';
            cursorOffset = replacement.length;
            break;
        case 'numbered':
            replacement = selectedText
                ? selectedText.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n')
                : '1. ';
            cursorOffset = replacement.length;
            break;
        case 'link':
            replacement = `[${selectedText || 'link text'}](url)`;
            cursorOffset = selectedText ? replacement.length : 1;
            break;
        case 'code':
            replacement = selectedText.includes('\n')
                ? `\`\`\`\n${selectedText}\n\`\`\``
                : `\`${selectedText}\``;
            cursorOffset = selectedText ? replacement.length : 1;
            break;
        default:
            return;
    }

    textarea.value =
        textarea.value.substring(0, start) +
        replacement +
        textarea.value.substring(end);

    const newPosition = start + cursorOffset;
    textarea.setSelectionRange(newPosition, newPosition);
    textarea.focus();

    const itemId = textarea.dataset.itemId;
    if (itemId) {
        updateItem(itemId, { notes: textarea.value });
    }
}

/**
 * Apply settings to the DOM
 * @param {Object} state - Current state
 */
function applySettings(state) {
    const { settings } = state;

    // Dark mode
    if (settings.darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    // Density
    document.documentElement.setAttribute('data-density', settings.density);

    // Progress bar visibility
    const progressContainer = document.querySelector('.progress-bar-container');
    if (progressContainer) {
        progressContainer.classList.toggle('visible', settings.showProgressBar);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
