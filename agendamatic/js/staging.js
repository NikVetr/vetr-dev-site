/**
 * staging.js - Staging panel for carry-forward agenda items
 */

import {
    getState,
    subscribe,
    stageItem,
    unstageItem,
    reorderStagedItems
} from './state.js';

let container = null;
let draggedElement = null;

function setGlobalDragCursor(active) {
    const value = active ? 'grabbing' : '';
    document.documentElement.style.setProperty('cursor', value, 'important');
    document.body.style.setProperty('cursor', value, 'important');
}

/**
 * Initialize staging panel
 * @param {HTMLElement} containerElement - Staging container
 */
export function initStaging(containerElement) {
    container = containerElement;
    if (!container) return;

    setupDropEvents();
    subscribe(renderStaging);
    renderStaging(getState());
}

function setupDropEvents() {
    if (!container) return;

    container.addEventListener('dragover', (e) => {
        const source = e.dataTransfer?.getData('application/x-agenda-source') || document.body.dataset.dragSource;
        if (!source) return;
        e.preventDefault();

        const cards = [...container.querySelectorAll('.staging-item:not(.dragging)')];
        const afterElement = getDragAfterElement(cards, e.clientY);

        clearDragIndicators();
        container.classList.add('drag-active');
        if (afterElement) {
            afterElement.classList.add('drag-over-top');
        } else if (cards.length > 0) {
            cards[cards.length - 1].classList.add('drag-over-bottom');
        } else {
            container.classList.add('drag-over-empty');
        }
    });

    container.addEventListener('dragleave', (e) => {
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

        const cards = [...container.querySelectorAll('.staging-item:not(.dragging)')];
        const afterElement = getDragAfterElement(cards, e.clientY);
        let targetIndex;
        if (afterElement) {
            targetIndex = parseInt(afterElement.dataset.index || '0', 10);
        } else {
            targetIndex = cards.length;
        }

        if (source === 'agenda') {
            stageItem(itemId, targetIndex);
            return;
        }

        if (source === 'staging') {
            const stagedItems = getState().stagedItems || [];
            const fromIndex = stagedItems.findIndex(item => item.id === itemId);
            if (fromIndex < 0) return;
            if (fromIndex < targetIndex) targetIndex -= 1;
            if (fromIndex !== targetIndex) {
                reorderStagedItems(fromIndex, targetIndex);
            }
        }
    });
}

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

function clearDragIndicators() {
    if (!container) return;
    container.classList.remove('drag-active', 'drag-over-empty');
    container.querySelectorAll('.staging-item').forEach(card => {
        card.classList.remove('drag-over-top', 'drag-over-bottom');
    });
}

function renderStaging(state) {
    if (!container) return;
    const stagedItems = state.stagedItems || [];
    container.innerHTML = '';

    if (stagedItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'staging-empty';
        empty.textContent = 'Drop items here to carry them forward to the next meeting.';
        container.appendChild(empty);
        return;
    }

    stagedItems.forEach((item, index) => {
        const card = document.createElement('div');
        const themeNumber = item.themeColor || ((index % 4) + 1);
        card.className = `staging-item theme-${themeNumber}`;
        card.draggable = true;
        card.dataset.id = item.id;
        card.dataset.index = index.toString();
        card.innerHTML = `
            <div class="staging-item-name">${escapeHtml(item.name)}</div>
            <div class="staging-item-meta">${escapeHtml(item.lead || 'TBD')} • ${escapeHtml(item.duration || '10m')}</div>
        `;

        card.addEventListener('dragstart', (e) => {
            draggedElement = card;
            card.classList.add('dragging');
            document.body.classList.add('dragging-item');
            setGlobalDragCursor(true);
            document.body.dataset.dragSource = 'staging';
            document.body.dataset.dragItemId = item.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.id);
            e.dataTransfer.setData('application/x-agenda-source', 'staging');
            setTimeout(() => {
                if (draggedElement) draggedElement.style.opacity = '0.45';
            }, 0);
        });

        card.addEventListener('dragend', () => {
            if (draggedElement) {
                draggedElement.classList.remove('dragging');
                draggedElement.style.opacity = '';
            }
            draggedElement = null;
            document.body.classList.remove('dragging-item');
            setGlobalDragCursor(false);
            delete document.body.dataset.dragSource;
            delete document.body.dataset.dragItemId;
            clearDragIndicators();
        });

        card.addEventListener('dblclick', () => {
            unstageItem(item.id);
        });

        container.appendChild(card);
    });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
