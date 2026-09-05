/**
 * agenda.js - Agenda list DOM manipulation, CRUD operations, and drag-drop
 */

import {
    getState,
    subscribe,
    addItem,
    deleteItem,
    updateItem,
    updateIntervalTime,
    reorderItems,
    stageItem,
    unstageItem,
    calculateIntervals,
    getExpectedVsActualData
} from './state.js';
import {
    formatTime,
    formatTimeValue,
    addMinutes,
    debounce,
    parseDuration,
    formatDuration,
    applyMarkdownAction,
    focusAfterTransition,
    setGlobalDragCursor
} from './utils.js';
import {
    applyItemColorStyles,
    getItemColor,
    openColorPicker,
    parseItemColor
} from './colors.js';
import { showNotification } from './export.js';

let container = null;
let draggedElement = null;
let draggedIndex = null;
let lastIndicatorIndex = null; // Track last indicator position to avoid showing when item stays in place

// Modal elements
let notesModal = null;
let modalTitle = null;
let editorTextarea = null;
let contextTextarea = null;
let prepTextarea = null;
let currentEditingItem = null;
let notesReturnFocus = null;

/**
 * Initialize the agenda module
 * @param {HTMLElement} containerElement - The agenda container element
 */
export function initAgenda(containerElement) {
    container = containerElement;

    // Get modal elements
    notesModal = document.getElementById('notes-modal');
    modalTitle = document.getElementById('modal-title');
    editorTextarea = document.getElementById('editor-textarea');
    contextTextarea = document.getElementById('editor-context');
    prepTextarea = document.getElementById('editor-prep');

    // Set up modal event listeners
    setupModalListeners();

    // Set up container-level drag events
    setupContainerDragEvents();

    // Subscribe to state changes
    subscribe(renderAgenda);

    // Initial render
    renderAgenda(getState());
}

/**
 * Set up modal event listeners
 */
function setupModalListeners() {
    const closeBtn = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('modal-cancel');
    const saveBtn = document.getElementById('modal-save');
    const toolbar = notesModal?.querySelector('.editor-toolbar');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeNotesModal);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeNotesModal);
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', saveNotes);
    }

    // Close on overlay click
    if (notesModal) {
        notesModal.addEventListener('click', (e) => {
            if (e.target === notesModal) {
                closeNotesModal();
            }
        });
    }

    // Toolbar button actions
    if (toolbar) {
        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const action = btn.dataset.action;
            applyMarkdownAction(editorTextarea, action);
        });
    }

    // Keyboard shortcuts in editor
    if (editorTextarea) {
        editorTextarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'b') {
                    e.preventDefault();
                    applyMarkdownAction(editorTextarea, 'bold');
                } else if (e.key === 'i') {
                    e.preventDefault();
                    applyMarkdownAction(editorTextarea, 'italic');
                } else if (e.key === 's') {
                    e.preventDefault();
                    saveNotes();
                }
            }
        });
    }

    document.addEventListener('keydown', handleNotesModalKeydown);
}

function getModalFocusableElements(modalElement) {
    return [...modalElement.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
}

function handleNotesModalKeydown(event) {
    if (!notesModal?.classList.contains('visible')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeNotesModal();
        return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getModalFocusableElements(notesModal);
    if (focusable.length === 0) {
        event.preventDefault();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !notesModal.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !notesModal.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
    }
}

function findAgendaRowControl(itemId, selector) {
    return [...(container?.querySelectorAll('.agenda-row') || [])]
        .find(row => row.dataset.id === itemId)
        ?.querySelector(selector) || null;
}

/**
 * Open the notes modal for an item
 * @param {Object} item - Item to edit notes for
 */
export function openNotesModal(item, trigger = document.activeElement) {
    if (!notesModal || !editorTextarea || !contextTextarea || !prepTextarea || !modalTitle) return;

    currentEditingItem = item;
    notesReturnFocus = trigger instanceof HTMLElement ? trigger : null;
    modalTitle.textContent = `Item details: ${item.name}`;
    contextTextarea.value = item.context || '';
    editorTextarea.value = item.notes || '';
    prepTextarea.value = item.prep || '';

    notesModal.classList.add('visible');
    notesModal.setAttribute('aria-hidden', 'false');
    focusAfterTransition(notesModal, () => editorTextarea);
}

/**
 * Close the notes modal
 */
function closeNotesModal() {
    if (!notesModal) return;

    const itemId = currentEditingItem?.id;
    const returnFocus = notesReturnFocus;
    notesModal.classList.remove('visible');
    notesModal.setAttribute('aria-hidden', 'true');
    currentEditingItem = null;
    notesReturnFocus = null;

    requestAnimationFrame(() => {
        const focusTarget = returnFocus?.isConnected
            ? returnFocus
            : findAgendaRowControl(itemId, '[data-action="notes"]');
        focusTarget?.focus({ preventScroll: true });
    });
}

/**
 * Save notes from modal
 */
function saveNotes() {
    if (!currentEditingItem || !editorTextarea || !contextTextarea || !prepTextarea) return;

    updateItem(currentEditingItem.id, {
        context: contextTextarea.value,
        notes: editorTextarea.value,
        prep: prepTextarea.value
    });
    closeNotesModal();
}

/**
 * Set up container-level drag events for better drop zone detection
 */
function setupContainerDragEvents() {
    if (!container) return;

    container.addEventListener('dragover', (e) => {
        const source = e.dataTransfer?.getData('application/x-agenda-source') || document.body.dataset.dragSource;
        if (!source) return;
        e.preventDefault();

        const rows = [...container.querySelectorAll('.agenda-row:not(.dragging)')];
        const afterElement = getDragAfterElement(rows, e.clientY);

        // Calculate what the target index would be
        let targetIndex;
        if (afterElement) {
            targetIndex = parseInt(afterElement.dataset.index, 10);
            // Adjust if dragging from before to after
            if (source === 'agenda' && draggedIndex !== null && draggedIndex < targetIndex) {
                targetIndex--;
            }
        } else {
            targetIndex = getState().items.length;
        }

        // Clear all indicators
        rows.forEach(row => {
            row.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        container.classList.remove('drag-over-end');

        // Only show indicator if item would actually move to a different position
        if (targetIndex !== draggedIndex) {
            if (afterElement) {
                // Show indicator above the target element
                afterElement.classList.add('drag-over-top');
            } else {
                // Dropping at the end
                const lastRow = rows[rows.length - 1];
                if (lastRow) {
                    lastRow.classList.add('drag-over-bottom');
                } else {
                    container.classList.add('drag-over-end');
                }
            }
        }
    });

    container.addEventListener('dragleave', (e) => {
        // Only clear if leaving the container entirely
        if (!container.contains(e.relatedTarget)) {
            clearDragIndicators();
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDragIndicators();

        const source = e.dataTransfer?.getData('application/x-agenda-source') || document.body.dataset.dragSource;
        const itemId = e.dataTransfer?.getData('text/plain') || document.body.dataset.dragItemId;
        if (!source || !itemId) return;

        const rows = [...container.querySelectorAll('.agenda-row:not(.dragging)')];
        const afterElement = getDragAfterElement(rows, e.clientY);

        let targetIndex;
        if (afterElement) {
            targetIndex = parseInt(afterElement.dataset.index, 10);
            // Adjust if dragging from before to after
            if (source === 'agenda' && draggedIndex !== null && draggedIndex < targetIndex) {
                targetIndex--;
            }
        } else {
            targetIndex = getState().items.length;
        }

        if (source === 'agenda') {
            const fromIndex = draggedIndex !== null
                ? draggedIndex
                : getState().items.findIndex(item => item.id === itemId);
            if (fromIndex >= 0 && fromIndex !== targetIndex) {
                reorderItems(fromIndex, targetIndex);
            }
            return;
        }

        if (source === 'staging') {
            unstageItem(itemId, targetIndex);
        }
    });
}

/**
 * Clear all drag indicators
 */
function clearDragIndicators() {
    if (!container) return;
    container.querySelectorAll('.agenda-row').forEach(row => {
        row.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    container.classList.remove('drag-over-end');
}

/**
 * Get the element to insert after based on mouse Y position
 * @param {Array} elements - Array of row elements
 * @param {number} y - Mouse Y position
 * @returns {HTMLElement|null} Element to insert after, or null for end
 */
function getDragAfterElement(elements, y) {
    return elements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/**
 * Render the entire agenda list
 * @param {Object} state - Current state
 */
export function renderAgenda(state) {
    if (!container) return;

    const activeInput = document.activeElement?.closest?.('.agenda-row input[data-field]');
    const activeInputState = activeInput ? {
        itemId: activeInput.closest('.agenda-row')?.dataset.id,
        field: activeInput.dataset.field,
        selectionStart: activeInput.selectionStart,
        selectionEnd: activeInput.selectionEnd
    } : null;

    const itemsWithIntervals = calculateIntervals();
    const varianceData = getExpectedVsActualData();
    const varianceMode = !!varianceData;
    const varianceById = varianceData?.byId || {};

    renderAgendaHeader(varianceMode);

    const existingRows = new Map([...container.querySelectorAll('.agenda-row')]
        .map(row => [row.dataset.id, row]));

    // Render each item
    itemsWithIntervals.forEach((item, index) => {
        const row = createAgendaRow(item, index, varianceMode, varianceById[item.id] || null);
        const existing = existingRows.get(item.id);
        if (existing) {
            syncRowElement(existing, row);
            existingRows.delete(item.id);
        }
        const target = existing || row;
        const position = container.querySelectorAll('.agenda-row')[index];
        if (position !== target) container.insertBefore(target, position || null);
    });
    existingRows.forEach(row => row.remove());

    if (activeInputState?.itemId && activeInputState.field) {
        const restored = [...container.querySelectorAll('.agenda-row')]
            .find(row => row.dataset.id === activeInputState.itemId)
            ?.querySelector(`input[data-field="${activeInputState.field}"]`);
        if (restored) {
            restored.focus({ preventScroll: true });
            if (['text', 'search', 'tel', 'url', 'password'].includes(restored.type)) {
                restored.setSelectionRange(activeInputState.selectionStart, activeInputState.selectionEnd);
            }
        }
    }
}

// Keep controls connected so browser editing history and pending clicks survive updates.
function syncRowElement(target, source) {
    for (const attribute of [...target.attributes]) {
        if (!source.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
    }
    for (const attribute of source.attributes) target.setAttribute(attribute.name, attribute.value);
    if (target instanceof HTMLInputElement) {
        if (document.activeElement !== target && target.value !== source.value) target.value = source.value;
        target.checked = source.checked;
        return;
    }
    const children = [...source.childNodes];
    children.forEach((child, index) => {
        const current = target.childNodes[index];
        if (!current || current.nodeName !== child.nodeName) {
            if (current) current.replaceWith(child);
            else target.appendChild(child);
        } else if (child.nodeType === Node.TEXT_NODE) {
            if (current.textContent !== child.textContent) current.textContent = child.textContent;
        } else {
            syncRowElement(current, child);
        }
    });
    while (target.childNodes.length > children.length) target.lastChild.remove();
}

function renderAgendaHeader(varianceMode) {
    const header = document.querySelector('.agenda-header');
    if (!header) return;

    header.classList.toggle('variance-grid', varianceMode);
    if (varianceMode) {
        header.innerHTML = `
            <div></div>
            <div><button type="button" class="bulk-column-button" data-bulk-field="name">Item</button></div>
            <div><button type="button" class="bulk-column-button" data-bulk-field="lead">Lead</button></div>
            <div><button type="button" class="bulk-column-button" data-bulk-field="themeColor">Color</button></div>
            <div class="header-split"><button type="button" class="bulk-column-button header-main" data-bulk-field="duration">Duration</button><span class="header-sub">Expected</span></div>
            <div class="header-split"><span class="header-main">Duration</span><span class="header-sub">Actual</span></div>
            <div class="header-split"><span class="header-main">Time</span><span class="header-sub">Expected</span></div>
            <div class="header-split"><span class="header-main">Time</span><span class="header-sub">Actual</span></div>
            <div class="header-split"><span class="header-main">Difference</span><span class="header-sub">Actual-Expected</span></div>
            <div><button type="button" class="bulk-column-button" data-bulk-field="locked" data-tooltip="Bulk edit locked items" aria-label="Bulk edit Locked">&#128274;</button></div>
            <div><button type="button" class="bulk-column-button" data-bulk-field="notes" data-tooltip="Bulk edit item notes" aria-label="Bulk edit Notes">&#128221;</button></div>
            <div></div>
        `;
        return;
    }

    header.innerHTML = `
        <div></div>
        <div><button type="button" class="bulk-column-button" data-bulk-field="name">Item</button></div>
        <div><button type="button" class="bulk-column-button" data-bulk-field="lead">Lead</button></div>
        <div><button type="button" class="bulk-column-button" data-bulk-field="themeColor">Color</button></div>
        <div><button type="button" class="bulk-column-button" data-bulk-field="duration">Duration</button></div>
        <div>Time</div>
        <div><button type="button" class="bulk-column-button" data-bulk-field="locked" data-tooltip="Bulk edit locked items" aria-label="Bulk edit Locked">&#128274;</button></div>
        <div><button type="button" class="bulk-column-button" data-bulk-field="notes" data-tooltip="Bulk edit item notes" aria-label="Bulk edit Notes">&#128221;</button></div>
        <div></div>
    `;
}

/**
 * Create a single agenda row element
 * @param {Object} item - Agenda item with calculated times
 * @param {number} index - Item index
 * @returns {HTMLElement} Row element
 */
function createAgendaRow(item, index, varianceMode, varianceRow) {
    const row = document.createElement('div');
    row.className = `agenda-grid agenda-row theme-${item.themeNumber}`;
    applyItemColorStyles(row, item);
    if (varianceMode) {
        row.classList.add('variance-grid');
    }
    row.draggable = true;
    row.dataset.id = item.id;
    row.dataset.index = index;

    // Grip handle
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'grip';
    grip.innerHTML = '&#8942;&#8942;';
    grip.setAttribute('data-tooltip', 'Drag to reorder this agenda item');
    grip.setAttribute('aria-label', `Reorder ${item.name}; use the up and down arrow keys`);
    grip.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = item.name;
    nameInput.dataset.field = 'name';
    nameInput.placeholder = 'Item name';
    nameInput.setAttribute('data-tooltip', 'Enter the agenda item title');
    nameInput.setAttribute('aria-label', `Agenda item name: ${item.name}`);

    // Lead input
    const leadInput = document.createElement('input');
    leadInput.type = 'text';
    leadInput.value = item.lead;
    leadInput.dataset.field = 'lead';
    leadInput.placeholder = 'Lead';
    leadInput.setAttribute('data-tooltip', 'Who is leading this agenda item');
    leadInput.setAttribute('aria-label', `Lead for ${item.name}`);

    const colorButton = document.createElement('button');
    colorButton.type = 'button';
    colorButton.className = 'agenda-color-button';
    colorButton.dataset.field = 'themeColor';
    const itemColor = getItemColor(item, index);
    colorButton.setAttribute('aria-label', `Choose color for ${item.name}; current color ${itemColor}`);
    colorButton.setAttribute('aria-haspopup', 'dialog');
    colorButton.setAttribute('data-tooltip', 'Choose a custom item hue and saturation');
    const colorSwatch = document.createElement('span');
    colorSwatch.className = 'agenda-color-swatch';
    colorSwatch.style.backgroundColor = itemColor;
    colorSwatch.setAttribute('aria-hidden', 'true');
    colorButton.appendChild(colorSwatch);

    // Duration input with time spinner
    const durationWrapper = document.createElement('div');
    durationWrapper.className = 'time-input-wrapper';

    const durationInput = document.createElement('input');
    durationInput.type = 'text';
    durationInput.value = item.duration;
    durationInput.dataset.field = 'duration';
    durationInput.placeholder = '10m';
    durationInput.setAttribute('data-tooltip', 'Duration (e.g., 5m, 1h) - scroll to adjust');
    durationInput.setAttribute('aria-label', `Duration for ${item.name}`);

    const durationSpinner = document.createElement('div');
    durationSpinner.className = 'time-spinner';
    const durationUp = document.createElement('button');
    durationUp.type = 'button';
    durationUp.dataset.action = 'duration-up';
    durationUp.innerHTML = '&#9650;';
    durationUp.setAttribute('aria-label', `Increase duration for ${item.name}`);
    const durationDown = document.createElement('button');
    durationDown.type = 'button';
    durationDown.dataset.action = 'duration-down';
    durationDown.innerHTML = '&#9660;';
    durationDown.setAttribute('aria-label', `Decrease duration for ${item.name}`);
    durationSpinner.append(durationUp, durationDown);

    durationWrapper.appendChild(durationInput);
    durationWrapper.appendChild(durationSpinner);

    // Interval display
    const intervalSpan = document.createElement('span');
    intervalSpan.className = 'interval';

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'interval-time-btn interval-start-btn';
    startBtn.textContent = formatTime(item.startTime);
    startBtn.dataset.position = 'start';
    startBtn.dataset.index = index.toString();
    startBtn.setAttribute('data-tooltip', 'Click to change start time');
    startBtn.setAttribute('aria-label', `Change start time for ${item.name}, currently ${startBtn.textContent}`);

    const separator = document.createElement('span');
    separator.className = 'interval-separator';
    separator.textContent = '-';

    const endBtn = document.createElement('button');
    endBtn.type = 'button';
    endBtn.className = 'interval-time-btn interval-end-btn';
    endBtn.textContent = formatTime(item.endTime);
    endBtn.dataset.position = 'end';
    endBtn.dataset.index = index.toString();
    endBtn.setAttribute('data-tooltip', 'Click to change end time');
    endBtn.setAttribute('aria-label', `Change end time for ${item.name}, currently ${endBtn.textContent}`);

    intervalSpan.appendChild(startBtn);
    intervalSpan.appendChild(separator);
    intervalSpan.appendChild(endBtn);

    intervalSpan.setAttribute('data-tooltip', 'Calculated time slot based on duration');

    let expectedDurationCell = null;
    let expectedIntervalCell = null;
    let differenceCell = null;
    if (varianceMode) {
        expectedDurationCell = document.createElement('span');
        expectedDurationCell.className = 'agenda-static-cell duration-expected-cell';
        expectedDurationCell.textContent = varianceRow?.expectedDurationMinutes === null || varianceRow?.expectedDurationMinutes === undefined
            ? '-'
            : formatDuration(varianceRow.expectedDurationMinutes);
        expectedDurationCell.setAttribute('data-tooltip', 'Original planned duration');

        expectedIntervalCell = document.createElement('span');
        expectedIntervalCell.className = 'interval interval-expected-cell';
        expectedIntervalCell.textContent = varianceRow?.expected
            ? `${formatTime(varianceRow.expected.startTime)}-${formatTime(varianceRow.expected.endTime)}`
            : '-';
        expectedIntervalCell.setAttribute('data-tooltip', 'Original planned time interval');

        differenceCell = document.createElement('span');
        differenceCell.className = 'agenda-static-cell difference-cell';
        const diff = varianceRow?.durationDifferenceMinutes;
        if (diff === null || diff === undefined) {
            differenceCell.textContent = '-';
        } else {
            differenceCell.textContent = `${diff > 0 ? '+' : ''}${diff}m`;
            if (diff > 0) {
                differenceCell.classList.add('positive');
            } else if (diff < 0) {
                differenceCell.classList.add('negative');
            } else {
                differenceCell.classList.add('neutral');
            }
        }
        differenceCell.setAttribute('data-tooltip', 'Actual duration minus expected duration');
    }

    // Lock checkbox
    const lockCheckbox = document.createElement('input');
    lockCheckbox.type = 'checkbox';
    lockCheckbox.checked = item.locked;
    lockCheckbox.dataset.field = 'locked';
    lockCheckbox.setAttribute('data-tooltip', 'Lock this item\'s duration (won\'t shrink/stretch when running late)');
    lockCheckbox.setAttribute('aria-label', `Lock duration for ${item.name}`);

    // Notes button
    const notesBtn = document.createElement('button');
    notesBtn.type = 'button';
    notesBtn.className = 'btn-icon';
    notesBtn.innerHTML = '&#128221;';
    notesBtn.dataset.action = 'notes';
    notesBtn.setAttribute('data-tooltip', 'Click to edit notes for this item');
    notesBtn.setAttribute('aria-label', `Edit notes for ${item.name}`);

    const stageBtn = document.createElement('button');
    stageBtn.type = 'button';
    stageBtn.className = 'btn-stage';
    stageBtn.textContent = '↓';
    stageBtn.dataset.action = 'stage';
    stageBtn.setAttribute('aria-label', `Move ${item.name} to staging`);
    stageBtn.setAttribute('data-tooltip', 'Move this item to staging');

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-delete';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.dataset.action = 'delete';
    deleteBtn.setAttribute('data-tooltip', 'Remove this agenda item');
    deleteBtn.setAttribute('aria-label', `Delete ${item.name}`);

    const rowActions = document.createElement('div');
    rowActions.className = 'agenda-row-actions';
    rowActions.append(stageBtn, deleteBtn);

    // Append all elements
    row.appendChild(grip);
    row.appendChild(nameInput);
    row.appendChild(leadInput);
    row.appendChild(colorButton);
    if (varianceMode) {
        row.appendChild(expectedDurationCell);
        row.appendChild(durationWrapper);
        row.appendChild(expectedIntervalCell);
        row.appendChild(intervalSpan);
        row.appendChild(differenceCell);
    } else {
        row.appendChild(durationWrapper);
        row.appendChild(intervalSpan);
    }
    row.appendChild(lockCheckbox);
    row.appendChild(notesBtn);
    row.appendChild(rowActions);

    // Add event listeners
    setupRowEventListeners(row, item);

    return row;
}

/**
 * Set up event listeners for a row
 * @param {HTMLElement} row - Row element
 * @param {Object} item - Item data
 */
function setupRowEventListeners(row, item) {
    const currentItem = () => getState().items.find(entry => entry.id === item.id) || item;
    // Input changes with debouncing
    const debouncedUpdate = debounce((field, value) => {
        updateItem(item.id, { [field]: value });
    }, 300);

    row.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('input', (e) => {
            if (input.dataset.field !== 'duration') debouncedUpdate(e.target.dataset.field, e.target.value);
        });

        input.addEventListener('blur', (e) => {
            // Immediate update on blur
            debouncedUpdate.cancel();
            if (input.dataset.field === 'duration') {
                const minutes = parseDuration(input.value);
                if (!Number.isFinite(minutes) || Math.round(minutes * 10) <= 0 || minutes > 525600) {
                    showNotification('Enter a positive duration such as 5m, 2.5m, or 1h30m.', 'warning');
                    input.value = currentItem().duration;
                    return;
                }
                input.value = formatDuration(minutes);
            }
            updateItem(item.id, { [e.target.dataset.field]: e.target.value });
        });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') input.blur();
        });

        // Scroll wheel for duration
        if (input.dataset.field === 'duration') {
            input.addEventListener('wheel', (e) => {
                e.preventDefault();
                adjustDuration(item, e.deltaY < 0 ? 5 : -5);
            });
        }
    });

    const colorButton = row.querySelector('.agenda-color-button');
    if (colorButton) {
        colorButton.addEventListener('click', () => {
            openColorPicker({
                color: getItemColor(currentItem()),
                itemName: currentItem().name,
                trigger: colorButton,
                onApply: selectedColor => {
                    updateItem(item.id, parseItemColor(selectedColor));
                    requestAnimationFrame(() => {
                        findAgendaRowControl(item.id, '.agenda-color-button')?.focus({ preventScroll: true });
                    });
                }
            });
        });
    }

    // Duration spinner buttons
    row.querySelectorAll('.time-spinner button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            if (action === 'duration-up') {
                adjustDuration(item, 5);
            } else if (action === 'duration-down') {
                adjustDuration(item, -5);
            }
            requestAnimationFrame(() => {
                findAgendaRowControl(item.id, `[data-action="${action}"]`)?.focus({ preventScroll: true });
            });
        });
    });

    // Checkbox change
    row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
        updateItem(item.id, { locked: e.target.checked });
    });

    // Button clicks
    row.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = btn.dataset.action;

            if (action === 'delete') {
                const currentItems = getState().items;
                const currentIndex = currentItems.findIndex(entry => entry.id === item.id);
                const nextFocusId = currentItems[currentIndex + 1]?.id || currentItems[currentIndex - 1]?.id;
                deleteItem(item.id);
                requestAnimationFrame(() => {
                    if (nextFocusId) {
                        findAgendaRowControl(nextFocusId, '[data-action="delete"]')?.focus({ preventScroll: true });
                    } else {
                        document.getElementById('btn-add-item')?.focus({ preventScroll: true });
                    }
                });
            } else if (action === 'stage') {
                stageItem(item.id);
                requestAnimationFrame(() => {
                    document.querySelector(`.staging-item[data-id="${CSS.escape(item.id)}"] [data-action="return"]`)?.focus({ preventScroll: true });
                });
            } else if (action === 'notes') {
                openNotesModal(currentItem(), btn);
            }
        });
    });

    row.querySelector('.grip')?.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const items = getState().items;
        const fromIndex = items.findIndex(entry => entry.id === item.id);
        const toIndex = fromIndex + (event.key === 'ArrowUp' ? -1 : 1);
        if (toIndex < 0 || toIndex >= items.length || !reorderItems(fromIndex, toIndex)) return;
        requestAnimationFrame(() => {
            container.querySelector(`.agenda-row[data-id="${CSS.escape(item.id)}"] .grip`)?.focus();
        });
    });

    row.querySelectorAll('.interval-time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openIntervalTimeEditor(btn);
        });

        btn.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 5 : -5;
            adjustIntervalTimeByDelta(btn, delta);
            requestAnimationFrame(() => {
                const position = btn.dataset.position || 'start';
                findAgendaRowControl(item.id, `.interval-time-btn[data-position="${position}"]`)?.focus({ preventScroll: true });
            });
        });
    });

    // Drag and drop
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragend', handleDragEnd);

}

/**
 * Inline editor for an interval time boundary
 * @param {HTMLButtonElement} button - Interval time button
 */
function openIntervalTimeEditor(button) {
    if (!button) return;
    const position = button.dataset.position || 'start';
    const index = parseInt(button.dataset.index || '0', 10);
    const itemId = button.closest('.agenda-row')?.dataset.id;

    const intervals = calculateIntervals();
    const interval = intervals[index];
    if (!interval) return;

    const currentValue = position === 'end'
        ? formatTimeValue(interval.endTime)
        : formatTimeValue(interval.startTime);

    const input = document.createElement('input');
    input.type = 'time';
    input.className = 'interval-start-input';
    input.value = currentValue;

    button.replaceWith(input);
    input.focus();

    if (typeof input.showPicker === 'function') {
        try {
            input.showPicker();
        } catch (err) {
            // no-op if the browser blocks programmatic picker
        }
    }

    const commit = () => {
        const nextValue = input.value || currentValue;
        const parsed = new Date(position === 'end' ? interval.endTime : interval.startTime);
        const [hours, minutes] = nextValue.split(':').map(Number);
        parsed.setHours(hours, minutes, 0, 0);
        if (parsed && !Number.isNaN(parsed.getTime())) {
            updateIntervalTime(index, position, parsed);
        }
        requestAnimationFrame(() => {
            if (itemId) {
                findAgendaRowControl(itemId, `.interval-time-btn[data-position="${position}"]`)?.focus({ preventScroll: true });
            }
        });
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            input.value = currentValue;
            input.blur();
        }
    });
}

function adjustIntervalTimeByDelta(button, deltaMinutes) {
    const position = button.dataset.position || 'start';
    const index = parseInt(button.dataset.index || '0', 10);
    const intervals = calculateIntervals();
    const interval = intervals[index];
    if (!interval) return;

    const baseTime = position === 'end' ? interval.endTime : interval.startTime;
    const targetTime = addMinutes(baseTime, deltaMinutes);
    updateIntervalTime(index, position, targetTime);
}

/**
 * Adjust duration by delta minutes
 * @param {Object} item - Item to adjust
 * @param {number} deltaMinutes - Minutes to add/subtract
 */
function adjustDuration(item, deltaMinutes) {
    item = getState().items.find(entry => entry.id === item.id) || item;
    const minutes = parseDuration(item.duration || '10m');

    // Calculate new minutes
    let newMinutes = minutes + deltaMinutes;

    // Smart increment: 5-minute steps above 5, 1-minute steps below 5
    if (deltaMinutes < 0 && minutes <= 5 && minutes > 1) {
        // Going down from 5 or below: decrement by 1
        newMinutes = minutes - 1;
    } else if (deltaMinutes > 0 && minutes < 5) {
        // Going up from below 5: increment by 1 until we reach 5
        newMinutes = Math.min(5, minutes + 1);
    }

    // Minimum of 1 minute
    newMinutes = Math.max(1, newMinutes);

    updateItem(item.id, { duration: formatDuration(newMinutes) });
}

/**
 * Handle drag start
 * @param {DragEvent} e - Drag event
 */
function handleDragStart(e) {
    draggedElement = e.currentTarget;
    draggedIndex = parseInt(draggedElement.dataset.index, 10);
    const itemId = draggedElement.dataset.id;

    e.currentTarget.classList.add('dragging');
    document.body.classList.add('dragging-item');
    setGlobalDragCursor(true);
    document.body.dataset.dragSource = 'agenda';
    if (itemId) {
        document.body.dataset.dragItemId = itemId;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId || '');
    e.dataTransfer.setData('application/x-agenda-source', 'agenda');

    // Add a slight delay to allow the drag image to be captured
    setTimeout(() => {
        if (draggedElement) {
            draggedElement.style.opacity = '0.5';
        }
    }, 0);
}

/**
 * Handle drag end
 * @param {DragEvent} e - Drag event
 */
function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    e.currentTarget.style.opacity = '';
    document.body.classList.remove('dragging-item');
    setGlobalDragCursor(false);
    delete document.body.dataset.dragSource;
    delete document.body.dataset.dragItemId;

    clearDragIndicators();

    draggedElement = null;
    draggedIndex = null;
}

/**
 * Handle Add Item button click
 */
export function handleAddItem() {
    addItem();

    // Scroll to bottom to show new item
    if (container) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
}
