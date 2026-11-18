# Wanderwart sheet generation

`window.Wanderwart.submit(request)` returns a Promise. The same request runs in
Node using `node pocket-language-guide/cli.mjs request.json` or JSON on stdin.

```json
{"target":"es","source":"en","settings":{"typeface":"sans","inkMode":"mono"}}
```

`target` is the language on the card and `source` is the reader's language.
Both must be registry codes. Omit `settings` for the studio's default card.
It accepts saved-card SheetSpec settings, including selection, geometry, paper,
field set, theme, and speaker profile. Geometry and paper fields override the
preset individually. Pass saved phrase overrides and extras in optional `edits`.
The API uses the explicit speaker profile in the request. It leaves the reader's
saved cards and studio session alone.

The result contains the resolved `spec` and the shared solver's `plan`, including
faces, drawing commands, scale and warnings. See the [sheet and plan types](core/types.js).
The existing render commands in the tool directory produce finished files:
`node scripts/render_pdf.mjs --target es --source en --out guide.pdf` and
`npm run preview -- --target es --source en --out preview`.

Invalid fields throw `invalid_request`. A plan with no printable faces throws
`layout_failed` with its solver warnings. CLI errors appear under `error` on
stderr. Exit 1 indicates a request or generation failure, 2 indicates a usage
or I/O error.
