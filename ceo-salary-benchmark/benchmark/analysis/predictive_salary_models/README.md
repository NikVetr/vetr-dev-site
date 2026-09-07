# Predictive CEO salary models

These models estimate the distribution of **positive annual CEO base salary in July 2026 USD**, conditional on an editable organization profile. They describe reviewed disclosures; they do not identify a causal effect or a recommended salary.

## Cohort and specifications

The versioned cohort contains **151 records in 147 organization-name groups**: 112 exact Schedule J base salaries, 12 reported-cash proxies, and 27 recruitment observations (25 ranges and two points). RP is a prediction profile only. Center for Public Integrity and Nuclear Threat Initiative are excluded pending reported-hours resolution; see the [reference-set audit](../../../ceo_reference_set_audit.md).

There are 21 browser specifications:

| Family | Specifications | Evidence |
| --- | --- | --- |
| Intercept | One | Exact-base filings |
| OLS | With/without highest non-CEO pay | Exact-base filings |
| GAM | Numeric/categorical × with/without highest non-CEO pay | Exact-base filings |
| RBF SVR | With/without highest non-CEO pay | Exact-base filings |
| RBF Gaussian process | With/without highest non-CEO pay | Exact-base filings |
| Bayesian multilevel | With/without other pay × base only/base and cash/base, cash and ads | Exact-base and cash-proxy filings; optional ads |
| Bayesian multilevel additive | Same four variants | Same evidence model |

Numeric inputs are standardized natural logs of expenses, revenue, employees, and optional highest disclosed non-CEO **40-hour-equivalent base pay**, with missingness indicators. Removing other pay removes both columns. Recruitment budgets proxy expenses and never duplicate revenue. Numeric preprocessing uses each training fold only.

Other pay is re-ranked after multiplying each eligible annual amount by 40 / combined filing-and-related weekly hours. The numerator likewise combines pay from both entities. Centralized payroll can pay for work across affiliates, so zero related-entity pay does not imply unrelated or unpaid related hours. The calculation scales 35-hour pay up and 50-hour pay down; it describes reported effort, not contracted FTE. Retain full-period functional roles with reliable positive hours, including part-time roles; exclude former/partial-year roles and unresolved CPI hours. Preserve the source amounts and identifiers. ORCID's $98,827 at 30 hours becomes $131,769.33 nominal, or $140,266.88 after CPI adjustment. The CEO outcome remains annual disclosed base salary.

`otherPayDisclosure` records whether an eligible employee with missing base disclosure has cash pay exceeding the known maximum base. In that case, the highest known base need not be the highest base among listed eligible employees. RP and ORCID have this limitation. It is separate from the selection of employees onto the filing at all.

Bayesian and categorical-GAM inputs are focus, organization type, title group, CEO hiring market, work arrangement, fiscal sponsorship, and EA relationship. Their vocabulary is salary-blind. Functional overlap is the EA reference; the collapsed EA-adjacent label has one signed increment. Peer tiers and RP similarity scores are not predictors.

Hiring market concerns eligible work locations, separately from operating footprint. Staff eligibility is a labeled proxy where executive-specific evidence is unavailable. RP is fully remote with conditional international general-role eligibility. Current policies may postdate compensation; RP employee count also comes from a different filing year than its financial inputs.

## Bayesian specification

For standardized numeric input z and missing indicators m:

```text
log(base_i) ~ Normal(mu_i, sigma_filing)
mu_i = alpha + sum_j beta_j z_ij + sum_j beta_missing_j m_ij
       + sum_j sum_k theta_jk B_jk(z_ij) + sum_c a_c[level_ic]
       + EA_increment * I(EA-adjacent) + ad_offset * I(ad)
```

The curvature term is present only in the additive model. Each numeric feature has two natural-cubic curvature bases at its observed training quantiles 0.10, 0.35, 0.65, and 0.90. Each raw basis is residualized against the intercept and linear input and scaled to unit training SD. This separates linear slopes from regularized curvature; tails are linear. With h_j(x) = ((x-k_j)_+³-(x-k_4)_+³)/(k_4-k_j), the raw columns are h_1-h_3 and h_2-h_3. The same basis is evaluated at latent missing values.

```text
alpha ~ Normal(12.5, 1)
beta ~ Normal(0, 0.3)
theta_jk = smooth_scale_j * smooth_raw_jk
smooth_scale_j ~ half-Normal(0, 0.15); smooth_raw_jk ~ Normal(0, 1)
a_c[l] = tau_c * (raw_c[l] - mean(raw_c))
raw_c ~ Normal(0, 1)
tau_focus/type/title/location ~ half-Normal(0, 0.25)
tau_work/fiscal_sponsor ~ half-Normal(0, 0.20)
EA_increment ~ Normal(0, 0.2)
ad_offset ~ Normal(0, 0.35)
sigma_filing ~ Normal(0.35, 0.15), constrained to [0.12, 1.5]
sigma_ad ~ Normal(0.45, 0.18), constrained to [0.12, 1.5]
```

Observed and missing numeric inputs jointly follow MVN(location, covariance), with location ~ Normal(0, 0.5), scales ~ Lognormal(0, 0.35), and correlation ~ LKJ(2). Missing values remain latent. Held-out imputation uses Gaussian conditioning on observed inputs and training-posterior covariance draws; **the held-out salary never enters imputation**.

Cash-only observations do not become base-pay labels. Let log(cash/base) be zero with probability p and otherwise Exponential(rate). The model learns p ~ Beta(2,2) and rate ~ Lognormal(log(10),0.6), constrained to [0.5,100], from paired base/cash disclosures. Marginalizing base salary gives a mixture of normal and exponentially modified normal log-cash densities. Transport to low-paid cash-only disclosures is an assumption.

Advertised points use the ad normal distribution. A range [L,U] contributes Phi((log U-mu)/sigma_ad)-Phi((log L-mu)/sigma_ad), evaluated with stable log-tail arithmetic. This is an experimental policy-range likelihood, not proof that an actual hire fell within the range. Profile predictions always use the filing source, without the ad offset.

Four chains are used per fit: initially 400 warmup/500 retained draws for each of 100 CV fits; 800/1,000 for each of ten full fits. A CV fit failing the substantive convergence gates receives one refinement to 800/1,000 and must then pass the unchanged gates. The artifact records these folds in `fitConfiguration.cvRefinements`; the current cohort requires Bayesian GAM with other pay, fold 4. Adapt delta is .995/.999 and maximum tree depth 13. All salary, covariance, and fitted curvature parameters enter convergence checks. The app rejects failed R-hat, ESS, E-BFMI, divergence, and tree-depth gates. It exports 512 posterior draws per model; full chain CSVs are cached separately.

## Frequentist GAM and numeric comparators

The intercept and OLS models use ordinary least squares on log pay. Constant/collinear design columns are explicitly removed and recorded. GAM uses mgcv REML cubic regression splines, k=4 per numeric input, plus active missingness indicators. Missing numeric values are set to the training log center.

The categorical GAM adds all seven categorical fields through `s(field, bs = "re")`: one indicator per category with a shared ridge penalty within each field. REML estimates numeric smoothness and each categorical penalty jointly. These are partially pooled random intercepts, equivalent to independent Gaussian effects with empirically estimated variances. Fixed salary-blind factor vocabularies and `drop.unused.levels = FALSE` retain unobserved levels with uncertainty. Displayed category contrasts are centered over the taxonomy; EA uses Functional overlap. Joint coefficient draws include mgcv’s smoothing-parameter covariance correction and preserve dependence with numeric smooths.

Both GAM variants use the same 112 exact-base outcomes, outer folds and nested residual calibration. With other pay, adding categories changes log RMSE from 0.2885 to 0.2823 and mean absolute percentage error from 21.94% to 21.51%. This single split suggests a modest improvement, not a stable ranking. The categorical GAM shares the Bayesian GAM’s predictor fields, but still differs in spline basis, penalties/priors, missing-input treatment and (for cash-inclusive Bayesian models) training evidence.

`fit_categorical_gam.R` adds these two fitted variants to the production registry using the shared preprocessing, scoring and nested calibration functions. `categorical_gam.R` holds fitting and export logic. Independent provenance hashes cover both scripts, training data and R/mgcv versions; full fits are cached under ignored `tmp/categorical-gam/`.

SVR uses e1071 epsilon regression with kernel exp(-gamma ||x-x'||²), no additional library scaling, C in {1,4,16}, gamma in {.1,.4}, and epsilon in {.05,.15}. Four organization-grouped inner folds choose the lowest log MSE, including fold-specific preprocessing. Residual calibration repeats tuning within each calibration-training set.

The exact Gaussian process has mean 12.5 and covariance
K(x,x') = 1 + A² exp(-||x-x'||²/(2 ell²)), with independent Normal(0,sigma²) observation noise. The constant covariance integrates an uncertain intercept with variance 1. Log ell ~ Normal(log 1,.7), and log A/log sigma ~ Normal(log .3,.6). Hyperparameters maximize the marginal log likelihood plus these log-parameter priors using three L-BFGS-B starts. Bounds are ell [.05,20], A [.02,2], sigma [.03,1.5]. Predictions use the analytic conditional normal distribution, **holding fitted hyperparameters fixed**; this is empirical Bayes, not full hyperparameter posterior sampling.

## Validation and scores

Seed 20260903 assigns normalized organization-name groups to ten outer folds. Repeated filing/ad records stay together. All procedures are evaluated on the **same 112 held-out exact-base outcomes**. Cash-inclusive Bayesian fits also train on cash proxies; this compares complete procedures, not an isolated Bayesian-versus-frequentist contrast.

Numeric transformations, imputation, REML, GP hyperparameters, and SVR tuning are learned within training folds. Intercept/linear/GAM/SVR predictive distributions use Gaussian KDEs of residuals from inner grouped fits entirely inside each outer training set, with bandwidth max(.04, 1.06 SD(r) n^(-.2)). No outer test outcome enters calibration. GP uses its conditional predictive normal.

- Log RMSE = sqrt(mean((log predicted-log observed)²)); lower is better.
- Mean absolute percentage error = mean(100 |exp(predicted log-observed log)-1|). This is computed per observation, not obtained by exponentiating RMSE. Median absolute percentage error is also retained.
- Geometric absolute-error factor = exp(mean(|log error|)); an interpretable multiplicative error summary, distinct from MAPE.
- Out-of-sample R² compares summed held-out squared log errors with the total squared deviation from the scoring cohort’s observed mean log salary.
- Coverage is the observed share inside nominal 80%/90% predictive intervals; interval width is reported alongside it.
- Log score is held-out log predictive density on **log salary**; larger is better. ELPD sums it; the table shows its mean. exp(mean score_A - mean score_B) is a geometric density ratio on these same outcomes, not a probability of correctness.
- CRPS scores the entire log-salary distribution; smaller is better. Normal-mixture CRPS is analytic, using up to 256 evenly spaced posterior components for Bayesian scoring.

Cash-proxy, advertised-point, and interval-mass scores are separate, incomparable evidence targets. `cross_validation_results.csv` and `cross_validation_predictions.csv` retain the reproducible results. One grouped split cannot establish stable algorithm rankings; repeated grouped splits and an independently collected cohort remain priorities.

### Matched measurement and repeated-validation study

`measurement_sensitivity.R` retains the production split and adds two organization-grouped splits with seeds 20260904 and 20260905. Each compares Bayesian linear with exact-plus-cash training, exact-only training, and exact-only numeric inputs (all centered categories collapsed; EA held at its reference). Numeric linear, GAM, SVR and GP run on the identical held-out exact outcomes in all three repetitions. Priors and tuning grids are unchanged.

Two additional first-split fits compare raw reported other pay and setting an incompletely identified maximum missing, retaining joint conditional imputation. The latter changes ORCID's predictor under a rule applied to every organization; it does not remove its salary outcome. It discards the known lower bound and is a conservative measurement sensitivity, not a complete selection or censoring model. Repetitions reuse outcomes and are not independent samples; compare paired scores and ranking stability, not a naive standard error over 336 allegedly independent cases.

`measurement_sensitivity/` contains the design, explicit fold assignments, predictions, scores, sampler diagnostics and interpretation. `--prepare` exports missing cluster requests with `SALARY_CLUSTER_PREPARE`; `--numeric-only` computes reusable numeric comparison caches. Caches include input, code and software signatures. The exact-only with-other-pay app model reuses the first-split study fits and scoring seeds; the other research sensitivities remain separate from the registry.

### Disclosure audit and exact-base-only app option

`audit_cash_disclosure.py` generates `cash_disclosure_audit.md` and companion source-linked CSVs after fitting and building. Cash-only records have median cash pay $104,228 versus $305,761 for exact-base records, with smaller expenses and staff counts. All 12 lack other-pay inputs. The audit separates the pay-component likelihood from selection into itemized base disclosure, verifies matched exact-only CV coverage, and describes a disclosure-aware extension.

The exact-base-only Bayesian linear options retain the original category vocabulary, priors, and joint missing-input model. They use 112 exact-base outcomes and exclude cash-only records and ads. Paired cash increments still estimate ancillary parameters but do not enter base predictions. With other pay, shared-split log RMSE is .281 versus .316 for the pooled cash-inclusive model; without it, .321 versus .336. The no-other-pay option has higher mean percentage error (.248 versus .234), so the improvement is metric-dependent. Exact-only validation conditions on base disclosure and cannot establish accuracy for unobserved cash-only base salaries.

The Model robustness tab evaluates every variant at the same user profile, showing P25/median/P75 points with selection and an expandable table. CV headers sort by raw numeric values; base-only, categorical-input, other-pay and ad-range flags occupy separate columns.

## Browser uncertainty and drivers

The predictive curve integrates peer variation and available parameter uncertainty. Its quantiles are distinct from uncertainty **about** each quantile. At probability p, Bayesian conditional quantile draws are exp(mu_draw + sigma_draw Phi^-1(p)); their central interval defaults to 89% and can be changed to 50–99%. The integrated-mixture quantile need not equal the median conditional-quantile draw.

GP quantile intervals propagate conditional latent-function variance, holding kernel and noise parameters fixed. Linear/intercept models simulate coefficients from their estimated Gaussian covariance. GAM uses mgcv's approximate coefficient covariance including smoothing-parameter correction. Those models combine coefficient draws with 256 organization resamples of OOF residuals. SVR resamples organization groups and refits 256 times with selected hyperparameters and preprocessing fixed, also resampling OOF residuals. These **approximate compatibility intervals** omit some selection/preprocessing uncertainty and are not calibrated coverage guarantees.

Numeric driver contrasts compare the profile with training-center inputs, preserving other settings; categorical contrasts use centered effects, with Functional overlap the EA reference. Additive curves subtract their value at the reference. Kernel interactions use exact Shapley allocations across numeric features; GP intervals use joint conditional covariance of the coalition predictions. Percent effects are 100(exp(log contrast)-1) and multiply rather than add.

Clicking a driver shows a forest plot in log or percent units, for the selected model or all variants. Omitted predictors are labeled “Not included.” Contrasts use each fitted model’s own training reference; they are not directly comparable raw coefficients. Category plots preserve joint posterior draws. A fractional focus profile contributes sum_l weight_l a_l on the log scale. Weights must be nonnegative and sum to 100%; this is a declared additive interpolation, not estimated RP team shares. “Average category effect” is the unweighted centered effect across levels.

## Reproduction and artifact contract

From `ceo-salary-benchmark/`:

```sh
python3 scripts/build_organization_operating_metadata.py
python3 scripts/summarize_work_followup.py
python3 benchmark/analysis/predictive_salary_models/prepare_model_data.py
Rscript benchmark/analysis/predictive_salary_models/fit_salary_models.R .
Rscript benchmark/analysis/predictive_salary_models/fit_categorical_gam.R .
Rscript benchmark/analysis/predictive_salary_models/measurement_sensitivity.R .
python3 benchmark/analysis/predictive_salary_models/summarize_measurement_study.py
npm run build
python3 benchmark/analysis/predictive_salary_models/audit_cash_disclosure.py
npm run test:statistics
npm run test:data
npm test
```

Preparation applies reviewed eligibility/geography overlays to app data and records input/script hashes. The build rejects stale hashes and any schema other than the supported production contract. Schema 3 contains all 21 named models, held-out record IDs, uncertainty arrays, category support counts, sampler diagnostics, and recorded R/package/CmdStan versions. `--quick` cannot replace a production artifact.

Large fits are stored under the ignored `tmp/predictive-model-cache/` with signatures covering Stan data, code, version, seed, and sampler settings. For the repository's worker cluster, `SALARY_CLUSTER_PREPARE=<requests-directory> Rscript .../prepare_cluster_fits.R .` exports exact requests for uncached fits. Run `cluster_fit_worker.R LOCAL_STAGE FIT_SIGNATURE PUBLISH_DIRECTORY` on a worker with CmdStan 2.38.0; it publishes integrity manifests plus four CSVs to the explicitly supplied, existing shared directory. Import verifies signatures and CSV checksums before postprocessing.

### Historical missing-input comparison

`missing_input_comparison.csv` documents the earlier 153-record/114-exact cohort against independent-input baseline commit b871665. It is **historical**, not a comparison of the current changed cohort. `compare_missing_input_models.py` deliberately requires identical prepared data, folds, IDs, and outcomes; it must not be run across changed cohorts. Its joint-input improvements and the earlier “97% Copenhagen plus ORCID” excess-error attribution do not automatically carry over to new folds or models.

## Limits and priorities

Disclosure and peer selection, correlated scale predictors, sparse categories, current-versus-historical policy, and cash/ad measurement assumptions constrain interpretation. The joint Gaussian input model assumes observed relationships transport to missing records and does not identify nonignorable disclosure. The browser requires positive complete numeric inputs; unsupported profiles need particular care. Model quantile intervals are conditional on this cohort and model, not uncertainty about representativeness.

Prioritize verified comparable additions, time-aligned operating evidence, repeated grouped validation, prior/measurement sensitivity, and joint support checks. Do not exclude correctly measured organizations because a particular model has large residuals.
