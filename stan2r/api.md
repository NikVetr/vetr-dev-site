# Stan2R API

Browser: `await window.Stan2R.submit(request)` on `/stan2r/`, or import `submit` from `core/browser.js`. Node: import `submit` from `core/native.mjs`, or run `node stan2r/cli.mjs request.json`. The Node version needs Rscript on PATH; the browser loads R through pinned webR.

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
  translator: "Stan2R e4f4b15"
}
```

The generated script expects an R list named `dat` and writes an `out` list. In posterior modes the selected draw is embedded in the script. Density modes return densities or probability masses, not logs. Model fitting and executing the generated script are outside this API.

The browser's conversions are queued, so concurrent calls cannot overwrite each other's input files. The compiler and R worker are reused until the page is closed. Model text is not sent to a server. First successful use downloads webR from its official CDN; offline initialization fails explicitly.

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
- `overrides`: parameter-name map. `{args:{"0":2,"1":4}}` replaces specified distribution arguments with scalar constants. `{fixed:0}` replaces the parameter's draw with a fixed intervention; for vector parameters a scalar is broadcast, or supply an exact-length vector. Bounds are still checked. Use one of `args` or `fixed`, not both. These explicitly change the model; they are not posterior conditioning, and the original source is not rewritten.

The explorer supports at most 64 declarations, one-dimensional sizes up to 512 (sampled variables must be nonempty), and 1,000,000 returned values. Rejection attempts and total random operations are bounded; exceeding a limit returns `SIMULATION_LIMIT`, never a partial result. Invalid requests, unsupported models and numerical/domain failures have codes `INVALID_REQUEST`, `UNSUPPORTED_MODEL`, and `SIMULATION_ERROR`. Compiler errors retain `STAN_ERROR`. The browser simulation worker reports these as rejected promises and stays separate from the interface thread.

See [supported constructs and limitations](README.md#explorer-support) before using a new model. The R converter has a broader, independent support boundary.

## LaTeX, Python and CLI actions

```js
window.Stan2R.exportLatex(model, { overrides: { mu: { fixed: 0 } } });
window.Stan2R.exportPython(model, { data: { N: 4 }, draws: 1000, seed: 12345 });
```

Both return source text. Direct module exports are in `core/exports.js`. LaTeX is an `amsmath` equation block, including named distribution parameterizations, repeated-element indices and supports. The Normal equation uses variance notation (squaring Stan's SD argument). Python produces a NumPy prior simulator, with editable settings and `simulate(dat, draws, seed)` returning arrays per variable. It is **not a PyMC fitting model**. Both annotate overrides; exports fail explicitly with structured errors for invalid scenarios. LaTeX supports symbolic data dimensions without numeric data; Python needs the unsampled input data.

The existing CLI retains R conversion when `action` is omitted. Add one of `graph`, `explore`, `latex`, or `python` for the new paths, which do not require Rscript:

```json
{
  "action": "explore",
  "source": "parameters { real mu; } model { mu ~ normal(0, 2); }",
  "draws": 1000,
  "seed": 12345,
  "overrides": {"mu": {"fixed": 0}}
}
```

`graph` returns `{model}`; `explore` returns `{model,samples,draws,seed,warnings}`; `latex` and `python` return `{code,format}`. The GUI's Graph JSON export additionally includes the scenario overrides alongside the original graph. CLI errors use the same stderr JSON and exit codes as R conversion.
