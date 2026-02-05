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
    calculateIntervals
} from './state.js';
import { formatTime, parseTime, addMinutes, debounce, parseDuration, formatDuration } from './utils.js';

let container = null;
let draggedElement = null;
let draggedIndex = null;
let lastIndicatorIndex = null; // Track last indicator position to avoid showing when item stays in place

// Modal elements
let notesModal = null;
let modalTitle = null;
let editorTextarea = null;
let currentEditingItem = null;

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
    const toolbar = document.querySelector('.editor-toolbar');

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
            handleToolbarAction(action);
        });
    }

    // Keyboard shortcuts in editor
    if (editorTextarea) {
        editorTextarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'b') {
                    e.preventDefault();
                    handleToolbarAction('bold');
                } else if (e.key === 'i') {
                    e.preventDefault();
                    handleToolbarAction('italic');
                } else if (e.key === 's') {
                    e.preventDefault();
                    saveNotes();
                }
            }
            // Escape to close
            if (e.key === 'Escape') {
                closeNotesModal();
            }
        });
    }
}

/**
 * Handle toolbar button actions
 * @param {string} action - Action name
 */
function handleToolbarAction(action) {
    if (!editorTextarea) return;

    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const selectedText = editorTextarea.value.substring(start, end);
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

    // Insert the replacement
    editorTextarea.value =
        editorTextarea.value.substring(0, start) +
        replacement +
        editorTextarea.value.substring(end);

    // Set cursor position
    const newPosition = start + cursorOffset;
    editorTextarea.setSelectionRange(newPosition, newPosition);
    editorTextarea.focus();
}

/**
 * Open the notes modal for an item
 * @param {Object} item - Item to edit notes for
 */
export function openNotesModal(item) {
    if (!notesModal || !editorTextarea || !modalTitle) return;

    currentEditingItem = item;
    modalTitle.textContent = `Notes: ${item.name}`;
    editorTextarea.value = item.notes || '';

    notesModal.classList.add('visible');
    editorTextarea.focus();
}

/**
 * Close the notes modal
 */
function closeNotesModal() {
    if (!notesModal) return;

    notesModal.classList.remove('visible');
    currentEditingItem = null;
}

/**
 * Save notes from modal
 */
function saveNotes() {
    if (!currentEditingItem || !editorTextarea) return;

    updateItem(currentEditingItem.id, { notes: editorTextarea.value });
    closeNotesModal();
}

/**
 * Set up container-level drag events for better drop zone detection
 */
function setupContainerDragEvents() {
    if (!container) return;

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedElement) return;

        const rows = [...container.querySelectorAll('.agenda-row:not(.dragging)')];
        const afterElement = getDragAfterElement(rows, e.clientY);

        // Calculate what the target index would be
        let targetIndex;
        if (afterElement) {
            targetIndex = parseInt(afterElement.dataset.index, 10);
            // Adjust if dragging from before to after
            if (draggedIndex < targetIndex) {
                targetIndex--;
            }
        } else {
            targetIndex = getState().items.length - 1;
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

        if (!draggedElement) return;

        const rows = [...container.querySelectorAll('.agenda-row:not(.dragging)')];
        const afterElement = getDragAfterElement(rows, e.clientY);

        let targetIndex;
        if (afterElement) {
            targetIndex = parseInt(afterElement.dataset.index, 10);
            // Adjust if dragging from before to after
            if (draggedIndex < targetIndex) {
                targetIndex--;
            }
        } else {
            targetIndex = getState().items.length - 1;
        }

        if (draggedIndex !== targetIndex) {
            reorderItems(draggedIndex, targetIndex);
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

    const itemsWithIntervals = calculateIntervals();

    // Clear existing rows (but keep the header if it exists)
    const existingRows = container.querySelectorAll('.agenda-row');
    existingRows.forEach(row => row.remove());

    // Render each item
    itemsWithIntervals.forEach((item, index) => {
        const row = createAgendaRow(item, index);
        container.appendChild(row);
    });
}

/**
 * Create a single agenda row element
 * @param {Object} item - Agenda item with calculated times
 * @param {number} index - Item index
 * @returns {HTMLElement} Row element
 */
function createAgendaRow(item, index) {
    const row = document.createElement('div');
    row.className = `agenda-grid agenda-row theme-${item.themeNumber}`;
    row.draggable = true;
    row.dataset.id = item.id;
    row.dataset.index = index;

    // Grip handle
    const grip = document.createElement('div');
    grip.className = 'grip';
    grip.innerHTML = '&#8942;&#8942;';
    grip.setAttribute('data-tooltip', 'Drag to reorder this agenda item');

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = item.name;
    nameInput.dataset.field = 'name';
    nameInput.placeholder = 'Item name';
    nameInput.setAttribute('data-tooltip', 'Enter the agenda item title');

    // Lead input
    const leadInput = document.createElement('input');
    leadInput.type = 'text';
    leadInput.value = item.lead;
    leadInput.dataset.field = 'lead';
    leadInput.placeholder = 'Lead';
    leadInput.setAttribute('data-tooltip', 'Who is leading this agenda item');

    // Duration input with time spinner
    const durationWrapper = document.createElement('div');
    durationWrapper.className = 'time-input-wrapper';

    const durationInput = document.createElement('input');
    durationInput.type = 'text';
    durationInput.value = item.duration;
    durationInput.dataset.field = 'duration';
    durationInput.placeholder = '10m';
    durationInput.setAttribute('data-tooltip', 'Duration (e.g., 5m, 1h) - scroll to adjust');

    const durationSpinner = document.createElement('div');
    durationSpinner.className = 'time-spinner';
    durationSpinner.innerHTML = `
        <button data-action="duration-up">&#9650;</button>
        <button data-action="duration-down">&#9660;</button>
    `;

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

    intervalSpan.appendChild(startBtn);
    intervalSpan.appendChild(separator);
    intervalSpan.appendChild(endBtn);

    intervalSpan.setAttribute('data-tooltip', 'Calculated time slot based on duration');

    // Lock checkbox
    const lockCheckbox = document.createElement('input');
    lockCheckbox.type = 'checkbox';
    lockCheckbox.checked = item.locked;
    lockCheckbox.dataset.field = 'locked';
    lockCheckbox.setAttribute('data-tooltip', 'Lock this item\'s duration (won\'t shrink/stretch when running late)');

    // Notes button
    const notesBtn = document.createElement('button');
    notesBtn.className = 'btn-icon';
    notesBtn.innerHTML = '&#128221;';
    notesBtn.dataset.action = 'notes';
    notesBtn.setAttribute('data-tooltip', 'Click to edit notes for this item');

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.dataset.action = 'delete';
    deleteBtn.setAttribute('data-tooltip', 'Remove this agenda item');

    // Append all elements
    row.appendChild(grip);
    row.appendChild(nameInput);
    row.appendChild(leadInput);
    row.appendChild(durationWrapper);
    row.appendChild(intervalSpan);
    row.appendChild(lockCheckbox);
    row.appendChild(notesBtn);
    row.appendChild(deleteBtn);

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
    // Input changes with debouncing
    const debouncedUpdate = debounce((field, value) => {
        updateItem(item.id, { [field]: value });
    }, 300);

    row.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('input', (e) => {
            debouncedUpdate(e.target.dataset.field, e.target.value);
        });

        input.addEventListener('blur', (e) => {
            // Immediate update on blur
            updateItem(item.id, { [e.target.dataset.field]: e.target.value });
        });

        // Scroll wheel for duration
        if (input.dataset.field === 'duration') {
            input.addEventListener('wheel', (e) => {
                e.preventDefault();
                adjustDuration(item, e.deltaY < 0 ? 5 : -5);
            });
        }
    });

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
                deleteItem(item.id);
            } else if (action === 'notes') {
                openNotesModal(item);
            }
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
        const parsed = parseTime(nextValue);
        if (parsed && !Number.isNaN(parsed.getTime())) {
            updateIntervalTime(index, position, parsed);
        }
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

function formatTimeValue(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Adjust duration by delta minutes
 * @param {Object} item - Item to adjust
 * @param {number} deltaMinutes - Minutes to add/subtract
 */
function adjustDuration(item, deltaMinutes) {
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

    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedElement.dataset.id);

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

/**
 * Get the current item based on wall-clock time
 * @returns {Object|null} Current item or null
 */
export function getCurrentItem() {
    const items = calculateIntervals();
    const now = new Date();
    const index = findCurrentItemIndex(items, now);

    if (index >= 0) {
        return items[index];
    }

    // If we're before all items, return the first one
    if (items.length > 0) {
        return items[0];
    }

    return null;
}

/**
 * Find the index of the current item
 * @returns {number} Index of current item or -1
 */
export function getCurrentItemIndex() {
    const items = calculateIntervals();
    const now = new Date();
    return findCurrentItemIndex(items, now);
}

/**
 * Find the index of the current item for a given time
 * @param {Array} items - Items with intervals
 * @param {Date} now - Time to compare
 * @returns {number} Current index or -1 if before start
 */
function findCurrentItemIndex(items, now) {
    for (let i = 0; i < items.length; i++) {
        if (now >= items[i].startTime && now < items[i].endTime) {
            return i;
        }
    }

    if (items.length > 0 && now >= items[items.length - 1].endTime) {
        return items.length - 1;
    }

    return -1;
}
