/**
 * panel-swap.js - Drag panel headers to exchange layout slots
 */

const STORAGE_KEY = 'autochair_panel_order_v1';
const PANEL_DEFS = [
    { id: 'input', selector: '.input-box', label: 'Input' },
    { id: 'export', selector: '.export-box', label: 'Import / Export' },
    { id: 'overall-status', selector: '.overall-status-box', label: 'Agenda Status' },
    { id: 'tracker', selector: '.timeline-container', label: 'Tracker' },
    { id: 'current-status', selector: '.current-status-box', label: 'Current Status' },
    { id: 'staging', selector: '.staging-box', label: 'Staging' },
    { id: 'current-item', selector: '.current-item-box', label: 'Current Item' }
];

let slots = [];
let drag = null;
let moveMenu = null;
let moveMenuTrigger = null;
let moveMenuPanel = null;
let layoutAnnouncer = null;
let suppressedMoveButton = null;

function getPanelDef(panel) {
    return PANEL_DEFS.find(def => def.id === panel?.dataset.panelId) || null;
}

function getPanelLabel(panel) {
    return getPanelDef(panel)?.label || panel?.dataset.panelId || 'Panel';
}

function getSlotLabel(slotId) {
    return PANEL_DEFS.find(def => def.id === slotId)?.label || slotId;
}

function getPanelHeader(panel) {
    return [...panel.children].find(child => (
        child.classList.contains('box-header') || child.classList.contains('timeline-header')
    )) || null;
}

function saveOrder() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slots.map(slot => slot.panel.dataset.panelId)));
    } catch (error) {
        console.error('Failed to save panel order:', error);
    }
}

function insertPanel(slot, panel) {
    panel.classList.forEach(className => {
        if (className.startsWith('panel-slot-')) panel.classList.remove(className);
    });
    panel.classList.add(`panel-slot-${slot.id}`);
    slot.anchor.parentNode.insertBefore(panel, slot.anchor.nextSibling);
    slot.panel = panel;
}

function announceLayoutChange(message) {
    if (!layoutAnnouncer) return;
    layoutAnnouncer.textContent = '';
    requestAnimationFrame(() => {
        layoutAnnouncer.textContent = message;
    });
}

function syncMoveButtons() {
    slots.forEach(slot => {
        const button = slot.panel.querySelector('.panel-move-button');
        if (!button) return;
        const panelLabel = getPanelLabel(slot.panel);
        button.setAttribute(
            'aria-label',
            `Move ${panelLabel} panel; currently in the ${getSlotLabel(slot.id)} position`
        );
        button.title = `Move ${panelLabel} panel`;
    });
}

function swapPanels(source, target) {
    if (!source || !target || source === target) return false;
    const sourceSlot = slots.find(slot => slot.panel === source);
    const targetSlot = slots.find(slot => slot.panel === target);
    if (!sourceSlot || !targetSlot) {
        throw new Error('Cannot swap a panel whose layout slot is missing.');
    }

    const sourceLabel = getPanelLabel(source);
    const targetLabel = getPanelLabel(target);
    const destinationLabel = getSlotLabel(targetSlot.id);
    source.remove();
    target.remove();
    insertPanel(sourceSlot, target);
    insertPanel(targetSlot, source);
    saveOrder();
    syncMoveButtons();
    announceLayoutChange(
        `${sourceLabel} moved to the ${destinationLabel} position; ${targetLabel} moved to the ${getSlotLabel(sourceSlot.id)} position.`
    );
    window.dispatchEvent(new Event('autochair:layout-resized'));
    return true;
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

function closeMoveMenu({ restoreFocus = false } = {}) {
    if (!moveMenu || moveMenu.hidden) return;
    const trigger = moveMenuTrigger;
    moveMenu.hidden = true;
    moveMenu.replaceChildren();
    moveMenuTrigger?.setAttribute('aria-expanded', 'false');
    moveMenuTrigger = null;
    moveMenuPanel = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function positionMoveMenu(trigger) {
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = moveMenu.getBoundingClientRect();
    const gap = 5;
    const left = Math.max(8, Math.min(triggerRect.right - menuRect.width, window.innerWidth - menuRect.width - 8));
    const below = triggerRect.bottom + gap;
    const top = below + menuRect.height <= window.innerHeight - 8
        ? below
        : Math.max(8, triggerRect.top - menuRect.height - gap);
    moveMenu.style.left = `${Math.round(left)}px`;
    moveMenu.style.top = `${Math.round(top)}px`;
}

function focusRelativeMenuItem(direction) {
    if (!moveMenu) return;
    const items = [...moveMenu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + items.length) % items.length;
    items[nextIndex].focus();
}

function onMoveMenuKeyDown(event) {
    if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        closeMoveMenu({ restoreFocus: true });
        return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        focusRelativeMenuItem(1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        focusRelativeMenuItem(-1);
    } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const items = [...moveMenu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
}

function openMoveMenu(panel, trigger) {
    if (!moveMenu || !panel || !trigger) {
        throw new Error('Panel move controls are not initialized.');
    }
    if (!moveMenu.hidden && moveMenuTrigger === trigger) {
        closeMoveMenu({ restoreFocus: true });
        return;
    }
    closeMoveMenu();
    moveMenuPanel = panel;
    moveMenuTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    moveMenu.setAttribute('aria-label', `Move ${getPanelLabel(panel)} panel to`);

    const currentSlot = slots.find(slot => slot.panel === panel);
    if (!currentSlot) throw new Error('Cannot open move controls for a panel without a layout slot.');
    const options = slots.map(slot => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'panel-move-option';
        option.setAttribute('role', 'menuitem');
        option.dataset.slotId = slot.id;
        option.disabled = slot === currentSlot;
        option.textContent = `${getSlotLabel(slot.id)} position${slot === currentSlot ? ' (current)' : ''}`;
        option.addEventListener('click', () => {
            const target = slot.panel;
            const source = moveMenuPanel;
            closeMoveMenu();
            swapPanels(source, target);
            if (trigger.isConnected) trigger.focus();
        });
        return option;
    });
    moveMenu.replaceChildren(...options);
    moveMenu.hidden = false;
    positionMoveMenu(trigger);
    moveMenu.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
}

function addPanelMoveControl(panel) {
    const header = getPanelHeader(panel);
    if (!header) throw new Error(`Panel header is missing: ${getPanelLabel(panel)}`);
    header.classList.add('panel-customizable-header');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-move-button';
    button.dataset.panelMoveFor = panel.dataset.panelId;
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'panel-move-menu');
    button.innerHTML = '<span aria-hidden="true">&#8645;</span><span>Move</span>';
    button.addEventListener('click', event => {
        if (suppressedMoveButton === button) {
            event.preventDefault();
            return;
        }
        openMoveMenu(panel, button);
    });

    const trackerControls = header.querySelector(':scope > .timeline-controls');
    (trackerControls || header).appendChild(button);
}

function setupMoveMenu() {
    moveMenu = document.createElement('div');
    moveMenu.id = 'panel-move-menu';
    moveMenu.className = 'panel-move-menu';
    moveMenu.setAttribute('role', 'menu');
    moveMenu.hidden = true;
    moveMenu.addEventListener('keydown', onMoveMenuKeyDown);
    document.body.appendChild(moveMenu);

    layoutAnnouncer = document.createElement('div');
    layoutAnnouncer.className = 'visually-hidden panel-layout-announcer';
    layoutAnnouncer.setAttribute('role', 'status');
    layoutAnnouncer.setAttribute('aria-live', 'polite');
    document.body.appendChild(layoutAnnouncer);

    document.addEventListener('pointerdown', event => {
        if (moveMenu.hidden) return;
        if (moveMenu.contains(event.target) || moveMenuTrigger?.contains(event.target)) return;
        closeMoveMenu();
    });
    window.addEventListener('resize', () => closeMoveMenu());
    window.addEventListener('scroll', () => closeMoveMenu(), true);
}

function createGhost(panel, event) {
    const rect = panel.getBoundingClientRect();
    const ghost = panel.cloneNode(true);
    ghost.className = `${panel.className} panel-drag-ghost`;
    ghost.inert = true;
    ghost.setAttribute('aria-hidden', 'true');
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
    const { source, ghost, target, moveButton } = drag;
    const completedDrag = !!ghost;
    clearTarget();
    ghost?.remove();
    source.classList.remove('panel-swap-source');
    document.body.classList.remove('dragging-panel');

    if (target && event.type !== 'pointercancel') {
        swapPanels(source, target);
    }
    if (completedDrag && moveButton) {
        suppressedMoveButton = moveButton;
        setTimeout(() => {
            if (suppressedMoveButton === moveButton) suppressedMoveButton = null;
        }, 0);
    }
    drag = null;
}

function onPointerDown(event) {
    const moveButton = event.target.closest('.panel-move-button');
    const interactive = event.target.closest('button, input, select, textarea, a, [contenteditable="true"]');
    if (event.button !== 0 || (interactive && !moveButton)) return;
    const header = event.target.closest('.box-header, .timeline-header');
    const source = header?.closest('.box[data-panel-id]');
    if (!source) return;
    if (event.pointerType === 'touch' && !moveButton) return;
    drag = {
        source,
        header,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moveButton,
        ghost: null,
        target: null
    };
}

function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.ghost && distance < 5) return;
    if (!drag.ghost) {
        drag.header.setPointerCapture(event.pointerId);
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
    slots = PANEL_DEFS.map(def => {
        const panel = document.querySelector(def.selector);
        if (!panel) throw new Error(`Panel swap target is missing: ${def.selector}`);
        panel.dataset.panelId = def.id;
        panel.classList.add(`panel-slot-${def.id}`);
        const anchor = document.createComment(`panel-slot:${def.id}`);
        panel.parentNode.insertBefore(anchor, panel);
        return { id: def.id, anchor, panel };
    });
    applySavedOrder();
    setupMoveMenu();
    slots.forEach(slot => addPanelMoveControl(slot.panel));
    syncMoveButtons();

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', finishDrag);
    document.addEventListener('pointercancel', finishDrag);
    window.dispatchEvent(new Event('autochair:layout-resized'));
}
