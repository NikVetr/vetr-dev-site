# Agendamatic Project Summary

Agendamatic is a static, in-browser agenda builder and real-time meeting tracker. The app is delivered as a single HTML page with modular ES scripts and a single CSS file. There is no build system, which keeps deployment simple (any static host) and makes the app easy to run locally.

Technical architecture
- `index.html` provides the UI shell and references `css/styles.css` plus the ES module entry point `js/main.js`, including the split top section (input + right-side grid with import/export spanning overall status + next item) and the tracker/current-status row.
- `js/main.js` initializes modules, wires UI events, applies settings to the DOM, and now includes inline notes toolbar handling.
- `js/state.js` is the source of truth. It manages state, persistence (localStorage), and share links via URL compression, and now includes a "next item" adjustment that redistributes remaining time. Other modules subscribe to it for re-renders.
- `js/agenda.js` renders agenda rows, handles CRUD, drag-and-drop reordering, and the notes editor modal.
- `js/timer.js` renders the timeline and real-time status, including overall/current status panels, the current-item panel (with markdown preview), and the progress bar. It also updates the live clock and handles the Next Item advance hotkey.
- `js/export.js` generates exports (Markdown, plain text, Word-compatible HTML) and handles JSON import/export and share links.
- `js/tooltips.js` implements a lightweight tooltip system with event delegation.
- `js/utils.js` centralizes time parsing/formatting, IDs, small helpers, and a lightweight markdown-to-HTML renderer for note previews.

Key design decisions
- Static site, ES modules: minimal tooling, easy hosting, fast load times.
- Centralized state with subscriptions: predictable updates across the agenda list, timeline, and exports.
- URL-compressed state: supports shareable links without a backend.
- LocalStorage persistence: preserves user work across reloads.

How parts connect
- `main.js` initializes modules and registers event handlers.
- Modules read and update state via `state.js`; UI updates happen on subscription callbacks.
- Timeline/status visuals derive from calculated intervals in `state.js` to keep time math consistent.
