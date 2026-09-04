/**
 * layout-resize.js - Drag handles for resizing panel splits
 */

import { clamp } from './utils.js';

const STORAGE_KEY = 'autochair_layout_splits_v6';
const KEYBOARD_STEP = 16;

const RESIZER_DEFS = [
    {
        handleId: 'resizer-main-top',
        axis: 'y',
        containerSelector: '.workspace-panels',
        cssVar: '--main-top-height',
        beforeLabel: 'Top panels',
        afterLabel: 'Lower panels',
        minPrev: 220,
        minNext: 300
    },
    {
        handleId: 'resizer-top-main',
        axis: 'x',
        containerSelector: '.top-section',
        cssVar: '--top-left-width',
        beforeLabel: 'Input panel',
        afterLabel: 'Right-side panels',
        minPrev: 360,
        minNext: 280
    },
    {
        handleId: 'resizer-right-side',
        axis: 'x',
        containerSelector: '.right-side',
        cssVar: '--right-export-width',
        beforeLabel: 'Import and Export panel',
        afterLabel: 'Status panels',
        minPrev: 190,
        minNext: 200
    },
    {
        handleId: 'resizer-status-column',
        axis: 'y',
        containerSelector: '.status-column',
        cssVar: '--status-overall-height',
        beforeLabel: 'Agenda Status panel',
        afterLabel: 'Meeting controls',
        minPrev: 140,
        minNext: 110
    },
    {
        handleId: 'resizer-next-controls',
        axis: 'x',
        containerSelector: '.next-item-controls',
        cssVar: '--next-prev-width',
        beforeLabel: 'Previous Item control',
        afterLabel: 'Next Item control',
        minPrev: 72,
        minNext: 96
    },
    {
        handleId: 'resizer-tracker',
        axis: 'x',
        containerSelector: '.tracker-section',
        cssVar: '--tracker-left-width',
        beforeLabel: 'Tracker panel',
        afterLabel: 'Current Status panel',
        minPrev: 360,
        minNext: 260
    },
    {
        handleId: 'resizer-main-bottom',
        axis: 'y',
        containerSelector: '.lower-panels',
        cssVar: '--main-bottom-height',
        beforeLabel: 'Tracker row',
        afterLabel: 'Bottom panels',
        anchor: 'next',
        minPrev: 120,
        minNext: 120
    },
    {
        handleId: 'resizer-bottom',
        axis: 'x',
        containerSelector: '.bottom-section',
        cssVar: '--bottom-left-width',
        beforeLabel: 'Staging panel',
        afterLabel: 'Current Item panel',
        minPrev: 320,
        minNext: 280
    }
];

let activeDrag = null;

function getSplitterSize(container) {
    const raw = getComputedStyle(container).getPropertyValue('--splitter-size').trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 10;
}

function getFeasibleBounds(def, total, splitter) {
    const available = Math.max(0, total - splitter);
    if (available <= 0) {
        return { minPrev: 0, maxPrev: 0 };
    }

    let minPrev = Math.max(0, def.minPrev || 0);
    let minNext = Math.max(0, def.minNext || 0);

    // If the requested minima do not fit, scale them down proportionally.
    const required = minPrev + minNext;
    if (required > available) {
        const ratio = required > 0 ? (minPrev / required) : 0.5;
        minPrev = available * ratio;
        minNext = available - minPrev;
    }

    const maxPrev = Math.max(0, available - minNext);
    minPrev = Math.min(minPrev, maxPrev);
    return { minPrev, maxPrev };
}

function getStoredValueFromPrev(def, total, splitter, prevValue) {
    const available = Math.max(0, total - splitter);
    if (def.anchor === 'next') {
        return available - prevValue;
    }
    return prevValue;
}

function getPrevValueFromStored(def, total, splitter, storedValue) {
    const available = Math.max(0, total - splitter);
    if (def.anchor === 'next') {
        return available - storedValue;
    }
    return storedValue;
}

function applyValue(def, container, rawValue) {
    const rect = container.getBoundingClientRect();
    const splitter = getSplitterSize(container);
    const total = def.axis === 'x' ? rect.width : rect.height;
    const { minPrev, maxPrev } = getFeasibleBounds(def, total, splitter);
    const clamped = clamp(rawValue, minPrev, maxPrev);
    const stored = getStoredValueFromPrev(def, total, splitter, clamped);
    container.style.setProperty(def.cssVar, `${Math.round(stored)}px`);
    updateHandleAria(def, container);
    return clamped;
}

function getCurrentPrevValue(def, container, handle = document.getElementById(def.handleId)) {
    const rect = container.getBoundingClientRect();
    const splitter = getSplitterSize(container);
    const total = def.axis === 'x' ? rect.width : rect.height;
    const { minPrev, maxPrev } = getFeasibleBounds(def, total, splitter);
    const storedCssValue = container.style.getPropertyValue(def.cssVar).trim();
    if (/^-?\d+(?:\.\d+)?px$/.test(storedCssValue)) {
        const storedValue = Number.parseFloat(storedCssValue);
        return clamp(getPrevValueFromStored(def, total, splitter, storedValue), minPrev, maxPrev);
    }

    if (handle) {
        const handleRect = handle.getBoundingClientRect();
        const geometricValue = def.axis === 'x'
            ? handleRect.left - rect.left
            : handleRect.top - rect.top;
        if (Number.isFinite(geometricValue) && (handleRect.width > 0 || handleRect.height > 0)) {
            return clamp(geometricValue, minPrev, maxPrev);
        }
    }

    return minPrev + ((maxPrev - minPrev) / 2);
}

function updateHandleAria(def, container, handle = document.getElementById(def.handleId)) {
    if (!handle) throw new Error(`Layout resize handle is missing: #${def.handleId}`);
    const rect = container.getBoundingClientRect();
    const splitter = getSplitterSize(container);
    const total = def.axis === 'x' ? rect.width : rect.height;
    const available = Math.max(0, total - splitter);
    const { minPrev, maxPrev } = getFeasibleBounds(def, total, splitter);
    const current = getCurrentPrevValue(def, container, handle);
    const asPercent = value => available > 0 ? Math.round((value / available) * 100) : 0;
    const minimum = asPercent(minPrev);
    const maximum = asPercent(maxPrev);
    const now = clamp(asPercent(current), minimum, maximum);
    const isUnavailable = window.matchMedia('(max-width: 1024px)').matches;

    handle.setAttribute('role', 'separator');
    handle.tabIndex = isUnavailable ? -1 : 0;
    handle.setAttribute('aria-disabled', String(isUnavailable));
    handle.setAttribute('aria-orientation', def.axis === 'x' ? 'vertical' : 'horizontal');
    handle.setAttribute('aria-label', `Resize ${def.beforeLabel} and ${def.afterLabel}`);
    handle.setAttribute('aria-valuemin', String(minimum));
    handle.setAttribute('aria-valuemax', String(maximum));
    handle.setAttribute('aria-valuenow', String(now));
    handle.setAttribute(
        'aria-valuetext',
        `${def.beforeLabel} ${now} percent; ${def.afterLabel} ${100 - now} percent`
    );
    handle.setAttribute(
        'aria-keyshortcuts',
        def.axis === 'x' ? 'ArrowLeft ArrowRight Home End' : 'ArrowUp ArrowDown Home End'
    );
}

function updateAllHandleAria() {
    RESIZER_DEFS.forEach(def => {
        const container = document.querySelector(def.containerSelector);
        if (!container) throw new Error(`Layout resize container is missing: ${def.containerSelector}`);
        updateHandleAria(def, container);
    });
}

function handleKeyboardResize(event, def, handle, container) {
    if (window.matchMedia('(max-width: 1024px)').matches) return;
    const decreaseKey = def.axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const increaseKey = def.axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (![decreaseKey, increaseKey, 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const splitter = getSplitterSize(container);
    const total = def.axis === 'x' ? rect.width : rect.height;
    const { minPrev, maxPrev } = getFeasibleBounds(def, total, splitter);
    const current = getCurrentPrevValue(def, container, handle);
    const step = event.shiftKey ? KEYBOARD_STEP * 3 : KEYBOARD_STEP;
    let nextValue = current;
    if (event.key === decreaseKey) nextValue -= step;
    else if (event.key === increaseKey) nextValue += step;
    else if (event.key === 'Home') nextValue = minPrev;
    else if (event.key === 'End') nextValue = maxPrev;

    applyValue(def, container, nextValue);
    clampAll();
    persistValues();
    updateAllHandleAria();
    window.dispatchEvent(new Event('autochair:layout-resized'));
}

function handlePointerMove(event) {
    if (!activeDrag) return;
    activeDrag.drags.forEach(({ def, container }) => {
        const rect = container.getBoundingClientRect();
        const splitter = getSplitterSize(container);

        if (def.axis === 'x') {
            const raw = event.clientX - rect.left - splitter / 2;
            applyValue(def, container, raw);
        } else {
            const raw = event.clientY - rect.top - splitter / 2;
            applyValue(def, container, raw);
        }
    });

    // Keep nested split values feasible while parent splits move.
    clampAll();
    window.dispatchEvent(new Event('autochair:layout-resized'));
}

function persistValues() {
    const payload = {};
    RESIZER_DEFS.forEach(def => {
        const container = document.querySelector(def.containerSelector);
        if (!container) return;
        const value = container.style.getPropertyValue(def.cssVar);
        if (value) {
            payload[def.cssVar] = value;
        }
    });
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.error('Failed to save layout split sizes:', err);
    }
}

function endDrag() {
    if (!activeDrag) return;
    activeDrag.drags.forEach(({ handle }) => handle.classList.remove('is-dragging'));
    document.body.classList.remove('resizing-panels');
    delete document.body.dataset.resizeAxis;
    activeDrag = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    persistValues();
    window.dispatchEvent(new Event('autochair:layout-resized'));
}

function startDrag(event, def, handle, container) {
    if (window.matchMedia('(max-width: 1024px)').matches) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    activeDrag = { drags: [{ def, handle, container }] };
    handle.classList.add('is-dragging');
    document.body.classList.add('resizing-panels');
    document.body.dataset.resizeAxis = def.axis;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
}

function loadPersistedValues() {
    let parsed = null;
    try {
        parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (err) {
        console.error('Failed to read saved layout split sizes:', err);
        parsed = {};
    }

    RESIZER_DEFS.forEach(def => {
        const value = parsed[def.cssVar];
        if (!value) return;
        const container = document.querySelector(def.containerSelector);
        if (!container) return;
        container.style.setProperty(def.cssVar, value);
    });
}

function clampAll() {
    if (window.matchMedia('(max-width: 1024px)').matches) return;
    RESIZER_DEFS.forEach(def => {
        const container = document.querySelector(def.containerSelector);
        if (!container) return;
        let value = Number.parseFloat(container.style.getPropertyValue(def.cssVar));

        if (!Number.isFinite(value)) return;
        const rect = container.getBoundingClientRect();
        const splitter = getSplitterSize(container);
        const total = def.axis === 'x' ? rect.width : rect.height;
        const prevValue = getPrevValueFromStored(def, total, splitter, value);
        applyValue(def, container, prevValue);
    });
}

/**
 * Initialize drag handles for layout panel splits.
 */
export function initLayoutResizers() {
    loadPersistedValues();
    RESIZER_DEFS.forEach(def => {
        const handle = document.getElementById(def.handleId);
        const container = document.querySelector(def.containerSelector);
        if (!handle) throw new Error(`Layout resize handle is missing: #${def.handleId}`);
        if (!container) throw new Error(`Layout resize container is missing: ${def.containerSelector}`);
        handle.addEventListener('pointerdown', (event) => startDrag(event, def, handle, container));
        handle.addEventListener('keydown', (event) => handleKeyboardResize(event, def, handle, container));
    });

    window.addEventListener('resize', () => {
        clampAll();
        updateAllHandleAria();
    });
    clampAll();
    updateAllHandleAria();
}
