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
