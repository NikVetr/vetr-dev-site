# Stan2R

An interactive model explorer and browser interface to the deterministic [Stan2R converter](https://github.com/NikVetr/Stan2R/tree/hardening). It uses Stan's compiler to parse and type-check a model, then the same R translator as the native package to produce generative R code. Models stay on the user's device.

Serve the repository root (`python3 -m http.server 8000`) and open `/stan2r/`. The **Model explorer** starts with a normal model. Choose an example or edit/open a self-contained Stan model, then select **Build & simulate**. For the existing translator, select **R converter**, choose a conversion mode and select **Convert to R**. The first successful conversion downloads the pinned webR runtime from `https://webr.r-wasm.org/v0.5.8/`. The generated script can be copied or downloaded; the R converter does not execute that script or fit a model. The explorer runs its own explicit JavaScript prior simulation.

The data and posterior-draw controls accept JSON. Data values may be numbers, numeric vectors, or rectangular numeric matrices. Posterior draws are columns of numbers keyed by CmdStan names (including `theta[1]`). Select a one-based draw number. The converter embeds that parameter draw in the result; the generated script reads data from an R list named `dat` and leaves its results in `out`. Density modes return ordinary densities/probabilities, not log densities.

Text fields keep their native Undo/Redo shortcuts. The Undo/Redo buttons and Ctrl/⌘Z, Ctrl/⌘Shift Z outside text fields restore changes to the model, examples, data, draws, and mode.


## Interactive model explorer

The explorer builds a generative dependency graph from Stan's **typed compiler AST**, then draws independent Monte Carlo samples in a browser worker. It needs no webR download. Dependency-flow and plate views share the same graph; drag nodes or use arrow keys while a node is focused. Repositioning changes only the drawing, not the model. Plates label repeated elements; edges include shape/bound dependencies as well as distribution arguments.

Select a parameter to adjust literal prior arguments with sliders or number inputs. Hyperparameters are ordinary selectable nodes, so their changes propagate through the graph. **Fix value** makes a parameter deterministic (a scalar fixed value broadcasts across a vector). This is an explicitly labeled intervention, not posterior conditioning; zero-variance scenarios use Fix instead of passing an invalid zero SD to a distribution. Controls modify an exploration scenario while preserving the original source.

Histograms cover parameters, transformed parameters, and sampled data. Vector elements have separate selectors rather than being pooled. Colored bars show the current scenario; when it changes, a thin outline shows the original distribution on the same axes. Fixed seeds and per-variable random streams make changes easier to compare. Larger graphs scroll horizontally on small screens. Source/data edits mark the graph stale and disable its controls until rebuilt. Slider gestures, fixed values, diagram movement and view settings support Undo/Redo; stale worker replies cannot overwrite a newer edit.

**Export this model** produces LaTeX equations, a NumPy prior simulation script, or graph JSON. LaTeX and Python incorporate the current scenario and annotate its interventions. Python requires NumPy when run locally; it does not fit a PyMC model. The R converter continues to translate the original Stan source and uses its existing broader support boundary. A hierarchical normal example demonstrates a scale hyperprior and a transformed vector; setting `tau` to zero collapses the group deviations.

### Explorer support

- Scalars, vectors, row vectors and one-dimensional scalar arrays (sampled variables must be nonempty); single defining assignments in transformed data/parameters; arithmetic, scalar indexing, common elementwise transforms and reductions.
- One prior per parameter and one distribution per predicted data variable. Independent full-range loops such as `for (n in 1:N) y[n] ~ normal(theta[n], sigma)` are normalized exactly to their vectorized representation. Partial, nested, recurrent and indirect-index loops are rejected.
- Normal, lognormal, exponential, gamma (shape/rate), beta, uniform, Student-t, Cauchy, Bernoulli/logit, binomial and Poisson/log distributions. The exports and simulator use the same graph and argument conventions.
- Explicit univariate truncation, independent bounded priors, and bounded flat real priors. Parameter-dependent bounds/arguments without the required conditional normalizer are rejected, rather than adopting the R converter's documented approximation. Constraints on observed data validate supplied values but do not implicitly truncate predictions.

This is not a general Stan interpreter. Unsupported constructs include arbitrary `target +=` densities/Jacobians, multiple factors for a variable, cyclic graphs, user functions, matrices/multivariate distributions, generated quantities, constrained transformed parameters, outcome-dependent transformed-data preprocessing, and other control flow. Unsupported or numerically invalid models fail explicitly. Limits on model size, returned values and rejection attempts protect browser responsiveness; see [API limits](api.md#graphs-and-javascript-prior-simulation). No analytic shortcut is silently substituted for Monte Carlo.

A Stan distribution statement contributes a density factor; it is not necessarily a generative instruction. The support checks follow that distinction and the normalizing terms needed for truncation. See the [Stan statements reference](https://mc-stan.org/docs/reference-manual/statements.html) and [prior predictive checks guide](https://mc-stan.org/docs/stan-users-guide/posterior-predictive-checks.html).

### Original contribution roadmap

This implementation addresses the original README's model-visualization/LaTeX ideas and starts other-language export with executable Python simulation. Further work includes PyMC/Turing fitting-model exports, general Stan/indirect group-index support, posterior marginal overlays, analytic composition shortcuts verified against Monte Carlo, MCMC-pathology diagnosis, model-based outlier calling, and automated equivalent reparameterizations. Those are not implemented by the current explorer.

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
- `core/model.js` lowers the typed AST into the checked generative graph; `expressions.js` shares evaluation/rendering and `simulation.js` provides bounded, seeded Monte Carlo. `simulation-worker.js` keeps sampling off the UI thread. `explorer-browser.js` and `explorer-native.mjs` expose the same graph/simulation through browser APIs and CLI actions.
- `core/exports.js` generates LaTeX and executable Python from that graph.
- `explorer.js` owns graph layout, scenario controls, marginal histograms, exports and stale-response protection.
- `app.js` renders state and uses the collection's shared history and theme controls.

The browser needs an initial network connection to fetch webR. A failed load is shown in the interface and can be retried. webR's PostMessage transport does not support interrupting R evaluation; conversion is serialized and the interface remains responsive. Current Stan2R limitations are preserved: unsupported constructs produce errors, while the existing bounded-prior and ordered-parameter approximations produce visible warnings. External Stan includes, model fitting, and the package's plotting/flattening workflows are not exposed by this interface. Input arrays above two dimensions are rejected explicitly; they are not flattened silently.

The R runtime uses substantially more memory than a small JavaScript-only tool. In the desktop Chromium check, its renderer process was about 460 MiB with the runtime loaded; after startup settled, three consecutive two-second idle measurements showed no added renderer CPU time. A repeated small conversion took about 140 ms on that host. These are development measurements, not mobile-device guarantees.

## Validation

```sh
node --test stan2r/tests/core.test.mjs
node --test stan2r/tests/browser.test.mjs stan2r/tests/explorer-browser.test.mjs
node --test stan2r/tests/explorer-core.test.mjs stan2r/tests/exports.test.mjs stan2r/tests/explorer-audit.test.mjs stan2r/tests/explorer-cli.test.mjs
```

The export tests execute Python with NumPy; core Monte Carlo checks compare analytical moments, deterministic identities, vector/loop equivalence and explicit error cases. The explorer browser tests check slider/fixed scenarios, graph movement/history, reproducibility, vector histograms, stale worker replies, exports and small-screen layout.

The browser test uses the collection's existing Playwright installation (`name-tags/node_modules/playwright`), or an absolute package path in `PLAYWRIGHT`. It starts its own static server, compares twelve conversions against the original native compiler/package output, checks structured failures, offline-runtime messaging, keyboard history, and desktop/mobile rendering. The core test requires Rscript. Test fixtures cover all four modes for bounded-normal, beta–binomial, and Student-t/user-function models.

To regenerate reference fixtures, point `STAN2R_SOURCE` at the original hardened R checkout and run `node stan2r/tests/refresh-reference.mjs`. This calls native stanc and the original R entry point, independently of the browser bridge.

`npm ci --prefix stan2r` installs development-only Node type declarations. Application code and the CLI have no npm runtime dependencies.
Run the existing TypeScript checker with `tsc --project stan2r/tsconfig.json` to check the UI, adapters, and tests.
