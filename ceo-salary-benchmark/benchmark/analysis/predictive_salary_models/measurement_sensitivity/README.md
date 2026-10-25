# Measurement and repeated-validation study

Every comparison scores the same **112 exact-base filings**. Three organization-grouped ten-fold repetitions test ranking stability; two additional sensitivities use the production split. All records from a held-out organization are excluded from its training fold. Priors and tuning grids are fixed before scoring.

## Repeated comparisons

Values are means across the three repetitions; the RMSE range describes split sensitivity, not a confidence interval. Lower errors and CRPS are preferable; higher mean log density is preferable. Coverage needs interval-width context.

| Procedure | Mean log RMSE | RMSE range | Mean absolute % error | 90% coverage | Mean log score | Log CRPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Bayesian linear · exact + cash · all categories | 0.311 | 0.310–0.313 | 22.9% | 93.2% | -0.215 | 0.168 |
| Bayesian linear · exact only · all categories | 0.284 | 0.281–0.287 | 22.4% | 92.3% | -0.150 | 0.157 |
| Bayesian linear · exact only · numeric inputs | 0.286 | 0.284–0.289 | 22.6% | 92.0% | -0.139 | 0.157 |
| Numeric linear | 0.291 | 0.291–0.292 | 22.8% | 94.3% | -0.234 | 0.163 |
| Numeric GAM | 0.285 | 0.278–0.292 | 21.8% | 93.2% | -0.202 | 0.158 |
| RBF SVR | 0.293 | 0.284–0.303 | 22.9% | 92.6% | -0.264 | 0.163 |
| RBF GP | 0.290 | 0.287–0.291 | 22.7% | 88.7% | -0.158 | 0.159 |

## Matched contrasts

- **Exact-only training minus exact-plus-cash training, holding categories fixed:** log-RMSE changes -0.029, -0.024, -0.028 across repetitions (negative favors the alternate).
- **Removing categories, holding exact-only training fixed:** log-RMSE changes +0.003, +0.002, -0.000 across repetitions (negative favors the alternate).

These isolate complete fitting procedures on matched outcomes. Removing all categories does not identify which particular category causes a change. Exact-only Bayesian numeric fits still differ from OLS through coefficient priors and joint missing-input inference.

## Measurement sensitivities on the production split

| Other-pay treatment | Log RMSE | Mean absolute % error | 90% coverage | Mean log score | Log CRPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reported other pay | 0.313 | 23.1% | 94.6% | -0.209 | 0.167 |
| 40-hour equivalent (standard) | 0.310 | 23.3% | 93.8% | -0.210 | 0.169 |
| Uncertain other-pay maxima missing | 0.303 | 22.8% | 92.9% | -0.191 | 0.165 |

The reported-pay comparison holds the current cohort, work classifications and folds fixed. It therefore isolates the changed other-pay construction more closely than comparing this run with an older app artifact.

The disclosure rule is applied to every organization: mark other base missing if a disclosed eligible employee without a base disclosure has cash pay exceeding the known maximum base. ORCID is the only otherwise observed training value affected; RP's prediction profile also has incomplete maximum-base identification. The sensitivity retains ORCID's outcome and uses joint missing-input inference. It discards its known lower bound; it is not a censored-predictor or disclosure-selection model.

### Influential organizations

Held-out predictions below use the production split and July 2026 USD. They are diagnostics, not criteria for deleting organizations.

| Organization | Observed base | Reported-pay predictor | 40h predictor | Uncertain maximum missing | Exact-only | Exact-only numeric |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Copenhagen Consensus Center | $463,229 | $136,322 | $130,927 | $135,144 | $200,878 | $179,479 |
| ORCID | $287,681 | $106,082 | $155,596 | $176,468 | $160,494 | $182,876 |

## Limits and reproduction

The same organizations recur in all three repetitions. Their errors and overlapping training sets are dependent, so 336 scored rows are not 336 independent observations. This is a stability check, not an independent validation cohort. Exact-only scoring assesses base-disclosing organizations; latent base salaries in cash-only organizations remain unvalidated, and disclosure selection may explain part of the difference. GP intervals condition on fitted hyperparameters; numeric residual distributions retain their documented calibration assumptions. A best score among these candidates does not identify a representative salary market or a recommended CEO salary.

Run from the CEO project folder:

```sh
Rscript benchmark/analysis/predictive_salary_models/measurement_sensitivity.R .
python3 benchmark/analysis/predictive_salary_models/summarize_measurement_study.py
```

`study_design.json` and `fold_assignments.csv` record the protocol. `metrics.csv`, `predictions.csv` and `sampler_diagnostics.csv` preserve the results. Counts in `metrics.csv` concern scored observations; the design records training-source choices. The study calls the production fitting/scoring functions and enforces the same substantive CV sampler gates. Source-native extraction and hours evidence are in [the FTE audit](../../../enrichment/highest_other_fte_audit.md).
