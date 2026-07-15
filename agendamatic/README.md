# autoCHAIR

A real-time meeting agenda tracker with visual timeline, state persistence, and export capabilities. Runs entirely in the browser as a static site.

## Features

- **Dynamic Agenda Management**: Add, edit, delete, and reorder agenda items with drag-and-drop
- **Automatic Time Calculation**: Durations automatically calculate start/end intervals
- **Visual Timeline**: Gantt-style horizontal bar chart showing agenda items
- **Real-time Tracking**: Current time marker moves across the timeline
- **Smart Time Adjustment**: Unlocked items proportionally resize when running behind/ahead
- **Locked Items**: Lock specific items to prevent their duration from being adjusted
- **Status Monitor**: Clear display of whether you're on time, behind, or ahead
- **State Persistence**: State saved to URL and localStorage
- **Undo/Redo**: Use Ctrl/Cmd-Z and Ctrl/Cmd-Shift-Z outside text editors
- **Panel Layouts**: Drag panel headers to swap slots; panel order and splitter sizes persist locally
- **Bulk Editing**: Edit Item, Lead, Color, or Duration columns as lists, or edit the whole agenda as escaped CSV
- **Item Colors**: Eight-color palette, per-item color picker, current-item header tint, and optional adjacent-color separation
- **Configurable Alerts**: Multiple warning offsets, sound/visual styles, previews, overtime pulses, and optional desktop notifications
- **Meeting Metadata**: Persist title, date, location, meeting URL, attendees, and attendance
- **Shareable Links**: Copy URL to share your agenda with others
- **Export Options**: Export to Markdown, text, Word-compatible HTML, or JSON; completed runs export as minutes
- **Import/Export**: Full JSON import/export for backup and transfer
- **Customizable Settings**: Dark mode, density, buffer time, and more
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
│   ├── agenda.js       # Agenda CRUD, drag-drop
│   ├── alerts.js       # Warning scheduler and alert presentation
│   ├── bulk-edit.js    # Column-list and CSV editing
│   ├── metadata.js     # Meeting details and attendance
│   ├── panel-swap.js   # Persistent panel-slot swapping
│   ├── staging.js      # Carry-forward item workflow
│   ├── layout-resize.js # Persistent panel split resizing
│   ├── timer.js        # Timeline, real-time tracking
│   ├── tooltips.js     # Tooltip engine
│   ├── utils.js        # Time formatting helpers
│   └── export.js       # JSON/Markdown export
├── example/
│   └── inspiration.html # Original design reference
└── README.md
```

## Usage

### Agenda Items

- **Add Items**: Click "+ Add Item" to add new agenda entries
- **Edit**: Click any field to edit item name, lead, or duration
- **Bulk Edit**: Click a column heading or the "Edit CSV" button
- **Colors**: Use the color swatch in each row; enable adjacent-color separation in Settings if desired
- **Duration Format**: Enter duration as `5m`, `1h`, `1h30m`, or just `30`
- **Reorder**: Drag items by the grip handle (⋮⋮) to reorder
- **Undo/Redo**: Press Ctrl/Cmd-Z to undo an app action and Ctrl/Cmd-Shift-Z to redo it; focused text fields keep native text undo behavior
- **Lock**: Check the lock icon to prevent duration adjustment when running late
- **Delete**: Click × to remove an item

### Timeline Tracker

- **Start**: Click "Start" to begin tracking the meeting
- **Stop**: Click "Stop" to pause tracking
- **Current Time**: Red triangle marker shows current position
- **Active Item**: Current item is highlighted on the timeline
- **Advance/Rewind**: Use Next Item/Space and Previous Item/Backspace to control completion explicitly
- **Pop Out**: Open the tracker/status display in a separate projector-friendly window

### Export & Share

- **Metadata**: Add meeting details and check attendance before export
- **.md/.txt/.doc**: Download an agenda before a run or minutes after tracking starts
- **.json**: Download full state as JSON
- **Import**: Load a previously exported JSON file
- **Share Link**: Copy URL with encoded state to share

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

autoCHAIR saves your agenda in three ways:

1. **URL Parameters**: State is compressed and encoded in the URL query string
2. **Local Storage**: Automatically saved as you make changes
3. **JSON Export**: Manual backup/restore via JSON files

The URL is automatically updated as you edit, making it easy to bookmark or share specific agendas.

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
- History API

## License

MIT
