# Predictive CEO salary models

This directory contains the reproducible, fixed-cohort models behind the app's
experimental **Model** view. The estimand is the distribution of positive annual
CEO base salary, expressed in July 2026 USD, for a user-specified organization
profile. The result is a predictive association among reviewed peers; it is not a
recommended salary, a causal estimate, or a replacement for the app's empirical
benchmark and sensitivity tools.

## Cohort and target

`prepare_model_data.py` builds `training_data.csv` from the generated
`app-data.js`. It includes only default-recommended CEO records with a positive
adjusted base-pay value:

- 114 exact Form 990 filing observations;
- 17 recruitment records (16 advertised intervals and one advertised point
  amount);
- 131 records across 128 normalized organization-name groups; and
- no Rethink Priorities outcome. RP is retained only as the editable default
  prediction profile and as a visual reference.

The three organizations represented in both evidence streams are kept in one
cross-validation group. A filing amount is modeled as an exact log salary. An
advertised range retains its adjusted lower and upper bounds rather than being
replaced by its midpoint.

The model features are log annual expenses, log annual revenue, log employee
count, compensation year, broad focus area, EA relationship, organization type,
CEO-title group, and broad location scope. Category construction is deterministic
and salary-blind. Peer group and similarity score are excluded because they are
RP-relative judgments assembled from overlapping inputs; remote status is
excluded because Form 990 filings do not report it.

The combined cohort has 10 missing expense values, 10 missing revenue values, and
10 missing staff values. These occur mostly among job ads; one filing lacks staff.
Within every fit, a missing continuous value is median-imputed on the transformed
training data and accompanied by a missingness indicator. The browser profile
requires positive values and therefore uses no missingness indicators.

RP's exported default profile is $20,378,936 in expenses, $20,599,841 in revenue,
43 employees, compensation year 2024, Research / evidence, EA-core, Independent
nonprofit, CEO, and International / multi-country. Its displayed adjusted filing
salary is $155,230.03 and is never a training outcome. The employee count is from
RP's 2023 filing, whereas the financial values and compensation are from 2024.

## Bayesian partial-pooling model

`ceo_salary_model.stan` defines a normal model on log salary. For record \(i\),

```text
mu[i] = alpha + X[i] beta
      + ad_offset * I(source is job ad)
      + focus_effect[focus[i]]
      + structure_effect[structure[i]]
      + title_effect[title[i]]
      + location_effect[location[i]]
      + ea_effect[ea[i]]
```

`X` contains standardized log expenses, log revenue, log staff, year, and three
missingness indicators. Standardization and imputation parameters are estimated
from the relevant training data only. The priors are:

```text
alpha                         ~ Normal(12.5, 1)
beta[k]                       ~ Normal(0, 0.3)
ad_offset                     ~ Normal(0, 0.35)
sigma[filing]                 ~ Normal(0.35, 0.15), constrained >= 0.12
sigma[job ad]                 ~ Normal(0.45, 0.18), constrained >= 0.12
tau_focus/type/title/location ~ half-Normal(0, 0.25)
raw category effects          ~ Normal(0, 1)
EA increments                 ~ Normal(0, 0.2)
```

Each categorical effect is `tau * (raw - mean(raw))`, so it is partially pooled
and centered across its declared levels. EA is encoded cumulatively as
`[0, increment_1, increment_1 + increment_2]` for Functional overlap,
EA-adjacent, and EA-core. The increments are signed, so the coding respects the
declared sequence without imposing a monotone salary direction.

Exact filings contribute

```text
log(salary[i]) ~ Normal(mu[i], sigma[source[i]])
```

For an advertised interval `[L, U]`, the likelihood is the normal probability
mass between `log(L)` and `log(U)`:

```text
log(P(log(L) <= latent log salary <= log(U) | mu[i], sigma[job ad]))
```

The Stan implementation evaluates this stably with differences of log CDFs or
log complementary CDFs. This integrates over a latent salary in the range; it
does not assert that the range midpoint was paid. A separate job-ad intercept and
residual scale acknowledge that an advertised offer and realized filing pay are
different evidence types. The interval model remains experimental because a
posted range is an employer policy range, not a classical censoring mechanism.

The residual-scale normals are truncated by the declared lower bound. They are
mildly informative because the posting spread is weakly identified by interval
observations and near-zero scales produced unstable geometry in sparse folds.

The production artifact was fit with four chains, 600 warmup iterations and 600
sampling iterations per chain, `adapt_delta = 0.99`, and maximum tree depth 13.
The filing-only fit reports maximum R-hat 1.0075, minimum bulk ESS 660.5, zero
divergences, zero maximum-tree-depth hits, and minimum E-BFMI 0.714. The
range-augmented fit reports maximum R-hat 1.0061, minimum bulk ESS 695.1, zero
divergences, zero maximum-tree-depth hits, and minimum E-BFMI 0.665. Across the
20 one-chain cross-validation fits, there were also zero divergences and zero
maximum-tree-depth hits; minimum E-BFMI was 0.611. (Single-chain fold fits do not
support an R-hat diagnostic.) The recorded sampler diagnostics therefore pass,
but they do not resolve the substantive sparsity and evidence-stream limitations
described below.

## Comparison models

The audit also fits three exact-filing comparators:

- **Intercept only:** the training-fold mean log salary and residual standard
  deviation.
- **Scale linear:** linear regression on standardized log expenses, log revenue,
  log staff, and year.
- **Scale GAM:** REML cubic-regression splines (`k = 4`) for the three scale
  variables plus a linear year term.

The browser exposes the Bayesian model and the scale GAM. The intercept and linear
models are validation baselines only. No boosted-tree model is included in the
current artifact and the app must not describe one as implemented.

## Leakage-safe grouped validation

The preparation script uses seed `20260903` to assign every normalized
organization-name group to one of ten deterministic outer folds. All records in
a group, including filing and recruitment records, share its fold. This prevents
the known same-name duplicates from crossing folds, but it is not a legal-entity
or alias-resolution system.
`fit_salary_models.R` then performs one organization-grouped 10-fold run.

For each held-out fold, continuous imputation, centering, and scaling are learned
from the other nine folds. GAM smoothing is fit by REML within the training fold.
The Bayesian priors and model form are fixed rather than selected against the
held-out outcomes. The broad categorical vocabulary is fixed for the prepared
cohort and is outcome-blind; no salary-derived category construction or target
encoding is used.

Headline predictive metrics are calculated only on held-out exact Form 990
observations, so adding job ads is judged by whether it improves prediction of
the same filing-pay estimand. `cv_elpd` is the sum of held-out filing log
predictive densities, and `mean_log_predictive_density` is its per-filing mean.
Ad-range log scores are reported separately. Bayesian coverage uses held-out
posterior-predictive intervals; the baselines and GAM use their training-fold
normal residual intervals. This is cross-validated ELPD, not in-sample lppd.

### Current 10-fold results

| Model | Log RMSE | OOS R2 | Median absolute % error | 80% coverage | 90% coverage | Mean log predictive density |
|---|---:|---:|---:|---:|---:|---:|
| Intercept only | 0.377 | -0.008 | 25.5% | 81.6% | 87.7% | -0.449 |
| Scale linear | 0.353 | 0.119 | 22.2% | 78.9% | 87.7% | -0.383 |
| Scale GAM | 0.356 | 0.101 | 22.2% | 78.9% | 86.8% | -0.395 |
| Bayesian partial pooling | 0.321 | 0.269 | 22.4% | 81.6% | 87.7% | -0.292 |
| Bayesian partial pooling + ad ranges | **0.317** | **0.287** | **21.2%** | **83.3%** | **88.6%** | **-0.280** |

The range-augmented model's mean interval log score on the 16 held-out advertised
ranges is -2.011; the one held-out advertised point has a separate log score of
-0.0005. The interval probability score and continuous point-density score are
not directly comparable. The model's advantage over the filing-only Bayesian
model is small: log RMSE improves by 0.004, OOS R2 by 0.018, median percentage
error by 1.2 percentage points, and total filing CV-ELPD by 1.41. This single
fixed fold assignment
provides no standard error for those differences, so it does not establish that
recruitment ranges improve the model.

The Bayesian models are preferred over the scale-only challengers because they
materially improve the held-out filing metrics while regularizing sparse category
effects. The GAM does not improve on the simpler linear scale model, so there is
no observed evidence here that its nonlinearities add predictive value. The app
therefore presents Bayesian partial pooling as the primary method, keeps the GAM
as an interpretable challenger, and makes use of ad ranges an explicit
experimental choice rather than folding them silently into the filing model.

## Browser artifact semantics

`fit_salary_models.R` writes schema-versioned `model_artifact.json`, which
`scripts/build_app_data.py` embeds into `app-data.js`. The app-data build fails if
the schema is unsupported, RP exclusion is not asserted, the cohort counts or
input/script/training hashes are stale, required models are absent, or recorded
sampler diagnostics fail the build thresholds.

For each Bayesian fit, the artifact exports 512 evenly spaced posterior draws of
the intercept, slopes, category effects, source offset, and source-specific
residual scales. It also exports one seeded standard-normal residual draw per
posterior draw. For a browser profile, the app:

1. transforms inputs using the full-fit preprocessing constants;
2. calculates one filing-source `mu` per posterior draw;
3. forms a posterior-predictive draw as `exp(mu + sigma_filing * residual_z)`;
4. computes displayed quantiles from those positive draws; and
5. computes expected salary analytically as the draw-average of
   `exp(mu + sigma_filing^2 / 2)`.

The job-ad offset is never added to an RP/profile prediction: ads can inform the
range-augmented fit, but the prediction target remains filing-source CEO pay.
Selecting an `Average category effect` profile contributes the centered zero
effect (the unweighted mean across the declared category levels, not the
record-count-weighted mean). The displayed driver bars are median additive
contributions on the log-salary scale and are predictive associations, not causal
decompositions.

For the GAM, the artifact exports the full-fit baseline, 141-point effect grids
over standardized values from -3.5 to 3.5, and the 114 organization-grouped
out-of-fold residuals. The browser linearly interpolates each effect grid and
forms predictive draws as `exp(mu + residual)`. Values beyond an effect grid are
clamped at its endpoint and separately flagged as outside training support.

The Model view is deliberately fixed to the versioned Recommended CEO cohort.
Table inclusion, filters, peer weights, distribution choice, pay-source control,
pay measure, and dollar-basis choice do not refit it. The model is currently
disabled for every non-CEO position. Model method, range inclusion, editable
profile, and quantile settings are encoded in the compact share URL and participate
in application history.

## Limitations

- The sample is small, selected, and overwhelmingly U.S.-registered independent
  nonprofits. It is not representative of all nonprofits or labor markets.
- RP's EA-core target has **zero exact filing examples**; only one advertised
  interval is EA-core. Its EA-core contribution is therefore prior-dominated,
  especially in the filing-only model.
- Several other levels have little or no exact-filing support: Independent
  nonprofit accounts for 108/114 filings, no exact filing is in Outside United
  States or Education / public engagement, and multiple focus areas contain only
  a handful of records.
- Revenue and expenses are strongly related, and conditional coefficient signs
  should not be read as independent causal effects.
- Schedule J base-pay availability is selective, and job-ad covariates are often
  missing. Interval treatment preserves advertised bounds but cannot remove
  evidence-stream selection or measurement differences.
- Validation uses one deterministic 10-fold assignment, not repeated folds or an
  external test set. Model-comparison differences have no cross-validation
  standard errors.
- Cross-validation groups use normalized organization names rather than a
  fully resolved legal-entity and alias map. Known same-name filing and job-ad
  records stay together, but unresolved aliases or affiliated entities could
  still create dependence across folds.
- The normal log-residual assumption may understate tail risk. Posterior-predictive
  ranges describe modeled peer variability, not uncertainty about a board's
  appropriate compensation decision.

## Reproduction

From the repository root:

```bash
python3 benchmark/analysis/predictive_salary_models/prepare_model_data.py
Rscript benchmark/analysis/predictive_salary_models/fit_salary_models.R .
```

The R run requires `cmdstanr`, CmdStan, `jsonlite`, and `mgcv`. Together the two
commands rewrite the training cohort, cross-validation predictions and metrics,
and browser artifact; review all diffs before publishing. `--quick` is a
development smoke run with far fewer Stan iterations and must not be published as
the validated artifact.
