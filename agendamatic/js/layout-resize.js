/**
 * layout-resize.js - Drag handles for resizing panel splits
 */

const STORAGE_KEY = 'autochair_layout_splits_v5';

const RESIZER_DEFS = [
    {
        handleId: 'resizer-main-top',
        axis: 'y',
        containerSelector: '.workspace-panels',
        cssVar: '--main-top-height',
        minPrev: 220,
        minNext: 300
    },
    {
        handleId: 'resizer-top-main',
        axis: 'x',
        containerSelector: '.top-section',
        cssVar: '--top-left-width',
        minPrev: 360,
        minNext: 280
    },
    {
        handleId: 'resizer-right-side',
        axis: 'x',
        containerSelector: '.right-side',
        cssVar: '--right-export-width',
        minPrev: 130,
        minNext: 200
    },
    {
        handleId: 'resizer-status-column',
        axis: 'y',
        containerSelector: '.status-column',
        cssVar: '--status-overall-height',
        minPrev: 140,
        minNext: 110
    },
    {
        handleId: 'resizer-next-controls',
        axis: 'x',
        containerSelector: '.next-item-controls',
        cssVar: '--next-prev-width',
        minPrev: 72,
        minNext: 130
    },
    {
        handleId: 'resizer-tracker',
        axis: 'x',
        containerSelector: '.tracker-section',
        cssVar: '--tracker-left-width',
        minPrev: 360,
        minNext: 260
    },
    {
        handleId: 'resizer-main-bottom',
        axis: 'y',
        containerSelector: '.lower-panels',
        cssVar: '--main-bottom-height',
        anchor: 'next',
        initFromSelector: '.bottom-section',
        minPrev: 120,
        minNext: 120
    },
    {
        handleId: 'resizer-bottom',
        axis: 'x',
        containerSelector: '.bottom-section',
        cssVar: '--bottom-left-width',
        minPrev: 320,
        minNext: 280
    }
];

const RESIZER_DEF_BY_ID = new Map(RESIZER_DEFS.map(def => [def.handleId, def]));
const CORNER_COUPLE_THRESHOLD = 24;
const CORNER_HIT_PADDING = 1;

let activeDrag = null;
let cornerPreview = null;

function getSplitterSize(container) {
    const raw = getComputedStyle(container).getPropertyValue('--splitter-size').trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 10;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
    return clamped;
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

function clearCornerPreview() {
    if (!cornerPreview) return;
    cornerPreview.handles.forEach(handle => handle.classList.remove('is-corner-ready'));
    (cornerPreview.corners || []).forEach(corner => corner.classList.remove('is-preview-active'));
    cornerPreview = null;
    document.body.classList.remove('corner-resize-preview');
}

function setCornerPreview(primaryHandle, coupledHandle, corners = []) {
    const handles = [primaryHandle, coupledHandle].filter(Boolean);
    if (!handles.length) {
        clearCornerPreview();
        return;
    }
    const uniqueHandles = [...new Set(handles)];
    const uniqueCorners = [...new Set(corners.filter(Boolean))];
    if (
        cornerPreview &&
        cornerPreview.handles.length === uniqueHandles.length &&
        uniqueHandles.every(handle => cornerPreview.handles.includes(handle)) &&
        cornerPreview.corners.length === uniqueCorners.length &&
        uniqueCorners.every(corner => cornerPreview.corners.includes(corner))
    ) {
        return;
    }
    clearCornerPreview();
    uniqueHandles.forEach(handle => handle.classList.add('is-corner-ready'));
    uniqueCorners.forEach(corner => corner.classList.add('is-preview-active'));
    cornerPreview = { handles: uniqueHandles, corners: uniqueCorners };
    document.body.classList.add('corner-resize-preview');
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
        // Ignore storage failures.
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
    refreshCornerCoupling();
    persistValues();
    window.dispatchEvent(new Event('autochair:layout-resized'));
}

function distancePointToRect(px, py, rect) {
    const dx = Math.max(rect.left - px, 0, px - rect.right);
    const dy = Math.max(rect.top - py, 0, py - rect.bottom);
    return Math.hypot(dx, dy);
}

function findCornerCoupledDragAtPoint(primaryDef, px, py) {
    let best = null;
    RESIZER_DEFS.forEach(def => {
        if (def.handleId === primaryDef.handleId) return;
        if (def.axis === primaryDef.axis) return;

        const handle = document.getElementById(def.handleId);
        const container = document.querySelector(def.containerSelector);
        if (!handle || !container) return;

        const dist = distancePointToRect(px, py, handle.getBoundingClientRect());
        if (dist > CORNER_COUPLE_THRESHOLD) return;
        if (!best || dist < best.dist) {
            best = { def, handle, container, dist };
        }
    });

    return best;
}

function getCoupledDragForCorner(def, corner) {
    if (!corner || !corner.classList.contains('is-coupled')) return null;
    const coupledHandleId = corner.dataset.coupledHandleId;
    if (!coupledHandleId) return null;
    const coupledDef = RESIZER_DEF_BY_ID.get(coupledHandleId);
    const coupledHandle = document.getElementById(coupledHandleId);
    const coupledContainer = coupledDef ? document.querySelector(coupledDef.containerSelector) : null;
    if (!coupledDef || !coupledHandle || !coupledContainer) return null;
    return { def: coupledDef, handle: coupledHandle, container: coupledContainer };
}

function getCornerEdgeAnchor(def, handleRect, corner) {
    const isStart = corner.classList.contains('corner-start');
    if (def.axis === 'x') {
        return {
            x: handleRect.left + (handleRect.width / 2),
            y: isStart ? handleRect.top : handleRect.bottom
        };
    }
    return {
        x: isStart ? handleRect.left : handleRect.right,
        y: handleRect.top + (handleRect.height / 2)
    };
}

function projectToCoupledIntersection(coupledDef, coupledRect, anchor) {
    if (coupledDef.axis === 'x') {
        return {
            x: coupledRect.left + (coupledRect.width / 2),
            y: anchor.y
        };
    }
    return {
        x: anchor.x,
        y: coupledRect.top + (coupledRect.height / 2)
    };
}

function findCornerCoupledDrag(primaryDef, handle, corner) {
    const handleRect = handle.getBoundingClientRect();
    const anchor = getCornerEdgeAnchor(primaryDef, handleRect, corner);
    return findCornerCoupledDragAtPoint(primaryDef, anchor.x, anchor.y);
}

function clearCornerPosition(corner) {
    corner.style.removeProperty('--corner-screen-x');
    corner.style.removeProperty('--corner-screen-y');
}

function positionCornerAtIntersection(corner, def, handle, coupled) {
    if (!coupled) {
        clearCornerPosition(corner);
        return;
    }

    const handleRect = handle.getBoundingClientRect();
    const coupledRect = coupled.handle.getBoundingClientRect();
    const anchor = getCornerEdgeAnchor(def, handleRect, corner);
    const target = projectToCoupledIntersection(coupled.def, coupledRect, anchor);
    corner.style.setProperty('--corner-screen-x', `${target.x.toFixed(2)}px`);
    corner.style.setProperty('--corner-screen-y', `${target.y.toFixed(2)}px`);
}

function refreshCornerCoupling() {
    document.querySelectorAll('.panel-corner').forEach(corner => {
        const handle = corner.closest('.panel-resizer');
        const def = handle ? RESIZER_DEF_BY_ID.get(handle.id) : null;
        if (!handle || !def) {
            corner.classList.add('is-inert');
            corner.classList.remove('is-coupled');
            delete corner.dataset.coupledHandleId;
            clearCornerPosition(corner);
            return;
        }
        const coupled = findCornerCoupledDrag(def, handle, corner);
        if (!coupled) {
            corner.classList.add('is-inert');
            corner.classList.remove('is-coupled');
            delete corner.dataset.coupledHandleId;
            clearCornerPosition(corner);
            return;
        }
        corner.classList.remove('is-inert');
        corner.classList.add('is-coupled');
        corner.dataset.coupledHandleId = coupled.handle.id;
        positionCornerAtIntersection(corner, def, handle, coupled);
    });
    clearCornerPreview();
}

function isPointWithinRect(clientX, clientY, rect, padding = 0) {
    return (
        clientX >= (rect.left - padding) &&
        clientX <= (rect.right + padding) &&
        clientY >= (rect.top - padding) &&
        clientY <= (rect.bottom + padding)
    );
}

function findCornerAtPointer(handle, clientX, clientY) {
    let match = null;
    handle.querySelectorAll('.panel-corner.is-coupled').forEach(corner => {
        if (match) return;
        const rect = corner.getBoundingClientRect();
        if (isPointWithinRect(clientX, clientY, rect, CORNER_HIT_PADDING)) {
            match = corner;
        }
    });
    return match;
}

function findGlobalCornerAtPointer(clientX, clientY) {
    let match = null;
    document.querySelectorAll('.panel-corner.is-coupled').forEach(corner => {
        if (match) return;
        const rect = corner.getBoundingClientRect();
        if (isPointWithinRect(clientX, clientY, rect, CORNER_HIT_PADDING)) {
            match = corner;
        }
    });
    return match;
}

function findClosestCornerOnHandle(handle, targetX, targetY) {
    let best = null;
    handle.querySelectorAll('.panel-corner.is-coupled').forEach(corner => {
        const rect = corner.getBoundingClientRect();
        const cx = rect.left + (rect.width / 2);
        const cy = rect.top + (rect.height / 2);
        const dist = Math.hypot(cx - targetX, cy - targetY);
        if (!best || dist < best.dist) {
            best = { corner, dist };
        }
    });
    return best ? best.corner : null;
}

function resolveCornerFromPointer(event, handle) {
    const directCorner = event.target instanceof Element ? event.target.closest('.panel-corner.is-coupled') : null;
    if (directCorner && handle.contains(directCorner)) {
        return directCorner;
    }
    return findCornerAtPointer(handle, event.clientX, event.clientY);
}

function updateCornerPreviewFromPointer(event, def, handle) {
    if (activeDrag) return;
    const corner = resolveCornerFromPointer(event, handle);
    if (!corner) {
        if (cornerPreview && cornerPreview.handles.includes(handle)) {
            clearCornerPreview();
        }
        return;
    }
    const coupled = getCoupledDragForCorner(def, corner);
    if (!coupled) {
        clearCornerPreview();
        return;
    }
    const rect = corner.getBoundingClientRect();
    const cx = rect.left + (rect.width / 2);
    const cy = rect.top + (rect.height / 2);
    const coupledCorner = findClosestCornerOnHandle(coupled.handle, cx, cy);
    setCornerPreview(handle, coupled.handle, [corner, coupledCorner]);
}

function startDrag(event, def, handle, container) {
    if (window.matchMedia('(max-width: 768px)').matches) return;
    event.preventDefault();
    clearCornerPreview();

    let primaryDef = def;
    let primaryHandle = handle;
    let primaryContainer = container;
    let corner = findGlobalCornerAtPointer(event.clientX, event.clientY);

    if (corner) {
        const owningHandle = corner.closest('.panel-resizer');
        const owningDef = owningHandle ? RESIZER_DEF_BY_ID.get(owningHandle.id) : null;
        const owningContainer = owningDef ? document.querySelector(owningDef.containerSelector) : null;
        if (owningHandle && owningDef && owningContainer) {
            primaryDef = owningDef;
            primaryHandle = owningHandle;
            primaryContainer = owningContainer;
        } else {
            corner = null;
        }
    }

    if (!corner) {
        corner = resolveCornerFromPointer(event, handle);
    }

    const drags = [{ def: primaryDef, handle: primaryHandle, container: primaryContainer }];
    if (corner) {
        const coupled = getCoupledDragForCorner(primaryDef, corner);
        if (coupled && !drags.some(d => d.handle === coupled.handle)) {
            drags.push({ def: coupled.def, handle: coupled.handle, container: coupled.container });
        }
    }

    activeDrag = { drags };
    drags.forEach(({ handle: dragHandle }) => dragHandle.classList.add('is-dragging'));
    document.body.classList.add('resizing-panels');
    const axisSet = new Set(drags.map(d => d.def.axis));
    document.body.dataset.resizeAxis = axisSet.size > 1 ? 'xy' : primaryDef.axis;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
}

function loadPersistedValues() {
    let parsed = null;
    try {
        parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (err) {
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
    RESIZER_DEFS.forEach(def => {
        const container = document.querySelector(def.containerSelector);
        if (!container) return;
        let value = Number.parseFloat(container.style.getPropertyValue(def.cssVar));

        if (!Number.isFinite(value) && def.anchor === 'next' && def.initFromSelector) {
            const initEl = container.querySelector(def.initFromSelector);
            if (initEl) {
                const size = def.axis === 'x'
                    ? initEl.getBoundingClientRect().width
                    : initEl.getBoundingClientRect().height;
                container.style.setProperty(def.cssVar, `${Math.round(size)}px`);
                value = Number.parseFloat(container.style.getPropertyValue(def.cssVar));
            }
        }

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
        if (!handle || !container) return;
        handle.addEventListener('pointerdown', (event) => startDrag(event, def, handle, container));
        handle.addEventListener('pointermove', (event) => updateCornerPreviewFromPointer(event, def, handle));
        handle.addEventListener('pointerleave', () => {
            if (cornerPreview && cornerPreview.handles.includes(handle)) {
                clearCornerPreview();
            }
        });
    });

    window.addEventListener('resize', () => {
        clampAll();
        refreshCornerCoupling();
    });
    clampAll();
    refreshCornerCoupling();
}
