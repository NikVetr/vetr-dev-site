# autoCHAIR Project Summary

autoCHAIR is a static, in-browser agenda builder and real-time meeting tracker. The app is delivered as a single HTML page with modular ES scripts and a single CSS file. There is no build system, which keeps deployment simple (any static host) and makes the app easy to run locally.

Technical architecture
- `index.html` provides the UI shell and references `css/styles.css` plus the ES module entry point `js/main.js`, including the branded header, split top section (input + right-side grid with import/export spanning overall status + next item), and the tracker/current-status row.
- `index.html` now also includes a bottom split section with a compressed `Current Item` panel plus a new `Staging` panel for carry-forward agenda items.
- `js/main.js` initializes modules, wires UI events, applies settings to the DOM, and now includes inline notes toolbar handling.
- `js/layout-resize.js` adds drag bars and corner grips between key panel boundaries and persists split sizes locally so users can tailor panel widths/heights.
- `js/state.js` is the source of truth. It manages state, persistence (localStorage), and share links via URL compression, and now includes a "next item" adjustment that redistributes remaining time. Other modules subscribe to it for re-renders.
- `js/state.js` now tracks both active `items` and `stagedItems`, with move/reorder operations for staging workflows and URL/localStorage persistence for both lists.
- `js/state.js` now also captures an expected-plan snapshot when a run starts and can switch into a variance mode when "Next Item" is used while more than one minute ahead/behind, enabling Expected vs Actual reporting without changing tracker rendering behavior.
- `js/agenda.js` renders agenda rows, handles CRUD, drag-and-drop reordering, and the notes editor modal.
- `js/staging.js` manages the Staging panel UI and drag/drop behavior for reordering staged items and moving items between active agenda and staging.
- `js/timer.js` renders the timeline and real-time status, including overall/current status panels, the current-item panel (with markdown preview), and the progress bar. It updates the live clock, handles the Next Item hotkey, supports tracker block drag/drop reordering, and de-overlaps axis/overflow labels with bezier connectors.
- `js/timer.js` also supports direct tracker duration editing (scroll to nudge item duration, drag left/right block edges to adjust interval boundaries), plus a tracker pop-out window with a compact 60/20/20 tracker/overall/current layout for projector or second-screen use.
- Runtime progression is manual while running: the active item only advances on explicit Next, and Previous rewinds that active focus while undoing the last completed-item delta contribution.
- Main and pop-out control strips now use split previous/next controls (20/80), with keyboard shortcuts (`Space` for next, `Backspace` for previous when text inputs are not focused) and matching on-button keycap hints.
- `js/export.js` generates exports (Markdown, plain text, Word-compatible HTML), includes carry-forward staged items in output, handles JSON import/export/share links, and adds Expected vs Actual timing/duration details when variance mode has been triggered.
- `js/export.js` markdown output now follows a board-meeting style template structure (title lines, metadata table, agenda table with Context/Preparation/Notes subrows, then Decision/Action checklists) while still filling fields from live app state.
- `js/tooltips.js` implements a lightweight tooltip system with event delegation.
- `js/utils.js` centralizes time parsing/formatting, IDs, small helpers, and a lightweight markdown-to-HTML renderer for note previews.

Key design decisions
- Static site, ES modules: minimal tooling, easy hosting, fast load times.
- Centralized state with subscriptions: predictable updates across the agenda list, timeline, and exports.
- URL-compressed state: supports shareable links without a backend.
- LocalStorage persistence: preserves user work across reloads.
- Staging workflow: unfinished items can be dragged out of the agenda timeline/list into a persistent staging area, then dragged back into active agenda order when needed.

How parts connect
- `main.js` initializes modules and registers event handlers.
- Modules read and update state via `state.js`; UI updates happen on subscription callbacks.
- Timeline/status visuals derive from calculated intervals in `state.js` to keep time math consistent.
- Drag-and-drop is cross-panel: input rows, tracker blocks, and staging cards all exchange items by ID through shared state updates.
- Status tickers auto-fit to container width to reduce clipping/overflow at higher zoom levels.
- Current Status now tracks the active item continuously (including overtime): before boundary it shows time left; after boundary it switches to "PAST THE END OF [item]" while keeping the next-item line.
- Overall Status now reflects cumulative run drift from completed items plus live overrun on the active item, instead of auto-advancing by wall clock.
- Tracker now renders an additional dashed progress guide line from the progress bar upward to the axis (behind chart blocks), and displaced major time labels use boundary-color gradients with improved connector curve geometry.
- The layout now includes direct split-handle resizing for top, right-side, status stack, tracker, and bottom panel boundaries, with clamping to keep both sides usable and prevent UI extrusion.
- The layout resizers now include both column and row splitters (`workspace-panels` and `lower-panels`) with hover-only handles and corner grips, and persisted splits were versioned to avoid stale/garbled layouts after structure changes.
- Tracker connector curves now use vertical tangency at both ends (ticks/labels and block edges/overflow labels) so they meet anchors straight-on, and splitter clamping now handles infeasible minimums by scaling constraints to prevent panel overlap.
- The next/previous control pair now has its own internal splitter, and layout split persistence was versioned again to clear stale values after clamp/geometry changes.
- Split-drag updates now trigger immediate re-clamping of all persisted split values and a tracker layout refresh pass, so nested panels and axis/overflow labels stay aligned during live panel resizing.
- Panel internals now use additional adaptive sizing rules (container-query-driven typography/grid compression, tighter spinner controls, and scroll-safe overflow in tracker/current-item/staging) so content remains contained and legible at extreme splitter positions.
- Split-grid containers now use `minmax(0, ...)` tracks with explicit container clipping on workspace/top/lower/right/status/tracker/bottom shells, preventing impossible nested minima from forcing cross-split panel overlap.
- The lower horizontal split now uses an anchored bottom-track variable (`--main-bottom-height`) so dragging the top tracker boundary primarily affects the adjacent tracker row, and corner grips can now couple nearby orthogonal splitters for diagonal two-axis resizing.
- Height-aware panel container queries now scale down tracker axis/controls, status tickers, next/prev buttons, and current-item notes regions under tight vertical space, reducing clipping while preserving legibility.
- Corner-resize UX now distinguishes active vs inert corner grips, adds proximity snapping near active corners, and previews dual-axis coupling by highlighting both affected splitter bars with a move cursor before drag starts.
- Corner activation now snaps only near true corner vertices (not along splitter interiors), while compact-mode layout rules keep critical elements (input delete controls, status/current-status ticker centers, tracker progress bar, and overflow labels) visible by prioritizing non-shrinking ticker/progress tracks and stronger narrow-panel scaling.
- Corner markers are now positioned by runtime geometry (computed from splitter endpoint anchors plus coupled orthogonal centerlines), so each marker centers on the actual T/4-way channel intersection instead of relying on static pixel offsets or clamped in-segment projections.
- Splitter host grids now keep overflow visible where corner grips render, preventing ancestor clipping that previously made correctly-positioned corner squares appear inset along splitter lines.
- Corner preview activation now requires pointer entry into the actual intersection square hitbox (not proximity along a single splitter line), and splitter guide lines now run to splitter bounds so highlighted dual-axis bars visually meet at the corner.
- Corner markers now render in viewport-fixed coordinates derived from splitter intersection geometry, so they stay centered on true intersections without requiring ancestor overflow to be visible (preventing panel-content overlap regressions).
- Tooltip handling now suppresses panel splitter/corner hover targets while preserving tooltip behavior for all other controls.
- Corner dragging now uses invisible intersection hit regions (no visible blue square marker), keeping dual-axis corner resize behavior while avoiding lingering or unreliable corner indicator artifacts.
- Header and next/prev control logos now use `.webm` animated gear assets (`assets/animation`), with interaction-linked spin segments: next (+45deg over 1s), previous (-45deg over 1s), header click (+4s), reset (-4s), and successful JSON import (+4s).
- Logo playback now stays on fixed preloaded `.webm` sources (no runtime `src` swapping), so idle logos are paused first frames and click-triggered spins avoid flicker; the header uses forward/reverse preloaded variants, and the PREV button now shows a visible `BACKSPACE` keycap matching NEXT's keycap treatment.
- The active tracker block emphasis now uses per-theme color inversion (dark theme text color as block fill, light theme fill color as block text) rather than a red outline.
- Major boundary time labels now use the color of the following agenda item; displaced connector curves fade from black at the tick to the item color at the label.
- When runtime variance mode is active, the Input grid expands from single Duration/Time columns into Expected and Actual pairs, plus a color-coded Difference column (red when an item runs long, blue when it runs short).
