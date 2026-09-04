/**
 * metadata.js - Persisted meeting details and attendance editing
 */

import { getState, updateMetadata } from './state.js';
import { focusAfterTransition } from './utils.js';

let modal;
let groupsContainer;
let actionsContainer;
let modalTrigger = null;

function deferMetadataFocus(resolveTarget) {
    focusAfterTransition(modal, resolveTarget);
}

function createId(prefix) {
    return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createAttendee(name) {
    return {
        id: createId('attendee'),
        name,
        present: false
    };
}

function createGroup(name = 'Attendees', attendees = []) {
    return { id: createId('group'), name, attendees };
}

function createActionItem() {
    return { id: createId('action'), text: '', owner: '', done: false };
}

function getAttendeeGroups(metadata = getState().metadata) {
    if (Array.isArray(metadata?.attendeeGroups) && metadata.attendeeGroups.length) {
        return metadata.attendeeGroups;
    }
    return [createGroup(metadata?.attendeeGroup || 'Attendees', metadata?.attendees || [])];
}

function seedMetadata() {
    const state = getState();
    const names = [...new Set(state.items.map(item => item.lead?.trim()).filter(Boolean))];
    const today = new Date();
    const localDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0')
    ].join('-');
    const groups = getAttendeeGroups(state.metadata);
    const needsInitialAttendees = !state.metadata?.initialized && groups.every(group => !group.attendees?.length);
    const attendeeGroups = groups.map((group, index) => ({
        ...group,
        id: group.id || createId('group'),
        name: group.name || (index === 0 ? 'Attendees' : `Group ${index + 1}`),
        attendees: needsInitialAttendees && index === 0
            ? names.map(createAttendee)
            : (group.attendees || []).map(attendee => ({ ...attendee, id: attendee.id || createId('attendee') }))
    }));
    const actionItems = Array.isArray(state.metadata?.actionItems)
        ? state.metadata.actionItems.map(item => ({ ...item, id: item.id || createId('action') }))
        : [];
    const nextMetadata = {
        date: state.metadata?.date || localDate,
        attendeeGroups,
        actionItems,
        initialized: true
    };
    if (JSON.stringify(nextMetadata) !== JSON.stringify({
        date: state.metadata?.date,
        attendeeGroups: state.metadata?.attendeeGroups,
        actionItems: state.metadata?.actionItems,
        initialized: state.metadata?.initialized
    })) updateMetadata(nextMetadata);
}

function replaceGroups(attendeeGroups) {
    updateMetadata({ attendeeGroups });
}

function updateGroup(groupId, transform) {
    replaceGroups(getAttendeeGroups().map(group => group.id === groupId ? transform(group) : group));
}

function renderAttendee(attendee, group) {
        const row = document.createElement('div');
        row.className = 'metadata-attendee-row';
        row.dataset.attendeeId = attendee.id;
        const name = document.createElement('input');
        name.type = 'text';
        name.value = attendee.name;
        name.setAttribute('aria-label', 'Attendee name');
        name.addEventListener('input', () => updateGroup(group.id, current => ({
            ...current,
            attendees: current.attendees.map(person => person.id === attendee.id ? { ...person, name: name.value } : person)
        })));
        const present = document.createElement('input');
        present.type = 'checkbox';
        present.checked = attendee.present;
        present.setAttribute('aria-label', `${attendee.name} present`);
        present.addEventListener('change', () => updateGroup(group.id, current => ({
            ...current,
            attendees: current.attendees.map(person => person.id === attendee.id ? { ...person, present: present.checked } : person)
        })));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'metadata-remove-attendee';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove ${attendee.name}`);
        remove.addEventListener('click', () => {
            const currentAttendees = getAttendeeGroups()
                .find(entry => entry.id === group.id)?.attendees || [];
            const currentIndex = currentAttendees.findIndex(person => person.id === attendee.id);
            const nextFocusId = currentAttendees[currentIndex + 1]?.id || currentAttendees[currentIndex - 1]?.id;
            updateGroup(group.id, current => ({
                ...current,
                attendees: current.attendees.filter(person => person.id !== attendee.id)
            }));
            renderGroups();
            deferMetadataFocus(() => {
                const section = [...groupsContainer.querySelectorAll('.metadata-attendee-group')]
                    .find(entry => entry.dataset.groupId === group.id);
                const nextRow = nextFocusId
                    ? [...(section?.querySelectorAll('.metadata-attendee-row') || [])]
                        .find(entry => entry.dataset.attendeeId === nextFocusId)
                    : null;
                return nextRow?.querySelector('.metadata-remove-attendee') ||
                    section?.querySelector('.metadata-add-attendee input');
            });
        });
        row.append(name, present, remove);
        return row;
}

function renderGroup(group) {
    const section = document.createElement('section');
    section.className = 'metadata-attendee-group';
    section.dataset.groupId = group.id;

    const header = document.createElement('div');
    header.className = 'metadata-group-header';
    const groupName = document.createElement('input');
    groupName.type = 'text';
    groupName.value = group.name || 'Attendees';
    groupName.setAttribute('aria-label', 'Attendee group name');
    groupName.addEventListener('input', () => updateGroup(group.id, current => ({ ...current, name: groupName.value })));
    const presentLabel = document.createElement('span');
    presentLabel.textContent = 'Present';
    const removeGroup = document.createElement('button');
    removeGroup.type = 'button';
    removeGroup.className = 'metadata-remove-attendee';
    removeGroup.textContent = '×';
    removeGroup.setAttribute('aria-label', `Remove ${group.name || 'attendee'} group`);
    removeGroup.disabled = getAttendeeGroups().length === 1;
    removeGroup.addEventListener('click', () => {
        const currentGroups = getAttendeeGroups();
        const currentIndex = currentGroups.findIndex(entry => entry.id === group.id);
        const remainingGroups = currentGroups.filter(entry => entry.id !== group.id);
        const nextFocusId = remainingGroups[Math.min(currentIndex, remainingGroups.length - 1)]?.id;
        replaceGroups(remainingGroups);
        renderGroups();
        deferMetadataFocus(() => {
            const nextGroup = [...groupsContainer.querySelectorAll('.metadata-attendee-group')]
                .find(entry => entry.dataset.groupId === nextFocusId);
            return nextGroup?.querySelector('.metadata-group-header input') ||
                document.getElementById('metadata-add-group');
        });
    });
    header.append(groupName, presentLabel, removeGroup);

    const attendees = document.createElement('div');
    attendees.className = 'metadata-attendees';
    attendees.replaceChildren(...(group.attendees || []).map(attendee => renderAttendee(attendee, group)));

    const addRow = document.createElement('div');
    addRow.className = 'metadata-add-attendee';
    const newAttendee = document.createElement('input');
    newAttendee.type = 'text';
    newAttendee.placeholder = `Add ${group.name || 'attendee'}`;
    newAttendee.setAttribute('aria-label', `New attendee in ${group.name || 'group'}`);
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = '+ Add';
    addButton.setAttribute('aria-label', `Add attendee to ${group.name || 'group'}`);
    const addAttendee = () => {
        const name = newAttendee.value.trim();
        if (!name) return;
        const attendee = createAttendee(name);
        updateGroup(group.id, current => ({ ...current, attendees: [...current.attendees, attendee] }));
        renderGroups();
        deferMetadataFocus(() => [...groupsContainer.querySelectorAll('.metadata-attendee-row')]
            .find(entry => entry.dataset.attendeeId === attendee.id)
            ?.querySelector('input[type="text"]'));
    };
    addButton.addEventListener('click', addAttendee);
    newAttendee.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addAttendee();
        }
    });
    addRow.append(newAttendee, addButton);
    section.append(header, attendees, addRow);
    return section;
}

function renderGroups() {
    groupsContainer.replaceChildren(...getAttendeeGroups().map(renderGroup));
}

function updateActionItem(id, updates) {
    const actionItems = (getState().metadata.actionItems || []).map(item => item.id === id
        ? { ...item, ...updates }
        : item);
    updateMetadata({ actionItems });
}

function renderActions() {
    const actionItems = getState().metadata.actionItems || [];
    actionsContainer.replaceChildren(...actionItems.map(item => {
        const row = document.createElement('div');
        row.className = 'metadata-action-row';
        row.dataset.actionId = item.id;
        const done = document.createElement('input');
        done.type = 'checkbox';
        done.checked = !!item.done;
        done.setAttribute('aria-label', `Mark ${item.text || 'action item'} complete`);
        done.addEventListener('change', () => updateActionItem(item.id, { done: done.checked }));
        const text = document.createElement('input');
        text.type = 'text';
        text.value = item.text || '';
        text.placeholder = 'Action item';
        text.setAttribute('aria-label', 'Action item');
        text.addEventListener('input', () => updateActionItem(item.id, { text: text.value }));
        const owner = document.createElement('input');
        owner.type = 'text';
        owner.value = item.owner || '';
        owner.placeholder = 'Owner';
        owner.setAttribute('aria-label', 'Action item owner');
        owner.addEventListener('input', () => updateActionItem(item.id, { owner: owner.value }));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'metadata-remove-attendee';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove ${item.text || 'action item'}`);
        remove.addEventListener('click', () => {
            const currentItems = getState().metadata.actionItems || [];
            const currentIndex = currentItems.findIndex(entry => entry.id === item.id);
            const remainingItems = currentItems.filter(entry => entry.id !== item.id);
            const nextFocusId = remainingItems[Math.min(currentIndex, remainingItems.length - 1)]?.id;
            updateMetadata({ actionItems: remainingItems });
            renderActions();
            deferMetadataFocus(() => {
                const nextRow = [...actionsContainer.querySelectorAll('.metadata-action-row')]
                    .find(entry => entry.dataset.actionId === nextFocusId);
                return nextRow?.querySelector('.metadata-remove-attendee') ||
                    document.getElementById('metadata-add-action');
            });
        });
        row.append(done, text, owner, remove);
        return row;
    }));
}

function syncFields() {
    const metadata = getState().metadata;
    document.getElementById('metadata-meeting-title').value = metadata.title || '';
    document.getElementById('metadata-date').value = metadata.date || '';
    document.getElementById('metadata-location').value = metadata.location || '';
    document.getElementById('metadata-url').value = metadata.url || '';
    renderGroups();
    renderActions();
}

function closeModal() {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && modal.contains(activeElement)) {
        activeElement.blur();
    }
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    const trigger = modalTrigger;
    modalTrigger = null;
    if (trigger?.isConnected) trigger.focus();
}

export function initMetadata() {
    seedMetadata();
    modal = document.getElementById('metadata-modal');
    groupsContainer = document.getElementById('metadata-attendee-groups');
    actionsContainer = document.getElementById('metadata-action-items');
    if (!modal || !groupsContainer || !actionsContainer) throw new Error('Metadata editor markup is missing.');

    [
        ['metadata-meeting-title', 'title'],
        ['metadata-date', 'date'],
        ['metadata-location', 'location'],
        ['metadata-url', 'url']
    ].forEach(([id, key]) => {
        document.getElementById(id).addEventListener('input', event => updateMetadata({ [key]: event.target.value }));
    });

    document.getElementById('btn-metadata')?.addEventListener('click', event => {
        modalTrigger = event.currentTarget;
        seedMetadata();
        syncFields();
        modal.classList.add('visible');
        modal.setAttribute('aria-hidden', 'false');
        deferMetadataFocus(() => document.getElementById('metadata-meeting-title'));
    });
    document.getElementById('metadata-close')?.addEventListener('click', closeModal);
    document.getElementById('metadata-done')?.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeModal();
    });
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeModal();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...modal.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    document.getElementById('metadata-add-group')?.addEventListener('click', () => {
        const group = createGroup(`Group ${getAttendeeGroups().length + 1}`);
        replaceGroups([...getAttendeeGroups(), group]);
        renderGroups();
        deferMetadataFocus(() => [...groupsContainer.querySelectorAll('.metadata-attendee-group')]
            .find(entry => entry.dataset.groupId === group.id)
            ?.querySelector('.metadata-group-header input'));
    });
    document.getElementById('metadata-add-action')?.addEventListener('click', () => {
        const action = createActionItem();
        updateMetadata({ actionItems: [...(getState().metadata.actionItems || []), action] });
        renderActions();
        deferMetadataFocus(() => [...actionsContainer.querySelectorAll('.metadata-action-row')]
            .find(entry => entry.dataset.actionId === action.id)
            ?.querySelector('input[type="text"]'));
    });
}
