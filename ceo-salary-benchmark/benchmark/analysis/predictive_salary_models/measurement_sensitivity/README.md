# Measurement and repeated-validation study

Every comparison scores the same **112 exact-base filings**. Three organization-grouped ten-fold repetitions test ranking stability; two additional sensitivities use the production split. All records from a held-out organization are excluded from its training fold. Priors and tuning grids are fixed before scoring.

## Repeated comparisons

Values are means across the three repetitions; the RMSE range describes split sensitivity, not a confidence interval. Lower errors and CRPS are preferable; higher mean log density is preferable. Coverage needs interval-width context.

| Procedure | Mean log RMSE | RMSE range | Mean absolute % error | 90% coverage | Mean log score | Log CRPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Bayesian linear · exact + cash · all categories | 0.325 | 0.319–0.335 | 23.4% | 93.2% | -0.249 | 0.172 |
| Bayesian linear · exact only · all categories | 0.294 | 0.285–0.307 | 22.9% | 91.4% | -0.182 | 0.161 |
| Bayesian linear · exact only · numeric inputs | 0.295 | 0.291–0.303 | 23.1% | 92.6% | -0.171 | 0.161 |
| Numeric linear | 0.298 | 0.295–0.303 | 23.3% | 93.8% | -0.266 | 0.167 |
| Numeric GAM | 0.301 | 0.293–0.313 | 22.5% | 92.3% | -0.268 | 0.165 |
| RBF SVR | 0.293 | 0.290–0.294 | 23.1% | 92.9% | -0.280 | 0.163 |
| RBF GP | 0.292 | 0.290–0.295 | 22.7% | 88.1% | -0.164 | 0.160 |

## Matched contrasts

- **Exact-only training minus exact-plus-cash training, holding categories fixed:** log-RMSE changes -0.030, -0.028, -0.035 across repetitions (negative favors the alternate).
- **Removing categories, holding exact-only training fixed:** log-RMSE changes +0.002, -0.003, +0.007 across repetitions (negative favors the alternate).

These isolate complete fitting procedures on matched outcomes. Removing all categories does not identify which particular category causes a change. Exact-only Bayesian numeric fits still differ from OLS through coefficient priors and joint missing-input inference.

## Measurement sensitivities on the production split

| Other-pay treatment | Log RMSE | Mean absolute % error | 90% coverage | Mean log score | Log CRPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reported other pay | 0.327 | 22.9% | 92.0% | -0.251 | 0.171 |
| 40-hour equivalent (standard) | 0.319 | 23.0% | 94.6% | -0.229 | 0.170 |
| Uncertain other-pay maxima missing | 0.312 | 22.8% | 93.8% | -0.201 | 0.167 |

The reported-pay comparison holds the current cohort, work classifications and folds fixed. It therefore isolates the changed other-pay construction more closely than comparing this run with an older app artifact.

The disclosure rule is applied to every organization: mark other base missing if a disclosed eligible employee without a base disclosure has cash pay exceeding the known maximum base. ORCID is the only otherwise observed training value affected; RP's prediction profile also has incomplete maximum-base identification. The sensitivity retains ORCID's outcome and uses joint missing-input inference. It discards its known lower bound; it is not a censored-predictor or disclosure-selection model.

### Influential organizations

Held-out predictions below use the production split and July 2026 USD. They are diagnostics, not criteria for deleting organizations.

| Organization | Observed base | Reported-pay predictor | 40h predictor | Uncertain maximum missing | Exact-only | Exact-only numeric |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Copenhagen Consensus Center | $463,229 | $104,859 | $105,760 | $111,229 | $158,530 | $156,503 |
| ORCID | $287,681 | $102,505 | $148,346 | $175,935 | $151,611 | $178,594 |

## Limits and reproduction

The same organizations recur in all three repetitions. Their errors and overlapping training sets are dependent, so 336 scored rows are not 336 independent observations. This is a stability check, not an independent validation cohort. Exact-only scoring assesses base-disclosing organizations; latent base salaries in cash-only organizations remain unvalidated, and disclosure selection may explain part of the difference. GP intervals condition on fitted hyperparameters; numeric residual distributions retain their documented calibration assumptions. A best score among these candidates does not identify a representative salary market or a recommended CEO salary.

Run from the CEO project folder:

```sh
Rscript benchmark/analysis/predictive_salary_models/measurement_sensitivity.R .
python3 benchmark/analysis/predictive_salary_models/summarize_measurement_study.py
```

`study_design.json` and `fold_assignments.csv` record the protocol. `metrics.csv`, `predictions.csv` and `sampler_diagnostics.csv` preserve the results. Counts in `metrics.csv` concern scored observations; the design records training-source choices. The study calls the production fitting/scoring functions and enforces the same substantive CV sampler gates. Source-native extraction and hours evidence are in [the FTE audit](../../../enrichment/highest_other_fte_audit.md).
