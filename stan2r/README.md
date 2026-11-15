# Stan2R

A browser interface to the deterministic [Stan2R converter](https://github.com/NikVetr/Stan2R/tree/hardening). It uses Stan's compiler to parse and type-check a model, then the same R translator as the native package to produce generative R code. Models stay on the user's device.

Serve the repository root (`python3 -m http.server 8000`) and open `/stan2r/`. Choose a conversion mode, edit or open a self-contained Stan model, and select **Convert to R**. The first successful conversion downloads the pinned webR runtime from `https://webr.r-wasm.org/v0.5.8/`. The generated script can be copied or downloaded; this page does not execute it or fit a model.

The data and posterior-draw controls accept JSON. Data values may be numbers, numeric vectors, or rectangular numeric matrices. Posterior draws are columns of numbers keyed by CmdStan names (including `theta[1]`). Select a one-based draw number. The converter embeds that parameter draw in the result; the generated script reads data from an R list named `dat` and leaves its results in `out`. Density modes return ordinary densities/probabilities, not log densities.

Text fields keep their native Undo/Redo shortcuts. The Undo/Redo buttons and Ctrl/⌘Z, Ctrl/⌘Shift Z outside text fields restore changes to the model, examples, data, draws, and mode.

## Programmatic use

`window.Stan2R.submit(request)` returns a promise for `{code, mode, warnings, compiler, translator}`. See [api.md](api.md). The CLI shares the request mapping, compiler, R translator, and host adapter:

```sh
node stan2r/cli.mjs request.json
```

The CLI needs Node 22+ and `Rscript` on `PATH`; it uses base R only, with no CmdStan installation or network access. It can also read a JSON request from stdin. Failures are structured JSON on stderr with a nonzero exit status.

## Implementation

- `core/request.js` validates requests and serializes JSON inputs into R literals.
- `vendor/stanc.js` is Stan's JavaScript compiler, version 2.38.0. Browser parsing runs in `core/compiler-worker.js`.
- `vendor/R/` contains unchanged source from Stan2R commit `e4f4b15`. `vendor/manifest.json` records each source hash.
- `core/bridge.R` replaces the native compiler/process boundary: it accepts the typed AST, constructs the original source-mapped program, and invokes the unchanged translator.
- `core/browser.js` loads webR only after Stan parsing succeeds. It serializes conversions through one R worker and reuses that runtime. The workers wait for messages when idle; there is no polling loop. PostMessage transport works on ordinary static hosting without cross-origin-isolation headers.
- `core/native.mjs` supplies the same bridge through a temporary `Rscript` process; `cli.mjs` is its JSON interface.
- `app.js` renders state and uses the collection's shared history and theme controls.

The browser needs an initial network connection to fetch webR. A failed load is shown in the interface and can be retried. webR's PostMessage transport does not support interrupting R evaluation; conversion is serialized and the interface remains responsive. Current Stan2R limitations are preserved: unsupported constructs produce errors, while the existing bounded-prior and ordered-parameter approximations produce visible warnings. External Stan includes, model fitting, and the package's plotting/flattening workflows are not exposed by this interface. Input arrays above two dimensions are rejected explicitly; they are not flattened silently.

The R runtime uses substantially more memory than a small JavaScript-only tool. In the desktop Chromium check, its renderer process was about 460 MiB with the runtime loaded; after startup settled, three consecutive two-second idle measurements showed no added renderer CPU time. A repeated small conversion took about 140 ms on that host. These are development measurements, not mobile-device guarantees.

## Validation

```sh
node --test stan2r/tests/core.test.mjs
node --test stan2r/tests/browser.test.mjs
```

The browser test uses the collection's existing Playwright installation (`name-tags/node_modules/playwright`), or an absolute package path in `PLAYWRIGHT`. It starts its own static server, compares twelve conversions against the original native compiler/package output, checks structured failures, offline-runtime messaging, keyboard history, and desktop/mobile rendering. The core test requires Rscript. Test fixtures cover all four modes for bounded-normal, beta–binomial, and Student-t/user-function models.

To regenerate reference fixtures, point `STAN2R_SOURCE` at the original hardened R checkout and run `node stan2r/tests/refresh-reference.mjs`. This calls native stanc and the original R entry point, independently of the browser bridge.

`npm ci --prefix stan2r` installs development-only Node type declarations. Application code and the CLI have no npm runtime dependencies.
Run the existing TypeScript checker with `tsc --project stan2r/tsconfig.json` to check the UI, adapters, and tests.
