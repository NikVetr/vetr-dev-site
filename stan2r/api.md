# Stan Studio API

Browser: `await window.Stan2R.submit(request)` on `/stan2r/`, or import `submit` from `core/browser.js`. Node: import `submit` from `core/native.mjs`, or run `node stan2r/cli.mjs request.json`. The Node version needs Rscript on PATH; the browser loads R through pinned webR.

The `/stan2r/` route remains stable. `window.StanStudio`, `window.StanTheExplorer` and `window.Stan2R` expose the same browser API.

## Request

```json
{
  "source": "data { int<lower=0> n; int<lower=0,upper=n> y; } parameters { real<lower=0,upper=1> p; } model { p ~ beta(2,2); y ~ binomial(n,p); }",
  "mode": "prior_predictive",
  "data": {"n": 20, "y": 12},
  "draws": {"p": [0.55, 0.62]},
  "sampleIndex": 1
}
```

| Field | Meaning |
| --- | --- |
| `source` | Required nonempty Stan source, at most 200,000 characters; self-contained, without external includes. |
| `mode` | `prior_predictive` (default), `posterior_predictive`, `posterior_density`, or `prior_density`. |
| `data` | Optional object mapping Stan data names to finite numeric scalars, numeric vectors, or rectangular numeric matrices (outer arrays are rows). Blank/omitted data becomes R `NULL`. Higher-dimensional arrays, strings, null data elements, and nonfinite numbers are rejected. |
| `draws` | Optional object mapping CmdStan parameter-column names to equal-length, nonempty numeric arrays. Required in posterior modes. For example `{"theta[1]": [0.3,0.4]}`. |
| `sampleIndex` | One-based index of the parameter draw; defaults to 1. |

Unknown fields are rejected. Posterior draws must contain every model parameter needed by the selected mode. Stan2R checks data requirements; the caller remains responsible for supplying data appropriate to the model.

## Result

```js
{
  code: "# R translation ...\n...",
  mode: "prior_predictive",
  warnings: [],
  compiler: "stanc 2.38.0",
  syntax: {compiler: "stanc 2.38.0", detected: "undetermined", migrated: false,
           description: "No version-specific syntax identified. Exact authoring version is unknown."},
  translator: "Stan2R e4f4b15"
}
```

The generated script expects an R list named `dat` and writes an `out` list. In posterior modes the selected draw is embedded in the script. Density modes return densities or probability masses, not logs. Model fitting and executing the generated script are outside this API.

The browser's conversions are queued, so concurrent calls cannot overwrite each other's input files. The compiler and R worker are reused until the page is closed. Model text is not sent to a server. First successful use downloads webR from its official CDN; offline initialization fails explicitly.

### Stan syntax generations

Both the R and graphical APIs first check source with pinned **stanc 2.38.0**. If that fails, a lazily loaded, official **stanc 2.32.2** canonicalizer attempts to modernize supported deprecated syntax. The result must pass the maintained compiler before either translation or simulation. This handles postfix array declarations, old `<-` assignment, `#` comments, and deprecated density function/target syntax where the official canonicalizer has an equivalent replacement. It does not provide arbitrary historical Stan runtimes or support syntax introduced after 2.38.0. The graph's separate supported-model restrictions still apply.

Successful conversions return `syntax`; graphs return `model.syntax`. It contains `compiler`, `detected` (`modern`, `legacy`, or `undetermined`), `description`, and `migrated`. Array keyword syntax identifies a minimum syntax generation of Stan 2.26; syntax shared across releases does not identify the version that authored the file. `legacy` means the official migration succeeded, not that the author used one particular release. A migrated result additionally contains `migrationCompiler` and `normalizedSource`; its warnings disclose the migration. The original request source is preserved. Graph declaration `line` values and R translator source mapping refer to `normalizedSource` when migrated, and to the original source otherwise. `line` is one-based (zero if no source was provided to the low-level graph builder).

For a text-only hint, import `detectSyntax(source)` from `core/compilation.js`; this never validates or rewrites code. Prefer compilation metadata for acceptance decisions. Official references: [removed syntax and release boundaries](https://mc-stan.org/docs/reference-manual/removals.html), [deprecation canonicalization](https://mc-stan.org/cmdstanr/articles/deprecations.html).

## Errors and warnings

Rejected promises carry `name: "Stan2RError"`, `code`, `message`, and `issues: [{code,path,message}]`. Codes are `INVALID_REQUEST`, `STAN_ERROR` (syntax/type errors with source locations), `UNSUPPORTED_CONSTRUCT`, `CONVERSION_ERROR`, `COMPILER_ERROR`, and `RUNTIME_ERROR`. The CLI emits `{error:{code,message,issues}}` on stderr, with exit code 1; usage errors use exit code 2.

The unchanged translator cannot faithfully convert every valid Stan program. Examples include improper unbounded priors, arbitrary Jacobian increments, higher-order functions/ODE solvers, complex numbers and tuples. Such constructs fail explicitly. Its existing approximations for parameter-dependent bounded priors and differing ordered-prior arguments are returned as warnings; inspect those before using the generated simulation. The browser does not silently replace these methods or suppress warnings.

## Graphs and JavaScript prior simulation

These entry points use the same typed-AST graph, expressions, and sampler in the browser and Node. They do not load R or fit a posterior.

```js
const model = await window.Stan2R.analyze(source);
const result = await window.Stan2R.simulate(model, {
  data: { N: 4 },
  draws: 1000,
  seed: 12345,
  overrides: { mu: { args: { 1: 4 } } } // normal SD, zero-based argument index
});
// Or parse and simulate together:
const { model: graph, samples } = await window.Stan2R.explore({
  source, data: { N: 4 }, draws: 1000, seed: 12345
});
```

Node exports `analyze(source)` and `explore(request)` from `core/explorer-native.mjs`; `simulate(model, options)` in `core/simulation.js` is DOM-free. The model contains `nodes`, `edges: [{from,to}]`, topological `order`, and `warnings`. Nodes identify declaration block, kind (`input`, `stochastic`, `deterministic`, `observed`), shape expressions, bounds, defining expressions or distributions, and parents. Edges also include dependencies used by dimensions and bounds; they are not a claim that every dependency is a causal effect.

Simulation returns `{samples, draws, seed, warnings}`. Every `samples[name]` is a `[draw][element]` numeric array; scalars have one element per draw. Vector elements remain separate, never pooled. Inputs and transformed data are also returned. Sampled data variables are generated from their likelihood; their original supplied values are optional, but validated if supplied. All unsampled data inputs are required. Declaration constraints on data validate supplied observations; only explicit `T[...]` truncates predictive draws.

Options:

- `data`: finite scalar/vector values by data-variable name. Unknown names are rejected.
- `draws`: integer 1–10,000, default 1,000.
- `seed`: unsigned 32-bit integer, default 12,345. Streams are deterministic per node. Results do not match Stan's or NumPy's RNG sequence.
- `overrides`: parameter-name map. `{args:{"0":2,"1":4}}` replaces specified distribution arguments with scalar constants. `{fixed:0}` replaces the parameter's draw with a fixed intervention; for vector parameters a scalar is broadcast, or supply an exact-length vector. Bounds are still checked. Use one of `args` or `fixed`, not both. These explicitly change the model; they are not posterior conditioning, and the original source is not rewritten. Overrides are rechecked against conditional normalization and any proven transformed bounds, so a previously safe constraint cannot silently become a restriction on the new scenario.

The explorer supports at most 64 declarations, one-dimensional sizes up to 512 (sampled variables must be nonempty), and 1,000,000 returned values. Rejection attempts and total random operations are bounded; exceeding a limit returns `SIMULATION_LIMIT`, never a partial result. Invalid requests, unsupported models and numerical/domain failures have codes `INVALID_REQUEST`, `UNSUPPORTED_MODEL`, and `SIMULATION_ERROR`. Compiler errors retain `STAN_ERROR`. The browser simulation worker reports these as rejected promises and stays separate from the interface thread.

See [supported constructs and limitations](README.md#explorer-support) before using a new model. The R converter has a broader, independent support boundary.

## LaTeX, Python and CLI actions

```js
window.Stan2R.exportLatex(model, { overrides: { mu: { fixed: 0 } } });
window.Stan2R.exportPython(model, { data: { N: 4 }, draws: 1000, seed: 12345 });
window.Stan2R.exportPyMC(model, { data: { N: 4, y: [0.4, 1.1, -0.2, 0.8] } });
```

All return source text. LaTeX/NumPy module exports are in `core/exports.js`; PyMC is in `core/pymc.js`. LaTeX is an `amsmath` equation block, including named distribution parameterizations, repeated-element indices and supports. The Normal equation uses variance notation (squaring Stan's SD argument). Python produces a NumPy prior simulator, with editable settings and `simulate(dat, draws, seed)` returning arrays per variable. It is **not a PyMC fitting model**. The separate `exportPyMC` returns `build_model(dat)` using PyMC 6.4.0, with observed likelihoods, named vector coordinates and deterministic transforms. It requires the supplied observations, data-only index selectors/replication counts, and includes optional, commented fitting calls. Fixed interventions with parameter-dependent bounds fail explicitly at export. All formats annotate overrides; exports fail explicitly with structured errors for invalid scenarios. LaTeX supports symbolic data dimensions without numeric data; Python needs the unsampled input data.

The existing CLI retains R conversion when `action` is omitted. Add one of `graph`, `explore`, `latex`, `python`, or `pymc` for the new paths, which do not require Rscript:

```json
{
  "action": "explore",
  "source": "parameters { real mu; } model { mu ~ normal(0, 2); }",
  "draws": 1000,
  "seed": 12345,
  "overrides": {"mu": {"fixed": 0}}
}
```

`graph` returns `{model}`; `explore` returns `{model,samples,draws,seed,warnings}`; `latex`, `python`, and `pymc` return `{code,format}`. The GUI's Graph JSON export additionally includes the scenario overrides alongside the original graph. CLI errors use the same stderr JSON and exit codes as R conversion.

## Diagram presentation

The model returned by `analyze` remains complete. Compact presentation does not alter it. `diagramProjection(model, overrides, {showStructure:false})` from `diagram-projection.js` returns visible `nodes`, classified/labeled `edges`, conservative shared `plates`, and explanatory `notes`. `showStructure:true` includes size and declared data-bound dependencies; genuine parameter bounds stay visible in either view.

`layoutDiagram(projection, sizes, plateView, engine, direction)` from `diagram-layout.js` returns a promise for node positions, plate rectangles, routed polylines, and overall dimensions. `direction` is `DOWN` (API default) or `RIGHT`; the UI chooses according to pane width. `sizes` maps node IDs to `{width,height,anchor}` (the symbol center’s vertical offset inside its measured box); `engine` is the pinned ELK instance, available as `new window.ELK()` on the app page. `movedRoute` and `bridgePath` share the GUI’s drag-offset and crossing-jump geometry. These functions only affect presentation, never simulations or model exports.
