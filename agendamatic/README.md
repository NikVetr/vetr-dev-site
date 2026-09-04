# autoCHAIR

A real-time meeting agenda tracker with visual timeline, state persistence, and export capabilities. Runs entirely in the browser as a static site.

## Features

- **Dynamic Agenda Management**: Add, edit, delete, and reorder agenda items with drag-and-drop
- **Automatic Time Calculation**: Durations automatically calculate start/end intervals
- **Visual Timeline**: Gantt-style horizontal bar chart showing agenda items
- **Real-time Tracking**: Current time marker moves across the timeline, with pause/resume and explicit completion
- **Smart Time Adjustment**: Unlocked items proportionally resize when running behind/ahead
- **Locked Items**: Lock specific items to prevent their duration from being adjusted
- **Status Monitor**: Clear display of whether you're on time, behind, or ahead
- **State Persistence**: Ordinary work persists in the URL and localStorage; opened share links, including legacy unmarked links, use isolated tab storage
- **Undo/Redo**: Use Ctrl/Cmd-Z and Ctrl/Cmd-Shift-Z outside text editors
- **Panel Layouts**: Drag panel headers to swap slots; panel order and splitter sizes persist locally
- **Bulk Editing**: Edit Item, Lead, Color, Duration, Locked, or Notes as lists, or edit all nine CSV columns with stable IDs; former six-column CSV remains import-compatible
- **Item Colors**: An arbitrary fixed-lightness HSL picker, eight compatible preset values, readable light/dark tokens, and optional adjacent-color separation
- **Configurable Alerts**: Multiple warning offsets, sound/visual styles, previews, overtime pulses, and optional desktop notifications
- **Meeting Metadata**: Persist title, local date, location, safe meeting URL, multiple attendee groups, attendance, and structured action items
- **Shareable Links**: Copy a versioned URL containing the complete agenda configuration and metadata
- **Export Options**: Export to Markdown, text, Word-compatible HTML, or JSON; completed runs export as minutes
- **Import/Export**: Full JSON import/export for backup and transfer
- **Responsive Layout**: Usable stacked panels and an accessible Settings drawer on phones and tablets
- **Customizable Settings**: Dark mode, density, buffer time, pinned boundaries, and more
- **Tooltips**: Helpful tooltips explain each feature

## Running Locally

### Option 1: Python HTTP Server

```bash
cd agendamatic
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

### Option 2: Node.js HTTP Server

```bash
npx http-server agendamatic -p 8000
```

Then open http://localhost:8000 in your browser.

### Option 3: VS Code Live Server

1. Install the "Live Server" extension in VS Code
2. Right-click on `index.html`
3. Select "Open with Live Server"

### Option 4: Direct File Access

Modern browsers may block ES modules when opening files directly. If you see CORS errors, use one of the server options above.

## Project Structure

```
agendamatic/
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # All styles with CSS variables
├── js/
│   ├── main.js         # Entry point, initialization
│   ├── state.js        # State management, URL/localStorage
│   ├── colors.js       # Preset/custom color normalization and theme tokens
│   ├── agenda.js       # Agenda CRUD, drag-drop
│   ├── alerts.js       # Warning scheduler and alert presentation
│   ├── bulk-edit.js    # Column-list and CSV editing
│   ├── metadata.js     # Meeting details, attendee groups, and action items
│   ├── panel-swap.js   # Persistent panel-slot swapping
│   ├── staging.js      # Carry-forward item workflow
│   ├── layout-resize.js # Persistent panel split resizing
│   ├── timer.js        # Timeline, real-time tracking
│   ├── tooltips.js     # Tooltip engine
│   ├── utils.js        # Time formatting helpers
│   └── export.js       # JSON/Markdown export
├── tests/              # Playwright state and browser regressions
├── package.json        # Test tooling only; the app has no build step
├── playwright.config.js
├── example/
│   └── inspiration.html # Original design reference
└── README.md
```

## Usage

### Agenda Items

- **Add Items**: Click "+ Add Item" to add new agenda entries
- **Edit**: Click any field to edit item name, lead, or duration
- **Bulk Edit**: Click a column heading or the "Edit CSV" button; whole-agenda CSV uses `ID,Item,Lead,Color,Duration,Locked,Context,Preparation,Notes`, preserving item identity through reorders
- **Colors**: Click a row swatch to choose hue and saturation at a fixed readable lightness. The bulk Color editor also accepts preset numbers `1`–`8` or six-digit hex colors
- **Duration Format**: Enter duration as `5m`, `2.5m`, `1.5h`, `1h30.5m`, or just `30`; calculations retain tenths of a minute
- **Reorder**: Drag items by the grip handle (⋮⋮) to reorder
- **Undo/Redo**: Press Ctrl/Cmd-Z to undo an app action and Ctrl/Cmd-Shift-Z to redo it; focused text fields keep native text undo behavior
- **Lock**: Check the lock icon to prevent duration adjustment when running late
- **Delete**: Click × to remove an item

### Timeline Tracker

- **Start**: Click "Start" to begin tracking the meeting
- **Stop/Resume**: Pause without counting stopped time toward the schedule or current item
- **Current Time**: Red triangle marker shows current position
- **Active Item**: Current item is highlighted on the timeline
- **Advance/Rewind**: Use Next Item/Space and Previous Item/Backspace to control completion explicitly; Next on the final item completes the meeting
- **Pop Out**: Open the tracker/status display in a separate projector-friendly window

### Export & Share

- **Metadata**: Add meeting details, attendee groups, attendance, and assigned action items before export
- **.md/.txt/.doc**: Download an agenda before a run or minutes after tracking starts
- **.json**: Download full state as JSON
- **Import**: Load a previously exported JSON file
- **Share Link**: Copy a versioned URL with agenda items, staging, metadata, export choices, and settings; opening that link creates an isolated tab session, while live run state and personal panel layout stay local

### Settings

- **Start Time**: Set meeting start time
- **Dark Mode**: Toggle dark color theme
- **Density**: Comfortable, Compact, or Presentation mode
- **Buffer**: Auto-add minutes between items
- **Progress Bar**: Show overall meeting progress
- **Timer Mode**: Switch between time remaining and elapsed time
- **Alerts**: Configure multiple offsets such as `5m, 60s, 0s`, preview them, and choose sound/visual/desktop delivery
- **Sync System Time**: Set the agenda start to the current time when enabled

## State Persistence

autoCHAIR preserves or transfers your agenda in three ways:

1. **URL Parameters**: Portable configuration is compressed and encoded in the URL query string
2. **Browser Storage**: Ordinary work is saved in localStorage; explicit share links and unmarked legacy payloads that differ from the remembered local URL use isolated sessionStorage so they cannot replace that browser's local workspace
3. **JSON Export**: Manual backup/restore via JSON files

The URL is automatically updated as you edit. Share links omit live tracker anchors and local layout preferences; the recipient can edit and reload the shared agenda in its tab without overwriting the browser's ordinary working copy.

## Tests

Install the test dependency once, then run the browser suite:

```bash
npm install
npm test
```

The Playwright suite covers state migration and normalization, URL and isolated-share persistence, tracker lifecycle and timing math, buffers and pins, live agenda mutations, responsive and keyboard-accessible layouts, metadata, exports, stable-ID CSV editing, fractional durations, custom colors, pop-out synchronization, and the parent-site link.

## Deployment

This is a static site that can be hosted on any web server:

- GitHub Pages
- Netlify
- Vercel
- Any static file host

Simply upload the files and ensure your server serves `index.html` for the root path.

## Browser Support

Works in all modern browsers that support:
- ES Modules
- CSS Custom Properties (Variables)
- CSS Grid
- LocalStorage
- SessionStorage
- History API

## License

MIT
