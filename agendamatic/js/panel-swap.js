/**
 * panel-swap.js - Drag panel headers to exchange layout slots
 */

const STORAGE_KEY = 'autochair_panel_order_v1';
const PANEL_SELECTORS = [
    ['input', '.input-box'],
    ['export', '.export-box'],
    ['overall-status', '.overall-status-box'],
    ['tracker', '.timeline-container'],
    ['current-status', '.current-status-box'],
    ['staging', '.staging-box'],
    ['current-item', '.current-item-box']
];

let slots = [];
let drag = null;

function saveOrder() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots.map(slot => slot.panel.dataset.panelId)));
}

function insertPanel(slot, panel) {
    panel.classList.forEach(className => {
        if (className.startsWith('panel-slot-')) panel.classList.remove(className);
    });
    panel.classList.add(`panel-slot-${slot.id}`);
    slot.anchor.parentNode.insertBefore(panel, slot.anchor.nextSibling);
    slot.panel = panel;
}

function applySavedOrder() {
    let order;
    try {
        order = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
        console.error('Failed to read saved panel order:', error);
        return;
    }
    if (!Array.isArray(order) || order.length !== slots.length) return;
    const panels = new Map(slots.map(slot => [slot.panel.dataset.panelId, slot.panel]));
    if (order.some(id => !panels.has(id)) || new Set(order).size !== slots.length) return;
    slots.forEach(slot => slot.panel.remove());
    slots.forEach((slot, index) => insertPanel(slot, panels.get(order[index])));
}

function createGhost(panel, event) {
    const rect = panel.getBoundingClientRect();
    const ghost = panel.cloneNode(true);
    ghost.className = `${panel.className} panel-drag-ghost`;
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    positionGhost(ghost, event);
    return ghost;
}

function positionGhost(ghost, event) {
    ghost.style.left = `${event.clientX + 14}px`;
    ghost.style.top = `${event.clientY + 14}px`;
}

function findTarget(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const panel = element?.closest('.box[data-panel-id]');
    return panel && panel !== drag.source ? panel : null;
}

function clearTarget() {
    drag?.target?.classList.remove('panel-swap-target');
    if (drag) drag.target = null;
}

function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { source, ghost, target } = drag;
    clearTarget();
    ghost?.remove();
    source.classList.remove('panel-swap-source');
    document.body.classList.remove('dragging-panel');

    if (target) {
        const sourceSlot = slots.find(slot => slot.panel === source);
        const targetSlot = slots.find(slot => slot.panel === target);
        source.remove();
        target.remove();
        insertPanel(sourceSlot, target);
        insertPanel(targetSlot, source);
        saveOrder();
        window.dispatchEvent(new Event('resize'));
    }
    drag = null;
}

function onPointerDown(event) {
    if (event.button !== 0 || event.target.closest('button, input, select, textarea, a, [contenteditable="true"]')) return;
    const header = event.target.closest('.box-header');
    const source = header?.closest('.box[data-panel-id]');
    if (!source) return;
    header.setPointerCapture(event.pointerId);
    drag = {
        source,
        header,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        ghost: null,
        target: null
    };
}

function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.ghost && distance < 5) return;
    if (!drag.ghost) {
        drag.ghost = createGhost(drag.source, event);
        drag.source.classList.add('panel-swap-source');
        document.body.classList.add('dragging-panel');
    } else {
        positionGhost(drag.ghost, event);
    }
    const target = findTarget(event);
    if (target !== drag.target) {
        clearTarget();
        drag.target = target;
        target?.classList.add('panel-swap-target');
    }
    event.preventDefault();
}

export function initPanelSwaps() {
    slots = PANEL_SELECTORS.map(([id, selector]) => {
        const panel = document.querySelector(selector);
        if (!panel) throw new Error(`Panel swap target is missing: ${selector}`);
        panel.dataset.panelId = id;
        panel.classList.add(`panel-slot-${id}`);
        const anchor = document.createComment(`panel-slot:${id}`);
        panel.parentNode.insertBefore(anchor, panel);
        return { id, anchor, panel };
    });
    applySavedOrder();

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', finishDrag);
    document.addEventListener('pointercancel', finishDrag);
}
