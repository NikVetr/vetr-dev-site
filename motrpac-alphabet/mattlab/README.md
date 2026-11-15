# Mattlab Logo Painter · Cardinal Studio

Paint the twenty pieces of the Mattlab mark, develop letter and number studies, and export individual SVG/PNG images or labeled character sheets. The app is a companion to the [MotRPAC alphabet editor](../), with independent geometry and saved projects.

Serve the site root using `python3 -m http.server 4199 --bind 127.0.0.1` and open `/motrpac-alphabet/mattlab/`. There is no build step or runtime dependency. Tests use Node's built-in runner (`npm test`); browser checks use the repository's existing Playwright installation (`node tests/browser.cjs`).

Choose a color and click or drag over pieces. Keyboard-focused pieces support Enter or Space. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo and redo edits; native text-input undo is preserved. Projects autosave locally. **Save project** exports editable JSON; **Open** restores it, including projects saved by the standalone HTML. Switching between the two editors keeps their projects separate. Help retains the original palette, corner-link, zoom, navigation and character-sheet controls.

The six JavaScript modules separate color conversion, immutable logo geometry and exports, curated glyph studies, the project/history model, sheet rendering, and the UI controller. [API and CLI](api.md) access shares those implementations. `index.html` and `styles.css` preserve the supplied Cardinal Studio interface; navigation occupies its existing header.

The imported source is the user-supplied `mattlab-logo-painter.html`; its exact SHA-256 and size are recorded in [provenance.json](provenance.json). Its original `cardinal-studio:<geometry>:v2` storage key is retained, with support for its v1 key. Files opened directly from disk have a different storage origin: use Save project in that copy, then Open here to transfer its studies.
