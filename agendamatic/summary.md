# autoCHAIR Project Summary

autoCHAIR is a static, browser-only agenda builder and real-time meeting tracker published at `/agendamatic/`. It has no application build step or backend: `index.html`, one stylesheet, and ES modules are served directly. A small Node dependency set exists only for Playwright regression tests.

## Architecture

- `index.html` defines the semantic UI shell: agenda input, import/export, agenda and current status, tracker, current item, staging, metadata dialogs, color picker, notes editor, and settings.
- `css/styles.css` supplies theme tokens, responsive panel/container rules, stacked breakpoints, the Settings drawer, tracker geometry, custom-color variables, and scrollbar-free pop-out modes.
- `js/main.js` initializes all modules, binds global controls and keyboard shortcuts, applies settings, and manages the accessible mobile settings drawer. Reusable editing, focus, escaping, time, and drag helpers live in `js/utils.js` instead of being repeated across feature modules.
- `js/state.js` is the single source of truth. It validates and normalizes data, calculates intervals, tracks run anchors and stable item identity, implements undo/redo, handles agenda and staging mutations, and persists state.
- `js/agenda.js`, `js/staging.js`, and `js/bulk-edit.js` provide row/card editing, cross-panel drag and drop, notes, column-list editing, and escaped CSV editing with line-specific validation.
- `js/timer.js` renders the timeline and status panels, manages start/pause/resume and explicit previous/next progression, exposes duration/reorder interactions, and synchronizes the projector pop-out.
- `js/metadata.js` manages meeting details, multiple attendee groups and attendance, and structured action items with owner and completion state.
- `js/export.js` imports/exports complete JSON state and generates Markdown, text, and Word-compatible HTML agendas or minutes.
- `js/colors.js` owns preset and arbitrary HSL colors, readable light/dark theme tokens, and nearest-preset helpers.
- `js/alerts.js`, `js/panel-swap.js`, `js/layout-resize.js`, `js/tooltips.js`, and `js/utils.js` isolate alerts, panel placement, occupancy-aware split constraints and local layout preferences, help UI, parsing/formatting, and safe lightweight Markdown rendering.

## State and timing model

The normalized schema is versioned. Agenda items have stable IDs, positive durations rounded to tenths of a minute, optional locks and authored details, and either preset or custom colors. Metadata uses canonical attendee-group and action-item collections. Structurally invalid imports fail without changing state; compatible legacy or malformed field values are migrated, clamped, regenerated, or reset to documented defaults during normalization.

The tracker records a scheduled start, active-item elapsed-time and wall-clock anchors, stable active item ID, accumulated paused time, and completion time. Completed items retain their own wall-clock start/end timestamps and duration excluding pauses, so resuming, reloading, or completing a run does not shift earlier intervals in the timeline or exported minutes. Recorded durations support sub-minute items independently of the positive minimum for planned durations. Explicit Next and Previous operations preserve identity across reorders, account for configured buffers and locked durations, and accumulate completed-item variance against the original run plan. Advancing the final item completes the meeting; rewinding a completed meeting reopens it paused, while every rewind retains the recorded variance until that item advances again. Pinned boundaries govern manual interval adjustments.

Remaining unlocked items can be redistributed when the meeting runs ahead or behind while locked durations remain fixed. During an open run, the active item stays fixed and completed/future items can reorder only inside their respective partitions; additions and unstaged items are placed after the active item, and bulk replacement rejects lifecycle-breaking changes. Removing the active item starts its successor at the replacement time. The rendered timeline uses actual interval offsets, so configured buffers appear as genuine gaps. Exports distinguish expected, actual/live, and projected timing as applicable.

## Persistence and sharing

Every state change is normalized before subscribers render it. Ordinary durable state is stored in localStorage. Share links use a compressed, versioned payload containing active and staged items, metadata, export options, and all portable settings, including pinned boundaries and custom colors. Opening an explicit share link, or an unmarked legacy `?s=` payload that differs from the remembered local URL payload, starts an isolated sessionStorage-backed tab session, so editing or reloading the shared copy cannot overwrite the browser's ordinary local workspace; a matching ordinary URL still restores full local runtime, and navigating an isolated tab to the bare app resumes the local workspace. Live runtime anchors and personal panel/splitter layout are deliberately excluded from shared URLs. URL and browser-storage failures are isolated so one unavailable persistence mechanism does not prevent the app from running.

Undo/redo keeps a bounded in-session history, coalesces rapid edits, and groups continuous tracker-edge resizing. Panel order and splitter dimensions are separate local preferences.

Agenda row updates retain existing controls and native text undo history. Duration inputs preserve unfinished drafts until blur or Enter, then validate and normalize them; invalid values produce a visible warning. Clock-time edits retain the selected interval boundary's calendar date, including boundaries after midnight.

## Interface behavior

Desktop layouts use independently resizable, swappable panels with keyboard-operable separators. Each panel declares usable inline and block minima; the split hierarchy derives its bounds from the panels currently occupying each slot, so swapping does not strand controls in an undersized destination. Narrow or short workspaces cross a shared breakpoint into a stacked layout. At that breakpoint, agenda, export, and staging content grows into the outer stage instead of creating nested panel scrollbars; long-form notes and the keyboard-accessible Settings drawer remain deliberate local-scroll regions. Shared grid geometry keeps INPUT headings aligned with both ordinary and variance rows.

Before tracking begins, Agenda Status says that the meeting has not started, Current Status counts down to the scheduled start, and the item controls form one large Start Meeting action. During a run, those controls become Previous Item and Next Item; while paused, the primary action becomes Resume Meeting; after completion, it becomes a disabled completion label. Agenda Status always describes schedule variance as ahead, behind, or on time, while Current Status explicitly labels time left, used, or over on the active item.

The tracker displays current progress, completed items, live overtime, buffer gaps, displaced labels, and status variance. Its active-item gradient begins at the top of the colored block, so compressed time annotations do not shift the highlight. Pixel-positioned annotations are suppressed during panel or pop-out resizing and redrawn from settled geometry afterward. The synchronized pop-out has its own wide, stacked, and short-landscape grids, recomputes geometry in its viewport, and keeps document overflow hidden.

Each row's color control opens a continuous hue/saturation picker with fixed lightness. Bulk color input additionally accepts preset numbers 1–8 or exact six-digit hex values; legacy preset hex values canonicalize back to preset storage. Preset and custom colors keep their accent, surface, and readable text treatments in staging and every other agenda view in both themes. Optional adjacent-color separation applies consistently during adds, reorders, and staging moves.

Bulk column editing supports Item, Lead, Color, Duration, Locked, and Notes. Whole-agenda CSV uses the nine-column schema `ID,Item,Lead,Color,Duration,Locked,Context,Preparation,Notes`; stable IDs keep authored details and tracker identity attached across reorders, while blank IDs create new items and duplicate IDs are rejected. The former six-column CSV schema remains import-compatible and preserves hidden fields positionally. Escaped values, unsaved format changes, original source line numbers, and malformed-row highlighting are preserved. Duration parsing and schedule redistribution round-trip tenths of a minute without floating-point display noise. Export rendering escapes user content, permits only HTTP(S) meeting links, uses the local calendar date, and produces structured attendee and action-item sections.

## Verification

The Playwright suite is organized around user-visible behavior. State tests cover persistence, imports, timing math, lifecycle, and run guards; browser tests cover editing and exports, phase controls, responsive/swappable layouts, tracker and pop-out geometry, accessibility, colors, alerts, and the parent-site route. Overlapping cases are consolidated to keep the suite readable.

Playwright serves the repository root through `playwright.config.js`; `npm test` runs the complete browser suite against Chromium.
