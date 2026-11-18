# Base64 link finder

Pass `{"text":"aHR0cHM6Ly9leGFtcGxlLm9yZw==","layers":1}` to
`window.B64.submit(request)` or `node b64/cli.mjs request.json`. The CLI also reads JSON from stdin.
The computation runs locally and leaves the open editor alone.

`text` is required and accepts up to 256,000 UTF-16 code units. The optional integer
`layers` defaults to 1 and accepts 1–99. The result combines the editor's decoded
`links`, scan `limited` flag and scan `steps` with `encoding` (value and step previews).
The example finds https://example.org at depth 1. An encoding that exceeds the output
limit reports `encoding.error` alongside the scan result. Invalid request fields throw
an error with `code`, `message` and `issues`. The CLI writes it under `error` on stderr
and exits 1, or 2 for usage or file errors.
