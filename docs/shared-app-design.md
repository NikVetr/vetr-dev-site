# Building a vetr.dev tool

Start here when adding a tool or revising its interface. The design requirements come first, then the files a tool needs and the steps that add it to the directory. Existing apps illustrate individual decisions. Adoption varies, particularly in older headers and standalone bundles.

For general interface detail, [Vercel's Web Interface Guidelines](https://vercel.com/design/guidelines) are a useful reference. Where they conflict with this page, this page wins, and their Vercel brand rules (Title Case, “&” for “and”) do not apply.

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
- Where a spacing, size or other visual quantity is a matter of taste, ship a good default and expose it as a setting rather than burying a tuned constant. Text in Image’s **Letter glow** slider and Sankey’s text-size slider are examples.
- Keep explanations close to the question. A small, named help button can open methods, sources or keyboard shortcuts. Show errors at the field and identify stale results before export. Give meaningful edits Undo/Redo, preserve native text undo and restore focus after dialogs. [Palette Town’s methods dialog](../color-optimization/index.html) · [Shared history](../shared/history.js)
- Give every dialog a header that stays in view while its body scrolls, with the dialog’s title on one side and the close control on the other (`.dialog-head` in the shared base). Controls that belong to the dialog’s chrome, such as a theme switch in a settings dialog, sit in that header.
- Support light and dark themes throughout, including canvases, plots, controls and preview stills. Follow the system until the user chooses a theme, then carry the choice across pages. Retain distinctive app palettes and specialist workspaces such as Sankey’s. [Theme handling](../shared/theme.js) · [Shared colour and focus styles](../shared/base.css)
- Show each state that matters with two independent cues. Pair a change of colour, tint or outline (selected, unset, disabled, leads elsewhere, warning, direction of change) with a glyph, mark or text change, and keep that second cue small and consistent within the app.

## Keep every word, and move only with purpose

- When text does not fit, shrink it slightly or let it wrap. Never truncate, clip, ellipsize or omit user-visible wording: avoid `text-overflow: ellipsis` and `overflow: hidden` on text, and wrap with `overflow-wrap: break-word` rather than `anywhere`. The layout gives way to the words.
- Do not animate for decoration. Panels open, results appear and lists reorder without transitions; carry the information by layout, weight, colour or a mark. Motion belongs only where removing it would break the feature: a directory tile’s loop on hover or focus, a progress indicator, or a movement that shows where something went. Give it a still under `prefers-reduced-motion` and keep any flashing below three per second.

## Restyle without losing function

A visual redesign, including one guided by generated mockups, changes the look: typography, spacing, palette, hierarchy and grouping. Keep every existing control, output, state and behaviour. Adopt a functional change only when it genuinely expands the tool, and name it as an addition. Check the restyled page against the original’s controls and its browser tests.

## Make the tool usable outside its page

Expose the core operation through a documented machine-accessible API. For new analysis and generation tools, have the GUI, browser API and JSON CLI call the same implementation. Document one working request, result and structured errors, and link the contract from the directory’s API index. Preserve supported standalone and offline entry points. Sankey documents a browser-driven command line, and Wanderwart packages local copies of its shared UI. [Programmatic access](../README.md#programmatic-access) · [API index](../llms.txt) · [Sankey API](../sankey/api.md)

## Files a tool needs

A tool lives in its own top-level folder, served at `/<folder>/` with no build step. Use `forecast-calibration/` as the reference for the API shape and `crossword/` for the page shell.

- **`index.html`** with a viewport meta, a `<meta name="description">`, and a `<title>` that says what the tool does (pair a coined name with its function, as in “Palette Town — Color Palette Extender”). In `<head>`, link `../shared/base.css` before the tool’s own `style.css`, link `../shared/tool-nav.css`, and load `../shared/theme.js` as a plain script so the page paints in the right theme. Add `../shared/tool-nav.js` (deferred) when the page has help sections reachable by direct link. Put the theme switch on `#theme-toggle` and the Back link first in the header: `<a class="directory-back" href="../" aria-label="Back to vetr.dev">` with an icon ([Stretch Snack](../stretch-snack/index.html)).
- **`style.css`** with only what is particular to the tool; the frame, tokens, controls, issues list, stale-result styles and dialog come from the shared base.
- **`core/`** (DOM-free `submit`), **`cli.mjs`**, **`api.md`**, `window.<ToolName>` in the page, and Undo/Redo through `shared/history.js`. Import shared modules by relative path (`../shared/rng.js`) and draw any randomness from a seeded generator there. [Shared code](../README.md#shared-code-and-look)
- **Tests** run with `node --test` in the folder; browser tests use Playwright through `npm ci` or the `PLAYWRIGHT` variable.

A specialist workspace with its own visual language may skip the shared base, as Sankey does; say so in the README.

## Add it to the directory

The landing page lists each public tool once. These steps touch four places; the first card in a category is a good one to copy.

1. **Card.** In [`index.html`](../index.html), copy an `<li>` from the tool’s category and set `data-mosaic-key`, `data-category` (`everyday`, `academic` or `art`) and `data-size`; the `.card-art`’s `data-art`; the link’s `href`; the `-title` and `-desc` ids that `aria-labelledby` and `aria-describedby` name, keeping `category-<category>` in the latter; the title, a one-sentence description and the `<time>` source date. The key is the card’s id. It names the arrangement entries, the card module and the picture, and is usually the folder name (`media-ratings` links to `/rating-prediction/`). Place the card within its category’s run, since the HTML order is the one-column and no-JavaScript order. The first card of each category carries its anchor id (`id="everyday"`, `tabindex="-1"`).
2. **Size.** Choose `data-size` from the code-size rule and shape table in [Tile sizes](../README.md#tile-sizes), and add the tool’s row to that table with any adjustment and its reason.
3. **Arrangements.** In [`assets/landing-order.js`](../assets/landing-order.js), add the tile to every column count: 2, 4, 5, 6, 7, 8, 9 and 10. Each arrangement must name every card exactly once and fill a complete rectangle, so the neighbouring tiles usually need new spans or positions. Spans may differ from `data-size`; a tile can widen or gain a row to complete an edge. Keep each category connected. A missing or extra entry makes [`shared/mosaic.js`](../shared/mosaic.js) throw at that width, and only the browser check below catches it before release.
4. **Picture.** Add `scripts/landing-art/cards/<key>.mjs` exporting `build()`, which returns SVG text from `art()` in [`svg.mjs`](../scripts/landing-art/svg.mjs). Draw it from the tool’s own core, or drive its page in headless Chromium through `scripts/landing-art/browser.mjs`, using the default or an explicitly selected example. Size the canvas for the shape (`W`×`H`, `WIDE` or `TALL`), or pass `responsive: true` when inner SVGs or container queries adapt to the well. Colour with `INK`, `MUTED`, `LINE`, `PAPER` and the page’s own tokens so it follows the theme. Put the loop’s rules in `loop` (or use `flipbook`) with its `period`; the resting frame is the motion-off still. Run `node scripts/landing-art/build.mjs <key>` and commit `assets/cards/<key>.svg`.
5. **Canvas player (only if CSS cannot draw the loop).** Add `assets/players/<key>.js` exporting `prepare()`, which loads anything shared once and may be async, and `create(art, plan)`, which returns `{play, pause, destroy}`. Pause keeps the current frame; redraw a paused frame only for a resize or theme change. Pass `player: '<key>'` to `art()`, and `playerBox` for where it draws over the still. [Text in Image player](../assets/players/text-in-image.js)
6. **Documentation.** Describe the tool in the README’s [Finding your way around](../README.md#finding-your-way-around), add its API to [`llms.txt`](../llms.txt), and update [architecture](architecture.md) only for new components, data flow or interfaces.

## Check the result

Exercise one complete task with representative content at a desktop width, phone portrait and short landscape. Check the header, splitters, keyboard focus, touch actions and the most space-constrained result in both themes. For a changed API, run the documented example through the page and CLI.

For a directory tile, compare its action with the app, inspect its wide and narrow compositions, and pause it mid-loop. Run `node scripts/tests/landing-browser.mjs` for packing, reading order, category boundaries, density and text fit at every width, and `node --test scripts/tests/landing-playback.mjs` for playback. Both need Playwright (`PLAYWRIGHT=<path to playwright>` or `npm ci` in any tool folder). [Directory checks](../scripts/tests/landing-browser.mjs) · [Playback checks](../scripts/tests/landing-playback.mjs)
