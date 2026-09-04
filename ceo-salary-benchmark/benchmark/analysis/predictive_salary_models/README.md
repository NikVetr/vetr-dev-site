# Predictive CEO salary models

This directory contains the reproducible, fixed-cohort models behind the app's
experimental **Model** view. The estimand is the distribution of positive annual
CEO base salary, expressed in July 2026 USD, for a user-specified organization
profile. The result is a predictive association among reviewed peers; it is not a
recommended salary, a causal estimate, or a replacement for the app's empirical
benchmark and sensitivity tools.

## Cohort and target

`prepare_model_data.py` builds `training_data.csv` from the generated
`app-data.js`. It includes the reviewed and admitted annual organization-head
records with a positive observed pay amount. Admission combines the app's
recommended records with a documented, hand-reviewed set of additional records:

- 114 exact Form 990 Schedule J base-pay observations;
- 12 Form 990 or 990-EZ reported-cash observations whose base salary is latent;
- 27 recruitment records (25 advertised intervals and two advertised point
  amounts);
- 153 records across 149 normalized organization-name groups; and
- no Rethink Priorities outcome. RP is retained only as the editable default
  prediction profile and as a visual reference.

The three organizations represented in both evidence streams are kept in one
cross-validation group. A filing amount is modeled as an exact log salary. An
advertised range retains its adjusted lower and upper bounds rather than being
replaced by its midpoint.

The continuous features are log annual expenses, log annual revenue, log
employee count, and log highest reported non-CEO Schedule J base pay in the same
filing. The categorical features are broad focus area,
EA relationship, organization type, CEO-title group, broad location scope,
organization-wide work model, and whether the organization serves as a fiscal
sponsor. Category construction is deterministic, source-reviewed, and
salary-blind. Peer group and similarity score are excluded because they are
RP-relative judgments assembled from overlapping inputs.

The combined cohort has 19 missing expense values, 27 missing revenue values, 18
missing staff values, and 57 missing highest-other-base values. Recruitment
budgets are kept as expense proxies and are not duplicated into revenue. In the
Bayesian fit, each missing transformed continuous value is a latent standardized
parameter with a standard-normal prior. This integrates over missing-value
uncertainty instead of filling every gap with one median. The GAM remains a
deterministic challenger and uses fold-specific median values plus explicit
missingness indicators. Browser profiles require positive numeric inputs.

RP's exported default profile is $20,378,936 in expenses, $20,599,841 in revenue,
43 employees, $136,142.69 highest reported non-CEO base pay, Research / evidence,
EA-core, Independent nonprofit, CEO, International /
multi-country, Remote, and Serves as fiscal sponsor. Its displayed adjusted
filing salary is $155,230.03 and is never a training outcome. The employee count
is from RP's 2023 filing, whereas the financial values and compensation are from
2024.

## Bayesian multilevel model

`ceo_salary_model.stan` defines a normal model on log salary. For record \(i\),

```text
mu[i] = alpha + X[i] beta
      + ad_offset * I(source is job ad)
      + focus_effect[focus[i]]
      + structure_effect[structure[i]]
      + title_effect[title[i]]
      + location_effect[location[i]]
      + remote_effect[remote[i]]
      + fiscal_sponsor_effect[fiscal_sponsor[i]]
      + ea_effect[ea[i]]
```

`X` contains standardized log expenses, log revenue, log staff, log highest
reported non-CEO base pay, and four missingness indicators. Centering and
scaling parameters are estimated from the relevant training data only. The
salary outcome and advertised bounds are already expressed in July 2026 USD, so
the model does not add a separate pay-year trend on top of that adjustment. The
priors are:

```text
alpha                         ~ Normal(12.5, 1)
beta[k]                       ~ Normal(0, 0.3)
ad_offset                     ~ Normal(0, 0.35)
sigma[filing]                 ~ Normal(0.35, 0.15), constrained >= 0.12
sigma[job ad]                 ~ Normal(0.45, 0.18), constrained >= 0.12
tau_focus/type/title/location ~ half-Normal(0, 0.25)
tau_remote/fiscal sponsor     ~ half-Normal(0, 0.20)
raw category effects          ~ Normal(0, 1)
EA increments                 ~ Normal(0, 0.2)
missing standardized values   ~ Normal(0, 1)
```

Each categorical effect is `tau * (raw - mean(raw))`, giving a centered
multilevel effect with stronger regularization for sparse levels. EA is encoded cumulatively as
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

The production artifact uses four chains. Each grouped cross-validation fit has
400 warmup and 500 retained iterations per chain; each full fit has 800 warmup
and 1,000 retained iterations per chain. `adapt_delta` is 0.995 for validation
fits and 0.999 for full fits; maximum tree depth is 13. The final filing-only fit
reports maximum R-hat 1.0063, minimum bulk ESS 1,436, minimum tail ESS 1,139,
zero divergences, zero maximum-tree-depth hits, and minimum E-BFMI 0.777. The
range-augmented fit reports maximum R-hat 1.0059, minimum bulk ESS 1,029, minimum
tail ESS 1,028, zero divergences, zero maximum-tree-depth hits, and minimum
E-BFMI 0.799. Across the 20 four-chain cross-validation fits, maximum R-hat is
1.0176, minimum bulk ESS is 316, minimum tail ESS is 359, there are zero
divergences and maximum-tree-depth hits, and minimum E-BFMI is 0.673. The
recorded sampler diagnostics pass the build gates,
but they do not resolve the substantive sparsity and evidence-stream limitations
described below.

## Comparison models

The audit also fits three exact-filing comparators:

- **Intercept only:** the training-fold mean log salary and residual standard
  deviation.
- **Scale linear:** linear regression on the standardized numeric inputs and
  missingness indicators.
- **Numeric-input GAM:** REML cubic-regression splines (`k = 4`) for log
  expenses, revenue, staff, and highest-other-base pay, plus missingness
  indicators.

The browser exposes the Bayesian model and the numeric-input GAM. The intercept and linear
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
| Intercept only | 0.379 | -0.015 | 25.4% | 82.5% | 87.7% | -0.469 |
| Scale linear | 0.303 | 0.348 | 18.7% | 75.4% | 90.4% | -0.267 |
| Numeric-input GAM | **0.292** | **0.394** | 17.3% | 79.8% | 84.2% | **-0.251** |
| Bayesian multilevel | 0.323 | 0.262 | 18.2% | **82.5%** | 89.5% | -0.258 |
| Bayesian multilevel + ad ranges | 0.320 | 0.276 | **16.9%** | **82.5%** | **91.2%** | -0.259 |

The range-augmented model's mean interval log score on the 25 held-out advertised
ranges is -2.363; the two held-out advertised points have mean log score -0.869.
The interval probability score and continuous point-density score are not
directly comparable. Relative to the filing-only multilevel model, adding ads
improves log RMSE by 0.003, OOS R2 by 0.014, and median percentage error by 1.4
percentage points, while worsening total filing CV-ELPD by 0.12. One fixed fold
assignment provides no standard error for these small, mixed differences, so it
does not establish that recruitment ranges improve the model.

No one model dominates. The GAM has the best held-out point error and OOS R2,
while the multilevel fits provide better 90% interval coverage and support the
requested categorical organization profile. The app therefore defaults to the
multilevel model for profile analysis, exposes the GAM as the stronger numeric
point-prediction challenger, and makes ad-range use an explicit experimental
choice rather than folding it silently into the filing model.

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

For the GAM, the artifact exports the full-fit baseline, effect grids with at
least 141 points spanning standardized values from -3.5 to 3.5 and all observed
training support, and the 114 organization-grouped out-of-fold residuals. The
browser linearly interpolates each effect grid and
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
- RP's EA-core target has **zero exact filing examples**. Four EA-core filing
  records are cash proxies and one is an advertised interval, so the category
  effect remains prior- and measurement-model-sensitive.
- Several other levels have little or no exact-filing support: Independent
  nonprofit accounts for 108/114 filings, no exact filing is in Outside United
  States or Education / public engagement, and multiple focus areas contain only
  a handful of records.
- Revenue and expenses are strongly related, and conditional coefficient signs
  should not be read as independent causal effects.
- The four organization groups with repeated records are held together in
  cross-validation, but the likelihood does not add a separately identifiable
  organization random effect; repeated rows remain conditionally independent.
- Work-model evidence is resolved for 115 of 201 app organizations, while
  fiscal-sponsor status is resolved for only 17. `Unknown` is a modeled category,
  not evidence of an in-person workplace or absence of sponsorship.
- Work-model and fiscal-sponsor classifications describe the 2026 review
  snapshot and may not match an older compensation year.
- One Form 990-EZ officer-compensation observation shares the broader reported-
  cash measurement model even though its source definition differs from Part VII.
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
