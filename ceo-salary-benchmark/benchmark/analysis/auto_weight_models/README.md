# CEO Auto-weight alternatives: independent predictive audit

## Release recommendation

Do **not** replace the frozen CEO Auto-weights with salary-supervised taxonomy
weights as a production default.  The supervised signal is real enough for an
experimental sensitivity preset, but not stable enough to support production
category multipliers: the sample is small and selected, important categories are
sparse or absent for the RP target, mixed models are almost always singular, and
the best conditional kernels under-cover their nominal 90% intervals.

A defensible production alternative is transparent and outcome-free: use a
**scale-similarity kernel** based on same-definition expenses and employees for
Form 990 rows, and a bounded version of the frozen pay-blind match score for
recruitment postings whose scale fields are not filing-comparable. Keep the richer
peer-taxonomy judgments as explicit user sensitivity controls. A salary-trained
kernel can be offered only as **Model-informed (experimental)**.

## Data and validation design

- Primary sample: 110 default-included incumbent Form 990 observations with
  positive July-2026-adjusted Schedule J base salary; 110 organizations.
- Sensitivities: 116 incumbent Part VII cash proxies; 125 combined default base
  observations (110 filings + 15 job postings, 122 organizations because three
  organizations appear in both streams).
- Target: log compensation. All outer splits were grouped by organization.
- Main Python run: 3 repeated 10-fold outer CV; all ridge penalties, categorical
  shrinkage, and kernel bandwidths selected only in inner 5-fold grouped CV.
- Independent R check: 20 repeated 10-fold grouped CV; linear, robust, GAM/REML,
  and `lmer` partial-pooling models.
- Regression uncertainty: training-only cross-fitted 90% residual intervals;
  paired 4,000-draw organization bootstrap for MSE differences.
- Distribution weighting: nested-CV CRPS on weighted empirical distributions,
  with a minimum effective sample size (ESS) of 20 during evaluation.

## OOS regression comparison (primary Schedule J sample)

| Model | log RMSE | OOS R2 | median absolute percentage error | 90% coverage |
|---|---:|---:|---:|---:|
| Training-fold mean | 0.379 | -0.018 | 25.4% | 90.0% |
| Frozen comparability score only (diagnostic) | 0.376 | 0.000 | 25.5% | 90.0% |
| log expenses | 0.350 | 0.133 | 23.1% | 90.0% |
| log expenses + log staff | 0.344 | 0.161 | 23.2% | 90.9% |
| scale + year | 0.339 | 0.189 | 22.1% | 90.0% |
| nonlinear scale ridge | 0.356 | 0.103 | 24.6% | 88.2% |
| regularized partial-pool core | **0.320** | **0.273** | **22.0%** | 90.0% |
| robust partial-pool core | 0.322 | 0.266 | 22.5% | 90.0% |
| full taxonomy (diagnostic only) | 0.318 | 0.282 | 21.3% | 90.9% |

The paired bootstrap 95% CI for the change in log-MSE versus the mean-only model
was `[-0.047, -0.006]` for scale and `[-0.071, -0.015]` for core partial pooling.
For the frozen score alone it was `[-0.012, +0.004]`: no demonstrated OOS gain.

The independent R run agreed. Scale LM had RMSE 0.342; GAM/REML 0.344; robust LM
0.343. Core `lmer` reached 0.324 and topic `lmer` 0.317, but the fits were singular
in 188/200 and 177/200 folds respectively. Ridge is the right computational form
for partial pooling here; the random effects are not separately well identified.

Cash-proxy results preserved the ordering (scale OOS R2 0.236; core 0.337; full
taxonomy 0.387), but cash is not exact base salary. Combined-stream results should
not drive defaults because advertised midpoints and realized filed compensation
are distinct estimands.

## OOS conditional-distribution comparison

| Weighted empirical distribution | log CRPS | median abs log error | 80% coverage | 90% coverage | median ESS |
|---|---:|---:|---:|---:|---:|
| Uniform | 0.215 | 0.242 | 80.0% | 90.0% | 99.0 |
| Expense kernel | 0.205 | 0.228 | 76.4% | 88.2% | 44.2 |
| Expense + staff kernel | 0.201 | 0.240 | 76.4% | 86.4% | 26.4 |
| Core mixed kernel | **0.189** | **0.216** | 79.1% | 86.4% | 20.0 |
| Full taxonomy kernel | 0.186 | 0.207 | 80.0% | 84.5% | 20.0 |

Thus the mixed kernel improves CRPS about 12% over uniform, but it spends the full
ESS budget and under-covers. The categorical mismatch coefficient always selected
the largest tested value (2.0), another boundary-instability warning. Full topic
adds little, and RP's special `RP reference organization` topic mismatches every
peer equally, so it does not help target weights.

## Production formula: stream-specific outcome-free similarity

The production Auto-weights use different, definition-appropriate rules within
the two evidence streams. Salary, advertised pay, and every other compensation
field are excluded from both calculations.

### Incumbent Form 990 rows

For selected peers, recompute robust log scales

```
sE = IQR(log(expenses)) / 1.349
sS = IQR(log(staff)) / 1.349
d2[i] = (log(expenses[i] / expensesRP) / sE)^2
      + (log(staff[i] / staffRP) / sS)^2
u[i] = exp(-0.5 * d2[i] / h^2)
ESS = sum(u)^2 / sum(u^2)
w[i] = n * u[i] / sum(u)
```

In the current 110-row sample, `sE = 0.8416` and `sS = 0.7470`. Choose the smallest
`h` by bisection such that `ESS >= 35` and the largest normalized weight is no more
than 6; cap-and-renormalize if required. At RP's same-source Form 990 anchors
($20,378,936 expenses, 43 employees), the uncapped ESS rule gives `h ~= 0.562`,
ESS 35, and a maximum normalized weight of 6.36. The UI should expose target ESS
(suggested range 25--60) rather than a hard-to-interpret raw bandwidth.

For missing staff, median-impute in log space and add one standardized missingness
penalty to `d2`; do not apply the current arbitrary 0.45 multiplier. Normalize
within each evidence stream and combine streams only with an explicit mixture
share. Do not silently treat job-posting midpoints as exchangeable with Form 990s.

If the retained filing sample is smaller than the target ESS, or does not contain
enough scale variation to estimate both robust scales, it is weighted uniformly
rather than assigning an arbitrary extreme bandwidth.

### Recruitment-posting rows

Posting budget and headcount fields are not Form 990 definitions, so recruitment
rows do not use the filing scale kernel. They use the frozen, pay-blind
`comparabilityScore` assigned during peer screening. For the selected,
plot-eligible postings, let

```
score_bar = mean(score[i])
r[i] = score[i] / score_bar
w[i] = clamp(k * r[i], 0.50, 1.50)
```

Choose the positive scalar `k` by bisection so that `mean(w) = 1`. This bounded
normalization leaves a score-100 posting above a score-70 posting without allowing
the judgment score to dominate the sample. Missing, non-finite, or nonpositive
scores are data errors and stop rendering rather than silently receiving a neutral
weight. The app records the posting rule's status, ESS, minimum, maximum, and
selected-score mean for its profile display.

The match-score rule is not a salary-prediction model. The frozen score had no
demonstrated out-of-sample salary-prediction advantage in the audit above; here it
is used only as a bounded expression of the already-frozen, compensation-blind
peer-comparability judgment. Advertised salary midpoints never train or enter the
weights.

### Combining streams and later adjustments

In recruitment-only mode, the posting rule is normalized to mean 1 among selected
eligible postings. In combined mode, the filing and posting rules are each first
calibrated within their own selected eligible stream. Consequently, absent another
adjustment, total stream influence remains proportional to the number of included
rows. The optional 50/50 stream balance is a separate, explicit post-calibration
mixture rule.

User multipliers, stream balancing, and omission of rows missing a selected chart
axis can change the final displayed effective sample size or exceed the
filing-kernel maximum; the chart and table report those final consequences.

With same-source anchors, the scale-only conditional P25/P50/P75 is approximately
$255k/$347k/$482k at ESS 35. This is an association-based sensitivity result, not a
board compensation recommendation.

## Experimental model-informed formula

If exposed, label this preset experimental and add to the scale distance:

```
d2 += 2 * I(title_group differs)
    + 2 * I(structure differs)
    + 2 * ((ea[i] - eaRP) / 0.65)^2
ea = {EA-core: 1.0, EA-adjacent: 0.65, functional-only: 0.0, unknown: 0.35}
```

Use `h = 1.0`, ESS at least 35, and maximum normalized weight 6. Current RP results
are P25/P50/P75 about $264k/$306k/$407k, ESS 37.7. A fixed-formula peer bootstrap
gave 95% intervals of $244k--$279k for P25, $272k--$368k for P50, and $336k--$492k
for P75; these omit taxonomy and model-selection uncertainty.

## Important blockers / leakage risks

- RP has no exact EA-core analogue in the primary sample: 62 observations are
  EA-adjacent and 48 functional-only. Structure is 104/110 independent nonprofit;
  several title/topic levels are singletons. There are 23 topic labels.
- 87/110 salaries are from compensation year 2024; recency cannot be estimated
  robustly. Keep recency as a visible sensitivity judgment (if used, a 6-year
  half-life is conservative), not a learned default.
- Schedule J availability is outcome/reporting-dependent: 116 default incumbents
  have cash but only 110 have base. Missing base is not random.
- Tier and comparability score are RP-specific and partly deterministic functions
  of scale/taxonomy. Combining them with component weights double-counts inputs;
  using them in generic CV is not a transferable validation of RP similarity.
- Peer selection and taxonomy were designed to be pay-blind, but CV still occurs
  inside the selected peer universe. There is no external test set and no direct
  validation under shift to RP.
- The manual expense/staff sensitivity controls use RP's forward-looking $7.5m
  core-budget and 57-person operating targets. Those are not measurement-
  comparable to peer Form 990 totals. Production Auto-weights therefore use the
  same-source RP Form 990 anchors ($20.379m expenses and 43 employees), while the
  manual controls remain explicitly labeled operating-target judgments.
- Salary-supervised feature weights describe observed pay associations, not the
  normative appropriateness of an organization as a peer. They must not silently
  replace board judgment.

## Reproducibility artifacts

- `benchmark/analysis/auto_weight_models/ceo_weight_models.py`
- `benchmark/analysis/auto_weight_models/ceo_weight_model_results.json`
- `benchmark/analysis/auto_weight_models/ceo_weight_model_results.summary.csv`
- `benchmark/analysis/auto_weight_models/ceo_weight_models.R`
- `benchmark/analysis/auto_weight_models/ceo_weight_models_r.csv`
- `benchmark/analysis/auto_weight_models/ceo_weight_models_r.repeats.csv`
