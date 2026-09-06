# Compensation benchmark audit

## Model comparisons and exact-base sensitivity — 2026-09-06

The app has **19 fitted specifications**, including exact-base-only Bayesian multilevel linear models with and without highest-other pay. The new variants retain the same priors, category vocabulary and correlated missing-input model; ads and cash-only outcomes are excluded. The with-other-pay CV fits match the archived first study repetition exactly. Fixed folds and all 112 scored base outcomes are retained.

With other pay, exact-only versus pooled log RMSE is **0.281 versus 0.316**, with mean absolute percentage errors 22.2% versus 22.5%. Without other pay, log RMSE improves (0.321 versus 0.336) but mean percentage error worsens (24.8% versus 23.4%). These are sensitivity results conditional on exact-base disclosure, not a universal ranking.

The [cash/disclosure audit](benchmark/analysis/predictive_salary_models/cash_disclosure_audit.md) documents smaller, lower-paid cash-only organizations and the complete absence of their other-pay inputs. Among 16 held-out exact-base records missing other pay, pooled versus exact-only log RMSE is .504 versus .374; among 96 with that input it is .272 versus .262. This post-hoc breakdown cannot identify a causal disclosure effect. A fuller disclosure likelihood requires filing-rule inputs and validation of currently unobserved base pay.

Model robustness uses the existing percentile-point interaction to compare all variants at one profile. The CV table sorts every column and separates method, other pay and ads. Driver forest plots toggle between the current model and all variants, with omitted predictors labeled explicitly. Tooltips, driver subtitles and settings typography are concise and consistent; driver values sit five pixels beyond the bars. Model switching preserves category inputs even when the new model has only prior support for a category.

An uncached linear-fit initialization bug was corrected by leaving Stan’s empty curvature matrix out of JSON initialization. This changes neither the statistical model nor its sampler budget. **All 100 CV and ten full Bayesian fits pass the unchanged convergence gates.** Native Stan outputs remain cached and untracked.

Validation: `npm run build`, all 29 Python unit tests and the source/data audits, `npm run test:statistics`, all 38 Playwright tests, and a final two-test browser rerun after focus handling. Desktop/mobile figures were inspected. The source cohort and operating metadata are unchanged.

## Current 40-hour, work-evidence and measurement review — 2026-09-05

**Highest-other pay is now standardized before ranking:** combined disclosed annual pay × 40 / combined filing-and-related weekly hours. This changes 18 model inputs and four selected employees. ORCID's $98,827 at 30 hours becomes **$131,769.33 nominal / $140,266.88 in July 2026 dollars**. RP's observed other-base value remains $136,142.69 after inflation adjustment. Original reported amounts remain available.

The convention includes otherwise eligible full-period part-time employees and scales reported 40-plus-hour schedules down. It retains former/partial-year and unresolved-hours exclusions. Reported effort is not verified contractual FTE; centralized payroll can pay for work across affiliates, so hours are not allocated using payer amounts. The [independent XML audit](benchmark/enrichment/highest_other_fte_audit.md) verifies 895 positive employee records and the four ranking changes.

**Fourteen of 57 unknown work arrangements now support a combined classification.** Current combined counts are 72 remote, 86 in-person/hybrid and 43 unknown. Twelve unresolved cases have weaker or historical directional guesses displayed with confidence, sources and alternatives; they remain Unknown in training. Marine Science Institute's verified Redwood City executive ad directly establishes regular office presence and US hiring geography. Employer-identity checks exclude university namesakes, unrelated job-card employers and the similarly named behavioral-design Appleseed. See [the organization-level follow-up](unknown_work_arrangements.md).

### What the matched comparisons establish

Every comparison scores the same **112 exact-base filings**. Three organization-grouped ten-fold repetitions retain all records from each organization together and learn preprocessing and comparator calibration inside training folds. Priors, sampling rules and tuning grids are unchanged.

| Procedure | Mean log RMSE | Range across splits | Mean absolute % error | Mean log score |
| --- | ---: | ---: | ---: | ---: |
| Bayesian linear, exact + cash | 0.325 | 0.316–0.331 | 23.0% | −0.242 |
| Bayesian linear, exact only | 0.286 | 0.281–0.290 | 22.4% | −0.160 |
| Bayesian linear, exact only, numeric inputs | 0.287 | 0.285–0.289 | 22.4% | −0.144 |
| Numeric GAM | 0.288 | 0.285–0.290 | 21.4% | −0.215 |
| RBF SVR | 0.300 | 0.298–0.302 | 23.0% | −0.295 |
| RBF GP | 0.295 | 0.289–0.299 | 22.8% | −0.170 |

**Cash-proxy inclusion is the strongest explanation tested for the Bayesian model's excess error.** Exact-only training reduces log-RMSE by 0.035–0.044 in every repetition. Removing categories then changes it by only −0.003 to +0.004. Exact-only Bayesian linear and the numeric GAM are close; the GAM retains lower absolute percentage error, while the exact-only Bayesian procedures have stronger mean density scores. This is evidence about the current complete fitting procedures, not proof of a particular cash-measurement defect or a universal algorithm ranking. Scoring assesses base-disclosing organizations; cash-only organizations' latent base salaries remain unvalidated, and disclosure selection may explain part of the difference.

The production-split 40-hour change raises ORCID's held-out Bayesian prediction from about $107,110 to $152,840, versus $287,681 observed. Copenhagen remains substantially underpredicted. Exact-only training raises Copenhagen's prediction from about $99,181 to $170,554. **Neither organization is deleted.**

ORCID and RP have another disclosed employee whose cash pay could conceal a higher base salary. A rule applied across all organizations flags this incomplete maximum; the study masks ORCID's otherwise observed input, retaining its outcome and joint missing-input inference. Log-RMSE changes from 0.316 to 0.311 on the production split. This discards a known lower bound and is a limited sensitivity, not a censored-predictor or selection model.

The [complete study](benchmark/analysis/predictive_salary_models/measurement_sensitivity/README.md) retains 23 specification/repetition comparisons, 2,576 held-out predictions, fold assignments and sampler diagnostics. Repeated observations and overlapping training sets are dependent; the split range is not a confidence interval. The study is separate from the app's 17 fitted variants. Priorities are an app-accessible exact-only Bayesian specification, explicit cash/disclosure measurement sensitivity, and time-aligned work evidence.

### Verification

All **80 production CV fits, eight full fits and 110 study CV fits pass their unchanged sampler gates**, with zero divergences and tree-depth hits. Production CV maximum R-hat is 1.0201, with minimum bulk/tail ESS 323.1/199.4; full-fit maximum R-hat is 1.0063. Bayesian GAM with other pay, fold 4, initially failed R-hat/bulk-ESS gates at 1.0557/88.7. Extending that fit from 400/500 to 800/1,000 warmup/retained iterations per chain resolves it to 1.0113/415.8. The reproducible one-refinement rule and actual refined fold are recorded in the fit configuration; thresholds were not relaxed.

`npm run build`, `npm run test:data` (28 Python tests and five data audits), and `npm run test:statistics` (seven Node tests and four R checks) pass. All 36 Playwright tests pass; a focused metadata rerun also verifies saved supporting-source links after the final archive-preservation change. Desktop/mobile visual checks pass. The five shared first-split procedures reproduce all 112 production predictions, interval endpoints and distribution scores exactly in the separate study. Previously published evidence copies are preserved; saved supporting sources are linked from the review dialog, and duplicate citations are consolidated.

---

The following section records the earlier, **unstandardized-other-pay baseline**. Its model scores, work-arrangement counts and verification totals are historical.

## Pre-40-hour model review — 2026-09-05

The source audit covers all 153 incumbent inventory rows and 38 salary-bearing advertisements. **All 129 positive incumbent compensation records match their source values**; 24 rows have no applicable positive amount. This combines 121 XML reparses, seven rendered/PDF reviews, and Copenhagen's scanned filing. Thirty-three advertisements are corroborated; five retain explicit unresolved/third-party-only status, and none of those five trains the current models. See [the source audit](ceo_reference_set_audit.md) for scope and source-level limitations.

**Reported hours change eligibility, not the extracted pay.** Center for Public Integrity reports Paul Cheung at 0.5 hours alongside other senior officers, leaving a possible filing convention unresolved. Nuclear Threat Initiative reports Ernest Moniz at 25 hours and his official biography identifies concurrent external CEO work. Both are off in the default empirical sample and excluded from model training, with source-exact amounts retained in the Recommended + broader preset and manual sensitivity selection.

**Retain Copenhagen Consensus Center and ORCID.** Copenhagen's single employee counts the U.S. filer payroll rather than its global contractor/expert network. ORCID supplies membership-funded research infrastructure and has international, geographically differentiated pay. These are reasons for structural sensitivity analyses, not evidence that their CEO salaries were mis-extracted. In ORCID's XML, the highest disclosed non-CEO base salary is $98,827 for finance director Thomas Tepper Jr., reported at 30 hours; foreign technology director Will Simpson reports $139,527 cash but no separate Schedule J base. The predictor therefore measures the highest *disclosed* base amount, without full-time-equivalent adjustment, rather than the organization's highest full-time salary.

All 201 organizations have individual operating-evidence reviews: 69 remote, 70 hybrid/mixed, five in-person, and 57 unknown. Explicit employer policy and indirect multi-ad inference are distinguished. CEO eligibility or an explicitly inferred staff market is separate from international operations. RP's CEO is fully remote. Historical gaps and the mismatch between current policy and older pay years remain visible.

### Fitted model results

The common scoring cohort is 112 exact-base filings, with 12 cash proxies and optionally 27 advertisements used by the Bayesian procedures. The following are filing-only specifications **with highest-other pay**, evaluated in the same organization-grouped ten-fold split:

| Model | Log RMSE | Mean absolute error % | 90% coverage | Mean log score | Log CRPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Scale linear | 0.294 | 22.8% | 92.9% | −0.256 | 0.162 |
| Numeric GAM | 0.283 | 21.2% | 92.9% | −0.165 | 0.154 |
| Bayesian linear | 0.318 | 22.2% | 93.8% | −0.235 | 0.167 |
| Bayesian GAM | 0.336 | 23.0% | 92.9% | −0.283 | 0.175 |
| RBF SVR | 0.288 | 22.5% | 93.8% | −0.241 | 0.159 |
| RBF GP | 0.291 | 22.6% | 86.6% | −0.153 | 0.158 |

Lower errors/CRPS and higher log scores are preferable; coverage needs interval-width context. The GP has the strongest density score here but lower-than-nominal observed coverage. The numeric GAM leads point error and CRPS. **The Bayesian additive model does not improve the multilevel linear model in this test.** This argues against missing additive nonlinearities as a sufficient explanation; it does not establish that nonlinearities never matter. Hyperparameters and priors were not revised to chase this ranking.

Copenhagen and ORCID account for 89.6% of the Bayesian linear model's **net excess squared log error over the numeric GAM** on these folds, not 89.6% of its total error. The earlier approximately 97% statement concerns the preceding cohort and folds. Their held-out predictions remain too low in both Bayesian specifications; curvature alone makes these two errors larger. Prioritize matched exact-only and category ablations, full-time/disclosure-aware other-pay measurement, repeated grouped splits, and prior sensitivity before choosing a default model from this one ranking.

All **80 CV fits and eight full Bayesian fits pass the unchanged substantive sampler gates**: zero divergences or tree-depth hits; CV maximum R-hat 1.0429 and minimum bulk/tail ESS 120.4/254.0; full-fit maximum R-hat 1.0072 and minimum bulk/tail ESS 1018.2/982.6. Both input-covariance and fitted spline parameters are checked.

### Browser and numerical contract

The app exposes 17 fitted variants with individual mathematical vignettes, actual mean absolute percentage errors, proper distribution scores, metric tooltips, fractional focus inputs, and log/percent driver forest plots. Separate user-selectable percentile intervals default to 89%. Bayesian intervals use posterior conditional quantiles; GP intervals condition on fitted hyperparameters; comparator intervals use disclosed Gaussian/organization-bootstrap approximations. None identifies uncertainty about cohort representativeness.

Production integration verifies scalar spline evaluation, JSON null handling for absent curvature, and GAM grid support within accumulated seven-decimal serialization error. The latter tolerance is one millionth of a standardized input unit; it does not permit substantive extrapolation beyond the exported grid. The cached full-fit results are regenerated through the same fit script after serialization corrections.

`npm run build`, `npm run test:data` (20 Python unit tests and four data audits), `npm run test:statistics` (seven Node tests and the R numerical, calibration, missing-input, and extension checks), and `git diff --check` pass. All 36 distinct Playwright checks pass across the full suite and focused reruns. The final full run passed 35; its URL round-trip test had waited for an already-present URL parameter rather than the latest filter value. Waiting for that exact encoded value preserves the restoration assertion and passes twice. Desktop/mobile inspection also covers all 17 specification dialogs, driver forests, and uncertainty intervals for all 99 percentiles.

The [project summary](summary.md), [model specification and reproduction guide](benchmark/analysis/predictive_salary_models/README.md), and [operating-evidence methodology](benchmark/enrichment/organization_operating_metadata_methodology.md) describe the current architecture and assumptions.

---

## Historical correctness audit — 2026-09-04

The following findings, cohort sizes, and results describe their explicitly dated baseline and earlier resolutions, rather than the current 17-model artifact.

Review of the static application, data preparation and validation, archived analysis, and predictive R/Stan models. The findings and original check results below describe the pre-fix version; the five confirmed findings have now been addressed. Evidence and historical report/workbook deliverables are unchanged.

The project has substantial safeguards: source-native evidence, explicit compensation definitions, RP outcome exclusion, organization-grouped validation, paired predictor specifications, and model-artifact provenance and sampler checks. The model cohort reproduces exactly. Five actionable findings were identified, followed by scientific improvements. P1 means address before relying on the affected validation claim; P2 means a material correctness or maintenance issue with a narrower scope.

## Resolution and verification

1. Deterministic calibration now fits inner organization folds entirely inside the outer training set. Coverage and density scores use a Gaussian residual KDE with the same bandwidth rule as the browser. Perturbation tests verify that held-out outcomes cannot change their point predictions or interval endpoints for all five deterministic specifications.
2. Non-CEO records now share equal initial organization influence before selected multipliers and custom row adjustments. Both ordinary and robustness calculations preserve these multipliers. The EA label collapse was unrelated to the cancellation.
3. Gamma calculations check convergence and use a stable large-shape expansion; quantiles are inverted on a log axis. Identical-value samples are explicitly described as empirical because they cannot support a continuous fit. Numerical tests compare 50 CDF cases with R across shapes 0.01 through one billion, and verify quantile round trips and integrated densities.
4. Bayesian predictions use the analytic posterior mixture of lognormals. Deterministic predictions use the residual KDE. Density, intervals, quantiles, means, and reference percentiles now come from one distribution. Numerical integration verifies the 50%, 80%, and 95% regions to within 0.000002 probability units.
5. Validator expectations now match 366 acquisition records and 17 quantitative CEO postings, retaining exact assertions and adding the identities and verified status of all eight position-posting additions. Both commands are included in `npm run test:data`.

The full R pipeline regenerated all 40 Bayesian CV fits, four full Bayesian fits, deterministic results, and artifact provenance. Point-error metrics and Bayesian results reproduce unchanged; deterministic 90% coverage is now 92.1% for intercept, 91.2%/93.0% for linear without/with other pay, and 91.2%/92.1% for GAM without/with other pay. These remain empirical coverage estimates, not distribution-free guarantees.

`npm run build`, `npm run test:data` (17 Python unit tests plus four data audits), `npm run test:statistics` (three Node tests, R numerical checks, and five calibration-independence checks), and `git diff --check` pass. The browser suite plus focused reruns pass all 35 distinct checks: an old test requiring weights to cancel was replaced with checks for the corrected staff-weight behavior, and a new category-multiplier test was added. Model checks were rerun against the rebuilt artifact. Scientific improvements A–F were outside those focused correctness fixes. Joint missing-input modeling in B is now implemented and evaluated below; its measurement sensitivities and the other scientific recommendations remain follow-ups.

## Original confirmed findings

### 1. P1 — Deterministic interval validation indirectly uses held-out outcomes

**Locations:** `benchmark/analysis/predictive_salary_models/fit_salary_models.R:487–507` and `:510–560`.

`calibrate_simple_intervals()` excludes fold k's residuals, but its calibration residuals from every other fold were generated by models trained on fold k. Therefore, the interval endpoints for fold k depend on its outcomes. This affects the intercept, linear, and GAM coverage results. Their original point predictions remain held out; this finding does not invalidate their log-RMSE scores or the separately constructed Bayesian validation intervals.

**Reproduction:** Load the R definitions preceding the Stan compilation, run `evaluate_simple_model("intercept")`, add 1 to `z$log_mid` for fold 1 only, and rerun. Fold 1 point predictions change by exactly zero, but both 90% interval endpoints move by **−0.09615385 log units**, approximately a 9.2% reduction in dollars. A held-out outcome should not move its prediction interval. The direction and size of bias in the published coverage percentages have not been established by this perturbation.

**Remedy:** Within each outer training set, generate inner organization-grouped residuals for calibration, then evaluate the untouched outer fold. Recompute coverage for all five deterministic specifications. For production intervals, evaluate a principled split-conformal or CV+ construction rather than assuming that adding pooled OOF residual quantiles to a full-fit prediction provides a coverage guarantee. CV+ also uses held-out-model predictions at the new profile; it is not the currently implemented residual shift. See [Barber et al., Predictive Inference with the Jackknife+](https://arxiv.org/abs/1905.02928).

### 2. P2 — Non-CEO normalization cancels organization-level weighting controls

**Locations:** `app.js:1559–1569`, `:5830–5840`, and the enabled controls and explanation at `:4372–4413`.

For non-CEO positions, the code divides each automatic weight by the sum of automatic weights within its organization. Any positive multiplier shared by that organization's records cancels. Consequently, EA, work-model, organization-type, expense, and staff weighting generally cannot change the organization's total influence. For a single-record organization, every positive automatic weight becomes 1. Zero still excludes records, producing a discontinuity between tiny positive and zero weights.

**Reproduction:** Run the actual `weightedSelection()` function on the 20 default CFO base-pay rows, first with equal automatic weights and then with EA-adjacent weight 10 and functional-overlap weight 0.1. Both categories occur; the maximum change in final row weight is **zero**.

Equal organization influence is explicitly described in the UI, so this is a control-design conflict rather than an undocumented normalization algorithm. Offering an editable category multiplier suggests an influence it cannot have. The robustness implementation repeats the same behavior and therefore does not expose it.

**Remedy:** Assign equal within-organization shares first, then apply organization-level multipliers, while specifying how mixed-source or row-specific multipliers operate. Alternatively, preserve mandatory equal organization totals and disable or clearly limit controls that cancel. Add a behavioral check that a positive category multiplier changes the intended aggregate influence.

### 3. P2 — Gamma CDF and quantiles are inaccurate for concentrated samples

**Locations:** `app.js:1787–1818` and `:1834–1853`.

`gammaP()` stops after 199 iterations without checking convergence. The gamma moment fit allows shape parameters up to roughly one billion when selected values coincide. The series and continued-fraction branches then disagree severely around their switching point.

**Reproduction using the app's functions and R's `pgamma`/`qgamma`:**

| Equal-weight inputs | App CDF at mean | R CDF at mean |
| --- | ---: | ---: |
| 100000, 100000 | 0.002523 | 0.500004 |
| 99900, 100100 | 0.079260 | 0.500133 |
| 99000, 101000 | 0.478039 | 0.501330 |

For the identical pair, evaluating the app's CDF at its own returned median gives **0.969903**, not 0.5. This can affect narrow salary selections, repeated expense values, and concentrated ratio axes. It does not establish an error of this magnitude in the default full salary cohort.

**Remedy:** Use a numerical implementation with a stable large-shape treatment and explicit convergence checks. Handle genuinely degenerate distributions explicitly. Verify CDF/quantile round trips against R over the supported shape range, including concentrated samples.

### 4. P2 — Shaded predictive probabilities and the plotted density disagree

**Locations:** `app.js:3256–3270` and `:3353–3358`, with shading at `:3380–3393`.

Intervals come from unsmoothed sample quantiles, but the displayed curve is a Gaussian kernel density estimate on log salary. Smoothing adds dispersion, so the shaded area under that curve does not represent the stated probability. This is a display-distribution inconsistency, separate from the interval-validation leak above.

Analytically integrating the actual KDE between the browser's interval endpoints gives:

| Model | Claimed 80% region | Claimed 95% region |
| --- | ---: | ---: |
| Intercept | 75.26% | 91.37% |
| GAM with other pay | 74.24% | 92.59% |
| Linear with other pay | 76.56% | 91.62% |

These masses are profile-invariant for the deterministic residual-shift models. The calculation uses the actual exported residuals, browser bandwidth formula, dollar-scale quantile interpolation, and Gaussian CDF integration; it is not a visual estimate.

**Remedy:** Define one predictive distribution and use its CDF, quantiles, density, and expected value consistently. For Bayesian models, the exported parameters already permit an analytic mixture of lognormals, avoiding both KDE smoothing and the noise from one residual realization per posterior draw. For deterministic models, either validate a smoothed residual distribution and invert its CDF or label the curve explicitly as a visual approximation.

### 5. P2 — Two documented validation commands reject the current valid additions

**Locations:** `benchmark/scripts/test_validation_audits.py:32` and `scripts/validate_ea_roster_additions.py:300–310`.

Both commands fail on the current tree:

- `test_validation_audits.py` expects 358 acquisition records; the current manifest has **366 records and 366 unique source IDs**.
- `validate_ea_roster_additions.py` expects 15 quantitative job ads; the current app has **17**. The living-universe validator independently accepts 17 and reconciles the default 131 records across 128 organizations.

These failures are stale aggregate expectations, not evidence from these checks that the additional records are invalid. The source-level checks preceding these assertions complete successfully.

**Remedy:** Review the admitted additions, update the explicit versioned cohort expectations and affected documentation, and run both commands in the regular validation entry point. Preserve identity, source, and admission checks rather than replacing exact-count assertions with loose inequalities. Historical report counts should remain labeled as historical; the current-state counts in `benchmark/README.md` also lag behind the app.

## Statistical and scientific improvements

### A. Give disclosure-driven selection priority over added model complexity

The 114 exact-base training records have a median of approximately **$296,296**, while the 12 cash-only records have a median reported-cash amount of **$104,228**. Those measures differ, so this is not a like-for-like salary comparison, but the contrast highlights that measurement availability is strongly associated with the observed compensation level.

Schedule J reporting is conditional on reporting rules and compensation thresholds, including the $150,000 combined-compensation criterion; ordinary employees are also selectively listed in Form 990. This is not simple truncation at $150,000 of *base salary*. See the [IRS Schedule J filing requirements](https://www.irs.gov/charities-non-profits/exempt-organization-annual-reporting-requirements-filing-requirements-for-schedule-j-form-990) and [Form 990 instructions](https://www.irs.gov/instructions/i990).

The current cash-to-base measurement model is useful, but it learns its increment distribution from exact-base disclosures and transports it to a much lower-pay group. Exact-only validation cannot directly validate the latent base salaries in that group. Prioritize independently verified low-pay base records, describe the target as the reviewed disclosed-peer population, and run sensitivities to the cash-increment distribution and disclosure mechanism. Non-CEO percentiles need particularly prominent selection caveats: disclosure minima and top-earner reporting can make them poor estimates of the full occupation's salary distribution.

### B. Model missing predictors jointly and respect measurement definitions

**Implemented 2026-09-05:** the Bayesian models now learn a regularized joint
normal distribution for standardized log inputs within each training fold.
Held-out imputations condition jointly on observed inputs. Matched validation
against `b871665` improves filing log-RMSE in all four specifications; the default
with-other-pay model changes from 0.338 to 0.326. Ad scores worsen, and
source-specific input measurement and disclosure assumptions remain follow-ups.
The [model README](benchmark/analysis/predictive_salary_models/README.md#joint-missing-input-comparison)
and `missing_input_comparison.csv` report the paired results and limitations.
All 44 production fits pass sampler gates, with no divergences or tree-depth
hits and maximum R-hat 1.0194. The Stan toy fit, conditional-imputation and
leakage tests, `npm run build`, `npm run test:data` (18 unit tests and four
audits), numerical statistics tests, and six focused Model browser tests pass.
The original recommendation below describes the audited baseline.

At `ceo_salary_model.stan:114`, missing standardized predictors have independent standard-normal priors. `fit_salary_models.R:319–326` draws missing held-out predictors independently too. Observed log expenses and revenue have correlation **0.889** in the training cohort. Independent imputation fails to use this information and can create implausible expense/revenue combinations, especially because recruitment revenue is systematically missing.

Consider a regularized joint distribution for log expenses, revenue, staff, and other pay, or a parsimonious shared organization-scale model with source-aware deviations. Learn all imputation parameters inside the training folds. Compare predictions for complete and incomplete records and distinguish an advertisement's budget proxy from filing expenses. [Stan's missing-data guidance](https://mc-stan.org/docs/2_39/stan-users-guide/missing-data.html) describes the explicit probabilistic treatment of missing predictors; the proposed joint covariance structure is an audit recommendation, not a claim that Stan requires it.

### C. Keep evidence-stream targets explicit

The default histogram pools 114 incumbent salaries and 17 posting midpoints. Its mixture proportion is determined by acquisition counts, so finding more advertisements changes the apparent benchmark even with unchanged incumbent evidence. The predictive range model appropriately keeps a separate posting offset and residual scale and is already labeled experimental, but its interval likelihood still assumes that a latent relevant salary lies within each policy range.

Prefer incumbent and recruitment results side by side, or explicitly choose and label a fixed mixture estimand. For the ad model, compare midpoint, interval, and endpoint/policy-range measurement assumptions while retaining the same held-out exact-filing target. Do not interpret interval mass as evidence that a hire occurred inside the range. The existing ads-off default for the Model tab is a sensible safeguard.

### D. Quantify model-ranking uncertainty and separate cohort from model effects

The current predictive comparison uses one grouped ten-fold assignment. The GAM-with-other-pay log-RMSE is 0.2927 versus 0.3035 for the corresponding linear model, while adding ranges changes the Bayesian-with-other-pay result from 0.3378 to 0.3321. These are observed differences, not established stable advantages.

Repeat grouped splits with paired model comparisons, report uncertainty and fold sensitivity, and validate on a later or independently assembled cohort when possible. All preprocessing and interval calibration must remain inside the appropriate folds. For model-family comparisons, add a Bayesian exact-only fit: the deterministic models train on 114 exact records, whereas the filing Bayesian model also receives 12 cash proxies. The current comparison is valid as a comparison of complete prediction procedures, but does not isolate the effect of Bayesian versus deterministic model form. Published work cautions that uncertainty for CV error itself is nontrivial: [Bates, Hastie, and Tibshirani](https://arxiv.org/abs/2104.00673).

### E. Validate predictive distributions, tails, and profile support

Sampler diagnostics establish computational behavior, not substantive model adequacy. The Stan model generates `log_salary_rep`, but the fit pipeline does not report prior/posterior predictive checks using it. Add checks for upper-tail salaries, dispersion by organization size, cash/base increments, and evidence-stream behavior. Evaluate coverage at the **50%, 80%, and 95%** levels actually drawn in the browser; the current CV summary evaluates only 80% and 90%. Compare proper distributional scores and subgroup calibration, not only point error.

The deterministic models use one residual distribution at every profile. Their intervals therefore do not widen for extrapolation or locally weak support. The browser's min/max and rare-level checks also cannot identify an implausible combination of individually ordinary expenses, revenue, and staff. Add joint support diagnostics and evaluate a method that accounts for prediction-function uncertainty; treat unsupported profiles distinctly. See [Stan's prior and posterior predictive checks](https://mc-stan.org/docs/2_39/stan-users-guide/posterior-predictive-checks.html).

### F. Align covariate timing and avoid an inflation-versus-year false choice

Pay is CPI-adjusted, financial predictors remain source-year figures, and current work-model/fiscal-sponsor evidence can postdate the compensation year. RP's employee count also comes from a different filing year than its financial inputs. These limitations are documented, but documenting them does not remove the measurement mismatch.

Prefer same-period operating evidence; record and expose predictor years and dollar bases. Compare specifications excluding current-only status fields and the highest-other-pay predictor, whose disclosure is selective and whose availability must match the intended prediction use. CPI adjustment does not by itself eliminate *real* compensation trends, so a carefully regularized time sensitivity is not automatically double counting inflation. Given the concentration in 2024, do not assume such a trend is well identified.

## Checks and scope limits

Commands were run from `ceo-salary-benchmark/` unless noted:

| Check | Result |
| --- | --- |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | 17 passed |
| `Rscript tests/test_salary_model_numerics.R` | Passed |
| `npm test -- --grep 'model view starts\|model predictions\|Auto-weights\|robustness dashboard\|benchmark interactions' --workers=2` | Four matching Playwright tests passed in 56.3 seconds; local server launched by the test config |
| `python3 scripts/audit_form990_position_outputs.py` | Passed: 2,785 observations, 884 taxonomy groups, 136 filings, 14 primary positions |
| `python3 scripts/validate_living_peer_universe.py` | Passed: 122 cash rows, 114 base rows, 131 default combined records / 128 organizations |
| `python3 scripts/validate_ea_roster_additions.py` | Failed at stale 15-versus-17 job-ad expectation |
| `python3 benchmark/scripts/test_validation_audits.py` | Failed at stale 358-versus-366 manifest expectation |
| Model preparation with `--output /tmp/ceo-audit-training.csv --metadata /tmp/ceo-audit-metadata.json` | Passed; CSV byte-identical to tracked training data |
| Read-only invocation of `build_app_data.load_predictive_model_artifact(114, 12, 27, data)` | Passed current production/hash/cohort/diagnostic contract |
| Isolated app-function calculations and R calibration perturbation | Reproduced findings 1–4 |

The archived model reports 40 Bayesian CV fits, zero divergences or maximum-tree-depth hits, minimum E-BFMI 0.603, maximum R-hat 1.033, and minimum bulk/tail ESS about 258. These are checks of saved diagnostics, not a fresh sampling run.

Temporary reproduction scripts and outputs were kept in `/tmp/`. An initial optional Python numerical check could not import SciPy; the completed check used NumPy and the standard-library Gaussian CDF formula instead, with R independently checking gamma values. No dependency was installed.

No full Bayesian refit, original report/workbook regeneration, full browser suite, or exhaustive manual reread of every evidence artifact was performed. The independent position audit did examine its 136 source filings. The already documented historical Schedule J omissions and Center for AI Safety correction are not presented as new app defects. The strict historical source-complete release remains a separate known unresolved contract; this audit does not certify that release.

Recommended order: fix interval-validation independence; resolve non-CEO weighting semantics and numerical distribution consistency; restore the failing validators; then evaluate selection, imputation, calibration, and model stability before expanding the model further.
