/**
 * main.js - Entry point for autoCHAIR
 * Initializes all modules and wires together the application
 */

import {
    initializeState,
    getState,
    subscribe,
    updateSettings,
    updateExportOptions,
    updateItem,
    resetState,
    undo,
    redo
} from './state.js';
import { initAgenda, handleAddItem } from './agenda.js';
import { initTimer } from './timer.js';
import { initStaging } from './staging.js';
import { initBulkEdit } from './bulk-edit.js';
import { initMetadata } from './metadata.js';
import { initPanelSwaps } from './panel-swap.js';
import { initLayoutResizers } from './layout-resize.js';
import { initTooltips } from './tooltips.js';
import { initExport, showNotification } from './export.js';
import {
    formatAlertOffsets,
    parseAlertOffsets,
    previewAlert,
    requestDesktopNotificationPermission
} from './alerts.js';
import { applyMarkdownAction, formatTimeValue, parseTime } from './utils.js';

const LOGO_FULL_SPIN_SECONDS = 8;
const NEXT_PREV_SPIN_SECONDS = LOGO_FULL_SPIN_SECONDS / 8;
const HEADER_SPIN_SECONDS = LOGO_FULL_SPIN_SECONDS / 2;
const LOGO_STOP_EPSILON_SECONDS = 0.03;

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

function normalizeLogoVideo(video) {
    if (!video) return;

    const setInitialFrame = () => {
        try {
            video.pause();
            video.currentTime = 0;
        } catch (err) {
            // Ignore seek errors before metadata is loaded.
        }
    };

    if (video.readyState >= 1) {
        setInitialFrame();
    } else {
        video.addEventListener('loadedmetadata', setInitialFrame, { once: true });
    }
}

function stopLogoSpin(video) {
    if (!video) return;

    if (video._logoSpinState) {
        const { timeoutId, onTimeUpdate, onEnded } = video._logoSpinState;
        if (timeoutId) clearTimeout(timeoutId);
        if (onTimeUpdate) video.removeEventListener('timeupdate', onTimeUpdate);
        if (onEnded) video.removeEventListener('ended', onEnded);
        video._logoSpinState = null;
    }

    video.pause();
}

function spinLogoSegment(video, seconds) {
    if (!video) return;

    normalizeLogoVideo(video);
    stopLogoSpin(video);

    const startPlayback = () => {
        const duration = Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : LOGO_FULL_SPIN_SECONDS;
        const endTime = Math.max(0.05, Math.min(seconds, duration));

        const finish = () => {
            stopLogoSpin(video);
            try {
                video.currentTime = Math.min(endTime, Math.max(0, duration - LOGO_STOP_EPSILON_SECONDS));
            } catch (err) {
                // Ignore seek issues.
            }
        };

        const onTimeUpdate = () => {
            if (video.currentTime >= endTime - LOGO_STOP_EPSILON_SECONDS) {
                finish();
            }
        };
        const onEnded = () => finish();

        const timeoutId = window.setTimeout(finish, Math.ceil((endTime + 0.2) * 1000));
        video._logoSpinState = { timeoutId, onTimeUpdate, onEnded };
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('ended', onEnded);

        try {
            video.currentTime = 0;
        } catch (err) {
            // Ignore seek issues.
        }

        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => finish());
        }
    };

    if (video.readyState >= 1) {
        startPlayback();
    } else {
        video.addEventListener('loadedmetadata', startPlayback, { once: true });
        video.load();
    }
}

function setHeaderLogoVariant(elements, direction) {
    const forwardVideo = elements.headerLogoVideoForward;
    const reverseVideo = elements.headerLogoVideoReverse;
    if (!forwardVideo && !reverseVideo) return null;

    const showReverse = direction === 'reverse';
    const activeVideo = showReverse ? reverseVideo : forwardVideo;
    const inactiveVideo = showReverse ? forwardVideo : reverseVideo;

    if (inactiveVideo) {
        stopLogoSpin(inactiveVideo);
        inactiveVideo.classList.add('is-hidden');
    }

    if (activeVideo) {
        activeVideo.classList.remove('is-hidden');
    }

    return activeVideo || inactiveVideo;
}

function spinHeaderLogo(elements, direction) {
    const activeVideo = setHeaderLogoVariant(elements, direction);
    if (activeVideo) {
        spinLogoSegment(activeVideo, HEADER_SPIN_SECONDS);
    }
}

function setupLogoAnimations(elements) {
    const {
        headerLogoButton,
        headerLogoVideoForward,
        headerLogoVideoReverse,
        prevItemLogoVideo,
        nextItemLogoVideo,
        prevItemButton,
        nextItemButton
    } = elements;

    [headerLogoVideoForward, headerLogoVideoReverse, prevItemLogoVideo, nextItemLogoVideo].forEach(normalizeLogoVideo);
    setHeaderLogoVariant(elements, 'forward');

    if (headerLogoButton) {
        headerLogoButton.addEventListener('click', () => {
            spinHeaderLogo(elements, 'forward');
        });
        headerLogoButton.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            spinHeaderLogo(elements, 'forward');
        });
    }

    if (nextItemButton && nextItemLogoVideo) {
        nextItemButton.addEventListener('click', () => {
            spinLogoSegment(nextItemLogoVideo, NEXT_PREV_SPIN_SECONDS);
        });
    }

    if (prevItemButton && prevItemLogoVideo) {
        prevItemButton.addEventListener('click', () => {
            spinLogoSegment(prevItemLogoVideo, NEXT_PREV_SPIN_SECONDS);
        });
    }

    window.addEventListener('autochair:data-imported', () => {
        spinHeaderLogo(elements, 'forward');
    });
}

/**
 * Initialize the application
 */
function init() {
    // Initialize state first
    initializeState();

    // Initialize tooltip system
    initTooltips();

    // Get DOM elements
    const elements = getElements();
    setupLogoAnimations(elements);

    // Initialize modules
    initAgenda(elements.agendaContainer);
    initStaging(elements.stagingContainer);
    initBulkEdit();
    initMetadata();

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
        stopButton: elements.stopButton,
        popoutButton: elements.popoutButton,
        prevItemButton: elements.prevItemButton,
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
    setupSettingsDrawer(elements);
    setupUndoRedoShortcuts();
    initPanelSwaps();

    // Enable panel split resizing handles
    initLayoutResizers();

    // Apply initial settings
    applySettings(getState());

    // Subscribe to state changes for settings updates
    subscribe((state) => {
        applySettings(state);
        syncStartTimeInputs(state);
        syncControlsFromState(state, elements);
    });

    // Initial sync of start time inputs
    syncStartTimeInputs(getState());
    syncControlsFromState(getState(), elements);

    console.log('autoCHAIR initialized');
}

function setupUndoRedoShortcuts() {
    document.addEventListener('keydown', (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        if (event.key.toLowerCase() !== 'z') return;

        const target = event.target;
        const isNativeEditor = target instanceof HTMLElement && (
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'INPUT' ||
            target.isContentEditable
        );
        if (isNativeEditor) return;

        event.preventDefault();
        if (target instanceof HTMLInputElement) target.blur();
        if (event.shiftKey) {
            redo();
        } else {
            undo();
        }
    });
}

function syncControlsFromState(state, elements) {
    const settings = state.settings || {};
    const exportOptions = state.exportOptions || {};
    const checkboxValues = [
        [elements.darkModeCheckbox, settings.darkMode],
        [elements.soundEffectsCheckbox, settings.soundEffects],
        [elements.syncSystemTimeCheckbox, settings.syncSystemTime],
        [elements.pinStartTimeCheckbox, settings.pinStartTime !== false],
        [elements.pinEndTimeCheckbox, settings.pinEndTime !== false],
        [elements.separateAdjacentColorsCheckbox, settings.separateAdjacentColors],
        [elements.showProgressBarCheckbox, settings.showProgressBar],
        [elements.oneMinWarningCheckbox, settings.oneMinWarning],
        [elements.overtimeFlashCheckbox, settings.overtimeFlash],
        [elements.desktopNotificationsCheckbox, settings.desktopNotifications],
        [elements.includeHeaderCheckbox, exportOptions.includeHeader],
        [elements.includeNotesCheckbox, exportOptions.includeNotes],
        [elements.includePrepCheckbox, exportOptions.includePrep],
        [elements.includeContextCheckbox, exportOptions.includeContext],
        [elements.includeActionItemsCheckbox, exportOptions.includeActionItems]
    ];
    checkboxValues.forEach(([element, value]) => {
        if (!element) return;
        if (
            element === elements.desktopNotificationsCheckbox &&
            element.dataset.permissionPending === 'true'
        ) return;
        element.checked = !!value;
    });

    if (elements.densitySelect) elements.densitySelect.value = settings.density;
    if (elements.timerModeSelect) elements.timerModeSelect.value = settings.timerMode;
    if (elements.alertSoundSelect) elements.alertSoundSelect.value = settings.alertSound;
    if (elements.alertVisualSelect) elements.alertVisualSelect.value = settings.alertVisual;
    if (elements.alertWarningOffsetsInput && document.activeElement !== elements.alertWarningOffsetsInput) {
        elements.alertWarningOffsetsInput.value = formatAlertOffsets(settings.alertOffsetsSeconds || [60, 0]);
    }
    if (elements.bufferInput && document.activeElement !== elements.bufferInput) {
        elements.bufferInput.value = settings.buffer;
    }
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
        popoutButton: document.getElementById('btn-popout'),
        stopButton: document.getElementById('btn-stop'),

        // Status
        statusDisplay: document.getElementById('status-display'),
        statusClock: document.getElementById('status-clock'),

        // Current item
        currentItemPanel: document.getElementById('current-item-panel'),
        stagingContainer: document.getElementById('staging-container'),
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
        includeActionItemsCheckbox: document.getElementById('include-action-items'),

        // Settings
        startTimeInput: document.getElementById('start-time'),
        darkModeCheckbox: document.getElementById('dark-mode'),
        soundEffectsCheckbox: document.getElementById('sound-effects'),
        syncSystemTimeCheckbox: document.getElementById('sync-system-time'),
        pinStartTimeCheckbox: document.getElementById('pin-start-time'),
        pinEndTimeCheckbox: document.getElementById('pin-end-time'),
        separateAdjacentColorsCheckbox: document.getElementById('separate-adjacent-colors'),
        densitySelect: document.getElementById('density'),
        showProgressBarCheckbox: document.getElementById('show-progress-bar'),
        bufferInput: document.getElementById('buffer'),
        timerModeSelect: document.getElementById('timer-mode'),
        oneMinWarningCheckbox: document.getElementById('one-min-warning'),
        overtimeFlashCheckbox: document.getElementById('overtime-flash'),
        alertWarningOffsetsInput: document.getElementById('alert-warning-offsets'),
        alertSoundSelect: document.getElementById('alert-sound-style'),
        alertVisualSelect: document.getElementById('alert-visual-style'),
        desktopNotificationsCheckbox: document.getElementById('desktop-notifications'),
        previewAlertButton: document.getElementById('btn-preview-alert'),
        resetBtn: document.getElementById('btn-reset'),
        prevItemButton: document.getElementById('btn-prev-item'),
        nextItemButton: document.getElementById('btn-next-item'),
        headerLogoButton: document.getElementById('btn-header-logo'),
        headerLogoVideoForward: document.getElementById('header-logo-video-forward'),
        headerLogoVideoReverse: document.getElementById('header-logo-video-reverse'),
        prevItemLogoVideo: document.getElementById('prev-item-logo-video'),
        nextItemLogoVideo: document.getElementById('next-item-logo-video'),
        settingsSidebar: document.getElementById('settings-sidebar'),
        settingsToggleButton: document.getElementById('btn-settings-toggle'),
        settingsCloseButton: document.getElementById('btn-settings-close'),
        settingsBackdrop: document.getElementById('settings-backdrop')
    };
}

function setupSettingsDrawer(elements) {
    const {
        settingsSidebar,
        settingsToggleButton,
        settingsCloseButton,
        settingsBackdrop
    } = elements;
    if (!settingsSidebar || !settingsToggleButton || !settingsCloseButton || !settingsBackdrop) return;

    const mobileQuery = window.matchMedia('(max-width: 1439px)');
    let returnFocus = null;

    const closeDrawer = ({ restoreFocus = true } = {}) => {
        const wasOpen = settingsSidebar.classList.contains('mobile-open');
        settingsSidebar.classList.remove('mobile-open');
        settingsBackdrop.classList.remove('visible');
        document.body.classList.remove('settings-drawer-open');
        settingsToggleButton.setAttribute('aria-expanded', 'false');
        if (mobileQuery.matches) {
            settingsSidebar.setAttribute('aria-hidden', 'true');
            settingsSidebar.inert = true;
        }
        if (restoreFocus && wasOpen && returnFocus instanceof HTMLElement) {
            returnFocus.focus({ preventScroll: true });
        }
        returnFocus = null;
    };

    const openDrawer = () => {
        if (!mobileQuery.matches) return;
        returnFocus = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : settingsToggleButton;
        settingsSidebar.inert = false;
        settingsSidebar.setAttribute('aria-hidden', 'false');
        settingsSidebar.classList.add('mobile-open');
        settingsBackdrop.classList.add('visible');
        document.body.classList.add('settings-drawer-open');
        settingsToggleButton.setAttribute('aria-expanded', 'true');
        settingsCloseButton.focus({ preventScroll: true });
    };

    const syncMode = () => {
        closeDrawer({ restoreFocus: false });
        if (mobileQuery.matches) {
            settingsSidebar.setAttribute('role', 'dialog');
            settingsSidebar.setAttribute('aria-modal', 'true');
            settingsSidebar.setAttribute('aria-hidden', 'true');
            settingsSidebar.inert = true;
        } else {
            settingsSidebar.removeAttribute('role');
            settingsSidebar.removeAttribute('aria-modal');
            settingsSidebar.removeAttribute('aria-hidden');
            settingsSidebar.inert = false;
        }
    };

    settingsToggleButton.addEventListener('click', () => {
        if (settingsSidebar.classList.contains('mobile-open')) {
            closeDrawer();
        } else {
            openDrawer();
        }
    });
    settingsCloseButton.addEventListener('click', () => closeDrawer());
    settingsBackdrop.addEventListener('click', () => closeDrawer());
    document.addEventListener('keydown', (event) => {
        if (!settingsSidebar.classList.contains('mobile-open')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDrawer();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusable = [...settingsSidebar.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )].filter(element => element.getClientRects().length > 0);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    mobileQuery.addEventListener('change', syncMode);
    syncMode();
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
                spinHeaderLogo(elements, 'reverse');
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
 * Sync start time inputs between agenda panel and settings
 * @param {Object} state - Current state
 */
function syncStartTimeInputs(state) {
    const settingsStartTime = document.getElementById('start-time');

    if (state.settings.startTime) {
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
        { el: elements.includeContextCheckbox, key: 'includeContext' },
        { el: elements.includeActionItemsCheckbox, key: 'includeActionItems' }
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
            updateSettings({
                syncSystemTime: e.target.checked,
                ...(e.target.checked ? { startTime: formatTimeValue(new Date()) } : {})
            });
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

    if (elements.separateAdjacentColorsCheckbox) {
        elements.separateAdjacentColorsCheckbox.checked = state.settings.separateAdjacentColors;
        elements.separateAdjacentColorsCheckbox.addEventListener('change', (e) => {
            updateSettings({ separateAdjacentColors: e.target.checked });
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

    if (elements.alertWarningOffsetsInput) {
        elements.alertWarningOffsetsInput.value = formatAlertOffsets(state.settings.alertOffsetsSeconds);
        elements.alertWarningOffsetsInput.addEventListener('change', (e) => {
            try {
                updateSettings({ alertOffsetsSeconds: parseAlertOffsets(e.target.value) });
            } catch (error) {
                e.target.value = formatAlertOffsets(getState().settings.alertOffsetsSeconds);
                showNotification(error.message, 'warning');
            }
        });
    }

    if (elements.alertSoundSelect) {
        elements.alertSoundSelect.value = state.settings.alertSound;
        elements.alertSoundSelect.addEventListener('change', (e) => {
            updateSettings({ alertSound: e.target.value });
        });
    }

    if (elements.alertVisualSelect) {
        elements.alertVisualSelect.value = state.settings.alertVisual;
        elements.alertVisualSelect.addEventListener('change', (e) => {
            updateSettings({ alertVisual: e.target.value });
        });
    }

    let desktopPermissionRequestVersion = 0;
    if (elements.desktopNotificationsCheckbox) {
        elements.desktopNotificationsCheckbox.checked = state.settings.desktopNotifications;
        elements.desktopNotificationsCheckbox.addEventListener('change', async (e) => {
            const requestVersion = ++desktopPermissionRequestVersion;
            if (!e.target.checked) {
                delete e.target.dataset.permissionPending;
                e.target.removeAttribute('aria-busy');
                updateSettings({ desktopNotifications: false });
                return;
            }
            e.target.dataset.permissionPending = 'true';
            e.target.setAttribute('aria-busy', 'true');
            try {
                const permission = await requestDesktopNotificationPermission();
                if (requestVersion !== desktopPermissionRequestVersion) return;
                delete e.target.dataset.permissionPending;
                e.target.removeAttribute('aria-busy');
                const enabled = permission === 'granted';
                updateSettings({ desktopNotifications: enabled });
                if (!enabled) showNotification('Desktop notification permission was not granted', 'warning');
            } catch (error) {
                if (requestVersion !== desktopPermissionRequestVersion) return;
                delete e.target.dataset.permissionPending;
                e.target.removeAttribute('aria-busy');
                updateSettings({ desktopNotifications: false });
                showNotification(error.message, 'warning');
            }
        });
    }

    if (elements.previewAlertButton) {
        elements.previewAlertButton.addEventListener('click', previewAlert);
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

    const editNotes = action => {
        const value = applyMarkdownAction(notesArea, action);
        const itemId = notesArea.dataset.itemId;
        if (value !== null && itemId) updateItem(itemId, { notes: value });
    };

    toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        editNotes(action);
    });

    notesArea.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'b') {
                e.preventDefault();
                editNotes('bold');
            } else if (e.key === 'i') {
                e.preventDefault();
                editNotes('italic');
            }
        }
    });
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
