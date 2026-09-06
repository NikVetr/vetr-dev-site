# Cash and base-disclosure sensitivity

**The exact-base scoring cohort selects a higher-paid, larger-organization group.** The current cash-to-base likelihood addresses compensation components but does not model that selection. The exact-base-only Bayesian model is a useful benchmark sensitivity, not a correction for representativeness.

| Observed cohort | Records / organizations | Median cash pay | Median expenses | Median employees | Other pay observed |
| --- | ---: | ---: | ---: | ---: | ---: |
| exact_base | 112 / 112 | $305,761 | $8,702,510 | 41 (111 observed) | 96 |
| cash_proxy | 12 / 11 | $104,228 | $2,339,138 | 10 (11 observed) | 0 |

Cash is compared with cash in this table; neither column substitutes cash for base. Pay is in July 2026 USD; organization expenses are the recorded financial-year amounts. These are record-level descriptive medians, not adjusted effects. The two Lead Exposure Elimination Project records share an organization group and always stay in the same CV fold.

Among 112 paired exact-base records, 63 have cash equal to base within $0.50. Among the 49 positive increments, the median log(cash/base) is 0.078 (an increase of 8.1%). These paired amounts identify the current zero-or-positive increment model inside the base-disclosing cohort. They do not establish its transport to cash-only organizations.

## Matched validation

| Bayesian linear specification | Other pay | Log RMSE | Mean error | 90% coverage | Log score |
| --- | --- | ---: | ---: | ---: | ---: |
| Exact base + cash | Yes | 0.316 | 22.5% | 92.0% | -0.239 |
| Exact base only | Yes | 0.281 | 22.2% | 91.1% | -0.154 |
| Exact base + cash | No | 0.336 | 23.4% | 92.9% | -0.366 |
| Exact base only | No | 0.321 | 24.8% | 92.0% | -0.292 |

All four procedures score the same 112 held-out exact-base records using the same organization-grouped folds, priors, and training-fold preprocessing. They exclude ads. The with-other-pay exact-only CV fits reuse the first repetition of the [three-split measurement study](measurement_sensitivity/README.md). No organization is deleted for a large residual. A validation advantage on base-disclosing organizations does not identify prediction accuracy for cash-only organizations, whose base pay is unobserved.

**All 12 cash-only records also lack highest-other base pay**, versus 16 of 112 exact-base records. Disclosure cohort and this missing-input pattern are therefore entangled. In the production split, the exact-base-only improvement is larger among held-out records missing other pay:

| Held-out exact-base stratum | N | Exact + cash log RMSE | Exact-only log RMSE |
| --- | ---: | ---: | ---: |
| Other pay observed | 96 | 0.272 | 0.262 |
| Other pay missing | 16 | 0.504 | 0.374 |

This post-hoc stratification is descriptive; the missing-input subgroup has only 16 observations. It does not isolate a defect in imputation or identify a causal disclosure effect.

## Why disclosure matters

Schedule J generally requires itemized compensation for current listed leaders when Form 990 Part VII columns D–F exceed $150,000 combined; other reporting triggers also apply. That threshold concerns nominal total reported compensation, not inflation-adjusted base pay. [IRS Schedule J instructions, Part II](https://www.irs.gov/instructions/i990sj). The instructions also separate base, bonuses, and other reportable compensation. [IRS Schedule J instructions](https://www.irs.gov/instructions/i990sj).

**Inference:** selection into an observed-base outcome can depend on compensation itself. Exact-only fitting and scoring therefore condition on disclosure; adding low-paid cash-only records changes the training population. A better-fitting cash ratio alone cannot remove this mismatch.

## Next measurement model

Retain latent log base Y and the nonnegative cash increment D, with observed log cash C = Y + D. A disclosure-aware model would jointly represent the base-observation indicator R using the actual filing rules, nominal reportable compensation and benefits, filing form, and any voluntary disclosure. The current pipeline lacks some of those rule inputs, so R must not be equated with a simple threshold on adjusted base salary.

A tractable interim sensitivity is a regularized cash-disclosure-group salary offset: Y ~ Normal(mu(X) + delta * I(cash-only), sigma). Compare explicit prior scales for delta, alongside the exact-only and pooled fits. Delta would mix population differences and measurement misspecification; it is not an identified correction and requires new validation. The existing app models keep their specified likelihoods unchanged.

For an incompletely disclosed highest-other base maximum, preserve the largest known value as a lower bound for a latent maximum rather than treating it as exact. A joint input model could integrate over that bound; selection of employees into the filing remains a separate issue. Seek actual base-pay evidence for cash-only organizations before judging any disclosure model's predictions for them.

## Reproduction

Run `python3 benchmark/analysis/predictive_salary_models/audit_cash_disclosure.py` after fitting and building. The companion CSVs retain the cohort counts and all cash-only records with raw pay, available hours and source links.

Training CSV SHA-256: `39336d9c78d4738d826f019e0fa58fca3f95aa72ed9e5f523a73c2e628e68c43`.
