# Mattlab Logo Painter · Cardinal Studio

Paint the twenty pieces of the Mattlab mark, develop letter and number studies, and export individual SVG/PNG images or labeled character sheets. The app is a companion to the [MotRPAC alphabet editor](../), with independent geometry and saved projects.

Serve the site root using `python3 -m http.server 4199 --bind 127.0.0.1` and open `/motrpac-alphabet/mattlab/`. There is no build step or runtime dependency. Tests use Node's built-in runner (`npm test`); browser checks use the repository's existing Playwright installation (`npm run test:browser`).

Choose a color and click or drag over pieces. Keyboard-focused pieces support Enter or Space. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo and redo edits; native text-input undo is preserved. Projects autosave locally. **Save project** exports editable JSON; **Open** restores it, including projects saved by the standalone HTML. Switching between the two editors keeps their projects separate. Help retains the original palette, corner-link, zoom, navigation and character-sheet controls.

The six JavaScript modules separate color conversion, immutable logo geometry and exports, curated glyph studies, the project/history model, sheet rendering, and the UI controller. [API and CLI](api.md) access shares those implementations. `index.html` and `styles.css` preserve the supplied Cardinal Studio interface; navigation occupies its existing header.

The imported source is the user-supplied `mattlab-logo-painter.html`; its exact SHA-256 and size are recorded in [provenance.json](provenance.json). Its original `cardinal-studio:<geometry>:v2` storage key is retained, with support for its v1 key. Files opened directly from disk have a different storage origin: use Save project in that copy, then Open here to transfer its studies.

Right-click a painted piece to move its linked colour family to the next palette row throughout the current study, preserving each piece’s shade column. Right-clicking a palette row does the same for that row; Shift cycles backward. The selected paint brush stays unchanged. Moving into an occupied row combines its pieces; Undo restores the previous grouping. Middle-click changes only the brush family. Scrolling over the artwork cycles the Paint, White, Clear and Pick tools in either direction; scrolling elsewhere remains normal page scrolling. Ctrl/Cmd-scroll and pan mode retain browser zoom/navigation behavior. Repeated clicks on a linked piece cycle its three shades, then white (blank), then back to the first shade. The explicit White tool stays white on repeated clicks.

The gallery includes the original mark and editable letter, numeral and punctuation guesses. Space is intentionally empty. These are geometric starting points constrained to the logo’s existing polygons. Untouched blank starters receive the new guesses; edited characters are preserved. Retired colour-study presets are removed from the ordinary gallery; any edited copies remain in **Saved studies** and project exports.

The MotRPAC/Mattlab switch sits at the start of both editor headers and shares the collection’s lightswitch component. Mouse, touch, Space and Enter activate it; each editor retains its own saved project.
