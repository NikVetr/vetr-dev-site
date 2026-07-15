/**
 * metadata.js - Persisted meeting details and attendance editing
 */

import { getState, updateMetadata } from './state.js';

let modal;
let attendeesContainer;

function createAttendee(name) {
    return {
        id: globalThis.crypto?.randomUUID?.() || `attendee-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        present: false
    };
}

function seedMetadata() {
    const state = getState();
    if (state.metadata?.initialized) return;
    const names = [...new Set(state.items.map(item => item.lead?.trim()).filter(Boolean))];
    updateMetadata({
        date: state.metadata?.date || new Date().toISOString().slice(0, 10),
        attendees: names.map(createAttendee),
        initialized: true
    });
}

function updateAttendee(id, updates) {
    const attendees = getState().metadata.attendees.map(attendee => attendee.id === id
        ? { ...attendee, ...updates }
        : attendee);
    updateMetadata({ attendees });
}

function renderAttendees() {
    const attendees = getState().metadata.attendees || [];
    attendeesContainer.replaceChildren(...attendees.map(attendee => {
        const row = document.createElement('div');
        row.className = 'metadata-attendee-row';
        const name = document.createElement('input');
        name.type = 'text';
        name.value = attendee.name;
        name.setAttribute('aria-label', 'Attendee name');
        name.addEventListener('change', () => updateAttendee(attendee.id, { name: name.value }));
        const present = document.createElement('input');
        present.type = 'checkbox';
        present.checked = attendee.present;
        present.setAttribute('aria-label', `${attendee.name} present`);
        present.addEventListener('change', () => updateAttendee(attendee.id, { present: present.checked }));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'metadata-remove-attendee';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove ${attendee.name}`);
        remove.addEventListener('click', () => {
            updateMetadata({ attendees: getState().metadata.attendees.filter(entry => entry.id !== attendee.id) });
            renderAttendees();
        });
        row.append(name, present, remove);
        return row;
    }));
}

function syncFields() {
    const metadata = getState().metadata;
    document.getElementById('metadata-meeting-title').value = metadata.title || '';
    document.getElementById('metadata-date').value = metadata.date || '';
    document.getElementById('metadata-location').value = metadata.location || '';
    document.getElementById('metadata-url').value = metadata.url || '';
    document.getElementById('metadata-attendee-group').value = metadata.attendeeGroup || 'Attendees';
    renderAttendees();
}

function closeModal() {
    modal.classList.remove('visible');
}

export function initMetadata() {
    seedMetadata();
    modal = document.getElementById('metadata-modal');
    attendeesContainer = document.getElementById('metadata-attendees');
    if (!modal || !attendeesContainer) throw new Error('Metadata editor markup is missing.');

    [
        ['metadata-meeting-title', 'title'],
        ['metadata-date', 'date'],
        ['metadata-location', 'location'],
        ['metadata-url', 'url'],
        ['metadata-attendee-group', 'attendeeGroup']
    ].forEach(([id, key]) => {
        document.getElementById(id).addEventListener('change', event => updateMetadata({ [key]: event.target.value }));
    });

    document.getElementById('btn-metadata')?.addEventListener('click', () => {
        seedMetadata();
        syncFields();
        modal.classList.add('visible');
    });
    document.getElementById('metadata-close')?.addEventListener('click', closeModal);
    document.getElementById('metadata-done')?.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeModal();
    });

    const newAttendee = document.getElementById('metadata-new-attendee');
    document.getElementById('metadata-add-attendee')?.addEventListener('click', () => {
        const name = newAttendee.value.trim();
        if (!name) return;
        updateMetadata({ attendees: [...getState().metadata.attendees, createAttendee(name)] });
        newAttendee.value = '';
        renderAttendees();
    });
}
