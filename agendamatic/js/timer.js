/**
 * timer.js - Timeline visualization and real-time tracking
 */

import {
    getState,
    subscribe,
    updateTracker,
    updateItem,
    updateIntervalTime,
    calculateIntervals,
    calculateAdjustedIntervals,
    advanceToNextItem,
    ensureExpectedSnapshot,
    retreatToPreviousItem,
    reorderItems,
    unstageItem
} from './state.js';
import { formatTime, getMinutesDiff, clamp, parseDuration, formatDuration, renderMarkdownToHtml } from './utils.js';

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
let popoutSyncInterval = null;
let startButton = null;
let stopButton = null;
let popoutButton = null;
let prevItemButton = null;
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

function setGlobalDragCursor(active) {
    const value = active ? 'grabbing' : '';
    document.documentElement.style.setProperty('cursor', value, 'important');
    document.body.style.setProperty('cursor', value, 'important');
}

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
let lastCurrentMinutes = 0;

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
    startButton = elements.startButton;
    stopButton = elements.stopButton;
    popoutButton = elements.popoutButton;
    prevItemButton = elements.prevItemButton;
    overflowLabelsContainer = document.getElementById('overflow-labels');
    nextItemButton = elements.nextItemButton;

    // Subscribe to state changes
    subscribe(onStateChange);

    // Set up button handlers
    if (startButton) {
        startButton.addEventListener('click', startTimer);
    }
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
        nextItemButton.addEventListener('click', triggerAdvanceToNextItem);
    }

    setupTrackerDragDrop();

    document.addEventListener('keydown', (e) => {
        const target = e.target;
        const isEditable = target instanceof HTMLElement &&
            (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (isEditable) return;
        const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
        if (isSpace && !e.repeat) {
            e.preventDefault();
            triggerAdvanceToNextItem();
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

    // Start the tick interval
    startTickInterval();
}

/**
 * Handle state changes
 * @param {Object} state - New state
 */
function onStateChange(state) {
    renderTimeline();
    renderAxisTicks();
    updateStatusDisplay();
    updateCurrentItemPanel();
    updateCurrentStatusPanel();
    updateProgressBar();
    updateButtonStates();
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
        updateCurrentTimeMarker();
        updateStatusDisplay();
        updateCurrentItemPanel();
        updateCurrentStatusPanel();
        updateStatusClock();
        updateProgressBar();
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
    const state = getState();
    if (!state.tracker.expectedSnapshot) {
        ensureExpectedSnapshot();
    }
    const items = calculateIntervals();
    const hasStartedBefore = !!state.tracker.startedAt;
    const activeItemIndex = hasStartedBefore
        ? Math.max(0, Math.min(items.length - 1, state.tracker.activeItemIndex ?? 0))
        : 0;
    updateTracker({
        isRunning: true,
        startedAt: state.tracker.startedAt || new Date().toISOString(),
        pausedAt: null,
        activeItemIndex: Math.max(0, activeItemIndex),
        completedDiffById: hasStartedBefore ? (state.tracker.completedDiffById || {}) : {},
        overallDeltaMinutes: hasStartedBefore ? (state.tracker.overallDeltaMinutes || 0) : 0
    });
    updateButtonStates();
}

/**
 * Stop/pause the timer
 */
export function stopTimer() {
    updateTracker({
        isRunning: false,
        pausedAt: new Date().toISOString()
    });
    updateButtonStates();
}

/**
 * Reset the timer
 */
export function resetTimer() {
    updateTracker({
        isRunning: false,
        startedAt: null,
        pausedAt: null,
        activeItemIndex: 0,
        completedDiffById: {},
        overallDeltaMinutes: 0,
        expectedSnapshot: null,
        varianceMode: false,
        varianceActivatedAt: null
    });
    updateButtonStates();
}

/**
 * Update button states based on tracker state
 */
function updateButtonStates() {
    const state = getState();
    const isRunning = state.tracker.isRunning;

    if (startButton) {
        startButton.classList.toggle('active', isRunning);
        startButton.textContent = isRunning ? '▶ Running' : '▶ Start';
    }
    if (stopButton) {
        stopButton.disabled = !isRunning && !state.tracker.startedAt;
    }
}

function triggerAdvanceToNextItem() {
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
}

function openTrackerPopout() {
    if (popoutWindow && !popoutWindow.closed) {
        popoutWindow.focus();
        syncPopoutWindow();
        return;
    }

    popoutWindow = window.open('', 'autochair-tracker-popout', 'width=1500,height=420,resizable=yes');
    if (!popoutWindow) return;

    const baseHref = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}`;
    popoutWindow.document.open();
    popoutWindow.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>autoCHAIR Tracker</title>
  <base href="${baseHref}">
  <link rel="stylesheet" href="css/styles.css">
  <style>
    body { margin: 0; padding: 10px; background: #f7f7f7; font-family: 'Courier New', monospace; overflow: hidden; }
    .popout-layout { display: grid; grid-template-columns: 60fr 20fr 20fr; grid-template-rows: 1fr auto; gap: 10px; height: calc(100vh - 20px); }
    .popout-pane { border: 2px solid #333; border-radius: 4px; background: #fff; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
    .popout-tracker-pane { grid-column: 1; grid-row: 1 / 3; }
    .popout-overall-pane { grid-column: 2; grid-row: 1; }
    .popout-current-pane { grid-column: 3; grid-row: 1; }
    .popout-control-pane { grid-column: 2 / 4; grid-row: 2; min-height: 84px; }
    .popout-pane h3 { margin: 0; padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 0.85rem; text-transform: uppercase; }
    .popout-content { padding: 8px; min-height: 0; flex: 1; overflow: hidden; }
    .popout-content .timeline-header { display: none; }
    .popout-content .timeline-axis-wrapper { margin-top: 14px; margin-left: 14px; margin-right: 14px; }
    .popout-content .timeline-track-wrapper { margin-left: 14px; margin-right: 14px; }
    .popout-content .progress-bar-container { margin-left: 14px; margin-right: 14px; }
    .popout-content .status-display { padding: 10px 4px; min-height: 0; }
    .popout-content .current-status-display { gap: 4px; padding: 10px 6px; }
    .popout-content .ticker-container, .popout-content .current-status-ticker { height: 72px; }
    .popout-controls-wrap { padding: 8px; }
    .popout-controls-wrap .next-item-controls { height: 100%; min-height: 58px; }
    .popout-controls-wrap .next-item-btn { padding: 8px; gap: 4px; }
    .popout-controls-wrap .main-next-btn .next-item-text { font-size: 1.15rem; }
    .popout-controls-wrap .prev-item-btn .next-item-text-prev { font-size: 0.78rem; }
    .popout-controls-wrap .next-item-logo { height: 1.55rem; }
    .popout-controls-wrap .spacebar-icon { font-size: 0.5rem; padding: 1px 8px; }
  </style>
</head>
<body>
  <div class="popout-layout">
    <section class="popout-pane popout-tracker-pane"><h3>Tracker</h3><div id="popout-tracker" class="popout-content"></div></section>
    <section class="popout-pane popout-overall-pane"><h3>Overall Status</h3><div id="popout-overall" class="popout-content"></div></section>
    <section class="popout-pane popout-current-pane"><h3>Current Status</h3><div id="popout-current" class="popout-content"></div></section>
    <section class="popout-pane popout-control-pane">
      <h3>Controls</h3>
      <div class="popout-controls-wrap">
        <div class="next-item-controls">
          <button id="btn-popout-prev" class="next-item-btn prev-item-btn">
            <span class="next-item-text next-item-text-prev">PREV<img class="next-item-logo next-item-logo-small" src="assets/autoChair-logo.png" alt="" aria-hidden="true">ITEM</span>
            <span class="spacebar-icon backspace-icon" aria-hidden="true">BACKSPACE</span>
          </button>
          <button id="btn-popout-next" class="next-item-btn main-next-btn">
            <span class="next-item-text">NEXT <img class="next-item-logo" src="assets/autoChair-logo.png" alt="" aria-hidden="true"> ITEM</span>
            <span class="spacebar-icon" aria-hidden="true">SPACE</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</body>
</html>`);
    popoutWindow.document.close();
    popoutWindow.addEventListener('beforeunload', cleanupPopoutWindow);

    const popoutPrev = popoutWindow.document.getElementById('btn-popout-prev');
    const popoutNext = popoutWindow.document.getElementById('btn-popout-next');
    if (popoutPrev) {
        popoutPrev.addEventListener('click', triggerRetreatToPreviousItem);
    }
    if (popoutNext) {
        popoutNext.addEventListener('click', triggerAdvanceToNextItem);
    }
    popoutWindow.addEventListener('keydown', (e) => {
        const target = e.target;
        const isEditable = target instanceof popoutWindow.HTMLElement &&
            (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (isEditable) return;
        const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
        if (isSpace && !e.repeat) {
            e.preventDefault();
            triggerAdvanceToNextItem();
            return;
        }
        if (e.key === 'Backspace' && !e.repeat) {
            e.preventDefault();
            triggerRetreatToPreviousItem();
        }
    });

    syncPopoutWindow();

    if (popoutSyncInterval) {
        clearInterval(popoutSyncInterval);
    }
    popoutSyncInterval = setInterval(syncPopoutWindow, 1000);
}

function syncPopoutWindow() {
    if (!popoutWindow || popoutWindow.closed) {
        cleanupPopoutWindow();
        return;
    }

    const doc = popoutWindow.document;
    const trackerHost = doc.getElementById('popout-tracker');
    const overallHost = doc.getElementById('popout-overall');
    const currentHost = doc.getElementById('popout-current');
    const popoutPrev = doc.getElementById('btn-popout-prev');
    const popoutNext = doc.getElementById('btn-popout-next');
    if (!trackerHost || !overallHost || !currentHost) return;

    const axisHtml = document.querySelector('.timeline-axis-wrapper')?.outerHTML || '';
    const trackHtml = document.querySelector('.timeline-track-wrapper')?.outerHTML || '';
    const progressHtml = document.querySelector('.progress-bar-container')?.outerHTML || '';
    trackerHost.innerHTML = `${axisHtml}${trackHtml}${progressHtml}`;

    const overall = statusDisplayEl?.querySelector('.status-display')?.outerHTML || '';
    const current = currentStatusBox?.querySelector('.current-status-display')?.outerHTML || '';
    overallHost.innerHTML = overall;
    currentHost.innerHTML = current;

    if (popoutPrev && prevItemButton) {
        popoutPrev.disabled = prevItemButton.disabled;
    }
    if (popoutNext && nextItemButton) {
        popoutNext.disabled = nextItemButton.disabled;
    }
}

function cleanupPopoutWindow() {
    if (popoutSyncInterval) {
        clearInterval(popoutSyncInterval);
        popoutSyncInterval = null;
    }
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
function renderTimeline() {
    if (!timelineTrack) return;

    const items = calculateIntervals();
    if (items.length === 0) {
        timelineTrack.innerHTML = '<div class="timeline-block" style="width: 100%; background: #ddd;">No items</div>';
        if (overflowLabelsContainer) {
            overflowLabelsContainer.innerHTML = '';
            overflowLabelsContainer.classList.remove('has-overflow');
        }
        return;
    }

    // Calculate total duration
    const firstStart = items[0].startTime;
    const lastEnd = items[items.length - 1].endTime;
    const totalMinutes = getMinutesDiff(firstStart, lastEnd);

    if (totalMinutes <= 0) {
        timelineTrack.innerHTML = '';
        return;
    }

    // Find current item index
    const { currentItemIndex } = calculateAdjustedIntervals();

    // Build timeline blocks
    timelineTrack.innerHTML = '';

    const blockData = [];
    let runningPosition = 0;

    items.forEach((item, index) => {
        const duration = getMinutesDiff(item.startTime, item.endTime);
        const widthPercent = (duration / totalMinutes) * 100;

        const block = document.createElement('div');
        block.className = `timeline-block block-${item.themeNumber}`;
        block.style.width = `${widthPercent}%`;
        block.textContent = item.name;
        block.title = `${item.name} (${formatTime(item.startTime)} - ${formatTime(item.endTime)})`;
        block.dataset.index = index;
        block.dataset.id = item.id;
        block.draggable = true;
        const outlineColors = {
            1: '#2196f3',
            2: '#9c27b0',
            3: '#4caf50',
            4: '#ff9800'
        };
        block.style.setProperty('--block-outline', outlineColors[item.themeNumber] || '#666');

        if (index === currentItemIndex) {
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

        blockData.push({
            name: item.name,
            themeNumber: item.themeNumber,
            startPercent: runningPosition,
            widthPercent: widthPercent,
            centerPercent: runningPosition + widthPercent / 2
        });

        runningPosition += widthPercent;
    });

    // Check for overflow labels after render
    requestAnimationFrame(() => {
        renderOverflowLabels(blockData);
    });
}

/**
 * Render overflow labels with bezier curves for blocks that are too small
 * @param {Array} blockData - Data about each block's position
 */
function renderOverflowLabels(blockData) {
    if (!overflowLabelsContainer || !timelineTrack) return;

    const blocks = timelineTrack.querySelectorAll('.timeline-block');
    const overflowItems = [];

    blocks.forEach((block, index) => {
        const blockRect = block.getBoundingClientRect();
        const textWidth = getTextWidth(block.textContent, '0.8rem bold "Courier New"');
        const availableWidth = blockRect.width - 8; // Account for padding

        if (textWidth > availableWidth) {
            block.classList.add('label-overflow');
            overflowItems.push({
                ...blockData[index],
                index: index,
                blockRect: blockRect
            });
        } else {
            block.classList.remove('label-overflow');
        }
    });

    // Clear and rebuild overflow labels
    overflowLabelsContainer.innerHTML = '';

    if (overflowItems.length === 0) {
        overflowLabelsContainer.classList.remove('has-overflow');
        return;
    }

    overflowLabelsContainer.classList.add('has-overflow');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('overflow-curves-svg');
    overflowLabelsContainer.appendChild(svg);

    const labels = overflowItems.map(item => {
        const label = document.createElement('div');
        label.className = `overflow-label theme-text-${item.themeNumber}`;
        label.textContent = item.name;
        overflowLabelsContainer.appendChild(label);
        return label;
    });

    requestAnimationFrame(() => {
        const containerRect = overflowLabelsContainer.getBoundingClientRect();
        const containerWidth = containerRect.width;
        if (containerWidth <= 0) return;

        const desiredCenters = overflowItems.map(item => (item.centerPercent / 100) * containerWidth);
        const widths = labels.map(label => label.getBoundingClientRect().width);
        const fittedCenters = fitLabelCenters(desiredCenters, widths, 6, [0, containerWidth]);

        labels.forEach((label, i) => {
            label.style.left = `${fittedCenters[i]}px`;
        });

        const svgHeight = overflowLabelsContainer.getBoundingClientRect().height;
        svg.setAttribute('width', containerWidth);
        svg.setAttribute('height', svgHeight);
        svg.setAttribute('viewBox', `0 0 ${containerWidth} ${svgHeight}`);
        svg.innerHTML = '';

        overflowItems.forEach((item, i) => {
            const labelRect = labels[i].getBoundingClientRect();
            const labelTop = labelRect.top - containerRect.top;
            const startX = item.blockRect.left + item.blockRect.width / 2 - containerRect.left;
            const startY = item.blockRect.bottom - containerRect.top;
            const endX = fittedCenters[i];
            // Anchor just above the label to avoid colored strokes intruding on text.
            const endY = Math.max(0, labelTop - 2);
            const lift = Math.max(10, Math.min(22, Math.abs(endX - startX) * 0.18 + 8));
            const controlY = endY >= startY
                ? Math.max(startY, endY) + lift
                : Math.min(startY, endY) - lift;
            // Keep entry/exit vertical so curves hit rectangles/labels straight-on.
            const c1x = startX;
            const c1y = controlY;
            const c2x = endX;
            const c2y = controlY;

            const colors = {
                1: '#2196f3',
                2: '#9c27b0',
                3: '#4caf50',
                4: '#ff9800'
            };
            const strokeColor = colors[item.themeNumber] || '#666';

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${startX} ${startY} C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`;
            path.setAttribute('d', d);
            path.setAttribute('stroke', strokeColor);
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('fill', 'none');
            path.setAttribute('vector-effect', 'non-scaling-stroke');
            svg.appendChild(path);
        });
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

function fitLabelCenters(desiredCenters, widths, gap, bounds) {
    const n = desiredCenters.length;
    if (n === 0) return [];

    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    let gapUsed = gap;
    if (bounds && n > 1) {
        const available = bounds[1] - bounds[0];
        const maxGap = Math.max(0, (available - totalWidth) / (n - 1));
        if (gapUsed > maxGap) {
            gapUsed = maxGap;
        }
    }

    const order = desiredCenters.map((value, index) => ({ value, index }))
        .sort((a, b) => (a.value - b.value) || (a.index - b.index));

    const sortedLeft = new Array(n);
    const offsets = new Array(n);
    let offset = 0;
    for (let i = 0; i < n; i += 1) {
        const idx = order[i].index;
        sortedLeft[i] = desiredCenters[idx] - widths[idx] / 2;
        offsets[i] = offset;
        offset += widths[idx] + gapUsed;
    }

    const lower = new Array(n);
    const upper = new Array(n);
    const minBound = bounds ? bounds[0] : -Infinity;
    const maxBound = bounds ? bounds[1] : Infinity;
    for (let i = 0; i < n; i += 1) {
        const idx = order[i].index;
        lower[i] = minBound - offsets[i];
        upper[i] = (maxBound - widths[idx]) - offsets[i];
    }

    const target = sortedLeft.map((value, i) => value - offsets[i]);
    const adjusted = boundedIsotonicRegression(target, lower, upper);

    const centers = new Array(n);
    for (let i = 0; i < n; i += 1) {
        const idx = order[i].index;
        const left = adjusted[i] + offsets[i];
        centers[idx] = left + widths[idx] / 2;
    }

    return centers;
}

function hasHorizontalOverlap(desiredCenters, widths, gap) {
    if (desiredCenters.length <= 1) return false;
    const order = desiredCenters.map((value, index) => ({ value, index }))
        .sort((a, b) => (a.value - b.value) || (a.index - b.index));
    for (let i = 1; i < order.length; i += 1) {
        const prevIdx = order[i - 1].index;
        const currIdx = order[i].index;
        const prevCenter = desiredCenters[prevIdx];
        const currCenter = desiredCenters[currIdx];
        const minDist = (widths[prevIdx] + widths[currIdx]) / 2 + gap;
        if (currCenter - prevCenter < minDist) {
            return true;
        }
    }
    return false;
}

function boundedIsotonicRegression(values, lower, upper) {
    const n = values.length;
    if (n === 0) return [];
    const tol = 1e-9;

    let bStart = [];
    let bEnd = [];
    let bSum = [];
    let bW = [];
    let bLo = [];
    let bHi = [];
    let bVal = [];

    for (let i = 0; i < n; i += 1) {
        bStart.push(i);
        bEnd.push(i);
        bSum.push(values[i]);
        bW.push(1);
        bLo.push(lower[i]);
        bHi.push(upper[i]);
        let val = values[i];
        if (val < lower[i]) val = lower[i];
        if (val > upper[i]) val = upper[i];
        bVal.push(val);
    }

    let m = n;
    let i = 0;
    while (i < m - 1) {
        if (bVal[i] > bVal[i + 1] + tol) {
            bEnd[i] = bEnd[i + 1];
            bSum[i] += bSum[i + 1];
            bW[i] += bW[i + 1];
            const newLo = Math.max(bLo[i], bLo[i + 1]);
            const newHi = Math.min(bHi[i], bHi[i + 1]);
            if (newLo > newHi && newLo - newHi > tol) {
                const mid = (newLo + newHi) / 2;
                bLo[i] = mid;
                bHi[i] = mid;
            } else {
                bLo[i] = newLo;
                bHi[i] = newHi;
            }
            let mu = bSum[i] / bW[i];
            if (mu < bLo[i]) mu = bLo[i];
            if (mu > bHi[i]) mu = bHi[i];
            bVal[i] = mu;

            bStart.splice(i + 1, 1);
            bEnd.splice(i + 1, 1);
            bSum.splice(i + 1, 1);
            bW.splice(i + 1, 1);
            bLo.splice(i + 1, 1);
            bHi.splice(i + 1, 1);
            bVal.splice(i + 1, 1);

            m -= 1;
            if (i > 0) i -= 1;
        } else {
            i += 1;
        }
    }

    const out = new Array(n);
    for (let k = 0; k < m; k += 1) {
        for (let j = bStart[k]; j <= bEnd[k]; j += 1) {
            out[j] = bVal[k];
        }
    }

    return out;
}

function getThemeStrokeColor(themeNumber) {
    const colors = {
        1: '#2196f3',
        2: '#9c27b0',
        3: '#4caf50',
        4: '#ff9800'
    };
    return colors[themeNumber] || '#555';
}

function getFollowingItemColor(items, boundaryTime) {
    if (!items || items.length === 0) return '#222';
    const boundaryMs = boundaryTime.getTime();
    const toleranceMs = 30000;

    if (boundaryMs <= items[0].startTime.getTime() + toleranceMs) {
        return getThemeStrokeColor(items[0].themeNumber);
    }

    for (let i = 0; i < items.length - 1; i += 1) {
        const boundary = items[i].endTime.getTime();
        if (Math.abs(boundaryMs - boundary) <= toleranceMs) {
            return getThemeStrokeColor(items[i + 1].themeNumber);
        }
        if (boundaryMs < boundary) {
            return getThemeStrokeColor(items[i].themeNumber);
        }
    }

    return getThemeStrokeColor(items[items.length - 1].themeNumber);
}

function getMinorLabelInterval(totalMinutes) {
    if (totalMinutes <= 120) return 30;
    if (totalMinutes <= 360) return 60;
    if (totalMinutes <= 720) return 120;
    return 180;
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

    const items = calculateIntervals();
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
        timelineAxis.appendChild(tickEl);

        const shouldRenderMinorLabel = !tick.isMajor &&
            tick.offset > 0 &&
            tick.offset < totalMinutes &&
            tick.offset % minorLabelInterval === 0;

        if (tick.isMajor || shouldRenderMinorLabel) {
            const label = document.createElement('span');
            label.className = `axis-tick-label ${tick.isMajor ? 'axis-label-major' : 'axis-label-minor'}`;
            label.textContent = formatTime(tick.time);
            labelLayer.appendChild(label);

            const followColor = getFollowingItemColor(items, tick.time);
            labelEntries.push({
                label,
                isMajor: tick.isMajor,
                desiredCenter: tick.position,
                followColor,
                tickHeight: tick.isMajor ? 8 : 4
            });
        }
    });

    requestAnimationFrame(() => {
        const width = timelineAxis.getBoundingClientRect().width;
        if (labelEntries.length === 0 || width <= 0) return;

        const desiredCenters = labelEntries.map(entry => (entry.desiredCenter / 100) * width);
        const labelWidths = labelEntries.map(entry => entry.label.getBoundingClientRect().width);
        const boundedDesiredCenters = desiredCenters.map((center, i) => {
            const halfWidth = labelWidths[i] / 2;
            return clamp(center, halfWidth, width - halfWidth);
        });
        const fittedCenters = hasHorizontalOverlap(boundedDesiredCenters, labelWidths, 8)
            ? fitLabelCenters(boundedDesiredCenters, labelWidths, 8, [0, width])
            : boundedDesiredCenters;
        const labelHeights = labelEntries.map(entry => entry.label.getBoundingClientRect().height || 12);
        const maxLabelHeight = Math.max(...labelHeights, 12);
        const axisLine = axisWrapper.querySelector('.timeline-axis-line');
        const axisY = axisLine ? axisLine.offsetTop : timelineAxis.offsetTop;
        const majorTickHeight = 8;
        const tickTop = axisY - majorTickHeight;
        const baseTop = Math.max(0, tickTop - maxLabelHeight - 4);
        const liftedTop = Math.max(0, baseTop - 14);

        labelEntries.forEach((entry, i) => {
            const label = entry.label;
            const displacement = Math.abs(fittedCenters[i] - desiredCenters[i]);
            entry.displaced = displacement > 2;
            label.style.left = `${fittedCenters[i]}px`;
            label.style.top = entry.displaced ? `${liftedTop}px` : `${baseTop}px`;
            label.style.background = '';
            label.style.webkitBackgroundClip = '';
            label.style.backgroundClip = '';
            label.style.webkitTextFillColor = '';
            label.style.color = entry.isMajor ? entry.followColor : '#222';
        });

        axisWrapper.querySelectorAll('.axis-label-curves').forEach(node => node.remove());

        const displaced = labelEntries
            .map((entry, i) => ({ entry, i }))
            .filter(item => item.entry.displaced);
        if (displaced.length === 0) return;

        const wrapperRect = axisWrapper.getBoundingClientRect();
        const curveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        curveSvg.classList.add('axis-label-curves');
        curveSvg.setAttribute('width', width);
        curveSvg.setAttribute('height', axisWrapper.getBoundingClientRect().height);
        curveSvg.setAttribute('viewBox', `0 0 ${width} ${axisWrapper.getBoundingClientRect().height}`);
        curveSvg.innerHTML = '';
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        curveSvg.appendChild(defs);

        displaced.forEach(({ entry, i }, idx) => {
            const labelBox = entry.label.getBoundingClientRect();
            const endX = fittedCenters[i];
            const endY = labelBox.top - wrapperRect.top + labelBox.height + 0.5;
            const startX = desiredCenters[i];
            const startY = axisY - entry.tickHeight + 0.5;
            const lift = Math.max(10, Math.min(24, Math.abs(endX - startX) * 0.2 + 8));
            const controlY = endY >= startY
                ? Math.max(startY, endY) + lift
                : Math.min(startY, endY) - lift;
            // Keep entry/exit vertical so curves hit ticks/labels straight-on.
            const c1x = startX;
            const c1y = controlY;
            const c2x = endX;
            const c2y = controlY;

            let stroke = '#444';
            if (entry.isMajor) {
                const gradientId = `axis-grad-${idx}`;
                const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
                gradient.setAttribute('id', gradientId);
                gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
                gradient.setAttribute('x1', `${startX}`);
                gradient.setAttribute('y1', `${startY}`);
                gradient.setAttribute('x2', `${endX}`);
                gradient.setAttribute('y2', `${endY}`);

                const stopA = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                stopA.setAttribute('offset', '0%');
                stopA.setAttribute('stop-color', '#222');
                const stopB = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                stopB.setAttribute('offset', '100%');
                stopB.setAttribute('stop-color', entry.followColor);
                gradient.appendChild(stopA);
                gradient.appendChild(stopB);
                defs.appendChild(gradient);
                stroke = `url(#${gradientId})`;
            }

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${startX} ${startY} C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`;
            path.setAttribute('d', d);
            path.setAttribute('stroke', stroke);
            path.setAttribute('stroke-width', entry.isMajor ? '1.4' : '1');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('vector-effect', 'non-scaling-stroke');
            curveSvg.appendChild(path);
        });

        axisWrapper.appendChild(curveSvg);
    });
}

/**
 * Update the current time marker position
 */
function updateCurrentTimeMarker() {
    if (!currentTimeMarker) return;

    const items = calculateIntervals();
    if (items.length === 0) {
        currentTimeMarker.style.display = 'none';
        return;
    }

    const state = getState();
    const now = new Date();
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

    const statusContainer = statusDisplayEl.querySelector('.status-display');
    const directionEl = statusDisplayEl.querySelector('.status-direction');

    if (!statusContainer || !directionEl) return;

    // Remove old status classes
    statusContainer.classList.remove('on-time', 'behind', 'ahead');
    statusContainer.classList.add(status);

    if (status === 'on-time' || difference === 0) {
        // Show "ON TIME" text
        tickerTape.innerHTML = '<span class="ticker-on-time">ON TIME</span>';
        directionEl.textContent = '';
        if (statusUnitEl) {
            statusUnitEl.textContent = 'MINUTES';
        }
    } else {
        const scale = getTickerScale(difference);
        renderTickerTape(scale.value, status, scale.step, scale.precision);
        directionEl.textContent = status === 'behind' ? 'BEHIND' : 'AHEAD';
        if (statusUnitEl) {
            statusUnitEl.textContent = scale.unit;
        }
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
            unit: 'MINUTES',
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
    } else if (items.length > 0) {
        // Before meeting starts, show first item
        currentItem = items[0];
    }

    if (currentItem) {
        // Update theme class on the panel
        currentItemPanel.className = `box current-item-box theme-${currentItem.themeNumber}`;

        nameEl.textContent = currentItem.name;
        applyThemeText(nameEl, currentItem.themeNumber);
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
        currentItemPanel.className = 'box current-item-box';
        if (notesPreviewEl) {
            notesPreviewEl.innerHTML = '';
        }
    }
}

/**
 * Update the current status panel
 */
function updateCurrentStatusPanel() {
    if (!currentStatusBox || !currentStatusTape || !currentStatusItemEl || !currentStatusNextLineEl) return;

    const items = calculateIntervals();
    if (items.length === 0) {
        currentStatusItemEl.textContent = '-';
        if (currentStatusLabelEl) currentStatusLabelEl.textContent = 'YOU HAVE';
        if (currentStatusUnitEl) currentStatusUnitEl.textContent = 'MINUTES';
        currentStatusNextLineEl.textContent = '';
        currentStatusNextItemEl = null;
        renderMinuteTicker(currentStatusTape, 0);
        fitTickerToContainer(currentStatusTape);
        lastCurrentMinutes = 0;
        applyThemeText(currentStatusItemEl, null);
        applyThemeText(currentStatusTape, null);
        if (nextItemButton) nextItemButton.disabled = true;
        if (prevItemButton) prevItemButton.disabled = true;
        return;
    }

    const now = new Date();
    const adjusted = calculateAdjustedIntervals(now);
    const trackerState = getState().tracker || {};
    const trackerActive = trackerState.isRunning || trackerState.startedAt;
    let currentIndex = adjusted.currentItemIndex;

    if (currentIndex < 0) {
        currentIndex = 0;
    }

    const currentItem = adjusted.items[currentIndex] || items[currentIndex];
    const nextItem = items[currentIndex + 1];
    const remaining = trackerActive
        ? (adjusted.currentRemaining ?? 0)
        : parseDuration((currentItem?.duration || '1m'));
    const overrun = Math.max(0, -(remaining));
    const displayValue = remaining >= 0 ? remaining : overrun;
    const scale = getTickerScale(displayValue);

    renderMinuteTicker(currentStatusTape, scale.value, { step: scale.step, precision: scale.precision });
    fitTickerToContainer(currentStatusTape);

    if (Math.abs(displayValue - lastCurrentMinutes) > 0.01) {
        animateTickerTransition(currentStatusTape, lastCurrentMinutes, displayValue);
        lastCurrentMinutes = displayValue;
    }

    currentStatusItemEl.textContent = currentItem?.name || '-';
    if (currentStatusLabelEl) {
        currentStatusLabelEl.textContent = remaining >= 0 ? 'YOU HAVE' : 'YOU ARE';
    }
    if (currentStatusUnitEl) {
        currentStatusUnitEl.textContent = scale.unit;
    }

    const statusLine = currentStatusBox.querySelector('.current-status-line');
    if (statusLine) {
        if (remaining >= 0) {
            statusLine.innerHTML = `of <span class="current-status-item" id="current-status-item">${currentItem?.name || '-'}</span> LEFT`;
        } else {
            statusLine.innerHTML = `PAST THE END OF <span class="current-status-item" id="current-status-item">${currentItem?.name || '-'}</span>`;
        }
        currentStatusItemEl = statusLine.querySelector('#current-status-item') || currentStatusItemEl;
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

    applyThemeText(currentStatusItemEl, currentItem?.themeNumber);
    if (currentStatusNextItemEl) {
        applyThemeText(currentStatusNextItemEl, nextItem?.themeNumber);
    }
    applyThemeText(currentStatusTape, currentItem?.themeNumber);

    if (nextItemButton) {
        nextItemButton.disabled = !nextItem;
    }
    if (prevItemButton) {
        prevItemButton.disabled = currentIndex <= 0;
    }

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
 * @param {number} themeNumber - Theme number
 */
function applyThemeText(element, themeNumber) {
    if (!element) return;
    element.classList.remove('theme-text-1', 'theme-text-2', 'theme-text-3', 'theme-text-4');
    if (themeNumber) {
        element.classList.add(`theme-text-${themeNumber}`);
    }
}

function updateProgressGuideLine(progressPercent) {
    if (!progressGuideLine || !timelineTrack || !timelineAxis || !progressBar) return;

    const state = getState();
    if (!state.settings.showProgressBar) {
        progressGuideLine.style.display = 'none';
        return;
    }

    const timelineContainer = timelineTrack.closest('.timeline-container');
    const progressContainer = progressBar.parentElement;
    const axisLine = timelineAxis.parentElement?.querySelector('.timeline-axis-line');
    if (!timelineContainer || !progressContainer || !axisLine) {
        progressGuideLine.style.display = 'none';
        return;
    }

    const containerRect = timelineContainer.getBoundingClientRect();
    const trackRect = timelineTrack.getBoundingClientRect();
    const progressRect = progressContainer.getBoundingClientRect();
    const axisLineRect = axisLine.getBoundingClientRect();

    const clamped = clamp(progressPercent, 0, 100);
    const markerRect = currentTimeMarker?.getBoundingClientRect();
    const markerX = markerRect
        ? (markerRect.left + markerRect.width / 2) - containerRect.left
        : NaN;
    const x = Number.isFinite(markerX)
        ? markerX
        : (trackRect.left - containerRect.left + (clamped / 100) * trackRect.width);
    const top = axisLineRect.top - containerRect.top;
    const bottom = progressRect.top - containerRect.top;
    const height = bottom - top;

    if (!Number.isFinite(x) || height <= 0) {
        progressGuideLine.style.display = 'none';
        return;
    }

    progressGuideLine.style.display = 'block';
    progressGuideLine.style.left = `${x}px`;
    progressGuideLine.style.top = `${top}px`;
    progressGuideLine.style.height = `${height}px`;
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

    const items = calculateIntervals();
    if (items.length === 0) {
        progressBar.style.width = '0%';
        if (progressGuideLine) {
            progressGuideLine.style.display = 'none';
        }
        return;
    }

    const now = new Date();
    const firstStart = items[0].startTime;
    const lastEnd = items[items.length - 1].endTime;
    const totalMinutes = getMinutesDiff(firstStart, lastEnd);
    const elapsedMinutes = (now.getTime() - firstStart.getTime()) / 60000;

    const progress = clamp((elapsedMinutes / totalMinutes) * 100, 0, 100);
    progressBar.style.width = `${progress}%`;
    updateProgressGuideLine(progress);
}

/**
 * Get the current meeting progress info
 * @returns {Object} Progress info
 */
export function getMeetingProgress() {
    const items = calculateIntervals();
    if (items.length === 0) {
        return { progress: 0, elapsed: 0, remaining: 0, total: 0 };
    }

    const now = new Date();
    const firstStart = items[0].startTime;
    const lastEnd = items[items.length - 1].endTime;
    const total = getMinutesDiff(firstStart, lastEnd);
    const elapsed = clamp(getMinutesDiff(firstStart, now), 0, total);
    const remaining = total - elapsed;

    return {
        progress: (elapsed / total) * 100,
        elapsed,
        remaining,
        total
    };
}

/**
 * Clean up timer resources
 */
export function destroyTimer() {
    stopTickInterval();
    cleanupPopoutWindow();
}
