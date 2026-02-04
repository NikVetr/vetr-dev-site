/**
 * timer.js - Timeline visualization and real-time tracking
 */

import {
    getState,
    subscribe,
    updateTracker,
    calculateIntervals,
    calculateAdjustedIntervals,
    advanceToNextItem
} from './state.js';
import { formatTime, getMinutesDiff, clamp, parseDuration, renderMarkdownToHtml } from './utils.js';

let timelineTrack = null;
let timelineAxis = null;
let currentTimeMarker = null;
let statusDisplayEl = null;
let statusClockEl = null;
let currentItemPanel = null;
let notesPreviewEl = null;
let progressBar = null;
let tickerTape = null;
let tickInterval = null;
let startButton = null;
let stopButton = null;
let overflowLabelsContainer = null;
let currentStatusBox = null;
let currentStatusTape = null;
let currentStatusItemEl = null;
let currentStatusNextItemEl = null;
let currentStatusNextLineEl = null;
let nextItemButton = null;

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
    currentItemPanel = elements.currentItemPanel;
    notesPreviewEl = document.getElementById('notes-preview');
    currentStatusBox = elements.currentStatusDisplay;
    currentStatusTape = elements.currentStatusTape;
    currentStatusItemEl = elements.currentStatusItem;
    currentStatusNextItemEl = elements.currentStatusNextItem;
    currentStatusNextLineEl = elements.currentStatusNextLine;
    progressBar = elements.progressBar;
    tickerTape = document.getElementById('ticker-tape');
    startButton = elements.startButton;
    stopButton = elements.stopButton;
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
    if (nextItemButton) {
        nextItemButton.addEventListener('click', () => {
            advanceToNextItem();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.code !== 'Space') return;
        const target = e.target;
        const isEditable = target instanceof HTMLElement &&
            (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (isEditable) return;
        if (nextItemButton && nextItemButton.disabled) return;
        e.preventDefault();
        advanceToNextItem();
    });

    // Initial render
    renderTimeline();
    renderAxisTicks();
    updateCurrentTimeMarker();
    updateStatusDisplay();
    updateCurrentItemPanel();
    updateCurrentStatusPanel();
    updateStatusClock();

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
    updateTracker({
        isRunning: true,
        startedAt: state.tracker.startedAt || new Date().toISOString(),
        pausedAt: null
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
        pausedAt: null
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

        if (index === currentItemIndex) {
            block.classList.add('active');
        }

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
    const trackRect = timelineTrack.getBoundingClientRect();

    blocks.forEach((block, index) => {
        const blockRect = block.getBoundingClientRect();
        const textWidth = getTextWidth(block.textContent, '0.8rem bold "Courier New"');
        const availableWidth = blockRect.width - 8; // Account for padding

        if (textWidth > availableWidth) {
            block.classList.add('label-overflow');
            overflowItems.push({
                ...blockData[index],
                index: index
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

    // Create SVG for bezier curves
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('overflow-curves-svg');
    svg.style.height = '50px';

    // Create labels and curves
    overflowItems.forEach((item, i) => {
        // Create label
        const label = document.createElement('div');
        label.className = `overflow-label theme-${item.themeNumber}`;
        label.textContent = item.name;
        label.style.left = `${item.centerPercent}%`;
        overflowLabelsContainer.appendChild(label);

        // Create bezier curve path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const startX = item.centerPercent;
        const startY = 0;
        const endY = 18;

        // Get the theme border color
        const colors = {
            1: '#2196f3',
            2: '#9c27b0',
            3: '#4caf50',
            4: '#ff9800'
        };
        const strokeColor = colors[item.themeNumber] || '#666';

        // Bezier curve from bottom of block to label
        const d = `M ${startX}% ${startY} Q ${startX}% ${endY / 2} ${startX}% ${endY}`;
        path.setAttribute('d', d);
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('vector-effect', 'non-scaling-stroke');

        svg.appendChild(path);
    });

    overflowLabelsContainer.insertBefore(svg, overflowLabelsContainer.firstChild);
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

/**
 * Render axis tick marks with major/minor ticks
 */
function renderAxisTicks() {
    if (!timelineAxis) return;

    const items = calculateIntervals();
    if (items.length === 0) {
        timelineAxis.innerHTML = '';
        return;
    }

    const firstStart = items[0].startTime;
    const lastEnd = items[items.length - 1].endTime;
    const totalMinutes = getMinutesDiff(firstStart, lastEnd);

    if (totalMinutes <= 0) {
        timelineAxis.innerHTML = '';
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
            time: tick.time,
            position: clamp((offset / totalMinutes) * 100, 0, 100),
            isMajor: tick.isMajor
        }));

    // Render ticks
    timelineAxis.innerHTML = '';

    ticks.forEach(tick => {
        const tickEl = document.createElement('div');
        tickEl.className = `axis-tick ${tick.isMajor ? 'major' : 'minor'}`;
        tickEl.style.left = `${tick.position}%`;
        if (tick.isMajor) {
            const label = document.createElement('span');
            label.className = 'axis-tick-label';
            label.textContent = formatTime(tick.time);
            tickEl.appendChild(label);
        }
        timelineAxis.appendChild(tickEl);
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
    const elapsedMinutes = getMinutesDiff(firstStart, now);
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

    const state = getState();
    const { status, difference, currentItemIndex } = calculateAdjustedIntervals();

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
    } else {
        // Build ticker tape with numbers
        renderTickerTape(difference, status);
        directionEl.textContent = status === 'behind' ? 'BEHIND' : 'AHEAD';
    }

    // Animate if difference changed
    if (difference !== lastDifference || status !== lastStatus) {
        animateTickerTransition(tickerTape, lastDifference, difference);
        lastDifference = difference;
        lastStatus = status;
    }
}

/**
 * Render the ticker tape with numbers
 * @param {number} centerValue - The center (current) value
 * @param {string} status - 'behind' or 'ahead'
 */
function renderTickerTape(centerValue, status) {
    if (!tickerTape) return;

    // Create numbers: center and 3 on each side
    const numbers = [];
    for (let i = -3; i <= 3; i++) {
        const value = centerValue + i;
        if (value >= 0) {
            numbers.push({ value, offset: i });
        }
    }

    tickerTape.innerHTML = numbers.map(({ value, offset }) => {
        let className = 'ticker-number';
        if (offset === 0) {
            className += ' center';
        } else {
            className += ` adjacent-${Math.abs(offset)}`;
        }
        return `<span class="${className}">${value}</span>`;
    }).join('');
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
    tapeEl.style.transform = `translateX(${direction * 20}px)`;

    setTimeout(() => {
        tapeEl.style.transform = 'translateX(0)';
    }, 50);
}

/**
 * Render a numeric ticker for minutes
 * @param {HTMLElement} tapeEl - Ticker tape element
 * @param {number} centerValue - Center value
 */
function renderMinuteTicker(tapeEl, centerValue) {
    if (!tapeEl) return;

    const numbers = [];
    for (let i = -3; i <= 3; i++) {
        const value = centerValue + i;
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
        return `<span class="${className}">${value}</span>`;
    }).join('');
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
    if (!currentStatusBox || !currentStatusTape || !currentStatusItemEl || !currentStatusNextItemEl || !currentStatusNextLineEl) return;

    const items = calculateIntervals();
    if (items.length === 0) {
        currentStatusItemEl.textContent = '-';
        currentStatusNextLineEl.textContent = '';
        currentStatusNextItemEl = null;
        renderMinuteTicker(currentStatusTape, 0);
        lastCurrentMinutes = 0;
        applyThemeText(currentStatusItemEl, null);
        applyThemeText(currentStatusTape, null);
        return;
    }

    const now = new Date();
    const adjusted = calculateAdjustedIntervals(now);
    let currentIndex = adjusted.currentItemIndex;

    if (currentIndex < 0) {
        currentIndex = 0;
    }

    const currentItem = adjusted.items[currentIndex] || items[currentIndex];
    const nextItem = items[currentIndex + 1];

    const minutesLeft = currentItem
        ? Math.max(0, Math.round((currentItem.endTime - now) / 60000))
        : 0;

    renderMinuteTicker(currentStatusTape, minutesLeft);

    if (minutesLeft !== lastCurrentMinutes) {
        animateTickerTransition(currentStatusTape, lastCurrentMinutes, minutesLeft);
        lastCurrentMinutes = minutesLeft;
    }

    currentStatusItemEl.textContent = currentItem?.name || '-';
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
        let canAdvance = Boolean(nextItem);
        const scheduledCurrent = items[currentIndex];
        if (canAdvance && scheduledCurrent && now < scheduledCurrent.startTime) {
            canAdvance = false;
        }
        if (canAdvance && currentItem?.locked && scheduledCurrent) {
            const elapsed = Math.floor((now - scheduledCurrent.startTime) / 60000);
            const originalDuration = parseDuration(scheduledCurrent.duration);
            if (elapsed < originalDuration) {
                canAdvance = false;
            }
        }
        nextItemButton.disabled = !canAdvance;
    }
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

/**
 * Update progress bar
 */
function updateProgressBar() {
    if (!progressBar) return;

    const state = getState();
    const container = progressBar.parentElement;

    if (!state.settings.showProgressBar) {
        container?.classList.remove('visible');
        return;
    }

    container?.classList.add('visible');

    const items = calculateIntervals();
    if (items.length === 0) {
        progressBar.style.width = '0%';
        return;
    }

    const now = new Date();
    const firstStart = items[0].startTime;
    const lastEnd = items[items.length - 1].endTime;
    const totalMinutes = getMinutesDiff(firstStart, lastEnd);
    const elapsedMinutes = getMinutesDiff(firstStart, now);

    const progress = clamp((elapsedMinutes / totalMinutes) * 100, 0, 100);
    progressBar.style.width = `${progress}%`;
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
}
