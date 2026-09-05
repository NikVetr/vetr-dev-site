/**
 * timer.js - Timeline visualization and real-time tracking
 */

import {
    getState,
    subscribe,
    updateSettings,
    updateTracker,
    updateItem,
    updateIntervalTime,
    calculateIntervals,
    calculateAdjustedIntervals,
    advanceToNextItem,
    ensureExpectedSnapshot,
    retreatToPreviousItem,
    reorderItems,
    unstageItem,
    beginHistoryTransaction,
    endHistoryTransaction
} from './state.js';
import {
    formatTime,
    getMinutesDiff,
    clamp,
    parseDuration,
    parseTime,
    formatDuration,
    renderMarkdownToHtml,
    setGlobalDragCursor
} from './utils.js';
import { processAlertTick } from './alerts.js';
import {
    applyItemColorStyles,
    clearItemColorStyles,
    colorRgb,
    getItemAccentColor,
    getItemColor
} from './colors.js';

let timelineTrack = null;
let timelineAxis = null;
let currentTimeMarker = null;
let statusDisplayEl = null;
let statusClockEl = null;
let statusUnitEl = null;
let currentItemPanel = null;
let notesPreviewEl = null;
let progressBar = null;
let progressGuideLine = null;
let tickerTape = null;
let tickInterval = null;
let popoutResizeTimeout = null;

const KEYBOARD_CONTROL_SELECTOR = [
    'input',
    'textarea',
    'select',
    'button',
    'a[href]',
    'summary',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="slider"]',
    '[role="textbox"]',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

function isKeyboardControl(target, view = window) {
    return target instanceof view.HTMLElement && !!target.closest(KEYBOARD_CONTROL_SELECTOR);
}
let popoutTrackerSignature = null;
let popoutOverallSignature = null;
let popoutCurrentSignature = null;
let lastLiveLayoutKey = null;
let stopButton = null;
let popoutButton = null;
let prevItemButton = null;
let meetingControls = null;
let controlsResizer = null;
let primaryActionWord = null;
let primaryObjectWord = null;
let overflowLabelsContainer = null;
let currentStatusBox = null;
let currentStatusTape = null;
let currentStatusItemEl = null;
let currentStatusNextItemEl = null;
let currentStatusNextLineEl = null;
let currentStatusLabelEl = null;
let currentStatusUnitEl = null;
let nextItemButton = null;
let trackerDropIndex = null;
let trackerResizeState = null;
let popoutWindow = null;
let pendingLayoutRefresh = false;

function refreshLayoutDependentTrackerViews() {
    renderTimeline();
    renderAxisTicks();
    updateCurrentTimeMarker();
    updateProgressBar();
}

function scheduleLayoutRefresh() {
    if (pendingLayoutRefresh) return;
    pendingLayoutRefresh = true;

    requestAnimationFrame(() => {
        pendingLayoutRefresh = false;
        refreshLayoutDependentTrackerViews();
    });
}

// Ticker state for smooth animation
let lastDifference = 0;
let lastStatus = 'on-time';

/**
 * Initialize the timer module
 * @param {Object} elements - DOM elements
 */
export function initTimer(elements) {
    timelineTrack = elements.timelineTrack;
    timelineAxis = elements.timelineAxis;
    currentTimeMarker = elements.currentTimeMarker;
    statusDisplayEl = elements.statusDisplay;
    statusClockEl = elements.statusClock;
    statusUnitEl = document.getElementById('status-unit');
    currentItemPanel = elements.currentItemPanel;
    notesPreviewEl = document.getElementById('notes-preview');
    currentStatusBox = elements.currentStatusDisplay;
    currentStatusTape = elements.currentStatusTape;
    currentStatusItemEl = elements.currentStatusItem;
    currentStatusNextItemEl = elements.currentStatusNextItem;
    currentStatusNextLineEl = elements.currentStatusNextLine;
    currentStatusLabelEl = currentStatusBox?.querySelector('.current-status-label') || null;
    currentStatusUnitEl = currentStatusBox?.querySelector('.current-status-unit') || null;
    progressBar = elements.progressBar;
    progressGuideLine = document.getElementById('progress-guide-line');
    tickerTape = document.getElementById('ticker-tape');
    stopButton = elements.stopButton;
    popoutButton = elements.popoutButton;
    prevItemButton = elements.prevItemButton;
    overflowLabelsContainer = document.getElementById('overflow-labels');
    nextItemButton = elements.nextItemButton;
    meetingControls = nextItemButton?.closest('.next-item-controls') || null;
    controlsResizer = document.getElementById('resizer-next-controls');
    primaryActionWord = document.getElementById('primary-action-word');
    primaryObjectWord = document.getElementById('primary-object-word');

    // Subscribe to state changes
    subscribe(onStateChange);

    // Set up button handlers
    if (stopButton) {
        stopButton.addEventListener('click', stopTimer);
    }
    if (popoutButton) {
        popoutButton.addEventListener('click', openTrackerPopout);
    }
    if (prevItemButton) {
        prevItemButton.addEventListener('click', triggerRetreatToPreviousItem);
    }
    if (nextItemButton) {
        nextItemButton.addEventListener('click', triggerPrimaryAction);
    }

    setupTrackerDragDrop();

    document.addEventListener('keydown', (e) => {
        if (isKeyboardControl(e.target)) return;
        const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
        if (isSpace && !e.repeat) {
            e.preventDefault();
            triggerPrimaryAction();
            return;
        }

        const isBackspace = e.key === 'Backspace';
        if (isBackspace && !e.repeat) {
            e.preventDefault();
            triggerRetreatToPreviousItem();
        }
    });

    window.addEventListener('resize', scheduleLayoutRefresh);
    window.addEventListener('autochair:layout-resized', scheduleLayoutRefresh);

    // Initial render
    renderTimeline();
    renderAxisTicks();
    updateCurrentTimeMarker();
    updateStatusDisplay();
    updateCurrentItemPanel();
    updateCurrentStatusPanel();
    updateStatusClock();
    updateProgressBar();
    updateButtonStates();

    // Start the tick interval
    startTickInterval();
}

/**
 * Handle state changes
 * @param {Object} state - New state
 */
function onStateChange(state) {
    updateButtonStates();
    renderTimeline();
    renderAxisTicks();
    updateCurrentTimeMarker();
    updateStatusDisplay();
    updateCurrentItemPanel();
    updateCurrentStatusPanel();
    updateProgressBar();
}

function getTrackerDisplayTime() {
    const tracker = getState().tracker || {};
    if (tracker.completedAt) {
        const completedTime = new Date(tracker.completedAt);
        if (!Number.isNaN(completedTime.getTime())) return completedTime;
    }
    if (!tracker.isRunning && tracker.pausedAt) {
        const pausedTime = new Date(tracker.pausedAt);
        if (!Number.isNaN(pausedTime.getTime())) return pausedTime;
    }
    return new Date();
}

function getLiveLayoutKey(adjusted) {
    const tracker = getState().tracker || {};
    if (!tracker.isRunning && !tracker.startedAt) return 'inactive';
    return `${adjusted.currentItemIndex}:${Math.ceil((adjusted.currentOverrun || 0) * 4)}`;
}

function refreshLiveTrackerLayout() {
    const adjusted = calculateAdjustedIntervals();
    const nextKey = getLiveLayoutKey(adjusted);
    if (nextKey === lastLiveLayoutKey) return;
    lastLiveLayoutKey = nextKey;
    renderTimeline();
    renderAxisTicks();
}

/**
 * Start the real-time tick interval
 */
function startTickInterval() {
    if (tickInterval) {
        clearInterval(tickInterval);
    }

    // Update every second
    tickInterval = setInterval(() => {
        refreshLiveTrackerLayout();
        updateCurrentTimeMarker();
        updateStatusDisplay();
        updateCurrentItemPanel();
        updateCurrentStatusPanel();
        updateStatusClock();
        updateProgressBar();
        processAlertTick();
    }, 1000);
}

/**
 * Stop the tick interval
 */
function stopTickInterval() {
    if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
    }
}

/**
 * Start the timer
 */
export function startTimer() {
    beginHistoryTransaction();
    let state = getState();
    if (state.tracker.completedAt) {
        endHistoryTransaction();
        return false;
    }
    const now = new Date();
    const syncInitialStart = state.settings.syncSystemTime && !state.tracker.startedAt;
    if (syncInitialStart) {
        updateSettings({
            startTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        });
        state = getState();
    }
    const items = calculateIntervals();
    if (items.length === 0) {
        endHistoryTransaction();
        updateButtonStates();
        return false;
    }
    const hasStartedBefore = !!state.tracker.startedAt;
    const activeIdIndex = state.tracker.activeItemId
        ? state.items.findIndex(item => item.id === String(state.tracker.activeItemId))
        : -1;
    const activeItemIndex = hasStartedBefore
        ? (activeIdIndex >= 0
            ? activeIdIndex
            : Math.max(0, Math.min(items.length - 1, state.tracker.activeItemIndex ?? 0)))
        : 0;
    let scheduledStartAt = state.tracker.scheduledStartAt
        ? new Date(state.tracker.scheduledStartAt)
        : (syncInitialStart ? new Date(now) : parseTime(state.settings.startTime));
    if (Number.isNaN(scheduledStartAt.getTime())) scheduledStartAt = parseTime(state.settings.startTime);
    let activeStartedAt = state.tracker.activeStartedAt
        ? new Date(state.tracker.activeStartedAt)
        : (syncInitialStart ? new Date(now) : (items[activeItemIndex]?.startTime || scheduledStartAt));
    if (Number.isNaN(activeStartedAt.getTime())) activeStartedAt = items[activeItemIndex]?.startTime || scheduledStartAt;
    let accumulatedPauseMs = Number(state.tracker.accumulatedPauseMs) || 0;
    const completedIntervalsById = { ...state.tracker.completedIntervalsById };
    // Older saved runs have no records; preserve their current completed intervals before shifting anchors.
    items.slice(0, activeItemIndex).forEach(item => {
        if (!completedIntervalsById[item.id]) completedIntervalsById[item.id] = {
            startTime: item.startTime.toISOString(),
            endTime: item.endTime.toISOString(),
            durationMinutes: parseDuration(item.duration)
        };
    });
    if (hasStartedBefore && state.tracker.pausedAt) {
        const pausedAt = new Date(state.tracker.pausedAt);
        if (!Number.isNaN(pausedAt.getTime())) {
            const pauseMs = Math.max(0, now.getTime() - pausedAt.getTime());
            scheduledStartAt = new Date(scheduledStartAt.getTime() + pauseMs);
            activeStartedAt = new Date(activeStartedAt.getTime() + pauseMs);
            accumulatedPauseMs += pauseMs;
        }
    }
    if (!state.tracker.expectedSnapshot) {
        ensureExpectedSnapshot(scheduledStartAt.toISOString());
        state = getState();
    }
    updateTracker({
        isRunning: true,
        startedAt: state.tracker.startedAt || now.toISOString(),
        scheduledStartAt: scheduledStartAt.toISOString(),
        pausedAt: null,
        accumulatedPauseMs,
        activeItemIndex: Math.max(0, activeItemIndex),
        activeItemId: state.items[activeItemIndex]?.id || null,
        activeStartedAt: activeStartedAt.toISOString(),
        activeWallStartedAt: state.tracker.activeWallStartedAt || activeStartedAt.toISOString(),
        completedIntervalsById,
        completedAt: null,
        completedDiffById: hasStartedBefore ? (state.tracker.completedDiffById || {}) : {},
        overallDeltaMinutes: hasStartedBefore ? (state.tracker.overallDeltaMinutes || 0) : 0
    });
    endHistoryTransaction();
    updateButtonStates();
    return true;
}

/**
 * Stop/pause the timer
 */
export function stopTimer() {
    if (!getState().tracker.isRunning) return false;
    updateTracker({
        isRunning: false,
        pausedAt: new Date().toISOString()
    });
    updateButtonStates();
    return true;
}

/**
 * Update button states based on tracker state
 */
function updateButtonStates() {
    const state = getState();
    const phase = getTrackerPhase(state.tracker);
    const hasItems = state.items.length > 0;
    const currentIndex = calculateAdjustedIntervals().currentItemIndex;

    if (meetingControls) meetingControls.dataset.phase = phase;
    if (controlsResizer) controlsResizer.hidden = phase === 'idle';
    if (prevItemButton) {
        prevItemButton.hidden = phase === 'idle';
        prevItemButton.disabled = !hasItems || phase === 'idle' || (
            phase !== 'completed' && currentIndex <= 0
        );
    }
    if (nextItemButton) {
        const copy = {
            idle: ['START', 'MEETING'],
            running: ['NEXT', 'ITEM'],
            paused: ['RESUME', 'MEETING'],
            completed: ['MEETING', 'COMPLETE']
        }[phase];
        if (primaryActionWord) primaryActionWord.textContent = copy[0];
        if (primaryObjectWord) primaryObjectWord.textContent = copy[1];
        nextItemButton.disabled = !hasItems || phase === 'completed';
        nextItemButton.setAttribute('aria-label', {
            idle: 'Start meeting',
            running: 'Next agenda item',
            paused: 'Resume meeting',
            completed: 'Meeting complete'
        }[phase]);
        nextItemButton.dataset.tooltip = !hasItems
            ? 'Add an agenda item before starting the meeting'
            : {
                idle: 'Start tracking the meeting',
                running: 'Advance to the next agenda item',
                paused: 'Resume tracking the meeting',
                completed: 'The meeting is complete'
            }[phase];
        if (phase === 'completed') nextItemButton.removeAttribute('aria-keyshortcuts');
        else nextItemButton.setAttribute('aria-keyshortcuts', 'Space');
    }
    if (stopButton) {
        stopButton.hidden = phase !== 'running';
    }
}

function getTrackerPhase(tracker) {
    if (tracker.completedAt) return 'completed';
    if (tracker.isRunning) return 'running';
    if (tracker.startedAt) return 'paused';
    return 'idle';
}

function triggerPrimaryAction() {
    const phase = getTrackerPhase(getState().tracker);
    if (phase === 'idle' || phase === 'paused') {
        startTimer();
        syncPopoutWindow();
        return;
    }
    if (phase === 'completed') {
        updateCurrentStatusPanel();
        syncPopoutWindow();
        return;
    }

    const advanced = advanceToNextItem();
    if (!advanced) {
        // Keep controls in sync even when no state mutation happened.
        updateCurrentStatusPanel();
    }
    syncPopoutWindow();
}

function triggerRetreatToPreviousItem() {
    const moved = retreatToPreviousItem();
    if (!moved) {
        updateCurrentStatusPanel();
    }
    syncPopoutWindow();
}

function fitTickerToContainer(tapeEl) {
    if (!tapeEl) return;
    if (tapeEl.classList.contains('continuous-ticker')) {
        tapeEl.dataset.fitScale = '1';
        tapeEl.style.transform = '';
        return;
    }
    const container = tapeEl.parentElement;
    if (!container) return;

    const availableWidth = container.clientWidth * 0.9;
    const availableHeight = container.clientHeight * 0.9;
    const contentWidth = tapeEl.scrollWidth;
    const contentHeight = tapeEl.scrollHeight;
    let scale = 1;
    if (availableWidth > 0 && contentWidth > 0) {
        scale = Math.min(scale, availableWidth / contentWidth);
    }
    if (availableHeight > 0 && contentHeight > 0) {
        scale = Math.min(scale, availableHeight / contentHeight);
    }
    scale = Math.max(0.2, Math.min(1, scale));

    tapeEl.dataset.fitScale = `${scale}`;
    setTickerTransform(tapeEl, 0);
}

function setTickerTransform(tapeEl, shiftPx = 0) {
    if (!tapeEl) return;
    const scale = parseFloat(tapeEl.dataset.fitScale || '1');
    tapeEl.style.transform = `translateX(${shiftPx}px) scale(${scale})`;
}

function setupTrackerDragDrop() {
    if (!timelineTrack) return;

    timelineTrack.addEventListener('dragover', (e) => {
        const source = e.dataTransfer?.getData('application/x-agenda-source') || document.body.dataset.dragSource;
        if (source !== 'agenda' && source !== 'staging') return;
        e.preventDefault();
        trackerDropIndex = getTrackerDropIndex(e.clientX);
        showTrackerDropIndicator(trackerDropIndex);
        timelineTrack.classList.add('drag-active');
    });

    timelineTrack.addEventListener('dragleave', (e) => {
        if (!timelineTrack.contains(e.relatedTarget)) {
            clearTrackerDropIndicators();
        }
    });

    timelineTrack.addEventListener('drop', (e) => {
        const source = e.dataTransfer?.getData('application/x-agenda-source') || document.body.dataset.dragSource;
        const itemId = e.dataTransfer?.getData('text/plain') || document.body.dataset.dragItemId;
        if (!itemId || (source !== 'agenda' && source !== 'staging')) {
            clearTrackerDropIndicators();
            return;
        }

        e.preventDefault();
        const dropIndex = trackerDropIndex ?? getTrackerDropIndex(e.clientX);
        clearTrackerDropIndicators();

        if (source === 'agenda') {
            const items = getState().items || [];
            const fromIndex = items.findIndex(item => item.id === itemId);
            if (fromIndex < 0) return;
            let toIndex = dropIndex;
            if (fromIndex < toIndex) toIndex -= 1;
            if (toIndex < 0) toIndex = 0;
            if (toIndex > items.length - 1) toIndex = items.length - 1;
            if (fromIndex !== toIndex) {
                reorderItems(fromIndex, toIndex);
            }
            return;
        }

        if (source === 'staging') {
            unstageItem(itemId, dropIndex);
        }
    });
}

function getTrackerDropIndex(clientX) {
    if (!timelineTrack) return 0;
    const blocks = [...timelineTrack.querySelectorAll('.timeline-block')];
    if (blocks.length === 0) return 0;

    for (let i = 0; i < blocks.length; i += 1) {
        const rect = blocks[i].getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) {
            return i;
        }
    }
    return blocks.length;
}

function showTrackerDropIndicator(dropIndex) {
    if (!timelineTrack) return;
    const blocks = [...timelineTrack.querySelectorAll('.timeline-block')];
    blocks.forEach(block => {
        block.classList.remove('drop-target-left', 'drop-target-right');
    });

    if (blocks.length === 0) return;
    if (dropIndex <= 0) {
        blocks[0].classList.add('drop-target-left');
        return;
    }
    if (dropIndex >= blocks.length) {
        blocks[blocks.length - 1].classList.add('drop-target-right');
        return;
    }
    blocks[dropIndex].classList.add('drop-target-left');
}

function clearTrackerDropIndicators() {
    trackerDropIndex = null;
    if (!timelineTrack) return;
    timelineTrack.classList.remove('drag-active');
    timelineTrack.querySelectorAll('.timeline-block').forEach(block => {
        block.classList.remove('drop-target-left', 'drop-target-right');
    });
}

function adjustItemDurationByDelta(itemId, deltaMinutes) {
    const state = getState();
    const item = (state.items || []).find(entry => entry.id === itemId);
    if (!item) return;
    const current = parseDuration(item.duration || '1m');
    const next = Math.max(1, current + deltaMinutes);
    updateItem(itemId, { duration: formatDuration(next) });
}

function beginTrackerResize(blockEl, itemIndex, edge, pointerEvent) {
    if (!timelineTrack) return;
    const items = calculateIntervals();
    if (items.length === 0) return;

    beginHistoryTransaction();
    trackerResizeState = {
        blockEl,
        itemIndex,
        edge,
        framePending: false,
        pendingX: pointerEvent.clientX
    };

    blockEl.classList.add('is-resizing');
    blockEl.draggable = false;
    document.body.classList.add('dragging-item');
    setGlobalDragCursor(true);
    window.addEventListener('pointermove', handleTrackerResizeMove);
    window.addEventListener('pointerup', endTrackerResize);
    window.addEventListener('pointercancel', endTrackerResize);
}

function handleTrackerResizeMove(e) {
    if (!trackerResizeState || !timelineTrack) return;
    trackerResizeState.pendingX = e.clientX;
    if (trackerResizeState.framePending) return;

    trackerResizeState.framePending = true;
    requestAnimationFrame(() => {
        if (!trackerResizeState || !timelineTrack) return;
        trackerResizeState.framePending = false;

        const intervals = calculateIntervals();
        if (intervals.length === 0) return;

        const firstStart = intervals[0].startTime;
        const lastEnd = intervals[intervals.length - 1].endTime;
        const totalMinutes = Math.max(1, getMinutesDiff(firstStart, lastEnd));
        const trackRect = timelineTrack.getBoundingClientRect();
        if (trackRect.width <= 0) return;

        const ratio = clamp((trackerResizeState.pendingX - trackRect.left) / trackRect.width, 0, 1);
        const offsetMinutes = Math.round(totalMinutes * ratio);
        const targetTime = new Date(firstStart.getTime() + offsetMinutes * 60000);

        if (trackerResizeState.edge === 'left') {
            updateIntervalTime(trackerResizeState.itemIndex, 'start', targetTime);
        } else {
            updateIntervalTime(trackerResizeState.itemIndex, 'end', targetTime);
        }
    });
}

function endTrackerResize() {
    if (!trackerResizeState) return;
    if (trackerResizeState.blockEl) {
        trackerResizeState.blockEl.classList.remove('is-resizing');
        trackerResizeState.blockEl.draggable = true;
    }
    trackerResizeState = null;
    document.body.classList.remove('dragging-item');
    setGlobalDragCursor(false);
    window.removeEventListener('pointermove', handleTrackerResizeMove);
    window.removeEventListener('pointerup', endTrackerResize);
    window.removeEventListener('pointercancel', endTrackerResize);
    endHistoryTransaction();
}

function getTrackerStructureSignature() {
    const axisWrapper = document.querySelector('.timeline-axis-wrapper');
    const track = document.querySelector('.timeline-track');
    return JSON.stringify({
        labels: [...(axisWrapper?.querySelectorAll('.axis-tick-label') || [])]
            .map(label => label.className),
        ticks: [...(axisWrapper?.querySelectorAll('.axis-tick') || [])]
            .map(tick => tick.className.replace(' has-connector', '')),
        blocks: [...(track?.querySelectorAll('.timeline-block') || [])].map(block => ({
            id: block.dataset.id,
            className: block.className.replace(' label-overflow', ''),
            text: block.textContent,
            colorStyle: block.style.cssText
        }))
    });
}

function getSemanticDomSignature(element) {
    if (!element) return '';
    const descendants = [...element.querySelectorAll('*')]
        .map(node => {
            const text = node.classList.contains('ticker-number') ? '#' : node.textContent;
            return `${node.tagName}.${node.className}[${node.style.cssText}]:${node.childElementCount ? '' : text}`;
        })
        .join('|');
    return `${element.tagName}.${element.className}[${element.style.cssText}]`
        + `[${element.getAttribute('aria-label') || ''}]|${descendants}`;
}

function syncPopoutTicker(sourceTape, targetTape) {
    if (!sourceTape || !targetTape) return;
    const firstSync = targetTape.dataset.popoutTickerReady !== 'true';
    const initializing = firstSync || targetTape.dataset.popoutTickerInitializing === 'true';
    targetTape.className = sourceTape.className;
    if (initializing) targetTape.classList.add('ticker-scale-changing');
    targetTape.style.cssText = sourceTape.style.cssText;
    targetTape.dataset.fitScale = sourceTape.dataset.fitScale || '';
    targetTape.dataset.popoutTickerReady = 'true';
    if (firstSync) targetTape.dataset.popoutTickerInitializing = 'true';

    const sourceNumbers = [...sourceTape.children];
    const targetNumbers = [...targetTape.children];
    if (sourceNumbers.length !== targetNumbers.length) return;

    sourceNumbers.forEach((sourceNumber, index) => {
        const targetNumber = targetNumbers[index];
        targetNumber.className = sourceNumber.className;
        targetNumber.textContent = sourceNumber.textContent;
        targetNumber.style.cssText = sourceNumber.style.cssText;
        Object.keys(targetNumber.dataset).forEach(key => delete targetNumber.dataset[key]);
        Object.assign(targetNumber.dataset, sourceNumber.dataset);
    });

    if (firstSync) {
        // Commit cloned geometry before enabling motion so labels do not bunch on entry.
        targetTape.getBoundingClientRect();
        targetTape.ownerDocument.defaultView?.requestAnimationFrame(() => {
            targetTape.ownerDocument.defaultView?.requestAnimationFrame(() => {
                targetTape.classList.remove('ticker-scale-changing');
                delete targetTape.dataset.popoutTickerInitializing;
            });
        });
    }
}

function syncPopoutDynamicTracker(trackerHost) {
    let axisGeometryChanged = false;
    let blockGeometryChanged = false;
    const sourceAxisWrapper = document.querySelector('.timeline-axis-wrapper');
    const targetAxisWrapper = trackerHost.querySelector('.timeline-axis-wrapper');
    const sourceTicks = [...(sourceAxisWrapper?.querySelectorAll('.axis-tick') || [])];
    const targetTicks = [...(targetAxisWrapper?.querySelectorAll('.axis-tick') || [])];
    const sourceLabels = [...(sourceAxisWrapper?.querySelectorAll('.axis-tick-label') || [])];
    const targetLabels = [...(targetAxisWrapper?.querySelectorAll('.axis-tick-label') || [])];

    if (sourceTicks.length === targetTicks.length && sourceLabels.length === targetLabels.length) {
        sourceTicks.forEach((sourceTick, index) => {
            const targetTick = targetTicks[index];
            const sourceClass = sourceTick.className.replace(' has-connector', '');
            const targetClass = targetTick.className.replace(' has-connector', '');
            if (
                targetTick.style.left !== sourceTick.style.left ||
                targetTick.dataset.offset !== sourceTick.dataset.offset ||
                targetClass !== sourceClass
            ) {
                targetTick.style.left = sourceTick.style.left;
                targetTick.dataset.offset = sourceTick.dataset.offset;
                targetTick.className = sourceClass;
                axisGeometryChanged = true;
            }
        });
        sourceLabels.forEach((sourceLabel, index) => {
            const targetLabel = targetLabels[index];
            const attributes = ['tickOffset', 'desiredCenter', 'followColor', 'tickHeight'];
            const dataChanged = attributes.some(name => (
                targetLabel.dataset[name] !== sourceLabel.dataset[name]
            ));
            if (
                targetLabel.textContent !== sourceLabel.textContent ||
                targetLabel.className !== sourceLabel.className ||
                dataChanged
            ) {
                targetLabel.textContent = sourceLabel.textContent;
                targetLabel.className = sourceLabel.className;
                attributes.forEach(name => {
                    targetLabel.dataset[name] = sourceLabel.dataset[name] || '';
                });
                axisGeometryChanged = true;
            }
        });
    }

    const sourceTrack = document.querySelector('.timeline-track');
    const targetTrack = trackerHost.querySelector('.timeline-track');
    const sourceBlocks = [...(sourceTrack?.querySelectorAll('.timeline-block') || [])];
    const targetBlocks = [...(targetTrack?.querySelectorAll('.timeline-block') || [])];
    if (sourceBlocks.length === targetBlocks.length) {
        sourceBlocks.forEach((sourceBlock, index) => {
            const targetBlock = targetBlocks[index];
            if (
                targetBlock.style.left !== sourceBlock.style.left ||
                targetBlock.style.width !== sourceBlock.style.width
            ) {
                targetBlock.style.left = sourceBlock.style.left;
                targetBlock.style.width = sourceBlock.style.width;
                blockGeometryChanged = true;
            }
            targetBlock.title = sourceBlock.title;
        });
    }

    const sourceMarker = document.querySelector('.current-time-marker');
    const targetMarker = trackerHost.querySelector('.current-time-marker');
    if (sourceMarker && targetMarker) {
        targetMarker.style.left = sourceMarker.style.left;
        targetMarker.style.display = sourceMarker.style.display;
        targetMarker.style.opacity = sourceMarker.style.opacity;
    }

    const sourceProgressContainer = document.querySelector('.progress-bar-container');
    const targetProgressContainer = trackerHost.querySelector('.progress-bar-container');
    const sourceProgress = sourceProgressContainer?.querySelector('.progress-bar');
    const targetProgress = targetProgressContainer?.querySelector('.progress-bar');
    if (sourceProgressContainer && targetProgressContainer) {
        targetProgressContainer.className = sourceProgressContainer.className;
    }
    if (sourceProgress && targetProgress) {
        targetProgress.style.width = sourceProgress.style.width;
    }

    const popoutView = trackerHost.ownerDocument.defaultView;
    if (axisGeometryChanged || blockGeometryChanged) {
        popoutView?.requestAnimationFrame(() => {
            if (axisGeometryChanged) layoutClonedAxis(targetAxisWrapper);
            if (blockGeometryChanged) {
                const blockData = getTimelineBlockData(calculateAdjustedIntervals().items);
                renderOverflowLabels(
                    blockData,
                    targetTrack,
                    trackerHost.querySelector('.overflow-labels-container')
                );
            }
            syncPopoutProgressGuide(trackerHost);
        });
    } else {
        syncPopoutProgressGuide(trackerHost);
    }
}

function syncPopoutStatusPanel(source, host, selectors) {
    if (!source) {
        if (host.childElementCount) host.replaceChildren();
        return false;
    }

    let target = host.firstElementChild;
    if (!target || target.tagName !== source.tagName) {
        target = source.cloneNode(true);
        host.replaceChildren(target);
        return true;
    }

    target.className = source.className;
    target.style.cssText = source.style.cssText;
    ['role', 'aria-label', 'aria-live', 'aria-atomic'].forEach(attribute => {
        const value = source.getAttribute(attribute);
        if (value === null) target.removeAttribute(attribute);
        else target.setAttribute(attribute, value);
    });
    let changed = false;
    selectors.forEach(selector => {
        const sourceNode = source.querySelector(selector);
        const targetNode = target.querySelector(selector);
        if (!sourceNode || !targetNode) return;
        targetNode.className = sourceNode.className;
        targetNode.style.cssText = sourceNode.style.cssText;
        if (targetNode.innerHTML !== sourceNode.innerHTML) {
            targetNode.innerHTML = sourceNode.innerHTML;
            changed = true;
        }
    });
    return changed;
}

function openTrackerPopout() {
    if (popoutWindow && !popoutWindow.closed) {
        popoutWindow.focus();
        syncPopoutWindow();
        return;
    }

    popoutWindow = window.open('', 'autochair-tracker-popout', 'width=1500,height=420,resizable=yes');
    if (!popoutWindow) return;
    popoutTrackerSignature = null;
    popoutOverallSignature = null;
    popoutCurrentSignature = null;

    const baseHref = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}`;
    popoutWindow.document.open();
    popoutWindow.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>autoCHAIR Tracker</title>
  <base href="${baseHref}">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body class="popout-body">
  <div class="popout-layout">
    <section class="popout-pane popout-tracker-pane"><h3>Tracker</h3><div id="popout-tracker" class="popout-content timeline-container"></div></section>
    <section class="popout-pane popout-overall-pane"><h3>Agenda Status</h3><div id="popout-overall" class="popout-content overall-status-box"></div></section>
    <section class="popout-pane popout-current-pane"><h3>Current Status</h3><div id="popout-current" class="popout-content current-status-box"></div></section>
    <section class="popout-pane popout-control-pane">
      <h3>Controls</h3>
      <div class="popout-controls-wrap">
        <div class="popout-controls" data-phase="idle">
          <button id="btn-popout-prev" class="next-item-btn prev-item-btn popout-action" data-short-label="Previous" aria-label="Previous agenda item" aria-keyshortcuts="Backspace">
            <span>← Previous Item</span>
            <kbd>Backspace</kbd>
          </button>
          <button id="btn-popout-next" class="next-item-btn main-next-btn popout-action" data-short-label="Start" aria-label="Start meeting" aria-keyshortcuts="Space">
            <span id="popout-primary-label">Start Meeting</span>
            <kbd>Space</kbd>
          </button>
        </div>
      </div>
    </section>
  </div>
</body>
</html>`);
    popoutWindow.document.close();
    syncPopoutAppearance(popoutWindow.document);
    popoutWindow.addEventListener('beforeunload', cleanupPopoutWindow);

    const popoutPrev = popoutWindow.document.getElementById('btn-popout-prev');
    const popoutNext = popoutWindow.document.getElementById('btn-popout-next');
    if (popoutPrev) {
        popoutPrev.addEventListener('click', triggerRetreatToPreviousItem);
    }
    if (popoutNext) {
        popoutNext.addEventListener('click', triggerPrimaryAction);
    }
    popoutWindow.addEventListener('keydown', (e) => {
        if (isKeyboardControl(e.target, popoutWindow)) return;
        const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
        if (isSpace && !e.repeat) {
            e.preventDefault();
            triggerPrimaryAction();
            return;
        }
        if (e.key === 'Backspace' && !e.repeat) {
            e.preventDefault();
            triggerRetreatToPreviousItem();
        }
    });
    popoutWindow.addEventListener('resize', () => {
        popoutWindow.document.body.classList.add('resizing-popout');
        clearTimeout(popoutResizeTimeout);
        popoutResizeTimeout = setTimeout(() => {
            popoutTrackerSignature = null;
            syncPopoutWindow();
            popoutWindow?.requestAnimationFrame(() => {
                popoutWindow?.document.body.classList.remove('resizing-popout');
            });
        }, 140);
    });

    if (popoutWindow.document.readyState === 'complete') {
        syncPopoutWindow();
    } else {
        popoutWindow.addEventListener('load', syncPopoutWindow, { once: true });
    }
}

function syncPopoutAppearance(doc) {
    if (!doc?.documentElement) return;
    const settings = getState().settings || {};
    if (settings.darkMode) {
        doc.documentElement.setAttribute('data-theme', 'dark');
    } else {
        doc.documentElement.removeAttribute('data-theme');
    }
    doc.documentElement.setAttribute('data-density', settings.density || 'comfortable');
}

function syncPopoutWindow() {
    if (!popoutWindow || popoutWindow.closed) {
        cleanupPopoutWindow();
        return;
    }

    const doc = popoutWindow.document;
    if (doc.readyState !== 'complete') return;
    syncPopoutAppearance(doc);
    const trackerHost = doc.getElementById('popout-tracker');
    const overallHost = doc.getElementById('popout-overall');
    const currentHost = doc.getElementById('popout-current');
    const popoutPrev = doc.getElementById('btn-popout-prev');
    const popoutNext = doc.getElementById('btn-popout-next');
    const popoutControls = doc.querySelector('.popout-controls');
    const popoutPrimaryLabel = doc.getElementById('popout-primary-label');
    if (!trackerHost || !overallHost || !currentHost) return;

    const popoutView = doc.defaultView;
    const nextTrackerSignature = getTrackerStructureSignature();
    if (nextTrackerSignature !== popoutTrackerSignature) {
        const axisHtml = document.querySelector('.timeline-axis-wrapper')?.outerHTML || '';
        const trackHtml = document.querySelector('.timeline-track-wrapper')?.outerHTML || '';
        const progressHtml = document.querySelector('.progress-bar-container')?.outerHTML || '';
        const guideHtml = document.querySelector('.progress-guide-line')?.outerHTML || '';
        trackerHost.innerHTML = `${axisHtml}${trackHtml}${progressHtml}${guideHtml}`;
        popoutTrackerSignature = nextTrackerSignature;

        const popoutAxisWrapper = trackerHost.querySelector('.timeline-axis-wrapper');
        const popoutTrack = trackerHost.querySelector('.timeline-track');
        const popoutOverflow = trackerHost.querySelector('.overflow-labels-container');
        const blockData = getTimelineBlockData(calculateAdjustedIntervals().items);
        popoutView?.requestAnimationFrame(() => {
            layoutClonedAxis(popoutAxisWrapper);
            renderOverflowLabels(blockData, popoutTrack, popoutOverflow);
        });
    }
    syncPopoutDynamicTracker(trackerHost);

    const overallSource = statusDisplayEl?.querySelector('.status-display');
    const currentSource = currentStatusBox?.querySelector('.current-status-display');
    const nextOverallSignature = getSemanticDomSignature(overallSource);
    const nextCurrentSignature = getSemanticDomSignature(currentSource);
    const overallChanged = nextOverallSignature !== popoutOverallSignature;
    const currentChanged = nextCurrentSignature !== popoutCurrentSignature;

    if (overallChanged) {
        syncPopoutStatusPanel(overallSource, overallHost, [
            '.status-label',
            '.ticker-tape',
            '.status-unit',
            '.status-direction'
        ]);
        popoutOverallSignature = nextOverallSignature;
    }
    if (currentChanged) {
        syncPopoutStatusPanel(currentSource, currentHost, [
            '.current-status-label',
            '.current-status-tape',
            '.current-status-unit',
            '.current-status-line',
            '.current-status-next'
        ]);
        popoutCurrentSignature = nextCurrentSignature;
    }
    syncPopoutTicker(
        overallSource?.querySelector('.ticker-tape'),
        overallHost.querySelector('.ticker-tape')
    );
    syncPopoutTicker(
        currentSource?.querySelector('.current-status-tape'),
        currentHost.querySelector('.current-status-tape')
    );
    if (overallChanged || currentChanged) {
        popoutView?.requestAnimationFrame(() => {
            if (overallChanged) fitTickerToContainer(overallHost.querySelector('.ticker-tape'));
            if (currentChanged) fitTickerToContainer(currentHost.querySelector('.current-status-tape'));
        });
    }

    if (popoutPrev && prevItemButton) {
        popoutPrev.disabled = prevItemButton.disabled;
        popoutPrev.hidden = prevItemButton.hidden;
        popoutPrev.setAttribute('aria-label', prevItemButton.getAttribute('aria-label') || 'Previous agenda item');
        popoutPrev.setAttribute('aria-keyshortcuts', prevItemButton.getAttribute('aria-keyshortcuts') || 'Backspace');
    }
    if (popoutNext && nextItemButton) {
        popoutNext.disabled = nextItemButton.disabled;
        popoutNext.setAttribute('aria-label', nextItemButton.getAttribute('aria-label') || 'Meeting action');
        popoutNext.setAttribute('aria-keyshortcuts', nextItemButton.getAttribute('aria-keyshortcuts') || 'Space');
    }
    const phase = getTrackerPhase(getState().tracker);
    if (popoutControls) popoutControls.dataset.phase = phase;
    if (popoutNext) {
        popoutNext.dataset.shortLabel = {
            idle: 'Start',
            running: 'Next',
            paused: 'Resume',
            completed: 'Complete'
        }[phase];
    }
    if (popoutPrimaryLabel) {
        popoutPrimaryLabel.textContent = {
            idle: 'Start Meeting',
            running: 'Next Item →',
            paused: 'Resume Meeting',
            completed: 'Meeting Complete'
        }[phase];
    }
}

function cleanupPopoutWindow() {
    clearTimeout(popoutResizeTimeout);
    popoutResizeTimeout = null;
    popoutTrackerSignature = null;
    popoutOverallSignature = null;
    popoutCurrentSignature = null;
    if (popoutWindow && !popoutWindow.closed) {
        try {
            popoutWindow.close();
        } catch (err) {
            // Ignore cross-window close race.
        }
    }
    popoutWindow = null;
}

/**
 * Render the timeline track with blocks
 */
function getTimelineBlockData(items) {
    if (!items.length) return [];
    const totalMinutes = (
        items[items.length - 1].endTime.getTime() - items[0].startTime.getTime()
    ) / 60000;
    return items.map(item => {
        const duration = (item.endTime.getTime() - item.startTime.getTime()) / 60000;
        const widthPercent = totalMinutes > 0 ? (duration / totalMinutes) * 100 : 0;
        const startPercent = totalMinutes > 0
            ? ((item.startTime.getTime() - items[0].startTime.getTime()) / 60000 / totalMinutes) * 100
            : 0;
        return {
            name: item.name,
            themeNumber: item.themeNumber,
            themeColor: item.themeColor,
            customColor: item.customColor,
            startPercent,
            widthPercent,
            centerPercent: startPercent + widthPercent / 2
        };
    });
}

function clearOverflowLabels(labelsContainer = overflowLabelsContainer) {
    if (!labelsContainer) return;
    labelsContainer.replaceChildren();
    labelsContainer.classList.remove('has-overflow', 'compact-overflow');
}

function renderTimeline() {
    if (!timelineTrack) return;

    const adjusted = calculateAdjustedIntervals();
    const items = adjusted.items;
    lastLiveLayoutKey = getLiveLayoutKey(adjusted);
    if (items.length === 0) {
        timelineTrack.innerHTML = '<div class="timeline-block" style="left: 0; width: 100%; background: #ddd;">No items</div>';
        clearOverflowLabels();
        return;
    }

    // Calculate total duration
    const firstStart = items[0].startTime;
    const lastEnd = items[items.length - 1].endTime;
    const totalMinutes = getMinutesDiff(firstStart, lastEnd);

    if (totalMinutes <= 0) {
        timelineTrack.innerHTML = '';
        clearOverflowLabels();
        return;
    }

    // Find current item index
    const { currentItemIndex } = adjusted;

    // Build timeline blocks
    timelineTrack.innerHTML = '';

    const blockData = getTimelineBlockData(items);

    items.forEach((item, index) => {
        const widthPercent = blockData[index].widthPercent;

        const block = document.createElement('div');
        block.className = `timeline-block block-${item.themeNumber}`;
        block.style.left = `${blockData[index].startPercent}%`;
        block.style.width = `${widthPercent}%`;
        block.textContent = item.name;
        block.title = `${item.name} (${formatTime(item.startTime)} - ${formatTime(item.endTime)})`;
        block.dataset.index = index;
        block.dataset.id = item.id;
        block.draggable = true;
        applyItemColorStyles(block, item);
        block.style.setProperty('--active-glow-rgb', colorRgb(getItemColor(item, index)));

        if (getState().tracker.completedAt || index < currentItemIndex) {
            block.classList.add('completed');
        } else if (index === currentItemIndex) {
            block.classList.add('active');
        }

        block.addEventListener('dragstart', (e) => {
            if (trackerResizeState) {
                e.preventDefault();
                return;
            }
            block.classList.add('dragging');
            document.body.classList.add('dragging-item');
            setGlobalDragCursor(true);
            document.body.dataset.dragSource = 'agenda';
            document.body.dataset.dragItemId = item.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.id);
            e.dataTransfer.setData('application/x-agenda-source', 'agenda');
            setTimeout(() => {
                block.style.opacity = '0.45';
            }, 0);
        });

        block.addEventListener('dragend', () => {
            block.classList.remove('dragging');
            block.style.opacity = '';
            document.body.classList.remove('dragging-item');
            setGlobalDragCursor(false);
            delete document.body.dataset.dragSource;
            delete document.body.dataset.dragItemId;
            clearTrackerDropIndicators();
        });

        block.addEventListener('wheel', (e) => {
            e.preventDefault();
            adjustItemDurationByDelta(item.id, e.deltaY < 0 ? 1 : -1);
        }, { passive: false });

        block.addEventListener('mousemove', (e) => {
            const rect = block.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const edgeThreshold = Math.min(10, rect.width / 3);
            const onLeft = x <= edgeThreshold && index > 0;
            const onRight = x >= rect.width - edgeThreshold;
            if (onLeft || onRight) {
                block.style.cursor = 'ew-resize';
            } else {
                block.style.cursor = 'grab';
            }
        });

        block.addEventListener('mouseleave', () => {
            if (!block.classList.contains('dragging') && !block.classList.contains('is-resizing')) {
                block.style.cursor = 'grab';
            }
        });

        block.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const rect = block.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const edgeThreshold = Math.min(10, rect.width / 3);
            if (x <= edgeThreshold && index > 0) {
                e.preventDefault();
                beginTrackerResize(block, index, 'left', e);
                return;
            }
            if (x >= rect.width - edgeThreshold) {
                e.preventDefault();
                beginTrackerResize(block, index, 'right', e);
            }
        });

        timelineTrack.appendChild(block);
    });

    renderOverflowLabels(blockData);
}

/**
 * Render overflow labels with bezier curves for blocks that are too small
 * @param {Array} blockData - Data about each block's position
 */
function renderOverflowLabels(
    blockData,
    track = timelineTrack,
    labelsContainer = overflowLabelsContainer
) {
    if (!labelsContainer || !track) return;
    const ownerDocument = track.ownerDocument;
    const ownerWindow = ownerDocument.defaultView || window;

    const blocks = track.querySelectorAll('.timeline-block');
    const overflowItems = [];

    blocks.forEach((block, index) => {
        block.classList.remove('label-overflow');
        const blockStyle = ownerWindow.getComputedStyle(block);
        const font = `${blockStyle.fontWeight} ${blockStyle.fontSize} ${blockStyle.fontFamily}`;
        const textWidth = getTextWidth(block.textContent, font);
        const availableWidth = block.clientWidth - 8;

        if (textWidth > availableWidth) {
            block.classList.add('label-overflow');
            overflowItems.push({
                ...blockData[index],
                index: index,
                block,
                completed: block.classList.contains('completed')
            });
        }
    });

    clearOverflowLabels(labelsContainer);

    if (overflowItems.length === 0) {
        return;
    }

    labelsContainer.classList.add('has-overflow');

    const svg = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('overflow-curves-svg');
    labelsContainer.appendChild(svg);

    const labels = overflowItems.map(item => {
        const label = ownerDocument.createElement('div');
        label.className = `overflow-label theme-text-${item.themeNumber}${item.completed ? ' completed' : ''}`;
        applyItemColorStyles(label, item);
        label.textContent = item.name;
        labelsContainer.appendChild(label);
        return label;
    });

    const containerRect = labelsContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    if (containerWidth <= 0) return;

    const desiredCenters = overflowItems.map(item => (item.centerPercent / 100) * containerWidth);
    const widths = labels.map(label => label.getBoundingClientRect().width);
    const requiredWidth = widths.reduce((sum, width) => sum + width, 0) +
        Math.max(0, labels.length - 1) * 6;
    const useCompactLegend = requiredWidth > containerWidth;
    labelsContainer.classList.toggle('compact-overflow', useCompactLegend);
    if (useCompactLegend) {
        svg.remove();
        return;
    }

    const fittedCenters = fitLabelCenters(desiredCenters, widths, 6, [0, containerWidth]);
    labels.forEach((label, i) => {
        label.style.left = `${fittedCenters[i]}px`;
    });

    const svgHeight = labelsContainer.getBoundingClientRect().height;
    svg.setAttribute('width', containerWidth);
    svg.setAttribute('height', svgHeight);
    svg.setAttribute('viewBox', `0 0 ${containerWidth} ${svgHeight}`);

    overflowItems.forEach((item, i) => {
        const blockRect = item.block.getBoundingClientRect();
        const labelRect = labels[i].getBoundingClientRect();
        const labelTop = labelRect.top - containerRect.top;
        const startX = blockRect.left + blockRect.width / 2 - containerRect.left;
        const startY = blockRect.bottom - containerRect.top;
        const endX = fittedCenters[i];
        const endY = Math.max(0, labelTop - 2);
        const darkMode = ownerDocument.documentElement.dataset.theme === 'dark';
        const strokeColor = getItemAccentColor(item, item.index, darkMode);
        const path = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', getVerticalConnectorPath(startX, startY, endX, endY));
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        if (item.completed) path.setAttribute('opacity', '0.35');
        svg.appendChild(path);
    });
}

/**
 * Measure text width
 * @param {string} text - Text to measure
 * @param {string} font - CSS font string
 * @returns {number} Width in pixels
 */
function getTextWidth(text, font) {
    const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    context.font = font;
    return context.measureText(text).width;
}

function getVerticalConnectorPath(startX, startY, endX, endY) {
    const middleY = startY + ((endY - startY) / 2);
    return `M ${startX} ${startY} C ${startX} ${middleY} ${endX} ${middleY} ${endX} ${endY}`;
}

function fitLabelCenters(desiredCenters, widths, gap, bounds) {
    if (desiredCenters.length === 0) return [];
    const [minimum, maximum] = bounds;
    const order = desiredCenters.map((value, index) => ({ value, index }))
        .sort((a, b) => (a.value - b.value) || (a.index - b.index));
    const centers = new Array(desiredCenters.length);
    let cursor = minimum;
    order.forEach(({ index }) => {
        const halfWidth = widths[index] / 2;
        centers[index] = clamp(desiredCenters[index], cursor + halfWidth, maximum - halfWidth);
        cursor = centers[index] + halfWidth + gap;
    });
    cursor = maximum;
    for (let i = order.length - 1; i >= 0; i -= 1) {
        const index = order[i].index;
        const halfWidth = widths[index] / 2;
        centers[index] = Math.min(centers[index], cursor - halfWidth);
        cursor = centers[index] - halfWidth - gap;
    }
    return centers;
}

function getFollowingItemColor(items, boundaryTime) {
    if (!items || items.length === 0) return '#222';
    const boundaryMs = boundaryTime.getTime();
    const toleranceMs = 30000;
    const darkMode = document.documentElement.dataset.theme === 'dark';

    if (boundaryMs <= items[0].startTime.getTime() + toleranceMs) {
        return getItemAccentColor(items[0], 0, darkMode);
    }

    for (let i = 0; i < items.length - 1; i += 1) {
        const boundary = items[i].endTime.getTime();
        if (Math.abs(boundaryMs - boundary) <= toleranceMs) {
            return getItemAccentColor(items[i + 1], i + 1, darkMode);
        }
        if (boundaryMs < boundary) {
            return getItemAccentColor(items[i], i, darkMode);
        }
    }

    return getItemAccentColor(items[items.length - 1], items.length - 1, darkMode);
}

function getMinorLabelInterval(totalMinutes) {
    if (totalMinutes <= 120) return 30;
    if (totalMinutes <= 360) return 60;
    if (totalMinutes <= 720) return 120;
    return 180;
}

function layoutAxisLabels(axisWrapper, axis, labelEntries) {
    const ownerDocument = axisWrapper.ownerDocument;
    const ownerWindow = ownerDocument.defaultView || window;
    const width = axis.getBoundingClientRect().width;
    if (labelEntries.length === 0 || width <= 0) return;

    labelEntries.forEach(entry => {
        entry.label.hidden = false;
        entry.tickElement.classList.remove('has-connector');
    });
    const allWidths = labelEntries.map(entry => entry.label.getBoundingClientRect().width);
    const widestLabel = Math.max(...allWidths);
    const capacity = Math.max(2, Math.floor((width + 8) / (widestLabel + 8)));
    let visibleEntries = labelEntries;
    if (capacity < labelEntries.length) {
        const visibleIndexes = new Set(
            Array.from({ length: capacity }, (_, index) => (
                Math.round((index * (labelEntries.length - 1)) / (capacity - 1))
            ))
        );
        labelEntries.forEach((entry, index) => {
            entry.label.hidden = !visibleIndexes.has(index);
        });
        visibleEntries = labelEntries.filter((_, index) => visibleIndexes.has(index));
    }

    const desiredCenters = visibleEntries.map(entry => (entry.desiredCenter / 100) * width);
    const labelWidths = visibleEntries.map(entry => entry.label.getBoundingClientRect().width);
    const boundedCenters = desiredCenters.map((center, index) => {
        const halfWidth = labelWidths[index] / 2;
        return clamp(center, halfWidth, width - halfWidth);
    });
    const fittedCenters = fitLabelCenters(boundedCenters, labelWidths, 8, [0, width]);
    const labelHeights = visibleEntries.map(entry => entry.label.getBoundingClientRect().height || 12);
    const tickHeights = visibleEntries.map(entry => {
        const renderedHeight = parseFloat(ownerWindow.getComputedStyle(entry.tickElement, '::before').height);
        return Number.isFinite(renderedHeight) ? renderedHeight : entry.tickHeight;
    });
    const axisLine = axisWrapper.querySelector('.timeline-axis-line');
    const axisY = axisLine ? axisLine.offsetTop : axis.offsetTop;
    const tickTop = axisY - Math.max(...tickHeights);
    const baseTop = Math.max(0, tickTop - Math.max(...labelHeights, 12) - 4);
    const liftedTop = Math.max(0, baseTop - 14);

    visibleEntries.forEach((entry, index) => {
        entry.displaced = Math.abs(fittedCenters[index] - desiredCenters[index]) > 2;
        entry.tickElement.classList.toggle('has-connector', entry.displaced);
        entry.label.style.left = `${fittedCenters[index]}px`;
        entry.label.style.top = entry.displaced ? `${liftedTop}px` : `${baseTop}px`;
        entry.label.style.color = entry.isMajor ? entry.followColor : '#222';
    });

    axisWrapper.querySelectorAll('.axis-label-curves').forEach(node => node.remove());
    const displaced = visibleEntries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.displaced);
    if (displaced.length === 0) return;

    const wrapperRect = axisWrapper.getBoundingClientRect();
    const curveSvg = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const wrapperHeight = axisWrapper.getBoundingClientRect().height;
    curveSvg.classList.add('axis-label-curves');
    curveSvg.setAttribute('width', width);
    curveSvg.setAttribute('height', wrapperHeight);
    curveSvg.setAttribute('viewBox', `0 0 ${width} ${wrapperHeight}`);

    displaced.forEach(({ entry, index }) => {
        const labelBox = entry.label.getBoundingClientRect();
        const endX = fittedCenters[index];
        const endY = labelBox.top - wrapperRect.top + labelBox.height + 0.5;
        const path = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', getVerticalConnectorPath(
            desiredCenters[index],
            axisY + 0.5,
            endX,
            endY
        ));
        path.setAttribute('stroke', entry.isMajor ? entry.followColor : '#444');
        path.setAttribute('stroke-width', entry.isMajor ? '1.4' : '1');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        curveSvg.appendChild(path);
    });
    axisWrapper.appendChild(curveSvg);
}

function layoutClonedAxis(axisWrapper) {
    const axis = axisWrapper?.querySelector('.axis-ticks');
    if (!axis) return;

    axisWrapper.querySelectorAll('.axis-label-curves').forEach(node => node.remove());
    const ticksByOffset = new Map(
        [...axis.querySelectorAll('.axis-tick')].map(tick => [tick.dataset.offset, tick])
    );
    const labelEntries = [...axisWrapper.querySelectorAll('.axis-tick-label')]
        .map(label => {
            const tickElement = ticksByOffset.get(label.dataset.tickOffset);
            if (!tickElement) return null;
            return {
                label,
                tickElement,
                isMajor: label.classList.contains('axis-label-major'),
                desiredCenter: Number(label.dataset.desiredCenter),
                followColor: label.dataset.followColor || '#222',
                tickHeight: Number(label.dataset.tickHeight) || 4
            };
        })
        .filter(Boolean);

    layoutAxisLabels(axisWrapper, axis, labelEntries);
}

/**
 * Render axis tick marks with major/minor ticks
 */
function renderAxisTicks() {
    if (!timelineAxis) return;
    const axisWrapper = timelineAxis.parentElement;
    if (!axisWrapper) return;

    timelineAxis.innerHTML = '';
    axisWrapper.querySelectorAll('.axis-label-layer, .axis-label-curves').forEach(node => node.remove());

    const items = calculateAdjustedIntervals().items;
    if (items.length === 0) {
        return;
    }

    const firstStart = items[0].startTime;
    const lastEnd = items[items.length - 1].endTime;
    const totalMinutes = getMinutesDiff(firstStart, lastEnd);

    if (totalMinutes <= 0) {
        return;
    }

    const ticksByOffset = new Map();

    const addTick = (time, isMajor) => {
        const offset = getMinutesDiff(firstStart, time);
        if (offset < 0 || offset > totalMinutes) return;
        const existing = ticksByOffset.get(offset);
        if (!existing || (isMajor && !existing.isMajor)) {
            ticksByOffset.set(offset, { time: new Date(time), isMajor });
        }
    };

    // Major ticks at every item boundary
    addTick(firstStart, true);
    items.forEach(item => {
        addTick(item.endTime, true);
    });

    // Minor ticks every 5 minutes
    for (let minute = 0; minute <= totalMinutes; minute += 5) {
        const time = new Date(firstStart.getTime() + minute * 60000);
        addTick(time, false);
    }

    const ticks = [...ticksByOffset.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([offset, tick]) => ({
            offset,
            time: tick.time,
            position: clamp((offset / totalMinutes) * 100, 0, 100),
            isMajor: tick.isMajor
        }));

    // Render ticks and labels
    const labelLayer = document.createElement('div');
    labelLayer.className = 'axis-label-layer';
    axisWrapper.appendChild(labelLayer);

    const labelEntries = [];
    const minorLabelInterval = getMinorLabelInterval(totalMinutes);

    ticks.forEach(tick => {
        const tickEl = document.createElement('div');
        tickEl.className = `axis-tick ${tick.isMajor ? 'major' : 'minor'}`;
        tickEl.style.left = `${tick.position}%`;
        tickEl.dataset.offset = `${tick.offset}`;
        timelineAxis.appendChild(tickEl);

        const shouldRenderMinorLabel = !tick.isMajor &&
            tick.offset > 0 &&
            tick.offset < totalMinutes &&
            tick.offset % minorLabelInterval === 0;

        if (tick.isMajor || shouldRenderMinorLabel) {
            const label = document.createElement('span');
            label.className = `axis-tick-label ${tick.isMajor ? 'axis-label-major' : 'axis-label-minor'}`;
            label.textContent = formatTime(tick.time);
            const followColor = getFollowingItemColor(items, tick.time);
            label.dataset.tickOffset = `${tick.offset}`;
            label.dataset.desiredCenter = `${tick.position}`;
            label.dataset.followColor = followColor;
            label.dataset.tickHeight = tick.isMajor ? '8' : '4';
            labelLayer.appendChild(label);

            labelEntries.push({
                label,
                tickElement: tickEl,
                isMajor: tick.isMajor,
                desiredCenter: tick.position,
                followColor,
                tickHeight: tick.isMajor ? 8 : 4
            });
        }
    });

    layoutAxisLabels(axisWrapper, timelineAxis, labelEntries);
}

/**
 * Update the current time marker position
 */
function updateCurrentTimeMarker() {
    if (!currentTimeMarker) return;

    const items = calculateAdjustedIntervals().items;
    if (items.length === 0) {
        currentTimeMarker.style.display = 'none';
        return;
    }

    const state = getState();
    const now = getTrackerDisplayTime();
    const firstStart = items[0].startTime;
    const lastEnd = items[items.length - 1].endTime;
    const totalMinutes = getMinutesDiff(firstStart, lastEnd);

    // Calculate position as percentage
    const elapsedMinutes = (now.getTime() - firstStart.getTime()) / 60000;
    const position = clamp((elapsedMinutes / totalMinutes) * 100, 0, 100);

    currentTimeMarker.style.display = 'block';
    currentTimeMarker.style.left = `${position}%`;

    // Show/hide based on whether we're within the meeting time
    if (now < firstStart || now > lastEnd) {
        currentTimeMarker.style.opacity = '0.3';
    } else {
        currentTimeMarker.style.opacity = '1';
    }
}

/**
 * Update the status display with animated ticker tape
 */
function updateStatusDisplay() {
    if (!statusDisplayEl || !tickerTape) return;

    const { status, difference } = calculateAdjustedIntervals();
    const phase = getTrackerPhase(getState().tracker);
    const statusContainer = statusDisplayEl.querySelector('.status-display');
    const labelEl = statusDisplayEl.querySelector('.status-label');
    const directionEl = statusDisplayEl.querySelector('.status-direction');

    if (!statusContainer || !directionEl) return;

    // Remove old status classes
    statusContainer.classList.remove('not-started', 'on-time', 'behind', 'ahead');

    if (phase === 'idle') {
        statusContainer.classList.add('not-started');
        if (labelEl) labelEl.textContent = 'MEETING';
        tickerTape.innerHTML = '<span class="ticker-on-time">NOT STARTED</span>';
        directionEl.textContent = '';
        if (statusUnitEl) statusUnitEl.textContent = '';
        statusContainer.setAttribute('aria-label', 'Agenda status: meeting not started');
        fitTickerToContainer(tickerTape);
        syncPopoutWindow();
        return;
    }

    statusContainer.classList.add(status);
    if (labelEl) labelEl.textContent = 'AGENDA IS';

    if (status === 'on-time' || difference === 0) {
        // Show "ON TIME" text
        tickerTape.innerHTML = '<span class="ticker-on-time">ON TIME</span>';
        directionEl.textContent = '';
        if (statusUnitEl) {
            statusUnitEl.textContent = '';
        }
        statusContainer.setAttribute('aria-label', 'Agenda status: on time');
    } else {
        const scale = getTickerScale(difference);
        renderTickerTape(scale.value, status, scale.step, scale.precision);
        const direction = status === 'behind' ? 'BEHIND' : 'AHEAD';
        directionEl.textContent = direction;
        if (statusUnitEl) {
            statusUnitEl.textContent = scale.unit;
        }
        const amount = scale.precision > 0 ? scale.value.toFixed(scale.precision) : Math.round(scale.value);
        statusContainer.setAttribute(
            'aria-label',
            `Agenda status: ${amount} ${scale.unit.toLowerCase()} ${direction.toLowerCase()}`
        );
    }

    fitTickerToContainer(tickerTape);

    // Animate if difference changed
    if (difference !== lastDifference || status !== lastStatus) {
        animateTickerTransition(tickerTape, lastDifference, difference);
        lastDifference = difference;
        lastStatus = status;
    }

    syncPopoutWindow();
}

/**
 * Render the ticker tape with numbers
 * @param {number} centerValue - The center (current) value
 * @param {string} status - 'behind' or 'ahead'
 */
function renderTickerTape(centerValue, status, step = 1, precision = 0) {
    renderMinuteTicker(tickerTape, centerValue, { step, precision });
}

/**
 * Animate ticker transition
 * @param {number} from - Previous value
 * @param {number} to - New value
 */
function animateTickerTransition(tapeEl, from, to) {
    if (!tapeEl) return;

    // Simple slide animation
    const direction = to > from ? 1 : -1;
    const container = tapeEl.parentElement;
    const maxShift = container ? Math.max(4, Math.min(14, container.clientWidth * 0.04)) : 8;
    setTickerTransform(tapeEl, direction * maxShift);

    setTimeout(() => {
        setTickerTransform(tapeEl, 0);
    }, 50);
}

/**
 * Render a numeric ticker for minutes
 * @param {HTMLElement} tapeEl - Ticker tape element
 * @param {number} centerValue - Center value
 */
function renderMinuteTicker(tapeEl, centerValue, options = {}) {
    if (!tapeEl) return;
    const step = Number.isFinite(options.step) ? options.step : 1;
    const precision = Number.isFinite(options.precision) ? options.precision : 0;

    const numbers = [];
    for (let i = -3; i <= 3; i++) {
        const value = centerValue + (i * step);
        if (value >= 0) {
            numbers.push({ value, offset: i });
        }
    }

    tapeEl.innerHTML = numbers.map(({ value, offset }) => {
        let className = 'ticker-number';
        if (offset === 0) {
            className += ' center';
        } else {
            className += ` adjacent-${Math.abs(offset)}`;
        }
        const display = precision > 0 ? value.toFixed(precision) : Math.round(value).toString();
        return `<span class="${className}">${display}</span>`;
    }).join('');
}

function interpolateTickerStyle(distance) {
    const scaleStops = [1, 0.625, 0.393, 0.286, 0.2];
    const opacityStops = [1, 0.5, 0.25, 0.1, 0];
    const bounded = clamp(Math.abs(distance), 0, scaleStops.length - 1);
    const lower = Math.floor(bounded);
    const upper = Math.min(scaleStops.length - 1, lower + 1);
    const fraction = bounded - lower;
    return {
        scale: scaleStops[lower] + (scaleStops[upper] - scaleStops[lower]) * fraction,
        opacity: opacityStops[lower] + (opacityStops[upper] - opacityStops[lower]) * fraction
    };
}

function renderContinuousTicker(tapeEl, centerValue, options = {}) {
    if (!tapeEl || !Number.isFinite(centerValue)) return;
    tapeEl.classList.add('continuous-ticker');

    const step = Number.isFinite(options.step) && options.step > 0 ? options.step : 1;
    const precision = Number.isFinite(options.precision) ? options.precision : 0;
    const scaleKey = `${step}:${precision}`;
    const scaleChanged = tapeEl.dataset.tickerScale !== scaleKey;
    if (scaleChanged) tapeEl.classList.add('ticker-scale-changing');
    const containerWidth = tapeEl.parentElement?.clientWidth || 320;
    const spacing = precision > 0
        ? clamp(containerWidth / 5.2, 62, 86)
        : clamp(containerWidth / 6.4, 34, 62);
    const centerIndex = centerValue / step;
    const firstIndex = Math.max(0, Math.floor(centerIndex) - 4);
    const lastIndex = Math.max(8, Math.ceil(centerIndex) + 4);
    const desiredIndexes = new Set();
    const existing = new Map(
        [...tapeEl.querySelectorAll('.ticker-number[data-ticker-index]')]
            .map(number => [Number(number.dataset.tickerIndex), number])
    );

    for (let index = firstIndex; index <= lastIndex; index += 1) {
        desiredIndexes.add(index);
        let number = existing.get(index);
        if (!number) {
            number = tapeEl.ownerDocument.createElement('span');
            number.className = 'ticker-number';
            number.dataset.tickerIndex = `${index}`;
            tapeEl.appendChild(number);
        }

        const value = index * step;
        number.textContent = precision > 0 ? value.toFixed(precision) : `${Math.round(value)}`;
        const distance = index - centerIndex;
        const style = interpolateTickerStyle(distance);
        number.style.setProperty('--ticker-offset', `${distance * spacing}px`);
        number.style.setProperty('--ticker-scale', `${style.scale}`);
        number.style.opacity = `${style.opacity}`;
    }

    existing.forEach((number, index) => {
        if (!desiredIndexes.has(index)) number.remove();
    });

    tapeEl.dataset.tickerScale = scaleKey;
    if (scaleChanged) {
        tapeEl.ownerDocument.defaultView?.requestAnimationFrame(() => {
            tapeEl.classList.remove('ticker-scale-changing');
        });
    }
}

function getCurrentTickerScale(minutesValue) {
    const absMinutes = Math.max(0, minutesValue);
    if (absMinutes >= 90) {
        return {
            value: absMinutes / 60,
            unit: 'HOURS',
            step: 0.1,
            precision: 1
        };
    }
    return {
        value: absMinutes,
        unit: Math.round(absMinutes) === 1 ? 'MINUTE' : 'MINUTES',
        step: 1,
        precision: 0
    };
}

function getTickerScale(minutesValue) {
    const absMinutes = Math.max(0, minutesValue);
    if (absMinutes >= 90) {
        return {
            value: absMinutes / 60,
            unit: 'HOURS',
            step: 0.25,
            precision: 1
        };
    }
    if (absMinutes < 2) {
        return {
            value: absMinutes,
            unit: Math.abs(absMinutes - 1) < 0.05 ? 'MINUTE' : 'MINUTES',
            step: 0.5,
            precision: 1
        };
    }
    return {
        value: absMinutes,
        unit: 'MINUTES',
        step: 1,
        precision: absMinutes < 10 ? 1 : 0
    };
}

/**
 * Update the current item panel
 */
function updateCurrentItemPanel() {
    if (!currentItemPanel) return;

    const items = calculateIntervals();
    const { currentItemIndex } = calculateAdjustedIntervals();

    const nameEl = currentItemPanel.querySelector('.current-item-name');
    const leadEl = currentItemPanel.querySelector('.current-item-lead .value');
    const notesEl = currentItemPanel.querySelector('.notes-area');

    if (!nameEl || !leadEl) return;

    // Get current item
    let currentItem = null;
    if (currentItemIndex >= 0 && currentItemIndex < items.length) {
        currentItem = items[currentItemIndex];
    } else if (items.length > 0 && !getState().tracker.completedAt) {
        // Before meeting starts, show first item
        currentItem = items[0];
    }

    [...currentItemPanel.classList]
        .filter(className => /^theme-\d+$/.test(className))
        .forEach(className => currentItemPanel.classList.remove(className));
    if (currentItem) currentItemPanel.classList.add(`theme-${currentItem.themeNumber}`);
    applyItemColorStyles(currentItemPanel, currentItem);

    if (currentItem) {
        nameEl.textContent = currentItem.name;
        applyThemeText(nameEl, currentItem);
        leadEl.textContent = `{ ${currentItem.lead || 'TBD'} }`;

        if (notesEl) {
            // Only update if not focused (to not interrupt typing)
            if (document.activeElement !== notesEl) {
                notesEl.value = currentItem.notes || '';
            }
            notesEl.dataset.itemId = currentItem.id;
        }

        if (notesPreviewEl) {
            notesPreviewEl.innerHTML = renderMarkdownToHtml(currentItem.notes || '');
        }
    } else {
        nameEl.textContent = 'No Active Item';
        applyThemeText(nameEl, null);
        leadEl.textContent = '{ - }';
        if (notesPreviewEl) {
            notesPreviewEl.innerHTML = '';
        }
    }
}

function renderCurrentStatusItemLine(statusLine, prefix, itemName) {
    statusLine.replaceChildren(document.createTextNode(`${prefix} `));

    const item = document.createElement('span');
    item.className = 'current-status-item';
    item.id = 'current-status-item';
    item.textContent = itemName || '-';
    statusLine.appendChild(item);
    currentStatusItemEl = item;
}

function renderCurrentStatusWord(word) {
    const wordEl = document.createElement('span');
    wordEl.className = 'ticker-on-time';
    wordEl.textContent = word;
    currentStatusTape.classList.remove('continuous-ticker');
    currentStatusTape.replaceChildren(wordEl);
    fitTickerToContainer(currentStatusTape);
}

function formatStatusClock(date) {
    return new Intl.DateTimeFormat([], {
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

/**
 * Update the current status panel
 */
function updateCurrentStatusPanel() {
    if (!currentStatusBox || !currentStatusTape || !currentStatusNextLineEl) return;

    const items = calculateIntervals();
    if (items.length === 0) {
        if (currentStatusLabelEl) currentStatusLabelEl.textContent = 'NO AGENDA ITEMS';
        if (currentStatusUnitEl) currentStatusUnitEl.textContent = '';
        renderCurrentStatusWord('—');
        const statusLine = currentStatusBox.querySelector('.current-status-line');
        if (statusLine) statusLine.textContent = '';
        currentStatusItemEl = null;
        currentStatusNextLineEl.textContent = '';
        currentStatusNextItemEl = null;
        applyThemeText(currentStatusTape, null);
        currentStatusBox.querySelector('.current-status-display')
            ?.setAttribute('aria-label', 'Current status: no agenda items');
        return;
    }

    const now = getTrackerDisplayTime();
    const state = getState();
    const trackerState = state.tracker || {};
    const statusLine = currentStatusBox.querySelector('.current-status-line');

    if (!trackerState.startedAt) {
        const scheduledStart = items[0].startTime;
        const minutesUntilStart = (scheduledStart.getTime() - now.getTime()) / 60000;
        const atStart = Math.abs(minutesUntilStart) < 0.05;
        const direction = minutesUntilStart > 0 ? 'until' : 'past';

        if (atStart) {
            if (currentStatusLabelEl) currentStatusLabelEl.textContent = 'MEETING STARTS';
            if (currentStatusUnitEl) currentStatusUnitEl.textContent = '';
            renderCurrentStatusWord('NOW');
        } else {
            const scale = getTickerScale(Math.abs(minutesUntilStart));
            if (currentStatusLabelEl) {
                currentStatusLabelEl.textContent = direction === 'until'
                    ? 'MEETING STARTS IN'
                    : 'SCHEDULED START WAS';
            }
            if (currentStatusUnitEl) {
                currentStatusUnitEl.textContent = direction === 'until'
                    ? scale.unit
                    : `${scale.unit} AGO`;
            }
            renderContinuousTicker(currentStatusTape, scale.value, scale);
            fitTickerToContainer(currentStatusTape);
        }

        if (statusLine) statusLine.textContent = `SCHEDULED FOR ${formatStatusClock(scheduledStart)}`;
        currentStatusItemEl = null;
        currentStatusNextLineEl.innerHTML = '(first item: <span class="current-status-next-item" id="current-status-next-item"></span>)';
        currentStatusNextItemEl = currentStatusNextLineEl.querySelector('#current-status-next-item');
        currentStatusNextItemEl.textContent = items[0].name;
        applyThemeText(currentStatusNextItemEl, items[0]);
        applyThemeText(currentStatusTape, null);
        const display = currentStatusBox.querySelector('.current-status-display');
        if (atStart) {
            display?.setAttribute('aria-label', 'Current status: meeting starts now');
        } else {
            const rounded = Math.max(0, Math.round(Math.abs(minutesUntilStart)));
            display?.setAttribute(
                'aria-label',
                direction === 'until'
                    ? `Current status: meeting starts in ${rounded} minutes`
                    : `Current status: scheduled start was ${rounded} minutes ago`
            );
        }
        syncPopoutWindow();
        return;
    }

    const adjusted = calculateAdjustedIntervals(now);
    if (trackerState.completedAt) {
        if (currentStatusLabelEl) currentStatusLabelEl.textContent = 'MEETING COMPLETE';
        if (currentStatusUnitEl) currentStatusUnitEl.textContent = '';
        renderCurrentStatusWord('DONE');
        if (statusLine) statusLine.textContent = '';
        currentStatusItemEl = null;
        currentStatusNextLineEl.textContent = '(and then you are done!)';
        currentStatusNextItemEl = null;
        applyThemeText(currentStatusTape, null);
        currentStatusBox.querySelector('.current-status-display')
            ?.setAttribute('aria-label', 'Current status: meeting complete');
        syncPopoutWindow();
        return;
    }
    let currentIndex = adjusted.currentItemIndex;

    if (currentIndex < 0) {
        currentIndex = 0;
    }

    const currentItem = adjusted.items[currentIndex] || items[currentIndex];
    const nextItem = items[currentIndex + 1];
    const remaining = adjusted.currentRemaining ?? 0;
    const overrun = Math.max(0, -(remaining));
    const plannedDuration = parseDuration(currentItem?.duration || '1m');
    const elapsedMode = state.settings.timerMode === 'elapsed';
    const elapsed = Math.max(0, plannedDuration - remaining);
    const displayValue = elapsedMode ? elapsed : (remaining >= 0 ? remaining : overrun);
    const scale = getCurrentTickerScale(displayValue);

    renderContinuousTicker(currentStatusTape, scale.value, scale);
    fitTickerToContainer(currentStatusTape);

    if (currentStatusLabelEl) {
        const prefix = trackerState.isRunning ? '' : 'PAUSED · ';
        currentStatusLabelEl.textContent = prefix + (elapsedMode
            ? 'TIME USED ON CURRENT ITEM'
            : (remaining >= 0 ? 'TIME LEFT IN CURRENT ITEM' : 'CURRENT ITEM IS OVER BY'));
    }
    if (currentStatusUnitEl) {
        currentStatusUnitEl.textContent = scale.unit;
    }

    if (statusLine) {
        renderCurrentStatusItemLine(statusLine, 'ITEM:', currentItem?.name);
    }

    if (nextItem) {
        if (!currentStatusNextItemEl) {
            currentStatusNextLineEl.innerHTML = '(next item: <span class="current-status-next-item" id="current-status-next-item"></span>)';
            currentStatusNextItemEl = currentStatusNextLineEl.querySelector('#current-status-next-item');
        }
        if (currentStatusNextItemEl) {
            currentStatusNextItemEl.textContent = nextItem.name;
        }
    } else {
        currentStatusNextLineEl.textContent = '(and then you are done!)';
        currentStatusNextItemEl = null;
    }

    if (currentStatusItemEl) {
        applyThemeText(currentStatusItemEl, currentItem);
    }
    if (currentStatusNextItemEl) {
        applyThemeText(currentStatusNextItemEl, nextItem);
    }
    applyThemeText(currentStatusTape, currentItem);
    const stateWord = trackerState.isRunning ? '' : 'paused; ';
    const amount = scale.precision > 0 ? scale.value.toFixed(scale.precision) : Math.round(scale.value);
    const timeMeaning = elapsedMode
        ? `${amount} ${scale.unit.toLowerCase()} used`
        : (remaining >= 0
            ? `${amount} ${scale.unit.toLowerCase()} left`
            : `${amount} ${scale.unit.toLowerCase()} over`);
    currentStatusBox.querySelector('.current-status-display')?.setAttribute(
        'aria-label',
        `Current status: ${stateWord}${timeMeaning} on ${currentItem?.name || 'current item'}`
    );

    syncPopoutWindow();
}

/**
 * Update the status clock (minute resolution)
 */
function updateStatusClock() {
    if (!statusClockEl) return;
    const now = new Date();
    statusClockEl.textContent = new Intl.DateTimeFormat([], {
        hour: 'numeric',
        minute: '2-digit'
    }).format(now);
}

/**
 * Apply a theme text class to an element
 * @param {HTMLElement} element - Target element
 * @param {Object|null} item - Agenda item, including its legacy or custom color
 */
function applyThemeText(element, item) {
    if (!element) return;
    element.classList.remove(...Array.from({ length: 8 }, (_, index) => `theme-text-${index + 1}`));
    element.classList.remove('item-color-text');
    clearItemColorStyles(element);
    if (!item) return;
    if (applyItemColorStyles(element, item)) {
        element.classList.add('item-color-text');
    } else if (item.themeNumber) {
        element.classList.add(`theme-text-${item.themeNumber}`);
    }
}

function positionProgressGuideLine({
    guide,
    container,
    track,
    progressContainer,
    marker,
    progressPercent,
    visible
}) {
    if (!guide || !container || !track || !progressContainer || !visible) {
        if (guide) guide.style.display = 'none';
        return;
    }

    const containerRect = container.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const progressRect = progressContainer.getBoundingClientRect();
    const originLeft = containerRect.left + container.clientLeft;
    const originTop = containerRect.top + container.clientTop;
    const clamped = clamp(progressPercent, 0, 100);
    const markerRect = marker?.getBoundingClientRect();
    const markerVisible = marker && marker.style.display !== 'none' && markerRect?.height > 0;
    const markerX = markerVisible
        ? (markerRect.left + markerRect.width / 2) - originLeft
        : NaN;
    const x = Number.isFinite(markerX)
        ? markerX
        : (trackRect.left - originLeft + (clamped / 100) * trackRect.width);
    const axisLineRect = container.querySelector('.timeline-axis-line')?.getBoundingClientRect();
    const top = markerVisible
        ? markerRect.bottom - originTop
        : (axisLineRect?.top ?? originTop) - originTop;
    const bottom = progressRect.top - originTop;
    const height = bottom - top;

    if (!Number.isFinite(x) || height <= 0) {
        guide.style.display = 'none';
        return;
    }

    guide.style.display = 'block';
    guide.style.left = `${x}px`;
    guide.style.top = `${top}px`;
    guide.style.height = `${height}px`;

    const renderedGuideRect = guide.getBoundingClientRect();
    const desiredCenterX = Number.isFinite(markerX)
        ? markerRect.left + markerRect.width / 2
        : trackRect.left + (clamped / 100) * trackRect.width;
    const horizontalCorrection = desiredCenterX - (
        renderedGuideRect.left + renderedGuideRect.width / 2
    );
    if (Math.abs(horizontalCorrection) > 0.01) {
        guide.style.left = `${x + horizontalCorrection}px`;
    }
}

function syncPopoutProgressGuide(trackerHost) {
    const targetProgress = trackerHost.querySelector('.progress-bar');
    const progressPercent = parseFloat(targetProgress?.style.width) || 0;
    positionProgressGuideLine({
        guide: trackerHost.querySelector('.progress-guide-line'),
        container: trackerHost,
        track: trackerHost.querySelector('.timeline-track'),
        progressContainer: trackerHost.querySelector('.progress-bar-container'),
        marker: trackerHost.querySelector('.current-time-marker'),
        progressPercent,
        visible: Boolean(getState().settings.showProgressBar)
    });
}

function updateProgressGuideLine(progressPercent) {
    if (!progressGuideLine || !timelineTrack || !progressBar) return;

    positionProgressGuideLine({
        guide: progressGuideLine,
        container: timelineTrack.closest('.timeline-container'),
        track: timelineTrack,
        progressContainer: progressBar.parentElement,
        marker: currentTimeMarker,
        progressPercent,
        visible: Boolean(getState().settings.showProgressBar)
    });
}

/**
 * Update progress bar
 */
function updateProgressBar() {
    if (!progressBar) return;

    const state = getState();
    const container = progressBar.parentElement;

    if (!state.settings.showProgressBar) {
        container?.classList.remove('visible');
        if (progressGuideLine) {
            progressGuideLine.style.display = 'none';
        }
        return;
    }

    container?.classList.add('visible');

    const items = calculateAdjustedIntervals().items;
    if (items.length === 0) {
        progressBar.style.width = '0%';
        if (progressGuideLine) {
            progressGuideLine.style.display = 'none';
        }
        return;
    }

    const now = getTrackerDisplayTime();
    const firstStart = items[0].startTime;
    const lastEnd = items[items.length - 1].endTime;
    const totalMinutes = getMinutesDiff(firstStart, lastEnd);
    const elapsedMinutes = (now.getTime() - firstStart.getTime()) / 60000;

    const progress = clamp((elapsedMinutes / totalMinutes) * 100, 0, 100);
    progressBar.style.width = `${progress}%`;
    updateProgressGuideLine(progress);
}

/**
 * Clean up timer resources
 */
export function destroyTimer() {
    stopTickInterval();
    cleanupPopoutWindow();
}
