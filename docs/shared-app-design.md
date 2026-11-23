# Shared app design

Use these requirements when building a vetr.dev tool or revising its interface. Existing apps illustrate individual decisions. Adoption varies, particularly in older headers and standalone bundles.

## Show the actual app in its directory tile

Pick one recognizable task and show what the user supplies, changes or sees as a result. Use the app’s renderer, its computed output or a recording of real UI states. Simplify the composition for the tile while preserving what the controls do and what the result means. For example, a Travel Prompt preview should show a travel preference becoming part of a copyable brief. An animated route alone suggests that the app plans routes. Raster to Vector shows its input pixels resolving into the contours its converter produces. [Card generators](../scripts/landing-art/cards/) · [Raster to Vector example](../scripts/landing-art/cards/raster-to-vector.mjs)

Compose for the space the tile actually receives. A wide well can put input beside output, a tall one can stack them. Preserve image proportions, readable labels and the important action at both sizes. Choose a useful still for motion-off. Follow the directory’s existing playback controls for hover, keyboard focus, touch, background tabs and reduced motion. [Directory playback and layout](../README.md#the-landing-page)

## Give the work the viewport

- **Desktop.** Give an editor’s canvas, a recommendation list or a figure the available width and height. A narrow settings column beside a large work surface suits Matrix Rain. Simultaneous views suit a comparison tool. Let long lists scroll within their own panes. Keep a readable line length for teaching prose and preserve a print sheet’s physical aspect ratio. [Matrix Rain](../matrix-rain/) · [Statistical Intuitions](../intuitions/) · [Name Tags](../name-tags/)
- **Adjustable panels.** Where users divide their attention between two working panes, give them a discoverable drag bar with a usable hit area, sensible bounds and keyboard arrows. Give the separator an accessible name, orientation and current value. This applies to stacked panes too, such as Rating Prediction’s catalog and rated list. A single-column form needs no splitter. [Stan Studio dock](../stan2r/index.html) · [Rating Prediction](../rating-prediction/index.html) · [Sankey inspector](../sankey/index.html)
- **Phone and short landscape.** Choose the reading and interaction order deliberately. Keep the result near its primary input. Collapse secondary settings, stack related panes or offer a jump to the preview. Keep the primary action and result reachable with touch and the on-screen keyboard. The shared base gives touch controls a 44 px target height and editable fields at least 16 px text. [Shared layout and touch rules](../shared/base.css)

## Keep the header small

Place a compact Back link in the top-left of the existing header. Link app entry pages to the directory and nested views to their parent. Give an icon-only link a destination-specific accessible name such as “Back to vetr.dev”. A real link also works for someone arriving directly at a deep link. Keep title, navigation and essential actions on one line at phone widths. Move secondary actions into the existing menu or help dialog before adding a row. Keep controls shared by sibling views in the same position. [Stan Studio header](../stan2r/index.html) · [Paired alphabet editors](../motrpac-alphabet/)

Stretch Snack and Travel Prompt use the compact [directory Back link](../shared/tool-nav.css). The upper-left placement is a rollout target for older apps. Matrix Rain currently puts its directory link on the right, and several older shells omit a header link. Earlier revisions removed a separate Home / Help / Source / Feedback strip because it crowded the work. Preserve each app’s native controls and breadcrumbs when fitting the link. [Header architecture](architecture.md) · [Existing navigation checks](../shared/tests/tool-nav.browser.mjs)

## Use controls that fit the decision

- Show a few named choices as aligned buttons. Pair a familiar pictogram with a label when it aids recognition. Use a two-position switch for binary settings, a slider with a visible value and units for an ordered range, and a searchable list or select for many choices. Put panel actions beside what they affect. Keep common actions available to keyboard and touch users. [Shared light switch](../shared/light-switch.js) · [Palette Town controls](../color-optimization/index.html)
- Keep explanations close to the question. A small, named help button can open methods, sources or keyboard shortcuts. Show errors at the field and identify stale results before export. Give meaningful edits Undo/Redo, preserve native text undo and restore focus after dialogs. [Palette Town’s methods dialog](../color-optimization/index.html) · [Shared history](../shared/history.js)
- Support light and dark themes throughout, including canvases, plots, controls and preview stills. Follow the system until the user chooses a theme, then carry the choice across pages. Use text, shape or icons alongside colour for selection, warnings and direction of change. Retain distinctive app palettes and specialist workspaces such as Sankey’s. [Theme handling](../shared/theme.js) · [Shared colour and focus styles](../shared/base.css)

## Make the tool usable outside its page

Expose the core operation through a documented machine-accessible API. For new analysis and generation tools, have the GUI, browser API and JSON CLI call the same implementation. Document one working request, result and structured errors, and link the contract from the directory’s API index. Preserve supported standalone and offline entry points. Sankey documents a browser-driven command line, and Wanderwart packages local copies of its shared UI. [Programmatic access](../README.md#programmatic-access) · [API index](../llms.txt) · [Sankey API](../sankey/api.md)

## Check the result

Exercise one complete task with representative content at a desktop width, phone portrait and short landscape. Check the header, splitters, keyboard focus, touch actions and the most space-constrained result in both themes. For a directory tile, compare its action with the app, inspect its wide and narrow compositions, and pause it mid-loop. For a changed API, run the documented example through the page and CLI. [Directory checks](../scripts/tests/landing-browser.mjs) · [Playback checks](../scripts/tests/landing-playback.mjs)
