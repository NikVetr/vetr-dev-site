# autoCHAIR schedules and exports

`window.AutoChair.getAgenda()` returns a detached copy of the open agenda.
Give `window.AutoChair.submit(request)` a snapshot and an explicit timestamp to
calculate the schedule without starting a meeting or writing to browser storage.
The CLI accepts the same request via `node agendamatic/cli.mjs request.json` or stdin.

```json
{"at":"2026-11-18T12:00:00Z","agenda":{"settings":{"startTime":"09:30","buffer":2},"items":[{"id":"intro","name":"Introduction","duration":"5m"},{"id":"review","name":"Review","duration":"20m"}]},"format":"markdown"}
```

Items use the editor's duration syntax (e.g. `30m`, `1h15m`), unique IDs and
names. The buffer is whole minutes between items. Saved agenda JSON can carry
metadata, staged items, locks, export options and live tracker state. After
validation of required scheduling inputs, the same saved-state normalization
and scheduling rules as the editor apply. For an unstarted meeting the clock
time falls on the local date of `at`. For a live or paused meeting the saved
tracker anchors determine intervals. Display dates and formatted text use the
runtime's local timezone and locale.

The result includes `schedule` (items with ISO timestamps, status, and available
timing differences) and `variance` (expected/actual rows or null). Requesting
`format` adds `content` with Markdown, plain text or Word-compatible HTML
(`markdown`, `text`, `html`). Invalid requests throw an error with a code,
message and field issues. CLI errors use stderr and exit 1 for request failures,
2 for usage or unreadable files.
